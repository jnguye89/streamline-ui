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
import { switchMap, catchError, tap, shareReplay, take } from "rxjs/operators";

@Injectable()
export class OptionalAuthInterceptor implements HttpInterceptor {
  private tokenInFlight$: Observable<string> | null = null;
  constructor(private auth: AuthService) {}

  private getToken$(): Observable<string> {
    // if a fetch is already running, return the same observable
    if (!this.tokenInFlight$) {
      this.tokenInFlight$ = from(this.auth.getAccessTokenSilently()).pipe(
        tap(() => (this.tokenInFlight$ = null)), // clear after success
        shareReplay(1), // share value with all subscribers
        catchError((err) => {
          // clear & rethrow on error
          this.tokenInFlight$ = null;
          return throwError(() => err);
        })
      );
    }
    return this.tokenInFlight$;
  }

  intercept(
    req: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {
    return from(
      this.getToken$().pipe(
        take(1),
        switchMap((token) => {
          console.log(" in interceptor", req);
          const authReq = req.clone({
            setHeaders: { Authorization: `Bearer ${token}` },
          });
          return next.handle(authReq);
        }),
        catchError(() => {
          // No token? Proceed with original request
          return next.handle(req);
        })
      )
    );
  }
}
