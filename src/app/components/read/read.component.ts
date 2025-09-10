import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { ThreadService } from '../../services/thread.service';
import { Observable, of, shareReplay, startWith, Subject, switchMap, take } from 'rxjs';
import { ThreadModel } from '../../models/thread.model';
import { CommonModule, DatePipe } from '@angular/common';
import { MatDividerModule } from '@angular/material/divider';
import { MatCardModule } from '@angular/material/card';
import { FormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { TextFieldModule } from '@angular/cdk/text-field';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-read',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatDividerModule, FormsModule, MatInputModule, MatButtonModule, TextFieldModule, MatIconModule],
  providers: [DatePipe],
  templateUrl: './read.component.html',
  styleUrl: './read.component.scss'
})
export default class ReadComponent implements OnInit {
  currentIndex = 0;
  text = '';
  threads$: Observable<ThreadModel[] | undefined> = of();
  private refresh$ = new Subject<void>();
  constructor(private threadService: ThreadService) { }

  trackById = (_: number, t: ThreadModel) => t.id;

  ngOnInit() {
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
