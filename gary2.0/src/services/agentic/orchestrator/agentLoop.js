import { CONFIG, GEMINI_PRO_MODEL, GEMINI_PRO_FALLBACK, validateGeminiModel, RESEARCH_BRIEFING_TIMEOUT_MS } from './orchestratorConfig.js';
import { createGeminiSession, sendToSession, sendToSessionWithRetry } from './sessionManager.js';
import { buildFlashSteelManCases, buildFlashSteelManPropsCases, extractTextualSummaryForModelSwitch, ADVISOR_TIMEOUT_MS, buildFlashResearchBriefing } from './flashAdvisor.js';
import { buildPass1Message, buildPass25Message, buildPass25PropsMessage, buildPass3Unified, buildPass3Props, FINALIZE_PROPS_TOOL, PROPS_PICK_SCHEMA } from './passBuilders.js';
import { parseGaryResponse, parsePropsResponse, normalizePickFormat, determineCurrentPass } from './responseParser.js';
import { isInvestigationSufficient, summarizeStatForContext, formatNum, detectBilateralAnalysis, buildAdvisorPreamble, buildAdvisorPropsPreamble, formatPct, summarizePlayerGameLogs, summarizePlayerStats, summarizeNbaPlayerAdvancedStats, pruneContextIfNeeded, normalizeSportToLeague, MAX_CONTEXT_MESSAGES, PRUNE_AFTER_ITERATION } from './orchestratorHelpers.js';
import { fetchStats, clearStatRouterCache } from '../tools/statRouters/index.js';
import { getConstitution } from '../constitution/index.js';
import { ballDontLieService } from '../../ballDontLieService.js';
import { nbaSeason, nhlSeason, nflSeason, ncaabSeason } from '../../../utils/dateUtils.js';
import { getTokensForSport, toolDefinitions } from '../tools/toolDefinitions.js';

/**
 * Run the agent loop - handles tool calls and conversation flow
 *
 * GEMINI 3 ARCHITECTURE (2026 Update):
 * - Uses PERSISTENT chat sessions for automatic thought signature handling
 * - Flash session for Investigation + Steel Man (Pass 1-2)
 * - Pro session for Grading + Final Decision (Pass 2.5-3) for NBA/NFL/NHL
 * - NCAAB uses Pro for Pass 2.5-3 (same quality as NBA)
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Props mode setup (must be before session creation so activeTools is available)
  const isPropsMode = options.mode === 'props';
  console.log(`[Orchestrator] Starting ${sport} — 3.1 Pro (main) + Flash (research${isPropsMode ? '' : ' + Steel Man cases'})${isPropsMode ? ' + Flash (props advisor)' : ''}`);

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
  // DUAL-MODEL: Pro session runs investigation → evaluation → pick. Flash builds Steel Man cases independently.
  // Pro never writes bilateral cases = no confirmation bias. Flash is also quota-429 fallback.
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

  // Messages array for state tracking (pass detection, steel man capture)
  // Note: For Gemini, actual API calls go through the persistent session
  let messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage }
  ];

  let iteration = 0;
  const toolCallHistory = [];

  // Store full steel man cases for transparency/debugging
  let steelManCases = {
    homeTeamCase: null,
    awayTeamCase: null,
    capturedAt: null
  };
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PERSISTENT SESSION STATE TRACKING
  // ═══════════════════════════════════════════════════════════════════════════
  // Track what message to send next (for persistent session approach)
  // First iteration: send userMessage
  // Subsequent: send function responses OR pass transition messages
  let nextMessageToSend = userMessage;
  let pendingFunctionResponses = []; // Batched function responses to send
  // Persistent pass-injection flags (survive context pruning)
  let _pass2Injected = false;
  let _pass2Delivered = false; // True only when Pass 2 is actually SENT to the Gemini session (not just pushed to messages)
  let _pass25Injected = false;
  let _pass25JustInjected = false; // True for ONE iteration after Pass 2.5 is injected (for response logging)

  // Investigation stall detection — force Pass 2 if investigation stops producing new data
  let _lastCategoryCount = 0;
  let _investigationStallCount = 0;
  let _pass3Injected = false;
  let _extraIterationsUsed = 0; // Guard against infinite loop from iteration-- (max 2)

  // Flash Advisor state — independent case builder (eliminates confirmation bias)
  let _flashCasesPromise = null;     // Promise for Flash's case building
  let _flashCasesReady = false;      // True when Flash has returned cases (or failed)
  let _flashCases = null;            // { homeTeamCase, awayTeamCase, flashContent }
  let _flashStartedAt = null;        // Timestamp for logging

  // Flash Research Briefing state — comprehensive pre-game briefing (factual findings only)
  // Flash completes BEFORE Gary starts. Findings injected before Pass 1 and re-surfaced at Pass 2.5.
  let _researchBriefingReady = false;    // True when briefing has returned (or failed)
  let _researchBriefing = null;          // Briefing text from Flash (factual findings)
  const _flashCoverageTokens = [];       // Flash's called tokens — ONLY for pipeline gate coverage, NOT dedup or statsData

  // Pro's Own Assessment — used ONLY for props mode (game picks use Flash's initial read instead)
  let _proAssessment = null;            // Pro's honest assessment text (props only)
  let _proAssessmentRequested = false;  // True after we ask Pro for assessment (props only)

  const effectiveMaxIterations = CONFIG.maxIterations;

  // ═══════════════════════════════════════════════════════════════════════
  // FLASH ADVISOR HELPER — reusable spawn logic (captures closure variables)
  // ═══════════════════════════════════════════════════════════════════════
  function spawnFlashAdvisor(reason, coverageInfo = '') {
    if (_flashCasesPromise) {
      console.log(`[Orchestrator] Flash advisor already spawned (${reason})`);
      return; // Already running
    }

    console.log(`[Orchestrator] 🎯 Spawning advisor (Gemini 3 Pro): ${reason} ${coverageInfo}`);
    _flashStartedAt = Date.now();

    _flashCasesPromise = Promise.race([
      isPropsMode
        ? buildFlashSteelManPropsCases(systemPrompt, messages, toolCallHistory, sport, homeTeam, awayTeam, propContext)
        : buildFlashSteelManCases(systemPrompt, messages, toolCallHistory, sport, homeTeam, awayTeam, options.spread ?? null),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Advisor timeout')), ADVISOR_TIMEOUT_MS))
    ]).then(cases => {
      _flashCases = cases;
      _flashCasesReady = true;
      const elapsed = ((Date.now() - _flashStartedAt) / 1000).toFixed(1);
      if (cases) {
        if (isPropsMode) {
          console.log(`[Advisor] ✅ Props cases received in ${elapsed}s (${cases.candidateCases?.length || 0} chars)`);
        } else {
          console.log(`[Advisor] ✅ Cases received in ${elapsed}s (home: ${cases.homeTeamCase?.length || 0} chars, away: ${cases.awayTeamCase?.length || 0} chars)`);
        }
      } else {
        console.log(`[Advisor] ⚠️ Failed after ${elapsed}s — Pro will write its own cases`);
      }
      return cases;
    }).catch(err => {
      _flashCasesReady = true;
      _flashCases = null;
      console.error(`[Advisor] ❌ Error: ${err.message} — pick will fail (no fallback to biased cases)`);
      return null;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // AWAIT FLASH RESEARCH BRIEFING — completes BEFORE Gary starts
  // ═══════════════════════════════════════════════════════════════════════
  // Flash reads the scout report, identifies gaps, and uses fetch_stats
  // to investigate deeper. Gary waits for Flash to finish so he has the
  // full per-factor findings from the very first iteration.
  if (options.scoutReport && !isPropsMode) {
    console.log(`[Research Briefing] 🔬 Running Flash research briefing (Gemini Flash with tools) — Gary waits for completion`);
    try {
      const briefingResult = await Promise.race([
        buildFlashResearchBriefing(options.scoutReport, sport, homeTeam, awayTeam, options),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Research briefing timeout')), RESEARCH_BRIEFING_TIMEOUT_MS))
      ]);
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

        // Store Flash's Steel Man cases (built during research — eliminates separate 3 Pro advisor)
        if (briefingResult.steelManCases) {
          _flashCases = briefingResult.steelManCases;
          _flashCasesReady = true;
          _flashCasesPromise = Promise.resolve(_flashCases); // Prevent spawnFlashAdvisor from running
          console.log(`[Orchestrator] ✅ Flash built Steel Man cases during research (home: ${_flashCases.homeTeamCase?.length || 0} chars, away: ${_flashCases.awayTeamCase?.length || 0} chars)`);
        } else {
          console.warn(`[Orchestrator] ⚠️ Flash did not produce Steel Man cases — advisor will be spawned as fallback`);
        }
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
      const homeSpread = spread ? `${spread >= 0 ? '+' : ''}${spread.toFixed(1)}` : '';
      const awaySpread = spread ? `${-spread >= 0 ? '+' : ''}${(-spread).toFixed(1)}` : '';
      const isNHL = sport === 'icehockey_nhl' || sport === 'NHL';

      const spreadLine = isNHL
        ? `The line is ${homeTeam} (home) vs ${awayTeam} (away) — moneyline.`
        : `The spread is ${homeTeam} ${homeSpread} / ${awayTeam} ${awaySpread}.`;

      const briefingBlock = `\n\n## RESEARCH BRIEFING (from your research assistant)\n\nYour research assistant investigated this matchup. Here are their findings:\n\n${_researchBriefing}\n\n---\n\nYou now know both teams — their stats, their form, their injuries, their context. You're fully informed. This is the part where you do what a human bettor does: look at the number.\n\n${spreadLine}\n\nEvery bettor looks at the data and then looks at the line. Use your tools to investigate the spread — pull whatever stats help you figure out if this line is right, wrong, or close. This may still require deeper investigation of the teams, players, matchups — use your tools to gather whatever you need.\n\nYour final decision comes later. Right now, investigate.`;
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

    // Get the spread for Pass 2/2.5 context injection (available throughout loop)
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
            (nextMessageToSend.includes('PASS 2') || nextMessageToSend.includes('STEEL MAN') ||
             nextMessageToSend.includes('PASS 2.5') || nextMessageToSend.includes('CASE REVIEW') ||
             nextMessageToSend.includes('CASE EVALUATION') || nextMessageToSend.includes('investigation is complete'));
          
          if (!sessionResponse.toolCalls && hasQueuedPassMessage) {
            console.log(`[Orchestrator] 📝 Sending queued pass message after function responses`);
            // Send the pass message as follow-up
            sessionResponse = await sendToSessionWithRetry(currentSession, nextMessageToSend);
            // Track Pass 2 delivery (not just injection)
            if (_pass2Injected && !_pass2Delivered && nextMessageToSend.includes('PASS 2') && !nextMessageToSend.includes('PASS 2.5')) {
              _pass2Delivered = true;
              console.log(`[Orchestrator] ✅ Pass 2 DELIVERED to session`);
            }
            nextMessageToSend = null; // Clear after sending
          }

        } else {
          // Send text message (user message or pass transition)
          if (!nextMessageToSend) {
            console.log(`[Orchestrator] ⚠️ No message to send - using fallback prompt`);
            nextMessageToSend = `Continue your investigation. Use fetch_stats to gather more data on this matchup.`;
          }
          sessionResponse = await sendToSessionWithRetry(currentSession, nextMessageToSend);
          // Track Pass 2 delivery (not just injection)
          if (_pass2Injected && !_pass2Delivered && nextMessageToSend && nextMessageToSend.includes('PASS 2') && !nextMessageToSend.includes('PASS 2.5')) {
            _pass2Delivered = true;
            console.log(`[Orchestrator] ✅ Pass 2 DELIVERED to session`);
          }
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

        // Capture Pro's honest assessment — PROPS MODE ONLY (game picks use Flash's initial read instead)
        if (isPropsMode && _proAssessmentRequested && !_proAssessment &&
            message.content && (!message.tool_calls || message.tool_calls.length === 0) &&
            message.content.length > 200 && !_pass25Injected) {
          _proAssessment = message.content;
          console.log(`[Orchestrator] Pro's props assessment captured (${_proAssessment.length} chars)`);
        }

      } catch (error) {
        // Handle quota errors with model fallback
        // Flash -> Pro fallback (Flash hit rate limit, use Pro)
        if (error.isQuotaError && currentModelName === 'gemini-3-flash-preview') {
          console.log(`[Orchestrator] ⚠️ Flash quota exceeded - falling back to Pro`);

          // Extract textual context to pass to Pro
          const textualContext = extractTextualSummaryForModelSwitch(messages, steelManCases, toolCallHistory);
          if (textualContext.length < 2000) {
            console.warn(`[Orchestrator] LOW CONTEXT WARNING: Only ${textualContext.length} chars for Flash→Pro switch`);
          }

          // Create new Pro session for fallback (use 3.1 Pro primary)
          currentSession = createGeminiSession({
            modelName: GEMINI_PRO_MODEL,
            systemPrompt: systemPrompt + '\n\n' + textualContext,
            tools: currentPass === 'evaluation' ? [] : activeTools,
            thinkingLevel: 'high'
          });
          currentModelName = GEMINI_PRO_MODEL;

          console.log(`[Orchestrator] 🔄 Created fallback Pro session, retrying...`);

          // Retry with new session
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
        // 3.1 Pro -> 3 Pro fallback (3.1 Pro hit rate limit, try original Pro)
        else if (error.isQuotaError && currentModelName === GEMINI_PRO_MODEL) {
          console.log(`[Orchestrator] ⚠️ 3.1 Pro quota exceeded - falling back to 3 Pro`);

          const textualContext = extractTextualSummaryForModelSwitch(messages, steelManCases, toolCallHistory);
          if (textualContext.length < 2000) {
            console.warn(`[Orchestrator] LOW CONTEXT WARNING: Only ${textualContext.length} chars for 3.1 Pro→3 Pro switch`);
          }

          currentSession = createGeminiSession({
            modelName: GEMINI_PRO_FALLBACK,
            systemPrompt: systemPrompt + '\n\n' + textualContext,
            tools: currentPass === 'evaluation' ? [] : activeTools,
            thinkingLevel: 'high'
          });
          currentModelName = GEMINI_PRO_FALLBACK;

          console.log(`[Orchestrator] 🔄 Created fallback 3 Pro session, retrying...`);

          // Retry with new session
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
        // 3 Pro -> Flash fallback (both Pro models hit quota, last resort)
        else if (error.isQuotaError && currentModelName === GEMINI_PRO_FALLBACK) {
          console.log(`[Orchestrator] ⚠️ Both Pro models quota exceeded - falling back to Flash (last resort)`);

          const textualContext = extractTextualSummaryForModelSwitch(messages, steelManCases, toolCallHistory);
          currentSession = createGeminiSession({
            modelName: 'gemini-3-flash-preview',
            systemPrompt: systemPrompt + '\n\n' + textualContext,
            tools: currentPass === 'evaluation' ? [] : activeTools,
            thinkingLevel: 'high'
          });
          currentModelName = 'gemini-3-flash-preview';

          console.log(`[Orchestrator] 🔄 Created fallback Flash session, retrying...`);

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

    // STEEL MAN CAPTURE: Extract and store Gary's bilateral analysis when it appears
    // Cases can appear in any iteration (typically around iteration 4-5), not just iteration 2
    // Skip when Flash advisor is building cases — Pro won't write its own bilateral cases
    if (message.content && !steelManCases.capturedAt && !_flashCasesPromise) {
      const content = message.content;
      
      // Extract FULL "Case for [Team]" sections using improved regex
      // Match "CASE FOR [Team Name]" followed by content until the next "CASE FOR" or end of string
      // NOTE: Do NOT use ###/--- as delimiters — Gary's case content can contain markdown subheadings
      const casePattern = /(?:\*\*)?(?:Case for|CASE FOR|Analysis for|ANALYSIS FOR)[:\s*]+([^\n*]+)[\s\S]*?(?=(?:\*\*)?(?:Case for|CASE FOR|Analysis for|ANALYSIS FOR)|$)/gi;
      const caseMatches = [...content.matchAll(casePattern)];
      
      if (caseMatches.length >= 2) {
        // Determine which case is home vs away using "CASE FOR [Team]" header
        // (checking full body fails because bilateral cases mention BOTH teams)
        const fullCases = caseMatches.slice(0, 2).map(match => match[0].trim());

        const caseForPattern = /case for\s+(.+?)(?:\s*[\(\[-]|\n|$)/i;
        const case1ForMatch = fullCases[0].match(caseForPattern);
        const case1ForTeam = case1ForMatch ? case1ForMatch[1].trim().toLowerCase() : '';

        const homeTeamLower = homeTeam.toLowerCase();
        const awayTeamLower = awayTeam.toLowerCase();
        const homeLastWord = homeTeamLower.split(' ').pop();
        const awayLastWord = awayTeamLower.split(' ').pop();

        let case1IsHome;
        if (case1ForTeam) {
          const homeMatch = case1ForTeam.includes(homeLastWord);
          const awayMatch = case1ForTeam.includes(awayLastWord);
          case1IsHome = homeMatch && !awayMatch;
          if (homeMatch === awayMatch) {
            const homeHits = homeTeamLower.split(' ').filter(w => w.length > 3 && case1ForTeam.includes(w)).length;
            const awayHits = awayTeamLower.split(' ').filter(w => w.length > 3 && case1ForTeam.includes(w)).length;
            case1IsHome = homeHits > awayHits;
          }
        } else {
          const header = fullCases[0].substring(0, 100).toLowerCase();
          case1IsHome = header.includes(homeLastWord) && !header.includes(awayLastWord);
        }

        if (case1IsHome) {
          steelManCases.homeTeamCase = fullCases[0];
          steelManCases.awayTeamCase = fullCases[1];
        } else {
          steelManCases.awayTeamCase = fullCases[0];
          steelManCases.homeTeamCase = fullCases[1];
        }
        steelManCases.capturedAt = new Date().toISOString();
        steelManCases.source = 'pro_self'; // Gary wrote these himself (not from advisor)

        const homeChars = steelManCases.homeTeamCase?.length || 0;
        const awayChars = steelManCases.awayTeamCase?.length || 0;
        console.log(`[Orchestrator] Steel Man cases captured (iteration ${iteration}, ${homeChars}+${awayChars} chars)`);
      }
    }

    // Handle empty response from Gemini (common when model is confused)
    if (provider === 'gemini' && !message.content && !message.tool_calls) {
      // Check what pass we're in to provide appropriate nudge
      const pass2WasInjected = _pass2Injected;
      const pass25WasInjected = messages.some(m => m.content?.includes('PASS 2.5') || m.content?.includes('CASE REVIEW') || m.content?.includes('CASE EVALUATION'));
      
      let nudgeContent;
      
      if (pass25WasInjected) {
        // Pass 2.5 already sent - need decision, not stats
        console.log(`[Orchestrator] ⚠️ Gemini returned empty response after Pass 2.5 - requesting decision output`);
        nudgeContent = `You didn't provide a response. Review the advisor cases and make your pick in natural language. Do NOT output JSON — the final formatted output comes in the next step.`;
      } else if (pass2WasInjected) {
        // Pass 2 already sent — investigation is over
        if (isPropsMode) {
          console.log(`[Orchestrator] ↩️ Gemini returned empty response after Pass 2 — nudging for bilateral prop cases`);
          nudgeContent = `You didn't provide a response. You have enough data (${toolCallHistory.length} stats gathered).

**WRITE YOUR BILATERAL PROP CASES NOW:**
For your top 3-4 prop candidates, build the OVER case and the UNDER case using the data you already have.

Do NOT request more stats. Write your analysis NOW.`;
        } else {
          console.log(`[Orchestrator] ↩️ Gemini returned empty response after Pass 2 — nudging for honest assessment (Flash building cases)`);
          nudgeContent = `You didn't provide a response. You have enough data (${toolCallHistory.length} stats gathered). An advisor is building bilateral Steel Man cases from your investigation data.

Write YOUR honest read on this game — what are the key dynamics, what matters most for how this game plays out tonight? Cite the key findings from your investigation.

Do NOT pick a side. Do NOT request more stats. Do NOT write Steel Man cases — they are being built independently.`;
        }
      } else {
        // Still in investigation phase — check investigation breadth
        const { sufficient, categoryCount, totalCalls } = isInvestigationSufficient(toolCallHistory, iteration);

        if (sufficient) {
          // Enough investigation — let Gary proceed
          console.log(`[Orchestrator] Gary has ${totalCalls} stats across ${categoryCount} categories — pushing to proceed`);
          nudgeContent = `You have ${totalCalls} stats gathered across ${categoryCount} categories. Proceed to your analysis NOW.`;
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
        const pass2Injected = _pass2Injected;
        const pass25Injected = messages.some(m => m.content?.includes('PASS 2.5') || m.content?.includes('CASE REVIEW') || m.content?.includes('CASE EVALUATION'));

        let nudgeMessage;
        if (pass25Injected) {
          nudgeMessage = `ALL ${message.tool_calls.length} stats you requested were already gathered. DO NOT request more stats.${dataRecap}

Review the advisor cases and make your pick in natural language. Do NOT output JSON — the final formatted output comes in the next step.`;
        } else if (pass2Injected) {
          if (isPropsMode) {
            nudgeMessage = `ALL ${message.tool_calls.length} stats you requested were already gathered. DO NOT request more stats.${dataRecap}

Write your bilateral prop cases NOW using the data above.`;
          } else {
            nudgeMessage = `ALL ${message.tool_calls.length} stats you requested were already gathered. DO NOT request more stats.${dataRecap}

An advisor is building bilateral Steel Man cases from your investigation data. Write YOUR honest read on this game — what are the key dynamics and what matters most for tonight? Do NOT pick a side. Do NOT write Steel Man cases yourself.`;
          }
        } else {
          // Still in investigation phase — check if investigation has stalled
          const { sufficient, categoryCount, totalCalls } = isInvestigationSufficient(toolCallHistory, iteration);
          _investigationStallCount++;

          console.log(`[Orchestrator] All-duplicates: ${totalCalls} stats, ${categoryCount} categories, stall=${_investigationStallCount}`);

          // STALL BREAK: If stuck for 3+ iterations with all duplicates and sufficient investigation
          if (_investigationStallCount >= 3 && sufficient && !_pass2Injected) {
            console.log(`[Orchestrator] STALL BREAKER (all-dupes): Investigation stalled at ${categoryCount} categories for ${_investigationStallCount} iterations`);
            spawnFlashAdvisor('stall break (all-dupes)', `(${categoryCount} categories, ${totalCalls} calls)`);
            _pass2Injected = true;
            if (isPropsMode) {
              _proAssessmentRequested = true;
              messages.push({ role: 'user', content: `Your investigation has gathered ${totalCalls} stats across ${categoryCount} categories. An advisor is building bilateral OVER/UNDER cases from your data. Write YOUR honest assessment of the prop landscape — which prop bets stand out and why? Do NOT pick OVER or UNDER.` });
            } else {
              messages.push({ role: 'user', content: `Your investigation has gathered ${totalCalls} stats across ${categoryCount} categories. An advisor is building bilateral cases. Stand by for evaluation.` });
            }
            nextMessageToSend = messages[messages.length - 1].content;
            continue;
          }

          nudgeMessage = `Your stat requests were all duplicates of stats you already gathered. DO NOT re-request the same stats.${dataRecap}

Use the fetch_stats tool to request DIFFERENT stat categories you haven't explored yet. You've covered ${categoryCount} categories — look for angles you haven't investigated.`;
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
          // Props must go through full pipeline: Pass 1 → Pass 2 → Pass 2.5 → Pass 3 → finalize
          if (!_pass3Injected) {
            const stage = !_pass2Injected ? 'Steel Man cases (Pass 2)' : !_pass25Injected ? 'case evaluation (Pass 2.5)' : 'final props evaluation (Pass 3)';
            console.log(`[Orchestrator] ⚠️ finalize_props BLOCKED — ${stage} not yet completed`);
            pendingFunctionResponses.push({
              name: functionName,
              content: JSON.stringify({ error: `Cannot finalize props yet. You must complete ${stage} first. Continue with your analysis — write your bilateral Steel Man cases for both sides of this matchup, then evaluate them, before selecting your final props.` })
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
            steelManCases,
            isProps: true
          };
        }

        // Handle fetch_narrative_context tool (storylines, player news, context)
        if (functionName === 'fetch_narrative_context') {
          // Block narrative context after Pass 2 — investigation is over, Gary should be building cases
          if (_pass2Injected) {
            console.log(`  → [NARRATIVE_CONTEXT] BLOCKED (Pass 2 injected — investigation phase over): "${args.query}"`);
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              name: functionName,
              content: JSON.stringify({ error: isPropsMode
                ? 'Investigation phase is complete. You have sufficient data. Write your bilateral prop analysis using the stats already gathered. Do NOT request more data.'
                : 'Investigation phase is complete. You have sufficient data. An advisor is building bilateral cases. Write your honest read on this game — what matters most for tonight. Do NOT pick a side. Do NOT request more data or write Steel Man cases.' })
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

      // INVESTIGATION TRACKING: Monitor tool call breadth for pass transitions
      
      // Count UNIQUE stats for logging — exclude rejected tokens (quality: 'unavailable')
      const uniqueStats = new Set(toolCallHistory.filter(t => t.token && t.quality !== 'unavailable').map(t => t.token));
      const uniqueStatsCount = uniqueStats.size;
      
      // PRELOADED FACTORS: These are already covered by the Scout Report
      // - INJURIES: Scout report always includes injury data for NFL/NBA/NHL/NCAAB/NCAAF
      // Gary doesn't need to call INJURIES token explicitly - data is already in context
      // ═══════════════════════════════════════════════════════════════════════
      // INVESTIGATION COMPLETION & PASS INJECTION
      // ═══════════════════════════════════════════════════════════════════════
      // Replaces the old per-factor coverage gate. Investigation sufficiency
      // is based on tool call breadth + stall detection. Flash research briefing
      // handles completeness — Gary investigates what matters without a checklist.
      // ═══════════════════════════════════════════════════════════════════════
      const { sufficient: investigationSufficient, categoryCount, totalCalls } = isInvestigationSufficient(toolCallHistory, iteration);
      const lastResponseWasTextOnly = message.content && (!message.tool_calls || message.tool_calls.length === 0);

      // Use persistent flags ONLY (survive context pruning, no false positives from Gemini echoing pass labels)
      const pass2AlreadyInjected = _pass2Injected;
      const pass25AlreadyInjected = _pass25Injected;
      const pass3AlreadyInjected = _pass3Injected;

      // Check if Steel Man analysis is complete:
      // - If Flash advisor delivered cases, Steel Man is complete (Flash built them)
      // - Otherwise, check Pro's recent messages for bilateral case patterns
      const recentAssistantMessages = messages.filter(m => m.role === 'assistant' && m.content).slice(-5);
      const steelManCompleted = (_flashCases && _flashCasesReady) || recentAssistantMessages.some(m => {
        const result = detectBilateralAnalysis(m.content || '');
        if (result.hasBilateral) {
          console.log(`[Orchestrator] ✅ Bilateral analysis detected: caseFor=${result.caseForCount}, toCovers=${result.toCoversCount}, whyCovers=${result.whyCoversCount}, overUnder=${result.overUnderCaseCount}`);
        }
        return result.hasBilateral;
      });

      // Log investigation status
      console.log(`[Orchestrator] Investigation: ${categoryCount} categories, ${totalCalls} total calls, sufficient=${investigationSufficient}, textOnly=${lastResponseWasTextOnly}`);

      // INVESTIGATION STALL DETECTION: Track if investigation stops producing new data
      if (categoryCount <= _lastCategoryCount) {
        _investigationStallCount++;
      } else {
        _investigationStallCount = 0;
      }
      _lastCategoryCount = categoryCount;

      // ═══════════════════════════════════════════════════════════════════════
      // NOTE: Flash research briefing is now injected BEFORE Pass 1 (sequential, not parallel).
      // Full findings are re-surfaced at Pass 2.5 alongside steel man cases.
      // ═══════════════════════════════════════════════════════════════════════
      // PHASE TRIGGERS — based on investigation sufficiency, not per-factor coverage
      // ═══════════════════════════════════════════════════════════════════════

      if (investigationSufficient && lastResponseWasTextOnly && !pass2AlreadyInjected && !steelManCompleted) {
        // ═══════════════════════════════════════════════════════════════════════
        // DUAL-MODEL: Gary's investigation is complete — spawn Flash bilateral cases
        // Gary produced a text-only response with sufficient investigation breadth,
        // meaning he's transitioning from investigation to synthesis.
        // ═══════════════════════════════════════════════════════════════════════

        if (!isPropsMode) {
          // Game picks: Flash builds independent cases (Flash's initial read comes from research briefing)
          spawnFlashAdvisor('investigation complete', `(${categoryCount} categories, ${totalCalls} calls)`);
          _pass2Injected = true;

          // Brief transition — Pro doesn't write its own read (Flash handles that via research briefing)
          messages.push({
            role: 'user',
            content: `Your investigation is complete. An advisor is building bilateral cases from the data. You'll receive those cases along with your research assistant's analysis for evaluation shortly.`
          });
          console.log(`[Orchestrator] Investigation complete — spawned Flash advisor (${categoryCount} categories, ${totalCalls} calls)`);
        } else {
          // Props mode: spawn advisor for bilateral OVER/UNDER cases
          spawnFlashAdvisor('props investigation complete', `(${categoryCount} categories, ${totalCalls} calls)`);
          _pass2Injected = true;
          _proAssessmentRequested = true;
          messages.push({
            role: 'user',
            content: `Your investigation data is being analyzed by an advisor who will build bilateral OVER/UNDER cases for the top prop candidates.

**BEFORE you see those cases, write YOUR honest assessment of the prop landscape.** Based on everything you've investigated:

- Which 3-4 prop bets stand out based on your investigation and why?
- What game factors from your investigation are most relevant to individual player production tonight?
- What surprised you in the data? What confirmed your expectations?
- Where is your biggest uncertainty?

Be specific — cite key data points. This is YOUR read before seeing any external analysis. Do NOT pick OVER or UNDER yet.`
          });
          console.log(`[Orchestrator] Props investigation complete — spawned advisor + requested Pro assessment (${categoryCount} categories, ${totalCalls} calls)`);
        }
      } else if (!pass2AlreadyInjected && !steelManCompleted) {
        // Investigation not yet triggering bilateral cases

        if (_pass25Injected || steelManCompleted) {
          // Pipeline past bilateral analysis — pipeline flags handle the rest
          console.log(`[Orchestrator] Pipeline past bilateral analysis (pass25=${_pass25Injected}, steelMan=${steelManCompleted}) — skipping`);
        } else if (_investigationStallCount >= 3 && investigationSufficient) {
          // STALL BREAKER: Investigation stalled with sufficient breadth — force move
          console.log(`[Orchestrator] STALL BREAKER: Investigation stalled at ${categoryCount} categories for ${_investigationStallCount} iterations`);
          if (isPropsMode) {
            spawnFlashAdvisor('props stall break', `(${categoryCount} categories)`);
            _proAssessmentRequested = true;
            messages.push({
              role: 'user',
              content: `Your investigation has gathered ${totalCalls} stats across ${categoryCount} categories. An advisor is building bilateral OVER/UNDER cases from your data. Write YOUR honest assessment of the prop landscape — which prop bets stand out and why? Do NOT pick OVER or UNDER.`
            });
          } else {
            spawnFlashAdvisor('stall break', `(${categoryCount} categories)`);
            messages.push({
              role: 'user',
              content: `Your investigation has gathered ${totalCalls} stats across ${categoryCount} categories. An advisor is building bilateral cases. Stand by for evaluation.`
            });
          }
          _pass2Injected = true;
        } else if (_investigationStallCount >= 3 && categoryCount >= 3) {
          // Investigation stalled early — still force move (enough for a basic analysis)
          console.log(`[Orchestrator] STALL BREAKER (early): Investigation stalled at ${categoryCount} categories — forcing bilateral cases`);
          spawnFlashAdvisor('early stall break', `(${categoryCount} categories)`);
          _pass2Injected = true;
          if (isPropsMode) {
            _proAssessmentRequested = true;
            messages.push({
              role: 'user',
              content: `Your investigation has gathered ${totalCalls} stats across ${categoryCount} categories. An advisor is building bilateral OVER/UNDER cases. Write YOUR honest assessment of the prop landscape. Do NOT pick OVER or UNDER.`
            });
          } else {
            messages.push({
              role: 'user',
              content: `Your investigation has gathered ${totalCalls} stats across ${categoryCount} categories. An advisor is building bilateral cases. Stand by for evaluation.`
            });
          }
        } else if (lastResponseWasTextOnly && !investigationSufficient && categoryCount < 4 && iteration <= 3) {
          // Gary stopped investigating too early — gentle nudge to continue
          messages.push({
            role: 'user',
            content: `You've gathered ${totalCalls} stats across ${categoryCount} categories. Continue investigating — use fetch_stats to explore more aspects of this matchup. Look at efficiency, form, matchup factors, and situational context before proceeding to analysis.`
          });
          console.log(`[Orchestrator] Gentle nudge — investigation too shallow (${categoryCount} categories, iteration ${iteration})`);
        }
        // If Gary is actively making tool calls, let them process naturally (no nudge)
      } else if (pass2AlreadyInjected && !pass3AlreadyInjected) {
        // Pass 2 injected — decide between enforcement, Pass 2.5, or Pass 3

        if (!steelManCompleted && _pass2Delivered && !_flashCasesPromise) {
          // BILATERAL ANALYSIS ENFORCEMENT: Pass 2 delivered but bilateral cases not written yet
          if (isPropsMode) {
            messages.push({
              role: 'user',
              content: `
<enforcement_context>
## BILATERAL PROP ANALYSIS REQUIRED

You have gathered ${totalCalls} stats across ${categoryCount} categories.
This is SUFFICIENT data to proceed. STOP calling more stats.
</enforcement_context>

<case_requirements>
## REQUIRED OUTPUT

For your top 3-4 prop candidates, write BOTH cases:

### OVER CASE for [Player] — [Prop Type] [Line]
2-3 paragraphs: What game factors support OVER? What does recent form show? Cite specific stats.

### UNDER CASE for [Player] — [Prop Type] [Line]
2-3 paragraphs: What limits production tonight? What risks exist? Cite specific stats.

**DO NOT call finalize_props yet.** Write bilateral cases for each candidate first.
</case_requirements>

<instructions>
## YOUR TASK

Using the data you've gathered, STOP calling more stats and execute NOW:

1. Synthesize game factors that affect player production (1 paragraph)
2. For each of your top 3-4 candidates, write **OVER CASE** and **UNDER CASE**

BEGIN WRITING YOUR BILATERAL PROP ANALYSIS NOW.
</instructions>
`
            });
            console.log(`[Orchestrator] BILATERAL PROP ANALYSIS ENFORCEMENT — Gary must write OVER/UNDER cases`);
          }
          // Game picks: Flash builds bilateral cases — no enforcement needed for Gary
        } else if (!steelManCompleted && !_pass2Delivered) {
          // Pass 2 queued but not delivered — advisor still building cases
          if (_flashCasesPromise && !_flashCasesReady) {
            console.log(`[Orchestrator] 🔄 Advisor still building cases — awaiting before next iteration (${iteration}/${effectiveMaxIterations})`);
            await _flashCasesPromise;
            console.log(`[Orchestrator] ✅ Advisor returned — will inject Pass 2.5 next iteration`);
          } else if (pass2AlreadyInjected) {
            // Pass 2 injected — tell Gary to write his assessment
            const enforceMsg = isPropsMode
              ? `You have gathered ${totalCalls} stats across ${categoryCount} categories. This is SUFFICIENT data. An advisor is building bilateral OVER/UNDER cases from your data. Write YOUR honest assessment of the prop landscape — which prop bets stand out based on your investigation and why?`
              : `You have gathered ${totalCalls} stats across ${categoryCount} categories. This is SUFFICIENT data to proceed. An advisor is building bilateral Steel Man cases from your data. Write YOUR honest read on this game — what are the key dynamics and what matters most for tonight? Do NOT pick a side.`;
            messages.push({ role: 'user', content: enforceMsg });
          }
        } else if (!pass25AlreadyInjected && steelManCompleted) {
          // ═══════════════════════════════════════════════════════════════════════
          // PASS 2.5 INJECTION
          // ═══════════════════════════════════════════════════════════════════════
          const pass25Content = isPropsMode
            ? buildPass25PropsMessage(homeTeam, awayTeam, sport)
            : buildPass25Message(homeTeam, awayTeam, sport, spread);

          messages.push({ role: 'user', content: pass25Content });

          _pass25Injected = true;
          _pass25JustInjected = true;
          console.log(`[Orchestrator] Injected Pass 2.5 (Case Evaluation & Decision) — ${categoryCount} categories, Steel Man complete, spread: ${spread}`);
        } else if (!steelManCompleted && !pass2AlreadyInjected) {
          // Neither Pass 2 nor Steel Man — spawn Flash advisor (urgent path)
          spawnFlashAdvisor('urgent (sufficient investigation, no Pass 2)', `(${categoryCount} categories)`);
          _pass2Injected = true;
          if (isPropsMode) {
            _proAssessmentRequested = true;
            messages.push({ role: 'user', content: `An advisor is building bilateral OVER/UNDER cases from your investigation data. Write YOUR honest assessment of the prop landscape. Do NOT pick OVER or UNDER.` });
          } else {
            messages.push({ role: 'user', content: `Your investigation is complete. An advisor is building bilateral cases. Stand by for evaluation.` });
          }
          console.log(`[Orchestrator] Flash advisor spawned (urgent) — ${categoryCount} categories, spread: ${spread}`);
        } else if (pass25AlreadyInjected && !pass3AlreadyInjected) {
          // Pass 2.5 evaluation done — inject Pass 3 for final output
          const pass3Content = isPropsMode
            ? buildPass3Props(homeTeam, awayTeam, propContext)
            : buildPass3Unified(homeTeam, awayTeam, options);
          messages.push({ role: 'user', content: pass3Content });
          _pass3Injected = true;
          console.log(`[Orchestrator] Injected Pass 3 (${isPropsMode ? 'Props Evaluation' : 'Final Output'})`);
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // FLASH ADVISOR: Check if Flash's cases are ready and inject into Pro
      // ═══════════════════════════════════════════════════════════════════════
      if (_flashCasesReady && !_pass25Injected && _pass2Injected) {
        if (_flashCases) {
          if (isPropsMode) {
            // PROPS: Inject advisor bilateral OVER/UNDER cases + enhanced Pass 2.5
            console.log(`[Orchestrator] Props advisor cases received (${(_flashCases.candidateCases || '').length} chars, advisor)`);

            const advisorPreamble = buildAdvisorPropsPreamble(homeTeam, awayTeam, _flashCases, _proAssessment);
            const pass25Content = advisorPreamble + buildPass25PropsMessage(homeTeam, awayTeam, sport);
            messages.push({ role: 'user', content: pass25Content });
            nextMessageToSend = pass25Content;

            _pass25Injected = true;
            _pass25JustInjected = true;
            _pass2Delivered = true;

            console.log(`[Orchestrator] Injected Props Pass 2.5 with ${_proAssessment ? 'Pro assessment + ' : ''}advisor cases — Pro evaluates independently`);
          } else {
            // GAME PICKS: Flash succeeded — inject cases into Pro as "advisor" input
            steelManCases.homeTeamCase = _flashCases.homeTeamCase;
            steelManCases.awayTeamCase = _flashCases.awayTeamCase;
            steelManCases.capturedAt = new Date().toISOString();
            steelManCases.source = 'advisor';

            console.log(`[Orchestrator] Flash advisor cases received (${steelManCases.homeTeamCase?.length || 0}+${steelManCases.awayTeamCase?.length || 0} chars, advisor)`);

            const advisorPreamble = buildAdvisorPreamble(homeTeam, awayTeam, _flashCases, _researchBriefing);
            const pass25Content = advisorPreamble + buildPass25Message(homeTeam, awayTeam, sport, spread);
            messages.push({ role: 'user', content: pass25Content });
            nextMessageToSend = pass25Content;

            _pass25Injected = true;
            _pass25JustInjected = true;
            _pass2Delivered = true;

            console.log(`[Orchestrator] Injected Pass 2.5 with ${_researchBriefing ? 'full findings + ' : ''}advisor cases`);
            // TEMP: Dump full Pass 2.5 content to file for inspection
            if (process.env.VERBOSE_GARY) {
              const fs = await import('fs');
              const dumpPath = `/tmp/pass25_${homeTeam.replace(/\s/g,'_')}_${Date.now()}.txt`;
              fs.writeFileSync(dumpPath, pass25Content);
              console.log(`[VERBOSE] Pass 2.5 dumped to: ${dumpPath}`);
            }
          }
        } else {
          // Advisor failed
          if (isPropsMode) {
            // Props advisor failed — HARD FAIL (same as game picks — no silent fallback)
            console.error(`[Orchestrator] ❌ Props advisor FAILED for ${awayTeam} @ ${homeTeam} — props cannot proceed without bilateral cases`);
            return {
              error: 'Props advisor failed — cannot produce bilateral OVER/UNDER cases',
              toolCallHistory,
              iterations: iteration,
              homeTeam, awayTeam, sport
            };
          } else {
            // Game picks: Flash advisor failed — HARD FAIL (no silent fallback to biased single-model cases)
            console.error(`[Orchestrator] ❌ Flash advisor FAILED for ${awayTeam} @ ${homeTeam} — pick cannot proceed without bilateral cases`);
            return {
              error: 'Advisor failed — cannot produce bilateral cases',
              toolCallHistory,
              iterations: iteration,
              homeTeam, awayTeam, sport
            };
          }
        }

        // Clear Flash state (one-shot)
        _flashCasesReady = false;
        _flashCasesPromise = null;
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
    // PIPELINE ENFORCEMENT: Gary MUST go through the full multi-pass pipeline
    // Pass 1 (Investigation) → Pass 2 (Steel Man) → Pass 2.5 (Evaluation) → Pass 3 (Final Output)
    // If Gary tries to output a pick before completing these passes, reject it and
    // force the correct next step. This prevents the model from making picks without completing the full pipeline.
    // ═══════════════════════════════════════════════════════════════════════
    if (!_pass2Injected && iteration < effectiveMaxIterations) {
      // Pass 2 hasn't been injected yet — Gary tried to skip investigation
      const { sufficient: gateSufficient, categoryCount: gateCategories, totalCalls: gateCalls } = isInvestigationSufficient(toolCallHistory, iteration);

      if (gateSufficient) {
        // Investigation sufficient — spawn Flash and force assessment
        messages.push({ role: 'assistant', content: message.content });
        if (isPropsMode) {
          console.log(`[Orchestrator] ⚠️ PIPELINE GATE: Gary tried to pick before Pass 2 — spawning props advisor (${gateCategories} categories, ${gateCalls} calls)`);
          spawnFlashAdvisor('props pipeline gate', `(${gateCategories} categories)`);
          _pass2Injected = true;
          _proAssessmentRequested = true;
          messages.push({ role: 'user', content: `An advisor is building bilateral OVER/UNDER cases from your investigation data. Hold your pick — write YOUR honest assessment of which prop bets stand out and why. Do NOT pick OVER or UNDER.` });
        } else {
          console.log(`[Orchestrator] ⚠️ PIPELINE GATE: Gary tried to pick before Pass 2 — spawning Flash advisor (${gateCategories} categories, ${gateCalls} calls)`);
          spawnFlashAdvisor('pipeline gate', `(${gateCategories} categories)`);
          _pass2Injected = true;
          messages.push({ role: 'user', content: `Your investigation is complete. An advisor is building bilateral cases. Hold your pick — you'll receive the cases along with your research assistant's analysis for evaluation shortly.` });
        }
        nextMessageToSend = messages[messages.length - 1].content;
        continue;
      } else {
        // Investigation too shallow — nudge to continue investigating
        console.log(`[Orchestrator] ⚠️ PIPELINE GATE: Gary tried to pick with only ${gateCategories} categories — nudging to investigate`);
        messages.push({ role: 'assistant', content: message.content });
        messages.push({ role: 'user', content: `STOP — you cannot make your pick yet. You've only investigated ${gateCategories} stat categories (${gateCalls} total calls). Continue using fetch_stats to explore more aspects of this matchup — efficiency, form, matchup factors, and situational context. Do NOT write analysis or try to make a pick yet.` });
        continue;
      }
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

    // Gary is done - but check if we need to inject Pass 2.5 first
    console.log(`[Orchestrator] Gary finished analysis (${finishReason})`);
    
    // Check if Steel Man was just completed and Pass 2.5 hasn't been done yet
    const pass25Done = messages.some(m => m.content?.includes('PASS 2.5 - CASE REVIEW'));
    const pass3Done = messages.some(m => m.content?.includes('PASS 3 - FINAL OUTPUT') || m.content?.includes('PASS 3 - PROPS EVALUATION PHASE'));
    
    // Detect Steel Man / bilateral analysis in current response
    // Game picks: "Case for [Team]", "to cover", "Why/How covers/wins"
    // Detect bilateral analysis in current response
    const currentContent = message.content || '';
    const bilateralResult = detectBilateralAnalysis(currentContent);
    const steelManJustWritten = bilateralResult.hasBilateral;

    if (steelManJustWritten && !pass25Done && !pass3Done && iteration < effectiveMaxIterations) {
      // Gary just wrote bilateral analysis! Inject Pass 2.5 before allowing a pick
      console.log(`[Orchestrator] ✅ Bilateral analysis detected (caseFor=${bilateralResult.caseForCount}, toCovers=${bilateralResult.toCoversCount}, overUnder=${bilateralResult.overUnderCaseCount})`);
      console.log(`\n📋 GARY'S ${isPropsMode ? 'BILATERAL PROP ANALYSIS' : 'STEEL MAN ANALYSIS'} (Both Sides):\n${'─'.repeat(60)}`);
      console.log(currentContent);
      console.log(`${'─'.repeat(60)}\n`);
      console.log(`[Orchestrator] Injecting Pass 2.5 (${isPropsMode ? 'Prop Case Review' : 'Case Evaluation & Decision'}) - bilateral analysis just completed`);

      messages.push({
        role: 'assistant',
        content: message.content
      });

      // spread already defined at loop scope
      const pass25Content = isPropsMode
        ? buildPass25PropsMessage(homeTeam, awayTeam, sport)
        : buildPass25Message(homeTeam, awayTeam, sport, spread);
      messages.push({
        role: 'user',
        content: pass25Content
      });
      
      // CRITICAL: Set nextMessageToSend so the session knows what to send next
      nextMessageToSend = pass25Content;
      _pass25Injected = true;
      _pass25JustInjected = true;

      continue; // Go back to get Pass 2.5 response
    }

    // ─── Props mode: parse with parsePropsResponse ───────────────────────
    if (isPropsMode) {
      const propsParsed = parsePropsResponse(message.content, null);
      if (propsParsed && propsParsed.length > 0) {
        return {
          picks: propsParsed,
          toolCallHistory, iterations: iteration,
          homeTeam, awayTeam, sport,
          rawAnalysis: message.content,
          steelManCases, isProps: true
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

    // ─── PIPELINE GATE: Don't accept picks before Pass 2.5 + Pass 3 ─────
    // If Pass 2 was injected (Steel Man phase), Gary MUST go through Pass 2.5 (evaluation)
    // and Pass 3 (final output) before a pick is accepted. This prevents Gary from
    // sneaking a pick JSON into his Steel Man analysis and bypassing the evaluation pipeline.
    if (_pass2Injected && !_pass25Injected && iteration < effectiveMaxIterations) {
      messages.push({ role: 'assistant', content: message.content });

      // If Flash advisor is still building cases, tell Pro to wait
      if (_flashCasesPromise && !_flashCasesReady) {
        console.log(`[Orchestrator] 🔄 PIPELINE GATE: Pro tried to pick but Flash advisor still working — awaiting Flash`);
        // Await Flash (usually <30s remaining since it started earlier)
        await _flashCasesPromise;
        // The .then()/.catch() handler will set _flashCasesReady and _flashCases
        // The injection check in the coverage block will handle it next iteration
        messages.push({
          role: 'user',
          content: 'Your bilateral cases from the advisor are being prepared. Hold your pick — you will evaluate the advisor\'s cases before making a decision.'
        });
        nextMessageToSend = messages[messages.length - 1].content;
        continue;
      }

      // Check if bilateral cases were actually written (Pro wrote them, or Flash delivered them)
      const gateRecentMsgs = messages.filter(m => m.role === 'assistant' && m.content).slice(-5);
      const gateSteelManDone = (_flashCases && _flashCasesReady) || gateRecentMsgs.some(m => {
        return detectBilateralAnalysis(m.content || '').hasBilateral;
      });

      if (!gateSteelManDone) {
        // Bilateral cases NOT written — re-enforce Pass 2
        if (isPropsMode) {
          console.log(`[Orchestrator] 🔄 PIPELINE GATE: Pick attempted but bilateral prop analysis not written — re-enforcing Props Pass 2`);
          messages.push({
            role: 'user',
            content: `**STOP.** You attempted to finalize props without writing your bilateral OVER/UNDER analysis. You MUST build both the OVER case and UNDER case for your top 3-4 prop candidates BEFORE making a selection.

For each candidate, write:

### OVER CASE for [Player] — [Prop Type] [Line]
[Build the strongest data-backed case for OVER — cite stats from your investigation]

### UNDER CASE for [Player] — [Prop Type] [Line]
[Build the strongest data-backed case for UNDER — cite stats from your investigation]

Do NOT call finalize_props yet. Write BOTH cases for each candidate first.`
          });
        } else {
          // Game picks: Flash builds cases, not Pro. Await Flash.
          console.log(`[Orchestrator] 🔄 PIPELINE GATE: Pick attempted but Flash Steel Man cases not ready — awaiting Flash advisor`);
          if (_flashCasesPromise && !_flashCasesReady) {
            // Flash is still building — tell Pro to wait
            messages.push({
              role: 'user',
              content: `**STOP.** You attempted to make a pick before the bilateral Steel Man analysis is ready. An advisor is currently building the cases for both sides. Summarize your key investigation findings while the cases are being prepared. Do NOT make a pick yet.`
            });
          } else if (!_flashCasesPromise) {
            // Flash was never spawned — spawn it now
            console.log(`[Orchestrator] ⚠️ Flash advisor was never spawned — spawning now for pipeline gate`);
            spawnFlashAdvisor('pipeline gate', '(pre-pick)');
            messages.push({
              role: 'user',
              content: `**STOP.** You attempted to make a pick before the bilateral Steel Man analysis is ready. An advisor is now building the cases for both sides. Summarize your key investigation findings while the cases are being prepared. Do NOT make a pick yet.`
            });
          } else {
            // Flash already completed — cases should be available, something else is wrong
            // Let the normal Flash injection path handle it on next iteration
            messages.push({
              role: 'user',
              content: `**STOP.** You attempted to make a pick before evaluating the bilateral Steel Man cases. The cases are ready — they will be provided to you for evaluation. Do NOT make a pick yet.`
            });
          }
        }
        nextMessageToSend = messages[messages.length - 1].content;
        continue;
      }

      // Bilateral cases were written — proceed to Pass 2.5
      console.log(`[Orchestrator] 🔄 PIPELINE GATE: Investigation complete — transitioning to Pass 2.5 evaluation`);

      // Inject Pass 2.5 + Pro switch (same logic as steelManJustWritten path above)
      // Props: use props-specific Pass 2.5 (evaluates OVER/UNDER cases, not team spread)
      // Game picks: use Flash advisor cases if available
      let pass25Content;
      if (isPropsMode) {
        pass25Content = buildPass25PropsMessage(homeTeam, awayTeam, sport);
        console.log(`[Orchestrator] Injecting Props Pass 2.5 (prop case review & evaluation)`);
      } else if (_flashCases && _flashCases.homeTeamCase && _flashCases.awayTeamCase) {
        // Flash cases available — include them as advisor preamble
        steelManCases.homeTeamCase = _flashCases.homeTeamCase;
        steelManCases.awayTeamCase = _flashCases.awayTeamCase;
        steelManCases.capturedAt = new Date().toISOString();
        steelManCases.source = 'advisor';

        const advisorPreamble = buildAdvisorPreamble(homeTeam, awayTeam, _flashCases, _researchBriefing);
        pass25Content = advisorPreamble + buildPass25Message(homeTeam, awayTeam, sport, spread);
        console.log(`[Orchestrator] ✅ Flash advisor cases included in pipeline gate Pass 2.5 (${_flashCases.homeTeamCase?.length || 0} + ${_flashCases.awayTeamCase?.length || 0} chars)`);
      } else {
        // No Flash cases — use plain Pass 2.5 (Pro will self-synthesize)
        pass25Content = buildPass25Message(homeTeam, awayTeam, sport, spread);
        console.log(`[Orchestrator] ⚠️ No Flash advisor cases available — Pro will self-synthesize Steel Man cases`);
      }
      messages.push({ role: 'user', content: pass25Content });

      nextMessageToSend = pass25Content;
      _pass25Injected = true;
      _pass25JustInjected = true;
      continue;
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

      // Attach full steel man cases for transparency
      if (steelManCases.homeTeamCase || steelManCases.awayTeamCase) {
        pick.steelManCases = {
          homeTeam: steelManCases.homeTeamCase,
          awayTeam: steelManCases.awayTeamCase,
          source: steelManCases.source || 'unknown',
          capturedAt: steelManCases.capturedAt
        };
        console.log(`[Orchestrator] 📝 Steel Man cases attached to pick (source: ${steelManCases.source || 'unknown'})`);
        console.log(`\n📋 STEEL MAN — CASE FOR ${homeTeam} (${steelManCases.homeTeamCase?.length || 0} chars):`);
        console.log(`────────────────────────────────────────────────────────────`);
        console.log(steelManCases.homeTeamCase || '(none)');
        console.log(`────────────────────────────────────────────────────────────`);
        console.log(`\n📋 STEEL MAN — CASE FOR ${awayTeam} (${steelManCases.awayTeamCase?.length || 0} chars):`);
        console.log(`────────────────────────────────────────────────────────────`);
        console.log(steelManCases.awayTeamCase || '(none)');
        console.log(`────────────────────────────────────────────────────────────`);
      }

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
      const stage = !_pass2Injected ? 'Pass 2 (bilateral cases)' : 'Pass 2.5 (case evaluation)';
      console.error(`[Orchestrator] ❌ Max iterations reached but pipeline incomplete — ${stage} never completed for ${awayTeam} @ ${homeTeam}`);
      console.error(`[Orchestrator] Pipeline state: pass2=${_pass2Injected}, pass25=${_pass25Injected}, pass3=${_pass3Injected}`);
      return {
        error: `Props pipeline incomplete — ${stage} never completed within max iterations`,
        toolCallHistory, iterations: iteration,
        homeTeam, awayTeam, sport, isProps: true,
        _pipelineState: { pass2: _pass2Injected, pass25: _pass25Injected, pass3: _pass3Injected }
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
              steelManCases, isProps: true
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
              steelManCases, isProps: true
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
  // Every pick must come from the real pipeline (Pass 1→2→2.5→3). If the pipeline
  // can't complete, this game is reported as a failure. No fake/synthesized picks.
  console.error(`[Orchestrator] MAX ITERATIONS (${effectiveMaxIterations}) reached without completing pipeline for ${awayTeam} @ ${homeTeam}`);
  console.error(`[Orchestrator] Pipeline state: pass2=${_pass2Injected}, pass25=${_pass25Injected}, pass3=${_pass3Injected}, steelMan=${steelManCases.capturedAt ? 'captured' : 'missing'}`);
  console.error(`[Orchestrator] Stats gathered: ${toolCallHistory.length}, iterations: ${iteration}`);
  return {
    error: 'Pipeline did not complete within max iterations — no pick generated',
    toolCallHistory,
    iterations: iteration,
    homeTeam,
    awayTeam,
    sport,
    _pipelineState: { pass2: _pass2Injected, pass25: _pass25Injected, pass3: _pass3Injected },
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
