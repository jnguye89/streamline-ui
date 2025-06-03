import { Component, ElementRef, OnDestroy, ViewChild } from "@angular/core";
import { FlexLayoutModule } from "@angular/flex-layout";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { VideoService } from "../services/video.service";
import { Subject } from "rxjs";
import { HttpClientModule } from "@angular/common/http";
import { DatePipe } from "@angular/common";
import { IvsBroadcastService } from "../services/ivs-broadcast.service";

@Component({
  selector: "app-stream",
  standalone: true,
  imports: [MatButtonModule, MatIconModule, FlexLayoutModule, HttpClientModule],
  providers: [VideoService, DatePipe, IvsBroadcastService],
  templateUrl: "./stream.component.html",
  styleUrl: "./stream.component.scss",
})
export class StreamComponent implements OnDestroy {
  private destroy$ = new Subject<void>();
  @ViewChild("video") videoElement!: ElementRef<HTMLVideoElement>;
  broadcasting = false;

  constructor(private ivs: IvsBroadcastService) {}

  async ngAfterViewInit() {
    // this.ivs.startBroadcast();
    this.videoElement.nativeElement.srcObject =
      await navigator.mediaDevices.getUserMedia({ video: true, audio: false });

    await this.ivs.init();
    this.ivs.startBroadcast();
  }
  // async ngAfterViewInit() {
  //   await this.ivs.init();
  //   this.ivs.metrics // observable polling if you want live stats
  //     ?.pipe(takeUntil(this.destroy$))
  //     .subscribe((m) => console.log("bitrate", m.video.bitrate));
  //   // mirror local cam
  //   this.videoElement.nativeElement.srcObject =
  //     await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  // }

  async toggle() {
    //   if (this.broadcasting) await this.ivs.stop();
    //   else await this.ivs.start();
    //   this.broadcasting = !this.broadcasting;
  }

  // getFormattedNow(): string {
  //   return this.datePipe.transform(new Date(), "yyyyMMdd_HH:mm:ss") || "";
  // }

  uploadVideo(blob: Blob) {
    //   var date = new Date().toString();
    //   const file = new File(
    //     [blob],
    //     `${this.getFormattedNow()}_webcam-recording.webm`,
    //     { type: "video/webm" }
    //   );
    //   this.videoService
    //     .uploadFirebaseVideo(file)
    //     .pipe(takeUntil(this.destroy$))
    //     .subscribe();
  }

  resumeWebcam() {
    this.ivs.startBroadcast();
    this.videoElement.nativeElement.play();
    //   this.mediaRecorder.resume();
    //   this.isStreaming = true;
    this.broadcasting = true;
    //   this.ivs.start();
  }

  pauseWebcam() {
    this.videoElement.nativeElement.pause();
    this.ivs.stopBroadcast();
    this.broadcasting = false;
    //   this.isStreaming = false;
    //   this.mediaRecorder.pause();
  }

  stopWebcam() {
    this.ivs.stopBroadcast();
    this.videoElement.nativeElement.srcObject = null;
    // this.media
    //   if (this.stream) {
    //     this.stream.getTracks().forEach((track) => track.stop());
    //     this.mediaRecorder.stop();
    //     this.videoElement.nativeElement.srcObject = null;
    //     this.streaming = false;
    //   }
  }

  ngOnDestroy() {
    // this.stopWebcam();
    this.destroy$.next();
    this.destroy$.complete();
  }
}
