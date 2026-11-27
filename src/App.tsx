import { useEffect, useState, type ReactNode } from 'react';
import { SECTIONS, hrefFor, sectionById, useRoute, type SectionId } from './lib/router';
import { useMeta } from './lib/db';
import { bannerDate, daysBetween, nextMonth, shortDate, timeOfDate, todayISO } from './lib/format';
import type { MoneySnapshot } from './lib/types';
import { IconDump, IconHealth, IconHome, IconMoney, IconSettings, IconSocial, IconWork } from './components/Icons';
import { TrendCards } from './components/TrendCards';
import { SearchResults } from './components/Search';
import { BackupReminder } from './pages/Settings';
import { HomeToday, HomeGoals } from './pages/Home';
import { HomeBucket } from './pages/Bucket';
import { DumpAll, Bookshelf } from './pages/Dump';
import { MoneyOverview, MoneyBudget, MoneyGoals, TripPlanner } from './pages/Money';
import { HealthClasses, HealthRoutines } from './pages/Health';
import { HealthWorkouts } from './pages/Workouts';
import { SocialCalendar } from './pages/Social';
import { WorkContacts } from './pages/Work';
import { SettingsPage } from './pages/Settings';

const NAV_ICONS: Record<string, () => JSX.Element> = {
  home: IconHome, dump: IconDump, money: IconMoney, health: IconHealth, social: IconSocial, work: IconWork, settings: IconSettings
};

const PAGES: Record<string, (p: { param?: string }) => ReactNode> = {
  'home/today': () => <HomeToday />,
  'home/goals': () => <HomeGoals />,
  'home/bucket': ({ param }) => <HomeBucket focus={param} />,
  'dump/all': ({ param }) => <DumpAll focus={param} />,
  'dump/books': ({ param }) => <Bookshelf focus={param} />,
  'money/overview': () => <MoneyOverview />,
  'money/budget': () => <MoneyBudget />,
  'money/goals': () => <MoneyGoals />,
  'money/trips': ({ param }) => <TripPlanner tripId={param} />,
  'health/classes': ({ param }) => <HealthClasses focus={param} />,
  'health/workouts': () => <HealthWorkouts />,
  'health/routines': () => <HealthRoutines />,
  'social/calendar': ({ param }) => <SocialCalendar focus={param} />,
  'work/contacts': ({ param }) => <WorkContacts focus={param} />,
  'settings/backup': () => <SettingsPage />
};

export default function App() {
  const route = useRoute();
  const def = sectionById(route.section);
  const [query, setQuery] = useState('');
  const sample = useMeta<boolean>('sampleData', false);

  useEffect(() => {
    setQuery('');
  }, [route.section, route.sub, route.param]);

  useEffect(() => {
    document.title = `${def.label} · Akosua's command center`;
  }, [def.label]);

  const Page = PAGES[`${route.section}/${route.sub}`] ?? PAGES['home/today'];
  const searching = query.trim().length > 0;
  const showTrend = def.trends && route.sub === def.subs[0][0];

  const search = (id: string) => (
    <div className="search">
      <label htmlFor={id} className="sr">Search everything</label>
      <input id={id} type="search" className="field" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search everything" autoComplete="off" />
    </div>
  );

  return (
    <div className="app">
      <a href="#main" className="skip" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to content</a>
      <aside className="side" aria-label="Command center navigation">
        <div className="stripe" aria-hidden="true" />
        <a className="brand" href={hrefFor('home')}>
          <span className="brand-name">Akosua's</span>
          <span className="brand-script">command center</span>
        </a>
        {search('gsearch')}
        <nav className="navlist" aria-label="Sections">
          {SECTIONS.filter((s) => s.id !== 'settings').map((s) => <NavLink key={s.id} id={s.id} label={s.label} current={route.section === s.id} />)}
          <NavLink id="settings" label="Settings" current={route.section === 'settings'} className="nav-settings" />
        </nav>
        <StatusBlock />
      </aside>

      <main className="main" id="main" tabIndex={-1}>
        <div className="mobile-top">
          <div className="mobile-top-row">
            <a className="mobile-brand" href={hrefFor('home')}>
              <span className="brand-name">Akosua's</span>
              <span className="brand-script">command center</span>
            </a>
            <a className="icon-btn" href={hrefFor('settings')} aria-label="Settings and backups"><IconSettings /></a>
          </div>
          {search('gsearch2')}
        </div>

        <section aria-label="Page cover" className={`cover${def.id === 'home' ? '' : ' slim'}`}>
          <div className="cover-stripe" aria-hidden="true" />
          <svg className="cover-art" aria-hidden="true" width="300" height="170" viewBox="0 0 300 170">
            <path d="M30 170 V100 a45 45 0 0 1 90 0 V170" fill="none" stroke="#BDB2A0" strokeWidth="2" />
            <path d="M140 170 V70 a60 60 0 0 1 120 0 V170" fill="none" stroke="#BDB2A0" strokeWidth="2" />
            <circle cx="270" cy="40" r="16" fill="none" stroke="#BDB2A0" strokeWidth="2" />
          </svg>
          <span className="lbl">{sample ? 'Sample data · ' : ''}{bannerDate()}</span>
          <div className="cover-title">
            <h1 className="chrome-text">{def.banner}</h1>
            <span className="cover-sub">{def.sub}</span>
          </div>
        </section>

        <BackupReminder />

        {searching ? (
          <SearchResults query={query} onDone={() => setQuery('')} />
        ) : (
          <div className="stack" style={{ gap: 18 }}>
            {def.subs.length > 1 && (
              <nav aria-label="Subpages" className="subtabs">
                {def.subs.map(([id, label]) => (
                  <a key={id} className="subtab" href={hrefFor(def.id, id)} aria-current={route.sub === id ? 'page' : undefined}>{label}</a>
                ))}
              </nav>
            )}
            {showTrend && <TrendCards section={def.id} />}
            {Page({ param: route.param })}
          </div>
        )}
      </main>
    </div>
  );
}

function NavLink({ id, label, current, className = '' }: { id: SectionId; label: string; current: boolean; className?: string }) {
  const Icon = NAV_ICONS[id];
  return (
    <a className={`navbtn ${className}`} href={hrefFor(id)} aria-current={current ? 'page' : undefined}>
      <Icon />
      <span className="navlbl">{label}</span>
    </a>
  );
}

function StatusBlock() {
  const calendarSyncedAt = useMeta<string | null>('calendarSyncedAt', null);
  const watchSyncedAt = useMeta<string | null>('watchSyncedAt', null);
  const snap = useMeta<MoneySnapshot | null>('moneySnapshot', null);
  const today = todayISO();
  const syncLabel = (iso: string | null) => {
    if (!iso) return 'not synced yet';
    const d = iso.slice(0, 10);
    return `synced ${d === today ? '' : shortDate(d) + ' '}${timeOfDate(iso)}`.trim();
  };
  const exportDate = snap?.asOf;
  const due = exportDate ? nextMonth(exportDate) : null;
  const dueIn = due ? daysBetween(today, due) : null;
  const exportDot = dueIn === null ? 'off' : dueIn < 0 ? 'bad' : dueIn <= 3 ? 'warn' : '';
  return (
    <div className="status" aria-label="Status">
      <span className="status-line"><span className={`dot${calendarSyncedAt ? '' : ' off'}`} />Calendar {syncLabel(calendarSyncedAt)}</span>
      <span className="status-line"><span className={`dot${watchSyncedAt ? '' : ' off'}`} />Apple Watch {syncLabel(watchSyncedAt)}</span>
      <span className="status-line">
        <span className={`dot ${exportDot}`} />
        {exportDate ? `Rocket Money export ${shortDate(exportDate)}, ${dueIn! < 0 ? 'overdue since' : 'next due'} ${shortDate(due!)}` : 'No Rocket Money export yet'}
      </span>
      <span className="status-line"><span className="dot" />Saved on this phone</span>
      <a className="status-line" href={hrefFor('settings')} style={{ minHeight: 32 }}>Settings and backups</a>
    </div>
  );
}
