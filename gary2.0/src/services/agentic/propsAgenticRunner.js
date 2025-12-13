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
async function runPropsHypothesisStage({ gameSummary, propCandidates, playerStats, sportLabel = 'NFL' }) {
  const constitution = getConstitution(sportLabel);
  
  const systemPrompt = `
You are Stage 1 of the Gary Props Pipeline: "The Scout"

Your job is to identify the BEST player prop opportunities in this game.

${constitution}

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
      "prop_type": "${sportLabel === 'NBA' ? 'points' : 'pass_yds'}",
      "line": ${sportLabel === 'NBA' ? '24.5' : '245.5'},
      "lean": "over" or "under",
      "hypothesis": "One sentence explaining why",
      "confidence": 0.50-0.75
    }
  ],
  "requested_tokens": ["player_stats", "opponent_vs_position", "game_script"],
  "game_script_expectation": "Brief note on expected game flow",
  "concerns": ["Brief concern 1", "Brief concern 2"]
}

Guidelines:
- Focus on props with odds better than -130
- Prefer volume stats (${sportLabel === 'NBA' ? 'points, rebounds, assists' : 'yards, receptions'}) over outcome stats (TDs)
- Consider game script heavily
- Flag any injury concerns
`;

  const userContent = JSON.stringify({
    matchup: gameSummary.matchup,
    tipoff: gameSummary.tipoff,
    odds: gameSummary.odds,
    propCandidates: propCandidates.slice(0, 10).map(p => ({
      player: p.player,
      team: p.team,
      props: p.props.slice(0, 4)
    })),
    playerStatsPreview: playerStats.substring(0, 2000)
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
 * Validate hypotheses with detailed data
 */
async function runPropsInvestigatorStage({ gameSummary, hypothesis, tokenData, propCandidates }) {
  const systemPrompt = `
You are Stage 2 of the Gary Props Pipeline: "The Analyst"

You receive the Scout's hypotheses and must validate them with data.

## YOUR TASK
1. Evaluate each prop hypothesis against the provided stats
2. Produce evidence bullets that support or contradict each lean
3. Adjust confidence based on evidence
4. Flag any props that should be dropped due to weak evidence

## RESPONSE FORMAT (STRICT JSON)
{
  "validated_props": [
    {
      "player": "Player Name",
      "prop_type": "pass_yds",
      "line": 245.5,
      "lean": "over" or "under",
      "confidence": 0.55-0.85,
      "evidence": [
        {"stat": "Season avg", "value": "267 yds/game", "impact": "supports"},
        {"stat": "vs this D", "value": "Opponent 28th in pass D", "impact": "supports"}
      ]
    }
  ],
  "dropped_props": [
    {"player": "Name", "reason": "Why dropped"}
  ],
  "gaps": ["Any missing data noted"]
}

Guidelines:
- Only keep props with strong evidence (2+ supporting factors)
- Boost confidence if multiple data points align
- Drop props with conflicting evidence
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

/**
 * Stage 3: Props Judge
 * Render final prop picks with full rationale
 */
async function runPropsJudgeStage({ gameSummary, investigation, playerProps }) {
  const systemPrompt = `
You are Stage 3 of the Gary Props Pipeline: "The Judge"

You render the final prop picks with complete rationale.

## YOUR TASK
1. Review the validated props from the Analyst
2. Select the TOP 3-5 best prop bets
3. Attach the actual odds from the prop lines
4. Write clear rationale for each pick

## RESPONSE FORMAT (STRICT JSON)
{
  "picks": [
    {
      "player": "Player Name",
      "team": "Team Name",
      "prop": "pass_yds 245.5",
      "line": 245.5,
      "bet": "over",
      "odds": -110,
      "confidence": 0.65-0.85,
      "rationale": "HYPOTHESIS: Expected to exceed line based on matchup. EVIDENCE: Averages 267 yds/game, opponent 28th in pass D. CONVERGENCE (0.72): Strong alignment between volume and matchup. IF WRONG: Game script goes run-heavy if leading big."
    }
  ]
}

Guidelines:
- Maximum 5 picks per game
- Confidence reflects estimated win probability
- Only pick props with odds better than -140
- Rationale must include HYPOTHESIS, EVIDENCE, CONVERGENCE, IF WRONG sections
- Calculate EV: if confidence > implied probability from odds, it's +EV
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
 * Calculate EV for a prop pick
 */
function calculateEV(confidence, odds) {
  // Convert American odds to decimal
  let decimalOdds;
  if (odds < 0) {
    decimalOdds = 1 + (100 / Math.abs(odds));
  } else {
    decimalOdds = 1 + (odds / 100);
  }
  
  // EV% = (confidence * decimalOdds - 1) * 100
  return Math.round(((confidence * decimalOdds) - 1) * 1000) / 10;
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
    sportLabel
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
    playerProps: context.playerProps
  });

  // Enhance picks with metadata
  const enhancedPicks = rawPicks.slice(0, propsPerGame).map(pick => {
    const ev = calculateEV(pick.confidence, pick.odds);
    return {
      ...pick,
      sport: sportLabel,
      time: formatGameTime(game.commence_time),
      ev,
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

  // Filter by confidence threshold
  const confidentPicks = enhancedPicks.filter(p => p.confidence >= 0.60);

  const elapsedMs = Date.now() - start;
  console.log(`[Agentic Props][${sportLabel}] Pipeline complete in ${elapsedMs}ms`);

  return {
    picks: confidentPicks,
    stage1,
    stage2,
    elapsedMs
  };
}

export default {
  runAgenticPropsPipeline
};
