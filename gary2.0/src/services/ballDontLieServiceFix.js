/**
 * Ball Don't Lie API Service with SportsDB Fallback
 * Provides access to detailed MLB and NBA statistics for betting analysis
 * Using official @balldontlie/sdk with fallback to SportsDB when needed
 */
import { BalldontlieAPI } from '@balldontlie/sdk';

// Initialize the API client with our API key
let API_KEY;
try {
  API_KEY = import.meta.env?.VITE_BALLDONTLIE_API_KEY || process.env.VITE_BALLDONTLIE_API_KEY || '3363660a-a082-43b7-a130-6249ff68e5ab';
} catch (e) {
  // If import.meta.env is not available (running in Node directly)
  API_KEY = process.env.VITE_BALLDONTLIE_API_KEY || '3363660a-a082-43b7-a130-6249ff68e5ab';
}

// Default to GOAT plan key if not in env
let api;

// Cache for API responses
const cache = new Map();
// MLB data needs fresher cache for current 2025 season data
const MLB_CACHE_TTL = 60 * 1000; // 1 minute cache TTL for MLB data
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL for other data

// Helper function to get data from cache or fetch it
const getCachedOrFetch = async (cacheKey, fetchFn, isMLB = false) => {
  const now = Date.now();
  const cached = cache.get(cacheKey);
  const ttl = isMLB ? MLB_CACHE_TTL : CACHE_TTL;
  
  if (cached && (now - cached.timestamp < ttl)) {
    console.log(`Using cached data for ${cacheKey} (TTL: ${isMLB ? '1 minute' : '5 minutes'})`);
    return cached.data;
  }
  
  console.log(`Cache miss or expired for ${cacheKey}, fetching fresh data...`);
  const data = await fetchFn();
  cache.set(cacheKey, { data, timestamp: now });
  return data;
}

// Initialize api
const initApi = () => {
  if (!api) {
    api = new BalldontlieAPI({ apiKey: API_KEY });
  }
  return api;
};

// Levenshtein distance for name similarity (for backup team matching)
const levenshteinDistance = (a, b) => {
  const an = a.toLowerCase();
  const bn = b.toLowerCase();
  const matrix = Array(an.length + 1).fill().map(() => Array(bn.length + 1).fill(0));
  
  for (let i = 0; i <= an.length; i++) {
    matrix[i][0] = i;
  }
  
  for (let j = 0; j <= bn.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= an.length; i++) {
    for (let j = 1; j <= bn.length; j++) {
      if (an[i-1] === bn[j-1]) {
        matrix[i][j] = matrix[i-1][j-1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i-1][j-1] + 1,
          matrix[i][j-1] + 1,
          matrix[i-1][j] + 1
        );
      }
    }
  }
  
  return matrix[an.length][bn.length];
};

const ballDontLieService = {
  // Get API key for external services
  getApiKey() {
    return API_KEY;
  },
  
  // Get the API client instance
  getClient() {
    return initApi();
  },
  
  // Initialize the service
  initialize() {
    try {
      console.log('Initializing Ball Don\'t Lie API service...');
      api = new BalldontlieAPI({ apiKey: API_KEY });
      
      // Verify we can access the API
      if (!api) {
        console.error('Failed to initialize Ball Don\'t Lie API client!');
        return false;
      }
      
      // Log available endpoints
      const endpoints = Object.keys(api);
      console.log(`Ball Don't Lie API initialized with endpoints: ${endpoints.join(', ')}`);
      
      return true;
    } catch (error) {
      console.error('Error initializing Ball Don\'t Lie API:', error);
      return false;
    }
  },
  
  // Check if the service is initialized
  isInitialized() {
    return !!api;
  },
  
  // Get active MLB players
  async getActiveMLBPlayers(options = {}) {
    try {
      if (!this.isInitialized()) {
        this.initialize();
      }
      
      const cacheKey = `active_mlb_players_${JSON.stringify(options)}`;
      return getCachedOrFetch(cacheKey, async () => {
        console.log('Fetching active MLB players from Ball Don\'t Lie');
        const response = await api.mlb.getPlayers({
          active: true,
          ...options
        });
        return response.data || [];
      }, true);
    } catch (error) {
      console.error('Error fetching active MLB players:', error);
      return [];
    }
  },
  
  // Get MLB games for a specific date
  async getMlbGamesByDate(date) {
    try {
      const cacheKey = `mlb_games_${date}`;
      return getCachedOrFetch(cacheKey, async () => {
        console.log(`Fetching MLB games for ${date} from BallDontLie (2025 season)`);
        
        // Make sure API is initialized
        if (!api) {
          console.log('API client not initialized, initializing now...');
          api = new BalldontlieAPI({ apiKey: API_KEY });
        }
        
        // Check if MLB endpoint is available
        if (!api.mlb) {
          console.error('ERROR: api.mlb endpoint is not available in the Ball Don\'t Lie SDK');
          console.log('Available endpoints:', Object.keys(api).join(', '));
          return [];
        }
        
        const response = await api.mlb.getGames({ 
          dates: [date],
          season: 2025, // Explicitly request 2025 season data
          per_page: 100 // Max allowed
        });
        return response.data || [];
      }, true);
    } catch (error) {
      console.error('Error fetching MLB games:', error);
      return [];
    }
  },
  
  // Get NBA games for a specific date
  async getNbaGamesByDate(date) {
    try {
      const cacheKey = `nba_games_${date}`;
      return getCachedOrFetch(cacheKey, async () => {
        console.log(`Fetching NBA games for ${date} from BallDontLie`);
        const client = initApi();
        const response = await client.nba.getGames({ 
          dates: [date],
          per_page: 100 // Max allowed
        });
        return response.data || [];
      });
    } catch (error) {
      console.error('Error fetching NBA games:', error);
      return [];
    }
  },
  
  // Get all games (NBA + MLB) for a specific date
  async getAllGamesByDate(date) {
    try {
      const [nbaGames, mlbGames] = await Promise.all([
        this.getNbaGamesByDate(date),
        this.getMlbGamesByDate(date)
      ]);
      
      return {
        NBA: nbaGames,
        MLB: mlbGames
      };
    } catch (error) {
      console.error('Error fetching all games:', error);
      return { NBA: [], MLB: [] };
    }
  },
  
  // Get team information by team name - FIXED VERSION
  async getTeamByName(teamName) {
    try {
      console.log(`Looking up team: ${teamName}`);
      // Normalize team name for comparison
      const normalizedName = teamName.toLowerCase().trim();
      
      // Use the getMlbGamesByDate to get a list of teams
      const todayDate = new Date().toISOString().split('T')[0];
      const games = await this.getMlbGamesByDate(todayDate);
      
      // Extract all teams from today's games
      const teams = [];
      games.forEach(game => {
        if (game.home_team && !teams.some(t => t.id === game.home_team.id)) {
          teams.push(game.home_team);
        }
        if (game.away_team && !teams.some(t => t.id === game.away_team.id)) {
          teams.push(game.away_team);
        }
      });
      
      // If no teams found in today's games, return null
      if (teams.length === 0) {
        console.log('No teams found in today\'s games, cannot find team by name');
        return null;
      }
      
      // Find the team by comparing names
      const team = teams.find(t => {
        const teamDisplayName = t.display_name?.toLowerCase() || '';
        const teamShortName = t.short_display_name?.toLowerCase() || '';
        const teamLocation = t.location?.toLowerCase() || '';
        const teamFullName = `${teamLocation} ${t.name?.toLowerCase() || ''}`;
        
        return (
          teamDisplayName.includes(normalizedName) ||
          normalizedName.includes(teamDisplayName) ||
          teamShortName.includes(normalizedName) ||
          normalizedName.includes(teamShortName) ||
          teamFullName.includes(normalizedName) ||
          normalizedName.includes(teamFullName)
        );
      });
      
      if (team) {
        console.log(`Found team: ${team.display_name} (ID: ${team.id})`);
        return team;
      }
      
      console.log(`Could not find team matching: ${teamName}`);
      return null;
    } catch (error) {
      console.error(`Error finding team by name (${teamName}):`, error);
      return null;
    }
  },
  
  // Get MLB pitcher matchup data
  async getMlbPitcherMatchup(homeTeam, awayTeam) {
    try {
      console.log(`Getting pitcher matchup data for ${awayTeam} @ ${homeTeam}`);
      
      // Get pitchers for both teams
      const [homePitchers, awayPitchers] = await Promise.all([
        this.getMlbPitcherStatsByTeam(homeTeam),
        this.getMlbPitcherStatsByTeam(awayTeam)
      ]);
      
      if (!homePitchers.length || !awayPitchers.length) {
        console.log(`Could not find pitchers for ${homeTeam} or ${awayTeam}`);
        return null;
      }
      
      // Find starting pitchers
      const homePitcher = await this.findStartingPitcher(homePitchers, homeTeam);
      const awayPitcher = await this.findStartingPitcher(awayPitchers, awayTeam);
      
      if (!homePitcher || !awayPitcher) {
        console.log(`Could not identify starting pitchers for ${homeTeam} vs ${awayTeam}`);
        return null;
      }
      
      // Format pitcher data for analysis
      const formattedHome = this.formatPitcherData(homePitcher);
      const formattedAway = this.formatPitcherData(awayPitcher);
      
      // Create text summary for OpenAI
      let pitcherMatchupText = `STARTING PITCHER MATCHUP: ${awayTeam} vs ${homeTeam}\n\n`;
      
      // Away pitcher stats
      pitcherMatchupText += `${awayTeam} Starting Pitcher: ${formattedAway.name} (#${formattedAway.number || 'N/A'})\n`;
      pitcherMatchupText += `Season Stats: ${formattedAway.wins}-${formattedAway.losses}, ${formattedAway.era} ERA, ${formattedAway.innings} IP, ${formattedAway.strikeouts} K, ${formattedAway.whip} WHIP, ${formattedAway.battingAvgAgainst} BAA\n\n`;
      
      // Home pitcher stats
      pitcherMatchupText += `${homeTeam} Starting Pitcher: ${formattedHome.name} (#${formattedHome.number || 'N/A'})\n`;
      pitcherMatchupText += `Season Stats: ${formattedHome.wins}-${formattedHome.losses}, ${formattedHome.era} ERA, ${formattedHome.innings} IP, ${formattedHome.strikeouts} K, ${formattedHome.whip} WHIP, ${formattedHome.battingAvgAgainst} BAA\n\n`;
      
      // Return complete pitcher matchup data
      return {
        homePitcher: formattedHome,
        awayPitcher: formattedAway,
        pitcherMatchupText
      };
    } catch (error) {
      console.error(`Error getting pitcher matchup for ${homeTeam} vs ${awayTeam}:`, error);
      return null;
    }
  },
  
  // Find starting pitcher function
  async findStartingPitcher(pitchers, teamName) {
    if (!pitchers || pitchers.length === 0) {
      console.log(`No pitchers found for ${teamName}`);
      return null;
    }
    
    // Sort by starts (most starts is likely the starter)
    const sortedByStarts = [...pitchers].sort((a, b) => {
      const aStarts = a.stats?.games_started || 0;
      const bStarts = b.stats?.games_started || 0;
      return bStarts - aStarts;
    });
    
    // Pick the pitcher with most starts
    return sortedByStarts[0];
  },
  
  // Format pitcher data
  formatPitcherData(pitcher) {
    if (!pitcher) return null;
    
    return {
      id: pitcher.id,
      name: pitcher.full_name || 'Unknown Pitcher',
      number: pitcher.jersey_number || 'N/A',
      position: pitcher.primary_position || 'P',
      wins: pitcher.stats?.wins || 0,
      losses: pitcher.stats?.losses || 0,
      era: parseFloat(pitcher.stats?.era || '0.00').toFixed(2),
      innings: pitcher.stats?.innings_pitched || '0.0',
      strikeouts: pitcher.stats?.strikeouts || 0,
      whip: parseFloat(pitcher.stats?.whip || '0.00').toFixed(2),
      battingAvgAgainst: pitcher.stats?.batting_avg_against || '.000'
    };
  },
  
  // Get MLB pitcher stats by team name
  async getMlbPitcherStatsByTeam(teamName) {
    try {
      console.log(`Getting MLB pitcher stats for team: ${teamName}`);
      
      // Get active MLB players
      const allPlayers = await this.getActiveMLBPlayers();
      
      // Filter to find pitchers on the team
      const teamPitchers = allPlayers.filter(player => {
        // Check if player is a pitcher
        const isPitcher = player.primary_position === 'P';
        
        // Check if player belongs to the team
        const playerTeam = player.team?.display_name || '';
        const teamNameLower = teamName.toLowerCase();
        const playerTeamLower = playerTeam.toLowerCase();
        
        // Name matching logic
        const isOnTeam = 
          playerTeamLower.includes(teamNameLower) ||
          teamNameLower.includes(playerTeamLower) ||
          levenshteinDistance(playerTeamLower, teamNameLower) <= 3;
        
        return isPitcher && isOnTeam;
      });
      
      if (teamPitchers.length === 0) {
        console.log(`No pitchers found for team: ${teamName}`);
        return [];
      }
      
      // Get season stats for each pitcher
      const pitchersWithStats = await Promise.all(
        teamPitchers.map(async pitcher => {
          try {
            // Get pitcher stats
            const stats = await this.getMlbPlayerSeasonStats(pitcher.id);
            
            return {
              ...pitcher,
              stats: stats
            };
          } catch (e) {
            console.error(`Error getting stats for pitcher ${pitcher.full_name}:`, e);
            return pitcher;
          }
        })
      );
      
      return pitchersWithStats;
      
    } catch (error) {
      console.error(`Error getting MLB pitcher stats for team ${teamName}:`, error);
      return [];
    }
  },
  
  // Get MLB player season stats
  async getMlbPlayerSeasonStats(playerId, season = 2025) {
    try {
      const cacheKey = `mlb_player_stats_${playerId}_${season}`;
      return getCachedOrFetch(cacheKey, async () => {
        console.log(`Fetching season stats for player ${playerId} (${season} season)`);
        const response = await api.mlb.getPlayerStats({
          playerId,
          season
        });
        
        // Extract the stats data
        if (response && response.data && response.data.length > 0) {
          return response.data[0];
        }
        
        return null;
      }, true);
    } catch (error) {
      console.error(`Error fetching player stats for ${playerId}:`, error);
      return null;
    }
  },
  
  // Get MLB team season stats
  async getMlbTeamSeasonStats(teamId, season = 2025) {
    try {
      const cacheKey = `mlb_team_stats_${teamId}_${season}`;
      return getCachedOrFetch(cacheKey, async () => {
        console.log(`Fetching team stats for team ${teamId} (${season} season)`);
        const response = await api.mlb.getTeamStats({
          teamId,
          season
        });
        
        // Extract the stats data
        if (response && response.data && response.data.length > 0) {
          return response.data[0];
        }
        
        return null;
      }, true);
    } catch (error) {
      console.error(`Error fetching team stats for ${teamId}:`, error);
      return null;
    }
  },
  
  // Get MLB team standings
  async getMlbTeamStandings(teamId = null, season = 2025) {
    try {
      const cacheKey = `mlb_standings_${season}${teamId ? '_' + teamId : ''}`;
      return getCachedOrFetch(cacheKey, async () => {
        console.log(`Fetching MLB standings for ${season} season${teamId ? ` (team ${teamId})` : ''}`);
        const response = await api.mlb.getStandings({
          season
        });
        
        // If teamId is specified, filter to that team
        if (teamId && response && response.data) {
          // Look through all divisions for the team
          for (const division of response.data) {
            const team = division.teams.find(t => t.team.id === teamId);
            if (team) {
              return team;
            }
          }
          return null;
        }
        
        // Otherwise return all standings
        return response.data || [];
      }, true);
    } catch (error) {
      console.error(`Error fetching MLB standings:`, error);
      return null;
    }
  },
  
  // Get MLB team comparison stats
  async getMlbTeamComparisonStats(homeTeamName, awayTeamName) {
    try {
      console.log(`Generating comprehensive team stats comparison for ${awayTeamName} @ ${homeTeamName}`);
      
      // Step 1: Get team IDs for both teams
      const [homeTeam, awayTeam] = await Promise.all([
        this.getTeamByName(homeTeamName),
        this.getTeamByName(awayTeamName)
      ]);
      
      if (!homeTeam || !awayTeam) {
        console.error(`Could not find teams: ${homeTeamName} or ${awayTeamName}`);
        return null;
      }
      
      console.log(`Found teams: Home=${homeTeam.display_name} (${homeTeam.id}), Away=${awayTeam.display_name} (${awayTeam.id})`);
      
      // Step 2: Get season stats and standings for both teams
      const [
        homeTeamSeasonStats,
        awayTeamSeasonStats,
        homeTeamStanding,
        awayTeamStanding,
        allStandings
      ] = await Promise.all([
        this.getMlbTeamSeasonStats(homeTeam.id),
        this.getMlbTeamSeasonStats(awayTeam.id),
        this.getMlbTeamStandings(homeTeam.id),
        this.getMlbTeamStandings(awayTeam.id),
        this.getMlbTeamStandings() // Get all standings to show divisional context
      ]);
      
      // Prepare team info
      const homeTeamInfo = {
        info: homeTeam,
        stats: homeTeamSeasonStats,
        standing: homeTeamStanding,
        record: homeTeamStanding ? `${homeTeamStanding.wins}-${homeTeamStanding.losses}` : 'N/A',
        divisionRank: homeTeamStanding ? homeTeamStanding.division_rank : 'N/A',
        lastTenGames: homeTeamStanding ? `${homeTeamStanding.l10_wins}-${homeTeamStanding.l10_losses}` : 'N/A',
        homeRecord: homeTeamStanding ? `${homeTeamStanding.home_wins}-${homeTeamStanding.home_losses}` : 'N/A'
      };
      
      const awayTeamInfo = {
        info: awayTeam,
        stats: awayTeamSeasonStats,
        standing: awayTeamStanding,
        record: awayTeamStanding ? `${awayTeamStanding.wins}-${awayTeamStanding.losses}` : 'N/A',
        divisionRank: awayTeamStanding ? awayTeamStanding.division_rank : 'N/A',
        lastTenGames: awayTeamStanding ? `${awayTeamStanding.l10_wins}-${awayTeamStanding.l10_losses}` : 'N/A',
        roadRecord: awayTeamStanding ? `${awayTeamStanding.road_wins}-${awayTeamStanding.road_losses}` : 'N/A'
      };
      
      // Extract key stats for summary
      const summary = {
        homeBattingAVG: homeTeamSeasonStats?.batting_avg || '.000',
        awayBattingAVG: awayTeamSeasonStats?.batting_avg || '.000',
        homePitchingERA: homeTeamSeasonStats?.pitching_era || '0.00',
        awayPitchingERA: awayTeamSeasonStats?.pitching_era || '0.00',
        homeRunsScored: homeTeamSeasonStats?.runs || 0,
        awayRunsScored: awayTeamSeasonStats?.runs || 0,
        homeRunsAllowed: homeTeamSeasonStats?.runs_allowed || 0,
        awayRunsAllowed: awayTeamSeasonStats?.runs_allowed || 0
      };
      
      // Create text summary for OpenAI
      let teamComparisonText = `TEAM COMPARISON: ${awayTeam.display_name} @ ${homeTeam.display_name}\n\n`;
      
      // Records and standings
      teamComparisonText += `${awayTeam.display_name}: ${awayTeamInfo.record} (${awayTeamInfo.divisionRank} in division), Last 10: ${awayTeamInfo.lastTenGames}, Road: ${awayTeamInfo.roadRecord}\n`;
      teamComparisonText += `${homeTeam.display_name}: ${homeTeamInfo.record} (${homeTeamInfo.divisionRank} in division), Last 10: ${homeTeamInfo.lastTenGames}, Home: ${homeTeamInfo.homeRecord}\n\n`;
      
      // Key stats comparison
      teamComparisonText += `BATTING: ${awayTeam.display_name} ${summary.awayBattingAVG} AVG, ${summary.awayRunsScored} Runs | ${homeTeam.display_name} ${summary.homeBattingAVG} AVG, ${summary.homeRunsScored} Runs\n`;
      teamComparisonText += `PITCHING: ${awayTeam.display_name} ${summary.awayPitchingERA} ERA, ${summary.awayRunsAllowed} Runs Allowed | ${homeTeam.display_name} ${summary.homePitchingERA} ERA, ${summary.homeRunsAllowed} Runs Allowed\n`;
      
      // Return complete team comparison data
      return {
        homeTeam: homeTeamInfo,
        awayTeam: awayTeamInfo,
        summary,
        teamComparisonText
      };
    } catch (error) {
      console.error(`Error generating team comparison stats for ${awayTeamName} @ ${homeTeamName}:`, error);
      return null;
    }
  },
  
  // Get comprehensive MLB game stats with SportsDB fallback
  async getComprehensiveMlbGameStats(homeTeamName, awayTeamName) {
    try {
      console.log(`Generating comprehensive MLB game statistics for ${awayTeamName} @ ${homeTeamName}`);
      
      // Try Ball Don't Lie API first
      try {
        // Get both pitcher matchup data and team comparison stats in parallel
        const [pitcherMatchup, teamComparison] = await Promise.all([
          this.getMlbPitcherMatchup(homeTeamName, awayTeamName),
          this.getMlbTeamComparisonStats(homeTeamName, awayTeamName)
        ]);
        
        // If we got complete data, return it
        if (pitcherMatchup && teamComparison) {
          console.log('Successfully retrieved MLB game data from Ball Don\'t Lie API');
          return {
            pitcherMatchup,
            teamComparison,
            pitcherMatchupText: pitcherMatchup.pitcherMatchupText,
            teamComparisonText: teamComparison.teamComparisonText,
            statsAvailable: true,
            dataSource: 'BallDontLie'
          };
        }
        
        // If we get here, we didn't get complete data from Ball Don't Lie API
        console.log('Incomplete data from Ball Don\'t Lie API, trying SportsDB fallback...');
      } catch (bdlError) {
        console.error(`Error with Ball Don't Lie API: ${bdlError.message}`);
        console.log('Trying SportsDB fallback...');
      }
      
      // FALLBACK: Try to get data from SportsDB
      try {
        // Import here to avoid circular dependencies
        const { sportsDataService } = await import('./sportsDataService.js');
        console.log('Using SportsDB as fallback for MLB game data');
        
        const statsContext = await sportsDataService.generateTeamStatsForGame(
          homeTeamName,
          awayTeamName,
          'MLB'
        );
        
        if (statsContext && statsContext.statsAvailable) {
          console.log('Successfully retrieved MLB game data from SportsDB fallback');
          
          // Format in similar structure to the Ball Don't Lie response
          return {
            pitcherMatchup: { pitcherMatchupText: 'Pitcher data unavailable from fallback source' },
            teamComparison: { teamComparisonText: statsContext.statsText },
            pitcherMatchupText: 'Pitcher data unavailable from fallback source',
            teamComparisonText: statsContext.statsText,
            statsAvailable: true,
            dataSource: 'SportsDB',
            homeTeamData: statsContext.homeTeamData,
            awayTeamData: statsContext.awayTeamData,
            rawData: statsContext
          };
        }
        
        console.log('SportsDB fallback also failed to provide MLB game data');
      } catch (sportsDbError) {
        console.error(`SportsDB fallback also failed: ${sportsDbError.message}`);
      }
      
      // If we get here, both primary and fallback sources failed
      console.log('Failed to get complete MLB game data from any source');
      return null;
    } catch (error) {
      console.error(`Error generating comprehensive MLB game stats for ${homeTeamName} vs ${awayTeamName}:`, error);
      return null;
    }
  }
};

// Initialize on import
ballDontLieService.initialize();

export { ballDontLieService };
