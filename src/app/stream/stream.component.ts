import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
} from "@angular/core";
import { FlexLayoutModule } from "@angular/flex-layout";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { VideoService } from "../services/video.service";
import { first, Subject } from "rxjs";
import { HttpClientModule } from "@angular/common/http";
import { CommonModule, DatePipe } from "@angular/common";
import { IvsBroadcastService } from "../services/ivs-broadcast.service";
import { AuthService } from "@auth0/auth0-angular";

@Component({
  selector: "app-stream",
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    FlexLayoutModule,
    HttpClientModule,
    CommonModule,
  ],
  providers: [VideoService, DatePipe, IvsBroadcastService],
  templateUrl: "./stream.component.html",
  styleUrl: "./stream.component.scss",
})
export class StreamComponent implements OnDestroy, AfterViewInit, OnInit {
  isAuthenticated$ = this.auth.isAuthenticated$;
  private destroy$ = new Subject<void>();
  @ViewChild("video") videoElement!: ElementRef<HTMLVideoElement>;
  broadcasting = false;

  constructor(
    public auth: AuthService,
    private ivs: IvsBroadcastService,
    private videoService: VideoService
  ) {}

  async ngOnInit() {
    this.isAuthenticated$.pipe(first()).subscribe((isAuthenticated) => {
      if (!isAuthenticated) {
        this.auth.loginWithPopup();
      }
    });
  }

  async ngAfterViewInit() {
    this.videoElement.nativeElement.srcObject =
      await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

    await this.ivs.init();
  }

  async toggle() {}

  resumeWebcam() {
    this.ivs.startBroadcast();
    this.videoElement.nativeElement.play();
    this.broadcasting = true;
  }

  pauseWebcam() {
    this.videoElement.nativeElement.pause();
    this.ivs.stopBroadcast();
    this.broadcasting = false;
  }

  stopWebcam() {
    this.ivs.stopBroadcast();
    this.videoElement.nativeElement.srcObject = null;
    this.broadcasting = false;
  }

  ngOnDestroy() {
    this.broadcasting = false;
    this.destroy$.next();
    this.destroy$.complete();
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    this.videoService.uploadVideo(file).pipe(first()).subscribe();
  }
}
