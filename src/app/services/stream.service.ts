import { Injectable } from "@angular/core";
import { environment } from "../../environments/environment";
import { HttpClient } from "@angular/common/http";
import { PublishInfo } from "../models/publish-info.model";
import { firstValueFrom } from "rxjs";

@Injectable({
  providedIn: "root",
})
export class StreamService {
  private apiUrl = environment.baseUrl;
  constructor(private http: HttpClient) {}

  async getLiveStream(streamId: string): Promise<PublishInfo> {
    return await firstValueFrom(
      this.http.get<PublishInfo>(`${this.apiUrl}/streams/${streamId}`)
    );
  }
}
