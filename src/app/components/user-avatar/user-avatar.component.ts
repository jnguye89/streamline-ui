import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, OnChanges } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

// Same colours and hash as the mobile app (streamline-mobile/src/components/user-mark.tsx),
// so a person keeps the same colour on the TV, the web and the phone.
const COLORS = ['#E5484D', '#F76B15', '#FFC53D', '#46A758', '#12A594', '#0090FF', '#8E4EC6', '#D6409F'];

export function colorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length];
}

/**
 * Auth0 gives accounts without a photo a generated picture (initials on a coloured circle),
 * served as a Gravatar link that falls back to cdn.auth0.com/avatars/, or that image directly.
 * We draw the initial ourselves instead, like the mobile app.
 */
export function isDefaultAuth0Avatar(url: string): boolean {
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    // Not URI-encoded; check it as it is.
  }
  return decoded.includes('cdn.auth0.com/avatars/');
}

/** A real photo URL, or null for none / Auth0's generated one. */
export function realPhoto(url: string | null | undefined): string | null {
  return url && !isDefaultAuth0Avatar(url) ? url : null;
}

/**
 * A person as a circle, the same way the mobile app draws them: their photo, else their
 * initial on their colour, else the person icon while there's nothing to show (signed out).
 */
@Component({
  selector: 'app-user-avatar',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <img *ngIf="photo && !photoFailed; else noPhoto" class="avatar" [src]="photo" alt=""
      referrerpolicy="no-referrer" (error)="photoFailed = true" />
    <ng-template #noPhoto>
      <span *ngIf="userId && name; else personIcon" class="avatar avatar--initial"
        [style.background]="color">{{ initial }}</span>
    </ng-template>
    <ng-template #personIcon><mat-icon class="person">person</mat-icon></ng-template>
  `,
  styles: [`
    :host { display: inline-grid; place-items: center; width: var(--avatar-size, 36px); height: var(--avatar-size, 36px); }
    .avatar {
      width: 100%; height: 100%; border-radius: 50%; object-fit: cover; box-sizing: border-box;
      border: 1.5px solid rgba(255, 255, 255, 0.85);
    }
    .avatar--initial {
      display: grid; place-items: center; color: #fff; font-weight: 600;
      font-size: calc(var(--avatar-size, 36px) * 0.46); line-height: 1;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
    }
    .person { color: #fff; font-size: calc(var(--avatar-size, 36px) * 0.7); width: auto; height: auto; }
  `],
})
export class UserAvatarComponent implements OnChanges {
  /** Whose avatar; picks the colour of the initial circle. */
  @Input() userId: string | null | undefined;
  /** Photo URL as Auth0 gives it; the generated initials avatar is ignored. */
  @Input() set picture(url: string | null | undefined) { this.photo = realPhoto(url); }
  @Input() name: string | null | undefined;

  photo: string | null = null;
  photoFailed = false;

  get initial(): string {
    return (this.name ?? '').trim().charAt(0).toUpperCase();
  }

  get color(): string {
    return colorFor(this.userId ?? '');
  }

  ngOnChanges(): void {
    // A new photo gets a fresh try even if the last one failed to load.
    this.photoFailed = false;
  }
}
