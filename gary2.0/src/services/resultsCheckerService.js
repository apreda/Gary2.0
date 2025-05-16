import { supabase } from '../supabaseClient';
import { createClient } from '@supabase/supabase-js';
import { garyPerformanceService } from './garyPerformanceService';
import { sportsDbApiService } from './sportsDbApiService';
import { ballDontLieService } from './ballDontLieService';
import openaiService from './openaiService';
import { perplexityService } from './perplexityService';
import { userPickResultsService } from './userPickResultsService';

// Create a Supabase client with admin privileges that bypasses RLS
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || 'https://wljxcsmijuhnqumstxvr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY;
const adminSupabase = SUPABASE_SERVICE_KEY ? 
  createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) : 
  supabase; // Fallback to regular client if no service key

// Initialize services
sportsDbApiService.initialize();

/**
 * Results checker service for evaluating sports betting picks
 * Handles fetching picks, getting game scores, and evaluating results
 */
export const resultsCheckerService = {
  /**
   * Get yesterday's picks from the database
   * @returns {Promise<Object>} Picks data with success flag
   */
  getYesterdaysPicks: async () => {
    try {
      // Calculate yesterday's date
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const formattedDate = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD
      
      console.log(`Fetching picks for yesterday (${formattedDate})`);
      
      // Get picks from Supabase
      const { data, error } = await supabase
        .from('daily_picks')
        .select('*')
        .eq('date', formattedDate)
        .single();
      
      if (error) {
        console.error('Error fetching yesterday\'s picks:', error);
        return { success: false, message: error.message };
      }
      
      if (!data || !data.picks || data.picks.length === 0) {
        console.log('No picks found for yesterday');
        return { success: false, message: 'No picks found for yesterday' };
      }
      
      console.log(`Found ${data.picks.length} picks for yesterday`);
      return { success: true, data: data.picks, date: formattedDate, id: data.id };
    } catch (error) {
      console.error('Error in getYesterdaysPicks:', error);
      return { success: false, message: error.message };
    }
  },
  
  /**
   * Get scores for Gary's picks using multiple data sources with fallback strategy
   * Tries Ball Don't Lie (NBA) / SportsDB first, falls back to Perplexity if needed
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {Array} picks - Array of Gary's picks from the database
   * @returns {Promise<Object>} Game scores mapped by matchup
   */
  getGameScores: async (date, picks) => {
    try {
      if (!picks || picks.length === 0) {
        console.log('No picks provided to check scores for');
        return { success: false, message: 'No picks provided' };
      }
      
      console.log(`Fetching scores for ${picks.length} picks from ${date}`);
      const scores = {};
      const missingGames = [];
      
      // 1. Try primary sources first (Ball Don't Lie for NBA, SportsDB for others)
      for (const pick of picks) {
        // Extract team names from the pick string
        const pickStr = pick.pick || '';
        const teamMatch = pickStr.match(/^([A-Za-z. ]+?)(?: [\-+]?\d+(\.\d+)?(?: [\-+\-]?\d+)?)?(?: [\-+]?\d+(\.\d+)?(?: [\-+\-]?\d+)?)?$/);
        
        if (!teamMatch || !teamMatch[1]) {
          console.warn(`Could not extract team name from pick: ${pickStr}`);
          missingGames.push(pick);
          continue;
        }
        
        const teamName = teamMatch[1].trim();
        const isNBA = (pick.league || '').toLowerCase() === 'nba';
        
        try {
          if (isNBA) {
            // Try Ball Don't Lie for NBA games
            const bdlScores = await ballDontLieService.getGamesByDate(date);
            if (bdlScores) {
              // Find the game that includes the team name
              const gameKey = Object.keys(bdlScores).find(key => 
                key.toLowerCase().includes(teamName.toLowerCase())
              );
              
              if (gameKey) {
                scores[teamName] = bdlScores[gameKey];
                console.log(`Found NBA score from Ball Don't Lie: ${teamName}`);
                continue;
              }
            }
          }
          
          // Try SportsDB for all sports
          const sportsDbScores = await sportsDbApiService.getScores(date, pick.league);
          if (sportsDbScores) {
            // Find the game that includes the team name
            const gameKey = Object.keys(sportsDbScores).find(key => 
              key.toLowerCase().includes(teamName.toLowerCase())
            );
            
            if (gameKey) {
              scores[teamName] = sportsDbScores[gameKey];
              console.log(`Found score from SportsDB: ${teamName}`);
              continue;
            }
          }
          
          // If we get here, we couldn't find the score from primary sources
          missingGames.push(pick);
          
        } catch (error) {
          console.warn(`Error fetching score for ${teamName} from primary sources:`, error);
          missingGames.push(pick);
        }
      }
      
      // 2. If we have missing games, try Perplexity as a fallback
      if (missingGames.length > 0) {
        console.log(`Couldn't find scores for ${missingGames.length} games, trying Perplexity...`);
        const perplexityScores = await resultsCheckerService.getScoresFromPerplexity(date, missingGames);
        
        if (perplexityScores && perplexityScores.success) {
          Object.assign(scores, perplexityScores.scores || {});
        }
      }
      
      return { success: true, scores };
      
    } catch (error) {
      console.error('Error in getGameScores:', error);
      return { success: false, message: error.message };
    }
  },
  
  /**
   * Get scores for Gary's picks from Perplexity API by searching league websites
   * Used as a fallback when primary sources fail
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {Array} picks - Array of Gary's picks from the database
   * @returns {Promise<Object>} Game scores mapped by matchup
   */
  getScoresFromPerplexity: async (date, picks) => {
    if (!picks || picks.length === 0) {
      console.log('No picks provided to check scores for');
      return { success: false, message: 'No picks provided' };
    }
    
    // Helper function to normalize team names for matching
    const normalizeTeamName = (name) => {
      if (!name) return '';
      return name.trim().toLowerCase()
        .replace(/[^a-z0-9]/g, '') // Remove special chars
        .replace(/(?<=\w)(s|z)$/i, ''); // Handle common pluralizations
    };

    // Format date in a reader-friendly way for the query
    const dateObj = new Date(date);
    const formattedDate = dateObj.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    console.log(`Getting scores for ${picks.length} picks from ${formattedDate}`);
    
    // Extract team names from picks
    const teamPicks = picks.map(pick => {
      const pickStr = pick.pick || '';
      // Match team name at the start of the pick string (before any numbers)
      const teamMatch = pickStr.match(/^([A-Za-z. ]+?)(?: [\-+]?\d+(\.\d+)?(?: [\-+\-]?\d+)?)?(?: [\-+]?\d+(\.\d+)?(?: [\-+\-]?\d+)?)?$/);
      const teamName = teamMatch && teamMatch[1] ? teamMatch[1].trim() : '';
      
      if (!teamName) {
        console.warn(`Could not extract team name from pick: ${pickStr}`);
      }
      
      return {
        ...pick,
        teamName,
        normalizedTeamName: normalizeTeamName(teamName)
      };
    }).filter(pick => pick.teamName); // Filter out picks without valid team names
    
    // Group picks by league
    const picksByLeague = {};
    teamPicks.forEach(pick => {
      const league = pick.league || 'unknown';
      if (!picksByLeague[league]) {
        picksByLeague[league] = [];
      }
      picksByLeague[league].push(pick);
    });
    
    // League-specific URLs for scores
    const leagueUrls = {
      nba: [
        'https://www.nba.com/scores',
        'https://www.espn.com/nba/scoreboard'
      ],
      mlb: [
        'https://www.mlb.com/scores',
        'https://www.espn.com/mlb/scoreboard'
      ],
      nhl: [
        'https://www.nhl.com/scores',
        'https://www.espn.com/nhl/scoreboard'
      ],
      unknown: [
        'https://www.espn.com/nba/scoreboard',
        'https://www.espn.com/mlb/scoreboard',
        'https://www.espn.com/nhl/scoreboard'
      ]
    };
    
    // Create a map to store scores by team name
    const scores = {};
    
    try {
      // Process each league's picks
      for (const [league, leaguePicks] of Object.entries(picksByLeague)) {
        const urls = leagueUrls[league.toLowerCase()] || leagueUrls.unknown;
        
        // Process each pick in this league
        for (const pick of leaguePicks) {
          try {
            const teamName = pick.teamName;
            const normalizedTeam = pick.normalizedTeamName;
            
            if (!teamName) {
              console.warn('Pick is missing team information:', pick);
              continue;
            }
          
            // Create a specific query for this team's game with strict format
            const query = `
              ${formattedDate} ${teamName} final score ${league.toUpperCase()} game.
              Only include if the game has completed with final scores.
              Do not include if the game is in progress, postponed, or scheduled.
              
              Respond STRICTLY in this exact format:
              FINAL TEAM1 @ TEAM2: XX-XX
              
              Where:
              - First team is the away team
              - Second team is the home team
              - Use @ symbol to separate team names
              - Use colon and space before the score
              - Use hyphen between scores (away score first, then home score)
              
              Example: FINAL LAL @ BOS: 102-100
              
              Do not add any other text, commentary, or explanations.
              Data sources: ${urls.join(' OR ')}
            `;
            
            console.log(`Searching for: ${teamName} (${league})`);
            
            // Get the response from Perplexity
            const response = await perplexityService.search({
              query: query.replace(/\s+/g, ' ').trim(), // Clean up whitespace
              maxResults: 3, // Fewer results since we're being specific
              includeDomains: urls,
              focus: 'scores',
              format: 'text'
            });
            
            // Process the response to extract the score with improved parsing
            if (response.answers && response.answers.length > 0) {
              const answer = response.answers[0];
              
              // Match format: FINAL AWAY @ HOME: AWAY_SCORE-HOME_SCORE
              const scoreMatch = answer.match(/FINAL\s+([^@]+)@([^:]+):\s*(\d+)-(\d+)/i);
              
              if (scoreMatch) {
                const awayTeam = scoreMatch[1].trim();
                const homeTeam = scoreMatch[2].trim();
                const awayScore = parseInt(scoreMatch[3], 10);
                const homeScore = parseInt(scoreMatch[4], 10);
                
                // Check if our team is in this game (either home or away)
                const normalizedAway = normalizeTeamName(awayTeam);
                const normalizedHome = normalizeTeamName(homeTeam);
                
                if (normalizedAway.includes(normalizedTeam) || normalizedHome.includes(normalizedTeam)) {
                  // Our team is in this game, store the score with team name as key
                  scores[teamName] = {
                    home_team: homeTeam,
                    away_team: awayTeam,
                    home_score: homeScore,
                    away_score: awayScore,
                    final_score: `${awayScore}-${homeScore}`,
                    status: 'Final',
                    league: league.toUpperCase(),
                    source: 'perplexity',
                    last_updated: new Date().toISOString()
                  };
                  
                  console.log(`Found score for ${teamName}: ${awayTeam} ${awayScore} @ ${homeTeam} ${homeScore}`);
                  break; // Move to next pick once we find a match
                }
              } else {
                console.warn(`Could not parse score from: ${answer.substring(0, 100).replace(/\n/g, ' ')}...`);
              }
            }
            
            // Add delay between requests to avoid rate limiting (increased from 1000ms)
            await new Promise(resolve => setTimeout(resolve, 2000));
            
          } catch (error) {
            console.error(`Error processing pick ${pick.pick}:`, error);
            continue;
          }
        }
      }
      
      return { success: true, scores };
      
    } catch (error) {
      console.error('Error in getScoresFromPerplexity:', error);
      return { success: false, message: error.message };
    }
  },
  
  // Other methods will be added here
  
  /**
   * Check results for picks from a specific date
   * @param {string} date - Date in YYYY-MM-DD format (YYYY-MM-DD)
   * @returns {Promise<Object>} Results of the operation
   */
  checkResults: async (date) => {
    try {
      console.log(`Checking results for date: ${date}`);
      
      // 1. Get the picks for the specified date
      const { data: dailyPicks, error: picksError } = await supabase
        .from('daily_picks')
        .select('*')
        .eq('date', date)
        .single();
      
      if (picksError) {
        throw new Error(`Error fetching picks: ${picksError.message}`);
      }
      
      if (!dailyPicks || !dailyPicks.picks || dailyPicks.picks.length === 0) {
        return { success: true, message: 'No picks found for this date', scores: {} };
      }
      
      console.log(`Found ${dailyPicks.picks.length} picks to check`);
      
      // 2. Get scores using fallback strategy
      const { success, scores, message } = await resultsCheckerService.getGameScores(
        date,
        dailyPicks.picks
      );
      
      if (!success) {
        throw new Error(`Failed to get scores: ${message}`);
      }
      
      // 3. Record the results in game_results table via garyPerformanceService
      const { success: recordSuccess, message: recordMessage } = await garyPerformanceService.recordPickResults(
        date,
        Object.entries(scores).map(([matchup, score]) => ({
          pick: `${score.away_team} @ ${score.home_team}`,
          result: score.final ? 'won' : 'lost',
          score: `${score.away_score}-${score.home_score}`,
          league: score.league || 'NBA' // Default to NBA if not specified
        }))
      );
      
      if (!recordSuccess) {
        throw new Error(`Failed to record results: ${recordMessage}`);
      }
      
      // 4. Update performance metrics for the given date
      await garyPerformanceService.updatePerformanceStats(date);
      
      return { 
        success: true, 
        message: 'Results checked and recorded successfully',
        scores,
        pickCount: dailyPicks.picks.length,
        recorded: true
      };
      
    } catch (error) {
      console.error('Error in checkResults:', error);
      return { 
        success: false, 
        message: error.message,
        error: error.stack
      };
    }
  },
  
  /**
   * Start a daily job to check results automatically
   * @returns {Object} Status of the operation
   */
  startDailyResultsChecker: () => {
    // Implementation will be added here
    return { success: true, message: 'Daily results checker started' };
  }
};

export default resultsCheckerService;
