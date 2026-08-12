The final Agora publication consists of at most two tracks:

```text
Primary video ─┐
               ├─ Video compositor ── Final video track ── Agora video track
Overlay video ─┘

Game audio ────┐
               ├─ Web Audio mixer ── Limiter ── Final audio track ── Agora audio track
Microphone ────┘
```

## Video flow

1. Device selection

`StreamComponent` receives changes from the primary and overlay selectors and stores the selected device IDs through `MediaInputService`.

- Primary: [stream.component.ts](/home/bryan/projects/streamline-ui/src/app/components/stream/stream.component.ts:169)
- Overlay: [stream.component.ts](/home/bryan/projects/streamline-ui/src/app/components/stream/stream.component.ts:194)

2. Browser capture

The selected devices are opened with `getUserMedia()` through [media-capture.ts](/home/bryan/projects/streamline-ui/src/app/services/media-capture.ts).

For each video device, capture attempts proceed in this order:

- 1920×1080 at 60, 50, 30, 25, and 24 Hz
- 1280×720 at 60 and 50 Hz
- Best available resolution bounded to 1920×1080 and 60 Hz, with no minimum

The primary and overlay use the same negotiation ladder. Only the primary is evaluated against the preferred 1080p60 target for status reporting.

3. Video composition

`MediaInputService.startPreview()` captures both video sources and passes them to `createVideoCompositor()`:

- Primary video fills the canvas.
- Overlay video is drawn over the primary video.
- The canvas produces one `MediaStreamTrack` via `captureStream()`.
- If canvas composition is unavailable, the raw primary video track is used.

This happens in [media-input.service.ts](/home/bryan/projects/streamline-ui/src/app/services/media-input.service.ts:1011).

The preview shown in the component uses only this final video track and is muted locally.

4. Agora conversion and publication

When Go Live is selected, `StreamComponent.resumeWebcam()` passes the combined preview stream to:

[rtc-stream.service.ts](/home/bryan/projects/streamline-ui/src/app/services/agora/rtc-stream.service.ts:71)

`RtcStreamService`:

- Takes the final video `MediaStreamTrack`.
- Reads its negotiated width, height, and frame rate.
- Wraps it using `AgoraRTC.createCustomVideoTrack()`.
- Publishes that custom track.

5. Live video changes

For a primary-source change:

- The new device is captured.
- The compositor’s primary input is updated.
- `replacePublishedVideo()` synchronizes the resulting video track with Agora.

When canvas composition is active, its output track normally remains the same while its visual input changes. In that case, Agora does not need to republish anything—the already-published canvas track simply begins carrying the new image.

When composition is unavailable and the raw camera track changes, Agora unpublishes the previous custom video track and publishes the replacement.

For an overlay change, the compositor keeps the same output track and simply begins drawing the new overlay. No Agora replacement is necessary.

## Audio flow

1. Device selection and capture

Game audio and microphone selections are independent:

- Game audio: [stream.component.ts](/home/bryan/projects/streamline-ui/src/app/components/stream/stream.component.ts:206)
- Microphone: [stream.component.ts](/home/bryan/projects/streamline-ui/src/app/components/stream/stream.component.ts:219)

Each selected device is acquired separately through `getUserMedia()`.

Game audio explicitly disables:

- Echo cancellation
- Noise suppression
- Automatic gain control

Microphone capture leaves the browser’s normal audio processing available.

2. Web Audio mixing

The two captured streams enter a shared Web Audio graph:

```text
Game source ── Level gain ── Analyser ── Mute gain ──┐
                                                     ├─ Limiter ── Output analyser ── MediaStreamDestination
Mic source ─── Level gain ── Analyser ── Mute gain ──┘
```

Each source has a separate level and mute stage:

- The level gain applies the source's volume slider.
- The analyser measures the post-level signal that would enter the mix.
- The mute gain is `0` when muted and `1` when unmuted.
- The analyser remains active while muted because mute is applied after it.

The source channels converge on a shared `DynamicsCompressorNode` configured as a protective limiter with a −1 dB threshold, 20:1 ratio, hard knee, 3 ms attack, and 100 ms release. A final analyser follows the limiter, so it measures the signal that is delivered to the destination. The destination produces one mixed audio `MediaStreamTrack`; the raw game and microphone tracks are never published separately.

The graph is assembled by `connectAudioMixer()` in [audio-mixer.service.ts](/home/bryan/projects/streamline-ui/src/app/services/audio-mixer.service.ts).

3. Source metering

Each analyser samples its post-level signal and reports an RMS-based dBFS estimate. This is not a standards-compliant LUFS measurement: it does not apply K-weighting, gating, or integrated loudness windows.

The meter uses a −60 to 0 dB display range and these bands:

| Band | Level | Meaning |
| --- | ---: | --- |
| Green | ≤ −12 dB | Normal operating range |
| Yellow | > −12 to −3 dB | Loud; approaching the ceiling |
| Red | > −3 dB | Excessively loud |

A vertical marker at −1 dB indicates the recommended ceiling. A clip indicator to the right of the meter activates when the measured level reaches 0 dB.

Moving a volume slider changes the measured level naturally because its gain node precedes the analyser. Muting changes the meter's styling but does not suppress its activity, making it possible to verify that a muted source is still receiving audio.

The final output analyser uses the same dBFS scale and color bands. Its compact vertical meter appears inside the Go Live/Stop button, replacing the redundant recording dot while leaving the toolbar's Offline/Live label as the authoritative broadcast-state indicator. Because this meter is downstream of both mute stages and the limiter, it represents the actual mixed output sent to Agora.

The limiter is a peak-protection stage rather than loudness normalization. It attenuates signals that cross the ceiling but does not boost quiet material or target an integrated LUFS value.

4. Agora conversion and publication

At initial publication, `RtcStreamService` takes the mixer destination track and wraps it with:

```typescript
AgoraRTC.createCustomAudioTrack({
  mediaStreamTrack: audioTrack,
});
```

Agora therefore receives one mixed audio track alongside the composed video track.

5. Live audio changes

When either audio selector changes:

- New browser audio sources are captured.
- Old Web Audio source nodes are disconnected.
- New source nodes and gain nodes are connected to the mixer destination.
- The preview stream is refreshed.
- `syncPublishedAudio()` synchronizes the final mixer track with Agora.

It supports:

- Adding audio to an initially video-only publication
- Replacing the published mixer track
- Removing the published audio track
- Leaving the video publication undisturbed

When both audio devices are disabled, the combined preview omits audio and Agora unpublishes its audio track. When selected sources are merely muted, the mixer track remains published with zero output so unmuting is immediate.
