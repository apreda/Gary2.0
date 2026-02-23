/**
 * DFS Slate Analyzer
 *
 * Phase 2 of the Agentic DFS system.
 * Gemini investigates the slate using function calls to BDL/RotoWire
 * to investigate:
 * - Injury status and team context
 * - Game environments (pace, O/U, spreads)
 * - Roster structure for teams with absences
 *
 * This gives Gary the INVESTIGATED DATA he needs for lineup construction.
 */

import { DFS_SLATE_ANALYSIS_TOOLS, executeToolCall } from './tools/dfsToolDefinitions.js';

// ═══════════════════════════════════════════════════════════════════════════════
// SLATE ANALYSIS SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

const SLATE_ANALYSIS_PROMPT = `
<role>
You are Gary's DFS Research Assistant.
Your job is to INVESTIGATE the slate and surface FACTUAL findings for Gary to evaluate.
</role>

<responsibilities>
- Use function calls to gather REAL DATA about players and games
- Investigate injury status for ALL teams — document who is OUT and how long they have been out
- Investigate game environments — O/U, spreads, pace matchups
- Surface the FACTS — Gary decides what they mean
</responsibilities>

<investigation_priorities>
1. Check injury status for ALL teams — note duration tags (RECENT, ESTABLISHED, LONG-TERM)
2. For teams with notable absences, investigate the current roster structure
3. Investigate each game's environment data
4. Document what you find — do NOT interpret what it means for lineups
</investigation_priorities>

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
</constraints>
`;

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ANALYSIS FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Analyze the slate using Gemini with function calling
 *
 * @param {GoogleGenerativeAI} genAI - Gemini client
 * @param {Object} context - DFS context with players, games, injuries
 * @param {Object} options - Model options
 * @returns {Object} - Slate analysis with opportunities identified
 */
export async function analyzeSlateWithFlash(genAI, context, options = {}) {
  const { modelName = 'gemini-3-flash-preview' } = options;

  console.log('[Slate Analyzer] Starting slate investigation...');

  // Build the analysis request with context
  const analysisRequest = buildAnalysisRequest(context);

  // Create model with function calling tools
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: SLATE_ANALYSIS_PROMPT,
    tools: [{ functionDeclarations: DFS_SLATE_ANALYSIS_TOOLS }],
    generationConfig: {
      temperature: 1.0, // Gemini: Keep at 1.0
      maxOutputTokens: 8192
    },
    thinkingConfig: {
      thinkingBudget: 8192
    }
  });

  // Start the investigation loop
  let chat = model.startChat({ history: [] });
  let response = await chat.sendMessage(analysisRequest);
  let iterations = 0;
  const maxIterations = 12;

  // Function calling loop - Flash investigates via tools
  while (iterations < maxIterations) {
    iterations++;

    const candidate = response.response.candidates?.[0];
    if (!candidate) break;

    const content = candidate.content;
    const functionCalls = content?.parts?.filter(p => p.functionCall) || [];

    if (functionCalls.length === 0) {
      // No more function calls - Flash is done investigating
      break;
    }

    console.log(`[Slate Analyzer] Iteration ${iterations}: ${functionCalls.length} function calls`);

    // Execute each function call
    const functionResponses = [];
    for (const part of functionCalls) {
      const { name, args } = part.functionCall;
      console.log(`[Slate Analyzer]   → ${name}(${JSON.stringify(args).slice(0, 50)}...)`);

      const result = await executeToolCall(name, args, context);
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
  let finalText = response.response.text();

  // If Flash ended its loop without producing text (spent all iterations on tool
  // calls, or last response was purely function calls), nudge it to output JSON.
  // Try twice — first nudge can also return empty.
  if (!finalText || !finalText.trim()) {
    console.log('[Slate Analyzer] Flash ended without text — nudging for JSON summary...');
    response = await chat.sendMessage(
      'Your investigation is complete. Do NOT make any more function calls. Now produce your JSON summary with injuryReport, gameProfiles, and gameEnvironments based on everything you found.'
    );
    // If nudge triggered more function calls instead of text, execute them ONLY if
    // we haven't already exhausted the iteration budget (prevents infinite loops)
    const nudgeCalls = response.response.candidates?.[0]?.content?.parts?.filter(p => p.functionCall) || [];
    if (nudgeCalls.length > 0 && iterations < maxIterations) {
      iterations++;
      const nudgeResponses = [];
      for (const part of nudgeCalls) {
        const result = await executeToolCall(part.functionCall.name, part.functionCall.args, context);
        nudgeResponses.push({ functionResponse: { name: part.functionCall.name, response: result } });
      }
      response = await chat.sendMessage(nudgeResponses);
    }
    finalText = response.response.text();
  }

  if (!finalText || !finalText.trim()) {
    console.log('[Slate Analyzer] First nudge returned empty — sending final nudge...');
    response = await chat.sendMessage(
      'Do NOT call any functions. Output a JSON object with your findings. Start your response with { immediately.'
    );
    finalText = response.response.text();
  }

  const analysis = parseSlateAnalysis(finalText);

  console.log(`[Slate Analyzer] Investigation complete after ${iterations} iterations`);

  return analysis;
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
Investigate this slate thoroughly using the tools available to you:
- What does the injury situation look like across all teams? Note duration tags for each absence.
- For teams missing key players, what does the current roster structure look like?
- What does each game's environment data reveal?

Document what you found — do NOT interpret it or label players as "beneficiaries."

Begin your investigation now. Call the tools you need.
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
  // NO FALLBACKS: Gary MUST produce valid slate analysis or we fail
  const jsonStr = extractJsonObject(text);
  if (!jsonStr) {
    throw new Error('[Slate Analyzer] Gary did not produce JSON analysis. Raw response: ' + text.slice(0, 500));
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error('[Slate Analyzer] Gary produced invalid JSON: ' + e.message + '. Raw: ' + jsonStr.slice(0, 500));
  }

  // Require at least some analysis - can't be completely empty
  const hasAnalysis = (parsed.injuryReport?.length > 0) ||
                      (parsed.gameProfiles?.length > 0) ||
                      (parsed.gameEnvironments?.length > 0);

  if (!hasAnalysis) {
    console.warn('[Slate Analyzer] Gary found no data - verify slate has games');
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
 * Returns empty array on failure (non-critical path).
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

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default {
  analyzeSlateWithFlash,
  fetchOwnershipFromFTA
};
