import { oddsService } from './oddsService.js';
import { ballDontLieService } from './ballDontLieService.js';
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

      const gameObj = {
        id: gameId,
        sport: 'nhl',
        league: 'NHL',
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        homeTeamStats: homeStats,
        awayTeamStats: awayStats,
        statsReport: nhlStatsReport,
        isPlayoffGame: false,
        odds: oddsData,
        gameTime: game.commence_time,
        time: game.commence_time
      };

      console.log(`Making Gary pick for NHL game: ${game.away_team} @ ${game.home_team}`);
      const result = await makeGaryPick(gameObj);
      
      if (result.success) {
        console.log(`Successfully generated NHL pick: ${result.rawAnalysis?.rawOpenAIOutput?.pick || 'Unknown pick'}`);
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