import { CommonModule } from "@angular/common";
import { Component } from "@angular/core";
import { FlexLayoutModule } from "@angular/flex-layout";
import { MatButtonModule } from "@angular/material/button";
import { MatDialog } from "@angular/material/dialog";
import { MatIconModule } from "@angular/material/icon";
import { Router, RouterModule, RouterOutlet } from "@angular/router";
import { first, tap } from "rxjs";
import { SearchDialogComponent } from "./components/search/search-dialog.component";
import { DeviceAuthService } from "./services/device-auth.service";

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
  isAuthenticated$ = this.deviceAuth.isAuthenticated$;

  constructor(
    public deviceAuth: DeviceAuthService,
    private router: Router,
    private dialog: MatDialog
  ) {}

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
