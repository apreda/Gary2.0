/**
 * DFS Build Thesis Builder
 *
 * Phase 3 of the Agentic DFS system.
 * Gary Pro (Gemini Pro) forms his BUILD THESIS for the slate based on
 * the investigation from Phase 2.
 *
 * A BUILD THESIS is NOT just picking the highest projected players.
 * It's Gary's STRATEGY for how to attack this specific slate:
 * - What archetype to use (stars+punts, balanced, contrarian)
 * - Which games to target for stacking
 * - What usage situations to exploit
 * - How this thesis wins the tournament (not just cashes)
 *
 * FOLLOWS CLAUDE.md: Gary REASONS about the slate, not follows formulas.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// THESIS BUILDER SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

const THESIS_BUILDER_PROMPT = `
<role>
You are Gary - an elite DFS player with deep sharp knowledge.
You've just completed your slate investigation. Now form your BUILD THESIS.
</role>

<what_is_a_thesis>
A BUILD THESIS is your strategic read on this specific slate based on your investigation.
Real sharps don't pick a "strategy template" first and then search for players that fit.
They investigate the data first, and the lineup shape emerges from assembling those findings.

Your thesis answers:
1. What are the TOP 3-5 EDGES on this slate?
2. Which GAMES have the best scoring environment?
3. Where is the MARKET WRONG about a player's value?
4. How do these edges combine into a lineup that can WIN?
</what_is_a_thesis>

<investigation_areas>
When forming your thesis, investigate these areas based on the slate data:
- How do injuries change the landscape for specific teams and players?
- Where does player production diverge from what their salary suggests?
- Which game environments stand out and why?
- Are there matchup dynamics worth investigating further?
- What correlation opportunities does the slate present?
Your thesis should emerge from what the DATA shows, not from predefined categories.
</investigation_areas>

<task>
Based on the slate investigation provided above, form your thesis:

1. What are your TOP 3-5 EDGES on this slate? Be specific about WHY each is an edge.
2. Which GAMES are you targeting and what makes them special?
3. How do these edges combine into a winning lineup strategy?
4. What needs to go RIGHT for this thesis to WIN?

Be specific. Have conviction. This is YOUR thesis.
</task>
`;

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN THESIS BUILDER FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Gary Pro forms his build thesis for the slate
 *
 * @param {GoogleGenerativeAI} genAI - Gemini client
 * @param {Object} slateAnalysis - Output from Phase 2 (slate investigation)
 * @param {Object} context - DFS context with players, games, etc.
 * @param {Object} options - Model options
 * @returns {Object} - Gary's build thesis
 */
export async function formBuildThesis(genAI, slateAnalysis, context, options = {}) {
  const { modelName = 'gemini-3-pro-preview', constitution = '' } = options;

  console.log('[Thesis Builder] Gary Pro forming build thesis...');

  // Build the thesis request
  const thesisRequest = buildThesisRequest(slateAnalysis, context);

  // Create Gemini Pro model with high thinking level
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: THESIS_BUILDER_PROMPT + '\n\n' + constitution,
    generationConfig: {
      temperature: 1.0, // Gemini: Keep at 1.0
      maxOutputTokens: 4096
    },
    // Enable extended thinking for deep reasoning
    thinkingConfig: {
      thinkingBudget: 8192
    }
  });

  const result = await model.generateContent(thesisRequest);
  const responseText = result.response.text();

  // Parse Gary's thesis
  const thesis = parseThesisResponse(responseText);

  console.log(`[Thesis Builder] Edges: ${thesis.edges?.map(e => e.type).join(', ')}`);
  console.log(`[Thesis Builder] Target Games: ${thesis.targetGames?.join(', ')}`);

  return thesis;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUILD THESIS REQUEST
// ═══════════════════════════════════════════════════════════════════════════════

function buildThesisRequest(slateAnalysis, context) {
  const { injuryReport, gameProfiles, gameEnvironments, rawAnalysis } = slateAnalysis;
  const profiles = gameProfiles || [];
  const { winningTargets, platform, contestType, players } = context;

  return `
## SLATE INVESTIGATION COMPLETE

### WINNING TARGETS (from FIBLE)
- To WIN this GPP: ${winningTargets?.toWin || 380} pts
- Top 1%: ${winningTargets?.top1Percent || 355} pts
- Cash Line: ${winningTargets?.toCash || 285} pts
- Slate Size: ${winningTargets?.gameCount || 8} games

### INJURY REPORT
${formatInjuryReport(injuryReport)}

### GAME PROFILES
${formatGameProfiles(profiles)}

### GAME ENVIRONMENTS
${formatGameEnvironments(gameEnvironments)}

### RAW INVESTIGATION NOTES
${rawAnalysis?.slice(0, 5000) || 'No additional notes'}

---

## NOW FORM YOUR BUILD THESIS

Based on this investigation:

1. What are the TOP 3-5 findings from your investigation? What stands out from the data?

2. Which GAMES are you targeting and why?

3. How do these edges combine into a winning strategy?

4. What conditions are required for this lineup to reach the winning threshold of ${winningTargets?.toWin || 380}+?

OUTPUT YOUR THESIS AS JSON:
{
  "edges": [
    { "type": "GAME_ENVIRONMENT", "game": "LAL@SAC", "description": "235 O/U, tight spread, both teams top-10 pace", "reasoning": "Why you believe this" },
    { "type": "SALARY_VS_PRODUCTION", "player": "De'Aaron Fox", "description": "L5 avg 55 DK FPTS but salary reflects 42 FPTS", "reasoning": "Why you believe this" },
    { "type": "CORRELATION", "game": "BOS@MIA", "description": "High total, competitive spread — stack opportunity", "reasoning": "Why you believe this" }
  ],
  "thesis": "Your 2-3 sentence thesis explaining how these edges combine into a winning lineup",
  "targetGames": ["LAL@SAC", "BOS@MIA"],
  "injuryReport": ${JSON.stringify(injuryReport || [])},
  "winCondition": "What conditions must hold for this lineup to reach the winning threshold",
  "keyAssumptions": ["LAL-SAC stays close and high-scoring", "Fox continues L5 form"],
  "risks": ["If LAL blows out SAC, starters rest"]
}
`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORMAT HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function formatInjuryReport(injuryReport) {
  if (!injuryReport || injuryReport.length === 0) {
    return 'No injuries reported on this slate';
  }

  return injuryReport.map(report => {
    const outNames = (report.outPlayers || []).map(p =>
      `${p.player} (${p.duration || '?'}, ${p.gamesMissed ?? '?'} games missed)`
    ).join(', ');
    const gtdNames = (report.gtdPlayers || []).join(', ');
    let line = `- ${report.team}: OUT: ${outNames || 'none'}`;
    if (gtdNames) line += ` | GTD: ${gtdNames}`;
    return line;
  }).join('\n');
}

function formatGameProfiles(gameProfiles) {
  if (!gameProfiles || gameProfiles.length === 0) {
    return 'No game profile data available';
  }

  return gameProfiles.map(gp =>
    `- ${gp.game}: O/U ${gp.overUnder || '?'}, Pace: ${gp.pace || 'medium'}`
  ).join('\n');
}

function formatGameEnvironments(gameEnvironments) {
  if (!gameEnvironments || gameEnvironments.length === 0) {
    return 'Game environment data not available';
  }

  return gameEnvironments.map(ge => {
    const implied = ge.impliedTotal
      ? `Implied: ${ge.homeTeam} ${ge.impliedTotal.home?.toFixed?.(1) || '?'} / ${ge.awayTeam} ${ge.impliedTotal.away?.toFixed?.(1) || '?'}`
      : '';
    const paceStr = [];
    if (ge.homePace != null) paceStr.push(`${ge.homeTeam} Pace: ${ge.homePace}`);
    if (ge.awayPace != null) paceStr.push(`${ge.awayTeam} Pace: ${ge.awayPace}`);
    if (ge.gamePace) paceStr.push(`Game Pace: ${ge.gamePace}`);
    const paceDisplay = paceStr.length > 0 ? paceStr.join(' | ') : '';
    const flags = [];
    if (ge.homeB2B) flags.push(`${ge.homeTeam} B2B`);
    if (ge.awayB2B) flags.push(`${ge.awayTeam} B2B`);
    const flagStr = flags.length > 0 ? ` | ${flags.join(', ')}` : '';
    return `- ${ge.awayTeam}@${ge.homeTeam}: Spread ${ge.spread || 0}, O/U ${ge.overUnder || '?'}
     ${implied} | ${paceDisplay}${flagStr}`;
  }).join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// PARSE THESIS RESPONSE
// ═══════════════════════════════════════════════════════════════════════════════

function parseThesisResponse(text) {
  // NO FALLBACKS: Gary Pro MUST produce a valid thesis or we fail
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('[Thesis Builder] Gary Pro did not produce JSON thesis. Raw response: ' + text.slice(0, 500));
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    throw new Error('[Thesis Builder] Gary Pro produced invalid JSON: ' + e.message + '. Raw: ' + jsonMatch[0].slice(0, 500));
  }

  if (!parsed.edges || !Array.isArray(parsed.edges) || parsed.edges.length === 0) {
    throw new Error('[Thesis Builder] Gary Pro thesis missing edges array. Response: ' + JSON.stringify(parsed).slice(0, 500));
  }

  if (!parsed.thesis || parsed.thesis.length < 20) {
    throw new Error('[Thesis Builder] Gary Pro thesis too short or missing. Must provide real strategy reasoning.');
  }

  return {
    edges: parsed.edges,
    thesis: parsed.thesis,
    targetGames: parsed.targetGames || [],
    injuryReport: parsed.injuryReport || [],
    winCondition: parsed.winCondition || '',
    keyAssumptions: parsed.keyAssumptions || [],
    risks: parsed.risks || [],
    rawResponse: text
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default {
  formBuildThesis
};
