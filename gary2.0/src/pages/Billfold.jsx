import { useEffect, useState } from "react";
import '../styles/BillfoldStyle.css';
import BillfoldKPI from '../components/BillfoldKPI.jsx';
import BillfoldCharts from '../components/BillfoldCharts.jsx';
import BillfoldPicksTable from '../components/BillfoldPicksTable.jsx';
import { garyPerformanceService } from '../services/garyPerformanceService.js';
import { FaChartPie, FaHistory } from 'react-icons/fa';

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
            const formattedLogs = response.data.map(result => {
              // Parse matchup to get home and away teams
              let homeTeam = '', awayTeam = '';
              if (result.matchup) {
                const matchupParts = result.matchup.split(' @ ');
                if (matchupParts.length === 2) {
                  awayTeam = matchupParts[0];
                  homeTeam = matchupParts[1];
                }
              }
              
              return {
                id: result.pick_id,
                date: result.game_date, // Using the game_date field from Supabase,
                sport: result.league,
                bet: "Gary's Pick",
                pick: result.pick_text || "Gary's Pick", // Use the original pick text
                matchup: result.matchup || '', // Use the matchup field
                home: homeTeam,
                away: awayTeam,
                type: 'moneyline',
                result: result.result,
                amount: 100, // Example bet amount
                odds: -110, // Example odds
                payout: result.result === 'won' ? 190 : 0, // Example payout
                score: result.final_score,
                status: result.result, // Using result as status
                won: result.result === 'won'
              };
            });
            
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
    <div className="relative min-h-screen w-full overflow-x-hidden overflow-y-visible bg-[#0F172A]">
      {/* Background effects */}
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
        <div className="absolute inset-0 bg-gradient-to-b from-[#1E293B]/30 via-transparent to-transparent" />
        <div className="absolute top-0 left-0 w-full h-1/3 bg-gradient-to-br from-[#3B82F6]/5 via-transparent to-transparent" />
        <div className="absolute bottom-24 left-0 w-full h-24 bg-gradient-to-t from-[#1E293B]/15 via-transparent to-transparent blur-2xl opacity-60" />
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-[#FACC15]/5 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-[600px] h-[600px] rounded-full bg-[#FACC15]/5 blur-3xl" />
        <div className="absolute inset-0 bg-[url('/noise.svg')] opacity-15 mix-blend-soft-light" />
        <div className="absolute inset-0 bg-gradient-radial from-transparent via-[#0F172A]/90 to-[#0F172A] opacity-95" />
      </div>
      
      <div className="pt-24 pb-12 px-4 md:px-8 max-w-7xl mx-auto min-h-screen text-[#F9FAFB] space-y-12">
        {/* Header with premium golden accents */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            THE <span className="text-[#FACC15] drop-shadow-[0_0_8px_rgba(250,204,21,0.3)]">BILLFOLD</span>
          </h1>
          <p className="text-[#94A3B8] max-w-2xl mx-auto text-lg font-light tracking-wide">
            Track Gary's picks and performance metrics in real-time
          </p>
          <div className="w-32 h-1 bg-[#FACC15] mx-auto my-3 relative opacity-80 glow-sm">
            <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-[#FACC15]"></div>
            <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-[#FACC15]"></div>
            <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-[#FACC15]"></div>
            <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-[#FACC15]"></div>
          </div>
        </div>
        
        {/* KPI Cards */}
        <div>
          <BillfoldKPI stats={stats} />
        </div>
        
        {/* Section Divider */}
        <div className="flex items-center">
          <div className="flex-grow h-px bg-[#334155]"></div>
          <div className="mx-4 flex items-center bg-[#1E293B] px-4 py-2 rounded-full shadow-md">
            <FaChartPie className="text-[#FACC15] mr-2" />
            <span className="text-lg font-bold uppercase tracking-wider text-white">Performance Metrics</span>
          </div>
          <div className="flex-grow h-px bg-[#334155]"></div>
        </div>
        
        {/* Charts - With elegant glassmorphism container */}
        <div className="p-6 md:p-8 rounded-xl bg-[#1E293B]/80 border border-[#334155] backdrop-blur-sm shadow-xl">
          <BillfoldCharts 
            sportPerformance={stats.sportPerformance}
            betTypePerformance={stats.betTypePerformance}
          />
        </div>
        
        {/* Section Divider */}
        <div className="flex items-center">
          <div className="flex-grow h-px bg-[#334155]"></div>
          <div className="mx-4 flex items-center bg-[#1E293B] px-4 py-2 rounded-full shadow-md">
            <FaHistory className="text-[#FACC15] mr-2" />
            <span className="text-lg font-bold uppercase tracking-wider text-white">Pick History</span>
          </div>
          <div className="flex-grow h-px bg-[#334155]"></div>
        </div>
        
        {/* Filters and Betting Log Table */}
        <div className="p-6 md:p-8 rounded-xl bg-[#1E293B]/80 border border-[#334155] backdrop-blur-sm shadow-xl">
          <div className="mb-6 flex flex-wrap gap-3">
            <button 
              className={`px-5 py-2.5 rounded-lg transition-all duration-300 font-medium text-sm ${activeBettingFilter === 'all' ? 'bg-[#FACC15] text-[#0F172A] font-semibold shadow-md shadow-[#FACC15]/20' : 'bg-[#334155] text-gray-300 hover:bg-[#475569]'}`}
              onClick={() => setActiveBettingFilter('all')}
            >
              All Picks
            </button>
            <button 
              className={`px-5 py-2.5 rounded-lg transition-all duration-300 font-medium text-sm ${activeBettingFilter === 'won' ? 'bg-green-500 text-white font-semibold shadow-md shadow-green-500/20' : 'bg-[#334155] text-gray-300 hover:bg-[#475569]'}`}
              onClick={() => setActiveBettingFilter('won')}
            >
              Wins
            </button>
            <button 
              className={`px-5 py-2.5 rounded-lg transition-all duration-300 font-medium text-sm ${activeBettingFilter === 'lost' ? 'bg-red-500 text-white font-semibold shadow-md shadow-red-500/20' : 'bg-[#334155] text-gray-300 hover:bg-[#475569]'}`}
              onClick={() => setActiveBettingFilter('lost')}
            >
              Losses
            </button>
          </div>
          
          <BillfoldPicksTable 
            bettingLog={filteredBettingLog}
            title="Gary's Picks"
          />
        </div>
      </div>
    </div>
  );
}
