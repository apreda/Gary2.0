import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import '../styles/BillfoldStyle.css';
import BillfoldKPI from '../components/BillfoldKPI.jsx';
import BillfoldCharts from '../components/BillfoldCharts.jsx';
import BillfoldPicksTable from '../components/BillfoldPicksTable.jsx';

export function Billfold() {
  const [bankrollStats, setBankrollStats] = useState({
    currentBankroll: 10000,
    startingBankroll: 10000,
    monthlyGoal: 30,
    currentRoi: 0,
    totalBets: 0,
    winRate: 0,
    averageBet: 0,
  });

  const [sportsBreakdown, setSportsBreakdown] = useState([]);
  const [bettingLog, setBettingLog] = useState([]);
  const [activeBettingFilter, setActiveBettingFilter] = useState('all');

  useEffect(() => {
    const fetchBankrollData = async () => {
      try {
        const { data, error } = await supabase
          .from('wagers')
          .select('current_bankroll, starting_bankroll, monthly_goal_percentage')
          .order('id', { ascending: false })
          .limit(1)
          .single();

        if (error) throw error;

        const roi = data.starting_bankroll > 0 ?
          ((data.current_bankroll - data.starting_bankroll) / data.starting_bankroll) * 100 : 0;

        setBankrollStats({
          currentBankroll: Math.round(data.current_bankroll),
          startingBankroll: Math.round(data.starting_bankroll),
          monthlyGoal: data.monthly_goal_percentage,
          currentRoi: parseFloat(roi.toFixed(1)),
          totalBets: 0, // To be updated after fetching betting history
          winRate: 0, // To be updated after fetching betting history
          averageBet: 0, // To be updated after fetching betting history
        });
      } catch (error) {
        console.error('Error fetching bankroll data:', error);
      }
    };

    fetchBankrollData();
  }, []);

  useEffect(() => {
    const fetchSportsBreakdown = async () => {
      try {
        const sports = ['NBA', 'MLB', 'NFL', 'NHL'];
        const sportStats = [];

        for (const sport of sports) {
          const { data, error } = await supabase
            .from('wagers')
            .select('result')
            .eq('sport', sport);

          if (error) throw error;

          const wins = data.filter(wager => wager.result === 'won').length;
          const losses = data.filter(wager => wager.result === 'lost').length;
          const total = wins + losses;
          const winRate = total > 0 ? (wins / total) * 100 : 0;

          sportStats.push({
            name: sport,
            icon: sport === 'NBA' ? '🏀' : 
                  sport === 'MLB' ? '⚾' :
                  sport === 'NFL' ? '🏈' :
                  sport === 'NHL' ? '🏒' : '🎯',
            record: `${wins}-${losses}`,
            winRate: parseFloat(winRate.toFixed(1)),
            roi: 0 // Placeholder for ROI calculation
          });
        }

        setSportsBreakdown(sportStats);
      } catch (error) {
        console.error('Error fetching sports breakdown:', error);
      }
    };

    fetchSportsBreakdown();
  }, []);

  useEffect(() => {
    const fetchBettingHistory = async () => {
      try {
        const { data, error } = await supabase
          .from('wagers')
          .select('*')
          .order('placed_date', { ascending: false });

        if (error) throw error;

        setBettingLog(data);

        const totalBets = data.length;
        const wonBets = data.filter(bet => bet.status === 'won').length;
        const lostBets = data.filter(bet => bet.status === 'lost').length;
        const totalWagered = data.reduce((sum, bet) => sum + bet.amount, 0);
        const averageBet = totalBets > 0 ? totalWagered / totalBets : 0;
        const winRate = totalBets > 0 ? (wonBets / totalBets) * 100 : 0;
        const record = `${wonBets}-${lostBets}`;

        // Process data for sport performance chart
        const sportStats = {};
        data.forEach(bet => {
          if (!bet.sport) return;
          
          if (!sportStats[bet.sport]) {
            sportStats[bet.sport] = { wins: 0, losses: 0 };
          }
          
          if (bet.status === 'won') {
            sportStats[bet.sport].wins++;
          } else if (bet.status === 'lost') {
            sportStats[bet.sport].losses++;
          }
        });

        // Convert to array format for chart
        const sportPerformance = Object.keys(sportStats).map(sport => ({
          sport,
          wins: sportStats[sport].wins,
          losses: sportStats[sport].losses,
          total: sportStats[sport].wins + sportStats[sport].losses
        }));

        // Sort by total number of bets descending
        sportPerformance.sort((a, b) => b.total - a.total);

        // Process data for bet type performance chart
        const betTypeStats = {};
        data.forEach(bet => {
          if (!bet.bet_type) return;
          
          const betType = bet.bet_type.charAt(0).toUpperCase() + bet.bet_type.slice(1);
          
          if (!betTypeStats[betType]) {
            betTypeStats[betType] = { wins: 0, losses: 0 };
          }
          
          if (bet.status === 'won') {
            betTypeStats[betType].wins++;
          } else if (bet.status === 'lost') {
            betTypeStats[betType].losses++;
          }
        });

        // Convert to array format for chart
        const betTypePerformance = Object.keys(betTypeStats).map(betType => ({
          betType,
          wins: betTypeStats[betType].wins,
          losses: betTypeStats[betType].losses,
          total: betTypeStats[betType].wins + betTypeStats[betType].losses
        }));

        // Sort by total number of bets descending
        betTypePerformance.sort((a, b) => b.total - a.total);

        setBankrollStats(prevStats => ({
          ...prevStats,
          totalBets,
          winRate: parseFloat(winRate.toFixed(1)),
          averageBet: Math.round(averageBet),
          record,
          sportPerformance,
          betTypePerformance
        }));
      } catch (error) {
        console.error('Error fetching betting history:', error);
      }
    };

    fetchBettingHistory();
  }, []);

  const filteredBettingLog = bettingLog.filter(bet =>
    activeBettingFilter === 'all' ? true : bet.status === activeBettingFilter
  );

  // Using real data from Supabase queries
  const stats = {
    bankroll: bankrollStats.currentBankroll,
    roi: bankrollStats.currentRoi,
    record: bankrollStats.record || '0-0', // Real win-loss record from wagers
    winLoss: `${bankrollStats.winRate}%`,
    equityHistory: [
      { date: '2025-04-01', value: 10000 },
      { date: '2025-04-07', value: 11200 },
      { date: '2025-04-14', value: 10800 },
      { date: '2025-04-21', value: 12500 },
    ],
    // Using real processed data for sports performance
    sportPerformance: bankrollStats.sportPerformance || [],
    // Using real processed data for bet type performance
    betTypePerformance: bankrollStats.betTypePerformance || [],
    confidenceBuckets: [
      { range: 0.9, count: 12 },
      { range: 0.8, count: 18 },
      { range: 0.7, count: 8 },
      { range: 0.6, count: 6 },
    ],
    sportBreakdown: [
      { sport: 'NBA', count: 14, color: '#2563EB' },
      { sport: 'MLB', count: 10, color: '#10B981' },
      { sport: 'NHL', count: 8, color: '#F59E42' },
      { sport: 'NFL', count: 6, color: '#EF4444' },
    ],
    recentPicks: bettingLog.slice(0, 10).map(bet => ({
      date: bet.placed_date ? new Date(bet.placed_date).toLocaleDateString() : '',
      away: bet.picks?.away || '',
      home: bet.picks?.home || '',
      pick: bet.picks?.pick || '',
      confidence: bet.confidence || 0.7,
      won: bet.status === 'won',
    })),
  };

  return (
    <div className="pt-24 pb-12 px-0 max-w-full mx-auto min-h-screen text-white grid grid-cols-12 gap-4 bg-gradient-to-br from-[#10141b] via-[#1e2330] to-[#21243b]">
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-[#10141b] via-[#1e2330] to-[#21243b] opacity-90"></div>
      {/* KPI Cards */}
      <div className="col-span-12 mb-2">
        <BillfoldKPI stats={stats} />
      </div>
      <div className="col-span-12 my-2 border-t border-gray-800"></div>
      {/* Charts - Full width with no padding */}
      <div className="col-span-12 mb-6 w-full px-0">
        <BillfoldCharts 
          equityHistory={stats.equityHistory} 
          sportPerformance={stats.sportPerformance}
          betTypePerformance={stats.betTypePerformance}
        />
      </div>
      <div className="col-span-12 my-2 border-t border-gray-800"></div>
      {/* Betting History Table */}
      <div className="col-span-12">
        <BillfoldPicksTable picks={stats.recentPicks} />
      </div>
    </div>
  );
}
