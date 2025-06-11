import { Injectable } from "@angular/core";
import { Router } from "@angular/router";
import { AuthService } from "@auth0/auth0-angular";
import { first } from "rxjs";

@Injectable({ providedIn: 'root' })
export class PostLoginRedirectService {
  constructor(private auth: AuthService, private router: Router) {
    this.auth.appState$             // emits after the SDK finishes the redirect
      .pipe(first())                // we only need it once
      .subscribe((state) => {
        const target = state?.target || '/';
        this.router.navigateByUrl(target);
      });
  }
}
