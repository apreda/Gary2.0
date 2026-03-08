import { createGeminiSession, sendToSessionWithRetry } from './sessionManager.js';
import { getFlashInvestigationPrompt } from '../flashInvestigationPrompts.js';
import { getWbcTournamentAwareness } from './spreadEvaluationFactors.js';
import { ballDontLieService } from '../../ballDontLieService.js';
import { nbaSeason, nhlSeason, nflSeason, ncaabSeason } from '../../../utils/dateUtils.js';
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

// Factor headers must be standalone lines.
// Accept either:
//   **Factor Name**
//   ### Factor Name
const FACTOR_HEADING_REGEX = /^\s*(?:\*\*([^*\n]{3,100})\*\*|#{2,4}\s+([^\n#]{3,100}))\s*$/gm;
const NON_FACTOR_HEADINGS = new Set([
  'game',
  'spread',
  'scout report data',
  'your task',
  'tokens',
  'key finding',
  'numbers',
  'context',
  'sources called',
  'spread impact note',
  'why this could affect the spread/price',
  'evidence from this game context',
  'nuance check'
]);

const TOKEN_LIKE_REGEX = /\b[A-Z][A-Z0-9_]{2,}\b/g;
const OPPONENT_CONTEXT_CLAIM_REGEX = /(opponent quality|quality of (?:opponents?|competition)|weaker opponents?|stronger opponents?|easy schedule|soft schedule|schedule-adjusted|recency bias|recent blowouts?|visible losses?|inflated (?:by|due to)|distorted (?:by|due to))/i;
const SCORE_CONTEXT_REGEX = /\b\d{2,3}\s*-\s*\d{2,3}\b/;
const NAMED_OPPONENT_REGEX = /\b(?:vs\.?|@|at|against|beat|defeated|lost to|fell to|won over)\s+[A-Z][A-Za-z.&'-]+(?:\s+[A-Z][A-Za-z.&'-]+){0,3}\b/;
const MIN_FACTOR_BLOCKS = 5; // Guardrail only; exhaustive coverage is enforced separately.

function extractFactorBlocks(briefingText = '') {
  const headingRegex = new RegExp(FACTOR_HEADING_REGEX.source, FACTOR_HEADING_REGEX.flags);
  const matches = [...briefingText.matchAll(headingRegex)];
  const headings = matches
    .map(match => ({
      title: (match[1] || match[2] || '').trim().replace(/^\d+\.\s*/, '').replace(/[:\s]+$/, ''),
      trailing: '',
      index: match.index ?? 0
    }))
    .filter(h => h.title.length >= 3)
    .filter(h => !NON_FACTOR_HEADINGS.has(h.title.toLowerCase()));

  const blocks = [];
  for (let i = 0; i < headings.length; i++) {
    const start = headings[i].index;
    const end = i + 1 < headings.length ? headings[i + 1].index : briefingText.length;
    const raw = briefingText.slice(start, end).trim();
    blocks.push({
      title: headings[i].title,
      body: raw,
      trailing: headings[i].trailing
    });
  }
  return blocks;
}

function isPriceDriverFactor(factorName = '') {
  const name = String(factorName).toLowerCase();
  const driverKeywords = [
    'injur', 'rest', 'schedule', 'travel',
    'form', 'streak', 'recency',
    'ranking', 'reputation',
    'home', 'venue', 'narrative', 'public',
    'returning', 'trap'
  ];
  return driverKeywords.some(k => name.includes(k));
}

function hasConcreteGameEvidence(text = '') {
  return SCORE_CONTEXT_REGEX.test(text) || NAMED_OPPONENT_REGEX.test(text);
}

function normalizeSportForFactorCoverage(sport = '') {
  if (sport === 'NBA') return 'basketball_nba';
  if (sport === 'NCAAB') return 'basketball_ncaab';
  if (sport === 'NHL') return 'icehockey_nhl';
  if (sport === 'NFL') return 'americanfootball_nfl';
  if (sport === 'NCAAF') return 'americanfootball_ncaaf';
  return sport;
}

function normalizeHeadingLabel(text = '') {
  return text
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getExpectedChecklistFactors(sport = '') {
  const prompt = getFlashInvestigationPrompt(sport, null);
  const lines = prompt.split('\n');
  const expected = [];
  let inChecklist = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (/^##\s+INVESTIGATION CHECKLIST/i.test(line)) {
      inChecklist = true;
      continue;
    }
    if (inChecklist && /^##\s+DEEP INVESTIGATION/i.test(line)) {
      break;
    }
    if (!inChecklist) continue;

    const match = line.match(/^###\s+\d+\.\s+(.+)$/i);
    if (match) {
      expected.push(match[1].trim());
    }
  }

  return expected;
}

function blockCoversExpectedFactor(block, factorName) {
  const blockText = `${block.title}\n${block.body}`.toLowerCase();
  const factorNorm = normalizeHeadingLabel(factorName);
  const blockNorm = normalizeHeadingLabel(block.title);

  if (!factorNorm) return false;
  if (blockNorm === factorNorm) return true;
  if (blockNorm.includes(factorNorm) || factorNorm.includes(blockNorm)) return true;

  const factorWords = factorNorm.split(' ').filter(w => w.length >= 4 && !['factors', 'offense', 'defense', 'context', 'stats'].includes(w));
  if (factorWords.length === 0) return false;
  return factorWords.every(w => blockText.includes(w));
}

function validateBriefingStructure(briefingText, sport) {
  const issues = [];
  const warnings = [];
  const blocks = extractFactorBlocks(briefingText);

  if (blocks.length === 0) {
    return {
      valid: false,
      issues: ['No factor blocks found. Use repeated "**[Factor Name]**" sections.'],
      warnings: [],
      blockCount: 0
    };
  }

  if (blocks.length < MIN_FACTOR_BLOCKS) {
    issues.push(`Expected at least ${MIN_FACTOR_BLOCKS} factor blocks, found ${blocks.length}.`);
  }

  for (const block of blocks) {
    const body = block.body;
    const label = `[${block.title}]`;

    if (!/key\s*finding\s*:/i.test(body)) {
      issues.push(`${label} Missing "Key finding:" line.`);
    }

    const numbersMatch = body.match(/numbers\s*:\s*([^\n]+)/i);
    if (!numbersMatch) {
      issues.push(`${label} Missing "Numbers:" line.`);
    }

    if (!/context\s*:/i.test(body)) {
      issues.push(`${label} Missing "Context:" line.`);
    }

    const sourcesMatch = body.match(/sources\s+called\s*:\s*([^\n]+)/i);
    if (!sourcesMatch) {
      issues.push(`${label} Missing "Sources called:" line.`);
    } else {
      const sourceText = sourcesMatch[1] || '';
      if (!sourceText.trim()) {
        issues.push(`${label} "Sources called:" must be non-empty.`);
      }
    }

    if (isPriceDriverFactor(block.title)) {
      if (!/spread\s+impact\s+note\s*:/i.test(body)) {
        warnings.push(`${label} Price-driver factor is missing "Spread impact note:".`);
      } else {
        if (!/why\s+this\s+could\s+affect\s+the\s+(?:spread|price)/i.test(body)) {
          warnings.push(`${label} Spread impact note missing "Why this could affect the spread/price".`);
        }
        if (!/evidence\s+from\s+this\s+game\s+context/i.test(body)) {
          warnings.push(`${label} Spread impact note missing "Evidence from this game context".`);
        }
        if (!/nuance\s+check/i.test(body)) {
          warnings.push(`${label} Spread impact note missing "Nuance check".`);
        }
      }
    }

    // Opponent-quality / recency-distortion concrete-evidence check:
    // enforce on spread-impact context (where price-impact claims are asserted),
    // not on every incidental mention in the factor block.
    const spreadImpactSectionMatch = body.match(/spread\s+impact\s+note\s*:[\s\S]*/i);
    const spreadImpactSection = spreadImpactSectionMatch ? spreadImpactSectionMatch[0] : '';
    if (spreadImpactSection && OPPONENT_CONTEXT_CLAIM_REGEX.test(spreadImpactSection) && !hasConcreteGameEvidence(spreadImpactSection)) {
      warnings.push(`${label} Opponent-quality/recency claim in spread impact note needs concrete game evidence (opponent names and/or score context).`);
    }
  }

  // Exhaustive factor coverage gate: every checklist factor from the investigation prompt
  // must be represented in the final briefing.
  const normalizedSport = normalizeSportForFactorCoverage(sport);
  const expectedFactors = getExpectedChecklistFactors(normalizedSport);
  if (expectedFactors.length > 0) {
    const missingFactors = expectedFactors.filter(factorName =>
      !blocks.some(block => blockCoversExpectedFactor(block, factorName))
    );
    if (missingFactors.length > 0) {
      issues.push(`Missing factor coverage blocks: ${missingFactors.slice(0, 12).join(', ')}${missingFactors.length > 12 ? ` (+${missingFactors.length - 12} more)` : ''}.`);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    warnings,
    blockCount: blocks.length
  };
}

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

    let sourcesCalled = '';
    if (Array.isArray(factor?.sourcesCalled)) {
      sourcesCalled = factor.sourcesCalled.filter(Boolean).map(s => String(s).trim()).filter(Boolean).join(', ');
    } else {
      sourcesCalled = getStringValue(factor?.sourcesCalled, factor?.sources_called, factor?.sources);
    }

    if (!factorName) shapeIssues.push(`Factor ${idx} missing "factor".`);
    if (!keyFinding) shapeIssues.push(`Factor ${idx} missing "keyFinding".`);
    if (!numbers) shapeIssues.push(`Factor ${idx} missing "numbers".`);
    if (!context) shapeIssues.push(`Factor ${idx} missing "context".`);
    if (!sourcesCalled) shapeIssues.push(`Factor ${idx} missing "sourcesCalled".`);

    const spreadObj = factor?.spreadImpactNote || factor?.spread_impact_note || factor?.spreadImpact;
    let spreadImpactNote = null;
    if (spreadObj && typeof spreadObj === 'object') {
      const why = getStringValue(spreadObj?.why, spreadObj?.whyThisCouldAffectTheSpreadPrice, spreadObj?.why_this_could_affect_the_spread_price);
      const evidence = getStringValue(spreadObj?.evidence, spreadObj?.evidenceFromThisGameContext, spreadObj?.evidence_from_this_game_context);
      const nuance = getStringValue(spreadObj?.nuance, spreadObj?.nuanceCheck, spreadObj?.nuance_check);
      if (why || evidence || nuance) {
        spreadImpactNote = { why, evidence, nuance };
      }
    }

    normalizedFactors.push({
      factorName: factorName || `Factor ${idx}`,
      keyFinding,
      numbers,
      context,
      sourcesCalled,
      spreadImpactNote
    });
  });

  if (shapeIssues.length > 0) {
    return { payload: null, error: `JSON schema issues: ${shapeIssues.slice(0, 10).join(' | ')}` };
  }

  return { payload: { factors: normalizedFactors }, error: null };
}

function renderStructuredBriefing(payload) {
  const blocks = [];
  for (const factor of payload.factors) {
    const lines = [
      `**${factor.factorName}**`,
      `Key finding: ${factor.keyFinding}`,
      `Numbers: ${factor.numbers}`,
      `Context: ${factor.context}`,
      `Sources called: ${factor.sourcesCalled}`
    ];

    if (factor.spreadImpactNote && (factor.spreadImpactNote.why || factor.spreadImpactNote.evidence || factor.spreadImpactNote.nuance)) {
      lines.push('Spread impact note:');
      lines.push(`Why this could affect the spread/price: ${factor.spreadImpactNote.why || 'N/A'}`);
      lines.push(`Evidence from this game context: ${factor.spreadImpactNote.evidence || 'N/A'}`);
      lines.push(`Nuance check: ${factor.spreadImpactNote.nuance || 'N/A'}`);
    }

    blocks.push(lines.join('\n'));
  }
  return blocks.join('\n\n').trim();
}

function buildFormatRewritePrompt(validationIssues = [], parseError = '') {
  const issueList = validationIssues.slice(0, 20).map(i => `- ${i}`).join('\n');
  return `## FORMAT CORRECTION REQUIRED

Your final output is non-compliant. Rewrite your COMPLETE briefing now as ONE JSON object only (no prose outside JSON).

Issues found:
${issueList || '- Missing required structure.'}
${parseError ? `- ${parseError}` : ''}

Required JSON schema:
{
  "factors": [
    {
      "factor": "Factor name",
      "keyFinding": "1-2 sentence finding",
      "numbers": "Concrete stats for BOTH teams in one line",
      "context": "Opponent quality / who played / sample window context",
      "sourcesCalled": ["TOKEN_A", "TOKEN_B"],
      "spreadImpactNote": {
        "why": "Why this could affect the spread/price",
        "evidence": "Concrete game-context evidence",
        "nuance": "What could overstate/understate tonight"
      }
    }
  ]
}

Rules:
- Include every investigation factor category in "factors".
- Keep "spreadImpactNote" only on price-driver factors.
- If claiming opponent-quality or recency distortion, include named opponents and/or score/result details in context/evidence.
- "numbers" must include concrete stats for BOTH teams.
- "sourcesCalled" must contain token-like identifiers.

If you reference opponent quality, recency inflation, or schedule-adjusted context, include concrete game evidence (named opponents and/or score/result details), not generic wording.

Do NOT make a pick or recommendation.`;
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
  const MAX_RESEARCH_ITERATIONS = 25; // Increased to accommodate coverage retry pass

  try {
    const sportLabel = sport.replace('basketball_', '').replace('americanfootball_', '').replace('icehockey_', '').toUpperCase();

    // Get per-sport investigation methodology (factors + cross-referencing)
    const investigationMethodology = getFlashInvestigationPrompt(sport, options.spread ?? null);

    // Flash gets the same stat tools Gary has (minus FINALIZE_PROPS)
    // All sports get fetch_narrative_context (grounding) — Flash handles narrative investigation
    const researchTools = toolDefinitions;

    const isNCAABSport = sport === 'basketball_ncaab' || sport === 'NCAAB';
    const isMLBSport = sport === 'baseball_mlb' || sport === 'MLB' || sport === 'WBC';
    const wbcAwarenessBlock = isMLBSport ? `\n\n${getWbcTournamentAwareness()}\n` : '';

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
${wbcAwarenessBlock}
CRITICAL RULES:
- Cover every factor category — don't skip any
- Report specific numbers with context: "Team went 2-4 with -8.3 net rating during games 60-65 when Player X was out — but 3 of those were against top-10 defenses"
- Connect findings across factors — roster changes to stat shifts, schedule to form, injury timelines to performance windows
- If you reference opponent quality or recency distortion, include concrete evidence (named opponents and/or score/result context), not generic claims like "weaker opposition"
- When citing any trend (L5/L10 or recent stretch), include concrete sample context: opponent names/results and who was active/inactive in that window.
- For search/grounding results, use factual events only. Ignore picks, predictions, and opinion content.
- Do NOT pick a side or recommend a bet — your job is factual research only
- Do NOT fabricate stats — only report what comes from the scout report or your tool calls
- Do NOT rely on opening/closing-line mechanics, market-setter/copy-book mechanics, or sharp/public microstructure unless concrete supporting data exists in your provided context

OUTPUT FORMAT (REQUIRED):
Return ONLY one JSON object using this schema:
{
  "factors": [
    {
      "factor": "Factor name",
      "keyFinding": "...",
      "numbers": "Concrete stats for BOTH teams",
      "context": "...",
      "sourcesCalled": ["TOKEN_A", "TOKEN_B"],
      "spreadImpactNote": {
        "why": "...",
        "evidence": "...",
        "nuance": "..."
      }
    }
  ]
}

Rules:
- Include every investigation factor category in factors[].
- spreadImpactNote is required only for price-driver factors.
- Do not add prose before/after JSON.
- Do NOT make a pick or recommendation.`,
      tools: researchTools,
      thinkingLevel: 'high'
    });

    const hasSpread = Number.isFinite(options.spread);
    const briefingPrompt = `## RESEARCH BRIEFING REQUEST

**Game:** ${homeTeam} vs ${awayTeam} (${sportLabel})
${hasSpread ? `**Spread:** ${options.spread}` : ''}

**Scout Report Data:**
${scoutReportContent}

---

**Your task:** Conduct a comprehensive pre-game investigation using the factor guide in your instructions. For each factor:
1. Check what the scout report already provides
2. Use your fetch_stats tools to investigate deeper — pull efficiency data, game logs, splits, matchup data, anything that fills gaps
3. Use fetch_narrative_context for storylines, news, or context that stat tools can't provide${isNCAABSport ? ' (NCAAB: narrative context is already in the scout report — prefer fetch_stats for BDL data)' : ''}${isMLBSport ? ' (WBC: Use fetch_narrative_context aggressively — tournament storylines, lineup confirmations, bullpen availability, and breaking news are critical. Make multiple grounding calls for different angles: team form, pitching matchup preview, roster/lineup updates)' : ''}
4. Report findings with specific numbers for both teams
5. Flag connections between factors (roster changes overlapping form shifts, schedule quality affecting recent stats, etc.)

After completing your research, output ONLY one JSON object with:
- factors[] entries containing: factor, keyFinding, numbers, context, sourcesCalled
- spreadImpactNote { why, evidence, nuance } only for price-driver factors

If you claim opponent-quality effects or recency distortion, include concrete game evidence (opponent names and/or score/result context).`;

    console.log(`[Research Briefing] Sending ${briefingPrompt.length} chars to Gemini Flash (with tools, max ${MAX_RESEARCH_ITERATIONS} iterations)`);

    // ═══════════════════════════════════════════════════════════════════════
    // RESEARCH AGENT LOOP: Flash investigates with tools, then writes briefing
    // ═══════════════════════════════════════════════════════════════════════
    let currentMessage = briefingPrompt;
    let isFunctionResponse = false;
    let totalToolCalls = 0;
    let groundingCalls = 0;
    const calledTokens = []; // Track which stat tokens Flash called (for factor coverage)
    let coverageRetryDone = false; // Track whether we've already sent the coverage gap message
    let formatRetryDone = false; // One-shot retry if briefing format is non-compliant

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

            // HARD GATE: every factor category with required tokens must be covered.
            // No partial thresholds (e.g., 80%) are allowed.
            if (missingFactors.length > 0) {
              coverageRetryDone = true;
              const gapList = missingFactors.map(f =>
                `- ${f.name}: call ${f.tokens.slice(0, 3).join(' or ')}`
              ).join('\n');
              console.log(`[Research Briefing] Coverage incomplete (${coveredFactors}/${totalFactors} factors) — all factors required, sending retry pass`);

              // Send Flash back to fill the gaps
              currentMessage = `## COVERAGE GAPS — ADDITIONAL RESEARCH NEEDED

You missed the following factor categories. Please investigate these NOW using fetch_stats:

${gapList}

After investigating, rewrite your COMPLETE briefing as ONE JSON object including ALL factors (both your original findings and these new ones).`;
              isFunctionResponse = false;
              continue; // Go back to the loop — Flash will make more tool calls
            }
          }
        }

        // Parse structured JSON briefing and render canonical factor blocks.
        const parsed = parseStructuredBriefingPayload(response.content);
        if (!parsed.payload) {
          console.warn(`[Research Briefing] Structured parse failed: ${parsed.error}`);
          if (!formatRetryDone) {
            formatRetryDone = true;
            currentMessage = buildFormatRewritePrompt([], parsed.error);
            isFunctionResponse = false;
            console.log('[Research Briefing] Triggering one-shot structured rewrite pass');
            continue;
          }
          console.error(`[Research Briefing] ❌ Structured parse failed after retry: ${parsed.error}`);
          return null;
        }

        const briefing = renderStructuredBriefing(parsed.payload);
        console.log(`[Research Briefing] ✅ Briefing received in ${elapsed}s (${briefing.length} chars rendered, ${totalToolCalls} stat calls + ${groundingCalls} grounding calls across ${researchIter + 1} iterations)`);

        // Format check: enforce concrete per-factor briefing schema with one rewrite retry
        const validation = validateBriefingStructure(briefing, sport);
        if (!validation.valid) {
          console.warn(`[Research Briefing] Format validation failed (${validation.issues.length} issues across ${validation.blockCount} blocks)`);
          if (!formatRetryDone) {
            formatRetryDone = true;
            currentMessage = buildFormatRewritePrompt(validation.issues, '');
            isFunctionResponse = false;
            console.log('[Research Briefing] Triggering one-shot format rewrite pass');
            continue;
          }
          // Soft-fail: if the briefing has real substance (5+ blocks with key findings),
          // use it despite format issues rather than killing the entire game
          const substantiveBlocks = extractFactorBlocks(briefing).filter(b => /key\s*finding\s*:/i.test(b.body));
          if (substantiveBlocks.length >= 5) {
            console.warn(`[Research Briefing] ⚠️ Format issues remain after retry (${validation.issues.length}) but briefing has ${substantiveBlocks.length} substantive blocks — using it`);
            console.warn(`[Research Briefing] Soft-fail issues: ${validation.issues.slice(0, 8).join(' | ')}`);
          } else {
            console.error(`[Research Briefing] ❌ Format validation failed after retry (${validation.issues.length} issues, only ${substantiveBlocks.length} substantive blocks)`);
            console.error(`[Research Briefing] Issues: ${validation.issues.slice(0, 8).join(' | ')}`);
            return null;
          }
        }
        if (validation.warnings && validation.warnings.length > 0) {
          console.warn(`[Research Briefing] Non-blocking format warnings (${validation.warnings.length}): ${validation.warnings.slice(0, 4).join(' | ')}`);
        }

        // Log final coverage diagnostics
        const availableCount = calledTokens.filter(t => t.quality === 'available').length;
        const unavailableCount = calledTokens.filter(t => t.quality === 'unavailable').length;
        console.log(`[Research Briefing] Token coverage: ${availableCount} available, ${unavailableCount} unavailable out of ${calledTokens.length} total calls`);

        return { briefing, calledTokens };
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
