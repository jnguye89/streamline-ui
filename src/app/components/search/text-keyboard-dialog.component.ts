import { CommonModule } from '@angular/common';
import { Component, Inject, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Observable, Subject, takeUntil } from 'rxjs';
import { Direction, GamepadNavigationService } from '../../services/gamepad-navigation.service';
import { GliderKeyboardComponent } from './glider-keyboard.component';

export interface TextKeyboardSuggestion {
  id: string | number;
  label: string;
}

export interface TextKeyboardDialogData {
  control: FormControl<string | null>;
  placeholder?: string;
  // Optional live results list, shown the same way SearchDialogComponent
  // shows its user-search matches - the caller (e.g. the podcast page's
  // local list filter) owns whatever filtering/debouncing produces this
  // stream; the dialog just displays whatever it emits. Omit entirely for
  // a plain text-entry-only use of this dialog.
  suggestions$?: Observable<TextKeyboardSuggestion[]>;
  onSelectSuggestion?: (item: TextKeyboardSuggestion) => void;
  isSuggestionSelected?: (item: TextKeyboardSuggestion) => boolean;
}

/**
 * Generic on-screen-keyboard dialog for a single text field - the same
 * glider keyboard, gamepad wiring, and (when the caller opts in via
 * suggestions$) live results list as SearchDialogComponent, but decoupled
 * from its user-search API call. Used wherever a page wants "the same
 * keyboard as the search icon" for a text input of its own (e.g. the
 * podcast page's "Add person" search box): the caller passes its own
 * FormControl in via MAT_DIALOG_DATA, so typing on the on-screen keyboard
 * updates that control directly (and whatever the caller's page does with
 * its valueChanges, e.g. filtering a list) - no return-value handshake
 * needed on close. A results list only renders when suggestions$ is
 * supplied - without it this is a plain text-entry keyboard.
 */
@Component({
  standalone: true,
  selector: 'app-text-keyboard-dialog',
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, GliderKeyboardComponent],
  template: `
    <div class="spotlight-container">
      <div class="search-row">
        <mat-icon class="search-icon">search</mat-icon>
        <input
          class="search-input"
          [formControl]="data.control"
          [placeholder]="data.placeholder ?? 'Search...'"
          autocomplete="off"
          spellcheck="false"
          readonly
          tabindex="-1"
        />
        <button class="esc-btn" (click)="close()">esc</button>
      </div>

      <div class="results" *ngIf="data.suggestions$">
        <div class="divider"></div>

        <div *ngIf="results.length === 0" class="state-row hint">
          {{ (data.control.value ?? '').trim() ? 'No users found' : 'Start typing to search' }}
        </div>

        <button
          *ngFor="let item of results; let i = index"
          class="result-row"
          [class.focused]="mode === 'results' && i === focusedIndex"
          (click)="selectSuggestion(item)"
          (mouseenter)="focusedIndex = i; mode = 'results'"
        >
          <mat-icon class="result-icon">person</mat-icon>
          <span class="username">{{ item.label }}</span>
          <mat-icon class="result-selected" *ngIf="isSelected(item)">check</mat-icon>
        </button>
      </div>

      <app-glider-keyboard #keyboard [control]="data.control"></app-glider-keyboard>
    </div>
  `,
  styles: [`
    .spotlight-container {
      background: rgba(28, 28, 30, 0.92);
      border-radius: 14px;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', Roboto, sans-serif;
    }

    .search-row {
      display: flex;
      align-items: center;
      padding: 14px 18px;
      gap: 12px;
    }

    .search-icon {
      color: rgba(255,255,255,0.45);
      font-size: 22px;
      width: 22px;
      height: 22px;
      flex-shrink: 0;
    }

    .search-input {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      color: #fff;
      font-size: 1.25rem;
      font-weight: 300;
      caret-color: var(--c-primary, #0e52ff);

      &::placeholder {
        color: rgba(255,255,255,0.3);
      }
    }

    .esc-btn {
      background: rgba(255,255,255,0.1);
      border: none;
      border-radius: 5px;
      color: rgba(255,255,255,0.45);
      font-size: 0.7rem;
      padding: 3px 7px;
      cursor: pointer;
      letter-spacing: 0.03em;
      flex-shrink: 0;
    }

    .divider {
      height: 1px;
      background: rgba(255,255,255,0.08);
      margin: 0 18px;
    }

    .results {
      max-height: 200px;
      overflow: hidden;
    }

    .state-row {
      padding: 14px 18px;
      color: rgba(255,255,255,0.45);
      font-size: 0.875rem;
    }

    .state-row.hint {
      color: rgba(255,255,255,0.2);
    }

    .result-row {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 10px 18px;
      background: transparent;
      border: none;
      cursor: pointer;
      text-align: left;
      transition: background 0.1s;

      &.focused {
        background: rgba(14, 82, 255, 0.25);
      }
    }

    .result-icon {
      color: rgba(255,255,255,0.5);
      font-size: 18px;
      width: 18px;
      height: 18px;
      flex-shrink: 0;
    }

    .username {
      color: #fff;
      font-size: 1rem;
      font-weight: 400;
      flex: 1;
    }

    .result-selected {
      color: var(--c-primary, #0e52ff);
      font-size: 18px;
      width: 18px;
      height: 18px;
      flex-shrink: 0;
    }
  `]
})
export class TextKeyboardDialogComponent implements OnInit, OnDestroy {
  @ViewChild('keyboard') private keyboard!: GliderKeyboardComponent;

  results: TextKeyboardSuggestion[] = [];
  focusedIndex = 0;
  mode: 'keyboard' | 'results' = 'keyboard';

  private destroy$ = new Subject<void>();

  constructor(
    private ref: MatDialogRef<TextKeyboardDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: TextKeyboardDialogData,
    private gamepadNavigation: GamepadNavigationService,
  ) {}

  // Same reasoning as SearchDialogComponent: clear whatever page element was
  // gamepad-focused underneath before wiring our own overrides, so the
  // first B press closes this dialog instead of dismissing that element's
  // row first (see GamepadNavigationService.clearFocus() for the full
  // explanation).
  ngOnInit() {
    this.gamepadNavigation.clearFocus();

    // stickOnly: true - identical to SearchDialogComponent. The stick
    // drives the on-screen keyboard/results cursor; the D-pad is claimed
    // but inert so it can't leak through to whatever's behind this dialog.
    this.gamepadNavigation.setDpadActions({
      up: () => this.handleDirection('up'),
      down: () => this.handleDirection('down'),
      left: () => this.handleDirection('left'),
      right: () => this.handleDirection('right'),
    }, { stickOnly: true });
    this.gamepadNavigation.setActivateAction(() => {
      this.handleActivate();
      return true;
    });
    this.gamepadNavigation.setBackAction(() => {
      this.close();
      return true;
    });

    this.data.suggestions$?.pipe(takeUntil(this.destroy$)).subscribe(items => {
      this.results = items;
      this.focusedIndex = Math.min(this.focusedIndex, Math.max(items.length - 1, 0));
      if (items.length === 0) this.mode = 'keyboard';
    });
  }

  // Same keyboard<->results mode switching as SearchDialogComponent.
  private handleDirection(dir: Direction): void {
    if (this.mode === 'results') {
      if (dir === 'down') {
        if (this.focusedIndex === this.results.length - 1) {
          this.mode = 'keyboard'; // wrap back to keyboard top
        } else {
          this.focusedIndex++;
        }
      } else if (dir === 'up') {
        if (this.focusedIndex === 0) {
          this.mode = 'keyboard';
        } else {
          this.focusedIndex--;
        }
      }
      // left/right have no meaning in the results list - ignored
      return;
    }

    // Keyboard mode
    // Down from the action row (bottom) → land on first result
    if (dir === 'down'
        && this.keyboard?.cursor[0] === this.keyboard?.ACTION_ROW
        && this.results.length > 0) {
      this.mode = 'results';
      this.focusedIndex = 0;
      return;
    }
    // Up from the top row → land on last result (results sit above the keyboard)
    if (dir === 'up'
        && this.keyboard?.cursor[0] === 0
        && this.results.length > 0) {
      this.mode = 'results';
      this.focusedIndex = this.results.length - 1;
      return;
    }
    this.keyboard?.nav(dir);
  }

  private handleActivate(): void {
    if (this.mode === 'results') {
      if (this.results.length > 0) this.selectSuggestion(this.results[this.focusedIndex]);
      return;
    }
    this.keyboard?.activateKey(this.keyboard.cursor[0], this.keyboard.cursor[1]);
  }

  selectSuggestion(item: TextKeyboardSuggestion): void {
    this.data.onSelectSuggestion?.(item);
  }

  isSelected(item: TextKeyboardSuggestion): boolean {
    return this.data.isSuggestionSelected?.(item) ?? false;
  }

  close() {
    this.ref.close();
  }

  ngOnDestroy() {
    this.gamepadNavigation.clearDpadActions();
    this.gamepadNavigation.clearActivateAction();
    this.gamepadNavigation.setBackAction(null);
    this.destroy$.next();
    this.destroy$.complete();
  }
}
