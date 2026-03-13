import { getNbaSpreadFactors, getNcaabSpreadFactors, getNhlSpreadFactors, getNflSpreadFactors, getNcaafSpreadFactors, getMlbSpreadFactors, getWbcTournamentAwareness } from './spreadEvaluationFactors.js';

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

  const isMLB = sport === 'baseball_mlb' || sport === 'MLB' || sport === 'WBC';
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
  const factors = getNbaSpreadFactors();
  const absSpread = Math.abs(spread || 0);

  let spreadSizeBlock = '';
  if (absSpread >= 10) {
    spreadSizeBlock = `\n\n**TONIGHT'S SPREAD SIZE: LARGE (${absSpread} points)**\nAt this spread size, the handicap is large — the market sees significant separation between these teams today. Large spreads are influenced by recent results, public perception, injury news, streaks, home-court narratives, and more — as much as by the underlying matchup data. Season records and team reputation are already baked into the spread.`;
  } else if (absSpread < 6 && absSpread > 0) {
    spreadSizeBlock = `\n\n**TONIGHT'S SPREAD SIZE: CLOSE (${absSpread} points)**\nAt this spread size, the handicap is small — the market sees these teams as closely matched or within a few points of each other for this game. The spread still accounts for all the same factors — narratives, rest, injuries, public perception, and more. The market doesn't see much separation between these two teams today.`;
  } else if (absSpread >= 6) {
    spreadSizeBlock = `\n\n**TONIGHT'S SPREAD SIZE: MEDIUM (${absSpread} points)**\nAt this spread size, the handicap reflects clear separation between the teams — the market sees one side as meaningfully better for this game. The spread accounts for narratives, rest, injuries, public perception, and more. Season records, reputation, and situational context are already baked into the spread.`;
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

<spread_evaluation>
## THE SPREAD IS A PRICE

The spread is not a prediction — it is a price. Lines are shaped by recent performance, reputation, standings, and public perception. Transient factors — rest, travel, injuries, schedule density — can shift a line away from where the underlying matchup data says it should be.

**NARRATIVE FACTORS AND THE PRICE:**
Narrative factors — rest vs rust, back-to-backs, streaks, revenge spots, travel, emotional storylines, hot/cold stretches, returning players, head-to-head recent results — move the line. They shift the number away from where the matchup data alone would set it. The market treats rest and returning players as positives — but rest can mean rust, and a returning player can disrupt rotations and chemistry.

These factors are already in the price. They can be part of your reasoning — not as evidence that a team will play better or worse, but as context for why each side is getting the number they're getting. A narrative that moved the line can work in favor of either side: the favorite may be laying less than expected, or the underdog may be getting more than expected.

When narratives appear in your rationale, use them to explain why the number creates value for the side you're taking — not as standalone reasons for a team covering or not covering.

**DESCRIPTIVE vs CAUSAL:**
- **Descriptive factors** (records, rankings, standings, streaks, reputation) explain WHY the line is set where it is. They are already IN the price.
- **Causal factors** (how each team plays, matchup dynamics, situational context) reveal the actual matchup beneath the price.
- **The SPOT** (venue, schedule, rest, travel, emotional context) is factored into the price — the market adjustment may or may not match the underlying matchup evidence for tonight.

**INJURY TIMING IN THIS PRICE:**
- Use the injury duration tags from the scout report exactly as shown.
- **FRESH (0-2 games missed):** Replacement production and recent stat windows may still include games with this player.
- **SHORT-TERM / PRICED IN / LONG-TERM / SEASON-LONG:** Treat as established context; current team baselines usually already reflect these absences.
- Established absences can explain why a number is where it is, but do not treat them as standalone new evidence without supporting data from this specific matchup.

When you cite a record, ranking, or situation — ask yourself: "Is this describing what happened, or explaining what will happen tonight?"${spreadSizeBlock}

## SPREAD EVALUATION FACTORS

Use these factors as investigation lenses while you evaluate BOTH sides of tonight's spread:

${factors}
</spread_evaluation>

<instructions>
## YOUR TASK: PASS 1 - INVESTIGATE THE SPREAD

Your end goal in this game is to choose the best side of this spread. In this pass, stay neutral: verify/disconfirm key claims from the briefing, pressure-test trap/narrative/upset hypotheses with data, and build decision-ready evidence for both teams.

Think of the spread as the market's handicap to make this specific game closer to even at tip-off. During Pass 1, investigate and synthesize whether the number is balancing both teams or leaving one side overvalued or undervalued. Use all available data (scout report, research briefing, and your own calls) and apply spread-factor guidance to judge which signals are meaningful versus already priced in.

Some elements require judgment calls on whether trends, narratives, or situational factors will actually matter tonight for ATS outcome.

Distinguish what explains why the line exists from what could still influence ATS result tonight.

Make reasoned judgment calls where uncertainty exists (trend continuation vs regression, narrative impact vs noise, situational effect vs priced-in context). Final side selection comes later.

Use the scout report + research briefing as your starting point, then investigate with fetch_stats where you need additional evidence to verify, disconfirm, or clarify critical gaps before synthesis.

TREND AWARENESS (L5/L10): Treat recent trend data as a clue, not a conclusion. Synthesize whether it could continue, regress, or be overvalued/undervalued at this spread number. Use sample context (opponents faced, who played, game-window conditions) to ground that assessment.

Before completing Pass 1, include BOTH sections:
Case for home spread side
Case for away spread side

Each case should be 2-3 paragraphs, grounded in the data you gathered, and explain why this side of the spread is the better bet at this number tonight. Treat the spread as the market's equalizer price for this game: your job is to explain why this side is advantaged relative to that price.

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

  let spreadSizeBlock = '';
  if (absSpread >= 15) {
    spreadSizeBlock = `\n\n**TONIGHT'S SPREAD SIZE: BLOWOUT TERRITORY (${absSpread} points)**\nSpreads this large are rare in tournament play. The market sees a massive quality gap between these teams — seeding, talent, and every available metric point the same direction. Even here, upsets happen in the tournament. The public may be piling on the favorite or actively picking the upset — both sides move this number. The seed gap and season-long metrics are already baked into this spread.`;
  } else if (absSpread >= 10) {
    spreadSizeBlock = `\n\n**TONIGHT'S SPREAD SIZE: LARGE (${absSpread} points)**\nA double-digit spread in the tournament — the market sees substantial separation. Tournament spreads this large attract upset-picking public money, which can move the line toward the lower seed. The seed gap, season records, and team reputation are already in this number. Single elimination compresses margins — investigate whether the gap is as wide as the number suggests.`;
  } else if (absSpread >= 5) {
    spreadSizeBlock = `\n\n**TONIGHT'S SPREAD SIZE: MEDIUM (${absSpread} points)**\nThe market sees clear separation between these teams. In the tournament, this is a meaningful number — single elimination, neutral courts, and heightened intensity compress margins. The seed gap and public perception are already baked into this spread. Investigate whether the matchup data supports this level of separation.`;
  } else if (absSpread > 0) {
    spreadSizeBlock = `\n\n**TONIGHT'S SPREAD SIZE: CLOSE (${absSpread} points)**\nA tight spread — the market sees these teams as near-even for this game. Tournament games are naturally tighter, and a close number means the market sees a real matchup regardless of seed gap. Public money and narrative can still be disproportionately on one side even in a close game.`;
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

<spread_evaluation>
## THE SPREAD IS A PRICE

The spread is not a prediction — it is a price. Lines are shaped by recent performance, reputation, rankings, and public perception. Transient factors — home court, injuries, motivation, tournament context — can shift a line away from where the underlying matchup data says it should be.

**NARRATIVE FACTORS AND THE PRICE:**
Narrative factors — seeds, program reputation, upset storylines, cinderella runs, bracket position, historical tournament performance, star power, team brand, rest vs rust — shape tournament prices. They drive public betting action and move the line in one direction or another, giving one side a bigger number and the other side a smaller number than the matchup data alone would produce.

In the tournament, these narratives are especially loud. The public actively tries to pick upsets — sometimes putting so much action on a lower seed that the "underdog" becomes the public side. Seeds and rankings drive public action, but seeds are based on season-long body of work that may or may not reflect how a team is playing right now. Cinderella storylines, defending champion narratives, and breakout star performances from earlier rounds all move public money and move lines.

These factors are part of the number. They can be part of your reasoning — not as evidence that a team will play better or worse, but as context for why each side is getting the number they're getting. A narrative that has moved the line can work in favor of either side of the spread: the favorite may be laying less than expected, or the underdog may be getting more than expected, because of the narratives baked into tonight's price.

When narratives appear in your rationale, use them to explain why the number creates value for the side you're taking — not as standalone reasons for why a team will or won't cover.

**DESCRIPTIVE vs CAUSAL:**
- **Descriptive factors** (records, rankings, standings, streaks, reputation) explain WHY the line is set where it is. They are already IN the price.
- **Causal factors** (how each team plays, matchup dynamics, situational context) reveal the actual matchup beneath the price.
- **The SPOT** (neutral site, regional proximity, tournament context, single elimination) is factored into the price — investigate whether the market adjustment matches the underlying matchup evidence for tonight.

When you cite a record, ranking, or situation — ask yourself: "Is this describing what happened, or explaining what will happen tonight?"${spreadSizeBlock}

## SPREAD EVALUATION FACTORS

These factors move public perception and move lines. Most of the time they are noise, not signal. For each one, investigate whether it actually affects the game or whether it just affected the price.

${factors}
</spread_evaluation>

<instructions>
## YOUR TASK: PASS 1 - INVESTIGATE THE SPREAD

Think of the spread as the market's handicap to level this matchup on paper. Investigate and synthesize whether the number is balancing both teams or leaving one side overvalued or undervalued.

Your end goal in this game is to choose the best side of this spread. In this pass, stay neutral: verify/disconfirm key claims and build decision-ready evidence through the factors above.

Use the scout report + research briefing as your starting point, then investigate with fetch_stats where you need additional evidence to verify, disconfirm, or clarify critical gaps before synthesis.

TREND AWARENESS (L5/L10): Treat recent trend data as a clue, not a conclusion. Synthesize whether it could continue, regress, or be overvalued/undervalued at this spread number. Use sample context (opponents faced, who played, game-window conditions) to ground that assessment.

EFFICIENCY METRICS (AdjOE, AdjDE, AdjEM): Think in actual values, not national rankings. The values tell you the matchup gap — rankings are a byproduct of the values and are already reflected in the line.

Do NOT declare a side, make a pick, or write your final analysis yet. When your Pass 1 synthesis is complete, output this exact line on its own line:
INVESTIGATION COMPLETE
</instructions>
`.trim();
}

/**
 * NHL-specific Pass 1 — moneyline + puck line evaluation factors
 * 7 named factors tuned to hockey market dynamics.
 */
function buildNhlPass1(scoutReport, today, homeTeam, awayTeam, spread) {
  const factors = getNhlSpreadFactors();

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

<spread_evaluation>
## THE LINE IS A PRICE

The moneyline and puck line are not predictions — they are prices. Lines are shaped by recent performance, goaltending, reputation, and public perception. Transient factors — rest, travel, back-to-backs, injuries — can shift a line away from where the underlying matchup data says it should be.

**MONEYLINE vs PUCK LINE:**
- **Moneyline (ML):** Pick the winner outright. Includes OT and shootouts.
- **Puck Line (PL):** Standard hockey spread (usually -1.5 / +1.5). Favorite must win by 2+ goals. Underdog covers if they win or lose by exactly 1. Puck line does NOT include shootouts — regulation + OT only.

**NARRATIVE FACTORS AND THE PRICE:**
Narrative factors — winning streaks, goaltender reputation, back-to-back fatigue, rivalry history, revenge spots, playoff race context, trade deadline acquisitions, returning players, head-to-head recent results — move the line. They shift the price away from where the matchup data alone would set it. The market treats rest and confirmed starters as signal — but a rested team can be rusty, and a confirmed starter's recent form may diverge from their season baseline.

These factors are already in the price. They can be part of your reasoning — not as evidence that a team will play better or worse, but as context for why each side is getting the number they're getting. A narrative that moved the line can work in favor of either side: the favorite's ML may be steeper or shallower than expected, and the puck line odds shift accordingly.

When narratives appear in your rationale, use them to explain why the price creates value for the side you're taking — not as standalone reasons for a team winning or losing.

**INJURY TIMING IN THIS PRICE:**
- Use the injury duration tags from the scout report exactly as shown.
- **FRESH:** Replacement production and recent stat windows may still include games with this player.
- **SHORT-TERM / LONG-TERM / SEASON-LONG:** Treat as established context; current team baselines usually already reflect these absences.
- Established absences can explain why a line is where it is, but do not treat them as standalone new evidence without supporting data from this specific matchup.

**DESCRIPTIVE vs CAUSAL:**
- **Descriptive factors** (records, standings, streaks, reputation) explain WHY the line is set where it is. They are already IN the price.
- **Causal factors** (how each team plays, goaltending matchup, special teams dynamics, situational context) reveal the actual matchup beneath the price.
- **The SPOT** (venue, schedule, rest, travel, emotional context) is factored into the price — the market adjustment may or may not match the underlying matchup evidence for tonight.

When you cite a record, ranking, or situation — ask yourself: "Is this describing what happened, or explaining what will happen tonight?"${mlPriceBlock}

## PRICING EVALUATION FACTORS

These factors move public perception and move lines. Most of the time they are noise, not signal. For each one, investigate whether it actually affects the game or whether it just affected the price.

${factors}
</spread_evaluation>

<instructions>
## YOUR TASK: PASS 1 - INVESTIGATE THE LINE

Your end goal in this game is to choose the best side and bet type (ML or puck line). Think of the line as the market's price for this matchup tonight. During Pass 1, investigate and synthesize whether the price is reflecting the actual matchup or whether one side is overvalued or undervalued.

In this pass, stay neutral: verify/disconfirm key claims from the briefing, pressure-test narrative and situational hypotheses with data, and build decision-ready evidence for both teams.

Use the scout report + research briefing as your starting point, then investigate with fetch_stats where you need additional evidence to verify, disconfirm, or clarify critical gaps before synthesis.

TREND AWARENESS (L5/L10): Treat recent trend data as a clue, not a conclusion. Synthesize whether it could continue, regress, or be overvalued/undervalued at this price. Use sample context (opponents faced, who played, game-window conditions) to ground that assessment.

Some elements require judgment calls on whether trends, narratives, or situational factors will actually matter tonight. Distinguish what explains why the line exists from what could still influence the outcome tonight.

Make reasoned judgment calls where uncertainty exists (trend continuation vs regression, narrative impact vs noise, situational effect vs priced-in context). Final side and bet type selection comes later.

Before completing Pass 1, include BOTH sections:
Case for ${homeTeam}
Case for ${awayTeam}

Each case should be 3 paragraphs, grounded in the data you gathered, and explain why this team is the right side tonight at this price. Address both the side (which team) and the bet type (ML or puck line) that makes sense for each case.

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
  const isMLB = sport === 'baseball_mlb' || sport === 'MLB' || sport === 'WBC';
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

Read the scout report. Investigate this game using your tools. Build a complete picture of both teams — their pace, style, personnel, and matchup dynamics.

Your end goal is to evaluate PLAYER PROPS for this game. In this pass, gather the game-level context that informs individual player production: injuries, role changes, matchup dynamics, pace, and game script expectations.

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

**BET TYPE:** You have two options — SPREAD (picking a side to cover) or MONEYLINE (picking a team to win outright). If you believe a team wins, ML often pays better than the spread. Choose the bet type that matches your conviction.

**ML VALUE AWARENESS:** Heavy ML favorites return less value per dollar risked. A -200 favorite needs to win 67% of the time just to break even. When the favorite's ML price is steep, consider whether the spread offers better value. Underdog ML is always an option at plus-odds.

**SPREAD AWARENESS:**
- Favorites (-X): "Will this team win by MORE than X points?"
- Underdogs (+X): "Will this team lose by FEWER than X points (or win outright)?"

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

export const PROPS_PICK_SCHEMA = {
  type: 'object',
  properties: {
    player: { type: 'string', description: 'Full player name' },
    team: { type: 'string', description: 'Team name' },
    prop: { type: 'string', description: 'Market type ONLY — e.g. "player_points", "player_steals", "player_threes", "player_rebounds", "player_assists", "player_blocks", "player_points_rebounds_assists". Match the exact prop_type from the available lines.' },
    line: { type: 'number', description: 'The numerical line for this prop — e.g. 25.5, 6.5, 3.5. This is REQUIRED.' },
    bet: { type: 'string', enum: ['over', 'under', 'yes'] },
    odds: { type: 'number', description: 'American odds — e.g. -115, +105' },
    confidence: { type: 'number', description: 'Your confidence level (0.50-1.00).' },
    rationale: { type: 'string', description: 'Your full reasoning for this pick. Cite specific stats and matchup factors. Same depth as a game pick rationale.' },
    key_stats: { type: 'array', items: { type: 'string' }, description: 'Key stats supporting your pick.' }
  },
  required: ['player', 'team', 'prop', 'line', 'bet', 'odds', 'confidence', 'rationale', 'key_stats']
};

export const FINALIZE_PROPS_TOOL = {
  type: 'function',
  function: {
    name: 'finalize_props',
    description: `Output your final prop picks. Include your full reasoning in the rationale field — same depth and quality as a game pick rationale.`,
    parameters: {
      type: 'object',
      properties: {
        picks: {
          type: 'array',
          items: PROPS_PICK_SCHEMA,
          description: 'Your best 2 prop picks from different players'
        }
      },
      required: ['picks']
    }
  }
};

/**
 * Build Pass 3 for props mode — replaces buildPass3Unified when mode='props'
 * Gary has completed game analysis (Passes 1-2.5) and now evaluates prop candidates
 */
export function buildPass3Props(homeTeam, awayTeam, propContext = {}) {
  const { propCandidates, availableLines, playerStats, propsConstitution, gameSummary } = propContext;

  // Extract pass3 constitution content (output guardrails + sport-specific output format)
  const pass3Constitution = (typeof propsConstitution === 'object' && propsConstitution.pass3)
    ? propsConstitution.pass3 : '';

  // Format candidates for the prompt
  const candidatesList = (propCandidates || []).map(c => {
    const propsStr = (c.props || []).join(', ');
    const form = c.recentForm || {};
    return `- ${c.player} (${c.team}): ${propsStr}`;
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

${gameSummary ? `<game_summary>\n${gameSummary}\n</game_summary>` : ''}

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
// MLB/WBC PASS 1
// ═══════════════════════════════════════════════════════════════════════════

function buildMlbPass1(scoutReport, today, homeTeam, awayTeam, spread) {
  const factors = getMlbSpreadFactors();
  const wbcAwareness = getWbcTournamentAwareness();
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

<tournament_context>
${wbcAwareness}
</tournament_context>

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
## YOUR TASK: PASS 1 - INVESTIGATE THE RUN LINE

Think of the run line as baseball's spread — the market's handicap to level this matchup. Investigate and synthesize whether the run line price reflects the actual matchup or leaves one side overvalued or undervalued.

Your end goal in this game is to choose the best side of this run line. In this pass, stay neutral: verify/disconfirm key claims and build decision-ready evidence through the factors above.

Use the scout report as your starting point, then investigate with fetch_stats where you need additional evidence to verify, disconfirm, or clarify critical gaps before synthesis.

Do NOT declare a side, make a pick, or write your final analysis yet. When your Pass 1 synthesis is complete, output this exact line on its own line:
INVESTIGATION COMPLETE
</instructions>`.trim();
}
