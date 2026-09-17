import Image from 'next/image';
import Link from 'next/link';
import { BoardDateNotice } from '@/components/BoardDateNotice';
import { JsonLd } from '@/components/JsonLd';
import { PageMasthead, StitchRule } from '@/components/Terminal';
import { WinnersInvitation } from '@/components/WinnersInvitation';
import { PropRow } from '@/components/board/PropRow';
import { BookDayProvider } from '@/components/book/BookDay';
import { fetchDailySlate } from '@/lib/gary/board';
import { hubGradedDateEST, todayEST } from '@/lib/gary/dates';
import { etDateLabel, etTime, parseGameTime, propCall } from '@/lib/gary/format';
import { normalizeLeague } from '@/lib/gary/leagues';
import { fetchTodayPropPicks } from '@/lib/gary/picks';
import { PROP_LANES, propLaneState, type PropLaneSlug } from '@/lib/gary/prop-lane-pages';
import { SITE_URL } from '@/lib/seo/metadata';

const link = 'text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light';

/** One lane of today’s props (home runs or NFL anytime touchdowns) on the same native cards as /props. */
export async function PropLanePage({ lane }: { lane: PropLaneSlug }) {
  const cfg = PROP_LANES[lane];
  const other = PROP_LANES[cfg.otherLane];
  const date = todayEST();
  const yesterday = hubGradedDateEST();
  const [props, slate] = await Promise.all([
    // A failed prop source reaches the route error boundary; it is never an empty lane.
    fetchTodayPropPicks(),
    // The slate only decides the empty-state wording; when it fails we say less, not "no games".
    fetchDailySlate(date).catch(() => null),
  ]);
  const picks = props.filter(cfg.predicate).sort((a, b) =>
    (parseGameTime(a.commence_time)?.getTime() ?? Number.MAX_SAFE_INTEGER) -
    (parseGameTime(b.commence_time)?.getTime() ?? Number.MAX_SAFE_INTEGER));
  const slateGames = slate ? slate.filter(r => normalizeLeague(r.league) === cfg.leagueCode) : null;
  const firstStart = slateGames?.length ? etTime(slateGames[0].commence_time) : null;
  const state = propLaneState({ picks: picks.length, slateGames: slateGames ? slateGames.length : null, firstStart });

  return (
    <main className="site-wrap pb-20 pt-12">
      <BoardDateNotice date={date} />
      <JsonLd data={{
        '@context': 'https://schema.org', '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Gary AI', item: `${SITE_URL}/` },
          { '@type': 'ListItem', position: 2, name: 'Player Props', item: `${SITE_URL}/props` },
          { '@type': 'ListItem', position: 3, name: cfg.title.replace(/\.$/, ''), item: `${SITE_URL}${cfg.path}` },
        ],
      }} />
      {picks.length > 0 && (
        <JsonLd data={{
          '@context': 'https://schema.org', '@type': 'ItemList',
          name: `Gary AI ${cfg.sportName} ${cfg.laneNoun} for ${etDateLabel(date)}`,
          numberOfItems: picks.length,
          itemListElement: picks.slice(0, 25).map((p, i) => ({
            '@type': 'ListItem', position: i + 1, name: `${p.player ?? 'Player'} — ${propCall(p)}`,
          })),
        }} />
      )}
      <nav className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-[0.05em] text-low">
        <Link href="/props" className={link}>Player props</Link>
        <span aria-hidden>/</span>
        <span>{cfg.sportName} {cfg.laneNoun}</span>
      </nav>
      <div className="mt-5">
        <PageMasthead title={cfg.title} meta={`${cfg.sportName} · ${etDateLabel(date)}`} sub={cfg.sub} />
      </div>

      {state === 'picks' && (
        <BookDayProvider date={date}>
          <section className="mt-8" aria-label={`${cfg.sportName} ${cfg.laneNoun}`}>
            <p className="tnum font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-low">
              {picks.length} {picks.length === 1 ? 'pick' : 'picks'} · game times in ET
            </p>
            <div className="site-pick-grid mt-4">
              {picks.map((p, i) => <PropRow key={`${p.player}-${p.prop}-${i}`} prop={p} />)}
            </div>
          </section>
        </BookDayProvider>
      )}

      {state !== 'picks' && (
        <div className="mt-8 flex flex-col items-center justify-center rounded-panel border border-line bg-card p-10 text-center">
          <Image src="/brand/gary-cooking.png" alt="" aria-hidden width={110} height={110} />
          <p className="mt-3 text-[15px] text-mid">
            {state === 'no-games' && <>No {cfg.sportName} games on today’s schedule, so there are no {cfg.laneNoun} today. See <Link href={`/picks/${cfg.sportSlug}`} className={link}>today’s {cfg.sportName} picks</Link> or <Link href={`/archive/${yesterday}`} className={link}>yesterday’s cards</Link>.</>}
            {state === 'preparing' && <>{cfg.sportName} {cfg.laneNoun} are being prepared{firstStart ? ` — the first game starts at ${firstStart} ET` : ''}. Check back closer to game time, or see <Link href={`/picks/${cfg.sportSlug}`} className={link}>today’s {cfg.sportName} picks</Link>.</>}
            {state === 'unknown' && <>{cfg.sportName} {cfg.laneNoun} are not published here yet today. Check back closer to game time, or see <Link href={`/picks/${cfg.sportSlug}`} className={link}>today’s {cfg.sportName} picks</Link>.</>}
          </p>
        </div>
      )}

      <WinnersInvitation className="mt-10" />

      <section className="mt-12" aria-labelledby="lane-guide-heading">
        <h2 id="lane-guide-heading" className="font-display text-2xl uppercase text-hi">What a {cfg.sportName} {cfg.laneNoun.replace(/ picks$/, '')} pick is</h2>
        <StitchRule tone="faint" className="mt-4" />
        <p className="mt-5 text-[14px] leading-relaxed text-mid">{cfg.explainer}</p>
        <p className="mt-4 text-[13.5px] leading-relaxed text-low">
          Each card keeps the player, market, line, side and listed odds stored with the call, and the reasoning is in the card. Cards are graded after the game is final; <Link href={`/archive/${yesterday}`} className={link}>yesterday’s cards</Link> show the graded result. See all of <Link href="/props" className={link}>today’s player props</Link>, <Link href={other.path} className={link}>{other.sportName} {other.laneNoun}</Link>, or <Link href={`/picks/${cfg.sportSlug}`} className={link}>today’s {cfg.sportName} game picks</Link>.
        </p>
      </section>
    </main>
  );
}
