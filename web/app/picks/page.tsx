import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Eyebrow } from '@/components/Eyebrow';
import { GameRow, Slab } from '@/components/board/GameRow';
import { GameTile } from '@/components/board/GameTile';
import { BoardGrid } from '@/components/board/BoardGrid';
import { BookDayProvider } from '@/components/book/BookDay';
import { AccountCta } from '@/components/AccountCta';
import { ReceiptLine } from '@/components/ReceiptLine';
import { UnderlineTabs } from '@/components/UnderlineTabs';
import { PageMasthead, StitchRule } from '@/components/Terminal';
import { LiveScoreStrip } from '@/components/LiveChip';
import { JsonLd } from '@/components/JsonLd';
import { fetchTodayGamePicks, selectTopPick } from '@/lib/gary/picks';
import { fetchPublishedPickPaths, publishedPickPath } from '@/lib/gary/pick-links';
import { boardLeagues, buildBoard, fetchDailySlate } from '@/lib/gary/board';
import { computeRecord, fetchGameResultsForDate } from '@/lib/gary/results';
import { etDateLabel, etTime, oddsText } from '@/lib/gary/format';
import { hubGradedDateEST, nowMs, todayEST } from '@/lib/gary/dates';
import { SPORTS, sportByCode } from '@/lib/gary/leagues';
import type { GaryPick } from '@/lib/gary/types';
import { pageMetadata } from '@/lib/seo/metadata';
import { ambiguousGamePickReceiptKeys } from '@/lib/book/model';

export const revalidate = 600;

export const metadata: Metadata = pageMetadata({
  canonical: '/picks',
  title: "Today's Free Sports Picks — Full Slate | Gary AI",
  description:
    "The whole board, game by game: opening lines, first pitch, and Gary's pick with the reasoning behind it the moment it posts. Always free.",
});

/**
 * The headline call as a band, not a second copy of the card — the game's own
 * row carries the reasoning further down the board, and printing 600 words
 * twice is how a page starts to feel like filler.
 */
function TopCallBand({ pick }: { pick: GaryPick }) {
  const conf = pick.confidence ? Math.round(pick.confidence * 100) : null;
  const label = (pick.pick ?? '').replace(/[+-]\d{3,}\s*$/, '').trim();
  const odds = oddsText(pick.odds ?? (pick.pick ?? '').match(/[+-]\d{3,}\s*$/)?.[0]);
  const time = etTime(pick.commence_time) ?? pick.time;

  return (
    <section className="rounded-card border border-gold/40 bg-card px-5 py-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
        <span className="flex items-center gap-2.5">
          <Slab />
          <Eyebrow>Gary&apos;s top call</Eyebrow>
        </span>
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-low">
          {[pick.awayTeam && pick.homeTeam ? `${pick.awayTeam} @ ${pick.homeTeam}` : null, time]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>
      <div className="mt-2.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-display text-[clamp(1.7rem,4.4vw,2.3rem)] uppercase leading-none text-gold">
          {label}
        </span>
        {odds && <span className="tnum font-display text-[clamp(1.1rem,2.6vw,1.4rem)] text-hi/90">{odds}</span>}
        {conf !== null && (
          <span className="tnum font-mono text-[11.5px] font-bold uppercase tracking-[0.06em] text-low">
            {conf}% conviction
          </span>
        )}
      </div>
    </section>
  );
}

export default async function PicksPage() {
  const date = todayEST();
  const graded = hubGradedDateEST();
  const [picks, slate, gradedRows] = await Promise.all([
    fetchTodayGamePicks().catch(() => [] as GaryPick[]),
    fetchDailySlate(date).catch(() => []),
    fetchGameResultsForDate(graded).catch(() => []),
  ]);

  const board = buildBoard(slate, picks);
  const publishedPaths = await fetchPublishedPickPaths(picks, date).catch(() => new Set<string>());
  // One clock read for the whole render — the board uses it to stop promising
  // a posting time that has already gone by.
  const now = nowMs();
  const leagues = boardLeagues(board);
  const topPick = picks.length > 0 ? selectTopPick(picks) : null;
  const yesterday = computeRecord(gradedRows);
  const posted = board.filter(g => g.pick).length;

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Gary AI free sports picks for ${date}`,
    numberOfItems: picks.length,
    itemListElement: picks.slice(0, 25).map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: `${p.awayTeam} @ ${p.homeTeam}: ${p.pick}`,
    })),
  };

  const tabs = [
    { href: '/picks', label: 'All sports', active: true },
    ...SPORTS.filter(s => !s.retired).map(s => ({ href: `/picks/${s.slug}`, label: s.name })),
  ];

  return (
    <main className="mx-auto max-w-6xl px-5 pb-20 pt-12">
      {picks.length > 0 && <JsonLd data={itemList} />}
      <PageMasthead
        title="Today's free sports picks"
        meta={etDateLabel(date)}
        sub="The whole board, game by game. Gary posts each call about 90 minutes before first pitch — every game on this page tells you where its call stands."
      />

      <div className="mt-4">
        <ReceiptLine label="Yesterday" record={yesterday} href="/results" />
      </div>

      <UnderlineTabs items={tabs} className="mt-6" />

      <div className="mt-5">
        <LiveScoreStrip date={date} />
      </div>

      {topPick && (
        <div className="mt-7">
          <TopCallBand pick={topPick} />
        </div>
      )}

      {picks.length === 0 && (
        <aside className="mt-6 rounded-card border border-gold/30 bg-card px-5 py-4">
          <p className="text-[14px] leading-relaxed text-mid">
            No picks are published here yet today. Want to see how Gary thinks?{' '}
            <Link href="/archive" className="text-gold underline decoration-gold/40 underline-offset-4">
              Read previous picks and reasoning
            </Link>.
            {' '}The archive is historical; today&apos;s calls appear on this board as they publish.
          </p>
        </aside>
      )}

      <AccountCta
        nextPath="/picks"
        title="Call your side before the game"
        body="Tail Gary or fade him, then let My Book grade your prediction automatically. It tracks a record—no wager is placed."
        className="mt-7"
      />

      {board.length > 0 && (
        <BookDayProvider
          date={date}
          ambiguousGamePickReceiptKeys={ambiguousGamePickReceiptKeys(picks, date)}
        >
          <section className="mt-11">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="font-display text-[1.6rem] uppercase leading-none text-hi">The board</h2>
              <span className="tnum font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-low">
                {board.length} games · {posted} posted
              </span>
            </div>
            <StitchRule tone="faint" className="mt-4" />

            {leagues.length > 1 ? (
              leagues.map(code => (
                <div key={code} className="mt-8">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: sportByCode(code)?.accent ?? '#666' }}
                    />
                    <h3 className="font-mono text-[12px] font-bold uppercase tracking-[0.07em] text-hi">
                      {sportByCode(code)?.longName ?? code}
                    </h3>
                  </div>
                  <div className="mt-4">
                    <BoardGrid
                      items={board
                        .filter(g => g.league === code)
                        .map(g => ({
                          key: g.key,
                          label: `${g.away} at ${g.home}`,
                          tile: <GameTile game={g} now={now} />,
                          panel: <GameRow game={g} now={now} analysisHref={publishedPickPath(g.pick, date, publishedPaths)} />,
                        }))}
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="mt-6">
                <BoardGrid
                  items={board.map(g => ({
                    key: g.key,
                    label: `${g.away} at ${g.home}`,
                    tile: <GameTile game={g} now={now} />,
                    panel: <GameRow game={g} now={now} analysisHref={publishedPickPath(g.pick, date, publishedPaths)} />,
                  }))}
                />
              </div>
            )}
          </section>
        </BookDayProvider>
      )}

      {board.length === 0 && (
        <div className="mt-8 flex flex-col items-center justify-center rounded-panel border border-line bg-card p-10 text-center">
          <Image src="/brand/gary-cooking.png" alt="" aria-hidden width={110} height={110} />
          <p className="mt-3 text-[15px] text-mid">
            Today&apos;s schedule is not available here yet. The{' '}
            <Link
              href="/results"
              className="text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold"
            >
              track record
            </Link>{' '}
            is up meanwhile.
          </p>
        </div>
      )}
    </main>
  );
}
