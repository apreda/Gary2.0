import { makeGaryPick } from '../ai/garyEngine';
import { oddsService } from './oddsService';
import axios from 'axios';

const DEEPSEEK_API_KEY = import.meta.env.VITE_DEEPSEEK_API_KEY;
const DEEPSEEK_BASE_URL = import.meta.env.VITE_DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';

/**
 * Service for generating and managing Gary's picks
 */
export const picksService = {
  /**
   * Generate narrative for a game using DeepSeek API
   * @param {Object} game - Game data from The Odds API
   * @returns {Promise<Object>} - Narrative data for the game
   */
  generateNarrative: async (game) => {
    try {
      const homeTeam = game.home_team;
      const awayTeam = game.away_team;
      const sportKey = game.sport_key;
      
      // Since DeepSeek integration is pending, generate mock narrative
      return {
        revenge: Math.random() > 0.8,
        superstition: Math.random() > 0.9,
        momentum: 0.3 + Math.random() * 0.6,
        rationale: `${homeTeam} vs ${awayTeam} matchup analysis`
      };
    } catch (error) {
      console.error('Error generating narrative:', error);
      // Return a default narrative if API call fails
      return {
        revenge: false,
        superstition: false,
        momentum: 0.5,
        rationale: "Default narrative due to API error"
      };
    }
  },
  
  /**
   * Generate a detailed pick analysis using DeepSeek
   * @param {Object} pick - Basic pick data
   * @returns {Promise<Object>} - Enhanced pick with detailed analysis
   */
  generatePickDetail: async (pick) => {
    try {
      // Since DeepSeek integration is pending, generate a mock analysis
      const emphasis = ['LOCK', 'ABSOLUTE LOCK', 'BETTING GOLD', 'PREMIUM VALUE', 'EASY MONEY'];
      const randomEmphasis = emphasis[Math.floor(Math.random() * emphasis.length)];
      
      let analysis = `${pick.game} is an ${randomEmphasis} tonight. `;
      
      if (pick.betType.includes('Moneyline')) {
        analysis += `The ${pick.game.split(' vs ')[0]} are in PRIME position here. Trust Gary on this one!`;
      } else if (pick.betType.includes('Spread')) {
        analysis += `This spread is a GIFT from Vegas. They're practically BEGGING you to take the other side. Don't fall for it!`;
      } else {
        analysis += `The OVER is the play here. These offenses are going to LIGHT IT UP and the defense won't keep up.`;
      }
      
      if (pick.confidenceLevel > 85) {
        analysis += ` This is one of my HIGHEST conviction plays of the month!`;
      }
      
      return {
        ...pick,
        pickDetail: analysis
      };
    } catch (error) {
      console.error('Error generating pick detail:', error);
      return {
        ...pick,
        pickDetail: "Gary's algorithm is LOVING this pick! The numbers don't lie - this one has everything lining up just right. Trust the Bear on this one!"
      };
    }
  },
  
  /**
   * Generate a daily parlay using existing picks
   * @param {Array} picks - Array of individual picks
   * @returns {Promise<Object>} - Parlay pick object
   */
  generateParlay: async (picks) => {
    try {
      // Filter out any parlay picks from the input
      const regularPicks = picks.filter(pick => pick.league !== 'PARLAY');
      
      // Select top 3 picks for the parlay based on confidence level
      const topPicks = [...regularPicks]
        .sort((a, b) => b.confidenceLevel - a.confidenceLevel)
        .slice(0, 3);
      
      // If we don't have enough picks, use placeholder data
      const parlayLegs = topPicks.length >= 3 ? topPicks.map(pick => ({
        game: pick.game,
        pick: pick.betType.includes('Spread') ? pick.spread :
              pick.betType.includes('Over/Under') ? pick.overUnder :
              pick.moneyline,
        league: pick.league,
        betType: pick.betType.split(':')[0].trim()
      })) : [
        {
          game: "Lakers vs Warriors",
          pick: "Warriors -4.5",
          league: "NBA",
          betType: "Spread"
        },
        {
          game: "Yankees vs Red Sox",
          pick: "Over 8.5",
          league: "MLB",
          betType: "Total"
        },
        {
          game: "Chiefs vs Eagles",
          pick: "Chiefs -3",
          league: "NFL",
          betType: "Spread"
        }
      ];
      
      return {
        id: 4, // This will be overwritten by the caller
        league: 'PARLAY',
        game: 'Parlay of the Day',
        moneyline: '',
        spread: '',
        overUnder: '',
        time: 'All Day',
        pickDetail: '', // Removing Gary's Analysis from the front of card as requested
        confidenceLevel: 75,
        isPremium: true,
        betType: '3-Leg Parlay',
        parlayOdds: '+850',
        potentialPayout: '$950',
        parlayLegs: parlayLegs,
        img: null
      };
    } catch (error) {
      console.error('Error generating parlay:', error);
      return null;
    }
  },
  
  /**
   * Generate daily picks for all available sports
   * @returns {Promise<Array>} - Array of daily picks
   */
  generateDailyPicks: async () => {
    try {
      // Fetch upcoming games from various sports
      const sports = [
        'basketball_nba', 
        'football_nfl', 
        'baseball_mlb', 
        'icehockey_nhl',
        'soccer_epl',
        'soccer_serie_a'
      ];
      
      // Get batch odds for all sports
      const allGames = await oddsService.getBatchOdds(sports);
      
      // Filter out games that are in the past or too far in the future
      const now = new Date();
      const end = new Date();
      end.setHours(23, 59, 59, 999); // End of today
      
      // Only include games happening later today (no futures)
      const upcomingGames = allGames.filter(game => {
        const gameTime = new Date(game.commence_time);
        return gameTime > now && gameTime <= end;
      });
      
      // If we have no upcoming games from API (or API call failed), use fallback data
      if (allGames.length === 0) {
        return picksService.getFallbackPicks();
      }
      
      // Sort by start time (earliest first)
      upcomingGames.sort((a, b) => new Date(a.commence_time) - new Date(b.commence_time));
      
      // Select a diverse set of games across different sports
      const selectedGames = [];
      const selectedSports = new Set();
      
      // Try to get at least one game from each sport
      upcomingGames.forEach(game => {
        if (selectedGames.length < 6 && !selectedSports.has(game.sport)) {
          selectedGames.push(game);
          selectedSports.add(game.sport);
        }
      });
      
      // Fill remaining slots with best games
      if (selectedGames.length < 6) {
        const remainingGames = upcomingGames.filter(
          game => !selectedGames.includes(game)
        );
        
        // Sort by popularity (more bookmakers = more popular)
        remainingGames.sort((a, b) => (b.bookmakers?.length || 0) - (a.bookmakers?.length || 0));
        
        // Add top games until we have 6
        selectedGames.push(...remainingGames.slice(0, 6 - selectedGames.length));
      }
      
      // Find the primetime game (game with most bookmakers)
      const sortedByPopularity = [...selectedGames].sort((a, b) => 
        (b.bookmakers?.length || 0) - (a.bookmakers?.length || 0)
      );
      const primetimeGame = sortedByPopularity[0];
      
      // Generate picks for each selected game
      const picks = await Promise.all(selectedGames.map(async (game, index) => {
        // Determine if this is the primetime game
        const isPrimetimeGame = game === primetimeGame;
        
        // Only the first card is not premium (accessible to free users)
        // All other cards are premium and require a Pro plan
        const isPremium = index !== 0;
        
        // Get narrative data for the game
        const narrative = await picksService.generateNarrative(game);
        
        // Use Gary's decision engine to make the pick
        const pickData = makeGaryPick(game, narrative);
        
        // Create basic pick object
        const sportName = game.sportName || game.sport?.toUpperCase() || 'SPORT';
        const gameTime = new Date(game.commence_time);
        const timeString = gameTime.toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit', 
          timeZone: 'America/New_York'
        });
        
        const pick = {
          id: index + 1,
          league: sportName.toUpperCase().split('_')[0],
          game: `${game.away_team} vs ${game.home_team}`,
          moneyline: pickData.moneyline || game.moneyline || '',
          spread: pickData.spread || game.spread || '',
          overUnder: pickData.overUnder || game.overUnder || '',
          time: `${timeString} ET`,
          rawTime: game.commence_time,
          homeTeam: game.home_team,
          awayTeam: game.away_team,
          sport: game.sport,
          gameId: game.id,
          bookmakers: game.bookmakers,
          confidenceLevel: 70 + Math.floor(Math.random() * 26), // 70-95% confidence
          isPremium,
          betType: pickData.betType || 'Best Bet: Moneyline',
          primeTimeCard: isPrimetimeGame,
          silverCard: game.sport?.includes('soccer') || false
        };
        
        // Generate detailed analysis
        const analysis = await picksService.generatePickDetail(pick);
        
        // Add primetime special tag if applicable
        if (isPrimetimeGame) {
          analysis.pickDetail = `PRIMETIME SPECIAL: ${analysis.pickDetail} This nationally televised matchup is getting all the attention, but Gary's seeing value that others are missing.`;
        }
        
        return analysis;
      }));
      
      // Generate a parlay as the 7th pick
      const parlay = await picksService.generateParlay(picks);
      
      // Make sure we have exactly 7 picks (6 regular picks plus 1 parlay)
      let finalPicks = [...picks];
      
      // Add the parlay
      finalPicks.splice(4, 0, parlay);
      
      // Limit to 7 picks if we somehow have more
      finalPicks = finalPicks.slice(0, 7);
      
      // Make sure IDs are sequential and unique
      finalPicks = finalPicks.map((pick, index) => ({
        ...pick,
        id: index + 1
      }));
      
      return finalPicks.length > 0 ? finalPicks : picksService.getFallbackPicks();
    } catch (error) {
      console.error('Error generating daily picks:', error);
      return picksService.getFallbackPicks();
    }
  },
  
  /**
   * Get fallback picks in case API calls fail
   * @returns {Array} - Array of mock picks
   */
  getFallbackPicks: () => {
    return [
      {
        id: 1,
        league: "NBA",
        game: "Celtics vs Bulls",
        moneyline: "Bulls -220",
        spread: "Celtics +3.5",
        overUnder: "Over 210.5",
        time: "7:10 PM ET",
        pickDetail: "Bulls are an absolute LOCK tonight. Do not fade me on this one, pal. Boston's defense is FULL of holes right now.",
        walletValue: "$150",
        confidenceLevel: 87,
        isPremium: false,
        betType: "Best Bet: Moneyline"
      },
      {
        id: 2,
        league: "NFL",
        game: "Patriots vs Giants",
        moneyline: "Patriots -150",
        spread: "Giants +4.0",
        overUnder: "Under 45.5",
        time: "8:30 PM ET",
        pickDetail: "Giants +4? Vegas is practically BEGGING you to take the Pats. Trust me, this line stinks worse than week-old fish. Giants cover EASY.",
        walletValue: "$200",
        confidenceLevel: 92,
        isPremium: true,
        betType: "Spread Pick"
      },
      {
        id: 3,
        league: "MLB",
        game: "Yankees vs Red Sox",
        moneyline: "Yankees -120",
        spread: "Red Sox +1.5",
        overUnder: "Over 8.5",
        time: "4:05 PM ET",
        pickDetail: "Yankees own the Red Sox this season. PERIOD. This is the closest thing to free money you'll ever see. I'm betting the house on this one.",
        walletValue: "$100",
        confidenceLevel: 78,
        isPremium: true,
        betType: "Total: Over/Under"
      },
      {
        id: 4,
        league: "PARLAY",
        game: "Parlay of the Day",
        moneyline: "",
        spread: "",
        overUnder: "",
        time: "All Day",
        pickDetail: "", // Empty as requested
        walletValue: "$50",
        confidenceLevel: 65,
        isPremium: true,
        betType: "3-Leg Parlay",
        parlayOdds: "+850",
        potentialPayout: "$950",
        parlayLegs: [
          {
            game: "Lakers vs Warriors",
            pick: "Warriors -4.5",
            league: "NBA",
            betType: "Spread"
          },
          {
            game: "Yankees vs Red Sox",
            pick: "Over 8.5",
            league: "MLB",
            betType: "Total"
          },
          {
            game: "Chiefs vs Eagles",
            pick: "Chiefs -3",
            league: "NFL",
            betType: "Spread"
          }
        ]
      },
      {
        id: 5,
        league: "NHL",
        game: "Penguins vs Blackhawks",
        moneyline: "Penguins -180",
        spread: "Blackhawks +1.5",
        overUnder: "Under 5.5",
        time: "8:00 PM ET",
        pickDetail: "I've been sitting on this Blackhawks pick ALL WEEK. Their defense has been tightening up, and Pittsburgh is due for a letdown. Perfect spot for a live dog.",
        walletValue: "$175",
        confidenceLevel: 83,
        isPremium: true,
        betType: "Best Bet: Moneyline"
      },
      {
        id: 6,
        league: "EURO",
        game: "Man City vs Arsenal",
        moneyline: "Man City -115",
        spread: "Arsenal +0.5",
        overUnder: "Over 2.5",
        time: "2:30 PM ET",
        pickDetail: "Arsenal's form has been unreal, but City at home with everything on the line? Pure class will show up. City takes this one in a tight match with late-game heroics.",
        walletValue: "$150",
        confidenceLevel: 81,
        isPremium: true,
        betType: "Total: Over/Under",
        silverCard: true
      },
      {
        id: 7,
        league: "NFL",
        game: "Chiefs vs Eagles",
        moneyline: "Chiefs -135",
        spread: "Eagles +3",
        overUnder: "Over 48.5",
        time: "8:20 PM ET",
        pickDetail: "PRIMETIME SPECIAL: Sunday Night Football is where stars shine brightest, and Mahomes in prime time is automatic money. Chiefs not only cover, they dominate. This nationally televised matchup is getting all the attention, but Gary's seeing value that others are missing.",
        walletValue: "$250",
        confidenceLevel: 95,
        isPremium: true,
        betType: "Spread Pick",
        primeTimeCard: true
      }
    ];
  }
};
