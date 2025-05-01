import React, { useState, useEffect } from 'react';
import { garyPerformanceService } from '../services/garyPerformanceService';
import '../styles/BillfoldStyle.css';
import '../styles/BillfoldOverride.css'; // Emergency override for text colors

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
          if (wins.length > 0) {
            // Sort by date descending to get most recent win
            const sortedWins = [...wins].sort((a, b) => b.date - a.date);
            setBestWin(sortedWins[0]);
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
      <div className="max-w-screen-lg mx-auto px-4 py-6 border-x border-gray-100 shadow-sm">
        {/* Header with glass morphism effect */}
        <div className="mb-8 relative">
          <h2 className="text-black text-3xl font-bold mb-2">Billfold</h2>
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#d4af37]/50 to-transparent"></div>
        </div>
        
        {/* Key Metrics Row */}
        <div className="grid grid-cols-3 gap-8 mb-8">
          <div className="flex flex-col bg-white rounded-lg border border-gray-200 shadow-md p-4 hover:shadow-lg transition-all duration-200">
            <h3 className="uppercase text-xs font-semibold mb-2 text-gray-600 tracking-wider">BANKROLL</h3>
            <div className="text-3xl font-bold text-black mb-auto">${stats.bankroll.toLocaleString()}</div>
          </div>
          
          <div className="flex flex-col bg-white rounded-lg border border-gray-200 shadow-md p-4 hover:shadow-lg transition-all duration-200">
            <h3 className="uppercase text-xs font-semibold mb-2 text-gray-600 tracking-wider">ROI</h3>
            <div className="text-3xl font-bold text-black mb-auto flex items-center">
              {stats.roi}% <span className="ml-2"><img src="/coin.png" alt="ROI" className="w-6 h-6" /></span>
            </div>
          </div>
          
          <div className="flex flex-col bg-white rounded-lg border border-gray-200 shadow-md p-4 hover:shadow-lg transition-all duration-200">
            <h3 className="uppercase text-xs font-semibold mb-2 text-gray-600 tracking-wider">WIN RATE</h3>
            <div className="text-3xl font-bold text-black mb-auto">{(stats.winLoss * 100)?.toFixed(1) || '41.9'}%</div>
          </div>
        </div>
        
        {/* Main Content - 3 Column Grid */}
        <div className="grid grid-cols-3 gap-6 mb-8">
          {/* Record Box */}
          <div className="bg-[#d4af37]/10 rounded-lg p-6 border border-[#d4af37]/30 shadow-md hover:shadow-lg transition-all duration-200">
            <h3 className="uppercase text-sm font-bold mb-2 text-black">RECORD</h3>
            <div className="text-6xl font-bold text-black mb-2">{stats.record || '26-36'}</div>
            <div className="text-sm text-black">Past 5 Games: 1W – 4 L 🔥 🔥</div>
          </div>
          
          {/* Win Rate Box */}
          <div className="bg-[#d4af37]/10 rounded-lg p-6 border border-[#d4af37]/30 shadow-md hover:shadow-lg transition-all duration-200">
            <h3 className="uppercase text-sm font-bold mb-2 text-black">WIN RATE</h3>
            <div className="text-6xl font-bold text-black mb-2">{(stats.winLoss * 100)?.toFixed(1) || '41.9'}%</div>
            <div className="text-sm text-black">Best Streak: 4 W's (Apr 12-15)</div>
          </div>
          
          {/* Featured Top Win */}
          {bestWin && (
            <div className="bg-white rounded-lg p-6 border border-[#d4af37]/30 shadow-md hover:shadow-lg transition-all duration-200">
              <h3 className="uppercase text-sm font-bold mb-3 text-black border-b border-[#d4af37]/20 pb-2">TOP WIN</h3>
              <div className="flex flex-col justify-between h-[calc(100%-2rem)]">
                <div className="mb-2">
                  <div className="text-sm text-black">{bestWin.date ? new Date(bestWin.date).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : 'Apr 28'}</div>
                  <div className="font-bold text-black text-lg">{bestWin.sport || 'MLB'}</div>
                  <div className="text-black">{bestWin.matchup || 'NY Yankees at Texas Rangers'}</div>
                </div>
                <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-100">
                  <div className="text-sm font-medium text-black">{bestWin.pick || 'Yankees -1.5'}</div>
                  <div className="font-bold text-lg rounded-md px-3 py-1 bg-green-50 text-win">WON</div>
                </div>
              </div>
            </div>
          )}
        </div>
          
        {/* Recent Picks Section */}
        <div className="mb-8">
          {/* Enhanced Header for Recent Picks */}
          <div className="flex items-center space-x-3 mb-4 border-b border-gray-200 pb-3">
            <div className="bg-gray-100 rounded-md p-1 shadow-sm border border-gray-200">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 6L9 17l-5-5" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3 className="text-lg font-bold text-black">RECENT PICKS</h3>
          </div>
          
          {/* Enhanced Recent Picks Table */}
          <div className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200/60">
            <table className="w-full border-collapse">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left py-3 px-4 text-xs uppercase text-black font-medium tracking-wider border-b border-gray-200">DATE</th>
                  <th className="text-left py-3 px-4 text-xs uppercase text-black font-medium tracking-wider border-b border-gray-200">SPORT</th>
                  <th className="text-left py-3 px-4 text-xs uppercase text-black font-medium tracking-wider border-b border-gray-200">MATCHUP</th>
                  <th className="text-left py-3 px-4 text-xs uppercase text-black font-medium tracking-wider border-b border-gray-200">PICK</th>
                  <th className="text-left py-3 px-4 text-xs uppercase text-black font-medium tracking-wider border-b border-gray-200">RESULT</th>
                </tr>
              </thead>
              <tbody>
                {bettingLog.slice(0, 4).map((bet, index) => (
                  <tr key={index} className={`border-b border-gray-100 hover:bg-gray-50/50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                    <td className="py-4 px-4 text-sm text-black">{bet.date ? new Date(bet.date).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : 'Apr 29'}</td>
                    <td className="py-4 px-4 text-sm font-medium text-black">{bet.sport || 'NHL'}</td>
                    <td className="py-4 px-4 text-sm text-black">{bet.matchup || 'St Louis Blues at Winnipeg Jet'}</td>
                    <td className="py-4 px-4 text-sm">
                      <div className="flex items-center">
                        <span className="inline-block w-3 h-3 rounded-full bg-[#ef4444] mr-2 shadow-sm"></span>
                        <span className="text-black">{bet.pick || 'UNDER 5.5'}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className={`text-sm font-semibold py-1 px-3 rounded-full ${bet.result === 'won' ? 'bg-green-50 text-win' : 'bg-red-50 text-loss'}`}>
                        {bet.result === 'won' ? 'WON' : 'LOST'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
          
        {/* Two-column layout for Sport Performance and Bet Type Distribution */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          {/* Sport Performance - More sleek and professional */}
          <div>
            <div className="flex items-center mb-4 border-b border-[#d4af37]/20 pb-2">
              <h3 className="text-base font-bold text-black uppercase tracking-wider">Sport Performance</h3>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200/60 overflow-hidden">
              <div className="divide-y divide-gray-100">
                {stats.sportPerformance.map((sport, index) => {
                  // Calculate bar width based on real data
                  const totalGames = sport.wins + sport.losses;
                  const winPercentage = totalGames > 0 ? (sport.wins / totalGames * 100) : 0;
                  
                  return (
                    <div key={index} className="py-3 px-4">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-black font-medium">{sport.sport}</span>
                        <div className="flex items-center text-sm">
                          <span className="text-win font-medium mr-2">W {sport.wins}</span>
                          <span className="text-loss font-medium">L {sport.losses}</span>
                        </div>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-sm overflow-hidden">
                        <div 
                          className="h-full bg-[#d4af37]" 
                          style={{ width: `${winPercentage}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          
          {/* Bet Type Distribution - More sleek and professional */}
          <div>
            <div className="flex items-center mb-4 border-b border-[#d4af37]/20 pb-2">
              <h3 className="text-base font-bold text-black uppercase tracking-wider">Bet Type Distribution</h3>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200/60 h-full">
              <div className="grid grid-cols-2 h-full">
                <div className="p-5 flex items-center border-r border-gray-100">
                  <div className="w-12 h-12 bg-[#d4af37] rounded-full flex items-center justify-center shadow-sm mr-4">
                    <img src="/coin2.png" alt="Gary Coin" className="w-8 h-8" />
                  </div>
                  <div>
                    <p className="text-base font-medium text-black">We're due for a comeback</p>
                  </div>
                </div>
                <div className="p-5 flex flex-col items-center justify-center">
                  <div className="w-20 h-20 rounded-full bg-[#d4af37] flex-shrink-0 shadow-sm"></div>
                  <div className="mt-2 text-sm text-black font-medium">DISTRIBUTION</div>
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
