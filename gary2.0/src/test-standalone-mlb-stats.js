/**
 * Standalone test for enhanced MLB Stats API
 * This test focuses only on the MLB Stats API enhancement
 * and avoids importing modules with dependencies issues
 */

import { mlbStatsApiService } from './services/mlbStatsApiService.enhanced2.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Helper function to find player ranking in leaderboard
function findPlayerRanking(leaders, playerId) {
  for (let i = 0; i < leaders.length; i++) {
    if (leaders[i].person && leaders[i].person.id === playerId) {
      return i + 1; // Return 1-based rank
    }
  }
  return 0; // Not found in leaders
}

/**
 * Format MLB player stats with enhanced data for prop picks
 */
async function formatEnhancedMLBPlayerStats(homeTeam, awayTeam) {
  try {
    console.log(`Formatting comprehensive MLB player stats for ${homeTeam} vs ${awayTeam}`);
    
    // Get today's date
    const today = new Date().toISOString().slice(0, 10);
    
    // Get today's games
    const games = await mlbStatsApiService.getGamesByDate(today);
    if (!games || games.length === 0) {
      console.log('No MLB games found for today');
      return '';
    }
    
    // Find the game for these teams
    let targetGame = null;
    for (const game of games) {
      const homeMatches = game.teams?.home?.team?.name?.includes(homeTeam);
      const awayMatches = game.teams?.away?.team?.name?.includes(awayTeam);
      if (homeMatches && awayMatches) {
        targetGame = game;
        break;
      }
    }
    
    if (!targetGame) {
      console.log(`No game found for ${homeTeam} vs ${awayTeam}`);
      return '';
    }
    
    // Get enhanced data using our MLB Stats API service
    console.log(`Getting comprehensive stats for game ${targetGame.gamePk}`);
    
    // 1. Get starting pitchers with enhanced stats
    let startingPitchers;
    try {
      startingPitchers = await mlbStatsApiService.getStartingPitchersEnhanced(targetGame.gamePk);
    } catch (error) {
      console.error('Error getting enhanced starting pitchers, falling back to regular method:', error);
      startingPitchers = await mlbStatsApiService.getStartingPitchers(targetGame.gamePk);
    }
    
    // 2. Get team roster stats
    const homeTeamId = targetGame.teams?.home?.team?.id;
    const awayTeamId = targetGame.teams?.away?.team?.id;
    
    let homeRoster = [];
    let awayRoster = [];
    
    if (homeTeamId) {
      try {
        // Try to get enhanced roster data if available
        if (typeof mlbStatsApiService.getTeamRosterWithStats === 'function') {
          const rosterData = await mlbStatsApiService.getTeamRosterWithStats(homeTeamId);
          if (rosterData && rosterData.hitters) {
            homeRoster = rosterData.hitters;
          }
        }
      } catch (error) {
        console.log(`Error getting enhanced home roster: ${error.message}`);
      }
    }
    
    if (awayTeamId) {
      try {
        // Try to get enhanced roster data if available
        if (typeof mlbStatsApiService.getTeamRosterWithStats === 'function') {
          const rosterData = await mlbStatsApiService.getTeamRosterWithStats(awayTeamId);
          if (rosterData && rosterData.hitters) {
            awayRoster = rosterData.hitters;
          }
        }
      } catch (error) {
        console.log(`Error getting enhanced away roster: ${error.message}`);
      }
    }
    
    // 3. Get league leaders data
    let homeRunLeaders = [];
    let battingAvgLeaders = [];
    let eraLeaders = [];
    let strikeoutLeaders = [];
    
    try {
      // Try to get league leaders if the enhanced function is available
      if (typeof mlbStatsApiService.getLeagueLeaders === 'function') {
        homeRunLeaders = await mlbStatsApiService.getLeagueLeaders('homeRuns', 'hitting', 10);
        battingAvgLeaders = await mlbStatsApiService.getLeagueLeaders('battingAverage', 'hitting', 10);
        eraLeaders = await mlbStatsApiService.getLeagueLeaders('earnedRunAverage', 'pitching', 10);
        strikeoutLeaders = await mlbStatsApiService.getLeagueLeaders('strikeouts', 'pitching', 10);
      }
    } catch (error) {
      console.log(`Error getting league leaders: ${error.message}`);
    }
    
    // 4. Fallback to basic hitter stats if enhanced data not available
    let hitterStats = { home: [], away: [] };
    if (homeRoster.length === 0 || awayRoster.length === 0) {
      hitterStats = await mlbStatsApiService.getHitterStats(targetGame.gamePk);
    }
    
    // Format all the data into a comprehensive stats text
    let statsText = '';
    
    // SECTION 1: Starting Pitchers
    statsText += 'STARTING PITCHERS:\n';
    
    if (startingPitchers?.homeStarter) {
      const hp = startingPitchers.homeStarter;
      const hpStats = hp.seasonStats || {};
      statsText += `${homeTeam} - ${hp.fullName}: ERA ${hpStats.era || 'N/A'}, ` +
                 `${hpStats.wins || 0}W-${hpStats.losses || 0}L, ` +
                 `${hpStats.inningsPitched || '0.0'} IP, ` +
                 `${hpStats.strikeouts || 0} K, ` +
                 `WHIP ${hpStats.whip || 'N/A'}, ` +
                 `BAA ${hpStats.battingAvgAgainst || '.000'}\n`;
      
      // Add league ranking for ERA and strikeouts if available
      if (eraLeaders.length > 0 || strikeoutLeaders.length > 0) {
        statsText += `RANKINGS: `;
        
        // Check ERA ranking
        const eraRank = findPlayerRanking(eraLeaders, hp.id);
        if (eraRank > 0) {
          statsText += `ERA #${eraRank} in MLB, `;
        }
        
        // Check strikeout ranking
        const soRank = findPlayerRanking(strikeoutLeaders, hp.id);
        if (soRank > 0) {
          statsText += `Strikeouts #${soRank} in MLB, `;
        }
        
        statsText = statsText.replace(/, $/, '');
        statsText += '\n';
      }
    }
    
    if (startingPitchers?.awayStarter) {
      const ap = startingPitchers.awayStarter;
      const apStats = ap.seasonStats || {};
      statsText += `${awayTeam} - ${ap.fullName}: ERA ${apStats.era || 'N/A'}, ` +
                 `${apStats.wins || 0}W-${apStats.losses || 0}L, ` +
                 `${apStats.inningsPitched || '0.0'} IP, ` +
                 `${apStats.strikeouts || 0} K, ` +
                 `WHIP ${apStats.whip || 'N/A'}, ` +
                 `BAA ${apStats.battingAvgAgainst || '.000'}\n`;
      
      // Add league ranking for ERA and strikeouts if available
      if (eraLeaders.length > 0 || strikeoutLeaders.length > 0) {
        statsText += `RANKINGS: `;
        
        // Check ERA ranking
        const eraRank = findPlayerRanking(eraLeaders, ap.id);
        if (eraRank > 0) {
          statsText += `ERA #${eraRank} in MLB, `;
        }
        
        // Check strikeout ranking
        const soRank = findPlayerRanking(strikeoutLeaders, ap.id);
        if (soRank > 0) {
          statsText += `Strikeouts #${soRank} in MLB, `;
        }
        
        statsText = statsText.replace(/, $/, '');
        statsText += '\n';
      }
    }
    
    // SECTION 2: Home Team Hitters
    statsText += `\n${homeTeam} HITTERS:\n`;
    
    // Use enhanced roster data if available, otherwise fall back to basic hitter stats
    if (homeRoster.length > 0) {
      for (const hitter of homeRoster) {
        const s = hitter.stats;
        statsText += `${hitter.fullName} (${hitter.position}): ` +
                   `AVG ${s.avg || '.000'}, ` +
                   `${s.hits || 0} H, ` +
                   `${s.homeRuns || 0} HR, ` +
                   `${s.rbi || 0} RBI, ` +
                   `${s.runs || 0} R, ` +
                   `${s.strikeouts || 0} K, ` +
                   `${s.walks || 0} BB, ` +
                   `OPS ${s.ops || '.000'}\n`;
        
        // Add league rankings if available
        if (homeRunLeaders.length > 0 || battingAvgLeaders.length > 0) {
          const hrRank = findPlayerRanking(homeRunLeaders, hitter.id);
          const avgRank = findPlayerRanking(battingAvgLeaders, hitter.id);
          
          if (hrRank > 0 || avgRank > 0) {
            statsText += `  RANKINGS: `;
            
            if (hrRank > 0) {
              statsText += `HR #${hrRank} in MLB, `;
            }
            
            if (avgRank > 0) {
              statsText += `AVG #${avgRank} in MLB, `;
            }
            
            statsText = statsText.replace(/, $/, '');
            statsText += '\n';
          }
        }
      }
    } else if (hitterStats?.home?.length > 0) {
      for (const hitter of hitterStats.home) {
        const s = hitter.stats;
        statsText += `${hitter.name} (${hitter.position}): ` +
                   `AVG ${s.avg || '.000'}, ` +
                   `${s.hits || 0} H, ` +
                   `${s.homeRuns || 0} HR, ` +
                   `${s.rbi || 0} RBI, ` +
                   `${s.runs || 0} R, ` +
                   `${s.strikeouts || 0} K, ` +
                   `${s.walks || 0} BB\n`;
      }
    } else {
      statsText += 'No hitter data available\n';
    }
    
    // SECTION 3: Away Team Hitters
    statsText += `\n${awayTeam} HITTERS:\n`;
    
    // Use enhanced roster data if available, otherwise fall back to basic hitter stats
    if (awayRoster.length > 0) {
      for (const hitter of awayRoster) {
        const s = hitter.stats;
        statsText += `${hitter.fullName} (${hitter.position}): ` +
                   `AVG ${s.avg || '.000'}, ` +
                   `${s.hits || 0} H, ` +
                   `${s.homeRuns || 0} HR, ` +
                   `${s.rbi || 0} RBI, ` +
                   `${s.runs || 0} R, ` +
                   `${s.strikeouts || 0} K, ` +
                   `${s.walks || 0} BB, ` +
                   `OPS ${s.ops || '.000'}\n`;
        
        // Add league rankings if available
        if (homeRunLeaders.length > 0 || battingAvgLeaders.length > 0) {
          const hrRank = findPlayerRanking(homeRunLeaders, hitter.id);
          const avgRank = findPlayerRanking(battingAvgLeaders, hitter.id);
          
          if (hrRank > 0 || avgRank > 0) {
            statsText += `  RANKINGS: `;
            
            if (hrRank > 0) {
              statsText += `HR #${hrRank} in MLB, `;
            }
            
            if (avgRank > 0) {
              statsText += `AVG #${avgRank} in MLB, `;
            }
            
            statsText = statsText.replace(/, $/, '');
            statsText += '\n';
          }
        }
      }
    } else if (hitterStats?.away?.length > 0) {
      for (const hitter of hitterStats.away) {
        const s = hitter.stats;
        statsText += `${hitter.name} (${hitter.position}): ` +
                   `AVG ${s.avg || '.000'}, ` +
                   `${s.hits || 0} H, ` +
                   `${s.homeRuns || 0} HR, ` +
                   `${s.rbi || 0} RBI, ` +
                   `${s.runs || 0} R, ` +
                   `${s.strikeouts || 0} K, ` +
                   `${s.walks || 0} BB\n`;
      }
    } else {
      statsText += 'No hitter data available\n';
    }
    
    // SECTION 4: League Leaders Summary
    if (homeRunLeaders.length > 0 || battingAvgLeaders.length > 0 || eraLeaders.length > 0 || strikeoutLeaders.length > 0) {
      statsText += `\nLEAGUE LEADERS:\n`;
      
      if (homeRunLeaders.length > 0) {
        statsText += `HOME RUNS: `;
        for (let i = 0; i < Math.min(3, homeRunLeaders.length); i++) {
          const leader = homeRunLeaders[i];
          statsText += `${i+1}. ${leader.person.fullName} (${leader.value}), `;
        }
        statsText = statsText.replace(/, $/, '');
        statsText += '\n';
      }
      
      if (battingAvgLeaders.length > 0) {
        statsText += `BATTING AVG: `;
        for (let i = 0; i < Math.min(3, battingAvgLeaders.length); i++) {
          const leader = battingAvgLeaders[i];
          statsText += `${i+1}. ${leader.person.fullName} (${leader.value}), `;
        }
        statsText = statsText.replace(/, $/, '');
        statsText += '\n';
      }
      
      if (eraLeaders.length > 0) {
        statsText += `ERA: `;
        for (let i = 0; i < Math.min(3, eraLeaders.length); i++) {
          const leader = eraLeaders[i];
          statsText += `${i+1}. ${leader.person.fullName} (${leader.value}), `;
        }
        statsText = statsText.replace(/, $/, '');
        statsText += '\n';
      }
      
      if (strikeoutLeaders.length > 0) {
        statsText += `STRIKEOUTS: `;
        for (let i = 0; i < Math.min(3, strikeoutLeaders.length); i++) {
          const leader = strikeoutLeaders[i];
          statsText += `${i+1}. ${leader.person.fullName} (${leader.value}), `;
        }
        statsText = statsText.replace(/, $/, '');
        statsText += '\n';
      }
    }
    
    return statsText;
  } catch (error) {
    console.error('Error formatting MLB player stats:', error);
    return 'Error retrieving MLB player statistics';
  }
}

/**
 * Create a sample prompt for prop picks
 */
function createSamplePropPicksPrompt(playerStats) {
  // Create sample props
  const sampleProps = [
    {
      playerName: 'Aaron Judge',
      propType: 'home_runs',
      point: '0.5',
      outcomes: [
        { name: 'OVER', price: '+130' },
        { name: 'UNDER', price: '-150' }
      ]
    },
    {
      playerName: 'Carlos Rodón',
      propType: 'pitcher_strikeouts',
      point: '6.5',
      outcomes: [
        { name: 'OVER', price: '-110' },
        { name: 'UNDER', price: '-110' }
      ]
    }
  ];
  
  // Format the props
  const propsText = sampleProps.map(prop => {
    const formattedOutcomes = prop.outcomes.map(outcome => {
      return `${outcome.name}: ${outcome.price}`;
    }).join(', ');
    
    return `${prop.playerName} ${prop.propType}: ${prop.point} | ${formattedOutcomes}`;
  }).join('\n');
  
  // Build the prompt
  const prompt = `You are Gary, an expert sports analyst specialized in player prop betting.
  
I will provide you with player props and comprehensive statistics. Your task is to identify the most valuable bets based on the statistics.
  
COMPREHENSIVE PLAYER STATISTICS:
${playerStats}
  
AVAILABLE PROPS:
${propsText}
  
Analyze each player prop and select the BEST 3 bets that offer the most value based on the statistics provided. Pay special attention to:

1. Player performance relative to league leaders (rankings are provided)
2. Starting pitcher matchups and their statistics
3. Recent player performance trends
4. Value opportunities where the odds are better than -150
  
Prioritize bets with a combination of winning probability (50%), potential ROI (30%), and edge size (20%). Look for undervalued props, especially those with positive odds.
  
For each bet you recommend:
1. State the player name, prop type, and your pick (over/under)
2. Explain your reasoning with specific statistical evidence
3. Assign a confidence score (0.5-1.0) where higher means more confident
  
Respond in this exact format for EACH pick:
  
PICK: [Player Name] [Prop Type] [Over/Under] [Line] ([American Odds])
CONFIDENCE: [Score between 0.5-1.0]
REASONING: [Your detailed analysis using specific stats and league context]

Make exactly 3 picks, ordered from highest to lowest confidence.`;
  
  return prompt;
}

/**
 * Test the enhanced MLB stats functionality
 */
async function testStandaloneMLBStats() {
  console.log('=================================================');
  console.log('STANDALONE TEST: ENHANCED MLB STATS FOR PROP PICKS');
  console.log('=================================================\n');
  
  try {
    // 1. Test retrieving enhanced MLB player stats
    console.log('Testing enhanced MLB stats for Yankees vs Rangers...');
    const statsText = await formatEnhancedMLBPlayerStats('New York Yankees', 'Texas Rangers');
    
    // 2. Check if we got comprehensive stats with league rankings
    const hasStartingPitchers = statsText.includes('STARTING PITCHERS');
    const hasHomeTeamHitters = statsText.includes('HITTERS');
    const hasLeagueRankings = statsText.includes('RANKINGS') || statsText.includes('LEAGUE LEADERS');
    
    console.log('\n--- TEST RESULTS ---');
    console.log(`Enhanced MLB stats retrieved: ${statsText.length > 0 ? 'YES ✅' : 'NO ❌'}`);
    console.log(`Includes starting pitchers: ${hasStartingPitchers ? 'YES ✅' : 'NO ❌'}`);
    console.log(`Includes team hitters: ${hasHomeTeamHitters ? 'YES ✅' : 'NO ❌'}`);
    console.log(`Includes league rankings: ${hasLeagueRankings ? 'YES ✅' : 'NO ❌'}`);
    
    // 3. Test creating a sample prop picks prompt
    console.log('\n--- TESTING PROMPT GENERATION ---');
    const prompt = createSamplePropPicksPrompt(statsText);
    
    // 4. Check if prompt includes enhanced instructions
    const hasEnhancedInstructions = prompt.includes('league leaders') && 
                                 prompt.includes('Starting pitcher matchups');
    
    console.log(`Sample prompt generated: ${prompt.length > 0 ? 'YES ✅' : 'NO ❌'}`);
    console.log(`Includes enhanced instructions: ${hasEnhancedInstructions ? 'YES ✅' : 'NO ❌'}`);
    
    // 5. Final summary
    console.log('\n--- FINAL SUMMARY ---');
    if (statsText.length > 0 && hasStartingPitchers && hasHomeTeamHitters && hasLeagueRankings && hasEnhancedInstructions) {
      console.log('✅ SUCCESS: The enhanced MLB Stats API for prop picks is working correctly!');
      console.log('The implementation includes league leaders, comprehensive player stats, and proper prompt generation.');
    } else {
      console.log('❌ PARTIAL SUCCESS: Some features of the enhanced MLB Stats API may not be working.');
      console.log('Please check the individual test results above to identify any issues.');
    }
    
    console.log('\n=================================================');
    
  } catch (error) {
    console.error('Error in standalone test:', error);
  }
}

// Run the test
testStandaloneMLBStats();
