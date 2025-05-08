import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';

export function useUserStats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user } = useAuth();

  const [realtimeStatus, setRealtimeStatus] = useState('disconnected');
  const [retryCount, setRetryCount] = useState(0);
  const [subscription, setSubscription] = useState(null);
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 2000; // 2 seconds

  // Function to simulate connection issues (DEV ONLY)
  const simulateConnectionIssue = () => {
    if (process.env.NODE_ENV === 'development' && subscription) {
      console.log('Simulating connection issue...');
      subscription.unsubscribe();
      setRealtimeStatus('disconnected');
    }
  };

  const setupRealtimeSubscription = async () => {
    try {
      const channel = supabase.channel('user_stats_changes');

      channel
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'user_stats',
            filter: `id=eq.${user.id}`
          },
          async (payload) => {
            console.log('Real-time update received:', payload);
            await fetchUserStats();
          }
        )
        .on('error', (error) => {
          console.error('Realtime subscription error:', error);
          setRealtimeStatus('error');
          if (retryCount < MAX_RETRIES) {
            setTimeout(() => {
              setRetryCount(prev => prev + 1);
              setupRealtimeSubscription();
            }, RETRY_DELAY * (retryCount + 1)); // Exponential backoff
          }
        })
        .on('connected', () => {
          console.log('Realtime connected');
          setRealtimeStatus('connected');
          setRetryCount(0); // Reset retry count on successful connection
        })
        .on('disconnected', () => {
          console.log('Realtime disconnected');
          setRealtimeStatus('disconnected');
          // Attempt to reconnect if we haven't exceeded retries
          if (retryCount < MAX_RETRIES) {
            setTimeout(() => {
              setRetryCount(prev => prev + 1);
              setupRealtimeSubscription();
            }, RETRY_DELAY * (retryCount + 1));
          }
        });

      await channel.subscribe();
      setSubscription(channel);
      return channel;
    } catch (error) {
      console.error('Error setting up realtime:', error);
      setRealtimeStatus('error');
      throw error;
    }
  };

  useEffect(() => {
    // Initialize with empty stats for unauthenticated users
    if (!user) {
      setStats({
        username: 'Guest',
        joinDate: new Date().getFullYear().toString(),
        stats: {
          totalPicks: 0,
          rideCount: 0,
          fadeCount: 0,
          winCount: 0,
          lossCount: 0,
          currentStreak: 0,
          longestStreak: 0,
          lastResult: null,
          bankroll: 1000,
          recentResults: []
        }
      });
      setLoading(false);
      return;
    }

    fetchUserStats();
    
    // Set up real-time subscription
    setupRealtimeSubscription()
      .catch(error => {
        console.error('Failed to set up realtime:', error);
        setError('Real-time connection failed. Stats may not update automatically.');
      });

    // Cleanup subscription when component unmounts or user changes
    return () => {
      if (subscription) {
        subscription.unsubscribe();
        setSubscription(null);
        setRealtimeStatus('disconnected');
      }
    };
  }, [user]);

  const fetchUserStats = async () => {
    try {
      setLoading(true);
      
      console.log('Fetching stats for user:', user);
      
      if (!user) {
        console.log('No user found, returning null stats');
        setStats(null);
        return;
      }
      
      // Query the user_stats table using the user's ID
      let { data: userStatsArray, error: statsError } = await supabase
        .from('user_stats')
        .select('*')
        .eq('id', user.id);
        
      console.log('User stats query result:', userStatsArray, statsError);
      
      // Get the first stats record if it exists
      const existingStats = userStatsArray && userStatsArray.length > 0 ? userStatsArray[0] : null;
      
      // Only throw an error if it's not a "no rows returned" error
      if (statsError && statsError.code !== 'PGRST116') throw statsError;

      let userStats;

      // If no stats exist yet, create them
      if (!existingStats) {
        console.log('No existing stats found, creating new record');
        
        // Schema for empty stats - this should match the Supabase user_stats table exactly
        const newStats = {
          id: user.id,
          total_picks: 0,
          ride_count: 0,
          fade_count: 0,
          win_count: 0,
          loss_count: 0,
          current_streak: 0,
          longest_streak: 0,
          recent_results: [],
          last_result: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        
        // Create new record in the user_stats table
        const { data: insertedData, error: insertError } = await supabase
          .from('user_stats')
          .insert([newStats]);
          
        console.log('Insert result:', insertedData, 'Error:', insertError);
        
        // If creation was successful, use the new stats
        if (!insertError && insertedData && insertedData.length > 0) {
          userStats = insertedData[0];
        }
        
        // If we still failed, try a more direct approach on the correct table
        if (!userStats) {
          console.log('Retrying with direct table access');
          const { data: retryData, error: retryError } = await supabase
            .from('user_stats') 
            .insert([newStats]);
            
          console.log('Retry result:', retryData, 'Error:', retryError);
          
          if (!retryError && retryData && retryData.length > 0) {
            userStats = retryData[0];
          } else if (userStatsArray && userStatsArray.length > 0) {
            userStats = userStatsArray[0];
          }
        }
      } else {
        userStats = existingStats;
      }

      // Format stats for the baseball card
      const formattedStats = {
        username: user.email?.split('@')[0] || 'User',
        joinDate: new Date(user.created_at).getFullYear().toString(),
        stats: {
          totalPicks: userStats?.total_picks || 0,
          rideCount: userStats?.ride_count || 0,
          fadeCount: userStats?.fade_count || 0,
          winCount: userStats?.win_count || 0,
          lossCount: userStats?.loss_count || 0,
          currentStreak: userStats?.current_streak || 0,
          longestStreak: userStats?.longest_streak || 0,
          lastResult: userStats?.last_result,
          // Remove bankroll since it doesn't exist in the table
          recentResults: userStats?.recent_results || []
        }
      };

      console.log('Setting formatted stats:', formattedStats);
      setStats(formattedStats);
    } catch (error) {
      console.error('Error fetching user stats:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Method to record a bet/fade decision
  const updateStats = async (action, gameId) => {
    try {
      if (!user) {
        console.log('No authenticated user, skipping stats update');
        return false;
      }
      
      // Only handle ride and fade actions
      if (action !== 'ride' && action !== 'fade') {
        console.warn('Invalid action:', action);
        return false;
      }
      
      // We need a gameId to record the decision
      if (!gameId) {
        console.warn('No gameId provided for decision');
        return false;
      }
      
      // First, record the user decision
      await recordUserDecision(user.id, gameId, action);

      // Then, check if the game result is already available to update win/loss stats
      await checkGameResult(user.id, gameId, action);
      
      return true;
    } catch (error) {
      console.error('Error updating stats:', error);
      setError(error.message);
      return false;
    }
  };
  
  // Record user's decision in user_decisions table
  const recordUserDecision = async (userId, gameId, decisionType) => {
    try {
      // First check if user already made a decision for this game
      const { data: existing } = await supabase
        .from('user_decisions')
        .select('*')
        .eq('user_id', userId)
        .eq('game_id', gameId)
        .maybeSingle();
        
      // If user already made a decision, update it
      if (existing) {
        await supabase
          .from('user_decisions')
          .update({ 
            decision_type: decisionType,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);
      } else {
        // Otherwise create a new decision record
        await supabase
          .from('user_decisions')
          .insert([{ 
            user_id: userId,
            game_id: gameId,
            decision_type: decisionType,
            created_at: new Date().toISOString()
          }]);
      }
      
      // Update the appropriate count in user_stats
      const countField = decisionType === 'ride' ? 'ride_count' : 'fade_count';
      
      // Get current stats
      const { data: currentStats } = await supabase
        .from('user_stats')
        .select('*')
        .eq('id', userId)
        .single();
        
      if (currentStats) {
        await supabase
          .from('user_stats')
          .update({ 
            [countField]: (currentStats[countField] || 0) + 1,
            total_picks: (currentStats.total_picks || 0) + 1,
            updated_at: new Date().toISOString()
          })
          .eq('id', userId);
      }
    } catch (error) {
      console.error('Error recording user decision:', error);
      throw error;
    }
  };
  
  // Check if the game has a result and update user's win/loss record
  const checkGameResult = async (userId, gameId, decisionType) => {
    try {
      // Get game result from game_results table
      const { data: gameResult } = await supabase
        .from('game_results')
        .select('*')
        .eq('id', gameId)
        .maybeSingle();
        
      // If no result yet, do nothing
      if (!gameResult || !gameResult.result) {
        return;
      }
      
      const isGaryWin = gameResult.result.toLowerCase() === 'win';
      
      // Determine if user decision was correct
      // If user rode with Gary and Gary wins → User wins
      // If user faded Gary and Gary loses → User wins
      let isUserWin = false;
      if ((decisionType === 'ride' && isGaryWin) || (decisionType === 'fade' && !isGaryWin)) {
        isUserWin = true;
      }
      
      // Update user stats with the result
      await updateUserResultStats(userId, isUserWin);
      
      // Mark the user decision as processed with result
      await supabase
        .from('user_decisions')
        .update({ 
          processed: true, 
          result: isUserWin ? 'win' : 'loss',
          updated_at: new Date().toISOString() 
        })
        .eq('user_id', userId)
        .eq('game_id', gameId);
    } catch (error) {
      console.error('Error checking game result:', error);
    }
  };
  
  // Update user's win/loss stats based on the result
  const updateUserResultStats = async (userId, isWin) => {
    try {
      // Get current stats
      const { data: currentStats } = await supabase
        .from('user_stats')
        .select('*')
        .eq('id', userId)
        .single();
        
      if (!currentStats) return;
      
      // Calculate updated stats
      const updates = {
        win_count: isWin ? (currentStats.win_count || 0) + 1 : currentStats.win_count,
        loss_count: !isWin ? (currentStats.loss_count || 0) + 1 : currentStats.loss_count,
        last_result: isWin ? 'win' : 'loss',
        updated_at: new Date().toISOString()
      };
      
      // Update streak
      if (isWin) {
        if (currentStats.last_result === 'win') {
          updates.current_streak = (currentStats.current_streak || 0) + 1;
        } else {
          updates.current_streak = 1;
        }
        
        // Update longest streak if needed
        if (updates.current_streak > (currentStats.longest_streak || 0)) {
          updates.longest_streak = updates.current_streak;
        }
      } else {
        // Loss
        if (currentStats.last_result === 'loss') {
          updates.current_streak = (currentStats.current_streak || 0) - 1;
        } else {
          updates.current_streak = -1;
        }
      }
      
      // Update recent results (keep last 6)
      updates.recent_results = [
        isWin ? 'W' : 'L',
        ...(currentStats.recent_results || []).slice(0, 5)
      ];
      
      // Update in database
      await supabase
        .from('user_stats')
        .update(updates)
        .eq('id', userId);
    } catch (error) {
      console.error('Error updating user result stats:', error);
    }
  };
  
  // Process all pending user decisions that haven't been checked against game results yet
  const checkAllPendingResults = async () => {
    try {
      if (!user) return { processed: 0 };
      
      // Get all unprocessed decisions
      const { data: pendingDecisions } = await supabase
        .from('user_decisions')
        .select('*')
        .eq('user_id', user.id)
        .eq('processed', false);
        
      if (!pendingDecisions || pendingDecisions.length === 0) {
        return { processed: 0 };
      }
      
      // Process each pending decision
      let processingCount = 0;
      for (const decision of pendingDecisions) {
        await checkGameResult(user.id, decision.game_id, decision.decision_type);
        processingCount++;
      }
      
      return { processed: processingCount };
    } catch (error) {
      console.error('Error checking pending results:', error);
      return { processed: 0, error: error.message };
    }
  };

  return {
    stats,
    loading,
    error,
    updateStats,
    checkAllPendingResults,
    realtimeStatus,
    // DEV ONLY: Expose function to simulate issues
    simulateConnectionIssue: process.env.NODE_ENV === 'development' ? simulateConnectionIssue : undefined
  };
}
