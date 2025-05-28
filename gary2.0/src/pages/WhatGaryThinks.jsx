import React, { useState, useEffect } from 'react';
import { ArrowLeft, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { picksService } from '../services/picksService';
import { supabase } from '../supabaseClient';
import { getESTDate, getESTTimestamp } from '../utils/dateUtils';
import BG2 from '/BG2.png';
import coin2 from '/coin2.png';

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
      const todayDateString = getESTDate();
      
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
      
      // Add delay to prevent rate limiting
      console.log('⏳ Adding delay to prevent OpenAI rate limiting...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
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
      
      // Handle specific error types
      if (err.message && err.message.includes('429')) {
        setError('OpenAI rate limit reached. Please wait a moment and try again.');
      } else if (err.message && err.message.includes('Too Many Requests')) {
        setError('Too many requests to OpenAI. Please wait a moment and try again.');
      } else {
        setError('Failed to load Gary\'s thoughts. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const storeGaryThoughts = async (thoughts, dateString) => {
    try {
      console.log(`🗄️ Storing Gary thoughts for ${dateString} (${thoughts.length} games)`);
      
      // Get current time in EST
      const estTimestamp = getESTTimestamp();
      
      const { error } = await supabase
        .from('gary_thoughts')
        .upsert({
          date: dateString,
          thoughts: JSON.stringify(thoughts),
          created_at: estTimestamp,
          updated_at: estTimestamp
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
        {/* Connecting visual element */}
        <div 
          className="absolute top-0 left-1/5 right-1/5 h-px pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(184, 149, 63, 0.2), transparent)',
            transform: 'translateY(-1px)',
            zIndex: 1
          }}
        />
        {/* Card with seamless background integration */}
        <div 
          className="rounded-xl border transition-all duration-300 hover:transform hover:-translate-y-1"
          style={{ 
            background: `linear-gradient(135deg, 
              rgba(42, 42, 42, 0.7) 0%,
              rgba(26, 26, 26, 0.85) 50%,
              rgba(42, 42, 42, 0.7) 100%
            )`,
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            marginBottom: '8px',
            boxShadow: `
              0 8px 32px rgba(0, 0, 0, 0.3),
              0 2px 8px rgba(0, 0, 0, 0.2),
              inset 0 1px 0 rgba(255, 255, 255, 0.05)
            `,
          }}
        >
          {/* League Header */}
          <div className="flex justify-between items-center px-4 py-3 border-b border-gray-700">
            <div 
              className="px-2 py-1 rounded text-xs font-bold uppercase tracking-wide"
              style={{ backgroundColor: '#d4af37', color: '#000' }}
            >
              {league}
            </div>
            <div 
              className="flex items-center px-3 py-2 rounded-lg border"
              style={{
                background: 'rgba(42, 42, 42, 0.6)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                boxShadow: `
                  0 2px 8px rgba(0, 0, 0, 0.2),
                  inset 0 1px 0 rgba(255, 255, 255, 0.03)
                `
              }}
            >
              <svg className="w-4 h-4 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-gray-300 font-semibold" style={{ fontSize: '14px', fontWeight: '600', letterSpacing: '0.5px' }}>
                {time || 'TBD'}
              </span>
            </div>
          </div>

          {/* Teams and Betting Grid */}
          <div className="p-4">
            {/* Column Headers */}
            <div className="grid grid-cols-12 gap-3 items-center mb-6 pb-3 border-b border-gray-600">
              <div className="col-span-5">
                <span className="text-gray-400 font-semibold" style={{ fontSize: '14px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  Teams
                </span>
              </div>
              <div className="col-span-2 text-center">
                <span className="text-gray-400 font-semibold" style={{ fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  Spread
                </span>
              </div>
              <div className="col-span-2 text-center">
                <span className="text-gray-400 font-semibold" style={{ fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  Money Line
                </span>
              </div>
              <div className="col-span-3 text-center">
                <span className="text-gray-400 font-semibold" style={{ fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  Total Points
                </span>
              </div>
            </div>

            {/* Away Team Row */}
            <div className="grid grid-cols-12 gap-3 items-center mb-3 pb-4 border-b border-gray-700">
              {/* Team Info */}
              <div className="col-span-5 flex items-center space-x-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center shadow-lg">
                  <span className="text-sm font-bold text-white">
                    {awayTeam.charAt(0)}
                  </span>
                </div>
                <span className="text-white font-semibold" style={{ fontSize: '18px', fontWeight: '600' }}>
                  {awayTeam}
                </span>
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
                  centerSingle={true}
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
            <div className="grid grid-cols-12 gap-3 items-center mb-4 pb-4">
              {/* Team Info */}
              <div className="col-span-5 flex items-center space-x-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center shadow-lg">
                  <span className="text-sm font-bold text-white">
                    {homeTeam.charAt(0)}
                  </span>
                </div>
                <span className="text-white font-semibold" style={{ fontSize: '18px', fontWeight: '600' }}>
                  {homeTeam}
                </span>
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
                  centerSingle={true}
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

          </div>

          {/* Gary's Rationale */}
          {garyPicks?.rationale && (
            <div className="px-4 pb-4">
              <div className="mt-4 pt-4 border-t border-gray-600">
                <div className="space-y-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-500 to-yellow-600 flex items-center justify-center shadow-lg">
                      <span className="text-black font-bold text-sm">G</span>
                    </div>
                    <div 
                      className="px-3 py-2 rounded-lg font-bold uppercase shadow-lg"
                                             style={{ 
                         backgroundColor: '#B8953F', 
                         color: '#000',
                         fontSize: '12px',
                         fontWeight: '700',
                         letterSpacing: '0.8px',
                         border: '1px solid rgba(184, 149, 63, 0.6)'
                       }}
                    >
                      Gary's Analysis
                    </div>
                  </div>
                  <div 
                    className="rounded-lg p-4 border shadow-inner"
                    style={{
                      background: 'rgba(42, 42, 42, 0.6)',
                      backdropFilter: 'blur(16px)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      boxShadow: `
                        0 8px 32px rgba(212, 175, 55, 0.37),
                        inset 0 1px 0 rgba(255, 255, 255, 0.05)
                      `
                    }}
                  >
                    <p className="text-gray-200 leading-relaxed italic" style={{ fontSize: '15px', lineHeight: '1.6' }}>
                      "{garyPicks.rationale}"
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const BettingOption = ({ topLine, bottomLine, isSelected, singleLine = false, centerSingle = false }) => {
    return (
      <div className={`
        rounded-lg text-center transition-all duration-300 cursor-pointer flex flex-col justify-center items-center
        ${isSelected 
          ? 'text-black font-bold transform scale-105' 
          : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:scale-102 hover:shadow-lg'
        }
      `}
      style={{
        width: '120px',
        height: '64px',
        padding: '8px',
        ...(isSelected ? { 
          background: 'linear-gradient(135deg, #B8953F 0%, #C5A647 100%)',
          color: '#000',
          border: '1px solid rgba(184, 149, 63, 0.6)',
          boxShadow: `
            0 4px 16px rgba(184, 149, 63, 0.3),
            0 2px 8px rgba(184, 149, 63, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.2)
          `
        } : { 
          background: 'rgba(51, 51, 51, 0.6)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: `
            0 2px 8px rgba(0, 0, 0, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.03)
          `
        })
      }}
      >
        {centerSingle && singleLine ? (
          <div className={`leading-tight text-center overflow-hidden ${isSelected ? 'text-black font-bold' : 'text-white font-semibold'}`}
               style={{ fontSize: '14px', fontWeight: '700', wordBreak: 'break-all' }}>
            {topLine}
          </div>
        ) : (
          <>
            <div className={`leading-tight text-center overflow-hidden ${isSelected ? 'text-black font-bold' : 'text-white font-semibold'}`}
                 style={{ fontSize: '14px', fontWeight: '700', wordBreak: 'break-all' }}>
              {topLine}
            </div>
            <div className={`mt-1 leading-tight text-center overflow-hidden ${isSelected ? 'text-black' : 'text-gray-400'}`}
                 style={{ fontSize: '11px', fontWeight: '400', textTransform: 'uppercase', letterSpacing: '0.5px', wordBreak: 'break-all' }}>
              {!singleLine && bottomLine ? bottomLine : '\u00A0'}
            </div>
          </>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ position: 'relative', minHeight: '100vh', width: '100vw' }}>
        {/* Creme, Black, and Gold background */}
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            zIndex: 0,
            pointerEvents: 'none',
            background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 25%, #2a2a2a 50%, #1a1a1a 75%, #0f0f0f 100%)',
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
            background: `radial-gradient(circle at 20% 80%, rgba(212, 175, 55, 0.12) 0%, transparent 50%),
                        radial-gradient(circle at 80% 20%, rgba(212, 175, 55, 0.08) 0%, transparent 50%),
                        radial-gradient(circle at 40% 40%, rgba(245, 245, 220, 0.03) 0%, transparent 50%)`,
          }}
        />
        
        <div className="w-full flex flex-col items-center justify-center pt-24 pb-6 px-4 relative" style={{ minHeight: '100vh', zIndex: 2 }}>
          <div 
          className="mx-auto max-w-md text-center py-4 px-6 rounded-xl" 
          style={{ 
            background: `linear-gradient(135deg, 
              rgba(42, 42, 42, 0.9) 0%,
              rgba(26, 26, 26, 0.95) 50%,
              rgba(42, 42, 42, 0.9) 100%
            )`,
            backdropFilter: 'blur(20px) saturate(180%)',
                         border: '1px solid rgba(184, 149, 63, 0.4)',
             boxShadow: `
               0 8px 32px rgba(0, 0, 0, 0.3),
               0 2px 8px rgba(184, 149, 63, 0.15),
               inset 0 1px 0 rgba(255, 255, 255, 0.05)
             `
           }}
         >
            <div className="py-2 -mx-6 mb-4" style={{ backgroundColor: '#B8953F' }}>
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
              {/* Creme, Black, and Gold background */}
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            zIndex: 0,
            pointerEvents: 'none',
            background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 25%, #2a2a2a 50%, #1a1a1a 75%, #0f0f0f 100%)',
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
            background: `radial-gradient(circle at 20% 80%, rgba(212, 175, 55, 0.12) 0%, transparent 50%),
                        radial-gradient(circle at 80% 20%, rgba(212, 175, 55, 0.08) 0%, transparent 50%),
                        radial-gradient(circle at 40% 40%, rgba(245, 245, 220, 0.03) 0%, transparent 50%)`,
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
            background: 'radial-gradient(circle, rgba(212, 175, 55, 0.08) 0%, transparent 70%)',
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
            background: 'radial-gradient(circle, rgba(245, 245, 220, 0.04) 0%, transparent 70%)',
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
      <div className="w-full flex flex-col items-center justify-center pt-24 pb-6 px-4 relative" style={{ minHeight: '100vh', zIndex: 2 }}>
        {/* Header */}
        <div className="w-full max-w-4xl mx-auto mb-6">
          <div className="flex items-center mb-4">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/')}
                className="p-2 rounded transition-all duration-300"
                style={{ backgroundColor: '#B8953F', color: '#000' }}
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h1 className="text-3xl font-bold" style={{ color: '#B8953F' }}>
                  Gary's Thoughts
                </h1>
                <p className="text-gray-400 mt-1">Gary's picks for every game today</p>
              </div>
            </div>
          </div>

          {/* Sport Tabs with Coin Image */}
          <div className="flex justify-center items-center space-x-6 mb-6">
            {/* Coin Image */}
            <div className="flex-shrink-0">
              <img 
                src={coin2} 
                alt="Gary Coin" 
                className="w-12 h-12 object-contain opacity-80"
                style={{ filter: 'drop-shadow(0 2px 8px rgba(212, 175, 55, 0.3))' }}
              />
            </div>
            
            {/* Sport Tabs - Smaller and More Subtle */}
            <div 
              className="flex space-x-1 p-1 rounded-lg shadow-md" 
              style={{ 
                background: 'rgba(42, 42, 42, 0.6)',
                backdropFilter: 'blur(16px) saturate(160%)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                boxShadow: `
                  0 4px 16px rgba(0, 0, 0, 0.2),
                  0 1px 4px rgba(0, 0, 0, 0.1),
                  inset 0 1px 0 rgba(255, 255, 255, 0.03)
                `
              }}
            >
              {['NBA', 'MLB', 'NHL'].map((sport) => (
                <button
                  key={sport}
                  onClick={() => setActiveTab(sport)}
                  className={`px-4 py-2 rounded-md font-semibold transition-all duration-300 transform text-sm ${
                    activeTab === sport 
                      ? 'text-black scale-102 shadow-sm' 
                      : 'text-gray-400 hover:text-white hover:bg-gray-700/50 hover:scale-101'
                  }`}
                  style={activeTab === sport ? { 
                    background: 'linear-gradient(135deg, #B8953F 0%, #C5A647 100%)',
                    border: '1px solid rgba(184, 149, 63, 0.4)',
                    boxShadow: `
                      0 2px 8px rgba(184, 149, 63, 0.2),
                      0 1px 4px rgba(184, 149, 63, 0.1),
                      inset 0 1px 0 rgba(255, 255, 255, 0.15)
                    `,
                    fontSize: '13px',
                    fontWeight: '600',
                    letterSpacing: '0.3px'
                  } : {
                    background: 'rgba(51, 51, 51, 0.4)',
                    backdropFilter: 'blur(6px)',
                    border: '1px solid rgba(255, 255, 255, 0.04)',
                    boxShadow: `
                      0 1px 4px rgba(0, 0, 0, 0.1),
                      inset 0 1px 0 rgba(255, 255, 255, 0.02)
                    `,
                    fontSize: '13px',
                    fontWeight: '500',
                    letterSpacing: '0.3px'
                  }}
                >
                  {sport}
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* Error State */}
        {error && (
          <div className="w-full max-w-4xl mx-auto mb-6">
            <div 
              className="mx-auto max-w-md text-center py-4 px-6 rounded-xl" 
              style={{ 
                background: `linear-gradient(135deg, 
                  rgba(42, 42, 42, 0.9) 0%,
                  rgba(26, 26, 26, 0.95) 50%,
                  rgba(42, 42, 42, 0.9) 100%
                )`,
                backdropFilter: 'blur(20px) saturate(180%)',
                border: '1px solid rgba(184, 149, 63, 0.4)',
                boxShadow: `
                  0 8px 32px rgba(0, 0, 0, 0.3),
                  0 2px 8px rgba(184, 149, 63, 0.15),
                  inset 0 1px 0 rgba(255, 255, 255, 0.05)
                `
              }}
            >
              <div className="py-2 -mx-6 mb-4" style={{ backgroundColor: '#B8953F' }}>
                <h3 className="font-bold text-black">ERROR</h3>
              </div>
              <p className="text-red-400 mb-4">{error}</p>
              <button 
                onClick={loadGaryThoughts}
                className="px-4 py-2 font-bold uppercase text-black rounded transition-all duration-300 hover:scale-105" 
                style={{ backgroundColor: '#B8953F' }}
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
            <div className="w-full max-w-4xl mx-auto relative">
              {/* Subtle background overlay for visual cohesion */}
              <div 
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: `
                    radial-gradient(ellipse at center, rgba(184, 149, 63, 0.02) 0%, transparent 70%),
                    radial-gradient(circle at 25% 25%, rgba(184, 149, 63, 0.015) 0%, transparent 50%),
                    radial-gradient(circle at 75% 75%, rgba(255, 255, 255, 0.01) 0%, transparent 50%)
                  `,
                  borderRadius: '20px',
                  zIndex: 0
                }}
              />
              <div 
                className="relative z-10"
                style={{
                  background: `linear-gradient(
                    180deg,
                    transparent 0%,
                    rgba(0, 0, 0, 0.02) 50%,
                    transparent 100%
                  )`,
                  padding: '8px',
                  borderRadius: '20px'
                }}
              >
                <div className="space-y-3">
                  {filteredGames.map((game, index) => (
                    <GameCard key={`${game.id}-${index}`} game={game} />
                  ))}
                </div>
              </div>
            </div>
          ) : games.length > 0 ? (
            <div className="text-center py-6">
              <div 
                className="mx-auto max-w-md text-center py-4 px-6 rounded-xl" 
                style={{ 
                  background: `linear-gradient(135deg, 
                    rgba(42, 42, 42, 0.9) 0%,
                    rgba(26, 26, 26, 0.95) 50%,
                    rgba(42, 42, 42, 0.9) 100%
                  )`,
                  backdropFilter: 'blur(20px) saturate(180%)',
                  border: '1px solid rgba(184, 149, 63, 0.4)',
                  boxShadow: `
                    0 8px 32px rgba(0, 0, 0, 0.3),
                    0 2px 8px rgba(184, 149, 63, 0.15),
                    inset 0 1px 0 rgba(255, 255, 255, 0.05)
                  `
                }}
              >
                <div className="py-2 -mx-6 mb-4" style={{ backgroundColor: '#B8953F' }}>
                  <h3 className="font-bold text-black">NO {activeTab} GAMES TODAY</h3>
                </div>
                <p className="text-gray-400 mb-4">No {activeTab} games found for today</p>
                <p className="text-gray-500 text-sm">Try selecting a different sport</p>
              </div>
            </div>
                      ) : !loading && (
            <div className="text-center py-6">
              <div 
                className="mx-auto max-w-md text-center py-4 px-6 rounded-xl" 
                style={{ 
                  background: `linear-gradient(135deg, 
                    rgba(42, 42, 42, 0.9) 0%,
                    rgba(26, 26, 26, 0.95) 50%,
                    rgba(42, 42, 42, 0.9) 100%
                  )`,
                  backdropFilter: 'blur(20px) saturate(180%)',
                  border: '1px solid rgba(184, 149, 63, 0.4)',
                  boxShadow: `
                    0 8px 32px rgba(0, 0, 0, 0.3),
                    0 2px 8px rgba(184, 149, 63, 0.15),
                    inset 0 1px 0 rgba(255, 255, 255, 0.05)
                  `
                }}
              >
                <div className="py-2 -mx-6 mb-4" style={{ backgroundColor: '#B8953F' }}>
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
          <div className="w-full max-w-4xl mx-auto mt-6">
            <div 
              className="p-4 rounded-xl border"
              style={{ 
                background: `linear-gradient(135deg, 
                  rgba(42, 42, 42, 0.7) 0%,
                  rgba(26, 26, 26, 0.85) 50%,
                  rgba(42, 42, 42, 0.7) 100%
                )`,
                backdropFilter: 'blur(20px) saturate(180%)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                boxShadow: `
                  0 8px 32px rgba(0, 0, 0, 0.3),
                  0 2px 8px rgba(0, 0, 0, 0.2),
                  inset 0 1px 0 rgba(255, 255, 255, 0.05)
                `
              }}
            >
                              <h3 className="text-lg font-bold mb-3" style={{ color: '#B8953F' }}>Legend</h3>
              <div className="flex flex-wrap gap-6 text-sm">
                <div className="flex items-center space-x-2">
                                      <div 
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: '#B8953F' }}
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