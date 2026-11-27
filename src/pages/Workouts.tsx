import { useEffect, useState } from 'react';
import { getMeta, setMeta, useMeta } from '../lib/db';
import { shortDate, todayISO, addDays, sameMonth, weekdayShort } from '../lib/format';
import { KG_TO_LB, getHevyKey, setHevyKey, setText, syncHevy, weightText, type Workout } from '../lib/hevy';
import { workoutQuips } from '../lib/quips';
import { Chips, useToast } from '../components/ui';

const HOUR = 60 * 60 * 1000;

export function HealthWorkouts() {
  const workouts = useMeta<Workout[]>('hevyWorkouts', []);
  const syncedAt = useMeta<string>('hevySyncedAt', '');
  const unit = useMeta<'lb' | 'kg'>('hevyUnit', 'lb');
  const toast = useToast();
  const [key, setKey] = useState(getHevyKey);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);

  const sync = async (k = key, quiet = false) => {
    if (!k || busy) return;
    setBusy(true);
    setError('');
    try {
      const got = await syncHevy(k);
      if (!quiet) toast(`${got.length} workout${got.length === 1 ? '' : 's'} synced from Hevy`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Sync on open when the last sync is over an hour old.
  useEffect(() => {
    if (!key || !navigator.onLine) return;
    void getMeta<string>('hevySyncedAt', '').then((last) => {
      if (!last || Date.now() - new Date(last).getTime() > HOUR) void sync(key, true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const saveKey = () => {
    const k = draft.trim();
    if (!k) return;
    setHevyKey(k);
    setKey(k);
    setDraft('');
  };
  const removeKey = async () => {
    setHevyKey('');
    setKey('');
    await setMeta('hevyWorkouts', []);
    await setMeta('hevySyncedAt', '');
  };

  if (!key) {
    return (
      <section className="card stack" aria-labelledby="hevy-h">
        <span className="lbl">Hevy</span>
        <h2 className="h2" id="hevy-h">Connect your Hevy workouts</h2>
        <p className="body">Hevy shares workouts with Hevy Pro. Open Hevy on the web, go to Settings, then Developer, and copy your API key. Paste it here once on each device. It stays on this device only and is never part of a backup.</p>
        <a className="btn-text" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} href="https://hevy.com/settings?developer" target="_blank" rel="noreferrer">Open Hevy developer settings</a>
        <label className="lbl" htmlFor="hevy-key">API key</label>
        <input id="hevy-key" type="password" className="field" autoComplete="off" spellCheck={false} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveKey()} placeholder="Paste your Hevy API key" />
        <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} disabled={!draft.trim()} onClick={saveKey}>Connect Hevy</button>
      </section>
    );
  }

  const today = todayISO();
  const weekStart = addDays(today, -6);
  const thisMonth = workouts.filter((w) => sameMonth(w.date, today));
  const thisWeek = workouts.filter((w) => w.date >= weekStart && w.date <= today);
  const volume = thisMonth.reduce((t, w) => t + w.volumeKg, 0);
  const shown = showAll ? workouts : workouts.slice(0, 10);
  const q = workoutQuips({ week: thisWeek.length, month: thisMonth.length, liftedLb: volume * KG_TO_LB });

  return (
    <div className="stack">
      <section aria-label="Workout numbers" className="stats">
        <div className="stat"><span className="lbl">This week</span><div><span className="num">{thisWeek.length}</span><span className="unit">workouts</span></div><span className="sub quip">{q.week}</span></div>
        <div className="stat"><span className="lbl">This month</span><div><span className="num">{thisMonth.length}</span><span className="unit">workouts</span></div><span className="sub quip">{q.month}</span></div>
        <div className="stat"><span className="lbl">Lifted this month</span><div><span className="num">{volume ? weightText(volume, unit).split(' ')[0] : 0}</span><span className="unit">{unit}</span></div><span className="sub quip">{q.lifted}</span></div>
      </section>

      <section className="card stack" aria-labelledby="hevy-list-h">
        <div className="row row-wrap">
          <h2 className="h2" id="hevy-list-h">Recent workouts</h2>
          <Chips label="Weight unit" value={unit} onChange={(v) => void setMeta('hevyUnit', v)} options={[{ value: 'lb', label: 'lb' }, { value: 'kg', label: 'kg' }]} />
        </div>
        <div className="row row-wrap" style={{ alignItems: 'center' }}>
          <span className="sub" aria-live="polite">{busy ? 'Syncing from Hevy' : syncedAt ? `Synced ${new Date(syncedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Not synced yet'}</span>
          <button type="button" className="btn2" disabled={busy} onClick={() => void sync()}>{busy ? 'Syncing' : 'Sync now'}</button>
        </div>
        {error && <p className="note-box tone-tight" role="alert">{error}</p>}
        {!workouts.length && !busy && <p className="empty">No workouts from Hevy yet. Log one in Hevy, then tap Sync now.</p>}
        {shown.map((w) => (
          <details key={w.id} className="workout">
            <summary>
              <span className="workout-date"><span>{weekdayShort(w.date)}</span><span>{shortDate(w.date)}</span></span>
              <span className="workout-main">
                <strong>{w.title}</strong>
                <span className="sub">{[w.minutes ? `${w.minutes} min` : '', `${w.exercises.length} exercise${w.exercises.length === 1 ? '' : 's'}`, `${w.sets} set${w.sets === 1 ? '' : 's'}`, w.volumeKg ? weightText(w.volumeKg, unit) : ''].filter(Boolean).join(' · ')}</span>
              </span>
            </summary>
            <ul className="workout-ex">
              {w.exercises.map((e, i) => (
                <li key={i} className="row"><span>{e.title}</span><span className="sub">{e.sets} set{e.sets === 1 ? '' : 's'}{e.best ? `, best ${setText(e.best, unit)}` : ''}</span></li>
              ))}
            </ul>
          </details>
        ))}
        {workouts.length > 10 && <button type="button" className="btn-text" style={{ alignSelf: 'flex-start' }} onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${workouts.length}`}</button>}
        <button type="button" className="btn-text btn-danger" style={{ alignSelf: 'flex-start' }} onClick={() => void removeKey()}>Disconnect Hevy on this device</button>
      </section>
    </div>
  );
}
