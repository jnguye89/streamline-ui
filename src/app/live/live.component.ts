import { AfterViewInit, Component, OnDestroy, OnInit } from "@angular/core";
import { SeoService } from "../services/seo.service";
import { WowzaPlayService } from "../services/wowza-play.service";
import { MatIconModule } from "@angular/material/icon";

declare const IVSPlayer: any;

@Component({
  selector: "app-live",
  standalone: true,
  imports: [MatIconModule],
  templateUrl: "./live.component.html",
  styleUrl: "./live.component.scss",
})
export class LiveComponent implements AfterViewInit, OnInit, OnDestroy {
  isPortrait = false;

  constructor(private seo: SeoService, private wowzaPlayService: WowzaPlayService) { }

  ngAfterViewInit(): void {
    const videoEl = document.getElementById("live-player") as HTMLVideoElement;
    this.wowzaPlayService.init(videoEl);
    this.wowzaPlayService.play();
  }

  ngOnInit(): void {
    this.setUpSeo();
  }

  play(): void {
    this.wowzaPlayService.play();
  }

  ngOnDestroy() {
    this.wowzaPlayService.stop();
  }

  private setUpSeo() {
    const title = "Live – Skriin AI TV";
    const description =
      "Tune in to always-on live news, sports and creator channels. AI chaptering, instant replay and multi-angle switching included.";
    const keywords =
      "live tv channels, sports streaming, ai chaptering, instant replay tv, multi-angle live";

    this.seo.setTags({
      title,
      description,
      keywords,
      path: "/watch",
      // image: "https://www.yoursite.com/assets/calls-og-image.jpg",
    });
  }
}
