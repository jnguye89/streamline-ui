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

  uploadVideo(video: File): Observable<any> {
    const formData = new FormData();
    formData.append('file', video);
    return this.http.post(`${this.apiUrl}/video`, formData);
  }
  
  getUserVideos(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/video/user`);
  }

  getVideos(): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/video`);
  }
}
