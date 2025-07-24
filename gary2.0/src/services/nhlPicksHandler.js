import { oddsService } from './oddsService.js';
import { ballDontLieService } from './ballDontLieService.js';
import { makeGaryPick } from './garyEngine.js';
import { processGameOnce } from './picksService.js'; // Import shared helper

export async function generateNHLPicks() {
  console.log('Processing NHL games');
  const games = await oddsService.getUpcomingGames('icehockey_nhl');
  // Get today's date in EST time zone format (YYYY-MM-DD)
  const today = new Date();
  const estOptions = { timeZone: 'America/New_York' };
  const estDateString = today.toLocaleDateString('en-US', estOptions);
  const [month, day, year] = estDateString.split('/');
  const estFormattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  
  console.log(`NHL filtering: Today in EST is ${estFormattedDate}`);
  
  // Filter games by checking if they occur on the same day in EST
  const todayGames = games.filter(game => {
    const gameDate = new Date(game.commence_time);
    const gameDateInEST = gameDate.toLocaleDateString('en-US', estOptions);
    const [gameMonth, gameDay, gameYear] = gameDateInEST.split('/');
    const gameFormattedDate = `${gameYear}-${gameMonth.padStart(2, '0')}-${gameDay.padStart(2, '0')}`;
    
    console.log(`NHL Game: ${game.away_team} @ ${game.home_team}, Date: ${gameFormattedDate}, Include: ${gameFormattedDate === estFormattedDate}`);
    
    return gameFormattedDate === estFormattedDate;
  });

  console.log(`After date filtering: ${todayGames.length} NHL games for today`);

  const sportPicks = [];
  for (const game of todayGames) {
    const gameId = `nhl-${game.id}`;

    const result = await processGameOnce(gameId, async () => {
      console.log(`Processing NHL game: ${game.away_team} @ ${game.home_team}`);
      
      // Get comprehensive NHL playoff analysis using Ball Don't Lie API (2025 playoffs only)
      const playoffAnalysis = await ballDontLieService.getComprehensiveNhlPlayoffAnalysis(
        game.home_team,
        game.away_team
      );
      
      // Generate playoff stats report from Ball Don't Lie data
      let playoffStatsReport = `# NHL PLAYOFF REPORT: ${game.away_team} @ ${game.home_team}\n\n`;
      
      if (playoffAnalysis) {
        // Add series information if available
        if (playoffAnalysis.series?.seriesFound) {
          playoffStatsReport += `## Series Status: ${playoffAnalysis.series.seriesStatus}\n\n`;
        }
        
        // Add home team playoff stats
        if (playoffAnalysis.homeTeam?.stats?.length > 0) {
          playoffStatsReport += `## ${game.home_team} Top Playoff Performers:\n`;
          playoffAnalysis.homeTeam.stats.slice(0, 3).forEach(player => {
            playoffStatsReport += `- ${player.player.first_name} ${player.player.last_name}: ${player.avgGoals}G, ${player.avgAssists}A, ${player.avgPoints}P per game (${player.games} games)\n`;
            playoffStatsReport += `  +/- ${player.avgPlusMinus}, ${player.shootingPct}% shooting, ${player.avgTimeOnIce} min TOI\n`;
          });
          playoffStatsReport += '\n';
        }
        
        // Add away team playoff stats
        if (playoffAnalysis.awayTeam?.stats?.length > 0) {
          playoffStatsReport += `## ${game.away_team} Top Playoff Performers:\n`;
          playoffAnalysis.awayTeam.stats.slice(0, 3).forEach(player => {
            playoffStatsReport += `- ${player.player.first_name} ${player.player.last_name}: ${player.avgGoals}G, ${player.avgAssists}A, ${player.avgPoints}P per game (${player.games} games)\n`;
            playoffStatsReport += `  +/- ${player.avgPlusMinus}, ${player.shootingPct}% shooting, ${player.avgTimeOnIce} min TOI\n`;
          });
          playoffStatsReport += '\n';
        }
        
        // Add playoff context
        playoffStatsReport += `## 2025 Playoff Context:\n`;
        playoffStatsReport += `- Season: ${playoffAnalysis.season} (2024-25 NHL season)\n`;
        playoffStatsReport += `- Active playoff teams: ${playoffAnalysis.activePlayoffTeams?.length || 0}\n`;
        playoffStatsReport += `- Data source: Ball Don't Lie API (playoff games only)\n\n`;
      } else {
        playoffStatsReport += `Unable to retrieve comprehensive playoff data for this matchup.\n\n`;
      }
      
      // Get basic team info for context
      let homeStats = { name: game.home_team, conference: '?', division: '?' };
      let awayStats = { name: game.away_team, conference: '?', division: '?' };
      
      if (playoffAnalysis?.homeTeam?.teamData) {
          homeStats = {
          name: playoffAnalysis.homeTeam.teamData.full_name || game.home_team,
          conference: playoffAnalysis.homeTeam.teamData.conference || '?',
          division: playoffAnalysis.homeTeam.teamData.division || '?'
        };
      }
      
      if (playoffAnalysis?.awayTeam?.teamData) {
          awayStats = {
          name: playoffAnalysis.awayTeam.teamData.full_name || game.away_team,
          conference: playoffAnalysis.awayTeam.teamData.conference || '?',
          division: playoffAnalysis.awayTeam.teamData.division || '?'
        };
      }
      
      // PLAYOFFS ONLY - No regular season stats
      const nhlStatsReport = playoffStatsReport;

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
        isPlayoffGame: true, // Mark this as focusing on playoff stats
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
  
  return sportPicks;
} 