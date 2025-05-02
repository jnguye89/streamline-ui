import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class ListenService {
  private apiUrl = environment.baseUrl;

  constructor(private http: HttpClient) {}

  getStations(limit = 100): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/listen/stations/${limit}`);
  }
}
