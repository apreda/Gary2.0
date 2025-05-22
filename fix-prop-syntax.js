const fs = require('fs');
const path = require('path');

const filePath = path.join('gary2.0/src/services/propPicksService.js');
let content = fs.readFileSync(filePath, 'utf8');

// Fix 1: Find and clean up the fallback to Perplexity section
const fallbackToPerplexityStart = content.indexOf("// Fall back to Perplexity for data");
if (fallbackToPerplexityStart > 0) {
  // Find the end of the try-catch block
  const endOfTryCatch = content.indexOf("}", fallbackToPerplexityStart + 300);
  
  if (endOfTryCatch > fallbackToPerplexityStart) {
    // Extract the content before and after the Perplexity fallback
    const beforeFallback = content.substring(0, fallbackToPerplexityStart);
    const afterFallback = content.substring(endOfTryCatch + 1);
    
    // Replace with a simpler version that doesn't use Perplexity
    const cleanFallback = `
                  // No fallback to Perplexity - we're using MLB Stats API exclusively for prop picks
                  console.log('MLB Stats API is the only data source for prop picks - no fallbacks used');
                }
`;
    
    // Combine the parts
    content = beforeFallback + cleanFallback + afterFallback;
  }
}

// Fix 2: Clean up fetchActivePlayers function to not use sportsDbApiService
// Find the fetchActivePlayers function
const fetchActivePlayersStart = content.indexOf("async function fetchActivePlayers");
if (fetchActivePlayersStart > 0) {
  const functionStart = content.lastIndexOf("/**", fetchActivePlayersStart);
  const functionEnd = content.indexOf("}", fetchActivePlayersStart + 500) + 1;
  
  if (functionStart > 0 && functionEnd > functionStart) {
    // Extract the content before and after the function
    const beforeFunction = content.substring(0, functionStart);
    const afterFunction = content.substring(functionEnd);
    
    // Replace with a simpler version that only uses MLB Stats API
    const newFunction = `/**
 * Fetch active players for a team with their current season stats
 * Uses MLB Stats API for MLB players
 */
async function fetchActivePlayers(teamName, league) {
  try {
    console.log(\`Fetching active \${league} players for \${teamName}...\`);
    
    if (league === 'MLB') {
      // Use MLB Stats API for MLB players
      console.log(\`Using MLB Stats API to fetch \${teamName} roster\`);
      
      // Get today's games to find the game for this team
      const todaysGames = await mlbStatsApiService.getTodaysGames();
      let teamGameId = null;
      
      // Find the game ID for this team
      for (const game of todaysGames) {
        if (game.homeTeam.includes(teamName) || game.awayTeam.includes(teamName)) {
          teamGameId = game.gameId;
          break;
        }
      }
      
      if (teamGameId) {
        // Get hitter stats for this game
        const hitterStats = await mlbStatsApiService.getHitterStats(teamGameId);
        console.log(\`Got stats for \${teamName} from MLB Stats API\`);
        
        // Format the players
        const isHomeTeam = todaysGames.find(g => g.gameId === teamGameId)?.homeTeam.includes(teamName);
        const players = isHomeTeam ? hitterStats.home : hitterStats.away;
        
        console.log(\`Got \${players.length} players from MLB Stats API for \${teamName}\`);
        return players.map(p => ({
          idPlayer: p.id,
          strPlayer: p.name,
          strPosition: p.position,
          strTeam: p.team,
          stats: p.stats
        }));
      }
      // If no game found, return empty array
      return [];
    } else {
      console.log(\`Only MLB is supported for prop picks. Skipping \${league} team \${teamName}\`);
      return [];
    }
  } catch (error) {
    console.error(\`Error fetching players for \${teamName} (\${league}):\`, error);
    return [];
  }
}`;
    
    // Combine the parts
    content = beforeFunction + newFunction + afterFunction;
  }
}

// Write the fixed file
fs.writeFileSync(filePath, content);
console.log('Fixed the prop picks service to only use MLB Stats API!');
