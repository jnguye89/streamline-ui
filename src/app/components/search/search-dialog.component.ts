import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { Subject, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, takeUntil, catchError } from 'rxjs/operators';
import { Auth0User } from '../../models/auth0-user.model';
import { UserService } from '../../services/user.service';
import { Direction, GamepadNavigationService } from '../../services/gamepad-navigation.service';
import { GliderKeyboardComponent } from './glider-keyboard.component';

@Component({
  standalone: true,
  selector: 'app-search-dialog',
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, GliderKeyboardComponent],
  template: `
    <div class="spotlight-container">
      <div class="search-row">
        <mat-icon class="search-icon">search</mat-icon>
        <input
          class="search-input"
          [formControl]="query"
          placeholder="Search users..."
          autocomplete="off"
          spellcheck="false"
          readonly
          tabindex="-1"
        />
        <button class="esc-btn" (click)="close()">esc</button>
      </div>

      <div class="results">
        <div class="divider"></div>

        <div *ngIf="!loading && !noResults && results.length === 0" class="state-row hint">Search for a user</div>

        <div *ngIf="loading" class="state-row">Searching...</div>

        <div *ngIf="noResults && !loading" class="state-row">No users found</div>

        <button
          *ngFor="let user of results; let i = index"
          class="result-row"
          [class.focused]="mode === 'results' && i === focusedIndex"
          (click)="navigate(user)"
          (mouseenter)="focusedIndex = i; mode = 'results'"
        >
          <mat-icon class="result-icon">person</mat-icon>
          <span class="username">{{ user.username }}</span>
          <mat-icon class="result-enter-hint" *ngIf="mode === 'results' && i === focusedIndex">keyboard_return</mat-icon>
        </button>
      </div>

      <app-glider-keyboard #keyboard [control]="query"></app-glider-keyboard>
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
      height: 200px;
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

    .result-enter-hint {
      color: rgba(255,255,255,0.3);
      font-size: 16px;
      width: 16px;
      height: 16px;
    }
  `]
})
export class SearchDialogComponent implements OnInit, OnDestroy {
  @ViewChild('keyboard') private keyboard!: GliderKeyboardComponent;

  query = new FormControl('');
  results: Auth0User[] = [];
  loading = false;
  noResults = false;
  focusedIndex = 0;
  mode: 'keyboard' | 'results' = 'keyboard';

  private destroy$ = new Subject<void>();

  constructor(
    private ref: MatDialogRef<SearchDialogComponent>,
    private userService: UserService,
    private router: Router,
    private gamepadNavigation: GamepadNavigationService
  ) {}

  // The on-screen glider keyboard has no real focusable DOM elements per
  // key - its "focus" is just `keyboard.cursor` component state - so it
  // can't be driven by GamepadNavigationService's generic spatial focus
  // system the way every other page's buttons are. Instead this wires the
  // dialog into the same page-override hooks Watch/Stream/Profile already
  // use for their own custom input handling: setDpadActions for the D-pad,
  // setActivateAction for A/Enter, setBackAction for B/Escape. Since the
  // service already mirrors ArrowKeys/Enter/Escape from a real keyboard
  // into these same hooks (see its own onKeyDown), this one path now
  // drives both a physical keyboard and a physical gamepad identically -
  // no separate document:keydown listener needed here anymore.
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
      if (this.results.length > 0) this.navigate(this.results[this.focusedIndex]);
      return;
    }
    this.keyboard?.activateKey(this.keyboard.cursor[0], this.keyboard.cursor[1]);
  }

  ngOnInit() {
    // Whatever was gamepad-focused on the page underneath (typically the
    // top nav's search icon that opened this dialog) is still "current" as
    // far as GamepadNavigationService knows - opening a MatDialog doesn't
    // clear it. Left alone, that element sits inside the top nav row, so
    // B's row-dismiss handling would consume the first press clearing it
    // (invisibly, since the dialog covers the row) before a second B ever
    // reaches this dialog's own setBackAction() below. Clearing it up
    // front means the very first B closes the dialog.
    this.gamepadNavigation.clearFocus();

    // includeStick: true - the on-screen keyboard has no real DOM focus of
    // its own for the left stick to fall back to moving (see the comment
    // above), so unlike Watch (which needs the stick free to reach its nav
    // bar/action row while the D-pad is busy with seek/volume) this dialog
    // wants the stick to reach these same handlers, not just the D-pad.
    this.gamepadNavigation.setDpadActions({
      up: () => this.handleDirection('up'),
      down: () => this.handleDirection('down'),
      left: () => this.handleDirection('left'),
      right: () => this.handleDirection('right'),
    }, { includeStick: true });
    this.gamepadNavigation.setActivateAction(() => {
      this.handleActivate();
      return true;
    });
    this.gamepadNavigation.setBackAction(() => {
      this.close();
      return true;
    });

    this.query.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(q => {
        const term = (q ?? '').trim();
        if (!term) {
          this.results = [];
          this.noResults = false;
          this.loading = false;
          this.mode = 'keyboard';
          return of([]);
        }
        this.loading = true;
        this.noResults = false;
        return this.userService.searchUsers(term).pipe(
          catchError(() => of([]))
        );
      }),
      takeUntil(this.destroy$)
    ).subscribe(users => {
      this.results = users.slice(0, 5);
      this.loading = false;
      this.noResults = users.length === 0 && (this.query.value?.trim().length ?? 0) > 0;
      this.focusedIndex = 0;
      if (users.length === 0) this.mode = 'keyboard';
    });
  }

  navigate(user: Auth0User) {
    this.ref.close();
    this.router.navigate(['/profile', user.auth0UserId]);
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
