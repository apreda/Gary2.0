/**
 * Prop Utils - Utility functions for player prop betting
 * Aggregates formatting and utility functions for all sports
 */
import { mlbStatsApiService } from './mlbStatsApiService.enhanced.js';
import { formatNBAPlayerStats } from './nbaPlayerPropsService.js';
import { debugUtils } from '../utils/debugUtils.js';

export const propUtils = {
  /**
   * Format MLB player stats for prop analysis
   * @param {string} homeTeam - Home team name
   * @param {string} awayTeam - Away team name
   * @returns {Promise<string>} - Formatted stats text
   */
  formatMLBPlayerStats: async (homeTeam, awayTeam) => {
    try {
      console.log(`[MLB Props] Fetching stats for ${awayTeam} @ ${homeTeam}`);
      
      // Get today's game data
      const todayGames = await mlbStatsApiService.getTodayGames();
      
      // Find the matching game
      const normalizeTeam = (name) => name.toLowerCase().replace(/[^a-z]/g, '');
      const homeNorm = normalizeTeam(homeTeam);
      const awayNorm = normalizeTeam(awayTeam);
      
      const game = todayGames.find(g => {
        const gHomeNorm = normalizeTeam(g.teams?.home?.team?.name || '');
        const gAwayNorm = normalizeTeam(g.teams?.away?.team?.name || '');
        return (gHomeNorm.includes(homeNorm) || homeNorm.includes(gHomeNorm)) &&
               (gAwayNorm.includes(awayNorm) || awayNorm.includes(gAwayNorm));
      });
      
      if (!game) {
        console.warn(`[MLB Props] No game found for ${awayTeam} @ ${homeTeam}`);
        return `No game data available for ${awayTeam} @ ${homeTeam}. Using prop lines for analysis.`;
      }
      
      let output = `# MLB Player Stats for Prop Analysis\n`;
      output += `## Matchup: ${awayTeam} @ ${homeTeam}\n\n`;
      
      // Get starting pitchers
      const homePitcher = game.teams?.home?.probablePitcher;
      const awayPitcher = game.teams?.away?.probablePitcher;
      
      if (homePitcher || awayPitcher) {
        output += `### Starting Pitchers:\n`;
        
        if (awayPitcher) {
          const stats = await mlbStatsApiService.getPitcherSeasonStats(awayPitcher.id);
          output += `**${awayPitcher.fullName}** (${awayTeam})\n`;
          output += `- Record: ${stats.wins || 0}-${stats.losses || 0} | ERA: ${stats.era || 'N/A'} | IP: ${stats.inningsPitched || 'N/A'}\n`;
          output += `- K: ${stats.strikeouts || 0} | WHIP: ${stats.whip || 'N/A'}\n\n`;
        }
        
        if (homePitcher) {
          const stats = await mlbStatsApiService.getPitcherSeasonStats(homePitcher.id);
          output += `**${homePitcher.fullName}** (${homeTeam})\n`;
          output += `- Record: ${stats.wins || 0}-${stats.losses || 0} | ERA: ${stats.era || 'N/A'} | IP: ${stats.inningsPitched || 'N/A'}\n`;
          output += `- K: ${stats.strikeouts || 0} | WHIP: ${stats.whip || 'N/A'}\n\n`;
        }
      }
      
      // Get batter stats for both teams
      output += `### Key Batters:\n`;
      output += `(Season batting statistics)\n\n`;
      
      // Note: In a full implementation, we'd fetch lineup data and individual batter stats
      // For now, this provides the structure for the analysis
      
      return output;
      
    } catch (error) {
      console.error('[MLB Props] Error formatting stats:', error.message);
      return `Error fetching MLB stats for ${awayTeam} @ ${homeTeam}. Using prop lines for analysis.`;
    }
  },

  /**
   * Format NBA player stats for prop analysis
   * @param {string} homeTeam - Home team name
   * @param {string} awayTeam - Away team name
   * @returns {Promise<string>} - Formatted stats text
   */
  formatNBAPlayerStats: formatNBAPlayerStats,

  /**
   * Format game time in a readable format
   * @param {string} timeString - ISO timestamp or time string
   * @returns {string} - Formatted time string
   */
  formatGameTime: (timeString) => {
    if (!timeString) return '7:00 PM EST';
    
    try {
      // Check if it's already in the desired format
      if (/^\d{1,2}:\d{2} [AP]M EST$/.test(timeString)) {
        return timeString;
      }
      
      // Parse the ISO timestamp
      const date = new Date(timeString);
      if (isNaN(date.getTime())) {
        return '7:00 PM EST'; // Default fallback
      }
      
      // Format as '7:00 PM EST'
      const options = { 
        hour: 'numeric', 
        minute: '2-digit', 
        hour12: true, 
        timeZone: 'America/New_York' 
      };
      const timeFormatted = new Intl.DateTimeFormat('en-US', options).format(date);
      return `${timeFormatted} EST`;
    } catch (error) {
      console.error('Error formatting game time:', error);
      return '7:00 PM EST'; // Default fallback
    }
  },

  /**
   * Create a sport-aware prompt for prop picks
   * @param {string} props - Formatted prop lines
   * @param {string} playerStats - Formatted player statistics
   * @param {string} sport - Sport key
   * @returns {string} - OpenAI prompt
   */
  createPropPicksPrompt: (props, playerStats, sport = 'baseball_mlb') => {
    let sportGuidance = '';
    
    if (sport === 'basketball_nba') {
      sportGuidance = `Focus on: Points, Rebounds, Assists, 3-Pointers Made, Blocks, Steals.
Consider minutes played, pace of play, and recent form.`;
    } else if (sport === 'americanfootball_nfl') {
      sportGuidance = `Focus on: Passing Yards, Passing TDs, Rush Yards, Receiving Yards, Receptions, Anytime TD.
Consider game script projections and defensive matchups.`;
    } else {
      sportGuidance = `Focus on: Hits, Home Runs, Total Bases, Strikeouts, RBIs, Runs.
Consider pitcher matchups and park factors.`;
    }

    return `You are Gary, an expert sports analyst specialized in player prop betting.

${sportGuidance}

Props: ${props}

Stats: ${playerStats}

Analyze and return your TOP 5 value bets as a JSON array with: player, team, prop, line, bet (over/under), odds, confidence (0-1), rationale.
`;
  },

  /**
   * Parse OpenAI response for prop picks
   * @param {string} response - OpenAI response text
   * @returns {Array} - Parsed prop picks
   */
  parseOpenAIResponse: (response) => {
    try {
      // First, try direct JSON parsing
      let parsed = null;
      
      try {
        parsed = JSON.parse(response);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch (jsonError) {
        // Not direct JSON, try to extract JSON array
        const jsonMatch = response.match(/\[\s*\{[\s\S]*?\}\s*\]/);
        if (jsonMatch && jsonMatch[0]) {
          parsed = JSON.parse(jsonMatch[0]);
          return Array.isArray(parsed) ? parsed : [];
        }
      }
      
      return [];
    } catch (error) {
      console.error('Error parsing OpenAI response:', error);
      return [];
    }
  }
};
