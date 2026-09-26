/**
 * FCS AGAINST FBS (founder GO, Sep 25 2026, after Howard +41.5 at Rutgers:
 * the desk had no strength numbers for an FCS team; SP+, FPI and Elo cover
 * FBS only and BDL carries no FCS season stats). When an FCS team is on the
 * desk, print what a fan would look up to size the gap:
 *
 *   - that team's own games against FBS teams, this season and last, with
 *     scores and the opponent's conference;
 *   - every FCS team's results this season against Power-4 teams (ACC, Big
 *     12, Big Ten, SEC) and against the rest of FBS: record and average score.
 *
 * Facts from BDL's final game rows only. No projection, no margin for this
 * game. A source that does not answer leaves the section out.
 */
import { ballDontLieService } from '../../../ballDontLieService.js';
import { findTeam } from '../shared/utilities.js';

const SPORT = 'americanfootball_ncaaf';
// BDL conference ids: 1-11 are FBS (ACC, American, Big 12, Big Ten, CUSA,
// FBS Indep., MAC, Mountain West, Pac-12, SEC, Sun Belt); 12 and up are FCS.
const FBS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
const POWER4 = new Set([1, 3, 4, 10]);
const CONF_NAME = { 1: 'ACC', 2: 'American', 3: 'Big 12', 4: 'Big Ten', 5: 'CUSA', 6: 'FBS Independent', 7: 'MAC', 8: 'Mountain West', 9: 'Pac-12', 10: 'SEC', 11: 'Sun Belt' };

const conf = (team) => Number(team?.conference ?? team?.conference_id ?? team?.conference?.id);
const isFcs = (team) => Number.isFinite(conf(team)) && !FBS.has(conf(team));
const isFinal = (g) => g?.status_state === 'final' || g?.status === 'post';
const scored = (g) => Number.isFinite(Number(g?.home_score)) && Number.isFinite(Number(g?.away_score));
const day = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });

function teamLines(team, games) {
  const rows = (games || []).filter((g) => isFinal(g) && scored(g)).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const lines = [];
  for (const g of rows) {
    const home = String(g.home_team?.id) === String(team.id);
    const opp = home ? g.visitor_team : g.home_team;
    if (!FBS.has(conf(opp))) continue;
    const us = Number(home ? g.home_score : g.away_score), them = Number(home ? g.away_score : g.home_score);
    lines.push(`  ${g.season} ${day(g.date)} ${home ? 'vs' : 'at'} ${opp.full_name} (${CONF_NAME[conf(opp)] || 'FBS'}): ${us > them ? 'won' : us < them ? 'lost' : 'tied'} ${us}-${them}`);
  }
  return lines;
}

function crossover(games, fbsSet) {
  let w = 0, l = 0, fcsPts = 0, fbsPts = 0, n = 0;
  for (const g of games || []) {
    if (!isFinal(g) || !scored(g)) continue;
    const h = g.home_team, v = g.visitor_team;
    const fcsSide = isFcs(h) && fbsSet.has(conf(v)) ? 'home' : isFcs(v) && fbsSet.has(conf(h)) ? 'away' : null;
    if (!fcsSide) continue;
    const fcs = Number(fcsSide === 'home' ? g.home_score : g.away_score), fbs = Number(fcsSide === 'home' ? g.away_score : g.home_score);
    n += 1; fcsPts += fcs; fbsPts += fbs;
    if (fcs > fbs) w += 1; else l += 1;
  }
  if (!n) return null;
  const avg = (x) => (x / n).toFixed(1);
  return `${n} games, FCS ${w}-${l}, average score FBS ${avg(fbsPts)}, FCS ${avg(fcsPts)}`;
}

/** The desk section, or '' when neither team is FCS or nothing answered. */
export async function ncaafFcsGapSection({ homeTeam, awayTeam, season, service = ballDontLieService }) {
  try {
    const teams = await service.getTeams(SPORT);
    const sides = [findTeam(teams, awayTeam), findTeam(teams, homeTeam)].filter(Boolean);
    const fcsTeams = sides.filter(isFcs);
    if (!fcsTeams.length || sides.length < 2) return '';

    const blocks = [];
    for (const team of fcsTeams) {
      const games = await service.getGames(SPORT, { team_ids: [team.id], seasons: [season, season - 1], per_page: 100 }, 60).catch(() => []);
      const lines = teamLines(team, games);
      blocks.push(`${team.full_name} (FCS) against FBS teams, this season and last:\n${lines.length ? lines.join('\n') : '  no games against FBS teams in either season'}`);
    }
    const all = await service.getGames(SPORT, { seasons: [season], per_page: 100 }, 60).catch(() => []);
    const p4 = crossover(all, POWER4);
    const rest = crossover(all, new Set([...FBS].filter((c) => !POWER4.has(c))));
    if (p4 || rest) {
      blocks.push(`Every FCS team this season:\n${p4 ? `  against Power-4 teams (ACC, Big 12, Big Ten, SEC): ${p4}\n` : ''}${rest ? `  against the rest of FBS: ${rest}` : ''}`.trimEnd());
    }
    return blocks.join('\n\n');
  } catch (e) {
    console.warn(`[Scout Report] FCS section unavailable: ${e.message}`);
    return '';
  }
}
