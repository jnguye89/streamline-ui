import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { BotLevel, GameType } from '../core/api';
import { BOT_LEVEL_LABEL, GAME_TYPE_LABEL, PokerMode, TvAction } from '../poker.types';
import { PokerSession } from '../session/poker-session.service';

type ButtonId = 'play' | 'friends' | 'couch' | 'exit';

/**
 * Start screen. One press of A plays bots with the last-used settings.
 * Friends table and Couch play open the join screen (connected in Phase 3).
 */
@Component({
  selector: 'pk-start-overlay',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ck-scrim">
      <div class="ck-modal modal">
        <h1 class="ck-title">Poker</h1>
        <p class="ck-lead">No-limit hold'em with free chips. Play bots now, or bring friends in from their phones.</p>

        <div class="rows">
          <div class="ck-row" [class.focus]="row() === 0" (pointerenter)="row.set(0)">
            <span class="ck-row-label">Game</span>
            <div class="ck-seg">
              @for (g of games; track g) {
                <button type="button" [class.on]="session.settings().gameType === g" (click)="session.updateSettings({ gameType: g })">
                  {{ gameLabel[g] }}
                </button>
              }
            </div>
          </div>
          <div class="ck-row" [class.focus]="row() === 1" (pointerenter)="row.set(1)">
            <span class="ck-row-label">Bots</span>
            <div class="ck-seg">
              @for (l of levels; track l) {
                <button type="button" [class.on]="session.settings().botLevel === l" (click)="session.updateSettings({ botLevel: l })">
                  {{ levelLabel[l] }}
                </button>
              }
            </div>
          </div>
          <div class="ck-row" [class.focus]="row() === 2" (pointerenter)="row.set(2)">
            <span class="ck-row-label">Players</span>
            <div class="ck-seg">
              @for (p of counts; track p) {
                <button type="button" class="num" [class.on]="session.settings().players === p" (click)="session.updateSettings({ players: p })">
                  {{ p }}
                </button>
              }
            </div>
          </div>
        </div>

        <div class="actions">
          @for (b of buttons; track b.id; let i = $index) {
            <button
              type="button"
              class="ck-btn"
              [class.primary]="i === 0"
              [class.focus]="row() === 3 && action() === i"
              (pointerenter)="row.set(3); action.set(i)"
              (click)="run(b.id)"
            >
              {{ b.label }}
              @if (i === 0) {
                <span class="ck-glyph sm">A</span>
              }
            </button>
          }
        </div>
      </div>
    </div>
  `,
  styles: `
    .modal { width: 1200px; }
    .rows { display: flex; flex-direction: column; gap: 14px; margin-top: 40px; }
    .actions { margin-top: 40px; display: flex; justify-content: center; gap: 16px; }
    .actions .ck-btn { min-width: 240px; justify-content: center; gap: 18px; }
    .ck-seg button { font-size: 28px; }
    .ck-seg button.num { min-width: 76px; padding: 0 22px; }
  `,
})
export class StartOverlayComponent {
  protected readonly session = inject(PokerSession);
  readonly play = output<void>();
  readonly lobby = output<PokerMode>();
  readonly exit = output<void>();

  protected readonly row = signal(3);
  protected readonly action = signal(0);
  protected readonly games: readonly GameType[] = ['home', 'sitAndGo'];
  protected readonly levels: readonly BotLevel[] = ['easy', 'medium', 'hard'];
  protected readonly counts: readonly number[] = [2, 3, 4, 5, 6];
  protected readonly gameLabel = GAME_TYPE_LABEL;
  protected readonly levelLabel = BOT_LEVEL_LABEL;
  protected readonly buttons: ReadonlyArray<{ id: ButtonId; label: string }> = [
    { id: 'play', label: 'Play bots' },
    { id: 'friends', label: 'Friends table' },
    { id: 'couch', label: 'Couch play' },
    // skriin.com: leaves poker for the watch feed (same as B on this screen).
    { id: 'exit', label: 'Back to watch' },
  ];

  handle(a: TvAction): void {
    const r = this.row();
    const s = this.session.settings();
    const step = a === 'right' ? 1 : -1;
    switch (a) {
      case 'up':
        this.row.set(Math.max(0, r - 1));
        break;
      case 'down':
        this.row.set(Math.min(3, r + 1));
        break;
      case 'left':
      case 'right':
        if (r === 0) this.session.updateSettings({ gameType: a === 'right' ? 'sitAndGo' : 'home' });
        if (r === 1) {
          const i = this.levels.indexOf(s.botLevel);
          this.session.updateSettings({ botLevel: this.levels[Math.max(0, Math.min(2, i + step))]! });
        }
        if (r === 2) this.session.updateSettings({ players: Math.max(2, Math.min(6, s.players + step)) });
        if (r === 3) this.action.set(Math.max(0, Math.min(this.buttons.length - 1, this.action() + step)));
        break;
      case 'select':
        if (r === 3) this.run(this.buttons[this.action()]!.id);
        else this.row.set(r + 1);
        break;
      case 'back':
        this.exit.emit();
        break;
      default:
        break;
    }
  }

  protected run(id: ButtonId): void {
    if (id === 'play') this.play.emit();
    else if (id === 'exit') this.exit.emit();
    else this.lobby.emit(id);
  }
}
