/**
 * DFS Lineup Audit
 *
 * Phase 6 of the Agentic DFS system.
 * Gary Pro reviews his own lineup before submission.
 *
 * This is Gary's SELF-CHECK:
 * - Does this lineup actually achieve the build thesis?
 * - Is the ceiling realistic or am I being optimistic?
 * - Am I missing an obvious edge?
 * - What's my conviction level?
 *
 * Gary can make adjustments here if he sees issues.
 *
 * FOLLOWS CLAUDE.md: Gary investigates, Gary decides, Gary audits.
 */

import { WINNING_SCORE_TARGETS } from '../FIBLE.js';

// ═══════════════════════════════════════════════════════════════════════════════
// AUDIT SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

const LINEUP_AUDIT_PROMPT = `
You are Gary - reviewing your own DFS lineup before it's locked.

CRITICAL: Your response MUST be ONLY valid JSON. No markdown, no explanation text.
Start your response with { and end with }. Nothing else.

## YOUR ROLE
You just built a lineup. Now AUDIT it with fresh eyes.

## AUDIT CHECKLIST

1. THESIS ALIGNMENT
   - Does this lineup actually execute my build thesis?
   - Are my target games properly represented?
   - Did I follow through on usage situations I identified?

2. CEILING CHECK
   - Is the ceiling projection realistic?
   - What specifically needs to happen for 380+ points?
   - Is there enough boom potential, or is this a "safe" build?

3. CORRELATION CHECK
   - Do I have proper game stacks?
   - Are correlated players actually in correlated situations?
   - Did I accidentally spread too thin?

4. OWNERSHIP LEVERAGE
   - Am I differentiated enough to win if chalk busts?
   - Am I too contrarian (punting edge for uniqueness)?
   - What happens if the chalk hits?

5. VALUE CHECK
   - Did I leave money on the table unnecessarily?
   - Are my punts actual edges or just cheap prices?
   - Did I overpay for any "name brand" players?

6. RISK ASSESSMENT
   - What's the biggest risk to this lineup?
   - Is there a single point of failure?
   - What's my floor scenario?

## CONVICTION LEVELS
After audit, rate your conviction:
- HIGH: "I believe this lineup wins. The thesis is sound, the players are right."
- MEDIUM: "This lineup competes. Some uncertainty but the approach is correct."
- LOW: "I have concerns. Either thesis or execution feels off."

## ADJUSTMENTS
If you see issues, you can make 1-2 swaps. But be specific:
- WHO you're swapping out and WHY
- WHO you're swapping in and WHY
- How this improves the lineup

## OUTPUT FORMAT
{
  "auditNotes": {
    "thesisAlignment": "How well does this execute the thesis?",
    "ceilingCheck": "Is the ceiling realistic?",
    "correlationCheck": "Are stacks properly built?",
    "ownershipLeverage": "Am I differentiated correctly?",
    "valueCheck": "Did I allocate salary well?",
    "riskAssessment": "What could go wrong?"
  },
  "conviction": "HIGH | MEDIUM | LOW",
  "convictionReasoning": "Why this conviction level",
  "adjustments": [
    {
      "out": "Player Name",
      "in": "Player Name",
      "reason": "Why this swap improves the lineup"
    }
  ],
  "finalCeilingScenario": "Updated ceiling scenario after audit",
  "garyFinalThoughts": "Your final thoughts on this lineup"
}

REMEMBER: Output ONLY the JSON object above. No other text, no markdown, no code blocks.
Your entire response must be valid JSON starting with { and ending with }.
`;

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN AUDIT FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Gary Pro audits his own lineup
 *
 * @param {GoogleGenerativeAI} genAI - Gemini client
 * @param {Object} lineup - Gary's lineup from Phase 5
 * @param {Object} buildThesis - Gary's build thesis from Phase 3
 * @param {Object} context - DFS context
 * @param {Object} options - Model options
 * @returns {Object} - Audited lineup (possibly with adjustments)
 */
export async function auditLineupWithPro(genAI, lineup, buildThesis, context, options = {}) {
  const { modelName = 'gemini-3-pro-preview' } = options;
  const { players, winningTargets, platform } = context;

  console.log('[Lineup Audit] Gary Pro auditing lineup...');

  // Build audit request
  const auditRequest = buildAuditRequest(lineup, buildThesis, context);

  // Create Pro model for audit
  // Note: Not using responseMimeType: 'application/json' as it can cause empty responses
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: LINEUP_AUDIT_PROMPT,
    generationConfig: {
      temperature: 1.0, // Gemini: Keep at 1.0
      maxOutputTokens: 4096
    }
  });

  let responseText = '';
  try {
    const result = await model.generateContent(auditRequest);
    responseText = result.response.text() || '';
    if (!responseText) {
      console.warn('[Lineup Audit] Gemini Pro returned empty text response');
    }
  } catch (apiError) {
    console.warn('[Lineup Audit] API call failed:', apiError.message);
    console.warn('[Lineup Audit] API error stack:', apiError.stack?.slice(0, 500));
    // Use default audit on API failure
    responseText = '';
  }

  // Parse audit results (will use defaults if empty)
  const auditResult = parseAuditResult(responseText);

  // Apply any adjustments Gary made
  const finalLineup = applyAdjustments(lineup, auditResult.adjustments, players);

  // Merge audit data into lineup
  const auditedLineup = {
    ...finalLineup,
    conviction: auditResult.conviction || 'MEDIUM',
    auditNotes: auditResult.auditNotes || {},
    convictionReasoning: auditResult.convictionReasoning || '',
    adjustments: auditResult.adjustments || [],
    ceilingScenario: auditResult.finalCeilingScenario || finalLineup.ceilingScenario,
    garyNotes: auditResult.garyFinalThoughts || finalLineup.garyNotes,
    perPlayerReasoning: buildPerPlayerReasoning(finalLineup.players)
  };

  console.log(`[Lineup Audit] ✓ Conviction: ${auditedLineup.conviction}`);
  if (auditResult.adjustments?.length > 0) {
    console.log(`[Lineup Audit] ✓ Made ${auditResult.adjustments.length} adjustments`);
  }

  return auditedLineup;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUILD AUDIT REQUEST
// ═══════════════════════════════════════════════════════════════════════════════

function buildAuditRequest(lineup, buildThesis, context) {
  const { winningTargets, players } = context;

  // Format current lineup
  const lineupStr = formatLineupForAudit(lineup);

  // Get available alternates by position
  const alternatesStr = formatAlternatesByPosition(lineup, players);

  return `
## YOUR BUILD THESIS
Archetype: ${buildThesis.archetype}
Thesis: ${buildThesis.thesis}
Target Games: ${buildThesis.targetGames?.join(', ') || 'Balanced'}
Win Condition: ${buildThesis.winCondition || 'Outscore the field'}

## WINNING TARGETS
- To WIN: ${winningTargets.toWin} pts
- Top 1%: ${winningTargets.top1Percent} pts
- Cash Line: ${winningTargets.toCash} pts

## YOUR LINEUP (to audit)
${lineupStr}

Total Salary: $${lineup.totalSalary?.toLocaleString()}
Projected: ${lineup.projectedPoints} pts
Ceiling: ${lineup.ceilingProjection} pts
Floor: ${lineup.floorProjection} pts

Ceiling Scenario: ${lineup.ceilingScenario || 'Not specified'}

## AVAILABLE ALTERNATES (if you want to swap)
${alternatesStr}

## YOUR TASK
1. Audit each checkpoint (thesis, ceiling, correlation, ownership, value, risk)
2. Rate your conviction (HIGH/MEDIUM/LOW)
3. Make 0-2 swaps if you see clear improvements
4. Provide final thoughts

Output your audit as JSON.
`;
}

function formatLineupForAudit(lineup) {
  if (!lineup.players || lineup.players.length === 0) {
    return 'No players in lineup - something went wrong in Phase 5';
  }

  return lineup.players.map((p, i) => {
    const reasoning = p.reasoning || 'No reasoning provided';
    return `${i + 1}. ${p.position}: ${p.name} ($${p.salary}) - ${p.team}
   Projected: ${p.projectedPoints || '?'} pts | Ceiling: ${p.ceilingProjection || '?'} pts
   Reasoning: ${reasoning.slice(0, 100)}...`;
  }).join('\n\n');
}

function formatAlternatesByPosition(lineup, players) {
  const lineupNames = new Set(lineup.players?.map(p => p.name?.toLowerCase()) || []);
  const alternates = {};

  // Group remaining players by position
  for (const player of players) {
    if (lineupNames.has(player.name?.toLowerCase())) continue;

    const pos = player.positions?.[0] || player.position || 'UTIL';
    if (!alternates[pos]) alternates[pos] = [];

    alternates[pos].push({
      name: player.name,
      salary: player.salary,
      team: player.team,
      projected: player.projected_pts || 0
    });
  }

  // Format top 3 alternates per position
  const lines = [];
  for (const [pos, alts] of Object.entries(alternates)) {
    const topAlts = alts
      .sort((a, b) => b.projected - a.projected)
      .slice(0, 3);

    if (topAlts.length > 0) {
      lines.push(`${pos}: ${topAlts.map(a => `${a.name} ($${a.salary})`).join(', ')}`);
    }
  }

  return lines.join('\n') || 'No alternates available';
}

// ═══════════════════════════════════════════════════════════════════════════════
// PARSE AUDIT RESULT
// ═══════════════════════════════════════════════════════════════════════════════

function parseAuditResult(text) {
  // Try to extract JSON from response - handle various formats
  let jsonStr = null;

  // Try 1: Direct JSON object
  let jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonStr = jsonMatch[0];
  }

  // Try 2: JSON in code block
  if (!jsonStr) {
    const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1];
    }
  }

  if (!jsonStr) {
    // If no JSON found, create a minimal valid audit with MEDIUM conviction
    // This allows the lineup to proceed with a warning
    console.warn('[Lineup Audit] Could not extract JSON from response. Using default audit.');
    console.warn('[Lineup Audit] Raw response: ' + text.slice(0, 300));
    return {
      auditNotes: { note: 'Auto-generated audit - model did not produce valid JSON' },
      conviction: 'MEDIUM',
      convictionReasoning: 'Audit could not be parsed - defaulting to MEDIUM conviction',
      adjustments: [],
      finalCeilingScenario: '',
      garyFinalThoughts: text.slice(0, 500)
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    // Try to fix common JSON issues
    try {
      // Remove trailing commas, fix quotes
      const fixedJson = jsonStr
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
        .replace(/'/g, '"');
      parsed = JSON.parse(fixedJson);
    } catch (e2) {
      console.warn('[Lineup Audit] JSON parse failed, using default audit');
      return {
        auditNotes: { note: 'JSON parse error - using default' },
        conviction: 'MEDIUM',
        convictionReasoning: 'Could not parse audit JSON',
        adjustments: [],
        finalCeilingScenario: '',
        garyFinalThoughts: text.slice(0, 500)
      };
    }
  }

  // Extract conviction - be flexible with format
  let conviction = 'MEDIUM';
  if (parsed.conviction) {
    const convUpper = String(parsed.conviction).toUpperCase();
    if (convUpper.includes('HIGH')) conviction = 'HIGH';
    else if (convUpper.includes('LOW')) conviction = 'LOW';
    else conviction = 'MEDIUM';
  }

  return {
    auditNotes: parsed.auditNotes || parsed.audit_notes || {},
    conviction,
    convictionReasoning: parsed.convictionReasoning || parsed.conviction_reasoning || '',
    adjustments: parsed.adjustments || [],
    finalCeilingScenario: parsed.finalCeilingScenario || parsed.ceiling_scenario || '',
    garyFinalThoughts: parsed.garyFinalThoughts || parsed.gary_notes || parsed.notes || ''
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// APPLY ADJUSTMENTS
// ═══════════════════════════════════════════════════════════════════════════════

function applyAdjustments(lineup, adjustments, players) {
  if (!adjustments || adjustments.length === 0) {
    return lineup;
  }

  const updatedPlayers = [...(lineup.players || [])];

  for (const adj of adjustments) {
    const { out: outName, in: inName, reason } = adj;

    // Find player to remove
    const outIndex = updatedPlayers.findIndex(p =>
      p.name?.toLowerCase() === outName?.toLowerCase()
    );

    if (outIndex === -1) {
      console.warn(`[Lineup Audit] Could not find player to swap out: ${outName}`);
      continue;
    }

    // Find player to add
    const inPlayer = players.find(p =>
      p.name?.toLowerCase() === inName?.toLowerCase()
    );

    if (!inPlayer) {
      console.warn(`[Lineup Audit] Could not find player to swap in: ${inName}`);
      continue;
    }

    // Make the swap
    const outPlayer = updatedPlayers[outIndex];
    updatedPlayers[outIndex] = {
      position: outPlayer.position,
      name: inPlayer.name,
      team: inPlayer.team,
      salary: inPlayer.salary,
      projectedPoints: inPlayer.projected_pts,
      ceilingProjection: (inPlayer.projected_pts || 0) * 1.3,
      reasoning: reason || `Swapped in during audit (was ${outName})`
    };

    console.log(`[Lineup Audit] Swapped ${outName} → ${inName}`);
  }

  // Recalculate totals
  const totalSalary = updatedPlayers.reduce((sum, p) => sum + (p.salary || 0), 0);
  const projectedPoints = updatedPlayers.reduce((sum, p) => sum + (p.projectedPoints || 0), 0);

  return {
    ...lineup,
    players: updatedPlayers,
    totalSalary,
    projectedPoints,
    ceilingProjection: projectedPoints * 1.25,
    floorProjection: projectedPoints * 0.75
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUILD PER-PLAYER REASONING
// ═══════════════════════════════════════════════════════════════════════════════

function buildPerPlayerReasoning(players) {
  if (!players || players.length === 0) return {};

  const reasoning = {};
  for (const player of players) {
    reasoning[player.name] = {
      position: player.position,
      salary: player.salary,
      reasoning: player.reasoning || 'Selected by Gary',
      ceilingPath: player.ceilingProjection ?
        `Ceiling of ${player.ceilingProjection} pts with strong game script` :
        'Standard production expected'
    };
  }

  return reasoning;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default {
  auditLineupWithPro
};
