import { renderStatEvidence } from '../orchestrator/statEvidence.js';
import { ballDontLieService } from '../../ballDontLieService.js';

/**
 * Check if Gary has investigated enough to proceed to bilateral cases.
 * Based on tool call breadth and iteration count.
 *
 * @param {Array} toolCallHistory - Array of tool calls with token property
 * @param {number} iteration - Current iteration number
 * @returns {Object} - { sufficient: boolean, categoryCount: number, totalCalls: number }
 */
export function isInvestigationSufficient(toolCallHistory, iteration) {
  // Count unique stat categories (base tokens without player-specific suffixes)
  const uniqueCategories = new Set(
    toolCallHistory
      .filter(t => t.token && t.quality !== 'unavailable')
      .map(t => t.token.split(':')[0])
  );
  const categoryCount = uniqueCategories.size;
  const totalCalls = toolCallHistory.length;

  // Investigation is sufficient when:
  // - 6+ unique categories at any point, OR
  // - 4+ unique categories after 5+ iterations (time-based safety)
  const sufficient = categoryCount >= 6 || (iteration >= 5 && categoryCount >= 4);

  return { sufficient, categoryCount, totalCalls };
}

// ═══════════════════════════════════════════════════════════════════════════
// STAT SUMMARIZATION (Signal-to-Noise Optimization)
// ═══════════════════════════════════════════════════════════════════════════
// Convert raw JSON stat responses to natural language summaries.
// This reduces context size by ~70% and helps the model REASON about
// basketball instead of PARSING JSON brackets.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Summarize a stat result into natural language for the model
 * @param {Object} statResult - Raw stat result from statRouter
 * @param {string} statToken - The stat token (e.g., 'NET_RATING', 'RECENT_FORM')
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @returns {string} Natural language summary
 */
export function summarizeStatForContext(statResult, statToken, homeTeam, awayTeam) {
  return renderStatEvidence(statResult, statToken, homeTeam, awayTeam);
}

export function formatNum(val) {
  if (val === undefined || val === null) return 'N/A';
  if (typeof val === 'number') return val.toFixed(1);
  return String(val);
}


export function formatPct(val) {
  if (val === undefined || val === null) return 'N/A';
  if (typeof val === 'number') {
    return val > 1 ? `${val.toFixed(1)}%` : `${(val * 100).toFixed(1)}%`;
  }
  return String(val);
}

/**
 * Summarize player game logs into natural language - preserving FULL game-by-game detail
 * @param {string} playerName - Player name
 * @param {Array|Object} logs - Game logs array or object
 * @returns {string} Natural language summary
 */
export function summarizePlayerGameLogs(playerName, logs) {
  if (!logs || (Array.isArray(logs) && logs.length === 0)) {
    return `${playerName} GAME LOGS: No recent games found`;
  }
  
  const gamesArray = Array.isArray(logs) ? logs : (logs.games || logs.data || [logs]);
  if (gamesArray.length === 0) {
    return `${playerName} GAME LOGS: No recent games found`;
  }
  
  try {
    // Game-by-game breakdown with opponent context
    const gameByGame = gamesArray.slice(0, 20).map(g => {
      const pts = g.pts || g.points || 0;
      const reb = g.reb || g.rebounds || g.total_rebounds || 0;
      const ast = g.ast || g.assists || 0;
      const opp = g.opponent || g.vs || g.matchup || '';
      const loc = g.isHome === false ? '@' : (g.isHome === true ? 'vs' : '');
      return `${pts}/${reb}/${ast}${opp ? ` ${loc}${opp}` : ''}`;
    });
    
    // Calculate averages
    let totalPts = 0, totalReb = 0, totalAst = 0;
    for (const game of gamesArray.slice(0, 20)) {
      totalPts += game.pts || game.points || 0;
      totalReb += game.reb || game.rebounds || game.total_rebounds || 0;
      totalAst += game.ast || game.assists || 0;
    }
    const gamesCount = Math.min(gamesArray.length, 20);
    const avgPts = (totalPts / gamesCount).toFixed(1);
    const avgReb = (totalReb / gamesCount).toFixed(1);
    const avgAst = (totalAst / gamesCount).toFixed(1);
    
    return `${playerName} GAME LOGS (Last ${gamesCount}): Avg ${avgPts}/${avgReb}/${avgAst} (PTS/REB/AST). Games: ${gameByGame.join(', ')}`;
  } catch (e) {
    return `${playerName} GAME LOGS: Data unavailable (parsing error)`;
  }
}

/**
 * Summarize MLB player game stats into a natural language line. The basketball
 * shape (pts/reb/ast) doesn't fit MLB, so we detect pitcher vs batter by which
 * fields are populated and emit the appropriate stat line.
 *
 * @param {string} playerName
 * @param {Array} stats - Records from BDL getMlbGameStats (flat shape: ip, er,
 *   p_hits, p_k, p_bb, p_hr, games_started, at_bats, hits, hr, rbi, bb, k, ...)
 * @returns {string}
 */
export function summarizeMlbPlayerGameLogs(playerName, stats) {
  return renderStatEvidence({ player: playerName, games: stats }, 'MLB_PLAYER_GAME_LOGS');
}

export function summarizeNbaPlayerAdvancedStats(stats, statType, teamName) {
  if (!stats || !Array.isArray(stats) || stats.length === 0) {
    return `${teamName} ${statType} STATS: No data available`;
  }

  try {
    // Signed format for ratings (shows +/- prefix)
    const signed = (val) => {
      if (val === undefined || val === null) return 'N/A';
      if (typeof val === 'number') return val >= 0 ? `+${val.toFixed(1)}` : val.toFixed(1);
      return String(val);
    };

    const lines = stats.map(entry => {
      const name = entry.player
        ? `${entry.player.first_name} ${entry.player.last_name}`
        : `Player #${entry.player_id || '?'}`;
      const s = entry.stats || entry;

      switch (statType) {
        case 'ADVANCED':
          return `${name}: eFG ${formatPct(s.efg_pct)} | TS ${formatPct(s.ts_pct)} | ORtg ${formatNum(s.off_rating)} | DRtg ${formatNum(s.def_rating)} | NetRtg ${signed(s.net_rating)} | USG ${formatPct(s.usg_pct)} | PIE ${formatPct(s.pie)}`;

        case 'USAGE':
          return `${name}: USG ${formatPct(s.usg_pct)} | %PTS ${formatPct(s.pct_pts)} | %FGA ${formatPct(s.pct_fga)} | %REB ${formatPct(s.pct_reb)} | %AST ${formatPct(s.pct_ast)} | %TOV ${formatPct(s.pct_tov)}`;

        case 'DEFENSIVE':
          return `${name}: DRtg ${formatNum(s.def_rating)} | STL ${formatNum(s.stl)} | BLK ${formatNum(s.blk)} | DREB ${formatNum(s.dreb)} | PF ${formatNum(s.pf)}`;

        case 'TRENDS':
        default:
          return `${name}: PTS ${formatNum(s.pts)} | REB ${formatNum(s.reb)} | AST ${formatNum(s.ast)} | FG% ${formatPct(s.fg_pct)} | 3P% ${formatPct(s.fg3_pct)} | FT% ${formatPct(s.ft_pct)} | MIN ${formatNum(s.min)}`;
      }
    });

    return `${teamName} ${statType} STATS (${stats.length} players):\n${lines.join('\n')}`;
  } catch (e) {
    return `${teamName} ${statType} STATS: Data unavailable (parsing error: ${e.message})`;
  }
}

/**
 * Summarize player stats into natural language
 * @param {Object} statResult - Raw stat result
 * @param {string} statType - Type of stat (e.g., 'RUSHING', 'PASSING')
 * @param {string} teamName - Team name
 * @returns {string} Natural language summary
 */
export function summarizePlayerStats(statResult, statType, teamName) {
  return renderStatEvidence(statResult, statType, teamName);
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT PRUNING (Attention Decay Prevention)
// ═══════════════════════════════════════════════════════════════════════════

export const MAX_CONTEXT_MESSAGES = 20; // Target max messages during analysis

export const PRUNE_AFTER_ITERATION = 4; // Start pruning at iteration 4

/**
 * Prune message history to prevent context bloat
 * SMART PRUNING: Keeps tool response messages (stat data) from the middle,
 * only drops assistant analysis text (which is summarized in toolCallHistory anyway).
 * This prevents Gary from re-requesting stats he already fetched.
 * @param {Array} messages - Current message array
 * @param {number} iteration - Current iteration number
 * @returns {Array} Pruned message array
 */
export function pruneContextIfNeeded(messages, iteration) {
  // Preserve the complete evidence and its reasoning history. Provider context
  // limits must fail visibly, not remove an earlier report or its qualifiers.
  return messages;
}

/**
 * Normalize sport to league name
 */
export function normalizeSportToLeague(sport) {
  const mapping = {
    'basketball_nba': 'NBA',
    'americanfootball_nfl': 'NFL',
    'icehockey_nhl': 'NHL',
    'basketball_ncaab': 'NCAAB',
    'americanfootball_ncaaf': 'NCAAF',
    'baseball_mlb': 'MLB',
    'soccer_world_cup': 'WC',
    'NBA': 'NBA',
    'NFL': 'NFL',
    'NHL': 'NHL',
    'NCAAB': 'NCAAB',
    'NCAAF': 'NCAAF',
    'MLB': 'MLB',
    'WC': 'WC'
  };
  return mapping[sport] || sport;
}

// Canonical research briefing categories used by tests and planning prompts.
export const RESEARCH_BRIEFING_FACTORS = Object.freeze({
  basketball_nba: Object.freeze([
    'pace_and_efficiency',
    'shooting_profile',
    'rebounding_and_turnovers',
    'injuries_and_rotations',
    'schedule_and_rest'
  ]),
  americanfootball_nfl: Object.freeze([
    'epa_and_success_rate',
    'explosiveness_and_red_zone',
    'trenches_and_pressure',
    'injuries_and_usage',
    'weather_and_game_script'
  ]),
  icehockey_nhl: Object.freeze([
    'expected_goals_and_shot_quality',
    'special_teams',
    'goalie_form',
    'line_matchups',
    'travel_and_rest'
  ]),
  basketball_ncaab: Object.freeze([
    'tempo_and_efficiency',
    'shot_selection',
    'rebounding_and_turnovers',
    'foul_and_free_throw_profile',
    'injuries_and_depth'
  ]),
  americanfootball_ncaaf: Object.freeze([
    'sp_plus_and_efficiency',
    'explosiveness_and_havoc',
    'line_play_and_pressure',
    'injuries_and_depth_chart',
    'situational_and_travel'
  ]),
  soccer_world_cup: Object.freeze([
    'form_and_recent_results',
    'attacking_and_xg',
    'defensive_solidity',
    'lineups_injuries_suspensions',
    'tournament_context_and_fatigue'
  ])
});


