// THE NFL GAME LOG (founder, Sep 23 2026: "NFL needs the hit rates part that
// MLB has too"). The same PlayerGameLog contract the MLB cards carry
// (`payload.log`: n, d, o, s), built from nflverse's weekly player lines so the
// yardstick can count his games against any mark. A September sample is two or
// three games, so the log runs across this season and last (regular season
// only, oldest first, the last 20 games): a window names its game count and
// the dates show where last season ends. No `ge`: the NFL has no season window.

import { RELEASE_BASE, fetchCsv } from '../nflStreaksService.js';
import { normName } from '../darts/dartsCommon.js';

const KEEP = 20;
const num = (v) => Number(v || 0);

/** The stats the log carries, by the key iOS reads (LogStat.nfl). */
export const NFL_LOG_STATS = {
  rec: (r) => num(r.receptions),
  recyds: (r) => num(r.receiving_yards),
  rushyds: (r) => num(r.rushing_yards),
  carries: (r) => num(r.carries),
  td: (r) => num(r.rushing_tds) + num(r.receiving_tds),
  passyds: (r) => num(r.passing_yards),
  passtd: (r) => num(r.passing_tds),
  cmp: (r) => num(r.completions),
  int: (r) => num(r.passing_interceptions),
};

// nflverse writes the Rams as LA; BDL and the cards write LAR.
const TEAM_ALIAS = { LAR: 'LA', WSH: 'WAS', JAC: 'JAX' };

function shortDate(ymd) {
  const d = new Date(`${ymd}T12:00:00-04:00`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
}

/**
 * Every regular-season game line for this season and last, by player: keyed
 * by name and club, and by name alone (the player's longest record under the
 * name, so a traded player keeps his whole log). A missing last season is not
 * fatal; a missing current season throws, and the cards build without logs.
 */
export async function loadNflLogs(season) {
  const [now, prev, schedule] = await Promise.all([
    fetchCsv(`${RELEASE_BASE}/stats_player/stats_player_week_${season}.csv`),
    fetchCsv(`${RELEASE_BASE}/stats_player/stats_player_week_${season - 1}.csv`).catch(() => []),
    fetchCsv(`${RELEASE_BASE}/schedules/games.csv`).catch(() => []),
  ]);
  const gameday = new Map(schedule.map((g) => [g.game_id, g.gameday]));
  const byId = new Map();
  for (const r of [...prev, ...now]) {
    if (r.season_type !== 'REG') continue;
    const [, , away, home] = String(r.game_id || '').split('_');
    const game = {
      season: num(r.season), week: num(r.week),
      date: shortDate(gameday.get(r.game_id) || ''),
      opp: `${r.team === home ? '' : r.team === away ? '@' : ''}${r.opponent_team || ''}`,
      team: r.team,
      stats: Object.fromEntries(Object.entries(NFL_LOG_STATS).map(([k, pick]) => [k, pick(r)])),
    };
    const id = r.player_id || `${normName(r.player_display_name)}|${r.team}`;
    if (!byId.has(id)) byId.set(id, { name: normName(r.player_display_name), games: [] });
    byId.get(id).games.push(game);
  }
  const byKey = new Map();
  const byName = new Map();
  for (const { name, games } of byId.values()) {
    games.sort((a, b) => a.season - b.season || a.week - b.week);
    const team = games[games.length - 1].team;
    byKey.set(`${name}|${team}`, games);
    if (!byName.has(name) || byName.get(name).length < games.length) byName.set(name, games);
  }
  return { byKey, byName };
}

/** One player's log, or null when nflverse has no lines for him. */
export function nflGameLog(logs, playerName, teamAbbr) {
  if (!logs) return null;
  const name = normName(playerName);
  const team = TEAM_ALIAS[teamAbbr] || teamAbbr;
  const games = logs.byKey.get(`${name}|${team}`) || logs.byName.get(name);
  if (!games?.length) return null;
  const last = games.slice(-KEEP);
  const log = { n: last.length, d: last.map((g) => g.date), o: last.map((g) => g.opp), s: {} };
  for (const key of Object.keys(NFL_LOG_STATS)) log.s[key] = last.map((g) => g.stats[key]);
  return log;
}
