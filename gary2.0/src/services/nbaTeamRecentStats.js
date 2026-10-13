/**
 * A team's last N games, per-game team and opponent averages, from BDL box scores (Oct 13 2026). The research
 * tool fetch_team_recent_stats read these from Tank01, whose subscription lapsed (403 / 429 since); this keeps the
 * tool's shape on the licensed source. BDL box scores carry no paint, fast-break or points-off-turnover split, so
 * those fields are absent rather than zero. Possessions are the standard estimate (FGA - OREB + TOV + 0.44 x FTA).
 */
import { ballDontLieService } from './ballDontLieService.js';
import { findTeam } from './agentic/scoutReport/shared/utilities.js';
import { nbaSeason } from '../utils/dateUtils.js';

const FIELDS = ['pts', 'fgm', 'fga', 'fg3m', 'fg3a', 'ftm', 'fta', 'oreb', 'dreb', 'reb', 'ast', 'turnover', 'stl', 'blk', 'pf'];
const etDay = (instant) => new Date(instant).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const pct = (made, tried) => (tried > 0 ? ((made / tried) * 100).toFixed(1) : 'N/A');
const avg = (rows, key) => (rows.length ? (rows.reduce((s, r) => s + r[key], 0) / rows.length).toFixed(1) : 'N/A');
const total = (rows, key) => rows.reduce((s, r) => s + r[key], 0);
const possessions = (b) => b.fga - b.oreb + b.turnover + 0.44 * b.fta;

function boxOf(rows) {
  const box = Object.fromEntries(FIELDS.map((f) => [f, 0]));
  for (const row of rows) for (const f of FIELDS) box[f] += Number(row[f]) || 0;
  return box;
}

/**
 * @param {string} team  an abbreviation ("BOS") or a team name
 * @param {number} numGames  1, 3, 5 or 10
 * @param {string} [dateStr]  the game's ET date (YYYY-MM-DD); only games before it count
 */
export async function fetchNbaTeamRecentStats(team, numGames = 5, dateStr) {
  const teams = await ballDontLieService.getTeams('basketball_nba');
  const wanted = String(team || '').trim();
  const club = teams.find((t) => t.abbreviation === wanted.toUpperCase()) || findTeam(teams, wanted);
  if (!club) return { team: wanted, error: `Team "${wanted}" not found`, games: 0 };
  const before = dateStr || etDay(Date.now());
  const season = nbaSeason(new Date(`${before}T12:00:00Z`));
  const games = (await ballDontLieService.getGames('basketball_nba', { team_ids: [club.id], seasons: [season], per_page: 100, paginateAll: true }))
    .filter((g) => /final/i.test(String(g.status || '')) && String(g.date).slice(0, 10) < before)
    .sort((a, b) => Date.parse(b.datetime || b.date) - Date.parse(a.datetime || a.date))
    .slice(0, numGames);
  if (!games.length) return { team: club.abbreviation, error: `No completed ${season}-${String(season + 1).slice(2)} games before ${before}`, games: 0 };

  const stats = await ballDontLieService.getNbaGameStats(games.map((g) => g.id));
  const log = games.map((g) => {
    const rows = stats.filter((s) => s.game?.id === g.id);
    const isHome = g.home_team?.id === club.id;
    return {
      date: String(g.date).slice(0, 10),
      opp: isHome ? g.visitor_team?.abbreviation : g.home_team?.abbreviation,
      isHome,
      team: boxOf(rows.filter((s) => s.team?.id === club.id)),
      opponent: boxOf(rows.filter((s) => s.team?.id !== club.id)),
      hasBox: rows.length > 0,
    };
  }).filter((g) => g.hasBox);
  if (!log.length) return { team: club.abbreviation, error: 'No box scores available', games: 0 };

  const mine = log.map((g) => g.team);
  const theirs = log.map((g) => g.opponent);
  const efg = (rows) => pct(total(rows, 'fgm') + 0.5 * total(rows, 'fg3m'), total(rows, 'fga'));
  const pace = log.map((g) => (possessions(g.team) + possessions(g.opponent)) / 2);
  return {
    team: club.abbreviation,
    period: `L${numGames}`,
    games: log.length,
    source: 'BDL box scores',
    dateRange: { first: log[log.length - 1].date, last: log[0].date },
    opponents: log.map((g) => g.opp),
    ppg: avg(mine, 'pts'),
    fgPct: pct(total(mine, 'fgm'), total(mine, 'fga')),
    fg3Pct: pct(total(mine, 'fg3m'), total(mine, 'fg3a')),
    ftPct: pct(total(mine, 'ftm'), total(mine, 'fta')),
    efgPct: efg(mine),
    fga: avg(mine, 'fga'),
    fg3a: avg(mine, 'fg3a'),
    fta: avg(mine, 'fta'),
    reb: avg(mine, 'reb'),
    oreb: avg(mine, 'oreb'),
    dreb: avg(mine, 'dreb'),
    ast: avg(mine, 'ast'),
    tov: avg(mine, 'turnover'),
    stl: avg(mine, 'stl'),
    blk: avg(mine, 'blk'),
    pace: (pace.reduce((s, p) => s + p, 0) / pace.length).toFixed(1),
    netMargin: ((total(mine, 'pts') - total(theirs, 'pts')) / log.length).toFixed(1),
    opp: {
      ppg: avg(theirs, 'pts'),
      fgPct: pct(total(theirs, 'fgm'), total(theirs, 'fga')),
      fg3Pct: pct(total(theirs, 'fg3m'), total(theirs, 'fg3a')),
      efgPct: efg(theirs),
      reb: avg(theirs, 'reb'),
      oreb: avg(theirs, 'oreb'),
      ast: avg(theirs, 'ast'),
      tov: avg(theirs, 'turnover'),
    },
    gameLog: log.map((g) => ({
      date: g.date,
      opp: g.opp,
      isHome: g.isHome,
      pts: g.team.pts,
      oppPts: g.opponent.pts,
      fgPct: pct(g.team.fgm, g.team.fga),
      fg3Pct: pct(g.team.fg3m, g.team.fg3a),
      pace: ((possessions(g.team) + possessions(g.opponent)) / 2).toFixed(1),
      tov: g.team.turnover,
    })),
  };
}
