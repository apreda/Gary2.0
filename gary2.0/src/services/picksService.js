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

  // No confidence filtering - just store all picks that come in
  // This assumes the picks are already filtered by the enhanced picks service
  const validPicks = picks.map(pick => {
    // Ensure all required fields exist for display
    if (!pick.type && pick.rawAnalysis?.type) pick.type = pick.rawAnalysis.type;
    if (!pick.pick && pick.rawAnalysis?.pick) pick.pick = pick.rawAnalysis.pick;
    if (!pick.confidence && pick.rawAnalysis?.confidence) pick.confidence = pick.rawAnalysis.confidence;
    if (!pick.rationale && pick.rawAnalysis?.rationale) pick.rationale = pick.rawAnalysis.rationale;
    
    // For enhanced picks that use analysis instead of rawAnalysis
    if (!pick.type && pick.analysis?.rawOpenAIOutput?.type) pick.type = pick.analysis.rawOpenAIOutput.type;
    if (!pick.pick && pick.analysis?.rawOpenAIOutput?.pick) pick.pick = pick.analysis.rawOpenAIOutput.pick;
    if (!pick.confidence && pick.analysis?.rawOpenAIOutput?.confidence) pick.confidence = pick.analysis.rawOpenAIOutput.confidence;
    if (!pick.rationale && pick.analysis?.rawOpenAIOutput?.rationale) pick.rationale = pick.analysis.rawOpenAIOutput.rationale;
    
    return pick;
  });

  console.log(`Storing all ${validPicks.length} picks directly without confidence filtering`);

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
          sportPicks = normalMlbPicks.map(pick => ({
            ...pick,
            sport,
            pickType: 'normal',
            success: true,
            rawAnalysis: { rawOpenAIOutput: pick.analysis }
          }));
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