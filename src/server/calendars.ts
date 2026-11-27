import { randomBytes } from 'node:crypto';
import type { Area, CalendarEvent } from '../lib/types';
import { CalendarFileError, calendarPrefix, parseCalendar } from './ics';
import { pushChanges, type Change, type Query } from './store';
import { safeUrl } from './handlers/_safe.js';

// Linked calendars: each is a private iCal address (Google Calendar's "Secret address in iCal format").
// A sync fetches the file on the server, turns it into calendar rows and writes them into cc_rows like a
// device would, so every device downloads them with its normal sync. Only rows that changed are written,
// and rows the file no longer has are marked deleted.

export const AREAS: Area[] = ['Work', 'Social', 'Health', 'Money', 'Learning', 'Experiences', 'Other'];
export const RESYNC_MINUTES = 15;
const DEVICE = 'calendar-sync'; // the "device" these rows come from (never a real device id)
const FETCH_MS = 20_000;
const MAX_BYTES = 25_000_000; // years of a busy calendar is a few MB
const WRITE_CHUNK = 500;

export interface CalendarInfo {
  id: string;
  label: string;
  area: Area;
  lastSynced: string | null;
  lastTried: string | null;
  error: string | null;
  events: number;
}

export class CalendarError extends Error {}

const iso = (v: unknown) => (v == null ? null : new Date(v as string).toISOString());

function info(r: Record<string, unknown>): CalendarInfo {
  return {
    id: String(r.id),
    label: String(r.label),
    area: (AREAS.includes(r.area as Area) ? r.area : 'Other') as Area,
    lastSynced: iso(r.synced_at),
    lastTried: iso(r.tried_at),
    error: r.error ? String(r.error) : null,
    events: Number(r.events ?? 0)
  };
}

export async function listCalendars(q: Query): Promise<CalendarInfo[]> {
  return (await q('select id, label, area, tried_at, synced_at, error, events from cc_calendars order by added, id')).map(info);
}

// Google shows webcal:// in some places; it is the same address over https.
export function calendarUrl(raw: unknown): URL | null {
  const s = String(raw ?? '').trim().replace(/^webcals?:\/\//i, 'https://');
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  // While developing, a test calendar served from this computer is allowed.
  if (process.env.NODE_ENV === 'development') return /^https?:$/.test(u.protocol) ? u : null;
  if (u.protocol !== 'https:') return null;
  return safeUrl(u.href) as URL | null;
}

async function fetchCalendar(start: URL): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_MS);
  try {
    let url = start;
    for (let hop = 0; hop < 5; hop++) {
      let r: Response;
      try {
        r = await fetch(url, { redirect: 'manual', signal: ctrl.signal, cache: 'no-store', headers: { accept: 'text/calendar, text/plain;q=0.9, */*;q=0.1' } });
      } catch {
        throw new CalendarError(ctrl.signal.aborted ? 'The calendar took too long to answer' : 'The calendar could not be reached');
      }
      const next = r.headers.get('location');
      if (r.status >= 300 && r.status < 400 && next) {
        // Follow redirects by hand so each stop is checked like the address itself.
        const u = calendarUrl(new URL(next, url).href);
        if (!u) throw new CalendarError('The address sent the app somewhere it cannot follow');
        url = u;
        continue;
      }
      if (r.status === 404 || r.status === 410) throw new CalendarError('Google no longer accepts this address. If you reset it, add the calendar again with the new one.');
      if (r.status === 401 || r.status === 403) throw new CalendarError('This address is not open to the app. Use the secret address in iCal format, not the public one.');
      if (!r.ok || !r.body) throw new CalendarError(`The calendar answered with an error (${r.status})`);
      const reader = r.body.getReader();
      const parts: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) { await reader.cancel(); throw new CalendarError('The calendar file is too large to read'); }
        parts.push(value);
      }
      return Buffer.concat(parts).toString('utf8');
    }
    throw new CalendarError('The address redirected too many times');
  } catch (e) {
    if (e instanceof CalendarError) throw e;
    throw new CalendarError(ctrl.signal.aborted ? 'The calendar took too long to answer' : 'The calendar could not be read');
  } finally {
    clearTimeout(timer);
  }
}

// Fetch and read one calendar without saving anything (used to check an address before adding it).
export async function readCalendar(url: URL, cal: { id: string; area: Area }): Promise<CalendarEvent[]> {
  const text = await fetchCalendar(url);
  try {
    return parseCalendar(text, cal);
  } catch (e) {
    if (e instanceof CalendarFileError) throw new CalendarError(e.message);
    throw new CalendarError('The calendar file could not be read');
  }
}

// Keys in a fixed order, so a row read back from jsonb compares equal to the same row built again.
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

async function write(q: Query, changes: Change[]) {
  for (let i = 0; i < changes.length; i += WRITE_CHUNK) await pushChanges(q, DEVICE, changes.slice(i, i + WRITE_CHUNK));
}

// Make this calendar's rows in cc_rows match `rows`, touching only what changed.
async function replaceEvents(q: Query, calendarId: string, rows: CalendarEvent[]) {
  const prefix = calendarPrefix(calendarId);
  const existing = await q(`select id, data from cc_rows where tbl = 'calendar' and starts_with(id, $1) and not deleted`, [prefix]);
  const before = new Map(existing.map((r) => [String(r.id), stable(r.data)]));
  const ts = Date.now();
  const changes: Change[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    seen.add(row.id);
    if (before.get(row.id) !== stable(row)) changes.push({ t: 'calendar', id: row.id, ts, data: row });
  }
  for (const id of before.keys()) if (!seen.has(id)) changes.push({ t: 'calendar', id, ts, data: null });
  await write(q, changes);
  return { written: changes.filter((c) => c.data).length, removed: changes.filter((c) => !c.data).length };
}

// The "Calendar synced" line in the sidebar reads this, on every device.
async function markSynced(q: Query, at: string | null) {
  await write(q, [{ t: 'meta', id: 'calendarSyncedAt', ts: Date.now(), data: { key: 'calendarSyncedAt', value: at } }]);
}

export async function addCalendar(q: Query, input: { label?: unknown; url?: unknown; area?: unknown }) {
  const label = String(input.label ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!label) throw new CalendarError('Give the calendar a name, like Personal or Work');
  const area = AREAS.includes(input.area as Area) ? (input.area as Area) : null;
  if (!area) throw new CalendarError('Pick the area its events belong to');
  const url = calendarUrl(input.url);
  if (!url) throw new CalendarError('Paste the full secret address, starting with https://');
  const dupe = await q('select label from cc_calendars where url = $1', [url.href]);
  if (dupe.length) throw new CalendarError(`That address is already linked as ${dupe[0].label}`);
  const id = randomBytes(4).toString('hex');
  // Read it once first, so a wrong address is turned away before anything is saved.
  const rows = await readCalendar(url, { id, area });
  await q(
    `insert into cc_calendars (id, label, url, area, tried_at, synced_at, events) values ($1, $2, $3, $4, now(), now(), $5)`,
    [id, label, url.href, area, rows.length]
  );
  await replaceEvents(q, id, rows);
  await markSynced(q, new Date().toISOString());
  return { id, events: rows.length };
}

export async function removeCalendar(q: Query, id: string) {
  const found = await q('delete from cc_calendars where id = $1 returning id', [id]);
  if (!found.length) return false;
  await replaceEvents(q, id, []);
  const left = await q('select max(synced_at) as at from cc_calendars');
  await markSynced(q, iso(left[0]?.at));
  return true;
}

// Sync the calendars not tried in the last 15 minutes (all of them when forced).
// Claiming them first means two devices opening at once do not both fetch.
export async function syncCalendars(q: Query, force = false) {
  const before = new Date(Date.now() - RESYNC_MINUTES * 60_000).toISOString();
  const claimed = await q(
    `update cc_calendars set tried_at = now()
     where $1::boolean or tried_at is null or tried_at < $2::timestamptz
     returning id, url, area`,
    [force, before]
  );
  let synced = 0;
  let failed = 0;
  for (const c of claimed) {
    const id = String(c.id);
    const url = calendarUrl(c.url);
    try {
      if (!url) throw new CalendarError('This address can no longer be used. Remove it and add it again.');
      const rows = await readCalendar(url, { id, area: (AREAS.includes(c.area as Area) ? c.area : 'Other') as Area });
      await replaceEvents(q, id, rows);
      await q('update cc_calendars set synced_at = now(), error = null, events = $2 where id = $1', [id, rows.length]);
      synced++;
    } catch (e) {
      // The events already synced stay until the calendar answers again.
      const message = e instanceof CalendarError ? e.message : 'The calendar could not be synced';
      await q('update cc_calendars set error = $2 where id = $1', [id, message]);
      failed++;
    }
  }
  if (synced) await markSynced(q, new Date().toISOString());
  return { synced, failed, checked: claimed.length };
}
