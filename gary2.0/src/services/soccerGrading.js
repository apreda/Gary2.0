/**
 * Soccer (World Cup) pick grading — pure functions, no I/O.
 *
 * IMPORTANT: regHome/regAway must be the 90-MINUTE REGULATION score
 * (first half + second half), NOT the FIFA home_score/away_score, which
 * include extra time. Use fifaWorldCupService.getRegulationScore(match).
 *
 * Bet types: moneyline (Home/Away win), draw, total (O/U goals), asian_handicap.
 * The to_advance market is graded separately via getAdvanceResult (Plan A).
 */
export function gradeSoccerGame(pick, regHome, regAway) {
  if (regHome == null || regAway == null) return null;
  const type = (pick.type || 'moneyline').toLowerCase();
  const text = (pick.pick || '').toLowerCase();
  const hFull = (pick.homeTeam || '').toLowerCase();
  const aFull = (pick.awayTeam || '').toLowerCase();
  const hMascot = hFull.split(' ').pop();
  const aMascot = aFull.split(' ').pop();
  const picksHome = !!hFull && (text.includes(hFull) || (!!hMascot && text.includes(hMascot)));
  const picksAway = !!aFull && (text.includes(aFull) || (!!aMascot && text.includes(aMascot)));

  if (type === 'draw') {
    return regHome === regAway ? 'won' : 'lost';
  }

  if (type === 'total') {
    const line = parseFloat(pick.goal_line);
    const total = regHome + regAway;
    if (total === line) return 'push';
    return (/over/.test(text) ? total > line : total < line) ? 'won' : 'lost';
  }

  if (type === 'asian_handicap') {
    const h = parseFloat(pick.handicap);
    const margin = picksAway ? (regAway - regHome) : (regHome - regAway);
    const adj = margin + h;
    if (adj === 0) return 'push'; // whole-number AH can push
    return adj > 0 ? 'won' : 'lost';
  }

  // moneyline (3-way: no push — a draw loses both Home and Away ML)
  if (picksHome && !picksAway) return regHome > regAway ? 'won' : 'lost';
  if (picksAway && !picksHome) return regAway > regHome ? 'won' : 'lost';
  return 'lost';
}
