import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { COPY, VERDICT_COPY } from '../../core/copy';
import { CardResult, PublicCard, PublicPlayer, PublicState } from '../../core/types';
import { PLAYER_VIDEO } from '../../media/player-video';
import { AvatarComponent } from '../ui/avatar.component';
import { FlyFromDirective } from '../ui/face-anchors';
import { TimerRingComponent } from '../ui/timer-ring.component';

const GRID_W = 1776;
const GRID_H = 540;
const COL_GAP = 24;
const ROW_GAP = 56;
const PAD_X = 30;
const PAD_TOP = 40;
const PAD_BOTTOM = 26;
const MIN_FONT = 28;

/** Results beats (ms after Results starts): faces fly → bot flips + authors → verdict → points. */
export const RESULTS_STEPS = [300, 2300, 3100, 3900] as const;

interface CardView {
  readonly card: PublicCard;
  readonly shown: boolean;
  readonly result: CardResult | null;
  readonly author: PublicPlayer | null;
  readonly voters: readonly PublicPlayer[];
}

/** Rough width of a line of Inter 600, in ems. Used only to pick one font size for every card. */
function textEms(text: string): number {
  let w = 0;
  for (const ch of text) {
    if (ch === ' ') w += 0.28;
    else if (/[A-Z0-9]/.test(ch)) w += 0.68;
    else if (/[a-z]/.test(ch)) w += 0.55;
    else if (/[.,'’:;!?\-]/.test(ch)) w += 0.3;
    else w += 1.15; // emoji and the rest
  }
  return w;
}

/**
 * Reveal, Vote and Results share one card grid (A–J). Every card uses the same font, size and
 * trim, chosen for the whole grid, never per card, so length or layout can't give the bot away.
 */
@Component({
  selector: 'bon-cards',
  standalone: true,
  imports: [AvatarComponent, FlyFromDirective, TimerRingComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="head">
      <div class="titles">
        <div class="line">
          <h1 class="title" [class.verdict]="showVerdict()">{{ title() }}</h1>
          @if (showVerdict() && state().results?.double) {
            <span class="bon-pill hot">{{ copy.doublePoints }}</span>
          }
          @if (picking()) {
            <span class="bon-pill pick">{{ copy.hideHint }}</span>
          }
        </div>
        @if (!showVerdict() && !fit().tight) {
          <p class="sub">{{ state().prompt }}</p>
        }
      </div>
      @if (state().phase === 'results' && couchStream(); as stream) {
        <video class="couch" [srcObject]="stream" autoplay muted playsinline aria-label="The couch"></video>
      }
      @if (state().phase === 'voting') {
        <div class="clock">
          <span class="in">{{ votesIn() }}</span>
          <bon-timer-ring [timer]="state().timer" [now]="now()" [size]="fit().tight ? 88 : 132" />
        </div>
      }
    </header>

    <div
      class="grid"
      [style.grid-template-columns]="'repeat(' + layout().cols + ', 1fr)'"
      [style.grid-auto-rows.px]="fit().rowH"
      [style.top.px]="fit().top"
      [style.row-gap.px]="fit().rowGap"
      [style.--card-font]="fit().size + 'px'"
      [style.--card-lh]="fit().lineHeight"
    >
      @for (v of views(); track v.card.id; let i = $index) {
        <div
          class="card"
          [class.shown]="v.shown"
          [class.hidden]="v.card.hidden"
          [class.pick]="pickIndex() === i"
          [class.is-bot]="flipped() && v.result?.isBot"
        >
          <span class="letter">{{ v.card.letter }}</span>
          <div class="inner">
            <div class="face front">
              @if (v.card.hidden) {
                <p class="txt muted">{{ copy.hiddenByHost }}</p>
              } @else if (v.shown) {
                <p class="txt">{{ v.card.text }}</p>
              }
            </div>
            @if (flipped() && v.result?.isBot) {
              <div class="face back">
                <span class="label">{{ copy.thisWasTheBot }}</span>
                @if (!v.card.hidden) {
                  <p class="txt">{{ v.card.text }}</p>
                }
              </div>
            }
          </div>
          @if (flipped() && v.author && !v.result?.isBot) {
            <span class="author">
              <bon-avatar [name]="v.author.name" [hue]="v.author.hue" [size]="40" />
              @if (showNames()) {
                <span class="who">{{ v.author.name }}</span>
              }
            </span>
          }
          @if (step() >= 1 && v.voters.length) {
            <div class="votes">
              @for (voter of v.voters; track voter.id; let j = $index) {
                <span class="chip" [bonFlyFrom]="voter.id" [flyDelay]="flyDelay(i, j)">
                  <bon-avatar [name]="voter.name" [hue]="voter.hue" [size]="48" />
                </span>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: `
    :host { position: absolute; inset: 0; display: block; }
    .head { position: absolute; left: 24px; right: 24px; top: 0; height: 128px; display: flex; justify-content: space-between; align-items: flex-start; }
    .titles { min-width: 0; }
    .line { display: flex; align-items: center; gap: 24px; }
    .bon-pill.pick { margin-left: 8px; }
    .title { margin: 0; font: 600 60px/1 var(--font-display); letter-spacing: -0.03em; }
    .title.verdict { font-size: 80px; animation: verdict 420ms var(--ease) both; }
    .sub { margin: 12px 0 0; font: 500 32px/1.2 var(--font-ui); color: var(--text-2); max-width: 1300px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .clock { display: flex; align-items: center; gap: 28px; }
    .couch { width: 224px; height: 126px; border-radius: 20px; object-fit: cover; background: #14141c; animation: fade 300ms ease both; }
    .in { font: 500 32px/1 var(--font-mono); color: var(--text-2); }

    .grid { position: absolute; left: 0; right: 0; display: grid; column-gap: 24px; row-gap: 56px; }
    .card { position: relative; perspective: 1400px; }
    .inner { position: absolute; inset: 0; transform-style: preserve-3d; transition: transform 640ms var(--ease); }
    .card.is-bot .inner { transform: rotateY(180deg); }
    .face {
      position: absolute; inset: 0; border-radius: 28px; backface-visibility: hidden; -webkit-backface-visibility: hidden;
      padding: 40px 30px 26px; display: flex; flex-direction: column;
    }
    .front { background: var(--surface); border: 2px dashed rgba(255, 255, 255, 0.14); }
    .card.shown .front { border: 1px solid rgba(255, 255, 255, 0.12); background: #14141c; animation: cardIn 280ms var(--ease) both; }
    .back { transform: rotateY(180deg); background: var(--indigo); border: 1px solid rgba(255, 255, 255, 0.2); }
    .txt {
      margin: 0; font-family: var(--font-ui); font-weight: 600; font-size: var(--card-font); line-height: var(--card-lh, 1.24);
      letter-spacing: -0.005em; color: #fff; overflow-wrap: anywhere; white-space: normal;
    }
    .txt.muted { color: var(--text-3); font-weight: 500; }
    .back .label { font: 600 30px/1.1 var(--font-display); color: #fff; letter-spacing: -0.01em; margin-bottom: 12px; }
    .back .txt { font-size: max(28px, calc(var(--card-font) - 4px)); color: var(--lav-soft); }
    .letter {
      position: absolute; z-index: 3; left: 24px; top: -24px; width: 56px; height: 56px; border-radius: 50%;
      display: grid; place-items: center; background: var(--indigo); color: #fff; font: 600 30px/1 var(--font-display);
      box-shadow: 0 0 0 6px #000;
    }
    .card:not(.shown) .letter { background: #1d1d26; color: var(--text-2); }
    .card.is-bot .letter { background: #fff; color: var(--indigo); }
    .card.pick .front, .card.pick .back { box-shadow: 0 0 0 4px #fff; }
    .card.pick { transform: scale(1.04); z-index: 4; }
    .card { transition: transform 140ms var(--ease); }
    .author {
      position: absolute; z-index: 3; right: 18px; top: -24px; height: 56px; padding: 0 18px 0 8px; border-radius: 999px;
      display: flex; align-items: center; gap: 10px; background: #1d1d26; box-shadow: 0 0 0 6px #000; animation: fade 300ms ease both;
    }
    .author .who { font: 600 28px/1 var(--font-ui); max-width: 190px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .votes { position: absolute; z-index: 3; left: 20px; right: 20px; bottom: -16px; display: flex; flex-wrap: nowrap; justify-content: flex-end; }
    .chip { line-height: 0; border-radius: 50%; box-shadow: 0 0 0 4px #000; margin-left: -6px; }
    @keyframes cardIn { from { opacity: 0; transform: translateY(14px) scale(0.97); } to { opacity: 1; transform: none; } }
    @keyframes verdict { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: none; } }
    @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) {
      .inner, .card { transition: none; }
      .card.shown .front, .title.verdict, .author { animation: none; }
    }
  `,
})
export class CardsComponent {
  readonly state = input.required<PublicState>();
  readonly now = input(0);
  /** Results beat (0–4), driven by the page. */
  readonly step = input(0);
  /** Hide-a-card mode: index of the focused card, or null. */
  readonly pickIndex = input<number | null>(null);
  readonly showNames = input(true);

  protected readonly copy = COPY;
  private readonly video = inject(PLAYER_VIDEO);
  /** The host TV's own camera as one group tile, for the Results reaction (null until a video stack exists). */
  protected readonly couchStream = computed(() => this.video.couch()?.stream() ?? null);

  protected readonly picking = computed(() => this.pickIndex() !== null);
  protected readonly flipped = computed(() => this.state().phase === 'results' && this.step() >= 2);
  protected readonly showVerdict = computed(() => this.state().phase === 'results' && this.step() >= 3);

  protected readonly title = computed(() => {
    const s = this.state();
    if (this.showVerdict() && s.results) return VERDICT_COPY[s.results.verdict];
    return s.phase === 'reveal' ? COPY.revealTitle : COPY.voteTitle;
  });
  protected readonly votesIn = computed(() => COPY.votesIn(this.state().votesIn, this.state().votesExpected));

  protected readonly views = computed<CardView[]>(() => {
    const s = this.state();
    const players = new Map(s.players.map((p) => [p.id, p]));
    return s.cards.map((card, i) => {
      const result = s.results?.cards.find((r) => r.cardId === card.id) ?? null;
      return {
        card,
        shown: s.phase !== 'reveal' || i < s.revealed,
        result,
        author: result ? (players.get(result.authorId) ?? null) : null,
        voters: result ? result.voterIds.map((id) => players.get(id)).filter((p): p is PublicPlayer => !!p) : [],
      };
    });
  });

  protected readonly layout = computed(() => {
    const n = Math.max(1, this.state().cards.length);
    const cols = n <= 4 ? n : n <= 6 ? 3 : n <= 8 ? 4 : 5;
    const rows = Math.ceil(n / cols);
    const rowH = rows === 1 ? 320 : Math.floor((GRID_H - ROW_GAP) / 2);
    const top = rows === 1 ? 210 : 146;
    const cardW = (GRID_W - COL_GAP * (cols - 1)) / cols;
    const base = cols <= 3 ? (n <= 3 ? 46 : 40) : cols === 4 ? 36 : 31;
    return { cols, rows, rowH, top, cardW, base };
  });

  /**
   * One size for every card: the largest (from the grid's base down to 28 px) where the longest answer
   * fits. If even 28 px doesn't fit (10 cards, all near 80 characters), the grid goes "tight": the
   * prompt line leaves the TV (it's on every phone) and the rows get taller. Text is never cut.
   */
  protected readonly fit = computed(() => {
    const { rows, rowH, top, cardW, base } = this.layout();
    const width = cardW - PAD_X * 2;
    const texts = this.state().cards.map((c) => c.text);
    const lines = (size: number) => Math.max(1, ...texts.map((t) => Math.ceil((textEms(t) * size * 1.08) / width)));
    for (let size = base; size >= MIN_FONT; size -= 1) {
      if (lines(size) * size * 1.24 <= rowH - PAD_TOP - PAD_BOTTOM) {
        return { size, lineHeight: 1.24, rowH, top, rowGap: ROW_GAP, tight: false };
      }
    }
    const gain = rows === 2 ? 50 : 0;
    return {
      size: MIN_FONT,
      lineHeight: 1.2,
      rowH: rows === 2 ? rowH + (gain + 6) / 2 : rowH,
      top: top - gain,
      rowGap: rows === 2 ? ROW_GAP - 6 : ROW_GAP,
      tight: true,
    };
  });

  protected flyDelay(cardIndex: number, voterIndex: number): number {
    return (cardIndex * 2 + voterIndex) * 90;
  }
}
