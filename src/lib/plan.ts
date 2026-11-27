import { addDays, clock12ampm, daysBetween, money, parseISO, shortDate, toISO, todayISO } from './format';
import type { Area, BucketCategory, BucketItem, CalendarEvent, CareItem, Facial, Goal, Horizon, SavingsGoal, ShowEvent, Trip } from './types';
import { hrefFor } from './router';

// The Home plan: a week, month, quarter or year, its goals, and what is coming up in it.

export interface Period { key: string; start: string; end: string; title: string; range: string }

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const lastDay = (y: number, m: number) => toISO(new Date(y, m + 1, 0));

export function periodFor(h: Horizon, offset = 0, ref = todayISO()): Period {
  const d = parseISO(ref);
  const y = d.getFullYear();
  const m = d.getMonth();
  if (h === 'week') {
    const start = addDays(ref, -((d.getDay() + 6) % 7) + offset * 7); // weeks start on Monday
    const end = addDays(start, 6);
    const title = offset === 0 ? 'This week' : offset === 1 ? 'Next week' : offset === -1 ? 'Last week' : `Week of ${shortDate(start)}`;
    const range = start.slice(5, 7) === end.slice(5, 7) ? `${shortDate(start)} to ${parseISO(end).getDate()}` : `${shortDate(start)} to ${shortDate(end)}`;
    return { key: `W:${start}`, start, end, title, range };
  }
  if (h === 'month') {
    const first = new Date(y, m + offset, 1);
    const start = toISO(first);
    const end = lastDay(first.getFullYear(), first.getMonth());
    const name = MONTHS_LONG[first.getMonth()];
    const title = offset === 0 ? 'This month' : offset === 1 ? 'Next month' : first.getFullYear() === y ? name : `${name} ${first.getFullYear()}`;
    return { key: `M:${start.slice(0, 7)}`, start, end, title, range: `${name} ${first.getFullYear()}` };
  }
  if (h === 'quarter') {
    const first = new Date(y, Math.floor(m / 3) * 3 + offset * 3, 1);
    const q = Math.floor(first.getMonth() / 3) + 1;
    const start = toISO(first);
    const end = lastDay(first.getFullYear(), first.getMonth() + 2);
    const title = offset === 0 ? 'This quarter' : offset === 1 ? 'Next quarter' : `Q${q} ${first.getFullYear()}`;
    return { key: `Q:${first.getFullYear()}-Q${q}`, start, end, title, range: `Q${q} ${first.getFullYear()}, ${MONTHS_LONG[first.getMonth()].slice(0, 3)} to ${MONTHS_LONG[first.getMonth() + 2].slice(0, 3)}` };
  }
  const year = y + offset;
  return { key: `Y:${year}`, start: `${year}-01-01`, end: `${year}-12-31`, title: offset === 0 ? 'This year' : offset === 1 ? 'Next year' : String(year), range: String(year) };
}

export interface Milestone { id: string; date: string; title: string; detail?: string; area: Area; href?: string }

export interface PlanSources {
  calendar: CalendarEvent[];
  trips: Trip[];
  savings: SavingsGoal[];
  goals: Goal[];
  shows: ShowEvent[];
  bucket: BucketItem[];
  facial: Facial | null;
  care?: CareItem[];
}

// A yearly checkup is due a year after the last visit.
export function careNext(c: CareItem): string {
  if (c.kind !== 'yearly' || !c.last) return '';
  const d = parseISO(c.last);
  d.setFullYear(d.getFullYear() + 1);
  return toISO(d);
}

export const BUCKET_AREA: Record<BucketCategory, Area> = {
  Travel: 'Experiences', Food: 'Social', Experiences: 'Experiences', Books: 'Learning', Fitness: 'Health', Money: 'Money', Learning: 'Learning', Other: 'Other'
};

const QUARTER_END_DAYS = ['03-31', '06-30', '09-30', '12-31'];

// Everything dated between start and end, from the tabs that hold dates.
export function milestones(src: PlanSources, start: string, end: string): Milestone[] {
  const out: Milestone[] = [];
  const inRange = (d?: string) => !!d && d >= start && d <= end;

  for (const e of src.calendar) {
    if (inRange(e.date)) out.push({ id: `cal-${e.id}`, date: e.date, title: e.title, detail: /^\d/.test(e.time) ? clock12ampm(e.time) : undefined, area: e.area });
  }
  for (const t of src.trips) {
    const href = hrefFor('money', 'trips', t.id);
    if (inRange(t.date)) {
      const nights = t.endDate && t.endDate > t.date ? daysBetween(t.date, t.endDate) : 0;
      out.push({ id: `trip-${t.id}`, date: t.date, title: t.name, detail: nights ? `${nights} night${nights === 1 ? '' : 's'}, through ${shortDate(t.endDate)}` : t.status, area: 'Experiences', href });
    }
    for (const [i, x] of (t.extras ?? []).entries()) {
      if (inRange(x.due)) out.push({ id: `extra-${t.id}-${i}`, date: x.due, title: `${x.label} due`, detail: `${money(x.amount)} for ${t.name}`, area: 'Money', href });
    }
  }
  for (const s of src.savings) {
    if (inRange(s.due)) out.push({ id: `save-${s.id}`, date: s.due, title: `${s.name} deadline`, detail: s.target ? `${money(s.saved)} of ${money(s.target)}` : undefined, area: 'Money', href: hrefFor('money', 'goals') });
    // A built quarterly goal (the travel vault) tops back up at each quarter end.
    const built = !!s.builtAt || (s.target > 0 && s.saved >= s.target);
    if (s.refill === 'quarterly' && built) {
      for (let y = Number(start.slice(0, 4)); y <= Number(end.slice(0, 4)); y++) {
        for (const md of QUARTER_END_DAYS) {
          const d = `${y}-${md}`;
          if (inRange(d)) out.push({ id: `refill-${s.id}-${d}`, date: d, title: `${s.name} top up`, detail: 'Quarter end refill', area: 'Money', href: hrefFor('money', 'goals') });
        }
      }
    }
  }
  for (const g of src.goals) {
    if (!g.achieved && inRange(g.due)) out.push({ id: `goal-${g.id}`, date: g.due, title: g.title, detail: 'Goal deadline', area: g.area, href: hrefFor('home', 'goals') });
  }
  for (const s of src.shows) {
    if (inRange(s.date)) out.push({ id: `show-${s.id}`, date: s.date, title: s.title, detail: s.detail || undefined, area: 'Social', href: hrefFor('social') });
  }
  for (const b of src.bucket) {
    if (!b.done && inRange(b.by)) out.push({ id: `bucket-${b.id}`, date: b.by!, title: b.title, detail: 'Bucket list', area: BUCKET_AREA[b.category] ?? 'Other', href: hrefFor('home', 'bucket') });
  }
  for (const c of src.care ?? []) {
    const next = careNext(c);
    if (inRange(next)) out.push({ id: `care-${c.id}`, date: next, title: `${c.title} due`, detail: 'A year since your last visit', area: 'Health', href: hrefFor('health', 'routines') });
  }
  // The next facial only, rolled forward from the last one.
  const f = src.facial;
  if (f?.last) {
    const every = f.everyDays || 30;
    let d = addDays(f.last, every);
    const from = start > todayISO() ? start : todayISO();
    for (let i = 0; i < 400 && d < from; i++) d = addDays(d, every);
    if (inRange(d)) out.push({ id: `facial-${d}`, date: d, title: f.name, detail: 'Around this day', area: 'Health', href: hrefFor('health', 'routines') });
  }
  return out.sort((a, b) => (a.date === b.date ? a.title.localeCompare(b.title) : a.date < b.date ? -1 : 1));
}

// What is coming up in a period: from today on for this period, all of it for a past or future one.
export function comingUp(src: PlanSources, p: Period, today = todayISO()) {
  const from = p.start <= today && today <= p.end ? today : p.start;
  const list = milestones(src, from, p.end);
  // When the period is quiet, the next thing after it.
  const next = milestones(src, addDays(p.end, 1), addDays(p.end, 730))[0];
  return { list, next };
}

export const dayLabel = (iso: string, today = todayISO()) => {
  const n = daysBetween(today, iso);
  return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n > 1 && n < 7 ? `In ${n} days` : n >= 7 && n < 60 ? `In ${Math.round(n / 7)} week${Math.round(n / 7) === 1 ? '' : 's'}` : n >= 60 ? `In ${Math.round(n / 30)} months` : `${-n} day${n === -1 ? '' : 's'} ago`;
};

// A short line under the goal count, like the quotes under other numbers.
export function goalQuip(done: number, total: number, h: Horizon) {
  const span = h === 'week' ? 'week' : h === 'month' ? 'month' : h === 'quarter' ? 'quarter' : 'year';
  if (!total) return `Pick a few things that would make this ${span} count`;
  if (done === total) return `Every goal done, what a ${span}`;
  if (done === 0) return 'Start with the easiest one';
  if (done / total >= 0.5) return 'More than halfway there';
  return `${total - done} to go, keep the streak alive`;
}
