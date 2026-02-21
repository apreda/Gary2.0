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
To win a GPP, you need a CEILING LINEUP that targets the winning score for this slate size.

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

</decision_framework>

<punt_awareness>
"Punts" ($4K-$5.5K) are a DFS reality — salary constraints mean you'll likely need 1-2.
Ask: For each low-salary player you consider, what does their recent production, role, and game environment tell you about their upside?
Ask: Is there a genuine ceiling path for this player, or is this just a cheap price with no thesis?
</punt_awareness>

<ownership_awareness>
Some candidates include raw ownership signals: salary rank at position, L5/season form ratio, and game popularity rank.
These are raw data for YOUR assessment of likely field exposure.

Ask: What do the salary rank and form signals suggest about which players the field is gravitating toward?
Ask: How many of your core plays overlap with what the field is likely building? What does that mean for your differentiation?

This is awareness, not a rule. Ask: "Am I building the FIELD'S lineup, or MY lineup?"
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

  // Parse Gary's lineup decision — with self-correction loop for structural issues
  let lineup;
  let correctionAttempts = 0;
  const MAX_CORRECTIONS = 2;

  while (correctionAttempts <= MAX_CORRECTIONS) {
    try {
      lineup = parseLineupDecision(responseText, players, salaryCap, rosterSlots);

      // Check for structural issues that need correction
      const issues = getStructuralIssues(lineup, players, salaryCap, rosterSlots);
      if (issues.length === 0) break; // Clean lineup, we're done

      if (correctionAttempts >= MAX_CORRECTIONS) {
        console.warn(`[Lineup Decider] Structural issues remain after ${MAX_CORRECTIONS} corrections:`, issues);
        lineup.validationIssues = issues;
        break;
      }

      // Send back for correction
      correctionAttempts++;
      console.log(`[Lineup Decider] Correction attempt ${correctionAttempts}/${MAX_CORRECTIONS}: ${issues.join('; ')}`);

      const correctionPrompt = `Your lineup has these issues that MUST be fixed:
${issues.map((iss, i) => `${i + 1}. ${iss}`).join('\n')}

RULES:
- You MUST select exactly ${rosterSlots.length} players for slots: ${rosterSlots.join(', ')}
- All players MUST be from the slate player pool — do NOT invent players or use players from other games
- You MUST use players from at least 2 different teams
- Stay under $${salaryCap.toLocaleString()} salary cap

Fix the lineup and output the corrected JSON.`;

      const correctionResult = await model.generateContent(correctionPrompt);
      responseText = correctionResult.response.text() || '';

      if (!responseText) {
        console.warn('[Lineup Decider] Correction returned empty — using previous lineup');
        break;
      }
    } catch (parseError) {
      if (correctionAttempts >= MAX_CORRECTIONS) {
        throw parseError; // Give up after max corrections
      }
      correctionAttempts++;
      console.log(`[Lineup Decider] Parse error, correction attempt ${correctionAttempts}: ${parseError.message}`);

      const fixPrompt = `Your lineup response had an error: ${parseError.message}

Build a complete ${rosterSlots.length}-player lineup for slots: ${rosterSlots.join(', ')}
Stay under $${salaryCap.toLocaleString()}. Output ONLY the JSON object.`;

      const fixResult = await model.generateContent(fixPrompt);
      responseText = fixResult.response.text() || '';

      if (!responseText) {
        throw parseError; // Can't recover
      }
    }
  }

  // ── Salary Optimization Pass ──
  // If Gary left $1000+ on the table, ask him to reconsider his cheapest player
  const remainingSalary = salaryCap - (lineup.totalSalary || 0);
  if (remainingSalary >= 1000 && lineup.players?.length > 0) {
    console.log(`[Lineup Decider] Salary optimization: $${remainingSalary} remaining — reviewing cheapest player`);

    // Find the cheapest player in the lineup
    const cheapest = [...lineup.players].sort((a, b) => (a.salary || 0) - (b.salary || 0))[0];
    const budgetForSlot = (cheapest.salary || 0) + remainingSalary;

    const salaryOptPrompt = `You have $${remainingSalary.toLocaleString()} unused salary in your lineup.

Your cheapest player: ${cheapest.name} ($${cheapest.salary?.toLocaleString()}) at ${cheapest.position}

You could spend up to $${budgetForSlot.toLocaleString()} on that slot.

Review whether upgrading from ${cheapest.name} improves your ceiling. Consider:
- Is there a player at that salary range with a better ceiling path?
- Does ${cheapest.name} have a real edge, or was he a salary filler?
- Would the upgrade improve correlation with your stacks?

If you find a better option, output the FULL updated lineup JSON (all ${rosterSlots.length} players).
If ${cheapest.name} is the right play, respond with: "KEEP LINEUP"`;

    try {
      const optResult = await model.generateContent(salaryOptPrompt);
      const optText = optResult.response.text() || '';

      if (optText && !optText.toUpperCase().includes('KEEP LINEUP')) {
        // Try to parse an upgraded lineup
        const optLineup = parseLineupDecision(optText, players, salaryCap, rosterSlots);
        const optIssues = getStructuralIssues(optLineup, players, salaryCap, rosterSlots);

        if (optIssues.length === 0 && optLineup.totalSalary > lineup.totalSalary) {
          console.log(`[Lineup Decider] Salary optimization accepted: $${lineup.totalSalary} → $${optLineup.totalSalary}`);
          lineup = optLineup;
        } else if (optIssues.length > 0) {
          console.log(`[Lineup Decider] Salary optimization rejected — structural issues: ${optIssues.join('; ')}`);
        } else {
          console.log(`[Lineup Decider] Salary optimization rejected — didn't use more salary`);
        }
      } else {
        console.log(`[Lineup Decider] Salary optimization: Gary kept original lineup`);
      }
    } catch (optError) {
      console.warn(`[Lineup Decider] Salary optimization failed (keeping original): ${optError.message}`);
    }
  }

  // Final validation (non-fatal — just log warnings)
  const validation = validateLineup(lineup, salaryCap, rosterSlots);
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

function buildDecisionRequest(buildThesis, playerInvestigations, context, salaryCap, rosterSlots) {
  const { winningTargets, players } = context;

  // Format player investigations by position
  const investigationsStr = formatInvestigationsByPosition(playerInvestigations);

  // Get high-value targets based on thesis
  const thesisTargets = formatThesisTargets(buildThesis, players);

  return `
## YOUR BUILD THESIS
Edges: ${buildThesis.edges?.map(e => `${e.type}: ${e.description} (${e.confidence || 'MEDIUM'})`).join('\n- ') || 'None identified'}
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
- Your thesis is your STARTING FRAMEWORK, not a constraint. If the player investigation
  revealed better opportunities outside your thesis targets, adjust. The best lineup wins,
  not the most thesis-consistent lineup.
- Your per-player reasoning should be based on the player's ACTUAL RECENT PRODUCTION, matchup, and
  game environment tonight. Cite the data from your investigation.

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

    for (const p of players) { // All investigated candidates — don't drop data
      const recentForm = p.investigation?.recentForm || null;
      const matchup = p.investigation?.matchup || null;
      const keyFindings = p.investigation?.keyFindings || null;
      const rangeOfOutcomes = p.investigation?.rangeOfOutcomes || null;
      const riskFactors = p.investigation?.riskFactors || null;
      const salary = p.salary ? `$${p.salary}` : '$?';
      const dkFpts = p.rawData?.seasonStats?.dkFpts || p.rawData?.l5Stats?.dkFptsAvg;
      const fptsStr = dkFpts ? ` | DK FPTS: ${dkFpts.toFixed(1)}` : '';

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

  // Injury context from thesis
  if (buildThesis.injuryReport?.length > 0) {
    lines.push('\n### Injury Context');
    for (const report of buildThesis.injuryReport) {
      const outNames = (report.outPlayers || []).map(p => `${p.player} (${p.duration || 'unknown'}, ${p.gamesMissed ?? '?'} games missed)`).join(', ');
      if (outNames) lines.push(`- ${report.team}: ${outNames}`);
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
// STRUCTURAL ISSUE DETECTION (triggers self-correction loop)
// ═══════════════════════════════════════════════════════════════════════════════

function getStructuralIssues(lineup, players, salaryCap, rosterSlots) {
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

  return issues;
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
