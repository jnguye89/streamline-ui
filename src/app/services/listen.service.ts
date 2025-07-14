import { Injectable, OnInit } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";
import { environment } from "../../environments/environment";
import { Station } from "../models/station.model";
import { Meta, Title } from "@angular/platform-browser";

@Injectable({
  providedIn: "root",
})
export class ListenService implements OnInit {
  private apiUrl = environment.baseUrl;

  constructor(
    private http: HttpClient,
    private titleService: Title,
    private metaService: Meta
  ) {}

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
    const title = "Listen – Skriin AI TV";
    const description =
      "Browse, queue and cast podcasts, radio and ambient mixes with AI suggestions and 3-D spatial audio upmix.";
    const keywords =
      "podcast player tv, smart tv radio, ambient soundscapes, ai audio recommendations, spatial audio tv";

    this.titleService.setTitle(title);

    this.metaService.updateTag({ name: "description", content: description });
    this.metaService.updateTag({ name: "keywords", content: keywords });
    this.metaService.updateTag({ name: "robots", content: "index, follow" });

    this.metaService.updateTag({ property: "og:title", content: title });
    this.metaService.updateTag({
      property: "og:description",
      content: description,
    });
    this.metaService.updateTag({ property: "og:type", content: "website" });
    this.metaService.updateTag({
      property: "og:url",
      content: "https://www.yoursite.com/listen",
    });
    this.metaService.updateTag({
      property: "og:image",
      content: "https://www.yoursite.com/assets/listen-og-image.jpg",
    });

    this.metaService.updateTag({
      name: "twitter:card",
      content: "summary_large_image",
    });
    this.metaService.updateTag({ name: "twitter:title", content: title });
    this.metaService.updateTag({
      name: "twitter:description",
      content: description,
    });
  }
}
