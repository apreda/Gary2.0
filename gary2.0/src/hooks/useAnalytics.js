import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { startOfMonth, subMonths, format } from 'date-fns';

export function useAnalytics() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState({
    trends: [],
    sportPerformance: [],
    currentStreak: null
  });

  const fetchHistoricalTrends = async (months = 3) => {
    const startDate = format(startOfMonth(subMonths(new Date(), months)), 'yyyy-MM-dd');
    
    try {
      const { data: trends, error } = await supabase
        .from('daily_performance')
        .select('*')
        .gte('date', startDate)
        .order('date', { ascending: true });

      if (error) throw error;
      return trends;
    } catch (error) {
      console.error('Error fetching historical trends:', error);
      return [];
    }
  };

  const fetchSportPerformance = async () => {
    try {
      const { data: performance, error } = await supabase
        .from('sport_performance')
        .select('*');

      if (error) throw error;
      return performance;
    } catch (error) {
      console.error('Error fetching sport performance:', error);
      return [];
    }
  };

  const calculateWinProbability = async (sportKey, odds, betType) => {
    try {
      const { data, error } = await supabase
        .rpc('calculate_win_probability', {
          p_sport_key: sportKey,
          p_odds: odds,
          p_bet_type: betType
        });

      if (error) throw error;
      return data[0];
    } catch (error) {
      console.error('Error calculating win probability:', error);
      return null;
    }
  };

  const getBestPerformingBets = async () => {
    try {
      const { data: picks, error } = await supabase
        .from('user_picks')
        .select('*')
        .eq('outcome', 'win')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      return picks;
    } catch (error) {
      console.error('Error fetching best performing bets:', error);
      return [];
    }
  };

  const getStreakAnalysis = async () => {
    try {
      const { data: streakData, error } = await supabase
        .rpc('get_user_streak', {
          user_id: (await supabase.auth.getSession()).data.session?.user?.id
        });

      if (error) throw error;
      return streakData[0];
    } catch (error) {
      console.error('Error fetching streak analysis:', error);
      return null;
    }
  };

  const refreshAnalytics = async () => {
    setLoading(true);
    setError(null);

    try {
      const [trends, sportPerf, streak] = await Promise.all([
        fetchHistoricalTrends(),
        fetchSportPerformance(),
        getStreakAnalysis()
      ]);

      setData({
        trends,
        sportPerformance: sportPerf,
        currentStreak: streak
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshAnalytics();
  }, []);

  return {
    ...data,
    loading,
    error,
    refreshAnalytics,
    calculateWinProbability,
    getBestPerformingBets
  };
}
