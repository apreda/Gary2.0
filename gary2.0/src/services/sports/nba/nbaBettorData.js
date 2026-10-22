/**
 * THE NBA BETTOR'S DATA (Oct 21 2026, the NBA read): how good each team is per possession with its rank among the
 * league, and its season game by game, each cut at the moment of the pick. This season only (founder, Oct 13 2026: no
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

const rankOf = (league, team, key, high) => {
  const order = Object.entries(league).filter(([, t]) => Number.isFinite(t[key])).sort((a, b) => (high ? b[1][key] - a[1][key] : a[1][key] - b[1][key]));
  return order.findIndex(([name]) => name === team) + 1;
};

/** HOW GOOD THEY ARE for one team: its record and per-possession numbers with ranks among the teams that have played. */
export function strengthLine(league, team) {
  const t = league[team];
  if (!t) return `${team}: no games yet this season.`;
  const teams = Object.keys(league).length;
  return `${team} (${t.w}-${t.l}), ${t.gp} game${t.gp === 1 ? '' : 's'}: offense ${one(t.off)} points per 100 possessions (${ord(rankOf(league, team, 'off', true))} of ${teams}), defense ${one(t.def)} allowed (${ord(rankOf(league, team, 'def', false))}), net ${signed(t.net)} (${ord(rankOf(league, team, 'net', true))}), pace ${one(t.pace)}`;
}

/** THIS SEASON GAME BY GAME: each finished game before `before`, newest first, with the opponent's record now. */
export async function gameByGame(team, league, before = new Date(), season = nbaSeason()) {
  const teams = await ballDontLieService.getTeams('basketball_nba');
  const t = findTeam(teams, team);
  if (!t) return `${team}: games not on file.`;
  const games = (await ballDontLieService.getGames('basketball_nba', { team_ids: [t.id], seasons: [season], per_page: 100, paginateAll: true }) || [])
    .filter((g) => /final/i.test(String(g.status || '')) && g.home_team_score != null && g.visitor_team_score != null
      && Date.parse(g.datetime || g.date) < new Date(before).getTime())
    .sort((a, b) => Date.parse(b.datetime || b.date) - Date.parse(a.datetime || a.date));
  if (!games.length) return `${team}: no games played yet this season.`;
  const rows = games.map((g) => {
    const home = g.home_team?.id === t.id;
    const opp = home ? g.visitor_team?.full_name : g.home_team?.full_name;
    const us = home ? g.home_team_score : g.visitor_team_score; const them = home ? g.visitor_team_score : g.home_team_score;
    const rec = league[opp] ? ` (${league[opp].w}-${league[opp].l})` : '';
    return `  ${etDay(g.datetime || `${g.date}T16:00:00Z`)} · ${home ? 'vs' : '@'} ${opp}${rec} · ${us > them ? 'W' : 'L'} ${us}-${them}${g.postseason ? ' (postseason)' : ''}`;
  });
  return [`${team}, newest first:`, ...rows].join('\n');
}
