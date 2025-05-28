import React, { useState, useEffect } from 'react';
import { garyPerformanceService } from '../services/garyPerformanceService';
import { userPickResultsService } from '../services/userPickResultsService';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import '../styles/BillfoldEnhanced.css'; // Consolidated high-tech modern styling
import '../styles/BillfoldScroll.css'; // Custom scrolling for Recent Picks

export const Billfold = () => {
  // Get user from auth context
  const { user } = useAuth();
  
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

  // State for user's betting record
  const [userRecord, setUserRecord] = useState({
    record: '0-0-0',
    win_rate: 0,
    total_picks: 0,
    current_streak: 0
  });

  // State for betting log/history
  const [bettingLog, setBettingLog] = useState([]);
  
  // State for combined bet type distribution (to show on both tabs)
  const [betTypeDistribution, setBetTypeDistribution] = useState([]);

  // State for best win (for featured Top Win section)
  const [bestWin, setBestWin] = useState(null);

  // State for loading
  const [isLoading, setIsLoading] = useState(true);

  // State for error
  const [error, setError] = useState(null);

  // State for yesterday's record
  const [yesterdayRecord, setYesterdayRecord] = useState('');

  // State for selected time period filter
  const [selectedTimeFrame, setSelectedTimeFrame] = useState('all');
  
  // State for toggling between game picks and prop picks
  const [showPicksType, setShowPicksType] = useState('games'); // 'games' or 'props'

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

  // Fetch data directly from Supabase game_results and prop_results tables
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        // Prepare date filter
        let dateFilter = null;
        if (selectedTimeFrame !== 'all') {
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
        }
        
        // STEP 1: Fetch game results
        let gameQuery = supabase.from('game_results').select('*');
        if (dateFilter) {
          gameQuery = gameQuery.gte('game_date', dateFilter.toISOString());
        }
        const { data: gameResults, error: gameResultsError } = await gameQuery.order('game_date', { ascending: false });
        
        if (gameResultsError) {
          throw new Error(`Error fetching game results: ${gameResultsError.message}`);
        }
        
        // STEP 2: Fetch prop results
        let propQuery = supabase.from('prop_results').select('*');
        if (dateFilter) {
          propQuery = propQuery.gte('game_date', dateFilter.toISOString());
        }
        const { data: propResults, error: propResultsError } = await propQuery.order('game_date', { ascending: false });
        
        if (propResultsError) {
          throw new Error(`Error fetching prop results: ${propResultsError.message}`);
        }
        
        // Check if we have any results at all based on current tab
        const currentResults = showPicksType === 'games' ? gameResults : propResults;
        if (!currentResults || currentResults.length === 0) {
          setError(`No ${showPicksType === 'games' ? 'game' : 'prop'} results found. Check back later for updated picks.`);
          setIsLoading(false);
          return;
        }
        
        // For debugging - let's see what dates we're getting from Supabase
        if (gameResults?.length > 0) {
          console.log('Sample game_date from Supabase:', gameResults[0].game_date);
        }
        if (propResults?.length > 0) {
          console.log('Sample prop_date from Supabase:', propResults[0].game_date);
        }

        // STEP 3: Process game results
        const processedGameLog = gameResults ? gameResults.map(game => ({
          id: game.id,
          date: new Date(game.game_date),
          rawGameDate: game.game_date,  // Store the original date string
          sport: game.league,
          matchup: game.matchup,
          pick: game.pick_text,
          result: game.result,
          odds: game.odds,
          final_score: game.final_score,
          type: 'game' // Add type to distinguish from props
        })) : [];
        
        // STEP 4: Process prop results
        // Group prop results by date
        const propResultsByDate = {};
        if (propResults) {
          propResults.forEach(prop => {
            const gameDate = prop.game_date?.split('T')[0] || 'unknown';
            if (!propResultsByDate[gameDate]) {
              propResultsByDate[gameDate] = [];
            }
            propResultsByDate[gameDate].push(prop);
          });
        }
        
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
        
        // Map the limited prop results to our standard format
        const processedPropLog = limitedPropResults ? limitedPropResults.map(prop => ({
          id: prop.id,
          date: new Date(prop.game_date),
          rawGameDate: prop.game_date,  // Store the original date string
          sport: 'MLB', // Props are currently MLB only
          matchup: prop.matchup || 'Player Prop',
          player: prop.player_name,
          pick: prop.pick_text ? formatPropPickText(prop.pick_text) : `${prop.player_name} ${formatBetTypeName(prop.prop_type)} ${prop.bet || ''} ${prop.line_value}`,
          propType: prop.prop_type,
          line: prop.line_value,
          result: prop.result,
          odds: prop.odds,
          actual: prop.actual_value,
          bet: prop.bet, // over/under
          type: 'prop' // Add type to distinguish from games
        })) : [];
        
        // STEP 5: Store both betting logs for switching between tabs
        setBettingLog(showPicksType === 'games' ? processedGameLog : processedPropLog);
        
        // STEP 6: Calculate combined bet type distribution (to show on both tabs)
        const combinedBetTypeBreakdown = {};
        
        // Calculate yesterday's record from real data
        const calculateYesterdayRecord = () => {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayDateString = yesterday.toISOString().split('T')[0];
          
          let yesterdayWins = 0;
          let yesterdayLosses = 0;
          let yesterdayPushes = 0;
          
          // Count yesterday's game results only (no prop picks)
          if (gameResults) {
            gameResults.forEach(game => {
              const gameDate = game.game_date?.split('T')[0];
              if (gameDate === yesterdayDateString) {
                if (game.result === 'won') yesterdayWins++;
                else if (game.result === 'lost') yesterdayLosses++;
                else if (game.result === 'push') yesterdayPushes++;
              }
            });
          }
          
          // Set yesterday's record (games only)
          if (yesterdayWins > 0 || yesterdayLosses > 0 || yesterdayPushes > 0) {
            setYesterdayRecord(`${yesterdayWins}-${yesterdayLosses}${yesterdayPushes > 0 ? `-${yesterdayPushes}` : ''}`);
          } else {
            setYesterdayRecord('0-0');
          }
        };
        
        calculateYesterdayRecord();
        
        // Fetch user's betting record if user is logged in
        if (user?.id) {
          try {
            const userRecordData = await userPickResultsService.getUserRecord(user.id);
            setUserRecord(userRecordData);
          } catch (error) {
            console.error('Error fetching user record:', error);
            // Keep default values if error
          }
        }
        
        // Add game bet types to combined distribution
        if (gameResults) {
          gameResults.forEach(game => {
            const betType = determineBetType(game.pick_text);
            if (!combinedBetTypeBreakdown[betType]) {
              combinedBetTypeBreakdown[betType] = { betType, count: 0, wins: 0, losses: 0, pushes: 0 };
            }
            
            combinedBetTypeBreakdown[betType].count++;
            if (game.result === 'won') combinedBetTypeBreakdown[betType].wins++;
            else if (game.result === 'lost') combinedBetTypeBreakdown[betType].losses++;
            else if (game.result === 'push') combinedBetTypeBreakdown[betType].pushes++;
          });
        }
        
        // Add prop bet types to combined distribution
        if (propResults) {
          propResults.forEach(prop => {
            const propType = prop.prop_type || 'Player Prop';
            if (!combinedBetTypeBreakdown[propType]) {
              combinedBetTypeBreakdown[propType] = { betType: propType, count: 0, wins: 0, losses: 0, pushes: 0 };
            }
            
            combinedBetTypeBreakdown[propType].count++;
            if (prop.result === 'won') combinedBetTypeBreakdown[propType].wins++;
            else if (prop.result === 'lost') combinedBetTypeBreakdown[propType].losses++;
            else if (prop.result === 'push') combinedBetTypeBreakdown[propType].pushes++;
          });
        }
        
        // Calculate total bets for percentage calculation
        const totalAllBets = (gameResults?.length || 0) + (propResults?.length || 0);
        
        // Create the final bet type distribution array
        const betTypeDistributionArray = Object.values(combinedBetTypeBreakdown)
          .map(bt => ({
            ...bt,
            percentage: totalAllBets > 0 ? (bt.count / totalAllBets) * 100 : 0
          }))
          .sort((a, b) => b.count - a.count);
        
        // Find most profitable bet type overall
        let mostProfitableBetType = { betType: 'N/A', winRate: 0 };
        Object.values(combinedBetTypeBreakdown).forEach(bt => {
          const btWinRate = (bt.wins + bt.losses) > 0 ? (bt.wins / (bt.wins + bt.losses)) : 0;
          if (bt.count >= 3 && btWinRate > mostProfitableBetType.winRate) {
            mostProfitableBetType = { 
              betType: bt.betType, 
              winRate: btWinRate,
              displayRate: `+${(btWinRate * 100).toFixed(1)}%`
            };
          }
        });
        
        // Store the combined bet type distribution
        setBetTypeDistribution({
          betTypePerformance: betTypeDistributionArray,
          mostProfitableBetType
        });
        
        // STEP 7: Calculate tab-specific stats based on the selected tab (games or props)
        if (showPicksType === 'games') {
          // CALCULATE GAME STATS
          const gameWins = gameResults ? gameResults.filter(game => game.result === 'won').length : 0;
          const gameLosses = gameResults ? gameResults.filter(game => game.result === 'lost').length : 0;
          const gamePushes = gameResults ? gameResults.filter(game => game.result === 'push').length : 0;
          const totalGameBets = gameResults?.length || 0;
          const gameWinRate = totalGameBets > 0 ? (gameWins / totalGameBets) : 0;
          
          // Group game results by sport/league
          const sportBreakdown = {};
          if (gameResults) {
            gameResults.forEach(game => {
              if (!sportBreakdown[game.league]) {
                sportBreakdown[game.league] = { sport: game.league, wins: 0, losses: 0, pushes: 0 };
              }
              
              if (game.result === 'won') sportBreakdown[game.league].wins++;
              else if (game.result === 'lost') sportBreakdown[game.league].losses++;
              else if (game.result === 'push') sportBreakdown[game.league].pushes++;
            });
          }
          
          // Find best game win
          let topWin = null;
          const winningGames = gameResults.filter(game => game.result === 'won');
          
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
              rawGameDate: bestGame.game_date, // Store the original date string for display
              winAmount
            };
          }
          
          setBestWin(topWin);
          
          // Set game stats (using combined bet type distribution)
          setStats({
            record: `${gameWins}-${gameLosses}${gamePushes > 0 ? `-${gamePushes}` : ''}`,
            totalBets: totalGameBets,
            totalWins: gameWins,
            totalLosses: gameLosses,
            pushes: gamePushes,
            winLoss: gameWinRate,
            sportPerformance: Object.values(sportBreakdown),
            betTypePerformance: betTypeDistribution.betTypePerformance, // Use combined distribution
            mostProfitableBetType: betTypeDistribution.mostProfitableBetType // Use combined most profitable
          });
        } else {
          // CALCULATE PROP STATS
          const propWins = propResults ? propResults.filter(prop => prop.result === 'won').length : 0;
          const propLosses = propResults ? propResults.filter(prop => prop.result === 'lost').length : 0;
          const propPushes = propResults ? propResults.filter(prop => prop.result === 'push').length : 0;
          const totalPropBets = propResults?.length || 0;
          const propWinRate = totalPropBets > 0 ? (propWins / totalPropBets) : 0;
          
          // Find best prop win
          let topPropWin = null;
          const winningProps = propResults.filter(prop => prop.result === 'won');
          
          if (winningProps.length > 0) {
            // Sort by date (most recent first)
            const sortedWins = [...winningProps].sort(
              (a, b) => new Date(b.game_date) - new Date(a.game_date)
            );
            
            const bestProp = sortedWins[0];
            
            // Calculate win amount based on odds
            let winAmount = 100; // Default amount if odds not available
            
            if (bestProp.odds && typeof bestProp.odds === 'string') {
              const oddsValue = parseInt(bestProp.odds.replace(/[^0-9-]/g, ''));
              if (!isNaN(oddsValue)) {
                if (oddsValue > 0) {
                  winAmount = oddsValue;
                } else if (oddsValue < 0) {
                  winAmount = Math.round(10000 / Math.abs(oddsValue));
                }
              }
            }
            
            topPropWin = {
              matchup: bestProp.matchup || `${bestProp.player_name} Prop`,
              pick: bestProp.pick_text ? formatPropPickText(bestProp.pick_text) : `${bestProp.player_name} ${formatBetTypeName(bestProp.prop_type)} ${bestProp.bet || ''} ${bestProp.line_value}`,
              odds: bestProp.odds,
              date: new Date(bestProp.game_date),
              rawGameDate: bestProp.game_date, // Store the original date string for display
              winAmount
            };
          }
          
          setBestWin(topPropWin);
          
          // Set prop stats (using combined bet type distribution)
          setStats({
            record: `${propWins}-${propLosses}${propPushes > 0 ? `-${propPushes}` : ''}`,
            totalBets: totalPropBets,
            totalWins: propWins,
            totalLosses: propLosses,
            pushes: propPushes,
            winLoss: propWinRate,
            sportPerformance: [{ sport: 'MLB', wins: propWins, losses: propLosses, pushes: propPushes }],
            betTypePerformance: betTypeDistribution.betTypePerformance, // Use combined distribution
            mostProfitableBetType: betTypeDistribution.mostProfitableBetType // Use combined most profitable
          });
        }
        
        setIsLoading(false);
      } catch (err) {
        console.error('Error fetching Billfold data:', err);
        setError(`Error fetching data: ${err.message}`);
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, [selectedTimeFrame, showPicksType, user]); // Re-fetch when tab changes or user changes
  
  // Helper function to determine bet type based on pick text
  const determineBetType = (pickText) => {
    if (!pickText) return 'Unknown';
    
    const lowerText = pickText.toLowerCase();
    
    if (lowerText.includes('spread') || lowerText.includes('covering') || lowerText.includes('points')) {
      return 'Spread';
    }
    
    if (lowerText.includes('under') || lowerText.includes('over') || lowerText.includes('total') || lowerText.includes('o/u')) {
      return 'Total';
    }
    
    if (lowerText.includes('won') || lowerText.includes('win') || lowerText.includes('winner') || lowerText.includes('ml')) {
      return 'Moneyline';
    }
    
    if (lowerText.includes('parlay')) {
      return 'Parlay';
    }
    
    return 'Moneyline';
  };
  
  // Helper function to format bet type names (capitalize and replace underscores with spaces)
  const formatBetTypeName = (betType) => {
    if (!betType) return '';
    
    // Special cases for MLB prop types
    const specialCases = {
      'hits': 'Hits',
      'strikeouts': 'Strikeouts',
      'total_bases': 'Total Bases',
      'hits_runs_rbis': 'Hits Runs RBIs',
      'outs': 'Outs',
      'Player Prop': 'Player Prop'
    };
    
    // If we have a special case mapping, use it
    if (specialCases[betType]) {
      return specialCases[betType];
    }
    
    // Otherwise, split by underscores, capitalize each word, and join with spaces
    return betType
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };
  
  // Direct date formatting from raw Supabase dates
  const formatDateFromSupabase = (dateString) => {
    if (!dateString) return '';
    
    try {
      // Just parse the exact date parts from the ISO string
      // Format: 2023-05-17T00:00:00 -> May 17
      const dateParts = dateString.split('T')[0].split('-');
      const monthNum = parseInt(dateParts[1]); // 05 for May
      const day = parseInt(dateParts[2]);
      
      // Map month numbers to names directly without using Date object
      const monthNames = {
        1: 'Jan', 2: 'Feb', 3: 'Mar', 4: 'Apr', 5: 'May', 6: 'Jun',
        7: 'Jul', 8: 'Aug', 9: 'Sep', 10: 'Oct', 11: 'Nov', 12: 'Dec'
      };
      
      return `${monthNames[monthNum]} ${day}`;
    } catch (error) {
      console.error('Error parsing date:', error);
      return '';
    }
  };
  
  // Helper function to format prop pick text for display
  const formatPropPickText = (pickText) => {
    if (!pickText) return '';
    
    // If it already has proper capitalization, return as is
    if (pickText.includes('Total Bases') || pickText.includes('Hits Runs RBIs')) {
      return pickText;
    }
    
    // Special cases for MLB prop types to replace in the pick text
    const propTypeReplacements = {
      'total_bases': 'Total Bases',
      'hits_runs_rbis': 'Hits Runs RBIs',
      'hits': 'Hits',
      'strikeouts': 'Strikeouts',
      'outs': 'Outs'
    };
    
    // Replace each prop type in the pick text
    let formattedText = pickText;
    
    Object.keys(propTypeReplacements).forEach(propType => {
      // Create a regex that captures the prop type with word boundaries
      const regex = new RegExp(`\\b${propType}\\b`, 'gi');
      formattedText = formattedText.replace(regex, propTypeReplacements[propType]);
    });
    
    return formattedText;
  };
  
  // Toggle between game picks and prop picks
  const togglePicksView = () => {
    setShowPicksType(showPicksType === 'games' ? 'props' : 'games');
  };

  // Filter the betting log based on the selected type
  const filteredBettingLog = bettingLog.filter(bet => {
    return bet.type === (showPicksType === 'games' ? 'game' : 'prop');
  });

  // No longer needed as we're showing all picks within one component

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
      
      <div className="max-w-screen-2xl !mx-auto !px-8 !py-8 border-x border-gray-700/30 shadow-lg backdrop-blur-sm relative z-10" style={{ maxWidth: '1792px', padding: '2rem' }}>
        {/* Enhanced Header with GARY A.I. and garymoney image */}
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
                onClick={() => setShowPicksType('games')}
                className={`px-6 py-2 text-sm font-medium rounded-l-lg focus:z-10 focus:ring-2 focus:ring-[#b8953f] focus:ring-opacity-50 transition-colors ${
                  showPicksType === 'games' 
                    ? 'bg-[#b8953f] text-gray-900 font-bold' 
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                Game Picks
              </button>
              <button
                type="button"
                onClick={() => setShowPicksType('props')}
                className={`px-6 py-2 text-sm font-medium rounded-r-lg focus:z-10 focus:ring-2 focus:ring-[#b8953f] focus:ring-opacity-50 transition-colors ${
                  showPicksType === 'props' 
                    ? 'bg-[#b8953f] text-gray-900 font-bold' 
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                Prop Picks
              </button>
            </div>
          </div>
        </div>
        
        {/* Enhanced Key Metrics Row - Using fixed-width grid and improved typography */}
        <div className="gary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem', marginBottom: '3rem' }}>
          {/* RECORD - With enhanced styling */}
          <div className="gary-card-accent p-5">
            <h5 className="gary-text-small uppercase tracking-wider mb-1">RECORD</h5>
            <div className="font-bold" style={{ color: '#b8953f', fontSize: '3rem', lineHeight: '1', letterSpacing: '-0.02em' }}>{stats.record}</div>
            {/* Yesterday's Record */}
            <div className="mt-3 pt-2 border-t border-gray-700">
              <div className="text-xs uppercase tracking-wider text-gray-400 mb-1">YESTERDAY</div>
              <div className="font-semibold text-gray-300" style={{ fontSize: '1.2rem' }}>{yesterdayRecord || '0-0'}</div>
            </div>
          </div>
          
          {/* USER RECORD - Show user's betting performance */}
          {user && (
            <div className="gary-card-accent p-5">
              <h5 className="gary-text-small uppercase tracking-wider mb-1">YOUR RECORD</h5>
              <div className="font-bold" style={{ color: '#b8953f', fontSize: '3rem', lineHeight: '1', letterSpacing: '-0.02em' }}>{userRecord.record}</div>
              {/* User Stats */}
              <div className="mt-3 pt-2 border-t border-gray-700">
                <div className="flex justify-between items-center mb-2">
                  <div className="text-xs uppercase tracking-wider text-gray-400">WIN RATE</div>
                  <div className="font-semibold text-gray-300">{userRecord.win_rate}%</div>
                </div>
                {userRecord.current_streak !== 0 && (
                  <div className="flex justify-between items-center">
                    <div className="text-xs uppercase tracking-wider text-gray-400">STREAK</div>
                    <div className={`font-semibold ${userRecord.current_streak > 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {userRecord.current_streak > 0 ? '+' : ''}{userRecord.current_streak}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* WIN RATE - With enhanced styling */}
          <div className="gary-card-accent p-5">
            <h5 className="gary-text-small uppercase tracking-wider mb-1">WIN RATE</h5>
            <div className="font-bold" style={{ color: '#b8953f', fontSize: '3rem', lineHeight: '1', letterSpacing: '-0.02em' }}>{(stats.winLoss * 100)?.toFixed(1) || '41.9'}%</div>
            <div className="gary-flex mt-2" style={{ fontSize: 'var(--text-xs)' }}>
              <span style={{ color: 'var(--gary-text-tertiary)' }}>Last month: </span>
              <span className="ml-1 font-medium" style={{ color: 'var(--gary-text-secondary)' }}>38.5%</span>
              <span className="ml-2 text-green-500">↑</span>
            </div>
          </div>
          
          {/* TOP WIN CARD IN METRICS GRID */}
          {bestWin && (
            <div className="gary-card-accent p-5">
              <h5 className="gary-text-small uppercase tracking-wider mb-1">TOP WIN</h5>
              <div className="font-bold text-lg mb-1 overflow-hidden text-ellipsis" style={{ maxHeight: '48px', color: '#b8953f' }}>
                {bestWin.matchup || ''}
              </div>
              <div className="font-medium text-sm mb-2" style={{ color: 'var(--gary-text-tertiary)' }}>
                {formatPropPickText(bestWin.pick) || ''}
                {bestWin.odds && <span className="ml-1">{bestWin.odds}</span>}
              </div>
              <div className="text-xs mb-2" style={{ color: 'var(--gary-text-tertiary)' }}>
                {formatDateFromSupabase(bestWin.rawGameDate) || bestWin.date?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
              <div className="inline-block px-3 py-1 rounded text-black font-bold text-sm" style={{ backgroundColor: 'var(--gary-gold)' }}>
                +${bestWin.winAmount || 100}
              </div>
            </div>
          )}
        </div>
        
        {/* Recent Picks - now in a single column with improved spacing */}
        <div className="gary-grid" style={{ display: 'grid', marginBottom: '3rem', gap: '2rem' }}>
          {/* Recent Picks Table - Enhanced */}
          <div className="gary-card-accent overflow-hidden">
            <div className="gary-card-header">
              <h3 className="gary-text-accent font-bold text-lg tracking-wide mb-0">RECENT PICKS</h3>
            </div>
            {/* Fixed header table structure with proper sticky header */}
            <div className="table-container" style={{ position: 'relative', overflowY: 'auto', maxHeight: '400px' }}>
              <table className="gary-table w-full" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                <thead>
                  <tr>
                    <th className="sticky-header" style={{ position: 'sticky', top: 0, background: '#121212', zIndex: 10, padding: '1rem 1.5rem', borderBottom: '2px solid #000000' }}>DATE</th>
                    <th className="sticky-header" style={{ position: 'sticky', top: 0, background: '#121212', zIndex: 10, padding: '1rem 1.5rem', borderBottom: '2px solid #000000' }}>SPORT</th>
                    <th className="sticky-header" style={{ position: 'sticky', top: 0, background: '#121212', zIndex: 10, padding: '1rem 1.5rem', borderBottom: '2px solid #000000' }}>{showPicksType === 'props' ? 'ODDS' : 'MATCHUP'}</th>
                    <th className="sticky-header" style={{ position: 'sticky', top: 0, background: '#121212', zIndex: 10, padding: '1rem 1.5rem', borderBottom: '2px solid #000000' }}>PICK</th>
                    <th className="sticky-header" style={{ position: 'sticky', top: 0, background: '#121212', zIndex: 10, padding: '1rem 1.5rem', borderBottom: '2px solid #000000', textAlign: 'right' }}>RESULT</th>
                  </tr>
                </thead>
                <tbody>
                  {bettingLog.map((bet, index) => (
                  <tr key={index} className="border-b border-gray-700/50 hover:bg-gray-800/50 transition-colors">
                    <td style={{ padding: '1rem 1.5rem' }} className="py-4 px-6 text-gray-400">
                      {formatDateFromSupabase(bet.rawGameDate) || new Date(bet.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </td>
                    <td style={{ padding: '1rem 1.5rem' }} className="py-4 px-6 text-gray-400">{bet.sport}</td>
                    <td style={{ padding: '1rem 1.5rem' }} className="py-4 px-6 text-gray-200">{
                      showPicksType === 'props' ? 
                        (bet.odds || 'N/A') : 
                        (bet.matchup || 'Game not found')
                    }</td>
                    <td style={{ padding: '1rem 1.5rem' }} className="py-4 px-6">
                      <div className="flex items-center">
                        <span className="inline-block w-2 h-2 rounded-sm bg-[#b8953f]"></span>
                        <span className="ml-2 text-gray-200">{formatPropPickText(bet.pick) || 'No pick data'}</span>
                      </div>
                    </td>
                    <td style={{ padding: '1rem 1.5rem' }} className="py-4 px-6 text-right">
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

        </div>
          
        {/* Two-column layout for Sport Performance and Bet Type Distribution - Enhanced */}
        <div className="gary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '2rem', marginBottom: '3rem' }}>
          {/* Sport Performance - Enhanced */}
          <div className="gary-card-accent overflow-hidden">
            <div className="gary-card-header">
              <h3 className="gary-text-accent font-bold text-lg tracking-wide mb-0">SPORT PERFORMANCE</h3>
            </div>
            <div className="gary-card-body">
              {stats.sportPerformance.map((sport, index) => {
                // Calculate bar width based on real data
                const totalGames = sport.wins + sport.losses;
                const winPercentage = totalGames > 0 ? (sport.wins / totalGames * 100) : 0;
                
                // Get sport-specific color hints using CSS variables for consistency
                const getSportGradient = (sport) => {
                  switch(sport) {
                    case 'NBA': return 'linear-gradient(to right, rgba(201, 8, 42, 0.8), rgba(23, 64, 139, 0.8))';
                    case 'NFL': return 'linear-gradient(to right, rgba(1, 51, 105, 0.7), rgba(213, 10, 10, 0.7))';
                    case 'MLB': return 'linear-gradient(to right, rgba(0, 45, 114, 0.7), rgba(232, 24, 40, 0.7))';
                    case 'NHL': return 'linear-gradient(to right, rgba(0, 0, 0, 0.7), rgba(250, 70, 22, 0.7))';
                    default: return 'linear-gradient(to right, var(--gary-gold), var(--gary-gold-light))';
                  }
                };
                
                return (
                  <div key={index} className="mb-4 last:mb-0">
                    {/* Sport name and win-loss record */}
                    <div className="gary-flex-between mb-1">
                      <div className="font-bold text-sm" style={{ color: 'var(--gary-text-primary)' }}>{sport.sport}</div>
                      <div className="text-xs" style={{ color: 'var(--gary-text-tertiary)' }}>{sport.wins}W - {sport.losses}L</div>
                    </div>
                    
                    {/* Win percentage visualized */}
                    <div className="gary-progress-track">
                      <div 
                        className="h-full rounded-full"
                        style={{ 
                          width: `${winPercentage}%`, 
                          minWidth: '10px',
                          background: getSportGradient(sport.sport)
                        }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* Bet Type Distribution - Enhanced */}
          <div className="gary-card-accent overflow-hidden">
            <div className="gary-card-header">
              <h3 className="gary-text-accent font-bold text-lg tracking-wide mb-0">BET TYPE DISTRIBUTION</h3>
            </div>
            <div className="gary-card-body">
              <div className="gary-grid" style={{ gap: 'var(--space-md)' }}>
                {stats.betTypePerformance && stats.betTypePerformance.length > 0 ? stats.betTypePerformance.map((betType, index) => (
                  <div key={index} className="gary-flex-between">
                    <div className="gary-flex">
                      <div className="w-3 h-3 rounded-sm" 
                           style={{ 
                             backgroundColor: index === 0 ? 'var(--gary-gold)' : 
                                           index === 1 ? 'var(--gary-gold-light)' : 
                                           'var(--gary-gold-tint)' 
                           }}></div>
                      <span className="ml-3 font-medium" style={{ color: 'var(--gary-text-primary)' }}>{formatBetTypeName(betType.betType)}</span>
                    </div>
                    <div className="gary-flex">
                      <span className="font-medium" style={{ color: 'var(--gary-text-primary)' }}>{betType.count}</span>
                      <span className="text-sm ml-1" style={{ color: 'var(--gary-text-secondary)' }}>({Math.round(betType.percentage)}%)</span>
                    </div>
                  </div>
                )) : <div className="text-center py-3" style={{ color: 'var(--gary-text-tertiary)' }}>No bet type data available</div>}
              </div>
              
              <div className="mt-6 pt-6" style={{ borderTop: '1px solid var(--gary-border-secondary)' }}>
                <div className="text-center">
                  <div className="mb-2 text-sm" style={{ color: 'var(--gary-text-tertiary)' }}>MOST PROFITABLE BET TYPE</div>
                  {stats.mostProfitableBetType ? (
                    <div className="inline-block py-2 px-4 rounded-full" 
                         style={{ backgroundColor: 'var(--gary-gold-tint)', color: 'var(--gary-gold)' }}>
                      <span className="font-bold">{formatBetTypeName(stats.mostProfitableBetType.betType)} {stats.mostProfitableBetType.displayRate}</span>
                    </div>
                  ) : (
                    <div className="inline-block py-2 px-4 rounded-full" 
                         style={{ backgroundColor: 'var(--gary-gold-tint)', color: 'var(--gary-gold)' }}>
                      <span className="font-bold">No data available</span>
                    </div>
                  )}
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
