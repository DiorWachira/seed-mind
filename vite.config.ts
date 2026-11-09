import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Emits sw.js: a small offline service worker that precaches every built file.
 * Hashed assets are served cache-first; the page itself is network-first, so a new
 * deploy shows up on the next visit and the cached copy is used offline.
 */
function serviceWorker(): Plugin {
  return {
    name: 'seedmind-sw',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const extra = ['favicon.svg', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
      const list = ['./', ...files, ...extra].map((f) => (f === './' ? f : `./${f}`));
      const version = createHash('sha256').update(list.join('|')).digest('hex').slice(0, 12);
      const source = `/* Seed Mind service worker · generated at build */
const CACHE = 'seedmind-${version}';
const PRECACHE = ${JSON.stringify(list)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('seedmind-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put('./', copy)); return r; }).catch(() => caches.match('./')));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return r;
  })));
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  // GitHub Pages serves the site under /<repo>/; set BASE_PATH there (see .github/workflows/deploy.yml).
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), serviceWorker()],
  worker: { format: 'es' },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
