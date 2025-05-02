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

  // Handle time frame change
  const handleTimeFrameChange = (timeFrame) => {
    setSelectedTimeFrame(timeFrame);
  };

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

          // Format real data from the response - use pick_text field for actual pick data
          const logData = data.data?.map(game => ({
            id: game.id,
            date: new Date(game.game_date),
            sport: game.league,
            matchup: game.matchup,
            pick: game.pick_text || game.pick, // Use pick_text first, fallback to pick
            result: game.result
          })) || [];
          
          setBettingLog(logData);
          
          // Set the best win (most recent win from the actual data)
          const wins = logData.filter(bet => bet.result === 'won');
          if (wins.length > 0) {
            // Sort by date descending to get most recent win
            const sortedWins = [...wins].sort((a, b) => b.date - a.date);
            setBestWin(sortedWins[0]);
          } else if (logData.length > 0) {
            // If no wins are available, use the most recent game as a fallback
            const sortedGames = [...logData].sort((a, b) => b.date - a.date);
            setBestWin(sortedGames[0]);
          }
        }
      } catch (err) {
        console.error('Error fetching performance data:', err);
        setError('Failed to load your performance data. Please try again later.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [selectedTimeFrame]);
  
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
            <div className="font-feature-tnum" style={{ fontFeatureSettings: "'tnum'" }}>
              <div className="metric-value mb-1" style={{ color: 'black' }}>{stats.record || '26-36'}</div>
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
            <div className="font-feature-tnum" style={{ fontFeatureSettings: "'tnum'" }}>
              <div className="metric-value mb-1" style={{ color: 'black' }}>{(stats.winLoss * 100)?.toFixed(1) || '41.9'}%</div>
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
                {bestWin.matchup || 'Detroit Tigers vs Cleveland Guardians'}
              </div>
              <div className="font-medium text-sm mb-2 text-gary-text-soft">
                {bestWin.pick || 'Detroit Tigers ML +120'}
              </div>
              <div className="inline-block px-3 py-1 rounded text-white font-bold text-sm" style={{ backgroundColor: 'var(--gary-gold)' }}>
                +$120
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
