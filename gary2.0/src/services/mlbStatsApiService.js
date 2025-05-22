/**
 * MLB Stats API Service
 * Handles interactions with the MLB Stats API for retrieving player data, game stats, etc.
 * Uses the official MLB Stats API endpoints to get accurate player statistics
 * Now serves as primary data source for MLB picks generation
 */
import axios from 'axios';

const MLB_API_BASE_URL = 'https://statsapi.mlb.com/api/v1';

const mlbStatsApiService = {
  /**
   * Maps a player name to their MLB Player ID using multiple search strategies
   * @param {string} playerName - The name of the player to search for
   * @returns {Promise<number|null>} - The player's MLB ID or null if not found
   */
  getPlayerId: async (playerName) => {
    try {
      console.log(`[MLB API] Searching for player ID for ${playerName}`);
      
      // STRATEGY 1: Search current season active players
      try {
        const searchResponse = await axios.get(`${MLB_API_BASE_URL}/sports/1/players`, {
          params: {
            season: new Date().getFullYear(),
            fields: 'people,id,fullName,firstName,lastName,primaryNumber,currentTeam,nameFirstLast'
          }
        });
        
        if (searchResponse.data && searchResponse.data.people) {
          // Search through all active players
          const normalizedSearchName = playerName.toLowerCase().replace(/\s+/g, ' ').trim();
          
          // Try exact match first
          let matchedPlayer = searchResponse.data.people.find(p => 
            (p.fullName && p.fullName.toLowerCase() === normalizedSearchName) ||
            (p.nameFirstLast && p.nameFirstLast.toLowerCase() === normalizedSearchName) ||
            (p.firstName && p.lastName && 
              (p.firstName.toLowerCase() + ' ' + p.lastName.toLowerCase() === normalizedSearchName))
          );
          
          // If no exact match, try partial match
          if (!matchedPlayer) {
            // First look if the player name contains our search term
            matchedPlayer = searchResponse.data.people.find(p => 
              (p.fullName && p.fullName.toLowerCase().includes(normalizedSearchName)) ||
              (p.nameFirstLast && p.nameFirstLast.toLowerCase().includes(normalizedSearchName))
            );
            
            // If still no match, check if our search term contains the player name
            if (!matchedPlayer) {
              matchedPlayer = searchResponse.data.people.find(p => 
                (p.fullName && normalizedSearchName.includes(p.fullName.toLowerCase())) ||
                (p.nameFirstLast && normalizedSearchName.includes(p.nameFirstLast.toLowerCase()))
              );
            }
          }
          
          if (matchedPlayer) {
            console.log(`[MLB API] Found player ID for ${playerName}: ${matchedPlayer.id}`);
            return matchedPlayer.id;
          }
        }
      } catch (searchError) {
        console.log(`[MLB API] Error with primary search method: ${searchError.message}, trying fallback`);
      }
      
      // STRATEGY 2: Direct search using the people/search endpoint
      try {
        const response = await axios.get(`${MLB_API_BASE_URL}/people/search`, {
          params: {
            name: playerName,
            limit: 10
          }
        });
        
        if (response.data && response.data.people && response.data.people.length > 0) {
          // Return the first matching player ID
          const player = response.data.people[0];
          console.log(`[MLB API] Found player ID for ${playerName}: ${player.id}`);
          return player.id;
        }
      } catch (directSearchError) {
        console.log(`[MLB API] Error with direct search: ${directSearchError.message}, trying next method`);
      }
      
      // STRATEGY 3: Try with alternate parameter
      try {
        const response = await axios.get(`${MLB_API_BASE_URL}/people/search`, {
          params: {
            names: playerName,
            limit: 10
          }
        });
        
        if (response.data && response.data.people && response.data.people.length > 0) {
          // Return the first matching player ID
          const player = response.data.people[0];
          console.log(`[MLB API] Found player ID for ${playerName}: ${player.id}`);
          return player.id;
        }
      } catch (alternateSearchError) {
        console.log(`[MLB API] Error with alternate search: ${alternateSearchError.message}`);
      }
      
      // STRATEGY 4: Last resort - try historical players
      try {
        // Check past seasons (useful for recently retired players)
        const pastYearResponse = await axios.get(`${MLB_API_BASE_URL}/sports/1/players`, {
          params: {
            season: new Date().getFullYear() - 1,
            fields: 'people,id,fullName,firstName,lastName,primaryNumber,currentTeam,nameFirstLast'
          }
        });
        
        if (pastYearResponse.data && pastYearResponse.data.people) {
          const normalizedSearchName = playerName.toLowerCase().replace(/\s+/g, ' ').trim();
          
          const matchedPlayer = pastYearResponse.data.people.find(p => 
            (p.fullName && p.fullName.toLowerCase().includes(normalizedSearchName)) ||
            (p.nameFirstLast && p.nameFirstLast.toLowerCase().includes(normalizedSearchName))
          );
          
          if (matchedPlayer) {
            console.log(`[MLB API] Found historical player ID for ${playerName}: ${matchedPlayer.id}`);
            return matchedPlayer.id;
          }
        }
      } catch (historicalSearchError) {
        console.log(`[MLB API] Error with historical search: ${historicalSearchError.message}`);
      }
      
      // If we got this far, no player ID was found
      console.log(`[MLB API] No player ID found for ${playerName} after trying all methods`);
      return null;
    } catch (error) {
      console.error(`[MLB API] Error getting player ID for ${playerName}:`, error.message);
      console.error(`[MLB API] Error details:`, error.response?.data || 'No response data');
      return null;
    }
  },
  
  /**
   * Gets all MLB games played on a specific date
   * @param {string} date - The date in YYYY-MM-DD format
   * @returns {Promise<Array>} - Array of game objects
   */
  getGamesByDate: async (date) => {
    try {
      console.log(`[MLB API] Getting games for ${date}`);
      const response = await axios.get(`${MLB_API_BASE_URL}/schedule`, {
        params: {
          sportId: 1, // MLB
          date: date
        }
      });
      
      if (response.data && response.data.dates && response.data.dates.length > 0) {
        const games = response.data.dates[0].games;
        console.log(`[MLB API] Found ${games.length} games for ${date}`);
        return games;
      }
      
      console.log(`[MLB API] No games found for ${date}`);
      return [];
    } catch (error) {
      console.error(`[MLB API] Error getting games for ${date}:`, error.message);
      return [];
    }
  },
  
  /**
   * Gets the game ID for a specific team on a specific date
   * @param {string} date - The date in YYYY-MM-DD format
   * @param {string} teamName - The name of the team
   * @returns {Promise<number|null>} - The game ID or null if not found
   */
  getGameIdForTeam: async (date, teamName) => {
    try {
      const games = await mlbStatsApiService.getGamesByDate(date);
      
      // Normalize the team name for comparison
      const normalizedTeamName = teamName.toLowerCase();
      
      // Try to find the game where this team is playing (either home or away)
      const game = games.find(game => {
        const homeTeam = game.teams.home.team.name.toLowerCase();
        const awayTeam = game.teams.away.team.name.toLowerCase();
        
        return homeTeam.includes(normalizedTeamName) || 
               awayTeam.includes(normalizedTeamName) ||
               normalizedTeamName.includes(homeTeam) || 
               normalizedTeamName.includes(awayTeam);
      });
      
      if (game) {
        console.log(`[MLB API] Found game ID ${game.gamePk} for team ${teamName} on ${date}`);
        return game.gamePk;
      }
      
      console.log(`[MLB API] No game found for team ${teamName} on ${date}`);
      return null;
    } catch (error) {
      console.error(`[MLB API] Error getting game ID for team ${teamName} on ${date}:`, error.message);
      return null;
    }
  },
  
  /**
   * Gets the boxscore for a specific game
   * @param {number} gameId - The MLB game ID
   * @returns {Promise<Object|null>} - The boxscore data or null if not found
   */
  getBoxscore: async (gameId) => {
    try {
      console.log(`[MLB API] Getting boxscore for game ${gameId}`);
      const response = await axios.get(`${MLB_API_BASE_URL}/game/${gameId}/boxscore`);
      
      if (response.data) {
        console.log(`[MLB API] Successfully retrieved boxscore for game ${gameId}`);
        return response.data;
      }
      
      console.log(`[MLB API] No boxscore found for game ${gameId}`);
      return null;
    } catch (error) {
      console.error(`[MLB API] Error getting boxscore for game ${gameId}:`, error.message);
      return null;
    }
  },
  
  /**
   * Gets stats for a specific player in a specific game
   * @param {number} gameId - The MLB game ID
   * @param {number} playerId - The MLB player ID
   * @returns {Promise<Object|null>} - The player's stats or null if not found
   */
  getPlayerStats: async (gameId, playerId) => {
    try {
      const boxscore = await mlbStatsApiService.getBoxscore(gameId);
      
      if (!boxscore) {
        return null;
      }
      
      // Player IDs in the boxscore are prefixed with "ID"
      const playerKey = `ID${playerId}`;
      
      // Combined approach - get all players from both teams at once
      const allPlayers = {
        ...boxscore.teams.home.players,
        ...boxscore.teams.away.players
      };
      
      if (allPlayers[playerKey]) {
        console.log(`[MLB API] Found stats for player ${playerId} in game ${gameId}`);
        return allPlayers[playerKey].stats;
      }
      
      console.log(`[MLB API] No stats found for player ${playerId} in game ${gameId}`);
      return null;
    } catch (error) {
      console.error(`[MLB API] Error getting stats for player ${playerId} in game ${gameId}:`, error.message);
      return null;
    }
  },
  
  /**
   * Extracts a specific stat from player stats
   * @param {Object} stats - The player's stats object
   * @param {string} propType - The type of prop (hits, strikeouts, etc.)
   * @returns {number|null} - The value of the stat or null if not found
   */
  extractStat: (stats, propType) => {
    if (!stats) {
      return null;
    }
    
    try {
      // Normalize the prop type for better matching
      const normalizedPropType = propType.toLowerCase();
      
      // More comprehensive mapping of prop types to their data paths
      switch (normalizedPropType) {
        case 'hits':
          return stats.batting?.hits || 0;
        case 'strikeouts':
        case 'k':
        case 'ks':
          return stats.pitching?.strikeOuts || 0;
        case 'total_bases':
        case 'totalbases':
        case 'tb':
          return stats.batting?.totalBases || 0;
        case 'rbi':
        case 'rbis':
          return stats.batting?.rbi || 0;
        case 'hr':
        case 'hrs':
        case 'homeruns':
        case 'home_runs':
          return stats.batting?.homeRuns || 0;
        case 'runs':
        case 'r':
          return stats.batting?.runs || 0;
        case 'hits_runs_rbis': 
        case 'hitsrunsrbis':
          return (stats.batting?.hits || 0) + (stats.batting?.runs || 0) + (stats.batting?.rbi || 0);
        case 'walks':
        case 'bb':
          return stats.batting?.baseOnBalls || 0;
        case 'pitches':
          return stats.pitching?.pitchesThrown || 0;
        default:
          console.log(`[MLB API] Unknown prop type: ${normalizedPropType}`);
          return null;
      }
    } catch (error) {
      console.error(`[MLB API] Error extracting ${propType} stat:`, error.message);
      return null;
    }
  },
  
  /**
   * Evaluates a prop bet result
   * @param {number} actual - The actual stat value
   * @param {number} line - The prop line
   * @param {string} direction - The bet direction (over or under)
   * @returns {string} - 'won', 'lost', 'push', or 'pending'
   */
  evaluateProp: (actual, line, direction) => {
    if (actual === null || actual === undefined) {
      return 'pending';
    }
    
    // Convert values to numbers
    const actualVal = Number(actual);
    const lineVal = Number(line);
    
    // Normalize direction
    const normalizedDirection = direction.toUpperCase();
    
    if (normalizedDirection === 'OVER' || normalizedDirection === 'O') {
      if (actualVal > lineVal) return 'won';
      if (actualVal === lineVal) return 'push';
      return 'lost';
    } else if (normalizedDirection === 'UNDER' || normalizedDirection === 'U') {
      if (actualVal < lineVal) return 'won';
      if (actualVal === lineVal) return 'push';
      return 'lost';
    }
    
    // Default case
    return 'pending';
  },
  
  /**
   * Full automation workflow for checking multiple props
   * @param {Array} propsList - List of props to check
   * @param {string} date - The date in YYYY-MM-DD format
   * @returns {Promise<Array>} - Array of results
   */
  automateProps: async (propsList, date) => {
    const results = [];
    const games = await mlbStatsApiService.getGamesByDate(date);
    
    console.log(`[MLB API] Processing ${propsList.length} props for ${date}`);
    
    for (const prop of propsList) {
      console.log(`[MLB API] Processing prop for ${prop.player}`);
      
      // Step 1: Get player ID
      const playerId = await mlbStatsApiService.getPlayerId(prop.player);
      if (!playerId) {
        console.log(`[MLB API] Could not find player ID for ${prop.player}`);
        results.push({ ...prop, actual: null, result: 'pending', reason: 'Player ID not found' });
        continue;
      }
      
      // Step 2: Find the game for this player's team
      const game = games.find(g =>
        g.teams.home.team.name === prop.team || 
        g.teams.away.team.name === prop.team ||
        g.teams.home.team.name.includes(prop.team) ||
        g.teams.away.team.name.includes(prop.team) ||
        prop.team.includes(g.teams.home.team.name) ||
        prop.team.includes(g.teams.away.team.name)
      );
      
      if (!game) {
        console.log(`[MLB API] Could not find game for ${prop.team} on ${date}`);
        results.push({ ...prop, actual: null, result: 'pending', reason: 'Game not found' });
        continue;
      }
      
      // Step 3: Get player stats from boxscore
      const stats = await mlbStatsApiService.getPlayerStats(game.gamePk, playerId);
      
      // Step 4: Extract the relevant stat
      const actual = mlbStatsApiService.extractStat(stats, prop.prop);
      
      // Step 5: Evaluate the prop
      const result = mlbStatsApiService.evaluateProp(actual, prop.line, prop.bet || 'over');
      
      console.log(`[MLB API] ${prop.player} ${prop.prop} result: ${result} (${actual} vs ${prop.line})`);
      results.push({ 
        ...prop, 
        actual, 
        result,
        game_id: game.gamePk,
        player_id: playerId
      });
    }
    
    return results;
  },
  
  /**
   * Comprehensive function to get all data needed for MLB picks generation
   * @param {string} date - Date in YYYY-MM-DD format (defaults to today)
   * @returns {Promise<Object>} - Complete data set for picks generation
   */
  getPicksGenerationData: async (date = new Date().toISOString().slice(0, 10)) => {
    console.log(`[MLB API] Getting comprehensive data for picks generation on ${date}`);
    
    try {
      // Step 1: Get all games for the day
      const games = await mlbStatsApiService.getTodaysGames(date) || [];
      console.log(`[MLB API] Found ${games.length} games for ${date}`);
      
      // Step 2: Enhance games with more data
      const enhancedGames = games.map(game => ({
        ...game,
        matchup: `${game.awayTeam} at ${game.homeTeam}`,
        gameTime: new Date(game.gameDate).toLocaleString(),
        timeStamp: Date.now()
      }));
      console.log(`[MLB API] Enhanced ${enhancedGames.length} games for ${date}`);
      
      // Step 3: For each game, get the starting pitchers
      const gamesWithPitchers = [];
      
      for (const game of enhancedGames) {
        if (!game || !game.gameId) {
          console.log(`[MLB API] Skipping game with missing data:`, game);
          continue;
        }
        
        try {
          const pitchers = await mlbStatsApiService.getStartingPitchers(game.gameId) || { homeStarter: null, awayStarter: null };
          
          // Get season stats for pitchers
          let homeStarterSeasonStats = {};
          let awayStarterSeasonStats = {};
          
          if (pitchers && pitchers.homeStarter && pitchers.homeStarter.id) {
            try {
              homeStarterSeasonStats = await mlbStatsApiService.getPitcherSeasonStats(pitchers.homeStarter.id);
            } catch (homeStatsError) {
              console.error(`[MLB API] Error getting home starter stats:`, homeStatsError.message);
            }
          }
          
          if (pitchers && pitchers.awayStarter && pitchers.awayStarter.id) {
            try {
              awayStarterSeasonStats = await mlbStatsApiService.getPitcherSeasonStats(pitchers.awayStarter.id);
            } catch (awayStatsError) {
              console.error(`[MLB API] Error getting away starter stats:`, awayStatsError.message);
            }
          }
          
          // Add full details to our games array
          gamesWithPitchers.push({
            ...game,
            pitchers: {
              home: pitchers && pitchers.homeStarter ? {
                ...pitchers.homeStarter,
                seasonStats: homeStarterSeasonStats || {}
              } : null,
              away: pitchers && pitchers.awayStarter ? {
                ...pitchers.awayStarter,
                seasonStats: awayStarterSeasonStats || {}
              } : null
            }
          });
        } catch (gameError) {
          console.error(`[MLB API] Error processing game ${game.gameId}:`, gameError.message);
          // Still include the game but without pitcher data
          gamesWithPitchers.push({
            ...game,
            pitchers: { home: null, away: null },
            error: gameError.message
          });
        }
      }
      
      // Step 4: Get injury list (if available)
      let injuries = [];
      try {
        if (typeof mlbStatsApiService.getILTransactions === 'function') {
          injuries = await mlbStatsApiService.getILTransactions() || [];
        } else {
          console.log(`[MLB API] IL Transactions function not available`);
        }
      } catch (injuriesError) {
        console.error(`[MLB API] Error getting IL transactions:`, injuriesError.message);
      }
      
      return {
        date,
        games: gamesWithPitchers,
        injuries,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error(`[MLB API] Error in getPicksGenerationData:`, error.message);
      return {
        date,
        games: [],
        injuries: [],
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  },
  
  /**
   * Gets today's MLB games with additional details
   * @param {string} date - Optional date in YYYY-MM-DD format (defaults to today)
   * @returns {Promise<Array>} - Array of game objects with enhanced details
   */
  getTodaysGames: async (date = new Date().toISOString().slice(0, 10)) => {
    try {
      const games = await mlbStatsApiService.getGamesByDate(date);
      
      // Enhance games with additional information useful for picks generation
      const enhancedGames = [];
      
      for (const game of games) {
        // Get the matchup in a friendly format
        const awayTeam = game.teams.away.team.name;
        const homeTeam = game.teams.home.team.name;
        const matchup = `${awayTeam} at ${homeTeam}`;
        
        // Get venue and start time
        const venue = game.venue?.name || 'Unknown Venue';
        const gameDate = new Date(game.gameDate);
        const startTime = gameDate.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          timeZoneName: 'short'
        });
        
        // Add to enhanced games
        enhancedGames.push({
          gameId: game.gamePk,
          date,
          matchup,
          homeTeam,
          awayTeam,
          venue,
          startTime,
          homeTeamId: game.teams.home.team.id,
          awayTeamId: game.teams.away.team.id,
          status: game.status.detailedState,
          rawGameData: game
        });
      }
      
      console.log(`[MLB API] Enhanced ${enhancedGames.length} games for ${date}`);
      return enhancedGames;
    } catch (error) {
      console.error(`[MLB API] Error getting today's games:`, error.message);
      return [];
    }
  },
  
  /**
   * Gets starting pitchers for a specific game
   * @param {number} gamePk - The MLB game ID
   * @returns {Promise<Object>} - Object containing home and away starting pitchers
   */
  getStartingPitchers: async (gamePk) => {
    try {
      console.log(`[MLB API] Getting starting pitchers for game ${gamePk}`);
      const boxscore = await mlbStatsApiService.getBoxscore(gamePk);
      
      if (!boxscore) return { homeStarter: null, awayStarter: null };
      
      // Function to extract the starting pitcher from a team
      const getStarter = (teamType) => {
        try {
          const team = boxscore.teams[teamType];
          if (!team) {
            console.log(`[MLB API] No ${teamType} team data found in boxscore`);  
            return null;
          }
          
          // Try to get pitchers list
          const pitchers = team.pitchers || [];
          
          if (pitchers.length === 0) {
            console.log(`[MLB API] No pitchers found for ${teamType} team`); 
            
            // Alternative: Try looking through all players for pitchers
            if (team.players) {
              const allPlayers = Object.values(team.players);
              const possiblePitchers = allPlayers.filter(p => 
                p.position && p.position.code === '1' // Position code 1 is for pitchers
              );
              
              if (possiblePitchers.length > 0) {
                const firstPitcher = possiblePitchers[0];
                console.log(`[MLB API] Found pitcher ${firstPitcher.person?.fullName || 'unknown'} through position search`);
                
                return {
                  id: firstPitcher.person?.id,
                  fullName: firstPitcher.person?.fullName || 'Unknown Pitcher',
                  firstName: firstPitcher.person?.firstName || '',
                  lastName: firstPitcher.person?.lastName || '',
                  number: firstPitcher.jerseyNumber || '',
                  team: team.team?.name || '',
                  stats: firstPitcher.stats?.pitching || {},
                  seasonStats: firstPitcher.seasonStats?.pitching || {}
                };
              }
            }
            return null;
          }
          
          // Normal path - use the first pitcher in the list (usually the starter)
          const starterId = pitchers[0];
          if (!starterId) {
            console.log(`[MLB API] No starter ID found for ${teamType} team`);
            return null;
          }
          const playerKey = `ID${starterId}`;
          const player = team.players?.[playerKey];
            
          if (!player) {
            console.log(`[MLB API] Player data not found for ${teamType} starter ID ${starterId}`);
            return {
              id: starterId,
              fullName: 'Unknown Pitcher',
              team: team.team?.name || '',
            };
          }
          
          return {
            id: starterId,
            fullName: player.person?.fullName || 'Unknown Pitcher',
            firstName: player.person?.firstName || '',
            lastName: player.person?.lastName || '',
            number: player.jerseyNumber || '',
            team: team.team?.name || '',
            stats: player.stats?.pitching || {},
            seasonStats: player.seasonStats?.pitching || {}
          };
        } catch (err) {
          console.log(`[MLB API] Error extracting ${teamType} starter:`, err.message);
          return null;
        }
      };
      
      const result = {
        homeStarter: getStarter('home'),
        awayStarter: getStarter('away')
      };
      
      console.log(`[MLB API] Found starters - Home: ${result.homeStarter?.fullName || 'Not found'}, Away: ${result.awayStarter?.fullName || 'Not found'}`);
      
      return result;
    } catch (error) {
      console.error(`[MLB API] Error getting starting pitchers for game ${gamePk}:`, error.message);
      return { homeStarter: null, awayStarter: null };
    }
  },

/**
 * Gets starting pitcher season stats
 * @param {number|string} playerId - The MLB player ID
 * @returns {Promise<Object>} - Pitcher's season stats
 */
getPitcherSeasonStats: async (playerId) => {
  if (!playerId) {
    console.log(`[MLB API] Cannot get stats for pitcher: No pitcher ID provided`);
    return {};
  }
  
  try {
    console.log(`[MLB API] Getting season stats for pitcher ${playerId}`);
    
    const response = await axios.get(`${MLB_API_BASE_URL}/people/${playerId}/stats`, {
      params: {
        stats: 'season',
        group: 'pitching',
        season: new Date().getFullYear(),
        sportId: 1
      }
    });
    
    if (response.data && response.data.stats && response.data.stats.length > 0) {
      const stats = response.data.stats[0].splits?.[0]?.stat || {};
      return {
        era: stats.era || 0,
        wins: stats.wins || 0,
        losses: stats.losses || 0,
        inningsPitched: stats.inningsPitched || '0.0',
        strikeouts: stats.strikeOuts || 0,
        whip: stats.whip || 0,
        battingAvgAgainst: stats.avg || '.000',  // Added this field from our fix
        walks: stats.baseOnBalls || 0,
        hits: stats.hits || 0,
        homeRuns: stats.homeRuns || 0,
        gamesStarted: stats.gamesStarted || 0,
        saveOpportunities: stats.saveOpportunities || 0,
        saves: stats.saves || 0,
        year: stats.era ? new Date().getFullYear() : new Date().getFullYear() - 1, // Year for which stats were found
        gamesPitched: stats.gamesPitched || 0
      };
    }
    
    return {};
  } catch (error) {
    console.error(`[MLB API] Error getting season stats for pitcher ${playerId}:`, error.message);
    return {};
  }
},

/**
 * Gets key hitter stats for a specific game
 * @param {number} gamePk - The MLB game ID
 * @returns {Promise<Object>} - Object containing home and away hitters with stats
 */
getHitterStats: async (gamePk) => {
  try {
    console.log(`[MLB API] Getting hitter stats for game ${gamePk}`);
    const boxscore = await mlbStatsApiService.getBoxscore(gamePk);
    
    if (!boxscore || !boxscore.teams) {
      console.log(`[MLB API] No valid boxscore data found for game ${gamePk}`);
      return { home: [], away: [] };
    }
    
    // Function to extract hitters from a team
    const getHitters = (teamType) => {
      if (!boxscore.teams[teamType] || !boxscore.teams[teamType].players) {
        console.log(`[MLB API] No ${teamType} team data found in boxscore for game ${gamePk}`);
        return [];
      }
      
      const team = boxscore.teams[teamType];
      
      try {
        return Object.values(team.players)
          .filter(p => p && p.stats && p.stats.batting && p.stats.batting.atBats > 0)
          .map(p => ({
            id: p.person ? p.person.id : 0,
            name: p.person ? p.person.fullName : 'Unknown Player',
            position: p.position ? (p.position.abbreviation || '') : '',
            team: teamType === 'home' ? 
              (boxscore.teams.home.team ? boxscore.teams.home.team.name : 'Home Team') : 
              (boxscore.teams.away.team ? boxscore.teams.away.team.name : 'Away Team'),
            stats: {
              hits: p.stats.batting.hits || 0,
              rbi: p.stats.batting.rbi || 0,
              homeRuns: p.stats.batting.homeRuns || 0,
              runs: p.stats.batting.runs || 0,
              atBats: p.stats.batting.atBats || 0,
              avg: p.stats.batting.avg || '.000',
              totalBases: p.stats.batting.totalBases || 0,
              strikeouts: p.stats.batting.strikeOuts || 0,
              walks: p.stats.batting.baseOnBalls || 0
            }
          }));
      } catch (err) {
        console.error(`[MLB API] Error extracting ${teamType} hitters:`, err.message);
        return [];
      }
    };
    
    return {
      home: getHitters('home'),
      away: getHitters('away')
    };
  } catch (error) {
    console.error(`[MLB API] Error getting hitter stats for game ${gamePk}:`, error.message);
    return { home: [], away: [] };
  }
},

/**
 * Gets starting pitchers with enhanced stats for a specific game
 * @param {number} gamePk - The MLB game ID
 * @returns {Promise<Object>} - Object containing home and away starting pitchers with detailed stats
 */
getStartingPitchersEnhanced: async (gamePk) => {
  try {
    console.log(`[MLB API] Getting enhanced starting pitchers for game ${gamePk}`);
    
    // First get the basic starting pitchers info
    const basicPitchers = await mlbStatsApiService.getStartingPitchers(gamePk);
    if (!basicPitchers || (!basicPitchers.homeStarter && !basicPitchers.awayStarter)) {
      console.log(`[MLB API] No starting pitchers found for game ${gamePk}`);
      return { homeStarter: null, awayStarter: null };
    }
    
    // Function to enhance pitcher data with detailed stats
    const enhancePitcher = async (pitcher) => {
      if (!pitcher || !pitcher.id) return null;
      
      try {
        // Get season stats
        const seasonStats = await mlbStatsApiService.getPitcherSeasonStats(pitcher.id);
        
        // Get advanced stats for the pitcher
        const advancedResponse = await axios.get(`${MLB_API_BASE_URL}/people/${pitcher.id}/stats`, {
          params: {
            stats: 'statSplits',
            sportId: 1,
            season: new Date().getFullYear(),
            group: 'pitching',
            gameType: 'R'
          }
        });
        
        // Extract advanced metrics if available
        let advancedStats = {};
        if (advancedResponse.data && advancedResponse.data.stats && advancedResponse.data.stats.length > 0) {
          const advData = advancedResponse.data.stats[0].splits?.[0]?.stat || {};
          advancedStats = {
            k9: advData.strikeoutsPer9Inn || '0.00',
            bb9: advData.walksPer9Inn || '0.00',
            hr9: advData.homeRunsPer9 || '0.00',
            fip: advData.fip || '0.00',
            groundOutToAirOut: advData.groundOutToAirOutRatio || '0.00',
            strikeoutWalkRatio: advData.strikeoutWalkRatio || '0.00',
            hitsPer9Inn: advData.hitsPer9Inn || '0.00'
          };
        }
        
        // Get matchup data if available
        const opposingTeamId = pitcher.opposingTeam?.id;
        let teamMatchupStats = {};
        
        if (opposingTeamId) {
          try {
            // Try to get the pitcher's stats against this team
            const teamSplitResponse = await axios.get(`${MLB_API_BASE_URL}/people/${pitcher.id}/stats`, {
              params: {
                stats: 'vsTeam',
                opposingTeamId: opposingTeamId,
                season: new Date().getFullYear(),
                group: 'pitching',
                sportId: 1
              }
            });
            
            if (teamSplitResponse.data && teamSplitResponse.data.stats && teamSplitResponse.data.stats.length > 0) {
              const splitData = teamSplitResponse.data.stats[0].splits?.[0]?.stat || {};
              teamMatchupStats = {
                gamesVsTeam: splitData.gamesPlayed || 0,
                eraVsTeam: splitData.era || '0.00',
                whipVsTeam: splitData.whip || '0.00',
                strikeoutsVsTeam: splitData.strikeOuts || 0,
                inningsPitchedVsTeam: splitData.inningsPitched || '0.0',
                battingAvgAgainstVsTeam: splitData.avg || '.000'
              };
            }
          } catch (teamSplitError) {
            console.log(`[MLB API] Error getting team matchup stats for pitcher ${pitcher.id} vs team ${opposingTeamId}:`, teamSplitError.message);
          }
        }
        
        // Combine all stats into enhanced pitcher object
        return {
          ...pitcher,
          seasonStats,
          advancedStats,
          teamMatchupStats
        };
      } catch (enhanceError) {
        console.error(`[MLB API] Error enhancing pitcher data for ${pitcher.id}:`, enhanceError.message);
        return pitcher; // Return basic pitcher data if enhancement fails
      }
    };
    
    // Enhance both pitchers in parallel
    const [enhancedHomeStarter, enhancedAwayStarter] = await Promise.all([
      enhancePitcher(basicPitchers.homeStarter),
      enhancePitcher(basicPitchers.awayStarter)
    ]);
    
    return {
      homeStarter: enhancedHomeStarter,
      awayStarter: enhancedAwayStarter
    };
  } catch (error) {
    console.error(`[MLB API] Error getting enhanced starting pitchers for game ${gamePk}:`, error.message);
    // Fall back to basic starting pitchers
    return mlbStatsApiService.getStartingPitchers(gamePk);
  }
},

/**
 * Gets team roster with comprehensive stats
 * @param {number} teamId - The MLB team ID
 * @returns {Promise<Object>} - Object containing hitters and pitchers with stats
 */
getTeamRosterWithStats: async (teamId) => {
  try {
    console.log(`[MLB API] Getting roster with stats for team ${teamId}`);
    
    // Get the team roster
    const rosterResponse = await axios.get(`${MLB_API_BASE_URL}/teams/${teamId}/roster`, {
      params: {
        season: new Date().getFullYear(),
        rosterType: 'active'
      }
    });
    
    if (!rosterResponse.data || !rosterResponse.data.roster) {
      console.log(`[MLB API] No roster data found for team ${teamId}`);
      return { hitters: [], pitchers: [] };
    }
    
    // Extract player IDs
    const roster = rosterResponse.data.roster;
    
    // Split into pitchers and hitters
    const pitchers = roster.filter(p => p.position.code === '1');
    const hitters = roster.filter(p => p.position.code !== '1');
    
    // Function to get player season stats
    const getPlayerStats = async (player, statGroup) => {
      if (!player || !player.person || !player.person.id) return null;
      
      try {
        const statsResponse = await axios.get(`${MLB_API_BASE_URL}/people/${player.person.id}/stats`, {
          params: {
            stats: 'season',
            group: statGroup,
            season: new Date().getFullYear(),
            sportId: 1
          }
        });
        
        if (statsResponse.data && statsResponse.data.stats && statsResponse.data.stats.length > 0) {
          const stats = statsResponse.data.stats[0].splits?.[0]?.stat || {};
          
          return {
            id: player.person.id,
            name: player.person.fullName,
            position: player.position.abbreviation,
            stats: statGroup === 'hitting' ? {
              // Hitter stats
              avg: stats.avg || '.000',
              hits: stats.hits || 0,
              homeRuns: stats.homeRuns || 0,
              rbi: stats.rbi || 0,
              runs: stats.runs || 0,
              obp: stats.obp || '.000',
              slg: stats.slg || '.000',
              ops: stats.ops || '.000',
              stolenBases: stats.stolenBases || 0,
              doubles: stats.doubles || 0,
              triples: stats.triples || 0,
              strikeouts: stats.strikeOuts || 0,
              walks: stats.baseOnBalls || 0,
              gamesPlayed: stats.gamesPlayed || 0,
              atBats: stats.atBats || 0,
              plateAppearances: stats.plateAppearances || 0
            } : {
              // Pitcher stats
              era: stats.era || '0.00',
              wins: stats.wins || 0,
              losses: stats.losses || 0,
              inningsPitched: stats.inningsPitched || '0.0',
              strikeouts: stats.strikeOuts || 0,
              whip: stats.whip || '0.00',
              walks: stats.baseOnBalls || 0,
              hits: stats.hits || 0,
              homeRuns: stats.homeRuns || 0,
              gamesStarted: stats.gamesStarted || 0,
              gamesPitched: stats.gamesPitched || 0,
              saves: stats.saves || 0,
              battingAvgAgainst: stats.avg || '.000'
            }
          };
        }
        
        return {
          id: player.person.id,
          name: player.person.fullName,
          position: player.position.abbreviation,
          stats: {}
        };
      } catch (statsError) {
        console.log(`[MLB API] Error getting stats for player ${player.person.id}:`, statsError.message);
        return {
          id: player.person.id,
          name: player.person.fullName,
          position: player.position.abbreviation,
          stats: {}
        };
      }
    };
    
    // Get stats for the first 9 hitters (likely starters) to avoid too many API calls
    const topHitters = hitters.slice(0, 9);
    const hitterPromises = topHitters.map(p => getPlayerStats(p, 'hitting'));
    const hitterStats = await Promise.all(hitterPromises);
    
    // Get stats for the starting pitchers and closers (likely top 5)
    const topPitchers = pitchers.slice(0, 5);
    const pitcherPromises = topPitchers.map(p => getPlayerStats(p, 'pitching'));
    const pitcherStats = await Promise.all(pitcherPromises);
    
    return {
      hitters: hitterStats.filter(p => p !== null),
      pitchers: pitcherStats.filter(p => p !== null)
    };
  } catch (error) {
    console.error(`[MLB API] Error getting team roster with stats for team ${teamId}:`, error.message);
    return { hitters: [], pitchers: [] };
  }
},

/**
 * Gets league leaders for a specific stat category
 * @param {string} statType - The stat to get leaders for (e.g., 'homeRuns', 'battingAverage')
 * @param {string} group - The stat group ('hitting' or 'pitching')
 * @param {number} limit - Number of leaders to return
 * @returns {Promise<Array>} - Array of leaders with stats
 */
getLeagueLeaders: async (statType, group, limit = 10) => {
  try {
    console.log(`[MLB API] Getting league leaders for ${statType} in ${group}`);
    
    const response = await axios.get(`${MLB_API_BASE_URL}/stats/leaders`, {
      params: {
        leaderCategories: statType,
        season: new Date().getFullYear(),
        sportId: 1,
        statGroup: group,
        limit: limit
      }
    });
    
    if (response.data && response.data.leagueLeaders && response.data.leagueLeaders.length > 0) {
      return response.data.leagueLeaders[0].leaders.map(leader => ({
        rank: leader.rank,
        playerId: leader.person.id,
        name: leader.person.fullName,
        value: leader.value,
        team: leader.team ? leader.team.name : 'N/A',
        teamId: leader.team ? leader.team.id : 0
      }));
    }
    
    return [];
  } catch (error) {
    console.error(`[MLB API] Error getting league leaders for ${statType}:`, error.message);
    return [];
  }
}
};

export { mlbStatsApiService };
