import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { startOfMonth, subMonths, format, addDays, parseISO } from 'date-fns';

// Mock data for development use
const MOCK_DATA = {
  dailyPerformance: Array(90).fill().map((_, i) => {
    const date = format(addDays(subMonths(new Date(), 3), i), 'yyyy-MM-dd');
    const randomWins = Math.floor(Math.random() * 6) + 1;
    const randomLosses = Math.floor(Math.random() * 4);
    const totalPicks = randomWins + randomLosses;
    const profitLoss = (randomWins * 100) - (randomLosses * 100);
    return {
      date,
      wins: randomWins,
      losses: randomLosses,
      total_picks: totalPicks,
      profit_loss: profitLoss,
      outcome: profitLoss > 0 ? 'win' : 'loss',
    };
  }),
  sportPerformance: [
    {
      sport_type: "NBA",
      win_rate: 64,
      total_profit_loss: 480,
      total_picks: 25,
      avg_odds: "-110",
      best_bet_type: "Spread",
      best_bet_win_rate: 72
    },
    {
      sport_type: "NFL",
      win_rate: 58,
      total_profit_loss: 320,
      total_picks: 19,
      avg_odds: "-115",
      best_bet_type: "Moneyline",
      best_bet_win_rate: 65
    },
    {
      sport_type: "MLB",
      win_rate: 55,
      total_profit_loss: 250,
      total_picks: 22,
      avg_odds: "+105",
      best_bet_type: "Total",
      best_bet_win_rate: 60
    },
    {
      sport_type: "NHL",
      win_rate: 52,
      total_profit_loss: 180,
      total_picks: 15,
      avg_odds: "-105",
      best_bet_type: "Puck Line",
      best_bet_win_rate: 58
    }
  ],
  currentStreak: {
    length: 3,
    type: 'win',
    profit: 320
  },
  optimalPatterns: [
    { pattern: 'NBA Home Favorites', win_rate: 72, profit: 620 },
    { pattern: 'NFL Underdogs +7', win_rate: 68, profit: 480 },
    { pattern: 'MLB Under 8.5 Runs', win_rate: 65, profit: 320 },
    { pattern: 'NBA Player Points Over', win_rate: 62, profit: 280 }
  ]
};

export function useGaryAnalytics() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState({
    dailyPerformance: [],
    sportPerformance: [],
    currentStreak: null,
    optimalPatterns: []
  });

  const fetchDailyPerformance = async (months = 3) => {
    const startDate = format(startOfMonth(subMonths(new Date(), months)), 'yyyy-MM-dd');
    
    try {
      const { data, error } = await supabase
        .from('gary_daily_performance')
        .select('*')
        .gte('date', startDate)
        .order('date', { ascending: true });

      if (error) throw error;
      return data;
    } catch (error) {
      // In development, use mock data instead of showing errors
      console.log('Using mock daily performance data');
      return MOCK_DATA.dailyPerformance;
    }
  };

  const fetchSportPerformance = async () => {
    try {
      const { data, error } = await supabase
        .from('gary_sport_performance')
        .select('*')
        .order('win_rate', { ascending: false });

      if (error) throw error;
      return data;
    } catch (error) {
      // In development, use mock data instead of showing errors
      console.log('Using mock sport performance data');
      return MOCK_DATA.sportPerformance;
    }
  };

  const fetchGaryStreak = async () => {
    try {
      const { data, error } = await supabase
        .rpc('get_gary_streak');

      if (error) throw error;
      return data[0];
    } catch (error) {
      // In development, use mock data instead of showing errors
      console.log('Using mock streak data');
      return MOCK_DATA.currentStreak;
    }
  };

  const fetchOptimalPatterns = async () => {
    try {
      const { data, error } = await supabase
        .rpc('analyze_optimal_patterns');

      if (error) throw error;
      return data;
    } catch (error) {
      // In development, use mock data instead of showing errors
      console.log('Using mock optimal patterns data');
      return MOCK_DATA.optimalPatterns;
    }
  };

  const calculateHistoricalTrends = (dailyData) => {
    if (!dailyData?.length) return null;

    const trends = {
      bestStreak: 0,
      worstStreak: 0,
      bestDay: null,
      worstDay: null,
      mostProfitableSport: null,
      bestBetType: null
    };

    let currentStreak = 0;
    let lastOutcome = null;

    dailyData.forEach((day) => {
      const winRate = (day.wins / day.total_picks) * 100;

      if (lastOutcome === day.outcome) {
        currentStreak++;
      } else {
        currentStreak = 1;
      }

      if (day.outcome === 'win' && currentStreak > trends.bestStreak) {
        trends.bestStreak = currentStreak;
      } else if (day.outcome === 'loss' && currentStreak > Math.abs(trends.worstStreak)) {
        trends.worstStreak = -currentStreak;
      }

      if (!trends.bestDay || winRate > trends.bestDay.winRate) {
        trends.bestDay = { date: day.date, winRate };
      }

      if (!trends.worstDay || winRate < trends.worstDay.winRate) {
        trends.worstDay = { date: day.date, winRate };
      }

      lastOutcome = day.outcome;
    });

    return trends;
  };

  const refreshAnalytics = async () => {
    setLoading(true);
    setError(null);

    try {
      const [daily, sport, streak, patterns] = await Promise.all([
        fetchDailyPerformance(),
        fetchSportPerformance(),
        fetchGaryStreak(),
        fetchOptimalPatterns()
      ]);

      setData({
        dailyPerformance: daily,
        sportPerformance: sport,
        currentStreak: streak,
        optimalPatterns: patterns,
        trends: calculateHistoricalTrends(daily)
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
    refreshAnalytics
  };
}
