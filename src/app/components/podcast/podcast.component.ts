import { CommonModule } from "@angular/common";
import { AfterViewInit, Component, ElementRef, inject, OnDestroy, OnInit, ViewChild, ViewEncapsulation } from "@angular/core";
import { FormControl, FormsModule, ReactiveFormsModule } from "@angular/forms";
import { SeoService } from "../../services/seo.service";
import { CallOrchestratorService } from "../../services/agora/call-orchestrator.service";
import { RtmService } from "../../services/agora/rtm.service";
import { combineLatest, concatMap, filter, firstValueFrom, map, Observable, of, startWith, Subject, take, takeUntil } from "rxjs";
import { ActivatedRoute, Router } from "@angular/router";
import { Auth0User } from "../../models/auth0-user.model";
import { UserService } from "../../services/user.service";
import { AgoraService } from "../../services/agora/agora.service";
import { RtcService } from "../../services/agora/rtc.service";
import { MatDialog } from "@angular/material/dialog";
import { AcceptCallModal } from "./../calls/accept-call.components";
import { MatButtonModule } from "@angular/material/button";
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from "@angular/material/snack-bar";
import { RecordingSocketService } from "../../services/socket/recording.service";
import { MatIconModule } from "@angular/material/icon";
import { StreamService } from "../../services/stream.service";
import { DeviceAuthService, DeviceUser } from "../../services/device-auth.service";
import { GamepadFocusableDirective } from "../../directives/gamepad-focusable.directive";
import { TextKeyboardDialogComponent, TextKeyboardSuggestion } from "../search/text-keyboard-dialog.component";

@Component({
  selector: "app-podcast",
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatButtonModule, MatSlideToggleModule,
    MatIconModule, GamepadFocusableDirective],
  templateUrl: "./podcast.component.html",
  styleUrl: "./podcast.component.scss",
})
export class PodcastComponent implements OnInit, AfterViewInit, OnDestroy {
  private dialog = inject(MatDialog);
  private destroy$ = new Subject<void>();
  private userId: number | undefined;
  sidebarCollapsed = false;
  isAuthenticated$ = this.deviceAuth.isAuthenticated$;
  users$: Observable<Auth0User[]> = of();
  // Live filter over users$ driven by the "Add person" search box - see
  // openPeopleSearch()/searchControl below. Reassigned alongside users$
  // itself in init()'s subscribe callback, for the same reason users$ is:
  // it needs to be built from the real getUsers() stream, not the of()
  // placeholder above (an already-completed empty observable would leave
  // combineLatest() with nothing to combine, and it would never emit).
  filteredUsers$: Observable<Auth0User[]> = of([]);
  // Bound to the "Add person" search input and shared with
  // TextKeyboardDialogComponent's on-screen keyboard - see
  // openPeopleSearch(). Typing on that keyboard updates this control
  // directly, which filteredUsers$ above reacts to live.
  searchControl = new FormControl('');
  user$: Observable<DeviceUser | null> = of();
  isVideo = true;
  isPodcast = false;
  isRecording = false;
  isLive = false;
  channelName = '';
  token: string | undefined;

  constructor(
    private orchestrator: CallOrchestratorService,
    public rtm: RtmService,
    private seo: SeoService,
    private deviceAuth: DeviceAuthService,
    private userService: UserService,
    private tokenApi: AgoraService,
    private rtc: RtcService,
    private snack: MatSnackBar,
    private router: Router,
    private route: ActivatedRoute,
    private streamservice: StreamService,
    private socket: RecordingSocketService) { }

  @ViewChild('localPreview') localPreview!: ElementRef<HTMLVideoElement>;
  private localStream: MediaStream | null = null;

  showUserPicker = false;
  selected: Record<number, boolean> = {};

  async ngAfterViewInit() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const el = this.localPreview.nativeElement;
      el.muted = true;
      el.srcObject = this.localStream;
    } catch (err) {
      console.error('Camera access denied', err);
    }
  }

  toggleUserPicker() {
    this.showUserPicker = !this.showUserPicker;
    if (!this.showUserPicker) {
      this.searchControl.setValue('');
    }
  }

  closeUserPicker() {
    this.showUserPicker = false;
    this.searchControl.setValue('');
  }

  // Opens the same on-screen keyboard the top-nav search icon uses (see
  // SearchDialogComponent), bound to this page's own searchControl instead
  // of a user-search API call - so typing here just live-filters the
  // already-loaded users$ list via filteredUsers$, no network round trip.
  // The dialog's own backdrop fully blurs/darkens the user-picker list
  // behind it, so filteredUsers$ updating live isn't visible to the user
  // while the dialog is open - suggestions$ mirrors those same matches
  // into a results list inside the dialog itself (same as global search),
  // and tapping/activating one toggles that person's selection via the
  // existing toggleSelection(), same as tapping their row in the list.
  openPeopleSearch() {
    this.dialog.open(TextKeyboardDialogComponent, {
      width: '560px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      position: { top: '6%' },
      panelClass: 'spotlight-panel',
      backdropClass: 'spotlight-backdrop',
      autoFocus: false,
      data: {
        control: this.searchControl,
        placeholder: 'Search users…',
        // Empty (not "everyone") until the user actually types something -
        // filteredUsers$ itself returns the full list for an empty term
        // (that's the right behavior for the page's own list behind the
        // dialog), but that would make results non-empty from the moment
        // the dialog opens. TextKeyboardDialogComponent's keyboard<->results
        // mode switch only triggers at the keyboard's boundary rows when
        // results.length > 0, so a non-empty list from frame one traps the
        // very first up/down press into results mode before the user has
        // typed anything - "moving around with the joystick" (grid
        // navigation) would stop working immediately. Gating on the raw
        // search term here (not just filteredUsers$'s output) keeps this
        // matching SearchDialogComponent's own contract: no query, no
        // results, full keyboard-grid navigation until you start typing.
        suggestions$: combineLatest([
          this.filteredUsers$,
          this.user$,
          this.searchControl.valueChanges.pipe(startWith(this.searchControl.value)),
        ]).pipe(
          map(([users, me, term]) => {
            if (!(term ?? '').trim()) return [];
            return users
              .filter(u => u.auth0UserId !== me?.sub)
              .slice(0, 8)
              .map(u => ({ id: u.agoraUserId, label: u.username }));
          })
        ),
        onSelectSuggestion: (item: TextKeyboardSuggestion) => this.toggleSelection(item.id as number),
        isSuggestionSelected: (item: TextKeyboardSuggestion) => !!this.selected[item.id as number],
      },
    });
  }

  online(uid: number) {
    return this.rtm.onlineMap$.value.get(`${uid}`) === 'online';
  }

  get selectedCount() {
    return Object.values(this.selected).filter(v => v).length;
  }

  get isConnected() {
    return this.rtc.isConnected();
  }

  onSidebarEnter() {
    this.sidebarCollapsed = false;
  }

  onSidebarLeave() {
    this.sidebarCollapsed = true;
  }

  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  canSelect(id: number): boolean {
    const isSelected = this.selected[id];
    return isSelected || this.selectedCount < 4;
  }

  toggleSelection(id: number) {
    if (this.canSelect(id)) {
      this.selected[id] = !this.selected[id];
    }
  }

  async callSelected() {
    const users = await firstValueFrom(this.users$);

    const invitees = (users ?? [])
      .filter(u => !!this.selected?.[u.agoraUserId])
      .map(u => u.agoraUserId);

    if (invitees.length === 0 || !this.userId) return;

    try {
      this.channelName = `${this.isPodcast ? 'podcast' : 'call'}_${crypto.randomUUID()}`;
      console.log('call selected: ', this.channelName);
      await this.socket.connect();
      await this.orchestrator.startCall(this.userId, invitees, this.channelName, this.isVideo ? 'video' : 'audio');
      await firstValueFrom(this.streamservice.ensureReady(this.channelName));
    } catch (e) {
      console.error('startCall failed', e);
    }
  }

  async hangup() {
    await this.stopRecording();
    await this.orchestrator.hangup();
  }

  async ngOnInit() {
    this.isAuthenticated$.pipe(
      takeUntil(this.destroy$)).subscribe(isAuthenticated => {
        isAuthenticated ? this.init() : this.login();
      });

    this.socket.recordingStarted$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.isRecording = true;
      this.snack.open('Recording has started!', 'Dismiss', {
        duration: 10000,
        horizontalPosition: 'center',
        verticalPosition: 'top',
        politeness: 'assertive',
        panelClass: ['snack-error']
      });
    });

    this.socket.recordingStopped$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.isRecording = false;
      this.snack.open('Recording has stopped!', 'Dismiss', {
        duration: 10000,
        horizontalPosition: 'center',
        verticalPosition: 'top',
        politeness: 'assertive',
        panelClass: ['snack-error']
      });
    });
  }

  async startRecording() {
    if (this.channelName === '') {
      console.error('No channel name set. Cannot start recording.');
      return;
    }
    this.socket.startRecording(this.channelName);
    await this.streamservice.start(this.channelName, undefined, false);
    this.isRecording = true;
  }

  async stopRecording() {
    this.socket.stopRecording(this.channelName);
    await this.streamservice.stop(this.channelName);
    this.isRecording = false;
    this.isLive = false;
  }

  async toggleLive() {
    if (this.isLive) {
      await this.streamservice.stopLive(this.channelName);
      this.isLive = false;
    } else {
      await this.streamservice.start(this.channelName, undefined, true);
      this.isLive = true;
    }
  }

  init() {
    this.isPodcast = this.route.snapshot.url.map(u => u.path).indexOf('podcast') != -1;
    this.setUpSeo();
    this.user$ = this.deviceAuth.user$;
    this.user$.pipe(
      filter(r => !!r?.sub),
      concatMap(u => this.userService.getAuth0User(u?.sub!)),
      take(1))
      .subscribe(u => {
        this.userId = u.agoraUserId;
        this.orchestrator.initForUser(this.userId!);
        this.users$ = this.userService.getUsers();
        this.filteredUsers$ = combineLatest([
          this.users$,
          this.searchControl.valueChanges.pipe(startWith(this.searchControl.value)),
        ]).pipe(
          map(([users, term]) => {
            const q = (term ?? '').trim().toLowerCase();
            return q ? users.filter(u => u.username?.toLowerCase().includes(q)) : users;
          })
        );
      });

    this.rtm.incomingInvite$.subscribe(async ({ from, channel, media }) => {
      this.channelName = channel;
      const accepted = await this.openIncomingModal(from, media);

      if (accepted) {
        await this.socket.connect();
        const { appId, rtcToken } = await firstValueFrom(
          this.tokenApi.createTokens(this.userId!, channel)
        );
        await this.rtm.sendAccept(from, channel, media == 'video');
        await this.rtc.join(appId, channel, this.userId!, rtcToken, media == 'video');
      } else {
        await this.rtm.sendDecline(from, channel, 'user-declined');
      }
    });

    this.rtm.callSignals$.subscribe(async sig => {
      const user = await firstValueFrom(this.userService.getAgoraUser(sig.from));
      let message;
      if (sig.type === 'CALL_CANCEL') {
        message = `Call cancelled by ${user.username}`;
      }
      if (sig.type === 'CALL_DECLINE') {
        message = `Call declined by ${user.username}`;
      }

      if (!!message) {
        this.snack.open(message, 'Dismiss', {
          duration: 6000,
          horizontalPosition: 'right',
          verticalPosition: 'top',
        });
      }
    });
  }

  login() {
    this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
  }

  async openIncomingModal(from: string, media: 'audio' | 'video'): Promise<boolean> {
    const user = await firstValueFrom(this.userService.getAgoraUser(from));
    const ref = this.dialog.open(AcceptCallModal, {
      data: { from: user.username, media },
      disableClose: false,
    });

    const result = await firstValueFrom(ref.afterClosed());
    return !!result;
  }

  ngOnDestroy(): void {
    this.localStream?.getTracks().forEach(t => t.stop());
    (async () => {
      try {
        if (this.isRecording) {
          await this.stopRecording();
        }
        await this.orchestrator.hangup();
      } catch (err) {
        console.error('Error during cleanup in ngOnDestroy', err);
      } finally {
        this.destroy$.next();
        this.destroy$.complete();
      }
    })();
  }

  private setUpSeo() {
    const title = 'skriin AI TV';
    const description =
      "Place crystal-clear AI-enhanced video and voice calls from any smart-TV. Auto-framing, noise cleanup, instant family conferencing.";
    const keywords =
      "ai video calls on tv, smart tv calling, skriin calls, family video chat, noise cancelling tv calls";

    this.seo.setTags({
      title,
      description,
      keywords,
      path: "/watch",
    });
  }
}
