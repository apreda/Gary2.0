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

// ═══════════════════════════════════════════════════════════════════════════════
// AUDIT SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

const LINEUP_AUDIT_PROMPT = `
<role>
You are Gary - reviewing your own DFS lineup before it's locked.
You just built a lineup. Now AUDIT it with fresh eyes.
</role>

<audit_checklist>
1. THESIS ALIGNMENT
   - Does this lineup actually execute my build thesis?
   - Are my target games properly represented?
   - Did I follow through on usage situations I identified?

2. CEILING CHECK
   - Is the ceiling projection realistic?
   - What specifically needs to happen for 380+ points?
   - What is the realistic outcome distribution for this lineup? What does the data show about its ceiling and floor?

3. CORRELATION CHECK
   - Do I have proper game stacks?
   - Are correlated players actually in correlated situations?
   - Did I accidentally spread too thin?

4. VALUE CHECK
   - Did I leave money on the table unnecessarily?
   - What is the upside thesis for each of my low-salary plays? Does the data support it?
   - For each high-salary player, does tonight's situation justify the salary investment?

5. RISK ASSESSMENT
   - What's the biggest risk to this lineup?
   - Is there a single point of failure?
   - What's my floor scenario?
</audit_checklist>

<adjustments>
If you see issues, you can make 1-2 swaps. Be specific:
- WHO you're swapping out and WHY
- WHO you're swapping in and WHY
- How this improves the lineup
</adjustments>

<output_format>
{
  "auditNotes": {
    "thesisAlignment": "How well does this execute the thesis?",
    "ceilingCheck": "Is the ceiling realistic?",
    "correlationCheck": "Are stacks properly built?",
    "valueCheck": "Did I allocate salary well?",
    "riskAssessment": "What could go wrong?"
  },
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
</output_format>

<constraints>
- DO NOT output any text before or after the JSON object
- DO NOT use markdown code blocks
- Your entire response must be valid JSON starting with { and ending with }
</constraints>
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
      maxOutputTokens: 8192
    },
    thinkingConfig: {
      thinkingBudget: 8192
    }
  });

  const result = await model.generateContent(auditRequest);
  const responseText = result.response.text() || '';
  if (!responseText) {
    throw new Error('[Lineup Audit] Gemini Pro returned empty response — audit failed');
  }

  // Parse audit results — NO fallbacks
  const auditResult = parseAuditResult(responseText);

  // Apply any adjustments Gary made (pass platform for correct salary cap)
  const finalLineup = applyAdjustments(lineup, auditResult.adjustments, players, platform);

  // Merge audit data into lineup
  const auditedLineup = {
    ...finalLineup,
    auditNotes: auditResult.auditNotes || {},
    adjustments: auditResult.adjustments || [],
    ceilingScenario: auditResult.finalCeilingScenario || finalLineup.ceilingScenario,
    garyNotes: auditResult.garyFinalThoughts || finalLineup.garyNotes,
    perPlayerReasoning: buildPerPlayerReasoning(finalLineup.players)
  };

  console.log(`[Lineup Audit] ✓ Audit complete`);
  const successfulSwaps = finalLineup._successfulSwaps || 0;
  if (auditResult.adjustments?.length > 0) {
    console.log(`[Lineup Audit] ✓ Made ${successfulSwaps}/${auditResult.adjustments.length} adjustments`);
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
1. Audit each checkpoint (thesis, ceiling, correlation, value, risk)
2. Make 0-2 swaps if you see clear improvements
3. Provide final thoughts

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
      projected: player.projected_pts || player.benchmarkProjection || player.ppg || 0,
      dkFpts: player.seasonStats?.dkFpts || player.l5Stats?.dkFptsAvg || null,
      l5Ppg: player.l5Stats?.ppg || 0,
      seasonPpg: player.ppg || player.seasonStats?.ppg || 0
    });
  }

  // Select top 5 alternates per position using multiple signals (not just projection)
  const lines = [];
  for (const [pos, alts] of Object.entries(alternates)) {
    // Score each alternate by: projection + value ratio + recent form boost
    const scored = alts.map(a => {
      const proj = a.projected || 0;
      const valueRatio = a.salary > 0 ? (proj / (a.salary / 1000)) : 0;
      const formBoost = a.l5Ppg > a.seasonPpg * 1.15 ? 5 : 0;
      return { ...a, _score: proj + valueRatio * 2 + formBoost };
    });
    const topAlts = scored
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);

    if (topAlts.length > 0) {
      lines.push(`${pos}: ${topAlts.map(a => {
        const fpts = a.dkFpts ? ` | ${a.dkFpts.toFixed(1)} DK FPTS` : '';
        return `${a.name} ($${a.salary}${fpts})`;
      }).join(', ')}`);
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
    throw new Error('[Lineup Audit] Could not extract JSON from response. Raw: ' + text.slice(0, 300));
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
      throw new Error('[Lineup Audit] JSON parse failed: ' + e2.message + '. Raw: ' + jsonStr.slice(0, 300));
    }
  }

  return {
    auditNotes: parsed.auditNotes || parsed.audit_notes || {},
    adjustments: parsed.adjustments || [],
    finalCeilingScenario: parsed.finalCeilingScenario || parsed.ceiling_scenario || '',
    garyFinalThoughts: parsed.garyFinalThoughts || parsed.gary_notes || parsed.notes || ''
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// APPLY ADJUSTMENTS
// ═══════════════════════════════════════════════════════════════════════════════

function applyAdjustments(lineup, adjustments, players, contextPlatform) {
  if (!adjustments || adjustments.length === 0) {
    return { ...lineup, _successfulSwaps: 0 };
  }

  const updatedPlayers = [...(lineup.players || [])];
  const platform = contextPlatform || lineup.platform || 'draftkings';
  const salaryCap = platform.toLowerCase() === 'fanduel' ? 60000 : 50000;
  let successfulSwaps = 0;

  for (const adj of adjustments) {
    const { out: outName, in: inName, reason } = adj;

    // Find player to remove
    const outIndex = updatedPlayers.findIndex(p =>
      p.name?.toLowerCase() === outName?.toLowerCase()
    );

    if (outIndex === -1) {
      console.warn(`[Lineup Audit] Could not find player to swap out: ${outName} — not in lineup`);
      continue;
    }

    // Find player to add from the actual player pool
    const inPlayer = players.find(p =>
      p.name?.toLowerCase() === inName?.toLowerCase()
    );

    if (!inPlayer) {
      console.warn(`[Lineup Audit] Could not find player to swap in: ${inName} — not in player pool`);
      continue;
    }

    const outPlayer = updatedPlayers[outIndex];
    const slot = outPlayer.position;

    // Validate position eligibility for the slot
    const inPositions = inPlayer.positions || [inPlayer.position];
    if (!isSlotEligible(slot, inPositions)) {
      console.warn(`[Lineup Audit] ${inPlayer.name} not eligible for ${slot} (has ${inPositions.join('/')}) — skipping swap`);
      continue;
    }

    // Validate salary cap — check if swap would put us over
    const salaryDiff = (inPlayer.salary || 0) - (outPlayer.salary || 0);
    const currentTotal = updatedPlayers.reduce((sum, p) => sum + (p.salary || 0), 0);
    if (currentTotal + salaryDiff > salaryCap) {
      console.warn(`[Lineup Audit] Swap ${outName} → ${inName} would exceed salary cap ($${currentTotal + salaryDiff} > $${salaryCap}) — skipping`);
      continue;
    }

    // Make the swap
    updatedPlayers[outIndex] = {
      position: slot,
      positions: inPositions,
      name: inPlayer.name,
      team: inPlayer.team,
      salary: inPlayer.salary,
      projectedPoints: inPlayer.projected_pts,
      ceilingProjection: inPlayer.ceilingProjection || outPlayer.ceilingProjection,
      reasoning: reason || `Swapped in during audit (was ${outName})`
    };

    successfulSwaps++;
    console.log(`[Lineup Audit] Swapped ${outName} → ${inName}`);
  }

  // Recalculate totals from actual player data
  const totalSalary = updatedPlayers.reduce((sum, p) => sum + (p.salary || 0), 0);
  const projectedPoints = updatedPlayers.reduce((sum, p) => sum + (p.projectedPoints || 0), 0);
  // Use sum of per-player ceilings instead of flat multiplier
  const ceilingProjection = updatedPlayers.reduce((sum, p) => sum + (p.ceilingProjection || p.projectedPoints || 0), 0);

  return {
    ...lineup,
    players: updatedPlayers,
    totalSalary,
    projectedPoints,
    ceilingProjection,
    floorProjection: lineup.floorProjection,
    _successfulSwaps: successfulSwaps
  };
}

// Position eligibility check (same logic as lineup decider)
function isSlotEligible(slot, playerPositions) {
  if (!slot || !playerPositions || playerPositions.length === 0) return true;
  const s = slot.toUpperCase();
  const poss = playerPositions.map(p => p.toUpperCase());
  if (s === 'UTIL') return true;
  if (s === 'G') return poss.some(p => p === 'PG' || p === 'SG');
  if (s === 'F') return poss.some(p => p === 'SF' || p === 'PF');
  return poss.includes(s);
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
      ceilingProjection: player.ceilingProjection || null
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
