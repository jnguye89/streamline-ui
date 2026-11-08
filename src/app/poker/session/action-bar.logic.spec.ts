import { LegalActions } from '../core/api';
import { buttonIds, buttons, initialState, reduceBar, reducePre } from './action-bar.logic';

/** Facing a bet of 40 into a pot of 100 (big blind 10, stack 1,000). */
const facing: LegalActions = {
  fold: true,
  check: false,
  call: { amount: 40, allIn: false },
  bet: null,
  raise: { minTo: 80, maxTo: 1000 },
  allIn: { to: 1000 },
  step: 10,
  presets: [
    { id: 'min', to: 80 },
    { id: 'halfPot', to: 130 },
    { id: 'threeQuarterPot', to: 175 },
    { id: 'pot', to: 220 },
    { id: 'allIn', to: 1000 },
  ],
  defaultFocus: 'call',
};

/** Checked to you on the flop. */
const free: LegalActions = {
  fold: true,
  check: true,
  call: null,
  bet: { minTo: 10, maxTo: 1000 },
  raise: null,
  allIn: { to: 1000 },
  step: 10,
  presets: [
    { id: 'min', to: 10 },
    { id: 'halfPot', to: 50 },
    { id: 'threeQuarterPot', to: 75 },
    { id: 'pot', to: 100 },
    { id: 'allIn', to: 1000 },
  ],
  defaultFocus: 'check',
};

/** Short all-in in front of you after you already acted: call or fold only. */
const notReopened: LegalActions = {
  ...facing,
  raise: null,
  allIn: null,
  presets: [],
};

describe('action bar', () => {
  it('shows only legal actions', () => {
    expect(buttonIds(facing)).toEqual(['fold', 'call', 'raise', 'allIn']);
    expect(buttonIds(free)).toEqual(['fold', 'check', 'bet', 'allIn']);
    expect(buttonIds(notReopened)).toEqual(['fold', 'call']);
  });

  it('default focus is Call when facing a bet, Check when free, never Fold', () => {
    expect(initialState(facing).focus).toBe('call');
    expect(initialState(free).focus).toBe('check');
    expect(initialState(notReopened).focus).toBe('call');
  });

  it('Fold while Check is free asks "Check instead?": A checks, B folds anyway', () => {
    let s = reduceBar(free, initialState(free), 'left').state;
    expect(s.focus).toBe('fold');
    const asked = reduceBar(free, s, 'select');
    expect(asked.intent).toBeNull();
    expect(asked.state.confirm).toBe('checkInstead');
    expect(reduceBar(free, asked.state, 'select').intent).toEqual({ type: 'check' });
    expect(reduceBar(free, asked.state, 'back').intent).toEqual({ type: 'fold' });
    s = reduceBar(facing, reduceBar(facing, initialState(facing), 'left').state, 'select').state;
    expect(reduceBar(facing, { ...s, confirm: null, focus: 'fold' }, 'select').intent).toEqual({ type: 'fold' });
  });

  it('▲▼ step one big blind, clamped to the minimum raise and all-in', () => {
    let s = reduceBar(facing, initialState(facing), 'right').state;
    expect(s).toEqual({ focus: 'raise', sizingTo: 80, confirm: null });
    expect(buttons(facing, s).find((b) => b.id === 'raise')!.label).toBe('Raise to 80');
    s = reduceBar(facing, s, 'up').state;
    expect(s.sizingTo).toBe(90);
    s = reduceBar(facing, reduceBar(facing, s, 'down').state, 'down').state;
    expect(s.sizingTo).toBe(80);
  });

  it('LT/RT jump presets: min · ½ pot · ¾ pot · pot · all-in', () => {
    let s = initialState(facing);
    s = reduceBar(facing, s, 'rt').state; // opens sizing and jumps to ½ pot
    expect(s).toEqual({ focus: 'raise', sizingTo: 130, confirm: null });
    s = reduceBar(facing, s, 'rt').state;
    expect(s.sizingTo).toBe(175);
    s = reduceBar(facing, s, 'rt').state;
    expect(s.sizingTo).toBe(220);
    s = reduceBar(facing, s, 'rt').state;
    expect(s.sizingTo).toBe(1000);
    s = reduceBar(facing, s, 'lt').state;
    expect(s.sizingTo).toBe(220);
    expect(reduceBar(facing, s, 'select').intent).toEqual({ type: 'raise', to: 220 });
  });

  it('B backs out of sizing to the default button; B elsewhere never folds', () => {
    const open = reduceBar(facing, reduceBar(facing, initialState(facing), 'rt').state, 'rt').state;
    const back = reduceBar(facing, open, 'back');
    expect(back.intent).toBeNull();
    expect(back.state).toEqual(initialState(facing));
    expect(reduceBar(facing, initialState(facing), 'back').intent).toBeNull();
    const onFold = reduceBar(facing, initialState(facing), 'left').state;
    expect(reduceBar(facing, onFold, 'back').intent).toBeNull();
  });

  it('raising to the whole stack is sent as all-in', () => {
    let s = reduceBar(facing, initialState(facing), 'rt').state;
    for (let i = 0; i < 6; i++) s = reduceBar(facing, s, 'rt').state;
    expect(reduceBar(facing, s, 'select').intent).toEqual({ type: 'allIn' });
  });

  it('pre-actions toggle with A and clear with B', () => {
    const opts = ['checkFold', 'check', 'callAny'] as const;
    expect(reducePre(opts, null, 0, 'select').set).toBe('checkFold');
    expect(reducePre(opts, 'checkFold', 0, 'select').set).toBeNull();
    expect(reducePre(opts, null, 0, 'right').focus).toBe(1);
    expect(reducePre(opts, 'callAny', 2, 'back').set).toBeNull();
  });
});
