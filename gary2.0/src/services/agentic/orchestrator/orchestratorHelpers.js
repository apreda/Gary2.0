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
  if (!statResult) return `${statToken}: No data available`;

  try {
    const { home, away, homeValue, awayValue } = statResult;
    const h = home || homeValue || {};
    const a = away || awayValue || {};

    // Randomize team presentation order to prevent primacy bias
    const homeFirst = Math.random() < 0.5;
    const orderTeams = (label, homeStr, awayStr, suffix) => {
      const line = homeFirst
        ? `${label}: ${homeTeam} ${homeStr} | ${awayTeam} ${awayStr}`
        : `${label}: ${awayTeam} ${awayStr} | ${homeTeam} ${homeStr}`;
      return suffix ? `${line} ${suffix}` : line;
    };

    switch (statToken) {
      case 'NET_RATING':
        return orderTeams('NET RATING',
          formatNum(h.net_rating || h.netRating),
          formatNum(a.net_rating || a.netRating));

      case 'OFFENSIVE_RATING':
        return orderTeams('OFFENSIVE RATING',
          formatNum(h.offensive_rating || h.off_rating || h.offRating),
          formatNum(a.offensive_rating || a.off_rating || a.offRating),
          '(points per 100 possessions)');

      case 'DEFENSIVE_RATING':
        return orderTeams('DEFENSIVE RATING',
          formatNum(h.defensive_rating || h.def_rating || h.defRating),
          formatNum(a.defensive_rating || a.def_rating || a.defRating));

      case 'RECENT_FORM': {
        // NHL returns l5/l10 objects; other sports return summary/last_5 strings
        const awayForm = a.summary || a.last_5 || (a.l5?.record ? `${a.l5.record} (L5)` : 'N/A');
        const homeForm = h.summary || h.last_5 || (h.l5?.record ? `${h.l5.record} (L5)` : 'N/A');
        return orderTeams('RECENT FORM (Last 5)', homeForm, awayForm);
      }

      case 'HOME_AWAY_SPLITS':
        // Records are descriptive — Gary should investigate the causal data behind them
        // NHL uses road_record; other sports use away_record
        return orderTeams('HOME/AWAY SPLITS',
          `home ${h.home_record || h.record || 'N/A'}`,
          `road ${a.road_record || a.away_record || a.record || 'N/A'}`);

      case 'PACE':
        return orderTeams('PACE',
          formatNum(h.pace),
          formatNum(a.pace),
          'possessions/game');

      case 'EFG_PCT':
        return orderTeams('EFFECTIVE FG%',
          formatPct(h.efg_pct || h.eFG),
          formatPct(a.efg_pct || a.eFG));

      case 'TURNOVER_RATE':
        return orderTeams('TURNOVER RATE',
          formatPct(h.tov_rate || h.tovRate),
          formatPct(a.tov_rate || a.tovRate));

      case 'OREB_RATE':
        return orderTeams('OFFENSIVE REBOUND RATE',
          formatPct(h.oreb_pct || h.oreb_rate || h.orebRate),
          formatPct(a.oreb_pct || a.oreb_rate || a.orebRate));

      case 'THREE_PT_SHOOTING':
        return orderTeams('3PT SHOOTING',
          `${formatPct(h.three_pct || h.fg3_pct || h.threePct)} on ${formatNum(h.three_attempted_per_game || h.fg3a || h.threeAttempts)} attempts`,
          `${formatPct(a.three_pct || a.fg3_pct || a.threePct)} on ${formatNum(a.three_attempted_per_game || a.fg3a || a.threeAttempts)} attempts`);

      case 'PAINT_SCORING':
        return orderTeams('PAINT SCORING',
          `${formatPct(h.pct_paint || h.paint_ppg || h.value)} of scoring in paint`,
          `${formatPct(a.pct_paint || a.paint_ppg || a.value)} of scoring in paint`);
      case 'PAINT_DEFENSE':
        return orderTeams('PAINT DEFENSE',
          `${formatNum(h.opp_pts_paint || h.paint_ppg || h.value)} opp PPG in paint`,
          `${formatNum(a.opp_pts_paint || a.paint_ppg || a.value)} opp PPG in paint`);
      
      case 'H2H_HISTORY':
        // Preserve FULL context: dates, scores, margins, revenge status, sweep context, PERSONNEL
        const h2hGames = statResult.meetings_this_season || statResult.games || statResult.h2h || [];
        if (h2hGames.length === 0) {
          return `H2H HISTORY: No matchups this season. ${statResult.IMPORTANT || 'Check Scout Report for prior season data.'}`;
        }
        // Include personnel notes (DNPs, top scorers) so Gary sees WHO PLAYED in each H2H game
        const h2hDetails = h2hGames.slice(0, 5).map(g => {
          const date = g.date || 'N/A';
          const result = g.result || g.score || 'N/A';
          const personnel = g.personnel_note && g.personnel_note !== '(Box score unavailable)' 
            ? ` [${g.personnel_note}]` 
            : '';
          return `${date}: ${result}${personnel}`;
        }).join(' | ');
        const seriesRecord = statResult.this_season_record || '';
        const revengeNote = statResult.revenge_note || '';
        
        // Include sweep context if detected (NBA-specific trap detection)
        const sweepContext = statResult.sweep_context;
        let sweepContextStr = '';
        if (sweepContext?.triggered) {
          const marginInfo = sweepContext.margin_context ? ` ${sweepContext.margin_context}` : '';
          sweepContextStr = ` | ${sweepContext.sweep_note}${marginInfo}`;
        }
        
        // Add CONDITIONS CHANGED context if detected
        const conditionsChanged = statResult.conditions_changed_context;
        let conditionsChangedStr = '';
        if (conditionsChanged?.triggered) {
          conditionsChangedStr = ` | ${conditionsChanged.note}`;
        }
        
        return `H2H HISTORY (${h2hGames.length} games this season): ${seriesRecord}. Meetings: ${h2hDetails}${revengeNote ? ` [REVENGE: ${revengeNote}]` : ''}${sweepContextStr}${conditionsChangedStr}`;
      
      case 'CLUTCH_STATS':
        return orderTeams('CLUTCH PERFORMANCE',
          `${h.clutch_record || 'N/A'} (Net ${h.clutch_net_rating || 'N/A'}, Rank ${h.clutch_net_rank || 'N/A'}, eFG ${h.clutch_efg_pct || 'N/A'})`,
          `${a.clutch_record || 'N/A'} (Net ${a.clutch_net_rating || 'N/A'}, Rank ${a.clutch_net_rank || 'N/A'}, eFG ${a.clutch_efg_pct || 'N/A'})`);

      case 'BENCH_DEPTH':
        return orderTeams('BENCH DEPTH',
          `bench ${formatNum(h.bench_ppg || h.value)} PPG (${h.bench_pct || ''} of scoring, ${h.rotation_size || '?'}-man rotation${h.top_bench ? ', top bench: ' + h.top_bench : ''})`,
          `bench ${formatNum(a.bench_ppg || a.value)} PPG (${a.bench_pct || ''} of scoring, ${a.rotation_size || '?'}-man rotation${a.top_bench ? ', top bench: ' + a.top_bench : ''})`);

      case 'REST_SITUATION':
        return orderTeams('REST',
          `${h.days_rest ?? 'N/A'} days rest${h.is_b2b ? ' (B2B)' : ''}`,
          `${a.days_rest ?? 'N/A'} days rest${a.is_b2b ? ' (B2B)' : ''}`);
      
      case 'PLAYER_GAME_LOGS':
        // Preserve FULL game-by-game breakdown for Gary to interpret
        const player = statResult.player || statResult.playerName || 'Player';
        const logs = statResult.games || statResult.logs || [];
        if (logs.length === 0) return `${player} GAME LOGS: No recent games`;
        
        // Show individual game scores and context
        const gameByGame = logs.slice(0, 20).map(g => {
          const pts = g.pts || g.points || 0;
          const reb = g.reb || g.rebounds || g.total_rebounds || 0;
          const ast = g.ast || g.assists || 0;
          const opp = g.opponent || g.vs || g.matchup || '';
          const loc = g.isHome === false ? '@' : (g.isHome === true ? 'vs' : '');
          return `${pts}/${reb}/${ast}${opp ? ` ${loc}${opp}` : ''}`;
        }).join(', ');
        
        // Calculate averages
        const avgPts = logs.reduce((sum, g) => sum + (g.pts || g.points || 0), 0) / logs.length;
        const avgReb = logs.reduce((sum, g) => sum + (g.reb || g.rebounds || g.total_rebounds || 0), 0) / logs.length;
        const avgAst = logs.reduce((sum, g) => sum + (g.ast || g.assists || 0), 0) / logs.length;
        
        return `${player} GAME LOGS (Last ${logs.length}): Avg ${avgPts.toFixed(1)}/${avgReb.toFixed(1)}/${avgAst.toFixed(1)} (PTS/REB/AST). Game-by-game: ${gameByGame}`;
      
      default:
        // For unknown/complex stats, preserve MORE fields (up to 8) for Gary to interpret
        const excludeKeys = ['home', 'away', 'homeValue', 'awayValue', 'category', 'note', 'IMPORTANT', 'error'];
        const topLevelKeys = Object.keys(statResult).filter(k => !excludeKeys.includes(k));
        
        if (topLevelKeys.length === 0) {
          // Try to extract from home/away structure
          const homeKeys = Object.keys(h);
          if (homeKeys.length > 0) {
            const summary = homeKeys.map(k => orderTeams(k, formatNum(h[k]), formatNum(a[k]))).join('; ');
            return `${statToken}: ${summary}`;
          }
          return `${statToken}: Data received but empty`;
        }
        
        // Show all fields for complex stats — no truncation
        const fieldSummaries = topLevelKeys.map(k => {
          const val = statResult[k];
          if (typeof val === 'object' && val !== null) {
            // Nested object - summarize its values
            const nestedKeys = Object.keys(val);
            return `${k}: {${nestedKeys.map(nk => `${nk}=${formatNum(val[nk])}`).join(', ')}}`;
          }
          return `${k}=${formatNum(val)}`;
        });
        
        // Include IMPORTANT note if present (for context warnings)
        const important = statResult.IMPORTANT ? ` [NOTE: ${statResult.IMPORTANT}]` : '';
        return `${statToken}: ${fieldSummaries.join(', ')}${important}`;
    }
  } catch (e) {
    // Honest about failure — never pretend data was received
    return `${statToken}: Data unavailable (parsing error)`;
  }
}

// Helper formatters
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
 * Summarize NBA player advanced stats into labeled text (prevents LLM misattribution)
 *
 * When Gary receives raw JSON with 10 players' stats, he misattributes numbers
 * to the wrong player. This function bakes player names into each stat line,
 * making misattribution impossible.
 *
 * @param {Array} stats - Raw array from getNbaSeasonAverages() — each item has { player: { first_name, last_name }, stats: { ... } }
 * @param {string} statType - ADVANCED, USAGE, DEFENSIVE, or TRENDS
 * @param {string} teamName - Team full name
 * @returns {string} Human-readable text with player names per line
 */
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
  if (!statResult || !statResult.data || statResult.data.length === 0) {
    return `${teamName} ${statType} STATS: No data available`;
  }
  
  try {
    const players = statResult.data.slice(0, 10); // Full rotation depth
    const summaries = players.map(p => {
      const name = p.player?.full_name || p.name || p.player_name || 'Unknown';
      // Extract key stats based on stat type
      const keyStats = [];
      
      if (statType.includes('RUSH') || statType.includes('rushing')) {
        if (p.rushing_yards) keyStats.push(`${p.rushing_yards} yds`);
        if (p.rushing_tds) keyStats.push(`${p.rushing_tds} TD`);
        if (p.yards_per_carry) keyStats.push(`${p.yards_per_carry} YPC`);
      } else if (statType.includes('PASS') || statType.includes('passing')) {
        if (p.passing_yards) keyStats.push(`${p.passing_yards} yds`);
        if (p.passing_tds) keyStats.push(`${p.passing_tds} TD`);
        if (p.interceptions) keyStats.push(`${p.interceptions} INT`);
      } else if (statType.includes('RECEIV') || statType.includes('receiving')) {
        if (p.receiving_yards) keyStats.push(`${p.receiving_yards} yds`);
        if (p.receptions) keyStats.push(`${p.receptions} rec`);
        if (p.receiving_tds) keyStats.push(`${p.receiving_tds} TD`);
      } else {
        // Generic: just grab first few numeric values
        const numericKeys = Object.keys(p).filter(k => typeof p[k] === 'number' && !k.includes('id'));
        for (const k of numericKeys.slice(0, 3)) {
          keyStats.push(`${k}: ${p[k]}`);
        }
      }
      
      return `${name}: ${keyStats.join(', ') || 'stats available'}`;
    });
    
    return `${teamName} ${statType} (Top ${players.length}): ${summaries.join(' | ')}`;
  } catch (e) {
    return `${teamName} ${statType} STATS: Data unavailable (parsing error)`;
  }
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
  if (iteration < PRUNE_AFTER_ITERATION || messages.length <= MAX_CONTEXT_MESSAGES) {
    return messages; // No pruning needed
  }

  // Always keep: system prompt (index 0) and user's initial query (index 1)
  const preserved = [messages[0], messages[1]];

  // Recent messages always kept (last 16 — active analysis window)
  const recentCount = MAX_CONTEXT_MESSAGES - 4;
  const recent = messages.slice(-recentCount);

  // Middle section: eligible for pruning
  const middle = messages.slice(2, -recentCount);

  // From middle, keep tool response messages (contain stat data Gary needs)
  // Drop assistant analysis and user nudge messages (insights are in toolCallHistory)
  const keptFromMiddle = middle.filter(m => {
    // Keep tool/function response messages (contain stat data)
    if (m.role === 'tool') return true;
    // Keep assistant messages that have tool_calls (stat request + response pairs)
    if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) return true;
    // Drop pure text assistant messages and user nudge messages
    return false;
  });

  const result = [...preserved, ...keptFromMiddle, ...recent];
  console.log(`[Orchestrator] Pruning context: ${messages.length} → ${result.length} messages (kept ${keptFromMiddle.length} tool exchanges from middle)`);
  return result;
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
    'baseball_mlb': 'WBC',
    'NBA': 'NBA',
    'NFL': 'NFL',
    'NHL': 'NHL',
    'NCAAB': 'NCAAB',
    'NCAAF': 'NCAAF',
    'WBC': 'WBC'
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
  ])
});


