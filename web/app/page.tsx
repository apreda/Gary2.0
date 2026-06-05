import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { AppStoreButton } from '@/components/AppStoreButton';
import { PickCard } from '@/components/PickCard';
import { PropCard } from '@/components/PropCard';
import { RecordTicker } from '@/components/RecordTicker';
import { Eyebrow } from '@/components/Eyebrow';
import { fetchTodayGamePicks, fetchTodayPropPicks, selectTopPick, selectTopProps } from '@/lib/gary/picks';
import { fetchAllGameResults, computeRecord, sinceDate } from '@/lib/gary/results';
import { estDateStr } from '@/lib/gary/dates';

export const revalidate = 600;

export const metadata: Metadata = {
  title: 'Gary AI — Free Sports Picks for Every Game, Every Day',
  description:
    'Free daily picks with written reasoning across NBA, NFL, NHL, MLB, NCAAB, NCAAF, and the 2026 World Cup. Public track record. Free on iOS.',
  alternates: { canonical: '/' },
};

export default async function Home() {
  const [gamePicks, propPicks, results] = await Promise.all([
    fetchTodayGamePicks().catch(() => null),
    fetchTodayPropPicks().catch(() => null),
    fetchAllGameResults().catch(() => null),
  ]);

  const topPick = gamePicks ? selectTopPick(gamePicks) : null;
  const topProp = propPicks ? selectTopProps(propPicks, 1)[0] ?? null : null;

  // Recent wins ticker and record — only when results data is available
  const recentWins = results
    ? sinceDate(results, estDateStr(new Date(Date.now() - 14 * 86400000)))
        .filter(r => r.result === 'won' && (r.pick_text || r.matchup))
        .slice(0, 10)
        .map(r => ({ league: (r.league ?? '').toUpperCase(), pick: r.pick_text ?? r.matchup ?? '', date: r.game_date ?? '' }))
    : null;

  // Last-30-day record for the proof strip — only when results data is available
  const l30 = results
    ? computeRecord(sinceDate(results, estDateStr(new Date(Date.now() - 30 * 86400000))))
    : null;
  const allTime = results ? computeRecord(results) : null;

  return (
    <main>
      {recentWins && <RecordTicker items={recentWins} />}

      {/* Hero — the bear hosts */}
      <section className="mx-auto max-w-6xl px-4 pb-12 pt-16 text-center">
        <Image src="/brand/GaryIconBG.png" alt="Gary the bear" width={140} height={140} className="mx-auto" priority />
        <h1 className="mx-auto mt-6 max-w-3xl font-display text-5xl leading-tight text-white/95 md:text-6xl">
          Every Game. Everyday. Always Free.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-white/60">
          Gary covers the full slate — not just best bets. Every pick comes with the
          reasoning behind it, and every result goes on the record.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <AppStoreButton />
          <Link href="/picks" className="rounded-xl border border-white/15 px-5 py-3 text-sm text-white/80 hover:border-white/30">
            See today&apos;s picks
          </Link>
        </div>
        {l30 && allTime && (
          <p className="mt-6 font-mono text-[12px] text-white/45">
            LAST 30 DAYS {l30.wins}-{l30.losses} · ALL-TIME {allTime.wins}-{allTime.losses} ({allTime.pct}%) ON {allTime.graded.toLocaleString()} GRADED PICKS
          </p>
        )}
      </section>

      {/* Today's free pick + prop — the data closes */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <Eyebrow>TODAY&apos;S FREE PICKS</Eyebrow>
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          {topPick ? <PickCard pick={topPick} /> : (
            <div className="rounded-[20px] border border-white/10 bg-card p-8 text-center text-white/45">
              Today&apos;s slate drops soon. Last night&apos;s results are on the <Link href="/results" className="text-white/75 underline">record</Link>.
            </div>
          )}
          {topProp && <PropCard prop={topProp} />}
        </div>
        <p className="mt-4 text-sm text-white/55">
          Full slate of Gary&apos;s picks are live. Every game covered. Completely free.{' '}
          <Link href="/picks" className="text-white/80 underline">All of today&apos;s picks →</Link>
        </p>
      </section>

      {/* How Gary works — honest, 3 steps */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <Eyebrow>HOW GARY WORKS</Eyebrow>
        <div className="mt-4 grid gap-5 md:grid-cols-3">
          {[
            ['Research', 'A research agent investigates every game with live data tools — odds, stats, injuries, splits, weather.'],
            ['The call', 'Gary weighs the evidence against each sport’s rules and makes the call, with a confidence rating.'],
            ['On the record', 'Every pick is written up, graded the next morning, and added to the public track record.'],
          ].map(([title, body], i) => (
            <div key={title} className="rounded-[12px] border border-white/10 bg-card p-6">
              <span className="font-mono text-[11px] font-bold text-white/35">0{i + 1}</span>
              <h3 className="mt-2 font-display text-xl text-white/95">{title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-white/60">{body}</p>
            </div>
          ))}
        </div>
        <Link href="/how-it-works" className="mt-4 inline-block text-sm text-white/70 underline">The full methodology →</Link>
      </section>

      {/* App tease — Winners lives in the app */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="rounded-[20px] border border-white/10 bg-elev p-8 md:flex md:items-center md:justify-between">
          <div className="max-w-xl">
            <Eyebrow>IN THE APP</Eyebrow>
            <h2 className="mt-2 font-display text-3xl text-white/95">Gary&apos;s best bets, live scores, and the full Billfold</h2>
            <p className="mt-2 text-[15px] text-white/60">
              The website carries the free slate. The app adds Winners — Gary&apos;s
              highest-conviction board — plus live game tracking and the complete
              performance ledger.
            </p>
          </div>
          <div className="mt-6 md:mt-0"><AppStoreButton /></div>
        </div>
      </section>
    </main>
  );
}
