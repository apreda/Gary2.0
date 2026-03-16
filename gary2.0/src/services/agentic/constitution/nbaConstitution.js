/**
 * NBA Constitution - NBA-Specific Context for Gary
 *
 * Phase-aligned delivery:
 * - domainKnowledge: always-on only (kept minimal)
 * - pass1Context: investigation-stage awareness
 * - guardrails: structural hard rules (minimal)
 *
 * Everything else is covered elsewhere (do NOT duplicate here):
 * - Player universe / roster rules → BASE_RULES + system prompt FACT-CHECKING PROTOCOL
 * - Stat categories / causal vs descriptive → system prompt <analysis_framework>
 * - Team vs player stats → system prompt <identity> + <core_principles>
 * - Stat definitions (On-Off, TS%, eFG%, Four Factors) → model knowledge + scout report labels
 * - Data source catalog / token list → Flash investigation prompts + scout report
 * - Bet type (spread/ML) → system prompt <output_format> + CONVICTION
 * - Transitive property → BASE_RULES
 * - Narrative awareness → system prompt NARRATIVE AWARENESS
 * - Anti-hallucination / current season → BASE_RULES
 * - Matchup tags (tournamentContext) → system prompt output format + scout report auto-populates
 * - Ranking gap examples → anchors Gary on specific stats (subtle L3)
 */

export const NBA_CONSTITUTION = {

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION A: DOMAIN KNOWLEDGE — always-on only (keep minimal)
  // ═══════════════════════════════════════════════════════════════════════════
  domainKnowledge: ``,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION B: PASS 1 CONTEXT — shown during investigation stage
  // ═══════════════════════════════════════════════════════════════════════════
  pass1Context: `
### NBA AWARENESS

- Star player availability, minute restrictions, and rest decisions can materially change game context
- Back-to-backs, travel burden, and schedule density are widely known and often priced quickly
- NBA outcomes are volatile game-to-game — separate stable team baseline from short-window noise
- Public attention concentrates on marquee teams and nationally televised games — narrative pressure can affect how numbers are set
- Roster depth matters more than casual observers realize — when stars sit, the gap between bench units often determines outcomes
- Mid-season trades and buyout additions take time to integrate — new players need to learn systems and build chemistry before the addition translates to results

### NBA INJURY LABELS (READ FROM SCOUT REPORT)

Injury duration tags are assigned by the NBA scout-report pipeline and are sport-specific.

- **FRESH** — New absence (0-2 games missed, <5 calendar days). Market may not have fully adjusted.
- **SHORT-TERM** — Recent absence (≤3 games missed). Line is beginning to reflect the absence.
- **PRICED IN** — Established absence (4-19 games missed). The team's recent stats, form, and record already reflect life without this player.
- **SEASON-LONG** — Extended absence (20+ games). Fully baked into every number you see.

Use the exact tag shown in the scout report for this game.

### THE SPREAD
- NBA spreads move quickly once injury news breaks — by tip-off, most absences are fully reflected in the number
- Public betting volume in the NBA gravitates toward big-market teams, nationally televised games, and teams on winning streaks — lines for those games reflect different market dynamics than under-the-radar matchups
- Rest advantages (opponent on a back-to-back, long road trip) are widely known and typically priced — the edge is in HOW a team performs in those spots, not that the spot exists
- Home court advantage in the NBA is real but varies significantly by arena and team

### LARGE-LEAD GAME DYNAMICS
- NBA games change shape when one team builds a large lead — starters get rest, rotations shift to bench units, pace can change, and the intensity level shifts for both teams
- A team that leads by 20 after three quarters and wins by 8 had a different 4th quarter than the first three — investigate whether each team's margin profile reflects full-game dominance or lead-then-coast patterns
- Bench depth and end-of-bench minutes matter more in games with large leads — the gap between each team's starters may be enormous, but the gap between their benches may be much smaller

**NBA GTD NOTE:**
- GTD means the player's availability is UNCERTAIN — they may or may not play
- A GTD after weeks of absence could signal a RETURN — a different situation than a day-to-day minor tweak
`,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION C: PASS 2.5 DECISION GUARDS — optional stage-specific reminders
  // ═══════════════════════════════════════════════════════════════════════════
  pass25DecisionGuards: ``,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION D: STRUCTURAL GUARDRAILS (Hard rules — always enforced)
  // No NBA-specific hard guards needed here (handled by BASE_RULES + pass stages)
  // ═══════════════════════════════════════════════════════════════════════════
  guardrails: ``,

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION E: BILATERAL CASE PROMPT — injected at end of Pass 1
  // ═══════════════════════════════════════════════════════════════════════════
  bilateralCasePrompt: (homeTeam, awayTeam) =>
    `Before outputting INVESTIGATION COMPLETE, include both sections in your Pass 1 synthesis:
Case for ${homeTeam}
Case for ${awayTeam}
(Each case should be 2-3 paragraphs explaining why that side is the right bet at this spread number tonight. Even for heavy underdogs, there is always a case — the spread may be too large, the matchup may favor them in specific ways, or situational factors may close the gap.)`
};


export default NBA_CONSTITUTION;
