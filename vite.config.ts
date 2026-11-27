import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { existsSync, readFileSync } from 'node:fs';

// Seed data = src/data/seed.json, with any table in private/seed-overlay.json replacing the sample.
// private/ is never committed, so real data stays out of the public repo.
function seedPlugin() {
  const id = 'virtual:seed';
  return {
    name: 'command-center-seed',
    resolveId: (source: string) => (source === id ? '\0' + id : null),
    // Editing the overlay during `npm run dev` reloads the page with the new seed.
    configureServer(server: ViteDevServer) {
      const overlayPath = process.env.SEED_OVERLAY || 'private/seed-overlay.json';
      server.watcher.add(overlayPath);
      server.watcher.on('change', (file) => {
        if (!file.replace(/\\/g, '/').endsWith(overlayPath.replace(/\\/g, '/'))) return;
        const mod = server.moduleGraph.getModuleById('\0' + id);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      });
    },
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

// Runs the functions in api/ during `npm run dev`, the way Vercel runs them once deployed.
function apiPlugin(): Plugin {
  return {
    name: 'command-center-api',
    apply: 'serve',
    configureServer(server) {
      // Keys kept in .env.local (never committed) reach the api functions, as they would on a host.
      const env = loadEnv('development', process.cwd(), '');
      if (env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const m = /^\/api\/([a-z]+)$/.exec(url.pathname);
        if (!m || !existsSync(`api/${m[1]}.js`)) return next();
        try {
          const mod = await server.ssrLoadModule(`/api/${m[1]}.js`);
          const r = res as typeof res & Record<string, unknown>;
          r.status = (code: number) => { res.statusCode = code; return r; };
          r.json = (body: unknown) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); return r; };
          r.send = (body: unknown) => { res.end(body as string | Buffer); return r; };
          (req as typeof req & { query: Record<string, string> }).query = Object.fromEntries(url.searchParams);
          await mod.default(req, r);
        } catch (e) {
          server.config.logger.error(`api/${m[1]}: ${(e as Error).message}`);
          if (!res.headersSent) { res.statusCode = 500; res.end('function failed'); }
        }
      });
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
        background_color: '#070B14',
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
            // Photos linked from other sites (when they could not be copied in) stay viewable offline.
            urlPattern: ({ request, sameOrigin }) => request.destination === 'image' && !sameOrigin,
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
