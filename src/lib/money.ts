import { db, getMeta, setMeta, useMeta, useTable } from './db';
import { parseExport, sourceName } from './importer';
import { todayISO } from './format';
import type { BudgetCategory, MoneySnapshot, Transaction } from './types';

// Rocket Money category -> your budget category. "Ignore" leaves it out of the budget.
// You can change any of these in Monthly budget, Category mapping.
export const DEFAULT_MAP: Record<string, string> = {
  'Dining & Drinks': 'Dining out',
  'Groceries': 'Groceries',
  'Shopping': 'Shopping',
  'Clothing': 'Shopping',
  'Auto & Transport': 'Transportation',
  'Travel & Vacation': 'Ignore',
  'Bills & Utilities': 'Rent and utilities',
  'Rent': 'Rent and utilities',
  'Home & Garden': 'Shopping',
  'Software & Tech': 'Subscriptions',
  'Subscriptions': 'Subscriptions',
  'Entertainment & Rec.': 'Dining out',
  'Health & Wellness': 'Ignore',
  'Fitness': 'Ignore',
  'Personal Care': 'Shopping',
  'Income': 'Ignore',
  'Credit Card Payment': 'Ignore',
  'Internal Transfers': 'Ignore',
  'Transfer': 'Ignore'
};

export const useCategoryMap = () => ({ ...DEFAULT_MAP, ...useMeta<Record<string, string>>('categoryMap', {}) });

const monthOf = (iso: string) => iso.slice(0, 7);

// Spending this month per budget category, from imported transactions.
export function spendByBudget(txns: Transaction[], map: Record<string, string>, month = monthOf(todayISO())) {
  const out: Record<string, number> = {};
  for (const t of txns) {
    if (t.kind !== 'spend' || monthOf(t.date) !== month) continue;
    const label = map[t.category] ?? 'Unmapped';
    if (label === 'Ignore') continue;
    out[label] = (out[label] ?? 0) + t.amount;
  }
  return out;
}

export function useExportSpend() {
  const txns = useTable(db.transactions);
  const map = useCategoryMap();
  return { spent: spendByBudget(txns, map), txns, map };
}

export interface ImportSummary { added: number; already: number; income: number; spending: number; from: string; to: string; accounts: string[] }

export async function importExport(file: File): Promise<ImportSummary> {
  const parsed = await parseExport(file);
  const ids = parsed.txns.map((t) => t.id);
  const existing = new Set((await db.transactions.bulkGet(ids)).filter(Boolean).map((t) => t!.id));
  await db.transactions.bulkPut(parsed.txns);
  const snap = await getMeta<MoneySnapshot | null>('moneySnapshot', null);
  await setMeta('moneySnapshot', {
    ...(snap ?? { leftToSpend: 0, savingsRate: 0, savingsTarget: 25, netWorth: 0, netWorthChange: 0, cardDue: '', cardAmount: 0, autopay: true }),
    asOf: todayISO(),
    transactions: parsed.txns.length,
    covers: parsed.accounts.join(', ')
  });
  await setMeta('lastImport', { at: new Date().toISOString(), file: file.name, from: parsed.from, to: parsed.to, rows: parsed.txns.length });

  // Once real spending arrives, budget categories that it maps to start reading from the export.
  const spending = parsed.txns.filter((t) => t.kind === 'spend');
  if (spending.length) {
    const map = { ...DEFAULT_MAP, ...(await getMeta<Record<string, string>>('categoryMap', {})) };
    const labels = new Set(spending.map((t) => map[t.category]).filter((l) => l && l !== 'Ignore'));
    const cats = (await db.budget.toArray()) as BudgetCategory[];
    await Promise.all(cats.filter((c) => c.source === 'manual' && labels.has(c.label)).map((c) => db.budget.update(c.id, { source: 'export' })));
  }
  return {
    added: parsed.txns.length - existing.size,
    already: existing.size,
    income: parsed.txns.filter((t) => t.kind === 'income').length,
    spending: spending.length,
    from: parsed.from,
    to: parsed.to,
    accounts: parsed.accounts
  };
}

// Income by month for the last n months (oldest first), and by source.
export function incomeByMonth(txns: Transaction[], months = 12, ref = new Date()) {
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const totals = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const t of txns) if (t.kind === 'income' && t.date.slice(0, 7) in totals) totals[t.date.slice(0, 7)] += -t.amount;
  return keys.map((k) => ({ month: k, total: Math.round(totals[k] * 100) / 100 }));
}

export function incomeSources(txns: Transaction[], year = todayISO().slice(0, 4)) {
  const by = new Map<string, { name: string; total: number; count: number; last: string }>();
  for (const t of txns) {
    if (t.kind !== 'income' || !t.date.startsWith(year)) continue;
    const name = Math.abs(t.amount) < 1 ? 'Small transfers' : sourceName(t.name);
    const cur = by.get(name) ?? { name, total: 0, count: 0, last: '' };
    cur.total += -t.amount;
    cur.count += 1;
    if (t.date > cur.last) cur.last = t.date;
    by.set(name, cur);
  }
  return [...by.values()].sort((a, b) => b.total - a.total);
}

// Left to spend: live from the export once any budget category reads from it, otherwise the number you entered.
export function liveLeftToSpend(budget: BudgetCategory[], spentFor: (c: BudgetCategory) => number, snapshotLeft: number) {
  const live = budget.some((c) => c.source === 'export');
  if (!live) return { left: snapshotLeft, live };
  const total = budget.reduce((a, c) => a + c.budget, 0);
  const spent = budget.reduce((a, c) => a + spentFor(c), 0);
  return { left: Math.round(total - spent), live };
}
