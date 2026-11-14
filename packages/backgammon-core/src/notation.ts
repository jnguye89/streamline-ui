import { own } from './board';
import { Side, Step } from './types';

// Standard backgammon notation, in the mover's own numbering:
//   24/18 13/11 · bar/22* · 6/off · 8/5(2) · 13/10*/7 (a hit on the way is shown at that point).
// Steps by the same checker are joined into one path. Moves are listed from the highest start point.
export function playNotation(side: Side, steps: readonly Step[]): string {
  interface Path {
    readonly start: number;
    readonly segs: { to: number; hit: boolean }[];
  }
  const paths: Path[] = [];
  for (const st of steps) {
    const from = st.from === 'bar' ? 25 : own(side, st.from);
    const to = st.to === 'off' ? 0 : own(side, st.to);
    let path: Path | undefined;
    if (from !== 25) {
      for (let i = paths.length - 1; i >= 0; i--) {
        const segs = paths[i].segs;
        if (segs[segs.length - 1].to === from) {
          path = paths[i];
          break;
        }
      }
    }
    if (path) path.segs.push({ to, hit: st.hit });
    else paths.push({ start: from, segs: [{ to, hit: st.hit }] });
  }

  const label = (p: number) => (p === 25 ? 'bar' : p === 0 ? 'off' : String(p));
  const texts = paths
    .map((p) => {
      let s = label(p.start);
      p.segs.forEach((seg, i) => {
        if (seg.hit || i === p.segs.length - 1) s += `/${label(seg.to)}${seg.hit ? '*' : ''}`;
      });
      return { start: p.start, text: s };
    })
    .sort((a, b) => b.start - a.start || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0));

  const out: string[] = [];
  for (let i = 0; i < texts.length; ) {
    let n = 1;
    while (i + n < texts.length && texts[i + n].text === texts[i].text) n++;
    out.push(n > 1 ? `${texts[i].text}(${n})` : texts[i].text);
    i += n;
  }
  return out.join(' ');
}

/** Dice as written in a move list: "64", "33". */
export function diceText(dice: readonly number[]): string {
  return dice.join('');
}
