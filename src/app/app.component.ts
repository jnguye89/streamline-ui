import { CommonModule } from "@angular/common";
import { Component } from "@angular/core";
import { FlexLayoutModule } from "@angular/flex-layout";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { Router, RouterModule, RouterOutlet } from "@angular/router";
import { AuthService } from "@auth0/auth0-angular";
import { first, tap } from "rxjs";

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
  ],
  templateUrl: "./app.component.html",
  styleUrl: "./app.component.scss",
})
export class AppComponent {
  isAuthenticated$ = this.auth.isAuthenticated$;

  constructor(public auth: AuthService, private router: Router) {}

  public handleProfileClick() {
    this.isAuthenticated$
      .pipe(
        first(),
        tap((isAuthenticated) => {
          isAuthenticated
            ? this.navigate()
            : this.auth.loginWithRedirect({
                appState: {
                  // -> comes back to us after login
                  target: this.router.url,
                },
              });
        })
      )
      .subscribe();
  }

  private navigate() {
    this.router.navigate(["profile"]);
  }
}
