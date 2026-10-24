/**
 * THE NBA BETTOR'S DATA (Oct 21 2026, the NBA read): how good each team is per possession with its rank among the
 * league (from its fifth game), and its season game by game, each cut at the moment of the pick. This season only (founder, Oct 13 2026: no
 * last-season numbers for the NBA; a team before its first game reads the desk's BEFORE THE FIRST GAME section).
 * Facts only: nothing here weighs, scores or projects anything; what they mean is Gary's read. Source: BDL
 * team_season_averages (one call for the whole league), games and box scores, and the league's official injury report.
 */
import { BALLDONTLIE_API_BASE_URL, bdlHttp, API_KEY, getCachedOrFetch } from '../../providers/bdl/transport.js';
import { ballDontLieService } from '../../providers/ballDontLieService.js';
import { latestOfficialReport, gameListing } from '../../providers/nbaOfficialInjuryReport.js';
import { findTeam } from '../../gary/agentic/scoutReport/shared/utilities.js';
import { nbaSeason } from '../../../utils/dateUtils.js';

const one = (x) => (Math.round(Number(x) * 10) / 10).toFixed(1);
const signed = (x) => `${Number(x) > 0 ? '+' : ''}${one(x)}`;
const ord = (k) => `${k}${['th', 'st', 'nd', 'rd'][(k % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][k % 100] || 'th'}`;
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

const rankOf = (league, team, key, high) => {
  const order = Object.entries(league).filter(([, t]) => Number.isFinite(t[key])).sort((a, b) => (high ? b[1][key] - a[1][key] : a[1][key] - b[1][key]));
  return order.findIndex(([name]) => name === team) + 1;
};

// A rank among the league means little before a team has played this many games (Oct 22 2026: after one game the
// read quoted "14th in the league" for a single night's offense), so the numbers stand alone until then.
const RANKED_FROM_GAMES = 5;

// Five games or fewer show no per-possession numbers: one night's per-100 numbers read as who the team is, and the
// game log lists each game with who played (Oct 23 2026 data audit).
export const RATED_FROM_GAMES = 6;
/** A team's per-possession numbers with ranks, for the head of its game log; null under RATED_FROM_GAMES games. The
 * record is the head's own (Oct 23 2026: HOW GOOD THEY ARE went; what it held that the log does not heads the log). */
export function ratingsLine(league, team) {
  const t = league[team];
  if (!t || t.gp < RATED_FROM_GAMES) return null;
  const teams = Object.keys(league).length;
  const ranked = t.gp >= RANKED_FROM_GAMES;
  const rank = (key, high, ofAll = false) => (ranked ? ` (${ord(rankOf(league, team, key, high))}${ofAll ? ` of ${teams}` : ''})` : '');
  return `per 100 possessions: offense ${one(t.off)} points${rank('off', true, true)}, defense ${one(t.def)} allowed${rank('def', false)}, net ${signed(t.net)}${rank('net', true)}, pace ${one(t.pace)}`;
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
// Each team's box, from its players' rows (team turnovers and team rebounds are not in the feed's box).
const boxLine = (side) => { const t = side.totals; return `${side.team} ${t.fgm}-${t.fga} FG, ${t.fg3m}-${t.fg3a} 3PT, ${t.ftm}-${t.fta} FT, ${t.oreb} offensive rebounds, ${t.turnover} turnovers, ${t.pf} fouls`; };
const shooting = (p) => [p.fga ? `${p.fgm}-${p.fga} FG` : null, p.fg3a ? `${p.fg3m}-${p.fg3a} 3PT` : null].filter(Boolean).join(', ');
function whoPlayed(box, others, out, starters) {
  if (!box) return ['      who played: box score not on file', out].filter(Boolean).join('\n');
  const played = box.filter((p) => p.min > 0).sort((a, b) => b.min - a.min);
  const missed = [...new Set(others.flatMap((o) => (o || []).filter((p) => p.min >= 20).map((p) => p.name)))]
    .filter((nm) => !played.some((p) => p.name === nm));
  // Everyone who played, the first eight with points and shooting; the opponent's players with 15+ minutes and their
  // points (the top five left out a starter at 24 minutes; Oct 23 2026 audit).
  const rest = played.slice(8).map((p) => `${p.name} ${p.min}`);
  const theirs = (box.opponent || []).filter((p) => p.min >= 15).sort((a, b) => b.min - a.min).map((p) => `${p.name} ${p.min} (${p.pts} pts)`);
  return [`      box: ${boxLine(box)} · ${boxLine(box.opponent)}`,
    // Who started (Oct 24 2026: minutes alone read a starter moved to the bench the same as one who started).
    `      started: ${starters?.length ? starters.join(', ') : 'not on file'}`,
    `      minutes: ${played.slice(0, 8).map((p) => `${p.name} ${p.min} (${[`${p.pts} pts`, shooting(p)].filter(Boolean).join(', ')})`).join(', ')}${rest.length ? `; also ${rest.join(', ')}` : ''}`,
    missed.length ? `      did not play: ${missed.join(', ')}` : null,
    theirs.length ? `      theirs with 15+ minutes: ${theirs.join(', ')}` : null,
    out].filter(Boolean).join('\n');
}

// Who the opponent was missing that night: its Out list on the league's report at or before the tip (Oct 23 2026 data
// audit: a win over a team without its starters read the same as one over the full roster). G League assignments are
// not absences from the rotation and stay off.
export const reportClock = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const ailment = (reason) => String(reason || '').replace(/^Injury\/Illness - /, '').replace(/;\s*/g, ' ').trim();
async function opponentOut(g, team, opp) {
  if (!g.datetime) return '      their Out list: not on file (no tip time for the game)';
  const tip = new Date(g.datetime);
  const gameDate = tip.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit', year: 'numeric' });
  try {
    const report = await latestOfficialReport({ now: tip, lookbackHours: 6 });
    const side = gameListing(report, gameDate, team, opp)[opp];
    const when = `the ${reportClock(report.postedAt)} ET report`;
    if (side === 'unfiled') return `      their Out list: not filed by ${when}`;
    const out = [...side.values()].filter((r) => r.status === 'Out' && !/g league/i.test(r.reason)).map((r) => `${r.name} (${ailment(r.reason)})`);
    return `      their Out on ${when}: ${out.length ? out.join(', ') : 'nobody'}`;
  } catch (e) {
    return `      their Out list: not on file (${e.message})`;
  }
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
  const boxes = await Promise.all(games.slice(0, BOX_GAMES).map((g) => boxOf(g, t.id).then((b) => boxSides(b, t.id)).catch(() => null)));
  return { team, id: t.id, city: t.city === 'LA' ? 'Los Angeles' : t.city, nickname: t.name, games, boxes };
}

/** THIS SEASON GAME BY GAME: each finished game before `before`, newest first, with the opponent's record now; the
 * newest BOX_GAMES with both teams' box, who played and who the opponent was missing. `head` opens the log (the read's
 * record and standings line); `data` is the team's teamSeason when already loaded. */
export async function gameByGame(team, league, before = new Date(), { season = nbaSeason(), head = team, data } = {}) {
  const ts = data === undefined ? await teamSeason(team, before, season) : data;
  if (!ts) return `${head}: games not on file.`;
  const { games, boxes } = ts;
  if (!games.length) return `${head}: no games played yet this season.`;
  const outs = await Promise.all(games.slice(0, BOX_GAMES).map((g) => opponentOut(g, team, g.home_team?.id === ts.id ? g.visitor_team?.full_name : g.home_team?.full_name)));
  // One call per game: a game's lineup rows run about 23, past the feed's 100-row page for five games together.
  const starters = await Promise.all(games.slice(0, BOX_GAMES).map(async (g) => (await ballDontLieService.getNbaLineups([g.id]).catch(() => []))
    .filter((r) => r.starter && r.team?.id === ts.id).map((r) => `${r.player?.first_name} ${r.player?.last_name}`)));
  const rows = games.map((g, i) => {
    const home = g.home_team?.id === ts.id;
    const opp = home ? g.visitor_team?.full_name : g.home_team?.full_name;
    const us = home ? g.home_team_score : g.visitor_team_score; const them = home ? g.visitor_team_score : g.home_team_score;
    // The opponent's record now, and when this game is the only one it has played (Oct 23 2026 data audit: "0-1 now"
    // read as a weak team when the one loss was this game).
    const o = league[opp];
    const rec = o ? ` (${o.w}-${o.l} now${o.gp === 1 ? '; this was their only game' : ''})` : '';
    const line = `  ${etDay(g.datetime || `${g.date}T16:00:00Z`)} · ${home ? 'vs' : '@'} ${opp}${rec} · ${us > them ? 'W' : 'L'} ${us}-${them}${g.postseason ? ' (postseason)' : ''}`;
    return i < BOX_GAMES ? `${line}\n${whoPlayed(boxes[i], boxes.filter((_, k) => k !== i), outs[i], starters[i])}` : line;
  });
  return [`${head}, newest first:`, ...rows].join('\n');
}
