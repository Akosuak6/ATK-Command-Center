import { useState } from 'react';
import { db, setMeta, uid, useMeta, useTable } from '../lib/db';
import { addDays, clock12, duration, money, monthShort, parseISO, pct, sameMonth, shortDate, todayISO, weekdayShort } from '../lib/format';
import { recovery, todaysCall } from '../lib/calc';
import type { ClassType, FitnessClass, Habit, HealthDay, SkincareStep, Supplement, WishItem } from '../lib/types';
import { Bar, Checkbox, Chips, EditButton, StarText, Stars, useToast } from '../components/ui';
import { TableEditor, type FieldDef } from '../components/ListEditor';
import { useFocusItem } from '../components/Search';

export function HealthToday() {
  const health = useTable(db.health, 'date', true);
  const calendar = useTable(db.calendar, 'time');
  const h = health[0] as HealthDay | undefined;
  const today = todayISO();
  const call = todaysCall(h, calendar.filter((e) => e.date === today));

  if (!h) {
    return (
      <section className="card">
        <span className="lbl">Recovery estimate · Apple Watch</span>
        <h2 className="h2">No watch data yet</h2>
        <p className="body">{call.body}</p>
      </section>
    );
  }
  const r = recovery(h);
  const metric = (label: string, value: string, fill: number) => (
    <div className="stack-s" style={{ gap: 4 }}>
      <span className="lbl" style={{ fontSize: 10 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600 }}>{value}</span>
      <Bar value={fill} />
    </div>
  );
  const asOf = h.date === today ? 'this morning' : shortDate(h.date);

  return (
    <div className="stack">
      <div className="grid2">
        <section className="card" aria-labelledby="body-h">
          <span className="lbl" id="body-h">Recovery estimate · Apple Watch, {asOf}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="recovery-num">{r.score}</span>
            <span className={`tag ${r.label === 'Good' ? 't-health' : r.label === 'Fair' ? 't-money' : 't-social'}`}>{r.label}</span>
          </div>
          <div className="ring-grid">
            {metric('HRV vs baseline', `${h.hrv} / ${h.hrvBaseline} ms`, r.hrv)}
            {metric('Resting HR', `${h.restingHr} bpm`, r.rhr)}
            {metric('Sleep', duration(h.sleepMin), r.sleep)}
            {metric('Move ring', `${h.move} / ${h.moveGoal} cal`, pct(h.move, h.moveGoal))}
            {metric('Exercise ring', `${h.exercise} / ${h.exerciseGoal} min`, pct(h.exercise, h.exerciseGoal))}
            {metric('Stand ring', `${h.stand} / ${h.standGoal} hr`, pct(h.stand, h.standGoal))}
          </div>
        </section>
        <section className="card" aria-labelledby="call-h">
          <span className="lbl">Today's call</span>
          <h2 className="h2" id="call-h" style={{ fontSize: 28 }}>{call.title}</h2>
          <p className="body" style={{ lineHeight: 1.6 }}>{call.body}</p>
          <div style={{ borderTop: '1px solid var(--divider)', paddingTop: 12, fontSize: 13, color: 'var(--ink-2)' }}>
            <strong style={{ color: 'var(--ink)' }}>Close your rings:</strong> {call.rings}
          </div>
        </section>
      </div>
      <section aria-label="Overnight numbers" className="stats">
        <div className="stat"><span className="lbl">Sleep last night</span><div><span className="num">{duration(h.sleepMin)}</span></div><span className="sub">Bed {clock12(h.bed)}, up {clock12(h.wake)}</span></div>
        <div className="stat"><span className="lbl">HRV</span><div><span className="num">{h.hrv}</span><span className="unit">ms</span></div><span className="sub">7 day avg {h.hrv7}</span></div>
        <div className="stat"><span className="lbl">Resting HR</span><div><span className="num">{h.restingHr}</span><span className="unit">bpm</span></div><span className="sub">{h.restingHrWeekChange === 0 ? 'Flat this week' : `${h.restingHrWeekChange < 0 ? 'Down' : 'Up'} ${Math.abs(h.restingHrWeekChange)} this week`}</span></div>
        <div className="stat"><span className="lbl">Steps</span><div><span className="num">{(h.steps / 1000).toFixed(1)}</span><span className="unit">k</span></div><span className="sub">Goal {Math.round(h.stepGoal / 1000)}k</span></div>
      </section>
    </div>
  );
}

const CLASS_TYPES: ClassType[] = ['Pilates', 'HIIT', 'Gym', 'Yoga', 'Spin', 'Run'];
const classFields: FieldDef<FitnessClass>[] = [
  { key: 'date', label: 'Date', type: 'date' },
  { key: 'type', label: 'Type', type: 'select', options: CLASS_TYPES.map((t) => ({ value: t, label: t })) },
  { key: 'name', label: 'Class', wide: true },
  { key: 'studio', label: 'Studio' },
  { key: 'instructor', label: 'Instructor' },
  { key: 'price', label: 'Price', type: 'number' },
  { key: 'rating', label: 'Stars (0 to 5)', type: 'number' },
  { key: 'notes', label: 'Thoughts', type: 'textarea' }
];

export function HealthClasses({ focus }: { focus?: string }) {
  const classes = useTable(db.classes);
  const budget = useMeta<number>('fitnessBudget', 250);
  const toast = useToast();
  const empty = { type: 'Pilates' as ClassType, name: '', studio: '', instructor: '', price: '', notes: '', rating: 0, date: todayISO() };
  const [form, setForm] = useState(empty);
  const [filter, setFilter] = useState<'All' | ClassType>('All');
  const [sort, setSort] = useState<'newest' | 'rating' | 'price'>('newest');
  const [editing, setEditing] = useState<FitnessClass | null>(null);
  useFocusItem(focus, classes.length > 0);

  const month = classes.filter((c) => sameMonth(c.date));
  const spend = month.reduce((a, c) => a + (Number(c.price) || 0), 0);
  const paid = month.filter((c) => Number(c.price) > 0);
  const counts: Record<string, number> = {};
  month.forEach((c) => { counts[c.type] = (counts[c.type] ?? 0) + 1; });
  const best = paid.slice().sort((a, b) => b.rating / b.price - a.rating / a.price)[0];
  const over = spend > budget;

  const shown = classes.filter((c) => filter === 'All' || c.type === filter).sort((a, b) =>
    sort === 'rating' ? b.rating - a.rating || b.date.localeCompare(a.date)
      : sort === 'price' ? b.price - a.price || b.date.localeCompare(a.date)
      : b.date.localeCompare(a.date));

  const add = () => {
    if (!form.name.trim() && !form.notes.trim()) {
      toast('Add a class name or a few notes first');
      return;
    }
    void db.classes.add({
      id: uid(), date: form.date || todayISO(), type: form.type, name: form.name.trim() || `${form.type} class`, studio: form.studio.trim(),
      instructor: form.instructor.trim(), price: Number(form.price) || 0, rating: form.rating || 3, notes: form.notes.trim()
    });
    setForm({ ...empty, type: form.type });
    toast('Class saved');
  };

  return (
    <div className="stack">
      <section aria-label="Class spending" className="stats">
        <div className="stat"><span className="lbl">Classes this month</span><span className="num">{month.length}</span><span className="sub">{Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(', ') || 'None yet'}</span></div>
        <div className="stat"><span className="lbl">Spent on classes</span><span className={`num${over ? ' bad-text' : ''}`}>{money(spend)}</span><span className="sub">{over ? `${money(spend - budget)} over` : 'of'} your {money(budget)} fitness budget</span></div>
        <div className="stat"><span className="lbl">Cost per class</span><span className="num">{paid.length ? money(spend / paid.length) : '$0'}</span><span className="sub">Average this month</span></div>
        <div className="stat"><span className="lbl">Best value</span><span className="num" style={{ fontSize: 22 }}>{best ? best.name : 'None yet'}</span><span className="sub">Highest rating per dollar</span></div>
      </section>
      <div className="split">
        <form className="card narrow" aria-labelledby="log-h" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <h2 className="h2" id="log-h">Log a class</h2>
          <div className="form-2">
            <div className="form-col"><label htmlFor="ctype" className="lbl">Type</label>
              <select id="ctype" className="field" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as ClassType })}>
                {CLASS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-col"><label htmlFor="cprice" className="lbl">Price</label>
              <input id="cprice" type="number" inputMode="decimal" min={0} className="field" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="$" />
            </div>
          </div>
          <label htmlFor="cname" className="lbl">Class</label>
          <input id="cname" type="text" className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Reformer Flow" />
          <div className="form-2">
            <div className="form-col"><label htmlFor="cstudio" className="lbl">Studio</label><input id="cstudio" type="text" className="field" value={form.studio} onChange={(e) => setForm({ ...form, studio: e.target.value })} placeholder="Studio" /></div>
            <div className="form-col"><label htmlFor="cinst" className="lbl">Instructor</label><input id="cinst" type="text" className="field" value={form.instructor} onChange={(e) => setForm({ ...form, instructor: e.target.value })} placeholder="Instructor" /></div>
          </div>
          <label htmlFor="cdate" className="lbl">Date</label>
          <input id="cdate" type="date" className="field" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <span className="lbl">Rating</span>
          <Stars label="Rating" value={form.rating} onPick={(n) => setForm({ ...form, rating: n })} />
          <label htmlFor="cnotes" className="lbl">Thoughts on the class</label>
          <textarea id="cnotes" rows={3} className="area" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="How did it feel? Book this instructor again?" />
          <button type="submit" className="btn">Save class</button>
        </form>
        <section className="card wide" aria-labelledby="past-h">
          <h2 className="h2" id="past-h">Past classes</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 }}>
            <Chips label="Filter by type" value={filter} onChange={setFilter} options={[{ value: 'All', label: 'All' }, ...CLASS_TYPES.map((t) => ({ value: t, label: t }))]} />
            <Chips label="Sort" value={sort} onChange={setSort} options={[{ value: 'newest', label: 'Newest' }, { value: 'rating', label: 'Top rated' }, { value: 'price', label: 'Price' }]} />
          </div>
          <div>
            {shown.map((c) => (
              <div className="class-row" key={c.id} id={`item-${c.id}`}>
                <div className="class-date"><span className="lbl" style={{ fontSize: 10 }}>{monthShort(c.date)}</span><span>{parseISO(c.date).getDate()}</span></div>
                <div className="stack-s" style={{ flex: 1, minWidth: 0, gap: 6 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                    <span className="tag t-health">{c.type}</span>
                    <strong style={{ fontSize: 14 }}>{c.name}</strong>
                    <span style={{ marginLeft: 'auto' }}><StarText value={c.rating} /></span>
                  </div>
                  <span className="sub">{[c.studio, c.instructor ? `with ${c.instructor}` : '', c.price ? money(c.price) : 'Free'].filter(Boolean).join(' · ')}</span>
                  {c.notes && <p className="body">{c.notes}</p>}
                  <div style={{ margin: '0 -8px -10px' }}><EditButton label={`Edit ${c.name}`} onClick={() => setEditing(c)} /></div>
                </div>
              </div>
            ))}
            {shown.length === 0 && <span className="sub">No classes of this type yet.</span>}
          </div>
        </section>
      </div>
      <TableEditor<FitnessClass>
        title="Edit class" open={!!editing} onClose={() => setEditing(null)} table={db.classes} rows={editing ? [editing] : []} fields={classFields}
        itemName={(c) => c.name}
      />
    </div>
  );
}

const TIMING_TAG: Record<string, string> = { AM: 't-money', Midday: 't-money', PM: 't-work' };
const WISH_TAG: Record<string, string> = { Book: 't-social', Try: 't-health', Buy: 't-money', Schedule: 't-work' };
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function streak(dates: string[], today = todayISO()) {
  const set = new Set(dates);
  let n = 0;
  let d = set.has(today) ? today : addDays(today, -1);
  while (set.has(d)) { n += 1; d = addDays(d, -1); }
  return n;
}

export function HealthRoutines() {
  const supplements = useTable(db.supplements, 'order');
  const skincare = useTable(db.skincare, 'order');
  const habits = useTable(db.habits, 'order');
  const wishlist = useTable(db.wishlist);
  const supLog = useMeta<string[]>('supplementLog', []);
  const skinLog = useMeta<{ am: string[]; pm: string[] }>('skincareLog', { am: [], pm: [] });
  const [edit, setEdit] = useState<'' | 'sup' | 'skin' | 'habits' | 'wish'>('');
  const today = todayISO();
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const last6 = last7.slice(1);

  const toggleIn = (list: string[], d: string) => (list.includes(d) ? list.filter((x) => x !== d) : [...list, d]);
  const supToday = supLog.includes(today);
  const s = streak(supLog);
  const am = skincare.filter((x) => x.time === 'AM');
  const pm = skincare.filter((x) => x.time === 'PM');
  const dow = DOW[parseISO(today).getDay()];
  const special = pm.find((x) => x.days && x.days.split(/[\s,]+/).includes(dow));
  const bothDays = last6.filter((d) => skinLog.am.includes(d) && skinLog.pm.includes(d)).length;
  const stepLabel = (x: SkincareStep, i: number) => `${i + 1}. ${x.step}${x.days ? ` (${x.days.split(/[\s,]+/).filter(Boolean).map((d) => d[0]).join(', ')})` : ''}`;

  return (
    <div className="grid2">
      <section className="card" aria-labelledby="sup-h">
        <div className="row"><h2 className="h2" id="sup-h">Supplement stack</h2><span className="sub">{s} day streak</span></div>
        <div>
          {supplements.map((x) => (
            <div className="line" key={x.id}>
              <span className="line-main"><strong>{x.name}</strong><span className="sub">{x.note}</span></span>
              <span className={`tag ${TIMING_TAG[x.timing] ?? 't-plain'}`}>{x.timing}</span>
            </div>
          ))}
        </div>
        <div className="row row-wrap" style={{ alignItems: 'center' }}>
          <button type="button" className="prio-toggle" style={{ flex: 'none' }} aria-pressed={supToday} onClick={() => setMeta('supplementLog', toggleIn(supLog, today))}>
            <Checkbox on={supToday} /><span style={{ fontSize: 14 }}>Taken today</span>
          </button>
          <EditButton label="Edit supplements" onClick={() => setEdit('sup')} />
        </div>
      </section>

      <section className="card" aria-labelledby="skin-h">
        <div className="row"><h2 className="h2" id="skin-h">Skincare</h2><span className="sub">{special ? `Tonight: ${special.step.toLowerCase()} night` : 'Tonight: a simple night'}</span></div>
        <div className="form-2" style={{ gap: 16 }}>
          <div className="stack-s"><span className="lbl">Morning</span>{am.map((x, i) => <span key={x.id} style={{ fontSize: 14 }}>{stepLabel(x, i)}</span>)}</div>
          <div className="stack-s"><span className="lbl">Evening</span>{pm.map((x, i) => <span key={x.id} style={{ fontSize: 14 }}>{stepLabel(x, i)}</span>)}</div>
        </div>
        <div className="form-2">
          {(['am', 'pm'] as const).map((k) => {
            const on = skinLog[k].includes(today);
            return (
              <button key={k} type="button" className="prio-toggle" aria-pressed={on} onClick={() => setMeta('skincareLog', { ...skinLog, [k]: toggleIn(skinLog[k], today) })}>
                <Checkbox on={on} /><span style={{ fontSize: 14 }}>{k === 'am' ? 'Morning done' : 'Evening done'}</span>
              </button>
            );
          })}
        </div>
        <div className="row row-wrap" style={{ alignItems: 'center' }}>
          <span className="sub">Both routines done {bothDays} of the last 6 days</span>
          <EditButton label="Edit skincare steps" onClick={() => setEdit('skin')} />
        </div>
      </section>

      <section className="card" aria-labelledby="habit-h">
        <div className="row"><h2 className="h2" id="habit-h">Daily habits</h2><span className="sub">Last 7 days, tap a day</span></div>
        <div className="stack-s" style={{ gap: 14 }}>
          {habits.map((x) => {
            const n = last7.filter((d) => x.done.includes(d)).length;
            return (
              <div className="goal" key={x.id}>
                <div className="row"><span className="goal-t">{x.name}</span><span className={`pct${n < 4 ? ' bad-text' : ''}`}>{n} of 7</span></div>
                <Bar value={pct(n, 7)} warn={n < 4} />
                <div className="habit-days" role="group" aria-label={`${x.name}, last 7 days`}>
                  {last7.map((d) => (
                    <button key={d} type="button" className="habit-day" aria-pressed={x.done.includes(d)} aria-label={`${x.name} on ${weekdayShort(d)} ${shortDate(d)}`}
                      onClick={() => db.habits.update(x.id, { done: toggleIn(x.done, d) })}>
                      <span>{d === today ? 'Today' : weekdayShort(d)}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <EditButton label="Edit habits" onClick={() => setEdit('habits')} />
      </section>

      <section className="card" aria-labelledby="wish-h">
        <div className="row"><h2 className="h2" id="wish-h">Self care to try</h2><span className="sub">Wishlist</span></div>
        <div>
          {wishlist.map((x) => (
            <div className="line" key={x.id}>
              <button type="button" className="prio-toggle" aria-pressed={x.done} onClick={() => db.wishlist.update(x.id, { done: !x.done })}>
                <Checkbox on={x.done} /><span className={x.done ? 'done-text' : ''}>{x.text}</span>
              </button>
              <span className={`tag ${WISH_TAG[x.tag] ?? 't-plain'}`}>{x.tag}</span>
            </div>
          ))}
        </div>
        <EditButton label="Edit wishlist" onClick={() => setEdit('wish')} />
      </section>

      <TableEditor<Supplement>
        title="Edit supplements" open={edit === 'sup'} onClose={() => setEdit('')} table={db.supplements} rows={supplements}
        fields={[{ key: 'name', label: 'Supplement' }, { key: 'timing', label: 'Timing', type: 'select', options: ['AM', 'Midday', 'PM'].map((v) => ({ value: v, label: v })) }, { key: 'note', label: 'Note', wide: true }]}
        itemName={(x) => x.name} addLabel="Add a supplement" make={() => ({ order: supplements.length + 1, name: '', note: '', timing: 'AM' })}
      />
      <TableEditor<SkincareStep>
        title="Edit skincare" open={edit === 'skin'} onClose={() => setEdit('')} table={db.skincare} rows={skincare}
        fields={[{ key: 'time', label: 'Routine', type: 'select', options: [{ value: 'AM', label: 'Morning' }, { value: 'PM', label: 'Evening' }] }, { key: 'order', label: 'Step number', type: 'number' }, { key: 'step', label: 'Step', wide: true }, { key: 'days', label: 'Only on these days (optional)', placeholder: 'Mon, Wed, Fri', wide: true }]}
        itemName={(x) => x.step} addLabel="Add a step" make={() => ({ time: 'PM', order: skincare.length + 1, step: '', days: '' })}
      />
      <TableEditor<Habit>
        title="Edit habits" open={edit === 'habits'} onClose={() => setEdit('')} table={db.habits} rows={habits}
        fields={[{ key: 'name', label: 'Habit', wide: true }, { key: 'order', label: 'Order', type: 'number' }]}
        itemName={(x) => x.name} addLabel="Add a habit" make={() => ({ order: habits.length + 1, name: '', done: [] })}
      />
      <TableEditor<WishItem>
        title="Edit wishlist" open={edit === 'wish'} onClose={() => setEdit('')} table={db.wishlist} rows={wishlist}
        fields={[{ key: 'text', label: 'Idea', wide: true }, { key: 'tag', label: 'Tag', type: 'select', options: ['Book', 'Try', 'Buy', 'Schedule'].map((v) => ({ value: v, label: v })) }]}
        itemName={(x) => x.text} addLabel="Add an idea" make={() => ({ text: '', tag: 'Try', done: false })}
      />
    </div>
  );
}
