import { Pipe, PipeTransform } from '@angular/core';

// Curated for legibility over a dark video overlay (avoid near-black/near-white).
const CHAT_COLORS = [
  '#ff6b6b', '#feca57', '#1dd1a1', '#54a0ff', '#a29bfe',
  '#ff9ff3', '#00d2d3', '#ff9f43', '#48dbfb', '#f368e0',
  '#7bed9f', '#ffa8a8',
];

// Deterministic username color per chat participant - same id always maps
// to the same color so a user's messages stay visually consistent.
@Pipe({
  name: 'chatColor',
  standalone: true,
})
export class ChatColorPipe implements PipeTransform {
  transform(id: string | null | undefined): string {
    if (!id) return CHAT_COLORS[0];

    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = (hash * 31 + id.charCodeAt(i)) | 0;
    }
    return CHAT_COLORS[Math.abs(hash) % CHAT_COLORS.length];
  }
}
