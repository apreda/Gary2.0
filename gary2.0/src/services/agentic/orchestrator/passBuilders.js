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

<moneyline_pricing>
The prices you see were set AFTER the goalie situations, schedule, and injuries were known. The question is not whether these factors exist — everyone can see them — but whether the price has accounted for them correctly for THIS game. Records and streaks describe what has happened — they are not reasons for or against a price.
</moneyline_pricing>

<instructions>
## YOUR TASK: PASS 1 - INVESTIGATE THE GAME

Your job is to find the best bet on this game tonight — the side, and the price, that you would put your own money on. Sometimes that bet is the favorite, sometimes the underdog; the price is part of the bet, not just the question of who is the better team. Investigate the full matchup — goaltending, 5-on-5 play, special teams, roster depth, injuries — and build your understanding of which team has the edge, and whether the price reflects it.

Use the scout report + research briefing as your starting point, then investigate with fetch_stats where you need deeper evidence.

Before completing Pass 1, include BOTH sections:
Case for backing ${homeTeam} tonight
Case for backing ${awayTeam} tonight
(Each case should be 2-3 paragraphs making the argument for that side as tonight's bet — why it wins and why its price is one you'd take.)

Do NOT declare a side, make a pick, or write your final analysis yet. When your Pass 1 synthesis is complete, output this exact line on its own line:
INVESTIGATION COMPLETE
</instructions>`.trim();
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
The spread you see was set AFTER the schedule, injuries, weather, and rest situation were known. The question is not whether these factors exist — everyone can see them — but whether the spread has accounted for them correctly for THIS game. Records and rankings describe what has happened — they are not reasons for or against a spread.

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
The spread you see was set AFTER the schedule, rankings, injuries, and travel situation were known. The question is not whether these factors exist — everyone can see them — but whether the spread has accounted for them correctly for THIS game. Records and rankings describe what has happened — they are not reasons for or against a spread.

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
  const lineLabel = (isNHL) ? 'moneyline or puck line' : (isMLB ? 'moneyline or run line' : 'spread');
  const betTypeNote = isNHL
    ? `**BET TYPE:** You have two options — MONEYLINE (picking a team to win outright, includes OT/SO) or PUCK LINE (standard -1.5/+1.5, regulation + OT only). Choose the bet type that matches your read on the game.`
    : isMLB
    ? `**BET TYPE:** Two options — MONEYLINE (team wins outright) or RUN LINE (standard -1.5/+1.5). The mechanics: -1.5 pays only on a win by 2+ runs — a one-run win pays the moneyline and LOSES -1.5; +1.5 cashes on a win or a one-run loss. They are different bets on different outcomes, not two prices for the same opinion — take the bet that pays if your read is right, not the one that makes a price you dislike look better.

Check each offered line in both directions — does your read beat the price on either side of the moneyline, and on either side of the run line? A line can be wrong toward the favorite or toward the dog; the ticket is wherever your read and the number disagree — and if they nowhere disagree, your strongest conviction is still a real bet.`
    : `**BET TYPE:** You have two options — SPREAD (picking a side to cover) or MONEYLINE (picking a team to win outright). Choose the bet type that matches your conviction about how this game plays out.`;
  const homeSpread = spread >= 0 ? `+${spread.toFixed(1)}` : spread.toFixed(1);
  const awaySpread = (-spread) >= 0 ? `+${(-spread).toFixed(1)}` : (-spread).toFixed(1);
  let lineContext;
  if (isNHL) {
    lineContext = `Line context: ${homeTeam} (home) vs ${awayTeam} (away). Choose ML or Puck Line based on your investigation.`;
  } else if (isMLB) {
    lineContext = `Line context: ${homeTeam} (home) vs ${awayTeam} (away). Choose ML or Run Line — whichever ticket your read actually calls.`;
  } else {
    lineContext = `Line context: ${homeTeam} ${homeSpread} / ${awayTeam} ${awaySpread}.`;
  }

  const isNCAAB = sport === 'basketball_ncaab' || sport === 'NCAAB';
  const useOpenDecision = isNCAAB;

  const finalDecisionInstruction = `Final Decision: [your side at this ${lineLabel}]`;

  const structuredOutputFormat = `Format:

\`\`\`json
{
  "final_pick": "[Team] [spread/ML] [odds]",
  "rationale": "Gary's Take\\n\\n[paste the prose Gary's Take above into this field]",
  "confidence_score": 0.XX
}
\`\`\`

**confidence_score (0.50-1.00):** How confident are you in this pick? Set it organically based on the strength of the evidence — do NOT default. Confidence measures your read against the price — not the shortness of the price.

Your JSON must include all three fields: "final_pick", "rationale", AND "confidence_score". Missing confidence_score will cause a system error.`;

  return `
<decision_checkpoint>
## PASS 2.5 - FINAL DECISION CHECKPOINT

You have completed investigation and synthesis in Pass 1. This is the final decision checkpoint.
${lineContext}

Do NOT restart analysis. Do NOT run a full re-investigation. Only call more tools if a critical factual gap blocks your decision.
</decision_checkpoint>

<synthesis>
You've done your investigation and formed your read of this game. Your research assistant investigated independently and surfaced their findings. Now the actual job: the betting options in front of you are what you are picking from — you are not being asked who is better or who wins on paper; the prices already say what the world thinks. You are picking the BEST BET on this board: hold your read of tonight against the options and take the ticket you would put your own money on. Sometimes that is the favorite at a fair price. Sometimes it is the underdog, because the price pays far more than your read of a close game requires. And sometimes your read simply says a side gets it done regardless of the numbers — that conviction, owned plainly, is a real sports betting decision. Commit now and draft the exact rationale that should appear on the pick card.
</synthesis>
${useOpenDecision ? `
<decision_freedom>
Use whatever reasoning you find most compelling to make your pick — stats, matchup data, momentum, series context, pitcher feel, team energy, logic, superstition, or any combination. There is no required formula. You keep what the ticket pays, and sometimes earning it takes finding an edge in the data, sometimes it takes reading the situation, sometimes it takes following the clues, sometimes it takes gut instinct, sometimes it takes riding a streak, sometimes it takes betting logic, sometimes it takes sports logic. The decision is yours. It is okay to take risks and chances that are not the most probable outcome — upsets happen, and sometimes the signs point that way even if the numbers don't.
</decision_freedom>
` : ''}
${decisionGuards ? `<sport_decision_guards>\n${decisionGuards}\n</sport_decision_guards>\n` : ''}

<instructions>
## YOUR TASK

Write your FINAL DECISION and FULL CARD RATIONALE DRAFT in natural language, THEN append a structured JSON code block with the same decision. The prose is your card rationale; the JSON is the structured output the system stores.

Use this exact format:

${finalDecisionInstruction}

Gary's Take

[3 paragraphs, plain text, ~250-400 words]

This "Gary's Take" draft is the rationale that appears on the pick card: your pick, and the real reasons you landed on it.
Opening requirement: start with a brief matchup intro in an announcer-style scene-setter voice (1-2 sentences), then continue with your reasoning naturally.

**ESTABLISHED INJURY RULE:**
If a player has been out for multiple games, that absence is not new information — the line was SET with that absence already factored in. The team's recent stats, form, and record already reflect life without that player. Citing a non-fresh injury as a reason for your pick is the same as citing something the line already knows. The only injuries that can inform your pick are FRESH ones (0-2 games missed) where the market may not have fully adjusted yet. If you name a player listed under ESTABLISHED ABSENCES in your rationale, you are using old news that is already in the price.

Judgment calls informed by data are valid.

<negative_constraints>
CRITICAL CONSTRAINTS (all system prompt rules apply — these are reminders of the most violated ones):

1. PLAYER NAMES: Only from roster section. Training data is from 2024 — every number from scout report, tools, or grounding.
2. RECORDS: Records describe what happened, not what will happen.
3. Do NOT predict your own margin or final score.
4. NO FABRICATION — STAT PROVENANCE (HARD RULE): Every specific number you write (velocity in mph, ERA, xwOBA, whiff%, batting splits, X-for-Y batter-vs-pitcher lines, PA/AB counts, runs-per-game figures, pitch counts) must appear VERBATIM in this conversation's scout report, tool responses, or grounding results. Your training-data numbers are from 2024 and citing one is a fabrication even if it sounds plausible. This also covers QUANTITATIVE DESCRIPTORS: do not call a pitcher a "ground-ball specialist," describe "declining velocity," characterize a platoon split, or call a reliever's workload "heavy"/"fresh" unless the underlying metric was provided. If a stat you want is not in your data, OMIT THE CLAIM and write around it — a rationale with fewer numbers is fine; a rationale with an invented number is not.
5. NO EMOJIS. No tactical/scheme/film claims the provided data can't support.
</negative_constraints>

## STRUCTURED OUTPUT (REQUIRED AFTER THE PROSE)

After the prose above, append a JSON code block with the structured pick. This carries the same decision and rationale you just wrote — do NOT change the decision, the side, or the reasoning between the prose and the JSON.

${betTypeNote}

**CRITICAL ODDS RULES:**
1. Use the EXACT odds shown in the scout report's betting lines — never default to -110. The pick field must carry them: "[Team] ML -192" NOT "[Team] ML -110"
2. For ML picks: use "moneylineHome" or "moneylineAway" value (e.g., -192, +160)
3. For spread picks: use "spreadOdds" value (e.g., -105, -115)

${structuredOutputFormat}
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
4. NO FABRICATION — STAT PROVENANCE (HARD RULE): Every specific number you write (velocity in mph, ERA, xwOBA, whiff%, batting splits, X-for-Y batter-vs-pitcher lines, PA/AB counts, runs-per-game figures, pitch counts) must appear VERBATIM in this conversation's scout report, tool responses, or grounding results. Your training-data numbers are from 2024 and citing one is a fabrication even if it sounds plausible. This also covers QUANTITATIVE DESCRIPTORS: do not call a pitcher a "ground-ball specialist," describe "declining velocity," characterize a platoon split, or call a reliever's workload "heavy"/"fresh" unless the underlying metric was provided. If a stat you want is not in your data, OMIT THE CLAIM and write around it — a rationale with fewer numbers is fine; a rationale with an invented number is not.
5. NO EMOJIS. No tactical/scheme/film claims the provided data can't support.
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

${isNHL ? `**BET TYPE:** You have two options — MONEYLINE (picking a team to win outright, includes OT/SO) or PUCK LINE (standard -1.5/+1.5, regulation + OT only). Choose the bet type that matches your read on the game.` : `**BET TYPE:** You have two options — SPREAD (picking a side to cover) or MONEYLINE (picking a team to win outright). Choose the bet type that matches your conviction about how this game plays out.`}

**CRITICAL ODDS RULES:**
1. Use the EXACT odds shown in the scout report's betting lines — never default to -110. The pick field must carry them: "[Team] ML -192" NOT "[Team] ML -110"
2. For ML picks: use "moneylineHome" or "moneylineAway" value (e.g., -192, +160)
3. For spread picks: use "spreadOdds" value (e.g., -105, -115)

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
            description: 'Up to 2 prop picks from different players. May be EMPTY (with no_play: true) when no prop clears its break-even bar.'
          },
          no_play: {
            type: 'boolean',
            description: 'Set true ONLY when passing on this game entirely (picks must be empty). Passing when nothing clears the break-even bar is a legitimate decision.'
          },
          pass_reason: {
            type: 'string',
            description: 'One line on why this board offered no playable edge (required when no_play is true).'
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

  // Format available lines — with break-even probability per side so the
  // model anchors its judgment to the price, not just the narrative.
  const breakeven = (odds) => {
    const n = Number(odds);
    if (!Number.isFinite(n) || n === 0) return null;
    const p = n < 0 ? (-n / (-n + 100)) : (100 / (n + 100));
    return `${(p * 100).toFixed(0)}%`;
  };
  const linesList = (availableLines || []).map(l => {
    const beO = breakeven(l.over_odds);
    const beU = breakeven(l.under_odds);
    return `- ${l.player}: ${l.prop_type} ${l.line} (O: ${l.over_odds || 'N/A'}${beO ? ` needs >${beO}` : ''} / U: ${l.under_odds || 'N/A'}${beU ? ` needs >${beU}` : ''})`;
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

**THE UNDER IS A FIRST-CLASS PICK.** For EVERY prop you seriously consider, evaluate BOTH sides before choosing. The under wins whenever the player falls short — pitching matchups, reduced volume, cold contact quality, and blowout substitutions all pay the under. A prop slate that is all overs means you evaluated only half the market. Neither side is the default: the over must beat the under on evidence, and the under must beat the over the same way — a slump is not automatically an under any more than a hot streak is automatically an over; both are already in the line.

**PRICE ANCHOR (HARD RULE):** Each line above shows the break-even win probability its odds require ("needs >X%"). Only pick a side if your honest estimate of its probability EXCEEDS its break-even number. A +270 over needs to hit just 27% of the time — but if your real estimate is 15%, it is a losing bet at any narrative quality. State the side's break-even % in your key_stats.

**DIVERSITY CHECK:** If all picks are the same direction or on the most obvious players, re-examine independently.

Select 2 props from DIFFERENT players — the two strongest cases on this board, each on the side your evidence actually supports at its price (state the side's break-even % in key_stats). Two per game is the standard, and with both sides of every line genuinely evaluated it should rarely be hard to find two you can defend — take them with conviction. Reserve no_play (empty picks array, no_play: true, one-line pass_reason) for a board that gives you nothing to work with: missing lines, missing stats, a slate wipeout — a structural fallback, not a nightly option. Rationale should read like a game pick rationale — specific stats and matchup reasoning.

If you need specific player stats before finalizing, you can still call fetch_stats tools.

<negative_constraints>
Do NOT select two props from the same player.
Do NOT fabricate stats or lines not provided in the data.
Do NOT pick a prop just because the player is "good" — identify a specific edge the line has not absorbed.
Do NOT include confidence percentages or probability estimates in your rationale.
Do NOT default to the over — an over pick must beat the under on evidence, not on excitement.
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

<reading_the_game>
## READING THIS GAME

${factors}
</reading_the_game>

<instructions>
## YOUR TASK: PASS 1 - INVESTIGATE THE GAME

Your job in this pass is the READ: investigate this game and build your honest read of how it actually goes. The betting options come after your read is formed; do not shop prices now.

Use the scout report + research briefing as your starting point, then investigate with fetch_stats where you need deeper evidence.

Before completing Pass 1, include BOTH sections:
Case for backing ${homeTeam} tonight
Case for backing ${awayTeam} tonight
(Each case should be 2-3 paragraphs making the argument for that side as tonight's bet — how they win this game and what carries it. Use whatever reasoning you find most compelling — stats, matchup data, momentum, series context, pitcher feel, team energy, or any combination. There is no required formula. Some nights one factor dominates; other nights it's the full picture.)

Do NOT declare a side, make a pick, or write your final analysis yet. When your Pass 1 synthesis is complete, output this exact line on its own line:
INVESTIGATION COMPLETE
</instructions>`.trim();
}

