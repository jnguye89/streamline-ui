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
      // console.log("[OptionalAuthInterceptor] Fetching token...");
      this.tokenInFlight$ = from(
        this.auth.getAccessTokenSilently({
          detailedResponse: true,
          authorizationParams: {
            audience: environment.auth0.audience,
          },
        })
      ).pipe(
        // tap((res) =>
        //   console.log("[OptionalAuthInterceptor] Token response:", res)
        // ),
        switchMap((res) => {
          const token = res.access_token;
          // console.log("[OptionalAuthInterceptor] Extracted token:", token);
          return [token];
        }),
        catchError((err) => {
          console.error("[OptionalAuthInterceptor] Error fetching token:", err);
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
    return this.getToken$().pipe(
      // tap((token) => console.log(token)),
      take(1),
      switchMap((token) => {
        if (req.url.includes(environment.baseUrl)) {
          const authReq = req.clone({
            setHeaders: { Authorization: `Bearer ${token}` },
          });
          return next.handle(authReq);
        }
        return next.handle(req);
      }),
      catchError((err) => {
        // Optionally: redirect to login if token is required
        return next.handle(req); // Fallback: continue without token
      })
    );
  }
}
