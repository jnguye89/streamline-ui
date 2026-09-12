// watch.component.ts
import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  Renderer2,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
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
import { RecordingSocketService, ChatMessage } from '../../services/socket/recording.service';
import { FormsModule } from '@angular/forms';
import { GamepadFocusableDirective } from '../../directives/gamepad-focusable.directive';
import { GamepadNavigationService } from '../../services/gamepad-navigation.service';
import { DeviceAuthService } from '../../services/device-auth.service';
import { SafeUrlPipe } from '../../pipes/safe-url.pipe';
import { ChatColorPipe } from '../../pipes/chat-color.pipe';
import { environment } from '../../../environments/environment';
import { ChessDemoItem, ChessGameItem } from '../../models/chess/chess-game.model';
import { ChessService } from '../../services/chess/chess.service';
import { ChessGameComponent } from '../chess-game/chess-game.component';
import { ChessDemoComponent } from '../chess-demo/chess-demo.component';

const YOUTUBE_SOURCE = 'YOUTUBE';

// Slotted into the playlist in place of any real chess item whenever
// ChessService.listGames() comes back empty, so the feed always has
// *something* chess-shaped to discover rather than the feature silently
// disappearing the moment the last game ends. See ChessDemoComponent.
const CHESS_DEMO_ITEM: ChessDemoItem = { type: 'chess-demo', id: 'chess-demo' };

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
    CommonModule,
    GamepadFocusableDirective,
    SafeUrlPipe,
    ChatColorPipe,
    FormsModule,
    ChessGameComponent,
    ChessDemoComponent
  ],
  providers: [VideoService],
  templateUrl: './watch.component.html',
  styleUrl: './watch.component.scss'
})

export class WatchComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('player', { static: false }) playerRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('agoraContainer', { static: false }) agoraContainerRef!: ElementRef<HTMLElement>;
  @ViewChild('nextBtn', { static: true, read: ElementRef }) nextBtnRef!: ElementRef<HTMLElement>;
  @HostListener('window:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent) {
    if (this.dialog.openDialogs.length > 0) return;

    const t = e.target as HTMLElement | null;
    const isTyping = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if (isTyping) return;

    this.onUserActivity();
    // While a chess game is on screen, arrow keys move the board's own
    // cursor between squares (via GamepadNavigationService's spatial focus
    // movement over the board's gamepadFocusable squares - see
    // syncDpadActionsForCurrentItem) rather than paging the feed.
    if (this.currentItem?.type === 'chess') return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); this.previous(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); this.next(); }
  }

  @HostListener('window:mousemove')
  @HostListener('window:click')
  onUserActivity(): void {
    if (this.overlayHidden) this.overlayHidden = false;
    this.scheduleHide();
  }

  @HostListener('window:beforeunload')
  onBeforeUnload(): void {
    this.sendProgress(true);
  }

  private destroy$ = new Subject<void>();

  // UI state
  isPortrait = false;
  private _overlayHidden = false;
  get overlayHidden() { return this._overlayHidden; }
  set overlayHidden(value: boolean) {
    this._overlayHidden = value;
    if (value) {
      this.renderer.addClass(document.body, 'watch-overlay-hidden');
    } else {
      this.renderer.removeClass(document.body, 'watch-overlay-hidden');
    }
  }
  private currentVideoDuration = 0;
  private hideTimerRef: ReturnType<typeof setTimeout> | null = null;
  private readonly HIDE_DELAY_MS = 1 * 60 * 1000;
  private readonly MIN_DURATION_S = 1 * 60;
  // Up/down volume control on Watch (VOD only - see syncDpadActionsForCurrentItem)
  private readonly VOLUME_STEP = 10;
  volumeLevel = 100; // 0-100, bound in the template for the fading indicator
  showVolumeIndicator = false;
  private volumeIndicatorTimer: ReturnType<typeof setTimeout> | null = null;
  // Guards tryPlayCurrent() against overlapping calls (e.g. mashing the
  // D-pad through several videos quickly): each call captures its own
  // incrementing id and checks it's still the latest after every await -
  // see tryPlayCurrent() for what goes wrong without this.
  private playRequestId = 0;
  private progressPingRef: ReturnType<typeof setInterval> | null = null;
  private readonly PROGRESS_PING_MS = 10 * 1000;
  private readonly RESUME_NEAR_END_S = 15;
  private readonly VOD_PAGE_SIZE = 20;
  private readonly VOD_PREFETCH_THRESHOLD = 5;
  // Where the chess slot lands in the feed - randomized once per page
  // load (not re-rolled on every chess$/live$ poll, or its position would
  // jump around while someone's mid-scroll) so it doesn't dominate what a
  // visitor sees first every single time, while still surfacing early.
  // 1..9 => the 2nd through 10th item, 0-indexed - see the playlist$ merge.
  private readonly chessInsertIndex = 1 + Math.floor(Math.random() * 9);
  playlist: (PlayItem | LiveStream | ChessGameItem | ChessDemoItem)[] = [];
  currentIndex = 0;
  currentItem: PlayItem | LiveStream | ChessGameItem | ChessDemoItem | null = null;
  get hasMany() { return this.playlist.length > 1; }

  // Internal streams
  // private playlist$ = new BehaviorSubject<PlayItem[]>([]);
  private viewReady$ = new BehaviorSubject<boolean>(false);
  private vodItems$ = new BehaviorSubject<PlayItem[]>([]);
  private isLoadingMoreVods = false;
  private vodExhausted = false;
  private lastViewCountedId: string | number | null = null;
  // There used to be a preload/prefetch subsystem here (a real "hot"
  // <video> element for the very next item, later narrowed to just <link
  // rel="prefetch"> tags for a window of upcoming items after the same bug
  // showed up again with the real element). Both versions turned out to be
  // the actual cause of the real player intermittently going blank on fast
  // browsing sessions - first by contending with it for a scarce hardware
  // decode session (kiosk/TV hardware tends to have very few), and even
  // after narrowing to link-only prefetching, an unbounded number of
  // full-video background fetches piling up over a longer session (10+
  // videos) still appears able to starve or hang the real player's own
  // request - browsers don't reliably cancel an in-flight prefetch just
  // because its <link> tag was removed from the DOM. Recoverable only by a
  // full reload, which is what actually freed everything up. Removed
  // entirely rather than narrowed further: the browser's own buffering of
  // whatever is actually on screen is enough, and it can't compete with
  // itself.

  // YouTube embeds have to autoplay muted (browser policy), then get
  // unmuted through the IFrame Player API once loaded - see
  // onYoutubeIframeLoad()/loadYoutubeIframeApi() and youtubeEmbedSrc's
  // comment for why. `any`-typed: this project doesn't carry YouTube's
  // IFrame API type definitions, and the API itself is loaded from a
  // plain <script> tag rather than an npm package.
  private youtubePlayer: any = null;
  private youtubeApiReady$: Promise<void> | null = null;
  // Which item's video the current this.youtubePlayer was created for, so
  // onYoutubeIframeLoad() can tell "the user navigated to a new video" apart
  // from "the IFrame API just did its own internal navigation on the iframe
  // it's bound to" - both fire the iframe's (load) event, but only the
  // former should tear down and recreate the player. Left unguarded, this
  // was a reload loop: binding a fresh YT.Player to an *existing* iframe
  // makes the API itself repoint that iframe's src as part of its handshake,
  // which fires another (load) event, which recreated the player again,
  // forever - visible in the network tab as an endless stream of canceled
  // player_embed/next requests and the video never actually rendering.
  private youtubePlayerItemId: string | number | null = null;

  // Live chat (floating overlay, TikTok-style): fixed-size buffer, oldest
  // message drops off as a new one comes in.
  private readonly CHAT_MAX_VISIBLE = 12;
  chatMessages: (ChatMessage & { key: string })[] = [];
  chatText = '';

  constructor(
    private videoService: VideoService,
    private route: ActivatedRoute,
    private streamService: StreamService,
    private router: Router,
    private seo: SeoService,
    private store: PlayerStateService,
    private agoraWatch: AgoraWatchService,
    private socket: RecordingSocketService,
    private dialog: MatDialog,
    private gamepadNav: GamepadNavigationService,
    private renderer: Renderer2,
    private deviceAuth: DeviceAuthService,
    private chessService: ChessService
  ) { }

  ngOnInit() {
    this.syncDpadActionsForCurrentItem();
    // LT/RT: fixed app-wide seek jump (Controller Map v2) - see seekBy().
    // Y: Play/pause - the map leaves Y unused on Watch/Yap ("nothing"),
    // so it's free here without touching what Y does on Live/Podcast
    // (show/hide chat) or overloading A, which stays a plain "activate
    // whatever's focused" everywhere on this page.
    this.gamepadNav.setAuxButtonActions({
      lt: () => this.seekBy(-10),
      rt: () => this.seekBy(30),
      y: () => this.togglePlayPause(),
    });
    // Right stick left/right: continuous analog scrub (map: "push distance
    // = speed") - same seekBy() the LT/RT taps use, just with a variable
    // delta computed by GamepadNavigationService instead of a fixed one.
    this.gamepadNav.setRightStickScrubAction((delta) => this.seekBy(delta));
    this.setUpSeo();
    this.socket.connect();

    this.socket.recordingStopped$.pipe(takeUntil(this.destroy$)).subscribe(e => {
      this.next();
    })

    this.socket.chatMessage$.pipe(takeUntil(this.destroy$)).subscribe(msg => this.onChatMessage(msg));

    // Catches a navigation that reuses this exact component instance (e.g.
    // clicking a chess "your turn" notification's View board action while
    // already sitting on /watch/:id for something else) - Angular's default
    // route reuse strategy keeps this component alive across param-only
    // changes on the same route, so ngOnInit doesn't re-run and nothing else
    // reacts to the param actually changing. No-ops harmlessly if the
    // playlist hasn't loaded that id yet; the playlist$ subscription's own
    // call to selectFromRouteId() covers that case once it has.
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.selectFromRouteId();
    });

    // 1) VOD: server-randomized, no-repeat feed, paged in as the playlist is
    // consumed (see loadMoreVods / next())
    const vod$ = this.vodItems$.asObservable();
    this.loadMoreVods();

    // Cross-device resume: if logged in and not deep-linked to a specific
    // video, jump to whatever they were last watching (any device, any time).
    if (this.deviceAuth.getAccessToken() && !this.route.snapshot.paramMap.get('id')) {
      this.applyContinueWatching();
    }

    // 2) LIVE: poll, sort deterministically, suppress repeats
    const live$ = timer(0, 15000).pipe(
      switchMap(() => this.streamService.getLiveStreams()),
      tap(lives => console.log('Fetched live streams:', lives)),
      map(lives => lives.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)))),// stable order
      // distinctUntilChanged((a, b) => idsKey(a) === idsKey(b)),               // only when changed
      shareReplay({ bufferSize: 1, refCount: true })
    );
    // const live$ = of([]);

    // 2b) CHESS: same polling pattern as live streams, but only ever one
    // slot in the feed (not one per open/active game) - pick whichever
    // single item is most useful to a visitor who just arrived:
    //   1. A game with its black seat still open - join it directly.
    //   2. Otherwise, the synthetic demo placeholder - start a new one.
    // The one exception is a game the viewer is actually seated in: once a
    // second player joins, a game flips 'waiting' -> 'active' and stops
    // being an "open seat", which would otherwise make it fall out of both
    // buckets above and vanish from underneath the two people playing it
    // the moment this poll refreshes. See ChessGameComponent.mySeat for the
    // same identity check used to gate the resign/draw-offer controls.
    const chess$ = timer(0, 15000).pipe(
      switchMap(() => this.chessService.listGames()),
      map((games): (ChessGameItem | ChessDemoItem)[] => {
        const openSeat = games.find(g => g.status === 'waiting' && !g.blackUser);
        if (openSeat) return [openSeat];

        const uid = this.deviceAuth.getCurrentUserId();
        const mine = uid
          ? games.find(g => g.whiteUser?.auth0UserId === uid || g.blackUser?.auth0UserId === uid)
          : undefined;
        if (mine) return [mine];

        return [CHESS_DEMO_ITEM];
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );

    // 3) Merge without reshuffling; only emit when the merged ids actually change
    const playlist$ = combineLatest([live$, chess$, vod$]).pipe(
      // map(([lives, vods]) => [...vods]),
      map(([lives, chessGames, vods]) => {
        const videos = [...lives, ...vods];
        // Clamped to the currently-known video count so this never throws
        // for a short list (e.g. before more VOD pages have loaded) - chess
        // just settles into its final spot once enough videos are in.
        const insertAt = Math.min(this.chessInsertIndex, videos.length);
        return [...videos.slice(0, insertAt), ...chessGames, ...videos.slice(insertAt)];
      }),
      // distinctUntilChanged((a, b) => idsKey(a) === idsKey(b))
    );

    playlist$
      .pipe(takeUntil(this.destroy$))
      .subscribe(list => {
        // Preserve current selection if possible
        const currentId = this.currentItem?.id;
        const currentType = this.currentItem?.type;

        this.playlist = list;

        // A route :id (e.g. a deep link, or a chess "View board" notification
        // navigating here) always wins over "preserve whatever was already
        // playing" below - see selectFromRouteId().
        if (this.selectFromRouteId()) {
          return;
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
          setTimeout(() => {
            console.log('Requesting focus on next button:', this.nextBtnRef?.nativeElement);
            if (this.nextBtnRef?.nativeElement) {
              this.gamepadNav.requestFocus(this.nextBtnRef.nativeElement);
            }
          });
        }
      });

  }

  // Selects whichever playlist item matches the route's current :id param,
  // if any and if it's actually in the (already-loaded) playlist yet.
  // Pulled out of the playlist$ subscription above so it can also be called
  // directly from the paramMap subscription in ngOnInit - Angular reuses
  // this component across param-only navigations on the 'watch/:id' route
  // (see app.routes.ts), so ngOnInit itself won't re-run and a plain
  // route.snapshot read inside the playlist$ pipeline would otherwise only
  // pick up a new id on the next unrelated poll tick (up to 15s later).
  // Returns whether a match was applied, so callers can treat it as
  // authoritative over other selection logic (see the early `return` above).
  private selectFromRouteId(): boolean {
    const videoId = this.route.snapshot.paramMap.get('id');
    if (!videoId) return false;

    const selectedIndex = this.playlist.map(p => `${p.id}`).indexOf(videoId);
    if (selectedIndex === -1) return false; // not (yet) in the loaded playlist

    this.currentIndex = selectedIndex;
    this.currentItem = this.playlist[this.currentIndex];
    void this.tryPlayCurrent();
    return true;
  }

  ngAfterViewInit(): void {
    this.viewReady$.next(true);
    void this.tryPlayCurrent();
  }

  ngOnDestroy() {
    this.stopProgressPing();
    this.sendProgress(true);
    this.clearAutoHide();
    if (this.volumeIndicatorTimer) { clearTimeout(this.volumeIndicatorTimer); this.volumeIndicatorTimer = null; }
    this.youtubePlayer?.destroy?.();
    this.gamepadNav.clearDpadActions();
    this.gamepadNav.clearAuxButtonActions();
    this.gamepadNav.clearRightStickScrubAction();
    this.destroy$.next();
    this.destroy$.complete();

    const curr = this.currentItem as LiveStream;
    if (curr?.type === 'live') {
      this.socket.leaveRoom(curr.channelName);
    }

    void this.agoraWatch.stop();
    const v = this.playerRef?.nativeElement;
    if (v) { v.src = ''; v.load(); }
  }

  // Navigation
  next() {
    this.stopProgressPing();
    this.sendProgress();
    var curr = this.currentItem as LiveStream;
    if (curr?.type === 'live') {
      this.socket.leaveRoom(curr.channelName);
    }
    if (!this.playlist.length) return;
    if (this.currentIndex >= this.playlist.length - this.VOD_PREFETCH_THRESHOLD) {
      this.loadMoreVods();
    }
    this.currentIndex = (this.currentIndex + 1) % this.playlist.length;
    this.currentItem = this.playlist[this.currentIndex];
    this.clearAutoHide();
    void this.tryPlayCurrent();
  }

  previous() {
    this.stopProgressPing();
    this.sendProgress();
    if (!this.playlist.length) return;
    this.currentIndex = (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
    this.currentItem = this.playlist[this.currentIndex];
    this.clearAutoHide();
    void this.tryPlayCurrent();
  }

  select(i: number) {
    if (i < 0 || i >= this.playlist.length) return;
    this.stopProgressPing();
    this.sendProgress();
    this.currentIndex = i;
    this.currentItem = this.playlist[i];
    this.clearAutoHide();
    void this.tryPlayCurrent();
  }

  // Auto-hide overlay
  private scheduleHide(): void {
    if (this.hideTimerRef) clearTimeout(this.hideTimerRef);
    if (this.currentItem?.type !== 'vod' || this.currentVideoDuration < this.MIN_DURATION_S) return;
    this.hideTimerRef = setTimeout(() => { this.overlayHidden = true; }, this.HIDE_DELAY_MS);
  }

  private clearAutoHide(): void {
    if (this.hideTimerRef) { clearTimeout(this.hideTimerRef); this.hideTimerRef = null; }
    this.overlayHidden = false;
    this.currentVideoDuration = 0;
  }

  // Make this async (and call it with void)
  private async tryPlayCurrent() {
    if (!this.currentItem || !this.viewReady$.value) return;

    // next()/previous()/select() each fire this off with `void` rather
    // than awaiting it, so mashing through several videos quickly (e.g.
    // D-pad right, right, right) starts a new call before an earlier one
    // has finished awaiting agoraWatch.stop()/watch()/el.play(). Every
    // reference below used to go through the live `this.currentItem`
    // field instead of a local snapshot, so an older call could resume
    // after a newer one had already moved on, read the *new* item's type
    // partway through acting on the *old* one, and tear down or repoint
    // the shared <video> element for the wrong item - sometimes leaving it
    // with no src at all. `item` pins this call to the item it started
    // with; `requestId` lets it detect it's been superseded and stop
    // touching shared state (rather than the reverse - trying to also
    // guard `next()` itself, which would either drop presses or serialize
    // them behind a slow agoraWatch.stop(), making the controls feel
    // laggy instead of just fixing the actual data race).
    const item = this.currentItem;
    const requestId = ++this.playRequestId;
    const stale = () => requestId !== this.playRequestId;

    // stop any previous live session when switching items
    await this.agoraWatch.stop();
    if (stale()) return;
    this.chatMessages = [];
    this.syncDpadActionsForCurrentItem();

    const el = this.playerRef?.nativeElement;

    // Tear down any YouTube player wrapper left over from the previous item
    // whenever the new one isn't also a YouTube embed - otherwise it just
    // sits there holding a postMessage channel open to an iframe that's
    // about to be repointed at something else entirely.
    if (this.youtubePlayer && !this.isYouTube(item)) {
      this.youtubePlayer.destroy?.();
      this.youtubePlayer = null;
      this.youtubePlayerItemId = null;
    }

    if (item.type === 'live') {
      var curr = item as LiveStream;
      this.releasePlayerElement(el); // stop VOD element (if exists)

      // Join Agora as audience and render into container
      const streamId = Number(item.id); // your API id: 59
      const container = this.agoraContainerRef?.nativeElement;
      if (!container || Number.isNaN(streamId)) return;

      try {
        await this.agoraWatch.watch(curr.channelName, container);
      } catch (e) {
        console.warn('Failed to watch live stream:', e);
      }
      if (stale()) return;
      this.socket.joinRoom(curr.channelName);
      return;
    }

    if (item.type === 'chess' || item.type === 'chess-demo') {
      // No <video>/Agora surface for chess (real or the demo placeholder) -
      // just release whatever was playing. Board rendering + (for a real
      // game) its own socket room membership are owned by
      // ChessGameComponent/ChessDemoComponent, mounted via *ngIf in the
      // template and keyed to currentItem there.
      this.releasePlayerElement(el);
      return;
    }

    // VOD path - always release the <video> element first. YouTube-sourced
    // items play through the iframe instead (see youtubeEmbedSrc), so the
    // element is left empty rather than pointed at a src it can't actually
    // load. Deliberately not calling el.pause() here: it can synchronously
    // fire the 'pause' event -> onVideoPause() -> sendProgress(), which by
    // this point would use the *new* currentItem's id with the *old*
    // element's currentTime.
    if (el) {
      try {
        (el as any).srcObject = null;
        el.removeAttribute('src');
        el.load();
      } catch { }
    }

    if (this.isYouTube(item)) return;
    if (!el) return;

    try {
      el.autoplay = true;
      el.src = (item as any).src;
      await el.play();
      // A still-newer switch happened while play() was in flight - don't
      // leave this now-stale item's video sitting there loaded/playing.
      if (stale()) this.releasePlayerElement(el);
    } catch (e) {
      console.warn('Failed to start VOD:', e);
    }
  }

  // Shared by the live and chess branches above - neither plays through the
  // <video> element, so whatever it was previously showing (a VOD, or
  // nothing) needs to be released the same way in both cases.
  private releasePlayerElement(el: HTMLVideoElement | null | undefined): void {
    if (!el) return;
    try {
      el.pause();
      (el as any).srcObject = null;
      el.removeAttribute('src');
      el.load();
    } catch { }
  }

  // The D-pad keeps paging the feed no matter what's on screen, chess
  // included - so left/right always reach previous()/next() here, even for
  // a live game. The board's own square-to-square cursor instead moves via
  // the *left stick*: GamepadNavigationService only lets the stick fall
  // through to a page-level dpadActions override when that override was
  // registered with `includeStick` (see setDpadActions()'s doc comment) -
  // this one deliberately isn't, so a stick tilt skips straight past these
  // bindings to the generic spatial-focus movement underneath
  // (GamepadNavigationService.moveFocus), which is what actually walks
  // between the board's gamepadFocusable squares. Up/down have no
  // page-level meaning for chess (no volume surface to adjust, unlike
  // VOD), but still get claimed here as no-ops - left unclaimed, they'd
  // fall through to that same generic movement too, and the D-pad would
  // end up moving the board vertically while only being freed of it
  // horizontally.
  private syncDpadActionsForCurrentItem(): void {
    this.gamepadNav.setDpadActions({
      left: () => { this.onUserActivity(); this.previous(); },
      right: () => { this.onUserActivity(); this.next(); },
      // Volume only makes sense for VOD (native <video> or YouTube) - live
      // and the chess-demo placeholder have no volume surface to adjust,
      // so up/down are left unclaimed there and keep panning UI focus via
      // GamepadNavigationService.moveFocus, same as before this feature.
      ...(this.currentItem?.type === 'vod' ? {
        up: () => { this.onUserActivity(); this.adjustVolume(this.VOLUME_STEP); },
        down: () => { this.onUserActivity(); this.adjustVolume(-this.VOLUME_STEP); },
      } : {}),
      // Chess: no volume surface either, but see the comment above - these
      // still need claiming (as no-ops) purely to keep the D-pad off the
      // board vertically too.
      ...(this.currentItem?.type === 'chess' ? {
        up: () => {},
        down: () => {},
      } : {}),
    });
  }

  // Applies a volume step to whichever surface is actually playing (native
  // <video>.volume, or the YouTube IFrame Player's setVolume - the two
  // never overlap since isYouTube() is a subtype of the 'vod' currentItem
  // this is only ever called for) and flashes the on-screen indicator.
  private adjustVolume(delta: number): void {
    this.volumeLevel = Math.min(100, Math.max(0, this.volumeLevel + delta));
    if (this.isYouTube(this.currentItem)) {
      // Unlike togglePlayPause()/seekBy() below, this used to call
      // setVolume() off a bare `?.` null-check on the player itself - but
      // `new YT.Player(...)` returns a stub object immediately, before the
      // real API attaches (see onYoutubeIframeLoad()'s onReady handler), so
      // there's a real window where youtubePlayer is truthy but setVolume
      // isn't a function yet. A volume press in that window threw an
      // uncaught TypeError. Guard the method itself, same as the other two.
      if (typeof this.youtubePlayer?.setVolume === 'function') {
        this.youtubePlayer.setVolume(this.volumeLevel);
      }
    } else {
      const video = this.playerRef?.nativeElement;
      if (video) video.volume = this.volumeLevel / 100;
    }
    this.flashVolumeIndicator();
  }

  /**
   * Y ("Play/pause" - repurposed from the map's unused Watch/Yap slot for
   * Y, see ngOnInit): toggles whichever surface is actually playing. Only
   * meaningful for VOD, same scoping as seekBy() below and adjustVolume()
   * above - live/chess have no local play/pause state of their own here.
   */
  private togglePlayPause(): void {
    if (this.currentItem?.type !== 'vod') return;
    this.onUserActivity();

    if (this.isYouTube(this.currentItem)) {
      const player = this.youtubePlayer;
      if (!player?.getPlayerState || !player?.playVideo || !player?.pauseVideo) return;
      // YT.PlayerState.PLAYING === 1; treat anything else (paused, ended,
      // buffering, cued) as "not playing" for toggle purposes.
      if (player.getPlayerState() === 1) {
        player.pauseVideo();
      } else {
        player.playVideo();
      }
      return;
    }

    const video = this.playerRef?.nativeElement;
    if (!video) return;
    if (video.paused) { void video.play(); } else { video.pause(); }
  }

  /**
   * Shared by LT/RT's fixed "Jump -10s"/"Jump +30s" per tap and the right
   * stick's continuous analog scrub (both Controller Map v2) - nudges the
   * play position on whichever surface is actually playing by whatever
   * delta the caller already computed. A fixed app-wide action per the
   * map, not a per-page override - so it's a deliberate no-op for anything
   * that isn't a seekable VOD (live and chess have no timeline to seek,
   * same as the map's own "no-op on live streams" note for this gesture).
   */
  private seekBy(deltaSeconds: number): void {
    if (this.currentItem?.type !== 'vod') return;
    this.onUserActivity();

    if (this.isYouTube(this.currentItem)) {
      const player = this.youtubePlayer;
      if (!player?.getCurrentTime || !player?.seekTo) return;
      const duration = player.getDuration?.() ?? Infinity;
      const next = Math.min(duration, Math.max(0, player.getCurrentTime() + deltaSeconds));
      player.seekTo(next, true);
      return;
    }

    const video = this.playerRef?.nativeElement;
    if (!video) return;
    const duration = Number.isNaN(video.duration) ? Infinity : video.duration;
    video.currentTime = Math.min(duration, Math.max(0, video.currentTime + deltaSeconds));
  }

  private flashVolumeIndicator(): void {
    this.showVolumeIndicator = true;
    if (this.volumeIndicatorTimer) clearTimeout(this.volumeIndicatorTimer);
    this.volumeIndicatorTimer = setTimeout(() => {
      this.showVolumeIndicator = false;
      this.volumeIndicatorTimer = null;
    }, 1200);
  }

  // YouTube exposes no raw playable file - only its <iframe> embed player -
  // so those items skip the <video> element entirely and render through the
  // iframe/safeUrl binding in the template instead.
  isYouTube(item: PlayItem | LiveStream | ChessGameItem | ChessDemoItem | null): boolean {
    return item?.type === 'vod' && item.source === YOUTUBE_SOURCE;
  }

  get youtubeEmbedSrc(): string {
    if (this.currentItem?.type !== 'vod') return '';
    const url = this.currentItem.src;
    if (!url) return '';

    const separator = url.includes('?') ? '&' : '?';
    // mute is required for autoplay to be allowed by browsers; playsinline
    // keeps it from forcing fullscreen on mobile, matching the <video
    // playsinline> behavior used for regular VODs. enablejsapi+origin are
    // what let onYoutubeIframeLoad() below actually unmute this after it
    // starts playing - without enablejsapi, the postMessage-based IFrame
    // Player API has no permission to control an iframe it didn't create,
    // so the mute=1 here would otherwise never get undone (that was the
    // actual bug: YouTube embeds played, but stayed muted forever, unlike
    // regular VODs which explicitly unmute in onVideoLoaded()).
    const origin = encodeURIComponent(window.location.origin);
    return `${url}${separator}autoplay=1&mute=1&playsinline=1&enablejsapi=1&origin=${origin}`;
  }

  // Fires on every iframe (load) event - which includes both a genuine
  // navigation to a new video (Angular's [src] binding pointing the iframe
  // somewhere new) AND the IFrame API's own internal navigation on the
  // iframe it's bound to as part of attaching itself. Only the first should
  // tear down and recreate the player - reacting to the second the same way
  // recreates the player, which re-triggers the API's internal navigation,
  // which fires (load) again, forever (see youtubePlayerItemId above). The
  // item id (not the iframe element, which never changes) is what tells
  // these two cases apart.
  async onYoutubeIframeLoad(): Promise<void> {
    if (!this.isYouTube(this.currentItem)) return;
    const itemId = (this.currentItem as { id: string | number }).id;
    if (this.youtubePlayer && this.youtubePlayerItemId === itemId) return;

    await this.loadYoutubeIframeApi();

    // The item can have moved on again while the API script load above was
    // in flight (only actually slow the very first time - see
    // loadYoutubeIframeApi() - but that's exactly when a burst of quick
    // D-pad presses is most likely to race it). Creating a player for an
    // item that's no longer current would either collide with whatever the
    // *actual* current item's own (load) event is about to do, or end up
    // talking to an iframe that's since navigated elsewhere - the
    // postMessage-target-origin-mismatch warnings that produces. Bail and
    // let the current item's own (load) event (already fired, or still to
    // come) drive the real setup instead.
    const stillCurrent = this.isYouTube(this.currentItem)
      && (this.currentItem as { id: string | number }).id === itemId;
    if (!stillCurrent) return;

    // NOT calling this.youtubePlayer?.destroy?.() here, even though it
    // looks like the obvious "tear down the old one first" step (and is
    // exactly what tryPlayCurrent() does when leaving YouTube entirely) -
    // per the IFrame API's own docs, destroy() *removes the <iframe>
    // element from the DOM*. This handler runs on that same iframe's
    // (load) event while it's still the one Angular's *ngIf is rendering
    // (two YouTube videos back to back never toggle *ngIf, so the element
    // is reused, only its [src] changes) - destroying it here rips out the
    // exact element the line right below tries to hand to a new YT.Player,
    // and does so *outside* Angular's own change detection, which still
    // believes that iframe exists. The visible result: the video area goes
    // permanently blank (Angular has no idea its element was pulled out
    // from under it) while everything else on the page keeps working,
    // fixed only by a full reload rebuilding the DOM from scratch - and
    // depending on timing, the requests below can also end up canceled or
    // stuck pending, since they were kicked off against an iframe that no
    // longer exists.
    // The IFrame API is built to hand an *existing* iframe to a new
    // YT.Player and re-point it (that's the "internal navigation" this
    // same handler already guards against re-triggering forever, see
    // youtubePlayerItemId above) - so the right move for a genuine
    // video-to-video switch is just to stop tracking the old JS wrapper
    // and let a fresh one take over the same element, not tear the element
    // down first.
    this.youtubePlayerItemId = itemId;
    this.youtubePlayer = new (window as any).YT.Player('watch-youtube-player', {
      events: {
        onReady: (e: {
          target: { unMute: () => void; playVideo: () => void; setVolume: (v: number) => void };
        }) => {
          e.target.unMute();
          // A fresh YT.Player always starts at its own default volume, not
          // whatever the user last set via adjustVolume() - push the
          // current level explicitly or switching YouTube videos would
          // silently reset volume to 100 every time.
          e.target.setVolume(this.volumeLevel);
          e.target.playVideo();
        },
      },
    });
  }

  // Injects YouTube's IFrame Player API script at most once and resolves
  // once it's ready to use - safe to call on every video load, subsequent
  // calls just await the same cached promise instead of re-injecting it.
  private loadYoutubeIframeApi(): Promise<void> {
    if (this.youtubeApiReady$) return this.youtubeApiReady$;

    const w = window as any;
    const ready = new Promise<void>((resolve) => {
      if (w.YT?.Player) {
        resolve();
        return;
      }
      const previous = w.onYouTubeIframeAPIReady;
      w.onYouTubeIframeAPIReady = () => {
        previous?.();
        resolve();
      };
      if (!document.getElementById('youtube-iframe-api-script')) {
        const script = document.createElement('script');
        script.id = 'youtube-iframe-api-script';
        script.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(script);
      }
    });
    this.youtubeApiReady$ = ready;
    return ready;
  }

  onVideoLoaded(video: HTMLVideoElement) {
    const aspectRatio = video.videoWidth / video.videoHeight;
    this.isPortrait = aspectRatio < 1;
    video.defaultMuted = false;
    video.muted = false;
    video.volume = this.volumeLevel / 100;
    this.applyResumeTimestamp(video);
    video.play().catch(() => { });
    this.currentVideoDuration = video.duration;
    this.scheduleHide();
  }

  onVideoPlay(): void {
    this.startProgressPing();
    this.registerView();
  }

  // Counts a view the moment a video actually starts playing, once per
  // video - not on every play/pause resume within the same video.
  private registerView(): void {
    if (this.currentItem?.type !== 'vod') return;
    const item = this.currentItem;
    if (this.lastViewCountedId === item.id) return;

    this.lastViewCountedId = item.id;
    item.viewCount = (item.viewCount ?? 0) + 1;
    this.videoService.addView(item.id).subscribe({ error: () => { } });
  }

  onVideoPause(): void {
    this.stopProgressPing();
    this.sendProgress();
  }

  private applyResumeTimestamp(video: HTMLVideoElement): void {
    if (this.currentItem?.type !== 'vod') return;
    if (!this.deviceAuth.getAccessToken()) return; // not logged in -> always starts at 0:00

    const resume = this.currentItem.resumeTimestamp;
    if (!resume || resume <= 0) return;

    // If they basically finished it last time, start over instead of resuming near the end
    if (!Number.isNaN(video.duration) && video.duration - resume <= this.RESUME_NEAR_END_S) return;

    if (resume < video.duration) video.currentTime = resume;
  }

  private startProgressPing(): void {
    if (this.progressPingRef) return;
    this.progressPingRef = setInterval(() => this.sendProgress(), this.PROGRESS_PING_MS);
  }

  private stopProgressPing(): void {
    if (this.progressPingRef) {
      clearInterval(this.progressPingRef);
      this.progressPingRef = null;
    }
  }

  private sendProgress(useBeacon = false): void {
    if (this.currentItem?.type !== 'vod') return;

    const token = this.deviceAuth.getAccessToken();
    if (!token) return; // anonymous viewing isn't tracked

    const el = this.playerRef?.nativeElement;
    if (!el) return;

    const timestamp = Math.floor(el.currentTime);
    const id = this.currentItem.id;

    // Keep the in-memory playlist item in sync so navigating back to this
    // video later in the session resumes from here, not the stale value
    // fetched on page load.
    this.currentItem.resumeTimestamp = timestamp;

    if (useBeacon) {
      const url = `${environment.baseUrl}/video/${id}/progress`;
      fetch(url, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ timestamp })
      }).catch(() => { });
      return;
    }

    this.videoService.updateProgress(id, timestamp).subscribe({ error: () => { } });
  }

  // Gates the bottom-bar "Play Chess" button (see startChessGame below):
  // shown on the demo placeholder (nobody to interrupt) and while
  // spectating a real game, but hidden once you're actually seated in the
  // one currently on screen - clicking it there would abandon your own
  // game to start a second one, which is never what a seated player wants.
  get canPlayChess(): boolean {
    if (this.currentItem?.type === 'chess-demo') return true;
    if (this.currentItem?.type !== 'chess') return false;

    const uid = this.deviceAuth.getCurrentUserId();
    if (!uid) return true; // not logged in - can't possibly be seated yet

    const game = this.currentItem;
    const isSeated = game.whiteUser?.auth0UserId === uid || game.blackUser?.auth0UserId === uid;
    return !isSeated;
  }

  // Starts a brand-new game regardless of what's currently on screen, and
  // jumps straight to it rather than waiting for the next 15s chess$ poll.
  startChessGame(): void {
    if (!this.deviceAuth.getAccessToken()) {
      this.router.navigate(['/login']);
      return;
    }

    this.chessService.createGame().subscribe({
      next: (game) => {
        const item: ChessGameItem = { ...game, type: 'chess' };
        const exists = this.playlist.some(p => p.type === 'chess' && p.id === item.id);
        if (!exists) this.playlist = [item, ...this.playlist];
        const idx = this.playlist.findIndex(p => p.type === 'chess' && p.id === item.id);
        if (idx >= 0) this.select(idx);
      },
      error: () => console.warn('Failed to start a new chess game')
    });
  }

  goToProfile() {
    // A chess game has two players (white/black), not one owning profile to
    // jump to - and PlayerStateService's continue-watching store is typed
    // for PlayItem | LiveStream only, so chess items (and the demo
    // placeholder, which is nobody's profile at all) are excluded here
    // rather than widening that store to persist chess as "continue
    // watching" state (which the same reasoning in applyContinueWatching()
    // above already argues against).
    const item = this.playlist[this.currentIndex];
    if (!item || item.type === 'chess' || item.type === 'chess-demo') return;

    const user = (item as any)?.user ?? '';
    this.store.set(item);
    if (user) this.router.navigate(['/profile', user]);
  }

  private onChatMessage(msg: ChatMessage): void {
    const curr = this.currentItem as LiveStream;
    if (curr?.type !== 'live' || msg.roomId !== curr.channelName) return;

    // Fixed-size window: newest message pushes in at the bottom, oldest
    // falls off the top once the buffer is full - no timed fade-out.
    const entry = { ...msg, key: `${msg.ts}-${Math.random().toString(36).slice(2)}` };
    this.chatMessages = [...this.chatMessages, entry].slice(-this.CHAT_MAX_VISIBLE);
  }

  sendChat(): void {
    const curr = this.currentItem as LiveStream;
    const text = this.chatText.trim();
    if (!text || curr?.type !== 'live') return;

    this.socket.sendChat(curr.channelName, text);
    this.chatText = '';
  }

  trackChatMessage(_: number, m: ChatMessage & { key: string }): string {
    return m.key;
  }

  onLike(): void {
    if (this.currentItem?.type !== 'vod') return;
    const item = this.currentItem;
    if (item.liked) return;

    item.liked = true;
    item.likeCount = (item.likeCount ?? 0) + 1;
    this.videoService.addLike(item.id).subscribe({ error: () => { } });
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
    return {
      type: 'vod',
      id: (v as any).id ?? crypto.randomUUID(),
      title: (v as any).title ?? (v as any).name ?? 'Video',
      user: (v as any).user,
      src: v.processedPath ?? v.videoPath,
      thumbnail: (v as any).thumbnail,
      isProcessed: !!v.processedPath,
      resumeTimestamp: v.resumeTimestamp,
      viewCount: v.viewCount,
      likeCount: v.likeCount,
      liked: v.liked,
      source: v.source
    };
  }

  private isSame(a: PlayItem, b: PlayItem) {
    if (a.type !== b.type) return false;
    if (a.type === 'live') return a.id === b.id// || a.wssUrl === b.wssUrl;
    return a.id === b.id || a.src === (b as any).src;
  }

  // Fetches the next page from the server's randomized, no-repeat feed and
  // appends it. The server only dedupes for logged-in users, so unseen ids
  // are also filtered here as a safety net for anonymous viewers; if a page
  // comes back with nothing new, stop prefetching and let next()/previous()
  // fall back to wrapping around the playlist already loaded.
  private loadMoreVods(): void {
    if (this.isLoadingMoreVods || this.vodExhausted) return;
    this.isLoadingMoreVods = true;

    this.videoService.getVideos(this.VOD_PAGE_SIZE)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (videos) => {
          // mapVod() throwing on a single malformed record used to leave
          // isLoadingMoreVods stuck true forever (it's only reset at the
          // bottom of this callback) - loadMoreVods() would then silently
          // no-op on every future call (see the guard above), permanently
          // disabling pagination for the rest of the session with no error
          // surfaced anywhere. Once that happens, next()/previous() just
          // keep wrapping around whatever was already loaded - which, if
          // it happened right as the player was mid-switch, could look a
          // lot like the d-pad "stopped working" even though it's actually
          // still doing something, just never anything new.
          try {
            const existingIds = new Set(this.vodItems$.value.map(v => v.id));
            const fresh = videos
              .map(v => this.mapVod(v))
              .filter(v => !existingIds.has(v.id));

            if (fresh.length === 0) {
              this.vodExhausted = true;
            } else {
              this.vodItems$.next([...this.vodItems$.value, ...fresh]);
            }
          } catch (e) {
            console.error('[WatchComponent] loadMoreVods() failed to process a page - will retry on the next threshold hit', e);
          }
          this.isLoadingMoreVods = false;
        },
        error: () => { this.isLoadingMoreVods = false; }
      });
  }

  // Prepends the last video the user was watching (on any device) and jumps
  // to it. Doesn't interrupt a live stream that's already playing by the
  // time this resolves.
  private applyContinueWatching(): void {
    this.videoService.getContinueWatching()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (video) => {
          if (!video) return;
          const item = this.mapVod(video);

          const current = this.vodItems$.value;
          if (!current.some(v => v.id === item.id)) {
            this.vodItems$.next([item, ...current]);
          }

          if (this.currentItem?.type !== 'live' && this.currentItem?.type !== 'chess' && this.currentItem?.type !== 'chess-demo') {
            const idx = this.playlist.findIndex(p => p.type === 'vod' && p.id === item.id);
            if (idx >= 0) {
              this.currentIndex = idx;
              this.currentItem = this.playlist[idx];
              this.clearAutoHide();
              void this.tryPlayCurrent();
            }
          }
        },
        error: () => { }
      });
  }
}
