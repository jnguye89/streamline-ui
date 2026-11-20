// poker-demo.component.ts
//
// The poker tile in the watch feed - same idea as ChessDemoComponent and
// CheckersDemoComponent: a table that plays itself, so the tile looks alive
// like the videos around it, with a "Press to play" call to action on top.
//
// It's the real thing, not a script: a LocalTable (the same offline engine
// and bots /play/poker uses) with every seat a bot, drawn by the real
// TableScreenComponent from the public view - so cards stay face down until
// a showdown, exactly like a spectator would see. The 1920×1080 table
// picture is scaled to fit the tile.
//
// Pure decoration: actually playing is delegated back up via `join`, which
// WatchComponent turns into a navigation to /play/poker.
import { isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  NgZone,
  OnDestroy,
  OnInit,
  Output,
  PLATFORM_ID,
  ViewChild,
  inject,
  signal,
} from '@angular/core';

import { GamepadFocusableDirective } from '../../directives/gamepad-focusable.directive';
import { PlayerView } from '../../poker/core/api';
import { LocalTable } from '../../poker/placeholder/local-table';
import { ScreenFlags } from '../../poker/poker.types';
import { TableScreenComponent } from '../../poker/table/table-screen.component';

const STAGE_W = 1920;
const STAGE_H = 1080;

const FLAGS: ScreenFlags = {
  live: false,
  cardsOnPhone: false,
  cardsHidden: false,
  joinUrl: null,
  handLabel: false,
  animations: true,
  modeLine: '',
};

@Component({
  selector: 'app-poker-demo',
  standalone: true,
  imports: [TableScreenComponent, GamepadFocusableDirective],
  templateUrl: './poker-demo.component.html',
  styleUrl: './poker-demo.component.scss',
})
export class PokerDemoComponent implements OnInit, AfterViewInit, OnDestroy {
  @Output() join = new EventEmitter<void>();
  @ViewChild('stageArea', { static: true }) stageArea!: ElementRef<HTMLElement>;

  readonly flags = FLAGS;
  readonly view = signal<PlayerView | null>(null);
  readonly scale = signal(0.5);

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly zone = inject(NgZone);
  private table: LocalTable | null = null;
  private off: (() => void) | null = null;
  private resize: ResizeObserver | null = null;

  ngOnInit(): void {
    // Server render shows nothing but the black tile: the table runs on
    // timers, which would keep SSR from ever settling.
    if (!this.isBrowser) return;

    const table = new LocalTable({
      gameType: 'home',
      players: 6,
      botLevel: 'medium',
      autoShow: true,
      allBots: true,
      you: { id: 'demo-0', name: 'Lucky', kind: 'bot', botLevel: 'medium' },
      // A touch quicker than the real table so the tile keeps moving.
      thinkMs: [600, 1600],
      nextHandMs: 3200,
    });
    this.table = table;
    const refresh = () => this.view.set(table.engine.viewFor({ kind: 'public' }));
    this.off = table.engine.onEvents(refresh);
    refresh();
    table.start();
  }

  ngAfterViewInit(): void {
    if (!this.isBrowser || typeof ResizeObserver === 'undefined') return;
    const el = this.stageArea.nativeElement;
    const fit = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width && height) this.zone.run(() => this.scale.set(Math.min(width / STAGE_W, height / STAGE_H)));
    };
    this.resize = new ResizeObserver(fit);
    this.resize.observe(el);
    fit();
  }

  ngOnDestroy(): void {
    this.off?.();
    this.table?.dispose();
    this.resize?.disconnect();
  }

  onJoinClick(): void {
    this.join.emit();
  }
}
