import { nhlSeason } from '../../utils/dateUtils.js';

// Shared BDL normalization; one module instance owns all associated state.
function _normalizeGame(sportKey, game) {
  if (!game) return game;
  if (sportKey === 'icehockey_nhl') {
    game.date = game.game_date;
    game.status = game.game_state;
    game.home_team_score = game.home_score;
    game.visitor_team_score = game.away_score;
    if (game.away_team && !game.visitor_team) game.visitor_team = game.away_team;
    for (const team of [game.home_team, game.away_team, game.visitor_team]) {
      if (team?.full_name && !team.name) team.name = team.full_name.split(' ').pop();
    }
  }
  if (sportKey === 'basketball_ncaab') {
    game.home_team_score = game.home_score;
    game.visitor_team_score = game.away_score;
    // BDL NCAAB uses visitor_team, normalize to away_team for consistency
    if (game.visitor_team && !game.away_team) game.away_team = game.visitor_team;
    if (game.away_team && !game.visitor_team) game.visitor_team = game.away_team;
  }
  return game;
}

function getCurrentNhlSeason() {
  return nhlSeason();
}

function normalizeName(value) {
  if (!value) return '';
  let s = String(value).toLowerCase();
  s = s.replace(/\buniv\.?\b/g, 'university');
  s = s.replace(/[^a-z0-9\s]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

export { _normalizeGame, getCurrentNhlSeason, normalizeName };
