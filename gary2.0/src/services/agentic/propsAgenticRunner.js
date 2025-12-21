/**
 * Props Agentic Runner
 * 3-stage pipeline for player prop analysis
 * Supports multiple sports via constitution parameter
 */
import { openaiService } from '../openaiService.js';
import { safeJsonParse } from './agenticUtils.js';
import { NFL_PROPS_CONSTITUTION } from './constitution/nflPropsConstitution.js';
import { NBA_PROPS_CONSTITUTION } from './constitution/nbaPropsConstitution.js';
import { EPL_PROPS_CONSTITUTION } from './constitution/eplPropsConstitution.js';
import { NHL_PROPS_CONSTITUTION } from './constitution/nhlPropsConstitution.js';

// Map of sport labels to constitutions
const SPORT_CONSTITUTIONS = {
  'NFL': NFL_PROPS_CONSTITUTION,
  'NBA': NBA_PROPS_CONSTITUTION,
  'EPL': EPL_PROPS_CONSTITUTION,
  'NHL': NHL_PROPS_CONSTITUTION,
};

/**
 * Get the appropriate constitution for a sport
 */
function getConstitution(sportLabel) {
  return SPORT_CONSTITUTIONS[sportLabel] || NFL_PROPS_CONSTITUTION;
}

/**
 * Stage 1: Props Hypothesis
 * Form initial hypotheses about which props have value
 */
async function runPropsHypothesisStage({ gameSummary, propCandidates, playerStats, sportLabel = 'NFL', tokenData = {} }) {
  const constitution = getConstitution(sportLabel);
  
  // Sport-specific instructions for using season stats
  const statsGuidance = sportLabel === 'NHL' ? `
## CRITICAL FOR NHL PROPS
You have REAL player season stats available. For each player you MUST:
1. Check their SOG/G (shots on goal per game) average
2. Compare it to the prop line
3. Only pick OVER if SOG/G is at least 0.5 above the line
4. Only pick UNDER if SOG/G is at least 0.3 below the line
5. AVOID props where the average is within ±0.2 of the line

Example analysis:
- Player A: SOG/G = 3.2, Line = 2.5 → OVER candidate (0.7 above line) ✓
- Player B: SOG/G = 2.6, Line = 2.5 → AVOID (only 0.1 above, too close)
- Player C: SOG/G = 2.1, Line = 2.5 → UNDER candidate (0.4 below line) ✓
` : sportLabel === 'NBA' ? `
## CRITICAL FOR NBA PROPS
You have REAL player season stats available. For each player you MUST:
1. Check their PPG (points per game), RPG (rebounds), APG (assists), 3PG (threes) averages
2. Compare directly to the prop line
3. For POINTS: Only pick OVER if PPG is at least 1.0 above the line
4. For REBOUNDS/ASSISTS: Only pick OVER if avg is at least 0.5 above the line
5. AVOID props where the average is within ±0.5 of the line (coin flip territory)

Example analysis:
- Player A: PPG = 28.5, Line = 26.5 → OVER candidate (+2.0 above line) ✓
- Player B: PPG = 24.2, Line = 24.5 → AVOID (0.3 below, too close to line)
- Player C: RPG = 8.5, Line = 7.5 → OVER candidate (+1.0 above line) ✓
` : '';

  const systemPrompt = `
You are Stage 1 of the Gary Props Pipeline: "The Scout"

Your job is to identify the BEST player prop opportunities in this game.

${constitution}
${statsGuidance}

## YOUR TASK
1. Review the available prop candidates and player stats
2. Form hypotheses about which players are likely to exceed or fall short of their lines
3. Identify 3-5 top prop opportunities based on matchup, usage, and line value
4. Request specific data tokens to validate your hypotheses

## RESPONSE FORMAT (STRICT JSON)
{
  "top_opportunities": [
    {
      "player": "Player Name",
      "prop_type": "${sportLabel === 'NBA' ? 'points' : sportLabel === 'NHL' ? 'shots_on_goal' : 'pass_yds'}",
      "line": ${sportLabel === 'NBA' ? '24.5' : sportLabel === 'NHL' ? '2.5' : '245.5'},
      "lean": "over" or "under",
      "hypothesis": "One sentence explaining why - MUST reference the player's season average",
      "season_avg": ${sportLabel === 'NHL' ? '"3.2 SOG/G"' : sportLabel === 'NBA' ? '"28.5 PPG"' : '"N/A"'},
      "edge_vs_line": ${sportLabel === 'NHL' || sportLabel === 'NBA' ? '"+2.0"' : '"N/A"'},
      "confidence": 0.50-0.85
    }
  ],
  "requested_tokens": ["player_stats", "opponent_vs_position", "game_script"],
  "game_script_expectation": "Brief note on expected game flow",
  "concerns": ["Brief concern 1", "Brief concern 2"]
}

Guidelines:
- Focus on props with odds better than -130
- Analyze ALL prop types available (${sportLabel === 'NBA' ? 'points, rebounds, assists, threes, blocks, steals' : sportLabel === 'NHL' ? 'shots_on_goal, goals, assists, points' : 'pass yards, rush yards, receiving yards, receptions, TDs'}) - pick whichever props have the BEST EDGE regardless of type
- Consider game script heavily
- Flag any injury concerns
${(sportLabel === 'NHL' || sportLabel === 'NBA') ? '- ALWAYS cite the player season average in your hypothesis' : ''}
`;

  // Enhanced prop candidates with season stats for NHL and NBA
  const enhancedCandidates = propCandidates.slice(0, 12).map(p => {
    const base = {
      player: p.player,
      team: p.team,
      props: p.props
    };
    
    // Include season stats if available (from tokenData for NHL or NBA)
    if ((sportLabel === 'NHL' || sportLabel === 'NBA') && tokenData?.prop_lines?.candidates) {
      const match = tokenData.prop_lines.candidates.find(c => c.player === p.player);
      if (match?.seasonStats) {
        base.seasonStats = match.seasonStats;
      }
    }
    
    return base;
  });

  const userContent = JSON.stringify({
    matchup: gameSummary.matchup,
    tipoff: gameSummary.tipoff,
    odds: gameSummary.odds,
    propCandidates: enhancedCandidates,
    playerStatsPreview: playerStats.substring(0, 3000)
  });

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent }
  ];

  const raw = await openaiService.generateResponse(messages, {
    temperature: 0.4,
    maxTokens: 1200
  });

  const parsed = safeJsonParse(raw, null);
  if (!parsed) {
    throw new Error('Props hypothesis stage failed to return valid JSON');
  }

  return {
    top_opportunities: Array.isArray(parsed.top_opportunities) ? parsed.top_opportunities.slice(0, 5) : [],
    requested_tokens: Array.isArray(parsed.requested_tokens) ? parsed.requested_tokens : [],
    game_script_expectation: parsed.game_script_expectation || '',
    concerns: Array.isArray(parsed.concerns) ? parsed.concerns.slice(0, 3) : []
  };
}

/**
 * Stage 2: Props Investigator
 * Validate hypotheses with detailed data including recent form and consistency
 */
async function runPropsInvestigatorStage({ gameSummary, hypothesis, tokenData, propCandidates }) {
  const systemPrompt = `
You are Stage 2 of the Gary Props Pipeline: "The Analyst"

You receive the Scout's hypotheses and must validate them with data.

## YOUR TASK
1. Evaluate each prop hypothesis against the provided stats
2. Check recent form (last 5-10 games) - is the player hot, cold, or steady?
3. Check consistency - high variance players are riskier
4. Check home/away splits if relevant to the matchup
5. Produce evidence bullets that support or contradict each lean
6. Calculate the EDGE: (season avg - line) or (recent avg - line)
7. Flag any props that should be dropped due to weak evidence

## ENHANCED VALIDATION CRITERIA
- EDGE CHECK: Is the player's average at least +0.5 (NBA pts) or +0.3 (NHL SOG) above the line for OVER?
- FORM CHECK: Is the player trending up or down in the last 5 games?
- CONSISTENCY CHECK: High variance (consistency < 50%) = add risk factor
- SPLITS CHECK: Does home/away split favor or hurt this pick?

## RESPONSE FORMAT (STRICT JSON)
{
  "validated_props": [
    {
      "player": "Player Name",
      "prop_type": "points",
      "line": 24.5,
      "lean": "over" or "under",
      "confidence": 0.55-0.85,
      "edge": "+3.7",
      "form": "hot" or "cold" or "steady",
      "consistency": "HIGH" or "MED" or "LOW",
      "evidence": [
        {"stat": "Season avg", "value": "28.2 PPG", "impact": "supports"},
        {"stat": "L5 avg", "value": "29.4 PPG", "impact": "supports"},
        {"stat": "Recent games", "value": "4/5 over line", "impact": "supports"},
        {"stat": "Home split", "value": "30.1 PPG at home", "impact": "supports"}
      ]
    }
  ],
  "dropped_props": [
    {"player": "Name", "reason": "Why dropped - e.g., edge too thin (+0.3), inconsistent (LOW), cold streak"}
  ],
  "gaps": ["Any missing data noted"]
}

Guidelines:
- Only keep props with strong evidence (2+ supporting factors)
- REQUIRE edge of at least +0.5 (NBA) or +0.3 (NHL) for OVER picks
- Boost confidence if recent form AND season avg both support the pick
- PENALIZE confidence for LOW consistency players
- Drop props where player is in a clear cold streak (< season avg in L5)
- Note any injury/weather concerns
`;

  const userContent = JSON.stringify({
    matchup: gameSummary.matchup,
    hypotheses: hypothesis.top_opportunities,
    game_script: hypothesis.game_script_expectation,
    data: {
      player_stats: tokenData.player_stats,
      prop_lines: tokenData.prop_lines,
      injuries: tokenData.injury_report
    },
    propDetails: propCandidates.slice(0, 8)
  });

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent }
  ];

  const raw = await openaiService.generateResponse(messages, {
    temperature: 0.35,
    maxTokens: 1400
  });

  const parsed = safeJsonParse(raw, null);
  if (!parsed) {
    throw new Error('Props investigator stage failed to return valid JSON');
  }

  return {
    validated_props: Array.isArray(parsed.validated_props) ? parsed.validated_props : [],
    dropped_props: Array.isArray(parsed.dropped_props) ? parsed.dropped_props : [],
    gaps: Array.isArray(parsed.gaps) ? parsed.gaps : []
  };
}

// Sports that use the 2-per-game rule (quality over quantity)
const TWO_PER_GAME_SPORTS = ['NBA', 'NHL', 'EPL'];

/**
 * Stage 3: Props Judge
 * Render final prop picks with full rationale
 */
async function runPropsJudgeStage({ gameSummary, investigation, playerProps, sportLabel = 'NFL' }) {
  // Sport-specific pick counts: NBA/NHL/EPL = exactly 2, NFL = 3-5
  const usesTwoPerGame = TWO_PER_GAME_SPORTS.includes(sportLabel);
  const pickCountText = usesTwoPerGame ? 'exactly 2' : '3-5';
  const maxPicks = usesTwoPerGame ? 2 : 5;
  const qualityEmphasis = usesTwoPerGame 
    ? `These are the 2 picks you'd put your reputation on - your MOST CONFIDENT selections from this game.`
    : '';

  // Sport-specific stat references
  const statExamples = sportLabel === 'NBA' 
    ? { avg: '28.2 PPG', line: '24.5 pts', edge: '+3.7', stat: 'pts' }
    : sportLabel === 'NHL'
    ? { avg: '3.2 SOG/G', line: '2.5 shots', edge: '+0.7', stat: 'sog' }
    : { avg: '267 yds/g', line: '245.5 yds', edge: '+21.5', stat: 'yds' };

  const systemPrompt = `
You are Stage 3 of the Gary Props Pipeline: "The Judge"

You render the final prop picks with complete rationale.

## YOUR TASK
1. Review the validated props from the Analyst
2. Select the TOP ${pickCountText} best prop bets${usesTwoPerGame ? ' - NO MORE, NO LESS' : ''}
3. Attach the actual odds from the prop lines
4. Write clear rationale for each pick using the ENHANCED format below

${qualityEmphasis}

## ENHANCED RATIONALE FORMAT

Your rationale MUST follow this structure for each pick:

THE EDGE: Line ${statExamples.line} | Season Avg: ${statExamples.avg} (${statExamples.edge} cushion) | Recent Form: L5 avg X.X (Y/5 games over line)

WHY IT HITS: [2-3 sentences explaining the convergence of factors - matchup, recent form, consistency, usage]

THE RISK: [One realistic failure scenario]

CONFIDENCE: XX% | Edge: ${statExamples.edge} | Form: Hot/Cold/Steady

## RESPONSE FORMAT (STRICT JSON)
{
  "picks": [
    {
      "player": "Player Name",
      "team": "Team Name",
      "prop": "${statExamples.stat} ${statExamples.line.split(' ')[0]}",
      "line": ${parseFloat(statExamples.line)},
      "bet": "over",
      "odds": -110,
      "confidence": 0.65-0.85,
      "rationale": "THE EDGE: Line ${statExamples.line} | Season Avg: ${statExamples.avg} (${statExamples.edge} cushion) | Recent Form: L5 avg X.X (4/5 over line)\\n\\nWHY IT HITS: [Your analysis of why this hits]\\n\\nTHE RISK: [One scenario where this misses]\\n\\nCONFIDENCE: 72% | Edge: ${statExamples.edge} | Form: Hot"
    }
  ]
}

## CRITICAL GUIDELINES
- ${usesTwoPerGame ? `EXACTLY ${maxPicks} picks per game - quality over quantity` : `Maximum ${maxPicks} picks per game`}
- Confidence reflects estimated win probability
- Only pick props with odds better than -140
- ALWAYS calculate and show the edge (season avg vs line)
- ALWAYS mention recent form trend (hot/cold/steady) based on last 5 games
- If a player has LOW consistency (high variance), note it as a risk factor
- Consider home/away splits if the data shows significant differences${usesTwoPerGame ? `
- Pick ONLY your 2 most reliable props - the ones you are MOST confident will hit` : ''}
`;

  // Build a lookup map for odds
  const oddsMap = {};
  for (const prop of playerProps) {
    const key = `${prop.player}_${prop.prop_type}_${prop.line}`;
    oddsMap[key] = {
      over_odds: prop.over_odds,
      under_odds: prop.under_odds
    };
  }

  const userContent = JSON.stringify({
    matchup: gameSummary.matchup,
    tipoff: gameSummary.tipoff,
    validated_props: investigation.validated_props,
    available_odds: playerProps.slice(0, 50).map(p => ({
      player: p.player,
      prop_type: p.prop_type,
      line: p.line,
      over_odds: p.over_odds,
      under_odds: p.under_odds
    }))
  });

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent }
  ];

  const raw = await openaiService.generateResponse(messages, {
    temperature: 0.4,
    maxTokens: 1600
  });

  const parsed = safeJsonParse(raw, null);
  if (!parsed || !Array.isArray(parsed.picks)) {
    throw new Error('Props judge stage failed to return valid JSON');
  }

  return parsed.picks;
}


/**
 * Format game time for display
 */
function formatGameTime(timeString) {
  if (!timeString) return 'TBD';
  try {
    const date = new Date(timeString);
    return date.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }) + ' EST';
  } catch {
    return 'TBD';
  }
}

/**
 * Main pipeline runner for props
 */
export async function runAgenticPropsPipeline({
  game,
  playerProps,
  buildContext,
  sportLabel = 'NFL',
  propsPerGame = 5,
  options = {}
}) {
  const start = Date.now();

  console.log(`\n[Agentic Props][${sportLabel}] Building context...`);
  const context = await buildContext(game, playerProps, options);

  console.log(`[Agentic Props][${sportLabel}] Stage 1: Hypothesis for ${context.gameSummary.matchup}`);
  const stage1 = await runPropsHypothesisStage({
    gameSummary: context.gameSummary,
    propCandidates: context.propCandidates,
    playerStats: context.playerStats,
    sportLabel,
    tokenData: context.tokenData // Pass tokenData for NHL season stats
  });
  console.log(`[Agentic Props][${sportLabel}] Found ${stage1.top_opportunities.length} opportunities`);

  if (stage1.top_opportunities.length === 0) {
    console.log(`[Agentic Props][${sportLabel}] No prop opportunities identified`);
    return { picks: [], elapsedMs: Date.now() - start };
  }

  console.log(`[Agentic Props][${sportLabel}] Stage 2: Investigating props...`);
  const stage2 = await runPropsInvestigatorStage({
    gameSummary: context.gameSummary,
    hypothesis: stage1,
    tokenData: context.tokenData,
    propCandidates: context.propCandidates
  });
  console.log(`[Agentic Props][${sportLabel}] Validated ${stage2.validated_props.length} props, dropped ${stage2.dropped_props.length}`);

  if (stage2.validated_props.length === 0) {
    console.log(`[Agentic Props][${sportLabel}] No props passed validation`);
    return { picks: [], elapsedMs: Date.now() - start };
  }

  console.log(`[Agentic Props][${sportLabel}] Stage 3: Rendering final picks...`);
  const rawPicks = await runPropsJudgeStage({
    gameSummary: context.gameSummary,
    investigation: stage2,
    playerProps: context.playerProps,
    sportLabel // Pass sport label for sport-specific pick counts
  });

  // Build matchup string (away @ home)
  const matchup = `${game.away_team} @ ${game.home_team}`;
  
  // Enhance picks with metadata
  const enhancedPicks = rawPicks.slice(0, propsPerGame).map(pick => {
    return {
      ...pick,
      sport: sportLabel,
      time: formatGameTime(game.commence_time),
      matchup: matchup,  // Add matchup for grouping in UI
      commence_time: game.commence_time,  // ISO format for sorting
      // Ensure all required fields
      player: pick.player || 'Unknown',
      team: pick.team || sportLabel,
      prop: pick.prop || `${pick.prop_type || 'unknown'} ${pick.line || ''}`,
      bet: (pick.bet || 'over').toLowerCase(),
      odds: pick.odds || -110,
      confidence: pick.confidence || 0.6,
      rationale: pick.rationale || 'Analysis based on matchup data.'
    };
  });

  // Sport-specific filtering:
  // - NBA/NHL/EPL: No confidence filter (2-per-game rule handles quality)
  // - NFL: Apply 70% confidence threshold
  const usesTwoPerGame = TWO_PER_GAME_SPORTS.includes(sportLabel);
  let finalPicks;
  
  if (usesTwoPerGame) {
    // For NBA/NHL/EPL: Take exactly the picks returned (no confidence filter)
    // The Judge was instructed to return exactly 2 high-quality picks
    finalPicks = enhancedPicks;
    console.log(`[Agentic Props][${sportLabel}] Using 2-per-game rule: ${finalPicks.length} picks (no confidence filter)`);
  } else {
    // For NFL: Apply confidence threshold (65% minimum - lowered to allow more picks through)
    finalPicks = enhancedPicks.filter(p => p.confidence >= 0.65);
    console.log(`[Agentic Props][${sportLabel}] Applied confidence filter (65%+): ${enhancedPicks.length} -> ${finalPicks.length} picks`);
  }

  const elapsedMs = Date.now() - start;
  console.log(`[Agentic Props][${sportLabel}] Pipeline complete in ${elapsedMs}ms`);

  return {
    picks: finalPicks,
    stage1,
    stage2,
    elapsedMs
  };
}

export default {
  runAgenticPropsPipeline
};
