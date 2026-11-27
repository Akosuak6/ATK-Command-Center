import { setMeta } from './db';

// Workouts from Hevy, read through api/hevy.js.
// The API key stays in this browser only (localStorage), so it is never in a backup file or the repo.
// The last synced workouts are kept in meta so the page still shows them offline.

export interface HevySet { type?: string; weight_kg?: number | null; reps?: number | null; distance_meters?: number | null; duration_seconds?: number | null }
interface HevyExercise { title?: string; sets?: HevySet[] }
interface HevyWorkout { id: string; title?: string; start_time?: string; end_time?: string; exercises?: HevyExercise[] }
interface HevyPage { page?: number; page_count?: number; workouts?: HevyWorkout[] }

export interface Workout {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD, local time
  start: string; // ISO time
  minutes: number;
  sets: number;
  volumeKg: number;
  exercises: { title: string; sets: number; best: HevySet | null }[];
}

const KEY_STORE = 'hevyApiKey';

export function getHevyKey(): string {
  try { return localStorage.getItem(KEY_STORE) ?? ''; } catch { return ''; }
}
export function setHevyKey(key: string) {
  try {
    if (key) localStorage.setItem(KEY_STORE, key.trim());
    else localStorage.removeItem(KEY_STORE);
  } catch { /* storage blocked: the key just will not be remembered */ }
}

const localDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Heaviest working set, or the longest one for timed or distance sets.
const score = (s: HevySet) => (s.weight_kg ?? 0) * 1000 + (s.reps ?? 0) || (s.distance_meters ?? 0) || (s.duration_seconds ?? 0);

export function summarize(w: HevyWorkout): Workout {
  const exercises = (w.exercises ?? []).map((e) => {
    const sets = (e.sets ?? []).filter((s) => s.type !== 'warmup');
    const best = sets.reduce<HevySet | null>((b, s) => (!b || score(s) > score(b) ? s : b), null);
    return { title: e.title || 'Exercise', sets: sets.length, best };
  });
  const all = (w.exercises ?? []).flatMap((e) => e.sets ?? []).filter((s) => s.type !== 'warmup');
  const start = w.start_time ?? '';
  const end = w.end_time ?? '';
  const minutes = start && end ? Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000)) : 0;
  return {
    id: w.id,
    title: w.title || 'Workout',
    date: localDate(start),
    start,
    minutes,
    sets: all.length,
    volumeKg: Math.round(all.reduce((t, s) => t + (s.weight_kg ?? 0) * (s.reps ?? 0), 0)),
    exercises
  };
}

async function page(key: string, n: number): Promise<HevyPage> {
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(`/api/hevy?page=${n}`, { headers: { 'x-hevy-key': key }, signal: ctrl.signal });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((body as { error?: string }).error || `Sync failed (${r.status})`);
    return body as HevyPage;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('Hevy took too long to answer');
    if (e instanceof TypeError) throw new Error('Could not reach the sync function. Is the app online?');
    throw e;
  } finally {
    window.clearTimeout(t);
  }
}

// Reads the newest workouts (up to 10 pages of 10) and saves them on this device.
export async function syncHevy(key: string, maxPages = 10): Promise<Workout[]> {
  const out: Workout[] = [];
  let count = 1;
  for (let n = 1; n <= Math.min(count, maxPages); n++) {
    const p = await page(key, n);
    count = p.page_count ?? 0;
    out.push(...(p.workouts ?? []).map(summarize));
  }
  out.sort((a, b) => b.start.localeCompare(a.start));
  await setMeta('hevyWorkouts', out);
  await setMeta('hevySyncedAt', new Date().toISOString());
  return out;
}

export const KG_TO_LB = 2.20462;
export function weightText(kg: number, unit: 'lb' | 'kg') {
  const v = unit === 'lb' ? kg * KG_TO_LB : kg;
  return `${Math.round(v * (v < 100 ? 2 : 1)) / (v < 100 ? 2 : 1)} ${unit}`;
}
export function setText(s: HevySet | null, unit: 'lb' | 'kg'): string {
  if (!s) return '';
  if (s.weight_kg && s.reps) return `${weightText(s.weight_kg, unit)} x ${s.reps}`;
  if (s.reps) return `${s.reps} reps`;
  if (s.distance_meters) return unit === 'lb' ? `${(s.distance_meters / 1609.34).toFixed(2)} mi` : `${(s.distance_meters / 1000).toFixed(2)} km`;
  if (s.duration_seconds) return `${Math.floor(s.duration_seconds / 60)}:${String(s.duration_seconds % 60).padStart(2, '0')}`;
  return '';
}
