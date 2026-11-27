import { db, getMeta } from './db';
import { goalProgress, readThisYear } from './calc';
import { todayISO } from './format';
import type { AccountGroup, DaySnapshot, MoneySnapshot } from './types';

// Saves today's row of point in time numbers, so the trend cards can show real progress later.
// Written when the app opens and again whenever it goes to the background, so each day keeps
// its final numbers. Past days are never changed.

export async function recordToday(): Promise<void> {
  const [accounts, savings, trips, goals, books, classes, dump, people] = await Promise.all([
    db.accounts.toArray(), db.savings.toArray(), db.trips.toArray(), db.goals.toArray(),
    db.books.toArray(), db.classes.toArray(), db.dump.toArray(), db.people.toArray()
  ]);
  const snap = await getMeta<Partial<MoneySnapshot>>('moneySnapshot', {});
  const readingGoal = await getMeta<number>('readingGoal', 20);
  const sample = await getMeta<boolean>('sampleData', false);

  const byGroup: Partial<Record<AccountGroup, number>> = {};
  for (const a of accounts) {
    const g = a.group ?? (a.balance < 0 ? 'Debt' : 'Cash');
    byGroup[g] = round((byGroup[g] ?? 0) + a.balance);
  }
  const map = <T extends { id: string }>(rows: T[], value: (r: T) => number) => Object.fromEntries(rows.map((r) => [r.id, round(value(r))]));
  const ctx = { trips, books, classes, savings, readingGoal, accounts };

  const row: DaySnapshot = {
    date: todayISO(),
    savedAt: new Date().toISOString(),
    sample,
    money: {
      accountsTotal: round(accounts.reduce((t, a) => t + a.balance, 0)),
      byGroup,
      accounts: map(accounts, (a) => a.balance),
      savings: map(savings, (s) => s.saved),
      trips: map(trips, (t) => t.saved),
      netWorth: snap.netWorth ?? 0,
      savingsRate: snap.savingsRate ?? 0,
      leftToSpend: snap.leftToSpend ?? 0
    },
    goals: map(goals, (g) => goalProgress(g, ctx).pct),
    books: {
      read: books.filter((b) => b.status === 'Read').length,
      reading: books.filter((b) => b.status === 'Reading').length,
      wantToRead: books.filter((b) => b.status === 'Want to read').length,
      readThisYear: readThisYear(books).length
    },
    dump: { total: dump.length, watchlist: dump.filter((d) => d.watched === false).length },
    people: Object.fromEntries(people.map((p) => [p.id, p.lastContact]))
  };
  await db.history.put(row);
}

const round = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

// Call once at startup.
export function startHistory() {
  const save = () => { void recordToday().catch(() => { /* never block the app over a snapshot */ }); };
  save();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
  // A phone can stay open past midnight: start the new day's row too.
  window.setInterval(save, 30 * 60 * 1000);
}
