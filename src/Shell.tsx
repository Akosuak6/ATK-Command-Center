'use client';

import { useEffect, useState } from 'react';
import App from './App';
import { Boot } from './components/Boot';
import { ToastProvider } from './components/ui';
import { db } from './lib/db';
import { startHistory } from './lib/history';
import { isFirstSync, startSync } from './lib/sync';
import { startCalendarSync } from './lib/calendars';

let booted: Promise<void> | null = null;

// Runs once per page load (React may mount twice while developing).
function boot(): Promise<void> {
  booted ??= (async () => {
    void navigator.storage?.persist?.(); // ask the browser to keep IndexedDB when storage is tight
    registerServiceWorker();
    await db.open();
    // While developing, the browser console can reach the database and sync (never in a deploy).
    if (process.env.NODE_ENV === 'development') {
      const sync = await import('./lib/sync');
      Object.assign(window, { __cc: { db, sync } });
    }
    await startSync();
    startHistory(); // after the first download, so today's numbers come from real data
    startCalendarSync(); // linked calendars: on open and on coming back, at most every 15 minutes
  })();
  return booted;
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
  const register = () => void navigator.serviceWorker.register(`/sw.js?v=${process.env.NEXT_PUBLIC_BUILD ?? 'dev'}`, { scope: '/' }).catch(() => {});
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

export default function Shell() {
  const [ready, setReady] = useState(false);
  const [firstTime] = useState(isFirstSync);
  useEffect(() => {
    let live = true;
    boot().catch(() => {}).finally(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, []);
  if (!ready) return <Boot message={firstTime ? 'Downloading your data' : undefined} />;
  return (
    <ToastProvider>
      <App />
    </ToastProvider>
  );
}
