import { useEffect, useState } from 'react';
import { db, setMeta, uid, useMeta, useTable } from '../lib/db';
import { addDays, titleCase, clock12, daysBetween, duration, longDate, money, monthYear, parseISO, weekday, pct, sameMonth, shortDate, todayISO, weekdayShort } from '../lib/format';
import { careNext } from '../lib/plan';
import { recovery, todaysCall } from '../lib/calc';
import type { CareItem, ClassType, Facial, FitnessClass, Studio, Habit, HealthDay, SkincareStep, Supplement, WishItem } from '../lib/types';
import { Bar, Checkbox, Chips, EditButton, Sheet, Stars, useToast } from '../components/ui';
import { ImagePicker } from '../components/ImagePicker';
import { logoFromWebsite } from '../lib/preview';
import { ListEditor, TableEditor, type FieldDef } from '../components/ListEditor';
import { useFocusItem } from '../components/Search';
import type { Workout } from '../lib/hevy';
import { onDay } from '../lib/calendars';
import { SCORES, classCost, classScore, creditValue, scoreText, studioScores, type ClassPassPlan, type GymMembership } from '../lib/ratings';

interface Memberships { cpMonthly: number; cpCredits: number; cpSince: string; gymName: string; gymMonthly: number; stipend: number; pocketBudget: number }

export function HealthToday() {
  const health = useTable(db.health, 'date', true);
  const calendar = useTable(db.calendar, 'time');
  const h = health[0] as HealthDay | undefined;
  const today = todayISO();
  const call = todaysCall(h, calendar.filter((e) => onDay(e, today)));

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

export const CLASS_TYPES: ClassType[] = ['Pilates', 'Hot Pilates', 'Yoga', 'Hot Yoga', 'Barre', 'Strength', 'Spin', 'HIIT', 'Boxing', 'Gym', 'Run'];
const classFields: FieldDef<FitnessClass>[] = [
  { key: 'date', label: 'Date', type: 'date' },
  { key: 'type', label: 'Type', type: 'select', options: CLASS_TYPES.map((t) => ({ value: t, label: t })) },
  { key: 'name', label: 'Class', wide: true },
  { key: 'studio', label: 'Studio' },
  { key: 'location', label: 'Location', placeholder: 'e.g. Upper East Side' },
  { key: 'credits', label: 'ClassPass credits (leave empty if paid in dollars)', type: 'number' },
  { key: 'price', label: 'Price in dollars (0 if paid with credits)', type: 'number' },
  { key: 'free', label: 'Free class', type: 'checkbox' },
  ...SCORES.map((s) => ({ key: s.key, label: `${s.label} (1 to 5)`, type: 'number' as const, placeholder: s.hint })),
  { key: 'rating', label: 'Overall stars, only used when the three scores are empty', type: 'number' },
  { key: 'notes', label: 'Thoughts', type: 'textarea' },
  { key: 'photo', label: 'Photo from this class (the studio logo shows if empty)', type: 'image' }
];
const studioFields: FieldDef<Studio>[] = [
  { key: 'logo', label: 'Logo', type: 'image' },
  { key: 'name', label: 'Studio', wide: true },
  { key: 'location', label: 'Location', wide: true, placeholder: 'Chelsea, Tribeca' },
  { key: 'tags', label: 'Tags', wide: true, placeholder: 'Mat Pilates, Sculpt, Heated' },
  { key: 'website', label: 'Website (the logo is found from here)', wide: true, placeholder: 'solidcore.co' },
  { key: 'type', label: 'Usual class', type: 'select', options: CLASS_TYPES.map((t) => ({ value: t, label: t })) },
  { key: 'price', label: 'Usual price', type: 'number' },
  { key: 'pastVisits', label: 'Visits before the app', type: 'number' },
  { key: 'order', label: 'Order', type: 'number' }
];

const norm = (s: string) => s.trim().toLowerCase();

// Short, upbeat lines under the Classes numbers, written from what the numbers say.
interface QuipInput { month: FitnessClass[]; all: FitnessClass[]; budget: number; fromPocket: number; stipendUsed: number; paidByStipendNeed: number; fitnessTotal: number; sessions: number }
function classQuips(i: QuipInput) {
  const studiosThisMonth = new Set(i.month.filter((c) => c.type !== 'Gym').map((c) => norm(c.studio)).filter(Boolean));
  const favorite = [...studiosThisMonth].map((s) => ({ s, n: i.month.filter((c) => norm(c.studio) === s).length })).sort((a, b) => b.n - a.n)[0];
  const classes = i.month.length === 0 ? 'Your first class is waiting'
    : studiosThisMonth.size >= 3 ? `${studiosThisMonth.size} studios tried`
    : studiosThisMonth.size === 1 ? `Loyal to ${titleCase(i.month[0].studio)}`
    : favorite && favorite.n > 1 ? `${titleCase(i.month.find((c) => norm(c.studio) === favorite.s)!.studio)} is becoming a habit`
    : 'Two studios and counting';

  const used = i.budget > 0 ? i.fromPocket / i.budget : 0;
  // Finer steps so the line moves as you spend: $35.99 of $135 is about 27%, "about a quarter".
  const pocket = i.budget <= 0 ? 'Set a budget to see your pace'
    : i.fromPocket <= 0 ? 'Not a dollar spent yet'
    : used < 0.15 ? 'Barely touched your budget'
    : used < 0.3 ? 'About a quarter of your budget used'
    : used < 0.42 ? 'A third of the way through your budget'
    : used < 0.58 ? 'Halfway through your budget'
    : used < 0.72 ? 'Two thirds in, pace yourself'
    : used < 0.9 ? 'Three quarters in, easy does it'
    : used <= 1 ? 'Right at your limit'
    : 'Over budget, time for free classes';

  const total = i.fitnessTotal <= 0 ? 'Nothing spent yet'
    : i.stipendUsed > 0 && i.stipendUsed >= i.paidByStipendNeed ? 'Work is covering your classes'
    : i.stipendUsed > 0 ? 'Your stipend is doing the heavy lifting'
    : 'Every class is an investment';

  const perClass = i.sessions ? i.fitnessTotal / i.sessions : 0;
  const cost = !perClass ? 'More classes, lower cost each'
    : perClass < 20 ? 'A steal next to a $40 drop in'
    : perClass < 40 ? 'Less than a drop in class'
    : 'Pricier than a drop in, keep going';

  const dreamCoach = i.all.some((c) => (c.rCoach ?? 0) >= 5);
  const best = dreamCoach ? "You've found your dream instructor"
    : i.all.some((c) => classScore(c) > 0) ? 'Still searching for the one'
    : 'Rate a class to find your favorite';

  return { classes, pocket, total, cost, best };
}

// Merges studios that share a name into one, keeping the one with locations and combining the rest:
// the first logo, every location and tag, the website, the higher past visit count and a price.
// Classes point at studios by name, so they need no change.
let merging = false;
async function mergeDuplicateStudios(studios: Studio[]) {
  if (merging) return;
  const groups = new Map<string, Studio[]>();
  studios.forEach((s) => groups.set(norm(s.name), [...(groups.get(norm(s.name)) ?? []), s]));
  const dupes = [...groups.values()].filter((g) => g.length > 1);
  if (!dupes.length) return;
  merging = true;
  try {
    for (const g of dupes) {
      const keep = g.slice().sort((a, b) => Number(!!b.location) - Number(!!a.location) || a.order - b.order)[0];
      const rest = g.filter((s) => s.id !== keep.id);
      const list = (field: 'location' | 'tags') => {
        const out: string[] = [];
        for (const s of [keep, ...rest]) for (const v of (s[field] ?? '').split(',').map((x) => x.trim()).filter(Boolean)) if (!out.some((o) => norm(o) === norm(v))) out.push(v);
        return out.join(', ') || undefined;
      };
      await db.studios.update(keep.id, {
        logo: keep.logo || rest.find((s) => s.logo)?.logo,
        location: list('location'),
        tags: list('tags'),
        website: keep.website || rest.find((s) => s.website)?.website,
        pastVisits: Math.max(...g.map((s) => s.pastVisits || 0)),
        price: keep.price || rest.find((s) => s.price)?.price || 0
      });
      await db.studios.bulkDelete(rest.map((s) => s.id));
    }
  } finally {
    merging = false;
  }
}
// A class's own name, when it says more than its type ("Heated Sculpt" rather than "Hot Pilates").
const ownName = (c: FitnessClass) => !!c.name.trim() && norm(c.name) !== norm(c.type) && norm(c.name) !== `${norm(c.type)} class`;

export function HealthClasses({ focus }: { focus?: string }) {
  const classes = useTable(db.classes);
  const studios = useTable(db.studios, 'order');
  const budget = useMeta<number>('fitnessBudget', 250);
  // ClassPass: credits turn into dollars at your plan's cost per credit.
  const plan = useMeta<ClassPassPlan | null>('classpass', null);
  const perCredit = creditValue(plan);
  const cost = (c: FitnessClass) => classCost(c, perCredit);
  const [editPlan, setEditPlan] = useState(false);
  const toast = useToast();
  const empty = { type: 'Pilates' as ClassType, name: '', studio: '', instructor: '', price: '', credits: '', payWith: 'credits' as 'credits' | 'dollars' | 'free', location: '', notes: '', rating: 0, date: todayISO(), photo: undefined as string | null | undefined, rSculpt: 0, rStudio: 0, rCoach: 0 };
  const [form, setForm] = useState(empty);
  const [logging, setLogging] = useState(false);
  const [filter, setFilter] = useState<'All' | ClassType>('All');
  const [studioFilter, setStudioFilter] = useState('');
  const [sort, setSort] = useState<'newest' | 'rating' | 'price'>('newest');
  const [editing, setEditing] = useState<FitnessClass | null>(null);
  const [editStudios, setEditStudios] = useState(false);
  useFocusItem(focus, classes.length > 0);

  // Find logos for studios that have a website but no logo yet, once each.
  const [findingLogos, setFindingLogos] = useState(false);
  const findLogos = async (all = false) => {
    const todo = studios.filter((x) => x.website && !x.logo && (all || !x.logoTried));
    if (!todo.length || !navigator.onLine) return 0;
    setFindingLogos(true);
    let found = 0;
    for (const st of todo) {
      const logo = await logoFromWebsite(st.website!);
      await db.studios.update(st.id, logo ? { logo, logoTried: true } : { logoTried: true });
      if (logo) found += 1;
    }
    setFindingLogos(false);
    return found;
  };
  useEffect(() => {
    if (studios.some((x) => x.website && !x.logo && !x.logoTried)) void findLogos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studios.length]);
  // Two studios with the same name (one made when logging a class, one from the data file) become one.
  useEffect(() => {
    if (studios.length < 2) return;
    void mergeDuplicateStudios(studios);
  }, [studios]);
  const studioOf = (name: string) => studios.find((x) => norm(x.name) === norm(name));
  // A studio's picture: its own logo, or else your latest class photo there.
  const studioPhoto = (name: string) => studioOf(name)?.logo
    || classes.filter((c) => c.photo && norm(c.studio) === norm(name)).sort((a, b) => b.date.localeCompare(a.date))[0]?.photo;
  const logged = (name: string) => classes.filter((c) => norm(c.studio) === norm(name)).length;
  const visits = (name: string) => (studioOf(name)?.pastVisits ?? 0) + logged(name);
  // Studios you have been to, most visits first, then any studio only seen in the log.
  const studioRows = [
    ...studios,
    ...[...new Set(classes.map((c) => c.studio).filter((n) => n && !studioOf(n)))].map((name, i) => ({ id: `log-${i}`, order: 999, name, type: 'Pilates' as ClassType, pastVisits: 0, price: 0 } as Studio))
  ].sort((x, y) => visits(y.name) - visits(x.name) || x.order - y.order);

  const month = classes.filter((c) => sameMonth(c.date));
  const paid = month.filter((c) => cost(c) > 0);
  const creditsUsed = month.filter((c) => !plan?.since || c.date >= plan.since).reduce((a, c) => a + (c.credits ?? 0), 0);
  const planStarted = !plan?.since || plan.since <= todayISO();
  const counts: Record<string, number> = {};
  month.forEach((c) => { counts[c.type] = (counts[c.type] ?? 0) + 1; });
  const best = paid.filter((c) => classScore(c) > 0).sort((a, b) => classScore(b) / cost(b) - classScore(a) / cost(a))[0];
  // What fitness actually costs this month: the memberships, plus any class paid in dollars.
  const gym = useMeta<GymMembership | null>('gym', null);
  const isGymClass = (c: FitnessClass) => c.type === 'Gym' || (!!gym?.name && norm(c.studio) === norm(gym.name));
  const hevyWorkouts = useMeta<Workout[]>('hevyWorkouts', []);
  const hevyDays = hevyWorkouts.filter((w) => w.date && sameMonth(w.date)).map((w) => w.date);
  const gymDays = new Set([...month.filter(isGymClass).map((c) => c.date), ...hevyDays]);
  const gymVisits = gymDays.size;
  // Everything you did this month: classes, plus gym days that are not already a logged class.
  const sessions = month.filter((c) => !isGymClass(c)).length + gymVisits;
  const dropIns = month.reduce((a, c) => a + (c.price > 0 ? c.price : 0), 0);
  // The ClassPass plan counts from the month it starts; the money() helper rounds, so cents show here.
  const planCost = planStarted ? plan?.monthly ?? 0 : 0;
  const fitnessTotal = planCost + (gym?.monthly ?? 0) + dropIns;
  const cents = (n: number) => (n % 1 ? `$${n.toFixed(2)}` : money(n));
  // A work stipend pays for ClassPass and pay-per-class sessions first; the gym and anything past
  // the stipend come from your pocket, which is what the fitness budget limits.
  const stipend = useMeta<number>('fitnessStipend', 0);
  const stipendUsed = Math.round(Math.min(stipend, planCost + dropIns) * 100) / 100;
  const fromPocket = Math.round((fitnessTotal - stipendUsed) * 100) / 100;
  const fitnessOver = budget > 0 && fromPocket > budget;
  const quips = classQuips({ month, all: classes, budget, fromPocket, stipendUsed, paidByStipendNeed: planCost + dropIns, fitnessTotal, sessions });
  const usedTypes = CLASS_TYPES.filter((t) => classes.some((c) => c.type === t));

  const shown = classes
    .filter((c) => (filter === 'All' || c.type === filter) && (!studioFilter || norm(c.studio) === norm(studioFilter)))
    .sort((a, b) =>
      sort === 'rating' ? classScore(b) - classScore(a) || b.date.localeCompare(a.date)
        : sort === 'price' ? cost(b) - cost(a) || (b.credits ?? 0) - (a.credits ?? 0) || b.date.localeCompare(a.date)
        : b.date.localeCompare(a.date));

  // Which visit number each logged class was at its studio (oldest first).
  const visitNumber = new Map<string, number>();
  const byStudio = new Map<string, FitnessClass[]>();
  classes.forEach((c) => { if (c.studio) byStudio.set(norm(c.studio), [...(byStudio.get(norm(c.studio)) ?? []), c]); });
  byStudio.forEach((list, key) => {
    const base = studios.find((x) => norm(x.name) === key)?.pastVisits ?? 0;
    list.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)).forEach((c, i) => visitNumber.set(c.id, base + i + 1));
  });

  // How many times you have taken the same class (same name at the same studio), oldest first.
  const takeNumber = new Map<string, number>();
  const takeTotal = new Map<string, number>();
  const sameClass = (c: FitnessClass) => `${norm(c.studio)}|${norm(c.name)}`;
  const byClass = new Map<string, FitnessClass[]>();
  classes.forEach((c) => byClass.set(sameClass(c), [...(byClass.get(sameClass(c)) ?? []), c]));
  byClass.forEach((list) => {
    list.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)).forEach((c, i) => { takeNumber.set(c.id, i + 1); takeTotal.set(c.id, list.length); });
  });

  const logoFor = (studio: string) => studioOf(studio)?.logo;
  const picked = studioFilter ? studioRows.find((x) => norm(x.name) === norm(studioFilter)) : undefined;

  const pickStudio = (name: string) => {
    const st = studioOf(name);
    const locs = (st?.location ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    setForm((f) => ({
      ...f,
      studio: name,
      photo: f.photo === null ? undefined : f.photo,
      ...(st ? { type: st.type, price: f.price || (st.price ? String(st.price) : ''), location: f.location || (locs.length === 1 ? locs[0] : '') } : {})
    }));
  };

  const add = async () => {
    if (!form.name.trim() && !form.notes.trim() && !form.studio.trim()) {
      toast('Add a studio, a class name or a few notes first');
      return;
    }
    const typed = form.studio.trim();
    const st = typed ? studioOf(typed) : undefined;
    // Names are capitalized like "Fuze House" or "Physique57"; a known studio keeps its saved spelling.
    const studio = st ? st.name : titleCase(typed);
    // The first photo for a studio becomes its logo; later photos stay on that class only.
    const photo = form.photo ?? undefined;
    const becomesLogo = Boolean(photo && studio && (!st || !st.logo));
    const location = titleCase(form.location.trim());
    const credits = form.payWith === 'credits' ? Number(form.credits) || 0 : 0;
    const price = form.payWith === 'dollars' ? Number(form.price) || 0 : 0;
    if (studio && !st) {
      await db.studios.add({ id: uid(), order: studios.length + 1, name: studio, type: form.type, pastVisits: 0, price, location: location || undefined, logo: becomesLogo ? photo : undefined });
    } else if (st) {
      // A new location for a known studio joins its list, e.g. "Upper East Side, Flatiron".
      const locs = (st.location ?? '').split(',').map((x) => x.trim()).filter(Boolean);
      const addLoc = location && !locs.some((l) => norm(l) === norm(location));
      if (becomesLogo || addLoc) await db.studios.update(st.id, { ...(becomesLogo ? { logo: photo } : {}), ...(addLoc ? { location: [...locs, location].join(', ') } : {}) });
    }
    const scores = Object.fromEntries(SCORES.map((s) => [s.key, form[s.key] || undefined]));
    const draft = { rating: 0, ...scores } as FitnessClass;
    await db.classes.add({
      id: uid(), date: form.date || todayISO(), type: form.type, name: titleCase(form.name.trim()) || form.type, studio,
      instructor: '', price, credits: credits || undefined, free: form.payWith === 'free' || undefined, location: location || undefined,
      rating: Math.round(classScore(draft)), notes: form.notes.trim(),
      photo: photo && !becomesLogo && photo !== st?.logo ? photo : undefined,
      ...scores
    });
    setForm({ ...empty, type: form.type });
    setLogging(false);
    toast(studio ? `Class saved, visit ${visits(studio) + 1} at ${studio}` : 'Class saved');
  };

  // Classes at the same studio stack into one card; tapping a stack fans it out.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleStack = (key: string) => setExpanded((cur) => { const next = new Set(cur); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const groups: { key: string; list: FitnessClass[] }[] = [];
  for (const c of shown) {
    const key = norm(c.studio) || `class-${c.id}`;
    const g = groups.find((x) => x.key === key);
    if (g) g.list.push(c); else groups.push({ key, list: [c] });
  }
  const classCard = (c: FitnessClass, detailed: boolean) => {
    const img = c.photo || logoFor(c.studio);
    const score = classScore(c);
    const parts = SCORES.filter((sc) => (c[sc.key] ?? 0) > 0).map((sc) => `${sc.label} ${c[sc.key]}`);
    return (
      <button type="button" className="photo-card" key={c.id} id={`item-${c.id}`} onClick={() => setEditing(c)}
        aria-label={`${c.studio ? titleCase(c.studio) : titleCase(c.name)}, ${c.type}, ${shortDate(c.date)}. Tap to edit`}>
        <span className="photo-media">
          {img ? <img src={img} alt="" loading="lazy" /> : <PhotoPlaceholder word={c.studio ? titleCase(c.studio) : c.type} seed={c.id} />}
          <span className="photo-pill top">{c.type}</span>
          {score > 0 && <span className="photo-pill bottom"><span aria-hidden="true">★</span> {score % 1 ? score.toFixed(1) : score}</span>}
        </span>
        <span className="photo-cap">
          <strong>{c.studio ? titleCase(c.studio) : titleCase(c.name)}</strong>
          {c.studio && ownName(c) && <span className="sub">{titleCase(c.name)}</span>}
          <span className="sub">{[
            c.free ? 'Free' : c.credits ? `${c.credits} credits${perCredit ? `, about ${money(cost(c))}` : ''}` : c.price ? money(c.price) : c.type === 'Gym' ? 'Gym membership' : 'Cost not set',
            shortDate(c.date),
            c.location ?? ''
          ].filter(Boolean).join(' · ')}</span>
          {detailed && parts.length > 0 && <span className="sub">{parts.join(' · ')}</span>}
          {c.notes && <span className={`photo-notes${detailed ? ' full' : ''}`}>{c.notes}</span>}
        </span>
      </button>
    );
  };

  return (
    <div className="stack">
      <section aria-label="Class spending" className="stats">
        <div className="stat"><span className="lbl">Classes this month</span><span className="num">{month.length}</span><span className="sub quip">{quips.classes}</span></div>
        <div className="stat"><span className="lbl">From your pocket</span><span className={`num${fitnessOver ? ' bad-text' : ''}`}>{cents(fromPocket)}</span><span className="sub quip">{quips.pocket}</span></div>
        <div className="stat"><span className="lbl">Fitness this month</span><span className="num">{cents(Math.round(fitnessTotal * 100) / 100)}</span><span className="sub quip">{quips.total}</span></div>
        <div className="stat"><span className="lbl">Cost per class</span><span className="num">{sessions && fitnessTotal ? money(fitnessTotal / sessions) : '$0'}</span><span className="sub quip">{quips.cost}</span></div>
        <div className="stat"><span className="lbl">Best value</span><span className="num" style={{ fontSize: 22 }}>{best ? titleCase(best.studio || best.name) : 'None yet'}</span><span className="sub quip">{quips.best}</span></div>
      </section>

      <section className="card" aria-labelledby="members-h">
        <div className="row" style={{ alignItems: 'center' }}>
          <h2 className="h2" id="members-h">Memberships</h2>
          <EditButton label="Edit memberships" onClick={() => setEditPlan(true)} />
        </div>
        <div className="plan-flow">
          <div>
            <span className="lbl">ClassPass credits left</span>
            <span className={`num${plan && creditsUsed > plan.credits ? ' bad-text' : ''}`}>{plan?.credits ? `${Math.max(0, plan.credits - creditsUsed)} of ${plan.credits}` : 'Not set'}</span>
            <span className="sub">{plan?.credits && !planStarted ? `Starts ${shortDate(plan.since)}, ${cents(plan.monthly)} a month, about $${perCredit.toFixed(2)} a credit` : plan?.credits ? `${creditsUsed} used this month${plan.credits ? `, ${money(plan.monthly)} a month, about $${perCredit.toFixed(2)} a credit` : ''}${creditsUsed > plan.credits ? `, ${creditsUsed - plan.credits} over` : ''}` : 'Add your plan with Edit'}</span>
          </div>
          <div>
            <span className="lbl">{gym?.name ? titleCase(gym.name) : 'Gym membership'}</span>
            <span className="num">{gym?.monthly ? `${gymVisits} visit${gymVisits === 1 ? '' : 's'}` : 'Not set'}</span>
            <span className="sub">{gym?.monthly ? `${cents(gym.monthly)} a month${gymVisits ? `, ${cents(Math.round((gym.monthly / gymVisits) * 100) / 100)} a visit so far` : ', log a Gym class or a Hevy workout to see cost per visit'}` : 'Add your gym with Edit'}</span>
          </div>
        </div>
      </section>
      <ListEditor<Memberships & { id: string }>
        title="Memberships" open={editPlan} onClose={() => setEditPlan(false)}
        rows={[{ id: 'members', cpMonthly: plan?.monthly ?? 0, cpCredits: plan?.credits ?? 0, cpSince: plan?.since ?? '', gymName: gym?.name ?? '', gymMonthly: gym?.monthly ?? 0, stipend, pocketBudget: budget }]}
        fields={[
          { key: 'cpMonthly', label: 'ClassPass, cost a month', type: 'number' },
          { key: 'cpCredits', label: 'ClassPass, credits a month', type: 'number' },
          { key: 'cpSince', label: 'ClassPass plan starts', type: 'date' },
          { key: 'gymName', label: 'Gym name', wide: true, placeholder: 'e.g. Equinox' },
          { key: 'gymMonthly', label: 'Gym, cost a month', type: 'number' },
          { key: 'stipend', label: 'Work fitness stipend a month (pays ClassPass and classes first)', type: 'number', wide: true },
          { key: 'pocketBudget', label: 'Fitness budget from your pocket a month', type: 'number', wide: true }
        ]}
        onSave={async (r) => {
          await setMeta('classpass', { monthly: Number(r.cpMonthly) || 0, credits: Number(r.cpCredits) || 0, ...(r.cpSince ? { since: String(r.cpSince) } : {}) });
          await setMeta('gym', { name: titleCase(String(r.gymName || '').trim()), monthly: Number(r.gymMonthly) || 0 });
          await setMeta('fitnessStipend', Number(r.stipend) || 0);
          await setMeta('fitnessBudget', Number(r.pocketBudget) || 0);
        }}
      />

      <section aria-labelledby="studios-h" className="stack-s" style={{ gap: 10 }}>
        <div className="row" style={{ alignItems: 'center' }}>
          <h2 className="h2" id="studios-h">Your studios</h2>
          <span className="card-actions" style={{ margin: 0 }}>
            {studios.some((x) => x.website && !x.logo) && (
              <button type="button" className="btn-text" disabled={findingLogos} onClick={async () => { const n = await findLogos(true); toast(n ? `Found ${n} ${n === 1 ? 'logo' : 'logos'}` : 'No new logos found. Paste one with Edit.'); }}>
                {findingLogos ? 'Finding logos' : 'Find logos'}
              </button>
            )}
            <EditButton label="Edit studios" onClick={() => setEditStudios(true)} />
          </span>
        </div>
        <div className="studio-row" role="group" aria-label="Filter by studio">
          {studioRows.map((st) => {
            const n = visits(st.name);
            const on = norm(studioFilter) === norm(st.name);
            return (
              <button key={st.id} type="button" className="studio-chip" aria-pressed={on} onClick={() => setStudioFilter(on ? '' : st.name)}>
                <span className="studio-logo">{studioPhoto(st.name) ? <img src={studioPhoto(st.name)} alt="" /> : <span aria-hidden="true">{st.name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase()}</span>}</span>
                <span className="studio-name">{titleCase(st.name)}</span>
                {st.location && <span className="studio-loc">{st.location}</span>}
                <span className="sub">{(() => { const o = studioScores(classes.filter((c) => norm(c.studio) === norm(st.name))).overall; return o > 0 ? `★ ${o.toFixed(1)} · ` : ''; })()}{n} {n === 1 ? 'visit' : 'visits'}</span>
              </button>
            );
          })}
        </div>
        {picked && <StudioCard studio={picked} photo={studioPhoto(picked.name)} classes={classes.filter((c) => norm(c.studio) === norm(picked.name))} visits={visits(picked.name)} perCredit={perCredit} onEdit={() => setEditStudios(true)} />}
      </section>

      <section aria-labelledby="past-h" className="stack" style={{ gap: 14 }}>
        <div className="row row-wrap" style={{ alignItems: 'center' }}>
          <h2 className="h2" id="past-h">{studioFilter ? `Classes at ${titleCase(studioFilter)}` : 'Past classes'}</h2>
          <button type="button" className="btn" onClick={() => { setForm((f) => ({ ...f, ...(studioFilter ? { studio: studioFilter } : {}) })); if (studioFilter) pickStudio(studioFilter); setLogging(true); }}>+ Log a class</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 }}>
          <Chips label="Filter by type" value={filter} onChange={setFilter} options={[{ value: 'All', label: 'All' }, ...usedTypes.map((t) => ({ value: t, label: t }))]} />
          <Chips label="Sort" value={sort} onChange={setSort} options={[{ value: 'newest', label: 'Newest' }, { value: 'rating', label: 'Top rated' }, { value: 'price', label: 'Price' }]} />
        </div>
        {shown.length === 0 && <span className="sub">{studioFilter ? `No classes logged at ${studioFilter} yet.` : 'No classes of this type yet.'}</span>}
        <div className="photo-grid">
          {groups.map((g) => {
            // One class, or you are looking at one studio: plain cards.
            if (g.list.length === 1 || studioFilter) return g.list.map((c) => classCard(c, !!studioFilter));
            const open = expanded.has(g.key);
            if (open) {
              return [
                <button type="button" key={`fold-${g.key}`} className="stack-fold" aria-expanded="true" onClick={() => toggleStack(g.key)}>
                  <strong>{titleCase(g.list[0].studio)}</strong>
                  <span className="sub">{g.list.length} classes · tap to stack them</span>
                </button>,
                ...g.list.map((c) => classCard(c, true))
              ];
            }
            // A stack: the latest class on top, cards peeking out behind it.
            const top = g.list[0];
            const img = top.photo || logoFor(top.studio) || studioPhoto(top.studio);
            const scores = g.list.map(classScore).filter((v) => v > 0);
            const avg = scores.length ? scores.reduce((a, v) => a + v, 0) / scores.length : 0;
            const types = [...new Set(g.list.map((c) => c.type))];
            return (
              <button type="button" className="photo-card stack-deck" key={`stack-${g.key}`} aria-expanded="false" onClick={() => toggleStack(g.key)}
                aria-label={`${titleCase(top.studio)}, ${g.list.length} classes. Tap to see each one`}>
                <span className="photo-media">
                  {img ? <img src={img} alt="" loading="lazy" /> : <PhotoPlaceholder word={titleCase(top.studio)} seed={top.id} />}
                  <span className="photo-pill top">{types.length === 1 ? types[0] : `${types.length} types`}</span>
                  {avg > 0 && <span className="photo-pill bottom"><span aria-hidden="true">★</span> {avg.toFixed(1)}</span>}
                  <span className="stack-count" aria-hidden="true">{g.list.length} classes</span>
                </span>
                <span className="photo-cap">
                  <strong>{titleCase(top.studio)}</strong>
                  <span className="sub">Latest {shortDate(top.date)} · tap to see each class</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <Sheet title="Log a class" open={logging} onClose={() => setLogging(false)}>
        <form className="stack-s" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <label htmlFor="cstudio" className="lbl">Studio</label>
          <input id="cstudio" type="text" className="field" list="studios" autoComplete="off" value={form.studio} onChange={(e) => pickStudio(e.target.value)} placeholder="Start typing, e.g. Studio Pilates" />
          <datalist id="studios">{studioRows.map((st) => <option key={st.id} value={st.name} />)}</datalist>
          {form.studio.trim() && <span className="sub">{studioOf(form.studio) ? `This will be visit ${visits(form.studio) + 1}.` : 'New studio, it will be added to your studios.'}</span>}
          <label htmlFor="cloc" className="lbl">Location</label>
          <input id="cloc" type="text" className="field" list="studio-locs" autoComplete="off" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Upper East Side" />
          <datalist id="studio-locs">{(studioOf(form.studio)?.location ?? '').split(',').map((l) => l.trim()).filter(Boolean).map((l) => <option key={l} value={l} />)}</datalist>
          <label htmlFor="ctype" className="lbl">Type</label>
          <select id="ctype" className="field" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as ClassType })}>
            {CLASS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <span className="lbl">Paid with</span>
          <Chips label="Paid with" value={form.payWith} onChange={(v) => setForm({ ...form, payWith: v })} options={[{ value: 'credits', label: 'ClassPass credits' }, { value: 'dollars', label: 'Dollars' }, { value: 'free', label: 'Free' }]} />
          {form.payWith === 'free' ? null : form.payWith === 'credits' ? (
            <>
              <label htmlFor="ccredits" className="lbl">Credits</label>
              <input id="ccredits" type="number" inputMode="numeric" min={0} className="field" value={form.credits} onChange={(e) => setForm({ ...form, credits: e.target.value })} placeholder="e.g. 12" />
              {perCredit > 0 && Number(form.credits) > 0 && <span className="sub">About {money(Number(form.credits) * perCredit)} at your plan's ${perCredit.toFixed(2)} a credit</span>}
            </>
          ) : (
            <>
              <label htmlFor="cprice" className="lbl">Price</label>
              <input id="cprice" type="number" inputMode="decimal" min={0} className="field" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="$" />
            </>
          )}
          <label htmlFor="cname" className="lbl">Class</label>
          <input id="cname" type="text" className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Reformer Flow" />
          <label htmlFor="cdate" className="lbl">Date</label>
          <input id="cdate" type="date" className="field" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <div className="row" style={{ alignItems: 'baseline' }}>
            <span className="lbl">Rate it</span>
            {(() => { const o = classScore({ ...form, rating: 0 } as unknown as FitnessClass); return <span className="sub">{o > 0 ? `Overall ${o.toFixed(1)}` : 'Tap a star in each row'}</span>; })()}
          </div>
          <div className="score-pick">
            {SCORES.map((s) => (
              <div key={s.key} className="score-pick-row">
                <span><strong>{s.label}</strong><span className="sub">{s.hint}</span></span>
                <Stars small label={`${s.label}, 1 to 5`} value={form[s.key]} onPick={(n) => setForm({ ...form, [s.key]: n })} />
              </div>
            ))}
          </div>
          <label htmlFor="cnotes" className="lbl">Thoughts on the class</label>
          <textarea id="cnotes" rows={3} className="area" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="How did it feel? Would you take it again?" />
          <ImagePicker id="cphoto"
            label={studioOf(form.studio)?.logo ? 'Photo (optional, the studio logo is used otherwise)' : 'Photo or studio logo (optional)'}
            value={form.photo === undefined ? logoFor(form.studio) : form.photo ?? undefined}
            onChange={(src) => setForm({ ...form, photo: src ?? null })} />
          <button type="submit" className="btn">Save class</button>
        </form>
      </Sheet>
      <TableEditor<FitnessClass>
        title="Edit class" open={!!editing} onClose={() => setEditing(null)} table={db.classes} rows={editing ? [editing] : []} fields={classFields}
        itemName={(c) => c.name}
      />
      <TableEditor<Studio>
        title="Edit studios" open={editStudios} onClose={() => setEditStudios(false)} table={db.studios} rows={studios} fields={studioFields}
        itemName={(x) => x.name} addLabel="Add a studio" make={() => ({ order: studios.length + 1, name: '', type: 'Pilates', pastVisits: 0, price: 0 })}
      />
    </div>
  );
}

// A studio at a glance: your overall score, price and visits, its tags, your three averages,
// and every class you have taken there with how many times.
function StudioCard({ studio, photo, classes, visits, perCredit, onEdit }: { studio: Studio; photo?: string; classes: FitnessClass[]; visits: number; perCredit: number; onEdit: () => void }) {
  const s = studioScores(classes);
  const tags = (studio.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean);
  // Usual cost: credits when you book with ClassPass, dollars otherwise.
  const withCredits = classes.filter((c) => c.credits);
  const avgCredits = withCredits.length ? Math.round((withCredits.reduce((a, c) => a + (c.credits ?? 0), 0) / withCredits.length) * 10) / 10 : 0;
  const priced = classes.filter((c) => classCost(c, perCredit) > 0);
  const price = studio.price || (priced.length ? Math.round(priced.reduce((a, c) => a + classCost(c, perCredit), 0) / priced.length) : 0);
  const counts = new Map<string, { name: string; n: number; score: number[] }>();
  classes.forEach((c) => {
    const k = norm(c.name);
    const row = counts.get(k) ?? { name: c.name, n: 0, score: [] };
    row.n += 1;
    if (classScore(c) > 0) row.score.push(classScore(c));
    counts.set(k, row);
  });
  const byClass = [...counts.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  return (
    <section className="card studio-card" aria-labelledby="studio-card-h">
      <div className="row" style={{ alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <span className="studio-logo">{photo ? <img src={photo} alt="" /> : <span aria-hidden="true">{studio.name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase()}</span>}</span>
          <div className="stack-s" style={{ gap: 4, minWidth: 0 }}>
            <h3 className="studio-card-name" id="studio-card-h">{titleCase(studio.name)}</h3>
            {studio.location && <span className="studio-card-loc">{studio.location}</span>}
          </div>
        </div>
        <EditButton label={`Edit ${studio.name}`} onClick={onEdit} />
      </div>
      <div className="studio-card-meta">
        {s.overall > 0 && <span><span aria-hidden="true">★</span> <strong>{s.overall.toFixed(1)}</strong></span>}
        {avgCredits > 0 && <span className="studio-price">{avgCredits} credits</span>}
        {price > 0 && <span className={avgCredits ? '' : 'studio-price'}>{avgCredits ? `about ${money(price)}` : money(price)}</span>}
        <span>{visits} {visits === 1 ? 'visit' : 'visits'}</span>
        {s.rated > 0 && <span>{s.rated} rated</span>}
      </div>
      {tags.length > 0 && <div className="chips">{tags.map((t) => <span key={t} className="studio-tag">{t}</span>)}</div>}
      <div className="score-row" role="list" aria-label={`Your average scores at ${studio.name}`}>
        {SCORES.map((sc) => (
          <div role="listitem" key={sc.key} title={sc.hint}>
            <span className="lbl">{sc.label}</span>
            <span className="score-num">{scoreText(s.byKey[sc.key] ?? 0)}</span>
          </div>
        ))}
      </div>
      {byClass.length > 0 && (
        <div>
          <span className="lbl">Classes you have taken here</span>
          {byClass.map((r) => (
            <div className="line" key={r.name}>
              <span>{titleCase(r.name)}</span>
              <span className="sub">{r.n} {r.n === 1 ? 'time' : 'times'}{r.score.length ? ` · ★ ${(r.score.reduce((a, v) => a + v, 0) / r.score.length).toFixed(1)}` : ''}</span>
            </div>
          ))}
        </div>
      )}
      {classes.length === 0 && <p className="empty">Log a class here and rate it to see your scores.</p>}
    </section>
  );
}

const PLACEHOLDER_BG = ['#0F1A2E', '#6B4A33', '#1C2A47', '#556233', '#3A2F4A'];
const PLACEHOLDER_H = [150, 190, 170, 220, 160];

// A designed stand in until a photo is added: navy or walnut tile with a chrome word.
export function PhotoPlaceholder({ word, seed }: { word: string; seed: string }) {
  const n = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0);
  return (
    <span className="photo-ph" style={{ background: PLACEHOLDER_BG[n % PLACEHOLDER_BG.length], height: PLACEHOLDER_H[n % PLACEHOLDER_H.length] }} aria-hidden="true">
      <span className="chrome-text" style={{ fontSize: Math.max(15, Math.min(26, Math.round(170 / Math.max(...word.split(/\s+/).map((w) => w.length), 1)))) }}>{word.toUpperCase()}</span>
    </span>
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
  const care = useTable(db.care, 'order');
  const supLog = useMeta<string[]>('supplementLog', []);
  const [edit, setEdit] = useState<'' | 'sup' | 'skin' | 'habits' | 'wish' | 'care'>('');
  const today = todayISO();
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));

  const toggleIn = (list: string[], d: string) => (list.includes(d) ? list.filter((x) => x !== d) : [...list, d]);
  const supToday = supLog.includes(today);
  const s = streak(supLog);

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

      <SkincareCard steps={skincare} onEdit={() => setEdit('skin')} />

      <section className="card" aria-labelledby="habit-h">
        <div className="row"><h2 className="h2" id="habit-h">Daily habits</h2><span className="sub">Last 7 days, tap a day</span></div>
        <div className="stack-s" style={{ gap: 14 }}>
          {habits.map((x) => {
            const n = last7.filter((d) => x.done.includes(d)).length;
            const target = Math.max(1, x.target ?? 1);
            const countOn = (d: string) => (target > 1 ? x.counts?.[d] ?? (x.done.includes(d) ? target : 0) : x.done.includes(d) ? 1 : 0);
            const setCount = (d: string, c: number) => {
              const done = c >= target ? [...new Set([...x.done, d])] : x.done.filter((y) => y !== d);
              void db.habits.update(x.id, { done, counts: { ...(x.counts ?? {}), [d]: c } });
            };
            const todayCount = countOn(today);
            const unit = x.unit || 'time';
            return (
              <div className="goal" key={x.id}>
                <div className="row"><span className="goal-t">{x.name}</span><span className={`pct${n < 4 ? ' bad-text' : ''}`}>{n} of 7</span></div>
                <Bar value={pct(n, 7)} warn={n < 4} />
                {target > 1 && (
                  <div className="habit-today">
                    <span className="habit-pips" aria-hidden="true">
                      {Array.from({ length: target }, (_, i) => <span key={i} className={`pip${i < todayCount ? ' on' : ''}`} />)}
                    </span>
                    <span className="sub" style={{ flex: 1 }} aria-live="polite">Today {Math.min(todayCount, target)} of {target} {unit}{target === 1 ? '' : 's'}{todayCount >= target ? ', done' : ''}</span>
                    {todayCount > 0 && <button type="button" className="btn-text" onClick={() => setCount(today, todayCount - 1)} aria-label={`Remove one ${unit}`}>Undo</button>}
                    <button type="button" className="btn2" onClick={() => setCount(today, todayCount + 1)}>+ 1 {unit}</button>
                  </div>
                )}
                <div className="habit-days" role="group" aria-label={`${x.name}, last 7 days`}>
                  {last7.map((d) => {
                    const c = countOn(d);
                    return (
                      <button key={d} type="button" className={`habit-day${c > 0 && c < target ? ' partial' : ''}`} aria-pressed={c >= target}
                        aria-label={`${x.name} on ${weekdayShort(d)} ${shortDate(d)}${target > 1 ? `, ${c} of ${target}` : ''}`}
                        onClick={() => (target > 1 ? setCount(d, (c + 1) % (target + 1)) : db.habits.update(x.id, { done: toggleIn(x.done, d) }))}>
                        <span>{d === today ? 'Today' : weekdayShort(d)}</span>
                        {target > 1 && <span className="habit-count">{c}/{target}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <EditButton label="Edit habits" onClick={() => setEdit('habits')} />
      </section>

      <CareCard items={care} onEdit={() => setEdit('care')} />

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
        fields={[{ key: 'time', label: 'Routine', type: 'select', options: [{ value: 'AM', label: 'Morning' }, { value: 'PM', label: 'Evening' }] }, { key: 'order', label: 'Step number', type: 'number' }, { key: 'step', label: 'Step', wide: true }, { key: 'note', label: 'How to use it (optional)', wide: true }, { key: 'days', label: 'Only on these days (optional)', placeholder: 'Mon, Wed, Fri', wide: true }, { key: 'theme', label: 'Name for that night (optional)', placeholder: 'Glycolic night' }, { key: 'exfoliant', label: 'Exfoliant (skipped around a facial)', type: 'checkbox' }]}
        itemName={(x) => x.step} addLabel="Add a step" make={() => ({ time: 'PM', order: skincare.length + 1, step: '', days: '' })}
      />
      <TableEditor<Habit>
        title="Edit habits" open={edit === 'habits'} onClose={() => setEdit('')} table={db.habits} rows={habits}
        fields={[{ key: 'name', label: 'Habit', wide: true }, { key: 'target', label: 'Times a day (1 for a simple check)', type: 'number' }, { key: 'unit', label: 'What one tap counts (optional)', placeholder: 'bottle' }, { key: 'order', label: 'Order', type: 'number' }]}
        itemName={(x) => x.name} addLabel="Add a habit" make={() => ({ order: habits.length + 1, name: '', done: [], target: 1 })}
      />
      <TableEditor<CareItem>
        title="Edit doctor reminders" open={edit === 'care'} onClose={() => setEdit('')} table={db.care} rows={care}
        fields={[{ key: 'title', label: 'Reminder', wide: true }, { key: 'kind', label: 'Kind', type: 'select', options: [{ value: 'yearly', label: 'Yearly checkup' }, { value: 'todo', label: 'One time to do' }] }, { key: 'last', label: 'Last visit (yearly checkups)', type: 'date' }, { key: 'done', label: 'Done (to dos)', type: 'checkbox' }, { key: 'note', label: 'Note (optional)', wide: true, placeholder: 'Doctor, office, or what to ask' }, { key: 'order', label: 'Order', type: 'number' }]}
        itemName={(x) => x.title} addLabel="Add a reminder" make={() => ({ order: care.length + 1, title: '', kind: 'todo', done: false })}
      />
      <TableEditor<WishItem>
        title="Edit wishlist" open={edit === 'wish'} onClose={() => setEdit('')} table={db.wishlist} rows={wishlist}
        fields={[{ key: 'text', label: 'Idea', wide: true }, { key: 'tag', label: 'Tag', type: 'select', options: ['Book', 'Try', 'Buy', 'Schedule'].map((v) => ({ value: v, label: v })) }]}
        itemName={(x) => x.text} addLabel="Add an idea" make={() => ({ text: '', tag: 'Try', done: false })}
      />
    </div>
  );
}

// Yearly checkups are checked while the last visit is under a year old; to dos stay checked once done.
function CareCard({ items, onEdit }: { items: CareItem[]; onEdit: () => void }) {
  const toast = useToast();
  const today = todayISO();
  const isChecked = (c: CareItem) => (c.kind === 'todo' ? !!c.done : !!c.last && careNext(c) > today);
  const sorted = [...items].sort((a, b) => Number(isChecked(a)) - Number(isChecked(b)) || a.order - b.order);
  const open = items.filter((c) => !isChecked(c)).length;

  const toggle = (c: CareItem) => {
    if (c.kind === 'todo') { void db.care.update(c.id, c.done ? { done: false, doneOn: undefined } : { done: true, doneOn: today }); return; }
    if (!isChecked(c)) { void db.care.update(c.id, { last: today, prev: c.last }); toast(`${c.title} marked done today`); return; }
    if (c.last === today) { void db.care.update(c.id, { last: c.prev, prev: undefined }); return; }
    toast('Tap Edit to change the date of your last visit');
  };
  const status = (c: CareItem): { text: string; bad: boolean } => {
    if (c.kind === 'todo') return c.done ? { text: c.doneOn ? `Done ${shortDate(c.doneOn)}` : 'Done', bad: false } : { text: 'Still to do', bad: false };
    if (!c.last) return { text: 'Add your last visit, or book one', bad: true };
    const next = careNext(c);
    if (next <= today) return { text: `Due now, last visit ${longDate(c.last)}`, bad: true };
    return { text: `Last visit ${shortDate(c.last)}, next due ${monthYear(next)}`, bad: daysBetween(today, next) <= 45 };
  };

  return (
    <section className="card" aria-labelledby="care-h">
      <div className="row"><h2 className="h2" id="care-h">Doctor reminders</h2><span className="sub">{items.length ? (open ? `${open} to take care of` : 'All set') : ''}</span></div>
      <div>
        {sorted.map((c) => {
          const on = isChecked(c);
          const st = status(c);
          return (
            <div className="line" key={c.id}>
              <button type="button" className="prio-toggle" aria-pressed={on} onClick={() => toggle(c)}>
                <Checkbox on={on} />
                <span className="line-main">
                  <span className={on && c.kind === 'todo' ? 'done-text' : ''}>{c.title}</span>
                  <span className={`sub${st.bad ? ' bad-text' : ''}`}>{st.text}{c.note ? `. ${c.note}` : ''}</span>
                </span>
              </button>
              <span className={`tag ${c.kind === 'yearly' ? 't-health' : 't-plain'}`}>{c.kind === 'yearly' ? 'Yearly' : 'To do'}</span>
            </div>
          );
        })}
        {items.length === 0 && <p className="empty">Add checkups and appointments to keep track of.</p>}
      </div>
      <EditButton label="Edit doctor reminders" onClick={onEdit} />
    </section>
  );
}

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const daysOf = (x: SkincareStep) => x.days.split(/[\s,]+/).filter(Boolean);
const runsOn = (x: SkincareStep, dow: string) => !x.days.trim() || daysOf(x).includes(dow);
const nightName = (pm: SkincareStep[], dow: string) => pm.find((x) => x.theme && x.days && daysOf(x).includes(dow))?.theme ?? 'Night routine';
const FACIAL_BUFFER = 2; // days before and after a facial with no exfoliation

function SkincareCard({ steps, onEdit }: { steps: SkincareStep[]; onEdit: () => void }) {
  const skinLog = useMeta<{ am: string[]; pm: string[] }>('skincareLog', { am: [], pm: [] });
  const facial = useMeta<Facial | null>('facial', null);
  const [view, setView] = useState<'today' | 'week'>('today');
  const [settingFacial, setSettingFacial] = useState(false);
  const today = todayISO();
  const dow = DOW[parseISO(today).getDay()];
  const am = steps.filter((x) => x.time === 'AM');
  const pm = steps.filter((x) => x.time === 'PM');
  const last6 = Array.from({ length: 6 }, (_, i) => addDays(today, i - 5));
  const bothDays = last6.filter((d) => skinLog.am.includes(d) && skinLog.pm.includes(d)).length;
  const toggleIn = (list: string[], d: string) => (list.includes(d) ? list.filter((x) => x !== d) : [...list, d]);

  // The next facial rolls forward past today, so a missed month still points at the next one.
  const next = (() => {
    if (!facial?.last) return '';
    let d = addDays(facial.last, facial.everyDays || 30);
    for (let i = 0; i < 60 && d < today; i++) d = addDays(d, facial.everyDays || 30);
    return d;
  })();
  const nearFacial = (d: string) => Boolean(
    (facial?.last && Math.abs(daysBetween(facial.last, d)) <= FACIAL_BUFFER) || (next && Math.abs(daysBetween(d, next)) <= FACIAL_BUFFER)
  );
  const skipToday = nearFacial(today);
  const todayPm = pm.filter((x) => runsOn(x, dow) && !(skipToday && x.exfoliant));
  const todayAm = am.filter((x) => runsOn(x, dow));
  const tonight = skipToday && pm.some((x) => x.exfoliant && runsOn(x, dow)) ? 'Recovery night' : nightName(pm, dow);
  const list = (rows: SkincareStep[]) => (
    <ol className="skin-steps">
      {rows.map((x) => (
        <li key={x.id}><span>{x.step}</span>{x.note && <span className="sub">{x.note}</span>}</li>
      ))}
      {rows.length === 0 && <li className="sub">No steps yet</li>}
    </ol>
  );

  return (
    <section className="card" aria-labelledby="skin-h">
      <div className="row"><h2 className="h2" id="skin-h">Skincare</h2><span className="sub">{weekday(today)}: {tonight.toLowerCase()}</span></div>
      <Chips label="Skincare view" value={view} onChange={setView} options={[{ value: 'today', label: 'Today' }, { value: 'week', label: 'This week' }]} />
      {skipToday && pm.some((x) => x.exfoliant && runsOn(x, dow)) && (
        <p className="note-box tone-tight">Your facial is within {FACIAL_BUFFER} days, so tonight skips exfoliating and becomes a recovery night.</p>
      )}
      {view === 'today' ? (
        <div className="form-2" style={{ gap: 16 }}>
          <div className="stack-s"><span className="lbl">Morning</span>{list(todayAm)}</div>
          <div className="stack-s"><span className="lbl">Evening</span>{list(todayPm)}</div>
        </div>
      ) : (
        <div>
          {WEEK.map((d) => {
            const extrasAm = am.filter((x) => x.days.trim() && daysOf(x).includes(d));
            const extrasPm = pm.filter((x) => x.days.trim() && daysOf(x).includes(d));
            return (
              <div className={`line${d === dow ? ' is-today' : ''}`} key={d}>
                <span className="skin-day">{d}</span>
                <span className="line-main">
                  <strong style={{ fontSize: 14 }}>{nightName(pm, d)}</strong>
                  <span className="sub">
                    {extrasAm.length ? `AM ${extrasAm.map((x) => x.step).join(', ')}` : 'AM daily steps'}
                    {extrasPm.length ? ` · PM ${extrasPm.map((x) => x.step).join(', ')}` : ''}
                  </span>
                </span>
              </div>
            );
          })}
          <p className="sub" style={{ marginTop: 8 }}>Every day: {[...am, ...pm].filter((x) => !x.days.trim()).map((x) => x.step).filter((v, i, arr) => arr.indexOf(v) === i).join(', ')}</p>
        </div>
      )}
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
      {facial && (
        <div className="line" style={{ borderTop: '1px solid var(--divider)' }}>
          <span className="line-main">
            <strong style={{ fontSize: 14 }}>{facial.name}</strong>
            <span className="sub">{facial.last ? `Last ${shortDate(facial.last)} · next around ${shortDate(next)}` : 'Add your last facial date to plan around it'}</span>
          </span>
          <button type="button" className="btn2" onClick={() => setSettingFacial(true)}>{facial.last ? 'Update' : 'Set date'}</button>
        </div>
      )}
      <div className="row row-wrap" style={{ alignItems: 'center' }}>
        <span className="sub">Both routines done {bothDays} of the last 6 days</span>
        <EditButton label="Edit skincare steps" onClick={onEdit} />
      </div>
      <Sheet title="Facial" open={settingFacial} onClose={() => setSettingFacial(false)}>
        <form className="stack-s" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); setSettingFacial(false); }}>
          <label className="lbl" htmlFor="fname">Where</label>
          <input id="fname" className="field" value={facial?.name ?? ''} onChange={(e) => setMeta('facial', { ...(facial ?? { everyDays: 30, last: '' }), name: e.target.value })} />
          <label className="lbl" htmlFor="flast">Last facial</label>
          <input id="flast" type="date" className="field" value={facial?.last ?? ''} onChange={(e) => setMeta('facial', { ...(facial ?? { name: 'Facial', everyDays: 30 }), last: e.target.value })} />
          <button type="button" className="btn2" onClick={() => setMeta('facial', { ...(facial ?? { name: 'Facial', everyDays: 30 }), last: today })}>I had it today</button>
          <label className="lbl" htmlFor="fevery">Every how many days</label>
          <input id="fevery" type="number" inputMode="numeric" className="field" value={facial?.everyDays ?? 30} onChange={(e) => setMeta('facial', { ...(facial ?? { name: 'Facial', last: '' }), everyDays: Number(e.target.value) || 30 })} />
          <button type="submit" className="btn">Done</button>
        </form>
      </Sheet>
    </section>
  );
}
