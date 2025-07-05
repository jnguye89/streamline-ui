import { CommonModule, isPlatformBrowser } from "@angular/common";
import {
  Component,
  Inject,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
} from "@angular/core";
import { AuthService } from "@auth0/auth0-angular";
import { Router } from "@angular/router";
import { first } from "rxjs";
import { VoximplantService } from "../../services/voximplant.service";
import { FormsModule } from "@angular/forms";

@Component({
  selector: "app-calls",
  standalone: true,
  imports: [CommonModule, FormsModule],
  providers: [VoximplantService],
  templateUrl: "./calls.component.html",
  styleUrl: "./calls.component.scss",
})
export class CallsComponent implements OnInit, OnDestroy {
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
      } else this.voximplantService.initialize();
    });
  }

  ngOnDestroy(): void {
    this.voximplantService.hangup();
  }

  startCall(): void {
    // console.log('starting call')
    this.voximplantService.call(this.targetUser);
  }

  endCall(): void {
    this.voximplantService.hangup();
  }
}
