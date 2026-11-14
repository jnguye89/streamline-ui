import { Injectable } from '@angular/core';

export type SoundKind = 'select' | 'move' | 'hit' | 'bearoff' | 'dice' | 'double' | 'win' | 'lose' | 'error';

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
      case 'select':
        this.tone(ctx, 560, t, 0.05, 0.05, 'sine');
        break;
      case 'move':
        this.click(ctx, t, 0.16, 1700);
        this.tone(ctx, 300, t, 0.07, 0.06, 'triangle');
        break;
      case 'hit':
        this.click(ctx, t, 0.22, 1500);
        this.tone(ctx, 220, t, 0.09, 0.09, 'triangle');
        this.click(ctx, t + 0.08, 0.16, 1300);
        break;
      case 'bearoff':
        this.click(ctx, t, 0.14, 2300);
        this.tone(ctx, 660, t + 0.02, 0.08, 0.05, 'sine');
        break;
      case 'dice':
        for (let i = 0; i < 5; i++) this.click(ctx, t + i * 0.07 + Math.random() * 0.02, 0.12, 2600 - i * 120);
        break;
      case 'double':
        [392, 523, 659].forEach((f, i) => this.tone(ctx, f, t + i * 0.09, 0.16, 0.07, 'triangle'));
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(ctx, f, t + i * 0.1, 0.2, 0.06, 'sine'));
        break;
      case 'lose':
        [392, 330, 262].forEach((f, i) => this.tone(ctx, f, t + i * 0.12, 0.22, 0.06, 'sine'));
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

  /** Short filtered noise burst: a checker landing, or a die hitting the board. */
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
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(bp).connect(g).connect(ctx.destination);
    src.start(t);
  }
}
