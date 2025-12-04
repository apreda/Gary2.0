/**
 * NBA Player Props Service
 * Provides player statistics for NBA prop bet analysis using Ball Don't Lie API
 */
import { ballDontLieService } from './ballDontLieService.js';

// Cache for team lookups
const teamCache = new Map();

/**
 * Get current NBA season
 * NBA season spans two years (e.g., 2024-25 season)
 * For months Jan-June, we're in the second half of the previous year's season
 */
function getCurrentNBASeason() {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  const year = now.getFullYear();
  // Jan-June means we're in the second half of the season (use previous year)
  return month <= 6 ? year - 1 : year;
}

/**
 * Normalize team name for flexible matching
 * @param {string} name - Team name to normalize
 * @returns {string} - Normalized team name
 */
function normalizeTeamName(name) {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/\./g, '')
    .replace(/'/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Get mascot token from team name (last word)
 * @param {string} name - Team name
 * @returns {string} - Mascot name
 */
function getMascot(name) {
  const parts = String(name || '').trim().split(/\s+/);
  return parts[parts.length - 1].toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * Resolve team by name from cached teams list
 * @param {string} teamName - Team name to find
 * @param {Array} teams - List of NBA teams
 * @returns {Object|null} - Team object or null
 */
function resolveTeam(teamName, teams) {
  if (!teamName || !Array.isArray(teams)) return null;
  
  const normalizedTarget = normalizeTeamName(teamName);
  const targetMascot = getMascot(teamName);
  
  // Try exact full_name match first
  let match = teams.find(t => {
    const fullNorm = normalizeTeamName(t.full_name || '');
    return fullNorm === normalizedTarget;
  });
  
  if (match) return match;
  
  // Try contains match
  match = teams.find(t => {
    const fullNorm = normalizeTeamName(t.full_name || '');
    return fullNorm.includes(normalizedTarget) || normalizedTarget.includes(fullNorm);
  });
  
  if (match) return match;
  
  // Try mascot match
  match = teams.find(t => {
    const teamMascot = getMascot(t.full_name || t.name || '');
    return teamMascot && targetMascot && teamMascot === targetMascot;
  });
  
  return match || null;
}

/**
 * Format player stats into readable text for OpenAI analysis
 * @param {Array} players - Array of player objects with stats
 * @param {string} teamName - Team name for labeling
 * @returns {string} - Formatted stats text
 */
function formatPlayerStatsText(players, teamName) {
  if (!Array.isArray(players) || players.length === 0) {
    return `No player stats available for ${teamName}`;
  }
  
  let text = `\n### ${teamName} Key Players:\n`;
  
  players.forEach((player, idx) => {
    const name = player.name || player.player?.first_name + ' ' + player.player?.last_name || 'Unknown';
    const stats = player.stats || player;
    
    // Extract relevant prop stats
    const pts = stats.pts || stats.points || stats.points_per_game || 0;
    const reb = stats.reb || stats.rebounds || stats.rebounds_per_game || 0;
    const ast = stats.ast || stats.assists || stats.assists_per_game || 0;
    const fg3m = stats.fg3m || stats.three_point_field_goals_made || stats.threes || 0;
    const blk = stats.blk || stats.blocks || stats.blocks_per_game || 0;
    const stl = stats.stl || stats.steals || stats.steals_per_game || 0;
    const min = stats.min || stats.minutes || stats.minutes_per_game || 0;
    const gp = stats.games_played || stats.gp || 0;
    
    // Additional context stats
    const fgPct = stats.fg_pct || stats.field_goal_percentage || 0;
    const fg3Pct = stats.fg3_pct || stats.three_point_field_goal_percentage || 0;
    const ftPct = stats.ft_pct || stats.free_throw_percentage || 0;
    
    text += `\n${idx + 1}. **${name}**`;
    if (player.position) text += ` (${player.position})`;
    text += `\n`;
    text += `   - PPG: ${typeof pts === 'number' ? pts.toFixed(1) : pts} | RPG: ${typeof reb === 'number' ? reb.toFixed(1) : reb} | APG: ${typeof ast === 'number' ? ast.toFixed(1) : ast}\n`;
    text += `   - 3PM/G: ${typeof fg3m === 'number' ? fg3m.toFixed(1) : fg3m} | BPG: ${typeof blk === 'number' ? blk.toFixed(1) : blk} | SPG: ${typeof stl === 'number' ? stl.toFixed(1) : stl}\n`;
    text += `   - MPG: ${typeof min === 'number' ? min.toFixed(1) : min}`;
    if (gp > 0) text += ` | GP: ${gp}`;
    text += `\n`;
    
    // Add shooting percentages if available
    if (fgPct > 0 || fg3Pct > 0) {
      text += `   - FG%: ${(fgPct * 100).toFixed(1)}% | 3P%: ${(fg3Pct * 100).toFixed(1)}% | FT%: ${(ftPct * 100).toFixed(1)}%\n`;
    }
    
    // Add injury status if present
    if (player.injuryStatus) {
      text += `   - ⚠️ Injury: ${player.injuryStatus}`;
      if (player.injuryDescription) text += ` (${player.injuryDescription})`;
      text += `\n`;
    }
  });
  
  return text;
}

/**
 * Get NBA player stats formatted for prop analysis
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @returns {Promise<string>} - Formatted player stats text
 */
export async function formatNBAPlayerStats(homeTeam, awayTeam) {
  try {
    console.log(`[NBA Props] Fetching player stats for ${awayTeam} @ ${homeTeam}`);
    
    const season = getCurrentNBASeason();
    console.log(`[NBA Props] Using season: ${season}`);
    
    // Get all NBA teams
    let nbaTeams = teamCache.get('nba_teams');
    if (!nbaTeams || nbaTeams.length === 0) {
      nbaTeams = await ballDontLieService.getNbaTeams();
      if (nbaTeams && nbaTeams.length > 0) {
        teamCache.set('nba_teams', nbaTeams);
      }
    }
    
    if (!nbaTeams || nbaTeams.length === 0) {
      console.warn('[NBA Props] Could not fetch NBA teams');
      return `Unable to fetch team data for ${awayTeam} @ ${homeTeam}. Using available prop lines for analysis.`;
    }
    
    // Resolve teams
    const homeTeamObj = resolveTeam(homeTeam, nbaTeams);
    const awayTeamObj = resolveTeam(awayTeam, nbaTeams);
    
    if (!homeTeamObj) {
      console.warn(`[NBA Props] Could not resolve home team: ${homeTeam}`);
    }
    if (!awayTeamObj) {
      console.warn(`[NBA Props] Could not resolve away team: ${awayTeam}`);
    }
    
    const teamIds = [];
    if (homeTeamObj?.id) teamIds.push(homeTeamObj.id);
    if (awayTeamObj?.id) teamIds.push(awayTeamObj.id);
    
    if (teamIds.length === 0) {
      return `Could not resolve team IDs for ${awayTeam} @ ${homeTeam}. Using available prop lines for analysis.`;
    }
    
    // Get active players for both teams
    let allPlayers = [];
    try {
      allPlayers = await ballDontLieService.getPlayersActive('basketball_nba', { 
        team_ids: teamIds, 
        per_page: 100 
      }, 5);
    } catch (e) {
      console.warn(`[NBA Props] getPlayersActive failed, trying getPlayersGeneric: ${e.message}`);
      allPlayers = await ballDontLieService.getPlayersGeneric('basketball_nba', { 
        team_ids: teamIds, 
        per_page: 100 
      });
    }
    
    if (!Array.isArray(allPlayers) || allPlayers.length === 0) {
      return `No player roster data available for ${awayTeam} @ ${homeTeam}. Using prop lines for analysis.`;
    }
    
    console.log(`[NBA Props] Found ${allPlayers.length} players for both teams`);
    
    // Filter players by team
    const homePlayers = allPlayers.filter(p => {
      const teamId = p.team?.id || p.team_id;
      return teamId === homeTeamObj?.id;
    });
    const awayPlayers = allPlayers.filter(p => {
      const teamId = p.team?.id || p.team_id;
      return teamId === awayTeamObj?.id;
    });
    
    console.log(`[NBA Props] ${homeTeam}: ${homePlayers.length} players, ${awayTeam}: ${awayPlayers.length} players`);
    
    // Get player IDs for season averages
    const playerIds = allPlayers.map(p => p.id).filter(Boolean).slice(0, 100);
    
    // Fetch season averages (base stats)
    let seasonAverages = [];
    try {
      seasonAverages = await ballDontLieService.getNbaSeasonAverages({
        category: 'general',
        type: 'base',
        season,
        season_type: 'regular',
        player_ids: playerIds
      });
    } catch (e) {
      console.warn(`[NBA Props] Failed to fetch season averages: ${e.message}`);
    }
    
    console.log(`[NBA Props] Retrieved ${seasonAverages.length} season average records`);
    
    // Create a map of player ID to stats
    const statsMap = new Map();
    (seasonAverages || []).forEach(entry => {
      const pid = entry?.player?.id;
      if (pid) {
        statsMap.set(pid, entry);
      }
    });
    
    // Fetch injuries
    let injuries = [];
    try {
      injuries = await ballDontLieService.getNbaPlayerInjuries(teamIds);
    } catch (e) {
      console.warn(`[NBA Props] Failed to fetch injuries: ${e.message}`);
    }
    
    // Create injury map
    const injuryMap = new Map();
    (injuries || []).forEach(inj => {
      const pid = inj?.player?.id;
      if (pid) {
        injuryMap.set(pid, {
          status: inj.status,
          description: inj.description
        });
      }
    });
    
    // Enrich players with stats and injuries, sort by minutes
    const enrichPlayers = (players) => {
      return players
        .map(player => {
          const statsEntry = statsMap.get(player.id);
          const stats = statsEntry?.stats || {};
          const injury = injuryMap.get(player.id);
          
          const minutes = Number(stats.min || stats.minutes || stats.minutes_per_game || 0);
          
          return {
            id: player.id,
            name: `${player.first_name || ''} ${player.last_name || ''}`.trim(),
            position: player.position || '',
            stats: {
              pts: stats.pts || stats.points || 0,
              reb: stats.reb || stats.rebounds || 0,
              ast: stats.ast || stats.assists || 0,
              fg3m: stats.fg3m || stats.three_point_field_goals_made || 0,
              blk: stats.blk || stats.blocks || 0,
              stl: stats.stl || stats.steals || 0,
              min: minutes,
              gp: stats.games_played || stats.gp || 0,
              fg_pct: stats.fg_pct || stats.field_goal_percentage || 0,
              fg3_pct: stats.fg3_pct || stats.three_point_field_goal_percentage || 0,
              ft_pct: stats.ft_pct || stats.free_throw_percentage || 0
            },
            minutes,
            injuryStatus: injury?.status || null,
            injuryDescription: injury?.description || null
          };
        })
        .filter(p => p.minutes > 0) // Only include players with meaningful minutes
        .sort((a, b) => b.minutes - a.minutes) // Sort by minutes played
        .slice(0, 10); // Top 10 players per team
    };
    
    const enrichedHomePlayers = enrichPlayers(homePlayers);
    const enrichedAwayPlayers = enrichPlayers(awayPlayers);
    
    // Build the formatted output
    let output = `# NBA Player Stats for Prop Analysis\n`;
    output += `## Matchup: ${awayTeam} @ ${homeTeam}\n`;
    output += `## Season: ${season}-${season + 1}\n\n`;
    
    // Add away team stats
    output += formatPlayerStatsText(enrichedAwayPlayers, awayTeam);
    output += '\n';
    
    // Add home team stats
    output += formatPlayerStatsText(enrichedHomePlayers, homeTeam);
    output += '\n';
    
    // Add prop-relevant summary
    output += `\n### Key Prop Market Stats Summary:\n`;
    output += `- **Points**: Focus on players with consistent PPG and high usage\n`;
    output += `- **Rebounds**: Centers and power forwards typically lead\n`;
    output += `- **Assists**: Point guards and playmakers\n`;
    output += `- **3-Pointers**: Check 3PM per game and 3P%\n`;
    output += `- **Blocks/Steals**: Defensive specialists\n`;
    
    // Add injury note if any
    const injuredPlayers = [...enrichedHomePlayers, ...enrichedAwayPlayers].filter(p => p.injuryStatus);
    if (injuredPlayers.length > 0) {
      output += `\n### ⚠️ Injury Report:\n`;
      injuredPlayers.forEach(p => {
        output += `- ${p.name}: ${p.injuryStatus}`;
        if (p.injuryDescription) output += ` (${p.injuryDescription})`;
        output += `\n`;
      });
    }
    
    console.log(`[NBA Props] Generated stats report (${output.length} characters)`);
    return output;
    
  } catch (error) {
    console.error('[NBA Props] Error fetching player stats:', error.message);
    return `Error fetching NBA player stats for ${awayTeam} @ ${homeTeam}. Using available prop lines for analysis.`;
  }
}

/**
 * Get NBA player stats as structured data (for advanced processing)
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @returns {Promise<Object>} - Structured player stats object
 */
export async function getNBAPlayerStatsStructured(homeTeam, awayTeam) {
  try {
    console.log(`[NBA Props] Fetching structured stats for ${awayTeam} @ ${homeTeam}`);
    
    const season = getCurrentNBASeason();
    
    // Get all NBA teams
    let nbaTeams = teamCache.get('nba_teams');
    if (!nbaTeams || nbaTeams.length === 0) {
      nbaTeams = await ballDontLieService.getNbaTeams();
      if (nbaTeams && nbaTeams.length > 0) {
        teamCache.set('nba_teams', nbaTeams);
      }
    }
    
    if (!nbaTeams || nbaTeams.length === 0) {
      return { error: 'Could not fetch NBA teams', homePlayers: [], awayPlayers: [] };
    }
    
    const homeTeamObj = resolveTeam(homeTeam, nbaTeams);
    const awayTeamObj = resolveTeam(awayTeam, nbaTeams);
    
    const teamIds = [];
    if (homeTeamObj?.id) teamIds.push(homeTeamObj.id);
    if (awayTeamObj?.id) teamIds.push(awayTeamObj.id);
    
    if (teamIds.length === 0) {
      return { error: 'Could not resolve team IDs', homePlayers: [], awayPlayers: [] };
    }
    
    // Get active players
    let allPlayers = [];
    try {
      allPlayers = await ballDontLieService.getPlayersActive('basketball_nba', { 
        team_ids: teamIds, 
        per_page: 100 
      }, 5);
    } catch (e) {
      allPlayers = await ballDontLieService.getPlayersGeneric('basketball_nba', { 
        team_ids: teamIds, 
        per_page: 100 
      });
    }
    
    // Filter by team
    const homePlayers = allPlayers.filter(p => (p.team?.id || p.team_id) === homeTeamObj?.id);
    const awayPlayers = allPlayers.filter(p => (p.team?.id || p.team_id) === awayTeamObj?.id);
    
    // Get player IDs
    const playerIds = allPlayers.map(p => p.id).filter(Boolean).slice(0, 100);
    
    // Fetch season averages
    let seasonAverages = [];
    try {
      seasonAverages = await ballDontLieService.getNbaSeasonAverages({
        category: 'general',
        type: 'base',
        season,
        season_type: 'regular',
        player_ids: playerIds
      });
    } catch (e) {
      console.warn(`[NBA Props] Season averages fetch failed: ${e.message}`);
    }
    
    // Create stats map
    const statsMap = new Map();
    (seasonAverages || []).forEach(entry => {
      const pid = entry?.player?.id;
      if (pid) statsMap.set(pid, entry);
    });
    
    // Enrich players
    const enrichPlayer = (player) => {
      const statsEntry = statsMap.get(player.id);
      const stats = statsEntry?.stats || {};
      return {
        id: player.id,
        name: `${player.first_name || ''} ${player.last_name || ''}`.trim(),
        position: player.position || '',
        team: player.team?.full_name || '',
        stats: {
          pts: stats.pts || 0,
          reb: stats.reb || 0,
          ast: stats.ast || 0,
          fg3m: stats.fg3m || 0,
          blk: stats.blk || 0,
          stl: stats.stl || 0,
          min: stats.min || 0,
          gp: stats.games_played || 0
        }
      };
    };
    
    return {
      season,
      homeTeam: homeTeamObj?.full_name || homeTeam,
      awayTeam: awayTeamObj?.full_name || awayTeam,
      homePlayers: homePlayers.map(enrichPlayer).filter(p => p.stats.min > 0),
      awayPlayers: awayPlayers.map(enrichPlayer).filter(p => p.stats.min > 0)
    };
    
  } catch (error) {
    console.error('[NBA Props] Error getting structured stats:', error.message);
    return { error: error.message, homePlayers: [], awayPlayers: [] };
  }
}

export const nbaPlayerPropsService = {
  formatNBAPlayerStats,
  getNBAPlayerStatsStructured,
  getCurrentNBASeason
};

