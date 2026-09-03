import { CONFIG, GAME_PICK_MODEL, GAME_ML_CAP, validateSessionModel } from './orchestratorConfig.js';
import { createModelSession, sendToSession, sendToSessionWithRetry } from './sessionManager.js';
import { buildResearchBriefing, extractResearcherQuestions, createResearcherFollowUpSession, askResearcher } from './researchBriefing.js';
import { createCostTracker } from './costTracker.js';
import { buildPass1Message, buildPass2Message, buildPass3Unified, buildMlCapRetryMessage } from './passBuilders.js';
import { parseGaryResponse, normalizePickFormat } from './responseParser.js';
import { auditPickRationale, auditCountClaims, buildStatAuditRetryMessage } from './statAudit.js';
import { isInvestigationSufficient, summarizeStatForContext, formatNum, formatPct, summarizePlayerGameLogs, summarizeMlbPlayerGameLogs, summarizePlayerStats, summarizeNbaPlayerAdvancedStats, pruneContextIfNeeded, normalizeSportToLeague, MAX_CONTEXT_MESSAGES, PRUNE_AFTER_ITERATION } from './orchestratorHelpers.js';
import { fetchStats, clearStatRouterCache } from '../tools/statRouters/index.js';
import { getConstitution } from '../constitution/index.js';
import { ballDontLieService } from '../../ballDontLieService.js';
import { nbaSeason, nflSeason, ncaafSeason } from '../../../utils/dateUtils.js';
import { getTokensForSport, toolDefinitions } from '../tools/toolDefinitions.js';

function hasInvestigationCompleteMarker(text = '') {
  if (!text || typeof text !== 'string') return false;
  return /(^|\n)\s*INVESTIGATION COMPLETE\s*($|\n)/i.test(text);
}

const NBA_CASE_MIN_CHARS = 200;

/**
 * Simple bilateral case validator.
 * Checks if Gary wrote substantially about both teams — doesn't care about header format.
 * Uses nickname (last word) as the primary discriminator so same-city pairings like
 * Lakers/Clippers or Yankees/Mets don't double-count every "Los Angeles" / "New York"
 * paragraph as belonging to both teams. Falls back to whole-name word matching for
 * paragraphs that omit the nickname.
 */
export function validateBilateralCases(text = '', homeTeam = '', awayTeam = '', options = {}) {
  const input = String(text || '').replace(/\n?\s*\**INVESTIGATION COMPLETE\**\s*\n?/gi, '\n');
  const requireExplicitHeadings = options.requireExplicitHeadings === true;

  if (requireExplicitHeadings) {
    const escHeading = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const headingFor = (team) => new RegExp(
      `(?:^|\\n)\\s*(?:#{1,6}\\s*)?(?:\\*\\*)?CASE FOR ${escHeading(String(team).toUpperCase())} COVERING THE SPREAD:(?:\\*\\*)?\\s*(?=\\n|$)`,
      'i'
    );
    const homeHeading = headingFor(homeTeam).exec(input);
    const awayHeading = headingFor(awayTeam).exec(input);

    if (!homeHeading || !awayHeading) {
      return {
        valid: false,
        reason: !homeHeading && !awayHeading ? 'both_headings_missing' :
          !homeHeading ? 'home_heading_missing' : 'away_heading_missing',
        homeLen: 0,
        awayLen: 0
      };
    }

    const genericCaseHeading = /(?:^|\n)\s*(?:#{1,6}\s*)?(?:\*\*)?CASE FOR [^\n:]+ COVERING THE SPREAD:(?:\*\*)?\s*(?=\n|$)/i;
    const sectionLength = (heading) => {
      const start = heading.index + heading[0].length;
      const remaining = input.slice(start);
      const nextHeading = genericCaseHeading.exec(remaining);
      const end = nextHeading ? start + nextHeading.index : input.length;
      return input.slice(start, end).trim().length;
    };
    const homeLen = sectionLength(homeHeading);
    const awayLen = sectionLength(awayHeading);

    if (homeLen >= NBA_CASE_MIN_CHARS && awayLen >= NBA_CASE_MIN_CHARS) {
      return { valid: true, reason: '', homeLen, awayLen };
    }

    return {
      valid: false,
      reason: homeLen < NBA_CASE_MIN_CHARS && awayLen < NBA_CASE_MIN_CHARS ? 'both_sections_thin' :
        homeLen < NBA_CASE_MIN_CHARS ? 'home_section_thin' : 'away_section_thin',
      homeLen,
      awayLen
    };
  }

  // Nickname extraction (last word of team name)
  const getNick = (team) => String(team || '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ').trim().split(/\s+/).filter(Boolean).pop() || '';
  const homeNick = getNick(homeTeam);
  const awayNick = getNick(awayTeam);
  const distinctNicks = homeNick && awayNick && homeNick !== awayNick;
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const homeNickRe = distinctNicks ? new RegExp(`\\b${esc(homeNick)}\\b`, 'i') : null;
  const awayNickRe = distinctNicks ? new RegExp(`\\b${esc(awayNick)}\\b`, 'i') : null;

  // Whole-name word fallback (same logic as before — used when paragraph omits nicknames)
  const getWords = (team) => String(team || '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter(w => w.length >= 2 && !['the', 'and', 'of'].includes(w));
  const homeWords = getWords(homeTeam);
  const awayWords = getWords(awayTeam);

  const paragraphs = input.split(/\n\s*\n/).filter(p => p.trim().length > 50);
  let homeChars = 0;
  let awayChars = 0;

  for (const para of paragraphs) {
    let homeHit = false;
    let awayHit = false;

    // Primary: nickname word-boundary match — unambiguous when nicknames differ
    if (homeNickRe && awayNickRe) {
      homeHit = homeNickRe.test(para);
      awayHit = awayNickRe.test(para);
    }

    // Fallback: whole-name word count for paragraphs with no nickname (or same-nickname NCAA matchups)
    if (!homeHit && !awayHit) {
      const lower = para.toLowerCase();
      const homeMentions = homeWords.reduce((n, w) => n + (lower.includes(w) ? 1 : 0), 0);
      const awayMentions = awayWords.reduce((n, w) => n + (lower.includes(w) ? 1 : 0), 0);
      if (homeMentions > awayMentions) homeHit = true;
      else if (awayMentions > homeMentions) awayHit = true;
      else if (homeMentions > 0) { homeHit = true; awayHit = true; }
    }

    if (homeHit && !awayHit) homeChars += para.length;
    else if (awayHit && !homeHit) awayChars += para.length;
    else if (homeHit && awayHit) { homeChars += para.length; awayChars += para.length; }
    // else: generic paragraph that doesn't reference either team — skip
  }

  if (homeChars >= NBA_CASE_MIN_CHARS && awayChars >= NBA_CASE_MIN_CHARS) {
    return { valid: true, reason: '', homeLen: homeChars, awayLen: awayChars };
  }

  return {
    valid: false,
    reason: homeChars < NBA_CASE_MIN_CHARS && awayChars < NBA_CASE_MIN_CHARS ? 'both_teams_thin' :
      homeChars < NBA_CASE_MIN_CHARS ? 'home_thin' : 'away_thin',
    homeLen: homeChars,
    awayLen: awayChars
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
// HOUSE LIMIT (founder, Aug 18 — restored from the pickdesk-era -179 rule):
// a game pick's moneyline may never be heavier than GAME_ML_CAP. Payout law:
// users cannot be sold "risk $184 to win $100" — past the cap the market is
// the runline/spread, not the winner.
function moneylinePastCap(pick, cap = GAME_ML_CAP) {
  if (!pick || !/moneyline|^ml$/i.test(String(pick.type || ''))) return false;
  const direct = Number(pick.odds);
  if (Number.isFinite(direct) && direct !== 0) return direct < cap;
  const m = String(pick.pick || '').match(/(-\d{3,4})\s*\)?\s*$/);
  return m ? parseInt(m[1], 10) < cap : false;
}

export async function runAgentLoop(systemPrompt, userMessage, sport, homeTeam, awayTeam, options = {}) {
  // Internal branch tag for the session-based path (the name predates the
  // provider seam; every session now routes to a codex/claude/anthropic/gpt
  // adapter — Gemini itself is retired, Aug 24 2026).
  const provider = 'session';
  const isNFLSport = sport === 'americanfootball_nfl' || sport === 'NFL';
  const isNCAAFSport = sport === 'americanfootball_ncaaf' || sport === 'NCAAF';
  const isNBASport = sport === 'basketball_nba' || sport === 'NBA';
  const isMLBSport = sport === 'baseball_mlb' || sport === 'MLB';

  // Pass sport through options so downstream builders (Pass 3) can use it
  options.sport = sport;

  // The orchestrator is the GAME lane only. Props left it for the desk brain
  // (MLB Jul 26 2026, football Aug 20 2026); the old multi-pass props mode —
  // the system behind the pre-Jul-27 props ledger — was deleted Sep 2 2026
  // (founder: "the old system is gone") and is refused at the entry seam
  // (orchestratorMain.analyzeGame).
  const bilateralFn = options.bilateralCasePrompt || null;
  // Per-call override outranks the env override: the June-engine MLB lane must
  // pin a TOOLS-CAPABLE brain (API Sol) even while the scheduler plist's
  // GARY_MODEL_OVERRIDE points the pickdesk lane at the tool-less codexCli
  // bridge (Aug 18 2026). Nothing passes options.modelOverride today except
  // that lane — every other sport's resolution is byte-identical.
  const modelOverride = options.modelOverride || process.env.GARY_MODEL_OVERRIDE || null;

  // Model selection (Aug 24 2026, Gemini retired): every model resolves
  // through orchestratorConfig — the codex bridge for game/props brains,
  // Anthropic for research and the legacy non-MLB lanes. The provider seam
  // (sessionManager) routes by name; this loop stays provider-blind.
  // measured reality (Jul 8 cost audit): ~$0.35-0.45/game ≈ half the monthly
  // LLM bill — and the lane showed NO quality gain on the big brain (36.6%
  // over 82 picks Jul 5-7 vs 43.1% over 355 on Tier 2 with the debiased
  // prompts, Jun 25-Jul 4). Founder reverted props to the documented Tier 2
  // on Jul 8; props win-rate stays on the nightly watch — one-line re-upgrade
  // if the lane sags.
  const primaryModel = modelOverride ? modelOverride : GAME_PICK_MODEL;
  // Game-pick audit = numeric-corpus trace + count-claim verification over the
  // structured recent scores (both feed the same corrective-retry rail).
  const auditGamePick = (p, messages) => {
    const a = auditPickRationale(p, messages);
    if (options?.recentScores && p?.rationale) {
      const counts = auditCountClaims(p.rationale, options.recentScores);
      if (counts.length) {
        a.retryable = [...a.retryable, ...counts];
        a.unsupported = [...a.unsupported, ...counts];
      }
    }
    return a;
  };
  const modelLabel = modelOverride
    ? `OVERRIDE: ${modelOverride}`
    : primaryModel;
  console.log(`[Orchestrator] Starting ${sport} — brain: ${modelLabel} (desk-only, researcher OFF)`);

  // Cost tracking — accumulates tokens across all sessions (including 429 cascades)
  const costTracker = createCostTracker(`Game Picks: ${awayTeam} @ ${homeTeam} (${sport})`);

  try { // try/finally ensures cost summary always logs on exit

  const activeTools = toolDefinitions;

  // PERSISTENT SESSION SETUP — one session per brain, adapter-routed.
  let currentSession = await createModelSession({ _costTracker: costTracker,
    modelName: primaryModel,
    systemPrompt: systemPrompt,
    tools: activeTools,
    // Game picks run Sol at its TOP reasoning tier (founder GO Jul 22 eve —
    // the WC specials precedent); props ride their own desk model.
    thinkingLevel: 'xhigh',
    enableCache: true  // Cache system prompt + tools (~10K stable tokens, 90% off on reuse)
  });
  let currentModelName = currentSession.modelName;
  console.log(`[Orchestrator] ${modelLabel} session created (${currentModelName}, ${sport}, thinking: xhigh)`);

  // Messages array for state tracking (pass detection) — API calls go
  // through the persistent session
  let messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage }
  ];

  let iteration = 0;
  const toolCallHistory = [];
  // Models already exhausted by the provider-agnostic quota cascade below —
  // an exhausted brain must never be retried under another cascade slot.

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
  let _pass2JustInjected = false; // True for ONE iteration after Pass 2 is injected (for response logging)

  // Every route into Pass 2 goes through this one gate. Football cannot use
  // a timeout/stall shortcut to bypass the exact two-sided Pass 1 contract.
  // Other sports and props retain their existing progression behavior.
  const injectPass2 = (currentAssistantText = '') => {
    const latestAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    if (currentAssistantText && latestAssistant?.content !== currentAssistantText) {
      messages.push({ role: 'assistant', content: currentAssistantText });
    }

    const strictFootballCases = isNFLSport || isNCAAFSport;
    if (strictFootballCases) {
      const allAssistantText = messages
        .filter(m => m.role === 'assistant')
        .map(m => m.content || '')
        .join('\n\n');
      const caseCheck = validateBilateralCases(allAssistantText, homeTeam, awayTeam, {
        requireExplicitHeadings: true
      });

      if (!caseCheck.valid) {
        console.warn(`[Orchestrator] ⚠️ Football bilateral case contract failed (${caseCheck.reason}; homeLen=${caseCheck.homeLen}, awayLen=${caseCheck.awayLen}) — keeping Pass 1 active`);
        const casePrompt = bilateralFn
          ? bilateralFn(homeTeam, awayTeam)
          : `CASE FOR ${homeTeam.toUpperCase()} COVERING THE SPREAD:\nCASE FOR ${awayTeam.toUpperCase()} COVERING THE SPREAD:`;
        const retryMessage = `You are still in Pass 1. Your response did not satisfy the required two-sided football case format. Do not make a pick yet.\n\n${casePrompt}\n\nUse verified evidence for both sections. Then output exactly:\nINVESTIGATION COMPLETE`;
        messages.push({ role: 'user', content: retryMessage });
        nextMessageToSend = retryMessage;
        return false;
      }

      console.log(`[Orchestrator] Bilateral cases verified (homeLen=${caseCheck.homeLen}, awayLen=${caseCheck.awayLen})`);
    }

    const pass2Content = buildPass2Message(homeTeam, awayTeam, sport, options.spread ?? null, options.pass25DecisionGuards || '', options.game || {});
    messages.push({ role: 'user', content: pass2Content });
    nextMessageToSend = pass2Content;
    _pass2Injected = true;
    _pass2JustInjected = true;
    return true;
  };

  // Investigation stall detection — nudge completion marker if investigation loops
  let _lastCategoryCount = 0;
  let _investigationStallCount = 0;
  let _pass3Injected = false;
  let _extraIterationsUsed = 0; // Allow up to 2 iteration rewinds when all stats are already gathered (no new work done)
  let _statAuditRetried = false; // One corrective retry when the rationale cites numbers absent from provided data
  let _mlCapRetried = false; // One corrective re-ask when a moneyline breaks the house limit (payout law)

  const _flashCalledTokens = new Set(); // retained: dedup set consumers below survive the researcher kill

  const effectiveMaxIterations = CONFIG.maxIterations;

  // THE RESEARCHER RETURNS FOR MLB (founder GO, Sep 3 2026). The record:
  // June's engine with its research assistant went 188-136 (+26u); the
  // Jul 26 lane deletion turned it negative; the Aug 18 restoration went
  // 47-37 in its one week; the Aug 27 kill turned it negative again (57-69
  // since). "If it wins all of June and wins when we put it back in, it
  // needs to come back as it was Aug 17-23." This is that version: the
  // Haiku researcher investigates every factor with tools and web grounding
  // before Pass 1, its briefing rides the Pass 1 message, and Gary can hand
  // it up to six questions mid-investigation. Football stays desk-only
  // pending its own review (GARY_RESEARCHER=off disables it everywhere).
  let _researchBriefing = null;
  let _researcherFollowUpSession = null;
  let _researcherQuestionsUsed = 0;
  const RESEARCHER_QUESTION_BUDGET = 6;
  const RESEARCH_BRIEFING_TIMEOUT_MS = Number(process.env.GARY_RESEARCH_TIMEOUT_MS) || 8 * 60 * 1000;
  const researcherOn = String(process.env.GARY_RESEARCHER || 'on').toLowerCase() !== 'off'
    && (sport === 'baseball_mlb' || sport === 'MLB')
    && !!options.scoutReport;
  // A briefing handed in (the notebook shadow re-reading the main read's
  // desk, Sep 3 2026) is used as-is: same desk, same research, the
  // researcher paid once. Nothing else about the flow changes.
  const handedBriefing = typeof options.prebuiltResearchBriefing === 'string' && options.prebuiltResearchBriefing.trim()
    ? options.prebuiltResearchBriefing : null;
  if (researcherOn && handedBriefing) {
    _researchBriefing = handedBriefing;
    console.log(`[Research Briefing] ♻️ Re-using the main read's briefing (${_researchBriefing.length} chars) — the researcher is not run again`);
  } else if (researcherOn) {
    console.log(`[Research Briefing] 🔬 Running the research briefing (Haiku with tools) — Gary waits for completion`);
    try {
      const briefingResult = await Promise.race([
        buildResearchBriefing(options.scoutReport, sport, homeTeam, awayTeam, { ...options, _costTracker: costTracker }),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`research briefing timed out after ${RESEARCH_BRIEFING_TIMEOUT_MS / 1000}s`)), RESEARCH_BRIEFING_TIMEOUT_MS)),
      ]);
      if (briefingResult && typeof briefingResult === 'object') {
        _researchBriefing = briefingResult.briefing;
        if (briefingResult.calledTokens?.length > 0) {
          for (const { token } of briefingResult.calledTokens) {
            if (!token) continue;
            _flashCalledTokens.add(token);
            const base = token.split(':')[0];
            if (base && base !== token) _flashCalledTokens.add(base);
          }
        }
      } else if (briefingResult && typeof briefingResult === 'string') {
        _researchBriefing = briefingResult;
      }
      if (!_researchBriefing) throw new Error('the research assistant returned an empty briefing');
      console.log(`[Research Briefing] ✅ Briefing ready (${_researchBriefing.length} chars)`);
    } catch (err) {
      // The June engine hard-failed here (a game without its researcher is
      // not the June system). Kept: the runner's cascade re-runs the game.
      throw new Error(`[HARD FAIL] Research assistant failed for ${homeTeam} @ ${awayTeam} (${sport}): ${err.message}`);
    }
  }
  if (researcherOn) {
    const brainHasTools = !['claude-cli', 'codex-cli'].includes(currentSession?.provider);
    const investigateAsk = brainHasTools
      ? `Investigate further with your own fetch_stats calls wherever your read wants more evidence — duplicates of already-fetched stats return nothing new, so only novel requests cost anything. You can also hand a question to your research assistant: write a line starting with ASK RESEARCHER: followed by the question (one per line, up to 6 per game) and the answer comes back with verified figures.`
      : `Your research assistant stays on call. To dig deeper into anything — a split the briefing summarized, a number you want verified, a factor it did not cover — write a line starting with ASK RESEARCHER: followed by the question (one per line, up to 6 per game). The answers come back with verified figures before you continue. Weigh the briefing's findings honestly rather than repeating them.`;
    const briefingBlock = `\n\n## RESEARCH BRIEFING (from your research assistant)\n\nYour research assistant investigated every factor with full tool access. These are structured, verified findings. Everything it covers is already fetched.\n\n${_researchBriefing}\n\n---\n\n${investigateAsk}`;
    userMessage = userMessage + briefingBlock;
    nextMessageToSend = userMessage;
    messages[1] = { role: 'user', content: userMessage };
    console.log(`[Orchestrator] 📋 Research briefing included before Pass 1 (${_researchBriefing.length} chars)`);
  }


  while (iteration < effectiveMaxIterations) {
    iteration++;
    console.log(`\n[Orchestrator] Iteration ${iteration}/${effectiveMaxIterations} (${provider}, ${currentModelName})`);

    // Get the spread for Pass 2 context injection (available throughout loop)
    const spread = options.spread ?? null;

    let response;
    let message;
    let finishReason;

    if (provider === 'session' && currentSession) {
      // ═══════════════════════════════════════════════════════════════════════
      // PERSISTENT SESSION API CALL
      // ═══════════════════════════════════════════════════════════════════════
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
          // If so, send the pass message immediately as a follow-up.
          //
          // The Pass 1 stall reminder ("You are still in Pass 1...") was previously
          // built and queued but never routed because its keyword wasn't in this
          // filter — see Phillies@Padres incident 2026-05-27. Adding it here so
          // the existing stall-detection code can actually nudge Gary instead of
          // logging into the void.
          const hasQueuedPassMessage = nextMessageToSend && nextMessageToSend !== userMessage &&
            (nextMessageToSend.includes('PASS 2') || nextMessageToSend.includes('CASE REVIEW') ||
             nextMessageToSend.includes('CASE EVALUATION') || nextMessageToSend.includes('investigation is complete') ||
             nextMessageToSend.includes('You are still in Pass 1'));
          
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
            nextMessageToSend = `Continue: synthesize from the desk — it is your complete evidence — and finish the current pass.`;
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

        // Log Pass 2 response content for debugging (FULL — no truncation)
        if (_pass2JustInjected && message.content && !message.tool_calls?.length) {
          console.log(`\n📋 GARY'S PASS 2 EVALUATION (${message.content.length} chars):\n${'─'.repeat(60)}`);
          console.log(message.content);
          console.log(`${'─'.repeat(60)}\n`);
          _pass2JustInjected = false;
        }

      } catch (error) {
        if (error.isQuotaError) {
          // ONE BRAIN PER PICK (founder, Aug 27: "i want the same core brain
          // to be actually making and writing the rationale so we know its
          // truly organic"). The mid-conversation model switch — a new brain
          // continuing THIS game on a summary transplant of the context —
          // is dead. A quota error now throws to the runner, which re-runs
          // the ENTIRE game from the top on the next brain in the cascade:
          // whoever writes the rationale also did the investigation.
          throw error;
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

    } else if (provider === 'session') {
      // No session available — this should never happen in normal operation
      throw new Error('No active model session available');
    }

    // Handle empty response from Gemini (common when model is confused)
    if (provider === 'session' && !message.content && !message.tool_calls) {
      // Check what pass we're in to provide appropriate nudge
      let nudgeContent;

      if (_pass2Injected) {
        // Pass 2 already sent - need decision, not stats
        console.log(`[Orchestrator] ⚠️ Gemini returned empty response after Pass 2 - requesting decision output`);
        nudgeContent = `You didn't provide a response. Evaluate both sides and make your pick in natural language. Do NOT output JSON — the final formatted output comes in the next step.`;
      } else {
        // Still in investigation phase — check investigation breadth
        const { sufficient, categoryCount, totalCalls } = isInvestigationSufficient(toolCallHistory, iteration);

        if (sufficient) {
          // FORCE-PROGRESSION on empty response: if iterations are running out, inject Pass 2 directly.
          // Empty completion + late iteration = Gary is stuck. Force him to commit instead of looping to MAX.
          if (iteration >= effectiveMaxIterations - 3) {
            console.warn(`[Orchestrator] FORCE-PROGRESSION (empty response): iteration ${iteration}/${effectiveMaxIterations} with ${totalCalls} stats across ${categoryCount} categories — injecting Pass 2 to avoid pipeline timeout`);
            injectPass2();
            continue;
          }
          // Enough investigation — tell Gary to wrap up investigation (NOT to decide)
          console.log(`[Orchestrator] Gary has ${totalCalls} stats across ${categoryCount} categories — pushing to proceed`);
          nudgeContent = `You have ${totalCalls} stats gathered across ${categoryCount} categories. If there are remaining critical factual gaps, request only those stats. Otherwise, finish Pass 1 synthesis and output exactly:\nINVESTIGATION COMPLETE`;
        } else {
          console.log(`[Orchestrator] ⚠️ Empty response (${totalCalls} stats, ${categoryCount} categories) — nudging Pass 1 forward`);
          // Desk-only game brains have NO tools — a fetch_stats instruction
          // here (the pre-Sep-1 wording) told Gary to call a tool that does
          // not exist, and an empty-response streak would loop on it to the
          // iteration cap.
          nudgeContent = `You didn't respond. Continue reading the desk — it is your complete evidence. Finish your Pass 1 synthesis with both cases and then output exactly:\nINVESTIGATION COMPLETE`;
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
      // Include BOTH full tokens and base tokens to catch duplicates properly.
      // Also seed with Flash's calledTokens — the briefing already contains
      // findings for those tokens, so re-fetching them is wasted spend AND
      // wasted iteration budget. Gary's gathered-data recap and the briefing
      // together carry the information forward; the data is identical.
      const alreadyFetchedStats = new Set(_flashCalledTokens);
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
        if (_pass2Injected) {
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

        // Handle fetch_narrative_context tool (storylines, player news, context)
        if (functionName === 'fetch_narrative_context') {
          // Block narrative context after Pass 2 — investigation is over, Gary should be evaluating
          if (_pass2Injected) {
            console.log(`  → [NARRATIVE_CONTEXT] BLOCKED (Pass 2 injected — investigation phase over): "${args.query}"`);
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              name: functionName,
              content: JSON.stringify({ error: 'Investigation phase is complete. You have sufficient data. Continue your evaluation and make your pick. Do NOT request more data.' })
            });
            continue;
          }

          // Qualify queries to prevent contamination
          let groundingQuery = args.query;

          console.log(`  → [NARRATIVE_CONTEXT] for query: "${groundingQuery}"`);

          try {
            // ALL pick lanes ride the OpenAI search layer (Aug 18 2026,
            // one-system law — Gemini remains only as its internal quota
            // fallback). Same {success, data} contract.
            const { openaiWebSearch } = await import('../../pickdesk/webSearch.js');
            const searchResult = await openaiWebSearch(groundingQuery, { freshnessHours: 48 });

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
              console.log(`    ✓ Found narrative context via grounded search (${searchResult.data.length} chars)`);

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

          // LEAGUE ISOLATION (Sep 1 2026, the Chargers-on-Wake-Forest class):
          // this handler resolves against NFL teams and NFL advanced stats
          // unconditionally — refuse it outside NFL runs rather than hand a
          // college game pro data. (Tool path is dormant on bridge brains;
          // this is insurance for any future tool-capable lane.)
          if (!isNFLSport) {
            messages.push({
              role: 'tool', tool_call_id: toolCall.id, name: functionName,
              content: JSON.stringify({ error: 'fetch_nfl_player_stats is NFL-only — the leagues are isolated; use your desk data for this game.' })
            });
            continue;
          }

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
              'NCAAF': 'americanfootball_ncaaf',
              'MLB': 'baseball_mlb'
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
            } else if (args.sport === 'MLB') {
              // BDL exposes per-game stats via /mlb/v1/stats — flat shape
              // (ip, er, p_k, p_bb, ... for pitchers; at_bats, hits, hr, rbi, ... for batters).
              // Chrono helper joins real game dates + filters to completed
              // regular/postseason games so "last N" is provably the last N.
              const currentYear = new Date().getFullYear();
              logs = await ballDontLieService.getMlbPlayerGameRowsChrono(player.id, currentYear);
            } else if (args.sport === 'NFL') {
              const season = nflSeason();
              const allLogs = await ballDontLieService.getNflPlayerGameLogsBatch([player.id], season, numGames);
              logs = allLogs[player.id];
            } else {
              // BDL does not expose the NFL game-log endpoint for NCAAF.
              // Never relabel professional stats as college evidence.
              logs = [];
            }

            // Summarize player game logs for context efficiency.
            // MLB has a different stat shape than basketball, so it uses a
            // dedicated summarizer that detects pitcher vs batter.
            const logSummary = args.sport === 'MLB'
              ? summarizeMlbPlayerGameLogs(args.player_name, logs)
              : summarizePlayerGameLogs(args.player_name, logs);
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

        // Handle fetch_depth_chart tool (Tank01 depth charts)
        if (functionName === 'fetch_depth_chart') {
          const teamAbv = (args.team || '').toUpperCase().replace(/[^A-Z]/g, '');
          console.log(`  → [DEPTH_CHART] for ${teamAbv}`);
          try {
            const tank01 = (await import('../../tank01DfsService.js')).default;
            const result = await tank01.fetchDepthChart(teamAbv);
            const content = JSON.stringify(result);
            messages.push({ tool_call_id: toolCall.id, role: 'tool', name: functionName, content });
            console.log(`    [Tool Response] ${functionName}: ${teamAbv} — ${content.slice(0, 200)}...`);
            toolCallHistory.push({ token: `DEPTH_CHART:${teamAbv}`, timestamp: Date.now() });
          } catch (error) {
            messages.push({ tool_call_id: toolCall.id, role: 'tool', name: functionName, content: JSON.stringify({ error: error.message }) });
          }
          continue;
        }

        // Handle fetch_team_recent_stats tool (L1/L3/L5/L10 team stats from Tank01)
        if (functionName === 'fetch_team_recent_stats') {
          const numGames = args.num_games || 5;
          const teamAbv = (args.team || '').toUpperCase().replace(/[^A-Z]/g, '');
          console.log(`  → [TEAM_L${numGames}_STATS] for ${teamAbv}`);
          try {
            const tank01 = (await import('../../tank01DfsService.js')).default;
            const dateStr = options?.gameDate || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
            const result = await tank01.fetchTeamLStats(teamAbv, numGames, dateStr);
            const content = JSON.stringify(result);
            messages.push({ tool_call_id: toolCall.id, role: 'tool', name: functionName, content });
            console.log(`    [Tool Response] ${functionName}: L${numGames} ${teamAbv} — ${content.slice(0, 200)}...`);
            toolCallHistory.push({ token: `TEAM_L${numGames}_STATS:${teamAbv}`, timestamp: Date.now() });
          } catch (error) {
            console.error(`[Orchestrator] Error fetching team recent stats: ${error.message}`);
            messages.push({ tool_call_id: toolCall.id, role: 'tool', name: functionName, content: JSON.stringify({ error: error.message }) });
          }
          continue;
        }

        // Handle fetch_ncaaf_player_stats tool
        if (functionName === 'fetch_ncaaf_player_stats') {
          console.log(`  → [NCAAF_PLAYER_STATS:${args.stat_type}] for ${args.team}${args.player_name ? ` (${args.player_name})` : ''}`);

          try {
            const { ballDontLieService } = await import('../../ballDontLieService.js');

            let statResult = { stat_type: args.stat_type, team: args.team, data: [] };
            // Calculate NCAAF season dynamically
            const season = ncaafSeason();

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
              const seasonStats = await ballDontLieService.getNcaafPlayerSeasonStats({ teamId: team.id, season });

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
          if (v.includes('mlb') || v.includes('baseball')) return 'MLB';
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
      const pass2AlreadyInjected = _pass2Injected;
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
      // Gary uses findings from Pass 1 context to inform his decision in Pass 2.
      // ═══════════════════════════════════════════════════════════════════════
      // PHASE GUIDANCE — marker-based transition; this section only nudges completion
      // ═══════════════════════════════════════════════════════════════════════

      if (!pass2AlreadyInjected) {
        // When Gary keeps making tool calls past the stall threshold AND he
        // already has enough data, force progression to Pass 2 directly.
        // Previously this path only sent a "synthesize and emit the marker"
        // reminder that Gary often ignored — see Phillies@Padres (5058601)
        // 2026-05-27, where 8 consecutive PLAYER_GAME_LOGS calls in a row
        // never broke the category counter and Gary hit MAX_ITERATIONS with
        // zero picks. The text-only path has had this force-progression for
        // a while (line ~1730 below); this brings the tool-call path into
        // parity so a stuck tool-calling loop can still escape Pass 1.
        // Stall-based force-progression applies to BOTH game picks and props.
        // (Earlier version gated this to game picks only — that left props
        // stuck on tool-call loops, since props can never benefit from
        // category-based sufficiency due to PLAYER_GAME_LOGS:* token shape.)
        const stalledWithEnoughData =
          _investigationStallCount >= 3 && totalCalls >= 10;

        if (stalledWithEnoughData) {
          console.warn(`[Orchestrator] FORCE-PROGRESSION (stall-based, tool-call path): ${_investigationStallCount} stalls, ${totalCalls} stats, ${categoryCount} categories at iter ${iteration}/${effectiveMaxIterations} — injecting Pass 2 directly to avoid MAX_ITERATIONS timeout`);
          injectPass2(message.content);
        } else if (_investigationStallCount >= 3) {
          console.log(`[Orchestrator] Pass 1 stall detected at ${categoryCount} categories — nudging Gary to emit INVESTIGATION COMPLETE marker`);
          const casePromptStall = bilateralFn
            ? `\n\n${bilateralFn(homeTeam, awayTeam)}`
            : '';
          const synthesizeFrom = 'Synthesize what you already have from the desk — it is your complete evidence.';
          const completionNudge = `You are still in Pass 1. Do not make your pick yet.

${synthesizeFrom}
${casePromptStall}

When your Pass 1 synthesis is complete, output exactly:
INVESTIGATION COMPLETE`;
          messages.push({ role: 'user', content: completionNudge });
          nextMessageToSend = completionNudge;
        }
      } else if (pass2AlreadyInjected && !pass3AlreadyInjected) {
        // Pass 2 evaluation done — inject Pass 3 for final output
        const pass3Content = buildPass3Unified(homeTeam, awayTeam, options);
        messages.push({ role: 'user', content: pass3Content });
        _pass3Injected = true;
        console.log(`[Orchestrator] Injected Pass 3 (Final Output)`);
      }

      // ═══════════════════════════════════════════════════════════════════════
      // PREPARE FUNCTION RESPONSES FOR PERSISTENT SESSION
      // ═══════════════════════════════════════════════════════════════════════
      // Extract tool responses added to messages array during this iteration
      // Convert to format needed for sendToSession
      if (provider === 'session' && currentSession) {
          const lastAssistantIdx = messages.findLastIndex(m => m.role === 'assistant');
          const toolResponses = messages.slice(lastAssistantIdx + 1).filter(m => m.role === 'tool');

          if (toolResponses.length > 0) {
            // Convert to Gemini function response format
            const newResponses = toolResponses.map(tr => ({
              name: tr.name || 'tool_response',
              content: tr.content
            }));
            // Preserve any previously pushed responses (e.g., malformed-call errors)
            pendingFunctionResponses = [...pendingFunctionResponses, ...newResponses];
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
    // Pass 2 transition is marker-based only:
    // - inject Pass 2 only when Gary outputs INVESTIGATION COMPLETE
    // - otherwise keep Pass 1 active with a completion reminder
    // ═══════════════════════════════════════════════════════════════════════
    if (!_pass2Injected && iteration < effectiveMaxIterations) {
      const { categoryCount: gateCategories, totalCalls: gateCalls } = isInvestigationSufficient(toolCallHistory, iteration);
      const markedComplete = hasInvestigationCompleteMarker(message.content || '');

      // ASK-THE-RESEARCHER (founder GO, Aug 18 2026; restored Sep 3):
      // questions outrank a completion marker in the same message — the
      // answers block tells Gary to re-emit INVESTIGATION COMPLETE when he
      // is actually done.
      if (_researchBriefing) {
        const remaining = RESEARCHER_QUESTION_BUDGET - _researcherQuestionsUsed;
        const questions = remaining > 0 ? extractResearcherQuestions(message.content || '', remaining) : [];
        if (questions.length > 0) {
          messages.push({ role: 'assistant', content: message.content });
          _researcherQuestionsUsed += questions.length;
          console.log(`[Orchestrator] 🙋 ${questions.length} researcher question(s) from Gary (${_researcherQuestionsUsed}/${RESEARCHER_QUESTION_BUDGET} used)`);
          let answersText;
          try {
            if (!_researcherFollowUpSession) {
              _researcherFollowUpSession = await createResearcherFollowUpSession({
                scoutReportContent: options.scoutReport || '',
                briefing: _researchBriefing,
                sport, homeTeam, awayTeam,
                _costTracker: costTracker,
              });
            }
            answersText = await askResearcher(_researcherFollowUpSession, questions, { sport, homeTeam, awayTeam, options });
          } catch (err) {
            console.warn(`[Orchestrator] ⚠️ researcher follow-up failed: ${err.message}`);
            answersText = `The researcher could not be reached (${err.message}). Work from the desk and the briefing.`;
          }
          const budgetLine = _researcherQuestionsUsed >= RESEARCHER_QUESTION_BUDGET
            ? '\n\nYour question budget is exhausted — synthesize from what you have.'
            : `\n\nYou may ask ${RESEARCHER_QUESTION_BUDGET - _researcherQuestionsUsed} more question(s) the same way.`;
          const answersMsg = {
            role: 'user',
            content: `## RESEARCHER ANSWERS\n\n${answersText}${budgetLine}\n\nContinue Pass 1. When your synthesis is complete (including both cases), output exactly:\nINVESTIGATION COMPLETE`,
          };
          messages.push(answersMsg);
          nextMessageToSend = answersMsg;
          continue;
        }
      }

      if (markedComplete) {
        if (!isNFLSport && !isNCAAFSport) {
          // Football's first-turn prompt carries an exact two-sided section
          // contract. Do not let generic matchup prose masquerade as both
          // cases: that failure produced one-sided preseason decisions while
          // the old nickname counter logged a false success. Other sports
          // retain their existing soft parser behavior.
          const allAssistantText = messages.filter(m => m.role === 'assistant').map(m => m.content || '').join('\n\n') + '\n\n' + (message.content || '');
          const caseCheck = validateBilateralCases(allAssistantText, homeTeam, awayTeam);
          if (caseCheck.valid) {
            console.log(`[Orchestrator] Bilateral cases verified (homeLen=${caseCheck.homeLen}, awayLen=${caseCheck.awayLen})`);
          } else {
            console.warn(`[Orchestrator] ⚠️ Bilateral case parser could not confirm both sides (${caseCheck.reason}; homeLen=${caseCheck.homeLen}, awayLen=${caseCheck.awayLen}) — proceeding anyway`);
          }
        }

        // Explicit completion marker (text-only path) — inject Pass 2
        const pass2Ready = injectPass2(message.content);
        if (pass2Ready) {
          console.log(`[Orchestrator] Pipeline gate: INVESTIGATION COMPLETE received — injecting Pass 2 (${gateCategories} categories, ${gateCalls} calls)`);
        }
        continue;
      }

      // FORCE-PROGRESSION: Gary is running out of iterations but has plenty of data.
      // Inject Pass 2 directly to prevent MAX_ITERATIONS pipeline failure.
      // Threshold: within 3 of cap AND >=12 stats gathered.
      const forceProgress = (iteration >= effectiveMaxIterations - 3) && gateCalls >= 12;
      if (forceProgress) {
        console.warn(`[Orchestrator] FORCE-PROGRESSION: iteration ${iteration}/${effectiveMaxIterations} with ${gateCalls} stats across ${gateCategories} categories — injecting Pass 2 without INVESTIGATION COMPLETE marker to avoid pipeline timeout`);
        injectPass2(message.content);
        continue;
      }

      // No completion marker yet — keep Pass 1 active
      console.log(`[Orchestrator] Pass 1 remains active — waiting for INVESTIGATION COMPLETE (${gateCategories} categories, ${gateCalls} calls)`);
      messages.push({ role: 'assistant', content: message.content });
      const casePrompt = bilateralFn
        ? `\n\n${bilateralFn(homeTeam, awayTeam)}`
        : '';
      const synthesizeMsg = 'Synthesize from the desk — it is your complete evidence.';
      const pass1Reminder = {
        role: 'user',
        content: `You are still in Pass 1. Do not make your pick yet.

${synthesizeMsg}
${casePrompt}

When complete, output exactly:
INVESTIGATION COMPLETE`
      };
      messages.push(pass1Reminder);
      nextMessageToSend = pass1Reminder;
      continue;
    }

    // Use persistent flags (no false positives from message scanning)

    // Pass 3 — inject after Pass 2 completes
    if (_pass2Injected && !_pass3Injected && iteration < effectiveMaxIterations) {
      // Pass 2 now produces BOTH the prose card rationale AND a structured
      // JSON code block (see buildPass2Message in passBuilders.js). If the
      // JSON parses cleanly we have everything we need and Pass 3 — labeled
      // "FORMAT ONLY" in its own prompt — would just re-emit the same JSON.
      // Skip it. Saves one full round-trip (~25-28K input tokens) per game
      // without changing Gary's reasoning or the final pick content.
      {
        let earlyPick = null;
        try {
          earlyPick = parseGaryResponse(message.content, homeTeam, awayTeam, sport, options.game || {});
        } catch (e) {
          console.warn(`[Orchestrator] Pass 2 parse-first attempt threw: ${e.message} — falling through to Pass 3 injection`);
        }
        if (earlyPick) {
          // HOUSE LIMIT gate (before the stat audit — an illegal ticket gets
          // re-asked, not polished): one corrective re-ask, then hard-fail so
          // the lane's fallback rails take the game. A past-cap moneyline can
          // never ship.
          if (moneylinePastCap(earlyPick)) {
            if (!_mlCapRetried && iteration < effectiveMaxIterations) {
              _mlCapRetried = true;
              console.warn(`[Orchestrator] 🧱 HOUSE LIMIT: "${earlyPick.pick}" is heavier than ${GAME_ML_CAP} — corrective re-ask (the market is the runline/spread)`);
              messages.push({ role: 'assistant', content: message.content });
              const capMsg = { role: 'user', content: buildMlCapRetryMessage(sport, GAME_ML_CAP) };
              messages.push(capMsg);
              nextMessageToSend = capMsg;
              continue;
            }
            console.error(`[Orchestrator] ❌ HOUSE LIMIT violated twice ("${earlyPick.pick}") — failing the game to the lane's fallback rails`);
            return { error: `rails: moneyline past the ${GAME_ML_CAP} house limit` };
          }
          // Stat audit: every high-risk number in the rationale must trace to
          // provided data. The corrective retry fires only for RETRYABLE claims
          // (stale-memory signatures a re-prompt can fix); windowed/derived
          // claims get warnings without burning a round-trip — they fire on
          // ~23% of non-MLB picks and no tool can source them anyway.
          const audit = auditGamePick(earlyPick, messages);
          if (audit.retryable.length > 0 && !_statAuditRetried && iteration < effectiveMaxIterations) {
            _statAuditRetried = true;
            console.warn(`[StatAudit] ⚠️ ${audit.unsupported.length}/${audit.checked} numeric claim(s) not found in provided data (${audit.retryable.length} retryable) — requesting corrected rationale:\n  ${audit.unsupported.join('\n  ')}`);
            messages.push({ role: 'assistant', content: message.content });
            const retryMsg = buildStatAuditRetryMessage(audit.unsupported);
            messages.push({ role: 'user', content: retryMsg });
            nextMessageToSend = retryMsg;
            continue;
          }
          if (audit.unsupported.length > 0) {
            earlyPick._statAuditWarnings = audit.unsupported;
            console.warn(`[StatAudit] ⚠️ Shipping with ${audit.unsupported.length} unsupported numeric claim(s)${_statAuditRetried ? ' after corrective retry' : ' (warn-only — windowed/derived)'}:\n  ${audit.unsupported.join('\n  ')}`);
          } else if (audit.checked > 0) {
            console.log(`[StatAudit] ✓ All ${audit.checked} numeric claims trace to provided data`);
          }
          // Keep the stored narrative consistent with the rationale that ships
          // (matters after an audit retry, where the flagged draft would
          // otherwise be the last assistant turn in `messages`).
          messages.push({ role: 'assistant', content: message.content });

          console.log(`[Orchestrator] ✅ Pass 2 emitted valid JSON — skipping Pass 3 (saved 1 round-trip)`);
          earlyPick.toolCallHistory = toolCallHistory;
          earlyPick.iterations = iteration;
          earlyPick.rawAnalysis = message.content;
          // Attach the same narrative + briefing fields the normal final-return
          // path at the bottom of this loop attaches, so the pick object's
          // downstream consumers (logs / cost tracking) see identical metadata
          // regardless of which path produced the pick.
          try {
            earlyPick._fullAssistantNarrative = messages
              .filter(m => m.role === 'assistant' && m.content && typeof m.content === 'string')
              .map(m => m.content)
              .join('\n\n---\n\n');
            earlyPick._researchBriefing = _researchBriefing || null;
          } catch {
            // non-fatal — pick still ships
          }
          return earlyPick;
        }
        // No valid JSON in Pass 2 — fall through to Pass 3 injection as a
        // safety net. Gary still gets a chance to format properly.
        console.log(`[Orchestrator] Pass 2 did not contain parseable JSON — falling through to Pass 3 injection (safety net)`);
      }

      messages.push({ role: 'assistant', content: message.content });

      const pass3Content = buildPass3Unified(homeTeam, awayTeam, options);
      messages.push({ role: 'user', content: pass3Content });
      nextMessageToSend = pass3Content;
      _pass3Injected = true;
      console.log(`[Orchestrator] Injected Pass 3 - Final Output`);

      continue;
    }

    // Gary is done
    console.log(`[Orchestrator] Gary finished analysis (${finishReason})`);

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
          : `Your rationale is too short for a pick card. Provide your FULL analysis — your pick and the real reasons you landed on it, with the key evidence, in your own words and your own shape.

Output your complete pick JSON with the full rationale in the "rationale" field.`
      });

      continue; // Retry
    }

    if (pick) {
      // HOUSE LIMIT gate (same contract as the Pass 2 short-circuit exit).
      if (moneylinePastCap(pick)) {
        if (!_mlCapRetried && iteration < effectiveMaxIterations) {
          _mlCapRetried = true;
          console.warn(`[Orchestrator] 🧱 HOUSE LIMIT: "${pick.pick}" is heavier than ${GAME_ML_CAP} — corrective re-ask (the market is the runline/spread)`);
          messages.push({ role: 'assistant', content: message.content });
          const capMsg = { role: 'user', content: buildMlCapRetryMessage(sport, GAME_ML_CAP) };
          messages.push(capMsg);
          nextMessageToSend = capMsg;
          continue;
        }
        console.error(`[Orchestrator] ❌ HOUSE LIMIT violated twice ("${pick.pick}") — failing the game to the lane's fallback rails`);
        return { error: `rails: moneyline past the ${GAME_ML_CAP} house limit` };
      }

      // Stat audit (same contract as the Pass 2 short-circuit exit above):
      // retry only for retryable claims; windowed/derived claims warn-only.
      const audit = auditGamePick(pick, messages);
      if (audit.retryable.length > 0 && !_statAuditRetried && iteration < effectiveMaxIterations) {
        _statAuditRetried = true;
        console.warn(`[StatAudit] ⚠️ ${audit.unsupported.length}/${audit.checked} numeric claim(s) not found in provided data (${audit.retryable.length} retryable) — requesting corrected rationale:\n  ${audit.unsupported.join('\n  ')}`);
        messages.push({ role: 'assistant', content: message.content });
        const retryMsg = buildStatAuditRetryMessage(audit.unsupported);
        messages.push({ role: 'user', content: retryMsg });
        nextMessageToSend = retryMsg;
        continue;
      }
      if (audit.unsupported.length > 0) {
        pick._statAuditWarnings = audit.unsupported;
        console.warn(`[StatAudit] ⚠️ Shipping with ${audit.unsupported.length} unsupported numeric claim(s)${_statAuditRetried ? ' after corrective retry' : ' (warn-only — windowed/derived)'}:\n  ${audit.unsupported.join('\n  ')}`);
      } else if (audit.checked > 0) {
        console.log(`[StatAudit] ✓ All ${audit.checked} numeric claims trace to provided data`);
      }
      // Keep the stored narrative consistent with the rationale that ships
      // (matters after an audit retry, where the flagged draft would
      // otherwise be the last assistant turn in `messages`).
      messages.push({ role: 'assistant', content: message.content });

      pick.toolCallHistory = toolCallHistory;
      pick.iterations = iteration;
      pick.rawAnalysis = message.content;

      // Attach the full assistant-side narrative so the "Talk to Gary" feature
      // can reference Gary's bilateral case + Pass 2 synthesis later. We join
      // every assistant text turn — that captures the case for each side, the
      // synthesis, and the final analysis. Tool calls and system noise are skipped.
      try {
        pick._fullAssistantNarrative = messages
          .filter(m => m.role === 'assistant' && m.content && typeof m.content === 'string')
          .map(m => m.content)
          .join('\n\n---\n\n');
        pick._researchBriefing = _researchBriefing || null;
      } catch {
        // non-fatal — if we can't attach the narrative, the pick still ships
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
  // Game mode: Pipeline did not complete within max iterations — NO synthesis fallback
  // Every pick must come from the real pipeline (Pass 1→2.5→3). If the pipeline
  // can't complete, this game is reported as a failure. No fake/synthesized picks.
  console.error(`[Orchestrator] MAX ITERATIONS (${effectiveMaxIterations}) reached without completing pipeline for ${awayTeam} @ ${homeTeam}`);
  console.error(`[Orchestrator] Pipeline state: pass2=${_pass2Injected}, pass3=${_pass3Injected}`);
  console.error(`[Orchestrator] Stats gathered: ${toolCallHistory.length}, iterations: ${iteration}`);
  return {
    error: 'Pipeline did not complete within max iterations — no pick generated',
    toolCallHistory,
    iterations: iteration,
    homeTeam,
    awayTeam,
    sport,
    _pipelineState: { pass2: _pass2Injected, pass3: _pass3Injected },
    _statsGathered: toolCallHistory.length
  };

  } finally {
    costTracker.logSummary();
  }
}

/**
 * Parse Gary's response to extract the pick JSON
 * 
 * IMPORTANT: We try to extract a valid pick from JSON FIRST.
 * Pass indicators are only checked if no valid pick is found in JSON.
 * This prevents false positives like "moving on" in analysis from triggering PASS.
 */
