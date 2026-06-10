import type { Metadata } from 'next';
import { Eyebrow } from '@/components/Eyebrow';
import { PageMasthead, StitchRule } from '@/components/Terminal';
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

type Tint = 'green' | 'red' | 'neutral';

function Spark({ values, tint, size = 'sm' }: { values: number[]; tint: Tint; size?: 'sm' | 'lg' }) {
  if (!values?.length) return null;
  const max = Math.max(...values.map(Math.abs), 0.0001);
  const color = tint === 'green' ? '#22C55E' : tint === 'red' ? '#EF4444' : 'rgba(255,255,255,0.5)';
  const [h, w, n] = size === 'lg' ? ['h-9', 'w-[5px]', 20] : ['h-5', 'w-[3px]', 12];
  return (
    <span className={`flex ${h} items-end gap-[2px]`}>
      {values.slice(-n).map((v, i) => (
        <span key={i} className={`${w} rounded-sm`} style={{ height: `${Math.max(15, (Math.abs(v) / max) * 100)}%`, background: color, opacity: 0.85 }} />
      ))}
    </span>
  );
}

/* ── Presentation modes — the lane decides how it's displayed ──────────────
   feature  : the league's lead insight as a full-width panel
   ranked   : numbered terminal rows, value right-aligned
   rail     : horizontal shelf (the iOS league-shelf motif)
   grid     : the classic two-up panel grid                                  */

function FeatureInsight({ row, tint }: { row: InsightRow; tint: Tint }) {
  return (
    <div className="quant-panel grid gap-5 p-6 md:grid-cols-[1fr_auto] md:items-center">
      <div className="min-w-0">
        <p className="text-[19px] font-medium leading-snug text-hi">{row.headline}</p>
        {row.detail && <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-mid">{row.detail}</p>}
        <p className="tnum mt-3 font-mono text-[11px] text-low">{row.game}</p>
      </div>
      <div className="flex shrink-0 items-center gap-5 md:flex-col md:items-end md:gap-3">
        {row.value && <span className="tnum font-mono text-[28px] font-bold leading-none text-hi">{row.value}</span>}
        {Array.isArray(row.spark) && <Spark values={row.spark} tint={tint} size="lg" />}
      </div>
    </div>
  );
}

function RankedRows({ rows, tint }: { rows: InsightRow[]; tint: Tint }) {
  return (
    <ol>
      {rows.map((row, i) => (
        <li key={row.id} className="flex items-center gap-4 border-b border-line py-3.5 last:border-0">
          <span className="tnum w-6 shrink-0 font-mono text-[12px] font-bold text-faint">
            {String(i + 1).padStart(2, '0')}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14.5px] font-medium text-hi">{row.headline}</p>
            <p className="tnum mt-0.5 truncate font-mono text-[11px] text-low">{row.game}</p>
          </div>
          {row.value && <span className="tnum shrink-0 font-mono text-sm font-bold text-hi">{row.value}</span>}
          {Array.isArray(row.spark) && <span className="hidden shrink-0 sm:block"><Spark values={row.spark} tint={tint} /></span>}
        </li>
      ))}
    </ol>
  );
}

function RailShelf({ rows, tint }: { rows: InsightRow[]; tint: Tint }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5 pb-2">
      <ul className="flex w-max snap-x gap-3">
        {rows.map(row => (
          <li key={row.id} className="quant-panel w-[260px] shrink-0 snap-start p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[14px] font-medium leading-snug text-hi">{row.headline}</p>
              {row.value && <span className="tnum shrink-0 font-mono text-sm font-bold text-hi">{row.value}</span>}
            </div>
            {row.detail && <p className="mt-1.5 text-[12.5px] leading-relaxed text-mid line-clamp-2">{row.detail}</p>}
            <div className="mt-3 flex items-end justify-between gap-3">
              <p className="tnum truncate font-mono text-[10.5px] text-low">{row.game}</p>
              {Array.isArray(row.spark) && <Spark values={row.spark} tint={tint} />}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function InsightGrid({ rows, tint }: { rows: InsightRow[]; tint: Tint }) {
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {rows.map(row => (
        <li key={row.id} className="quant-panel p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[15px] font-medium text-hi">{row.headline}</p>
              {row.detail && <p className="mt-1 text-[13px] leading-relaxed text-mid">{row.detail}</p>}
              <p className="tnum mt-2 font-mono text-[11px] text-low">{row.game}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              {row.value && <span className="tnum font-mono text-sm font-bold text-hi">{row.value}</span>}
              {Array.isArray(row.spark) && <Spark values={row.spark} tint={tint} />}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Pick the display mode from the lane's position and size — variety with intent,
    not a grid all the way down. */
function Lane({ laneIdx, rows, tint }: { laneIdx: number; rows: InsightRow[]; tint: Tint }) {
  if (laneIdx === 0) {
    const [lead, ...rest] = rows;
    return (
      <>
        <FeatureInsight row={lead} tint={tint} />
        {rest.length > 0 && <div className="mt-2"><RankedRows rows={rest.slice(0, 6)} tint={tint} /></div>}
      </>
    );
  }
  if (laneIdx === 1 && rows.length >= 3) return <RailShelf rows={rows.slice(0, 10)} tint={tint} />;
  if (laneIdx % 2 === 0) return <RankedRows rows={rows.slice(0, 6)} tint={tint} />;
  return <InsightGrid rows={rows.slice(0, 8)} tint={tint} />;
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
    <main className="mx-auto max-w-6xl px-5 pb-16 pt-12">
      <PageMasthead
        title="The hub"
        meta={todayEST()}
        sub="The angles Gary's research surfaced today — every board is graded against actual results the next morning."
      >
        {hitRate && hitRate.graded >= 5 && (
          <span className="tnum mt-3 inline-flex items-center rounded-chip border border-line bg-chip px-2.5 py-1 font-mono text-[11px] font-bold text-mid">
            {hitRate.hit} OF {hitRate.graded} HIT YDAY
          </span>
        )}
      </PageMasthead>

      {safeInsights.length === 0 && (
        <div className="mt-7 rounded-panel border border-line bg-card p-10 text-center text-low">
          Today&apos;s board is still loading — edges land with the morning research run.
        </div>
      )}

      {leagues.map((lg, i) => {
        const laneMap = groupInsightsByLane(safeInsights.filter(r => (r.league ?? '').toUpperCase() === lg));
        const lanes = LANE_ORDER.filter(k => laneMap.has(k));
        if (lanes.length === 0) return null;
        return (
          <section key={lg} className={i === 0 ? 'mt-7' : 'mt-16'}>
            {i > 0 && <StitchRule tone="faint" className="mb-10" />}
            <h2 className="font-display text-2xl uppercase text-hi">{lg === 'WC' ? '2026 World Cup' : lg}</h2>
            {lanes.map((k: LaneKey, laneIdx: number) => (
              <div key={k} className="mt-7">
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <Eyebrow>{LANES[k].chip}</Eyebrow>
                    <h3 className="mt-1 font-display text-xl uppercase text-hi">{LANES[k].title}</h3>
                  </div>
                  <span className="tnum font-mono text-[11px] text-low">{laneMap.get(k)!.length}</span>
                </div>
                <div className="mt-3">
                  <Lane laneIdx={laneIdx} rows={laneMap.get(k)!} tint={LANES[k].tint} />
                </div>
              </div>
            ))}
          </section>
        );
      })}
    </main>
  );
}
