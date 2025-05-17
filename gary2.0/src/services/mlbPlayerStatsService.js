import axios from 'axios';

// Handle environment variables in both Vite and standalone Node.js
let apiSportsKey = '';
try {
  apiSportsKey = import.meta.env?.VITE_API_SPORTS_KEY || process.env.VITE_API_SPORTS_KEY || '';
} catch (e) {
  // If import.meta.env is not available (running in Node directly)
  apiSportsKey = process.env.VITE_API_SPORTS_KEY || '';
}

const MLB_API_HOST = 'v1.baseball.api-sports.io';

/**
 * Service for fetching detailed MLB player statistics and lineup information
 */
export const mlbPlayerStatsService = {
  API_KEY: apiSportsKey,
  
  /**
   * Make a request to the API-Sports baseball endpoint
   * @param {string} endpoint - API endpoint
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} - API response
   */
  async apiRequest(endpoint, params = {}) {
    try {
      const url = `https://${MLB_API_HOST}${endpoint}`;
      console.log(`Making API-Sports MLB request to ${endpoint} with params:`, params);
      
      const response = await axios.get(url, {
        params,
        headers: {
          'x-rapidapi-key': this.API_KEY,
          'x-rapidapi-host': MLB_API_HOST
        }
      });
      
      if (response.data && response.data.errors && Object.keys(response.data.errors).length > 0) {
        console.error('API-Sports MLB API error:', response.data.errors);
        return null;
      }
      
      return response.data;
    } catch (error) {
      console.error(`API-Sports MLB API error for ${endpoint}:`, error.message);
      return null;
    }
  },
  
  /**
   * Get game lineups for a specific game
   * @param {number} gameId - The API-Sports game ID
   * @returns {Promise<Object>} - Lineup information
   */
  async getGameLineups(gameId) {
    if (!gameId) {
      console.error('No game ID provided for lineup lookup');
      return null;
    }
    
    try {
      const response = await this.apiRequest('/games/lineups', { game: gameId });
      
      if (!response || !response.response || response.response.length === 0) {
        console.log(`No lineup data found for game ID: ${gameId}`);
        return null;
      }
      
      return response.response;
    } catch (error) {
      console.error(`Error fetching lineup for game ${gameId}:`, error.message);
      return null;
    }
  },
  
  /**
   * Find a game by team names and date
   * @param {string} homeTeam - Home team name
   * @param {string} awayTeam - Away team name
   * @param {string} date - Game date in YYYY-MM-DD format
   * @returns {Promise<Object>} - Game information
   */
  async findGameByTeams(homeTeam, awayTeam, date) {
    try {
      const season = new Date(date).getFullYear();
      const response = await this.apiRequest('/games', { 
        league: 1, 
        season,
        date
      });
      
      if (!response || !response.response || response.response.length === 0) {
        console.log(`No games found for date: ${date}`);
        return null;
      }
      
      // Find the game matching our teams (fuzzy match team names)
      for (const game of response.response) {
        const apiHomeTeam = game.teams.home.name.toLowerCase();
        const apiAwayTeam = game.teams.away.name.toLowerCase();
        
        if ((apiHomeTeam.includes(homeTeam.toLowerCase()) || homeTeam.toLowerCase().includes(apiHomeTeam)) &&
            (apiAwayTeam.includes(awayTeam.toLowerCase()) || awayTeam.toLowerCase().includes(apiAwayTeam))) {
          console.log(`Found matching game: ${game.teams.away.name} @ ${game.teams.home.name}`);
          return game;
        }
      }
      
      console.log(`No matching game found for ${awayTeam} @ ${homeTeam} on ${date}`);
      return null;
    } catch (error) {
      console.error(`Error finding game for ${awayTeam} @ ${homeTeam} on ${date}:`, error.message);
      return null;
    }
  },
  
  /**
   * Get probable pitchers for a game
   * @param {string} homeTeam - Home team name
   * @param {string} awayTeam - Away team name
   * @param {string} date - Game date in YYYY-MM-DD format
   * @returns {Promise<Object>} - Pitcher information
   */
  async getProbablePitchers(homeTeam, awayTeam, date) {
    try {
      // First find the game
      const game = await this.findGameByTeams(homeTeam, awayTeam, date);
      if (!game) return null;
      
      // Then get the lineup which includes probable pitchers
      const lineups = await this.getGameLineups(game.id);
      if (!lineups) return null;
      
      // Extract pitcher information
      const pitcherData = {
        home: null,
        away: null,
        game_id: game.id
      };
      
      for (const lineup of lineups) {
        if (lineup.team.id === game.teams.home.id && lineup.startingPitcher) {
          pitcherData.home = lineup.startingPitcher;
        } else if (lineup.team.id === game.teams.away.id && lineup.startingPitcher) {
          pitcherData.away = lineup.startingPitcher;
        }
      }
      
      // If we have pitcher IDs, get their detailed stats
      if (pitcherData.home) {
        pitcherData.home.stats = await this.getPlayerStats(pitcherData.home.id);
      }
      
      if (pitcherData.away) {
        pitcherData.away.stats = await this.getPlayerStats(pitcherData.away.id);
      }
      
      return {
        homePitcher: pitcherData.home ? {
          name: pitcherData.home.name || 'Unknown',
          id: pitcherData.home.id,
          position: 'P',
          team: homeTeam,
          stats: this.formatPitcherStats(pitcherData.home.stats)
        } : null,
        awayPitcher: pitcherData.away ? {
          name: pitcherData.away.name || 'Unknown',
          id: pitcherData.away.id,
          position: 'P',
          team: awayTeam,
          stats: this.formatPitcherStats(pitcherData.away.stats)
        } : null
      };
    } catch (error) {
      console.error(`Error getting probable pitchers for ${awayTeam} @ ${homeTeam}:`, error.message);
      return null;
    }
  },
  
  /**
   * Get stats for a specific player
   * @param {number} playerId - The API-Sports player ID
   * @returns {Promise<Object>} - Player statistics
   */
  async getPlayerStats(playerId) {
    if (!playerId) {
      console.error('No player ID provided for stats lookup');
      return null;
    }
    
    try {
      const season = new Date().getFullYear();
      const response = await this.apiRequest('/players', { 
        id: playerId,
        league: 1,
        season
      });
      
      if (!response || !response.response || response.response.length === 0) {
        console.log(`No stats found for player ID: ${playerId}`);
        return null;
      }
      
      return response.response[0];
    } catch (error) {
      console.error(`Error fetching stats for player ${playerId}:`, error.message);
      return null;
    }
  },
  
  /**
   * Format pitcher stats into a more usable structure
   * @param {Object} rawStats - Raw API stats
   * @returns {Object} - Formatted pitcher stats
   */
  formatPitcherStats(rawStats) {
    if (!rawStats || !rawStats.statistics || rawStats.statistics.length === 0) {
      return {
        ERA: 'N/A',
        WHIP: 'N/A',
        record: '0-0',
        strikeouts: '0',
        inningsPitched: '0.0'
      };
    }
    
    const stats = rawStats.statistics[0];
    const pitcherStats = stats.pitching || {};
    
    return {
      ERA: pitcherStats.era ? pitcherStats.era.toString() : 'N/A',
      WHIP: pitcherStats.whip ? pitcherStats.whip.toString() : 'N/A',
      record: `${pitcherStats.wins || 0}-${pitcherStats.losses || 0}`,
      strikeouts: pitcherStats.strikeouts ? pitcherStats.strikeouts.toString() : '0',
      inningsPitched: pitcherStats.innings_pitched ? pitcherStats.innings_pitched.toString() : '0.0',
      hits: pitcherStats.hits ? pitcherStats.hits.toString() : '0',
      homeRuns: pitcherStats.home_runs ? pitcherStats.home_runs.toString() : '0', 
      walks: pitcherStats.walks ? pitcherStats.walks.toString() : '0'
    };
  },
  
  /**
   * Format batter stats into a more usable structure
   * @param {Object} rawStats - Raw API stats
   * @returns {Object} - Formatted batter stats
   */
  formatBatterStats(rawStats) {
    if (!rawStats || !rawStats.statistics || rawStats.statistics.length === 0) {
      return {
        AVG: '.000',
        HR: '0',
        RBI: '0',
        hits: '0',
        OPS: 'N/A'
      };
    }
    
    const stats = rawStats.statistics[0];
    const batterStats = stats.batting || {};
    
    return {
      AVG: batterStats.average ? batterStats.average.toString() : '.000',
      HR: batterStats.home_runs ? batterStats.home_runs.toString() : '0',
      RBI: batterStats.rbi ? batterStats.rbi.toString() : '0',
      hits: batterStats.hits ? batterStats.hits.toString() : '0',
      OPS: batterStats.ops ? batterStats.ops.toString() : 'N/A',
      atBats: batterStats.at_bats ? batterStats.at_bats.toString() : '0',
      runs: batterStats.runs ? batterStats.runs.toString() : '0'
    };
  },
  
  /**
   * Get the key players for a team (usually top batters and pitchers)
   * @param {string} teamName - Team name
   * @returns {Promise<Array>} - List of key player stats
   */
  async getKeyPlayers(teamName) {
    try {
      // First find team ID
      const season = new Date().getFullYear();
      const teamsResponse = await this.apiRequest('/teams', { 
        league: 1,
        season,
        search: teamName
      });
      
      if (!teamsResponse?.response || teamsResponse.response.length === 0) {
        console.log(`No team found with name: ${teamName}`);
        return [];
      }
      
      // Find best match for team name
      let teamId = null;
      for (const team of teamsResponse.response) {
        if (team.name.toLowerCase().includes(teamName.toLowerCase()) || 
            teamName.toLowerCase().includes(team.name.toLowerCase())) {
          teamId = team.id;
          break;
        }
      }
      
      if (!teamId) {
        console.log(`No matching team ID found for: ${teamName}`);
        return [];
      }
      
      // Get players for the team
      const playersResponse = await this.apiRequest('/players', {
        team: teamId,
        league: 1,
        season
      });
      
      if (!playersResponse?.response || playersResponse.response.length === 0) {
        console.log(`No players found for team: ${teamName} (ID: ${teamId})`);
        return [];
      }
      
      // Extract key players (top pitchers and batters)
      const keyPlayers = [];
      
      // Process pitcher and batter stats
      for (const player of playersResponse.response) {
        if (!player.statistics || player.statistics.length === 0) continue;
        
        const playerStats = {
          id: player.id,
          name: player.name,
          position: player.position,
          team: teamName
        };
        
        // Check if player is a pitcher
        if (player.position === 'P') {
          playerStats.stats = this.formatPitcherStats(player);
          keyPlayers.push(playerStats);
        } 
        // Add key batters
        else if (['C', '1B', '2B', '3B', 'SS', 'OF', 'DH'].includes(player.position)) {
          playerStats.stats = this.formatBatterStats(player);
          keyPlayers.push(playerStats);
        }
      }
      
      // Sort pitchers by ERA and batters by AVG
      const pitchers = keyPlayers.filter(p => p.position === 'P')
        .sort((a, b) => {
          const eraA = parseFloat(a.stats.ERA === 'N/A' ? '99.99' : a.stats.ERA);
          const eraB = parseFloat(b.stats.ERA === 'N/A' ? '99.99' : b.stats.ERA);
          return eraA - eraB;
        })
        .slice(0, 3); // Top 3 pitchers
        
      const batters = keyPlayers.filter(p => p.position !== 'P')
        .sort((a, b) => {
          const avgA = parseFloat(a.stats.AVG === 'N/A' ? '0' : a.stats.AVG);
          const avgB = parseFloat(b.stats.AVG === 'N/A' ? '0' : b.stats.AVG);
          return avgB - avgA;
        })
        .slice(0, 5); // Top 5 batters
        
      return [...pitchers, ...batters];
    } catch (error) {
      console.error(`Error getting key players for ${teamName}:`, error.message);
  }
  
  try {
    const season = new Date().getFullYear();
    const response = await this.apiRequest('/players', { 
      id: playerId,
      league: 1,
      season
    });
    
    if (!response || !response.response || response.response.length === 0) {
      console.log(`No stats found for player ID: ${playerId}`);
      return null;
    }
    
    return response.response[0];
  } catch (error) {
    console.error(`Error fetching stats for player ${playerId}:`, error.message);
    return null;
  }
},
  
/**
 * Format pitcher stats into a more usable structure
 * @param {Object} rawStats - Raw API stats
 * @returns {Object} - Formatted pitcher stats
 */
formatPitcherStats(rawStats) {
  if (!rawStats || !rawStats.statistics || rawStats.statistics.length === 0) {
    return {
      ERA: 'N/A',
      WHIP: 'N/A',
      record: '0-0',
      strikeouts: '0',
      inningsPitched: '0.0'
    };
  }
  
  const stats = rawStats.statistics[0];
  const pitcherStats = stats.pitching || {};
  
  return {
    ERA: pitcherStats.era ? pitcherStats.era.toString() : 'N/A',
    WHIP: pitcherStats.whip ? pitcherStats.whip.toString() : 'N/A',
    record: `${pitcherStats.wins || 0}-${pitcherStats.losses || 0}`,
    strikeouts: pitcherStats.strikeouts ? pitcherStats.strikeouts.toString() : '0',
    inningsPitched: pitcherStats.innings_pitched ? pitcherStats.innings_pitched.toString() : '0.0',
    hits: pitcherStats.hits ? pitcherStats.hits.toString() : '0',
    homeRuns: pitcherStats.home_runs ? pitcherStats.home_runs.toString() : '0', 
    walks: pitcherStats.walks ? pitcherStats.walks.toString() : '0'
  };
},
  
/**
 * Format batter stats into a more usable structure
 * @param {Object} rawStats - Raw API stats
 * @returns {Object} - Formatted batter stats
 */
formatBatterStats(rawStats) {
  if (!rawStats || !rawStats.statistics || rawStats.statistics.length === 0) {
    return {
      AVG: '.000',
      HR: '0',
      RBI: '0',
      hits: '0',
      OPS: 'N/A'
    };
  }
  
  const stats = rawStats.statistics[0];
  const batterStats = stats.batting || {};
  
  return {
    AVG: batterStats.average ? batterStats.average.toString() : '.000',
    HR: batterStats.home_runs ? batterStats.home_runs.toString() : '0',
    RBI: batterStats.rbi ? batterStats.rbi.toString() : '0',
    hits: batterStats.hits ? batterStats.hits.toString() : '0',
    OPS: batterStats.ops ? batterStats.ops.toString() : 'N/A',
    atBats: batterStats.at_bats ? batterStats.at_bats.toString() : '0',
    runs: batterStats.runs ? batterStats.runs.toString() : '0'
  };
},
  
/**
 * Get the key players for a team (usually top batters and pitchers)
 * @param {string} teamName - Team name
 * @returns {Promise<Array>} - List of key player stats
 */
async getKeyPlayers(teamName) {
  try {
    // First find team ID
    const season = new Date().getFullYear();
    const teamsResponse = await this.apiRequest('/teams', { 
      league: 1,
      season,
      search: teamName
    });
    
    if (!teamsResponse?.response || teamsResponse.response.length === 0) {
      console.log(`No team found with name: ${teamName}`);
      return [];
    }
    
    // Find best match for team name
    let teamId = null;
    for (const team of teamsResponse.response) {
      if (team.name.toLowerCase().includes(teamName.toLowerCase()) || 
          teamName.toLowerCase().includes(team.name.toLowerCase())) {
        teamId = team.id;
        break;
      }
    }
    
    if (!teamId) {
      console.log(`No matching team ID found for: ${teamName}`);
      return [];
    }
    
    // Get players for the team
    const playersResponse = await this.apiRequest('/players', {
      team: teamId,
      league: 1,
      season
    });
    
    if (!playersResponse?.response || playersResponse.response.length === 0) {
      console.log(`No players found for team: ${teamName} (ID: ${teamId})`);
      return [];
    }
    
    // Extract key players (top pitchers and batters)
    const keyPlayers = [];
    
    // Process pitcher and batter stats
    for (const player of playersResponse.response) {
      if (!player.statistics || player.statistics.length === 0) continue;
      
      const playerStats = {
        id: player.id,
        name: player.name,
        position: player.position,
        team: teamName
      };
      
      // Check if player is a pitcher
      if (player.position === 'P') {
        playerStats.stats = this.formatPitcherStats(player);
        keyPlayers.push(playerStats);
      } 
      // Add key batters
      else if (['C', '1B', '2B', '3B', 'SS', 'OF', 'DH'].includes(player.position)) {
        playerStats.stats = this.formatBatterStats(player);
        keyPlayers.push(playerStats);
      }
    }
    
    // Sort pitchers by ERA and batters by AVG
    const pitchers = keyPlayers.filter(p => p.position === 'P')
      .sort((a, b) => {
        const eraA = parseFloat(a.stats.ERA === 'N/A' ? '99.99' : a.stats.ERA);
        const eraB = parseFloat(b.stats.ERA === 'N/A' ? '99.99' : b.stats.ERA);
        return eraA - eraB;
      })
      .slice(0, 3); // Top 3 pitchers
      
    const batters = keyPlayers.filter(p => p.position !== 'P')
      .sort((a, b) => {
        const avgA = parseFloat(a.stats.AVG === 'N/A' ? '0' : a.stats.AVG);
        const avgB = parseFloat(b.stats.AVG === 'N/A' ? '0' : b.stats.AVG);
        return avgB - avgA;
      })
      .slice(0, 5); // Top 5 batters
      
    return [...pitchers, ...batters];
  } catch (error) {
    console.error(`Error getting key players for ${teamName}:`, error.message);
    return [];
  }
},
  
/**
 * Generate a comprehensive player stats report for an MLB game
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @param {string} date - Game date (YYYY-MM-DD)
 * @returns {Promise<string>} - Formatted player stats report
 */
async generateMlbPlayerStatsReport(homeTeam, awayTeam, date = new Date().toISOString().split('T')[0]) {
  try {
    console.log(`Generating MLB player stats report for ${awayTeam} @ ${homeTeam} on ${date}`);
    
    // Track missing data for validation warnings
    const missingData = [];
    
    // Get probable pitchers
    const pitcherData = await this.getProbablePitchers(homeTeam, awayTeam, date);
    
    // Validate pitcher data
    if (!pitcherData) {
      missingData.push('All pitcher data');
    } else {
      if (!pitcherData.homePitcher) missingData.push(`${homeTeam} starting pitcher`);
      if (!pitcherData.awayPitcher) missingData.push(`${awayTeam} starting pitcher`);
    }
    
    // Build the stats report
    let statsReport = `MLB PLAYER STATISTICS:\n\n`;
    
    // Add starting pitcher information
    statsReport += `STARTING PITCHERS:\n`;
    
    if (pitcherData?.homePitcher) {
      const homePitcher = pitcherData.homePitcher;
      // Validate home pitcher stats
      const missingHomePitcherStats = [];
      if (!homePitcher.stats.ERA) missingHomePitcherStats.push('ERA');
      if (!homePitcher.stats.record) missingHomePitcherStats.push('Record');
      if (!homePitcher.stats.WHIP) missingHomePitcherStats.push('WHIP');
      if (!homePitcher.stats.strikeouts) missingHomePitcherStats.push('Strikeouts');
      if (!homePitcher.stats.inningsPitched) missingHomePitcherStats.push('IP');
      
      if (missingHomePitcherStats.length > 0) {
        missingData.push(`${homeTeam} pitcher (${homePitcher.name}) missing stats: ${missingHomePitcherStats.join(', ')}`);
      }
      
      statsReport += `${homePitcher.name} (${homeTeam}): `;
      statsReport += `ERA: ${homePitcher.stats.ERA || 'N/A'}, `;
      statsReport += `Record: ${homePitcher.stats.record || 'N/A'}, `;
      statsReport += `WHIP: ${homePitcher.stats.WHIP || 'N/A'}, `;
      statsReport += `K: ${homePitcher.stats.strikeouts || 'N/A'}, `;
      statsReport += `IP: ${homePitcher.stats.inningsPitched || 'N/A'}\n`;
    } else {
      statsReport += `${homeTeam} Starting Pitcher: Not announced\n`;
    }
    
    if (pitcherData?.awayPitcher) {
      const awayPitcher = pitcherData.awayPitcher;
      // Validate away pitcher stats
      const missingAwayPitcherStats = [];
      if (!awayPitcher.stats.ERA) missingAwayPitcherStats.push('ERA');
      if (!awayPitcher.stats.record) missingAwayPitcherStats.push('Record');
      if (!awayPitcher.stats.WHIP) missingAwayPitcherStats.push('WHIP');
      if (!awayPitcher.stats.strikeouts) missingAwayPitcherStats.push('Strikeouts');
      if (!awayPitcher.stats.inningsPitched) missingAwayPitcherStats.push('IP');
      
      if (missingAwayPitcherStats.length > 0) {
        missingData.push(`${awayTeam} pitcher (${awayPitcher.name}) missing stats: ${missingAwayPitcherStats.join(', ')}`);
      }
      
      statsReport += `${awayPitcher.name} (${awayTeam}): `;
      statsReport += `ERA: ${awayPitcher.stats.ERA || 'N/A'}, `;
      statsReport += `Record: ${awayPitcher.stats.record || 'N/A'}, `;
      statsReport += `WHIP: ${awayPitcher.stats.WHIP || 'N/A'}, `;
      statsReport += `K: ${awayPitcher.stats.strikeouts || 'N/A'}, `;
      statsReport += `IP: ${awayPitcher.stats.inningsPitched || 'N/A'}\n`;
    } else {
      statsReport += `${awayTeam} Starting Pitcher: Not announced\n`;
    }
    
    statsReport += `\n`;
    
    // Get key players for both teams
    const [homeKeyPlayers, awayKeyPlayers] = await Promise.all([
      this.getKeyPlayers(homeTeam),
      this.getKeyPlayers(awayTeam)
    ]);
    
    // Validate key players data
    if (!homeKeyPlayers || homeKeyPlayers.length === 0) {
      missingData.push(`${homeTeam} batter data`);
    }
    if (!awayKeyPlayers || awayKeyPlayers.length === 0) {
      missingData.push(`${awayTeam} batter data`);
    }
    
    // Add key batter information for home team
    statsReport += `KEY BATTERS - ${homeTeam}:\n`;
    
    if (homeKeyPlayers && homeKeyPlayers.length > 0) {
      const homeBatters = homeKeyPlayers.filter(p => p.position !== 'P');
      if (homeBatters.length === 0) {
        missingData.push(`${homeTeam} non-pitcher batter data`);
      }
      
      for (const batter of homeBatters.slice(0, 3)) { // Top 3 batters
        // Validate batter stats
        const missingBatterStats = [];
        if (!batter.stats.AVG) missingBatterStats.push('AVG');
        if (!batter.stats.HR) missingBatterStats.push('HR');
        if (!batter.stats.RBI) missingBatterStats.push('RBI');
        
        if (missingBatterStats.length > 0) {
          missingData.push(`${homeTeam} batter (${batter.name}) missing stats: ${missingBatterStats.join(', ')}`);
        }
        
        statsReport += `${batter.name} (${batter.position}): `;
        statsReport += `AVG: ${batter.stats.AVG || 'N/A'}, `;
        statsReport += `HR: ${batter.stats.HR || 'N/A'}, `;
        statsReport += `RBI: ${batter.stats.RBI || 'N/A'}\n`;
      }
    } else {
      statsReport += `No key batter data available for ${homeTeam}\n`;
    }
    
    statsReport += `\nKEY BATTERS - ${awayTeam}:\n`;
    
    if (awayKeyPlayers && awayKeyPlayers.length > 0) {
      const awayBatters = awayKeyPlayers.filter(p => p.position !== 'P');
      if (awayBatters.length === 0) {
        missingData.push(`${awayTeam} non-pitcher batter data`);
      }
      
      for (const batter of awayBatters.slice(0, 3)) { // Top 3 batters
        // Validate batter stats
        const missingBatterStats = [];
        if (!batter.stats.AVG) missingBatterStats.push('AVG');
        if (!batter.stats.HR) missingBatterStats.push('HR');
        if (!batter.stats.RBI) missingBatterStats.push('RBI');
        
        if (missingBatterStats.length > 0) {
          missingData.push(`${awayTeam} batter (${batter.name}) missing stats: ${missingBatterStats.join(', ')}`);
        }
        
        statsReport += `${batter.name} (${batter.position}): `;
        statsReport += `AVG: ${batter.stats.AVG || 'N/A'}, `;
        statsReport += `HR: ${batter.stats.HR || 'N/A'}, `;
        statsReport += `RBI: ${batter.stats.RBI || 'N/A'}\n`;
      }
    } else {
      statsReport += `No key batter data available for ${awayTeam}\n`;
    }
    
    // Log any missing data warnings
    if (missingData.length > 0) {
      console.warn(`⚠️ MLB STATS WARNING - Missing data for ${awayTeam} @ ${homeTeam}:\n - ${missingData.join('\n - ')}`);
    } else {
      console.log(`✅ MLB STATS COMPLETE - All expected data received for ${awayTeam} @ ${homeTeam}`);
    }
    
    return statsReport;
  } catch (error) {
    console.error(`Error generating MLB player stats report for ${awayTeam} @ ${homeTeam}:`, error.message);
    return `Error generating MLB player statistics: ${error.message}`;
  }
}
};

export default mlbPlayerStatsService;
