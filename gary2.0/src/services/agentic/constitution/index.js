/**
 * Constitution Index - Export all sport constitutions
 */

import { NBA_CONSTITUTION } from './nbaConstitution.js';
import { NFL_CONSTITUTION } from './nflConstitution.js';
import { NCAAB_CONSTITUTION } from './ncaabConstitution.js';
import { NCAAF_CONSTITUTION } from './ncaafConstitution.js';
import { NHL_CONSTITUTION } from './nhlConstitution.js';
import { MLB_CONSTITUTION } from './mlbConstitution.js';
import { NFL_PROPS_CONSTITUTION } from './nflPropsConstitution.js';
import { NBA_PROPS_CONSTITUTION } from './nbaPropsConstitution.js';
import { NHL_PROPS_CONSTITUTION } from './nhlPropsConstitution.js';
/**
 * BASE RULES - Applied to ALL sports
 * These rules govern data sources and external influence
 */
const BASE_RULES = `
═══════════════════════════════════════════════════════════════════════════════
[DATA] DATA SOURCE RULES (CRITICAL)
═══════════════════════════════════════════════════════════════════════════════

1. STATISTICS - Use fetch_stats() tool ONLY (BDL API)
   - ALL hard stats (scoring, efficiency, rates, ratings, splits) must come from fetch_stats()
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

When using search/grounding context:
- Use factual events only (injury status, schedule, transactions, weather, verified results).
- Ignore all third-party picks, predictions, betting advice, and market-opinion commentary.
- If a source mixes facts and opinions, extract the facts only and discard the rest.

═══════════════════════════════════════════════════════════════════════════════

═══════════════════════════════════════════════════════════════════════════════
[LOGIC] THE TRANSITIVE PROPERTY TRAP (APPLIES TO ALL SPORTS)
═══════════════════════════════════════════════════════════════════════════════

Avoid transitive logic ("A beat B, B beat C, so A beats C"). Matchups are opponent-specific and context-specific. Evaluate THIS matchup fresh.

═══════════════════════════════════════════════════════════════════════════════
[CRITICAL] NO SPECULATIVE PLAYER IMPACT PREDICTIONS (ALL SPORTS)
═══════════════════════════════════════════════════════════════════════════════

You are an LLM, not a film analyst. You have NOT watched game tape. You CANNOT predict:
- [NO] "Player X's ability to attack mismatches will..."
- [NO] "He'll exploit their weak perimeter defense..."
- [NO] "As an elite playmaker, he'll..."

You CAN use ACTUAL MEASURED DATA:
- [YES] "Team A allows 42% from 3 in L5 games" (measured stat)
- [YES] "Player X averages 28.5 PPG on 60% TS this season" (measured stat)
- [YES] "Team B's DRtg drops to 118 without Player Y" (measured stat)
Stick to what the DATA shows. If the stats don't support a claim, don't make it.

═══════════════════════════════════════════════════════════════════════════════
[ANTI-HALLUCINATION] 2026 ROSTER & DATA REALITY (ALL SPORTS)
═══════════════════════════════════════════════════════════════════════════════

Your training data is from 2024. It is NOW 2026.
- Players have been traded — a player you "know" is on Team X may be on Team Y
- Players from the 2024 draft class are now Sophomores with 100+ games experience
- Coaching changes, conference realignment, and transfer portal moves have reshaped rosters
- Use ONLY the provided Scout Report and BDL API data for current rosters
- If a player is NOT listed in the scout report roster section, DO NOT mention them
- HEAD-TO-HEAD: ZERO TOLERANCE FOR GUESSING — only cite H2H if it exists in scout report or fetched data for this game; if no H2H data exists, omit H2H entirely.

═══════════════════════════════════════════════════════════════════════════════
`;

/**
 * Game-pick constitutions — sectioned objects
 * { domainKnowledge, guardrails, pass1Context, pass25DecisionGuards }
 * or flat strings (legacy, not yet restructured).
 */
const GAME_CONSTITUTIONS = {
  NBA: NBA_CONSTITUTION,
  NFL: NFL_CONSTITUTION,
  NCAAB: NCAAB_CONSTITUTION,
  NCAAF: NCAAF_CONSTITUTION,
  NHL: NHL_CONSTITUTION,
  MLB: MLB_CONSTITUTION,
  // Aliases
  basketball_nba: NBA_CONSTITUTION,
  americanfootball_nfl: NFL_CONSTITUTION,
  basketball_ncaab: NCAAB_CONSTITUTION,
  americanfootball_ncaaf: NCAAF_CONSTITUTION,
  icehockey_nhl: NHL_CONSTITUTION,
  baseball_mlb: MLB_CONSTITUTION,
};

/**
 * Props constitutions — sectioned objects { pass1, pass2, pass25, pass3 }
 * for phase-aligned delivery (context injected at each pass, not front-loaded).
 */
const PROPS_CONSTITUTIONS = {
  NFL_PROPS: NFL_PROPS_CONSTITUTION,
  NBA_PROPS: NBA_PROPS_CONSTITUTION,
  NHL_PROPS: NHL_PROPS_CONSTITUTION,
  basketball_nba_props: NBA_PROPS_CONSTITUTION,
  americanfootball_nfl_props: NFL_PROPS_CONSTITUTION,
  icehockey_nhl_props: NHL_PROPS_CONSTITUTION,
};

/**
 * Get constitution for a sport.
 *
 * For game-pick sports with sectioned constitutions (objects):
 *   Returns { baseRules, domainKnowledge, guardrails, pass1Context, pass25DecisionGuards, full }
 *   - .full = all sections combined (for system prompt at session creation)
 *   - Individual sections allow phase-aligned delivery (Pass 1 / Pass 2.5 injection)
 *
 * For props sports (sectioned objects):
 *   Returns { baseRules, pass1, pass2, pass25, pass3 }
 *   - Each pass section is injected at the right moment during the 4-pass pipeline
 *
 * For legacy flat-string constitutions:
 *   Returns a flat string (BASE_RULES + constitution)
 */
export function getConstitution(sport) {
  const normalized = sport?.toUpperCase?.() || sport;

  // Props — sectioned objects { pass1, pass2, pass25, pass3 }
  const propsConst = PROPS_CONSTITUTIONS[normalized] || PROPS_CONSTITUTIONS[sport];
  if (propsConst) {
    if (typeof propsConst === 'object' && propsConst.pass1) {
      return {
        baseRules: BASE_RULES,
        pass1: propsConst.pass1,
        pass2: propsConst.pass2,
        pass25: propsConst.pass25,
        pass3: propsConst.pass3,
      };
    }
    // Legacy flat string fallback
    return BASE_RULES + propsConst;
  }

  // Game picks — may be sectioned object or legacy flat string
  const sportConst = GAME_CONSTITUTIONS[normalized] || GAME_CONSTITUTIONS[sport];

  if (sportConst && typeof sportConst === 'object') {
    const domainKnowledge = sportConst.domainKnowledge || '';
    const guardrails = sportConst.guardrails || '';
    const pass1Context = sportConst.pass1Context || '';
    const pass25DecisionGuards = sportConst.pass25DecisionGuards || '';

    // Sectioned constitution — return object with convenience .full property
    return {
      baseRules: BASE_RULES,
      domainKnowledge,
      guardrails,
      pass1Context,
      pass25DecisionGuards,
      // Full combined string: guardrails + domain knowledge ONLY
      // Gary is the decision maker. Flash handles investigation via flashInvestigationPrompts.js.
      full: BASE_RULES + guardrails + (domainKnowledge ? '\n\n' + domainKnowledge : ''),
    };
  }

  return BASE_RULES;
}

// All constitution constants are consumed via getConstitution() only.
// No named re-exports needed.
