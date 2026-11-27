import Dexie, { type Table } from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import type {
  Account, Bill, Book, Studio, Transaction, BudgetCategory, CalendarEvent, DumpItem, FitnessClass, Goal, Habit, HealthDay,
  Meta, Person, Pin, Priority, Restaurant, RoadmapItem, SavingsGoal, ShowEvent, SkincareStep, Supplement,
  Trim, Trip, WishItem, DaySnapshot, PeriodGoal, BucketItem, Contact, CareItem
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
  history!: Table<DaySnapshot, string>;
  periodGoals!: Table<PeriodGoal, string>;
  bucket!: Table<BucketItem, string>;
  contacts!: Table<Contact, string>;
  care!: Table<CareItem, string>;

  constructor() {
    super('akosua-command-center');
    // Every store in one version. Each device starts empty and downloads its data from Neon (see sync.ts),
    // so the old seed, upgrade and patch steps from the phone-only version are gone.
    // To add a store later, add a new version: this.version(2).stores({ newStore: 'id' }).
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
      health: 'date',
      studios: 'id, order',
      transactions: 'id, date, category, kind',
      history: 'date',
      periodGoals: 'id, period',
      bucket: 'id, category',
      contacts: 'id, lastContact',
      care: 'id, order'
    });
  }
}

export const db = new CommandCenterDB();

export const STORE_NAMES = db.tables.map((t) => t.name);

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


