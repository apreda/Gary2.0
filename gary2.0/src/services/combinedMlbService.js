/**
 * Combined MLB Service
 * This service combines data from all three data sources:
 * 1. MLB Team Stats API for comprehensive team statistics (PRIORITY 1)
 * 2. MLB Stats API for pitcher data (PRIORITY 2)
 * 3. Perplexity for game context, storylines, and other relevant data
 */
import { ballDontLieService } from './ballDontLieService.js';
import { mlbStatsApiService } from './mlbStatsApiService.enhanced.js';
import { mlbTeamStatsService } from './mlbTeamStatsService.js';
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

      // 3. Get comprehensive team stats using our new MLB Team Stats Service
      let teamStats = null;
      let comprehensiveTeamStats = null;
      
      try {
        console.log('[Combined MLB Service] Getting comprehensive team statistics...');
        
        // Get comprehensive team stats comparison
        comprehensiveTeamStats = await mlbTeamStatsService.getTeamStatsComparison(homeTeamName, awayTeamName);
        
        if (comprehensiveTeamStats) {
          console.log('[Combined MLB Service] Successfully got comprehensive team stats');
          
          // Extract basic team records for backward compatibility
          teamStats = {
            homeTeam: {
              teamName: homeTeamName,
              wins: targetGame?.teams?.home?.leagueRecord?.wins || 0,
              losses: targetGame?.teams?.home?.leagueRecord?.losses || 0,
              record: `${targetGame?.teams?.home?.leagueRecord?.wins || 0}-${targetGame?.teams?.home?.leagueRecord?.losses || 0}`,
              winPercentage: targetGame?.teams?.home?.leagueRecord?.pct || '.000',
              
              // Add comprehensive offensive stats
              runsPerGame: comprehensiveTeamStats.homeTeam.summary.runsPerGame,
              teamAverage: comprehensiveTeamStats.homeTeam.offense.teamAverage,
              teamOPS: comprehensiveTeamStats.homeTeam.summary.teamOPS,
              homeRuns: comprehensiveTeamStats.homeTeam.offense.homeRuns,
              stolenBases: comprehensiveTeamStats.homeTeam.offense.stolenBases,
              
              // Add comprehensive pitching stats
              teamERA: comprehensiveTeamStats.homeTeam.summary.teamERA,
              teamWHIP: comprehensiveTeamStats.homeTeam.summary.teamWHIP,
              bullpenERA: comprehensiveTeamStats.homeTeam.summary.bullpenERA,
              
              // Add advanced sabermetrics
              wOBA: comprehensiveTeamStats.homeTeam.summary.wOBA,
              fip: comprehensiveTeamStats.homeTeam.summary.fip
            },
            awayTeam: {
              teamName: awayTeamName,
              wins: targetGame?.teams?.away?.leagueRecord?.wins || 0,
              losses: targetGame?.teams?.away?.leagueRecord?.losses || 0,
              record: `${targetGame?.teams?.away?.leagueRecord?.wins || 0}-${targetGame?.teams?.away?.leagueRecord?.losses || 0}`,
              winPercentage: targetGame?.teams?.away?.leagueRecord?.pct || '.000',
              
              // Add comprehensive offensive stats
              runsPerGame: comprehensiveTeamStats.awayTeam.summary.runsPerGame,
              teamAverage: comprehensiveTeamStats.awayTeam.offense.teamAverage,
              teamOPS: comprehensiveTeamStats.awayTeam.summary.teamOPS,
              homeRuns: comprehensiveTeamStats.awayTeam.offense.homeRuns,
              stolenBases: comprehensiveTeamStats.awayTeam.offense.stolenBases,
              
              // Add comprehensive pitching stats
              teamERA: comprehensiveTeamStats.awayTeam.summary.teamERA,
              teamWHIP: comprehensiveTeamStats.awayTeam.summary.teamWHIP,
              bullpenERA: comprehensiveTeamStats.awayTeam.summary.bullpenERA,
              
              // Add advanced sabermetrics
              wOBA: comprehensiveTeamStats.awayTeam.summary.wOBA,
              fip: comprehensiveTeamStats.awayTeam.summary.fip
            }
          };
          
          console.log(`[Combined MLB Service] Enhanced team stats with comprehensive data:
            ${homeTeamName}: ${teamStats.homeTeam.runsPerGame} RPG, ${teamStats.homeTeam.teamERA} ERA, ${teamStats.homeTeam.teamOPS} OPS
            ${awayTeamName}: ${teamStats.awayTeam.runsPerGame} RPG, ${teamStats.awayTeam.teamERA} ERA, ${teamStats.awayTeam.teamOPS} OPS`);
        } else {
          // Fallback to basic team records from game data
          if (targetGame && targetGame.teams) {
            teamStats = {
              homeTeam: {
                teamName: homeTeamName,
                wins: targetGame.teams.home.leagueRecord?.wins || 0,
                losses: targetGame.teams.home.leagueRecord?.losses || 0,
                record: `${targetGame.teams.home.leagueRecord?.wins || 0}-${targetGame.teams.home.leagueRecord?.losses || 0}`,
                winPercentage: targetGame.teams.home.leagueRecord?.pct || '.000'
              },
              awayTeam: {
                teamName: awayTeamName,
                wins: targetGame.teams.away.leagueRecord?.wins || 0,
                losses: targetGame.teams.away.leagueRecord?.losses || 0,
                record: `${targetGame.teams.away.leagueRecord?.wins || 0}-${targetGame.teams.away.leagueRecord?.losses || 0}`,
                winPercentage: targetGame.teams.away.leagueRecord?.pct || '.000'
              }
            };
            console.log('[Combined MLB Service] Using basic team stats from MLB game data');
          }
        }
      } catch (error) {
        console.log('[Combined MLB Service] Error getting comprehensive team stats:', error.message);
        
        // Fallback to basic team records from game data
        if (targetGame && targetGame.teams) {
          teamStats = {
            homeTeam: {
              teamName: homeTeamName,
              wins: targetGame.teams.home.leagueRecord?.wins || 0,
              losses: targetGame.teams.home.leagueRecord?.losses || 0,
              record: `${targetGame.teams.home.leagueRecord?.wins || 0}-${targetGame.teams.home.leagueRecord?.losses || 0}`,
              winPercentage: targetGame.teams.home.leagueRecord?.pct || '.000'
            },
            awayTeam: {
              teamName: awayTeamName,
              wins: targetGame.teams.away.leagueRecord?.wins || 0,
              losses: targetGame.teams.away.leagueRecord?.losses || 0,
              record: `${targetGame.teams.away.leagueRecord?.wins || 0}-${targetGame.teams.away.leagueRecord?.losses || 0}`,
              winPercentage: targetGame.teams.away.leagueRecord?.pct || '.000'
            }
          };
          console.log('[Combined MLB Service] Using fallback basic team stats');
        }
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
          // Check if stats are all zeros (pre-game or API issue)
          const hasValidHomeStats = boxHitterStats.home.some(player => 
            Object.values(player.stats).some(stat => stat !== 0 && stat !== '0' && stat !== '.000')
          );
          const hasValidAwayStats = boxHitterStats.away.some(player => 
            Object.values(player.stats).some(stat => stat !== 0 && stat !== '0' && stat !== '.000')
          );
          
          if (hasValidHomeStats || hasValidAwayStats) {
            hitterStats = boxHitterStats;
            console.log(`[Combined MLB Service] Got valid box hitter stats: ${boxHitterStats?.home?.length || 0} home, ${boxHitterStats?.away?.length || 0} away`);
          } else {
            console.log(`[Combined MLB Service] Box hitter stats are all zeros, trying Ball Don't Lie API`);
            
            // Try Ball Don't Lie API as fallback
            try {
              const ballDontLieStats = await ballDontLieService.getComprehensiveMlbGameStats(homeTeamName, awayTeamName);
              
              if (ballDontLieStats?.hitterStats?.home?.length || ballDontLieStats?.hitterStats?.away?.length) {
                hitterStats = ballDontLieStats.hitterStats;
                console.log(`[Combined MLB Service] Got hitter stats from Ball Don't Lie: ${hitterStats?.home?.length || 0} home, ${hitterStats?.away?.length || 0} away`);
              }
            } catch (bdlError) {
              console.log(`[Combined MLB Service] Ball Don't Lie fallback failed: ${bdlError.message}`);
            }
          }
        }
        
        // If still no stats, fall back to roster stats (but only get top hitters, not all pitchers)
        if (!hitterStats.home.length && !hitterStats.away.length) {
          console.log(`[Combined MLB Service] No hitter stats from any source, falling back to top hitters only`);
          try {
            const homeTeamId = targetGame.teams.home.team.id;
            const awayTeamId = targetGame.teams.away.team.id;
            
            // Only get top hitters, not the full roster with all pitchers
            const homeRoster = await mlbStatsApiService.getTopHitters(homeTeamId, 5);
            const awayRoster = await mlbStatsApiService.getTopHitters(awayTeamId, 5);

            const formatRosterStats = (roster, teamName) => {
              if (!Array.isArray(roster)) return [];
              return roster
                .sort((a, b) => parseFloat(b.stats?.avg || 0) - parseFloat(a.stats?.avg || 0))
                .map(player => ({
                  id: player.id || 0,
                  name: player.fullName || 'Unknown Player',
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
            // More robust JSON extraction
            const jsonMatch = gameContextResult.data.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              // Try multiple JSON cleanup approaches
              try {
                // Approach 1: Basic cleanup (removing trailing commas)
                let jsonStr = jsonMatch[0].replace(/,\s*([\]\}])/g, '$1');
                gameContext = JSON.parse(jsonStr);
                console.log(`[Combined MLB Service] Successfully parsed game context from Perplexity (approach 1)`);
              } catch (error1) {
                try {
                  // Approach 2: More aggressive cleanup for malformed JSON
                  // Replace all types of quotes with standard double quotes
                  let jsonStr = jsonMatch[0]
                    .replace(/[\u2018\u2019]/g, "'")
                    .replace(/[\u201C\u201D]/g, '"')
                    // Fix missing quotes around property names
                    .replace(/(\{|,)\s*([a-zA-Z0-9_]+)\s*:/g, '$1"$2":')
                    // Fix dangling commas
                    .replace(/,\s*([\]\}])/g, '$1');
                  
                  gameContext = JSON.parse(jsonStr);
                  console.log(`[Combined MLB Service] Successfully parsed game context from Perplexity (approach 2)`);
                } catch (error2) {
                  // Last resort - use a safer parser like json5 or fallback to regex extraction
                  throw error2; // Will be caught by outer catch
                }
              }
            } else {
              // No JSON-like structure found
              throw new Error('No JSON structure detected in response');
            }
          } catch (parseError) {
            console.error(`[Combined MLB Service] Error parsing context: ${parseError.message}`);
            // Create a structured fallback from the raw text
            gameContext = { 
              gamePreview: gameContextResult.data.substring(0, 500) + '...', // Truncate long text
              generalContext: 'Game context could not be parsed into structured format.'
            };
            console.log(`[Combined MLB Service] Using formatted raw text for game context`);
          }
        }
      } catch (contextError) {
        console.error(`[Combined MLB Service] Error getting game context: ${contextError.message}`);
      }

      // 7. Get odds data with improved team name matching
      let oddsData = null;
      try {
        const mlbGames = await oddsService.getUpcomingGames('baseball_mlb');
        if (Array.isArray(mlbGames) && mlbGames.length > 0) {
          console.log(`[Combined MLB Service] Looking for odds for ${awayTeamName} @ ${homeTeamName}`);
          console.log(`[Combined MLB Service] Available games:`, mlbGames.map(g => `${g.away_team} @ ${g.home_team}`));
          
          // Improved team name matching with multiple strategies
          const normalizeTeamName = (name) => {
            return name.toLowerCase()
              .replace(/\s+/g, '')
              .replace(/^(the)/i, '')
              .replace(/(s|es)$/i, '')
              .replace(/[^a-z0-9]/g, '');
          };
          
          const normalizedHomeTeam = normalizeTeamName(homeTeamName);
          const normalizedAwayTeam = normalizeTeamName(awayTeamName);
          
          let matchingGame = null;
          
          // Strategy 1: Exact match
          matchingGame = mlbGames.find(game =>
            game.home_team === homeTeamName && game.away_team === awayTeamName
          );
          
          if (!matchingGame) {
            // Strategy 2: Contains match
            matchingGame = mlbGames.find(game =>
              (game.home_team?.includes(homeTeamName) || homeTeamName.includes(game.home_team)) &&
              (game.away_team?.includes(awayTeamName) || awayTeamName.includes(game.away_team))
            );
          }
          
          if (!matchingGame) {
            // Strategy 3: Normalized match
            matchingGame = mlbGames.find(game => {
              const gameHomeNorm = normalizeTeamName(game.home_team);
              const gameAwayNorm = normalizeTeamName(game.away_team);
              return gameHomeNorm === normalizedHomeTeam && gameAwayNorm === normalizedAwayTeam;
            });
          }
          
          if (!matchingGame) {
            // Strategy 4: Partial normalized match
            matchingGame = mlbGames.find(game => {
              const gameHomeNorm = normalizeTeamName(game.home_team);
              const gameAwayNorm = normalizeTeamName(game.away_team);
              return (gameHomeNorm.includes(normalizedHomeTeam) || normalizedHomeTeam.includes(gameHomeNorm)) &&
                     (gameAwayNorm.includes(normalizedAwayTeam) || normalizedAwayTeam.includes(gameAwayNorm));
            });
          }
          
          if (matchingGame) {
            console.log(`[Combined MLB Service] Found matching game: ${matchingGame.away_team} @ ${matchingGame.home_team} (ID: ${matchingGame.id})`);
            
            // Return the full game object with bookmakers data instead of calling getGameOdds
            // This preserves all the odds data that's already available
            oddsData = {
              id: matchingGame.id,
              bookmakers: matchingGame.bookmakers || [],
              commence_time: matchingGame.commence_time
            };
            
            console.log(`[Combined MLB Service] Odds data structure:`, {
              hasBookmakers: !!(oddsData.bookmakers && oddsData.bookmakers.length > 0),
              bookmakerCount: oddsData.bookmakers?.length || 0,
              firstBookmaker: oddsData.bookmakers?.[0]?.title || 'None'
            });
          } else {
            console.log(`[Combined MLB Service] No matching game found for ${awayTeamName} @ ${homeTeamName}`);
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
        teamStats: teamStats,
        comprehensiveTeamStats: comprehensiveTeamStats, // Add the full comprehensive stats
        pitchers: startingPitchers,
        hitterStats,
        gameContext,
        odds: oddsData,
        dateString: date
      };

      console.log(`[Combined MLB Service] Successfully built comprehensive data:`, {
        hasHomeTeamStats: !!teamStats?.homeTeam,
        hasAwayTeamStats: !!teamStats?.awayTeam,
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
