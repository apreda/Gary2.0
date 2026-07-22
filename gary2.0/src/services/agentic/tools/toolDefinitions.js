/**
 * LLM Function Calling Tool Definitions (Gemini)
 *
 * This defines the "menu" of stats Gary can request.
 * Each token maps to a specific data fetch in statRouters/index.js
 */

// NBA Stat Tokens
// NOTE: Only include tokens that have REAL fetchers - no misleading placeholders
const NBA_TOKENS = [
  // Standings & Records
  'STANDINGS', 'TEAM_RECORD', 'CONFERENCE_STANDING',
  'CONFERENCE_STATS',     // Conference record and performance
  'NON_CONF_STRENGTH',    // Non-conference record
  // Pace & Tempo
  'PACE', 'PACE_LAST_10', 'PACE_HOME_AWAY',
  // Efficiency
  'OFFENSIVE_RATING', 'DEFENSIVE_RATING', 'NET_RATING', 
  'EFFICIENCY_LAST_10',   // Points to EFFICIENCY_TREND
  'EFFICIENCY_TREND',     // L5 vs L10 vs season point differential
  // Four Factors (Offense)
  'EFG_PCT', 'TURNOVER_RATE', 'OREB_RATE', 'FT_RATE',
  // Four Factors (Defense) - Real opponent stats!
  'OPP_EFG_PCT',          // Opponent shooting efficiency (how well opponents shoot AGAINST them)
  'OPP_TOV_RATE',         // Forced turnovers (how many turnovers they CAUSE)
  'OPP_FT_RATE',          // Opponent free throw rate (foul discipline)
  'DREB_RATE',            // Defensive rebounding
  // Shooting Zones (Offense)
  'THREE_PT_SHOOTING', 'PAINT_SCORING', 'MIDRANGE',
  // Defense (Zone-Specific)
  'THREE_PT_DEFENSE',     // Opponent 3PT% allowed
  'PAINT_DEFENSE',        // Opponent paint points allowed
  'PERIMETER_DEFENSE',    // Points to THREE_PT_DEFENSE
  'TRANSITION_DEFENSE',   // Fast break points allowed
  // Situational
  'REST_SITUATION',       // Now includes B2B historical performance!
  'CLUTCH_STATS',         // Close game record with trend
  'BACK_TO_BACK',
  'TRAVEL_SITUATION',     // Time zone and travel fatigue (NEW)
  // Players
  'TOP_PLAYERS', 'INJURIES', 'USAGE_RATES',
  'MINUTES_TREND',        // Star fatigue detection (NEW)
  // Lineups (NEW)
  'LINEUP_NET_RATINGS',   // First unit vs second unit performance
  'BENCH_DEPTH',          // Bench contribution
  // History
  'H2H_HISTORY', 'RECENT_FORM', 'HOME_AWAY_SPLITS', 'VS_ELITE_TEAMS',
  // Quarter/Half Scoring Trends
  'QUARTER_SCORING',      // Q1, Q2, Q3, Q4 scoring breakdown
  'FIRST_HALF_SCORING',   // 1st half scoring patterns
  'SECOND_HALF_SCORING',  // 2nd half/4th quarter scoring
  // Advanced
  'LUCK_ADJUSTED', 'SCHEDULE_STRENGTH'
];

// NFL Stat Tokens
const NFL_TOKENS = [
  // Efficiency (EPA)
  'OFFENSIVE_EPA', 'DEFENSIVE_EPA', 'PASSING_EPA', 'RUSHING_EPA', 'EPA_LAST_5',
  // Success Rate
  'SUCCESS_RATE_OFFENSE', 'SUCCESS_RATE_DEFENSE', 'EARLY_DOWN_SUCCESS', 'LATE_DOWN_EFFICIENCY',
  // Explosiveness
  'EXPLOSIVE_PLAYS', 'EXPLOSIVE_ALLOWED',
  // Line Play (ALL REAL FETCHERS!)
  'OL_RANKINGS',          // Offensive line rankings and grades
  'DL_RANKINGS',          // Defensive line rankings and pass rush
  'PRESSURE_RATE',        // QB pressure rate
  'TIME_TO_THROW',        // QB release time
  // Turnover Analysis
  'TURNOVER_MARGIN', 'TURNOVER_LUCK', 'FUMBLE_LUCK',
  // Situational (ALL REAL FETCHERS!)
  'RED_ZONE_OFFENSE', 'RED_ZONE_DEFENSE',
  'GOAL_LINE',            // Goal line and short yardage efficiency
  'TWO_MINUTE_DRILL',     // End of half efficiency
  // Special Teams (ALL REAL FETCHERS!)
  'SPECIAL_TEAMS',
  'KICKING',              // FG% and punting stats
  'FIELD_POSITION',       // Starting field position and returns
  // Players
  'QB_STATS', 'RB_STATS', 'WR_TE_STATS', 'DEFENSIVE_PLAYMAKERS', 'INJURIES',
  // Context (ALL REAL FETCHERS!)
  'WEATHER', 'QB_WEATHER_HISTORY', 'REST_SITUATION',
  'DIVISION_RECORD',      // Division and conference record
  'PRIMETIME_RECORD',     // SNF/MNF/TNF performance
  // Coaching & Situational (ALL REAL FETCHERS!)
  'FOURTH_DOWN_TENDENCY', // 4th down aggressiveness - go rate, conversion %
  'SCHEDULE_CONTEXT',     // Upcoming schedule for trap/sandwich game analysis
  // Historical
  'H2H_HISTORY', 'RECENT_FORM',
  // Quarter/Half Scoring Trends
  'QUARTER_SCORING',      // Q1, Q2, Q3, Q4 scoring breakdown
  'FIRST_HALF_TRENDS',    // 1st half scoring patterns
  'SECOND_HALF_TRENDS',   // 2nd half/4th quarter scoring
  'HOME_AWAY_SPLITS',     // Home vs road performance
  // Standings (from BDL)
  'STANDINGS',            // Full standings, conference/division records
  // Variance/Consistency Analysis (NEW - for underdog value)
  'VARIANCE_CONSISTENCY'  // Point differential variance, QB consistency, upset potential
];

// NCAAB Stat Tokens — advanced stats are investigation tokens, not pre-loaded in scout report
// Scout report provides context (injuries, roster, standings, rankings, recent form, H2H, venue)
// Gary calls these tokens during Pass 1 to investigate the statistical baseline
const NCAAB_TOKENS = [
  // BDL Core Stats (team-level, from /team_season_stats)
  'SCORING', 'FG_PCT', 'THREE_PT_SHOOTING',
  'TURNOVER_RATE', 'OREB_RATE', 'FT_RATE',
  'REBOUNDS', 'ASSISTS', 'STEALS', 'BLOCKS',
  // Context + roster tokens used by NCAAB factor checklist
  'TOP_PLAYERS', 'INJURIES',
  // NCAAB-Specific Calculated Stats (from BDL raw box score data)
  'NCAAB_EFG_PCT',           // (FGM + 0.5*FG3M) / FGA
  'NCAAB_TS_PCT',            // PTS / (2*(FGA+0.44*FTA))
  'NCAAB_TEMPO',             // (FGA+0.44*FTA-OREB+TOV) / GP
  'NCAAB_OFFENSIVE_RATING',  // (PTS/Poss)*100
  'NCAAB_DEFENSIVE_RATING',  // (OppPTS/Poss)*100 — uses games endpoint for opp points
  'NET_RATING',              // Combined ORtg - DRtg (uses NCAAB calculated ratings)
  'NCAAB_BARTTORVIK',        // Barttorvik T-Rank / AdjEM / tempo-free profile
  // Bundled investigation tokens
  'NCAAB_FOUR_FACTORS',      // All 4 Dean Oliver factors in one call (eFG%, TOV%, FTA Rate, ORB%)
  'NCAAB_L1_STATS',          // Last game full team stats (shooting, pace, four factors, opponent stats)
  'NCAAB_L3_STATS',          // Last 3 games full team stats
  'NCAAB_L5_EFFICIENCY',     // L5 full team stats (shooting, pace, four factors, opponent stats)
  // Context stats (have dedicated NCAAB fetchers in statRouter)
  'NCAAB_VENUE',             // Arena/venue name from Highlightly API (only NCAAB venue source)
  'RECENT_FORM',             // Enhanced recent form with opponent quality
  'H2H_HISTORY'              // Head-to-head history (BDL games)
];

// NCAAF Stat Tokens - BDL-based tokens that work
// BDL NCAAF has: team_season_stats with passing/rushing yards, TDs, opponent yards
const NCAAF_TOKENS = [
  // ===== PRIMARY STATS (BDL team_season_stats - THESE WORK) =====
  'NCAAF_PASSING_OFFENSE',    // BDL: passing_yards, passing_yards_per_game, passing_touchdowns
  'NCAAF_RUSHING_OFFENSE',    // BDL: rushing_yards, rushing_yards_per_game, rushing_touchdowns
  'NCAAF_TOTAL_OFFENSE',      // BDL: combined passing + rushing stats
  'NCAAF_DEFENSE',            // BDL: opp_passing_yards, opp_rushing_yards
  'NCAAF_SCORING',            // BDL: calculated from TDs and game data
  'NCAAF_TURNOVER_MARGIN',    // BDL: passing_interceptions
  
  // ===== ADVANCED ANALYTICS (via Gemini Grounding - NEW) =====
  'NCAAF_SP_PLUS_RATINGS',    // SP+ offensive/defensive rankings
  'NCAAF_FPI_RATINGS',        // ESPN FPI rankings and win probabilities
  'NCAAF_EPA',                // Expected Points Added (EPA) data
  'NCAAF_SUCCESS_RATE',       // Offensive/defensive success rates
  'NCAAF_HAVOC',              // Havoc rate (TFLs, sacks, forced fumbles)
  'NCAAF_EXPLOSIVE_PLAYS',    // Big play frequency (20+ yard gains)
  'NCAAF_RUSH_EFFICIENCY',    // Opponent-adjusted rushing metrics
  'NCAAF_PASS_EFFICIENCY',    // Opponent-adjusted passing metrics
  'NCAAF_REDZONE',            // Red zone scoring and defense conversion %
  // ===== GAME DATA (BDL games endpoint - WORKS) =====
  'RECENT_FORM',              // BDL: recent game results and scores
  'SCORING',                  // BDL: points per game from game data
  'TURNOVER_MARGIN',          // BDL: from game stats
  
  // ===== STANDARD TOKENS (work across sports) =====
  'HOME_AWAY_SPLITS',         // BDL: home vs away performance
  'H2H_HISTORY',              // BDL: head-to-head history
  
  // ===== PLAYER STATS (BDL player_season_stats - WORKS) =====
  'TOP_PLAYERS',              // BDL: key players and their stats
  'INJURIES',                 // BDL: injury report
  
  // NOTE: Advanced analytics (SP+, EPA, etc.) are provided via Gemini Grounding
  // in the Scout Report, not via stat tokens.
];

// NHL Stat Tokens (uses BDL + Gemini Grounding for advanced stats)
const NHL_TOKENS = [
  // Standings & Records (from BDL standings endpoint)
  'STANDINGS', 'TEAM_RECORD', 'CONFERENCE_STANDING', 'DIVISION_STANDING',
  'POINTS_PCT',           // Points percentage from BDL standings
  'STREAK',               // Current win/loss streak from BDL standings
  'PLAYOFF_POSITION',     // Playoff race context from standings
  // Special Teams (critical in hockey)
  'POWER_PLAY_PCT', 'PENALTY_KILL_PCT', 'SPECIAL_TEAMS',
  // Scoring
  'GOALS_FOR', 'GOALS_AGAINST', 'GOAL_DIFFERENTIAL',
  // Shot Metrics
  'SHOTS_FOR', 'SHOTS_AGAINST', 'SHOT_DIFFERENTIAL',
  // Advanced Analytics (via Gemini Grounding)
  'CORSI_FOR_PCT',        // Real possession metric (CF%)
  'EXPECTED_GOALS',       // Real xG data
  'PDO',                  // Real luck indicator (Sh% + Sv%)
  'HIGH_DANGER_CHANCES',  // Real scoring chance quality
  // Goaltending
  'GOALIE_STATS', 'SAVE_PCT', 'GOALS_AGAINST_AVG', 'GOALIE_MATCHUP',
  'NHL_GSAX',                 // GSAx via Gemini Grounding (MoneyPuck/NST)
  'NHL_GOALIE_RECENT_FORM',   // Goalie L5/L10 computed from BDL box scores
  'NHL_HIGH_DANGER_SV_PCT',   // HDSV% via Gemini Grounding (Natural Stat Trick)
  // Situational
  'REST_SITUATION', 'BACK_TO_BACK',
  // Faceoffs & Possession
  'FACEOFF_PCT', 'POSSESSION_METRICS',
  // Players & Lineups (from BDL box_scores and player_season_stats)
  'TOP_SCORERS', 'TOP_PLAYERS', 'INJURIES',
  'LINE_COMBINATIONS',    // Forward lines and D pairings
  'HOT_PLAYERS',          // Players on hot streaks
  // Historical
  'H2H_HISTORY', 'RECENT_FORM', 'HOME_AWAY_SPLITS',
  // Luck/Regression (from BDL + computed)
  'LUCK_INDICATORS',      // Real luck analysis (PDO, xG diff)
  'SHOOTING_REGRESSION',  // Player shooting % regression indicators
  'CLOSE_GAME_RECORD',    // One-goal game record
  'ONE_GOAL_GAMES',       // 1-goal game win/loss record (from BDL games)
  'OVERTIME_RECORD',      // Real OT/SO record calculated
  // Variance/Consistency (from BDL standings + games)
  'REGULATION_WIN_PCT',   // Regulation wins vs total wins
  'MARGIN_VARIANCE'       // Goal differential variance
];

// MLB Stat Tokens — BDL GOAT tier + MLB Stats API + Gemini Grounding
const MLB_TOKENS = [
  // Pitching
  'MLB_STARTING_PITCHERS',       // Probable starters (Grounding)
  'MLB_PITCHER_SEASON_STATS',    // Starter's current season stats (BDL season stats)
  'MLB_PITCHER_RECENT_FORM',     // Last 5 starts game log (Grounding)
  'MLB_BULLPEN',                 // Bullpen availability (Grounding)
  'MLB_BULLPEN_WORKLOAD',        // Specific bullpen usage last 3 days (Grounding)
  // Hitting
  'MLB_KEY_HITTERS',             // Top hitters with season stats (BDL season stats)
  'MLB_LINEUP',                  // Confirmed batting order (Grounding)
  // Matchup Data (BDL GOAT)
  'MLB_PLAYER_SPLITS',           // L/R splits, home/away, by venue (BDL splits)
  'MLB_BATTER_VS_PITCHER',       // Career batter vs pitcher matchup history (BDL PvP)
  // Standings & Records
  'STANDINGS',                   // MLB division standings
  'MLB_STANDINGS',               // MLB division standings (BDL structured)
  'MLB_STANDINGS_STRUCTURED',    // MLB division standings (BDL)
  'MLB_TEAM_RECORD',             // Current W-L, division position (BDL standings)
  'MLB_RECENT_RESULTS',          // Recent game results with scores
  // Form & Context
  'MLB_RECENT_FORM',             // Last 10 games W-L and scoring trends
  'MLB_RECENT_FORM_STRUCTURED',  // Recent form via API
  'MLB_SEASON_FORM',             // Season performance and momentum
  'MLB_ODDS',                    // Current betting odds (Grounding)
  'REST_SITUATION',              // Days rest / schedule context
  'MLB_REST_SITUATION',          // Days rest via API
  'RECENT_FORM',                 // Team's recent results
  'H2H_HISTORY',                 // Historical matchup record
  'MLB_H2H',                     // Season series H2H record
  // Venue & Conditions
  'MLB_PARK_FACTORS',            // Park factor, dimensions, hitter/pitcher friendly
  'MLB_WEATHER',                 // Weather at game venue (wind, temp, humidity)
  // Players
  'MLB_TOP_PLAYERS',             // Key players with season stats (BDL)
  'TOP_PLAYERS',                 // Key players
  'MLB_INJURIES',                // Injury/IL/scratch updates (BDL + Grounding)
  'INJURIES',                    // Injury updates
  // Game Context
  'MLB_GAME_PREVIEW',            // Game preview, projections (Grounding)
  'MLB_PITCHER_SCOUTING',        // Starting pitcher scouting (Grounding)
  // Defense, Bullpen, Situational (BDL structured + Grounding fallback)
  'MLB_CLOSER_RELIEVER_STATS',   // Closer + key reliever SV, HLD, ERA, K (BDL season stats)
  'MLB_CATCHER_DEFENSE',         // Catcher defense: CS%, SBA, PB + batting (BDL season stats)
  'MLB_RISP_SITUATIONAL',        // RISP & situational splits for top hitters (BDL splits)
  'MLB_TEAM_DEFENSE',            // Team fielding: errors, FPCT, DP + pitching ERA/WHIP (BDL team stats)
  'MLB_STATCAST',                // Statcast contact quality: exit velo, launch angle, xwOBA, xSLG, xBA, bat speed, barrels, whiff/chase rates (BDL plate appearances — full surface)
  'MLB_PITCH_TYPES_SP',          // Per-pitch breakdown for both probable SPs: usage%, whiff%, chase%, xwOBA, BA per pitch (BDL pitch-type season stats)
  'MLB_PITCH_TYPES_HITTERS',     // Top hitters' performance vs each pitch type: BA, xwOBA, SLG per pitch type (BDL pitch-type season stats)
];

// Combine all tokens by sport
const ALL_TOKENS_BY_SPORT = {
  NBA: NBA_TOKENS,
  NFL: NFL_TOKENS,
  NCAAB: NCAAB_TOKENS,
  NCAAF: NCAAF_TOKENS,
  NHL: NHL_TOKENS,
  MLB: MLB_TOKENS,
};

// Get all unique tokens across all sports
const ALL_TOKENS = [...new Set([
  ...NBA_TOKENS,
  ...NFL_TOKENS,
  ...NCAAB_TOKENS,
  ...NCAAF_TOKENS,
  ...NHL_TOKENS,
  ...MLB_TOKENS,
])];

/**
 * Tool Definition for fetch_stats function
 * This is the schema that tells the LLM what Gary can request
 */
export const toolDefinitions = [
  {
    type: "function",
    function: {
      name: "fetch_stats",
      description: `Fetches statistical data for the matchup by category token. Returns structured, verified numbers for one or both teams.`,
      parameters: {
        type: "object",
        properties: {
          sport: {
            type: "string",
            enum: ["NBA", "NFL", "NCAAB", "NCAAF", "NHL", "MLB"],
            description: "The sport league"
          },
          token: {
            type: "string",
            enum: ALL_TOKENS,
            description: "The specific stat category to fetch"
          },
          team: {
            type: "string",
            description: "Optional: specific team to focus on (if omitted, returns both teams)"
          }
        },
        required: ["sport", "token"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "fetch_player_game_logs",
      description: `Fetches raw game logs for a specific player (last 5-10 games).
Use this to identify "Hot Streaks," "Slumps," or consistency issues that season-long stats might mask.
Available for: NBA, NFL, NHL, NCAAB, NCAAF, MLB.`,
      parameters: {
        type: "object",
        properties: {
          sport: {
            type: "string",
            enum: ["NBA", "NFL", "NHL", "NCAAB", "NCAAF", "MLB"],
            description: "The sport league"
          },
          player_name: {
            type: "string",
            description: "Full player name (e.g., 'LeBron James' or 'Patrick Mahomes')"
          },
          num_games: {
            type: "integer",
            description: "Number of games to fetch (default: 5, max: 15)",
            default: 5
          }
        },
        required: ["sport", "player_name"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "fetch_nba_player_stats",
      description: `Fetches advanced NBA player statistics and metrics for deeper analysis.
Use this for detailed player-level analysis beyond season averages.
Available modes:
- ADVANCED: PIE, Net Rating, Assist Ratio, True Shooting %
- USAGE: Usage Rate %, Shot Attempts per game, Ball Dominance
- DEFENSIVE: Contested shots, rim protection metrics, defensive rating
- TRENDS: Last 5 vs Last 10 vs Season comparisons`,
      parameters: {
        type: "object",
        properties: {
          stat_type: {
            type: "string",
            enum: ["ADVANCED", "USAGE", "DEFENSIVE", "TRENDS"],
            description: "The type of metrics to fetch"
          },
          team: {
            type: "string",
            description: "Team name to filter results (returns top players for that team)"
          },
          player_name: {
            type: "string",
            description: "Optional: specific player name to search for"
          }
        },
        required: ["stat_type", "team"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "fetch_depth_chart",
      description: `Fetches the depth chart for a team — shows starter → backup ordering at each position (PG, SG, SF, PF, C). Use this to see who replaces an injured player and the full position hierarchy.
Available for: NBA only.`,
      parameters: {
        type: "object",
        properties: {
          team: {
            type: "string",
            description: "Team abbreviation (e.g., 'BOS', 'DET', 'MIN')"
          }
        },
        required: ["team"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "fetch_team_recent_stats",
      description: `Fetches team-level stats for the last N games — full shooting splits (FG%, 3P%, eFG%), actual pace (possessions), paint scoring, fast break points, turnovers, rebounds, and what opponents did AGAINST this team. Much more detailed than season averages. Use this to compare L1 (last game), L3, L5, or L10 to see real trends.
Available for: NBA only.`,
      parameters: {
        type: "object",
        properties: {
          team: {
            type: "string",
            description: "Team abbreviation (e.g., 'BOS', 'MIN', 'LAL')"
          },
          num_games: {
            type: "integer",
            description: "Number of recent games (1, 3, 5, or 10)",
            default: 5
          }
        },
        required: ["team"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "fetch_nfl_player_stats",
      description: `Fetches advanced NFL player statistics for deeper analysis.
Use this when you need detailed player-level metrics beyond what's in the scout report.
Available stat types:
- PASSING: Completion % above expected, aggressiveness, avg time to throw, air yards
- RUSHING: Rush yards over expected, efficiency, avg time to LOS
- RECEIVING: Separation, YAC above expectation, catch percentage, cushion
Only use for NFL games when you need specific player matchup analysis.`,
      parameters: {
        type: "object",
        properties: {
          stat_type: {
            type: "string",
            enum: ["PASSING", "RUSHING", "RECEIVING"],
            description: "The type of advanced stats to fetch"
          },
          team: {
            type: "string",
            description: "Team name to filter results (returns top players for that team)"
          },
          player_name: {
            type: "string",
            description: "Optional: specific player name to search for"
          }
        },
        required: ["stat_type", "team"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "fetch_nhl_player_stats",
      description: `Fetches NHL player statistics for deeper analysis.
Use this when you need detailed player-level metrics beyond what's in the scout report.
Available stat types:
- SKATERS: Goals, assists, points, plus/minus, shooting %, time on ice
- GOALIES: Save %, GAA, wins, losses, shutouts
- LEADERS: League leaders by stat category (points, goals, saves, etc.)
Only use for NHL games when you need specific player analysis.`,
      parameters: {
        type: "object",
        properties: {
          stat_type: {
            type: "string",
            enum: ["SKATERS", "GOALIES", "LEADERS"],
            description: "The type of stats to fetch"
          },
          team: {
            type: "string",
            description: "Team name to filter results (returns players for that team)"
          },
          leader_type: {
            type: "string",
            enum: ["points", "goals", "assists", "save_pct", "wins", "shutouts", "plus_minus"],
            description: "For LEADERS type: which stat to get league leaders for"
          },
          player_name: {
            type: "string",
            description: "Optional: specific player name to search for"
          }
        },
        required: ["stat_type", "team"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "fetch_ncaaf_player_stats",
      description: `Fetches NCAAF player statistics for deeper analysis.
Use this when you need detailed player-level metrics beyond what's in the scout report.
Available stat types:
- OFFENSE: Passing yards/TDs, rushing yards/TDs, receiving yards/TDs
- DEFENSE: Tackles, sacks, interceptions, tackles for loss
- RANKINGS: AP Poll rankings for both teams
Only use for NCAAF games when you need specific player analysis.`,
      parameters: {
        type: "object",
        properties: {
          stat_type: {
            type: "string",
            enum: ["OFFENSE", "DEFENSE", "RANKINGS"],
            description: "The type of stats to fetch"
          },
          team: {
            type: "string",
            description: "Team name to filter results (returns players for that team)"
          },
          player_name: {
            type: "string",
            description: "Optional: specific player name to search for"
          }
        },
        required: ["stat_type", "team"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "fetch_narrative_context",
      description: `Searches current news and reporting for this matchup. Returns dated, sourced text.`,
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The factual search query to discover storylines or player news"
          }
        },
        required: ["query"]
      }
    }
  }
];

/**
 * Get available tokens for a specific sport
 */
export function getTokensForSport(sport) {
  return ALL_TOKENS_BY_SPORT[sport] || [];
}

/**
 * Format tokens as a display string for the prompt
 */
export function formatTokenMenu(sport) {
  const tokens = getTokensForSport(sport);
  if (!tokens.length) return '';
  
  // Group tokens by category for better readability
  const grouped = {};
  tokens.forEach(token => {
    // Extract category from token name (before first underscore or whole name)
    let category = 'General';
    if (token.includes('_')) {
      const parts = token.split('_');
      if (['OFFENSIVE', 'DEFENSIVE', 'PASSING', 'RUSHING'].includes(parts[0])) {
        category = 'Efficiency';
      } else if (['THREE', 'TWO', 'PAINT', 'PERIMETER'].includes(parts[0])) {
        category = 'Shooting/Defense';
      } else if (['TOP', 'QB', 'RB', 'WR'].includes(parts[0])) {
        category = 'Players';
      } else if (['H2H', 'ATS', 'RECENT', 'VS'].includes(parts[0])) {
        category = 'Historical';
      } else if (['REST', 'WEATHER', 'HOME', 'MOTIVATION'].includes(parts[0])) {
        category = 'Situational';
      } else if (['ADJ', 'SP', 'FEI', 'LUCK'].includes(parts[0])) {
        category = 'Advanced';
      } else if (['RED', 'GOAL', 'THIRD', 'FOURTH', 'CLUTCH'].includes(parts[0])) {
        category = 'Situational';
      } else if (['OL', 'DL', 'PRESSURE', 'HAVOC'].includes(parts[0])) {
        category = 'Line Play';
      } else if (['TURNOVER', 'FUMBLE'].includes(parts[0])) {
        category = 'Turnovers';
      } else if (['SPECIAL', 'KICKING', 'FIELD'].includes(parts[0])) {
        category = 'Special Teams';
      } else {
        category = parts[0].charAt(0) + parts[0].slice(1).toLowerCase();
      }
    } else {
      category = 'Core';
    }
    
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push(token);
  });
  
  let output = '';
  for (const [category, categoryTokens] of Object.entries(grouped)) {
    output += `\n${category}: ${categoryTokens.map(t => `[${t}]`).join(' ')}`;
  }
  
  return output.trim();
}

// Token constants are consumed internally via getTokensForSport() only.
