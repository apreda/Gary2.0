/**
 * DFS Lineup Audit
 *
 * Phase 5 of the Agentic DFS system.
 * Gary Pro reviews his own lineup before submission.
 *
 * This is Gary's SELF-CHECK:
 * - Is the ceiling realistic or am I being optimistic?
 * - Am I missing an obvious edge?
 * - What's my conviction level?
 * - Does this lineup have a realistic win condition?
 *
 * Gary can make adjustments here if he sees issues.
 *
 * FOLLOWS CLAUDE.md: Gary investigates, Gary decides, Gary audits.
 */

import { isSlotEligible } from './dfsPositionUtils.js';
import { getSalaryCap } from './dfsSportConfig.js';
import { GEMINI_PRO_FALLBACK } from '../modelConfig.js';

// ═══════════════════════════════════════════════════════════════════════════════
// AUDIT SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

const LINEUP_AUDIT_PROMPT = `
<role>
You are Gary - reviewing your own DFS lineup before it's locked.
You just built a lineup. Now AUDIT it with fresh eyes.
</role>

<training_data_warning>
Your training data is from 2024 and is 18+ months out of date. Players may have been traded, retired, or changed teams since then.
USE ONLY the lineup data and alternates provided below. If your memory conflicts with the data, USE THE DATA.
Do NOT "correct" a player's team assignment — the team shown in the lineup IS their current team.
Do NOT cite coaching tendencies, player reputations, or team identities from training knowledge — ONLY cite facts from the data provided.
</training_data_warning>

<fact_checking>
1. ONLY recommend swaps using players from the AVAILABLE ALTERNATES list below. If a player is not listed, they do not exist.
2. Do NOT invent stats, projections, or team assignments from memory.
3. Every claim in your audit must trace to data provided below. No source = no claim.
</fact_checking>

<market_awareness>
If a player has been out for multiple games, the salaries already reflect their absence. A continued known absence is baseline, not edge.
If a player was traded in the off-season, the salary already reflects their current team and role. Do NOT treat roster changes as new information.
</market_awareness>

<audit_checklist>
1. CEILING CHECK
   - What does the data show about this lineup's realistic ceiling?
   - What specifically needs to happen for this lineup to reach the winning target?
   - What does the data show about the outcome distribution for this lineup?

2. CORRELATION CHECK
   - How are your players connected? What story do your game correlations tell?
   - Are the correlated situations you're relying on supported by tonight's game environments?
   - What does the distribution of your players across games reveal about your lineup's structure?

3. VALUE CHECK
   - How did you allocate your salary? What does the data show about the alternatives available?
   - For each low-salary player, what specific data supports their upside thesis tonight?
   - For each high-salary player, what does tonight's specific situation reveal about the salary allocation?

4. RISK ASSESSMENT
   - What are the key risks to this lineup?
   - How is risk distributed across this lineup? What happens if any one player busts?
   - What does the floor scenario look like?

5. WIN CONDITION — EVALUATE YOUR LINEUP
   Ask yourself these questions and answer honestly:

   - For EACH player in this lineup: What is the specific scenario where they boom tonight?
     What specific data from your investigation supports that scenario?

   - Which of those boom scenarios must co-occur for this lineup to reach the winning score?
     How likely is it that they happen simultaneously? What does history show?

   - What is the most likely way this lineup disappoints?
     If that happens, what does the rest of your lineup's floor look like?

   - What story does this lineup tell as a whole? How do the individual selections connect to a win condition?
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
    "ceilingCheck": "Is the ceiling realistic?",
    "correlationCheck": "Are stacks properly built?",
    "valueCheck": "Did I allocate salary well?",
    "riskAssessment": "What could go wrong?"
  },
  "winConditionAnalysis": {
    "boomScenarios": "For each player, what specific scenario makes them boom tonight",
    "requiredCoOccurrences": "Which scenarios must hit simultaneously for this lineup to win",
    "mostLikelyFailure": "How does this lineup most likely disappoint",
    "coherenceCheck": "Does this lineup tell a coherent story"
  },
  "adjustments": [
    {
      "out": "Player Name",
      "in": "Player Name",
      "reason": "Why this swap improves the lineup"
    }
  ],
  "finalCeilingScenario": "Updated ceiling scenario after audit",
  "garyFinalThoughts": "Write 2-3 sentences as Gary speaking directly to the user about why this lineup is built to win tonight. Be confident, conversational, and specific — mention key players by name and their role in the build. Example tone: 'I'm loading up on the DET-CLE game stack tonight. Cade is underpriced against a Cleveland defense missing Allen, and pairing him with Garland on the other side gives us double exposure to what should be a high-scoring affair.'"
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
 * @param {Object} lineup - Gary's lineup from Phase 4
 * @param {Object} slateAnalysis - Slate analysis from Phase 2 (injuries, game environments)
 * @param {Object} context - DFS context
 * @param {Object} options - Model options
 * @returns {Object} - Audited lineup (possibly with adjustments)
 */
export async function auditLineupWithPro(genAI, lineup, slateAnalysis, context, options = {}) {
  const { modelName = GEMINI_PRO_FALLBACK } = options;
  const { players, winningTargets, platform, sport } = context;

  console.log('[Lineup Audit] Gary Pro auditing lineup...');

  // Build audit request
  const auditRequest = buildAuditRequest(lineup, slateAnalysis, context);

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

  let responseText;
  try {
    const result = await model.generateContent(auditRequest);
    responseText = result.response.text() || '';
  } catch (firstErr) {
    console.warn(`[Lineup Audit] First attempt failed (${firstErr.message}) — retrying once`);
    const retryResult = await model.generateContent(auditRequest);
    responseText = retryResult.response.text() || '';
  }
  if (!responseText) {
    throw new Error('[Lineup Audit] Gemini Pro returned empty response — audit failed');
  }

  // Parse audit results — NO fallbacks
  const auditResult = parseAuditResult(responseText);

  // Apply any adjustments Gary made (pass platform for correct salary cap)
  const finalLineup = applyAdjustments(lineup, auditResult.adjustments, players, platform, sport);

  // Merge audit data into lineup
  // Only use audit's garyNotes if ALL proposed swaps were applied.
  // When swaps are partially applied, the audit's notes describe a lineup that doesn't exist.
  const proposedSwaps = auditResult.adjustments?.length || 0;
  const successfulSwaps = finalLineup._successfulSwaps || 0;
  const allSwapsApplied = proposedSwaps === 0 || successfulSwaps === proposedSwaps;

  if (!allSwapsApplied) {
    console.log(`[Lineup Audit] ⚠️ Only ${successfulSwaps}/${proposedSwaps} swaps applied — keeping Phase 4 garyNotes (audit notes describe a different lineup)`);
  }

  const auditedLineup = {
    ...finalLineup,
    auditNotes: auditResult.auditNotes || {},
    winConditionAnalysis: auditResult.winConditionAnalysis || {},
    adjustments: auditResult.adjustments || [],
    ceilingScenario: allSwapsApplied ? (auditResult.finalCeilingScenario || finalLineup.ceilingScenario) : finalLineup.ceilingScenario,
    garyNotes: allSwapsApplied ? (auditResult.garyFinalThoughts || finalLineup.garyNotes) : finalLineup.garyNotes,
    perPlayerReasoning: buildPerPlayerReasoning(finalLineup.players)
  };

  console.log(`[Lineup Audit] ✓ Audit complete`);
  if (proposedSwaps > 0) {
    console.log(`[Lineup Audit] ✓ Made ${successfulSwaps}/${proposedSwaps} adjustments`);
  }

  return auditedLineup;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUILD AUDIT REQUEST
// ═══════════════════════════════════════════════════════════════════════════════

function buildAuditRequest(lineup, slateAnalysis, context) {
  const { winningTargets, players, platform, playerInvestigations, sport } = context;

  // Format current lineup
  const lineupStr = formatLineupForAudit(lineup);

  // Get available alternates by position
  const alternatesStr = formatAlternatesByPosition(lineup, players);

  // Format top game environments by O/U from slate analysis
  const topGames = (slateAnalysis.gameEnvironments || [])
    .sort((a, b) => (b.overUnder || 0) - (a.overUnder || 0))
    .map(g => `${g.awayTeam} @ ${g.homeTeam}: O/U ${g.overUnder || '?'} | Spread ${g.spread || '?'}`)
    .join('\n');

  // Format injury context from slate analysis
  const injuryLines = (slateAnalysis.injuryReport || []).map(report => {
    const outNames = (report.outPlayers || []).map(p => `${p.player} (${p.duration || '?'})`).join(', ');
    return outNames ? `${report.team}: ${outNames}` : null;
  }).filter(Boolean).join('\n');

  // Format investigation summaries for key alternates (D1: gives audit phase data-backed swap context)
  const investigationSummary = formatInvestigationSummaryForAudit(playerInvestigations, lineup);

  const salaryCap = getSalaryCap(platform, sport);

  return `
## SLATE CONTEXT
Injury Report:
${injuryLines || 'No injury data'}

Key Game Environments:
${topGames || 'No game environment data'}

## WINNING TARGETS
- To WIN: ${winningTargets.toWin} pts
- Top 1%: ${winningTargets.top1Percent} pts
- Cash Line: ${winningTargets.toCash} pts

## YOUR LINEUP (to audit)
${lineupStr}

Total Salary: $${lineup.totalSalary?.toLocaleString()}
Remaining Salary: $${(salaryCap - (lineup.totalSalary || 0)).toLocaleString()}
Salary Efficiency: $${lineup.projectedPoints ? (lineup.totalSalary / lineup.projectedPoints).toFixed(0) : '?'} per projected point
Projected: ${lineup.projectedPoints} pts
Ceiling: ${lineup.ceilingProjection} pts
Floor: ${lineup.floorProjection} pts
${formatOwnershipSummary(lineup)}
Ceiling Scenario: ${lineup.ceilingScenario || 'Not specified'}

## INVESTIGATION FINDINGS (from Phase 3)
${investigationSummary}

## AVAILABLE ALTERNATES (if you want to swap)
${alternatesStr}

## YOUR TASK
1. Audit each checkpoint (ceiling, correlation, value, risk)
2. Use the investigation findings above to evaluate whether any alternates are stronger fits
3. Make 0-2 swaps if you see clear improvements backed by investigation data
4. Provide final thoughts

Output your audit as JSON.
`;
}

function formatInvestigationSummaryForAudit(investigations, lineup) {
  if (!investigations || Object.keys(investigations).length === 0) {
    return 'No investigation data available';
  }

  const lineupNames = new Set((lineup.players || []).map(p => p.name?.toLowerCase()));
  const lines = [];

  for (const [position, players] of Object.entries(investigations)) {
    const summaries = (players || [])
      .filter(p => !lineupNames.has(p.player?.toLowerCase())) // Only non-lineup players (alternates)
      .slice(0, 3) // Top 3 alternates per position
      .map(p => {
        const findings = p.investigation?.keyFindings || p.investigation?.recentForm || 'No findings';
        return `  ${p.player} ($${p.salary || '?'}, ${p.team}): ${typeof findings === 'string' ? findings.slice(0, 120) : 'Investigated'}`;
      });

    if (summaries.length > 0) {
      lines.push(`${position}:\n${summaries.join('\n')}`);
    }
  }

  return lines.length > 0 ? lines.join('\n\n') : 'No alternate investigation data available';
}

function formatLineupForAudit(lineup) {
  if (!lineup.players || lineup.players.length === 0) {
    return 'No players in lineup - something went wrong in Phase 4';
  }

  return lineup.players.map((p, i) => {
    const reasoning = p.reasoning || 'No reasoning provided';
    const ptsPerDollar = p.projectedPoints > 0 ? `$${(p.salary / p.projectedPoints).toFixed(0)}/pt` : '?/pt';
    return `${i + 1}. ${p.position}: ${p.name} ($${p.salary}) - ${p.team} [${ptsPerDollar}]
   Projected: ${p.projectedPoints || '?'} pts | Ceiling: ${p.ceilingProjection || '?'} pts
   Reasoning: ${reasoning.slice(0, 100)}...`;
  }).join('\n\n');
}

function formatOwnershipSummary(lineup) {
  const ownerships = (lineup.players || [])
    .map(p => p.projectedOwnership)
    .filter(o => o != null && o > 0);
  if (ownerships.length === 0) return '';
  const total = ownerships.reduce((sum, o) => sum + o, 0);
  const avg = (total / ownerships.length).toFixed(1);
  const high = ownerships.filter(o => o >= 20).length;
  const low = ownerships.filter(o => o < 5).length;
  return `Aggregate Ownership: ${total.toFixed(1)}% total | ${avg}% avg | ${high} players 20%+ | ${low} players under 5%\n`;
}

function formatAlternatesByPosition(lineup, players) {
  const lineupNames = new Set(lineup.players?.map(p => p.name?.toLowerCase()) || []);
  const lineupTeams = new Set(lineup.players?.map(p => p.team) || []);
  const alternates = {};

  // Group remaining players by ALL eligible positions (not just first)
  for (const player of players) {
    if (lineupNames.has(player.name?.toLowerCase())) continue;

    const positions = player.positions || [player.position || 'UTIL'];
    const altData = {
      name: player.name,
      salary: player.salary,
      team: player.team,
      projected: player.projected_pts || player.benchmarkProjection || player.ppg || 0,
      dkFpts: player.seasonStats?.dkFpts || player.l5Stats?.dkFptsAvg || null,
      l5Ppg: player.l5Stats?.ppg || 0,
      seasonPpg: player.ppg || player.seasonStats?.ppg || 0,
      // Game context: mark players from teams already in lineup (bring-back candidates)
      inLineupGame: lineupTeams.has(player.team)
    };

    for (const pos of positions) {
      if (!alternates[pos]) alternates[pos] = [];
      alternates[pos].push(altData);
    }
  }

  // Select top 7 alternates per position — show game context
  const lines = [];
  for (const [pos, alts] of Object.entries(alternates)) {
    // De-duplicate by name (player listed under multiple positions)
    const seen = new Set();
    const uniqueAlts = alts.filter(a => {
      if (seen.has(a.name)) return false;
      seen.add(a.name);
      return true;
    });

    const scored = uniqueAlts.map(a => {
      const proj = a.projected || 0;
      const valueRatio = a.salary > 0 ? (proj / (a.salary / 1000)) : 0;
      const formBoost = a.l5Ppg > a.seasonPpg * 1.15 ? 5 : 0;
      const gameBoost = a.inLineupGame ? 3 : 0; // Surface bring-back candidates
      return { ...a, _score: proj + valueRatio * 2 + formBoost + gameBoost };
    });
    const topAlts = scored
      .sort((a, b) => b._score - a._score)
      .slice(0, 7);

    if (topAlts.length > 0) {
      lines.push(`${pos}: ${topAlts.map(a => {
        const fpts = a.dkFpts ? ` | ${a.dkFpts.toFixed(1)} DK FPTS` : '';
        const gameTag = a.inLineupGame ? ' [same game]' : '';
        return `${a.name} ($${a.salary}, ${a.team}${fpts}${gameTag})`;
      }).join(', ')}`);
    }
  }

  return lines.join('\n') || 'No alternates available';
}

// ═══════════════════════════════════════════════════════════════════════════════
// PARSE AUDIT RESULT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract first top-level JSON object using bracket-depth tracking.
 */
function extractJsonObject(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function parseAuditResult(text) {
  // Extract JSON using bracket-depth tracking (safe for mixed text + JSON)
  let jsonStr = extractJsonObject(text);

  if (!jsonStr) {
    throw new Error('[Lineup Audit] Could not extract JSON from response. Raw: ' + text.slice(0, 300));
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    // Try to fix common JSON issues — trailing commas only (NOT apostrophe replacement)
    try {
      const fixedJson = jsonStr
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']');
      parsed = JSON.parse(fixedJson);
    } catch (e2) {
      throw new Error('[Lineup Audit] JSON parse failed: ' + e2.message + '. Raw: ' + jsonStr.slice(0, 300));
    }
  }

  // Log win condition self-assessment if Gary flagged concerns
  const winCondition = parsed.winConditionAnalysis || parsed.win_condition_analysis || {};
  if (winCondition.mostLikelyFailure) {
    console.log(`[Lineup Audit] Win condition — most likely failure: ${winCondition.mostLikelyFailure.slice(0, 150)}`);
  }

  return {
    auditNotes: parsed.auditNotes || parsed.audit_notes || {},
    winConditionAnalysis: winCondition,
    adjustments: parsed.adjustments || [],
    finalCeilingScenario: parsed.finalCeilingScenario || parsed.ceiling_scenario || '',
    garyFinalThoughts: parsed.garyFinalThoughts || parsed.gary_notes || parsed.notes || ''
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// APPLY ADJUSTMENTS
// ═══════════════════════════════════════════════════════════════════════════════

function applyAdjustments(lineup, adjustments, players, contextPlatform, sport) {
  if (!adjustments || adjustments.length === 0) {
    return { ...lineup, _successfulSwaps: 0 };
  }

  const updatedPlayers = [...(lineup.players || [])];
  const platform = contextPlatform || lineup.platform || 'draftkings';
  const salaryCap = getSalaryCap(platform, sport);
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

    // Duplicate check — don't swap in a player already in the lineup
    if (updatedPlayers.some(p => p.name?.toLowerCase() === inPlayer.name?.toLowerCase())) {
      console.warn(`[Lineup Audit] ${inPlayer.name} already in lineup — skipping swap`);
      continue;
    }

    const outPlayer = updatedPlayers[outIndex];
    const slot = outPlayer.position;

    // Validate position eligibility for the slot
    const inPositions = inPlayer.positions || [inPlayer.position];
    if (!isSlotEligible(slot, inPositions, sport)) {
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

    // Make the swap — propagate id so downstream phases can look up the player
    updatedPlayers[outIndex] = {
      id: inPlayer.id,
      position: slot,
      positions: inPositions,
      name: inPlayer.name,
      team: inPlayer.team,
      salary: inPlayer.salary,
      projectedPoints: inPlayer.benchmarkProjection || inPlayer.seasonStats?.dkFpts || inPlayer.l5Stats?.dkFptsAvg || 0,
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

// isSlotEligible imported from dfsPositionUtils.js

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
