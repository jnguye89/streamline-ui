import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ViewEncapsulation,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { HandSummary, LegalActions, PlayerView } from './core/api';
import { chips } from './core/cards';
import { CouchPreviewComponent } from './couch/couch-preview.component';
import { ChoiceComponent } from './overlays/choice.component';
import { FinishedComponent } from './overlays/finished.component';
import { HandLogComponent } from './overlays/hand-log.component';
import { LobbyComponent } from './overlays/lobby.component';
import { MenuComponent, MenuItemId } from './overlays/menu.component';
import { StartOverlayComponent } from './overlays/start-overlay.component';
import { BOT_LEVEL_LABEL, PokerMode, ScreenFlags, TvAction } from './poker.types';
import { PreviewState, backdropView, buildPreviewStates } from './preview/preview-states';
import { ActionBarState, ActionButtonId, BarInput, buttonIds, initialState, reduceBar, reducePre } from './session/action-bar.logic';
import { PokerSession } from './session/poker-session.service';
import { SoundService } from './sound.service';
import { TableScreenComponent } from './table/table-screen.component';
import { TvInputService } from './tv-input.service';

const STAGE_W = 1920;
const STAGE_H = 1080;
const BAR_INPUTS: ReadonlySet<TvAction> = new Set(['left', 'right', 'up', 'down', 'lt', 'rt', 'select', 'back']);
const BOT_LEVELS = ['easy', 'medium', 'hard'] as const;

type Screen = 'start' | 'lobby' | 'table';

/**
 * skriin ai TV · Poker (no-limit hold'em, free chips).
 * Drop-in standalone page: <skriin-poker [live]="isLive()" (exit)="goBack()" />
 * Draws a fixed 1920×1080 stage and scales it to the screen, like checkers v2.
 */
@Component({
  selector: 'skriin-poker',
  standalone: true,
  imports: [
    TableScreenComponent,
    CouchPreviewComponent,
    StartOverlayComponent,
    LobbyComponent,
    MenuComponent,
    HandLogComponent,
    ChoiceComponent,
    FinishedComponent,
  ],
  providers: [PokerSession, TvInputService, SoundService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  templateUrl: './poker.component.html',
  styleUrl: './poker.component.css',
  host: {
    class: 'skriin-poker',
    '(window:resize)': 'fit()',
  },
})
export class PokerComponent {
  /** The TV is live (from skriin.com's live service). Streamer mode reacts at once, mid-hand too. */
  readonly live = input(false);
  /** Review builds only: P cycles the preview states. */
  readonly previewEnabled = input(false);
  /** Player chose to leave poker. Host app navigates back. */
  readonly exit = output<void>();

  protected readonly session = inject(PokerSession);
  private readonly input = inject(TvInputService);

  protected readonly scale = signal(1);
  protected readonly screen = signal<Screen>('start');
  protected readonly lobbyMode = signal<PokerMode>('friends');
  protected readonly menuOpen = signal(false);
  protected readonly logHands = signal<readonly HandSummary[] | null>(null);
  protected readonly cardsHidden = signal(false);
  protected readonly liveToggle = signal(false);
  protected readonly topUpDismissedHand = signal(-1);
  protected readonly toast = signal<string | null>(null);
  protected readonly now = signal(Date.now());

  private readonly barStore = signal<{ key: string; state: ActionBarState } | null>(null);
  private readonly preStore = signal<{ key: string; focus: number }>({ key: '', focus: 0 });

  protected readonly previewIndex = signal(-1);
  protected readonly previewStates = signal<readonly PreviewState[]>([]);
  protected readonly preview = computed<PreviewState | null>(() => this.previewStates()[this.previewIndex()] ?? null);
  protected readonly couch = computed(() => {
    const p = this.preview();
    return p && p.kind === 'couch' ? p : null;
  });

  private readonly startOverlay = viewChild(StartOverlayComponent);
  private readonly lobby = viewChild(LobbyComponent);
  private readonly menu = viewChild(MenuComponent);
  private readonly log = viewChild(HandLogComponent);
  private readonly age = viewChild<ChoiceComponent>('age');
  private readonly topUp = viewChild<ChoiceComponent>('topUp');
  private readonly finished = viewChild(FinishedComponent);

  private readonly backdrop = backdropView(Date.now());
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  /** What the TV draws right now. */
  protected readonly view = computed<PlayerView>(() => this.preview()?.view ?? this.session.view() ?? this.backdrop);

  private readonly isLive = computed(() => this.preview()?.flags?.live ?? (this.live() || this.liveToggle()));

  /** People (not just bots) at the table: then live = cards go to the phone. Just you vs bots: they stay. */
  private readonly peopleAtTable = computed(() =>
    this.view().seats.some((s) => s && s.player.kind === 'human' && s.seat !== this.view().me?.seat),
  );

  protected readonly flags = computed<ScreenFlags>(() => {
    const p = this.preview();
    const s = this.session.settings();
    const live = this.isLive();
    return {
      live,
      cardsOnPhone: p?.flags?.cardsOnPhone ?? (live && this.peopleAtTable()),
      cardsHidden: this.cardsHidden(),
      joinUrl: p?.flags?.joinUrl ?? null,
      handLabel: s.handLabel,
      animations: s.animations,
      modeLine: p?.flags?.modeLine ?? `vs bots · ${BOT_LEVEL_LABEL[s.botLevel]}`,
    };
  });

  private readonly legal = computed<LegalActions | null>(() => this.view().me?.legal ?? null);

  private readonly turnKey = computed(() => {
    const p = this.preview();
    if (p) return `preview:${p.id}`;
    const v = this.view();
    return `${v.handNumber}|${v.phase}|${v.turn?.startedAt ?? 0}|${v.currentBet}`;
  });

  protected readonly bar = computed<ActionBarState | null>(() => {
    const legal = this.legal();
    if (!legal) return null;
    const stored = this.barStore();
    if (stored && stored.key === this.turnKey()) return stored.state;
    return this.preview()?.bar ?? initialState(legal);
  });

  protected readonly preFocus = computed(() => (this.preStore().key === this.turnKey() ? this.preStore().focus : 0));

  protected readonly previewLabel = computed(() => {
    const p = this.preview();
    if (!p) return null;
    return `Preview ${this.previewIndex() + 1}/${this.previewStates().length} · ${p.title} · P next`;
  });

  protected readonly levelUp = computed(() => {
    const p = this.preview();
    if (p) return p.levelUp ?? null;
    const lv = this.session.lastEvents().find((e) => e.type === 'levelUp');
    return lv && lv.type === 'levelUp' ? `Blinds up · ${chips(lv.blinds.small)}/${chips(lv.blinds.big)}` : null;
  });

  protected readonly showTopUp = computed(() => {
    const p = this.preview();
    if (p) return p.kind === 'topUp';
    const v = this.session.view();
    if (!v?.me || v.config.gameType !== 'home' || this.screen() !== 'table') return false;
    const mine = v.seats[v.me.seat];
    return mine?.status === 'busted' && this.topUpDismissedHand() !== v.handNumber;
  });

  protected readonly showFinished = computed(() => {
    const p = this.preview();
    if (p) return p.kind === 'finished';
    const v = this.session.view();
    return !!v && this.screen() === 'table' && v.status === 'finished' && v.config.gameType === 'sitAndGo';
  });

  protected readonly showAge = computed(() => this.preview()?.kind === 'age' || (!this.preview() && !this.session.ageConfirmed()));

  protected readonly menuTopUp = computed(() => this.session.view()?.me?.topUp?.to ?? null);
  protected readonly sittingOut = computed(() => {
    const v = this.session.view();
    return !!v?.me && v.seats[v.me.seat]?.status === 'sittingOut';
  });

  protected readonly checkInsteadChoices = [
    { id: 'check', label: 'Check', primary: true, glyph: 'A' },
    { id: 'fold', label: 'Fold anyway', glyph: 'B' },
  ];
  protected readonly ageChoices = [
    { id: 'yes', label: "I'm 18 or older", primary: true },
    { id: 'no', label: 'Not now' },
  ];
  protected readonly topUpChoices = computed(() => [
    { id: 'topUp', label: `Top up to ${chips(this.view().config.startingStack)}`, primary: true },
    { id: 'later', label: 'Not now' },
  ]);

  constructor() {
    this.fit();
    const off = this.input.on((a) => this.route(a));
    // Timer text ticks only while a turn clock is running.
    const tick = setInterval(() => {
      const v = this.view();
      if (v.turn && v.config.actionTimeMs > 0) this.now.set(Date.now());
    }, 250);
    inject(DestroyRef).onDestroy(() => {
      off();
      clearInterval(tick);
      if (this.toastTimer) clearTimeout(this.toastTimer);
      this.session.leave();
    });
  }

  protected fit(): void {
    const w = globalThis.innerWidth || STAGE_W;
    const h = globalThis.innerHeight || STAGE_H;
    this.scale.set(Math.min(w / STAGE_W, h / STAGE_H));
  }

  // ───────────────────────── Input routing ─────────────────────────

  /** Sends each press to whatever is on top. */
  private route(a: TvAction): void {
    if (a === 'preview') {
      if (this.previewEnabled()) this.nextPreview();
      return;
    }
    if (this.preview()) {
      this.routePreview(a);
      return;
    }
    if (this.showAge()) return this.age()?.handle(a);
    if (this.bar()?.confirm) return this.barInput(a);
    if (this.showFinished()) return this.finished()?.handle(a);
    if (this.showTopUp()) return this.topUp()?.handle(a);
    if (this.logHands()) return this.log()?.handle(a);
    if (this.menuOpen()) return this.menu()?.handle(a);
    if (this.screen() === 'start') return this.startOverlay()?.handle(a);
    if (this.screen() === 'lobby') return this.lobby()?.handle(a);
    this.tableInput(a);
  }

  private tableInput(a: TvAction): void {
    switch (a) {
      case 'menu':
        this.openMenu();
        return;
      case 'undo':
        void this.openLog();
        return;
      case 'hint':
        this.cardsHidden.update((h) => !h);
        return;
    }
    const v = this.view();
    const me = v.me;
    if (me?.legal) {
      this.barInput(a);
      return;
    }
    if (me && me.preActionsAvailable.length && BAR_INPUTS.has(a)) {
      const r = reducePre(me.preActionsAvailable, me.preAction, this.preFocus(), a as BarInput);
      this.preStore.set({ key: this.turnKey(), focus: r.focus });
      if (r.set !== undefined) this.session.setPreAction(r.set);
      return;
    }
    if (a === 'select') {
      if (me?.canShow) this.session.show();
      else if (v.phase === 'showdown' || v.phase === 'handComplete') this.session.dealNow();
    }
  }

  private barInput(a: TvAction): void {
    const legal = this.legal();
    const bar = this.bar();
    if (!legal || !bar || !BAR_INPUTS.has(a)) return;
    const r = reduceBar(legal, bar, a as BarInput);
    this.barStore.set({ key: this.turnKey(), state: r.state });
    if (r.intent) {
      if (this.preview()) this.showToast('Preview only: nothing is played.');
      else this.session.act(r.intent);
    }
  }

  // Mouse clicks on the table.
  protected onBarPick(id: ActionButtonId): void {
    const legal = this.legal();
    const bar = this.bar();
    if (!legal || !bar) return;
    const ids = buttonIds(legal);
    let state = bar;
    // Walk focus to the clicked button the same way the D-pad would, then press A.
    for (let guard = 0; guard < ids.length && state.focus !== id; guard++) {
      state = reduceBar(legal, state, ids.indexOf(id) > ids.indexOf(state.focus) ? 'right' : 'left').state;
    }
    this.barStore.set({ key: this.turnKey(), state });
    this.barInput('select');
  }

  protected onPresetPick(i: number): void {
    const legal = this.legal();
    const bar = this.bar();
    const preset = legal?.presets[i];
    if (!legal || !bar || !preset) return;
    const sizingId = buttonIds(legal).find((b) => b === 'raise' || b === 'bet');
    if (!sizingId) return;
    this.barStore.set({ key: this.turnKey(), state: { focus: sizingId, sizingTo: preset.to, confirm: null } });
  }

  protected onPrePick(i: number): void {
    this.preStore.set({ key: this.turnKey(), focus: i });
    this.tableInput('select');
  }

  protected onCheckInstead(id: string): void {
    this.barInput(id === 'check' ? 'select' : 'back');
  }

  // ───────────────────────── Screens ─────────────────────────

  protected play(): void {
    this.session.startVsBots();
    this.cardsHidden.set(false);
    this.barStore.set(null);
    this.screen.set('table');
  }

  /** A click on a top-right hint does exactly what its controller button does. */
  protected onLegendPick(a: 'undo' | 'hint' | 'menu'): void {
    this.input.emit(a, 'pointer');
  }

  /** Leave the table (if seated) and hand control back to skriin.com's watch feed. */
  protected backToWatch(): void {
    this.leaveTable();
    this.exit.emit();
  }

  protected openLobby(mode: PokerMode): void {
    this.lobbyMode.set(mode);
    this.screen.set('lobby');
  }

  protected leaveTable(): void {
    this.menuOpen.set(false);
    this.session.leave();
    this.screen.set('start');
  }

  protected onAge(id: string): void {
    if (this.preview()) {
      this.showToast('Preview only: nothing is saved.');
      return;
    }
    if (id === 'yes') this.session.confirmAge();
    else this.exit.emit();
  }

  protected onTopUp(id: string): void {
    if (this.preview()) {
      this.showToast('Preview only: nothing is played.');
      return;
    }
    const v = this.session.view();
    if (id === 'topUp') this.session.topUp();
    else {
      this.topUpDismissedHand.set(v?.handNumber ?? -1);
      this.session.setSittingOut(true);
    }
  }

  protected onFinished(id: 'again' | 'exit'): void {
    if (this.preview()) {
      this.showToast('Preview only: nothing is played.');
      return;
    }
    if (id === 'again') this.play();
    else this.leaveTable();
  }

  private openMenu(): void {
    this.menuOpen.set(true);
    this.session.setPaused(true);
  }

  protected closeMenu(): void {
    this.menuOpen.set(false);
    this.session.setPaused(false);
  }

  protected onMenu(e: { id: MenuItemId; step: 1 | -1 }): void {
    const s = this.session.settings();
    switch (e.id) {
      case 'resume':
        this.closeMenu();
        break;
      case 'topUp':
        this.session.topUp();
        this.closeMenu();
        break;
      case 'sitOut':
        this.session.setSittingOut(!this.sittingOut());
        this.closeMenu();
        break;
      case 'handLabel':
        this.session.updateSettings({ handLabel: !s.handLabel });
        break;
      case 'autoShow':
        this.session.updateSettings({ autoShow: !s.autoShow });
        this.showToast('Auto-show changes from the next table.');
        break;
      case 'bots': {
        const i = BOT_LEVELS.indexOf(s.botLevel);
        this.session.setBotLevel(BOT_LEVELS[(i + e.step + 3) % 3]!);
        break;
      }
      case 'animations':
        this.session.updateSettings({ animations: !s.animations });
        break;
      case 'sound':
        this.session.updateSettings({ sound: !s.sound });
        break;
      case 'live':
        this.liveToggle.update((l) => !l);
        break;
      case 'leave':
        this.leaveTable();
        break;
      case 'exit':
        this.backToWatch();
        break;
    }
  }

  private async openLog(): Promise<void> {
    this.logHands.set(await this.session.history(20));
  }

  protected closeLog(): void {
    this.logHands.set(null);
  }

  // ───────────────────────── Preview ─────────────────────────

  private nextPreview(): void {
    const states = this.previewIndex() === -1 ? buildPreviewStates(Date.now()) : this.previewStates();
    this.previewStates.set(states);
    const next = this.previewIndex() + 1;
    this.barStore.set(null);
    this.preStore.set({ key: '', focus: 0 });
    this.cardsHidden.set(false);
    if (next >= states.length) {
      this.previewIndex.set(-1);
      this.showToast('Back to your game.');
    } else {
      this.previewIndex.set(next);
      this.now.set(Date.now());
    }
    this.session.setPaused(this.previewIndex() !== -1 || this.menuOpen());
  }

  private routePreview(a: TvAction): void {
    const p = this.preview()!;
    if (a === 'menu') {
      this.previewIndex.set(-1);
      this.session.setPaused(false);
      return;
    }
    if (p.kind === 'age') return this.age()?.handle(a);
    if (p.kind === 'topUp') return this.topUp()?.handle(a);
    if (p.kind === 'finished') return this.finished()?.handle(a);
    if (a === 'hint') {
      this.cardsHidden.update((h) => !h);
      return;
    }
    if (this.legal()) this.barInput(a);
  }

  private showToast(text: string): void {
    this.toast.set(text);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(null), 2200);
  }
}
