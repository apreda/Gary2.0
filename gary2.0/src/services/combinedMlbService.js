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
   * @param {string} homeTeamName - Home team name
   * @param {string} awayTeamName - Away team name
   * @param {string} date - Optional date in YYYY-MM-DD format
   * @returns {Promise<Object>} - Comprehensive game data
   */
  getComprehensiveGameData: async (homeTeamName, awayTeamName, date = new Date().toISOString().slice(0, 10)) => {
    console.log(`[Combined MLB Service] Getting comprehensive data for ${awayTeamName} @ ${homeTeamName}`);

    try {
      // 1. Get games for the specified date from MLB Stats API
      const games = await mlbStatsApiService.getGamesByDate(date);

      if (!Array.isArray(games) || games.length === 0) {
        console.log(`[Combined MLB Service] No games found for date ${date}, falling back to Ball Don't Lie`);
        return ballDontLieService.getComprehensiveMlbGameStats(homeTeamName, awayTeamName);
      }

      // 2. Find the target game
      let targetGame = null;
      for (const game of games) {
        if (!game?.teams?.home?.team?.name || !game?.teams?.away?.team?.name) continue;
        const homeTeam = game.teams.home.team.name;
        const awayTeam = game.teams.away.team.name;

        if (
          (homeTeam.includes(homeTeamName) || homeTeamName.includes(homeTeam)) &&
          (awayTeam.includes(awayTeamName) || awayTeamName.includes(awayTeam))
        ) {
          targetGame = game;
          break;
        }
      }

      if (!targetGame) {
        console.log(`[Combined MLB Service] Game not found, falling back to Ball Don't Lie`);
        return ballDontLieService.getComprehensiveMlbGameStats(homeTeamName, awayTeamName);
      }

      // 3. Get team comparison stats from Ball Don't Lie API
      let teamComparisonStats;
      try {
        teamComparisonStats = await ballDontLieService.getMlbTeamComparisonStats(homeTeamName, awayTeamName);
        if (!teamComparisonStats?.homeTeam || !teamComparisonStats?.awayTeam) {
          teamComparisonStats = {
            homeTeam: { teamName: homeTeamName, wins: 0, losses: 0 },
            awayTeam: { teamName: awayTeamName, wins: 0, losses: 0 }
          };
        }
      } catch {
        teamComparisonStats = {
          homeTeam: { teamName: homeTeamName, wins: 0, losses: 0 },
          awayTeam: { teamName: awayTeamName, wins: 0, losses: 0 }
        };
      }

      // 4. Get starting pitcher data
      let startingPitchers;
      try {
        startingPitchers = await mlbStatsApiService.getStartingPitchersEnhanced(targetGame.gamePk);
        if (!startingPitchers?.home && !startingPitchers?.away) {
          startingPitchers = { home: null, away: null };
        }
      } catch {
        startingPitchers = { home: null, away: null };
      }

      // 5. Get top hitter stats
      let hitterStats = { home: [], away: [] };
      try {
        const boxHitterStats = await mlbStatsApiService.getHitterStats(targetGame.gamePk);

        if (boxHitterStats?.home?.length || boxHitterStats?.away?.length) {
          hitterStats = boxHitterStats;
        } else {
          // Fall back to roster stats
          const homeTeamId = targetGame.teams.home.team.id;
          const awayTeamId = targetGame.teams.away.team.id;
          const homeRoster = await mlbStatsApiService.getTeamRosterWithStats(homeTeamId);
          const awayRoster = await mlbStatsApiService.getTeamRosterWithStats(awayTeamId);

          const formatRosterStats = (roster, teamName) => {
            if (!roster?.hitters) return [];
            return roster.hitters
              .sort((a, b) => parseFloat(b.stats?.avg || 0) - parseFloat(a.stats?.avg || 0))
              .slice(0, 5)
              .map(player => ({
                id: player.id || 0,
                name: player.name || 'Unknown Player',
                position: player.position || '',
                team: teamName,
                stats: {
                  hits: player.stats?.hits || 0,
                  rbi: player.stats?.rbi || 0,
                  homeRuns: player.stats?.homeRuns || 0,
                  runs: player.stats?.runs || 0,
                  atBats: player.stats?.atBats || 0,
                  avg: player.stats?.avg || '.000',
                  totalBases: player.stats?.totalBases || 0,
                  strikeouts: player.stats?.strikeouts || 0,
                  walks: player.stats?.walks || 0
                }
              }));
          };

          hitterStats = {
            home: formatRosterStats(homeRoster, targetGame.teams.home.team.name),
            away: formatRosterStats(awayRoster, targetGame.teams.away.team.name)
          };
        }
      } catch {
        hitterStats = { home: [], away: [] };
      }

      // 6. Get game context from Perplexity
      let gameContext = {};
      try {
        const contextQuery = `Provide a concise summary of the upcoming MLB game between ${homeTeamName} and ${awayTeamName} with the following information in JSON format:
1. Playoff status
2. Team storylines and recent news
3. Injury report for both teams
4. Key matchup insights
5. Betting trends and relevant statistics
6. Weather conditions`;

        const gameContextResult = await perplexityService.search(contextQuery);
        if (gameContextResult?.success && gameContextResult?.data) {
          try {
            const jsonMatch = gameContextResult.data.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              let jsonStr = jsonMatch[0].replace(/,\s*([\]\}])/g, '$1');
              gameContext = JSON.parse(jsonStr);
            }
          } catch {
            // fallback to raw text
            gameContext = { generalContext: gameContextResult.data };
          }
        }
      } catch {
        gameContext = {};
      }

      // 7. Get odds data
      let oddsData = null;
      try {
        const mlbGames = await oddsService.getUpcomingGames('baseball_mlb');
        if (Array.isArray(mlbGames) && mlbGames.length > 0) {
          const matchingGame = mlbGames.find(game =>
            (game.home_team?.includes(homeTeamName) || homeTeamName.includes(game.home_team)) &&
            (game.away_team?.includes(awayTeamName) || awayTeamName.includes(game.away_team))
          );
          if (matchingGame) {
            oddsData = await oddsService.getGameOdds(matchingGame.id);
          }
        }
      } catch {
        oddsData = null;
      }

      // 8. Combine all the data and validate
      const combinedData = {
        game: {
          homeTeam: targetGame.teams.home.team.name,
          awayTeam: targetGame.teams.away.team.name,
          gameDate: targetGame.gameDate,
          gameTime: new Date(targetGame.gameDate).toLocaleTimeString('en-US'),
          venue: targetGame.venue?.name || 'Unknown Venue',
          gamePk: targetGame.gamePk
        },
        homeTeam: homeTeamName,
        awayTeam: awayTeamName,
        teamStats: teamComparisonStats,
        pitchers: startingPitchers,
        hitterStats,
        gameContext,
        odds: oddsData,
        dateString: date
      };

      return combinedData;
    } catch (error) {
      console.error(`[Combined MLB Service] Error: ${error.message}`);
      // Fall back to Ball Don't Lie service in case of error
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
      const gameData = await combinedMlbService.getComprehensiveGameData(homeTeamName, awayTeamName, date);

      const homePitcher = gameData.pitchers.home;
      const awayPitcher = gameData.pitchers.away;
      const homeTeamStats = gameData.teamStats.homeTeam;
      const awayTeamStats = gameData.teamStats.awayTeam;

      let previewText = `${awayTeamName} @ ${homeTeamName} | ${new Date(gameData.game.gameDate).toLocaleDateString()} ${gameData.game.gameTime}\n\n`;

      if (homePitcher && awayPitcher) {
        const homeERA = homePitcher.seasonStats?.era || 'N/A';
        const homeRecord = `${homePitcher.seasonStats?.wins || 0}-${homePitcher.seasonStats?.losses || 0}`;
        const awayERA = awayPitcher.seasonStats?.era || 'N/A';
        const awayRecord = `${awayPitcher.seasonStats?.wins || 0}-${awayPitcher.seasonStats?.losses || 0}`;
        previewText += `PITCHING MATCHUP:\n`;
        previewText += `${awayTeamName}: ${awayPitcher.fullName} (${awayRecord}, ${awayERA} ERA)\n`;
        previewText += `${homeTeamName}: ${homePitcher.fullName} (${homeRecord}, ${homeERA} ERA)\n\n`;
      }

      previewText += `TEAM COMPARISON:\nBATTING:\n`;
      if (homeTeamStats?.battingAvg && awayTeamStats?.battingAvg) {
        previewText += `AVG: ${awayTeamName} ${awayTeamStats.battingAvg} | ${homeTeamName} ${homeTeamStats.battingAvg}\n`;
      }
      if (homeTeamStats?.ops && awayTeamStats?.ops) {
        previewText += `OPS: ${awayTeamName} ${awayTeamStats.ops} | ${homeTeamName} ${homeTeamStats.ops}\n`;
      }
      if (homeTeamStats?.runsPerGame && awayTeamStats?.runsPerGame) {
        previewText += `R/G: ${awayTeamName} ${awayTeamStats.runsPerGame} | ${homeTeamName} ${homeTeamStats.runsPerGame}\n`;
      }

      previewText += `\nPITCHING:\n`;
      if (homeTeamStats?.bullpenEra && awayTeamStats?.bullpenEra) {
        previewText += `Bullpen ERA: ${awayTeamName} ${awayTeamStats.bullpenEra} | ${homeTeamName} ${homeTeamStats.bullpenEra}\n`;
      }

      if (homeTeamStats?.record && awayTeamStats?.record) {
        previewText += `\nRECORD:\n${awayTeamName}: ${awayTeamStats.record}\n${homeTeamName}: ${homeTeamStats.record}\n`;
      }

      if (homeTeamStats?.homeRecord && awayTeamStats?.awayRecord) {
        previewText += `\n${homeTeamName} Home: ${homeTeamStats.homeRecord}\n${awayTeamName} Away: ${awayTeamStats.awayRecord}\n`;
      }

      if (homeTeamStats?.recentForm && awayTeamStats?.recentForm) {
        previewText += `\nRECENT FORM (Last 10):\n${awayTeamName}: ${awayTeamStats.recentForm}\n${homeTeamName}: ${homeTeamStats.recentForm}\n`;
      }

      return previewText;
    } catch (error) {
      console.error(`[Combined MLB Service] Error generating enhanced game preview: ${error.message}`);
      return ballDontLieService.generateMlbGamePreview(homeTeamName, awayTeamName);
    }
  }
};

export { combinedMlbService };
