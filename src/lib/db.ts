import Dexie, { type Table } from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import seed from 'virtual:seed';
import { addDays, todayISO } from './format';
import type {
  Account, Bill, Book, Studio, Transaction, BudgetCategory, CalendarEvent, DumpItem, FeedItem, FitnessClass, Goal, Habit, HealthDay,
  Meta, Person, Pin, Priority, Restaurant, RoadmapItem, SavingsGoal, ShowEvent, SkincareStep, Supplement,
  Trim, Trip, WishItem
} from './types';

export class CommandCenterDB extends Dexie {
  meta!: Table<Meta, string>;
  dump!: Table<DumpItem, string>;
  books!: Table<Book, string>;
  classes!: Table<FitnessClass, string>;
  priorities!: Table<Priority, string>;
  pins!: Table<Pin, string>;
  restaurants!: Table<Restaurant, string>;
  shows!: Table<ShowEvent, string>;
  trips!: Table<Trip, string>;
  trims!: Table<Trim, string>;
  goals!: Table<Goal, string>;
  budget!: Table<BudgetCategory, string>;
  savings!: Table<SavingsGoal, string>;
  roadmap!: Table<RoadmapItem, string>;
  accounts!: Table<Account, string>;
  bills!: Table<Bill, string>;
  supplements!: Table<Supplement, string>;
  skincare!: Table<SkincareStep, string>;
  habits!: Table<Habit, string>;
  wishlist!: Table<WishItem, string>;
  people!: Table<Person, string>;
  calendar!: Table<CalendarEvent, string>;
  health!: Table<HealthDay, string>;
  studios!: Table<Studio, string>;
  transactions!: Table<Transaction, string>;
  feed!: Table<FeedItem, string>;

  constructor() {
    super('akosua-command-center');
    this.version(1).stores({
      meta: 'key',
      dump: 'id, date, type',
      books: 'id, status, date',
      classes: 'id, date, type',
      priorities: 'id, date',
      pins: 'id, date',
      restaurants: 'id, list',
      shows: 'id, date',
      trips: 'id',
      trims: 'id, order',
      goals: 'id, order',
      budget: 'id, order',
      savings: 'id, order',
      roadmap: 'id, year',
      accounts: 'id, order',
      bills: 'id, due',
      supplements: 'id, order',
      skincare: 'id, time, order',
      habits: 'id, order',
      wishlist: 'id',
      people: 'id, lastContact',
      calendar: 'id, date',
      health: 'date'
    });
    // Version 2 adds studios (with visit counts and logos). Existing phones get the seed studios once.
    this.version(2).stores({ studios: 'id, order' }).upgrade(async (tx) => {
      const rows = (seed as { studios?: Studio[] }).studios ?? [];
      if (rows.length) await tx.table('studios').bulkPut(rows);
    });
    // Version 3: day by day skincare and the facial reminder. Replaces the sample skincare
    // only if it was never edited, and adds the facial reminder if there is none.
    this.version(3).stores({}).upgrade(async (tx) => {
      const data = seed as { skincare?: SkincareStep[]; meta?: Record<string, unknown> };
      const current = (await tx.table('skincare').toArray()) as SkincareStep[];
      const untouchedSample = current.length > 0 && current.every((x) => /^sk\d+$/.test(x.id));
      if (data.skincare?.length && (current.length === 0 || untouchedSample) && !data.skincare.every((x) => /^sk\d+$/.test(x.id))) {
        await tx.table('skincare').clear();
        await tx.table('skincare').bulkAdd(data.skincare);
      }
      if (data.meta?.facial && !(await tx.table('meta').get('facial'))) await tx.table('meta').put({ key: 'facial', value: data.meta.facial });
    });
    // Version 4: fill in visit counts for seed studios that are still at 0, and add any new seed studios.
    this.version(4).stores({}).upgrade(async (tx) => {
      const rows = (seed as { studios?: Studio[] }).studios ?? [];
      for (const r of rows) {
        const cur = (await tx.table('studios').get(r.id)) as Studio | undefined;
        if (!cur) await tx.table('studios').add(r);
        else if (!cur.pastVisits && r.pastVisits) await tx.table('studios').update(r.id, { pastVisits: r.pastVisits });
      }
    });
    // Version 10: replace the untouched sample accounts with the seed ones.
    this.version(10).stores({}).upgrade(async (tx) => {
      const rows = (seed as { accounts?: { id: string }[] }).accounts ?? [];
      const current = (await tx.table('accounts').toArray()) as { id: string }[];
      if (rows.length && !rows.every((r) => /^a\d+$/.test(r.id)) && (current.length === 0 || current.every((r) => /^a\d+$/.test(r.id)))) {
        await tx.table('accounts').clear();
        await tx.table('accounts').bulkAdd(rows);
      }
    });
    // Version 9: replace untouched sample trips, trims and bills with the seed ones.
    this.version(9).stores({}).upgrade(async (tx) => {
      const data = seed as Record<string, { id: string }[] | undefined>;
      const sample: Record<string, (ids: string[]) => boolean> = {
        trips: (ids) => ids.every((x) => ['lisbon', 'tokyo', 'beach'].includes(x)),
        trims: (ids) => ids.every((x) => /^t\d+$/.test(x)),
        bills: (ids) => ids.every((x) => /^bl\d+$/.test(x))
      };
      for (const [table, isSample] of Object.entries(sample)) {
        const rows = data[table];
        if (!rows?.length || isSample(rows.map((r) => r.id))) continue;
        const current = (await tx.table(table).toArray()) as { id: string }[];
        if (current.length === 0 || isSample(current.map((r) => r.id))) {
          await tx.table(table).clear();
          await tx.table(table).bulkAdd(rows);
        }
      }
    });
    // Version 8: replace the untouched sample savings goals with the seed ones.
    this.version(8).stores({}).upgrade(async (tx) => {
      const rows = (seed as { savings?: { id: string }[] }).savings ?? [];
      const sample = new Set(['emergency', 'roth']);
      const current = (await tx.table('savings').toArray()) as { id: string; saved: number; target: number }[];
      const untouched = current.every((r) => sample.has(r.id)) && current.some((r) => r.id === 'emergency' && r.target === 30000 && r.saved === 19200);
      if (rows.length && rows.some((r) => !sample.has(r.id)) && (current.length === 0 || untouched)) {
        await tx.table('savings').clear();
        await tx.table('savings').bulkAdd(rows);
      }
    });
    // Version 7: replace the untouched sample budget with the seed budget and category mapping.
    this.version(7).stores({}).upgrade(async (tx) => {
      const data = seed as { budget?: { id: string }[]; meta?: Record<string, unknown> };
      const current = (await tx.table('budget').toArray()) as { id: string }[];
      if (data.budget?.length && !data.budget.every((r) => /^bc\d+$/.test(r.id)) && (current.length === 0 || current.every((r) => /^bc\d+$/.test(r.id)))) {
        await tx.table('budget').clear();
        await tx.table('budget').bulkAdd(data.budget);
      }
      if (data.meta?.categoryMap && !(await tx.table('meta').get('categoryMap'))) await tx.table('meta').put({ key: 'categoryMap', value: data.meta.categoryMap });
    });
    // Version 6: transactions from Rocket Money exports.
    this.version(6).stores({ transactions: 'id, date, category, kind' });
    // Version 5: replace the untouched sample supplements and habits with the seed ones.
    this.version(5).stores({}).upgrade(async (tx) => {
      const data = seed as Record<string, { id: string }[] | undefined>;
      for (const [table, sample] of [['supplements', /^sp\d+$/], ['habits', /^h\d+$/]] as const) {
        const rows = data[table];
        if (!rows?.length || rows.every((r) => sample.test(r.id))) continue;
        const current = (await tx.table(table).toArray()) as { id: string }[];
        if (current.length === 0 || current.every((r) => sample.test(r.id))) {
          await tx.table(table).clear();
          await tx.table(table).bulkAdd(rows);
        }
      }
    });
    // Version 11: the feed of healthcare and fashion stories.
    this.version(11).stores({ feed: 'id, date, sourceId' });
    this.on('populate', (tx) => {
      const data = resolveTokens(seed, todayISO()) as Record<string, unknown>;
      for (const [name, rows] of Object.entries(data)) {
        if (name.startsWith('_') || (name !== 'meta' && !this.tables.some((t) => t.name === name))) continue;
        if (name === 'meta') {
          const entries = Object.entries(rows as Record<string, unknown>).map(([key, value]) => ({ key, value }));
          void tx.table('meta').bulkAdd([...entries, { key: 'seededAt', value: new Date().toISOString() }]);
        } else {
          void tx.table(name).bulkAdd(rows as object[]);
        }
      }
    });
  }
}

export const db = new CommandCenterDB();

// Small corrections to seed data that already reached a phone. Each patch runs once, and only
// when the row still looks the way the seed left it, so anything you edited yourself is kept.
interface SeedPatch { id: string; table: string; row: string; from?: Record<string, unknown>; set?: Record<string, unknown>; add?: Record<string, unknown> }

export async function applySeedPatches() {
  const patches = ((seed as { patches?: SeedPatch[] }).patches ?? []).filter((p) => db.tables.some((t) => t.name === p.table));
  if (!patches.length) return;
  const applied = new Set(((await db.meta.get('appliedPatches'))?.value as string[] | undefined) ?? []);
  for (const p of patches) {
    if (applied.has(p.id)) continue;
    const table = db.table(p.table);
    const current = (await table.get(p.row)) as Record<string, unknown> | undefined;
    if (p.add && !current) await table.add(p.table === 'meta' ? { ...p.add, key: p.row } : { ...p.add, id: p.row });
    else if (p.set && current && Object.entries(p.from ?? {}).every(([k, v]) => (v === null ? current[k] == null : current[k] === v))) await table.update(p.row, p.set);
    applied.add(p.id);
  }
  await db.meta.put({ key: 'appliedPatches', value: [...applied] });
}

export const STORE_NAMES = db.tables.map((t) => t.name);

// Seed dates can be written as @day-3 or @day+2, relative to the first launch.
function resolveTokens(value: unknown, today: string): unknown {
  if (typeof value === 'string') {
    const m = /^@day([+-]\d+)$/.exec(value);
    return m ? addDays(today, Number(m[1])) : value;
  }
  if (Array.isArray(value)) return value.map((v) => resolveTokens(v, today));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveTokens(v, today)]));
  }
  return value;
}

export const uid = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

// Live hooks
export function useTable<T>(table: Table<T, string>, sortKey?: keyof T, desc = false): T[] {
  return useLiveQuery(async () => {
    const rows = await table.toArray();
    if (sortKey) {
      rows.sort((a, b) => {
        const x = a[sortKey] as unknown as string | number;
        const y = b[sortKey] as unknown as string | number;
        const r = x < y ? -1 : x > y ? 1 : 0;
        return desc ? -r : r;
      });
    }
    return rows;
  }, [table, sortKey, desc]) ?? [];
}

export function useMeta<T>(key: string, fallback: T): T {
  const row = useLiveQuery(() => db.meta.get(key), [key]);
  return row === undefined || row.value === undefined || row.value === null ? fallback : (row.value as T);
}

export function setMeta(key: string, value: unknown) {
  return db.meta.put({ key, value });
}

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key);
  return row?.value === undefined || row?.value === null ? fallback : (row.value as T);
}

// Backup
export async function exportBackup(): Promise<string> {
  const out: Record<string, unknown> = { app: 'akosua-command-center', version: 1, exportedAt: new Date().toISOString() };
  for (const t of db.tables) out[t.name] = await t.toArray();
  return JSON.stringify(out);
}

export async function importBackup(json: string) {
  const data = JSON.parse(json) as Record<string, unknown>;
  if (data.app !== 'akosua-command-center') throw new Error('This file is not a command center backup');
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) {
      const rows = data[t.name];
      if (!Array.isArray(rows)) continue;
      await t.clear();
      await t.bulkAdd(rows);
    }
  });
}

export async function resetToSeed() {
  await db.delete();
  location.reload();
}
