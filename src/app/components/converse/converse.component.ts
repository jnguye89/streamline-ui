import { Component, OnInit } from "@angular/core";
import {
  DomSanitizer,
  Meta,
  SafeResourceUrl,
  Title,
} from "@angular/platform-browser";
import { SeoService } from "../../services/seo.service";

@Component({
  selector: "app-converse",
  standalone: true,
  imports: [],
  templateUrl: "./converse.component.html",
  styleUrl: "./converse.component.scss",
})
export class ConverseComponent implements OnInit {
  safeUrl: SafeResourceUrl;

  constructor(private sanitizer: DomSanitizer, private seo: SeoService) {
    this.safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
      "https://conversational-interface-hashem5.replit.app/"
    );
  }

  ngOnInit() {
    this.setUpSeo();
  }

  private setUpSeo() {
    const title = 'Skriin AI TV';
    const description =
      "Natural-language chat with on-screen AI. Ask anything, control playback, search shows or get trivia while you watch.";
    const keywords =
      "ai voice assistant tv, talk to tv, llm search, conversational ui, smart tv chatbot";

    this.seo.setTags({
      title,
      description,
      keywords,
      path: "/watch",
      // image: "https://www.yoursite.com/assets/calls-og-image.jpg",
    });
  }
}
