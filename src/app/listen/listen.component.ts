import { Component, ElementRef, ViewChild } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterModule } from '@angular/router';
import { ListenService } from '../services/listen.service';
import { BehaviorSubject, Subject, takeUntil } from 'rxjs';
import { HttpClientModule } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';

@Component({
  selector: 'app-listen',
  standalone: true,
  imports: [
    MatIconModule,
    RouterModule,
    HttpClientModule,
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
  ],
  providers: [ListenService],
  templateUrl: './listen.component.html',
  styleUrl: './listen.component.scss',
})
export class ListenComponent {
  private destroy$ = new Subject<void>();
  // @ViewChild('audio', { static: true }) audioRef!: ElementRef<HTMLAudioElement>;
  // stations$: Observable<string[]> = of([]);
  private stationTitlesSubject = new BehaviorSubject<string[]>([]);
  stationTitles$ = this.stationTitlesSubject.asObservable();

  currentIndex = 0;
  currentStation = '';

  constructor(private listenService: ListenService) {}

  ngOnInit() {
    this.listenService
      .getStations(100)
      .pipe(takeUntil(this.destroy$))
      .subscribe((stations) => {
        this.stationTitlesSubject.next(stations);

        if (stations.length > 0) {
          this.currentIndex = Math.floor(Math.random() * stations.length);
          this.currentStation = stations[this.currentIndex];
        }
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete;
  }

  next() {
    const titles = this.stationTitlesSubject.value;
    if (!titles.length) return;

    this.currentIndex++;
    if (this.currentIndex >= titles.length) {
      this.currentIndex = 0;
    }
    this.currentStation = titles[this.currentIndex];
  }

  previous() {
    const titles = this.stationTitlesSubject.value;
    if (!titles.length) return;

    this.currentIndex--;
    if (this.currentIndex < 0) {
      this.currentIndex = titles.length - 1;
    }
    this.currentStation = titles[this.currentIndex];
  }
}
