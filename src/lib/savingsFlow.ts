import { money } from './format';
import type { SavingsGoal } from './types';

// Your monthly savings flow through your goals in order. A goal with a target takes only what it
// needs to reach it, and the rest moves on to the next goal. A goal with no target (a brokerage)
// takes everything that is left. A full goal that you draw down is below its target again, so it
// takes money first the next month.
// A quarterly goal (the travel vault) fills every month until it is built, then only tops back up
// in quarter end months: March, June, September and December.
// Paycheck contributions (a 401k) are separate: they come out before take home pay.

export interface Flow {
  now: number; // what this goal gets this month
  startsIn: number | null; // months from now until it first gets money (0 = this month)
  fullIn: number | null; // months from now until it reaches its target
  steady: number; // what it gets each month once every goal before it is full
  nextRefillIn: number | null; // quarterly goals: months from now to the next quarter end month
}

export const inFlow = (g: SavingsGoal) => g.contributing !== false && !g.fromPaycheck;
export const QUARTER_ENDS = 'Mar 31, Jun 30, Sep 30 and Dec 31';
const isQuarterEnd = (month: number) => month % 3 === 2; // 0 = January, so 2 = March

export function flowSavings(goals: SavingsGoal[], perMonth: number, horizon = 240, start = new Date()): Map<string, Flow> {
  const order = goals.filter(inFlow).sort((a, b) => a.order - b.order);
  const bal = new Map(order.map((g) => [g.id, g.saved]));
  const built = new Map(order.map((g) => [g.id, !!g.builtAt || (g.target > 0 && g.saved >= g.target)]));
  const startMonth = start.getMonth();
  const out = new Map<string, Flow>(order.map((g) => [g.id, {
    now: 0, startsIn: null, fullIn: g.target > 0 && g.saved >= g.target ? 0 : null, steady: 0,
    nextRefillIn: g.refill === 'quarterly' ? [0, 1, 2].find((m) => isQuarterEnd((startMonth + m) % 12)) ?? 0 : null
  }]));
  for (let m = 0; m < horizon; m++) {
    const month = (startMonth + m) % 12;
    let left = Math.max(0, perMonth);
    for (const g of order) {
      const f = out.get(g.id)!;
      const b = bal.get(g.id)!;
      const waiting = g.refill === 'quarterly' && built.get(g.id) && !isQuarterEnd(month);
      const give = waiting ? 0 : g.target > 0 ? Math.min(left, Math.max(0, g.target - b)) : left;
      left -= give;
      bal.set(g.id, b + give);
      if (g.target > 0 && b + give >= g.target) built.set(g.id, true);
      if (m === 0) f.now = Math.round(give);
      if (give > 0 && f.startsIn === null) f.startsIn = m;
      if (g.target > 0 && f.fullIn === null && b + give >= g.target) f.fullIn = m;
      if (m === horizon - 1) f.steady = Math.round(give);
    }
  }
  return out;
}

const monthLabel = (monthsAhead: number) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + monthsAhead);
  return d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
};
const quarterEndLabel = (monthsAhead: number) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + monthsAhead + 1, 0); // last day of that month
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric' });
};

export interface FlowStatus { pct: number; behind: boolean; label: string }

export function flowStatus(g: SavingsGoal, f: Flow | undefined, perMonth: number): FlowStatus {
  const p = g.target > 0 ? Math.min(100, Math.round((g.saved / g.target) * 100)) : 0;
  if (!f) return { pct: p, behind: false, label: `${money(g.saved)} so far` };
  if (!g.target) {
    if (f.now > 0) return { pct: 0, behind: false, label: `${money(g.saved)} so far · ${money(f.now)} a month` };
    if (f.startsIn !== null) return { pct: 0, behind: false, label: `${money(g.saved)} so far · gets ${money(perMonth)} a month from ${monthLabel(f.startsIn)}` };
    return { pct: 0, behind: false, label: `${money(g.saved)} so far` };
  }
  const of = `${money(g.saved)} of ${money(g.target)}`;
  const quarterly = g.refill === 'quarterly';
  const builtNow = quarterly && (!!g.builtAt || g.saved >= g.target);
  if (g.saved >= g.target) return { pct: 100, behind: false, label: quarterly ? `${of} · full, tops back up on ${QUARTER_ENDS}` : `${of} · full, refills first if you use it` };
  if (builtNow && f.now === 0 && f.nextRefillIn !== null) return { pct: p, behind: false, label: `${of} · tops back up on ${quarterEndLabel(f.nextRefillIn)}` };
  const due = g.due ? new Date(`${g.due}T12:00:00`) : null;
  const fullDate = f.fullIn !== null ? (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + f.fullIn + 1); return d; })() : null;
  const behind = !!due && (!fullDate || fullDate > due);
  const when = f.fullIn !== null ? `full around ${monthLabel(f.fullIn)}` : 'not full within 20 years at this pace';
  const late = behind ? `, after the ${due!.toLocaleString('en-US', { month: 'short', day: 'numeric' })} due date` : '';
  if (f.now > 0) return { pct: p, behind, label: `${of} · ${money(f.now)} this month · ${when}${late}` };
  if (f.startsIn !== null) return { pct: p, behind, label: `${of} · next in line, starts ${monthLabel(f.startsIn)} · ${when}${late}` };
  return { pct: p, behind, label: `${of} · waiting for room in your savings` };
}
