// stream-exit.guard.ts
import { Injectable, inject } from '@angular/core';
import { CanDeactivate } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { Observable, of, from, defer } from 'rxjs';
import { mapTo, switchMap, take } from 'rxjs/operators';
import { WowzaPublishService } from '../services/wowza-publish.service';
import { ConfirmEndStreamDialog } from '../components/dialogs/confirm-stream.dialog';

// Your StreamComponent type
export interface CanComponentDeactivate {
    canDeactivate: () => boolean | Promise<boolean> | import('rxjs').Observable<boolean>;
}

@Injectable({ providedIn: 'root' })
export class StreamExitGuard implements CanDeactivate<CanComponentDeactivate> {
    canDeactivate(component: CanComponentDeactivate): boolean | Observable<boolean> | Promise<boolean> {
        return component.canDeactivate ? component.canDeactivate() : true;
    }
}

