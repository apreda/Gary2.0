/**
 * MLB Constitution - MLB-Specific Context for Gary
 *
 * Phase-aligned delivery (matches NBA pattern):
 * - domainKnowledge: always-on only (kept minimal)
 * - pass1Context: investigation-stage awareness
 * - guardrails: structural hard rules (minimal)
 *
 * Everything else is covered elsewhere (do NOT duplicate here):
 * - Stat categories / pitcher analysis → the desk (scout report sections)
 * - Betting theory / market dynamics → model knowledge (Gary already knows MLB betting)
 * - Bet type (ML/RL) + house limit → Pass 2.5 betTypeNote (passBuilders.js)
 * - Transitive property → BASE_RULES
 * - Anti-hallucination / current season → BASE_RULES
 * - Situational awareness (series state, schedule, streaks) → the desk
 */

export const MLB_CONSTITUTION = {

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION A: DOMAIN KNOWLEDGE — always-on only (keep minimal)
  // ═══════════════════════════════════════════════════════════════════════════
  domainKnowledge: ``,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION B: PASS 1 CONTEXT — shown during investigation stage
  // ═══════════════════════════════════════════════════════════════════════════
  // Season-shape awareness bullets live in getMlbSeasonAwareness
  // (spreadEvaluationFactors.js), rendered once inside Pass 1 — this block
  // carries the founder-approved epistemics bullets below plus the injury-label
  // semantics (LOCKED); keep the two surfaces from duplicating (Jul 7 sweep:
  // Pass 1 was rendering two near-identical MLB AWARENESS sections).
  pass1Context: `
### MLB AWARENESS

- A stat is a description of what happened, not a reason for what will happen. A pitcher's bad ERA is a fact about past games; whether it predicts tonight depends on opponent, ballpark, recent form, bullpen support, and sample size. Cite stats to describe the situation. Reason for yourself about whether they actually matter for THIS specific game.

- A short sample is a question, not a verdict. Whether a hot or cold stretch continues depends on who the player is — his track, role, and stuff — not on the stretch itself; extremes in small samples usually move toward the player's real level. Small samples are genuinely hard to read: the desk carries more than the forward-facing rates — who a player is, how his outings actually went, what his club expects of him.

- The market already knows what you know and what you don't: a thin sample, and the doubt that rides with it, is priced into the line before you ever read the matchup. The price is not a message about the game — it is simply what the bet costs. Certainty is never a reason to take a side and uncertainty is never a reason to avoid one; the pick is one game, and on every factor that matters in it, thin file or thick, judgment calls sometimes have to be made — the data and the stats are a recording of the past, not necessarily a determination of tonight.

- When the data shows a player or a team is inconsistent, that is the data telling you either version could show up tonight — what it cannot tell you is which one. Which one is a judgment call, yours to make, on nothing more than what you think happens tonight.

### MLB INJURY LABELS (READ FROM SCOUT REPORT)

MLB injuries are tagged by TEAM GAMES MISSED since the player's last appearance. The key question in baseball is: did this absence change who is pitching tonight?

- **SP SCRATCH** — The scheduled starting pitcher was scratched or replaced. This changes the entire game projection and may not be in the posted line yet.
- **FRESH** — 0-2 team games missed. The only tier besides an SP scratch that may not be fully reflected in the line.
- **ESTABLISHED** — 3+ team games missed by a meaningful-role player, shown under ESTABLISHED ABSENCES. The line, the team's recent stats, and the opponent's game plan already account for this absence.

Long-term absences (10+ games) and depth pieces are omitted from the desk entirely — the team you are reading IS the team without them.

Use the exact tag shown in the scout report for this game.

**MLB GTD/IL NOTE:**
- A starting pitcher placed on the IL or scratched day-of changes the entire game projection
- Position player IL stints matter less individually but accumulate
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION C: PASS 2.5 DECISION GUARDS — optional stage-specific reminders
  // ═══════════════════════════════════════════════════════════════════════════
  pass25DecisionGuards: ``,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION D: STRUCTURAL GUARDRAILS (Hard rules — always enforced)
  // ═══════════════════════════════════════════════════════════════════════════
  guardrails: ``,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION E: BILATERAL CASE PROMPT — injected at end of Pass 1
  // ═══════════════════════════════════════════════════════════════════════════
  bilateralCasePrompt: (homeTeam, awayTeam) =>
    `Before outputting INVESTIGATION COMPLETE, end your Pass 1 synthesis with both sections, using these EXACT headings on their own lines (the system stores each case under its heading):
CASE FOR BACKING ${homeTeam.toUpperCase()} TONIGHT:
CASE FOR BACKING ${awayTeam.toUpperCase()} TONIGHT:
(Each case: 2-3 paragraphs making the argument for that side as tonight's bet — how it wins this game and what carries it — based on the matchup evidence you investigated.)`
};

export default MLB_CONSTITUTION;
