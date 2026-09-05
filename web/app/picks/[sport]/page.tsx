import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GameRow } from '@/components/board/GameRow';
import { GameTile } from '@/components/board/GameTile';
import { BoardGrid } from '@/components/board/BoardGrid';
import { BookDayProvider } from '@/components/book/BookDay';
import { ambiguousGamePickReceiptKeys } from '@/lib/book/model';
import { UnderlineTabs } from '@/components/UnderlineTabs';
import { PageMasthead, StitchRule } from '@/components/Terminal';
import { LiveScoreStrip } from '@/components/LiveChip';
import { JsonLd } from '@/components/JsonLd';
import { fetchTodayGamePicks } from '@/lib/gary/picks';
import { fetchPublishedPickPaths, publishedPickPath } from '@/lib/gary/pick-links';
import { buildBoard, fetchDailySlate } from '@/lib/gary/board';
import { fetchAllGameResults, computeRecord, sinceDate } from '@/lib/gary/results';
import { normalizeLeague, SPORTS, sportBySlug } from '@/lib/gary/leagues';
import { todayEST, daysAgoEST, nowMs } from '@/lib/gary/dates';
import { fetchLeagueDates } from '@/lib/gary/gamepage';
import { pageMetadata } from '@/lib/seo/metadata';

export const revalidate = 600;
// Unknown slugs 404 at the router — no SSR pass or data fetch for garbage paths.
export const dynamicParams = false;

export function generateStaticParams() {
  return SPORTS.map(s => ({ sport: s.slug }));
}

const researchLens: Record<string, string> = {
  MLB: 'starting pitching, bullpen availability, lineup and platoon context, venue conditions, and the market price',
  NBA: 'player availability, rest and travel, recent team data, matchup context, and the market price',
  NHL: 'goaltending and player availability, schedule context, recent team data, venue, and the market price',
  NFL: 'player availability, rest, matchup and venue conditions, weather where relevant, and the market price',
  NCAAB: 'guard-play and availability, rest, recent team data, home-court context, and the market price',
  NCAAF: 'player availability, rest, matchup and venue conditions, weather where relevant, and the market price',
  WC: 'team availability, recent match data, tournament context, venue conditions, and the market price',
};

function SportGuide({ cfg, lastBoard }: { cfg: NonNullable<ReturnType<typeof sportBySlug>>; lastBoard: string | null }) {
  return (
    <section className="mt-16" aria-labelledby="sport-guide-heading">
      <h2 id="sport-guide-heading" className="font-display text-2xl uppercase text-hi">
        How Gary {cfg.retired ? 'covered' : 'covers'} {cfg.name}
      </h2>
      <StitchRule tone="faint" className="mt-4" />
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-card border border-line bg-card p-5">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-gold">The research</p>
          <p className="mt-2 text-[14px] leading-relaxed text-mid">
            Each {cfg.name} board is built from {researchLens[cfg.code] ?? 'current matchup data, availability, venue context, and the market price'}. Missing inputs are treated as gaps, not filled with guesses.
          </p>
        </div>
        <div className="rounded-card border border-line bg-card p-5">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-gold">The call</p>
          <p className="mt-2 text-[14px] leading-relaxed text-mid">
            Moneyline, spread, and total markets appear when they are part of the stored board. Every posted call carries Gary&apos;s written reasoning and displayed confidence; no pick is added merely to fill a page.
          </p>
        </div>
        <div className="rounded-card border border-line bg-card p-5">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-gold">The receipt</p>
          <p className="mt-2 text-[14px] leading-relaxed text-mid">
            The result is graded after the final and stays in the public ledger, including losses and pushes. Historical boards link to permanent matchup pages whenever the original analysis is available.
          </p>
        </div>
      </div>
      <p className="mt-5 text-[13.5px] leading-relaxed text-low">
        Read the <Link href="/how-it-works" className="text-gold underline decoration-gold/40 underline-offset-4">full methodology</Link>,{' '}
        <Link href="/data-sources" className="text-gold underline decoration-gold/40 underline-offset-4">data-source policy</Link>, and{' '}
        <Link href={`/results/${cfg.slug}`} className="text-gold underline decoration-gold/40 underline-offset-4">complete {cfg.name} record</Link>
        {lastBoard ? <>, or revisit the <Link href={`/picks/${cfg.slug}/${lastBoard}`} className="text-gold underline decoration-gold/40 underline-offset-4">latest completed board</Link></> : null}.
      </p>
    </section>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ sport: string }> }): Promise<Metadata> {
  const { sport } = await params;
  const cfg = sportBySlug(sport);
  if (!cfg) return {};
  // Tournament over (Jul 19 2026): the page keeps its search equity but sells
  // the complete graded record, not a daily slate that no longer exists.
  if (cfg.code === 'WC') {
    return pageMetadata({
      canonical: '/picks/world-cup',
      title: 'World Cup 2026 Picks — The Complete Graded Record | Gary AI',
      description:
        'Gary picked every match of the 2026 FIFA World Cup with written reasoning, and every result is graded on the public record — through the final.',
    });
  }
  if (cfg.retired) {
    return pageMetadata({
      canonical: `/picks/${cfg.slug}`,
      title: `${cfg.name} Picks Archive — Gary's Graded Record | Gary AI`,
      description: `Gary no longer publishes new ${cfg.name} picks. Explore the historical boards, original reasoning where available, and graded record.`,
    });
  }
  return pageMetadata({
    canonical: `/picks/${cfg.slug}`,
    title: `Free ${cfg.longName} Picks Today — With Reasoning | Gary AI`,
    description: `Gary's free ${cfg.longName} picks for today with written rationale, confidence ratings, and a public graded track record. Updated daily.`,
  });
}

export default async function SportPicksPage({ params }: { params: Promise<{ sport: string }> }) {
  const { sport } = await params;
  const cfg = sportBySlug(sport);
  if (!cfg) notFound();

  const date = todayEST();
  const now = nowMs();
  // Active boards need both feeds. Let ISR preserve its last good render
  // on failure; retired archives do not depend on today's feeds.
  const [allPicks, slate, results, leagueDates] = await Promise.all([
    cfg.retired ? Promise.resolve([]) : fetchTodayGamePicks(),
    cfg.retired ? Promise.resolve([]) : fetchDailySlate(date),
    fetchAllGameResults().catch(() => null),
    fetchLeagueDates(cfg.code).catch(() => [] as string[]),
  ]);
  // The most recent past day this league had a board — the door into the
  // per-game pages (every pick ever published, graded, on its own URL).
  const lastBoard = leagueDates.find(d => d < date) ?? null;

  const picks = allPicks
    ? allPicks.filter(p => normalizeLeague(p.league, p.sport) === cfg.code)
    : null;
  const publishedPaths = await fetchPublishedPickPaths(picks ?? [], date).catch(() => new Set<string>());

  // Same board as /picks, narrowed to this league: every game shows, posted or
  // not, so a quiet morning reads as a schedule instead of an empty page.
  const board = buildBoard(
    slate.filter(r => (normalizeLeague(r.league) ?? '') === cfg.code),
    picks ?? [],
  );

  // Results data — null means we OMIT the record line entirely (never show 0-0)
  const allTime = results
    ? computeRecord(results.filter(r => (r.league ?? '').toUpperCase() === cfg.code))
    : null;
  const l30 = results
    ? computeRecord(sinceDate(
        results.filter(r => (r.league ?? '').toUpperCase() === cfg.code),
        daysAgoEST(30),
      ))
    : null;

  return (
    <main className="mx-auto max-w-6xl px-5 pb-20 pt-12">
      {picks && picks.length > 0 && (
        <JsonLd data={{
          '@context': 'https://schema.org', '@type': 'ItemList',
          name: `Gary AI free ${cfg.longName} picks`,
          numberOfItems: picks.length,
          itemListElement: picks.slice(0, 25).map((p, i) => ({
            '@type': 'ListItem', position: i + 1, name: `${p.awayTeam} @ ${p.homeTeam}: ${p.pick}`,
          })),
        }} />
      )}
      <JsonLd data={{
        '@context': 'https://schema.org', '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Gary AI', item: 'https://www.betwithgary.ai/' },
          { '@type': 'ListItem', position: 2, name: "Today's Picks", item: 'https://www.betwithgary.ai/picks' },
          { '@type': 'ListItem', position: 3, name: cfg.longName, item: `https://www.betwithgary.ai/picks/${cfg.slug}` },
        ],
      }} />
      <PageMasthead
        title={cfg.code === 'WC' ? 'World Cup 2026 — the graded record' : cfg.retired ? `${cfg.name} picks archive` : `Today's free ${cfg.name} picks`}
        meta={cfg.retired ? cfg.code : `${cfg.code} · ${todayEST()}`}
      >
        {allTime && l30 && (
          <p className="tnum mt-3 font-mono text-[12px] text-low">
            {cfg.code} RECORD · L30 {l30.wins}-{l30.losses} · ALL-TIME {allTime.wins}-{allTime.losses}
            {allTime.graded > 0 ? ` (${allTime.pct}%)` : ''} ·{' '}
            <Link href={`/results/${cfg.slug}`} className="text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold">FULL RECORD</Link>
          </p>
        )}
      </PageMasthead>

      <UnderlineTabs
        className="mt-6"
        items={[
          { href: '/picks', label: 'All sports' },
          ...SPORTS.filter(s => !s.retired || s.slug === sport).map(s => ({
            href: `/picks/${s.slug}`,
            label: s.name,
            active: s.slug === sport,
          })),
        ]}
      />

      {!cfg.retired && <div className="mt-5"><LiveScoreStrip date={date} leagues={[cfg.code]} /></div>}

      {lastBoard && (
        <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.05em] text-low">
          <Link href={`/picks/${cfg.slug}/${lastBoard}`} className="text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light">
            Last board, graded · {lastBoard}
          </Link>
          <span className="mx-2" aria-hidden>·</span>
          <Link href="/archive" className="text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light">
            Every day on the record
          </Link>
        </p>
      )}

      {board.length === 0 ? (
        <div className="mt-10 flex flex-col items-center justify-center rounded-card border border-line bg-card p-10 text-center">
          <Image src="/brand/gary-cooking.png" alt="" aria-hidden width={110} height={110} />
          <p className="mt-3 text-[15px] text-mid">
            {cfg.retired ? (
              <>{cfg.code === 'WC'
                ? 'The 2026 tournament is complete — Gary picked every match through the final. See the'
                : `Gary no longer publishes new ${cfg.name} picks. Explore the historical boards above and the`}{' '}
              <Link href={`/results/${cfg.slug}`} className="text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold">{cfg.name} record</Link>
              {allTime && allTime.graded > 0 ? <> (<span className="tnum font-mono">{allTime.wins}-{allTime.losses}</span>)</> : null}.</>
            ) : (
            <>No {cfg.name} picks on today&apos;s board{allTime && allTime.graded > 0 ? (
              <> — see the <Link href={`/results/${cfg.slug}`} className="text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold">graded {cfg.name} record</Link> (<span className="tnum font-mono">{allTime.wins}-{allTime.losses}</span>) while the season&apos;s quiet.</>
            ) : '.'}</>
            )}
          </p>
        </div>
      ) : (
        <BookDayProvider
          date={date}
          ambiguousGamePickReceiptKeys={ambiguousGamePickReceiptKeys(allPicks ?? [], date)}
        >
          <div className="mt-8">
            <BoardGrid
              items={board.map(g => ({
                key: g.key,
                label: `${g.away} at ${g.home}`,
                tile: <GameTile game={g} now={now} />,
                panel: <GameRow game={g} now={now} analysisHref={publishedPickPath(g.pick, date, publishedPaths)} />,
              }))}
            />
          </div>
        </BookDayProvider>
      )}

      <SportGuide cfg={cfg} lastBoard={lastBoard} />
    </main>
  );
}
