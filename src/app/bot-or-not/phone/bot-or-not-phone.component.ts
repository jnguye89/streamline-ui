import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ViewEncapsulation,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { COPY, JOIN_ERROR_COPY, VERDICT_COPY, phoneRoundLine, placeLabel } from '../core/copy';
import { MAX_NAME_CHARS } from '../core/settings';
import { PublicPlayer } from '../core/types';
import { BOT_OR_NOT_FEATURES, PHONE_GAME_CLIENT } from '../data/game-client';
import { AvatarComponent } from '../tv/ui/avatar.component';
import { PhoneAnswerComponent } from './phone-answer.component';
import { PhoneCardsComponent } from './phone-cards.component';
import { PhoneHostComponent } from './phone-host.component';

type View = 'join' | 'removed' | 'waiting' | 'answer' | 'reveal' | 'vote' | 'results' | 'void' | 'final';

/**
 * skriin ai TV · Bot or Not, phone web controller (skriin.com/play/CODE). No app needed.
 * Private answer pad and vote. Works on its own in any phone browser; the iOS app (Phase 3)
 * has the same screens. Talks to the room only through PHONE_GAME_CLIENT.
 */
@Component({
  selector: 'skriin-bot-or-not-phone',
  standalone: true,
  imports: [AvatarComponent, PhoneAnswerComponent, PhoneCardsComponent, PhoneHostComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  templateUrl: './bot-or-not-phone.component.html',
  styleUrl: './bot-or-not-phone.component.css',
  host: {
    class: 'skriin-bot-or-not-phone',
    // Typing here must never reach the TV's key handling (they share a page in the preview).
    '(keydown)': '$event.stopPropagation()',
  },
})
export class BotOrNotPhoneComponent {
  /** From the URL (skriin.com/play/CODE). */
  readonly code = input('');

  protected readonly client = inject(PHONE_GAME_CLIENT);
  protected readonly features = inject(BOT_OR_NOT_FEATURES);
  protected readonly copy = COPY;
  protected readonly maxName = MAX_NAME_CHARS;

  protected readonly s = this.client.state;
  protected readonly me = this.client.me;

  protected readonly codeDraft = signal('');
  protected readonly nameDraft = signal('');
  protected readonly faceOptIn = signal(false);
  protected readonly joinError = signal<string | null>(null);
  protected readonly joining = signal(false);
  protected readonly hostOpen = signal(false);

  protected readonly self = computed<PublicPlayer | null>(() => {
    const id = this.me()?.playerId;
    return this.s()?.players.find((p) => p.id === id) ?? null;
  });

  protected readonly view = computed<View>(() => {
    const me = this.me();
    const s = this.s();
    if (me?.removed) return 'removed';
    if (!me || !s) return 'join';
    if (s.phase === 'lobby' || this.self()?.waiting) return 'waiting';
    switch (s.phase) {
      case 'prompt':
      case 'answering':
        return 'answer';
      case 'reveal':
        return 'reveal';
      case 'voting':
        return 'vote';
      case 'results':
        return 'results';
      case 'void':
        return 'void';
      default:
        return 'final';
    }
  });

  protected readonly clock = computed(() => {
    const t = this.s()?.timer;
    if (!t) return '';
    const ms = t.running && t.endsAt !== null ? Math.max(0, t.endsAt - this.client.now()) : t.remainingMs;
    const sec = Math.ceil(ms / 1000);
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  });

  protected readonly roundLabel = computed(() => {
    const s = this.s();
    return s && s.round > 0 && s.phase !== 'lobby' && s.phase !== 'final' ? `Round ${s.round}/${s.totalRounds}` : '';
  });

  protected readonly humansIn = computed(() => this.s()?.players.filter((p) => p.kind === 'human').length ?? 0);

  protected readonly myLine = computed(() => {
    const s = this.s();
    const me = this.me();
    if (!s?.results || !me) return null;
    const line = s.results.points.find((p) => p.playerId === me.playerId);
    const voted = s.results.cards.some((c) => c.voterIds.includes(me.playerId));
    const hadCard = s.results.cards.some((c) => c.authorId === me.playerId);
    return { points: line?.points ?? 0, text: phoneRoundLine(line, voted, hadCard), verdict: VERDICT_COPY[s.results.verdict] };
  });

  protected readonly myStanding = computed(() => {
    const s = this.s();
    const id = this.me()?.playerId;
    const st = s?.standings.find((x) => x.playerId === id);
    return st && s ? { place: placeLabel(st.place), of: s.standings.length, score: st.score } : null;
  });

  protected readonly board = computed(() => {
    const s = this.s();
    if (!s) return [];
    const players = new Map(s.players.map((p) => [p.id, p]));
    return s.standings
      .map((st) => ({ st, p: players.get(st.playerId) }))
      .filter((r): r is { st: (typeof s.standings)[number]; p: PublicPlayer } => !!r.p);
  });

  protected readonly canJoin = computed(
    () => this.codeDraft().trim().length === 4 && this.nameDraft().trim().length > 0 && !this.joining(),
  );

  constructor() {
    // The URL's code fills the code box; with no code in the URL, the phone shows an empty box.
    effect(() => {
      const fromUrl = this.code() || this.client.roomCode();
      untracked(() => {
        if (!this.codeDraft()) this.codeDraft.set(fromUrl.toUpperCase());
      });
    });
    // Keep the layout above the on-screen keyboard (iOS Safari shrinks the visual viewport, not the layout one).
    const vv = globalThis.visualViewport;
    if (vv) {
      const onResize = () => document.documentElement.style.setProperty('--ph-vvh', `${vv.height}px`);
      vv.addEventListener('resize', onResize);
      onResize();
      inject(DestroyRef).onDestroy(() => vv.removeEventListener('resize', onResize));
    }
  }

  protected setCode(e: Event): void {
    const el = e.target as HTMLInputElement;
    const v = el.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    el.value = v;
    this.codeDraft.set(v);
    this.joinError.set(null);
  }

  protected setName(e: Event): void {
    this.nameDraft.set((e.target as HTMLInputElement).value);
    this.joinError.set(null);
  }

  protected async join(): Promise<void> {
    if (!this.canJoin()) return;
    this.joining.set(true);
    const res = await this.client.join(this.codeDraft(), this.nameDraft());
    this.joining.set(false);
    if (!res.ok) this.joinError.set(JOIN_ERROR_COPY[res.error]);
    else globalThis.navigator?.vibrate?.(12);
  }

  protected async submit(text: string): Promise<void> {
    await this.client.submitAnswer(text);
  }

  protected async vote(cardId: string): Promise<void> {
    const res = await this.client.vote(cardId);
    if (res === 'ok') globalThis.navigator?.vibrate?.(10);
  }

  protected label(p: PublicPlayer): string {
    return p.kind === 'bot' ? (p.name === 'Bot' ? 'the bot' : p.name) : p.name;
  }
}
