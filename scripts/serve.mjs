#!/usr/bin/env node
// Production web server for skriin.com (Firebase App Hosting runs it; see
// apphosting.yaml). No dependencies, so it needs nothing from node_modules.
//
// It does what the default static hosting can't, and mirrors docker/nginx.conf:
//   - real 404s for unknown URLs (no soft-404s: only Angular routes get the app)
//   - 301s: trailing slash -> none, and common paths (/about, /privacy, ...)
//   - static SEO pages (/features, /guides/...) from <dir>/<path>/index.html
//   - gzip, long cache for hashed assets, no-cache for HTML, HSTS
//
// Usage: node scripts/serve.mjs [browserDir]   (PORT env, default 8080)

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGzip } from 'node:zlib';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)), process.argv[2] ?? 'dist/skriin/browser');
const port = Number(process.env.PORT) || 8080;

// Paths the Angular router handles (first segment). Keep in sync with
// src/app/app.routes.ts and docker/nginx.conf.
const APP_ROUTES = /^\/(?:watch|profile|yap|podcast|stream|listen|read|call|login|play)(?:\/.*)?$/;

const REDIRECTS = {
  '/about': '/features',
  '/how-it-works': '/features',
  '/live': '/stream',
  '/blog': '/guides',
  '/privacy': 'https://skriin.tv/policies/privacy-policy',
  '/privacy-policy': 'https://skriin.tv/policies/privacy-policy',
  '/terms': 'https://skriin.tv/policies/terms-of-service',
  '/terms-of-service': 'https://skriin.tv/policies/terms-of-service',
  '/shop': 'https://skriin.tv/',
  '/store': 'https://skriin.tv/',
  '/buy': 'https://skriin.tv/',
};

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.wasm': 'application/wasm',
};
const COMPRESSIBLE = /^(text\/|application\/(json|xml|manifest\+json|javascript)|image\/svg)/;
const HASHED = /-[A-Z0-9]{8}\.(js|css)$/;

/** Absolute path of a regular file under root, or null. */
function file(urlPath) {
  const p = normalize(join(root, urlPath));
  if (p !== root && !p.startsWith(root + sep)) return null; // path traversal
  try {
    return statSync(p).isFile() ? p : null;
  } catch {
    return null;
  }
}

function send(req, res, status, path, cache) {
  const type = TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', cache);
  res.setHeader('Vary', 'Accept-Encoding');
  const gzip = COMPRESSIBLE.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');
  if (gzip) res.setHeader('Content-Encoding', 'gzip');
  if (req.method === 'HEAD') return res.end();
  const stream = createReadStream(path);
  stream.on('error', () => res.destroy());
  (gzip ? stream.pipe(createGzip()) : stream).pipe(res);
}

function redirect(res, location) {
  res.statusCode = 301;
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.end();
}

const server = createServer((req, res) => {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    return res.end();
  }

  const url = new URL(req.url ?? '/', 'http://x');
  let path;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    path = '/__bad__';
  }
  const query = url.search;

  // One URL per page.
  if (path.length > 1 && path.endsWith('/')) return redirect(res, path.replace(/\/+$/, '') + query);
  const target = REDIRECTS[path.toLowerCase()];
  if (target) return redirect(res, target);

  const index = join(root, 'index.html');
  if (path === '/' || path === '/index.html') return send(req, res, 200, index, 'no-cache');

  // runtime-config.js and ngsw files must never be cached by the CDN/browser.
  const real = file(path);
  if (real) {
    const cache = HASHED.test(path)
      ? 'public, max-age=31536000, immutable'
      : /\.(html|json|webmanifest|txt|xml)$/.test(path) || path === '/runtime-config.js' || path.startsWith('/ngsw')
        ? 'no-cache'
        : 'public, max-age=86400';
    return send(req, res, 200, real, cache);
  }

  const page = file(join(path, 'index.html'));
  if (page) return send(req, res, 200, page, 'public, max-age=300');

  if (APP_ROUTES.test(path)) return send(req, res, 200, index, 'no-cache');

  const notFound = file('/404.html');
  if (notFound) return send(req, res, 404, notFound, 'no-cache');
  res.statusCode = 404;
  res.end('Not found');
});

server.listen(port, () => console.log(`skriin web: serving ${root} on :${port}`));
