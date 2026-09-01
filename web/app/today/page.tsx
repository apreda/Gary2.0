import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { PickCard } from '@/components/PickCard';
import { PropCard } from '@/components/PropCard';
import { ReceiptLine } from '@/components/ReceiptLine';
import { LiveScoreStrip } from '@/components/LiveChip';
import { PageMasthead, StatTile, StitchRule } from '@/components/Terminal';
import { TodayBoardStatus } from '@/components/today/TodayBoardStatus';
import { TodayBookSummary } from '@/components/today/TodayBookSummary';
import { TodayHubHighlights } from '@/components/today/TodayHubHighlights';
import { buildBoard, fetchDailySlate } from '@/lib/gary/board';
import { daysAgoEST, hubGradedDateEST, todayEST } from '@/lib/gary/dates';
import { computeHitRate, fetchGradedYesterday, fetchTodayInsights } from '@/lib/gary/hub';
import { fetchTodayGamePicks, fetchTodayPropPicks, selectTopPick, selectTopProps } from '@/lib/gary/picks';
import { computeRecord, fetchGameResultsForDate, sinceDate } from '@/lib/gary/results';
import type { GaryPick, InsightRow, PropPick } from '@/lib/gary/types';
import { pageMetadata } from '@/lib/seo/metadata';
import { fetchRecentGameResults } from '@/lib/today/data';
import { selectHubHighlights, summarizeBoard } from '@/lib/today/model';

export const revalidate = 600;

export const metadata: Metadata = pageMetadata({
  canonical: '/today',
  title: "Today — Gary's Morning Sports Desk | Gary AI",
  description: "Today's Gary briefing: the top call, slate status, recent record, live games, Hub reads, and your Book in one place.",
  robots: { index: false },
});

interface ReadState<T> {
  data: T;
  unavailable: boolean;
}

async function readForToday<T>(label: string, request: Promise<T>, fallback: T): Promise<ReadState<T>> {
  try {
    return { data: await request, unavailable: false };
  } catch (error) {
    console.error(`[Today] ${label} unavailable`, error);
    return { data: fallback, unavailable: true };
  }
}

export default async function TodayPage() {
  const date = todayEST();
  const gradedDate = hubGradedDateEST();
  const recentFloor = daysAgoEST(30);
  const [picksRead, propsRead, slateRead, insightsRead, gradedInsightsRead, yesterdayRead, resultsRead] = await Promise.all([
    readForToday('game picks', fetchTodayGamePicks(), [] as GaryPick[]),
    readForToday('player props', fetchTodayPropPicks(), [] as PropPick[]),
    readForToday('slate', fetchDailySlate(date), []),
    readForToday('Hub insights', fetchTodayInsights(), [] as InsightRow[]),
    readForToday('Hub receipt', fetchGradedYesterday(), [] as InsightRow[]),
    readForToday('yesterday results', fetchGameResultsForDate(gradedDate), []),
    readForToday('recent record', fetchRecentGameResults(recentFloor), []),
  ]);

  const picks = picksRead.data;
  const props = propsRead.data;
  const slate = slateRead.data;
  const insights = insightsRead.data;
  const gradedInsights = gradedInsightsRead.data;
  const yesterdayRows = yesterdayRead.data;
  const results = resultsRead.data;

  const board = buildBoard(slate, picks);
  const topPick = selectTopPick(picks);
  const topProp = selectTopProps(props, 1)[0] ?? null;
  const boardStatus = summarizeBoard(board);
  const hubHighlights = selectHubHighlights(insights);
  const yesterday = yesterdayRead.unavailable ? null : computeRecord(yesterdayRows);
  const hubReceipt = gradedInsightsRead.unavailable ? null : computeHitRate(gradedInsights);
  const l7 = resultsRead.unavailable ? null : computeRecord(sinceDate(results, daysAgoEST(7)));
  const l30 = resultsRead.unavailable ? null : computeRecord(sinceDate(results, recentFloor));
  const callsUnavailable = picksRead.unavailable || propsRead.unavailable;

  return (
    <main className="mx-auto max-w-6xl px-5 pb-20 pt-12">
      <PageMasthead
        title="Today"
        meta={date}
        sub="Gary's morning briefing — the leading call, board status, live games, research reads, recent record, and your Book in one scroll."
      >
        {hubReceipt && hubReceipt.graded >= 5 && (
          <span className="tnum mt-3 inline-flex rounded-chip border border-line bg-chip px-2.5 py-1 font-mono text-[11px] font-bold text-mid">
            HUB YESTERDAY · {hubReceipt.hit}/{hubReceipt.graded} HIT
          </span>
        )}
      </PageMasthead>

      <div className="mt-4">
        {yesterday ? (
          <ReceiptLine label="Yesterday" record={yesterday} href="/results" />
        ) : (
          <p className="font-mono text-[10.5px] uppercase tracking-[0.05em] text-low">
            Yesterday&apos;s receipt is temporarily unavailable
          </p>
        )}
      </div>

      <section className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          label="Games"
          value={slateRead.unavailable ? '—' : board.length || '—'}
          sub={slateRead.unavailable ? 'slate unavailable' : 'on the board'}
        />
        <StatTile
          label="Calls"
          value={picksRead.unavailable ? '—' : picks.length}
          sub={picksRead.unavailable ? 'calls unavailable' : 'posted so far'}
        />
        <StatTile
          label="Last 7"
          value={l7 ? `${l7.wins}–${l7.losses}` : '—'}
          sub={l7 ? `${l7.pct}% win` : 'record unavailable'}
        />
        <StatTile
          label="Last 30"
          value={l30 ? `${l30.wins}–${l30.losses}` : '—'}
          sub={l30 ? `${l30.pct}% win` : 'record unavailable'}
        />
      </section>

      <div className="mt-6">
        <LiveScoreStrip date={date} />
      </div>

      <section className="mt-10">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-[1.7rem] uppercase leading-none text-hi">The leading calls</h2>
          <Link
            href="/picks"
            className="text-[13px] text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light hover:decoration-gold"
          >
            See every game →
          </Link>
        </div>
        <StitchRule tone="faint" className="mt-4" />

        {callsUnavailable && (
          <p className="mt-5 rounded-card border border-line bg-card px-4 py-3 text-[13px] leading-relaxed text-low">
            Part of the calls feed is temporarily unavailable. Available calls remain visible below.
          </p>
        )}

        {topPick || topProp ? (
          <div className="mt-6 grid gap-5 md:grid-cols-2">
            {topPick && <PickCard pick={topPick} />}
            {topProp && <PropCard prop={topProp} />}
          </div>
        ) : callsUnavailable ? (
          <div className="mt-6 rounded-panel border border-line bg-card p-8 text-center">
            <p className="text-[14.5px] leading-relaxed text-mid">
              The leading calls could not load right now. The full board may still be available.
            </p>
          </div>
        ) : (
          <div className="mt-6 flex flex-col items-center justify-center rounded-panel border border-line bg-card p-8 text-center">
            <Image src="/brand/gary-cooking.png" alt="" aria-hidden width={100} height={100} />
            <p className="mt-3 max-w-md text-[14.5px] leading-relaxed text-mid">
              Gary is working through the slate. Calls appear here as the public board posts.
            </p>
          </div>
        )}
      </section>

      <section className="mt-10 grid gap-5 lg:grid-cols-2">
        <TodayBoardStatus
          summaries={boardStatus}
          unavailable={slateRead.unavailable || picksRead.unavailable}
        />
        <TodayBookSummary />
      </section>

      <div className="mt-5">
        <TodayHubHighlights highlights={hubHighlights} unavailable={insightsRead.unavailable} />
      </div>
    </main>
  );
}
