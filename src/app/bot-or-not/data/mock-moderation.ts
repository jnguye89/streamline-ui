/**
 * Stand-in for the Phase 2 moderation service (word list + Haiku check, server-side).
 * Only here so the preview can show the "Try another answer" flow: with family mode on,
 * these mild words are blocked. The real list and the slur list arrive in Phase 2.
 */
export interface Moderator {
  /** true = OK to show on the TV. */
  allows(text: string, familyMode: boolean): boolean;
}

const FAMILY_WORDS = ['damn', 'crap', 'hell'];
const ALWAYS_BLOCKED: string[] = [];

export class MockModerator implements Moderator {
  allows(text: string, familyMode: boolean): boolean {
    const words = text.toLowerCase().split(/[^a-z']+/);
    if (words.some((w) => ALWAYS_BLOCKED.includes(w))) return false;
    if (familyMode && words.some((w) => FAMILY_WORDS.includes(w))) return false;
    return true;
  }
}
