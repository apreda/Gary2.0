import { useState } from 'react';
import { useDeepseek } from './useDeepseek';
import { supabase } from '../supabaseClient';
import axios from 'axios';

const ODDS_API_KEY = import.meta.env.VITE_ODDS_API_KEY;
const ODDS_API_HOST = 'https://api.the-odds-api.com/v4';
const SPORTS = ['basketball_nba', 'baseball_mlb', 'icehockey_nhl'];  // Re-enabled all sports

export function useParlay() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { searchContext } = useDeepseek();

  // Mock data for when API is unavailable
  const MOCK_GAMES = {
    basketball_nba: [
      {
        id: 'nba_1',
        sport_key: 'basketball_nba',
        sport_title: 'NBA',
        commence_time: '2025-04-11T23:00:00Z',
        home_team: 'Boston Celtics',
        away_team: 'Miami Heat',
        bookmakers: [{
          markets: [{
            outcomes: [
              { name: 'Boston Celtics', price: -180 },
              { name: 'Miami Heat', price: 160 }
            ]
          }]
        }]
      }
    ],
    baseball_mlb: [
      {
        id: 'mlb_1',
        sport_key: 'baseball_mlb',
        sport_title: 'MLB',
        commence_time: '2025-04-11T23:00:00Z',
        home_team: 'New York Yankees',
        away_team: 'Boston Red Sox',
        bookmakers: [{
          markets: [{
            outcomes: [
              { name: 'New York Yankees', price: -150 },
              { name: 'Boston Red Sox', price: 130 }
            ]
          }]
        }]
      }
    ],
    icehockey_nhl: [
      {
        id: 'nhl_1',
        sport_key: 'icehockey_nhl',
        sport_title: 'NHL',
        commence_time: '2025-04-11T23:00:00Z',
        home_team: 'New York Rangers',
        away_team: 'Washington Capitals',
        bookmakers: [{
          markets: [{
            outcomes: [
              { name: 'New York Rangers', price: -140 },
              { name: 'Washington Capitals', price: 120 }
            ]
          }]
        }]
      }
    ]
  };

  const fetchGamesForSport = async (sport) => {
    try {
      const response = await axios.get(`${ODDS_API_HOST}/sports/${sport}/odds`, {
        params: {
          apiKey: ODDS_API_KEY,
          regions: 'us',
          markets: 'h2h,spreads,totals',
          oddsFormat: 'american'
        }
      });
      console.log(`Fetched ${sport} games:`, response.data);
      return response.data;
    } catch (error) {
      console.error(`Error fetching ${sport} games:`, error.response?.data || error);
      // Return mock data if API fails
      return MOCK_GAMES[sport] || [];
    }
  };

  const analyzePotentialPicks = async (games) => {
    const gameAnalysis = [];
    
    for (const game of games) {
      try {
        const markets = game.bookmakers?.[0]?.markets || [];
        const moneyline = markets.find(m => m.key === 'h2h') || markets[0];
        const spread = markets.find(m => m.key === 'spreads') || markets[1];
        const total = markets.find(m => m.key === 'totals') || markets[2];

        // Format game info for analysis
        const gameInfo = {
          teams: `${game.home_team} vs ${game.away_team}`,
          moneyline: moneyline?.outcomes?.map(o => `${o.name} ${o.price}`).join(' vs '),
          spread: spread?.outcomes?.map(o => `${o.name} ${o.point}`).join(' vs '),
          total: total?.outcomes?.map(o => `${o.name} ${o.point}`).join(' vs ')
        };

        // Get Gary's analysis
        const analysis = await searchContext(
          `Analyze this ${game.sport_key.replace('_', ' ').toUpperCase()} game for betting potential:\n${gameInfo.teams}\nMoneyline: ${gameInfo.moneyline}\nSpread: ${gameInfo.spread}\nTotal: ${gameInfo.total}\n\nGive a 1-2 sentence analysis and rate confidence 1-10. Format: [Confidence: X] Analysis text`
        );

        // Extract confidence rating
        const confidenceMatch = analysis.match(/Confidence: (\d+)/);
        const confidence = confidenceMatch ? parseInt(confidenceMatch[1]) : Math.floor(Math.random() * 3) + 7;

        gameAnalysis.push({
          game,
          analysis,
          confidence,
          markets: {
            moneyline,
            spread,
            total
          }
        });
      } catch (error) {
        console.error('Error analyzing game:', error);
      }
    }

    // Sort by confidence and return top picks
    return gameAnalysis.sort((a, b) => b.confidence - a.confidence);
  };

  const generateParlay = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch games for all sports
      const allGames = [];
      for (const sport of SPORTS) {
        const games = await fetchGamesForSport(sport);
        allGames.push(...games);
      }

      // Analyze games for best picks
      const analyzedGames = await analyzePotentialPicks(allGames);
      
      // Select top 3 most confident picks
      const bestPicks = analyzedGames.slice(0, 3);
      
      // Get Gary's overall analysis
      const parlayInfo = bestPicks.map((pick) => 
        `${pick.game.sport_key.replace('_', ' ').toUpperCase()}: ${pick.game.home_team} vs ${pick.game.away_team}`
      ).join('\n');

      const garyAnalysis = await searchContext(
        `Give me a short, entertaining analysis of this 3-leg multi-sport parlay:\n${parlayInfo}\nBe confident and use emojis! Sign as -Gary 🐻`
      );

      // Calculate total odds
      const totalOdds = bestPicks.reduce((acc, pick) => {
        const odds = pick.markets.moneyline?.outcomes?.[0]?.price || 100;
        return acc * (Math.abs(odds) / 100);
      }, 1);

      // Format the parlay data
      const parlay = {
        title: "Gary's Multi-Sport Power Parlay 🎯",
        legs: bestPicks.map((pick) => ({
          teams: `${pick.game.home_team} vs ${pick.game.away_team}`,
          markets: [
            {
              key: "ML",
              outcomes: pick.markets.moneyline?.outcomes || []
            },
            {
              key: "Spread",
              outcomes: pick.markets.spread?.outcomes || []
            },
            {
              key: "Total",
              outcomes: pick.markets.total?.outcomes || []
            }
          ],
          confidence: pick.confidence
        })),
        total_odds: totalOdds,
        payout_multiplier: totalOdds.toFixed(2),
        notes: garyAnalysis,
        analysis: bestPicks.map((pick) => pick.analysis).join('\n\n'),
        created_at: new Date().toISOString()
      };

      // Save to Supabase
      const { data, error } = await supabase
        .from('parlays')
        .insert([parlay])
        .select()
        .single();

      if (error) throw error;
      return data;

    } catch (error) {
      setError(error.message);
      console.error('Error generating parlay:', error);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const shouldGenerateNewParlay = (existingParlay) => {
    if (!existingParlay) return true;
    const today = new Date().toLocaleDateString();
    const existingParlayDate = new Date(existingParlay.created_at).toLocaleDateString();
    return today !== existingParlayDate;
  };

  const getExistingParlay = async () => {
    const { data, error } = await supabase
      .from('parlays')
      .select()
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) throw error;
    return data;
  };

  const loadParlay = async () => {
    try {
      const existingParlay = await getExistingParlay();
      if (shouldGenerateNewParlay(existingParlay)) {
        const newParlay = await generateParlay();
        if (newParlay) {
          setParlay(newParlay);
        } else if (existingParlay) {
          setParlay(existingParlay); // Fallback to existing parlay if generation fails
        }
      } else if (existingParlay) {
        setParlay(existingParlay);
      }
    } catch (error) {
      console.error('Error loading parlay:', error);
      if (existingParlay) {
        setParlay(existingParlay);
      }
    }
  };

  return {
    generateParlay,
    loading,
    error
  };
}
