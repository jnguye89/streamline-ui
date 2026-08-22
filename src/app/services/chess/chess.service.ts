import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ChessGame, ChessGameItem } from '../../models/chess/chess-game.model';

@Injectable({ providedIn: 'root' })
export class ChessService {
  private apiUrl = environment.baseUrl;

  constructor(private http: HttpClient) {}

  // Public endpoint - returns 'waiting'/'active' games for the watch feed.
  // Works anonymously, same as StreamService.getLiveStreams().
  listGames(): Observable<ChessGameItem[]> {
    return this.http
      .get<ChessGame[]>(`${this.apiUrl}/chess`)
      .pipe(map((games) => games.map((g) => ({ ...g, type: 'chess' as const }))));
  }

  getGame(id: number): Observable<ChessGame> {
    return this.http.get<ChessGame>(`${this.apiUrl}/chess/${id}`);
  }

  // These three require a token - the global JwtAuthGuard on the API side
  // will 401 an anonymous call, so callers should check DeviceAuthService
  // first and route to /login instead of firing one of these.
  createGame(): Observable<ChessGame> {
    return this.http.post<ChessGame>(`${this.apiUrl}/chess`, {});
  }

  joinGame(id: number): Observable<ChessGame> {
    return this.http.post<ChessGame>(`${this.apiUrl}/chess/${id}/join`, {});
  }

  resign(id: number): Observable<ChessGame> {
    return this.http.post<ChessGame>(`${this.apiUrl}/chess/${id}/resign`, {});
  }
}
