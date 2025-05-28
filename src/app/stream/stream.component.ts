import { Component, ElementRef, ViewChild } from "@angular/core";
import { FlexLayoutModule } from "@angular/flex-layout";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { VideoService } from "../services/video.service";
import { Subject, takeUntil } from "rxjs";
import { HttpClientModule } from "@angular/common/http";
import { DatePipe } from "@angular/common";
import { io } from "socket.io-client";
import { environment } from "../../environments/environment";

const streamSocket = io(environment.baseUrl, {
  transports: ["websocket"], 
  withCredentials: true,
});
@Component({
  selector: "app-stream",
  standalone: true,
  imports: [MatButtonModule, MatIconModule, FlexLayoutModule, HttpClientModule],
  providers: [VideoService, DatePipe],
  templateUrl: "./stream.component.html",
  styleUrl: "./stream.component.scss",
})
export class StreamComponent {
  private destroy$ = new Subject<void>();
  @ViewChild("video") videoElement!: ElementRef<HTMLVideoElement>;
  mediaRecorder!: MediaRecorder;
  recordedChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  streaming = false;
  isStreaming = false;

  constructor(private videoService: VideoService, private datePipe: DatePipe) {}

  ngOnInit() {
    this.startWebcam();
  }

  startWebcam() {
    if (
      typeof navigator !== "undefined" &&
      navigator.mediaDevices?.getUserMedia
    ) {
      navigator.mediaDevices
        .getUserMedia({ video: true, audio: true })
        .then((stream) => {
          const mediaRecorder = new MediaRecorder(stream, {
            mimeType: "video/webm",
          });
          this.stream = stream;
          this.videoElement.nativeElement.srcObject = stream;
          this.streaming = true;
          this.mediaRecorder = new MediaRecorder(stream);
          this.recordedChunks = [];

          this.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              this.recordedChunks.push(event.data);
              event.data.arrayBuffer().then((buffer) => {
                console.log("Sending chunk", buffer.byteLength);
                streamSocket.emit("stream-data", new Uint8Array(buffer));
              });
            }
          };

          this.mediaRecorder.onstop = () => {
            const blob = new Blob(this.recordedChunks, { type: "video/webm" });
            // this.uploadVideo(blob);
          };

          this.mediaRecorder.start(100);
        })
        .catch((err) => {
          console.error("Error accessing webcam:", err);
        });
      this.isStreaming = true;
    } else {
      console.warn(
        "Webcam access is not available (possibly running on server)"
      );
    }
  }

  getFormattedNow(): string {
    return this.datePipe.transform(new Date(), "yyyyMMdd_HH:mm:ss") || "";
  }

  uploadVideo(blob: Blob) {
    var date = new Date().toString();
    const file = new File(
      [blob],
      `${this.getFormattedNow()}_webcam-recording.webm`,
      { type: "video/webm" }
    );
    this.videoService
      .uploadFirebaseVideo(file)
      .pipe(takeUntil(this.destroy$))
      .subscribe();
  }

  resumeWebcam() {
    this.videoElement.nativeElement.play();
    this.mediaRecorder.resume();
    this.isStreaming = true;
  }

  pauseWebcam() {
    this.videoElement.nativeElement.pause();
    this.isStreaming = false;
    this.mediaRecorder.pause();
  }

  stopWebcam() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.mediaRecorder.stop();
      this.videoElement.nativeElement.srcObject = null;
      this.streaming = false;
    }
  }

  ngOnDestroy() {
    this.stopWebcam();
    this.destroy$.next();
    this.destroy$.complete();
  }
}
