import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom, Observable, of } from "rxjs";
import { environment } from "../../environments/environment";
import { Video } from "../models/video.model";
import { StreamStatus } from "../models/sttream-status.model";

@Injectable({
  providedIn: "root",
})
export class VideoService {
  private apiUrl = environment.baseUrl;

  constructor(private http: HttpClient) {}

  uploadVideo(video: File): Observable<any> {
    const formData = new FormData();
    formData.append("file", video);
    return this.http.post(`${this.apiUrl}/video`, formData);
  }

  getUserVideos(id: string): Observable<Video[]> {
    return this.http.get<any[]>(`${this.apiUrl}/video/user/${id}`);
  }

  getVideos(): Observable<Video[]> {
    return this.http.get<Video[]>(`${this.apiUrl}/video`);
  }

  getStreamStatus(): Observable<StreamStatus> {
    return this.http.get<StreamStatus>(`${this.apiUrl}/video/status`);
  }

  async uploadToPresignedUrl(
    file: File
  ): Promise<{ user: string; videoPath: string }> {
    // 1. Get the presigned URL
    const { uploadUrl, key } = await firstValueFrom(
      this.http.post<{ uploadUrl: string; key: string }>(
        `${this.apiUrl}/video/presign`,
        {
          fileName: file.name,
          mimeType: file.type,
        }
      )
    );

    // 2. Upload directly to S3
    await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type,
      },
      body: file,
    });

    return await firstValueFrom(
      this.http.post<{ user: string; videoPath: string }>(
        `${this.apiUrl}/video`,
        { key }
      )
    );

    // 3. Optionally: notify your backend of the upload
    // return key; // or call another endpoint to save metadata in DB
  }
}
