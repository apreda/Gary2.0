/**
 * EACH UNIT GAME BY GAME, AND WHO PLAYED THE SNAPS (founder GO, Oct 4 2026).
 *
 * The NFL desk gave each unit one number for the season: "allows 82 rushing
 * yards a game". The founder's point: season totals "only tell a small amount
 * of the story", each game is new, and a number is only as good as the
 * players who produced it and whether they play today. MLB's desk already
 * reads this way (form over the last 3, 5, 10 games, the starter's outings one
 * by one, today's lineup); this is football's version of it:
 *
 *   1. every game this season on its own line for each unit: the opponent,
 *      the score, who played quarterback, and the offense and the defense as
 *      plays, EPA, success, the run game, the pass game, sacks and turnovers;
 *   2. every player on today's injury report who took a real share of a
 *      unit's snaps this season, with his share week by week, beside the
 *      other players at his position and theirs.
 *
 * Facts only. Nothing here says what a game or an absence means; a source
 * that does not answer is named as missing.
 */
import { getPlayLedger } from '../../../nflPlayLedger.js';
import { getSnapWeeks, nflverseCode } from '../../../nflverseService.js';
import { loadTeamResults } from '../../tools/statRouters/footballTeamGames.js';

const SPORT = 'americanfootball_nfl';
const RULE = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
const SNAP_FLOOR = 25;
// A position group is the set of players who can take one another's snaps.
const GROUPS = [
  ['QB', ['QB']], ['RB', ['RB', 'FB', 'HB']], ['WR', ['WR']], ['TE', ['TE']],
  ['OL', ['T', 'G', 'C', 'OL', 'OT', 'OG', 'LT', 'RT', 'LG', 'RG']],
  ['DL', ['DE', 'DT', 'DL', 'NT', 'EDGE']], ['LB', ['LB', 'OLB', 'ILB', 'MLB']],
  ['DB', ['CB', 'S', 'DB', 'FS', 'SS']],
];
const groupOf = (position) => GROUPS.find(([, members]) => members.includes(String(position || '').toUpperCase()))?.[0] || null;
const nameKey = (value) => String(value || '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '').replace(/[^a-z]/g, '');
const pct = (rate) => (rate == null ? '—' : `${Math.round(rate * 100)}%`);
const signed = (value) => (value == null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(2)}`);
const per = (yards, plays) => (plays > 0 ? (yards / plays).toFixed(1) : '—');
const day = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });

function unitLine(label, line, side) {
  const off = side === 'offense';
  const plays = off ? line.offense_plays : line.defense_plays;
  if (!plays) return `    ${label}: no scrimmage plays recorded`;
  const epa = off ? line.offense_epa_per_play : line.defense_epa_per_play_allowed;
  const success = off ? line.offense_success_rate : line.defense_success_rate_allowed;
  const runs = off ? line.offense_runs : line.defense_runs;
  const runYards = off ? line.offense_run_yards : line.defense_run_yards_allowed;
  const passes = off ? line.offense_pass_plays : line.defense_pass_plays;
  const passYards = off ? line.offense_pass_yards : line.defense_pass_yards_allowed;
  const sacks = off ? line.offense_sacks_taken : line.defense_sacks;
  const turnovers = off ? line.offense_giveaways : line.defense_takeaways;
  return `    ${label}: ${plays} plays, ${signed(epa)} EPA per play${off ? '' : ' allowed'}, ${pct(success)} success${off ? '' : ' allowed'}`
    + ` · ${runs} runs for ${runYards} (${per(runYards, runs)})`
    + ` · ${passes} pass plays for ${passYards} (${per(passYards, passes)}), ${sacks} sack${sacks === 1 ? '' : 's'}${off ? ' taken' : ''}`
    + ` · ${turnovers} ${off ? 'giveaway' : 'takeaway'}${turnovers === 1 ? '' : 's'}`;
}

/** One team's regular-season games, newest first, each unit on its own line. */
function gameLines(team, code, ledger, results) {
  const games = (ledger.games || []).filter((g) => g.season_type === 'REG' && g.lines?.[code]).sort((a, b) => b.week - a.week);
  if (!games.length) return [`${team}: no ${ledger.season} regular-season games in the play-by-play source yet.`];
  const byWeek = new Map((results || []).map((r) => [Number(r.week), r]));
  const lines = [`${team}`];
  for (const game of games) {
    const result = byWeek.get(Number(game.week));
    const head = result
      ? `${day(result.date)} · ${result.won ? 'W' : result.scored === result.allowed ? 'T' : 'L'} ${result.scored}-${result.allowed} ${result.home ? 'vs' : '@'} ${result.opponent}`
      : `vs ${game.game_id.split('_').slice(2).filter((c) => c !== code).join('')}`;
    const qb = game.starters?.[code];
    const quarterback = qb ? ` · QB ${qb.name}${qb.share < 0.9 ? ` (${Math.round(qb.share * 100)}% of the pass plays)` : ''}` : '';
    lines.push(`  Wk ${game.week} · ${head}${quarterback}`, unitLine('offense', game.lines[code], 'offense'), unitLine('defense', game.lines[code], 'defense'));
  }
  return lines;
}

/** "Wk1 82%, Wk2 78%, Wk3 —" across every week the team has played. */
function weekShares(rows, weeks, side) {
  const byWeek = new Map(rows.map((r) => [r.week, r[`${side}_pct`]]));
  return weeks.map((week) => `Wk${week} ${byWeek.get(week) ? `${byWeek.get(week)}%` : 'did not play'}`).join(', ');
}

/**
 * Match the injury report's names to the snap data's. The two sources spell
 * first names differently ("Sam Cosmi" on the report, "Samuel Cosmi" in the
 * snap counts), so a full-name miss falls back to surname plus first initial,
 * and only when that is one player on this team.
 */
function reportLookup(injuries, players) {
  const surnameKey = (value) => {
    const parts = String(value || '').replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/gi, '').trim().split(/\s+/);
    return parts.length > 1 ? `${nameKey(parts.at(-1))}|${nameKey(parts[0]).slice(0, 1)}` : null;
  };
  const named = (i) => i.name || `${i.player?.first_name || ''} ${i.player?.last_name || ''}`.trim();
  const full = new Map((injuries || []).map((i) => [nameKey(named(i)), i]));
  const loose = new Map();
  for (const i of injuries || []) {
    const key = surnameKey(named(i));
    if (key) loose.set(key, loose.has(key) ? null : i);
  }
  const snapLoose = new Map();
  for (const player of players) {
    const key = surnameKey(player);
    if (key) snapLoose.set(key, (snapLoose.get(key) || 0) + 1);
  }
  return (player) => full.get(nameKey(player))
    || (snapLoose.get(surnameKey(player)) === 1 ? loose.get(surnameKey(player)) : null) || null;
}

/** The injury report's players who took real snaps, and the others at their position. */
function snapLines(team, snaps, injuries) {
  if (snaps?.unavailable) return [`${team}: snap counts unavailable (${snaps.reason}).`];
  const weeks = [...new Set(snaps.rows.map((r) => r.week))].sort((a, b) => a - b);
  const byPlayer = new Map();
  for (const row of snaps.rows) {
    if (!byPlayer.has(row.player)) byPlayer.set(row.player, []);
    byPlayer.get(row.player).push(row);
  }
  const peak = (rows, side) => Math.max(0, ...rows.map((r) => r[`${side}_pct`] || 0));
  const reported = reportLookup(injuries, [...byPlayer.keys()]);
  const status = (player) => reported(player)?.status || 'on the report';
  const lines = [`${team}`];
  let listed = 0;
  for (const side of ['offense', 'defense']) {
    const affected = [...byPlayer].filter(([player, rows]) => reported(player) && peak(rows, side) >= SNAP_FLOOR);
    if (!affected.length) continue;
    lines.push(`  ${side.toUpperCase()}`);
    // One block per position group: the reported players, then everyone else
    // who has played there.
    const groups = new Map();
    for (const [player, rows] of affected) {
      const group = groupOf(rows[0].position) || rows[0].position || 'other';
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push([player, rows]);
    }
    for (const [group, players] of groups) {
      for (const [player, rows] of players.sort((a, b) => peak(b[1], side) - peak(a[1], side))) {
        listed += 1;
        lines.push(`    ${player} ${rows[0].position} — ${status(player)} · snaps: ${weekShares(rows, weeks, side)}`);
      }
      const named = new Set(players.map(([player]) => player));
      const others = [...byPlayer].filter(([other, otherRows]) => !named.has(other) && groupOf(otherRows[0].position) === group
        && otherRows.some((r) => (r[`${side}_pct`] || 0) > 0))
        .sort((a, b) => peak(b[1], side) - peak(a[1], side)).slice(0, 6)
        .map(([other, otherRows]) => `${other}${reported(other) ? ` (${status(other)})` : ''} ${weekShares(otherRows, weeks, side)}`);
      if (others.length) lines.push(`      others at ${group}: ${others.join('; ')}`);
    }
  }
  lines.push(listed
    ? `  No other player with ${SNAP_FLOOR}% or more of a unit's snaps in a game this season is on the injury report.`
    : `  No player with ${SNAP_FLOOR}% or more of a unit's snaps in a game this season is on the injury report.`);
  return lines;
}

/**
 * @returns {Promise<string>} the two desk sections, or a line naming what could not be read.
 */
export async function nflGameByGameSections({ homeTeam, awayTeam, home, away, season, injuries = {} }) {
  const [ledger, homeResults, awayResults, homeSnaps, awaySnaps] = await Promise.all([
    getPlayLedger(season).catch((e) => ({ unavailable: true, reason: e.message })),
    home?.id ? loadTeamResults(SPORT, home.id, season).catch(() => []) : [],
    away?.id ? loadTeamResults(SPORT, away.id, season).catch(() => []) : [],
    getSnapWeeks(homeTeam, season).catch((e) => ({ unavailable: true, reason: e.message })),
    getSnapWeeks(awayTeam, season).catch((e) => ({ unavailable: true, reason: e.message })),
  ]);
  const games = ledger?.unavailable
    ? [`Play-by-play is unavailable for ${season} (${ledger.reason}), so the game-by-game lines could not be built.`]
    : [...gameLines(awayTeam, nflverseCode(awayTeam), ledger, awayResults), '', ...gameLines(homeTeam, nflverseCode(homeTeam), ledger, homeResults)];
  return `EACH UNIT, GAME BY GAME — ${season} REGULAR SEASON
${RULE}
Every game this season, newest first, each unit's game on its own line. The
season totals are in the source evidence below; a total does not show which
game produced it. A pass play is a dropback, sacks and their yards included.
The quarterback named is the one with the most pass plays in that game.

${games.join('\n')}
${RULE}

WHO PLAYED THOSE SNAPS, AND WHO IS ON TODAY'S INJURY REPORT
${RULE}
Each player on today's injury report who took ${SNAP_FLOOR}% or more of a unit's snaps in
a game this season, with his share of the snaps week by week, and the other
players at his position with theirs. Past participation only; this is not a
lineup declaration.

${[...snapLines(awayTeam, awaySnaps, injuries.away), '', ...snapLines(homeTeam, homeSnaps, injuries.home)].join('\n')}
${RULE}
`;
}
