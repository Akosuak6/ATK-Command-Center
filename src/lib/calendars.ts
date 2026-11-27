import type { Area, CalendarEvent } from './types';
import { syncNow } from './sync';

// The device side of linked calendars. The server keeps the secret addresses and writes the events into
// the normal sync; a device only asks it to check the calendars (on open and when the app comes back to
// the front, at most every 15 minutes) and then pulls what changed.

export interface LinkedCalendar { id: string; label: string; area: Area; lastSynced: string | null; lastTried: string | null; error: string | null; events: number }

export const CALENDAR_AREAS: Area[] = ['Work', 'Social', 'Health', 'Money', 'Learning', 'Experiences', 'Other'];
const EVERY_MS = 15 * 60_000;
const TRIED = 'ccCalendarTried';

const lastTried = () => { try { return Number(localStorage.getItem(TRIED)) || 0; } catch { return 0; } };
const markTried = () => { try { localStorage.setItem(TRIED, String(Date.now())); } catch { /* checked again next time */ } };

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) }, cache: 'no-store' });
  const body = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(body.error || `The calendars answered ${r.status}`);
  return body;
}

export const listCalendars = () => call<{ calendars: LinkedCalendar[] }>('/api/calendars').then((b) => b.calendars);

export async function addCalendar(input: { label: string; url: string; area: Area }) {
  const b = await call<{ added: { id: string; events: number }; calendars: LinkedCalendar[] }>('/api/calendars', { method: 'POST', body: JSON.stringify(input) });
  void syncNow();
  return b;
}

export async function removeCalendar(id: string) {
  const b = await call<{ calendars: LinkedCalendar[] }>(`/api/calendars?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  void syncNow();
  return b.calendars;
}

let running: Promise<LinkedCalendar[] | null> | null = null;

// Ask the server to check the calendars. Without force, at most every 15 minutes per device (the server
// also skips calendars another device checked in that time).
export function syncCalendars(force = false): Promise<LinkedCalendar[] | null> {
  // A forced check waits for one already running (which may have skipped every calendar), then runs its own.
  if (running) return force ? running.then(() => syncCalendars(true)) : running;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve(null);
  if (!force && Date.now() - lastTried() < EVERY_MS) return Promise.resolve(null);
  markTried();
  running = (async () => {
    try {
      const b = await call<{ synced: number; calendars: LinkedCalendar[] }>('/api/calendars/sync', { method: 'POST', body: JSON.stringify({ force }) });
      if (b.synced) await syncNow();
      return b.calendars;
    } catch (e) {
      if (force) throw e;
      return null; // signed out, offline or no database: the next open tries again
    }
  })().finally(() => { running = null; });
  return running;
}

let started = false;
export function startCalendarSync() {
  if (started) return;
  started = true;
  void syncCalendars();
  const again = () => { if (document.visibilityState === 'visible') void syncCalendars(); };
  document.addEventListener('visibilitychange', again);
  window.addEventListener('focus', again);
  window.addEventListener('online', again);
}

// An event is on a day when it starts that day, or spans it (a trip, a conference).
export const onDay = (e: CalendarEvent, iso: string) => e.date === iso || (!!e.end && e.date < iso && iso <= e.end);

// Overlaps the days from start to end, inclusive.
export const inDays = (e: CalendarEvent, start: string, end: string) => e.date <= end && (e.end ?? e.date) >= start;

const isTimed = (e: CalendarEvent) => /^\d/.test(e.time);

// All day events first, then by time.
export const byTime = (a: CalendarEvent, b: CalendarEvent) =>
  Number(isTimed(a)) - Number(isTimed(b)) || a.time.localeCompare(b.time) || a.title.localeCompare(b.title);
