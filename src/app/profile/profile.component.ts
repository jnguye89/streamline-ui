import { Component } from "@angular/core";
import { VideoService } from "../services/video.service";
import { HttpClientModule } from "@angular/common/http";
import { MatIconModule } from "@angular/material/icon";
import { FlexLayoutModule } from "@angular/flex-layout";
import { first } from "rxjs";

@Component({
  selector: "app-profile",
  standalone: true,
  imports: [HttpClientModule, MatIconModule, FlexLayoutModule],
  providers: [VideoService],
  templateUrl: "./profile.component.html",
  styleUrl: "./profile.component.scss",
})
export class ProfileComponent {
  constructor(private videoService: VideoService) {}
  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    this.videoService.uploadFirebaseVideo(file).pipe(first()).subscribe();;
  }
}
