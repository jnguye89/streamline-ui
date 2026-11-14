import { Board, Origin, Side, Target, countAt, own } from '@skriin/backgammon-core';

/**
 * Board geometry (px inside the 1016 × 896 board).
 *
 * Classic layout seen by the bottom player ("view side"), home board bottom-right:
 *   top row    13 14 15 16 17 18 | bar | 19 20 21 22 23 24 | tray (opponent's borne-off)
 *   bottom row 12 11 10  9  8  7 | bar |  6  5  4  3  2  1 | tray (yours)
 * Mirror (home bottom-left) flips every x.
 */

export const BW = 1016;
export const BH = 896;
export const PAD_X = 12;
/** Top and bottom bands hold the point numbers. */
export const PAD_Y = 44;
export const PT_W = 68;
export const BAR_W = 84;
export const TRAY_GAP = 8;
export const TRAY_W = 84;
export const TRI_H = 330;
/** Checker diameter. */
export const CK = 62;
export const SLAB_H = 18;
export const SLAB_STEP = 21;

export const FIELD_TOP = PAD_Y;
export const FIELD_BOTTOM = BH - PAD_Y;
export const MID_Y = BH / 2;
export const LEFT_X = PAD_X;
export const BAR_X = LEFT_X + 6 * PT_W;
export const RIGHT_X = BAR_X + BAR_W;
export const TRAY_X = RIGHT_X + 6 * PT_W + TRAY_GAP;

export interface XY {
  readonly x: number;
  readonly y: number;
}

export interface Geo {
  /** Side at the bottom of the screen. */
  readonly view: Side;
  /** Home board bottom-left instead of bottom-right. */
  readonly mirror: boolean;
}

const mx = (g: Geo, x: number) => (g.mirror ? BW - x : x);

/** Left edge of a point column, before mirroring, for the view side's own point p. */
function columnLeft(p: number): number {
  if (p <= 6) return RIGHT_X + (6 - p) * PT_W;
  if (p <= 12) return LEFT_X + (12 - p) * PT_W;
  if (p <= 18) return LEFT_X + (p - 13) * PT_W;
  return RIGHT_X + (p - 19) * PT_W;
}

/** Point column for absolute point a: left x (after mirror), whether it is on the top row. */
export function pointColumn(g: Geo, a: number): { x: number; top: boolean; p: number } {
  const p = own(g.view, a);
  const left = columnLeft(p);
  return { x: g.mirror ? BW - left - PT_W : left, top: p >= 13, p };
}

/** Distance between stacked checkers: full size up to 5, then squeezed to fit the point. */
export function spacing(n: number, room = TRI_H): number {
  return n <= 5 ? CK : Math.min(CK, (room - CK) / (n - 1));
}

/** Center of checker i (0 = at the edge) in a stack of n on absolute point a. */
export function pointChecker(g: Geo, a: number, i: number, n: number): XY {
  const col = pointColumn(g, a);
  const s = spacing(n);
  const x = col.x + PT_W / 2;
  return col.top ? { x, y: FIELD_TOP + CK / 2 + i * s } : { x, y: FIELD_BOTTOM - CK / 2 - i * s };
}

/** Bar: the view side's checkers sit below the middle, the other side's above it. */
export function barChecker(g: Geo, side: Side, i: number, n: number): XY {
  const s = spacing(n, 300);
  const x = mx(g, BAR_X + BAR_W / 2);
  const start = 78;
  return side === g.view ? { x, y: MID_Y + start + i * s } : { x, y: MID_Y - start - i * s };
}

/** Borne-off slab i (side view of a checker) in a side's tray. */
export function offSlab(g: Geo, side: Side, i: number): XY {
  const x = mx(g, TRAY_X + TRAY_W / 2);
  return side === g.view
    ? { x, y: FIELD_BOTTOM - 12 - SLAB_H / 2 - i * SLAB_STEP }
    : { x, y: FIELD_TOP + 12 + SLAB_H / 2 + i * SLAB_STEP };
}

export function trayCount(g: Geo, side: Side): XY {
  const x = mx(g, TRAY_X + TRAY_W / 2);
  return { x, y: side === g.view ? MID_Y + 40 : MID_Y - 40 };
}

/** Where `side`'s dice sit: the bottom player's in the home half, the other's in the outer half. */
export function diceCenter(g: Geo, side: Side): XY {
  const home = RIGHT_X + 3 * PT_W;
  const outer = LEFT_X + 3 * PT_W;
  return { x: mx(g, side === g.view ? home : outer), y: MID_Y };
}

/** Top checker of an origin (where a move starts). */
export function originXY(g: Geo, b: Board, side: Side, o: Origin): XY {
  if (o === 'bar') {
    const n = b.bar[side];
    return barChecker(g, side, Math.max(n - 1, 0), Math.max(n, 1));
  }
  const n = Math.abs(b.pts[o]);
  return pointChecker(g, o, Math.max(n - 1, 0), Math.max(n, 1));
}

/** Where a checker of `side` lands on `t` (on top of its own, or on the blot it hits). */
export function landingXY(g: Geo, b: Board, side: Side, t: Target): XY {
  if (t === 'off') return offSlab(g, side, b.off[side]);
  const mine = countAt(b, side, t);
  return pointChecker(g, t, mine, Math.max(mine + 1, 1));
}

/** Stable keys for rendering and animation. */
export function pointKey(a: number, side: Side, i: number): string {
  return `p${a}:${side}:${i}`;
}
export function barKey(side: Side, i: number): string {
  return `bar${side}:${i}`;
}
export function offKey(side: Side, i: number): string {
  return `off${side}:${i}`;
}

/** Key of the top checker of `side` at a location on board b (after a move landed there). */
export function topKey(b: Board, side: Side, loc: Origin | Target): string {
  if (loc === 'bar') return barKey(side, b.bar[side] - 1);
  if (loc === 'off') return offKey(side, b.off[side] - 1);
  return pointKey(loc, side, countAt(b, side, loc) - 1);
}
