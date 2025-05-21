/**
 * Complete MLB Integration Test
 * Tests all three components of our enhanced normal picks system:
 * 1. Ball Don't Lie for team stats
 * 2. MLB Stats API for accurate pitcher data
 * 3. Perplexity for game context, storylines, and other relevant details
 * 
 * Focuses on the Angels vs Athletics game on May 21, 2025
 */
import dotenv from 'dotenv';
import { ballDontLieService } from './services/ballDontLieService.js';
import { mlbStatsApiService } from './services/mlbStatsApiService.js';
import { perplexityService } from './services/perplexityService.js';

// Load environment variables
dotenv.config();

// Explicitly set the Perplexity API key
const PERPLEXITY_API_KEY = process.env.VITE_PERPLEXITY_API_KEY || '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';
perplexityService.API_KEY = PERPLEXITY_API_KEY;
console.log(`🔑 Perplexity API Key (masked): ${PERPLEXITY_API_KEY.substring(0, 4)}...${PERPLEXITY_API_KEY.substring(PERPLEXITY_API_KEY.length - 4)}`);

const targetHomeTeam = 'Athletics';
const targetAwayTeam = 'Angels';
const targetDate = '2025-05-21';

async function testCompleteIntegration() {
  console.log('🏆 COMPLETE MLB INTEGRATION TEST 🏆');
  console.log('-------------------------------------');
  console.log(`Target Game: ${targetAwayTeam} @ ${targetHomeTeam}`);
  console.log(`Date: ${targetDate}`);
  console.log('-------------------------------------\n');
  
  // Initialize variables to collect data from each source
  let teamComparisonStats = null;
  let targetGame = null;
  let startingPitchers = null;
  let gameContext = null;
  let jsonMatch = null;
  
  try {
    // STEP 1: Test Ball Don't Lie for team stats
    console.log('STEP 1: Testing Ball Don\'t Lie for team stats...');
    console.log('-------------------------------------');
    
    const teamComparisonStats = await ballDontLieService.getMlbTeamComparisonStats(targetHomeTeam, targetAwayTeam);
    
    if (teamComparisonStats && teamComparisonStats.homeTeam && teamComparisonStats.awayTeam) {
      console.log('✅ Successfully retrieved team comparison stats from Ball Don\'t Lie');
      
      // Display home team stats
      console.log(`\n${targetHomeTeam} Stats:`);
      const homeTeamStats = teamComparisonStats.homeTeam;
      Object.keys(homeTeamStats).forEach(key => {
        if (typeof homeTeamStats[key] !== 'object' && key !== 'teamName') {
          console.log(`${key}: ${homeTeamStats[key]}`);
        }
      });
      
      // Display away team stats
      console.log(`\n${targetAwayTeam} Stats:`);
      const awayTeamStats = teamComparisonStats.awayTeam;
      Object.keys(awayTeamStats).forEach(key => {
        if (typeof awayTeamStats[key] !== 'object' && key !== 'teamName') {
          console.log(`${key}: ${awayTeamStats[key]}`);
        }
      });
    } else {
      console.log('❌ Failed to retrieve team comparison stats from Ball Don\'t Lie');
    }
    
    // STEP 2: Test MLB Stats API for accurate pitcher data
    console.log('\nSTEP 2: Testing MLB Stats API for accurate pitcher data...');
    console.log('-------------------------------------');
    
    // Find the game ID first
    const games = await mlbStatsApiService.getGamesByDate(targetDate);
    let targetGame = null;
    
    for (const game of games) {
      const homeTeam = game.teams.home.team.name;
      const awayTeam = game.teams.away.team.name;
      
      if ((homeTeam.includes(targetHomeTeam) || targetHomeTeam.includes(homeTeam)) && 
          (awayTeam.includes(targetAwayTeam) || targetAwayTeam.includes(awayTeam))) {
        targetGame = game;
        break;
      }
    }
    
    if (!targetGame) {
      console.log(`❌ Could not find ${targetAwayTeam} @ ${targetHomeTeam} game for ${targetDate}`);
    } else {
      console.log(`✅ Found game with ID: ${targetGame.gamePk}`);
      
      // Get starting pitchers using our enhanced method
      const startingPitchers = await mlbStatsApiService.getStartingPitchersEnhanced(targetGame.gamePk);
      
      if (startingPitchers) {
        console.log('✅ Successfully retrieved starting pitchers from MLB Stats API');
        
        // Display home starter
        if (startingPitchers.home) {
          console.log(`\n${targetHomeTeam} Starting Pitcher:`);
          console.log(`Name: ${startingPitchers.home.fullName}`);
          console.log(`ID: ${startingPitchers.home.id}`);
          
          if (startingPitchers.home.seasonStats) {
            const stats = startingPitchers.home.seasonStats;
            console.log(`ERA: ${stats.era || 'N/A'}`);
            console.log(`Record: ${stats.wins || 0}-${stats.losses || 0}`);
            console.log(`Innings Pitched: ${stats.inningsPitched || 'N/A'}`);
            console.log(`Strikeouts: ${stats.strikeouts || 'N/A'}`);
            console.log(`WHIP: ${stats.whip || 'N/A'}`);
          }
        } else {
          console.log(`❌ Could not find starting pitcher for ${targetHomeTeam}`);
        }
        
        // Display away starter
        if (startingPitchers.away) {
          console.log(`\n${targetAwayTeam} Starting Pitcher:`);
          console.log(`Name: ${startingPitchers.away.fullName}`);
          console.log(`ID: ${startingPitchers.away.id}`);
          
          if (startingPitchers.away.seasonStats) {
            const stats = startingPitchers.away.seasonStats;
            console.log(`ERA: ${stats.era || 'N/A'}`);
            console.log(`Record: ${stats.wins || 0}-${stats.losses || 0}`);
            console.log(`Innings Pitched: ${stats.inningsPitched || 'N/A'}`);
            console.log(`Strikeouts: ${stats.strikeouts || 'N/A'}`);
            console.log(`WHIP: ${stats.whip || 'N/A'}`);
          }
        } else {
          console.log(`❌ Could not find starting pitcher for ${targetAwayTeam}`);
        }
      } else {
        console.log('❌ Failed to retrieve starting pitchers from MLB Stats API');
      }
    }
    
    // STEP 3: Test Perplexity for game context and storylines
    console.log('\nSTEP 3: Testing Perplexity for game context...');
    console.log('-------------------------------------');
    
    // Construct a query to get game context
    const contextQuery = `Provide a concise summary of the upcoming MLB game between ${targetHomeTeam} and ${targetAwayTeam} with the following information in JSON format:
1. Playoff status (is this a playoff game, and if so what's the current series score)
2. Team storylines and recent news
3. Injury report for both teams
4. Key matchup insights
5. Betting trends and relevant statistics
6. Weather conditions for the game if outdoors

Format your response in clean JSON format with these exact keys: playoffStatus, homeTeamStorylines, awayTeamStorylines, injuryReport, keyMatchups, bettingTrends, weatherConditions.`;
    
    try {
      console.log('Searching Perplexity for game context...');
      const gameContextResult = await perplexityService.search(contextQuery);
      
      if (gameContextResult && gameContextResult.data) {
        console.log('✅ Successfully retrieved game context from Perplexity');
        
        // Parse the JSON from the response
        const text = gameContextResult.data;
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
          try {
            const gameContext = JSON.parse(jsonMatch[0]);
            console.log('\nGame Context from Perplexity:');
            console.log(JSON.stringify(gameContext, null, 2));
            
            // Format a narrative summary for example usage
            console.log('\nExample Narrative Format for Prompt:');
            let narrativeSummary = "GAME CONTEXT:\n";
            
            if (gameContext.playoffStatus) {
              narrativeSummary += `Playoff Status: ${gameContext.playoffStatus}\n\n`;
            }
            
            if (gameContext.homeTeamStorylines) {
              narrativeSummary += `${targetHomeTeam} Storylines: ${gameContext.homeTeamStorylines}\n\n`;
            }
            
            if (gameContext.awayTeamStorylines) {
              narrativeSummary += `${targetAwayTeam} Storylines: ${gameContext.awayTeamStorylines}\n\n`;
            }
            
            if (gameContext.injuryReport) {
              narrativeSummary += `Injury Report: ${gameContext.injuryReport}\n\n`;
            }
            
            if (gameContext.keyMatchups) {
              narrativeSummary += `Key Matchups: ${gameContext.keyMatchups}\n\n`;
            }
            
            if (gameContext.bettingTrends) {
              narrativeSummary += `Betting Trends: ${gameContext.bettingTrends}\n\n`;
            }
            
            if (gameContext.weatherConditions) {
              narrativeSummary += `Weather: ${gameContext.weatherConditions}\n\n`;
            }
            
            console.log(narrativeSummary);
          } catch (jsonError) {
            console.error('❌ Error parsing JSON from Perplexity response:', jsonError.message);
            console.log('Raw response:', gameContextResult.text);
          }
        } else {
          console.log('❌ No JSON found in Perplexity response');
          console.log('Raw response:', gameContextResult.text);
        }
      } else {
        console.log('❌ Failed to retrieve game context from Perplexity');
      }
    } catch (perplexityError) {
      console.error('❌ Error using Perplexity for game context:', perplexityError.message);
    }
    
    // Final cleanup and printing
    console.log('\nFINAL STEP: Complete Game Profile for Betting Analysis');
    console.log('-------------------------------------');
    console.log('This is what a complete game profile would look like when integrating all data sources:');
    
    // Store game context from Perplexity if we successfully parsed it
    if (typeof jsonMatch !== 'undefined' && jsonMatch) {
      try {
        gameContext = JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.log('Error parsing game context JSON:', e.message);
      }
    }
    
    const completeGameProfile = {
      game: {
        homeTeam: targetHomeTeam,
        awayTeam: targetAwayTeam,
        date: targetDate,
        gameTime: targetGame ? new Date(targetGame.gameDate).toLocaleTimeString() : 'Unknown',
        venue: targetGame ? targetGame.venue.name : 'Unknown'
      },
      teamStats: teamComparisonStats,
      pitchers: startingPitchers || {
        home: null,
        away: null
      },
      gameContext: gameContext
    };
    
    console.log(JSON.stringify(completeGameProfile, null, 2));
    console.log('\nTest completed successfully!');
    
  } catch (error) {
    console.error('Error during integration test:', error);
  }
}

// Run the test
testCompleteIntegration();
