import Papa from 'papaparse';
import { readXlsx, excelDate } from './xlsx';
import type { Transaction } from './types';

// Reads a Rocket Money export (CSV or Excel) into transactions.
// Rocket Money writes money out as positive and money in as negative; this keeps that:
// amount > 0 is spending, amount < 0 is money coming in.

export interface ParsedExport {
  txns: Transaction[];
  accounts: string[];
  from: string;
  to: string;
  skipped: number;
}

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();

function toISODate(v: unknown): string {
  if (typeof v === 'number') return excelDate(v);
  const s = String(v ?? '').trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s);
  if (us) {
    const y = us[3].length === 2 ? `20${us[3]}` : us[3];
    return `${y}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(/[$,\s]/g, '');
  const neg = /^\(.*\)$/.test(s);
  const n = Number(s.replace(/[()]/g, ''));
  return Number.isFinite(n) ? (neg ? -n : n) : NaN;
}

export const TRANSFER = /transfer|credit card payment|card payment|investment/i;

export function kindFor(category: string, amount: number): Transaction['kind'] {
  if (/^income$/i.test(category.trim())) return 'income';
  if (TRANSFER.test(category)) return 'transfer';
  return amount < 0 && !category ? 'income' : 'spend';
}

async function readRows(file: File): Promise<unknown[][]> {
  const isXlsx = /\.xlsx$/i.test(file.name) || file.type.includes('spreadsheetml');
  if (isXlsx) return readXlsx(file);
  const text = await file.text();
  const out = Papa.parse<unknown[]>(text.replace(/^﻿/, ''), { skipEmptyLines: true });
  return out.data;
}

export async function parseExport(file: File): Promise<ParsedExport> {
  const rows = await readRows(file);
  const headerAt = rows.findIndex((r) => r.some((c) => norm(c) === 'date') && r.some((c) => norm(c) === 'amount'));
  if (headerAt < 0) throw new Error('This does not look like a Rocket Money export. It needs Date and Amount columns.');
  const head = rows[headerAt].map(norm);
  const col = (...names: string[]) => names.map((n) => head.indexOf(n)).find((i) => i >= 0) ?? -1;
  const c = {
    date: col('date'),
    original: col('original date'),
    accountName: col('account name', 'account'),
    accountNumber: col('account number'),
    institution: col('institution name', 'institution'),
    name: col('custom name'),
    rawName: col('name', 'merchant', 'description'),
    amount: col('amount'),
    category: col('category'),
    note: col('note', 'notes'),
    ignored: col('ignored from')
  };

  let raw = rows.slice(headerAt + 1).map((r) => ({
    date: toISODate(r[c.date]),
    account: String(r[c.accountName] ?? '').trim(),
    accountNumber: String(r[c.accountNumber] ?? '').trim(),
    institution: String(r[c.institution] ?? '').trim(),
    name: String((c.name >= 0 && r[c.name]) || r[c.rawName] || '').trim(),
    amount: toNumber(r[c.amount]),
    category: String(r[c.category] ?? '').trim(),
    note: String(r[c.note] ?? '').trim(),
    ignored: c.ignored >= 0 && String(r[c.ignored] ?? '').trim() !== ''
  }));
  const before = raw.length;
  raw = raw.filter((r) => r.date && Number.isFinite(r.amount));

  // Money moving between your own accounts is not spending: a bank name from another account in the
  // export (for example "JPMORGAN CHASE BANK" leaving SoFi), and returned card payments.
  const bankWords = [...new Set(raw.flatMap((r) => r.institution.toLowerCase().split(/[^a-z]+/)).filter((w) => w.length > 3 && !['bank', 'banking'].includes(w)))];
  const ownTransfer = (r: (typeof raw)[number]) =>
    /returned payment/i.test(r.name) ||
    (/^(uncategorized|cash & checks|internal transfers?|transfer)?$/i.test(r.category) && !/zelle|venmo|cash app|paypal|western union|atm/i.test(r.name) &&
      bankWords.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(r.name) && !r.institution.toLowerCase().includes(w)));

  // If income rows are positive, this export uses the opposite sign; flip it.
  const income = raw.filter((r) => /^income$/i.test(r.category));
  const flip = income.length > 0 && income.filter((r) => r.amount > 0).length > income.length / 2;
  if (flip) raw.forEach((r) => { r.amount = -r.amount; });

  // Stable ids so importing the same week twice never doubles anything.
  const seen = new Map<string, number>();
  const txns: Transaction[] = raw.map((r) => {
    const key = `${r.date}|${r.accountNumber || r.account}|${r.amount.toFixed(2)}|${r.name.toLowerCase()}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return {
      id: `${key}|${n}`,
      date: r.date,
      account: r.account,
      institution: r.institution,
      name: r.name,
      amount: Math.round(r.amount * 100) / 100,
      category: r.category,
      kind: r.ignored ? 'ignored' : ownTransfer(r) ? 'transfer' : kindFor(r.category, r.amount),
      note: r.note
    };
  });
  const dates = txns.map((t) => t.date).sort();
  return {
    txns,
    accounts: [...new Set(txns.map((t) => (t.institution ? `${t.institution} ${t.account}` : t.account)).filter(Boolean))],
    from: dates[0] ?? '',
    to: dates[dates.length - 1] ?? '',
    skipped: before - raw.length
  };
}

// Make income names readable: "TriNet Ambrose PAYROLL PPD ID: 101336744" -> "TriNet Ambrose".
export function sourceName(name: string): string {
  if (/interest/i.test(name)) return 'Interest';
  if (/tax\s*r(e)?f|taxrfd|tax ref/i.test(name)) return /irs/i.test(name) ? 'Federal tax refund' : 'State tax refund';
  if (/referral|bonus/i.test(name)) return 'Bonuses and referrals';
  return name.replace(/\s+(PAYROLL\s+)?PPD\s+ID:?\s*\S+.*$/i, '').replace(/\s+PAYROLL$/i, '').replace(/\s+/g, ' ').trim() || 'Other';
}
