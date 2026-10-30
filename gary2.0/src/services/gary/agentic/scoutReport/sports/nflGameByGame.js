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
import { getPlayLedger } from '../../../../sports/nfl/nflPlayLedger.js';
import { getSnapWeeks, nflverseCode, NFLVERSE_TEAM_CODES, loadNflverseFile } from '../../../../providers/nflverseService.js';
import { getNflSchedule, sideFacts, restPhrase, tripPhrase, NFL_STADIUMS } from '../../../../sports/nfl/nflSchedule.js';
import { loadTeamResults } from '../../tools/statRouters/footballTeamGames.js';
import { loadLeagueContext, opponentSeasonClause } from '../../tools/statRouters/footballLeagueContext.js';
// A failed source is logged before it falls away (round 2 audit, Oct 13 2026: these fell away without a word).
const warnAs = (what, fallback) => (e) => { console.warn(`[Scout Report] NFL ${what} unavailable: ${e?.message || e}`); return fallback; };

const SPORT = 'americanfootball_nfl';
const RULE = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
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

const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const FULL_DETAIL_GAMES = 4;
const nickname = (name) => String(name || '').trim().split(/\s+/).at(-1) || 'opponent';

/** How a side's turnovers happened, from the offense that gave them up. */
function turnoverDetail(line, { returnedWord }) {
  if (!line || line.interceptions_thrown == null) return '';
  const fumbles = line.fumbles ? `${line.fumbles_lost} of ${plural(line.fumbles, 'fumble')} lost` : 'no fumbles';
  const parts = [plural(line.interceptions_thrown, 'interception'), fumbles];
  const back = line.giveaways_returned_for_td ? `, ${line.giveaways_returned_for_td} returned for ${returnedWord}` : '';
  return ` (${parts.join(', ')}${back})`;
}

/**
 * THE GAME SCRIPT (founder GO, Oct 12 2026): the snaps that came while the game was still a contest, beside the
 * whole game, so a stat line padded after a game was decided reads as that.
 */
function scriptLine(own, opp, oppName) {
  if (!own || own.contest_plays == null) return null;
  const offAll = own.offense_plays || 0;
  const defAll = own.defense_plays || 0;
  const offContest = own.contest_plays;
  const defContest = opp?.contest_plays ?? null;
  if (offContest === offAll && defContest === defAll) return '    game script: a contest on every snap';
  const offPart = `offense ${offContest} of ${offAll} plays while the game was a contest (${signed(own.contest_epa_per_play)} EPA per play, ${pct(own.contest_success_rate)} success)`;
  const defPart = defContest == null
    ? 'defense: not recorded'
    : `defense ${defContest} of ${defAll} (${signed(opp.contest_epa_per_play)} EPA per play allowed, ${pct(opp.contest_success_rate)} success allowed)`;
  return `    game script: ${offPart}; ${defPart}`;
}

const kickList = (distances) => distances.map((d) => (d == null ? 'distance not recorded' : `${d}`)).join(', ');
const returnList = (returns) => returns.map((r) => `${r.yards}-yard ${r.kind === 'punt' ? 'punt' : 'kickoff'} return`).join(', ');

/** Kicking, returns and the points neither offense scored, for the team and against it. */
function specialTeamsLine(own, opp) {
  if (!own || own.fg_att == null) return null;
  const bits = [];
  const misses = [];
  if (own.fg_missed_distances?.length) misses.push(`missed ${kickList(own.fg_missed_distances)}`);
  if (own.fg_blocked_distances?.length) misses.push(`blocked ${kickList(own.fg_blocked_distances)}`);
  bits.push(own.fg_att ? `field goals ${own.fg_made} of ${own.fg_att}${misses.length ? ` (${misses.join('; ')})` : ''}` : 'no field goal tries');
  if (own.xp_att) bits.push(`extra points ${own.xp_made} of ${own.xp_att}${own.xp_blocked ? ` (${own.xp_blocked} blocked)` : ''}`);
  if (own.punts_blocked) bits.push(`${plural(own.punts_blocked, 'punt')} blocked`);
  if (opp?.punts_blocked) bits.push(`blocked ${plural(opp.punts_blocked, 'punt')}`);
  if (opp?.fg_blocked_distances?.length || opp?.xp_blocked) bits.push(`blocked ${plural((opp.fg_blocked_distances?.length || 0) + (opp.xp_blocked || 0), 'kick')}`);
  bits.push(own.long_returns?.length ? `returns of 40+ yards: ${returnList(own.long_returns)}` : 'no returns of 40+ yards');
  if (opp?.long_returns?.length) bits.push(`allowed ${returnList(opp.long_returns)}`);
  if (own.special_teams_tds) bits.push(`${plural(own.special_teams_tds, 'special-teams touchdown')} scored`);
  if (opp?.special_teams_tds) bits.push(`${plural(opp.special_teams_tds, 'special-teams touchdown')} allowed`);
  if (own.special_teams_fumbles) bits.push(`fumbled ${plural(own.special_teams_fumbles, 'time')} on kicks and returns, lost ${own.special_teams_fumbles_lost}`);
  if (opp?.special_teams_fumbles_lost) bits.push(`recovered ${plural(opp.special_teams_fumbles_lost, 'opponent fumble')} on kicks and returns`);
  if (own.onside_recoveries) bits.push(`recovered ${plural(own.onside_recoveries, 'onside kick')}`);
  if (opp?.onside_recoveries) bits.push(`opponent recovered ${plural(opp.onside_recoveries, 'onside kick')}`);
  if (own.safeties_scored) bits.push(`${plural(own.safeties_scored, 'safety', 'safeties')} scored`);
  if (opp?.safeties_scored) bits.push(`${plural(opp.safeties_scored, 'safety', 'safeties')} allowed`);
  return `    special teams: ${bits.join(' · ')}`;
}

function penaltyLine(own, opp, oppName) {
  if (!own || own.penalties == null) return null;
  const them = opp?.penalties != null ? ` · ${oppName} ${plural(opp.penalties, 'penalty', 'penalties')} for ${opp.penalty_yards} yards` : '';
  return `    penalties: ${plural(own.penalties, 'penalty', 'penalties')} for ${own.penalty_yards} yards${them}`;
}

function unitLine(label, line, side, opp = null, oppName = 'opponent') {
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
    + ` · ${turnovers} ${off ? 'giveaway' : 'takeaway'}${turnovers === 1 ? '' : 's'}`
    + (off ? turnoverDetail(line, { returnedWord: 'an opponent touchdown' }) : turnoverDetail(opp, { returnedWord: 'a touchdown' }).replace(' (', ` (${oppName}: `));
}

// Read at call time, not at load: a test that mocks nflverseService without the code table still loads this file.
const teamNameOf = (code) => Object.entries(NFLVERSE_TEAM_CODES || {}).find(([, c]) => c === code)?.[0] || null;
const ordinalOf = (n) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th'}`;
const fieldSpot = (yards) => (yards == null ? '—' : yards <= 50 ? `own ${Math.round(yards)}` : `opponent's ${Math.round(100 - yards)}`);

/**
 * DRIVES (founder GO, Oct 12 2026, the NFL blind spots): what the plays added up to. One side's drives in one
 * game: points, how they ended, three-and-outs, red-zone trips and where they started.
 */
function driveLine(label, d) {
  if (!d || d.drives == null) return null;
  if (!d.drives) return `    ${label}: no drives recorded`;
  const ends = [d.drive_tds ? plural(d.drive_tds, 'touchdown') : null, d.drive_fgs ? plural(d.drive_fgs, 'field goal') : null,
    d.drive_missed_fgs ? plural(d.drive_missed_fgs, 'missed field goal') : null, d.drive_punts ? plural(d.drive_punts, 'punt') : null,
    d.drive_turnovers ? plural(d.drive_turnovers, 'turnover') : null, d.drive_downs ? `${d.drive_downs} on downs` : null].filter(Boolean);
  const rz = d.red_zone_trips ? `red zone ${d.red_zone_tds} touchdown${d.red_zone_tds === 1 ? '' : 's'} on ${plural(d.red_zone_trips, 'trip')}` : 'no red-zone trips';
  return `    ${label}: ${d.drives} for ${d.drive_points} points (${(d.drive_points / d.drives).toFixed(2)} a drive) · ${ends.join(', ')}`
    + ` · ${plural(d.three_and_outs, 'three-and-out')} · ${rz} · average start ${fieldSpot(d.avg_drive_start)}`;
}

/** Every club's season drives and per-play numbers from the ledger's game lines, for ranks and the schedule faced. */
function leagueTable(ledger) {
  const games = (ledger.games || []).filter((g) => g.season_type === 'REG');
  const teams = new Map();
  const blank = () => ({ drives: 0, points: 0, rzTrips: 0, rzTds: 0, startSum: 0, startN: 0, dDrives: 0, dPoints: 0,
    offEpa: 0, offPlays: 0, defEpa: 0, defPlays: 0, games: [] });
  for (const g of games) {
    const codes = Object.keys(g.lines || {});
    for (const code of codes) {
      const own = g.lines[code];
      const opp = g.lines[codes.find((c) => c !== code)] || null;
      if (!teams.has(code)) teams.set(code, blank());
      const t = teams.get(code);
      t.drives += own.drives || 0; t.points += own.drive_points || 0;
      t.rzTrips += own.red_zone_trips || 0; t.rzTds += own.red_zone_tds || 0;
      if (own.avg_drive_start != null && own.drives) { t.startSum += own.avg_drive_start * own.drives; t.startN += own.drives; }
      t.dDrives += opp?.drives || 0; t.dPoints += opp?.drive_points || 0;
      if (own.offense_plays && own.offense_epa_per_play != null) { t.offEpa += own.offense_epa_per_play * own.offense_plays; t.offPlays += own.offense_plays; }
      if (own.defense_plays && own.defense_epa_per_play_allowed != null) { t.defEpa += own.defense_epa_per_play_allowed * own.defense_plays; t.defPlays += own.defense_plays; }
      t.games.push({ gameId: g.game_id, opp: codes.find((c) => c !== code), own });
    }
  }
  // An opponent's season EPA without its game against this club: the schedule a unit faced, not itself.
  const without = (code, gameId, side) => {
    const t = teams.get(code);
    if (!t) return null;
    let sum = 0, n = 0;
    for (const g of t.games) {
      if (g.gameId === gameId) continue;
      const plays = side === 'offense' ? g.own.offense_plays : g.own.defense_plays;
      const epa = side === 'offense' ? g.own.offense_epa_per_play : g.own.defense_epa_per_play_allowed;
      if (plays && epa != null) { sum += epa * plays; n += plays; }
    }
    return n ? sum / n : null;
  };
  const rows = [...teams].map(([code, t]) => {
    const faced = (side) => {
      const vals = t.games.map((g) => without(g.opp, g.gameId, side)).filter((v) => v != null);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };
    return { code, ppd: t.drives ? t.points / t.drives : null, dppd: t.dDrives ? t.dPoints / t.dDrives : null,
      rz: t.rzTrips ? t.rzTds / t.rzTrips : null, rzTrips: t.rzTrips, rzTds: t.rzTds, start: t.startN ? t.startSum / t.startN : null,
      drives: t.drives, dDrives: t.dDrives, 
      // What each unit faced (audit, Oct 13 2026: the two were printed under each other's labels and ranked
      // backwards, so Denver's toughest schedule read as the easiest). oppDefAllow: the defenses this offense
      // faced, EPA they allow (lower is tougher). oppOffGain: the offenses this defense faced (higher is tougher).
      oppDefAllow: faced('defense'), oppOffGain: faced('offense') };
  });
  const rankBy = (key, highFirst) => {
    const sorted = rows.filter((r) => r[key] != null).sort((a, b) => (highFirst ? b[key] - a[key] : a[key] - b[key]));
    return (code) => { const i = sorted.findIndex((r) => r.code === code); return i < 0 ? null : i + 1; };
  };
  const all = games.flatMap((g) => Object.values(g.lines || {}));
  const plays = all.reduce((n, l) => n + (l.offense_plays || 0), 0);
  const leagueEpa = plays ? all.reduce((n, l) => n + (l.offense_epa_per_play ?? 0) * (l.offense_plays || 0), 0) / plays : null;
  return { rows: new Map(rows.map((r) => [r.code, r])), clubs: rows.length, leagueEpa,
    rank: { ppd: rankBy('ppd', true), dppd: rankBy('dppd', false), rz: rankBy('rz', true), start: rankBy('start', true),
      // Toughest first: the defenses that allow the least, the offenses that gain the most.
      oppDefAllow: rankBy('oppDefAllow', false), oppOffGain: rankBy('oppOffGain', true) } };
}

/** The season's drives and the schedule each unit has faced, with each figure's place among the clubs. */
function seasonHead(code, table) {
  const r = table.rows.get(code);
  if (!r) return [];
  const of = `of ${table.clubs}`;
  const lines = [];
  if (r.drives) {
    lines.push(`  season drives: offense ${(r.ppd).toFixed(2)} points a drive over ${r.drives} drives (${ordinalOf(table.rank.ppd(code))} ${of})`
      + ` · defense allows ${r.dppd == null ? "—" : r.dppd.toFixed(2)} over ${r.dDrives} (${ordinalOf(table.rank.dppd(code))} ${of})`
      + ` · red zone ${r.rzTds} touchdowns on ${r.rzTrips} trips${r.rz != null ? ` (${ordinalOf(table.rank.rz(code))} ${of})` : ''}`
      + ` · average start ${fieldSpot(r.start)} (${ordinalOf(table.rank.start(code))} ${of})`);
  }
  if (r.oppDefAllow != null || r.oppOffGain != null) {
    const league = table.leagueEpa != null ? `; league average ${signed(table.leagueEpa)}` : '';
    lines.push(`  schedule so far (each opponent's season without its game against this team${league}):`
      + (r.oppDefAllow != null ? ` the defenses this offense faced allow ${signed(r.oppDefAllow)} EPA per play (${ordinalOf(table.rank.oppDefAllow(code))} toughest ${of})` : '')
      + (r.oppOffGain != null ? ` · the offenses this defense faced gain ${signed(r.oppOffGain)} (${ordinalOf(table.rank.oppOffGain(code))} toughest ${of})` : ''));
  }
  return lines;
}

/** "outdoors, 62°F, wind 9 mph, rain" from the game's row in the play-by-play. */
function settingPhrase(game) {
  if (!game?.roof) return null;
  // nflverse records the open-air Melbourne Cricket Ground as a dome; the stadium table wins where it says outdoors.
  const known = Object.values(NFL_STADIUMS).find((v) => v.name === game.stadium);
  if (game.roof === 'dome' && known?.roof === 'outdoors') game = { ...game, roof: 'outdoors' };
  const roof = { dome: 'indoors', closed: 'roof closed', open: 'roof open', outdoors: 'outdoors' }[game.roof] || game.roof;
  if (game.roof === 'dome' || game.roof === 'closed') return roof;
  const bits = [roof, game.temp != null ? `${game.temp}°F` : null, game.wind != null ? `wind ${game.wind} mph` : null,
    game.conditions ? game.conditions.toLowerCase() : null].filter(Boolean);
  return bits.join(', ');
}

/**
 * WHO WAS MISSING (founder GO, Oct 12 2026, the NFL blind spots): a club's regulars who did not play a game, or
 * left it early, from nflverse's snap counts. A regular took at least 60% of his unit's snaps in at least half of
 * the club's other games; "left early or was limited" is under 40% that day. Past participation only; why he was
 * missing is not in the snap counts.
 */
function missingRegulars(rows, week) {
  if (!rows?.length) return null;
  const weeks = [...new Set(rows.map((r) => r.week))];
  if (!weeks.includes(week)) return null;
  const others = weeks.filter((w) => w !== week);
  if (!others.length) return [];
  const share = (r) => Math.max(r.offense_pct || 0, r.defense_pct || 0);
  const byPlayer = new Map();
  for (const r of rows) {
    if (!byPlayer.has(r.player)) byPlayer.set(r.player, { position: r.position, weeks: new Map() });
    byPlayer.get(r.player).weeks.set(r.week, share(r));
  }
  const out = [];
  for (const [player, p] of byPlayer) {
    const regular = others.filter((w) => (p.weeks.get(w) || 0) >= 60);
    if (regular.length < Math.max(1, Math.ceil(others.length / 2))) continue;
    const usual = Math.round(regular.reduce((n, w) => n + p.weeks.get(w), 0) / regular.length);
    const that = p.weeks.get(week);
    if (that == null) out.push({ player, position: p.position, usual, note: 'did not play' });
    else if (that === 0) out.push({ player, position: p.position, usual, note: 'did not play' });
    else if (that < 40) out.push({ player, position: p.position, usual, note: `played ${that}% of snaps` });
  }
  // One quarterback plays. A quarterback who sat while another regular quarterback took the snaps was not
  // missing; the job was being done by its other holder (Oct 12 2026 dry run: Seattle's Drew Lock, who started
  // Weeks 1-2 while Sam Darnold was out, read as a missing regular in every game after Darnold came back).
  const isRegular = (p) => {
    const rest = weeks.filter((w) => w !== week);
    return rest.filter((w) => (p.weeks.get(w) || 0) >= 60).length >= Math.max(1, Math.ceil(rest.length / 2));
  };
  const qbOnField = [...byPlayer.values()].some((p) => p.position === 'QB' && (p.weeks.get(week) || 0) >= 60 && isRegular(p));
  return out.filter((m) => !(m.position === 'QB' && qbOnField && m.note === 'did not play'))
    .sort((a, b) => b.usual - a.usual).slice(0, 6);
}

function missingPhrase(name, list) {
  if (list == null) return `${name}: snap counts not available for this game`;
  if (!list.length) return `${name}: every regular played`;
  return `${name}: ${list.map((m) => `${m.position} ${m.player} (${m.note}; usually ${m.usual}%)`).join(', ')}`;
}

/**
 * One team's regular-season games, newest first, each unit on its own line.
 * Each opponent arrives with what it allows and scores per game this season
 * and its rank among the 32 (founder GO, Oct 12 2026): a unit's game against
 * the 3rd defense and one against the 30th read the same without it.
 */
function gameLines(team, code, ledger, results, league = null, extra = {}) {
  const { table = null, schedule = null, snaps = new Map() } = extra;
  const games = (ledger.games || []).filter((g) => g.season_type === 'REG' && g.lines?.[code]).sort((a, b) => b.week - a.week);
  if (!games.length) return [`${team}: no ${ledger.season} regular-season games in the play-by-play source yet.`];
  const byWeek = new Map((results || []).map((r) => [Number(r.week), r]));
  const lines = [`${team}`, ...(table ? seasonHead(code, table) : [])];
  const byId = new Map((schedule?.rows || []).map((r) => [r.game_id, r]));
  for (const [index, game] of games.entries()) {
    const result = byWeek.get(Number(game.week));
    const season = result ? opponentSeasonClause(league, result.opponentId) : null;
    // The final score sits beside the stats it came from (founder GO, Oct 12 2026: "Fix all those gaps"), so a
    // game lost on turnovers while winning the yards reads on one line. THE SITUATION keeps its halftime story.
    const score = result && result.scored != null && result.allowed != null
      ? ` · ${result.scored > result.allowed ? 'W' : result.scored < result.allowed ? 'L' : 'T'} ${result.scored}-${result.allowed}`
      : '';
    const head = result
      ? `${day(result.date)} · ${result.home || byId.get(game.game_id)?.location === 'Neutral' ? 'vs' : '@'} ${result.opponent}${byId.get(game.game_id)?.location === 'Neutral' ? ' (neutral site)' : ''}${score}${season ? ` · opponent ${season}` : ''}`
      : `vs ${game.game_id.split('_').slice(2).filter((c) => c !== code).join('')}`;
    const own = game.lines[code];
    const oppCode = Object.keys(game.lines).find((c) => c !== code) || null;
    const opp = oppCode ? game.lines[oppCode] : null;
    const oppName = result ? nickname(result.opponent) : (oppCode || 'opponent');
    // Both quarterbacks (founder GO, Oct 12 2026): a defense's day against a backup reads as that.
    const qbOf = (c) => {
      const qb = c ? game.starters?.[c] : null;
      if (!qb) return null;
      // A starter who left early reads as that: "S.Darnold started (10% of the pass plays), then D.Lock (89%)".
      if (qb.started) return `${qb.started} started (${Math.round((qb.startedShare || 0) * 100)}% of the pass plays), then ${qb.name} (${Math.round(qb.share * 100)}%)`;
      return `${qb.name}${qb.share < 0.9 ? ` (${Math.round(qb.share * 100)}% of the pass plays)` : ''}`;
    };
    const quarterbacks = qbOf(code) || qbOf(oppCode) ? ` · QB ${qbOf(code) || 'not recorded'} vs ${qbOf(oppCode) || 'not recorded'}` : '';
    // Rest, the trip and the setting (founder GO, Oct 12 2026): a short week, three time zones, a game in the wind.
    const facts = sideFacts(byId.get(game.game_id), code);
    const setting = [settingPhrase(game), facts ? restPhrase(facts.rest) : null, facts ? (tripPhrase(facts) || (facts.atHome ? 'at home' : null)) : null]
      .filter(Boolean).join(' · ');
    // FULL DETAIL FOR THE FOUR MOST RECENT GAMES (founder GO, Oct 13 2026: "your plan is good"): every older game
    // is one line, so the section stays near 19,000 characters at Week 17 instead of about 48,000. The season
    // drives and the schedule faced above still count every game.
    if (index >= FULL_DETAIL_GAMES) {
      const giveaways = own?.offense_giveaways ?? 0;
      const takeaways = own?.defense_takeaways ?? 0;
      lines.push(`  Wk ${game.week} · ${head}${quarterbacks} · offense ${signed(own?.offense_epa_per_play ?? null)} EPA per play, ${plural(giveaways, 'giveaway')}`
        + ` · defense ${signed(own?.defense_epa_per_play_allowed ?? null)} EPA per play allowed, ${plural(takeaways, 'takeaway')}`);
      continue;
    }
    const ownMissing = snaps.has(code) ? missingRegulars(snaps.get(code), game.week) : null;
    const oppMissing = oppCode && snaps.has(oppCode) ? missingRegulars(snaps.get(oppCode), game.week) : null;
    lines.push(
      `  Wk ${game.week} · ${head}${quarterbacks}`,
      ...(setting ? [`    setting: ${setting}`] : []),
      unitLine('offense', own, 'offense'),
      unitLine('defense', own, 'defense', opp, oppName),
      ...[driveLine('drives', own), driveLine(`drives faced`, opp), scriptLine(own, opp, oppName), specialTeamsLine(own, opp), penaltyLine(own, opp, oppName),
        `    regulars missing: ${missingPhrase(nickname(team), ownMissing)} · ${missingPhrase(oppName, oppMissing)}`].filter(Boolean),
    );
  }
  return lines;
}


/** "Wk1 82%, Wk2 78%, Wk3 —" across every week the team has played. */
function weekShares(rows, weeks, side) {
  // A week with a snap row but no snaps on this side was a special-teams-only week, not a missed game (audit, Oct
  // 13 2026: the injury report said he played while this table said he did not).
  const byWeek = new Map(rows.map((r) => [r.week, r]));
  return weeks.map((week) => {
    const row = byWeek.get(week);
    if (!row) return `Wk${week} did not play`;
    // Snaps only on the other side of the ball are 0% here, not special teams (round 2 audit, Oct 13 2026).
    const other = side === 'offense' ? 'defense' : 'offense';
    return `Wk${week} ${row[`${side}_pct`] ? `${row[`${side}_pct`]}%` : row[`${other}_pct`] ? '0%' : 'special teams only'}`;
  }).join(', ');
}

/**
 * Match the injury report's names to the snap data's. The two sources spell
 * first names differently ("Sam Cosmi" on the report, "Samuel Cosmi" in the
 * snap counts), so a full-name miss falls back to surname plus first initial,
 * and only when that is one player on this team.
 */
function reportLookup(injuries, players, aliasesOf = () => []) {
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
  // The loose match also needs the first names to agree as a short form (Sam / Samuel): the initial alone gave a
  // linebacker James Williams' snaps to cornerback Joshua Williams, on IR all season (round 2 audit, Oct 13 2026).
  // A player the rule cannot place gets no note rather than another player's.
  const firstOf = (value) => nameKey(String(value || '').trim().split(/\s+/)[0]);
  const shortForm = (a, b) => !!a && !!b && (a.startsWith(b) || b.startsWith(a));
  return (player) => {
    // The snap file's name, then the weekly roster's names for the same player (Oct 29 2026 hunt: "Michael Hall" in the
    // snaps is "Mike Hall Jr." on the report, "Patrick" and "Pat Surtain II").
    for (const name of [player, ...aliasesOf(player)]) { const exact = full.get(nameKey(name)); if (exact) return exact; }
    if (snapLoose.get(surnameKey(player)) !== 1) return null;
    const row = loose.get(surnameKey(player));
    return row && shortForm(firstOf(player), firstOf(named(row))) ? row : null;
  };
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
  // A player is listed with his own unit; a safety's one snap on offense does not put him under OFFENSE (round 2
  // audit, Oct 13 2026). A real two-way player (10% or more on the other side in some week) is listed under both.
  const total = (rows, side) => rows.reduce((sum, r) => sum + (r[`${side}_pct`] || 0), 0);
  const listedOn = (rows, side) => peak(rows, side) > 0
    && ((total(rows, side) >= total(rows, side === 'offense' ? 'defense' : 'offense')) || peak(rows, side) >= 10);
  const lines = [`${team}`];
  // EVERY PLAYER WHO TOOK A SNAP, WEEK BY WEEK (founder, Oct 5 2026: everything once, nothing cut). This used to
  // list only the injured players and a few position mates, while the measured evidence printed last week's
  // shares for the regulars: two partial copies of one table. Now it is the one table.
  for (const side of ['offense', 'defense']) {
    const played = [...byPlayer].filter(([, rows]) => listedOn(rows, side));
    if (!played.length) continue;
    lines.push(`  ${side.toUpperCase()}`);
    const groups = new Map();
    for (const [player, rows] of played) {
      const group = groupOf(rows[0].position) || rows[0].position || 'other';
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push([player, rows]);
    }
    for (const [group, players] of groups) {
      lines.push(`    ${group}`);
      for (const [player, rows] of players.sort((a, b) => peak(b[1], side) - peak(a[1], side))) {
        lines.push(`      ${player} ${rows[0].position} · ${weekShares(rows, weeks, side)}`);
      }
    }
  }
  return lines;
}

/**
 * DID HE PLAY THE TEAM'S LAST GAMES (founder GO, Oct 4 2026). The injury row's tag was the age of the latest
 * report, and the NFL re-lists every injured player every week: Caleb Williams read "FRESH — Reported Oct 2
 * (2d)" on the day he missed his second straight game, and Gary wrote that the line had not caught up with
 * it. The row now says what the snap counts say: the team's most recent games he did not play, and the last
 * one he did. A fact about playing, not about why: a healthy backup who did not get on the field reads the
 * same way. A player the snap data cannot place gets no note, and so does a whole team whose snap data
 * trails its latest final (the count would be a game short).
 * Sets `participation` on each placed injury: { missed, missedWeeks, lastPlayedWeek, lastShare }.
 */
export async function attachNflParticipation({ homeTeam, awayTeam, home, away, season, injuries = {} }) {
  for (const [team, bdl, list] of [[homeTeam, home, injuries.home], [awayTeam, away, injuries.away]]) {
    if (!list?.length || !bdl?.id) continue;
    const [snaps, results] = await Promise.all([
      getSnapWeeks(team, season).catch(warnAs('snap counts', null)),
      loadTeamResults(SPORT, bdl.id, season).catch(warnAs('team results', null)),
    ]);
    if (!snaps?.rows?.length || !results?.length) continue;
    const weeks = [...new Set(snaps.rows.map((r) => r.week))].sort((a, b) => a - b);
    const finals = results.map((r) => Number(r.week)).filter((w) => Number.isFinite(w) && w > 0);
    if (!finals.length || Math.max(...finals) > weeks.at(-1)) continue;
    // A week counts as played on any snap, with that week's share: offense or defense, or special teams named as such
    // (Oct 23 2026 data audit: Doubs' 3%, hurt early, read the same as a full game; Oct 29 2026 hunt: a special-teams
    // week was left out, so the Panthers' kicker read "did not play the last 5 games" in games he kicked in). A kicker,
    // punter or long snapper's share is of the special-teams snaps.
    const byPlayer = new Map();
    for (const row of snaps.rows) {
      const share = Math.max(Number(row.offense_pct) || 0, Number(row.defense_pct) || 0), st = Number(row.st_pct) || 0;
      if (!(share > 0) && !(st > 0)) continue;
      const kick = /^(K|P|LS)$/i.test(String(row.position || ''));
      if (!byPlayer.has(row.player)) byPlayer.set(row.player, new Map());
      byPlayer.get(row.player).set(row.week, kick ? { st, kick } : share > 0 ? { share } : { st });
    }
    const textOf = (x) => (x.kick ? `${x.st}% of special-teams snaps` : x.share != null ? `${x.share}% of snaps` : `special teams only, ${x.st}% of special-teams snaps`);
    const code0 = nflverseCode(team);
    const rosterRows = (await loadNflverseFile('roster_weekly', season).catch(() => null))?.rows || [];
    const pfrOf = new Map(snaps.rows.filter((r) => r.pfr).map((r) => [r.player, r.pfr]));
    const namesOf = new Map();
    for (const r of rosterRows) {
      if (r.team !== code0 || !r.pfr_id) continue;
      const set = namesOf.get(r.pfr_id) || new Set();
      for (const nm of [r.full_name, `${r.first_name || ''} ${r.last_name || ''}`, r.football_name ? `${r.football_name} ${r.last_name || ''}` : null]) if (nm && nm.trim()) set.add(nm.trim());
      namesOf.set(r.pfr_id, set);
    }
    // The report's league id first (Oct 29 2026 hunt, round 7: the feed's "JuJu Brents" is the report's and the snap
    // file's Julius Brents, and lost his "played in the last game" tag), then the names.
    const pfrByGsis = new Map(rosterRows.filter((r) => r.gsis_id && r.pfr_id).map((r) => [r.gsis_id, r.pfr_id]));
    const byId = new Map(list.filter((i) => i.gsis_id && pfrByGsis.has(i.gsis_id)).map((i) => [pfrByGsis.get(i.gsis_id), i]));
    const byNames = reportLookup(list, [...byPlayer.keys()], (player) => [...(namesOf.get(pfrOf.get(player)) || [])]);
    const reported = (player) => byId.get(pfrOf.get(player)) || byNames(player);
    for (const [player, shares] of byPlayer) {
      const injury = reported(player);
      if (!injury) continue;
      const missedWeeks = [];
      for (let i = weeks.length - 1; i >= 0 && !shares.has(weeks[i]); i--) missedWeeks.unshift(weeks[i]);
      const lastPlayedWeek = Math.max(...shares.keys());
      const last = shares.get(lastPlayedWeek);
      // The games before his last one, newest first (Oct 26 2026 blind review: Kobie Turner read "32% of snaps" from the
      // game he was hurt in, after 59-79% in every game before it, and the read took him for a rotation player).
      // Every team game before it with its week, a game he missed said so and why from the weekly roster (round 8: A.J.
      // Terrell's "9%, 93%" hid four weeks on IR between them).
      // By the report's league id, then PFR id, then his name on this club's roster: linemen carry no PFR id (round 9:
      // Landon Dickerson's five weeks on IR read "did not play"). A week on another club's roster says which.
      const nk = (x) => String(x || '').toLowerCase().replace(/[^a-z]/g, '');
      const statusAt = (w) => { const r = rosterRows.find((x) => Number(x.week) === w && ((injury.gsis_id && x.gsis_id === injury.gsis_id) || (x.pfr_id && x.pfr_id === pfrOf.get(player)) || (x.team === code0 && nk(x.full_name) === nk(player))));
        const word = !r ? null : r.status === 'INA' ? 'inactive' : r.status === 'RES' ? (/^R(?:01|48)$/.test(String(r.status_description_abbr || '')) ? 'IR' : 'reserve')
          : r.status === 'EXE' ? "commissioner's exempt list" : r.status === 'DEV' ? 'practice squad'
            : r.status === 'CUT' ? 'released' : r.status === 'RET' ? 'retired' : /^TR/.test(String(r.status)) ? 'traded' : null;
        return r && r.team !== code0 ? `with ${r.team}${word ? `, ${word}` : ''}` : word; };
      const earlier = weeks.filter((w) => w < lastPlayedWeek).sort((a, b) => b - a).slice(0, 5)
        .map((w) => { const x = shares.get(w); return `Wk ${w} ${!x ? (statusAt(w) || 'did not play') : x.kick ? `${x.st}%` : x.share != null ? `${x.share}%` : 'special teams only'}`; });
      injury.participation = { missed: missedWeeks.length, missedWeeks, lastPlayedWeek, lastShare: last.share ?? null, lastText: textOf(last), earlier };
    }
    // A listed player with no offensive or defensive snap all season says so (Oct 23 2026 data audit: Kansas City's 4-0
    // was all without Josh Simmons and his row carried no tag). Decided only on an exact name match in this team's
    // weekly roster, whose PFR id then has no snap row; a name that does not match is left untagged.
    const [roster, snapFile] = await Promise.all([loadNflverseFile('roster_weekly', season).catch(() => null), loadNflverseFile('snap_counts', season).catch(() => null)]);
    const code = nflverseCode(team);
    if (roster?.rows && snapFile?.rows && code) {
      // Special-teams snaps count as playing here: kickers, punters and coverage players have no other kind (Oct 23
      // 2026 audit: they read "has not played this season").
      const played = new Set(snapFile.rows.filter((r) => r.team === code && (Number(r.offense_pct) > 0 || Number(r.defense_pct) > 0 || Number(r.st_pct) > 0)).map((r) => r.pfr_player_id));
      const named = (i) => i.name || `${i.player?.first_name || ''} ${i.player?.last_name || ''}`.trim();
      for (const injury of list) {
        if (injury.participation) continue;
        const rows = roster.rows.filter((r) => r.team === code && nameKey(r.full_name) === nameKey(named(injury)));
        if (!rows.length) continue;
        const ids = new Set(rows.map((r) => r.pfr_id).filter(Boolean));
        // Inactive or on reserve in every week the team has played is the roster's own record of not playing; with a
        // PFR id, no snap row at all says the same.
        const statusOf = (w) => rows.find((r) => Number(r.week) === w)?.status;
        const sidelined = finals.every((w) => /^(INA|RES)$/i.test(statusOf(w) || ''));
        const noSnaps = ids.size === 1 && !played.has([...ids][0]);
        if ((!sidelined && !noSnaps) || (ids.size === 1 && played.has([...ids][0]))) continue;
        injury.participation = { neverPlayed: true, reserveAll: finals.every((w) => /^RES$/i.test(statusOf(w) || '')) };
      }
    }
  }
}

/**
 * @returns {Promise<string>} the two desk sections, or a line naming what could not be read.
 */
export async function nflGameByGameSections({ homeTeam, awayTeam, home, away, season, injuries = {} }) {
  const [ledger, homeResults, awayResults, homeSnaps, awaySnaps, league] = await Promise.all([
    getPlayLedger(season).catch((e) => ({ unavailable: true, reason: e.message })),
    home?.id ? loadTeamResults(SPORT, home.id, season).catch(warnAs('home results', [])) : [],
    away?.id ? loadTeamResults(SPORT, away.id, season).catch(warnAs('away results', [])) : [],
    getSnapWeeks(homeTeam, season).catch((e) => ({ unavailable: true, reason: e.message })),
    getSnapWeeks(awayTeam, season).catch((e) => ({ unavailable: true, reason: e.message })),
    loadLeagueContext(SPORT, season).catch(warnAs('league context (opponent ranks)', null)),
  ]);
  const extra = { table: null, schedule: null, snaps: new Map() };
  if (!ledger?.unavailable) {
    extra.table = leagueTable(ledger);
    const codes = [nflverseCode(awayTeam), nflverseCode(homeTeam)].filter(Boolean);
    const wanted = new Set(codes);
    for (const g of ledger.games || []) {
      if (g.season_type !== 'REG') continue;
      const inGame = Object.keys(g.lines || {});
      if (inGame.some((c) => wanted.has(c))) inGame.forEach((c) => codes.includes(c) || codes.push(c));
    }
    const [schedule, ...snapLists] = await Promise.all([
      getNflSchedule().catch(warnAs('schedule', null)),
      ...codes.map((c) => (teamNameOf(c) ? getSnapWeeks(teamNameOf(c), season).catch(warnAs('opponent snap counts', null)) : null)),
    ]);
    extra.schedule = schedule?.unavailable ? null : schedule;
    codes.forEach((c, i) => { if (snapLists[i]?.rows) extra.snaps.set(c, snapLists[i].rows); });
  }
  const games = ledger?.unavailable
    ? [`Play-by-play is unavailable for ${season} (${ledger.reason}), so the game-by-game lines could not be built.`]
    : [...gameLines(awayTeam, nflverseCode(awayTeam), ledger, awayResults, league, extra), '', ...gameLines(homeTeam, nflverseCode(homeTeam), ledger, homeResults, league, extra)];
  return `EACH UNIT, GAME BY GAME — ${season} REGULAR SEASON
${RULE}
Every game this season, newest first. The four most recent games carry every
line below; each older game is one line (opponent, score, quarterbacks, both
units' EPA per play, giveaways and takeaways). Beside
each opponent, the final score, and what that opponent allows and scores per
game this season and where that ranks among the 32 teams. A pass play is a
dropback, sacks and their yards included. The quarterback named is the one
with the most pass plays in that game; when someone else started, the line
says who started and who took over. Giveaways and takeaways show how they
happened: interceptions, fumbles and how many were lost, and any returned for
a touchdown. Game script counts the snaps taken while the game was still a
contest, meaning the offense's win probability before the snap (nflverse's
model) was between 5% and 95%. Special teams covers kicking, blocks, returns
of 40 yards or more, fumbles on kicks and returns, onside recoveries,
special-teams touchdowns and safeties. Penalties are the accepted ones.
Above each team's games: its season drives with each figure's rank, and the
schedule its offense and defense have faced (each opponent's season EPA
without its game against this team). On each game: both quarterbacks, the
setting (roof, kickoff temperature, wind and conditions as recorded), the
team's rest and trip, its drives and the drives it faced (drives that ended a
half are left out), and the regulars missing on each side: a regular took
60% or more of his unit's snaps in at least half of the team's other games;
"did not play" or a snap share under 40% that day.

${games.join('\n')}
${RULE}

WHO PLAYED THE SNAPS, WEEK BY WEEK
${RULE}
Every player who took an offensive or defensive snap this season, by position,
with his share of the unit's snaps each week (injury status is in the injury
report). Past participation only; this is not a lineup declaration.

${[...snapLines(awayTeam, awaySnaps, injuries.away), '', ...snapLines(homeTeam, homeSnaps, injuries.home)].join('\n')}
${RULE}
`;
}
