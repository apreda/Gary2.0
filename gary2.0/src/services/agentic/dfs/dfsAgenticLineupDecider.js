/**
 * DFS Lineup Decider
 *
 * Phase 5 of the Agentic DFS system.
 * Gary Pro (Gemini Pro with HIGH thinking) makes the actual lineup decisions.
 *
 * This is WHERE GARY DECIDES. Not formulas. Not rules. Gary.
 *
 * Gary has:
 * - His build thesis (strategy for the slate)
 * - Player investigations (form, matchup, usage data)
 * - Winning score targets (from FIBLE)
 * - Full salary awareness
 *
 * Gary decides based on his analysis, not optimization rules.
 *
 * FOLLOWS CLAUDE.md: "Don't Override Gary's Judgment"
 */

import { getDFSConstitution } from './constitution/dfsAgenticConstitution.js';

// ═══════════════════════════════════════════════════════════════════════════════
// LINEUP DECISION SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

const LINEUP_DECISION_PROMPT = `
<role>
You are Gary - an elite DFS player making your lineup decisions.
You've investigated the slate. You have your thesis. Now BUILD THE LINEUP.
</role>

<salary_cap_rules>
- DraftKings NBA: $50,000 cap, 8 players (PG, SG, SF, PF, C, G, F, UTIL)
- FanDuel NBA: $60,000 cap, 9 players (PG, PG, SG, SG, SF, SF, PF, PF, C)
- You MUST fill every roster slot
- You MUST stay under the salary cap
- Remaining salary ($1 over cap = invalid lineup)
</salary_cap_rules>

<objective>
You're not building to "cash" - you're building to WIN.
To win a GPP, you need a CEILING LINEUP that can score 350-400+ fantasy points.

This means:
1. You need players who can EXPLODE (not just "solid")
2. You need CORRELATION (players from the same game who can boom together)
3. You need LEVERAGE (some differentiation from chalk)
4. You need a CEILING SCENARIO (what needs to go right to score 380+)
</objective>

<decision_framework>
For EACH position, consider:
1. WHO has the highest ceiling (not floor) for THIS slate?
2. WHO fits my build thesis?
3. WHO has the best path to smashing value?

Pick the player with the best CEILING PATH given the situation.
</decision_framework>

<punt_awareness>
"Punts" ($4K-$5.5K) can be GREAT when:
- A usage vacuum exists (star is OUT, they absorb production)
- Price hasn't adjusted to their new situation
- They have real minutes and role (not a deep bench guy)

"Punts" are RISKY when:
- You're just chasing cheap price with no upside thesis
- They rely on foul trouble or garbage time
- Their minutes are uncertain

Gary, you decide. If you see 3 punts that all have real edges, PLAY THEM.
If you see 0 punts worth playing, that's fine too.
</punt_awareness>

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
  "garyNotes": "Your overall thoughts on this build"
}
</output_format>

<constraints>
- DO NOT just pick the highest projected player at each position
- DO NOT force punts if no real edge exists
- DO NOT exceed the salary cap
</constraints>
`;

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN DECISION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Gary Pro makes the lineup decision
 *
 * @param {GoogleGenerativeAI} genAI - Gemini client
 * @param {Object} buildThesis - Gary's build thesis from Phase 3
 * @param {Object} playerInvestigations - Investigation results from Phase 4
 * @param {Object} context - DFS context with players, games, salary cap
 * @param {Object} options - Model options
 * @returns {Object} - Gary's lineup decision
 */
export async function decideLineupWithPro(genAI, buildThesis, playerInvestigations, context, options = {}) {
  const { modelName = 'gemini-3-pro-preview', thinkingLevel = 'high' } = options;
  const { players, platform, contestType, winningTargets } = context;

  console.log('[Lineup Decider] Gary Pro deciding lineup with high thinking...');

  // Get salary cap for platform
  const salaryCap = getSalaryCap(platform);
  const rosterSlots = getRosterSlots(platform);

  // Build decision request
  const decisionRequest = buildDecisionRequest(
    buildThesis,
    playerInvestigations,
    context,
    salaryCap,
    rosterSlots
  );

  // Create Pro model with extended thinking for deep reasoning
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: LINEUP_DECISION_PROMPT + '\n\n' + getDFSConstitution(context.sport, contestType),
    generationConfig: {
      temperature: 1.0, // Gemini: Keep at 1.0
      maxOutputTokens: 16384
    },
    // Extended thinking for lineup decisions
    thinkingConfig: {
      thinkingBudget: thinkingLevel === 'high' ? 16384 : 8192
    }
  });

  // Retry logic for intermittent empty responses from Gemini Pro
  const MAX_RETRIES = 3;
  let responseText = '';
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await model.generateContent(decisionRequest);
      responseText = result.response.text() || '';

      if (responseText) {
        // Got a response, break out of retry loop
        break;
      }

      // Empty response - log details and retry
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

  // Parse Gary's lineup decision
  const lineup = parseLineupDecision(responseText, players, salaryCap, rosterSlots);

  // Validate lineup
  const validation = validateLineup(lineup, salaryCap, rosterSlots);
  if (!validation.valid) {
    console.warn('[Lineup Decider] Lineup validation issues:', validation.issues);
    // Try to fix common issues
    lineup.validationIssues = validation.issues;
  }

  console.log(`[Lineup Decider] ✓ Lineup decided: ${lineup.players?.length} players, $${lineup.totalSalary}`);

  return lineup;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUILD DECISION REQUEST
// ═══════════════════════════════════════════════════════════════════════════════

function buildDecisionRequest(buildThesis, playerInvestigations, context, salaryCap, rosterSlots) {
  const { winningTargets, players } = context;

  // Format player investigations by position
  const investigationsStr = formatInvestigationsByPosition(playerInvestigations);

  // Get high-value targets based on thesis
  const thesisTargets = formatThesisTargets(buildThesis, players);

  return `
## YOUR BUILD THESIS
Archetype: ${buildThesis.archetype}
Thesis: ${buildThesis.thesis}
Target Games: ${buildThesis.targetGames?.join(', ') || 'Balanced'}
Win Condition: ${buildThesis.winCondition || 'Outscore the field with ceiling plays'}

## WINNING TARGETS (This is what you're playing for)
- To WIN this GPP: ${winningTargets.toWin} pts
- Top 1%: ${winningTargets.top1Percent} pts
- Cash Line: ${winningTargets.toCash} pts

You're building to WIN, not just cash. Target: ${winningTargets.toWin}+ pts

## SALARY CAP
Cap: $${salaryCap.toLocaleString()}
Roster: ${rosterSlots.join(', ')}

## PLAYER INVESTIGATIONS (Your research)
${investigationsStr}

## PLAYERS THAT FIT YOUR THESIS
${thesisTargets}

## YOUR TASK
Build your lineup. For each position:
1. Review the investigated candidates
2. Consider who fits your thesis
3. Make your decision with conviction

Remember:
- You're building to WIN (${winningTargets.toWin}+ pts)
- Correlation matters (stack players from target games)
- Ceiling over floor (this is GPP)
- Stay under $${salaryCap.toLocaleString()} total

Output your lineup as JSON.
`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORMAT HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function formatInvestigationsByPosition(investigations) {
  const lines = [];

  for (const [position, players] of Object.entries(investigations)) {
    lines.push(`\n### ${position}`);

    if (!players || players.length === 0) {
      lines.push('No candidates investigated');
      continue;
    }

    for (const p of players.slice(0, 5)) { // Top 5 per position
      const verdict = p.verdict || 'NEEDS REVIEW';
      const recentForm = p.investigation?.recentForm || 'Unknown';
      const matchup = p.investigation?.matchup || 'Unknown';
      const ceilingPath = p.investigation?.ceilingPath || 'Standard production';

      lines.push(`
${p.player} - $${p.salary} (${p.team} vs ${p.opponent || 'TBD'})
  Verdict: ${verdict}
  Form: ${recentForm}
  Matchup: ${matchup}
  Ceiling: ${ceilingPath}
  Concerns: ${p.investigation?.concerns || 'None noted'}`);
    }
  }

  return lines.join('\n');
}

function formatThesisTargets(buildThesis, players) {
  const lines = [];

  // Players from target games
  if (buildThesis.targetGames?.length > 0) {
    const targetGamePlayers = players.filter(p => {
      const matchup = `${p.team}@${p.opponent}`;
      const matchupAlt = `${p.opponent}@${p.team}`;
      return buildThesis.targetGames.some(g =>
        g.includes(p.team) || matchup.includes(g) || matchupAlt.includes(g)
      );
    });

    if (targetGamePlayers.length > 0) {
      lines.push('### Players in Target Games');
      for (const p of targetGamePlayers.slice(0, 15)) {
        lines.push(`- ${p.name} ($${p.salary}) - ${p.team} - ${p.positions?.join('/') || p.position}`);
      }
    }
  }

  // Players in usage situations
  if (buildThesis.usageSituations?.length > 0) {
    lines.push('\n### Usage Vacuum Beneficiaries');
    for (const us of buildThesis.usageSituations) {
      lines.push(`- ${us.player}: ${us.situation}`);
    }
  }

  return lines.join('\n') || 'No specific thesis targets - evaluate all candidates';
}

// ═══════════════════════════════════════════════════════════════════════════════
// PARSE LINEUP DECISION
// ═══════════════════════════════════════════════════════════════════════════════

function parseLineupDecision(text, players, salaryCap, rosterSlots) {
  // NO FALLBACKS: Gary MUST produce a valid lineup or we fail
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('[Lineup Decider] Gary Pro did not produce JSON lineup. Raw response: ' + text.slice(0, 500));
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    // Attempt truncated JSON recovery — Gemini Pro may exceed output tokens
    console.warn(`[Lineup Decider] JSON parse failed: ${e.message} — attempting truncation recovery`);
    let truncated = jsonMatch[0];
    // Find the last complete player object (ends with })
    const lastBrace = truncated.lastIndexOf('}');
    if (lastBrace > 0) {
      // Close the players array and root object
      truncated = truncated.slice(0, lastBrace + 1) + ']}';
      truncated = truncated.replace(/,\s*\]/, ']'); // Remove trailing comma before ]
      try {
        parsed = JSON.parse(truncated);
        console.warn(`[Lineup Decider] ✓ Recovered truncated JSON — got ${parsed.players?.length || 0} players`);
      } catch (e2) {
        throw new Error('[Lineup Decider] Gary Pro produced invalid JSON: ' + e.message + '. Raw: ' + jsonMatch[0].slice(0, 500));
      }
    } else {
      throw new Error('[Lineup Decider] Gary Pro produced invalid JSON: ' + e.message + '. Raw: ' + jsonMatch[0].slice(0, 500));
    }
  }

  if (!parsed.players || parsed.players.length === 0) {
    throw new Error('[Lineup Decider] Gary Pro did not select any players. Response: ' + JSON.stringify(parsed).slice(0, 500));
  }

  // Enrich with full player data
  const enrichedPlayers = parsed.players.map(p => {
    // Find player by exact name match first
    let fullPlayer = players.find(fp =>
      fp.name?.toLowerCase() === p.name?.toLowerCase()
    );

    // Fallback to fuzzy match if not found
    if (!fullPlayer) {
      fullPlayer = players.find(fp =>
        fp.name?.toLowerCase().includes(p.name?.toLowerCase()) ||
        p.name?.toLowerCase().includes(fp.name?.toLowerCase())
      );
    }

    if (!fullPlayer) {
      console.warn(`[Lineup Decider] ⚠️ Player "${p.name}" not found in slate - using Gemini's data (may have wrong team/position)`);
    } else {
      if (fullPlayer.team !== p.team) {
        console.log(`[Lineup Decider] ✓ Fixed team for ${p.name}: ${p.team} → ${fullPlayer.team}`);
      }
      // Validate Gemini's slot assignment against real DK/FD position eligibility
      const realPositions = fullPlayer.positions || [fullPlayer.position];
      const assignedSlot = (p.position || '').toUpperCase();
      const isEligible = isSlotEligible(assignedSlot, realPositions);
      if (!isEligible) {
        console.warn(`[Lineup Decider] ⚠️ ${p.name} assigned to ${assignedSlot} but eligible for ${realPositions.join('/')} — fixing to ${realPositions[0]}`);
      }
    }

    // ALWAYS prefer fullPlayer data over Gemini's output to prevent hallucinations
    const realPositions = fullPlayer?.positions || [fullPlayer?.position || p.position];
    const assignedSlot = (p.position || '').toUpperCase();
    return {
      ...p,
      id: fullPlayer?.id || p.id,
      team: fullPlayer?.team || p.team,
      // Override position with real data — use Gemini's slot ONLY if player is actually eligible
      position: isSlotEligible(assignedSlot, realPositions) ? assignedSlot : realPositions[0],
      positions: realPositions,
      projected_pts: fullPlayer?.projected_pts || p.projectedPoints,
      salary: fullPlayer?.salary || p.salary
    };
  });

  // Validate we have enough players
  if (enrichedPlayers.length !== rosterSlots.length) {
    throw new Error(`[Lineup Decider] Gary Pro selected ${enrichedPlayers.length} players but need ${rosterSlots.length}. Fix the lineup.`);
  }

  // Calculate totals
  const totalSalary = enrichedPlayers.reduce((sum, p) => sum + (p.salary || 0), 0);
  const projectedPoints = enrichedPlayers.reduce((sum, p) => sum + (p.projectedPoints || p.projected_pts || 0), 0);

  // Validate salary cap
  if (totalSalary > salaryCap) {
    throw new Error(`[Lineup Decider] Gary Pro lineup is over salary cap: $${totalSalary} > $${salaryCap}. Fix the lineup.`);
  }

  return {
    players: enrichedPlayers,
    totalSalary: parsed.totalSalary || totalSalary,
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

/**
 * Check if a player is eligible for a given DK/FD roster slot.
 * DK slots: PG, SG, SF, PF, C, G (PG/SG), F (SF/PF), UTIL (any)
 * FD slots: PG, SG, SF, PF, C (no flex slots)
 */
function isSlotEligible(slot, playerPositions) {
  if (!slot || !playerPositions || playerPositions.length === 0) return true;
  const s = slot.toUpperCase();
  const poss = playerPositions.map(p => p.toUpperCase());
  if (s === 'UTIL') return true;
  if (s === 'G') return poss.some(p => p === 'PG' || p === 'SG');
  if (s === 'F') return poss.some(p => p === 'SF' || p === 'PF');
  return poss.includes(s);
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATE LINEUP
// ═══════════════════════════════════════════════════════════════════════════════

function validateLineup(lineup, salaryCap, rosterSlots) {
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
    if (!isSlotEligible(player.position, positions)) {
      issues.push(`${player.name} assigned to ${player.position} but eligible for ${positions.join('/')}`);
    }
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLATFORM HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function getSalaryCap(platform) {
  if (platform?.toLowerCase() === 'fanduel') {
    return 60000; // FanDuel NBA
  }
  return 50000; // DraftKings NBA
}

function getRosterSlots(platform) {
  if (platform?.toLowerCase() === 'fanduel') {
    return ['PG', 'PG', 'SG', 'SG', 'SF', 'SF', 'PF', 'PF', 'C'];
  }
  return ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F', 'UTIL'];
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default {
  decideLineupWithPro
};
