/**
 * THE NBA BETTOR'S DATA (Oct 21 2026, the NBA read): how good each team is per possession with its rank among the
 * league (from its fifth game), and its season game by game, each cut at the moment of the pick. This season only (founder, Oct 13 2026: no
 * last-season numbers for the NBA; a team before its first game reads the desk's BEFORE THE FIRST GAME section).
 * Facts only: nothing here weighs, scores or projects anything; what they mean is Gary's read. Source: BDL
 * team_season_averages (one call for the whole league), games and box scores, and the league's official injury report.
 */
import { BALLDONTLIE_API_BASE_URL, bdlHttp, API_KEY, getCachedOrFetch } from '../../providers/bdl/transport.js';
import { ballDontLieService } from '../../providers/ballDontLieService.js';
import { latestOfficialReport, gameListing, playerKey, samePlayerIn } from '../../providers/nbaOfficialInjuryReport.js';
import { findTeam } from '../../gary/agentic/scoutReport/shared/utilities.js';
import { nbaSeason } from '../../../utils/dateUtils.js';
import { espnTeamBox, withOfficialPlayerLines } from './espnNbaGame.js';
import { recordsById, seasonSummaries } from '../../gamebygame/gameRecordStore.js';
import { flowFacts, nextListed, olderGameFacts, reasonsOnce, summariesByTeam, wonLost } from './nbaGameRecordText.js';

const etDay = (iso) => new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' });

/** Every team's regular-season ratings this season: { [full_name]: { gp, w, l, off, def, net, pace } }. */
export async function leagueRatings(season = nbaSeason()) {
  return getCachedOrFetch(`nba_league_ratings_${season}`, async () => {
    const r = await bdlHttp.get(`${BALLDONTLIE_API_BASE_URL}/nba/v1/team_season_averages/general?season=${season}&season_type=regular&type=advanced&per_page=100`, { headers: { Authorization: API_KEY } });
    const out = {};
    for (const row of r.data?.data || []) {
      const s = row.stats || {};
      if (!row.team?.full_name || !(Number(s.gp) > 0)) continue;
      out[row.team.full_name] = { gp: Number(s.gp), w: Number(s.w), l: Number(s.l), off: Number(s.off_rating), def: Number(s.def_rating), net: Number(s.net_rating), pace: Number(s.pace) };
    }
    return out;
  }, 30);
}

// The league's ratings as they stood at `asOf`. A pick made now reads BDL's season averages; a replay or the morning
// data check reads the same numbers rebuilt from the box scores of games finished before `asOf` (possessions by
// Basketball-Reference's formula, averaged over both sides, which matches BDL's published ratings). The season averages as of today put games played after the pick
// into a replay's story (Oct 23 2026 data check: Denver's "0-1, 84-96" before the 84-96 game).
export async function leagueRatingsAt(asOf = new Date(), season = nbaSeason()) {
  if (Date.now() - new Date(asOf).getTime() < 6 * 3600 * 1000) return leagueRatings(season);
  const games = ((await ballDontLieService.getGames('basketball_nba', { seasons: [season], per_page: 100, paginateAll: true })) || [])
    .filter((g) => !g.postseason && finishedBefore(g, asOf));
  const dates = [...new Set(games.map((g) => String(g.date || g.datetime).slice(0, 10)))];
  const boxes = new Map();
  for (const d of dates) for (const b of (await ballDontLieService.getNbaBoxScores(d, 24 * 60).catch(() => null)) || []) boxes.set(b.id, b);
  const sum = (side) => (side?.players || []).reduce((a, p) => ({ fga: a.fga + (Number(p.fga) || 0), fgm: a.fgm + (Number(p.fgm) || 0), fta: a.fta + (Number(p.fta) || 0),
    oreb: a.oreb + (Number(p.oreb) || 0), dreb: a.dreb + (Number(p.dreb) || 0), tov: a.tov + (Number(p.turnover) || 0) }), { fga: 0, fgm: 0, fta: 0, oreb: 0, dreb: 0, tov: 0 });
  const half = (t, o) => t.fga + 0.4 * t.fta - 1.07 * (t.oreb / ((t.oreb + o.dreb) || 1)) * (t.fga - t.fgm) + t.tov;
  const acc = {};
  for (const g of games) {
    const b = boxes.get(g.id); if (!b) continue;
    const h = sum(b.home_team), v = sum(b.visitor_team); const p = (half(h, v) + half(v, h)) / 2; if (!(p > 0)) continue;
    // Pace is per 48 minutes, as BDL's is: an overtime game's possessions scaled to regulation.
    const mins = (b.home_team?.players || []).reduce((a, x) => a + minutesOf(x), 0) / 5;
    const pace = mins > 0 ? (p * 48) / mins : p;
    for (const [team, us, them] of [[g.home_team?.full_name, g.home_team_score, g.visitor_team_score], [g.visitor_team?.full_name, g.visitor_team_score, g.home_team_score]]) {
      const t = (acc[team] ||= { gp: 0, w: 0, l: 0, pts: 0, opp: 0, poss: 0, pace: 0 });
      t.gp += 1; t.w += us > them ? 1 : 0; t.l += us > them ? 0 : 1; t.pts += us; t.opp += them; t.poss += p; t.pace += pace;
    }
  }
  const out = {};
  for (const [team, t] of Object.entries(acc)) {
    const off = (100 * t.pts) / t.poss, def = (100 * t.opp) / t.poss;
    out[team] = { gp: t.gp, w: t.w, l: t.l, off, def, net: off - def, pace: t.pace / t.gp };
  }
  return out;
}

// Who played in a game, from its box score (Oct 23 2026, founder: Gary needs "what happened last game" and the most
// recent data, not only a season's accumulation; the NBA's version of the Bears' backup-quarterback games is the
// nights a star sat). Each of the newest games lists both teams' box, the minutes, points and shooting of the eight who
// played most, and anyone who played 20+ minutes in another of these games but not this one.
const BOX_GAMES = 5;
// "34:30" or "34.5" to the nearest minute (parseInt read 34:59 as 34).
const minutesOf = (p) => { const [m, sec] = String(p?.min ?? '0').split(':'); return Math.round((Number(m) || 0) + (Number(sec) || 0) / 60); };
const COUNTS = ['pts', 'fgm', 'fga', 'fg3m', 'fg3a', 'ftm', 'fta', 'oreb', 'reb', 'ast', 'stl', 'blk', 'turnover', 'pf'];
const playerRow = (p) => ({ name: `${p.player?.first_name} ${p.player?.last_name}`, min: minutesOf(p), ...Object.fromEntries(COUNTS.map((k) => [k, Number(p[k]) || 0])) });
const totalsOf = (rows) => Object.fromEntries(COUNTS.map((k) => [k, rows.reduce((a, p) => a + p[k], 0)]));
/** The BDL box score for a game, found among its date's boxes. */
async function boxOf(g, teamId) {
  const date = String(g.date || g.datetime || '').slice(0, 10);
  // A day's boxes are kept a day only once its games are long over; within 18 hours of the tip, a short keep, so a box
  // read mid-game never freezes into the stored record (round 13).
  const settled = Date.now() - Date.parse(g.datetime || `${date}T23:00:00Z`) > 18 * 3_600_000;
  const boxes = await ballDontLieService.getNbaBoxScores(date, settled ? 24 * 60 : 20).catch(() => null);
  const opp = g.home_team?.id === teamId ? g.visitor_team?.id : g.home_team?.id;
  return (boxes || []).find((b) => b.id === g.id)
    || (boxes || []).find((b) => [b.home_team?.id, b.visitor_team?.id].includes(teamId) && [b.home_team?.id, b.visitor_team?.id].includes(opp))
    || null;
}
/** One team's side of a box score, with its opponent's: player rows, each side's totals and team name. */
export function boxSides(box, teamId) {
  if (!box) return null;
  const [us, them] = box.home_team?.id === teamId ? [box.home_team, box.visitor_team] : [box.visitor_team, box.home_team];
  const rows = (side) => (side?.players || []).map(playerRow);
  const ours = rows(us), theirs = rows(them);
  return Object.assign(ours, { team: us?.name, fullName: us?.full_name, totals: totalsOf(ours), opponent: Object.assign(theirs, { team: them?.name, fullName: them?.full_name, totals: totalsOf(theirs) }) });
}
// Each team's box: the official one (ESPN) where it is on file, with the team turnovers the players' rows leave out;
// otherwise the players' rows summed, said so (Oct 27 2026 data check: Houston's "14 turnovers" were 16, Dallas's
// "41-79 FG" was 41-80).
const boxLine = (side, official) => {
  const t = official || side.totals;
  const src = official ? '' : " (players' rows summed; the official box not on file)";
  // Total rebounds, assists, steals and blocks too (round 10: Houston's 52-35 edge on the glass read as an even game).
  const more = [t.reb != null ? `${t.reb} rebounds (${t.oreb} offensive)` : `${t.oreb} offensive rebounds`, t.ast != null ? `${t.ast} assists` : null, t.stl != null ? `${t.stl} steals` : null, t.blk != null ? `${t.blk} blocks` : null].filter(Boolean).join(', ');
  return `${side.team} ${t.fgm}-${t.fga} FG, ${t.fg3m}-${t.fg3a} 3PT, ${t.ftm}-${t.fta} FT, ${more}, ${t.turnover} turnovers${official?.teamTurnovers ? ` (${official.teamTurnovers} team)` : ''}, ${t.pf} fouls${src}`;
};
// Free throws too (round 14: Lillard's 7-of-11 at the line was nowhere in the live log).
const shooting = (p) => [p.fga ? `${p.fgm}-${p.fga} FG` : null, p.fg3a ? `${p.fg3m}-${p.fg3a} 3PT` : null, p.fta ? `${p.ftm}-${p.fta} FT` : null].filter(Boolean).join(', ');
// Where each team's points came from, its players' rows in BDL's advanced box summed (Oct 27 2026, founder GO: the reads
// quoted "60 points in the paint", "26 second-chance points" and "38 points off 26 turnovers" from the news, unchecked;
// summed, the feed gives the same numbers). The official team box's paint, fast-break and off-turnover points where ESPN
// has it (Oct 28 2026 data check: the sums gave Brooklyn 42 in the paint for the official 40 and Orlando 21 off turnovers
// for 23); second-chance points are BDL's alone.
function scoringLine(rows, teams, official = null) {
  const side = (t, o) => {
    const mine = (rows || []).filter((r) => r.team?.id === t?.id);
    const sum = (k) => mine.reduce((a, r) => a + (Number(r[k]) || 0), 0);
    const of = (k, bdl) => (o?.[k] != null ? o[k] : sum(bdl));
    return mine.length ? `${t.name} ${of('paint', 'points_paint')} in the paint, ${unsettled ? 'second-chance not on file' : `${sum('points_second_chance')} second-chance`}, ${of('fastBreak', 'points_fast_break')} fast-break, ${of('offTurnovers', 'points_off_turnovers')} off turnovers` : null;
  };
  // Both sides at 0 second-chance points with offensive rebounds is BDL's box before it settled (round 8).
  const second = (t) => (rows || []).filter((r) => r.team?.id === t?.id).reduce((a, r) => a + (Number(r.points_second_chance) || 0), 0);
  const unsettled = teams.every((t) => second(t) === 0) && [official?.us, official?.them].some((o) => Number(o?.oreb) > 0);
  const both = teams.map((t, i) => side(t, official ? [official.us, official.them][i] : null));
  return `      scoring: ${both.every(Boolean) ? both.join(' · ') : 'not on file'}`;
}
function whoPlayed(box, others, out, starters, scoring, official, ownOut = '') {
  if (!box) return ['      who played: box score not on file', scoring, out].filter(Boolean).join('\n');
  const played = box.filter((p) => p.min > 0).sort((a, b) => b.min - a.min);
  // Not one the row's own Out line already names with his reason (round 16: Curry, Green and Podziemski twice a row).
  const missed = [...new Set(others.flatMap((o) => (o || []).filter((p) => p.min >= 20).map((p) => p.name)))]
    .filter((nm) => !played.some((p) => p.name === nm) && !String(ownOut || '').includes(nm));
  // Everyone who played, the first eight with points, rebounds, assists, turnovers and shooting; the opponent's players
  // with 15+ minutes and their points (the top five left out a starter at 24 minutes; Oct 23 2026 audit). Rebounds,
  // assists and turnovers reached Gary only through the news until Oct 27 2026 ("16 Cunningham turnovers", Towns' 14
  // rebounds).
  // Foul trouble (Oct 28 2026 read check: Thompson fouled out at New York and Reed had five fouls early in the third,
  // read as a managed workload and a weak frontcourt).
  const fouls = (p) => (p.pf >= 6 ? 'fouled out' : p.pf === 5 ? '5 fouls' : null);
  // Past the first eight, ten minutes or more gets points, rebounds and shooting (round 16: the bench players who took a
  // missing starter's minutes, Collin Sexton 14 and Robert Williams III 18, read minutes only).
  const rest = played.slice(8).map((p) => `${p.name} ${p.min}${p.min >= 10 ? ` (${[`${p.pts} pts`, `${p.reb} reb`, shooting(p), fouls(p)].filter(Boolean).join(', ')})` : fouls(p) ? ` (${fouls(p)})` : ''}`);
  const theirs = (box.opponent || []).filter((p) => p.min >= 15).sort((a, b) => b.min - a.min).map((p) => `${p.name} ${p.min} (${[`${p.pts} pts`, shooting(p), fouls(p)].filter(Boolean).join(', ')})`);
  return [`      box: ${boxLine(box, official?.us)} · ${boxLine(box.opponent, official?.them)}`,
    scoring,
    // Who started (Oct 24 2026: minutes alone read a starter moved to the bench the same as one who started).
    `      started: ${starters?.length ? starters.join(', ') : 'not on file'}`,
    `      minutes: ${played.slice(0, 8).map((p) => `${p.name} ${p.min} (${[`${p.pts} pts`, `${p.reb} reb`, `${p.ast} ast`, `${p.turnover} TO`, shooting(p), fouls(p)].filter(Boolean).join(', ')})`).join(', ')}${rest.length ? `; also ${rest.join(', ')}` : ''}`,
    missed.length ? `      did not play${ownOut && !/not on file|not filed/.test(ownOut) ? ' (not Out on the report)' : ''}: ${missed.join(', ')}` : null,
    theirs.length ? `      theirs with 15+ minutes: ${theirs.join(', ')}` : null,
    out].filter(Boolean).join('\n');
}

// Who the opponent was missing that night: its Out list on the league's report at or before the tip (Oct 23 2026 data
// audit: a win over a team without its starters read the same as one over the full roster). Two-way players' G League
// listings stay off; a player sent down on assignment counts (Oct 29 2026 hunt).
export const reportClock = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const ailment = (reason) => String(reason || '').replace(/^Injury\/Illness - /, '').replace(/;\s*/g, ' ').trim();
const reportDate = (tip) => tip.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit', year: 'numeric' });
// A team's Out rows on one listing (two-way players' G League listings are not absences from the rotation).
const outRows = (side) => [...side.values()].filter((r) => r.status === 'Out' && !/g league - two-way/i.test(r.reason));

// Who played for a team in its last PLAYED_FROM_GAMES games before `before`, from their box scores: { n, keys }, or
// null when a box is not on file (Oct 27 2026 data audit: Golden State's Out list read "Jimmy Butler III, Kristaps
// Porzingis, Moses Moody", three players who had not played all season, and seven reads in three nights called a win
// over the Warriors or the Clippers a win over a short-handed team).
const PLAYED_FROM_GAMES = 10;
async function playedFor(teamId, before) {
  const games = ((await ballDontLieService.getGames('basketball_nba', { team_ids: [teamId], seasons: [nbaSeason()], per_page: 100, paginateAll: true })) || [])
    .filter((g) => !g.postseason && finishedBefore(g, before))
    .sort((a, b) => Date.parse(b.datetime || b.date) - Date.parse(a.datetime || a.date)).slice(0, PLAYED_FROM_GAMES);
  const boxes = await Promise.all(games.map((g) => boxOf(g, teamId).then((b) => withOfficialPlayerLines(g, b)).then((b) => boxSides(b, teamId)).catch(() => null)));
  if (boxes.some((b) => !b)) return null;
  return { n: games.length, names: [...new Set(boxes.flatMap((b) => b.filter((p) => p.min > 0).map((p) => p.name)))] };
}

// The opponent's Out list, those who had played for it apart from those who had not played in any of its games before
// this one: the second kind is the team it had been every night, not a short-handed one.
// `who` names whose list it is: "their" for the opponent's, the team's own name for its own (round 9: the 76ers' log said
// "did not play: Joel Embiid" with no reason, while the report at tip had his injury management).
async function opponentOut(g, team, opp, oppId, who = 'their') {
  if (!g.datetime) return `      ${who} Out list: not on file (no tip time for the game)`;
  const tip = new Date(g.datetime);
  try {
    const report = await latestOfficialReport({ now: tip, lookbackHours: 6 });
    const side = gameListing(report, reportDate(tip), team, opp)[opp];
    const when = `the ${reportClock(report.postedAt)} ET report`;
    if (side === 'unfiled') return `      ${who} Out list: not filed by ${when}`;
    const out = outRows(side);
    const said = (r) => `${r.name} (${ailment(r.reason)})`;
    if (!out.length) return `      ${who} Out on ${when}: nobody`;
    const before = await playedFor(oppId, tip).catch(() => null);
    if (!before) return `      ${who} Out on ${when}: ${out.map(said).join(', ')} (who of them had played for them before: not on file)`;
    if (!before.n) return `      ${who} Out on ${when}, its first game of the season: ${out.map(said).join(', ')}`;
    // The report's names against the box's, which can differ ("Alex Sarr", "Alexandre Sarr").
    const hadPlayed = (r) => Boolean(samePlayerIn(r.name, before.names, [...side.values()].map((x) => x.name)));
    const played = out.filter(hadPlayed);
    const not = out.filter((r) => !hadPlayed(r));
    const games = before.n === 1 ? 'its one game' : `any of its ${before.n === PLAYED_FROM_GAMES ? 'last ' : ''}${before.n} games`;
    if (!not.length) return `      ${who} Out on ${when}: ${played.map(said).join(', ')}`;
    return `      ${who} Out on ${when}: ${played.length ? `${played.map(said).join(', ')}; and, not in ${games} before this one, ` : `only players not in ${games} before this one: `}${not.map(said).join(', ')}`;
  } catch (e) {
    return `      ${who} Out list: not on file (${e.message})`;
  }
}

/** Who was Out for a team's last game and is not Out, Doubtful, Questionable or Probable tonight (Oct 27 2026 data
 * audit: Orlando's Anthony Black, Out for its first two games, was on no list for its third and scored 18 in 26 minutes;
 * nothing in the read said so, and the news's "Black didn't play in either game" left Gary unsure). `tonight` is the
 * team's side of tonight's listing (gameListing). Each: { name, reason, games: the team's newest games in a row he was
 * Out for, available: listed Available tonight }. */
export async function outLastGame(ts, tonight) {
  if (!ts?.games?.length || !tonight || tonight === 'unfiled') return [];
  const lists = [];
  for (const g of ts.games.slice(0, BOX_GAMES)) {
    if (!g.datetime) break;
    const tip = new Date(g.datetime);
    const opp = g.home_team?.id === ts.id ? g.visitor_team?.full_name : g.home_team?.full_name;
    const side = gameListing(await latestOfficialReport({ now: tip, lookbackHours: 6 }), reportDate(tip), ts.team, opp)[ts.team];
    if (side === 'unfiled') break;
    lists.push(new Map(outRows(side).map((r) => [playerKey(r.name), r])));
  }
  if (!lists.length) return [];
  return [...lists[0]].filter(([k]) => !tonight.has(k) || tonight.get(k).status === 'Available').map(([k, r]) => {
    let games = 0;
    while (games < lists.length && lists[games].has(k)) games += 1;
    return { name: r.name, reason: ailment(r.reason), games, allGames: games === ts.games.length, available: tonight.has(k) };
  });
}

/** The league's teams: [{ id, city, name, full_name }]. */
export const nbaTeams = async () => (await ballDontLieService.getTeams('basketball_nba')) || [];

/** The date of a team's first regular-season game this season (ET, YYYY-MM-DD), or null. */
export async function firstGameDate(team, season = nbaSeason()) {
  const teams = await ballDontLieService.getTeams('basketball_nba');
  const t = findTeam(teams, team);
  if (!t) return null;
  const games = (await ballDontLieService.getGames('basketball_nba', { team_ids: [t.id], seasons: [season], per_page: 100, paginateAll: true }) || [])
    .filter((g) => !g.postseason).map((g) => String(g.date || g.datetime || '').slice(0, 10)).filter(Boolean).sort();
  return games[0] || null;
}

// NBA Cup games (Oct 29 2026 hunt, round 7: all ten Oct 30 games were Cup group play and neither read said so). BDL's
// ist_stage names the stage ("East Group C", "West Quarterfinal", "East Semifinal", "Championship"). Every Cup game
// counts in the standings except the final (Knicks 18-7 before the Dec 16 2025 final, 19-7 after their next game).
export const inStandings = (g) => !g.postseason && !/^championship$/i.test(String(g.ist_stage || ''));
export function cupWords(stage) {
  if (!stage) return null;
  if (/^championship$/i.test(stage)) return 'NBA Cup final; it does not count in the standings';
  return `NBA Cup ${/group/i.test(stage) ? `group play (${stage})` : stage.replace(/ (Quarterfinal|Semifinal)$/, (m) => m.toLowerCase())}; the game counts in the standings`;
}
/** Tonight's NBA Cup line for the read ("NBA Cup group play (East Group C); the game counts in the standings."), or
 * null when tonight is not a Cup game or the schedule is not on file. */
export async function tonightCupLine(homeTeam, awayTeam, tip, season = nbaSeason()) {
  const teams = await ballDontLieService.getTeams('basketball_nba');
  const h = findTeam(teams, homeTeam), a = findTeam(teams, awayTeam);
  if (!h || !a || !tip) return null;
  const etYmd = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const games = await ballDontLieService.getGames('basketball_nba', { team_ids: [h.id], seasons: [season], per_page: 100, paginateAll: true }).catch(() => null);
  const g = (games || []).find((x) => x.visitor_team?.id === a.id && etYmd(x.datetime || `${x.date}T23:00:00Z`) === etYmd(tip));
  const words = cupWords(g?.ist_stage);
  return words ? `${words}.` : null;
}

// A game counts as finished before `asOf` when its feed says final: for a pick made now, once it has tipped; for a
// replay, once three hours have passed since its tip (Oct 23 2026: a game in progress at the pick read as a final).
export const finishedBefore = (g, asOf) => {
  const tip = Date.parse(g.datetime || `${g.date}T23:59:00Z`); const cut = new Date(asOf).getTime();
  return /final/i.test(String(g.status || '')) && g.home_team_score != null && g.visitor_team_score != null
    && (Date.now() - cut < 6 * 3600 * 1000 ? tip < cut : tip + 3 * 3600 * 1000 <= cut);
};

/** A team's finished games before `before`, newest first, with the box score of each of the newest BOX_GAMES:
 * { team, id, city, nickname, games, boxes }, or null when the team is not in the feed. */
export async function teamSeason(team, before = new Date(), season = nbaSeason()) {
  const teams = await ballDontLieService.getTeams('basketball_nba');
  const t = findTeam(teams, team);
  if (!t) return null;
  const games = (await ballDontLieService.getGames('basketball_nba', { team_ids: [t.id], seasons: [season], per_page: 100, paginateAll: true }) || [])
    .filter((g) => finishedBefore(g, before))
    .sort((a, b) => Date.parse(b.datetime || b.date) - Date.parse(a.datetime || a.date));
  const boxes = await Promise.all(games.slice(0, BOX_GAMES).map((g) => boxOf(g, t.id).then((b) => withOfficialPlayerLines(g, b)).then((b) => boxSides(b, t.id)).catch(() => null)));
  return { team, id: t.id, city: t.city === 'LA' ? 'Los Angeles' : t.city, nickname: t.name, games, boxes };
}

// The score by quarter, from the game's own row (Oct 26 2026: "W 128-111" read the same whether it was close until the
// last minutes or decided by halftime; the founder's "how the game went"). Overtime periods follow the fourth.
function quarterLine(g, home, us, them) {
  const side = (k) => [1, 2, 3, 4].map((q) => g[`${k}_q${q}`]);
  const ot = (k) => [1, 2, 3].map((q) => g[`${k}_ot${q}`]).filter((v) => v != null);
  const [a, b] = home ? ['home', 'visitor'] : ['visitor', 'home'];
  const sum = (k) => [...side(k), ...ot(k)].reduce((x, v) => x + (Number(v) || 0), 0);
  if (side(a).some((v) => v == null) || side(b).some((v) => v == null) || sum(a) !== us || sum(b) !== them) return null;
  const line = (k, name) => `${name} ${side(k).join('-')}${ot(k).length ? `, overtime ${ot(k).join('-')}` : ''}`;
  return `by quarter: ${line(a, (home ? g.home_team : g.visitor_team)?.name)}; ${line(b, (home ? g.visitor_team : g.home_team)?.name)}`;
}
// The last GAMES_SHOWN games (Oct 26 2026, agreed with the founder: older games mostly should not count, and an
// 82-game season listed in full buries the recent ones). The record above the log covers the whole season.
const GAMES_SHOWN = 15;

/** THIS SEASON GAME BY GAME: the last GAMES_SHOWN finished games before `before`, newest first, each with the
 * opponent's record now and the score by quarter; the newest BOX_GAMES with both teams' box, who played and who the
 * opponent was missing. `head` opens the log (the read's record and standings line); `data` is the team's teamSeason
 * when already loaded. */
/**
 * A team's next game after tonight's tip, and whether tonight opens a back-to-back (Oct 28 2026 data check: Dallas's
 * game at Indiana read without Dallas hosting San Antonio the next night, the night Irving was rested). Null when the
 * schedule is not on file.
 */
export async function nextGameLine(team, tip, season = nbaSeason()) {
  const teams = await ballDontLieService.getTeams('basketball_nba');
  const t = findTeam(teams, team);
  if (!t || !tip) return null;
  const games = await ballDontLieService.getGames('basketball_nba', { team_ids: [t.id], seasons: [season], per_page: 100, paginateAll: true }).catch(() => null);
  if (!games) return null;
  const etYmd = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const tonight = etYmd(tip);
  const next = games.filter((g) => !g.postseason && etYmd(g.datetime || `${g.date}T16:00:00Z`) > tonight)
    .sort((a, b) => Date.parse(a.datetime || a.date) - Date.parse(b.datetime || b.date))[0];
  if (!next) return `${t.name}: no game after tonight on the schedule`;
  const day = (ymd) => Math.round(Date.parse(`${ymd}T12:00:00Z`) / 86_400_000);
  const off = day(etYmd(next.datetime || `${next.date}T16:00:00Z`)) - day(tonight) - 1;
  const home = next.home_team?.id === t.id;
  const opp = home ? next.visitor_team?.full_name : next.home_team?.full_name;
  const when = etDay(next.datetime || `${next.date}T16:00:00Z`);
  return `${t.name}: next game ${when}, ${home ? 'at home vs' : 'at'} ${opp}${off <= 0 ? ' (tonight is the first night of a back-to-back)' : `, after ${off} day${off === 1 ? '' : 's'} off`}`;
}

// `meetingUnder`: tonight's opponent, whose log is printed first; a game against it is printed there in full and here as its
// score with a pointer (round 16: a meeting read twice, and Grimes's 3-5 threes in it read twice in two forms).
export async function gameByGame(team, league, before = new Date(), { season = nbaSeason(), head = team, data, meetingUnder = null, meetingData = null } = {}) {
  const ts = data === undefined ? await teamSeason(team, before, season) : data;
  if (!ts) return `${head}: games not on file.`;
  const { games, boxes } = ts;
  if (!games.length) return `${head}: no games played yet this season.`;
  const outs = await Promise.all(games.slice(0, BOX_GAMES).map((g) => {
    const opp = g.home_team?.id === ts.id ? g.visitor_team : g.home_team;
    return opponentOut(g, team, opp?.full_name, opp?.id);
  }));
  // Each absentee's reason said on the newest row he is Out in, by name after (round 16).
  const ownOuts = reasonsOnce(await Promise.all(games.slice(0, BOX_GAMES).map((g) => {
    const opp = g.home_team?.id === ts.id ? g.visitor_team : g.home_team;
    return opponentOut(g, opp?.full_name, team, ts.id, `${String(team).split(' ').pop()}'`.replace(/([^s])'$/, "$1's"));
  })));
  // One call per game: a game's lineup rows run about 23, past the feed's 100-row page for five games together.
  const lineups = await Promise.all(games.slice(0, BOX_GAMES).map((g) => ballDontLieService.getNbaLineups([g.id]).catch(() => [])));
  const startersOf = (rows, teamId) => rows.filter((r) => r.starter && r.team?.id === teamId).map((r) => `${r.player?.first_name} ${r.player?.last_name}`);
  const starters = lineups.map((rows) => startersOf(rows, ts.id));
  // A starter on either side who played under 15 minutes left early or was held back (Oct 28 2026 data check:
  // Brooklyn's loss to Indiana read without Zubac starting and leaving after seven minutes with an ankle injury).
  const early = games.slice(0, BOX_GAMES).map((g, i) => {
    const box = boxes[i];
    if (!box) return null;
    const oppId = g.home_team?.id === ts.id ? g.visitor_team?.id : g.home_team?.id;
    const short = (rows, names, team, teamId) => (rows || []).filter((p) => names.includes(p.name) && p.min > 0 && p.min < 15).map((p) => ({ p, team, teamId }));
    return [...short(box, starters[i], box.team, ts.id), ...short(box.opponent, startersOf(lineups[i], oppId), box.opponent.team, oppId)];
  });
  // With how each was listed for his team's next game, once the stored summaries are loaded (round 15).
  const earlyLine = (i, g) => {
    const list = early[i];
    if (!list?.length) return null;
    const day = new Date(g.datetime || `${g.date}T16:00:00Z`).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    return `      started and played under 15 minutes: ${list.map(({ p, team: t, teamId }) => { const w = nextListed(byTeamSummaries, teamId, day, p.name); return `${p.name} (${t}, ${p.min} min${w ? `; ${w}` : ''})`; }).join(', ')}`;
  };
  // Each team's rest that night (Oct 28 2026 data check: Detroit's win at Philadelphia read without the 76ers on the
  // second night of a back-to-back). Days off since each one's previous game this season.
  const dayOf = (g) => Math.round(Date.parse(`${new Date(g.datetime || `${g.date}T16:00:00Z`).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })}T12:00:00Z`) / 86_400_000);
  const scheduleOf = new Map();
  const restLine = async (g, i) => {
    const home = g.home_team?.id === ts.id;
    const opp = home ? g.visitor_team : g.home_team;
    if (!scheduleOf.has(opp.id)) {
      scheduleOf.set(opp.id, ballDontLieService.getGames('basketball_nba', { team_ids: [opp.id], seasons: [season], per_page: 100, paginateAll: true }).catch(() => null));
    }
    const theirs = await scheduleOf.get(opp.id);
    const words = (prev) => {
      if (prev === undefined) return 'not on file';
      if (prev === null) return 'first game of the season';
      const off = dayOf(g) - dayOf(prev) - 1;
      return off <= 0 ? 'second night of a back-to-back' : `${off} day${off === 1 ? '' : 's'} off`;
    };
    const ourPrev = games[i + 1] || null;
    const theirPrev = theirs ? (theirs.filter((x) => x.id !== g.id && !x.postseason && dayOf(x) < dayOf(g)).sort((a, b) => dayOf(b) - dayOf(a))[0] || null) : undefined;
    return `      rest: ${ts.nickname} ${words(ourPrev)}, ${opp.name} ${words(theirPrev)}`;
  };
  const rests = await Promise.all(games.slice(0, BOX_GAMES).map((g, i) => restLine(g, i)));
  const advanced = await Promise.all(games.slice(0, BOX_GAMES).map((g) => ballDontLieService.getNbaAdvancedBox(g.id)));
  const officials = await Promise.all(games.slice(0, BOX_GAMES).map(async (g) => {
    const o = await espnTeamBox(g).catch(() => null);
    return o ? (g.home_team?.id === ts.id ? { us: o.home, them: o.away } : { us: o.away, them: o.home }) : null;
  }));
  // Each game's flow from its stored record (Oct 29 2026, founder: the game as it went, not only how it ended).
  // A failed read of the stored records is said, not read as records not built (round 13).
  let recordsFailed = null;
  const flows = new Map(((await recordsById('NBA', games.slice(0, GAMES_SHOWN).map((g) => g.id)).catch((e) => { recordsFailed = e.message; return []; })) || [])
    .map((r) => [String(r.game_id), r.record]));
  // Each opponent's other games with their scores, newest first, as the NFL and college logs give them (round 12: "(1-4
  // now)" alone; points allowed could not be read against who scored them).
  const asOfDay = new Date(before).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const byTeamSummaries = await seasonSummaries('NBA', season, asOfDay).then(summariesByTeam).catch(() => null);
  const otherGames = (teamId, gameId) => {
    if (!byTeamSummaries) return null;
    const list = (byTeamSummaries.get(String(teamId)) || []).filter((r) => String(r.game_id) !== String(gameId)).slice().reverse();
    return list.map((r) => { const mine = String(r.summary.home.id) === String(teamId) ? 'home' : 'away', theirs = mine === 'home' ? 'away' : 'home';
      const a = r.summary[mine].score, b = r.summary[theirs].score;
      return `${a > b ? 'W' : 'L'} ${a}-${b}${r.summary.ot ? ' (OT)' : ''} ${mine === 'home' ? 'vs' : '@'} ${r.summary[theirs].abbr || r.summary[theirs].name}`; }).join(', ');
  };
  const rows = games.slice(0, GAMES_SHOWN).map((g, i) => {
    const home = g.home_team?.id === ts.id;
    const opp = home ? g.visitor_team?.full_name : g.home_team?.full_name;
    const us = home ? g.home_team_score : g.visitor_team_score; const them = home ? g.visitor_team_score : g.home_team_score;
    // The opponent's record now, and when this game is the only one it has played (Oct 23 2026 data audit: "0-1 now"
    // read as a weak team when the one loss was this game).
    const o = league[opp];
    const oppId = home ? g.visitor_team?.id : g.home_team?.id;
    const others = otherGames(oppId, g.id);
    // The record from the same stored games as the list, so the two agree after a late game (round 13: Memphis read 4-0
    // from the cached standings beside five games in its list).
    const oppGames = byTeamSummaries?.get(String(oppId));
    const wl = oppGames ? wonLost(oppGames, oppId) : o ? `${o.w}-${o.l}` : null;
    const gp = oppGames ? oppGames.length : o?.gp;
    const rec = wl ? ` (${wl} now${gp === 1 ? '; this was their only game' : others ? `; their other games, newest first: ${others}` : byTeamSummaries ? '' : '; their other games: not on file'})` : '';
    const q = quarterLine(g, home, us, them);
    const line = `  ${etDay(g.datetime || `${g.date}T16:00:00Z`)} · ${home ? 'vs' : '@'} ${opp}${rec} · ${us > them ? 'W' : 'L'} ${us}-${them}${g.postseason ? ' (postseason)' : ''}${cupWords(g.ist_stage) ? ` · ${cupWords(g.ist_stage).replace(/; the game counts in the standings$/, '')}` : ''}${q ? ` · ${q}` : ' · quarters not on file'}`;
    const scoring = i < BOX_GAMES ? scoringLine(advanced[i], home ? [g.home_team, g.visitor_team] : [g.visitor_team, g.home_team], officials[i]) : null;
    const stored = flows.get(String(g.id));
    const flow = stored ? `      flow: ${flowFacts(stored, ts.id, byTeamSummaries)}` : `      flow: not on file (${recordsFailed ? `the game records did not load: ${recordsFailed}` : 'the game record is not built yet'})`;
    const older = stored && i >= BOX_GAMES ? olderGameFacts(stored, ts.id).map((l) => `      ${l}`).join('\n') : null;
    // A meeting printed in full under tonight's opponent, where that row has its boxes too: here only this side's own
    // starters, minutes and who did not play (the rest of the row covers both teams).
    const fullThere = meetingUnder && String(opp).split(' ').pop() === String(meetingUnder).split(' ').pop()
      && (meetingData?.games || []).slice(0, BOX_GAMES).some((x) => String(x.id) === String(g.id));
    if (fullThere && i < BOX_GAMES) return `  ${etDay(g.datetime || `${g.date}T16:00:00Z`)} · ${home ? 'vs' : '@'} ${opp} · ${us > them ? 'W' : 'L'} ${us}-${them}: the meeting, in full under ${meetingUnder} above; the ${team} side of it:\n${whoPlayed(boxes[i], boxes.filter((_, k) => k !== i), null, starters[i], null, officials[i], ownOuts[i]).split('\n').filter((l) => /^\s+(?:started|minutes|did not play)/.test(l)).join('\n')}`;
    if (fullThere) return `  ${etDay(g.datetime || `${g.date}T16:00:00Z`)} · ${home ? 'vs' : '@'} ${opp} · ${us > them ? 'W' : 'L'} ${us}-${them}: the meeting, in full under ${meetingUnder} above`;
    return i < BOX_GAMES ? `${line}\n${[flow, rests[i], ownOuts[i], whoPlayed(boxes[i], boxes.filter((_, k) => k !== i), outs[i], starters[i], scoring, officials[i], ownOuts[i]), earlyLine(i, g)].filter(Boolean).join('\n')}` : `${line}\n${[flow, older].filter(Boolean).join('\n')}`;
  });
  return [`${head}, ${games.length > GAMES_SHOWN ? `the last ${GAMES_SHOWN} of ${games.length} games, ` : ''}newest first:`, ...rows].join('\n');
}
