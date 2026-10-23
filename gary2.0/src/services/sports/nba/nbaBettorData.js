/**
 * THE NBA BETTOR'S DATA (Oct 21 2026, the NBA read): how good each team is per possession with its rank among the
 * league (from its fifth game), and its season game by game, each cut at the moment of the pick. This season only (founder, Oct 13 2026: no
 * last-season numbers for the NBA; a team before its first game reads the desk's BEFORE THE FIRST GAME section).
 * Facts only: nothing here weighs, scores or projects anything; what they mean is Gary's read. Source: BDL
 * team_season_averages (one call for the whole league) and games.
 */
import { BALLDONTLIE_API_BASE_URL, bdlHttp, API_KEY, getCachedOrFetch } from '../../providers/bdl/transport.js';
import { ballDontLieService } from '../../providers/ballDontLieService.js';
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
  const cut = new Date(asOf).getTime();
  const games = ((await ballDontLieService.getGames('basketball_nba', { seasons: [season], per_page: 100, paginateAll: true })) || [])
    .filter((g) => !g.postseason && /final/i.test(String(g.status || '')) && Date.parse(g.datetime || `${g.date}T23:59:00Z`) < cut);
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
    for (const [team, us, them] of [[g.home_team?.full_name, g.home_team_score, g.visitor_team_score], [g.visitor_team?.full_name, g.visitor_team_score, g.home_team_score]]) {
      const t = (acc[team] ||= { gp: 0, w: 0, l: 0, pts: 0, opp: 0, poss: 0 });
      t.gp += 1; t.w += us > them ? 1 : 0; t.l += us > them ? 0 : 1; t.pts += us; t.opp += them; t.poss += p;
    }
  }
  const out = {};
  for (const [team, t] of Object.entries(acc)) {
    const off = (100 * t.pts) / t.poss, def = (100 * t.opp) / t.poss;
    out[team] = { gp: t.gp, w: t.w, l: t.l, off, def, net: off - def, pace: t.poss / t.gp };
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

/** HOW GOOD THEY ARE for one team: its record and per-possession numbers, with ranks among the teams that have played
 * once it has played RANKED_FROM_GAMES games. */
export function strengthLine(league, team) {
  const t = league[team];
  if (!t) return `${team}: no games yet this season.`;
  const teams = Object.keys(league).length;
  const ranked = t.gp >= RANKED_FROM_GAMES;
  const rank = (key, high, ofAll = false) => (ranked ? ` (${ord(rankOf(league, team, key, high))}${ofAll ? ` of ${teams}` : ''})` : '');
  return `${team} (${t.w}-${t.l}), ${t.gp} game${t.gp === 1 ? '' : 's'}: offense ${one(t.off)} points per 100 possessions${rank('off', true, true)}, defense ${one(t.def)} allowed${rank('def', false)}, net ${signed(t.net)}${rank('net', true)}, pace ${one(t.pace)}`;
}

// Who played in a game, from its box score (Oct 23 2026, founder: Gary needs "what happened last game" and the most
// recent data, not only a season's accumulation; the NBA's version of the Bears' backup-quarterback games is the
// nights a star sat). Each of the newest games lists the minutes and points of the eight who played most, and anyone
// who played 20+ minutes in another of these games but not this one.
const BOX_GAMES = 5;
const minutesOf = (p) => parseInt(String(p?.min ?? '0'), 10) || 0;
async function boxSide(g, teamId) {
  const date = String(g.date || g.datetime || '').slice(0, 10);
  const boxes = await ballDontLieService.getNbaBoxScores(date, 24 * 60).catch(() => null);
  const box = (boxes || []).find((b) => b.id === g.id)
    || (boxes || []).find((b) => [b.home_team?.id, b.visitor_team?.id].includes(teamId) && [b.home_team?.id, b.visitor_team?.id].includes(g.home_team?.id === teamId ? g.visitor_team?.id : g.home_team?.id));
  if (!box) return null;
  const side = box.home_team?.id === teamId ? box.home_team : box.visitor_team;
  return (side?.players || []).map((p) => ({ name: `${p.player?.first_name} ${p.player?.last_name}`, min: minutesOf(p), pts: Number(p.pts) || 0 }));
}
function whoPlayed(box, others) {
  if (!box) return '      who played: box score not on file';
  const played = box.filter((p) => p.min > 0).sort((a, b) => b.min - a.min);
  const missed = [...new Set(others.flatMap((o) => (o || []).filter((p) => p.min >= 20).map((p) => p.name)))]
    .filter((nm) => !played.some((p) => p.name === nm));
  return `      minutes: ${played.slice(0, 8).map((p) => `${p.name} ${p.min} (${p.pts} pts)`).join(', ')}${missed.length ? `\n      did not play: ${missed.join(', ')}` : ''}`;
}

/** THIS SEASON GAME BY GAME: each finished game before `before`, newest first, with the opponent's record now; the
 * newest BOX_GAMES with who played. */
export async function gameByGame(team, league, before = new Date(), season = nbaSeason()) {
  const teams = await ballDontLieService.getTeams('basketball_nba');
  const t = findTeam(teams, team);
  if (!t) return `${team}: games not on file.`;
  const games = (await ballDontLieService.getGames('basketball_nba', { team_ids: [t.id], seasons: [season], per_page: 100, paginateAll: true }) || [])
    .filter((g) => /final/i.test(String(g.status || '')) && g.home_team_score != null && g.visitor_team_score != null
      && Date.parse(g.datetime || g.date) < new Date(before).getTime())
    .sort((a, b) => Date.parse(b.datetime || b.date) - Date.parse(a.datetime || a.date));
  if (!games.length) return `${team}: no games played yet this season.`;
  const boxes = await Promise.all(games.slice(0, BOX_GAMES).map((g) => boxSide(g, t.id).catch(() => null)));
  const rows = games.map((g, i) => {
    const home = g.home_team?.id === t.id;
    const opp = home ? g.visitor_team?.full_name : g.home_team?.full_name;
    const us = home ? g.home_team_score : g.visitor_team_score; const them = home ? g.visitor_team_score : g.home_team_score;
    const rec = league[opp] ? ` (${league[opp].w}-${league[opp].l})` : '';
    const line = `  ${etDay(g.datetime || `${g.date}T16:00:00Z`)} · ${home ? 'vs' : '@'} ${opp}${rec} · ${us > them ? 'W' : 'L'} ${us}-${them}${g.postseason ? ' (postseason)' : ''}`;
    return i < BOX_GAMES ? `${line}\n${whoPlayed(boxes[i], boxes.filter((_, k) => k !== i))}` : line;
  });
  return [`${team}, newest first:`, ...rows].join('\n');
}
