import type { Metadata } from 'next';
import Link from 'next/link';
import { PickCard } from '@/components/PickCard';
import { Eyebrow } from '@/components/Eyebrow';
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
    <main className="mx-auto max-w-6xl px-4 py-10">
      <JsonLd data={itemList} />
      <Eyebrow>FREE PICKS · {date}</Eyebrow>
      <h1 className="mt-2 font-display text-4xl text-white/95">Today&apos;s Picks</h1>
      <p className="mt-2 max-w-2xl text-white/60">
        The full slate, graded every morning. Sport pages:{' '}
        {SPORTS.map((s, i) => (
          <span key={s.slug}>
            {i > 0 && ' · '}
            <Link href={`/picks/${s.slug}`} className="text-white/80 underline">{s.name}</Link>
          </span>
        ))}
      </p>
      <div className="mt-4"><LiveScoreStrip date={date} /></div>

      {(!picks || picks.length === 0) && (
        <div className="mt-10 rounded-[20px] border border-white/10 bg-card p-10 text-center text-white/50">
          Today&apos;s slate hasn&apos;t dropped yet. Picks land every morning —
          check the <Link href="/results" className="text-white/80 underline">track record</Link> meanwhile.
        </div>
      )}

      {leaguesInPlay.map(code => (
        <section key={code} className="mt-10">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: sportByCode(code)?.accent ?? '#666' }} />
            <h2 className="font-display text-2xl text-white/95">{sportByCode(code)?.longName ?? code}</h2>
            <span className="font-mono text-[11px] text-white/45">{byLeague.get(code)!.length} PICKS</span>
          </div>
          <div className="mt-4 grid gap-5 md:grid-cols-2">
            {byLeague.get(code)!.map((p, i) => <PickCard key={p.pick_id ?? i} pick={p} />)}
          </div>
        </section>
      ))}
    </main>
  );
}
