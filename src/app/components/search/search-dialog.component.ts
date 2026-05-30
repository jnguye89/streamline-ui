import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { Subject, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, takeUntil, catchError } from 'rxjs/operators';
import { Auth0User } from '../../models/auth0-user.model';
import { UserService } from '../../services/user.service';

@Component({
  standalone: true,
  selector: 'app-search-dialog',
  imports: [CommonModule, ReactiveFormsModule, MatIconModule],
  template: `
    <div class="spotlight-container">
      <div class="search-row">
        <mat-icon class="search-icon">search</mat-icon>
        <input
          #searchInput
          class="search-input"
          [formControl]="query"
          placeholder="Search users..."
          autocomplete="off"
          spellcheck="false"
        />
        <button class="esc-btn" (click)="close()">esc</button>
      </div>

      <div class="results" *ngIf="results.length > 0 || loading || noResults">
        <div class="divider"></div>

        <div *ngIf="loading" class="state-row">Searching...</div>

        <div *ngIf="noResults && !loading" class="state-row muted">No users found</div>

        <button
          *ngFor="let user of results; let i = index"
          class="result-row"
          [class.focused]="i === focusedIndex"
          (click)="navigate(user)"
          (mouseenter)="focusedIndex = i"
        >
          <mat-icon class="result-icon">person</mat-icon>
          <span class="username">{{ user.username }}</span>
        </button>
      </div>
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
      padding-bottom: 8px;
    }

    .state-row {
      padding: 14px 18px;
      color: rgba(255,255,255,0.45);
      font-size: 0.875rem;
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
    }
  `]
})
export class SearchDialogComponent implements OnInit, OnDestroy {
  @ViewChild('searchInput', { static: true }) searchInput!: ElementRef<HTMLInputElement>;

  query = new FormControl('');
  results: Auth0User[] = [];
  loading = false;
  noResults = false;
  focusedIndex = 0;

  private destroy$ = new Subject<void>();

  constructor(
    private ref: MatDialogRef<SearchDialogComponent>,
    private userService: UserService,
    private router: Router
  ) {}

  ngOnInit() {
    this.searchInput.nativeElement.focus();

    this.query.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(q => {
        const term = (q ?? '').trim();
        if (!term) {
          this.results = [];
          this.noResults = false;
          this.loading = false;
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
      this.results = users;
      this.loading = false;
      this.noResults = users.length === 0 && (this.query.value?.trim().length ?? 0) > 0;
      this.focusedIndex = 0;
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
    this.destroy$.next();
    this.destroy$.complete();
  }
}
