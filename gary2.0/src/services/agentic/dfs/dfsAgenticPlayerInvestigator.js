/**
 * DFS Player Investigator
 *
 * Phase 4 of the Agentic DFS system.
 * Gemini Flash investigates player candidates for each position
 * that Gary Pro needs to fill.
 *
 * For each position, Flash:
 * - Gets candidate players sorted by salary
 * - Investigates each candidate's situation (form, matchup, teammates)
 * - Summarizes findings for Gary Pro to evaluate
 *
 * FOLLOWS CLAUDE.md: Gary INVESTIGATES before deciding.
 */

import { DFS_PLAYER_INVESTIGATION_TOOLS, executeToolCall } from './tools/dfsToolDefinitions.js';

// ═══════════════════════════════════════════════════════════════════════════════
// PLAYER INVESTIGATION SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

const PLAYER_INVESTIGATION_PROMPT = `
You are Gary's DFS Research Assistant (Gemini Flash).
Your job is to investigate player candidates for a specific position.

## YOUR ROLE
- For each candidate, use function calls to gather situation data
- Assess recent form (L5 games)
- Assess matchup quality (DvP)
- Check for usage opportunities (teammate injuries)
- Summarize each player's upside path and concerns

## DO NOT make decisions - just investigate and report.
Gary Pro will decide which players to select based on your investigation.

## INVESTIGATION CHECKLIST FOR EACH PLAYER
1. Recent form - are they hot, cold, or stable?
2. Matchup - is the opponent good or bad for their position?
3. Usage situation - any teammates out that boost their role?
4. Price fairness - does salary match their current situation?
5. Ceiling path - how do they score 50+ fantasy points?
6. Concerns - what could go wrong?

## CRITICAL: OUTPUT MUST BE VALID JSON ARRAY

After investigating, output ONLY a JSON array (no markdown, no explanation text).
Your ENTIRE response must be a valid JSON array starting with [ and ending with ]

Example output format:
[
  {
    "player": "Player Name",
    "salary": 6500,
    "team": "LAL",
    "opponent": "SAC",
    "investigation": {
      "recentForm": "Hot - L5 avg 28 FPTS, trending up",
      "matchup": "Good - SAC ranks 25th in DvP vs PG",
      "usageSituation": "Normal role, no boost expected",
      "priceFairness": "Slight value - should be $7K based on form",
      "ceilingPath": "If game stays close, can hit 45+ with assist upside",
      "concerns": "Might rest if blowout"
    },
    "verdict": "STRONG CANDIDATE"
  }
]

DO NOT include any text before or after the JSON array.
DO NOT use markdown code blocks.
ONLY output the raw JSON array.
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
  const { modelName = 'gemini-3-flash-preview' } = options;
  const { players, positions, platform } = context;

  console.log('[Player Investigator] Starting player investigations...');

  const investigations = {};

  // Get position requirements for the platform
  const positionSlots = getPositionSlots(platform);

  for (const position of positionSlots) {
    console.log(`[Player Investigator] Investigating ${position} candidates...`);

    // Get candidates for this position
    const candidates = getPositionCandidates(players, position);

    if (candidates.length === 0) {
      console.warn(`[Player Investigator] No candidates found for ${position}`);
      investigations[position] = [];
      continue;
    }

    // Investigate candidates using Flash
    const positionInvestigation = await investigatePositionCandidates(
      genAI,
      position,
      candidates,
      buildThesis,
      context,
      { modelName }
    );

    investigations[position] = positionInvestigation;
    console.log(`[Player Investigator] ✓ ${position}: ${positionInvestigation.length} candidates investigated`);
  }

  return investigations;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INVESTIGATE POSITION CANDIDATES
// ═══════════════════════════════════════════════════════════════════════════════

async function investigatePositionCandidates(genAI, position, candidates, buildThesis, context, options) {
  const { modelName } = options;

  // Limit candidates to top 10 by projected points (to manage API calls)
  const topCandidates = candidates
    .sort((a, b) => (b.projected_pts || 0) - (a.projected_pts || 0))
    .slice(0, 10);

  // Build investigation request
  const investigationRequest = buildInvestigationRequest(position, topCandidates, buildThesis, context);

  // Create Flash model with function calling
  // Note: Can't use responseMimeType with function calling, so we enforce JSON in prompt
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: PLAYER_INVESTIGATION_PROMPT,
    tools: [{ functionDeclarations: DFS_PLAYER_INVESTIGATION_TOOLS }],
    generationConfig: {
      temperature: 1.0,
      maxOutputTokens: 8192
    }
  });

  // Run investigation loop
  let chat = model.startChat({ history: [] });
  let response = await chat.sendMessage(investigationRequest);
  let iterations = 0;
  const maxIterations = 8;

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
  const finalText = response.response.text();
  return parseInvestigationResults(finalText, topCandidates);
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUILD INVESTIGATION REQUEST
// ═══════════════════════════════════════════════════════════════════════════════

function buildInvestigationRequest(position, candidates, buildThesis, context) {
  return `
## BUILD THESIS
Archetype: ${buildThesis.archetype}
Target Games: ${buildThesis.targetGames?.join(', ') || 'Balanced'}
Thesis: ${buildThesis.thesis?.slice(0, 200) || 'No specific thesis'}

## POSITION TO INVESTIGATE: ${position}

## CANDIDATES (sorted by projected points)
${candidates.map((p, i) => {
  let line = `${i + 1}. ${p.name} - $${p.salary}`;
  line += `\n   Team: ${p.team} vs ${p.opponent || 'TBD'}`;
  line += `\n   Season: ${p.ppg?.toFixed(1) || '?'} PPG / ${p.rpg?.toFixed(1) || '?'} RPG / ${p.apg?.toFixed(1) || '?'} APG / ${p.mpg?.toFixed(1) || '?'} MPG`;
  // Advanced efficiency (from Tank01 roster enrichment)
  if (p.tsPercent || p.efgPercent) {
    line += `\n   Efficiency: TS% ${p.tsPercent?.toFixed(1) || '?'}, eFG% ${p.efgPercent?.toFixed(1) || '?'}`;
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
  return line;
}).join('\n\n')}

## YOUR TASK
Investigate EACH candidate:
1. Call GET_PLAYER_GAME_LOGS to check recent form
2. Call GET_MATCHUP_DATA if matchup info would help
3. Call GET_TEAMMATE_STATUS to check for usage opportunities

Focus especially on:
- Players in the TARGET GAMES (${buildThesis.targetGames?.join(', ') || 'all'})
- Players who fit the ${buildThesis.archetype} archetype
- Any PRICE LAG opportunities (salary < fair value)

After investigating, OUTPUT YOUR FINDINGS AS A JSON ARRAY.
IMPORTANT: Your final response MUST be ONLY a valid JSON array starting with [ and ending with ].
No markdown, no explanation text, no code blocks - ONLY the raw JSON array.

Begin your investigation now by calling the tools, then output the JSON array.
`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PARSE INVESTIGATION RESULTS
// ═══════════════════════════════════════════════════════════════════════════════

function parseInvestigationResults(text, candidates) {
  // NO FALLBACKS: Gary Flash MUST produce valid player investigations or we fail
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('[Player Investigator] Gary Flash did not produce JSON array of investigations. Raw response: ' + text.slice(0, 500));
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    throw new Error('[Player Investigator] Gary Flash produced invalid JSON: ' + e.message + '. Raw: ' + jsonMatch[0].slice(0, 500));
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('[Player Investigator] Gary Flash returned empty investigation array. Must analyze candidates.');
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
      verdict: p.verdict || 'NEEDS REVIEW',
      rawData: candidates.find(c => c.name?.toLowerCase() === p.player?.toLowerCase())
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// POSITION HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

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
