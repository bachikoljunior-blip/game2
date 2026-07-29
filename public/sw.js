/**
 * sw.js — offline shell for KAGEROU.
 *
 * The whole game is three hashed JS chunks and an HTML file: every texture, mesh,
 * animation and sound is synthesised at boot, so there is nothing else to cache and
 * "installed" genuinely means playable on a plane. That is the payoff for the
 * no-external-assets rule, and it only works if the service worker is here to collect it.
 *
 * Strategy is stale-while-revalidate against a versioned cache. Vite hashes every asset
 * filename, so a new build produces new URLs and the old cache is dropped wholesale on
 * activate rather than being invalidated entry by entry.
 */

const VERSION = 'kagerou-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      // Individual failures must not abort the install — a missing optional file
      // should degrade to a network fetch, not leave the game uninstallable.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req)
        .then((res) => {
          // Only cache real, complete same-origin responses; an opaque or partial
          // response cached here would be served forever and break the next launch.
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || network;
    }),
  );
});
