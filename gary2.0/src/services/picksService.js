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
              
              // For MLB games, get additional pitcher data if available
              let pitcherData = '';
              if (sportName === 'MLB') {
                try {
                  console.log('Fetching MLB starting pitcher data with prioritized sources...');
                  
                  // PRIORITY 1: Try API-Sports first (primary source for MLB)
                  console.log('PRIORITY 1: Trying API-Sports for MLB pitcher data...');
                  let pitcherMatchup = await apiSportsService.getMlbStartingPitchers(game.home_team, game.away_team);
                  let dataSource = 'API-Sports';
                  
                  // PRIORITY 2: If API-Sports fails, try TheSportsDB
                  if (!pitcherMatchup) {
                    console.log('API-Sports data unavailable, falling back to TheSportsDB...');
                    pitcherMatchup = await sportsDataService.getMlbStartingPitchers(game.home_team, game.away_team);
                    dataSource = 'TheSportsDB';
                  }
                  
                  // PRIORITY 3: Try ESPN via Perplexity
                  // This is the same data source that's working well for prop picks
                  if (!pitcherMatchup || !pitcherMatchup.homePitcher || !pitcherMatchup.awayPitcher) {
                    console.log('Traditional services failed to provide pitcher data. Trying ESPN via Perplexity...');
                    try {
                      // Import perplexityService dynamically to avoid circular reference
                      const { perplexityService } = await import('./perplexityService.js');
                      
                      // Get ESPN game links for today
                      const gameLinks = await perplexityService.getEspnGameLinks('mlb');
                      
                      if (gameLinks && gameLinks.length > 0) {
                        // Normalize team names for matching
                        const normalizedHomeTeam = game.home_team.toLowerCase().replace(/\s+/g, '');
                        const normalizedAwayTeam = game.away_team.toLowerCase().replace(/\s+/g, '');
                        
                        // Try each game link to find our matchup
                        for (const link of gameLinks) {
                          console.log(`Checking ESPN link for pitcher data: ${link}`);
                          const stats = await perplexityService.extractStatsFromEspn(link, 'mlb');
                          
                          if (stats && stats['Game information']) {
                            // Check if this is the right game
                            const infoStr = JSON.stringify(stats['Game information']).toLowerCase();
                            if (infoStr.includes(normalizedHomeTeam) || infoStr.includes(normalizedAwayTeam)) {
                              console.log('✅ Found matching ESPN game data!');
                              
                              // Extract pitcher data if available
                              if (stats['Probable pitchers']) {
                                dataSource = 'ESPN via Perplexity';
                                console.log('Found pitcher data from ESPN!');
                                
                                // Create a compatible format with our other sources
                                pitcherMatchup = {
                                  homePitcher: null,
                                  awayPitcher: null,
                                  game: { venue: stats['Game information'].Venue || '', date: stats['Game information'].Date || '', time: stats['Game information'].Time || '' }
                                };
                                
                                // Parse the ESPN pitcher data for home and away
                                const pitchers = stats['Probable pitchers'];
                                for (const key in pitchers) {
                                  const pitcherInfo = pitchers[key];
                                  // Determine if this is home or away pitcher
                                  const isHomePitcher = key.toLowerCase().includes(normalizedHomeTeam);
                                  
                                  const pitcher = {
                                    name: pitcherInfo.Name || 'Unknown',
                                    stats: {
                                      ERA: pitcherInfo.ERA || 'N/A',
                                      WHIP: pitcherInfo.WHIP || 'N/A',
                                      record: pitcherInfo.Record || 'N/A',
                                      strikeouts: pitcherInfo.K || 'N/A',
                                      inningsPitched: pitcherInfo.IP || 'N/A',
                                      description: `${pitcherInfo.Name || 'Pitcher'} (${pitcherInfo.Record || '0-0'}, ${pitcherInfo.ERA || '0.00'} ERA)`
                                    }
                                  };
                                  
                                  // Assign to correct spot
                                  if (isHomePitcher) {
                                    pitcherMatchup.homePitcher = pitcher;
                                  } else {
                                    pitcherMatchup.awayPitcher = pitcher;
                                  }
                                }
                                
                                // Break loop if we found good data
                                if (pitcherMatchup.homePitcher && pitcherMatchup.awayPitcher) {
                                  console.log('Found both pitchers from ESPN data!');
                                  break;
                                }
                              }
                            }
                          }
                        }
                      }
                    } catch (espnError) {
                      console.error('Error fetching pitcher data from ESPN:', espnError.message);
                    }
                  }
                  
                  // PRIORITY 4: If all else fails, just continue without pitcher data
                  
                  if (pitcherMatchup) {
                    pitcherData = `STARTING PITCHERS (Data Source: ${dataSource}):\n`;
                    
                    // Format for API-Sports response
                    if (dataSource === 'API-Sports') {
                      // Add home pitcher data
                      if (pitcherMatchup.homePitcher) {
                        const homePitcher = pitcherMatchup.homePitcher;
                        pitcherData += `${game.home_team} Starting Pitcher: ${homePitcher.name}\n`;
                        pitcherData += `- ERA: ${homePitcher.stats.ERA}\n`;
                        pitcherData += `- WHIP: ${homePitcher.stats.WHIP}\n`;
                        pitcherData += `- Record: ${homePitcher.stats.record}\n`;
                        pitcherData += `- K's: ${homePitcher.stats.strikeouts}\n`;
                        if (homePitcher.stats.inningsPitched && homePitcher.stats.inningsPitched !== 'N/A') {
                          pitcherData += `- Innings Pitched: ${homePitcher.stats.inningsPitched}\n`;
                        }
                        pitcherData += `- ${homePitcher.stats.description}\n`;
                      }
                      
                      // Add away pitcher data
                      if (pitcherMatchup.awayPitcher) {
                        const awayPitcher = pitcherMatchup.awayPitcher;
                        pitcherData += `${game.away_team} Starting Pitcher: ${awayPitcher.name}\n`;
                        pitcherData += `- ERA: ${awayPitcher.stats.ERA}\n`;
                        pitcherData += `- WHIP: ${awayPitcher.stats.WHIP}\n`;
                        pitcherData += `- Record: ${awayPitcher.stats.record}\n`;
                        pitcherData += `- K's: ${awayPitcher.stats.strikeouts}\n`;
                        if (awayPitcher.stats.inningsPitched && awayPitcher.stats.inningsPitched !== 'N/A') {
                          pitcherData += `- Innings Pitched: ${awayPitcher.stats.inningsPitched}\n`;
                        }
                        pitcherData += `- ${awayPitcher.stats.description}\n`;
                      }
                      
                      // Add game details if available
                      if (pitcherMatchup.game) {
                        pitcherData += `\nGame at ${pitcherMatchup.game.venue} on ${pitcherMatchup.game.date} at ${pitcherMatchup.game.time || 'TBD'}`;
                      }
                    } 
                    // Format for TheSportsDB response (using existing format)
                    else if (dataSource === 'TheSportsDB') {
                      // Create local helper for team name matching to avoid scope issues
                      const matchTeamNames = (team1, team2) => {
                        if (!team1 || !team2) return false;
                        const clean1 = team1.toLowerCase().replace(/[^a-z0-9]/g, '');
                        const clean2 = team2.toLowerCase().replace(/[^a-z0-9]/g, '');
                        return clean1 === clean2 || clean1.includes(clean2) || clean2.includes(clean1);
                      };
                      
                      // Add home team pitcher data if available
                      if (pitcherMatchup.teamPitcher && matchTeamNames(pitcherMatchup.team, game.home_team)) {
                        const homePitcher = pitcherMatchup.teamPitcher;
                        pitcherData += `${game.home_team} Starting Pitcher: ${homePitcher.name}\n`;
                        pitcherData += `- ERA: ${homePitcher.stats.ERA}\n`;
                        pitcherData += `- Record: ${homePitcher.stats.record}\n`;
                        pitcherData += `- K's: ${homePitcher.stats.strikeouts}\n`;
                        if (homePitcher.stats.WHIP && homePitcher.stats.WHIP !== 'N/A') {
                          pitcherData += `- WHIP: ${homePitcher.stats.WHIP}\n`;
                        }
                        pitcherData += `- ${homePitcher.stats.description}\n`;
                      }
                      
                      // Add away team pitcher data if available
                      if (pitcherMatchup.opponentPitcher || 
                          (pitcherMatchup.teamPitcher && matchTeamNames(pitcherMatchup.team, game.away_team))) {
                        const awayPitcher = matchTeamNames(pitcherMatchup.team, game.away_team) 
                          ? pitcherMatchup.teamPitcher 
                          : pitcherMatchup.opponentPitcher;
                          
                        pitcherData += `${game.away_team} Starting Pitcher: ${awayPitcher.name}\n`;
                        pitcherData += `- ERA: ${awayPitcher.stats.ERA}\n`;
                        pitcherData += `- Record: ${awayPitcher.stats.record}\n`;
                        pitcherData += `- K's: ${awayPitcher.stats.strikeouts}\n`;
                        if (awayPitcher.stats.WHIP && awayPitcher.stats.WHIP !== 'N/A') {
                          pitcherData += `- WHIP: ${awayPitcher.stats.WHIP}\n`;
                        }
                        pitcherData += `- ${awayPitcher.stats.description}\n`;
                      }
                      
                      // Add game details if available
                      if (pitcherMatchup.game) {
                        pitcherData += `\nGame at ${pitcherMatchup.game.venue} on ${pitcherMatchup.game.date}`;
                      }
                      
                      // Add note if this is fallback data and not from today's lineup
                      if (pitcherMatchup.note) {
                        pitcherData += `\n(${pitcherMatchup.note})`;
                      }
                    }
                    
                    // Add note about importance of pitcher stats
                    pitcherData += '\n\nNOTE: For MLB games, starting pitcher stats are more important than team ERA.';
                  } else {
                    // PRIORITY 3 FALLBACK: Use Ball Don't Lie or generic message
                    console.log('All pitcher data sources failed, using generic message');
                    pitcherData = `PITCHING MATCHUP: No specific starting pitcher data available. Focus on analyzing the pitching matchup using recent performance metrics.`;
                  }
                } catch (error) {
                  console.error('Error fetching MLB pitcher data:', error.message);
                  pitcherData = `PITCHING MATCHUP: Check starting pitchers' stats including ERA, WHIP, K/9, and recent performances.`;
                }
              }
              
              // Use Perplexity to get game time and headlines
              console.log('Fetching game time and headlines from Perplexity...');
              let gameTimeData = { gameTime: 'TBD', headlines: [], keyInjuries: { homeTeam: [], awayTeam: [] }};
              try {
                // Import perplexityService dynamically to avoid circular reference
                const { perplexityService } = await import('./perplexityService');
                gameTimeData = await perplexityService.getGameTimeAndHeadlines(
                  game.home_team,
                  game.away_team,
                  sportName
                );
                console.log(`Game time data fetched: ${gameTimeData.gameTime}`);
                console.log(`Headlines: ${gameTimeData.headlines.length > 0 ? 'Available' : 'None'}`); 
              } catch (perplexityError) {
                console.error('Error fetching game time and headlines:', perplexityError);
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
                  // For MLB now we prioritize Ball Don't Lie for pitcher data, which is the most critical
                  console.log('MLB STATS PRIORITY: 1) Ball Don\'t Lie for pitcher data → 2) API-Sports for team data → 3) SportsDB as fallback');
                  
                  // PRIORITY 1: Try Ball Don't Lie for pitcher data first
                  console.log('Attempting to get 2025 MLB pitcher stats from Ball Don\'t Lie...');
                  // Import ballDontLieService first for pitcher data
                  const ballDontLieModule = await import('./ballDontLieService');
                  const ballDontLieService = ballDontLieModule.ballDontLieService;
                  
                  // Get pitcher matchup data with 2025 stats only
                  let pitcherStats = null;
                  let mlbComprehensiveStats = null;
                  try {
                    // First, try to get the comprehensive MLB game stats
                    mlbComprehensiveStats = await ballDontLieService.getComprehensiveMlbGameStats(game.home_team, game.away_team);
                    
                    if (mlbComprehensiveStats) {
                      console.log('Successfully retrieved comprehensive MLB stats from Ball Don\'t Lie');
                      // Extract pitcher matchup
                      pitcherStats = mlbComprehensiveStats.pitcherMatchup;
                    } else {
                      // Fallback to just pitcher matchup
                      console.log('Falling back to just pitcher matchup data...');
                      pitcherStats = await ballDontLieService.getMlbPitcherMatchup(game.home_team, game.away_team);
                    }
                  } catch (error) {
                    console.error('Error getting MLB stats from Ball Don\'t Lie:', error);
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
                  const [apiSportsStats, playerStatsReport] = await Promise.all([
                    apiSportsService.getMlbTeamStats(game.home_team, game.away_team),
                    mlbPlayerStatsService.generateMlbPlayerStatsReport(game.home_team, game.away_team, date)
                  ]);
                  
                  // Combine Ball Don't Lie pitcher data with API-Sports team stats
                  if (pitcherStats || apiSportsStats) {
                    console.log('Integrating Ball Don\'t Lie pitcher data with team stats for MLB analysis');
                    
                    // First, ensure we have a base structure even if API-Sports data is missing
                    const homeTeam = apiSportsStats?.homeTeam || { teamName: game.home_team, wins: 0, losses: 0, homeRecord: 'N/A', batting: {}, pitching: {} };
                    const awayTeam = apiSportsStats?.awayTeam || { teamName: game.away_team, wins: 0, losses: 0, awayRecord: 'N/A', batting: {}, pitching: {} };
                    
                    let formattedStatsContext = `**2025 MLB CURRENT SEASON DATA ONLY**\n\n`;
                    
                    // FIRST: Add Ball Don't Lie pitcher data (2025 season stats only)
                    if (pitcherStats) {
                      console.log('Including 2025 pitcher matchup data from Ball Don\'t Lie');
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
                    formattedGameData.statsContext = formattedStatsContext;
                    formattedGameData.enhancedStats = `TEAM STATS SUMMARY:\n${formattedStatsContext}`;
                    formattedGameData.statsSource = 'API-Sports with Player Stats';
                    
                    // Add these stats to our collection as well - be flexible
                    formattedGameData.allCollectedStats.sources.push({
                      source: 'API-Sports',
                      data: { apiSportsStats, playerStatsReport, formattedStats: formattedStatsContext }
                    });
                    
                    // If we have pitcher data from Ball Don't Lie, add that too
                    if (pitcherStats) {
                      formattedGameData.allCollectedStats.sources.push({
                        source: 'Ball Don\'t Lie',
                        data: { pitcherStats, note: '2025 MLB Pitcher Data Only' }
                      });
                    }
                  } else {
                    // PRIORITY 2: If API-Sports fails, try TheSportsDB
                    console.log('API-Sports data unavailable, trying TheSportsDB for MLB...');
                    formattedGameData.statsContext = sportsDataService.buildComprehensiveStatsContext(statsContext);
                    formattedGameData.statsSource = 'TheSportsDB';
                    
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
                // Strictly enforce the 0.75 confidence threshold
                const confidence = pick.rawAnalysis.rawOpenAIOutput.confidence || 0;
                console.log('Pick generated with confidence:', confidence);
                
                if (confidence >= 0.7) {
                  allPicks.push(pick);
                  console.log('Success! Pick added:', pick.rawAnalysis.rawOpenAIOutput.pick || 'No pick text');
                } else {
                  console.warn(`Filtering out pick for ${formattedGameData.matchup} - confidence ${confidence} below threshold of 0.7`);
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
        // Filter out null values and picks with confidence below threshold
        .filter(jsonData => {
          // Skip null values
          if (jsonData === null) return false;
          
          // Use 0.75 as the confidence threshold
          const confidence = jsonData.confidence || 0;
          const isAboveThreshold = confidence >= 0.75;
          
          if (!isAboveThreshold) {
            console.warn(`Filtering out pick (${jsonData.homeTeam} vs ${jsonData.awayTeam}) at database storage - confidence ${confidence} below threshold of 0.75`);
          } else {
            console.log(`Storing pick for ${jsonData.homeTeam} vs ${jsonData.awayTeam} with confidence: ${confidence}`);
          }
          
          return isAboveThreshold;
        });
      
      console.log(`After filtering, storing ${rawJsonOutputs.length} valid picks with raw OpenAI output above 0.75 confidence threshold`);
      
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
