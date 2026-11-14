import { Routes, UrlMatcher, UrlSegment } from "@angular/router";
import { WatchComponent } from "./components/watch/watch.component";
import { HOME_SEO } from "./services/seo.service";

/**
 * skriin.com/play/CODE: a 4-letter room code a phone opens from the TV's QR code. Only exact
 * 4-letter codes match, so /play/poker, /play/mahjong etc. never land here. Bot or Not is the only
 * game with phone rooms so far; when another game gets them, a resolver picks the game from the code.
 */
const roomCodeMatcher: UrlMatcher = (segments: UrlSegment[]) =>
  segments.length === 2 && segments[0].path === 'play' && /^[A-Za-z]{4}$/.test(segments[1].path)
    ? { consumed: segments, posParams: { code: segments[1] } }
    : null;

export const routes: Routes = [
  {
    path: "login",
    data: { seo: { title: 'Sign in on your TV | skriin ai tv', description: 'Sign in to skriin ai tv on your TV by scanning a code with your phone.', noindex: true } },
    loadComponent: () => import("./components/device-login/device-login.component").then((m) => m.DeviceLoginComponent),
  },
  {
    path: "",
    data: { seo: HOME_SEO },
    component: WatchComponent,
  },
  {
    path: "profile/:id",
    data: { seo: { title: 'Channel | skriin ai tv', description: 'Watch live streams, video podcasts and replays from this skriin channel, on your TV, phone or any browser.' } },
    loadComponent: () => import("./components/profile/profile.component").then((m) => m.ProfileComponent)
  },
  {
    path: "yap",
    data: { seo: { title: 'Yap: talk to your TV, out loud | skriin ai tv', description: 'Press start and talk. Ask anything out loud and your TV talks back. Yap is the voice AI built into skriin ai tv.', canonicalPath: '/yap' } },
    loadComponent: () => import("./components/converse/converse.component").then((m) => m.ConverseComponent),
  },
  {
    path: "podcast",
    data: { seo: { title: 'Record a video podcast from your couch | skriin ai tv', description: 'Invite guests, hit record and make a video podcast from your TV with skriin. Go live while you record. No computer or editing software needed.', canonicalPath: '/podcast' } },
    // Lazy-load a standalone component
    loadComponent: () =>
      import('./components/podcast/podcast.component').then(m => m.PodcastComponent),
    // Optional: scope providers to this lazy route so they stay out of initial bundle
    providers: [
      // e.g. your call-specific services
      // CallService,
      // RtcService,
      // RtmService,
    ],
  },
  {
    path: "watch",
    data: { seo: { ...HOME_SEO } },
    component: WatchComponent,
  },
  {
    path: "watch/:id",
    data: { seo: { title: 'Watch on skriin ai tv', description: 'Watch live shows, streams and video podcasts from real people on skriin. Free to watch on your TV, phone or any browser.' } },
    component: WatchComponent,
  },
  {
    path: "call",
    data: { seo: { title: 'Calls | skriin ai tv', description: 'Video calls on your TV with skriin ai tv.', noindex: true } },
    // Lazy-load a standalone component
    loadComponent: () =>
      import('./components/calls/calls.component').then(m => m.CallsComponent),
    // Optional: scope providers to this lazy route so they stay out of initial bundle
    providers: [
      // e.g. your call-specific services
      // CallService,
      // RtcService,
      // RtmService,
    ],
  },
  {
    path: "stream",
    data: { seo: { title: 'Go live from your TV | skriin ai tv', description: 'Go live from your couch with a camera, a screen or both, and simulcast to skriin, YouTube, Twitch and Kick at the same time. No streaming PC.', canonicalPath: '/stream' } },
    loadComponent: () => import("./components/stream/stream.component").then((m) => m.StreamComponent)
  },
  {
    path: "listen",
    data: { seo: { title: 'Listen | skriin ai tv', description: 'Listen on skriin ai tv.', noindex: true } },
    loadComponent: () => import("./components/listen/listen.component").then((m) => m.ListenComponent),
  },
  {
    path: "profile",
    data: { seo: { title: 'Your profile | skriin ai tv', description: 'Manage your skriin channel and settings.', noindex: true } },
    loadComponent: () => import("./components/profile/profile.component").then((m) => m.ProfileComponent),
  },
  {
    path: "play/poker",
    data: { seo: { title: 'Poker on your TV | skriin ai tv', description: "Play no-limit Texas hold'em with free chips on your TV, with a controller, the remote or a keyboard.", canonicalPath: '/play/poker' } },
    loadComponent: () =>
      import('./components/play-poker/play-poker.component').then(m => m.PlayPokerComponent),
  },
  {
    path: "play/backgammon",
    data: { seo: { title: 'Backgammon on your TV | skriin ai tv', description: 'Play backgammon on your TV against the computer or a friend on the same couch, with a controller, the remote or a keyboard.', canonicalPath: '/play/backgammon' } },
    loadComponent: () =>
      import('./components/play-backgammon/play-backgammon.component').then(m => m.PlayBackgammonComponent),
  },
  {
    path: "play/checkers",
    data: { seo: { title: 'Checkers on your TV | skriin ai tv', description: 'Play checkers against the computer on your TV, with a controller, the remote or a keyboard. Three levels, hints and undo.', canonicalPath: '/play/checkers' } },
    loadComponent: () =>
      import('./components/play-checkers/play-checkers.component').then(m => m.PlayCheckersComponent),
  },
  {
    path: "play/bot-or-not",
    data: { seo: { title: 'Bot or Not on your TV | skriin ai tv', description: 'A party game for the TV: everyone answers a prompt on their phone, one answer is written by a bot, and the room votes on which one.', canonicalPath: '/play/bot-or-not' } },
    loadComponent: () =>
      import('./components/play-bot-or-not/play-bot-or-not.component').then(m => m.PlayBotOrNotComponent),
  },
  {
    matcher: roomCodeMatcher,
    data: { seo: { title: 'Join a game | skriin ai tv', description: 'Join the game on the TV from your phone.', noindex: true } },
    loadComponent: () =>
      import('./components/play-bot-or-not/play-bot-or-not-phone.component').then(m => m.PlayBotOrNotPhoneComponent),
  },
  {
    path: "play/mahjong",
    data: { seo: { title: 'Mahjong on your TV | skriin ai tv', description: 'Play Hong Kong mahjong against computer players on your TV, with a controller, the remote or a keyboard.', canonicalPath: '/play/mahjong' } },
    loadComponent: () =>
      import('./components/play-mahjong/play-mahjong.component').then(m => m.PlayMahjongComponent),
  },
  {
    path: "read",
    data: { seo: { title: 'Read | skriin ai tv', description: 'Read on skriin ai tv.', noindex: true } },
    loadComponent: () => import("./components/read/read.component").then((m) => m.default),
  },
];
