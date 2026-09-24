import Link from 'next/link';
import localFont from 'next/font/local';
import { AppStoreButton } from '@/components/AppStoreButton';
import { JsonLd } from '@/components/JsonLd';
import { PageMasthead, StitchRule } from '@/components/Terminal';
import { WinnersInvitation } from '@/components/WinnersInvitation';
import { etDateLabel, etTime } from '@/lib/gary/format';
import { lineWords, nickname, price, slotWords, type PrimetimeBet, type PrimetimeDay, type PrimetimeGame } from '@/lib/gary/primetime';
import { SITE_URL } from '@/lib/seo/metadata';

// Gary's sign-off, the same hand the app signs the parlay and Primetime with.
const hand = localFont({ src: '../../public/fonts/caveat-semibold.ttf', weight: '600', display: 'swap' });

const link = 'text-gold underline decoration-gold/40 underline-offset-4 transition-colors hover:text-gold-light';

function mark(result: PrimetimeBet['result']) {
  if (result === 'won') return <span className="font-extrabold text-win" aria-label="hit">✓</span>;
  if (result === 'lost') return <span className="font-extrabold text-loss" aria-label="missed">✕</span>;
  if (result === 'push') return <span className="font-extrabold text-silver" aria-label="push">–</span>;
  return null;
}

function metaLine(game: PrimetimeGame): string {
  const live = game.live;
  if ((live?.status === 'live' || live?.status === 'final') && live.away_score != null && live.home_score != null) {
    const away = live.away_abbr ?? nickname(game.away_team);
    const home = live.home_abbr ?? nickname(game.home_team);
    return [live.status === 'final' ? 'Final' : (live.detail ?? 'Live'), `${away} ${live.away_score}`, `${home} ${live.home_score}`].join(' · ');
  }
  const time = etTime(game.commence_time);
  return [time ? `${time} ET` : null, game.venue, lineWords(game)].filter(Boolean).join(' · ');
}

function BetRow({ bet }: { bet: PrimetimeBet }) {
  return (
    <li className="flex items-center gap-3 border-b border-line py-3">
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-gold">
          {bet.label}{bet.stake_dollars ? <span className="ml-2 text-faint">${Math.round(bet.stake_dollars).toLocaleString('en-US')}</span> : null}
        </p>
        <p className="mt-0.5 text-[15px] font-semibold text-hi">{bet.text}</p>
      </div>
      <span className="tnum font-display text-[24px] leading-none text-hi">{price(bet.odds)}</span>
      <span className="w-4 text-center">{mark(bet.result)}</span>
    </li>
  );
}

function GameSection({ game, first }: { game: PrimetimeGame; first: boolean }) {
  const title = `${nickname(game.away_team)} @ ${nickname(game.home_team)}`;
  const bets = game.bets.filter(b => b.kind !== 'winners' || !b.sealed);
  const sealed = game.bets.some(b => b.kind === 'winners' && b.sealed);
  return (
    <article className={first ? 'mt-6' : 'mt-16'} aria-labelledby={`pt-${game.game_id}`}>
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-gold">{slotWords(game.slot)}</p>
      <div className="mt-3" id={`pt-${game.game_id}`}>
        <PageMasthead title={title} meta={metaLine(game)} />
      </div>

      {game.lede && (
        <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-mid">
          {game.lede} <span className={`${hand.className} whitespace-nowrap text-[24px] text-gold-light`}>— Gary A.I.</span>
        </p>
      )}

      <section className="mt-8 max-w-2xl" aria-label={`Gary's bets on ${title}`}>
        <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-low">Gary’s bets on this game</h2>
        {bets.length > 0 ? (
          <ul className="mt-2 border-t border-line">{bets.map((b, i) => <BetRow key={`${b.kind}-${b.text}-${i}`} bet={b} />)}</ul>
        ) : (
          <p className="mt-3 text-[14px] text-low">Gary’s pick and props for this game land before kickoff.</p>
        )}
        {sealed && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-panel border border-gold/40 bg-card p-5">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-gold">Winners</p>
              <p className="mt-1 text-[15px] text-mid">Gary also has a Winners play on this game. It opens here once it’s graded.</p>
            </div>
            <AppStoreButton label="See it in the app" surface="primetime" />
          </div>
        )}
      </section>

      {(game.stat_to_know || game.injuries) && (
        <section className="mt-8 grid max-w-2xl gap-5 sm:grid-cols-2">
          {game.stat_to_know && (
            <div>
              <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-gold">Stat to know</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-mid">{game.stat_to_know}</p>
            </div>
          )}
          {game.injuries && (
            <div>
              <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-gold">Injuries</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-mid">{game.injuries}</p>
            </div>
          )}
        </section>
      )}
    </article>
  );
}

/** Tonight's big game (or a past night's recap) as Gary's newsletter. */
export function PrimetimePage({ day, canonical }: { day: PrimetimeDay; canonical: string }) {
  const games = day.games;
  return (
    <main className="site-wrap pb-20 pt-12">
      <JsonLd data={{
        '@context': 'https://schema.org', '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Gary AI', item: `${SITE_URL}/` },
          { '@type': 'ListItem', position: 2, name: 'Picks', item: `${SITE_URL}/picks` },
          { '@type': 'ListItem', position: 3, name: 'Primetime', item: `${SITE_URL}${canonical}` },
        ],
      }} />
      {games.map(g => (
        <JsonLd key={`ld-${g.game_id}`} data={{
          '@context': 'https://schema.org', '@type': 'SportsEvent',
          name: `${g.away_team} at ${g.home_team}`,
          sport: g.league === 'NFL' ? 'American Football' : 'Baseball',
          ...(g.commence_time ? { startDate: g.commence_time } : {}),
          awayTeam: { '@type': 'SportsTeam', name: g.away_team },
          homeTeam: { '@type': 'SportsTeam', name: g.home_team },
          competitor: [{ '@type': 'SportsTeam', name: g.away_team }, { '@type': 'SportsTeam', name: g.home_team }],
          ...(g.venue ? { location: { '@type': 'Place', name: g.venue } } : {}),
        }} />
      ))}
      <nav className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-[0.05em] text-low">
        <Link href="/picks" className={link}>Picks</Link>
        <span aria-hidden>/</span>
        <span>Primetime · {etDateLabel(day.date)}</span>
      </nav>

      {games.length === 0 ? (
        <div className="mt-6">
          <PageMasthead title="Primetime" meta={etDateLabel(day.date)} />
          <p className="mt-6 text-[15px] text-mid">
            No primetime game tonight. See <Link href="/picks" className={link}>today’s picks</Link> or the <Link href="/props" className={link}>player props</Link>.
          </p>
        </div>
      ) : (
        games.map((g, i) => <GameSection key={g.game_id} game={g} first={i === 0} />)
      )}

      <StitchRule tone="faint" className="mt-14" />
      <p className="mt-6 text-[14px] leading-relaxed text-low">
        More from Gary tonight: <Link href="/picks/nfl" className={link}>NFL picks</Link>, <Link href="/props/touchdowns" className={link}>touchdown props</Link>, <Link href="/picks/mlb" className={link}>MLB picks</Link>, and <Link href="/results" className={link}>his full record</Link>.
      </p>
      <WinnersInvitation className="mt-8" />
    </main>
  );
}
