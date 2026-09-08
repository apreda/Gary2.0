import { ballDontLieService } from './ballDontLieService.js';
import { footballSeasonForDate, nflSeasonTypeForGame } from './agentic/scoutReport/sports/footballSeason.js';

const PERFORMANCE_FIELDS = ['total_points_per_game', 'opp_total_points_per_game', 'rushing_yards_per_game', 'net_passing_yards_per_game'];

export function hasSubstantiveNflSeasonStats(row) {
  return !!row && !Array.isArray(row) && PERFORMANCE_FIELDS.some(field => {
    const value = row[field];
    return value != null && value !== '' && Number.isFinite(Number(value)) && Number(value) > 0;
  });
}

function exactRow(rows, teamId) {
  const matches = (Array.isArray(rows) ? rows : rows ? [rows] : []).filter(row =>
    String(row?.team?.id ?? row?.team_id ?? '') === String(teamId));
  return matches.length === 1 ? matches[0] : null;
}

function usableStats(row, season, completedGames = null) {
  if (!hasSubstantiveNflSeasonStats(row)) return false;
  if ('season' in row && row.season != null && Number(row.season) !== season) return false;
  if ('season_type' in row && row.season_type != null && Number(row.season_type) !== 2) return false;
  if ('postseason' in row && (row.postseason === true || row.postseason === 'true')) return false;
  const sample = row.games_played == null ? null : Number(row.games_played);
  if (sample !== null && (!Number.isInteger(sample) || sample <= 0)) return false;
  return completedGames === null || (completedGames > 0 && sample > 0 && sample <= completedGames);
}

/** Exact team, season and phase; future rows cannot establish completed form. */
export function eligibleNflRegularGames(games, teamId, season, { before = Date.now(), completedOnly = true } = {}) {
  const cutoff = new Date(before).getTime();
  const seen = new Set();
  return (games || []).filter(game => {
    const date = game?.date || game?.datetime || game?.commence_time;
    const kickoff = Date.parse(date || '');
    const ids = [game?.home_team?.id ?? game?.home_team_id,
      game?.visitor_team?.id ?? game?.away_team?.id ?? game?.visitor_team_id ?? game?.away_team_id];
    if (game?.id == null || seen.has(String(game.id)) || !Number.isFinite(kickoff) || !Number.isFinite(cutoff)
        || Number(game.season) !== Number(season) || !ids.some(id => String(id) === String(teamId))
        || nflSeasonTypeForGame(game, date) !== 2) return false;
    const status = String(game.status_state || game.status || '').trim().toLowerCase();
    if (completedOnly && (kickoff >= cutoff || !(/^final(?:\b|\/)/.test(status) || ['post', 'complete', 'completed'].includes(status)))) return false;
    seen.add(String(game.id));
    return true;
  });
}

export async function fetchNflTeamBaseline(teamId, requestedSeason, { before = Date.now() } = {}) {
  const asOf = new Date(before);
  const currentSeason = footballSeasonForDate('NFL', asOf);
  const requested = Number(requestedSeason);
  const unavailable = { stats: null, season: null, scope: null, label: 'Verified NFL regular-season baseline unavailable', currentRegularGamesPlayed: null };
  if (!Number.isInteger(requested) || requested > currentSeason || !teamId) return unavailable;
  const month = Number(new Intl.DateTimeFormat('en-US', {timeZone:'America/New_York',month:'numeric'}).format(asOf));
  let selectedSeason = requested === currentSeason && month === 8 ? requested - 1 : requested;
  const read = async season => exactRow(await ballDontLieService.getTeamSeasonStats('americanfootball_nfl', {
    teamId, season, postseason:false
  }), teamId);
  let stats = await read(selectedSeason);
  let completed = null;
  if (requested === currentSeason) {
    completed = selectedSeason === requested
      ? eligibleNflRegularGames(await ballDontLieService.getGames('americanfootball_nfl', {
        team_ids:[teamId],seasons:[requested],per_page:100
      }).catch(() => []), teamId, requested, {before}).length : 0;
  }
  if (!usableStats(stats, selectedSeason, selectedSeason === currentSeason ? completed : null)) {
    if (selectedSeason === currentSeason) {
      selectedSeason = requested - 1;
      stats = await read(selectedSeason);
    }
    if (!usableStats(stats, selectedSeason)) return {...unavailable,currentRegularGamesPlayed:completed};
  }
  const prior = selectedSeason < currentSeason;
  return { stats, season:selectedSeason,
    scope:prior ? 'prior_completed_regular_season' : 'current_regular_season',
    label:prior ? `${selectedSeason} prior completed regular-season baseline (not current-season form)` : `${selectedSeason} current regular season`,
    currentRegularGamesPlayed:completed };
}

export async function fetchNflTeamBaselinePair(bdlSport, home, away, season, options = {}) {
  if (bdlSport !== 'americanfootball_nfl') {
    const rows = await Promise.all([home,away].map(team => ballDontLieService.getTeamSeasonStats(bdlSport, {teamId:team.id,season,postseason:false})));
    return {homeStats:exactRow(rows[0],home.id),awayStats:exactRow(rows[1],away.id),baselines:null};
  }
  const [h,a] = await Promise.all([home,away].map(team => fetchNflTeamBaseline(team.id,season,options)));
  const provenance = b => ({season:b.season,scope:b.scope,label:b.label,games_played:b.stats?.games_played ?? null,
    current_regular_games_played:b.currentRegularGamesPlayed});
  return {homeStats:h.stats,awayStats:a.stats,baselines:{home:provenance(h),away:provenance(a)}};
}
