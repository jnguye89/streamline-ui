#!/usr/bin/env node
// Writes skriin.com's crawlable marketing pages next to the Angular build:
//   /features, /guides, /guides/<slug>  ->  <out>/<path>/index.html
//   /sitemap.xml, /404.html
// Runs automatically after `npm run build` (the "postbuild" script).
//
// Usage: node scripts/build-seo.mjs [outDir]   (default dist/skriin/browser)

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GUIDES, GUIDES_HUB, HUBS, SITE } from '../seo/content.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, process.argv[2] ?? 'dist/skriin/browser');

if (!existsSync(join(outDir, 'index.html'))) {
  console.error(`build-seo: ${outDir}/index.html not found. Run the Angular build first.`);
  process.exit(1);
}

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const url = (path) => SITE.origin + path;
const guidePath = (g) => `/guides/${g.slug}`;
const bySlug = Object.fromEntries(GUIDES.map((g) => [g.slug, g]));

// ---- checks: catch the mistakes that quietly hurt rankings -----------------
const problems = [];
for (const p of [...HUBS, GUIDES_HUB, ...GUIDES]) {
  if (p.title.length > 65) problems.push(`${p.slug}: title is ${p.title.length} chars (keep under 65)`);
  if (p.description.length > 165) problems.push(`${p.slug}: description is ${p.description.length} chars (keep under 165)`);
  for (const r of p.related ?? []) if (!bySlug[r]) problems.push(`${p.slug}: related guide "${r}" does not exist`);
}
if (problems.length) {
  console.error('build-seo:\n  ' + problems.join('\n  '));
  process.exit(1);
}

// ---- template ---------------------------------------------------------------
const CSS = `
:root{--bg:#0b0d12;--fg:#e9ebf0;--muted:#a3a9b7;--line:#232838;--card:#131722;--link:#8fb4ff;--accent:#0e52ff}
@media (prefers-color-scheme:light){:root{--bg:#fff;--fg:#14161c;--muted:#5b6170;--line:#e4e6ec;--card:#f6f7fa;--link:#0b47d9}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.65 Roboto,"Helvetica Neue",Arial,sans-serif}
a{color:var(--link)}
.wrap{max-width:760px;margin:0 auto;padding:0 20px}
header{border-bottom:1px solid var(--line)}
header .wrap{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:60px;flex-wrap:wrap}
.brand{color:var(--fg);font-weight:500;font-size:1.15rem;text-decoration:none}
header nav a{margin-left:16px;font-size:.95rem;text-decoration:none}
header nav a.cta{background:var(--accent);color:#fff;padding:7px 14px;border-radius:999px}
.crumbs{font-size:.85rem;color:var(--muted);margin:24px 0 0}
.crumbs a{color:var(--muted)}
h1{font-size:2.1rem;line-height:1.2;margin:12px 0 16px;font-weight:500}
h2{font-size:1.4rem;margin:40px 0 12px;font-weight:500}
.lede{font-size:1.1rem;color:var(--muted)}
ol,ul{padding-left:1.3em}li{margin:.35em 0}
.faq dt{font-weight:500;margin-top:16px}.faq dd{margin:4px 0 0}
.cards{list-style:none;padding:0;display:grid;gap:12px}
.cards a{display:block;padding:16px;border:1px solid var(--line);border-radius:12px;background:var(--card);text-decoration:none;color:var(--fg)}
.cards span{display:block;color:var(--muted);font-size:.92rem;margin-top:4px}
.box{margin:48px 0;padding:24px;border-radius:14px;background:var(--card);border:1px solid var(--line)}
.box p{margin:0 0 12px}
footer{border-top:1px solid var(--line);margin-top:64px;padding:32px 0;font-size:.9rem;color:var(--muted)}
footer ul{list-style:none;padding:0;columns:2;column-gap:24px}
@media (max-width:560px){h1{font-size:1.7rem}header nav a{margin:0 12px 0 0}footer ul{columns:1}}
`;

function breadcrumbs(trail) {
  const html = trail
    .map((c, i) => (i === trail.length - 1 ? esc(c.name) : `<a href="${c.path}">${esc(c.name)}</a>`))
    .join(' › ');
  const ld = {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: url(c.path) })),
  };
  return { html: `<p class="crumbs">${html}</p>`, ld };
}

function faqHtml(faq) {
  if (!faq?.length) return { html: '', ld: null };
  const html = `<h2>Questions</h2><dl class="faq">${faq
    .map((f) => `<dt>${esc(f.q)}</dt><dd>${esc(f.a)}</dd>`)
    .join('')}</dl>`;
  const ld = {
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
  return { html, ld };
}

function sectionsHtml(sections = []) {
  return sections
    .map((s) => {
      const steps = s.steps ? `<ol>${s.steps.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>` : '';
      return `<h2>${esc(s.h2)}</h2>${s.body ?? ''}${steps}`;
    })
    .join('\n');
}

const guideCards = (guides) =>
  `<ul class="cards">${guides
    .map((g) => `<li><a href="${guidePath(g)}">${esc(g.h1)}<span>${esc(g.description)}</span></a></li>`)
    .join('')}</ul>`;

const CTA = `<div class="box">
<p><strong>Try skriin free.</strong> Watch at skriin.com in any browser, or go live from your iPhone with the free skriin ai tv app. When you want it on your TV, get the box.</p>
<p><a href="/">Watch now on skriin.com</a> · <a href="${SITE.store}">Get the skriin ai tv box</a></p>
</div>`;

function page({ path, title, description, body, ld, noindex = false }) {
  const canonical = url(path);
  const graph = { '@context': 'https://schema.org', '@graph': ld.filter(Boolean) };
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="${noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large'}">
${noindex ? '' : `<link rel="canonical" href="${canonical}">`}
<meta property="og:site_name" content="${esc(SITE.name)}">
<meta property="og:type" content="${path.startsWith('/guides/') ? 'article' : 'website'}">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${SITE.ogImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="628">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@skriintv">
<link rel="icon" type="image/svg+xml" href="/assets/brand/favicon.svg">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="/assets/brand/apple-touch-icon.png">
<meta name="theme-color" content="#4F46E5">
<style>${CSS.replace(/\n/g, '')}</style>
<script type="application/ld+json">${JSON.stringify(graph).replace(/</g, '\\u003c')}</script>
</head>
<body>
<header><div class="wrap">
<a class="brand" href="/features">skriin ai tv</a>
<nav aria-label="Main"><a href="/features">How it works</a><a href="/guides">Guides</a><a href="/">Watch</a><a class="cta" href="${SITE.store}">Get the box</a></nav>
</div></header>
<main class="wrap">
${body}
</main>
<footer><div class="wrap">
<p><strong>Guides</strong></p>
<ul>${GUIDES.map((g) => `<li><a href="${guidePath(g)}">${esc(g.h1)}</a></li>`).join('')}</ul>
<p><a href="/features">How skriin works</a> · <a href="/">Watch on skriin.com</a> · <a href="${SITE.store}">Shop at skriin.tv</a></p>
<p>Questions? <a href="mailto:${SITE.email}">${SITE.email}</a> · ${esc(SITE.phone)}</p>
<p><a href="${SITE.x}">X (Twitter)</a> · <a href="${SITE.privacy}">Privacy</a> · <a href="${SITE.terms}">Terms</a></p>
</div></footer>
</body>
</html>
`;
}

const ORG = { '@id': `${SITE.origin}/#organization` };
const webPage = (p, path, type = 'WebPage') => ({
  '@type': type,
  '@id': url(path),
  url: url(path),
  name: p.title,
  headline: type === 'Article' ? p.h1 : undefined,
  description: p.description,
  inLanguage: 'en',
  isPartOf: { '@id': `${SITE.origin}/#website` },
  publisher: ORG,
  author: type === 'Article' ? ORG : undefined,
  image: SITE.ogImage,
  dateModified: p.updated,
});

// ---- render -----------------------------------------------------------------
const outputs = []; // { path, html, updated }

for (const hub of HUBS) {
  const path = `/${hub.slug}`;
  const crumbs = breadcrumbs([{ name: 'skriin', path: '/' }, { name: hub.h1, path }]);
  const faq = faqHtml(hub.faq);
  const body = `${crumbs.html}<h1>${esc(hub.h1)}</h1><p class="lede">${esc(hub.lede)}</p>
${sectionsHtml(hub.sections)}
<h2>Guides</h2>${guideCards(GUIDES.slice(0, 4))}<p><a href="/guides">All guides</a></p>
${faq.html}${CTA}`;
  outputs.push({ path, updated: hub.updated, html: page({ path, title: hub.title, description: hub.description, body, ld: [webPage(hub, path), crumbs.ld, faq.ld] }) });
}

{
  const hub = GUIDES_HUB;
  const path = `/${hub.slug}`;
  const crumbs = breadcrumbs([{ name: 'skriin', path: '/' }, { name: hub.h1, path }]);
  const list = {
    '@type': 'ItemList',
    itemListElement: GUIDES.map((g, i) => ({ '@type': 'ListItem', position: i + 1, url: url(guidePath(g)), name: g.h1 })),
  };
  const body = `${crumbs.html}<h1>${esc(hub.h1)}</h1><p class="lede">${esc(hub.lede)}</p>${guideCards(GUIDES)}${CTA}`;
  outputs.push({ path, updated: hub.updated, html: page({ path, title: hub.title, description: hub.description, body, ld: [webPage(hub, path, 'CollectionPage'), crumbs.ld, list] }) });
}

for (const g of GUIDES) {
  const path = guidePath(g);
  const crumbs = breadcrumbs([{ name: 'skriin', path: '/' }, { name: 'Guides', path: '/guides' }, { name: g.h1, path }]);
  const faq = faqHtml(g.faq);
  const related = (g.related ?? []).map((s) => bySlug[s]);
  const body = `${crumbs.html}<h1>${esc(g.h1)}</h1><p class="lede">${esc(g.lede)}</p>
${sectionsHtml(g.sections)}
${faq.html}
${related.length ? `<h2>Related guides</h2>${guideCards(related)}` : ''}
${CTA}`;
  outputs.push({ path, updated: g.updated, html: page({ path, title: g.title, description: g.description, body, ld: [webPage(g, path, 'Article'), crumbs.ld, faq.ld] }) });
}

for (const o of outputs) {
  const file = join(outDir, o.path, 'index.html');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, o.html);
}

// 404 page, served by nginx with a real 404 status for unknown URLs.
writeFileSync(
  join(outDir, '404.html'),
  page({
    path: '/404',
    noindex: true,
    title: 'Page not found | skriin ai tv',
    description: "This page doesn't exist.",
    body: `<h1>Page not found</h1><p class="lede">That page doesn't exist, or it moved.</p>
<p><a href="/">Watch on skriin.com</a> · <a href="/features">How skriin works</a> · <a href="/guides">Guides</a></p>`,
    ld: [],
  })
);

// Sitemap: the homepage plus every static page. App screens other than "/"
// have no crawlable text, so they stay out until they do.
const today = new Date().toISOString().slice(0, 10);
const entries = [{ path: '/', updated: today }, ...outputs];
writeFileSync(
  join(outDir, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((e) => `  <url><loc>${url(e.path)}</loc><lastmod>${e.updated}</lastmod></url>`).join('\n')}
</urlset>
`
);

console.log(`build-seo: wrote ${outputs.length} pages, 404.html and sitemap.xml (${entries.length} URLs) to ${outDir}`);
