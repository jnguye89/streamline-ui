// watch.component.ts
import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
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
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import {
  BehaviorSubject,
  Subject,
  combineLatest,
  map,
  shareReplay,
  switchMap,
  takeUntil,
  tap,
  timer
} from 'rxjs';

import { VideoService } from '../../services/video.service';
import { SeoService } from '../../services/seo.service';
import { PlayItem } from '../../models/play-item.model';
import { Video } from '../../models/video.model';
import { StreamService } from '../../services/stream.service';
import { PlayerStateService } from '../../state/player-state.service';
import { AgoraWatchService } from '../../services/agora/agora-watch.service';
import { LiveStream } from '../../models/live-stream.model';
import { RecordingSocketService } from '../../services/socket/recording.service';

// Helper: compare arrays by (type,id)
const idsKey = (arr: PlayItem[]) => arr.map(x => `${x.type}:${x.id}`).join('|');

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
  @ViewChild('agoraContainer', { static: false }) agoraContainerRef!: ElementRef<HTMLElement>;
  @HostListener('window:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    const isTyping = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if (isTyping) return;

    if (e.key === 'ArrowLeft') { e.preventDefault(); this.previous(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); this.next(); }
  }

  private destroy$ = new Subject<void>();

  // UI state
  isPortrait = false;
  playlist: (PlayItem | LiveStream)[] = [];
  currentIndex = 0;
  currentItem: PlayItem | LiveStream | null = null;
  get hasMany() { return this.playlist.length > 1; }

  // Internal streams
  // private playlist$ = new BehaviorSubject<PlayItem[]>([]);
  private viewReady$ = new BehaviorSubject<boolean>(false);

  constructor(
    private videoService: VideoService,
    private route: ActivatedRoute,
    private streamService: StreamService,
    private router: Router,
    private seo: SeoService,
    private store: PlayerStateService,
    private agoraWatch: AgoraWatchService,
    private socket: RecordingSocketService
  ) { }

  ngOnInit() {
    this.setUpSeo();
    this.socket.connect();

    this.socket.recordingStopped$.pipe(takeUntil(this.destroy$)).subscribe(e => {
      this.next();
    })

    // 1) VOD: fetch once, shuffle once, cache
    const vod$ = this.videoService.getVideos().pipe(
      map(videos => videos.map(v => this.mapVod(v))),
      map(vods => this.shuffle(vods)),                         // <-- shuffle ONCE
      shareReplay({ bufferSize: 1, refCount: true })
    );

    // 2) LIVE: poll, sort deterministically, suppress repeats
    const live$ = timer(0, 15000).pipe(
      switchMap(() => this.streamService.getLiveStreams()),
      tap(lives => console.log('Fetched live streams:', lives)),
      map(lives => lives.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)))),// stable order
      // distinctUntilChanged((a, b) => idsKey(a) === idsKey(b)),               // only when changed
      shareReplay({ bufferSize: 1, refCount: true })
    );
    // const live$ = of([]);

    // 3) Merge without reshuffling; only emit when the merged ids actually change
    const playlist$ = combineLatest([live$, vod$]).pipe(
      // map(([lives, vods]) => [...vods]),
      map(([lives, vods]) => [...lives, ...vods]),
      // distinctUntilChanged((a, b) => idsKey(a) === idsKey(b))
    );

    playlist$
      .pipe(takeUntil(this.destroy$))
      .subscribe(list => {
        // Preserve current selection if possible
        const currentId = this.currentItem?.id;
        const currentType = this.currentItem?.type;

        this.playlist = list;

        const videoId = this.route.snapshot.paramMap.get("id");

        if (!!videoId) {
          const selectedIndex = this.playlist.map(p => `${p.id}`).indexOf(videoId);
          if (!!selectedIndex) {
            this.currentIndex = selectedIndex;
            this.currentItem = this.playlist[this.currentIndex];
            void this.tryPlayCurrent();
          }
        }

        if (currentId && currentType) {
          const idx = this.playlist.findIndex(x => x.id === currentId && x.type === currentType);
          if (idx >= 0) {
            this.currentIndex = idx;
            this.currentItem = this.playlist[idx];
            return; // keep playing current
          } else {
            // current item disappeared (e.g., live ended) → advance
            this.next();
            return;
          }
        }

        // First init
        if (!this.currentItem) {
          const firstLiveIndex = this.playlist.findIndex(i => i.type === 'live');
          this.currentIndex = firstLiveIndex >= 0 ? firstLiveIndex : 0;
          this.currentItem = this.playlist[this.currentIndex] ?? null;
          void this.tryPlayCurrent();
        }
      });

  }

  ngAfterViewInit(): void {
    this.viewReady$.next(true);
    void this.tryPlayCurrent();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();

    void this.agoraWatch.stop(); // ✅ stop Agora
    const v = this.playerRef?.nativeElement;
    if (v) { v.src = ''; v.load(); }
  }

  // Navigation
  next() {
    var curr = this.currentItem as LiveStream;
    if (curr?.type === 'live') {
      this.socket.leaveRoom(curr.channelName);
    }
    if (!this.playlist.length) return;
    this.currentIndex = (this.currentIndex + 1) % this.playlist.length;
    this.currentItem = this.playlist[this.currentIndex];
    void this.tryPlayCurrent();
  }

  previous() {
    if (!this.playlist.length) return;
    this.currentIndex = (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
    this.currentItem = this.playlist[this.currentIndex];
    void this.tryPlayCurrent();
  }

  select(i: number) {
    if (i < 0 || i >= this.playlist.length) return;
    this.currentIndex = i;
    this.currentItem = this.playlist[i];
    void this.tryPlayCurrent();
  }

  // Make this async (and call it with void)
  private async tryPlayCurrent() {
    if (!this.currentItem || !this.viewReady$.value) return;

    // stop any previous live session when switching items
    await this.agoraWatch.stop();

    const el = this.playerRef?.nativeElement;

    if (this.currentItem.type === 'live') {
      var curr = this.currentItem as LiveStream;
      // stop VOD element (if exists)
      if (el) {
        try {
          el.pause();
          (el as any).srcObject = null;
          el.removeAttribute('src');
          el.load();
        } catch { }
      }

      // Join Agora as audience and render into container
      const streamId = Number(this.currentItem.id); // your API id: 59
      const container = this.agoraContainerRef?.nativeElement;
      if (!container || Number.isNaN(streamId)) return;

      try {
        await this.agoraWatch.watch(curr.channelName, container);
      } catch (e) {
        console.warn('Failed to watch live stream:', e);
      }
      this.socket.joinRoom(curr.channelName);
      return;
    }

    // VOD path
    if (!el) return;

    try {
      (el as any).srcObject = null;
      el.removeAttribute('src');
      el.load();

      el.autoplay = true;
      el.src = (this.currentItem as any).src;
      await el.play();
    } catch (e) {
      console.warn('Failed to start VOD:', e);
    }
  }

  onVideoLoaded(video: HTMLVideoElement) {
    const aspectRatio = video.videoWidth / video.videoHeight;
    this.isPortrait = aspectRatio < 1;
    video.defaultMuted = false;
    video.muted = false;
    video.play().catch(() => { });
  }

  goToProfile() {
    const user =
      (this.currentItem as any)?.user ??
      (this.playlist[this.currentIndex] as any)?.user ??
      '';
    this.store.set(this.playlist[this.currentIndex])
    if (user) this.router.navigate(['/profile', user]);
  }


  // Helpers
  private setUpSeo() {
    const title = 'skriin AI TV';
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


  private shuffle<T>(input: T[]): T[] {
    const arr = input.slice();               // don't mutate the original
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
