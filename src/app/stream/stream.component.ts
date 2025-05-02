import { Component, ElementRef, ViewChild } from '@angular/core';

@Component({
  selector: 'app-stream',
  standalone: true,
  imports: [],
  templateUrl: './stream.component.html',
  styleUrl: './stream.component.scss',
})
export class StreamComponent {
  @ViewChild('video') videoElement!: ElementRef<HTMLVideoElement>;
  private stream: MediaStream | null = null;
  streaming = false;

  ngOnInit() {
    this.startWebcam();
  }

  startWebcam() {
    if (this.streaming) return;

    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((stream) => {
        this.stream = stream;
        this.videoElement.nativeElement.srcObject = stream;
        this.streaming = true;
      })
      .catch((err) => {
        console.error('Error accessing webcam:', err);
      });
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
