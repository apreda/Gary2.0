/**
 * DFS Slate Analyzer
 *
 * Phase 2 of the Agentic DFS system.
 * Flash investigates the full slate using per-sport investigation factors,
 * coverage checking, and produces both structured JSON and a narrative briefing
 * for downstream phases (Phase 3 player investigation, Phase 4 lineup decision).
 *
 * Modeled after the game picks Flash research assistant (flashAdvisor.js).
 */

import { DFS_SLATE_ANALYSIS_TOOLS, executeToolCall } from './tools/dfsToolDefinitions.js';
import { GEMINI_FLASH_MODEL } from '../modelConfig.js';
import { getDFSInvestigationPrompt } from './dfsInvestigationPrompts.js';
import { getDFSInvestigatedFactors, buildDFSCoverageGapList } from './dfsInvestigationFactors.js';

// ═══════════════════════════════════════════════════════════════════════════════
// SLATE ANALYSIS SYSTEM PROMPT (Dynamic — per-sport)
// ═══════════════════════════════════════════════════════════════════════════════

function buildSlateAnalysisPrompt(sport) {
  const investigationMethodology = getDFSInvestigationPrompt(sport);

  return `<role>
You are Gary's DFS Research Assistant.
Your job is to INVESTIGATE the slate and surface FACTUAL findings for Gary to evaluate.
</role>

<training_data_warning>
Your training data is from 2024 and is 18+ months out of date. Players may have been traded, retired, or changed teams since then.
USE ONLY the data returned by your function calls. If your memory conflicts with the data, USE THE DATA.
Do NOT treat roster changes, trades, or team assignments as "new" or "surprising" — if a player is on a team in the data, that IS their current team. The salary already reflects it.
</training_data_warning>

${investigationMethodology}

<investigation_process>
1. Work through EVERY factor in the investigation checklist above
2. For each factor: call the relevant tools, then report findings with specific numbers
3. Connect findings across factors — an injury that overlaps with a usage shift is one finding, not two
4. After completing ALL factors, produce your structured JSON summary
5. Cover every factor category — do NOT skip any
</investigation_process>

<output_format>
After investigation, summarize your findings in JSON:
{
  "injuryReport": [
    {
      "team": "LAL",
      "outPlayers": [
        { "player": "LeBron James", "duration": "RECENT", "gamesMissed": 1 }
      ],
      "gtdPlayers": ["Anthony Davis"]
    }
  ],
  "gameProfiles": [
    {
      "game": "LAL vs SAC",
      "overUnder": 235,
      "pace": "high"
    }
  ],
  "gameEnvironments": [
    {
      "game": "LAL vs SAC",
      "homeTeam": "SAC",
      "awayTeam": "LAL",
      "spread": -3.5,
      "overUnder": 235,
      "homePace": 100.2,
      "awayPace": 99.8
    }
  ]
}
</output_format>

<constraints>
- DO NOT make lineup decisions — just gather and organize the data
- DO NOT rank players or suggest who to roster
- DO NOT label players as "beneficiaries" or compute "boosts" — just report the facts
- DO NOT compute "fair value" or "edge" amounts — report what you found and let Gary evaluate
</constraints>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ANALYSIS FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Analyze the slate using Gemini with function calling
 *
 * @param {GoogleGenerativeAI} genAI - Gemini client
 * @param {Object} context - DFS context with players, games, injuries
 * @param {Object} options - Model options
 * @returns {Object} - Slate analysis with structured JSON + narrative briefing
 */
export async function analyzeSlateWithFlash(genAI, context, options = {}) {
  const { modelName = GEMINI_FLASH_MODEL } = options;
  const sport = (context.sport || 'NBA').toUpperCase();

  console.log('[Slate Analyzer] Starting slate investigation...');

  // Build the analysis request with context
  const analysisRequest = buildAnalysisRequest(context);

  // Build per-sport system prompt
  const systemPrompt = buildSlateAnalysisPrompt(sport);

  // Create model with function calling tools
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: systemPrompt,
    tools: [{ functionDeclarations: DFS_SLATE_ANALYSIS_TOOLS }],
    generationConfig: {
      temperature: 1.0,
      maxOutputTokens: 65536
    },
    thinkingConfig: {
      thinkingBudget: -1 // HIGH thinking — let Flash think deeply
    }
  });

  // Start the investigation loop
  let chat = model.startChat({ history: [] });
  let response = await chat.sendMessage(analysisRequest);
  let iterations = 0;
  const maxIterations = 25;
  const calledTools = []; // Track tool calls for coverage validation
  let coverageRetryDone = false;

  // Function calling loop - Flash investigates via tools
  while (iterations < maxIterations) {
    iterations++;

    const candidate = response.response.candidates?.[0];
    if (!candidate) break;

    const content = candidate.content;
    const functionCalls = content?.parts?.filter(p => p.functionCall) || [];

    if (functionCalls.length === 0) {
      // No more function calls — Flash produced text
      // Check coverage before accepting
      let finalText = '';
      try { finalText = response.response.text(); } catch (_) { /* no text yet */ }

      if (finalText && finalText.trim() && !coverageRetryDone) {
        const coverageResult = getDFSInvestigatedFactors(calledTools, sport);

        if (coverageResult.totalFactors > 0 && coverageResult.coverage < 0.9) {
          coverageRetryDone = true;
          const gapList = buildDFSCoverageGapList(coverageResult.missing, sport);
          console.log(`[Slate Analyzer] Coverage at ${(coverageResult.coverage * 100).toFixed(0)}% (${coverageResult.covered.length}/${coverageResult.totalFactors} factors) — need 90%, sending retry pass`);

          response = await chat.sendMessage(
            `## COVERAGE GAPS — ADDITIONAL RESEARCH NEEDED

You missed the following factor categories. Please investigate these NOW using the tools:

${gapList}

After investigating the gaps, rewrite your COMPLETE JSON summary including ALL findings (both your original findings and these new ones).`
          );
          continue; // Go back to the loop — Flash will make more tool calls
        }

        // Coverage is sufficient — break out
        console.log(`[Slate Analyzer] Coverage: ${(coverageResult.coverage * 100).toFixed(0)}% (${coverageResult.covered.length}/${coverageResult.totalFactors} factors)`);
      }

      break;
    }

    console.log(`[Slate Analyzer] Iteration ${iterations}: ${functionCalls.length} function calls`);

    // Execute each function call and track for coverage
    const functionResponses = [];
    for (const part of functionCalls) {
      const { name, args } = part.functionCall;
      console.log(`[Slate Analyzer]   → ${name}(${JSON.stringify(args).slice(0, 50)}...)`);

      const result = await executeToolCall(name, args, context);
      calledTools.push({ tool: name, args, iteration: iterations });

      functionResponses.push({
        functionResponse: {
          name,
          response: result
        }
      });
    }

    // Send function results back to Flash
    response = await chat.sendMessage(functionResponses);
  }

  // Parse the final response
  let finalText = '';
  try { finalText = response.response.text(); } catch (_) { /* empty */ }

  // If Flash ended its loop without producing text, nudge it to output JSON.
  if (!finalText || !finalText.trim()) {
    console.log('[Slate Analyzer] Flash ended without text — nudging for JSON summary...');
    response = await chat.sendMessage(
      'Your investigation is complete. Do NOT make any more function calls. Now produce your JSON summary with injuryReport, gameProfiles, and gameEnvironments based on everything you found.'
    );
    // If nudge triggered more function calls, execute them
    const nudgeCalls = response.response.candidates?.[0]?.content?.parts?.filter(p => p.functionCall) || [];
    if (nudgeCalls.length > 0 && iterations < maxIterations) {
      iterations++;
      const nudgeResponses = [];
      for (const part of nudgeCalls) {
        const result = await executeToolCall(part.functionCall.name, part.functionCall.args, context);
        calledTools.push({ tool: part.functionCall.name, args: part.functionCall.args, iteration: iterations });
        nudgeResponses.push({ functionResponse: { name: part.functionCall.name, response: result } });
      }
      response = await chat.sendMessage(nudgeResponses);
    }
    try { finalText = response.response.text(); } catch (_) { /* empty */ }
  }

  if (!finalText || !finalText.trim()) {
    console.log('[Slate Analyzer] First nudge returned empty — sending final nudge...');
    response = await chat.sendMessage(
      'Do NOT call any functions. Output a JSON object with your findings. Start your response with { immediately.'
    );
    try { finalText = response.response.text(); } catch (_) { /* empty */ }
  }

  const analysis = parseSlateAnalysis(finalText);

  // ═══════════════════════════════════════════════════════════════════════════
  // NARRATIVE BRIEFING — Ask Flash to produce per-factor narrative findings
  // Flash has the full tool call history in its session, so it can reference
  // everything it found during investigation.
  // ═══════════════════════════════════════════════════════════════════════════
  let narrativeBriefing = '';
  try {
    const narrativeResponse = await chat.sendMessage(
      `Now write a NARRATIVE BRIEFING of your investigation findings. Do NOT call any more functions.

For each factor you investigated, write a concise bullet point with:
- The factor name
- Key finding with specific numbers for BOTH teams / all relevant games
- Any important context (fresh vs absorbed injuries, pace mismatches, value gaps, stacking environments)

Format as structured bullet points:
- **[Factor Name]**: Key finding with specific numbers. Context note if relevant.

This briefing will be passed to Gary for lineup construction. Surface the FACTS — do not make lineup recommendations.`
    );
    narrativeBriefing = narrativeResponse.response.text() || '';
  } catch (narrativeErr) {
    console.warn(`[Slate Analyzer] Narrative briefing failed: ${narrativeErr.message} — continuing without`);
  }

  console.log(`[Slate Analyzer] Investigation complete after ${iterations} iterations (${calledTools.length} tool calls)`);
  if (narrativeBriefing) {
    console.log(`[Slate Analyzer] Narrative briefing: ${narrativeBriefing.length} chars`);
  }

  return {
    ...analysis,
    narrativeBriefing,
    calledTools
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUILD ANALYSIS REQUEST
// ═══════════════════════════════════════════════════════════════════════════════

function buildAnalysisRequest(context) {
  const { players, games, injuries, platform, sport } = context;

  // Group players by team
  const teamRosters = {};
  for (const player of players) {
    const team = player.team || 'UNK';
    if (!teamRosters[team]) teamRosters[team] = [];
    teamRosters[team].push(player);
  }

  // Format games (include O/U, spread, implied totals, B2B, pace)
  const gamesStr = (games || []).map(g => {
    const home = g.homeTeam || g.home_team || 'HOME';
    const away = g.awayTeam || g.visitor_team || g.away_team || 'AWAY';
    const total = g.total ? ` (O/U ${g.total})` : '';
    const spread = g.spread ? ` [${g.spread > 0 ? '+' : ''}${g.spread}]` : '';
    const implied = (g.implied_home_total != null && g.implied_away_total != null)
      ? ` Implied: ${home} ${g.implied_home_total} / ${away} ${g.implied_away_total}`
      : '';
    const pace = g.game_pace ? ` Pace: ${g.game_pace}` : '';
    const flags = [];
    if (g.home_b2b) flags.push(`${home} B2B`);
    if (g.away_b2b) flags.push(`${away} B2B`);
    const flagStr = flags.length > 0 ? ` | ${flags.join(', ')}` : '';
    return `${away} @ ${home}${total}${spread}${implied}${pace}${flagStr}`;
  }).join('\n');

  // Format opponent defense profiles per game (BDL real data)
  const defenseLines = (games || []).map(g => {
    const home = g.homeTeam || g.home_team || 'HOME';
    const away = g.awayTeam || g.visitor_team || g.away_team || 'AWAY';
    const lines = [];

    // Away team's defense (what they allow — relevant for home team's offense)
    const awayDef = g.away_defense;
    if (awayDef && awayDef.opp_pts != null) {
      lines.push(`${away} Defense: Allow ${awayDef.opp_pts.toFixed(1)} PPG | ${awayDef.opp_efg_pct ?? '?'}% eFG | ${awayDef.opp_fg3_pct ?? '?'}% 3PT | ${awayDef.opp_ft_rate ?? '?'} FT Rate | Pace: ${awayDef.pace ?? '?'}`);
    }
    // Home team's defense (what they allow — relevant for away team's offense)
    const homeDef = g.home_defense;
    if (homeDef && homeDef.opp_pts != null) {
      lines.push(`${home} Defense: Allow ${homeDef.opp_pts.toFixed(1)} PPG | ${homeDef.opp_efg_pct ?? '?'}% eFG | ${homeDef.opp_fg3_pct ?? '?'}% 3PT | ${homeDef.opp_ft_rate ?? '?'} FT Rate | Pace: ${homeDef.pace ?? '?'}`);
    }
    return lines.join('\n');
  }).filter(Boolean).join('\n');

  // Format known injuries
  const injuriesStr = formatKnownInjuries(injuries);

  return `
## SLATE TO ANALYZE
Platform: ${platform}
Sport: ${sport}
Games: ${gamesStr}
Total Players: ${players.length}
${defenseLines ? `\n## OPPONENT DEFENSE PROFILES (BDL)\n${defenseLines}` : ''}

## KNOWN INJURIES (from context)
${injuriesStr || 'None loaded yet - USE GET_TEAM_INJURIES to check each team'}

## TEAMS ON SLATE
${Object.keys(teamRosters).join(', ')}

## YOUR TASK
Work through EVERY factor in your investigation checklist. Call the tools you need for each factor.
After completing all factors, produce your JSON summary.

Begin your investigation now.
`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PARSE ANALYSIS RESPONSE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract first top-level JSON object using bracket-depth tracking.
 * Unlike greedy regex /\{[\s\S]*\}/, this finds the MATCHING } for the first {.
 */
function extractJsonObject(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function parseSlateAnalysis(text) {
  const jsonStr = extractJsonObject(text);
  if (!jsonStr) {
    throw new Error('[Slate Analyzer] Flash did not produce JSON analysis. Raw response: ' + text.slice(0, 500));
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error('[Slate Analyzer] Flash produced invalid JSON: ' + e.message + '. Raw: ' + jsonStr.slice(0, 500));
  }

  // Require at least some analysis - can't be completely empty
  const hasAnalysis = (parsed.injuryReport?.length > 0) ||
                      (parsed.gameProfiles?.length > 0) ||
                      (parsed.gameEnvironments?.length > 0);

  if (!hasAnalysis) {
    console.warn('[Slate Analyzer] Flash found no data - verify slate has games');
  }

  // Diagnostic: Flash returned game-level data but no team-level profiles
  const envCount = parsed.gameEnvironments?.length || 0;
  const profileCount = parsed.gameProfiles?.length || 0;
  if (envCount > 0 && profileCount === 0) {
    console.warn(`[Slate Analyzer] Flash returned ${envCount} game environments but 0 game profiles — team-level analysis may be incomplete`);
  }

  return {
    injuryReport: parsed.injuryReport || [],
    gameProfiles: parsed.gameProfiles || [],
    gameEnvironments: parsed.gameEnvironments || [],
    rawAnalysis: text
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORMAT KNOWN INJURIES
// ═══════════════════════════════════════════════════════════════════════════════

function formatKnownInjuries(injuries) {
  if (!injuries) return '';

  const lines = [];
  for (const [team, teamInjuries] of Object.entries(injuries)) {
    if (!teamInjuries || teamInjuries.length === 0) continue;

    const out = teamInjuries.filter(i => i.status === 'Out' || i.status === 'OUT');
    const gtd = teamInjuries.filter(i => i.status === 'GTD' || i.status === 'Questionable' || i.status === 'Day-To-Day');

    if (out.length > 0) {
      lines.push(`${team} OUT: ${out.map(i => {
        const name = i.player?.first_name ? `${i.player.first_name} ${i.player.last_name}` : i.player;
        const durationTag = i.duration ? ` [${i.duration} — ${i.gamesMissed} games missed]` : '';
        return `${name}${durationTag}`;
      }).join(', ')}`);
    }
    if (gtd.length > 0) {
      lines.push(`${team} GTD: ${gtd.map(i => i.player?.first_name ? `${i.player.first_name} ${i.player.last_name}` : i.player).join(', ')}`);
    }
  }

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// OWNERSHIP VIA GEMINI GROUNDING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch projected ownership percentages using Gemini URL Context + Google Search.
 *
 * Uses the NEW @google/genai SDK (not @google/generative-ai) because
 * urlContext and googleSearch tools are only supported in the new SDK.
 *
 * Strategy: Point Gemini at FantasyTeamAdvice (server-rendered, free ownership
 * data for both DK and FD via direct HTML fetch + parse.
 *
 * The FTA page is server-rendered — ownership data is in static HTML tables.
 * Direct parsing is 100% accurate (no AI hallucination risk) and fast (~1s).
 *
 * Returns empty array on failure (ownership is supplemental — does not affect player selection).
 *
 * @param {object} _genAI - Unused (kept for interface compatibility)
 * @param {Object} context - DFS context { platform, ... }
 * @returns {Array} - Array of { player, team, projectedOwnership }
 */
export async function fetchOwnershipFromFTA(_genAI, context) {
  const platform = (context.platform || 'DraftKings');
  const isDK = platform.toLowerCase().includes('draftkings') || platform.toLowerCase() === 'dk';

  const sportLower = (context.sport || 'nba').toLowerCase();
  const FTA_URL = `https://fantasyteamadvice.com/dfs/${sportLower}/ownership`;

  let resp;
  try {
    resp = await fetch(FTA_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
  } catch (fetchErr) {
    console.warn(`[Ownership] FTA fetch failed: ${fetchErr.message}`);
    return [];
  }

  if (!resp.ok) {
    console.warn(`[Ownership] FTA returned ${resp.status}`);
    return [];
  }

  const html = await resp.text();

  // Page has two tables: DraftKings first, FanDuel second
  const sportUpper = (context.sport || 'NBA').toUpperCase();
  const fdSplitIdx = html.indexOf(`FanDuel ${sportUpper} Ownership`) !== -1
    ? html.indexOf(`FanDuel ${sportUpper} Ownership`)
    : html.indexOf('FanDuel');
  if (fdSplitIdx === -1) {
    if (isDK) {
      // DK users: FD section missing is fine — use the whole page (DK table comes first)
      console.warn('[Ownership] FanDuel section not found — using full page for DraftKings');
    } else {
      console.warn('[Ownership] Could not find FanDuel section — page structure may have changed');
      return [];
    }
  }

  const tableHtml = fdSplitIdx === -1 ? html : (isDK ? html.slice(0, fdSplitIdx) : html.slice(fdSplitIdx));

  // Parse rows: <tr data-player-name="...">
  //   <td class="sticky-column">Display Name</td>
  //   <td>Team</td>
  //   <td>Ownership%</td>
  const rowRegex = /<tr[^>]*data-player-name="[^"]*"[^>]*>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>\s*(\w+)\s*<\/td>\s*<td[^>]*>\s*([\d.]+)\s*<\/td>/g;

  const results = [];
  let match;
  while ((match = rowRegex.exec(tableHtml)) !== null) {
    const rawName = match[1].trim();
    const team = match[2].trim();
    const ownership = parseFloat(match[3]);

    // FTA display names have irregular casing ("Cj Mccollum", "Nickeil Alexanderwalker")
    // Normalize: title-case each word, fix common patterns
    const player = rawName
      .replace(/\b\w+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .replace(/\bMc(\w)/g, (_, c) => 'Mc' + c.toUpperCase())   // McCollum, McConnell, etc.
      .replace(/\b(Cj|Pj|Tj|Aj|Rj|Jj|Og|Kj|Dj|Jt)\b/gi, (m) => m.toUpperCase()) // Known initial pairs only
      .replace(/\bJr\b/g, 'Jr.');

    if (!isNaN(ownership)) {
      results.push({ player, team, projectedOwnership: ownership });
    }
  }

  // Sanity check: if we parsed very few results, the page structure may have changed
  if (results.length > 0 && results.length < 10) {
    console.warn(`[Ownership] Only ${results.length} players parsed from FTA — possible page structure change`);
  }

  console.log(`[Ownership] Fetched ${results.length} players from FTA (${isDK ? 'DraftKings' : 'FanDuel'})`);
  return results;
}
