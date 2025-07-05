import { Component } from "@angular/core";
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser";

@Component({
  selector: "app-converse",
  standalone: true,
  imports: [],
  templateUrl: "./converse.component.html",
  styleUrl: "./converse.component.scss",
})
export class ConverseComponent {
  safeUrl: SafeResourceUrl;

  constructor(private sanitizer: DomSanitizer) {
    this.safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
      "https://bayareaaitv.com/"
    );
  }
}
