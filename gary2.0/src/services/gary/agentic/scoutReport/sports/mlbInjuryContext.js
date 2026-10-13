/**
 * MLB injury context for the nightly pick desk.
 *
 * Games missed is a ROUTING clock, not a causal model. It decides whether an
 * absence is a fresh roster change, neutral established context, or long-term
 * roster baseline that no longer belongs in a nightly decision. Team form is
 * intentionally calculated and presented elsewhere, never attributed here to
 * an individual injury.
 */

export const MLB_FRESH_MAX_GAMES = 2;
export const MLB_LONG_TERM_MIN_GAMES = 10;

const num = (...values) => {
  for (const value of values) {
    if (value == null || value === '') continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
};

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

export function isMlbPitcherPosition(position) {
  const value = String(position || '').trim().toUpperCase();
  return ['P', 'SP', 'RP', 'RHP', 'LHP', 'CL'].includes(value) || value.includes('PITCHER');
}

/** Completed regular-season games for one team, oldest → newest. */
export function completedMlbTeamGames(seasonIndex, teamId) {
  if (!seasonIndex?.entries || teamId == null) return [];
  const games = [];
  for (const [id, game] of seasonIndex.entries()) {
    if (!sameId(game.homeId, teamId) && !sameId(game.awayId, teamId)) continue;
    if (!/final/i.test(String(game.status || ''))) continue;
    if (game.seasonType === 'spring_training') continue;
    const timestamp = Date.parse(game.date || '');
    if (!Number.isFinite(timestamp)) continue;
    games.push({ id, date: game.date, timestamp });
  }
  return games.sort((a, b) => a.timestamp - b.timestamp || String(a.id).localeCompare(String(b.id)));
}

/**
 * Resolve the number of TEAM games completed after the player's last actual
 * appearance. Matching the game id first makes doubleheaders exact; the date
 * fallback is conservative and does not guess about same-day ordering.
 * A null lastAppearance means the player has no appearance this season, so the
 * returned count is a minimum covering the team's whole completed schedule.
 */
export function resolveMlbGamesMissed(teamGames, lastAppearance) {
  const games = Array.isArray(teamGames) ? teamGames : [];
  if (lastAppearance === null) {
    return { gamesMissed: games.length, isMinimum: true };
  }
  if (!lastAppearance) return { gamesMissed: null, isMinimum: false };

  const exactIndex = games.findIndex((g) => sameId(g.id, lastAppearance.gameId));
  if (exactIndex >= 0) {
    return { gamesMissed: Math.max(0, games.length - exactIndex - 1), isMinimum: false };
  }

  const lastTimestamp = Date.parse(lastAppearance.date || '');
  if (!Number.isFinite(lastTimestamp)) return { gamesMissed: null, isMinimum: false };
  return {
    gamesMissed: games.filter((g) => g.timestamp > lastTimestamp).length,
    isMinimum: false,
  };
}

/**
 * Mechanical playing-time filter for ESTABLISHED absences. Fresh changes do
 * not need this gate; long-term absences are omitted regardless. The field
 * aliases mirror BDL's MLB season-stat shapes used elsewhere in the scout.
 */
export function isMeaningfulMlbAbsence(injury, seasonStats, teamGamesPlayed) {
  const playerId = injury?.player?.id;
  const row = (seasonStats || []).find((s) => sameId(s.player?.id, playerId));
  if (!row) return false;

  const position = injury?.player?.position || injury?.position || row.player?.position;
  const isPitcher = isMlbPitcherPosition(position);
  const teamGames = Math.max(1, Number(teamGamesPlayed) || 0);

  if (isPitcher) {
    const starts = num(row.pitching_gs, row.pitching_games_started, row.games_started);
    const appearances = num(row.pitching_gp, row.pitching_games, row.games_played);
    const rotationFloor = Math.max(3, Math.ceil(teamGames / 18));
    const leverageFloor = Math.max(12, Math.ceil(teamGames * 0.25));
    return starts >= rotationFloor || appearances >= leverageFloor;
  }

  const games = num(row.batting_gp, row.batting_games, row.games_played, row.gp);
  const plateAppearances = num(row.batting_pa, row.plate_appearances, row.batting_ab, row.at_bats);
  const gamesFloor = Math.max(10, Math.ceil(teamGames * 0.45));
  const paFloor = Math.max(75, Math.ceil(teamGames * 1.8));
  return games >= gamesFloor || plateAppearances >= paFloor;
}

/** Nightly routing decision for one injury row. */
export function classifyMlbInjuryContext({
  gamesMissed,
  gamesMissedIsMinimum = false,
  isPitcher = false,
  isScratch = false,
  isMeaningful = false,
} = {}) {
  if (isPitcher && isScratch) {
    return { include: true, tag: 'SP SCRATCH', reason: 'starter_change' };
  }
  if (!Number.isFinite(gamesMissed)) {
    return { include: false, tag: 'UNRESOLVED', reason: 'missing_game_clock' };
  }
  if (gamesMissed <= MLB_FRESH_MAX_GAMES && !gamesMissedIsMinimum) {
    return { include: true, tag: 'FRESH', reason: 'recent_roster_change' };
  }
  if (gamesMissed >= MLB_LONG_TERM_MIN_GAMES || gamesMissedIsMinimum) {
    return { include: false, tag: 'LONG-TERM', reason: 'current_roster_baseline' };
  }
  if (isMeaningful) {
    return { include: true, tag: 'ESTABLISHED', reason: 'meaningful_roster_context' };
  }
  return { include: false, tag: 'DEPTH', reason: 'non_core_established_absence' };
}

export function mlbGamesMissedLabel(gamesMissed, isMinimum = false) {
  if (!Number.isFinite(gamesMissed)) return 'team games missed unresolved';
  const shown = `${gamesMissed}${isMinimum ? '+' : ''}`;
  return `${shown} team game${gamesMissed === 1 && !isMinimum ? '' : 's'} missed`;
}
