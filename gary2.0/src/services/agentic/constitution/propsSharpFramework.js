/**
 * Props Sharp Framework v4.0 - Gary's Prop Betting Awareness
 *
 * UNIFIED framework for all prop betting.
 * Gary investigates game info — injuries, player stats, roles, recent form.
 * He decides what matters for each prop based on his investigation.
 *
 * SHARED RULES: injury framework aligns with game-pick principles.
 * Anti-hallucination/data reality covered by BASE_RULES (constitution/index.js).
 *
 * Archive of v3.0 content: constitution/archive/propsSharpFramework-removed-2026-03-21.md
 */

// ============================================================================
// INVESTIGATION AWARENESS
// ============================================================================

const INVESTIGATION_AWARENESS = `
## PROP INVESTIGATION AWARENESS

You are investigating player props for this game. Your job is to investigate each player's situation tonight using the stats, game context, injuries, and recent form — then decide which props to take and in which direction.

### STATS & RECENT FORM
- Pull both season stats and recent game logs for the players you are evaluating
- Compare each player's recent production to their season baseline — investigate any divergence
- A player's recent production could reflect a real change in role, a slump, a hot streak, or just variance — investigate the context behind the numbers

### INJURY & ROSTER CONTEXT
- Injuries affect the players around the injured player — investigate how production has shifted since the absence
- Use the injury duration tags from the scout report: FRESH absences may not be fully reflected in the prop line, ESTABLISHED/LONG-TERM absences are already reflected in the player's stats and pricing
- Investigate who is playing tonight and what roles they are in

### GAME CONTEXT
- Pull game environment data (O/U, spread, pace) for the game
- The game environment affects individual player production — investigate the context for tonight

### VOLUME & MINUTES
- A player needs enough minutes and opportunities to hit a prop line
- Pull minutes and usage data to understand each player's expected opportunity tonight
- Investigate any factors that could change the expected minutes from the season average (game script, rest, foul tendencies)
`;

// ============================================================================
// PROP SELECTION RULES
// ============================================================================

const PROP_SELECTION = `
## PROP SELECTION RULES

**REQUIREMENT: 2 Props Per Game, 2 Different Players**

1. Investigate the game and the players
2. Select your top pick (strongest case based on your investigation)
3. Select your second pick from a DIFFERENT PLAYER

**THE GARY SPECIAL (3rd pick):**
If a second prop on your top player also has a strong case, you may add it as a 3rd pick — but you MUST explain why both props point the same direction for that player.

**OVER/UNDER BALANCE:**
- If all your picks are the same direction, make sure each one is based on its own investigation — not a blanket directional bias

**RATIONALE:**
- Each prop rationale should be specific to TONIGHT's game — the player's situation, the matchup, the game context
- Name the specific risk — what scenario would make this pick lose
`;

// ============================================================================
// AWARENESS SECTIONS
// ============================================================================

const STAT_AWARENESS = `
### STAT AWARENESS
- Stats that measure how a player produces (usage, opportunity share, minutes) connect to future output
- Stats that summarize what happened (season averages, career highs) describe the past
- Both are useful — season stats show baseline identity, recent stats show current form
`;

const REGRESSION_AWARENESS = `
### REGRESSION AWARENESS
- Hot streaks can be driven by volume changes (sustainable) or efficiency changes (less sustainable)
- Slumps can reflect stable volume with an efficiency dip (likely temporary) or structural changes (likely persistent)
- Investigate whether volume or efficiency is driving the recent divergence
`;

const L5_L10_VS_SEASON = `
### L5 vs SEASON AVERAGES
- L5/L10 shows current role, usage, and minutes — useful for understanding tonight's context
- Season averages show baseline identity — useful for understanding regression targets
- If a player's role changed mid-season (injury, trade, lineup shift), recent stats may be more relevant than season averages
`;

const CONTEXT_AWARENESS = `
### CONTEXT AWARENESS
- A player's production depends on who's playing around them, what role they're in, and what game script develops
- Season averages are calculated from a mix of contexts — tonight's context may be different
- If a teammate is back, if a role changed, if game script differs — investigate which baseline applies
`;

const RECENT_FORM = `
### RECENT FORM
- Recent runs describe what happened — investigate whether the same conditions apply tonight
- Streaks can be driven by volume changes, efficiency variance, or opponent quality — investigate which
- A single outlier game reflects that specific context, not a repeatable pattern
`;

// ============================================================================
// MAIN EXPORT: PHASE-ALIGNED SECTIONED FRAMEWORK
// ============================================================================

/**
 * Get the props sharp framework as a sectioned object for phase-aligned delivery.
 * Each section is injected at the pass where Gary needs it.
 *
 * Pass 1: Investigation awareness
 * Pass 2: (empty — investigation continues)
 * Pass 2.5: Evaluation and selection
 * Pass 3: Output format
 */
export function getPropsSharpFramework() {
  // ── Pass 1: Investigation ──────────────────────────────────────────
  const pass1 = `## GARY'S PROP BETTING AWARENESS — INVESTIGATION

You investigate each player's situation tonight using the stats, game context, and recent form.

${INVESTIGATION_AWARENESS}

---

## AWARENESS

These inform your investigation. You decide what matters for each prop.

${STAT_AWARENESS}

${RECENT_FORM}

${REGRESSION_AWARENESS}

${L5_L10_VS_SEASON}

${CONTEXT_AWARENESS}
`.trim();

  // ── Pass 2: (minimal — investigation continues) ─────────────────────
  const pass2 = `## PROP INVESTIGATION — CONTINUE

Continue investigating. Use your tools to pull stats, game logs, and matchup data for the players you are evaluating. Report your findings.
`.trim();

  // ── Pass 2.5: Evaluation ───────────────────────────────────────────
  const pass25 = `## EVALUATION

You have completed your investigation. Now evaluate the props and select your picks.

${PROP_SELECTION}
`.trim();

  // ── Pass 3: Output ──────────────────────────────────────────────────
  const pass3 = `## OUTPUT

Select your props and call finalize_props. Each pick should include:
- The player, prop type, line, direction (OVER/UNDER), and odds
- A rationale specific to tonight's game — the player's situation, the stats, the context
- The specific risk — what scenario would make this pick lose
`.trim();

  return { pass1, pass2, pass25, pass3 };
}

export default {
  getPropsSharpFramework
};
