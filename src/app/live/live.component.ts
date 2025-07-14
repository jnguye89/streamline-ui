import { AfterViewInit, Component, OnInit } from "@angular/core";
import { environment } from "../../environments/environment";
import { Meta, Title } from "@angular/platform-browser";

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

  constructor(private titleService: Title, private metaService: Meta) {}
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
      content: "https://www.yoursite.com/live",
    });
    this.metaService.updateTag({
      property: "og:image",
      content: "https://www.yoursite.com/assets/live-og-image.jpg",
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
