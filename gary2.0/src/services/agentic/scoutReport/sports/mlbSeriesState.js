/**
 * MLB SERIES STATE — pure derivation, no I/O (Jul 9 2026, founder-approved).
 *
 * Why this exists: since Jun 1 Gary's MLB profit was entirely series openers
 * (59.7%, +19.6u) while game 3+ ran at 52.3%, -1.4u — and in July the split
 * became openers 61.8% +6.1u vs mid-series 44.4% -10.3u. Gary read every game
 * as a fresh matchup; by game 2-3 that read is last night's public
 * information. A fan always knows it's game 3 and that the team lost 12-4
 * yesterday — this makes the series state unmissable in the scout report.
 * Facts only; Gary decides what any of it means.
 *
 * Input shape = MLB Stats API /schedule games (the getMlbRecentGames output):
 * { officialDate, teams: { away: { team: { name }, score },
 *                          home: { team: { name }, score } } }
 * Names are FULL MLB Stats API names ("Pittsburgh Pirates"); the scout's team
 * labels are nicknames ("Pirates"), so matching is containment-based.
 */

function sideMatches(fullName, nickname) {
  return typeof fullName === 'string' && typeof nickname === 'string' &&
    fullName.toLowerCase().includes(nickname.toLowerCase());
}

/** True when this game entry is between tonight's two teams. */
function isPairGame(game, teamA, teamB) {
  const away = game?.teams?.away?.team?.name;
  const home = game?.teams?.home?.team?.name;
  return (
    (sideMatches(away, teamA) && sideMatches(home, teamB)) ||
    (sideMatches(away, teamB) && sideMatches(home, teamA))
  );
}

/**
 * @param {string} homeTeam  Tonight's home team (scout nickname, e.g. "Pirates")
 * @param {string} awayTeam  Tonight's away team (scout nickname, e.g. "Braves")
 * @param {Array}  homeRecentGames  The home team's recent FINAL games, chronological
 * @param {Array|null} [upcomingPairGames]  Scheduled (not final) games in the next
 *                 few days — only entries between the same two teams are counted.
 *                 null (the default) = lookahead unavailable → "of N" is omitted;
 *                 an ARRAY (even empty) = lookahead known → "of N" renders, so a
 *                 finale reads "Game 4 of 4".
 * @returns {{ seriesGame: number, line: string }}
 */
export function computeMlbSeriesState(homeTeam, awayTeam, homeRecentGames, upcomingPairGames = null) {
  const games = Array.isArray(homeRecentGames) ? homeRecentGames : [];

  // Walk the home team's games newest-first; the current series is the
  // unbroken run of most-recent games against tonight's opponent. Any game
  // against a different team ends the run (an off-day between meetings does
  // not — there is simply no entry for it).
  const series = [];
  for (let i = games.length - 1; i >= 0; i--) {
    if (isPairGame(games[i], homeTeam, awayTeam)) series.unshift(games[i]);
    else break;
  }

  const seriesGame = series.length + 1;

  // Remaining meetings after tonight complete the "of N". A null lookahead
  // means we couldn't check the schedule — omit "of N" rather than guess.
  const lookaheadKnown = Array.isArray(upcomingPairGames);
  const future = lookaheadKnown
    ? upcomingPairGames.filter((g) => isPairGame(g, homeTeam, awayTeam)).length
    : 0;
  const ofN = lookaheadKnown ? ` of ${series.length + 1 + future}` : '';

  if (series.length === 0) {
    return {
      seriesGame: 1,
      line: `Series opener vs ${awayTeam}${lookaheadKnown && future > 0 ? ` (game 1 of ${1 + future})` : ''} — first meeting of this series.`,
    };
  }

  // Series score from the home team's perspective, plus the last meeting.
  let homeWins = 0;
  let awayWins = 0;
  for (const g of series) {
    const a = Number(g?.teams?.away?.score ?? NaN);
    const h = Number(g?.teams?.home?.score ?? NaN);
    if (!Number.isFinite(a) || !Number.isFinite(h) || a === h) continue;
    const winnerFull = a > h ? g.teams.away.team.name : g.teams.home.team.name;
    if (sideMatches(winnerFull, homeTeam)) homeWins++;
    else if (sideMatches(winnerFull, awayTeam)) awayWins++;
  }

  const score = homeWins === awayWins
    ? `series ${homeWins}-${awayWins}`
    : homeWins > awayWins
      ? `${homeTeam} lead the series ${homeWins}-${awayWins}`
      : `${awayTeam} lead the series ${awayWins}-${homeWins}`;

  const last = series[series.length - 1];
  const la = Number(last?.teams?.away?.score ?? NaN);
  const lh = Number(last?.teams?.home?.score ?? NaN);
  let lastLine = '';
  if (Number.isFinite(la) && Number.isFinite(lh) && la !== lh) {
    const winnerFull = la > lh ? last.teams.away.team.name : last.teams.home.team.name;
    const winnerNick = sideMatches(winnerFull, homeTeam) ? homeTeam : awayTeam;
    const winScore = Math.max(la, lh);
    const loseScore = Math.min(la, lh);
    lastLine = ` Last meeting (${last.officialDate || ''}): ${winnerNick} won ${winScore}-${loseScore}.`;
  }

  return {
    seriesGame,
    line: `Game ${seriesGame}${ofN} vs ${awayTeam} — ${score} so far.${lastLine}`,
  };
}

/**
 * SEASON HEAD-TO-HEAD — pure derivation from the cached BDL season game index
 * (Jul 22 2026, founder-approved: "Yankees took 4 of 6 from them in May" is
 * fan knowledge the desk didn't carry; Series State covers only the current
 * series). Zero API calls — the index is already in memory. Facts only.
 *
 * @param {Map} seasonIndex - BDL season index: id -> { date, status, homeId, awayId, homeRuns, awayRuns }
 * @returns {{ line: string, results: string[] } | null}
 */
// BDL index dates are UTC instants — a West-Coast night game rolls past
// midnight UTC and displays as the wrong day. Always present the ET date.
export function toEtDate(iso) {
  const d = new Date(iso);
  return isNaN(d) ? String(iso).slice(0, 10) : d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

export function computeMlbSeasonSeries(seasonIndex, homeBdlId, awayBdlId, homeTeam, awayTeam) {
  if (!seasonIndex || typeof seasonIndex.entries !== 'function' || !homeBdlId || !awayBdlId) return null;
  const meetings = [];
  for (const [, g] of seasonIndex.entries()) {
    const pair = (g.homeId === homeBdlId && g.awayId === awayBdlId) ||
                 (g.homeId === awayBdlId && g.awayId === homeBdlId);
    if (!pair) continue;
    if (!/final/i.test(String(g.status || ''))) continue;
    if (g.homeRuns == null || g.awayRuns == null) continue;
    meetings.push(g);
  }
  if (!meetings.length) return null;
  meetings.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  let homeWins = 0;
  let awayWins = 0;
  const results = meetings.map(g => {
    const tonightHomeHosted = g.homeId === homeBdlId;
    const homeTeamRuns = tonightHomeHosted ? g.homeRuns : g.awayRuns;
    const awayTeamRuns = tonightHomeHosted ? g.awayRuns : g.homeRuns;
    if (homeTeamRuns > awayTeamRuns) homeWins++; else awayWins++;
    const d = toEtDate(g.date);
    return `${d}: ${homeTeam} ${homeTeamRuns}-${awayTeamRuns} ${tonightHomeHosted ? 'vs' : '@'} ${awayTeam}`;
  });
  const lead = homeWins > awayWins
    ? `${homeTeam} lead the season series ${homeWins}-${awayWins}`
    : awayWins > homeWins
      ? `${awayTeam} lead the season series ${awayWins}-${homeWins}`
      : `Season series tied ${homeWins}-${awayWins}`;
  return { line: `${lead} (${meetings.length} meeting${meetings.length === 1 ? '' : 's'}).`, results };
}
