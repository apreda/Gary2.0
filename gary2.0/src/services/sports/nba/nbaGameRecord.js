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
import { NBA_ARENAS, milesBetween, utcOffsetHours } from './nbaArenas.js';

export const NBA_RECORD_VERSION = 1;

const get = async (path) => (await bdlHttp.get(`${BALLDONTLIE_API_BASE_URL}${path}`, { headers: { Authorization: API_KEY } })).data;
// "32:00", "6" or "33:26" to minutes with one decimal.
const minutesOf = (m) => { const [a, b] = String(m ?? '0').split(':'); return Math.round(((Number(a) || 0) + (Number(b) || 0) / 60) * 10) / 10; };
const dayNum = (ymd) => Math.round(Date.parse(`${String(ymd).slice(0, 10)}T12:00:00Z`) / 86_400_000);
const clockSeconds = (c) => { const s = String(c ?? '0'); if (s.includes(':')) { const [m, sec] = s.split(':'); return Number(m) * 60 + Number(sec); } return Number(s) || 0; };
const reportDate = (tip) => new Date(tip).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit', year: 'numeric' });
const teamOf = (t) => ({ id: t.id, abbr: t.abbreviation, name: t.full_name, short: t.name });
const STATS = ['pts', 'oreb', 'dreb', 'reb', 'ast', 'stl', 'blk', 'turnover', 'pf', 'fgm', 'fga', 'fg3m', 'fg3a', 'ftm', 'fta'];
const sum = (rows, k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);

/** Each team's days off, games in four nights, and the trip from its last game's arena (null before its first game). */
export function settingOf(g, team, teamGames) {
  const tip = Date.parse(g.datetime || `${g.date}T23:00:00Z`);
  const prior = teamGames.filter((x) => x.id !== g.id && !x.postseason === !g.postseason && Date.parse(x.datetime || `${x.date}T23:00:00Z`) < tip)
    .sort((a, b) => Date.parse(b.datetime || b.date) - Date.parse(a.datetime || a.date));
  const here = NBA_ARENAS[g.home_team.abbreviation];
  const prev = prior[0];
  const out = { home: g.home_team.id === team.id, arenaCity: here?.city || null, altitudeFt: here?.altitudeFt || null,
    gamesInFourNights: 1 + prior.filter((x) => dayNum(g.date) - dayNum(x.date) <= 3).length, prev: null, daysOff: null };
  if (!prev) return out;
  const there = NBA_ARENAS[prev.home_team.abbreviation];
  const opp = prev.home_team.id === team.id ? prev.visitor_team : prev.home_team;
  out.prev = { date: prev.date, opponent: opp.full_name, home: prev.home_team.id === team.id, city: there?.city || null };
  out.daysOff = dayNum(g.date) - dayNum(prev.date) - 1;
  out.miles = here && there ? milesBetween(there, here) : null;
  out.tzShift = here && there ? utcOffsetHours(here.tz, tip) - utcOffsetHours(there.tz, Date.parse(prev.datetime || prev.date)) : null;
  return out;
}

/** How the game went, from the play-by-play (home/away as the game has them). Null when the plays don't end at the final
 * (6 of the first 52 games: the feed's running score drifts, "130-105" in a 127-105 game), so a drifted play-by-play
 * never stands in for the game. The score after three comes from the official quarters instead. */
export function flowOf(plays, final) {
  const ordered = [...(plays || [])].sort((a, b) => a.order - b.order).filter((p) => p.home_score != null && p.away_score != null);
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
      : { postedAt: report.postedAt, rows: [...s.values()].filter((r) => r.status !== 'Available').map((r) => ({ name: r.name, status: r.status, reason: r.reason })) });
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
      const quarters = periods.map((q, i) => { const r = byPeriod[i].get(p.player.id); return { q, min: r ? minutesOf(r.min) : 0, pts: r ? Number(r.pts) || 0 : 0 }; });
      if (row.min > 0) {
        if (sum(quarters, 'pts') === row.pts) row.quarters = quarters;
        else { row.quarters = null; quarterMismatch.push(`${row.name} (${row.pts} in the box, ${sum(quarters, 'pts')} by quarter)`); }
      }
      players.push(row);
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
  teams.home.possessions = teams.away.possessions = possessionsOf(teams.home, teams.away);
  const quarters = { home: periods.map((q) => (q <= 4 ? g[`home_q${q}`] : g[`home_ot${q - 4}`])), away: periods.map((q) => (q <= 4 ? g[`visitor_q${q}`] : g[`visitor_ot${q - 4}`])) };
  const flow = plays ? flowOf(plays, final) : null;

  checks.push({ check: "the players' points add up to the final", ok: teams.home.pts === final.home && teams.away.pts === final.away, detail: `${teams.home.pts}-${teams.away.pts} against ${final.home}-${final.away}` });
  checks.push({ check: 'the quarters add up to the final', ok: quarters.home.every((v) => v != null) && sum(quarters.home.map((v) => ({ v })), 'v') === final.home && sum(quarters.away.map((v) => ({ v })), 'v') === final.away });
  checks.push({ check: 'the play-by-play ends at the final', ok: Boolean(flow) });
  checks.push({ check: "each player's quarters add up to his points", ok: !quarterMismatch.length, detail: quarterMismatch.join('; ') || null });
  checks.push({ check: 'five starters each', ok: ['home', 'away'].every((s) => players.filter((p) => p.side === s && p.starter).length === 5) });
  checks.push({ check: 'the advanced box is on file', ok: Boolean(teams.home.paint != null && teams.away.paint != null) });
  checks.push({ check: 'the injury report at tip is on file', ok: !report.home.notOnFile && !report.away.notOnFile, detail: report.home.notOnFile || report.away.notOnFile || null });

  const home = teamOf(g.home_team), away = teamOf(g.visitor_team);
  const record = { v: NBA_RECORD_VERSION, league: 'NBA', gameId: g.id, season: g.season, date: g.date, tip: g.datetime, postseason: Boolean(g.postseason), cup: g.ist_stage || null,
    home, away, final, periods, quarters,
    afterThree: quarters.home.slice(0, 3).every((v) => v != null) ? { home: quarters.home[0] + quarters.home[1] + quarters.home[2], away: quarters.away[0] + quarters.away[1] + quarters.away[2] } : null,
    setting: { home: settingOf(g, g.home_team, homeGames || []), away: settingOf(g, g.visitor_team, awayGames || []) },
    report, players, teams, flow };
  const outOf = (side) => (report[side].rows || []).filter((r) => r.status === 'Out' && !/g league/i.test(r.reason)).map((r) => r.name);
  const summary = { date: g.date, home: { ...home, score: final.home }, away: { ...away, score: final.away }, ot: ots.length,
    out: { home: outOf('home'), away: outOf('away') },
    listed: { home: report.home.rows || null, away: report.away.rows || null },
    played: { home: players.filter((p) => p.side === 'home' && p.min > 0).map((p) => p.name), away: players.filter((p) => p.side === 'away' && p.min > 0).map((p) => p.name) },
    starters: { home: players.filter((p) => p.side === 'home' && p.starter).map((p) => p.name), away: players.filter((p) => p.side === 'away' && p.starter).map((p) => p.name) } };
  return { row: { league: 'NBA', game_id: String(g.id), season: g.season, game_date: g.date, home_team: home.name, away_team: away.name,
    home_team_id: String(home.id), away_team_id: String(away.id), record, summary, checks, version: NBA_RECORD_VERSION } };
}
