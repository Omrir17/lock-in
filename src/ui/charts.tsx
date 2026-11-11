import { useState } from 'react';

/* Small single-series SVG charts. One color (--court), text in ink tokens,
   hairline grid, tap/hover shows the value. Charts read left→right in time even in RTL. */

const W = 340;

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

export function Columns({ data, goal, height = 150, unit }: {
  data: { label: string; value: number; tip: string; current?: boolean }[];
  goal?: number;
  height?: number;
  unit?: string;
}) {
  const [hot, setHot] = useState<number | null>(null);
  const padT = 14, padB = 22, padL = 22;
  const max = niceMax(Math.max(goal ?? 0, ...data.map((d) => d.value), 1));
  const plotH = height - padT - padB;
  const slot = (W - padL) / data.length;
  const bw = Math.min(20, slot * 0.62);
  const y = (v: number) => padT + plotH - (v / max) * plotH;
  const step = Math.ceil(data.length / 6);
  const ticks = max <= 5 ? Array.from({ length: max + 1 }, (_, i) => i) : [0, max / 2, max];
  return (
    <div className="chart" dir="ltr">
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={data.map((d) => d.tip).join(', ')} onMouseLeave={() => setHot(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W} y1={y(t)} y2={y(t)} className="grid" />
            <text x={padL - 6} y={y(t) + 4} className="tick" textAnchor="end">{t}</text>
          </g>
        ))}
        {goal != null && <line x1={padL} x2={W} y1={y(goal)} y2={y(goal)} className="goal" />}
        {data.map((d, i) => {
          const cx = padL + slot * i + slot / 2;
          const h = Math.max(0, (d.value / max) * plotH);
          const r = Math.min(4, h / 2, bw / 2);
          const x0 = cx - bw / 2, yb = padT + plotH, yt = yb - h;
          const path = h > 0
            ? `M${x0},${yb} V${yt + r} Q${x0},${yt} ${x0 + r},${yt} H${x0 + bw - r} Q${x0 + bw},${yt} ${x0 + bw},${yt + r} V${yb} Z`
            : '';
          return (
            <g key={i} onMouseEnter={() => setHot(i)} onClick={() => setHot(hot === i ? null : i)}>
              <rect x={cx - slot / 2} y={padT} width={slot} height={plotH + padB} fill="transparent" />
              {path && <path d={path} className={'bar' + (d.current ? ' current' : '') + (hot === i ? ' hot' : '')} />}
              {((i % step === 0 && data.length - 1 - i >= step) || i === data.length - 1) && (
                <text x={cx} y={height - 6} className="tick" textAnchor="middle">{d.label}</text>
              )}
            </g>
          );
        })}
      </svg>
      {hot != null && <div className="tip" dir="rtl">{data[hot].tip}{unit ? ` ${unit}` : ''}</div>}
    </div>
  );
}

export function Line({ points, height = 140, unit, fmtX }: {
  points: { x: string; y: number; tip?: string }[];
  height?: number;
  unit?: string;
  fmtX: (x: string) => string;
}) {
  const [hot, setHot] = useState<number | null>(null);
  if (points.length === 0) return null;
  const padT = 16, padB = 22, padL = 30, padR = 30;
  const ys = points.map((p) => p.y);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const span = hi - lo;
  lo -= span * 0.15; hi += span * 0.15;
  const plotH = height - padT - padB, plotW = W - padL - padR;
  const x = (i: number) => padL + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => padT + plotH - ((v - lo) / (hi - lo)) * plotH;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ');
  const area = `${d} L${x(points.length - 1)},${padT + plotH} L${x(0)},${padT + plotH} Z`;
  const last = points.length - 1;
  const fmt = (v: number) => (Math.round(v * 10) / 10).toString();
  const nearest = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * W;
    let best = 0;
    points.forEach((_, i) => { if (Math.abs(x(i) - sx) < Math.abs(x(best) - sx)) best = i; });
    setHot(best);
  };
  return (
    <div className="chart" dir="ltr">
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={points.map((p) => `${fmtX(p.x)}: ${fmt(p.y)}`).join(', ')}
        onMouseMove={(e) => nearest(e.clientX, e.currentTarget)} onMouseLeave={() => setHot(null)}
        onClick={(e) => nearest(e.clientX, e.currentTarget)}>
        {[...new Set([Math.min(...ys), Math.max(...ys)])].map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className="grid" />
            <text x={padL - 6} y={y(t) + 4} className="tick" textAnchor="end">{fmt(t)}</text>
          </g>
        ))}
        <path d={area} className="area" />
        <path d={d} className="line" />
        {hot != null && <line x1={x(hot)} x2={x(hot)} y1={padT} y2={padT + plotH} className="cross" />}
        {points.map((p, i) => (i === last || i === hot) && (
          <circle key={i} cx={x(i)} cy={y(p.y)} r={i === hot ? 5 : 4.5} className="dot" />
        ))}
        <text x={x(last) + 8} y={y(points[last].y) + 4} className="endval">{fmt(points[last].y)}</text>
        <text x={padL} y={height - 6} className="tick">{fmtX(points[0].x)}</text>
        {points.length > 1 && <text x={W - padR} y={height - 6} className="tick" textAnchor="end">{fmtX(points[last].x)}</text>}
      </svg>
      {hot != null && <div className="tip" dir="rtl">{fmtX(points[hot].x)}: {points[hot].tip ?? `${fmt(points[hot].y)}${unit ? ' ' + unit : ''}`}</div>}
    </div>
  );
}

export function HBars({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="hbars">
      {data.map((d) => (
        <div className="hbar" key={d.label}>
          <span className="hbar-label">{d.label}</span>
          <span className="hbar-track"><span className="hbar-fill" style={{ width: `${(d.value / max) * 100}%` }} /></span>
          <span className="hbar-val">{d.value}</span>
        </div>
      ))}
    </div>
  );
}
