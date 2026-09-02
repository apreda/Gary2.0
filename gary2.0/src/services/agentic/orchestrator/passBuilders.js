// MLB GAME LANE RESTORED Aug 18 2026 — the June engine returns for MLB games
// (founder GO after the ledger post-mortem: June +26u on this engine, every
// week negative since the Jul 22-26 cutover). Pieces grafted verbatim from
// the pre-deletion state (53962904^).
import { getNbaSpreadFactors, getNflSpreadFactors, getNcaafSpreadFactors, getMlbSpreadFactors, getMlbSeasonAwareness, getFootballSeasonAwareness } from './spreadEvaluationFactors.js';
import { GAME_ML_CAP } from './orchestratorConfig.js';
import { mlbCaseHeadings, mlbPass1Opening } from './mlbCaseMenu.js';

/**
 * Build the PASS 1 user message - Identify battlegrounds, DO NOT pick a side yet
 * Only gives instructions for the FIRST pass to prevent instruction contamination
 *
 * Every supported sport has a dedicated builder with sport-specific evaluation factors.
 * Unsupported sports throw an error — add a builder before enabling a new sport.
 */
export function buildPass1Message(scoutReport, homeTeam, awayTeam, today, sport = '', spread = null, extras = {}) {
  const isNBA = sport === 'basketball_nba' || sport === 'NBA';
  const isNFL = sport === 'americanfootball_nfl' || sport === 'NFL';
  const isNCAAF = sport === 'americanfootball_ncaaf' || sport === 'NCAAF';

  if (isNBA) {
    return buildNbaPass1(scoutReport, today, homeTeam, awayTeam, spread);
  }

  if (isNFL) {
    return buildNflPass1(scoutReport, today, homeTeam, awayTeam, spread);
  }

  if (isNCAAF) {
    return buildNcaafPass1(scoutReport, today, homeTeam, awayTeam, spread);
  }

  const isMLB = sport === 'baseball_mlb' || sport === 'MLB';
  if (isMLB) {
    return buildMlbPass1(scoutReport, today, homeTeam, awayTeam, spread, extras.game || null);
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

You are picking which side of this spread to take. The full desk above is your evidence.

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
 * NFL-specific Pass 1 — concise spread evaluation factors
 * 7 named factors tuned to NFL market dynamics.
 */
function buildNflPass1(scoutReport, today, homeTeam, awayTeam, spread) {
  const factors = getNflSpreadFactors();
  const seasonAwareness = getFootballSeasonAwareness('NFL');
  const homeSpread = Number(spread);
  const awaySpread = Number.isFinite(homeSpread) ? -homeSpread : null;
  const formatSpread = (value) => {
    if (!Number.isFinite(value)) return 'unposted';
    if (value === 0) return 'PK';
    return `${value > 0 ? '+' : ''}${value}`;
  };

  return `
<scout_report>
## MATCHUP BRIEFING (TODAY: ${today})

${scoutReport}
</scout_report>

<season_context>
${seasonAwareness}
</season_context>

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

Posted spread: ${homeTeam} ${formatSpread(homeSpread)} / ${awayTeam} ${formatSpread(awaySpread)}

Your end goal in this game is to choose the best side of this spread. In this pass, stay neutral: build decision-ready evidence through the factors above. The full desk above is your evidence.

TREND AWARENESS (L5/L10): Treat recent trend data as a clue, not a conclusion. Synthesize whether it could continue, regress, or be overvalued/undervalued at this spread number. Use sample context (opponents faced, who played, game-window conditions) to ground that assessment.

Before completing Pass 1, include BOTH sections under these exact headings:
CASE FOR ${homeTeam.toUpperCase()} COVERING THE SPREAD:
CASE FOR ${awayTeam.toUpperCase()} COVERING THE SPREAD:

Each case should be 2-3 paragraphs explaining that team's strongest verified four-quarter path to covering this posted spread and the strongest verified obstacle to that path.

Do NOT declare a side, make a pick, or write your final analysis yet. When your Pass 1 synthesis is complete, output this exact line on its own line:
INVESTIGATION COMPLETE
</instructions>
`.trim();
}

/**
 * NCAAF-specific Pass 1 — concise spread evaluation factors
 * 7 named factors tuned to college football market dynamics.
 */
function buildNcaafPass1(scoutReport, today, homeTeam, awayTeam, spread) {
  const factors = getNcaafSpreadFactors();
  const seasonAwareness = getFootballSeasonAwareness('NCAAF');
  const homeSpread = Number(spread);
  const awaySpread = Number.isFinite(homeSpread) ? -homeSpread : null;
  const formatSpread = (value) => {
    if (!Number.isFinite(value)) return 'unposted';
    if (value === 0) return 'PK';
    return `${value > 0 ? '+' : ''}${value}`;
  };

  return `
<scout_report>
## MATCHUP BRIEFING (TODAY: ${today})

${scoutReport}
</scout_report>

<season_context>
${seasonAwareness}
</season_context>

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

Posted spread: ${homeTeam} ${formatSpread(homeSpread)} / ${awayTeam} ${formatSpread(awaySpread)}

Your end goal in this game is to choose the best side of this spread. In this pass, stay neutral: build decision-ready evidence through the factors above. The full desk above is your evidence.

TREND AWARENESS (L5/L10): Treat recent trend data as a clue, not a conclusion. Synthesize whether it could continue, regress, or be overvalued/undervalued at this spread number. Use sample context (opponents faced, who played, game-window conditions) to ground that assessment.

Before completing Pass 1, include BOTH sections under these exact headings:
CASE FOR ${homeTeam.toUpperCase()} COVERING THE SPREAD:
CASE FOR ${awayTeam.toUpperCase()} COVERING THE SPREAD:

Each case should be 2-3 paragraphs explaining that team's strongest verified four-quarter path to covering this posted spread and the strongest verified obstacle to that path.

Do NOT declare a side, make a pick, or write your final analysis yet. When your Pass 1 synthesis is complete, output this exact line on its own line:
INVESTIGATION COMPLETE
</instructions>
`.trim();
}

/**
 * Build the PASS 2 message - Evaluation & Final Decision
 * Injected after investigation is sufficient. Includes spread evaluation factors
 * and the established injury rule, then asks Gary to make his pick.
 *
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @param {string} sport - Sport identifier for spread context thresholds
 * @param {number} spread - The spread value (e.g., -13.5)
 * @param {string} decisionGuards - Optional sport-specific Pass 2 guard text
 */
export function buildPass2Message(homeTeam = '[HOME]', awayTeam = '[AWAY]', sport = '', spread = 0, decisionGuards = '', market = {}) {
  // Sport-flavored provenance examples (founder GO, Aug 24): the hard rule
  // is identical for every sport; only the named examples follow the sport.
  const _fb = sport === 'americanfootball_nfl' || sport === 'NFL' || sport === 'americanfootball_ncaaf' || sport === 'NCAAF';
  const statExamples = _fb
    ? 'EPA figures, success rates, pressure rates, yards per play, snap counts or snap shares, target/carry counts, prior-season passing lines, penalty yardage'
    : 'velocity in mph, ERA, xwOBA, whiff%, batting splits, X-for-Y batter-vs-pitcher lines, PA/AB counts, runs-per-game figures, pitch counts';
  const descriptorExamples = _fb
    ? 'do not call a line "elite in pass protection," describe a "rising pressure rate," characterize a usage split, or call a rotation "settled"/"in flux" unless the underlying metric or report was provided.'
    : 'do not call a pitcher a "ground-ball specialist," describe "declining velocity," characterize a platoon split, or call a reliever\'s workload "heavy"/"fresh" unless the underlying metric was provided.';
  const isMLB = sport === 'baseball_mlb' || sport === 'MLB';
  const isFootball = sport === 'americanfootball_nfl' || sport === 'NFL' ||
    sport === 'americanfootball_ncaaf' || sport === 'NCAAF';
  // Football menu = MLB's shape (founder, Aug 24: "so NFL is as good as
  // MLB") — spread or moneyline, Gary's choice. The generic bet-type note
  // below always offered both; the old 'spread' label here contradicted it
  // and forced 16/16 preseason spreads.
  const lineLabel = isMLB ? 'moneyline or run line'
    : (isFootball ? 'spread or moneyline' : 'spread');
  // MLB (founder, Sep 2 2026): no bet-type note, no house-limit paragraph —
  // the game kind was decided before the desk was read and the cases follow
  // it; the decision turn is the bare ask and the output contract.
  const betTypeNote = isMLB
    ? ''
    : `**BET TYPE:** You have two options — SPREAD (picking a side to cover) or MONEYLINE (picking a team to win outright). Choose the bet type that matches your conviction about how this game plays out.

**HOUSE LIMIT:** no moneyline heavier than ${GAME_ML_CAP} — a favorite priced past that is a spread ticket, not a moneyline ticket.`;
  const homeSpread = spread >= 0 ? `+${spread.toFixed(1)}` : spread.toFixed(1);
  const awaySpread = (-spread) >= 0 ? `+${(-spread).toFixed(1)}` : (-spread).toFixed(1);
  // MENU TRUTH (founder GO, Sep 1 2026): a slate-recovery board can carry a
  // spread NUMBER with no spread PRICE — an unpriced line cannot be a ticket
  // (the odds gate rightly rejects it), so the menu must say so instead of
  // letting Gary pick the unpriceable side and burning the cascade.
  const finiteOdds = (v) => { const n = Number(v); return Number.isFinite(n) && n !== 0; };
  const spreadPriced = [market?.spread_home_odds, market?.spread_away_odds, market?.spreadOdds, market?.spread_odds]
    .some(finiteOdds);
  const spreadPosted = Number.isFinite(Number(spread)) && Number(spread) !== 0;
  const spreadOffBoard = spreadPosted && market && Object.keys(market).length > 0 && !spreadPriced;
  let lineContext;
  if (isMLB) {
    // No instruction here for MLB (founder, Sep 2 2026): the game kind and
    // its tickets were named before the desk; nothing tells Gary an order.
    lineContext = '';
  } else if (isFootball) {
    lineContext = spreadOffBoard
      ? `Line context: ${homeTeam} ${homeSpread} / ${awayTeam} ${awaySpread}. The spread is posted WITHOUT a price tonight — an unpriced line cannot be a ticket, so the board is MONEYLINE only.`
      : `Line context: ${homeTeam} ${homeSpread} / ${awayTeam} ${awaySpread}. Both moneylines are posted in your market data — choose Spread or ML, whichever ticket your read actually calls.`;
  } else {
    lineContext = `Line context: ${homeTeam} ${homeSpread} / ${awayTeam} ${awaySpread}.`;
  }


  const finalDecisionInstruction = `Final Decision: [your side at this ${lineLabel}]`;
  const spreadOddsRule = isMLB
    ? '3. For spread picks: use "spreadOdds" value (e.g., -105, -115)'
    : '3. For spread picks: copy the selected team\'s exact pair. A home pick uses "spreadHome" + "spreadHomeOdds"; an away pick uses "spreadAway" + "spreadAwayOdds". Never borrow the opponent\'s price or invent a missing price.';

  const structuredOutputFormat = `Format:

\`\`\`json
{
  "final_pick": "[Team] [spread/ML] [odds]",
  "rationale": "[paste your card prose above into this field]",
  "confidence_score": 0.XX
}
\`\`\`

**confidence_score (0.50-1.00):** How confident are you in this pick?

Your JSON must include all three fields: "final_pick", "rationale", AND "confidence_score". Missing confidence_score will cause a system error.`;

  // THE BARE ASK (founder GO, Aug 27, superseding the same-morning neutral
  // rewrite): the decision turn asks what a person would ask — nothing else.
  // Every synthesis speech this turn ever carried (side cases, "the board",
  // burden-of-proof framing, commit/process narration) is gone for every
  // sport; "no different than I was talking to a human." The instructions
  // block below is untouched — it is the output contract (format, rails),
  // not betting talk.
  const synthesis = `What's your bet, and what are the reasons why?`;

  // MLB (founder GO, Sep 2 2026): the decision turn is the question and the
  // output contract, nothing else — no checkpoint block (pass names and the
  // tool-era "do not restart" warning are internal), no broadcast-open
  // instruction (the one composition rule that survived Aug 27 — it put the
  // weather on 13 of 15 cards), no license sentence, no RECORDS doctrine.
  // Football keeps its text pending the Week 1 review.
  const checkpoint = isMLB ? '' : `<decision_checkpoint>
## PASS 2.5 - FINAL DECISION CHECKPOINT

You have completed investigation and synthesis in Pass 1. This is the final decision checkpoint.
${lineContext}

Do NOT restart analysis. Do NOT run a full re-investigation. The desk you have already read is your complete evidence.
</decision_checkpoint>

`;
  const cardOpenNote = isMLB ? '' : ' Open with a line or two setting the stage like a broadcast — the scene, not the case. Past the open, no mandated structure — write it the way this game deserves.';
  const tokenExample = isMLB ? 'MLB_BULLPEN_WORKLOAD' : 'PACE_HOME_AWAY';
  const naExample = isMLB ? 'xwOBA: N/A' : 'offensive_rating: N/A';
  const judgmentLine = isMLB ? '' : 'Judgment calls informed by data are valid.\n\n';
  const fabricationRule = `NO FABRICATION — STAT PROVENANCE (HARD RULE): Every specific number you write (${statExamples}) must appear VERBATIM in this conversation's scout report or other provided data. Your training-data numbers pre-date this season and citing one is a fabrication even if it sounds plausible. This also covers QUANTITATIVE DESCRIPTORS: ${descriptorExamples} If a stat you want is not in your data, OMIT THE CLAIM and write around it — a rationale with fewer numbers is fine; a rationale with an invented number is not.`;
  const constraintsList = isMLB
    ? `1. PLAYER NAMES: Only from roster section. Your training data pre-dates tonight — every number from the scout report or other provided data.
2. Do NOT predict your own margin or final score.
3. ${fabricationRule}
4. NO EMOJIS. No tactical/scheme/film claims the provided data can't support.`
    : `1. PLAYER NAMES: Only from roster section. Your training data pre-dates tonight — every number from the scout report or other provided data.
2. RECORDS: Records describe what happened, not what will happen.
3. Do NOT predict your own margin or final score.
4. ${fabricationRule}
5. NO EMOJIS. No tactical/scheme/film claims the provided data can't support.`;

  return `
${checkpoint}<synthesis>
${synthesis}
</synthesis>

${decisionGuards ? `<sport_decision_guards>\n${decisionGuards}\n</sport_decision_guards>\n` : ''}

<instructions>
## YOUR TASK

Write your FINAL DECISION and FULL CARD RATIONALE DRAFT in natural language, THEN append a structured JSON code block with the same decision. The prose is your card rationale; the JSON is the structured output the system stores.

Use this exact format:

${finalDecisionInstruction}

[Your card rationale — plain text prose]

This draft is the rationale that appears on the pick card: your pick, and the real reasons you landed on it, in your own words and your own shape.${cardOpenNote} The card prints your pick and its price directly above this text, so the reader has already seen the ticket before your first word.

Your rationale is an OFFICIAL PUBLISHED STATEMENT: never mention tokens, feeds, tools, or data requests — no "The ${tokenExample} data shows..." and no "${naExample}". If data is missing or N/A, don't use it: focus on the stats you DO have, and never apologize for or explain missing data.

**ESTABLISHED INJURY RULE:**
If a player has been out for multiple games, that absence is not new information — the line was SET with that absence already factored in. The team's recent stats, form, and record already reflect life without that player. Citing a non-fresh injury as a reason for your pick is the same as citing something the line already knows. The only injuries that can inform your pick are FRESH ones (0-2 games missed) where the market may not have fully adjusted yet. If you name a player listed under ESTABLISHED ABSENCES in your rationale, you are using old news that is already in the price.

${judgmentLine}<negative_constraints>
CRITICAL CONSTRAINTS (all system prompt rules apply — these are reminders of the most violated ones):

${constraintsList}
</negative_constraints>

## STRUCTURED OUTPUT (REQUIRED AFTER THE PROSE)

After the prose above, append a JSON code block with the structured pick. This carries the same decision and rationale you just wrote — do NOT change the decision, the side, or the reasoning between the prose and the JSON.

${betTypeNote}

**CRITICAL ODDS RULES:**
1. Use the EXACT odds shown in the scout report's betting lines — never default to -110. The pick field must carry them: "[Team] ML -192" NOT "[Team] ML -110"
2. For ML picks: use "moneylineHome" or "moneylineAway" value (e.g., -192, +160)
${spreadOddsRule}

${structuredOutputFormat}
</instructions>
`.trim();
}

/**
 * Build the unified PASS 3 message - Simplified Final Output
 * Most decision logic has moved to Pass 2
 * Pass 3 now just confirms the decision and outputs final JSON
 *
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @param {object} options - Additional options (homeRecord, awayRecord, etc.)
 */
export function buildPass3Unified(homeTeam = '[HOME]', awayTeam = '[AWAY]', options = {}) {

  // DO NOT pre-fill confidence — Gary must set his own organic confidence score

  const sport = options.sport || '';
  const isMLB = sport === 'baseball_mlb' || sport === 'MLB';
  const spreadOddsRule = isMLB
    ? '3. For spread picks: use "spreadOdds" value (e.g., -105, -115)'
    : '3. For spread picks: copy the selected team\'s exact pair. A home pick uses "spreadHome" + "spreadHomeOdds"; an away pick uses "spreadAway" + "spreadAwayOdds". Never borrow the opponent\'s price or invent a missing price.';

  // Build records reminder if available (anti-hallucination for Pass 3)
  const homeRecord = options.homeRecord;
  const awayRecord = options.awayRecord;
  const recordsReminder = (homeRecord || awayRecord) ? `
- **If you reference any records, use ONLY these from tonight's scout report (your training data pre-dates this season and is WRONG for current records):**
  - ${homeTeam}: ${homeRecord || 'N/A'}
  - ${awayTeam}: ${awayRecord || 'N/A'}` : '';

  return `
<pass_context>
## PASS 3 - FORMAT ONLY

The decision and full "Gary's Take" rationale were completed in Pass 2.
This pass is formatting-only.

Carry forward the SAME final decision and rationale from your immediately prior response.
- You may lightly copyedit grammar/clarity.
- Do NOT add new facts, numbers, claims, or reasoning.
- Do NOT change the core reasons for the pick.
${recordsReminder}
</pass_context>

<output_requirements>
## OUTPUT REQUIREMENTS

**BET TYPE:** Your ticket was already chosen in Pass 2 — carry it forward exactly (${isMLB ? 'moneyline or run line' : 'spread or moneyline'}, whichever you picked). Do NOT switch instruments in this pass.

**CRITICAL ODDS RULES:**
1. Use the EXACT odds shown in the scout report's betting lines — never default to -110. The pick field must carry them: "[Team] ML -192" NOT "[Team] ML -110"
2. For ML picks: use "moneylineHome" or "moneylineAway" value (e.g., -192, +160)
${spreadOddsRule}

Output your final pick as JSON:

\`\`\`json
{
  "final_pick": "[Team] [spread/ML] [odds]",
  "rationale": "[Your reasoning]",
  "confidence_score": 0.XX
}
\`\`\`

**confidence_score (0.50-1.00):** How confident are you in this pick?
</output_requirements>

<instructions>
## YOUR TASK

Output your final pick JSON now using the exact format above.
Use the Pass 2 decision + rationale draft as source of truth.

Your JSON must include all three fields: "final_pick", "rationale", AND "confidence_score". Missing confidence_score will cause a system error.
</instructions>
`.trim();
}

/**
 * HOUSE-LIMIT corrective re-ask (founder, Aug 18): fired once when a parsed
 * game pick's moneyline is heavier than the cap. Menu language only — the
 * read stands; the instrument must be payout-legal.
 */
export function buildMlCapRetryMessage(sport, cap = GAME_ML_CAP) {
  const isMLB = sport === 'baseball_mlb' || sport === 'MLB';
  const market = isMLB
    ? 'the run line, either side'
    : 'the spread — or the underdog\'s moneyline';
  return `HOUSE LIMIT: no moneyline heavier than ${cap}. That moneyline is not a ticket; on this game the tickets are ${market}. Return your final JSON with the exact odds for that ticket.`;
}

// ═══════════════════════════════════════════════════════════════════════════
// MLB PASS 1 (restored Aug 18 2026 — verbatim from 53962904^)
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// MLB PASS 1
// ═══════════════════════════════════════════════════════════════════════════

function buildMlbPass1(scoutReport, today, homeTeam, awayTeam, spread, game = null) {
  const factors = getMlbSpreadFactors();
  const mlbAwareness = getMlbSeasonAwareness();
  // THE GAME KIND (founder, Sep 2 2026): decided before any data is read —
  // a moneyline game asks who wins, a run-line game asks the run line. The
  // opening line names which; the cases follow it (mlbCaseMenu.js).
  const headings = mlbCaseHeadings(homeTeam, awayTeam, game);

  return `
${mlbPass1Opening(headings)}

<scout_report>
## MATCHUP BRIEFING (TODAY: ${today})

${scoutReport}
</scout_report>

<season_context>
${mlbAwareness}
</season_context>

<reading_the_game>
## READING THIS GAME

${factors}
</reading_the_game>

<instructions>
## YOUR TASK

Before completing this pass, end with BOTH sections, using these EXACT headings on their own lines (the system stores each case under its heading):

${headings.home}

${headings.away}

Do NOT declare a side or a pick yet — the bet question comes at the end. When your investigation is complete, output this exact line on its own line:
INVESTIGATION COMPLETE
</instructions>`.trim();
}
