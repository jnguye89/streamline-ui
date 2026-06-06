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

@Injectable({ providedIn: 'root' })
export class DeviceAuthService {
  private _isAuthenticated$ = new BehaviorSubject<boolean>(this.hasValidTokens());
  private _user$ = new BehaviorSubject<DeviceUser | null>(this.loadUser());

  isAuthenticated$ = this._isAuthenticated$.asObservable();
  user$ = this._user$.asObservable();

  constructor(private http: HttpClient) {}

  getAccessToken(): string | null {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    try {
      const parsed = JSON.parse(stored);
      if (Date.now() > parsed.expiresAt) {
        this.logout();
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

  logout(): void {
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
