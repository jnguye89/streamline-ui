import { Injectable } from '@angular/core';

export type SoundKind = 'move' | 'discard' | 'claim' | 'turn' | 'bonus' | 'win' | 'draw' | 'error';

/** Small synthesized sounds (no audio files). Quiet by design: this plays on a living-room TV. */
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
      case 'move':
        this.tone(ctx, 620, t, 0.035, 0.025, 'sine');
        break;
      case 'discard':
        this.click(ctx, t, 0.22, 2300);
        this.tone(ctx, 340, t, 0.06, 0.05, 'triangle');
        break;
      case 'claim':
        this.click(ctx, t, 0.2, 1800);
        [440, 587].forEach((f, i) => this.tone(ctx, f, t + i * 0.07, 0.12, 0.06, 'sine'));
        break;
      case 'turn':
        this.tone(ctx, 660, t, 0.12, 0.04, 'sine');
        break;
      case 'bonus':
        [784, 988].forEach((f, i) => this.tone(ctx, f, t + i * 0.06, 0.1, 0.045, 'sine'));
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(ctx, f, t + i * 0.1, 0.22, 0.06, 'sine'));
        break;
      case 'draw':
        [392, 349].forEach((f, i) => this.tone(ctx, f, t + i * 0.14, 0.22, 0.05, 'sine'));
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

  private tone(
    ctx: AudioContext,
    freq: number,
    t: number,
    dur: number,
    gain: number,
    type: OscillatorType,
  ): void {
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

  /** Short filtered noise burst: a tile landing on the table. */
  private click(ctx: AudioContext, t: number, gain: number, freq: number): void {
    const len = Math.floor(ctx.sampleRate * 0.03);
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
