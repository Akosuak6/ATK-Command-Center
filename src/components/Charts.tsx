import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { money, monthsUntil } from '../lib/format';

// Categorical order is fixed; validated against the linen card (#F3EEE6).
export const SERIES = ['#3A5A9E', '#B5702F', '#7E4A86'];
export const SERIES_OTHER = '#8A8478';

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
}

// Where a goal's balance goes if the monthly amount keeps going in. One series, so no legend.
export function ProjectionChart({ saved, target, monthly, due, title, color = SERIES[0] }: ProjectionProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => setHover(null), [saved, target, monthly]);

  const left = Math.max(0, target - saved);
  const toTarget = monthly > 0 ? Math.ceil(left / monthly) : Infinity;
  const toDue = due ? monthsUntil(due) : 0;
  const horizon = Math.max(6, Math.min(60, Math.max(Number.isFinite(toTarget) ? toTarget : 12, toDue) + 1));
  const values = Array.from({ length: horizon + 1 }, (_, m) => Math.min(target, saved + monthly * m));

  const H = 156;
  const pad = { l: 46, r: 14, t: 18, b: 24 };
  const iw = Math.max(80, width - pad.l - pad.r);
  const ih = H - pad.t - pad.b;
  const yMax = niceMax(Math.max(target, saved));
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
