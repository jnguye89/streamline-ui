import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { SQUARE_PX, screenRC, screenToSq } from '../board-geometry';
import { GameStore } from '../game-store.service';
import { PieceComponent } from '../piece/piece.component';

interface CellView {
  readonly key: number;
  /** Playable square index, or −1 for a light square. */
  readonly sq: number;
}

@Component({
  selector: 'ck-board',
  standalone: true,
  imports: [PieceComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './board.component.html',
  styleUrl: './board.component.css',
})
export class BoardComponent {
  protected readonly store = inject(GameStore);

  /** 64 cells in screen order for the current orientation. */
  protected readonly cells = computed<CellView[]>(() => {
    const pc = this.store.playerColor();
    const out: CellView[] = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) out.push({ key: r * 8 + c, sq: screenToSq(r, c, pc) });
    return out;
  });

  protected readonly dests = computed(() => new Set(this.store.nextHops()));
  protected readonly lastSquares = computed(() => {
    const m = this.store.lastMove();
    return new Set(m ? [m.from, ...m.path] : []);
  });
  protected readonly hintSquares = computed(() => {
    const m = this.store.hint();
    return new Set(m ? [m.from, m.path[m.path.length - 1]] : []);
  });
  protected readonly movable = computed(() =>
    this.store.selection() || this.store.busy() ? new Set<number>() : new Set(this.store.movable()),
  );

  protected readonly focusTransform = computed(() => {
    const f = this.store.focus();
    if (f === null || this.store.busy()) return null;
    return this.tf(f);
  });

  protected tf(sq: number): string {
    const p = screenRC(sq, this.store.playerColor());
    return `translate(${p.c * SQUARE_PX}px, ${p.r * SQUARE_PX}px)`;
  }
}
