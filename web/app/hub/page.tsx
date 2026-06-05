import type { Metadata } from 'next';
import { Eyebrow } from '@/components/Eyebrow';
import {
  fetchTodayInsights, fetchGradedYesterday, groupInsightsByLane,
  computeHitRate, LANES, LANE_ORDER, type LaneKey,
} from '@/lib/gary/hub';
import { todayEST } from '@/lib/gary/dates';
import type { InsightRow } from '@/lib/gary/types';

export const revalidate = 600;

export const metadata: Metadata = {
  title: "The Hub — Today's Edges & Insight Board | Gary AI",
  description:
    "Gary's daily insight board: heat checks, platoon edges, ballpark shifts, regression watches, and Home Run Threats — graded against results every morning.",
  alternates: { canonical: '/hub' },
};

function Spark({ values, tint }: { values: number[]; tint: 'green' | 'red' | 'neutral' }) {
  if (!values?.length) return null;
  const max = Math.max(...values.map(Math.abs), 0.0001);
  const color = tint === 'green' ? '#22C55E' : tint === 'red' ? '#EF4444' : 'rgba(255,255,255,0.5)';
  return (
    <span className="flex h-5 items-end gap-[2px]">
      {values.slice(-12).map((v, i) => (
        <span key={i} className="w-[3px] rounded-sm" style={{ height: `${Math.max(15, (Math.abs(v) / max) * 100)}%`, background: color, opacity: 0.85 }} />
      ))}
    </span>
  );
}

function InsightItem({ row, tint }: { row: InsightRow; tint: 'green' | 'red' | 'neutral' }) {
  return (
    <li className="rounded-[12px] border border-white/8 bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-medium text-white/90">{row.headline}</p>
          {row.detail && <p className="mt-1 text-[13px] leading-relaxed text-white/55">{row.detail}</p>}
          <p className="mt-2 font-mono text-[11px] text-white/40">{row.game}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {row.value && <span className="font-mono text-sm font-bold text-white/85">{row.value}</span>}
          {Array.isArray(row.spark) && <Spark values={row.spark} tint={tint} />}
        </div>
      </div>
    </li>
  );
}

export default async function HubPage() {
  // Mandatory resilience: both fetches .catch(() => null) so a DB error on
  // either call never crashes the page. insights null → empty-state render;
  // gradedYday null → no hit-rate badge (computeHitRate only on non-null).
  const [insights, gradedYday] = await Promise.all([
    fetchTodayInsights().catch(() => null),
    fetchGradedYesterday().catch(() => null),
  ]);

  const hitRate = gradedYday ? computeHitRate(gradedYday) : null;
  const safeInsights = insights ?? [];
  const leagues = ['MLB', 'NBA', 'WC'].filter(lg => safeInsights.some(r => (r.league ?? '').toUpperCase() === lg));

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>THE HUB · {todayEST()}</Eyebrow>
          <h1 className="mt-2 font-display text-4xl text-white/95">Today&apos;s Edges</h1>
        </div>
        {hitRate && hitRate.graded >= 5 && (
          <span className="rounded-md bg-chip px-3 py-1.5 font-mono text-[11px] font-bold text-white/70">
            {hitRate.hit} OF {hitRate.graded} HIT YDAY
          </span>
        )}
      </div>
      <p className="mt-2 max-w-2xl text-white/60">
        The angles Gary&apos;s research surfaced today — every board is graded against
        actual results the next morning.
      </p>

      {safeInsights.length === 0 && (
        <div className="mt-10 rounded-[20px] border border-white/10 bg-card p-10 text-center text-white/50">
          Today&apos;s board is still loading — edges land with the morning research run.
        </div>
      )}

      {leagues.map(lg => {
        const laneMap = groupInsightsByLane(safeInsights.filter(r => (r.league ?? '').toUpperCase() === lg));
        const lanes = LANE_ORDER.filter(k => laneMap.has(k));
        if (lanes.length === 0) return null;
        return (
          <section key={lg} className="mt-12">
            <h2 className="font-display text-2xl text-white/95">{lg === 'WC' ? '2026 World Cup' : lg}</h2>
            {lanes.map((k: LaneKey) => (
              <div key={k} className="mt-6">
                <Eyebrow>{LANES[k].chip}</Eyebrow>
                <h3 className="mt-1 font-display text-xl text-white/90">{LANES[k].title}</h3>
                <ul className="mt-3 grid gap-3 md:grid-cols-2">
                  {laneMap.get(k)!.slice(0, 8).map(row => (
                    <InsightItem key={row.id} row={row} tint={LANES[k].tint} />
                  ))}
                </ul>
              </div>
            ))}
          </section>
        );
      })}
    </main>
  );
}
