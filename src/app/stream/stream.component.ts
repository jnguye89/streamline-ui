import { Component, ElementRef, ViewChild } from "@angular/core";
import { FlexLayoutModule } from "@angular/flex-layout";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";

@Component({
  selector: "app-stream",
  standalone: true,
  imports: [MatButtonModule, MatIconModule, FlexLayoutModule],
  templateUrl: "./stream.component.html",
  styleUrl: "./stream.component.scss",
})
export class StreamComponent {
  @ViewChild("video") videoElement!: ElementRef<HTMLVideoElement>;
  private stream: MediaStream | null = null;
  streaming = false;
  isStreaming = false;

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
          this.stream = stream;
          this.videoElement.nativeElement.srcObject = stream;
          this.streaming = true;
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

  resumeWebcam() {
    this.videoElement.nativeElement.play();
    this.isStreaming = true;
    console.log(this.isStreaming);
  }

  pauseWebcam() {
    this.videoElement.nativeElement.pause();
    this.isStreaming = false;
    console.log(this.isStreaming);
  }

  stopWebcam() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.videoElement.nativeElement.srcObject = null;
      this.streaming = false;
    }
  }

  ngOnDestroy() {
    this.stopWebcam();
  }
}
