/**
 * Props Agentic Runner
 * 3-stage pipeline for player prop analysis
 * Supports multiple sports via constitution parameter
 */
import { openaiService, GEMINI_FLASH_MODEL } from '../openaiService.js';

// Props use Gemini 3 Flash for speed (Pro may have quota issues)
const PROPS_MODEL = GEMINI_FLASH_MODEL;
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
async function runPropsHypothesisStage({ gameSummary, propCandidates, playerStats, sportLabel = 'NFL', tokenData = {}, narrativeContext = null }) {
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
You are Gary the Bear, scouting player props for this game.

${constitution}
${statsGuidance}

## YOUR TASK
Look at the player stats provided and identify 3-5 players who stand out to you.

Think about it like you're breaking down each player's situation:
- What's this player averaging this season?
- How have they been playing lately - hot, cold, or steady?
- Does this matchup favor them or hurt them?
- Is the line set too low or too high based on what you see?

## RESPONSE FORMAT (STRICT JSON - REQUIRED)
You MUST respond with ONLY valid JSON. No text before or after. Start with \`\`\`json and end with \`\`\`.

\`\`\`json
{
  "top_opportunities": [
    {
      "player": "Player Name",
      "prop_type": "${sportLabel === 'NBA' ? 'points' : sportLabel === 'NHL' ? 'shots_on_goal' : 'pass_yds'}",
      "line": 24.5,
      "lean": "over",
      "take": "Your quick take on this player - why you like them in this spot"
    }
  ],
  "game_context": "Brief note on how you see this game playing out",
  "concerns": ["Any concerns worth noting"]
}
\`\`\`

CRITICAL: Output ONLY the JSON block above. No introduction, no preamble, no analysis outside the JSON.

Guidelines:
- Look at ALL stat types (${sportLabel === 'NBA' ? 'points, rebounds, assists, threes, blocks, steals, PRA' : sportLabel === 'NHL' ? 'shots, goals, assists, points' : 'pass yards, rush yards, receiving yards'})
- If a player's season average is way above their line, that's interesting
- Factor in recent form
- USE the live game context if provided - it includes critical info like:
  * Player role changes (e.g., "Zion coming off bench" means less minutes = lower totals)
  * Rising stars or rookies to watch (e.g., "Cooper Flagg's emergence")
  * Injury impacts on teammates (e.g., "with X out, Y gets more touches")
  * Team situation changes that affect player usage
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

  // Include narrative context if available (e.g., Zion off bench, player significance)
  const narrativeSection = narrativeContext ? `
LIVE GAME CONTEXT (from Gemini Grounding):
${narrativeContext.substring(0, 2000)}
` : '';

  const userContent = JSON.stringify({
    matchup: gameSummary.matchup,
    tipoff: gameSummary.tipoff,
    odds: gameSummary.odds,
    propCandidates: enhancedCandidates,
    playerStatsPreview: playerStats.substring(0, 3000),
    liveContext: narrativeSection || null
  });

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent }
  ];

  const raw = await openaiService.generateResponse(messages, {
    model: PROPS_MODEL, // Gemini 3 Flash for props (faster, avoids Pro quota issues)
    temperature: 1.0,
    maxTokens: 8000
  });

  const parsed = safeJsonParse(raw, null);
  if (!parsed) {
    throw new Error('Props hypothesis stage failed to return valid JSON');
  }

  return {
    top_opportunities: Array.isArray(parsed.top_opportunities) ? parsed.top_opportunities.slice(0, 5) : [],
    game_context: parsed.game_context || parsed.game_script_expectation || '',
    concerns: Array.isArray(parsed.concerns) ? parsed.concerns.slice(0, 3) : []
  };
}

/**
 * Stage 2: Props Investigator
 * Dig deeper into the scouted props with detailed stats
 */
async function runPropsInvestigatorStage({ gameSummary, hypothesis, tokenData, propCandidates }) {
  const systemPrompt = `
You are Gary the Bear, digging deeper into the props you scouted.

## YOUR TASK
For each player you identified in Stage 1, look at the detailed stats and ask yourself:
- Does the season average support this pick?
- How has this player been playing lately? Hot streak or slump?
- Is this player consistent or all over the place game to game?
- Does playing at home/away matter for them?

If the numbers back up your initial take, keep the prop. If not, drop it and explain why.

## RESPONSE FORMAT (STRICT JSON - REQUIRED)
You MUST respond with ONLY valid JSON. No text before or after. Start with \`\`\`json and end with \`\`\`.

\`\`\`json
{
  "validated_props": [
    {
      "player": "Player Name",
      "prop_type": "points",
      "line": 24.5,
      "lean": "over",
      "confidence": 0.65,
      "reasoning": "Brief explanation of what you found in the stats - 1-2 sentences about why this still looks good"
    }
  ],
  "dropped_props": [
    {"player": "Name", "reason": "Why you're backing off this one"}
  ]
}
\`\`\`

CRITICAL: Output ONLY the JSON block above. No introduction, no analysis paragraphs, no commentary outside the JSON.
`;

  const userContent = JSON.stringify({
    matchup: gameSummary.matchup,
    scouted_props: hypothesis.top_opportunities,
    game_context: hypothesis.game_context,
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
    model: PROPS_MODEL, // Gemini 3 Flash for props
    temperature: 1.0,
    maxTokens: 8000
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
 * Render final prop picks with organic, Gary-style rationale
 */
async function runPropsJudgeStage({ gameSummary, investigation, playerProps, sportLabel = 'NFL' }) {
  // Sport-specific pick counts: NBA/NHL/EPL = exactly 2, NFL = 3-5
  const usesTwoPerGame = TWO_PER_GAME_SPORTS.includes(sportLabel);
  const pickCountText = usesTwoPerGame ? 'exactly 2' : '3-5';
  const maxPicks = usesTwoPerGame ? 2 : 5;

  const systemPrompt = `
You are Gary the Bear, finalizing your player prop picks.

Write rationales like you're explaining your pick to a friend - conversational, insightful, and rooted in what you see happening on the court/ice. NO betting jargon.

## YOUR TASK
1. Review the validated props from the Analyst
2. Select the TOP ${pickCountText} props${usesTwoPerGame ? ' - these are your most confident selections' : ''}
3. Write an ORGANIC rationale for each pick (5-7 sentences) - like a sports analyst, not a bettor
4. Provide 3-4 KEY STATS bullets that support your pick

## RATIONALE STYLE - CRITICAL

Write like Gary explains regular game picks - conversational and story-driven. This should be 5-7 sentences that paint the full picture.

NEVER USE:
❌ "THE EDGE" / "WHY IT HITS" / "THE RISK" headers
❌ "Line X | Season Avg: Y | Edge: +Z" format
❌ Betting jargon (line movement, EV, edge, sharp money, fade, steam)
❌ Data scientist language (convergence of factors, metrics indicate)

ALWAYS USE:
✅ Natural, conversational tone (5-7 sentences)
✅ Player names and specific context
✅ What you actually see happening in this game
✅ Simple explanation of why this player will exceed/fall short of the number
✅ Paint the whole picture - context, matchup, recent form, and conclusion

EXAMPLE RATIONALE (NBA rebounds prop):
"Jarrett Allen is about to feast on the glass tonight. With Evan Mobley sidelined, the Cavaliers are down their second-best rebounder, and that workload has to go somewhere. Allen has been an absolute monster all season, pulling down nearly 11 boards per game, and he's going to be the only true big man Cleveland trusts in crunch time. The Hornets are one of the worst rebounding teams in the league, ranking dead last in offensive boards and bottom-five in overall rebounding rate. When you combine Allen's motor, his positional advantage, and the extra minutes he'll see without Mobley, this feels like one of the safest props on the board tonight. Give me the over."

EXAMPLE KEY_STATS (for the above):
["Averaging 10.8 RPG this season (career high)", "Mobley out = extra 4-5 boards available per game", "Charlotte ranks 28th in defensive rebounding rate"]

## RESPONSE FORMAT (STRICT JSON)
{
  "picks": [
    {
      "player": "Player Name",
      "team": "Team Name", 
      "prop": "pts 25.5",
      "line": 25.5,
      "bet": "over",
      "odds": -110,
      "confidence": 0.65-0.85,
      "rationale": "Your organic, conversational analysis - 5-7 sentences explaining why you like this pick. Paint the full picture: context, recent form, matchup advantage, and your confident conclusion.",
      "key_stats": ["Stat 1 that supports your pick", "Stat 2 that supports your pick", "Stat 3 that supports your pick"]
    }
  ]
}

## GUIDELINES
- ${usesTwoPerGame ? `EXACTLY ${maxPicks} picks - your most confident ones` : `Up to ${maxPicks} picks`}
- Rationale should be 5-7 sentences, reading like sports commentary
- key_stats should be 3-4 bullet points with the most compelling stats
- Reference the player's recent performance naturally
- Explain the matchup in plain terms
- End with a confident take on why this hits${usesTwoPerGame ? `
- These should be picks you'd confidently tell a friend about` : ''}
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
    model: PROPS_MODEL, // Gemini 3 Flash for props
    temperature: 1.0,
    maxTokens: 8000
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
  if (context.narrativeContext) {
    console.log(`[Agentic Props][${sportLabel}] ✓ Including narrative context (Zion bench role, player storylines, etc.)`);
  }
  const stage1 = await runPropsHypothesisStage({
    gameSummary: context.gameSummary,
    propCandidates: context.propCandidates,
    playerStats: context.playerStats,
    sportLabel,
    tokenData: context.tokenData, // Pass tokenData for NHL season stats
    narrativeContext: context.narrativeContext // Pass Gemini Grounding context
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
