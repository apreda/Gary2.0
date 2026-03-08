import { CONFIG, GEMINI_PRO_MODEL, GEMINI_PRO_FALLBACK, validateGeminiModel } from './orchestratorConfig.js';
import { rotateToBackupKey, isUsingBackupKey, resetToPrimaryKey } from '../modelConfig.js';
import { createGeminiSession, sendToSession, sendToSessionWithRetry } from './sessionManager.js';
import { extractTextualSummaryForModelSwitch, buildFlashResearchBriefing } from './flashAdvisor.js';
import { buildPass1Message, buildPass25Message, buildPass25PropsMessage, buildPass3Unified, buildPass3Props, FINALIZE_PROPS_TOOL, PROPS_PICK_SCHEMA } from './passBuilders.js';
import { parseGaryResponse, parsePropsResponse, normalizePickFormat, determineCurrentPass } from './responseParser.js';
import { isInvestigationSufficient, summarizeStatForContext, formatNum, formatPct, summarizePlayerGameLogs, summarizePlayerStats, summarizeNbaPlayerAdvancedStats, pruneContextIfNeeded, normalizeSportToLeague, MAX_CONTEXT_MESSAGES, PRUNE_AFTER_ITERATION } from './orchestratorHelpers.js';
import { fetchStats, clearStatRouterCache } from '../tools/statRouters/index.js';
import { getConstitution } from '../constitution/index.js';
import { ballDontLieService } from '../../ballDontLieService.js';
import { nbaSeason, nhlSeason, nflSeason, ncaabSeason } from '../../../utils/dateUtils.js';
import { getTokensForSport, toolDefinitions } from '../tools/toolDefinitions.js';

function hasInvestigationCompleteMarker(text = '') {
  if (!text || typeof text !== 'string') return false;
  return /(^|\n)\s*INVESTIGATION COMPLETE\s*($|\n)/i.test(text);
}

const NBA_CASE_MIN_CHARS = 220;

function normalizeTeamWords(team = '') {
  return String(team || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length >= 3 && !['the', 'and'].includes(w));
}

function getTeamMentionScore(line = '', team = '') {
  const lowerLine = String(line || '').toLowerCase();
  const words = normalizeTeamWords(team);
  if (words.length === 0) return 0;
  return words.reduce((score, w) => (lowerLine.includes(w) ? score + 1 : score), 0);
}

function parseSpreadFromLine(line = '') {
  const match = String(line || '').match(/([+-]\d{1,2}(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function classifyNbaCaseHeader(line = '', homeTeam = '', awayTeam = '', spread = null) {
  const rawLine = String(line || '').trim();
  if (!rawLine) return { side: null, misaligned: false };

  const lower = rawLine.toLowerCase();
  const mentionsHomeSide = /\bhome\s+(?:spread\s+)?side\b/.test(lower);
  const mentionsAwaySide = /\baway\s+(?:spread\s+)?side\b/.test(lower);
  const hasCaseWord = /\bcase\b/.test(lower);
  const hasSpreadToken = parseSpreadFromLine(rawLine) != null;
  const homeScore = getTeamMentionScore(rawLine, homeTeam);
  const awayScore = getTeamMentionScore(rawLine, awayTeam);
  const teamNamedHeader = hasSpreadToken && (homeScore > 0 || awayScore > 0);
  const isCaseLike = hasCaseWord || mentionsHomeSide || mentionsAwaySide || teamNamedHeader;
  if (!isCaseLike) return { side: null, misaligned: false };

  let side = null;
  if (/\bhome\s+(?:spread\s+)?side\b|\bhome\s+spread\b/.test(lower)) side = 'home';
  if (/\baway\s+(?:spread\s+)?side\b|\baway\s+spread\b/.test(lower)) side = side || 'away';

  if (!side && (homeScore > 0 || awayScore > 0)) {
    side = homeScore >= awayScore ? 'home' : 'away';
  }

  const lineSpread = parseSpreadFromLine(rawLine);
  const hasSpread = Number.isFinite(spread);
  const homeSpread = hasSpread ? Number(spread) : null;
  const awaySpread = hasSpread ? Number(-spread) : null;
  if (!side && lineSpread != null && hasSpread) {
    if (Math.abs(lineSpread - homeSpread) < 0.11) side = 'home';
    else if (Math.abs(lineSpread - awaySpread) < 0.11) side = 'away';
  }

  let misaligned = false;
  if (side && lineSpread != null && hasSpread) {
    const expected = side === 'home' ? homeSpread : awaySpread;
    const expectedSign = Math.sign(expected);
    const actualSign = Math.sign(lineSpread);
    // Allow magnitude drift (books move from -9.5 to -8.5, etc). Only treat as misaligned
    // when sign is opposite for an explicitly labeled side.
    if (expectedSign !== 0 && actualSign !== 0 && expectedSign !== actualSign) misaligned = true;
  }

  return { side, misaligned };
}

function validateNbaSpreadCases(text = '', homeTeam = '', awayTeam = '', spread = null) {
  const input = String(text || '');
  const headerCandidates = [];
  let cursor = 0;
  const lines = input.split('\n');
  for (const line of lines) {
    const idx = cursor;
    const endIdx = idx + line.length;
    const { side, misaligned } = classifyNbaCaseHeader(line, homeTeam, awayTeam, spread);
    if (side) {
      const bodyStart = input[endIdx] === '\n' ? endIdx + 1 : endIdx;
      headerCandidates.push({ side, misaligned, headerIndex: idx, bodyStart });
    }
    cursor = endIdx + 1;
  }

  const homeHeaders = headerCandidates.filter(h => h.side === 'home').sort((a, b) => a.headerIndex - b.headerIndex);
  const awayHeaders = headerCandidates.filter(h => h.side === 'away').sort((a, b) => a.headerIndex - b.headerIndex);

  if (homeHeaders.length === 0 || awayHeaders.length === 0) {
    const reason = (homeHeaders.length > 1 && awayHeaders.length === 0) || (awayHeaders.length > 1 && homeHeaders.length === 0)
      ? 'duplicate_side'
      : 'missing_sections';
    return {
      valid: false,
      reason,
      homeLen: 0,
      awayLen: 0
    };
  }

  const homeHeader = homeHeaders[0];
  const awayHeader = awayHeaders[0];
  const firstHeaders = [homeHeader, awayHeader].sort((a, b) => a.headerIndex - b.headerIndex);

  if (homeHeader.misaligned || awayHeader.misaligned) {
    return {
      valid: false,
      reason: 'misaligned_spread_side',
      homeLen: 0,
      awayLen: 0
    };
  }

  const markerMatch = /(^|\n)\s*INVESTIGATION COMPLETE\s*($|\n)/i.exec(input);
  const markerStart = markerMatch ? (markerMatch.index ?? input.length) : input.length;

  const sectionBodies = {};
  for (let i = 0; i < firstHeaders.length; i++) {
    const current = firstHeaders[i];
    const next = i + 1 < firstHeaders.length ? firstHeaders[i + 1].headerIndex : markerStart;
    const end = Math.min(next, markerStart);
    sectionBodies[current.side] = input.slice(current.bodyStart, end).trim();
  }

  const homeBody = sectionBodies.home || '';
  const awayBody = sectionBodies.away || '';
  const homeLen = homeBody.replace(/\s+/g, ' ').trim().length;
  const awayLen = awayBody.replace(/\s+/g, ' ').trim().length;

  if (homeLen < NBA_CASE_MIN_CHARS || awayLen < NBA_CASE_MIN_CHARS) {
    return {
      valid: false,
      reason: 'section_too_short',
      homeLen,
      awayLen
    };
  }

  return {
    valid: true,
    reason: '',
    homeLen,
    awayLen
  };
}

/**
 * Run the agent loop - handles tool calls and conversation flow
 *
 * GEMINI 3 ARCHITECTURE (2026 Update):
 * - Uses PERSISTENT chat sessions for automatic thought signature handling
 * - Flash runs research briefing before Gary starts (completes before Pass 1)
 * - Pro session runs investigation → evaluation → pick (Pass 1 → 2.5 → 3)
 *
 * @param {string} systemPrompt - The system prompt
 * @param {string} userMessage - The user message (scout report + game context)
 * @param {string} sport - Sport identifier
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @param {Object} options - Additional options
 */
export async function runAgentLoop(systemPrompt, userMessage, sport, homeTeam, awayTeam, options = {}) {
  const provider = 'gemini';
  const isNFLSport = sport === 'americanfootball_nfl' || sport === 'NFL';
  const isNCAABSport = sport === 'basketball_ncaab' || sport === 'NCAAB';
  const isNBASport = sport === 'basketball_nba' || sport === 'NBA';
  const isNHLSport = sport === 'icehockey_nhl' || sport === 'NHL';
  const isMLBSport = sport === 'baseball_mlb' || sport === 'MLB' || sport === 'WBC';

  // ═══════════════════════════════════════════════════════════════════════════
  // Props mode setup (must be before session creation so activeTools is available)
  const isPropsMode = options.mode === 'props';
  console.log(`[Orchestrator] Starting ${sport} — 3.1 Pro (main) + Flash (research)`);

  const propContext = options.propContext || null;
  let propsPicks = null; // Store props picks from finalize_props tool call
  let propsRetryCount = 0; // Track finalize_props retry attempts

  // Build tools list — add finalize_props when in props mode
  // NCAAB: Remove fetch_narrative_context (all narrative data is in scout report — Grounding wastes iterations)
  const baseTools = isNCAABSport
    ? toolDefinitions.filter(t => t.function?.name !== 'fetch_narrative_context')
    : toolDefinitions;
  const activeTools = isPropsMode
    ? [...baseTools, FINALIZE_PROPS_TOOL]
    : baseTools;

  // PERSISTENT SESSION SETUP (Gemini 3 Thought Signature Compliance)
  // ═══════════════════════════════════════════════════════════════════════════
  // Pro session runs investigation → evaluation → pick. Flash provides research briefing before Gary starts.
  // SDK automatically handles thought signatures when using persistent sessions.
  // All modes (game picks + props) start with 3.1 Pro + high reasoning
  // Flash is quota fallback only (via model cascade on 429 errors)
  let currentSession = createGeminiSession({
    modelName: GEMINI_PRO_MODEL,
    systemPrompt: systemPrompt,
    tools: activeTools,
    thinkingLevel: 'high'
  });
  let currentModelName = currentSession.modelName;
  console.log(`[Orchestrator] Pro session created (${currentModelName}, ${sport})`);

  // Messages array for state tracking (pass detection)
  // Note: For Gemini, actual API calls go through the persistent session
  let messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage }
  ];

  let iteration = 0;
  const toolCallHistory = [];

  // ═══════════════════════════════════════════════════════════════════════════
  // PERSISTENT SESSION STATE TRACKING
  // ═══════════════════════════════════════════════════════════════════════════
  // Track what message to send next (for persistent session approach)
  // First iteration: send userMessage
  // Subsequent: send function responses OR pass transition messages
  let nextMessageToSend = userMessage;
  let pendingFunctionResponses = []; // Batched function responses to send
  // Persistent pass-injection flags (survive context pruning)
  let _pass25Injected = false;
  let _pass25JustInjected = false; // True for ONE iteration after Pass 2.5 is injected (for response logging)

  // Investigation stall detection — nudge completion marker if investigation loops
  let _lastCategoryCount = 0;
  let _investigationStallCount = 0;
  let _pass3Injected = false;
  let _extraIterationsUsed = 0; // Guard against infinite loop from iteration-- (max 2)
  let _nbaCaseRetryUsed = false; // One retry for required bilateral spread cases before Pass 2.5

  // Flash Research Briefing state — comprehensive pre-game briefing (factual findings only)
  // Flash completes BEFORE Gary starts. Findings injected before Pass 1.
  let _researchBriefingReady = false;    // True when briefing has returned (or failed)
  let _researchBriefing = null;          // Briefing text from Flash (factual findings)
  const _flashCoverageTokens = [];       // Flash's called tokens — ONLY for pipeline gate coverage, NOT dedup or statsData

  const effectiveMaxIterations = CONFIG.maxIterations;

  // ═══════════════════════════════════════════════════════════════════════
  // AWAIT FLASH RESEARCH BRIEFING — completes BEFORE Gary starts
  // ═══════════════════════════════════════════════════════════════════════
  // Flash reads the scout report, identifies gaps, and uses fetch_stats
  // to investigate deeper. Gary waits for Flash to finish so he has the
  // full per-factor findings from the very first iteration.
  if (isMLBSport) {
    console.log(`[Research Briefing] Skipping Flash for WBC — Gary investigates with grounding tools during Pass 1`);
  } else if (options.scoutReport && !isPropsMode) {
    console.log(`[Research Briefing] 🔬 Running Flash research briefing (Gemini Flash with tools) — Gary waits for completion`);
    try {
      const briefingResult = await buildFlashResearchBriefing(options.scoutReport, sport, homeTeam, awayTeam, options);
      if (briefingResult && typeof briefingResult === 'object') {
        _researchBriefing = briefingResult.briefing;
        _researchBriefingReady = true;
        // Store Flash's called tokens in separate coverage array — NOT in toolCallHistory
        // This prevents Flash tracking entries (no homeValue/awayValue) from:
        // 1. Blocking Gary's dedup (Gary needs to re-fetch stats with actual values)
        // 2. Polluting statsData with null entries (breaks Tale of the Tape in iOS)
        if (briefingResult.calledTokens && briefingResult.calledTokens.length > 0) {
          for (const tokenEntry of briefingResult.calledTokens) {
            _flashCoverageTokens.push(tokenEntry);
          }
          console.log(`[Research Briefing] Stored ${briefingResult.calledTokens.length} Flash tokens for coverage tracking (separate from Gary's toolCallHistory)`);
        }
        console.log(`[Research Briefing] ✅ Briefing ready (${briefingResult.briefing?.length || 0} chars)`);
      } else if (briefingResult && typeof briefingResult === 'string') {
        _researchBriefing = briefingResult;
        _researchBriefingReady = true;
        console.log(`[Research Briefing] ✅ Briefing ready (${briefingResult.length} chars)`);
      } else {
        throw new Error(`[HARD FAIL] Flash Research Assistant returned empty briefing for ${homeTeam} @ ${awayTeam} (${sport}). The research assistant must complete successfully — no fallback to unresearched picks.`);
      }
    } catch (err) {
      throw new Error(`[HARD FAIL] Flash Research Assistant failed for ${homeTeam} @ ${awayTeam} (${sport}). Error: ${err.message}. The research assistant must complete successfully — no fallback to unresearched picks.`);
    }

    // Inject Flash's per-factor findings BEFORE Pass 1 + reframe Gary's task as spread investigation
    if (_researchBriefing) {
      const spread = options.spread ?? null;
      const hasSpread = Number.isFinite(spread);
      const homeSpread = hasSpread ? `${spread >= 0 ? '+' : ''}${spread.toFixed(1)}` : '';
      const awaySpread = hasSpread ? `${-spread >= 0 ? '+' : ''}${(-spread).toFixed(1)}` : '';
      const isNHL = sport === 'icehockey_nhl' || sport === 'NHL';
      const isMLB = sport === 'baseball_mlb' || sport === 'MLB' || sport === 'WBC';

      const spreadLine = (isNHL || isMLB)
        ? `The line is ${homeTeam} (home) vs ${awayTeam} (away) — moneyline.`
        : `The spread is ${homeTeam} ${homeSpread} / ${awayTeam} ${awaySpread}.`;

      const isNCAABSport = sport === 'basketball_ncaab' || sport === 'NCAAB';
      const nbaCaseReminder = (isNBASport || isNCAABSport)
        ? `\n\nBefore outputting INVESTIGATION COMPLETE, include both sections in your Pass 1 synthesis:\nCase for home spread side\nCase for away spread side\n(Each case should be 2-3 paragraphs, data-grounded, and explain why that side is advantaged relative to this spread number tonight.)`
        : '';

      const briefingBlock = `\n\n## RESEARCH BRIEFING (from your research assistant)\n\nYour research assistant investigated every factor with full tool access. These are structured, verified findings — use them as your foundation. If something stands out or needs deeper context, you can investigate further with your own tools.\n\n${_researchBriefing}\n\n---\n\n${spreadLine}\n\nYou MUST still investigate this matchup yourself using fetch_stats. The briefing gives you a head start — now verify key claims, check stats the briefing flagged, and use additional calls only where you need critical evidence to complete your synthesis.${nbaCaseReminder}\n\nWhen your investigation and synthesis are complete, output exactly:\nINVESTIGATION COMPLETE`;
      // Append to the user message Gary receives
      userMessage = userMessage + briefingBlock;
      nextMessageToSend = userMessage;
      // Update messages array to include briefing
      messages[1] = { role: 'user', content: userMessage };
      console.log(`[Orchestrator] 📋 Flash research briefing included before Pass 1 (${_researchBriefing.length} chars) — Gary tasked with spread investigation`);
      // Dump full Flash briefing to file when VERBOSE_GARY is set
      if (process.env.VERBOSE_GARY) {
        const fs = await import('fs');
        const dumpPath = `/tmp/flash_briefing_${homeTeam.replace(/\s/g,'_')}_${Date.now()}.txt`;
        const fullDump = `=== FLASH RESEARCH BRIEFING (${_researchBriefing.length} chars) ===\n\n${_researchBriefing}`;
        fs.writeFileSync(dumpPath, fullDump);
        console.log(`[VERBOSE] Flash briefing dumped to: ${dumpPath}`);
      }
    }
  }

  while (iteration < effectiveMaxIterations) {
    iteration++;
    console.log(`\n[Orchestrator] Iteration ${iteration}/${effectiveMaxIterations} (${provider}, ${currentModelName})`);

    // Get the spread for Pass 2.5 context injection (available throughout loop)
    const spread = options.spread ?? null;

    let response;
    let message;
    let finishReason;

    if (provider === 'gemini' && currentSession) {
      // ═══════════════════════════════════════════════════════════════════════
      // PERSISTENT SESSION API CALL (Gemini 3 with thought signature handling)
      // ═══════════════════════════════════════════════════════════════════════
      const currentPass = determineCurrentPass(messages);
      
      try {
        let sessionResponse;
        
        if (pendingFunctionResponses.length > 0) {
          // Step 1: Send batched function responses
          console.log(`[Orchestrator] Sending ${pendingFunctionResponses.length} function response(s) to session`);
          sessionResponse = await sendToSessionWithRetry(
            currentSession, 
            pendingFunctionResponses, 
            { isFunctionResponse: true }
          );
          pendingFunctionResponses = []; // Clear after sending
          
          // Step 2: Check if Gary responded without tool calls AND we have a pass message queued
          // If so, send the pass message immediately as a follow-up
          const hasQueuedPassMessage = nextMessageToSend && nextMessageToSend !== userMessage &&
            (nextMessageToSend.includes('PASS 2.5') || nextMessageToSend.includes('CASE REVIEW') ||
             nextMessageToSend.includes('CASE EVALUATION') || nextMessageToSend.includes('investigation is complete'));
          
          if (!sessionResponse.toolCalls && hasQueuedPassMessage) {
            console.log(`[Orchestrator] 📝 Sending queued pass message after function responses`);
            // Send the pass message as follow-up
            const sentMessage = nextMessageToSend;
            sessionResponse = await sendToSessionWithRetry(currentSession, nextMessageToSend);
            nextMessageToSend = null; // Clear after sending
          }

        } else {
          // Send text message (user message or pass transition)
          if (!nextMessageToSend) {
            console.log(`[Orchestrator] ⚠️ No message to send - using fallback prompt`);
            nextMessageToSend = `Continue your investigation. Use fetch_stats to gather more data on this matchup.`;
          }
          sessionResponse = await sendToSessionWithRetry(currentSession, nextMessageToSend);
        }
        
        // Normalize session response format for downstream code
        message = {
          role: 'assistant',
          content: sessionResponse.content,
          tool_calls: sessionResponse.toolCalls
        };
        finishReason = sessionResponse.finishReason;
        
        // Log token usage
        if (sessionResponse.usage) {
          console.log(`[Orchestrator] Tokens - Prompt: ${sessionResponse.usage.prompt_tokens}, Completion: ${sessionResponse.usage.completion_tokens}`);
        }
        
        // Add assistant message to messages array for state tracking
        if (message.content || message.tool_calls) {
          messages.push(message);
        }

        // Log Pass 2.5 response content for debugging (FULL — no truncation)
        if (_pass25JustInjected && message.content && !message.tool_calls?.length) {
          console.log(`\n📋 GARY'S PASS 2.5 EVALUATION (${message.content.length} chars):\n${'─'.repeat(60)}`);
          console.log(message.content);
          console.log(`${'─'.repeat(60)}\n`);
          _pass25JustInjected = false;
        }

      } catch (error) {
        // ═══════════════════════════════════════════════════════════════════
        // 429 QUOTA CASCADE: Each model tries primary key → backup key before falling
        // to the next tier. 3.1 Pro → Pro fallback → Flash → HARD FAIL
        // ═══════════════════════════════════════════════════════════════════
        // 3.1 Pro 429 → try backup key, else fall to Pro fallback (reset to primary)
        if (error.isQuotaError && currentModelName === GEMINI_PRO_MODEL) {
          const textualContext = extractTextualSummaryForModelSwitch(messages, toolCallHistory);
          if (textualContext.length < 2000) {
            console.warn(`[Orchestrator] LOW CONTEXT WARNING: Only ${textualContext.length} chars for model switch`);
          }

          if (!isUsingBackupKey() && rotateToBackupKey()) {
            console.log(`[Orchestrator] ⚠️ 3.1 Pro quota exceeded — rotated to backup API key, retrying with 3.1 Pro`);
            currentSession = createGeminiSession({
              modelName: GEMINI_PRO_MODEL,
              systemPrompt: systemPrompt + '\n\n' + textualContext,
              tools: currentPass === 'evaluation' ? [] : activeTools,
              thinkingLevel: 'high'
            });
          } else {
            // 3.1 Pro exhausted on both keys — fall to Pro fallback on primary key
            resetToPrimaryKey();
            console.log(`[Orchestrator] ⚠️ 3.1 Pro exhausted — falling back to Pro fallback (primary key)`);
            currentSession = createGeminiSession({
              modelName: GEMINI_PRO_FALLBACK,
              systemPrompt: systemPrompt + '\n\n' + textualContext,
              tools: currentPass === 'evaluation' ? [] : activeTools,
              thinkingLevel: 'high'
            });
            currentModelName = GEMINI_PRO_FALLBACK;
          }

          console.log(`[Orchestrator] 🔄 Created fallback session, retrying...`);
          const retryResponse = await sendToSessionWithRetry(currentSession, nextMessageToSend);
          message = {
            role: 'assistant',
            content: retryResponse.content,
            tool_calls: retryResponse.toolCalls
          };
          finishReason = retryResponse.finishReason;
          if (message.content || message.tool_calls) {
            messages.push(message);
          }
        }
        // Pro fallback 429 → try backup key, else fall to Flash (reset to primary)
        else if (error.isQuotaError && currentModelName === GEMINI_PRO_FALLBACK) {
          const textualContext = extractTextualSummaryForModelSwitch(messages, toolCallHistory);

          if (!isUsingBackupKey() && rotateToBackupKey()) {
            console.log(`[Orchestrator] ⚠️ Pro fallback quota exceeded — rotated to backup key, retrying`);
            currentSession = createGeminiSession({
              modelName: GEMINI_PRO_FALLBACK,
              systemPrompt: systemPrompt + '\n\n' + textualContext,
              tools: currentPass === 'evaluation' ? [] : activeTools,
              thinkingLevel: 'high'
            });
          } else {
            // Pro fallback exhausted on both keys — fall to Flash on primary key
            resetToPrimaryKey();
            console.log(`[Orchestrator] ⚠️ All Pro models exhausted — falling back to Flash (primary key)`);
            currentSession = createGeminiSession({
              modelName: 'gemini-3-flash-preview',
              systemPrompt: systemPrompt + '\n\n' + textualContext,
              tools: currentPass === 'evaluation' ? [] : activeTools,
              thinkingLevel: 'high'
            });
            currentModelName = 'gemini-3-flash-preview';
          }

          console.log(`[Orchestrator] 🔄 Created fallback session, retrying...`);
          const retryResponse = await sendToSessionWithRetry(currentSession, nextMessageToSend);
          message = {
            role: 'assistant',
            content: retryResponse.content,
            tool_calls: retryResponse.toolCalls
          };
          finishReason = retryResponse.finishReason;
          if (message.content || message.tool_calls) {
            messages.push(message);
          }
        }
        // Flash 429 → try backup key, else HARD FAIL (all 6 combos exhausted)
        else if (error.isQuotaError && currentModelName === 'gemini-3-flash-preview') {
          const textualContext = extractTextualSummaryForModelSwitch(messages, toolCallHistory);

          if (!isUsingBackupKey() && rotateToBackupKey()) {
            console.log(`[Orchestrator] ⚠️ Flash quota exceeded — rotated to backup API key, retrying with Flash`);
            currentSession = createGeminiSession({
              modelName: 'gemini-3-flash-preview',
              systemPrompt: systemPrompt + '\n\n' + textualContext,
              tools: currentPass === 'evaluation' ? [] : activeTools,
              thinkingLevel: 'high'
            });
          } else {
            throw new Error(`[Orchestrator] All model quotas exhausted on both API keys (3.1 Pro, 3 Pro, Flash). Cannot produce pick.`);
          }

          console.log(`[Orchestrator] 🔄 Created fallback session, retrying...`);
          const retryResponse = await sendToSessionWithRetry(currentSession, nextMessageToSend);
          message = {
            role: 'assistant',
            content: retryResponse.content,
            tool_calls: retryResponse.toolCalls
          };
          finishReason = retryResponse.finishReason;
          if (message.content || message.tool_calls) {
            messages.push(message);
          }
        } else if (error.message?.includes('MALFORMED_FUNCTION_CALL')) {
          // MALFORMED_FUNCTION_CALL after retries — tell Gary the tool call failed and continue
          // Do NOT create a new session or force-skip phases. The existing session has full context.
          console.log(`[Orchestrator] ⚠️ MALFORMED_FUNCTION_CALL after retries — telling Gary to continue`);

          message = {
            role: 'assistant',
            content: '[Tool call failed due to formatting error]',
            tool_calls: null
          };
          messages.push(message);

          // Tell Gary his tool call was malformed so he can retry or move on
          messages.push({
            role: 'user',
            content: 'Your last tool call had a formatting error and could not be processed. You can retry the tool call with corrected arguments, or continue your analysis with the data you already have.'
          });
          nextMessageToSend = messages[messages.length - 1].content;
          finishReason = 'stop';

          // Clear pending function responses to avoid stale state
          pendingFunctionResponses = [];
        } else {
          throw error;
        }
      }

    } else if (provider === 'gemini') {
      // No session available — this should never happen in normal operation
      throw new Error('No active Gemini session available');
    }

    // Handle empty response from Gemini (common when model is confused)
    if (provider === 'gemini' && !message.content && !message.tool_calls) {
      // Check what pass we're in to provide appropriate nudge
      let nudgeContent;

      if (_pass25Injected) {
        // Pass 2.5 already sent - need decision, not stats
        console.log(`[Orchestrator] ⚠️ Gemini returned empty response after Pass 2.5 - requesting decision output`);
        nudgeContent = `You didn't provide a response. Evaluate both sides and make your pick in natural language. Do NOT output JSON — the final formatted output comes in the next step.`;
      } else {
        // Still in investigation phase — check investigation breadth
        const { sufficient, categoryCount, totalCalls } = isInvestigationSufficient(toolCallHistory, iteration);

        if (sufficient) {
          // Enough investigation — tell Gary to wrap up investigation (NOT to decide)
          console.log(`[Orchestrator] Gary has ${totalCalls} stats across ${categoryCount} categories — pushing to proceed`);
          nudgeContent = `You have ${totalCalls} stats gathered across ${categoryCount} categories. If there are remaining critical factual gaps, request only those stats. Otherwise, finish Pass 1 synthesis and output exactly:\nINVESTIGATION COMPLETE`;
        } else {
          console.log(`[Orchestrator] ⚠️ Gemini returned empty response (${totalCalls} stats, ${categoryCount} categories) — prompting for more stats`);
          nudgeContent = `You didn't respond. Use the fetch_stats tool to request stats for this matchup. You've gathered ${totalCalls} stats across ${categoryCount} categories so far. Continue investigating to build a complete picture of this matchup.`;
        }
      }
      
      messages.push({ role: 'user', content: nudgeContent });
      
      // For persistent session, set next message to send
      nextMessageToSend = nudgeContent;
      continue;
    }

    // Check if Gary requested tool calls
    if (message.tool_calls && message.tool_calls.length > 0) {
      // Build set of ALREADY FETCHED stats from history (across all iterations)
      // Include BOTH full tokens and base tokens to catch duplicates properly
      const alreadyFetchedStats = new Set();
      for (const t of toolCallHistory) {
        const token = t.token || '';
        if (token) {
          // Add full token (e.g., "PLAYER_GAME_LOGS:Drake Maye")
          alreadyFetchedStats.add(token);
          // Also add base token (e.g., "PLAYER_GAME_LOGS") for generic checks
          const baseToken = token.split(':')[0];
          if (baseToken && baseToken !== token) {
            alreadyFetchedStats.add(baseToken);
          }
        }
      }
      
      // Deduplicate tool calls - both within this batch AND against history
      const seenStats = new Set();
      const skippedDuplicates = [];
      
      const uniqueToolCalls = message.tool_calls.filter(tc => {
        try {
          // Skip Gemini's built-in google_search_tool — not a real tool we handle
          // Gemini Pro sometimes emits these as phantom function calls
          if (tc.function.name === 'google_search_tool' || tc.function.name === 'google_search') {
            skippedDuplicates.push(`${tc.function.name}:skipped`);
            return false;
          }
          const args = JSON.parse(tc.function.arguments);
          // Key based on function name + stat identifier (token for fetch_stats, stat_type for player stats)
          const token = args.token || args.stat_type;
          if (!token && tc.function.name === 'fetch_stats') {
            console.warn(`[Orchestrator] Malformed tool call — missing token/stat_type. Args: ${JSON.stringify(args).slice(0, 100)}`);
            return true; // Keep it — will send error function response so Gary can retry
          }
          if (!token) {
            // Non-fetch_stats tools (e.g. fetch_player_game_logs) — dedup by function:player_name
            const altKey = `${tc.function.name}:${args.player_name || args.player || 'unknown'}`;
            if (seenStats.has(altKey)) { skippedDuplicates.push(altKey); return false; }
            seenStats.add(altKey);
            return true;
          }
          const key = `${tc.function.name}:${token}`;
          
          // Check if already fetched in previous iterations
          if (alreadyFetchedStats.has(token) || alreadyFetchedStats.has(key)) {
            skippedDuplicates.push(token);
            return false; // Skip - already have this data
          }
          
          // Check if duplicate within this batch
          if (seenStats.has(key)) {
            skippedDuplicates.push(token);
            return false; // Skip duplicate in batch
          }
          seenStats.add(key);
          return true;
        } catch {
          return true; // Keep if can't parse
        }
      });
      
      const dupeCount = message.tool_calls.length - uniqueToolCalls.length;
      if (dupeCount > 0) {
        console.log(`[Orchestrator] Deduplicated ${dupeCount} duplicate stat request(s): ${skippedDuplicates.slice(0, 5).join(', ')}${skippedDuplicates.length > 5 ? '...' : ''}`);
      }
      
      console.log(`[Orchestrator] Gary requested ${uniqueToolCalls.length} stat(s):`);

      // Note: Assistant message already added to messages array after API call (for session tracking)

      // CRITICAL FIX: Handle when ALL tool calls were duplicates
      // Without this, Gary keeps requesting the same stats and loops forever
      if (uniqueToolCalls.length === 0 && message.tool_calls.length > 0) {
        console.log(`[Orchestrator] All ${message.tool_calls.length} stats already gathered - nudging Gary to proceed`);

        // Build a DATA RECAP of key findings so Gary doesn't re-request after context pruning
        const gatheredStats = toolCallHistory.map(t => t.token).filter(Boolean);
        const dataRecapLines = [];
        for (const entry of toolCallHistory) {
          if (entry.summary && entry.summary.length > 10) {
            // Include a one-line summary of each stat result
            const shortSummary = entry.summary; // Full summary — no truncation
            dataRecapLines.push(`• ${entry.token}: ${shortSummary}`);
          }
        }
        const dataRecap = dataRecapLines.length > 0
          ? `\n\n**YOUR GATHERED DATA (${toolCallHistory.length} stats):**\n${dataRecapLines.slice(0, 20).join('\n')}`
          : `\n\nYou've gathered ${toolCallHistory.length} stats: ${gatheredStats.join(', ')}`;

        // Determine what phase we're in
        let nudgeMessage;
        if (_pass25Injected) {
          nudgeMessage = `ALL ${message.tool_calls.length} stats you requested were already gathered. DO NOT request more stats.${dataRecap}

Evaluate both sides and make your pick in natural language. Do NOT output JSON — the final formatted output comes in the next step.`;
        } else {
          // Still in investigation phase — check if investigation has stalled
          const { categoryCount, totalCalls } = isInvestigationSufficient(toolCallHistory, iteration);
          _investigationStallCount++;

          console.log(`[Orchestrator] All-duplicates: ${totalCalls} stats, ${categoryCount} categories, stall=${_investigationStallCount}`);

          nudgeMessage = `Your stat requests were all duplicates of stats you already gathered. DO NOT re-request the same stats.${dataRecap}

If you still need more data, request different stats. If your Pass 1 synthesis is complete, output exactly:
INVESTIGATION COMPLETE`;
        }

        messages.push({
          role: 'user',
          content: nudgeMessage
        });

        nextMessageToSend = nudgeMessage;
        // Don't count duplicate-only iterations against the budget — no new work was done
        // Guard: only allow iteration-- up to 2 times to prevent infinite loops
        if (_extraIterationsUsed < 2) {
          iteration--;
          _extraIterationsUsed++;
        }
        continue;
      }

      // Process each unique tool call
      for (const toolCall of uniqueToolCalls) {
        const args = JSON.parse(toolCall.function.arguments);
        const functionName = toolCall.function.name;

        // Handle malformed tool calls — missing token parameter
        if (functionName === 'fetch_stats' && !args.token && !args.stat_type) {
          messages.push({
            tool_call_id: toolCall.id,
            role: 'tool',
            name: functionName,
            content: JSON.stringify({ error: 'Malformed tool call — missing token parameter. Specify which stat to fetch (e.g., token: "NET_RATING").' })
          });
          continue;
        }

        // Handle finalize_props tool call (props mode only)
        if (functionName === 'finalize_props' && isPropsMode) {
          // PIPELINE GATE: Block finalize_props until Pass 3 has been injected
          // Props must go through full pipeline: Pass 1 → Pass 2.5 → Pass 3 → finalize
          if (!_pass3Injected) {
            const stage = !_pass25Injected ? 'evaluation (Pass 2.5)' : 'final props evaluation (Pass 3)';
            console.log(`[Orchestrator] ⚠️ finalize_props BLOCKED — ${stage} not yet completed`);
            pendingFunctionResponses.push({
              name: functionName,
              content: JSON.stringify({ error: `Cannot finalize props yet. You must complete ${stage} first. Continue your analysis and evaluation before selecting your final props.` })
            });
            continue;
          }

          const rawPicks = args.picks || [];
          console.log(`[Orchestrator] 🎯 finalize_props called with ${rawPicks.length} picks`);

          // Validate picks have required fields
          const validPicks = rawPicks.filter(p => {
            if (!p.player || !p.bet || !p.rationale) {
              console.warn(`[Orchestrator] ⚠️ Dropping pick — missing required fields: player=${p.player}, bet=${p.bet}, rationale=${!!p.rationale}`);
              return false;
            }
            return true;
          });

          if (validPicks.length === 0) {
            console.warn(`[Orchestrator] ⚠️ finalize_props had 0 valid picks — requesting retry`);
            pendingFunctionResponses.push({
              name: functionName,
              content: JSON.stringify({ error: 'Your picks are missing required fields (player, bet, rationale). Call finalize_props again with complete pick data.' })
            });
            continue;
          }

          propsPicks = validPicks;

          // Return the props picks immediately
          return {
            picks: propsPicks,
            toolCallHistory,
            iterations: iteration,
            homeTeam,
            awayTeam,
            sport,
            rawAnalysis: message.content || '',
            isProps: true
          };
        }

        // Handle fetch_narrative_context tool (storylines, player news, context)
        if (functionName === 'fetch_narrative_context') {
          // Block narrative context after Pass 2.5 — investigation is over, Gary should be evaluating
          if (_pass25Injected) {
            console.log(`  → [NARRATIVE_CONTEXT] BLOCKED (Pass 2.5 injected — investigation phase over): "${args.query}"`);
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              name: functionName,
              content: JSON.stringify({ error: 'Investigation phase is complete. You have sufficient data. Continue your evaluation and make your pick. Do NOT request more data.' })
            });
            continue;
          }

          // NCAAB: Block ALL narrative context — Current State + Tier 1 metrics (Barttorvik/NET/SOS)
          // are already in the scout report. Narrative context calls return garbage (146 chars of generic text)
          // and waste iterations. Gary should use fetch_stats for BDL data instead.
          if (sport === 'basketball_ncaab') {
            console.log(`  → [NARRATIVE_CONTEXT] BLOCKED (NCAAB — data already in scout report): "${args.query}"`);
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              name: functionName,
              content: JSON.stringify({ error: 'NCAAB narrative context is already in your scout report (Current State section + Tier 1 Advanced Metrics). Use fetch_stats for additional BDL data. Do NOT call fetch_narrative_context for NCAAB.' })
            });
            continue;
          }

          // Non-NCAAB: Qualify queries to prevent contamination
          let groundingQuery = args.query;

          console.log(`  → [NARRATIVE_CONTEXT] for query: "${groundingQuery}"`);

          try {
            const { geminiGroundingSearch } = await import('../scoutReport/scoutReportBuilder.js');

            const searchResult = await geminiGroundingSearch(groundingQuery, {
              temperature: 1.0,
              maxTokens: 1000
            });

            if (searchResult?.success && searchResult?.data) {
              const toolResponse = {
                role: 'tool',
                tool_call_id: toolCall.id,
                name: functionName,
                content: JSON.stringify({
                  query: args.query,
                  results: searchResult.data
                })
              };
              messages.push(toolResponse);
              console.log(`    ✓ Found narrative context via Gemini Grounding (${searchResult.data.length} chars)`);

              // Track in toolCallHistory so investigation sufficiency counts grounding data
              const q = (args.query || '').toLowerCase();
              const mapped = [];
              if (/defen|drtg|block|steal|rebound/.test(q)) mapped.push('REBOUNDS', 'STEALS', 'BLOCKS', 'DEFENSIVE_RATING');
              if (/recent|form|streak|last\s*\d|results?\b|record\b/.test(q)) mapped.push('RECENT_FORM');
              if (/h2h|head.to.head|history|series|matchup|versus|\bvs\b/.test(q)) mapped.push('H2H_HISTORY');
              if (/assist|playmaking|ball.movement/.test(q)) mapped.push('ASSISTS');
              if (/standing|playoff|seed|division/.test(q)) mapped.push('STANDINGS');
              if (/motiv|rival|revenge|primetime/.test(q)) mapped.push('PRIMETIME_RECORD');
              if (/injur|ruled.out|questionable/.test(q)) mapped.push('INJURIES');
              if (/rest\b|back.to.back|travel|schedule/.test(q)) mapped.push('REST_SITUATION');
              if (/goalie|save|goaltend/.test(q)) mapped.push('GOALIE_STATS');
              if (/scoring.trend|quarter|first.half|second.half|period/.test(q)) mapped.push('QUARTER_SCORING', 'FIRST_HALF_TRENDS');
              if (/roster|depth|bench|rotation/.test(q)) mapped.push('BENCH_DEPTH');
              if (/corsi|possession|expected.goal/.test(q)) mapped.push('CORSI_FOR_PCT');
              if (/power.play|penalty.kill|special.team/.test(q)) mapped.push('SPECIAL_TEAMS');
              if (/tempo|pace/.test(q)) mapped.push('PACE');
              if (/efficien|rating|kenpom|adjEM|net.rating/.test(q)) mapped.push('NET_RATING', 'NCAAB_OFFENSIVE_RATING');

              // Push all mapped tokens so investigation sufficiency tracker counts them
              for (const token of mapped) {
                toolCallHistory.push({ token, timestamp: Date.now() });
              }
              // Always push the generic tracking entry
              toolCallHistory.push({ token: 'NARRATIVE_CONTEXT', timestamp: Date.now() });
            } else {
              throw new Error('Grounding search failed or returned no data');
            }
          } catch (e) {
            console.error(`    ❌ narrative_context error:`, e.message);
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              name: functionName,
              content: JSON.stringify({ error: `Search failed: ${e.message}. Fall back to other stats.` })
            });
          }
          continue;
        }

        // Handle fetch_nfl_player_stats tool (advanced player stats)
        if (functionName === 'fetch_nfl_player_stats') {
          console.log(`  → [NFL_PLAYER_STATS:${args.stat_type}] for ${args.team}${args.player_name ? ` (${args.player_name})` : ''}`);

          try {
            const { ballDontLieService } = await import('../../ballDontLieService.js');

            let statResult = { stat_type: args.stat_type, team: args.team, data: [] };

            // Get team ID first
            const teams = await ballDontLieService.getTeams('americanfootball_nfl');
            const team = teams.find(t =>
              t.full_name?.toLowerCase().includes(args.team.toLowerCase()) ||
              t.name?.toLowerCase().includes(args.team.toLowerCase()) ||
              t.location?.toLowerCase().includes(args.team.toLowerCase())
            );

            if (!team) {
              statResult.error = `Team "${args.team}" not found`;
            } else {
              // Calculate NFL season dynamically
              const season = nflSeason();

              if (args.stat_type === 'PASSING') {
                const data = await ballDontLieService.getNflAdvancedPassingStats({ season });
                // Filter by team and optionally player
                statResult.data = (data || [])
                  .filter(p => p.player?.team?.id === team.id || p.player?.team?.full_name === team.full_name)
                  .filter(p => !args.player_name ||
                    `${p.player?.first_name} ${p.player?.last_name}`.toLowerCase().includes(args.player_name.toLowerCase()))
                  .slice(0, 5)
                  .map(p => ({
                    player: `${p.player?.first_name} ${p.player?.last_name}`,
                    position: p.player?.position_abbreviation,
                    gamesPlayed: p.games_played,
                    completionPct: p.completion_percentage?.toFixed(1),
                    completionAboveExpected: p.completion_percentage_above_expectation?.toFixed(1),
                    avgTimeToThrow: p.avg_time_to_throw?.toFixed(2),
                    aggressiveness: p.aggressiveness?.toFixed(1),
                    avgAirYards: p.avg_intended_air_yards?.toFixed(1),
                    passingYards: p.pass_yards,
                    passingTDs: p.pass_touchdowns,
                    interceptions: p.interceptions,
                    passerRating: p.passer_rating?.toFixed(1)
                  }));
              } else if (args.stat_type === 'RUSHING') {
                const data = await ballDontLieService.getNflAdvancedRushingStats({ season });
                statResult.data = (data || [])
                  .filter(p => p.player?.team?.id === team.id || p.player?.team?.full_name === team.full_name)
                  .filter(p => !args.player_name ||
                    `${p.player?.first_name} ${p.player?.last_name}`.toLowerCase().includes(args.player_name.toLowerCase()))
                  .slice(0, 5)
                  .map(p => ({
                    player: `${p.player?.first_name} ${p.player?.last_name}`,
                    position: p.player?.position_abbreviation,
                    rushAttempts: p.rush_attempts,
                    rushYards: p.rush_yards,
                    rushTDs: p.rush_touchdowns,
                    yardsOverExpected: p.rush_yards_over_expected?.toFixed(1),
                    yardsOverExpectedPerAtt: p.rush_yards_over_expected_per_att?.toFixed(2),
                    efficiency: p.efficiency?.toFixed(2),
                    avgTimeToLOS: p.avg_time_to_los?.toFixed(2),
                    avgRushYards: p.avg_rush_yards?.toFixed(1)
                  }));
              } else if (args.stat_type === 'RECEIVING') {
                const data = await ballDontLieService.getNflAdvancedReceivingStats({ season });
                statResult.data = (data || [])
                  .filter(p => p.player?.team?.id === team.id || p.player?.team?.full_name === team.full_name)
                  .filter(p => !args.player_name ||
                    `${p.player?.first_name} ${p.player?.last_name}`.toLowerCase().includes(args.player_name.toLowerCase()))
                  .slice(0, 8)
                  .map(p => ({
                    player: `${p.player?.first_name} ${p.player?.last_name}`,
                    position: p.player?.position_abbreviation,
                    targets: p.targets,
                    receptions: p.receptions,
                    catchPct: p.catch_percentage?.toFixed(1),
                    yards: p.yards,
                    recTDs: p.rec_touchdowns,
                    avgSeparation: p.avg_separation?.toFixed(2),
                    avgYAC: p.avg_yac?.toFixed(1),
                    yacAboveExpected: p.avg_yac_above_expectation?.toFixed(1),
                    avgCushion: p.avg_cushion?.toFixed(1),
                    avgIntendedAirYards: p.avg_intended_air_yards?.toFixed(1)
                  }));
              }

              if (statResult.data.length === 0) {
                statResult.message = `No ${args.stat_type.toLowerCase()} stats found for ${team.full_name}`;
              }
            }

            // Store in history
            toolCallHistory.push({
              token: `NFL_PLAYER_STATS:${args.stat_type}`,
              timestamp: Date.now(),
              homeValue: statResult.data?.length || 0,
              awayValue: 'players',
              rawResult: statResult
            });

            // Summarize player stats for context efficiency
            const playerSummary = summarizePlayerStats(statResult, args.stat_type, args.team || homeTeam);
            messages.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              name: functionName,
              content: playerSummary
            });
          } catch (error) {
            console.error('[Orchestrator] Error fetching NFL player stats:', error.message);
            messages.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              name: functionName,
              content: JSON.stringify({ error: error.message, stat_type: args.stat_type })
            });
          }

          continue; // Skip the regular fetch_stats handling
        }

        // Handle fetch_player_game_logs tool (universal)
        if (functionName === 'fetch_player_game_logs') {
          console.log(`  → [PLAYER_GAME_LOGS] ${args.player_name} (${args.sport})`);

          try {
            const { ballDontLieService } = await import('../../ballDontLieService.js');
            const sportMap = {
              'NBA': 'basketball_nba',
              'NFL': 'americanfootball_nfl',
              'NHL': 'icehockey_nhl',
              'NCAAB': 'basketball_ncaab',
              'NCAAF': 'americanfootball_ncaaf'
            };
            const sportKey = sportMap[args.sport];
            const numGames = args.num_games || 5;

            // Player search and matching logic for props tool calls
            const nameParts = args.player_name.trim().split(' ');
            const lastName = nameParts[nameParts.length - 1];
            const firstName = nameParts.length > 1 ? nameParts[0] : '';
            // Search by full name first for better precision, fallback to last name
            const searchTerm = nameParts.length > 1 ? args.player_name.trim() : lastName;
            const playersResponse = await ballDontLieService.getPlayersGeneric(sportKey, { search: searchTerm, per_page: 25 });
            // Handle both array and {data: [...]} response formats
            let players = Array.isArray(playersResponse) ? playersResponse : (playersResponse?.data || []);

            // If full name search returned no results, retry with last name only
            if (players.length === 0 && searchTerm !== lastName) {
              const fallbackResponse = await ballDontLieService.getPlayersGeneric(sportKey, { search: lastName, per_page: 25 });
              players = Array.isArray(fallbackResponse) ? fallbackResponse : (fallbackResponse?.data || []);
            }

            // Priority: 1) exact full name + same team, 2) exact full name, 3) last name + same team, 4) last name only
            const fullNameLower = args.player_name.toLowerCase();
            const homeFirst = homeTeam.split(' ')[0].toLowerCase();
            const awayFirst = awayTeam.split(' ')[0].toLowerCase();
            const isOnGameTeam = (p) => {
              const pTeam = (p.team?.full_name || p.team?.name || '').toLowerCase();
              return pTeam.includes(homeFirst) || pTeam.includes(awayFirst);
            };
            const player = players.find(p =>
              `${p.first_name} ${p.last_name}`.toLowerCase() === fullNameLower && isOnGameTeam(p)
            ) || players.find(p =>
              `${p.first_name} ${p.last_name}`.toLowerCase() === fullNameLower
            ) || players.find(p => {
              if (p.last_name?.toLowerCase() !== lastName.toLowerCase()) return false;
              return isOnGameTeam(p);
            }) || players.find(p =>
              p.last_name?.toLowerCase() === lastName.toLowerCase()
            );

            if (!player) {
              messages.push({
                tool_call_id: toolCall.id,
                role: 'tool',
                name: functionName,
                content: JSON.stringify({ error: `Player "${args.player_name}" not found in ${args.sport}` })
              });
              continue;
            }

            let logs;
            if (args.sport === 'NBA') {
              logs = await ballDontLieService.getNbaPlayerGameLogs(player.id, numGames);
            } else if (args.sport === 'NCAAB') {
              logs = await ballDontLieService.getNcaabPlayerGameLogs(player.id, numGames);
            } else if (args.sport === 'NHL') {
              logs = await ballDontLieService.getNhlPlayerGameLogs(player.id, numGames);
            } else {
              // NFL / NCAAF
              const season = nflSeason();
              const allLogs = await ballDontLieService.getNflPlayerGameLogsBatch([player.id], season, numGames);
              logs = allLogs[player.id];
            }

            const statResult = {
              player: args.player_name,
              sport: args.sport,
              logs: logs || { message: 'No logs found' }
            };

            // Summarize player game logs for context efficiency
            const logSummary = summarizePlayerGameLogs(args.player_name, logs);
            messages.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              name: functionName,
              content: logSummary
            });
            console.log(`    [Tool Response] ${functionName}: ${logSummary.slice(0, 300)}${logSummary.length > 300 ? '...' : ''}`);

            // FIX: Track player game logs in toolCallHistory for audit
            toolCallHistory.push({
              token: `PLAYER_GAME_LOGS:${args.player_name}`,
              timestamp: Date.now(),
              homeValue: logs?.length || 0,
              awayValue: 'N/A'
            });
          } catch (error) {
            console.error('[Orchestrator] Error fetching player game logs:', error.message);
            messages.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              name: functionName,
              content: `${args.player_name} GAME LOGS: Error fetching - ${error.message}`
            });
            // Still track failed calls for audit
            toolCallHistory.push({
              token: `PLAYER_GAME_LOGS:${args.player_name}:FAILED`,
              timestamp: Date.now(),
              homeValue: 'error',
              awayValue: 'N/A'
            });
          }
          continue;
        }

        // Handle fetch_nba_player_stats tool
        if (functionName === 'fetch_nba_player_stats') {
          console.log(`  → [NBA_PLAYER_STATS:${args.stat_type}] for ${args.team}${args.player_name ? ` (${args.player_name})` : ''}`);

          try {
            const { ballDontLieService } = await import('../../ballDontLieService.js');
            
            // Get team ID first
            const teams = await ballDontLieService.getTeams('basketball_nba');
            const team = teams.find(t =>
              t.full_name?.toLowerCase().includes(args.team.toLowerCase()) ||
              t.name?.toLowerCase().includes(args.team.toLowerCase())
            );

            if (!team) {
              messages.push({
                tool_call_id: toolCall.id,
                role: 'tool',
                name: functionName,
                content: JSON.stringify({ error: `Team "${args.team}" not found` })
              });
              continue;
            }

            const season = nbaSeason();

            let typeMap = {
              'ADVANCED': 'advanced',
              'USAGE': 'usage',
              'DEFENSIVE': 'defense',
              'TRENDS': 'base'
            };
            let categoryMap = {
              'ADVANCED': 'general',
              'USAGE': 'general',
              'DEFENSIVE': 'defense',
              'TRENDS': 'general'
            };

            // If player_name provided, get that player's stats specifically
            let playerIds = [];
            if (args.player_name) {
              const playersResp = await ballDontLieService.getPlayersGeneric('basketball_nba', { search: args.player_name, per_page: 5 });
              const players = Array.isArray(playersResp) ? playersResp : (playersResp?.data || []);
              const foundPlayer = players.find(p => 
                `${p.first_name} ${p.last_name}`.toLowerCase().includes(args.player_name.toLowerCase()) &&
                (p.team?.id === team.id || p.team?.full_name?.includes(team.full_name))
              );
              if (foundPlayer) playerIds = [foundPlayer.id];
            }

            // If no specific player found or provided, get team top players
            if (playerIds.length === 0) {
              const activePlayersResp = await ballDontLieService.getPlayersGeneric('basketball_nba', { team_ids: [team.id], per_page: 20 });
              const activePlayers = Array.isArray(activePlayersResp) ? activePlayersResp : (activePlayersResp?.data || []);
              playerIds = activePlayers.slice(0, 10).map(p => p.id);
            }

            const stats = await ballDontLieService.getNbaSeasonAverages({
              category: categoryMap[args.stat_type],
              type: typeMap[args.stat_type],
              season,
              player_ids: playerIds
            });

            // Summarize with player names baked in (prevents LLM misattribution of stats to wrong player)
            const nbaStatsSummary = summarizeNbaPlayerAdvancedStats(stats, args.stat_type, team.full_name);
            messages.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              name: functionName,
              content: nbaStatsSummary
            });
            console.log(`    [Tool Response] ${functionName}: ${nbaStatsSummary.slice(0, 300)}${nbaStatsSummary.length > 300 ? '...' : ''}`);

            // FIX: Track NBA player stats in toolCallHistory for audit
            toolCallHistory.push({
              token: `NBA_PLAYER_STATS:${args.stat_type}`,
              timestamp: Date.now(),
              homeValue: stats?.length || 0,
              awayValue: 'N/A'
            });
          } catch (error) {
            console.error('[Orchestrator] Error fetching NBA player stats:', error.message);
            messages.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              name: functionName,
              content: JSON.stringify({ error: error.message })
            });
          }
          continue;
        }

        // Handle fetch_nhl_player_stats tool
        if (functionName === 'fetch_nhl_player_stats') {
          console.log(`  → [NHL_PLAYER_STATS:${args.stat_type}] for ${args.team}${args.player_name ? ` (${args.player_name})` : ''}`);

          try {
            const { ballDontLieService } = await import('../../ballDontLieService.js');

            let statResult = { stat_type: args.stat_type, team: args.team, data: [] };
            // NHL season: Use starting year of season (e.g., 2025 for 2025-26 season)
            const season = nhlSeason();

            // Get team ID first
            const teams = await ballDontLieService.getTeams('icehockey_nhl');
            const team = teams.find(t =>
              t.full_name?.toLowerCase().includes(args.team.toLowerCase()) ||
              t.tricode?.toLowerCase() === args.team.toLowerCase()
            );

            if (!team && args.stat_type !== 'LEADERS') {
              statResult.error = `Team "${args.team}" not found`;
            } else if (args.stat_type === 'LEADERS') {
              // Get league leaders for a specific stat
              const leaderType = args.leader_type || 'points';
              const leaders = await ballDontLieService.getNhlPlayerStatsLeaders(season, leaderType);
              statResult.data = (leaders || []).slice(0, 10).map(l => ({
                player: l.player?.full_name,
                team: l.player?.teams?.[0]?.full_name || 'Unknown',
                position: l.player?.position_code,
                stat: l.name,
                value: l.value
              }));
            } else {
              // Get players for the team
              const players = await ballDontLieService.getNhlTeamPlayers(team.id, season);

              if (args.stat_type === 'SKATERS') {
                // Filter to skaters (non-goalies)
                const skaters = players.filter(p => p.position_code !== 'G');

                // Get stats for each skater (limit to 10)
                const skatersToFetch = args.player_name
                  ? skaters.filter(p => p.full_name?.toLowerCase().includes(args.player_name.toLowerCase()))
                  : skaters.slice(0, 10);

                const statsPromises = skatersToFetch.map(async (player) => {
                  try {
                    const stats = await ballDontLieService.getNhlPlayerSeasonStats(player.id, season);
                    const statsObj = {};
                    (stats || []).forEach(s => { statsObj[s.name] = s.value; });
                    return {
                      player: player.full_name,
                      position: player.position_code,
                      gamesPlayed: statsObj.games_played || 0,
                      goals: statsObj.goals || 0,
                      assists: statsObj.assists || 0,
                      points: statsObj.points || 0,
                      plusMinus: statsObj.plus_minus || 0,
                      shootingPct: statsObj.shooting_pct ? (statsObj.shooting_pct * 100).toFixed(1) : null,
                      timeOnIcePerGame: statsObj.time_on_ice_per_game || null,
                      powerPlayGoals: statsObj.power_play_goals || 0,
                      powerPlayPoints: statsObj.power_play_points || 0
                    };
                  } catch (e) {
                    return null;
                  }
                });

                const results = await Promise.all(statsPromises);
                statResult.data = results.filter(r => r !== null).sort((a, b) => b.points - a.points);

              } else if (args.stat_type === 'GOALIES') {
                // Filter to goalies
                const goalies = players.filter(p => p.position_code === 'G');

                const goaliesToFetch = args.player_name
                  ? goalies.filter(p => p.full_name?.toLowerCase().includes(args.player_name.toLowerCase()))
                  : goalies.slice(0, 3);

                const statsPromises = goaliesToFetch.map(async (player) => {
                  try {
                    const stats = await ballDontLieService.getNhlPlayerSeasonStats(player.id, season);
                    const statsObj = {};
                    (stats || []).forEach(s => { statsObj[s.name] = s.value; });
                    return {
                      player: player.full_name,
                      gamesPlayed: statsObj.games_played || 0,
                      gamesStarted: statsObj.games_started || 0,
                      wins: statsObj.wins || 0,
                      losses: statsObj.losses || 0,
                      otLosses: statsObj.ot_losses || 0,
                      savePct: statsObj.save_pct ? (statsObj.save_pct * 100).toFixed(1) : null,
                      goalsAgainstAvg: statsObj.goals_against_average?.toFixed(2) || null,
                      shutouts: statsObj.shutouts || 0,
                      saves: statsObj.saves || 0,
                      goalsAgainst: statsObj.goals_against || 0
                    };
                  } catch (e) {
                    return null;
                  }
                });

                const results = await Promise.all(statsPromises);
                statResult.data = results.filter(r => r !== null).sort((a, b) => b.gamesPlayed - a.gamesPlayed);
              }

              if (statResult.data.length === 0) {
                statResult.message = `No ${args.stat_type.toLowerCase()} stats found for ${team?.full_name || args.team}`;
              }
            }

            // Store in history
            toolCallHistory.push({
              token: `NHL_PLAYER_STATS:${args.stat_type}`,
              timestamp: Date.now(),
              homeValue: statResult.data?.length || 0,
              awayValue: 'players',
              rawResult: statResult
            });

            // Summarize player stats for context efficiency
            const playerSummary = summarizePlayerStats(statResult, args.stat_type, args.team || homeTeam);
            messages.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              name: functionName,
              content: playerSummary
            });
          } catch (error) {
            console.error('[Orchestrator] Error fetching NHL player stats:', error.message);
            messages.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              name: functionName,
              content: `NHL PLAYER STATS (${args.stat_type}): Error - ${error.message}`
            });
          }

          continue; // Skip the regular fetch_stats handling
        }

        // Handle fetch_ncaaf_player_stats tool
        if (functionName === 'fetch_ncaaf_player_stats') {
          console.log(`  → [NCAAF_PLAYER_STATS:${args.stat_type}] for ${args.team}${args.player_name ? ` (${args.player_name})` : ''}`);

          try {
            const { ballDontLieService } = await import('../../ballDontLieService.js');

            let statResult = { stat_type: args.stat_type, team: args.team, data: [] };
            // Calculate NCAAF season dynamically
            const season = nflSeason();

            // Get team ID first
            const teams = await ballDontLieService.getTeams('americanfootball_ncaaf');
            const team = teams.find(t =>
              t.full_name?.toLowerCase().includes(args.team.toLowerCase()) ||
              t.abbreviation?.toLowerCase() === args.team.toLowerCase() ||
              t.city?.toLowerCase().includes(args.team.toLowerCase())
            );

            if (!team && args.stat_type !== 'RANKINGS') {
              statResult.error = `Team "${args.team}" not found`;
            } else if (args.stat_type === 'RANKINGS') {
              // Get AP Poll rankings
              const rankings = await ballDontLieService.getNcaafRankings(season);
              statResult.data = (rankings || []).slice(0, 25).map(r => ({
                rank: r.rank,
                team: r.team?.full_name,
                record: r.record,
                points: r.points,
                trend: r.trend
              }));
            } else {
              // Get player season stats for the team
              const seasonStats = await ballDontLieService.getNcaafPlayerSeasonStats(team.id, season);

              if (args.stat_type === 'OFFENSE') {
                // Filter offensive players (QBs, RBs, WRs, TEs)
                let offensePlayers = seasonStats.filter(s =>
                  s.passing_yards > 0 || s.rushing_yards > 0 || s.receiving_yards > 0
                );

                if (args.player_name) {
                  offensePlayers = offensePlayers.filter(s =>
                    s.player?.first_name?.toLowerCase().includes(args.player_name.toLowerCase()) ||
                    s.player?.last_name?.toLowerCase().includes(args.player_name.toLowerCase())
                  );
                }

                statResult.data = offensePlayers.slice(0, 15).map(s => ({
                  player: `${s.player?.first_name} ${s.player?.last_name}`,
                  position: s.player?.position_abbreviation,
                  jersey: s.player?.jersey_number,
                  passingYards: s.passing_yards || 0,
                  passingTDs: s.passing_touchdowns || 0,
                  passingINTs: s.passing_interceptions || 0,
                  qbRating: s.passing_rating?.toFixed(1) || null,
                  rushingYards: s.rushing_yards || 0,
                  rushingTDs: s.rushing_touchdowns || 0,
                  rushingAvg: s.rushing_avg?.toFixed(1) || null,
                  receptions: s.receptions || 0,
                  receivingYards: s.receiving_yards || 0,
                  receivingTDs: s.receiving_touchdowns || 0
                }));

              } else if (args.stat_type === 'DEFENSE') {
                // Filter defensive players
                let defensePlayers = seasonStats.filter(s =>
                  s.total_tackles > 0 || s.sacks > 0 || s.interceptions > 0
                );

                if (args.player_name) {
                  defensePlayers = defensePlayers.filter(s =>
                    s.player?.first_name?.toLowerCase().includes(args.player_name.toLowerCase()) ||
                    s.player?.last_name?.toLowerCase().includes(args.player_name.toLowerCase())
                  );
                }

                statResult.data = defensePlayers.slice(0, 15).map(s => ({
                  player: `${s.player?.first_name} ${s.player?.last_name}`,
                  position: s.player?.position_abbreviation,
                  jersey: s.player?.jersey_number,
                  tackles: s.total_tackles || 0,
                  soloTackles: s.solo_tackles || 0,
                  tacklesForLoss: s.tackles_for_loss || 0,
                  sacks: s.sacks || 0,
                  interceptions: s.interceptions || 0,
                  passesDefended: s.passes_defended || 0
                }));
              }

              if (statResult.data.length === 0) {
                statResult.message = `No ${args.stat_type.toLowerCase()} stats found for ${team?.full_name || args.team}`;
              }
            }

            // Store in history
            toolCallHistory.push({
              token: `NCAAF_PLAYER_STATS:${args.stat_type}`,
              timestamp: Date.now(),
              homeValue: statResult.data?.length || 0,
              awayValue: 'players',
              rawResult: statResult
            });

            // Summarize player stats for context efficiency
            const playerSummary = summarizePlayerStats(statResult, args.stat_type, args.team || homeTeam);
            messages.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              name: functionName,
              content: playerSummary
            });
          } catch (error) {
            console.error('[Orchestrator] Error fetching NCAAF player stats:', error.message);
            messages.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              name: functionName,
              content: `NCAAF PLAYER STATS (${args.stat_type}): Error - ${error.message}`
            });
          }

          continue; // Skip the regular fetch_stats handling
        }

        // Normalize token: Gemini sometimes uses args.stat_type instead of args.token
        const token = args.token || args.stat_type;

        console.log(`  → [${token}] for ${sport}`);

        // Enforce per-sport token menu (prevents cross-sport aliases from polluting NCAAB cards)
        const resolveMenuSport = (s) => {
          const v = String(s || '').toLowerCase();
          if (v.includes('ncaab')) return 'NCAAB';
          if (v.includes('ncaaf')) return 'NCAAF';
          if (v.includes('nfl')) return 'NFL';
          if (v.includes('nba')) return 'NBA';
          if (v.includes('nhl')) return 'NHL';
          // Tool schema uses these values; fall back to NBA
          return 'NBA';
        };

        const menuSport = resolveMenuSport(args.sport || sport);
        const allowedTokens = getTokensForSport(menuSport);
        if (Array.isArray(allowedTokens) && allowedTokens.length > 0 && !allowedTokens.includes(token)) {
          const statResult = {
            error: `Token "${token}" is not allowed for ${menuSport}. Use the provided ${menuSport} token menu.`,
            sport: args.sport || sport,
            token: token,
            allowedTokens: allowedTokens
          };

          // Store the attempted call (helps debugging why something didn't show)
          toolCallHistory.push({
            token: token,
            timestamp: Date.now(),
            homeValue: 'N/A',
            awayValue: 'N/A',
            quality: 'unavailable',
            rawResult: statResult
          });

          messages.push({
            tool_call_id: toolCall.id,
            role: 'tool',
            name: functionName,
            content: `${token}: Not available for ${sport}. Try: ${allowedTokens.slice(0, 5).join(', ')}...`
          });
          continue;
        }

        // Fetch the stats
        // Always use the orchestrator's validated sport key, not args.sport which can be malformed
        // (Gemini sometimes passes sport as "NHL_GOALIE_STATS" instead of "NHL")
        const statResult = await fetchStats(
          sport,
          token,
          homeTeam,
          awayTeam,
          options
        );

        // Extract key values from stat result for structured storage
        const extractStatValues = (result, token) => {
          if (!result) return { home: 'N/A', away: 'N/A' };

          // Try common field patterns
          const homeVal = result.home_value ?? result.homeValue ?? result.home ??
            result[homeTeam] ?? result.home_team ?? 'N/A';
          const awayVal = result.away_value ?? result.awayValue ?? result.away ??
            result[awayTeam] ?? result.away_team ?? 'N/A';

          // For complex results, try to extract meaningful values
          if (homeVal === 'N/A' && typeof result === 'object') {
            // Look for home/away in nested structure
            if (result.data) {
              return extractStatValues(result.data, token);
            }
            // For ratings/efficiency stats, look for numeric values
            const keys = Object.keys(result);
            for (const key of keys) {
              if (key.toLowerCase().includes('home') && typeof result[key] === 'number') {
                return { home: result[key], away: result[keys.find(k => k.toLowerCase().includes('away'))] || 'N/A' };
              }
            }
          }

          return { home: homeVal, away: awayVal };
        };

        const values = extractStatValues(statResult, token);

        // Summarize for context (used both in conversation and data recap for dedup nudges)
        const statSummary = summarizeStatForContext(statResult, token, homeTeam, awayTeam);

        // Determine result quality for coverage tracking
        const hasRealData = statResult && !statResult.error &&
          statResult.source !== 'Not available via API' &&
          (values.home !== 'N/A' || values.away !== 'N/A');
        const resultQuality = hasRealData ? 'available' : 'unavailable';

        // Store with values for structured display + summary for data recap
        toolCallHistory.push({
          token: token,
          timestamp: Date.now(),
          homeValue: values.home,
          awayValue: values.away,
          quality: resultQuality,
          summary: statSummary, // Used in dedup data recap so Gary sees what he already has
          rawResult: statResult // Keep raw result for debugging
        });

        // Add tool result to conversation (SUMMARIZED for better reasoning)
        messages.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          name: functionName,
          content: statSummary
        });
        console.log(`    [Tool Response] ${token}: ${statSummary.slice(0, 300)}${statSummary.length > 300 ? '...' : ''}`);
      }

      // CONTEXT PRUNING: Prevent attention decay on long investigations
      messages = pruneContextIfNeeded(messages, iteration);

      // INVESTIGATION TRACKING: Monitor tool-call breadth for logging/guidance
      
      // Count UNIQUE stats for logging — exclude rejected tokens (quality: 'unavailable')
      const uniqueStats = new Set(toolCallHistory.filter(t => t.token && t.quality !== 'unavailable').map(t => t.token));
      const uniqueStatsCount = uniqueStats.size;
      
      // PRELOADED FACTORS: These are already covered by the Scout Report
      // - INJURIES: Scout report always includes injury data for NFL/NBA/NHL/NCAAB/NCAAF
      // Gary doesn't need to call INJURIES token explicitly - data is already in context
      // ═══════════════════════════════════════════════════════════════════════
      // INVESTIGATION TRACKING SNAPSHOT (guidance only; no auto-transition)
      // ═══════════════════════════════════════════════════════════════════════
      const { categoryCount, totalCalls } = isInvestigationSufficient(toolCallHistory, iteration);
      const lastResponseWasTextOnly = message.content && (!message.tool_calls || message.tool_calls.length === 0);

      // Use persistent flags ONLY (survive context pruning, no false positives from Gemini echoing pass labels)
      const pass25AlreadyInjected = _pass25Injected;
      const pass3AlreadyInjected = _pass3Injected;

      // Log investigation status
      console.log(`[Orchestrator] Investigation: ${categoryCount} categories, ${totalCalls} total calls, textOnly=${lastResponseWasTextOnly}`);

      // INVESTIGATION STALL DETECTION: Track if investigation stops producing new data
      if (categoryCount <= _lastCategoryCount) {
        _investigationStallCount++;
      } else {
        _investigationStallCount = 0;
      }
      _lastCategoryCount = categoryCount;

      // ═══════════════════════════════════════════════════════════════════════
      // NOTE: Flash research briefing is now injected BEFORE Pass 1 (sequential, not parallel).
      // Gary uses findings from Pass 1 context to inform his decision in Pass 2.5.
      // ═══════════════════════════════════════════════════════════════════════
      // PHASE GUIDANCE — marker-based transition; this section only nudges completion
      // ═══════════════════════════════════════════════════════════════════════

      if (!pass25AlreadyInjected) {
        if (_investigationStallCount >= 3) {
          console.log(`[Orchestrator] Pass 1 stall detected at ${categoryCount} categories — waiting for explicit INVESTIGATION COMPLETE marker`);
          const nbaCasePrompt = isNBASport && !isPropsMode
            ? `\n\nBefore INVESTIGATION COMPLETE, include:\nCase for home spread side\nCase for away spread side`
            : '';
          const completionNudge = `You are still in Pass 1. Do not make your pick yet.

Synthesize what you already have from the scout report + research briefing. If you still need more data, call fetch_stats.
${nbaCasePrompt}

When your Pass 1 synthesis is complete, output exactly:
INVESTIGATION COMPLETE`;
          messages.push({ role: 'user', content: completionNudge });
          nextMessageToSend = completionNudge;
        }
      } else if (pass25AlreadyInjected && !pass3AlreadyInjected) {
        // Pass 2.5 evaluation done — inject Pass 3 for final output
        const pass3Content = isPropsMode
          ? buildPass3Props(homeTeam, awayTeam, propContext)
          : buildPass3Unified(homeTeam, awayTeam, options);
        messages.push({ role: 'user', content: pass3Content });
        _pass3Injected = true;
        console.log(`[Orchestrator] Injected Pass 3 (${isPropsMode ? 'Props Evaluation' : 'Final Output'})`);
      }

      // ═══════════════════════════════════════════════════════════════════════
      // PREPARE FUNCTION RESPONSES FOR PERSISTENT SESSION
      // ═══════════════════════════════════════════════════════════════════════
      // Extract tool responses added to messages array during this iteration
      // Convert to format needed for sendToSession
      if (provider === 'gemini' && currentSession) {
          const lastAssistantIdx = messages.findLastIndex(m => m.role === 'assistant');
          const toolResponses = messages.slice(lastAssistantIdx + 1).filter(m => m.role === 'tool');

          if (toolResponses.length > 0) {
            // Convert to Gemini function response format
            pendingFunctionResponses = toolResponses.map(tr => ({
              name: tr.name || 'tool_response',
              content: tr.content
            }));
            console.log(`[Orchestrator] Prepared ${pendingFunctionResponses.length} function response(s) for session`);
          }

          // Check if a pass transition message was injected after tool responses
          // Find user messages added after all tool responses
          const lastToolIdx = messages.findLastIndex(m => m.role === 'tool');
          const userMsgsAfterTools = messages.slice(lastToolIdx + 1).filter(m => m.role === 'user');

          if (userMsgsAfterTools.length > 0) {
            const passMessage = userMsgsAfterTools[userMsgsAfterTools.length - 1].content;
            nextMessageToSend = passMessage;
            console.log(`[Orchestrator] Pass transition queued (will send after function responses processed)`);
          }
      }
      
      // Continue the loop for Gary to process the stats
      continue;
    }

    // No minimum enforcement - Gary calls what he needs organically
    // The prompts encourage comprehensive stat gathering naturally

    // ═══════════════════════════════════════════════════════════════════════
    // TEXT-ONLY RESPONSE HANDLING / PIPELINE ENFORCEMENT
    // Pass 2.5 transition is marker-based only:
    // - inject Pass 2.5 only when Gary outputs INVESTIGATION COMPLETE
    // - otherwise keep Pass 1 active with a completion reminder
    // ═══════════════════════════════════════════════════════════════════════
    if (!_pass25Injected && iteration < effectiveMaxIterations) {
      const { categoryCount: gateCategories, totalCalls: gateCalls } = isInvestigationSufficient(toolCallHistory, iteration);
      const markedComplete = hasInvestigationCompleteMarker(message.content || '');

      if (markedComplete) {
        if (isNBASport && !isPropsMode) {
          const caseCheck = validateNbaSpreadCases(message.content || '', homeTeam, awayTeam, spread);
          if (!caseCheck.valid) {
            if (!_nbaCaseRetryUsed) {
              _nbaCaseRetryUsed = true;
              const retryMsg = `You're close, but Pass 1 is not complete yet.

Before INVESTIGATION COMPLETE, include BOTH sections with substantive content:
Case for home spread side
Case for away spread side

Each case must be 2-3 paragraphs, grounded in your investigation data, and explain why that side is advantaged relative to this spread number tonight. Focus on price-relative reasoning for this game, not team-quality summaries. Then output:
INVESTIGATION COMPLETE`;
              console.log(`[Orchestrator] NBA bilateral case gate retry (${caseCheck.reason}; homeLen=${caseCheck.homeLen}, awayLen=${caseCheck.awayLen})`);
              messages.push({ role: 'assistant', content: message.content });
              messages.push({ role: 'user', content: retryMsg });
              nextMessageToSend = retryMsg;
              continue;
            }

            throw new Error(`[HARD FAIL] NBA Pass 1 bilateral spread cases missing or too short after retry (${caseCheck.reason}; homeLen=${caseCheck.homeLen}, awayLen=${caseCheck.awayLen}).`);
          }
        }

        // Explicit completion marker (text-only path) — inject Pass 2.5
        messages.push({ role: 'assistant', content: message.content });
        console.log(`[Orchestrator] Pipeline gate: INVESTIGATION COMPLETE received — injecting Pass 2.5 (${gateCategories} categories, ${gateCalls} calls)`);
        const pass25Content = (isPropsMode
          ? buildPass25PropsMessage(homeTeam, awayTeam, sport)
          : buildPass25Message(homeTeam, awayTeam, sport, spread, options.pass25DecisionGuards || ''));
        messages.push({ role: 'user', content: pass25Content });
        nextMessageToSend = pass25Content;
        _pass25Injected = true;
        _pass25JustInjected = true;
        continue;
      }

      // No completion marker yet — keep Pass 1 active
      console.log(`[Orchestrator] Pass 1 remains active — waiting for INVESTIGATION COMPLETE (${gateCategories} categories, ${gateCalls} calls)`);
      messages.push({ role: 'assistant', content: message.content });
      const nbaCasePrompt = isNBASport && !isPropsMode
        ? `\n\nBefore INVESTIGATION COMPLETE, include:\nCase for home spread side\nCase for away spread side`
        : '';
      messages.push({
        role: 'user',
        content: `You are still in Pass 1. Do not make your pick yet.

Synthesize from scout report + research briefing. If you need more data, call fetch_stats.
${nbaCasePrompt}

When complete, output exactly:
INVESTIGATION COMPLETE`
      });
      continue;
    }

    // Use persistent flags (no false positives from message scanning)
    if (_pass25Injected && !_pass3Injected && iteration < effectiveMaxIterations) {
      // Gary answered Pass 2.5 — inject Pass 3 for final output directly
      messages.push({ role: 'assistant', content: message.content });

      const pass3Content = isPropsMode
        ? buildPass3Props(homeTeam, awayTeam, propContext)
        : buildPass3Unified(homeTeam, awayTeam, options);
      messages.push({ role: 'user', content: pass3Content });
      nextMessageToSend = pass3Content;
      _pass3Injected = true;
      console.log(`[Orchestrator] Injected Pass 3 - ${isPropsMode ? 'Props Evaluation' : 'Final Output'} (after Pass 2.5 evaluation)`);

      continue;
    }

    // Gary is done
    console.log(`[Orchestrator] Gary finished analysis (${finishReason})`);

    // ─── Props mode: parse with parsePropsResponse ───────────────────────
    if (isPropsMode) {
      const propsParsed = parsePropsResponse(message.content, null);
      if (propsParsed && propsParsed.length > 0) {
        return {
          picks: propsParsed,
          toolCallHistory, iterations: iteration,
          homeTeam, awayTeam, sport,
          rawAnalysis: message.content,
          isProps: true
        };
      }
      // Props response didn't parse — retry up to 2 times, then let max-iterations fallback handle it
      propsRetryCount++;
      if (propsRetryCount <= 2 && iteration < effectiveMaxIterations) {
        console.log(`[Orchestrator] ⚠️ Props response didn't parse (attempt ${propsRetryCount}/2) - requesting finalize_props tool call...`);
        messages.push({ role: 'assistant', content: message.content });
        const nudge = propsRetryCount === 1
          ? 'You MUST call the finalize_props tool to submit your picks. Do NOT write JSON in text — use the finalize_props function call with your 2 best picks.'
          : 'CRITICAL: Call the finalize_props function NOW. Your analysis is complete. Submit your 2 picks by calling finalize_props({ picks: [{ player, team, prop, line, bet, odds, confidence, rationale, key_stats }] }). This is a TOOL CALL, not text output.';
        messages.push({ role: 'user', content: nudge });
        nextMessageToSend = nudge;
        continue;
      }
      // After 2 nudges, skip straight to max-iterations fallback (don't waste iterations)
      console.log(`[Orchestrator] ⚠️ Props finalize_props not called after ${propsRetryCount} retries — jumping to max-iterations fallback`);
      break;
    }

    if (_pass25Injected && !_pass3Injected && iteration < effectiveMaxIterations) {
      console.log(`[Orchestrator] ⚠️ PIPELINE GATE: Pick attempted before Pass 3 — injecting ${isPropsMode ? 'props evaluation' : 'final output'} pass`);
      messages.push({ role: 'assistant', content: message.content });
      const pass3Content = isPropsMode
        ? buildPass3Props(homeTeam, awayTeam, propContext)
        : buildPass3Unified(homeTeam, awayTeam, options);
      messages.push({ role: 'user', content: pass3Content });
      nextMessageToSend = pass3Content;
      _pass3Injected = true;
      continue;
    }

    // ─── Game mode: check for truncation, then parse ──────────────────────────
    // If response was truncated by MAX_TOKENS, retry immediately — don't parse broken JSON
    if (finishReason === 'max_tokens' && iteration < effectiveMaxIterations) {
      console.log(`[Orchestrator] ⚠️ Response truncated (MAX_TOKENS) — requesting complete output...`);
      messages.push({ role: 'assistant', content: message.content });
      messages.push({
        role: 'user',
        content: `Your response was CUT OFF mid-output (token limit reached). Output your COMPLETE pick JSON again — shorter rationale is fine but it must be COMPLETE (not truncated). Use stat abbreviations (AdjEM, ORtg, DRtg, eFG%) to save space.`
      });
      continue;
    }

    let pick = parseGaryResponse(message.content, homeTeam, awayTeam, sport, options.game || {});

    // If pick is null (invalid rationale), retry once with explicit instruction
    if (!pick && iteration < effectiveMaxIterations) {
      // Detect if the issue was truncation (rationale cut mid-word) vs missing/placeholder
      const truncatedRationale = message.content && /[a-zA-Z0-9]$/.test((message.content.match(/"rationale"\s*:\s*"([\s\S]*?)(?:"|$)/)?.[1] || '').trim());
      console.log(`[Orchestrator] ⚠️ ${truncatedRationale ? 'Truncated' : 'Invalid/missing'} rationale - requesting ${truncatedRationale ? 'concise' : 'full'} analysis...`);

      messages.push({
        role: 'assistant',
        content: message.content
      });

      messages.push({
        role: 'user',
        content: truncatedRationale
          ? `Your rationale was CUT OFF mid-sentence (token limit). Rewrite your pick JSON with a CONCISE but COMPLETE rationale — 2-3 paragraphs max. Use stat abbreviations (AdjEM, ORtg, DRtg, eFG%, TS%) to save space. The rationale MUST end with a complete sentence.`
          : `Your rationale is too short. Provide your FULL analysis:
1. "Gary's Take\\n\\n" header, then open with an announcer-style scene-setter (1-2 sentences setting the stage)
2. 3-4 paragraphs (~300-400 words) explaining your reasoning with key stats
3. Lead with your thesis — why you like this side tonight

Output your complete pick JSON with the full rationale in the "rationale" field.`
      });

      continue; // Retry
    }

    if (pick) {
      pick.toolCallHistory = toolCallHistory;
      pick.iterations = iteration;
      pick.rawAnalysis = message.content;

      return pick;
    } else {
      // If no valid JSON after retry, return the raw analysis
      return {
        error: 'Could not parse pick from response',
        rawAnalysis: message.content,
        toolCallHistory,
        iterations: iteration,
        homeTeam,
        awayTeam,
        sport
      };
    }
  }

  // Max iterations reached
  // For props mode: only attempt finalize if pipeline has completed through Pass 2.5
  // If pipeline didn't reach Pass 2.5, the analysis is incomplete — fail honestly
  if (isPropsMode) {
    if (!_pass25Injected) {
      console.error(`[Orchestrator] ❌ Max iterations reached but pipeline incomplete — Pass 2.5 (evaluation) never completed for ${awayTeam} @ ${homeTeam}`);
      console.error(`[Orchestrator] Pipeline state: pass25=${_pass25Injected}, pass3=${_pass3Injected}`);
      return {
        error: `Props pipeline incomplete — Pass 2.5 (evaluation) never completed within max iterations`,
        toolCallHistory, iterations: iteration,
        homeTeam, awayTeam, sport, isProps: true,
        _pipelineState: { pass25: _pass25Injected, pass3: _pass3Injected }
      };
    }
    console.log(`[Orchestrator] ⚠️ Max iterations (${effectiveMaxIterations}) reached in props mode - injecting final props prompt...`);
    const pass3PropsContent = buildPass3Props(homeTeam, awayTeam, propContext);
    messages.push({ role: 'user', content: pass3PropsContent });

    if (!currentSession) {
      throw new Error('No active Gemini session available for props finalization');
    }

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const sessionResponse = await sendToSessionWithRetry(
          currentSession,
          attempt === 1 ? pass3PropsContent : 'You have completed your analysis. Now call the finalize_props tool with your 2 best prop picks based on everything you investigated. Do not request more stats.'
        );
        const finalMessage = {
          content: sessionResponse.content,
          tool_calls: sessionResponse.toolCalls
        };

        // Check for finalize_props tool call
        if (finalMessage?.tool_calls?.length) {
          const propsCall = finalMessage.tool_calls.find(tc => tc.function?.name === 'finalize_props');
          if (propsCall) {
            const args = typeof propsCall.function.arguments === 'string'
              ? JSON.parse(propsCall.function.arguments)
              : propsCall.function.arguments;
            return {
              picks: args.picks || [],
              toolCallHistory, iterations: iteration + attempt,
              homeTeam, awayTeam, sport,
              rawAnalysis: finalMessage.content || '',
              isProps: true
            };
          }
        }

        // Try parsing text response
        if (finalMessage?.content) {
          const propsParsed = parsePropsResponse(finalMessage.content, null);
          if (propsParsed && propsParsed.length > 0) {
            return {
              picks: propsParsed,
              toolCallHistory, iterations: iteration + attempt,
              homeTeam, awayTeam, sport,
              rawAnalysis: finalMessage.content,
              isProps: true
            };
          }
          // Add response and retry with explicit instruction
          messages.push({ role: 'assistant', content: finalMessage.content });
          messages.push({ role: 'user', content: 'You have completed your analysis. Now call the finalize_props tool with your 2 best prop picks based on everything you investigated. Do not request more stats.' });
          console.log(`[Orchestrator] Props synthesis attempt ${attempt} - no finalize_props call, retrying...`);
        }
      } catch (propsError) {
        console.error(`[Orchestrator] Props synthesis attempt ${attempt} error:`, propsError.message);
      }
    }

    return {
      error: 'Could not extract props after max iterations',
      toolCallHistory, iterations: iteration,
      homeTeam, awayTeam, sport, isProps: true
    };
  }

  // Game mode: Pipeline did not complete within max iterations — NO synthesis fallback
  // Every pick must come from the real pipeline (Pass 1→2.5→3). If the pipeline
  // can't complete, this game is reported as a failure. No fake/synthesized picks.
  console.error(`[Orchestrator] MAX ITERATIONS (${effectiveMaxIterations}) reached without completing pipeline for ${awayTeam} @ ${homeTeam}`);
  console.error(`[Orchestrator] Pipeline state: pass25=${_pass25Injected}, pass3=${_pass3Injected}`);
  console.error(`[Orchestrator] Stats gathered: ${toolCallHistory.length}, iterations: ${iteration}`);
  return {
    error: 'Pipeline did not complete within max iterations — no pick generated',
    toolCallHistory,
    iterations: iteration,
    homeTeam,
    awayTeam,
    sport,
    _pipelineState: { pass25: _pass25Injected, pass3: _pass3Injected },
    _statsGathered: toolCallHistory.length
  };
}

/**
 * Parse Gary's response to extract the pick JSON
 * 
 * IMPORTANT: We try to extract a valid pick from JSON FIRST.
 * Pass indicators are only checked if no valid pick is found in JSON.
 * This prevents false positives like "moving on" in analysis from triggering PASS.
 */
