import { CommonModule } from "@angular/common";
import { Component, OnDestroy, OnInit } from "@angular/core";
import { AuthService } from "@auth0/auth0-angular";
import { Router } from "@angular/router";
import {
  combineLatest,
  filter,
  first,
  Observable,
  Subject,
  switchMap,
  take,
  takeUntil,
} from "rxjs";
import { VoximplantService } from "../../services/voximplant.service";
import { FormsModule } from "@angular/forms";
import { UserIntegration } from "../../models/user-integration.model";

@Component({
  selector: "app-calls",
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [VoximplantService],
  templateUrl: "./calls.component.html",
  styleUrl: "./calls.component.scss",
})
export class CallsComponent implements OnInit {
  targetUser: string = "receiver@app.account.voximplant.com";
  isAuthenticated$ = this.auth.isAuthenticated$;

  constructor(
    private auth: AuthService,
    private router: Router,
    private voximplantService: VoximplantService
  ) {}

  async ngOnInit() {
    this.isAuthenticated$.pipe(first()).subscribe((isAuthenticated) => {
      if (!isAuthenticated) {
        this.auth.loginWithRedirect({
          appState: {
            // -> comes back to us after login
            target: this.router.url,
          },
        });
      } else {
        this.auth
          .getAccessTokenSilently()
          // combineLatest([this.getVoxUser(), this.getAccessToken()])
          .pipe(
            filter((token) => !!token), // filter out empty tokens
            switchMap((token) => this.getVoxUser(token)),
            take(1)
          )
          .subscribe((userIntegration) => {
            this.voximplantService.login(userIntegration.integrationUsername);
          });
      }
    });
  }

  private getVoxUser(token: string): Observable<UserIntegration> {
    return this.voximplantService.getVoxImplantUser(token);
  }

  startCall(): void {
    this.voximplantService.callUser("6872d2d67c39260acfc71cd9");
  }

  endCall(): void {
    // this.voximplantService.hangup();
  }
}
