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

import { WINNING_SCORE_TARGETS } from '../FIBLE.js';

// ═══════════════════════════════════════════════════════════════════════════════
// THESIS BUILDER SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

const THESIS_BUILDER_PROMPT = `
You are Gary - an elite DFS player with deep sharp knowledge.
You've just completed your slate investigation. Now form your BUILD THESIS.

## WHAT IS A BUILD THESIS?

A BUILD THESIS is your STRATEGY for attacking this specific slate.
It's NOT "pick the highest projected players" - that's what everyone does.

Your thesis answers:
1. What's the ANGLE I'm exploiting that others will miss?
2. Which GAMES have the best environment for fantasy scoring?
3. What USAGE SITUATIONS create underpriced opportunity?
4. How does this lineup WIN the tournament, not just cash?

## BUILD ARCHETYPES TO CONSIDER

STARS AND PUNTS
- 2-3 premium anchors ($8K+) with established ceilings
- Fill the rest with value plays who have real paths to production
- Works when: Clear usage vacuums exist, high-ceiling stars available
- Risk: If a punt busts (no minutes), whole lineup fails

BALANCED
- Spread salary across proven mid-tier ($5.5K-$7.5K)
- No true punts, no true stars
- Works when: Slate is unpredictable, no clear edges
- Risk: Ceiling is capped, unlikely to win large GPPs

GAME STACK
- Heavy concentration in one high-total game (5-6 players)
- Bet on the shootout happening
- Works when: Game has 235+ O/U, both teams play fast, spread is tight
- Risk: If the game is a dud, entire lineup fails

CONTRARIAN
- Target low-owned situations with real upside
- Fade the chalk that's overpriced
- Works when: Ownership is concentrated on obvious plays
- Risk: Being different for the sake of it (no real edge)

USAGE VACUUM
- Build around players absorbing unexpected opportunity
- Fresh injuries create underpriced situations
- Works when: Key player ruled OUT recently, price hasn't adjusted
- Risk: News gets out, ownership spikes before lock

## YOUR TASK

Based on the slate investigation, form your thesis:

1. Which ARCHETYPE fits this slate and why?
2. Which GAMES are you targeting and what makes them special?
3. What USAGE SITUATIONS are you exploiting?
4. What OWNERSHIP LEVERAGE do you have?
5. What needs to go RIGHT for this thesis to WIN?

Be specific. Have conviction. This is YOUR thesis.
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

  console.log(`[Thesis Builder] ✓ Archetype: ${thesis.archetype}`);
  console.log(`[Thesis Builder] ✓ Target Games: ${thesis.targetGames?.join(', ')}`);

  return thesis;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUILD THESIS REQUEST
// ═══════════════════════════════════════════════════════════════════════════════

function buildThesisRequest(slateAnalysis, context) {
  const { usageVacuums, priceLags, stackTargets, gameEnvironments, rawAnalysis } = slateAnalysis;
  const { winningTargets, platform, contestType, players } = context;

  // Calculate slate characteristics
  const avgSalary = players?.reduce((sum, p) => sum + (p.salary || 0), 0) / (players?.length || 1);
  const highOwnershipPlayers = players?.filter(p => (p.ownership || 0) > 25) || [];

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

### OWNERSHIP CONCENTRATION
High-owned players (>25%): ${highOwnershipPlayers.map(p => `${p.name} (${p.ownership}%)`).join(', ') || 'None identified'}

### RAW INVESTIGATION NOTES
${rawAnalysis?.slice(0, 2000) || 'No additional notes'}

---

## NOW FORM YOUR BUILD THESIS

Based on this investigation:

1. What BUILD ARCHETYPE will you use?
   (Stars+Punts, Balanced, Game Stack, Contrarian, Usage Vacuum)

2. Which GAMES are you targeting and why?

3. What USAGE SITUATIONS are you exploiting?

4. What's your OWNERSHIP LEVERAGE strategy?

5. CEILING SCENARIO: How does this lineup score ${winningTargets?.toWin || 380}+ and WIN?

OUTPUT YOUR THESIS AS JSON:
{
  "archetype": "stars_and_punts | balanced | game_stack | contrarian | usage_vacuum",
  "thesis": "Your 2-3 sentence thesis explaining your strategy",
  "targetGames": ["LAL@SAC", "BOS@MIA"],
  "usageSituations": [
    { "player": "Austin Reaves", "situation": "LeBron OUT creates usage vacuum" }
  ],
  "ownershipStrategy": "Fading overpriced chalk on X, leveraging underowned Y",
  "winCondition": "How this lineup scores 380+ and wins",
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

  return gameEnvironments.map(ge =>
    `- ${ge.awayTeam}@${ge.homeTeam}: Spread ${ge.spread || 0}, O/U ${ge.overUnder || 220}
     Pace Up: ${ge.paceUp ? 'Yes' : 'No'} | Blowout Risk: ${ge.blowoutRisk ? 'Yes' : 'No'}`
  ).join('\n');
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

  if (!parsed.archetype) {
    throw new Error('[Thesis Builder] Gary Pro thesis missing archetype. Response: ' + JSON.stringify(parsed).slice(0, 500));
  }

  if (!parsed.thesis || parsed.thesis.length < 20) {
    throw new Error('[Thesis Builder] Gary Pro thesis too short or missing. Must provide real strategy reasoning.');
  }

  return {
    archetype: parsed.archetype,
    thesis: parsed.thesis,
    targetGames: parsed.targetGames || [],
    usageSituations: parsed.usageSituations || [],
    ownershipStrategy: parsed.ownershipStrategy || '',
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
