import { createGeminiSession, sendToSessionWithRetry, resetSessionChat } from './sessionManager.js';
import { getFlashInvestigationPrompt } from '../flashInvestigationPrompts.js';
import { getMlbSeasonAwareness } from './spreadEvaluationFactors.js';
import { GAME_RESEARCH_MODEL } from './orchestratorConfig.js';
import { ballDontLieService } from '../../ballDontLieService.js';
import { nbaSeason, nflSeason } from '../../../utils/dateUtils.js';
import { toolDefinitions, getTokensForSport } from '../tools/toolDefinitions.js';
import { fetchStats } from '../tools/statRouters/index.js';
import { summarizeStatForContext, summarizeNbaPlayerAdvancedStats, summarizeMlbPlayerGameLogs } from './orchestratorHelpers.js';
import { geminiGroundingSearch } from '../scoutReport/scoutReportBuilder.js';
import {
  buildResearchFactorPlan,
  findMissingRequiredResearchFactors,
  mapResearchFactors,
  researchConcurrencyForSport,
  shouldUseNflResearchBaseline
} from './footballResearchPolicy.js';

// ═══════════════════════════════════════════════════════════════════════════
// FLASH RESEARCH — Research Assistant + Context Extraction
// ═══════════════════════════════════════════════════════════════════════════
// Flash (Gemini 3 Flash) prepares a comprehensive pre-game research briefing.
// Also provides context extraction for 429 model-switch cascading.
// ═══════════════════════════════════════════════════════════════════════════


function getStringValue(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function extractJsonCandidate(rawText = '') {
  const text = String(rawText || '').trim();
  if (!text) return '';

  const fencedJsonMatch = text.match(/```json\s*([\s\S]*?)```/i);
  if (fencedJsonMatch?.[1]) return fencedJsonMatch[1].trim();

  const fencedAnyMatch = text.match(/```\s*([\s\S]*?)```/i);
  if (fencedAnyMatch?.[1]) return fencedAnyMatch[1].trim();

  if (text.startsWith('{') && text.endsWith('}')) return text;

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1).trim();
  }

  return '';
}

function parseStructuredBriefingPayload(rawText = '') {
  const candidate = extractJsonCandidate(rawText);
  if (!candidate) {
    return { payload: null, error: 'No JSON object found. Return ONLY one JSON object.' };
  }

  let parsed;
  try {
    parsed = JSON.parse(candidate);
  } catch (error) {
    return { payload: null, error: `Invalid JSON: ${error.message}` };
  }

  const root = parsed?.briefing && typeof parsed.briefing === 'object' ? parsed.briefing : parsed;
  const factors = Array.isArray(root?.factors) ? root.factors : null;
  if (!factors || factors.length === 0) {
    return { payload: null, error: 'JSON must include a non-empty "factors" array.' };
  }

  const normalizedFactors = [];
  const shapeIssues = [];

  factors.forEach((factor, index) => {
    const idx = index + 1;
    const factorName = getStringValue(factor?.factor, factor?.name, factor?.title);
    const keyFinding = getStringValue(factor?.keyFinding, factor?.key_finding, factor?.finding);
    const numbers = getStringValue(factor?.numbers, factor?.stats);
    const context = getStringValue(factor?.context, factor?.sampleContext, factor?.sample_context);

    normalizedFactors.push({
      factorName: factorName || `Factor ${idx}`,
      keyFinding,
      numbers,
      context
    });
  });

  return { payload: { factors: normalizedFactors }, error: null };
}

function renderStructuredBriefing(payload) {
  const blocks = [];
  for (const factor of payload.factors) {
    const lines = [
      `**${factor.factorName}**`,
      `Key finding: ${factor.keyFinding}`,
      `Numbers: ${factor.numbers}`,
      `Context: ${factor.context}`
    ];
    blocks.push(lines.join('\n'));
  }
  return blocks.join('\n\n').trim();
}

/**
 * Render compact prior-factor findings to carry forward into each factor's fresh
 * chat (Lever 1). Mirrors the directBriefing field resolution so prose-wrapped
 * findings carry too. Per-field caps keep the carry-forward block small across all
 * factors; the FULL text still lives in _accumulatedFactors for the final briefing.
 */
function renderFindingsSoFar(accumulated) {
  if (!accumulated || accumulated.length === 0) return '';
  const blocks = accumulated.map(f => {
    const name = f.factor || f.name || f.title || 'Unknown';
    const finding = String(f.keyFinding || f.key_finding || f.finding || '').slice(0, 260);
    const numbers = String(f.numbers || f.stats || '').slice(0, 260);
    const context = String(f.context || f.sample_context || '').slice(0, 220);
    return `**${name}**\nKey finding: ${finding}\nNumbers: ${numbers}\nContext: ${context}`;
  });
  return '## FINDINGS SO FAR (prior factor conclusions — build on these; do NOT re-investigate unless needed)\n\n' + blocks.join('\n\n');
}


/**
 * Extract FULL context from a session for model switching (429 cascade).
 * Rebuilds scout report + investigation stats for the fallback model.
 *
 * @param {Array} messages - Gemini-compatible message history
 * @param {Array} toolCallHistory - Full history of tool calls and results
 * @returns {string} - Complete context for fallback model
 */
export function extractTextualSummaryForModelSwitch(messages, toolCallHistory = []) {
  let summary = '';

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 1: Full Scout Report Data
  // ═══════════════════════════════════════════════════════════════════════════
  const scoutReportMsg = messages.findLast(m => m.role === 'user' && (m.content?.includes('SCOUT REPORT') || m.content?.includes('<scout_report>')));
  if (scoutReportMsg) {
    // Pass the FULL scout report, not just filtered lines
    // This includes injuries, standings, H2H, lineups, etc.
    summary += '## SCOUT REPORT (Full Context)\n';
    summary += scoutReportMsg.content + '\n\n'; // Full scout report — no truncation
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2: Investigation Stats — clean, readable format (no raw JSON)
  // ═══════════════════════════════════════════════════════════════════════════
  if (toolCallHistory && toolCallHistory.length > 0) {
    summary += '## INVESTIGATION STATS (Flash investigated these — use these numbers)\n\n';

    for (const call of toolCallHistory) {
      if (call.summary) {
        summary += `- ${call.summary}\n`;
      }
    }
    summary += '\n';
  }

  // Always anchor game identity — prevents wrong-game confusion after model switch
  const matchupMatch = messages[1]?.content?.match(/([\w][\w\s.'&-]+?)\s*(?:@|vs\.?|versus)\s*([\w][\w\s.'&-]+?)(?:\n|$)/);
  if (matchupMatch) {
    summary += `\n## CURRENT GAME: ${matchupMatch[1].trim()} @ ${matchupMatch[2].trim()}\n`;
  }

  return summary;
}

// ═══════════════════════════════════════════════════════════════════════════
// FLASH RESEARCH BRIEFING
// ═══════════════════════════════════════════════════════════════════════════
// Flash (Gemini 3 Flash) prepares a comprehensive pre-game briefing from the
// scout report. Flash is the research assistant who organizes the homework.
// Gary reads the briefing and investigates what matters.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a comprehensive research briefing via Gemini Flash.
 * Flash is the primary research agent — it reads the scout report, works through
 * the full per-sport factor checklist, uses tools to investigate every factor,
 * connects dots across findings, and writes an initial assessment.
 *
 * Returns { briefing, calledTokens } — the briefing is factual findings organized by factor.
 *
 * @param {string} scoutReportContent - Full scout report text
 * @param {string} sport - Sport identifier (e.g., 'basketball_nba')
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @param {Object} options - Game options (passed through to fetchStats)
 * @returns {{ briefing: string, calledTokens: Array }|null} - Research briefing + called tokens, or null on failure
 */
export async function buildFlashResearchBriefing(scoutReportContent, sport, homeTeam, awayTeam, options = {}) {
  const startTime = Date.now();
  try {
    // Strip every league-family prefix BDL uses, otherwise sportLabel ends up as
    // "BASEBALL_MLB" which has no entry in ALL_TOKENS_BY_SPORT — getTokensForSport
    // returns [], and the token-allowlist check at line ~298 silently passes any
    // hallucinated token through to the router (e.g. MLB_PLAYER_SEASON_STATS).
    const sportLabel = sport
      .replace('basketball_', '')
      .replace('americanfootball_', '')
      .replace('icehockey_', '')
      .replace('baseball_', '')
      .toUpperCase();

    const { INVESTIGATION_FACTORS } = await import('./investigationFactors.js');
    const sportFactors = INVESTIGATION_FACTORS[sport] || {};
    const researchFactorPlan = buildResearchFactorPlan(sport, sportFactors, options);
    const isNflAugustPreseasonScoutPlan = researchFactorPlan.mode === 'nfl_august_preseason_scout';

    // Flash token dedup cache — prevents re-fetching the same stat within a single game analysis
    const _flashTokenCache = new Map();
    // Accumulated factor findings — Flash writes each factor incrementally
    const _accumulatedFactors = [];
    // Game date (YYYY-MM-DD) for tools that need it (e.g., fetch_team_recent_stats / Tank01 L-N stats).
    // Falls back to today if commence_time isn't on the game object.
    const gameDate = options.gameTime
      ? new Date(options.gameTime).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];
    const hasResearchSeason = options.researchSeason !== null &&
      options.researchSeason !== undefined &&
      options.researchSeason !== '' &&
      Number.isInteger(Number(options.researchSeason));
    const researchOptions = hasResearchSeason
      ? { ...options, season: Number(options.researchSeason) }
      : options;
    const researchProvenanceBlock = options.researchSeasonLabel
      ? `## VERIFIED PERFORMANCE DATA WINDOW\nPerformance stat tools are pinned to: ${options.researchSeasonLabel}. Treat those numbers only as a team-performance baseline. Current roster, availability, lineups, and game-specific context come from the current scout report. Never describe the baseline as current-season form.\n`
      : '';

    // August NFL preseason has already paid for a current-state scout with QB
    // rotations, rested starters, roster depth, injuries and a provenance-
    // labeled prior-season baseline. Flash's job here is to analyze that exact
    // evidence, not launch the regular-season 18-factor fetch menu again.
    const investigationMethodology = isNflAugustPreseasonScoutPlan
      ? `## NFL PRESEASON EVIDENCE REVIEW

The verified scout report is the complete evidence source for this run. Analyze exactly these required factors: QB situation and rotation, skill-player availability/usage, injuries, trenches and available depth, coaching/playing-time intent, and prior-season efficiency as baseline context only.

Current preseason personnel, announced starter rest, rotations, injuries and coaching intent take priority over prior-season starter statistics. If the scout has no reliable evidence for part of a factor, say that plainly. Do not fill gaps with a prediction, betting opinion, or invented fact. Do not make a pick.`
      : getFlashInvestigationPrompt(sport, options.spread ?? null);

    // Flash gets the same stat tools Gary has (minus FINALIZE_PROPS)
    // All sports get fetch_narrative_context (grounding) — Flash handles narrative investigation
    const researchTools = isNflAugustPreseasonScoutPlan ? [] : toolDefinitions;

    const isNCAABSport = sport === 'basketball_ncaab' || sport === 'NCAAB';
    const isMLBSport = sport === 'baseball_mlb' || sport === 'MLB';
    const isNHLSport = sport === 'icehockey_nhl' || sport === 'NHL';
    // (Restored Aug 18 2026 — the June engine returns for MLB games.)
    const mlbAwarenessBlock = isMLBSport ? `\n\n${getMlbSeasonAwareness()}\n` : '';

    // All sports get high thinking + full output. Baseball especially needs depth
    // due to high variance, ballpark effects, and pitcher dominance.
    const flashThinkingLevel = 'high';
    const flashMaxOutput = undefined; // use CONFIG.maxTokens default

    const briefingSession = await createGeminiSession({
      _costTracker: options._costTracker || null,
      // EVERY game sport's research runs the Haiku tier (June engine, Aug 18
      // 2026 — the founder's one-system law: no Gemini in any pick lane).
      modelName: GAME_RESEARCH_MODEL,
      systemPrompt: `You are the research assistant for a sports bettor named Gary. Your job is to find the full context and nuance behind the stats — the stuff a human bettor would know but raw numbers don't show.

A stat by itself is just a number. Your job is to figure out WHY. An efficiency spike could be a real shift or 3 games against tanking teams. A player's absence could be devastating or already absorbed. A record could be misleading because of blowout variance. You find the story behind the data.

${isNflAugustPreseasonScoutPlan
  ? 'The current scout report already contains the required evidence. No research tools are enabled for this bounded preseason review.'
  : 'You have stat-fetching tools and a narrative context tool. USE THEM.'}

${investigationMethodology}
${mlbAwarenessBlock}
${researchProvenanceBlock}
CRITICAL RULES:
- Report specific numbers with context: "Team went 2-4 with -8.3 net rating during games 60-65 when Player X was out — but 3 of those were against top-10 defenses"
- Report each factor's findings, and weight them honestly: for each, note whether it meaningfully moves THIS game or is minor context. Most individual factors move a single game far less than they look like they do — say so when that's the case. Gary makes the final call and connects the dots, but your job is to tell him what carries real weight and what is small, not to present every factor as equally important
- If you reference opponent quality or recency distortion, include concrete evidence (named opponents and/or score/result context), not generic claims like "weaker opposition"
- When citing any trend (L5/L10 or recent stretch), include concrete sample context: opponent names/results and who was active/inactive in that window
- For search/grounding results, use factual events only. Ignore picks, predictions, and opinion content
- Do NOT pick a side or recommend a bet — your job is factual research only
- Do NOT fabricate stats — only report what comes from the scout report or your tool calls
- Every figure you cite must exist verbatim in the scout report or a tool return. A metric neither provides (wRC+, xERA, FIP, SIERA, BABIP, DRS, pop time, and the like) is NOT AVAILABLE — say so instead of recalling or deriving a value. Never present arithmetic you performed (a computed differential, an inferred rate) as a fetched stat; if you must derive, label it as your own calculation from named inputs

OUTPUT FORMAT — for each factor you investigate, write your findings as a JSON object:
{"factor": "Factor name", "keyFinding": "1-2 sentence finding", "numbers": "Concrete stats for BOTH teams — repeat the exact figures in THIS field; never leave it empty", "context": "Opponent quality / who played / sample window context — never leave it empty"}

Do NOT make a pick or recommendation.

## SCOUT REPORT (this game's data — the baseline for every factor)
${scoutReportContent}`,
      tools: researchTools,
      thinkingLevel: flashThinkingLevel,
      // Jul 8 cost audit: the scout report (~8K tokens) now lives INSIDE the
      // cached prefix (system prompt + tools) instead of riding every
      // per-factor seed at full price — it was re-billed on all ~30 calls per
      // game. Identical content, one full-price pass + 90%-off reuse.
      enableCache: true,
      ...(flashMaxOutput ? { maxOutputTokens: flashMaxOutput } : {})
    });

    const hasSpread = Number.isFinite(options.spread);
    const briefingPrompt = `## RESEARCH BRIEFING REQUEST

**Game:** ${homeTeam} vs ${awayTeam} (${sportLabel})
${hasSpread ? `**Spread:** ${options.spread}` : ''}
${options.researchSeasonLabel ? `**Performance data window:** ${options.researchSeasonLabel}` : ''}

The full scout report for this game is in your system context — it is your baseline for every factor. I will now ask you to investigate factors one at a time.${isNCAABSport ? ' (NCAAB: narrative context is already in the scout report — prefer fetch_stats for BDL data)' : ''}${isMLBSport ? `

(MLB: The scout report in your system context ALREADY contains the following — DO NOT re-fetch these tokens:
- DIVISION STANDINGS → covers MLB_STANDINGS, MLB_STANDINGS_STRUCTURED, MLB_TEAM_RECORD
- RECENT PERFORMANCE (L1/L3/L5/L10) + RECENT RESULTS → covers MLB_RECENT_FORM, MLB_RECENT_FORM_STRUCTURED, MLB_SEASON_FORM, MLB_RECENT_RESULTS
- INJURIES (BDL structured) → covers INJURIES, MLB_INJURIES
- CONFIRMED LINEUPS → covers MLB_LINEUP
- PROBABLE PITCHERS → identifies the starters (use MLB_PITCH_TYPES_SP for their per-pitch profile, MLB_PITCHER_RECENT_FORM for last 5 starts)
- PLAYER SEASON STATS (BDL) → covers MLB_TOP_PLAYERS; for hitters use MLB_KEY_HITTERS only if you need OPS/WAR sorting beyond what's already shown
- REST & SCHEDULE → covers MLB_REST_SITUATION, REST_SITUATION
- BETTING CONTEXT → covers MLB_ODDS
- CONTACT QUALITY ALLOWED (on each starter block) → season Barrel%/hard-hit%/GO-AO; use MLB_STATCAST only for last-3-games contact quality detail. xERA/FIP-class estimators are not on this desk and not in any tool — NOT AVAILABLE, never cite them

Investigate using fetch_stats for tokens that ADD information beyond the scout report:
- MLB_PITCH_TYPES_SP — per-pitch xwOBA/whiff%/chase% for both probable starters (NEW signal not in scout)
- MLB_PLAYER_SPLITS — L/R, day/night, byArena splits
- MLB_BATTER_VS_PITCHER — career BvP history
- MLB_BULLPEN, MLB_BULLPEN_WORKLOAD, MLB_CLOSER_RELIEVER_STATS — bullpen depth + day-of availability
- MLB_PITCHER_RECENT_FORM, MLB_PITCHER_SEASON_STATS — pitcher form not fully covered by scout
- MLB_CATCHER_DEFENSE, MLB_TEAM_DEFENSE, MLB_RISP_SITUATIONAL — defensive + clutch context
- MLB_STATCAST — last-3-games contact quality (exit velo, launch angle, xwOBA, bat speed, whiff/chase)
- MLB_PARK_FACTORS, MLB_WEATHER — venue and conditions

Use fetch_narrative_context ONLY for breaking news or game-thread context that no token covers.)` : ''}${isNHLSport ? ' (NHL: The scout report already includes confirmed starting goalies, lineups, power play units, and injuries from RotoWire. Do NOT use fetch_narrative_context to re-search for goalies, lineups, injuries, or PP/PK stats — all of this is in the scout report. Use grounding ONLY for context not in the scout report like recent player performance narrative or trade news.)' : ''}`;

    console.log(`[Research Briefing] Sending scout report to Gemini Flash (factor-by-factor investigation)`);

    // ═══════════════════════════════════════════════════════════════════════
    // FACTOR-BY-FACTOR RESEARCH LOOP
    // The orchestrator drives which factor Flash investigates.
    // Flash calls tokens, gets results, writes the analysis — one factor at a time.
    // ═══════════════════════════════════════════════════════════════════════
    let totalToolCalls = 0;
    let groundingCalls = 0;
    const calledTokens = [];

    // Step 1: (Lever 1) The scout report is NO LONGER sent once globally. It now
    // seeds each factor's fresh chat via resetSessionChat (below), so prior factors'
    // raw tool-result blobs are not re-billed on every later factor.

    // Step 2: Get the exact factor plan for this run. Regular-season paths use
    // the complete configured map. Verified August NFL preseason uses the
    // bounded, fail-closed scout review defined in footballResearchPolicy.
    const allFactorNames = researchFactorPlan.factors.map((factor) => factor.name);
    const factorNames = researchFactorPlan.factors.filter((factor) => factor.tokens.length > 0);

    console.log(`[Research Briefing] ${allFactorNames.length} factors to investigate (${factorNames.length} with tokens, mode=${researchFactorPlan.mode})`);

    // Step 3: Investigate every factor. NFL factors are independent homework
    // lanes, so run a small bounded pool against separate chats created from
    // the same cached model. Other sports retain the exact serial behavior.
    const researchConcurrency = researchConcurrencyForSport(sport);
    const completedFactorFindings = new Array(allFactorNames.length);
    let completedFactorCount = 0;
    console.log(`[Research Briefing] Factor worker concurrency: ${researchConcurrency}`);

    const factorResults = await mapResearchFactors(
      researchFactorPlan.factors,
      researchConcurrency,
      async (factorPlan, fi) => {
      const factorName = factorPlan.name;
      const factorTokens = factorPlan.tokens;

      const factorPrompt = isNflAugustPreseasonScoutPlan
        ? `Analyze required NFL preseason factor: ${factorName}. Use only the verified scout report in your context. Return factual findings for BOTH teams; distinguish current preseason personnel/rotation evidence from the prior-season performance baseline. If evidence is unavailable, state that plainly. Return exactly one JSON object and do not make a pick.`
        : factorTokens.length > 0
        ? `Investigate factor: ${factorName} now and write your findings.`
        : `Analyze factor: ${factorName} using the data already in the scout report and write your findings.`;

      // Lever 1: reset the chat for this factor (reusing the cached model) so prior
      // factors' raw tool-result blobs are no longer re-sent every turn. Seed with the
      // scout report + compact findings-so-far so each factor still investigates with
      // full context + all prior CONCLUSIONS. resetSessionChat re-attaches the system
      // prompt inline if the session is not cache-backed (never a naked chat).
      const _findingsSoFar = renderFindingsSoFar(completedFactorFindings.filter(Boolean));
      const _seedUserText = _findingsSoFar ? `${briefingPrompt}\n\n---\n\n${_findingsSoFar}` : briefingPrompt;
      // Clone only the mutable chat handle. All factor sessions reuse the one
      // cache-backed GenerativeModel; no additional cache or system prompt is
      // created, and thought-signature histories remain isolated per factor.
      const factorSession = researchConcurrency > 1 ? { ...briefingSession } : briefingSession;
      resetSessionChat(factorSession, [
        { role: 'user', parts: [{ text: _seedUserText }] },
        { role: 'model', parts: [{ text: 'Understood. I have the scout report and all prior findings. Tell me the next factor to investigate and I will return exactly one JSON object.' }] }
      ]);

      // Flash investigates this factor — may take multiple iterations for tool calls
      let currentMessage = factorPrompt;
      let isFunctionResponse = false;
      const MAX_FACTOR_ITERATIONS = 5; // All sports: 5 rounds per factor for full investigation

      for (let iter = 0; iter < MAX_FACTOR_ITERATIONS; iter++) {
        const response = await sendToSessionWithRetry(factorSession, currentMessage, { isFunctionResponse });

        // Process tool calls if Flash wants to fetch stats
        if (response.toolCalls && response.toolCalls.length > 0) {
          const functionResponses = [];
          for (const toolCall of response.toolCalls) {
            const functionName = toolCall.function?.name || toolCall.type;
            const args = JSON.parse(toolCall.function?.arguments || '{}');

            if (functionName === 'fetch_stats') {
              // Gemini sometimes emits the call with `stat_type` instead of
              // `token`. agentLoop.js handles this at line ~1468; mirror it
              // here so Flash doesn't pass `undefined` straight into fetchStats.
              const token = args.token || args.stat_type;
              totalToolCalls++;

              if (!token) {
                functionResponses.push({ name: functionName, content: `Error: fetch_stats called without a "token" argument. Re-issue the call with a valid token name (e.g. {"token":"MLB_PITCHER_RECENT_FORM"}).` });
                continue;
              }

              const menuSport = sportLabel;
              const allowedTokens = getTokensForSport(menuSport);
              if (Array.isArray(allowedTokens) && allowedTokens.length > 0 && !allowedTokens.includes(token)) {
                functionResponses.push({ name: functionName, content: `${token}: Not available for ${menuSport}.` });
                continue;
              }

              // Dedup cache
              if (_flashTokenCache.has(token)) {
                functionResponses.push({ name: functionName, content: _flashTokenCache.get(token) });
                continue;
              }

              try {
                const statOptions = hasResearchSeason && shouldUseNflResearchBaseline(sport, token)
                  ? researchOptions
                  : options;
                const statResult = await fetchStats(sport, token, homeTeam, awayTeam, statOptions);
                const hasError = statResult?.error;
                const statSummary = summarizeStatForContext(statResult, token, homeTeam, awayTeam);
                functionResponses.push({ name: functionName, content: statSummary });
                _flashTokenCache.set(token, statSummary);
                console.log(`    [Tool Response] ${token}: ${statSummary.slice(0, 200)}${statSummary.length > 200 ? '...' : ''}`);
                calledTokens.push({ token, quality: hasError ? 'unavailable' : 'available' });
              } catch (err) {
                functionResponses.push({ name: functionName, content: `Error fetching ${token}: ${err.message}` });
                calledTokens.push({ token, quality: 'unavailable' });
              }
            } else if (functionName === 'fetch_narrative_context') {
              // Grounding budget per game (Jul 8 2026 cost audit):
              //   NHL 10 — RotoWire-era cap; revisit when the season starts in October.
              //   MLB + others 4 — structured tokens cover stats/lineups/injuries;
              //           grounding is for breaking news no token can answer.
              const MAX_GROUNDING_CALLS = isNHLSport ? 10 : 4;
              if (groundingCalls >= MAX_GROUNDING_CALLS) {
                console.log(`  → [Research Grounding] SKIPPED (cap reached: ${groundingCalls}/${MAX_GROUNDING_CALLS}): "${(args.query || '').slice(0, 80)}"`);
                functionResponses.push({ name: functionName, content: `Grounding call limit reached (${MAX_GROUNDING_CALLS}). Use available stat tokens and scout report data instead.` });
              } else {
                groundingCalls++;
                if (options._costTracker) options._costTracker.addGroundingCall();
                const query = args.query || '';
                console.log(`  → [Research Grounding] "${query}" (${groundingCalls}/${MAX_GROUNDING_CALLS})`);
                try {
                  // ALL pick lanes ride the OpenAI search layer (Aug 18 2026,
                  // one-system law; Gemini remains only as its internal quota
                  // fallback) — same return contract, unwrap is provider-blind.
                  const { openaiWebSearch } = await import('../../pickdesk/webSearch.js');
                  const groundingResult = await openaiWebSearch(query, { freshnessHours: 48 });
                  const groundingText = typeof groundingResult === 'string' ? groundingResult : (groundingResult?.data || groundingResult?.text || 'No results');
                  console.log(`    ✓ Grounding result (${groundingText.length} chars)`);
                  functionResponses.push({ name: functionName, content: groundingText });
                } catch (err) {
                  functionResponses.push({ name: functionName, content: `Search error: ${err.message}` });
                }
              }
            } else if (functionName === 'fetch_player_game_logs') {
              totalToolCalls++;
              try {
                // Map LLM-facing sport label → BDL service sport key. MLB was
                // missing here, so MLB player lookups silently fell into the
                // NFL else-branch below and hit /nfl/v1/... with 401s for every
                // pitcher and batter Flash investigated.
                const sportKeyMap = {
                  'NBA': 'basketball_nba',
                  'NFL': 'americanfootball_nfl',
                  'NHL': 'icehockey_nhl',
                  'NCAAB': 'basketball_ncaab',
                  'NCAAF': 'americanfootball_ncaaf',
                  'MLB': 'baseball_mlb',
                };
                const sportKey = sportKeyMap[args.sport] || sport;
                const numGames = args.num_games || 5;
                const nameParts = (args.player_name || '').trim().split(' ');
                const lastName = nameParts[nameParts.length - 1];
                const searchTerm = nameParts.length > 1 ? args.player_name.trim() : lastName;
                let playersResp = await ballDontLieService.getPlayersGeneric(sportKey, { search: searchTerm, per_page: 25 });
                let players = Array.isArray(playersResp) ? playersResp : (playersResp?.data || []);
                if (players.length === 0 && searchTerm !== lastName) {
                  playersResp = await ballDontLieService.getPlayersGeneric(sportKey, { search: lastName, per_page: 25 });
                  players = Array.isArray(playersResp) ? playersResp : (playersResp?.data || []);
                }
                const fullNameLower = (args.player_name || '').toLowerCase();
                const player = players.find(p => `${p.first_name} ${p.last_name}`.toLowerCase() === fullNameLower) || players.find(p => p.last_name?.toLowerCase() === lastName.toLowerCase());
                if (!player) {
                  functionResponses.push({ name: functionName, content: JSON.stringify({ error: `Player "${args.player_name}" not found` }) });
                } else {
                  let logs;
                  let logContent;
                  if (args.sport === 'NBA') {
                    logs = await ballDontLieService.getNbaPlayerGameLogs(player.id, numGames);
                    logContent = JSON.stringify({ player: args.player_name, sport: 'NBA', logs: logs || [] });
                  } else if (args.sport === 'NCAAB') {
                    logs = await ballDontLieService.getNcaabPlayerGameLogs(player.id, numGames);
                    logContent = JSON.stringify({ player: args.player_name, sport: 'NCAAB', logs: logs || [] });
                  } else if (args.sport === 'NHL') {
                    logs = await ballDontLieService.getNhlPlayerGameLogs(player.id, numGames);
                    logContent = JSON.stringify({ player: args.player_name, sport: 'NHL', logs: logs || [] });
                  } else if (args.sport === 'MLB') {
                    // MLB per-game stats use BDL's /mlb/v1/stats — flat shape
                    // (pitcher: ip/er/p_k/p_bb; batter: at_bats/hits/hr/rbi).
                    // Mirrors agentLoop.js MLB branch. Chrono helper joins
                    // real game dates + drops spring/in-progress rows.
                    const currentYear = new Date().getFullYear();
                    logs = await ballDontLieService.getMlbPlayerGameRowsChrono(player.id, currentYear);
                    // Use the pitcher/batter-aware summarizer instead of raw JSON
                    // so the briefing gets the same compact format Gary's path does.
                    logContent = summarizeMlbPlayerGameLogs(args.player_name, logs);
                  } else if (args.sport === 'NFL' || args.sport === 'NCAAF') {
                    const s = args.sport === 'NFL' && hasResearchSeason
                      ? Number(options.researchSeason)
                      : nflSeason();
                    const all = await ballDontLieService.getNflPlayerGameLogsBatch([player.id], s, numGames);
                    logs = all[player.id];
                    logContent = JSON.stringify({
                      player: args.player_name,
                      sport: args.sport,
                      data_window: args.sport === 'NFL' ? (options.researchSeasonLabel || String(s)) : String(s),
                      logs: logs || []
                    });
                  } else {
                    // Unknown sport — return an explicit error instead of
                    // silently hitting NFL endpoints (the prior bug).
                    functionResponses.push({ name: functionName, content: JSON.stringify({ error: `Unknown sport "${args.sport}" — pass one of NBA, NHL, MLB, NFL, NCAAB, NCAAF.` }) });
                    continue;
                  }
                  functionResponses.push({ name: functionName, content: logContent });
                  console.log(`    [Tool Response] ${functionName}: ${logContent.slice(0, 200)}...`);
                  calledTokens.push({ token: `PLAYER_GAME_LOGS:${args.player_name}`, quality: 'available' });
                }
              } catch (err) {
                functionResponses.push({ name: functionName, content: `Error: ${err.message}` });
              }
            } else if (functionName === 'fetch_nba_player_stats') {
              totalToolCalls++;
              try {
                const teams = await ballDontLieService.getTeams('basketball_nba');
                const team = teams.find(t => t.full_name?.toLowerCase().includes(args.team.toLowerCase()) || t.name?.toLowerCase().includes(args.team.toLowerCase()));
                if (!team) {
                  functionResponses.push({ name: functionName, content: JSON.stringify({ error: `Team "${args.team}" not found` }) });
                } else {
                  const season = nbaSeason();
                  const typeMap = { 'ADVANCED': 'advanced', 'USAGE': 'usage', 'DEFENSIVE': 'defense', 'TRENDS': 'base' };
                  const categoryMap = { 'ADVANCED': 'general', 'USAGE': 'general', 'DEFENSIVE': 'defense', 'TRENDS': 'general' };
                  let playerIds = [];
                  if (args.player_name) {
                    const pResp = await ballDontLieService.getPlayersGeneric('basketball_nba', { search: args.player_name, per_page: 5 });
                    const pArr = Array.isArray(pResp) ? pResp : (pResp?.data || []);
                    const found = pArr.find(p => `${p.first_name} ${p.last_name}`.toLowerCase().includes(args.player_name.toLowerCase()));
                    if (found) playerIds = [found.id];
                  }
                  if (playerIds.length === 0) {
                    const activeResp = await ballDontLieService.getPlayersGeneric('basketball_nba', { team_ids: [team.id], per_page: 20 });
                    const active = Array.isArray(activeResp) ? activeResp : (activeResp?.data || []);
                    playerIds = active.slice(0, 10).map(p => p.id);
                  }
                  const stats = await ballDontLieService.getNbaSeasonAverages({ category: categoryMap[args.stat_type], type: typeMap[args.stat_type], season, player_ids: playerIds });
                  const nbaStatsSummary = summarizeNbaPlayerAdvancedStats(stats, args.stat_type, team.full_name);
                  functionResponses.push({ name: functionName, content: nbaStatsSummary });
                  console.log(`    [Tool Response] ${functionName}: ${nbaStatsSummary.slice(0, 200)}...`);
                  calledTokens.push({ token: `NBA_PLAYER_STATS:${args.stat_type}`, quality: 'available' });
                }
              } catch (err) {
                functionResponses.push({ name: functionName, content: JSON.stringify({ error: `NBA player stats failed: ${err.message}` }) });
              }
            } else if (functionName === 'fetch_depth_chart') {
              totalToolCalls++;
              try {
                const tank01 = (await import('../../tank01DfsService.js')).default;
                const teamAbv = (args.team || '').toUpperCase().replace(/[^A-Z]/g, '');
                const result = await tank01.fetchDepthChart(teamAbv);
                const content = JSON.stringify(result);
                functionResponses.push({ name: functionName, content });
                console.log(`    [Tool Response] ${functionName}: ${teamAbv} depth chart — ${content.slice(0, 200)}...`);
                calledTokens.push({ token: `DEPTH_CHART:${teamAbv}`, quality: 'available' });
              } catch (err) {
                functionResponses.push({ name: functionName, content: JSON.stringify({ error: `Depth chart failed: ${err.message}` }) });
              }
            } else if (functionName === 'fetch_team_recent_stats') {
              totalToolCalls++;
              try {
                const tank01 = (await import('../../tank01DfsService.js')).default;
                const numGames = args.num_games || 5;
                const teamAbv = (args.team || '').toUpperCase().replace(/[^A-Z]/g, '');
                const dateStr = gameDate || new Date().toISOString().split('T')[0];
                const result = await tank01.fetchTeamLStats(teamAbv, numGames, dateStr);
                const content = JSON.stringify(result);
                functionResponses.push({ name: functionName, content });
                console.log(`    [Tool Response] ${functionName}: L${numGames} ${teamAbv} — ${content.slice(0, 200)}...`);
                calledTokens.push({ token: `TEAM_L${numGames}_STATS:${teamAbv}`, quality: 'available' });
              } catch (err) {
                functionResponses.push({ name: functionName, content: JSON.stringify({ error: `Team recent stats failed: ${err.message}` }) });
              }
            } else {
              functionResponses.push({ name: functionName, content: `Unknown tool: ${functionName}` });
            }
          }
          currentMessage = functionResponses;
          isFunctionResponse = true;
          continue; // Back to inner loop — Flash might want more tool calls for this factor
        }

        // Flash wrote text — this is the factor finding
        if (response.content) {
          const content = response.content.trim();
          // Extract factor JSON from response
          try {
            // Try parsing the whole response as JSON
            const factorObj = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] || content);
            factorObj.factor = factorObj.factor || factorObj.name || factorObj.title || factorName;
            completedFactorFindings[fi] = factorObj;
            completedFactorCount += 1;
            console.log(`[Research Briefing] ✓ Factor "${factorObj.factor}" complete (${completedFactorCount}/${allFactorNames.length})`);
            return factorObj;
          } catch {
            // Flash wrote prose instead of JSON — wrap it
            const proseFactor = {
              factor: factorName,
              keyFinding: content.slice(0, 200),
              numbers: '',
              context: content
            };
            completedFactorFindings[fi] = proseFactor;
            completedFactorCount += 1;
            console.log(`[Research Briefing] ✓ Factor "${factorName}" complete (prose, ${completedFactorCount}/${allFactorNames.length})`);
            return proseFactor;
          }
        }

        return null; // No content and no tool calls — preserve existing skip semantics
      }
      return null;
      }
    );

    const missingRequiredFactors = findMissingRequiredResearchFactors(researchFactorPlan, factorResults);
    if (missingRequiredFactors.length > 0) {
      throw new Error(`[HARD FAIL] Required ${researchFactorPlan.mode} factors incomplete: ${missingRequiredFactors.join(', ')}`);
    }
    _accumulatedFactors.push(...factorResults.filter(Boolean));

    // Step 4: Render briefing from accumulated factors
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const coverage = _accumulatedFactors.length / allFactorNames.length;
    console.log(`[Research Briefing] ✅ ${_accumulatedFactors.length}/${allFactorNames.length} factors completed in ${elapsed}s (${totalToolCalls} stat + ${groundingCalls} grounding calls)`);

    // Data quality check — warn about factors with empty findings
    const emptyFactors = _accumulatedFactors.filter(f => !f.keyFinding && !f.numbers);
    if (emptyFactors.length > 0) {
      console.warn(`[Research Briefing] ⚠️ ${emptyFactors.length} factors have empty findings: ${emptyFactors.map(f => f.factor).join(', ')}`);
    }

    if (_accumulatedFactors.length === 0) {
      console.error(`[Research Briefing] ❌ No factors accumulated — briefing failed`);
      return null;
    }

    // Parse and render — normalize Flash's JSON keys then render to text for Gary
    const combinedPayload = JSON.stringify({ factors: _accumulatedFactors });
    const parsed = parseStructuredBriefingPayload(combinedPayload);
    if (!parsed.payload) {
      console.warn(`[Research Briefing] Parse issue: ${parsed.error} — rendering directly`);
      // Fallback: render directly from accumulated factors without normalization
      const directBriefing = _accumulatedFactors.map(f => {
        const name = f.factor || f.name || f.title || 'Unknown';
        const finding = f.keyFinding || f.key_finding || f.finding || '';
        const numbers = f.numbers || f.stats || '';
        const context = f.context || f.sample_context || '';
        return `**${name}**\nKey finding: ${finding}\nNumbers: ${numbers}\nContext: ${context}`;
      }).join('\n\n');
      return { briefing: directBriefing, calledTokens };
    }

    const briefing = renderStructuredBriefing(parsed.payload);
    console.log(`[Research Briefing] ✅ Briefing rendered (${briefing.length} chars)`);

    // Coverage diagnostics
    const availableCount = calledTokens.filter(t => t.quality === 'available').length;
    const unavailableCount = calledTokens.filter(t => t.quality === 'unavailable').length;
    console.log(`[Research Briefing] Token coverage: ${availableCount} available, ${unavailableCount} unavailable out of ${calledTokens.length} total calls`);

    if (coverage < 0.5) {
      console.warn(`[Research Briefing] ⚠️ Low factor coverage: ${(coverage * 100).toFixed(0)}% — ${allFactorNames.length - _accumulatedFactors.length} factors missing`);
    }

    return { briefing, calledTokens };

  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const isQuota = error.isQuotaError || error.status === 429 || error.message?.includes('429');
    console.error(`[Research Briefing] ❌ ${isQuota ? 'QUOTA ERROR' : 'Error'} after ${elapsed}s: ${error.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ASK-THE-RESEARCHER FOLLOW-UPS (founder GO, Aug 18 2026)
// ═══════════════════════════════════════════════════════════════════════════
// Gary's brain rides a tool-less sub bridge, but a human bettor with a
// research assistant just ASKS for more. During Pass 1, lines of the form
//   ASK RESEARCHER: <question>
// are routed here: a dedicated researcher session (scout report + finished
// briefing in the cached system prompt, full stat tools) answers each
// question with verified figures, and the answers ride back into Gary's
// conversation. The assistant answers — it never picks a side.

const FOLLOW_UP_SPORT_LABELS = {
  baseball_mlb: 'MLB', MLB: 'MLB',
  americanfootball_nfl: 'NFL', NFL: 'NFL',
  americanfootball_ncaaf: 'NCAAF', NCAAF: 'NCAAF',
  basketball_nba: 'NBA', NBA: 'NBA',
  icehockey_nhl: 'NHL', NHL: 'NHL',
  basketball_ncaab: 'NCAAB', NCAAB: 'NCAAB',
};

/** Pure parser: pull ASK RESEARCHER questions out of a brain message. */
export function extractResearcherQuestions(text, maxQuestions = 6) {
  const out = [];
  const rx = /^[\s>*-]*ASK RESEARCHER:\s*(.+?)\s*$/gim;
  let m;
  while ((m = rx.exec(String(text || ''))) !== null) {
    const q = m[1].trim();
    if (q && !out.includes(q)) out.push(q);
    if (out.length >= maxQuestions) break;
  }
  return out;
}

/** One follow-up session per game, created lazily on Gary's first question. */
export async function createResearcherFollowUpSession({ scoutReportContent, briefing, sport, homeTeam, awayTeam, _costTracker = null }) {
  const systemPrompt = `You are the research assistant for a sports bettor named Gary. He read your briefing and has follow-up questions. Answer them factually.

RULES:
- Answer with exact figures for BOTH teams where the question allows — never vague words where a number exists.
- Use your tools when the data is not already in the scout report or briefing; cite the sample window (which games, how many) for any trend.
- Keep each answer under 130 words. Answer the question asked — no extra factors, no advice.
- Do NOT pick a side, recommend a bet, or characterize what the answer "means for the pick." Facts only.
- If the data genuinely is not available, say so plainly.

## SCOUT REPORT (this game's data)
${scoutReportContent}

## YOUR EARLIER BRIEFING
${briefing}`;
  return createGeminiSession({
    _costTracker,
    modelName: GAME_RESEARCH_MODEL,
    systemPrompt,
    tools: toolDefinitions,
    thinkingLevel: 'high',
    enableCache: true,
  });
}

/** Answer a batch of Gary's questions, running the researcher's tool loop. */
export async function askResearcher(session, questions, { sport, homeTeam, awayTeam, options = {} } = {}) {
  const label = FOLLOW_UP_SPORT_LABELS[sport] || sport;
  let currentMessage = `Gary's follow-up question${questions.length > 1 ? 's' : ''}:\n\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\nAnswer each in order, numbered the same way.`;
  let isFunctionResponse = false;
  for (let iter = 0; iter < 6; iter++) {
    const response = await sendToSessionWithRetry(session, currentMessage, { isFunctionResponse });
    if (response.toolCalls && response.toolCalls.length > 0) {
      const functionResponses = [];
      for (const toolCall of response.toolCalls) {
        const functionName = toolCall.function?.name || toolCall.type;
        let args = {};
        try { args = JSON.parse(toolCall.function?.arguments || '{}'); } catch { /* malformed args → handled below */ }
        if (functionName === 'fetch_stats') {
          const token = args.token || args.stat_type;
          if (!token) { functionResponses.push({ name: functionName, content: 'Error: fetch_stats called without a "token" argument.' }); continue; }
          const allowedTokens = getTokensForSport(label);
          if (Array.isArray(allowedTokens) && allowedTokens.length > 0 && !allowedTokens.includes(token)) {
            functionResponses.push({ name: functionName, content: `${token}: Not available for ${label}.` });
            continue;
          }
          try {
            const statResult = await fetchStats(sport, token, homeTeam, awayTeam, options);
            functionResponses.push({ name: functionName, content: summarizeStatForContext(statResult, token, homeTeam, awayTeam) });
          } catch (err) {
            functionResponses.push({ name: functionName, content: `Error fetching ${token}: ${err.message}` });
          }
        } else if (functionName === 'fetch_narrative_context') {
          try {
            const { openaiWebSearch } = await import('../../pickdesk/webSearch.js');
            const r = await openaiWebSearch(args.query || '', { freshnessHours: 48 });
            functionResponses.push({ name: functionName, content: (typeof r === 'string' ? r : r?.data) || 'No results' });
          } catch (err) {
            functionResponses.push({ name: functionName, content: `Search error: ${err.message}` });
          }
        } else {
          functionResponses.push({ name: functionName, content: `Tool ${functionName} is not available in follow-up mode.` });
        }
      }
      currentMessage = functionResponses;
      isFunctionResponse = true;
      continue;
    }
    const answer = String(response.content || '').trim();
    if (answer) return answer;
    currentMessage = 'Write out your answers now, numbered to match the questions.';
    isFunctionResponse = false;
  }
  return '(the researcher ran out of rounds — work from the briefing and scout report)';
}
