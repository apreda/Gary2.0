/**
 * NFL Constitution - NFL-Specific Context for Gary
 *
 * Two sections for phase-aligned delivery:
 * - domainKnowledge: NFL-specific reference (key numbers, on/off data warning, injury timing)
 * - guardrails: H2H zero tolerance
 *
 * Covered elsewhere (do NOT duplicate here):
 * - Player universe / roster rules → BASE_RULES + system prompt FACT-CHECKING PROTOCOL
 * - Stat categories / causal vs descriptive → system prompt <analysis_framework>
 * - Team vs player stats → system prompt <identity> + <core_principles>
 * - Stat definitions (EPA, DVOA, success rate, CPOE) → model knowledge
 * - Data source catalog / token list → Flash investigation prompts + scout report
 * - Bet type (spread/ML) / spread mechanics → system prompt <output_format>
 * - ML implied probability → model knowledge
 * - Transitive property → BASE_RULES
 * - Narrative awareness → system prompt NARRATIVE AWARENESS
 * - Anti-hallucination / current season → BASE_RULES
 * - Matchup tags (tournamentContext) → system prompt output format + scout report auto-populates
 * - Ranking tiers / gap examples → anchors Gary on specific stats (subtle L3)
 * - LEFT vs OUT → BASE_RULES + system prompt (GONE vs OUT)
 * - QB importance → L3 violation (assigns significance to position)
 * - Team style profiles → L3 violation (maps stats to identity conclusions)
 * - Hard vs soft factors → L3 violation (ranks factor types)
 * - L5 context / roster matching → system prompt timeframe + Flash investigation prompts
 * - Revenge context → Flash investigation prompts + system prompt NARRATIVE AWARENESS
 * - Roster addendum → Flash ROSTER CONTEXT PRINCIPLE + system prompt
 */

import {
  getH2HZeroTolerance,
} from './sharedConstitutionBlocks.js';

export const NFL_CONSTITUTION = {

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION A: DOMAIN KNOWLEDGE — NFL-specific reference material
  // ═══════════════════════════════════════════════════════════════════════════
  domainKnowledge: `
## NFL ANALYSIS

### KEY NUMBERS
- **3 points**: Field goal — 15%+ of games decided by exactly 3
- **7 points**: Touchdown — another 15%+ decided by exactly 7
- **10 points**: TD + FG — third most common margin
- 30%+ of NFL games end by 3 or 7 points

### ON/OFF SPLITS vs GAMES MISSED
These are two different stats — do not conflate them:
- **"Team is X points worse without Player"** = games the player MISSED ENTIRELY
- **"Player averages X yards when on the field vs Y"** = efficiency when active

If citing a recent loss as evidence of struggles without a player, verify the player's status in that specific game.

### NFL INJURY TIMING
NFL uses weekly schedules — even "recent" absences may span only 1-2 games of data.
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION B: REMOVED — Investigation prompts in flashInvestigationPrompts.js
  // ═══════════════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION C: STRUCTURAL GUARDRAILS (Hard rules — always enforced)
  // H2H zero tolerance
  // ═══════════════════════════════════════════════════════════════════════════
  guardrails: `
${getH2HZeroTolerance('NFL')}
`
};


export default NFL_CONSTITUTION;
