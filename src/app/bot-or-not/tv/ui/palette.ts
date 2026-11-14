/** Avatar colors for humans: calm, readable on black, none of them indigo (indigo = the bot). */
export const AVATAR_COLORS: readonly string[] = [
  '#F4A08E', // coral
  '#86D7AE', // mint
  '#8EC2F4', // sky
  '#F2CB75', // amber
  '#EBA9D6', // pink
  '#9FD9E0', // teal
  '#D2C1A6', // sand
  '#BFCB82', // olive
];

export const BOT_COLOR = '#4F46E5';

export function avatarColor(hue: number): string {
  return hue < 0 ? BOT_COLOR : AVATAR_COLORS[hue % AVATAR_COLORS.length];
}
