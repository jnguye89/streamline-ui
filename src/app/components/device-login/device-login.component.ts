import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subject, takeUntil } from 'rxjs';
import { DeviceAuthService } from '../../services/device-auth.service';
import QRCode from 'qrcode';

@Component({
  selector: 'app-device-login',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatProgressSpinnerModule],
  templateUrl: './device-login.component.html',
  styleUrl: './device-login.component.scss',
})
export class DeviceLoginComponent implements OnInit, OnDestroy {
  @ViewChild('qrCanvas') qrCanvas!: ElementRef<HTMLCanvasElement>;

  userCode: string | null = null;
  verificationUri: string | null = null;
  loading = true;
  error: string | null = null;
  private destroy$ = new Subject<void>();
  private returnUrl = '/';

  constructor(
    private deviceAuth: DeviceAuthService,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/';
    this.startFlow();
  }

  private startFlow(): void {
    this.loading = true;
    this.error = null;
    this.userCode = null;

    this.deviceAuth.initiateDeviceFlow()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.loading = false;
          this.userCode = res.userCode;
          this.verificationUri = res.verificationUri;

          // detectChanges renders the @if block so the canvas is in the DOM
          this.cdr.detectChanges();
          this.renderQr(res.verificationUriComplete);

          this.poll(res.deviceCode, res.interval);
        },
        error: () => {
          this.loading = false;
          this.error = 'Failed to start sign-in. Please try again.';
        },
      });
  }

  private renderQr(url: string): void {
    QRCode.toCanvas(this.qrCanvas.nativeElement, url, { width: 200, margin: 2 });
  }

  private poll(deviceCode: string, intervalSeconds: number): void {
    this.deviceAuth.pollForToken(deviceCode, intervalSeconds)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => this.router.navigateByUrl(this.returnUrl),
        error: (err: Error) => {
          this.error = err.message === 'expired'
            ? 'Sign-in expired. Please try again.'
            : 'Sign-in was denied. Please try again.';
        },
      });
  }

  retry(): void {
    this.startFlow();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
