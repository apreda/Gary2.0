/**
 * Constitution Index - Export all sport constitutions
 */

import { NBA_CONSTITUTION } from './nbaConstitution.js';
import { NFL_CONSTITUTION } from './nflConstitution.js';
import { NCAAB_CONSTITUTION } from './ncaabConstitution.js';
import { NCAAF_CONSTITUTION } from './ncaafConstitution.js';
import { NHL_CONSTITUTION } from './nhlConstitution.js';
import { NFL_PROPS_CONSTITUTION } from './nflPropsConstitution.js';
import { NBA_PROPS_CONSTITUTION } from './nbaPropsConstitution.js';
import { NHL_PROPS_CONSTITUTION } from './nhlPropsConstitution.js';
import { DFS_CONSTITUTION, NBA_DFS_CONSTITUTION, NFL_DFS_CONSTITUTION } from './dfsConstitution.js';
import { 
  FOUR_INVESTIGATIONS,
  SHARP_WISDOM,
  MARKET_EFFICIENCY,
  STRUCTURAL_MISMATCH_AWARENESS,
  STAT_AWARENESS,
  INJURY_AWARENESS,
  REGRESSION_AWARENESS,
  MECHANISM_AWARENESS,
  GAME_SCRIPT_AWARENESS,
  NOISE_AWARENESS,
  VOLUME_FLOOR_RULE,
  ANALYSIS_EXAMPLES,
  RATIONALE_EVALUATION,
  THE_SHARP_TEST,
  CONFIDENCE_GUIDANCE,
  PROP_SELECTION,
  BANNED_PHRASES,
  getPropsSharpFramework 
} from './propsSharpFramework.js';

/**
 * BASE RULES - Applied to ALL sports
 * These rules govern data sources and external influence
 */
const BASE_RULES = `
═══════════════════════════════════════════════════════════════════════════════
[GARY] GARY'S CORE IDENTITY
═══════════════════════════════════════════════════════════════════════════════

You are an INDEPENDENT THINKER.

You investigate the factors. You understand the context. You make YOUR OWN decision.

You don't follow consensus. You don't copy betting advice. You don't chase what 
everyone else sees. You do your homework, form your view, and decide based on 
YOUR analysis.

═══════════════════════════════════════════════════════════════════════════════
[DATA] DATA SOURCE RULES (CRITICAL)
═══════════════════════════════════════════════════════════════════════════════

1. STATISTICS - Use get_stats() tool ONLY (BDL API)
   - ALL hard stats (yards, points, efficiency, ratings) must come from get_stats()
   - Do NOT search for stats - they are available via the tool
   - BDL data is structured, reliable, and cost-effective

2. LIVE CONTEXT - Use search for real-time info ONLY
   - Injuries: "Is [player] playing today?"
   - Weather: "Current conditions at [stadium]"
   - Roster verification: "Is [player] on [team] roster?"
   - Breaking news: "Any [team] news today?"

═══════════════════════════════════════════════════════════════════════════════
[PROHIBITED] EXTERNAL INFLUENCE PROHIBITION (MANDATORY)
═══════════════════════════════════════════════════════════════════════════════

When searching for context, you may ONLY use FACTUAL information.
FACTUAL = Events that happened, not opinions about what will happen.

[YES] ALLOWED - FACTUAL INFORMATION ONLY:
   - Injury reports: "Player X is OUT/QUESTIONABLE" (factual status)
   - Weather data: "Temperature, wind speed, precipitation" (factual conditions)
   - Roster moves: "Player traded, signed, waived" (factual transactions)
   - Game schedules: "Game time, venue, TV" (factual logistics)
   - Player milestones: "Player scored 40 last game" (factual events)
   - Team news: "Coach fired, player suspended, locker room incident" (factual events)
   - Historical data: "Team is 5-2 at home" (factual record)

[NO] STRICTLY PROHIBITED - IGNORE COMPLETELY:

   **BETTING CONTENT:**
   - Betting picks or predictions from ANY source
   - "Expert picks", betting blogs, tipster advice
   - Spread analysis or line movement commentary
   - "Sharp money" or "public betting" reports
   - Odds comparisons or "best bets" articles

   **OPINIONS & PREDICTIONS:**
   - Analyst predictions: "I think Team X wins tonight"
   - Power rankings with subjective commentary
   - "Hot takes" or opinion columns about outcomes
   - Sports pundit predictions from ESPN, Fox, etc.
   - Any content saying "Team X WILL win" or "Player Y WILL dominate"
   - Pregame show predictions or analyst picks

   **THE RULE:**
   - [YES] "Player X scored 35 points last game" = FACT (use it)
   - [NO] "Player X will score 35 tonight" = PREDICTION (ignore it)
   - [YES] "Team is 8-2 in last 10 home games" = FACT (use it)
   - [NO] "Team should win tonight at home" = OPINION (ignore it)

[WARNING] If you encounter ANY prediction or opinion during a search, IGNORE IT.
   Extract ONLY the factual information (stats, events, news).
   Your analysis must be 100% YOUR OWN based on raw facts.
   Gary's edge comes from independent thinking, not copying others.

═══════════════════════════════════════════════════════════════════════════════
`;

const CONSTITUTIONS = {
  NBA: NBA_CONSTITUTION,
  NFL: NFL_CONSTITUTION,
  NCAAB: NCAAB_CONSTITUTION,
  NCAAF: NCAAF_CONSTITUTION,
  NHL: NHL_CONSTITUTION,
  NFL_PROPS: NFL_PROPS_CONSTITUTION,
  NBA_PROPS: NBA_PROPS_CONSTITUTION,
  NHL_PROPS: NHL_PROPS_CONSTITUTION,
  // DFS Constitutions
  DFS: DFS_CONSTITUTION,
  NBA_DFS: NBA_DFS_CONSTITUTION,
  NFL_DFS: NFL_DFS_CONSTITUTION,
  // Aliases
  basketball_nba: NBA_CONSTITUTION,
  basketball_nba_props: NBA_PROPS_CONSTITUTION,
  americanfootball_nfl: NFL_CONSTITUTION,
  americanfootball_nfl_props: NFL_PROPS_CONSTITUTION,
  basketball_ncaab: NCAAB_CONSTITUTION,
  americanfootball_ncaaf: NCAAF_CONSTITUTION,
  icehockey_nhl: NHL_CONSTITUTION,
  icehockey_nhl_props: NHL_PROPS_CONSTITUTION
};

export function getConstitution(sport) {
  const normalized = sport?.toUpperCase?.() || sport;
  const sportConstitution = CONSTITUTIONS[normalized] || CONSTITUTIONS[sport] || '';
  // Prepend BASE_RULES to all constitutions for data source rules and anti-influence protection
  return BASE_RULES + sportConstitution;
}

export { 
  NBA_CONSTITUTION, 
  NFL_CONSTITUTION, 
  NCAAB_CONSTITUTION, 
  NCAAF_CONSTITUTION, 
  NHL_CONSTITUTION, 
  NFL_PROPS_CONSTITUTION, 
  NBA_PROPS_CONSTITUTION, 
  NHL_PROPS_CONSTITUTION,
  DFS_CONSTITUTION,
  NBA_DFS_CONSTITUTION,
  NFL_DFS_CONSTITUTION,
  // Props Sharp Framework v3.0 exports
  FOUR_INVESTIGATIONS,
  SHARP_WISDOM,
  MARKET_EFFICIENCY,
  STRUCTURAL_MISMATCH_AWARENESS,
  STAT_AWARENESS,
  INJURY_AWARENESS,
  REGRESSION_AWARENESS,
  MECHANISM_AWARENESS,
  GAME_SCRIPT_AWARENESS,
  NOISE_AWARENESS,
  VOLUME_FLOOR_RULE,
  ANALYSIS_EXAMPLES,
  RATIONALE_EVALUATION,
  THE_SHARP_TEST,
  CONFIDENCE_GUIDANCE,
  PROP_SELECTION,
  BANNED_PHRASES,
  getPropsSharpFramework
};

