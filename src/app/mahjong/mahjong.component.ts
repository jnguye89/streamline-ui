import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ViewEncapsulation,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CalloutsComponent } from './callout/callouts.component';
import { CenterBoxComponent } from './center/center-box.component';
import { ClaimBarComponent } from './claim/claim-bar.component';
import { providePlaceholderEngine } from './engine/engine-token';
import { HandComponent } from './hand/hand.component';
import { ControlsLegendComponent, RoundInfoComponent } from './hud/hud.components';
import { TvAction } from './mahjong.types';
import { GameEndComponent } from './overlays/game-end.component';
import { HandResultComponent } from './overlays/hand-result.component';
import { PauseMenuComponent } from './overlays/pause-menu.component';
import { RulesSheetComponent } from './overlays/rules-sheet.component';
import { StartOverlayComponent } from './overlays/start-overlay.component';
import { PondComponent } from './pond/pond.component';
import { PREVIEW_SCENES } from './preview/preview-scenes';
import { OpponentSeatComponent } from './seat/opponent-seat.component';
import { SelfCardComponent } from './seat/self-card.component';
import { providePlaceholderSeatVideo } from './seat-video/seat-video';
import { SoundService } from './sound.service';
import { TableStore } from './table-store.service';
import { TurnActionsComponent } from './turn/turn-actions.component';
import { TvInputService } from './tv-input.service';

const STAGE_W = 1920;
const STAGE_H = 1080;

/**
 * skriin ai TV · Mahjong (Hong Kong rules), TV page.
 * Drop-in standalone page: <skriin-mahjong (exit)="goBack()" />
 * Fixed 1920×1080 stage scaled to the screen. You are always at the bottom.
 */
@Component({
  selector: 'skriin-mahjong',
  standalone: true,
  imports: [
    CalloutsComponent,
    CenterBoxComponent,
    ClaimBarComponent,
    ControlsLegendComponent,
    GameEndComponent,
    HandComponent,
    HandResultComponent,
    OpponentSeatComponent,
    PauseMenuComponent,
    PondComponent,
    RoundInfoComponent,
    RulesSheetComponent,
    SelfCardComponent,
    StartOverlayComponent,
    TurnActionsComponent,
  ],
  providers: [
    TableStore,
    TvInputService,
    SoundService,
    providePlaceholderEngine(),
    providePlaceholderSeatVideo(),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  templateUrl: './mahjong.component.html',
  styleUrl: './mahjong.component.css',
  host: {
    class: 'skriin-mahjong',
    '(window:resize)': 'fit()',
  },
})
export class MahjongComponent {
  /** Player chose Exit / Leave. The host app navigates back. */
  readonly exit = output<void>();
  /** Review builds only: P (and the start screen's review button) cycle the preview states. */
  readonly previewEnabled = input(false);

  protected readonly store = inject(TableStore);
  private readonly input = inject(TvInputService);
  protected readonly scale = signal(1);
  protected readonly sceneCount = PREVIEW_SCENES.length;

  private readonly startOverlay = viewChild(StartOverlayComponent);
  private readonly pauseMenu = viewChild(PauseMenuComponent);
  private readonly rules = viewChild(RulesSheetComponent);
  private readonly handResult = viewChild(HandResultComponent);
  private readonly gameEnd = viewChild(GameEndComponent);

  protected readonly phase = computed(() => this.store.view()?.phase ?? null);
  protected readonly seats = computed(() => {
    const at = this.store.seatAt();
    const v = this.store.view();
    if (!v) return null;
    return { bottom: at('bottom')!, right: at('right')!, top: at('top')!, left: at('left')! };
  });

  constructor() {
    this.fit();
    const off = this.input.on((a) => this.route(a));
    inject(DestroyRef).onDestroy(off);
  }

  protected fit(): void {
    const w = globalThis.innerWidth || STAGE_W;
    const h = globalThis.innerHeight || STAGE_H;
    this.scale.set(Math.min(w / STAGE_W, h / STAGE_H));
  }

  protected onExit(): void {
    this.store.toStartScreen();
    this.exit.emit();
  }

  /** Each press goes to whatever is on top: rules › menu › final scores › hand result › start › table. */
  private route(a: TvAction): void {
    if (a === 'preview') {
      if (this.previewEnabled()) this.store.cyclePreview();
      return;
    }
    const s = this.store;
    if (s.rulesOpen()) return this.rules()?.handle(a);
    if (s.paused()) return this.pauseMenu()?.handle(a);
    if (s.screen() === 'start') return this.startOverlay()?.handle(a);
    if (this.phase() === 'game-over') return this.gameEnd()?.handle(a);
    if (this.phase() === 'hand-over') return this.handResult()?.handle(a);
    s.handle(a);
  }
}
