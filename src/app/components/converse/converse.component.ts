import { Component, OnInit } from "@angular/core";
import {
  DomSanitizer,
  Meta,
  SafeResourceUrl,
  Title,
} from "@angular/platform-browser";

@Component({
  selector: "app-converse",
  standalone: true,
  imports: [],
  templateUrl: "./converse.component.html",
  styleUrl: "./converse.component.scss",
})
export class ConverseComponent implements OnInit {
  safeUrl: SafeResourceUrl;

  constructor(
      private sanitizer: DomSanitizer,
      private titleService: Title,
      private metaService: Meta
  ) {
    this.safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
      "https://bayareaaitv.com/"
    );
  }

  ngOnInit() {
    this.setUpSeo();
  }

  private setUpSeo() {
    const title = "Yap – Skriin AI TV";
    const description =
      "Natural-language chat with on-screen AI. Ask anything, control playback, search shows or get trivia while you watch.";
    const keywords =
      "ai voice assistant tv, talk to tv, llm search, conversational ui, smart tv chatbot";

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
      content: "https://www.yoursite.com/yap",
    });
    this.metaService.updateTag({
      property: "og:image",
      content: "https://www.yoursite.com/assets/yap-og-image.jpg",
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
