import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

// Angular strips iframe/embed src bindings as unsafe URLs unless explicitly
// marked trusted. Only pipe URLs we control the shape of (e.g. YouTube embed
// URLs assembled server-side) through this - never raw user input.
@Pipe({
  name: 'safeUrl',
  standalone: true,
})
export class SafeUrlPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) { }

  transform(url: string | null | undefined): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(url ?? '');
  }
}
