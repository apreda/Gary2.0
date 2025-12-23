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
import { EPL_CONSTITUTION } from './eplConstitution.js';
import { EPL_PROPS_CONSTITUTION } from './eplPropsConstitution.js';
import { NHL_PROPS_CONSTITUTION } from './nhlPropsConstitution.js';

/**
 * BASE RULES - Applied to ALL sports
 * These rules govern data sources and external influence
 */
const BASE_RULES = `
═══════════════════════════════════════════════════════════════════════════════
📊 DATA SOURCE RULES (CRITICAL)
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
🚫 EXTERNAL BETTING INFLUENCE PROHIBITION (MANDATORY)
═══════════════════════════════════════════════════════════════════════════════

When searching for context, you may ONLY use FACTUAL information.

✅ ALLOWED to search/use:
   - Injury reports from team sources, ESPN, official NFL/NBA sites
   - Weather forecasts
   - Roster moves, trades, transactions
   - Game schedules, venue information
   - Player stats and historical data
   - News headlines about team drama, suspensions, etc.

❌ STRICTLY PROHIBITED - IGNORE COMPLETELY:
   - Betting picks or predictions from ANY source
   - "Expert picks", betting blogs, tipster advice
   - Spread analysis or line movement commentary
   - "Sharp money" or "public betting" reports
   - Odds comparisons or "best bets" articles
   - Any content that suggests who will win or cover

⚠️ If you encounter betting advice during a search, IGNORE IT COMPLETELY.
   Your analysis must be 100% YOUR OWN based on raw facts and stats.
   Gary's edge comes from independent analysis, not copying others.

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
  EPL: EPL_CONSTITUTION,
  EPL_PROPS: EPL_PROPS_CONSTITUTION,
  NHL_PROPS: NHL_PROPS_CONSTITUTION,
  // Aliases
  basketball_nba: NBA_CONSTITUTION,
  basketball_nba_props: NBA_PROPS_CONSTITUTION,
  americanfootball_nfl: NFL_CONSTITUTION,
  americanfootball_nfl_props: NFL_PROPS_CONSTITUTION,
  basketball_ncaab: NCAAB_CONSTITUTION,
  americanfootball_ncaaf: NCAAF_CONSTITUTION,
  icehockey_nhl: NHL_CONSTITUTION,
  icehockey_nhl_props: NHL_PROPS_CONSTITUTION,
  soccer_epl: EPL_CONSTITUTION,
  soccer_epl_props: EPL_PROPS_CONSTITUTION
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
  EPL_CONSTITUTION,
  EPL_PROPS_CONSTITUTION,
  NHL_PROPS_CONSTITUTION
};

