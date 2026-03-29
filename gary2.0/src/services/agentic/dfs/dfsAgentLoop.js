/**
 * DFS Agent Loop — Gary's Tool-Calling Decision Loop
 *
 * Phase 3 of the new Agentic DFS system.
 * Gary investigates the slate with tools, reviews competing theses from
 * an independent advisor, and submits his lineup via SUBMIT_LINEUP.
 *
 * Mirrors the game picks agent loop: multi-pass with tool calling,
 * stall detection, advisor injection, and structured output via tool call.
 *
 * Uses Gemini native tool format (genAI.getGenerativeModel().startChat())
 * — same pattern as all existing DFS files.
 */

import { DFS_AGENT_LOOP_TOOLS, executeToolCall } from './tools/dfsToolDefinitions.js';
import { getDFSConstitution } from './constitution/dfsAgenticConstitution.js';
import { buildDFSAdvisorTheses } from './dfsAgenticAdvisor.js';
import { buildDfsPass1Message, buildDfsPass25Message, buildDfsSubmitNudge } from './dfsPassBuilders.js';
import { isSlotEligible } from './dfsPositionUtils.js';
import { getSalaryCap, getRosterSlots } from './dfsSportConfig.js';
import { GEMINI_PRO_MODEL, GEMINI_PRO_FALLBACK, GEMINI_FLASH_MODEL, rotateToBackupKey, isUsingBackupKey, getGeminiClient } from '../modelConfig.js';
const DFS_MODEL = GEMINI_FLASH_MODEL; // Switched from Pro to Flash for cost savings (Pro output: $12/1M, Flash: $3/1M)

// ─── Shared name normalizer ───────────────────────────────────────────────────
// Strips periods from initials, apostrophes — "P.J. Washington" → "pj washington",
// "D'Angelo Russell" → "dangelo russell". Used in enrichment, validation, and Q/GTD checks.
// Exported so the orchestrator can reuse it for pivot deduplication.
export function normalizeDFSName(n) {
  return (n || '').toLowerCase()
    .replace(/\b([a-z])\.([a-z])\./gi, '$1$2')  // P.J. → PJ
    .replace(/\./g, '')                            // remaining periods
    .replace(/['\u2018\u2019\u02BC]/g, '')         // apostrophes: D'Angelo → DAngelo
    .replace(/\s+/g, ' ')
    .trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

function buildAgentLoopSystemPrompt(platform, sport) {
  const salaryCap = getSalaryCap(platform, sport);
  const rosterSlots = getRosterSlots(platform, sport);
  const platformName = (platform || 'draftkings').toLowerCase() === 'fanduel' ? 'FanDuel' : 'DraftKings';
  const sportName = (sport || 'NBA').toUpperCase();

  return `<role>
You are Gary - an elite DFS player building GPP tournament lineups to WIN FIRST PLACE.
You have access to scouting reports, research findings, and investigation tools.
Your job is to investigate the slate, form your thesis, and build the winning lineup.
</role>

<training_data_warning>
TODAY'S DATE: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
Your training data is from 2024 and is 18+ months out of date. Players may have been traded, retired, or changed teams since then.
USE ONLY the investigation data and tool results provided. If your memory conflicts with the data, USE THE DATA.
Do NOT treat roster changes, trades, or team assignments as "new," "surprising," or "gifts" — if a player is on a team in the data, that IS their current team. The salary was set knowing this.
</training_data_warning>

<fact_checking>
1. ONLY select players from the player pool in the scouting reports. If a player is not listed, they do NOT exist for this lineup.
2. Do NOT invent salaries, projections, or stats from memory — use ONLY the numbers from scouting reports and tool results.
3. Do NOT cite coaching tendencies, player reputations, or team identities from training knowledge — ONLY cite facts from the data.
4. If a claim cannot be traced to the data provided, do not make it.
</fact_checking>

<salary_cap_rules>
- ${platformName} ${sportName}: $${salaryCap.toLocaleString()} cap, ${rosterSlots.length} players (${rosterSlots.join(', ')})
- You MUST fill every roster slot
- You MUST stay under the salary cap
- $1 over cap = invalid lineup
</salary_cap_rules>

<stat_window_flags>
Your research assistant may include "Stat Window Flags" on findings where L5 data may not reflect tonight's conditions — for example, a key teammate was absent during L5 but returns tonight, or the L5 opponents were unusually strong or weak. These flags are context for your evaluation. Investigate and decide for yourself whether the L5 data or an alternative baseline is more appropriate for each player.
</stat_window_flags>

${getDFSConstitution(sport)}

<process>
1. INVESTIGATE: Read the scouting reports and research findings. Use tools to dig deeper on anything that matters for your decisions.
2. DECIDE: Form your own view of what each player will produce tonight. Build the best lineup you can within the cap.
3. SUBMIT: When ready, call SUBMIT_LINEUP with your final lineup.
</process>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Run Gary's DFS agent loop.
 *
 * @param {Object} params
 * @param {GoogleGenerativeAI} params.genAI - Gemini client
 * @param {Array} params.scoutReports - Per-game scouting reports
 * @param {Array} params.flashResearch - Per-game Flash research findings
 * @param {Object} params.context - DFS context
 * @param {Object} [params.options] - Model options
 * @returns {{ lineup: Object, toolCallHistory: Array, investigationText: string, generationTime: string }}
 */
export async function runDfsAgentLoop({ genAI, scoutReports, flashResearch, context, _costTracker, options = {} }) {
  const { modelName = DFS_MODEL } = options;
  const { platform, sport } = context;
  const salaryCap = getSalaryCap(platform, sport);
  const rosterSlots = getRosterSlots(platform, sport);
  const startTime = Date.now();

  console.log('[DFS Agent Loop] Starting Gary\'s investigation loop...');

  // Create model with tools
  const systemPrompt = buildAgentLoopSystemPrompt(platform, sport);
  let model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: systemPrompt,
    tools: [{ functionDeclarations: DFS_AGENT_LOOP_TOOLS }],
    generationConfig: {
      temperature: 1.0,
      maxOutputTokens: 65536
    },
    thinkingConfig: {
      thinkingBudget: 16384 // Capped — lineup building needs good thinking but not unlimited
    }
  });

  let chat = model.startChat({ history: [] });
  let activeModelName = modelName;

  // Helper: rebuild model + chat on a new model/key (loses history — only for fresh start)
  function rebuildModel(newModelName) {
    activeModelName = newModelName;
    model = genAI.getGenerativeModel({
      model: newModelName,
      systemInstruction: systemPrompt,
      tools: [{ functionDeclarations: DFS_AGENT_LOOP_TOOLS }],
      generationConfig: { temperature: 1.0, maxOutputTokens: 65536 },
      thinkingConfig: { thinkingBudget: 16384 }
    });
    chat = model.startChat({ history: [] });
  }

  // Helper: send message with 429 recovery (mid-loop — can only retry same message)
  function trackUsage(response) {
    if (!_costTracker) return;
    const meta = response?.response?.usageMetadata;
    if (meta) {
      _costTracker.addUsage(activeModelName, {
        prompt_tokens: meta.promptTokenCount || 0,
        completion_tokens: meta.candidatesTokenCount || 0
      });
    }
  }

  async function sendWithQuotaRecovery(message) {
    try {
      const result = await chat.sendMessage(message);
      trackUsage(result);
      return result;
    } catch (err) {
      if (!(err.message?.includes('429') || err.message?.includes('quota'))) throw err;

      // Try backup key first (keeps same model, preserves chat history on fresh session)
      if (!isUsingBackupKey() && rotateToBackupKey()) {
        console.warn(`[DFS Agent Loop] 429 on ${activeModelName} — rotated to backup key`);
        genAI = getGeminiClient();
        rebuildModel(activeModelName);
        const result = await chat.sendMessage(message);
        trackUsage(result);
        return result;
      }

      // Backup key exhausted or unavailable — fall back to Flash
      if (activeModelName !== GEMINI_FLASH_MODEL) {
        console.warn(`[DFS Agent Loop] 429 on ${activeModelName} (both keys exhausted) — falling back to ${GEMINI_FLASH_MODEL}`);
        genAI = getGeminiClient();
        rebuildModel(GEMINI_FLASH_MODEL);
        const result = await chat.sendMessage(message);
        trackUsage(result);
        return result;
      }

      // Already on Flash and still 429 — nothing left
      throw err;
    }
  }

  // State
  const toolCallHistory = [];
  const investigationTexts = [];
  let iterations = 0;
  const MAX_ITERATIONS = 35;
  let textOnlyCount = 0; // Consecutive text-only responses (stall detection)
  let pass25Injected = false;
  let advisorTheses = null;
  let submissionAttempts = 0;
  const MAX_SUBMISSION_ATTEMPTS = 3;

  // Send Pass 1
  const pass1Message = buildDfsPass1Message(scoutReports, flashResearch, context);
  console.log(`[DFS Agent Loop] Pass 1: Sending ${pass1Message.length} chars of scouting reports + research`);

  let response = await sendWithQuotaRecovery(pass1Message);

  // Main loop
  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const candidate = response.response.candidates?.[0];
    if (!candidate) {
      console.warn(`[DFS Agent Loop] Iteration ${iterations}: No candidate — breaking`);
      break;
    }

    const content = candidate.content;
    const functionCalls = content?.parts?.filter(p => p.functionCall) || [];

    // ─── SUBMIT_LINEUP handling ───
    const submitCall = functionCalls.find(fc => fc.functionCall.name === 'SUBMIT_LINEUP');
    if (submitCall) {
      const lineupArgs = submitCall.functionCall.args;

      // If Pass 2.5 not yet injected, spawn advisor + inject theses NOW, then let Gary revise
      if (!pass25Injected) {
        console.log(`[DFS Agent Loop] Iteration ${iterations}: SUBMIT_LINEUP before theses — spawning advisor now`);

        try {
          const advisorResult = await buildDFSAdvisorTheses(genAI, flashResearch, context, {
            modelName: GEMINI_FLASH_MODEL,
            _costTracker
          });
          if (advisorResult) {
            advisorTheses = advisorResult.theses;
            console.log(`[DFS Agent Loop] ✓ Advisor produced theses (${advisorTheses.length} chars, ${advisorResult.generationTime})`);
          }
        } catch (advisorErr) {
          console.warn(`[DFS Agent Loop] Advisor failed: ${advisorErr.message} — proceeding without theses`);
        }

        pass25Injected = true;
        const pass25Message = buildDfsPass25Message(advisorTheses, context);
        console.log(`[DFS Agent Loop] Pass 2.5: Injecting theses + submit instructions (${pass25Message.length} chars)`);

        // Check for Q/GTD players in submitted lineup to add targeted reminder
        const submittedNames = (lineupArgs.players || []).map(p => normalizeDFSName(p.name));
        const qtdInLineup = (context.players || []).filter(p =>
          p.isQuestionable && submittedNames.some(n => n === normalizeDFSName(p.name))
        ).map(p => p.name);
        const qtdReminder = qtdInLineup.length > 0
          ? ` Also: ${qtdInLineup.join(', ')} ${qtdInLineup.length === 1 ? 'is' : 'are'} Q/GTD — use SEARCH_LIVE_NEWS to confirm their play status before your final submission.`
          : ' If any players in your lineup are Questionable or GTD, verify their play status with SEARCH_LIVE_NEWS before your final submission.';

        response = await sendWithQuotaRecovery([{
          functionResponse: {
            name: 'SUBMIT_LINEUP',
            response: { status: 'held', message: `Your lineup draft is noted. Before finalizing, review the competing theses below and evaluate whether any adjustments improve your build.${qtdReminder}` }
          }
        }]);
        // Follow up with Pass 2.5 content
        response = await sendWithQuotaRecovery(pass25Message);
        textOnlyCount = 0;
        continue;
      }

      submissionAttempts++;
      console.log(`[DFS Agent Loop] Iteration ${iterations}: SUBMIT_LINEUP attempt ${submissionAttempts}/${MAX_SUBMISSION_ATTEMPTS}`);

      // Validate and enrich
      try {
        const lineup = enrichAndValidateLineup(lineupArgs, context.players, salaryCap, rosterSlots, sport);
        const issues = getStructuralIssues(lineup, context.players, salaryCap, rosterSlots, sport);

        if (issues.length === 0) {
          // Valid lineup — done!
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`[DFS Agent Loop] ✓ Valid lineup submitted after ${iterations} iterations, ${toolCallHistory.length} tool calls, ${elapsed}s`);

          // ⚠️ INTERNAL FLAG: Warn if Gary picked low-projection players (suggests missing info)
          // This is NOT shown to Gary — it's for our monitoring to catch potential data gaps
          for (const lp of (lineup.players || [])) {
            const poolPlayer = context.players.find(p => p.name?.toLowerCase() === lp.name?.toLowerCase());
            const benchProj = poolPlayer?.benchmarkProjection || 0;
            if (benchProj > 0 && benchProj < 10) {
              console.warn(`[DFS Agent Loop] ⚠️ LOW PROJECTION FLAG: ${lp.name} ($${lp.salary}) has benchmark projection of ${benchProj.toFixed(1)} — Gary may be missing context about this player's expected role`);
            }
          }

          return {
            lineup,
            toolCallHistory,
            investigationText: investigationTexts.join('\n\n'),
            generationTime: `${elapsed}s`
          };
        }

        // Issues found
        console.log(`[DFS Agent Loop] Submission issues: ${issues.join('; ')}`);

        if (submissionAttempts >= MAX_SUBMISSION_ATTEMPTS) {
          // Too many failed submissions — break with best effort
          console.warn(`[DFS Agent Loop] ${MAX_SUBMISSION_ATTEMPTS} failed submissions — returning best effort lineup`);
          lineup.validationIssues = issues;
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          return {
            lineup,
            toolCallHistory,
            investigationText: investigationTexts.join('\n\n'),
            generationTime: `${elapsed}s`
          };
        }

        // Send correction
        const nudge = buildDfsSubmitNudge(issues, context);
        response = await sendWithQuotaRecovery([{
          functionResponse: {
            name: 'SUBMIT_LINEUP',
            response: { error: `Lineup has structural issues. Fix them and resubmit.\n\n${nudge}` }
          }
        }]);
        continue;

      } catch (parseError) {
        console.warn(`[DFS Agent Loop] Parse error on submission: ${parseError.message}`);

        if (submissionAttempts >= MAX_SUBMISSION_ATTEMPTS) {
          throw new Error(`[DFS Agent Loop] Failed to parse valid lineup after ${MAX_SUBMISSION_ATTEMPTS} attempts: ${parseError.message}`);
        }

        response = await sendWithQuotaRecovery([{
          functionResponse: {
            name: 'SUBMIT_LINEUP',
            response: { error: `Failed to parse your lineup: ${parseError.message}. Fix and resubmit.` }
          }
        }]);
        continue;
      }
    }

    // ─── Regular tool calls (not SUBMIT_LINEUP) ───
    const regularCalls = functionCalls.filter(fc => fc.functionCall.name !== 'SUBMIT_LINEUP');

    if (regularCalls.length > 0) {
      textOnlyCount = 0; // Reset stall counter
      console.log(`[DFS Agent Loop] Iteration ${iterations}: ${regularCalls.length} tool call(s): ${regularCalls.map(fc => fc.functionCall.name).join(', ')}`);

      const functionResponses = [];
      for (const part of regularCalls) {
        const { name, args } = part.functionCall;
        const result = await executeToolCall(name, args, context);
        toolCallHistory.push({ tool: name, args, iteration: iterations });
        functionResponses.push({
          functionResponse: { name, response: result }
        });
      }

      response = await sendWithQuotaRecovery(functionResponses);
      continue;
    }

    // ─── Text-only response ───
    let responseText = '';
    try { responseText = response.response.text(); } catch (_) { /* empty */ }

    if (responseText) {
      investigationTexts.push(responseText);
      textOnlyCount++;
    }

    // ─── Stall detection: trigger advisor + Pass 2.5 ───
    if (!pass25Injected && textOnlyCount >= 2 && iterations >= 8) {
      console.log(`[DFS Agent Loop] Investigation stall detected (${textOnlyCount} text-only, ${iterations} iterations) — spawning advisor`);

      // Spawn advisor
      try {
        const advisorResult = await buildDFSAdvisorTheses(genAI, flashResearch, context, {
          modelName: GEMINI_FLASH_MODEL
        });
        if (advisorResult) {
          advisorTheses = advisorResult.theses;
          console.log(`[DFS Agent Loop] ✓ Advisor produced theses (${advisorTheses.length} chars, ${advisorResult.generationTime})`);
        } else {
          console.log('[DFS Agent Loop] Advisor returned null — proceeding without theses');
        }
      } catch (advisorErr) {
        console.warn(`[DFS Agent Loop] Advisor failed: ${advisorErr.message} — proceeding without theses`);
      }

      // Inject Pass 2.5
      pass25Injected = true;
      const pass25Message = buildDfsPass25Message(advisorTheses, context);
      console.log(`[DFS Agent Loop] Pass 2.5: Injecting theses + submit instructions (${pass25Message.length} chars)`);
      response = await sendWithQuotaRecovery(pass25Message);
      textOnlyCount = 0;
      continue;
    }

    // ─── Auto-inject Pass 2.5 after enough iterations even without stall ───
    if (!pass25Injected && iterations >= 20) {
      console.log(`[DFS Agent Loop] Reached ${iterations} iterations — forcing advisor spawn + Pass 2.5`);

      try {
        const advisorResult = await buildDFSAdvisorTheses(genAI, flashResearch, context, {
          modelName: GEMINI_FLASH_MODEL
        });
        if (advisorResult) {
          advisorTheses = advisorResult.theses;
          console.log(`[DFS Agent Loop] ✓ Advisor produced theses (${advisorTheses.length} chars)`);
        }
      } catch (advisorErr) {
        console.warn(`[DFS Agent Loop] Advisor failed: ${advisorErr.message}`);
      }

      pass25Injected = true;
      const pass25Message = buildDfsPass25Message(advisorTheses, context);
      response = await sendWithQuotaRecovery(pass25Message);
      textOnlyCount = 0;
      continue;
    }

    // ─── If Pass 2.5 already injected but Gary is still talking, nudge toward submission ───
    if (pass25Injected && textOnlyCount >= 3) {
      console.log(`[DFS Agent Loop] Iteration ${iterations}: ${textOnlyCount} text-only after Pass 2.5 — nudging for SUBMIT_LINEUP`);
      response = await sendWithQuotaRecovery(
        'You\'ve completed your investigation and reviewed the competing theses. It\'s time to build your lineup. Call SUBMIT_LINEUP with your final lineup now.'
      );
      textOnlyCount = 0;
      continue;
    }

    // Default: continue the conversation
    if (responseText) {
      response = await sendWithQuotaRecovery('Continue your investigation. Use tools to verify your thesis before submitting.');
    } else {
      // Empty response — nudge
      response = await sendWithQuotaRecovery('Please continue investigating or call SUBMIT_LINEUP when you\'re ready.');
    }
  }

  // Max iterations reached
  throw new Error(`[DFS Agent Loop] Reached ${MAX_ITERATIONS} iterations without a valid SUBMIT_LINEUP call`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// LINEUP VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Enrich submitted lineup with real slate data.
 * Matches names to context, overwrites Gemini's hallucinated salaries/projections,
 * validates position eligibility.
 */
function enrichAndValidateLineup(lineupArgs, players, salaryCap, rosterSlots, sport) {
  if (!lineupArgs.players || lineupArgs.players.length === 0) {
    throw new Error('No players in submitted lineup');
  }

  const enrichedPlayers = [];
  const rejectedPlayers = [];

  for (const p of lineupArgs.players) {
    if (!p.name) {
      rejectedPlayers.push('(unnamed player)');
      continue;
    }

    const pNormalized = normalizeDFSName(p.name);

    // Find player by normalized name match first
    let fullPlayer = players.find(fp => normalizeDFSName(fp.name) === pNormalized);

    // Fuzzy match — require unambiguous
    if (!fullPlayer) {
      const fuzzyMatches = players.filter(fp => {
        const fpNorm = normalizeDFSName(fp.name);
        return fpNorm.includes(pNormalized) || pNormalized.includes(fpNorm);
      });
      if (fuzzyMatches.length === 1) {
        fullPlayer = fuzzyMatches[0];
      } else if (fuzzyMatches.length > 1 && p.team) {
        const teamMatch = fuzzyMatches.find(fp => fp.team === p.team);
        if (teamMatch) fullPlayer = teamMatch;
      }
    }

    if (!fullPlayer) {
      console.warn(`[DFS Agent Loop] REJECTED "${p.name}" — not found in slate player pool`);
      rejectedPlayers.push(p.name);
      continue;
    }

    // Validate slot assignment
    const realPositions = fullPlayer.positions || [fullPlayer.position];
    const assignedSlot = (p.position || '').toUpperCase();
    const isEligible = isSlotEligible(assignedSlot, realPositions, sport);

    if (!isEligible) {
      console.warn(`[DFS Agent Loop] ${p.name} assigned to ${assignedSlot} but eligible for ${realPositions.join('/')}`);
    }

    // Calculate projection from real stats: 60% L5 + 40% season DK FPTS
    // This gives a grounded per-game projection based on actual production data
    const seasonFpts = fullPlayer.seasonStats?.dkFpts || 0;
    const l5Fpts = fullPlayer.l5Stats?.dkFptsAvg || 0;
    let realProjection;
    if (l5Fpts > 0 && seasonFpts > 0) {
      realProjection = Math.round((l5Fpts * 0.6 + seasonFpts * 0.4) * 10) / 10;
    } else if (l5Fpts > 0) {
      realProjection = l5Fpts;
    } else if (seasonFpts > 0) {
      realProjection = seasonFpts;
    } else {
      realProjection = p.projectedPoints || 0;
    }

    // Per-player ceiling: best L5 game or 1.3x projection
    const bestL5 = fullPlayer.l5Stats?.bestDkFpts || realProjection * 1.3;
    const playerCeiling = Math.round(Math.max(bestL5, realProjection * 1.2) * 10) / 10;

    enrichedPlayers.push({
      ...p,
      id: fullPlayer.id,
      name: fullPlayer.name,           // Canonical pool name — prevents all downstream mismatches
      team: fullPlayer.team,
      position: isEligible ? assignedSlot : realPositions[0],
      positions: realPositions,
      projectedPoints: realProjection,
      projected_pts: realProjection,
      ceiling_projection: playerCeiling,
      ceilingProjection: playerCeiling, // Both casings so audit display and calculations work
      benchmarkProjection: fullPlayer.benchmarkProjection || null,
      salary: fullPlayer.salary,
      isQuestionable: fullPlayer.isQuestionable || false
    });
  }

  if (rejectedPlayers.length > 0) {
    console.warn(`[DFS Agent Loop] Rejected ${rejectedPlayers.length} hallucinated players: ${rejectedPlayers.join(', ')}`);
  }

  const totalSalary = enrichedPlayers.reduce((sum, p) => sum + (p.salary || 0), 0);
  const projectedPoints = enrichedPlayers.reduce((sum, p) => sum + (p.projectedPoints || 0), 0);

  return {
    players: enrichedPlayers,
    totalSalary,
    projectedPoints: projectedPoints,
    ceilingProjection: Math.round(projectedPoints * 1.2 * 10) / 10,
    floorProjection: Math.round(projectedPoints * 0.75 * 10) / 10,
    ceilingScenario: lineupArgs.ceilingScenario || '',
    garyNotes: lineupArgs.garyNotes || '',
    buildThesis: lineupArgs.buildThesis || ''
  };
}

/**
 * Detect structural issues that need correction.
 */
function getStructuralIssues(lineup, players, salaryCap, rosterSlots, sport) {
  const issues = [];

  // Wrong player count
  if (lineup.players?.length !== rosterSlots.length) {
    issues.push(`Need exactly ${rosterSlots.length} players but got ${lineup.players?.length || 0}`);
  }

  // Over salary cap
  if (lineup.totalSalary > salaryCap) {
    issues.push(`Over salary cap: $${lineup.totalSalary} > $${salaryCap}`);
  }

  // All players from same team
  const teams = new Set((lineup.players || []).map(p => p.team));
  if (teams.size === 1 && (lineup.players?.length || 0) > 2) {
    issues.push(`All ${lineup.players.length} players are from ${[...teams][0]} — must use players from at least 2 teams`);
  }

  // Players not found on slate (hallucinated) — use normalizeDFSName so "PJ Washington" matches "P.J. Washington"
  const notOnSlate = (lineup.players || []).filter(p => {
    const pNorm = normalizeDFSName(p.name);
    return !players.find(sp => {
      const spNorm = normalizeDFSName(sp.name);
      return spNorm === pNorm || spNorm.includes(pNorm) || pNorm.includes(spNorm);
    });
  });
  if (notOnSlate.length > 0) {
    issues.push(`Players not on slate: ${notOnSlate.map(p => p.name).join(', ')} — only use players from the player pool`);
  }

  // Duplicate players
  const names = (lineup.players || []).map(p => p.name?.toLowerCase());
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  if (dupes.length > 0) {
    issues.push(`Duplicate players: ${[...new Set(dupes)].join(', ')}`);
  }

  // Slot distribution validation
  if (lineup.players?.length === rosterSlots.length) {
    const requiredSlotCounts = {};
    for (const slot of rosterSlots) {
      requiredSlotCounts[slot] = (requiredSlotCounts[slot] || 0) + 1;
    }
    const assignedSlotCounts = {};
    for (const p of lineup.players) {
      const slot = (p.position || '').toUpperCase();
      assignedSlotCounts[slot] = (assignedSlotCounts[slot] || 0) + 1;
    }
    for (const [slot, required] of Object.entries(requiredSlotCounts)) {
      const assigned = assignedSlotCounts[slot] || 0;
      if (assigned !== required) {
        issues.push(`Slot ${slot}: need ${required} but got ${assigned}`);
      }
    }
  }

  return issues;
}
