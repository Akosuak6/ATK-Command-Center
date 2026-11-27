import { useEffect, useState } from 'react';
import { nextTripCover, useAutoTripCovers } from '../lib/covers';
import { db, setMeta, uid, useMeta, useTable } from '../lib/db';
import { navigate } from '../lib/router';
import { addDays, daysLeftInMonth, money, monthName, nextMonth, pct, sameMonth, shortDate, todayISO } from '../lib/format';
import { affordCheck, budgetSpent, cashLeft, savingsStatus, tripMonths } from '../lib/calc';
import type { PointsWallet, Account, BudgetCategory, MoneySnapshot, SavingsGoal, Trip, TripStatus } from '../lib/types';
import { Bar, Chips, EditButton, FileButton, useToast } from '../components/ui';
import { ListEditor, TableEditor, type FieldDef } from '../components/ListEditor';
import { BarChart, LineChart, ProjectionChart, SERIES, SERIES_OTHER, StackedBar, type Segment } from '../components/Charts';
import { SPECIAL, usualByLabel, type SavingsPlan, importExport, incomeByMonth, incomeSources, liveLeftToSpend, useExportSpend, type ImportSummary } from '../lib/money';
import { Sheet } from '../components/ui';
import { longDate } from '../lib/format';
import { coastAge, coastNumberAt, fiNumber, projectFire, realFrom, type FireInputs } from '../lib/fire';
import { QUARTER_ENDS, flowSavings, flowStatus, inFlow } from '../lib/savingsFlow';
import { incomeQuips, moneyQuips } from '../lib/quips';
import { TripLinks } from '../components/TripLinks';

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
  const q = incomeQuips({ thisMonth: cur.total, lastMonth: prev.total, average: avg, year: ytd, monthsWithIncome: months.filter((m) => m.month.startsWith(thisKey.slice(0, 4)) && m.total > 0).length });
  return (
    <section className="card" aria-labelledby="income-h">
      <div className="row row-wrap"><h2 className="h2" id="income-h">Income</h2><span className="sub">From your Rocket Money export</span></div>
      <div className="stats stats-tight">
        <div className="stat"><span className="lbl">This month so far</span><span className="num">{money(cur.total)}</span><span className="sub quip">{q.thisMonth}</span></div>
        <div className="stat"><span className="lbl">Last month</span><span className="num">{money(prev.total)}</span><span className="sub quip">{q.last}</span></div>
        <div className="stat"><span className="lbl">Monthly average</span><span className="num">{money(avg)}</span><span className="sub quip">{q.avg}</span></div>
        <div className="stat"><span className="lbl">This year</span><span className="num">{money(ytd)}</span><span className="sub quip">{q.year}</span></div>
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
  { key: 'asOf', label: 'Last export date', type: 'date' },
  { key: 'transactions', label: 'Transactions in last export', type: 'number' },
  { key: 'covers', label: 'Accounts covered', wide: true }
];

export function MoneyOverview() {
  const { snap, left } = useLiveMoney();
  const accounts = useTable(db.accounts, 'order');
  const history = useTable(db.history, 'date');
  const toast = useToast();
  const [edit, setEdit] = useState<'' | 'snap' | 'accounts'>('');
  // Net worth is every account added up (debt is negative). The change compares with the first
  // saved day of this month, so it only appears once real history from before today exists.
  const netWorth = accounts.reduce((t, a) => t + a.balance, 0);
  const monthStart = history.find((h) => !h.sample && sameMonth(h.date) && h.date < todayISO());
  const netChange = monthStart ? netWorth - monthStart.money.accountsTotal : null;
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
  const due = snap.asOf ? nextMonth(snap.asOf) : '';
  const daysLeft = daysLeftInMonth();
  // Savings rate from your plan: what you save (savings first plus paycheck contributions like the 401k)
  // out of everything you earn (take home plus those contributions).
  const plan = useMeta<SavingsPlan>('savingsPlan', { takeHome: 0, saveFirst: 0 });
  const savingsGoals = useTable(db.savings, 'order');
  const goals = useTable(db.goals, 'order');
  const fromPay = savingsGoals.filter((g) => g.fromPaycheck && g.contributing !== false).reduce((a, g) => a + g.monthly, 0);
  const savingsRate = plan.takeHome > 0 ? Math.round(((plan.saveFirst + fromPay) / (plan.takeHome + fromPay)) * 100) : snap.savingsRate;
  const netGoal = goals.find((g) => g.link === 'networth' && !g.achieved)?.target ?? 0;
  const q = moneyQuips({ left, daysLeft, savingsRate, netWorth, netChange, netGoal });

  return (
    <div className="stack">
      <section aria-label="Key numbers" className="stats">
        <div className="stat"><span className="lbl">Left to spend</span><span className="num">{money(left)}</span><span className="sub quip">{q.left}</span></div>
        <div className="stat"><span className="lbl">Savings rate</span><span className="num">{savingsRate}%</span><span className="sub quip">{q.rate}</span></div>
        <div className="stat"><span className="lbl">Net worth</span><span className="num">{money(netWorth)}</span><span className="sub quip">{q.worth}</span></div>      </section>
      <div style={{ marginTop: -8 }}><EditButton label="Edit key numbers" onClick={() => setEdit('snap')} /></div>
      <IncomeSection />
      <div className="grid2">
        <section className="card" aria-labelledby="export-h">
          <div className="row"><h2 className="h2" id="export-h">Monthly export</h2>{due && <span className="tag t-money">Due {shortDate(due)}</span>}</div>
          <p className="body">Once a month, export your transactions from Rocket Money (CSV or Excel) and drop it here. Budgets, income and goals all update from it. Importing the same dates again never doubles anything.</p>
          <div>
            <div className="line"><span>Last export</span><span style={{ fontWeight: 600 }}>{snap.asOf ? `${shortDate(snap.asOf)} · ${snap.transactions} transactions` : 'None yet'}</span></div>
            <div className="line"><span>Covers</span><span style={{ fontWeight: 600, textAlign: 'right' }}>{snap.covers || 'Not set'}</span></div>
          </div>
          <FileButton label={importing ? 'Reading your export' : "Upload this month's export"} accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onFile={(f) => void onExport(f)} />
        </section>
        <section className="card" aria-labelledby="acct-h">
          <div className="row"><h2 className="h2" id="acct-h">Accounts</h2><span className="sub">Net worth {money(accounts.reduce((s, a) => s + a.balance, 0))}</span></div>
          <div>
            {(['Cash', 'Savings', 'Investments', 'Retirement', 'Debt'] as const).map((g) => {
              const rows = accounts.filter((a) => (a.group ?? (a.balance < 0 ? 'Debt' : 'Cash')) === g);
              if (!rows.length) return null;
              return (
                <div key={g} className="acct-group">
                  <div className="row"><span className="lbl">{g}</span><span className="lbl">{money(rows.reduce((s, a) => s + a.balance, 0))}</span></div>
                  {rows.map((a) => (
                    <div className="line" key={a.id}>
                      <span className="line-main"><span>{a.name}</span>{a.institution && <span className="sub">{a.institution}</span>}</span>
                      <span style={{ fontWeight: 600 }}>{money(a.balance)}</span>
                    </div>
                  ))}
                </div>
              );
            })}
            {accounts.length === 0 && <p className="empty">No accounts yet.</p>}
          </div>
          {accounts[0]?.asOf && <span className="sub">Balances as of {shortDate(accounts[0].asOf)}. Update them with Edit when you check Rocket Money.</span>}
          <EditButton label="Edit accounts" onClick={() => setEdit('accounts')} />
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
        fields={[{ key: 'name', label: 'Account' }, { key: 'balance', label: 'Balance (negative for debt)', type: 'number' }, { key: 'group', label: 'Kind', type: 'select', options: ['Cash', 'Savings', 'Investments', 'Retirement', 'Debt'].map((v) => ({ value: v, label: v })) }, { key: 'institution', label: 'Bank or broker' }, { key: 'asOf', label: 'Balance as of', type: 'date' }]}
        itemName={(a) => a.name} addLabel="Add an account" make={() => ({ order: accounts.length + 1, name: '', balance: 0 })}
      />
    </div>
  );
}

const budgetFields: FieldDef<BudgetCategory>[] = [
  { key: 'label', label: 'Category' },
  { key: 'budget', label: 'Monthly budget', type: 'number' },
  { key: 'spent', label: 'Spent so far (manual only)', type: 'number' },
  { key: 'source', label: 'Spent comes from', type: 'select', options: [{ value: 'manual', label: 'Entered by me' }, { value: 'export', label: 'Rocket Money export' }, { value: 'fixed', label: 'Fixed bill, paid every month' }, { value: 'classes', label: 'Health class log' }] },
  { key: 'credit', label: 'Paid back by work each month (like a wellness credit)', type: 'number' },
  { key: 'note', label: 'Note', wide: true }
];

// Your savings, flowing through the goals in order (see savingsFlow.ts). Trips are paid from the
// travel vault, so they do not take their own share.
export function useSavingsFlow() {
  const savings = useTable(db.savings, 'order');
  const plan = useMeta<SavingsPlan>('savingsPlan', { takeHome: 0, saveFirst: 0 });
  const perMonth = Math.max(0, plan.saveFirst);
  return { savings, plan, perMonth, flow: flowSavings(savings, perMonth) };
}

// The goal trips are paid from: the savings goal marked to refill quarterly, or one named like a travel vault.
export const isTravelVault = (g: SavingsGoal) => g.refill === 'quarterly' || /travel|trip/i.test(g.name);

export function useImpactGoals() {
  const { savings, flow } = useSavingsFlow();
  return savings.map((s) => ({ name: s.name.split(',')[0], monthly: s.fromPaycheck ? s.monthly : flow.get(s.id)?.now ?? 0 }));
}

// A short reminder at the top of the budget, a different one each month.
const BUDGET_QUOTES = [
  { text: 'Do not save what is left after spending, but spend what is left after saving.', by: 'Warren Buffett' },
  { text: 'Beware of little expenses. A small leak will sink a great ship.', by: 'Benjamin Franklin' },
  { text: 'The secret of getting ahead is getting started.', by: 'Often credited to Mark Twain' }
];

function BudgetQuote() {
  const q = BUDGET_QUOTES[new Date().getMonth() % BUDGET_QUOTES.length];
  return (
    <figure className="quote budget-quote">
      <blockquote><span className="chrome-text">"{q.text}"</span></blockquote>
      <figcaption>{q.by}</figcaption>
    </figure>
  );
}

export function MoneyBudget() {
  const { budget, spentFor, left, live, txns, map, rules, spent: exportSpent } = useLiveMoney();
  const usual = usualByLabel(txns, map, rules);
  const plan = useMeta<SavingsPlan>('savingsPlan', { takeHome: 0, saveFirst: 0 });
  const [editPlan, setEditPlan] = useState(false);
  const impactGoals = useImpactGoals();
  const [editing, setEditing] = useState(false);
  const [mapping, setMapping] = useState(false);
  const [price, setPrice] = useState(350);
  const [catId, setCatId] = useState('');

  let spentTotal = 0;
  let budgetTotal = 0;
  const rows = budget.map((c) => {
    const spent = spentFor(c);
    spentTotal += spent;
    budgetTotal += c.budget;
    return { c, spent, over: spent > c.budget };
  });
  // Spending categories you can buy things in (fixed bills like rent are left out).
  const buyable = rows.filter(({ c }) => c.source !== 'fixed');
  const picked = buyable.find(({ c }) => c.id === catId) ?? buyable[0];
  const result = affordCheck(price, left, impactGoals, daysLeftInMonth(), picked ? { label: picked.c.label, left: picked.c.budget - picked.spent } : undefined);
  const seenCats = [...new Set(txns.filter((t) => t.kind === 'spend').map((t) => t.category))].sort();
  const unmapped = exportSpent['Unmapped'] ?? 0;

  return (
    <div className="grid2">
      <BudgetQuote />
      <SavingsFirst plan={plan} budgetTotal={budgetTotal - budget.reduce((a, c) => a + (c.credit ?? 0), 0)} usualTotal={budget.reduce((a, c) => a + (c.source === 'export' ? usual[c.label] ?? 0 : 0), 0)} budgetedExport={budget.reduce((a, c) => a + (c.source === 'export' ? c.budget : 0), 0)} onEdit={() => setEditPlan(true)} />
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
              <Bar value={pct(spent, c.budget)} warn={over} />
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
        <p className="body">Pick what kind of purchase it is and type the price. It checks that budget first, then the rest of the month, then your goals.</p>
        {buyable.length > 0 && <>
          <span className="lbl" id="afford-cat">What it is</span>
          <Chips label="What it is" value={picked?.c.id ?? ''} onChange={setCatId} options={buyable.map(({ c }) => ({ value: c.id, label: c.label }))} />
        </>}
        <label htmlFor="price" className="lbl">Purchase price</label>
        <div className="money-input">
          <span aria-hidden="true">$</span>
          <input id="price" type="number" inputMode="decimal" min={0} value={price || ''} placeholder="0" onChange={(e) => setPrice(Number(e.target.value) || 0)} />
        </div>
        <div className="chips" role="group" aria-label="Preset prices">
          {[80, 350, 900, 2400].map((n) => <button key={n} type="button" className="preset" onClick={() => setPrice(n)}>{money(n)}</button>)}
        </div>
        <div className={`verdict tone-${result.tone}`} aria-live="polite">
          <span className="lbl">Verdict · {picked ? `${money(Math.max(0, picked.c.budget - picked.spent))} left for ${picked.c.label.toLowerCase()}, ` : ''}{left < 0 ? `${money(-left)} over for the month` : `${money(left)} left this month`}{live ? ', live' : ''}</span>
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
  { key: 'saved', label: 'Already paid (deposits, flights)', type: 'number' },
  { key: 'monthly', label: 'Monthly amount, only for paycheck contributions like a 401k (other goals fill in order)', type: 'number', wide: true },
  { key: 'due', label: 'Target date', type: 'date' },
  { key: 'kind', label: 'Kind', type: 'select', options: [{ value: 'retirement', label: 'Retirement (401k, IRA)' }, { value: 'savings', label: 'Savings' }, { value: 'brokerage', label: 'Brokerage' }, { value: 'other', label: 'Other' }] },
  { key: 'contributing', label: 'Still contributing', type: 'checkbox' },
  { key: 'fromPaycheck', label: 'Comes out of my paycheck (like a 401k)', type: 'checkbox' },
  { key: 'order', label: 'Priority (1 gets money first)', type: 'number' },
  { key: 'note', label: 'Note', wide: true }
];


export function MoneyGoals() {
  const savings = useTable(db.savings, 'order');
  const [edit, setEdit] = useState<'' | 'savings'>('');
  // A quarterly goal remembers the day it was first full; from then on it only tops up at quarter ends.
  useEffect(() => {
    for (const g of savings) if (g.refill === 'quarterly' && !g.builtAt && g.target > 0 && g.saved >= g.target) void db.savings.update(g.id, { builtAt: todayISO() });
  }, [savings]);

  // Three kinds, in your order of priority: retirement levers first, then savings, then brokerage.
  const KIND_LABEL: Record<string, string> = { retirement: 'Retirement', savings: 'Savings', brokerage: 'Brokerage', other: 'Other goals' };
  const kindOf = (g: SavingsGoal) => g.kind ?? (/401|ira|roth|retire/i.test(g.name) ? 'retirement' : /brokerage|invest/i.test(g.name) ? 'brokerage' : 'savings');
  const payroll = savings.filter((g) => g.contributing !== false && g.fromPaycheck);
  const { flow, perMonth } = useSavingsFlow();
  const nowFor = (g: SavingsGoal) => flow.get(g.id)?.now ?? 0;
  const isFull = (g: SavingsGoal) => g.target > 0 && g.saved >= g.target;
  const full = savings.filter((g) => inFlow(g) && isFull(g));
  const active = savings.filter((g) => inFlow(g) && !isFull(g));
  const byKind = (k: string) => active.filter((g) => kindOf(g) === k).reduce((a, g) => a + nowFor(g), 0);
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
                {nowFor(g) > 0 ? <span className="lever-amt">{money(nowFor(g))}</span> : <span className="sub lever-amt">{flow.get(g.id)?.startsIn != null ? 'Next' : '$0'}</span>}
              </li>
            ))}
          </ol>
          {full.map((g) => (
            <p className="sub" key={g.id} style={{ marginTop: 8 }}><strong className="good-text">{g.name} is full</strong> at {money(g.saved)}, so its share moves on. If you use some, it refills first.</p>
          ))}
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
          const st = g.fromPaycheck || g.contributing === false ? savingsStatus(g) : flowStatus(g, flow.get(g.id), perMonth);
          const chart = g.contributing !== false && g.target > 0 && g.saved < g.target && (g.fromPaycheck ? g.monthly : nowFor(g)) > 0;
          return (
            <section className="card" key={g.id} aria-labelledby={`sg-${g.id}`}>
              <div className="row">
                <span className="goal-t" id={`sg-${g.id}`} style={{ fontSize: 15 }}>{g.name}</span>
                <span className="chips" style={{ gap: 6 }}>
                  <span className="tag t-plain">{g.contributing === false ? 'Not contributing' : KIND_LABEL[kindOf(g)]}</span>
                  {chart && <span className={st.behind ? 'pct bad-text' : 'pct'}>{st.behind ? `Behind, ${st.pct}%` : `${st.pct}%`}</span>}
                </span>
              </div>
              {chart ? <ProjectionChart title={g.name} saved={g.saved} target={g.target} monthly={g.fromPaycheck ? g.monthly : nowFor(g)} due={g.due} color={colorFor(g)} rate={kindOf(g) === 'savings' ? 0 : 5} />
                : <span className="num">{money(g.saved)}</span>}
              <span className="sub">{st.label}</span>
            </section>
          );
        })}
      </div>

      <CoastFire />

      <TableEditor<SavingsGoal>
        title="Edit savings goals" open={edit === 'savings'} onClose={() => setEdit('')} table={db.savings} rows={savings} fields={savingsFields}
        itemName={(g) => g.name} addLabel="Add a savings goal" make={() => ({ order: savings.length + 1, name: '', target: 0, saved: 0, monthly: 0, due: '', kind: 'savings', contributing: true })}
      />
    </div>
  );
}

const STATUSES: TripStatus[] = ['Booked', 'Planning', 'Dreaming'];
const tripFields: FieldDef<Trip>[] = [
  { key: 'name', label: 'Trip', wide: true },
  { key: 'status', label: 'Status', type: 'select', options: STATUSES.map((s) => ({ value: s, label: s })) },
  { key: 'date', label: 'First day', type: 'date' },
  { key: 'endDate', label: 'Last day', type: 'date' },
  { key: 'cost', label: 'Total cost', type: 'number' },
  { key: 'saved', label: 'Saved so far', type: 'number' },
  { key: 'whoPaid', label: 'Who paid', type: 'textarea', wide: true, placeholder: 'e.g. I paid the Airbnb, Maya owes me $220. Jess booked the lift tickets' },
  { key: 'photo', label: 'Photo of the trip (also shows on your vision board)', type: 'image' }
];

const tripDates = (t: Trip) => {
  if (!t.date) return '';
  if (!t.endDate || t.endDate === t.date) return longDate(t.date);
  const a = new Date(`${t.date}T12:00:00`);
  const b = new Date(`${t.endDate}T12:00:00`);
  const nights = Math.round((b.getTime() - a.getTime()) / 86400000);
  const mon = (d: Date) => d.toLocaleString('en-US', { month: 'short' });
  const sameYear = a.getFullYear() === b.getFullYear();
  // Feb 18 to 21, 2027 · Feb 26 to Mar 2, 2027 · Dec 30, 2026 to Jan 3, 2027
  const from = `${mon(a)} ${a.getDate()}${sameYear ? '' : `, ${a.getFullYear()}`}`;
  const to = `${sameYear && a.getMonth() === b.getMonth() ? '' : `${mon(b)} `}${b.getDate()}, ${b.getFullYear()}`;
  return `${from} to ${to}${nights > 0 ? `, ${nights} night${nights === 1 ? '' : 's'}` : ''}`;
};
// Trips are paid from the travel vault. It refills to its target at each quarter end, so every
// quarter starts with a full vault (once it is built) and the trips in that quarter share it.
const quarterKey = (iso: string) => `${iso.slice(0, 4)}-Q${Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1}`;
const QUARTER_NAMES = ['Jan to Mar', 'Apr to Jun', 'Jul to Sep', 'Oct to Dec'];
const quarterLabel = (key: string) => `${QUARTER_NAMES[Number(key.slice(-1)) - 1]} ${key.slice(0, 4)}`;
const quarterEnd = (key: string) => ['Mar 31', 'Jun 30', 'Sep 30', 'Dec 31'][Number(key.slice(-1)) - 1];

// One payment from the vault: a trip itself, or an extra like a gift that is due on another date.
interface VaultEntry { trip: Trip; label: string; amount: number; date: string }
interface VaultQuarter { key: string; entries: VaultEntry[]; trips: Trip[]; cash: number; start: number; left: number }

function useVaultPlan(trips: Trip[]) {
  const { savings, flow, perMonth } = useSavingsFlow();
  const vault = savings.find(isTravelVault);
  const today = todayISO();
  const now = quarterKey(today);
  const entries: VaultEntry[] = trips.flatMap((t) => [
    ...(t.date && t.date >= today ? [{ trip: t, label: t.name, amount: cashLeft(t), date: t.date }] : []),
    ...(t.extras ?? []).filter((x) => x.due >= today).map((x) => ({ trip: t, label: `${t.name}: ${x.label}`, amount: x.amount, date: x.due }))
  ]);
  const keys = [...new Set(entries.map((e) => quarterKey(e.date)))].sort();
  const quarters: VaultQuarter[] = keys.map((key) => {
    const qe = entries.filter((e) => quarterKey(e.date) === key);
    const cash = qe.reduce((a, e) => a + e.amount, 0);
    // This quarter uses what is in the vault today; later quarters start refilled to the target.
    const start = key === now ? vault?.saved ?? 0 : vault?.target ?? 0;
    return { key, entries: qe, trips: [...new Set(qe.map((e) => e.trip))], cash, start, left: start - cash };
  });
  return { vault, quarters, status: vault ? flowStatus(vault, flow.get(vault.id), perMonth) : null };
}

function VaultPlan({ trips }: { trips: Trip[] }) {
  const { vault, quarters, status } = useVaultPlan(trips);
  if (!vault) return null;
  return (
    <section className="card" aria-labelledby="vault-h">
      <div className="row row-wrap"><h2 className="h2" id="vault-h">Travel vault</h2><span className="sub">Tops back up to {money(vault.target)} on {QUARTER_ENDS}</span></div>
      <div className="plan-flow">
        <div><span className="lbl">In the vault now</span><span className="num">{money(vault.saved)}</span>{status && <span className="sub">{status.label.split(' · ').slice(1).join(' · ')}</span>}</div>
        {quarters.map((q) => (
          <div key={q.key}>
            <span className="lbl">{quarterLabel(q.key)}</span>
            <span className={`num${q.left < 0 ? ' bad-text' : ''}`}>{q.left < 0 ? `${money(-q.left)} over` : `${money(q.left)} left`}</span>
            <span className="sub">{q.entries.filter((e) => e.amount > 0 || q.cash === 0).map((e) => `${e.label} ${money(e.amount)}`).join(', ')}</span>
          </div>
        ))}
      </div>
      {quarters.length === 0 && <p className="empty">No upcoming trips yet. Add one below and it shows which quarter's vault pays for it.</p>}
      {quarters.some((q) => q.left < 0) && <p className="note-box tone-over">A quarter's trips cost more than the vault holds. Move a trip to another quarter, use points, or top up from savings before you book.</p>}
    </section>
  );
}

export function TripPlanner({ tripId }: { tripId?: string }) {
  const wallet = useMeta<PointsWallet>('points', { card: 'Chase Sapphire Preferred', balance: 0, centsPerPoint: 1 });
  const trips = useTable(db.trips, 'date');
  useAutoTripCovers(trips);
  const [findingCover, setFindingCover] = useState(false);
  const toast = useToast();
  const [edit, setEdit] = useState<'' | 'trip'>('');
  const trip = trips.find((t) => t.id === tripId) ?? trips[0];
  const { quarters } = useVaultPlan(trips);

  const addTrip = async () => {
    const id = uid();
    await db.trips.add({ id, name: 'New trip', cost: 1000, saved: 0, status: 'Dreaming', date: addDays(todayISO(), 90) });
    navigate('money', 'trips', id);
    setEdit('trip');
  };

  if (!trip) {
    return (
      <div className="stack">
        <VaultPlan trips={trips} />
        <section className="card"><h2 className="h2">No trips yet</h2><p className="body">Add a trip to see how it fits in your travel vault. It also shows on your vision board.</p><button type="button" className="btn" onClick={addTrip}>Add a trip</button></section>
      </div>
    );
  }

  const assignedPoints = trips.reduce((x, t) => x + (t.points ?? 0), 0);
  const upd = (patch: Partial<Trip>) => db.trips.update(trip.id, patch);
  const months = tripMonths(trip);
  const fromVault = cashLeft(trip);
  const q = trip.date ? quarters.find((x) => x.key === quarterKey(trip.date)) : undefined;
  const past = !!trip.date && trip.date < todayISO();

  return (
    <div className="stack">
      <VaultPlan trips={trips} />
      <TravelYear trips={trips} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <Chips label="Choose a trip" value={trip.id} onChange={(id) => navigate('money', 'trips', id)} options={trips.map((t) => ({ value: t.id, label: t.name }))} />
        <button type="button" className="btn-text" onClick={addTrip}>Add a trip</button>
      </div>
      <section className="card trip-card" aria-labelledby="trip-h">
        <div className="trip-col">
          {trip.photo && <img className="trip-photo" src={trip.photo} alt={`${trip.name}`} />}
          {(!trip.photo || trip.photoCredit) && (
            <span className="trip-photo-credit">
              {trip.photoCredit ? <>Photo: {trip.photoCredit}. </> : null}
              <button type="button" className="btn-text" style={{ padding: 0, minHeight: 0, fontSize: 'inherit' }} disabled={findingCover}
                onClick={async () => { setFindingCover(true); const ok = await nextTripCover(trip); setFindingCover(false); if (!ok) toast('No other photo found. Add your own with Edit.'); }}>
                {findingCover ? 'Looking' : trip.photo ? 'Try another cover' : 'Find a cover'}
              </button>
            </span>
          )}
          <span className="lbl">{trip.status} · on your Social calendar</span>
          <div className="row" style={{ alignItems: 'center' }}>
            <h2 className="h2" id="trip-h" style={{ fontSize: 28 }}>{trip.name}</h2>
            <EditButton label={`Edit ${trip.name}`} onClick={() => setEdit('trip')} />
          </div>
          {trip.date && <span className="sub">{tripDates(trip)} · {past ? 'done' : trip.date === todayISO() ? 'starts today' : `${months} month${months === 1 ? '' : 's'} away`}</span>}
          {trip.whoPaid && <p className="note-box tone-tight" style={{ whiteSpace: 'pre-line' }}><strong>Who paid:</strong> {trip.whoPaid}</p>}
          <label htmlFor="tripcost" className="lbl">Total trip cost{trip.estimate ? ' (my estimate, change it to your real number)' : ''}</label>
          <div className="money-input">
            <span aria-hidden="true">$</span>
            <input id="tripcost" type="number" inputMode="decimal" min={0} value={trip.cost || ''} placeholder="0" onChange={(e) => upd({ cost: Number(e.target.value) || 0, estimate: false })} />
          </div>
          <label htmlFor="tripsaved" className="lbl">Already paid (deposits, flights)</label>
          <div className="money-input">
            <span aria-hidden="true">$</span>
            <input id="tripsaved" type="number" inputMode="decimal" min={0} value={trip.saved || ''} placeholder="0" onChange={(e) => upd({ saved: Number(e.target.value) || 0 })} />
          </div>
          {wallet.balance > 0 && <>
          <label htmlFor="trippoints" className="lbl">{wallet.card} points to use{trip.points ? `, worth about ${money(trip.pointsValue ?? 0)}` : ''}</label>
          <div className="money-input">
            <input id="trippoints" type="number" inputMode="numeric" min={0} value={trip.points || ''} placeholder="0 points"
              onChange={(e) => { const pts = Number(e.target.value) || 0; void upd({ points: pts, pointsValue: Math.round((pts * wallet.centsPerPoint) / 100) }); }} />
          </div>
          <span className="sub">{(wallet.balance - assignedPoints + (trip.points ?? 0)).toLocaleString('en-US')} points free to use{assignedPoints > wallet.balance ? `, ${(assignedPoints - wallet.balance).toLocaleString('en-US')} more assigned than you have` : ''}</span>
          </>}
        </div>
        <div className="trip-col" style={{ gap: 10 }}>
          <div className="row"><span className="lbl">From your travel vault</span><span style={{ fontFamily: 'var(--serif)', fontSize: 30, fontWeight: 500 }}>{money(fromVault)}</span></div>
          <span className="sub">{money(trip.cost)} trip{trip.saved ? `, minus ${money(trip.saved)} already paid` : ''}{trip.pointsValue ? `, minus ${money(trip.pointsValue)} in points` : ''}</span>
          {past ? (
            <p className="note-box tone-tight">This trip is done. The vault tops back up on the next quarter end.</p>
          ) : q ? (
            <div className={`note-box ${q.left < 0 ? 'tone-over' : 'tone-good'}`} aria-live="polite">
              <strong>{quarterLabel(q.key)}{q.left < 0 ? `: ${money(-q.left)} over the vault.` : `: fits, ${money(q.left)} left in the vault.`}</strong>{' '}
              {q.trips.length > 1 ? `Shared with ${q.trips.filter((t) => t.id !== trip.id).map((t) => t.name).join(', ')}. ` : ''}
              The vault tops back up on {quarterEnd(q.key)}.
            </div>
          ) : (
            <p className="sub">Add a first day to see which quarter's vault pays for it.</p>
          )}
          {(trip.extras ?? []).map((x) => {
            const xq = quarters.find((qq) => qq.key === quarterKey(x.due));
            return (
              <div key={x.label} className={`note-box ${xq && xq.left < 0 ? 'tone-over' : 'tone-tight'}`}>
                <strong>Also from the vault: {x.label}, {money(x.amount)} by {shortDate(x.due)}.</strong>{' '}
                {x.due < todayISO() ? 'Done.' : xq ? (xq.left < 0 ? `The ${quarterLabel(xq.key)} vault is ${money(-xq.left)} short, so fund it before then.` : `Fits the ${quarterLabel(xq.key)} vault.`) : ''}
              </div>
            );
          })}
        </div>
      </section>
      <section className="card" aria-label={`Saved about ${trip.name}`}>
        <TripLinks trip={trip} />
      </section>
      <TableEditor<Trip>
        title="Edit trip" open={edit === 'trip'} onClose={() => setEdit('')} table={db.trips} rows={[trip]} fields={tripFields}
        itemName={(t) => t.name}
      />
    </div>
  );
}

// Pay yourself first: savings come off the top, spending gets what is left.
function SavingsFirst({ plan, budgetTotal, usualTotal, budgetedExport, onEdit }: { plan: SavingsPlan; budgetTotal: number; usualTotal: number; budgetedExport: number; onEdit: () => void }) {
  if (!plan.takeHome && !plan.saveFirst) return null;
  const rate = plan.takeHome ? Math.round((plan.saveFirst / plan.takeHome) * 100) : 0;
  const rest = plan.takeHome - plan.saveFirst - budgetTotal;
  const cut = usualTotal - budgetedExport;
  return (
    <section className="card full" aria-labelledby="first-h">
      <div className="row row-wrap"><h2 className="h2" id="first-h">Savings first</h2><span className="tag t-health">{rate}% saved</span></div>
      <p className="body">On payday, {money(plan.saveFirst)} moves to your savings order before you spend anything. The budget below is what is left to live on.</p>
      <div className="plan-flow">
        <div><span className="lbl">Take home</span><span className="num">{money(plan.takeHome)}</span></div>
        <div><span className="lbl">Save first</span><span className="num good-text">{money(plan.saveFirst)}</span></div>
        <div><span className="lbl">Spending from your pay</span><span className="num">{money(budgetTotal)}</span></div>
        <div><span className="lbl">{rest >= 0 ? 'Left over' : 'Short'}</span><span className={`num${rest < 0 ? ' bad-text' : ''}`}>{money(Math.abs(rest))}</span></div>
      </div>
      {cut > 0 && <p className="note-box tone-good">This budget spends <strong>{money(cut)} less a month</strong> than you usually do, which is {money(cut * 12)} a year toward your goals.</p>}
      <div><EditButton label="Edit savings plan" onClick={onEdit} /></div>
    </section>
  );
}

// The whole travel year at a glance, so the trips can be weighed against the savings plan.
function TravelYear({ trips }: { trips: Trip[] }) {
  const wallet = useMeta<PointsWallet>('points', { card: 'Chase Sapphire Preferred', balance: 0, centsPerPoint: 1 });
  const [editWallet, setEditWallet] = useState(false);
  const upcoming = trips.filter((t) => !t.date || t.date >= todayISO());
  if (upcoming.length === 0) return null;
  const total = upcoming.reduce((a, t) => a + cashLeft(t), 0);
  const ptsUsed = upcoming.reduce((a, t) => a + (t.points ?? 0), 0);
  const ptsValue = upcoming.reduce((a, t) => a + (t.pointsValue ?? 0), 0);
  const allCost = upcoming.reduce((a, t) => a + t.cost, 0);
  const byMonth = new Map<string, number>();
  upcoming.forEach((t) => { if (t.date) byMonth.set(t.date.slice(0, 7), (byMonth.get(t.date.slice(0, 7)) ?? 0) + t.cost); });
  const busiest = [...byMonth.entries()].sort((a, b) => b[1] - a[1])[0];
  const estimates = upcoming.filter((t) => t.estimate).length;
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return (
    <section className="card" aria-labelledby="ty-h">
      <div className="row row-wrap"><h2 className="h2" id="ty-h">Your travel year</h2><span className="sub">{upcoming.length} trip{upcoming.length === 1 ? "" : "s"}</span></div>
      <div className="plan-flow">
        <div><span className="lbl">Trips coming up</span><span className="num">{money(allCost)}</span><span className="sub">{upcoming.length} trip{upcoming.length === 1 ? '' : 's'} in total</span></div>
        <div><span className="lbl">From the travel vault</span><span className="num">{money(total)}</span><span className="sub">After what is paid and points</span></div>
        {wallet.balance > 0 && <div><span className="lbl">Covered by points</span><span className="num">{money(ptsValue)}</span><span className="sub">{ptsUsed.toLocaleString('en-US')} of {wallet.balance.toLocaleString('en-US')} points</span></div>}
        {busiest && <div><span className="lbl">Busiest month</span><span className="num" style={{ fontSize: 22 }}>{MONTHS[Number(busiest[0].slice(5)) - 1]}</span><span className="sub">{money(busiest[1])} of trips</span></div>}
      </div>
      {estimates > 0 && <p className="sub">{estimates} of these costs are my estimates. Tap a trip below and type your real cost.</p>}
      {wallet.balance > 0
        ? <p className="sub">Points are valued at {wallet.centsPerPoint} cent{wallet.centsPerPoint === 1 ? '' : 's'} each, a careful number. Transfers to airline and hotel partners can be worth more.</p>
        : null}
      <div><button type="button" className="btn-text" style={{ paddingLeft: 0 }} onClick={() => setEditWallet(true)}>{wallet.balance > 0 ? 'Edit points' : 'Using card points? Add your balance'}</button></div>
      <ListEditor<PointsWallet & { id: string }>
        title="Points" open={editWallet} onClose={() => setEditWallet(false)} rows={[{ id: 'points', ...wallet }]}
        fields={[{ key: 'card', label: 'Card' }, { key: 'balance', label: 'Points balance', type: 'number' }, { key: 'centsPerPoint', label: 'Cents each point is worth', type: 'number' }]}
        onSave={({ id: _id, ...rest }) => setMeta('points', rest)}
      />
    </section>
  );
}

// marketReturn and inflation replace the older single realReturn; older saves fall back to realReturn + 3.
interface FireSettings { age: number; retireAge: number; spending: number; withdrawal: number; realReturn: number; match: number; marketReturn?: number; inflation?: number; drop?: number }

// Coast FIRE: the point where growth alone carries your investments to your retirement number.
function CoastFire() {
  const accounts = useTable(db.accounts, 'order');
  const savings = useTable(db.savings, 'order');
  const fire = useMeta<FireSettings>('fire', { age: 0, retireAge: 55, spending: 0, withdrawal: 4, realReturn: 5, match: 0 });
  const plan = useMeta<SavingsPlan>('savingsPlan', { takeHome: 0, saveFirst: 0 });
  const [edit, setEdit] = useState(false);
  const invested = accounts.filter((a) => a.group === 'Investments' || a.group === 'Retirement').reduce((s, a) => s + a.balance, 0);
  // Long run, once the goals ahead of it are full, a brokerage gets its steady share of your savings.
  const { flow } = useSavingsFlow();
  const yearly = savings.filter((g) => g.contributing !== false && (g.fromPaycheck || g.kind === 'retirement' || g.kind === 'brokerage'))
    .reduce((s, g) => s + (g.fromPaycheck ? g.monthly : flow.get(g.id)?.steady ?? 0) * 12, 0) + (fire.match || 0);
  const spending = fire.spending || Math.round(((plan.takeHome - plan.saveFirst) * 12) / 1000) * 1000;
  const save = (patch: Partial<FireSettings>) => setMeta('fire', { ...fire, ...patch });

  if (!fire.age) {
    return (
      <section className="card" aria-labelledby="fire-h">
        <h2 className="h2" id="fire-h">Coast FIRE</h2>
        <p className="body">Add your age to see when growth alone carries you to retirement at {fire.retireAge}.</p>
        <div className="inline-add">
          <label htmlFor="fire-age" className="sr">Your age</label>
          <input id="fire-age" type="number" inputMode="numeric" className="field" placeholder="Your age" onBlur={(e) => { const v = Number(e.target.value); if (v > 15 && v < 80) void save({ age: v }); }} />
          <button type="button" className="btn2">Save</button>
        </div>
      </section>
    );
  }
  const market = fire.marketReturn ?? fire.realReturn + 3;
  const inflation = fire.inflation ?? 3;
  const drop = fire.drop ?? 0;
  const real = realFrom(market, inflation);
  const inputs: FireInputs = { age: fire.age, retireAge: fire.retireAge, spending, withdrawal: fire.withdrawal, realReturn: real, contributions: yearly, drop };
  const rows = projectFire(inputs, invested);
  const ca = coastAge(rows);
  const fi = fiNumber(inputs);
  const coastNow = coastNumberAt(inputs, fire.age);
  const last = rows[rows.length - 1];
  const thisYear = new Date().getFullYear();
  const reached = invested >= coastNow;
  return (
    <section className="card" aria-labelledby="fire-h">
      <h2 className="h2" id="fire-h">Coast FIRE</h2>
      <div className="fire-controls">
        <div><span className="lbl">Market return a year</span>
          <Chips label="Market return a year" value={market} onChange={(v) => void save({ marketReturn: v })}
            options={[{ value: 6, label: '6% careful' }, { value: 7, label: '7% middle' }, { value: 8, label: '8% typical' }]} /></div>
        <div><span className="lbl">Inflation a year</span>
          <Chips label="Inflation a year" value={inflation} onChange={(v) => void save({ inflation: v })}
            options={[{ value: 2.5, label: '2.5%' }, { value: 3, label: '3%' }, { value: 4, label: '4%' }]} /></div>
        <div><span className="lbl">Market drop right now</span>
          <Chips label="Market drop right now" value={drop} onChange={(v) => void save({ drop: v })}
            options={[{ value: 0, label: 'None' }, { value: 15, label: '15% drop' }, { value: 30, label: '30% drop' }]} /></div>
      </div>
      <p className="body">Retire at {fire.retireAge} spending {money(spending)} a year in today's dollars. At a {fire.withdrawal}% withdrawal rate that takes <strong>{money(fi)}</strong>. Coast FIRE is the point where, even if you stopped investing, growth alone gets you there by {fire.retireAge}.</p>
      <p className="sub">{market}% market return minus {inflation}% inflation is about {real.toFixed(1)}% growth a year in today's dollars.{drop ? ` With a ${drop}% drop first, your ${money(invested)} starts from ${money(invested * (1 - drop / 100))} and grows from there, with no extra bounce back.` : ''}</p>
      <div className="plan-flow">
        <div><span className="lbl">Invested now</span><span className="num">{money(invested)}</span></div>
        <div><span className="lbl">Needed to coast today</span><span className="num">{money(coastNow)}</span></div>
        <div><span className="lbl">Coast FIRE</span><span className={`num${reached ? ' good-text' : ''}`}>{reached ? 'Reached' : ca ? `Age ${ca}` : 'After 55'}</span>{!reached && ca && <span className="sub">around {thisYear + (ca - fire.age)}</span>}</div>
        <div><span className="lbl">At {fire.retireAge}, still investing</span><span className="num">{money(last.balance)}</span></div>
      </div>
      <LineChart
        title={`Investments by age, ${real.toFixed(1)}% growth after inflation${drop ? `, after a ${drop}% drop` : ''}`}
        xs={rows.map((r) => r.age)}
        xLabel={(a) => `Age ${a}`}
        marker={ca && !reached ? { x: ca, label: 'Coast FIRE' } : undefined}
        series={[
          { label: 'If you keep investing', color: SERIES[0], values: rows.map((r) => r.balance) },
          { label: 'Needed to coast', color: SERIES[1], values: rows.map((r) => r.coastNumber) },
          { label: 'If you stopped today', color: SERIES[2], values: rows.map((r) => r.noMore), dashed: true }
        ]}
      />
      <p className="sub">Counts {money(yearly)} a year going in: your 401k, employer match, and E*Trade once the goals ahead of it are full. Today's dollars, after inflation, so the numbers keep today's buying power. Raises and bonuses would move Coast FIRE earlier.</p>
      <div><EditButton label="Edit Coast FIRE settings" onClick={() => setEdit(true)} /></div>
      <ListEditor<FireSettings & { id: string }>
        title="Coast FIRE settings" open={edit} onClose={() => setEdit(false)} rows={[{ id: 'fire', ...fire, spending, marketReturn: market, inflation, drop }]}
        fields={[
          { key: 'age', label: 'Your age', type: 'number' },
          { key: 'retireAge', label: 'Retire at', type: 'number' },
          { key: 'spending', label: 'Spending a year in retirement, today\'s dollars', type: 'number' },
          { key: 'withdrawal', label: 'Withdrawal rate %', type: 'number' },
          { key: 'marketReturn', label: 'Market return a year %', type: 'number' },
          { key: 'inflation', label: 'Inflation a year %', type: 'number' },
          { key: 'drop', label: 'Market drop right now %', type: 'number' },
          { key: 'match', label: 'Employer match a year', type: 'number' }
        ]}
        onSave={({ id: _id, ...rest }) => setMeta('fire', rest)}
      />
    </section>
  );
}
