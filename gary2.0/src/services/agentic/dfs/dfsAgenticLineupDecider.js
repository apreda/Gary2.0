/**
 * DFS Lineup Decider
 *
 * Phase 4 of the Agentic DFS system.
 * Gary Pro (Gemini Pro with HIGH thinking) makes the actual lineup decisions.
 *
 * This is WHERE GARY DECIDES. Not formulas. Not rules. Gary.
 *
 * Gary has:
 * - Slate analysis (injuries, game environments from Phase 2)
 * - Player investigations (form, matchup, usage data from Phase 3)
 * - Winning score targets (from FIBLE)
 * - Full salary awareness
 *
 * Gary decides based on his analysis, not optimization rules.
 *
 * FOLLOWS CLAUDE.md: "Don't Override Gary's Judgment"
 */

import { getDFSConstitution } from './constitution/dfsAgenticConstitution.js';
import { isSlotEligible } from './dfsPositionUtils.js';
import { getSalaryCap, getRosterSlots } from './dfsSportConfig.js';

// ═══════════════════════════════════════════════════════════════════════════════
// LINEUP DECISION SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

function getLineupDecisionPrompt(platform, sport) {
  const salaryCap = getSalaryCap(platform, sport);
  const rosterSlots = getRosterSlots(platform, sport);
  const platformName = (platform || 'draftkings').toLowerCase() === 'fanduel' ? 'FanDuel' : 'DraftKings';
  const sportName = (sport || 'NBA').toUpperCase();
  return `
<role>
You are Gary - an elite DFS player making your lineup decisions.
You've investigated the slate. Now BUILD THE LINEUP.
</role>

<training_data_warning>
TODAY'S DATE: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
Your training data is from 2024 and is 18+ months out of date. Players may have been traded, retired, or changed teams since then.
USE ONLY the investigation data provided below. If your memory conflicts with the data, USE THE DATA.
Do NOT treat roster changes, trades, or team assignments as "new," "surprising," or "gifts" — if a player is on a team in the data, that IS their current team. The salary was set knowing this.
</training_data_warning>

<fact_checking>
1. ONLY select players from the player pool provided below. If a player is not in the pool, they do NOT exist for this lineup.
2. Do NOT invent salaries, projections, or stats from memory — use ONLY the numbers provided in the investigation data.
3. Do NOT cite coaching tendencies, player reputations, or team identities from training knowledge — ONLY cite facts from the investigation data.
4. If a claim cannot be traced to the data provided below, do not make it.
</fact_checking>

<market_awareness>
If a player has been out for multiple games, the salaries and investigation data already reflect their absence. A continued known absence is baseline, not edge.
If a player was traded in the off-season, the salary already reflects their current team and role. A roster change that happened weeks or months ago is not new information.
ONLY fresh developments (ruled out in the last 1-2 days, surprise return) are new information the salary may not fully reflect.
</market_awareness>

<salary_cap_rules>
- ${platformName} ${sportName}: $${salaryCap.toLocaleString()} cap, ${rosterSlots.length} players (${rosterSlots.join(', ')})
- You MUST fill every roster slot
- You MUST stay under the salary cap
- Remaining salary ($1 over cap = invalid lineup)
</salary_cap_rules>

<objective>
You're not building to "cash" - you're building to WIN.
Your lineup targets the winning score for this slate size.

Investigate for each decision:
- Ask: Does your lineup have a realistic path to the winning score? What ceiling scenario gets you there?
- Ask: How are your players' outcomes connected? What does correlation do to your lineup's range of outcomes?
- Ask: How does your lineup's construction compare to what the field is likely building?
- Ask: What specific game conditions need to go right for this lineup to win?
</objective>

<decision_framework>
For EACH position, investigate:
1. What does each candidate's range of outcomes look like for THIS slate?
2. How does each candidate connect to the rest of your lineup?
3. What does the relationship between salary, situation, and upside tell you about each candidate?
</decision_framework>

<punt_awareness>
"Punts" ($4K-$5.5K) are a DFS reality — salary constraints mean you'll likely need 1-2.
Ask: For each low-salary player you consider, what does their recent production, role, and game environment tell you about their upside?
Ask: What does the data show about this low-salary player's upside path tonight?
</punt_awareness>

<ownership_awareness>
If ownership projections are available, investigate:
- Ask: What does the projected ownership tell you about how the field is constructing lineups?
- Ask: What does the relationship between each player's situation tonight and their projected ownership tell you?
- Ask: What does the ownership distribution across your lineup tell you about how it compares to the likely field?

Some candidates also include proxy signals: salary rank at position, L5/season form ratio, and game popularity rank.
These are raw data for YOUR assessment of likely field exposure.

This is awareness for your investigation, not a rule.
</ownership_awareness>

<output_format>
Provide your lineup as JSON:
{
  "players": [
    {
      "position": "PG",
      "name": "Player Name",
      "team": "LAL",
      "salary": 8500,
      "projectedPoints": 48.5,
      "ceilingProjection": 62,
      "reasoning": "Your specific reason for this player in THIS lineup"
    }
  ],
  "totalSalary": 49800,
  "projectedPoints": 295,
  "ceilingProjection": 365,
  "floorProjection": 240,
  "ceilingScenario": "How this lineup hits 380+ and wins",
  "garyNotes": "Write 2-3 sentences as Gary speaking directly to the user about why this lineup is built to win tonight. Be confident, conversational, and specific — mention key players by name and their role in the build. Example tone: 'I'm loading up on the DET-CLE game stack tonight. Cade is underpriced against a Cleveland defense missing Allen, and pairing him with Garland on the other side gives us double exposure to what should be a high-scoring affair.'"
}
</output_format>

<constraints>
- DO NOT just pick the highest projected player at each position
- DO NOT use low-salary players without investigating their upside thesis
- DO NOT exceed the salary cap
</constraints>
`;
}

// Shared constant for the rest of the prompt (objective through constraints)
// The dynamic part (salary_cap_rules) is injected by getLineupDecisionPrompt

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN DECISION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Gary Pro makes the lineup decision
 *
 * @param {GoogleGenerativeAI} genAI - Gemini client
 * @param {Object} slateAnalysis - Slate analysis from Phase 2 (injuries, game environments)
 * @param {Object} playerInvestigations - Investigation results from Phase 3
 * @param {Object} context - DFS context with players, games, salary cap
 * @param {Object} options - Model options
 * @returns {Object} - Gary's lineup decision
 */
export async function decideLineupWithPro(genAI, slateAnalysis, playerInvestigations, context, options = {}) {
  const { modelName = 'gemini-3-pro-preview', thinkingLevel = 'high' } = options;
  const { players, platform, contestType, winningTargets } = context;

  console.log('[Lineup Decider] Gary Pro deciding lineup with high thinking...');

  // Get salary cap and roster slots for platform + sport
  const salaryCap = getSalaryCap(platform, context.sport);
  const rosterSlots = getRosterSlots(platform, context.sport);

  // Build decision request
  const decisionRequest = buildDecisionRequest(
    slateAnalysis,
    playerInvestigations,
    context,
    salaryCap,
    rosterSlots
  );

  // Create Pro model with extended thinking for deep reasoning
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: getLineupDecisionPrompt(platform, context.sport) + '\n\n' + getDFSConstitution(context.sport, contestType),
    generationConfig: {
      temperature: 1.0, // Gemini: Keep at 1.0
      maxOutputTokens: 16384
    },
    // Extended thinking for lineup decisions
    thinkingConfig: {
      thinkingBudget: thinkingLevel === 'high' ? 16384 : 8192
    }
  });

  // Use chat session so corrections retain full context (player pool, investigation data)
  const chat = model.startChat({ history: [] });

  // Retry logic for intermittent empty responses from Gemini Pro
  const MAX_RETRIES = 3;
  let responseText = '';
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await chat.sendMessage(decisionRequest);
      responseText = result.response.text() || '';

      if (responseText) {
        break;
      }

      console.warn(`[Lineup Decider] Attempt ${attempt}/${MAX_RETRIES}: Gemini Pro returned empty response`);
      const candidate = result.response.candidates?.[0];
      if (candidate?.finishReason) {
        console.warn('[Lineup Decider] Finish reason:', candidate.finishReason);
      }

      if (attempt < MAX_RETRIES) {
        console.log(`[Lineup Decider] Retrying in 2 seconds...`);
        await new Promise(r => setTimeout(r, 2000));
      }
    } catch (apiError) {
      lastError = apiError;
      console.error(`[Lineup Decider] Attempt ${attempt}/${MAX_RETRIES} API error:`, apiError.message);
      if (attempt < MAX_RETRIES) {
        console.log(`[Lineup Decider] Retrying in 2 seconds...`);
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  if (!responseText) {
    const errMsg = lastError ? lastError.message : 'Empty response after all retries';
    throw new Error('[Lineup Decider] Gemini Pro failed after ' + MAX_RETRIES + ' attempts: ' + errMsg);
  }

  // Parse Gary's lineup decision — with self-correction loop for structural issues
  // Corrections use the SAME chat session so Gemini retains the full player pool context
  let lineup;
  let correctionAttempts = 0;
  const MAX_CORRECTIONS = 2;

  while (correctionAttempts <= MAX_CORRECTIONS) {
    try {
      lineup = parseLineupDecision(responseText, players, salaryCap, rosterSlots, context.sport);

      // Check for structural issues that need correction
      const issues = getStructuralIssues(lineup, players, salaryCap, rosterSlots, context.sport);
      if (issues.length === 0) break; // Clean lineup, we're done

      if (correctionAttempts >= MAX_CORRECTIONS) {
        const hallucinated = issues.filter(i => i.startsWith('Players not on slate'));
        if (hallucinated.length > 0) {
          throw new Error(`[Lineup Decider] FAILED: Gemini Pro keeps hallucinating players not on the slate after ${MAX_CORRECTIONS} corrections. ${hallucinated.join('; ')}`);
        }
        console.warn(`[Lineup Decider] Structural issues remain after ${MAX_CORRECTIONS} corrections:`, issues);
        lineup.validationIssues = issues;
        break;
      }

      // Send correction via the SAME chat session (retains player pool context)
      correctionAttempts++;
      console.log(`[Lineup Decider] Correction attempt ${correctionAttempts}/${MAX_CORRECTIONS}: ${issues.join('; ')}`);

      const correctionPrompt = `Your lineup has these issues that MUST be fixed:
${issues.map((iss, i) => `${i + 1}. ${iss}`).join('\n')}

RULES:
- You MUST select exactly ${rosterSlots.length} players for slots: ${rosterSlots.join(', ')}
- All players MUST be from the slate player pool provided above — do NOT invent players
- You MUST use players from at least 2 different teams
- Stay under $${salaryCap.toLocaleString()} salary cap

Fix the lineup and output the corrected JSON.`;

      const correctionResult = await chat.sendMessage(correctionPrompt);
      responseText = correctionResult.response.text() || '';

      if (!responseText) {
        console.warn('[Lineup Decider] Correction returned empty — using previous lineup');
        break;
      }
    } catch (parseError) {
      if (correctionAttempts >= MAX_CORRECTIONS) {
        throw parseError;
      }
      correctionAttempts++;
      console.log(`[Lineup Decider] Parse error, correction attempt ${correctionAttempts}: ${parseError.message}`);

      const fixPrompt = `Your lineup response had an error: ${parseError.message}

Build a complete ${rosterSlots.length}-player lineup using ONLY players from the slate provided above.
Stay under $${salaryCap.toLocaleString()}. Output ONLY the JSON object.`;

      const fixResult = await chat.sendMessage(fixPrompt);
      responseText = fixResult.response.text() || '';

      if (!responseText) {
        throw parseError;
      }
    }
  }

  // Final validation (non-fatal — just log warnings)
  const validation = validateLineup(lineup, salaryCap, rosterSlots, context.sport);
  if (!validation.valid) {
    console.warn('[Lineup Decider] Lineup validation issues:', validation.issues);
    lineup.validationIssues = validation.issues;
  }

  console.log(`[Lineup Decider] ✓ Lineup decided: ${lineup.players?.length} players, $${lineup.totalSalary}`);

  return lineup;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUILD DECISION REQUEST
// ═══════════════════════════════════════════════════════════════════════════════

function buildDecisionRequest(slateAnalysis, playerInvestigations, context, salaryCap, rosterSlots) {
  const { winningTargets, players } = context;

  // Format player investigations by position
  const investigationsStr = formatInvestigationsByPosition(playerInvestigations, context.platform);

  // Format game-level view (reorganize investigations by game matchup for stacking awareness)
  const gameLevelView = formatInvestigationsByGame(playerInvestigations, slateAnalysis);

  // Format injury context from slate analysis
  const injuryLines = (slateAnalysis.injuryReport || []).map(report => {
    const outNames = (report.outPlayers || []).map(p => `${p.player} (${p.duration || '?'}, ${p.gamesMissed ?? '?'} games missed)`).join(', ');
    return outNames ? `${report.team}: ${outNames}` : null;
  }).filter(Boolean).join('\n');

  // Format game environments from slate analysis + team defense data from context
  const gameDefenseMap = new Map();
  for (const game of (context.games || [])) {
    const key = `${game.visitor_team}@${game.home_team}`;
    gameDefenseMap.set(key, game);
  }

  const gameLines = (slateAnalysis.gameEnvironments || []).map(g => {
    let line = `${g.awayTeam} @ ${g.homeTeam}: O/U ${g.overUnder || '?'} | Spread ${g.spread || '?'}`;
    // Surface team defense data if available from context
    const gameData = gameDefenseMap.get(`${g.awayTeam}@${g.homeTeam}`);
    if (gameData) {
      const hd = gameData.home_defense;
      const ad = gameData.away_defense;
      if (hd) line += `\n  ${g.homeTeam} DEF: ${hd.opp_pts?.toFixed(1) || '?'} PPG allowed, ${hd.opp_efg_pct ? hd.opp_efg_pct.toFixed(1) + '% eFG allowed' : ''}, Pace ${hd.pace?.toFixed(1) || '?'}`;
      if (ad) line += `\n  ${g.awayTeam} DEF: ${ad.opp_pts?.toFixed(1) || '?'} PPG allowed, ${ad.opp_efg_pct ? ad.opp_efg_pct.toFixed(1) + '% eFG allowed' : ''}, Pace ${ad.pace?.toFixed(1) || '?'}`;
    }
    return line;
  }).join('\n');

  // Position scarcity: count investigated candidates per position
  const positionDepth = Object.entries(playerInvestigations)
    .map(([pos, candidates]) => `${pos}: ${candidates?.length || 0} candidates`)
    .join(' | ');

  // Ownership awareness
  const ownershipNote = slateAnalysis.ownershipMissing
    ? '\nNote: Projected ownership data is UNAVAILABLE for this slate. Investigate: What does the salary and situation landscape tell you about where the field is likely concentrating?\n'
    : '';

  // Slate size awareness
  const slateNote = context.slateSize
    ? `\nSlate Size: ${context.slateSize} games (${context.slateLabel}). Ask: What does the slate size tell you about how concentrated your construction should be?\n`
    : '';

  // Cash game framing
  const isCash = winningTargets.isCash;
  const objectiveStr = isCash
    ? `You're building to CASH (beat ~50% of the field). Target: ${winningTargets.toCash}+ pts with stable floor.`
    : `You're building to WIN, not just cash. Target: ${winningTargets.toWin}+ pts`;

  return `
## SLATE FINDINGS
Injury Report:
${injuryLines || 'No injury data'}

Game Environments:
${gameLines || 'No game environment data'}
${slateNote}${ownershipNote}
## WINNING TARGETS
- To WIN: ${winningTargets.toWin} pts
- Top 1%: ${winningTargets.top1Percent} pts
- Cash Line: ${winningTargets.toCash} pts

${objectiveStr}

## SALARY CAP
Cap: $${salaryCap.toLocaleString()}
Roster: ${rosterSlots.join(', ')}

## POSITION DEPTH
${positionDepth}

## GAME-LEVEL VIEW (Stacking & Bring-back Opportunities)
${gameLevelView}

## PLAYER INVESTIGATIONS BY POSITION
${investigationsStr}

## YOUR TASK
Build your lineup. Consider:
1. Which game(s) do you want to concentrate roster spots in? What does the game-level view tell you about stacking opportunities?
2. For each stack, investigate both sides of the game — what does a bring-back from the opposing team do to your exposure?
3. For each position, review the investigated candidates and make your decision with conviction
4. Ask: How much salary are you leaving on the table? If more than $500, investigate whether upgrading any position improves your ceiling.

- Your per-player reasoning should cite specific data from your investigation.
- Stay under $${salaryCap.toLocaleString()} total.

Output your lineup as JSON.
`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORMAT HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function formatInvestigationsByGame(investigations, slateAnalysis) {
  // Reorganize investigated players by game matchup for stacking awareness
  const playersByTeam = {};
  for (const [position, players] of Object.entries(investigations)) {
    for (const p of (players || [])) {
      const team = p.team || 'UNK';
      if (!playersByTeam[team]) playersByTeam[team] = [];
      playersByTeam[team].push({ ...p, investigatedPosition: position });
    }
  }

  // Match teams to game environments
  const games = slateAnalysis.gameEnvironments || [];
  const lines = [];

  for (const g of games) {
    const home = g.homeTeam || '';
    const away = g.awayTeam || '';
    const homePlayers = playersByTeam[home] || [];
    const awayPlayers = playersByTeam[away] || [];
    if (homePlayers.length === 0 && awayPlayers.length === 0) continue;

    lines.push(`\n### ${away} @ ${home} — O/U ${g.overUnder || '?'} | Spread ${g.spread || '?'}`);
    if (awayPlayers.length > 0) {
      lines.push(`  ${away}: ${awayPlayers.map(p => `${p.player} [${p.investigatedPosition}] $${p.salary || '?'}`).join(', ')}`);
    }
    if (homePlayers.length > 0) {
      lines.push(`  ${home}: ${homePlayers.map(p => `${p.player} [${p.investigatedPosition}] $${p.salary || '?'}`).join(', ')}`);
    }
    const totalInGame = homePlayers.length + awayPlayers.length;
    if (totalInGame >= 3) {
      lines.push(`  → ${totalInGame} investigated players in this game — potential stacking opportunity`);
    }
  }

  // Players from teams not matched to a game environment
  const matchedTeams = new Set(games.flatMap(g => [g.homeTeam, g.awayTeam].filter(Boolean)));
  const unmatchedTeams = Object.keys(playersByTeam).filter(t => !matchedTeams.has(t));
  for (const team of unmatchedTeams) {
    const tp = playersByTeam[team];
    if (tp.length > 0) {
      lines.push(`\n### ${team} (game env not matched): ${tp.map(p => `${p.player} [${p.investigatedPosition}]`).join(', ')}`);
    }
  }

  return lines.length > 0 ? lines.join('\n') : 'No game-level data available';
}

function formatInvestigationsByPosition(investigations, platform) {
  const lines = [];

  for (const [position, players] of Object.entries(investigations)) {
    lines.push(`\n### ${position}`);

    if (!players || players.length === 0) {
      lines.push('No candidates investigated');
      continue;
    }

    for (const p of players) { // All investigated candidates — don't drop data
      const recentForm = p.investigation?.recentForm || null;
      const matchup = p.investigation?.matchup || null;
      const keyFindings = p.investigation?.keyFindings || null;
      const rangeOfOutcomes = p.investigation?.rangeOfOutcomes || null;
      const riskFactors = p.investigation?.riskFactors || null;
      const salary = p.salary ? `$${p.salary}` : '$?';
      const isFD = platform?.toLowerCase() === 'fanduel';
      const fpts = isFD
        ? (p.rawData?.seasonStats?.fdFpts || p.rawData?.l5Stats?.fdFptsAvg)
        : (p.rawData?.seasonStats?.dkFpts || p.rawData?.l5Stats?.dkFptsAvg);
      const fptsStr = fpts ? ` | ${isFD ? 'FD' : 'DK'} FPTS: ${fpts.toFixed(1)}` : '';

      lines.push(`
${p.player} - ${salary} (${p.team} vs ${p.opponent || 'TBD'})${fptsStr}
  ${recentForm ? `Form: ${recentForm}` : 'Form: Not assessed'}
  ${matchup ? `Matchup: ${matchup}` : 'Matchup: Not assessed'}
  ${keyFindings ? `Key Findings: ${keyFindings}` : ''}
  ${rangeOfOutcomes ? `Range of Outcomes: ${rangeOfOutcomes}` : ''}
  ${riskFactors ? `Risk Factors: ${riskFactors}` : 'Risk Factors: Not assessed'}`);
    }
  }

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// JSON EXTRACTION (bracket-depth tracking — safe for mixed text + JSON)
// ═══════════════════════════════════════════════════════════════════════════════

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
  return null; // Truncated — opening { never closed
}

// ═══════════════════════════════════════════════════════════════════════════════
// PARSE LINEUP DECISION
// ═══════════════════════════════════════════════════════════════════════════════

function parseLineupDecision(text, players, salaryCap, rosterSlots, sport) {
  // NO FALLBACKS: Gary MUST produce a valid lineup or we fail
  const jsonStr = extractJsonObject(text);
  if (!jsonStr) {
    throw new Error('[Lineup Decider] Gary Pro did not produce JSON lineup. Raw response: ' + text.slice(0, 500));
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    // Attempt truncated JSON recovery — find the last complete player object
    console.warn(`[Lineup Decider] JSON parse failed: ${e.message} — attempting truncation recovery`);
    const playersIdx = jsonStr.indexOf('"players"');
    const arrayStart = playersIdx >= 0 ? jsonStr.indexOf('[', playersIdx) : -1;
    if (arrayStart > 0) {
      // Find the last complete player object within the players array
      let lastComplete = -1;
      let depth = 0;
      let inStr = false;
      let esc = false;
      for (let i = arrayStart; i < jsonStr.length; i++) {
        const ch = jsonStr[i];
        if (esc) { esc = false; continue; }
        if (ch === '\\' && inStr) { esc = true; continue; }
        if (ch === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (ch === '{') depth++;
        if (ch === '}') {
          depth--;
          if (depth === 0) lastComplete = i; // Track last complete object at depth 0 inside array
        }
      }
      if (lastComplete > arrayStart) {
        const truncated = jsonStr.slice(0, arrayStart) + jsonStr.slice(arrayStart, lastComplete + 1) + ']}';
        try {
          parsed = JSON.parse(truncated);
          console.warn(`[Lineup Decider] ✓ Recovered truncated JSON — got ${parsed.players?.length || 0} players`);
        } catch (e2) {
          throw new Error('[Lineup Decider] Gary Pro produced invalid JSON: ' + e.message + '. Raw: ' + jsonStr.slice(0, 500));
        }
      } else {
        throw new Error('[Lineup Decider] Gary Pro produced invalid JSON: ' + e.message + '. Raw: ' + jsonStr.slice(0, 500));
      }
    } else {
      throw new Error('[Lineup Decider] Gary Pro produced invalid JSON: ' + e.message + '. Raw: ' + jsonStr.slice(0, 500));
    }
  }

  if (!parsed.players || parsed.players.length === 0) {
    throw new Error('[Lineup Decider] Gary Pro did not select any players. Response: ' + JSON.stringify(parsed).slice(0, 500));
  }

  // Enrich with full player data — REJECT any player not found in the slate pool
  const enrichedPlayers = [];
  const rejectedPlayers = [];

  for (const p of parsed.players) {
    // Guard: skip entries without a name
    if (!p.name) {
      rejectedPlayers.push('(unnamed player)');
      continue;
    }

    const pNameLower = p.name.toLowerCase();

    // Find player by exact name match first
    let fullPlayer = players.find(fp =>
      fp.name?.toLowerCase() === pNameLower
    );

    // Fallback to fuzzy match — require unambiguous (exactly 1 match)
    if (!fullPlayer) {
      const fuzzyMatches = players.filter(fp => {
        const fpLower = fp.name?.toLowerCase() || '';
        return fpLower.includes(pNameLower) || pNameLower.includes(fpLower);
      });
      if (fuzzyMatches.length === 1) {
        fullPlayer = fuzzyMatches[0];
      } else if (fuzzyMatches.length > 1 && p.team) {
        // Disambiguate by team if multiple fuzzy matches
        const teamMatch = fuzzyMatches.find(fp => fp.team === p.team);
        if (teamMatch) fullPlayer = teamMatch;
      }
    }

    if (!fullPlayer) {
      // Player NOT on slate — REJECT completely. Do not use Gemini's hallucinated data.
      console.warn(`[Lineup Decider] REJECTED "${p.name}" — not found in slate player pool`);
      rejectedPlayers.push(p.name);
      continue;
    }

    if (fullPlayer.team !== p.team) {
      console.log(`[Lineup Decider] ✓ Fixed team for ${p.name}: ${p.team} → ${fullPlayer.team}`);
    }
    // Validate Gemini's slot assignment against real DK/FD position eligibility
    const realPositions = fullPlayer.positions || [fullPlayer.position];
    const assignedSlot = (p.position || '').toUpperCase();
    const isEligible = isSlotEligible(assignedSlot, realPositions, sport);
    if (!isEligible) {
      console.warn(`[Lineup Decider] ⚠️ ${p.name} assigned to ${assignedSlot} but eligible for ${realPositions.join('/')} — fixing to ${realPositions[0]}`);
    }

    // Use ONLY real slate data — never Gemini's hallucinated values
    // Projection fallback: benchmarkProjection (Tank01) > seasonStats FPTS (BDL) > Gemini's number
    const realProjection = fullPlayer.benchmarkProjection
      || fullPlayer.seasonStats?.dkFpts
      || fullPlayer.l5Stats?.dkFptsAvg
      || p.projectedPoints;
    enrichedPlayers.push({
      ...p,
      id: fullPlayer.id,
      team: fullPlayer.team,
      position: isEligible ? assignedSlot : realPositions[0],
      positions: realPositions,
      projectedPoints: realProjection,
      benchmarkProjection: fullPlayer.benchmarkProjection || null,
      salary: fullPlayer.salary
    });
  }

  if (rejectedPlayers.length > 0) {
    console.warn(`[Lineup Decider] Rejected ${rejectedPlayers.length} hallucinated players: ${rejectedPlayers.join(', ')}`);
  }

  // Calculate totals (player count validation moved to getStructuralIssues for self-correction)
  const totalSalary = enrichedPlayers.reduce((sum, p) => sum + (p.salary || 0), 0);
  const projectedPoints = enrichedPlayers.reduce((sum, p) => sum + (p.projectedPoints || p.projected_pts || 0), 0);

  // Validate salary cap
  if (totalSalary > salaryCap) {
    throw new Error(`[Lineup Decider] Gary Pro lineup is over salary cap: $${totalSalary} > $${salaryCap}. Fix the lineup.`);
  }

  return {
    players: enrichedPlayers,
    totalSalary,  // Always use computed salary (Gary's self-report may be wrong)
    projectedPoints: parsed.projectedPoints || projectedPoints,
    ceilingProjection: parsed.ceilingProjection || projectedPoints * 1.25,
    floorProjection: parsed.floorProjection || projectedPoints * 0.75,
    ceilingScenario: parsed.ceilingScenario || '',
    garyNotes: parsed.garyNotes || '',
    rawResponse: text
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// POSITION ELIGIBILITY CHECK
// ═══════════════════════════════════════════════════════════════════════════════

// isSlotEligible imported from dfsPositionUtils.js

// ═══════════════════════════════════════════════════════════════════════════════
// STRUCTURAL ISSUE DETECTION (triggers self-correction loop)
// ═══════════════════════════════════════════════════════════════════════════════

function getStructuralIssues(lineup, players, salaryCap, rosterSlots, sport) {
  const issues = [];

  // Wrong player count
  if (lineup.players?.length !== rosterSlots.length) {
    issues.push(`Need exactly ${rosterSlots.length} players but got ${lineup.players?.length || 0}`);
  }

  // Over salary cap
  if (lineup.totalSalary > salaryCap) {
    issues.push(`Over salary cap: $${lineup.totalSalary} > $${salaryCap}`);
  }

  // All players from same team (invalid for GPP — no correlation benefit)
  const teams = new Set((lineup.players || []).map(p => p.team));
  if (teams.size === 1 && (lineup.players?.length || 0) > 2) {
    issues.push(`All ${lineup.players.length} players are from ${[...teams][0]} — must use players from at least 2 teams`);
  }

  // Players not found on the slate (hallucinated)
  const notOnSlate = (lineup.players || []).filter(p => {
    return !players.find(sp =>
      sp.name?.toLowerCase() === p.name?.toLowerCase() ||
      sp.name?.toLowerCase().includes(p.name?.toLowerCase()) ||
      p.name?.toLowerCase().includes(sp.name?.toLowerCase())
    );
  });
  if (notOnSlate.length > 0) {
    issues.push(`Players not on slate: ${notOnSlate.map(p => p.name).join(', ')} — only use players from the player pool`);
  }

  // Duplicate players
  const names = (lineup.players || []).map(p => p.name?.toLowerCase());
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  if (dupes.length > 0) {
    issues.push(`Duplicate players: ${[...new Set(dupes)].join(', ')}`);
  }

  // Slot distribution validation — check that each roster slot is filled exactly once
  if (lineup.players?.length === rosterSlots.length) {
    const requiredSlotCounts = {};
    for (const slot of rosterSlots) {
      requiredSlotCounts[slot] = (requiredSlotCounts[slot] || 0) + 1;
    }
    const assignedSlotCounts = {};
    for (const p of lineup.players) {
      const slot = (p.position || '').toUpperCase();
      assignedSlotCounts[slot] = (assignedSlotCounts[slot] || 0) + 1;
    }
    for (const [slot, required] of Object.entries(requiredSlotCounts)) {
      const assigned = assignedSlotCounts[slot] || 0;
      if (assigned !== required) {
        issues.push(`Slot ${slot}: need ${required} but got ${assigned}`);
      }
    }
  }

  return issues;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATE LINEUP
// ═══════════════════════════════════════════════════════════════════════════════

function validateLineup(lineup, salaryCap, rosterSlots, sport) {
  const issues = [];

  // Check player count
  if (lineup.players?.length !== rosterSlots.length) {
    issues.push(`Wrong player count: ${lineup.players?.length} vs ${rosterSlots.length} required`);
  }

  // Check salary cap
  if (lineup.totalSalary > salaryCap) {
    issues.push(`Over salary cap: $${lineup.totalSalary} > $${salaryCap}`);
  }

  // Check for duplicate players
  const playerNames = lineup.players?.map(p => p.name) || [];
  const uniqueNames = new Set(playerNames);
  if (uniqueNames.size !== playerNames.length) {
    issues.push('Duplicate players in lineup');
  }

  // Check position eligibility
  for (const player of lineup.players || []) {
    const positions = player.positions || [player.position];
    if (!isSlotEligible(player.position, positions, sport)) {
      issues.push(`${player.name} assigned to ${player.position} but eligible for ${positions.join('/')}`);
    }
  }

  // Check slot distribution matches roster template
  const requiredSlotCounts = {};
  for (const slot of rosterSlots) {
    requiredSlotCounts[slot] = (requiredSlotCounts[slot] || 0) + 1;
  }
  const assignedSlotCounts = {};
  for (const p of lineup.players || []) {
    const slot = (p.position || '').toUpperCase();
    assignedSlotCounts[slot] = (assignedSlotCounts[slot] || 0) + 1;
  }
  for (const [slot, required] of Object.entries(requiredSlotCounts)) {
    const assigned = assignedSlotCounts[slot] || 0;
    if (assigned !== required) {
      issues.push(`Slot distribution: ${slot} needs ${required} but has ${assigned}`);
    }
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

// Platform helpers (getSalaryCap, getRosterSlots) imported from dfsSportConfig.js

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default {
  decideLineupWithPro
};
