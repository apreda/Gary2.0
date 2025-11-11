import { oddsService } from './oddsService.js';
import { ballDontLieService } from './ballDontLieService.js';
import { computeRecommendedSportsbook } from './recommendedSportsbook.js';
import { perplexityService } from './perplexityService.js';
import { makeGaryPick } from './garyEngine.js';
import { processGameOnce } from './picksService.js'; // Import shared helper

export async function generateNHLPicks(options = {}) {
  console.log('Processing NHL games');
  if (options.nocache) {
    console.log('NHL nocache mode: clearing Ball Don\'t Lie cache');
    ballDontLieService.clearCache();
  }
  const games = await oddsService.getUpcomingGames('icehockey_nhl', { nocache: options.nocache === true });
  // Get today's date in EST time zone format (YYYY-MM-DD)
  const today = new Date();
  const estOptions = { timeZone: 'America/New_York' };
  const estDateString = today.toLocaleDateString('en-US', estOptions);
  const [month, day, year] = estDateString.split('/');
  const estFormattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  
  console.log(`NHL filtering: Today in EST is ${estFormattedDate}`);
  
  // Filter games by checking if they occur on the same day in EST
  let todayGames = games.filter(game => {
    const gameDate = new Date(game.commence_time);
    const gameDateInEST = gameDate.toLocaleDateString('en-US', estOptions);
    const [gameMonth, gameDay, gameYear] = gameDateInEST.split('/');
    const gameFormattedDate = `${gameYear}-${gameMonth.padStart(2, '0')}-${gameDay.padStart(2, '0')}`;
    
    console.log(`NHL Game: ${game.away_team} @ ${game.home_team}, Date: ${gameFormattedDate}, Include: ${gameFormattedDate === estFormattedDate}`);
    
    return gameFormattedDate === estFormattedDate;
  });

  console.log(`After date filtering: ${todayGames.length} NHL games for today`);

  // If options.onlyAtIndex is provided, process only that game
  if (typeof options.onlyAtIndex === 'number') {
    const idx = options.onlyAtIndex;
    todayGames = idx >= 0 && idx < todayGames.length ? [todayGames[idx]] : [];
  }

  const sportPicks = [];
  for (const game of todayGames) {
    const gameId = `nhl-${game.id}`;

    const result = await processGameOnce(gameId, async () => {
      console.log(`Processing NHL game: ${game.away_team} @ ${game.home_team}`);
      
      // Resolve teams via BDL NHL
      const homeTeam = await ballDontLieService.getTeamByNameGeneric('icehockey_nhl', game.home_team);
      const awayTeam = await ballDontLieService.getTeamByNameGeneric('icehockey_nhl', game.away_team);
      
      let homeStats = { name: game.home_team, conference: '?', division: '?' };
      let awayStats = { name: game.away_team, conference: '?', division: '?' };
      if (homeTeam) {
        homeStats = {
          name: homeTeam.full_name || game.home_team,
          conference: homeTeam.conference || homeTeam.conference_name || '?',
          division: homeTeam.division || homeTeam.division_name || '?'
        };
      }
      if (awayTeam) {
        awayStats = {
          name: awayTeam.full_name || game.away_team,
          conference: awayTeam.conference || awayTeam.conference_name || '?',
          division: awayTeam.division || awayTeam.division_name || '?'
        };
      }
      
      // Regular season window (last 21 days) and injuries if available
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();
      const season = month <= 6 ? year - 1 : year;
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 21);
      const startStr = startDate.toISOString().slice(0, 10);
      const endStr = now.toISOString().slice(0, 10);
      
      const teamIds = [];
      if (homeTeam?.id != null) teamIds.push(homeTeam.id);
      if (awayTeam?.id != null) teamIds.push(awayTeam.id);
      
      let injuries = [];
      try {
        injuries = await ballDontLieService.getInjuriesGeneric('icehockey_nhl', { team_ids: teamIds }, options.nocache ? 0 : 5);
      } catch {}
      let homeRecent = [];
      let awayRecent = [];
      try {
        homeRecent = homeTeam ? await ballDontLieService.getGames('icehockey_nhl', { seasons: [season], team_ids: [homeTeam.id], postseason: false, start_date: startStr, end_date: endStr, per_page: 50 }, options.nocache ? 0 : 10) : [];
        awayRecent = awayTeam ? await ballDontLieService.getGames('icehockey_nhl', { seasons: [season], team_ids: [awayTeam.id], postseason: false, start_date: startStr, end_date: endStr, per_page: 50 }, options.nocache ? 0 : 10) : [];
      } catch {}
      
      let nhlStatsReport = `\n## REGULAR SEASON CONTEXT (NHL):\n\n`;
      nhlStatsReport += `Season: ${season}-${season + 1}\n\n`;
      nhlStatsReport += `Recent window: ${startStr} to ${endStr}\n\n`;
      nhlStatsReport += `- ${game.home_team} recent games: ${Array.isArray(homeRecent) ? homeRecent.length : 0}\n`;
      nhlStatsReport += `- ${game.away_team} recent games: ${Array.isArray(awayRecent) ? awayRecent.length : 0}\n\n`;
      // Season aggregates (PP/PK/Shots rates)
      try {
        const [homePairs, awayPairs] = await Promise.all([
          homeTeam ? ballDontLieService.getTeamSeasonStats('icehockey_nhl', { teamId: homeTeam.id, season, postseason: false }) : Promise.resolve([]),
          awayTeam ? ballDontLieService.getTeamSeasonStats('icehockey_nhl', { teamId: awayTeam.id, season, postseason: false }) : Promise.resolve([])
        ]);
        const homeRates = ballDontLieService.deriveNhlTeamRates(homePairs);
        const awayRates = ballDontLieService.deriveNhlTeamRates(awayPairs);
        if (homeRates || awayRates) {
          nhlStatsReport += `Special Teams & Rates:\n`;
          nhlStatsReport += `- ${game.home_team} PP%: ${homeRates.ppPct ?? 'N/A'}, PK%: ${homeRates.pkPct ?? 'N/A'}, Shots/G: ${homeRates.shotsForPerGame ?? 'N/A'}, ShotsAga/G: ${homeRates.shotsAgainstPerGame ?? 'N/A'}\n`;
          nhlStatsReport += `- ${game.away_team} PP%: ${awayRates.ppPct ?? 'N/A'}, PK%: ${awayRates.pkPct ?? 'N/A'}, Shots/G: ${awayRates.shotsForPerGame ?? 'N/A'}, ShotsAga/G: ${awayRates.shotsAgainstPerGame ?? 'N/A'}\n\n`;
        }
      } catch {}
      if (Array.isArray(injuries) && injuries.length > 0) {
        nhlStatsReport += `Injuries sample (${Math.min(5, injuries.length)} shown):\n`;
        injuries.slice(0, 5).forEach(inj => {
          const fn = inj?.player?.first_name || '';
          const ln = inj?.player?.last_name || '';
          nhlStatsReport += `- ${fn} ${ln}: ${inj?.status || 'Unknown'} — ${inj?.description || ''}\n`;
        });
        nhlStatsReport += '\n';
      }

      // Format odds data for OpenAI
      let oddsData = null;
      if (game.bookmakers && game.bookmakers.length > 0) {
        const bookmaker = game.bookmakers[0];
        oddsData = {
          bookmaker: bookmaker.title,
          markets: bookmaker.markets
        };
        console.log(`Odds data available for ${game.home_team} vs ${game.away_team}:`, JSON.stringify(oddsData, null, 2));
      } else {
        console.log(`No odds data available for ${game.home_team} vs ${game.away_team}`);
      }

      // Model-vs-market edge using goals per game vs against if available
      let modelEdge = null;
      try {
        const spreadsMarket = oddsData?.markets?.find?.(m => m.key === 'spreads');
        const homeOutcome = spreadsMarket?.outcomes?.find?.(o => o.name === game.home_team);
        const marketSpread = typeof homeOutcome?.point === 'number' ? homeOutcome.point : null;
        // Fetch season rates again to compute edge (if not already in scope)
        const [homePairs2, awayPairs2] = await Promise.all([
          homeTeam ? ballDontLieService.getTeamSeasonStats('icehockey_nhl', { teamId: homeTeam.id, season, postseason: false }) : Promise.resolve([]),
          awayTeam ? ballDontLieService.getTeamSeasonStats('icehockey_nhl', { teamId: awayTeam.id, season, postseason: false }) : Promise.resolve([])
        ]);
        const homeRates2 = ballDontLieService.deriveNhlTeamRates(homePairs2);
        const awayRates2 = ballDontLieService.deriveNhlTeamRates(awayPairs2);
        if (marketSpread !== null &&
            typeof homeRates2.goalsForPerGame === 'number' &&
            typeof homeRates2.goalsAgainstPerGame === 'number' &&
            typeof awayRates2.goalsForPerGame === 'number' &&
            typeof awayRates2.goalsAgainstPerGame === 'number') {
          const expectedMargin = (homeRates2.goalsForPerGame - awayRates2.goalsAgainstPerGame) -
                                 (awayRates2.goalsForPerGame - homeRates2.goalsAgainstPerGame);
          const edge = expectedMargin - marketSpread;
          modelEdge = { expectedMargin: Number(expectedMargin.toFixed(2)), marketSpread, edge: Number(edge.toFixed(2)) };
        }
      } catch {}

      // Perplexity key findings
      let richKeyFindings = [];
      try {
        const dateStr = new Date(game.commence_time).toISOString().slice(0, 10);
        const rich = await perplexityService.getRichGameContext(game.home_team, game.away_team, 'nhl', dateStr);
        if (Array.isArray(rich?.key_findings)) {
          richKeyFindings = rich.key_findings.slice(0, 4);
        }
      } catch {}

      const gameObj = {
        id: gameId,
        sport: 'nhl',
        league: 'NHL',
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        teamStats: {
          homeRecent: Array.isArray(homeRecent) ? homeRecent : [],
          awayRecent: Array.isArray(awayRecent) ? awayRecent : []
        },
        gameContext: {
          injuries: Array.isArray(injuries) ? injuries : [],
          season,
          postseason: false,
          notes: 'Regular season context from BDL NHL',
          richKeyFindings
        },
        homeTeamStats: homeStats,
        awayTeamStats: awayStats,
        statsReport: nhlStatsReport,
        isPlayoffGame: false,
        modelEdge,
        odds: oddsData,
        gameTime: game.commence_time,
        time: game.commence_time
      };

      console.log(`Making Gary pick for NHL game: ${game.away_team} @ ${game.home_team}`);
      const result = await makeGaryPick(gameObj);
      
      if (result.success) {
        console.log(`Successfully generated NHL pick: ${result.rawAnalysis?.rawOpenAIOutput?.pick || 'Unknown pick'}`);
        // Recommend sportsbook
        try {
          const extract = result.rawAnalysis?.rawOpenAIOutput || result.pick || {};
          const rec = computeRecommendedSportsbook({
            pickType: (extract.type || '').toLowerCase(),
            pickStr: extract.pick || '',
            homeTeam: game.home_team,
            awayTeam: game.away_team,
            bookmakers: Array.isArray(game.bookmakers) ? game.bookmakers : []
          });
          if (rec) result.recommendedSportsbook = rec;
        } catch (e) {
          console.warn('Failed to compute recommended sportsbook (NHL):', e?.message || e);
        }
        // Return the formatted pick data instead of adding to sportPicks here
        return {
          ...result,
          game: `${game.away_team} @ ${game.home_team}`,
          sport: 'icehockey_nhl',
          homeTeam: game.home_team,
          awayTeam: game.away_team,
          gameTime: game.commence_time,
          pickType: 'normal',
          timestamp: new Date().toISOString()
        };
      } else {
        console.log(`Failed to generate NHL pick for ${game.away_team} @ ${game.home_team}:`, result.error);
        return null;
      }
    });
    
    // Only add successful results to sportPicks (avoiding duplication)
    if (result && result.success) {
      sportPicks.push(result);
    }
  }
  
  console.log(`Total NHL picks generated: ${sportPicks.length}`);
  return sportPicks;
} 