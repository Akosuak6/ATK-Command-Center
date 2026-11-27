// Keeps the app opening without signal. Registered as /sw.js?v=BUILD, so each deploy gets fresh caches.
//  - Pages: from the network when online, otherwise the last copy of the app (one page, '/').
//  - /_next/static files: their names change with every build, so a saved copy is always right.
//  - Icons, launch screens, fonts: saved the first time they load.
// Data never goes through here: it lives in IndexedDB and syncs through /api/sync.

const BUILD = new URL(self.location.href).searchParams.get('v') || 'dev';
const PAGES = `cc-pages-${BUILD}`;
const STATIC = `cc-static-${BUILD}`;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith('cc-') && name !== PAGES && name !== STATIC) await caches.delete(name);
    await self.clients.claim();
  })());
});

const isStatic = (url) => url.pathname.startsWith('/_next/static/') || /^\/(icons|splash)\//.test(url.pathname) || url.pathname === '/favicon.svg' || url.pathname === '/manifest.webmanifest';

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        // Only a real copy of the app is kept, never a redirect to the sign in page.
        if (res.ok && !res.redirected && url.pathname === '/') (await caches.open(PAGES)).put('/', res.clone());
        return res;
      } catch {
        return (await caches.match('/', { cacheName: PAGES })) || (await caches.match('/')) || new Response('Offline. Open the app once while online first.', { status: 503, headers: { 'content-type': 'text/plain' } });
      }
    })());
    return;
  }

  if (isStatic(url)) {
    event.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) (await caches.open(STATIC)).put(req, res.clone());
      return res;
    })());
  }
});
