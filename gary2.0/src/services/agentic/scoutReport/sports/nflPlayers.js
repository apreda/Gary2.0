/**
 * PLAYERS (founder GO, Oct 5 2026: "why do we have to list key players? ... just give Gary the player stats ...
 * best players first by stats ... the bottom of the list is the insignificant players").
 *
 * KEY PLAYERS kept the top two on the depth chart at each spot with caps (three receivers, two backs, one
 * lineman, eight defenders), so a producing fourth receiver or a rotational pass rusher never showed, and the
 * same players reprinted under TOP RECEIVING TARGETS, ROSTER DEPTH and STARTING QUARTERBACKS. This prints every
 * player with a stat this season, once, in the group where he produces most, best first: passing, rushing,
 * receiving, defense. His depth-chart spot and red-zone line ride on that one line; injury status prints once, in
 * the injury report. Every other player on the roster is listed too, by position with his spot: nobody is cut.
 */
import { redZoneLine } from '../../../nflRedZone.js';
import { footballSeasonLabel } from './footballSeason.js';
import { ballDontLieService } from '../../../ballDontLieService.js';

const RULE = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
const n = (v) => Number(v) || 0;
const nameOf = (row) => `${row.player?.first_name || ''} ${row.player?.last_name || ''}`.trim();
const ST = new Set(['KR', 'PR', 'H', 'LS', 'P', 'PK', 'K']);
const OFFENSE = new Set(['QB', 'RB', 'FB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT', 'OL', 'G', 'T']);
const fold = (s) => String(s || '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '').replace(/[^a-z]/g, '');

function rosterIndex(roster) {
  const byId = new Map();
  for (const e of roster || []) {
    const id = e.player?.id; if (id == null) continue;
    const pos = String(e.position || e.player?.position_abbreviation || '').toUpperCase().replace(/^WR-\d+$/, 'WR');
    const prev = byId.get(id);
    // A return or holding duty is not his position: KR1 is a running back's second job.
    const st = ST.has(pos), prevSt = prev ? ST.has(prev.pos) : true;
    if (!prev || (prevSt && !st) || (st === prevSt && (e.depth || 99) < (prev.depth || 99))) byId.set(id, { pos, depth: e.depth || null, injury: e.injury_status || null });
  }
  return byId;
}

function teamBlock(team, stats, roster, { redZone, season, qbName, gameLogs }) {
  const idx = rosterIndex(roster);
  const tag = (row) => {
    const r = idx.get(row.player?.id);
    const pos = r?.pos || row.player?.position_abbreviation || '';
    return `${nameOf(row)} ${pos}${r?.depth ? r.depth : ''}`;  // status prints once, in the injury report
  };
  const rz = (row) => (redZone && season ? redZoneLine(redZone, nameOf(row), season, row.player?.position_abbreviation) : null);
  const used = new Set();
  let coverage = new Map();
  // A player's red zone and game-by-game lines sit under the group where he produces most (a receiver with two
  // carries reads under RECEIVING); defenders' extras sit under DEFENSE.
  const primary = (row) => { const y = { passing: n(row.passing_yards), rushing: n(row.rushing_yards), receiving: n(row.receiving_yards) };
    return Object.values(y).some((v) => v) ? Object.entries(y).sort((a, b) => b[1] - a[1])[0][0] : 'defense'; };
  const line = (row, text, group) => { const first = group ? primary(row) === group && !used.has(row.player?.id) : !used.has(row.player?.id); if (first) used.add(row.player?.id); const z = first ? rz(row) : null; const cov = first ? coverage.get(row.player?.id) : null; const games = first ? (gameLogs?.get(String(row.player?.id)) || []) : []; return `    ${tag(row)} — ${text}${cov ? ` · also ${cov}` : ''}${z ? `\n        ${z}` : ''}${games.length ? `\n        by game: ${games.map(gameLine).join(' · ')}` : ''}`; };
  const rows = (stats || []).filter((r) => r.player?.id != null);
  const passing = rows.filter((r) => n(r.passing_attempts) > 0).sort((a, b) => n(b.passing_yards) - n(a.passing_yards));
  const rushing = rows.filter((r) => n(r.rushing_attempts) > 0).sort((a, b) => n(b.rushing_yards) - n(a.rushing_yards));
  const receiving = rows.filter((r) => n(r.receptions) > 0 || n(r.receiving_yards) > 0).sort((a, b) => n(b.receiving_yards) - n(a.receiving_yards));
  const impact = (r) => n(r.defensive_sacks) * 3 + n(r.total_tackles) + n(r.defensive_interceptions) * 5 + n(r.fumbles_forced) * 3 + n(r.fumbles_recovered) * 2;
  const isOffense = (r) => OFFENSE.has(idx.get(r.player?.id)?.pos || String(r.player?.position_abbreviation || '').toUpperCase());
  const defense = rows.filter((r) => impact(r) > 0 && !isOffense(r)).sort((a, b) => impact(b) - impact(a));
  // An offensive player's tackles and recoveries (after a turnover, on special teams) ride on his own line.
  coverage = new Map(rows.filter((r) => impact(r) > 0 && isOffense(r)).map((r) => [r.player.id, [n(r.total_tackles) ? `${n(r.total_tackles)} tkl` : null,
    n(r.fumbles_forced) ? `${n(r.fumbles_forced)} FF` : null, n(r.fumbles_recovered) ? `${n(r.fumbles_recovered)} FR` : null].filter(Boolean).join(', ')]));
  const out = [`${team}`];
  if (passing.length) out.push('  PASSING', ...passing.map((r) => line(r, [
    fold(nameOf(r)) === fold(qbName) ? 'starting this week' : null,
    `${n(r.passing_completions)}/${n(r.passing_attempts)}`, `${n(r.passing_yards)} yds`, `${n(r.passing_touchdowns)} TD`, `${n(r.passing_interceptions)} INT`,
    r.passing_completion_pct != null ? `${Number(r.passing_completion_pct).toFixed(1)}%` : null,
    r.yards_per_pass_attempt != null ? `${Number(r.yards_per_pass_attempt).toFixed(1)} Y/A` : null,
    r.qbr != null ? `QBR ${Number(r.qbr).toFixed(1)}` : null, `${n(r.games_played)} GP`].filter(Boolean).join(', '), 'passing')));
  if (rushing.length) out.push('  RUSHING', ...rushing.map((r) => line(r, [`${n(r.rushing_attempts)} car`, `${n(r.rushing_yards)} yds`,
    r.yards_per_rush_attempt != null ? `${Number(r.yards_per_rush_attempt).toFixed(1)} YPC` : null, `${n(r.rushing_touchdowns)} TD`,
    n(r.rushing_fumbles_lost) ? `${n(r.rushing_fumbles_lost)} fumbles lost` : null].filter(Boolean).join(', '), 'rushing')));
  if (receiving.length) out.push('  RECEIVING', ...receiving.map((r) => line(r, [r.receiving_targets != null ? `${n(r.receiving_targets)} tgt` : null,
    `${n(r.receptions)} rec`, `${n(r.receiving_yards)} yds`, `${n(r.receiving_touchdowns)} TD`].filter(Boolean).join(', '), 'receiving')));
  if (defense.length) out.push('  DEFENSE', ...defense.map((r) => line(r, [`${n(r.total_tackles)} tkl`, n(r.defensive_sacks) ? `${n(r.defensive_sacks)} sacks` : null,
    n(r.defensive_interceptions) ? `${n(r.defensive_interceptions)} INT` : null, n(r.fumbles_forced) ? `${n(r.fumbles_forced)} FF` : null,
    n(r.fumbles_recovered) ? `${n(r.fumbles_recovered)} FR` : null].filter(Boolean).join(', '), 'defense')));
  // EVERYONE ELSE ON THE ROSTER (founder, Oct 5 2026: "don't cut things just let Gary figure it out ... if they
  // aren't starting or have no stats but then next game they do ... Gary then needs to know that player's role").
  // Every rostered player without a stat line this season, by position, with his depth-chart spot and status.
  const statIds = new Set(rows.map((r) => r.player?.id));
  const byPos = new Map();
  for (const e of [...(roster || [])].sort((x, y) => (x.depth || 99) - (y.depth || 99))) {
    if (statIds.has(e.player?.id)) continue;
    const pos = String(e.position || e.player?.position_abbreviation || '?').toUpperCase().replace(/^WR-\d+$/, 'WR');
    const who = `${e.player_name || `${e.player?.first_name || ''} ${e.player?.last_name || ''}`.trim()}${e.depth ? ` (${pos}${e.depth})` : ''}`;
    if (!byPos.has(pos)) byPos.set(pos, new Set());
    byPos.get(pos).add(who);
  }
  if (byPos.size) out.push('  ON THE ROSTER, NO STATS THIS SEASON (depth-chart spot)', ...[...byPos].map(([pos, names]) => `    ${pos}: ${[...names].join(' · ')}`));
  if (out.length === 1) out.push('  No player season stats on file.');
  return out.join('\n');
}

/**
 * GAME BY GAME FOR EVERY OFFENSIVE PLAYER (founder, Oct 5 2026: "season totals don't tell the full story ... show
 * game by game for each player that plays, especially on offense; defense is more team wide"). Every player with
 * a passing, rushing or receiving line this season, each of his games: Map of player id -> games, newest first.
 */
export async function loadNflOffenseGameLogs(keyPlayers, { asOf = new Date() } = {}) {
  const src = keyPlayers?.source_records;
  const out = new Map();
  if (!src) return out;
  for (const side of ['home', 'away']) {
    const season = keyPlayers.statsSeasons?.[side];
    const ids = (src[`${side}Stats`] || []).filter((r) => n(r.passing_attempts) || n(r.rushing_attempts) || n(r.receptions) || n(r.receiving_yards)).map((r) => r.player?.id).filter((id) => id != null);
    if (!ids.length || !Number.isInteger(season)) continue;
    const logs = await ballDontLieService.getNflPlayerGameLogsBatch(ids, season, 25, 15, { asOf }).catch(() => ({}));
    for (const [id, l] of Object.entries(logs || {})) out.set(String(id), (l.games || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date))));
  }
  return out;
}

const gameLine = (g) => {
  const parts = [];
  if (n(g.pass_att)) parts.push(`${n(g.pass_comp)}/${n(g.pass_att)} ${n(g.pass_yds)} yds ${n(g.pass_tds)} TD ${n(g.ints)} INT`);
  if (n(g.rush_att)) parts.push(`${n(g.rush_att)} car ${n(g.rush_yds)} yds${n(g.rush_tds) ? ` ${n(g.rush_tds)} TD` : ''}`);
  if (n(g.receptions) || n(g.targets) || n(g.rec_yds)) parts.push(`${n(g.receptions)}${g.targets != null ? `/${n(g.targets)}` : ''} rec ${n(g.rec_yds)} yds${n(g.rec_tds) ? ` ${n(g.rec_tds)} TD` : ''}`);
  const day = g.date ? new Date(g.date).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' }) : '?';
  return `${day} ${g.isHome ? 'vs' : '@'} ${g.opponent || '?'}: ${parts.join(', ') || 'no touches'}`;
};

/** @param keyPlayers the fetchKeyPlayers result; its source_records hold both rosters and every season stat row. */
export function formatNflPlayers({ homeTeam, awayTeam, keyPlayers, redZone = null, season = null, startingQBs = null, injuries = {}, gameLogs = null }) {
  const src = keyPlayers?.source_records;
  if (!src) return '';
  const label = (side) => { const y = keyPlayers.statsSeasons?.[side]; return y == null ? 'season stats unavailable' : `${footballSeasonLabel(y)}${y < keyPlayers.rosterSeason ? ' (prior season baseline: this season has no games yet)' : ''}`; };
  return [`PLAYERS — the whole roster: every player with a stat best first in each group (offensive players game by game under their line), then everyone else by position; depth-chart spot and red zone on his line (injury status is in the injury report)`, RULE,
    `${awayTeam}: ${label('away')} · ${homeTeam}: ${label('home')}`, '',
    teamBlock(awayTeam, src.awayStats, src.awayRoster, { redZone, season, qbName: startingQBs?.away?.name, gameLogs }), '',
    teamBlock(homeTeam, src.homeStats, src.homeRoster, { redZone, season, qbName: startingQBs?.home?.name, gameLogs }),
    RULE, ''].join('\n');
}
