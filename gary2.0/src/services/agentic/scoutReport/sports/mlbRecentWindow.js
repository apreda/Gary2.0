import { clubMatches } from './mlbSeriesState.js';

/**
 * MLB recent-window aggregate (extracted from sports/mlb.js, Aug 25 2026).
 *
 * Lived as a closure inside a 2,900-line builder, so nothing could test it.
 * Pulled out during the founder's misleading-data audit for exactly that
 * reason: a window that reports a record has to be checkable against the
 * games it claims to summarize.
 */
/**
 * The OPPOSING starter's line from a Stats-API boxscore, from this team's
 * point of view (Aug 26 2026, founder: "very important that gary understands
 * the full context of what happened in those games they struggled to score").
 * A 2.6 R/G window means one thing against Gausman and Bradish and another
 * against nobodies — the name and line make the difference readable.
 * pitchers[0] is the starter (appearance order, same contract the pen ledger
 * relies on). Returns e.g. "Gausman 6.0IP 1ER 8K", or null — never a guess.
 * @param {{ teams?: { home?: any, away?: any } } | null | undefined} box
 * @param {number} ownTeamId MLB Stats API team id of the team whose window this is
 */
export function oppStarterLineFromBox(box, ownTeamId) {
  const homeSide = box?.teams?.home;
  const awaySide = box?.teams?.away;
  if (!homeSide || !awaySide) return null;
  const oppSide = homeSide?.team?.id === ownTeamId ? awaySide
    : awaySide?.team?.id === ownTeamId ? homeSide
    : null;
  if (!oppSide) return null;
  const starterId = Array.isArray(oppSide.pitchers) ? oppSide.pitchers[0] : null;
  if (starterId == null) return null;
  const p = oppSide.players?.[`ID${starterId}`];
  const st = p?.stats?.pitching;
  const last = String(p?.person?.fullName || '').trim().split(/\s+/).pop();
  if (!last) return null;
  const ip = st?.inningsPitched != null ? `${st.inningsPitched}IP` : null;
  const er = st?.earnedRuns != null ? `${st.earnedRuns}ER` : null;
  const k = st?.strikeOuts != null && st.strikeOuts > 0 ? `${st.strikeOuts}K` : null;
  const line = [last, ip, er, k].filter(Boolean).join(' ');
  return line || null;
}

// L5/L10 aggregate.
//
// A bare "6-4 (4.2 R/G)" invites the two questions the founder's standard
// forbids leaving open: WHEN were those games, and WHO were they against?
// The window now carries its own date span, the opponents it was built
// from, and its home/road split — and it states the real game count rather
// than letting the [L10] label imply ten when only six were played.
// With `oppStarterByPk` (gamePk → opposing starter line) the opponents
// collapse is replaced by the per-game story: date, result, opponent, and
// the arm the runs came (or didn't come) against.
export function aggregateRecentWindow(games, teamName, count, oppStarterByPk = null) {
  if (!games || games.length === 0) return null;
  const slice = games.slice(-count);
  let wins = 0, losses = 0, runsFor = 0, runsAgainst = 0;
  let homeWins = 0, homeLosses = 0, roadWins = 0, roadLosses = 0;
  const opponents = [];
  const perGame = [];
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
    if (oppStarterByPk && oppName) {
      const teamScore = isHome ? homeScore : awayScore;
      const oppScore = isHome ? awayScore : homeScore;
      const day = String(g?.officialDate || g?.gameDate || '').slice(5, 10);
      const starter = g?.gamePk != null ? oppStarterByPk.get(g.gamePk) : null;
      perGame.push(
        `${day} ${won ? 'W' : 'L'} ${teamScore}-${oppScore} ${isHome ? 'vs' : '@'} ${oppName}` +
          (starter ? ` (opp SP ${starter})` : '')
      );
    }
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

  // With per-game detail available, the games themselves replace the
  // collapsed opponents list — same facts, plus result and opposing starter.
  const gamesLine = perGame.length === gp ? `| games: ${perGame.join(', ')}` : null;

  return [
    `${wins}-${losses} over ${gp} game${gp === 1 ? '' : 's'}`,
    span ? `(${span})` : null,
    `— ${(runsFor / gp).toFixed(1)} R/G, ${(runsAgainst / gp).toFixed(1)} RA/G`,
    `| home ${homeWins}-${homeLosses}, road ${roadWins}-${roadLosses}`,
    gamesLine || (oppLine ? `| opponents: ${oppLine}` : null)
  ].filter(Boolean).join(' ');
}
