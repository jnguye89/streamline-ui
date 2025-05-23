import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class VideoService {
  private apiUrl = environment.baseUrl;

  constructor(private http: HttpClient) {}

  uploadFirebaseVideo(video: File): Observable<any> {
    const formData = new FormData();
    formData.append('file', video);
    return this.http.post(`${this.apiUrl}/video`, formData);
  }

  getFirebaseVideos(): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/video`);
  }
}
