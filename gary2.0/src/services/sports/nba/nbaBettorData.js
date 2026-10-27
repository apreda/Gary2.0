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
  const boxes = await ballDontLieService.getNbaBoxScores(date, 24 * 60).catch(() => null);
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
  return `${side.team} ${t.fgm}-${t.fga} FG, ${t.fg3m}-${t.fg3a} 3PT, ${t.ftm}-${t.fta} FT, ${t.oreb} offensive rebounds, ${t.turnover} turnovers${official?.teamTurnovers ? ` (${official.teamTurnovers} team)` : ''}, ${t.pf} fouls${src}`;
};
const shooting = (p) => [p.fga ? `${p.fgm}-${p.fga} FG` : null, p.fg3a ? `${p.fg3m}-${p.fg3a} 3PT` : null].filter(Boolean).join(', ');
// Where each team's points came from, its players' rows in BDL's advanced box summed (Oct 27 2026, founder GO: the reads
// quoted "60 points in the paint", "26 second-chance points" and "38 points off 26 turnovers" from the news, unchecked;
// summed, the feed gives the same numbers).
function scoringLine(rows, teams) {
  const side = (t) => {
    const mine = (rows || []).filter((r) => r.team?.id === t?.id);
    const sum = (k) => mine.reduce((a, r) => a + (Number(r[k]) || 0), 0);
    return mine.length ? `${t.name} ${sum('points_paint')} in the paint, ${sum('points_second_chance')} second-chance, ${sum('points_fast_break')} fast-break, ${sum('points_off_turnovers')} off turnovers` : null;
  };
  const both = teams.map(side);
  return `      scoring: ${both.every(Boolean) ? both.join(' · ') : 'not on file'}`;
}
function whoPlayed(box, others, out, starters, scoring, official) {
  if (!box) return ['      who played: box score not on file', scoring, out].filter(Boolean).join('\n');
  const played = box.filter((p) => p.min > 0).sort((a, b) => b.min - a.min);
  const missed = [...new Set(others.flatMap((o) => (o || []).filter((p) => p.min >= 20).map((p) => p.name)))]
    .filter((nm) => !played.some((p) => p.name === nm));
  // Everyone who played, the first eight with points, rebounds, assists, turnovers and shooting; the opponent's players
  // with 15+ minutes and their points (the top five left out a starter at 24 minutes; Oct 23 2026 audit). Rebounds,
  // assists and turnovers reached Gary only through the news until Oct 27 2026 ("16 Cunningham turnovers", Towns' 14
  // rebounds).
  const rest = played.slice(8).map((p) => `${p.name} ${p.min}`);
  const theirs = (box.opponent || []).filter((p) => p.min >= 15).sort((a, b) => b.min - a.min).map((p) => `${p.name} ${p.min} (${p.pts} pts)`);
  return [`      box: ${boxLine(box, official?.us)} · ${boxLine(box.opponent, official?.them)}`,
    scoring,
    // Who started (Oct 24 2026: minutes alone read a starter moved to the bench the same as one who started).
    `      started: ${starters?.length ? starters.join(', ') : 'not on file'}`,
    `      minutes: ${played.slice(0, 8).map((p) => `${p.name} ${p.min} (${[`${p.pts} pts`, `${p.reb} reb`, `${p.ast} ast`, `${p.turnover} TO`, shooting(p)].filter(Boolean).join(', ')})`).join(', ')}${rest.length ? `; also ${rest.join(', ')}` : ''}`,
    missed.length ? `      did not play: ${missed.join(', ')}` : null,
    theirs.length ? `      theirs with 15+ minutes: ${theirs.join(', ')}` : null,
    out].filter(Boolean).join('\n');
}

// Who the opponent was missing that night: its Out list on the league's report at or before the tip (Oct 23 2026 data
// audit: a win over a team without its starters read the same as one over the full roster). G League assignments are
// not absences from the rotation and stay off.
export const reportClock = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const ailment = (reason) => String(reason || '').replace(/^Injury\/Illness - /, '').replace(/;\s*/g, ' ').trim();
const reportDate = (tip) => tip.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit', year: 'numeric' });
// A team's Out rows on one listing (G League assignments are not absences from the rotation).
const outRows = (side) => [...side.values()].filter((r) => r.status === 'Out' && !/g league/i.test(r.reason));

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
async function opponentOut(g, team, opp, oppId) {
  if (!g.datetime) return '      their Out list: not on file (no tip time for the game)';
  const tip = new Date(g.datetime);
  try {
    const report = await latestOfficialReport({ now: tip, lookbackHours: 6 });
    const side = gameListing(report, reportDate(tip), team, opp)[opp];
    const when = `the ${reportClock(report.postedAt)} ET report`;
    if (side === 'unfiled') return `      their Out list: not filed by ${when}`;
    const out = outRows(side);
    const said = (r) => `${r.name} (${ailment(r.reason)})`;
    if (!out.length) return `      their Out on ${when}: nobody`;
    const before = await playedFor(oppId, tip).catch(() => null);
    if (!before) return `      their Out on ${when}: ${out.map(said).join(', ')} (who of them had played for them before: not on file)`;
    if (!before.n) return `      their Out on ${when}, their first game of the season: ${out.map(said).join(', ')}`;
    // The report's names against the box's, which can differ ("Alex Sarr", "Alexandre Sarr").
    const hadPlayed = (r) => Boolean(samePlayerIn(r.name, before.names, [...side.values()].map((x) => x.name)));
    const played = out.filter(hadPlayed);
    const not = out.filter((r) => !hadPlayed(r));
    const games = before.n === 1 ? 'their one game' : `any of their ${before.n === PLAYED_FROM_GAMES ? 'last ' : ''}${before.n} games`;
    if (!not.length) return `      their Out on ${when}: ${played.map(said).join(', ')}`;
    return `      their Out on ${when}: ${played.length ? `${played.map(said).join(', ')}; and, not in ${games} before this one, ` : `only players not in ${games} before this one: `}${not.map(said).join(', ')}`;
  } catch (e) {
    return `      their Out list: not on file (${e.message})`;
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
export async function gameByGame(team, league, before = new Date(), { season = nbaSeason(), head = team, data } = {}) {
  const ts = data === undefined ? await teamSeason(team, before, season) : data;
  if (!ts) return `${head}: games not on file.`;
  const { games, boxes } = ts;
  if (!games.length) return `${head}: no games played yet this season.`;
  const outs = await Promise.all(games.slice(0, BOX_GAMES).map((g) => {
    const opp = g.home_team?.id === ts.id ? g.visitor_team : g.home_team;
    return opponentOut(g, team, opp?.full_name, opp?.id);
  }));
  // One call per game: a game's lineup rows run about 23, past the feed's 100-row page for five games together.
  const starters = await Promise.all(games.slice(0, BOX_GAMES).map(async (g) => (await ballDontLieService.getNbaLineups([g.id]).catch(() => []))
    .filter((r) => r.starter && r.team?.id === ts.id).map((r) => `${r.player?.first_name} ${r.player?.last_name}`)));
  const advanced = await Promise.all(games.slice(0, BOX_GAMES).map((g) => ballDontLieService.getNbaAdvancedBox(g.id)));
  const officials = await Promise.all(games.slice(0, BOX_GAMES).map(async (g) => {
    const o = await espnTeamBox(g).catch(() => null);
    return o ? (g.home_team?.id === ts.id ? { us: o.home, them: o.away } : { us: o.away, them: o.home }) : null;
  }));
  const rows = games.slice(0, GAMES_SHOWN).map((g, i) => {
    const home = g.home_team?.id === ts.id;
    const opp = home ? g.visitor_team?.full_name : g.home_team?.full_name;
    const us = home ? g.home_team_score : g.visitor_team_score; const them = home ? g.visitor_team_score : g.home_team_score;
    // The opponent's record now, and when this game is the only one it has played (Oct 23 2026 data audit: "0-1 now"
    // read as a weak team when the one loss was this game).
    const o = league[opp];
    const rec = o ? ` (${o.w}-${o.l} now${o.gp === 1 ? '; this was their only game' : ''})` : '';
    const q = quarterLine(g, home, us, them);
    const line = `  ${etDay(g.datetime || `${g.date}T16:00:00Z`)} · ${home ? 'vs' : '@'} ${opp}${rec} · ${us > them ? 'W' : 'L'} ${us}-${them}${g.postseason ? ' (postseason)' : ''}${q ? ` · ${q}` : ' · quarters not on file'}`;
    const scoring = i < BOX_GAMES ? scoringLine(advanced[i], home ? [g.home_team, g.visitor_team] : [g.visitor_team, g.home_team]) : null;
    return i < BOX_GAMES ? `${line}\n${whoPlayed(boxes[i], boxes.filter((_, k) => k !== i), outs[i], starters[i], scoring, officials[i])}` : line;
  });
  return [`${head}, ${games.length > GAMES_SHOWN ? `the last ${GAMES_SHOWN} of ${games.length} games, ` : ''}newest first:`, ...rows].join('\n');
}
