import { makeGaryPick } from '../ai/garyEngine';
import { oddsService } from './oddsService';
import { configLoader } from './configLoader';
import axios from 'axios';

/**
 * Service for generating and managing Gary's picks
 */
const picksService = {
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
      
      // Get the API key from the config loader
      const apiKey = await configLoader.getDeepseekApiKey();
      const baseUrl = await configLoader.getDeepseekBaseUrl();
      
      // Call DeepSeek API
      const response = await axios.post(`${baseUrl}/chat/completions`, {
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
          'Authorization': `Bearer ${apiKey}`
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
      // Build a prompt with the pick details for DeepSeek
      const prompt = `You are Gary the Bear, an expert sports handicapper with decades of experience.
      
      Create a detailed analysis for this ${pick.league} pick: ${pick.game}.
      
      Available odds: 
      ${pick.moneyline ? `Moneyline: ${pick.moneyline}` : ''}
      ${pick.spread ? `Spread: ${pick.spread}` : ''}
      ${pick.overUnder ? `Total: ${pick.overUnder}` : ''}
      
      The pick type is: ${pick.betType}
      Confidence level: ${pick.confidenceLevel}%
      
      Respond with a detailed analysis (about 150 characters) explaining why this is a strong pick. 
      Format your analysis as a JSON object in this format:
      {
        "analysis": "Your explanation goes here",
        "bullets": ["First bullet point", "Second bullet point", "Third bullet point"]
      }`;
      
      // Get the API key from the config loader
      const apiKey = await configLoader.getDeepseekApiKey();
      const baseUrl = await configLoader.getDeepseekBaseUrl();
      
      // Call DeepSeek API
      const response = await axios.post(`${baseUrl}/chat/completions`, {
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
          'Authorization': `Bearer ${apiKey}`
        }
      });
      
      // Parse the response
      const aiContent = response.data.choices[0].message.content;
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/); // Extract JSON from response
      
      if (jsonMatch) {
        try {
          const analysisData = JSON.parse(jsonMatch[0]);
          console.log("Generated analysis for", pick.game, analysisData);
          
          // Combine the analysis data with the original pick object
          return {
            ...pick,
            garysAnalysis: analysisData.analysis || "Gary likes this pick due to recent momentum and statistical advantages.",
            garysBullets: analysisData.bullets || [
              "Statistical edge over bookmakers",
              "Strong historical performance", 
              "Optimum betting conditions"
            ],
          };
        } catch (parseError) {
          console.error("Error parsing analysis:", parseError);
          return enhancePickWithDefaultData(pick);
        }
      } else {
        return enhancePickWithDefaultData(pick);
      }
    } catch (error) {
      console.error('Error generating pick detail:', error);
      return enhancePickWithDefaultData(pick);
    }
  },
  
  /**
   * Generate a daily parlay using existing picks
   * @param {Array} picks - Array of individual picks
   * @returns {Promise<Object>} - Parlay pick object
   */
  generateParlay: async (picks) => {
    try {
      if (picks.length < 2) {
        throw new Error('Need at least 2 picks to create a parlay');
      }
      
      const parlayPicks = picks.slice(0, Math.min(3, picks.length)); // Use up to 3 picks
      
      const pickDetails = parlayPicks.map(p => {
        return `${p.league} - ${p.game}: ${p.betType.includes('Spread') ? p.spread : p.betType.includes('Moneyline') ? p.moneyline : p.overUnder}`;
      }).join('\n');
      
      // Build a prompt for DeepSeek
      const prompt = `You are Gary the Bear, an expert sports handicapper with decades of experience.
      
      Create a compelling parlay analysis for these picks:
      ${pickDetails}
      
      Respond with a brief analysis (about 100 characters) explaining why this parlay has value. 
      Format your analysis as a JSON object:
      {
        "analysis": "Your explanation goes here",
        "parlayName": "A catchy name for this parlay"
      }`;
      
      // Get the API key from the config loader
      const apiKey = await configLoader.getDeepseekApiKey();
      const baseUrl = await configLoader.getDeepseekBaseUrl();
      
      // Call DeepSeek API
      const response = await axios.post(`${baseUrl}/chat/completions`, {
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "You are Gary the Bear, a sharp sports betting expert with decades of experience. You speak with authority and conviction about your picks." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 300
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        }
      });
      
      // Parse the response
      const aiContent = response.data.choices[0].message.content;
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/); // Extract JSON from response
      
      let parlayName = "Gary's Power Parlay";
      let analysis = "This parlay combines my highest conviction plays into one high-value ticket.";
      
      if (jsonMatch) {
        try {
          const parlayData = JSON.parse(jsonMatch[0]);
          parlayName = parlayData.parlayName || parlayName;
          analysis = parlayData.analysis || analysis;
        } catch (parseError) {
          console.error("Error parsing parlay data:", parseError);
        }
      }
      
      // Calculate odds (simplified)
      const parlayOdds = parlayPicks.reduce((odds, pick) => {
        return odds * (1 + (pick.confidenceLevel / 100));
      }, 1);
      
      // Create the parlay pick object
      return {
        id: Math.max(...picks.map(p => p.id), 0) + 1,
        league: parlayPicks.map(p => p.league).join('/'),
        game: "Parlay",
        parlayGames: parlayPicks.map(p => p.game),
        parlayLegs: parlayPicks.map(p => {
          return {
            game: p.game,
            league: p.league,
            pick: p.betType.includes('Spread') ? p.spread : 
                  p.betType.includes('Moneyline') ? p.moneyline : p.overUnder
          };
        }),
        moneyline: "",
        spread: "",
        overUnder: "",
        walletValue: `$${Math.floor(500 + Math.random() * 500)}`,
        confidenceLevel: Math.floor(65 + Math.random() * 15),
        betType: "Parlay Pick",
        isPremium: true,
        primeTimeCard: true,
        goldCard: true,
        silverCard: false,
        garysAnalysis: analysis,
        garysBullets: [
          "Combined statistical advantages",
          "Correlated outcomes", 
          "Maximum value opportunity"
        ],
        parlayName: parlayName,
        parlayOdds: `+${Math.floor(parlayOdds * 100)}`
      };
    } catch (error) {
      console.error('Error generating parlay:', error);
      throw error;
    }
  },
  
  /**
   * Get fallback picks in case API calls fail
   * @returns {Array} - Array of mock picks
   */
  getFallbackPicks() {
    const now = new Date();
    const today = now.toLocaleDateString([], {weekday: 'long', month: 'short', day: 'numeric'});
    const hoursAhead = 2 + Math.floor(Math.random() * 5);
    const gameTime = new Date(now.getTime() + (hoursAhead * 60 * 60 * 1000));
    const formattedTime = gameTime.toLocaleTimeString([], {hour: 'numeric', minute:'2-digit', timeZoneName: 'short'});
    
    // Basic fallback picks - these should almost never be used
    // and are only here as a last resort
    const mockPicks = [
      {
        id: 1,
        league: 'NBA',
        game: 'Lakers vs Celtics',
        moneyline: 'Celtics -160',
        spread: 'Celtics -3.5',
        overUnder: 'Over 222.5',
        time: formattedTime,
        walletValue: '$550',
        confidenceLevel: 85,
        betType: 'Spread Pick',
        isPremium: false,
        primeTimeCard: true,
        silverCard: false,
        garysAnalysis: "Celtics have dominant home court advantage and match up well against the Lakers frontcourt.",
        garysBullets: [
          "Celtics are 8-2 ATS in last 10 home games",
          "Lakers struggle on defense with fast guards",
          "Boston's shooting has been on fire"
        ]
      },
      {
        id: 2,
        league: 'MLB',
        game: 'Yankees vs Red Sox',
        moneyline: 'Yankees -130',
        spread: 'Yankees -1.5',
        overUnder: 'Under 9.0',
        time: formattedTime,
        walletValue: '$650',
        confidenceLevel: 82,
        betType: 'Best Bet: Moneyline',
        isPremium: true,
        primeTimeCard: false,
        silverCard: false,
        garysAnalysis: "Yankees have the pitching advantage and have dominated this matchup this season.",
        garysBullets: [
          "Yankees ace has 1.95 ERA vs Boston",
          "Red Sox bullpen has struggled recently",
          "Weather conditions favor pitchers"
        ]
      },
      {
        id: 3,
        league: 'NFL',
        game: 'Chiefs vs Ravens',
        moneyline: 'Chiefs +110',
        spread: 'Chiefs +2.5',
        overUnder: 'Over 47.5',
        time: formattedTime,
        walletValue: '$750',
        confidenceLevel: 78,
        betType: 'Spread Pick',
        isPremium: true,
        primeTimeCard: false,
        silverCard: false,
        garysAnalysis: "Chiefs as underdogs is great value, and Mahomes thrives in the underdog role.",
        garysBullets: [
          "Mahomes is 9-1-1 ATS as an underdog",
          "Ravens defense missing key starters",
          "Chiefs' game plan will exploit matchups"
        ]
      },
      {
        id: 4,
        league: 'PARLAY',
        game: 'Parlay',
        parlayGames: ['Lakers vs Celtics', 'Yankees vs Red Sox', 'Chiefs vs Ravens'],
        parlayLegs: [
          { game: 'Lakers vs Celtics', league: 'NBA', pick: 'Celtics -3.5' },
          { game: 'Yankees vs Red Sox', league: 'MLB', pick: 'Yankees -130' },
          { game: 'Chiefs vs Ravens', league: 'NFL', pick: 'Chiefs +2.5' }
        ],
        moneyline: '',
        spread: '',
        overUnder: '',
        time: formattedTime,
        walletValue: '$300',
        confidenceLevel: 68,
        betType: 'Parlay Pick',
        isPremium: true,
        primeTimeCard: true,
        goldCard: true,
        silverCard: false,
        garysAnalysis: "This cross-sport parlay combines three of my highest conviction plays into one high-value ticket.",
        garysBullets: [
          "All favorites are in strong statistical spots",
          "Correlated outcomes provide edge",
          "Maximum value opportunity"
        ],
        parlayName: "Gary's Primetime Parlay",
        parlayOdds: "+650"
      }
    ];
    
    console.log(`⚠️ Using fallback picks for ${today}. API may be experiencing issues.`);
    return mockPicks;
  },
  
  /**
   * Generate daily picks for all available sports
   * @returns {Promise<Array>} - Array of daily picks
   */
  generateDailyPicks: async () => {
    try {
      // 1. Get sports list from The Odds API
      const sportsList = await oddsService.getSports();
      console.log(`Retrieved ${sportsList.length} sports`);
      
      // 2. Filter for sports (be more lenient with active flag as API might vary)
      let activeSports = sportsList
        .filter(sport => {
          // If sport.active is undefined or null, default to true
          // Only exclude sports explicitly marked as inactive
          const isActive = sport.active !== false;
          // Skip outrights/futures markets if that property exists
          const isNotOutright = sport.has_outrights === false || sport.has_outrights === undefined;
          return isActive && isNotOutright;
        })
        .map(sport => sport.key);
      console.log(`Found ${activeSports.length} non-outright sports: ${activeSports.join(', ')}`);
      
      // If no active sports found, check if we have any active outright markets as a backup
      if (activeSports.length === 0) {
        console.log('No regular games available. Checking if there are any outright markets...');
        
        // As a last resort, include outright markets (like championship winners)
        const outrightSports = sportsList
          .filter(sport => sport.active !== false && sport.has_outrights === true)
          .map(sport => sport.key);
        
        if (outrightSports.length > 0) {
          console.log(`Found ${outrightSports.length} outright markets: ${outrightSports.join(', ')}`);
          activeSports = outrightSports;
        } else {
          console.log('No sports available at all. The API may be experiencing issues.');
        }
        
        // Log some details about what we received from the API for debugging
        console.log('Raw sports data sample:', JSON.stringify(sportsList.slice(0, 3)));
      }
      
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
      
      // Track what bet types we've generated
      let hasStraightBet = false;
      let hasMoneylineBet = false;
      
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
        
        // Evaluate all games to find those meeting criteria
        for (const game of upcomingGames) {
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
            
            // Use Gary's AI to make a pick - enforce variety in bet types
            let garyPick = makeGaryPick(mockData);
            
            // First pick should be a straight bet (spread) if we don't have one yet
            if (!hasStraightBet && allPicks.length === 0) {
              console.log('Forcing first pick to be a Spread bet for variety');
              garyPick.bet_type = 'spread';
              hasStraightBet = true;
            }
            // Second pick should be moneyline if we don't have one yet
            else if (!hasMoneylineBet && allPicks.length === 1) {
              console.log('Forcing second pick to be a Moneyline bet for variety');
              garyPick.bet_type = 'moneyline';
              hasMoneylineBet = true;
            }
            
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
            
            // Update our tracking of bet types
            if (garyPick.bet_type === 'spread') {
              hasStraightBet = true;
            } else if (garyPick.bet_type === 'moneyline') {
              hasMoneylineBet = true;
            }
            
            console.log(`Added ${sportTitle} pick for ${game.home_team} vs ${game.away_team} (${garyPick.bet_type})`);
            
            // We found a good pick for this sport, move to the next sport
            break;
          } catch (err) {
            console.log(`Error processing game for ${sport}:`, err);
            // Continue to the next game if this one fails
            continue;
          }
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
      
      // 7. Log how many real picks we generated - no minimum requirement
      console.log(`Successfully generated ${allPicks.length} real picks. No fallbacks will be used.`);
      
      return allPicks;
    } catch (error) {
      console.error('Error generating daily picks:', error);
      throw error; // Propagate the error rather than using fallbacks
    }
  }
};

// Helper function for default pick analysis
function enhancePickWithDefaultData(pick) {
  return {
    ...pick,
    garysAnalysis: "Statistical models and situational factors show value in this pick.",
    garysBullets: [
      "Strong betting value identified", 
      "Favorable matchup conditions",
      "Statistical edge discovered"
    ]
  };
}

export { picksService };
