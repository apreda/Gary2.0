/**
 * Combined MLB Service
 * This service combines data from all three data sources:
 * 1. Ball Don't Lie API for team stats (PRIORITY 1)
 * 2. MLB Stats API for pitcher data (PRIORITY 2)
 * 3. Perplexity for game context, storylines, and other relevant data
 */
import { ballDontLieService } from './ballDontLieService.js';
import { mlbStatsApiService } from './mlbStatsApiService.enhanced.js';
import { perplexityService } from './perplexityService.js';
import { oddsService } from './oddsService.js';

const combinedMlbService = {
  /**
   * Gets comprehensive game data using the best sources for each type of data
   * - Team stats and standings from Ball Don't Lie API
   * - Starting pitcher data from MLB Stats API
   * @param {string} homeTeamName - Home team name
   * @param {string} awayTeamName - Away team name
   * @param {string} date - Optional date in YYYY-MM-DD format
   * @returns {Promise<Object>} - Comprehensive game data
   */
  getComprehensiveGameData: async (homeTeamName, awayTeamName, date = new Date().toISOString().slice(0, 10)) => {
    console.log(`[Combined MLB Service] Getting comprehensive data for ${awayTeamName} @ ${homeTeamName}`);
    
    try {
      // 1. Get games for the specified date from MLB Stats API for game IDs
      const games = await mlbStatsApiService.getGamesByDate(date);
      
      // 2. Find the target game
      let targetGame = null;
      for (const game of games) {
        const homeTeam = game.teams.home.team.name;
        const awayTeam = game.teams.away.team.name;
        
        if ((homeTeam.includes(homeTeamName) || homeTeamName.includes(homeTeam)) && 
            (awayTeam.includes(awayTeamName) || awayTeamName.includes(awayTeam))) {
          targetGame = game;
          break;
        }
      }
      
      if (!targetGame) {
        console.log(`[Combined MLB Service] Game not found: ${awayTeamName} @ ${homeTeamName}`);
        // Fall back to Ball Don't Lie service if game not found
        return ballDontLieService.getComprehensiveMlbGameStats(homeTeamName, awayTeamName);
      }
      
      console.log(`[Combined MLB Service] Found game: ${awayTeamName} @ ${homeTeamName} (ID: ${targetGame.gamePk})`);
      
      // 3. Get team comparison stats from Ball Don't Lie API
      const teamComparisonStats = await ballDontLieService.getMlbTeamComparisonStats(homeTeamName, awayTeamName);
      
      // 4. Get accurate starting pitcher data from MLB Stats API
      const startingPitchers = await mlbStatsApiService.getStartingPitchersEnhanced(targetGame.gamePk);
      
      // 5. Get rich game context from Perplexity
      let gameContext = null;
      try {
        console.log(`[Combined MLB Service] Getting game context from Perplexity for ${awayTeamName} @ ${homeTeamName}`);
        const contextQuery = `Provide a concise summary of the upcoming MLB game between ${homeTeamName} and ${awayTeamName} with the following information in JSON format:
1. Playoff status (is this a playoff game, and if so what's the current series score)
2. Team storylines and recent news
3. Injury report for both teams
4. Key matchup insights
5. Betting trends and relevant statistics
6. Weather conditions for the game if outdoors

Format your response in clean JSON format with these exact keys: playoffStatus, homeTeamStorylines, awayTeamStorylines, injuryReport, keyMatchups, bettingTrends, weatherConditions.`;
        
        const gameContextResult = await perplexityService.search(contextQuery);
        
        if (gameContextResult && gameContextResult.success && gameContextResult.data) {
          // Try to extract JSON from the response
          const text = gameContextResult.data;
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          
          if (jsonMatch) {
            try {
              gameContext = JSON.parse(jsonMatch[0]);
              console.log(`[Combined MLB Service] Successfully retrieved game context from Perplexity`);
            } catch (e) {
              console.error(`[Combined MLB Service] Error parsing game context JSON:`, e.message);
            }
          } else {
            // No JSON found, use the raw text
            gameContext = { rawContext: text };
          }
        } else {
          console.log(`[Combined MLB Service] No game context available from Perplexity`);
        }
      } catch (perplexityError) {
        console.error(`[Combined MLB Service] Error getting game context from Perplexity:`, perplexityError.message);
      }
      
      // 6. Get odds data from The Odds API
      let oddsData = null;
      try {
        console.log(`[Combined MLB Service] Getting odds data for ${awayTeamName} @ ${homeTeamName}`);
        const mlbGames = await oddsService.getUpcomingGames('baseball_mlb');
        
        // Find the matching game in odds data
        const matchingGame = mlbGames.find(game => {
          return (game.home_team.includes(homeTeamName) || homeTeamName.includes(game.home_team)) && 
                 (game.away_team.includes(awayTeamName) || awayTeamName.includes(game.away_team));
        });
        
        if (matchingGame) {
          console.log(`[Combined MLB Service] Found odds data for ${awayTeamName} @ ${homeTeamName}`);
          oddsData = matchingGame;
        } else {
          console.log(`[Combined MLB Service] No odds data found for ${awayTeamName} @ ${homeTeamName}`);
        }
      } catch (oddsError) {
        console.error(`[Combined MLB Service] Error getting odds data:`, oddsError.message);
      }
      
      // 7. Combine and structure all the data
      const combinedData = {
        game: {
          homeTeam: homeTeamName,
          awayTeam: awayTeamName,
          gameDate: targetGame.gameDate,
          gameTime: new Date(targetGame.gameDate).toLocaleTimeString(),
          venue: targetGame.venue.name,
          status: targetGame.status.detailedState,
          gamePk: targetGame.gamePk
        },
        pitchers: {
          home: startingPitchers?.home || null,
          away: startingPitchers?.away || null
        },
        teamStats: teamComparisonStats,
        gameContext: gameContext,
        odds: oddsData
      };
      
      return combinedData;
    } catch (error) {
      console.error(`[Combined MLB Service] Error getting comprehensive data:`, error.message);
      // Fall back to Ball Don't Lie service in case of error
      console.log(`[Combined MLB Service] Falling back to Ball Don't Lie service`);
      return ballDontLieService.getComprehensiveMlbGameStats(homeTeamName, awayTeamName);
    }
  },
  
  /**
   * Generates an enhanced game preview with accurate starting pitcher information
   * @param {string} homeTeamName - Home team name
   * @param {string} awayTeamName - Away team name
   * @param {string} date - Optional date in YYYY-MM-DD format
   * @returns {Promise<string>} - Game preview text
   */
  generateEnhancedGamePreview: async (homeTeamName, awayTeamName, date = new Date().toISOString().slice(0, 10)) => {
    try {
      console.log(`[Combined MLB Service] Generating enhanced game preview for ${awayTeamName} @ ${homeTeamName}`);
      
      // Get comprehensive data
      const gameData = await combinedMlbService.getComprehensiveGameData(homeTeamName, awayTeamName, date);
      
      // Structure for readability
      const homePitcher = gameData.pitchers.home;
      const awayPitcher = gameData.pitchers.away;
      const homeTeamStats = gameData.teamStats.homeTeam;
      const awayTeamStats = gameData.teamStats.awayTeam;
      
      // Generate the preview text
      let previewText = `${awayTeamName} @ ${homeTeamName} | ${new Date(gameData.game.gameDate).toLocaleDateString()} ${gameData.game.gameTime}\n\n`;
      
      // Add pitcher matchup if available
      if (homePitcher && awayPitcher) {
        const homeERA = homePitcher.seasonStats?.era || 'N/A';
        const homeRecord = `${homePitcher.seasonStats?.wins || 0}-${homePitcher.seasonStats?.losses || 0}`;
        const awayERA = awayPitcher.seasonStats?.era || 'N/A';
        const awayRecord = `${awayPitcher.seasonStats?.wins || 0}-${awayPitcher.seasonStats?.losses || 0}`;
        
        previewText += `PITCHING MATCHUP:\n`;
        previewText += `${awayTeamName}: ${awayPitcher.fullName} (${awayRecord}, ${awayERA} ERA)\n`;
        previewText += `${homeTeamName}: ${homePitcher.fullName} (${homeRecord}, ${homeERA} ERA)\n\n`;
      }
      
      // Add team stats
      previewText += `TEAM COMPARISON:\n`;
      
      // Batting stats
      previewText += `BATTING:\n`;
      if (homeTeamStats.battingAvg && awayTeamStats.battingAvg) {
        previewText += `AVG: ${awayTeamName} ${awayTeamStats.battingAvg} | ${homeTeamName} ${homeTeamStats.battingAvg}\n`;
      }
      if (homeTeamStats.ops && awayTeamStats.ops) {
        previewText += `OPS: ${awayTeamName} ${awayTeamStats.ops} | ${homeTeamName} ${homeTeamStats.ops}\n`;
      }
      if (homeTeamStats.runsPerGame && awayTeamStats.runsPerGame) {
        previewText += `R/G: ${awayTeamName} ${awayTeamStats.runsPerGame} | ${homeTeamName} ${homeTeamStats.runsPerGame}\n`;
      }
      
      // Pitching stats (team overall)
      previewText += `\nPITCHING:\n`;
      if (homeTeamStats.bullpenEra && awayTeamStats.bullpenEra) {
        previewText += `Bullpen ERA: ${awayTeamName} ${awayTeamStats.bullpenEra} | ${homeTeamName} ${homeTeamStats.bullpenEra}\n`;
      }
      
      // Record and standings
      if (homeTeamStats.record && awayTeamStats.record) {
        previewText += `\nRECORD:\n`;
        previewText += `${awayTeamName}: ${awayTeamStats.record}\n`;
        previewText += `${homeTeamName}: ${homeTeamStats.record}\n`;
      }
      
      // Home/Away specific records
      if (homeTeamStats.homeRecord && awayTeamStats.awayRecord) {
        previewText += `\n${homeTeamName} Home: ${homeTeamStats.homeRecord}\n`;
        previewText += `${awayTeamName} Away: ${awayTeamStats.awayRecord}\n`;
      }
      
      // Recent form
      if (homeTeamStats.recentForm && awayTeamStats.recentForm) {
        previewText += `\nRECENT FORM (Last 10):\n`;
        previewText += `${awayTeamName}: ${awayTeamStats.recentForm}\n`;
        previewText += `${homeTeamName}: ${homeTeamStats.recentForm}\n`;
      }
      
      return previewText;
    } catch (error) {
      console.error(`[Combined MLB Service] Error generating enhanced game preview:`, error.message);
      // Fall back to Ball Don't Lie service in case of error
      console.log(`[Combined MLB Service] Falling back to Ball Don't Lie service for game preview`);
      return ballDontLieService.generateMlbGamePreview(homeTeamName, awayTeamName);
    }
  }
};

export { combinedMlbService };
