import { useEffect, useState } from "react";
import '../styles/BillfoldStyle.css';
import BillfoldKPI from '../components/BillfoldKPI.jsx';
import BillfoldCharts from '../components/BillfoldCharts.jsx';
import BillfoldPicksTable from '../components/BillfoldPicksTable.jsx';
import { garyPerformanceService } from '../services/garyPerformanceService.js';
import { FaChartPie, FaHistory, FaTrophy, FaHeartBroken } from 'react-icons/fa';

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
  
  // Gary's performance tracking
  const [garyPerformance, setGaryPerformance] = useState({
    summary: { wins: 0, losses: 0, pushes: 0, winRate: 0, total: 0, record: '0-0' },
    sportBreakdown: []
  });
  
  // For displaying data in UI components
  const [sportsBreakdown, setSportsBreakdown] = useState([]);
  const [bettingLog, setBettingLog] = useState([]);
  const [activeBettingFilter, setActiveBettingFilter] = useState('all');
  const [activeTimeframe, setActiveTimeframe] = useState('all'); // For chart timeframes

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
                date: result.game_date,
                sport: result.league,
                bet: "Gary's Pick",
                pick: result.pick_text || "Gary's Pick",
                matchup: result.matchup || '',
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
        console.error('Error fetching Gary performance:', error);
      }
    };
    
    fetchGaryPerformance();
  }, []);

  const filteredBettingLog = activeBettingFilter === 'all' 
    ? bettingLog 
    : bettingLog.filter(bet => bet.result === activeBettingFilter);

  // Derived variables for easy display
  const stats = {
    bankroll: bankrollStats.currentBankroll,
    roi: (bankrollStats.currentBankroll - bankrollStats.startingBankroll) / bankrollStats.startingBankroll * 100,
    record: garyPerformance.summary?.record || '0-0',
    winLoss: garyPerformance.summary?.winRate || 0,
    totalBets: garyPerformance.summary?.total || 0,
    sportPerformance: sportsBreakdown.map(sport => ({
      sport: sport.name,
      wins: sport.wins,
      losses: sport.losses
    })),
    betTypePerformance: [
      { betType: 'Spread', wins: 30, losses: 15 },
      { betType: 'Moneyline', wins: 25, losses: 10 },
      { betType: 'Over/Under', wins: 20, losses: 18 },
      { betType: 'Prop', wins: 15, losses: 12 },
    ]
  };
  
  // Find the best win and worst loss for highlights
  const bestWin = bettingLog.find(bet => bet.result === 'won') || null;
  const worstLoss = bettingLog.find(bet => bet.result === 'lost') || null;

  // Generate Gary's mood based on recent performance
  const getGaryMood = () => {
    const recentWins = bettingLog.slice(0, 5).filter(bet => bet.result === 'won').length;
    if (recentWins >= 4) return '🔥 On Fire';
    if (recentWins >= 3) return '😎 Confident';
    if (recentWins >= 2) return '🙂 Steady';
    if (recentWins >= 1) return '😐 Cautious';
    return '😤 Determined';
  };

  return (
    <div className="bg-white min-h-screen font-sans pt-16">
      {/* Sticky Header with Key Metrics */}
      <div className="sticky top-16 z-10 bg-white border-b border-[#d4af37] shadow-sm">
        <div className="max-w-screen-2xl mx-auto px-4 py-3">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div className="flex items-center">
              <h1 className="text-lg text-gray-900 font-bold">Billfold</h1>
              <span className="text-xs text-gray-500 ml-2">Last updated: {new Date().toLocaleTimeString()}</span>
            </div>
            
            {/* Key Stats Ticker */}
            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
              {/* Bankroll */}
              <div className="flex items-center">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#f8f8f8] mr-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 1v22M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6" stroke="#d4af37" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
                <div>
                  <p className="text-xs text-gray-500 leading-none">Bankroll</p>
                  <p className="text-sm font-bold">${stats.bankroll?.toLocaleString() || '10,000'}</p>
                </div>
              </div>
              
              {/* Record */}
              <div className="flex items-center">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#f8f8f8] mr-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" stroke="#333" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M15 2H9a1 1 0 00-1 1v2a1 1 0 001 1h6a1 1 0 001-1V3a1 1 0 00-1-1z" stroke="#333" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
                <div>
                  <p className="text-xs text-gray-500 leading-none">Record</p>
                  <p className="text-sm font-bold">{stats.record || '0-0'}</p>
                </div>
              </div>
              
              {/* ROI */}
              <div className="flex items-center">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#f8f8f8] mr-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 8c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zM3 12h1m8-9v1m8 8h1m-9 8v1M5.6 5.6l.7.7m12.1-.7l-.7.7m0 11.4l.7.7m-12.1-.7l-.7.7" stroke="#d4af37" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
                <div>
                  <p className="text-xs text-gray-500 leading-none">ROI</p>
                  <p className="text-sm font-bold text-[#d4af37]">{stats.roi?.toFixed(1) || 0}%</p>
                </div>
              </div>
              
              {/* Win Rate */}
              <div className="flex items-center">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#f8f8f8] mr-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20 6L9 17l-5-5" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
                <div>
                  <p className="text-xs text-gray-500 leading-none">Win Rate</p>
                  <p className="text-sm font-bold">{stats.winLoss || '0'}%</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="max-w-screen-2xl mx-auto px-4 py-4">
        {/* Two-column layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left Column: Performance Overview + Sport Breakdown */}
          <div className="space-y-4">
            {/* Sport Breakdown with horizontal bars */}
            <div className="bg-white rounded-md overflow-hidden border border-gray-200 shadow-sm">
              <div className="px-3 py-2 border-b border-gray-200">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#d4af37]">Sport Breakdown</h3>
              </div>
              
              <div className="p-3 space-y-3">
                {sportsBreakdown && sportsBreakdown.length > 0 ? (
                  <div className="space-y-3">
                    {sportsBreakdown.map((sport, i) => (
                      <div key={sport.name || i} className="space-y-1">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center">
                            {sport.name === 'NBA' && <span className="mr-1.5">🏀</span>}
                            {sport.name === 'NFL' && <span className="mr-1.5">🏈</span>}
                            {sport.name === 'MLB' && <span className="mr-1.5">⚾</span>}
                            {sport.name === 'NHL' && <span className="mr-1.5">🏒</span>}
                            <span className="text-xs text-[#d4af37] font-medium">{sport.name}</span>
                          </div>
                          <div className="flex items-center space-x-2 text-xs">
                            <span className="text-green-600 font-medium">{sport.wins || 0}W</span>
                            <span className="text-gray-500">-</span>
                            <span className="text-red-600 font-medium">{sport.losses || 0}L</span>
                          </div>
                        </div>
                        
                        {/* Horizontal bar chart */}
                        <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          {(sport.wins + sport.losses) > 0 && (
                            <div 
                              className="h-full bg-[#d4af37] rounded-full" 
                              style={{ width: `${sport.wins / (sport.wins + sport.losses) * 100}%` }}
                            ></div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-[#d4af37] text-center py-2">No sport data available</div>
                )}
              </div>
            </div>
            
            {/* Highlight Boxes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Best Win */}
              <div className="bg-white rounded-md overflow-hidden border border-gray-200 shadow-sm">
                <div className="px-3 py-2 border-b border-gray-200 flex items-center">
                  <FaTrophy className="text-[#d4af37] mr-1.5" size={12} />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#d4af37]">Top Win</h3>
                </div>
                
                <div className="p-3">
                  {bestWin ? (
                    <div className="space-y-1">
                      <div className="flex items-center text-xs text-[#d4af37]">
                        <span className="mr-1.5">
                          {bestWin.sport === 'NBA' && '🏀'}
                          {bestWin.sport === 'NFL' && '🏈'}
                          {bestWin.sport === 'MLB' && '⚾'}
                          {bestWin.sport === 'NHL' && '🏒'}
                        </span>
                        <span>{bestWin.matchup}</span>
                      </div>
                      <p className="text-sm font-medium text-gray-700">{bestWin.pick}</p>
                      <p className="text-xs text-green-600">Result: {bestWin.score || 'Win'}</p>
                    </div>
                  ) : (
                    <div className="text-xs text-[#d4af37] text-center py-2">No win data available</div>
                  )}
                </div>
              </div>
              
              {/* Gary's Mood */}
              <div className="bg-white rounded-md overflow-hidden border border-gray-200 shadow-sm">
                <div className="px-3 py-2 border-b border-gray-200">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#d4af37]">Gary's Mood</h3>
                </div>
                
                <div className="p-3 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-2xl mb-1">{getGaryMood().split(' ')[0]}</p>
                    <p className="text-xs text-[#d4af37] font-medium">{getGaryMood().split(' ')[1]}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Right Column: Performance Charts + Recent Picks */}
          <div className="space-y-4">
            {/* Performance Charts */}
            <div className="bg-white rounded-md overflow-hidden border border-gray-200 shadow-sm">
              <div className="px-3 py-2 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#d4af37]">Performance Charts</h3>
                
                <div className="flex space-x-1.5">
                  <button 
                    className={`px-2 py-0.5 text-[10px] rounded transition-all ${activeTimeframe === 'all' ? 'bg-[#d4af37] text-white font-medium' : 'bg-gray-200 text-gray-700 font-medium'}`}
                    onClick={() => setActiveTimeframe('all')}
                  >
                    All Time
                  </button>
                  <button 
                    className={`px-2 py-0.5 text-[10px] rounded transition-all ${activeTimeframe === 'month' ? 'bg-[#d4af37] text-white font-medium' : 'bg-gray-200 text-gray-700 font-medium'}`}
                    onClick={() => setActiveTimeframe('month')}
                  >
                    Month
                  </button>
                  <button 
                    className={`px-2 py-0.5 text-[10px] rounded transition-all ${activeTimeframe === 'week' ? 'bg-[#d4af37] text-white font-medium' : 'bg-gray-200 text-gray-700 font-medium'}`}
                    onClick={() => setActiveTimeframe('week')}
                  >
                    Week
                  </button>
                </div>
              </div>
              
              <div className="p-2">
                <BillfoldCharts 
                  sportPerformance={stats.sportPerformance}
                  betTypePerformance={stats.betTypePerformance}
                />
              </div>
            </div>
            
            {/* Picks Table */}
            <div className="bg-white rounded-md overflow-hidden border border-gray-200 shadow-sm">
              <div className="px-3 py-2 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#d4af37]">Recent Picks</h3>
                
                <div className="flex space-x-1.5">
                  <button 
                    className={`px-2 py-0.5 text-[10px] rounded transition-all ${activeBettingFilter === 'all' ? 'bg-[#d4af37] text-white font-medium' : 'bg-gray-200 text-gray-700 font-medium'}`}
                    onClick={() => setActiveBettingFilter('all')}
                  >
                    All
                  </button>
                  <button 
                    className={`px-2 py-0.5 text-[10px] rounded transition-all ${activeBettingFilter === 'won' ? 'bg-green-600 text-white font-medium' : 'bg-gray-200 text-gray-700 font-medium'}`}
                    onClick={() => setActiveBettingFilter('won')}
                  >
                    Wins
                  </button>
                  <button 
                    className={`px-2 py-0.5 text-[10px] rounded transition-all ${activeBettingFilter === 'lost' ? 'bg-red-600 text-white font-medium' : 'bg-gray-200 text-gray-700 font-medium'}`}
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
