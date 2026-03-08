/**
 * DFS Lineup Audit
 *
 * Phase 4 of the Agentic DFS system.
 * Gary Pro reviews his own lineup before submission.
 *
 * Receives the lineup from the agent loop (Phase 3) along with
 * Gary's tool call history and investigation text for context.
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
import { GEMINI_PRO_MODEL } from '../modelConfig.js';

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
   - Evaluate this lineup's realistic ceiling based on the data
   - Identify what specifically needs to happen for this lineup to reach the winning target
   - Consider the outcome distribution — how wide is the range?

2. CORRELATION CHECK
   - Evaluate how your players are connected and whether your game correlations tell a coherent story
   - Verify the correlated situations are supported by tonight's game environments
   - Consider whether the distribution of players across games serves your lineup's structure

3. VALUE CHECK
   - Evaluate your salary allocation against the available alternatives
   - For each low-salary player, identify the specific data supporting their upside thesis tonight
   - For each high-salary player, verify tonight's situation justifies the salary allocation

4. RISK ASSESSMENT
   - Identify the key risks to this lineup
   - Evaluate how risk is distributed — what happens if any one player busts?
   - Consider the floor scenario

5. WIN CONDITION
   - For EACH player: identify the specific boom scenario and the data supporting it
   - Identify which boom scenarios must co-occur for the winning score — consider the likelihood of simultaneous hits
   - Identify the most likely way this lineup disappoints and what the floor looks like if it happens
   - Evaluate whether this lineup tells a coherent story as a whole
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
 * @param {Object} lineup - Gary's lineup from the agent loop
 * @param {Object} context - DFS context
 * @param {Object} loopResult - Agent loop result ({ toolCallHistory, investigationText })
 * @param {Object} options - Model options
 * @returns {Object} - Audited lineup (possibly with adjustments)
 */
export async function auditLineupWithPro(genAI, lineup, context, loopResult, options = {}) {
  const { modelName = GEMINI_PRO_MODEL } = options;
  const { players, winningTargets, platform, sport } = context;

  console.log('[Lineup Audit] Gary Pro auditing lineup...');

  // Build audit request
  const auditRequest = buildAuditRequest(lineup, context, loopResult);

  // Create Pro model for audit
  // Note: Not using responseMimeType: 'application/json' as it can cause empty responses
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: LINEUP_AUDIT_PROMPT,
    generationConfig: {
      temperature: 1.0, // Gemini: Keep at 1.0
      maxOutputTokens: 65536
    },
    thinkingConfig: {
      thinkingBudget: -1 // HIGH — let Pro think as deeply as needed
    }
  });

  // Use chat session so we can send correction messages on parse failure
  const chat = model.startChat({ history: [] });

  let responseText;
  try {
    const result = await chat.sendMessage(auditRequest);
    responseText = result.response.text() || '';
  } catch (firstErr) {
    console.warn(`[Lineup Audit] First attempt failed (${firstErr.message}) — retrying once`);
    const retryResult = await chat.sendMessage(auditRequest);
    responseText = retryResult.response.text() || '';
  }
  if (!responseText) {
    throw new Error('[Lineup Audit] Gemini Pro returned empty response — audit failed');
  }

  // Parse audit results with correction loop (same pattern as Phase 4)
  const MAX_CORRECTIONS = 2;
  let correctionAttempts = 0;
  let auditResult;

  while (correctionAttempts <= MAX_CORRECTIONS) {
    try {
      auditResult = parseAuditResult(responseText);
      break; // Parsed successfully
    } catch (parseError) {
      if (correctionAttempts >= MAX_CORRECTIONS) {
        throw new Error(`[Lineup Audit] FAILED after ${MAX_CORRECTIONS} correction attempts: ${parseError.message}`);
      }
      correctionAttempts++;
      console.log(`[Lineup Audit] Parse error, correction attempt ${correctionAttempts}: ${parseError.message}`);

      const fixPrompt = `Your audit response had a JSON parsing error: ${parseError.message}

Output your audit as a single valid JSON object. Start with { and end with }.
Do NOT include any text before or after the JSON.
Do NOT use markdown code blocks.
Include all fields: auditNotes, winConditionAnalysis, adjustments, finalCeilingScenario, garyFinalThoughts.`;

      const fixResult = await chat.sendMessage(fixPrompt);
      responseText = fixResult.response.text() || '';

      if (!responseText) {
        throw new Error('[Lineup Audit] Correction returned empty response — audit failed');
      }
    }
  }

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

function buildAuditRequest(lineup, context, loopResult) {
  const { winningTargets, players, platform, sport, games, injuries } = context;

  // Format current lineup
  const lineupStr = formatLineupForAudit(lineup);

  // Get available alternates by position
  const alternatesStr = formatAlternatesByPosition(lineup, players);

  // Format game environments by O/U from context.games
  const topGames = (games || [])
    .sort((a, b) => (b.overUnder || b.total || 0) - (a.overUnder || a.total || 0))
    .map(g => {
      const home = g.homeTeam || g.home_team || '';
      const away = g.awayTeam || g.visitor_team || g.away_team || '';
      return `${away} @ ${home}: O/U ${g.overUnder || g.total || '?'} | Spread ${g.spread || '?'}`;
    })
    .join('\n');

  // Format injury highlights from context.injuries
  const injuryLines = Object.entries(injuries || {})
    .filter(([_, teamInj]) => teamInj && teamInj.length > 0)
    .map(([team, teamInj]) => {
      const outs = teamInj
        .filter(i => {
          const st = (i.status || '').toUpperCase();
          return st.includes('OUT') || st === 'OFS' || st.includes('DOUBTFUL');
        })
        .map(i => {
          const name = i.player?.first_name ? `${i.player.first_name} ${i.player.last_name}` : (i.player || i.name);
          return `${name} (${i.duration || i.status})`;
        });
      return outs.length > 0 ? `${team}: ${outs.join(', ')}` : null;
    })
    .filter(Boolean)
    .join('\n');

  // Format Gary's investigation context from the agent loop
  const investigationSummary = formatLoopInvestigationContext(loopResult);

  // Full injury context for swap decisions (OUT + GTD for all teams, tagged for lineup exposure)
  const injuryContext = formatInjuryContextForAudit(context, lineup);

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

## YOUR LINEUP (to audit)
${lineupStr}

Total Salary: $${lineup.totalSalary?.toLocaleString()}
Remaining Salary: $${(salaryCap - (lineup.totalSalary || 0)).toLocaleString()}
Salary Efficiency: $${lineup.projectedPoints ? (lineup.totalSalary / lineup.projectedPoints).toFixed(0) : '?'} per projected point
Projected: ${lineup.projectedPoints} pts
Ceiling: ${lineup.ceilingProjection} pts
Floor: ${lineup.floorProjection} pts
Ceiling Scenario: ${lineup.ceilingScenario || 'Not specified'}

## GARY'S INVESTIGATION FINDINGS
${investigationSummary}
${injuryContext ? `\n## FULL INJURY CONTEXT\n${injuryContext}\n` : ''}
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

/**
 * Format Gary's investigation context from the agent loop for the audit.
 * Shows tool calls made and investigation text produced.
 */
function formatLoopInvestigationContext(loopResult) {
  if (!loopResult) return 'No investigation data available';

  const sections = [];

  // Summarize tool calls by type
  const toolCalls = loopResult.toolCallHistory || [];
  if (toolCalls.length > 0) {
    const toolCounts = {};
    for (const call of toolCalls) {
      toolCounts[call.tool] = (toolCounts[call.tool] || 0) + 1;
    }
    const toolSummary = Object.entries(toolCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([tool, count]) => `${tool}: ${count}`)
      .join(', ');
    sections.push(`Tools used (${toolCalls.length} total): ${toolSummary}`);
  }

  // Include Gary's investigation text (his reasoning and findings)
  const investigationText = loopResult.investigationText || '';
  if (investigationText.trim()) {
    // Truncate if very long — audit doesn't need the full text
    const maxLen = 4000;
    const trimmed = investigationText.length > maxLen
      ? investigationText.slice(0, maxLen) + '\n... [truncated]'
      : investigationText;
    sections.push(trimmed);
  }

  return sections.length > 0 ? sections.join('\n\n') : 'No investigation data available';
}

/**
 * Surface full injury context for audit swap decisions.
 * Shows OUT + GTD/Questionable players for all slate teams,
 * with tags for teams Gary has exposure to in the lineup.
 */
function formatInjuryContextForAudit(context, lineup) {
  const injuries = context.injuries || {};
  if (Object.keys(injuries).length === 0) return '';

  const lineupTeams = new Set((lineup.players || []).map(p => p.team));
  const lines = [];

  for (const [team, teamInjuries] of Object.entries(injuries)) {
    if (!Array.isArray(teamInjuries) || teamInjuries.length === 0) continue;

    const tag = lineupTeams.has(team) ? ' [LINEUP TEAM]' : '';
    const playerLines = teamInjuries
      .filter(inj => {
        const status = (inj.status || '').toUpperCase();
        return status.includes('OUT') || status.includes('QUESTIONABLE') || status.includes('GTD') || status.includes('DAY-TO-DAY') || status.includes('DOUBTFUL');
      })
      .map(inj => `  ${inj.player || inj.name} — ${inj.status}${inj.duration ? ` (${inj.duration})` : ''}`)
      .join('\n');

    if (playerLines) {
      lines.push(`${team}${tag}:\n${playerLines}`);
    }
  }

  return lines.length > 0 ? lines.join('\n') : '';
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

