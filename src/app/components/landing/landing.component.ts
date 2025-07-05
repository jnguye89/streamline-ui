import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-landing',
  standalone: true,
  template: `
    <div class="h-screen flex flex-col items-center justify-center">
      <h1 class="text-2xl mb-4">Skriin</h1>
      <!-- <button class="px-6 py-3 rounded bg-green-600 text-white"
              (click)="enter()">Enter</button> -->
    </div>
  `,
})
export class LandingComponent {
  constructor(private router: Router) {}
  async enter() {
    /* works only after a user gesture */
    try {
      // Feature-check because Safari will ignore this
      await (screen.orientation as any)?.lock?.('landscape');
    } catch (err) {
      console.warn('Orientation lock failed:', err);
    }
    this.router.navigateByUrl('/home');   // your real app route
  }
}
