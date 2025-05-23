// src/app/auth/optional-auth.interceptor.ts
import { Injectable } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
} from '@angular/common/http';
import { Observable, from } from 'rxjs';
import { AuthService } from '@auth0/auth0-angular';
import { switchMap, catchError } from 'rxjs/operators';

@Injectable()
export class OptionalAuthInterceptor implements HttpInterceptor {
  constructor(private auth: AuthService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return from(this.auth.getAccessTokenSilently()).pipe(
      switchMap(token => {
        const authReq = req.clone({
          setHeaders: { Authorization: `Bearer ${token}` },
        });
        return next.handle(authReq);
      }),
      catchError(() => {
        // No token? Proceed with original request
        return next.handle(req);
      })
    );
  }
}
