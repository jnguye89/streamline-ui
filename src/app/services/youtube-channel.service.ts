import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "../../environments/environment";
import {
  CreateYoutubeChannelPayload,
  UpdateYoutubeChannelPayload,
  YoutubeChannel,
} from "../models/youtube-channel.model";

@Injectable({
  providedIn: 'root'
})
export class YoutubeChannelService {
  constructor(private http: HttpClient) { }

  getChannels(): Observable<YoutubeChannel[]> {
    return this.http.get<YoutubeChannel[]>(`${environment.baseUrl}/youtube-channels`);
  }

  createChannel(payload: CreateYoutubeChannelPayload): Observable<YoutubeChannel> {
    return this.http.post<YoutubeChannel>(`${environment.baseUrl}/youtube-channels`, payload);
  }

  updateChannel(id: string | number, payload: UpdateYoutubeChannelPayload): Observable<YoutubeChannel> {
    return this.http.patch<YoutubeChannel>(`${environment.baseUrl}/youtube-channels/${id}`, payload);
  }

  deleteChannel(id: string | number): Observable<void> {
    return this.http.delete<void>(`${environment.baseUrl}/youtube-channels/${id}`);
  }
}
