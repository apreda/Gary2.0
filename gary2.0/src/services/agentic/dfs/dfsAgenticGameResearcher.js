/**
 * DFS Per-Game Deep Researcher
 *
 * Phase 2 of the Agentic DFS system.
 * Receives per-game scouting reports from Phase 1.5 and runs a dedicated
 * Flash research session for EVERY game on the slate.
 *
 * Every game gets equal research depth — Gary decides which games
 * matter for his lineup. We don't pre-filter or rank games.
 *
 * Modeled after the game picks Flash research assistant (flashAdvisor.js)
 * but with DFS-specific investigation factors: salary-value gaps,
 * stacking correlation, usage redistribution, ceiling scenarios.
 *
 * Each game gets its own Flash session with tool calling, coverage
 * checking, and a narrative briefing. All games run in parallel.
 */

import { DFS_ALL_TOOLS, executeToolCall } from './tools/dfsToolDefinitions.js';
import { GEMINI_FLASH_MODEL } from '../modelConfig.js';
import { getDFSGameInvestigationPrompt } from './dfsInvestigationPrompts.js';
import { getDFSGameResearchFactors, buildDFSGameCoverageGapList } from './dfsInvestigationFactors.js';

// ═══════════════════════════════════════════════════════════════════════════════
// PER-GAME RESEARCH SESSION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build the system prompt for per-game DFS research.
 */
function buildGameResearchPrompt(sport) {
  const investigationMethodology = getDFSGameInvestigationPrompt(sport);

  return `<role>
You are Gary's DFS Game Research Assistant.
Your job is to deeply investigate ONE specific game and surface FACTUAL findings for Gary's DFS lineup construction.
Focus on what makes specific players in this game valuable, risky, or mispriced for DFS purposes.
</role>

<training_data_warning>
Your training data is from 2024 and is 18+ months out of date. Players may have been traded, retired, or changed teams since then.
USE ONLY the data returned by your function calls. If your memory conflicts with the data, USE THE DATA.
Do NOT treat roster changes, trades, or team assignments as "new" or "surprising" — if a player is on a team in the data, that IS their current team. The salary already reflects it.
</training_data_warning>

${investigationMethodology}

<investigation_process>
1. Work through EVERY factor in the research checklist above for this game
2. For each factor: call the relevant tools, then report findings with specific numbers
3. Name specific players when reporting findings — this is per-game research, not slate-level
4. Connect findings across factors — a RECENT injury + usage shift + salary mispricing is one connected finding
5. Cover every factor category — do NOT skip any
</investigation_process>

<constraints>
- DO NOT make lineup decisions — just gather and organize the data
- DO NOT rank players or suggest who to roster
- DO NOT label players as "must-play" or "locks" — report the facts and let Gary decide
- DO NOT compute "fair value" or "edge" amounts — report what you found
- DO focus on DFS-relevant data: production, salary, usage, matchup, ceiling, minutes
</constraints>`;
}

/**
 * Build the user message for a per-game research session.
 * Uses the pre-built flashText from the scouting report.
 */
function buildGameResearchRequest(scoutReport) {
  return `${scoutReport.flashText}

## YOUR TASK
Work through EVERY factor in your research checklist for this game.
Call tools to investigate each factor. Report findings with specific numbers and player names.
After completing all factors, write your narrative briefing with bullet points per factor.

Begin your investigation now.`;
}

/**
 * Run a single Flash research session for one game.
 *
 * @param {GoogleGenerativeAI} genAI - Gemini client
 * @param {Object} scoutReport - Per-game scouting report from dfsScoutReportBuilder
 * @param {Object} context - Full DFS context
 * @param {Object} options - { modelName }
 * @returns {{ game: string, homeTeam: string, awayTeam: string, briefing: string, calledTools: Array }}
 */
async function researchSingleGame(genAI, scoutReport, context, options = {}) {
  const { modelName = GEMINI_FLASH_MODEL } = options;
  const sport = (context.sport || 'NBA').toUpperCase();
  const gameLabel = `${scoutReport.awayTeam} @ ${scoutReport.homeTeam}`;

  console.log(`[Game Research] Starting research: ${gameLabel}`);

  const systemPrompt = buildGameResearchPrompt(sport);
  const userMessage = buildGameResearchRequest(scoutReport);

  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: systemPrompt,
    tools: [{ functionDeclarations: DFS_ALL_TOOLS }],
    generationConfig: {
      temperature: 1.0,
      maxOutputTokens: 65536
    },
    thinkingConfig: {
      thinkingBudget: -1 // HIGH thinking
    }
  });

  const chat = model.startChat({ history: [] });
  let response = await chat.sendMessage(userMessage);
  let iterations = 0;
  const maxIterations = 15;
  const calledTools = [];
  let coverageRetryDone = false;

  // Tool calling loop
  while (iterations < maxIterations) {
    iterations++;

    const candidate = response.response.candidates?.[0];
    if (!candidate) break;

    const content = candidate.content;
    const functionCalls = content?.parts?.filter(p => p.functionCall) || [];

    if (functionCalls.length === 0) {
      // No more function calls — Flash produced text
      let finalText = '';
      try { finalText = response.response.text(); } catch (_) { /* no text yet */ }

      if (finalText && finalText.trim() && !coverageRetryDone) {
        const coverageResult = getDFSGameResearchFactors(calledTools, sport, context);

        if (coverageResult.totalFactors > 0 && coverageResult.coverage < 0.8) {
          coverageRetryDone = true;
          const gapList = buildDFSGameCoverageGapList(coverageResult.missing, sport);
          console.log(`[Game Research] ${gameLabel}: Coverage at ${(coverageResult.coverage * 100).toFixed(0)}% (${coverageResult.covered.length}/${coverageResult.totalFactors} factors) — need 80%, sending retry pass`);

          response = await chat.sendMessage(
            `## COVERAGE GAPS — ADDITIONAL RESEARCH NEEDED

You missed the following factor categories for this game. Please investigate these NOW using the tools:

${gapList}

After investigating the gaps, rewrite your COMPLETE narrative briefing including ALL findings (both your original findings and these new ones).`
          );
          continue;
        }

        console.log(`[Game Research] ${gameLabel}: Coverage: ${(coverageResult.coverage * 100).toFixed(0)}% (${coverageResult.covered.length}/${coverageResult.totalFactors} factors)`);
      }

      break;
    }

    console.log(`[Game Research] ${gameLabel} iteration ${iterations}: ${functionCalls.length} tool calls`);

    // Execute each function call
    const functionResponses = [];
    for (const part of functionCalls) {
      const { name, args } = part.functionCall;
      const result = await executeToolCall(name, args, context);
      calledTools.push({ tool: name, args, iteration: iterations });

      functionResponses.push({
        functionResponse: {
          name,
          response: result
        }
      });
    }

    response = await chat.sendMessage(functionResponses);
  }

  // Extract the final briefing text
  let briefing = '';
  try { briefing = response.response.text(); } catch (_) { /* empty */ }

  // If Flash ended without producing text, nudge it
  if (!briefing || !briefing.trim()) {
    console.log(`[Game Research] ${gameLabel}: Flash ended without text — nudging for briefing...`);
    response = await chat.sendMessage(
      `Your investigation is complete. Write your narrative briefing now. For each factor you investigated, write a concise bullet point with the factor name, key finding with specific numbers, and any important context. Do NOT call any more functions.`
    );
    try { briefing = response.response.text(); } catch (_) { /* empty */ }
  }

  if (!briefing || !briefing.trim()) {
    throw new Error(`[Game Research] ${gameLabel}: Flash produced no briefing after ${iterations} iterations`);
  }

  console.log(`[Game Research] ${gameLabel}: Complete — ${iterations} iterations, ${calledTools.length} tool calls, ${briefing.length} chars`);

  return {
    game: gameLabel,
    homeTeam: scoutReport.homeTeam,
    awayTeam: scoutReport.awayTeam,
    briefing,
    calledTools
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Run deep Flash research on every game on the slate.
 *
 * Every game gets equal research depth — Gary decides which games matter
 * for his lineup. All sessions run in parallel via Promise.all.
 *
 * @param {GoogleGenerativeAI} genAI - Gemini client
 * @param {Array} scoutReports - Per-game scouting reports from dfsScoutReportBuilder
 * @param {Object} context - Full DFS context (players, games, injuries)
 * @param {Object} options - { modelName }
 * @returns {Array<{ game: string, homeTeam: string, awayTeam: string, briefing: string, calledTools: Array }>}
 */
export async function researchAllGames(genAI, scoutReports, context, options = {}) {
  if (!scoutReports || scoutReports.length === 0) {
    console.warn('[Game Research] No scouting reports — skipping Phase 2');
    return [];
  }

  console.log(`[Game Research] Launching ${scoutReports.length} parallel research sessions...`);
  for (const r of scoutReports) {
    console.log(`[Game Research]   → ${r.game}`);
  }

  // Run all game research sessions in parallel
  const results = await Promise.all(
    scoutReports.map(report => researchSingleGame(genAI, report, context, options))
  );

  return results;
}
