import { Routes } from "@angular/router";
import { WatchComponent } from "./components/watch/watch.component";
import { CallsComponent } from "./components/calls/calls.component";
import { StreamComponent } from "./components/stream/stream.component";
import { ListenComponent } from "./components/listen/listen.component";
import { ProfileComponent } from "./components/profile/profile.component";
import { ConverseComponent } from "./components/converse/converse.component";
import ReadComponent from "./components/read/read.component";
import { PodcastComponent } from "./components/podcast/podcast.component";
import { StreamExitGuard } from "./guards/stream-exist.guard";

export const routes: Routes = [
  {
    path: "",
    component: WatchComponent,
  },
  {
    path: "profile/:id",
    component: ProfileComponent
  },
  {
    path: "yap",
    component: ConverseComponent,
  },
  {
    path: "podcast",
    component: PodcastComponent,
  },
  {
    path: "watch",
    component: WatchComponent,
  },
  {
    path: "call",
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
    component: StreamComponent,
    canDeactivate: [StreamExitGuard]
  },
  {
    path: "listen",
    component: ListenComponent,
  },
  {
    path: "profile",
    component: ProfileComponent,
  },
  {
    path: "read",
    component: ReadComponent,
  },
];
