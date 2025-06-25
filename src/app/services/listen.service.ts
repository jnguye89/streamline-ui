import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Station } from '../models/station.model';

@Injectable({
  providedIn: 'root',
})
export class ListenService {
  private apiUrl = environment.baseUrl;

  constructor(private http: HttpClient) {}

  getStations(limit = 100): Observable<Station[]> {
    return this.http.get<Station[]>(`${this.apiUrl}/listen/stations/${limit}`);
  }

  getAudio(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/listen`);
  }
}
