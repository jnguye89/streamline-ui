import { AfterViewInit, Component, OnInit } from "@angular/core";
import { environment } from "../../environments/environment";
import { SeoService } from "../services/seo.service";

declare const IVSPlayer: any;

@Component({
  selector: "app-live",
  standalone: true,
  imports: [],
  templateUrl: "./live.component.html",
  styleUrl: "./live.component.scss",
})
export class LiveComponent implements AfterViewInit, OnInit {
  isPortrait = false;

  constructor(private seo: SeoService) {}
  ngAfterViewInit(): void {
    const videoEl = document.getElementById("live-player") as HTMLVideoElement;

    if (IVSPlayer.isPlayerSupported) {
      const player = IVSPlayer.create();
      player.attachHTMLVideoElement(videoEl);
      player.load(environment.streamUrl);
      player.play();
    } else {
      console.error("IVS player not supported in this browser");
    }
  }

  ngOnInit(): void {
    this.setUpSeo();
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
