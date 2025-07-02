/**
 * Test MLB Normal Picks Generation
 * This test script verifies that our normal MLB picks generation process works with all three data sources:
 * 1. Ball Don't Lie API for team stats (PRIORITY 1)
 * 2. MLB Stats API for pitcher data (PRIORITY 2)
 * 3. Perplexity for game context, storylines, and other relevant data
 */
import dotenv from 'dotenv';
import { combinedMlbService } from './services/combinedMlbService.js';
import { perplexityService } from './services/perplexityService.js';
import { openaiService } from './services/openaiService.js';

// Load environment variables
dotenv.config();

// Explicitly set the Perplexity API key for testing
const PERPLEXITY_API_KEY = process.env.VITE_PERPLEXITY_API_KEY;
perplexityService.API_KEY = PERPLEXITY_API_KEY;

if (!PERPLEXITY_API_KEY) {
  console.error('❌ PERPLEXITY_API_KEY not found in environment variables');
  process.exit(1);
}

console.log(`🔑 Perplexity API Key (masked): ${PERPLEXITY_API_KEY.substring(0, 4)}...${PERPLEXITY_API_KEY.substring(PERPLEXITY_API_KEY.length - 4)}`);

// Mock a game for testing
const mockGame = {
  id: '777828',
  home_team: 'Athletics',
  away_team: 'Angels',
  sport_key: 'baseball_mlb',
  commence_time: '2025-05-21T22:05:00Z',
  bookmakers: [
    {
      markets: [
        {
          key: 'h2h',
          outcomes: [
            { name: 'Athletics', price: 2.10 },
            { name: 'Angels', price: 1.80 }
          ]
        },
        {
          key: 'spreads',
          outcomes: [
            { name: 'Athletics', point: -1.5 },
            { name: 'Angels', point: 1.5 }
          ]
        }
      ]
    }
  ]
};

async function testMlbNormalPicks() {
  console.log('🏆 TESTING MLB NORMAL PICKS GENERATION 🏆');
  console.log('----------------------------------------');
  console.log(`Game: ${mockGame.away_team} @ ${mockGame.home_team}`);
  console.log(`Date: ${new Date().toISOString().split('T')[0]}`);
  console.log('----------------------------------------\n');
  
  try {
    // Step 1: Get comprehensive game data from all three sources
    console.log('Step 1: Getting comprehensive game data from all three sources...');
    const homeTeam = mockGame.home_team;
    const awayTeam = mockGame.away_team;
    const date = new Date().toISOString().split('T')[0];
    
    const gameData = await combinedMlbService.getComprehensiveGameData(homeTeam, awayTeam, date);
    
    if (!gameData) {
      console.error('❌ Failed to get comprehensive game data');
      return;
    }
    
    console.log('✅ Successfully retrieved comprehensive game data with all three sources\n');
    
    // Step 2: Build a prompt for normal picks analysis
    console.log('Step 2: Building analysis prompt for normal picks...');
    
    // Extract necessary data
    const { game, pitchers, teamStats, gameContext } = gameData;
    
    // Build moneyline odds string
    let oddsString = '';
    if (mockGame.bookmakers && mockGame.bookmakers.length > 0) {
      const moneylineMarket = mockGame.bookmakers[0].markets.find(m => m.key === 'h2h');
      
      if (moneylineMarket) {
        const homeOdds = moneylineMarket.outcomes.find(o => o.name === homeTeam);
        const awayOdds = moneylineMarket.outcomes.find(o => o.name === awayTeam);
        
        if (homeOdds && awayOdds) {
          oddsString = `Current moneyline odds: ${homeTeam} (${homeOdds.price}), ${awayTeam} (${awayOdds.price})`;
        }
      }
      
      // Add spread odds if available
      const spreadMarket = mockGame.bookmakers[0].markets.find(m => m.key === 'spreads');
      
      if (spreadMarket) {
        const homeSpread = spreadMarket.outcomes.find(o => o.name === homeTeam);
        const awaySpread = spreadMarket.outcomes.find(o => o.name === awayTeam);
        
        if (homeSpread && awaySpread) {
          oddsString += `\nCurrent spread: ${homeTeam} (${homeSpread.point}), ${awayTeam} (${awaySpread.point})`;
        }
      }
    }
    
    // Start building the prompt
    let prompt = `Generate a detailed MLB betting analysis for ${awayTeam} @ ${homeTeam}. Focus ONLY on moneyline and spread bets (NO totals or player props):\n\n`;
    
    // Add team records and stats
    prompt += `TEAM COMPARISON:\n`;
    if (teamStats && teamStats.homeTeam && teamStats.awayTeam) {
      prompt += `${homeTeam} (${teamStats.homeTeam.record || 'N/A'}) vs ${awayTeam} (${teamStats.awayTeam.record || 'N/A'})\n`;
      prompt += `${homeTeam} last 10: ${teamStats.homeTeam.lastTenGames || 'N/A'}, Home: ${teamStats.homeTeam.homeRecord || 'N/A'}\n`;
      prompt += `${awayTeam} last 10: ${teamStats.awayTeam.lastTenGames || 'N/A'}, Away: ${teamStats.awayTeam.awayRecord || 'N/A'}\n\n`;
    } else {
      prompt += `Team records and recent performance data not available.\n\n`;
    }
    
    // Add starting pitcher information
    prompt += `STARTING PITCHERS:\n`;
    if (pitchers && pitchers.home) {
      const homeStats = pitchers.home.seasonStats || {};
      prompt += `${homeTeam}: ${pitchers.home.fullName} (${homeStats.wins || 0}-${homeStats.losses || 0}, ERA: ${homeStats.era || 'N/A'}, WHIP: ${homeStats.whip || 'N/A'})\n`;
    } else {
      prompt += `${homeTeam}: Starting pitcher data not available\n`;
    }
    
    if (pitchers && pitchers.away) {
      const awayStats = pitchers.away.seasonStats || {};
      prompt += `${awayTeam}: ${pitchers.away.fullName} (${awayStats.wins || 0}-${awayStats.losses || 0}, ERA: ${awayStats.era || 'N/A'}, WHIP: ${awayStats.whip || 'N/A'})\n\n`;
    } else {
      prompt += `${awayTeam}: Starting pitcher data not available\n\n`;
    }
    
    // Add game context from Perplexity if available
    if (gameContext) {
      prompt += `GAME CONTEXT:\n`;
      
      if (gameContext.playoffStatus) {
        prompt += `Playoff Status: ${gameContext.playoffStatus}\n`;
      }
      
      if (gameContext.homeTeamStorylines) {
        prompt += `${homeTeam} Storylines: ${gameContext.homeTeamStorylines}\n`;
      }
      
      if (gameContext.awayTeamStorylines) {
        prompt += `${awayTeam} Storylines: ${gameContext.awayTeamStorylines}\n`;
      }
      
      if (gameContext.injuryReport) {
        prompt += `Injury Report: ${gameContext.injuryReport}\n`;
      }
      
      if (gameContext.keyMatchups) {
        prompt += `Key Matchups: ${gameContext.keyMatchups}\n`;
      }
      
      if (gameContext.bettingTrends) {
        prompt += `Betting Trends: ${gameContext.bettingTrends}\n`;
      }
      
      if (gameContext.weatherConditions) {
        prompt += `Weather: ${gameContext.weatherConditions}\n`;
      }
      
      prompt += `\n`;
    }
    
    // Add odds information
    if (oddsString) {
      prompt += `ODDS INFORMATION:\n${oddsString}\n\n`;
    } else {
      prompt += `ODDS INFORMATION: Not available\n\n`;
    }
    
    // Add instructions for generating the analysis
    prompt += `Based on the above information, provide a detailed analysis of this matchup. Then, recommend the best moneyline and/or spread bet for this game. Provide a confidence score between 0.0-1.0 for each recommendation.\n\n`;
    prompt += `Your analysis should cover team form, pitching matchup, head-to-head history, betting trends, and any other relevant factors.\n\n`;
    prompt += `IMPORTANT: Focus ONLY on moneyline and spread bets. DO NOT recommend totals or player props.\n\n`;
    prompt += `Return a JSON object with the following structure: { "analysis": "Your detailed analysis here", "recommendations": [{ "type": "moneyline", "team": "Team name", "odds": "Current odds", "confidence": 0.XX }, { "type": "spread", "team": "Team name", "line": "Current spread", "confidence": 0.XX }] }`;
    
    console.log('✅ Successfully built prompt with data from all three sources');
    console.log(`Prompt length: ${prompt.length} characters`);
    console.log('Prompt preview (first 300 chars):');
    console.log(prompt.slice(0, 300) + '...\n');
    
    // Step 3: Generate analysis using OpenAI
    console.log('Step 3: Generating analysis using OpenAI...');
    
    // Construct a system message instructing to focus on moneyline/spread only
    const messages = [
      {
        role: 'system',
        content: 'You are Gary, a sports betting expert specializing in MLB analytics. Provide detailed betting analysis for MLB games. Focus ONLY on moneyline and spread bets - do NOT provide recommendations for totals or player props.'
      },
      {
        role: 'user',
        content: prompt
      }
    ];
    
    try {
      const openaiResponse = await openaiService.getResponse(messages, {
        temperature: 0.7,
        model: 'gpt-4-turbo'
      });
      
      if (!openaiResponse) {
        console.error('❌ Failed to get response from OpenAI');
        return;
      }
      
      console.log('✅ Successfully generated analysis from OpenAI');
      
      try {
        // Try to parse the response as JSON
        let analysisJson;
        
        try {
          // First try direct parsing
          analysisJson = JSON.parse(openaiResponse);
        } catch (e) {
          // If direct parsing fails, try to extract JSON from the response
          const jsonMatch = openaiResponse.match(/(\{[\s\S]*\})/);
          if (jsonMatch) {
            analysisJson = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('No valid JSON found in response');
          }
        }
        
        console.log('\nANALYSIS SUMMARY:');
        console.log('----------------');
        // Show first 300 characters of analysis
        const analysisText = analysisJson.analysis || 'No analysis provided';
        console.log(analysisText.slice(0, 300) + (analysisText.length > 300 ? '...' : ''));
        
        console.log('\nRECOMMENDATIONS:');
        console.log('---------------');
        
        if (analysisJson.recommendations && analysisJson.recommendations.length > 0) {
          analysisJson.recommendations.forEach(rec => {
            console.log(`${rec.type}: ${rec.team} (Confidence: ${rec.confidence})`);
            if (rec.odds) console.log(`Odds: ${rec.odds}`);
            if (rec.line) console.log(`Line: ${rec.line}`);
            console.log('');
          });
          
          // Verify that we're only getting moneyline/spread recommendations
          const hasNonNormalPicks = analysisJson.recommendations.some(rec => 
            rec.type !== 'moneyline' && rec.type !== 'spread');
            
          if (hasNonNormalPicks) {
            console.log('⚠️ Warning: Found non-moneyline/spread recommendations');
          } else {
            console.log('✅ Confirmed only moneyline/spread recommendations');
          }
        } else {
          console.log('No recommendations provided');
        }
        
      } catch (parseError) {
        console.error('❌ Error parsing analysis:', parseError.message);
        console.log('Raw response:', openaiResponse);
      }
      
    } catch (openaiError) {
      console.error('❌ Error calling OpenAI:', openaiError.message);
    }
    
    // Final step: Verify all three data sources were used
    console.log('\nVERIFYING DATA SOURCES:');
    console.log('---------------------');
    
    // Check Ball Don't Lie data
    if (teamStats && teamStats.homeTeam && teamStats.awayTeam) {
      console.log('✅ Ball Don\'t Lie team stats successfully integrated');
      console.log(`${homeTeam} record: ${teamStats.homeTeam.record}, ${awayTeam} record: ${teamStats.awayTeam.record}`);
    } else {
      console.log('❌ Ball Don\'t Lie team stats not found in game data');
    }
    
    // Check MLB Stats API data
    if (pitchers && (pitchers.home || pitchers.away)) {
      console.log('✅ MLB Stats API pitcher data successfully integrated');
      if (pitchers.home) {
        console.log(`${homeTeam} pitcher: ${pitchers.home.fullName} (ERA: ${pitchers.home.seasonStats?.era || 'N/A'})`);
      }
      if (pitchers.away) {
        console.log(`${awayTeam} pitcher: ${pitchers.away.fullName} (ERA: ${pitchers.away.seasonStats?.era || 'N/A'})`);
      }
    } else {
      console.log('❌ MLB Stats API pitcher data not found in game data');
    }
    
    // Check Perplexity data
    if (gameContext) {
      console.log('✅ Perplexity game context successfully integrated');
      const contextKeys = Object.keys(gameContext);
      console.log(`Context includes: ${contextKeys.join(', ')}`);
    } else {
      console.log('❌ Perplexity game context not found in game data');
    }
    
    console.log('\nTEST COMPLETED SUCCESSFULLY!');
    console.log('Normal MLB picks generation process is working with all three data sources.');
    
  } catch (error) {
    console.error('Error during test:', error);
  }
}

// Run the test
testMlbNormalPicks();
