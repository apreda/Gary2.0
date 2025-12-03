import 'dotenv/config';
import { oddsService } from '../src/services/oddsService.js';
import picksService, { logAgenticRun } from '../src/services/picksService.js';
import { runAgenticPipeline } from '../src/services/agentic/nbaAgenticRunner.js';

const defaultArgv = process.argv.slice(2);

export function parseArgs(argv = defaultArgv) {
  return argv.reduce((acc, arg) => {
    const [key, value] = arg.split('=');
    if (!key) return acc;
    const normalizedKey = key.replace(/^--/, '');
    acc[normalizedKey] = value ?? true;
    return acc;
  }, {});
}

export async function runAgenticCli({
  sportKey,
  leagueLabel,
  buildContext,
  windowHours = 16,
  limitDefault = 3
}) {
  if (!sportKey || !buildContext) {
    throw new Error('runAgenticCli requires sportKey and buildContext');
  }

  const args = parseArgs();
  const limit = Number.parseInt(args.limit || process.env.AGENTIC_LIMIT || String(limitDefault), 10);
  const nocache = args.nocache === '1' || args.nocache === 'true';
  const shouldStore = args.store === '1' || args.store === 'true' || process.env.AGENTIC_STORE === '1';

  console.log(`🔁 Agentic ${leagueLabel} runner starting...`);
  const games = await oddsService.getUpcomingGames(sportKey, { nocache });
  const now = Date.now();
  const windowMs = windowHours ? windowHours * 60 * 60 * 1000 : null;

  const filtered = games
    .filter((game) => {
      const tip = new Date(game.commence_time).getTime();
      if (Number.isNaN(tip) || tip <= now) return false;
      if (windowMs != null) {
        return tip <= now + windowMs;
      }
      return true;
    })
    .sort((a, b) => new Date(a.commence_time) - new Date(b.commence_time))
    .slice(0, Math.max(limit, 1));

  console.log(`Found ${filtered.length} ${leagueLabel} games to process (limit=${limit}).`);

  const finalPicks = [];
  for (const game of filtered) {
    try {
      const result = await runAgenticPipeline({
        game,
        buildContext,
        sportLabel: leagueLabel,
        options: { nocache }
      });

      const redTeamLine = (result.stage3?.rationale || '')
        .split('\n')
        .find((line) => line.trim().toUpperCase().startsWith('IF WRONG'));

      await logAgenticRun({
        sport: sportKey,
        gameId: result.context.gameSummary.gameId,
        homeTeam: result.context.gameSummary.homeTeam,
        awayTeam: result.context.gameSummary.awayTeam,
        gameTime: game.commence_time,
        oddsSnapshot: result.context.oddsSummary,
        stage1Summary: {
          hypothesis: result.stage1.hypothesis,
          requested_tokens: result.stage1.requested_tokens,
          preliminary_lean: result.stage1.preliminary_lean
        },
        stage2Summary: {
          lean: result.stage2.lean,
          confidence: result.stage2.confidence,
          evidence: result.stage2.evidence,
          gaps: result.stage2.gaps
        },
        finalPick: result.stage3,
        convergence: typeof result.stage3?.confidence === 'number' ? result.stage3.confidence : null,
        redTeamNote: redTeamLine || null,
        elapsedMs: result.elapsedMs,
        runnerVersion: process.env.AGENTIC_RUNNER_VERSION || 'v1'
      });

      finalPicks.push({
        ...result.stage3,
        sport: sportKey,
        rawAnalysis: {
          stage1: result.stage1,
          stage2: result.stage2,
          rawOpenAIOutput: result.stage3
        }
      });

      console.log(`✅ Agentic pick generated: ${result.stage3.pick}`);
    } catch (error) {
      console.error(`❌ Agentic pipeline failed for ${game.away_team} @ ${game.home_team}`, error);
    }
  }

  if (shouldStore && finalPicks.length > 0) {
    console.log('🗄️ Storing agentic picks into daily_picks...');
    await picksService.storeDailyPicksInDatabase(finalPicks);
  } else {
    console.log('ℹ️ Storage skipped. Pass --store=1 to insert into daily_picks.');
  }

  console.log(`🏁 Agentic ${leagueLabel} runner complete.`);
}

