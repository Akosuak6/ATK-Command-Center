import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { money, monthsUntil } from '../lib/format';

// Categorical order is fixed. Light values were validated against the linen card (#F3EEE6);
// the Moody theme swaps in lighter tints through the --series-* variables in styles.css.
export const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)'];
export const SERIES_OTHER = 'var(--series-other)';

function useWidth<T extends HTMLElement>(fallback = 320) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    if (!ref.current) return;
    setW(ref.current.clientWidth || fallback);
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width) || fallback));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [fallback]);
  return [ref, w] as const;
}

const compact = (n: number) => (n >= 10000 ? `$${Math.round(n / 1000)}K` : money(n));
function niceMax(n: number) {
  if (n <= 0) return 100;
  const p = Math.pow(10, Math.floor(Math.log10(n)));
  for (const s of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (s * p >= n) return s * p;
  return 10 * p;
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function monthLabel(offset: number, year = true) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return year ? `${MONTHS[d.getMonth()]} ${d.getFullYear()}` : `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
}

interface ProjectionProps {
  saved: number;
  target: number;
  monthly: number;
  due?: string;
  title: string;
  color?: string;
  rate?: number; // yearly growth in percent, for investments; 0 for cash
}

// Where a goal's balance goes if the monthly amount keeps going in. One series, so no legend.
export function ProjectionChart({ saved, target, monthly, due, title, color = SERIES[0], rate = 0 }: ProjectionProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => setHover(null), [saved, target, monthly]);

  const r = rate / 100 / 12;
  const grow = (m: number) => {
    let b = saved;
    for (let i = 0; i < m; i++) b = b * (1 + r) + monthly;
    return b;
  };
  let toTarget = Infinity;
  if (monthly > 0 || r > 0) {
    for (let m = 0; m <= 600; m++) if (grow(m) >= target) { toTarget = m; break; }
  }
  const toDue = due ? monthsUntil(due) : 0;
  const horizon = Math.max(6, Math.min(60, Math.max(Number.isFinite(toTarget) ? toTarget : 12, toDue) + 1));
  const values = Array.from({ length: horizon + 1 }, (_, m) => (r > 0 ? grow(m) : Math.min(target, saved + monthly * m)));

  const H = 156;
  const pad = { l: 46, r: 14, t: 18, b: 24 };
  const iw = Math.max(80, width - pad.l - pad.r);
  const ih = H - pad.t - pad.b;
  const yMax = niceMax(Math.max(target, saved, ...values));
  const x = (m: number) => pad.l + (m / horizon) * iw;
  const y = (v: number) => pad.t + ih - (v / yMax) * ih;
  const line = values.map((v, m) => `${m ? 'L' : 'M'}${x(m).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const area = `${line}L${x(horizon)},${y(0)}L${x(0)},${y(0)}Z`;
  const reachM = Number.isFinite(toTarget) && toTarget <= horizon ? toTarget : null;
  const dueM = due && toDue <= horizon ? toDue : null;
  const atDue = dueM !== null ? values[dueM] : null;
  const behind = atDue !== null && atDue < target;

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const m = Math.round(((e.clientX - r.left - pad.l) / iw) * horizon);
    setHover(Math.max(0, Math.min(horizon, m)));
  };

  const summary = `${title}: ${money(saved)} of ${money(target)} now. ${reachM !== null ? `At ${money(monthly)} a month it reaches the target in ${monthLabel(reachM)}.` : 'At the current monthly amount it does not reach the target in 5 years.'}${behind ? ` By the due date it would be at ${money(atDue!)}.` : ''}`;

  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={H} role="img" aria-label={summary}>
        {[0, yMax / 2, yMax].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={pad.l + iw} y1={y(t)} y2={y(t)} className="grid" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="tick">{compact(t)}</text>
          </g>
        ))}
        <line x1={pad.l} x2={pad.l + iw} y1={y(target)} y2={y(target)} className="ref" />
        <text x={pad.l + iw} y={y(target) - 5} textAnchor="end" className="ref-label">Target {compact(target)}</text>
        {dueM !== null && (
          <g>
            <line x1={x(dueM)} x2={x(dueM)} y1={pad.t} y2={pad.t + ih} className="ref" />
            <text x={x(dueM) + (dueM > horizon * 0.7 ? -4 : 4)} y={pad.t + ih - 6} textAnchor={dueM > horizon * 0.7 ? 'end' : 'start'} className="ref-label">Due</text>
          </g>
        )}
        <path d={area} fill={color} opacity={0.1} />
        <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(0)} cy={y(saved)} r={4} fill={color} className="dot" />
        {reachM !== null && <circle cx={x(reachM)} cy={y(target)} r={4.5} fill={color} className="dot" />}
        {behind && <circle cx={x(dueM!)} cy={y(atDue!)} r={4.5} fill="var(--rust)" className="dot" />}
        <text x={pad.l} y={H - 6} className="tick">Now</text>
        <text x={pad.l + iw} y={H - 6} textAnchor="end" className="tick">{monthLabel(horizon, false)}</text>
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} className="cross" />
        )}
        {hover !== null && <circle cx={x(hover)} cy={y(values[hover])} r={4.5} fill={color} className="dot" />}
        <rect x={pad.l} y={0} width={iw} height={H} fill="transparent" style={{ touchAction: 'pan-y' }}
          onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} />
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ left: Math.min(Math.max(x(hover), 70), width - 70) }}>
          <strong>{money(values[hover])}</strong> <span>{hover === 0 ? 'now' : monthLabel(hover)}</span>
        </div>
      )}
      <p className="sub chart-note">
        {reachM !== null ? <>Reaches the target in <strong>{monthLabel(reachM)}</strong></> : <>Not reached within 5 years at this pace</>}
        {behind && <>, <span className="bad-text">{money(atDue!)} by the due date, behind</span></>}
        {!behind && dueM !== null && reachM !== null && <>, <span className="good-text">before the due date</span></>}
        {rate > 0 && <>. Assumes {rate}% growth a year</>}
      </p>
    </div>
  );
}

export interface Segment { label: string; value: number; color: string }

// One stacked bar: how this month's savings are split. Legend always shown, values in ink.
export function StackedBar({ segments, label }: { segments: Segment[]; label: string }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const shown = segments.filter((s) => s.value > 0);
  return (
    <div className="stack-s" style={{ gap: 12 }}>
      <div className="stackbar" role="img" aria-label={`${label}: ${shown.map((s) => `${s.label} ${money(s.value)}`).join(', ')}, total ${money(total)} a month`}>
        {shown.map((s) => (
          <span key={s.label} className="stackbar-seg" style={{ flexGrow: s.value, background: s.color }} title={`${s.label}: ${money(s.value)} a month`} />
        ))}
        {shown.length === 0 && <span className="stackbar-seg" style={{ flexGrow: 1, background: 'var(--track)' }} />}
      </div>
      <ul className="legend">
        {shown.map((s) => (
          <li key={s.label}>
            <span className="swatch" style={{ background: s.color }} aria-hidden="true" />
            <span className="legend-name">{s.label}</span>
            <span className="legend-val">{money(s.value)}</span>
            <span className="sub">{total ? Math.round((s.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface BarDatum { key: string; label: string; short: string; value: number; note?: string }

// Columns from one baseline, one series (so no legend). Tap or hover a column for its value.
export function BarChart({ data, title, highlight }: { data: BarDatum[]; title: string; highlight?: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 170;
  const pad = { l: 46, r: 6, t: 14, b: 22 };
  const iw = Math.max(60, width - pad.l - pad.r);
  const ih = H - pad.t - pad.b;
  const max = niceMax(Math.max(1, ...data.map((d) => d.value)));
  const band = iw / Math.max(1, data.length);
  const bw = Math.min(24, Math.max(6, band * 0.62));
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const narrow = band < 30;
  const col = (d: BarDatum, i: number) => {
    const x = pad.l + band * i + (band - bw) / 2;
    const top = y(d.value);
    const h = pad.t + ih - top;
    if (h <= 0) return null;
    const r = Math.min(4, h, bw / 2);
    const path = `M${x},${pad.t + ih}V${top + r}Q${x},${top} ${x + r},${top}H${x + bw - r}Q${x + bw},${top} ${x + bw},${top + r}V${pad.t + ih}Z`;
    const dim = highlight && d.key !== highlight && hover !== i;
    return <path key={d.key} d={path} fill={SERIES[0]} opacity={dim ? 0.55 : 1} />;
  };
  const summary = `${title}. ${data.map((d) => `${d.label} ${money(d.value)}`).join(', ')}.`;
  const h = hover !== null ? data[hover] : null;
  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={H} role="img" aria-label={summary}>
        {[0, max / 2, max].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={pad.l + iw} y1={y(t)} y2={y(t)} className="grid" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="tick">{compact(t)}</text>
          </g>
        ))}
        {data.map(col)}
        {data.map((d, i) => (
          <text key={d.key} x={pad.l + band * i + band / 2} y={H - 6} textAnchor="middle" className="tick" fontWeight={d.key === highlight ? 700 : 400}>
            {narrow ? d.short : d.label.slice(0, 3)}
          </text>
        ))}
        {data.map((d, i) => (
          <rect key={d.key} x={pad.l + band * i} y={pad.t} width={band} height={ih + pad.b} fill="transparent"
            onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)} onPointerLeave={() => setHover(null)} />
        ))}
      </svg>
      {h && (
        <div className="chart-tip" style={{ left: Math.min(Math.max(pad.l + band * hover! + band / 2, 80), width - 80) }}>
          <strong>{money(h.value)}</strong> <span>{h.label}{h.note ? ` · ${h.note}` : ''}</span>
        </div>
      )}
    </div>
  );
}

export interface LineSeries { label: string; color: string; values: number[]; dashed?: boolean }

const bigMoney = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M` : compact(v));

// Two or three series over the same years. Legend always shown with end values; tap or hover for any year.
export function LineChart({ xs, series, title, marker, xLabel = (v: number) => String(v) }: {
  xs: number[]; series: LineSeries[]; title: string; marker?: { x: number; label: string }; xLabel?: (v: number) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 220;
  const pad = { l: 52, r: 12, t: 18, b: 26 };
  const iw = Math.max(80, width - pad.l - pad.r);
  const ih = H - pad.t - pad.b;
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const n = Math.max(1, xs.length - 1);
  const x = (i: number) => pad.l + (i / n) * iw;
  const y = (v: number) => pad.t + ih - (Math.min(v, max) / max) * ih;
  const path = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    setHover(Math.max(0, Math.min(n, Math.round(((e.clientX - box.left - pad.l) / iw) * n))));
  };
  const mi = marker ? xs.indexOf(marker.x) : -1;
  const ticks = [0, Math.round(n / 2), n];
  const summary = `${title}. ${series.map((s) => `${s.label}: ${bigMoney(s.values[0])} at ${xLabel(xs[0])}, ${bigMoney(s.values[n])} at ${xLabel(xs[n])}`).join('. ')}.${marker && mi >= 0 ? ` ${marker.label} at ${xLabel(marker.x)}.` : ''}`;
  return (
    <div className="stack-s" style={{ gap: 10 }}>
      <div className="chart" ref={ref}>
        <svg width={width} height={H} role="img" aria-label={summary}>
          {[0, max / 2, max].map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={pad.l + iw} y1={y(t)} y2={y(t)} className="grid" />
              <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="tick">{bigMoney(t)}</text>
            </g>
          ))}
          {ticks.map((i) => (
            <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === n ? 'end' : 'middle'} className="tick">{xLabel(xs[i])}</text>
          ))}
          {mi >= 0 && (
            <g>
              <line x1={x(mi)} x2={x(mi)} y1={pad.t} y2={pad.t + ih} className="ref" />
              <text x={x(mi) + (mi > n * 0.6 ? -4 : 4)} y={pad.t + 10} textAnchor={mi > n * 0.6 ? 'end' : 'start'} className="ref-label">{marker!.label}</text>
            </g>
          )}
          {series.map((s) => (
            <path key={s.label} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? '5 4' : undefined} />
          ))}
          {series.map((s) => <circle key={s.label} cx={x(n)} cy={y(s.values[n])} r={4} fill={s.color} className="dot" />)}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} className="cross" />}
          {hover !== null && series.map((s) => <circle key={s.label} cx={x(hover)} cy={y(s.values[hover])} r={4.5} fill={s.color} className="dot" />)}
          <rect x={pad.l} y={0} width={iw} height={H} fill="transparent" style={{ touchAction: 'pan-y' }} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} />
        </svg>
        {hover !== null && (
          <div className="chart-tip multi" style={{ left: Math.min(Math.max(x(hover), 100), width - 100) }}>
            <strong>{xLabel(xs[hover])}</strong>
            {series.map((s) => (
              <span key={s.label}><span className="swatch" style={{ background: s.color }} aria-hidden="true" />{s.label} {bigMoney(s.values[hover])}</span>
            ))}
          </div>
        )}
      </div>
      <ul className="legend">
        {series.map((s) => (
          <li key={s.label}>
            <span className="swatch" style={s.dashed ? { background: `repeating-linear-gradient(90deg, ${s.color} 0 4px, transparent 4px 7px)` } : { background: s.color }} aria-hidden="true" />
            <span className="legend-name">{s.label}</span>
            <span className="legend-val">{bigMoney(s.values[n])}</span>
            <span className="sub">at {xLabel(xs[n])}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
