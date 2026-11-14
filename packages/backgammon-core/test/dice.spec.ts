import { FairDice, commitmentOf, deriveRoll, randomHex, verifyLedger } from '../src';

const SEED = '7f'.repeat(32);

describe('fair dice', () => {
  it('is deterministic for the same seeds and k', () => {
    expect(deriveRoll(SEED, ['a', 'b'], 7)).toEqual(deriveRoll(SEED, ['a', 'b'], 7));
    expect(deriveRoll(SEED, ['a', 'b'], 7)).not.toEqual(deriveRoll(SEED, ['a', 'c'], 7));
  });

  it('only produces 1–6', () => {
    for (let k = 0; k < 2000; k++) {
      for (const d of deriveRoll(SEED, ['x'], k)) {
        expect(d).toBeGreaterThanOrEqual(1);
        expect(d).toBeLessThanOrEqual(6);
      }
    }
  });

  it('hides the seed until reveal, then every roll verifies', () => {
    const dice = new FairDice(randomHex(), [randomHex(16)]);
    for (let i = 0; i < 40; i++) dice.roll();
    const hidden = dice.ledger();
    expect(hidden.serverSeed).toBeNull();
    expect(verifyLedger(hidden).revealed).toBe(false);
    dice.reveal();
    const check = verifyLedger(dice.ledger());
    expect(check).toEqual(jasmine.objectContaining({ revealed: true, commitmentOk: true, rollsOk: true, checked: 40, firstMismatch: null }));
  });

  it('catches a changed roll or a swapped seed', () => {
    const dice = new FairDice(SEED, ['c']);
    for (let i = 0; i < 10; i++) dice.roll();
    dice.reveal();
    const ledger = dice.ledger();
    const r3 = ledger.rolls[3];
    const tampered = {
      ...ledger,
      rolls: ledger.rolls.map((r) => (r.k === 3 ? { k: 3, dice: [r3.dice[0] === 6 ? 1 : 6, r3.dice[1]] as const } : r)),
    };
    expect(verifyLedger(tampered).firstMismatch).toBe(3);
    expect(verifyLedger({ ...ledger, serverSeed: '00'.repeat(32) }).commitmentOk).toBe(false);
    expect(commitmentOf(SEED)).toBe(ledger.commitment);
  });
});
