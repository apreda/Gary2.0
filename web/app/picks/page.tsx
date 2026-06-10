import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { PickCard } from '@/components/PickCard';
import { Eyebrow } from '@/components/Eyebrow';
import { PageMasthead, StitchRule } from '@/components/Terminal';
import { LiveScoreStrip } from '@/components/LiveChip';
import { JsonLd } from '@/components/JsonLd';
import { fetchTodayGamePicks, groupPicksByLeague, selectTopPick } from '@/lib/gary/picks';
import { effectiveOdds } from '@/lib/gary/results';
import { todayEST } from '@/lib/gary/dates';
import { SPORTS, sportByCode } from '@/lib/gary/leagues';
import type { GaryPick } from '@/lib/gary/types';

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Today's Free Sports Picks — Full Slate | Gary AI",
  description:
    "Every game on today's board with Gary's pick, written reasoning, and confidence rating. NBA, MLB, NHL, NFL, college, and the 2026 World Cup. Always free.",
  alternates: { canonical: '/picks' },
};

/**
 * The day's lead call — a full-width gold panel above the league grids.
 * Same card language as PickCard: gold-stroked matte card, matte gold chip,
 * CONF bar; the rationale runs in full here instead of clamping.
 */
function FeaturedPick({ pick }: { pick: GaryPick }) {
  const league = (pick.league ?? '').toUpperCase();
  const rawOdds = pick.odds ?? effectiveOdds(pick.pick);
  const conf = pick.confidence ? Math.round(pick.confidence * 100) : null;
  const take = pick.rationale?.replace(/^Gary's Take\s*/i, '').trim();
  const pickLabel = (pick.pick ?? '').replace(/[+-]\d{3,}\s*$/, '').trim();

  return (
    <section className="mt-10 rounded-card border border-gold/40 bg-card p-6 shadow-card">
      <div className="grid gap-6 md:grid-cols-[1fr_320px] md:items-center">
        <div className="min-w-0">
          <Eyebrow>GARY&apos;S TOP CALL · {league}{pick.time ? ` ${pick.time}` : ''}</Eyebrow>
          <h2 className="mt-2.5 font-display text-3xl leading-tight text-hi md:text-4xl">
            {pick.awayTeam} @ {pick.homeTeam}
          </h2>
          {take && <p className="mt-3 text-[15px] leading-relaxed text-mid">{take}</p>}
        </div>
        <div>
          <div className="flex items-center justify-between gap-3 rounded-chip border border-gold/70 bg-chip px-4 py-3">
            <span className="font-mono text-sm font-bold tracking-[0.04em] text-gold">{pickLabel}</span>
            {rawOdds != null && (
              <span className="tnum font-mono text-sm font-bold text-low">
                {typeof rawOdds === 'number' && rawOdds > 0 ? `+${rawOdds}` : rawOdds}
              </span>
            )}
          </div>
          {conf !== null && (
            <div className="mt-3 flex items-center gap-2">
              <Eyebrow dim>CONF</Eyebrow>
              <div className="h-1 flex-1 rounded bg-white/10">
                <div className="h-1 rounded bg-gold" style={{ width: `${conf}%` }} />
              </div>
              <span className="tnum font-mono text-[11px] text-mid">{conf}%</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default async function PicksPage() {
  const date = todayEST();
  const picks = await fetchTodayGamePicks().catch(() => null);
  const topPick = picks && picks.length > 0 ? selectTopPick(picks) : null;
  const gridPicks = topPick ? picks!.filter(p => p !== topPick) : picks;
  const byLeague: Map<string, GaryPick[]> = gridPicks ? groupPicksByLeague(gridPicks) : new Map();
  const leaguesInPlay = [...byLeague.keys()];

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Gary AI free sports picks for ${date}`,
    numberOfItems: picks?.length ?? 0,
    itemListElement: (picks ?? []).slice(0, 25).map((p, i) => ({
      '@type': 'ListItem', position: i + 1, name: `${p.awayTeam} @ ${p.homeTeam}: ${p.pick}`,
    })),
  };

  return (
    <main className="mx-auto max-w-6xl px-5 py-16">
      {picks && picks.length > 0 && <JsonLd data={itemList} />}
      <PageMasthead
        title="Today's picks"
        meta={date}
        sub="The full slate, graded every morning."
      />

      <div className="mt-7 flex flex-wrap gap-2">
        {SPORTS.map(s => (
          <Link
            key={s.slug}
            href={`/picks/${s.slug}`}
            className="rounded-chip border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.04em] text-low transition-colors hover:border-gold/60 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
          >
            {s.name}
          </Link>
        ))}
      </div>

      <div className="mt-5"><LiveScoreStrip date={date} /></div>

      {topPick && <FeaturedPick pick={topPick} />}

      {(!picks || picks.length === 0) && (
        <div className="mt-10 flex flex-col items-center justify-center rounded-card border border-line bg-card p-10 text-center">
          <Image src="/brand/gary-cooking.png" alt="" aria-hidden width={110} height={110} />
          <p className="mt-3 text-[15px] text-mid">
            Today&apos;s slate hasn&apos;t dropped yet. Picks land every morning —
            check the <Link href="/results" className="text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold">track record</Link> meanwhile.
          </p>
        </div>
      )}

      {leaguesInPlay.map(code => (
        <section key={code} className="mt-16">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: sportByCode(code)?.accent ?? '#666' }} />
            <h2 className="font-display text-2xl uppercase text-hi">{sportByCode(code)?.longName ?? code}</h2>
            <span className="tnum font-mono text-[11px] uppercase tracking-[0.04em] text-low">{byLeague.get(code)!.length} PICKS</span>
          </div>
          <StitchRule tone="faint" className="mt-3" />
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            {byLeague.get(code)!.map((p, i) => <PickCard key={p.pick_id ?? i} pick={p} />)}
          </div>
        </section>
      ))}
    </main>
  );
}
