import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppStoreButton } from '@/components/AppStoreButton';
import { JsonLd } from '@/components/JsonLd';
import { PickCard } from '@/components/PickCard';
import { Icon } from '@/components/site/Icon';
import '@/components/book/winners.css';
import { todayEST } from '@/lib/gary/dates';
import { etDateLabel } from '@/lib/gary/format';
import { fetchGameDay, fetchPickIndex, findGamePicks, gameSlug, pageSummary, resultGamePath } from '@/lib/gary/gamepage';
import { sportBySlug } from '@/lib/gary/leagues';
import { computeRecord, fetchAllGameResults } from '@/lib/gary/results';
import { renderableTeamGames, teamPath, teamsFromIndex } from '@/lib/gary/teams';
import { ticketBody } from '@/lib/gary/ticket-format';
import type { GameResultRow, GaryPick } from '@/lib/gary/types';
import { SITE_URL, pageMetadata } from '@/lib/seo/metadata';

export const revalidate = 3600;

type Params = Promise<{ sport: string; team: string }>;

async function read(sport: string, slug: string) {
  const cfg = sportBySlug(sport);
  if (!cfg) return null;
  const rows = await fetchPickIndex();
  const team = teamsFromIndex(rows).find(t => t.sport === sport && t.slug === slug);
  if (!team) return null;
  const games = renderableTeamGames(rows, team);
  if (games.length === 0) return null;
  const results = await fetchAllGameResults().catch(() => [] as GameResultRow[]);
  const byPath = new Map<string, GameResultRow>();
  for (const r of results) {
    const path = resultGamePath(r);
    if (path && !byPath.has(path)) byPath.set(path, r);
  }
  const latest = games[0];
  const day = await fetchGameDay(sport, latest.date).catch(() => null);
  const pick: GaryPick | null = day ? (findGamePicks(day.picks, cfg.code, gameSlug(latest.away, latest.home))[0] ?? null) : null;
  const graded = games.flatMap(g => byPath.get(g.path) ?? []);
  // A game with no grade is listed only while it can still be played.
  const today = todayEST();
  const listed = games.filter(g => g.date >= today || (byPath.get(g.path)?.result ?? '').trim());
  return { cfg, team, games: listed, byPath, latest, pick, record: computeRecord(graded) };
}

const call = (r: GameResultRow | undefined, pick?: GaryPick | null) => ticketBody(r?.pick_text ?? pick?.pick ?? '');
const recordWords = (t: { wins: number; losses: number; pushes: number }) =>
  `${t.wins}-${t.losses}${t.pushes ? `-${t.pushes}` : ''}`;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { sport, team: slug } = await params;
  const page = await read(sport, slug).catch(() => null);
  if (!page) return { title: 'Team not found | Gary AI', robots: { index: false, follow: false } };
  const { team, latest, pick, byPath, record } = page;
  const latestCall = call(byPath.get(latest.path), pick);
  return pageMetadata({
    canonical: teamPath(team),
    title: `${team.name} Picks & Predictions | Gary AI`,
    description: `Gary's latest ${team.name} pick${latestCall ? `: ${latestCall}` : ''}, with his reasoning, and every pick on their games this season${record.graded ? ` (${recordWords({ wins: record.wins, losses: record.losses, pushes: record.pushes })})` : ''}.`.slice(0, 165),
  });
}

function Row({ game, result }: { game: { date: string; away: string; home: string; path: string }; result?: GameResultRow }) {
  const r = (result?.result ?? '').trim().toLowerCase();
  const tone = r === 'won' ? 'won' : r === 'lost' ? 'lost' : r === 'push' ? 'push' : 'pending';
  const word = r === 'won' ? 'Win' : r === 'lost' ? 'Loss' : r === 'push' ? 'Push' : 'Open';
  return (
    <Link href={game.path} className="win-row team-row">
      <b className={`win-word ${tone}`}>{word}</b>
      <span className="team-row-main">
        <span className="win-row-title">{ticketBody(result?.pick_text ?? '') || `${game.away} at ${game.home}`}</span>
        <span className="team-row-game">{game.away} at {game.home}</span>
      </span>
      <span className="team-row-date">{etDateLabel(game.date)}</span>
    </Link>
  );
}

export default async function TeamPage({ params }: { params: Params }) {
  const { sport, team: slug } = await params;
  const page = await read(sport, slug);
  if (!page) notFound();
  const { cfg, team, games, byPath, latest, pick, record } = page;
  const summary = pick ? pageSummary(pick, 320) : '';
  const url = `${SITE_URL}${teamPath(team)}`;
  return (
    <main className="win-page team-page">
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: `${team.name} picks`,
        url,
        about: { '@type': 'SportsTeam', name: team.name },
        breadcrumb: {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Teams', item: `${SITE_URL}/teams` },
            { '@type': 'ListItem', position: 2, name: `${cfg.code} picks`, item: `${SITE_URL}/picks/${cfg.slug}` },
            { '@type': 'ListItem', position: 3, name: team.name, item: url },
          ],
        },
      }} />
      <div className="win-inner">
        <nav className="team-crumbs" aria-label="Breadcrumb">
          <Link href="/teams">Teams</Link>
          <span aria-hidden="true">/</span>
          <Link href={`/picks/${cfg.slug}`}>{cfg.code} picks</Link>
        </nav>
        <header className="team-head">
          <h1>{team.name} picks</h1>
          {record.graded > 0 && (
            <p className="team-record"><b>{recordWords(record)}</b><span>on {record.graded} {team.name.split(' ').pop()} {record.graded === 1 ? 'game' : 'games'} this season</span></p>
          )}
        </header>

        <section className="team-latest" aria-labelledby="team-latest-h">
          <div>
            <h2 id="team-latest-h">Latest pick</h2>
            {pick ? (
              <PickCard pick={pick} date={latest.date} analysisHref={latest.path} shareHref={teamPath(team)} />
            ) : (
              <Row game={latest} result={byPath.get(latest.path)} />
            )}
          </div>
          <div className="team-latest-read">
            <h3>{latest.away} at {latest.home}</h3>
            <p className="team-latest-date">{etDateLabel(latest.date)}</p>
            {summary && <p>{summary}</p>}
            <Link href={latest.path} className="app-action">The full analysis <Icon name="chevron" size={18} /></Link>
          </div>
        </section>

        <section className="win-plate team-games" aria-labelledby="team-games-h">
          <div className="win-plate-head">
            <h2 id="team-games-h">This season</h2>
            <Link href={`/results/${cfg.slug}`} className="app-head-link">The {cfg.code} record <Icon name="chevron" size={15} /></Link>
          </div>
          <div className="win-rows">
            {games.slice(0, 40).map(g => <Row key={g.path} game={g} result={byPath.get(g.path)} />)}
          </div>
        </section>

        <section className="team-get">
          <p>Gary&apos;s picks, props and Winners are in the app.</p>
          <AppStoreButton surface={`team_page_${cfg.slug}`} className="app-action-lg" />
        </section>
      </div>
    </main>
  );
}
