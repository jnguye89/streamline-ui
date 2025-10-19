import { CommonModule } from "@angular/common";
import { Component, ElementRef, OnInit, ViewChild } from "@angular/core";
import { AuthService } from "@auth0/auth0-angular";
import { Router } from "@angular/router";
import { combineLatest, filter, Observable, switchMap, take } from "rxjs";
import { VoximplantService } from "../../services/voximplant.service";
import { FormsModule } from "@angular/forms";
import { UserIntegration } from "../../models/user-integration.model";
import { SeoService } from "../../services/seo.service";

@Component({
  selector: "app-calls",
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [VoximplantService],
  templateUrl: "./calls.component.html",
  styleUrl: "./calls.component.scss",
})
export class CallsComponent implements OnInit {
  // targetUser: string = "receiver@app.account.voximplant.com";
  isAuthenticated$: Observable<boolean> = this.auth.isAuthenticated$;
  // @ViewChild("remoteAudio", { static: true })
  // remoteAudioRef!: ElementRef<HTMLAudioElement>;
  // @ViewChild("localAudio", { static: true })
  // localAudioRef!: ElementRef<HTMLAudioElement>;

  constructor(
    private auth: AuthService,
    private router: Router,
    private voximplantService: VoximplantService,
    private seo: SeoService
  ) {}

  async ngOnInit() {
    this.setUpSeo();
    // combineLatest([this.auth.isAuthenticated$, this.auth.isLoading$])
    //   .pipe(
    //     filter(([_, isLoading]) => !isLoading),
    //     take(1),
    //     switchMap(([isAuthenticated]) => {
    //       if (!isAuthenticated) {
    //         this.auth.loginWithRedirect({
    //           appState: {
    //             // -> comes back to us after login
    //             target: this.router.url,
    //           },
    //         });
    //         // Return an empty observable since we're redirecting
    //         return [];
    //       } else {
    //         // Return the observable for the user integration
    //         navigator.mediaDevices
    //           .getUserMedia({ audio: true })
    //           .then(() => console.log("🎤 Mic access granted"))
    //           .catch((err) => console.error("❌ Mic access DENIED", err));
    //         return this.getVoxUser();
    //       }
    //     })
    //   )
    //   .subscribe((userIntegration: UserIntegration) => {
    //     if (userIntegration) {
    //       this.voximplantService.login(userIntegration.integrationUsername);
    //     }
    //   });

    // this.voximplantService.listen(this.remoteAudioRef);
  }

  logout() {
    this.auth.logout();
  }

  // private getVoxUser(): Observable<UserIntegration> {
  //   return this.voximplantService.getVoxImplantUser();
  // }

  // startCall(): void {
  //   this.voximplantService.callUser(
  //     "6872d2d67c39260acfc71cd9",
  //     this.remoteAudioRef
  //   );
  // }

  // endCall(): void {
  //   // this.voximplantService.hangup();
  // }

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
      // image: "https://www.yoursite.com/assets/calls-og-image.jpg",
    });
  }
}
