import Link from 'next/link';
import '@/components/book/winners.css';
import { JsonLd } from '@/components/JsonLd';
import { fetchPickIndex } from '@/lib/gary/gamepage';
import { sportByCode } from '@/lib/gary/leagues';
import { TEAM_LEAGUES, teamPath, teamsFromIndex } from '@/lib/gary/teams';
import { SITE_URL, pageMetadata } from '@/lib/seo/metadata';

export const revalidate = 3600;

export const metadata = pageMetadata({
  canonical: '/teams',
  title: 'Picks by Team: NFL, College Football, NBA & MLB | Gary AI',
  description: 'Gary’s latest pick on your team, with his reasoning, and every pick on their games this season. NFL, college football, NBA and MLB.',
});

export default async function TeamsPage() {
  const teams = teamsFromIndex(await fetchPickIndex());
  return (
    <main className="win-page team-page">
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'Picks by team',
        url: `${SITE_URL}/teams`,
      }} />
      <div className="win-inner">
        <header className="team-head"><h1>Picks by team</h1></header>
        {TEAM_LEAGUES.map(code => {
          const list = teams.filter(t => t.code === code);
          if (!list.length) return null;
          const cfg = sportByCode(code)!;
          return (
            <section key={code} id={cfg.slug} className="team-league" aria-labelledby={`teams-${cfg.slug}`}>
              <h2 id={`teams-${cfg.slug}`}>{cfg.longName}</h2>
              <ul>
                {list.map(t => <li key={t.slug}><Link href={teamPath(t)}>{t.name}</Link></li>)}
              </ul>
            </section>
          );
        })}
      </div>
    </main>
  );
}
