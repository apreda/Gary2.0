import { useEffect, useState } from "react";
import '../styles/BillfoldStyle.css';
import BillfoldKPI from '../components/BillfoldKPI.jsx';
import BillfoldCharts from '../components/BillfoldCharts.jsx';
import BillfoldPicksTable from '../components/BillfoldPicksTable.jsx';
import { garyPerformanceService } from '../services/garyPerformanceService.js';

export function Billfold() {
  // Stats for the KPI component
  const [bankrollStats, setBankrollStats] = useState({
    currentBankroll: 10000,
    startingBankroll: 10000,
    monthlyGoal: 30,
    currentRoi: 0,
    totalBets: 0,
    winRate: 0,
    averageBet: 0,
    record: '0-0',
    sportPerformance: [],
    betTypePerformance: []
  });
  
  // Gary's performance tracking - this is the only data we need
  const [garyPerformance, setGaryPerformance] = useState({
    summary: { wins: 0, losses: 0, pushes: 0, winRate: 0, total: 0, record: '0-0' },
    sportBreakdown: []
  });
  
  // For displaying data in UI components
  const [sportsBreakdown, setSportsBreakdown] = useState([]);
  const [bettingLog, setBettingLog] = useState([]);
  const [activeBettingFilter, setActiveBettingFilter] = useState('all');

  useEffect(() => {
    const fetchGaryPerformance = async () => {
      try {
        // First track any new results
        await garyPerformanceService.trackPickResults();
        
        // Then fetch the updated performance data
        const response = await garyPerformanceService.getGaryPerformance();
        
        if (response.success) {
          // Update Gary's performance stats
          setGaryPerformance({
            summary: response.summary,
            sportBreakdown: response.sportBreakdown
          });
          
          // Set bankroll stats with Gary's performance data
          setBankrollStats({
            currentBankroll: 10000, // Example starting value
            startingBankroll: 10000, // Example starting value
            monthlyGoal: 30, // Example monthly goal
            currentRoi: 15.5, // Example ROI
            totalBets: response.summary.total || 0,
            winRate: response.summary.winRate || 0,
            averageBet: 100, // Example average bet
            record: response.summary.record || '0-0',
            sportPerformance: response.sportBreakdown.map(sport => ({
              sport: sport.name,
              wins: sport.wins,
              losses: sport.losses,
              total: sport.total
            })) || [],
            betTypePerformance: []
          });
          
          // Use Gary's sport breakdown for the charts
          setSportsBreakdown(response.sportBreakdown);
          
          // Set betting log from Gary's recent picks
          if (response.data && response.data.length > 0) {
            const formattedLogs = response.data.map(result => ({
              id: result.pick_id,
              date: result.game_date,
              sport: result.league,
              bet: "Gary's Pick",
              type: 'moneyline',
              result: result.result,
              amount: 100, // Example bet amount
              odds: -110, // Example odds
              payout: result.result === 'won' ? 190 : 0, // Example payout
              score: result.final_score,
              status: result.result // Using result as status
            }));
            
            setBettingLog(formattedLogs);
          }
        }
      } catch (error) {
        console.error('Error fetching Gary performance data:', error);
      }
    };

    // Only fetch Gary's performance data
    fetchGaryPerformance();
  }, []);

  const filteredBettingLog = bettingLog.filter(bet =>
    activeBettingFilter === 'all' ? true : bet.status === activeBettingFilter
  );

  // Prepare stats for UI components
  const stats = {
    bankroll: bankrollStats.currentBankroll,
    roi: bankrollStats.currentRoi,
    record: garyPerformance.summary.record || '0-0',
    winLoss: `${garyPerformance.summary.winRate || 0}%`,
    equityHistory: [
      { date: '2025-04-01', value: 10000 },
      { date: '2025-04-07', value: 11200 },
      { date: '2025-04-14', value: 10800 },
      { date: '2025-04-21', value: 12500 },
    ],
    // Using Gary's performance data for sports performance
    sportPerformance: sportsBreakdown.map(sport => ({
      sport: sport.name,
      wins: sport.wins,
      losses: sport.losses,
      total: sport.total
    })),
    // Example data for bet type performance
    betTypePerformance: [
      { betType: 'Moneyline', wins: garyPerformance.summary.wins || 0, losses: garyPerformance.summary.losses || 0 }
    ],
    confidenceBuckets: [
      { range: 0.9, count: 12 },
      { range: 0.8, count: 18 },
      { range: 0.7, count: 8 },
      { range: 0.6, count: 6 },
    ],
    sportBreakdown: sportsBreakdown.map((sport, index) => {
      const colors = ['#2563EB', '#10B981', '#F59E42', '#EF4444'];
      return {
        sport: sport.name,
        count: sport.total,
        color: colors[index % colors.length]
      };
    }),
    recentPicks: filteredBettingLog.slice(0, 10).map(bet => ({
      date: bet.date ? new Date(bet.date).toLocaleDateString() : '',
      away: bet.away || '',
      home: bet.home || '',
      pick: bet.bet || '',
      confidence: bet.confidence || 0.7,
      won: bet.result === 'won',
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
          sportPerformance={stats.sportPerformance}
          betTypePerformance={stats.betTypePerformance}
        />
      </div>
      
      {/* Filters and Betting Log Table */}
      <div className="col-span-12 mb-6">
        <div className="mb-4 flex space-x-2">
          <button 
            className={`px-4 py-2 rounded-md ${activeBettingFilter === 'all' ? 'bg-blue-600' : 'bg-gray-700'}`}
            onClick={() => setActiveBettingFilter('all')}
          >
            All
          </button>
          <button 
            className={`px-4 py-2 rounded-md ${activeBettingFilter === 'won' ? 'bg-green-600' : 'bg-gray-700'}`}
            onClick={() => setActiveBettingFilter('won')}
          >
            Wins
          </button>
          <button 
            className={`px-4 py-2 rounded-md ${activeBettingFilter === 'lost' ? 'bg-red-600' : 'bg-gray-700'}`}
            onClick={() => setActiveBettingFilter('lost')}
          >
            Losses
          </button>
        </div>
        
        <BillfoldPicksTable 
          bettingLog={filteredBettingLog}
          title="Gary's Pick History"
        />
      </div>
    </div>
  );
}
