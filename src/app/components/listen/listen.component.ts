import { Component, ElementRef, ViewChild } from "@angular/core";
import { MatIconModule } from "@angular/material/icon";
import { RouterModule } from "@angular/router";
import { ListenService } from "../../services/listen.service";
import { BehaviorSubject, Subject, takeUntil } from "rxjs";
import { CommonModule } from "@angular/common";
import { MatButtonModule } from "@angular/material/button";
import { MatChipsModule } from "@angular/material/chips";
import { MatInputModule } from "@angular/material/input";
import { MatSliderModule } from "@angular/material/slider";
import { MatFormFieldModule } from "@angular/material/form-field";
import { FlexLayoutModule } from "@angular/flex-layout";
import { Audio } from "../../models/Audio.model";
import { FormsModule } from "@angular/forms";
import { SeoService } from "../../services/seo.service";

@Component({
  selector: "app-listen",
  standalone: true,
  imports: [
    MatSliderModule,
    MatIconModule,
    RouterModule,
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    FlexLayoutModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
  ],
  providers: [ListenService],
  templateUrl: "./listen.component.html",
  styleUrl: "./listen.component.scss",
})
export class ListenComponent {
  isPlaying = false;
  volume = 50;
  @ViewChild("audio") audioRef!: ElementRef<HTMLAudioElement>;
  private destroy$ = new Subject<void>();
  private stationTitlesSubject = new BehaviorSubject<Audio[]>([]);
  stationTitles$ = this.stationTitlesSubject.asObservable();

  currentIndex = 0;
  currentStation?: Audio;

  constructor(private listenService: ListenService, private seo: SeoService) { }

  ngOnInit() {
    this.setUpSeo();
    this.listenService
      .getAudio()
      .pipe(takeUntil(this.destroy$))
      .subscribe((audio) => {
        this.stationTitlesSubject.next(audio);
        this.isPlaying = true;

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

  togglePlay() {
    const audio = this.audioRef?.nativeElement;
    console.log(audio);
    if (!audio) return;

    if (this.isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }

    this.isPlaying = !this.isPlaying;
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

  changeVolume(event: Event) {
    const inputElement = event.target as HTMLInputElement | null;
    const value = inputElement?.valueAsNumber ?? this.volume;

    // Fallback to 0.5 if value is invalid
    const normalized = isFinite(value) ? value / 100 : 0.5;

    this.volume = value;

    if (this.audioRef?.nativeElement) {
      this.audioRef.nativeElement.volume = normalized;
    }
  }

  // Helpers
  private setUpSeo() {
    const title = 'Skriin AI TV';
    const description =
      'Discover and watch creators, VODs, podcasts and live channels in one curated interface powered by AI recommendations and voice search.';
    const keywords =
      'watch streaming content, creator hub tv, ai recommendations, vod player, voice search tv, live channels';
    this.seo.setTags({ title, description, keywords, path: '/podcast' });
  }
}
