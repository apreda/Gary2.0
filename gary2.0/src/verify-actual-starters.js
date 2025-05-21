/**
 * Script to verify the actual starting pitchers for the Angels vs Athletics game
 * This uses multiple approaches and displays more detailed game information
 */

import { mlbStatsApiService } from './services/mlbStatsApiService.js';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const MLB_API_BASE_URL = 'https://statsapi.mlb.com/api/v1';

async function verifyStartingPitchers() {
  console.log('🔍 VERIFYING ACTUAL STARTING PITCHERS 🔍');
  console.log('------------------------------------------');
  console.log('Target: Los Angeles Angels vs Oakland Athletics');
  console.log('Date: May 21, 2025');
  console.log('------------------------------------------');
  
  try {
    // 1. Get today's games with detailed information
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    console.log(`Fetching MLB games for ${today} with FULL details...`);
    
    // Use the direct MLB Stats API endpoint for complete game data
    const response = await axios.get(`${MLB_API_BASE_URL}/schedule`, {
      params: {
        sportId: 1,
        date: today,
        hydrate: 'team,linescore,person,probablePitcher,stats,game(content(summary,media(epg))),broadcasts(all)'
      }
    });
    
    if (!response.data || !response.data.dates || !response.data.dates[0] || !response.data.dates[0].games) {
      console.log('⚠️ No games found for today');
      return;
    }
    
    const games = response.data.dates[0].games;
    console.log(`Found ${games.length} MLB games for today with detailed information`);
    
    // 2. Find the Angels vs Athletics game
    let targetGame = null;
    for (const game of games) {
      const homeTeam = game.teams.home.team.name;
      const awayTeam = game.teams.away.team.name;
      
      if ((homeTeam.includes('Athletics') && awayTeam.includes('Angels')) || 
          (homeTeam.includes('Angels') && awayTeam.includes('Athletics'))) {
        targetGame = game;
        console.log(`🎯 Found target game: ${awayTeam} @ ${homeTeam} (Game ID: ${game.gamePk})`);
        break;
      }
    }
    
    if (!targetGame) {
      console.log('⚠️ Angels vs Athletics game not found for today');
      // Print all available games
      console.log('\nAvailable games today:');
      games.forEach(game => {
        console.log(`- ${game.teams.away.team.name} @ ${game.teams.home.team.name} (Game ID: ${game.gamePk})`);
      });
      return;
    }
    
    // 3. Display detailed game information
    console.log('\n📊 GAME DETAILS 📊');
    console.log('------------------------------------------');
    console.log(`Game: ${targetGame.teams.away.team.name} @ ${targetGame.teams.home.team.name}`);
    console.log(`Status: ${targetGame.status.detailedState}`);
    console.log(`Time: ${new Date(targetGame.gameDate).toLocaleTimeString()}`);
    console.log(`Venue: ${targetGame.venue.name}`);
    
    // 4. Check for probable pitchers directly from the schedule API
    console.log('\n⚾ PROBABLE PITCHERS (From Schedule API) ⚾');
    console.log('------------------------------------------');
    
    // Home probable pitcher
    if (targetGame.teams.home.probablePitcher) {
      const homePitcher = targetGame.teams.home.probablePitcher;
      console.log(`HOME (${targetGame.teams.home.team.name}) PROBABLE PITCHER:`);
      console.log(`ID: ${homePitcher.id}`);
      console.log(`Name: ${homePitcher.fullName}`);
      
      // Get detailed stats for this pitcher
      console.log('\nGetting season stats...');
      const homeStats = await mlbStatsApiService.getPitcherSeasonStats(homePitcher.id);
      displayPitcherStats(homeStats);
    } else {
      console.log(`⚠️ No probable pitcher listed for ${targetGame.teams.home.team.name}`);
    }
    
    console.log('------------------------------------------');
    
    // Away probable pitcher
    if (targetGame.teams.away.probablePitcher) {
      const awayPitcher = targetGame.teams.away.probablePitcher;
      console.log(`AWAY (${targetGame.teams.away.team.name}) PROBABLE PITCHER:`);
      console.log(`ID: ${awayPitcher.id}`);
      console.log(`Name: ${awayPitcher.fullName}`);
      
      // Get detailed stats for this pitcher
      console.log('\nGetting season stats...');
      const awayStats = await mlbStatsApiService.getPitcherSeasonStats(awayPitcher.id);
      displayPitcherStats(awayStats);
    } else {
      console.log(`⚠️ No probable pitcher listed for ${targetGame.teams.away.team.name}`);
    }
    
    // 5. Try to get probable pitchers from the game endpoint for verification
    console.log('\n🔄 VERIFYING WITH GAME FEED API 🔄');
    console.log('------------------------------------------');
    
    try {
      const gameFeedResponse = await axios.get(`${MLB_API_BASE_URL}/game/${targetGame.gamePk}/feed/live`);
      const gameFeed = gameFeedResponse.data;
      
      if (gameFeed && gameFeed.gameData && gameFeed.gameData.probablePitchers) {
        console.log('Probable pitchers from Game Feed API:');
        
        // Home pitcher
        if (gameFeed.gameData.probablePitchers.home) {
          const pitcher = gameFeed.gameData.probablePitchers.home;
          console.log(`HOME: ${pitcher.fullName} (ID: ${pitcher.id})`);
        } else {
          console.log('No home probable pitcher in Game Feed');
        }
        
        // Away pitcher
        if (gameFeed.gameData.probablePitchers.away) {
          const pitcher = gameFeed.gameData.probablePitchers.away;
          console.log(`AWAY: ${pitcher.fullName} (ID: ${pitcher.id})`);
        } else {
          console.log('No away probable pitcher in Game Feed');
        }
      } else {
        console.log('No probable pitcher data in Game Feed API');
      }
    } catch (error) {
      console.log('Error getting Game Feed data:', error.message);
    }
    
    console.log('------------------------------------------');
    console.log('Verification complete!');
    
  } catch (error) {
    console.error('Error during verification:', error);
  }
}

// Helper function to display pitcher stats
function displayPitcherStats(stats) {
  if (!stats || Object.keys(stats).length === 0) {
    console.log('No statistics available for this pitcher');
    return;
  }
  
  console.log(`ERA: ${stats.era}`);
  console.log(`Record: ${stats.wins}-${stats.losses}`);
  console.log(`Innings Pitched: ${stats.inningsPitched}`);
  console.log(`Strikeouts: ${stats.strikeouts}`);
  console.log(`WHIP: ${stats.whip}`);
  console.log(`BAA: ${stats.battingAvgAgainst}`);
  console.log(`Games Started: ${stats.gamesStarted}`);
  console.log(`Games Pitched: ${stats.gamesPitched}`);
}

// Run the verification
verifyStartingPitchers();
