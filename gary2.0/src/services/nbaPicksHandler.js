import { oddsService } from './oddsService.js';
import { ballDontLieService } from './ballDontLieService.js';
import { makeGaryPick } from './garyEngine.js';
import { processGameOnce } from './picksService.js'; // Import shared helper

export async function generateNBAPicks(options = {}) {
  console.log('Processing NBA games');
  if (options.nocache) {
    console.log('NBA nocache mode: clearing Ball Don\'t Lie cache');
    ballDontLieService.clearCache();
  }
  const games = await oddsService.getUpcomingGames('basketball_nba');
  console.log(`Found ${games.length} NBA games from odds service`);
  
  // Get today's date in EST time zone format (YYYY-MM-DD)
  const today = new Date();
  const estOptions = { timeZone: 'America/New_York' };
  const estDateString = today.toLocaleDateString('en-US', estOptions);
  const [month, day, year] = estDateString.split('/');
  const estFormattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  
  console.log(`NBA filtering: Today in EST is ${estFormattedDate}`);
  
  // Be more flexible with date filtering - include games within next 24 hours
  const nowTime = today.getTime();
  const twentyFourHoursLater = nowTime + (24 * 60 * 60 * 1000);
  
  let todayGames = games.filter(game => {
    const gameTime = new Date(game.commence_time).getTime();
    const isWithin24Hours = gameTime >= nowTime && gameTime <= twentyFourHoursLater;
    
    // Also check if it's today or tomorrow in EST
    const gameDate = new Date(game.commence_time);
    const gameDateInEST = gameDate.toLocaleDateString('en-US', estOptions);
    const [gameMonth, gameDay, gameYear] = gameDateInEST.split('/');
    const gameFormattedDate = `${gameYear}-${gameMonth.padStart(2, '0')}-${gameDay.padStart(2, '0')}`;
    
    // Include games from today and tomorrow
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowString = tomorrow.toLocaleDateString('en-US', estOptions);
    const [tomorrowMonth, tomorrowDay, tomorrowYear] = tomorrowString.split('/');
    const tomorrowFormattedDate = `${tomorrowYear}-${tomorrowMonth.padStart(2, '0')}-${tomorrowDay.padStart(2, '0')}`;
    
    const isTodayOrTomorrow = gameFormattedDate === estFormattedDate || gameFormattedDate === tomorrowFormattedDate;
    const includeGame = isWithin24Hours || isTodayOrTomorrow;
    
    console.log(`NBA Game: ${game.away_team} @ ${game.home_team}, Date: ${gameFormattedDate}, Time: ${new Date(game.commence_time).toLocaleString('en-US', estOptions)}, Include: ${includeGame}`);
    
    return includeGame;
  });

  console.log(`After date filtering: ${todayGames.length} NBA games within next 24 hours or today/tomorrow`);

  // If options.onlyAtIndex is provided, process only that game
  if (typeof options.onlyAtIndex === 'number') {
    const idx = options.onlyAtIndex;
    todayGames = idx >= 0 && idx < todayGames.length ? [todayGames[idx]] : [];
  }

  const sportPicks = [];
  for (const game of todayGames) {
    const gameId = `nba-${game.id}`;

    const result = await processGameOnce(gameId, async () => {
      console.log(`🔄 PICK GENERATION STARTED: ${new Date().toISOString()}`);
      console.trace('Pick generation call stack');
      console.log(`Processing NBA game: ${game.away_team} @ ${game.home_team}`);

      // Resolve teams
      const nbaTeams = await ballDontLieService.getNbaTeams();
      const homeTeam = nbaTeams.find(t =>
        t.full_name.toLowerCase().includes(game.home_team.toLowerCase()) ||
        game.home_team.toLowerCase().includes(t.full_name.toLowerCase())
      );
      const awayTeam = nbaTeams.find(t =>
        t.full_name.toLowerCase().includes(game.away_team.toLowerCase()) ||
        game.away_team.toLowerCase().includes(t.full_name.toLowerCase())
      );

      let homeTeamInfo = null;
      let awayTeamInfo = null;
      try {
        if (homeTeam) {
          homeTeamInfo = {
            name: homeTeam.full_name,
            abbreviation: homeTeam.abbreviation,
            conference: homeTeam.conference,
            division: homeTeam.division
          };
        }
        if (awayTeam) {
          awayTeamInfo = {
            name: awayTeam.full_name,
            abbreviation: awayTeam.abbreviation,
            conference: awayTeam.conference,
            division: awayTeam.division
          };
        }
      } catch {}

      // Regular season context (no playoffs)
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();
      const season = month <= 6 ? year - 1 : year; // NBA season year label
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 21);
      const startStr = startDate.toISOString().slice(0, 10);
      const endStr = now.toISOString().slice(0, 10);

      const teamIds = [];
      if (homeTeam) teamIds.push(homeTeam.id);
      if (awayTeam) teamIds.push(awayTeam.id);

      // Fetch recent games and injuries (nocache via ttl=0)
      const [homeRecent, awayRecent, injuries] = await Promise.all([
        homeTeam ? ballDontLieService.getGames('basketball_nba', { seasons: [season], team_ids: [homeTeam.id], postseason: false, start_date: startStr, end_date: endStr, per_page: 50 }, options.nocache ? 0 : 10) : Promise.resolve([]),
        awayTeam ? ballDontLieService.getGames('basketball_nba', { seasons: [season], team_ids: [awayTeam.id], postseason: false, start_date: startStr, end_date: endStr, per_page: 50 }, options.nocache ? 0 : 10) : Promise.resolve([]),
        ballDontLieService.getInjuriesGeneric('basketball_nba', { team_ids: teamIds }, options.nocache ? 0 : 5)
      ]);

      // Build simple regular-season report
      let report = '\n## REGULAR SEASON CONTEXT:\n\n';
      report += `Season: ${season}-${season + 1}\n\n`;
      report += `Recent window: ${startStr} to ${endStr}\n\n`;
      report += `- ${game.home_team} recent games: ${Array.isArray(homeRecent) ? homeRecent.length : 0}\n`;
      report += `- ${game.away_team} recent games: ${Array.isArray(awayRecent) ? awayRecent.length : 0}\n\n`;
      if (Array.isArray(injuries) && injuries.length > 0) {
        report += `Injuries sample (${Math.min(5, injuries.length)} shown):\n`;
        injuries.slice(0, 5).forEach(inj => {
          const fn = inj?.player?.first_name || '';
          const ln = inj?.player?.last_name || '';
          report += `- ${fn} ${ln}: ${inj?.status || 'Unknown'} — ${inj?.description || ''}\n`;
        });
        report += '\n';
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
        sport: 'nba',
        league: 'NBA',
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        homeTeamStats: homeTeamInfo,
        awayTeamStats: awayTeamInfo,
        statsReport: report,
        playoffPlayerStats: null,
        seriesData: null,
        odds: oddsData,
        gameTime: game.commence_time,
        time: game.commence_time
      };

      console.log(`Making Gary pick for NBA game: ${game.away_team} @ ${game.home_team}`);
      const result = await makeGaryPick(gameObj);
      
      if (result.success) {
        console.log(`Successfully generated NBA pick: ${result.rawAnalysis?.rawOpenAIOutput?.pick || 'Unknown pick'}`);
        // Return the formatted pick data instead of adding to sportPicks here
        return {
          ...result,
          game: `${game.away_team} @ ${game.home_team}`,
          sport: 'basketball_nba',
          homeTeam: game.home_team,
          awayTeam: game.away_team,
          gameTime: game.commence_time,
          pickType: 'normal',
          timestamp: new Date().toISOString()
        };
      } else {
        console.log(`Failed to generate NBA pick for ${game.away_team} @ ${game.home_team}:`, result.error);
        return null;
      }
    });
    
    // Only add successful results to sportPicks (avoiding duplication)
    if (result && result.success) {
      sportPicks.push(result);
    }
  }
  
  console.log(`Total NBA picks generated: ${sportPicks.length}`);
  return sportPicks;
} 