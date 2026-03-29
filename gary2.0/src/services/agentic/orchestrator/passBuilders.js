import { getNbaSpreadFactors, getNcaabSpreadFactors, getNhlSpreadFactors, getNflSpreadFactors, getNcaafSpreadFactors, getMlbSpreadFactors, getMlbSeasonAwareness } from './spreadEvaluationFactors.js';

/**
 * Build the PASS 1 user message - Identify battlegrounds, DO NOT pick a side yet
 * Only gives instructions for the FIRST pass to prevent instruction contamination
 *
 * Every supported sport has a dedicated builder with sport-specific evaluation factors.
 * Unsupported sports throw an error — add a builder before enabling a new sport.
 */
export function buildPass1Message(scoutReport, homeTeam, awayTeam, today, sport = '', spread = null) {
  const isNBA = sport === 'basketball_nba' || sport === 'NBA';
  const isNCAAB = sport === 'basketball_ncaab' || sport === 'NCAAB';
  const isNFL = sport === 'americanfootball_nfl' || sport === 'NFL';
  const isNCAAF = sport === 'americanfootball_ncaaf' || sport === 'NCAAF';

  if (isNBA) {
    return buildNbaPass1(scoutReport, today, homeTeam, awayTeam, spread);
  }

  if (isNCAAB) {
    return buildNcaabPass1(scoutReport, today, homeTeam, awayTeam, spread);
  }

  const isNHL = sport === 'icehockey_nhl' || sport === 'NHL';
  if (isNHL) {
    return buildNhlPass1(scoutReport, today, homeTeam, awayTeam, spread);
  }

  if (isNFL) {
    return buildNflPass1(scoutReport, today);
  }

  if (isNCAAF) {
    return buildNcaafPass1(scoutReport, today);
  }

  const isMLB = sport === 'baseball_mlb' || sport === 'MLB';
  if (isMLB) {
    return buildMlbPass1(scoutReport, today, homeTeam, awayTeam, spread);
  }

  throw new Error(`[Pass 1] No sport-specific builder for "${sport}" — add one to passBuilders.js`);
}

/**
 * NBA-specific Pass 1 — spread-aware investigation framing
 * Includes the 7 spread evaluation factors up front so Gary investigates
 * with explicit spread lenses before synthesis.
 */
function buildNbaPass1(scoutReport, today, homeTeam, awayTeam, spread) {
  const absSpread = Math.abs(spread || 0);
  const favoriteLabel = spread < 0 ? homeTeam : awayTeam;
  const underdogLabel = spread < 0 ? awayTeam : homeTeam;

  return `
<scout_report>
## MATCHUP BRIEFING (TODAY: ${today})

${scoutReport}
</scout_report>

<investigation_rules>
## INVESTIGATION RULES

**THE SYMMETRY RULE:**
- If you call a stat for Team A, you MUST call the equivalent for Team B
- Cherry-picking stats for one side = incomplete picture = bad bet

**INJURY TIMING:**
- Use the injury duration tags from the scout report exactly as shown.
- **FRESH (0-2 games missed):** Replacement production and recent stat windows may still include games with this player. These can meaningfully affect the matchup.
- **SHORT-TERM / PRICED IN / LONG-TERM / SEASON-LONG:** Treat as established context; current team baselines already reflect these absences. The team you are evaluating IS the team without that player.

</investigation_rules>

<instructions>
## YOUR TASK: PASS 1 - INVESTIGATE THE GAME

Tonight's spread: ${favoriteLabel} -${absSpread} / ${underdogLabel} +${absSpread}

The spread number you see tonight was set AFTER the schedule, injuries, and rest situation were known. The question is not whether these factors exist — everyone can see them — but whether the spread has accounted for them correctly for THIS game. Records and rankings describe what has happened — they are not reasons for or against a spread.

You are picking which side of this spread to take. Investigate the game — the teams, the players taking the floor tonight, the stats, the injuries, the schedule, the recent context — and build your understanding of this specific matchup at this specific number.

Use the scout report + research briefing as your starting point, then investigate with fetch_stats where you need deeper evidence.

Before completing Pass 1, include BOTH sections:
Case for ${homeTeam}
Case for ${awayTeam}

Each case should be 2-3 paragraphs explaining why that side is the right bet at this number tonight.

Do NOT declare a final side, make a pick, or write your final analysis yet. When your Pass 1 synthesis is complete, output this exact line on its own line:
INVESTIGATION COMPLETE
</instructions>
`.trim();
}

/**
 * NCAAB-specific Pass 1 — concise spread evaluation factors
 * 7 named factors tuned to college basketball market dynamics.
 */
function buildNcaabPass1(scoutReport, today, homeTeam, awayTeam, spread) {
  const factors = getNcaabSpreadFactors();
  const absSpread = Math.abs(spread || 0);
  const favoriteLabel = spread < 0 ? homeTeam : awayTeam;
  const underdogLabel = spread < 0 ? awayTeam : homeTeam;

  return `
<scout_report>
## MATCHUP BRIEFING (TODAY: ${today})

${scoutReport}
</scout_report>

<investigation_rules>
## INVESTIGATION RULES

**THE SYMMETRY RULE:**
- If you call a stat for Team A, you MUST call the equivalent for Team B
- Cherry-picking stats for one side = incomplete picture = bad bet

**INJURY TIMING:**
- Use the injury duration tags from the scout report exactly as shown.
- **FRESH:** Market may not have fully adjusted.
- **SHORT-TERM / LONG-TERM / SEASON-LONG:** The team's current stats already reflect this absence.

</investigation_rules>

<instructions>
## YOUR TASK: PASS 1 - INVESTIGATE THE GAME

Tonight's spread: ${favoriteLabel} -${absSpread} / ${underdogLabel} +${absSpread}

${factors}

The spread number was set AFTER seedings, injuries, rest, and all publicly known information were available. The question is not whether these factors exist — everyone can see them — but whether the spread has accounted for them correctly for THIS game. Records and rankings describe what has happened — they are not reasons for or against a spread.

You are picking which side of this spread to take. Investigate the game — the teams, the players, the stats, the recent context — and build your understanding of this specific game at this specific number.

Use the scout report + research briefing as your starting point, then investigate with fetch_stats where you need deeper evidence.

Before completing Pass 1, include BOTH sections:
Case for ${homeTeam}
Case for ${awayTeam}

Each case should be 2-3 paragraphs explaining why that side covers. Use whatever reasoning you find most compelling — stats, matchup data, momentum, tournament context, coaching, or any combination. There is no required formula.

Do NOT declare a final side, make a pick, or write your final analysis yet. When your Pass 1 synthesis is complete, output this exact line on its own line:
INVESTIGATION COMPLETE
</instructions>
`.trim();
}

/**
 * NHL-specific Pass 1 — moneyline + puck line evaluation factors
 * 7 named factors tuned to hockey market dynamics.
 */
function buildNhlPass1(scoutReport, today, homeTeam, awayTeam, spread) {
  // NHL Pass 1 — clean, minimal, matches NBA philosophy. No bet type forcing.

  return `
<scout_report>
## MATCHUP BRIEFING (TODAY: ${today})

${scoutReport}
</scout_report>

<investigation_rules>
## INVESTIGATION RULES

**THE SYMMETRY RULE:**
- If you call a stat for Team A, you MUST call the equivalent for Team B
- Cherry-picking stats for one side = incomplete picture = bad bet

**INJURY TIMING:**
- Use the injury duration tags from the scout report exactly as shown.
- **FRESH:** Recent stat windows may still include games with this player.
- **SHORT-TERM / LONG-TERM / SEASON-LONG:** Current team baselines already reflect these absences.

</investigation_rules>

<instructions>
## YOUR TASK: PASS 1 - INVESTIGATE THE GAME

Your job is to figure out who wins this game tonight. Investigate the full matchup — goaltending, 5-on-5 play, special teams, roster depth, injuries — and build your understanding of which team has the edge.

Use the scout report + research briefing as your starting point, then investigate with fetch_stats where you need deeper evidence.

Before completing Pass 1, include BOTH sections:
Case for ${homeTeam} winning tonight
Case for ${awayTeam} winning tonight
(Each case should be 2-3 paragraphs explaining why that team wins tonight.)

Do NOT declare a side, make a pick, or write your final analysis yet. When your Pass 1 synthesis is complete, output this exact line on its own line:
INVESTIGATION COMPLETE
</instructions>`.trim();
}

// Old NHL pass 1 removed — had -150 ML cap, conclusion language, bet type forcing
function _oldNhlPass1Removed() { return ''; /* cleaned up */
  // ML price tier block — contextualize the favorite's moneyline price
  // spread in NHL is the puck line (typically -1.5/+1.5), but we use it to identify the favorite
  const absSpread = Math.abs(spread || 0);
  let mlPriceBlock = '';
  // NHL puck lines are almost always 1.5 — the ML price is what varies
  // We can't derive ML odds from spread alone, but we frame the evaluation
  if (absSpread > 0) {
    mlPriceBlock = `\n\n**TONIGHT'S LINE:** The puck line is set at ${absSpread}. Investigate both the ML price and puck line odds in the scout report.`;
  }

  return `
<scout_report>
## MATCHUP BRIEFING (TODAY: ${today})

${scoutReport}
</scout_report>

<investigation_rules>
## INVESTIGATION RULES

**THE SYMMETRY RULE:**
- If you call a stat for Team A, you MUST call the equivalent for Team B
- Cherry-picking stats for one side = incomplete picture = bad bet

</investigation_rules>

<matchup_context>
## THE MATCHUP

**MONEYLINE vs PUCK LINE:**
- **Moneyline (ML):** Pick the winner outright. Includes OT and shootouts.
- **Puck Line (PL):** Standard hockey spread (usually -1.5 / +1.5). Favorite must win by 2+ goals. Underdog covers if they win or lose by exactly 1. Puck line does NOT include shootouts — regulation + OT only.

**NARRATIVE FACTORS:**
Narrative factors — winning streaks, goaltender reputation, back-to-back fatigue, rivalry history, revenge spots, playoff race context, trade deadline acquisitions, returning players, head-to-head recent results — are context for the matchup. Rest and schedule context affect preparation differently for each team. A confirmed starter's recent form may differ from their season baseline — investigate the specifics. Use narratives as supporting context, not as standalone reasons for picking a side.

**INJURY TIMING:**
- Use the injury duration tags from the scout report exactly as shown.
- **FRESH:** Replacement production and recent stat windows may still include games with this player. These can meaningfully affect the matchup.
- **SHORT-TERM / LONG-TERM / SEASON-LONG:** Treat as established context; current team baselines already reflect these absences.

**DESCRIPTIVE vs CAUSAL:**
- **Descriptive factors** (records, standings, home/away record) summarize what has happened over a season. They do not explain why a team wins or loses on a given night.
- **Causal factors** (how each team plays, matchup dynamics, situational context) reveal the actual matchup tonight.
- When you cite a record, ranking, or situation — ask yourself: "Is this describing what happened, or explaining what will happen tonight?"${mlPriceBlock}

## MATCHUP EVALUATION FACTORS

${factors}
</matchup_context>

<instructions>
## YOUR TASK: PASS 1 - INVESTIGATE THE MATCHUP

Your end goal is to pick a winner in this game. In this pass, stay neutral: verify/disconfirm key claims from the briefing, pressure-test narratives with data, and build decision-ready evidence for both teams.

Use the scout report + research briefing as your starting point, then investigate with fetch_stats where you need additional evidence to verify, disconfirm, or clarify critical gaps before synthesis.

TREND AWARENESS (L5/L10): Treat recent trend data as a clue, not a conclusion. Investigate what's driving the trend — goaltending, PDO, special teams, or genuine process change.

Before completing Pass 1, include BOTH sections:
Case for ${homeTeam}
Case for ${awayTeam}

Each case should be 3 paragraphs, grounded in the data you gathered, and explain why this team wins tonight. Address both the side (which team) and the bet type (ML or puck line) that makes sense for each case.

Do NOT declare a final side, make a pick, or write your final analysis yet. When your Pass 1 synthesis is complete, output this exact line on its own line:
INVESTIGATION COMPLETE
</instructions>
`.trim();
}

/**
 * NFL-specific Pass 1 — concise spread evaluation factors
 * 7 named factors tuned to NFL market dynamics.
 */
function buildNflPass1(scoutReport, today) {
  const factors = getNflSpreadFactors();

  return `
<scout_report>
## MATCHUP BRIEFING (TODAY: ${today})

${scoutReport}
</scout_report>

<investigation_rules>
## INVESTIGATION RULES

**THE SYMMETRY RULE:**
- If you call a stat for Team A, you MUST call the equivalent for Team B
- Cherry-picking stats for one side = incomplete picture = bad bet

</investigation_rules>

<spread_evaluation>
## THE SPREAD IS A PRICE

The spread is not a prediction — it is a price. Lines are shaped by recent performance, roster status, standings context, and public perception. Transient factors — rest, travel, weather, and injury timing — can shift a line away from where the underlying matchup data points.

**DESCRIPTIVE vs CAUSAL:**
- **Descriptive factors** (records, rankings, streaks, reputation) explain WHY the line is set where it is. They are already IN the price.
- **Causal factors** (unit matchups, efficiency profile, situational context) explain how this specific game is likely to play.
- **The SPOT** (venue, schedule, weather, travel, stakes) is reflected in pricing — investigate whether the adjustment is proportionate to what the data shows.

When you cite a record, ranking, or situation — ask yourself: "Is this describing what happened, or explaining what matters tonight?"

## SPREAD EVALUATION FACTORS

Use the factors below as investigation lenses. Keep findings factual and symmetric across both teams.

${factors}
</spread_evaluation>

<instructions>
## YOUR TASK: PASS 1 - INVESTIGATE THE SPREAD

Your end goal in this game is to choose the best side of this spread. In this pass, stay neutral: verify/disconfirm key claims and build decision-ready evidence through the factors above.

Use the scout report + research briefing as your starting point, then investigate with fetch_stats where you need additional evidence to verify, disconfirm, or clarify critical gaps before synthesis.

TREND AWARENESS (L5/L10): Treat recent trend data as a clue, not a conclusion. Synthesize whether it could continue, regress, or be overvalued/undervalued at this spread number. Use sample context (opponents faced, who played, game-window conditions) to ground that assessment.

Do NOT declare a side, make a pick, or write your final analysis yet. When your Pass 1 synthesis is complete, output this exact line on its own line:
INVESTIGATION COMPLETE
</instructions>
`.trim();
}

/**
 * NCAAF-specific Pass 1 — concise spread evaluation factors
 * 7 named factors tuned to college football market dynamics.
 */
function buildNcaafPass1(scoutReport, today) {
  const factors = getNcaafSpreadFactors();

  return `
<scout_report>
## MATCHUP BRIEFING (TODAY: ${today})

${scoutReport}
</scout_report>

<investigation_rules>
## INVESTIGATION RULES

**THE SYMMETRY RULE:**
- If you call a stat for Team A, you MUST call the equivalent for Team B
- Cherry-picking stats for one side = incomplete picture = bad bet

</investigation_rules>

<spread_evaluation>
## THE SPREAD IS A PRICE

The spread is not a prediction — it is a price. Lines are shaped by recent performance, rankings, roster status, and public perception. Transient factors — travel, weather, venue environment, and motivation context — can shift a line away from underlying opponent-adjusted evidence.

**DESCRIPTIVE vs CAUSAL:**
- **Descriptive factors** (records, rankings, streaks, program reputation) explain WHY the line is set where it is. They are already IN the price.
- **Causal factors** (efficiency profile, trenches, explosiveness, matchup mechanics, situational context) explain how this specific game is likely to play.
- **The SPOT** (venue, travel, weather, schedule, stakes) is reflected in pricing — investigate whether the adjustment is proportionate to what the data shows.

When you cite a record, ranking, or situation — ask yourself: "Is this describing what happened, or explaining what matters tonight?"

## SPREAD EVALUATION FACTORS

Use the factors below as investigation lenses. Keep findings factual and symmetric across both teams.

${factors}
</spread_evaluation>

<instructions>
## YOUR TASK: PASS 1 - INVESTIGATE THE SPREAD

Your end goal in this game is to choose the best side of this spread. In this pass, stay neutral: verify/disconfirm key claims and build decision-ready evidence through the factors above.

Use the scout report + research briefing as your starting point, then investigate with fetch_stats where you need additional evidence to verify, disconfirm, or clarify critical gaps before synthesis.

TREND AWARENESS (L5/L10): Treat recent trend data as a clue, not a conclusion. Synthesize whether it could continue, regress, or be overvalued/undervalued at this spread number. Use sample context (opponents faced, who played, game-window conditions) to ground that assessment.

Do NOT declare a side, make a pick, or write your final analysis yet. When your Pass 1 synthesis is complete, output this exact line on its own line:
INVESTIGATION COMPLETE
</instructions>
`.trim();
}

/**
 * Build the PASS 2.5 message - Evaluation & Final Decision
 * Injected after investigation is sufficient. Includes spread evaluation factors
 * and the established injury rule, then asks Gary to make his pick.
 *
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @param {string} sport - Sport identifier for spread context thresholds
 * @param {number} spread - The spread value (e.g., -13.5)
 * @param {string} decisionGuards - Optional sport-specific Pass 2.5 guard text
 */
export function buildPass25Message(homeTeam = '[HOME]', awayTeam = '[AWAY]', sport = '', spread = 0, decisionGuards = '') {
  const isNHL = sport === 'icehockey_nhl' || sport === 'NHL';
  const isMLB = sport === 'baseball_mlb' || sport === 'MLB';
  const lineLabel = (isNHL) ? 'moneyline or puck line' : (isMLB ? 'moneyline' : 'spread');
  const homeSpread = spread >= 0 ? `+${spread.toFixed(1)}` : spread.toFixed(1);
  const awaySpread = (-spread) >= 0 ? `+${(-spread).toFixed(1)}` : (-spread).toFixed(1);
  let lineContext;
  if (isNHL) {
    lineContext = `Line context: ${homeTeam} (home) vs ${awayTeam} (away). Choose ML or Puck Line based on your investigation.`;
  } else if (isMLB) {
    lineContext = `Line context: ${homeTeam} (home) vs ${awayTeam} (away) moneyline.`;
  } else {
    lineContext = `Line context: ${homeTeam} ${homeSpread} / ${awayTeam} ${awaySpread}.`;
  }

  const isNCAAB = sport === 'basketball_ncaab' || sport === 'NCAAB';
  const useOpenDecision = isMLB || isNCAAB;

  return `
<decision_checkpoint>
## PASS 2.5 - FINAL DECISION CHECKPOINT

You have completed investigation and synthesis in Pass 1. This is the final decision checkpoint.
${lineContext}

Do NOT restart analysis. Do NOT run a full re-investigation. Only call more tools if a critical factual gap blocks your decision.
</decision_checkpoint>

<synthesis>
You've done your own investigation. Your research assistant investigated independently and surfaced their findings. Commit to your final side now and draft the exact rationale that should appear on the pick card.
</synthesis>
${useOpenDecision ? `
<decision_freedom>
Use whatever reasoning you find most compelling to make your pick — stats, matchup data, momentum, series context, pitcher feel, team energy, logic, superstition, or any combination. There is no required formula. The goal is to win, and sometimes that takes finding an edge in the data, sometimes it takes reading the situation, sometimes it takes following the clues, sometimes it takes gut instinct, sometimes it takes riding a streak, sometimes it takes betting logic, sometimes it takes sports logic. The decision is yours. It is okay to take risks and chances that are not the most probable outcome — upsets happen, and sometimes the signs point that way even if the numbers don't.
</decision_freedom>
` : ''}
${decisionGuards ? `<sport_decision_guards>\n${decisionGuards}\n</sport_decision_guards>\n` : ''}

<instructions>
## YOUR TASK

Write your FINAL DECISION and FULL CARD RATIONALE DRAFT in natural language. Do NOT output JSON yet.

Use this exact format:

Final Decision: [your side at this ${lineLabel}]

Gary's Take

[3 paragraphs, plain text, ~250-400 words]

This "Gary's Take" draft should be the same rationale carried to final output.
Opening requirement: start with a brief matchup intro in an announcer-style scene-setter voice (1-2 sentences), then continue with your reasoning naturally.

**PLAYER NAME RULES (HARD RULE - NO EXCEPTIONS):**
- DO NOT mention any player who hasn't played at all this 2025-2026 season
- Only mention ACTIVE players or players with RECENT injuries that you investigated

**ESTABLISHED INJURY RULE:**
If a player has been out for multiple games, that absence is not new information — the line was SET with that absence already factored in. The team's recent stats, form, and record already reflect life without that player. Citing a non-fresh injury as a reason for your pick is the same as citing something the line already knows. The only injuries that can inform your pick are FRESH ones (0-2 games missed) where the market may not have fully adjusted yet. If you name a player listed under ESTABLISHED ABSENCES in your rationale, you are using old news that is already in the price.

Judgment calls informed by data are valid. Do NOT predict your own margin or score.

<negative_constraints>
CRITICAL CONSTRAINTS (all system prompt rules apply — these are reminders of the most violated ones):

1. PLAYER NAMES: Only from roster section. Training data is from 2024 — every number from scout report, tools, or grounding.
2. RECORDS: Records describe what happened, not what will happen.
3. Do NOT predict your own margin or final score.
4. NO FABRICATION: Don't make up stats or facts. If you cite a specific number, it must be from your investigation.
5. NO EMOJIS. Data analyst reasoning only — no tactical/scheme/film claims.
</negative_constraints>
</instructions>
`.trim();
}

/**
 * Build the PASS 1 message for PROPS mode — game investigation for props context.
 * Gary investigates the game-level dynamics that inform individual player production.
 */
export function buildPass1PropsMessage(scoutReport, homeTeam, awayTeam, today, sport = '') {
  return `
<scout_report>
## MATCHUP BRIEFING (TODAY: ${today})

${scoutReport}
</scout_report>

<investigation_rules>
## INVESTIGATION RULES

**THE SYMMETRY RULE:**
- If you call a stat for Team A, you MUST call the equivalent for Team B
- Cherry-picking stats for one side = incomplete picture

</investigation_rules>

<instructions>
## YOUR TASK: PASS 1 - INVESTIGATE THE GAME FOR PROPS

Read the scout report. Investigate this game using your tools. Build a complete picture of both teams — their players, stats, injuries, and recent form.

Your end goal is to evaluate PLAYER PROPS for this game. In this pass, gather the game-level context that informs individual player production: injuries, role changes, pace, and game context.

Use the scout report as your starting point, then investigate with fetch_stats where you need additional evidence.

Do NOT select props or make picks yet. When your investigation is complete, output this exact line on its own line:
INVESTIGATION COMPLETE
</instructions>`.trim();
}

/**
 * Build the PASS 2.5 message for PROPS mode — evaluation phase.
 * Gary has completed investigation and now identifies his top picks.
 *
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @param {string} sport - Sport identifier
 * @param {string} pass25Constitution - Props constitution pass25 content (evaluation awareness)
 */
export function buildPass25PropsMessage(homeTeam = '[HOME]', awayTeam = '[AWAY]', sport = '', pass25Constitution = '') {
  return `
${pass25Constitution ? `<props_evaluation_framework>\n${pass25Constitution}\n</props_evaluation_framework>\n\n` : ''}<synthesis>
You've completed your game investigation. You have the full picture — pace, matchups, injuries, role changes, game script expectations. If you need more data, you can still call tools. Take a moment to sit with everything before you make your picks.
</synthesis>

<instructions>
## YOUR TASK

Identify your top 2-3 prop picks with direction. State reasoning in natural language — final selection happens in Pass 3.

<negative_constraints>
CRITICAL CONSTRAINTS (all system prompt rules apply — these are reminders of the most violated ones):

1. PLAYER NAMES: Only from roster section. Training data is from 2024 — every number from scout report, tools, or grounding.
2. RECORDS: Records describe what happened, not what will happen.
3. Do NOT predict your own margin or final score.
4. NO FABRICATION: Don't make up stats or facts. If you cite a specific number, it must be from your investigation.
5. NO EMOJIS. Data analyst reasoning only — no tactical/scheme/film claims.
</negative_constraints>
</instructions>`.trim();
}

/**
 * Build the unified PASS 3 message - Simplified Final Output
 * Most decision logic has moved to Pass 2.5
 * Pass 3 now just confirms the decision and outputs final JSON
 *
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @param {object} options - Additional options (homeRecord, awayRecord, etc.)
 */
export function buildPass3Unified(homeTeam = '[HOME]', awayTeam = '[AWAY]', options = {}) {

  // DO NOT pre-fill confidence — Gary must set his own organic confidence score

  const sport = options.sport || '';
  const isNHL = sport === 'icehockey_nhl' || sport === 'NHL';

  // Build records reminder if available (anti-hallucination for Pass 3)
  const homeRecord = options.homeRecord;
  const awayRecord = options.awayRecord;
  const recordsReminder = (homeRecord || awayRecord) ? `
- **If you reference any records, use ONLY these from tonight's scout report (your training data is from 2024 and WRONG):**
  - ${homeTeam}: ${homeRecord || 'N/A'}
  - ${awayTeam}: ${awayRecord || 'N/A'}` : '';

  // ═══════════════════════════════════════════════════════════════════════════
  // GEMINI 3 OPTIMIZED: XML-tagged structure with END-OF-PROMPT instruction
  // ═══════════════════════════════════════════════════════════════════════════
  return `
<pass_context>
## PASS 3 - FORMAT ONLY

The decision and full "Gary's Take" rationale were completed in Pass 2.5.
This pass is formatting-only.

Carry forward the SAME final decision and rationale from your immediately prior response.
- You may lightly copyedit grammar/clarity.
- Do NOT add new facts, numbers, claims, or reasoning.
- Do NOT change the core reasons for the pick.
${recordsReminder}
</pass_context>

<output_requirements>
## OUTPUT REQUIREMENTS

${isNHL ? `**BET TYPE:** You have two options — MONEYLINE (picking a team to win outright, includes OT/SO) or PUCK LINE (standard -1.5/+1.5, regulation + OT only). If you believe a team wins, ML is the cleanest expression of that conviction. Choose the bet type that matches your read on the game.` : `**BET TYPE:** You have two options — SPREAD (picking a side to cover) or MONEYLINE (picking a team to win outright). If you believe a team wins, ML often pays better than the spread. Choose the bet type that matches your conviction.

**ML VALUE AWARENESS:** Heavy ML favorites return less value per dollar risked. A -200 favorite needs to win 67% of the time just to break even. When the favorite's ML price is steep, consider whether the spread offers better value. Underdog ML is always an option at plus-odds.

**SPREAD AWARENESS:**
- Favorites (-X): "Will this team win by MORE than X points?"
- Underdogs (+X): "Will this team lose by FEWER than X points (or win outright)?"`}

**CRITICAL ODDS RULES:**
1. Use the EXACT odds from the "RAW ODDS VALUES" section of the scout report — do NOT default to -110
2. For ML picks: use "moneylineHome" or "moneylineAway" value (e.g., -192, +160)
3. For spread picks: use "spreadOdds" value (e.g., -105, -115)
4. The "final_pick" field MUST include the exact odds: "[Team] ML -192" NOT "[Team] ML -110"

Output your final pick as JSON:

\`\`\`json
{
  "final_pick": "[Team] [spread/ML] [odds]",
  "rationale": "Gary's Take\\n\\n[Your reasoning]",
  "confidence_score": 0.XX
}
\`\`\`

**confidence_score (0.50-1.00):** How confident are you in this pick?
</output_requirements>

<instructions>
## YOUR TASK

Output your final pick JSON now using the exact format above.
Use the Pass 2.5 decision + rationale draft as source of truth.

Your JSON must include all three fields: "final_pick", "rationale", AND "confidence_score". Missing confidence_score will cause a system error.
</instructions>
`.trim();
}

// ═══════════════════════════════════════════════════════════════════════════
// PROPS MODE: Pass 3 replacement + finalize_props tool + response parser
// ═══════════════════════════════════════════════════════════════════════════

// Sport-specific prop type descriptions — prevents cross-sport contamination (e.g., NBA PRA on MLB players)
const PROP_TYPE_DESCRIPTIONS = {
  basketball_nba: 'Market type ONLY — e.g. "player_points", "player_steals", "player_threes", "player_rebounds", "player_assists", "player_blocks", "player_points_rebounds_assists". Match the exact prop_type from the available lines.',
  basketball_ncaab: 'Market type ONLY — e.g. "player_points", "player_steals", "player_threes", "player_rebounds", "player_assists", "player_blocks", "player_points_rebounds_assists". Match the exact prop_type from the available lines.',
  icehockey_nhl: 'Market type ONLY — e.g. "shots_on_goal", "anytime_goal", "points", "assists", "saves". Match the exact prop_type from the available lines.',
  baseball_mlb: 'Market type ONLY — e.g. "hits", "home_runs", "total_bases", "rbis", "runs_scored", "walks", "stolen_bases", "singles", "doubles", "strikeouts", "pitcher_strikeouts", "pitcher_outs", "pitcher_earned_runs", "hits_runs_rbis". Match the exact prop_type from the available lines. Do NOT use NBA prop types like points/rebounds/assists.',
  americanfootball_nfl: 'Market type ONLY — e.g. "passing_yards", "rushing_yards", "receiving_yards", "passing_touchdowns", "anytime_touchdown", "receptions", "completions". Match the exact prop_type from the available lines.',
};

function getPropsPickSchema(sport) {
  const propDesc = PROP_TYPE_DESCRIPTIONS[sport] || PROP_TYPE_DESCRIPTIONS.basketball_nba;
  return {
    type: 'object',
    properties: {
      player: { type: 'string', description: 'Full player name' },
      team: { type: 'string', description: 'Team name' },
      prop: { type: 'string', description: propDesc },
      line: { type: 'number', description: 'The numerical line for this prop — e.g. 25.5, 6.5, 3.5. This is REQUIRED.' },
      bet: { type: 'string', enum: ['over', 'under', 'yes'] },
      odds: { type: 'number', description: 'American odds — e.g. -115, +105' },
      confidence: { type: 'number', description: 'Your confidence level (0.50-1.00).' },
      rationale: { type: 'string', description: 'Your full reasoning for this pick. Cite specific stats and matchup factors. Same depth as a game pick rationale.' },
      key_stats: { type: 'array', items: { type: 'string' }, description: 'Key stats supporting your pick.' }
    },
    required: ['player', 'team', 'prop', 'line', 'bet', 'odds', 'confidence', 'rationale', 'key_stats']
  };
}

// Default schema (backwards compat for non-sport-specific callers)
export const PROPS_PICK_SCHEMA = getPropsPickSchema('basketball_nba');

export function getFinalizePropsToolForSport(sport) {
  return {
    type: 'function',
    function: {
      name: 'finalize_props',
      description: `Output your final prop picks. Include your full reasoning in the rationale field — same depth and quality as a game pick rationale.`,
      parameters: {
        type: 'object',
        properties: {
          picks: {
            type: 'array',
            items: getPropsPickSchema(sport),
            description: 'Your best 2 prop picks from different players'
          }
        },
        required: ['picks']
      }
    }
  };
}

// Legacy constant for callers that don't pass sport
export const FINALIZE_PROPS_TOOL = getFinalizePropsToolForSport('basketball_nba');

/**
 * Build Pass 3 for props mode — replaces buildPass3Unified when mode='props'
 * Gary has completed game analysis (Passes 1-2.5) and now evaluates prop candidates
 */
export function buildPass3Props(homeTeam, awayTeam, propContext = {}) {
  const { propCandidates, availableLines, playerStats, propsConstitution, gameSummary, narrativeContext } = propContext;

  // Extract pass3 constitution content (output guardrails + sport-specific output format)
  const pass3Constitution = (typeof propsConstitution === 'object' && propsConstitution.pass3)
    ? propsConstitution.pass3 : '';

  // Format candidates for the prompt
  const candidatesList = (propCandidates || []).map(c => {
    const propsStr = (c.props || []).join(', ');
    const form = c.recentForm || {};
    const formStr = [
      form.targetTrend ? `targets: ${form.targetTrend}` : '',
      form.usageTrend ? `usage: ${form.usageTrend}` : '',
      form.formTrend ? `form: ${form.formTrend}` : ''
    ].filter(Boolean).join(', ');
    return `- ${c.player} (${c.team}): ${propsStr}${formStr ? ` [${formStr}]` : ''}`;
  }).join('\n');

  // Format available lines
  const linesList = (availableLines || []).map(l => {
    return `- ${l.player}: ${l.prop_type} ${l.line} (O: ${l.over_odds || 'N/A'} / U: ${l.under_odds || 'N/A'})`;
  }).join('\n');

  // Format player stats summary
  const statsStr = typeof playerStats === 'string' ? playerStats :
    JSON.stringify(playerStats || {}, null, 1); // Full player stats — no truncation

  return `
${pass3Constitution ? `<props_output_framework>\n${pass3Constitution}\n</props_output_framework>\n\n` : ''}<pass_context>
## PASS 3 - PROPS EVALUATION PHASE

You've completed your full game analysis through Passes 1-2.5. You understand:
- The game matchup dynamics (from your investigation)
- What the data revealed about the matchup (from your evaluation)
- The key statistical factors you investigated for this game

Now apply that game understanding to evaluate PLAYER PROPS.
</pass_context>

<prop_candidates>
## PROP CANDIDATES

${candidatesList || 'No candidates provided'}
</prop_candidates>

<available_lines>
## AVAILABLE PROP LINES

${linesList || 'No lines provided'}
</available_lines>

<player_context>
## PLAYER STATS & CONTEXT

${statsStr}
</player_context>

${gameSummary ? `<game_summary>\n${typeof gameSummary === 'object' ? JSON.stringify(gameSummary, null, 2) : gameSummary}\n</game_summary>` : ''}

${narrativeContext && narrativeContext.trim() ? `<narrative_context>\n${narrativeContext.trim()}\n</narrative_context>` : ''}

<props_instructions>
## YOUR TASK: EVALUATE PROPS USING YOUR GAME ANALYSIS

You just analyzed ${awayTeam} @ ${homeTeam} in depth. Now evaluate PLAYER PROPS using the game dynamics you identified. Your game analysis provides context — but each prop is its own investigation.

Connect your game analysis to individual player production. The line reflects established roles, long-term absences, and recent production patterns.

**DIVERSITY CHECK:** If all picks are the same direction or on the most obvious players, re-examine independently.

Select your 2 best props from DIFFERENT players. Call finalize_props with your picks. Rationale should read like a game pick rationale — specific stats and matchup reasoning.

If you need specific player stats before finalizing, you can still call fetch_stats tools.

<negative_constraints>
Do NOT select two props from the same player.
Do NOT fabricate stats or lines not provided in the data.
Do NOT pick a prop just because the player is "good" — identify a specific edge the line has not absorbed.
Do NOT include confidence percentages or probability estimates in your rationale.
</negative_constraints>
</props_instructions>
`.trim();
}

// ═══════════════════════════════════════════════════════════════════════════
// MLB PASS 1
// ═══════════════════════════════════════════════════════════════════════════

function buildMlbPass1(scoutReport, today, homeTeam, awayTeam, spread) {
  const factors = getMlbSpreadFactors();
  const mlbAwareness = getMlbSeasonAwareness();
  const absSpread = Math.abs(spread || 0);

  let runLineSizeBlock = '';
  if (absSpread >= 4.5) {
    runLineSizeBlock = `\n\n**TONIGHT'S RUN LINE SIZE: LARGE (${absSpread} runs)**\nAt this run line size, the handicap is large — the market sees significant separation between these teams today. Large run lines are influenced by recent results, public perception, pitcher matchup, roster reputation, and more — as much as by the underlying matchup data. Season stats and team reputation are already baked into the run line.`;
  } else if (absSpread <= 1.5 && absSpread > 0) {
    runLineSizeBlock = `\n\n**TONIGHT'S RUN LINE SIZE: CLOSE (${absSpread} runs)**\nAt this run line size, the handicap is small — the market sees these teams as closely matched or within a narrow margin for this game. The run line still accounts for all the same factors — narratives, pitcher matchup, bullpen availability, public perception, and more. The market doesn't see much separation between these two teams today.`;
  } else if (absSpread > 1.5) {
    runLineSizeBlock = `\n\n**TONIGHT'S RUN LINE SIZE: MEDIUM (${absSpread} runs)**\nAt this run line size, the handicap reflects clear separation between the teams — the market sees one side as meaningfully better for this game. The run line accounts for narratives, pitcher matchup, bullpen availability, public perception, and more. Season stats, reputation, and situational context are already baked into the run line.`;
  }

  return `
<scout_report>
## MATCHUP BRIEFING (TODAY: ${today})

${scoutReport}
</scout_report>

<season_context>
${mlbAwareness}
</season_context>

<investigation_rules>
## INVESTIGATION RULES

**THE SYMMETRY RULE:**
- If you call a stat for Team A, you MUST call the equivalent for Team B
- Cherry-picking stats for one side = incomplete picture = bad bet

</investigation_rules>

<spread_evaluation>
## THE RUN LINE IS A PRICE

The run line is not a prediction — it is a price. A -1.5 pick means the team must win by 2+ runs. A +1.5 pick means the team can lose by 1 run and still cover. Lines are shaped by probable pitchers, career stats, recent form, bullpen availability, and public perception.

**DESCRIPTIVE vs CAUSAL:**
- **Descriptive factors** (records, standings, reputation, public narrative) explain WHY the line is set where it is. They are already IN the run line.
- **Causal factors** (how each pitcher matches up against the opposing lineup, bullpen depth, platoon advantages) reveal the actual matchup beneath the run line.
- **The SPOT** (venue, weather, tournament context, rest, bullpen workload) is factored into the run line — investigate whether the market adjustment matches the underlying matchup evidence for this game.

When you cite a record, ranking, or situation — ask yourself: "Is this describing what happened, or explaining what will happen in this game?"${runLineSizeBlock}

## RUN LINE EVALUATION FACTORS

These factors move public perception and move lines. Most of the time they are noise, not signal. For each one, investigate whether it actually affects the game or whether it just affected the price.

${factors}
</spread_evaluation>

<instructions>
## YOUR TASK: PASS 1 - INVESTIGATE THE GAME

Your job is to figure out who wins this game tonight. Investigate the full matchup — starting pitchers, lineups, bullpen availability, park factors, weather, series context, injuries — and build your understanding of which team has the edge.

The moneyline tonight was set after the probable pitchers, schedule, injuries, and rest situation were known. The question is not whether these factors exist — everyone can see them — but whether the price reflects the actual matchup for THIS game. Records and standings describe what has happened — they are not reasons for or against a moneyline.

Beyond the stats, consider the feel of the game: which team is rolling right now? Which pitcher is struggling? What's the series context? Is there momentum or pressure from recent results? Your research assistant also surfaced situational details — spring training form, velocity changes, weather, travel, and other context that may not show up in stat lines.

Use the scout report + research briefing as your starting point, then investigate with fetch_stats where you need deeper evidence.

Before completing Pass 1, include BOTH sections:
Case for ${homeTeam} winning tonight
Case for ${awayTeam} winning tonight
(Each case should be 2-3 paragraphs explaining why that team wins. Use whatever reasoning you find most compelling — stats, matchup data, momentum, series context, pitcher feel, team energy, or any combination. There is no required formula. Some nights one factor dominates; other nights it's the full picture. If one side is a heavy favorite, note the price.)

Do NOT declare a side, make a pick, or write your final analysis yet. When your Pass 1 synthesis is complete, output this exact line on its own line:
INVESTIGATION COMPLETE
</instructions>`.trim();
}

/**
 * Pass 2.75 — Bracket Advancement Pick (NCAAB Tournament only)
 * Injected after Pass 2.5, before Pass 3
 * Gary picks who advances + provides pros/cons for each team
 */
export function buildPass275Bracket(homeTeam = '[HOME]', awayTeam = '[AWAY]', sport, spread, options = {}) {
  // Bracket awareness and spread context are imported and built by agentLoop.js,
  // then passed in via options to keep this function synchronous (no dynamic imports).
  const awarenessContext = options._awarenessContext || '';
  const spreadContext = options._spreadContext || '';

  return `
<pass_context>
## PASS 2.75 — BRACKET ADVANCEMENT EVALUATION

You have completed your spread analysis and made your pick. Now you're filling out your March Madness bracket.

${awarenessContext}
${spreadContext}
</pass_context>

<instructions>
## YOUR TASK

You are filling out your bracket for this game: ${homeTeam} vs ${awayTeam}.

Based on your investigation and analysis from Pass 1 and Pass 2.5, answer:

**Who do you pick to ADVANCE to the next round?**

Also provide tournament-specific pros and cons for EACH team.

### OUTPUT FORMAT (use this exact format):

BRACKET PICK: [Team Name]
BRACKET CONFIDENCE: [0.50-1.00]
IS UPSET: [YES/NO]

BRACKET RATIONALE: [2-3 sentences explaining your bracket pick. If it differs from your spread pick, explain why.]

${homeTeam} PROS:
- [Pro 1]
- [Pro 2]
- [Pro 3]

${homeTeam} CONS:
- [Con 1]
- [Con 2]
- [Con 3]

${awayTeam} PROS:
- [Pro 1]
- [Pro 2]
- [Pro 3]

${awayTeam} CONS:
- [Con 1]
- [Con 2]
- [Con 3]
</instructions>
`.trim();
}
