/** A missing provider value is unknown; a returned zero is a measured zero. */
export function numericStat(value) {
  if (value == null || typeof value === 'boolean' || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function completedGameStatus(value) {
  const status = String(value ?? '').trim().toLowerCase();
  return !status || /^final(?:\b|\/)/.test(status) || ['post', 'complete', 'completed'].includes(status);
}

/** NBA stat games use flat team IDs; football feeds may embed team objects. */
export function playerGameSide(row) {
  const game = row.game || {};
  const teamId = row.team?.id ?? row.team_id ?? row.player?.team?.id ?? null;
  const homeId = game.home_team?.id ?? game.home_team_id;
  const awayId = game.visitor_team?.id ?? game.away_team?.id ?? game.visitor_team_id ?? game.away_team_id;
  const same = id => teamId != null && id != null && String(teamId) === String(id);
  const isHome = same(homeId) ? true : same(awayId) ? false : null;
  const opponent = isHome === true ? (game.visitor_team || game.away_team) : isHome === false ? game.home_team : null;
  return {
    teamId, isHome,
    opponentId: isHome === true ? (awayId ?? null) : isHome === false ? (homeId ?? null) : null,
    opponent: opponent?.abbreviation || opponent?.full_name || opponent?.name || null,
  };
}

export function completeAverage(rows, field) {
  const values = rows.map(row => numericStat(row[field]));
  return values.length && values.every(value => value !== null)
    ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function minutes(value) {
  if (typeof value === 'string' && /^\d+:\d{2}$/.test(value.trim())) {
    const [whole, seconds] = value.trim().split(':').map(Number);
    return seconds < 60 ? whole + seconds / 60 : null;
  }
  return numericStat(value);
}

const STAT_FIELDS = ['pts', 'reb', 'ast', 'stl', 'blk', 'fg3m'];
const METRIC_FIELDS = [...STAT_FIELDS, 'min', 'pra'];
const VARIANCE_FIELDS = ['pts', 'reb', 'ast', 'fg3m', 'pra'];
const fixed = (value, places = 1) => value === null ? null : value.toFixed(places);

/** Summarize only the requested player's completed games before the cutoff.
 * Missing sample fields stay unknown, including averages and hit-rate inputs. */
export function summarizeNbaPlayerGameLogs(rows, { playerId, season, asOf = new Date(), numGames = 10, propLines = {} }) {
  const cutoff = new Date(asOf).getTime();
  if (!Number.isFinite(cutoff)) return null;
  const groups = new Map();
  const diagnostics = { ineligible: 0, duplicates: 0, conflicts: 0 };
  for (const row of rows || []) {
    const game = row?.game;
    const date = Date.parse(game?.date || '');
    const min = minutes(row?.min);
    if (String(row?.player?.id ?? row?.player_id) !== String(playerId)
        || game?.id == null || !Number.isFinite(date) || date >= cutoff
        || Number(game.season) !== Number(season)
        || (row.season != null && Number(row.season) !== Number(season))
        || !completedGameStatus(game.status) || !(min > 0)) {
      diagnostics.ineligible++;
      continue;
    }
    const stats = {
      gameId: game.id, date: game.date, season: Number(season), status: game.status ?? null,
      ...playerGameSide(row), min,
      ...Object.fromEntries(STAT_FIELDS.map(field => [field, numericStat(row[field])])),
    };
    stats.pra = [stats.pts, stats.reb, stats.ast].every(value => value !== null) ? stats.pts + stats.reb + stats.ast : null;
    const key = String(game.id);
    const signature = JSON.stringify(stats);
    const prior = groups.get(key);
    if (!prior) groups.set(key, { stats, signature, conflict: false });
    else if (prior.signature === signature) diagnostics.duplicates++;
    else {
      if (!prior.conflict) diagnostics.conflicts++;
      prior.conflict = true;
    }
  }
  const requested = Number(numGames);
  const count = Number.isFinite(requested) ? Math.max(1, Math.min(100, Math.trunc(requested))) : 10;
  const games = [...groups.values()].filter(group => !group.conflict).map(group => group.stats)
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, count);
  if (!games.length) return null;
  const averages = Object.fromEntries(METRIC_FIELDS.map(field => [field, completeAverage(games, field)]));
  const stdDevs = Object.fromEntries(VARIANCE_FIELDS.map(field => [field, averages[field] === null ? null
    : Math.sqrt(games.reduce((sum, game) => sum + (game[field] - averages[field]) ** 2, 0) / games.length)]));
  const consistency = Object.fromEntries(VARIANCE_FIELDS.map(field => [field, averages[field] === null ? null
    : averages[field] > 0 ? Math.max(0, 1 - stdDevs[field] / averages[field]).toFixed(2) : '0.00']));
  const split = isHome => {
    const sample = games.filter(game => game.isHome === isHome);
    return sample.length ? { games: sample.length,
      ...Object.fromEntries(['pts', 'reb', 'ast'].map(field => [field, fixed(completeAverage(sample, field))])),
    } : null;
  };
  const hitRates = {};
  for (const [name, field] of Object.entries({ points: 'pts', rebounds: 'reb', assists: 'ast', threes: 'fg3m', pra: 'pra' })) {
    const line = numericStat(propLines[name]);
    if (line === null) continue;
    const sample = games.filter(game => game[field] !== null);
    const hits = sample.filter(game => game[field] > line).length;
    hitRates[name] = { line, hits, total: sample.length, unknown: games.length - sample.length,
      rate: sample.length ? `${(hits / sample.length * 100).toFixed(0)}%` : null };
  }
  return {
    playerId, season: Number(season), gamesAnalyzed: games.length, games,
    averages: Object.fromEntries(Object.entries(averages).map(([key, value]) => [key, fixed(value)])),
    stdDevs: Object.fromEntries(Object.entries(stdDevs).map(([key, value]) => [key, fixed(value)])),
    consistency, splits: { home: split(true), away: split(false) }, hitRates,
    diagnostics, lastGame: games[0],
  };
}
