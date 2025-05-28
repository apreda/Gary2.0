import React, { useState, useEffect } from 'react';
import { ArrowLeft, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { picksService } from '../services/picksService';
import { supabase } from '../supabaseClient';
import BG2 from '/BG2.png';

const WhatGaryThinks = () => {
  const navigate = useNavigate();
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [activeTab, setActiveTab] = useState('NBA');

  useEffect(() => {
    loadGaryThoughts();
  }, []);

  const loadGaryThoughts = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('🧠 Loading What Gary Thinks...');
      
      // Get today's date in EST
      const today = new Date();
      const estOptions = { timeZone: 'America/New_York' };
      const estDateString = today.toLocaleDateString('en-US', estOptions);
      const [month, day, year] = estDateString.split('/');
      const todayDateString = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      
      console.log(`🧠 Checking for existing Gary thoughts for ${todayDateString}`);
      
      // Check if we already have Gary's thoughts for today
      const { data: existingThoughts, error: fetchError } = await supabase
        .from('gary_thoughts')
        .select('thoughts, created_at')
        .eq('date', todayDateString)
        .single();
      
      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('Error fetching existing Gary thoughts:', fetchError);
      }
      
      // If we have existing thoughts for today, use them
      if (existingThoughts && existingThoughts.thoughts) {
        console.log('✅ Found existing Gary thoughts for today, using cached data');
        try {
          const cachedThoughts = typeof existingThoughts.thoughts === 'string' 
            ? JSON.parse(existingThoughts.thoughts) 
            : existingThoughts.thoughts;
          
          if (cachedThoughts && Array.isArray(cachedThoughts) && cachedThoughts.length > 0) {
            console.log(`✅ Loaded ${cachedThoughts.length} cached games from database`);
            setGames(cachedThoughts);
            setLastUpdated(new Date(existingThoughts.created_at));
            return;
          }
        } catch (parseError) {
          console.error('Error parsing cached thoughts:', parseError);
        }
      }
      
      console.log('🧠 No existing thoughts found, generating new Gary thoughts...');
      
      // Generate Gary's thoughts for all games
      const garyThoughts = await picksService.generateWhatGaryThinks();
      
      if (garyThoughts && garyThoughts.length > 0) {
        setGames(garyThoughts);
        setLastUpdated(new Date());
        
        // Store in Supabase
        await storeGaryThoughts(garyThoughts, todayDateString);
      } else {
        setError('No games found for today');
      }
    } catch (err) {
      console.error('Error loading Gary thoughts:', err);
      setError('Failed to load Gary\'s thoughts. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const storeGaryThoughts = async (thoughts, dateString) => {
    try {
      console.log(`🗄️ Storing Gary thoughts for ${dateString} (${thoughts.length} games)`);
      
      const { error } = await supabase
        .from('gary_thoughts')
        .upsert({
          date: dateString,
          thoughts: JSON.stringify(thoughts),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'date'
        });

      if (error) {
        console.error('Error storing Gary thoughts:', error);
        throw error;
      } else {
        console.log(`✅ Gary thoughts stored successfully for ${dateString}`);
      }
    } catch (err) {
      console.error('Error storing Gary thoughts:', err);
      // Don't throw here - we still want to show the picks even if storage fails
    }
  };

  // Filter games by active tab
  const getFilteredGames = () => {
    if (!games || games.length === 0) return [];
    
    return games.filter(game => {
      const gameLeague = game.league?.toUpperCase();
      return gameLeague === activeTab;
    });
  };

  // Helper function to format odds with proper + and - signs
  const formatOdds = (odds) => {
    if (!odds || odds === 'N/A') return odds;
    
    // Convert to string
    const oddsStr = String(odds);
    
    // If it already has a + or -, return as is
    if (oddsStr.startsWith('+') || oddsStr.startsWith('-')) {
      return oddsStr;
    }
    
    // Parse as number
    const oddsNum = parseFloat(oddsStr);
    
    // If it's a valid number, format it properly
    if (!isNaN(oddsNum)) {
      return oddsNum >= 0 ? `+${oddsNum}` : `${oddsNum}`;
    }
    
    // Return original if not a number
    return odds;
  };

  const GameCard = ({ game }) => {
    const { homeTeam, awayTeam, odds, garyPicks, league, time } = game;
    
    return (
      <div className="relative group mb-4">
        {/* Card with clean design matching site color scheme */}
        <div 
          className="rounded-lg border transition-all duration-300"
          style={{ 
            backgroundColor: 'rgba(18, 18, 18, 0.85)', 
            border: '1px solid rgba(51, 51, 51, 0.6)',
            backdropFilter: 'blur(10px)',
          }}
        >
          {/* League Header */}
          <div className="flex justify-start items-center px-4 py-3 border-b border-gray-700">
            <div 
              className="px-2 py-1 rounded text-xs font-bold uppercase tracking-wide"
              style={{ backgroundColor: '#d4af37', color: '#000' }}
            >
              {league}
            </div>
          </div>

          {/* Teams and Betting Grid */}
          <div className="p-4">
            {/* Column Headers */}
            <div className="grid grid-cols-12 gap-3 items-center mb-4 pb-2">
              <div className="col-span-5"></div>
              <div className="col-span-2 text-center">
                <span className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Spread</span>
              </div>
              <div className="col-span-2 text-center">
                <span className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Money Line</span>
              </div>
              <div className="col-span-3 text-center">
                <span className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Total Points</span>
              </div>
            </div>

            {/* Away Team Row */}
            <div className="grid grid-cols-12 gap-3 items-center mb-3">
              {/* Team Info */}
              <div className="col-span-5 flex items-center space-x-3">
                <div className="w-6 h-6 rounded-full bg-gray-600 flex items-center justify-center">
                  <span className="text-xs font-bold text-white">
                    {awayTeam.charAt(0)}
                  </span>
                </div>
                <span className="text-white font-medium text-sm">{awayTeam}</span>
              </div>
              
              {/* Spread */}
              <div className="col-span-2">
                <BettingOption
                  topLine={formatOdds(odds?.spread?.away?.line) || 'N/A'}
                  bottomLine={formatOdds(odds?.spread?.away?.odds) || 'N/A'}
                  isSelected={garyPicks?.spread === 'away'}
                />
              </div>
              
              {/* Moneyline */}
              <div className="col-span-2">
                <BettingOption
                  topLine={formatOdds(odds?.moneyline?.away) || 'N/A'}
                  bottomLine=""
                  isSelected={garyPicks?.moneyline === 'away'}
                  singleLine={true}
                />
              </div>
              
              {/* Total */}
              <div className="col-span-3">
                <BettingOption
                  topLine={`O ${odds?.total?.line || 'N/A'}`}
                  bottomLine={formatOdds(odds?.total?.over) || 'N/A'}
                  isSelected={garyPicks?.total === 'over'}
                />
              </div>
            </div>

            {/* Home Team Row */}
            <div className="grid grid-cols-12 gap-3 items-center mb-4">
              {/* Team Info */}
              <div className="col-span-5 flex items-center space-x-3">
                <div className="w-6 h-6 rounded-full bg-gray-600 flex items-center justify-center">
                  <span className="text-xs font-bold text-white">
                    {homeTeam.charAt(0)}
                  </span>
                </div>
                <span className="text-white font-medium text-sm">{homeTeam}</span>
              </div>
              
              {/* Spread */}
              <div className="col-span-2">
                <BettingOption
                  topLine={formatOdds(odds?.spread?.home?.line) || 'N/A'}
                  bottomLine={formatOdds(odds?.spread?.home?.odds) || 'N/A'}
                  isSelected={garyPicks?.spread === 'home'}
                />
              </div>
              
              {/* Moneyline */}
              <div className="col-span-2">
                <BettingOption
                  topLine={formatOdds(odds?.moneyline?.home) || 'N/A'}
                  bottomLine=""
                  isSelected={garyPicks?.moneyline === 'home'}
                  singleLine={true}
                />
              </div>
              
              {/* Total */}
              <div className="col-span-3">
                <BettingOption
                  topLine={`U ${odds?.total?.line || 'N/A'}`}
                  bottomLine={formatOdds(odds?.total?.under) || 'N/A'}
                  isSelected={garyPicks?.total === 'under'}
                />
              </div>
            </div>

            {/* Game Time */}
            <div className="text-center pt-2 border-t border-gray-700">
              <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">
                {time || 'TBD'}
              </span>
            </div>
          </div>

          {/* Gary's Rationale */}
          {garyPicks?.rationale && (
            <div className="px-4 pb-4">
              <div className="mt-4 pt-4 border-t border-gray-700">
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <div 
                      className="px-2 py-1 rounded text-xs font-bold uppercase"
                      style={{ backgroundColor: '#d4af37', color: '#000' }}
                    >
                      Gary's Analysis
                    </div>
                  </div>
                  <p className="text-sm text-gray-300 leading-relaxed italic">
                    "{garyPicks.rationale}"
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const BettingOption = ({ topLine, bottomLine, isSelected, singleLine = false }) => {
    return (
      <div className={`
        px-2 py-3 rounded text-center transition-all duration-300 cursor-pointer h-16 flex flex-col justify-center
        ${isSelected 
          ? 'text-black font-bold' 
          : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
        }
      `}
      style={isSelected ? { 
        backgroundColor: '#d4af37', 
        color: '#000'
      } : { backgroundColor: '#333' }}
      >
        <div className="text-sm font-semibold">
          {topLine}
        </div>
        {!singleLine && bottomLine && (
          <div className={`text-xs mt-1 ${isSelected ? 'text-black' : 'text-gray-400'}`}>
            {bottomLine}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ position: 'relative', minHeight: '100vh', width: '100vw' }}>
        {/* Lighter, more vibrant background */}
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            zIndex: 0,
            pointerEvents: 'none',
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 25%, #0f3460 50%, #533483 75%, #7209b7 100%)',
          }}
        />
        
        {/* Animated background elements */}
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            zIndex: 1,
            pointerEvents: 'none',
            background: `radial-gradient(circle at 20% 80%, rgba(212, 175, 55, 0.1) 0%, transparent 50%),
                        radial-gradient(circle at 80% 20%, rgba(212, 175, 55, 0.08) 0%, transparent 50%),
                        radial-gradient(circle at 40% 40%, rgba(255, 255, 255, 0.02) 0%, transparent 50%)`,
          }}
        />
        
        <div className="w-full flex flex-col items-center justify-center pt-32 pb-6 px-4 relative" style={{ minHeight: '100vh', zIndex: 2 }}>
          <div className="mx-auto max-w-md text-center py-4 px-6 rounded-lg" style={{ backgroundColor: 'rgba(18, 18, 18, 0.9)', border: '3px solid #d4af37', backdropFilter: 'blur(10px)' }}>
            <div className="py-2 -mx-6 mb-4" style={{ backgroundColor: '#d4af37' }}>
              <h3 className="font-bold text-black">LOADING GARY'S THOUGHTS...</h3>
            </div>
            <p className="text-yellow-500 mb-4">Gary is analyzing today's games...</p>
            <div className="flex justify-center">
              <div className="w-8 h-8 border-t-2 border-b-2 border-[#d4af37] rounded-full animate-spin"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', minHeight: '100vh', width: '100vw' }}>
      {/* Lighter, more vibrant background */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 0,
          pointerEvents: 'none',
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 25%, #0f3460 50%, #533483 75%, #7209b7 100%)',
        }}
      />
      
      {/* Animated background elements */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 1,
          pointerEvents: 'none',
          background: `radial-gradient(circle at 20% 80%, rgba(212, 175, 55, 0.1) 0%, transparent 50%),
                      radial-gradient(circle at 80% 20%, rgba(212, 175, 55, 0.08) 0%, transparent 50%),
                      radial-gradient(circle at 40% 40%, rgba(255, 255, 255, 0.02) 0%, transparent 50%)`,
        }}
      />
      
      {/* Floating orbs for depth */}
      <div
        style={{
          position: 'fixed',
          top: '15%',
          left: '10%',
          width: '300px',
          height: '300px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(212, 175, 55, 0.06) 0%, transparent 70%)',
          filter: 'blur(60px)',
          animation: 'float 6s ease-in-out infinite',
          zIndex: 1,
          pointerEvents: 'none',
        }}
      />
      
      <div
        style={{
          position: 'fixed',
          bottom: '20%',
          right: '15%',
          width: '400px',
          height: '400px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(114, 9, 183, 0.04) 0%, transparent 70%)',
          filter: 'blur(80px)',
          animation: 'float 8s ease-in-out infinite reverse',
          zIndex: 1,
          pointerEvents: 'none',
        }}
      />
      
      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) translateX(0px); }
          33% { transform: translateY(-20px) translateX(10px); }
          66% { transform: translateY(10px) translateX(-5px); }
        }
      `}</style>

      {/* Main content */}
      <div className="w-full flex flex-col items-center justify-center pt-32 pb-6 px-4 relative" style={{ minHeight: '100vh', zIndex: 2 }}>
        {/* Header */}
        <div className="w-full max-w-4xl mx-auto mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/')}
                className="p-2 rounded transition-all duration-300"
                style={{ backgroundColor: '#d4af37', color: '#000' }}
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h1 className="text-3xl font-bold" style={{ color: '#d4af37' }}>
                  What Gary Thinks
                </h1>
                <p className="text-gray-400 mt-1">Gary's picks for every game today</p>
              </div>
            </div>
            
            <button
              onClick={loadGaryThoughts}
              disabled={loading}
              className="flex items-center space-x-2 px-4 py-2 rounded font-medium transition-all duration-300 disabled:opacity-50"
              style={{ backgroundColor: '#d4af37', color: '#000' }}
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>

          {/* Sport Tabs */}
          <div className="flex justify-center mb-6">
            <div className="flex space-x-1 p-1 rounded-lg" style={{ backgroundColor: '#333' }}>
              {['NBA', 'MLB', 'NHL'].map((sport) => (
                <button
                  key={sport}
                  onClick={() => setActiveTab(sport)}
                  className={`px-6 py-2 rounded-md font-medium transition-all duration-300 ${
                    activeTab === sport 
                      ? 'text-black font-bold' 
                      : 'text-gray-300 hover:text-white'
                  }`}
                  style={activeTab === sport ? { 
                    backgroundColor: '#d4af37' 
                  } : {}}
                >
                  {sport}
                </button>
              ))}
            </div>
          </div>

          {/* Last Updated */}
          {lastUpdated && (
            <div className="text-center mb-6">
              <p className="text-sm text-gray-400">
                Last updated: {lastUpdated.toLocaleTimeString()}
              </p>
            </div>
          )}
        </div>

        {/* Error State */}
        {error && (
          <div className="w-full max-w-4xl mx-auto mb-6">
            <div className="mx-auto max-w-md text-center py-4 px-6 rounded-lg" style={{ backgroundColor: 'rgba(18, 18, 18, 0.9)', border: '3px solid #d4af37', backdropFilter: 'blur(10px)' }}>
              <div className="py-2 -mx-6 mb-4" style={{ backgroundColor: '#d4af37' }}>
                <h3 className="font-bold text-black">ERROR</h3>
              </div>
              <p className="text-red-400 mb-4">{error}</p>
              <button 
                onClick={loadGaryThoughts}
                className="px-4 py-2 font-bold uppercase text-black rounded transition-all duration-300 hover:scale-105" 
                style={{ backgroundColor: '#d4af37' }}
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {/* Games List */}
        {(() => {
          const filteredGames = getFilteredGames();
          return filteredGames.length > 0 ? (
            <div className="w-full max-w-4xl mx-auto">
              <div className="space-y-4">
                {filteredGames.map((game, index) => (
                  <GameCard key={`${game.id}-${index}`} game={game} />
                ))}
              </div>
            </div>
          ) : games.length > 0 ? (
            <div className="text-center py-12">
              <div className="mx-auto max-w-md text-center py-4 px-6 rounded-lg" style={{ backgroundColor: 'rgba(18, 18, 18, 0.9)', border: '3px solid #d4af37', backdropFilter: 'blur(10px)' }}>
                <div className="py-2 -mx-6 mb-4" style={{ backgroundColor: '#d4af37' }}>
                  <h3 className="font-bold text-black">NO {activeTab} GAMES TODAY</h3>
                </div>
                <p className="text-gray-400 mb-4">No {activeTab} games found for today</p>
                <p className="text-gray-500 text-sm">Try selecting a different sport</p>
              </div>
            </div>
                      ) : !loading && (
            <div className="text-center py-12">
              <div className="mx-auto max-w-md text-center py-4 px-6 rounded-lg" style={{ backgroundColor: 'rgba(18, 18, 18, 0.9)', border: '3px solid #d4af37', backdropFilter: 'blur(10px)' }}>
                <div className="py-2 -mx-6 mb-4" style={{ backgroundColor: '#d4af37' }}>
                  <h3 className="font-bold text-black">NO GAMES TODAY</h3>
                </div>
                <p className="text-gray-400 mb-4">No games found for today</p>
                <p className="text-gray-500 text-sm">Check back later or try refreshing</p>
              </div>
            </div>
          );
        })()}

        {/* Legend */}
        {games.length > 0 && (
          <div className="w-full max-w-4xl mx-auto mt-8">
            <div 
              className="p-4 rounded border"
              style={{ backgroundColor: 'rgba(18, 18, 18, 0.85)', border: '1px solid rgba(51, 51, 51, 0.6)', backdropFilter: 'blur(10px)' }}
            >
              <h3 className="text-lg font-bold mb-3" style={{ color: '#d4af37' }}>Legend</h3>
              <div className="flex flex-wrap gap-6 text-sm">
                <div className="flex items-center space-x-2">
                  <div 
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: '#d4af37' }}
                  ></div>
                  <span className="text-gray-300 font-medium">Gary's Pick</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div 
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: '#333' }}
                  ></div>
                  <span className="text-gray-300 font-medium">Available Option</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WhatGaryThinks; 