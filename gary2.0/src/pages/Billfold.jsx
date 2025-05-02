import React, { useState, useEffect } from 'react';
import { garyPerformanceService } from '../services/garyPerformanceService';
import '../styles/BillfoldEnhanced.css'; // Consolidated high-tech modern styling

export const Billfold = () => {
  // State for user performance data
  const [stats, setStats] = useState({
    bankroll: 0,
    roi: 0,
    winLoss: 0,
    record: '0-0',
    totalBets: 0,
    totalWins: 0,
    totalLosses: 0,
    pushes: 0,
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

  // Fetch user performance data on component mount
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Get performance data from the service
        const response = await garyPerformanceService.getGaryPerformance({timeFrame: selectedTimeFrame});
        const data = response.success ? response : null;
        if (data) {
          const summary = data.summary || {};
          const sportBreakdown = data.sportBreakdown || [];
          
          // Calculate ROI (you can replace this with actual calculation if available)
          const calculatedROI = ((summary.wins - summary.losses) / (summary.wins + summary.losses) * 100).toFixed(1);
          
          setStats({
            bankroll: 10000, // Static value as requested
            roi: parseFloat(calculatedROI) || 15.5,
            winLoss: summary.winRate ? summary.winRate / 100 : 0.419,
            record: summary.record || '26-36',
            totalBets: summary.total || 62,
            totalWins: summary.wins || 26,
            totalLosses: summary.losses || 36,
            pushes: summary.pushes || 0,
            // Map sport breakdown to the format our UI expects
            sportPerformance: sportBreakdown.map(sport => ({
              sport: sport.name,
              wins: sport.wins,
              losses: sport.losses,
              pushes: sport.pushes || 0
            })) || [],
            betTypePerformance: [
              { betType: 'Spread', count: 35 },
              { betType: 'Moneyline', count: 15 },
              { betType: 'Total', count: 12 },
            ],
          });

          // Format real data from the response
          const logData = data.data?.map(game => ({
            id: game.id,
            date: new Date(game.game_date),
            sport: game.league,
            matchup: game.matchup,
            pick: game.pick,
            result: game.result
          })) || [];
          
          setBettingLog(logData);
          
          // Set the best win (most recent win from the actual data)
          const wins = logData.filter(bet => bet.result === 'won');
          console.log('Available wins:', wins);
          if (wins.length > 0) {
            // Sort by date descending to get most recent win
            const sortedWins = [...wins].sort((a, b) => b.date - a.date);
            console.log('Selected top win:', sortedWins[0]);
            setBestWin(sortedWins[0]);
          } else if (logData.length > 0) {
            // If no wins are available, use the most recent game as a fallback
            const sortedGames = [...logData].sort((a, b) => b.date - a.date);
            console.log('No wins found, using most recent game:', sortedGames[0]);
            setBestWin(sortedGames[0]);
          }
        }
        setIsLoading(false);
      } catch (err) {
        console.error('Error fetching performance data:', err);
        setError(err.message);
        setIsLoading(false);
      }
    };

    fetchData();
  }, [selectedTimeFrame]);

  // Handle time frame change
  const handleTimeFrameChange = (timeFrame) => {
    setSelectedTimeFrame(timeFrame);
  };
  
  return (
    <div className="bg-white min-h-screen font-sans pt-16">
      <div className="max-w-screen-lg mx-auto px-4 py-6 border-x border-gray-100 shadow-sm bg-[#fffdf8]">
        {/* Enhanced Header with GARY A.I. */}
        <div className="billfold-header mb-8 relative">
          <h2 className="mb-2 flex items-center relative">
            <span className="font-bold tracking-wide" style={{ color: '#c19c60 !important', fontSize: '28px' }}>GARY</span>
            <span className="font-bold tracking-wide" style={{ color: 'black', fontSize: '28px' }}>A.I.</span>
          </h2>
        </div>
        
        {/* Enhanced Key Metrics Row */}
        <div className="grid grid-cols-3 gap-8 mb-8">
          <div className="billfold-card flex flex-col bg-white rounded-lg p-5 hover:shadow-lg transition-all duration-200">
            <h3 className="metric-label mb-2" style={{ color: 'black' }}>BANKROLL</h3>
            <div className="metric-value text-black mb-1" style={{ color: 'black' }}>${stats.bankroll.toLocaleString()}</div>
            <div className="text-xs text-black mt-1"></div>
          </div>
          
          <div className="billfold-card flex flex-col bg-white rounded-lg p-5 hover:shadow-lg transition-all duration-200 relative overflow-hidden">
            <div className="absolute w-10 h-10 rounded-full bg-[#d4af37]/10 -top-4 -right-4"></div>
            <h3 className="metric-label mb-2 relative z-10" style={{ color: 'black' }}>ROI</h3>
            <div className="metric-value text-black mb-1 flex items-center relative z-10" style={{ color: 'black' }}>
              {stats.roi}% <span className="ml-2"><img src="/coin.png" alt="ROI" className="w-6 h-6" /></span>
            </div>
            <div className="text-xs text-black mt-1 relative z-10"></div>
          </div>
          
          <div className="billfold-card flex flex-col bg-white rounded-lg p-5 hover:shadow-lg transition-all duration-200">
            <h3 className="metric-label mb-2" style={{ color: 'black' }}>WIN RATE</h3>
            <div className="metric-value text-black mb-1" style={{ color: 'black' }}>{(stats.winLoss * 100)?.toFixed(1) || '41.9'}%</div>
            <div className="text-xs text-black mt-1"></div>
          </div>
        </div>
        
        {/* Main Content - 3 Column Grid - Enhanced */}
        <div className="grid grid-cols-3 gap-6 mb-8">
          {/* Record Box - Enhanced with gold-light */}
          <div className="rounded-lg p-6 hover:shadow-lg transition-all duration-200" style={{ backgroundColor: '#c19c60', border: 'none', borderRadius: '10px' }}>
            <h3 className="metric-label mb-3 text-white">RECORD</h3>
            <div className="metric-value text-white mb-3">{stats.record || '26-36'}</div>
            <div className="text-sm text-white flex items-center">
              <span className="font-medium">Last 5:</span>
              <span className="ml-2 mr-1 font-semibold text-white">1W</span>
              <span className="mr-1">–</span>
              <span className="font-semibold text-white">4L</span>
              <span className="ml-2">🔥</span>
            </div>
          </div>
          
          {/* Win Rate Box - Enhanced with gold-light */}
          <div className="rounded-lg p-6 hover:shadow-lg transition-all duration-200" style={{ backgroundColor: '#c19c60', border: 'none', borderRadius: '10px' }}>
            <h3 className="metric-label mb-3 text-white">WIN RATE</h3>
            <div className="metric-value text-white mb-3">{(stats.winLoss * 100)?.toFixed(1) || '41.9'}%</div>
            <div className="text-sm text-white flex items-center">
              <span className="font-medium">Best Streak:</span>
              <span className="ml-2 font-semibold text-white">4 W's</span>
              <span className="ml-2">(Apr 12-15)</span>
            </div>
          </div>
          
          {/* Featured Top Win - Enhanced */}
          {bestWin && (
            <div className="billfold-card bg-white rounded-lg p-6 hover:shadow-lg transition-all duration-200 relative overflow-hidden">
              <div className="absolute w-24 h-24 rounded-full bg-[#10b981]/5 -top-8 -right-8"></div>
              <h3 className="section-heading mb-4 text-black relative z-10">TOP WIN</h3>
              <div className="flex flex-col justify-between h-[calc(100%-4rem)] relative z-10">
                <div className="mb-3">
                  <div className="text-sm text-black/70 font-medium" style={{ color: 'black' }}>{new Date(bestWin.date).toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}</div>
                  <div className="font-bold text-black text-xl tracking-tight mt-1" style={{ color: 'black' }}>{bestWin.sport}</div>
                  <div className="text-black/90 font-medium mt-1" style={{ color: 'black' }}>{bestWin.matchup}</div>
                </div>
                <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-100">
                  <div className="text-sm font-medium text-black/90" style={{ color: 'black' }}>{bestWin.pick}</div>
                  <div className="status-pill win font-semibold">WON</div>
                </div>
              </div>
            </div>
          )}
        </div>
          
        {/* Recent Picks Section - Enhanced */}
        <div className="mb-8">
          {/* Enhanced Header for Recent Picks */}
          <div className="mb-5">
            <h3 className="section-heading text-black">RECENT PICKS</h3>
          </div>
          
          {/* Enhanced Recent Picks Table */}
          <div className="billfold-card bg-white rounded-lg shadow-sm overflow-hidden">
            <table className="w-full border-collapse sleek-table">
              <thead style={{ backgroundColor: '#c19c60' }}>
                <tr>
                  <th className="text-left py-3 px-4 font-semibold border-b border-[#d4af37]/50" style={{ color: 'black' }}>DATE</th>
                  <th className="text-left py-3 px-4 font-semibold border-b border-[#d4af37]/50" style={{ color: 'black' }}>SPORT</th>
                  <th className="text-left py-3 px-4 font-semibold border-b border-[#d4af37]/50" style={{ color: 'black' }}>MATCHUP</th>
                  <th className="text-left py-3 px-4 font-semibold border-b border-[#d4af37]/50" style={{ color: 'black' }}>PICK</th>
                  <th className="text-right py-3 px-4 font-semibold border-b border-[#d4af37]/50" style={{ color: 'black' }}>RESULT</th>
                </tr>
              </thead>
              <tbody>
                {bettingLog.slice(0, 4).map((bet, index) => (
                  <tr key={index} className="border-b border-gray-50 hover:bg-[#fafafa] transition-colors">
                    <td className="py-4 px-4" style={{ color: 'black' }}>{new Date(bet.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                    <td className="py-4 px-4" style={{ color: 'black' }}>{bet.sport}</td>
                    <td className="py-4 px-4" style={{ color: 'black' }}>{bet.matchup || 'Game not found'}</td>
                    <td className="py-4 px-4">
                      <div className="flex items-center">
                        <span className="inline-block w-2 h-2 rounded-sm bg-[#d4af37] mr-2"></span>
                        <span style={{ color: 'black' }}>{bet.pick || 'UNDER 5.5'}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <span className={`status-pill ${bet.result === 'won' ? 'win' : 'loss'}`}>
                        {bet.result === 'won' ? 'WON' : 'LOST'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
          
        {/* Two-column layout for Sport Performance and Bet Type Distribution - Enhanced */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          {/* Sport Performance - Enhanced */}
          <div>
            <h3 className="section-heading mb-4 text-black">SPORT PERFORMANCE</h3>
            <div className="billfold-card bg-white rounded-lg overflow-hidden">
              <div>
                {stats.sportPerformance.map((sport, index) => {
                  // Calculate bar width based on real data
                  const totalGames = sport.wins + sport.losses;
                  const winPercentage = totalGames > 0 ? (sport.wins / totalGames * 100) : 0;
                  
                  // Get team-specific color hints
                  const sportColor = 
                    sport.sport === 'NBA' ? 'from-[#C9082A]/40 to-[#17408B]/40' : 
                    sport.sport === 'MLB' ? 'from-[#005A9C]/40 to-[#E81828]/40' :
                    sport.sport === 'NFL' ? 'from-[#013369]/40 to-[#D50A0A]/40' :
                    sport.sport === 'NHL' ? 'from-[#000000]/40 to-[#CCB876]/40' : 'from-[#d4af37]/40 to-[#d4af37]/20';
                  
                  return (
                    <div key={index} className={`py-4 px-5 ${index !== stats.sportPerformance.length - 1 ? 'border-b border-gray-100' : ''}`}>
                      <div className="flex justify-between items-center mb-3">
                        <span style={{ color: 'black' }} className="font-semibold tracking-tight">{sport.sport}</span>
                        <div className="flex space-x-3 items-center">
                          <span className="text-[#10b981] font-medium text-sm">W {sport.wins}</span>
                          <span className="text-[#ef4444] font-medium text-sm">L {sport.losses}</span>
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
          </div>
          
          {/* Bet Type Distribution - Enhanced */}
          <div>
            <h3 className="section-heading mb-4 text-black">BET TYPE DISTRIBUTION</h3>
            <div className="billfold-card bg-white rounded-lg h-full relative overflow-hidden">
              <div className="absolute w-56 h-56 rounded-full bg-[#d4af37]/5 -bottom-20 -right-20 z-0"></div>
              <div className="grid grid-cols-2 h-full relative z-10">
                <div className="p-6 flex items-center">
                  <div className="w-14 h-14 bg-gradient-to-br from-[#d4af37] to-[#ba9320] rounded-lg flex items-center justify-center shadow-sm mr-5">
                    <img src="/coin2.png" alt="Gary Coin" className="w-9 h-9" />
                  </div>
                  <div>
                    <p className="text-base font-medium" style={{ color: 'black !important' }}>We're due for a comeback</p>
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
