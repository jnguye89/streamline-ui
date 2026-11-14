import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TvAction } from '../../../shared/tv/tv.types';
import { COPY } from '../../core/copy';
import { PublicPlayer, PublicState, Standing } from '../../core/types';
import { AvatarComponent } from '../ui/avatar.component';

interface Row {
  readonly standing: Standing;
  readonly player: PublicPlayer;
}

/** Final leaderboard (the bot is on it too) + Play again (same room, same people, scores reset). */
@Component({
  selector: 'bon-final',
  standalone: true,
  imports: [AvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="head">
      <h1 class="title">{{ headline() }}</h1>
      <p class="sub">{{ copy.finalTitle }}</p>
      <div class="actions">
        <button type="button" class="bon-btn primary" [class.focus]="focus() === 0" (pointerenter)="focus.set(0)" (click)="activate(0)">
          {{ copy.playAgain }} <span class="bon-glyph sm">A</span>
        </button>
        <button type="button" class="bon-btn" [class.focus]="focus() === 1" (pointerenter)="focus.set(1)" (click)="activate(1)">
          {{ copy.backToLobby }}
        </button>
      </div>
    </section>

    <ol class="board" [class.two]="rows().length > 6" [style.grid-template-rows]="rows().length > 6 ? 'repeat(' + half() + ', auto)' : null">
      @for (r of rows(); track r.player.id) {
        <li class="row" [class.top]="r.standing.place === 1" [class.bot]="r.player.kind === 'bot'">
          <span class="place">{{ r.standing.place }}</span>
          <bon-avatar [name]="r.player.name" [kind]="r.player.kind" [hue]="r.player.hue" [size]="60" />
          <span class="name">{{ label(r.player) }}</span>
          <span class="score">{{ r.standing.score }}</span>
        </li>
      }
    </ol>
  `,
  styles: `
    :host { position: absolute; left: 0; right: 0; top: 0; height: 880px; display: block; }
    .head { position: absolute; left: 24px; top: 40px; width: 720px; }
    .title { margin: 0; font: 600 96px/1 var(--font-display); letter-spacing: -0.035em; text-wrap: balance; }
    .sub { margin: 22px 0 0; font: 500 36px/1.2 var(--font-ui); color: var(--text-2); }
    .actions { display: flex; flex-direction: column; align-items: flex-start; gap: 18px; margin-top: 60px; }
    .actions .bon-btn { min-width: 340px; justify-content: space-between; gap: 18px; }
    .board { position: absolute; left: 820px; right: 24px; top: 40px; margin: 0; padding: 0; list-style: none; display: grid; gap: 12px; }
    .board.two { grid-template-columns: 1fr 1fr; grid-auto-flow: column; column-gap: 20px; }
    .row { display: flex; align-items: center; gap: 22px; height: 100px; padding: 0 30px 0 22px; border-radius: 24px; background: var(--surface); border: 1px solid var(--line); }
    .row.top { background: var(--indigo); border-color: transparent; }
    .place { width: 44px; font: 500 36px/1 var(--font-mono); color: var(--text-2); text-align: center; }
    .row.top .place { color: #fff; }
    .name { flex: 1; min-width: 0; font: 600 36px/1.1 var(--font-ui); letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .row.bot .name { color: var(--lav-soft); }
    .row.top.bot .name { color: #fff; }
    .score { font: 500 40px/1 var(--font-mono); }
  `,
})
export class FinalComponent {
  readonly state = input.required<PublicState>();
  readonly showNames = input(true);
  readonly playAgain = output<void>();
  readonly lobby = output<void>();

  protected readonly copy = COPY;
  protected readonly focus = signal(0);

  protected readonly rows = computed<Row[]>(() => {
    const players = new Map(this.state().players.map((p) => [p.id, p]));
    return this.state()
      .standings.map((standing) => ({ standing, player: players.get(standing.playerId) }))
      .filter((r): r is Row => !!r.player);
  });

  protected readonly half = computed(() => Math.ceil(this.rows().length / 2));

  protected readonly headline = computed(() => {
    const winners = this.rows().filter((r) => r.standing.place === 1);
    if (winners.some((w) => w.player.kind === 'bot')) return COPY.botWon;
    if (!this.showNames()) return winners.length > 1 ? 'A tie at the top.' : 'We have a winner.';
    return COPY.wins(winners.map((w) => w.player.name));
  });

  protected label(p: PublicPlayer): string {
    if (p.kind === 'bot') return p.name === 'Bot' ? 'the bot' : p.name;
    return this.showNames() ? p.name : '';
  }

  handle(a: TvAction): void {
    switch (a) {
      case 'up':
      case 'left':
        this.focus.set(0);
        break;
      case 'down':
      case 'right':
        this.focus.set(1);
        break;
      case 'select':
        this.activate(this.focus());
        break;
      case 'back':
        this.lobby.emit();
        break;
      default:
        break;
    }
  }

  protected activate(i: number): void {
    this.focus.set(i);
    if (i === 0) this.playAgain.emit();
    else this.lobby.emit();
  }
}
