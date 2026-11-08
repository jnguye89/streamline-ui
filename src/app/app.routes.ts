import { Routes } from "@angular/router";
import { WatchComponent } from "./components/watch/watch.component";
import { StreamComponent } from "./components/stream/stream.component";
import { ListenComponent } from "./components/listen/listen.component";
import { ProfileComponent } from "./components/profile/profile.component";
import { ConverseComponent } from "./components/converse/converse.component";
import ReadComponent from "./components/read/read.component";
import { DeviceLoginComponent } from "./components/device-login/device-login.component";
import { SeoData } from "./services/seo.service";

// Homepage tags. /watch renders the same feed, so it canonicalizes to "/".
const HOME_SEO: SeoData = {
  title: "skriin ai tv: watch, go live and podcast from your TV",
  description:
    "skriin turns the TV you already own into a two-way TV. Watch live shows and video podcasts, go live from your couch and simulcast to YouTube, Twitch and Kick.",
  canonicalPath: "/",
};

export const routes: Routes = [
  {
    path: "login",
    data: { seo: { title: 'Sign in on your TV | skriin ai tv', description: 'Sign in to skriin ai tv on your TV by scanning a code with your phone.', noindex: true } },
    component: DeviceLoginComponent,
  },
  {
    path: "",
    data: { seo: HOME_SEO },
    component: WatchComponent,
  },
  {
    path: "profile/:id",
    data: { seo: { title: 'Channel | skriin ai tv', description: 'Watch live streams, video podcasts and replays from this skriin channel, on your TV, phone or any browser.' } },
    component: ProfileComponent
  },
  {
    path: "yap",
    data: { seo: { title: 'Yap: talk to your TV, out loud | skriin ai tv', description: 'Press start and talk. Ask anything out loud and your TV talks back. Yap is the voice AI built into skriin ai tv.', canonicalPath: '/yap' } },
    component: ConverseComponent,
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
    component: StreamComponent
  },
  {
    path: "listen",
    data: { seo: { title: 'Listen | skriin ai tv', description: 'Listen on skriin ai tv.', noindex: true } },
    component: ListenComponent,
  },
  {
    path: "profile",
    data: { seo: { title: 'Your profile | skriin ai tv', description: 'Manage your skriin channel and settings.', noindex: true } },
    component: ProfileComponent,
  },
  {
    path: "read",
    data: { seo: { title: 'Read | skriin ai tv', description: 'Read on skriin ai tv.', noindex: true } },
    component: ReadComponent,
  },
];
