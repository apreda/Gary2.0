/**
 * NHL Constitution - NHL-Specific Context for Gary
 *
 * Two sections for phase-aligned delivery:
 * - domainKnowledge: NHL-specific reference (home ice last change, moneyline only)
 * - guardrails: H2H zero tolerance, IR/LTIR roster note
 *
 * Covered elsewhere (do NOT duplicate here):
 * - Player universe / roster rules → BASE_RULES + system prompt FACT-CHECKING PROTOCOL
 * - Stat categories / causal vs descriptive → system prompt <analysis_framework>
 * - Stat definitions (Corsi, PDO, xG, GSAx, HDSV%) → model knowledge
 * - Data source catalog / token list → Flash investigation prompts + scout report
 * - Goaltending investigation → Flash investigation prompts (factor #2 + deep investigation)
 * - Situational factors (PP%, B2B, rest) → Flash investigation prompts
 * - Goalie-streak connection → Flash investigation prompts
 * - Transitive property → BASE_RULES
 * - Narrative awareness → system prompt NARRATIVE AWARENESS
 * - Anti-hallucination / current season → BASE_RULES
 * - Matchup tags (tournamentContext) → system prompt output format + scout report auto-populates
 * - Ranking tiers → L3 violation (assigns significance)
 */

import {
  getH2HZeroTolerance,
} from './sharedConstitutionBlocks.js';

export const NHL_CONSTITUTION = {

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION A: DOMAIN KNOWLEDGE — NHL-specific reference material
  // ═══════════════════════════════════════════════════════════════════════════
  domainKnowledge: `
## NHL ANALYSIS

### THE SPORT
- NHL home teams have the last change — the ability to match lines against the opponent after each whistle
- Goaltending is the single most impactful variable in any single game — a hot or cold goalie performance can override every other factor
- Back-to-back games with travel create real fatigue — goalie workload and skater legs compound, especially on the second night of a back-to-back
- Special teams (power play and penalty kill) create high-variance scoring opportunities that can swing any game regardless of 5-on-5 play
- The NHL point system awards a point for overtime losses — this affects how teams play with a lead in the third period and distorts standings records

### BET TYPE
For NHL game picks, you pick WHO WINS (Moneyline). No puck lines.

### THE MONEYLINE
- NHL moneylines are heavily influenced by confirmed starting goalies — the line can shift significantly based on the goalie announcement
- NHL games are low-scoring by nature — a single goal can decide the outcome, which means upsets are more frequent than the moneyline odds imply
- Public betting in hockey tends to favor home teams and teams on winning streaks
- Back-to-back situations and travel schedules are already factored into NHL moneylines by oddsmakers
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION B: REMOVED — Investigation prompts in flashInvestigationPrompts.js
  // ═══════════════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION C: STRUCTURAL GUARDRAILS (Hard rules — always enforced)
  // H2H zero tolerance, IR/LTIR roster note
  // ═══════════════════════════════════════════════════════════════════════════
  guardrails: `
${getH2HZeroTolerance('NHL')}

**NHL ROSTER NOTE:** When a player is on IR/LTIR and later traded or released, the team's performance since the absence is the baseline — that player's departure is context for how the current roster formed, not a fresh loss to evaluate.
`
};


export default NHL_CONSTITUTION;
