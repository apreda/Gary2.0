/**
 * NFL Player Props Service
 * Provides player statistics for NFL prop bet analysis using Ball Don't Lie API
 */
import axios from 'axios';

// BDL NFL API base URL
const BDL_NFL_BASE = 'https://api.balldontlie.io/nfl/v1';

// Cache for team lookups
const teamCache = new Map();
const playerCache = new Map();

/**
 * Get BDL API key from environment
 */
function getApiKey() {
  // Check multiple possible env var names
  if (typeof process !== 'undefined' && process.env) {
    return process.env.BALLDONTLIE_API_KEY || 
           process.env.VITE_BALLDONTLIE_API_KEY || 
           process.env.NEXT_PUBLIC_BALLDONTLIE_API_KEY;
  }
  // For browser/Vite
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env.VITE_BALLDONTLIE_API_KEY;
  }
  return null;
}

/**
 * Make authenticated request to BDL NFL API
 */
async function bdlRequest(endpoint, params = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Ball Don\'t Lie API key not configured');
  }
  
  const url = `${BDL_NFL_BASE}${endpoint}`;
  const response = await axios.get(url, {
    headers: { 'Authorization': apiKey },
    params,
    timeout: 15000
  });
  
  return response.data;
}

/**
 * Get current NFL season
 * NFL season runs Aug-Feb, so Jan-July uses previous year
 */
function getCurrentNFLSeason() {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  const year = now.getFullYear();
  // Jan-July means we're in previous season
  return month <= 7 ? year - 1 : year;
}

/**
 * Normalize team name for flexible matching
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
 */
function getMascot(name) {
  const parts = String(name || '').trim().split(/\s+/);
  return parts[parts.length - 1].toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * Resolve team by name from teams list
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
 * Fetch all NFL teams
 */
async function getNFLTeams() {
  if (teamCache.has('nfl_teams')) {
    return teamCache.get('nfl_teams');
  }
  
  try {
    const response = await bdlRequest('/teams');
    const teams = response.data || [];
    teamCache.set('nfl_teams', teams);
    return teams;
  } catch (error) {
    console.error('[NFL Props] Error fetching teams:', error.message);
    return [];
  }
}

/**
 * Fetch active players for given team IDs
 */
async function getActivePlayers(teamIds) {
  const cacheKey = `players_${teamIds.join('_')}`;
  if (playerCache.has(cacheKey)) {
    return playerCache.get(cacheKey);
  }
  
  try {
    const params = { per_page: 100 };
    if (teamIds.length > 0) {
      // BDL uses team_ids[] format
      teamIds.forEach((id, idx) => {
        params[`team_ids[${idx}]`] = id;
      });
    }
    
    const response = await bdlRequest('/players/active', params);
    const players = response.data || [];
    playerCache.set(cacheKey, players);
    return players;
  } catch (error) {
    console.error('[NFL Props] Error fetching active players:', error.message);
    return [];
  }
}

/**
 * Fetch season stats for players
 */
async function getSeasonStats(season, options = {}) {
  try {
    const params = { 
      season,
      per_page: 100,
      ...options
    };
    
    const response = await bdlRequest('/season_stats', params);
    return response.data || [];
  } catch (error) {
    console.error('[NFL Props] Error fetching season stats:', error.message);
    return [];
  }
}

/**
 * Fetch player injuries
 */
async function getPlayerInjuries(teamIds = []) {
  try {
    const params = { per_page: 100 };
    teamIds.forEach((id, idx) => {
      params[`team_ids[${idx}]`] = id;
    });
    
    const response = await bdlRequest('/player_injuries', params);
    return response.data || [];
  } catch (error) {
    console.error('[NFL Props] Error fetching injuries:', error.message);
    return [];
  }
}

/**
 * Format QB stats for display
 */
function formatQBStats(stats) {
  const passYds = stats.passing_yards_per_game || stats.passing_yards || 0;
  const passTDs = stats.passing_touchdowns || 0;
  const ints = stats.passing_interceptions || 0;
  const compPct = stats.passing_completion_pct || 0;
  const qbr = stats.qbr || 0;
  const rushYds = stats.rushing_yards_per_game || stats.rushing_yards || 0;
  const rushTDs = stats.rushing_touchdowns || 0;
  const gp = stats.games_played || 0;
  
  let text = `   - Pass: ${typeof passYds === 'number' ? passYds.toFixed(1) : passYds} yds/g | ${passTDs} TDs | ${ints} INTs`;
  if (compPct > 0) text += ` | ${compPct.toFixed(1)}% comp`;
  text += `\n`;
  if (rushYds > 5) {
    text += `   - Rush: ${typeof rushYds === 'number' ? rushYds.toFixed(1) : rushYds} yds/g | ${rushTDs} TDs\n`;
  }
  if (gp > 0) text += `   - Games: ${gp}\n`;
  
  return text;
}

/**
 * Format RB stats for display
 */
function formatRBStats(stats) {
  const rushYds = stats.rushing_yards_per_game || stats.rushing_yards || 0;
  const rushTDs = stats.rushing_touchdowns || 0;
  const rushAtt = stats.rushing_attempts || 0;
  const ypc = stats.yards_per_rush_attempt || 0;
  const recYds = stats.receiving_yards_per_game || stats.receiving_yards || 0;
  const receptions = stats.receptions || 0;
  const recTDs = stats.receiving_touchdowns || 0;
  const gp = stats.games_played || 0;
  
  let text = `   - Rush: ${typeof rushYds === 'number' ? rushYds.toFixed(1) : rushYds} yds/g | ${rushTDs} TDs`;
  if (ypc > 0) text += ` | ${ypc.toFixed(1)} ypc`;
  text += `\n`;
  if (receptions > 0 || recYds > 0) {
    text += `   - Rec: ${receptions} catches | ${typeof recYds === 'number' ? recYds.toFixed(1) : recYds} yds | ${recTDs} TDs\n`;
  }
  if (gp > 0) text += `   - Games: ${gp}\n`;
  
  return text;
}

/**
 * Format WR/TE stats for display
 */
function formatReceiverStats(stats) {
  const recYds = stats.receiving_yards_per_game || stats.receiving_yards || 0;
  const receptions = stats.receptions || 0;
  const targets = stats.receiving_targets || 0;
  const recTDs = stats.receiving_touchdowns || 0;
  const ypr = stats.yards_per_reception || 0;
  const gp = stats.games_played || 0;
  
  let text = `   - Rec: ${receptions} catches`;
  if (targets > 0) text += ` (${targets} tgt)`;
  text += ` | ${typeof recYds === 'number' ? recYds.toFixed(1) : recYds} yds/g | ${recTDs} TDs`;
  if (ypr > 0) text += ` | ${ypr.toFixed(1)} ypr`;
  text += `\n`;
  if (gp > 0) text += `   - Games: ${gp}\n`;
  
  return text;
}

/**
 * Format player stats based on position
 */
function formatPlayerStats(player, stats) {
  const pos = (player.position_abbreviation || player.position || '').toUpperCase();
  
  if (pos === 'QB') {
    return formatQBStats(stats);
  } else if (pos === 'RB') {
    return formatRBStats(stats);
  } else if (['WR', 'TE'].includes(pos)) {
    return formatReceiverStats(stats);
  }
  
  // Generic format for other positions
  return `   - Stats available in database\n`;
}

/**
 * Format all players for a team into readable text
 */
function formatTeamPlayersText(players, teamName, statsMap, injuryMap) {
  if (!Array.isArray(players) || players.length === 0) {
    return `No player stats available for ${teamName}\n`;
  }
  
  let text = `\n### ${teamName}:\n`;
  
  // Group by position
  const qbs = players.filter(p => (p.position_abbreviation || '').toUpperCase() === 'QB');
  const rbs = players.filter(p => (p.position_abbreviation || '').toUpperCase() === 'RB');
  const wrs = players.filter(p => (p.position_abbreviation || '').toUpperCase() === 'WR');
  const tes = players.filter(p => (p.position_abbreviation || '').toUpperCase() === 'TE');
  
  // Format each position group
  const formatGroup = (group, label) => {
    if (group.length === 0) return '';
    
    let groupText = `\n**${label}:**\n`;
    group.forEach(player => {
      const name = `${player.first_name || ''} ${player.last_name || ''}`.trim();
      const stats = statsMap.get(player.id) || {};
      const injury = injuryMap.get(player.id);
      
      groupText += `${name}`;
      if (player.jersey_number) groupText += ` #${player.jersey_number}`;
      groupText += `\n`;
      groupText += formatPlayerStats(player, stats);
      
      if (injury) {
        groupText += `   - ⚠️ ${injury.status}`;
        if (injury.comment) {
          // Truncate long injury comments
          const shortComment = injury.comment.length > 80 
            ? injury.comment.substring(0, 80) + '...' 
            : injury.comment;
          groupText += `: ${shortComment}`;
        }
        groupText += `\n`;
      }
    });
    return groupText;
  };
  
  text += formatGroup(qbs, 'Quarterbacks');
  text += formatGroup(rbs, 'Running Backs');
  text += formatGroup(wrs, 'Wide Receivers');
  text += formatGroup(tes, 'Tight Ends');
  
  return text;
}

/**
 * Get NFL player stats formatted for prop analysis
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @returns {Promise<string>} - Formatted player stats text
 */
export async function formatNFLPlayerStats(homeTeam, awayTeam) {
  try {
    console.log(`[NFL Props] Fetching player stats for ${awayTeam} @ ${homeTeam}`);
    
    const season = getCurrentNFLSeason();
    console.log(`[NFL Props] Using season: ${season}`);
    
    // Get all NFL teams
    const nflTeams = await getNFLTeams();
    
    if (!nflTeams || nflTeams.length === 0) {
      console.warn('[NFL Props] Could not fetch NFL teams');
      return `Unable to fetch team data for ${awayTeam} @ ${homeTeam}. Using available prop lines for analysis.`;
    }
    
    // Resolve teams
    const homeTeamObj = resolveTeam(homeTeam, nflTeams);
    const awayTeamObj = resolveTeam(awayTeam, nflTeams);
    
    if (!homeTeamObj) {
      console.warn(`[NFL Props] Could not resolve home team: ${homeTeam}`);
    }
    if (!awayTeamObj) {
      console.warn(`[NFL Props] Could not resolve away team: ${awayTeam}`);
    }
    
    const teamIds = [];
    if (homeTeamObj?.id) teamIds.push(homeTeamObj.id);
    if (awayTeamObj?.id) teamIds.push(awayTeamObj.id);
    
    if (teamIds.length === 0) {
      return `Could not resolve team IDs for ${awayTeam} @ ${homeTeam}. Using available prop lines for analysis.`;
    }
    
    console.log(`[NFL Props] Team IDs: ${teamIds.join(', ')}`);
    
    // Fetch active players for both teams
    const allPlayers = await getActivePlayers(teamIds);
    
    if (!Array.isArray(allPlayers) || allPlayers.length === 0) {
      return `No player roster data available for ${awayTeam} @ ${homeTeam}. Using prop lines for analysis.`;
    }
    
    console.log(`[NFL Props] Found ${allPlayers.length} active players`);
    
    // Filter players by team
    const homePlayers = allPlayers.filter(p => p.team?.id === homeTeamObj?.id);
    const awayPlayers = allPlayers.filter(p => p.team?.id === awayTeamObj?.id);
    
    console.log(`[NFL Props] ${homeTeam}: ${homePlayers.length} players, ${awayTeam}: ${awayPlayers.length} players`);
    
    // Get player IDs for season stats
    const playerIds = allPlayers.map(p => p.id).filter(Boolean);
    
    // Fetch season stats for each team
    const statsMap = new Map();
    
    for (const teamId of teamIds) {
      try {
        const teamStats = await getSeasonStats(season, { team_id: teamId });
        teamStats.forEach(entry => {
          if (entry.player?.id) {
            statsMap.set(entry.player.id, entry);
          }
        });
      } catch (e) {
        console.warn(`[NFL Props] Failed to fetch stats for team ${teamId}: ${e.message}`);
      }
    }
    
    console.log(`[NFL Props] Retrieved ${statsMap.size} season stat records`);
    
    // Fetch injuries
    let injuries = [];
    try {
      injuries = await getPlayerInjuries(teamIds);
      console.log(`[NFL Props] Found ${injuries.length} injury reports`);
    } catch (e) {
      console.warn(`[NFL Props] Failed to fetch injuries: ${e.message}`);
    }
    
    // Create injury map
    const injuryMap = new Map();
    injuries.forEach(inj => {
      if (inj.player?.id) {
        injuryMap.set(inj.player.id, {
          status: inj.status,
          comment: inj.comment
        });
      }
    });
    
    // Build the formatted text
    let output = `## NFL Player Stats for ${awayTeam} @ ${homeTeam}\n`;
    output += `Season: ${season} | Week ${getCurrentNFLWeek()}\n`;
    
    output += formatTeamPlayersText(awayPlayers, awayTeam, statsMap, injuryMap);
    output += formatTeamPlayersText(homePlayers, homeTeam, statsMap, injuryMap);
    
    console.log(`[NFL Props] Generated stats report (${output.length} characters)`);
    
    return output;
  } catch (error) {
    console.error('[NFL Props] Error formatting player stats:', error);
    return `Error fetching NFL player stats for ${awayTeam} @ ${homeTeam}. Using prop lines for analysis.`;
  }
}

/**
 * Get current NFL week (approximate)
 */
function getCurrentNFLWeek() {
  const now = new Date();
  const season = getCurrentNFLSeason();
  
  // NFL season typically starts first Thursday of September
  const seasonStart = new Date(season, 8, 1); // Sept 1
  // Find first Thursday
  while (seasonStart.getDay() !== 4) {
    seasonStart.setDate(seasonStart.getDate() + 1);
  }
  
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weeksSinceStart = Math.floor((now - seasonStart) / msPerWeek) + 1;
  
  // Cap at 18 (regular season) or 22 (including playoffs)
  return Math.min(Math.max(1, weeksSinceStart), 22);
}

export default {
  formatNFLPlayerStats,
  getNFLTeams,
  getActivePlayers,
  getSeasonStats,
  getPlayerInjuries,
  getCurrentNFLSeason,
  getCurrentNFLWeek
};

