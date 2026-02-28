/**
 * NCAAF Constitution - NCAAF-Specific Context for Gary
 *
 * Two sections for phase-aligned delivery:
 * - domainKnowledge: NCAAF-specific reference (grounding search sites for stats not in BDL)
 * - guardrails: H2H zero tolerance, sample size + variance awareness
 *
 * Covered elsewhere (do NOT duplicate here):
 * - Player universe / roster rules → BASE_RULES + system prompt FACT-CHECKING PROTOCOL
 * - Stat categories / causal vs descriptive → system prompt <analysis_framework>
 * - Stat definitions (SP+, FPI, EPA, Havoc Rate) → model knowledge
 * - Data source catalog / token list → Flash investigation prompts + scout report
 * - Bet type (spread/ML) → system prompt <output_format> + CONVICTION
 * - Transitive property → BASE_RULES (NCAAF addendum kept in guardrails)
 * - Narrative awareness → system prompt NARRATIVE AWARENESS
 * - Anti-hallucination / current season → BASE_RULES
 * - Matchup tags (tournamentContext) → system prompt output format + scout report auto-populates
 * - Ranking tiers → L3 violation (assigns significance to rank ranges)
 * - Ranking gap examples → anchors Gary on specific stats (subtle L3)
 * - Opt-outs / portal / motivation / conference strength → Flash investigation prompts + scout report
 * - Injury duration → system prompt NARRATIVE AWARENESS
 */

import {
  getH2HZeroTolerance,
} from './sharedConstitutionBlocks.js';

export const NCAAF_CONSTITUTION = {

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION A: DOMAIN KNOWLEDGE — NCAAF-specific reference material
  // ═══════════════════════════════════════════════════════════════════════════
  domainKnowledge: `
## NCAAF ANALYSIS

### GROUNDING SEARCH SITES
For SP+ ratings, havoc rates, or talent composites not available via BDL, use Gemini grounding with site:footballoutsiders.com, site:espn.com (FPI), or site:247sports.com (talent).
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION B: REMOVED — Investigation prompts in flashInvestigationPrompts.js
  // ═══════════════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION C: STRUCTURAL GUARDRAILS (Hard rules — always enforced)
  // H2H zero tolerance, NCAAF sample size + variance
  // ═══════════════════════════════════════════════════════════════════════════
  guardrails: `
${getH2HZeroTolerance('NCAAF')}

**NCAAF SAMPLE SIZE:** Only 12 regular season games — single results are noise. A pick-six or blocked punt can swing 14 points with no bearing on team quality. Transfer portal additions take time to integrate.
`
};


export default NCAAF_CONSTITUTION;
