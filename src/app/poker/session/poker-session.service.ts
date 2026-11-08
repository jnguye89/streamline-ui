import { Injectable, inject, signal } from '@angular/core';
import { HandSummary, PlayerAction, PlayerView, PokerEvent, PreAction, SeatHandle } from '../core/api';
import { LocalTable, YOU_SEAT } from '../placeholder/local-table';
import { DEFAULT_SETTINGS, PokerSettings } from '../poker.types';
import { SoundService } from '../sound.service';
import { AGE_CHECK_STORE } from './ports';

const SETTINGS_KEY = 'skriin.poker.settings';

function loadSettings(): PokerSettings {
  try {
    const raw = globalThis.localStorage?.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<PokerSettings>) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Holds the table you're sitting at and turns it into signals for the UI.
 * The UI only ever sees PlayerView (through a SeatHandle). Offline = LocalTable on the box.
 * Online (Phase 3) swaps in a Colyseus-backed SeatHandle with the same shape.
 */
@Injectable()
export class PokerSession {
  private readonly sound = inject(SoundService);
  private readonly ageStore = inject(AGE_CHECK_STORE);

  readonly settings = signal<PokerSettings>(loadSettings());
  readonly ageConfirmed = signal(this.ageStore.confirmedAt() !== null);
  readonly view = signal<PlayerView | null>(null);
  readonly lastEvents = signal<readonly PokerEvent[]>([]);

  private table: LocalTable | null = null;
  private handle: SeatHandle | null = null;
  private off: (() => void) | null = null;

  constructor() {
    this.sound.enabled = this.settings().sound;
  }

  confirmAge(): void {
    this.ageStore.confirm();
    this.ageConfirmed.set(true);
  }

  updateSettings(patch: Partial<PokerSettings>): void {
    const next = { ...this.settings(), ...patch };
    this.settings.set(next);
    this.sound.enabled = next.sound;
    try {
      globalThis.localStorage?.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      /* settings last for this visit */
    }
  }

  /** You vs bots on this box. Stacks start fresh at every table (they never carry over). */
  startVsBots(): void {
    this.leave();
    const s = this.settings();
    const table = new LocalTable({
      gameType: s.gameType,
      players: s.players,
      botLevel: s.botLevel,
      autoShow: s.autoShow,
      you: { id: 'you', name: 'You', kind: 'human', botLevel: null },
    });
    this.table = table;
    this.handle = table.handle;
    this.off = table.handle.subscribe((view, events) => this.onUpdate(view, events));
    this.view.set(table.handle.view());
    table.start();
  }

  leave(): void {
    this.off?.();
    this.off = null;
    this.table?.dispose();
    this.table = null;
    this.handle = null;
    this.view.set(null);
    this.lastEvents.set([]);
  }

  act(action: PlayerAction): void {
    this.sound.play(action.type === 'fold' ? 'fold' : action.type === 'check' ? 'select' : 'chip');
    void this.handle?.act(action);
  }

  setPreAction(pre: PreAction | null): void {
    void this.handle?.setPreAction(pre).then(() => this.refresh());
  }

  topUp(): void {
    void this.handle?.topUp().then(() => {
      this.refresh();
      this.table?.resume();
    });
  }

  setSittingOut(on: boolean): void {
    void this.handle?.setSittingOut(on).then(() => {
      this.refresh();
      this.table?.resume();
    });
  }

  show(): void {
    void this.handle?.show();
  }

  dealNow(): void {
    this.table?.dealNow();
  }

  /** Menu open → stop dealing new hands (the current hand still finishes). */
  setPaused(paused: boolean): void {
    this.table?.setPaused(paused);
  }

  setBotLevel(level: PokerSettings['botLevel']): void {
    this.updateSettings({ botLevel: level });
    this.table?.setBotLevel(level);
  }

  history(limit = 20): Promise<readonly HandSummary[]> {
    return this.handle ? this.handle.history(limit) : Promise.resolve([]);
  }

  private refresh(): void {
    if (this.handle) this.view.set(this.handle.view());
  }

  private onUpdate(view: PlayerView, events: readonly PokerEvent[]): void {
    const before = this.view();
    this.view.set(view);
    this.lastEvents.set(events);
    const myTurnNow = !!view.me?.legal;
    const myTurnBefore = !!before?.me?.legal;
    if (myTurnNow && !myTurnBefore) this.sound.play('turn');
    if (events.some((e) => e.type === 'streetDealt' || e.type === 'cardsDealt')) this.sound.play('deal');
    const won = events.some((e) => e.type === 'potAwarded' && e.result.winners.some((w) => w.seat === YOU_SEAT));
    if (won) this.sound.play('win');
  }
}
