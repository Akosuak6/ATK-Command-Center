import { useSyncExternalStore } from 'react';
import type { Table, Transaction } from 'dexie';
import { db } from './db';

// Keeps this device's copy (IndexedDB, through Dexie) in step with Neon, through /api/sync.
//
// Every write on this device marks its table and key as changed, in localStorage, so the list
// survives closing the app. A sync sends the current version of each changed row (a missing row
// means it was deleted), then downloads what other devices changed since the last download.
// When the same row changed in two places, the most recent edit wins.

type State = 'starting' | 'syncing' | 'synced' | 'offline' | 'signed-out' | 'off' | 'error';
export interface SyncStatus { state: State; lastSynced: string | null; pending: number; message: string }
interface Change { t: string; id: string; ts: number; data: unknown }
interface Remote { t: string; id: string; ts: number; deleted: boolean; data: unknown; mine: boolean }

const DIRTY = 'ccSyncDirty';
const CURSOR = 'ccSyncCursor';
const LAST = 'ccSyncLast';
const DEVICE = 'ccDeviceId';
const SKIPPED = 'ccSyncSkipped';
const SEP = '\u0001';
const CHUNK_BYTES = 3_000_000; // Vercel accepts up to 4.5MB per request

const read = <T,>(k: string, fallback: T): T => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked: kept in memory */ } };

let dirty: Record<string, number> = read(DIRTY, {});
let status: SyncStatus = { state: 'starting', lastSynced: read<string | null>(LAST, null), pending: Object.keys(dirty).length, message: '' };
const listeners = new Set<() => void>();

function setStatus(next: Partial<SyncStatus>) {
  status = { ...status, ...next, pending: Object.keys(dirty).length };
  listeners.forEach((l) => l());
}
export const getSyncStatus = () => status;
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, getSyncStatus, getSyncStatus);
}

export function deviceId(): string {
  let id = read<string>(DEVICE, '');
  if (!id) { id = crypto.randomUUID(); write(DEVICE, id); }
  return id;
}

// Writes that came from Neon run in a transaction marked like this, so they are not sent back.
const REMOTE = '__ccRemote';
const isRemote = (tx: Transaction | undefined) => !!tx && (tx as unknown as Record<string, unknown>)[REMOTE] === true;

function mark(table: string, key: unknown) {
  if (key === undefined || key === null) return;
  dirty[table + SEP + String(key)] = Date.now();
  write(DIRTY, dirty);
  setStatus({});
  schedule(1500);
}

let hooked = false;
function installHooks() {
  if (hooked) return;
  hooked = true;
  for (const table of db.tables) {
    const name = table.name;
    const keyPath = table.schema.primKey.keyPath as string;
    table.hook('creating', function (key, obj, tx) { if (!isRemote(tx)) mark(name, key ?? (obj as Record<string, unknown>)[keyPath]); });
    table.hook('updating', function (_mods, key, _obj, tx) { if (!isRemote(tx)) mark(name, key); });
    table.hook('deleting', function (key, _obj, tx) { if (!isRemote(tx)) mark(name, key); });
  }
}

class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) }, cache: 'no-store' });
  const body = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new HttpError(r.status, body.error || `sync answered ${r.status}`);
  return body;
}

const tableByName = (name: string): Table | undefined => db.tables.find((t) => t.name === name);

async function push() {
  const keys = Object.keys(dirty);
  if (!keys.length) return;
  // Read the current rows, one bulk read per table.
  const byTable = new Map<string, string[]>();
  for (const k of keys) {
    const [t, id] = k.split(SEP);
    if (!tableByName(t)) { delete dirty[k]; continue; }
    byTable.set(t, [...(byTable.get(t) ?? []), id]);
  }
  const changes: Change[] = [];
  for (const [t, ids] of byTable) {
    const rows = await tableByName(t)!.bulkGet(ids);
    ids.forEach((id, i) => changes.push({ t, id, ts: dirty[t + SEP + id], data: rows[i] ?? null }));
  }
  let chunk: Change[] = [];
  let size = 0;
  const send = async () => {
    if (!chunk.length) return;
    await api('/api/sync', { method: 'POST', body: JSON.stringify({ device: deviceId(), changes: chunk }) });
    // Keep anything edited again while this was on its way.
    for (const c of chunk) if (dirty[c.t + SEP + c.id] === c.ts) delete dirty[c.t + SEP + c.id];
    write(DIRTY, dirty);
    setStatus({});
    chunk = [];
    size = 0;
  };
  for (const c of changes) {
    const n = JSON.stringify(c).length;
    if (size + n > CHUNK_BYTES) await send();
    chunk.push(c);
    size += n;
  }
  await send();
}

async function pull() {
  let after = read<number>(CURSOR, 0);
  const me = deviceId();
  for (;;) {
    const page = await api<{ rows: Remote[]; next: number; more: boolean }>(`/api/sync?after=${after}&device=${encodeURIComponent(me)}`);
    const rows = page.rows.filter((r) => !r.mine);
    if (rows.length) await apply(rows);
    after = page.next;
    write(CURSOR, after);
    if (!page.more) break;
  }
}

async function apply(rows: Remote[]) {
  const known = rows.filter((r) => tableByName(r.t));
  // Rows for a store this version of the app does not have yet: download them again once it does.
  const unknown = [...new Set(rows.filter((r) => !tableByName(r.t)).map((r) => r.t))];
  if (unknown.length) write(SKIPPED, [...new Set([...read<string[]>(SKIPPED, []), ...unknown])]);
  if (!known.length) return;
  const tables = [...new Set(known.map((r) => r.t))].map((t) => tableByName(t)!);
  await db.transaction('rw', tables, async (tx) => {
    (tx as unknown as Record<string, unknown>)[REMOTE] = true;
    for (const r of known) {
      const k = r.t + SEP + r.id;
      if (dirty[k] && dirty[k] > r.ts) continue; // this device's edit is newer and goes up next
      const table = tableByName(r.t)!;
      if (r.deleted || r.data == null) await table.delete(r.id);
      else await table.put(r.data);
      delete dirty[k];
    }
  });
  write(DIRTY, dirty);
}

let running: Promise<void> | null = null;
let again = false;

export function syncNow(): Promise<void> {
  if (running) { again = true; return running; }
  running = (async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { setStatus({ state: 'offline', message: '' }); return; }
    setStatus({ state: 'syncing' });
    try {
      await push();
      await pull();
      const now = new Date().toISOString();
      write(LAST, now);
      setStatus({ state: 'synced', lastSynced: now, message: '' });
    } catch (e) {
      const code = e instanceof HttpError ? e.status : 0;
      if (code === 401) setStatus({ state: 'signed-out', message: (e as Error).message });
      else if (code === 503) setStatus({ state: 'off', message: (e as Error).message });
      else if (code === 0) setStatus({ state: navigator.onLine ? 'error' : 'offline', message: (e as Error).message });
      else setStatus({ state: 'error', message: (e as Error).message });
    }
  })().finally(() => {
    running = null;
    if (again) { again = false; void syncNow(); }
  });
  return running;
}

let timer = 0;
function schedule(ms: number) {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void syncNow(), ms);
}

let started: Promise<void> | null = null;

// Call once at startup. Resolves when this device is ready to show data: right away when it has
// synced before, or after the first download on a new device (so nothing is saved over the
// real data while the device is still empty).
export function startSync(): Promise<void> {
  if (started) return started;
  installHooks();
  const skipped = read<string[]>(SKIPPED, []);
  if (skipped.some((t) => tableByName(t))) { write(CURSOR, 0); write(SKIPPED, []); }
  const firstTime = read<number>(CURSOR, 0) === 0 && !read<string | null>(LAST, null);
  const first = syncNow();
  const onFocus = () => { if (document.visibilityState === 'visible') schedule(300); };
  document.addEventListener('visibilitychange', onFocus);
  window.addEventListener('focus', onFocus);
  window.addEventListener('online', () => schedule(300));
  window.addEventListener('offline', () => setStatus({ state: 'offline' }));
  window.setInterval(() => { if (document.visibilityState === 'visible') void syncNow(); }, 60_000);
  // A new device waits for its first download, but never more than 30 seconds.
  started = firstTime ? Promise.race([first, new Promise<void>((r) => window.setTimeout(r, 30_000))]) : Promise.resolve();
  return started;
}

export const isFirstSync = () => read<number>(CURSOR, 0) === 0 && !read<string | null>(LAST, null);

// Erase this device's copy and download everything again from Neon.
export async function resetDevice() {
  await syncNow().catch(() => {});
  for (const k of [DIRTY, CURSOR, LAST, DEVICE, SKIPPED]) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
  await db.delete();
  location.reload();
}

export async function signOut() {
  await syncNow().catch(() => {});
  await fetch('/api/logout', { method: 'POST' }).catch(() => {});
  location.href = '/login';
}
