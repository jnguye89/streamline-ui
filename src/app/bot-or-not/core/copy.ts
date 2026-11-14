import { JoinError, PointLine, Verdict } from './types';

/** Every line of game copy in one place. Short, playful, human. Never the word "guide". */
export const COPY = {
  title: 'Bot or Not',
  lobbyLead: 'Answer on your phone. One answer is the bot. Find it.',
  scanToJoin: 'Scan to join',
  orGoTo: 'or go to',
  start: 'Start',
  settings: 'Settings',
  needMore: (n: number) => `Need ${n} more`,
  playersIn: (n: number) => `${n} ${n === 1 ? 'player' : 'players'} in`,
  botTile: 'the bot',
  round: (n: number, of: number) => `Round ${n} of ${of}`,
  lastRound: 'Last round. Double points.',
  answerOnPhone: 'Answer on your phone.',
  answersIn: (n: number, of: number) => `${n} of ${of} in`,
  revealTitle: 'One of these is the bot.',
  voteTitle: 'Find the bot.',
  voteOnPhone: 'Vote on your phone.',
  votesIn: (n: number, of: number) => `Votes in ${n} of ${of}`,
  thisWasTheBot: 'This was the bot.',
  hiddenByHost: 'Hidden by host',
  doublePoints: 'Double points.',
  notEnough: 'Not enough answers.',
  newPrompt: 'New prompt coming.',
  skipping: 'Skipping this round.',
  paused: 'Paused',
  live: 'LIVE',
  playAgain: 'Play again',
  backToLobby: 'Back to lobby',
  finalTitle: 'Final scores',
  botWon: 'The bot won. Awkward.',
  wins: (names: string[]) =>
    names.length === 1 ? `${names[0]} wins.` : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} tie.`,
  hideHint: 'Pick a card to hide.',
  lockedWhileLive: 'Locked while live',
} as const;

export const VERDICT_COPY: Record<Verdict, string> = {
  busted: 'Busted.',
  'got-away': 'The bot got away.',
  'both-busted': 'Both busted.',
  'one-got-away': 'One got away.',
  'both-got-away': 'Both got away.',
};

export const JOIN_ERROR_COPY: Record<JoinError, string> = {
  'no-room': 'Check the code.',
  'name-empty': 'Add your name.',
  'name-taken': 'That name’s taken.',
  'name-blocked': 'Pick another name.',
  'room-full': 'Room’s full. 8 players max.',
};

/** The one line a phone shows under its round points. */
export function phoneRoundLine(line: PointLine | undefined, voted: boolean, hadCard: boolean): string {
  if (!line) return 'Sitting this one out.';
  const caught = line.reasons.includes('caught');
  if (line.reasons.includes('fooled')) {
    const n = line.fooledCount;
    return caught ? `Caught the bot and fooled ${n}.` : `You fooled ${n} ${n === 1 ? 'person' : 'people'}.`;
  }
  if (caught && line.reasons.includes('clearly-human')) return 'Caught the bot. Nobody suspects you.';
  if (caught) return 'You caught the bot.';
  if (line.reasons.includes('clearly-human')) return 'Nobody suspects you. Suspicious.';
  if (!hadCard && !voted) return 'No answer, no vote.';
  if (!voted) return 'No vote this round.';
  return 'The bot fooled you.';
}

export function placeLabel(place: number): string {
  const mod100 = place % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][place % 10] ?? 'th';
  return `${place}${suffix}`;
}
