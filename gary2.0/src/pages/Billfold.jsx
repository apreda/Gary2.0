import React, { useState, useEffect } from 'react';
import { garyPerformanceService } from '../services/garyPerformanceService';
import { supabase } from '../supabaseClient';
import '../styles/BillfoldEnhanced.css'; // Consolidated high-tech modern styling

export const Billfold = () => {
  // State for user performance data
  const [stats, setStats] = useState({
    record: '',
    totalBets: 0,
    totalWins: 0,
    totalLosses: 0,
    pushes: 0,
    winLoss: 0,
    sportPerformance: [],
    betTypePerformance: [],
  });

  // State for betting log/history
  const [bettingLog, setBettingLog] = useState([]);

  // State for best win (for featured Top Win section)
  const [bestWin, setBestWin] = useState(null);

  // State for loading
  const [isLoading, setIsLoading] = useState(true);

  // State for error
  const [error, setError] = useState(null);

  // State for selected time period filter
  const [selectedTimeFrame, setSelectedTimeFrame] = useState('all');

  // Filter options for charts
  const timeFrameOptions = [
    { value: '7d', label: '7D' },
    { value: '30d', label: '30D' },
    { value: '90d', label: '90D' },
    { value: 'ytd', label: 'YTD' },
    { value: 'all', label: 'ALL' },
  ];

  // Handle time frame change
  const handleTimeFrameChange = (timeFrame) => {
    setSelectedTimeFrame(timeFrame);
  };

  // Fetch data directly from Supabase game_results table
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        // Fetch game results from Supabase
        let query = supabase.from('game_results').select('*');
        
        // Apply time filter if not 'all'
        if (selectedTimeFrame !== 'all') {
          let dateFilter;
          const now = new Date();
          
          switch (selectedTimeFrame) {
            case '7d':
              dateFilter = new Date(now.setDate(now.getDate() - 7));
              break;
            case '30d':
              dateFilter = new Date(now.setDate(now.getDate() - 30));
              break;
            case '90d':
              dateFilter = new Date(now.setDate(now.getDate() - 90));
              break;
            case 'ytd':
              dateFilter = new Date(now.getFullYear(), 0, 1); // Jan 1 of current year
              break;
            default:
              dateFilter = null;
          }
          
          if (dateFilter) {
            query = query.gte('game_date', dateFilter.toISOString());
          }
        }
        
        // Execute the query
        const { data: gameResults, error: gameResultsError } = await query.order('game_date', { ascending: false });
        
        if (gameResultsError) {
          throw new Error(`Error fetching game results: ${gameResultsError.message}`);
        }
        
        if (!gameResults || gameResults.length === 0) {
          setError('No game results found. Check back later for updated picks.');
          setIsLoading(false);
          return;
        }
        
        // Process game results data
        const processedBettingLog = gameResults.map(game => ({
          id: game.id,
          date: new Date(game.game_date),
          sport: game.league,
          matchup: game.matchup,
          pick: game.pick_text,
          result: game.result,
          odds: game.odds,
          final_score: game.final_score
        }));
        
        setBettingLog(processedBettingLog);
        
        // Calculate stats
        const wins = gameResults.filter(game => game.result === 'won').length;
        const losses = gameResults.filter(game => game.result === 'lost').length;
        const pushes = gameResults.filter(game => game.result === 'push').length;
        const total = gameResults.length;
        const winRate = total > 0 ? (wins / total) : 0;
        
        // Group by sport/league
        const sportBreakdown = {};
        gameResults.forEach(game => {
          if (!sportBreakdown[game.league]) {
            sportBreakdown[game.league] = { sport: game.league, wins: 0, losses: 0, pushes: 0 };
          }
          
          if (game.result === 'won') sportBreakdown[game.league].wins++;
          else if (game.result === 'lost') sportBreakdown[game.league].losses++;
          else if (game.result === 'push') sportBreakdown[game.league].pushes++;
        });
        
        // Group by bet type
        const betTypeBreakdown = {};
        gameResults.forEach(game => {
          const betType = determineBetType(game.pick_text);
          if (!betTypeBreakdown[betType]) {
            betTypeBreakdown[betType] = { betType, count: 0, wins: 0, losses: 0, pushes: 0 };
          }
          
          betTypeBreakdown[betType].count++;
          if (game.result === 'won') betTypeBreakdown[betType].wins++;
          else if (game.result === 'lost') betTypeBreakdown[betType].losses++;
          else if (game.result === 'push') betTypeBreakdown[betType].pushes++;
        });
        
        // Find most profitable bet type
        let mostProfitableBetType = { betType: 'N/A', winRate: 0 };
        Object.values(betTypeBreakdown).forEach(bt => {
          const btWinRate = (bt.wins + bt.losses) > 0 ? (bt.wins / (bt.wins + bt.losses)) : 0;
          if (bt.count >= 5 && btWinRate > mostProfitableBetType.winRate) {
            mostProfitableBetType = { 
              betType: bt.betType, 
              winRate: btWinRate,
              displayRate: `+${(btWinRate * 100).toFixed(1)}%`
            };
          }
        });
        
        // Find best win
        const winningGames = gameResults.filter(game => game.result === 'won');
        let topWin = null;
        
        if (winningGames.length > 0) {
          // Sort by date (most recent first)
          const sortedWins = [...winningGames].sort(
            (a, b) => new Date(b.game_date) - new Date(a.game_date)
          );
          
          const bestGame = sortedWins[0];
          
          // Calculate win amount based on odds
          let winAmount = 100; // Default amount if odds not available
          
          if (bestGame.odds && typeof bestGame.odds === 'string') {
            const oddsValue = parseInt(bestGame.odds.replace(/[^0-9-]/g, ''));
            if (!isNaN(oddsValue)) {
              if (oddsValue > 0) {
                winAmount = oddsValue;
              } else if (oddsValue < 0) {
                winAmount = Math.round(10000 / Math.abs(oddsValue));
              }
            }
          }
          
          topWin = {
            matchup: bestGame.matchup,
            pick: bestGame.pick_text,
            odds: bestGame.odds,
            date: new Date(bestGame.game_date),
            winAmount
          };
        }
        
        setBestWin(topWin);
        
        setStats({
          record: `${wins}-${losses}${pushes > 0 ? `-${pushes}` : ''}`,
          totalBets: total,
          totalWins: wins,
          totalLosses: losses,
          pushes,
          winLoss: winRate,
          sportPerformance: Object.values(sportBreakdown),
          betTypePerformance: Object.values(betTypeBreakdown),
          mostProfitableBetType
        });
      } catch (err) {
        console.error('Error processing data:', err);
        setError('Failed to load your performance data. Please try again later.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [selectedTimeFrame]);
  
  // Helper function to determine bet type based on pick text
  const determineBetType = (pickText) => {
    if (!pickText) return 'Unknown';
    
    const lowerCaseText = pickText.toLowerCase();
    
    if (lowerCaseText.includes('under') || lowerCaseText.includes('over')) {
      return 'Total';
    } else if (lowerCaseText.includes('+') || lowerCaseText.includes('-')) {
      if (lowerCaseText.includes('spread') || lowerCaseText.includes('cover')) {
        return 'Spread';
      }
    }
    
    // Default to moneyline if no specific indicators
    return 'Moneyline';
  };
  
  return (
    <div className="billfold-container bg-white min-h-screen font-sans pt-16">
      <div className="max-w-screen-lg mx-auto px-4 py-6 border-x border-gray-100 shadow-sm bg-[#fffdf8]">
        {/* Enhanced Header with GARY A.I. */}
        <div className="billfold-header mb-10 relative">
          <h2 className="mb-1 flex items-center relative">
            <span className="font-bold tracking-wide" style={{ color: 'var(--gary-gold)', fontSize: '28px', opacity: 0.95 }}>GARY</span>
            <span className="font-bold tracking-wide" style={{ color: 'black', fontSize: '28px' }}>A.I.</span>
          </h2>
          <div className="h-1 w-28 mt-2 rounded-sm" style={{ backgroundColor: 'var(--gary-gold)', opacity: 0.85 }}></div>
        </div>
        
        {/* Enhanced Key Metrics Row - Using fixed-width grid and improved typography */}
        <div className="metrics-grid mb-8">
          {/* RECORD - With enhanced styling */}
          <div className="billfold-metric-card flex flex-col p-5 transition-all duration-200">
            <h3 className="billfold-section-heading">RECORD</h3>
            <div className="metric-value mb-1" style={{ color: 'black', fontFeatureSettings: "'tnum'" }}>
              {stats.record || '13-18-1'}
            </div>
            <div className="text-xs text-gary-text-soft mt-2 flex items-center">
              <span>Last 5: </span>
              <span className="ml-1 font-medium">1W - 4L</span>
              <span className="ml-2 text-gary-loss">↓</span>
            </div>
          </div>
          
          {/* WIN RATE - With enhanced styling */}
          <div className="billfold-metric-card flex flex-col p-5 transition-all duration-200">
            <h3 className="billfold-section-heading">WIN RATE</h3>
            <div className="metric-value mb-1" style={{ color: 'black', fontFeatureSettings: "'tnum'" }}>
              {(stats.winLoss * 100)?.toFixed(1) || '41.9'}%
            </div>
            <div className="text-xs text-gary-text-soft mt-2 flex items-center">
              <span>Last month: </span>
              <span className="ml-1 font-medium">38.5%</span>
              <span className="ml-2 text-gary-win">↑</span>
            </div>
          </div>
          
          {/* TOP WIN CARD IN METRICS GRID */}
          {bestWin && (
            <div className="billfold-metric-card flex flex-col p-5 transition-all duration-200">
              <h3 className="billfold-section-heading">TOP WIN</h3>
              <div className="font-bold text-lg mb-1 text-black overflow-hidden text-ellipsis" style={{ maxHeight: '48px' }}>
                {bestWin.matchup || ''}
              </div>
              <div className="font-medium text-sm mb-2 text-gary-text-soft">
                {bestWin.pick || ''}
                {bestWin.odds && <span className="ml-1">{bestWin.odds}</span>}
              </div>
              <div className="inline-block px-3 py-1 rounded text-white font-bold text-sm" style={{ backgroundColor: 'var(--gary-gold)' }}>
                +${bestWin.winAmount || 100}
              </div>
            </div>
          )}
        </div>
        
        {/* Recent Picks - now in a single column with improved styling */}
        <div className="grid grid-cols-1 gap-8 mb-8">
          {/* Recent Picks Table - Enhanced */}
          <div className="billfold-card overflow-hidden">
            <div className="px-5 py-4" style={{ backgroundColor: 'var(--gary-gold-tint)' }}>
              <h3 className="billfold-section-heading mb-0">RECENT PICKS</h3>
            </div>
            <table className="w-full border-collapse sleek-table">
              <thead style={{ backgroundColor: 'rgba(193, 162, 101, 0.1)' }}>
                <tr>
                  <th className="text-left py-3 px-4 font-semibold border-b border-gray-200" style={{ color: 'var(--gary-text-soft)' }}>DATE</th>
                  <th className="text-left py-3 px-4 font-semibold border-b border-gray-200" style={{ color: 'var(--gary-text-soft)' }}>SPORT</th>
                  <th className="text-left py-3 px-4 font-semibold border-b border-gray-200" style={{ color: 'var(--gary-text-soft)' }}>MATCHUP</th>
                  <th className="text-left py-3 px-4 font-semibold border-b border-gray-200" style={{ color: 'var(--gary-text-soft)' }}>PICK</th>
                  <th className="text-right py-3 px-4 font-semibold border-b border-gray-200" style={{ color: 'var(--gary-text-soft)' }}>RESULT</th>
                </tr>
              </thead>
              <tbody>
                {bettingLog.slice(0, 5).map((bet, index) => (
                  <tr key={index} className="border-b border-gray-50 hover:bg-[#fafafa] transition-colors">
                    <td className="py-3 px-4" style={{ color: 'var(--gary-text-soft)' }}>{new Date(bet.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                    <td className="py-3 px-4" style={{ color: 'var(--gary-text-soft)' }}>{bet.sport}</td>
                    <td className="py-3 px-4" style={{ color: 'black' }}>{bet.matchup || 'Game not found'}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center">
                        <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: 'var(--gary-gold)' }}></span>
                        <span className="ml-2" style={{ color: 'black' }}>{bet.pick || 'No pick data'}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className={`status-pill ${bet.result === 'won' ? 'win' : bet.result === 'push' ? 'push' : 'loss'}`}>
                        {bet.result === 'won' ? 'WON' : bet.result === 'push' ? 'PUSH' : 'LOST'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          

        </div>
          
        {/* Two-column layout for Sport Performance and Bet Type Distribution - Enhanced */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          {/* Sport Performance - Enhanced */}
          <div className="billfold-card overflow-hidden">
            <div className="px-5 py-4" style={{ backgroundColor: 'var(--gary-gold-tint)' }}>
              <h3 className="billfold-section-heading mb-0">SPORT PERFORMANCE</h3>
            </div>
            <div className="p-1">
              {stats.sportPerformance.map((sport, index) => {
                // Calculate bar width based on real data
                const totalGames = sport.wins + sport.losses;
                const winPercentage = totalGames > 0 ? (sport.wins / totalGames * 100) : 0;
                
                // Get sport-specific color hints with reduced opacity for better visual
                const sportColor = 
                  sport.sport === 'NBA' ? 'from-[#C9082A]/30 to-[#17408B]/30' : 
                  sport.sport === 'MLB' ? 'from-[#005A9C]/30 to-[#E81828]/30' :
                  sport.sport === 'NFL' ? 'from-[#013369]/30 to-[#D50A0A]/30' :
                  sport.sport === 'NHL' ? 'from-[#000000]/30 to-[#CCB876]/30' : 
                  'from-[var(--gary-gold)]/30 to-[var(--gary-gold)]/10';
                
                return (
                  <div key={index} className={`py-4 px-5 ${index !== stats.sportPerformance.length - 1 ? 'border-b border-gray-100' : ''}`}>
                    <div className="flex justify-between items-center mb-3">
                      <span className="font-semibold tracking-tight" style={{ color: 'black' }}>{sport.sport}</span>
                      <div className="flex space-x-3 items-center">
                        <span className="text-gary-win font-medium text-sm">W {sport.wins}</span>
                        <span className="text-gary-loss font-medium text-sm">L {sport.losses}</span>
                      </div>
                    </div>
                    <div className="progress-bar-track">
                      <div 
                        className={`progress-bar-fill bg-gradient-to-r ${sportColor}`}
                        style={{ width: `${winPercentage}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* Bet Type Distribution - Enhanced */}
          <div className="billfold-card overflow-hidden">
            <div className="px-5 py-4" style={{ backgroundColor: 'var(--gary-gold-tint)' }}>
              <h3 className="billfold-section-heading mb-0">BET TYPE DISTRIBUTION</h3>
            </div>
            <div className="p-5 h-full">
              <div className="grid gap-4">
                {stats.betTypePerformance.map((betType, index) => (
                  <div key={index} className="flex justify-between items-center">
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-sm" 
                           style={{ backgroundColor: index === 0 ? 'var(--gary-gold)' : 
                                   index === 1 ? 'rgba(var(--gary-gold-rgb), 0.7)' : 
                                   'rgba(var(--gary-gold-rgb), 0.4)' }}></div>
                      <span className="ml-3 font-medium" style={{ color: 'black' }}>{betType.betType}</span>
                    </div>
                    <span className="text-gary-text-soft font-medium">{betType.count}</span>
                  </div>
                ))}
              </div>
              
              <div className="mt-6 pt-6 border-t border-gray-100">
                <div className="text-center">
                  <div className="mb-2 text-gary-text-soft text-sm">MOST PROFITABLE BET TYPE</div>
                  <div className="inline-block py-2 px-4 rounded-full" 
                       style={{ backgroundColor: 'var(--gary-gold-tint)', color: 'var(--gary-gold)' }}>
                    <span className="font-bold">Moneyline +14.2%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Billfold;
