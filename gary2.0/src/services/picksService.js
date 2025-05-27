/**
 * Gary Picks Service - Fully Integrated
 * Handles MLB (normal + props), NBA, and NHL pick generation and storage
 */
import { makeGaryPick } from './garyEngine.js';
import { oddsService } from './oddsService.js';
import { supabase } from '../supabaseClient.js';
import { apiSportsService } from './apiSportsService.js';
import { ballDontLieService } from './ballDontLieService.js';
import { nhlPlayoffService } from './nhlPlayoffService.js';
import { picksService as enhancedPicksService } from './picksService.enhanced.js';
import { mlbPicksGenerationService } from './mlbPicksGenerationService.js';
import { openaiService } from './openaiService.js';

// Global processing state to prevent multiple simultaneous generations
let isCurrentlyGeneratingPicks = false;
let lastGenerationTime = 0;
const GENERATION_COOLDOWN = 30 * 1000; // 30 seconds

// Add deduplication and processing locks to prevent repetitive processing
const processedGames = new Set();
const processingLocks = new Map();
const apiCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Process a game only once with locking mechanism
 * @param {string} gameId - Unique game identifier
 * @param {Function} processingFunction - Function to process the game
 * @returns {Promise} - Processing result or null if already processed
 */
const processGameOnce = async (gameId, processingFunction) => {
  const lockKey = `${gameId}-${Date.now()}`;
  
  if (processedGames.has(gameId)) {
    console.log(`🔄 Game ${gameId} already processed, skipping...`);
    return null;
  }
  
  if (processingLocks.has(gameId)) {
    console.log(`🔄 Game ${gameId} currently being processed, waiting...`);
    return processingLocks.get(gameId);
  }
  
  const processingPromise = processingFunction(gameId);
  processingLocks.set(gameId, processingPromise);
  
  try {
    const result = await processingPromise;
    processedGames.add(gameId);
    return result;
  } finally {
    processingLocks.delete(gameId);
  }
};

/**
 * Cached API call to prevent duplicate requests
 * @param {string} key - Cache key
 * @param {Function} apiFunction - Function to call API
 * @returns {Promise} - Cached or fresh API result
 */
const cachedApiCall = async (key, apiFunction) => {
  const cached = apiCache.get(key);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    console.log(`🔄 Using cached data for ${key}`);
    return cached.data;
  }

  console.log(`🔄 Making fresh API call for ${key}`);
  const data = await apiFunction();
  apiCache.set(key, { data, timestamp: Date.now() });
  return data;
};

// Helper: Checks if team names match (handles small variations)
function _teamNameMatch(team1, team2) {
  if (!team1 || !team2) return false;
  const clean1 = team1.toLowerCase().replace(/[^a-z0-9]/g, '');
  const clean2 = team2.toLowerCase().replace(/[^a-z0-9]/g, '');
  return clean1 === clean2 || clean1.includes(clean2) || clean2.includes(clean1);
}

// Helper: Ensures valid Supabase session
async function ensureValidSupabaseSession() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) return false;
    }
    return true;
  } catch {
    return false;
  }
}

// Helper: Check if picks for today exist
async function checkForExistingPicks(dateString) {
  await ensureValidSupabaseSession();
  const { data, error } = await supabase
    .from('daily_picks')
    .select('id')
    .eq('date', dateString)
    .limit(1);
  if (error) return false;
  return data && data.length > 0;
}

// Helper: Store picks in database
async function storeDailyPicksInDatabase(picks) {
  if (!picks || !Array.isArray(picks) || picks.length === 0)
    return { success: false, message: 'No picks provided' };

  console.log(`Initial picks array has ${picks.length} items`);

  // EST date for today in YYYY-MM-DD
  const now = new Date();
  const options = { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' };
  const estDate = new Intl.DateTimeFormat('en-US', options).format(now);
  const [month, day, year] = estDate.split('/');
  const currentDateString = `${year}-${month}-${day}`;
  
  console.log(`Storing picks for date: ${currentDateString}`);

  // Check if picks already exist
  const picksExist = await checkForExistingPicks(currentDateString);
  if (picksExist) {
    console.log(`Picks for ${currentDateString} already exist in database, skipping insertion`);
    return { success: true, count: 0, message: 'Picks already exist for today' };
  }

  // Simplify pick structure to only include essential fields from OpenAI output
  const validPicks = picks.map(pick => {
    // Extract the OpenAI output fields which contain the essential pick data
    let openAIOutput = null;
    
    // First try to get the data from the standardized paths
    if (pick.rawAnalysis?.rawOpenAIOutput) {
      openAIOutput = pick.rawAnalysis.rawOpenAIOutput;
    } else if (pick.analysis?.rawOpenAIOutput) {
      openAIOutput = pick.analysis.rawOpenAIOutput;
    }
    
    // If we found the OpenAI output, return just those fields
    if (openAIOutput) {
      return {
        pick: openAIOutput.pick || pick.pick,
        time: openAIOutput.time || pick.time,
        type: openAIOutput.type || pick.type,
        league: openAIOutput.league || pick.league,
        revenge: openAIOutput.revenge || false,
        awayTeam: openAIOutput.awayTeam || pick.awayTeam,
        homeTeam: openAIOutput.homeTeam || pick.homeTeam,
        momentum: openAIOutput.momentum || 0,
        rationale: openAIOutput.rationale || pick.rationale,
        trapAlert: openAIOutput.trapAlert || false,
        confidence: openAIOutput.confidence || pick.confidence,
        superstition: openAIOutput.superstition || false,
        // Include sport for filtering
        sport: pick.sport
      };
    }
    
    // Fallback to original fields if we can't find the OpenAI output
    return {
      pick: pick.pick,
      time: pick.time,
      type: pick.type || 'moneyline',
      league: pick.league || 'NBA',
      revenge: false,
      awayTeam: pick.awayTeam,
      homeTeam: pick.homeTeam,
      momentum: 0,
      rationale: pick.rationale,
      trapAlert: false,
      confidence: pick.confidence || 0,
      superstition: false,
      sport: pick.sport
    };
  }).filter(pick => {
    // Filter out picks with confidence below 0.7 - BUT ONLY FOR MLB
    // NBA and NHL picks are stored regardless of confidence level
    const confidence = typeof pick.confidence === 'number' ? pick.confidence : 0;
    const sport = pick.sport || '';
    
    // For NBA and NHL, always include the pick regardless of confidence
    if (sport === 'basketball_nba' || sport === 'icehockey_nhl') {
      console.log(`Including ${sport} pick with confidence ${confidence} (no filtering for NBA/NHL)`);
      return true;
    }
    
    // For other sports (mainly MLB), apply the 0.7 confidence threshold
    return confidence >= 0.7;
  });

  console.log(`After confidence filtering (>= 0.7 for MLB only, all NBA/NHL picks included), ${validPicks.length} picks remaining from ${picks.length} total`);

  // Skip if there are no valid picks (should never happen if picks array had items)
  if (validPicks.length === 0) {
    console.warn('No picks to store after field mapping');
    return { success: false, message: 'No picks to store' };
  }

  // Create data structure for Supabase
  const pickData = {
    date: currentDateString,
    picks: validPicks
  };

  console.log('Storing picks in Supabase daily_picks table');

  // Ensure there's a valid Supabase session before database operation
  await ensureValidSupabaseSession();

  try {
    // First try direct insert
    const { error } = await supabase
      .from('daily_picks')
      .insert(pickData);

    if (error) {
      console.error('Error inserting picks into daily_picks table:', error);

      // Try an alternative approach with an explicit JSON string
      console.log('Trying alternative approach with explicit JSON string...');
      const { error: altError } = await supabase
        .from('daily_picks')
        .insert({
          date: currentDateString,
          picks: JSON.stringify(validPicks),
          sport: validPicks[0]?.sport || 'MLB'
        });

      if (altError) {
        console.error('Alternative approach also failed:', altError);
        throw new Error(`Failed to store picks: ${altError.message}`);
      }

      console.log('Successfully stored picks using alternative approach');
      return { success: true, count: validPicks.length, method: 'alternative' };
    }

    console.log(`Successfully stored ${validPicks.length} picks in database`);
    return { success: true, count: validPicks.length };
  } catch (error) {
    console.error('Error storing picks:', error);
    throw new Error(`Failed to store picks: ${error.message}`);
  }
}

// Note: Regular season stats removed - playoffs only for NBA and NHL

// The core pick generator function
async function generateDailyPicks() {
  // Global deduplication check
  const now = Date.now();
  if (isCurrentlyGeneratingPicks) {
    console.log('🛑 Picks already being generated, skipping duplicate request...');
    return [];
  }
  
  if (now - lastGenerationTime < GENERATION_COOLDOWN) {
    console.log(`🛑 Generation cooldown active (${Math.round((GENERATION_COOLDOWN - (now - lastGenerationTime)) / 1000)}s remaining), skipping...`);
    return [];
  }
  
  isCurrentlyGeneratingPicks = true;
  lastGenerationTime = now;
  console.log('🚀 STARTING DAILY PICKS GENERATION - Global lock acquired');
  
  try {
    const sportsToAnalyze = ['basketball_nba', 'baseball_mlb', 'icehockey_nhl'];
    let allPicks = [];

    for (const sport of sportsToAnalyze) {
      let sportPicks = [];
      // --- MLB ---
      if (sport === 'baseball_mlb') {
        // Normal picks
        try {
          const normalMlbPicks = await enhancedPicksService.generateDailyPicks(sport);
          sportPicks = normalMlbPicks.map(pick => {
            // Parse the analysis to extract the structured pick data
            let pickData = null;
            try {
              if (typeof pick.analysis === 'string') {
                pickData = JSON.parse(pick.analysis);
              } else if (pick.analysis?.rawOpenAIOutput) {
                pickData = pick.analysis.rawOpenAIOutput;
              } else if (pick.analysis) {
                pickData = pick.analysis;
              }
            } catch (parseError) {
              console.error('Error parsing MLB pick analysis:', parseError);
            }
            
            // Return properly structured pick with extracted data
            return {
              ...pick,
              sport,
              pickType: 'normal',
              success: true,
              rawAnalysis: { rawOpenAIOutput: pickData },
              // Also include the fields directly for easier access
              pick: pickData?.pick || '',
              time: pickData?.time || pick.gameTime || 'TBD',
              type: pickData?.type || 'moneyline',
              league: pickData?.league || 'MLB',
              revenge: pickData?.revenge || false,
              awayTeam: pickData?.awayTeam || pick.awayTeam,
              homeTeam: pickData?.homeTeam || pick.homeTeam,
              momentum: pickData?.momentum || 0,
              rationale: pickData?.rationale || '',
              trapAlert: pickData?.trapAlert || false,
              confidence: pickData?.confidence || 0,
              superstition: pickData?.superstition || false
            };
          });
        } catch (e) { /* Log if you want */ }

        // Prop picks
        try {
          const propPicks = await mlbPicksGenerationService.generateDailyPropPicks();
          sportPicks = [...sportPicks, ...propPicks];
        } catch (e) { /* Log if you want */ }

      // --- NBA ---
      } else if (sport === 'basketball_nba') {
        console.log(`Processing NBA games for ${sport}`);
        const games = await oddsService.getUpcomingGames(sport);
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
        
        const todayGames = games.filter(game => {
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

        for (const game of todayGames) {
          const gameId = `nba-${game.id}`;
          
          const result = await processGameOnce(gameId, async () => {
            console.log(`🔄 PICK GENERATION STARTED: ${new Date().toISOString()}`);
            console.trace('Pick generation call stack');
            
            console.log(`Processing NBA game: ${game.away_team} @ ${game.home_team}`);
            
            // Use Ball Don't Lie API for NBA team stats with caching
            let homeTeamStats = null;
            let awayTeamStats = null;
            
            try {
              // Ball Don't Lie API has NBA team stats
              const nbaTeams = await cachedApiCall(
                'nba-teams', 
                () => ballDontLieService.getNbaTeams()
              );
              const homeTeam = nbaTeams.find(t => 
                t.full_name.toLowerCase().includes(game.home_team.toLowerCase()) ||
                game.home_team.toLowerCase().includes(t.full_name.toLowerCase())
              );
              const awayTeam = nbaTeams.find(t => 
                t.full_name.toLowerCase().includes(game.away_team.toLowerCase()) ||
                game.away_team.toLowerCase().includes(t.full_name.toLowerCase())
              );
              
              if (homeTeam) {
                homeTeamStats = {
                  name: homeTeam.full_name,
                  abbreviation: homeTeam.abbreviation,
                  conference: homeTeam.conference,
                  division: homeTeam.division
                };
              }
              
              if (awayTeam) {
                awayTeamStats = {
                  name: awayTeam.full_name,
                  abbreviation: awayTeam.abbreviation,
                  conference: awayTeam.conference,
                  division: awayTeam.division
                };
              }
            } catch (statsError) {
              console.log(`Could not get NBA team info: ${statsError.message}`);
            }
            
            // Get comprehensive NBA playoff stats and series information
            const [playoffStatsReport, playoffPlayerStats, seriesData] = await Promise.all([
              ballDontLieService.generateNbaPlayoffReport(
                new Date().getFullYear(),
                game.home_team, 
                game.away_team
              ),
              ballDontLieService.getNbaPlayoffPlayerStats(
                game.home_team,
                game.away_team,
                new Date().getFullYear()
              ),
              ballDontLieService.getNbaPlayoffSeries(
                new Date().getFullYear(),
                game.home_team,
                game.away_team
              )
            ]);
            
            // Build series context with game number
            let seriesContext = '\n## CURRENT SERIES STATUS:\n\n';
            if (seriesData.seriesFound) {
              const completedGames = seriesData.games.filter(g => g.status === 'Final').length;
              const upcomingGameNumber = completedGames + 1;
              
              seriesContext += `**SERIES**: ${seriesData.teamA.name} vs ${seriesData.teamB.name}\n`;
              seriesContext += `**CURRENT RECORD**: ${seriesData.seriesStatus}\n`;
              seriesContext += `**UPCOMING GAME**: Game ${upcomingGameNumber} of the series\n`;
              seriesContext += `**GAMES PLAYED**: ${completedGames} games completed\n`;
              
              // Add momentum and recent game context
              if (completedGames > 0) {
                const lastGame = seriesData.games
                  .filter(g => g.status === 'Final')
                  .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
                
                if (lastGame) {
                  const lastWinner = lastGame.home_team_score > lastGame.visitor_team_score 
                    ? lastGame.home_team.name 
                    : lastGame.visitor_team.name;
                  seriesContext += `**LAST GAME WINNER**: ${lastWinner} (${lastGame.home_team.name} ${lastGame.home_team_score} - ${lastGame.visitor_team_score} ${lastGame.visitor_team.name})\n`;
                }
              }
              
              // Add series pressure context
              if (seriesData.teamAWins === 3 || seriesData.teamBWins === 3) {
                const teamWithAdvantage = seriesData.teamAWins === 3 ? seriesData.teamA.name : seriesData.teamB.name;
                const teamFacingElimination = seriesData.teamAWins === 3 ? seriesData.teamB.name : seriesData.teamA.name;
                seriesContext += `**ELIMINATION GAME**: ${teamWithAdvantage} can close out the series. ${teamFacingElimination} facing elimination.\n`;
              } else if (upcomingGameNumber === 7) {
                seriesContext += `**GAME 7**: Winner-take-all elimination game!\n`;
              }
              
              seriesContext += '\n';
            } else {
              seriesContext += `No existing series data found between ${game.home_team} and ${game.away_team}. This may be the start of a new series.\n\n`;
            }
            
            // Build detailed player stats report
            let playerStatsReport = '\n## DETAILED PLAYOFF PLAYER STATS:\n\n';
            
            if (playoffPlayerStats.home.length > 0) {
              playerStatsReport += `### ${game.home_team} Key Playoff Performers:\n`;
              playoffPlayerStats.home.slice(0, 5).forEach(player => {
                playerStatsReport += `- **${player.player.first_name} ${player.player.last_name}**: ${player.avgPts} PPG, ${player.avgReb} RPG, ${player.avgAst} APG\n`;
                playerStatsReport += `  📊 Shooting: ${player.fgPct}% FG, ${player.fg3Pct}% 3PT, ${player.ftPct}% FT, ${player.trueShooting}% TS\n`;
                playerStatsReport += `  ⚡ Impact: ${player.avgPlusMinus} +/-, ${player.per} PER, ${player.usageRate}% USG\n`;
                playerStatsReport += `  🛡️ Defense: ${player.avgStl} STL, ${player.avgBlk} BLK, ${player.avgPf} PF\n`;
                playerStatsReport += `  🎯 Efficiency: ${player.astToTov} AST/TOV, ${player.effectiveFgPct}% eFG (${player.games} games)\n\n`;
              });
            }
            
            if (playoffPlayerStats.away.length > 0) {
              playerStatsReport += `### ${game.away_team} Key Playoff Performers:\n`;
              playoffPlayerStats.away.slice(0, 5).forEach(player => {
                playerStatsReport += `- **${player.player.first_name} ${player.player.last_name}**: ${player.avgPts} PPG, ${player.avgReb} RPG, ${player.avgAst} APG\n`;
                playerStatsReport += `  📊 Shooting: ${player.fgPct}% FG, ${player.fg3Pct}% 3PT, ${player.ftPct}% FT, ${player.trueShooting}% TS\n`;
                playerStatsReport += `  ⚡ Impact: ${player.avgPlusMinus} +/-, ${player.per} PER, ${player.usageRate}% USG\n`;
                playerStatsReport += `  🛡️ Defense: ${player.avgStl} STL, ${player.avgBlk} BLK, ${player.avgPf} PF\n`;
                playerStatsReport += `  🎯 Efficiency: ${player.astToTov} AST/TOV, ${player.effectiveFgPct}% eFG (${player.games} games)\n\n`;
              });
            }
            
            // Add comprehensive team comparison based on playoff stats
            if (playoffPlayerStats.home.length > 0 && playoffPlayerStats.away.length > 0) {
              const homeTop5 = playoffPlayerStats.home.slice(0, 5);
              const awayTop5 = playoffPlayerStats.away.slice(0, 5);
              
              // Calculate team averages for top 5 players
              const homeAvgPts = homeTop5.reduce((sum, p) => sum + parseFloat(p.avgPts), 0) / homeTop5.length;
              const awayAvgPts = awayTop5.reduce((sum, p) => sum + parseFloat(p.avgPts), 0) / awayTop5.length;
              const homeAvgPlusMinus = homeTop5.reduce((sum, p) => sum + parseFloat(p.avgPlusMinus), 0) / homeTop5.length;
              const awayAvgPlusMinus = awayTop5.reduce((sum, p) => sum + parseFloat(p.avgPlusMinus), 0) / awayTop5.length;
              const homeAvgTS = homeTop5.reduce((sum, p) => sum + parseFloat(p.trueShooting), 0) / homeTop5.length;
              const awayAvgTS = awayTop5.reduce((sum, p) => sum + parseFloat(p.trueShooting), 0) / awayTop5.length;
              const homeAvgPER = homeTop5.reduce((sum, p) => sum + parseFloat(p.per), 0) / homeTop5.length;
              const awayAvgPER = awayTop5.reduce((sum, p) => sum + parseFloat(p.per), 0) / awayTop5.length;
              const homeAvgUsage = homeTop5.reduce((sum, p) => sum + parseFloat(p.usageRate), 0) / homeTop5.length;
              const awayAvgUsage = awayTop5.reduce((sum, p) => sum + parseFloat(p.usageRate), 0) / awayTop5.length;
              
              playerStatsReport += `### 🔥 PLAYOFF TEAM COMPARISON (Top 5 Players):\n`;
              playerStatsReport += `**Scoring Power**: ${game.home_team} ${homeAvgPts.toFixed(1)} PPG vs ${game.away_team} ${awayAvgPts.toFixed(1)} PPG\n`;
              playerStatsReport += `**Impact (Plus/Minus)**: ${game.home_team} ${homeAvgPlusMinus.toFixed(1)} vs ${game.away_team} ${awayAvgPlusMinus.toFixed(1)} ⭐\n`;
              playerStatsReport += `**Shooting Efficiency (TS%)**: ${game.home_team} ${homeAvgTS.toFixed(1)}% vs ${game.away_team} ${awayAvgTS.toFixed(1)}%\n`;
              playerStatsReport += `**Overall Efficiency (PER)**: ${game.home_team} ${homeAvgPER.toFixed(1)} vs ${game.away_team} ${awayAvgPER.toFixed(1)}\n`;
              playerStatsReport += `**Usage Rate**: ${game.home_team} ${homeAvgUsage.toFixed(1)}% vs ${game.away_team} ${awayAvgUsage.toFixed(1)}%\n\n`;
              
              // Add momentum indicators
              const homeMomentum = homeAvgPlusMinus > awayAvgPlusMinus ? '📈 MOMENTUM' : '📉 STRUGGLING';
              const awayMomentum = awayAvgPlusMinus > homeAvgPlusMinus ? '📈 MOMENTUM' : '📉 STRUGGLING';
              playerStatsReport += `**Playoff Momentum**: ${game.home_team} ${homeMomentum} | ${game.away_team} ${awayMomentum}\n\n`;
            }
            
            // PLAYOFFS ONLY - No regular season stats
            const nbaStatsReport = seriesContext + playoffStatsReport + playerStatsReport;

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
              homeTeamStats,
              awayTeamStats,
              statsReport: nbaStatsReport,
              playoffPlayerStats, // Add detailed playoff player stats
              seriesData, // Add complete series information
              isPlayoffGame: true, // Mark this as a playoff game
              odds: oddsData,
              gameTime: game.commence_time,
              time: game.commence_time
            };

            console.log(`Making Gary pick for NBA game: ${game.away_team} @ ${game.home_team}`);
            const result = await makeGaryPick(gameObj);
            
            if (result.success) {
              console.log(`Successfully generated NBA pick: ${result.rawAnalysis?.rawOpenAIOutput?.pick || 'Unknown pick'}`);
              sportPicks.push({
                ...result,
                game: `${game.away_team} @ ${game.home_team}`,
                sport,
                homeTeam: game.home_team,
                awayTeam: game.away_team,
                gameTime: game.commence_time,
                pickType: 'normal',
                timestamp: new Date().toISOString()
              });
            } else {
              console.log(`Failed to generate NBA pick for ${game.away_team} @ ${game.home_team}:`, result.error);
            }
            
            return result;
          });
          
          // Only add successful results to sportPicks
          if (result && result.success) {
            sportPicks.push(result);
          }
        }

      // --- NHL ---
      } else if (sport === 'icehockey_nhl') {
        console.log(`Processing NHL games for ${sport}`);
        const games = await oddsService.getUpcomingGames(sport);
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

        for (const game of todayGames) {
          const gameId = `nhl-${game.id}`;
          
          const result = await processGameOnce(gameId, async () => {
            console.log(`Processing NHL game: ${game.away_team} @ ${game.home_team}`);
            
            // Get NHL playoff stats for these teams - PLAYOFFS ONLY
            const playoffStatsReport = await nhlPlayoffService.generateNhlPlayoffReport(
              game.home_team,
              game.away_team
            );
            
            // Get basic team info from playoff service for context only
            let homeStats = { name: game.home_team, conference: '?', division: '?' };
            let awayStats = { name: game.away_team, conference: '?', division: '?' };
            
            try {
              // Try to get basic team info from playoff service
              const [homePlayoffStats, awayPlayoffStats] = await Promise.all([
                nhlPlayoffService.getTeamPlayoffStats(game.home_team),
                nhlPlayoffService.getTeamPlayoffStats(game.away_team)
              ]);
              
              // Extract basic team info if available (conference/division for context)
              if (homePlayoffStats?.stats?.[0]?.splits?.[0]?.stat) {
                homeStats = {
                  name: game.home_team,
                  conference: homePlayoffStats.conference || '?',
                  division: homePlayoffStats.division || '?'
                };
              }
              
              if (awayPlayoffStats?.stats?.[0]?.splits?.[0]?.stat) {
                awayStats = {
                  name: game.away_team,
                  conference: awayPlayoffStats.conference || '?',
                  division: awayPlayoffStats.division || '?'
                };
              }
            } catch (statsError) {
              console.log(`Could not get NHL team info: ${statsError.message}`);
              // Continue with default stats
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
              sportPicks.push({
                ...result,
                game: `${game.away_team} @ ${game.home_team}`,
                sport,
                homeTeam: game.home_team,
                awayTeam: game.away_team,
                gameTime: game.commence_time,
                pickType: 'normal',
                timestamp: new Date().toISOString()
              });
            } else {
              console.log(`Failed to generate NHL pick for ${game.away_team} @ ${game.home_team}:`, result.error);
            }
            
            return result;
          });
          
          // Only add successful results to sportPicks
          if (result && result.success) {
            sportPicks.push(result);
          }
        }
      }

      // Add for this sport
      allPicks.push(...sportPicks);
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Store and return
    await storeDailyPicksInDatabase(allPicks);
    console.log('✅ DAILY PICKS GENERATION COMPLETED - Releasing global lock');
    return allPicks;
  } catch (error) {
    console.error('❌ DAILY PICKS GENERATION FAILED - Releasing global lock:', error);
    throw error;
  } finally {
    isCurrentlyGeneratingPicks = false;
  }
}

// Export both styles!
const picksService = {
  generateDailyPicks,
  storeDailyPicksInDatabase,
  checkForExistingPicks,
  ensureValidSupabaseSession,
  _teamNameMatch
};

export { picksService, generateDailyPicks };
export default picksService;