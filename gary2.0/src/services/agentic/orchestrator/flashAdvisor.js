import { createGeminiSession, sendToSessionWithRetry } from './sessionManager.js';
import { getFlashInvestigationPrompt } from '../flashInvestigationPrompts.js';
import { getMlbSeasonAwareness } from './spreadEvaluationFactors.js';
import { ballDontLieService } from '../../ballDontLieService.js';
import { nbaSeason, nflSeason } from '../../../utils/dateUtils.js';
import { toolDefinitions, getTokensForSport } from '../tools/toolDefinitions.js';
import { fetchStats } from '../tools/statRouters/index.js';
import { summarizeStatForContext, summarizeNbaPlayerAdvancedStats } from './orchestratorHelpers.js';
import { geminiGroundingSearch } from '../scoutReport/scoutReportBuilder.js';

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
    const sportLabel = sport.replace('basketball_', '').replace('americanfootball_', '').replace('icehockey_', '').toUpperCase();

    // Flash token dedup cache — prevents re-fetching the same stat within a single game analysis
    const _flashTokenCache = new Map();
    // Accumulated factor findings — Flash writes each factor incrementally
    const _accumulatedFactors = [];

    // Get per-sport investigation methodology (factors + cross-referencing)
    const investigationMethodology = getFlashInvestigationPrompt(sport, options.spread ?? null);

    // Flash gets the same stat tools Gary has (minus FINALIZE_PROPS)
    // All sports get fetch_narrative_context (grounding) — Flash handles narrative investigation
    const researchTools = toolDefinitions;

    const isNCAABSport = sport === 'basketball_ncaab' || sport === 'NCAAB';
    const isMLBSport = sport === 'baseball_mlb' || sport === 'MLB';
    const isNHLSport = sport === 'icehockey_nhl' || sport === 'NHL';
    const mlbAwarenessBlock = isMLBSport ? `\n\n${getMlbSeasonAwareness()}\n` : '';

    // MLB: medium thinking + lower output cap (fact-finding doesn't need deep reasoning or 65K output)
    // All other sports: high thinking + full output (unchanged)
    const flashThinkingLevel = isMLBSport ? 'medium' : 'high';
    const flashMaxOutput = isMLBSport ? 16384 : undefined; // undefined = use CONFIG.maxTokens default

    const briefingSession = createGeminiSession({
      _costTracker: options._costTracker || null,
      modelName: 'gemini-3-flash-preview',
      systemPrompt: `You are the research assistant for a sports bettor named Gary. Your job is to find the full context and nuance behind the stats — the stuff a human bettor would know but raw numbers don't show.

A stat by itself is just a number. Your job is to figure out WHY. An efficiency spike could be a real shift or 3 games against tanking teams. A player's absence could be devastating or already absorbed. A record could be misleading because of blowout variance. You find the story behind the data.

You have stat-fetching tools and a narrative context tool. USE THEM.

${investigationMethodology}
${mlbAwarenessBlock}
CRITICAL RULES:
- Report specific numbers with context: "Team went 2-4 with -8.3 net rating during games 60-65 when Player X was out — but 3 of those were against top-10 defenses"
- Report findings for each factor separately — Gary will connect the dots across factors himself
- If you reference opponent quality or recency distortion, include concrete evidence (named opponents and/or score/result context), not generic claims like "weaker opposition"
- When citing any trend (L5/L10 or recent stretch), include concrete sample context: opponent names/results and who was active/inactive in that window
- For search/grounding results, use factual events only. Ignore picks, predictions, and opinion content
- Do NOT pick a side or recommend a bet — your job is factual research only
- Do NOT fabricate stats — only report what comes from the scout report or your tool calls

OUTPUT FORMAT — for each factor you investigate, write your findings as a JSON object:
{"factor": "Factor name", "keyFinding": "1-2 sentence finding", "numbers": "Concrete stats for BOTH teams", "context": "Opponent quality / who played / sample window context"}

Do NOT make a pick or recommendation.`,
      tools: researchTools,
      thinkingLevel: flashThinkingLevel,
      ...(flashMaxOutput ? { maxOutputTokens: flashMaxOutput } : {})
    });

    const hasSpread = Number.isFinite(options.spread);
    const briefingPrompt = `## RESEARCH BRIEFING REQUEST

**Game:** ${homeTeam} vs ${awayTeam} (${sportLabel})
${hasSpread ? `**Spread:** ${options.spread}` : ''}

**Scout Report Data:**
${scoutReportContent}

---

Read the scout report above. I will now ask you to investigate factors one at a time.${isNCAABSport ? ' (NCAAB: narrative context is already in the scout report — prefer fetch_stats for BDL data)' : ''}${isMLBSport ? ' (MLB: The scout report already includes lineup confirmations and breaking news from grounding searches. Prefer fetch_stats for all stat-based investigation. Only use fetch_narrative_context as a last resort for info that no stat token or scout report section covers.)' : ''}${isNHLSport ? ' (NHL: The scout report already includes confirmed starting goalies, lineups, power play units, and injuries from RotoWire. Do NOT use fetch_narrative_context to re-search for goalies, lineups, injuries, or PP/PK stats — all of this is in the scout report. Use grounding ONLY for context not in the scout report like recent player performance narrative or trade news.)' : ''}`;

    console.log(`[Research Briefing] Sending scout report to Gemini Flash (factor-by-factor investigation)`);

    // ═══════════════════════════════════════════════════════════════════════
    // FACTOR-BY-FACTOR RESEARCH LOOP
    // The orchestrator drives which factor Flash investigates.
    // Flash calls tokens, gets results, writes the analysis — one factor at a time.
    // ═══════════════════════════════════════════════════════════════════════
    let totalToolCalls = 0;
    let groundingCalls = 0;
    const calledTokens = [];

    // Step 1: Send the scout report to Flash as context
    await sendToSessionWithRetry(briefingSession, briefingPrompt, { isFunctionResponse: false });

    // Step 2: Get the factor list for this sport
    const { INVESTIGATION_FACTORS } = await import('./investigationFactors.js');
    const sportFactors = INVESTIGATION_FACTORS[sport] || {};
    const factorNames = Object.keys(sportFactors).filter(f => sportFactors[f] && sportFactors[f].length > 0);
    // Also include factors with empty token lists (preloaded from scout report) — Flash should still analyze them
    const allFactorNames = Object.keys(sportFactors);

    console.log(`[Research Briefing] ${allFactorNames.length} factors to investigate (${factorNames.length} with tokens)`);

    // Step 3: Investigate each factor one at a time
    for (let fi = 0; fi < allFactorNames.length; fi++) {
      const factorName = allFactorNames[fi];
      const factorTokens = sportFactors[factorName] || [];

      const factorPrompt = factorTokens.length > 0
        ? `Investigate factor: ${factorName} now and write your findings.`
        : `Analyze factor: ${factorName} using the data already in the scout report and write your findings.`;

      // Flash investigates this factor — may take multiple iterations for tool calls
      let currentMessage = factorPrompt;
      let isFunctionResponse = false;
      const MAX_FACTOR_ITERATIONS = isMLBSport ? 3 : 5; // MLB: 3 rounds (cost savings), others: 5

      for (let iter = 0; iter < MAX_FACTOR_ITERATIONS; iter++) {
        const response = await sendToSessionWithRetry(briefingSession, currentMessage, { isFunctionResponse });

        // Process tool calls if Flash wants to fetch stats
        if (response.toolCalls && response.toolCalls.length > 0) {
          const functionResponses = [];
          for (const toolCall of response.toolCalls) {
            const functionName = toolCall.function?.name || toolCall.type;
            const args = JSON.parse(toolCall.function?.arguments || '{}');

            if (functionName === 'fetch_stats') {
              const token = args.token;
              totalToolCalls++;

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
                const statResult = await fetchStats(sport, token, homeTeam, awayTeam, options);
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
              // Cap grounding calls to control cost — scout report already has lineups, injuries, goalies
              // MLB: 4 (BDL has all stats), NHL: 6 (RotoWire data already in scout report), others: 8
              const isNHLSport = sport === 'icehockey_nhl' || sport === 'NHL';
              const MAX_GROUNDING_CALLS = isMLBSport ? 4 : isNHLSport ? 6 : 8;
              if (groundingCalls >= MAX_GROUNDING_CALLS) {
                console.log(`  → [Research Grounding] SKIPPED (cap reached: ${groundingCalls}/${MAX_GROUNDING_CALLS}): "${(args.query || '').slice(0, 80)}"`);
                functionResponses.push({ name: functionName, content: `Grounding call limit reached (${MAX_GROUNDING_CALLS}). Use available stat tokens and scout report data instead.` });
              } else {
                groundingCalls++;
                if (options._costTracker) options._costTracker.addGroundingCall();
                const query = args.query || '';
                console.log(`  → [Research Grounding] "${query}" (${groundingCalls}/${MAX_GROUNDING_CALLS})`);
                try {
                  const groundingResult = await geminiGroundingSearch(query, { maxTokens: 2000 });
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
                const sportKeyMap = { 'NBA': 'basketball_nba', 'NFL': 'americanfootball_nfl', 'NHL': 'icehockey_nhl', 'NCAAB': 'basketball_ncaab', 'NCAAF': 'americanfootball_ncaaf' };
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
                  if (args.sport === 'NBA') logs = await ballDontLieService.getNbaPlayerGameLogs(player.id, numGames);
                  else if (args.sport === 'NCAAB') logs = await ballDontLieService.getNcaabPlayerGameLogs(player.id, numGames);
                  else if (args.sport === 'NHL') logs = await ballDontLieService.getNhlPlayerGameLogs(player.id, numGames);
                  else { const s = nflSeason(); const all = await ballDontLieService.getNflPlayerGameLogsBatch([player.id], s, numGames); logs = all[player.id]; }
                  const logContent = JSON.stringify({ player: args.player_name, sport: args.sport, logs: logs || [] });
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
            _accumulatedFactors.push(factorObj);
            console.log(`[Research Briefing] ✓ Factor "${factorObj.factor}" complete (${_accumulatedFactors.length}/${allFactorNames.length})`);
          } catch {
            // Flash wrote prose instead of JSON — wrap it
            _accumulatedFactors.push({
              factor: factorName,
              keyFinding: content.slice(0, 200),
              numbers: '',
              context: content
            });
            console.log(`[Research Briefing] ✓ Factor "${factorName}" complete (prose, ${_accumulatedFactors.length}/${allFactorNames.length})`);
          }
          break; // Factor complete — move to next factor
        }

        break; // No content and no tool calls — move on
      }
    }

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
