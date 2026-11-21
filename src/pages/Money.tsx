import { useState } from 'react';
import { db, setMeta, uid, useMeta, useTable } from '../lib/db';
import { hrefFor, navigate } from '../lib/router';
import { addDays, daysLeftInMonth, money, monthName, pct, shortDate, todayISO } from '../lib/format';
import { affordCheck, budgetSpent, planTrip, savingsStatus, tripMonthly } from '../lib/calc';
import type { Account, Bill, BudgetCategory, MoneySnapshot, RoadmapItem, SavingsGoal, Trim, Trip, TripStatus } from '../lib/types';
import { Bar, Chips, EditButton, FileButton, useToast } from '../components/ui';
import { ListEditor, TableEditor, type FieldDef } from '../components/ListEditor';
import { BarChart, ProjectionChart, SERIES, SERIES_OTHER, StackedBar, type Segment } from '../components/Charts';
import { importExport, incomeByMonth, incomeSources, liveLeftToSpend, useExportSpend, type ImportSummary } from '../lib/money';
import { Sheet } from '../components/ui';
import { longDate } from '../lib/format';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Live numbers: budget spending from the export once it exists, otherwise what you entered.
export function useLiveMoney() {
  const budget = useTable(db.budget, 'order');
  const classes = useTable(db.classes);
  const snap = useMeta<MoneySnapshot>('moneySnapshot', EMPTY_SNAP);
  const { spent, txns, map } = useExportSpend();
  const spentFor = (c: BudgetCategory) => budgetSpent(c, classes, spent);
  const { left, live } = liveLeftToSpend(budget, spentFor, snap.leftToSpend);
  return { budget, classes, snap, spent, txns, map, spentFor, left, live };
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
  const soon = bills.filter((b) => b.due >= today && b.due <= addDays(today, 14));
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
        fields={[{ key: 'name', label: 'Bill' }, { key: 'due', label: 'Due', type: 'date' }, { key: 'amount', label: 'Amount', type: 'number' }]}
        itemName={(b) => b.name} addLabel="Add a bill" make={() => ({ name: '', due: todayISO(), amount: 0, note: '' })}
      />
    </div>
  );
}

const budgetFields: FieldDef<BudgetCategory>[] = [
  { key: 'label', label: 'Category' },
  { key: 'budget', label: 'Monthly budget', type: 'number' },
  { key: 'spent', label: 'Spent so far (manual only)', type: 'number' },
  { key: 'source', label: 'Spent comes from', type: 'select', options: [{ value: 'manual', label: 'Entered by me' }, { value: 'export', label: 'Rocket Money export' }, { value: 'classes', label: 'Health class log' }] }
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
  const { budget, classes, spentFor, left, live, txns, map, spent: exportSpent } = useLiveMoney();
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
      <section className="card" aria-labelledby="budget-h">
        <div className="row"><h2 className="h2" id="budget-h">{monthName()} budget</h2><span className="sub">{money(spentTotal)} of {money(budgetTotal)}</span></div>
        <div className="stack-s" style={{ gap: 12 }}>
          {rows.map(({ c, spent, over }) => (
            <div className="goal" key={c.id}>
              <div className="row">
                <span className="goal-t">{c.label}</span>
                <span style={{ fontSize: 12 }} className={over ? 'bad-text' : 'pct'}>{money(spent)} / {money(c.budget)}{over ? ', over' : ''}</span>
              </div>
              <Bar value={pct(spent, c.budget)} warn={over} />
              {c.source === 'classes' && <span className="sub">Pulled from your class log, {monthClasses} classes this month</span>}
              {c.source === 'export' && <span className="sub">From your Rocket Money export</span>}
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
  { key: 'due', label: 'Target date', type: 'date' }
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

  // Fixed color order: first savings goals, then trips. Anything past three folds into Other.
  const entities = [
    ...savings.map((g) => ({ key: g.id, label: g.name.split(',')[0], monthly: g.monthly })),
    { key: 'trips', label: 'Trip funds', monthly: Math.round(allMonthly) }
  ];
  const colorFor = (i: number) => SERIES[i] ?? SERIES_OTHER;
  const segments: Segment[] = entities.slice(0, 3).map((e, i) => ({ label: e.label, value: e.monthly, color: colorFor(i) }));
  const rest = entities.slice(3).reduce((a, e) => a + e.monthly, 0);
  if (rest > 0) segments.push({ label: 'Other goals', value: rest, color: SERIES_OTHER });
  const total = segments.reduce((a, x) => a + x.value, 0);

  return (
    <div className="stack">
      <section className="card" aria-labelledby="plan-h">
        <div className="row row-wrap"><h2 className="h2" id="plan-h">Where your monthly savings go</h2><span className="num" style={{ fontSize: 26 }}>{money(total)}<span className="unit">a month</span></span></div>
        <StackedBar label="Monthly savings plan" segments={segments} />
      </section>

      <div className="row row-wrap" style={{ alignItems: 'center' }}>
        <h2 className="h2">Savings goals</h2>
        <EditButton label="Edit savings goals" onClick={() => setEdit('savings')} />
      </div>
      <div className="grid2">
        {savings.map((g, i) => {
          const st = savingsStatus(g);
          return (
            <section className="card" key={g.id} aria-labelledby={`sg-${g.id}`}>
              <div className="row">
                <span className="goal-t" id={`sg-${g.id}`} style={{ fontSize: 15 }}>{g.name}</span>
                <span className={st.behind ? 'pct bad-text' : 'pct'}>{st.behind ? `Behind, ${st.pct}%` : `${st.pct}%`}</span>
              </div>
              <ProjectionChart title={g.name} saved={g.saved} target={g.target} monthly={g.monthly} due={g.due} color={colorFor(i)} />
              <span className="sub">{st.label}</span>
            </section>
          );
        })}
        <section className="card" aria-labelledby="sg-trips">
          <div className="row">
            <a className="goal-t" id="sg-trips" href={hrefFor('money', 'trips')} style={{ color: 'inherit', fontSize: 15 }}>Trip funds, all trips</a>
            <span className="pct">{tripPct}%</span>
          </div>
          <ProjectionChart title="Trip funds" saved={allSaved} target={allCost} monthly={allMonthly} due={lastTrip} color={colorFor(savings.length)} />
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
        itemName={(g) => g.name} addLabel="Add a savings goal" make={() => ({ order: savings.length + 1, name: '', target: 0, saved: 0, monthly: 0, due: '' })}
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
          <label htmlFor="tripcost" className="lbl">Total trip cost</label>
          <div className="money-input">
            <span aria-hidden="true">$</span>
            <input id="tripcost" type="number" inputMode="decimal" min={0} value={trip.cost || ''} placeholder="0" onChange={(e) => upd({ cost: Number(e.target.value) || 0 })} />
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
