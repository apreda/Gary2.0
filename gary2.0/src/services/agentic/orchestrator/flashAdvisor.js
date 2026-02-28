import { getGemini, CONFIG, GEMINI_SAFETY_SETTINGS, GEMINI_PRO_MODEL } from './orchestratorConfig.js';
import { createGeminiSession, sendToSession, sendToSessionWithRetry } from './sessionManager.js';
import { getConstitution } from '../constitution/index.js';
import { getFlashInvestigationPrompt } from '../flashInvestigationPrompts.js';
import { ballDontLieService } from '../../ballDontLieService.js';
import { nbaSeason, nhlSeason, nflSeason, ncaabSeason } from '../../../utils/dateUtils.js';
import { toolDefinitions, getTokensForSport } from '../tools/toolDefinitions.js';
import { fetchStats } from '../tools/statRouters/index.js';
import { summarizeStatForContext, summarizeNbaPlayerAdvancedStats } from './orchestratorHelpers.js';
import { geminiGroundingSearch } from '../scoutReport/scoutReportBuilder.js';

// ═══════════════════════════════════════════════════════════════════════════
// FLASH ADVISOR — Independent Steel Man Case Builder
// ═══════════════════════════════════════════════════════════════════════════
// INDEPENDENT ADVISOR: Gemini 3 Pro builds bilateral Steel Man cases
// Advisor receives 3.1 Pro's investigation data (text only, no tools) and builds
// cases from scratch. This eliminates confirmation bias:
// 3.1 Pro investigates → 3 Pro builds cases → 3.1 Pro evaluates advisor's cases.
// Advisor has no investigation lean — it's a fresh analyst reviewing the data.
// ═══════════════════════════════════════════════════════════════════════════

export const ADVISOR_TIMEOUT_MS = 60000; // 60 second timeout for advisor case building

/**
 * Extract FULL context from a session for model switching
 * Pro needs ALL the data Flash gathered to verify Steel Man claims
 *
 * @param {Array} messages - Gemini-compatible message history
 * @param {Object} steelManCases - Captured steel man cases
 * @param {Array} toolCallHistory - Full history of tool calls and results
 * @returns {string} - Complete context for Pro model
 */
export function extractTextualSummaryForModelSwitch(messages, steelManCases, toolCallHistory = []) {
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

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3: Steel Man Cases (written by research assistant)
  // ═══════════════════════════════════════════════════════════════════════════
  if (steelManCases?.homeTeamCase || steelManCases?.awayTeamCase) {
    summary += '## STEEL MAN CASES (Written by research assistant)\n\n';
    summary += 'These cases were built from the stats above by your research assistant.\n\n';

    if (steelManCases.homeTeamCase) {
      summary += steelManCases.homeTeamCase + '\n\n';
    }
    if (steelManCases.awayTeamCase) {
      summary += steelManCases.awayTeamCase + '\n\n';
    }
  }

  // Always anchor game identity — prevents wrong-game confusion after model switch
  const matchupMatch = messages[1]?.content?.match(/([\w][\w\s.'&-]+?)\s*(?:@|vs\.?|versus)\s*([\w][\w\s.'&-]+?)(?:\n|$)/);
  if (matchupMatch) {
    summary += `\n## CURRENT GAME: ${matchupMatch[1].trim()} @ ${matchupMatch[2].trim()}\n`;
  }

  return summary;
}

/**
 * Extract bilateral cases from a response text.
 * Shared by Flash research briefing (game picks) and advisor (props).
 *
 * @param {string} content - The raw response containing case headers
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @param {string} logPrefix - Log prefix for console output
 * @returns {{ homeTeamCase: string, awayTeamCase: string, flashContent: string }|null}
 */
export function extractBilateralCases(content, homeTeam, awayTeam, logPrefix = '[CaseExtractor]') {
  // Strategy 1: Split on major case headers (more robust than lazy regex)
  const headerPattern = /(?:^|\n)(?:\*\*)?(?:#{1,3}\s*)?(?:Case for|CASE FOR|Analysis for|ANALYSIS FOR)[:\s*—-]+/gi;
  const headerMatches = [...content.matchAll(headerPattern)];

  let fullCases = [];
  if (headerMatches.length >= 2) {
    const sections = [];
    for (let i = 0; i < headerMatches.length; i++) {
      const start = headerMatches[i].index;
      const end = i + 1 < headerMatches.length ? headerMatches[i + 1].index : content.length;
      sections.push(content.substring(start, end).trim());
    }
    sections.sort((a, b) => b.length - a.length);
    fullCases = sections.slice(0, 2);

    if (fullCases[1].length < 200 && sections.length > 2) {
      console.warn(`${logPrefix} ⚠️ Second case too short (${fullCases[1].length} chars) — merging fragments`);
      const shortIdx = sections.indexOf(fullCases[1]);
      const remaining = sections.filter((_, i) => i !== 0 && i !== shortIdx);
      fullCases[1] = fullCases[1] + '\n\n' + remaining.join('\n\n');
    }
  }

  // Strategy 2: Fallback — simple split on "---"
  if (fullCases.length < 2 || fullCases.some(c => c.length < 200)) {
    console.log(`${logPrefix} Trying fallback split strategy...`);
    const halves = content.split(/\n---+\n/);
    if (halves.length >= 2) {
      const caseHalves = halves.filter(h => h.length > 200);
      if (caseHalves.length >= 2) {
        fullCases = caseHalves.slice(0, 2).map(h => h.trim());
        console.log(`${logPrefix} Fallback split: ${fullCases[0].length} + ${fullCases[1].length} chars`);
      }
    }
  }

  // Final validation
  if (fullCases.length >= 2 && fullCases[0].length >= 200 && fullCases[1].length >= 200) {
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

    const result = {
      homeTeamCase: case1IsHome ? fullCases[0] : fullCases[1],
      awayTeamCase: case1IsHome ? fullCases[1] : fullCases[0],
      flashContent: content
    };

    console.log(`${logPrefix} ✅ Bilateral cases extracted (home: ${result.homeTeamCase.length} chars, away: ${result.awayTeamCase.length} chars)`);
    return result;
  }

  console.warn(`${logPrefix} ⚠️ Could not extract bilateral cases (found ${fullCases.length} sections, sizes: ${fullCases.map(c => c.length).join(', ')})`);
  return null;
}

/**
 * Build a Steel Man case prompt for Flash to build bilateral cases after research.
 * @private
 */
function buildSteelManCasePrompt(homeTeam, awayTeam, sport, spread) {
  const isNHL = sport === 'icehockey_nhl' || sport === 'NHL';
  const homeSpread = spread ? `${spread >= 0 ? '+' : ''}${spread.toFixed(1)}` : '';
  const awaySpread = spread ? `${-spread >= 0 ? '+' : ''}${(-spread).toFixed(1)}` : '';

  return `## YOUR TASK: BUILD TWO BILATERAL STEEL MAN CASES

Based on ALL your research findings above, write two compelling, data-backed cases — one for each team.

${isNHL ? `This is an NHL game (moneyline only — pick WHO WINS).

### CASE FOR ${homeTeam}
[Build the strongest possible case for ${homeTeam} to WIN using your research findings. ]

### CASE FOR ${awayTeam}
[Build the strongest possible case for ${awayTeam} to WIN using your research findings. ]`
    : `The spread is ${homeTeam} ${homeSpread} / ${awayTeam} ${awaySpread}.

### CASE FOR ${homeTeam} (${homeSpread})
[Build the strongest possible case for ${homeTeam} to cover ${homeSpread} using your research findings. ]

### CASE FOR ${awayTeam} (${awaySpread})
[Build the strongest possible case for ${awayTeam} to cover ${awaySpread} using your research findings. ]`}

RULES:
- Use ONLY data from your research above. Do not invent stats or players.
- Each case must be 400+ words with specific numbers from your investigation.
- You MUST use the exact headers above: "### CASE FOR [Team]"
- Do NOT pick a side. Build TWO separate, genuinely compelling cases.
- Each case should be genuinely compelling — find the strongest arguments for THAT side.
- INJURY STATUS RULES: Players listed as "Questionable" or "Probable" = assume they play at full strength. Players listed as "Out" or "Out For Season" = confirmed absent. Players listed as "Doubtful" = likely absent but not confirmed.
- Team share percentages (pct_pts, pct_reb, pct_ast) describe a player's share of THEIR OWN TEAM's production — not a matchup advantage.`;
}

export async function buildFlashSteelManCases(systemPrompt, messages, toolCallHistory, sport, homeTeam, awayTeam, spread) {
  const startTime = Date.now();

  try {
    // Create Flash session (TEXT ONLY — no tools, just data in → cases out)
    // Fallback path — game picks normally build cases during Flash research briefing
    const sportLabel = sport.replace('basketball_', '').replace('americanfootball_', '').replace('icehockey_', '').toUpperCase();
    const flashConstitution = getConstitution(sport);

    let flashDomainContent = '';
    if (typeof flashConstitution === 'object' && flashConstitution.domainKnowledge) {
      flashDomainContent = `\n\n## SPORT-SPECIFIC REFERENCE\n${flashConstitution.domainKnowledge}\n\n## STRUCTURAL RULES\n${flashConstitution.guardrails}`;
    }

    const advisorSystemPrompt = `You are an independent sports analyst reviewing investigation data for a ${sportLabel} game. Your ONLY task is to build bilateral Steel Man cases — one case for each team. You do NOT have access to any tools or function calls. You receive data as text and write cases from it. Be thorough, specific, and use the data provided. Write in a neutral, analytical tone.${flashDomainContent}`;

    const advisorSession = createGeminiSession({
      modelName: 'gemini-3-flash-preview',  // Flash — cheaper, faster, no tools needed
      systemPrompt: advisorSystemPrompt,
      tools: [],
      thinkingLevel: 'high'
    });

    console.log(`[Advisor] Session created (Gemini Flash, text only, no tools)`);

    const investigationContext = extractTextualSummaryForModelSwitch(messages, {}, toolCallHistory);
    const casePrompt = buildSteelManCasePrompt(homeTeam, awayTeam, sport, spread);
    const contextMessage = `${investigationContext}\n\n${casePrompt}`;
    console.log(`[Advisor] Sending ${contextMessage.length} chars to Gemini Flash (scout report + ${toolCallHistory.length} stats + case prompt)`);

    const advisorResponse = await sendToSessionWithRetry(advisorSession, contextMessage);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (!advisorResponse.content) {
      console.warn(`[Advisor] Empty response after ${elapsed}s`);
      return null;
    }

    console.log(`[Advisor] Response received in ${elapsed}s (${advisorResponse.content.length} chars)`);
    return extractBilateralCases(advisorResponse.content, homeTeam, awayTeam, '[Advisor]');

  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[Advisor] ❌ Error after ${elapsed}s: ${error.message}`);
    return null;
  }
}

/**
 * Build independent bilateral OVER/UNDER cases for player props via a separate Gemini 3 Pro session.
 * Same architecture as buildFlashSteelManCases() but for props — advisor sees investigation data
 * + prop candidates + available lines and builds OVER/UNDER cases for 3-4 candidates.
 *
 * @returns {{ candidateCases: string, rawContent: string } | null}
 */
export async function buildFlashSteelManPropsCases(systemPrompt, messages, toolCallHistory, sport, homeTeam, awayTeam, propContext) {
  const startTime = Date.now();

  try {
    const sportLabel = sport.replace('basketball_', '').replace('americanfootball_', '').replace('icehockey_', '').toUpperCase();
    const flashConstitution = getConstitution(sport);

    let flashDomainContent = '';
    if (typeof flashConstitution === 'object' && flashConstitution.domainKnowledge) {
      flashDomainContent = `\n\n## SPORT-SPECIFIC REFERENCE\n${flashConstitution.domainKnowledge}\n\n## STRUCTURAL RULES\n${flashConstitution.guardrails}`;
    }

    const advisorSystemPrompt = `You are an independent sports analyst reviewing investigation data for ${sportLabel} player props. Your ONLY task is to build bilateral OVER/UNDER cases for the top 3-4 prop candidates. You do NOT have access to any tools or function calls. You receive data as text and write cases from it. Be thorough, specific, and use the data provided. Write in a neutral, analytical tone.${flashDomainContent}`;

    const advisorSession = createGeminiSession({
      modelName: 'gemini-3-flash-preview',  // Flash — cheaper, faster, no tools needed
      systemPrompt: advisorSystemPrompt,
      tools: [],  // No tools — advisor writes cases from data
      thinkingLevel: 'high'
    });

    console.log(`[Props Advisor] Session created (Gemini Flash, text only, no tools)`);

    // Build context: scout report + investigation stats
    const investigationContext = extractTextualSummaryForModelSwitch(messages, {}, toolCallHistory);

    // Format available prop lines for the advisor
    const availableLines = (propContext?.availableLines || []);
    const linesList = availableLines.map(l =>
      `- ${l.player} (${l.team || ''}): ${l.prop_type} ${l.line} (O: ${l.over_odds || 'N/A'} / U: ${l.under_odds || 'N/A'})`
    ).join('\n');

    // Format prop candidates for the advisor
    const candidatesList = (propContext?.propCandidates || []).map(c => {
      const propsStr = (c.props || []).map(p => `${p.type || p.prop_type} ${p.line}`).join(', ');
      return `- ${c.player} (${c.team}): ${propsStr}`;
    }).join('\n');

    const advisorPropsPrompt = `## AVAILABLE PROP LINES

${linesList || 'No lines provided'}

## PROP CANDIDATES

${candidatesList || 'No candidates provided'}

## YOUR TASK: BUILD BILATERAL OVER/UNDER CASES

Based on ALL the investigation data above and the available prop lines, select your top 3-4 prop candidates — the players where the data reveals something interesting about their production tonight.

For EACH candidate, write:

### [Player Name] — [Prop Type] [Line]

**OVER CASE:**
[Build the strongest possible case for OVER using the data above. Cite specific stats, game factors, recent form, and matchup evidence. Explain what conditions must be true tonight for the OVER to hit.]

**UNDER CASE:**
[Build the strongest possible case for UNDER using the data above. Cite specific stats, game factors, recent form, and matchup evidence. Explain what conditions must be true tonight for the UNDER to hit.]

RULES:
- Use ONLY the data provided above. Do not invent stats or players.
- Each case must be 300+ words with specific numbers from the data.
- Build genuinely compelling cases for BOTH directions — the UNDER case is NOT filler.
- Connect game-level investigation findings (pace, efficiency, defense) to individual player production.
- The line already reflects the player's established role. Build your case on what makes TONIGHT different.
- Do NOT pick a side. Do NOT write a general analysis. Build TWO separate cases per candidate.`;

    // Send combined context + advisor prompt (single API call)
    const contextMessage = `${investigationContext}\n\n${advisorPropsPrompt}`;
    console.log(`[Props Advisor] Sending ${contextMessage.length} chars to Gemini Flash (scout report + ${toolCallHistory.length} stats + ${availableLines.length} prop lines)`);

    const advisorResponse = await sendToSessionWithRetry(advisorSession, contextMessage);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (!advisorResponse.content) {
      console.warn(`[Props Advisor] Empty response after ${elapsed}s`);
      return null;
    }

    console.log(`[Props Advisor] Response received in ${elapsed}s (${advisorResponse.content.length} chars)`);

    const content = advisorResponse.content;

    // Validate: must contain bilateral analysis patterns (OVER/UNDER cases)
    const overCaseCount = (content.match(/\bOVER\s+CASE\b/gi) || []).length;
    const underCaseCount = (content.match(/\bUNDER\s+CASE\b/gi) || []).length;
    const hasBilateral = overCaseCount >= 2 && underCaseCount >= 2;

    if (!hasBilateral) {
      console.warn(`[Props Advisor] ⚠️ Insufficient bilateral cases (OVER: ${overCaseCount}, UNDER: ${underCaseCount}) — need at least 2 of each`);
      // Still return if there's substantial content — partial cases are better than none
      if (content.length < 500) {
        return null;
      }
    }

    console.log(`[Props Advisor] ✅ Bilateral cases extracted (${overCaseCount} OVER + ${underCaseCount} UNDER cases, ${content.length} chars)`);
    return {
      candidateCases: content,
      rawContent: content
    };

  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[Props Advisor] ❌ Error after ${elapsed}s: ${error.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FLASH RESEARCH BRIEFING — Flash handles investigative completeness
// ═══════════════════════════════════════════════════════════════════════════
// Flash (Gemini 3 Flash) prepares a comprehensive pre-game briefing from the
// scout report. This replaces the old per-factor coverage checklist:
// - Flash is the research assistant who organizes the homework
// - Gary reads the briefing and investigates what matters
// - No more 100% coverage gate — investigation sufficiency is based on
//   tool call breadth + stall detection
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a comprehensive research briefing via Gemini Flash.
 * Flash is the primary research agent — it reads the scout report, works through
 * the full per-sport factor checklist, uses tools to investigate every factor,
 * connects dots across findings, and writes an initial assessment.
 *
 * Returns { briefing, calledTokens, steelManCases } — the briefing is factual findings
 * organized by factor; steelManCases are bilateral cases built from Flash's research.
 *
 * @param {string} scoutReportContent - Full scout report text
 * @param {string} sport - Sport identifier (e.g., 'basketball_nba')
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @param {Object} options - Game options (passed through to fetchStats)
 * @returns {{ briefing: string, calledTokens: Array, steelManCases: Object|null }|null} - Research briefing + called tokens + Steel Man cases, or null on failure
 */
export async function buildFlashResearchBriefing(scoutReportContent, sport, homeTeam, awayTeam, options = {}) {
  const startTime = Date.now();
  const MAX_RESEARCH_ITERATIONS = 25; // Increased to accommodate coverage retry pass

  try {
    const sportLabel = sport.replace('basketball_', '').replace('americanfootball_', '').replace('icehockey_', '').toUpperCase();

    // Get per-sport investigation methodology (factors + cross-referencing)
    const investigationMethodology = getFlashInvestigationPrompt(sport, options.spread ?? null);

    // Flash gets the same stat tools Gary has (minus FINALIZE_PROPS)
    // All sports get fetch_narrative_context (grounding) — Flash handles narrative investigation
    const researchTools = toolDefinitions;

    const isNCAABSport = sport === 'basketball_ncaab' || sport === 'NCAAB';

    const briefingSession = createGeminiSession({
      modelName: 'gemini-3-flash-preview',
      systemPrompt: `You are the research assistant for a sports bettor named Gary. Your job is to find the full context and nuance behind the stats — the stuff a human bettor would know but raw numbers don't show.

A stat by itself is just a number. Your job is to figure out WHY. An efficiency spike could be a real shift or 3 games against tanking teams. A player's absence could be devastating or already absorbed. A record could be misleading because of blowout variance. You find the story behind the data.

You have stat-fetching tools and a narrative context tool. USE THEM.

YOUR INVESTIGATION PROCESS:
1. Read the scout report — note what data is already there
2. Work through EVERY factor in the investigation guide below
3. For each factor: pull the stats, then dig into the context — who was playing, who were the opponents, what changed and when
4. Connect findings across factors — a roster change that overlaps a form shift is one finding, not two
5. After completing all research, write your final briefing as structured per-factor findings

${investigationMethodology}

CRITICAL RULES:
- Cover every factor category — don't skip any
- Report specific numbers with context: "Team went 2-4 with -8.3 net rating during games 60-65 when Player X was out — but 3 of those were against top-10 defenses"
- Connect findings across factors — roster changes to stat shifts, schedule to form, injury timelines to performance windows
- Do NOT pick a side or recommend a bet — your job is factual research only
- Do NOT fabricate stats — only report what comes from the scout report or your tool calls

OUTPUT FORMAT:
Write your briefing as structured per-factor bullet points. For each factor:
- **[Factor Name]**: Key finding with specific numbers for both teams. Note any important context (opponent quality, roster changes, sample size concerns).`,
      tools: researchTools,
      thinkingLevel: 'high'
    });

    const briefingPrompt = `## RESEARCH BRIEFING REQUEST

**Game:** ${homeTeam} vs ${awayTeam} (${sportLabel})
${options.spread ? `**Spread:** ${options.spread}` : ''}

**Scout Report Data:**
${scoutReportContent}

---

**Your task:** Conduct a comprehensive pre-game investigation using the factor guide in your instructions. For each factor:
1. Check what the scout report already provides
2. Use your fetch_stats tools to investigate deeper — pull efficiency data, game logs, splits, matchup data, anything that fills gaps
3. Use fetch_narrative_context for storylines, news, or context that stat tools can't provide${isNCAABSport ? ' (NCAAB: narrative context is already in the scout report — prefer fetch_stats for BDL data)' : ''}
4. Report findings with specific numbers for both teams
5. Flag connections between factors (roster changes overlapping form shifts, schedule quality affecting recent stats, etc.)

After completing your research, write your final briefing as structured per-factor bullet points. For each factor, report what you found for both teams with specific numbers and any important context.`;

    console.log(`[Research Briefing] Sending ${briefingPrompt.length} chars to Gemini Flash (with tools, max ${MAX_RESEARCH_ITERATIONS} iterations)`);

    // ═══════════════════════════════════════════════════════════════════════
    // RESEARCH AGENT LOOP: Flash investigates with tools, then writes briefing + initial read
    // ═══════════════════════════════════════════════════════════════════════
    let currentMessage = briefingPrompt;
    let isFunctionResponse = false;
    let totalToolCalls = 0;
    let groundingCalls = 0;
    const calledTokens = []; // Track which stat tokens Flash called (for factor coverage)
    let coverageRetryDone = false; // Track whether we've already sent the coverage gap message

    for (let researchIter = 0; researchIter < MAX_RESEARCH_ITERATIONS; researchIter++) {
      const response = await sendToSessionWithRetry(
        briefingSession,
        currentMessage,
        { isFunctionResponse }
      );

      // If Flash returned text (no tool calls), we have the briefing
      if (response.content && (!response.toolCalls || response.toolCalls.length === 0)) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        if (response.content.length < 200) {
          console.warn(`[Research Briefing] Insufficient response after ${elapsed}s (${response.content.length} chars, ${totalToolCalls} tool calls)`);
          return null;
        }

        // ═══════════════════════════════════════════════════════════════════
        // COVERAGE CHECK: Before accepting the briefing, check for gaps
        // ═══════════════════════════════════════════════════════════════════
        if (!coverageRetryDone) {
          const { INVESTIGATION_FACTORS } = await import('./investigationFactors.js');
          const factors = INVESTIGATION_FACTORS[sport];
          if (!factors) {
            console.warn(`[Research Briefing] ⚠️ Sport key "${sport}" not found in INVESTIGATION_FACTORS — skipping coverage check`);
          }
          if (factors) {
            const coveredTokens = calledTokens
              .filter(t => t.quality !== 'unavailable')
              .map(t => t.token);

            const missingFactors = [];
            for (const [factorName, requiredTokens] of Object.entries(factors)) {
              // Skip factors with no tokens (preloaded from scout report)
              if (!requiredTokens || requiredTokens.length === 0) continue;
              const isCovered = requiredTokens.some(token =>
                coveredTokens.some(called =>
                  called === token || called.startsWith(token + ':') || called.startsWith(token + '_')
                )
              );
              if (!isCovered) {
                missingFactors.push({ name: factorName, tokens: requiredTokens });
              }
            }

            const totalFactors = Object.keys(factors).filter(f => factors[f] && factors[f].length > 0).length;
            const coveredFactors = totalFactors - missingFactors.length;
            const coveragePct = totalFactors > 0 ? (coveredFactors / totalFactors) : 1;

            if (coveragePct < 0.8) {
              coverageRetryDone = true;
              const gapList = missingFactors.map(f =>
                `- ${f.name}: call ${f.tokens.slice(0, 3).join(' or ')}`
              ).join('\n');
              console.log(`[Research Briefing] Coverage at ${(coveragePct * 100).toFixed(0)}% (${coveredFactors}/${totalFactors} factors) — need 80%, sending retry pass`);

              // Send Flash back to fill the gaps
              currentMessage = `## COVERAGE GAPS — ADDITIONAL RESEARCH NEEDED

You missed the following factor categories. Please investigate these NOW using fetch_stats:

${gapList}

After investigating, rewrite your COMPLETE briefing including ALL factors (both your original findings and these new ones).`;
              isFunctionResponse = false;
              continue; // Go back to the loop — Flash will make more tool calls
            }
          }
        }

        // Parse briefing from the response (factual findings only — no opinion/assessment)
        const briefing = response.content.trim();
        console.log(`[Research Briefing] ✅ Briefing received in ${elapsed}s (${briefing.length} chars, ${totalToolCalls} stat calls + ${groundingCalls} grounding calls across ${researchIter + 1} iterations)`);

        // Log final coverage diagnostics
        const availableCount = calledTokens.filter(t => t.quality === 'available').length;
        const unavailableCount = calledTokens.filter(t => t.quality === 'unavailable').length;
        console.log(`[Research Briefing] Token coverage: ${availableCount} available, ${unavailableCount} unavailable out of ${calledTokens.length} total calls`);

        // ═══════════════════════════════════════════════════════════════════
        // STEP 2: Build Steel Man cases from Flash's full investigation
        // Flash has all tool call results + scout report in its session.
        // This replaces the separate 3 Pro advisor for game picks.
        // ═══════════════════════════════════════════════════════════════════
        let steelManCases = null;
        try {
          const casePrompt = buildSteelManCasePrompt(homeTeam, awayTeam, sport, options.spread ?? null);
          console.log(`[Research Briefing] 📋 Building Steel Man cases from Flash investigation...`);
          const caseResponse = await sendToSessionWithRetry(briefingSession, casePrompt);
          const caseElapsed = ((Date.now() - startTime) / 1000).toFixed(1);

          if (caseResponse.content && caseResponse.content.length > 400) {
            steelManCases = extractBilateralCases(caseResponse.content, homeTeam, awayTeam, '[Research Briefing]');
            if (steelManCases) {
              console.log(`[Research Briefing] ✅ Steel Man cases built in ${caseElapsed}s (home: ${steelManCases.homeTeamCase.length} chars, away: ${steelManCases.awayTeamCase.length} chars)`);
            } else {
              console.warn(`[Research Briefing] ⚠️ Could not extract cases from Flash response (${caseResponse.content.length} chars)`);
            }
          } else {
            console.warn(`[Research Briefing] ⚠️ Flash case response too short (${caseResponse.content?.length || 0} chars)`);
          }
        } catch (caseErr) {
          console.warn(`[Research Briefing] ⚠️ Case building failed: ${caseErr.message}`);
        }

        return { briefing, calledTokens, steelManCases };
      }

      // Flash wants to call tools — execute them
      if (response.toolCalls && response.toolCalls.length > 0) {
        const functionResponses = [];

        for (const toolCall of response.toolCalls) {
          const functionName = toolCall.function?.name || toolCall.type;
          const args = JSON.parse(toolCall.function?.arguments || '{}');

          if (functionName === 'fetch_stats') {
            const token = args.token;
            totalToolCalls++;

            // Validate token against sport menu
            const menuSport = sportLabel;
            const allowedTokens = getTokensForSport(menuSport);
            if (Array.isArray(allowedTokens) && allowedTokens.length > 0 && !allowedTokens.includes(token)) {
              functionResponses.push({
                name: functionName,
                content: `${token}: Not available for ${menuSport}. Try: ${allowedTokens.slice(0, 5).join(', ')}...`
              });
              continue;
            }

            try {
              const statResult = await fetchStats(sport, token, homeTeam, awayTeam, options);
              const statSummary = summarizeStatForContext(statResult, token, homeTeam, awayTeam);
              functionResponses.push({ name: functionName, content: statSummary });
              console.log(`    [Tool Response] ${token}: ${statSummary.slice(0, 300)}${statSummary.length > 300 ? '...' : ''}`);
              calledTokens.push({ token, quality: 'available' });
            } catch (err) {
              functionResponses.push({ name: functionName, content: `Error fetching ${token}: ${err.message}` });
              calledTokens.push({ token, quality: 'unavailable' });
            }
          } else if (functionName === 'fetch_narrative_context') {
            // ═══════════════════════════════════════════════════════════
            // GROUNDING: Flash can search for narrative context
            // ═══════════════════════════════════════════════════════════
            groundingCalls++;
            const query = args.query || '';
            console.log(`  → [Research Grounding] "${query}"`);

            try {
              const searchResult = await geminiGroundingSearch(query, {
                temperature: 1.0,
                maxTokens: 1000
              });

              if (searchResult?.success && searchResult?.data) {
                functionResponses.push({
                  name: functionName,
                  content: JSON.stringify({ query, results: searchResult.data })
                });
                console.log(`    ✓ Grounding result (${searchResult.data.length} chars)`);

                // Map grounding queries to factor coverage tokens (same logic as Gary's handler)
                const q = query.toLowerCase();
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
                if (/weather|wind|temperature|rain|snow/.test(q)) mapped.push('WEATHER');

                for (const token of mapped) {
                  calledTokens.push({ token, quality: 'available' });
                }
              } else {
                functionResponses.push({
                  name: functionName,
                  content: JSON.stringify({ query, results: 'No results found.' })
                });
                console.log(`    ✗ No grounding results`);
              }
            } catch (err) {
              functionResponses.push({
                name: functionName,
                content: JSON.stringify({ error: `Grounding search failed: ${err.message}` })
              });
              console.log(`    ✗ Grounding error: ${err.message}`);
            }
          } else if (functionName === 'fetch_player_game_logs') {
            // Player game logs — same logic as Gary's handler but simplified for Flash
            totalToolCalls++;
            try {
              const sportKeyMap = { 'NBA': 'basketball_nba', 'NFL': 'americanfootball_nfl', 'NHL': 'icehockey_nhl', 'NCAAB': 'basketball_ncaab', 'NCAAF': 'americanfootball_ncaaf' };
              const sportKey = sportKeyMap[args.sport];
              const numGames = args.num_games || 5;
              const nameParts = args.player_name.trim().split(' ');
              const lastName = nameParts[nameParts.length - 1];
              const searchTerm = nameParts.length > 1 ? args.player_name.trim() : lastName;
              let playersResp = await ballDontLieService.getPlayersGeneric(sportKey, { search: searchTerm, per_page: 25 });
              let players = Array.isArray(playersResp) ? playersResp : (playersResp?.data || []);
              if (players.length === 0 && searchTerm !== lastName) {
                playersResp = await ballDontLieService.getPlayersGeneric(sportKey, { search: lastName, per_page: 25 });
                players = Array.isArray(playersResp) ? playersResp : (playersResp?.data || []);
              }
              const fullNameLower = args.player_name.toLowerCase();
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
                console.log(`    [Tool Response] ${functionName}: ${logContent.slice(0, 300)}${logContent.length > 300 ? '...' : ''}`);
                calledTokens.push({ token: `PLAYER_GAME_LOGS:${args.player_name}`, quality: 'available' });
              }
            } catch (err) {
              functionResponses.push({ name: functionName, content: JSON.stringify({ error: `Player game logs failed: ${err.message}` }) });
            }
          } else if (functionName === 'fetch_nba_player_stats') {
            // NBA advanced player stats — same logic as Gary's handler
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
                // Summarize with player names baked in (prevents LLM misattribution)
                const nbaStatsSummary = summarizeNbaPlayerAdvancedStats(stats, args.stat_type, team.full_name);
                functionResponses.push({ name: functionName, content: nbaStatsSummary });
                console.log(`    [Tool Response] ${functionName}: ${nbaStatsSummary.slice(0, 300)}${nbaStatsSummary.length > 300 ? '...' : ''}`);
                calledTokens.push({ token: `NBA_PLAYER_STATS:${args.stat_type}`, quality: 'available' });
              }
            } catch (err) {
              functionResponses.push({ name: functionName, content: JSON.stringify({ error: `NBA player stats failed: ${err.message}` }) });
            }
          } else {
            // Unknown tool — return error
            functionResponses.push({ name: functionName, content: `Unknown tool: ${functionName}` });
          }
        }

        console.log(`[Research Briefing] Iteration ${researchIter + 1}: ${response.toolCalls.length} tool call(s) (${totalToolCalls} stat + ${groundingCalls} grounding)`);
        currentMessage = functionResponses;
        isFunctionResponse = true;
      } else {
        // No content and no tool calls — something went wrong
        console.warn(`[Research Briefing] Iteration ${researchIter + 1}: No content and no tool calls — breaking`);
        break;
      }
    }

    // If we exhausted iterations without a final text response, return null
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.warn(`[Research Briefing] Exhausted ${MAX_RESEARCH_ITERATIONS} iterations after ${elapsed}s (${totalToolCalls} stat + ${groundingCalls} grounding calls) — no final briefing`);
    return null;

  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[Research Briefing] ❌ Error after ${elapsed}s: ${error.message}`);
    return null;
  }
}


