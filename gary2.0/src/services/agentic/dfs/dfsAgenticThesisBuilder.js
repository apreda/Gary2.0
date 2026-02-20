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
A BUILD THESIS identifies the TOP EDGES on this specific slate.
Real sharps don't pick a "strategy template" first and then search for players that fit.
They find edges first, and the lineup shape emerges from assembling those edges.

Your thesis answers:
1. What are the TOP 3-5 EDGES on this slate?
2. Which GAMES have the best scoring environment?
3. Where is the MARKET WRONG about a player's value?
4. How do these edges combine into a lineup that can WIN?
</what_is_a_thesis>

<edge_types>
USAGE_VACUUM — A key player is OUT, usage redistributes. Price hasn't adjusted.
PRICE_LAG — Player's role/production has changed but salary reflects the old situation.
GAME_ENVIRONMENT — High O/U + tight spread + fast pace = scoring environment for all players.
MATCHUP_MISMATCH — Opponent defense is weak at a specific position where a player operates.
FORM_DIVERGENCE — Player's L5 production diverges significantly from season average.
CORRELATION_OPPORTUNITY — A specific game's environment supports stacking multiple players.
</edge_types>

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

  console.log(`[Thesis Builder] ✓ Edges: ${thesis.edges?.map(e => e.type).join(', ')}`);
  console.log(`[Thesis Builder] ✓ Target Games: ${thesis.targetGames?.join(', ')}`);

  return thesis;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUILD THESIS REQUEST
// ═══════════════════════════════════════════════════════════════════════════════

function buildThesisRequest(slateAnalysis, context) {
  const { usageVacuums, priceLags, stackTargets, gameEnvironments, rawAnalysis } = slateAnalysis;
  const { winningTargets, platform, contestType, players } = context;

  return `
## SLATE INVESTIGATION COMPLETE

### WINNING TARGETS (from FIBLE)
- To WIN this GPP: ${winningTargets?.toWin || 380} pts
- Top 1%: ${winningTargets?.top1Percent || 355} pts
- Cash Line: ${winningTargets?.toCash || 285} pts
- Slate Size: ${winningTargets?.gameCount || 8} games

### USAGE VACUUMS IDENTIFIED
${formatUsageVacuums(usageVacuums)}

### PRICE LAG OPPORTUNITIES
${formatPriceLags(priceLags)}

### STACK TARGETS (Best Games for Correlation)
${formatStackTargets(stackTargets)}

### GAME ENVIRONMENTS
${formatGameEnvironments(gameEnvironments)}

### RAW INVESTIGATION NOTES
${rawAnalysis?.slice(0, 5000) || 'No additional notes'}

---

## NOW FORM YOUR BUILD THESIS

Based on this investigation:

1. What are the TOP 3-5 EDGES on this slate? (usage vacuums, price lags, game environments, matchup mismatches, form divergence, correlation plays)

2. Which GAMES are you targeting and why?

3. How do these edges combine into a winning strategy?

4. CEILING SCENARIO: How does this lineup score ${winningTargets?.toWin || 380}+ and WIN?

OUTPUT YOUR THESIS AS JSON:
{
  "edges": [
    { "type": "USAGE_VACUUM", "player": "Austin Reaves", "description": "LeBron OUT, Reaves absorbs usage at underpriced salary", "confidence": "HIGH" },
    { "type": "GAME_ENVIRONMENT", "game": "LAL@SAC", "description": "235 O/U, tight spread, both teams top-10 pace", "confidence": "HIGH" },
    { "type": "PRICE_LAG", "player": "De'Aaron Fox", "description": "L5 avg 55 DK FPTS but salary reflects 42 FPTS", "confidence": "MEDIUM" }
  ],
  "thesis": "Your 2-3 sentence thesis explaining how these edges combine into a winning lineup",
  "targetGames": ["LAL@SAC", "BOS@MIA"],
  "usageSituations": [
    { "player": "Austin Reaves", "situation": "LeBron OUT creates usage vacuum" }
  ],
  "winCondition": "How this lineup scores ${winningTargets?.toWin || 380}+ and wins",
  "keyAssumptions": ["LAL-SAC stays close and high-scoring", "Reaves usage boost materializes"],
  "risks": ["If LAL blows out SAC, starters rest"]
}
`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORMAT HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function formatUsageVacuums(usageVacuums) {
  if (!usageVacuums || usageVacuums.length === 0) {
    return 'None identified - no major injuries creating opportunity';
  }

  return usageVacuums.map(uv =>
    `- ${uv.outPlayer} OUT (${uv.team}) - ${uv.outPlayerUsage || '?'}% usage to redistribute
     Beneficiaries: ${uv.beneficiaries?.map(b => b.name || b).join(', ') || 'Unknown'}
     Fresh: ${uv.injuryFreshness || 'Unknown'} | Price Adjusted: ${uv.priceAdjusted ? 'Yes' : 'No'}`
  ).join('\n');
}

function formatPriceLags(priceLags) {
  if (!priceLags || priceLags.length === 0) {
    return 'None identified - prices seem fair across the slate';
  }

  return priceLags.map(pl =>
    `- ${pl.player} ($${pl.salary}) - ${pl.situation}
     Fair Value: $${pl.fairValue || '?'} | Edge: $${pl.edge || '?'}`
  ).join('\n');
}

function formatStackTargets(stackTargets) {
  if (!stackTargets || stackTargets.length === 0) {
    return 'No obvious stack targets - consider balanced exposure';
  }

  return stackTargets.map(st =>
    `- ${st.game}: O/U ${st.overUnder || '?'}, Pace: ${st.pace || 'medium'}
     Why: ${st.reason || 'High total'}`
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
    const pace = ge.gamePace ? `Pace: ${ge.gamePace}` : (ge.paceUp ? 'Pace Up' : '');
    const flags = [];
    if (ge.blowoutRisk) flags.push('BLOWOUT RISK');
    if (ge.homeB2B) flags.push(`${ge.homeTeam} B2B`);
    if (ge.awayB2B) flags.push(`${ge.awayTeam} B2B`);
    const flagStr = flags.length > 0 ? ` ⚠️ ${flags.join(', ')}` : '';
    return `- ${ge.awayTeam}@${ge.homeTeam}: Spread ${ge.spread || 0}, O/U ${ge.overUnder || '?'}
     ${implied} | ${pace}${flagStr}`;
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
    usageSituations: parsed.usageSituations || [],
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
