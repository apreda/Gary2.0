'use client';

import { fmtNetTotal } from '@/lib/book/model';

/**
 * THE RIDE — cumulative net, day by day. Area + line SVG with a zero
 * baseline; green when the ride is up, red when it's under water.
 */
export function RideChart({
  series,
  unitDollars,
}: {
  series: { date: string; units: number }[];
  unitDollars: number;
}) {
  if (series.length < 2) return null;

  const W = 640;
  const H = 120;
  const PAD = 6;

  const values = series.map(p => p.units);
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;

  const x = (i: number) => PAD + (i / (series.length - 1)) * (W - PAD * 2);
  const y = (v: number) => PAD + ((max - v) / span) * (H - PAD * 2);

  const line = series.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.units).toFixed(1)}`).join(' ');
  const area = `${line} L${x(series.length - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;

  const last = series[series.length - 1].units;
  const up = last >= 0;
  const tone = up ? '#3FB950' : '#E5484D';

  return (
    <section className="quant-panel overflow-hidden">
      <div className="flex items-baseline justify-between border-b border-line px-5 py-3">
        <h2 className="font-mono text-[11.5px] font-bold uppercase tracking-[0.1em] text-gold">The ride</h2>
        <span className={`tnum font-mono text-[12px] font-bold ${up ? 'text-win' : 'text-loss'}`}>
          {fmtNetTotal(last, unitDollars)}
        </span>
      </div>
      <div className="px-4 py-4">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Cumulative result over time">
          <line x1={PAD} x2={W - PAD} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.12)" strokeDasharray="3 5" />
          <path d={area} fill={tone} opacity={0.1} />
          <path d={line} fill="none" stroke={tone} strokeWidth={1.75} strokeLinejoin="round" />
          <circle cx={x(series.length - 1)} cy={y(last)} r={3} fill={tone} />
        </svg>
        <div className="mt-1 flex justify-between font-mono text-[9.5px] uppercase tracking-[0.05em] text-faint">
          <span>{series[0].date}</span>
          <span>{series[series.length - 1].date}</span>
        </div>
      </div>
    </section>
  );
}
