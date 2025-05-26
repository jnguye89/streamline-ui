import { Routes } from '@angular/router';
import { WatchComponent } from './watch/watch.component';
import { CallsComponent } from './calls/calls.component';
import { StreamComponent } from './stream/stream.component';
import { ListenComponent } from './listen/listen.component';
import { ProfileComponent } from './profile/profile.component';
import { LiveComponent } from './live/live.component';

export const routes: Routes = [
    {
        path: '',
        component: WatchComponent
    },
    {
        path: 'watch',
        component: WatchComponent
    },
    {
        path: 'calls',
        component: CallsComponent
    },
    {
        path: 'stream',
        component: StreamComponent
    },
    {
        path: 'listen',
        component: ListenComponent
    },
    {
        path: 'profile',
        component: ProfileComponent
    },
    {
        path: 'live',
        component: LiveComponent
    }
];
