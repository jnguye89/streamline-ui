import { Injectable } from '@angular/core';

export type SoundKind = 'select' | 'deal' | 'chip' | 'turn' | 'win' | 'fold' | 'error';

/** Small synthesized sounds (no audio files), same approach as checkers v2. Quiet: living-room TV. */
@Injectable()
export class SoundService {
  enabled = true;
  private ctx: AudioContext | null = null;

  play(kind: SoundKind): void {
    if (!this.enabled) return;
    const ctx = this.context();
    if (!ctx) return;
    const t = ctx.currentTime + 0.01;
    switch (kind) {
      case 'select':
        this.tone(ctx, 560, t, 0.05, 0.05, 'sine');
        break;
      case 'deal':
        this.click(ctx, t, 0.12, 2600);
        break;
      case 'chip':
        this.click(ctx, t, 0.16, 3400);
        this.click(ctx, t + 0.05, 0.1, 3800);
        break;
      case 'turn':
        [660, 880].forEach((f, i) => this.tone(ctx, f, t + i * 0.09, 0.14, 0.05, 'sine'));
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(ctx, f, t + i * 0.09, 0.18, 0.05, 'sine'));
        break;
      case 'fold':
        this.tone(ctx, 240, t, 0.08, 0.04, 'triangle');
        break;
      case 'error':
        this.tone(ctx, 150, t, 0.09, 0.06, 'triangle');
        break;
    }
  }

  private context(): AudioContext | null {
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  private tone(ctx: AudioContext, freq: number, t: number, dur: number, gain: number, type: OscillatorType): void {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Short filtered noise burst: a card landing or chips touching. */
  private click(ctx: AudioContext, t: number, gain: number, freq: number): void {
    const len = Math.floor(ctx.sampleRate * 0.025);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(bp).connect(g).connect(ctx.destination);
    src.start(t);
  }
}
