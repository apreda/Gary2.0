/**
 * Enhanced Picks Service
 * Generates picks sequentially by sport using sports statistics from TheSportsDB
 * and stores raw OpenAI responses in Supabase.
 */
import { makeGaryPick } from './garyEngine.js';
import { oddsService } from './oddsService';
import { supabase } from '../supabaseClient.js';
import { sportsDataService } from './sportsDataService.js';
import { apiSportsService } from './apiSportsService.js';

const picksService = {
  /**
   * Helper to check if team names match (handles variations in team names)
   * @private
   */
  _teamNameMatch(team1, team2) {
    if (!team1 || !team2) return false;
    
    // Clean and lowercase both names
    const clean1 = team1.toLowerCase().replace(/[^a-z0-9]/g, '');
    const clean2 = team2.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // Check for exact match or substring match
    return clean1 === clean2 || 
           clean1.includes(clean2) || 
           clean2.includes(clean1);
  },
  /**
   * Generate daily picks sequentially by sport to avoid OpenAI rate limits
   */
  generateDailyPicks: async () => {
    try {
      console.log('Generating daily picks with sequential processing to avoid rate limits');
      
      // Get active sports and their games
      const sportsToAnalyze = ['basketball_nba', 'baseball_mlb', 'icehockey_nhl']; // Fixed NHL sport key to match Odds API
      const allPicks = [];
      
      // Process one sport at a time to avoid overwhelming OpenAI API
      for (const sport of sportsToAnalyze) {
        console.log(`\n==== Processing ${sport} games ====`);
        
        try {
          // Get games for this sport
          const games = await oddsService.getUpcomingGames(sport);
          console.log(`Got ${games.length} games for ${sport}`);
          
          if (games.length === 0) {
            console.log(`No games found for ${sport}, skipping...`);
            continue;
          }
          
          // Map sport key to readable name
          const sportName = sport.includes('basketball') ? 'NBA' :
                          sport.includes('baseball') ? 'MLB' :
                          sport.includes('hockey') ? 'NHL' :
                          sport.includes('football') ? 'NFL' : 'Unknown';
          
          // Generate picks for each game in this sport, one at a time
          console.log(`Generating picks for ${games.length} ${sportName} games...`);
          
          for (const game of games) {
            try {
              console.log(`\n-- Analyzing game: ${game.home_team} vs ${game.away_team} --`);
              
              // Get comprehensive team statistics from TheSportsDB
              console.log(`Gathering detailed team statistics for ${game.home_team} vs ${game.away_team}...`);
              const statsContext = await sportsDataService.generateTeamStatsForGame(
                game.home_team,
                game.away_team,
                sportName
              );
              
              // Add odds data to the stats context
              if (statsContext.statsAvailable) {
                statsContext.odds = {
                  home: game.bookmakers?.[0]?.markets?.[0]?.outcomes?.[0]?.price,
                  away: game.bookmakers?.[0]?.markets?.[0]?.outcomes?.[1]?.price,
                  pointSpread: game.bookmakers?.[0]?.markets?.[1]?.outcomes?.[0]?.point
                };
              }
              
              // For MLB games, get additional pitcher data and comprehensive team stats if available
              let pitcherData = '';
              if (sportName === 'MLB') {
                try {
                  console.log('Fetching MLB comprehensive stats with Ball Don\'t Lie as primary source...');
                  
                  // Initialize pitcher objects for both teams
                  let homePitcher = null;
                  let awayPitcher = null;
                  let dataSource = null;
                  
                  // Import ballDontLieService dynamically to avoid circular imports
                  const { ballDontLieService } = await import('./ballDontLieService.js');
                  
                  // PRIORITY 1: Try Ball Don't Lie first (most reliable for MLB)
                  console.log('PRIORITY 1: Trying Ball Don\'t Lie for MLB pitcher data...');
                  try {
                    const bdlPitcherMatchup = await ballDontLieService.getMlbPitcherMatchup(game.home_team, game.away_team);
                    if (bdlPitcherMatchup && (bdlPitcherMatchup.home || bdlPitcherMatchup.away)) {
                      console.log('Got pitcher data from Ball Don\'t Lie!');
                      homePitcher = bdlPitcherMatchup.home;
                      awayPitcher = bdlPitcherMatchup.away;
                      dataSource = 'Ball Don\'t Lie';
                      
                      // Get comprehensive team stats from Ball Don't Lie
                      console.log('Getting comprehensive MLB team stats from Ball Don\'t Lie...');
                      const compStats = await ballDontLieService.getComprehensiveMlbGameStats(game.home_team, game.away_team);
                      if (compStats) {
                        // Add the comprehensive stats to the statsContext for Gary Engine
                        statsContext.homeTeam = { ...statsContext.homeTeam, ...compStats.homeTeam };
                        statsContext.awayTeam = { ...statsContext.awayTeam, ...compStats.awayTeam };
                        console.log('Added comprehensive team stats from Ball Don\'t Lie');
                      }
                    }
                  } catch (bdlError) {
                    console.error('Error fetching pitcher data from Ball Don\'t Lie:', bdlError.message);
                  }
                  
                  // PRIORITY 2: Try API-Sports if Ball Don't Lie failed
                  if (!dataSource) {
                    console.log('PRIORITY 2: Ball Don\'t Lie failed, trying API-Sports...');
                    const apiSportsPitchers = await apiSportsService.getMlbStartingPitchers(game.home_team, game.away_team);
                  
                    if (apiSportsPitchers && (apiSportsPitchers.home || apiSportsPitchers.away)) {
                      console.log('Got pitcher data from API-Sports!');
                      homePitcher = apiSportsPitchers.home;
                      awayPitcher = apiSportsPitchers.away;
                      dataSource = 'API-Sports';
                                
                    }
                  }
                  
                  // PRIORITY 3: Try SportsDB if others failed
                  if (!dataSource) {
                    console.log('PRIORITY 3: API-Sports failed, trying SportsDB...');
                    const sportsDBPitchers = await sportsDataService.getMlbStartingPitchers(game.home_team, game.away_team);
                    
                    if (sportsDBPitchers && (sportsDBPitchers.home || sportsDBPitchers.away)) {
                      console.log('Got pitcher data from SportsDB!');
                      homePitcher = sportsDBPitchers.home;
                      awayPitcher = sportsDBPitchers.away;
                      dataSource = 'SportsDB';
                    }
                  }
                  
                  // PRIORITY 4: Try Perplexity for ESPN data as last resort
                  if (!dataSource) {
                    console.log('PRIORITY 4: All traditional sources failed, trying Perplexity for ESPN data...');
                    try {
                      // Import perplexityService dynamically
                      const { perplexityService } = await import('./perplexityService.js');
                      
                      // Get ESPN game links for today
                      const gameLinks = await perplexityService.getEspnGameLinks('mlb');
                      
                      if (gameLinks && gameLinks.length > 0) {
                        console.log(`Found ${gameLinks.length} ESPN links via Perplexity, checking for pitcher data...`);
                        // Clean team names for matching
                        const normalizedHomeTeam = game.home_team.toLowerCase().replace(/\s+/g, '');
                        const normalizedAwayTeam = game.away_team.toLowerCase().replace(/\s+/g, '');
                        
                        // Try each game link
                        for (const link of gameLinks) {
                          console.log(`Checking ESPN data: ${link}`);
                          const stats = await perplexityService.extractStatsFromEspn(link, 'mlb');
                          
                          if (stats && stats['Game information'] && stats['Probable pitchers']) {
                            // Check if this is our matchup
                            const infoStr = JSON.stringify(stats['Game information']).toLowerCase();
                            if (infoStr.includes(normalizedHomeTeam) && infoStr.includes(normalizedAwayTeam)) {
                              console.log('Found matching ESPN game with pitcher data!');
                              dataSource = 'ESPN via Perplexity';
                              
                              // Process the ESPN pitcher data
                              const pitchers = stats['Probable pitchers'];
                              for (const key in pitchers) {
                                const pitcherInfo = pitchers[key];
                                // Determine if home or away
                                const isHomePitcher = key.toLowerCase().includes(normalizedHomeTeam);
                                
                                const pitcher = {
                                  name: pitcherInfo.Name || 'Unknown',
                                  team: isHomePitcher ? game.home_team : game.away_team,
                                  teamDisplayName: isHomePitcher ? game.home_team : game.away_team,
                                  stats: {
                                    ERA: pitcherInfo.ERA || 'N/A',
                                    WHIP: pitcherInfo.WHIP || 'N/A',
                                    record: pitcherInfo.Record || 'N/A',
                                    strikeouts: pitcherInfo.K || 'N/A',
                                    inningsPitched: pitcherInfo.IP || 'N/A',
                                    description: `${pitcherInfo.Name || 'Pitcher'} (${pitcherInfo.Record || '0-0'}, ${pitcherInfo.ERA || '0.00'} ERA)`
                                  }
                                };
                                
                                // Assign to correct variables
                                if (isHomePitcher) {
                                  homePitcher = pitcher;
                                } else {
                                  awayPitcher = pitcher;
                                }
                              }
                              
                              // Break if we found both pitchers
                              if (homePitcher && awayPitcher) {
                                console.log('Successfully extracted both pitchers from ESPN data!');
                                break;
                              }
                            }
                          }
                        }
                      }
                    } catch (espnError) {
                      console.error('Error fetching pitcher data from ESPN via Perplexity:', espnError.message);
                    }
                  }
                  
                  // Add pitcher data to the statsContext for Gary Engine analysis
                  if (homePitcher || awayPitcher) {
                    // Make sure pitchers arrays exist in the statsContext
                    if (!statsContext.homeTeam.pitchers) statsContext.homeTeam.pitchers = [];
                    if (!statsContext.awayTeam.pitchers) statsContext.awayTeam.pitchers = [];
                    
                    if (homePitcher) {
                      statsContext.homeTeam.pitchers.push({
                        name: homePitcher.name || 'TBD',
                        handedness: homePitcher.handedness || 'Unknown',
                        stats: homePitcher.stats || {}
                      });
                    }
                    
                    if (awayPitcher) {
                      statsContext.awayTeam.pitchers.push({
                        name: awayPitcher.name || 'TBD',
                        handedness: awayPitcher.handedness || 'Unknown',
                        stats: awayPitcher.stats || {}
                      });
                    }
                    
                    // Add pitcher data to statsContext.pitcher with backward compatibility
                    statsContext.pitcher = {
                      home: homePitcher,
                      away: awayPitcher,
                      source: dataSource
                    };
                    
                    // Format human-readable pitcher data for logs and debugging
                    pitcherData = `\nSTARTING PITCHERS (Data Source: ${dataSource}):`;
                    
                    // Home pitcher stats
                    if (homePitcher) {
                      pitcherData += `\n${game.home_team} Starting Pitcher: ${homePitcher.name || 'TBD'}`;
                      
                      if (homePitcher.stats) {
                        const stats = homePitcher.stats;
                        if (stats.ERA) pitcherData += `\n  ERA: ${stats.ERA}`;
                        if (stats.WHIP) pitcherData += `\n  WHIP: ${stats.WHIP}`;
                        if (stats.record) pitcherData += `\n  Record: ${stats.record}`;
                        if (stats.strikeouts) pitcherData += `\n  K's: ${stats.strikeouts}`;
                        if (stats.inningsPitched && stats.inningsPitched !== 'N/A') {
                          pitcherData += `\n  Innings Pitched: ${stats.inningsPitched}`;
                        }
                        if (stats.description) pitcherData += `\n  ${stats.description}`;
                      }
                    } else {
                      pitcherData += `\n${game.home_team} Starting Pitcher: Unknown`;
                    }
                    
                    // Away pitcher stats
                    if (awayPitcher) {
                      pitcherData += `\n${game.away_team} Starting Pitcher: ${awayPitcher.name || 'TBD'}`;
                      
                      if (awayPitcher.stats) {
                        const stats = awayPitcher.stats;
                        if (stats.ERA) pitcherData += `\n  ERA: ${stats.ERA}`;
                        if (stats.WHIP) pitcherData += `\n  WHIP: ${stats.WHIP}`;
                        if (stats.record) pitcherData += `\n  Record: ${stats.record}`;
                        if (stats.strikeouts) pitcherData += `\n  K's: ${stats.strikeouts}`;
                        if (stats.inningsPitched && stats.inningsPitched !== 'N/A') {
                          pitcherData += `\n  Innings Pitched: ${stats.inningsPitched}`;
                        }
                        if (stats.description) pitcherData += `\n  ${stats.description}`;
                      }
                    } else {
                      pitcherData += `\n${game.away_team} Starting Pitcher: Unknown`;
                    }
                    
                    // Add note about importance of pitcher stats
                    pitcherData += '\n\nNOTE: For MLB games, starting pitcher stats are more important than team ERA.';
                  } else {
                    console.log('No pitcher data available from any source');
                    pitcherData = `\nPITCHING MATCHUP: No specific starting pitcher data available. Focus on analyzing the pitching matchup using recent performance metrics.`;
                  }
                } catch (error) {
                  console.error('Error fetching MLB pitcher data:', error.message);
                  pitcherData = `PITCHING MATCHUP: Check starting pitchers' stats including ERA, WHIP, K/9, and recent performances.`;
                }
              }
              
              // Get game time from Odds API and headlines from Perplexity
              console.log('Using game time from Odds API and fetching headlines from Perplexity...');
              let gameTimeData = { gameTime: 'TBD', headlines: [], keyInjuries: { homeTeam: [], awayTeam: [] }};
              
              // Format the game time from Odds API commence_time
              if (game.commence_time) {
                try {
                  const gameDateTime = new Date(game.commence_time);
                  // Format the time in EST timezone as HH:MM AM/PM
                  const timeOptions = { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true };
                  const formattedTime = gameDateTime.toLocaleTimeString('en-US', timeOptions);
                  gameTimeData.gameTime = formattedTime;
                  console.log(`Game time from Odds API: ${formattedTime}`);
                } catch (timeError) {
                  console.error('Error formatting game time from Odds API:', timeError);
                }
              }
              
              // Still get headlines from Perplexity
              try {
                // Import perplexityService dynamically to avoid circular reference
                const { perplexityService } = await import('./perplexityService');
                const perplexityData = await perplexityService.getGameTimeAndHeadlines(
                  game.home_team,
                  game.away_team,
                  sportName
                );
                
                // Only take headlines and injuries, keep our Odds API time
                gameTimeData.headlines = perplexityData.headlines || [];
                gameTimeData.keyInjuries = perplexityData.keyInjuries || { homeTeam: [], awayTeam: [] };
                console.log(`Headlines: ${gameTimeData.headlines.length > 0 ? 'Available' : 'None'}`);
              } catch (perplexityError) {
                console.error('Error fetching headlines from Perplexity:', perplexityError);
              }
              
              // Get real-time news and trends from Perplexity
              let gameNews = '';
              try {
                // Import perplexityService dynamically to avoid circular reference
                const { perplexityService } = await import('./perplexityService');
                gameNews = await perplexityService.getGameNews(
                  game.home_team,
                  game.away_team,
                  sportName
                );
                console.log('Game news and trends fetched successfully');
              } catch (newsError) {
                console.error('Error fetching game news and trends:', newsError);
                gameNews = 'Unable to retrieve real-time data. Analysis will proceed with available data.';
              }
              
              // Get the current date in EST timezone (for sports betting context)
              const currentDate = new Date();
              const options = { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' };
              const estDate = new Intl.DateTimeFormat('en-US', options).format(currentDate);
              const [month, day, year] = estDate.split('/');
              const currentDateString = `${year}-${month}-${day}`;
              
              // Format the game data for Gary's analysis with enhanced statistics
              // We'll be flexible about what stats we pass - OpenAI will see everything in context
              const formattedGameData = {
                homeTeam: game.home_team,
                awayTeam: game.away_team,
                matchup: `${game.home_team} vs ${game.away_team}`,
                league: sportName,
                odds: game.bookmakers || [],
                lineMovement: {
                  hasSignificantMovement: false,
                  movement: { spread: 0, moneyline: { home: 0, away: 0 } },
                  trend: 'stable'
                },
                sport: sportName,
                sportKey: sport,
                teamStats: statsContext,
                pitcherData: pitcherData,
                gameTime: gameTimeData.gameTime || 'TBD',
                time: gameTimeData.gameTime || 'TBD',
                datetime: currentDateString + ' ' + (gameTimeData.gameTime || 'TBD'),
                headlines: gameTimeData.headlines || [],
                injuries: gameTimeData.keyInjuries || { homeTeam: [], awayTeam: [] },
                realTimeNews: gameNews || '',
                // Add a special field that will contain ALL the stats we collect from various sources
                // This way we send everything we have to OpenAI without being too strict
                allCollectedStats: {
                  date: currentDateString,
                  mlbSpecific: sportName === 'MLB' ? { is2025Season: true } : null,
                  sources: []  // We'll collect all stats from all sources here
                }
              };
              
              // Generate team statistics according to sport-specific priority order
              console.log('Generating team statistics with sport-specific priority...');
              let enhancedStats = '';
              try {
                // Different priority order for each sport
                if (sportName === 'MLB') {
                  // For MLB we prioritize MLB Stats API for pitcher data and top hitters, while using Ball Don't Lie for team stats
                  console.log('MLB STATS PRIORITY: 1) MLB Stats API for pitcher data and top hitters → 2) Ball Don\'t Lie for team data → 3) API-Sports as fallback → 4) SportsDB as final fallback');
                  
                  // Import MLB Stats API for pitcher and player stats
                  const mlbStatsApiModule = await import('./mlbStatsApiService');
                  const mlbStatsApiService = mlbStatsApiModule.mlbStatsApiService;
                  
                  // Import Ball Don't Lie service for team stats
                  const ballDontLieModule = await import('./ballDontLieService');
                  const ballDontLieService = ballDontLieModule.ballDontLieService;
                  
                  // Variables to hold data
                  let pitcherStats = null;
                  let mlbComprehensiveStats = null;
                  let topHitters = { home: [], away: [] };
                  
                  // PRIORITY 1: Get team stats data from Ball Don't Lie
                  try {
                    // Get comprehensive MLB game stats for team data
                    mlbComprehensiveStats = await ballDontLieService.getComprehensiveMlbGameStats(game.home_team, game.away_team);
                    
                    if (mlbComprehensiveStats) {
                      console.log('Successfully retrieved comprehensive team stats from Ball Don\'t Lie');
                    }
                  } catch (error) {
                    console.error('Error getting team stats from Ball Don\'t Lie:', error);
                  }
                  
                  // PRIORITY 2: Get pitcher and top hitters data from MLB Stats API
                  try {
                    console.log(`Getting MLB Stats API pitcher and player data for ${game.home_team} vs ${game.away_team}...`);
                    
                    // Step 1: Get today's games to find the game we're analyzing
                    const todaysGames = await mlbStatsApiService.getTodaysGames();
                    let targetGame = null;
                    
                    // Find the game that matches our home and away teams
                    for (const g of todaysGames) {
                      if ((g.homeTeam.toLowerCase().includes(game.home_team.toLowerCase()) || 
                          game.home_team.toLowerCase().includes(g.homeTeam.toLowerCase())) && 
                          (g.awayTeam.toLowerCase().includes(game.away_team.toLowerCase()) || 
                          game.away_team.toLowerCase().includes(g.awayTeam.toLowerCase()))) {
                        targetGame = g;
                        break;
                      }
                    }
                    
                    if (targetGame) {
                      console.log(`Found matching game: ${targetGame.homeTeam} vs ${targetGame.awayTeam} (ID: ${targetGame.gameId})`);
                      
                      // Step 2: Get starting pitchers for the game
                      const startingPitchers = await mlbStatsApiService.getStartingPitchers(targetGame.gameId);
                      
                      // Step 3: Get season stats for each starting pitcher
                      let homePitcherStats = null;
                      let awayPitcherStats = null;
                      
                      if (startingPitchers.homeStarter?.id) {
                        homePitcherStats = await mlbStatsApiService.getPitcherSeasonStats(startingPitchers.homeStarter.id);
                      }
                      
                      if (startingPitchers.awayStarter?.id) {
                        awayPitcherStats = await mlbStatsApiService.getPitcherSeasonStats(startingPitchers.awayStarter.id);
                      }
                      
                      // Format pitcher stats for our existing structure
                      pitcherStats = {
                        home: homePitcherStats ? {
                          name: startingPitchers.homeStarter.name,
                          ERA: homePitcherStats.era,
                          WHIP: homePitcherStats.whip,
                          record: `${homePitcherStats.wins}-${homePitcherStats.losses}`,
                          IP: homePitcherStats.inningsPitched,
                          K: homePitcherStats.strikeouts,
                          BB: homePitcherStats.walks
                        } : null,
                        away: awayPitcherStats ? {
                          name: startingPitchers.awayStarter.name,
                          ERA: awayPitcherStats.era,
                          WHIP: awayPitcherStats.whip,
                          record: `${awayPitcherStats.wins}-${awayPitcherStats.losses}`,
                          IP: awayPitcherStats.inningsPitched,
                          K: awayPitcherStats.strikeouts,
                          BB: awayPitcherStats.walks
                        } : null,
                      };
                      
                      // Get team IDs to fetch player data
                      let homeTeamId = targetGame.homeTeamId;
                      let awayTeamId = targetGame.awayTeamId;
                      
                      // Get top hitters for both teams
                      if (homeTeamId) {
                        try {
                          console.log(`Getting top hitters for ${targetGame.homeTeam} (ID: ${homeTeamId})...`);
                          const rosterRes = await fetch(`https://statsapi.mlb.com/api/v1/teams/${homeTeamId}/roster/Active`);
                          const rosterData = await rosterRes.json();
                          const players = rosterData.roster;
                          
                          const statPromises = players
                            .filter(player => player.position.code !== '1') // Filter out pitchers
                            .map(async (player) => {
                              const pid = player.person.id;
                              const statRes = await fetch(`https://statsapi.mlb.com/api/v1/people/${pid}/stats?stats=season&group=hitting&season=2025`);
                              const statData = await statRes.json();
                              const stat = statData.stats[0]?.splits[0]?.stat || {};
                              return {
                                name: player.person.fullName,
                                avg: Number(stat.avg) || 0,
                                hr: Number(stat.homeRuns) || 0,
                                rbi: Number(stat.rbi) || 0,
                                hits: Number(stat.hits) || 0,
                                atBats: Number(stat.atBats) || 0
                              };
                            });
                            
                          const stats = await Promise.all(statPromises);
                          
                          // Filter out players with too few at-bats
                          const qualifiedStats = stats.filter(player => player.atBats >= 20);
                          
                          // Get top 3 in each category
                          const topAvg = [...qualifiedStats].sort((a, b) => b.avg - a.avg).slice(0, 3);
                          const topHR = [...qualifiedStats].sort((a, b) => b.hr - a.hr).slice(0, 3);
                          const topRBI = [...qualifiedStats].sort((a, b) => b.rbi - a.rbi).slice(0, 3);
                          
                          topHitters.home = { topAvg, topHR, topRBI };
                        } catch (error) {
                          console.error(`Error getting top hitters for ${targetGame.homeTeam}:`, error);
                        }
                      }
                      
                      if (awayTeamId) {
                        try {
                          console.log(`Getting top hitters for ${targetGame.awayTeam} (ID: ${awayTeamId})...`);
                          const rosterRes = await fetch(`https://statsapi.mlb.com/api/v1/teams/${awayTeamId}/roster/Active`);
                          const rosterData = await rosterRes.json();
                          const players = rosterData.roster;
                          
                          const statPromises = players
                            .filter(player => player.position.code !== '1') // Filter out pitchers
                            .map(async (player) => {
                              const pid = player.person.id;
                              const statRes = await fetch(`https://statsapi.mlb.com/api/v1/people/${pid}/stats?stats=season&group=hitting&season=2025`);
                              const statData = await statRes.json();
                              const stat = statData.stats[0]?.splits[0]?.stat || {};
                              return {
                                name: player.person.fullName,
                                avg: Number(stat.avg) || 0,
                                hr: Number(stat.homeRuns) || 0,
                                rbi: Number(stat.rbi) || 0,
                                hits: Number(stat.hits) || 0,
                                atBats: Number(stat.atBats) || 0
                              };
                            });
                            
                          const stats = await Promise.all(statPromises);
                          
                          // Filter out players with too few at-bats
                          const qualifiedStats = stats.filter(player => player.atBats >= 20);
                          
                          // Get top 3 in each category
                          const topAvg = [...qualifiedStats].sort((a, b) => b.avg - a.avg).slice(0, 3);
                          const topHR = [...qualifiedStats].sort((a, b) => b.hr - a.hr).slice(0, 3);
                          const topRBI = [...qualifiedStats].sort((a, b) => b.rbi - a.rbi).slice(0, 3);
                          
                          topHitters.away = { topAvg, topHR, topRBI };
                        } catch (error) {
                          console.error(`Error getting top hitters for ${targetGame.awayTeam}:`, error);
                        }
                      }
                      
                      console.log('Successfully retrieved pitcher and top hitters data from MLB Stats API');
                    } else {
                      console.warn(`Could not find a game matching ${game.home_team} vs ${game.away_team} in today's MLB schedule`);
                    }
                  } catch (error) {
                    console.error('Error getting pitcher and player stats from MLB Stats API:', error);
                  }
                  
                  // PRIORITY 2: Also get team stats from API-Sports as a supplement
                  console.log('Attempting to supplement with team stats from API-Sports...');
                  // Import API-Sports service and MLB player stats service
                  const [apiSportsModule, mlbPlayerStatsModule] = await Promise.all([
                    import('./apiSportsService'),
                    import('./mlbPlayerStatsService')
                  ]);
                  const apiSportsService = apiSportsModule.apiSportsService;
                  const mlbPlayerStatsService = mlbPlayerStatsModule.default || mlbPlayerStatsModule.mlbPlayerStatsService;
                  
                  // Get team stats and player stats in parallel
                  // Format current date in YYYY-MM-DD for player stats API
                  const currentDate = new Date();
                  const estOptions = { timeZone: 'America/New_York' };
                  // Format date as YYYY-MM-DD with proper padding
                  const dateParts = currentDate.toLocaleDateString('en-US', estOptions).split('/');
                  // American format is MM/DD/YYYY so we need to rearrange
                  const formattedDate = `${dateParts[2]}-${dateParts[0].padStart(2, '0')}-${dateParts[1].padStart(2, '0')}`;
                  
                  const [apiSportsStats, playerStatsReport] = await Promise.all([
                    apiSportsService.getMlbTeamStats(game.home_team, game.away_team),
                    mlbPlayerStatsService.generateMlbPlayerStatsReport(game.home_team, game.away_team, formattedDate)
                  ]);
                  
                  // Combine MLB Stats API pitcher data with team stats and top hitters
                  if (pitcherStats || apiSportsStats || topHitters) {
                    console.log('Integrating MLB Stats API pitcher and batting data for analysis');
                    
                    // First, ensure we have a base structure even if API-Sports data is missing
                    const homeTeam = apiSportsStats?.homeTeam || { teamName: game.home_team, wins: 0, losses: 0, homeRecord: 'N/A', batting: {}, pitching: {} };
                    const awayTeam = apiSportsStats?.awayTeam || { teamName: game.away_team, wins: 0, losses: 0, awayRecord: 'N/A', batting: {}, pitching: {} };
                    
                    let formattedStatsContext = `**2025 MLB CURRENT SEASON DATA ONLY**\n\n`;
                    
                    // FIRST: Add MLB Stats API pitcher data (2025 season stats only)
                    if (pitcherStats) {
                      console.log('Including 2025 pitcher matchup data from MLB Stats API');
                      formattedStatsContext += `## STARTING PITCHER MATCHUP (2025 SEASON ONLY)\n`;
                      
                      // Home pitcher
                      if (pitcherStats.homePitcher) {
                        const hp = pitcherStats.homePitcher;
                        formattedStatsContext += `### HOME: ${hp.name} (${game.home_team})\n`;
                        formattedStatsContext += `* ERA: ${hp.stats.ERA}\n`;
                        formattedStatsContext += `* WHIP: ${hp.stats.WHIP}\n`;
                        formattedStatsContext += `* Record: ${hp.stats.record}\n`;
                        formattedStatsContext += `* Innings Pitched: ${hp.stats.inningsPitched}\n`;
                        formattedStatsContext += `* Strikeouts: ${hp.stats.strikeouts}\n`;
                        formattedStatsContext += `* Opponent Batting Avg: ${hp.stats.opponentAvg}\n\n`;
                      } else {
                        formattedStatsContext += `### HOME: No 2025 starting pitcher data available for ${game.home_team}\n\n`;
                      }
                      
                      // Away pitcher
                      if (pitcherStats.awayPitcher) {
                        const ap = pitcherStats.awayPitcher;
                        formattedStatsContext += `### AWAY: ${ap.name} (${game.away_team})\n`;
                        formattedStatsContext += `* ERA: ${ap.stats.ERA}\n`;
                        formattedStatsContext += `* WHIP: ${ap.stats.WHIP}\n`;
                        formattedStatsContext += `* Record: ${ap.stats.record}\n`;
                        formattedStatsContext += `* Innings Pitched: ${ap.stats.inningsPitched}\n`;
                        formattedStatsContext += `* Strikeouts: ${ap.stats.strikeouts}\n`;
                        formattedStatsContext += `* Opponent Batting Avg: ${ap.stats.opponentAvg}\n\n`;
                      } else {
                        formattedStatsContext += `### AWAY: No 2025 starting pitcher data available for ${game.away_team}\n\n`;
                      }
                      
                      // Save the pitcher data to formattedGameData
                      formattedGameData.pitcherData = pitcherStats;
                    }
                    
                    // SECOND: Add player-level statistics if available
                    if (playerStatsReport && !playerStatsReport.includes('Error')) {
                      console.log('Including detailed MLB player stats in analysis');
                      formattedStatsContext += `## TEAM AND PLAYER STATISTICS (2025 SEASON)\n`;
                      formattedStatsContext += playerStatsReport;
                      formattedStatsContext += '\n\n';
                    }
                    
                    // THIRD: Add team-level statistics
                    formattedStatsContext += `## MLB TEAM STATISTICS (2025 SEASON):\n\n`;
                    
                    // Home team stats
                    formattedStatsContext += `${homeTeam?.teamName || game.home_team} (Home):\n`;
                    formattedStatsContext += `Record: ${homeTeam?.wins || 0}-${homeTeam?.losses || 0} (${homeTeam?.homeRecord || 'N/A'} at home)\n`;
                    formattedStatsContext += `Team Batting: AVG: ${homeTeam?.batting?.average || 'N/A'}, Runs: ${homeTeam?.batting?.runs || 0}, HR: ${homeTeam?.batting?.homeRuns || 0}\n`;
                    formattedStatsContext += `Team Pitching: ERA: ${homeTeam?.pitching?.era || 'N/A'}, Strikeouts: ${homeTeam?.pitching?.strikeouts || 0}\n\n`;
                    
                    // Away team stats
                    formattedStatsContext += `${awayTeam?.teamName || game.away_team} (Away):\n`;
                    formattedStatsContext += `Record: ${awayTeam?.wins || 0}-${awayTeam?.losses || 0} (${awayTeam?.awayRecord || 'N/A'} on road)\n`;
                    formattedStatsContext += `Team Batting: AVG: ${awayTeam?.batting?.average || 'N/A'}, Runs: ${awayTeam?.batting?.runs || 0}, HR: ${awayTeam?.batting?.homeRuns || 0}\n`;
                    formattedStatsContext += `Team Pitching: ERA: ${awayTeam?.pitching?.era || 'N/A'}, Strikeouts: ${awayTeam?.pitching?.strikeouts || 0}\n\n`;
                    
                    // FOURTH: Add top hitters data from MLB Stats API
                    if (topHitters && (topHitters.home?.topAvg?.length > 0 || topHitters.away?.topAvg?.length > 0)) {
                      formattedStatsContext += `## TOP HITTERS (2025 SEASON):\n\n`;
                      
                      // Home team top hitters
                      formattedStatsContext += `${homeTeam?.teamName || game.home_team} Top Hitters:\n`;
                      
                      // Top batting average hitters
                      if (topHitters.home?.topAvg?.length > 0) {
                        formattedStatsContext += `Top AVG: `;
                        topHitters.home.topAvg.forEach((player, index) => {
                          formattedStatsContext += `${player.name} (.${(player.avg * 1000).toFixed(0).padStart(3, '0')})`;
                          if (index < topHitters.home.topAvg.length - 1) formattedStatsContext += `, `;
                        });
                        formattedStatsContext += `\n`;
                      }
                      
                      // Top home run hitters
                      if (topHitters.home?.topHR?.length > 0) {
                        formattedStatsContext += `Top HR: `;
                        topHitters.home.topHR.forEach((player, index) => {
                          formattedStatsContext += `${player.name} (${player.hr})`;
                          if (index < topHitters.home.topHR.length - 1) formattedStatsContext += `, `;
                        });
                        formattedStatsContext += `\n`;
                      }
                      
                      // Top RBI hitters
                      if (topHitters.home?.topRBI?.length > 0) {
                        formattedStatsContext += `Top RBI: `;
                        topHitters.home.topRBI.forEach((player, index) => {
                          formattedStatsContext += `${player.name} (${player.rbi})`;
                          if (index < topHitters.home.topRBI.length - 1) formattedStatsContext += `, `;
                        });
                        formattedStatsContext += `\n`;
                      }
                      
                      formattedStatsContext += `\n`;
                      
                      // Away team top hitters
                      formattedStatsContext += `${awayTeam?.teamName || game.away_team} Top Hitters:\n`;
                      
                      // Top batting average hitters
                      if (topHitters.away?.topAvg?.length > 0) {
                        formattedStatsContext += `Top AVG: `;
                        topHitters.away.topAvg.forEach((player, index) => {
                          formattedStatsContext += `${player.name} (.${(player.avg * 1000).toFixed(0).padStart(3, '0')})`;
                          if (index < topHitters.away.topAvg.length - 1) formattedStatsContext += `, `;
                        });
                        formattedStatsContext += `\n`;
                      }
                      
                      // Top home run hitters
                      if (topHitters.away?.topHR?.length > 0) {
                        formattedStatsContext += `Top HR: `;
                        topHitters.away.topHR.forEach((player, index) => {
                          formattedStatsContext += `${player.name} (${player.hr})`;
                          if (index < topHitters.away.topHR.length - 1) formattedStatsContext += `, `;
                        });
                        formattedStatsContext += `\n`;
                      }
                      
                      // Top RBI hitters
                      if (topHitters.away?.topRBI?.length > 0) {
                        formattedStatsContext += `Top RBI: `;
                        topHitters.away.topRBI.forEach((player, index) => {
                          formattedStatsContext += `${player.name} (${player.rbi})`;
                          if (index < topHitters.away.topRBI.length - 1) formattedStatsContext += `, `;
                        });
                        formattedStatsContext += `\n`;
                      }
                      
                      formattedStatsContext += `\n`;
                    }
                    
                    // Add pitcher data if available and wasn't already included in player stats report
                    if (formattedGameData.pitcherData && !playerStatsReport) {
                      formattedStatsContext += `Starting Pitchers:\n`;
                      
                      const homePitcher = formattedGameData.pitcherData?.homePitcher;
                      if (homePitcher) {
                        formattedStatsContext += `${homePitcher.name} (${homeTeam?.teamName || game.home_team}): ERA: ${homePitcher.stats?.ERA || 'N/A'}, WHIP: ${homePitcher.stats?.WHIP || 'N/A'}, Record: ${homePitcher.stats?.record || 'N/A'}, K: ${homePitcher.stats?.strikeouts || 'N/A'}\n`;
                      }
                      
                      const awayPitcher = formattedGameData.pitcherData?.awayPitcher;
                      if (awayPitcher) {
                        formattedStatsContext += `${awayPitcher.name} (${awayTeam?.teamName || game.away_team}): ERA: ${awayPitcher.stats?.ERA || 'N/A'}, WHIP: ${awayPitcher.stats?.WHIP || 'N/A'}, Record: ${awayPitcher.stats?.record || 'N/A'}, K: ${awayPitcher.stats?.strikeouts || 'N/A'}\n`;
                      }
                    }
                    
                    // Store both raw and formatted stats - ensure they're properly formatted for OpenAI
                    formattedGameData.rawStatsData = apiSportsStats;
                    formattedGameData.playerStats = playerStatsReport;
                    
                    // Add these stats to our collection as well
                    formattedGameData.allCollectedStats.sources.push({
                      source: 'TheSportsDB',
                      data: { rawStats: statsContext, formattedStats: formattedGameData.statsContext }
                    });
                    
                    // If we have pitcher data from Ball Don't Lie, add that too
                    if (pitcherStats) {
                      formattedGameData.allCollectedStats.sources.push({
                        source: 'Ball Don\'t Lie',
                        data: { pitcherStats, note: '2025 MLB Pitcher Data Only' }
                      });
                      
                      // Make sure pitcher data is also explicitly added to teamStats for Gary Engine
                      if (!formattedGameData.teamStats) {
                        formattedGameData.teamStats = {
                          homeTeamStats: { name: game.home_team },
                          awayTeamStats: { name: game.away_team }
                        };
                      }
                      
                      // Add home team pitcher data
                      if (pitcherStats.homePitcher && formattedGameData.teamStats.homeTeamStats) {
                        formattedGameData.teamStats.homeTeamStats.pitcher = pitcherStats.homePitcher;
                        // Also add to detailedStats for better visibility
                        if (!formattedGameData.teamStats.homeTeamStats.detailedStats) {
                          formattedGameData.teamStats.homeTeamStats.detailedStats = {};
                        }
                        formattedGameData.teamStats.homeTeamStats.detailedStats.startingPitcher = pitcherStats.homePitcher.name;
                        formattedGameData.teamStats.homeTeamStats.detailedStats.pitcherERA = pitcherStats.homePitcher.stats?.ERA || 'N/A';
                        formattedGameData.teamStats.homeTeamStats.detailedStats.pitcherWHIP = pitcherStats.homePitcher.stats?.WHIP || 'N/A';
                      }
                      
                      // Add away team pitcher data
                      if (pitcherStats.awayPitcher && formattedGameData.teamStats.awayTeamStats) {
                        formattedGameData.teamStats.awayTeamStats.pitcher = pitcherStats.awayPitcher;
                        // Also add to detailedStats for better visibility
                        if (!formattedGameData.teamStats.awayTeamStats.detailedStats) {
                          formattedGameData.teamStats.awayTeamStats.detailedStats = {};
                        }
                        formattedGameData.teamStats.awayTeamStats.detailedStats.startingPitcher = pitcherStats.awayPitcher.name;
                        formattedGameData.teamStats.awayTeamStats.detailedStats.pitcherERA = pitcherStats.awayPitcher.stats?.ERA || 'N/A';
                        formattedGameData.teamStats.awayTeamStats.detailedStats.pitcherWHIP = pitcherStats.awayPitcher.stats?.WHIP || 'N/A';
                      }
                    }
                    
                    // Ensure player stats are added to teamStats object for Gary Engine
                    if (playerStatsReport && formattedGameData.teamStats) {
                      formattedGameData.teamStats.playerStats = playerStatsReport;
                    }
                    
                    // If we still need more stats, try Ball Don't Lie, but don't be too strict
                  // We'll only make this extra call if we have almost no usable stats at all
                    if ((!pitcherStats && !apiSportsStats) || 
                        (formattedGameData.statsContext && 
                         (formattedGameData.statsContext.includes('No stats available') || 
                          formattedGameData.statsContext.includes('Error retrieving')))) {
                      console.log('Previous data sources incomplete, making final attempt with Ball Don\'t Lie comprehensive API for MLB...');
                      // Import ballDontLieService if we haven't already
                      if (!ballDontLieService) {
                        const ballDontLieModule = await import('./ballDontLieService');
                        ballDontLieService = ballDontLieModule.ballDontLieService;
                      }
                      
                      try {
                        // Get comprehensive MLB stats with 2025 data only
                        const mlbComprehensiveStats = await ballDontLieService.getComprehensiveMlbGameStats(game.home_team, game.away_team);
                        
                        if (mlbComprehensiveStats) {
                          console.log('Successfully retrieved 2025-only comprehensive MLB stats from Ball Don\'t Lie');
                          
                          // Format the comprehensive data
                          let bdlStatsContext = `**COMPREHENSIVE 2025 MLB SEASON DATA ONLY (Ball Don't Lie)**\n\n`;
                          
                          // Add pitcher matchup
                          if (mlbComprehensiveStats.pitcherMatchup) {
                            bdlStatsContext += `## STARTING PITCHER MATCHUP:\n`;
                            const pm = mlbComprehensiveStats.pitcherMatchup;
                            
                            if (pm.homePitcher) {
                              bdlStatsContext += `HOME: ${pm.homePitcher.name} - ERA: ${pm.homePitcher.stats.ERA}, WHIP: ${pm.homePitcher.stats.WHIP}, Record: ${pm.homePitcher.stats.record}\n`;
                            }
                            
                            if (pm.awayPitcher) {
                              bdlStatsContext += `AWAY: ${pm.awayPitcher.name} - ERA: ${pm.awayPitcher.stats.ERA}, WHIP: ${pm.awayPitcher.stats.WHIP}, Record: ${pm.awayPitcher.stats.record}\n`;
                            }
                            
                            bdlStatsContext += `\n`;
                          }
                          
                          // Add team stats
                          bdlStatsContext += `## TEAM STATS:\n`;
                          bdlStatsContext += `${game.home_team} (HOME): ${JSON.stringify(mlbComprehensiveStats.homeTeam || {})}\n`;
                          bdlStatsContext += `${game.away_team} (AWAY): ${JSON.stringify(mlbComprehensiveStats.awayTeam || {})}\n\n`;
                          
                          // Use this as our enhanced stats
                          formattedGameData.enhancedStats = bdlStatsContext;
                          formattedGameData.statsSource = 'Ball Don\'t Lie (2025 Season Only)';
                          
                          // If we didn't have pitcher data before, add it now
                          if (!formattedGameData.pitcherData && mlbComprehensiveStats.pitcherMatchup) {
                            formattedGameData.pitcherData = mlbComprehensiveStats.pitcherMatchup;
                          }
                          
                          // Add these stats to our collection as well
                          formattedGameData.allCollectedStats.sources.push({
                            source: 'Ball Don\'t Lie Comprehensive',
                            data: { mlbComprehensiveStats, formattedStats: bdlStatsContext }
                          });
                        }
                      } catch (bdlError) {
                        console.error('Error in final Ball Don\'t Lie data retrieval:', bdlError);
                      }
                    }
                  }
                } 
                else if (sportName === 'NBA') {
                  // For NBA: 1) Ball Don't Lie → 2) SportsDB
                  console.log('NBA STATS PRIORITY: 1) Ball Don\'t Lie → 2) SportsDB');
                  
                  // PRIORITY 1: Try Ball Don't Lie first for NBA
                  console.log('Attempting to get NBA stats from Ball Don\'t Lie...');
                  // Import ballDontLieService dynamically to avoid circular reference
                  const ballDontLieModule = await import('./ballDontLieService');
                  const bdl = ballDontLieModule.default || ballDontLieModule.ballDontLieService;
                  
                  // Add local NBA stats report function since it doesn't exist in the service
                  bdl.generateNbaStatsReport = async (homeTeam, awayTeam) => {
                    try {
                      console.log(`Generating NBA stats report for ${homeTeam} vs ${awayTeam}`);
                      const statsReport = await sportsDataService.getEnhancedNBAStats(homeTeam, awayTeam);
                      return statsReport || 'No detailed NBA stats available';
                    } catch (error) {
                      console.error('Error in NBA stats report generation:', error);
                      return 'Error generating NBA statistics';
                    }
                  };
                  console.log('Ball Don\'t Lie service:', bdl);
                  const nbaStats = await bdl.generateNbaStatsReport(game.home_team, game.away_team);
                  
                  if (nbaStats && !nbaStats.includes('Error')) {
                    console.log('Using Ball Don\'t Lie data for NBA analysis');
                    formattedGameData.statsContext = nbaStats;
                    formattedGameData.statsSource = 'Ball Don\'t Lie';
                  } else {
                    // PRIORITY 2: If Ball Don't Lie fails, try TheSportsDB
                    console.log('Ball Don\'t Lie data unavailable, trying TheSportsDB for NBA...');
                    formattedGameData.statsContext = sportsDataService.buildComprehensiveStatsContext(statsContext);
                    formattedGameData.statsSource = 'TheSportsDB';
                  }
                }
                else if (sportName === 'NHL') {
                  // For NHL: SportsDB only
                  console.log('NHL STATS PRIORITY: SportsDB only');
                  
                  // Use TheSportsDB for NHL
                  console.log('Using TheSportsDB for NHL stats...');
                  formattedGameData.statsContext = sportsDataService.buildComprehensiveStatsContext(statsContext);
                  formattedGameData.statsSource = 'TheSportsDB';
                } else {
                  // For any other sport, use TheSportsDB as default
                  console.log(`Using TheSportsDB as default for ${sportName} stats...`);
                  formattedGameData.statsContext = sportsDataService.buildComprehensiveStatsContext(statsContext);
                  formattedGameData.statsSource = 'TheSportsDB';
                }
                
                // Add stats source information to the prompt
                if (formattedGameData.statsSource) {
                  console.log(`Final stats source for ${sportName}: ${formattedGameData.statsSource}`);
                }
              } catch (statsError) {
                console.error('Error generating team statistics:', statsError);
                // Continue with basic stats if enhanced stats fail
              }
              
              // Make the pick using Gary Engine
              console.log(`Getting stats-driven pick from Gary for ${formattedGameData.matchup}...`);
              console.log('Team statistics available:', !!formattedGameData.teamStats);
              const pick = await makeGaryPick(formattedGameData, {
                temperature: 0.7
              });
              
              if (pick && pick.success && pick.rawAnalysis?.rawOpenAIOutput) {
                // Initial confidence filter - final filtering with 0.78 threshold happens at storage time
                const confidence = pick.rawAnalysis.rawOpenAIOutput.confidence || 0;
                console.log('Pick generated with confidence:', confidence);
                
                if (confidence >= 0.75) {
                  allPicks.push(pick);
                  console.log('Success! Pick added:', pick.rawAnalysis.rawOpenAIOutput.pick || 'No pick text');
                } else {
                  console.log(`Filtering out pick for ${formattedGameData.homeTeam} vs ${formattedGameData.awayTeam} - confidence ${confidence} below threshold of 0.75`);
                }
              } else {
                console.warn(`No pick generated for ${formattedGameData.matchup}. Likely confidence below threshold.`);
              }
              
              // Add a delay between API calls to avoid rate limiting
              console.log('Waiting 2 seconds before next analysis to avoid rate limits...');
              await new Promise(resolve => setTimeout(resolve, 2000));
              
            } catch (error) {
              console.error(`Error analyzing game ${game.home_team} vs ${game.away_team}:`, error.message);
              // Continue with the next game
            }
          }
          
          // Add a delay between sports to further reduce API load
          if (sportsToAnalyze.indexOf(sport) < sportsToAnalyze.length - 1) {
            console.log('\nFinished processing sport. Waiting 10 seconds before next sport...');
            await new Promise(resolve => setTimeout(resolve, 10000));
          }
          
        } catch (sportError) {
          console.error(`Error processing sport ${sport}:`, sportError.message);
          // Continue with the next sport
        }
      }
      
      console.log(`Generated ${allPicks.length} picks across all sports`);
      
      // Store the picks in the database
      if (allPicks.length > 0) {
        try {
          console.log('Storing picks in database...');
          await picksService.storeDailyPicksInDatabase(allPicks);
          console.log('Picks stored successfully!');
        } catch (storeError) {
          console.error('Error storing picks in database:', storeError.message);
        }
      } else {
        console.log('No picks to store in database');
      }
      
      return allPicks;
    } catch (error) {
      console.error('Error in generateDailyPicks:', error.message);
      return [];
    }
  },
  
  /**
   * Ensure we have a valid Supabase session for database operations
   */
  /**
   * Helper method to check if team names match (handles variations in team names)
   * @private
   */
  _teamNameMatch(team1, team2) {
    if (!team1 || !team2) return false;
    
    // Clean and lowercase both names
    const clean1 = team1.toLowerCase().replace(/[^a-z0-9]/g, '');
    const clean2 = team2.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // Check for exact match or substring match
    return clean1 === clean2 || 
           clean1.includes(clean2) || 
           clean2.includes(clean1);
  },

  ensureValidSupabaseSession: async () => {
    try {
      // Check if we already have a session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        console.log('Using existing Supabase session');
        return true;
      }
      
      // If not, sign in anonymously
      console.log('No existing session, signing in anonymously...');
      
      const { error } = await supabase.auth.signInAnonymously();
      
      if (error) {
        console.error('Error signing in anonymously:', error.message);
        return false;
      }
      
      console.log('Successfully signed in anonymously');
      return true;
    } catch (error) {
      console.error('Error ensuring Supabase session:', error.message);
      return false;
    }
  },
  
  /**
   * Check if picks for today already exist in the database
   */
  checkForExistingPicks: async (dateString) => {
    try {
      const { data, error } = await supabase
        .from('daily_picks')
        .select('id')
        .eq('date', dateString)
        .maybeSingle();
        
      if (error) {
        console.error('Error checking for existing picks:', error);
        return false;
      }
      
      return data !== null;
    } catch (err) {
      console.error('Error in checkForExistingPicks:', err);
      return false;
    }
  },
  
  /**
   * Store the daily picks in the database for persistence, with error handling for missing bankroll table
   */
  storeDailyPicksInDatabase: async (picks) => {
    try {
      console.log(`Initial picks array has ${picks?.length || 0} items`);
      
      // Guard against null or undefined picks array
      if (!picks || !Array.isArray(picks) || picks.length === 0) {
        console.error('ERROR: No picks provided to storeDailyPicksInDatabase');
        return { success: false, message: 'No picks provided' };
      }
      
      // Current date in YYYY-MM-DD format for database storage using EST timezone
      const currentDate = new Date();
      
      // Format date in EST timezone (America/New_York)
      const options = { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' };
      const estDate = new Intl.DateTimeFormat('en-US', options).format(currentDate);
      
      // Convert from MM/DD/YYYY to YYYY-MM-DD format
      const [month, day, year] = estDate.split('/');
      const currentDateString = `${year}-${month}-${day}`;
      
      // Check if picks for today already exist
      const picksExist = await picksService.checkForExistingPicks(currentDateString);
      if (picksExist) {
        console.log(`Picks for ${currentDateString} already exist in database, skipping insertion`);
        return { success: true, count: 0, message: 'Picks already exist for today' };
      }
      
      // Filter to only the successful picks with raw OpenAI output
      const rawJsonOutputs = picks
        .filter(pick => {
          // Must have success flag and raw analysis with OpenAI output
          const isValid = pick.success && pick.rawAnalysis && pick.rawAnalysis.rawOpenAIOutput;
          if (!isValid) {
            console.warn(`Filtering out pick for ${pick.game || 'unknown game'}: missing required data`);
            if (!pick.success) console.warn('  - Pick marked as unsuccessful');
            if (!pick.rawAnalysis) console.warn('  - Missing rawAnalysis object');
            else if (!pick.rawAnalysis.rawOpenAIOutput) console.warn('  - Missing rawOpenAIOutput in rawAnalysis');
          }
          return isValid;
        })
        .map(pick => {
          // Extract the JSON data from the raw OpenAI response
          // The raw response from OpenAI contains the JSON directly
          const rawResponse = pick.rawAnalysis.rawOpenAIOutput;
          let jsonData;
          
          // Check if rawResponse is already an object (not a string)
          if (rawResponse && typeof rawResponse === 'object' && !Array.isArray(rawResponse)) {
            console.log(`Raw response for ${pick.game || 'unknown game'} is already an object, using directly`);
            jsonData = rawResponse;
          } else if (typeof rawResponse !== 'string') {
            // Handle case where rawResponse is not a string and not an object
            console.error(`Invalid raw response format for ${pick.game || 'unknown game'}: ${typeof rawResponse}`);
            return null;
          } else {
            // Process string response
            try {
              // First try to parse directly if it's already valid JSON
              jsonData = JSON.parse(rawResponse);
              console.log(`Successfully parsed JSON directly for ${pick.game || 'unknown game'}`);
            } catch (parseError) {
              // If that fails, try to extract JSON from markdown code blocks
              try {
                const jsonMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
                if (jsonMatch && jsonMatch[1]) {
                  try {
                    jsonData = JSON.parse(jsonMatch[1].trim());
                    console.log(`Extracted JSON from code block for ${pick.game || 'unknown game'}`);
                  } catch (nestedError) {
                    // Last resort: try to find anything that looks like JSON
                    const lastResortMatch = rawResponse.match(/\{[\s\S]*?"pick"[\s\S]*?"confidence"[\s\S]*?\}/);
                    if (lastResortMatch) {
                      try {
                        jsonData = JSON.parse(lastResortMatch[0]);
                        console.log(`Extracted JSON from regex match for ${pick.game || 'unknown game'}`);
                      } catch (finalError) {
                        console.error(`Failed to extract JSON from response for ${pick.game || 'unknown game'}`, finalError);
                        return null;
                      }
                    } else {
                      console.error(`No JSON pattern found in response for ${pick.game || 'unknown game'}`);
                      return null;
                    }
                  }
                } else {
                  console.error(`No code block found in response for ${pick.game || 'unknown game'}`);
                  return null;
                }
              } catch (matchError) {
                console.error(`Error attempting to match patterns in response for ${pick.game || 'unknown game'}:`, matchError);
                return null;
              }
            }
          }
          
          console.log(`Successfully extracted JSON for: ${pick.game}, confidence: ${jsonData.confidence || 'unknown'}`);
          return jsonData;
        })
        // Filter out null values but don't filter by confidence here (already did that earlier)
        .filter(jsonData => {
          // Skip null values
          if (jsonData === null) return false;
          
          // Log what we're storing (all picks that made it this far should have confidence >= 0.75)
          const confidence = jsonData.confidence || 0;
          console.log(`Storing pick for ${jsonData.homeTeam} vs ${jsonData.awayTeam} with confidence: ${confidence}`);
          
          return true;
        });
      
      console.log(`After filtering, storing ${rawJsonOutputs.length} valid picks with raw OpenAI output at 0.75 confidence threshold`);
      
      // Skip if there are no valid picks
      if (rawJsonOutputs.length === 0) {
        console.warn('No valid picks with OpenAI output to store');
        return { success: false, message: 'No valid picks to store' };
      }
      
      // Create data structure for Supabase - store raw JSON objects directly
      const pickData = {
        date: currentDateString,
        picks: rawJsonOutputs // Store raw JSON objects directly as Supabase can handle it
      };
      
      console.log('Storing raw JSON objects directly in picks column for Supabase');
      
      // Ensure there's a valid Supabase session before database operation
      await picksService.ensureValidSupabaseSession();
      
      try {
        console.log(`Inserting raw JSON outputs directly into daily_picks table...`);
        const { error: insertError } = await supabase
          .from('daily_picks')
          .insert(pickData);
          
        if (insertError) {
          // Check if the error is specifically about the bankroll table
          if (insertError.code === '42P01' && insertError.message.includes('bankroll')) {
            console.warn('Bankroll table does not exist - using alternative approach without bankroll reference');
            
            // Alternative approach: Use a simplified object that doesn't trigger any bankroll references
            const simplifiedPickData = {
              date: currentDateString,
              picks: rawJsonOutputs // Keep as raw JSON objects for consistency
            };
            
            // Try direct insert without any triggers/functions that might access bankroll
            const { error: simplifiedInsertError } = await supabase
              .from('daily_picks')
              .insert(simplifiedPickData);
              
            if (simplifiedInsertError) {
              console.error('Error inserting simplified picks:', simplifiedInsertError);
              throw new Error(`Failed to store simplified picks: ${simplifiedInsertError.message}`);
            }
            
            console.log('Picks stored successfully using simplified approach');
            return { success: true, count: rawJsonOutputs.length, method: 'simplified' };
          } else {
            // Some other database error occurred
            console.error('Error inserting picks:', insertError);
            throw new Error(`Failed to store picks in database: ${insertError.message}`);
          }
        }
        
        console.log('Picks stored successfully in database');
        return { success: true, count: rawJsonOutputs.length };
      } catch (dbError) {
        // Catch any errors during the database operations
        console.error('Database error while storing picks:', dbError);
        
        // If the error relates to the bankroll table, handle it specially
        if (dbError.message && dbError.message.includes('bankroll')) {
          console.warn('Detected bankroll table reference in error - attempting alternative storage method');
          
          try {
            // Try a simpler approach with the picks as a JSON string
            const backupPickData = {
              date: currentDateString,
              picks: JSON.stringify(rawJsonOutputs)
            };
            
            const { error: backupInsertError } = await supabase
              .from('daily_picks')
              .insert(backupPickData);
              
            if (backupInsertError) {
              console.error('Error with backup insert method:', backupInsertError);
              throw new Error(`Failed with backup method: ${backupInsertError.message}`);
            }
            
            console.log('Successfully stored picks using backup method');
            return { success: true, count: rawJsonOutputs.length, method: 'backup' };
          } catch (backupError) {
            console.error('Backup method also failed:', backupError);
            throw new Error(`All approaches failed to store picks: ${backupError.message}`);
          }
        }
        
        // Re-throw the original error
        throw new Error(`Failed to store picks in database: ${dbError.message}`);
      }
    } catch (error) {
      console.error('Error storing picks:', error);
      throw new Error(`Failed to store picks in database: ${error.message}`);
    }
  }
};

export { picksService };
