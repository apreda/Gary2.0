import Image from 'next/image';
import type { Metadata } from 'next';
import { Eyebrow } from '@/components/Eyebrow';
import { PropCard } from '@/components/PropCard';
import { PageMasthead, StitchRule } from '@/components/Terminal';
import { fetchTodayPropPicks, splitHrThreats, selectTopProps } from '@/lib/gary/picks';
import { normalizeLeague } from '@/lib/gary/leagues';
import { todayEST } from '@/lib/gary/dates';
import type { PropPick } from '@/lib/gary/types';

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Today's Free Player Prop Picks | Gary AI",
  description:
    "Free player prop picks with the key stats behind each call, plus Gary's Home Run Threats board. Graded daily on the public record.",
  alternates: { canonical: '/props' },
};

/* ── In-page presentation helpers ──────────────────────────────────────────
   The matte call chip is the PropCard anatomy verbatim: silver stroke,
   OVER wears gold, UNDER goes silver, odds stand aside in grey.           */

function CallChip({ prop, compact = false }: { prop: PropPick; compact?: boolean }) {
  const bet = (prop.bet ?? '').toLowerCase();
  const callColor = bet === 'over' || bet === 'yes' ? 'text-gold' : 'text-silver';
  const odds = prop.odds;
  const text = compact ? 'text-[12px]' : 'text-sm';
  return (
    <div className={`flex items-center justify-between gap-3 rounded-chip border border-silver/55 bg-chip ${compact ? 'px-3 py-2' : 'px-4 py-2.5'}`}>
      <span className={`font-mono ${text} font-bold uppercase tracking-[0.04em] ${callColor}`}>
        {prop.bet} {prop.line} {prop.prop?.replace(/\s[\d.]+$/, '')}
      </span>
      {odds != null && (
        <span className={`tnum font-mono ${text} font-bold text-silver-dim`}>{odds > 0 ? `+${odds}` : odds}</span>
      )}
    </div>
  );
}

/** The day's highest-confidence prop as a full-width slip — rationale uncut. */
function FeaturedProp({ prop }: { prop: PropPick }) {
  const league = normalizeLeague(prop.league, prop.sport) ?? '';
  const rationale = (prop.rationale ?? prop.analysis ?? '').trim();
  return (
    <article className="quant-panel grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-start">
      <div className="min-w-0">
        {/* Brand voice wears gold; the league code is a data label and stays grey —
            and the silver props system gets no other gold (an UNDER slip below
            a gold wall would break the only-gold-is-the-OVER-call rule). */}
        <Eyebrow>Gary&apos;s Top Prop</Eyebrow>
        {league && <Eyebrow dim> · {league}</Eyebrow>}
        <h2 className="mt-2.5 font-display text-3xl uppercase leading-tight text-hi">{prop.player}</h2>
        {rationale && <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-mid">{rationale}</p>}
      </div>
      <div className="w-full shrink-0 md:w-[280px]">
        <CallChip prop={prop} />
        {Array.isArray(prop.key_stats) && prop.key_stats.length > 0 && (
          <ul className="mt-3 space-y-1">
            {prop.key_stats.slice(0, 3).map((s, i) => (
              <li key={i} className="font-mono text-[12px] text-low">· {s}</li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

/** Rail card for the HR Threats shelf — name, call, one stat. */
function CompactProp({ prop }: { prop: PropPick }) {
  const league = normalizeLeague(prop.league, prop.sport) ?? '';
  const stat = Array.isArray(prop.key_stats) ? prop.key_stats[0] : undefined;
  return (
    <li className="w-[280px] shrink-0 snap-start rounded-card border border-silver/40 bg-card p-4 shadow-card">
      <p className="leading-snug">
        <Eyebrow dim>{league}{prop.matchup ? ` · ${prop.matchup}` : ''}</Eyebrow>
      </p>
      <p className="mt-1.5 break-words text-[15px] font-medium leading-snug text-hi">{prop.player}</p>
      <div className="mt-3"><CallChip prop={prop} compact /></div>
      {stat && <p className="mt-2.5 break-words font-mono text-[12px] leading-relaxed text-low">· {stat}</p>}
    </li>
  );
}

export default async function PropsPage() {
  const props = await fetchTodayPropPicks().catch(() => null);

  // The featured slip leads the page; it leaves the boards below (reference
  // equality holds — selectTopProps copies the array, not the elements).
  const featured = props && props.length > 0 ? selectTopProps(props, 1)[0] : null;
  const boardProps = props ? props.filter(p => p !== featured) : null;

  // Guard grouping behind non-null check (resilience deviation)
  const { hr, rest } = boardProps ? splitHrThreats(boardProps) : { hr: [] as PropPick[], rest: [] as PropPick[] };

  const byLeague = new Map<string, PropPick[]>();
  if (boardProps) {
    for (const p of rest) {
      const code = normalizeLeague(p.league, p.sport) ?? 'OTHER';
      byLeague.set(code, [...(byLeague.get(code) ?? []), p]);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-5 pb-16 pt-12">
      <PageMasthead title="Props board" meta={todayEST()} />

      {featured && (
        <section className="mt-7">
          <FeaturedProp prop={featured} />
        </section>
      )}

      {hr.length > 0 && (
        <section className={featured ? 'mt-16' : 'mt-7'}>
          <h2 className="font-display text-2xl uppercase text-hi">Gary Home Run Threats</h2>
          <p className="mt-1 text-sm text-mid">Hitters with the conditions to leave the yard today.</p>
          <StitchRule tone="faint" className="mt-4" />
          <div className="rail-scroll -mx-5 mt-7 overflow-x-auto px-5 pb-2">
            <ul className="flex w-max snap-x gap-3">
              {selectTopProps(hr, 12).map((p, i) => <CompactProp key={i} prop={p} />)}
            </ul>
          </div>
        </section>
      )}

      {[...byLeague.entries()].map(([code, items]) => (
        <section key={code} className="mt-16">
          <h2 className="font-display text-2xl uppercase text-hi">{code} Props</h2>
          <StitchRule tone="faint" className="mt-4" />
          <div className="mt-7 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {selectTopProps(items, 30).map((p, i) => <PropCard key={i} prop={p} />)}
          </div>
        </section>
      ))}

      {(!props || props.length === 0) && (
        <div className="mt-7 flex flex-col items-center justify-center rounded-panel border border-line bg-card p-10 text-center">
          <Image src="/brand/gary-cooking.png" alt="" aria-hidden width={110} height={110} />
          <p className="mt-3 text-[15px] text-mid">
            Today&apos;s props haven&apos;t dropped yet — they land with the morning slate.
          </p>
        </div>
      )}
    </main>
  );
}
