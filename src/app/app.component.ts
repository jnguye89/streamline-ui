import { CommonModule } from "@angular/common";
import { Component, OnInit } from "@angular/core";
import { FlexLayoutModule } from "@angular/flex-layout";
import { MatButtonModule } from "@angular/material/button";
import { MatDialog } from "@angular/material/dialog";
import { MatIconModule } from "@angular/material/icon";
import { NavigationEnd, Router, RouterModule, RouterOutlet } from "@angular/router";
import { Observable, catchError, distinctUntilChanged, filter, first, map, of, shareReplay, switchMap, tap } from "rxjs";
import { SearchDialogComponent } from "./components/search/search-dialog.component";
import { DeviceAuthService } from "./services/device-auth.service";
import { GamepadNavigationService } from "./services/gamepad-navigation.service";
import { GamepadFocusableDirective } from "./directives/gamepad-focusable.directive";
import { RecordingSocketService } from "./services/socket/recording.service";
import { AgeService } from "./services/age.service";
import { BirthdayPromptService } from "./services/birthday-prompt.service";
import { SeoService } from "./services/seo.service";
import { GetTvComponent } from "./components/get-tv/get-tv.component";
import { UserAvatarComponent } from "./components/user-avatar/user-avatar.component";
import { UserService } from "./services/user.service";
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
    GetTvComponent,
    UserAvatarComponent,
  ],
  templateUrl: "./app.component.html",
  styleUrl: "./app.component.scss",
})
export class AppComponent implements OnInit {
  isAuthenticated$ = this.deviceAuth.isAuthenticated$;

  /** The small "Log out" button beside the profile icon, shown after pressing the icon. */
  showLogout = false;

  /**
   * The profile button, like the mobile app's: your Auth0 photo from the
   * sign-in token, else your initial (skriin username, else Auth0's
   * nickname/name), else the person icon when signed out.
   */
  me$: Observable<{ id: string; name: string | null; picture: string | null } | null> =
    this.deviceAuth.user$.pipe(
      switchMap((user) => {
        if (!user?.sub) return of(null);
        const fromToken = {
          id: user.sub,
          name: (user['nickname'] as string | undefined) ?? user.name ?? null,
          picture: user.picture ?? null,
        };
        return this.users.getAuth0User(user.sub).pipe(
          map((u) => ({
            ...fromToken,
            name: u?.username || fromToken.name,
            // The token's photo is the freshest; the API's copy covers older tokens.
            picture: fromToken.picture ?? u?.picture ?? null,
          })),
          catchError(() => of(fromToken)),
        );
      }),
      // One lookup for every place the template reads it.
      shareReplay({ bufferSize: 1, refCount: true }),
    );

  constructor(
    public deviceAuth: DeviceAuthService,
    private router: Router,
    private dialog: MatDialog,
    private gamepadNav: GamepadNavigationService,
    private socket: RecordingSocketService,
    private age: AgeService,
    private birthdayPrompt: BirthdayPromptService,
    private seo: SeoService,
    private users: UserService,
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

    // Leaving your profile hides the Log out button again.
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        if (!e.urlAfterRedirects.startsWith('/profile')) this.showLogout = false;
      });

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
          if (!isAuthenticated) {
            this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
            return;
          }
          // Signed in: go to your profile and show Log out beside the icon.
          // Pressing the icon again hides it.
          this.showLogout = !this.showLogout;
          if (!this.router.url.startsWith('/profile')) {
            this.showLogout = true;
            this.navigate();
          }
        })
      )
      .subscribe();
  }

  // No confirm step: pressing the icon, then Log out, is already two steps.
  public logout() {
    this.showLogout = false;
    this.deviceAuth.logout();
    this.router.navigate(['/']);
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
