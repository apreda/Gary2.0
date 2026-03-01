/**
 * Shared Constitution Blocks — Centralized
 *
 * Blocks shared across constitutions and props pipeline.
 * Each function returns a string for interpolation in template literals via ${}.
 *
 * Game pick constitutions use: getH2HZeroTolerance
 * Props pipeline uses: getPropsInjuryFramework, getPropsRecentFormInvestigation,
 *                      getPropsStructuralVsNarrative, getNarrativeClosingQuestions
 *
 * Removed: getGaryPrinciples (covered by BASE_RULES),
 *          getInjuryNarrativeFramework (covered by Pass 2.5),
 *          betterBetFramework.js (covered by Pass 2.5)
 */

// ═══════════════════════════════════════════════════════════════════════
// BLOCK 2: Injury Investigation (Props pipeline)
// getSharedInjuryCore() — internal, used by getPropsInjuryFramework
// ═══════════════════════════════════════════════════════════════════════

// ── Shared Injury Core ──
// Used by props pipeline. One source of truth for injury investigation principles.
function getSharedInjuryCore() {
  return `### INJURY INVESTIGATION: DURATION & DATA FIRST

The scout report labels each injury with a market-aware duration tag. Use these to guide your investigation depth:

**FRESH injuries — market has had limited time to adjust:**
- Investigate: Who is getting the minutes in that player's role since the injury?
- Investigate: What is the replacement player's production profile — both in the games since the injury AND their season-long stats?
- Investigate: How has the team performed in the games without the injured player vs their season average?
- Investigate: What does the team's roster depth look like behind this player — how many rotation players does the team use, what experience level are the backups, and is there a clear next man up or does the workload get spread across multiple players?
- How long has the market known about this absence? Has the line had time to fully adjust?

**SHORT-TERM injuries — market adjusting with small sample:**
- Same investigation as FRESH, but the team has had several games to adjust. Check if patterns are emerging.
- Has the backup established themselves? What does their production profile look like in those games?

**LONG-TERM and SEASON-LONG injuries — market has fully adjusted:**
- The team's current stats already reflect life without this player. Do not treat as new information.

**KEY PRINCIPLE:** Don't assume a player being out helps or hurts anyone. CHECK the actual data. Name who IS filling the role and cite THEIR stats. If you can't find data showing a shift, there IS no shift to cite.`;
}

// ── Props: Player-Level Injury Investigation ──
// Used by propsSharpFramework.js — same core principles, focused on individual usage/line impact.
export function getPropsInjuryFramework() {
  return `${getSharedInjuryCore()}

### PLAYER-LEVEL INJURY INVESTIGATION (PROPS)

**USAGE INVESTIGATION:**
When a teammate is out, investigate:
- What do the game logs show from games WITHOUT this player? Has anything measurably changed?
- What does the data show about how production is distributed with the current roster?
- Is there a shift in the data, or is the team performing similarly without the absent player?

**LINE ADJUSTMENT INVESTIGATION:**
- Investigate: When was the absence announced? What do the player's season averages and recent game logs show compared to the current prop line?
- Ask: Does the line reflect what the data shows about the usage shift, or is there a gap? What does that tell you about this prop tonight?`;
}

// ═══════════════════════════════════════════════════════════════════════
// BLOCK 7: Props Recent Form Investigation (props guardrails)
// Player-level recent form investigation — shared principles,
// framed for individual production investigation.
// ═══════════════════════════════════════════════════════════════════════

export function getPropsRecentFormInvestigation() {
  return `### RECENT FORM — INVESTIGATE WHAT'S DRIVING THE TREND

**RECENT RUNS ARE DESCRIPTIVE, NOT PREDICTIVE:**
- "He's hit the over 4 straight games" describes what HAPPENED — it doesn't predict tonight
- Recent runs often explain WHY the line is where it is (books adjust for hot/cold streaks)
- Ask: "Is this run WHY the line is set here, or does it reveal something the line hasn't captured?"

**When a player is on a multi-game heater or slump, investigate:**
- What's driving the streak? Is it volume changes (more minutes, more usage) or efficiency variance (unsustainable shooting)?
- Is the roster the same? A streak WITH a teammate out is different from a streak with the full roster.
- What's the opponent quality during the streak? Did the recent games feature matchups that inflate or deflate production?
- What do the game logs show about the specific mechanism driving the streak?

**Ask:** "Is this streak evidence of a real structural change, or variance that will correct?"

**SINGLE RESULTS — INVESTIGATE, DON'T ANCHOR:**
One great (or terrible) game against a team doesn't define the matchup tonight.
- What were the circumstances? Same roster? Same role? Same matchup personnel?
- Was there something unique? Blowout, overtime, foul trouble, injury mid-game?
- Does the mechanism from that game apply tonight, or was it noise?

**Ask:** "Does this single result reveal something structural about tonight, or was it noise?"`;
}

// ═══════════════════════════════════════════════════════════════════════
// BLOCK 8: Props Structural vs Narrative (props guardrails)
// Player-level version of getStructuralVsNarrative — shared principles,
// framed for prop-level reasoning.
// ═══════════════════════════════════════════════════════════════════════

export function getPropsStructuralVsNarrative() {
  return `### STRUCTURAL vs NARRATIVE — VERIFY BEFORE CITING

Treat all narratives ("revenge game," "he always kills them," "primetime player," "due for a bounce-back") as **hypotheses**. Verify with data before citing:
1. **Prove it**: What do the game logs and stats actually show? Does the data back the narrative?
2. **Contextualize**: Is it sustainable (role change, usage shift, matchup mechanism) or noise (2-game shooting heater, one outlier game)?
3. **Emotional labels are opinions**: "He's due" or "he loves this matchup" require data to cite.

**Structural (repeatable):** Usage rate shifts, role changes, minutes changes, matchup mechanisms, lineup data.
**Narrative (investigate first):** Revenge, "he always performs at MSG," streaks, "he's due."

**AWARENESS:** A player's season averages reflect what the prop line ALSO reflects. Citing a gap between average and line confirms the market's view — it doesn't reveal edge. Edge comes from matchup-specific factors: role changes, personnel mismatches, scheme vulnerabilities, recent structural shifts. Investigate where YOUR findings and the line disagree.

**Ask:** "Is my thesis built on something the line already reflects, or have I found something the line hasn't captured?"`;
}

// ═══════════════════════════════════════════════════════════════════════
// BLOCK 4: Narrative Closing Questions (props only now)
// Game pick constitutions no longer use this — kept for propsSharpFramework.js
// ═══════════════════════════════════════════════════════════════════════

export function getNarrativeClosingQuestions() {
  return `If a narrative applies to THIS game:
- Ask: If the public is right here, what specifically makes it true tonight?
- Ask: If the data points away from the public belief, what explains the gap?
- Ask: How has this narrative shaped the line, and does the number feel right given everything you've investigated?`;
}

// ═══════════════════════════════════════════════════════════════════════
// BLOCK 8: H2H Zero Tolerance (guardrails)
// Core rule identical; sport-specific context about matchup frequency.
// ═══════════════════════════════════════════════════════════════════════

const H2H_SPORT_CONTEXT = {
  NBA: `   - If you get "0 games found" or "No previous matchups" → DO NOT mention H2H at all`,
  NFL: `   - If divisional teams: they play twice, so there may be 1 previous meeting this season
   - If non-divisional: they may NOT have played this season at all
   - [NO] NEVER claim: "Cowboys are 6-2 vs Eagles in recent years" without data`,
  NHL: `   - NHL divisional teams play multiple times per season - there may be recent meetings
   - [NO] NEVER claim: "Bruins are 5-1 vs Leafs this year" without data`,
  NCAAB: `   - Most non-conference teams only play once per season IF they meet in tournaments
   - Conference teams play twice (home and away)`,
  NCAAF: `   - Most NCAAF teams play rarely or never
   - [NO] NEVER claim: "Ohio State is 8-2 vs Michigan in last 10" without data
   - [NO] NEVER guess rivalry patterns from training data`,
};

export function getH2HZeroTolerance(sport) {
  const normalized = sport?.toUpperCase?.()
    .replace('BASKETBALL_', '')
    .replace('AMERICANFOOTBALL_', '')
    .replace('ICEHOCKEY_', '') || sport;

  const sportContext = H2H_SPORT_CONTEXT[normalized] || '';

  return `**HEAD-TO-HEAD (H2H) - ZERO TOLERANCE FOR GUESSING**:
   - H2H data is included in your scout report. Review it there. If you need ADDITIONAL historical matchups beyond what's shown, you can call fetch_stats(token: 'H2H_HISTORY', ...)
${sportContext}
   - [NO] NEVER guess historical H2H patterns from training data
   - [YES] If you have H2H data, cite ONLY the specific games shown
   - [YES] If you DON'T have H2H data, skip H2H analysis entirely`;
}

