import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import '../styles/BillfoldEnhanced.css';
import '../styles/BillfoldScroll.css';
import '../styles/PropPicks.css';

export const PropPicks = ({ selectedTimeFrame }) => {
  // State for prop picks data
  const [stats, setStats] = useState({
    record: '',
    totalBets: 0,
    totalWins: 0,
    totalLosses: 0,
    pushes: 0,
    winRate: 0,
    sportPerformance: [],
    propTypePerformance: [],
    mostProfitablePropType: { propType: 'N/A', winRate: 0 }
  });

  // State for betting log/history
  const [bettingLog, setBettingLog] = useState([]);
  const [bestWin, setBestWin] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch data directly from Supabase prop_results table
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        // Fetch prop results from Supabase
        let query = supabase
          .from('prop_results')
          .select('*')
          .order('created_at', { ascending: false });
        
        // Apply time filter if not 'all'
        if (selectedTimeFrame !== 'all') {
          let dateFilter = new Date();
          
          switch (selectedTimeFrame) {
            case '7d':
              dateFilter.setDate(dateFilter.getDate() - 7);
              break;
            case '30d':
              dateFilter.setDate(dateFilter.getDate() - 30);
              break;
            case '90d':
              dateFilter.setDate(dateFilter.getDate() - 90);
              break;
            case 'ytd':
              dateFilter = new Date(dateFilter.getFullYear(), 0, 1); // Jan 1 of current year
              break;
            default:
              dateFilter = null;
          }
          
          if (dateFilter) {
            query = query.gte('created_at', dateFilter.toISOString());
          }
        }
        
        // Execute the query
        const { data: propResults, error: propResultsError } = await query;
        
        if (propResultsError) {
          throw new Error(`Error fetching prop results: ${propResultsError.message}`);
        }
        
        if (!propResults || propResults.length === 0) {
          setError('No prop results found. Check back later for updated picks.');
          setIsLoading(false);
          return;
        }
        
        // Group prop results by date
        const propResultsByDate = {};
        propResults.forEach(prop => {
          const gameDate = prop.game_date?.split('T')[0] || 'unknown';
          if (!propResultsByDate[gameDate]) {
            propResultsByDate[gameDate] = [];
          }
          propResultsByDate[gameDate].push(prop);
        });
        
        // For each date, sort by confidence and take top 10
        let limitedPropResults = [];
        Object.keys(propResultsByDate).forEach(date => {
          // Sort by confidence (if available) in descending order
          const sorted = [...propResultsByDate[date]].sort((a, b) => {
            const confA = a.confidence || 0;
            const confB = b.confidence || 0;
            return confB - confA;
          });
          
          // Take only top 10 for each date
          const topPicks = sorted.slice(0, 10);
          limitedPropResults = [...limitedPropResults, ...topPicks];
        });
        
        // Use the limited set of prop results for all operations below
        const filteredPropResults = limitedPropResults;
        
        // Process prop results data - use the filtered list instead of full list
        const processedBettingLog = filteredPropResults.map(prop => ({
          id: prop.id,
          date: new Date(prop.created_at),
          sport: prop.league,
          player: prop.player_name,
          team: prop.team,
          propType: prop.prop_type,
          pick: `${prop.prop_type} ${prop.pick_direction} ${prop.prop_line}`,
          result: prop.result_status,
          actualResult: prop.actual_result
        }));
        
        setBettingLog(processedBettingLog);
        
        // Calculate stats using filtered prop results
        const wins = filteredPropResults.filter(prop => prop.result_status === 'won').length;
        const losses = filteredPropResults.filter(prop => prop.result_status === 'lost').length;
        const pushes = filteredPropResults.filter(prop => prop.result_status === 'push').length;
        const total = filteredPropResults.length;
        const winRate = total > 0 ? (wins / (wins + losses)) : 0;
        
        // Group by sport/league
        const sportBreakdown = {};
        filteredPropResults.forEach(prop => {
          if (!sportBreakdown[prop.league]) {
            sportBreakdown[prop.league] = { sport: prop.league, wins: 0, losses: 0, pushes: 0 };
          }
          
          if (prop.result_status === 'won') sportBreakdown[prop.league].wins++;
          else if (prop.result_status === 'lost') sportBreakdown[prop.league].losses++;
          else if (prop.result_status === 'push') sportBreakdown[prop.league].pushes++;
        });
        
        // Group by prop type using filtered prop results
        const propTypeBreakdown = {};
        filteredPropResults.forEach(prop => {
          if (!propTypeBreakdown[prop.prop_type]) {
            propTypeBreakdown[prop.prop_type] = { 
              propType: prop.prop_type, 
              count: 0, 
              wins: 0, 
              losses: 0, 
              pushes: 0 
            };
          }
          
          propTypeBreakdown[prop.prop_type].count++;
          if (prop.result_status === 'won') propTypeBreakdown[prop.prop_type].wins++;
          else if (prop.result_status === 'lost') propTypeBreakdown[prop.prop_type].losses++;
          else if (prop.result_status === 'push') propTypeBreakdown[prop.prop_type].pushes++;
        });
        
        // Find most profitable prop type
        let mostProfitablePropType = { propType: 'N/A', winRate: 0 };
        Object.values(propTypeBreakdown).forEach(pt => {
          const ptWinRate = (pt.wins + pt.losses) > 0 ? (pt.wins / (pt.wins + pt.losses)) : 0;
          if (pt.count >= 3 && ptWinRate > mostProfitablePropType.winRate) {
            mostProfitablePropType = { 
              propType: pt.propType, 
              winRate: ptWinRate,
              displayRate: `+${(ptWinRate * 100).toFixed(1)}%`
            };
          }
        });
        
        // Find best win (most recent win)
        const winningProps = propResults.filter(prop => prop.result_status === 'won');
        let topWin = null;
        
        if (winningProps.length > 0) {
          // Sort by date (most recent first)
          const sortedWins = [...winningProps].sort(
            (a, b) => new Date(b.created_at) - new Date(a.created_at)
          );
          
          const bestProp = sortedWins[0];
          
          topWin = {
            player: bestProp.player_name,
            pick: `${bestProp.prop_type} ${bestProp.pick_direction} ${bestProp.prop_line}`,
            result: bestProp.actual_result,
            date: new Date(bestProp.created_at),
            winAmount: 100 // Default win amount for props
          };
        }
        
        setBestWin(topWin);
        
        setStats({
          record: `${wins}-${losses}${pushes > 0 ? `-${pushes}` : ''}`,
          totalBets: total,
          totalWins: wins,
          totalLosses: losses,
          pushes,
          winRate,
          sportPerformance: Object.values(sportBreakdown),
          propTypePerformance: Object.values(propTypeBreakdown),
          mostProfitablePropType
        });
        
      } catch (err) {
        console.error('Error processing prop results data:', err);
        setError('Failed to load prop results. Please try again later.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [selectedTimeFrame]);

  // Helper function to format date
  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#b8953f]"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen font-sans pt-16">
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
      
      <div className="max-w-screen-2xl !mx-auto !px-8 !py-8 border-x border-gray-700/30 shadow-lg backdrop-blur-sm relative z-10" style={{ maxWidth: '1792px', padding: '2rem' }}>
        {/* Header with GARY A.I. and garymoney image */}
        <div className="billfold-header mb-8 relative">
          <div className="flex items-center justify-between space-x-8">
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
              className="h-32 w-auto object-contain opacity-90 animate-float" 
              style={{ 
                filter: 'drop-shadow(0 0 8px rgba(184, 149, 63, 0.3))',
                marginBottom: '-1.5rem',
                position: 'relative',
                zIndex: 5
              }}
            />
          </div>
          
          {/* Toggle between Game Picks and Prop Picks */}
          <div className="flex justify-center mt-6 mb-8">
            <div className="inline-flex rounded-md shadow-sm" role="group">
              <button
                type="button"
                onClick={() => window.location.href = '/billfold'}
                className="px-6 py-2 text-sm font-medium rounded-l-lg bg-gray-800 text-gray-300 hover:bg-gray-700 focus:z-10 focus:ring-2 focus:ring-[#b8953f] focus:ring-opacity-50 transition-colors"
              >
                Game Picks
              </button>
              <button
                type="button"
                className="px-6 py-2 text-sm font-medium rounded-r-lg bg-[#b8953f] text-gray-900 font-bold focus:z-10 focus:ring-2 focus:ring-[#b8953f] focus:ring-opacity-50 transition-colors"
              >
                Prop Picks
              </button>
            </div>
          </div>
        </div>
      
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* RECORD */}
        <div className="prop-picks-card p-6">
          <h5 className="text-xs uppercase tracking-wider text-gray-400 mb-2">RECORD</h5>
          <div className="font-bold text-4xl" style={{ color: '#b8953f' }}>
            {stats.record}
          </div>
          <div className="text-sm text-gray-400 mt-1">
            {stats.totalBets} total picks
          </div>
        </div>
        
        {/* WIN RATE */}
        <div className="prop-picks-card p-6">
          <h5 className="text-xs uppercase tracking-wider text-gray-400 mb-2">WIN RATE</h5>
          <div className="font-bold text-4xl" style={{ color: '#b8953f' }}>
            {(stats.winRate * 100).toFixed(1)}%
          </div>
          <div className="text-sm text-gray-400 mt-1">
            {stats.totalWins} wins • {stats.totalLosses} losses
          </div>
        </div>
        
        {/* TOP WIN */}
        <div className={`prop-picks-card p-6 ${!bestWin ? 'flex items-center justify-center' : ''}`}>
          {bestWin ? (
            <>
              <h5 className="text-xs uppercase tracking-wider text-gray-400 mb-2">TOP WIN</h5>
              <div className="font-bold text-xl mb-1" style={{ color: '#b8953f' }}>
                {bestWin.player}
              </div>
              <div className="text-sm text-gray-300 mb-3">
                {bestWin.pick}
              </div>
              <div className="inline-flex items-center px-4 py-2 rounded-full text-gray-900 font-bold text-sm" 
                   style={{ background: 'linear-gradient(135deg, #b8953f, #d4af37)' }}>
                <span>+${bestWin.winAmount}</span>
              </div>
            </>
          ) : (
            <div className="text-gray-500 text-sm">No winning props yet</div>
          )}
        </div>
      </div>
      
      {/* Recent Picks */}
      <div className="prop-picks-card overflow-hidden mb-8">
        <div className="prop-picks-header">
          <h3 className="text-lg font-bold text-gray-200">RECENT PROP PICKS</h3>
          <p className="text-sm text-gray-400 mt-1">Track your player prop bet performance</p>
        </div>
        <div className="prop-picks-scroll">
          <table className="prop-picks-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Player</th>
                <th>Team</th>
                <th>Prop</th>
                <th>Pick</th>
                <th className="text-right">Result</th>
              </tr>
            </thead>
            <tbody>
              {bettingLog.length > 0 ? (
                bettingLog.map((bet, index) => (
                  <tr key={index} className="hover:bg-gray-800/50 transition-colors">
                    <td className="text-gray-400 whitespace-nowrap">
                      {formatDate(bet.date)}
                    </td>
                    <td className="font-medium text-gray-100">
                      {bet.player}
                    </td>
                    <td className="text-gray-400">
                      {bet.team}
                    </td>
                    <td className="text-gray-400 capitalize">
                      {bet.propType?.toLowerCase()}
                    </td>
                    <td>
                      <div className="flex items-center">
                        <span className="inline-block w-2 h-2 rounded-full bg-[#b8953f] mr-2"></span>
                        <span className="text-gray-200">{bet.pick}</span>
                      </div>
                    </td>
                    <td className="text-right">
                      <span className={`status-badge status-${bet.result?.toLowerCase()} inline-block`}>
                        {bet.result?.toUpperCase() || 'PENDING'}
                      </span>
                      {bet.actualResult !== null && (
                        <div className="text-xs text-gray-500 mt-1">
                          Actual: {bet.actualResult}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-gray-500">
                    No prop picks found for the selected time period
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Performance Breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Sport Performance */}
        <div className="prop-picks-card overflow-hidden">
          <div className="prop-picks-header">
            <h3 className="text-lg font-bold text-gray-200">SPORT PERFORMANCE</h3>
            <p className="text-sm text-gray-400 mt-1">Win rates by sport</p>
          </div>
          <div className="p-6">
            {stats.sportPerformance.length > 0 ? (
              stats.sportPerformance.map((sport, index) => {
                const totalGames = sport.wins + sport.losses + sport.pushes;
                const winRate = totalGames > 0 ? (sport.wins / (sport.wins + sport.losses) * 100) : 0;
                
                return (
                  <div key={index} className="mb-6 last:mb-0">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium text-gray-200">{sport.sport}</span>
                      <span className="text-sm text-gray-400">
                        {sport.wins}W - {sport.losses}L{sport.pushes > 0 ? ` - ${sport.pushes}P` : ''}
                      </span>
                    </div>
                    <div className="performance-bar">
                      <div 
                        className="performance-bar-fill" 
                        style={{
                          width: `${winRate}%`
                        }}
                      ></div>
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-xs text-gray-500">
                        {totalGames} total picks
                      </span>
                      <span className="text-xs font-medium" style={{ color: '#b8953f' }}>
                        {winRate.toFixed(1)}% Win Rate
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-8 text-gray-500">
                No sport performance data available
              </div>
            )}
          </div>
        </div>
        
        {/* Prop Type Performance */}
        <div className="prop-picks-card overflow-hidden">
          <div className="prop-picks-header">
            <h3 className="text-lg font-bold text-gray-200">PROP TYPE PERFORMANCE</h3>
            <p className="text-sm text-gray-400 mt-1">Win rates by prop type</p>
          </div>
          <div className="p-6">
            {stats.propTypePerformance.length > 0 ? (
              stats.propTypePerformance.map((propType, index) => {
                const totalBets = propType.wins + propType.losses + propType.pushes;
                const winRate = (propType.wins + propType.losses) > 0 ? 
                  (propType.wins / (propType.wins + propType.losses) * 100) : 0;
                
                return (
                  <div key={index} className="mb-6 last:mb-0">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium text-gray-200 capitalize">
                        {propType.propType.toLowerCase()}
                      </span>
                      <span className="text-sm text-gray-400">
                        {propType.wins}W - {propType.losses}L{propType.pushes > 0 ? ` - ${propType.pushes}P` : ''}
                      </span>
                    </div>
                    <div className="performance-bar">
                      <div 
                        className="performance-bar-fill" 
                        style={{
                          width: `${winRate}%`
                        }}
                      ></div>
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-xs text-gray-500">
                        {totalBets} total bets
                      </span>
                      <span className="text-xs font-medium" style={{ color: '#b8953f' }}>
                        {winRate.toFixed(1)}% Win Rate
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-8 text-gray-500">
                No prop type performance data available
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};

export default PropPicks;
