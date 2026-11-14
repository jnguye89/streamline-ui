import { Routes } from '@angular/router';

/**
 * For skriin.com (with provideRouter(routes, withComponentInputBinding())).
 * /play/ is shared with poker and mahjong: the server says which game a code belongs to, so in the
 * real app a small resolver picks the game before this component loads.
 */
export const BOT_OR_NOT_ROUTES: Routes = [
  {
    path: 'tv/bot-or-not',
    loadComponent: () => import('./tv/bot-or-not-tv.component').then((m) => m.BotOrNotTvComponent),
  },
  {
    path: 'play/:code',
    loadComponent: () => import('./phone/bot-or-not-phone.component').then((m) => m.BotOrNotPhoneComponent),
  },
];
