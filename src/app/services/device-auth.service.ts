import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface DeviceUser {
  sub?: string;
  name?: string;
  email?: string;
  picture?: string;
  [key: string]: any;
}

export interface DeviceTokenResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
}

export interface DeviceCodeResponse {
  status: string;
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

const STORAGE_KEY = 'device_auth_tokens';

// How long before the access token actually expires we try to refresh it.
// Keeps getAccessToken() from ever observing an expired token during
// normal use - the refresh happens quietly in the background.
const REFRESH_BUFFER_MS = 60_000;

// If a background refresh fails for a reason that isn't "this refresh
// token is dead" (network blip, Auth0/API hiccup), retry after this long
// instead of giving up and signing the user out.
const REFRESH_RETRY_MS = 30_000;

@Injectable({ providedIn: 'root' })
export class DeviceAuthService {
  private _isAuthenticated$ = new BehaviorSubject<boolean>(this.hasValidTokens());
  private _user$ = new BehaviorSubject<DeviceUser | null>(this.loadUser());

  isAuthenticated$ = this._isAuthenticated$.asObservable();
  user$ = this._user$.asObservable();

  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshInFlight = false;

  constructor(private http: HttpClient) {
    // If we already have tokens from a previous session (page reload,
    // kiosk app restart with storage intact, etc.), pick up the refresh
    // schedule where it left off instead of waiting for the access token
    // to expire and logging out.
    this.scheduleRefreshFromStorage();
  }

  // Synchronous access to the logged-in user's Auth0 subject id, for
  // comparing against a ChessGame's whiteUser/blackUser without setting up
  // a subscription (e.g. inside a template getter).
  //
  // Deliberately decodes the ACCESS token here, not the id token backing
  // _user$/user$: the API stamps whiteUser/blackUser.auth0UserId from
  // `request.user.sub`, which passport-jwt populates from whatever JWT rode
  // in the Authorization header - i.e. the access token (see
  // ChessController + UserDecorator). Auth0 access and id tokens usually
  // carry the same `sub`, but they're issued separately and aren't
  // guaranteed to match (or even both be decodable JWTs) for every
  // connection/flow, so comparing against the id token's `sub` here was a
  // silent seat-detection mismatch waiting to happen - it made both this
  // getter and ChessGameComponent.mySeat (which calls this same method)
  // unreliable for telling "am I one of the two seated players" without a
  // logged build error, just a wrong answer. Reading it straight off the
  // access token guarantees this always matches what the server used to
  // populate those columns in the first place.
  getCurrentUserId(): string | null {
    const token = this.getAccessToken();
    if (!token) return null;
    return this.decodeJwt(token).sub ?? null;
  }

  getAccessToken(): string | null {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    try {
      const parsed = JSON.parse(stored);
      if (Date.now() > parsed.expiresAt) {
        // The access token has expired. The background refresh scheduled
        // in storeTokens()/scheduleRefreshFromStorage() should normally
        // have renewed it well before this point - this is just a safety
        // net for cases like the device having been asleep through the
        // scheduled refresh. Kick off a refresh now rather than wiping the
        // refresh token: logging out here would throw away a perfectly
        // good refresh token over nothing but bad timing. The caller gets
        // null for this one call; logout() only happens if Auth0 actually
        // rejects the refresh token.
        this.refreshAccessToken();
        return null;
      }
      return parsed.accessToken ?? null;
    } catch {
      return null;
    }
  }

  initiateDeviceFlow(): Observable<DeviceTokenResponse> {
    return this.http.post<DeviceTokenResponse>(`${environment.baseUrl}/auth/device/code`, {});
  }

  pollForToken(deviceCode: string, intervalSeconds: number): Observable<DeviceCodeResponse> {
    return new Observable<DeviceCodeResponse>(observer => {
      const timer = setInterval(() => {
        this.http.post<DeviceCodeResponse>(`${environment.baseUrl}/auth/device/token`, { deviceCode })
          .subscribe({
            next: (res) => {
              if (res.status === 'complete') {
                clearInterval(timer);
                this.storeTokens(res);
                observer.next(res);
                observer.complete();
              } else if (res.status === 'expired' || res.status === 'access_denied') {
                clearInterval(timer);
                observer.error(new Error(res.status));
              }
            },
            error: (err) => {
              clearInterval(timer);
              observer.error(err);
            }
          });
      }, intervalSeconds * 1000);

      return () => clearInterval(timer);
    });
  }

  // Exchanges the stored refresh token for a new access/id token, keeping
  // the kiosk signed in indefinitely without ever re-showing the
  // device-code screen. Safe to call repeatedly - concurrent calls are
  // collapsed via refreshInFlight, and it's a no-op if there's no refresh
  // token to use.
  refreshAccessToken(): void {
    if (this.refreshInFlight) return;

    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;

    let currentRefreshToken: string | undefined;
    try {
      currentRefreshToken = JSON.parse(stored).refreshToken;
    } catch {
      return;
    }
    if (!currentRefreshToken) return;

    this.refreshInFlight = true;
    this.http
      .post<DeviceCodeResponse>(`${environment.baseUrl}/auth/device/refresh`, {
        refreshToken: currentRefreshToken,
      })
      .subscribe({
        next: (res) => {
          this.refreshInFlight = false;
          // Refresh Token Rotation (if enabled on the Auth0 app) returns a
          // new refresh token on every exchange; if it doesn't come back,
          // the current one is still valid and gets reused.
          this.storeTokens({
            ...res,
            refreshToken: res.refreshToken || currentRefreshToken!,
          });
        },
        error: (err) => {
          this.refreshInFlight = false;
          if (err?.status === 401) {
            // Auth0 rejected the refresh token itself (expired, revoked,
            // or invalidated elsewhere) - only now do we actually sign the
            // user out.
            this.logout();
          } else {
            // Transient failure (network blip, API hiccup) - keep the
            // existing tokens and try again shortly rather than logging
            // the user out over something that isn't an auth problem.
            this.refreshTimer = setTimeout(() => this.refreshAccessToken(), REFRESH_RETRY_MS);
          }
        },
      });
  }

  logout(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    localStorage.removeItem(STORAGE_KEY);
    this._isAuthenticated$.next(false);
    this._user$.next(null);
  }

  private storeTokens(res: DeviceCodeResponse): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      accessToken: res.accessToken,
      idToken: res.idToken,
      refreshToken: res.refreshToken,
      expiresAt: Date.now() + res.expiresIn * 1000,
    }));
    this._isAuthenticated$.next(true);
    this._user$.next(this.decodeJwt(res.idToken));
    this.scheduleRefresh(res.expiresIn * 1000);
  }

  private scheduleRefresh(expiresInMs: number): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    const delay = Math.max(expiresInMs - REFRESH_BUFFER_MS, 5_000);
    this.refreshTimer = setTimeout(() => this.refreshAccessToken(), delay);
  }

  private scheduleRefreshFromStorage(): void {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    try {
      const { expiresAt } = JSON.parse(stored);
      if (typeof expiresAt === 'number') {
        this.scheduleRefresh(expiresAt - Date.now());
      }
    } catch {
      // Malformed storage - leave it for hasValidTokens()/getAccessToken()
      // to sort out on next read.
    }
  }

  private hasValidTokens(): boolean {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return false;
    try {
      const { expiresAt } = JSON.parse(stored);
      return Date.now() < expiresAt;
    } catch {
      return false;
    }
  }

  private loadUser(): DeviceUser | null {
    if (!this.hasValidTokens()) return null;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    try {
      const { idToken } = JSON.parse(stored);
      return idToken ? this.decodeJwt(idToken) : null;
    } catch {
      return null;
    }
  }

  private decodeJwt(token: string): DeviceUser {
    try {
      const payload = token.split('.')[1];
      const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(decoded);
    } catch {
      return {};
    }
  }
}
