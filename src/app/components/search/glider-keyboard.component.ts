import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, Output } from '@angular/core';
import { FormControl } from '@angular/forms';

const LAYOUT = [
  { keys: ['U','Y','W','G','B'],         stagger: 1.0 },
  { keys: ['O','I','N','T','H','C'],     stagger: 0.5 },
  { keys: ['E','A','R','S','L','D','M'], stagger: 0.0 },
  { keys: ['P','F','V','K','J','X'],     stagger: 0.5 },
  { keys: ['Q','Z','.','@','_'],         stagger: 1.0 },
];

// Optional numbers/symbols layer (enabled via [symbols]="true", toggled with
// the 123/ABC key on the action row). Same row lengths and staggers as
// LAYOUT so grid navigation and the glider's proximity math behave the
// same on both layers - only the key values change. Meant for fields that
// aren't prose (stream keys, RTMP URLs) and need digits and : / - etc.
const SYMBOL_LAYOUT = [
  { keys: ['1','2','3','4','5'],         stagger: 1.0 },
  { keys: ['6','7','8','9','0','-'],     stagger: 0.5 },
  { keys: [':','/','?','=','&','#','+'], stagger: 0.0 },
  { keys: ['!','%','~',',',';','$'],     stagger: 0.5 },
  { keys: ['.','_','(',')','*'],         stagger: 1.0 },
];

const CAPS_ROW   = 4;
const NUM_ROWS   = LAYOUT.length;
const ACTION_ROW = NUM_ROWS; // 5

const BIGRAMS: Record<string, string[]> = {
  a:['n','r','t','l','s','i','c','d','y','b','m'],
  b:['e','o','a','u','l','r','i'],
  c:['o','h','e','a','k','l','i','u'],
  d:['e','i','o','a','s','u','r','y'],
  e:['r','s','n','d','a','l','c','t','i','m'],
  f:['o','e','a','i','u','r','l'],
  g:['e','h','r','o','a','i','u'],
  h:['e','a','i','o','u','r','t'],
  i:['n','t','s','o','c','r','l','a','e'],
  j:['u','o','a','e'],
  k:['e','i','n','s','l'],
  l:['e','i','a','o','d','y','t','s'],
  m:['a','e','o','i','u','p','s'],
  n:['t','e','d','g','s','i','c','o'],
  o:['n','r','u','f','t','s','l','m','w'],
  p:['e','r','a','o','l','i','u','t'],
  q:['u'],
  r:['e','s','o','i','a','t','n','y'],
  s:['t','e','i','a','h','o','p','u','c'],
  t:['h','e','i','o','a','r','s','w'],
  u:['r','s','t','n','l','e','a','m'],
  v:['e','i','a','o','y'],
  w:['a','i','e','h','o','n'],
  x:['p','t','c','e','i'],
  y:['o','e','s','i','l'],
  z:['e','i','a','o'],
  ' ':['t','a','s','w','h','i','o','b','c','f'],
  '.':['c','w','t','a','s','h'],
};

const TRIGRAMS: Record<string, string[]> = {
  th:['e','i','a','o','r'], he:['r','n','a','l','s'],
  in:['g','e','t','s','c'], er:['e','s','i','a'],
  an:['d','t','y','s'],     re:['s','d','a','n','e'],
  on:['s','e','t','g'],     en:['t','s','d','c'],
  at:['e','i','o','h'],     es:['t','s','e','d'],
  nd:['s','i','e'],         to:['n','r','o','l'],
  or:['e','s','i','n'],     ea:['r','t','n','s','d'],
  ti:['o','n','m'],         it:['h','y','i','s'],
  st:['r','a','e','i'],     io:['n','s'],
  le:['s','d','r'],         is:['t','s','e'],
  ha:['t','v','s','n','r'], ou:['t','r','s','n'],
  ar:['e','s','t','d','y'], al:['l','s','e','o'],
  li:['n','t','k','v'],     co:['n','m','u','l'],
  se:['r','s','n','e','d'], de:['r','n','s','d'],
  hi:['s','n','m'],         ri:['n','t','g','s'],
  ro:['n','u','l','m'],     ne:['s','w','d','r'],
  wi:['t','n','l'],         fo:['r','u','n'],
  un:['t','d','s','e'],     si:['n','t','c','o'],
  ng:['s','e'],             la:['n','s','t'],
  ma:['n','t','k','y'],     me:['n','s','r'],
  tr:['a','e','i'],         no:['t','w'],
  wo:['r','n'],             ca:['n','r','l','s'],
  we:['r','l','a','n'],     ve:['r','d','s'],
  te:['r','s','d'],         gr:['e','a'],
};

@Component({
  standalone: true,
  selector: 'app-glider-keyboard',
  imports: [CommonModule],
  template: `
    <div class="gk-window">
      <div class="gk-strip">
        <span class="gk-strip-label">Word:</span>
        <span class="gk-word">{{ word || '—' }}</span>
        <div class="gk-likely-chips">
          <span class="gk-chip" *ngFor="let l of likelyChips">{{ l.toUpperCase() }}</span>
        </div>
        <span class="gk-glider-badge" [ngClass]="badgeClass">{{ badgeText }}</span>
      </div>

      <div class="gk-body">
        <div class="gk-row" *ngFor="let row of rows; let ri = index"
             [style.marginLeft.px]="row.stagger * 56">
          <div class="gk-key"
               *ngFor="let key of row.keys; let ci = index"
               [class.gk-focused]="cursor[0] === ri && cursor[1] === ci"
               [class.gk-likely]="isKeyLikely(ri, ci)"
               [class.gk-caps-active]="key === 'caps' && caps"
               (mousedown)="$event.preventDefault(); activateKey(ri, ci)"
               (touchstart)="$event.preventDefault(); activateKey(ri, ci)">
            {{ getLabel(key) }}
          </div>
        </div>

        <div class="gk-action-row" [class.gk-action-row--fit]="symbols || doneLabel">
          <div class="gk-key gk-key-sym" *ngIf="symbols"
               [class.gk-focused]="cursor[0] === ACTION_ROW && cursor[1] === actionCol('SYM')"
               (mousedown)="$event.preventDefault(); activateKey(ACTION_ROW, actionCol('SYM'))"
               (touchstart)="$event.preventDefault(); activateKey(ACTION_ROW, actionCol('SYM'))">
            {{ symMode ? 'ABC' : '123' }}
          </div>
          <div class="gk-key gk-key-done" *ngIf="doneLabel"
               [class.gk-focused]="cursor[0] === ACTION_ROW && cursor[1] === actionCol('DONE')"
               (mousedown)="$event.preventDefault(); activateKey(ACTION_ROW, actionCol('DONE'))"
               (touchstart)="$event.preventDefault(); activateKey(ACTION_ROW, actionCol('DONE'))">
            <span class="gk-done-check">&#10003;</span> {{ doneLabel }}
          </div>
          <div class="gk-key gk-key-space"
               [class.gk-focused]="cursor[0] === ACTION_ROW && cursor[1] === 0"
               (mousedown)="$event.preventDefault(); activateKey(ACTION_ROW, 0)"
               (touchstart)="$event.preventDefault(); activateKey(ACTION_ROW, 0)">
            SPACE
          </div>
          <div class="gk-key gk-key-del"
               [class.gk-focused]="cursor[0] === ACTION_ROW && cursor[1] === 1"
               (mousedown)="$event.preventDefault(); delDown()"
               (mouseup)="delUp()"
               (mouseleave)="delUp()"
               (touchstart)="$event.preventDefault(); delDown()"
               (touchend)="delUp()">
            DEL
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .gk-window {
      background: #1c1c1e;
      border-top: 1px solid rgba(255,255,255,0.07);
      border-radius: 0 0 14px 14px;
    }

    .gk-strip {
      display: flex;
      align-items: center;
      height: 26px;
      padding: 0 14px;
      gap: 6px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }

    .gk-strip-label { font-size: 10px; color: rgba(255,255,255,0.3); }

    .gk-word {
      font-size: 11px;
      font-weight: 700;
      color: rgba(255,255,255,0.7);
      min-width: 36px;
    }

    .gk-likely-chips { display: flex; gap: 2px; }

    .gk-chip {
      font-size: 9px;
      font-weight: 700;
      padding: 1px 5px;
      border-radius: 3px;
      background: rgba(39,174,96,0.18);
      color: #6eca8f;
    }

    .gk-glider-badge {
      margin-left: auto;
      font-size: 9px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 3px;
      letter-spacing: 0.4px;
    }

    .badge-on   { background: rgba(25,118,210,0.2); color: #64b5f6; }
    .badge-off  { background: rgba(198,40,40,0.2);  color: #ef9a9a; }
    .badge-skip { background: rgba(245,127,23,0.2); color: #ffd54f; }

    .gk-body {
      padding: 8px 10px 12px;
      width: fit-content;
      margin: 0 auto;
    }

    .gk-row { display: flex; margin-bottom: 4px; }
    .gk-row:last-child { margin-bottom: 0; }

    .gk-key {
      width: 52px;
      height: 44px;
      margin-right: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', Roboto, sans-serif;
      font-size: 15px;
      font-weight: 600;
      border-radius: 7px;
      border: 1px solid rgba(255,255,255,0.08);
      cursor: pointer;
      background: #2c2c2e;
      color: rgba(255,255,255,0.85);
      box-shadow: 0 2px 0 rgba(0,0,0,0.6);
      transition: background 0.07s, color 0.07s;
      flex-shrink: 0;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
    }

    .gk-key:active { box-shadow: none; transform: translateY(2px); }

    .gk-key.gk-focused {
      background: #0e52ff;
      color: #fff;
      border-color: #0a44d8;
      box-shadow: 0 2px 0 #0a2f9e, 0 0 10px rgba(14,82,255,0.5);
    }

    .gk-key.gk-likely {
      background: rgba(39,174,96,0.14);
      color: #6eca8f;
      border-color: rgba(39,174,96,0.28);
      box-shadow: 0 2px 0 rgba(0,0,0,0.4);
    }

    .gk-key.gk-caps-active {
      background: #7b1fa2;
      color: #fff;
      border-color: #6a1b9a;
      box-shadow: 0 2px 0 #4a148c;
    }

    .gk-action-row {
      display: flex;
      justify-content: center;
      gap: 12px;
      margin-top: 4px;
    }

    .gk-key-space {
      width: 150px;
      height: 44px;
      font-size: 11px;
      letter-spacing: 0.04em;
      background: #252527;
      border-color: rgba(255,255,255,0.06);
      box-shadow: 0 2px 0 rgba(0,0,0,0.5);
    }

    /* With the optional 123/DONE keys the action row would outgrow the letter
       grid and pull .gk-body (fit-content) wider, leaving the grid off-center.
       Size the four keys in key units so the row spans exactly the widest
       (7-key, 7 x 56px) letter row: SPACE/DONE = 2 keys, DEL/123 = 1.5. */
    .gk-action-row--fit {
      gap: 0;
      justify-content: flex-start;
    }
    .gk-action-row--fit .gk-key-space,
    .gk-action-row--fit .gk-key-done { width: 108px; }
    .gk-action-row--fit .gk-key-del,
    .gk-action-row--fit .gk-key-sym  { width: 80px; }

    .gk-key-sym {
      order: 3;
      width: 80px;
      height: 44px;
      font-size: 11px;
      letter-spacing: 0.04em;
      background: #252527;
      border-color: rgba(255,255,255,0.06);
      box-shadow: 0 2px 0 rgba(0,0,0,0.5);
    }

    .gk-key-done {
      order: 4;
      width: 110px;
      height: 44px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #fff;
      background: var(--c-primary, #0e52ff);
      border-color: transparent;
      box-shadow: 0 2px 0 rgba(0,0,0,0.5);
      gap: 6px;
    }

    .gk-done-check { font-size: 13px; }

    .gk-key-del {
      width: 110px;
      height: 44px;
      font-size: 11px;
      letter-spacing: 0.04em;
      background: #252527;
      border-color: rgba(255,255,255,0.06);
      box-shadow: 0 2px 0 rgba(0,0,0,0.5);
    }
  `]
})
export class GliderKeyboardComponent implements OnDestroy {
  @Input() control!: FormControl;
  // Shows the 123/ABC key on the action row (col 2) for switching to
  // SYMBOL_LAYOUT. Off by default so the search keyboards are unchanged.
  @Input() symbols = false;
  symMode = false;
  // When set, adds a confirm key with this label as the last key on the
  // action row; activating it emits (done) so the host dialog can close.
  @Input() doneLabel: string | null = null;
  @Output() done = new EventEmitter<void>();

  cursor = [2, 1]; // starts on 'A'
  word = '';
  likely = new Set<string>();
  caps = false;
  gActive = true;
  gDisabled = false;
  gLastDir: string | null = null;
  private delTimer: any = null;

  readonly ACTION_ROW = ACTION_ROW;

  private readonly letterRows = LAYOUT.map((row, ri) => {
    const keys = row.keys.map(k => k.toLowerCase());
    if (ri === CAPS_ROW) {
      // CAPS appended makes this a 6-key row; stagger 0.5 keeps its center aligned with the home row
      return { keys: [...keys, 'caps'], stagger: 0.5 };
    }
    return { keys, stagger: row.stagger };
  });
  private readonly symbolRows = SYMBOL_LAYOUT.map(row => ({ keys: [...row.keys], stagger: row.stagger }));

  get rows() {
    return this.symMode ? this.symbolRows : this.letterRows;
  }

  constructor(private cdr: ChangeDetectorRef) {}

  get likelyChips(): string[] {
    return [...this.likely].sort().slice(0, 6);
  }

  get badgeText(): string {
    if (this.gDisabled) return 'GLIDER OFF';
    if (this.gActive)   return 'GLIDER ON';
    return 'GLIDER SKIP';
  }

  get badgeClass(): string {
    if (this.gDisabled) return 'badge-off';
    if (this.gActive)   return 'badge-on';
    return 'badge-skip';
  }

  getLabel(key: string): string {
    if (key === 'caps') return '⇧';
    if (/^[a-z]$/.test(key)) return this.caps ? key.toUpperCase() : key;
    return key;
  }

  isKeyLikely(ri: number, ci: number): boolean {
    const val = this.keyValue(ri, ci);
    const focused = this.cursor[0] === ri && this.cursor[1] === ci;
    return !focused && val !== null && this.likely.has(val);
  }

  // Navigation is driven externally by SearchDialogComponent so it can
  // coordinate between the keyboard and the results list.

  private rowKeys(row: number): string[] {
    if (row === ACTION_ROW) return this.actionKeys();
    return this.rows[row].keys;
  }

  // Action row is SPACE, DEL, then the optional 123/ABC and DONE keys - so
  // the optional keys' columns depend on which ones are enabled.
  private actionKeys(): string[] {
    const keys = [' ', 'DEL'];
    if (this.symbols) keys.push('SYM');
    if (this.doneLabel) keys.push('DONE');
    return keys;
  }

  actionCol(key: 'SYM' | 'DONE'): number {
    return this.actionKeys().indexOf(key);
  }

  private keyValue(row: number, col: number): string | null {
    const ks = this.rowKeys(row);
    return (col >= 0 && col < ks.length) ? ks[col] : null;
  }

  private visX(row: number, col: number): number {
    if (row < NUM_ROWS) return LAYOUT[row].stagger + col;
    return col + 1.5;
  }

  private sortedByProx(trow: number, targetVx: number): number[] {
    const n = this.rowKeys(trow).length;
    return Array.from({ length: n }, (_, i) => i).sort((a, b) => {
      const da = Math.abs(this.visX(trow, a) - targetVx);
      const db = Math.abs(this.visX(trow, b) - targetVx);
      return da !== db ? da - db : a - b;
    });
  }

  private findGliderTarget(row: number, col: number, dir: string): [number, number] | null {
    if (dir === 'left') {
      for (let c = col - 1; c >= 0; c--) {
        const v = this.keyValue(row, c);
        if (v && this.likely.has(v)) return [row, c];
      }
    } else if (dir === 'right') {
      const n = this.rowKeys(row).length;
      for (let c = col + 1; c < n; c++) {
        const v = this.keyValue(row, c);
        if (v && this.likely.has(v)) return [row, c];
      }
    } else if (dir === 'up') {
      const tr = row - 1;
      if (tr < 0) return null;
      for (const c of this.sortedByProx(tr, this.visX(row, col))) {
        const v = this.keyValue(tr, c);
        if (v && this.likely.has(v)) return [tr, c];
      }
    } else if (dir === 'down') {
      const tr = row + 1;
      if (tr > ACTION_ROW) return null;
      for (const c of this.sortedByProx(tr, this.visX(row, col))) {
        const v = this.keyValue(tr, c);
        if (v && this.likely.has(v)) return [tr, c];
      }
    }
    return null;
  }

  private ordinaryMove(row: number, col: number, dir: string): [number, number] {
    if (dir === 'left')  return [row, Math.max(0, col - 1)];
    if (dir === 'right') return [row, Math.min(this.rowKeys(row).length - 1, col + 1)];
    if (dir === 'up' || dir === 'down') {
      const tr = row + (dir === 'up' ? -1 : 1);
      if (tr < 0 || tr > ACTION_ROW) return [row, col];
      const cols = this.sortedByProx(tr, this.visX(row, col));
      return cols.length ? [tr, cols[0]] : [row, col];
    }
    return [row, col];
  }

  private computeLikely(word: string): Set<string> {
    if (!word) return new Set();
    const w = word.toLowerCase();
    let preds: string[] = [];
    if (w.length >= 2 && TRIGRAMS[w.slice(-2)]) {
      preds = TRIGRAMS[w.slice(-2)];
    } else {
      preds = BIGRAMS[w.slice(-1)] || [];
    }
    return new Set(preds.slice(0, 8));
  }

  nav(dir: string) {
    const [row, col] = this.cursor;
    const OPPOSITES: Record<string, string> = { left:'right', right:'left', up:'down', down:'up' };
    const reversing = this.gLastDir !== null && dir === OPPOSITES[this.gLastDir];

    if (!this.gDisabled && !reversing && this.likely.size > 0) {
      const target = this.findGliderTarget(row, col, dir);
      if (target) {
        this.gActive  = true;
        this.gLastDir = dir;
        this.cursor   = target;
        this.cdr.markForCheck();
        return;
      }
      this.gDisabled = true;
      this.gActive   = false;
    } else if (reversing) {
      this.gDisabled = true;
      this.gActive   = false;
      this.gLastDir  = null;
    }

    this.cursor = this.ordinaryMove(row, col, dir);
    this.cdr.markForCheck();
  }

  activateKey(row: number, col: number) {
    const val = this.keyValue(row, col);
    if (!val) return;

    this.cursor = [row, col];

    if (val === 'DONE') {
      this.done.emit();
      return;
    }
    if (val === 'SYM') {
      this.symMode = !this.symMode;
      this.word = '';
      this.likely = new Set();
      this.gActive = true;
      this.gDisabled = false;
      this.gLastDir = null;
      this.cdr.markForCheck();
      return;
    }
    if (val === 'caps') {
      this.caps = !this.caps;
      this.cdr.markForCheck();
      return;
    }

    if (val === 'DEL') {
      this.injectBackspace();
      this.word  = this.word.slice(0, -1);
      this.likely = this.computeLikely(this.word);
      this.cdr.markForCheck();
      return;
    }

    // Symbol-layer keys (digits, : / - ...) break the current word the same
    // way space/./@ do - letter predictions don't apply across them.
    if (val === ' ' || val === '.' || val === '@' || this.symMode) {
      this.injectChar(val);
      this.word      = '';
      this.gActive   = true;
      this.gDisabled = false;
      this.gLastDir  = null;
    } else {
      const out = (/^[a-z]$/.test(val) && this.caps) ? val.toUpperCase() : val;
      this.injectChar(out);
      this.word     += val;
      this.gDisabled = false;
      this.gLastDir  = null;
    }

    this.likely = this.computeLikely(this.word);
    this.cdr.markForCheck();
  }

  delDown() {
    this.activateKey(ACTION_ROW, 1);
    this.delTimer = setTimeout(() => this.delRapid(), 400);
  }

  private delRapid() {
    this.activateKey(ACTION_ROW, 1);
    this.delTimer = setTimeout(() => this.delRapid(), 80);
  }

  delUp() {
    if (this.delTimer) { clearTimeout(this.delTimer); this.delTimer = null; }
  }

  private injectChar(ch: string) {
    const current = this.control.value ?? '';
    this.control.setValue(current + ch);
  }

  private injectBackspace() {
    const current = this.control.value ?? '';
    this.control.setValue(current.slice(0, -1));
  }

  ngOnDestroy() {
    if (this.delTimer) clearTimeout(this.delTimer);
  }
}
