import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { PickCard } from '@/components/PickCard';
import { PageMasthead, StitchRule } from '@/components/Terminal';
import { LiveScoreStrip } from '@/components/LiveChip';
import { JsonLd } from '@/components/JsonLd';
import { fetchTodayGamePicks, groupPicksByLeague } from '@/lib/gary/picks';
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

export default async function PicksPage() {
  const date = todayEST();
  const picks = await fetchTodayGamePicks().catch(() => null);
  const byLeague: Map<string, GaryPick[]> = picks ? groupPicksByLeague(picks) : new Map();
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
      <JsonLd data={itemList} />
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
            className="rounded-chip border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.04em] text-low transition-colors hover:border-line-strong hover:text-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
          >
            {s.name}
          </Link>
        ))}
      </div>

      <div className="mt-5"><LiveScoreStrip date={date} /></div>

      {(!picks || picks.length === 0) && (
        <div className="mt-10 flex flex-col items-center justify-center rounded-card border border-line bg-card p-10 text-center">
          <Image src="/brand/gary-cooking.png" alt="" aria-hidden width={110} height={110} />
          <p className="mt-3 text-[15px] text-mid">
            Today&apos;s slate hasn&apos;t dropped yet. Picks land every morning —
            check the <Link href="/results" className="text-hi underline decoration-gold/60 underline-offset-4 hover:decoration-gold">track record</Link> meanwhile.
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
