import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Eyebrow } from '@/components/Eyebrow';
import { ScoutRead } from '@/components/ScoutRead';
import { ReceiptLine } from '@/components/ReceiptLine';
import { Slab } from '@/components/board/GameRow';
import { KeyStats, PropCall, PropRow } from '@/components/board/PropRow';
import { BookDayProvider } from '@/components/book/BookDay';
import { PropTailFadeRow } from '@/components/book/TailFadeRow';
import { AccountCta } from '@/components/AccountCta';
import { PageMasthead, StitchRule } from '@/components/Terminal';
import { fetchTodayPropPicks, isLongShot, selectTopProps } from '@/lib/gary/picks';
import { computePropsRecord, fetchPropResultsForDate } from '@/lib/gary/results';
import { normalizeLeague } from '@/lib/gary/leagues';
import { etDateLabel, etTime, parseGameTime } from '@/lib/gary/format';
import { hubGradedDateEST, todayEST } from '@/lib/gary/dates';
import type { PropPick } from '@/lib/gary/types';
import { pageMetadata } from '@/lib/seo/metadata';

export const revalidate = 600;

export const metadata: Metadata = pageMetadata({
  canonical: '/props',
  title: "Today's Free Player Prop Picks | Gary AI",
  description:
    "Every player prop Gary posted today, grouped by game, with the matchup, the numbers behind it, and the risk. Graded daily on the public record.",
});

/** The day's highest-confidence prop, read out in full. */
function FeaturedProp({ prop }: { prop: PropPick }) {
  const league = normalizeLeague(prop.league, prop.sport) ?? '';
  const time = etTime(prop.commence_time);
  const read = (prop.rationale ?? prop.analysis ?? '').trim();

  return (
    <article className="quant-panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-line px-6 py-3">
        <span className="flex items-center gap-2.5">
          <Slab />
          <Eyebrow>Gary&apos;s top prop</Eyebrow>
        </span>
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-low">
          {[league, prop.matchup, time].filter(Boolean).join(' · ')}
        </span>
      </div>
      <div className="px-6 py-5">
        <h2 className="font-display text-[clamp(1.9rem,5vw,2.6rem)] uppercase leading-[1.04] text-hi">
          {prop.player}
        </h2>
        {prop.team && (
          <p className="mt-1 font-mono text-[11.5px] uppercase tracking-[0.05em] text-low">{prop.team}</p>
        )}
        {/* The call ships before the read on a phone (DOM order) and beside it
            on a desktop (grid order) — nobody should scroll past 300 words to
            find out what the bet is. */}
        <div className="mt-4 grid gap-x-8 gap-y-5 md:grid-cols-[1fr_300px] md:items-start">
          <div className="w-full md:order-2">
            <PropCall prop={prop} size="lg" />
            <KeyStats stats={prop.key_stats} max={4} />
          </div>
          <div className="min-w-0 md:order-1">
            <ScoutRead text={read} />
          </div>
        </div>
        <PropTailFadeRow player={prop.player ?? ''} prop={prop.prop ?? ''} commence={prop.commence_time} />
      </div>
    </article>
  );
}

/** Props for one game, in one panel — the way a bettor reads a card. */
function GamePropPanel({ matchup, props }: { matchup: string; props: PropPick[] }) {
  const time = etTime(props[0]?.commence_time);
  // The lane stamp is not a league: a panel of MLB props plus its home run is
  // an MLB panel.
  const league = normalizeLeague(props[0]?.league, props[0]?.sport) === 'MLB HR'
    ? 'MLB'
    : normalizeLeague(props[0]?.league, props[0]?.sport) ?? '';
  // The long shot rides last, behind the props it shares a game with.
  const core = props.filter(p => !isLongShot(p));
  const longShots = props.filter(isLongShot);
  const ordered = [...core, ...longShots];
  const count = [
    `${core.length} ${core.length === 1 ? 'prop' : 'props'}`,
    longShots.length ? '1 long shot' : null,
  ].filter(Boolean).join(' · ');
  return (
    <article className="quant-panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-line px-5 py-3">
        <span className="flex items-center gap-2.5">
          <Slab />
          <span className="font-display text-[1.15rem] uppercase leading-none text-hi">{matchup}</span>
        </span>
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-low">
          {[time, league, count].filter(Boolean).join(' · ')}
        </span>
      </div>
      <div className="divide-y divide-line">
        {ordered.map((p, i) => (
          <PropRow key={`${p.player}-${p.prop}-${i}`} prop={p} />
        ))}
      </div>
    </article>
  );
}

export default async function PropsPage() {
  const date = todayEST();
  const graded = hubGradedDateEST();
  const [props, gradedRows] = await Promise.all([
    fetchTodayPropPicks().catch(() => null),
    fetchPropResultsForDate(graded).catch(() => []),
  ]);
  const yesterday = computePropsRecord(gradedRows);

  // The showcase is the product, never the fun lane.
  const coreProps = props ? props.filter(p => !isLongShot(p)) : [];
  const featured = coreProps.length > 0 ? selectTopProps(coreProps, 1)[0] : null;
  const boardProps = props ? props.filter(p => p !== featured) : [];

  // Grouped by game, in first-pitch order — a bettor looking at Mariners @
  // Rangers wants all of its cards together, the long shot included (founder,
  // Sep 3 2026: the home run is a pick card, not a shelf at the bottom of the
  // page), not scattered down a grid.
  const byGame = new Map<string, PropPick[]>();
  for (const p of boardProps) {
    const key = p.matchup?.trim() || 'Other';
    byGame.set(key, [...(byGame.get(key) ?? []), p]);
  }
  const games = [...byGame.entries()].sort((a, b) => {
    const ta = parseGameTime(a[1][0]?.commence_time)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const tb = parseGameTime(b[1][0]?.commence_time)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return ta - tb;
  });
  const total = props?.length ?? 0;

  return (
    <main className="mx-auto max-w-5xl px-5 pb-20 pt-12">
      <PageMasthead
        title="Today's free player prop picks"
        meta={etDateLabel(date)}
        sub="Every player prop Gary posted today — the matchup, the numbers he leaned on, and the way it loses."
      />

      <div className="mt-4">
        <ReceiptLine
          label="Props graded yesterday"
          record={yesterday}
          href="/results"
          cta="The prop record"
        />
      </div>

      <BookDayProvider date={date}>
        {featured && (
          <section className="mt-7">
            <FeaturedProp prop={featured} />
          </section>
        )}

        {games.length > 0 && (
          <section className="mt-12">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="font-display text-[1.6rem] uppercase leading-none text-hi">The rest of the board</h2>
              <span className="tnum font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-low">
                {total} {total === 1 ? 'prop' : 'props'} · {games.length}{' '}
                {games.length === 1 ? 'game' : 'games'}
              </span>
            </div>
            <StitchRule tone="faint" className="mt-4" />
            <div className="mt-6 space-y-4">
              {games.map(([matchup, items]) => (
                <GamePropPanel key={matchup} matchup={matchup} props={items} />
              ))}
            </div>
          </section>
        )}
      </BookDayProvider>

      <AccountCta
        nextPath="/props"
        title="Make a call before it starts"
        body="Tail or fade any listed prop above, then let Gary grade your prediction in My Book. It stays a record—not a real-money wager."
        className="mt-10"
      />

      {total === 0 && (
        <div className="mt-8 flex flex-col items-center justify-center rounded-panel border border-line bg-card p-10 text-center">
          <Image src="/brand/gary-cooking.png" alt="" aria-hidden width={110} height={110} />
          <p className="mt-3 text-[15px] text-mid">
            No player props are published here yet today. Check back closer to game time as Gary finishes the analysis.
          </p>
        </div>
      )}

      <section className="mt-16" aria-labelledby="props-guide-heading">
        <h2 id="props-guide-heading" className="font-display text-2xl uppercase text-hi">How to read Gary&apos;s props board</h2>
        <StitchRule tone="faint" className="mt-4" />
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-card border border-line bg-card p-5">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-gold">The line</p>
            <p className="mt-2 text-[14px] leading-relaxed text-mid">
              Each posted prop keeps the player, market, threshold, side, and listed odds that were stored with the call. Missing historical fields stay missing rather than being reconstructed later.
            </p>
          </div>
          <div className="rounded-card border border-line bg-card p-5">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-gold">The reasoning</p>
            <p className="mt-2 text-[14px] leading-relaxed text-mid">
              The written read explains the matchup and statistics Gary used and includes the way the play can fail. Prop markets vary by sport and by the data available on that day.
            </p>
          </div>
          <div className="rounded-card border border-line bg-card p-5">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-gold">The result</p>
            <p className="mt-2 text-[14px] leading-relaxed text-mid">
              Props are graded after the underlying event is final. Wins, losses, pushes, and missing historical odds remain visible in the public record and downloadable ledger.
            </p>
          </div>
        </div>
        <p className="mt-5 text-[13.5px] leading-relaxed text-low">
          Player props are higher variance than game lines. Review the{' '}
          <Link href="/results/audit" className="text-gold underline decoration-gold/40 underline-offset-4">model audit</Link>,{' '}
          <Link href="/data-sources" className="text-gold underline decoration-gold/40 underline-offset-4">data-source policy</Link>, and{' '}
          <Link href="/results" className="text-gold underline decoration-gold/40 underline-offset-4">complete graded record</Link> before drawing conclusions from a short run.
        </p>
      </section>
    </main>
  );
}
