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

/**
 * Whole-name club matching (Aug 19 2026 — the shared-mascot sweep): a
 * last-word join reads "Red Sox" and "White Sox" as the same club, so any
 * `split(' ').pop()` comparison cross-wires a Sox-vs-Sox game. Match the
 * WHOLE nickname or name with a word boundary — "boston red sox" matches
 * "Red Sox" and "Boston Red Sox", never "White Sox". Callers must pass at
 * least the proper nickname, never a bare mascot word.
 */
export function clubMatches(candidate, teamName) {
  const x = String(candidate || '').toLowerCase().trim();
  const y = String(teamName || '').toLowerCase().trim();
  if (!x || !y) return false;
  if (x === y) return true;
  return x.endsWith(` ${y}`) || y.endsWith(` ${x}`);
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
  let venueHomeWins = 0;
  let venueHomeLosses = 0;
  const results = meetings.map(g => {
    const tonightHomeHosted = g.homeId === homeBdlId;
    const homeTeamRuns = tonightHomeHosted ? g.homeRuns : g.awayRuns;
    const awayTeamRuns = tonightHomeHosted ? g.awayRuns : g.homeRuns;
    if (homeTeamRuns > awayTeamRuns) homeWins++; else awayWins++;
    if (tonightHomeHosted) {
      if (homeTeamRuns > awayTeamRuns) venueHomeWins++; else venueHomeLosses++;
    }
    const d = toEtDate(g.date);
    return `${d}: ${homeTeam} ${homeTeamRuns}-${awayTeamRuns} ${tonightHomeHosted ? 'vs' : '@'} ${awayTeam}`;
  });
  const lead = homeWins > awayWins
    ? `${homeTeam} lead the season series ${homeWins}-${awayWins}`
    : awayWins > homeWins
      ? `${awayTeam} lead the season series ${awayWins}-${homeWins}`
      : `Season series tied ${homeWins}-${awayWins}`;
  const venueLine = (venueHomeWins + venueHomeLosses) > 0
    ? ` At tonight's venue: ${homeTeam} ${venueHomeWins}-${venueHomeLosses} vs ${awayTeam}.`
    : '';
  return { line: `${lead} (${meetings.length} meeting${meetings.length === 1 ? '' : 's'}).${venueLine}`, results };
}

/**
 * SCHEDULE SHAPE — pure derivation from the season index (Jul 22 2026,
 * founder-approved fan-parity): homestand/trip position, games in the last
 * 7 days, and the night-game-then-day-game turnaround. Facts only.
 *
 * @param {Map} seasonIndex - id -> { date, status, homeId, awayId }
 * @param {number} teamBdlId
 * @param {string} todayEtDate - 'YYYY-MM-DD' (ET)
 * @param {string|null} todayStartIso - tonight's first pitch instant
 */
export function computeMlbScheduleShape(seasonIndex, teamBdlId, todayEtDate, todayStartIso) {
  if (!seasonIndex || typeof seasonIndex.entries !== 'function' || !teamBdlId || !todayEtDate) return null;
  const games = [];
  for (const [, g] of seasonIndex.entries()) {
    if (g.homeId !== teamBdlId && g.awayId !== teamBdlId) continue;
    games.push({ et: toEtDate(g.date), instant: g.date, side: g.homeId === teamBdlId ? 'home' : 'away', final: /final/i.test(String(g.status || '')) });
  }
  if (!games.length) return null;
  games.sort((a, b) => String(a.instant).localeCompare(String(b.instant)));
  const ti = games.findIndex(g => g.et === todayEtDate);
  if (ti < 0) return null;
  const side = games[ti].side;

  let back = 0;
  for (let i = ti - 1; i >= 0 && games[i].side === side; i--) back++;
  let ahead = 0;
  for (let i = ti + 1; i < games.length && games[i].side === side; i++) ahead++;
  const runTotal = back + 1 + ahead;
  const runLabel = side === 'home' ? 'homestand' : 'road trip';

  const d = new Date(todayEtDate + 'T12:00:00');
  const weekAgo = new Date(d.getTime() - 6 * 86400000).toISOString().slice(0, 10);
  const last7 = games.filter(g => g.final && g.et >= weekAgo && g.et < todayEtDate).length;

  const yesterdayEt = new Date(d.getTime() - 86400000).toISOString().slice(0, 10);
  const yGame = games.find(g => g.et === yesterdayEt && g.final);
  const etHour = (iso) => parseInt(new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }), 10);
  const yWasNight = yGame ? etHour(yGame.instant) >= 18 : false;
  const todayIsDay = todayStartIso ? etHour(todayStartIso) < 17 : false;

  const bits = [];
  if (runTotal >= 2) bits.push(`Game ${back + 1} of a ${runTotal}-game ${runLabel}`);
  bits.push(`${last7} game${last7 === 1 ? '' : 's'} in the last 7 days`);
  if (!yGame) bits.push('did not play yesterday');
  else if (yWasNight && todayIsDay) bits.push('night game yesterday, day game today');
  else bits.push('played yesterday');
  return { line: bits.join('; ') + '.' };
}

// (computeMlbH2hBySeason REMOVED — founder ruling, Aug 10 2026: no
// prior-season numbers on the desk.)

/**
 * SITUATIONAL RECORDS (Jul 26 2026, pickdesk situational layer) — how a team's
 * season has actually gone in the spots a bettor asks about: after a loss,
 * after getting blown out, after a win, in series finales, after an off day.
 * Pure compute over the cached season index; facts only, no labels.
 */
export function computeMlbSituationalRecords(seasonIndex, teamBdlId, teamName) {
  if (!seasonIndex || typeof seasonIndex.entries !== 'function' || !teamBdlId) return null;
  const games = [];
  for (const [, g] of seasonIndex.entries()) {
    if (g.homeId !== teamBdlId && g.awayId !== teamBdlId) continue;
    if (!/final/i.test(String(g.status || ''))) continue;
    if (g.seasonType === 'spring_training') continue; // regular season only
    if (g.homeRuns == null || g.awayRuns == null) continue;
    const isHome = g.homeId === teamBdlId;
    const my = isHome ? g.homeRuns : g.awayRuns;
    const opp = isHome ? g.awayRuns : g.homeRuns;
    games.push({
      et: toEtDate(g.date),
      instant: String(g.date),
      oppId: isHome ? g.awayId : g.homeId,
      won: my > opp,
      margin: my - opp,
      rf: my,
      ra: opp,
    });
  }
  if (games.length < 10) return null;
  games.sort((a, b) => a.instant.localeCompare(b.instant));

  const rec = () => ({ w: 0, l: 0 });
  const tally = (r, won) => { if (won) r.w++; else r.l++; };
  const afterLoss = rec();
  const afterBlowoutLoss = rec(); // lost previous game by 5+
  const afterWin = rec();
  const afterOffDay = rec();      // 1+ full calendar day without a game
  const seriesFinales = rec();    // last game of a 2+ game set vs the same opponent

  for (let i = 1; i < games.length; i++) {
    const prev = games[i - 1];
    const cur = games[i];
    tally(prev.won ? afterWin : afterLoss, cur.won);
    if (!prev.won && prev.margin <= -5) tally(afterBlowoutLoss, cur.won);
    const dayGap = (new Date(cur.et) - new Date(prev.et)) / 86400000;
    if (dayGap >= 2) tally(afterOffDay, cur.won);
  }
  for (let i = 0; i < games.length; i++) {
    const cur = games[i];
    const next = games[i + 1];
    const prevSameOpp = i > 0 && games[i - 1].oppId === cur.oppId;
    const nextSameOpp = next && next.oppId === cur.oppId;
    if (prevSameOpp && !nextSameOpp) tally(seriesFinales, cur.won);
  }

  const fmt = (r) => `${r.w}-${r.l}`;
  // Run environment trend: last 14 days vs full season, runs for/against per game.
  const anchor = games[games.length - 1].et;
  const cutoff = new Date(new Date(anchor + 'T12:00:00').getTime() - 13 * 86400000).toISOString().slice(0, 10);
  const recent = games.filter(g => g.et >= cutoff);
  const avg = (arr, k) => (arr.length ? (arr.reduce((a, g) => a + g[k], 0) / arr.length).toFixed(1) : '—');
  const runsLine = recent.length >= 5
    ? ` | runs last 14 days: ${avg(recent, 'rf')} for / ${avg(recent, 'ra')} against per game (season ${avg(games, 'rf')}/${avg(games, 'ra')})`
    : '';
  const lines = [
    `${teamName} this season: after a loss ${fmt(afterLoss)} | after a loss by 5+ ${fmt(afterBlowoutLoss)} | after a win ${fmt(afterWin)} | in series finales ${fmt(seriesFinales)} | after an off day ${fmt(afterOffDay)}${runsLine}`,
  ];
  return { line: lines.join('\n'), records: { afterLoss, afterBlowoutLoss, afterWin, afterOffDay, seriesFinales } };
}

/**
 * RECENT FORM, SERIES-SHAPED (founder, Aug 10 2026): "last 7 would likely be
 * 1 game against 1 team, 3 against another and another 3 — Gary has to
 * understand that context too." A club's recent games grouped into series
 * runs (opponent+venue change = new series), each tallied with the opponent
 * named. The newest run is tagged (ongoing) only when it is tonight's
 * matchup — a finished set never wears the tag. Null-safe: no games, null.
 */
export function computeMlbRecentSeriesForm(games, teamNick, maxSeries = 4, ongoingOppNick = null) {
  const series = groupGamesIntoSeries(games, teamNick);
  if (!series.length) return null;
  const sideOf = (g) => (clubMatches(g.teams.home.team.name, teamNick) ? 'home' : 'away');
  const recent = series.slice(-maxSeries);
  return recent.map((s, i) => {
    let w = 0, l = 0;
    for (const g of s.games) {
      const side = sideOf(g);
      const us = g.teams[side]?.score;
      const them = g.teams[side === 'home' ? 'away' : 'home']?.score;
      if (us == null || them == null) continue;
      if (us > them) w += 1; else if (them > us) l += 1;
    }
    const ongoing = i === recent.length - 1 && !!ongoingOppNick && clubMatches(s.opp, ongoingOppNick);
    // Nickname = last word, except the league's two-word nicknames.
    const nick = /\b(Blue Jays|Red Sox|White Sox)$/.test(s.opp)
      ? s.opp.match(/\b(Blue Jays|Red Sox|White Sox)$/)[1]
      : s.opp.split(' ').pop();
    return `${s.home ? 'vs' : '@'} ${nick} ${w}-${l}${ongoing ? ' (ongoing)' : ''}`;
  }).join(' · ');
}

/** Shared series grouping: a club's games split into series runs (opponent
 *  or venue change = new run). Used by the form line and the situational
 *  layer so "a series" means the same thing everywhere. */
export function groupGamesIntoSeries(games, teamNick) {
  const rows = (Array.isArray(games) ? games : [])
    .filter(g => g?.teams?.home?.team?.name && g?.teams?.away?.team?.name);
  if (!rows.length || !teamNick) return [];
  const sideOf = (g) => (clubMatches(g.teams.home.team.name, teamNick) ? 'home' : 'away');
  const series = [];
  for (const g of rows) {
    const side = sideOf(g);
    const opp = side === 'home' ? g.teams.away.team.name : g.teams.home.team.name;
    const home = side === 'home';
    const last = series[series.length - 1];
    if (last && last.opp === opp && last.home === home) last.games.push(g);
    else series.push({ opp, home, games: [g] });
  }
  return series;
}

const shortMonthDay = (iso) => {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? String(iso).slice(0, 10)
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
};

/**
 * SEASON SERIES, GROUPED (founder, Aug 10: "Phillies won the series back in
 * June" instead of nine raw dated lines — familiarity, not a mandate). The
 * same meetings the season-series tally uses, grouped into series (venue
 * flip or a >3-day gap = a new set), each tallied with its dates.
 */
export function computeMlbSeasonSeriesGroups(seasonIndex, homeBdlId, awayBdlId, homeTeam, awayTeam) {
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
  const groups = [];
  for (const g of meetings) {
    const venue = g.homeId === homeBdlId ? 'home' : 'away';
    const last = groups[groups.length - 1];
    const gapDays = last
      ? Math.round((new Date(`${toEtDate(g.date)}T12:00:00Z`) - new Date(`${toEtDate(last.games[last.games.length - 1].date)}T12:00:00Z`)) / 86400000)
      : 99;
    if (last && last.venue === venue && gapDays <= 3) last.games.push(g);
    else groups.push({ venue, games: [g] });
  }
  return groups.map(gr => {
    let hw = 0, aw = 0;
    for (const g of gr.games) {
      const hosted = g.homeId === homeBdlId;
      const hr = hosted ? g.homeRuns : g.awayRuns;
      const ar = hosted ? g.awayRuns : g.homeRuns;
      if (hr > ar) hw++; else aw++;
    }
    const first = shortMonthDay(toEtDate(gr.games[0].date));
    const last = shortMonthDay(toEtDate(gr.games[gr.games.length - 1].date));
    const span = first === last ? first : `${first}–${last}`;
    const result = hw === aw ? `split ${hw}-${aw}` : (hw > aw ? `${homeTeam} won ${hw}-${aw}` : `${awayTeam} won ${aw}-${hw}`);
    return `${span} at ${gr.venue === 'home' ? homeTeam : awayTeam} — ${result}`;
  });
}

/**
 * SITUATIONALLY, GAME BY GAME (founder GO, Aug 10): per-game RISP, LOB,
 * one-run flag, and pen events with the arm NAMED — "if the same guy
 * fucked them 3 games out of 7," the name is on every line. Rows arrive
 * from the official boxscore; a row with nothing to say prints nothing.
 */
export function situationalSeriesLine(label, rows) {
  const parts = (rows || []).filter(Boolean).map(r => {
    const bits = [];
    if (r.risp) bits.push(`RISP ${r.risp}`);
    if (r.lob != null) bits.push(`${r.lob} LOB`);
    if (r.oneRun) bits.push('one-run game');
    const pens = (r.penEvents || [])
      .map(p => `${p.name}${p.note ? ` ${p.note}` : ''}${p.er ? ` ${p.er} ER` : ''}`);
    if (pens.length) bits.push(`pen: ${pens.join(', ')}`);
    return bits.length ? `${r.date}: ${bits.join(', ')}` : null;
  }).filter(Boolean);
  return parts.length ? `${label}: ${parts.join(' · ')}` : null;
}
