import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "../../environments/environment";

export interface ElevenLabsSessionResponse {
  signedUrl: string;
}

@Injectable({
  providedIn: "root",
})
export class ElevenLabsService {
  constructor(private http: HttpClient) {}

  getSession(): Observable<ElevenLabsSessionResponse> {
    return this.http.get<ElevenLabsSessionResponse>(
      `${environment.baseUrl}/elevenlabs/session`
    );
  }
}
