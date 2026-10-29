/**
 * THE NBA GAME RECORD (Oct 27 2026, the game-by-game system; founder: "all they do is play games ... and then people
 * record everything that happened in those games"). One finished game, both teams, written up once and checked:
 *   - the setting: each team's days off, back-to-backs, games in four nights, where it came from, the miles and time
 *     zones between arenas, altitude;
 *   - who was there: the league's injury report at tip for both teams, the starters, who dressed and did not play;
 *   - every player's line (minutes, points, rebounds, assists, steals, blocks, turnovers, fouls, shooting, plus-minus)
 *     and his minutes and points in each quarter;
 *   - each team's box, where its points came from (paint, second chance, fast break, off turnovers, bench) and its
 *     possessions;
 *   - how it went: the score by quarter, the largest lead each way, lead changes, ties, each team's biggest run, the
 *     score after three quarters and with five minutes left.
 * What happened across games (who had played before, who was listed after) is read from the store when a game is
 * shown, not written into it. Facts only; what they mean is Gary's read. Sources: BDL games, box scores, stats by
 * period, lineups, play-by-play and the v2 advanced box; the NBA's official injury report.
 */
import { BALLDONTLIE_API_BASE_URL, bdlHttp, API_KEY } from '../../providers/bdl/transport.js';
import { ballDontLieService } from '../../providers/ballDontLieService.js';
import { latestOfficialReport, gameListing } from '../../providers/nbaOfficialInjuryReport.js';
import { milesBetween, utcOffsetHours, placeOf } from './nbaArenas.js';
import { espnVenue, espnTeamBox, espnPlayerLines, officialLineFor } from './espnNbaGame.js';

export const NBA_RECORD_VERSION = 18;

const get = async (path) => (await bdlHttp.get(`${BALLDONTLIE_API_BASE_URL}${path}`, { headers: { Authorization: API_KEY } })).data;
// "32:00", "6" or "33:26" to minutes with one decimal.
// To the hundredth, so the whole minutes shown round once (38:28 was kept as 38.5 and shown as 39).
const minutesOf = (m) => { const [a, b] = String(m ?? '0').split(':'); return Math.round(((Number(a) || 0) + (Number(b) || 0) / 60) * 100) / 100; };
const dayNum = (ymd) => Math.round(Date.parse(`${String(ymd).slice(0, 10)}T12:00:00Z`) / 86_400_000);
const clockSeconds = (c) => { const s = String(c ?? '0'); if (s.includes(':')) { const [m, sec] = s.split(':'); return Number(m) * 60 + Number(sec); } return Number(s) || 0; };
const reportDate = (tip) => new Date(tip).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit', year: 'numeric' });
const teamOf = (t) => ({ id: t.id, abbr: t.abbreviation, name: t.full_name, short: t.name });
const STATS = ['pts', 'oreb', 'dreb', 'reb', 'ast', 'stl', 'blk', 'turnover', 'pf', 'fgm', 'fga', 'fg3m', 'fg3a', 'ftm', 'fta'];
const sum = (rows, k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);

// Where a game was played comes from ESPN (espnNbaGame.js): the schedule feed has no venue.
export const venueOf = espnVenue;

/** Each team's days off, games in four nights, and the trip from where its last game was played (null before its first
 * game). The miles and time zones are "not on file" when either venue is. */
export async function settingOf(g, team, teamGames) {
  const tip = Date.parse(g.datetime || `${g.date}T23:00:00Z`);
  const prior = teamGames.filter((x) => x.id !== g.id && !x.postseason === !g.postseason && Date.parse(x.datetime || `${x.date}T23:00:00Z`) < tip)
    .sort((a, b) => Date.parse(b.datetime || b.date) - Date.parse(a.datetime || a.date));
  const venue = await venueOf(g);
  const here = venue ? placeOf(venue.city) : null;
  const prev = prior[0];
  const out = { home: g.home_team.id === team.id, venue, arenaCity: venue?.city || null, altitudeFt: here?.altitudeFt || null,
    gamesInFourNights: 1 + prior.filter((x) => dayNum(g.date) - dayNum(x.date) <= 3).length, prev: null, daysOff: null };
  if (!prev) return out;
  const prevVenue = await venueOf(prev);
  const there = prevVenue ? placeOf(prevVenue.city) : null;
  const opp = prev.home_team.id === team.id ? prev.visitor_team : prev.home_team;
  out.prev = { date: prev.date, opponent: opp.full_name, home: prev.home_team.id === team.id, city: prevVenue?.city || null };
  out.daysOff = dayNum(g.date) - dayNum(prev.date) - 1;
  out.miles = here && there ? milesBetween(there, here) : null;
  out.tzShift = here && there ? utcOffsetHours(here.tz, tip) - utcOffsetHours(there.tz, Date.parse(prev.datetime || prev.date)) : null;
  return out;
}

// Technicals, flagrants and ejections, in order, from the play-by-play (Oct 27 2026 loop); defensive three-seconds and
// delay technicals are routine and left out.
const INCIDENT = /^(?:Technical Foul|Double Technical Foul|Flagrant Foul Type [12]|Flopping Technical|Ejection|Taunting Technical)$/i;
// The feed now and then carries a play twice (one double technical read as two at Atlanta on Oct 24), cuts a name off
// ("Double technical foul: Kenrich Williams and", in ESPN's feed too), or has a flagrant reviewed and called only as its
// free throws (Dallas at Miami, Oct 26); each said as such (Oct 29 2026 hunt). Only the double technical is a feed
// duplicate: one player's two technicals at one clock are two (Gordon's ejection at Denver, Oct 26), listed before the
// ejection. A technical with no name (a bench or coach technical) is put on the team the other side's technical free
// throw was shot against.
export function incidentsOf(plays, teamNames = {}) {
  const ordered = [...(plays || [])].sort((a, b) => a.period - b.period || clockSeconds(b.clock) - clockSeconds(a.clock)
    || (/^Ejection$/i.test(String(a.type || '')) - /^Ejection$/i.test(String(b.type || ''))) || a.order - b.order);
  const seen = new Set(), out = [];
  for (const p of ordered) {
    const at = `${p.period}|${p.clock}`;
    if (INCIDENT.test(String(p.type || ''))) {
      let text = String(p.text || p.type).trim();
      if (/^Double Technical/i.test(String(p.type || ''))) {
        if (seen.has(`${at}|${text}`)) continue;
        seen.add(`${at}|${text}`);
      }
      if (/^technical foul$/i.test(text)) {
        const ft = ordered.find((q) => `${q.period}|${q.clock}` === at && /^Free Throw - Technical/i.test(String(q.type || '')) && q.team?.id != null);
        const on = ft ? Object.entries(teamNames).find(([id]) => String(id) !== String(ft.team.id))?.[1] : null;
        text = on ? `Technical foul on the ${on} (player or coach not named)` : 'Technical foul (player and team not on file)';
      }
      out.push({ period: p.period, text: / and$/.test(text) ? `${text} (the second name not on file)` : text });
    } else if (/^Free Throw - Flagrant 1 of/i.test(String(p.type || '')) && !ordered.some((q) => `${q.period}|${q.clock}` === at && /^Flagrant Foul/i.test(String(q.type || '')))) {
      const fouled = String(p.text || '').replace(/\s+(?:makes|misses)\b.*$/i, '').trim();
      out.push({ period: p.period, text: `Flagrant foul against ${fouled || 'a player'} (the play-by-play has only the free throws)` });
    }
  }
  return out;
}

/** How the game went, from the play-by-play (home/away as the game has them). Null when the plays don't end at the final
 * (6 of the first 52 games: the feed's running score drifts, "130-105" in a 127-105 game), so a drifted play-by-play
 * never stands in for the game. The score after three comes from the official quarters instead. */
export function flowOf(plays, final) {
  // In clock order, and at one clock by the running score: the feed logs an and-one free throw before its layup, a
  // substitution carrying the score from before or after the basket, and a review from the 1st after the final horn.
  const ordered = [...(plays || [])].filter((p) => p.home_score != null && p.away_score != null)
    .sort((a, b) => a.period - b.period || clockSeconds(b.clock) - clockSeconds(a.clock) || (a.home_score + a.away_score) - (b.home_score + b.away_score) || a.order - b.order);
  const last = ordered[ordered.length - 1];
  if (!last || last.home_score !== final.home || last.away_score !== final.away) return null;
  const lead = { home: 0, away: 0 }; let changes = 0, ties = 0, leader = 0, prevDiff = 0, ph = 0, pa = 0, run = null;
  const best = { home: null, away: null };
  for (const p of ordered) {
    const dh = p.home_score - ph, da = p.away_score - pa;
    if (dh || da) {
      const scorer = dh > 0 && !da ? 'home' : da > 0 && !dh ? 'away' : null;
      if (scorer && run?.team === scorer) Object.assign(run, { pts: run.pts + dh + da, end: { home: p.home_score, away: p.away_score }, endPeriod: p.period });
      else run = scorer ? { team: scorer, pts: dh + da, start: { home: ph, away: pa }, end: { home: p.home_score, away: p.away_score }, startPeriod: p.period, endPeriod: p.period } : null;
      if (run && (!best[run.team] || run.pts > best[run.team].pts)) best[run.team] = { ...run, start: { ...run.start }, end: { ...run.end } };
      const diff = p.home_score - p.away_score;
      lead.home = Math.max(lead.home, diff); lead.away = Math.max(lead.away, -diff);
      if (diff === 0 && prevDiff !== 0) ties += 1;
      if (Math.sign(diff) && leader && Math.sign(diff) !== leader) changes += 1;
      if (Math.sign(diff)) leader = Math.sign(diff);
      prevDiff = diff; ph = p.home_score; pa = p.away_score;
    }
  }
  const scoreAt = (keep) => { const xs = ordered.filter(keep); const x = xs[xs.length - 1]; return x ? { home: x.home_score, away: x.away_score } : null; };
  return { largestLead: lead, leadChanges: changes, ties, biggestRun: best,
    fiveLeft: scoreAt((p) => p.period < 4 || (p.period === 4 && clockSeconds(p.clock) >= 300)) };
}

// WHO WAS ON THE FLOOR, QUARTER BY QUARTER (Oct 27 2026, founder: "there has to be a way to know who closed out a
// game"). The play-by-play names both players of every substitution (in, then out) but not the changes made between
// quarters, and a missed one early throws off every lineup after it (13 of 52 games failed a whole-game check), so each
// quarter is followed on its own: its first five are the players with minutes in it who were never subbed in or out of
// it (on the floor all of it), or who were subbed out of it before being subbed in; the substitutions then give each
// player's seconds on the floor and the five at its end. The box's minutes by quarter are whole minutes, cut down
// ("11" for 11:50), so a quarter followed this way must fall within each player's minute, or it is null.
export function followQuarter(plays, players, q) {
  const sideOf = new Map(players.map((p) => [p.id, p.side]));
  const minIn = new Map(players.map((p) => [p.id, p.quarters?.find((x) => x.q === q)?.min || 0]));
  // In clock order: the feed's own order sometimes isn't (a 3:52 substitution logged before one at 5:46).
  const inQ = [...(plays || [])].filter((p) => p.period === q).sort((a, b) => clockSeconds(b.clock) - clockSeconds(a.clock) || a.order - b.order);
  const length = q <= 4 ? 720 : 300;
  const all = inQ.filter((p) => p.type === 'Substitution').map((p) => ({ p, ids: (p.participants || []).filter((id) => sideOf.has(id)) })).filter((x) => x.ids.length === 2);
  // A substitution logged at the quarter's first second is a change made between quarters: the player coming in starts it.
  const atStart = all.filter((x) => clockSeconds(x.p.clock) >= length);
  const subs = all.filter((x) => clockSeconds(x.p.clock) < length);
  const subbed = new Set(subs.flatMap((x) => x.ids));
  const court = { home: new Set(), away: new Set() };
  for (const [id, m] of minIn) if (m > 0 && !subbed.has(id)) court[sideOf.get(id)].add(id);
  for (const { ids: [inId] } of atStart) if (minIn.get(inId) > 0 && !subbed.has(inId)) court[sideOf.get(inId)].add(inId);
  const entered = new Set();
  // Subbed out before being subbed in: on the floor at the start, even for under a minute (the box shows "0" for 0:48).
  for (const { ids: [inId, outId] } of subs) { if (!entered.has(outId)) court[sideOf.get(outId)].add(outId); entered.add(inId); }
  if (court.home.size !== 5 || court.away.size !== 5) return null;
  const secs = new Map(); let clock = length;
  const credit = (to) => { for (const side of ['home', 'away']) for (const id of court[side]) secs.set(id, (secs.get(id) || 0) + (clock - to)); clock = to; };
  for (const { p, ids: [inId, outId] } of subs) {
    const side = sideOf.get(outId);
    if (!court[side].has(outId) || sideOf.get(inId) !== side) return null;
    credit(Math.min(clock, clockSeconds(p.clock)));
    court[side].delete(outId); court[side].add(inId);
  }
  credit(0);
  // The box's whole minutes are cut down, so a player's time worked out here must fall within the minute it names.
  if ([...minIn].some(([id, m]) => { const t = (secs.get(id) || 0) / 60; return t < m - 0.02 || t > m + 1.02; })) return null;
  return { court: { home: [...court.home], away: [...court.away] }, secs };
}

/** The five on the floor for each side at the final horn, by name, or null when the last quarter can't be followed. */
export function closingOf(plays, players, periods) {
  const t = followQuarter(plays, players, periods[periods.length - 1]);
  const nameOf = new Map(players.map((p) => [p.id, p.name]));
  return t ? { home: t.court.home.map((id) => nameOf.get(id)), away: t.court.away.map((id) => nameOf.get(id)) } : null;
}

/** When each player who played last left the floor: { name: { period, clock } }, the clock of his last substitution out
 * when he was not subbed back in, or the end of the last quarter he played in. */
export function lastOffOf(plays, players, periods) {
  const out = {};
  const ordered = [...(plays || [])].filter((p) => p.type === 'Substitution').sort((a, b) => a.period - b.period || clockSeconds(b.clock) - clockSeconds(a.clock) || a.order - b.order);
  for (const pl of players.filter((x) => x.min > 0 && x.quarters)) {
    const lastQ = [...pl.quarters].reverse().find((x) => x.min > 0)?.q;
    if (!lastQ) continue;
    const mine = ordered.filter((p) => p.period === lastQ && (p.participants || []).includes(pl.id));
    const last = mine[mine.length - 1];
    out[pl.name] = last && last.participants?.[1] === pl.id ? { period: lastQ, clock: last.clock } : { period: lastQ, clock: 'end' };
  }
  return out;
}

// Possessions as Basketball-Reference counts them, both teams' estimates averaged.
function possessionsOf(a, b) {
  const half = (t, o) => t.fga + 0.4 * t.fta - 1.07 * (t.oreb / ((t.oreb + o.dreb) || 1)) * (t.fga - t.fgm) + t.turnover;
  return Math.round((half(a, b) + half(b, a)) / 2);
}

/** The injury report at tip for both teams: { home, away }, each { postedAt, rows: [{ name, status, reason }] } or { notOnFile }. */
async function reportAtTip(g) {
  try {
    const report = await latestOfficialReport({ now: new Date(g.datetime), lookbackHours: 6 });
    const listing = gameListing(report, reportDate(g.datetime), g.home_team.full_name, g.visitor_team.full_name);
    const side = (s) => (s === 'unfiled' ? { notOnFile: `not filed by the ${report.postedAt} report` }
      : { postedAt: report.postedAt, rows: [...s.values()].map((r) => ({ name: r.name, status: r.status, reason: r.reason })) });
    return { home: side(listing[g.home_team.full_name]), away: side(listing[g.visitor_team.full_name]) };
  } catch (e) {
    return { home: { notOnFile: e.message }, away: { notOnFile: e.message } };
  }
}

/** Builds one finished game's record: { row } for the store, or throws when the game isn't final or its box isn't on file. */
export async function buildNbaGameRecord(gameId) {
  const g = (await get(`/nba/v1/games/${gameId}`))?.data;
  if (!g) throw new Error(`game ${gameId} not on file`);
  if (!/final/i.test(String(g.status))) throw new Error(`game ${gameId} is not final (${g.status})`);
  const final = { home: g.home_team_score, away: g.visitor_team_score };
  const box = ((await ballDontLieService.getNbaBoxScores(String(g.date).slice(0, 10), 60)) || []).find((b) => b.id === g.id);
  if (!box) throw new Error(`game ${gameId}: box score not on file`);
  const ots = [1, 2, 3].filter((k) => g[`home_ot${k}`] != null);
  const periods = [1, 2, 3, 4, ...ots.map((k) => 4 + k)];
  const [byPeriod, lineups, advanced, plays, report, homeGames, awayGames] = await Promise.all([
    Promise.all(periods.map(async (q) => new Map(((await get(`/nba/v1/stats?game_ids[]=${g.id}&period=${q}&per_page=100`))?.data || []).map((r) => [r.player.id, r])))),
    ballDontLieService.getNbaLineups([g.id]).catch(() => []),
    ballDontLieService.getNbaAdvancedBox(g.id),
    get(`/nba/v1/plays?game_id=${g.id}`).then((r) => r?.data || []).catch(() => null),
    reportAtTip(g),
    ballDontLieService.getGames('basketball_nba', { team_ids: [g.home_team.id], seasons: [g.season], per_page: 100, paginateAll: true }),
    ballDontLieService.getGames('basketball_nba', { team_ids: [g.visitor_team.id], seasons: [g.season], per_page: 100, paginateAll: true }),
  ]);
  const starters = new Set((lineups || []).filter((r) => r.starter).map((r) => r.player?.id));
  const checks = [];
  const quarterMismatch = [];
  const players = [];
  for (const [side, t] of [['home', box.home_team], ['away', box.visitor_team]]) {
    for (const p of t.players || []) {
      const row = { side, id: p.player.id, name: `${p.player.first_name} ${p.player.last_name}`, starter: starters.has(p.player.id), min: minutesOf(p.min), pm: p.plus_minus ?? null,
        ...Object.fromEntries(STATS.map((k) => [k, Number(p[k]) || 0])) };
      if (row.min > 0) row.quarters = periods.map((q, i) => { const r = byPeriod[i].get(p.player.id); return { q, min: r ? minutesOf(r.min) : 0, pts: r ? Number(r.pts) || 0 : 0 }; });
      players.push(row);
    }
  }
  // Minutes by quarter to the second from each quarter's substitutions; a quarter that can't be followed keeps the box's
  // whole minutes. The closing five is the last quarter's five at the horn.
  const followed = plays ? periods.map((q) => followQuarter(plays, players, q)) : periods.map(() => null);
  const closing = followed[followed.length - 1] ? closingOf(plays, players, periods) : null;
  for (const [i, t] of followed.entries()) if (t) for (const p of players) if (p.quarters) p.quarters[i].min = Math.round((t.secs.get(p.id) || 0) / 6) / 10;
  // The 4th and overtime to the second when those quarters were followed, kept apart from the whole-game check below
  // (Oct 29 2026 hunt: three of the Spurs' closing five fell off "minutes in the 4th" at Houston on Oct 23 because their
  // minutes in another quarter were off).
  const late = periods.map((q, i) => [q, i]).filter(([q]) => q >= 4);
  if (late.every(([, i]) => followed[i])) for (const p of players.filter((x) => x.min > 0)) p.lateMin = Math.round(late.reduce((a, [, i]) => a + (followed[i].secs.get(p.id) || 0), 0) / 6) / 10;
  const cutQuarters = followed.filter((t) => !t).length;
  const wholeMinuteQuarters = periods.filter((q, i) => !followed[i]);
  // Some boxes give whole minutes only (the Oct 20 games: "30" for 30:52).
  const boxWhole = [...(box.home_team.players || []), ...(box.visitor_team.players || [])].every((p) => !String(p.min ?? '').includes(':'));
  // Points by quarter are dropped for a player whose quarters don't add up to his points; minutes and points both go when
  // his minutes don't add up (to half a minute, one more when the box has whole minutes only, and one more for each
  // quarter not followed).
  for (const row of players.filter((p) => p.quarters)) {
    if (Math.abs(sum(row.quarters, 'min') - row.min) > (boxWhole ? 1 : 0.5) + cutQuarters) { quarterMismatch.push(`${row.name} (${Math.round(row.min)} min in the box, ${Math.round(sum(row.quarters, 'min'))} by quarter)`); row.quarters = null; }
    else if (sum(row.quarters, 'pts') !== row.pts) { row.quarterPts = false; quarterMismatch.push(`${row.name} (${row.pts} in the box, ${sum(row.quarters, 'pts')} by quarter)`); }
  }
  // Each player's line against the official box (ESPN): where a count differs, the official one stands (Oct 27 2026
  // loop: 13 differences in 1,180 lines, among them Boozer's 16 points, officially 14, and Marshall's missing shot). A
  // player is matched as officialLineFor (espnNbaGame.js) says.
  const official = await espnPlayerLines(g).catch(() => null);
  const corrected = [], unmatched = [], matched = new Set();
  if (official) {
    for (const p of players.filter((x) => x.min > 0)) {
      const o = officialLineFor(p.name, official.filter((x) => x.side === p.side));
      if (!o) { unmatched.push(p.name); continue; }
      matched.add(o);
      const fixed = [];
      for (const f of STATS) if (o[f] != null && o[f] !== p[f]) { fixed.push(`${f} ${p[f]} to ${o[f]}`); p[f] = o[f]; }
      if (o.pm != null && o.pm !== p.pm) { fixed.push(`plus-minus ${p.pm} to ${o.pm}`); p.pm = o.pm; }
      // Minutes where the box's whole minutes are not the official's (Oct 27 2026: BDL had Vassell 35:31 for 33:33).
      if (Number.isFinite(o.min) && Math.round(p.min) !== o.min) {
        fixed.push(`min ${Math.round(p.min)} to ${o.min}`); p.min = o.min;
        if (p.quarters && Math.abs(sum(p.quarters, 'min') - p.min) > 1 + cutQuarters) { quarterMismatch.push(`${p.name} (${p.min} official minutes, ${Math.round(sum(p.quarters, 'min'))} by quarter)`); p.quarters = null; }
      }
      if (fixed.length) {
        corrected.push(`${p.name} (${fixed.join(', ')})`);
        if (p.quarters && p.quarterPts !== false && p.quarters.reduce((a, x) => a + x.pts, 0) !== p.pts) { p.quarterPts = false; quarterMismatch.push(`${p.name} (corrected to the official box; points by quarter no longer add up)`); }
      }
    }
  }
  const teams = {};
  for (const side of ['home', 'away']) {
    const mine = players.filter((p) => p.side === side);
    const id = side === 'home' ? g.home_team.id : g.visitor_team.id;
    const adv = (advanced || []).filter((r) => r.team?.id === id && (r.period ?? 0) === 0);
    teams[side] = { ...Object.fromEntries(STATS.map((k) => [k, sum(mine, k)])), bench: sum(mine.filter((p) => !p.starter), 'pts'),
      ...(adv.length ? { paint: sum(adv, 'points_paint'), secondChance: sum(adv, 'points_second_chance'), fastBreak: sum(adv, 'points_fast_break'), offTurnovers: sum(adv, 'points_off_turnovers') } : {}) };
  }
  // The official team box (ESPN) where it is on file: its shooting, rebounds and turnovers include what the players' rows
  // miss (team turnovers and rebounds, now and then a shot); the players' sums are kept to show any difference.
  const officialBox = await espnTeamBox(g);
  const OFFICIAL = ['fgm', 'fga', 'fg3m', 'fg3a', 'ftm', 'fta', 'reb', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'turnover', 'pf'];
  const shotGaps = [];
  for (const side of ['home', 'away']) {
    const o = officialBox?.[side];
    if (!o) { teams[side].official = false; continue; }
    teams[side].playersSum = Object.fromEntries(OFFICIAL.map((k) => [k, teams[side][k]]));
    for (const k of OFFICIAL) if (o[k] != null) teams[side][k] = o[k];
    for (const k of ['paint', 'fastBreak', 'offTurnovers']) if (o[k] != null) teams[side][k] = o[k];
    teams[side].teamTurnovers = o.teamTurnovers;
    teams[side].official = true;
    const gap = ['fgm', 'fga', 'fg3m', 'fg3a', 'ftm', 'fta'].filter((k) => o[k] != null && o[k] !== teams[side].playersSum[k]);
    if (gap.length) shotGaps.push(`${side === 'home' ? g.home_team.name : g.visitor_team.name}: players ${teams[side].playersSum.fgm}-${teams[side].playersSum.fga} FG, ${teams[side].playersSum.fg3m}-${teams[side].playersSum.fg3a} 3PT, ${teams[side].playersSum.ftm}-${teams[side].playersSum.fta} FT; official ${o.fgm}-${o.fga}, ${o.fg3m}-${o.fg3a}, ${o.ftm}-${o.fta}`);
  }
  teams.home.possessions = teams.away.possessions = possessionsOf(teams.home, teams.away);
  const quarters = { home: periods.map((q) => (q <= 4 ? g[`home_q${q}`] : g[`home_ot${q - 4}`])), away: periods.map((q) => (q <= 4 ? g[`visitor_q${q}`] : g[`visitor_ot${q - 4}`])) };
  const flow = plays ? flowOf(plays, final) : null;
  const lastOff = plays ? lastOffOf(plays, players, periods) : null;

  checks.push({ check: "the players' points add up to the final", ok: teams.home.pts === final.home && teams.away.pts === final.away, detail: `${teams.home.pts}-${teams.away.pts} against ${final.home}-${final.away}` });
  checks.push({ check: 'the quarters add up to the final', ok: quarters.home.every((v) => v != null) && sum(quarters.home.map((v) => ({ v })), 'v') === final.home && sum(quarters.away.map((v) => ({ v })), 'v') === final.away });
  checks.push({ check: 'the play-by-play ends at the final', ok: Boolean(flow) });
  checks.push({ check: "each player's quarters add up to his minutes and points", ok: !quarterMismatch.length, detail: quarterMismatch.join('; ') || null });
  checks.push({ check: "the closing five match the last quarter's minutes", ok: Boolean(closing) });
  checks.push({ check: 'every quarter followed to the second', ok: !cutQuarters, detail: cutQuarters ? `${cutQuarters} of ${periods.length} quarters in the box's whole minutes` : null });
  checks.push({ check: 'five starters each', ok: ['home', 'away'].every((s) => players.filter((p) => p.side === s && p.starter).length === 5) });
  checks.push({ check: 'the official team box is on file', ok: Boolean(officialBox) });
  const missing = (official || []).filter((o) => o.min > 0 && !matched.has(o)).map((o) => o.name);
  checks.push({ check: 'player lines match the official box', ok: !missing.length,
    detail: official ? [corrected.length && `corrected: ${corrected.join('; ')}`, unmatched.length && `not matched to the official box: ${unmatched.join(', ')}`,
      missing.length && `played in the official box, not in ours: ${missing.join(', ')}`].filter(Boolean).join(' | ') || null : 'official player lines not on file' });
  checks.push({ check: "the players' shooting adds up to the official box", ok: !shotGaps.length, detail: shotGaps.join('; ') || null });
  // BDL's own field: ESPN fills paint, fast break and off turnovers but not second chance (Oct 29 2026: 8 of 12 games built
  // before BDL's advanced box posted read "undefined second chance" and this check passed on ESPN's paint).
  checks.push({ check: 'the advanced box is on file', ok: Boolean(teams.home.secondChance != null && teams.away.secondChance != null) });
  checks.push({ check: 'the injury report at tip is on file', ok: !report.home.notOnFile && !report.away.notOnFile, detail: report.home.notOnFile || report.away.notOnFile || null });

  const home = teamOf(g.home_team), away = teamOf(g.visitor_team);
  const record = { v: NBA_RECORD_VERSION, league: 'NBA', gameId: g.id, season: g.season, date: g.date, tip: g.datetime, postseason: Boolean(g.postseason), cup: g.ist_stage || null,
    home, away, final, periods, quarters,
    afterThree: quarters.home.slice(0, 3).every((v) => v != null) ? { home: quarters.home[0] + quarters.home[1] + quarters.home[2], away: quarters.away[0] + quarters.away[1] + quarters.away[2] } : null,
    setting: { home: await settingOf(g, g.home_team, homeGames || []), away: await settingOf(g, g.visitor_team, awayGames || []) },
    incidents: plays ? incidentsOf(plays, { [g.home_team.id]: g.home_team.name, [g.visitor_team.id]: g.visitor_team.name }) : null,
    closing,
    lastOff,
    wholeMinuteQuarters,
    report, players, teams, flow };
  checks.push({ check: 'the venue is on file', ok: Boolean(record.setting.home.venue) });
  const outOf = (side) => (report[side].rows || []).filter((r) => r.status === 'Out' && !/g league - two-way/i.test(r.reason)).map((r) => r.name);
  // The stage and the postseason ride the summary so a won-lost counts only the standings' games (Oct 29 2026 hunt,
  // round 7: the NBA Cup final and the playoffs are not in the standings).
  const summary = { date: g.date, home: { ...home, score: final.home }, away: { ...away, score: final.away }, ot: ots.length, cup: g.ist_stage || null, postseason: Boolean(g.postseason),
    out: { home: outOf('home'), away: outOf('away') },
    listed: { home: report.home.rows || null, away: report.away.rows || null },
    played: { home: players.filter((p) => p.side === 'home' && p.min > 0).map((p) => p.name), away: players.filter((p) => p.side === 'away' && p.min > 0).map((p) => p.name) },
    starters: { home: players.filter((p) => p.side === 'home' && p.starter).map((p) => p.name), away: players.filter((p) => p.side === 'away' && p.starter).map((p) => p.name) } };
  return { row: { league: 'NBA', game_id: String(g.id), season: g.season, game_date: g.date, home_team: home.name, away_team: away.name,
    home_team_id: String(home.id), away_team_id: String(away.id), record, summary, checks, version: NBA_RECORD_VERSION } };
}
