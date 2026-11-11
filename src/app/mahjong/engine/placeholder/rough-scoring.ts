import {
  FaanLine,
  Meld,
  TileKind,
  WINDS,
  Wind,
  dragonOf,
  isFlower,
  isHonor,
  isSeason,
  isSuited,
  isWind,
  kindOf,
  rankOf,
  suitOf,
  windKind,
} from '@skriin/mahjong-core';
import { Shape } from './hand-shape';

/**
 * PHASE 1 PLACEHOLDER. Rough Hong Kong scoring so the preview can end hands.
 * Uses the approved line names and values, but is untested and covers only the common lines.
 * Phase 2 replaces it with mahjong-core's HongKongRules (every line on the sheet, best split, tests).
 */

export interface ScoreContext {
  readonly melds: readonly Meld[];
  readonly bonus: readonly TileKind[];
  readonly seatWind: Wind;
  readonly prevailing: Wind;
  readonly selfDrawn: boolean;
  readonly replacement: boolean;
  readonly lastTile: boolean;
  readonly cap: number;
}

export interface Scored {
  readonly shape: Shape;
  readonly lines: FaanLine[];
  readonly total: number;
  readonly capped: boolean;
}

const DRAGON_LABEL = { red: 'Red dragon', green: 'Green dragon', white: 'White dragon' } as const;

export function scoreBest(all: readonly Shape[], ctx: ScoreContext): Scored | null {
  let best: Scored | null = null;
  for (const shape of all) {
    const lines = scoreShape(shape, ctx);
    const raw = lines.reduce((a, l) => a + l.faan, 0);
    const total = Math.min(raw, ctx.cap);
    if (!best || total > best.total) best = { shape, lines, total, capped: raw > ctx.cap };
  }
  return best;
}

function scoreShape(shape: Shape, ctx: ScoreContext): FaanLine[] {
  const lines: FaanLine[] = [];
  const add = (id: string, label: string, faan: number, limit = false) =>
    lines.push({ id, label, faan, limit });
  if (shape.special === 'thirteen-orphans') {
    add('thirteen-orphans', 'Thirteen orphans', 13, true);
    return lines;
  }

  const sets = [
    ...ctx.melds.map((m) => ({
      type: m.type === 'chow' ? 'chow' : 'pung',
      kind: kindOf(m.tiles[0]),
    })),
    ...shape.sets,
  ];
  const kinds = [
    ...sets.flatMap((s) => (s.type === 'chow' ? [s.kind, s.kind + 1, s.kind + 2] : [s.kind])),
    shape.pair,
  ];
  const pungKinds = sets.filter((s) => s.type === 'pung').map((s) => s.kind);
  const dragonPungs = pungKinds.filter((k) => dragonOf(k));
  const windPungs = pungKinds.filter(isWind);

  // Limit hands first (they score the cap on their own).
  if (kinds.every(isHonor)) {
    add('all-honors', 'All honors', 10, true);
    return lines;
  }
  if (windPungs.length === 4) {
    add('big-four-winds', 'Big four winds', 15, true);
    return lines;
  }
  if (windPungs.length === 3 && isWind(shape.pair)) {
    add('small-four-winds', 'Small four winds', 10, true);
    return lines;
  }

  if (ctx.selfDrawn) add('self-drawn', 'Self-drawn', 1);
  if (ctx.melds.every((m) => m.concealed)) add('concealed', 'Concealed hand', 1);
  if (ctx.replacement) add('replacement', 'Win on a replacement tile', 1);
  if (ctx.lastTile) add('last-tile', 'Last tile', 1);

  // Bonus tiles.
  const seatNo = WINDS.indexOf(ctx.seatWind) + 1;
  const flowers = ctx.bonus.filter(isFlower);
  const seasons = ctx.bonus.filter(isSeason);
  if (ctx.bonus.length === 0) add('no-bonus', 'No bonus tiles', 1);
  else if (ctx.bonus.length === 8) add('all-eight', 'All 8 bonus tiles', 8);
  else {
    if (flowers.length === 4) add('all-flowers', 'All 4 flowers', 2);
    else if (flowers.some((k) => rankOf(k) === seatNo)) add('own-flower', 'Own flower', 1);
    if (seasons.length === 4) add('all-seasons', 'All 4 seasons', 2);
    else if (seasons.some((k) => rankOf(k) === seatNo)) add('own-season', 'Own season', 1);
  }

  // Dragons and winds.
  if (dragonPungs.length === 3) add('big-three-dragons', 'Big three dragons', 8);
  else if (dragonPungs.length === 2 && dragonOf(shape.pair))
    add('small-three-dragons', 'Small three dragons', 5);
  else for (const k of dragonPungs) add(`dragon-${k}`, DRAGON_LABEL[dragonOf(k)!], 1);
  if (pungKinds.includes(windKind(ctx.seatWind))) add('seat-wind', 'Seat wind', 1);
  if (pungKinds.includes(windKind(ctx.prevailing))) add('prevailing-wind', 'Prevailing wind', 1);

  // Hand shape.
  if (sets.every((s) => s.type === 'chow')) add('all-chows', 'All chows', 1);
  if (sets.every((s) => s.type === 'pung')) add('all-pungs', 'All pungs', 3);
  const suits = new Set(kinds.filter(isSuited).map(suitOf));
  const honors = kinds.some(isHonor);
  if (suits.size === 1 && !honors) add('pure-one-suit', 'Pure one suit', 7);
  else if (suits.size === 1 && honors) add('mixed-one-suit', 'Mixed one suit', 3);

  return lines;
}
