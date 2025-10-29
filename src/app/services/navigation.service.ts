import { Injectable } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class NavigationService {
    private history: string[] = [];

    constructor(router: Router) {
        router.events.pipe(
            // ⬇️ type guard: narrows Event -> NavigationEnd
            filter((e): e is NavigationEnd => e instanceof NavigationEnd)
        )
            .subscribe((e: NavigationEnd) => {
                this.history.push(e.urlAfterRedirects);
            });
    }

    back(): string | undefined {
        this.history.pop(); // current
        return this.history.pop(); // previous
    }
}
