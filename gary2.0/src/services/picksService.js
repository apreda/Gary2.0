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
      const sportTitle = sportKey.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
      
      // Extract odds data if available
      const homeOdds = game.bookmakers && game.bookmakers[0]?.markets.find(m => m.key === 'h2h')?.outcomes.find(o => o.name === homeTeam)?.price;
      const awayOdds = game.bookmakers && game.bookmakers[0]?.markets.find(m => m.key === 'h2h')?.outcomes.find(o => o.name === awayTeam)?.price;
      const pointSpread = game.bookmakers && game.bookmakers[0]?.markets.find(m => m.key === 'spreads')?.outcomes.find(o => o.name === homeTeam)?.point;
      
      // Create prompt for DeepSeek
      const prompt = `You are Gary the Bear, an expert sports handicapper with decades of experience. 
      Analyze this upcoming ${sportTitle} game between ${homeTeam} and ${awayTeam}.
      ${homeOdds ? `The moneyline is ${homeTeam} ${homeOdds > 0 ? '+' : ''}${homeOdds} vs ${awayTeam} ${awayOdds > 0 ? '+' : ''}${awayOdds}.` : ''}
      ${pointSpread ? `The spread is ${homeTeam} ${pointSpread > 0 ? '+' : ''}${pointSpread}.` : ''}
      
      Consider factors like recent form, injuries, matchup history, and betting trends.
      
      Respond with a JSON object in this exact format:
      {
        "revenge": boolean (is this a revenge game for either team),
        "superstition": boolean (are there any notable superstitions/streaks at play),
        "momentum": number (between 0-1, representing momentum factor importance),
        "rationale": string (brief 1-2 sentence analysis of the matchup)
      }`;
      
      // Call DeepSeek API
      const response = await axios.post(`${DEEPSEEK_BASE_URL}/chat/completions`, {
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "You are Gary the Bear, a sharp sports betting expert with decades of experience. You speak with authority and conviction about your picks." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 500
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
        }
      });
      
      // Parse the response
      const aiContent = response.data.choices[0].message.content;
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/); // Extract JSON from response
      
      if (jsonMatch) {
        const narrativeData = JSON.parse(jsonMatch[0]);
        console.log("Generated narrative for", game.home_team, "vs", game.away_team, narrativeData);
        return narrativeData;
      }
      
      throw new Error('Could not parse DeepSeek response');
    } catch (error) {
      console.error('Error generating narrative:', error);
      // Return a default narrative if API call fails
      return {
        revenge: Math.random() > 0.8,
        superstition: Math.random() > 0.9,
        momentum: 0.3 + Math.random() * 0.6,
        rationale: `${game.home_team} vs ${game.away_team} is a game where Gary's edge metrics see value.`
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
      const teams = pick.game.split(' vs ');
      const betType = pick.betType.split(':')[0].trim();
      const betDetails = pick.betType.includes('Spread') ? pick.spread : 
                        pick.betType.includes('Over/Under') ? pick.overUnder : 
                        pick.moneyline;
      
      // Create a prompt for DeepSeek
      const prompt = `You are Gary the Bear, a legendary sports handicapper known for your confident, colorful analysis.
      
      Generate an analysis for this pick:
      Game: ${pick.game}
      League: ${pick.league}
      Pick Type: ${betType}
      My Pick: ${betDetails}
      Confidence Level: ${pick.confidenceLevel}/100
      
      Write a 2-3 sentence pick analysis in Gary's distinctive style with these elements:
      1. Use CAPITALIZED words for emphasis (like "LOCK", "VALUE", "PRIME SPOT")
      2. Mention relevant stats, trends, or matchup advantages
      3. Use cocky, authoritative tone
      4. For high confidence picks (>85), emphasize conviction
      5. Keep it under 280 characters
      
      Include NO introduction or conclusion - JUST the analysis text.`;
      
      // Call DeepSeek API
      const response = await axios.post(`${DEEPSEEK_BASE_URL}/chat/completions`, {
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "You are Gary the Bear, a legendary sports handicapper. You speak confidently with brief, punchy analysis. You USE CAPS for emphasis and have a distinctive voice." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 300
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
        }
      });
      
      // Extract and clean the analysis
      let analysis = response.data.choices[0].message.content.trim();
      
      // Clean up the response (remove any markdown, quotes, etc.)
      analysis = analysis.replace(/^"(.*)"$/g, '$1');
      analysis = analysis.replace(/^```[\s\S]*```$/g, '');
      
      console.log(`Generated analysis for ${pick.game}:`, analysis);
      
      return {
        ...pick,
        pickDetail: analysis
      };
    } catch (error) {
      console.error('Error generating pick detail:', error);
      
      // Fallback to a more dynamic mock analysis
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
        id: picks.length + 1, // Assign ID after all individual picks
        league: 'PARLAY',
        game: 'Parlay of the Day',
        moneyline: '',
        spread: '',
        overUnder: '',
        time: 'All Day',
        pickDetail: '', // No Gary's Analysis on the front card
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
   * Get fallback picks in case API calls fail
   * @returns {Array} - Array of mock picks
   */
  getFallbackPicks: () => {
    console.log('Using fallback picks - generating all 7 picks for carousel');
    return [
      {
        id: 1,
        isPremium: false, // First card is free
        league: "NBA",
        game: "Celtics vs Bulls",
        moneyline: "Bulls -220",
        spread: "Celtics +3.5",
        overUnder: "Over 210.5",
        time: "7:10 PM ET",
        pickDetail: "Bulls are an absolute LOCK tonight. Do not fade me on this one, pal. Boston's defense is FULL of holes right now.",
        walletValue: "$150",
        confidenceLevel: 87,
        betType: "Best Bet: Moneyline",
        primeTimeCard: false,
        silverCard: false
      },
      {
        id: 2,
        isPremium: true,
        league: "NFL",
        game: "Patriots vs Giants",
        moneyline: "Patriots -150",
        spread: "Giants +4.0",
        overUnder: "Under 45.5",
        time: "1:00 PM ET",
        pickDetail: "Giants plus the points is the play. Pats' offense is struggling.",
        walletValue: "$200",
        confidenceLevel: 92,
        betType: "Spread Pick",
        primeTimeCard: false,
        silverCard: false
      },
      {
        id: 3,
        isPremium: true,
        league: "MLB",
        game: "Yankees vs Red Sox",
        moneyline: "Yankees -120",
        spread: "Red Sox +1.5",
        overUnder: "Over 8.5",
        time: "4:05 PM ET",
        pickDetail: "Yankees own the Red Sox this season. PERIOD. This is the closest thing to free money you'll ever see.",
        walletValue: "$100",
        confidenceLevel: 78,
        betType: "Total: Over/Under",
        primeTimeCard: false,
        silverCard: false
      },
      {
        id: 4,
        isPremium: true,
        league: "NHL",
        game: "Penguins vs Blackhawks",
        moneyline: "Penguins -180",
        spread: "Blackhawks +1.5",
        overUnder: "Under 5.5",
        time: "8:00 PM ET",
        pickDetail: "I've been sitting on this Blackhawks pick ALL WEEK. Their defense has been tightening up, and Pittsburgh is due for a letdown. Perfect spot for a live dog.",
        walletValue: "$175",
        confidenceLevel: 83,
        betType: "Best Bet: Moneyline",
        primeTimeCard: false,
        silverCard: false
      },
      {
        id: 5,
        isPremium: true,
        league: "EURO",
        game: "Man City vs Arsenal",
        moneyline: "Man City -115",
        spread: "Arsenal +0.5",
        overUnder: "Over 2.5",
        time: "2:30 PM ET",
        pickDetail: "Arsenal's form has been unreal, but City at home with everything on the line? Pure class will show up. City takes this one in a tight match with late-game heroics.",
        walletValue: "$150",
        confidenceLevel: 81,
        betType: "Total: Over/Under",
        primeTimeCard: false,
        silverCard: true // Silver edition card (European soccer)
      },
      {
        id: 6,
        isPremium: true,
        league: "NFL",
        game: "Chiefs vs Eagles",
        moneyline: "Chiefs -135",
        spread: "Eagles +3",
        overUnder: "Over 48.5",
        time: "8:20 PM ET",
        pickDetail: "PRIMETIME SPECIAL: Sunday Night Football is where stars shine brightest, and Mahomes in prime time is automatic money. Chiefs not only cover, they dominate.",
        walletValue: "$250",
        confidenceLevel: 95,
        betType: "Spread Pick",
        primeTimeCard: true, // Black PrimeTime bonus pick
        silverCard: false
      },
      {
        id: 7,
        isPremium: true,
        league: "PARLAY",
        game: "Parlay of the Day",
        moneyline: "",
        spread: "",
        overUnder: "",
        time: "All Day",
        pickDetail: "Three-leg parlay with massive value. This is how we'll build our bankroll.",
        walletValue: "$50",
        confidenceLevel: 65,
        betType: "3-Leg Parlay",
        primeTimeCard: false,
        silverCard: false,
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
      }
    ];
  },
  
  /**
   * Generate daily picks for all available sports
   * @returns {Promise<Array>} - Array of daily picks
   */
  generateDailyPicks: async () => {
    try {
      console.log('[PICKS DEBUG] Attempting to generate daily picks...');
      
      // 1. Get sports list from The Odds API
      const sportsList = await oddsService.getSports();
      console.log(`Retrieved ${sportsList.length} sports`);
      
      // 2. Filter for active sports with events (excluding outrights/futures)
      const activeSports = sportsList
        .filter(sport => sport.active && !sport.has_outrights)
        .map(sport => sport.key);
      console.log(`Found ${activeSports.length} active sports: ${activeSports.join(', ')}`);
      
      // 3. Prioritize popular sports that are currently in season
      const sportPriority = [
        'basketball_nba', 
        'basketball_ncaab',
        'baseball_mlb', 
        'americanfootball_nfl',
        'americanfootball_ncaaf',
        'icehockey_nhl',
        'soccer_epl',
        'soccer_uefa_champs_league',
        'soccer_spain_la_liga',
        'soccer_italy_serie_a'
      ];
      
      // Sort sports by priority and take top 4
      const prioritizedSports = activeSports.sort((a, b) => {
        const aIndex = sportPriority.indexOf(a);
        const bIndex = sportPriority.indexOf(b);
        // If sport isn't in priority list, give it a low priority
        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
      }).slice(0, 4);
      
      console.log(`Selected ${prioritizedSports.length} prioritized sports: ${prioritizedSports.join(', ')}`);
      
      // 4. Get odds for selected sports
      const batchOdds = await oddsService.getBatchOdds(prioritizedSports);
      
      // 5. Process each sport and select games
      let allPicks = [];
      let pickId = 1;
      
      // Process each sport for regular picks
      for (const sport of prioritizedSports) {
        const sportOdds = batchOdds[sport] || [];
        console.log(`Retrieved ${sportOdds.length} games for ${sport}`);
        
        if (sportOdds.length === 0) continue;
        
        // Filter for games in the next 36 hours
        const upcomingGames = sportOdds.filter(game => {
          const gameTime = new Date(game.commence_time);
          const now = new Date();
          const timeDiff = gameTime - now;
          const hoursUntilGame = timeDiff / (1000 * 60 * 60);
          
          // Games in the next 36 hours, but not starting in the next hour
          return hoursUntilGame > 1 && hoursUntilGame < 36;
        });
        
        if (upcomingGames.length === 0) continue;
        
        // Choose a game from this sport
        const game = upcomingGames[0];
        try {
          // Generate narrative for context
          const narrative = await picksService.generateNarrative(game);
          
          // Mock data for garyEngine input
          const mockData = {
            gameId: game.id,
            teamKey: game.home_team,
            playerKeys: [],
            dataMetrics: {
              ev: 0.6 + Math.random() * 0.4,
              line: `${game.home_team} vs ${game.away_team}`,
              market: {
                lineMoved: Math.random() > 0.5,
                publicPct: Math.floor(Math.random() * 100)
              }
            },
            narrative: narrative,
            pastPerformance: {
              gutOverrideHits: Math.floor(Math.random() * 10),
              totalGutOverrides: 10
            },
            progressToTarget: 0.7,
            bankroll: 10000
          };
          
          // Use Gary's AI to make a pick
          const garyPick = makeGaryPick(mockData);
          
          // Format the pick for our UI
          const sportTitle = sport.includes('basketball_nba') ? 'NBA' : 
                            sport.includes('baseball_mlb') ? 'MLB' : 
                            sport.includes('football_nfl') ? 'NFL' : 
                            sport.includes('hockey_nhl') ? 'NHL' :
                            sport.includes('epl') ? 'EURO' :
                            sport.split('_').pop().toUpperCase();
          
          // Special card types
          const isPrimeTime = garyPick.confidence > 0.85 && game.commence_time && 
                           new Date(game.commence_time).getHours() >= 19;
          const isSilverCard = sportTitle === 'EURO';
          
          // Extract odds data
          const bookmaker = game.bookmakers && game.bookmakers[0];
          const moneylineMarket = bookmaker?.markets.find(m => m.key === 'h2h');
          const spreadMarket = bookmaker?.markets.find(m => m.key === 'spreads');
          const totalsMarket = bookmaker?.markets.find(m => m.key === 'totals');
          
          // Create the pick object
          const pick = {
            id: pickId++,
            league: sportTitle,
            game: `${game.home_team} vs ${game.away_team}`,
            moneyline: moneylineMarket ? `${moneylineMarket.outcomes[0].name} ${moneylineMarket.outcomes[0].price > 0 ? '+' : ''}${moneylineMarket.outcomes[0].price}` : "",
            spread: spreadMarket ? `${spreadMarket.outcomes[0].name} ${spreadMarket.outcomes[0].point > 0 ? '+' : ''}${spreadMarket.outcomes[0].point}` : "",
            overUnder: totalsMarket ? `${totalsMarket.outcomes[0].name} ${totalsMarket.outcomes[0].point}` : "",
            time: new Date(game.commence_time).toLocaleTimeString([], {hour: 'numeric', minute:'2-digit', timeZoneName: 'short'}),
            walletValue: `$${Math.floor(garyPick.stake)}`,
            confidenceLevel: Math.floor(garyPick.rationale.brain_score * 100),
            betType: garyPick.bet_type === 'spread' ? 'Spread Pick' : 
                     garyPick.bet_type === 'parlay' ? 'Parlay Pick' :
                     garyPick.bet_type === 'same_game_parlay' ? 'SGP Pick' :
                     'Best Bet: Moneyline',
            isPremium: allPicks.length > 0, // First pick is free
            primeTimeCard: isPrimeTime,
            silverCard: isSilverCard
          };
          
          // Generate detailed analysis
          const detailedPick = await picksService.generatePickDetail(pick);
          allPicks.push(detailedPick);
          
          console.log(`Added ${sportTitle} pick for ${game.home_team} vs ${game.away_team}`);
        } catch (error) {
          console.error(`Error creating pick for ${sport}:`, error);
        }
      }
      
      // 6. Add a PARLAY pick if we have enough individual picks
      if (allPicks.length >= 3) {
        try {
          const parlay = await picksService.generateParlay(allPicks);
          allPicks.push(parlay);
          console.log('Added parlay pick.');
        } catch (error) {
          console.error('Error generating parlay:', error);
        }
      }
      
      // 7. If we didn't get enough picks, use fallbacks
      if (allPicks.length < 7) {
        console.warn(`Only generated ${allPicks.length} picks, using fallbacks.`);
        return picksService.getFallbackPicks();
      }
      
      return allPicks;
    } catch (error) {
      console.error('Error generating daily picks:', error);
      return picksService.getFallbackPicks();
    }
  }
};
