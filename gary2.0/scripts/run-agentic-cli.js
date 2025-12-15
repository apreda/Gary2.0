import 'dotenv/config';
import { oddsService } from '../src/services/oddsService.js';
import picksService, { logAgenticRun, storeWeeklyNFLPicks } from '../src/services/picksService.js';
import { runAgenticPipeline } from '../src/services/agentic/nbaAgenticRunner.js';

const defaultArgv = process.argv.slice(2);

/**
 * Extract statsData from agentic context tokenData for iOS Tale of the Tape display
 * Formats stats into iOS-compatible structure with token, home, and away objects
 */
function extractStatsDataFromContext(context, sportKey) {
  const statsData = [];
  const tokenData = context?.tokenData;
  const homeTeam = context?.gameSummary?.homeTeam || context?.meta?.homeTeam?.full_name || '';
  const awayTeam = context?.gameSummary?.awayTeam || context?.meta?.awayTeam?.full_name || '';
  
  if (!tokenData) return statsData;
  
  // Helper to format a number for display
  const fmt = (val, suffix = '') => {
    if (val === null || val === undefined) return null;
    if (typeof val === 'number') {
      return val % 1 === 0 ? `${val}${suffix}` : `${val.toFixed(1)}${suffix}`;
    }
    return String(val);
  };
  
  // Helper to check if a stat has valid data
  const hasValidData = (home, away) => {
    const homeVals = Object.values(home || {}).filter(v => v !== null && v !== undefined && v !== 'N/A');
    const awayVals = Object.values(away || {}).filter(v => v !== null && v !== undefined && v !== 'N/A');
    return homeVals.length > 0 && awayVals.length > 0;
  };
  
  // NFL-specific stats mapping
  if (sportKey === 'americanfootball_nfl') {
    // Success Rate -> Third/Fourth Down %
    if (tokenData.success_rate && hasValidData(tokenData.success_rate.home, tokenData.success_rate.away)) {
      const h = tokenData.success_rate.home;
      const a = tokenData.success_rate.away;
      if (h.thirdDownPct !== null && a.thirdDownPct !== null) {
        statsData.push({
          token: 'THIRD_DOWN',
          home: { thirdDownPct: fmt(h.thirdDownPct, '%'), team: homeTeam },
          away: { thirdDownPct: fmt(a.thirdDownPct, '%'), team: awayTeam }
        });
      }
      if (h.fourthDownPct !== null && a.fourthDownPct !== null) {
        statsData.push({
          token: 'FOURTH_DOWN',
          home: { fourthDownPct: fmt(h.fourthDownPct, '%'), team: homeTeam },
          away: { fourthDownPct: fmt(a.fourthDownPct, '%'), team: awayTeam }
        });
      }
    }
    
    // Explosiveness -> Points/Game
    if (tokenData.explosiveness && hasValidData(tokenData.explosiveness.home, tokenData.explosiveness.away)) {
      const h = tokenData.explosiveness.home;
      const a = tokenData.explosiveness.away;
      if (h.pointsPerGame !== null && a.pointsPerGame !== null) {
        statsData.push({
          token: 'EPA_LAST_5',
          home: { pointsPerGame: fmt(h.pointsPerGame), team: homeTeam },
          away: { pointsPerGame: fmt(a.pointsPerGame), team: awayTeam }
        });
      }
      if (h.yardsPerPlay !== null && a.yardsPerPlay !== null) {
        statsData.push({
          token: 'SUCCESS_RATE',
          home: { totalYardsPerGame: fmt(h.yardsPerPlay), team: homeTeam },
          away: { totalYardsPerGame: fmt(a.yardsPerPlay), team: awayTeam }
        });
      }
    }
    
    // Turnover Luck
    if (tokenData.turnover_luck && hasValidData(tokenData.turnover_luck.home, tokenData.turnover_luck.away)) {
      const h = tokenData.turnover_luck.home;
      const a = tokenData.turnover_luck.away;
      if (h.turnoverDiff !== null && a.turnoverDiff !== null) {
        statsData.push({
          token: 'TURNOVER_MARGIN',
          home: { turnoverDiff: h.turnoverDiff >= 0 ? `+${h.turnoverDiff}` : `${h.turnoverDiff}`, team: homeTeam },
          away: { turnoverDiff: a.turnoverDiff >= 0 ? `+${a.turnoverDiff}` : `${a.turnoverDiff}`, team: awayTeam }
        });
      }
    }
    
    // Recent Form
    if (tokenData.recent_form) {
      const h = tokenData.recent_form.home;
      const a = tokenData.recent_form.away;
      if (h?.last5 && a?.last5) {
        statsData.push({
          token: 'RECENT_FORM',
          home: { last5: h.last5, team: homeTeam },
          away: { last5: a.last5, team: awayTeam }
        });
      }
    }
    
    // Market Snapshot for Record
    if (context?.meta?.records) {
      const records = context.meta.records;
      if (records.home && records.away && records.home !== 'N/A' && records.away !== 'N/A') {
        statsData.push({
          token: 'PACE_HOME_AWAY',
          home: { overall: records.home, team: homeTeam },
          away: { overall: records.away, team: awayTeam }
        });
      }
    }
  }
  
  // NBA-specific stats mapping
  if (sportKey === 'basketball_nba') {
    if (tokenData.efficiency) {
      const h = tokenData.efficiency.home || {};
      const a = tokenData.efficiency.away || {};
      
      if (h.offRating !== null && a.offRating !== null) {
        statsData.push({
          token: 'OFFENSIVE_RATING',
          home: { offensiveRating: fmt(h.offRating), team: homeTeam },
          away: { offensiveRating: fmt(a.offRating), team: awayTeam }
        });
      }
      if (h.defRating !== null && a.defRating !== null) {
        statsData.push({
          token: 'DEFENSIVE_RATING',
          home: { defensiveRating: fmt(h.defRating), team: homeTeam },
          away: { defensiveRating: fmt(a.defRating), team: awayTeam }
        });
      }
      if (h.netRating !== null && a.netRating !== null) {
        statsData.push({
          token: 'NET_RATING',
          home: { netRating: fmt(h.netRating), team: homeTeam },
          away: { netRating: fmt(a.netRating), team: awayTeam }
        });
      }
    }
    
    if (tokenData.pace) {
      const h = tokenData.pace.home || {};
      const a = tokenData.pace.away || {};
      if (h.pace !== null && a.pace !== null) {
        statsData.push({
          token: 'PACE',
          home: { pace: fmt(h.pace), team: homeTeam },
          away: { pace: fmt(a.pace), team: awayTeam }
        });
      }
    }
    
    if (tokenData.four_factors) {
      const h = tokenData.four_factors.home || {};
      const a = tokenData.four_factors.away || {};
      if (h.efgPct !== null && a.efgPct !== null) {
        statsData.push({
          token: 'EFG_PCT',
          home: { efgPct: fmt(h.efgPct, '%'), team: homeTeam },
          away: { efgPct: fmt(a.efgPct, '%'), team: awayTeam }
        });
      }
    }
  }
  
  return statsData;
}

/**
 * Extract injuries from agentic context for iOS display
 */
function extractInjuriesFromContext(context) {
  const injuries = context?.tokenData?.injury_report?.notable || [];
  if (!injuries.length) return null;
  
  const homeTeam = context?.gameSummary?.homeTeam || '';
  const awayTeam = context?.gameSummary?.awayTeam || '';
  
  const homeInjuries = injuries.filter(i => i.team?.includes(homeTeam) || homeTeam.includes(i.team));
  const awayInjuries = injuries.filter(i => i.team?.includes(awayTeam) || awayTeam.includes(i.team));
  
  return {
    home: homeInjuries.map(i => ({
      player: i.player,
      status: i.status,
      description: i.description
    })),
    away: awayInjuries.map(i => ({
      player: i.player,
      status: i.status,
      description: i.description
    }))
  };
}

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
  let skippedForData = 0;
  for (const game of filtered) {
    try {
      // For NCAAB, pre-check data quality before running full pipeline
      if (sportKey === 'basketball_ncaab') {
        try {
          const preContext = await buildContext(game, { nocache });
          const dataQuality = preContext?.meta?.dataQuality;
          if (dataQuality && !dataQuality.bothTeamsHaveData) {
            console.log(`⏭️ Skipping ${game.away_team} @ ${game.home_team} - insufficient stats data`);
            skippedForData++;
            continue;
          }
        } catch (preErr) {
          console.warn(`⚠️ Pre-check failed for ${game.away_team} @ ${game.home_team}:`, preErr.message);
          // Continue to try the full pipeline anyway
        }
      }
      
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

      // Extract statsData from tokenData (same logic as run-agentic-picks.js)
      const statsData = extractStatsDataFromContext(result.context, sportKey);
      
      // Extract injuries from context
      const injuries = extractInjuriesFromContext(result.context);
      
      finalPicks.push({
        ...result.stage3,
        sport: sportKey,
        // Ensure game info is included for storage
        homeTeam: result.stage3.homeTeam || game.home_team,
        awayTeam: result.stage3.awayTeam || game.away_team,
        commence_time: result.stage3.commence_time || game.commence_time,
        gameTime: result.stage3.gameTime || game.commence_time,
        // Include stats for iOS Tale of the Tape display
        statsData: statsData,
        statsUsed: statsData.map(s => s.token),
        injuries: injuries,
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

  if (skippedForData > 0) {
    console.log(`📊 Skipped ${skippedForData} game(s) due to insufficient stats data`);
  }

  if (shouldStore && finalPicks.length > 0) {
    // NFL picks go to weekly_nfl_picks table (no confidence filter)
    // Other sports go to daily_picks
    const nflPicks = finalPicks.filter(p => p.sport === 'americanfootball_nfl');
    const otherPicks = finalPicks.filter(p => p.sport !== 'americanfootball_nfl');
    
    if (nflPicks.length > 0) {
      console.log(`🗄️ Storing ${nflPicks.length} NFL pick(s) into weekly_nfl_picks...`);
      // Transform picks to the format expected by storeWeeklyNFLPicks
      const nflPicksForStorage = nflPicks.map(pick => ({
        homeTeam: pick.homeTeam,
        awayTeam: pick.awayTeam,
        pick: pick.pick,
        pickTeam: pick.pickTeam,
        betType: pick.betType || pick.bet_type,
        line: pick.line,
        odds: pick.odds,
        confidence: pick.confidence,
        rationale: pick.rationale,
        gameTime: pick.gameTime || pick.commence_time,
        commence_time: pick.commence_time || pick.gameTime, // iOS app uses this for time display
        league: 'NFL', // IMPORTANT: iOS app filters by league
        source: 'agentic',
        // CRITICAL: Include stats for iOS Tale of the Tape display
        statsData: pick.statsData || [],
        statsUsed: pick.statsUsed || [],
        injuries: pick.injuries || null,
        rawAnalysis: pick.rawAnalysis
      }));
      const nflResult = await storeWeeklyNFLPicks(nflPicksForStorage);
      if (nflResult.success) {
        console.log(`✅ NFL picks stored: ${nflResult.count} new, ${nflResult.total} total this week`);
      } else {
        console.error('❌ Failed to store NFL picks:', nflResult.error || nflResult.message);
      }
    }
    
    if (otherPicks.length > 0) {
      console.log(`🗄️ Storing ${otherPicks.length} pick(s) into daily_picks...`);
      await picksService.storeDailyPicksInDatabase(otherPicks);
    }
  } else {
    console.log('ℹ️ Storage skipped. Pass --store=1 to insert into daily_picks/weekly_nfl_picks.');
  }

  console.log(`🏁 Agentic ${leagueLabel} runner complete. Generated ${finalPicks.length} pick(s).`);
}

