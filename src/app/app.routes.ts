import { Routes } from "@angular/router";
import { WatchComponent } from "./components/watch/watch.component";
import { HOME_SEO } from "./services/seo.service";

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
    path: "read",
    data: { seo: { title: 'Read | skriin ai tv', description: 'Read on skriin ai tv.', noindex: true } },
    loadComponent: () => import("./components/read/read.component").then((m) => m.default),
  },
];
