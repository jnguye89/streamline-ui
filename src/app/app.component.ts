import { CommonModule } from "@angular/common";
import { Component, OnInit } from "@angular/core";
import { FlexLayoutModule } from "@angular/flex-layout";
import { MatButtonModule } from "@angular/material/button";
import { MatDialog } from "@angular/material/dialog";
import { MatIconModule } from "@angular/material/icon";
import { Router, RouterModule, RouterOutlet } from "@angular/router";
import { distinctUntilChanged, filter, first, tap } from "rxjs";
import { SearchDialogComponent } from "./components/search/search-dialog.component";
import { DeviceAuthService } from "./services/device-auth.service";
import { GamepadNavigationService } from "./services/gamepad-navigation.service";
import { GamepadFocusableDirective } from "./directives/gamepad-focusable.directive";
import { RecordingSocketService } from "./services/socket/recording.service";
import { AgeService } from "./services/age.service";
import { BirthdayPromptService } from "./services/birthday-prompt.service";
import { SeoService } from "./services/seo.service";
// Not referenced directly below - injecting it here is what instantiates
// this singleton (and its chessYourTurn$ subscription) as soon as the app
// boots, rather than lazily whenever some other component first happens to
// need it. See the service itself for why it has to live at this level
// instead of inside WatchComponent/ChessGameComponent.
import { ChessTurnNotificationService } from "./services/chess/chess-turn-notification.service";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [
    RouterOutlet,
    MatButtonModule,
    MatIconModule,
    RouterModule,
    FlexLayoutModule,
    CommonModule,
    GamepadFocusableDirective,
  ],
  templateUrl: "./app.component.html",
  styleUrl: "./app.component.scss",
})
export class AppComponent implements OnInit {
  isAuthenticated$ = this.deviceAuth.isAuthenticated$;

  constructor(
    public deviceAuth: DeviceAuthService,
    private router: Router,
    private dialog: MatDialog,
    private gamepadNav: GamepadNavigationService,
    private socket: RecordingSocketService,
    private age: AgeService,
    private birthdayPrompt: BirthdayPromptService,
    private seo: SeoService,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private chessTurnNotifications: ChessTurnNotificationService
  ) {}

  ngOnInit(): void {
    // Per-route title, description and canonical (see data.seo in app.routes.ts).
    this.seo.init();
    this.gamepadNav.start();
    // Connect the realtime socket app-wide, on launch, regardless of which
    // route the user lands on - previously this only happened inside
    // WatchComponent.ngOnInit(), so a personal "your turn" notification
    // could never reach a user sitting on /profile, /listen, /stream, etc.
    // (or even /watch itself before the feed component first mounted).
    // Safe to call unconditionally and from multiple places: connect()
    // no-ops if a socket is already connected, and an anonymous (logged-out)
    // connection is already how anonymous spectating works elsewhere.
    this.socket.connect();

    // Once per sign-in (and once for accounts from before this existed), ask for a date of
    // birth if there's none on file. If the check itself fails, don't block the app; the
    // API still enforces the go-live age.
    this.isAuthenticated$
      .pipe(distinctUntilChanged(), filter(Boolean))
      .subscribe(() => {
        this.age
          .getMe()
          .then((me) => this.birthdayPrompt.ensureBirthDate(me.birthDate))
          .catch((e) => console.warn("Couldn't check the birth date:", e));
      });
  }

  public handleProfileClick() {
    this.isAuthenticated$
      .pipe(
        first(),
        tap((isAuthenticated) => {
          isAuthenticated
            ? this.navigate()
            : this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
        })
      )
      .subscribe();
  }

  public openSearch() {
    this.dialog.open(SearchDialogComponent, {
      width: '560px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      position: { top: '6%' },
      panelClass: 'spotlight-panel',
      backdropClass: 'spotlight-backdrop',
      autoFocus: false,
    });
  }

  private navigate() {
    this.router.navigate(["profile"]);
  }
}
