// stream-exit.guard.ts
import { Injectable, inject } from '@angular/core';
import { CanDeactivate } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { Observable, of, from, defer } from 'rxjs';
import { mapTo, switchMap, take } from 'rxjs/operators';
import { WowzaPublishService } from '../services/wowza-publish.service';
import { ConfirmEndStreamDialog } from '../components/dialogs/confirm-stream.dialog';

// Your StreamComponent type
export interface StreamAware {
    beforeRouteLeave?: () => Promise<void> | void; // optional hook on the component
}

@Injectable({ providedIn: 'root' })
export class StreamExitGuard implements CanDeactivate<StreamAware> {
    private dialog = inject(MatDialog);
    private wowzaService = inject(WowzaPublishService);

    canDeactivate(component: StreamAware): Observable<boolean> | boolean {
        return this.wowzaService.isLive$.pipe(
            take(1),
            switchMap(isLive => {
                if (!isLive) return of(true);

                const ref = this.dialog.open(ConfirmEndStreamDialog, {
                    width: '420px',
                    data: { title: 'End stream?', body: 'You’re live. End the stream before leaving?' }
                });

                return ref.afterClosed().pipe(
                    switchMap(confirm => {
                        if (!confirm) return of(false);
                        // Prefer component hook if present; otherwise call service
                        const stop$ = component.beforeRouteLeave
                            ? defer(() => Promise.resolve(component.beforeRouteLeave!()))
                            : defer(() => Promise.resolve(this.wowzaService.stopPublish()));
                        return stop$.pipe(mapTo(true));
                    })
                );
            })
        )
    }
}

