import { MAX_ANSWER_CHARS, MAX_NAME_CHARS } from './settings';

/** Characters as people count them (an emoji is one). */
export function charCount(text: string): number {
  return Array.from(text).length;
}

/**
 * The one trim every card gets, human or bot: outer spaces removed, inner runs of spaces and
 * line breaks collapsed to one space, cut to 80 characters. Nothing else is touched.
 */
export function normalizeAnswer(raw: string): string {
  const clean = raw.replace(/\s+/g, ' ').trim();
  return Array.from(clean).slice(0, MAX_ANSWER_CHARS).join('');
}

export function normalizeName(raw: string): string {
  const clean = raw.replace(/\s+/g, ' ').trim();
  return Array.from(clean).slice(0, MAX_NAME_CHARS).join('');
}

/** First letter for an avatar. */
export function initial(name: string): string {
  return (Array.from(name.trim())[0] ?? '?').toUpperCase();
}
