import { ChangeDetectionStrategy, Component } from '@angular/core';

/** External links shown in the web footer. */
export const APP_STORE_URL = 'https://apps.apple.com/us/app/skriin/id6825611485';

/**
 * The web-only strip under the watch player: the page's one <h1> and a footer
 * of plain links, so the rendered homepage has real text and crawlable paths
 * to /features, /guides and the store. Not shown on the TV box (see
 * TvModeService and WatchComponent).
 *
 * /features and /guides are static pages outside the Angular app, so they use
 * plain href (a full page load), not routerLink.
 *
 * Fixed height and system fonts, so it never shifts when web fonts load.
 */
@Component({
  selector: 'app-site-footer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="title">skriin ai tv: the two-way TV</h1>
    <footer class="links" aria-label="About skriin">
      <a href="/features">How skriin works</a>
      <a href="/guides">Guides</a>
      <a href="https://skriin.tv/" target="_blank" rel="noopener">Get the box</a>
      <a [href]="appStoreUrl" target="_blank" rel="noopener">iPhone app</a>
      <a href="mailto:him@skriin.com">Contact</a>
      <a href="https://skriin.tv/policies/privacy-policy" target="_blank" rel="noopener">Privacy</a>
      <a href="https://skriin.tv/policies/terms-of-service" target="_blank" rel="noopener">Terms</a>
      <a href="https://x.com/skriintv" target="_blank" rel="noopener">X</a>
    </footer>
  `,
  styles: [`
    :host {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      height: var(--site-footer-h, 32px);
      padding: 0 12px;
      display: flex;
      align-items: center;
      gap: 16px;
      background: #000;
      border-top: 1px solid #1c1c22;
      font: 12px/1 system-ui, -apple-system, "Segoe UI", Arial, sans-serif;
      color: #8a8f9c;
      white-space: nowrap;
      overflow-x: auto;
      overflow-y: hidden;
      z-index: 20;
      box-sizing: border-box;
    }
    .title {
      margin: 0;
      font: inherit;
      font-weight: 500;
      color: #c9ccd6;
      flex: none;
    }
    .links {
      display: flex;
      gap: 14px;
      margin-left: auto;
      flex: none;
    }
    a {
      color: inherit;
      text-decoration: none;
    }
    a:hover, a:focus-visible {
      color: #fff;
      text-decoration: underline;
    }
  `],
})
export class SiteFooterComponent {
  readonly appStoreUrl = APP_STORE_URL;
}
