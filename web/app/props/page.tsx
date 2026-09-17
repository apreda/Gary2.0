import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { ReceiptLine } from '@/components/ReceiptLine';
import { Slab } from '@/components/board/GameRow';
import { PropRow } from '@/components/board/PropRow';
import { BookDayProvider } from '@/components/book/BookDay';
import { AccountCta } from '@/components/AccountCta';
import { BoardDateNotice } from '@/components/BoardDateNotice';
import { WinnersInvitation } from '@/components/WinnersInvitation';
import { PageMasthead, StitchRule } from '@/components/Terminal';
import { fetchDailySlate } from '@/lib/gary/board';
import { fetchTodayPropPicks, isLongShot, selectTopProps } from '@/lib/gary/picks';
import { PROP_LANES } from '@/lib/gary/prop-lane-pages';
import { computePropsRecord, fetchPropResultsForDate } from '@/lib/gary/results';
import { SPORTS, normalizeLeague } from '@/lib/gary/leagues';
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

/** Featured ticket uses the same native prop component as its game group. */
function FeaturedProp({prop}:{prop:PropPick}){return <div className="max-w-[430px]"><p className="site-eyebrow mb-5">GARY’S TOP PROP</p><PropRow prop={prop}/></div>}

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
    <article className="mb-10">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-line px-5 py-3">
        <span className="flex items-center gap-2.5">
          <Slab />
          <span className="font-display text-[1.8rem] uppercase leading-none text-hi">{matchup}</span>
        </span>
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-low">
          {[time, league, count].filter(Boolean).join(' · ')}
        </span>
      </div>
      <div className="site-pick-grid mt-6">
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
  const [props, gradedRows, slate] = await Promise.all([
    // A failed source is not an empty slate; let the route's error boundary
    // handle it and preserve the last successful server-cached board.
    fetchTodayPropPicks(),
    fetchPropResultsForDate(graded).catch(() => []),
    // The slate only decides the empty-state wording; when it fails we say
    // less, never "no games".
    fetchDailySlate(date).catch(() => null),
  ]);
  const yesterday = computePropsRecord(gradedRows);
  const activeSlate = slate
    ? slate.filter(r => SPORTS.some(s => !s.retired && s.code === normalizeLeague(r.league)))
    : null;
  const firstStart = activeSlate?.length ? etTime(activeSlate[0].commence_time) : null;

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
    const gameId = p.game_id ?? p.bdl_game_id;
    const normalizedLeague = normalizeLeague(p.league, p.sport) ?? '';
    const league = normalizedLeague === 'MLB HR' ? 'MLB' : normalizedLeague;
    const key = JSON.stringify([league, gameId != null
      ? String(gameId)
      : [p.matchup?.trim() || 'Other', p.commence_time ?? null]]);
    byGame.set(key, [...(byGame.get(key) ?? []), p]);
  }
  const games = [...byGame.entries()].sort((a, b) => {
    const ta = parseGameTime(a[1][0]?.commence_time)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const tb = parseGameTime(b[1][0]?.commence_time)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return ta - tb;
  });
  const total = props?.length ?? 0;

  return (
    <main className="site-wrap pb-20 pt-12">
      <BoardDateNotice date={date} />
      <PageMasthead
        title="Player Props."
        meta={etDateLabel(date)}
        sub="One player. One number. Gary’s take. Flip a card to read the reasoning."
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
              <h2 className="font-display text-[1.6rem] uppercase leading-none text-hi">More player prop picks</h2>
              <span className="tnum font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-low">
                {total} {total === 1 ? 'prop' : 'props'} · {games.length}{' '}
                {games.length === 1 ? 'game' : 'games'}
              </span>
            </div>
            <StitchRule tone="faint" className="mt-4" />
            <div className="mt-6 space-y-4">
              {games.map(([key, items]) => (
                <GamePropPanel key={key} matchup={items[0]?.matchup?.trim() || 'Other'} props={items} />
              ))}
            </div>
          </section>
        )}
      </BookDayProvider>

      <AccountCta
        nextPath="/props"
        title="Make a call before it starts"
        body="Tail or fade any listed core prop above, then let Gary grade your prediction in My Book. It stays a record—not a real-money wager."
        className="mt-10"
      />

      {total === 0 && (
        <div className="mt-8 flex flex-col items-center justify-center rounded-panel border border-line bg-card p-10 text-center">
          <Image src="/brand/gary-cooking.png" alt="" aria-hidden width={110} height={110} />
          <p className="mt-3 text-[15px] text-mid">
            {activeSlate && activeSlate.length === 0 && <>No games on today’s schedule, so there are no player props today. <Link href={`/archive/${graded}`} className="text-gold underline decoration-gold/40 underline-offset-4">See yesterday’s cards →</Link></>}
            {activeSlate && activeSlate.length > 0 && <>Player props are being prepared{firstStart ? ` — the first game starts at ${firstStart} ET` : ''}. Check back closer to game time.</>}
            {activeSlate === null && <>No player props are published here yet today. Check back closer to game time as Gary finishes the analysis.</>}
          </p>
        </div>
      )}

      <section className="mt-16" aria-labelledby="props-guide-heading">
        <h2 id="props-guide-heading" className="font-display text-2xl uppercase text-hi">How to read Gary&apos;s player prop picks</h2>
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

      <WinnersInvitation className="mt-10" />
      <p className="mt-6 text-[13.5px] leading-relaxed text-low">
        Long shots have their own pages: <Link href={PROP_LANES['home-runs'].path} className="text-gold underline decoration-gold/40 underline-offset-4">MLB home run picks</Link> and <Link href={PROP_LANES.touchdowns.path} className="text-gold underline decoration-gold/40 underline-offset-4">NFL anytime touchdown picks</Link>. Game picks live on <Link href="/picks" className="text-gold underline decoration-gold/40 underline-offset-4">The Picks</Link>{SPORTS.filter(s => !s.retired && ['MLB', 'NFL', 'NCAAF'].includes(s.code)).map(s => <span key={s.slug}>, <Link href={`/picks/${s.slug}`} className="text-gold underline decoration-gold/40 underline-offset-4">{s.name}</Link></span>)}.
      </p>
    </main>
  );
}
