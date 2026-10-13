import { clubMatches } from './mlbSeriesState.js';

/**
 * MLB recent-window aggregate (extracted from sports/mlb.js, Aug 25 2026).
 *
 * Lived as a closure inside a 2,900-line builder, so nothing could test it.
 * Pulled out during the founder's misleading-data audit for exactly that
 * reason: a window that reports a record has to be checkable against the
 * games it claims to summarize.
 *
 * (The Aug-26 opposing-starter stamps were retired the same day they
 * shipped — founder duplication audit: the full official story of each
 * game now prints in the RECENT FORM entries and names the arm the offense
 * faced, with the how. The window stays the record book: record, span,
 * run rates, home/road, opponents.)
 */
// L5/L10 aggregate.
//
// A bare "6-4 (4.2 R/G)" invites the two questions the founder's standard
// forbids leaving open: WHEN were those games, and WHO were they against?
// The window carries its own date span, the opponents it was built from,
// and its home/road split — and it states the real game count rather than
// letting the [L10] label imply ten when only six were played.
export function aggregateRecentWindow(games, teamName, count) {
  if (!games || games.length === 0) return null;
  const slice = games.slice(-count);
  let wins = 0, losses = 0, runsFor = 0, runsAgainst = 0;
  let homeWins = 0, homeLosses = 0, roadWins = 0, roadLosses = 0;
  const opponents = [];
  for (const g of slice) {
    const homeScore = g.teams?.home?.score ?? 0;
    const awayScore = g.teams?.away?.score ?? 0;
    const isHome = clubMatches(g.teams?.home?.team?.name, teamName);
    const oppName = isHome ? g.teams?.away?.team?.name : g.teams?.home?.team?.name;
    const won = isHome ? homeScore > awayScore : awayScore > homeScore;
    if (isHome) {
      runsFor += homeScore; runsAgainst += awayScore;
      won ? homeWins++ : homeLosses++;
    } else {
      runsFor += awayScore; runsAgainst += homeScore;
      won ? roadWins++ : roadLosses++;
    }
    won ? wins++ : losses++;
    if (oppName) opponents.push(`${isHome ? 'vs' : '@'} ${oppName}`);
  }
  const gp = slice.length;
  if (gp === 0) return null;

  const dayOf = (g) => String(g?.officialDate || g?.gameDate || '').slice(0, 10);
  const first = dayOf(slice[0]);
  const last = dayOf(slice[slice.length - 1]);
  const span = first && last ? (first === last ? first : `${first} → ${last}`) : null;

  // Collapse repeats so a 3-game series reads once with its count.
  const oppCounts = [];
  for (const label of opponents) {
    const prior = oppCounts.find((o) => o.label === label);
    if (prior) prior.n += 1; else oppCounts.push({ label, n: 1 });
  }
  const oppLine = oppCounts.map((o) => (o.n > 1 ? `${o.label} x${o.n}` : o.label)).join(', ');

  return [
    `${wins}-${losses} over ${gp} game${gp === 1 ? '' : 's'}`,
    span ? `(${span})` : null,
    `— ${(runsFor / gp).toFixed(1)} R/G, ${(runsAgainst / gp).toFixed(1)} RA/G`,
    `| home ${homeWins}-${homeLosses}, road ${roadWins}-${roadLosses}`,
    oppLine ? `| opponents: ${oppLine}` : null
  ].filter(Boolean).join(' ');
}
