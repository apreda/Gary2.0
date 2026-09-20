import { ballDontLieService as bdl } from '../../../ballDontLieService.js';

const FIELDS = {
  QB: ['passing_attempts', 'passing_completions', 'passing_yards', 'passing_touchdowns',
    'passing_interceptions', 'passing_completion_pct', 'yards_per_pass_attempt', 'qb_rating', 'qbr',
    'rushing_attempts', 'rushing_yards', 'rushing_touchdowns'],
  RB: ['rushing_attempts', 'rushing_yards', 'yards_per_rush_attempt', 'rushing_touchdowns',
    'receiving_targets', 'receptions', 'receiving_yards', 'receiving_touchdowns'],
  RECEIVER: ['receiving_targets', 'receptions', 'receiving_yards', 'yards_per_reception',
    'receiving_touchdowns'],
};

function verifiedRows(rows, playerId, season, rosterSeason, completedGames) {
  return (rows || []).filter(row => String(row.player?.id) === String(playerId)
    && (row.season == null || Number(row.season) === season)
    && row.postseason !== true && row.postseason !== 'true'
    && (row.season_type == null || Number(row.season_type) === 2)
    && Number.isInteger(Number(row.games_played)) && Number(row.games_played) > 0
    && (season < rosterSeason || (Number.isInteger(completedGames)
      && Number(row.games_played) <= completedGames)));
}

/** Join current roster identities to individual stat rows, never team totals.
 * Depth is provider roster order, not a new availability/starter decision.
 * The scout's existing official starting-QB and injury handling remains owner.
 */
export async function nflRosterPlayerStats(team, rosterSeason, baseline, group) {
  const season = baseline?.season;
  const [roster, rows] = await Promise.all([
    bdl.getNflTeamRoster(team.id, rosterSeason),
    Number.isInteger(season) ? bdl.getNflSeasonStatsByTeam(team.id, season) : [],
  ]);
  const positions = group === 'RECEIVER' ? ['WR', 'TE'] : [group];
  const seen = new Set();
  const players = (roster || []).filter(entry => {
    const position = String(entry.position || entry.player?.position_abbreviation || '').toUpperCase().replace(/^WR-\d+$/, 'WR');
    const id = entry.player?.id;
    if (id == null || seen.has(String(id)) || !positions.includes(position)) return false;
    seen.add(String(id));
    return true;
  });
  return Promise.all(players.map(async entry => {
    const playerId = entry.player.id;
    let statsSeason = season;
    let matches = verifiedRows(rows, playerId, statsSeason, rosterSeason, baseline?.current_regular_games_played);
    // An offseason move must not erase the player's own prior-season line.
    // The by-player endpoint also distinguishes a rookie's absent row from zero.
    if (matches.length === 0 && Number.isInteger(season)) {
      statsSeason = rosterSeason - 1;
      matches = verifiedRows(await bdl.getNflPlayerSeasonStats({ playerId, season: statsSeason }),
        playerId, statsSeason, rosterSeason, baseline?.current_regular_games_played);
    }
    const row = matches.length === 1 ? matches[0] : null;
    const number = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
    return {
      player_id: playerId,
      name: entry.player_name || `${entry.player.first_name || ''} ${entry.player.last_name || ''}`.trim(),
      position: entry.position || entry.player.position_abbreviation,
      roster_team: team.full_name || team.name,
      roster_season: rosterSeason,
      roster_depth: entry.depth ?? null,
      stats_season: row ? statsSeason : null,
      stats_scope: row ? (statsSeason < rosterSeason ? 'prior_completed_regular_season' : 'current_regular_season') : 'unavailable',
      games_played: row ? Number(row.games_played) : null,
      stats: row ? Object.fromEntries(FIELDS[group].map(field => [field, number(row[field])])) : null,
      ...(!row ? { note: matches.length > 1 ? 'Ambiguous individual season rows; no line selected' : 'No verified individual regular-season line available' } : {}),
    };
  }));
}
