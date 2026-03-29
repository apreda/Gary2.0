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
import { createHash } from 'crypto';

const DEFAULT_RESEARCH_CONCURRENCY = 3;

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
</role>

<training_data_warning>
Your training data is from 2024 and is 18+ months out of date. Players may have been traded, retired, or changed teams since then.
USE ONLY the data returned by your function calls. If your memory conflicts with the data, USE THE DATA.
</training_data_warning>

${investigationMethodology}

<investigation_process>
1. Work through EVERY factor in the research checklist above for this game
2. For each factor: call the relevant tools, then report findings with specific numbers
3. Name specific players when reporting findings — this is per-game research
4. Cover every factor category — do NOT skip any
</investigation_process>

<output_format>
When you finish investigating, write your briefing as STRUCTURED PER-FACTOR FINDINGS.
For each factor you investigated, use this format:

### [FACTOR NAME]
**Key Finding:** [1-2 sentence summary of the most important discovery]
**Data:** [Specific numbers — player names, stats, percentages]
**Context:** [Why this matters for tonight — opponent quality, sample window, who was playing]
**Stat Window Flag:** [If L5 data is unreliable for any player in this factor, say why — e.g., "Player X L5 was without Player Y (out 5 games) — Y returns tonight, X's L5 FPTS inflated by ~8 pts"]

If there is no stat window concern for a factor, omit the Stat Window Flag line.
</output_format>

<constraints>
- DO NOT make lineup decisions — investigate and report the data
- DO NOT label players as "must-play" or "locks" — report the facts and let Gary decide
- If you cite an injury, include when it happened. If you cannot determine when, do not include it
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
After completing all factors, write your structured briefing with per-factor findings (Key Finding, Data, Context, and Stat Window Flag where applicable).

Pay special attention to RETURNING PLAYERS and STAT WINDOW RELIABILITY — these are the nuances that separate good research from surface-level analysis. If a teammate's L5 was inflated because a key player was out, and that player returns tonight, FLAG IT.

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
function trackDfsUsage(response, modelName, costTracker) {
  if (!costTracker) return;
  const meta = response?.response?.usageMetadata;
  if (meta) {
    costTracker.addUsage(modelName, {
      prompt_tokens: meta.promptTokenCount || 0,
      completion_tokens: meta.candidatesTokenCount || 0
    });
  }
}

async function researchSingleGame(genAI, scoutReport, context, options = {}) {
  const { modelName = GEMINI_FLASH_MODEL, _costTracker } = options;
  const sport = (context.sport || 'NBA').toUpperCase();
  const gameLabel = `${scoutReport.awayTeam} @ ${scoutReport.homeTeam}`;
  const cacheKey = buildSharedResearchCacheKey(scoutReport, context);
  const sharedResearchCache = options.sharedResearchCache;

  if (sharedResearchCache?.has(cacheKey)) {
    console.log(`[Game Research] Reusing cached research: ${gameLabel}`);
    return sharedResearchCache.get(cacheKey);
  }

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
      thinkingBudget: 8192 // Capped — per-game research is fact-finding, not deep reasoning
    }
  });

  const chat = model.startChat({ history: [] });
  let response = await chat.sendMessage(userMessage);
  trackDfsUsage(response, modelName, _costTracker);
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
          trackDfsUsage(response, modelName, _costTracker);
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
    trackDfsUsage(response, modelName, _costTracker);
  }

  // Extract the final briefing text
  let briefing = '';
  try { briefing = response.response.text(); } catch (_) { /* empty */ }

  // If Flash ended without producing text, nudge it
  if (!briefing || !briefing.trim()) {
    console.log(`[Game Research] ${gameLabel}: Flash ended without text — nudging for briefing...`);
    response = await chat.sendMessage(
      `Your investigation is complete. Write your structured briefing now. For EACH factor you investigated, use this format:

### [FACTOR NAME]
**Key Finding:** [1-2 sentence summary]
**Data:** [Specific numbers — player names, stats]
**Context:** [Why this matters for tonight]
**Stat Window Flag:** [If any L5 data is unreliable, say why — e.g., teammate was out during L5 but returns tonight]

Do NOT call any more functions.`
    );
    try { briefing = response.response.text(); } catch (_) { /* empty */ }
  }

  if (!briefing || !briefing.trim()) {
    throw new Error(`[Game Research] ${gameLabel}: Flash produced no briefing after ${iterations} iterations`);
  }

  console.log(`[Game Research] ${gameLabel}: Complete — ${iterations} iterations, ${calledTools.length} tool calls, ${briefing.length} chars`);

  const finalResult = {
    game: gameLabel,
    homeTeam: scoutReport.homeTeam,
    awayTeam: scoutReport.awayTeam,
    briefing,
    calledTools
  };

  if (sharedResearchCache) {
    sharedResearchCache.set(cacheKey, finalResult);
  }

  return finalResult;
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

  const parsedConcurrency = Number.parseInt(process.env.DFS_RESEARCH_CONCURRENCY || '', 10);
  const concurrency = Math.max(
    1,
    Number.isFinite(parsedConcurrency) ? parsedConcurrency : DEFAULT_RESEARCH_CONCURRENCY
  );

  console.log(`[Game Research] Launching ${scoutReports.length} research sessions (concurrency=${concurrency})...`);
  for (const r of scoutReports) {
    console.log(`[Game Research]   → ${r.game}`);
  }

  const results = new Array(scoutReports.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= scoutReports.length) return;
      results[currentIndex] = await researchSingleGame(genAI, scoutReports[currentIndex], context, options);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, scoutReports.length) },
    () => worker()
  );
  await Promise.all(workers);

  return results;
}

function buildSharedResearchCacheKey(scoutReport, context) {
  const sport = (context?.sport || 'NBA').toUpperCase();
  const platform = (context?.platform || '').toLowerCase();
  const gameLabel = `${scoutReport?.awayTeam || ''}@${scoutReport?.homeTeam || ''}`;
  const flashText = scoutReport?.flashText || '';
  const hash = createHash('sha1').update(flashText).digest('hex');
  return `${sport}|${platform}|${gameLabel}|${hash}`;
}
