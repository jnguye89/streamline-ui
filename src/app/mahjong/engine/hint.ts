import {
  PlayerView,
  TileId,
  WINDS,
  dragonOf,
  isFlower,
  isSeason,
  kindCounts,
  kindOf,
  rankOf,
  windKind,
} from '@skriin/mahjong-core';
import { Hint } from '../mahjong.types';
import { chooseDiscard } from './placeholder/bot-brain';
import { waits } from './placeholder/hand-shape';

/**
 * Y = hint, computed from your own view only (no hidden tiles).
 * PHASE 1 PLACEHOLDER: uses the preview bot's discard choice; waits are exact for the hand shape.
 * Phase 2: mahjong-core shanten + tile acceptance (the Medium bot's choice).
 */
export function computeHint(view: PlayerView): Hint {
  const all: TileId[] = view.drawn === null ? [...view.hand] : [...view.hand, view.drawn];
  const melds = view.seats[view.you].melds.length;
  if (all.length % 3 !== 2) return { discard: null, waits: waits(kindCounts(all), melds) };
  const discard = chooseDiscard(all, new Set(), () => 0.5);
  const rest = all.filter((t) => t !== discard);
  return { discard, waits: waits(kindCounts(rest), melds) };
}

/**
 * Beginner setting "faan so far": lines already locked in by what's on the table
 * (bonus tiles, exposed dragon / wind pungs). PHASE 1 PLACEHOLDER; Phase 2 uses the real scorer.
 */
export function faanSoFar(view: PlayerView): { total: number; lines: string[] } {
  const me = view.seats[view.you];
  const lines: string[] = [];
  const seatNo = WINDS.indexOf(me.wind) + 1;
  const bonus = me.bonus.map(kindOf);
  if (!bonus.length) lines.push('No bonus tiles');
  if (bonus.some((k) => isFlower(k) && rankOf(k) === seatNo)) lines.push('Own flower');
  if (bonus.some((k) => isSeason(k) && rankOf(k) === seatNo)) lines.push('Own season');
  for (const m of me.melds) {
    if (m.type === 'chow') continue;
    const k = kindOf(m.tiles[0]);
    const dragon = dragonOf(k);
    if (dragon) lines.push(`${dragon[0].toUpperCase()}${dragon.slice(1)} dragon`);
    if (k === windKind(me.wind)) lines.push('Seat wind');
    if (k === windKind(view.round.prevailing)) lines.push('Prevailing wind');
  }
  return { total: lines.length, lines };
}
