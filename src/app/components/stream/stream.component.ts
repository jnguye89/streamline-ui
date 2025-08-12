import {
  AfterViewInit,
  Component,
  ElementRef,
  OnInit,
  ViewChild,
} from "@angular/core";
import { FlexLayoutModule } from "@angular/flex-layout";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { VideoService } from "../../services/video.service";
import {
  ReplaySubject,
  Subject,
} from "rxjs";
import { CommonModule, DatePipe } from "@angular/common";
import { AuthService } from "@auth0/auth0-angular";
import { SeoService } from "../../services/seo.service";
import { WowzaPublishService } from "../../services/wowza-publish.service";
import { WebRtcState } from "../../models/webrtc-state.model";

@Component({
  selector: "app-stream",
  standalone: true,
  imports: [MatButtonModule, MatIconModule, FlexLayoutModule, CommonModule],
  providers: [VideoService, DatePipe, WowzaPublishService],
  templateUrl: "./stream.component.html",
  styleUrl: "./stream.component.scss",
})
export class StreamComponent implements AfterViewInit {
  isAuthenticated$ = this.auth.isAuthenticated$;
  private destroy$ = new Subject<void>();
  @ViewChild("video") videoElement!: ElementRef<HTMLVideoElement>;
  broadcasting = false;
  private viewReady$ = new ReplaySubject<void>(1);

  constructor(
    private wowzaService: WowzaPublishService,
    public auth: AuthService,
    private seo: SeoService,
  ) { }

  async ngAfterViewInit() {
    this.setUpSeo();
    const state: WebRtcState = {
      sdpUrl: 'wss://9b8d039ecdad.entrypoint.cloud.wowza.com/webrtc-session.json',
      applicationName: 'app-82XX3701',
      streamName: 'VU5rZnln',
      videoElementPublish: this.videoElement.nativeElement
    }
    this.wowzaService.init(state);
  }

  resumeWebcam() {
    this.wowzaService.start();
  }

  stopWebcam() {
    this.wowzaService.stop();
  }

  private setUpSeo() {
    const title = "Stream – Skriin AI TV";
    const description =
      "One-click streaming hub: push gameplay, camera or desktop to Twitch, YouTube & Skriin Cloud. AI overlays, chat integration, 0.6 s latency.";
    const keywords =
      "live game streaming, smart tv streamer, ai overlays, low latency broadcast, twitch youtube stream";

    this.seo.setTags({
      title,
      description,
      keywords,
      path: "/watch",
      // image: "https://www.yoursite.com/assets/calls-og-image.jpg",
    });
  }
}
