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

  // Extract bet types from betting log for performance charts
  const extractBetTypeData = () => {
    if (!bettingLog || bettingLog.length === 0) return [];
    
    // Count wins and losses for each bet type
    const betTypeCounts = {};
    
    bettingLog.forEach(bet => {
      const betType = bet.type || 'Unknown';
      if (!betTypeCounts[betType]) {
        betTypeCounts[betType] = { wins: 0, losses: 0 };
      }
      
      if (bet.result === 'won' || bet.won) {
        betTypeCounts[betType].wins += 1;
      } else if (bet.result === 'lost' || !bet.won) {
        betTypeCounts[betType].losses += 1;
      }
    });
    
    // Convert to array format for charts
    return Object.keys(betTypeCounts).map(betType => ({
      betType,
      wins: betTypeCounts[betType].wins,
      losses: betTypeCounts[betType].losses
    }));
  };

  // Derived variables for easy display - NO MOCK DATA
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
    betTypePerformance: extractBetTypeData()
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
    <div className="bg-[#FFFDF8] min-h-screen font-sans pt-16" 
         style={{ backgroundImage: 'url(/noise.svg)', backgroundSize: '200px', backgroundOpacity: 0.5 }}>
      {/* Sticky Header with Key Metrics */}
      <div className="sticky top-16 z-10 bg-white border-b border-[#d4af37]/20 shadow-md hover:shadow-lg transition-all duration-300">
        <div className="max-w-screen-2xl mx-auto px-4 py-3">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div className="flex items-center">
              <h2 className="text-gray-800 text-lg font-bold">Billfold</h2>
            </div>
            <div className="flex items-center space-x-6">
              <BillfoldKPI icon="dollar" metric="Bankroll" value={`$${stats.bankroll || 10000}`} textColor="text-gray-800" />
              <BillfoldKPI icon="scale" metric="Record" value={stats.record} textColor="text-gray-800" />
              <BillfoldKPI icon="trending" metric="ROI" value={`${stats.roi.toFixed(1)}%`} textColor="text-[#d4af37]" />
              <BillfoldKPI icon="check" metric="Win Rate" value={`${(stats.winLoss * 100).toFixed(1)}%`} textColor="text-gray-800" />
            </div>
          </div>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="max-w-screen-xl mx-auto px-4 py-6 pb-24 space-y-8">
        {/* Page Title with Coin Image */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/coin2.png" alt="Gary Coin" className="w-8 h-8" />
            <h2 className="text-2xl font-bold text-gray-800">Performance Dashboard</h2>
          </div>
        </div>
        
        {/* Recent Picks - At the top */}
        <div className="mb-6">
          <div className="bg-white rounded-md overflow-hidden border border-[#d4af37]/20 shadow-md hover:shadow-lg transition-all duration-300">
            <div className="px-4 py-3 border-b border-[#d4af37]/20 bg-gradient-to-r from-transparent via-[#f9f9f9] to-transparent flex justify-between items-center">
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-800 flex items-center">
                <span className="mr-2 text-[#d4af37]">📈</span>Recent Picks
              </h3>
              
              <div className="flex space-x-2">
                <button 
                  className={`px-3 py-1 text-xs rounded-md transition-all duration-200 ${activeBettingFilter === 'all' 
                    ? 'bg-white text-[#d4af37] font-medium shadow-sm border border-[#d4af37]/20' 
                    : 'text-gray-600 hover:bg-white/50 bg-gray-100'}`}
                  onClick={() => setActiveBettingFilter('all')}
                >
                  All
                </button>
                <button 
                  className={`px-3 py-1 text-xs rounded-md transition-all duration-200 ${activeBettingFilter === 'won' 
                    ? 'bg-white text-green-600 font-medium shadow-sm border border-green-300/20' 
                    : 'text-gray-600 hover:bg-white/50 bg-gray-100'}`}
                  onClick={() => setActiveBettingFilter('won')}
                >
                  Wins
                </button>
                <button 
                  className={`px-3 py-1 text-xs rounded-md transition-all duration-200 ${activeBettingFilter === 'lost' 
                    ? 'bg-white text-red-600 font-medium shadow-sm border border-red-300/20' 
                    : 'text-gray-600 hover:bg-white/50 bg-gray-100'}`}
                  onClick={() => setActiveBettingFilter('lost')}
                >
                  Losses
                </button>
              </div>
            </div>
            
            <BillfoldPicksTable 
              bettingLog={filteredBettingLog}
              title=""
            />
          </div>
        </div>
        
        {/* Two-column layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column: Sport Breakdown + Highlights */}
          <div className="space-y-4">
            {/* Sport Breakdown with horizontal bars */}
            <div className="bg-white rounded-md overflow-hidden border border-[#d4af37]/20 shadow-md hover:shadow-lg transition-all duration-300">
              <div className="px-4 py-3 border-b border-[#d4af37]/20 bg-gradient-to-r from-transparent via-[#f9f9f9] to-transparent">
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-800 flex items-center">
                  <span className="mr-2 text-[#d4af37]">📊</span>Sport Breakdown
                </h3>
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
              <div className="bg-white rounded-md overflow-hidden border border-[#d4af37]/20 shadow-md hover:shadow-lg transition-all duration-300">
                <div className="px-4 py-3 border-b border-[#d4af37]/20 bg-gradient-to-r from-transparent via-[#f9f9f9] to-transparent flex items-center">
                  <FaTrophy className="text-[#d4af37] mr-2" size={14} />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-gray-800">Top Win</h3>
                </div>
                
                <div className="p-4">
                  {bestWin ? (
                    <div className="space-y-2">
                      <div className="flex items-center text-sm text-[#d4af37] font-medium">
                        <span className="mr-2 text-lg">
                          {bestWin.sport === 'NBA' && '🏀'}
                          {bestWin.sport === 'NFL' && '🏈'}
                          {bestWin.sport === 'MLB' && '⚾'}
                          {bestWin.sport === 'NHL' && '🏒'}
                        </span>
                        <span>{bestWin.matchup}</span>
                      </div>
                      <div className="flex items-center">
                        <img src="/coin2.png" alt="Gary Coin" className="h-4 w-4 mr-2 opacity-70" />
                        <p className="text-base font-medium text-gray-700">{bestWin.pick}</p>
                      </div>
                      <p className="text-sm text-green-600 font-medium flex items-center">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100 mr-2">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </span>
                        {bestWin.score || 'Win'}
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-24">
                      <div className="text-center">
                        <img src="/coin2.png" alt="Gary Coin" className="h-10 w-10 mx-auto mb-2 opacity-30" />
                        <p className="text-sm text-gray-500">No win data available yet</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Gary's Mood */}
              <div className="bg-white rounded-md overflow-hidden border border-[#d4af37]/20 shadow-md hover:shadow-lg transition-all duration-300">
                <div className="px-4 py-3 border-b border-[#d4af37]/20 bg-gradient-to-r from-transparent via-[#f9f9f9] to-transparent">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-gray-800 flex items-center">
                    <span className="text-[#d4af37] mr-2">🐻</span>
                    Gary's Mood
                  </h3>
                </div>
                
                <div 
                  className={`p-4 flex items-center justify-center ${getGaryMood().split(' ')[0] === '🔥' ? 'bg-gradient-to-br from-[#fffcf0] to-[#fff6e0]' : 
                    getGaryMood().split(' ')[0] === '😎' ? 'bg-gradient-to-br from-[#f0f9ff] to-[#e0f2fe]' :
                    getGaryMood().split(' ')[0] === '🙂' ? 'bg-gradient-to-br from-[#f9fafb] to-[#f3f4f6]' :
                    getGaryMood().split(' ')[0] === '😐' ? 'bg-gradient-to-br from-[#f9fafb] to-[#e5e7eb]' :
                    'bg-gradient-to-br from-[#fef2f2] to-[#fee2e2]'}`}>
                  <div className="text-center">
                    <div className="relative">
                      <p className="text-3xl mb-2">{getGaryMood().split(' ')[0]}</p>
                      <img src="/coin2.png" alt="Gary Coin" className="h-6 w-6 absolute -top-1 -right-3 opacity-70" />
                    </div>
                    <p className="text-sm text-gray-800 font-bold mb-1">{getGaryMood().split(' ')[1]}</p>
                    <p className="text-xs text-gray-600 italic">
                      {getGaryMood().split(' ')[0] === '🔥' ? "We're crushing it!" : 
                        getGaryMood().split(' ')[0] === '😎' ? "Solid picks coming in hot!" :
                        getGaryMood().split(' ')[0] === '🙂' ? "Steady does it, we'll get there" :
                        getGaryMood().split(' ')[0] === '😐' ? "Gotta trust the system" :
                        "We're due for a comeback"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Right Column: Highlights + Gary's Mood */}
          <div className="space-y-4">
            {/* Gary's Mood */}
            <div className="bg-white rounded-md overflow-hidden border border-[#d4af37]/20 shadow-md hover:shadow-lg transition-all duration-300 relative">
              <div className="px-4 py-3 border-b border-[#d4af37]/20 bg-gradient-to-r from-transparent via-[#f9f9f9] to-transparent">
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-800 flex items-center">
                  <span className="mr-2 text-[#d4af37]">🤯</span>Gary's Mood
                </h3>
              </div>
              <div className="p-6 bg-gradient-to-br from-[#fcf9f0] to-[#fff8e0] relative">
                <div className="absolute top-2 right-2 opacity-10">
                  <img src="/coin2.png" alt="Gary Coin" className="w-24 h-24" />
                </div>
                <div className="flex flex-col items-center gap-3 text-center">
                  <span className="text-4xl">😎</span>
                  <p className="font-serif text-lg italic text-gray-800">"Remember, you can only lose if you quit gamblin', kid."</p>
                  <p className="text-xs text-gray-500">- Gary, The Gambling Guru</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Performance Charts - Full Width */}
        <div className="mt-6">
          <div className="bg-white rounded-md overflow-hidden border border-[#d4af37]/20 shadow-md hover:shadow-lg transition-all duration-300">
            <div className="px-4 py-3 border-b border-[#d4af37]/20 bg-gradient-to-r from-transparent via-[#f9f9f9] to-transparent flex justify-between items-center">
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-800 flex items-center">
                <span className="mr-2 text-[#d4af37]">📈</span>Performance Charts
              </h3>
              
              <div className="flex space-x-2">
                <button 
                  className={`px-3 py-1 text-xs rounded-md transition-all duration-200 ${activeTimeframe === 'all' 
                    ? 'bg-white text-[#d4af37] font-medium shadow-sm border border-[#d4af37]/20' 
                    : 'text-gray-600 hover:bg-white/50 bg-gray-100'}`}
                  onClick={() => setActiveTimeframe('all')}
                >
                  All Time
                </button>
                <button 
                  className={`px-3 py-1 text-xs rounded-md transition-all duration-200 ${activeTimeframe === 'month' 
                    ? 'bg-white text-[#d4af37] font-medium shadow-sm border border-[#d4af37]/20' 
                    : 'text-gray-600 hover:bg-white/50 bg-gray-100'}`}
                  onClick={() => setActiveTimeframe('month')}
                >
                  Month
                </button>
                <button 
                  className={`px-3 py-1 text-xs rounded-md transition-all duration-200 ${activeTimeframe === 'week' 
                    ? 'bg-white text-[#d4af37] font-medium shadow-sm border border-[#d4af37]/20' 
                    : 'text-gray-600 hover:bg-white/50 bg-gray-100'}`}
                  onClick={() => setActiveTimeframe('week')}
                >
                  Week
                </button>
              </div>
            </div>
            
            <div className="p-4">
              <BillfoldCharts 
                sportPerformance={stats.sportPerformance}
                betTypePerformance={stats.betTypePerformance}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
