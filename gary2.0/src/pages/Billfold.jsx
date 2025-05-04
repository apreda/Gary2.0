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
    <div className="billfold-container min-h-screen font-sans pt-16 relative">
      {/* Grid Background for depth */}
      <div className="absolute inset-0 w-full h-full z-0" style={{
        backgroundImage: `
          linear-gradient(rgba(18, 18, 18, 0.8) 1px, transparent 1px),
          linear-gradient(90deg, rgba(18, 18, 18, 0.8) 1px, transparent 1px),
          linear-gradient(rgba(18, 18, 18, 0.2) 1px, transparent 1px),
          linear-gradient(90deg, rgba(18, 18, 18, 0.2) 1px, transparent 1px)
        `,
        backgroundSize: '100px 100px, 100px 100px, 20px 20px, 20px 20px',
        backgroundPosition: '-1px -1px, -1px -1px, -1px -1px, -1px -1px',
        perspective: '1000px',
        backgroundAttachment: 'fixed'
      }}></div>
      
      {/* Gold accent lines */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[20%] left-0 w-full h-[1px] bg-[#b8953f]/20"></div>
        <div className="absolute top-[80%] left-0 w-full h-[1px] bg-[#b8953f]/20"></div>
        <div className="absolute top-0 left-[30%] w-[1px] h-full bg-[#b8953f]/10"></div>
        <div className="absolute top-0 left-[70%] w-[1px] h-full bg-[#b8953f]/10"></div>
        
        {/* Corner accents */}
        <div className="absolute top-10 left-10 w-20 h-20">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-[#b8953f]/40"></div>
          <div className="absolute top-0 left-0 h-full w-[1px] bg-[#b8953f]/40"></div>
        </div>
        <div className="absolute top-10 right-10 w-20 h-20">
          <div className="absolute top-0 right-0 w-full h-[1px] bg-[#b8953f]/40"></div>
          <div className="absolute top-0 right-0 h-full w-[1px] bg-[#b8953f]/40"></div>
        </div>
      </div>
      
      <div className="max-w-screen-lg mx-auto px-4 py-6 border-x border-gray-700/30 shadow-lg bg-[#121212]/90 backdrop-blur-sm relative z-10">
        {/* Enhanced Header with GARY A.I. and garymoney image */}
        <div className="billfold-header mb-10 relative">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="mb-1 flex items-center relative">
                <span className="font-bold tracking-wide" style={{ color: '#b8953f', fontSize: '28px', opacity: 0.95 }}>GARY</span>
                <span className="font-bold tracking-wide" style={{ color: 'white', fontSize: '28px' }}>A.I.</span>
              </h2>
              <div className="h-1 w-28 mt-2 rounded-sm" style={{ backgroundColor: '#b8953f', opacity: 0.85 }}></div>
            </div>
            <img 
              src="/garymoney.png" 
              alt="Gary Money" 
              className="h-20 w-auto object-contain opacity-90 animate-float" 
            />
          </div>
        </div>
        
        {/* Enhanced Key Metrics Row - Using fixed-width grid and improved typography */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          {/* RECORD - With enhanced styling */}
          <div className="billfold-card billfold-metrics-card p-5 bg-gray-900/80 border border-gray-800 backdrop-blur rounded-lg shadow-lg">
            <h5 className="text-xs uppercase tracking-wider mb-1 text-gray-400">RECORD</h5>
            <div className="text-xl font-bold text-white">{stats.record}</div>
          </div>
          
          {/* WIN RATE - With enhanced styling */}
          <div className="billfold-card billfold-metrics-card p-5 bg-gray-900/80 border border-gray-800 backdrop-blur rounded-lg shadow-lg">
            <h5 className="text-xs uppercase tracking-wider mb-1 text-gray-400">WIN RATE</h5>
            <div className="text-xl font-bold text-white">{(stats.winLoss * 100)?.toFixed(1) || '41.9'}%</div>
            <div className="mt-2 text-xs text-gray-400 flex items-center">
              <span>Last month: </span>
              <span className="ml-1 font-medium text-gray-300">38.5%</span>
              <span className="ml-2 text-green-500">↑</span>
            </div>
          </div>
          
          {/* TOP WIN CARD IN METRICS GRID */}
          {bestWin && (
            <div className="billfold-card billfold-metrics-card p-5 border border-gray-800 backdrop-blur rounded-lg shadow-lg" style={{ backgroundColor: 'rgba(17, 17, 17, 0.95)' }}>
              <h5 className="text-xs uppercase tracking-wider mb-1 text-gray-400">TOP WIN</h5>
              <div className="font-bold text-lg mb-1 text-white overflow-hidden text-ellipsis" style={{ maxHeight: '48px' }}>
                {bestWin.matchup || ''}
              </div>
              <div className="font-medium text-sm mb-2 text-gray-400">
                {bestWin.pick || ''}
                {bestWin.odds && <span className="ml-1">{bestWin.odds}</span>}
              </div>
              <div className="inline-block px-3 py-1 rounded text-black font-bold text-sm bg-[#b8953f]">
                +${bestWin.winAmount || 100}
              </div>
            </div>
          )}
        </div>
        
        {/* Recent Picks - now in a single column with improved styling */}
        <div className="grid grid-cols-1 gap-8 mb-8">
          {/* Recent Picks Table - Enhanced */}
          <div className="rounded-lg overflow-hidden bg-gray-900/80 border border-gray-800 backdrop-blur shadow-lg">
            <div className="px-5 py-4 bg-gray-800/80 border-b border-gray-700">
              <h3 className="font-bold text-[#b8953f] text-lg tracking-wide mb-0">RECENT PICKS</h3>
            </div>
            <table className="w-full border-collapse sleek-table">
              <thead className="bg-gray-800/60">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold border-b border-gray-700 text-gray-400">DATE</th>
                  <th className="text-left py-3 px-4 font-semibold border-b border-gray-700 text-gray-400">SPORT</th>
                  <th className="text-left py-3 px-4 font-semibold border-b border-gray-700 text-gray-400">MATCHUP</th>
                  <th className="text-left py-3 px-4 font-semibold border-b border-gray-700 text-gray-400">PICK</th>
                  <th className="text-right py-3 px-4 font-semibold border-b border-gray-700 text-gray-400">RESULT</th>
                </tr>
              </thead>
              <tbody>
                {bettingLog.slice(0, 5).map((bet, index) => (
                  <tr key={index} className="border-b border-gray-700/50 hover:bg-gray-800/50 transition-colors">
                    <td className="py-3 px-4 text-gray-400">{new Date(bet.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                    <td className="py-3 px-4 text-gray-400">{bet.sport}</td>
                    <td className="py-3 px-4 text-gray-200">{bet.matchup || 'Game not found'}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center">
                        <span className="inline-block w-2 h-2 rounded-sm bg-[#b8953f]"></span>
                        <span className="ml-2 text-gray-200">{bet.pick || 'No pick data'}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${bet.result === 'won' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : bet.result === 'push' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
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
          <div className="rounded-lg overflow-hidden bg-gray-900/80 border border-gray-800 backdrop-blur shadow-lg">
            <div className="px-5 py-4 bg-gray-800/80 border-b border-gray-700">
              <h3 className="font-bold text-[#b8953f] text-lg tracking-wide mb-0">SPORT PERFORMANCE</h3>
            </div>
            <div className="p-4">
              {stats.sportPerformance.map((sport, index) => {
                // Calculate bar width based on real data
                const totalGames = sport.wins + sport.losses;
                const winPercentage = totalGames > 0 ? (sport.wins / totalGames * 100) : 0;
                
                // Get sport-specific color hints with increased opacity for better visibility on dark background
                const sportColor = 
                  sport.sport === 'NBA' ? 'from-[#C9082A]/80 to-[#17408B]/80' : 
                  sport.sport === 'NFL' ? 'from-[#013369]/70 to-[#D50A0A]/70' : 
                  sport.sport === 'MLB' ? 'from-[#002D72]/70 to-[#E81828]/70' : 
                  sport.sport === 'NHL' ? 'from-[#000000]/70 to-[#FA4616]/70' : 
                  'from-[#b8953f]/70 to-[#b8953f]/40';
                
                return (
                  <div key={index} className="mb-4 last:mb-0">
                    {/* Sport name and win-loss record */}
                    <div className="flex justify-between mb-1">
                      <div className="font-bold text-sm text-gray-200">{sport.sport}</div>
                      <div className="text-xs text-gray-400">{sport.wins}W - {sport.losses}L</div>
                    </div>
                    
                    {/* Win percentage visualized */}
                    <div className="w-full bg-gray-800/80 h-2 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full bg-gradient-to-r ${sportColor}`}
                        style={{ width: `${winPercentage}%`, minWidth: '10px' }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* Bet Type Distribution - Enhanced */}
          <div className="gary-card rounded-lg overflow-hidden" style={{
            borderRadius: 'var(--radius-md)',
            borderColor: 'var(--gary-border-primary)'
          }}>
            <div className="gary-card-header">
              <h3 className="gary-text-accent font-bold text-lg tracking-wide mb-0">BET TYPE DISTRIBUTION</h3>
            </div>
            <div className="gary-card-body">
              <div className="gary-grid" style={{ gap: 'var(--space-md)' }}>
                {stats.betTypePerformance.map((betType, index) => (
                  <div key={index} className="gary-flex-between">
                    <div className="gary-flex">
                      <div className="w-3 h-3 rounded-sm" 
                           style={{ 
                             backgroundColor: index === 0 ? 'var(--gary-gold)' : 
                                           index === 1 ? 'var(--gary-gold-light)' : 
                                           'var(--gary-gold-tint)' 
                           }}></div>
                      <span className="ml-3 font-medium" style={{ color: 'var(--gary-text-primary)' }}>{betType.betType}</span>
                    </div>
                    <div className="gary-flex">
                      <span className="font-medium" style={{ color: 'var(--gary-text-primary)' }}>{betType.count}</span>
                      <span className="text-sm ml-1" style={{ color: 'var(--gary-text-secondary)' }}>({Math.round(betType.percentage)}%)</span>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="mt-6 pt-6" style={{ borderTop: '1px solid var(--gary-border-secondary)' }}>
                <div className="text-center">
                  <div className="mb-2 text-sm" style={{ color: 'var(--gary-text-tertiary)' }}>MOST PROFITABLE BET TYPE</div>
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
