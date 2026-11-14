import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ViewEncapsulation,
  computed,
  effect,
  inject,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { TvInput } from '../../shared/tv/tv-input-dedupe.service';
import { TvInputService } from '../../shared/tv/tv-input.service';
import { TvStageComponent } from '../../shared/tv/tv-stage.component';
import { TvAction } from '../../shared/tv/tv.types';
import { COPY } from '../core/copy';
import { Phase, Settings } from '../core/types';
import { HOST_GAME_CLIENT } from '../data/game-client';
import { TTS_PROVIDER } from '../media/tts-provider';
import { HostMenuComponent, MenuCommand } from './overlays/host-menu.component';
import { SettingsComponent } from './overlays/settings.component';
import { CardsComponent, RESULTS_STEPS } from './screens/cards.component';
import { FinalComponent } from './screens/final.component';
import { LobbyComponent } from './screens/lobby.component';
import { RoundComponent } from './screens/round.component';
import { FaceAnchors } from './ui/face-anchors';
import { FaceStripComponent } from './ui/face-strip.component';
import { Hint, HintsComponent } from './ui/hints.component';

type Screen = 'lobby' | 'round' | 'cards' | 'final';

const SCREEN: Record<Phase, Screen> = {
  lobby: 'lobby',
  prompt: 'round',
  answering: 'round',
  void: 'round',
  reveal: 'cards',
  voting: 'cards',
  results: 'cards',
  final: 'final',
};
const IN_ROUND: readonly Phase[] = ['prompt', 'answering', 'reveal', 'voting', 'results', 'void'];

/**
 * skriin ai TV · Bot or Not, TV side (the shared stage). Drop-in page:
 *   <skriin-bot-or-not-tv (exit)="goBack()" />
 * The host runs everything with A, B and the menu button. Talks to the room only through
 * HOST_GAME_CLIENT (mock in Phase 1, Colyseus in Phase 2).
 */
@Component({
  selector: 'skriin-bot-or-not-tv',
  standalone: true,
  imports: [
    TvStageComponent,
    LobbyComponent,
    RoundComponent,
    CardsComponent,
    FinalComponent,
    FaceStripComponent,
    HintsComponent,
    SettingsComponent,
    HostMenuComponent,
  ],
  providers: [TvInputService, TvInput, FaceAnchors],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  templateUrl: './bot-or-not-tv.component.html',
  styleUrl: './bot-or-not-tv.component.css',
  host: { class: 'skriin-bot-or-not' },
})
export class BotOrNotTvComponent {
  /** Host chose Exit. The skriin.com shell navigates back. */
  readonly exit = output<void>();

  protected readonly client = inject(HOST_GAME_CLIENT);
  private readonly tts = inject(TTS_PROVIDER);
  private readonly input = inject(TvInput);

  protected readonly s = this.client.state;
  protected readonly now = this.client.now;
  protected readonly copy = COPY;

  protected readonly menuOpen = signal(false);
  protected readonly settingsOpen = signal(false);
  /** Hide-a-card mode: focused card index. */
  protected readonly pickIndex = signal<number | null>(null);
  protected readonly toast = signal<string | null>(null);
  /** Results beat 0–4 (faces fly → flip → verdict → points). */
  protected readonly resultsStep = signal(0);

  private readonly lobby = viewChild(LobbyComponent);
  private readonly final = viewChild(FinalComponent);
  private readonly settings = viewChild(SettingsComponent);
  private readonly menu = viewChild(HostMenuComponent);

  private resultsKey = -1;
  private resultsStart = 0;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly screen = computed<Screen>(() => SCREEN[this.s().phase]);
  protected readonly inRound = computed(() => IN_ROUND.includes(this.s().phase));
  protected readonly showNames = computed(() => this.s().settings.showNames);
  protected readonly roundLabel = computed(() =>
    this.inRound() && this.s().round > 0 ? COPY.round(this.s().round, this.s().totalRounds) : '',
  );
  protected readonly deltas = computed<ReadonlyMap<string, number> | null>(() => {
    const r = this.s().results;
    if (this.s().phase !== 'results' || !r || this.resultsStep() < 4) return null;
    return new Map(r.points.map((p) => [p.playerId, p.points]));
  });

  protected readonly hints = computed<Hint[]>(() => {
    if (this.settingsOpen() || this.menuOpen()) return [{ glyph: 'A', label: 'Select' }, { glyph: 'B', label: 'Close' }];
    if (this.pickIndex() !== null) return [{ glyph: 'A', label: 'Hide / show' }, { glyph: 'B', label: 'Done' }];
    const s = this.s();
    switch (s.phase) {
      case 'lobby':
        return [{ glyph: 'menu', label: 'Menu' }, { glyph: 'B', label: 'Exit' }];
      case 'reveal':
        return [{ glyph: 'A', label: 'Show all' }, { glyph: 'menu', label: 'Menu' }];
      case 'results':
        return [{ glyph: 'A', label: s.lastRound ? 'Scores' : 'Next' }, { glyph: 'menu', label: 'Menu' }];
      case 'void':
        return [{ glyph: 'A', label: 'Next' }, { glyph: 'menu', label: 'Menu' }];
      case 'final':
        return [{ glyph: 'A', label: 'Select' }, { glyph: 'B', label: 'Lobby' }];
      default:
        return [{ glyph: 'menu', label: 'Menu' }];
    }
  });

  constructor() {
    const off = this.input.on((a) => this.route(a));
    const beat = setInterval(() => this.tickResults(), 100);
    inject(DestroyRef).onDestroy(() => {
      off();
      clearInterval(beat);
      clearTimeout(this.toastTimer);
      this.tts.stop();
    });

    // Leaving a phase closes whatever only made sense in it.
    effect(() => {
      const phase = this.s().phase;
      untracked(() => {
        if (this.pickIndex() !== null && phase !== 'reveal' && phase !== 'voting' && phase !== 'results') {
          this.pickIndex.set(null);
          this.client.resume();
        }
        if (this.settingsOpen() && phase !== 'lobby') this.settingsOpen.set(false);
      });
    });
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  /** Each press goes to whatever is on top: settings › menu › hide-a-card › screen. */
  private route(a: TvAction): void {
    if (this.settingsOpen()) return this.settings()?.handle(a);
    if (this.menuOpen()) return this.menu()?.handle(a);
    if (this.pickIndex() !== null) return this.handlePick(a);

    const phase = this.s().phase;
    if (a === 'menu') return this.openMenu();
    switch (phase) {
      case 'lobby':
        if (a === 'back') this.exit.emit();
        else this.lobby()?.handle(a);
        return;
      case 'final':
        this.final()?.handle(a);
        return;
      case 'reveal':
      case 'results':
      case 'void':
        if (a === 'select') this.client.skip();
        else if (a === 'back') this.openMenu();
        return;
      default:
        // prompt, answering, voting: nothing to press but the menu. B opens it too, so Back never ends a game.
        if (a === 'back') this.openMenu();
        return;
    }
  }

  private handlePick(a: TvAction): void {
    const cards = this.s().cards;
    const i = this.pickIndex() ?? 0;
    const cols = cards.length <= 4 ? cards.length : cards.length <= 6 ? 3 : cards.length <= 8 ? 4 : 5;
    switch (a) {
      case 'left':
        this.pickIndex.set(Math.max(0, i - 1));
        break;
      case 'right':
        this.pickIndex.set(Math.min(cards.length - 1, i + 1));
        break;
      case 'up':
        this.pickIndex.set(Math.max(0, i - cols));
        break;
      case 'down':
        this.pickIndex.set(Math.min(cards.length - 1, i + cols));
        break;
      case 'select': {
        const card = cards[i];
        if (card) {
          this.client.hideCard(card.id);
          this.say(card.hidden ? `Card ${card.letter} is back.` : `Card ${card.letter} hidden.`);
        }
        break;
      }
      case 'back':
      case 'menu':
        this.pickIndex.set(null);
        this.client.resume();
        break;
      default:
        break;
    }
  }

  // ── Menu, settings ─────────────────────────────────────────────────────────

  protected openMenu(): void {
    this.menuOpen.set(true);
    this.client.pause();
  }

  protected onMenu(cmd: MenuCommand): void {
    switch (cmd.kind) {
      case 'resume':
        this.closeMenu();
        break;
      case 'skip':
        this.closeMenu();
        this.client.skip();
        break;
      case 'hide':
        this.menuOpen.set(false); // stays paused while picking
        this.pickIndex.set(0);
        break;
      case 'remove': {
        const name = this.s().players.find((p) => p.id === cmd.playerId)?.name ?? 'Player';
        this.client.removePlayer(cmd.playerId);
        this.say(`${name} removed.`);
        break;
      }
      case 'settings':
        this.closeMenu();
        this.settingsOpen.set(true);
        break;
      case 'patch':
        this.client.updateSettings(cmd.patch);
        break;
      case 'end':
        this.closeMenu();
        this.client.toLobby();
        break;
      case 'exit':
        this.closeMenu();
        this.exit.emit();
        break;
    }
  }

  private closeMenu(): void {
    this.menuOpen.set(false);
    this.client.resume();
  }

  protected onSettings(patch: Partial<Settings>): void {
    this.client.updateSettings(patch);
  }

  // ── Results beats ──────────────────────────────────────────────────────────

  private tickResults(): void {
    const s = this.s();
    if (s.phase !== 'results') {
      if (this.resultsStep() !== 0) this.resultsStep.set(0);
      this.resultsKey = -1;
      return;
    }
    if (s.roundKey !== this.resultsKey) {
      this.resultsKey = s.roundKey;
      this.resultsStart = this.now();
    }
    const elapsed = this.now() - this.resultsStart;
    const step = RESULTS_STEPS.filter((ms) => elapsed >= ms).length;
    if (step !== this.resultsStep()) this.resultsStep.set(step);
  }

  private say(text: string): void {
    this.toast.set(text);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(null), 2400);
  }
}
