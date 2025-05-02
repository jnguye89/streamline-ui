import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class VideoService {
  private apiUrl = environment.baseUrl;

  constructor(private http: HttpClient) {}

  getVideos(): Observable<any> {
    return this.http.get(`${this.apiUrl}/videos`);
  }

  uploadVideo(video: File, title: string): Observable<any> {
    const formData = new FormData();
    formData.append('video', video);
    formData.append('title', title);
    return this.http.post(`${this.apiUrl}/upload`, formData);
  }

  getBlobVideos(): Observable<any> {
    return this.http.get(`${this.apiUrl}/blob/videos`);
  }

  getBlob(fileName: string): Observable<any> {
    return this.http.get<string>(`${this.apiUrl}/blob/videos/${fileName}`);
  }

  getFirebaseVideos(): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/firebase/videos`);
  }
}
