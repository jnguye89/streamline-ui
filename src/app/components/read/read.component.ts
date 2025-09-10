import { Component, EventEmitter, OnDestroy, OnInit, Output } from '@angular/core';
import { ThreadService } from '../../services/thread.service';
import { Observable, of, shareReplay, startWith, Subject, switchMap, take, takeUntil } from 'rxjs';
import { ThreadModel } from '../../models/thread.model';
import { CommonModule, DatePipe } from '@angular/common';
import { MatDividerModule } from '@angular/material/divider';
import { MatCardModule } from '@angular/material/card';
import { FormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { TextFieldModule } from '@angular/cdk/text-field';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '@auth0/auth0-angular';
import { Router } from '@angular/router';

@Component({
  selector: 'app-read',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatDividerModule, FormsModule, MatInputModule, MatButtonModule, TextFieldModule, MatIconModule],
  providers: [DatePipe],
  templateUrl: './read.component.html',
  styleUrl: './read.component.scss'
})
export default class ReadComponent implements OnInit, OnDestroy {
  isAuthenticated$ = this.auth.isAuthenticated$;
  private destroy$ = new Subject<void>();
  currentIndex = 0;
  text = '';
  threads$: Observable<ThreadModel[] | undefined> = of();
  private refresh$ = new Subject<void>();
  constructor(private threadService: ThreadService,
    public auth: AuthService,
    private router: Router) { }

  trackById = (_: number, t: ThreadModel) => t.id;

  ngOnInit() {
    this.init()
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  login() {
    this.auth.loginWithRedirect({
      appState: {
        target: this.router.url,
      },
    });
  }

  init() {
    this.threads$ = this.refresh$.pipe(
      startWith(void 0),                                 // load once on init
      switchMap(() => this.threadService.getLatestThreads(50)),
      shareReplay({ bufferSize: 1, refCount: true })     // optional, caches latest
    );
  }

  get canSubmit() { return this.text.trim().length > 0; }

  submit() {
    const val = this.text.trim();
    if (!val) return;
    this.threadService.createThread({
      threadItem: val
    }).pipe(take(1)).subscribe({
      next: () => {
        this.text = '';
        this.refresh$.next();   // refetch the latest threads
      },
      error: (err) => console.error(err)
    });
    this.text = '';
  }

  next(total: number) {
    if (!total) return;
    this.currentIndex = (this.currentIndex + 1) % total;
  }

  prev(total: number) {
    if (!total) return;
    this.currentIndex = (this.currentIndex - 1 + total) % total;
  }
}
