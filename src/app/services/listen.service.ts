import { Injectable, OnInit } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";
import { environment } from "../../environments/environment";
import { Station } from "../models/station.model";
import { Meta, Title } from "@angular/platform-browser";
import { SeoService } from "./seo.service";

@Injectable({
  providedIn: "root",
})
export class ListenService implements OnInit {
  private apiUrl = environment.baseUrl;

  constructor(private http: HttpClient, private seo: SeoService) {}

  ngOnInit(): void {
    this.setUpSeo();
  }

  getStations(limit = 100): Observable<Station[]> {
    return this.http.get<Station[]>(`${this.apiUrl}/listen/stations/${limit}`);
  }

  getAudio(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/listen`);
  }

  private setUpSeo() {
    const title = "Listen – skriin AI TV";
    const description =
      "Browse, queue and cast podcasts, radio and ambient mixes with AI suggestions and 3-D spatial audio upmix.";
    const keywords =
      "podcast player tv, smart tv radio, ambient soundscapes, ai audio recommendations, spatial audio tv";

    this.seo.setTags({
      title,
      description,
      keywords,
      path: "/watch",
      // image: "https://www.yoursite.com/assets/calls-og-image.jpg",
    });
  }
}
