/**
 * NHL Playoff Stats Service
 * Fetches postseason-only statistics for NHL teams and players
 */
import axios from 'axios';
import { apiCache } from '../utils/apiCache.js';

const NHL_API_BASE_URL = 'https://api-web.nhle.com/v1';
const NHL_STATS_API = 'https://statsapi.web.nhl.com/api/v1';

// Cache helper
const getCachedOrFetch = async (cacheKey, fetchFn, ttl = 3600) => {
  const cached = apiCache.get(cacheKey);
  if (cached) return cached;
  
  const data = await fetchFn();
  apiCache.set(cacheKey, data, ttl);
  return data;
};

export const nhlPlayoffService = {
  /**
   * Get current NHL playoff standings
   * @returns {Promise<Object>} - Playoff standings data
   */
  async getPlayoffStandings() {
    try {
      const cacheKey = 'nhl_playoff_standings';
      return getCachedOrFetch(cacheKey, async () => {
        console.log('Fetching NHL playoff standings...');
        
        // Get current season
        const seasonResponse = await axios.get(`${NHL_STATS_API}/seasons/current`);
        const currentSeason = seasonResponse.data.seasons[0].seasonId;
        
        // Get playoff standings
        const standingsResponse = await axios.get(`${NHL_STATS_API}/standings/byConference`, {
          params: {
            season: currentSeason,
            expand: 'standings.record'
          }
        });
        
        return standingsResponse.data.records || [];
      });
    } catch (error) {
      console.error('Error fetching NHL playoff standings:', error);
      return [];
    }
  },

  /**
   * Get NHL playoff games for current season
   * @returns {Promise<Array>} - Array of playoff games
   */
  async getPlayoffGames() {
    try {
      const cacheKey = 'nhl_playoff_games';
      return getCachedOrFetch(cacheKey, async () => {
        console.log('Fetching NHL playoff games...');
        
        // Get current season
        const seasonResponse = await axios.get(`${NHL_STATS_API}/seasons/current`);
        const currentSeason = seasonResponse.data.seasons[0].seasonId;
        
        // Get playoff games
        const gamesResponse = await axios.get(`${NHL_STATS_API}/schedule`, {
          params: {
            season: currentSeason,
            gameType: 'P' // P for playoffs
          }
        });
        
        const allGames = [];
        if (gamesResponse.data.dates) {
          gamesResponse.data.dates.forEach(date => {
            if (date.games) {
              allGames.push(...date.games);
            }
          });
        }
        
        return allGames;
      });
    } catch (error) {
      console.error('Error fetching NHL playoff games:', error);
      return [];
    }
  },

  /**
   * Get playoff stats for a specific team
   * @param {string} teamName - Team name
   * @returns {Promise<Object>} - Team playoff stats
   */
  async getTeamPlayoffStats(teamName) {
    try {
      const cacheKey = `nhl_team_playoff_stats_${teamName}`;
      return getCachedOrFetch(cacheKey, async () => {
        console.log(`Fetching NHL playoff stats for ${teamName}...`);
        
        // First get team ID
        const teamsResponse = await axios.get(`${NHL_STATS_API}/teams`);
        const team = teamsResponse.data.teams.find(t => 
          t.name.toLowerCase().includes(teamName.toLowerCase()) ||
          teamName.toLowerCase().includes(t.name.toLowerCase()) ||
          t.teamName.toLowerCase().includes(teamName.toLowerCase()) ||
          teamName.toLowerCase().includes(t.teamName.toLowerCase())
        );
        
        if (!team) {
          console.log(`Team ${teamName} not found`);
          return null;
        }
        
        const teamId = team.id;
        
        // Get current season
        const seasonResponse = await axios.get(`${NHL_STATS_API}/seasons/current`);
        const currentSeason = seasonResponse.data.seasons[0].seasonId;
        
        // Get team playoff stats
        const statsResponse = await axios.get(`${NHL_STATS_API}/teams/${teamId}/stats`, {
          params: {
            season: currentSeason,
            gameType: 'P' // Playoffs only
          }
        });
        
        return {
          team: team,
          stats: statsResponse.data.stats || []
        };
      });
    } catch (error) {
      console.error(`Error fetching playoff stats for ${teamName}:`, error);
      return null;
    }
  },

  /**
   * Get playoff player stats for a team
   * @param {string} teamName - Team name
   * @returns {Promise<Array>} - Array of player playoff stats
   */
  async getTeamPlayoffPlayers(teamName) {
    try {
      const cacheKey = `nhl_team_playoff_players_${teamName}`;
      return getCachedOrFetch(cacheKey, async () => {
        console.log(`Fetching NHL playoff player stats for ${teamName}...`);
        
        // First get team ID
        const teamsResponse = await axios.get(`${NHL_STATS_API}/teams`);
        const team = teamsResponse.data.teams.find(t => 
          t.name.toLowerCase().includes(teamName.toLowerCase()) ||
          teamName.toLowerCase().includes(t.name.toLowerCase())
        );
        
        if (!team) {
          console.log(`Team ${teamName} not found`);
          return [];
        }
        
        const teamId = team.id;
        
        // Get current season
        const seasonResponse = await axios.get(`${NHL_STATS_API}/seasons/current`);
        const currentSeason = seasonResponse.data.seasons[0].seasonId;
        
        // Get roster
        const rosterResponse = await axios.get(`${NHL_STATS_API}/teams/${teamId}/roster`);
        const roster = rosterResponse.data.roster || [];
        
        // Get playoff stats for each player
        const playerStats = [];
        for (const player of roster.slice(0, 10)) { // Top 10 players to avoid too many requests
          try {
            const statsResponse = await axios.get(
              `${NHL_STATS_API}/people/${player.person.id}/stats?stats=statsSingleSeasonPlayoffs&season=${currentSeason}`
            );
            
            if (statsResponse.data.stats && statsResponse.data.stats[0]?.splits?.length > 0) {
              const stats = statsResponse.data.stats[0].splits[0].stat;
              playerStats.push({
                player: player.person,
                position: player.position,
                playoffStats: stats
              });
            }
          } catch (err) {
            console.error(`Error fetching stats for player ${player.person.id}:`, err.message);
          }
        }
        
        return playerStats;
      });
    } catch (error) {
      console.error(`Error fetching playoff players for ${teamName}:`, error);
      return [];
    }
  },

  /**
   * Generate NHL playoff report for a matchup
   * @param {string} homeTeam - Home team name
   * @param {string} awayTeam - Away team name
   * @returns {Promise<string>} - Formatted playoff report
   */
  async generateNhlPlayoffReport(homeTeam, awayTeam) {
    try {
      console.log(`Generating NHL playoff report for ${awayTeam} @ ${homeTeam}`);
      
      // Get playoff stats for both teams
      const [homeStats, awayStats] = await Promise.all([
        this.getTeamPlayoffStats(homeTeam),
        this.getTeamPlayoffStats(awayTeam)
      ]);
      
      let report = `# NHL PLAYOFF REPORT: ${awayTeam} @ ${homeTeam}\n\n`;
      
      // Check if teams are in playoffs
      if (!homeStats && !awayStats) {
        report += `Neither team has playoff data available. Using regular season stats.\n\n`;
        return report;
      }
      
      // Add team playoff stats
      if (homeStats?.stats?.[0]?.splits?.[0]?.stat) {
        const stat = homeStats.stats[0].splits[0].stat;
        report += `## ${homeTeam} Playoff Stats:\n`;
        report += `- Record: ${stat.wins || 0}-${stat.losses || 0}-${stat.ot || 0}\n`;
        report += `- Goals For: ${stat.goalsPerGame || 0} per game\n`;
        report += `- Goals Against: ${stat.goalsAgainstPerGame || 0} per game\n`;
        report += `- Power Play: ${stat.powerPlayPercentage || 0}%\n`;
        report += `- Penalty Kill: ${stat.penaltyKillPercentage || 0}%\n\n`;
      }
      
      if (awayStats?.stats?.[0]?.splits?.[0]?.stat) {
        const stat = awayStats.stats[0].splits[0].stat;
        report += `## ${awayTeam} Playoff Stats:\n`;
        report += `- Record: ${stat.wins || 0}-${stat.losses || 0}-${stat.ot || 0}\n`;
        report += `- Goals For: ${stat.goalsPerGame || 0} per game\n`;
        report += `- Goals Against: ${stat.goalsAgainstPerGame || 0} per game\n`;
        report += `- Power Play: ${stat.powerPlayPercentage || 0}%\n`;
        report += `- Penalty Kill: ${stat.penaltyKillPercentage || 0}%\n\n`;
      }
      
      // Get recent playoff games between these teams
      const playoffGames = await this.getPlayoffGames();
      const headToHeadGames = playoffGames.filter(game => {
        const homeId = homeStats?.team?.id;
        const awayId = awayStats?.team?.id;
        return (game.teams.home.team.id === homeId && game.teams.away.team.id === awayId) ||
               (game.teams.home.team.id === awayId && game.teams.away.team.id === homeId);
      });
      
      if (headToHeadGames.length > 0) {
        report += `## Playoff Head-to-Head (${headToHeadGames.length} games):\n`;
        headToHeadGames.slice(0, 3).forEach(game => {
          const date = new Date(game.gameDate).toLocaleDateString();
          report += `- ${date}: ${game.teams.away.team.name} ${game.teams.away.score} @ ${game.teams.home.team.name} ${game.teams.home.score}\n`;
        });
        report += '\n';
      }
      
      // Get top playoff performers
      const [homePlayerStats, awayPlayerStats] = await Promise.all([
        this.getTeamPlayoffPlayers(homeTeam),
        this.getTeamPlayoffPlayers(awayTeam)
      ]);
      
      if (homePlayerStats.length > 0) {
        report += `## ${homeTeam} Top Playoff Performers:\n`;
        homePlayerStats
          .filter(p => p.playoffStats)
          .sort((a, b) => (b.playoffStats.points || 0) - (a.playoffStats.points || 0))
          .slice(0, 3)
          .forEach(p => {
            const stats = p.playoffStats;
            report += `- ${p.player.fullName} (${p.position.abbreviation}): ${stats.goals || 0}G, ${stats.assists || 0}A, ${stats.points || 0}P in ${stats.games || 0} games\n`;
          });
        report += '\n';
      }
      
      if (awayPlayerStats.length > 0) {
        report += `## ${awayTeam} Top Playoff Performers:\n`;
        awayPlayerStats
          .filter(p => p.playoffStats)
          .sort((a, b) => (b.playoffStats.points || 0) - (a.playoffStats.points || 0))
          .slice(0, 3)
          .forEach(p => {
            const stats = p.playoffStats;
            report += `- ${p.player.fullName} (${p.position.abbreviation}): ${stats.goals || 0}G, ${stats.assists || 0}A, ${stats.points || 0}P in ${stats.games || 0} games\n`;
          });
        report += '\n';
      }
      
      return report;
    } catch (error) {
      console.error('Error generating NHL playoff report:', error);
      return `Error generating NHL playoff report: ${error.message}`;
    }
  }
};

export default nhlPlayoffService; 