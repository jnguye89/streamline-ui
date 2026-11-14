import { PointLine, PointReason, ScoringMode, Standing, Verdict } from './types';

export const POINTS = {
  caught: 200,
  clearlyHuman: 50,
  fooledPerVote: 100,
  botPerHuman: 100,
} as const;

export interface ScoringCard {
  readonly cardId: string;
  readonly authorId: string;
  readonly isBot: boolean;
}

export interface ScoringInput {
  readonly mode: ScoringMode;
  /** Last round: every point counts double. */
  readonly double: boolean;
  readonly cards: readonly ScoringCard[];
  /** voterId → cardId. Humans only; no vote = no entry. */
  readonly votes: ReadonlyMap<string, string>;
  /** Humans playing this round (with or without a card). */
  readonly humanIds: readonly string[];
  readonly botIds: readonly string[];
}

/**
 * One round of points.
 *  Classic: vote for a bot +200 · nobody votes for your card +50.
 *  Bluff:   vote for a bot +200 · +100 per vote your card gets.
 *  Both:    each bot +100 per human who voted for another card (non-voters don't count).
 *  Last round doubles everything. With 2 bots, voting for either counts and each bot scores on its own.
 */
export function scoreRound(input: ScoringInput): PointLine[] {
  const byId = new Map(input.cards.map((c) => [c.cardId, c]));
  const votesFor = new Map<string, number>();
  for (const cardId of input.votes.values()) votesFor.set(cardId, (votesFor.get(cardId) ?? 0) + 1);
  const mult = input.double ? 2 : 1;
  const lines: PointLine[] = [];

  for (const id of input.humanIds) {
    let points = 0;
    let fooledCount = 0;
    const reasons: PointReason[] = [];
    const voted = input.votes.get(id);
    if (voted && byId.get(voted)?.isBot) {
      points += POINTS.caught;
      reasons.push('caught');
    }
    const own = input.cards.find((c) => c.authorId === id);
    if (own) {
      const got = votesFor.get(own.cardId) ?? 0;
      if (input.mode === 'classic' && got === 0) {
        points += POINTS.clearlyHuman;
        reasons.push('clearly-human');
      }
      if (input.mode === 'bluff' && got > 0) {
        points += POINTS.fooledPerVote * got;
        fooledCount = got;
        reasons.push('fooled');
      }
    }
    lines.push({ playerId: id, points: points * mult, reasons, fooledCount });
  }

  for (const id of input.botIds) {
    const own = input.cards.find((c) => c.authorId === id);
    let fooled = 0;
    for (const [voter, cardId] of input.votes) {
      if (input.humanIds.includes(voter) && (!own || cardId !== own.cardId)) fooled++;
    }
    lines.push({
      playerId: id,
      points: fooled * POINTS.botPerHuman * mult,
      reasons: fooled > 0 ? ['bot-fooled'] : [],
      fooledCount: fooled,
    });
  }
  return lines;
}

/** "Busted." when a bot has the most votes (a tie at the top counts); 0 votes is never busted. */
export function verdictFor(cards: readonly ScoringCard[], votes: ReadonlyMap<string, string>): Verdict {
  const counts = new Map<string, number>();
  for (const cardId of votes.values()) counts.set(cardId, (counts.get(cardId) ?? 0) + 1);
  const top = Math.max(0, ...cards.map((c) => counts.get(c.cardId) ?? 0));
  const bots = cards.filter((c) => c.isBot);
  const busted = bots.filter((b) => {
    const n = counts.get(b.cardId) ?? 0;
    return n > 0 && n === top;
  }).length;
  if (bots.length <= 1) return busted ? 'busted' : 'got-away';
  if (busted === bots.length) return 'both-busted';
  return busted ? 'one-got-away' : 'both-got-away';
}

/** Highest first; ties share the place (1, 1, 3). */
export function standings(players: ReadonlyArray<{ id: string; score: number; name: string }>): Standing[] {
  const sorted = [...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return sorted.map((p) => ({
    playerId: p.id,
    score: p.score,
    place: 1 + sorted.filter((q) => q.score > p.score).length,
  }));
}
