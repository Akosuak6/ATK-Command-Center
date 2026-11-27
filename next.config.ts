import type { NextConfig } from 'next';

// One id per deploy. The service worker names its caches with it, so a new deploy clears old files.
const build = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 10) || String(Date.now());

const config: NextConfig = {
  env: { NEXT_PUBLIC_BUILD: build },
  // PGlite is the stand-in database for `npm run dev` without DATABASE_URL. Never part of a deploy.
  serverExternalPackages: ['@electric-sql/pglite'],
  outputFileTracingExcludes: { '*': ['./node_modules/@electric-sql/**/*', './private/**/*'] },
  // 127.0.0.1 is the second "device" when testing sync on the laptop; the IP is the phone on home Wi-Fi.
  allowedDevOrigins: ['localhost', '127.0.0.1', '192.168.1.136'],
  async headers() {
    return [
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }, { key: 'Service-Worker-Allowed', value: '/' }] }
    ];
  }
};

export default config;
