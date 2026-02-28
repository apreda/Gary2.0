import { getConstitution } from '../constitution/index.js';

/**
 * Build the PASS 1 user message - Identify battlegrounds, DO NOT pick a side yet
 * Only gives instructions for the FIRST pass to prevent instruction contamination
 */
export function buildPass1Message(scoutReport, homeTeam, awayTeam, today, sport = '') {
  // Sport-specific context is in the constitution (system prompt).
  // Pass 1 is a universal process instruction: read the scout report, investigate with tools.

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

**DO NOT claim "Team X is on a hot streak" without verifying WHO is driving it.**
**DO NOT cite a recent loss as evidence without knowing WHO PLAYED in that game.**
</investigation_rules>

<trigger_investigation>
The Scout Report may include investigation triggers — situations flagged for your attention. These are inputs, not conclusions.
</trigger_investigation>

<spread_investigation>
## INTERROGATE THE LINE

As you investigate, think about the spread as a number to stress-test — not just a team to pick:

- How does this line appear to be set? What are the 2-3 biggest factors the number seems to be pricing in?
- Is the line reflecting these teams' current form, or is it anchored to season-long reputation or a specific recent result?
- What transient factors — rest, travel, injuries, schedule density — might be shifting the line away from where the underlying data says it should be?
- If you strip away the narratives and just look at the matchup data — efficiency, form, personnel — does the number feel right, too high, or too low?
</spread_investigation>

<instructions>
## YOUR TASK: PASS 1 - INVESTIGATION

Read the scout report. Investigate this game using your tools. Build the complete picture for both teams equally.

Investigate any flagged triggers in the scout report — do not dismiss them without checking.

Do NOT make a pick or write your final analysis yet. You will be told when it's time to decide. Right now, investigate.

BEGIN INVESTIGATION NOW.
</instructions>
`.trim();
}



/**
 * Build the PASS 2.5 message - Case Review & Final Decision
 * Injected AFTER the advisor builds bilateral cases
 *
 * FLOW (Gary stays objective until final decision):
 * Step 1: Review cases and research assistant's read (evaluate all inputs)
 * Step 2: Final Decision (make ONE pick based on complete analysis)
 *
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @param {string} sport - Sport identifier for spread context thresholds
 * @param {number} spread - The spread value (e.g., -13.5)
 */
export function buildPass25Message(homeTeam = '[HOME]', awayTeam = '[AWAY]', sport = '', spread = 0) {
  return `
<case_review>
## CASE REVIEW

Your research assistant built the strongest case for each side of this game. Read both carefully. Factor their reasoning into your decision the way a professional gambler weighs trusted opinions before placing a bet.
</case_review>

<synthesis>
You've done your own investigation. Your research assistant investigated independently, surfaced their findings, and built the strongest case for each side. You have all the data. If you need more, you can still call tools. Take a moment to sit with everything before you make your pick.
</synthesis>

<instructions>
## YOUR TASK

Make your pick. Write in natural language — do NOT output JSON. The final formatted output comes in the next step.

**PLAYER NAME RULES (HARD RULE - NO EXCEPTIONS):**
- DO NOT mention any player who hasn't played at all this 2025-2026 season
- Only mention ACTIVE players or players with RECENT injuries that you investigated

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
 * Build the PASS 2.5 message for PROPS mode — evaluate bilateral OVER/UNDER cases
 *
 * After the advisor builds bilateral OVER/UNDER cases for each prop candidate,
 * this pass asks Gary to evaluate those cases and identify which
 * candidates have the strongest edges before the final selection in Pass 3.
 *
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @param {string} sport - Sport identifier
 */
export function buildPass25PropsMessage(homeTeam = '[HOME]', awayTeam = '[AWAY]', sport = '') {
  return `
<case_review>
## CASE REVIEW

Your research assistant built the strongest OVER and UNDER case for each prop candidate. Read both sides carefully. Factor their reasoning into your decision the way a professional gambler weighs trusted opinions before placing a bet.
</case_review>

<synthesis>
You've done your own investigation. Your research assistant investigated independently, surfaced their findings, and built the strongest OVER and UNDER case for each candidate. You have all the data. If you need more, you can still call tools. Take a moment to sit with everything before you make your picks.
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
## PASS 3 - FINAL OUTPUT

You've reviewed the cases, evaluated the evidence, and made your decision in Pass 2.5.
You have access to ALL evidence from your investigation - nothing is truncated.

**Your Decision:**
- **Final Pick:** Your pick${recordsReminder}

**INVESTIGATION OPTION:**
If you realize you need more data before finalizing, you can still call fetch_stats for additional investigation.
However, if your analysis is complete, proceed directly to output.
</pass_context>

<rationale_constraints>
## RATIONALE CONSTRAINTS

Your final rationale is YOUR DECISION — the real reasons you're making this bet, informed by your investigation.
- Do NOT fabricate facts or stats you didn't find in your investigation
- You're making a bet, not writing a research paper. Not every sentence needs a stat — judgment calls informed by data are valid. Lead with why you like this side.
- **INJURY RULE (HARD):** DO NOT name any player who hasn't played this 2025-26 season. For injuries the market has already absorbed (player out for multiple games, line already reflects their absence), reference the TEAM's current performance instead (e.g., "the current rotation has gone 8-3 over L10" NOT "without Player X who's been out since November"). Only cite an injury by name if it's genuinely new information the line may not fully reflect. If you name a player not in tonight's lineup, your rationale is INVALID.

**IMPORTANT:** All the data from your investigation is available in this conversation. Use it to inform your reasoning.

**RATIONALE FORMAT (CRITICAL - iOS app depends on this):**
Your rationale MUST start with exactly: "Gary's Take\\n\\n"

**OPENING:** Start with a natural, broadcast-style scene-setter (1-2 sentences) — set the stage for the matchup using the stakes, the setting, the storyline. Then transition into your key factor.

**LENGTH:** 3-4 paragraphs, ~300-400 words. Write like you're explaining your bet to another sharp. No fluff, no fabricated tactics.

**STYLE:** Plain text only. No markdown, no headers, no ALL-CAPS labels, no bullet points. Just natural paragraphs — like you're talking to someone at a sportsbook.

**DATA INTEGRITY:**
- Do NOT fabricate stats, player names, or facts you didn't find in your investigation.
- When you cite a specific number, it must be real. But not every opinion needs a stat citation — you're making a betting judgment informed by data.

**NO TRAINING DATA CLAIMS:**
Only cite facts from the scout report, stats you requested, or grounding search results. Claims from training knowledge about coaching tendencies, player reputations, or team identities are not verifiable — don't write them.
</rationale_constraints>

<output_requirements>
## OUTPUT REQUIREMENTS

**BET TYPE:** You have two options — SPREAD (picking a side to cover) or MONEYLINE (picking a team to win outright). If you believe a team wins, ML often pays better than the spread. Choose the bet type that matches your conviction.

**SPREAD AWARENESS:**
- Favorites (-X): "Will this team win by MORE than X points?"
- Underdogs (+X): "Will this team lose by FEWER than X points (or win outright)?"

**CRITICAL ODDS RULES:**
1. Use the EXACT odds from the "RAW ODDS VALUES" section of the scout report — do NOT default to -110
2. For ML picks: use "moneylineHome" or "moneylineAway" value (e.g., -192, +160)
3. For spread picks: use "spreadOdds" value (e.g., -105, -115)
4. The "final_pick" field MUST include the exact odds: "[Team] ML -192" NOT "[Team] ML -110"

**FORBIDDEN RATIONALE OPENERS:** Do NOT start with "The betting public...", "Sharp money...", "Vegas...", "Looking at this matchup...", or any market commentary.

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

OUTPUT YOUR FINAL PICK JSON NOW using the format above.
All analysis is complete - just finalize and output.

<negative_constraints>
SEASON-LONG injuries: The team has adapted. Focus on current roster performance.
Missing players' stats have been REDISTRIBUTED to current players.
If citing "X-Y record without player", investigate the MARGINS - were losses close or blowouts?
Focus on WHO IS PLAYING and RECENT FORM, not hypotheticals about healthy rosters.
</negative_constraints>

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
<pass_context>
## PASS 3 - PROPS EVALUATION PHASE

You've completed your full game analysis through Passes 1-2.5. You understand:
- The game matchup dynamics (from your Steel Man cases)
- What the data revealed about the matchup (from your case review)
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

Connect your game analysis to individual player production. The line reflects established roles, long-term absences, and recent production patterns. Your edge comes from seeing what the line hasn't fully absorbed yet.

**DIVERSITY CHECK:** If all picks are the same direction or on the most obvious players, re-examine independently. Edge comes from changed situations the line hasn't captured, not from obvious stars.

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

