import { Component, ElementRef, ViewChild } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { RouterModule } from "@angular/router";
import { ListenService } from "../../services/listen.service";
import { BehaviorSubject, Subject, takeUntil } from "rxjs";
import { CommonModule } from "@angular/common";
import { MatButtonModule } from "@angular/material/button";
import { MatChipsModule } from "@angular/material/chips";
import { FlexLayoutModule } from "@angular/flex-layout";
import { Audio } from "../../models/Audio.model";

@Component({
  selector: "app-listen",
  standalone: true,
  imports: [
    MatIconModule,
    RouterModule,
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    FlexLayoutModule,
  ],
  providers: [ListenService],
  templateUrl: "./listen.component.html",
  styleUrl: "./listen.component.scss",
})
export class ListenComponent {
  private destroy$ = new Subject<void>();
  private stationTitlesSubject = new BehaviorSubject<Audio[]>([]);
  stationTitles$ = this.stationTitlesSubject.asObservable();

  currentIndex = 0;
  currentStation?: Audio;

  constructor(private listenService: ListenService) {}

  ngOnInit() {
    this.listenService
      .getAudio()
      .pipe(takeUntil(this.destroy$))
      .subscribe((audio) => {
        this.stationTitlesSubject.next(audio);

        if (audio.length > 0) {
          this.currentIndex = Math.floor(Math.random() * audio.length);
          this.currentStation = audio[this.currentIndex];
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
