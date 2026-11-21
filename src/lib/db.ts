import Dexie, { type Table } from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import seed from '../data/seed.json';
import { addDays, todayISO } from './format';
import type {
  Account, Bill, Book, BudgetCategory, CalendarEvent, DumpItem, FitnessClass, Goal, Habit, HealthDay,
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
    this.on('populate', (tx) => {
      const data = resolveTokens(seed, todayISO()) as Record<string, unknown>;
      for (const [name, rows] of Object.entries(data)) {
        if (name.startsWith('_')) continue;
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
