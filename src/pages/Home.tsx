import { useState } from 'react';
import { db, uid, useMeta, useTable } from '../lib/db';
import { hrefFor } from '../lib/router';
import { clock12, longDate, money, pct, sameMonth, todayISO } from '../lib/format';
import { goalProgress, learningScore, moneyScore, readThisYear, recovery, socialScore } from '../lib/calc';
import type { Goal, HealthDay, MoneySnapshot } from '../lib/types';
import { Bar, Checkbox, EditButton, areaClass, useNow } from '../components/ui';
import { IconTrash } from '../components/Icons';
import { TableEditor, type FieldDef } from '../components/ListEditor';
import { DUMP_LABEL, DUMP_TAG } from './Dump';
import { useLiveMoney } from './Money';
import { useExportSpend } from '../lib/money';

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export function HomeToday() {
  const now = useNow(10000);
  const today = todayISO();
  const snap = useMeta<MoneySnapshot | null>('moneySnapshot', null);
  const liveMoney = useLiveMoney();
  const readingGoal = useMeta<number>('readingGoal', 20);
  const trips = useTable(db.trips, 'date');
  const classes = useTable(db.classes);
  const books = useTable(db.books);
  const calendar = useTable(db.calendar, 'time');
  const priorities = useTable(db.priorities, 'date');
  const dump = useTable(db.dump, 'date', true);
  const [draft, setDraft] = useState('');

  const h = now.getHours();
  const trip = trips.find((t) => t.id === 'lisbon') ?? trips[0];
  const read = readThisYear(books).length;
  const todays = calendar.filter((e) => e.date === today);
  const nowHM = `${String(h).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const upcoming = todays.filter((e) => e.time >= nowHM || !/^\d/.test(e.time));

  const arches = [
    { label: 'Monthly budget', stat: snap ? money(liveMoney.left) : 'Add data', href: hrefFor('money', 'budget') },
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
            {todays.length === 0 && <p className="empty">No events for today yet. They arrive with the Morning sync.</p>}
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
  const readingGoal = useMeta<number>('readingGoal', 20);
  const snap = useMeta<MoneySnapshot | null>('moneySnapshot', null);
  const [editing, setEditing] = useState(false);
  const ctx = { trips, books, classes, savings, readingGoal };

  const active = goals.filter((g) => !g.achieved);
  const achieved = goals.filter((g) => g.achieved);

  const linkOptions = [
    { value: 'none', label: 'Manual percent' },
    { value: 'books', label: 'Bookshelf (reading goal)' },
    { value: 'classes', label: 'Classes this month' },
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
    { key: 'target', label: 'Sessions a month (classes only)', type: 'number' },
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
      : g.link.startsWith('savings:') ? hrefFor('money', 'goals') : null;
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
