import { addDays, daysBetween, money, parseISO, shortDate, todayISO } from './format';
import { labelFor, SPECIAL } from './money';
import { periodFor, type Period } from './plan';
import type { Book, BudgetCategory, FitnessClass, Horizon, PayeeRule, PeriodGoal, Transaction } from './types';

// Your track record: for the last weeks, months, quarters or years, whether you hit each goal.
// A period before there was any data for a goal shows as no data, never as a miss, and the
// period you are in now shows as in progress.

export type TrackStatus = 'hit' | 'miss' | 'open' | 'none';
export interface TrackCell { key: string; label: string; status: TrackStatus; note: string }
export interface TrackRow { id: string; title: string; cells: TrackCell[]; now: string; summary: string; href: string }

const COUNT: Record<Horizon, number> = { week: 12, month: 12, quarter: 8, year: 4 };
const NOUN: Record<Horizon, string> = { week: 'week', month: 'month', quarter: 'quarter', year: 'year' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function periodsBack(h: Horizon, today = todayISO()): Period[] {
  return Array.from({ length: COUNT[h] }, (_, i) => periodFor(h, i - COUNT[h] + 1, today));
}

export function shortLabel(h: Horizon, p: Period, today = todayISO()) {
  const sameYear = p.start.slice(0, 4) === today.slice(0, 4);
  if (h === 'week') return shortDate(p.start);
  if (h === 'month') return `${MONTHS[parseISO(p.start).getMonth()]}${sameYear ? '' : ` ${p.start.slice(2, 4)}`}`;
  if (h === 'quarter') return `Q${Math.floor(parseISO(p.start).getMonth() / 3) + 1}${sameYear ? '' : ` ${p.start.slice(2, 4)}`}`;
  return p.start.slice(0, 4);
}

const isNow = (p: Period, today: string) => p.start <= today && today <= p.end;
const minDate = (dates: string[]) => dates.filter(Boolean).sort()[0] ?? '';

// The Monday to Sunday weeks that belong to a period: the ones whose Thursday falls inside it.
function weeksIn(p: Period): Period[] {
  const out: Period[] = [];
  let w = periodFor('week', 0, p.start);
  if (addDays(w.start, 3) < p.start) w = periodFor('week', 1, p.start);
  while (addDays(w.start, 3) <= p.end) {
    out.push(w);
    w = periodFor('week', 1, w.start);
  }
  return out;
}

function summarize(h: Horizon, cells: TrackCell[], verb: string) {
  const scored = cells.filter((c) => c.status === 'hit' || c.status === 'miss');
  const hits = scored.filter((c) => c.status === 'hit').length;
  if (!scored.length) return `Your first full ${NOUN[h]} is still in progress`;
  if (scored.length === 1) return hits ? `${verb} last ${NOUN[h]}` : `Missed it last ${NOUN[h]}`;
  return `${verb} in ${hits} of the last ${plural(scored.length, NOUN[h])}`;
}

// Fitness: classes plus gym days (a gym class or a Hevy workout), the same count the Classes page uses.
export interface FitnessSources { classes: FitnessClass[]; hevyDates: string[]; gymName?: string; perWeek: number }

function workoutsBetween(src: FitnessSources, start: string, end: string) {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const isGym = (c: FitnessClass) => c.type === 'Gym' || (!!src.gymName && norm(c.studio) === norm(src.gymName));
  const inRange = (d: string) => d >= start && d <= end;
  const classes = src.classes.filter((c) => inRange(c.date));
  const gymDays = new Set([...classes.filter(isGym).map((c) => c.date), ...src.hevyDates.filter(inRange)]);
  return classes.filter((c) => !isGym(c)).length + gymDays.size;
}

export function fitnessRow(h: Horizon, src: FitnessSources, today = todayISO()): TrackRow {
  const target = src.perWeek;
  const start = minDate([...src.classes.map((c) => c.date), ...src.hevyDates]);
  const weekResult = (w: Period): TrackStatus => {
    if (!start || w.end < start) return 'none';
    const n = workoutsBetween(src, w.start, w.end);
    if (n >= target) return 'hit';
    return isNow(w, today) ? 'open' : 'miss';
  };
  const cells = periodsBack(h, today).map((p): TrackCell => {
    const label = shortLabel(h, p, today);
    if (h === 'week') {
      const n = start && p.end >= start ? workoutsBetween(src, p.start, p.end) : 0;
      return { key: p.key, label, status: weekResult(p), note: `${plural(n, 'workout')} of ${target}` };
    }
    const weeks = weeksIn(p).filter((w) => start && w.end >= start);
    const done = weeks.filter((w) => w.end < today || weekResult(w) === 'hit');
    const hits = weeks.filter((w) => weekResult(w) === 'hit').length;
    if (!weeks.length) return { key: p.key, label, status: 'none', note: 'No workouts logged yet' };
    const note = `${hits} of ${plural(weeks.length, 'week')} at ${target} or more`;
    if (isNow(p, today)) return { key: p.key, label, status: hits * 2 > weeksIn(p).length ? 'hit' : 'open', note };
    return { key: p.key, label, status: hits * 2 > done.length ? 'hit' : 'miss', note };
  });
  const thisWeek = periodFor('week', 0, today);
  const n = workoutsBetween(src, thisWeek.start, thisWeek.end);
  return {
    id: 'fitness',
    title: `Fitness, ${target} workouts a week`,
    cells,
    now: `${n} of ${target} this week`,
    summary: target ? summarize(h, cells, `Hit ${target} workouts`) : 'Set a weekly workout goal',
    href: '#/health/classes'
  };
}

// Spending: the budget categories outside fixed bills like rent, from your Rocket Money transactions.
export interface SpendSources { txns: Transaction[]; budget: BudgetCategory[]; classes: FitnessClass[]; map: Record<string, string>; rules: PayeeRule[] }

function spendBetween(src: SpendSources, start: string, end: string) {
  const cats = src.budget.filter((c) => c.source !== 'fixed');
  const byLabel: Record<string, number> = {};
  for (const t of src.txns) {
    if (t.date < start || t.date > end || t.kind !== 'spend') continue;
    const label = labelFor(t, src.map, src.rules);
    if (label === 'Ignore' || label === SPECIAL.MOVED || label === SPECIAL.IGNORE || label === SPECIAL.INVEST) continue;
    byLabel[label] = (byLabel[label] ?? 0) + t.amount;
  }
  const classSpend = src.classes.filter((c) => c.date >= start && c.date <= end).reduce((a, c) => a + (Number(c.price) || 0), 0);
  const per = cats.map((c) => ({ label: c.label, budget: c.budget, spent: c.source === 'classes' ? classSpend : c.source === 'export' ? byLabel[c.label] ?? 0 : 0 }));
  return { spent: per.reduce((a, c) => a + c.spent, 0), per };
}

export function spendingRow(h: Horizon, src: SpendSources, today = todayISO()): TrackRow {
  const monthly = src.budget.filter((c) => c.source !== 'fixed').reduce((a, c) => a + c.budget, 0);
  const dates = src.txns.map((t) => t.date).sort();
  const first = dates[0] ?? '';
  const last = dates[dates.length - 1] ?? '';
  // A week gets a twelfth of a year of budget divided by 52 weeks; longer periods get whole months.
  const cap = h === 'week' ? (monthly * 12) / 52 : monthly * (h === 'month' ? 1 : h === 'quarter' ? 3 : 12);
  const cells = periodsBack(h, today).map((p): TrackCell => {
    const label = shortLabel(h, p, today);
    // Only periods your exports cover: from the first transaction to the last one.
    // A period that starts well before your first export is only partly covered, so it is not scored.
    if (!first || p.end < first || p.start > last || daysBetween(p.start, first) > 3) return { key: p.key, label, status: 'none', note: 'No Rocket Money data for this one' };
    const { spent, per } = spendBetween(src, p.start, p.end);
    const over = h === 'month' ? per.filter((c) => c.spent > c.budget).sort((a, b) => b.spent - b.budget - (a.spent - a.budget)).slice(0, 2).map((c) => c.label) : [];
    const note = `${money(spent)} of ${money(cap)}${over.length ? `, over on ${over.join(' and ')}` : ''}`;
    if (spent > cap) return { key: p.key, label, status: 'miss', note };
    // A period still going, or not fully covered by your last export, is not scored yet.
    if (isNow(p, today) || p.end > last) return { key: p.key, label, status: 'open', note: `${note} so far` };
    return { key: p.key, label, status: 'hit', note };
  });
  const cur = periodFor(h === 'week' ? 'week' : 'month', 0, today);
  const { spent } = first ? spendBetween(src, cur.start, cur.end) : { spent: 0 };
  return {
    id: 'spending',
    title: `Spending, ${money(monthly)} a month outside rent`,
    cells,
    now: first ? `${money(spent)} of ${money(h === 'week' ? (monthly * 12) / 52 : monthly)} this ${h === 'week' ? 'week' : 'month'} so far` : 'Import a Rocket Money export to start',
    summary: first ? summarize(h, cells, 'Stayed on budget') : 'Import a Rocket Money export to see your record',
    href: '#/money/budget'
  };
}

// Reading: on pace for your goal a year. The pace counts from the day you started tracking
// books, so the year you set the goal is not judged on the months before you began.
export function readingRow(h: Horizon, books: Book[], goal: number, today = todayISO()): TrackRow {
  const started = minDate(books.map((b) => b.date));
  const read = books.filter((b) => b.status === 'Read').map((b) => b.date).sort();
  const paceAt = (d: string) => {
    const year = d.slice(0, 4);
    const from = started > `${year}-01-01` ? started : `${year}-01-01`;
    const days = Math.max(0, daysBetween(from, d) + 1);
    const done = read.filter((x) => x.slice(0, 4) === year && x <= d).length;
    return { done, expected: (goal * days) / 365 };
  };
  const cells = periodsBack(h, today).map((p): TrackCell => {
    const label = shortLabel(h, p, today);
    if (!started || p.end < started) return { key: p.key, label, status: 'none', note: 'Before you started tracking books' };
    const end = isNow(p, today) ? today : p.end;
    const { done, expected } = paceAt(end);
    const note = `${plural(done, 'book')} read, ${expected.toFixed(1)} on pace`;
    if (done + 0.5 >= expected) return { key: p.key, label, status: 'hit', note };
    return { key: p.key, label, status: isNow(p, today) ? 'open' : 'miss', note };
  });
  const { done, expected } = started ? paceAt(today) : { done: 0, expected: 0 };
  const year = today.slice(0, 4);
  const yearFrom = started > `${year}-01-01` ? started : `${year}-01-01`;
  const left = Math.max(0, daysBetween(today, `${year}-12-31`));
  const onPace = done + 0.5 >= expected;
  const behind = Math.max(0, Math.ceil(expected - done));
  return {
    id: 'reading',
    title: `Reading, ${goal} books a year`,
    cells,
    now: `${plural(done, 'book')} read in ${year}`,
    summary: !started ? 'Add books to your shelf to start' : onPace
      ? `On pace for ${goal} a year since ${shortDate(yearFrom)}`
      : `${plural(behind, 'book')} behind a ${goal} a year pace, ${left} days left in ${year}`,
    href: '#/dump/books'
  };
}

// Your goals for each week, month, quarter or year from the plan above: a period is a hit when every one is done.
export function planGoalsRow(h: Horizon, goals: PeriodGoal[], today = todayISO()): TrackRow {
  const cells = periodsBack(h, today).map((p): TrackCell => {
    const label = shortLabel(h, p, today);
    const mine = goals.filter((g) => g.period === p.key);
    if (!mine.length) return { key: p.key, label, status: 'none', note: 'No goals set' };
    const done = mine.filter((g) => g.done).length;
    const note = `${done} of ${mine.length} done`;
    if (done === mine.length) return { key: p.key, label, status: 'hit', note };
    return { key: p.key, label, status: isNow(p, today) ? 'open' : 'miss', note };
  });
  const cur = cells[cells.length - 1];
  const scored = cells.filter((c) => c.status === 'hit' || c.status === 'miss');
  return {
    id: 'plan',
    title: `Your ${NOUN[h]}ly goals`,
    cells,
    now: cur.status === 'none' ? `None set this ${NOUN[h]}` : `${cur.note} this ${NOUN[h]}`,
    summary: scored.length ? summarize(h, cells, 'Finished every goal') : 'Set goals in the plan above to start a record',
    href: '#/home/today'
  };
}
