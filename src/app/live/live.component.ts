import { AfterViewInit, Component } from "@angular/core";
import { environment } from "../../environments/environment";

declare const IVSPlayer: any;

@Component({
  selector: "app-live",
  standalone: true,
  imports: [],
  templateUrl: "./live.component.html",
  styleUrl: "./live.component.scss",
})
export class LiveComponent implements AfterViewInit {
  isPortrait = false;
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
}
