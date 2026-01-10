/**
 * Props Tool Definitions
 * 
 * This defines the "menu" of stats Gary can request for player props.
 * Similar to toolDefinitions.js but specifically for prop analysis.
 * Uses BDL MCP for verified stats per sport.
 * 
 * DATA SOURCES:
 * - BDL (Ball Don't Lie): Structured data - stats, rosters, injuries, standings
 * - Gemini (Live Search): Narrative context - news, situational factors, motivation
 */

// ============================================================================
// GEMINI-ONLY CONTEXT TOKENS (Live Search - All Sports)
// ============================================================================
// These factors REQUIRE live search and CANNOT be fetched from BDL.
// Gemini will intelligently find what's relevant for each specific game.

const GEMINI_CONTEXT_TOKENS = {
  // ---------------------------------------------------------------------------
  // BREAKING NEWS & SITUATIONAL (Critical for accurate analysis)
  // ---------------------------------------------------------------------------
  BREAKING_NEWS: [
    'LAST_MINUTE_SCRATCHES',    // Player ruled out after injury report (tip-off updates)
    'TRADE_RUMORS',             // Active trade talks affecting player focus/motivation
    'COACHING_CHANGES',         // Interim coach, new system, rotation changes
    'LOCKER_ROOM_DRAMA',        // Chemistry issues, reported tension, team meetings
  ],
  
  // ---------------------------------------------------------------------------
  // MOTIVATION FACTORS (Why players over/under perform)
  // ---------------------------------------------------------------------------
  MOTIVATION: [
    'REVENGE_GAME',             // Player vs former team (KD @ Warriors, etc.)
    'MILESTONE_CHASING',        // Close to career milestone (50 pts from all-time record)
    'CONTRACT_YEAR',            // Player playing for next contract = extra motivation
    'JERSEY_RETIREMENT',        // Emotional games (tribute nights, ceremony games)
    'RETURN_FROM_INJURY',       // First game back = minutes restriction or extra motivation
    'PLAYOFF_IMPLICATIONS',     // Must-win scenarios, elimination games
  ],
  
  // ---------------------------------------------------------------------------
  // SCHEDULE & TRAVEL CONTEXT
  // ---------------------------------------------------------------------------
  SCHEDULE_CONTEXT: [
    'BACK_TO_BACK_FATIGUE',     // 2nd night of B2B, 3rd game in 4 nights
    'TRAP_GAME_SPOT',           // Good team vs lottery team before big game (look-ahead)
    'ALTITUDE_FACTOR',          // Denver home games = fatigue for visitors
    'ROAD_TRIP_LENGTH',         // Game 5 of 6-game road trip
    'REST_ADVANTAGE',           // One team well-rested vs exhausted opponent
    'TRAVEL_MILES',             // Cross-country travel impact
  ],
  
  // ---------------------------------------------------------------------------
  // PLAYER-SPECIFIC CONTEXT
  // ---------------------------------------------------------------------------
  PLAYER_CONTEXT: [
    'LOAD_MANAGEMENT_RISK',     // Stars who typically rest B2Bs or vs bad teams
    'MATCHUP_HISTORY',          // How specific players defend each other
    'RECENT_QUOTES',            // Coach/player comments indicating mindset
    'OFF_COURT_ISSUES',         // Personal matters that may affect performance
    'MINUTES_RESTRICTION',      // Returning from injury, may have a minutes cap
    'ROLE_CHANGE',              // Recent promotion to starter or bench role
  ],
  
  // ---------------------------------------------------------------------------
  // BETTING MARKET SIGNALS (MINOR DATA POINTS ONLY)
  // ---------------------------------------------------------------------------
  // ⚠️ NOTE: Betting signals removed per user policy (no betting-market data).
  // Gary focuses on player/team performance only, not market sentiment.
  BETTING_SIGNALS: [
    // Removed: LINE_MOVEMENT, PUBLIC_BETTING_PCT - per user policy
  ],
};

// Flatten all Gemini tokens for easy access
const ALL_GEMINI_TOKENS = [
  ...GEMINI_CONTEXT_TOKENS.BREAKING_NEWS,
  ...GEMINI_CONTEXT_TOKENS.MOTIVATION,
  ...GEMINI_CONTEXT_TOKENS.SCHEDULE_CONTEXT,
  ...GEMINI_CONTEXT_TOKENS.PLAYER_CONTEXT,
  ...GEMINI_CONTEXT_TOKENS.BETTING_SIGNALS,
];

// ============================================================================
// NBA PROP STAT TOKENS (BDL + Gemini)
// ============================================================================
const NBA_PROP_TOKENS = [
  // Core Scoring
  'PLAYER_POINTS',           // PPG, recent scoring trends
  'PLAYER_REBOUNDS',         // RPG, offensive/defensive breakdown
  'PLAYER_ASSISTS',          // APG, assist opportunities
  'PLAYER_THREES',           // 3PM per game, 3PT attempts
  'PLAYER_PRA',              // Points + Rebounds + Assists combined
  
  // Secondary Stats
  'PLAYER_BLOCKS',           // Blocks per game
  'PLAYER_STEALS',           // Steals per game
  'PLAYER_TURNOVERS',        // Turnovers per game
  
  // Minutes & Usage
  'PLAYER_MINUTES',          // MPG, minute trends
  'PLAYER_USAGE',            // Usage rate, shot attempts
  
  // Efficiency
  'PLAYER_FG_PCT',           // Field goal percentage
  'PLAYER_FT_PCT',           // Free throw percentage
  'PLAYER_TRUE_SHOOTING',    // True shooting percentage
  
  // Advanced Stats (BDL Season Averages API)
  'PLAYER_ADVANCED_STATS',   // PIE, pace, offensive/defensive rating, net rating
  'PLAYER_USAGE_STATS',      // Usage %, assist ratio, turnover ratio
  'PLAYER_SCORING_STATS',    // Scoring breakdown by type
  'PLAYER_CLUTCH_STATS',     // Clutch performance metrics
  'PLAYER_DEFENSIVE_STATS',  // Defensive metrics (contested shots, rim protection)
  'PLAYER_SHOOTING_ZONES',   // Shooting by zone (5ft range, by distance)
  
  // Game Logs
  'PLAYER_GAME_LOGS',        // Last 5-10 games with full stats
  'PLAYER_GAME_ADVANCED',    // Per-game advanced stats (PIE, net rating per game)
  'PLAYER_VS_OPPONENT',      // Performance vs this opponent
  'PLAYER_HOME_AWAY',        // Home/road splits
  
  // Live Data (BDL 2025+)
  'GAME_LINEUPS',            // Starting lineups (once game begins)
  'LIVE_BOX_SCORES',         // Real-time box scores
  
  // Context (BDL)
  'TEAM_INJURIES',           // Team injury report from BDL
  'ACTIVE_ROSTER',           // Current active players on team
  'DEFENSIVE_MATCHUP',       // Opponent defensive ratings
  'PACE_FACTOR',             // Game pace projection
  
  // ---------------------------------------------------------------------------
  // GEMINI-ONLY CONTEXT (Live Search Required)
  // ---------------------------------------------------------------------------
  // Breaking News & Situational
  'LAST_MINUTE_SCRATCHES',   // Tip-off injury updates (Gemini)
  'TRADE_RUMORS',            // Active trade talks (Gemini)
  'COACHING_CHANGES',        // System/rotation changes (Gemini)
  'LOCKER_ROOM_DRAMA',       // Chemistry issues (Gemini)
  
  // Motivation Factors
  'REVENGE_GAME',            // Player vs former team (Gemini)
  'MILESTONE_CHASING',       // Career milestone proximity (Gemini)
  'CONTRACT_YEAR',           // Playing for next contract (Gemini)
  'RETURN_FROM_INJURY',      // First game back context (Gemini)
  'PLAYOFF_IMPLICATIONS',    // Must-win scenarios (Gemini)
  
  // Schedule & Travel
  'BACK_TO_BACK_FATIGUE',    // B2B, travel context (Gemini)
  'TRAP_GAME_SPOT',          // Look-ahead/let-down (Gemini)
  'ALTITUDE_FACTOR',         // Denver home games (Gemini)
  'REST_ADVANTAGE',          // Rest disparity (Gemini)
  
  // Player-Specific
  'LOAD_MANAGEMENT_RISK',    // Stars who rest (Gemini)
  'MATCHUP_HISTORY',         // Player vs player (Gemini)
  'RECENT_QUOTES',           // Coach/player comments (Gemini)
  'MINUTES_RESTRICTION'      // Injury return caps (Gemini)
  
  // Betting Signals REMOVED per user policy (no betting-market data)
];

// ============================================================================
// NHL PROP STAT TOKENS
// ============================================================================
const NHL_PROP_TOKENS = [
  // Core Scoring
  'PLAYER_GOALS',            // Goals per game, goal trends
  'PLAYER_ASSISTS',          // Assists per game
  'PLAYER_POINTS',           // Points per game (G + A)
  'PLAYER_SHOTS',            // Shots on goal per game
  
  // Power Play
  'PLAYER_PP_POINTS',        // Power play points
  'PLAYER_PP_GOALS',         // Power play goals
  
  // Advanced
  'PLAYER_PLUS_MINUS',       // Plus/minus rating
  'PLAYER_TOI',              // Time on ice per game
  'PLAYER_SHOOTING_PCT',     // Shooting percentage
  
  // Goalie Stats
  'GOALIE_SAVES',            // Saves per game
  'GOALIE_SAVE_PCT',         // Save percentage
  'GOALIE_GAA',              // Goals against average
  
  // Game Logs
  'PLAYER_GAME_LOGS',        // Last 5-10 games with full stats
  'PLAYER_VS_OPPONENT',      // Performance vs this opponent
  
  // Context (BDL)
  'TEAM_INJURIES',           // Team injury report
  'LINE_COMBINATIONS',       // Current line combos
  'GOALIE_MATCHUP',          // Expected starting goalies
  
  // ---------------------------------------------------------------------------
  // GEMINI-ONLY CONTEXT (Live Search Required)
  // ---------------------------------------------------------------------------
  // Breaking News & Situational
  'LAST_MINUTE_SCRATCHES',   // Tip-off scratches (Gemini)
  'TRADE_RUMORS',            // Trade talks (Gemini)
  'COACHING_CHANGES',        // System changes (Gemini)
  
  // Motivation Factors
  'REVENGE_GAME',            // Player vs former team (Gemini)
  'MILESTONE_CHASING',       // Career milestone (Gemini)
  'CONTRACT_YEAR',           // Playing for contract (Gemini)
  'PLAYOFF_IMPLICATIONS',    // Must-win scenarios (Gemini)
  
  // Schedule & Travel
  'BACK_TO_BACK_FATIGUE',    // B2B games (Gemini)
  'ROAD_TRIP_LENGTH',        // Extended road trips (Gemini)
  'REST_ADVANTAGE',          // Rest disparity (Gemini)
  
  // Player-Specific
  'LOAD_MANAGEMENT_RISK',    // Stars who rest (Gemini)
  'RECENT_QUOTES',           // Coach/player comments (Gemini)
  
  // Betting Signals (MINOR DATA POINTS ONLY)
  'LINE_MOVEMENT',           // Sharp money (Gemini) ⚠️ SUPPLEMENTARY ONLY
  'PUBLIC_BETTING_PCT'       // Public % (Gemini) ⚠️ SUPPLEMENTARY ONLY
];

// ============================================================================
// NFL PROP STAT TOKENS
// ============================================================================
const NFL_PROP_TOKENS = [
  // Passing (Basic)
  'PLAYER_PASS_YARDS',       // Passing yards per game
  'PLAYER_PASS_TDS',         // Passing TDs per game
  'PLAYER_COMPLETIONS',      // Completions per game
  'PLAYER_PASS_ATTEMPTS',    // Attempts per game
  'PLAYER_INTERCEPTIONS',    // INTs thrown
  
  // Passing (Advanced - BDL API)
  'PLAYER_PASS_ADVANCED',    // avg_time_to_throw, aggressiveness, completion_pct_above_expected
  'PLAYER_AIR_YARDS',        // avg_air_distance, avg_intended_air_yards, avg_completed_air_yards
  'PLAYER_PASSER_RATING',    // QBR, expected_completion_pct
  
  // Rushing (Basic)
  'PLAYER_RUSH_YARDS',       // Rushing yards per game
  'PLAYER_RUSH_TDS',         // Rushing TDs
  'PLAYER_RUSH_ATTEMPTS',    // Carries per game
  
  // Rushing (Advanced - BDL API)
  'PLAYER_RUSH_ADVANCED',    // efficiency, yards_over_expected, avg_time_to_los
  'PLAYER_RUSH_EFFICIENCY',  // rush_yards_over_expected_per_att, pct_over_expected
  'PLAYER_8_BOX_RATE',       // percent_attempts_gte_eight_defenders
  
  // Receiving (Basic)
  'PLAYER_REC_YARDS',        // Receiving yards per game
  'PLAYER_REC_TDS',          // Receiving TDs
  'PLAYER_RECEPTIONS',       // Receptions per game
  'PLAYER_TARGETS',          // Targets per game
  
  // Receiving (Advanced - BDL API)
  'PLAYER_REC_ADVANCED',     // avg_cushion, avg_separation, avg_yac, catch_percentage
  'PLAYER_TARGET_SHARE',     // percent_share_of_intended_air_yards
  'PLAYER_YAC_STATS',        // avg_expected_yac, avg_yac_above_expectation
  
  // Team Stats (BDL API)
  'TEAM_SEASON_STATS',       // Full team offensive/defensive stats
  'TEAM_GAME_STATS',         // Per-game team stats (real-time for in-progress)
  
  // Game Logs
  'PLAYER_GAME_LOGS',        // Last 5 games with full stats
  'PLAYER_VS_OPPONENT',      // Performance vs this opponent
  'PLAYER_HOME_AWAY',        // Home/road splits
  
  // Live Data
  'PLAY_BY_PLAY',            // Real-time play-by-play data
  
  // Context (BDL)
  'TEAM_INJURIES',           // Team injury report from BDL
  'TEAM_ROSTER',             // Current roster with depth chart
  'DEFENSIVE_MATCHUP',       // Opponent pass/rush defense
  'GAME_SCRIPT',             // Projected game flow
  'WEATHER',                 // Weather conditions
  
  // ---------------------------------------------------------------------------
  // GEMINI-ONLY CONTEXT (Live Search Required)
  // ---------------------------------------------------------------------------
  // Breaking News & Situational
  'LAST_MINUTE_SCRATCHES',   // Gameday inactives (Gemini)
  'TRADE_RUMORS',            // Trade deadline buzz (Gemini)
  'COACHING_CHANGES',        // Coordinator changes (Gemini)
  'LOCKER_ROOM_DRAMA',       // Chemistry issues (Gemini)
  
  // Motivation Factors
  'REVENGE_GAME',            // Player vs former team (Gemini)
  'MILESTONE_CHASING',       // Career milestone (Gemini)
  'CONTRACT_YEAR',           // Playing for contract (Gemini)
  'PLAYOFF_IMPLICATIONS',    // Playoff picture (Gemini)
  
  // Schedule & Travel
  'TRAP_GAME_SPOT',          // Look-ahead spot (Gemini)
  'SHORT_WEEK',              // Thursday/Monday games (Gemini)
  'TRAVEL_FATIGUE',          // Cross-country travel (Gemini)
  
  // Player-Specific
  'RECENT_QUOTES',           // Coach/player comments (Gemini)
  'TARGET_SHARE_TRENDS',     // Recent usage changes (Gemini)
  
  // Betting Signals (MINOR DATA POINTS ONLY)
  'LINE_MOVEMENT',           // Sharp money (Gemini) ⚠️ SUPPLEMENTARY ONLY
  'PUBLIC_BETTING_PCT'       // Public % (Gemini) ⚠️ SUPPLEMENTARY ONLY
];

// ============================================================================
// EPL PROP STAT TOKENS
// ============================================================================
const EPL_PROP_TOKENS = [
  // Core Stats
  'PLAYER_GOALS',            // Goals scored
  'PLAYER_ASSISTS',          // Assists
  'PLAYER_SHOTS',            // Shots per game
  'PLAYER_SOT',              // Shots on target
  
  // Attacking
  'PLAYER_CHANCES_CREATED',  // Big chances created
  'PLAYER_TOUCHES_BOX',      // Touches in the box
  
  // Defensive
  'PLAYER_TACKLES',          // Tackles per game
  'PLAYER_SAVES',            // Goalkeeper saves
  
  // Game Logs
  'PLAYER_GAME_LOGS',        // Recent games with stats
  
  // Context
  'TEAM_INJURIES',           // Team injury report
  'FIXTURE_CONGESTION'       // Recent/upcoming fixtures
];

// ============================================================================
// NCAAB PROP STAT TOKENS (College Basketball - BDL 2025)
// ============================================================================
const NCAAB_PROP_TOKENS = [
  // Core Stats (same as NBA)
  'PLAYER_POINTS',           // PPG
  'PLAYER_REBOUNDS',         // RPG
  'PLAYER_ASSISTS',          // APG
  'PLAYER_THREES',           // 3PM per game
  'PLAYER_PRA',              // Points + Rebounds + Assists
  
  // Secondary Stats
  'PLAYER_BLOCKS',
  'PLAYER_STEALS',
  'PLAYER_TURNOVERS',
  'PLAYER_MINUTES',
  
  // Game Data
  'PLAYER_GAME_LOGS',        // Last 5-10 games
  'PLAYER_SEASON_STATS',     // Full season averages
  
  // Team Context (BDL specific)
  'TEAM_SEASON_STATS',       // Team season stats
  'TEAM_STANDINGS',          // Conference standings
  'TEAM_RANKINGS',           // AP Poll, Coaches Poll rankings
  'CONFERENCE_INFO',         // Conference tier (Power 6, Mid-Major, etc.)
  
  // Game Data (BDL 2025)
  'PLAY_BY_PLAY',            // Detailed play-by-play data
  'BETTING_ODDS',            // Spread, total, moneyline (if available)
  'MARCH_MADNESS_BRACKET',   // Tournament bracket info (March)
  
  // Context
  'TEAM_INJURIES',           // Gemini fallback (BDL may not have)
  'MATCHUP_TYPE',            // Elite vs Elite, Elite vs Mid-Major, etc.
  'HOME_COURT_FACTOR'        // College home court is HUGE
];

// ============================================================================
// NCAAF PROP STAT TOKENS (College Football - BDL 2025)
// ============================================================================
const NCAAF_PROP_TOKENS = [
  // Passing
  'PLAYER_PASS_YARDS',
  'PLAYER_PASS_TDS',
  'PLAYER_COMPLETIONS',
  'PLAYER_INTERCEPTIONS',
  
  // Rushing
  'PLAYER_RUSH_YARDS',
  'PLAYER_RUSH_TDS',
  'PLAYER_RUSH_ATTEMPTS',
  
  // Receiving
  'PLAYER_REC_YARDS',
  'PLAYER_REC_TDS',
  'PLAYER_RECEPTIONS',
  'PLAYER_TARGETS',
  
  // Game Data
  'PLAYER_GAME_LOGS',        // Last 5 games
  'PLAYER_SEASON_STATS',     // Full season stats
  
  // Team Context (BDL specific)
  'TEAM_SEASON_STATS',       // Full team offense/defense stats
  'TEAM_STANDINGS',          // Conference standings
  'TEAM_RANKINGS',           // CFP Rankings, AP Poll
  'CONFERENCE_TIER',         // Power 4, Group of 5, FCS
  
  // Game Data (BDL 2025)
  'BETTING_ODDS',            // Spread, total, moneyline
  
  // Context
  'TEAM_INJURIES',           // Gemini fallback
  'STARTING_QB',             // Stats-based QB detection
  'CONFERENCE_MATCHUP',      // SEC vs Big Ten, etc.
  'BOWL_GAME_INFO',          // Bowl game context (Dec-Jan)
  'CFP_CONTEXT'              // College Football Playoff context
];

// ============================================================================
// SPORT TOKEN MAPPING
// ============================================================================
const ALL_PROP_TOKENS_BY_SPORT = {
  NBA: NBA_PROP_TOKENS,
  NHL: NHL_PROP_TOKENS,
  NFL: NFL_PROP_TOKENS,
  EPL: EPL_PROP_TOKENS,
  NCAAB: NCAAB_PROP_TOKENS,  // Dedicated college basketball tokens
  NCAAF: NCAAF_PROP_TOKENS   // Dedicated college football tokens
};

// Get all unique prop tokens
const ALL_PROP_TOKENS = [...new Set([
  ...NBA_PROP_TOKENS,
  ...NHL_PROP_TOKENS,
  ...NFL_PROP_TOKENS,
  ...EPL_PROP_TOKENS,
  ...NCAAB_PROP_TOKENS,
  ...NCAAF_PROP_TOKENS
])];

/**
 * OpenAI Tool Definitions for Props Analysis
 * These define what Gary can request during prop iteration
 */
export const propsToolDefinitions = {
  NBA: [
    {
      type: 'function',
      function: {
        name: 'fetch_player_game_logs',
        description: 'Fetch last 5-10 NBA game logs for a player with full stats (points, rebounds, assists, threes, blocks, steals, minutes)',
        parameters: {
          type: 'object',
          properties: {
            player_name: { type: 'string', description: 'Full player name (e.g., "LeBron James")' }
          },
          required: ['player_name']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'fetch_player_season_stats',
        description: 'Fetch NBA season averages (PPG, RPG, APG, FG%, 3PT%, minutes)',
        parameters: {
          type: 'object',
          properties: {
            player_name: { type: 'string', description: 'Full player name' }
          },
          required: ['player_name']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'fetch_player_advanced_stats',
        description: 'Fetch NBA advanced season averages from BDL API. Categories: general (base/advanced/usage/scoring/defense/misc), clutch (base/advanced/misc/scoring/usage), defense (2_pointers/3_pointers/greater_than_15ft/less_than_10ft/less_than_6ft/overall), shooting (5ft_range/by_zone)',
        parameters: {
          type: 'object',
          properties: {
            player_name: { type: 'string', description: 'Full player name' },
            category: { 
              type: 'string', 
              enum: ['general', 'clutch', 'defense', 'shooting'],
              description: 'Stat category' 
            },
            type: { 
              type: 'string', 
              enum: ['base', 'advanced', 'usage', 'scoring', 'defense', 'misc', '2_pointers', '3_pointers', 'greater_than_15ft', 'less_than_10ft', 'less_than_6ft', 'overall', '5ft_range', 'by_zone'],
              description: 'Stat type within category' 
            }
          },
          required: ['player_name', 'category', 'type']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'fetch_player_game_advanced',
        description: 'Fetch per-game advanced stats for an NBA player (PIE, pace, offensive/defensive rating, usage%, net rating per game)',
        parameters: {
          type: 'object',
          properties: {
            player_name: { type: 'string', description: 'Full player name' },
            num_games: { type: 'number', description: 'Number of recent games (default: 5)' }
          },
          required: ['player_name']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'fetch_team_injuries',
        description: 'Fetch current NBA team injury report from BDL API',
        parameters: {
          type: 'object',
          properties: {
            team_name: { type: 'string', description: 'Team name (e.g., "Lakers")' }
          },
          required: ['team_name']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'fetch_active_roster',
        description: 'Fetch current active NBA roster for a team from BDL API',
        parameters: {
          type: 'object',
          properties: {
            team_name: { type: 'string', description: 'Team name (e.g., "Lakers")' }
          },
          required: ['team_name']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'fetch_game_lineups',
        description: 'Fetch starting lineups for an NBA game (2025+ season only, available once game begins)',
        parameters: {
          type: 'object',
          properties: {
            game_id: { type: 'number', description: 'BDL game ID' }
          },
          required: ['game_id']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'search_player_context',
        description: 'Search for recent news, injuries, or context about a player (use only when BDL data is insufficient)',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' }
          },
          required: ['query']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'search_game_narrative',
        description: `Search for narrative context that BDL cannot provide. Categories:
          
          BREAKING_NEWS: Last-minute scratches (tip-off updates), trade rumors, coaching changes, locker room drama
          MOTIVATION: Revenge games (vs former team), milestone chasing, contract year players, return from injury, playoff implications
          SCHEDULE: Back-to-back fatigue, trap game spots, altitude factor (Denver), rest advantage, travel miles
          PLAYER_SPECIFIC: Load management risk, matchup history (player vs player), recent coach/player quotes, minutes restrictions
          
          BETTING_SIGNALS: ⚠️ Line movement and public betting % are SUPPLEMENTARY signals ONLY.
          These should NEVER be the primary reason for a pick. Use as "interesting to note" context only.`,
        parameters: {
          type: 'object',
          properties: {
            query: { 
              type: 'string', 
              description: 'Specific narrative search (e.g., "LeBron James revenge game trade context", "Celtics back to back fatigue schedule spot")' 
            },
            context_type: {
              type: 'string',
              enum: ['breaking_news', 'motivation', 'schedule', 'player_specific', 'betting_signals'],
              description: 'Category of context being searched. Use betting_signals sparingly - it is supplementary only.'
            }
          },
          required: ['query', 'context_type']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'finalize_props',
        description: 'Output final prop picks with rationales',
        parameters: {
          type: 'object',
          properties: {
            picks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  player: { type: 'string' },
                  team: { type: 'string' },
                  prop: { type: 'string' },
                  line: { type: 'number' },
                  bet: { type: 'string', enum: ['over', 'under'] },
                  odds: { type: 'number' },
                  confidence: { type: 'number' },
                  rationale: { type: 'string' },
                  key_stats: { type: 'array', items: { type: 'string' } }
                },
                required: ['player', 'team', 'prop', 'line', 'bet', 'odds', 'confidence', 'rationale', 'key_stats']
              }
            }
          },
          required: ['picks']
        }
      }
    }
  ],
  
  NHL: [
    {
      type: 'function',
      function: {
        name: 'fetch_player_game_logs',
        description: 'Fetch last 5-10 NHL game logs (goals, assists, points, shots on goal, TOI, +/-)',
        parameters: {
          type: 'object',
          properties: {
            player_name: { type: 'string', description: 'Full player name (e.g., "Connor McDavid")' }
          },
          required: ['player_name']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'fetch_player_season_stats',
        description: 'Fetch NHL season stats (goals, assists, points, SOG, shooting %, PP points)',
        parameters: {
          type: 'object',
          properties: {
            player_name: { type: 'string', description: 'Full player name' }
          },
          required: ['player_name']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'fetch_goalie_stats',
        description: 'Fetch goalie stats for an NHL team (saves, save %, GAA)',
        parameters: {
          type: 'object',
          properties: {
            team_name: { type: 'string', description: 'Team name (e.g., "Oilers")' }
          },
          required: ['team_name']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'search_player_context',
        description: 'Search for recent news, injuries, or context about a player',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' }
          },
          required: ['query']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'search_game_narrative',
        description: `Search for NHL narrative context that BDL cannot provide. Categories:
          
          BREAKING_NEWS: Last-minute scratches, trade rumors, coaching changes
          MOTIVATION: Revenge games (vs former team), milestone chasing, contract year, playoff implications
          SCHEDULE: Back-to-back fatigue, road trip length, rest advantage
          PLAYER_SPECIFIC: Load management, line combination changes, recent coach quotes
          
          BETTING_SIGNALS: ⚠️ Line movement and public betting % are SUPPLEMENTARY signals ONLY.
          These should NEVER be the primary reason for a pick.`,
        parameters: {
          type: 'object',
          properties: {
            query: { 
              type: 'string', 
              description: 'Specific narrative search (e.g., "McDavid revenge game former team context")' 
            },
            context_type: {
              type: 'string',
              enum: ['breaking_news', 'motivation', 'schedule', 'player_specific', 'betting_signals'],
              description: 'Category of context. Use betting_signals sparingly.'
            }
          },
          required: ['query', 'context_type']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'finalize_props',
        description: 'Output final prop picks with rationales',
        parameters: {
          type: 'object',
          properties: {
            picks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  player: { type: 'string' },
                  team: { type: 'string' },
                  prop: { type: 'string' },
                  line: { type: 'number' },
                  bet: { type: 'string', enum: ['over', 'under'] },
                  odds: { type: 'number' },
                  confidence: { type: 'number' },
                  rationale: { type: 'string' },
                  key_stats: { type: 'array', items: { type: 'string' } }
                },
                required: ['player', 'team', 'prop', 'line', 'bet', 'odds', 'confidence', 'rationale', 'key_stats']
              }
            }
          },
          required: ['picks']
        }
      }
    }
  ],
  
  NFL: [
    {
      type: 'function',
      function: {
        name: 'fetch_player_game_logs',
        description: 'Fetch last 5 NFL game logs (passing/rushing/receiving yards, TDs, receptions)',
        parameters: {
          type: 'object',
          properties: {
            player_name: { type: 'string', description: 'Full player name (e.g., "George Pickens")' },
            stat_type: { type: 'string', enum: ['receiving', 'rushing', 'passing', 'all'], description: 'Type of stats to fetch' }
          },
          required: ['player_name']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'fetch_player_season_stats',
        description: 'Fetch NFL season stats (total yards, TDs, targets, carries)',
        parameters: {
          type: 'object',
          properties: {
            player_name: { type: 'string', description: 'Full player name' }
          },
          required: ['player_name']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'fetch_advanced_passing_stats',
        description: 'Fetch NFL advanced passing stats from BDL API (aggressiveness, avg_time_to_throw, completion_pct_above_expected, avg_air_yards, passer_rating)',
        parameters: {
          type: 'object',
          properties: {
            player_name: { type: 'string', description: 'Full player name (QB)' },
            week: { type: 'number', description: 'Specific week (0 for full season)' }
          },
          required: ['player_name']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'fetch_advanced_rushing_stats',
        description: 'Fetch NFL advanced rushing stats from BDL API (efficiency, rush_yards_over_expected, avg_time_to_los, percent_attempts_gte_eight_defenders)',
        parameters: {
          type: 'object',
          properties: {
            player_name: { type: 'string', description: 'Full player name (RB/QB)' },
            week: { type: 'number', description: 'Specific week (0 for full season)' }
          },
          required: ['player_name']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'fetch_advanced_receiving_stats',
        description: 'Fetch NFL advanced receiving stats from BDL API (avg_cushion, avg_separation, avg_yac, catch_percentage, percent_share_of_intended_air_yards)',
        parameters: {
          type: 'object',
          properties: {
            player_name: { type: 'string', description: 'Full player name (WR/TE/RB)' },
            week: { type: 'number', description: 'Specific week (0 for full season)' }
          },
          required: ['player_name']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'fetch_team_season_stats',
        description: 'Fetch comprehensive NFL team season stats from BDL API (offense, defense, special teams, opponent stats)',
        parameters: {
          type: 'object',
          properties: {
            team_name: { type: 'string', description: 'Team name (e.g., "Eagles")' }
          },
          required: ['team_name']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'fetch_team_game_stats',
        description: 'Fetch NFL team stats for a specific game (real-time for in-progress games)',
        parameters: {
          type: 'object',
          properties: {
            team_name: { type: 'string', description: 'Team name' },
            game_id: { type: 'number', description: 'BDL game ID (optional)' }
          },
          required: ['team_name']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'fetch_team_injuries',
        description: 'Fetch current NFL team injury report from BDL API',
        parameters: {
          type: 'object',
          properties: {
            team_name: { type: 'string', description: 'Team name (e.g., "Eagles")' }
          },
          required: ['team_name']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'fetch_team_roster',
        description: 'Fetch NFL team roster with depth chart from BDL API (2025+ season)',
        parameters: {
          type: 'object',
          properties: {
            team_name: { type: 'string', description: 'Team name (e.g., "Eagles")' }
          },
          required: ['team_name']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'search_player_context',
        description: 'Search for recent news, injuries, or context about a player (use only when BDL data is insufficient)',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' }
          },
          required: ['query']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'search_game_narrative',
        description: `Search for NFL narrative context that BDL cannot provide. Categories:
          
          BREAKING_NEWS: Gameday inactives, trade deadline buzz, coaching/coordinator changes, locker room drama
          MOTIVATION: Revenge games (vs former team), milestone chasing, contract year, playoff implications
          SCHEDULE: Trap game spots, short week (TNF/MNF), travel fatigue (coast-to-coast)
          PLAYER_SPECIFIC: Target share trends, recent coach/player quotes, role changes
          
          BETTING_SIGNALS: ⚠️ Line movement and public betting % are SUPPLEMENTARY signals ONLY.
          These should NEVER be the primary reason for a pick.`,
        parameters: {
          type: 'object',
          properties: {
            query: { 
              type: 'string', 
              description: 'Specific narrative search (e.g., "Patrick Mahomes revenge game context", "Eagles trap game spot before playoffs")' 
            },
            context_type: {
              type: 'string',
              enum: ['breaking_news', 'motivation', 'schedule', 'player_specific', 'betting_signals'],
              description: 'Category of context. Use betting_signals sparingly.'
            }
          },
          required: ['query', 'context_type']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'finalize_props',
        description: 'Output final prop picks with rationales',
        parameters: {
          type: 'object',
          properties: {
            picks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  player: { type: 'string' },
                  team: { type: 'string' },
                  prop: { type: 'string' },
                  line: { type: 'number' },
                  bet: { type: 'string', enum: ['over', 'under'] },
                  odds: { type: 'number' },
                  confidence: { type: 'number' },
                  rationale: { type: 'string' },
                  key_stats: { type: 'array', items: { type: 'string' } }
                },
                required: ['player', 'team', 'prop', 'line', 'bet', 'odds', 'confidence', 'rationale', 'key_stats']
              }
            }
          },
          required: ['picks']
        }
      }
    }
  ]
};

/**
 * Get prop tokens for a specific sport
 */
export function getPropTokensForSport(sport) {
  return ALL_PROP_TOKENS_BY_SPORT[sport] || [];
}

/**
 * Get tool definitions for a specific sport's props
 */
export function getPropsToolsForSport(sport) {
  return propsToolDefinitions[sport] || propsToolDefinitions.NFL;
}

/**
 * Format prop tokens as a display string for prompts
 */
export function formatPropTokenMenu(sport) {
  const tokens = getPropTokensForSport(sport);
  if (!tokens.length) return '';
  
  // Gemini-only tokens (live search required)
  const geminiTokens = ALL_GEMINI_TOKENS;
  
  const grouped = {
    'Core Stats (BDL)': [],
    'Advanced Stats (BDL)': [],
    'Game Data (BDL)': [],
    'Team Context (BDL)': [],
    'Goalie Stats (BDL)': [],
    '--- GEMINI LIVE SEARCH ---': [],
    'Breaking News (Gemini)': [],
    'Motivation (Gemini)': [],
    'Schedule Context (Gemini)': [],
    'Player Narrative (Gemini)': [],
    'Betting Signals (Gemini) ⚠️ MINOR ONLY': [],
  };
  
  tokens.forEach(token => {
    // Categorize Gemini tokens
    if (GEMINI_CONTEXT_TOKENS.BREAKING_NEWS.includes(token)) {
      grouped['Breaking News (Gemini)'].push(token);
    } else if (GEMINI_CONTEXT_TOKENS.MOTIVATION.includes(token)) {
      grouped['Motivation (Gemini)'].push(token);
    } else if (GEMINI_CONTEXT_TOKENS.SCHEDULE_CONTEXT.includes(token)) {
      grouped['Schedule Context (Gemini)'].push(token);
    } else if (GEMINI_CONTEXT_TOKENS.PLAYER_CONTEXT.includes(token)) {
      grouped['Player Narrative (Gemini)'].push(token);
    } else if (GEMINI_CONTEXT_TOKENS.BETTING_SIGNALS.includes(token)) {
      grouped['Betting Signals (Gemini) ⚠️ MINOR ONLY'].push(token);
    }
    // Categorize BDL tokens
    else if (token.startsWith('PLAYER_')) {
      const stat = token.replace('PLAYER_', '');
      if (['POINTS', 'REBOUNDS', 'ASSISTS', 'THREES', 'PRA', 'GOALS', 'SHOTS'].includes(stat)) {
        grouped['Core Stats (BDL)'].push(token);
      } else if (['ADVANCED_STATS', 'USAGE_STATS', 'SCORING_STATS', 'CLUTCH_STATS', 'DEFENSIVE_STATS', 'SHOOTING_ZONES'].includes(stat)) {
        grouped['Advanced Stats (BDL)'].push(token);
      } else if (['GAME_LOGS', 'VS_OPPONENT', 'HOME_AWAY', 'GAME_ADVANCED'].includes(stat)) {
        grouped['Game Data (BDL)'].push(token);
      } else {
        grouped['Core Stats (BDL)'].push(token);
      }
    } else if (token.startsWith('GOALIE_')) {
      grouped['Goalie Stats (BDL)'].push(token);
    } else if (token.startsWith('TEAM_') || token.includes('ROSTER') || token.includes('LINEUP') || token.includes('INJURIES')) {
      grouped['Team Context (BDL)'].push(token);
    } else if (token.startsWith('LIVE_') || token.startsWith('GAME_')) {
      grouped['Game Data (BDL)'].push(token);
    } else {
      grouped['Team Context (BDL)'].push(token);
    }
  });
  
  let output = '';
  for (const [category, categoryTokens] of Object.entries(grouped)) {
    if (categoryTokens.length > 0) {
      output += `\n${category}: ${categoryTokens.map(t => `[${t}]`).join(' ')}`;
    } else if (category === '--- GEMINI LIVE SEARCH ---') {
      output += `\n\n--- GEMINI LIVE SEARCH (use search_game_narrative tool) ---`;
    }
  }
  
  return output.trim();
}

/**
 * Format Gemini context guidance for prompts
 */
export function formatGeminiContextGuidance() {
  return `
GEMINI LIVE SEARCH GUIDANCE:
Use the search_game_narrative tool to find context BDL cannot provide:

📰 BREAKING NEWS: Last-minute scratches, trade rumors, coaching changes, locker room issues
💪 MOTIVATION: Revenge games, milestones, contract years, playoff implications  
📅 SCHEDULE: B2B fatigue, trap games, altitude, travel
👤 PLAYER: Load management, matchup history, coach quotes

⚠️ BETTING SIGNALS (LINE_MOVEMENT, PUBLIC_BETTING_PCT):
   - These are SUPPLEMENTARY data points ONLY
   - NEVER use as primary reason for a pick
   - Use as "interesting to note" context
   - Example: "85% public on Lakers, but the line hasn't moved - sharps may be on the other side"
`;
}

export { 
  NBA_PROP_TOKENS, 
  NHL_PROP_TOKENS, 
  NFL_PROP_TOKENS, 
  EPL_PROP_TOKENS,
  NCAAB_PROP_TOKENS,
  NCAAF_PROP_TOKENS,
  ALL_PROP_TOKENS,
  ALL_PROP_TOKENS_BY_SPORT,
  GEMINI_CONTEXT_TOKENS,
  ALL_GEMINI_TOKENS
};

