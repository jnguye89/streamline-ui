import { LegalActions, PlayerAction, PreAction, SizePresetId } from '../core/api';
import { chips } from '../core/cards';

/**
 * Action bar rules (pure, no Angular), so the "no misclicks" rules are unit-tested:
 *  - only legal actions show: [Fold] [Check | Call N] [Bet | Raise to N] [All-in]
 *  - default focus = Check when free, otherwise Call. Never Fold.
 *  - Fold while Check is free asks "Check instead?" (A = check, B = fold anyway)
 *  - on Bet/Raise: ▲▼ step 1 big blind, LT/RT jump presets (min · ½ · ¾ · pot · all-in), A confirms, B backs out
 */

export type ActionButtonId = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allIn';
export type BarInput = 'left' | 'right' | 'up' | 'down' | 'lt' | 'rt' | 'select' | 'back';

export interface ActionBarState {
  readonly focus: ActionButtonId;
  /** Bet/raise-to amount while sizing; null when the sizing button isn't focused. */
  readonly sizingTo: number | null;
  readonly confirm: 'checkInstead' | null;
}

export interface ActionButton {
  readonly id: ActionButtonId;
  readonly label: string;
  readonly primary: boolean;
}

export interface BarResult {
  readonly state: ActionBarState;
  readonly intent: PlayerAction | null;
}

export const PRESET_LABEL: Record<SizePresetId, string> = {
  min: 'Min',
  halfPot: '½ pot',
  threeQuarterPot: '¾ pot',
  pot: 'Pot',
  allIn: 'All-in',
};

export function buttonIds(legal: LegalActions): ActionButtonId[] {
  const ids: ActionButtonId[] = ['fold'];
  if (legal.check) ids.push('check');
  else if (legal.call) ids.push('call');
  if (legal.bet) ids.push('bet');
  else if (legal.raise) ids.push('raise');
  if (legal.allIn) ids.push('allIn');
  return ids;
}

function sizingRange(legal: LegalActions): { minTo: number; maxTo: number } | null {
  return legal.bet ?? legal.raise;
}

export function initialState(legal: LegalActions): ActionBarState {
  return { focus: legal.defaultFocus, sizingTo: null, confirm: null };
}

export function buttons(legal: LegalActions, state: ActionBarState): ActionButton[] {
  return buttonIds(legal).map((id) => {
    switch (id) {
      case 'fold':
        return { id, label: 'Fold', primary: false };
      case 'check':
        return { id, label: 'Check', primary: true };
      case 'call':
        return { id, label: legal.call!.allIn ? `Call ${chips(legal.call!.amount)} · all-in` : `Call ${chips(legal.call!.amount)}`, primary: true };
      case 'bet':
      case 'raise': {
        const to = state.focus === id && state.sizingTo !== null ? state.sizingTo : sizingRange(legal)!.minTo;
        return { id, label: `${id === 'bet' ? 'Bet' : 'Raise to'} ${chips(to)}`, primary: false };
      }
      case 'allIn':
        return { id, label: 'All-in', primary: false };
    }
  });
}

/** Index of the preset matching the current amount, or null between presets. */
export function presetIndex(legal: LegalActions, to: number | null): number | null {
  if (to === null) return null;
  const i = legal.presets.findIndex((p) => p.to === to);
  return i === -1 ? null : i;
}

function isSizing(id: ActionButtonId): boolean {
  return id === 'bet' || id === 'raise';
}

function focusOn(legal: LegalActions, state: ActionBarState, id: ActionButtonId): ActionBarState {
  if (isSizing(id)) {
    const range = sizingRange(legal)!;
    return { focus: id, sizingTo: state.focus === id && state.sizingTo !== null ? state.sizingTo : range.minTo, confirm: null };
  }
  return { focus: id, sizingTo: null, confirm: null };
}

function jumpPreset(legal: LegalActions, current: number, dir: 1 | -1): number {
  const tos = legal.presets.map((p) => p.to);
  if (!tos.length) return current;
  if (dir > 0) return tos.find((t) => t > current) ?? tos[tos.length - 1]!;
  return [...tos].reverse().find((t) => t < current) ?? tos[0]!;
}

function commit(legal: LegalActions, id: ActionButtonId, sizingTo: number | null): PlayerAction {
  switch (id) {
    case 'fold':
      return { type: 'fold' };
    case 'check':
      return { type: 'check' };
    case 'call':
      return { type: 'call' };
    case 'allIn':
      return { type: 'allIn' };
    case 'bet':
    case 'raise': {
      const range = sizingRange(legal)!;
      const to = sizingTo ?? range.minTo;
      if (legal.allIn && to >= legal.allIn.to) return { type: 'allIn' };
      return id === 'bet' ? { type: 'bet', to } : { type: 'raise', to };
    }
  }
}

export function reduceBar(legal: LegalActions, state: ActionBarState, input: BarInput): BarResult {
  const ids = buttonIds(legal);
  const stay = (s: ActionBarState = state): BarResult => ({ state: s, intent: null });

  if (state.confirm === 'checkInstead') {
    if (input === 'select') return { state: initialState(legal), intent: { type: 'check' } };
    if (input === 'back') return { state: initialState(legal), intent: { type: 'fold' } };
    return stay();
  }

  const idx = Math.max(0, ids.indexOf(state.focus));
  const range = sizingRange(legal);
  switch (input) {
    case 'left':
    case 'right': {
      const next = ids[Math.min(ids.length - 1, Math.max(0, idx + (input === 'right' ? 1 : -1)))]!;
      return stay(focusOn(legal, state, next));
    }
    case 'up':
    case 'down': {
      if (!isSizing(state.focus) || !range || state.sizingTo === null) return stay();
      const to = Math.min(range.maxTo, Math.max(range.minTo, state.sizingTo + (input === 'up' ? legal.step : -legal.step)));
      return stay({ ...state, sizingTo: to });
    }
    case 'lt':
    case 'rt': {
      const sizingId = ids.find(isSizing);
      if (!sizingId || !range) return stay();
      const opened = focusOn(legal, state, sizingId);
      const wasOpen = isSizing(state.focus) && state.sizingTo !== null;
      // First press from another button opens sizing at the minimum; RT then keeps climbing.
      const from = opened.sizingTo ?? range.minTo;
      const to = wasOpen || input === 'rt' ? jumpPreset(legal, from, input === 'rt' ? 1 : -1) : from;
      return stay({ ...opened, sizingTo: wasOpen || input === 'rt' ? to : from });
    }
    case 'select':
      if (state.focus === 'fold' && legal.check) return stay({ ...state, confirm: 'checkInstead' });
      return { state: initialState(legal), intent: commit(legal, state.focus, state.sizingTo) };
    case 'back':
      // B backs out of sizing. Anywhere else it does nothing: B never folds by accident.
      if (isSizing(state.focus)) return stay(initialState(legal));
      return stay();
  }
}

// ─────────────── Pre-actions (while waiting for your turn) ───────────────

export const PRE_LABEL: Record<PreAction, string> = {
  checkFold: 'Check/Fold',
  check: 'Check',
  callAny: 'Call any',
};

export interface PreBarResult {
  readonly focus: number;
  readonly set: PreAction | null | undefined;
}

/** D-pad moves, A toggles. Returns `set` = undefined when nothing changes. */
export function reducePre(
  options: readonly PreAction[],
  current: PreAction | null,
  focus: number,
  input: BarInput,
): PreBarResult {
  const f = Math.min(Math.max(0, focus), Math.max(0, options.length - 1));
  switch (input) {
    case 'left':
      return { focus: Math.max(0, f - 1), set: undefined };
    case 'right':
      return { focus: Math.min(options.length - 1, f + 1), set: undefined };
    case 'select': {
      const opt = options[f];
      if (!opt) return { focus: f, set: undefined };
      return { focus: f, set: current === opt ? null : opt };
    }
    case 'back':
      return { focus: f, set: current ? null : undefined };
    default:
      return { focus: f, set: undefined };
  }
}
