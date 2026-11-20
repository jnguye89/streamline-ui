// mahjong-demo.component.ts
//
// The mahjong tile in the watch feed - same idea as the chess, checkers and
// poker previews: a table that plays itself, so the tile looks alive like the
// videos around it, with a "Press to play" call to action on top.
//
// It's the real game: mahjong's own engine and TableStore (in demo mode -
// four bots, nothing offered to a player, no sound), drawn by the same table
// components /play/mahjong uses, watched over seat 0's shoulder. Left out on
// purpose: TvInputService (it would grab the watch page's keys and
// controller), the controls legend, the "Back to watch" button and the
// overlays. The 1920×1080 stage is scaled to fit the tile.
//
// Pure decoration: actually playing is delegated back up via `join`, which
// WatchComponent turns into a navigation to /play/mahjong.
import { isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  NgZone,
  OnInit,
  Output,
  PLATFORM_ID,
  ViewChild,
  ViewEncapsulation,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

import { GamepadFocusableDirective } from '../../directives/gamepad-focusable.directive';
import { CalloutsComponent } from '../../mahjong/callout/callouts.component';
import { CenterBoxComponent } from '../../mahjong/center/center-box.component';
import { providePlaceholderEngine } from '../../mahjong/engine/engine-token';
import { HandComponent } from '../../mahjong/hand/hand.component';
import { RoundInfoComponent } from '../../mahjong/hud/hud.components';
import { PondComponent } from '../../mahjong/pond/pond.component';
import { OpponentSeatComponent } from '../../mahjong/seat/opponent-seat.component';
import { SelfCardComponent } from '../../mahjong/seat/self-card.component';
import { providePlaceholderSeatVideo } from '../../mahjong/seat-video/seat-video';
import { SoundService } from '../../mahjong/sound.service';
import { TableStore } from '../../mahjong/table-store.service';

const STAGE_W = 1920;
const STAGE_H = 1080;
// Pause on the final scores before dealing a fresh game.
const RESTART_MS = 4000;
const NAMES = ['Dumpling', 'Mochi', 'Boba', 'Taro'] as const;

@Component({
  selector: 'app-mahjong-demo',
  standalone: true,
  imports: [
    GamepadFocusableDirective,
    CalloutsComponent,
    CenterBoxComponent,
    HandComponent,
    OpponentSeatComponent,
    PondComponent,
    RoundInfoComponent,
    SelfCardComponent,
  ],
  providers: [TableStore, SoundService, providePlaceholderEngine(), providePlaceholderSeatVideo()],
  // Unencapsulated, like MahjongComponent: the table layout (.mj-stage,
  // .mj-seat-top, ...) and tokens live in mahjong.component.css, which only
  // ships with /play/mahjong otherwise.
  encapsulation: ViewEncapsulation.None,
  templateUrl: './mahjong-demo.component.html',
  styleUrls: ['../../mahjong/mahjong.component.css', './mahjong-demo.component.scss'],
  host: { class: 'app-mahjong-demo' },
})
export class MahjongDemoComponent implements OnInit, AfterViewInit {
  @Output() join = new EventEmitter<void>();
  @ViewChild('stageArea', { static: true }) stageArea!: ElementRef<HTMLElement>;

  protected readonly store = inject(TableStore);
  protected readonly scale = signal(0.5);
  protected readonly seats = computed(() => {
    const at = this.store.seatAt();
    const v = this.store.view();
    if (!v) return null;
    return { bottom: at('bottom')!, right: at('right')!, top: at('top')!, left: at('left')! };
  });

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // A quick game is one East round; once it's over, deal a new one.
    effect(() => {
      if (this.store.view()?.phase !== 'game-over' || this.restartTimer) return;
      this.restartTimer = setTimeout(() => {
        this.restartTimer = null;
        this.store.startDemo(NAMES);
      }, RESTART_MS);
    });
    this.destroyRef.onDestroy(() => {
      if (this.restartTimer) clearTimeout(this.restartTimer);
    });
  }

  ngOnInit(): void {
    // The game runs on timers, which would keep SSR from ever settling.
    if (this.isBrowser) this.store.startDemo(NAMES);
  }

  ngAfterViewInit(): void {
    if (!this.isBrowser || typeof ResizeObserver === 'undefined') return;
    const el = this.stageArea.nativeElement;
    const fit = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width && height) this.zone.run(() => this.scale.set(Math.min(width / STAGE_W, height / STAGE_H)));
    };
    const resize = new ResizeObserver(fit);
    resize.observe(el);
    fit();
    this.destroyRef.onDestroy(() => resize.disconnect());
  }

  onJoinClick(): void {
    this.join.emit();
  }
}
