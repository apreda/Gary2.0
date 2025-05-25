/**
 * Gary Picks Service - Fully Integrated
 * Handles MLB (normal + props), NBA, and NHL pick generation and storage
 */
import { makeGaryPick } from './garyEngine.js';
import { oddsService } from './oddsService.js';
import { supabase } from '../supabaseClient.js';
import { sportsDataService } from './sportsDataService.js';
import { apiSportsService } from './apiSportsService.js';
import { ballDontLieService } from './ballDontLieService.js';
import { picksService as enhancedPicksService } from './picksService.enhanced.js';
import { mlbPicksGenerationService } from './mlbPicksGenerationService.js';

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
    // Filter out picks with confidence below 0.75
    const confidence = typeof pick.confidence === 'number' ? pick.confidence : 0;
    return confidence >= 0.75;
  });

  console.log(`After confidence filtering (>= 0.75), ${validPicks.length} picks remaining from ${picks.length} total`);

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

// NBA Stats Report Generator
async function generateNbaStatsReport(homeTeam, awayTeam) {
  try {
    const homeStats = await sportsDataService.getTeamStats(homeTeam, 'NBA');
    const awayStats = await sportsDataService.getTeamStats(awayTeam, 'NBA');
    return `
      ${awayTeam}: ${awayStats?.wins || '?'}-${awayStats?.losses || '?'} (${awayStats?.winPercentage || '?.???'})
      ${homeTeam}: ${homeStats?.wins || '?'}-${homeStats?.losses || '?'} (${homeStats?.winPercentage || '?.???'})
    `;
  } catch {
    return `${awayTeam} vs ${homeTeam} - Stats unavailable`;
  }
}

// The core pick generator function
async function generateDailyPicks() {
  try {
    const sportsToAnalyze = ['basketball_nba', 'baseball_mlb', 'icehockey_nhl'];
    let allPicks = [];
    const processedGames = new Set();

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
        const games = await oddsService.getUpcomingGames(sport);
        // Get today's date in EST time zone format (YYYY-MM-DD)
        const today = new Date();
        const estOptions = { timeZone: 'America/New_York' };
        const estDateString = today.toLocaleDateString('en-US', estOptions);
        const [month, day, year] = estDateString.split('/');
        const estFormattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        
        console.log(`NBA filtering: Today in EST is ${estFormattedDate}`);
        
        // Filter games by checking if they occur on the same day in EST
        const todayGames = games.filter(game => {
          const gameDate = new Date(game.commence_time);
          const gameDateInEST = gameDate.toLocaleDateString('en-US', estOptions);
          const [gameMonth, gameDay, gameYear] = gameDateInEST.split('/');
          const gameFormattedDate = `${gameYear}-${gameMonth.padStart(2, '0')}-${gameDay.padStart(2, '0')}`;
          
          console.log(`NBA Game: ${game.away_team} @ ${game.home_team}, Date: ${gameFormattedDate}, Include: ${gameFormattedDate === estFormattedDate}`);
          
          return gameFormattedDate === estFormattedDate;
        });

        for (const game of todayGames) {
          const gameId = `${game.id}`;
          if (processedGames.has(gameId)) continue;
          processedGames.add(gameId);

          try {
            const homeTeamStats = await sportsDataService.getTeamStats(game.home_team, 'NBA');
            const awayTeamStats = await sportsDataService.getTeamStats(game.away_team, 'NBA');
            
            // Get NBA playoff stats for these teams
            const playoffStatsReport = await ballDontLieService.generateNbaPlayoffReport(
              game.home_team, 
              game.away_team, 
              new Date().getFullYear()
            );
            
            // Still get regular stats as fallback
            const regularStatsReport = await generateNbaStatsReport(game.home_team, game.away_team);
            
            // Combine both reports, prioritizing playoff data
            const nbaStatsReport = playoffStatsReport + '\n\n' + regularStatsReport;

            const gameObj = {
              id: gameId,
              sport: 'nba',
              homeTeam: game.home_team,
              awayTeam: game.away_team,
              homeTeamStats,
              awayTeamStats,
              statsReport: nbaStatsReport,
              isPlayoffGame: true, // Mark this as a playoff game
              odds: game.bookmakers?.[0]?.markets || [],
              gameTime: game.commence_time
            };

            const result = await makeGaryPick(gameObj);
            if (result.success) {
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
            }
          } catch (e) { /* Log if you want */ }
        }

      // --- NHL ---
      } else if (sport === 'icehockey_nhl') {
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

        for (const game of todayGames) {
          const gameId = `${game.id}`;
          if (processedGames.has(gameId)) continue;
          processedGames.add(gameId);

          try {
            const homeTeamStats = await apiSportsService.getTeamStats(game.home_team, 'NHL');
            const awayTeamStats = await apiSportsService.getTeamStats(game.away_team, 'NHL');

            const homeStats = homeTeamStats || { name: game.home_team, wins: '?', losses: '?', points: '?' };
            const awayStats = awayTeamStats || { name: game.away_team, wins: '?', losses: '?', points: '?' };

            const statsReport = `
              ${awayStats.name}: ${awayStats.wins}W-${awayStats.losses}L, ${awayStats.points || '?'} points
              ${homeStats.name}: ${homeStats.wins}W-${homeStats.losses}L, ${homeStats.points || '?'} points
            `;

            const gameObj = {
              id: gameId,
              sport: 'nhl',
              homeTeam: game.home_team,
              awayTeam: game.away_team,
              homeTeamStats: homeStats,
              awayTeamStats: awayStats,
              statsReport,
              odds: game.bookmakers?.[0]?.markets || [],
              gameTime: game.commence_time
            };

            const result = await makeGaryPick(gameObj);
            if (result.success) {
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
            }
          } catch (e) { /* Log if you want */ }
        }
      }

      // Add for this sport
      allPicks.push(...sportPicks);
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Store and return
    await storeDailyPicksInDatabase(allPicks);
    return allPicks;
  } catch (error) {
    throw error;
  }
}

// Export both styles!
const picksService = {
  generateDailyPicks,
  storeDailyPicksInDatabase,
  checkForExistingPicks,
  ensureValidSupabaseSession,
  _teamNameMatch,
  generateNbaStatsReport
};

export { picksService, generateDailyPicks };
export default picksService;