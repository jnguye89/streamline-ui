import { CommonModule } from "@angular/common";
import { Component, OnInit } from "@angular/core";
import { AuthService } from "@auth0/auth0-angular";
import { Router } from "@angular/router";
import { first } from "rxjs";

@Component({
  selector: "app-calls",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./calls.component.html",
  styleUrl: "./calls.component.scss",
})
export class CallsComponent implements OnInit {
  isAuthenticated$ = this.auth.isAuthenticated$;

  constructor(private auth: AuthService, private router: Router) {}

  async ngOnInit() {
    this.isAuthenticated$.pipe(first()).subscribe((isAuthenticated) => {
      if (!isAuthenticated) {
        this.auth.loginWithRedirect({
          appState: {
            // -> comes back to us after login
            target: this.router.url,
          },
        });
      }
    });
  }
}
