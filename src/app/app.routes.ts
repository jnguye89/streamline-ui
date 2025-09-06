import { Routes } from "@angular/router";
import { WatchComponent } from "./components/watch/watch.component";
import { CallsComponent } from "./components/calls/calls.component";
import { StreamComponent } from "./components/stream/stream.component";
import { ListenComponent } from "./components/listen/listen.component";
import { ProfileComponent } from "./components/profile/profile.component";
import { ConverseComponent } from "./components/converse/converse.component";
import ReadComponent from "./components/read/read.component";

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
    path: "watch",
    component: WatchComponent,
  },
  {
    path: "call",
    component: CallsComponent,
  },
  {
    path: "stream",
    component: StreamComponent,
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
