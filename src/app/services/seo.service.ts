import { Injectable } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';

export interface SeoData {
  title: string;
  description: string;
  keywords?: string;
  path?: string; // e.g. "/calls"
  image?: string; // Full URL to OG image
}

@Injectable({
  providedIn: 'root'
})
export class SeoService {
  private baseUrl = 'https://www.yoursite.com'; // 🔁 Replace with your domain

  constructor(private titleService: Title, private metaService: Meta) {}

  setTags(data: SeoData): void {
    const fullUrl = this.baseUrl + (data.path ?? '');
    const ogImage = data.image ?? `${this.baseUrl}/assets/default-og-image.jpg`;

    this.titleService.setTitle(data.title);

    this.metaService.updateTag({ name: 'description', content: data.description });
    if (data.keywords) {
      this.metaService.updateTag({ name: 'keywords', content: data.keywords });
    }
    this.metaService.updateTag({ name: 'robots', content: 'index, follow' });

    // Open Graph
    this.metaService.updateTag({ property: 'og:title', content: data.title });
    this.metaService.updateTag({ property: 'og:description', content: data.description });
    this.metaService.updateTag({ property: 'og:type', content: 'website' });
    this.metaService.updateTag({ property: 'og:url', content: fullUrl });
    this.metaService.updateTag({ property: 'og:image', content: ogImage });

    // Twitter
    this.metaService.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.metaService.updateTag({ name: 'twitter:title', content: data.title });
    this.metaService.updateTag({ name: 'twitter:description', content: data.description });
  }
}
