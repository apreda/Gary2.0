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
    <div className="min-h-screen premium-white-bg py-0 relative">
      {/* Background pattern */}
      <div className="absolute inset-0" style={{ 
        backgroundImage: `var(--grid-pattern-premium)`,
        backgroundSize: '40px 40px',
        opacity: 0.8
      }}></div>
      
      {/* Gold accent line at the very top */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#d4af37] via-[#e5c349] to-[#d4af37]"></div>
      
      <div className="relative z-10 max-w-7xl mx-auto px-4 pt-12"> {/* Added top padding to avoid nav overlap */}
        {/* Top navigation bar inspired by trading interfaces */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-gray-200">
          <div className="flex items-center">
            <h1 className="text-2xl font-bold tracking-tight text-[#0a0a0a]">
              THE <span className="text-[#d4af37]">BILLFOLD</span>
            </h1>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="text-sm text-gray-500">
              <span className="font-medium mr-2">Last Updated:</span>
              {new Date().toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric', 
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          </div>
        </div>
        
        {/* Main layout inspired by trading interfaces */}
        <div className="grid grid-cols-12 gap-4"> {/* Reduced gap */}
          {/* Left sidebar - KPI stats (like price/stats in trading) */}
          <div className="col-span-12 lg:col-span-3 space-y-4"> {/* Reduced spacing */}
            <div className="bg-[#111111] rounded-lg overflow-hidden border border-[#d4af37]/20">
              <div className="h-1 w-full bg-gradient-to-r from-[#d4af37] via-[#e5c349] to-[#d4af37]"></div>
              <div className="px-4 py-2 border-b border-[#333333]">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#d4af37]">Performance Overview</h3>
              </div>
              <div className="p-3 space-y-4"> {/* Reduced padding and spacing */}
                {/* Main stats displayed vertically like a trading sidebar */}
                <div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-xs">Current Bankroll</span>
                    <span className="text-base font-bold text-white">${stats.bankroll?.toLocaleString() || '10,000'}</span>
                  </div>
                  <div className="mt-0.5 flex items-center"> {/* Reduced margin */}
                    <span className="text-xs text-gray-500">Starting: $10,000</span>
                    <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-green-900/30 text-green-400">
                      +{((stats.bankroll || 10000) - 10000) / 100}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Sport breakdown */}
            <div className="bg-[#1a1a1a] rounded-md overflow-hidden border border-[#333333]">
              <div className="px-3 py-2 border-b border-[#333333]">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#d4af37]">Sports Breakdown</h3>
              </div>
              
              <div className="p-2 space-y-2"> 
                {sportsBreakdown && sportsBreakdown.length > 0 ? (
                  <div className="space-y-2">
                    {sportsBreakdown.map((sport, i) => (
                      <div key={sport.name || i} className="flex justify-between items-center">
                        <div className="flex items-center">
                          {sport.name === 'NBA' && <span className="mr-1.5 text-base">🏀</span>}
                          {sport.name === 'NFL' && <span className="mr-1.5 text-base">🏈</span>}
                          {sport.name === 'MLB' && <span className="mr-1.5 text-base">⚾</span>}
                          {sport.name === 'NHL' && <span className="mr-1.5 text-base">🏒</span>}
                          <span className="text-xs text-gray-300">{sport.name}</span>
                        </div>
                        <div className="text-xs">
                          <span className="text-green-400 font-medium">{sport.wins || 0}W</span>
                          <span className="mx-1 text-gray-600">-</span>
                          <span className="text-red-400 font-medium">{sport.losses || 0}L</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-gray-400 text-center py-2">No sport data available</div>
                )}
              </div>
            </div>
          </div>
          
          {/* Main content - center and right */}
          <div className="col-span-12 lg:col-span-9 space-y-3"> 
            {/* Chart area */}
            <div className="bg-[#1a1a1a] rounded-md overflow-hidden border border-[#333333]">
              <div className="px-3 py-2 border-b border-[#333333] flex justify-between items-center">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#d4af37]">Performance Charts</h3>
                
                <div className="flex space-x-1.5"> 
                  <button className="px-2 py-0.5 text-[10px] rounded bg-[#d4af37] text-[#111111] font-medium">All Time</button>
                  <button className="px-2 py-0.5 text-[10px] rounded bg-[#333333] text-white font-medium">Month</button>
                  <button className="px-2 py-0.5 text-[10px] rounded bg-[#333333] text-white font-medium">Week</button>
                </div>
              </div>
              
              <div className="p-2"> 
                <BillfoldCharts 
                  sportPerformance={stats.sportPerformance}
                  betTypePerformance={stats.betTypePerformance}
                />
              </div>
            </div>
            
            {/* Picks table */}
            <div className="bg-[#1a1a1a] rounded-md overflow-hidden border border-[#333333]">
              <div className="px-3 py-2 border-b border-[#333333] flex justify-between items-center">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#d4af37]">Gary's Picks</h3>
                
                <div className="flex space-x-1.5"> 
                  <button 
                    className={`px-2 py-0.5 text-[10px] rounded transition-all ${activeBettingFilter === 'all' ? 'bg-[#d4af37] text-[#111111] font-medium' : 'bg-[#333333] text-white font-medium'}`}
                    onClick={() => setActiveBettingFilter('all')}
                  >
                    All
                  </button>
                  <button 
                    className={`px-2 py-0.5 text-[10px] rounded transition-all ${activeBettingFilter === 'won' ? 'bg-green-600 text-white font-medium' : 'bg-[#333333] text-white font-medium'}`}
                    onClick={() => setActiveBettingFilter('won')}
                  >
                    Wins
                  </button>
                  <button 
                    className={`px-2 py-0.5 text-[10px] rounded transition-all ${activeBettingFilter === 'lost' ? 'bg-red-600 text-white font-medium' : 'bg-[#333333] text-white font-medium'}`}
                    onClick={() => setActiveBettingFilter('lost')}
                  >
                    Losses
                  </button>
                </div>
              </div>
              
              <div className="p-0">
                <BillfoldPicksTable 
                  bettingLog={filteredBettingLog}
                  title=""
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
