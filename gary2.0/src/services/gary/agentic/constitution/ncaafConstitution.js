/**
 * NCAAF Constitution — every section empty since Oct 12 2026: college reads the NFL's stack
 * (nflPrompts.js) with college nouns. Kept as a module so getConstitution('NCAAF') resolves.
 *
 * Phase-aligned delivery:
 * - domainKnowledge: always-on only (kept minimal)
 * - pass1Context: investigation-stage awareness
 * - guardrails: structural hard rules (minimal)
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
 * - Opt-outs / portal / motivation / conference strength → Flash investigation prompts + scout report
 */

export const NCAAF_CONSTITUTION = {

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION A: DOMAIN KNOWLEDGE — always-on only (keep minimal)
  // ═══════════════════════════════════════════════════════════════════════════
  domainKnowledge: ``,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION B: PASS 1 CONTEXT — shown during investigation stage
  // ═══════════════════════════════════════════════════════════════════════════
  // COLLEGE'S OWN AWARENESS (Oct 18 2026, founder: "fix it ... improve all the logic"; buy-low dropped: "I'm not sure
  // 'buy low' applies like it does for nfl"). Gary reads it as his instructions in the college question (ncaafQuestion.js).
  pass1Context: `
### COLLEGE FOOTBALL AWARENESS

- One game's score says little about the next one. Final margins, halftime leads, comebacks, turnovers, red-zone finishing, streaks and results against a common opponent swing on a few plays and bounces. How a team runs, throws, blocks and tackles, play after play, carries from one week to the next.

- College schedules differ more than any league's. A team's numbers are only as strong as the opponents they came against.

- A game is played by the players who suit up. Every known injury is already in the price. A team missing players can still be the better team on the field.

- The starting quarterback is the absence that changes a game most, and how much depends on who the backup is.

- Everything about a game counts only against the spread. The same team can be the right side at one number and the wrong side at another, whether it's favored or getting points.
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION C: PASS 2.5 DECISION GUARDS — optional stage-specific reminders
  // ═══════════════════════════════════════════════════════════════════════════
  // EMPTY, matching NFL, MLB and NBA (founder, Sep 18 2026). These rendered
  // AFTER the synthesis question — "What's your bet, and what are the reasons
  // why?" — so the last thing read before deciding was further conditions on
  // the decision. Gary considers both sides in Pass 1; no formatting checker approves his opinion.
  pass25DecisionGuards: ``,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION D: STRUCTURAL GUARDRAILS (Hard rules — always enforced)
  // ═══════════════════════════════════════════════════════════════════════════
  guardrails: ``,

  bilateralCasePrompt: null
};


export default NCAAF_CONSTITUTION;
