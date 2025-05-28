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

  useEffect(() => {
    loadGaryThoughts();
  }, []);

  const loadGaryThoughts = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('🧠 Loading What Gary Thinks...');
      
      // Generate Gary's thoughts for all games
      const garyThoughts = await picksService.generateWhatGaryThinks();
      
      if (garyThoughts && garyThoughts.length > 0) {
        setGames(garyThoughts);
        setLastUpdated(new Date());
        
        // Store in Supabase
        await storeGaryThoughts(garyThoughts);
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

  const storeGaryThoughts = async (thoughts) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const { error } = await supabase
        .from('gary_thoughts')
        .upsert({
          date: today,
          thoughts: JSON.stringify(thoughts),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'date'
        });

      if (error) {
        console.error('Error storing Gary thoughts:', error);
      } else {
        console.log('✅ Gary thoughts stored successfully');
      }
    } catch (err) {
      console.error('Error storing Gary thoughts:', err);
    }
  };

  const GameCard = ({ game }) => {
    const { homeTeam, awayTeam, odds, garyPicks, league, time } = game;
    
    return (
      <div className="relative group mb-4">
        {/* Card with clean design matching screenshot */}
        <div 
          className="rounded-lg border transition-all duration-300"
          style={{ 
            backgroundColor: '#1a1a1a', 
            border: '1px solid #333',
          }}
        >
          {/* Game Time Header */}
          <div className="flex justify-between items-center px-4 py-3 border-b border-gray-700">
            <div 
              className="px-2 py-1 rounded text-xs font-bold uppercase tracking-wide"
              style={{ backgroundColor: '#00d4aa', color: '#000' }}
            >
              {league}
            </div>
            <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">
              {time || 'TBD'}
            </span>
          </div>

          {/* Teams and Betting Grid */}
          <div className="p-4">
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
                  topLine={odds?.spread?.away?.line || 'N/A'}
                  bottomLine={odds?.spread?.away?.odds || 'N/A'}
                  isSelected={garyPicks?.spread === 'away'}
                />
              </div>
              
              {/* Moneyline */}
              <div className="col-span-2">
                <BettingOption
                  topLine={odds?.moneyline?.away || 'N/A'}
                  bottomLine=""
                  isSelected={garyPicks?.moneyline === 'away'}
                  singleLine={true}
                />
              </div>
              
              {/* Total */}
              <div className="col-span-3">
                <BettingOption
                  topLine={`O ${odds?.total?.line || 'N/A'}`}
                  bottomLine={odds?.total?.over || 'N/A'}
                  isSelected={garyPicks?.total === 'over'}
                />
              </div>
            </div>

            {/* Home Team Row */}
            <div className="grid grid-cols-12 gap-3 items-center">
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
                  topLine={odds?.spread?.home?.line || 'N/A'}
                  bottomLine={odds?.spread?.home?.odds || 'N/A'}
                  isSelected={garyPicks?.spread === 'home'}
                />
              </div>
              
              {/* Moneyline */}
              <div className="col-span-2">
                <BettingOption
                  topLine={odds?.moneyline?.home || 'N/A'}
                  bottomLine=""
                  isSelected={garyPicks?.moneyline === 'home'}
                  singleLine={true}
                />
              </div>
              
              {/* Total */}
              <div className="col-span-3">
                <BettingOption
                  topLine={`U ${odds?.total?.line || 'N/A'}`}
                  bottomLine={odds?.total?.under || 'N/A'}
                  isSelected={garyPicks?.total === 'under'}
                />
              </div>
            </div>

            {/* Column Headers */}
            <div className="grid grid-cols-12 gap-3 items-center mt-4 pt-3 border-t border-gray-700">
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
        px-2 py-2 rounded text-center transition-all duration-300 cursor-pointer
        ${isSelected 
          ? 'text-black font-bold' 
          : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
        }
        ${singleLine ? 'py-3' : ''}
      `}
      style={isSelected ? { 
        backgroundColor: '#00d4aa', 
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
        {/* Background matching site pattern */}
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            zIndex: 0,
            pointerEvents: 'none',
            background: `#121212 url(${BG2}) no-repeat center center`,
            backgroundSize: 'cover',
            opacity: 0.15,
          }}
        />
        
        <div className="w-full flex flex-col items-center justify-center pt-32 pb-6 px-4 relative" style={{ minHeight: '100vh', zIndex: 2 }}>
          <div className="mx-auto max-w-md text-center py-4 px-6 rounded-lg" style={{ backgroundColor: '#121212', border: '3px solid #d4af37' }}>
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
      {/* Background matching site pattern */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 0,
          pointerEvents: 'none',
          background: `#121212 url(${BG2}) no-repeat center center`,
          backgroundSize: 'cover',
          opacity: 0.15,
        }}
      >
        {/* Gradient overlay */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at 50% 50%, rgba(40, 40, 50, 0.4) 0%, rgba(20, 20, 25, 0.2) 50%, rgba(10, 10, 15, 0.1) 100%)',
          opacity: 0.6,
        }} />
        
        {/* Abstract shapes */}
        <div style={{
          position: 'absolute',
          top: '10%',
          left: '5%',
          width: '20vw',
          height: '20vw',
          borderRadius: '30% 70% 70% 30% / 30% 30% 70% 70%',
          background: 'rgba(191, 161, 66, 0.03)',
          filter: 'blur(40px)',
        }} />
        
        <div style={{
          position: 'absolute',
          bottom: '15%',
          right: '10%',
          width: '25vw',
          height: '25vw',
          borderRadius: '63% 37% 30% 70% / 50% 45% 55% 50%',
          background: 'rgba(191, 161, 66, 0.02)',
          filter: 'blur(50px)',
        }} />
      </div>

      {/* Main content */}
      <div className="w-full flex flex-col items-center justify-center pt-32 pb-6 px-4 relative" style={{ minHeight: '100vh', zIndex: 2 }}>
        {/* Header */}
        <div className="w-full max-w-4xl mx-auto mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/')}
                className="p-2 rounded transition-all duration-300"
                style={{ backgroundColor: '#00d4aa', color: '#000' }}
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h1 className="text-3xl font-bold text-white">
                  What Gary Thinks
                </h1>
                <p className="text-gray-400 mt-1">Gary's picks for every game today</p>
              </div>
            </div>
            
            <button
              onClick={loadGaryThoughts}
              disabled={loading}
              className="flex items-center space-x-2 px-4 py-2 rounded font-medium transition-all duration-300 disabled:opacity-50"
              style={{ backgroundColor: '#00d4aa', color: '#000' }}
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
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
          <div className="w-full max-w-7xl mx-auto mb-6">
            <div className="mx-auto max-w-md text-center py-4 px-6 rounded-lg" style={{ backgroundColor: '#121212', border: '3px solid #d4af37' }}>
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
        {games.length > 0 ? (
          <div className="w-full max-w-4xl mx-auto">
            <div className="space-y-4">
              {games.map((game, index) => (
                <GameCard key={index} game={game} />
              ))}
            </div>
          </div>
        ) : !loading && (
          <div className="text-center py-12">
            <div className="mx-auto max-w-md text-center py-4 px-6 rounded-lg" style={{ backgroundColor: '#121212', border: '3px solid #d4af37' }}>
              <div className="py-2 -mx-6 mb-4" style={{ backgroundColor: '#d4af37' }}>
                <h3 className="font-bold text-black">NO GAMES TODAY</h3>
              </div>
              <p className="text-gray-400 mb-4">No games found for today</p>
              <p className="text-gray-500 text-sm">Check back later or try refreshing</p>
            </div>
          </div>
        )}

        {/* Legend */}
        {games.length > 0 && (
          <div className="w-full max-w-4xl mx-auto mt-8">
            <div 
              className="p-4 rounded border"
              style={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
            >
              <h3 className="text-lg font-bold mb-3 text-white">Legend</h3>
              <div className="flex flex-wrap gap-6 text-sm">
                <div className="flex items-center space-x-2">
                  <div 
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: '#00d4aa' }}
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