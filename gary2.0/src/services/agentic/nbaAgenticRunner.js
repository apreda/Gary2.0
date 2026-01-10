import { buildNbaAgenticContext } from './nbaAgenticContext.js';
import { runHypothesisStage } from './hypothesisModule.js';
import { buildTokenPayload } from './agenticRouter.js';
import { runInvestigatorStage } from './investigatorModule.js';
import { runJudgeStage } from './judgeModule.js';
import { sanitizeTokenRequests } from './agenticTokens.js';

export async function runAgenticPipeline({ game, buildContext, sportLabel = 'Agentic', options = {} }) {
  if (typeof buildContext !== 'function') {
    throw new Error('buildContext function is required for runAgenticPipeline');
  }
  const start = Date.now();
  const context = await buildContext(game, options);
  const label = sportLabel || context.gameSummary.league || 'Agentic';

  console.log(`\n[Agentic][${label}] Stage 1: Hypothesis for ${context.gameSummary.matchup}`);
  const stage1 = await runHypothesisStage({
    gameSummary: context.gameSummary
  });
  const requestedTokens = sanitizeTokenRequests(stage1.requested_tokens, context.gameSummary.sport, 16);
  console.log(`[Agentic][${label}] Hypothesis:`, stage1.hypothesis);
  console.log(`[Agentic][${label}] Requested tokens:`, requestedTokens);

  console.log(`[Agentic][${label}] Stage 2: Investigator evaluating requested data`);
  const tokenPayload = buildTokenPayload(requestedTokens, context.tokenData, context.gameSummary.sport);
  const stage2 = await runInvestigatorStage({
    gameSummary: context.gameSummary,
    hypothesis: stage1,
    tokenPayload
  });
  console.log(`[Agentic][${label}] Evidence bullets:`, stage2.evidence);

  console.log(`[Agentic][${label}] Stage 3: Judge rendering final pick`);
  const stage3 = await runJudgeStage({
    gameSummary: context.gameSummary,
    hypothesis: stage1,
    investigation: stage2,
    oddsSummary: context.oddsSummary
  });

  const elapsedMs = Date.now() - start;
  return {
    context,
    stage1,
    stage2,
    stage3,
    elapsedMs
  };
}

export function runAgenticNbaPipeline(game, options = {}) {
  return runAgenticPipeline({
    game,
    buildContext: buildNbaAgenticContext,
    sportLabel: 'NBA',
    options
  });
}

