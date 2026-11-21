import { useState } from 'react';
import { db, setMeta, uid, useMeta, useTable } from '../lib/db';
import { hrefFor, navigate } from '../lib/router';
import { addDays, daysLeftInMonth, money, monthName, pct, shortDate, todayISO } from '../lib/format';
import { affordCheck, budgetSpent, planTrip, savingsStatus, tripMonthly } from '../lib/calc';
import type { Account, Bill, BudgetCategory, MoneySnapshot, RoadmapItem, SavingsGoal, Trim, Trip, TripStatus } from '../lib/types';
import { Bar, Chips, EditButton, FileButton, useToast } from '../components/ui';
import { ListEditor, TableEditor, type FieldDef } from '../components/ListEditor';
import { BarChart, ProjectionChart, SERIES, SERIES_OTHER, StackedBar, type Segment } from '../components/Charts';
import { SPECIAL, needsReview, payee, usualByLabel, type SavingsPlan, importExport, incomeByMonth, incomeSources, liveLeftToSpend, useExportSpend, type ImportSummary } from '../lib/money';
import { Sheet } from '../components/ui';
import { longDate } from '../lib/format';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Live numbers: budget spending from the export once it exists, otherwise what you entered.
export function useLiveMoney() {
  const budget = useTable(db.budget, 'order');
  const classes = useTable(db.classes);
  const snap = useMeta<MoneySnapshot>('moneySnapshot', EMPTY_SNAP);
  const { spent, txns, map, rules } = useExportSpend();
  const spentFor = (c: BudgetCategory) => budgetSpent(c, classes, spent);
  const { left, live } = liveLeftToSpend(budget, spentFor, snap.leftToSpend);
  return { budget, classes, snap, spent, txns, map, rules, spentFor, left, live };
}

function IncomeSection() {
  const { txns } = useExportSpend();
  const months = incomeByMonth(txns, 12);
  const sources = incomeSources(txns);
  if (!txns.some((t) => t.kind === 'income')) return null;
  const thisKey = todayISO().slice(0, 7);
  const cur = months[months.length - 1];
  const prev = months[months.length - 2];
  const fullMonths = months.slice(0, -1).filter((m) => m.total > 0).slice(-3);
  const avg = fullMonths.length ? fullMonths.reduce((a, m) => a + m.total, 0) / fullMonths.length : 0;
  const ytd = months.filter((m) => m.month.startsWith(thisKey.slice(0, 4))).reduce((a, m) => a + m.total, 0);
  const data = months.map((m) => {
    const mi = Number(m.month.slice(5)) - 1;
    return { key: m.month, label: `${MONTH_NAMES[mi]} ${m.month.slice(0, 4)}`, short: MONTH_NAMES[mi][0], value: m.total, note: m.month === thisKey ? 'so far' : undefined };
  });
  const top = sources.slice(0, 6);
  return (
    <section className="card" aria-labelledby="income-h">
      <div className="row row-wrap"><h2 className="h2" id="income-h">Income</h2><span className="sub">From your Rocket Money export</span></div>
      <div className="stats stats-tight">
        <div className="stat"><span className="lbl">This month so far</span><span className="num">{money(cur.total)}</span></div>
        <div className="stat"><span className="lbl">Last month</span><span className="num">{money(prev.total)}</span></div>
        <div className="stat"><span className="lbl">Monthly average</span><span className="num">{money(avg)}</span><span className="sub">Last {fullMonths.length} full months</span></div>
        <div className="stat"><span className="lbl">This year</span><span className="num">{money(ytd)}</span></div>
      </div>
      <BarChart title="Income by month, last 12 months" data={data} highlight={thisKey} />
      <div>
        <span className="lbl">Where it came from this year</span>
        {top.map((s) => (
          <div className="line" key={s.name}>
            <span className="line-main"><span>{s.name}</span><span className="sub">{s.count} {s.count === 1 ? 'deposit' : 'deposits'}, latest {shortDate(s.last)}</span></span>
            <span style={{ fontWeight: 600 }}>{money(s.total)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

const EMPTY_SNAP: MoneySnapshot = {
  asOf: '', leftToSpend: 0, savingsRate: 0, savingsTarget: 25, netWorth: 0, netWorthChange: 0, cardDue: '', cardAmount: 0, autopay: true, transactions: 0, covers: ''
};

const snapFields: FieldDef<MoneySnapshot & { id: string }>[] = [
  { key: 'leftToSpend', label: 'Left to spend this month', type: 'number' },
  { key: 'savingsRate', label: 'Savings rate %', type: 'number' },
  { key: 'savingsTarget', label: 'Savings rate target %', type: 'number' },
  { key: 'netWorth', label: 'Net worth', type: 'number' },
  { key: 'netWorthChange', label: 'Net worth change this month', type: 'number' },
  { key: 'cardDue', label: 'Next card payment date', type: 'date' },
  { key: 'cardAmount', label: 'Next card payment', type: 'number' },
  { key: 'autopay', label: 'Autopay on', type: 'checkbox' },
  { key: 'asOf', label: 'Last export date', type: 'date' },
  { key: 'transactions', label: 'Transactions in last export', type: 'number' },
  { key: 'covers', label: 'Accounts covered', wide: true }
];

export function MoneyOverview() {
  const { snap, left, live } = useLiveMoney();
  const accounts = useTable(db.accounts, 'order');
  const bills = useTable(db.bills, 'due');
  const toast = useToast();
  const [edit, setEdit] = useState<'' | 'snap' | 'accounts' | 'bills'>('');
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [importing, setImporting] = useState(false);
  const onExport = async (file: File) => {
    setImporting(true);
    try {
      setSummary(await importExport(file));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'That file could not be read');
    } finally {
      setImporting(false);
    }
  };
  const today = todayISO();
  const due = snap.asOf ? addDays(snap.asOf, 7) : '';
  // Monthly bills roll forward to their next date.
  const nextDue = (b: Bill) => {
    if (b.repeat !== 'monthly' || !b.due) return b.due;
    let d = b.due;
    for (let i = 0; i < 240 && d < today; i++) {
      const [y, m, day] = d.split('-').map(Number);
      const nm = new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()));
      d = `${nm.getFullYear()}-${String(nm.getMonth() + 1).padStart(2, '0')}-${String(nm.getDate()).padStart(2, '0')}`;
    }
    return d;
  };
  const soon = bills.map((b) => ({ ...b, due: nextDue(b) })).filter((b) => b.due >= today && b.due <= addDays(today, 14)).sort((a, b) => a.due.localeCompare(b.due));
  const daysLeft = daysLeftInMonth();

  return (
    <div className="stack">
      <section aria-label="Key numbers" className="stats">
        <div className="stat"><span className="lbl">Left to spend</span><span className="num">{money(left)}</span><span className="sub">About {money(left / daysLeft)} a day{live ? ', live from your export' : ''}</span></div>
        <div className="stat"><span className="lbl">Savings rate</span><span className="num">{snap.savingsRate}%</span><span className="sub">Target {snap.savingsTarget}%</span></div>
        <div className="stat"><span className="lbl">Net worth</span><span className="num">{money(snap.netWorth)}</span><span className="sub">{snap.netWorthChange >= 0 ? 'Up' : 'Down'} {money(Math.abs(snap.netWorthChange))} this month</span></div>
        <div className="stat"><span className="lbl">Card due {shortDate(snap.cardDue)}</span><span className="num">{money(snap.cardAmount)}</span><span className="sub">Autopay {snap.autopay ? 'on' : 'off'}</span></div>
      </section>
      <div style={{ marginTop: -8 }}><EditButton label="Edit key numbers" onClick={() => setEdit('snap')} /></div>
      <IncomeSection />
      <div className="grid3">
        <section className="card" aria-labelledby="export-h">
          <div className="row"><h2 className="h2" id="export-h">Weekly export</h2>{due && <span className="tag t-money">Due {shortDate(due)}</span>}</div>
          <p className="body">Every week, export your transactions from Rocket Money (CSV or Excel) and drop it here. Budgets, income, goals and the purchase check all update from it. Importing the same weeks again never doubles anything.</p>
          <div>
            <div className="line"><span>Last export</span><span style={{ fontWeight: 600 }}>{snap.asOf ? `${shortDate(snap.asOf)} · ${snap.transactions} transactions` : 'None yet'}</span></div>
            <div className="line"><span>Covers</span><span style={{ fontWeight: 600, textAlign: 'right' }}>{snap.covers || 'Not set'}</span></div>
          </div>
          <FileButton label={importing ? 'Reading your export' : "Upload this week's export"} accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onFile={(f) => void onExport(f)} />
        </section>
        <section className="card" aria-labelledby="acct-h">
          <div className="row"><h2 className="h2" id="acct-h">Accounts</h2><span className="sub">{snap.asOf ? `As of ${shortDate(snap.asOf)}` : ''}</span></div>
          <div>
            {accounts.map((a) => <div className="line" key={a.id}><span>{a.name}</span><span style={{ fontWeight: 600 }}>{money(a.balance)}</span></div>)}
            {accounts.length === 0 && <p className="empty">No accounts yet.</p>}
          </div>
          <EditButton label="Edit accounts" onClick={() => setEdit('accounts')} />
        </section>
        <section className="card" aria-labelledby="bills-h">
          <div className="row"><h2 className="h2" id="bills-h">Upcoming bills</h2><span className="sub">Next 14 days</span></div>
          <div>
            {soon.map((b) => <div className="line" key={b.id}><span>{b.name}, {shortDate(b.due)}</span><span style={{ fontWeight: 600 }}>{money(b.amount)}</span></div>)}
            {soon.length === 0 && <p className="empty">Nothing due in the next 14 days.</p>}
          </div>
          <EditButton label="Edit bills" onClick={() => setEdit('bills')} />
        </section>
      </div>
      <Sheet title="Export imported" open={!!summary} onClose={() => setSummary(null)}>
        {summary && (
          <div className="stack-s" style={{ gap: 12 }}>
            <p className="body"><strong>{summary.added} new transactions</strong>{summary.already ? `, ${summary.already} already here` : ''}, from {longDate(summary.from)} to {longDate(summary.to)}.</p>
            <div>
              <div className="line"><span>Income</span><span style={{ fontWeight: 600 }}>{summary.income}</span></div>
              <div className="line"><span>Spending</span><span style={{ fontWeight: 600 }}>{summary.spending}</span></div>
              <div className="line"><span>Accounts</span><span style={{ fontWeight: 600, textAlign: 'right' }}>{summary.accounts.join(', ')}</span></div>
            </div>
            {summary.spending === 0 && (
              <p className="note-box tone-tight">This file only has money coming in, so your budget did not change. In Rocket Money, clear any filters (like Income) before exporting so spending comes through too.</p>
            )}
            <button type="button" className="btn" onClick={() => setSummary(null)}>Done</button>
          </div>
        )}
      </Sheet>
      <ListEditor<MoneySnapshot & { id: string }>
        title="Edit key numbers"
        open={edit === 'snap'}
        onClose={() => setEdit('')}
        rows={[{ id: 'snap', ...snap }]}
        fields={snapFields}
        onSave={({ id: _id, ...rest }) => setMeta('moneySnapshot', rest)}
      />
      <TableEditor<Account>
        title="Edit accounts" open={edit === 'accounts'} onClose={() => setEdit('')} table={db.accounts} rows={accounts}
        fields={[{ key: 'name', label: 'Account' }, { key: 'balance', label: 'Balance (negative for debt)', type: 'number' }]}
        itemName={(a) => a.name} addLabel="Add an account" make={() => ({ order: accounts.length + 1, name: '', balance: 0 })}
      />
      <TableEditor<Bill>
        title="Edit bills" open={edit === 'bills'} onClose={() => setEdit('')} table={db.bills} rows={bills}
        fields={[{ key: 'name', label: 'Bill' }, { key: 'due', label: 'Due', type: 'date' }, { key: 'amount', label: 'Amount', type: 'number' }, { key: 'repeat', label: 'Repeats', type: 'select', options: [{ value: '', label: 'Once' }, { value: 'monthly', label: 'Every month' }] }]}
        itemName={(b) => b.name} addLabel="Add a bill" make={() => ({ name: '', due: todayISO(), amount: 0, note: '' })}
      />
    </div>
  );
}

const budgetFields: FieldDef<BudgetCategory>[] = [
  { key: 'label', label: 'Category' },
  { key: 'budget', label: 'Monthly budget', type: 'number' },
  { key: 'spent', label: 'Spent so far (manual only)', type: 'number' },
  { key: 'source', label: 'Spent comes from', type: 'select', options: [{ value: 'manual', label: 'Entered by me' }, { value: 'export', label: 'Rocket Money export' }, { value: 'fixed', label: 'Fixed bill, paid every month' }, { value: 'classes', label: 'Health class log' }] }
];

export function useImpactGoals() {
  const savings = useTable(db.savings, 'order');
  const trips = useTable(db.trips, 'date');
  return [
    ...savings.map((s) => ({ name: s.name.split(',')[0], monthly: s.monthly })),
    ...trips.filter((t) => t.saved < t.cost).map((t) => ({ name: `${t.name.split(/\s+(and|in|with)\s+/)[0]} trip fund`, monthly: Math.round(tripMonthly(t)) }))
  ];
}

export function MoneyBudget() {
  const { budget, classes, spentFor, left, live, txns, map, rules, spent: exportSpent } = useLiveMoney();
  const usual = usualByLabel(txns, map, rules);
  const plan = useMeta<SavingsPlan>('savingsPlan', { takeHome: 0, saveFirst: 0 });
  const [editPlan, setEditPlan] = useState(false);
  const impactGoals = useImpactGoals();
  const [editing, setEditing] = useState(false);
  const [mapping, setMapping] = useState(false);
  const [price, setPrice] = useState(350);
  const monthClasses = classes.filter((c) => c.date.slice(0, 7) === todayISO().slice(0, 7)).length;

  let spentTotal = 0;
  let budgetTotal = 0;
  const rows = budget.map((c) => {
    const spent = spentFor(c);
    spentTotal += spent;
    budgetTotal += c.budget;
    return { c, spent, over: spent > c.budget };
  });
  const result = affordCheck(price, left, impactGoals, daysLeftInMonth());
  const seenCats = [...new Set(txns.filter((t) => t.kind === 'spend').map((t) => t.category))].sort();
  const unmapped = exportSpent['Unmapped'] ?? 0;

  return (
    <div className="grid2">
      <SavingsFirst plan={plan} budgetTotal={budgetTotal} usualTotal={budget.reduce((a, c) => a + (c.source === 'export' ? usual[c.label] ?? 0 : 0), 0)} budgetedExport={budget.reduce((a, c) => a + (c.source === 'export' ? c.budget : 0), 0)} onEdit={() => setEditPlan(true)} />
      <ListEditor<SavingsPlan & { id: string }>
        title="Savings plan" open={editPlan} onClose={() => setEditPlan(false)} rows={[{ id: 'plan', ...plan }]}
        fields={[{ key: 'takeHome', label: 'Take home pay a month', type: 'number' }, { key: 'saveFirst', label: 'Set aside first each month', type: 'number' }]}
        onSave={({ id: _id, ...rest }) => setMeta('savingsPlan', rest)}
      />
      <section className="card" aria-labelledby="budget-h">
        <div className="row"><h2 className="h2" id="budget-h">{monthName()} budget</h2><span className="sub">{money(spentTotal)} of {money(budgetTotal)}</span></div>
        <div className="stack-s" style={{ gap: 12 }}>
          {rows.map(({ c, spent, over }) => (
            <div className="goal" key={c.id}>
              <div className="row">
                <span className="goal-t">{c.label}</span>
                <span style={{ fontSize: 12 }} className={over ? 'bad-text' : 'pct'}>{money(spent)} / {money(c.budget)}{over ? ', over' : ''}</span>
              </div>
              {c.source === 'export' && usual[c.label] > c.budget && <span className="sub">You usually spend {money(usual[c.label])}, this saves {money(usual[c.label] - c.budget)} a month</span>}
              <Bar value={pct(spent, c.budget)} warn={over} />
              {c.source === 'classes' && <span className="sub">Pulled from your class log, {monthClasses} classes this month</span>}
              {c.source === 'export' && <span className="sub">From your Rocket Money export</span>}
              {c.source === 'fixed' && <span className="sub">Fixed each month</span>}
            </div>
          ))}
        </div>
        {unmapped > 0 && <p className="note-box tone-tight">{money(unmapped)} of spending this month is not matched to a budget category yet.</p>}
        <div className="card-actions">
          <EditButton label="Edit budget categories" onClick={() => setEditing(true)} />
          {seenCats.length > 0 && <button type="button" className="btn-text" onClick={() => setMapping(true)}>Category mapping</button>}
        </div>
        <Sheet title="Category mapping" open={mapping} onClose={() => setMapping(false)}>
          <p className="sub">Which budget category each Rocket Money category counts toward. Changes save straight away.</p>
          {seenCats.map((rm) => (
            <div className="form-col" key={rm}>
              <label className="lbl" htmlFor={`map-${rm}`}>{rm}</label>
              <select id={`map-${rm}`} className="field" value={map[rm] ?? 'Unmapped'}
                onChange={async (e) => {
                  const choice = e.target.value;
                  const cur = (await db.meta.get('categoryMap'))?.value as Record<string, string> | undefined;
                  await setMeta('categoryMap', { ...(cur ?? {}), [rm]: choice });
                  // A budget category that now receives export spending starts reading from it.
                  const cat = budget.find((x) => x.label === choice);
                  if (cat && cat.source === 'manual') await db.budget.update(cat.id, { source: 'export' });
                }}>
                <option value="Unmapped">Not matched yet</option>
                {budget.map((b) => <option key={b.id} value={b.label}>{b.label}</option>)}
                <option value="Ignore">Leave out of the budget</option>
              </select>
            </div>
          ))}
          <button type="button" className="btn" onClick={() => setMapping(false)}>Done</button>
        </Sheet>
      </section>

      <section className="card" aria-labelledby="afford-h">
        <h2 className="h2" id="afford-h" style={{ fontSize: 26 }}>Can I afford it?</h2>
        <p className="body">Type a price before you buy. It checks what is left this month and tells you which goal it would push back.</p>
        <label htmlFor="price" className="lbl">Purchase price</label>
        <div className="money-input">
          <span aria-hidden="true">$</span>
          <input id="price" type="number" inputMode="decimal" min={0} value={price || ''} placeholder="0" onChange={(e) => setPrice(Number(e.target.value) || 0)} />
        </div>
        <div className="chips" role="group" aria-label="Preset prices">
          {[80, 350, 900, 2400].map((n) => <button key={n} type="button" className="preset" onClick={() => setPrice(n)}>{money(n)}</button>)}
        </div>
        <div className={`verdict tone-${result.tone}`} aria-live="polite">
          <span className="lbl">Verdict · {money(left)} left this month{live ? ', live' : ''}</span>
          <span className="verdict-title">{result.verdict}</span>
          <span className="body" style={{ color: 'var(--ink-3)' }}>{result.detail}</span>
          <span className="lbl" style={{ marginTop: 4 }}>Goal impact</span>
          {result.impacts.map((g) => (
            <div className="impact" key={g.goal}><span>{g.goal}</span><span className={g.good ? 'good-text' : 'bad-text'}>{g.impact}</span></div>
          ))}
          {result.impacts.length === 0 && <span className="sub">Add savings goals with a monthly amount to see the impact.</span>}
        </div>
      </section>
      <ReviewPayments />
      <TableEditor<BudgetCategory>
        title="Edit budget categories" open={editing} onClose={() => setEditing(false)} table={db.budget} rows={budget} fields={budgetFields}
        itemName={(c) => c.label} addLabel="Add a category" make={() => ({ order: budget.length + 1, label: '', budget: 0, spent: 0, source: 'manual' })}
      />
    </div>
  );
}

const savingsFields: FieldDef<SavingsGoal>[] = [
  { key: 'name', label: 'Goal', wide: true },
  { key: 'target', label: 'Target', type: 'number' },
  { key: 'saved', label: 'Saved so far', type: 'number' },
  { key: 'monthly', label: 'Monthly contribution', type: 'number' },
  { key: 'due', label: 'Target date', type: 'date' },
  { key: 'kind', label: 'Kind', type: 'select', options: [{ value: 'retirement', label: 'Retirement (401k, IRA)' }, { value: 'savings', label: 'Savings' }, { value: 'brokerage', label: 'Brokerage' }, { value: 'other', label: 'Other' }] },
  { key: 'contributing', label: 'Still contributing', type: 'checkbox' },
  { key: 'fromPaycheck', label: 'Comes out of my paycheck (like a 401k)', type: 'checkbox' },
  { key: 'order', label: 'Priority (1 gets money first)', type: 'number' },
  { key: 'note', label: 'Note', wide: true }
];

const roadmapFields: FieldDef<RoadmapItem>[] = [
  { key: 'year', label: 'Year' },
  { key: 'tag', label: 'Tag', placeholder: 'Retire, Safety, Growth, Home' },
  { key: 'title', label: 'Milestone', wide: true },
  { key: 'detail', label: 'Detail', wide: true }
];

const ROADMAP_TAG: Record<string, string> = { Retire: 't-money', Safety: 't-money', Growth: 't-work', Home: 't-social' };

export function MoneyGoals() {
  const savings = useTable(db.savings, 'order');
  const trips = useTable(db.trips, 'date');
  const roadmap = useTable(db.roadmap, 'year');
  const [edit, setEdit] = useState<'' | 'savings' | 'roadmap'>('');
  const allSaved = trips.reduce((a, t) => a + t.saved, 0);
  const allCost = trips.reduce((a, t) => a + t.cost, 0);
  const allMonthly = trips.reduce((a, t) => a + tripMonthly(t), 0);
  const lastTrip = trips.reduce((d, t) => (t.date > d ? t.date : d), '');
  const tripPct = pct(allSaved, allCost);

  // Three kinds, in your order of priority: retirement levers first, then savings, then brokerage.
  const KIND_LABEL: Record<string, string> = { retirement: 'Retirement', savings: 'Savings', brokerage: 'Brokerage', other: 'Other goals' };
  const kindOf = (g: SavingsGoal) => g.kind ?? (/401|ira|roth|retire/i.test(g.name) ? 'retirement' : /brokerage|invest/i.test(g.name) ? 'brokerage' : 'savings');
  const payroll = savings.filter((g) => g.contributing !== false && g.fromPaycheck);
  const active = savings.filter((g) => g.contributing !== false && !g.fromPaycheck);
  const byKind = (k: string) => active.filter((g) => kindOf(g) === k).reduce((a, g) => a + g.monthly, 0) + (k === 'savings' ? Math.round(allMonthly) : 0);
  const segments: Segment[] = [
    { label: 'Retirement', value: byKind('retirement'), color: SERIES[0] },
    { label: 'Savings and trips', value: byKind('savings'), color: SERIES[1] },
    { label: 'Brokerage', value: byKind('brokerage'), color: SERIES[2] },
    { label: 'Other goals', value: byKind('other'), color: SERIES_OTHER }
  ];
  const total = segments.reduce((a, x) => a + x.value, 0);
  const colorFor = (g: SavingsGoal) => ({ retirement: SERIES[0], savings: SERIES[1], brokerage: SERIES[2] } as Record<string, string>)[kindOf(g)] ?? SERIES_OTHER;
  const paused = savings.filter((g) => g.contributing === false);
  const invested = useExportSpend().spent[SPECIAL.INVEST] ?? 0;
  const plan = useMeta<SavingsPlan>('savingsPlan', { takeHome: 0, saveFirst: 0 });

  return (
    <div className="stack">
      <section className="card" aria-labelledby="plan-h">
        <div className="row row-wrap"><h2 className="h2" id="plan-h">Where your monthly savings go</h2><span className="num" style={{ fontSize: 26 }}>{money(total)}<span className="unit">a month</span></span></div>
        <StackedBar label="Monthly savings plan" segments={segments} />
        <div>
          <span className="lbl">Your savings order</span>
          <ol className="lever-list">
            {active.map((g) => (
              <li key={g.id}>
                <span className="swatch" style={{ background: colorFor(g) }} aria-hidden="true" />
                <span className="line-main"><strong style={{ fontSize: 14 }}>{g.name}</strong>{g.note && <span className="sub">{g.note}</span>}</span>
                <span className="tag t-plain">{KIND_LABEL[kindOf(g)]}</span>
                {g.monthly ? <span className="lever-amt">{money(g.monthly)}</span> : <span className="sub lever-amt">Add amount</span>}
              </li>
            ))}
            {allMonthly > 0 && (
              <li>
                <span className="swatch" style={{ background: SERIES[1] }} aria-hidden="true" />
                <span className="line-main"><strong style={{ fontSize: 14 }}>Trip funds</strong><span className="sub">From your trip planner</span></span>
                <span className="tag t-plain">Savings</span>
                <span className="lever-amt">{money(allMonthly)}</span>
              </li>
            )}
          </ol>
          {payroll.map((g) => (
            <p className="sub" key={g.id} style={{ marginTop: 8 }}><strong>Before your paycheck: {g.name} {money(g.monthly)} a month.</strong>{g.note ? ` ${g.note}` : ''}</p>
          ))}
          {plan.saveFirst > 0 && (
            <p className={`sub${total - plan.saveFirst >= 10 ? ' bad-text' : ''}`} style={{ marginTop: 8 }}>
              {Math.abs(total - plan.saveFirst) < 10
                ? `All ${money(plan.saveFirst)} you set aside each month has a place.`
                : `${money(total)} of the ${money(plan.saveFirst)} you set aside each month is assigned${total < plan.saveFirst ? `, ${money(plan.saveFirst - total)} still to place` : `, ${money(total - plan.saveFirst)} more than your plan`}.`}
            </p>
          )}
          {invested > 0 && <p className="sub" style={{ marginTop: 8 }}><strong>Moved to investments this month:</strong> {money(invested)}, from your export. This counts as saving, not spending.</p>}
          {paused.map((g) => (
            <p className="sub" key={g.id} style={{ marginTop: 8 }}><strong>{g.name}:</strong> {money(g.saved)} stays invested and keeps growing. No new contributions{g.note ? `, ${g.note.charAt(0).toLowerCase()}${g.note.slice(1)}` : ''}.</p>
          ))}
        </div>
      </section>

      <div className="row row-wrap" style={{ alignItems: 'center' }}>
        <h2 className="h2">Accounts and goals</h2>
        <EditButton label="Edit savings goals" onClick={() => setEdit('savings')} />
      </div>
      <div className="grid2">
        {savings.map((g) => {
          const st = savingsStatus(g);
          const chart = g.contributing !== false && g.target > 0;
          return (
            <section className="card" key={g.id} aria-labelledby={`sg-${g.id}`}>
              <div className="row">
                <span className="goal-t" id={`sg-${g.id}`} style={{ fontSize: 15 }}>{g.name}</span>
                <span className="chips" style={{ gap: 6 }}>
                  <span className="tag t-plain">{g.contributing === false ? 'Not contributing' : KIND_LABEL[kindOf(g)]}</span>
                  {chart && <span className={st.behind ? 'pct bad-text' : 'pct'}>{st.behind ? `Behind, ${st.pct}%` : `${st.pct}%`}</span>}
                </span>
              </div>
              {chart ? <ProjectionChart title={g.name} saved={g.saved} target={g.target} monthly={g.monthly} due={g.due} color={colorFor(g)} />
                : <span className="num">{money(g.saved)}</span>}
              <span className="sub">{st.label}</span>
            </section>
          );
        })}
        <section className="card" aria-labelledby="sg-trips">
          <div className="row">
            <a className="goal-t" id="sg-trips" href={hrefFor('money', 'trips')} style={{ color: 'inherit', fontSize: 15 }}>Trip funds, all trips</a>
            <span className="pct">{tripPct}%</span>
          </div>
          <ProjectionChart title="Trip funds" saved={allSaved} target={allCost} monthly={allMonthly} due={lastTrip} color={SERIES[1]} />
          <span className="sub">{money(allSaved)} of {money(allCost)} across {trips.length} trips · {money(allMonthly)} a month</span>
        </section>
      </div>

      <section className="card" aria-labelledby="road-h">
        <div className="row"><h2 className="h2" id="road-h">Long term roadmap</h2><span className="sub">Next 5 years</span></div>
        <div>
          {roadmap.map((r) => (
            <div className="roadmap" key={r.id}>
              <span className="roadmap-year">{r.year}</span>
              <div className="stack-s" style={{ flex: 1, gap: 4 }}><strong style={{ fontSize: 14 }}>{r.title}</strong><span className="sub">{r.detail}</span></div>
              {r.tag && <span className={`tag ${ROADMAP_TAG[r.tag] ?? 't-plain'}`}>{r.tag}</span>}
            </div>
          ))}
          {roadmap.length === 0 && <p className="empty">No milestones yet.</p>}
        </div>
        <EditButton label="Edit roadmap" onClick={() => setEdit('roadmap')} />
      </section>
      <TableEditor<SavingsGoal>
        title="Edit savings goals" open={edit === 'savings'} onClose={() => setEdit('')} table={db.savings} rows={savings} fields={savingsFields}
        itemName={(g) => g.name} addLabel="Add a savings goal" make={() => ({ order: savings.length + 1, name: '', target: 0, saved: 0, monthly: 0, due: '', kind: 'savings', contributing: true })}
      />
      <TableEditor<RoadmapItem>
        title="Edit roadmap" open={edit === 'roadmap'} onClose={() => setEdit('')} table={db.roadmap} rows={roadmap} fields={roadmapFields}
        itemName={(r) => r.title} addLabel="Add a milestone" make={() => ({ year: String(new Date().getFullYear() + 1), title: '', detail: '', tag: '' })}
      />
    </div>
  );
}

const STATUSES: TripStatus[] = ['Booked', 'Planning', 'Dreaming'];
const tripFields: FieldDef<Trip>[] = [
  { key: 'name', label: 'Trip', wide: true },
  { key: 'status', label: 'Status', type: 'select', options: STATUSES.map((s) => ({ value: s, label: s })) },
  { key: 'date', label: 'Trip date', type: 'date' },
  { key: 'cost', label: 'Total cost', type: 'number' },
  { key: 'saved', label: 'Saved so far', type: 'number' },
  { key: 'months', label: 'Months until the trip', type: 'number' },
  { key: 'photo', label: 'Cover photo for the vision board', type: 'image' }
];
const trimFields: FieldDef<Trim>[] = [
  { key: 'order', label: 'Rank', type: 'number' },
  { key: 'label', label: 'Trim' },
  { key: 'cap', label: 'Most it can give a month', type: 'number' },
  { key: 'how', label: 'How', wide: true }
];

export function TripPlanner({ tripId }: { tripId?: string }) {
  const trips = useTable(db.trips, 'date');
  const trims = useTable(db.trims, 'order');
  const [edit, setEdit] = useState<'' | 'trip' | 'trims'>('');
  const [custom, setCustom] = useState('');
  const trip = trips.find((t) => t.id === tripId) ?? trips[0];

  const addTrip = async () => {
    const id = uid();
    await db.trips.add({ id, name: 'New trip', cost: 1000, months: 8, saved: 0, status: 'Dreaming', date: addDays(todayISO(), 240) });
    navigate('money', 'trips', id);
    setEdit('trip');
  };

  if (!trip) {
    return (
      <section className="card"><h2 className="h2">No trips yet</h2><p className="body">Add a trip to plan how to fund it. It also shows on your vision board.</p><button type="button" className="btn" onClick={addTrip}>Add a trip</button></section>
    );
  }

  const plan = planTrip(trip, trims);
  const upd = (patch: Partial<Trip>) => db.trips.update(trip.id, patch);
  const preset = [3, 5, 8, 12, 16];
  const isCustom = !preset.includes(trip.months);

  return (
    <div className="stack">
      <TravelYear trips={trips} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <Chips label="Choose a trip" value={trip.id} onChange={(id) => navigate('money', 'trips', id)} options={trips.map((t) => ({ value: t.id, label: t.name }))} />
        <button type="button" className="btn-text" onClick={addTrip}>Add a trip</button>
      </div>
      <section className="card trip-card" aria-labelledby="trip-h">
        <div className="trip-col">
          <span className="lbl">{trip.status} · linked to your vision board</span>
          <div className="row" style={{ alignItems: 'center' }}>
            <h2 className="h2" id="trip-h" style={{ fontSize: 28 }}>{trip.name}</h2>
            <EditButton label={`Edit ${trip.name}`} onClick={() => setEdit('trip')} />
          </div>
          <label htmlFor="tripcost" className="lbl">Total trip cost{trip.estimate ? ' (my estimate, change it to your real number)' : ''}</label>
          <div className="money-input">
            <span aria-hidden="true">$</span>
            <input id="tripcost" type="number" inputMode="decimal" min={0} value={trip.cost || ''} placeholder="0" onChange={(e) => upd({ cost: Number(e.target.value) || 0, estimate: false })} />
          </div>
          <label htmlFor="tripsaved" className="lbl">Saved so far</label>
          <div className="money-input">
            <span aria-hidden="true">$</span>
            <input id="tripsaved" type="number" inputMode="decimal" min={0} value={trip.saved || ''} placeholder="0" onChange={(e) => upd({ saved: Number(e.target.value) || 0 })} />
          </div>
          <span className="lbl" id="months-lbl">Months until the trip</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <Chips label="Months until the trip" value={isCustom ? -1 : trip.months} onChange={(m) => { setCustom(''); void upd({ months: m }); }} options={preset.map((m) => ({ value: m, label: `${m} mo` }))} />
            <label htmlFor="custom-months" className="sr">Custom number of months</label>
            <input
              id="custom-months" className="field month-custom" type="number" inputMode="numeric" min={1} placeholder="Custom"
              value={custom || (isCustom ? String(trip.months) : '')}
              onChange={(e) => { setCustom(e.target.value); const n = Math.round(Number(e.target.value)); if (n >= 1) void upd({ months: n }); }}
            />
          </div>
          <div className="goal" style={{ border: 'none' }}>
            <div className="row"><span className="goal-t">Trip fund</span><span className="pct">{money(trip.saved)} of {money(trip.cost)} saved</span></div>
            <Bar value={pct(trip.saved, trip.cost)} />
          </div>
          <ProjectionChart title={trip.name} saved={trip.saved} target={trip.cost} monthly={plan.need} due={trip.date} />
        </div>
        <div className="trip-col" style={{ gap: 10 }}>
          <div className="row"><span className="lbl">Set aside each month</span><span style={{ fontFamily: 'var(--serif)', fontSize: 30, fontWeight: 500 }}>{money(plan.need)}</span></div>
          <div className="row" style={{ marginTop: 4, alignItems: 'center' }}>
            <span className="lbl">Where the money comes from</span>
            <EditButton label="Edit trims" onClick={() => setEdit('trims')} />
          </div>
          <div>
            {plan.cuts.map(({ trim, take, used }) => (
              <div className={`cut${used ? '' : ' unused'}`} key={trim.id}>
                <span className="stack-s" style={{ gap: 2 }}><strong>{trim.label}</strong><span className="sub">{trim.how}</span></span>
                <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{used ? `${money(take)} / mo` : 'Not needed'}</span>
              </div>
            ))}
          </div>
          <div className={`note-box ${plan.gap < 1 ? 'tone-good' : 'tone-over'}`} aria-live="polite">
            {plan.gap < 1 ? (
              <><strong>Covered without touching savings.</strong> Set up an auto transfer of {money(plan.need)} to this trip fund on payday.</>
            ) : (
              <><strong>Short {money(plan.gap)} a month.</strong> Trims cover {money(plan.covered)}. Giving it {plan.monthsToClose} or more months closes the gap.</>
            )}
          </div>
        </div>
      </section>
      <TableEditor<Trip>
        title="Edit trip" open={edit === 'trip'} onClose={() => setEdit('')} table={db.trips} rows={[trip]} fields={tripFields}
        itemName={(t) => t.name}
      />
      <TableEditor<Trim>
        title="Edit trims" open={edit === 'trims'} onClose={() => setEdit('')} table={db.trims} rows={trims} fields={trimFields}
        itemName={(t) => t.label} addLabel="Add a trim" make={() => ({ order: trims.length + 1, label: '', how: '', cap: 0 })}
      />
    </div>
  );
}

// Venmo and Zelle payments Rocket Money cannot place. You choose once; Zelle names can become a rule.
function ReviewPayments() {
  const { txns, budget, rules } = useLiveMoney();
  const toast = useToast();
  const [always, setAlways] = useState<Record<string, boolean>>({});
  const since = addDays(todayISO(), -120);
  const queue = txns.filter((t) => t.date >= since && needsReview(t, rules)).sort((a, b) => b.date.localeCompare(a.date));
  const shown = queue.slice(0, 12);
  const options = [
    ...budget.map((b) => ({ value: b.label, label: b.label })),
    { value: SPECIAL.MOVED, label: 'Moved to my own account' },
    { value: SPECIAL.INVEST, label: 'Invested (E*Trade and similar)' },
    { value: SPECIAL.IGNORE, label: 'Leave out of the budget' }
  ];
  const choose = async (id: string, name: string, value: string) => {
    if (!value) return;
    const who = payee(name);
    if (who && always[id]) {
      await setMeta('payeeRules', [...rules.filter((r) => r.match.toLowerCase() !== who.toLowerCase()), { match: who, label: value }]);
      toast(`Payments to ${who} will always count as ${options.find((o) => o.value === value)?.label}`);
    } else {
      await db.transactions.update(id, { label: value });
    }
  };
  if (!queue.length && !rules.length) return null;
  return (
    <section className="card" aria-labelledby="review-h" style={{ gridColumn: '1 / -1' }}>
      <div className="row row-wrap"><h2 className="h2" id="review-h">Needs a look</h2><span className="sub">{queue.length ? `${queue.length} Venmo and Zelle payments to sort` : 'All sorted'}</span></div>
      {queue.length > 0 && <p className="body">Rocket Money cannot tell what these were for. Pick where each one belongs, and it updates your budget.</p>}
      <div>
        {shown.map((t) => {
          const who = payee(t.name);
          return (
            <div className="review-row" key={t.id}>
              <span className="line-main">
                <strong style={{ fontSize: 14 }}>{who ? `${/zelle/i.test(t.name) ? 'Zelle' : 'Payment'} to ${who}` : /venmo/i.test(t.name) ? 'Venmo payment' : t.name}</strong>
                <span className="sub">{shortDate(t.date)} · {t.account}{t.category && t.category !== 'Uncategorized' ? ` · Rocket Money says ${t.category}` : ''}</span>
              </span>
              <span className="review-amt">{money(t.amount)}</span>
              <div className="review-pick">
                <label className="sr" htmlFor={`rv-${t.id}`}>Where this belongs</label>
                <select id={`rv-${t.id}`} className="field" defaultValue="" onChange={(e) => void choose(t.id, t.name, e.target.value)}>
                  <option value="" disabled>Where does this belong?</option>
                  {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {who && (
                  <label className="always">
                    <input type="checkbox" checked={!!always[t.id]} onChange={(e) => setAlways({ ...always, [t.id]: e.target.checked })} />
                    Always for {who}
                  </label>
                )}
              </div>
            </div>
          );
        })}
        {queue.length > shown.length && <p className="sub" style={{ marginTop: 8 }}>{queue.length - shown.length} more after these.</p>}
      </div>
      {rules.length > 0 && (
        <details>
          <summary className="btn-text" style={{ paddingLeft: 0, display: 'inline-flex', alignItems: 'center' }}>Your rules ({rules.length})</summary>
          {rules.map((r) => (
            <div className="line" key={r.match}>
              <span>Payments to {r.match}: {options.find((o) => o.value === r.label)?.label ?? r.label}</span>
              <button type="button" className="btn-text btn-danger" onClick={() => setMeta('payeeRules', rules.filter((x) => x.match !== r.match))}>Remove</button>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}

// Pay yourself first: savings come off the top, spending gets what is left.
function SavingsFirst({ plan, budgetTotal, usualTotal, budgetedExport, onEdit }: { plan: SavingsPlan; budgetTotal: number; usualTotal: number; budgetedExport: number; onEdit: () => void }) {
  if (!plan.takeHome && !plan.saveFirst) return null;
  const rate = plan.takeHome ? Math.round((plan.saveFirst / plan.takeHome) * 100) : 0;
  const rest = plan.takeHome - plan.saveFirst - budgetTotal;
  const cut = usualTotal - budgetedExport;
  return (
    <section className="card" aria-labelledby="first-h" style={{ gridColumn: '1 / -1' }}>
      <div className="row row-wrap"><h2 className="h2" id="first-h">Savings first</h2><span className="tag t-health">{rate}% saved</span></div>
      <p className="body">On payday, {money(plan.saveFirst)} moves to your savings order before you spend anything. The budget below is what is left to live on.</p>
      <div className="plan-flow">
        <div><span className="lbl">Take home</span><span className="num">{money(plan.takeHome)}</span></div>
        <div><span className="lbl">Save first</span><span className="num good-text">{money(plan.saveFirst)}</span></div>
        <div><span className="lbl">Spending budget</span><span className="num">{money(budgetTotal)}</span></div>
        <div><span className="lbl">{rest >= 0 ? 'Left over' : 'Short'}</span><span className={`num${rest < 0 ? ' bad-text' : ''}`}>{money(Math.abs(rest))}</span></div>
      </div>
      {cut > 0 && <p className="note-box tone-good">This budget spends <strong>{money(cut)} less a month</strong> than you usually do, which is {money(cut * 12)} a year toward your goals.</p>}
      <div><EditButton label="Edit savings plan" onClick={onEdit} /></div>
    </section>
  );
}

// The whole travel year at a glance, so the trips can be weighed against the savings plan.
function TravelYear({ trips }: { trips: Trip[] }) {
  const upcoming = trips.filter((t) => !t.date || t.date >= todayISO());
  if (upcoming.length < 2) return null;
  const total = upcoming.reduce((a, t) => a + Math.max(0, t.cost - t.saved), 0);
  const monthlyNow = upcoming.reduce((a, t) => a + tripMonthly(t), 0);
  const byMonth = new Map<string, number>();
  upcoming.forEach((t) => { if (t.date) byMonth.set(t.date.slice(0, 7), (byMonth.get(t.date.slice(0, 7)) ?? 0) + t.cost); });
  const busiest = [...byMonth.entries()].sort((a, b) => b[1] - a[1])[0];
  const estimates = upcoming.filter((t) => t.estimate).length;
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return (
    <section className="card" aria-labelledby="ty-h">
      <div className="row row-wrap"><h2 className="h2" id="ty-h">Your travel year</h2><span className="sub">{upcoming.length} trips</span></div>
      <div className="plan-flow">
        <div><span className="lbl">Still to save</span><span className="num">{money(total)}</span></div>
        <div><span className="lbl">Needed a month right now</span><span className="num">{money(monthlyNow)}</span></div>
        {busiest && <div><span className="lbl">Busiest month</span><span className="num" style={{ fontSize: 22 }}>{MONTHS[Number(busiest[0].slice(5)) - 1]}</span><span className="sub">{money(busiest[1])} of trips</span></div>}
      </div>
      {estimates > 0 && <p className="sub">{estimates} of these costs are my estimates. Tap a trip below and type your real cost.</p>}
    </section>
  );
}
