import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { environment } from '../../environments/environment';
import { Video } from '../models/video.model';

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
  
  getUserVideos(id: string): Observable<Video[]> {
    return this.http.get<any[]>(`${this.apiUrl}/video/user/${id}`);
  }

  getVideos(): Observable<Video[]> {
    return this.http.get<Video[]>(`${this.apiUrl}/video`);
  }
}
