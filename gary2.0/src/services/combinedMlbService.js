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
      let games = [];
      try {
        games = await mlbStatsApiService.getGamesByDate(date);
        console.log(`[Combined MLB Service] Found ${games?.length || 0} games for ${date} from MLB Stats API`);
      } catch (gamesError) {
        console.error(`[Combined MLB Service] Error fetching games: ${gamesError.message}`);
        games = [];
      }

      let targetGame = null;
      let fallbackData = null;

      // If no games found from MLB Stats API, try to get data from Ball Don't Lie
      if (!Array.isArray(games) || games.length === 0) {
        console.log(`[Combined MLB Service] No games found for date ${date}, trying Ball Don't Lie`);
        try {
          fallbackData = await ballDontLieService.getComprehensiveMlbGameStats(homeTeamName, awayTeamName);
          console.log(`[Combined MLB Service] Got fallback data from Ball Don't Lie: ${!!fallbackData}`);
        } catch (fallbackError) {
          console.error(`[Combined MLB Service] Error getting fallback data: ${fallbackError.message}`);
          // Initialize with default empty structure if fallback fails
          fallbackData = {
            homeTeam: homeTeamName,
            awayTeam: awayTeamName,
            game: {
              homeTeam: homeTeamName,
              awayTeam: awayTeamName,
              gameDate: date,
              gameTime: new Date().toLocaleTimeString('en-US'),
              venue: 'Unknown Venue',
              gamePk: 0
            },
            teamStats: {
              homeTeam: { teamName: homeTeamName, wins: 0, losses: 0, record: '0-0' },
              awayTeam: { teamName: awayTeamName, wins: 0, losses: 0, record: '0-0' }
            },
            pitchers: { 
              home: { fullName: 'Unknown Pitcher', seasonStats: { era: '0.00', wins: 0, losses: 0 } },
              away: { fullName: 'Unknown Pitcher', seasonStats: { era: '0.00', wins: 0, losses: 0 } }
            },
            hitterStats: { home: [], away: [] },
            gameContext: { gamePreview: 'No preview available' },
            odds: null,
            dateString: date
          };
        }
      } else {
        // 2. Find the target game
        // Normalize team names for more flexible matching
        const normalizeTeamName = (name) => {
          return name.toLowerCase()
            .replace(/\s+/g, '')
            .replace(/^(the)/i, '')
            .replace(/(s|es)$/i, '');
        };
        
        // For detailed debugging, log all games found
        console.log(`[Combined MLB Service] Available games for ${date}:`);
        games.forEach((game, idx) => {
          if (game?.teams?.home?.team?.name && game?.teams?.away?.team?.name) {
            console.log(`[Combined MLB Service] Game ${idx+1}: ${game.teams.away.team.name} @ ${game.teams.home.team.name} (ID: ${game.gamePk})`);
          }
        });
        
        // Normalize search names
        const normalizedHomeTeamName = normalizeTeamName(homeTeamName);
        const normalizedAwayTeamName = normalizeTeamName(awayTeamName);
        console.log(`[Combined MLB Service] Looking for normalized team names: ${normalizedAwayTeamName} @ ${normalizedHomeTeamName}`);
        
        for (const game of games) {
          if (!game?.teams?.home?.team?.name || !game?.teams?.away?.team?.name) continue;
          
          const homeTeam = game.teams.home.team.name;
          const awayTeam = game.teams.away.team.name;
          const normalizedHomeTeam = normalizeTeamName(homeTeam);
          const normalizedAwayTeam = normalizeTeamName(awayTeam);
          
          // First try exact match
          if (homeTeam === homeTeamName && awayTeam === awayTeamName) {
            targetGame = game;
            console.log(`[Combined MLB Service] Found exact match: ${awayTeam} @ ${homeTeam} (ID: ${game.gamePk})`);
            break;
          }
          
          // Then try normalized match
          if (normalizedHomeTeam === normalizedHomeTeamName && normalizedAwayTeam === normalizedAwayTeamName) {
            targetGame = game;
            console.log(`[Combined MLB Service] Found normalized match: ${awayTeam} @ ${homeTeam} (ID: ${game.gamePk})`);
            break;
          }
          
          // Then try contains match
          if (
            (homeTeam.includes(homeTeamName) || homeTeamName.includes(homeTeam) ||
             normalizedHomeTeam.includes(normalizedHomeTeamName) || normalizedHomeTeamName.includes(normalizedHomeTeam)) &&
            (awayTeam.includes(awayTeamName) || awayTeamName.includes(awayTeam) ||
             normalizedAwayTeam.includes(normalizedAwayTeamName) || normalizedAwayTeamName.includes(normalizedAwayTeam))
          ) {
            targetGame = game;
            console.log(`[Combined MLB Service] Found partial match: ${awayTeam} @ ${homeTeam} (ID: ${game.gamePk})`);
            break;
          }
        }

        if (!targetGame) {
          console.log(`[Combined MLB Service] Game not found in ${games.length} games, trying Ball Don't Lie`);
          // If no matching game found, try Ball Don't Lie as fallback
          try {
            fallbackData = await ballDontLieService.getComprehensiveMlbGameStats(homeTeamName, awayTeamName);
            console.log(`[Combined MLB Service] Got fallback data: ${!!fallbackData}`);
          } catch (fallbackError) {
            console.error(`[Combined MLB Service] Fallback error: ${fallbackError.message}`);
            // Initialize with default empty structure if fallback fails
            fallbackData = {
              homeTeam: homeTeamName,
              awayTeam: awayTeamName,
              game: {
                homeTeam: homeTeamName,
                awayTeam: awayTeamName,
                gameDate: date,
                gameTime: new Date().toLocaleTimeString('en-US'),
                venue: 'Unknown Venue',
                gamePk: 0
              },
              teamStats: {
                homeTeam: { teamName: homeTeamName, wins: 0, losses: 0, record: '0-0' },
                awayTeam: { teamName: awayTeamName, wins: 0, losses: 0, record: '0-0' }
              },
              pitchers: { 
                home: { fullName: 'Unknown Pitcher', seasonStats: { era: '0.00', wins: 0, losses: 0 } },
                away: { fullName: 'Unknown Pitcher', seasonStats: { era: '0.00', wins: 0, losses: 0 } }
              },
              hitterStats: { home: [], away: [] },
              gameContext: { gamePreview: 'No preview available' },
              odds: null,
              dateString: date
            };
          }
        }
      }

      // If we have fallback data, return it
      if (fallbackData) {
        console.log(`[Combined MLB Service] Using fallback data for ${awayTeamName} @ ${homeTeamName}`);
        return fallbackData;
      }

      // If we get here, we have a target game from MLB Stats API
      console.log(`[Combined MLB Service] Using MLB Stats API data for ${targetGame.teams.away.team.name} @ ${targetGame.teams.home.team.name}`);

      // 3. Get team comparison stats from Ball Don't Lie API
      let teamComparisonStats = {
        homeTeam: { teamName: homeTeamName, wins: 0, losses: 0 },
        awayTeam: { teamName: awayTeamName, wins: 0, losses: 0 }
      };
      
      try {
        const ballDontLieStats = await ballDontLieService.getMlbTeamComparisonStats(homeTeamName, awayTeamName);
        if (ballDontLieStats?.homeTeam && ballDontLieStats?.awayTeam) {
          teamComparisonStats = ballDontLieStats;
          console.log(`[Combined MLB Service] Successfully got team comparison stats`);
        } else {
          console.log(`[Combined MLB Service] Team comparison stats incomplete, using defaults`);
        }
      } catch (statsError) {
        console.error(`[Combined MLB Service] Error getting team stats: ${statsError.message}`);
      }

      // 4. Get starting pitcher data
      let startingPitchers = { home: null, away: null };
      try {
        const pitcherData = await mlbStatsApiService.getStartingPitchersEnhanced(targetGame.gamePk);
        if (pitcherData?.home || pitcherData?.away) {
          startingPitchers = pitcherData;
          console.log(`[Combined MLB Service] Got starting pitchers: ${!!pitcherData.home} (home), ${!!pitcherData.away} (away)`);
        }
      } catch (pitcherError) {
        console.error(`[Combined MLB Service] Error getting pitchers: ${pitcherError.message}`);
      }

      // 5. Get top hitter stats
      let hitterStats = { home: [], away: [] };
      try {
        const boxHitterStats = await mlbStatsApiService.getHitterStats(targetGame.gamePk);

        if (boxHitterStats?.home?.length || boxHitterStats?.away?.length) {
          hitterStats = boxHitterStats;
          console.log(`[Combined MLB Service] Got box hitter stats: ${boxHitterStats?.home?.length || 0} home, ${boxHitterStats?.away?.length || 0} away`);
        } else {
          // Fall back to roster stats
          console.log(`[Combined MLB Service] No box hitter stats, falling back to roster stats`);
          try {
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
            console.log(`[Combined MLB Service] Formatted roster stats: ${hitterStats?.home?.length || 0} home, ${hitterStats?.away?.length || 0} away`);
          } catch (rosterError) {
            console.error(`[Combined MLB Service] Error getting roster stats: ${rosterError.message}`);
          }
        }
      } catch (hitterError) {
        console.error(`[Combined MLB Service] Error getting hitter stats: ${hitterError.message}`);
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
              console.log(`[Combined MLB Service] Successfully parsed game context from Perplexity`);
            }
          } catch (parseError) {
            console.error(`[Combined MLB Service] Error parsing context: ${parseError.message}`);
            // fallback to raw text
            gameContext = { generalContext: gameContextResult.data };
            console.log(`[Combined MLB Service] Using raw text for game context`);
          }
        }
      } catch (contextError) {
        console.error(`[Combined MLB Service] Error getting game context: ${contextError.message}`);
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
            console.log(`[Combined MLB Service] Got odds data for game ID ${matchingGame.id}`);
          }
        }
      } catch (oddsError) {
        console.error(`[Combined MLB Service] Error getting odds: ${oddsError.message}`);
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

      console.log(`[Combined MLB Service] Successfully built comprehensive data:`, {
        hasHomeTeamStats: !!teamComparisonStats?.homeTeam,
        hasAwayTeamStats: !!teamComparisonStats?.awayTeam,
        hasHomePitcher: !!startingPitchers?.home,
        hasAwayPitcher: !!startingPitchers?.away,
        homeHittersCount: hitterStats?.home?.length || 0,
        awayHittersCount: hitterStats?.away?.length || 0,
        hasGameContext: Object.keys(gameContext).length > 0,
        hasOdds: !!oddsData
      });

      return combinedData;
    } catch (error) {
      console.error(`[Combined MLB Service] Critical error in getComprehensiveGameData: ${error.message}`);
      // Return a minimal valid data structure so the process can continue
      return {
        homeTeam: homeTeamName,
        awayTeam: awayTeamName,
        game: {
          homeTeam: homeTeamName,
          awayTeam: awayTeamName,
          gameDate: date,
          gameTime: new Date().toLocaleTimeString('en-US'),
          venue: 'Unknown Venue',
          gamePk: 0
        },
        teamStats: {
          homeTeam: { teamName: homeTeamName, wins: 0, losses: 0, record: '0-0' },
          awayTeam: { teamName: awayTeamName, wins: 0, losses: 0, record: '0-0' }
        },
        pitchers: { 
          home: { fullName: 'Unknown Pitcher', seasonStats: { era: '0.00', wins: 0, losses: 0 } },
          away: { fullName: 'Unknown Pitcher', seasonStats: { era: '0.00', wins: 0, losses: 0 } }
        },
        hitterStats: { home: [], away: [] },
        gameContext: { gamePreview: 'No preview available' },
        odds: null,
        dateString: date
      };
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
