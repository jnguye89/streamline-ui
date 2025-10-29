// src/app/auth/optional-auth.interceptor.ts
import { Injectable } from "@angular/core";
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
} from "@angular/common/http";
import { Observable, from, throwError } from "rxjs";
import { AuthService } from "@auth0/auth0-angular";
import {
  switchMap,
  catchError,
  shareReplay,
  take,
  tap,
} from "rxjs/operators";
import { environment } from "../../environments/environment";

@Injectable()
export class OptionalAuthInterceptor implements HttpInterceptor {
  private tokenInFlight$: Observable<string> | null = null;
  constructor(private auth: AuthService) { }

  private getToken$(): Observable<string> {
    // if a fetch is already running, return the same observable
    if (!this.tokenInFlight$) {
      this.tokenInFlight$ = from(
        this.auth.getAccessTokenSilently({
          detailedResponse: true,
          authorizationParams: {
            audience: environment.auth0.audience,
            // scope: 'openid profile email offline_access'
          },
        })
      ).pipe(
        switchMap((res) => {
          const token = res.access_token;
          return [token];
        }),
        catchError((err) => {
          this.tokenInFlight$ = null;
          return throwError(() => err);
        }),
        shareReplay(1),
        tap(() => (this.tokenInFlight$ = null)) // Always clean up
      );
    }
    return this.tokenInFlight$;
  }

  intercept(
    req: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {
    if (req.url.includes(environment.baseUrl)) {
      return this.getToken$().pipe(
        take(1),
        switchMap((token) => {
          const authReq = req.clone({
            setHeaders: { Authorization: `Bearer ${token}` },
          });
          return next.handle(authReq);
        }),
        catchError((err) => {
          // Optionally: redirect to login if token is required
          return next.handle(req); // Fallback: continue without token
        })
      )
    }
    return next.handle(req);;
  }
}
