import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Connect, ViteDevServer, PreviewServer } from 'vite';
import type { ServerResponse } from 'node:http';

// Seed data = src/data/seed.json, with any table in private/seed-overlay.json replacing the sample.
// private/ is never committed, so real data stays out of the public repo.
function seedPlugin() {
  const id = 'virtual:seed';
  return {
    name: 'command-center-seed',
    resolveId: (source: string) => (source === id ? '\0' + id : null),
    load(resolved: string) {
      if (resolved !== '\0' + id) return null;
      const base = JSON.parse(readFileSync('src/data/seed.json', 'utf8'));
      const overlayPath = process.env.SEED_OVERLAY || 'private/seed-overlay.json';
      if (existsSync(overlayPath)) {
        const overlay = JSON.parse(readFileSync(overlayPath, 'utf8'));
        for (const [k, v] of Object.entries(overlay)) {
          if (k === 'meta') base.meta = { ...base.meta, ...(v as object) };
          else if (!k.startsWith('_')) base[k] = v;
        }
      }
      return `export default ${JSON.stringify(base)};`;
    }
  };
}

// On the laptop, serve the functions in api/ the way Vercel does, so link previews and the feed
// work with npm run dev and npm run preview too.
type ApiRes = ServerResponse & { status: (code: number) => ApiRes; json: (body: unknown) => ApiRes; send: (body: unknown) => ApiRes };
function apiPlugin() {
  const handle = (load: (file: string) => Promise<{ default: (req: unknown, res: ApiRes) => unknown }>): Connect.NextHandleFunction =>
    async (req, res, next) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const name = /^\/api\/([a-z]+)\/?$/.exec(url.pathname)?.[1];
      const file = name ? resolve('api', `${name}.js`) : '';
      if (!file || !existsSync(file)) return next();
      const r = res as ApiRes;
      r.status = (code) => { r.statusCode = code; return r; };
      r.json = (body) => { r.setHeader('Content-Type', 'application/json'); r.end(JSON.stringify(body)); return r; };
      r.send = (body) => { r.end(body as Buffer); return r; };
      try {
        const mod = await load(file);
        await mod.default(Object.assign(req, { query: Object.fromEntries(url.searchParams) }), r);
      } catch (e) {
        if (!r.headersSent) r.status(500).json({ error: String((e as Error)?.message ?? e) });
      }
    };
  return {
    name: 'command-center-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(handle((f) => server.ssrLoadModule(f) as never));
    },
    configurePreviewServer(server: PreviewServer) {
      server.middlewares.use(handle((f) => import(/* @vite-ignore */ pathToFileURL(f).href)));
    }
  };
}

export default defineConfig({
  plugins: [
    seedPlugin(),
    apiPlugin(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'splash/*.png', 'favicon.svg'],
      manifest: {
        name: "Akosua's command center",
        short_name: 'Command center',
        description: 'Day, money, health, social life and learning, saved on this phone.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#D8CFC1',
        theme_color: '#0F1A2E',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Feed images ask for no referrer, which keeps them in their own small cache so a busy
            // feed never pushes out the photos you pinned.
            urlPattern: ({ request, sameOrigin }) => request.destination === 'image' && !sameOrigin && request.referrerPolicy === 'no-referrer',
            handler: 'CacheFirst',
            options: {
              cacheName: 'feed-images',
              expiration: { maxEntries: 250, maxAgeSeconds: 60 * 60 * 24 * 14 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            // Photos linked from other sites (when they could not be copied in) stay viewable offline.
            urlPattern: ({ request, sameOrigin }) => request.destination === 'image' && !sameOrigin && request.referrerPolicy !== 'no-referrer',
            handler: 'CacheFirst',
            options: {
              cacheName: 'linked-images',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css' }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ]
});
