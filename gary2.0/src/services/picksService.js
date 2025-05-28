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
import { combinedMlbService } from './combinedMlbService.js';
import { mlbPicksGenerationService } from './mlbPicksGenerationService.js';
import { openaiService } from './openaiService.js';
import { getESTDate } from '../utils/dateUtils.js';

// Global processing state to prevent multiple simultaneous generations
let isCurrentlyGeneratingPicks = false;
let isProcessingNHL = false;
let isProcessingNBA = false;
let isProcessingMLB = false;
let isStoringPicks = false;
let lastGenerationTime = 0;
const GENERATION_COOLDOWN = 30 * 1000; // 30 seconds

// Add deduplication and processing locks to prevent repetitive processing
const processedGames = new Set();
const processingLocks = new Map();
const apiCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Process a game only once with enhanced locking mechanism
 * @param {string} gameId - Unique game identifier
 * @param {Function} processingFunction - Function to process the game
 * @returns {Promise} - Processing result or null if already processed
 */
const processGameOnce = async (gameId, processingFunction) => {
  // Create a unique session key to prevent cross-session duplicates (using EST date)
  const sessionKey = `${gameId}-${getESTDate()}`;
  
  if (processedGames.has(sessionKey)) {
    console.log(`🔄 Game ${gameId} already processed today, skipping...`);
    return null;
  }
  
  if (processingLocks.has(sessionKey)) {
    console.log(`🔄 Game ${gameId} currently being processed, waiting...`);
    return processingLocks.get(sessionKey);
  }
  
  const processingPromise = (async () => {
    console.log(`🎯 Processing game ${gameId} for the first time today`);
    const result = await processingFunction();
    return result;
  })();
  
  processingLocks.set(sessionKey, processingPromise);
  
  try {
    const result = await processingPromise;
    processedGames.add(sessionKey);
    console.log(`✅ Successfully processed game ${gameId}`);
    return result;
  } catch (error) {
    console.error(`❌ Error processing game ${gameId}:`, error);
    throw error;
  } finally {
    processingLocks.delete(sessionKey);
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

// Helper: Check if picks for today exist with enhanced validation
async function checkForExistingPicks(dateString) {
  await ensureValidSupabaseSession();
  const { data, error } = await supabase
    .from('daily_picks')
    .select('id, picks')
    .eq('date', dateString)
    .limit(1);
  
  if (error) {
    console.error('Error checking for existing picks:', error);
    return false;
  }
  
  // Check if we have valid picks data
  if (data && data.length > 0 && data[0].picks) {
    const picks = Array.isArray(data[0].picks) ? data[0].picks : JSON.parse(data[0].picks || '[]');
    console.log(`📊 Found existing picks for ${dateString}: ${picks.length} picks`);
    return picks.length > 0;
  }
  
  return false;
}

// Helper: Store picks in database
async function storeDailyPicksInDatabase(picks) {
  if (!picks || !Array.isArray(picks) || picks.length === 0)
    return { success: false, message: 'No picks provided' };

  // Prevent multiple simultaneous storage operations
  if (isStoringPicks) {
    console.log('🛑 Picks are already being stored, skipping duplicate storage operation');
    return { success: false, message: 'Storage already in progress' };
  }

  isStoringPicks = true;
  console.log(`🗄️ Starting storage operation for ${picks.length} picks`);

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
    // Filter out picks with confidence below 0.75 - BUT ONLY FOR MLB
    // NBA and NHL picks are stored regardless of confidence level
    const confidence = typeof pick.confidence === 'number' ? pick.confidence : 0;
    const sport = pick.sport || '';
    
    // For NBA and NHL, always include the pick regardless of confidence
    if (sport === 'basketball_nba' || sport === 'icehockey_nhl') {
      console.log(`Including ${sport} pick with confidence ${confidence} (no filtering for NBA/NHL)`);
      return true;
    }
    
    // For other sports (mainly MLB), apply the 0.75 confidence threshold
    return confidence >= 0.75;
  });

  console.log(`After confidence filtering (>= 0.75 for MLB only, all NBA/NHL picks included), ${validPicks.length} picks remaining from ${picks.length} total`);

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

      console.log('✅ Successfully stored picks using alternative approach');
      return { success: true, count: validPicks.length, method: 'alternative' };
    }

    console.log(`✅ Successfully stored ${validPicks.length} picks in database`);
    return { success: true, count: validPicks.length };
  } catch (error) {
    console.error('❌ Error storing picks:', error);
    throw new Error(`Failed to store picks: ${error.message}`);
  } finally {
    isStoringPicks = false;
    console.log('🔓 Storage lock released');
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
      
      // Sport-specific processing locks to prevent duplication
      if (sport === 'baseball_mlb' && isProcessingMLB) {
        console.log('🛑 MLB picks already being processed, skipping...');
        continue;
      }
      if (sport === 'basketball_nba' && isProcessingNBA) {
        console.log('🛑 NBA picks already being processed, skipping...');
        continue;
      }
      if (sport === 'icehockey_nhl' && isProcessingNHL) {
        console.log('🛑 NHL picks already being processed, skipping...');
        continue;
      }
      
      // --- MLB ---
      if (sport === 'baseball_mlb') {
        isProcessingMLB = true;
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
        
        isProcessingMLB = false; // Release MLB lock

      // --- NBA ---
      } else if (sport === 'basketball_nba') {
        isProcessingNBA = true;
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
            
            // Get team objects first for all subsequent operations
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
              
            // Use Ball Don't Lie API for NBA team stats with caching
            let homeTeamStats = null;
            let awayTeamStats = null;
            
            try {
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
            // For 2025 playoffs, we need to use 2024 as the season parameter
            const currentYear = new Date().getFullYear();
            const currentMonth = new Date().getMonth() + 1;
            const playoffSeason = currentMonth <= 6 ? currentYear - 1 : currentYear; // 2024 for 2025 playoffs
            
            console.log(`🏀 Using season ${playoffSeason} for ${currentYear} playoffs (month: ${currentMonth})`);
            
            // Get team IDs for comprehensive stats
            const teamIds = [];
            if (homeTeam) teamIds.push(homeTeam.id);
            if (awayTeam) teamIds.push(awayTeam.id);
            
            const [playoffStatsReport, playoffPlayerStats, seriesData, teamStats] = await Promise.all([
              ballDontLieService.generateNbaPlayoffReport(
                playoffSeason,
                game.home_team, 
                game.away_team
              ),
              ballDontLieService.getNbaPlayoffPlayerStats(
              game.home_team, 
              game.away_team, 
                playoffSeason
              ),
              ballDontLieService.getNbaPlayoffSeries(
                playoffSeason,
                game.home_team,
                game.away_team
              ),
              // Add comprehensive team stats
              teamIds.length > 0 ? ballDontLieService.getNBATeamStats(teamIds, playoffSeason) : Promise.resolve([])
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
            
            // Add team stats report
            let teamStatsReport = '\n## TEAM STATISTICS:\n\n';
            const hasTeamStats = teamStats && teamStats.length > 0;
            
            if (hasTeamStats) {
              // Use the team objects that were found earlier in the NBA processing section
              const homeTeamStat = teamStats.find(ts => homeTeam && ts.teamId === homeTeam.id);
              const awayTeamStat = teamStats.find(ts => awayTeam && ts.teamId === awayTeam.id);
              
              if (homeTeamStat) {
                teamStatsReport += `### ${game.home_team} Team Stats (${homeTeamStat.season} Season):\n`;
                teamStatsReport += `- **Record**: ${homeTeamStat.stats.wins}-${homeTeamStat.stats.losses}\n`;
                teamStatsReport += `- **Offense**: ${homeTeamStat.stats.pointsPerGame.toFixed(1)} PPG, ${(homeTeamStat.stats.fieldGoalPct * 100).toFixed(1)}% FG, ${(homeTeamStat.stats.threePointPct * 100).toFixed(1)}% 3PT\n`;
                teamStatsReport += `- **Playmaking**: ${homeTeamStat.stats.assistsPerGame.toFixed(1)} APG, ${homeTeamStat.stats.turnoversPerGame.toFixed(1)} TOV\n`;
                teamStatsReport += `- **Defense**: ${homeTeamStat.stats.pointsAllowedPerGame.toFixed(1)} PAPG, ${homeTeamStat.stats.stealsPerGame.toFixed(1)} SPG, ${homeTeamStat.stats.blocksPerGame.toFixed(1)} BPG\n`;
                teamStatsReport += `- **Rebounding**: ${homeTeamStat.stats.reboundsPerGame.toFixed(1)} RPG\n\n`;
              }
              
              if (awayTeamStat) {
                teamStatsReport += `### ${game.away_team} Team Stats (${awayTeamStat.season} Season):\n`;
                teamStatsReport += `- **Record**: ${awayTeamStat.stats.wins}-${awayTeamStat.stats.losses}\n`;
                teamStatsReport += `- **Offense**: ${awayTeamStat.stats.pointsPerGame.toFixed(1)} PPG, ${(awayTeamStat.stats.fieldGoalPct * 100).toFixed(1)}% FG, ${(awayTeamStat.stats.threePointPct * 100).toFixed(1)}% 3PT\n`;
                teamStatsReport += `- **Playmaking**: ${awayTeamStat.stats.assistsPerGame.toFixed(1)} APG, ${awayTeamStat.stats.turnoversPerGame.toFixed(1)} TOV\n`;
                teamStatsReport += `- **Defense**: ${awayTeamStat.stats.pointsAllowedPerGame.toFixed(1)} PAPG, ${awayTeamStat.stats.stealsPerGame.toFixed(1)} SPG, ${awayTeamStat.stats.blocksPerGame.toFixed(1)} BPG\n`;
                teamStatsReport += `- **Rebounding**: ${awayTeamStat.stats.reboundsPerGame.toFixed(1)} RPG\n\n`;
              }
              
              // Add team comparison if both teams have stats
              if (homeTeamStat && awayTeamStat) {
                teamStatsReport += `### 🔥 TEAM COMPARISON:\n`;
                teamStatsReport += `**Offensive Power**: ${game.home_team} ${homeTeamStat.stats.pointsPerGame.toFixed(1)} PPG vs ${game.away_team} ${awayTeamStat.stats.pointsPerGame.toFixed(1)} PPG\n`;
                teamStatsReport += `**Defensive Strength**: ${game.home_team} ${homeTeamStat.stats.pointsAllowedPerGame.toFixed(1)} PAPG vs ${game.away_team} ${awayTeamStat.stats.pointsAllowedPerGame.toFixed(1)} PAPG\n`;
                teamStatsReport += `**Shooting Efficiency**: ${game.home_team} ${(homeTeamStat.stats.fieldGoalPct * 100).toFixed(1)}% vs ${game.away_team} ${(awayTeamStat.stats.fieldGoalPct * 100).toFixed(1)}%\n`;
                teamStatsReport += `**Ball Movement**: ${game.home_team} ${homeTeamStat.stats.assistsPerGame.toFixed(1)} APG vs ${game.away_team} ${awayTeamStat.stats.assistsPerGame.toFixed(1)} APG\n\n`;
              }
              
              console.log(`✅ Team Stats Available: true (${teamStats.length} teams)`);
            } else {
              teamStatsReport += `No comprehensive team statistics available for this matchup.\n\n`;
              console.log(`❌ Team Stats Available: false`);
            }
            
            // PLAYOFFS ONLY - No regular season stats
            const nbaStatsReport = seriesContext + playoffStatsReport + playerStatsReport + teamStatsReport;

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
              // Return the formatted pick data instead of adding to sportPicks here
              return {
                ...result,
                game: `${game.away_team} @ ${game.home_team}`,
                sport,
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
        
        isProcessingNBA = false; // Release NBA lock

      // --- NHL ---
      } else if (sport === 'icehockey_nhl') {
        isProcessingNHL = true;
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
                sport,
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
        
        isProcessingNHL = false; // Release NHL lock
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
    // Release all sport-specific locks in case of error
    isProcessingMLB = false;
    isProcessingNBA = false;
    isProcessingNHL = false;
    isStoringPicks = false;
    console.log('🔓 All processing locks released');
  }
}

/**
 * Generate Gary's thoughts on all games for the day
 * Returns spread, moneyline, and over/under picks for every game
 * @returns {Promise<Array>} - Array of games with Gary's picks
 */
async function generateWhatGaryThinks() {
  console.log('🧠 Starting What Gary Thinks generation...');
  
  try {
    const allGames = [];
    const sports = ['baseball_mlb', 'basketball_nba', 'icehockey_nhl'];
    
    for (let sportIndex = 0; sportIndex < sports.length; sportIndex++) {
      const sport = sports[sportIndex];
      
      // Add delay between sports to prevent rate limiting (except for first sport)
      if (sportIndex > 0) {
        console.log(`⏳ Adding 5s delay between sports to prevent OpenAI rate limiting...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      console.log(`🧠 Getting ${sport} games for What Gary Thinks...`);
      
      const games = await oddsService.getUpcomingGames(sport);
      
      // Get today's date in EST time zone format (YYYY-MM-DD)
      const today = new Date();
      const estOptions = { timeZone: 'America/New_York' };
      const estDateString = today.toLocaleDateString('en-US', estOptions);
      const [month, day, year] = estDateString.split('/');
      const estFormattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      
      // Filter games for today only
      const todayGames = games.filter(game => {
        const gameDate = new Date(game.commence_time);
        const gameDateInEST = gameDate.toLocaleDateString('en-US', estOptions);
        const [gameMonth, gameDay, gameYear] = gameDateInEST.split('/');
        const gameFormattedDate = `${gameYear}-${gameMonth.padStart(2, '0')}-${gameDay.padStart(2, '0')}`;
        return gameFormattedDate === estFormattedDate;
      });
      
      console.log(`🧠 Found ${todayGames.length} ${sport} games for today`);
      
      for (let i = 0; i < todayGames.length; i++) {
        const game = todayGames[i];
        try {
          // Add delay between games to prevent rate limiting (except for first game)
          if (i > 0) {
            console.log(`⏳ Adding 3s delay to prevent OpenAI rate limiting...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
          
          // Extract odds data
          const odds = extractOddsData(game);
          
          // Get game stats (reuse existing logic)
          const gameStats = await getGameStatsForThoughts(game, sport);
          
          // Generate Gary's picks for this game
          const garyPicks = await generateGaryPicksForGame(game, gameStats, sport);
          
          const gameData = {
            id: game.id,
            homeTeam: game.home_team,
            awayTeam: game.away_team,
            league: sport === 'baseball_mlb' ? 'MLB' : sport === 'basketball_nba' ? 'NBA' : 'NHL',
            time: formatGameTime(game.commence_time),
            odds: odds,
            garyPicks: garyPicks,
            sport: sport
          };
          
          allGames.push(gameData);
          
        } catch (error) {
          console.error(`🧠 Error processing game ${game.away_team} @ ${game.home_team}:`, error);
          
          // If it's a rate limiting error, add extra delay
          if (error.message && (error.message.includes('429') || error.message.includes('Too Many Requests'))) {
            console.log(`⏳ Rate limit detected, adding 10s delay before continuing...`);
            await new Promise(resolve => setTimeout(resolve, 10000));
          }
        }
      }
    }
    
    console.log(`🧠 Generated What Gary Thinks for ${allGames.length} total games`);
    return allGames;
    
  } catch (error) {
    console.error('🧠 Error generating What Gary Thinks:', error);
    throw error;
  }
}

/**
 * Extract odds data from game object
 * @param {Object} game - Game object from odds service
 * @returns {Object} - Formatted odds data
 */
function extractOddsData(game) {
  if (!game.bookmakers || game.bookmakers.length === 0) {
    return null;
  }
  
  const bookmaker = game.bookmakers[0];
  const odds = {
    spread: { home: null, away: null },
    moneyline: { home: null, away: null },
    total: { line: null, over: null, under: null }
  };
  
  bookmaker.markets?.forEach(market => {
    if (market.key === 'spreads') {
      market.outcomes?.forEach(outcome => {
        if (outcome.name === game.home_team) {
          odds.spread.home = { line: outcome.point, odds: outcome.price };
        } else if (outcome.name === game.away_team) {
          odds.spread.away = { line: outcome.point, odds: outcome.price };
        }
      });
    } else if (market.key === 'h2h') {
      market.outcomes?.forEach(outcome => {
        if (outcome.name === game.home_team) {
          odds.moneyline.home = outcome.price;
        } else if (outcome.name === game.away_team) {
          odds.moneyline.away = outcome.price;
        }
      });
    } else if (market.key === 'totals') {
      if (market.outcomes?.length >= 2) {
        odds.total.line = market.outcomes[0].point;
        market.outcomes.forEach(outcome => {
          if (outcome.name === 'Over') {
            odds.total.over = outcome.price;
          } else if (outcome.name === 'Under') {
            odds.total.under = outcome.price;
          }
        });
      }
    }
  });
  
  return odds;
}

/**
 * Get game stats for What Gary Thinks (simplified version)
 * @param {Object} game - Game object
 * @param {string} sport - Sport type
 * @returns {Object} - Game stats
 */
async function getGameStatsForThoughts(game, sport) {
  // Reuse existing stats gathering logic but simplified
  if (sport === 'baseball_mlb') {
    // Get MLB stats
    return await combinedMlbService.getComprehensiveGameData(game.home_team, game.away_team);
  } else if (sport === 'basketball_nba') {
    // Get NBA stats
    const playoffAnalysis = await ballDontLieService.getNbaPlayoffPlayerStats(
      game.home_team,
      game.away_team
    );
    return { playoffAnalysis };
  } else if (sport === 'icehockey_nhl') {
    // Get NHL stats
    const playoffAnalysis = await ballDontLieService.getComprehensiveNhlPlayoffAnalysis(
      game.home_team,
      game.away_team
    );
    return { playoffAnalysis };
  }
  
  return {};
}

/**
 * Generate Gary's picks for a specific game (spread, moneyline, over/under)
 * @param {Object} game - Game object
 * @param {Object} gameStats - Game statistics
 * @param {string} sport - Sport type
 * @returns {Object} - Gary's picks
 */
async function generateGaryPicksForGame(game, gameStats, sport) {
  try {
    // Create a simplified prompt for What Gary Thinks
    const systemMessage = {
      role: "system",
      content: `You are Gary the Bear, analyzing this game to make picks on spread, moneyline, and over/under.

CRITICAL: You must pick ALL THREE bet types for this game:
1. SPREAD: Pick either "home" or "away" 
2. MONEYLINE: Pick either "home" or "away"
3. TOTAL: Pick either "over" or "under"

=== RATIONALE FORMAT ===
Write a SINGLE PARAGRAPH (2-4 sentences) in first person as Gary, directly addressing the user. Focus on the most compelling matchup dynamics and situational factors that led to your conclusions across all three bet types.

NEVER EVER mention missing or limited stats in your rationale. Do not use phrases like "with no player stats available" or "relying on league averages" or any other language that suggests data limitations. Users should never know if data is missing.

Respond in this exact JSON format:
{
  "spread": "home" or "away",
  "moneyline": "home" or "away", 
  "total": "over" or "under",
  "rationale": "A 2-4 sentence paragraph explaining your picks using expert-level analysis."
}

Base your picks on the provided stats and odds. Be decisive - you must pick a side for each bet type.`
    };

    const userMessage = {
      role: "user",
      content: `Analyze this ${sport} game and make your picks:

GAME: ${game.away_team} @ ${game.home_team}
TIME: ${game.commence_time}

ODDS DATA:
${JSON.stringify(extractOddsData(game), null, 2)}

STATS DATA:
${JSON.stringify(gameStats, null, 2)}

Make your picks for spread, moneyline, and total.`
    };

    const response = await openaiService.generateResponse([systemMessage, userMessage], {
      temperature: 0.7,
      maxTokens: 300
    });

    // Parse the JSON response
    const jsonMatch = response.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const picks = JSON.parse(jsonMatch[0]);
      return picks;
    }

    // Fallback if parsing fails
    return {
      spread: 'home',
      moneyline: 'home', 
      total: 'over',
      rationale: 'Analysis based on available team data and current betting lines.'
    };

  } catch (error) {
    console.error('Error generating Gary picks for game:', error);
    // Return default picks if error
    return {
      spread: 'home',
      moneyline: 'home',
      total: 'over',
      rationale: 'Analysis based on available team data and current betting lines.'
    };
  }
}

/**
 * Format game time for display
 * @param {string} timeString - ISO time string
 * @returns {string} - Formatted time
 */
function formatGameTime(timeString) {
  try {
    const date = new Date(timeString);
    const options = { 
      hour: 'numeric', 
      minute: '2-digit', 
      hour12: true, 
      timeZone: 'America/New_York' 
    };
    const timeFormatted = new Intl.DateTimeFormat('en-US', options).format(date);
    return `${timeFormatted} EST`;
  } catch (error) {
    return 'TBD';
  }
}

// Export both styles!
const picksService = {
  generateDailyPicks,
  generateWhatGaryThinks,
  storeDailyPicksInDatabase,
  checkForExistingPicks,
  ensureValidSupabaseSession,
  _teamNameMatch
};

export { picksService, generateDailyPicks };
export default picksService;