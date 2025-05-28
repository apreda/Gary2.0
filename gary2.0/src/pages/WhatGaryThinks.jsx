import React, { useState, useEffect } from 'react';
import { ArrowLeft, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { picksService } from '../services/picksService';
import { supabase } from '../services/supabaseClient';

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
      <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-colors">
        {/* Header */}
        <div className="flex justify-between items-center mb-3">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            {league}
          </span>
          <span className="text-xs text-gray-400">
            {time || 'TBD'}
          </span>
        </div>

        {/* Teams */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between">
            <span className="text-white font-medium">{awayTeam}</span>
            <span className="text-xs text-gray-400">@</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-white font-medium">{homeTeam}</span>
          </div>
        </div>

        {/* Betting Lines */}
        <div className="space-y-3">
          {/* Spread */}
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-400 uppercase tracking-wide">Spread</span>
            <div className="flex space-x-2">
              <BettingOption
                label={odds?.spread?.away?.line || 'N/A'}
                odds={odds?.spread?.away?.odds || 'N/A'}
                isSelected={garyPicks?.spread === 'away'}
              />
              <BettingOption
                label={odds?.spread?.home?.line || 'N/A'}
                odds={odds?.spread?.home?.odds || 'N/A'}
                isSelected={garyPicks?.spread === 'home'}
              />
            </div>
          </div>

          {/* Moneyline */}
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-400 uppercase tracking-wide">Moneyline</span>
            <div className="flex space-x-2">
              <BettingOption
                label="ML"
                odds={odds?.moneyline?.away || 'N/A'}
                isSelected={garyPicks?.moneyline === 'away'}
              />
              <BettingOption
                label="ML"
                odds={odds?.moneyline?.home || 'N/A'}
                isSelected={garyPicks?.moneyline === 'home'}
              />
            </div>
          </div>

          {/* Over/Under */}
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-400 uppercase tracking-wide">Total</span>
            <div className="flex space-x-2">
              <BettingOption
                label={`O ${odds?.total?.line || 'N/A'}`}
                odds={odds?.total?.over || 'N/A'}
                isSelected={garyPicks?.total === 'over'}
                icon={<TrendingUp size={12} />}
              />
              <BettingOption
                label={`U ${odds?.total?.line || 'N/A'}`}
                odds={odds?.total?.under || 'N/A'}
                isSelected={garyPicks?.total === 'under'}
                icon={<TrendingDown size={12} />}
              />
            </div>
          </div>
        </div>

        {/* Gary's Confidence */}
        {garyPicks?.confidence && (
          <div className="mt-3 pt-3 border-t border-gray-700">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">Gary's Confidence</span>
              <span className="text-xs font-medium text-yellow-400">
                {Math.round(garyPicks.confidence * 100)}%
              </span>
            </div>
          </div>
        )}
      </div>
    );
  };

  const BettingOption = ({ label, odds, isSelected, icon }) => {
    return (
      <div className={`
        px-3 py-2 rounded text-xs font-medium text-center min-w-[60px] transition-all
        ${isSelected 
          ? 'bg-green-600/20 border border-green-500/50 text-green-400' 
          : 'bg-gray-700 border border-gray-600 text-gray-300 hover:bg-gray-600'
        }
      `}>
        <div className="flex items-center justify-center space-x-1">
          {icon && <span>{icon}</span>}
          <span>{label}</span>
        </div>
        <div className="text-xs opacity-75 mt-1">
          {odds}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <RefreshCw className="animate-spin mx-auto mb-4" size={48} />
              <p className="text-xl">Gary is analyzing today's games...</p>
              <p className="text-gray-400 mt-2">This may take a moment</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate('/')}
              className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-yellow-400">What Gary Thinks</h1>
              <p className="text-gray-400 mt-1">Gary's picks for every game today</p>
            </div>
          </div>
          
          <button
            onClick={loadGaryThoughts}
            disabled={loading}
            className="flex items-center space-x-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 rounded-lg transition-colors"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Last Updated */}
        {lastUpdated && (
          <div className="mb-6 text-center">
            <p className="text-sm text-gray-400">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4 mb-6">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Games Grid */}
        {games.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {games.map((game, index) => (
              <GameCard key={index} game={game} />
            ))}
          </div>
        ) : !loading && (
          <div className="text-center py-12">
            <p className="text-xl text-gray-400">No games found for today</p>
            <p className="text-gray-500 mt-2">Check back later or try refreshing</p>
          </div>
        )}

        {/* Legend */}
        {games.length > 0 && (
          <div className="mt-8 p-4 bg-gray-800 rounded-lg border border-gray-700">
            <h3 className="text-lg font-semibold mb-3">Legend</h3>
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-green-600/20 border border-green-500/50 rounded"></div>
                <span className="text-gray-300">Gary's Pick</span>
              </div>
              <div className="flex items-center space-x-2">
                <TrendingUp size={16} className="text-gray-400" />
                <span className="text-gray-300">Over</span>
              </div>
              <div className="flex items-center space-x-2">
                <TrendingDown size={16} className="text-gray-400" />
                <span className="text-gray-300">Under</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WhatGaryThinks; 