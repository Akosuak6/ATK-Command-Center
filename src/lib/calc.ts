import { addDays, clamp, daysBetween, monthYear, money, monthsUntil, pct, sameMonth, todayISO } from './format';
import type { Book, BudgetCategory, CalendarEvent, FitnessClass, Goal, HealthDay, Person, SavingsGoal, Trim, Trip } from './types';

// Money

export function classSpendThisMonth(classes: FitnessClass[], ref = todayISO()) {
  return classes.filter((c) => sameMonth(c.date, ref)).reduce((a, c) => a + (Number(c.price) || 0), 0);
}

export function budgetSpent(cat: BudgetCategory, classes: FitnessClass[], fromExport: Record<string, number> = {}) {
  if (cat.source === 'classes') return classSpendThisMonth(classes);
  if (cat.source === 'fixed') return cat.budget;
  if (cat.source === 'export') return fromExport[cat.label] ?? 0;
  return cat.spent;
}

export function tripMonthly(t: Trip) {
  return Math.max(0, t.cost - t.saved) / Math.max(1, t.months || 1);
}

export interface AffordResult {
  tone: 'good' | 'tight' | 'over';
  verdict: string;
  detail: string;
  impacts: { goal: string; impact: string; good: boolean }[];
}

export function affordCheck(price: number, left: number, goals: { name: string; monthly: number }[], daysLeft: number): AffordResult {
  if (price <= left * 0.4) {
    return {
      tone: 'good',
      verdict: 'Go for it',
      detail: `This fits in what is left this month with room for the remaining ${daysLeft} days.`,
      impacts: goals.map((g) => ({ goal: g.name, impact: 'No delay', good: true }))
    };
  }
  if (price <= left) {
    return {
      tone: 'tight',
      verdict: 'Fits, but tightens the month',
      detail: `You can cover it without touching savings, but you would have about ${money((left - price) / Math.max(1, daysLeft))} a day left for the rest of the month.`,
      impacts: goals.map((g) => ({ goal: g.name, impact: 'No delay', good: true }))
    };
  }
  const over = price - left;
  const rows = goals
    .filter((g) => g.monthly > 0)
    .map((g) => ({ name: g.name, weeks: Math.max(1, Math.ceil((over / g.monthly) * 4.33)) }));
  const least = rows.slice().sort((a, b) => a.weeks - b.weeks)[0];
  return {
    tone: 'over',
    verdict: 'Wait, or plan for it',
    detail: least
      ? `This is ${money(over)} over your spending room, so it would come out of a goal. Least disruptive: ${least.name}, about ${least.weeks} weeks.`
      : `This is ${money(over)} over your spending room. Add a monthly contribution to a goal to see the delay.`,
    impacts: rows.map((r) => ({ goal: `If it comes from ${r.name}`, impact: `+${r.weeks} weeks`, good: false }))
  };
}

export interface TripPlan {
  need: number;
  remainingCost: number;
  cuts: { trim: Trim; take: number; used: boolean }[];
  covered: number;
  gap: number;
  monthsToClose: number;
}

export function planTrip(trip: Trip, trims: Trim[]): TripPlan {
  const remainingCost = Math.max(0, trip.cost - trip.saved);
  const need = tripMonthly(trip);
  let remaining = need;
  let covered = 0;
  const cuts = trims
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((trim) => {
      const used = remaining > 0.5;
      const take = used ? Math.min(trim.cap, remaining) : 0;
      remaining -= take;
      covered += take;
      return { trim, take, used };
    });
  const capTotal = trims.reduce((a, t) => a + t.cap, 0);
  return {
    need,
    remainingCost,
    cuts,
    covered,
    gap: Math.max(0, need - covered),
    monthsToClose: capTotal > 0 ? Math.ceil(remainingCost / capTotal) : 0
  };
}

export interface SavingsStatus { pct: number; behind: boolean; label: string }

export function savingsStatus(g: SavingsGoal, ref = todayISO()): SavingsStatus {
  if (g.contributing === false) return { pct: 0, behind: false, label: `${money(g.saved)} invested · no new contributions, still growing` };
  if (!g.target) return { pct: 0, behind: false, label: g.monthly ? `${money(g.saved)} so far · ${money(g.monthly)} a month` : `${money(g.saved)} so far · add a monthly amount` };
  const p = pct(g.saved, g.target);
  const left = Math.max(0, g.target - g.saved);
  const base = `${money(g.saved)} of ${money(g.target)} · ${money(g.monthly)} a month`;
  if (left <= 0) return { pct: 100, behind: false, label: `${base} · fully funded` };
  const monthsToDue = monthsUntil(g.due, ref);
  const projected = g.saved + g.monthly * monthsToDue;
  if (g.due && projected < g.target) {
    const needed = monthsToDue > 0 ? Math.ceil(left / monthsToDue - g.monthly) : left;
    return { pct: p, behind: true, label: `${money(g.saved)} of ${money(g.target)} · needs ${money(needed)} more a month by ${monthYear(g.due).split(' ')[0]}` };
  }
  if (g.monthly <= 0) return { pct: p, behind: false, label: `${base} · add a monthly amount to see a pace` };
  const months = Math.ceil(left / g.monthly);
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return { pct: p, behind: false, label: `${base} · on pace for ${d.toLocaleString('en-US', { month: 'short' })} ${d.getFullYear()}` };
}

// Health

export interface Recovery { score: number; label: 'Good' | 'Fair' | 'Low'; hrv: number; rhr: number; sleep: number }

export function recovery(h: HealthDay): Recovery {
  const hrv = clamp(Math.round((h.hrv / Math.max(1, h.hrvBaseline)) * 100) - 15, 0, 100);
  const rhr = clamp(100 - (h.restingHr - 50) * 2, 0, 100);
  const sleep = clamp(Math.round((h.sleepMin / 480) * 92), 0, 100);
  const score = Math.round(hrv * 0.45 + rhr * 0.2 + sleep * 0.35);
  return { score, label: score >= 70 ? 'Good' : score >= 45 ? 'Fair' : 'Low', hrv, rhr, sleep };
}

const WORKOUT_WORDS = /(pilates|reformer|hiit|yoga|spin|cycle|run|gym|strength|lift|class|workout|barre|boxing|swim)/i;

export function todaysCall(h: HealthDay | undefined, events: CalendarEvent[]) {
  const workout = events.find((e) => e.area === 'Health' || WORKOUT_WORDS.test(e.title));
  if (!h) {
    return {
      title: workout ? `Planned: ${workout.title}` : 'No watch data yet',
      body: 'Run the Morning sync Shortcut to bring in sleep, HRV and rings, and this will turn into a real suggestion.',
      rings: ''
    };
  }
  const r = recovery(h);
  const name = workout?.title ?? '';
  const lower = name.toLowerCase();
  const hrvNote = h.hrv >= h.hrvBaseline ? 'HRV is at or above your baseline' : 'HRV is a little under your baseline';
  const sleepNote = h.sleepMin >= 420 ? 'sleep was solid' : 'sleep was short';
  let title: string;
  let body: string;
  if (r.score >= 80) {
    title = workout ? `Green light, enjoy ${lower}` : 'Green light for a hard session';
    body = `${hrvNote} and ${sleepNote}. ${workout ? `Tonight's ${lower} is a good fit, and you have room to push.` : 'If you want a harder workout this week, today is the day.'}`;
  } else if (r.score >= 55) {
    title = workout ? `Moderate day, keep ${shortWorkout(name)}` : 'Moderate day, keep it steady';
    body = `${hrvNote} but ${sleepNote}, so ${workout ? `${lower} is a good fit. Skip adding a strength session on top.` : 'a walk or an easy class fits best.'}`;
  } else {
    title = workout ? `Go easy, consider moving ${shortWorkout(name)}` : 'Rest day';
    body = `${hrvNote} and ${sleepNote}. ${workout ? 'Swap it for a walk or a stretch if you feel flat.' : 'A walk and an early night will do more than a hard workout.'}`;
  }
  const exLeft = Math.max(0, h.exerciseGoal - h.exercise);
  const rings = exLeft > 0
    ? `${exLeft} more exercise minutes${workout ? ', which the class will cover' : ''}.`
    : 'Exercise ring is already closed.';
  return { title, body, rings };
}

function shortWorkout(title: string) {
  const m = WORKOUT_WORDS.exec(title);
  if (!m) return title.toLowerCase();
  const w = m[1].toLowerCase();
  return w === 'reformer' ? 'Pilates' : w === 'hiit' ? 'HIIT' : w.charAt(0).toUpperCase() + w.slice(1);
}

// Goals

export interface GoalProgress { pct: number; steps: string }

export function goalProgress(
  g: Goal,
  ctx: { trips: Trip[]; books: Book[]; classes: FitnessClass[]; savings: SavingsGoal[]; readingGoal: number }
): GoalProgress {
  if (g.achieved) return { pct: 100, steps: 'Achieved' };
  if (g.link === 'books') {
    const read = readThisYear(ctx.books).length;
    return { pct: pct(read, ctx.readingGoal), steps: `${read} of ${ctx.readingGoal} read` };
  }
  if (g.link === 'classes') {
    const n = ctx.classes.filter((c) => sameMonth(c.date)).length;
    const target = g.target || 12;
    return { pct: pct(n, target), steps: `${n} of ${target} sessions this month` };
  }
  if (g.link.startsWith('trip:')) {
    const t = ctx.trips.find((x) => x.id === g.link.slice(5));
    if (!t) return { pct: 0, steps: 'Trip not found, edit this goal' };
    return { pct: pct(t.saved, t.cost), steps: `${money(t.saved)} saved of ${money(t.cost)}` };
  }
  if (g.link.startsWith('savings:')) {
    const s = ctx.savings.find((x) => x.id === g.link.slice(8));
    if (!s) return { pct: 0, steps: 'Savings goal not found, edit this goal' };
    return { pct: pct(s.saved, s.target), steps: g.steps || `${money(s.saved)} of ${money(s.target)}` };
  }
  return { pct: clamp(Math.round(g.pct), 0, 100), steps: g.steps };
}

export function readThisYear(books: Book[], ref = todayISO()) {
  return books.filter((b) => b.status === 'Read' && b.date.slice(0, 4) === ref.slice(0, 4));
}

// Life areas (simple, honest scores from what is stored; trend history comes later)

export function moneyScore(budget: BudgetCategory[], classes: FitnessClass[], savingsRate: number, target: number, fromExport: Record<string, number> = {}) {
  const within = budget.filter((c) => budgetSpent(c, classes, fromExport) <= c.budget).length;
  const share = budget.length ? within / budget.length : 1;
  const rate = target ? clamp(savingsRate / target, 0, 1) : 1;
  const worst = budget
    .map((c) => ({ c, over: budgetSpent(c, classes, fromExport) - c.budget }))
    .filter((x) => x.over > 0)
    .sort((a, b) => b.over - a.over)[0];
  return {
    score: Math.round(share * 55 + rate * 45),
    note: worst ? `${worst.c.label} is ${money(worst.over)} over budget` : 'Every category is within budget'
  };
}

export function socialScore(people: Person[], events: CalendarEvent[]) {
  const today = todayISO();
  const overdue = people.filter((p) => daysBetween(p.lastContact, today) > 30).length;
  const week = events.filter((e) => e.area === 'Social' && e.date >= today && e.date <= addDays(today, 6)).length;
  return {
    score: clamp(70 + week * 6 - overdue * 4, 0, 100),
    note: `${week} plan${week === 1 ? '' : 's'} this week, ${overdue} ${overdue === 1 ? 'person' : 'people'} to reach out to`
  };
}

export function learningScore(books: Book[], readingGoal: number, dumpThisMonth: number) {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const yearShare = (now.getTime() - start.getTime()) / (365 * 86400000);
  const read = readThisYear(books).length;
  const expected = Math.max(1, readingGoal * yearShare);
  return {
    score: clamp(Math.round((read / expected) * 60 + Math.min(dumpThisMonth, 10) * 4), 0, 100),
    note: `${read} of ${readingGoal} books read`
  };
}
