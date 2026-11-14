import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { opponent } from '@skriin/backgammon-core';
import { TvAction, matchLabel } from '../backgammon.types';
import { formatClock } from '../format';
import { GameStore } from '../game-store.service';

type ButtonId = 'next' | 'again' | 'verify' | 'setup' | 'exit';

/** End of a game ("Gammon!", "Backgammon!") or of the match ("You win the match."). */
@Component({
  selector: 'bg-result-overlay',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bg-scrim">
      <div class="bg-modal modal" [class.win]="mood() === 'win'">
        <div class="badge">{{ badge() }}</div>
        <h1 class="bg-title" [class.big]="isKind()">{{ title() }}</h1>
        <p class="bg-lead">{{ lead() }}</p>

        <div class="score">
          @for (seat of store.seats(); track seat.side) {
            <div class="side" [class.lead]="v().score[seat.side] > v().score[other(seat.side)]">
              <span class="who"><i class="sw" [class]="seat.side === 0 ? 'light' : 'dark'"></i>{{ seat.name }}</span>
              <span class="pts">{{ v().score[seat.side] }}</span>
            </div>
          }
          <div class="side meta">
            <span class="who">{{ matchText() }}</span>
            <span class="pts small">{{ clock() }}</span>
          </div>
        </div>

        <div class="actions">
          @for (b of buttons(); track b.id; let i = $index) {
            <button
              type="button"
              class="bg-btn"
              [class.primary]="i === 0"
              [class.focus]="index() === i"
              (pointerenter)="index.set(i)"
              (click)="activate(b.id)"
            >
              {{ b.label }}
              @if (index() === i) {
                <span class="bg-glyph sm">A</span>
              }
            </button>
          }
        </div>
      </div>
    </div>
  `,
  styles: `
    .modal { width: 960px; text-align: center; }
    .badge { display: inline-block; padding: 10px 18px; border-radius: 999px; font: 600 20px/1 var(--font-ui); background: rgba(255,255,255,0.08); color: var(--text-2); margin-bottom: 22px; }
    .win .badge { background: var(--indigo); color: #fff; }
    .bg-title.big { font-size: 112px; color: var(--lav-soft); }
    .score { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; margin-top: 36px; }
    .side { background: rgba(255,255,255,0.05); border-radius: 20px; padding: 22px 24px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
    .side.lead { box-shadow: inset 0 0 0 2px var(--lav); }
    .who { font: 500 22px/1 var(--font-ui); color: var(--text-2); display: inline-flex; align-items: center; gap: 10px; }
    .pts { font: 600 56px/1 var(--font-display); letter-spacing: -0.02em; }
    .pts.small { font: 500 40px/1 var(--font-mono); color: var(--text-2); }
    .sw { width: 22px; height: 22px; border-radius: 50%; }
    .sw.light { background: var(--ck-light-top); box-shadow: inset 0 -3px 0 var(--ck-light-edge); }
    .sw.dark { background: var(--ck-dark-top); box-shadow: inset 0 -3px 0 var(--ck-dark-edge), 0 0 0 1.5px rgba(255,255,255,0.4); }
    .actions { display: flex; justify-content: center; gap: 16px; margin-top: 40px; }
    .actions .bg-btn { gap: 14px; padding: 0 30px; white-space: nowrap; }
  `,
})
export class ResultOverlayComponent {
  protected readonly store = inject(GameStore);
  readonly exit = output<void>();
  protected readonly index = signal(0);

  protected readonly v = this.store.view;
  protected readonly matchOver = computed(() => this.v().phase === 'match-over');
  protected readonly result = computed(() => this.v().result);
  protected readonly winner = computed(() => {
    const r = this.result();
    return r ? this.store.seats()[r.winner] : null;
  });
  protected readonly mood = computed(() => {
    const r = this.result();
    const v = this.v();
    if (!r) return 'draw';
    if (v.localSides.length !== 1) return 'win';
    return v.localSides.includes(r.winner) ? 'win' : 'loss';
  });
  protected readonly isKind = computed(() => !this.matchOver() && !!this.result() && this.result()?.kind !== 'single');

  protected readonly badge = computed(() => {
    const v = this.v();
    return this.matchOver() ? `Match over · ${matchLabel(v.match.length)}` : `Game ${v.match.game} over`;
  });

  protected readonly title = computed(() => {
    const r = this.result();
    const w = this.winner();
    if (!r || !w) return '';
    if (this.matchOver()) return w.name === 'You' ? 'You win the match.' : `${w.name} wins the match.`;
    if (r.kind === 'gammon') return 'Gammon!';
    if (r.kind === 'backgammon') return 'Backgammon!';
    return w.name === 'You' ? 'You win.' : `${w.name} wins.`;
  });

  protected readonly lead = computed(() => {
    const r = this.result();
    const w = this.winner();
    const v = this.v();
    if (!r || !w) return '';
    const loser = this.store.seats()[opponent(r.winner)];
    const pts = `${r.points} ${r.points === 1 ? 'point' : 'points'}`;
    const wins = `${w.name} ${w.name === 'You' ? 'win' : 'wins'} ${pts}`;
    if (this.matchOver()) {
      return `${v.score[0]}–${v.score[1]}. Last game: ${wins.charAt(0).toLowerCase() + wins.slice(1)}.`;
    }
    if (r.byDrop) return `${loser.name} dropped the double. ${wins}.`;
    if (r.byResign) return `${loser.name} resigned. ${wins}.`;
    const cube = v.cube.value > 1 ? ` (cube at ${v.cube.value})` : '';
    return `${wins}${cube}.`;
  });

  protected readonly matchText = computed(() => {
    const len = this.v().match.length;
    return len > 0 ? `First to ${len}` : 'Points';
  });

  protected readonly clock = computed(() => formatClock(this.store.elapsed()));

  protected readonly buttons = computed<ReadonlyArray<{ id: ButtonId; label: string }>>(() =>
    this.matchOver()
      ? [
          { id: 'again', label: 'Play again' },
          { id: 'verify', label: 'Verify dice' },
          { id: 'setup', label: 'New setup' },
          { id: 'exit', label: 'Exit' },
        ]
      : [
          { id: 'next', label: this.v().match.length > 0 ? 'Next game' : 'Play again' },
          { id: 'exit', label: 'Exit' },
        ],
  );

  protected other(side: 0 | 1): 0 | 1 {
    return opponent(side);
  }

  handle(a: TvAction): void {
    const n = this.buttons().length;
    switch (a) {
      case 'left':
      case 'up':
        this.index.update((i) => (i - 1 + n) % n);
        break;
      case 'right':
      case 'down':
        this.index.update((i) => (i + 1) % n);
        break;
      case 'select':
        this.activate(this.buttons()[Math.min(this.index(), n - 1)].id);
        break;
      case 'back':
        this.exit.emit();
        break;
      case 'menu':
        this.store.openMenu();
        break;
      default:
        break;
    }
  }

  protected activate(id: ButtonId): void {
    this.store.playUi('select');
    this.index.set(0);
    switch (id) {
      case 'next':
        this.store.nextGame();
        break;
      case 'again':
        this.store.start();
        break;
      case 'verify':
        this.store.openVerify();
        break;
      case 'setup':
        this.store.toStartScreen();
        break;
      case 'exit':
        this.exit.emit();
        break;
    }
  }
}
