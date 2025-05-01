import { supabase } from '../supabaseClient';

/**
 * Generate a random UUID v4
 * @returns {string} A valid UUID
 */
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, 
          v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

/**
 * Service for tracking Gary's pick performance
 */
export const garyPerformanceService = {
  /**
   * Fetch Gary's win/loss record from game_results table
   * @param {Object} filters - Optional filters for date range, league, etc.
   * @returns {Promise<Object>} Gary's performance statistics
   */
  getGaryPerformance: async (filters = {}) => {
    try {
      // Query game_results table to get all pick results
      let query = supabase
        .from('game_results')
        .select('*');
      
      // Apply filters if provided
      if (filters.startDate) {
        query = query.gte('game_date', filters.startDate);
      }
      if (filters.endDate) {
        query = query.lte('game_date', filters.endDate);
      }
      if (filters.league) {
        query = query.eq('league', filters.league);
      }
      
      const { data, error } = await query;
      
      if (error) {
        console.error('Error fetching Gary\'s performance data:', error);
        return { success: false, error };
      }
      
      // Calculate overall performance
      const wins = data.filter(record => record.result === 'won').length;
      const losses = data.filter(record => record.result === 'lost').length;
      const pushes = data.filter(record => record.result === 'push').length;
      const total = wins + losses + pushes;
      
      // Calculate win rate (exclude pushes from the calculation)
      const decisiveGames = total - pushes;
      const winRate = decisiveGames > 0 ? (wins / decisiveGames) * 100 : 0;
      
      // Create performance summary
      const summary = {
        total,
        wins,
        losses,
        pushes,
        winRate: parseFloat(winRate.toFixed(1)),
        record: `${wins}-${losses}${pushes > 0 ? `-${pushes}` : ''}`,
      };
      
      // Calculate performance by league
      const sportBreakdown = [];
      const leagues = [...new Set(data.map(record => record.league))];
      
      for (const league of leagues) {
        const leagueData = data.filter(record => record.league === league);
        const leagueWins = leagueData.filter(record => record.result === 'won').length;
        const leagueLosses = leagueData.filter(record => record.result === 'lost').length;
        const leaguePushes = leagueData.filter(record => record.result === 'push').length;
        const leagueTotal = leagueWins + leagueLosses + leaguePushes;
        const leagueDecisive = leagueTotal - leaguePushes;
        const leagueWinRate = leagueDecisive > 0 ? (leagueWins / leagueDecisive) * 100 : 0;
        
        sportBreakdown.push({
          name: league,
          icon: league === 'NBA' ? '🏀' : 
                league === 'MLB' ? '⚾' :
                league === 'NFL' ? '🏈' :
                league === 'NHL' ? '🏒' : '🎯',
          record: `${leagueWins}-${leagueLosses}${leaguePushes > 0 ? `-${leaguePushes}` : ''}`,
          winRate: parseFloat(leagueWinRate.toFixed(1)),
          totalBets: leagueTotal,
          // Add these properties for the chart to use
          wins: leagueWins,
          losses: leagueLosses,
          pushes: leaguePushes,
          total: leagueTotal
        });
      }
      
      return { 
        success: true, 
        summary, 
        sportBreakdown,
        // Return raw data as well if needed elsewhere
        data
      };
    } catch (error) {
      console.error('Error in getPerformanceStats:', error);
      return { success: false, error };
    }
  },
  
  /**
   * Manually record the results of Gary's picks
   * @param {string} date - Date of the picks in YYYY-MM-DD format
   * @param {Array} results - Array of objects with pick and result fields
   * @returns {Promise<{ success: boolean, message: string }>}
   */
  recordPickResults: async (date, results) => {
    try {
      // Debug logging to inspect incoming results before any processing
      console.log('INCOMING RAW RESULTS to recordPickResults:', JSON.stringify(results));
      
      // Ensure we preserve the original pick text from any input transformation
      // This fixes an issue where pick text was being lost/changed to "result"
      const preservedResults = results.map((result, index) => {
        console.log(`Processing result ${index} in garyPerformanceService:`, JSON.stringify(result));
        
        // Advanced recovery for pick text
        let finalPickText = result.pick;
        
        // Define a hierarchy of backup fields to check
        const backupFields = ['originalPick', 'pickText', 'text', 'originalPickText'];
        
        // If the pick is missing or 'result', try recovery from backup fields
        if (!finalPickText || finalPickText === 'result') {
          console.log(`Need to recover pick text for result ${index}`);
          
          // Try each backup field in order
          for (const field of backupFields) {
            if (result[field] && typeof result[field] === 'string' && result[field] !== 'result') {
              finalPickText = result[field];
              console.log(`Recovered pick text from ${field}: "${finalPickText}"`);
              break;
            }
          }
          
          // If still not recovered, try the rawResult object if available
          if ((!finalPickText || finalPickText === 'result') && result.rawResult) {
            for (const field of backupFields) {
              if (result.rawResult[field] && typeof result.rawResult[field] === 'string' && result.rawResult[field] !== 'result') {
                finalPickText = result.rawResult[field];
                console.log(`Recovered pick text from rawResult.${field}: "${finalPickText}"`);
                break;
              }
            }
          }
          
          // If still no valid pick text, create a descriptive placeholder
          if (!finalPickText || finalPickText === 'result') {
            finalPickText = result.homeTeam && result.awayTeam ?
              `Pick for ${result.awayTeam} @ ${result.homeTeam}` :
              `Unknown Pick ${index + 1}`;
            console.log(`Created descriptive placeholder: "${finalPickText}"`);
          }
        }
        
        // Return an object with all original fields plus the recovered pick text
        return {
          ...result,
          pick: finalPickText,
          // Add backup fields just in case
          originalPick: finalPickText,
          pickText: finalPickText
        };
      });
      
      console.log('PRESERVED RESULTS after fix:', JSON.stringify(preservedResults));
      
      // Use the preserved results for the rest of the function
      const processedResults = preservedResults;
      
      // Get the picks from the daily_picks table
      const { data: dailyPick, error: pickError } = await supabase
        .from('daily_picks')
        .select('*')
        .eq('date', date)
        .maybeSingle();

      if (pickError) {
        console.error('Error fetching daily pick data for results recording:', pickError);
        return { success: false, error: pickError, message: 'Error fetching daily pick data' };
      }

      if (!dailyPick) {
        console.error('No daily pick found for date:', date);
        return { success: false, message: `No daily pick found for date: ${date}` };
      }

      console.log(`Found daily pick for ${date} with ID ${dailyPick.id}, processing ${results.length} results`);
      
      // Create entries in game_results table using the actual daily_pick ID
      const pickId = dailyPick.id;
      console.log('Using daily_picks ID as foreign key:', pickId);

      // Record each result in the database
      const recordedResults = [];
      let validResultsCount = 0;

      // Debug output to see the structure of results
      console.log('Results structure for matching:', JSON.stringify(results, null, 2));
      
      for (const result of results) {
        // Skip invalid results
        if (!result.pick || !result.result) continue;
        
        console.log(`Processing result: ${JSON.stringify(result)}`);

        // Replace special characters in pick string to match original when searching
        const normalizedPickText = result.pick.replace(/\s+/g, ' ').trim();
        
        // Find the original pick from daily_picks with improved matching
        // First try exact normalized matching
        let originalPick = dailyPick.picks.find(p => {
          if (!p || !p.pick) return false;
          const pNormalized = p.pick.replace(/\s+/g, ' ').trim();
          return pNormalized === normalizedPickText;
        });

        // If not found, try partial matching (case insensitive)
        if (!originalPick) {
          const lowerPickText = normalizedPickText.toLowerCase();
          originalPick = dailyPick.picks.find(p => {
            if (!p || !p.pick) return false;
            return p.pick.toLowerCase().includes(lowerPickText) || 
                   lowerPickText.includes(p.pick.toLowerCase());
          });
        }
        
        // If still not found, try matching based on teams
        if (!originalPick && result.score) {
          // Extract team names from score if available
          const scoreTeams = result.score.toLowerCase().replace(/\d+/g, '').replace(/-/g, '');
          originalPick = dailyPick.picks.find(p => {
            if (!p || !p.homeTeam || !p.awayTeam) return false;
            const homeTeam = p.homeTeam.toLowerCase();
            const awayTeam = p.awayTeam.toLowerCase();
            return scoreTeams.includes(homeTeam) && scoreTeams.includes(awayTeam);
          });
        }

        if (!originalPick) {
          console.log(`Could not find original pick for "${normalizedPickText}" in daily picks data`);
          continue;
        }

        // Get the league - either from the result object (if Perplexity returned it)
        // or from the original pick in the daily_picks table
        const league = result.league || originalPick.league || 'UNKNOWN';
        console.log(`Using league ${league} for pick "${normalizedPickText}"`);

        try {
          // Format the matchup text
          let matchup = '';
          if (originalPick && originalPick.homeTeam && originalPick.awayTeam) {
            matchup = `${originalPick.awayTeam} @ ${originalPick.homeTeam}`;
          }

          // Insert the result into game_results table
          const { data: insertedResult, error: insertError } = await supabase
            .from('game_results')
            .insert({
              pick_id: pickId, // Use the daily pick ID as foreign key
              game_date: date,
              result: result.result,
              final_score: result.score || '',
              pick_text: result.pick, // Store the original pick text
              matchup: matchup,       // Add the matchup information
              league: league          // Add the league field
            })
            .select();

          if (insertError) {
            console.error(`Error recording result for pick "${result.pick}":`, insertError);
          } else {
            console.log(`Successfully recorded result for pick "${result.pick}" (${league}):`, result.result);
            recordedResults.push(insertedResult[0]);
            validResultsCount++;
          }
        } catch (error) {
          console.error(`Error processing result for pick "${result.pick}":`, error);
        }
      }

      console.log(`Found ${validResultsCount} valid results out of ${results.length} total`);
      
      return { 
        success: true, 
        message: `Recorded ${validResultsCount} results for ${date}`,
        results: recordedResults,
        length: recordedResults.length
      };
    } catch (error) {
      console.error('Error recording pick results:', error);
      return { success: false, message: error.message };
    }
  },
  
  /**
   * Track Gary's picks and update their results in the game_results table
   * This method reads from daily_picks table and updates game_results table
   */
  trackPickResults: async () => {
    try {
      console.log('Tracking Gary\'s pick results...');
      
      // 1. Get all of Gary's picks from daily_picks table
      const { data: dailyPicksData, error: picksError } = await supabase
        .from('daily_picks')
        .select('id, date, picks')
        .order('date', { ascending: false })
        .limit(20); // Limit to most recent to avoid processing too many
      
      if (picksError) {
        console.error('Error fetching picks data:', picksError);
        return { success: false, error: picksError };
      }
      
      if (!dailyPicksData || dailyPicksData.length === 0) {
        console.log('No daily picks found to process');
        return { success: true, processed: 0 };
      }
      
      let totalProcessed = 0;
      let resultsAdded = 0;
      
      // Process each day's picks
      for (const dayData of dailyPicksData) {
        // Skip if no picks data
        if (!dayData.picks || !Array.isArray(dayData.picks)) {
          continue;
        }
        
        // Process each individual pick
        for (const pick of dayData.picks) {
          // Skip if no ID
          if (!pick.id) {
            continue;
          }
          
          // For this simplified implementation, we'll use mock data to simulate game results
          // In production, you would connect to an odds/scores API or manually enter results
          
          // Check if this pick already has a result recorded
          const { data: existingResult } = await supabase
            .from('game_results')
            .select('*')
            .eq('pick_id', pick.id)
            .maybeSingle();
            
          if (existingResult) {
            // Skip if already recorded
            console.log(`Result for pick ${pick.id} already recorded as ${existingResult.result}`);
            continue;
          }
          
          // Get pick details for recording
          const league = pick.league || (pick.sport || '').toUpperCase() || 'UNKNOWN';
          const gameDate = pick.gameDate || dayData.date || new Date().toISOString().split('T')[0];
          
          // For this simplified version, we'll use a random result
          // In production, you would check the actual game outcome 
          const possibleResults = ['won', 'lost', 'push'];
          const randomResult = possibleResults[Math.floor(Math.random() * 2)]; // Bias toward won/lost (not push)
          
          // Record the result
          const { data: newResult, error: insertError } = await supabase
            .from('game_results')
            .insert({
              pick_id: pick.id,
              game_date: gameDate,
              league: league,
              result: randomResult,
              final_score: 'Mock Score: 100-95' // Mock score for now
            })
            .select();
            
          if (insertError) {
            console.error(`Error recording result for pick ${pick.id}:`, insertError);
          } else {
            console.log(`Recorded result for pick ${pick.id}: ${randomResult}`);
            resultsAdded++;
          }
          
          totalProcessed++;
        }
      }
      
      return { 
        success: true, 
        processed: totalProcessed,
        resultsAdded
      };
    } catch (error) {
      console.error('Error tracking pick results:', error);
      return { success: false, error };
    }
  },
  
  /**
   * Add a test result to the game_results table (for testing/demo purposes)
   */
  addTestResult: async (league = 'NBA', result = 'won') => {
    try {
      const { data, error } = await supabase
        .from('game_results')
        .insert({
          pick_id: `test-${Date.now()}`,
          game_date: new Date().toISOString().split('T')[0],
          league,
          result,
          final_score: 'Test Score 105-98'
        })
        .select();
        
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('Error adding test result:', error);
      return { success: false, error };
    }
  }
};
