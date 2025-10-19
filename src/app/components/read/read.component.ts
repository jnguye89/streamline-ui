import { Component, EventEmitter, OnDestroy, OnInit, Output } from '@angular/core';
import { ThreadService } from '../../services/thread.service';
import { map, Observable, of, shareReplay, startWith, Subject, switchMap, take, takeUntil } from 'rxjs';
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
import { animate, style, transition, trigger } from '@angular/animations';
import { SeoService } from '../../services/seo.service';

@Component({
  selector: 'app-read',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatDividerModule, FormsModule, MatInputModule, MatButtonModule, TextFieldModule, MatIconModule],
  providers: [DatePipe], animations: [
    // Slide in/out horizontally; direction controlled via params
    trigger('slideH', [
      transition(':enter', [
        style({ transform: 'translateX({{ enterFrom }}%)', opacity: 0 }),
        animate('300ms ease-out', style({ transform: 'translateX(0%)', opacity: 1 })),
      ], { params: { enterFrom: 100 } }), // default: comes from right

      transition(':leave', [
        animate('300ms ease-out', style({ transform: 'translateX({{ leaveTo }}%)', opacity: 0 })),
      ], { params: { leaveTo: -100 } }),  // default: leaves to left
    ]),
  ],
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
  // control direction per click
  direction: 'forward' | 'backward' = 'forward';
  animParams = { enterFrom: 100, leaveTo: -100 }; // right -> center, center -> left

  constructor(
    private threadService: ThreadService,
    public auth: AuthService,
    private router: Router,
    private seo: SeoService) { }


  trackById = (_: number, t: ThreadModel) => t.id;

  ngOnInit() {
    this.setUpSeo();
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
      map(t => shuffle(t)),
      shareReplay({ bufferSize: 1, refCount: true })     // optional, caches latest
    );
  }

  get canSubmit() { return this.text.trim().length > 0; }

  submit() {
    const val = this.text.trim();
    if (!val) return;
    this.threadService.createThread({
      threadText: val
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
    this.direction = 'forward';
    this.animParams = { enterFrom: 100, leaveTo: -100 };
    this.currentIndex = (this.currentIndex + 1) % total;
  }

  prev(total: number) {
    if (!total) return;
    this.direction = 'backward';
    this.animParams = { enterFrom: -100, leaveTo: 100 }; // come from left, leave to right
    this.currentIndex = (this.currentIndex - 1 + total) % total;
  }

  // Helpers
  private setUpSeo() {
    const title = 'skriin AI TV';
    const description =
      'Discover and watch creators, VODs, podcasts and live channels in one curated interface powered by AI recommendations and voice search.';
    const keywords =
      'watch streaming content, creator hub tv, ai recommendations, vod player, voice search tv, live channels';
    this.seo.setTags({ title, description, keywords, path: '/podcast' });
  }
}

function shuffle<T>(array: T[]): T[] {
  const arr = [...array]; // copy so you don’t mutate original
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1)); // random index 0..i
    [arr[i], arr[j]] = [arr[j], arr[i]]; // swap
  }
  return arr;
}