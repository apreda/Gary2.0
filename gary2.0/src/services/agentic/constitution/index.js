/**
 * Constitution Index - Export all sport constitutions
 */

import { NBA_CONSTITUTION } from './nbaConstitution.js';
import { NFL_CONSTITUTION } from './nflConstitution.js';
import { NCAAF_CONSTITUTION } from './ncaafConstitution.js';
import { MLB_CONSTITUTION } from './mlbConstitution.js'; // restored Aug 18 2026 — June engine returns for MLB games
import { NFL_PROPS_CONSTITUTION } from './nflPropsConstitution.js';
import { NBA_PROPS_CONSTITUTION } from './nbaPropsConstitution.js';
// (mlbPropsConstitution deleted Jul 26 2026 — MLB props run the desk lane, constitution-less.)
/**
 * BASE RULES - Applied to ALL sports
 * These rules govern data sources and external influence
 */
// DESK-ONLY (Aug 27 2026 consolidation, text corrected Sep 1): every
// production brain runs on a CLI bridge with zero tools — the desk in the
// conversation is the entire evidence. The old text ordered Gary to call
// fetch_stats() and live search, tools no session carries anymore. If a
// tool-capable API brain (gpt-/anthropic- prefix) is ever revived as a
// pick lane, this block must be revisited alongside it.
const BASE_RULES = `
═══════════════════════════════════════════════════════════════════════════════
[DATA] DATA SOURCE RULES (CRITICAL)
═══════════════════════════════════════════════════════════════════════════════

1. THE DESK IS THE EVIDENCE - This conversation carries no live tools
   - Every stat, name, and number you use comes from the scout report and the materials provided in this conversation
   - There is no stat-fetch tool and no live search here - never reference calling one, and never wait for more data to arrive

2. LIVE CONTEXT - Search results the desk carries (breaking news, storylines, weather) were retrieved for you before this conversation started
   - Treat them as provided data, same as any desk section

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
[ANTI-HALLUCINATION] 2026 ROSTER & DATA REALITY (ALL SPORTS)
═══════════════════════════════════════════════════════════════════════════════

Your training data pre-dates the current season. It is NOW 2026.
- Players have been traded — a player you "know" is on Team X may be on Team Y
- Rookies you have never heard of are producing now; draft classes you "know" have moved on
- Coaching changes, conference realignment, and transfer portal moves have reshaped rosters
- Use ONLY the provided Scout Report and BDL API data for current rosters
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
  NCAAF: NCAAF_CONSTITUTION,
  MLB: MLB_CONSTITUTION, // restored Aug 18 2026 — June engine
  // Aliases
  basketball_nba: NBA_CONSTITUTION,
  americanfootball_nfl: NFL_CONSTITUTION,
  americanfootball_ncaaf: NCAAF_CONSTITUTION,
  baseball_mlb: MLB_CONSTITUTION, // restored Aug 18 2026 — June engine
};

/**
 * Props constitutions — sectioned objects { pass1, pass2, pass25, pass3 }
 * for phase-aligned delivery (context injected at each pass, not front-loaded).
 */
const PROPS_CONSTITUTIONS = {
  NFL_PROPS: NFL_PROPS_CONSTITUTION,
  NBA_PROPS: NBA_PROPS_CONSTITUTION,
  MLB_PROPS: '',  // desk lane — MLB props carry no constitution (Jul 26 2026)
  basketball_nba_props: NBA_PROPS_CONSTITUTION,
  americanfootball_nfl_props: NFL_PROPS_CONSTITUTION,
  baseball_mlb_props: '',
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
    const bilateralCasePrompt = sportConst.bilateralCasePrompt || null;

    // Sectioned constitution — return object with convenience .full property
    return {
      baseRules: BASE_RULES,
      domainKnowledge,
      guardrails,
      pass1Context,
      pass25DecisionGuards,
      bilateralCasePrompt,
      // Full combined string: guardrails + domain knowledge ONLY —
      // Gary is the decision maker and the desk is his whole evidence.
      full: BASE_RULES + guardrails + (domainKnowledge ? '\n\n' + domainKnowledge : ''),
    };
  }

  return BASE_RULES;
}

// All constitution constants are consumed via getConstitution() only.
// No named re-exports needed.
