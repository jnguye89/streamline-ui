import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { DiceLedger, DiceRoll, Die } from './types';

/**
 * Provably fair dice.
 *
 *  - Before the match the server publishes commitment = SHA-256(serverSeed).
 *  - Each client sends a clientSeed.
 *  - Roll k = HMAC-SHA256(key = serverSeed, message = clientSeeds joined by "|" + "|" + k).
 *    Bytes are read in order; a byte ≥ 252 is rejected (252 = 6 × 42, so no modulo bias);
 *    die = byte mod 6 + 1. If 32 bytes run out, the next block uses message + "#1", "#2", …
 *  - The opening roll uses the same stream: first die = side 0, second die = side 1.
 *  - After the match the server reveals serverSeed and anyone can recompute every roll.
 *
 * Offline (vs computer, couch) the box makes both seeds with crypto.getRandomValues and
 * runs the exact same code.
 */

const LIMIT = 252;

export function commitmentOf(serverSeedHex: string): string {
  return bytesToHex(sha256(hexToBytes(serverSeedHex)));
}

/** Roll k for these seeds: [first die, second die]. Pure and deterministic. */
export function deriveRoll(serverSeedHex: string, clientSeeds: readonly string[], k: number): readonly [Die, Die] {
  const key = hexToBytes(serverSeedHex);
  const message = [...clientSeeds, String(k)].join('|');
  const out: Die[] = [];
  for (let block = 0; out.length < 2; block++) {
    const m = block === 0 ? message : `${message}#${block}`;
    for (const b of hmac(sha256, key, utf8ToBytes(m))) {
      if (b >= LIMIT) continue;
      out.push(((b % 6) + 1) as Die);
      if (out.length === 2) break;
    }
  }
  return [out[0], out[1]];
}

const newBytes = (n: number) => new Uint8Array(n);
/** A plain byte buffer (typed this way so it compiles on TypeScript 5.4 and 6). */
export type ByteBuffer = ReturnType<typeof newBytes>;

/** Random hex from a byte filler (defaults to crypto.getRandomValues). */
export function randomHex(
  bytes = 32,
  fill: (buf: ByteBuffer) => void = (buf) => {
    globalThis.crypto.getRandomValues(buf);
  },
): string {
  const buf = newBytes(bytes);
  fill(buf);
  return bytesToHex(buf);
}

export interface DiceSource {
  roll(): readonly [Die, Die];
  ledger(): DiceLedger;
  /** Publishes the server seed (after the match). */
  reveal(): void;
}

export class FairDice implements DiceSource {
  private k = 0;
  private revealed = false;
  private readonly rolls: DiceRoll[] = [];
  private readonly commitment: string;

  constructor(
    private readonly serverSeedHex: string,
    private readonly clientSeeds: readonly string[],
  ) {
    this.commitment = commitmentOf(serverSeedHex);
  }

  roll(): readonly [Die, Die] {
    const dice = deriveRoll(this.serverSeedHex, this.clientSeeds, this.k);
    this.rolls.push({ k: this.k, dice });
    this.k++;
    return dice;
  }

  ledger(): DiceLedger {
    return {
      commitment: this.commitment,
      serverSeed: this.revealed ? this.serverSeedHex : null,
      clientSeeds: [...this.clientSeeds],
      rolls: [...this.rolls],
    };
  }

  reveal(): void {
    this.revealed = true;
  }
}

export interface DiceCheck {
  /** False until the server seed is revealed. */
  readonly revealed: boolean;
  /** SHA-256(serverSeed) equals the published commitment. */
  readonly commitmentOk: boolean;
  /** Every roll recomputes to the same dice. */
  readonly rollsOk: boolean;
  readonly checked: number;
  /** k of the first roll that doesn't match, or null. */
  readonly firstMismatch: number | null;
}

/** Recomputes every roll from the revealed seeds ("Verify dice"). */
export function verifyLedger(ledger: DiceLedger): DiceCheck {
  if (ledger.serverSeed === null) {
    return { revealed: false, commitmentOk: false, rollsOk: false, checked: 0, firstMismatch: null };
  }
  const commitmentOk = commitmentOf(ledger.serverSeed) === ledger.commitment;
  let firstMismatch: number | null = null;
  for (const r of ledger.rolls) {
    const d = deriveRoll(ledger.serverSeed, ledger.clientSeeds, r.k);
    if (d[0] !== r.dice[0] || d[1] !== r.dice[1]) {
      firstMismatch = r.k;
      break;
    }
  }
  return {
    revealed: true,
    commitmentOk,
    rollsOk: firstMismatch === null,
    checked: ledger.rolls.length,
    firstMismatch,
  };
}
