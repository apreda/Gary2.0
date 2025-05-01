import { supabase } from '../supabaseClient';

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
          totalBets: leagueTotal
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
      // Get the picks from the daily_picks table
      const { data: dailyPick, error: pickError } = await supabase
        .from('daily_picks')
        .select('*')
        .eq('date', date)
        .maybeSingle();

      if (pickError) throw pickError;

      if (!dailyPick) {
        return { success: false, message: `No picks found for ${date}` };
      }

      // For each result, insert a record in the game_results table
      const gameResults = [];
      
      for (const result of results) {
        // Create a synthetic ID for the pick
        const pickId = `${date}-${result.pick.replace(/\s+/g, '-')}`;
        
        // Get league from the pick
        let league = 'Unknown';
        if (result.pick.includes('NHL') || 
            result.pick.toLowerCase().includes('hockey')) {
          league = 'NHL';
        } else if (result.pick.includes('NBA') || 
                  result.pick.toLowerCase().includes('basketball') || 
                  result.pick.includes('Knicks') || 
                  result.pick.includes('Nuggets') || 
                  result.pick.includes('Timberwolves') || 
                  result.pick.includes('Pacers')) {
          league = 'NBA';
        } else if (result.pick.includes('MLB') || 
                  result.pick.toLowerCase().includes('baseball') || 
                  result.pick.includes('Astros') || 
                  result.pick.includes('Marlins') || 
                  result.pick.includes('Mariners') || 
                  result.pick.includes('Guardians') || 
                  result.pick.includes('Yankees') || 
                  result.pick.includes('Pirates') || 
                  result.pick.includes('Reds') || 
                  result.pick.includes('Phillies') || 
                  result.pick.includes('Mets')) {
          league = 'MLB';
        }

        // Insert to game_results
        const { data, error: insertError } = await supabase
          .from('game_results')
          .insert({
            pick_id: pickId,
            game_date: date,
            league: league,
            result: result.result,
            final_score: result.score || 'N/A'
          })
          .select()
          .single();

        if (insertError) {
          console.error(`Error inserting result for pick ${result.pick}:`, insertError);
          continue;
        }

        gameResults.push(data);
      }

      return { 
        success: true, 
        message: `Recorded ${gameResults.length} pick results for ${date}`,
        data: gameResults
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
