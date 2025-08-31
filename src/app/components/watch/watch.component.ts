// watch.component.ts
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatButtonModule } from '@angular/material/button';
import { FlexLayoutModule } from '@angular/flex-layout';
import { MatChipsModule } from '@angular/material/chips';
import { Router, RouterModule } from '@angular/router';
import {
  BehaviorSubject,
  Subject,
  combineLatest,
  map,
  shareReplay,
  switchMap,
  takeUntil,
  timer
} from 'rxjs';

import { VideoService } from '../../services/video.service';
import { SeoService } from '../../services/seo.service';
import { WowzaPlayService } from '../../services/wowza-play.service';
import { PlayItem } from '../../models/play-item.model';
import { Video } from '../../models/video.model';
import { StreamService } from '../../services/stream.service';

@Component({
  selector: 'app-watch',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    FlexLayoutModule,
    MatChipsModule,
    RouterModule,
    CommonModule
  ],
  providers: [VideoService],
  templateUrl: './watch.component.html',
  styleUrl: './watch.component.scss'
})
export class WatchComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('player', { static: false }) playerRef!: ElementRef<HTMLVideoElement>;

  private destroy$ = new Subject<void>();

  // UI state
  isPortrait = false;
  playlist: PlayItem[] = [];
  currentIndex = 0;
  currentItem: PlayItem | null = null;
  get hasMany() { return this.playlist.length > 1; }

  // Internal streams
  private playlist$ = new BehaviorSubject<PlayItem[]>([]);
  private viewReady$ = new BehaviorSubject<boolean>(false);

  constructor(
    private videoService: VideoService,
    private streamService: StreamService,
    private wowza: WowzaPlayService,
    private router: Router,
    private seo: SeoService
  ) { }

  ngOnInit() {
    this.setUpSeo();

    // Get VODs once and keep cached
    const vod$ = this.videoService.getVideos().pipe(
      map(videos => videos.map(v => this.mapVod(v))),
      shareReplay({ bufferSize: 1, refCount: true })
    );

    // Poll live list every 15s (adjust as needed)
    const live$ = timer(0, 15000).pipe(
      switchMap(() => this.streamService.getLiveStreams()),
      shareReplay({ bufferSize: 1, refCount: true })
    );

    // Merge (Live first, then VOD)
    combineLatest([live$, vod$])
      .pipe(
        map(([lives, vods]) => [...lives, ...vods]),
        takeUntil(this.destroy$)
      )
      .subscribe(list => {
        this.playlist = list;
        this.playlist$.next(list);
        // If nothing selected yet, choose first Live if present, else first VOD (or random VOD if you prefer)
        if (!this.currentItem) {
          const firstLiveIndex = list.findIndex(i => i.type === 'live');
          this.currentIndex = firstLiveIndex >= 0 ? firstLiveIndex : 0;
          this.currentItem = list[this.currentIndex] ?? null;
          this.tryPlayCurrent();
        } else {
          // If the current item disappeared (e.g., live ended), advance to next
          const stillThereIndex = this.playlist.findIndex(i => this.isSame(i, this.currentItem!));
          if (stillThereIndex === -1) {
            this.next();
          }
        }
      });
  }

  ngAfterViewInit(): void {
    this.viewReady$.next(true);
    this.tryPlayCurrent();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.wowza.stop();
    const v = this.playerRef?.nativeElement;
    if (v) { v.src = ''; v.load(); }
  }

  // Navigation
  next() {
    if (!this.playlist.length) return;
    this.currentIndex = (this.currentIndex + 1) % this.playlist.length;
    this.currentItem = this.playlist[this.currentIndex];
    this.tryPlayCurrent(true);
  }

  previous() {
    if (!this.playlist.length) return;
    this.currentIndex = (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
    this.currentItem = this.playlist[this.currentIndex];
    this.tryPlayCurrent(true);
  }

  select(i: number) {
    if (i < 0 || i >= this.playlist.length) return;
    this.currentIndex = i;
    this.currentItem = this.playlist[i];
    this.tryPlayCurrent(true);
  }

  // Playback
  private tryPlayCurrent(force = false) {
    console.log('try play current')
    if (!this.currentItem || !this.viewReady$.value) return;
    const el = this.playerRef.nativeElement;

    if (this.currentItem.type === 'live') {
      try {
        el.pause();
        // If we were on VOD, clear file src
        el.removeAttribute('src');
        // If we were on WebRTC before, ensure srcObject is cleared too
        (el as any).srcObject = null;
        el.load();
      } catch { }

      // lazy-init Wowza and play
      this.wowza.ensureInit(el, this.currentItem.wssUrl, this.currentItem.applicationName, this.currentItem.streamName);        // <--- new helper (below)
      this.wowza.playFromUrl(this.currentItem.wssUrl);
    } else {
      // stop live path safely (no-ops if not active)
      this.wowza.stop();

      // play VOD
      try {
        // IMPORTANT: clear any WebRTC leftovers
        (el as any).srcObject = null;
        el.removeAttribute('src');
        el.load();

        el.muted = true;
        el.autoplay = true;
        el.src = this.currentItem.src;
        el.play().catch(err => console.warn('VOD play blocked/failed:', err));
      } catch (e) {
        console.warn('Failed to start VOD:', e);
      }
    }
  }

  onVideoLoaded(video: HTMLVideoElement) {
    const aspectRatio = video.videoWidth / video.videoHeight;
    this.isPortrait = aspectRatio < 1;
    video.defaultMuted = true;
    video.muted = true;
    video.play().catch(() => { });
  }

  goToProfile() {
    const user =
      (this.currentItem as any)?.user ??
      (this.playlist[this.currentIndex] as any)?.user ??
      '';
    if (user) this.router.navigate(['/profile', user]);
  }

  // Helpers
  private setUpSeo() {
    const title = 'Watch – Skriin AI TV';
    const description =
      'Discover and watch creators, VODs, podcasts and live channels in one curated interface powered by AI recommendations and voice search.';
    const keywords =
      'watch streaming content, creator hub tv, ai recommendations, vod player, voice search tv, live channels';
    this.seo.setTags({ title, description, keywords, path: '/watch' });
  }

  private mapVod(v: Video): PlayItem {
    // TODO: Map to your actual VOD url field. Common names: v.url, v.src, v.hlsUrl, v.mp4Url
    return {
      type: 'vod',
      id: (v as any).id ?? crypto.randomUUID(),
      title: (v as any).title ?? (v as any).name ?? 'Video',
      user: (v as any).user,
      src: v.videoPath,
      thumbnail: (v as any).thumbnail
    };
  }

  private isSame(a: PlayItem, b: PlayItem) {
    if (a.type !== b.type) return false;
    if (a.type === 'live') return a.id === b.id// || a.wssUrl === b.wssUrl;
    return a.id === b.id || a.src === (b as any).src;
  }
}
