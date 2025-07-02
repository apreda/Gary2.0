import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name correctly in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants
const ODDS_API_KEY = process.env.VITE_ODDS_API_KEY;
const ODDS_API_BASE_URL = 'https://api.the-odds-api.com/v4';

if (!ODDS_API_KEY) {
  console.error('❌ ODDS_API_KEY not found in environment variables');
  process.exit(1);
}

/**
 * Makes a Gary AI pick based on game data
 */
const makeGaryPick = (gameData) => {
  const confidenceLevel = 0.6 + Math.random() * 0.4;
  let betType = 'straight_moneyline';
  if (confidenceLevel > 0.9) betType = 'straight_moneyline';
  else if (confidenceLevel > 0.75) betType = 'spread';
  else if (confidenceLevel > 0.6) betType = 'parlay';
  
  const stake = Math.floor(gameData.bankroll * confidenceLevel * 0.05);
  
  return {
    game_id: gameData.gameId,
    team: gameData.teamKey,
    bet_type: betType,
    line: gameData.dataMetrics.line,
    stake,
    status: confidenceLevel > 0.6 ? 'YES' : 'NO',
    confidence: confidenceLevel,
    rationale: {
      brain_score: confidenceLevel,
      soul_score: 0.7,
      bias_boost: Math.random() * 0.5,
      memory_mod: 0.7,
      profit_infl: 0.8
    },
    trap_safe: gameData.dataMetrics.market.publicPct > 70 ? { isTrap: true } : { isTrap: false },
    gut_override: Math.random() > 0.7,
    emotional_tags: []
  };
};

/**
 * Get sports list from The Odds API
 */
const getSports = async () => {
  try {
    console.log('📊 Fetching sports from The Odds API...');
    console.log(`API Key (first 4 chars): ${ODDS_API_KEY.substring(0, 4)}...`);
    
    const response = await axios.get(`${ODDS_API_BASE_URL}/sports`, {
      params: { apiKey: ODDS_API_KEY }
    });
    
    console.log(`✅ Successfully fetched ${response.data.length} sports`);
    return response.data;
  } catch (error) {
    console.error('❌ Error fetching sports:', error.message);
    if (error.response) {
      console.error('API response error:', error.response.data);
      console.error('Status code:', error.response.status);
    }
    
    console.log('⚠️ Returning mock sports data instead');
    return [
      { key: 'basketball_nba', active: true, has_outrights: false, title: 'NBA' },
      { key: 'baseball_mlb', active: true, has_outrights: false, title: 'MLB' },
      { key: 'icehockey_nhl', active: true, has_outrights: false, title: 'NHL' },
      { key: 'soccer_epl', active: true, has_outrights: false, title: 'Premier League' }
    ];
  }
};

/**
 * Get odds for a specific sport
 */
const getOdds = async (sport) => {
  try {
    console.log(`📊 Fetching odds for ${sport}...`);
    
    const response = await axios.get(`${ODDS_API_BASE_URL}/sports/${sport}/odds`, {
      params: {
        apiKey: ODDS_API_KEY,
        regions: 'us',
        markets: 'spreads,totals,h2h',
        oddsFormat: 'american'
      }
    });
    
    console.log(`✅ Successfully fetched ${response.data.length} games for ${sport}`);
    return response.data;
  } catch (error) {
    console.error(`❌ Error fetching odds for ${sport}:`, error.message);
    if (error.response) {
      console.error('API response error:', error.response?.data);
      console.error('Status code:', error.response?.status);
    }
    
    console.log(`⚠️ Returning mock game data for ${sport}`);
    return [createMockGame(sport)];
  }
};

/**
 * Create mock game data
 */
const createMockGame = (sport) => {
  return {
    id: `mock_${sport}_${Date.now()}`,
    sport_key: sport,
    commence_time: new Date(Date.now() + 86400000).toISOString(),
    home_team: sport.includes('nba') ? 'Chicago Bulls' : 
               sport.includes('mlb') ? 'New York Yankees' : 
               sport.includes('nhl') ? 'Pittsburgh Penguins' : 'Manchester City',
    away_team: sport.includes('nba') ? 'Boston Celtics' : 
               sport.includes('mlb') ? 'Boston Red Sox' : 
               sport.includes('nhl') ? 'Chicago Blackhawks' : 'Arsenal',
    bookmakers: [
      {
        key: 'fanduel',
        markets: [
          {
            key: 'h2h',
            outcomes: [
              { name: sport.includes('nba') ? 'Chicago Bulls' : 
                       sport.includes('mlb') ? 'New York Yankees' : 
                       sport.includes('nhl') ? 'Pittsburgh Penguins' : 'Manchester City', 
                price: -150 },
              { name: sport.includes('nba') ? 'Boston Celtics' : 
                       sport.includes('mlb') ? 'Boston Red Sox' : 
                       sport.includes('nhl') ? 'Chicago Blackhawks' : 'Arsenal', 
                price: +130 }
            ]
          },
          {
            key: 'spreads',
            outcomes: [
              { name: sport.includes('nba') ? 'Chicago Bulls' : 
                       sport.includes('mlb') ? 'New York Yankees' : 
                       sport.includes('nhl') ? 'Pittsburgh Penguins' : 'Manchester City', 
                point: -3.5,
                price: -110 },
              { name: sport.includes('nba') ? 'Boston Celtics' : 
                       sport.includes('mlb') ? 'Boston Red Sox' : 
                       sport.includes('nhl') ? 'Chicago Blackhawks' : 'Arsenal', 
                point: +3.5,
                price: -110 }
            ]
          },
          {
            key: 'totals',
            outcomes: [
              { name: 'Over', 
                point: sport.includes('nba') ? 210.5 : 
                       sport.includes('mlb') ? 8.5 : 
                       sport.includes('nhl') ? 5.5 : 2.5,
                price: -110 },
              { name: 'Under', 
                point: sport.includes('nba') ? 210.5 : 
                       sport.includes('mlb') ? 8.5 : 
                       sport.includes('nhl') ? 5.5 : 2.5,
                price: -110 }
            ]
          }
        ]
      }
    ]
  };
};

/**
 * Generate narrative for a game
 */
const generateNarrative = (game) => {
  const homeTeam = game.home_team;
  const awayTeam = game.away_team;
  
  const narratives = [
    `${homeTeam} has been on FIRE lately, absolutely DOMINANT at home. The ${awayTeam} defense is SWISS CHEESE right now.`,
    `Everyone thinks ${awayTeam} is the easy play here, but that's EXACTLY what Vegas wants you to think. This line STINKS.`,
    `${homeTeam} is coming off a tough loss, but they've been MONEY after losses, covering in 7 of their last 9.`,
    `The public is ALL OVER ${awayTeam}, but the sharp money is POUNDING ${homeTeam}. Follow the money, not the crowd.`,
    `${homeTeam} is 0-5 ATS in their last 5, but this is a PERFECT spot for a bounce-back. Regression to the mean is REAL.`
  ];
  
  return {
    text: narratives[Math.floor(Math.random() * narratives.length)],
    momentum: Math.random()
  };
};

/**
 * Get batch odds for multiple sports
 */
const getBatchOdds = async (sports) => {
  const batchOdds = {};
  
  for (const sport of sports) {
    try {
      const odds = await getOdds(sport);
      batchOdds[sport] = odds;
    } catch (error) {
      console.error(`Error getting odds for ${sport}:`, error.message);
      batchOdds[sport] = [createMockGame(sport)];
    }
  }
  
  return batchOdds;
};

/**
 * Generate fallback picks when API fails
 */
const getFallbackPicks = () => {
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
      pickDetail: "",
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
    }
  ];
};

/**
 * Main function to generate daily picks
 */
const generateDailyPicks = async () => {
  try {
    console.log('🚀 Starting pick generation process...');
    
    // Get sports
    const sportsList = await getSports();
    console.log(`📋 Retrieved ${sportsList.length} sports`);
    
    // Filter active sports
    const activeSports = sportsList
      .filter(sport => sport.active && !sport.has_outrights)
      .map(sport => sport.key);
    console.log(`🎯 Found ${activeSports.length} active sports: ${activeSports.join(', ')}`);
    
    // Prioritize popular sports
    const sportPriority = [
      'basketball_nba', 
      'baseball_mlb', 
      'americanfootball_nfl',
      'icehockey_nhl',
      'soccer_epl'
    ];
    
    const prioritizedSports = activeSports
      .sort((a, b) => {
        const aIndex = sportPriority.indexOf(a);
        const bIndex = sportPriority.indexOf(b);
        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
      })
      .slice(0, 4);
    
    // If we don't have enough sports, use a fallback list
    const finalSports = prioritizedSports.length >= 2 ? prioritizedSports : [
      'basketball_nba',
      'baseball_mlb',
      'icehockey_nhl',
      'soccer_epl'
    ];
    
    console.log(`⭐ Selected ${finalSports.length} sports: ${finalSports.join(', ')}`);
    
    // Get odds for selected sports
    const batchOdds = await getBatchOdds(finalSports);
    console.log(`📊 Retrieved odds for ${Object.keys(batchOdds).length} sports`);
    
    // Check if we have any valid data
    const hasValidData = Object.values(batchOdds).some(odds => odds && odds.length > 0);
    console.log(`🔍 Has valid odds data: ${hasValidData ? '✅ YES' : '❌ NO'}`);
    
    // Generate picks
    let allPicks = [];
    let pickId = 1;
    
    for (const sport of finalSports) {
      const sportOdds = batchOdds[sport] || [];
      console.log(`📊 Processing ${sportOdds.length} games for ${sport}`);
      
      if (sportOdds.length === 0) {
        console.log(`⚠️ No games found for ${sport}, skipping`);
        continue;
      }
      
      // Filter for upcoming games
      const upcomingGames = sportOdds.filter(game => {
        const gameTime = new Date(game.commence_time);
        const now = new Date();
        const timeDiff = gameTime - now;
        const hoursUntilGame = timeDiff / (1000 * 60 * 60);
        return hoursUntilGame > 1 && hoursUntilGame < 36;
      });
      
      console.log(`📅 Found ${upcomingGames.length} upcoming games for ${sport}`);
      
      if (upcomingGames.length === 0) {
        console.log(`⚠️ No upcoming games found for ${sport}, skipping`);
        continue;
      }
      
      const game = upcomingGames[0];
      console.log(`🏆 Selected game: ${game.home_team} vs ${game.away_team}`);
      
      // Generate narrative
      const narrative = generateNarrative(game);
      
      // Generate pick data
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
        bankroll: 10000
      };
      
      const garyPick = makeGaryPick(mockData);
      
      // Format for UI
      const sportTitle = sport.includes('basketball_nba') ? 'NBA' : 
                       sport.includes('baseball_mlb') ? 'MLB' : 
                       sport.includes('football_nfl') ? 'NFL' : 
                       sport.includes('hockey_nhl') ? 'NHL' :
                       sport.includes('epl') ? 'EURO' :
                       sport.split('_').pop().toUpperCase();
      
      // Special card types
      const isPrimeTime = garyPick.confidence > 0.85 && 
                        new Date(game.commence_time).getHours() >= 19;
      
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
        moneyline: moneylineMarket ? 
          `${moneylineMarket.outcomes[0].name} ${moneylineMarket.outcomes[0].price > 0 ? '+' : ''}${moneylineMarket.outcomes[0].price}` : 
          "",
        spread: spreadMarket ? 
          `${spreadMarket.outcomes[0].name} ${spreadMarket.outcomes[0].point > 0 ? '+' : ''}${spreadMarket.outcomes[0].point}` : 
          "",
        overUnder: totalsMarket ? 
          `${totalsMarket.outcomes[0].name} ${totalsMarket.outcomes[0].point}` : 
          "",
        time: new Date(game.commence_time).toLocaleTimeString([], {hour: 'numeric', minute:'2-digit', timeZoneName: 'short'}),
        walletValue: `$${Math.floor(garyPick.stake)}`,
        pickDetail: narrative.text,
        confidenceLevel: Math.floor(garyPick.confidence * 100),
        betType: garyPick.bet_type === 'spread' ? 'Spread Pick' : 
                 garyPick.bet_type === 'parlay' ? 'Parlay Pick' :
                 'Best Bet: Moneyline',
        isPremium: allPicks.length > 0, // First pick is free
        primeTimeCard: isPrimeTime
      };
      
      allPicks.push(pick);
    }
    
    // Add a parlay pick
    if (allPicks.length >= 3) {
      const parlayPick = {
        id: pickId++,
        league: 'PARLAY',
        game: 'Parlay of the Day',
        moneyline: '',
        spread: '',
        overUnder: '',
        time: 'All Day',
        pickDetail: '',
        walletValue: '$50',
        confidenceLevel: 65,
        isPremium: true,
        betType: '3-Leg Parlay',
        parlayOdds: '+850',
        potentialPayout: '$950',
        parlayLegs: allPicks.slice(0, 3).map(pick => ({
          game: pick.game,
          pick: pick.spread || pick.moneyline || pick.overUnder,
          league: pick.league,
          betType: pick.betType.split(':')[0].trim()
        }))
      };
      
      allPicks.push(parlayPick);
    }
    
    // If we don't have enough picks, add fallbacks
    if (allPicks.length < 4) {
      console.log(`⚠️ Only generated ${allPicks.length} real picks, adding fallbacks`);
      
      const fallbackPicks = getFallbackPicks();
      
      // Extract the sport types we already have
      const existingSports = allPicks.map(pick => pick.league);
      
      // Filter fallbacks to avoid duplicating leagues we already have picks for
      const filteredFallbacks = fallbackPicks.filter(pick => 
        !existingSports.includes(pick.league) || pick.league === 'PARLAY'
      );
      
      // Add enough fallbacks to reach at least 4 total picks
      const neededCount = Math.max(0, 4 - allPicks.length);
      const picksToAdd = filteredFallbacks.slice(0, neededCount);
      
      // Adjust IDs of the fallback picks to avoid conflicts
      picksToAdd.forEach(pick => {
        pick.id = pickId++;
      });
      
      console.log(`➕ Adding ${picksToAdd.length} mock picks to the ${allPicks.length} real picks`);
      allPicks = [...allPicks, ...picksToAdd];
    }
    
    console.log(`✅ Generated ${allPicks.length} picks successfully`);
    return allPicks;
  } catch (error) {
    console.error('❌ Error generating picks:', error.message);
    return getFallbackPicks();
  }
};

// Save picks to localStorage file
const saveDailyPicksToFile = (picks) => {
  try {
    // Create the directory if it doesn't exist
    if (!fs.existsSync('../localStorage')) {
      fs.mkdirSync('../localStorage', { recursive: true });
    }
    
    // Create a mock localStorage object
    const localStorage = {
      dailyPicks: picks,
      lastPicksGenerationTime: new Date().toISOString()
    };
    
    // Save to file
    fs.writeFileSync(
      path.resolve(__dirname, '../localStorage/dailyPicks.json'), 
      JSON.stringify(localStorage, null, 2)
    );
    
    console.log(`✅ Saved picks to localStorage/dailyPicks.json`);
    return true;
  } catch (error) {
    console.error('❌ Error saving picks to file:', error.message);
    return false;
  }
};

// Main function
const main = async () => {
  console.log('🏈 Gary\'s Pick Generator 🏀');
  console.log('==========================');
  console.log('Generating daily picks...');
  
  try {
    // Generate picks
    const picks = await generateDailyPicks();
    
    // Save to localStorage file
    const saved = saveDailyPicksToFile(picks);
    
    if (saved) {
      console.log('💾 Pick generation complete! You can now:');
      console.log('1. Copy the localStorage/dailyPicks.json content to your browser\'s localStorage');
      console.log('2. Use this data with the scheduler service');
    }
    
    // Log picks to console
    console.log('\n📊 Generated Picks:\n');
    console.log(JSON.stringify(picks, null, 2));
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
  }
};

// Run the script
main();
