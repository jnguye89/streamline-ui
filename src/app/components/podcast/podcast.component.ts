import { Component, OnInit } from '@angular/core';
import { SeoService } from '../../services/seo.service';

@Component({
  selector: 'app-podcast',
  standalone: true,
  imports: [],
  templateUrl: './podcast.component.html',
  styleUrl: './podcast.component.scss'
})
export class PodcastComponent implements OnInit {
  constructor(
    private seo: SeoService
  ) { }

  ngOnInit(): void {
    this.setUpSeo();
  }

  // Helpers
  private setUpSeo() {
    const title = 'Skriin AI TV';
    const description =
      'Discover and watch creators, VODs, podcasts and live channels in one curated interface powered by AI recommendations and voice search.';
    const keywords =
      'watch streaming content, creator hub tv, ai recommendations, vod player, voice search tv, live channels';
    this.seo.setTags({ title, description, keywords, path: '/podcast' });
  }
}
