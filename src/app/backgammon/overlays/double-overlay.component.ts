import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { opponent } from '@skriin/backgammon-core';
import { TvAction } from '../backgammon.types';
import { CubeComponent } from '../hud/cube.component';
import { GameStore } from '../game-store.service';

/**
 * The cube moment, in the spotlight (made to read well on a live stream).
 *  - Answering: "Double offered — take or drop?" with big Take / Drop (A confirms, Take first).
 *  - Offering: the other side is deciding.
 *  - Then a short "Computer takes." / "You drop." note.
 */
@Component({
  selector: 'bg-double-overlay',
  standalone: true,
  imports: [CubeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bg-scrim spot">
      <div class="panel">
        <div class="cube-wrap" [class.flip]="!note()">
          <bg-cube [value]="cubeValue()" [size]="200" />
        </div>
        <h1 class="bg-title">{{ title() }}</h1>
        <p class="bg-lead">{{ lead() }}</p>
        @if (answering()) {
          <div class="actions">
            @for (b of buttons; track b.id; let i = $index) {
              <button
                type="button"
                class="bg-btn big"
                [class.primary]="b.id === 'take'"
                [class.focus]="index() === i"
                (pointerenter)="index.set(i)"
                (click)="answer(b.id === 'take')"
              >
                {{ b.label }}
                @if (index() === i) {
                  <span class="bg-glyph sm">A</span>
                }
              </button>
            }
          </div>
        } @else if (!note()) {
          <p class="wait"><span class="dots"><i></i><i></i><i></i></span></p>
        }
      </div>
    </div>
  `,
  styles: `
    .spot { background: radial-gradient(ellipse at center, rgba(15, 13, 40, 0.86) 0%, rgba(0, 0, 0, 0.9) 70%); }
    .panel { display: flex; flex-direction: column; align-items: center; text-align: center; max-width: 1200px; }
    .cube-wrap { margin-bottom: 44px; }
    .cube-wrap.flip { animation: flip 620ms var(--ease) both; }
    @keyframes flip { 0% { transform: perspective(800px) rotateY(-90deg) scale(0.6); opacity: 0; } 100% { transform: perspective(800px) rotateY(0) scale(1); opacity: 1; } }
    /* :host keeps these above the page's .skriin-backgammon .bg-title/.bg-lead (skriin.com scoping). */
    :host .bg-title { font-size: 76px; }
    :host .bg-lead { margin-top: 22px; font-size: 32px; }
    .actions { display: flex; gap: 22px; margin-top: 48px; }
    .bg-btn.big { height: 92px; padding: 0 56px; font-size: 34px; min-width: 260px; justify-content: center; gap: 18px; }
    .wait { margin-top: 40px; color: var(--lav-soft); }
    .dots { display: inline-flex; gap: 10px; }
    .dots i { width: 14px; height: 14px; border-radius: 50%; background: currentColor; animation: blink 1.2s infinite ease-in-out; }
    .dots i:nth-child(2) { animation-delay: 0.15s; }
    .dots i:nth-child(3) { animation-delay: 0.3s; }
    @keyframes blink { 0%, 80%, 100% { opacity: 0.25; } 40% { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .cube-wrap.flip { animation: none; } }
  `,
})
export class DoubleOverlayComponent {
  protected readonly store = inject(GameStore);
  protected readonly index = signal(0);
  protected readonly buttons = [
    { id: 'take', label: 'Take' },
    { id: 'drop', label: 'Drop' },
  ] as const;

  private readonly offer = computed(() => {
    const o = this.store.view().offer;
    return o?.kind === 'double' ? o : null;
  });
  protected readonly note = this.store.cubeNote;

  protected readonly answering = computed(() => {
    const o = this.offer();
    const v = this.store.view();
    return !!o && !this.note() && !this.store.animating() && v.localSides.includes(opponent(o.by));
  });

  protected readonly cubeValue = computed(() => this.offer()?.to ?? this.store.view().cube.value);

  protected readonly title = computed(() => {
    const note = this.note();
    if (note) return note;
    const o = this.offer();
    if (!o) return '';
    const by = this.store.seats()[o.by];
    if (this.answering()) return 'Double offered — take or drop?';
    return by.name === 'You' ? `You doubled to ${o.to}.` : `${by.name} doubled to ${o.to}.`;
  });

  protected readonly lead = computed(() => {
    const v = this.store.view();
    const o = this.offer();
    const seats = this.store.seats();
    if (this.note()) {
      if (o) {
        // Dropped: the doubler wins the game at the value before the double.
        const w = seats[o.by];
        const pts = v.cube.value;
        return `${w.name} ${w.name === 'You' ? 'win' : 'wins'} ${pts} ${pts === 1 ? 'point' : 'points'}.`;
      }
      const owner = v.cube.owner === null ? null : seats[v.cube.owner];
      return owner ? `Cube at ${v.cube.value} · ${owner.name === 'You' ? 'you own it' : `${owner.name} owns it`}.` : '';
    }
    if (!o) return '';
    const answerer = seats[opponent(o.by)];
    if (this.answering()) {
      const now = v.cube.value;
      const who = v.config.mode === 'couch' ? `${answerer.name}: ` : '';
      return `${who}Take to play on for ${o.to} and own the cube. Drop to lose ${now} ${now === 1 ? 'point' : 'points'} now.`;
    }
    return `${answerer.name} ${answerer.name === 'You' ? 'are' : 'is'} deciding.`;
  });

  handle(a: TvAction): void {
    if (!this.answering()) {
      if (a === 'menu') this.store.openMenu();
      return;
    }
    switch (a) {
      case 'left':
      case 'up':
        this.index.set(0);
        break;
      case 'right':
      case 'down':
        this.index.set(1);
        break;
      case 'select':
        this.answer(this.index() === 0);
        break;
      case 'menu':
        this.store.openMenu();
        break;
      default:
        break;
    }
  }

  protected answer(take: boolean): void {
    if (!this.answering()) return;
    this.index.set(0);
    this.store.answerDouble(take);
  }
}
