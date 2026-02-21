/**
 * DFS Player Investigator
 *
 * Phase 4 of the Agentic DFS system.
 * Gemini investigates player candidates for each position
 * that Gary needs to fill.
 *
 * For each position, Gemini:
 * - Gets candidate players sorted by salary
 * - Investigates each candidate's situation (form, matchup, teammates)
 * - Summarizes findings for Gary to evaluate
 *
 * FOLLOWS CLAUDE.md: Gary INVESTIGATES before deciding.
 */

import { DFS_PLAYER_INVESTIGATION_TOOLS, executeToolCall } from './tools/dfsToolDefinitions.js';

// ═══════════════════════════════════════════════════════════════════════════════
// PLAYER INVESTIGATION SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

const PLAYER_INVESTIGATION_PROMPT = `
<role>
You are Gary's DFS Research Assistant.
Your job is to investigate player candidates for a specific position.
</role>

<responsibilities>
- For each candidate, use function calls to gather situation data
- Investigate recent form (L5 games)
- Investigate matchup data (DvP)
- Check for usage opportunities (teammate injuries)
- Summarize your factual findings for each candidate
</responsibilities>

<investigation_checklist>
For each player:
1. Recent form — what does the L5 data show about production trends?
2. Matchup — what does the opponent defense data show for their position?
3. Team context — what does the injury report and current roster structure tell you?
4. Salary vs production — does the salary match their recent output?
5. Range of outcomes — what does the data suggest about this player's upside and downside?
6. Risk factors — what does the data suggest could limit this player's production tonight?
</investigation_checklist>

<output_format>
After investigating, output ONLY a JSON array (no markdown, no explanation text).
Your ENTIRE response must be a valid JSON array starting with [ and ending with ]

Example:
[
  {
    "player": "Player Name",
    "salary": 6500,
    "team": "LAL",
    "opponent": "SAC",
    "investigation": {
      "recentForm": "L5 avg 28 FPTS (season 24). Trend: 22, 25, 28, 32, 33",
      "matchup": "SAC ranks 25th in DvP vs PG",
      "teamContext": "LeBron OUT (RECENT, 1 game missed) — investigate usage data",
      "keyFindings": "L5 avg 28 FPTS at $6.5K salary. Season avg 24 FPTS.",
      "rangeOfOutcomes": "L5 range: 22-48 FPTS. Data shows...",
      "riskFactors": "Data to assess: blowout potential, minutes outlook"
    }
  }
]
</output_format>

<constraints>
- DO NOT make lineup decisions - just investigate and report. Gary will decide.
- DO NOT include any text before or after the JSON array.
- DO NOT use markdown code blocks.
- ONLY output the raw JSON array.
</constraints>
`;

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN INVESTIGATION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Investigate player candidates for all positions
 *
 * @param {GoogleGenerativeAI} genAI - Gemini client
 * @param {Object} buildThesis - Gary's build thesis from Phase 3
 * @param {Object} context - DFS context with players, games, etc.
 * @param {Object} options - Model options
 * @returns {Object} - Investigation results by position
 */
export async function investigatePlayersForPositions(genAI, buildThesis, context, options = {}) {
  const { modelName = 'gemini-3-pro-preview' } = options;
  const { players, platform } = context;

  console.log('[Player Investigator] Starting player investigations...');

  const investigations = {};

  // Get position requirements for the platform
  const positionSlots = getPositionSlots(platform);

  // Deduplicate positions — FanDuel has duplicate slots (PG, PG, SG, SG, etc.)
  // but we only need to investigate each position once
  const uniquePositions = [...new Set(positionSlots)];

  // Build investigation tasks, skipping positions with no candidates
  const tasks = [];
  for (const position of uniquePositions) {
    const candidates = getPositionCandidates(players, position);
    if (candidates.length === 0) {
      console.warn(`[Player Investigator] No candidates found for ${position}`);
      investigations[position] = [];
      continue;
    }
    tasks.push({ position, candidates });
  }

  // Run investigations in parallel batches of 3 to balance speed vs rate limits
  const BATCH_SIZE = 3;
  for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
    const batch = tasks.slice(i, i + BATCH_SIZE);
    console.log(`[Player Investigator] Investigating batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.map(t => t.position).join(', ')}`);

    const results = await Promise.all(
      batch.map(async ({ position, candidates }) => {
        const positionInvestigation = await investigatePositionCandidates(
          genAI,
          position,
          candidates,
          buildThesis,
          context,
          { modelName }
        );
        console.log(`[Player Investigator] ✓ ${position}: ${positionInvestigation.length} candidates investigated`);
        return { position, positionInvestigation };
      })
    );

    for (const { position, positionInvestigation } of results) {
      investigations[position] = positionInvestigation;
    }
  }

  return investigations;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SMART CANDIDATE SELECTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Select candidates for investigation using multiple signals.
 * The whole point of DFS is finding MISPRICED players — if projections
 * ranked them correctly, Gary adds no value. This ensures Gary sees
 * both the obvious ceiling plays AND the hidden value plays.
 *
 * Selection buckets (de-duplicated, max ~12 candidates):
 *  1. Top 5-6 by projection ceiling (established upside)
 *  2. Top 2-3 by value ratio (projection per $1000 salary)
 *  3. Players from teams with injuries (Gary investigates impact)
 *  4. Hot recent form + low salary (hidden gems)
 *  5. Players from thesis target games not yet included
 */
function selectSmartCandidates(candidates, buildThesis, position) {
  const MAX_CANDIDATES = 12;
  const selected = new Map(); // name -> player (dedup by name)

  const addCandidate = (player, reason) => {
    const key = player.name?.toLowerCase();
    if (key && !selected.has(key)) {
      selected.set(key, { ...player, _selectionReason: reason });
    }
  };

  // Bucket 1: Top 5-6 by DK FPTS projection ceiling (the metric that matters for DFS)
  const byProjection = [...candidates].sort((a, b) => {
    const aProj = a.benchmarkProjection || a.seasonStats?.dkFpts || a.l5Stats?.dkFptsAvg || a.seasonStats?.ppg || 0;
    const bProj = b.benchmarkProjection || b.seasonStats?.dkFpts || b.l5Stats?.dkFptsAvg || b.seasonStats?.ppg || 0;
    return bProj - aProj;
  });
  for (const p of byProjection.slice(0, 6)) {
    addCandidate(p, 'projection_ceiling');
  }

  // Bucket 2: Top 3 by value ratio (DK FPTS per $1000 salary)
  const withValue = candidates
    .filter(p => p.salary > 0)
    .map(p => {
      const proj = p.benchmarkProjection || p.seasonStats?.dkFpts || p.l5Stats?.dkFptsAvg || p.seasonStats?.ppg || 0;
      return { ...p, _valueRatio: proj / (p.salary / 1000) };
    })
    .sort((a, b) => b._valueRatio - a._valueRatio);
  for (const p of withValue.slice(0, 3)) {
    addCandidate(p, 'value_ratio');
  }

  // Bucket 3: Players from teams with recent injuries (Gary investigates the impact)
  if (buildThesis.injuryReport?.length > 0) {
    for (const report of buildThesis.injuryReport) {
      if (!report.team) continue;
      const hasInjury = report.outPlayers?.length > 0;
      if (!hasInjury) continue;
      const teamCandidates = candidates.filter(c => c.team === report.team);
      for (const tc of teamCandidates.slice(0, 2)) {
        addCandidate(tc, 'team_with_injury');
      }
    }
  }

  // Bucket 4: Hot recent form + low salary (hidden gems) — use DK FPTS for form detection
  const salaries = candidates.map(p => p.salary || 0).filter(s => s > 0);
  const medianSalary = salaries.length > 0
    ? salaries.sort((a, b) => a - b)[Math.floor(salaries.length / 2)]
    : 5000;

  for (const p of candidates) {
    if (selected.size >= MAX_CANDIDATES) break;
    const l5Fpts = p.l5Stats?.dkFptsAvg || 0;
    const seasonFpts = p.seasonStats?.dkFpts || 0;
    const isHot = seasonFpts > 0 && l5Fpts > seasonFpts * 1.15;
    const isLowSalary = (p.salary || 0) <= medianSalary;
    if (isHot && isLowSalary) {
      addCandidate(p, 'hot_form_low_salary');
    }
  }

  // Bucket 5: Players from thesis target games not yet included
  if (buildThesis.targetGames?.length > 0) {
    for (const p of candidates) {
      if (selected.size >= MAX_CANDIDATES) break;
      const inTargetGame = buildThesis.targetGames.some(g =>
        g.includes(p.team) || (p.opponent && g.includes(p.opponent))
      );
      if (inTargetGame) {
        addCandidate(p, 'thesis_target_game');
      }
    }
  }

  const result = Array.from(selected.values()).slice(0, MAX_CANDIDATES);

  // Log selection breakdown
  const reasons = {};
  for (const p of result) {
    const r = p._selectionReason || 'unknown';
    reasons[r] = (reasons[r] || 0) + 1;
  }
  console.log(`[Player Investigator] ${position}: Selected ${result.length} candidates — ${JSON.stringify(reasons)}`);

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INVESTIGATE POSITION CANDIDATES
// ═══════════════════════════════════════════════════════════════════════════════

async function investigatePositionCandidates(genAI, position, candidates, buildThesis, context, options) {
  const { modelName } = options;

  // Smart candidate selection: projection ceiling + value plays + thesis targets + hot form
  const topCandidates = selectSmartCandidates(candidates, buildThesis, position);

  // Build investigation request
  const investigationRequest = buildInvestigationRequest(position, topCandidates, buildThesis, context);

  // Create Pro model with function calling
  // Note: Can't use responseMimeType with function calling, so we enforce JSON in prompt
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: PLAYER_INVESTIGATION_PROMPT,
    tools: [{ functionDeclarations: DFS_PLAYER_INVESTIGATION_TOOLS }],
    generationConfig: {
      temperature: 1.0, // Gemini: Keep at 1.0
      maxOutputTokens: 8192
    },
    thinkingConfig: {
      thinkingBudget: 16384
    }
  });

  // Run investigation loop
  let chat = model.startChat({ history: [] });
  let response = await chat.sendMessage(investigationRequest);
  let iterations = 0;
  const maxIterations = 15;

  while (iterations < maxIterations) {
    iterations++;

    const candidate = response.response.candidates?.[0];
    if (!candidate) break;

    const content = candidate.content;
    const functionCalls = content?.parts?.filter(p => p.functionCall) || [];

    if (functionCalls.length === 0) {
      break; // Done investigating
    }

    // Execute function calls
    const functionResponses = [];
    for (const part of functionCalls) {
      const { name, args } = part.functionCall;
      const result = await executeToolCall(name, args, context);
      functionResponses.push({
        functionResponse: {
          name,
          response: result
        }
      });
    }

    response = await chat.sendMessage(functionResponses);
  }

  // Parse investigation results
  let finalText = response.response.text();

  // If Flash ended its loop without producing text (spent all iterations on tool
  // calls), nudge it to output the JSON array. Try twice — first nudge can also
  // return empty if Flash is confused about the conversation state.
  if (!finalText || !finalText.trim()) {
    console.log(`[Player Investigator] Flash ended without text for ${position} — nudging for JSON...`);
    response = await chat.sendMessage(
      'Your investigation is complete. Now output your findings as a JSON array. ONLY output the raw JSON array starting with [ and ending with ]. No markdown, no explanation.'
    );
    finalText = response.response.text();
  }

  if (!finalText || !finalText.trim()) {
    console.log(`[Player Investigator] First nudge returned empty for ${position} — sending final nudge...`);
    response = await chat.sendMessage(
      'Output a JSON array summarizing the players you investigated. Start your response with [ immediately.'
    );
    finalText = response.response.text();
  }

  return parseInvestigationResults(finalText, topCandidates);
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUILD INVESTIGATION REQUEST
// ═══════════════════════════════════════════════════════════════════════════════

function buildInvestigationRequest(position, candidates, buildThesis, context) {
  return `
## BUILD THESIS
Thesis observations (starting points for investigation, not confirmed findings):
${buildThesis.edges?.map(e => `${e.type}: ${e.description}`).join(' | ') || 'None identified'}
Target Games: ${buildThesis.targetGames?.join(', ') || 'Balanced'}
Thesis: ${buildThesis.thesis?.slice(0, 200) || 'No specific thesis'}

## POSITION TO INVESTIGATE: ${position}

## CANDIDATES (sorted by projected points)
${candidates.map((p, i) => {
  let line = `${i + 1}. ${p.name} - $${p.salary} [${(p.positions || [p.position]).join('/')}]`;
  line += `\n   Team: ${p.team} vs ${p.opponent || 'TBD'}`;
  line += `\n   Season: ${p.ppg?.toFixed(1) || '?'} PPG / ${p.rpg?.toFixed(1) || '?'} RPG / ${p.apg?.toFixed(1) || '?'} APG / ${p.mpg?.toFixed(1) || '?'} MPG`;
  // DFS Fantasy Points (the metric that actually matters)
  const dkFpts = p.seasonStats?.dkFpts || p.l5Stats?.dkFptsAvg || null;
  const fdFpts = p.seasonStats?.fdFpts || p.l5Stats?.fdFptsAvg || null;
  if (dkFpts || fdFpts) {
    line += `\n   DFS FPTS: ${dkFpts ? `DK ${dkFpts.toFixed(1)}` : ''}${dkFpts && fdFpts ? ' / ' : ''}${fdFpts ? `FD ${fdFpts.toFixed(1)}` : ''}`;
    if (p.salary > 0 && dkFpts) {
      line += ` | Value: ${(dkFpts / (p.salary / 1000)).toFixed(2)} FPTS/$1K`;
    }
  }
  // L5 FPTS trend (hot/cold)
  if (p.l5Stats?.dkFptsAvg && dkFpts) {
    const l5Dk = p.l5Stats.dkFptsAvg;
    const diff = ((l5Dk - dkFpts) / dkFpts * 100).toFixed(0);
    if (Math.abs(diff) >= 10) {
      line += `\n   L5 Trend: ${l5Dk.toFixed(1)} DK FPTS (${diff > 0 ? '+' : ''}${diff}% vs season)`;
    }
  }
  // Advanced efficiency (from Tank01 roster enrichment)
  if (p.tsPercent || p.efgPercent) {
    line += `\n   Efficiency: TS% ${p.tsPercent?.toFixed(1) || '?'}, eFG% ${p.efgPercent?.toFixed(1) || '?'}`;
  }
  // Team role / usage share (from BDL usage stats)
  if (p.usageStats) {
    const u = p.usageStats;
    const parts = [];
    if (u.pct_pts != null) parts.push(`${(u.pct_pts * 100).toFixed(1)}% PTS`);
    if (u.pct_fga != null) parts.push(`${(u.pct_fga * 100).toFixed(1)}% FGA`);
    if (u.usg_pct != null) parts.push(`USG: ${(u.usg_pct * 100).toFixed(1)}%`);
    if (parts.length > 0) {
      line += `\n   Team Role: ${parts.join(' | ')}`;
    }
  }
  // Matchup DvP context (from Tank01 team defense)
  if (p.matchupDvP) {
    line += `\n   Matchup DvP: Opponent allows ${p.matchupDvP.oppDvpPts?.toFixed(1) || '?'} PPG to ${p.matchupDvP.position}s`;
  }
  // Benchmark projection
  if (p.benchmarkProjection) {
    line += `\n   Benchmark: ${p.benchmarkProjection.toFixed(1)} FPTS (industry)`;
  }
  // Injury/status context
  if (p.injuryContext) {
    line += `\n   Injury Note: ${p.injuryContext}`;
  }
  if (p.status && p.status !== 'HEALTHY') {
    line += `\n   Status: ${p.status}`;
  }
  // News context
  if (p.newsContext && p.newsContext.length > 0) {
    line += `\n   News: ${p.newsContext[0]}`;
  }
  // B2B flag
  if (p.isB2B) {
    line += `\n   Back-to-back: played yesterday`;
  }
  // L5 fouls per game
  if (p.l5Stats?.fpg >= 4.0) {
    line += `\n   L5 Fouls/Game: ${p.l5Stats.fpg}`;
  }
  // Ownership signals (raw data for Gary to reason about)
  if (p.ownershipSignals) {
    const sig = p.ownershipSignals;
    let ownershipLine = `\n   Ownership Signals: Salary rank: ${sig.salaryRankAtPosition}`;
    if (sig.recentFormVsSeason != null) {
      ownershipLine += ` | L5/Season form: ${sig.recentFormVsSeason}x`;
    }
    if (sig.gamePopularity) {
      ownershipLine += ` | Game: ${sig.gamePopularity}`;
    }
    line += ownershipLine;
  }
  return line;
}).join('\n\n')}

## KNOWN TEAM INJURIES
${formatTeamInjuriesForInvestigation(candidates, context)}

## YOUR TASK
For EACH candidate, you MUST investigate:
1. Call GET_PLAYER_GAME_LOGS to investigate recent production (L5 trends)
2. Call GET_MATCHUP_DATA to evaluate the opponent matchup
3. Call GET_TEAM_USAGE_STATS once per team to see the current roster structure

Do NOT skip players. Each candidate deserves at least a game log check and matchup assessment.

Focus especially on:
- Players in the TARGET GAMES (${buildThesis.targetGames?.join(', ') || 'all'})
- Players whose situations align with the thesis observations
- Players whose recent production shows notable trends

IMPORTANT: Even if a candidate is NOT in a target game, flag them if they have an exceptional
situation (extreme salary discount vs recent production, hot streak + weak opponent).
The thesis informs your focus but does NOT constrain your findings.

INJURY CONTEXT: The KNOWN TEAM INJURIES section shows who is OUT and for how many team games.
Investigate the data and ask yourself: what does this team's roster look like right now?
What does each player's recent production tell you about their current role and salary?

After investigating, OUTPUT YOUR FINDINGS AS A JSON ARRAY.
IMPORTANT: Your final response MUST be ONLY a valid JSON array starting with [ and ending with ].
No markdown, no explanation text, no code blocks - ONLY the raw JSON array.

Begin your investigation now by calling the tools, then output the JSON array.
`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PARSE INVESTIGATION RESULTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract a JSON array from text using bracket-depth tracking.
 * Unlike regex /\[[\s\S]*\]/, this finds the MATCHING ] for the first [,
 * so trailing text with brackets doesn't corrupt the extraction.
 */
function extractJsonArray(text) {
  const start = text.indexOf('[');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === '[') depth++;
    if (ch === ']') {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  // Array was never closed — truncated response
  return null;
}

function parseInvestigationResults(text, candidates) {
  // Extract JSON array using bracket-depth tracking (not greedy regex)
  // This handles Flash adding explanation text after the JSON array
  let jsonStr = extractJsonArray(text);

  // If bracket tracking failed, try truncation recovery
  if (!jsonStr) {
    const arrayStart = text.indexOf('[');
    if (arrayStart !== -1) {
      let truncated = text.slice(arrayStart);
      const lastBrace = truncated.lastIndexOf('}');
      if (lastBrace > 0) {
        truncated = truncated.slice(0, lastBrace + 1) + ']';
        truncated = truncated.replace(/,\s*\]$/, ']');
        jsonStr = truncated;
        console.warn('[Player Investigator] Recovered truncated JSON array');
      }
    }
  }

  if (!jsonStr) {
    throw new Error('[Player Investigator] Gary did not produce JSON array of investigations. Raw response: ' + text.slice(0, 500));
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    // Try fixing common issues: trailing commas, control chars
    try {
      const fixed = jsonStr
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/[\x00-\x1F]/g, ' ');
      parsed = JSON.parse(fixed);
    } catch (e2) {
      throw new Error('[Player Investigator] Gary produced invalid JSON: ' + e2.message + '. Raw: ' + jsonStr.slice(0, 500));
    }
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('[Player Investigator] Gary returned empty investigation array. Must analyze candidates.');
  }

  return parsed.map(p => {
    if (!p.player) {
      throw new Error('[Player Investigator] Investigation missing player name: ' + JSON.stringify(p).slice(0, 200));
    }

    return {
      player: p.player,
      salary: p.salary,
      team: p.team,
      opponent: p.opponent,
      investigation: p.investigation || {},
      rawData: candidates.find(c => c.name?.toLowerCase() === p.player?.toLowerCase())
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// POSITION HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Format team injuries with duration tags for the investigation prompt.
 * Shows Gary which teams have OUT players and how long they've been out,
 * so he can investigate whether salaries have already adjusted.
 */
function formatTeamInjuriesForInvestigation(candidates, context) {
  if (!context.injuries || Object.keys(context.injuries).length === 0) {
    return 'No injury data available — use GET_TEAM_INJURIES to check.';
  }

  // Only show injuries for teams that have candidates in this position group
  const relevantTeams = new Set(candidates.map(c => (c.team || '').toUpperCase()));
  const lines = [];

  for (const [team, injuries] of Object.entries(context.injuries)) {
    if (!relevantTeams.has(team)) continue;
    const outPlayers = injuries.filter(i => {
      const st = (i.status || '').toUpperCase();
      return st.includes('OUT') || st === 'OFS' || st.includes('DOUBTFUL');
    });
    if (outPlayers.length === 0) continue;

    const formatted = outPlayers.map(i => {
      const name = i.player?.first_name ? `${i.player.first_name} ${i.player.last_name}` : i.player;
      const reason = i.injury || i.reason || '';
      if (i.duration) {
        return `${name} (${i.status}) [${i.duration} — ${i.gamesMissed} team games missed] ${reason}`;
      }
      return `${name} (${i.status}) ${reason}`;
    });
    lines.push(`${team}: ${formatted.join(', ')}`);
  }

  return lines.length > 0 ? lines.join('\n') : 'No OUT players on candidate teams.';
}

function getPositionSlots(platform) {
  // DraftKings NBA classic roster
  if (platform?.toLowerCase() === 'draftkings') {
    return ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F', 'UTIL'];
  }
  // FanDuel NBA
  if (platform?.toLowerCase() === 'fanduel') {
    return ['PG', 'PG', 'SG', 'SG', 'SF', 'SF', 'PF', 'PF', 'C'];
  }
  // Default to DK-style
  return ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F', 'UTIL'];
}

function getPositionCandidates(players, position) {
  if (!players || players.length === 0) return [];

  return players.filter(player => {
    const playerPositions = player.positions || [player.position];

    switch (position) {
      case 'PG':
        return playerPositions.includes('PG');
      case 'SG':
        return playerPositions.includes('SG');
      case 'SF':
        return playerPositions.includes('SF');
      case 'PF':
        return playerPositions.includes('PF');
      case 'C':
        return playerPositions.includes('C');
      case 'G':
        return playerPositions.includes('PG') || playerPositions.includes('SG');
      case 'F':
        return playerPositions.includes('SF') || playerPositions.includes('PF');
      case 'UTIL':
        return true; // Any player can fill UTIL
      default:
        return playerPositions.includes(position);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default {
  investigatePlayersForPositions
};
