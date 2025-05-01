import React, { useState, useEffect } from 'react';
import { fetchUserPerformance } from '../services/garyPerformanceService';
import '../styles/BillfoldStyle.css';

const Billfold = () => {
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
        // Replace with your actual API call
        const data = await fetchUserPerformance(selectedTimeFrame);
        if (data) {
          setStats({
            bankroll: data.bankroll || 10000,
            roi: data.roi || 15.5,
            winLoss: data.winLoss || 0.419,
            record: data.record || '26-36',
            totalBets: data.totalBets || 62,
            totalWins: data.totalWins || 26,
            totalLosses: data.totalLosses || 36,
            pushes: data.pushes || 0,
            sportPerformance: data.sportPerformance || [
              { sport: 'NBA', wins: 12, losses: 14 },
              { sport: 'MLB', wins: 8, losses: 10 },
              { sport: 'NFL', wins: 6, losses: 6 },
              { sport: 'NHL', wins: 2, losses: 4 }
            ],
            betTypePerformance: data.betTypePerformance || [
              { type: 'Spread', count: 30 },
              { type: 'Moneyline', count: 20 },
              { type: 'Total', count: 12 }
            ],
          });
          
          // Betting log for recent picks
          setBettingLog(data.bettingLog || [
            {
              date: '2023-04-29',
              sport: 'NHL',
              matchup: 'St Louis Blues at Winnipeg Jet',
              pick: 'UNDER 5.5',
              result: 'lost',
              score: '2-3'
            },
            {
              date: '2023-04-28',
              sport: 'MLB',
              matchup: 'NY Yankees at Texas Rangers',
              pick: 'Yankees -1.5',
              result: 'won',
              score: '4-2'
            },
            {
              date: '2023-04-27',
              sport: 'NBA',
              matchup: 'Sacramento Kings at Golden State Warriors',
              pick: 'Warriors -3.5',
              result: 'lost',
              score: '114-119'
            },
            {
              date: '2023-04-26',
              sport: 'NHL',
              matchup: 'Boston Bruins at Florida Panthers',
              pick: 'Bruins ML',
              result: 'won',
              score: '3-2'
            },
            {
              date: '2023-04-25',
              sport: 'MLB',
              matchup: 'Atlanta Braves at Miami Marlins',
              pick: 'OVER 7.5',
              result: 'lost',
              score: '3-1'
            },
          ]);
        }
      } catch (err) {
        console.error('Error fetching performance data:', err);
        setError('Failed to load performance data. Please try again later.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [selectedTimeFrame]);

  // Handle time frame change
  const handleTimeFrameChange = (timeFrame) => {
    setSelectedTimeFrame(timeFrame);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <p className="text-xl">Loading...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <p className="text-xl text-red-500">{error}</p>
      </div>
    );
  }
  
  // Find the best win and worst loss for highlights
  const bestWin = bettingLog.find(bet => bet.result === 'won') || null;
  const worstLoss = bettingLog.find(bet => bet.result === 'lost') || null;
  
  return (
    <div className="bg-white min-h-screen font-sans pt-16">
      <div className="max-w-screen-lg mx-auto px-4 py-4">
        {/* Header */}
        <h2 className="text-gray-800 text-2xl font-bold mb-6">Billfold</h2>
        
        {/* Top Stats Bar */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="text-center">
            <div className="text-gray-600 uppercase text-xs font-semibold mb-1">BANKROLL</div>
            <div className="text-lg font-bold">${stats.bankroll || '10000'}</div>
          </div>
          
          <div className="text-center">
            <div className="text-gray-600 uppercase text-xs font-semibold mb-1">ROI</div>
            <div className="flex justify-center items-center">
              <span className="text-lg font-bold">{stats.roi?.toFixed(1) || '15.5'} %</span>
              <img src="/coin2.png" alt="Gary Coin" className="h-6 w-6 ml-2" />
            </div>
          </div>
          
          <div></div> {/* Empty div for spacing */}
          
          <div className="text-center">
            <div className="text-gray-600 uppercase text-xs font-semibold mb-1">WIN RATE</div>
            <div className="text-lg font-bold">{(stats.winLoss * 100)?.toFixed(1) || '41.9'} %</div>
          </div>
        </div>
        
        {/* Main Content */}
        <div className="space-y-6">
          {/* Yellow Highlight Boxes */}
          <div className="grid grid-cols-2 gap-6">
            {/* Record Box */}
            <div className="bg-[#fff9d0] rounded-md p-6">
              <h3 className="uppercase text-sm font-bold mb-2">RECORD</h3>
              <div className="text-6xl font-bold text-gray-800 mb-2">{stats.record}</div>
              <div className="text-sm text-gray-600">Past 5 Games: 1W – 4 L 🔥 🔥</div>
            </div>
            
            {/* Win Rate Box */}
            <div className="bg-[#fff9d0] rounded-md p-6">
              <h3 className="uppercase text-sm font-bold mb-2">WIN RATE</h3>
              <div className="text-6xl font-bold text-gray-800 mb-2">{(stats.winLoss * 100).toFixed(1)}%</div>
              <div className="text-sm text-gray-600">Best Streak: 4 W's (Apr 12-15)</div>
            </div>
          </div>
          
          {/* Checkbox header for Recent Picks */}
          <div className="flex items-center space-x-2 mt-6">
            <div className="w-5 h-5 bg-gray-200 flex items-center justify-center rounded">
              <span className="text-gray-600">✓</span>
            </div>
            <h3 className="uppercase text-base font-bold">RECENT PICKS</h3>
          </div>
          
          {/* Recent Picks Table */}
          <div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 text-xs uppercase text-gray-600 font-normal">DATE</th>
                  <th className="text-left py-2 text-xs uppercase text-gray-600 font-normal">SPORT</th>
                  <th className="text-left py-2 text-xs uppercase text-gray-600 font-normal">MATCHUP</th>
                  <th className="text-left py-2 text-xs uppercase text-gray-600 font-normal">PICK</th>
                  <th className="text-left py-2 text-xs uppercase text-gray-600 font-normal">RESULT</th>
                </tr>
              </thead>
              <tbody>
                {bettingLog.slice(0, 4).map((bet, index) => (
                  <tr key={index} className="border-b border-gray-100">
                    <td className="py-3 text-sm">{bet.date ? new Date(bet.date).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : 'Apr 29'}</td>
                    <td className="py-3 text-sm">{bet.sport || 'NHL'}</td>
                    <td className="py-3 text-sm">{bet.matchup || 'St Louis Blues at Winnipeg Jet'}</td>
                    <td className="py-3 text-sm">
                      <div className="flex items-center">
                        <span className="inline-block w-3 h-3 rounded-full bg-red-500 mr-2"></span>
                        {bet.pick || 'UNDER 5.5'}
                      </div>
                    </td>
                    <td className="py-3 text-sm text-red-500 font-semibold">{bet.result?.toUpperCase() || 'LOST'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Sport Performance Section */}
          <div>
            <h3 className="uppercase text-base font-bold mb-4">SPORT PERFORMANCE</h3>
            <div className="bg-white rounded shadow-sm p-4">
              <div className="space-y-6">
                {stats.sportPerformance.map((sport, index) => (
                  <div key={index} className="space-y-1">
                    <div className="flex justify-between">
                      <div>{sport.sport || 'NBA'}</div>
                      <div className="flex space-x-2">
                        <span>W {sport.wins || 12}</span>
                        <span>L {sport.losses || 14}</span>
                      </div>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-[#d4af37] rounded-full" 
                        style={{ width: `${sport.wins / (sport.wins + sport.losses) * 100 || 45}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          {/* Bet Type Distribution */}
          <div>
            <h3 className="uppercase text-base font-bold mb-4">BET TYPE DISTRIBUTION</h3>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <div className="bg-white p-4 rounded shadow-sm flex items-center space-x-4">
                  <div className="w-16 h-16 bg-[#d4af37] rounded-full flex items-center justify-center">
                    <img src="/coin2.png" alt="Bear" className="w-12 h-12" />
                  </div>
                  <div>
                    <h4 className="font-bold">Determined</h4>
                    <p className="text-sm text-gray-600">We're due for a comeback</p>
                  </div>
                </div>
              </div>
              <div>
                <div className="bg-white p-4 rounded shadow-sm">
                  <h4 className="uppercase text-sm font-bold mb-2">BET TYPE</h4>
                  <div className="flex items-center space-x-2">
                    <div className="w-28 h-28 rounded-full bg-[#d4af37] flex-shrink-0"></div>
                    <div className="text-center">DISTRIBUTION</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Top Win Section */}
          <div>
            <h3 className="uppercase text-base font-bold mb-4">TOP WIN</h3>
            {bestWin && (
              <div className="bg-white rounded shadow-sm p-4">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="text-sm text-gray-600">{bestWin.date ? new Date(bestWin.date).toLocaleDateString('en-US', {month: 'short', day: 'numeric'}) : 'Apr 28'}</div>
                    <div className="font-bold">{bestWin.sport || 'MLB'}</div>
                    <div>{bestWin.matchup || 'NY Yankees at Texas Rangers'}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-green-500 font-bold text-lg">WON</div>
                    <div className="text-sm">{bestWin.pick || 'Yankees -1.5'}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Billfold;
