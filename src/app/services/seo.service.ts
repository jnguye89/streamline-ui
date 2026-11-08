import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

/** The one domain search engines should treat as the home of skriin's content. */
export const SITE_ORIGIN = 'https://skriin.com';
export const SITE_NAME = 'skriin ai tv';
export const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/assets/MainLogo.png`;

export interface SeoData {
  title: string;
  description: string;
  /**
   * Canonical path, e.g. "/stream". Omit to use the current URL's path
   * (right for per-item routes such as /watch/:id and /profile/:id).
   */
  canonicalPath?: string;
  /** Keep the page out of search results (login, private or unfinished screens). */
  noindex?: boolean;
  /** Absolute URL of the share image. */
  image?: string;
}

/**
 * Sets the title, description, canonical, robots and social tags for every
 * route from its `data.seo` entry (see app.routes.ts), so each URL describes
 * itself instead of every route sharing the homepage's tags.
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private started = false;

  constructor(
    private titleService: Title,
    private meta: Meta,
    private router: Router,
    @Inject(DOCUMENT) private document: Document
  ) {}

  /** Call once at app start. */
  init(): void {
    if (this.started) return;
    this.started = true;
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        const seo = this.deepestSeo(this.router.routerState.snapshot.root);
        if (seo) this.setTags(seo, e.urlAfterRedirects);
      });
  }

  setTags(data: SeoData, currentUrl = this.router.url): void {
    const path = data.canonicalPath ?? this.cleanPath(currentUrl);
    const url = SITE_ORIGIN + (path === '/' ? '/' : path);
    const image = data.image ?? DEFAULT_OG_IMAGE;

    this.titleService.setTitle(data.title);
    this.meta.updateTag({ name: 'description', content: data.description });
    this.meta.updateTag({
      name: 'robots',
      content: data.noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large',
    });

    this.meta.updateTag({ property: 'og:title', content: data.title });
    this.meta.updateTag({ property: 'og:description', content: data.description });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.meta.updateTag({ property: 'og:image', content: image });
    this.meta.updateTag({ name: 'twitter:title', content: data.title });
    this.meta.updateTag({ name: 'twitter:description', content: data.description });
    this.meta.updateTag({ name: 'twitter:image', content: image });

    this.setCanonical(url);
  }

  private setCanonical(url: string): void {
    let link = this.document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.document.head.appendChild(link);
    }
    link.setAttribute('href', url);
  }

  private deepestSeo(snapshot: ActivatedRouteSnapshot): SeoData | undefined {
    let seo: SeoData | undefined;
    let node: ActivatedRouteSnapshot | null = snapshot;
    while (node) {
      if (node.data?.['seo']) seo = node.data['seo'];
      node = node.firstChild;
    }
    return seo;
  }

  /** Drops the query string, fragment and any trailing slash. */
  private cleanPath(url: string): string {
    const path = url.split(/[?#]/)[0] || '/';
    return path.length > 1 ? path.replace(/\/+$/, '') : '/';
  }
}
