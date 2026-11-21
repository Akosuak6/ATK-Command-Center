import { useState } from 'react';
import { useMeta } from '../lib/db';
import type { TrendDef } from '../lib/types';
import { Chips } from './ui';

const PERIODS = [7, 30, 90] as const;
type Period = (typeof PERIODS)[number];

// Placeholder scaling until real history exists (phase 4 computes these from stored data).
const SCALE: Record<Period, number> = { 7: 0.35, 30: 1, 90: 1.9 };

function readPeriod(): Period {
  try {
    const v = Number(localStorage.getItem('trendPeriod'));
    return (PERIODS as readonly number[]).includes(v) ? (v as Period) : 30;
  } catch {
    return 30;
  }
}

export function TrendCards({ section, override }: { section: string; override?: Partial<Record<number, Partial<TrendDef>>> }) {
  const all = useMeta<Record<string, TrendDef[]>>('trends', {});
  const [period, setPeriod] = useState<Period>(readPeriod);
  const defs = all[section] ?? [];
  if (!defs.length) return null;
  const pick = (p: Period) => {
    setPeriod(p);
    try { localStorage.setItem('trendPeriod', String(p)); } catch { /* private mode */ }
  };
  return (
    <section aria-labelledby={`trend-${section}`} className="stack-s" style={{ gap: 12 }}>
      <div className="trend-head">
        <h2 className="h2" id={`trend-${section}`}>How you are doing</h2>
        <Chips label="Time period" value={period} onChange={pick} options={PERIODS.map((p) => ({ value: p, label: `${p} days` }))} />
      </div>
      <div className="trend-grid">
        {defs.map((raw, i) => {
          const d = { ...raw, ...(override?.[i] ?? {}) };
          const m = SCALE[period];
          return (
            <div className="trend" key={d.area}>
              <span className="trend-area">{d.area}</span>
              <div className="trend-nums">
                <div className="stack-s" style={{ gap: 2 }}>
                  <span className={`trend-p big ${d.p1Good ? 'good' : 'bad'}`}>
                    <span aria-hidden="true">{d.p1Up ? '↗' : '↘'} </span>
                    <span className="sr">{d.p1Up ? 'Up' : 'Down'} </span>
                    {(d.p1 * m).toFixed(1)}%
                  </span>
                  <span className="sub">{d.p1Label}{d.p1Good ? '' : ', needs attention'}</span>
                </div>
                <div className="stack-s" style={{ gap: 2, alignItems: 'flex-end', textAlign: 'right' }}>
                  <span className={`trend-p small ${d.p2Good ? 'good' : 'bad'}`}>
                    <span aria-hidden="true">{d.p2Up ? '↗' : '↘'} </span>
                    <span className="sr">{d.p2Up ? 'Up' : 'Down'} </span>
                    {(d.p2 * m).toFixed(1)}%
                  </span>
                  <span className="sub">{d.p2Label}{d.p2Good ? '' : ', needs attention'}</span>
                </div>
              </div>
              <div className="trend-foot"><span>{d.foot}</span><span>vs prior {period} days</span></div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
