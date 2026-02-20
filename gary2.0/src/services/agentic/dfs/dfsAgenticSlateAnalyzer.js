/**
 * DFS Slate Analyzer
 *
 * Phase 2 of the Agentic DFS system.
 * Gemini Flash investigates the slate using function calls to BDL/RotoWire
 * to identify:
 * - Usage vacuums (injury-created opportunity)
 * - Price lag candidates (underpriced based on situation)
 * - Stack targets (best games to correlate)
 * - Game environments (pace, O/U, spreads)
 *
 * This gives Gary Pro the INVESTIGATED DATA he needs to form his thesis.
 */

import { DFS_SLATE_ANALYSIS_TOOLS, executeToolCall } from './tools/dfsToolDefinitions.js';

// ═══════════════════════════════════════════════════════════════════════════════
// SLATE ANALYSIS SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

const SLATE_ANALYSIS_PROMPT = `
<role>
You are Gary's DFS Research Assistant (Gemini Flash).
Your job is to INVESTIGATE the slate and surface opportunities for Gary Pro to evaluate.
</role>

<responsibilities>
- Use function calls to gather REAL DATA about players and games
- Identify USAGE VACUUMS (when star players are OUT, who absorbs their production?)
- Identify PRICE LAGS (players whose salary hasn't caught up to their new role)
- Identify STACK TARGETS (games with highest scoring potential)
</responsibilities>

<investigation_priorities>
1. Check injury status for ALL teams - look for fresh OUT designations
2. For each OUT player, identify who benefits (usage vacuum)
3. Check game environments - O/U, spreads, pace matchups
4. Flag any players whose price seems wrong given their situation
</investigation_priorities>

<output_format>
After investigation, summarize your findings in JSON:
{
  "usageVacuums": [
    {
      "outPlayer": "LeBron James",
      "outPlayerUsage": 32.5,
      "beneficiaries": ["Austin Reaves", "D'Angelo Russell"],
      "team": "LAL",
      "injuryFreshness": "announced 2 hours ago",
      "priceAdjusted": false
    }
  ],
  "priceLags": [
    {
      "player": "Austin Reaves",
      "salary": 5400,
      "situation": "Primary ball handler with LeBron OUT",
      "fairValue": 7200,
      "edge": 1800
    }
  ],
  "stackTargets": [
    {
      "game": "LAL vs SAC",
      "overUnder": 235,
      "pace": "high",
      "reason": "Both teams top 10 pace, no defensive stoppers"
    }
  ],
  "gameEnvironments": [
    {
      "game": "LAL vs SAC",
      "homeTeam": "SAC",
      "awayTeam": "LAL",
      "spread": -3.5,
      "overUnder": 235,
      "paceUp": true,
      "blowoutRisk": false
    }
  ]
}
</output_format>

<constraints>
- DO NOT make lineup decisions - just gather and organize the data
- DO NOT rank players or suggest who to roster
</constraints>
`;

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ANALYSIS FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Analyze the slate using Gemini Flash with function calling
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
      'Your investigation is complete. Now produce your JSON summary with usageVacuums, priceLags, stackTargets, and gameEnvironments based on everything you found.'
    );
    finalText = response.response.text();
  }

  if (!finalText || !finalText.trim()) {
    console.log('[Slate Analyzer] First nudge returned empty — sending final nudge...');
    response = await chat.sendMessage(
      'Output a JSON object with your findings. Start your response with { immediately.'
    );
    finalText = response.response.text();
  }

  const analysis = parseSlateAnalysis(finalText);

  console.log(`[Slate Analyzer] ✓ Investigation complete after ${iterations} iterations`);

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

  // Format games (include O/U, spread, implied totals, B2B, blowout risk, pace)
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
    if (g.blowout_risk) flags.push('BLOWOUT RISK');
    if (g.home_b2b) flags.push(`${home} B2B`);
    if (g.away_b2b) flags.push(`${away} B2B`);
    const flagStr = flags.length > 0 ? ` ⚠️ ${flags.join(', ')}` : '';
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
1. Call GET_TEAM_INJURIES for each team to find OUT/GTD players
   - IMPORTANT: Check the DURATION tag on each injury. LONG-TERM absences (11+ team games missed) are already priced into salaries — they are NOT usage opportunities.
   - Only RECENT absences (0-2 team games missed) create genuine edge — salaries may not have adjusted yet.
2. For RECENT absences only, call GET_USAGE_BOOST to find who benefits
3. Call GET_GAME_ENVIRONMENT for each game to assess pace/scoring
4. Identify any PRICE LAG situations where salary < fair value

Begin your investigation now. Call the tools you need.
`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PARSE ANALYSIS RESPONSE
// ═══════════════════════════════════════════════════════════════════════════════

function parseSlateAnalysis(text) {
  // NO FALLBACKS: Gary Flash MUST produce valid slate analysis or we fail
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('[Slate Analyzer] Gary Flash did not produce JSON analysis. Raw response: ' + text.slice(0, 500));
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    throw new Error('[Slate Analyzer] Gary Flash produced invalid JSON: ' + e.message + '. Raw: ' + jsonMatch[0].slice(0, 500));
  }

  // Require at least some analysis - can't be completely empty
  const hasAnalysis = (parsed.usageVacuums?.length > 0) ||
                      (parsed.priceLags?.length > 0) ||
                      (parsed.stackTargets?.length > 0) ||
                      (parsed.gameEnvironments?.length > 0);

  if (!hasAnalysis) {
    console.warn('[Slate Analyzer] Gary Flash found no opportunities - verify slate has games');
    // This is a warning, not an error - some slates genuinely have no clear opportunities
  }

  return {
    usageVacuums: parsed.usageVacuums || [],
    priceLags: parsed.priceLags || [],
    stackTargets: parsed.stackTargets || [],
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
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default {
  analyzeSlateWithFlash
};
