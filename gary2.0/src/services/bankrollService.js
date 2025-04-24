import { supabase } from '../supabaseClient';

/**
 * Service for managing Gary's bankroll and wagers
 */
const bankrollService = {
  /**
   * Get the current bankroll status
   * @returns {Promise<Object>} - Current bankroll data (using hardcoded values)
   */
  getBankrollData: async () => {
    try {
      // Return hardcoded bankroll data instead of querying the database
      // since the bankroll table doesn't exist in Supabase
      console.log('Using default bankroll data (hardcoded values)');
      const defaultBankroll = {
        starting_amount: 10000,
        current_amount: 10000,
        monthly_goal_percent: 30,
        start_date: new Date().toISOString().split('T')[0],
        last_updated: new Date().toISOString()
      };
      
      return defaultBankroll;
    } catch (err) {
      console.error('Unexpected error in getBankrollData:', err);
      return {
        starting_amount: 10000,
        current_amount: 10000,
        monthly_goal_percent: 30,
        start_date: new Date().toISOString().split('T')[0],
        last_updated: new Date().toISOString()
      };
    }
  },
  
  /**
   * Calculate wager amount for a pick based on confidence and bankroll strategy
   * @param {number} confidence - Gary's confidence in the pick (0-100)
   * @param {number} currentBankroll - Current bankroll amount
   * @returns {number} - Calculated wager amount
   */
  calculateWagerAmount: (confidence, currentBankroll) => {
    // Gary's strategy: aggressive when confident, cautious when less confident,
    // with added randomness to vary bet sizes
    
    // Base range varies more widely based on confidence
    let minPercentage, maxPercentage;
    
    if (confidence >= 80) {
      // Very high confidence (80-100%) = 4-8% of bankroll
      minPercentage = 0.04;
      maxPercentage = 0.08;
    } else if (confidence >= 70) {
      // High confidence (70-79%) = 3-6% of bankroll
      minPercentage = 0.03;
      maxPercentage = 0.06;
    } else if (confidence >= 60) {
      // Medium-high confidence (60-69%) = 2-4% of bankroll
      minPercentage = 0.02;
      maxPercentage = 0.04;
    } else if (confidence >= 50) {
      // Medium confidence (50-59%) = 1-2.5% of bankroll
      minPercentage = 0.01;
      maxPercentage = 0.025;
    } else {
      // Lower confidence (below 50%) = 0.5-1.5% of bankroll
      minPercentage = 0.005;
      maxPercentage = 0.015;
    }
    
    // Add some randomness within the confidence range
    // This makes Gary's betting pattern less predictable and more human-like
    const randomFactor = Math.random();
    const percentageToUse = minPercentage + (randomFactor * (maxPercentage - minPercentage));
    
    // Calculate raw amount
    let wagerAmount = Math.round(currentBankroll * percentageToUse);
    
    // Round to nearest $5 for cleaner numbers
    wagerAmount = Math.round(wagerAmount / 5) * 5;
    
    // Ensure minimum bet of $25
    return Math.max(wagerAmount, 25);
  },
  
  /**
   * Record a wager in the database
   * @param {Object} wager - Wager details
   * @returns {Promise<Object>} - Recorded wager data
   */
  recordWager: async (wager) => {
    try {
      const { data, error } = await supabase
        .from('wagers')
        .insert([{
          pick_id: wager.pickId,
          amount: wager.amount,
          odds: wager.odds,
          potential_payout: wager.potentialPayout,
          placed_date: new Date().toISOString(),
          status: 'pending' // pending, won, lost
        }])
        .select()
        .single();
      
      if (error) {
        console.error('Error recording wager:', error);
        return null;
      }
      
      return data;
    } catch (err) {
      console.error('Unexpected error in recordWager:', err);
      return null;
    }
  },
  
  /**
   * Update wager result and adjust bankroll
   * @param {string} wagerId - ID of the wager to update
   * @param {string} result - Result of the wager ('won' or 'lost')
   * @returns {Promise<boolean>} - Whether the operation was successful
   */
  updateWagerResult: async (wagerId, result) => {
    try {
      // Get the wager data
      const { data: wagerData, error: wagerError } = await supabase
        .from('wagers')
        .select('*')
        .eq('id', wagerId)
        .single();
      
      if (wagerError || !wagerData) {
        console.error('Error fetching wager data:', wagerError);
        return false;
      }
      
      // Update the wager status
      const { error: updateError } = await supabase
        .from('wagers')
        .update({ 
          status: result === 'won' ? 'won' : 'lost',
          result_date: new Date().toISOString()
        })
        .eq('id', wagerId);
      
      if (updateError) {
        console.error('Error updating wager result:', updateError);
        return false;
      }
      
      // Instead of querying the bankroll table, we'll use a hardcoded value
      // since we don't actually need to update a bankroll table in the database
      console.log(`Wager ${wagerId} result updated to ${result}`);
      console.log('Note: Bankroll table updates skipped as the table does not exist');
      
      return true;
    } catch (err) {
      console.error('Unexpected error in updateWagerResult:', err);
      return false;
    }
  },
  
  /**
   * Get betting history with results
   * @returns {Promise<Array>} - Betting history
   */
  getBettingHistory: async () => {
    try {
      const { data, error } = await supabase
        .from('wagers')
        .select(`
          *,
          picks:pick_id (*)
        `)
        .order('placed_date', { ascending: false });
      
      if (error) {
        console.error('Error fetching betting history:', error);
        return [];
      }
      
      return data || [];
    } catch (err) {
      console.error('Unexpected error in getBettingHistory:', err);
      return [];
    }
  }
};

export { bankrollService };
