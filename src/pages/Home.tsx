import { useState } from 'react';
import { db, setMeta, uid, useMeta, useTable } from '../lib/db';
import { hrefFor } from '../lib/router';
import { clock12, longDate, money, monthShort, pct, sameMonth, todayISO } from '../lib/format';
import { goalProgress, learningScore, moneyScore, readThisYear, recovery, socialScore } from '../lib/calc';
import type { Facial, Goal, HealthDay, Horizon, MoneySnapshot } from '../lib/types';
import { Bar, Checkbox, Chips, EditButton, Sheet, areaClass, useNow } from '../components/ui';
import { IconChevronLeft, IconChevronRight, IconTrash } from '../components/Icons';
import { comingUp, dayLabel, goalQuip, periodFor } from '../lib/plan';
import { TableEditor, type FieldDef } from '../components/ListEditor';
import { DUMP_LABEL, DUMP_TAG } from './Dump';
import { useLiveMoney } from './Money';
import { useCategoryMap, useExportSpend } from '../lib/money';
import { fitnessRow, planGoalsRow, readingRow, spendingRow, type TrackRow } from '../lib/track';
import type { Workout } from '../lib/hevy';
import type { PayeeRule } from '../lib/types';
import { byTime, onDay } from '../lib/calendars';

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export function HomeToday() {
  const now = useNow(10000);
  const [horizon, setHorizon] = useState<Horizon>(savedHorizon);
  const chooseHorizon = (v: Horizon) => {
    setHorizon(v);
    try { localStorage.setItem('planHorizon', v); } catch { /* the view just resets next time */ }
  };
  const today = todayISO();
  const snap = useMeta<MoneySnapshot | null>('moneySnapshot', null);
  const liveMoney = useLiveMoney();
  const readingGoal = useMeta<number>('readingGoal', 20);
  const trips = useTable(db.trips, 'date');
  const classes = useTable(db.classes);
  const books = useTable(db.books);
  const calendar = useTable(db.calendar, 'time');
  const calendarSyncedAt = useMeta<string | null>('calendarSyncedAt', null);
  const priorities = useTable(db.priorities, 'date');
  const dump = useTable(db.dump, 'date', true);
  const [draft, setDraft] = useState('');

  const h = now.getHours();
  const trip = trips.find((t) => t.date && t.date >= today) ?? trips.find((t) => !t.date) ?? trips[trips.length - 1];
  const read = readThisYear(books).length;
  const todays = calendar.filter((e) => onDay(e, today)).sort(byTime);
  const nowHM = `${String(h).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const upcoming = todays.filter((e) => e.time >= nowHM || !/^\d/.test(e.time));

  const arches = [
    // Left to spend this month, worked out live from your budget and Rocket Money spending.
    { label: 'Left this month', stat: liveMoney.live || snap ? money(liveMoney.left) : 'Add data', href: hrefFor('money', 'budget') },
    { label: trip ? `${trip.name.split(/\s+/)[0]} fund` : 'Trip fund', stat: trip ? `${pct(trip.saved, trip.cost)}%` : 'Plan one', href: hrefFor('money', 'trips', trip?.id) },
    { label: 'Classes', stat: String(classes.filter((c) => sameMonth(c.date, today)).length), href: hrefFor('health', 'classes') },
    { label: 'Bookshelf', stat: `${read}/${readingGoal}`, href: hrefFor('dump', 'books') }
  ];

  const add = () => {
    const t = draft.trim();
    if (!t) return;
    void db.priorities.add({ id: uid(), text: t, done: false, date: new Date().toISOString() });
    setDraft('');
  };

  return (
    <div className="stack">
      <div className="today-top">
        <section aria-label={`Clock, ${clock12(nowHM)} ${h < 12 ? 'AM' : 'PM'}`} className="card clock-card">
          <div className="flip chrome" aria-hidden="true">
            <span className="flip-num">{String(h % 12 || 12).padStart(2, '0')}</span>
            <span className="flip-tag" style={{ left: 8 }}>{h < 12 ? 'AM' : 'PM'}</span>
          </div>
          <div className="flip chrome" aria-hidden="true">
            <span className="flip-num">{String(now.getMinutes()).padStart(2, '0')}</span>
            <span className="flip-tag" style={{ right: 8 }}>{DAYS[now.getDay()]}</span>
          </div>
        </section>
        {arches.map((a) => (
          <a key={a.label} className="arch-btn" href={a.href}>
            <span className="arch chrome"><span className="arch-stat">{a.stat}</span></span>
            <span className="arch-lbl">{a.label}</span>
          </a>
        ))}
      </div>

      <HomePlan h={horizon} onHorizon={chooseHorizon} />

      <TrackRecord h={horizon} />

      <div className="grid3">
        <section aria-labelledby="prio-h" className="pinned">
          <span aria-hidden="true" className="pin-head chrome" />
          <h2 className="h2" id="prio-h">Priorities now</h2>
          <span className="lbl">From your calendar</span>
          {upcoming.length === 0 && <span className="empty">Nothing else on the calendar today.</span>}
          {upcoming.map((e) => (
            <div className="prio-cal" key={e.id}><span className="time">{clock12(e.time)}</span><span style={{ flex: 1 }}>{e.title}</span></div>
          ))}
          <span className="lbl" style={{ marginTop: 6 }}>Added by you</span>
          {priorities.map((p) => (
            <div className="prio-row" key={p.id}>
              <button type="button" className="prio-toggle" aria-pressed={p.done} onClick={() => db.priorities.update(p.id, { done: !p.done })}>
                <Checkbox on={p.done} />
                <span className={p.done ? 'done-text' : ''} style={{ fontSize: 14 }}>{p.text}</span>
              </button>
              <button type="button" className="icon-btn" style={{ border: 'none', background: 'transparent' }} aria-label={`Delete ${p.text}`} onClick={() => db.priorities.delete(p.id)}>
                <IconTrash />
              </button>
            </div>
          ))}
          <form className="inline-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
            <label htmlFor="newprio" className="sr">Add a priority</label>
            <input id="newprio" type="text" className="field" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a priority" />
            <button type="submit" className="btn2">Add</button>
          </form>
        </section>

        <section className="card" aria-labelledby="cal-h">
          <div className="row"><h2 className="h2" id="cal-h">Calendar</h2><span className="sub">Today</span></div>
          <div>
            {todays.length === 0 && (calendarSyncedAt
              ? <p className="empty">Nothing on your calendars today.</p>
              : <p className="empty">No events today. <a href={hrefFor('settings')}>Link your Google calendars in Settings</a> to bring them in.</p>)}
            {todays.map((e) => (
              <div className="line" key={e.id}>
                <span className="cal-time">{clock12(e.time)}</span>
                <span className="cal-title">{e.title}</span>
                <span className={areaClass(e.area)}>{e.area}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card" aria-labelledby="recent-h">
          <div className="row"><h2 className="h2" id="recent-h">Recently dumped</h2><span className="sub">Latest 3</span></div>
          <div>
            {dump.length === 0 && <p className="empty">Nothing dumped yet.</p>}
            {dump.slice(0, 3).map((d) => (
              <a key={d.id} className="list-btn" href={hrefFor('dump', 'all', d.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {d.photo && <img src={d.photo} alt="" className="recent-thumb" />}
                <span className="stack-s" style={{ gap: 4, flex: 1, minWidth: 0 }}>
                  <span className={`tag ${DUMP_TAG[d.type] ?? 't-plain'}`} style={{ alignSelf: 'flex-start' }}>{DUMP_LABEL[d.type] ?? d.type}</span>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{d.title}</span>
                </span>
              </a>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

const HORIZONS: { value: Horizon; label: string }[] = [
  { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'quarter', label: 'Quarter' }, { value: 'year', label: 'Year' }
];
const SPAN: Record<Horizon, string> = { week: 'week', month: 'month', quarter: 'quarter', year: 'year' };
const SHOWN = 8;

const savedHorizon = (): Horizon => {
  try {
    const v = localStorage.getItem('planHorizon');
    return v === 'month' || v === 'quarter' || v === 'year' ? v : 'week';
  } catch { return 'week'; }
};

// Goals for a week, month, quarter or year, next to everything dated in it.
function HomePlan({ h, onHorizon }: { h: Horizon; onHorizon: (v: Horizon) => void }) {
  const [offset, setOffset] = useState(0);
  const [draft, setDraft] = useState('');
  const [all, setAll] = useState(false);
  const periodGoals = useTable(db.periodGoals, 'order');
  const calendar = useTable(db.calendar, 'date');
  const trips = useTable(db.trips, 'date');
  const savings = useTable(db.savings, 'order');
  const goals = useTable(db.goals, 'order');
  const shows = useTable(db.shows, 'date');
  const bucket = useTable(db.bucket, 'date');
  const facial = useMeta<Facial | null>('facial', null);
  const care = useTable(db.care, 'order');
  const books = useTable(db.books);
  const classes = useTable(db.classes);
  const accounts = useTable(db.accounts, 'order');
  const readingGoal = useMeta<number>('readingGoal', 20);

  const p = periodFor(h, offset);
  const longTerm = goals.filter((g) => !g.achieved).slice(0, 4);
  const ctx = { trips, books, classes, savings, readingGoal, accounts };
  const mine = periodGoals.filter((g) => g.period === p.key);
  const done = mine.filter((g) => g.done).length;
  const { list, next } = comingUp({ calendar, trips, savings, goals, shows, bucket, facial, care }, p);
  const shown = all ? list : list.slice(0, SHOWN);

  const pick = (v: Horizon) => {
    onHorizon(v);
    setOffset(0);
    setAll(false);
  };
  const add = () => {
    const t = draft.trim();
    if (!t) return;
    void db.periodGoals.add({ id: uid(), period: p.key, text: t, done: false, order: Date.now() });
    setDraft('');
  };

  return (
    <section aria-labelledby="plan-h" className="stack" style={{ gap: 14 }}>
      <div className="plan-head">
        <div className="plan-title">
          <button type="button" className="icon-btn" aria-label={`Previous ${SPAN[h]}`} onClick={() => { setOffset((o) => o - 1); setAll(false); }}><IconChevronLeft /></button>
          <div className="stack-s" style={{ gap: 2, minWidth: 0 }}>
            <h2 className="h2" id="plan-h">{p.title}</h2>
            <span className="sub">{p.range}</span>
          </div>
          <button type="button" className="icon-btn" aria-label={`Next ${SPAN[h]}`} onClick={() => { setOffset((o) => o + 1); setAll(false); }}><IconChevronRight /></button>
          {offset !== 0 && <button type="button" className="btn-text" onClick={() => setOffset(0)}>Back to now</button>}
        </div>
        <Chips label="Plan view" value={h} onChange={pick} options={HORIZONS} />
      </div>

      <div className="grid2">
        <section className="card" aria-labelledby="pgoals-h">
          <div className="row"><h3 className="h2" id="pgoals-h">Goals</h3><span className="sub">{mine.length ? `${done} of ${mine.length} done` : ''}</span></div>
          <span className="quip">{goalQuip(done, mine.length, h)}</span>
          <div>
            {mine.map((g) => (
              <div className="prio-row" key={g.id}>
                <button type="button" className="prio-toggle" aria-pressed={g.done} onClick={() => db.periodGoals.update(g.id, { done: !g.done })}>
                  <Checkbox on={g.done} />
                  <span className={g.done ? 'done-text' : ''} style={{ fontSize: 14 }}>{g.text}</span>
                </button>
                <button type="button" className="icon-btn" style={{ border: 'none', background: 'transparent' }} aria-label={`Delete ${g.text}`} onClick={() => db.periodGoals.delete(g.id)}>
                  <IconTrash />
                </button>
              </div>
            ))}
          </div>
          <form className="inline-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
            <label htmlFor="newpgoal" className="sr">Add a goal for {p.title.toLowerCase()}</label>
            <input id="newpgoal" type="text" className="field" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`A goal for ${p.title.toLowerCase()}`} />
            <button type="submit" className="btn2">Add</button>
          </form>
          {longTerm.length > 0 && (
            <div className="toward">
              <span className="lbl">Working toward</span>
              {longTerm.map((g) => {
                const pr = goalProgress(g, ctx);
                return (
                  <a key={g.id} className="toward-row" href={hrefFor('home', 'goals')}>
                    <span className="row"><span className="toward-title">{g.title}</span><span className="sub">{pr.pct}%</span></span>
                    <Bar value={pr.pct} />
                    {g.due && <span className="sub">By {longDate(g.due)}</span>}
                  </a>
                );
              })}
            </div>
          )}
        </section>

        <section className="card" aria-labelledby="coming-h">
          <div className="row"><h3 className="h2" id="coming-h">Coming up</h3><span className="sub">{list.length ? `${list.length} dated` : ''}</span></div>
          {list.length === 0 && <p className="empty">Nothing dated in this {SPAN[h]}.</p>}
          <div className="miles">
            {shown.map((m) => {
              const inner = (
                <>
                  <span className="mile-date chrome" aria-hidden="true"><span className="mile-mon">{monthShort(m.date)}</span><span className="mile-day">{Number(m.date.slice(8, 10))}</span></span>
                  <span className="mile-body">
                    <strong>{m.title}</strong>
                    <span className="sub">{[m.detail, dayLabel(m.date)].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className={areaClass(m.area)}>{m.area}</span>
                </>
              );
              return m.href
                ? <a key={m.id} className="mile" href={m.href} aria-label={`${m.title}, ${longDate(m.date)}`}>{inner}</a>
                : <div key={m.id} className="mile" aria-label={`${m.title}, ${longDate(m.date)}`}>{inner}</div>;
            })}
          </div>
          {list.length > SHOWN && (
            <button type="button" className="btn-text" onClick={() => setAll((x) => !x)}>{all ? 'Show fewer' : `Show all ${list.length}`}</button>
          )}
          {next && list.length < 3 && (
            <p className="sub">After this: <strong>{next.title}</strong>, {longDate(next.date)}</p>
          )}
        </section>
      </div>
    </section>
  );
}

const STATUS_TEXT = { hit: 'Hit', miss: 'Missed', open: 'In progress', none: 'No data' } as const;

// How often you hit each goal over the last weeks, months, quarters or years.
function TrackRecord({ h }: { h: Horizon }) {
  const classes = useTable(db.classes);
  const books = useTable(db.books);
  const budget = useTable(db.budget, 'order');
  const txns = useTable(db.transactions);
  const periodGoals = useTable(db.periodGoals);
  const map = useCategoryMap();
  const rules = useMeta<PayeeRule[]>('payeeRules', []);
  const hevy = useMeta<Workout[]>('hevyWorkouts', []);
  const gym = useMeta<{ name?: string } | null>('gym', null);
  const perWeek = useMeta<number>('fitnessPerWeek', 4);
  const readingGoal = useMeta<number>('readingGoal', 20);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ perWeek: '', reading: '' });

  const rows: TrackRow[] = [
    fitnessRow(h, { classes, hevyDates: hevy.map((w) => w.date).filter(Boolean), gymName: gym?.name, perWeek }),
    spendingRow(h, { txns, budget, classes, map, rules }),
    readingRow(h, books, readingGoal),
    planGoalsRow(h, periodGoals)
  ];

  const openEdit = () => { setDraft({ perWeek: String(perWeek), reading: String(readingGoal) }); setEditing(true); };
  const save = async () => {
    const w = Math.round(Number(draft.perWeek));
    const r = Math.round(Number(draft.reading));
    if (w > 0) await setMeta('fitnessPerWeek', w);
    if (r > 0) await setMeta('readingGoal', r);
    setEditing(false);
  };

  return (
    <section className="card" aria-labelledby="track-h">
      <div className="row row-wrap" style={{ alignItems: 'center' }}>
        <h2 className="h2" id="track-h">Track record</h2>
        <span className="track-legend" aria-hidden="true">
          <span><i className="tdot hit" /> Hit</span><span><i className="tdot miss" /> Missed</span><span><i className="tdot open" /> In progress</span><span><i className="tdot none" /> No data</span>
        </span>
      </div>
      <div className="track-rows">
        {rows.map((r) => (
          <a key={r.id} className="track-row" href={r.href}>
            <span className="row"><strong className="track-title">{r.title}</strong><span className="sub">{r.now}</span></span>
            <span className="track-strip" role="img" aria-label={`${r.title}: ${r.cells.map((c) => `${c.label} ${STATUS_TEXT[c.status]}`).join(', ')}`}>
              {r.cells.map((c) => <span key={c.key} className={`tdot ${c.status}`} title={`${c.label}: ${STATUS_TEXT[c.status]}, ${c.note}`} />)}
            </span>
            <span className="track-ends" aria-hidden="true"><span>{r.cells[0]?.label}</span><span>{r.cells[r.cells.length - 1]?.label}</span></span>
            <span className="quip">{r.summary}</span>
          </a>
        ))}
      </div>
      <EditButton label="Edit targets" onClick={openEdit} />
      <Sheet title="Targets" open={editing} onClose={() => setEditing(false)}>
        <form className="stack-s" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <label className="lbl" htmlFor="t-week">Workouts a week</label>
          <input id="t-week" type="number" inputMode="numeric" min={1} className="field" value={draft.perWeek} onChange={(e) => setDraft({ ...draft, perWeek: e.target.value })} />
          <label className="lbl" htmlFor="t-read">Books a year</label>
          <input id="t-read" type="number" inputMode="numeric" min={1} className="field" value={draft.reading} onChange={(e) => setDraft({ ...draft, reading: e.target.value })} />
          <p className="sub">Your spending goal is your monthly budget outside rent. Change it in Money, Monthly budget.</p>
          <button type="submit" className="btn">Save</button>
        </form>
      </Sheet>
    </section>
  );
}

const AREAS = ['Money', 'Health', 'Social', 'Learning', 'Experiences', 'Work', 'Other'];

export function HomeGoals() {
  const goals = useTable(db.goals, 'order');
  const trips = useTable(db.trips, 'date');
  const books = useTable(db.books);
  const classes = useTable(db.classes);
  const savings = useTable(db.savings, 'order');
  const budget = useTable(db.budget, 'order');
  const people = useTable(db.people);
  const calendar = useTable(db.calendar);
  const dump = useTable(db.dump);
  const health = useTable(db.health, 'date', true);
  const habits = useTable(db.habits);
  const accounts = useTable(db.accounts, 'order');
  const readingGoal = useMeta<number>('readingGoal', 20);
  const snap = useMeta<MoneySnapshot | null>('moneySnapshot', null);
  const [editing, setEditing] = useState(false);
  const ctx = { trips, books, classes, savings, readingGoal, accounts };

  const active = goals.filter((g) => !g.achieved);
  const achieved = goals.filter((g) => g.achieved);

  const linkOptions = [
    { value: 'none', label: 'Manual percent' },
    { value: 'books', label: 'Bookshelf (reading goal)' },
    { value: 'classes', label: 'Classes this month' },
    { value: 'networth', label: 'Net worth (all accounts)' },
    ...trips.map((t) => ({ value: `trip:${t.id}`, label: `Trip: ${t.name}` })),
    ...savings.map((s) => ({ value: `savings:${s.id}`, label: `Savings: ${s.name}` }))
  ];
  const fields: FieldDef<Goal>[] = [
    { key: 'title', label: 'Goal', wide: true },
    { key: 'area', label: 'Area', type: 'select', options: AREAS.map((a) => ({ value: a, label: a })) },
    { key: 'horizon', label: 'Horizon', placeholder: 'Short term, Long term, Habit' },
    { key: 'due', label: 'Deadline', type: 'date' },
    { key: 'link', label: 'Progress comes from', type: 'select', options: linkOptions },
    { key: 'pct', label: 'Percent (manual only)', type: 'number' },
    { key: 'target', label: 'Target: sessions a month for classes, dollars for net worth', type: 'number' },
    { key: 'steps', label: 'Action steps or progress text', wide: true, placeholder: 'e.g. 14 of 22 action steps done' }
  ];

  const h = health[0] as HealthDay | undefined;
  const { spent: exportSpent } = useExportSpend();
  const ms = moneyScore(budget, classes, snap?.savingsRate ?? 0, snap?.savingsTarget ?? 0, exportSpent);
  const hr = h ? recovery(h) : null;
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const habitShare = habits.length ? habits.reduce((a, x) => a + x.done.filter((d) => d >= weekAgo).length, 0) / (habits.length * 7) : 0;
  const healthScore = Math.round((hr?.score ?? 60) * 0.7 + habitShare * 30);
  const ss = socialScore(people, calendar);
  const ls = learningScore(books, readingGoal, dump.filter((d) => sameMonth(d.date)).length);
  const areas = [
    { label: 'Money', score: ms.score, note: ms.note, href: hrefFor('money') },
    { label: 'Health', score: healthScore, note: hr ? `Recovery ${hr.score}, ${Math.round(habitShare * 100)}% of habits done this week` : 'Waiting for watch data', href: hrefFor('health') },
    { label: 'Social', score: ss.score, note: ss.note, href: hrefFor('social') },
    { label: 'Learning', score: ls.score, note: ls.note, href: hrefFor('dump') }
  ];

  const GoalCard = ({ g }: { g: Goal }) => {
    const p = goalProgress(g, ctx);
    const href = g.link === 'books' ? hrefFor('dump', 'books')
      : g.link === 'classes' ? hrefFor('health', 'classes')
      : g.link.startsWith('trip:') ? hrefFor('money', 'trips', g.link.slice(5))
      : g.link.startsWith('savings:') ? hrefFor('money', 'goals')
      : g.link === 'networth' ? hrefFor('money', 'overview') : null;
    return (
      <div className="card goal-card">
        <div className="goal-cap chrome"><span className="num">{p.pct}%</span>{g.achieved && <span className="tag t-health">Achieved</span>}</div>
        <div className="goal-body">
          <strong style={{ fontSize: 15 }}>{href ? <a href={href} style={{ color: 'inherit', textDecoration: 'none' }}>{g.title}</a> : g.title}</strong>
          <div className="chips"><span className={areaClass(g.area)}>{g.area}</span>{g.horizon && <span className="tag t-plain">{g.horizon}</span>}</div>
          {g.due && <span className="sub">Due {longDate(g.due)}</span>}
          <Bar value={p.pct} />
          {p.steps && <span className="sub">{p.steps}</span>}
          <div className="goal-actions">
            <button type="button" className="btn-text" onClick={() => db.goals.update(g.id, { achieved: !g.achieved })}>
              {g.achieved ? 'Move back to active' : 'Mark as achieved'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="stack">
      <div className="row row-wrap" style={{ alignItems: 'center' }}>
        <h2 className="h2">Goals</h2>
        <EditButton label="Edit goals" onClick={() => setEditing(true)} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: 16 }}>
        {active.map((g) => <GoalCard key={g.id} g={g} />)}
        {active.length === 0 && <p className="empty">No active goals. Tap Edit to add one.</p>}
      </div>
      {achieved.length > 0 && (
        <details className="card">
          <summary className="h2" style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>Achieved ({achieved.length})</summary>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: 16, marginTop: 14 }}>
            {achieved.map((g) => <GoalCard key={g.id} g={g} />)}
          </div>
        </details>
      )}
      <section className="card" aria-labelledby="areas-h">
        <div className="row"><h2 className="h2" id="areas-h">Life areas</h2><span className="sub">Tap to open</span></div>
        <div className="grid3">
          {areas.map((a) => (
            <a key={a.label} href={a.href} className="area-btn">
              <span style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>{a.label}</span><span style={{ color: 'var(--muted)' }}>{a.score}/100</span>
              </span>
              <Bar value={a.score} />
              <span className="sub">{a.note}</span>
            </a>
          ))}
        </div>
      </section>
      <TableEditor<Goal>
        title="Edit goals"
        open={editing}
        onClose={() => setEditing(false)}
        table={db.goals}
        rows={goals}
        fields={fields}
        itemName={(g) => g.title || 'this goal'}
        addLabel="Add a goal"
        make={() => ({ order: goals.length + 1, title: '', area: 'Other', horizon: 'Short term', due: '', link: 'none', pct: 0, steps: '', target: 0, achieved: false })}
      />
    </div>
  );
}
