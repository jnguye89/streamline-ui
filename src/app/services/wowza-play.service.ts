import { Injectable } from "@angular/core";
import { sign } from "crypto";

declare const WowzaWebRTCPlay: any;

@Injectable({
    providedIn: 'root'
})
export class WowzaPlayService {
    private el?: HTMLVideoElement;
    private currentUrl?: string;
    private signalingUrl?: string; // <-- set me!
    private player?: any;       // your WowzaWebRTCPlay instance
    private active = false;
    constructor() { }

    init(player: HTMLVideoElement, wssUrl: string, applicationName: string, streamName: string) {
        if (!this.player) this.player = new WowzaWebRTCPlay();
        this.player.set({
            videoElementPlay: player,
            sdpURL: wssUrl,
            streamInfo: {
                applicationName,
                streamName
            }
        });
    }

    ensureInit(el: HTMLVideoElement, signalingUrl: string, applicationName: string, streamName: string) {
        console.log('ensure-init',signalingUrl);
        this.el = el;
        if (signalingUrl) this.signalingUrl = signalingUrl;
        this.init(el, signalingUrl, applicationName, streamName);
        // DO NOT auto-connect here — just store refs
    }

    /** New: directly play a specific WSS live stream URL */
    playFromUrl(wssUrl: string) {
        // your existing play logic can be reused here, e.g. set src/peer, etc.
        // If your current play() pulls from an internal store, just set that then call play().
        this.play();
    }

    play() {
        if (!this.player) this.player = new WowzaWebRTCPlay();
        this.player.play();
    }

    stop() {
        try {
            this.active = false;
            if (this.player && typeof this.player.stop === 'function') {
                this.player.stop();
            }
            this.player = undefined;
        } catch (e) {
            console.warn('[WowzaPlayService.stop] error while stopping:', e);
        } finally {
            // Always make the HTMLVideoElement safe for VOD next
            if (this.el) {
                try {
                    this.el.pause();
                    (this.el as any).srcObject = null; // WebRTC case
                    this.el.removeAttribute('src');     // File/HLS case
                    this.el.load();
                } catch { }
            }
        }
    }

    getAvailableStreams() {
        if (!this.player) this.player = new WowzaWebRTCPlay();
        this.player.getAvailableStreams().then((res: any) => console.log(res));
    }
}