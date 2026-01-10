/**
 * Stat Router
 * 
 * Maps stat tokens to actual Ball Don't Lie API calls.
 * Uses BDL Season Averages (Advanced) for NBA efficiency stats.
 * Uses Gemini Grounding for live context (QB weather history, etc.)
 */

import { ballDontLieService } from '../../ballDontLieService.js';
import { geminiGroundingSearch, getGroundedWeather } from '../scoutReport/scoutReportBuilder.js';
import { isGameCompleted, formatStatValue, safeStatValue } from '../sharedUtils.js';

/**
 * Generate dynamic season string for Gemini Grounding queries
 * Returns format like "2025-26" for academic year sports (college, NBA, NHL)
 * @returns {string} - Season string like "2025-26"
 */
function getCurrentSeasonString() {
  const month = new Date().getMonth() + 1; // 1-indexed
  const year = new Date().getFullYear();
  // Academic year: Aug-Dec = year-(year+1), Jan-Jul = (year-1)-year
  const startYear = month >= 8 ? year : year - 1;
  const endYear = startYear + 1;
  return `${startYear}-${String(endYear).slice(-2)}`;
}

// BDL API key for direct calls
const BDL_API_KEY = process.env.BALLDONTLIE_API_KEY;

/**
 * Main router function - fetches stats based on token
 */
// Tokens that use Gemini Grounding for data (not BDL)
const GROUNDING_ONLY_TOKENS = [
  // These tokens rely on Gemini Grounding in Scout Report
];

// Tokens that should return N/A immediately (deprecated)
// Gemini Grounding in Scout Report provides this context instead
const DEPRECATED_TOKENS = [
  // NCAAF tokens - use Gemini Grounding instead
  'NCAAF_SP_PLUS', 'NCAAF_FPI', 'NCAAF_EPA_ADVANCED', 'NCAAF_HAVOC_RATE',
  'NCAAF_EXPLOSIVENESS', 'NCAAF_RUSHING_EFFICIENCY', 'NCAAF_PASSING_EFFICIENCY',
  'NCAAF_RED_ZONE', 'NCAAF_STRENGTH_OF_SCHEDULE', 'NCAAF_CONFERENCE_STRENGTH',
  'NCAAF_VS_POWER_OPPONENTS', 'NCAAF_TRAVEL_FATIGUE', 'NCAAF_OPPONENT_ADJUSTED'
];

export async function fetchStats(sport, token, homeTeam, awayTeam, options = {}) {
  const bdlSport = sportToBdlKey(sport);
  // Calculate current season dynamically based on sport
  const currentMonth = new Date().getMonth() + 1; // 1-indexed
  const currentYear = new Date().getFullYear();
  
  // Sport-specific season logic:
  // NBA/NHL: Season starts October (month 10) - Oct-Dec=currentYear, Jan-Sep=previousYear
  // NFL/NCAAF: Season starts August (month 8) - Aug-Dec=currentYear, Jan-Jul=previousYear
  // MLB: Season April-Oct - if month 1-3, use previousYear
  let defaultSeason;
  const normalizedSportForSeason = (sport || '').toLowerCase();
  if (normalizedSportForSeason.includes('nba') || normalizedSportForSeason.includes('nhl') || normalizedSportForSeason.includes('ncaab')) {
    defaultSeason = currentMonth >= 10 ? currentYear : currentYear - 1;
  } else if (normalizedSportForSeason.includes('nfl') || normalizedSportForSeason.includes('ncaaf')) {
    defaultSeason = currentMonth <= 7 ? currentYear - 1 : currentYear;
  } else if (normalizedSportForSeason.includes('mlb')) {
    defaultSeason = currentMonth <= 3 ? currentYear - 1 : currentYear;
  } else {
    // Default fallback for other sports (EPL, etc.) - calendar year
    defaultSeason = currentMonth >= 10 ? currentYear : currentYear - 1;
  }
  const season = options.season || defaultSeason;
  const normalizedSport = normalizeSportName(sport);
  
  console.log(`[Stat Router] Fetching ${token} for ${awayTeam} @ ${homeTeam} (${sport})`);
  
  // Check for deprecated tokens - return N/A immediately
  // Gemini Grounding in Scout Report provides this context instead
  const sportSpecificToken = `${normalizedSport}_${token}`;
  if (DEPRECATED_TOKENS.includes(token) || DEPRECATED_TOKENS.includes(sportSpecificToken)) {
    console.log(`[Stat Router] Skipping ${token} - deprecated token, using Gemini Grounding context instead`);
    return { 
      token, 
      sport, 
      homeValue: 'N/A (use Gemini Grounding context)', 
      awayValue: 'N/A (use Gemini Grounding context)',
      note: 'Advanced analytics provided via Gemini Grounding in Scout Report'
    };
  }
  
  try {
    // Check for sport-specific fetcher first (e.g., EPL_TOP_SCORERS for EPL)
    let fetcher = null;
    if (FETCHERS[sportSpecificToken]) {
      fetcher = FETCHERS[sportSpecificToken];
      console.log(`[Stat Router] Using sport-specific fetcher: ${sportSpecificToken}`);
    } else {
      fetcher = FETCHERS[token];
    }
    
    if (!fetcher) {
      return { error: `Unknown stat token: ${token}`, token };
    }
    
    // Check if this is a Grounding-only token (no BDL team lookup needed)
    const isGroundingOnly = GROUNDING_ONLY_TOKENS.includes(token) || 
                           GROUNDING_ONLY_TOKENS.includes(sportSpecificToken);
    
    if (isGroundingOnly) {
      console.log(`[Stat Router] Using Grounding-only fetcher (no BDL lookup): ${token}`);
      // Create mock team objects with just the names
      const home = { full_name: homeTeam, name: homeTeam };
      const away = { full_name: awayTeam, name: awayTeam };
      const result = await fetcher(bdlSport, home, away, season, options);
      return { token, sport, ...result };
    }
    
    // Standard flow: Get team IDs from BDL first
    const teams = await ballDontLieService.getTeams(bdlSport);
    const home = findTeam(teams, homeTeam);
    const away = findTeam(teams, awayTeam);
    
    if (!home || !away) {
      return { error: `Could not find teams: ${homeTeam} or ${awayTeam}`, token };
    }
    
    const result = await fetcher(bdlSport, home, away, season, options);
    return { token, sport, ...result };
    
  } catch (error) {
    console.error(`[Stat Router] Error fetching ${token}:`, error.message);
    return { error: error.message, token };
  }
}

/**
 * Convert sport to BDL API key
 */
function sportToBdlKey(sport) {
  const mapping = {
    'NBA': 'basketball_nba',
    'NFL': 'americanfootball_nfl',
    'NCAAB': 'basketball_ncaab',
    'NCAAF': 'americanfootball_ncaaf',
    'NHL': 'icehockey_nhl',
    'EPL': 'soccer_epl'
  };
  return mapping[sport] || sport;
}

/**
 * Normalize sport name for display
 */
function normalizeSportName(sport) {
  const mapping = {
    'basketball_nba': 'NBA',
    'americanfootball_nfl': 'NFL',
    'basketball_ncaab': 'NCAAB',
    'americanfootball_ncaaf': 'NCAAF',
    'icehockey_nhl': 'NHL',
    'soccer_epl': 'EPL',
    'NBA': 'NBA',
    'NFL': 'NFL',
    'NCAAB': 'NCAAB',
    'NCAAF': 'NCAAF',
    'NHL': 'NHL',
    'EPL': 'EPL'
  };
  return mapping[sport] || sport;
}

/**
 * Fetch NBA team advanced stats via BDL Season Averages endpoint
 * Returns aggregated team stats from their top players
 */
async function fetchNBATeamAdvancedStats(teamId, season = null) {
  // Calculate dynamic default season: NBA starts in October
  if (!season) {
    const month = new Date().getMonth() + 1;
    const year = new Date().getFullYear();
    // Oct(10)-Dec = currentYear, Jan-Sep = previousYear
    season = month >= 10 ? year : year - 1;
  }
  
  try {
    // Get active players for team
    const playersUrl = `https://api.balldontlie.io/v1/players/active?team_ids[]=${teamId}&per_page=15`;
    const playersResp = await fetch(playersUrl, { headers: { Authorization: BDL_API_KEY } });
    
    if (!playersResp.ok) {
      console.warn(`[Stat Router] Failed to fetch players for team ${teamId}: ${playersResp.status}`);
      return null;
    }
    
    const playersJson = await playersResp.json();
    const players = playersJson.data || [];
    
    if (players.length === 0) {
      console.warn(`[Stat Router] No active players found for team ${teamId}`);
      return null;
    }
    
    // Get season averages (advanced) for top players
    const topPlayerIds = players.slice(0, 10).map(p => p.id);
    const playerIdParams = topPlayerIds.map(id => `player_ids[]=${id}`).join('&');
    
    // Try advanced stats first, fall back to base stats if it fails
    let playerStats = [];
    
    // Attempt 1: Advanced stats
    try {
      const advancedUrl = `https://api.balldontlie.io/v1/season_averages/general?season=${season}&season_type=regular&type=advanced&${playerIdParams}`;
      const advResp = await fetch(advancedUrl, { headers: { Authorization: BDL_API_KEY } });
      
      if (advResp.ok) {
        const advJson = await advResp.json();
        playerStats = advJson.data || [];
      } else {
        console.warn(`[Stat Router] Advanced stats returned ${advResp.status}, trying base stats...`);
      }
    } catch (advErr) {
      console.warn(`[Stat Router] Advanced stats failed: ${advErr.message}, trying base stats...`);
    }
    
    // Attempt 2: Base stats fallback
    if (playerStats.length === 0) {
      try {
        const baseUrl = `https://api.balldontlie.io/v1/season_averages/general?season=${season}&season_type=regular&type=base&${playerIdParams}`;
        const baseResp = await fetch(baseUrl, { headers: { Authorization: BDL_API_KEY } });
        
        if (baseResp.ok) {
          const baseJson = await baseResp.json();
          playerStats = baseJson.data || [];
          console.log(`[Stat Router] Using base stats fallback for team ${teamId}`);
        }
      } catch (baseErr) {
        console.warn(`[Stat Router] Base stats also failed: ${baseErr.message}`);
      }
    }
    
    if (playerStats.length === 0) {
      console.warn(`[Stat Router] No season averages found for team ${teamId}`);
      return null;
    }
    
    // Aggregate team stats (weighted by minutes/games played)
    let totalMinutes = 0;
    let weightedORtg = 0, weightedDRtg = 0, weightedNetRtg = 0;
    let weightedEfg = 0, weightedPace = 0, weightedTsPct = 0;
    let totalGames = 0;
    
    for (const ps of playerStats) {
      const stats = ps.stats || ps; // Handle both formats
      const mins = stats.min || 0;
      const gp = stats.gp || stats.games_played || 1;
      const weight = mins * gp;
      totalMinutes += weight;
      totalGames = Math.max(totalGames, gp);
      
      weightedORtg += (stats.off_rating || stats.offensive_rating || 0) * weight;
      weightedDRtg += (stats.def_rating || stats.defensive_rating || 0) * weight;
      weightedNetRtg += (stats.net_rating || 0) * weight;
      weightedEfg += (stats.efg_pct || 0) * weight;
      weightedPace += (stats.pace || 0) * weight;
      weightedTsPct += (stats.ts_pct || 0) * weight;
    }
    
    if (totalMinutes === 0) {
      console.warn(`[Stat Router] No minutes data for team ${teamId}`);
      return null;
    }
    
    return {
      offensive_rating: (weightedORtg / totalMinutes).toFixed(1),
      defensive_rating: (weightedDRtg / totalMinutes).toFixed(1),
      net_rating: (weightedNetRtg / totalMinutes).toFixed(1),
      efg_pct: ((weightedEfg / totalMinutes) * 100).toFixed(1),
      pace: (weightedPace / totalMinutes).toFixed(1),
      true_shooting_pct: ((weightedTsPct / totalMinutes) * 100).toFixed(1),
      games_played: totalGames,
      players_sampled: playerStats.length,
      top_players: playerStats.slice(0, 3).map(ps => {
        const stats = ps.stats || ps;
        return {
          name: `${ps.player?.first_name || ''} ${ps.player?.last_name || ''}`.trim(),
          off_rating: stats.off_rating || stats.offensive_rating,
          def_rating: stats.def_rating || stats.defensive_rating,
          usage: ((stats.usg_pct || 0) * 100).toFixed(1)
        };
      })
    };
  } catch (error) {
    console.warn('[Stat Router] BDL NBA advanced stats fetch failed:', error.message);
    return null;
  }
}

/**
 * Fetch NBA Leaders for a stat type
 */
async function fetchNBALeaders(statType, season = null) {
  // Calculate dynamic default season: NBA starts in October
  if (!season) {
    const month = new Date().getMonth() + 1;
    const year = new Date().getFullYear();
    // Oct(10)-Dec = currentYear, Jan-Sep = previousYear
    season = month >= 10 ? year : year - 1;
  }
  try {
    const url = `https://api.balldontlie.io/v1/leaders?stat_type=${statType}&season=${season}`;
    const resp = await fetch(url, { headers: { Authorization: BDL_API_KEY } });
    const json = await resp.json();
    return json.data || [];
  } catch (error) {
    console.warn(`[Stat Router] BDL Leaders fetch failed for ${statType}:`, error.message);
    return [];
  }
}

/**
 * Fetch NBA team BASE stats via BDL Season Averages endpoint
 * Aggregates player stats to get team-level 3PT%, FT%, rebounds, turnovers, etc.
 * 
 * BDL Season Averages types:
 * - general/base: pts, reb, ast, fgm, fga, fg_pct, fg3m, fg3a, fg3_pct, ftm, fta, ft_pct, oreb, dreb, tov
 * - general/advanced: off_rating, def_rating, net_rating, efg_pct, pace, ts_pct
 */
async function fetchNBATeamBaseStats(teamId, season = null) {
  // Calculate dynamic default season: NBA starts in October
  if (!season) {
    const month = new Date().getMonth() + 1;
    const year = new Date().getFullYear();
    // Oct(10)-Dec = currentYear, Jan-Sep = previousYear
    season = month >= 10 ? year : year - 1;
  }
  try {
    // Get active players for team (get more players for better aggregation)
    const playersUrl = `https://api.balldontlie.io/v1/players/active?team_ids[]=${teamId}&per_page=15`;
    const playersResp = await fetch(playersUrl, { headers: { Authorization: BDL_API_KEY } });
    const playersJson = await playersResp.json();
    const players = playersJson.data || [];
    
    if (players.length === 0) {
      console.warn(`[NBA Base Stats] No players found for team ${teamId}`);
      return null;
    }
    
    // Get season averages (base) for top 10 players
    const topPlayerIds = players.slice(0, 10).map(p => p.id);
    const playerIdParams = topPlayerIds.map(id => `player_ids[]=${id}`).join('&');
    const seasonAvgUrl = `https://api.balldontlie.io/v1/season_averages/general?season=${season}&season_type=regular&type=base&${playerIdParams}`;
    
    console.log(`[NBA Base Stats] Fetching: ${seasonAvgUrl.replace(BDL_API_KEY, 'HIDDEN')}`);
    
    const resp = await fetch(seasonAvgUrl, { headers: { Authorization: BDL_API_KEY } });
    const json = await resp.json();
    const playerStats = json.data || [];
    
    if (playerStats.length === 0) {
      console.warn(`[NBA Base Stats] No season averages for team ${teamId}`);
      return null;
    }
    
    // Aggregate team stats (weighted by games played)
    let totalGames = 0;
    let totalPts = 0, totalReb = 0, totalAst = 0;
    let totalFgm = 0, totalFga = 0;
    let totalFg3m = 0, totalFg3a = 0;
    let totalFtm = 0, totalFta = 0;
    let totalOreb = 0, totalDreb = 0;
    let totalTov = 0;
    let maxGames = 0;
    
    for (const ps of playerStats) {
      const s = ps.stats || {};
      const gp = s.gp || 0;
      if (gp === 0) continue;
      
      maxGames = Math.max(maxGames, gp);
      totalGames += gp;
      
      // Accumulate per-game stats * games played
      totalPts += (s.pts || 0) * gp;
      totalReb += (s.reb || 0) * gp;
      totalAst += (s.ast || 0) * gp;
      totalFgm += (s.fgm || 0) * gp;
      totalFga += (s.fga || 0) * gp;
      totalFg3m += (s.fg3m || 0) * gp;
      totalFg3a += (s.fg3a || 0) * gp;
      totalFtm += (s.ftm || 0) * gp;
      totalFta += (s.fta || 0) * gp;
      totalOreb += (s.oreb || 0) * gp;
      totalDreb += (s.dreb || 0) * gp;
      totalTov += (s.tov || s.turnover || 0) * gp;
    }
    
    if (totalGames === 0) return null;
    
    // Calculate team per-game averages (divide by total player-games then multiply by ~5 starters)
    const teamGamesEst = maxGames; // Use max games as the team's game count
    const perGameDivisor = totalGames / teamGamesEst; // Normalize for player overlap
    
    // Calculate percentages
    const fg_pct = totalFga > 0 ? (totalFgm / totalFga) : 0;
    const fg3_pct = totalFg3a > 0 ? (totalFg3m / totalFg3a) : 0;
    const ft_pct = totalFta > 0 ? (totalFtm / totalFta) : 0;
    const ft_rate = totalFga > 0 ? (totalFta / totalFga) : 0; // FTA per FGA
    
    // Calculate per-game stats
    const ppg = totalPts / totalGames * perGameDivisor;
    const rpg = totalReb / totalGames * perGameDivisor;
    const apg = totalAst / totalGames * perGameDivisor;
    const fg3m_pg = totalFg3m / totalGames * perGameDivisor;
    const fg3a_pg = totalFg3a / totalGames * perGameDivisor;
    const ftm_pg = totalFtm / totalGames * perGameDivisor;
    const fta_pg = totalFta / totalGames * perGameDivisor;
    const oreb_pg = totalOreb / totalGames * perGameDivisor;
    const dreb_pg = totalDreb / totalGames * perGameDivisor;
    const tov_pg = totalTov / totalGames * perGameDivisor;
    
    // Turnover rate approximation: TOV / (FGA + 0.44*FTA + TOV)
    const possessions = totalFga + 0.44 * totalFta + totalTov;
    const tov_rate = possessions > 0 ? (totalTov / possessions) : 0;
    
    // OREB rate approximation (would need opponent DREB for true rate)
    const oreb_rate = (totalOreb + totalDreb) > 0 ? (totalOreb / (totalOreb + totalDreb)) : 0;
    
    console.log(`[NBA Base Stats] Team ${teamId}: FG3%=${(fg3_pct*100).toFixed(1)}%, FT%=${(ft_pct*100).toFixed(1)}%, FT_RATE=${ft_rate.toFixed(3)}`);
    
    return {
      games_played: maxGames,
      players_sampled: playerStats.length,
      // Shooting
      fg_pct: (fg_pct * 100).toFixed(1),
      fg3_pct: (fg3_pct * 100).toFixed(1),
      fg3m_per_game: fg3m_pg.toFixed(1),
      fg3a_per_game: fg3a_pg.toFixed(1),
      // Free throws
      ft_pct: (ft_pct * 100).toFixed(1),
      ft_rate: ft_rate.toFixed(3),
      ftm_per_game: ftm_pg.toFixed(1),
      fta_per_game: fta_pg.toFixed(1),
      // Rebounds
      oreb_per_game: oreb_pg.toFixed(1),
      dreb_per_game: dreb_pg.toFixed(1),
      reb_per_game: rpg.toFixed(1),
      oreb_rate: (oreb_rate * 100).toFixed(1),
      // Turnovers
      tov_per_game: tov_pg.toFixed(1),
      tov_rate: (tov_rate * 100).toFixed(1),
      // Other
      pts_per_game: ppg.toFixed(1),
      ast_per_game: apg.toFixed(1),
      // Top scorers for TOP_PLAYERS token
      top_players: playerStats.slice(0, 5).map(ps => ({
        name: `${ps.player?.first_name || ''} ${ps.player?.last_name || ''}`.trim(),
        ppg: (ps.stats?.pts || 0).toFixed(1),
        rpg: (ps.stats?.reb || 0).toFixed(1),
        apg: (ps.stats?.ast || 0).toFixed(1),
        fg3_pct: ps.stats?.fg3_pct ? (ps.stats.fg3_pct * 100).toFixed(1) : 'N/A'
      }))
    };
  } catch (error) {
    console.warn('[Stat Router] BDL NBA base stats fetch failed:', error.message);
    return null;
  }
}

/**
 * Find team by name - STRICT matching to avoid mascot collisions
 * e.g., "Montana State Bobcats" should NOT match "Ohio Bobcats"
 */
function findTeam(teams, teamName) {
  if (!teams || !teamName) return null;
  const normalized = teamName.toLowerCase().trim();
  
  // 1. Try exact full_name match first (best)
  let match = teams.find(t => t.full_name?.toLowerCase() === normalized);
  if (match) return match;
  
  // 2. Try full_name contains the search term (e.g., "Duke Blue Devils" contains "duke")
  match = teams.find(t => t.full_name?.toLowerCase().includes(normalized));
  if (match) return match;
  
  // 3. Try search term contains full_name (e.g., searching "Duke Blue Devils NCAA" contains "Duke Blue Devils")
  match = teams.find(t => normalized.includes(t.full_name?.toLowerCase()));
  if (match) return match;
  
  // 4. For college sports: Try matching on college + mascot (e.g., "Montana State" + "Bobcats")
  // Split the search into parts
  const searchParts = normalized.split(/\s+/);
  if (searchParts.length >= 2) {
    // Try to find team where college/city matches AND mascot matches
    match = teams.find(t => {
      const fullName = t.full_name?.toLowerCase() || '';
      const college = t.college?.toLowerCase() || '';
      const mascot = t.name?.toLowerCase() || '';
      
      // Check if the search contains BOTH the college/city AND the mascot
      const collegeMatch = normalized.includes(college) || college.split(/\s+/).every(p => normalized.includes(p));
      const mascotMatch = normalized.includes(mascot);
      
      return collegeMatch && mascotMatch;
    });
    if (match) return match;
  }
  
  // 5. Try abbreviation match (e.g., "MSU" for Michigan State)
  match = teams.find(t => t.abbreviation?.toLowerCase() === normalized);
  if (match) return match;
  
  // 6. Last resort: partial match on full_name only (NOT on mascot alone)
  // This prevents "Bobcats" from matching "Ohio Bobcats" when searching for "Montana State Bobcats"
  match = teams.find(t => {
    const fullName = t.full_name?.toLowerCase() || '';
    // Only match if search term shares significant portion with full_name
    const searchWords = normalized.split(/\s+/).filter(w => w.length > 2);
    const matchCount = searchWords.filter(w => fullName.includes(w)).length;
    return matchCount >= Math.ceil(searchWords.length * 0.6); // At least 60% of words must match
  });
  
  return match || null;
}

/**
 * Format number helper
 */
function fmtNum(val, decimals = 1) {
  if (val === null || val === undefined || isNaN(val)) return 'N/A';
  return Number(val).toFixed(decimals);
}

/**
 * Format percentage helper
 */
function fmtPct(val) {
  if (val === null || val === undefined || isNaN(val)) return 'N/A';
  const pct = val <= 1 ? val * 100 : val;
  return `${pct.toFixed(1)}%`;
}

/**
 * NCAAF Red Zone Stats via Gemini Grounding
 * BDL doesn't provide NCAAF red zone data, so we fetch from live search
 */
async function fetchNCAAFRedZoneFromGrounding(homeTeam, awayTeam) {
  try {
    const seasonString = getCurrentSeasonString();
    const query = `What are the ${seasonString} college football season red zone statistics for ${homeTeam} and ${awayTeam} as of TODAY?

For EACH team, provide:
1. Red Zone TD Percentage (touchdowns scored when inside opponent's 20-yard line)
2. Red Zone Scoring Percentage (any points scored in red zone - TDs + FGs)
3. Number of red zone trips/attempts if available

Be specific with actual percentages (e.g., "85.7%"). If exact stats unavailable, provide team's general scoring efficiency context.
Focus on the ${seasonString} season only - do NOT use stats from previous years.`;

    const result = await geminiGroundingSearch(query, { temperature: 0.1, maxTokens: 600 });
    
    if (result?.success && result?.data) {
      const responseText = result.data;
      
      // Parse red zone percentages from response
      const parseRZStats = (teamName, text) => {
        // Look for patterns like "85.7%" or "85%" near the team name
        const teamSection = text.toLowerCase().includes(teamName.toLowerCase().split(' ')[0]) 
          ? text : text;
        
        // Try to find percentage patterns
        const pctMatch = teamSection.match(/(\d{1,2}(?:\.\d)?)\s*%/);
        const tdPct = pctMatch ? `${pctMatch[1]}%` : 'N/A';
        
        return {
          red_zone_td_pct: tdPct,
          context: responseText.substring(0, 300)
        };
      };
      
      const homeStats = parseRZStats(homeTeam, responseText);
      const awayStats = parseRZStats(awayTeam, responseText);
      
      console.log(`[Stat Router] ✅ NCAAF Red Zone from Grounding: ${homeTeam} (${homeStats.red_zone_td_pct}), ${awayTeam} (${awayStats.red_zone_td_pct})`);
      
      return {
        category: 'Red Zone Efficiency (via Live Search)',
        source: 'Gemini Grounding',
        home: {
          team: homeTeam,
          red_zone_td_pct: homeStats.red_zone_td_pct,
          note: 'From live search - verify in Scout Report context'
        },
        away: {
          team: awayTeam,
          red_zone_td_pct: awayStats.red_zone_td_pct,
          note: 'From live search - verify in Scout Report context'
        },
        raw_context: responseText.substring(0, 500),
        note: 'NCAAF red zone stats via Gemini Grounding (BDL does not provide this data)'
      };
    }
    
    // Grounding failed - return N/A with context
    return {
      category: 'Red Zone Efficiency',
      home: { team: homeTeam, red_zone_td_pct: 'N/A' },
      away: { team: awayTeam, red_zone_td_pct: 'N/A' },
      note: 'NCAAF red zone data unavailable - use scoring efficiency and total TDs as proxy'
    };
    
  } catch (e) {
    console.warn(`[Stat Router] NCAAF Red Zone Grounding failed:`, e.message);
    return {
      category: 'Red Zone Efficiency',
      home: { team: homeTeam, red_zone_td_pct: 'N/A' },
      away: { team: awayTeam, red_zone_td_pct: 'N/A' },
      note: 'NCAAF red zone data unavailable - use scoring efficiency and total TDs as proxy'
    };
  }
}

// =============================================================================
// FETCHERS - Each function fetches a specific stat category
// =============================================================================

const FETCHERS = {
  // ===== PACE & TEMPO =====
  PACE: async (bdlSport, home, away, season) => {
    // For NBA, use BDL Season Averages (Advanced) which includes pace
    if (bdlSport === 'basketball_nba') {
      const [homeStats, awayStats] = await Promise.all([
        fetchNBATeamAdvancedStats(home.id, season),
        fetchNBATeamAdvancedStats(away.id, season)
      ]);
      
      const homePace = homeStats?.pace ? parseFloat(homeStats.pace) : 0;
      const awayPace = awayStats?.pace ? parseFloat(awayStats.pace) : 0;
      const avgPace = (homePace + awayPace) / 2;
      
      return {
        category: 'Pace & Tempo (BDL Advanced)',
        source: 'Ball Don\'t Lie API',
        home: {
          team: home.full_name || home.name,
          pace: homeStats?.pace || 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          pace: awayStats?.pace || 'N/A'
        },
        projected_pace: avgPace > 0 ? avgPace.toFixed(1) : 'N/A',
        analysis: homePace > 100 && awayPace > 100 
          ? 'Both teams play at a fast pace - expect high possession game'
          : homePace < 98 && awayPace < 98 
            ? 'Both teams play slow - expect grinding, low-possession game'
            : `Pace mismatch: ${home.name} (${homePace.toFixed(1)}) vs ${away.name} (${awayPace.toFixed(1)})`
      };
    }
    
    const [homeStats, awayStats] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    
    const homeData = Array.isArray(homeStats) ? homeStats[0] : homeStats;
    const awayData = Array.isArray(awayStats) ? awayStats[0] : awayStats;
    
    return {
      category: 'Pace & Tempo',
      home: {
        team: home.full_name || home.name,
        pace: fmtNum(homeData?.pace),
        possessions_per_game: fmtNum(homeData?.possessions_per_game)
      },
      away: {
        team: away.full_name || away.name,
        pace: fmtNum(awayData?.pace),
        possessions_per_game: fmtNum(awayData?.possessions_per_game)
      },
      analysis: buildPaceAnalysis(homeData, awayData)
    };
  },
  
  TEMPO: async (bdlSport, home, away, season) => {
    // Alias for PACE in college
    return FETCHERS.PACE(bdlSport, home, away, season);
  },

  // ===== EFFICIENCY =====
  OFFENSIVE_RATING: async (bdlSport, home, away, season) => {
    // For NBA, use BDL Season Averages (Advanced) - requires GOAT tier
    if (bdlSport === 'basketball_nba') {
      const [homeStats, awayStats] = await Promise.all([
        fetchNBATeamAdvancedStats(home.id, season),
        fetchNBATeamAdvancedStats(away.id, season)
      ]);
      
      return {
        category: 'Offensive Efficiency (BDL Advanced)',
        source: 'Ball Don\'t Lie API',
        home: {
          team: home.full_name || home.name,
          offensive_rating: homeStats?.offensive_rating || 'N/A',
          true_shooting_pct: homeStats?.true_shooting_pct ? `${homeStats.true_shooting_pct}%` : 'N/A',
          games_played: homeStats?.games_played || 0,
          top_players: homeStats?.top_players || []
        },
        away: {
          team: away.full_name || away.name,
          offensive_rating: awayStats?.offensive_rating || 'N/A',
          true_shooting_pct: awayStats?.true_shooting_pct ? `${awayStats.true_shooting_pct}%` : 'N/A',
          games_played: awayStats?.games_played || 0,
          top_players: awayStats?.top_players || []
        },
        comparison: homeStats && awayStats ? 
          `${home.name} ORtg ${homeStats.offensive_rating} vs ${away.name} ORtg ${awayStats.offensive_rating} = ${(parseFloat(homeStats.offensive_rating) - parseFloat(awayStats.offensive_rating)).toFixed(1)} point gap` : 
          'Comparison unavailable'
      };
    }
    
    // For other sports, try BDL team season stats
    const [homeStats, awayStats] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    
    const homeData = Array.isArray(homeStats) ? homeStats[0] : homeStats;
    const awayData = Array.isArray(awayStats) ? awayStats[0] : awayStats;
    
    return {
      category: 'Offensive Efficiency',
      home: {
        team: home.full_name || home.name,
        offensive_rating: fmtNum(homeData?.offensive_rating),
        points_per_game: fmtNum(homeData?.points_per_game || homeData?.total_points_per_game)
      },
      away: {
        team: away.full_name || away.name,
        offensive_rating: fmtNum(awayData?.offensive_rating),
        points_per_game: fmtNum(awayData?.points_per_game || awayData?.total_points_per_game)
      }
    };
  },
  
  DEFENSIVE_RATING: async (bdlSport, home, away, season) => {
    // For NBA, use BDL Season Averages (Advanced)
    if (bdlSport === 'basketball_nba') {
      const [homeStats, awayStats] = await Promise.all([
        fetchNBATeamAdvancedStats(home.id, season),
        fetchNBATeamAdvancedStats(away.id, season)
      ]);
      
      return {
        category: 'Defensive Efficiency (BDL Advanced)',
        source: 'Ball Don\'t Lie API',
        home: {
          team: home.full_name || home.name,
          defensive_rating: homeStats?.defensive_rating || 'N/A',
          games_played: homeStats?.games_played || 0
        },
        away: {
          team: away.full_name || away.name,
          defensive_rating: awayStats?.defensive_rating || 'N/A',
          games_played: awayStats?.games_played || 0
        },
        comparison: homeStats && awayStats ?
          `${home.name} DRtg ${homeStats.defensive_rating} vs ${away.name} DRtg ${awayStats.defensive_rating} (lower is better)` :
          'Comparison unavailable'
      };
    }
    
    // For other sports
    const [homeStats, awayStats] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    
    const homeData = Array.isArray(homeStats) ? homeStats[0] : homeStats;
    const awayData = Array.isArray(awayStats) ? awayStats[0] : awayStats;
    
    return {
      category: 'Defensive Efficiency',
      home: {
        team: home.full_name || home.name,
        defensive_rating: fmtNum(homeData?.defensive_rating),
        opp_points_per_game: fmtNum(homeData?.opp_points_per_game || homeData?.opp_total_points_per_game)
      },
      away: {
        team: away.full_name || away.name,
        defensive_rating: fmtNum(awayData?.defensive_rating),
        opp_points_per_game: fmtNum(awayData?.opp_points_per_game || awayData?.opp_total_points_per_game)
      }
    };
  },
  
  NET_RATING: async (bdlSport, home, away, season) => {
    // For NBA, use BDL Season Averages (Advanced)
    if (bdlSport === 'basketball_nba') {
      const [homeStats, awayStats] = await Promise.all([
        fetchNBATeamAdvancedStats(home.id, season),
        fetchNBATeamAdvancedStats(away.id, season)
      ]);
      
      const homeNet = homeStats?.net_rating ? parseFloat(homeStats.net_rating) : 0;
      const awayNet = awayStats?.net_rating ? parseFloat(awayStats.net_rating) : 0;
      const gap = (homeNet - awayNet).toFixed(1);
      
      return {
        category: 'Net Rating Comparison (BDL Advanced)',
        source: 'Ball Don\'t Lie API',
        home: {
          team: home.full_name || home.name,
          net_rating: homeStats?.net_rating || 'N/A',
          offensive_rating: homeStats?.offensive_rating || 'N/A',
          defensive_rating: homeStats?.defensive_rating || 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          net_rating: awayStats?.net_rating || 'N/A',
          offensive_rating: awayStats?.offensive_rating || 'N/A',
          defensive_rating: awayStats?.defensive_rating || 'N/A'
        },
        gap: gap,
        interpretation: homeNet > awayNet 
          ? `${home.name} has +${gap} net rating advantage (${homeNet.toFixed(1)} vs ${awayNet.toFixed(1)})`
          : `${away.name} has +${Math.abs(parseFloat(gap)).toFixed(1)} net rating advantage (${awayNet.toFixed(1)} vs ${homeNet.toFixed(1)})`
      };
    }
    
    // For other sports
    const [homeStats, awayStats] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    
    const homeData = Array.isArray(homeStats) ? homeStats[0] : homeStats;
    const awayData = Array.isArray(awayStats) ? awayStats[0] : awayStats;
    
    const homeNet = (homeData?.offensive_rating || 0) - (homeData?.defensive_rating || 0);
    const awayNet = (awayData?.offensive_rating || 0) - (awayData?.defensive_rating || 0);
    
    return {
      category: 'Net Rating',
      home: {
        team: home.full_name || home.name,
        net_rating: fmtNum(homeNet),
        offensive_rating: fmtNum(homeData?.offensive_rating),
        defensive_rating: fmtNum(homeData?.defensive_rating)
      },
      away: {
        team: away.full_name || away.name,
        net_rating: fmtNum(awayNet),
        offensive_rating: fmtNum(awayData?.offensive_rating),
        defensive_rating: fmtNum(awayData?.defensive_rating)
      },
      gap: fmtNum(homeNet - awayNet),
      interpretation: homeNet > awayNet 
        ? `${home.name} has ${fmtNum(homeNet - awayNet)} point net rating advantage`
        : `${away.name} has ${fmtNum(awayNet - homeNet)} point net rating advantage`
    };
  },
  
  ADJ_OFFENSIVE_EFF: async (bdlSport, home, away, season) => {
    return FETCHERS.OFFENSIVE_RATING(bdlSport, home, away, season);
  },
  
  ADJ_DEFENSIVE_EFF: async (bdlSport, home, away, season) => {
    return FETCHERS.DEFENSIVE_RATING(bdlSport, home, away, season);
  },
  
  ADJ_EFFICIENCY_MARGIN: async (bdlSport, home, away, season) => {
    return FETCHERS.NET_RATING(bdlSport, home, away, season);
  },

  // ===== FOUR FACTORS =====
  EFG_PCT: async (bdlSport, home, away, season) => {
    // For NBA, use BDL Season Averages (Advanced)
    if (bdlSport === 'basketball_nba') {
      const [homeStats, awayStats] = await Promise.all([
        fetchNBATeamAdvancedStats(home.id, season),
        fetchNBATeamAdvancedStats(away.id, season)
      ]);
      
      return {
        category: 'Shooting Efficiency (BDL Advanced)',
        source: 'Ball Don\'t Lie API',
        home: {
          team: home.full_name || home.name,
          efg_pct: homeStats?.efg_pct ? `${homeStats.efg_pct}%` : 'N/A',
          true_shooting_pct: homeStats?.true_shooting_pct ? `${homeStats.true_shooting_pct}%` : 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          efg_pct: awayStats?.efg_pct ? `${awayStats.efg_pct}%` : 'N/A',
          true_shooting_pct: awayStats?.true_shooting_pct ? `${awayStats.true_shooting_pct}%` : 'N/A'
        },
        comparison: homeStats && awayStats ?
          `eFG% gap: ${(parseFloat(homeStats.efg_pct) - parseFloat(awayStats.efg_pct)).toFixed(1)}% (${home.name} ${homeStats.efg_pct}% vs ${away.name} ${awayStats.efg_pct}%)` :
          'Comparison unavailable'
      };
    }
    
    const [homeStats, awayStats] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    
    const homeData = Array.isArray(homeStats) ? homeStats[0] : homeStats;
    const awayData = Array.isArray(awayStats) ? awayStats[0] : awayStats;
    
    // Calculate eFG% if not provided: eFG% = (FGM + 0.5 * FG3M) / FGA
    const calcEfg = (d) => {
      if (d?.efg_pct || d?.effective_fg_pct) return d.efg_pct || d.effective_fg_pct;
      const fgm = d?.fgm || 0;
      const fg3m = d?.fg3m || 0;
      const fga = d?.fga || 1;
      return ((fgm + 0.5 * fg3m) / fga) * 100;
    };
    
    return {
      category: 'Effective Field Goal %',
      home: {
        team: home.full_name || home.name,
        efg_pct: fmtPct(calcEfg(homeData)),
        fg_pct: fmtPct(homeData?.fg_pct || homeData?.field_goal_pct),
        three_pct: fmtPct(homeData?.fg3_pct || homeData?.three_pct || homeData?.three_point_pct)
      },
      away: {
        team: away.full_name || away.name,
        efg_pct: fmtPct(calcEfg(awayData)),
        fg_pct: fmtPct(awayData?.fg_pct || awayData?.field_goal_pct),
        three_pct: fmtPct(awayData?.fg3_pct || awayData?.three_pct || awayData?.three_point_pct)
      }
    };
  },
  
  TURNOVER_RATE: async (bdlSport, home, away, season) => {
    // For NBA, use player-aggregated base stats (BDL has no team_season_stats for NBA)
    if (bdlSport === 'basketball_nba') {
      const [homeStats, awayStats] = await Promise.all([
        fetchNBATeamBaseStats(home.id, season),
        fetchNBATeamBaseStats(away.id, season)
      ]);
      
      return {
        category: 'Turnover Rate',
        home: {
          team: home.full_name || home.name,
          tov_rate: homeStats?.tov_rate ? `${homeStats.tov_rate}%` : 'N/A',
          turnovers_per_game: homeStats?.tov_per_game || 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          tov_rate: awayStats?.tov_rate ? `${awayStats.tov_rate}%` : 'N/A',
          turnovers_per_game: awayStats?.tov_per_game || 'N/A'
        }
      };
    }
    
    // For other sports, use getTeamSeasonStats
    const [homeStats, awayStats] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    
    const homeData = Array.isArray(homeStats) ? homeStats[0] : homeStats;
    const awayData = Array.isArray(awayStats) ? awayStats[0] : awayStats;
    
    // NCAAB uses 'turnover', NBA uses 'turnovers_per_game'
    return {
      category: 'Turnover Rate',
      home: {
        team: home.full_name || home.name,
        tov_rate: fmtPct(homeData?.turnover_rate || homeData?.tov_pct),
        turnovers_per_game: fmtNum(homeData?.turnovers_per_game || homeData?.turnover) // NCAAB uses 'turnover'
      },
      away: {
        team: away.full_name || away.name,
        tov_rate: fmtPct(awayData?.turnover_rate || awayData?.tov_pct),
        turnovers_per_game: fmtNum(awayData?.turnovers_per_game || awayData?.turnover) // NCAAB uses 'turnover'
      }
    };
  },
  
  OREB_RATE: async (bdlSport, home, away, season) => {
    // For NBA, use player-aggregated base stats (BDL has no team_season_stats for NBA)
    if (bdlSport === 'basketball_nba') {
      const [homeStats, awayStats] = await Promise.all([
        fetchNBATeamBaseStats(home.id, season),
        fetchNBATeamBaseStats(away.id, season)
      ]);
      
      return {
        category: 'Offensive Rebounding',
        home: {
          team: home.full_name || home.name,
          oreb_rate: homeStats?.oreb_rate ? `${homeStats.oreb_rate}%` : 'N/A',
          oreb_per_game: homeStats?.oreb_per_game || 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          oreb_rate: awayStats?.oreb_rate ? `${awayStats.oreb_rate}%` : 'N/A',
          oreb_per_game: awayStats?.oreb_per_game || 'N/A'
        }
      };
    }
    
    // For other sports, use getTeamSeasonStats
    const [homeStats, awayStats] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    
    const homeData = Array.isArray(homeStats) ? homeStats[0] : homeStats;
    const awayData = Array.isArray(awayStats) ? awayStats[0] : awayStats;
    
    return {
      category: 'Offensive Rebounding',
      home: {
        team: home.full_name || home.name,
        oreb_rate: fmtPct(homeData?.oreb_pct || homeData?.offensive_reb_pct),
        oreb_per_game: fmtNum(homeData?.oreb_per_game || homeData?.oreb || homeData?.offensive_rebounds_per_game) // NCAAB uses 'oreb'
      },
      away: {
        team: away.full_name || away.name,
        oreb_rate: fmtPct(awayData?.oreb_pct || awayData?.offensive_reb_pct),
        oreb_per_game: fmtNum(awayData?.oreb_per_game || awayData?.oreb || awayData?.offensive_rebounds_per_game) // NCAAB uses 'oreb'
      }
    };
  },
  
  FT_RATE: async (bdlSport, home, away, season) => {
    // For NBA, use player-aggregated base stats (BDL has no team_season_stats for NBA)
    if (bdlSport === 'basketball_nba') {
      const [homeStats, awayStats] = await Promise.all([
        fetchNBATeamBaseStats(home.id, season),
        fetchNBATeamBaseStats(away.id, season)
      ]);
      
      return {
        category: 'Free Throw Rate',
        home: {
          team: home.full_name || home.name,
          ft_rate: homeStats?.ft_rate || 'N/A',
          ft_pct: homeStats?.ft_pct ? `${homeStats.ft_pct}%` : 'N/A',
          fta_per_game: homeStats?.fta_per_game || 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          ft_rate: awayStats?.ft_rate || 'N/A',
          ft_pct: awayStats?.ft_pct ? `${awayStats.ft_pct}%` : 'N/A',
          fta_per_game: awayStats?.fta_per_game || 'N/A'
        }
      };
    }
    
    // For other sports, use getTeamSeasonStats
    const [homeStats, awayStats] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    
    const homeData = Array.isArray(homeStats) ? homeStats[0] : homeStats;
    const awayData = Array.isArray(awayStats) ? awayStats[0] : awayStats;
    
    // Calculate FT Rate (FTA/FGA) if not provided
    const calcFtRate = (d) => {
      if (d?.ft_rate) return d.ft_rate;
      const fta = d?.fta || 0;
      const fga = d?.fga || 1;
      return fta / fga;
    };
    
    return {
      category: 'Free Throw Rate',
      home: {
        team: home.full_name || home.name,
        ft_rate: fmtNum(calcFtRate(homeData), 3),
        ft_pct: fmtPct(homeData?.ft_pct || homeData?.free_throw_pct),
        fta_per_game: fmtNum(homeData?.fta_per_game || homeData?.fta) // NCAAB uses 'fta'
      },
      away: {
        team: away.full_name || away.name,
        ft_rate: fmtNum(calcFtRate(awayData), 3),
        ft_pct: fmtPct(awayData?.ft_pct || awayData?.free_throw_pct),
        fta_per_game: fmtNum(awayData?.fta_per_game || awayData?.fta) // NCAAB uses 'fta'
      }
    };
  },

  // ===== SHOOTING =====
  THREE_PT_SHOOTING: async (bdlSport, home, away, season) => {
    // For NBA, use player-aggregated base stats (BDL has no team_season_stats for NBA)
    if (bdlSport === 'basketball_nba') {
      const [homeStats, awayStats] = await Promise.all([
        fetchNBATeamBaseStats(home.id, season),
        fetchNBATeamBaseStats(away.id, season)
      ]);
      
      return {
        category: 'Three-Point Shooting',
        home: {
          team: home.full_name || home.name,
          three_pct: homeStats?.fg3_pct ? `${homeStats.fg3_pct}%` : 'N/A',
          three_made_per_game: homeStats?.fg3m_per_game || 'N/A',
          three_attempted_per_game: homeStats?.fg3a_per_game || 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          three_pct: awayStats?.fg3_pct ? `${awayStats.fg3_pct}%` : 'N/A',
          three_made_per_game: awayStats?.fg3m_per_game || 'N/A',
          three_attempted_per_game: awayStats?.fg3a_per_game || 'N/A'
        }
      };
    }
    
    // For other sports, use getTeamSeasonStats
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    
    // BDL returns an array - extract first item
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    // BDL NCAAB uses fg3_pct, fg3m, fg3a; NBA uses three_pct, three_made_per_game, etc.
    return {
      category: 'Three-Point Shooting',
      home: {
        team: home.full_name || home.name,
        three_pct: fmtPct(homeStats?.fg3_pct || homeStats?.three_pct || homeStats?.three_point_pct),
        three_made_per_game: fmtNum(homeStats?.fg3m || homeStats?.three_made_per_game),
        three_attempted_per_game: fmtNum(homeStats?.fg3a || homeStats?.three_attempted_per_game)
      },
      away: {
        team: away.full_name || away.name,
        three_pct: fmtPct(awayStats?.fg3_pct || awayStats?.three_pct || awayStats?.three_point_pct),
        three_made_per_game: fmtNum(awayStats?.fg3m || awayStats?.three_made_per_game),
        three_attempted_per_game: fmtNum(awayStats?.fg3a || awayStats?.three_attempted_per_game)
      }
    };
  },

  // ===== NCAAB/NCAAF SPECIFIC STATS =====
  // These provide actual data that BDL has for college sports
  
  SCORING: async (bdlSport, home, away, season) => {
    const [homeStats, awayStats] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeData = Array.isArray(homeStats) ? homeStats[0] : homeStats;
    const awayData = Array.isArray(awayStats) ? awayStats[0] : awayStats;
    
    return {
      category: 'Scoring',
      home: {
        team: home.full_name || home.name,
        points_per_game: fmtNum(homeData?.pts || homeData?.points_per_game, 1),
        fg_pct: fmtPct(homeData?.fg_pct),
        games_played: homeData?.games_played || 'N/A'
      },
      away: {
        team: away.full_name || away.name,
        points_per_game: fmtNum(awayData?.pts || awayData?.points_per_game, 1),
        fg_pct: fmtPct(awayData?.fg_pct),
        games_played: awayData?.games_played || 'N/A'
      }
    };
  },

  ASSISTS: async (bdlSport, home, away, season) => {
    const [homeStats, awayStats] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeData = Array.isArray(homeStats) ? homeStats[0] : homeStats;
    const awayData = Array.isArray(awayStats) ? awayStats[0] : awayStats;
    
    return {
      category: 'Assists',
      home: {
        team: home.full_name || home.name,
        assists_per_game: fmtNum(homeData?.ast || homeData?.assists_per_game, 1)
      },
      away: {
        team: away.full_name || away.name,
        assists_per_game: fmtNum(awayData?.ast || awayData?.assists_per_game, 1)
      }
    };
  },

  REBOUNDS: async (bdlSport, home, away, season) => {
    const [homeStats, awayStats] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeData = Array.isArray(homeStats) ? homeStats[0] : homeStats;
    const awayData = Array.isArray(awayStats) ? awayStats[0] : awayStats;
    
    return {
      category: 'Rebounding',
      home: {
        team: home.full_name || home.name,
        rebounds_per_game: fmtNum(homeData?.reb || homeData?.rebounds_per_game, 1),
        oreb_per_game: fmtNum(homeData?.oreb, 1),
        dreb_per_game: fmtNum(homeData?.dreb, 1)
      },
      away: {
        team: away.full_name || away.name,
        rebounds_per_game: fmtNum(awayData?.reb || awayData?.rebounds_per_game, 1),
        oreb_per_game: fmtNum(awayData?.oreb, 1),
        dreb_per_game: fmtNum(awayData?.dreb, 1)
      }
    };
  },

  STEALS: async (bdlSport, home, away, season) => {
    const [homeStats, awayStats] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeData = Array.isArray(homeStats) ? homeStats[0] : homeStats;
    const awayData = Array.isArray(awayStats) ? awayStats[0] : awayStats;
    
    return {
      category: 'Steals',
      home: {
        team: home.full_name || home.name,
        steals_per_game: fmtNum(homeData?.stl || homeData?.steals_per_game, 1)
      },
      away: {
        team: away.full_name || away.name,
        steals_per_game: fmtNum(awayData?.stl || awayData?.steals_per_game, 1)
      }
    };
  },

  BLOCKS: async (bdlSport, home, away, season) => {
    const [homeStats, awayStats] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeData = Array.isArray(homeStats) ? homeStats[0] : homeStats;
    const awayData = Array.isArray(awayStats) ? awayStats[0] : awayStats;
    
    return {
      category: 'Blocks',
      home: {
        team: home.full_name || home.name,
        blocks_per_game: fmtNum(homeData?.blk || homeData?.blocks_per_game, 1)
      },
      away: {
        team: away.full_name || away.name,
        blocks_per_game: fmtNum(awayData?.blk || awayData?.blocks_per_game, 1)
      }
    };
  },

  FG_PCT: async (bdlSport, home, away, season) => {
    const [homeStats, awayStats] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeData = Array.isArray(homeStats) ? homeStats[0] : homeStats;
    const awayData = Array.isArray(awayStats) ? awayStats[0] : awayStats;
    
    return {
      category: 'Field Goal Percentage',
      home: {
        team: home.full_name || home.name,
        fg_pct: fmtPct(homeData?.fg_pct),
        fgm_per_game: fmtNum(homeData?.fgm, 1),
        fga_per_game: fmtNum(homeData?.fga, 1)
      },
      away: {
        team: away.full_name || away.name,
        fg_pct: fmtPct(awayData?.fg_pct),
        fgm_per_game: fmtNum(awayData?.fgm, 1),
        fga_per_game: fmtNum(awayData?.fga, 1)
      }
    };
  },

  // ===== NCAAB-SPECIFIC FETCHERS (Unique Calculations) =====
  // These calculate derived stats to avoid duplicate data
  
  NCAAB_EFG_PCT: async (bdlSport, home, away, season) => {
    const [homeStats, awayStats] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeData = Array.isArray(homeStats) ? homeStats[0] : homeStats;
    const awayData = Array.isArray(awayStats) ? awayStats[0] : awayStats;
    
    // Calculate eFG% = (FGM + 0.5 * FG3M) / FGA
    const calcEfg = (data) => {
      if (!data) return null;
      const fgm = data.fgm || 0;
      const fg3m = data.fg3m || 0;
      const fga = data.fga || 0;
      if (fga === 0) return null;
      return ((fgm + 0.5 * fg3m) / fga * 100).toFixed(1);
    };
    
    return {
      category: 'Effective FG%',
      home: {
        team: home.full_name || home.name,
        efg_pct: calcEfg(homeData) ? `${calcEfg(homeData)}%` : 'N/A'
      },
      away: {
        team: away.full_name || away.name,
        efg_pct: calcEfg(awayData) ? `${calcEfg(awayData)}%` : 'N/A'
      }
    };
  },

  NCAAB_AP_RANKING: async (bdlSport, home, away, season) => {
    try {
      const rankings = await ballDontLieService.getRankingsGeneric(bdlSport, { season });
      const apRankings = rankings?.filter(r => r.poll === 'ap') || [];
      
      const homeRank = apRankings.find(r => r.team?.id === home.id);
      const awayRank = apRankings.find(r => r.team?.id === away.id);
      
      return {
        category: 'AP Poll Ranking',
        home: {
          team: home.full_name || home.name,
          ap_rank: homeRank?.rank || 'Unranked',
          trend: homeRank?.trend || '-',
          record: homeRank?.record || 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          ap_rank: awayRank?.rank || 'Unranked',
          trend: awayRank?.trend || '-',
          record: awayRank?.record || 'N/A'
        }
      };
    } catch (error) {
      console.warn('[Stat Router] AP Ranking fetch failed:', error.message);
      return {
        category: 'AP Poll Ranking',
        home: { team: home.full_name || home.name, ap_rank: 'N/A' },
        away: { team: away.full_name || away.name, ap_rank: 'N/A' }
      };
    }
  },

  NCAAB_COACHES_RANKING: async (bdlSport, home, away, season) => {
    try {
      const rankings = await ballDontLieService.getRankingsGeneric(bdlSport, { season });
      const coachRankings = rankings?.filter(r => r.poll === 'coach') || [];
      
      const homeRank = coachRankings.find(r => r.team?.id === home.id);
      const awayRank = coachRankings.find(r => r.team?.id === away.id);
      
      return {
        category: 'Coaches Poll Ranking',
        home: {
          team: home.full_name || home.name,
          coaches_rank: homeRank?.rank || 'Unranked',
          trend: homeRank?.trend || '-',
          points: homeRank?.points || 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          coaches_rank: awayRank?.rank || 'Unranked',
          trend: awayRank?.trend || '-',
          points: awayRank?.points || 'N/A'
        }
      };
    } catch (error) {
      console.warn('[Stat Router] Coaches Ranking fetch failed:', error.message);
      return {
        category: 'Coaches Poll Ranking',
        home: { team: home.full_name || home.name, coaches_rank: 'N/A' },
        away: { team: away.full_name || away.name, coaches_rank: 'N/A' }
      };
    }
  },

  NCAAB_CONFERENCE_RECORD: async (bdlSport, home, away, season) => {
    try {
      // Some BDL NCAAB team objects may not include a valid conference_id; avoid passing it.
      const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });

      const homeStanding = Array.isArray(standings)
        ? standings.find(s => s.team?.id === home.id)
        : null;
      const awayStanding = Array.isArray(standings)
        ? standings.find(s => s.team?.id === away.id)
        : null;
      
      return {
        category: 'Conference Record',
        home: {
          team: home.full_name || home.name,
          conference_record: homeStanding?.conference_record || 'N/A',
          conference_win_pct: homeStanding?.conference_win_percentage 
            ? `${(homeStanding.conference_win_percentage * 100).toFixed(0)}%` 
            : 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          conference_record: awayStanding?.conference_record || 'N/A',
          conference_win_pct: awayStanding?.conference_win_percentage 
            ? `${(awayStanding.conference_win_percentage * 100).toFixed(0)}%` 
            : 'N/A'
        }
      };
    } catch (error) {
      console.warn('[Stat Router] Conference Record fetch failed:', error.message);
      return {
        category: 'Conference Record',
        home: { team: home.full_name || home.name, conference_record: 'N/A' },
        away: { team: away.full_name || away.name, conference_record: 'N/A' }
      };
    }
  },

  NCAAB_TEMPO: async (bdlSport, home, away, season) => {
    const [homeStats, awayStats] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeData = Array.isArray(homeStats) ? homeStats[0] : homeStats;
    const awayData = Array.isArray(awayStats) ? awayStats[0] : awayStats;
    
    // Calculate possessions per game estimate: FGA + 0.44*FTA - OREB + TOV
    const calcTempo = (data) => {
      if (!data) return null;
      const fga = data.fga || 0;
      const fta = data.fta || 0;
      const oreb = data.oreb || 0;
      const tov = data.turnover || 0;
      const games = data.games_played || 1;
      const possessions = fga + 0.44 * fta - oreb + tov;
      return (possessions / games).toFixed(1);
    };
    
    return {
      category: 'Tempo (Possessions/Game)',
      home: {
        team: home.full_name || home.name,
        tempo: calcTempo(homeData) || 'N/A'
      },
      away: {
        team: away.full_name || away.name,
        tempo: calcTempo(awayData) || 'N/A'
      }
    };
  },

  NCAAB_OFFENSIVE_RATING: async (bdlSport, home, away, season) => {
    const [homeStats, awayStats] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeData = Array.isArray(homeStats) ? homeStats[0] : homeStats;
    const awayData = Array.isArray(awayStats) ? awayStats[0] : awayStats;
    
    // Calculate offensive rating: (Points / Possessions) * 100
    const calcORtg = (data) => {
      if (!data) return null;
      const pts = data.pts || 0;
      const fga = data.fga || 0;
      const fta = data.fta || 0;
      const oreb = data.oreb || 0;
      const tov = data.turnover || 0;
      const possessions = fga + 0.44 * fta - oreb + tov;
      if (possessions === 0) return null;
      return ((pts / possessions) * 100).toFixed(1);
    };
    
    return {
      category: 'Offensive Rating (Pts/100 Poss)',
      home: {
        team: home.full_name || home.name,
        offensive_rating: calcORtg(homeData) || 'N/A'
      },
      away: {
        team: away.full_name || away.name,
        offensive_rating: calcORtg(awayData) || 'N/A'
      }
    };
  },

  // ===== NCAAB GROUNDING-BASED ADVANCED STATS =====
  // These use Gemini Grounding to fetch advanced analytics not available in BDL
  
  NCAAB_KENPOM_RATINGS: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      
      console.log(`[Stat Router] Fetching KenPom ratings for ${awayTeamName} @ ${homeTeamName} via Gemini Grounding`);
      
      const query = `What are the current KenPom ratings for ${homeTeamName} and ${awayTeamName} college basketball teams for the ${getCurrentSeasonString()} season? Include:
        - KenPom ranking
        - Adjusted Efficiency Margin (AdjEM)
        - Adjusted Offensive Efficiency (AdjO)
        - Adjusted Defensive Efficiency (AdjD)
        - Tempo (possessions per 40 minutes)
        
        Provide the exact numbers from kenpom.com. Format as structured data.`;
      
      const response = await geminiGroundingSearch(query, {
        temperature: 0.2,
        maxTokens: 1500,
        systemMessage: 'You are a college basketball analytics expert. Provide accurate KenPom statistics from the current season. Return data in a structured format with exact numbers.'
      });
      
      // Parse the response to extract KenPom data
      const content = response?.content || response?.choices?.[0]?.message?.content || '';
      
      // Try to extract numbers from the response
      const extractKenpomData = (text, teamName) => {
        const teamSection = text.toLowerCase();
        const rankMatch = teamSection.match(new RegExp(`${teamName.toLowerCase()}[^\\d]*(\\d{1,3})(?:st|nd|rd|th)?\\s*(?:rank|kenpom|overall)`, 'i')) ||
                         teamSection.match(/rank[^\d]*(\d{1,3})/i);
        const adjEmMatch = teamSection.match(/adj(?:usted)?\.?\s*(?:efficiency\s*)?(?:margin|em)[^\d-]*([+-]?\d+\.?\d*)/i);
        const adjOMatch = teamSection.match(/adj(?:usted)?\.?\s*(?:offensive|o)[^\d]*(\d+\.?\d*)/i);
        const adjDMatch = teamSection.match(/adj(?:usted)?\.?\s*(?:defensive|d)[^\d]*(\d+\.?\d*)/i);
        const tempoMatch = teamSection.match(/tempo[^\d]*(\d+\.?\d*)/i);
        
        return {
          kenpom_rank: rankMatch ? rankMatch[1] : 'N/A',
          adj_em: adjEmMatch ? adjEmMatch[1] : 'N/A',
          adj_offense: adjOMatch ? adjOMatch[1] : 'N/A',
          adj_defense: adjDMatch ? adjDMatch[1] : 'N/A',
          tempo: tempoMatch ? tempoMatch[1] : 'N/A'
        };
      };
      
      return {
        category: 'KenPom Ratings',
        source: 'kenpom.com via Gemini Grounding',
        home: {
          team: homeTeamName,
          ...extractKenpomData(content, homeTeamName)
        },
        away: {
          team: awayTeamName,
          ...extractKenpomData(content, awayTeamName)
        },
        raw_response: content.substring(0, 1200)
      };
    } catch (error) {
      console.warn('[Stat Router] KenPom fetch failed:', error.message);
      return {
        category: 'KenPom Ratings',
        error: 'KenPom data unavailable',
        home: { team: home.full_name || home.name, kenpom_rank: 'N/A' },
        away: { team: away.full_name || away.name, kenpom_rank: 'N/A' }
      };
    }
  },

  NCAAB_NET_RANKING: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      
      console.log(`[Stat Router] Fetching NET rankings for ${awayTeamName} @ ${homeTeamName} via Gemini Grounding`);
      
      const query = `What are the current NCAA NET rankings for ${homeTeamName} and ${awayTeamName} college basketball teams? Include their NET ranking number and any Quad 1/2/3/4 record information. NET rankings are from ncaa.com and used for NCAA tournament selection.`;
      
      const response = await geminiGroundingSearch(query, {
        temperature: 0.2,
        maxTokens: 1500,
        systemMessage: 'You are a college basketball expert. Provide accurate NET rankings and Quad records from the current season.'
      });
      
      const content = response?.content || response?.choices?.[0]?.message?.content || '';
      
      // Extract NET rankings
      const extractNetRank = (text, teamName) => {
        const regex = new RegExp(`${teamName}[^\\d]*(\\d{1,3})`, 'i');
        const match = text.match(regex) || text.match(/net[^\d]*(\d{1,3})/i);
        return match ? match[1] : 'N/A';
      };
      
      return {
        category: 'NET Ranking',
        source: 'NCAA via Gemini Grounding',
        home: {
          team: homeTeamName,
          net_rank: extractNetRank(content, homeTeamName)
        },
        away: {
          team: awayTeamName,
          net_rank: extractNetRank(content, awayTeamName)
        },
        raw_response: content.substring(0, 1200)
      };
    } catch (error) {
      console.warn('[Stat Router] NET Ranking fetch failed:', error.message);
      return {
        category: 'NET Ranking',
        error: 'NET data unavailable',
        home: { team: home.full_name || home.name, net_rank: 'N/A' },
        away: { team: away.full_name || away.name, net_rank: 'N/A' }
      };
    }
  },

  NCAAB_STRENGTH_OF_SCHEDULE: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      
      console.log(`[Stat Router] Fetching Strength of Schedule for ${awayTeamName} @ ${homeTeamName} via Gemini Grounding`);
      
      const query = `What is the current strength of schedule (SOS) ranking for ${homeTeamName} and ${awayTeamName} college basketball teams in the ${getCurrentSeasonString()} season? Include their SOS rank and any notable wins or losses against ranked teams.`;
      
      const response = await geminiGroundingSearch(query, {
        temperature: 0.2,
        maxTokens: 1500,
        systemMessage: 'You are a college basketball analytics expert. Provide strength of schedule information.'
      });
      
      const content = response?.content || response?.choices?.[0]?.message?.content || '';
      
      // Extract SOS info
      const extractSOS = (text, teamName) => {
        const regex = new RegExp(`${teamName}[^\\d]*(\\d{1,3})(?:st|nd|rd|th)?\\s*(?:sos|strength)`, 'i');
        const match = text.match(regex) || text.match(/(?:sos|strength)[^\d]*(\d{1,3})/i);
        return match ? match[1] : 'N/A';
      };
      
      return {
        category: 'Strength of Schedule',
        source: 'Multiple sources via Gemini Grounding',
        home: {
          team: homeTeamName,
          sos_rank: extractSOS(content, homeTeamName)
        },
        away: {
          team: awayTeamName,
          sos_rank: extractSOS(content, awayTeamName)
        },
        raw_response: content.substring(0, 1200)
      };
    } catch (error) {
      console.warn('[Stat Router] SOS fetch failed:', error.message);
      return {
        category: 'Strength of Schedule',
        error: 'SOS data unavailable',
        home: { team: home.full_name || home.name, sos_rank: 'N/A' },
        away: { team: away.full_name || away.name, sos_rank: 'N/A' }
      };
    }
  },

  NCAAB_QUAD_RECORD: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      
      console.log(`[Stat Router] Fetching Quad records for ${awayTeamName} @ ${homeTeamName} via Gemini Grounding`);
      
      const query = `What are the current Quad 1, Quad 2, Quad 3, and Quad 4 records for ${homeTeamName} and ${awayTeamName} college basketball teams in the ${getCurrentSeasonString()} season? Quad records are based on opponent NET ranking and game location (home/away/neutral). Format as wins-losses for each quad.`;
      
      const response = await geminiGroundingSearch(query, {
        temperature: 0.2,
        maxTokens: 1500,
        systemMessage: 'You are a college basketball expert specializing in NCAA tournament metrics. Provide accurate Quad records.'
      });
      
      const content = response?.content || response?.choices?.[0]?.message?.content || '';
      
      // Extract Quad records
      const extractQuads = (text, teamName) => {
        const q1Match = text.match(/quad\s*1[^\d]*(\d+-\d+)/i);
        const q2Match = text.match(/quad\s*2[^\d]*(\d+-\d+)/i);
        const q3Match = text.match(/quad\s*3[^\d]*(\d+-\d+)/i);
        const q4Match = text.match(/quad\s*4[^\d]*(\d+-\d+)/i);
        
        return {
          quad_1: q1Match ? q1Match[1] : 'N/A',
          quad_2: q2Match ? q2Match[1] : 'N/A',
          quad_3: q3Match ? q3Match[1] : 'N/A',
          quad_4: q4Match ? q4Match[1] : 'N/A'
        };
      };
      
      return {
        category: 'Quad Record (NCAA Tournament Metrics)',
        source: 'NCAA via Gemini Grounding',
        home: {
          team: homeTeamName,
          ...extractQuads(content, homeTeamName)
        },
        away: {
          team: awayTeamName,
          ...extractQuads(content, awayTeamName)
        },
        raw_response: content.substring(0, 1200)
      };
    } catch (error) {
      console.warn('[Stat Router] Quad Record fetch failed:', error.message);
      return {
        category: 'Quad Record',
        error: 'Quad data unavailable',
        home: { team: home.full_name || home.name, quad_1: 'N/A' },
        away: { team: away.full_name || away.name, quad_1: 'N/A' }
      };
    }
  },

  // ===== NCAAB HOME/AWAY SPLITS FROM BDL STANDINGS =====
  // NOTE: BDL requires valid conference_id for NCAAB standings - we skip this to avoid 400 errors
  
  NCAAB_HOME_AWAY_SPLITS: async (bdlSport, home, away, season) => {
    if (bdlSport !== 'basketball_ncaab') return null;
    
    try {
      console.log(`[Stat Router] NCAAB Home/Away Splits - using team season stats (standings API requires conference_id)`);
      
      // BDL standings for NCAAB require conference_id which we don't reliably have
      // Return guidance to use team stats instead
      return {
        category: 'Home/Away Splits (NCAAB)',
        note: '⚠️ NCAAB standings API requires conference_id. Use team season stats for home/away record.',
        home: { team: home.full_name || home.name, suggestion: 'Check TEAM_SEASON_STATS for home/away record' },
        away: { team: away.full_name || away.name, suggestion: 'Check TEAM_SEASON_STATS for home/away record' }
      };
      
      // DISABLED: This causes 400 errors when conference_id is not provided or invalid
      // const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });
      
      const homeStanding = (standings || []).find(s => s.team?.id === home.id);
      const awayStanding = (standings || []).find(s => s.team?.id === away.id);
      
      if (!homeStanding && !awayStanding) {
        return {
          category: 'Home/Away Splits',
          note: 'Standings data not available for these teams',
          home: { team: home.full_name || home.name, home_record: 'N/A', away_record: 'N/A' },
          away: { team: away.full_name || away.name, home_record: 'N/A', away_record: 'N/A' }
        };
      }
      
      return {
        category: 'Home/Away Splits (NCAAB)',
        home: {
          team: home.full_name || home.name,
          overall_record: homeStanding ? `${homeStanding.wins}-${homeStanding.losses}` : 'N/A',
          home_record: homeStanding?.home_record || 'N/A',
          away_record: homeStanding?.away_record || 'N/A',
          conference_record: homeStanding?.conference_record || 'N/A',
          win_pct: homeStanding?.win_percentage ? (homeStanding.win_percentage * 100).toFixed(1) + '%' : 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          overall_record: awayStanding ? `${awayStanding.wins}-${awayStanding.losses}` : 'N/A',
          home_record: awayStanding?.home_record || 'N/A',
          away_record: awayStanding?.away_record || 'N/A',
          conference_record: awayStanding?.conference_record || 'N/A',
          win_pct: awayStanding?.win_percentage ? (awayStanding.win_percentage * 100).toFixed(1) + '%' : 'N/A'
        },
        context: 'Investigate home court advantage for this matchup. Compare home_record vs away_record for each team.'
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAB Home/Away Splits failed:', error.message);
      return {
        category: 'Home/Away Splits',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name, home_record: 'N/A' },
        away: { team: away.full_name || away.name, away_record: 'N/A' }
      };
    }
  },

  NCAAB_RECENT_FORM: async (bdlSport, home, away, season) => {
    if (bdlSport !== 'basketball_ncaab') return null;
    
    try {
      console.log(`[Stat Router] Fetching NCAAB Recent Form with opponent quality`);
      
      // Get last 30 days of games for both teams
      const today = new Date();
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, { 
          team_ids: [home.id], 
          seasons: [season],
          per_page: 50
        }),
        ballDontLieService.getGames(bdlSport, { 
          team_ids: [away.id], 
          seasons: [season],
          per_page: 50
        })
      ]);
      
      // Filter to completed games and get last 5
      const filterCompleted = (games) => (games || [])
        .filter(g => g.status === 'post' || g.period_detail === 'Final')
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5);
      
      const homeL5 = filterCompleted(homeGames);
      const awayL5 = filterCompleted(awayGames);
      
      const analyzeGames = (games, teamId, teamName) => {
        let wins = 0, losses = 0;
        const details = [];
        let totalMargin = 0;
        
        for (const g of games) {
          const isHome = g.home_team?.id === teamId;
          const teamScore = isHome ? g.home_score : g.away_score;
          const oppScore = isHome ? g.away_score : g.home_score;
          const oppName = isHome ? g.visitor_team?.full_name : g.home_team?.full_name;
          const margin = teamScore - oppScore;
          const won = margin > 0;
          
          if (won) wins++;
          else losses++;
          totalMargin += margin;
          
          details.push({
            opponent: oppName || 'Unknown',
            result: won ? 'W' : 'L',
            score: `${teamScore}-${oppScore}`,
            margin: margin,
            location: isHome ? 'HOME' : 'ROAD'
          });
        }
        
        const avgMargin = games.length > 0 ? (totalMargin / games.length).toFixed(1) : 0;
        
        return {
          team: teamName,
          l5_record: `${wins}-${losses}`,
          avg_margin: avgMargin > 0 ? `+${avgMargin}` : avgMargin,
          trend: wins >= 4 ? 'HOT' : wins <= 1 ? 'COLD' : 'MIXED',
          games: details
        };
      };
      
      return {
        category: 'Recent Form L5 (NCAAB)',
        home: analyzeGames(homeL5, home.id, home.full_name || home.name),
        away: analyzeGames(awayL5, away.id, away.full_name || away.name),
        context: 'L5 record with margin and opponent context. Consider: Who did they play? Close games or blowouts?'
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAB Recent Form failed:', error.message);
      return {
        category: 'Recent Form L5',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name, l5_record: 'N/A' },
        away: { team: away.full_name || away.name, l5_record: 'N/A' }
      };
    }
  },

  // ===== NCAAF BDL-BASED STATS (THESE WORK - use team_season_stats) =====
  
  NCAAF_PASSING_OFFENSE: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      console.log(`[Stat Router] Fetching NCAAF Passing Offense for ${awayTeamName} @ ${homeTeamName} via BDL`);
      
      // Fetch team season stats from BDL (note: function expects object with teamId, season)
      const [homeStatsArr, awayStatsArr] = await Promise.all([
        ballDontLieService.getTeamSeasonStats('americanfootball_ncaaf', { teamId: home.id, season }),
        ballDontLieService.getTeamSeasonStats('americanfootball_ncaaf', { teamId: away.id, season })
      ]);
      
      // BDL returns an array - extract first item
      const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
      const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
      
      return {
        category: 'Passing Offense',
        source: 'Ball Don\'t Lie',
        home: {
          team: homeTeamName,
          passing_yards: homeStats?.passing_yards || 'N/A',
          passing_ypg: homeStats?.passing_yards_per_game?.toFixed(1) || 'N/A',
          passing_tds: homeStats?.passing_touchdowns || 'N/A',
          passing_ints: homeStats?.passing_interceptions || 'N/A'
        },
        away: {
          team: awayTeamName,
          passing_yards: awayStats?.passing_yards || 'N/A',
          passing_ypg: awayStats?.passing_yards_per_game?.toFixed(1) || 'N/A',
          passing_tds: awayStats?.passing_touchdowns || 'N/A',
          passing_ints: awayStats?.passing_interceptions || 'N/A'
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAF Passing Offense fetch failed:', error.message);
      return { error: error.message, home: { team: home.full_name }, away: { team: away.full_name } };
    }
  },

  NCAAF_RUSHING_OFFENSE: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      console.log(`[Stat Router] Fetching NCAAF Rushing Offense for ${awayTeamName} @ ${homeTeamName} via BDL`);
      
      const [homeStatsArr, awayStatsArr] = await Promise.all([
        ballDontLieService.getTeamSeasonStats('americanfootball_ncaaf', { teamId: home.id, season }),
        ballDontLieService.getTeamSeasonStats('americanfootball_ncaaf', { teamId: away.id, season })
      ]);
      
      // BDL returns an array - extract first item
      const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
      const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
      
      return {
        category: 'Rushing Offense',
        source: 'Ball Don\'t Lie',
        home: {
          team: homeTeamName,
          rushing_yards: homeStats?.rushing_yards || 'N/A',
          rushing_ypg: homeStats?.rushing_yards_per_game?.toFixed(1) || 'N/A',
          rushing_tds: homeStats?.rushing_touchdowns || 'N/A'
        },
        away: {
          team: awayTeamName,
          rushing_yards: awayStats?.rushing_yards || 'N/A',
          rushing_ypg: awayStats?.rushing_yards_per_game?.toFixed(1) || 'N/A',
          rushing_tds: awayStats?.rushing_touchdowns || 'N/A'
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAF Rushing Offense fetch failed:', error.message);
      return { error: error.message, home: { team: home.full_name }, away: { team: away.full_name } };
    }
  },

  NCAAF_TOTAL_OFFENSE: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      console.log(`[Stat Router] Fetching NCAAF Total Offense for ${awayTeamName} @ ${homeTeamName} via BDL`);
      
      const [homeStatsArr, awayStatsArr] = await Promise.all([
        ballDontLieService.getTeamSeasonStats('americanfootball_ncaaf', { teamId: home.id, season }),
        ballDontLieService.getTeamSeasonStats('americanfootball_ncaaf', { teamId: away.id, season })
      ]);
      
      // BDL returns an array - extract first item
      const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
      const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
      
      const homeTotalYds = (homeStats?.passing_yards || 0) + (homeStats?.rushing_yards || 0);
      const awayTotalYds = (awayStats?.passing_yards || 0) + (awayStats?.rushing_yards || 0);
      const homeTotalYpg = ((homeStats?.passing_yards_per_game || 0) + (homeStats?.rushing_yards_per_game || 0));
      const awayTotalYpg = ((awayStats?.passing_yards_per_game || 0) + (awayStats?.rushing_yards_per_game || 0));
      
      return {
        category: 'Total Offense',
        source: 'Ball Don\'t Lie',
        home: {
          team: homeTeamName,
          total_yards: homeTotalYds || 'N/A',
          total_ypg: homeTotalYpg?.toFixed(1) || 'N/A',
          passing_ypg: homeStats?.passing_yards_per_game?.toFixed(1) || 'N/A',
          rushing_ypg: homeStats?.rushing_yards_per_game?.toFixed(1) || 'N/A'
        },
        away: {
          team: awayTeamName,
          total_yards: awayTotalYds || 'N/A',
          total_ypg: awayTotalYpg?.toFixed(1) || 'N/A',
          passing_ypg: awayStats?.passing_yards_per_game?.toFixed(1) || 'N/A',
          rushing_ypg: awayStats?.rushing_yards_per_game?.toFixed(1) || 'N/A'
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAF Total Offense fetch failed:', error.message);
      return { error: error.message, home: { team: home.full_name }, away: { team: away.full_name } };
    }
  },

  NCAAF_DEFENSE: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      console.log(`[Stat Router] Fetching NCAAF Defense for ${awayTeamName} @ ${homeTeamName} via BDL`);
      
      const [homeStatsArr, awayStatsArr] = await Promise.all([
        ballDontLieService.getTeamSeasonStats('americanfootball_ncaaf', { teamId: home.id, season }),
        ballDontLieService.getTeamSeasonStats('americanfootball_ncaaf', { teamId: away.id, season })
      ]);
      
      // BDL returns an array - extract first item
      const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
      const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
      
      return {
        category: 'Defense (Yards Allowed)',
        source: 'Ball Don\'t Lie',
        home: {
          team: homeTeamName,
          opp_passing_yards: homeStats?.opp_passing_yards || 'N/A',
          opp_rushing_yards: homeStats?.opp_rushing_yards || 'N/A',
          opp_total_yards: ((homeStats?.opp_passing_yards || 0) + (homeStats?.opp_rushing_yards || 0)) || 'N/A'
        },
        away: {
          team: awayTeamName,
          opp_passing_yards: awayStats?.opp_passing_yards || 'N/A',
          opp_rushing_yards: awayStats?.opp_rushing_yards || 'N/A',
          opp_total_yards: ((awayStats?.opp_passing_yards || 0) + (awayStats?.opp_rushing_yards || 0)) || 'N/A'
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAF Defense fetch failed:', error.message);
      return { error: error.message, home: { team: home.full_name }, away: { team: away.full_name } };
    }
  },

  NCAAF_SCORING: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      console.log(`[Stat Router] Fetching NCAAF Scoring for ${awayTeamName} @ ${homeTeamName} via BDL`);
      
      const [homeStatsArr, awayStatsArr] = await Promise.all([
        ballDontLieService.getTeamSeasonStats('americanfootball_ncaaf', { teamId: home.id, season }),
        ballDontLieService.getTeamSeasonStats('americanfootball_ncaaf', { teamId: away.id, season })
      ]);
      
      // BDL returns an array - extract first item
      const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
      const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
      
      // Calculate TDs from passing + rushing (approximate scoring)
      const homeTotalTds = (homeStats?.passing_touchdowns || 0) + (homeStats?.rushing_touchdowns || 0);
      const awayTotalTds = (awayStats?.passing_touchdowns || 0) + (awayStats?.rushing_touchdowns || 0);
      
      return {
        category: 'Scoring (Touchdowns)',
        source: 'Ball Don\'t Lie',
        home: {
          team: homeTeamName,
          passing_tds: homeStats?.passing_touchdowns || 'N/A',
          rushing_tds: homeStats?.rushing_touchdowns || 'N/A',
          total_tds: homeTotalTds || 'N/A'
        },
        away: {
          team: awayTeamName,
          passing_tds: awayStats?.passing_touchdowns || 'N/A',
          rushing_tds: awayStats?.rushing_touchdowns || 'N/A',
          total_tds: awayTotalTds || 'N/A'
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAF Scoring fetch failed:', error.message);
      return { error: error.message, home: { team: home.full_name }, away: { team: away.full_name } };
    }
  },

  NCAAF_TURNOVER_MARGIN: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      console.log(`[Stat Router] Fetching NCAAF Turnover Data for ${awayTeamName} @ ${homeTeamName} via BDL`);
      
      const [homeStatsArr, awayStatsArr] = await Promise.all([
        ballDontLieService.getTeamSeasonStats('americanfootball_ncaaf', { teamId: home.id, season }),
        ballDontLieService.getTeamSeasonStats('americanfootball_ncaaf', { teamId: away.id, season })
      ]);
      
      // BDL returns an array - extract first item
      const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
      const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
      
      return {
        category: 'Turnovers',
        source: 'Ball Don\'t Lie',
        home: {
          team: homeTeamName,
          interceptions_thrown: homeStats?.passing_interceptions || 'N/A'
        },
        away: {
          team: awayTeamName,
          interceptions_thrown: awayStats?.passing_interceptions || 'N/A'
        }
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAF Turnover fetch failed:', error.message);
      return { error: error.message, home: { team: home.full_name }, away: { team: away.full_name } };
    }
  },

  // ===== LEGACY NCAAF TOKENS (DEPRECATED) =====
  // These are kept for backwards compatibility but return N/A
  // Advanced analytics are now provided via Gemini Grounding in Scout Report
  
  NCAAF_STRENGTH_OF_SCHEDULE: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      const seasonStr = getCurrentSeasonString();
      
      console.log(`[Stat Router] Fetching NCAAF SOS for ${awayTeamName} @ ${homeTeamName} via Gemini Grounding`);
      
      const query = `What are the current Strength of Schedule (SOS) rankings for ${homeTeamName} and ${awayTeamName} college football teams as of TODAY, ${today} (for the ${seasonStr} season)? 
      
      For each team provide:
      1. SOS ranking (out of 134 FBS teams)
      2. Opponent win percentage
      3. Number of opponents that made bowl games
      4. Record vs Power 4 conference opponents (Big Ten, SEC, ACC, Big 12)
      5. Record vs Group of 5 opponents
      
      SOS data for the ${seasonStr} season.`;
      
      const response = await geminiGroundingSearch(query, {
        temperature: 0.2,
        maxTokens: 1500,
        systemMessage: 'You are a college football analytics expert. Provide accurate Strength of Schedule data. Be specific about Power 4 vs Group of 5 opponent breakdowns.'
      });
      
      const content = response?.content || response?.data || response?.choices?.[0]?.message?.content || '';
      
      // Extract SOS data
      const extractSOS = (text, teamName) => {
        const teamSection = text.toLowerCase();
        const sosRankMatch = teamSection.match(new RegExp(`${teamName.toLowerCase()}[^\\d]*(\\d{1,3})(?:st|nd|rd|th)?\\s*(?:sos|strength)`, 'i')) ||
                           teamSection.match(/(?:sos|strength)[^\d]*#?(\d{1,3})/i);
        const oppWinPctMatch = text.match(/opponent.*?(\d{1,3}(?:\.\d+)?)\s*%/i);
        const p4RecordMatch = text.match(/power\s*(?:4|four)[^\d]*(\d+-\d+)/i);
        const g5RecordMatch = text.match(/group\s*(?:of\s*)?(?:5|five)[^\d]*(\d+-\d+)/i);
        
        return {
          sos_rank: sosRankMatch ? sosRankMatch[1] : 'N/A',
          opponent_win_pct: oppWinPctMatch ? `${oppWinPctMatch[1]}%` : 'N/A',
          vs_power_4: p4RecordMatch ? p4RecordMatch[1] : 'N/A',
          vs_group_5: g5RecordMatch ? g5RecordMatch[1] : 'N/A'
        };
      };
      
      return {
        category: 'Strength of Schedule (CFP Context)',
        source: 'ESPN FPI, Sagarin via Gemini Grounding',
        home: {
          team: homeTeamName,
          ...extractSOS(content, homeTeamName)
        },
        away: {
          team: awayTeamName,
          ...extractSOS(content, awayTeamName)
        },
        raw_response: content.substring(0, 1200)
      };
    } catch (error) {
      console.warn('[Stat Router] NCAAF SOS fetch failed:', error.message);
      return {
        category: 'Strength of Schedule',
        error: 'SOS data unavailable',
        home: { team: home.full_name || home.name, sos_rank: 'N/A' },
        away: { team: away.full_name || away.name, sos_rank: 'N/A' }
      };
    }
  },

  NCAAF_OPPONENT_ADJUSTED: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      const seasonStr = getCurrentSeasonString();
      
      console.log(`[Stat Router] Fetching Opponent-Adjusted Ratings for ${awayTeamName} @ ${homeTeamName} via Gemini Grounding`);
      
      const query = `What are the current opponent-adjusted ratings for ${homeTeamName} and ${awayTeamName} college football teams as of TODAY, ${today}? 
      
      Provide for each team for the ${seasonStr} season:
      1. ESPN FPI (Football Power Index) rating and rank
      2. SP+ overall, offense, and defense ratings
      3. Sagarin rating (if available)
      4. Success Rate (% of plays that count as successful)
      5. Expected Points Added (EPA) per play on offense and defense
      
      These metrics must be for the ${seasonStr} season.`;
      
      const response = await geminiGroundingSearch(query, {
        temperature: 0.2,
        maxTokens: 1500,
        systemMessage: 'You are a college football analytics expert specializing in advanced metrics. Provide accurate opponent-adjusted ratings. FPI, SP+, and EPA are opponent-adjusted metrics that are more predictive than raw stats.'
      });
      
      const content = response?.content || response?.data || response?.choices?.[0]?.message?.content || '';
      
      // Extract ratings
      const extractRatings = (text, teamName) => {
        const fpiMatch = text.match(new RegExp(`${teamName}[^\\d]*(?:fpi)[^\\d]*([+-]?\\d+\\.?\\d*)`, 'i')) ||
                        text.match(/fpi[^\d]*([+-]?\d+\.?\d*)/i);
        const fpiRankMatch = text.match(new RegExp(`${teamName}[^\\d]*(?:fpi)[^\\d]*#?(\\d{1,3})(?:st|nd|rd|th)?`, 'i'));
        const spPlusMatch = text.match(/sp\+[^\d]*([+-]?\d+\.?\d*)/i);
        const successRateMatch = text.match(/success\s*rate[^\d]*(\d+\.?\d*)\s*%/i);
        const epaMatch = text.match(/epa[^\d]*([+-]?\d+\.?\d*)/i);
        
        return {
          fpi_rating: fpiMatch ? fpiMatch[1] : 'N/A',
          fpi_rank: fpiRankMatch ? fpiRankMatch[1] : 'N/A',
          sp_plus: spPlusMatch ? spPlusMatch[1] : 'N/A',
          success_rate: successRateMatch ? `${successRateMatch[1]}%` : 'N/A',
          epa_per_play: epaMatch ? epaMatch[1] : 'N/A'
        };
      };
      
      return {
        category: 'Opponent-Adjusted Ratings (FPI/SP+)',
        source: 'ESPN FPI, SP+ via Gemini Grounding',
        note: 'These metrics adjust for opponent quality - critical for P4 vs G5 matchups',
        home: {
          team: homeTeamName,
          ...extractRatings(content, homeTeamName)
        },
        away: {
          team: awayTeamName,
          ...extractRatings(content, awayTeamName)
        },
        raw_response: content.substring(0, 1200)
      };
    } catch (error) {
      console.warn('[Stat Router] Opponent-Adjusted Ratings fetch failed:', error.message);
      return {
        category: 'Opponent-Adjusted Ratings',
        error: 'Ratings unavailable',
        home: { team: home.full_name || home.name, fpi_rating: 'N/A' },
        away: { team: away.full_name || away.name, fpi_rating: 'N/A' }
      };
    }
  },

  NCAAF_CONFERENCE_STRENGTH: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      const seasonStr = getCurrentSeasonString();
      
      console.log(`[Stat Router] Fetching Conference Strength for ${awayTeamName} @ ${homeTeamName} via Gemini Grounding`);
      
      const query = `Provide conference context for ${homeTeamName} vs ${awayTeamName} college football matchup as of TODAY, ${today}:
      
      For each team tell me for the ${seasonStr} season:
      1. Conference name (Big Ten, SEC, Sun Belt, etc.)
      2. Conference tier: Power 4 (Big Ten, SEC, ACC, Big 12) or Group of 5 (AAC, Sun Belt, MAC, MW, CUSA)
      3. Conference overall strength ranking (1-11)
      4. Team's conference record this season
      5. Average SP+ rating of their conference opponents
      6. Bowl eligibility % of conference teams
      
      CRITICAL: This is essential for CFP analysis for the ${seasonStr} season.`;
      
      const response = await geminiGroundingSearch(query, {
        temperature: 0.2,
        maxTokens: 1500,
        systemMessage: 'You are a college football expert. Provide detailed conference context. Clearly distinguish between Power 4 and Group of 5 conferences.'
      });
      
      const content = response?.content || response?.data || response?.choices?.[0]?.message?.content || '';
      
      // Extract conference data
      const extractConfData = (text, teamName) => {
        const confMatch = text.match(new RegExp(`${teamName}[^(]*(Big\\s*Ten|SEC|ACC|Big\\s*12|AAC|Sun\\s*Belt|MAC|Mountain\\s*West|Conference\\s*USA)`, 'i'));
        const tierMatch = text.toLowerCase().includes('power 4') || text.toLowerCase().includes('power four') || 
                         ['big ten', 'sec', 'acc', 'big 12'].some(c => text.toLowerCase().includes(c));
        const confRecordMatch = text.match(/conference[^\d]*(\d+-\d+)/i);
        
        return {
          conference: confMatch ? confMatch[1] : 'Unknown',
          tier: tierMatch ? 'Power 4' : 'Group of 5',
          conf_record: confRecordMatch ? confRecordMatch[1] : 'N/A'
        };
      };
      
      return {
        category: 'Conference Strength Analysis',
        source: 'Multiple sources via Gemini Grounding',
        cfp_note: 'Power 4 conferences have significantly higher average talent composites',
        home: {
          team: homeTeamName,
          ...extractConfData(content, homeTeamName)
        },
        away: {
          team: awayTeamName,
          ...extractConfData(content, awayTeamName)
        },
        raw_response: content.substring(0, 1200)
      };
    } catch (error) {
      console.warn('[Stat Router] Conference Strength fetch failed:', error.message);
      return {
        category: 'Conference Strength',
        error: 'Conference data unavailable',
        home: { team: home.full_name || home.name, conference: 'Unknown' },
        away: { team: away.full_name || away.name, conference: 'Unknown' }
      };
    }
  },

  NCAAF_VS_POWER_OPPONENTS: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      const seasonStr = getCurrentSeasonString();
      
      console.log(`[Stat Router] Fetching vs Power Opponents data for ${awayTeamName} @ ${homeTeamName} via Gemini Grounding`);
      
      const query = `How have ${homeTeamName} and ${awayTeamName} performed against Power 4 (Big Ten, SEC, ACC, Big 12) opponents as of TODAY, ${today} (for the ${seasonStr} season)?
      
      For each team provide:
      1. Record vs Power 4 opponents
      2. Points per game vs Power 4 opponents
      3. Points allowed vs Power 4 opponents  
      4. Total yards per game vs Power 4 opponents
      5. Best win vs Power 4 opponent
      6. Worst loss vs Power 4 opponent
      
      If a team hasn't played Power 4 opponents, note this as "NO P4 GAMES" - this is a major red flag for CFP analysis.`;
      
      const response = await geminiGroundingSearch(query, {
        temperature: 0.2,
        maxTokens: 1500,
        systemMessage: 'You are a college football expert. Focus on performance against Power 4 teams. If a team has zero P4 games, emphasize this limitation.'
      });
      
      const content = response?.content || response?.data || response?.choices?.[0]?.message?.content || '';
      
      // Extract P4 performance
      const extractP4Data = (text, teamName) => {
        const recordMatch = text.match(/power\s*(?:4|four)[^\d]*(\d+-\d+)/i) ||
                          text.match(new RegExp(`${teamName}[^\\d]*(\\d+-\\d+)[^\\d]*(?:vs|against)`, 'i'));
        const ppgMatch = text.match(/(\d+\.?\d*)\s*(?:points|ppg)[^\\d]*(?:vs|against)?\s*power/i);
        const noP4 = text.toLowerCase().includes('no power 4') || text.toLowerCase().includes('no p4') ||
                    text.toLowerCase().includes('zero power') || text.toLowerCase().includes('hasn\'t played');
        
        return {
          vs_power_4_record: noP4 ? 'NO P4 GAMES' : (recordMatch ? recordMatch[1] : 'N/A'),
          ppg_vs_p4: ppgMatch ? ppgMatch[1] : 'N/A',
          power_4_tested: !noP4
        };
      };
      
      return {
        category: 'Performance vs Power 4 Opponents',
        source: 'Gemini Grounding analysis',
        cfp_note: 'This is the most predictive metric for CFP games - G5 teams often struggle vs P4 talent',
        home: {
          team: homeTeamName,
          ...extractP4Data(content, homeTeamName)
        },
        away: {
          team: awayTeamName,
          ...extractP4Data(content, awayTeamName)
        },
        raw_response: content.substring(0, 1200)
      };
    } catch (error) {
      console.warn('[Stat Router] vs Power Opponents fetch failed:', error.message);
      return {
        category: 'vs Power Opponents',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name, vs_power_4_record: 'N/A' },
        away: { team: away.full_name || away.name, vs_power_4_record: 'N/A' }
      };
    }
  },

  NCAAF_TRAVEL_FATIGUE: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      
      console.log(`[Stat Router] Fetching Travel/Fatigue data for ${awayTeamName} @ ${homeTeamName}`);
      
      const query = `What is the travel situation for ${awayTeamName} traveling to play ${homeTeamName} in college football?
      
      Provide:
      1. Distance the away team is traveling (in miles)
      2. Time zones crossed
      3. Away team's road record this season
      4. Historical performance after traveling 1000+ miles
      5. Days rest since last game for each team
      6. Environment change (e.g., East Coast team going to Pacific time, warm weather team going to cold)
      
      Travel fatigue can be a factor - investigate how this specific team performs after significant travel.`;
      
      const response = await geminiGroundingSearch(query, {
        temperature: 0.2,
        maxTokens: 1500,
        systemMessage: 'You are a sports analyst. Provide travel and rest analysis for college football games.'
      });
      
      const content = response?.content || response?.data || response?.choices?.[0]?.message?.content || '';
      
      // Extract travel data
      const distanceMatch = content.match(/(\d{1,4}(?:,\d{3})?)\s*(?:miles?|mi)/i);
      const timeZonesMatch = content.match(/(\d+)\s*time\s*zone/i);
      const roadRecordMatch = content.match(/road[^\d]*(\d+-\d+)/i);
      
      return {
        category: 'Travel & Fatigue Analysis',
        source: 'Gemini Grounding analysis',
        betting_note: 'Travel fatigue can be a factor - investigate this team\'s road performance',
        distance_miles: distanceMatch ? distanceMatch[1].replace(',', '') : 'N/A',
        time_zones_crossed: timeZonesMatch ? timeZonesMatch[1] : 'N/A',
        away_road_record: roadRecordMatch ? roadRecordMatch[1] : 'N/A',
        raw_response: content.substring(0, 1200)
      };
    } catch (error) {
      console.warn('[Stat Router] Travel Fatigue fetch failed:', error.message);
      return {
        category: 'Travel Analysis',
        error: 'Travel data unavailable'
      };
    }
  },

  // ===== NCAAF ADVANCED ANALYTICS (via Gemini Grounding since BDL lacks these) =====
  
  NCAAF_SP_PLUS: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      const seasonStr = getCurrentSeasonString();
      
      console.log(`[Stat Router] Fetching SP+ ratings for ${awayTeamName} @ ${homeTeamName} via Gemini Grounding`);
      
      const query = `Provide the current SP+ ratings (Bill Connelly's opponent-adjusted efficiency metrics) for ${homeTeamName} and ${awayTeamName} as of TODAY, ${today} (for the ${seasonStr} season).
      
      For each team provide:
      1. Overall SP+ rating and national rank
      2. SP+ Offense rating and rank
      3. SP+ Defense rating and rank
      4. SP+ Special Teams rating and rank
      5. Projected point margin for this specific matchup based on SP+
      
      Ensure ratings are for the ${seasonStr} season.`;
      
      const response = await geminiGroundingSearch(query, {
        temperature: 0.2,
        maxTokens: 1500,
        systemMessage: 'You are a college football analytics expert. Provide SP+ ratings from Bill Connelly. Be specific with numbers and rankings.'
      });
      
      const content = response?.content || response?.data || response?.choices?.[0]?.message?.content || '';
      
      const extractSPPlus = (text, teamName) => {
        const overallMatch = text.match(new RegExp(`${teamName}[^\\d]*([+-]?\\d+\\.?\\d*)\\s*(?:sp\\+|overall)`, 'i')) ||
                           text.match(/sp\+[^\d]*([+-]?\d+\.?\d*)/i);
        const offenseMatch = text.match(/(?:offense|off)[^\d]*([+-]?\d+\.?\d*)/i);
        const defenseMatch = text.match(/(?:defense|def)[^\d]*([+-]?\d+\.?\d*)/i);
        const rankMatch = text.match(/#?(\d{1,3})(?:st|nd|rd|th)?\s*(?:in|nationally|overall)/i);
        
        return {
          sp_plus_overall: overallMatch ? overallMatch[1] : 'N/A',
          sp_plus_offense: offenseMatch ? offenseMatch[1] : 'N/A',
          sp_plus_defense: defenseMatch ? defenseMatch[1] : 'N/A',
          sp_plus_rank: rankMatch ? rankMatch[1] : 'N/A'
        };
      };
      
      return {
        category: 'SP+ Ratings (Opponent-Adjusted Efficiency)',
        source: 'ESPN SP+ via Gemini Grounding',
        note: 'SP+ accounts for opponent strength and is more predictive than raw stats',
        home: {
          team: homeTeamName,
          ...extractSPPlus(content, homeTeamName)
        },
        away: {
          team: awayTeamName,
          ...extractSPPlus(content, awayTeamName)
        },
        raw_response: content.substring(0, 1200)
      };
    } catch (error) {
      console.warn('[Stat Router] SP+ fetch failed:', error.message);
      return {
        category: 'SP+ Ratings',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name, sp_plus_overall: 'N/A' },
        away: { team: away.full_name || away.name, sp_plus_overall: 'N/A' }
      };
    }
  },

  NCAAF_FPI: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      const seasonStr = getCurrentSeasonString();
      
      console.log(`[Stat Router] Fetching ESPN FPI for ${awayTeamName} @ ${homeTeamName}`);
      
      const query = `What are the ESPN Football Power Index (FPI) ratings for ${homeTeamName} and ${awayTeamName} college football teams as of TODAY, ${today} (for the ${seasonStr} season)?
      
      For each team provide:
      1. FPI rating (e.g., +15.2) and national rank
      2. Offensive efficiency rating and rank
      3. Defensive efficiency rating and rank
      4. FPI Projected Win Probability for this specific matchup
      5. FPI Projected point spread for this matchup
      
      FPI is ESPN's predictive rating system for the ${seasonStr} season.`;
      
      const response = await geminiGroundingSearch(query, {
        temperature: 0.2,
        maxTokens: 1500,
        systemMessage: 'You are a college football analytics expert. Provide ESPN FPI data with specific numbers.'
      });
      
      const content = response?.content || response?.data || response?.choices?.[0]?.message?.content || '';
      
      const extractFPI = (text, teamName) => {
        const fpiMatch = text.match(new RegExp(`${teamName}[^\\d]*(?:fpi)?[^\\d]*([+-]?\\d+\\.?\\d*)`, 'i')) ||
                        text.match(/fpi[^\d]*([+-]?\d+\.?\d*)/i);
        const rankMatch = text.match(new RegExp(`${teamName}[^#]*#?(\\d{1,3})`, 'i'));
        
        return {
          fpi_rating: fpiMatch ? fpiMatch[1] : 'N/A',
          fpi_rank: rankMatch ? rankMatch[1] : 'N/A'
        };
      };
      
      // Extract win probability
      const winProbMatch = content.match(/(\d{1,2}(?:\.\d)?)\s*%?\s*(?:win|probability|chance)/i);
      const spreadMatch = content.match(/(?:spread|line)[^\d]*([+-]?\d+\.?\d*)/i);
      
      return {
        category: 'ESPN FPI (Football Power Index)',
        source: 'ESPN via Gemini Grounding',
        predicted_spread: spreadMatch ? spreadMatch[1] : 'N/A',
        home: {
          team: homeTeamName,
          ...extractFPI(content, homeTeamName)
        },
        away: {
          team: awayTeamName,
          ...extractFPI(content, awayTeamName)
        },
        raw_response: content.substring(0, 1200)
      };
    } catch (error) {
      console.warn('[Stat Router] FPI fetch failed:', error.message);
      return {
        category: 'ESPN FPI',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name, fpi_rating: 'N/A' },
        away: { team: away.full_name || away.name, fpi_rating: 'N/A' }
      };
    }
  },

  NCAAF_EPA_ADVANCED: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      const seasonStr = getCurrentSeasonString();
      
      console.log(`[Stat Router] Fetching EPA (Expected Points Added) for ${awayTeamName} @ ${homeTeamName}`);
      
      const query = `What are the Expected Points Added (EPA) metrics for ${homeTeamName} and ${awayTeamName} college football teams as of TODAY, ${today} (for the ${seasonStr} season)?
      
      For each team provide:
      1. EPA per play on offense (national rank)
      2. EPA per play allowed on defense (national rank)
      3. Success rate (offense and defense)
      4. EPA per rush and EPA per pass
      5. Havoc rate allowed (offense)
      
      EPA data for the ${seasonStr} season.`;
      
      const response = await geminiGroundingSearch(query, {
        temperature: 0.2,
        maxTokens: 1500,
        systemMessage: 'You are a college football analytics expert. EPA is a critical advanced metric. Provide specific numbers.'
      });
      
      const content = response?.content || response?.data || response?.choices?.[0]?.message?.content || '';
      
      const extractEPA = (text, teamName) => {
        const epaOffMatch = text.match(/(?:offense|off)[^\d]*epa[^\d]*([+-]?\d+\.?\d*)/i) ||
                          text.match(/epa[^\d]*(?:per play)?[^\d]*([+-]?\d+\.?\d*)/i);
        const epaDefMatch = text.match(/(?:defense|def)[^\d]*epa[^\d]*([+-]?\d+\.?\d*)/i);
        const successMatch = text.match(/success[^\d]*(\d+\.?\d*)\s*%/i);
        
        return {
          epa_offense: epaOffMatch ? epaOffMatch[1] : 'N/A',
          epa_defense: epaDefMatch ? epaDefMatch[1] : 'N/A',
          success_rate: successMatch ? `${successMatch[1]}%` : 'N/A'
        };
      };
      
      return {
        category: 'EPA (Expected Points Added)',
        source: 'Gemini Grounding',
        note: 'EPA measures efficiency better than yards. Positive = good offense, negative = good defense',
        home: {
          team: homeTeamName,
          ...extractEPA(content, homeTeamName)
        },
        away: {
          team: awayTeamName,
          ...extractEPA(content, awayTeamName)
        },
        raw_response: content.substring(0, 1200)
      };
    } catch (error) {
      console.warn('[Stat Router] EPA fetch failed:', error.message);
      return {
        category: 'EPA',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name, epa_offense: 'N/A' },
        away: { team: away.full_name || away.name, epa_offense: 'N/A' }
      };
    }
  },

  NCAAF_HAVOC_RATE: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      const seasonStr = getCurrentSeasonString();
      
      console.log(`[Stat Router] Fetching Havoc Rate for ${awayTeamName} @ ${homeTeamName}`);
      
      const query = `Provide Havoc rate and defensive disruption stats for ${homeTeamName} and ${awayTeamName} as of TODAY, ${today}.
      
      For each team provide:
      1. Defensive Havoc Rate (% of plays resulting in TFL, sack, FF, INT, or PBU)
      2. Front Seven Havoc Rate vs DB Havoc Rate
      3. Tackles for Loss (TFL) per game and national rank
      4. Sacks per game and national rank
      5. Pressure Rate and Forced Turnover stats
      
      Focus on stats from the current ${seasonStr} season.`;
      
      const response = await geminiGroundingSearch(query, {
        temperature: 0.2,
        maxTokens: 1500,
        systemMessage: 'You are a college football analytics expert. Havoc rate is crucial for upset potential. Provide specific numbers.'
      });
      
      const content = response?.content || response?.data || response?.choices?.[0]?.message?.content || '';
      
      const extractHavoc = (text, teamName) => {
        const havocMatch = text.match(/havoc[^\d]*(\d+\.?\d*)\s*%/i);
        const tflMatch = text.match(/(?:tfl|tackles for loss)[^\d]*(\d+\.?\d*)/i);
        const sacksMatch = text.match(/sacks?[^\d]*(\d+\.?\d*)/i);
        const turnoversMatch = text.match(/turnovers?[^\d]*(\d+)/i);
        const marginMatch = text.match(/(?:turnover)?\s*margin[^\d]*([+-]?\d+)/i);
        
        return {
          havoc_rate: havocMatch ? `${havocMatch[1]}%` : 'N/A',
          tfl_per_game: tflMatch ? tflMatch[1] : 'N/A',
          sacks_per_game: sacksMatch ? sacksMatch[1] : 'N/A',
          turnovers_forced: turnoversMatch ? turnoversMatch[1] : 'N/A',
          turnover_margin: marginMatch ? marginMatch[1] : 'N/A'
        };
      };
      
      return {
        category: 'Havoc Rate & Disruption',
        source: 'Gemini Grounding',
        note: 'High havoc teams create chaos - critical for G5 teams vs P4 opponents',
        home: {
          team: homeTeamName,
          ...extractHavoc(content, homeTeamName)
        },
        away: {
          team: awayTeamName,
          ...extractHavoc(content, awayTeamName)
        },
        raw_response: content.substring(0, 1200)
      };
    } catch (error) {
      console.warn('[Stat Router] Havoc Rate fetch failed:', error.message);
      return {
        category: 'Havoc Rate',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name, havoc_rate: 'N/A' },
        away: { team: away.full_name || away.name, havoc_rate: 'N/A' }
      };
    }
  },

  NCAAF_EXPLOSIVENESS: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      const seasonStr = getCurrentSeasonString();
      
      console.log(`[Stat Router] Fetching Explosiveness for ${awayTeamName} @ ${homeTeamName}`);
      
      const query = `What are the explosiveness and big play metrics for ${homeTeamName} and ${awayTeamName} as of TODAY, ${today}?
      
      For each team provide:
      1. Explosive Play Rate (plays of 20+ yards per game)
      2. Plays of 30+ yards and 50+ yards this season
      3. Isolated Points Per Play (IsoPPP) on explosive plays
      4. Explosive plays allowed on defense (national rank)
      5. Big play potential comparison for this matchup
      
      Focus on ${seasonStr} season data.`;
      
      const response = await geminiGroundingSearch(query, {
        temperature: 0.2,
        maxTokens: 1500,
        systemMessage: 'You are a college football analytics expert. Big play ability is a key separator in talent mismatches.'
      });
      
      const content = response?.content || response?.data || response?.choices?.[0]?.message?.content || '';
      
      const extractExplosive = (text, teamName) => {
        const explosiveMatch = text.match(/(\d+\.?\d*)\s*(?:explosive|big)\s*plays?/i);
        const plus20Match = text.match(/20\+[^\d]*(\d+)/i);
        const plus30Match = text.match(/30\+[^\d]*(\d+)/i);
        
        return {
          explosive_plays_per_game: explosiveMatch ? explosiveMatch[1] : 'N/A',
          plays_20_plus: plus20Match ? plus20Match[1] : 'N/A',
          plays_30_plus: plus30Match ? plus30Match[1] : 'N/A'
        };
      };
      
      return {
        category: 'Explosiveness & Big Play Potential',
        source: 'Gemini Grounding',
        note: 'Big play ability can separate teams - investigate explosive play potential for both sides',
        home: {
          team: homeTeamName,
          ...extractExplosive(content, homeTeamName)
        },
        away: {
          team: awayTeamName,
          ...extractExplosive(content, awayTeamName)
        },
        raw_response: content.substring(0, 1200)
      };
    } catch (error) {
      console.warn('[Stat Router] Explosiveness fetch failed:', error.message);
      return {
        category: 'Explosiveness',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name, explosive_plays_per_game: 'N/A' },
        away: { team: away.full_name || away.name, explosive_plays_per_game: 'N/A' }
      };
    }
  },

  NCAAF_RUSHING_EFFICIENCY: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      const seasonStr = getCurrentSeasonString();
      
      console.log(`[Stat Router] Fetching Rushing Efficiency for ${awayTeamName} @ ${homeTeamName}`);
      
      const query = `Provide opponent-adjusted rushing efficiency metrics for ${homeTeamName} and ${awayTeamName} as of TODAY, ${today}.
      
      For each team provide:
      1. Rushing Success Rate (% of runs with positive EPA)
      2. Yards Per Carry (YPC) and Stuff Rate allowed
      3. Offensive Line Yards per carry
      4. Defensive Rushing Success Rate allowed
      5. Defensive Stuff Rate (runs stopped at/behind LOS)
      
      Focus on ${seasonStr} season data.`;
      
      const response = await geminiGroundingSearch(query, {
        temperature: 0.2,
        maxTokens: 1500,
        systemMessage: 'You are a college football analytics expert. Rushing efficiency is key in bowl games.'
      });
      
      const content = response?.content || response?.data || response?.choices?.[0]?.message?.content || '';
      
      const extractRush = (text, teamName) => {
        const ypgMatch = text.match(/(\d{2,3}\.?\d*)\s*(?:rushing|rush)\s*(?:yards?|ypg)/i) ||
                        text.match(/rush[^\d]*(\d{2,3}\.?\d*)\s*(?:yards?|ypg)/i);
        const ypcMatch = text.match(/(\d\.?\d*)\s*(?:yards?\s*per\s*carry|ypc)/i);
        const stuffMatch = text.match(/stuff[^\d]*(\d+\.?\d*)\s*%/i);
        
        return {
          rush_ypg: ypgMatch ? ypgMatch[1] : 'N/A',
          yards_per_carry: ypcMatch ? ypcMatch[1] : 'N/A',
          stuff_rate: stuffMatch ? `${stuffMatch[1]}%` : 'N/A'
        };
      };
      
      return {
        category: 'Rushing Efficiency',
        source: 'Gemini Grounding',
        note: 'Controlling the line of scrimmage is critical in CFP games',
        home: {
          team: homeTeamName,
          ...extractRush(content, homeTeamName)
        },
        away: {
          team: awayTeamName,
          ...extractRush(content, awayTeamName)
        },
        raw_response: content.substring(0, 1200)
      };
    } catch (error) {
      console.warn('[Stat Router] Rushing Efficiency fetch failed:', error.message);
      return {
        category: 'Rushing Efficiency',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name, rush_ypg: 'N/A' },
        away: { team: away.full_name || away.name, rush_ypg: 'N/A' }
      };
    }
  },

  NCAAF_PASSING_EFFICIENCY: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      const seasonStr = getCurrentSeasonString();
      
      console.log(`[Stat Router] Fetching Passing Efficiency for ${awayTeamName} @ ${homeTeamName}`);
      
      const query = `Provide opponent-adjusted passing efficiency metrics for ${homeTeamName} and ${awayTeamName} as of TODAY, ${today}.
      
      For each team provide:
      1. Passing Success Rate (% of passes with positive EPA)
      2. Yards Per Attempt (YPA) and Completion Percentage
      3. QB Rating and TD/INT ratio
      4. Defensive Passing Success Rate allowed
      5. Pressure Rate allowed (offense) and Sack rate
      
      Focus on stats from the current ${seasonStr} season.`;
      
      const response = await geminiGroundingSearch(query, {
        temperature: 0.2,
        maxTokens: 1500,
        systemMessage: 'You are a college football analytics expert. QB efficiency metrics are critical for CFP analysis.'
      });
      
      const content = response?.content || response?.data || response?.choices?.[0]?.message?.content || '';
      
      const extractPass = (text, teamName) => {
        const ypgMatch = text.match(/(\d{2,3}\.?\d*)\s*(?:passing|pass)\s*(?:yards?|ypg)/i);
        const compMatch = text.match(/(\d+\.?\d*)\s*%?\s*(?:completion|comp)/i);
        const ypaMatch = text.match(/(\d\.?\d*)\s*(?:yards?\s*per\s*attempt|ypa)/i);
        const ratingMatch = text.match(/(?:qb\s*)?rating[^\d]*(\d+\.?\d*)/i);
        
        return {
          pass_ypg: ypgMatch ? ypgMatch[1] : 'N/A',
          completion_pct: compMatch ? `${compMatch[1]}%` : 'N/A',
          yards_per_attempt: ypaMatch ? ypaMatch[1] : 'N/A',
          qb_rating: ratingMatch ? ratingMatch[1] : 'N/A'
        };
      };
      
      return {
        category: 'Passing Efficiency',
        source: 'Gemini Grounding',
        note: 'QB play is the great separator in CFP games',
        home: {
          team: homeTeamName,
          ...extractPass(content, homeTeamName)
        },
        away: {
          team: awayTeamName,
          ...extractPass(content, awayTeamName)
        },
        raw_response: content.substring(0, 1200)
      };
    } catch (error) {
      console.warn('[Stat Router] Passing Efficiency fetch failed:', error.message);
      return {
        category: 'Passing Efficiency',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name, pass_ypg: 'N/A' },
        away: { team: away.full_name || away.name, pass_ypg: 'N/A' }
      };
    }
  },

  NCAAF_RED_ZONE: async (bdlSport, home, away, season) => {
    try {
      const homeTeamName = home.full_name || home.name;
      const awayTeamName = away.full_name || away.name;
      const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      const seasonStr = getCurrentSeasonString();
      
      console.log(`[Stat Router] Fetching Red Zone Efficiency for ${awayTeamName} @ ${homeTeamName}`);
      
      const query = `Provide red zone efficiency metrics for ${homeTeamName} and ${awayTeamName} as of TODAY, ${today} (for the ${seasonStr} season).
      
      For each team provide:
      1. Red Zone Scoring Percentage (offense) and national rank
      2. Red Zone TD Percentage (offense) - crucial for separated quality
      3. Points per Red Zone trip
      4. Defensive Red Zone Scoring % allowed
      5. Defensive Red Zone TD % allowed
      
      Focus on ${seasonStr} season data.`;
      
      const response = await geminiGroundingSearch(query, {
        temperature: 0.2,
        maxTokens: 1500,
        systemMessage: 'You are a college football analytics expert. Red zone efficiency is critical in close CFP games.'
      });
      
      const content = response?.content || response?.data || response?.choices?.[0]?.message?.content || '';
      
      const extractRedZone = (text, teamName) => {
        const scoringMatch = text.match(/red\s*zone[^\d]*(\d+\.?\d*)\s*%/i);
        const tdMatch = text.match(/(?:td|touchdown)[^\d]*(\d+\.?\d*)\s*%/i);
        
        return {
          rz_scoring_pct: scoringMatch ? `${scoringMatch[1]}%` : 'N/A',
          rz_td_pct: tdMatch ? `${tdMatch[1]}%` : 'N/A'
        };
      };
      
      return {
        category: 'Red Zone Efficiency',
        source: 'Gemini Grounding',
        note: 'Converting in the red zone is crucial for CFP games decided by small margins',
        home: {
          team: homeTeamName,
          ...extractRedZone(content, homeTeamName)
        },
        away: {
          team: awayTeamName,
          ...extractRedZone(content, awayTeamName)
        },
        raw_response: content.substring(0, 1200)
      };
    } catch (error) {
      console.warn('[Stat Router] Red Zone fetch failed:', error.message);
      return {
        category: 'Red Zone',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name, rz_scoring_pct: 'N/A' },
        away: { team: away.full_name || away.name, rz_scoring_pct: 'N/A' }
      };
    }
  },

  // ===== PLAYERS =====
  TOP_PLAYERS: async (bdlSport, home, away, season) => {
    // For NBA, use player-aggregated base stats which includes top_players
    if (bdlSport === 'basketball_nba') {
      const [homeStats, awayStats] = await Promise.all([
        fetchNBATeamBaseStats(home.id, season),
        fetchNBATeamBaseStats(away.id, season)
      ]);
      
      return {
        category: 'Top Players',
        home: {
          team: home.full_name || home.name,
          players: homeStats?.top_players || [{ note: 'No player data' }]
        },
        away: {
          team: away.full_name || away.name,
          players: awayStats?.top_players || [{ note: 'No player data' }]
        }
      };
    }
    
    // For other sports, use the generic fetcher
    const [homePlayers, awayPlayers] = await Promise.all([
      fetchTopPlayersForTeam(bdlSport, home, season),
      fetchTopPlayersForTeam(bdlSport, away, season)
    ]);
    
    return {
      category: 'Top Players',
      home: {
        team: home.full_name || home.name,
        players: homePlayers
      },
      away: {
        team: away.full_name || away.name,
        players: awayPlayers
      }
    };
  },
  
  INJURIES: async (bdlSport, home, away) => {
    const teamIds = [home.id, away.id];
    const injuries = await ballDontLieService.getInjuriesGeneric(bdlSport, { team_ids: teamIds });
    
    const homeInjuries = injuries?.filter(i => 
      i.player?.team?.id === home.id || i.team_id === home.id
    ) || [];
    const awayInjuries = injuries?.filter(i => 
      i.player?.team?.id === away.id || i.team_id === away.id
    ) || [];
    
    return {
      category: 'Injuries',
      home: {
        team: home.full_name || home.name,
        injuries: homeInjuries.map(i => ({
          player: `${i.player?.first_name} ${i.player?.last_name}`,
          position: i.player?.position,
          status: i.status,
          comment: i.comment?.slice(0, 100)
        }))
      },
      away: {
        team: away.full_name || away.name,
        injuries: awayInjuries.map(i => ({
          player: `${i.player?.first_name} ${i.player?.last_name}`,
          position: i.player?.position,
          status: i.status,
          comment: i.comment?.slice(0, 100)
        }))
      }
    };
  },

  // ===== STANDINGS & RECORDS =====
  // ===== STANDINGS & RECORDS =====
  STANDINGS: async (bdlSport, home, away, season) => {
    const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });
    
    const homeSt = standings?.find(s => s.team?.id === home.id);
    const awaySt = standings?.find(s => s.team?.id === away.id);
    
    return {
      category: 'Full Standings & Records',
      source: 'Ball Don\'t Lie API',
      home: {
        team: home.full_name || home.name,
        wins: homeSt?.wins || 'N/A',
        losses: homeSt?.losses || 'N/A',
        overall_record: `${homeSt?.wins || 0}-${homeSt?.losses || 0}`,
        home_record: homeSt?.home_record || 'N/A',
        away_record: homeSt?.road_record || 'N/A',
        conference_record: homeSt?.conference_record || 'N/A',
        conference_rank: homeSt?.conference_rank || 'N/A',
        division_record: homeSt?.division_record || 'N/A',
        division_rank: homeSt?.division_rank || 'N/A'
      },
      away: {
        team: away.full_name || away.name,
        wins: awaySt?.wins || 'N/A',
        losses: awaySt?.losses || 'N/A',
        overall_record: `${awaySt?.wins || 0}-${awaySt?.losses || 0}`,
        home_record: awaySt?.home_record || 'N/A',
        away_record: awaySt?.road_record || 'N/A',
        conference_record: awaySt?.conference_record || 'N/A',
        conference_rank: awaySt?.conference_rank || 'N/A',
        division_record: awaySt?.division_record || 'N/A',
        division_rank: awaySt?.division_rank || 'N/A'
      },
      context: homeSt && awaySt ? 
        `${home.name} (${homeSt.wins}-${homeSt.losses}, #${homeSt.conference_rank} in conf) vs ${away.name} (${awaySt.wins}-${awaySt.losses}, #${awaySt.conference_rank} in conf)` :
        'Standings comparison unavailable'
    };
  },
  
  TEAM_RECORD: async (bdlSport, home, away, season) => {
    // Alias for STANDINGS
    return FETCHERS.STANDINGS(bdlSport, home, away, season);
  },
  
  CONFERENCE_STANDING: async (bdlSport, home, away, season) => {
    // Alias for STANDINGS
    return FETCHERS.STANDINGS(bdlSport, home, away, season);
  },
  
  HOME_AWAY_SPLITS: async (bdlSport, home, away, season) => {
    // NCAAF/NCAAB standings require conference_id - skip to avoid 400 errors
    // For college sports, return N/A (RECENT_FORM provides game-by-game context)
    if (bdlSport === 'americanfootball_ncaaf' || bdlSport === 'basketball_ncaab') {
      return {
        category: 'Home/Away Splits',
        note: 'College sports home/away splits unavailable via BDL standings - use RECENT_FORM for game context',
        home: { team: home.full_name || home.name, overall: 'N/A', home_record: 'N/A', away_record: 'N/A' },
        away: { team: away.full_name || away.name, overall: 'N/A', home_record: 'N/A', away_record: 'N/A' }
      };
    }
    
    const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });
    
    const homeSt = standings?.find(s => s.team?.id === home.id);
    const awaySt = standings?.find(s => s.team?.id === away.id);
    
    return {
      category: 'Home/Away Splits',
      home: {
        team: home.full_name || home.name,
        overall: homeSt ? `${homeSt.wins}-${homeSt.losses}` : 'N/A',
        home_record: homeSt?.home_record || 'N/A',
        away_record: homeSt?.road_record || 'N/A'
      },
      away: {
        team: away.full_name || away.name,
        overall: awaySt ? `${awaySt.wins}-${awaySt.losses}` : 'N/A',
        home_record: awaySt?.home_record || 'N/A',
        away_record: awaySt?.road_record || 'N/A'
      }
    };
  },

  // ===== RECENT FORM (ENHANCED) =====
  // Now includes margin analysis, opponent quality, and narrative context
  RECENT_FORM: async (bdlSport, home, away, season) => {
    const homeName = home.full_name || home.name || 'Home';
    const awayName = away.full_name || away.name || 'Away';
    console.log(`[Stat Router] Fetching ENHANCED RECENT_FORM for ${awayName} @ ${homeName} (${bdlSport})`);
    
    // NFL uses seasons[] and team_ids[], not date ranges
    const isNFL = bdlSport === 'americanfootball_nfl';
    const isNCAA = bdlSport === 'americanfootball_ncaaf' || bdlSport === 'basketball_ncaab';
    const isNBA = bdlSport === 'basketball_nba';
    const isNHL = bdlSport === 'icehockey_nhl';
    
    let params;
    if (isNFL || isNCAA) {
      // For football, use season filter - get all games this season (need 10+ for L10)
      params = {
        seasons: [season],
        per_page: 25 // Get more games to ensure we have enough for L10
      };
    } else {
      // For other sports (NBA, NHL), use date range - extend to 45 days to capture L10
      const today = new Date();
      const fortyFiveDaysAgo = new Date(today.getTime() - 45 * 24 * 60 * 60 * 1000);
      params = {
        start_date: fortyFiveDaysAgo.toISOString().split('T')[0],
        end_date: today.toISOString().split('T')[0],
        per_page: 25 // Need more for L10
      };
    }
    
    try {
      // Fetch games AND standings in parallel for opponent quality analysis
      const [homeGames, awayGames, standings] = await Promise.all([
        ballDontLieService.getGames(bdlSport, { team_ids: [home.id], ...params }),
        ballDontLieService.getGames(bdlSport, { team_ids: [away.id], ...params }),
        // Fetch standings to assess opponent quality
        (isNFL || isNBA || isNHL) ? ballDontLieService.getStandingsGeneric(bdlSport, { season }) : Promise.resolve([])
      ]);
      
      console.log(`[Stat Router] Got ${homeGames?.length || 0} games for ${homeName}, ${awayGames?.length || 0} for ${awayName}, ${standings?.length || 0} standings`);
      
      // Build standings map for quick opponent lookup
      const standingsMap = new Map();
      if (standings && standings.length > 0) {
        for (const s of standings) {
          const teamId = s.team?.id;
          if (teamId) {
            standingsMap.set(teamId, {
              overall_record: s.overall_record || `${s.wins || 0}-${s.losses || 0}`,
              wins: s.wins || 0,
              losses: s.losses || 0,
              point_differential: s.point_differential || 0
            });
          }
        }
        console.log(`[Stat Router] Built standings map with ${standingsMap.size} teams for opponent quality lookup`);
      }
      
      // Sort by date descending (most recent first)
      const sortByDate = (a, b) => new Date(b.date) - new Date(a.date);
      const sortedHomeGames = (homeGames || []).sort(sortByDate);
      const sortedAwayGames = (awayGames || []).sort(sortByDate);
      
      // Pass standings map for enhanced analysis
      const homeForm = formatRecentGames(sortedHomeGames, homeName, standingsMap);
      const awayForm = formatRecentGames(sortedAwayGames, awayName, standingsMap);
      
      return {
        category: 'Recent Form - L5 + L10 Analysis',
        home: {
          team: home.full_name || home.name,
          ...homeForm
        },
        away: {
          team: away.full_name || away.name,
          ...awayForm
        },
        IMPORTANT: '⚠️ These are VERIFIED game results from BDL with MARGIN, OPPONENT QUALITY, and TREND analysis.',
        HOW_TO_USE: `
📊 L5 vs L10 COMPARISON:
   - L5 shows CURRENT form (last 5 games)
   - L10 shows EXTENDED form (last 10 games)
   - Compare L5 win% to L10 win% to see if team is TRENDING UP, DOWN, or STABLE
   - A team 2-3 in L5 but 6-4 in L10 = concerning recent slide
   - A team 4-1 in L5 but 5-5 in L10 = recent surge worth investigating
        `.trim(),
        INVESTIGATE_THE_WHY: `
🔍 Before assuming a streak continues, ask:
   - WHO did they play? (Check opponent records in each game)
   - HOW did they lose/win? (Close games ≤7 pts vs Blowouts 14+ pts)
   - A team 1-4 with 3 close losses to playoff teams is NOT "in freefall"
   - A team 4-1 with 3 close wins over weak teams - investigate sustainability
        `.trim(),
        note: 'If Scout Report grounding has more recent data, prefer that for accuracy.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching recent form:`, error.message);
      return {
        category: 'Recent Form',
        home: { team: home.full_name || home.name, record: 'N/A', note: 'Data unavailable' },
        away: { team: away.full_name || away.name, record: 'N/A', note: 'Data unavailable' },
        WARNING: '⚠️ Recent form data unavailable. Check Scout Report grounding for this information. DO NOT guess records.'
      };
    }
  },

  // ===== QUARTER SCORING TRENDS (NFL) =====
  // Shows Q1, Q2, Q3, Q4 scoring breakdown - fast starters vs closers
  QUARTER_SCORING: async (bdlSport, home, away, season) => {
    const homeName = home.full_name || home.name || 'Home';
    const awayName = away.full_name || away.name || 'Away';
    console.log(`[Stat Router] Fetching QUARTER_SCORING for ${awayName} @ ${homeName} (${bdlSport})`);
    
    try {
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, { team_ids: [home.id], seasons: [season], per_page: 20 }),
        ballDontLieService.getGames(bdlSport, { team_ids: [away.id], seasons: [season], per_page: 20 })
      ]);
      
      // Filter to completed games only - using case-insensitive status check
      const completedHomeGames = (homeGames || []).filter(g => isGameCompleted(g.status));
      const completedAwayGames = (awayGames || []).filter(g => isGameCompleted(g.status));
      
      const calcQuarterStats = (games, teamId, teamName) => {
        if (!games || games.length === 0) return null;
        
        let q1Scored = 0, q2Scored = 0, q3Scored = 0, q4Scored = 0;
        let q1Allowed = 0, q2Allowed = 0, q3Allowed = 0, q4Allowed = 0;
        let gamesWithQuarters = 0;
        
        for (const game of games) {
          const isHome = (game.home_team?.id || game.home_team_id) === teamId;
          
          // Get quarter scores based on whether team is home or away
          const teamQ1 = isHome ? game.home_team_q1 : game.visitor_team_q1;
          const teamQ2 = isHome ? game.home_team_q2 : game.visitor_team_q2;
          const teamQ3 = isHome ? game.home_team_q3 : game.visitor_team_q3;
          const teamQ4 = isHome ? game.home_team_q4 : game.visitor_team_q4;
          
          const oppQ1 = isHome ? game.visitor_team_q1 : game.home_team_q1;
          const oppQ2 = isHome ? game.visitor_team_q2 : game.home_team_q2;
          const oppQ3 = isHome ? game.visitor_team_q3 : game.home_team_q3;
          const oppQ4 = isHome ? game.visitor_team_q4 : game.home_team_q4;
          
          // Only count games with quarter data
          if (teamQ1 !== null && teamQ2 !== null && teamQ3 !== null && teamQ4 !== null) {
            q1Scored += teamQ1 || 0;
            q2Scored += teamQ2 || 0;
            q3Scored += teamQ3 || 0;
            q4Scored += teamQ4 || 0;
            q1Allowed += oppQ1 || 0;
            q2Allowed += oppQ2 || 0;
            q3Allowed += oppQ3 || 0;
            q4Allowed += oppQ4 || 0;
            gamesWithQuarters++;
          }
        }
        
        if (gamesWithQuarters === 0) return null;
        
        const avgQ1 = (q1Scored / gamesWithQuarters).toFixed(1);
        const avgQ2 = (q2Scored / gamesWithQuarters).toFixed(1);
        const avgQ3 = (q3Scored / gamesWithQuarters).toFixed(1);
        const avgQ4 = (q4Scored / gamesWithQuarters).toFixed(1);
        const avg1H = ((q1Scored + q2Scored) / gamesWithQuarters).toFixed(1);
        const avg2H = ((q3Scored + q4Scored) / gamesWithQuarters).toFixed(1);
        
        const avgQ1Allowed = (q1Allowed / gamesWithQuarters).toFixed(1);
        const avgQ2Allowed = (q2Allowed / gamesWithQuarters).toFixed(1);
        const avgQ3Allowed = (q3Allowed / gamesWithQuarters).toFixed(1);
        const avgQ4Allowed = (q4Allowed / gamesWithQuarters).toFixed(1);
        
        // Determine team profile
        const q1Diff = parseFloat(avgQ1) - parseFloat(avgQ1Allowed);
        const q4Diff = parseFloat(avgQ4) - parseFloat(avgQ4Allowed);
        const firstHalfDiff = parseFloat(avg1H) - ((parseFloat(avgQ1Allowed) + parseFloat(avgQ2Allowed)));
        const secondHalfDiff = parseFloat(avg2H) - ((parseFloat(avgQ3Allowed) + parseFloat(avgQ4Allowed)));
        
        let profile = [];
        if (q1Diff >= 3) profile.push('FAST STARTER (+' + q1Diff.toFixed(1) + ' Q1)');
        if (q1Diff <= -3) profile.push('SLOW STARTER (' + q1Diff.toFixed(1) + ' Q1)');
        if (q4Diff >= 3) profile.push('STRONG CLOSER (+' + q4Diff.toFixed(1) + ' Q4)');
        if (q4Diff <= -3) profile.push('FADES LATE (' + q4Diff.toFixed(1) + ' Q4)');
        if (secondHalfDiff - firstHalfDiff >= 5) profile.push('SECOND HALF TEAM');
        if (firstHalfDiff - secondHalfDiff >= 5) profile.push('FIRST HALF TEAM');
        
        return {
          team: teamName,
          games_analyzed: gamesWithQuarters,
          scoring: { Q1: avgQ1, Q2: avgQ2, Q3: avgQ3, Q4: avgQ4, '1H': avg1H, '2H': avg2H },
          allowed: { Q1: avgQ1Allowed, Q2: avgQ2Allowed, Q3: avgQ3Allowed, Q4: avgQ4Allowed },
          differential: { Q1: q1Diff.toFixed(1), Q4: q4Diff.toFixed(1), '1H': firstHalfDiff.toFixed(1), '2H': secondHalfDiff.toFixed(1) },
          profile: profile.length > 0 ? profile.join(', ') : 'BALANCED'
        };
      };
      
      return {
        category: 'Quarter-by-Quarter Scoring Trends',
        home: calcQuarterStats(completedHomeGames, home.id, homeName),
        away: calcQuarterStats(completedAwayGames, away.id, awayName),
        insight: 'Use this to identify fast starters vs slow starters, and closers vs faders. Key for 1H/2H betting angles.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching QUARTER_SCORING:`, error.message);
      return { category: 'Quarter Scoring', error: 'Data unavailable' };
    }
  },

  // ===== FIRST HALF TRENDS =====
  // Teams that start hot vs cold - halftime lead %
  FIRST_HALF_TRENDS: async (bdlSport, home, away, season) => {
    const homeName = home.full_name || home.name || 'Home';
    const awayName = away.full_name || away.name || 'Away';
    console.log(`[Stat Router] Fetching FIRST_HALF_TRENDS for ${awayName} @ ${homeName} (${bdlSport})`);
    
    try {
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, { team_ids: [home.id], seasons: [season], per_page: 20 }),
        ballDontLieService.getGames(bdlSport, { team_ids: [away.id], seasons: [season], per_page: 20 })
      ]);
      
      const completedHomeGames = (homeGames || []).filter(g => g.status === 'Final' || g.status === 'final');
      const completedAwayGames = (awayGames || []).filter(g => g.status === 'Final' || g.status === 'final');
      
      const calcFirstHalfStats = (games, teamId, teamName) => {
        if (!games || games.length === 0) return null;
        
        let leadingAtHalf = 0, trailingAtHalf = 0, tiedAtHalf = 0;
        let totalFirstHalfScored = 0, totalFirstHalfAllowed = 0;
        let winsWhenLeading = 0, winsWhenTrailing = 0;
        let gamesWithData = 0;
        
        for (const game of games) {
          const isHome = (game.home_team?.id || game.home_team_id) === teamId;
          
          const teamQ1 = isHome ? game.home_team_q1 : game.visitor_team_q1;
          const teamQ2 = isHome ? game.home_team_q2 : game.visitor_team_q2;
          const oppQ1 = isHome ? game.visitor_team_q1 : game.home_team_q1;
          const oppQ2 = isHome ? game.visitor_team_q2 : game.home_team_q2;
          
          const teamFinal = isHome ? game.home_team_score : game.visitor_team_score;
          const oppFinal = isHome ? game.visitor_team_score : game.home_team_score;
          
          if (teamQ1 !== null && teamQ2 !== null && oppQ1 !== null && oppQ2 !== null) {
            const team1H = (teamQ1 || 0) + (teamQ2 || 0);
            const opp1H = (oppQ1 || 0) + (oppQ2 || 0);
            
            totalFirstHalfScored += team1H;
            totalFirstHalfAllowed += opp1H;
            gamesWithData++;
            
            const won = teamFinal > oppFinal;
            
            if (team1H > opp1H) {
              leadingAtHalf++;
              if (won) winsWhenLeading++;
            } else if (team1H < opp1H) {
              trailingAtHalf++;
              if (won) winsWhenTrailing++;
            } else {
              tiedAtHalf++;
            }
          }
        }
        
        if (gamesWithData === 0) return null;
        
        const avg1HScored = (totalFirstHalfScored / gamesWithData).toFixed(1);
        const avg1HAllowed = (totalFirstHalfAllowed / gamesWithData).toFixed(1);
        const leadPct = ((leadingAtHalf / gamesWithData) * 100).toFixed(0);
        const closeRate = leadingAtHalf > 0 ? ((winsWhenLeading / leadingAtHalf) * 100).toFixed(0) : 'N/A';
        const comebackRate = trailingAtHalf > 0 ? ((winsWhenTrailing / trailingAtHalf) * 100).toFixed(0) : 'N/A';
        
        return {
          team: teamName,
          games_analyzed: gamesWithData,
          avg_1H_scored: avg1HScored,
          avg_1H_allowed: avg1HAllowed,
          leading_at_half: `${leadingAtHalf}/${gamesWithData} (${leadPct}%)`,
          trailing_at_half: `${trailingAtHalf}/${gamesWithData}`,
          close_out_rate: closeRate !== 'N/A' ? `${closeRate}% when leading at half` : 'N/A',
          comeback_rate: comebackRate !== 'N/A' ? `${comebackRate}% when trailing at half` : 'N/A'
        };
      };
      
      return {
        category: 'First Half Scoring Trends',
        home: calcFirstHalfStats(completedHomeGames, home.id, homeName),
        away: calcFirstHalfStats(completedAwayGames, away.id, awayName),
        insight: 'Shows which team starts faster and their close-out rate when leading at halftime.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching FIRST_HALF_TRENDS:`, error.message);
      return { category: 'First Half Trends', error: 'Data unavailable' };
    }
  },

  // ===== SECOND HALF TRENDS =====
  // Closers vs faders - 4th quarter dominance
  SECOND_HALF_TRENDS: async (bdlSport, home, away, season) => {
    const homeName = home.full_name || home.name || 'Home';
    const awayName = away.full_name || away.name || 'Away';
    console.log(`[Stat Router] Fetching SECOND_HALF_TRENDS for ${awayName} @ ${homeName} (${bdlSport})`);
    
    try {
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, { team_ids: [home.id], seasons: [season], per_page: 20 }),
        ballDontLieService.getGames(bdlSport, { team_ids: [away.id], seasons: [season], per_page: 20 })
      ]);
      
      const completedHomeGames = (homeGames || []).filter(g => g.status === 'Final' || g.status === 'final');
      const completedAwayGames = (awayGames || []).filter(g => g.status === 'Final' || g.status === 'final');
      
      const calcSecondHalfStats = (games, teamId, teamName) => {
        if (!games || games.length === 0) return null;
        
        let total2HScored = 0, total2HAllowed = 0;
        let totalQ4Scored = 0, totalQ4Allowed = 0;
        let won2ndHalf = 0, lost2ndHalf = 0;
        let wonQ4 = 0, lostQ4 = 0;
        let gamesWithData = 0;
        
        for (const game of games) {
          const isHome = (game.home_team?.id || game.home_team_id) === teamId;
          
          const teamQ3 = isHome ? game.home_team_q3 : game.visitor_team_q3;
          const teamQ4 = isHome ? game.home_team_q4 : game.visitor_team_q4;
          const oppQ3 = isHome ? game.visitor_team_q3 : game.home_team_q3;
          const oppQ4 = isHome ? game.visitor_team_q4 : game.home_team_q4;
          
          if (teamQ3 !== null && teamQ4 !== null && oppQ3 !== null && oppQ4 !== null) {
            const team2H = (teamQ3 || 0) + (teamQ4 || 0);
            const opp2H = (oppQ3 || 0) + (oppQ4 || 0);
            const teamQ4Score = teamQ4 || 0;
            const oppQ4Score = oppQ4 || 0;
            
            total2HScored += team2H;
            total2HAllowed += opp2H;
            totalQ4Scored += teamQ4Score;
            totalQ4Allowed += oppQ4Score;
            gamesWithData++;
            
            if (team2H > opp2H) won2ndHalf++;
            else if (team2H < opp2H) lost2ndHalf++;
            
            if (teamQ4Score > oppQ4Score) wonQ4++;
            else if (teamQ4Score < oppQ4Score) lostQ4++;
          }
        }
        
        if (gamesWithData === 0) return null;
        
        const avg2HScored = (total2HScored / gamesWithData).toFixed(1);
        const avg2HAllowed = (total2HAllowed / gamesWithData).toFixed(1);
        const avgQ4Scored = (totalQ4Scored / gamesWithData).toFixed(1);
        const avgQ4Allowed = (totalQ4Allowed / gamesWithData).toFixed(1);
        const q4Diff = (totalQ4Scored - totalQ4Allowed) / gamesWithData;
        
        let closerProfile = 'NEUTRAL';
        if (q4Diff >= 3) closerProfile = 'STRONG CLOSER';
        else if (q4Diff >= 1.5) closerProfile = 'SOLID CLOSER';
        else if (q4Diff <= -3) closerProfile = 'FADES LATE';
        else if (q4Diff <= -1.5) closerProfile = 'STRUGGLES TO CLOSE';
        
        return {
          team: teamName,
          games_analyzed: gamesWithData,
          avg_2H_scored: avg2HScored,
          avg_2H_allowed: avg2HAllowed,
          avg_Q4_scored: avgQ4Scored,
          avg_Q4_allowed: avgQ4Allowed,
          Q4_differential: q4Diff >= 0 ? `+${q4Diff.toFixed(1)}` : q4Diff.toFixed(1),
          won_2nd_half: `${won2ndHalf}/${gamesWithData}`,
          won_Q4: `${wonQ4}/${gamesWithData}`,
          closer_profile: closerProfile
        };
      };
      
      return {
        category: 'Second Half & 4th Quarter Trends',
        home: calcSecondHalfStats(completedHomeGames, home.id, homeName),
        away: calcSecondHalfStats(completedAwayGames, away.id, awayName),
        insight: 'Shows which team closes games better. Critical for live betting and late-game situations.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching SECOND_HALF_TRENDS:`, error.message);
      return { category: 'Second Half Trends', error: 'Data unavailable' };
    }
  },

  // ===== HEAD-TO-HEAD HISTORY =====
  H2H_HISTORY: async (bdlSport, home, away, season) => {
    const homeName = home.full_name || home.name || 'Home';
    const awayName = away.full_name || away.name || 'Away';
    console.log(`[Stat Router] Fetching H2H_HISTORY for ${awayName} @ ${homeName} (${bdlSport})`);
    
    // Helper: Extract personnel notes from box score data
    const extractPersonnelNote = (boxScore, homeTeamId, awayTeamId) => {
      try {
        if (!boxScore || !boxScore.home_team_stats || !boxScore.away_team_stats) {
          return null;
        }
        
        // Get top scorer from each team
        const homeStats = boxScore.home_team_stats || [];
        const awayStats = boxScore.away_team_stats || [];
        
        // Sort by points to find top performers
        const homeTop = [...homeStats].sort((a, b) => (b.pts || 0) - (a.pts || 0))[0];
        const awayTop = [...awayStats].sort((a, b) => (b.pts || 0) - (a.pts || 0))[0];
        
        // Find any key players who DNP (0 minutes or not in stats)
        const homeDnp = homeStats.filter(p => (p.min === '0:00' || p.min === 0 || p.min === '00:00') && p.player?.first_name);
        const awayDnp = awayStats.filter(p => (p.min === '0:00' || p.min === 0 || p.min === '00:00') && p.player?.first_name);
        
        let note = 'Key: ';
        if (homeTop?.player) {
          const name = `${homeTop.player.first_name?.[0] || ''}. ${homeTop.player.last_name || 'Unknown'}`;
          note += `${name} ${homeTop.pts || 0}pts/${homeTop.min || '?'}min`;
        }
        if (awayTop?.player) {
          const name = `${awayTop.player.first_name?.[0] || ''}. ${awayTop.player.last_name || 'Unknown'}`;
          note += `; ${name} ${awayTop.pts || 0}pts/${awayTop.min || '?'}min`;
        }
        
        // Add DNP notes for key players (if any)
        const dnpNotes = [];
        if (homeDnp.length > 0) {
          const dnpNames = homeDnp.slice(0, 2).map(p => `${p.player?.last_name || 'Unknown'}`).join(', ');
          dnpNotes.push(`${dnpNames} DNP`);
        }
        if (awayDnp.length > 0) {
          const dnpNames = awayDnp.slice(0, 2).map(p => `${p.player?.last_name || 'Unknown'}`).join(', ');
          dnpNotes.push(`${dnpNames} DNP`);
        }
        
        if (dnpNotes.length > 0) {
          note += ` | ${dnpNotes.join('; ')}`;
        }
        
        return note;
      } catch (e) {
        console.log(`[Stat Router] Error extracting personnel note: ${e.message}`);
        return null;
      }
    };
    
    try {
      // Calculate dynamic season - NFL/NCAAF: Aug-Feb spans years
      // If season not provided, calculate based on current date
      let currentSeason = season;
      if (!currentSeason) {
        const month = new Date().getMonth() + 1;
        const year = new Date().getFullYear();
        // NFL/NCAAF: Aug-Feb, so Jan-Jul = previous year's season
        currentSeason = month <= 7 ? year - 1 : year;
      }
      
      const homeGames = await ballDontLieService.getGames(bdlSport, {
        team_ids: [home.id],
        seasons: [currentSeason],
        per_page: 50
      });
      
      // Filter to only COMPLETED games against the away team
      const h2hGames = (homeGames || []).filter(game => {
        const gameHomeId = game.home_team?.id || game.home_team_id;
        const gameAwayId = game.visitor_team?.id || game.visitor_team_id;
        const isH2H = (gameHomeId === away.id || gameAwayId === away.id);
        // Per BDL docs: NFL uses status='Final', NCAAB uses 'post'
        const isCompleted = game.status === 'Final' || game.status === 'post';
        // Also ensure game date is in the past
        const gameDate = new Date(game.date);
        const isPast = gameDate < new Date();
        return isH2H && isCompleted && isPast;
      }).sort((a, b) => new Date(b.date) - new Date(a.date)); // Most recent first
      
      if (h2hGames.length === 0) {
        return {
          category: `Head-to-Head History (${currentSeason} Season)`,
          games_found: 0,
          note: `No previous matchups between ${homeName} and ${awayName} in the ${currentSeason} season yet.`,
          revenge_game: false,
          IMPORTANT: '⚠️ For historical H2H (prior seasons), check the Scout Report grounding data. DO NOT guess or claim winning streaks.'
        };
      }
      
      // For NBA, try to fetch box scores to get personnel context
      const isNba = bdlSport === 'basketball_nba';
      let boxScoresByDate = {};
      
      if (isNba && h2hGames.length <= 3) {
        // Only fetch box scores for recent H2H games (limit to avoid slowdown)
        console.log(`[Stat Router] Fetching box scores for ${h2hGames.length} H2H game(s) to get personnel notes...`);
        
        for (const game of h2hGames.slice(0, 3)) {
          try {
            const gameDate = game.date?.split('T')[0]; // YYYY-MM-DD
            if (gameDate && !boxScoresByDate[gameDate]) {
              const boxScores = await ballDontLieService.getNbaBoxScores(gameDate, 30); // Cache 30 min
              if (boxScores && boxScores.length > 0) {
                // Find the box score that matches this game (by team IDs)
                const matchingBox = boxScores.find(bs => {
                  const bsHomeId = bs.game?.home_team?.id || bs.home_team?.id;
                  const bsAwayId = bs.game?.visitor_team?.id || bs.visitor_team?.id;
                  return (bsHomeId === home.id || bsHomeId === away.id) && 
                         (bsAwayId === home.id || bsAwayId === away.id);
                });
                if (matchingBox) {
                  boxScoresByDate[gameDate] = matchingBox;
                }
              }
            }
          } catch (e) {
            console.log(`[Stat Router] Box score fetch failed for ${game.date}: ${e.message}`);
          }
        }
      }
      
      // Format H2H results with full date including year AND personnel notes
      const h2hResults = h2hGames.slice(0, 5).map(game => {
        const isHomeTeamHome = (game.home_team?.id || game.home_team_id) === home.id;
        const homeScore = isHomeTeamHome ? game.home_team_score : game.visitor_team_score;
        const awayScore = isHomeTeamHome ? game.visitor_team_score : game.home_team_score;
        const winner = homeScore > awayScore ? homeName : awayName;
        const margin = Math.abs(homeScore - awayScore);
        const gameDate = new Date(game.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const gameDateKey = game.date?.split('T')[0];
        const week = game.week ? `Week ${game.week}` : '';
        
        // Get personnel note from box score if available
        const boxScore = boxScoresByDate[gameDateKey];
        const personnelNote = boxScore ? extractPersonnelNote(boxScore, home.id, away.id) : null;
        
        return {
          date: gameDate,
          week: week,
          result: `${winner} won by ${margin}`,
          score: `${homeName} ${homeScore} - ${awayScore} ${awayName}`,
          home_won: homeScore > awayScore,
          personnel_note: personnelNote || (isNba ? '(Box score unavailable)' : null)
        };
      });
      
      // Calculate series record for THIS SEASON
      const homeWins = h2hResults.filter(r => r.home_won).length;
      const awayWins = h2hResults.length - homeWins;
      
      // Check for revenge game (did away team lose last meeting?)
      const lastMeeting = h2hResults[0];
      const revengeGame = lastMeeting && !lastMeeting.home_won;
      
      return {
        category: `Head-to-Head History (${currentSeason} Season ONLY)`,
        games_found: h2hGames.length,
        this_season_record: `${homeName} ${homeWins}-${awayWins} ${awayName}`,
        meetings_this_season: h2hResults,
        revenge_game: revengeGame,
        revenge_note: revengeGame ? `${awayName} lost the last meeting - potential revenge spot` : null,
        IMPORTANT: `⚠️ This shows ONLY ${h2hGames.length} game(s) from the ${currentSeason} season. Personnel notes show who PLAYED in each game. For multi-year H2H history, use Scout Report grounding. DO NOT claim historical streaks beyond this data.`
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching H2H history:`, error.message);
      return {
        category: 'Head-to-Head History',
        error: 'Data unavailable',
        IMPORTANT: '⚠️ H2H data unavailable. Check Scout Report grounding for this info. DO NOT guess.'
      };
    }
  },

  // ===== CLUTCH STATS (Close Game Record) =====
  CLUTCH_STATS: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching CLUTCH_STATS (close game record) for ${away.name} @ ${home.name}`);
    
    try {
      // NFL API does NOT support start_date/end_date - use seasons[] instead
      // Other sports (NBA, etc.) can use date range filtering
      const isNFL = bdlSport === 'americanfootball_nfl';
      const isNCAA = bdlSport === 'americanfootball_ncaaf' || bdlSport === 'basketball_ncaab';
      
      let params;
      if (isNFL || isNCAA) {
        // NFL/NCAAF: Use seasons[] parameter (per BDL API docs)
        // Calculate dynamic season if not provided
        let effectiveSeason = season;
        if (!effectiveSeason) {
          const month = new Date().getMonth() + 1;
          const year = new Date().getFullYear();
          effectiveSeason = month <= 7 ? year - 1 : year;
        }
        params = {
          seasons: [effectiveSeason],
          per_page: 50
        };
      } else {
        // NBA/NHL/etc: Use date range filtering
        const today = new Date();
        const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
        params = {
          start_date: ninetyDaysAgo.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 50
        };
      }
      
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, { team_ids: [home.id], ...params }),
        ballDontLieService.getGames(bdlSport, { team_ids: [away.id], ...params })
      ]);
      
      // Calculate close game record (games decided by 5 points or less)
      const calcClutchRecord = (games, teamName) => {
        let closeWins = 0;
        let closeLosses = 0;
        const closeGameMargin = 5;
        
        for (const game of games || []) {
          const homeScore = game.home_team_score || game.home_score || 0;
          const awayScore = game.visitor_team_score || game.away_score || game.away_team_score || 0;
          const margin = Math.abs(homeScore - awayScore);
          
          // Skip unplayed games
          if (homeScore === 0 && awayScore === 0) continue;
          
          if (margin <= closeGameMargin) {
            const isHomeTeam = game.home_team?.name?.includes(teamName.split(' ').pop()) || 
                               game.home_team?.full_name?.includes(teamName);
            const won = isHomeTeam ? homeScore > awayScore : awayScore > homeScore;
            if (won) closeWins++;
            else closeLosses++;
          }
        }
        
        const total = closeWins + closeLosses;
        const pct = total > 0 ? ((closeWins / total) * 100).toFixed(0) : 'N/A';
        
        return {
          close_record: `${closeWins}-${closeLosses}`,
          close_win_pct: total > 0 ? `${pct}%` : 'N/A',
          close_games: total
        };
      };
      
      const homeClutch = calcClutchRecord(homeGames, home.name);
      const awayClutch = calcClutchRecord(awayGames, away.name);
      
      return {
        category: 'Clutch Stats (Games Decided by ≤5 Points)',
        home: {
          team: home.full_name || home.name,
          ...homeClutch
        },
        away: {
          team: away.full_name || away.name,
          ...awayClutch
        },
        interpretation: `Close game records indicate which team performs better in tight situations`
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching clutch stats:`, error.message);
      return {
        category: 'Clutch Stats',
        home: { team: home.full_name || home.name, close_record: 'N/A' },
        away: { team: away.full_name || away.name, close_record: 'N/A' }
      };
    }
  },

  // ===== LUCK-ADJUSTED (Pythagorean Expected Wins) =====
  LUCK_ADJUSTED: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching LUCK_ADJUSTED (Pythagorean expected wins) for ${away.name} @ ${home.name}`);
    
    try {
      // Get standings for wins/losses + recent games for scoring
      const [standings, homeGames, awayGames] = await Promise.all([
        ballDontLieService.getNbaStandings(season),
        ballDontLieService.getGames(bdlSport, { 
          team_ids: [home.id], 
          start_date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          end_date: new Date().toISOString().split('T')[0],
          per_page: 20 
        }),
        ballDontLieService.getGames(bdlSport, { 
          team_ids: [away.id], 
          start_date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          end_date: new Date().toISOString().split('T')[0],
          per_page: 20 
        })
      ]);
      
      // Find teams in standings
      const homeStanding = standings.find(s => s.team?.id === home.id);
      const awayStanding = standings.find(s => s.team?.id === away.id);
      
      // Calculate PPG from recent games
      const calcPpg = (games, teamId) => {
        const completedGames = (games || []).filter(g => g.home_team_score > 0 || g.visitor_team_score > 0);
        if (completedGames.length === 0) return { ppg: 0, oppPpg: 0 };
        
        let totalPf = 0, totalPa = 0;
        for (const g of completedGames) {
          const isHome = g.home_team?.id === teamId;
          totalPf += isHome ? (g.home_team_score || 0) : (g.visitor_team_score || 0);
          totalPa += isHome ? (g.visitor_team_score || 0) : (g.home_team_score || 0);
        }
        return { ppg: totalPf / completedGames.length, oppPpg: totalPa / completedGames.length };
      };
      
      const homeScoring = calcPpg(homeGames, home.id);
      const awayScoring = calcPpg(awayGames, away.id);
      
      // Calculate Pythagorean expected win %
      const calcPythagorean = (standing, scoring) => {
        const wins = standing?.wins || 0;
        const losses = standing?.losses || 0;
        const games = wins + losses;
        const ppg = scoring.ppg;
        const oppPpg = scoring.oppPpg;
        
        if (ppg === 0 || oppPpg === 0 || games === 0) {
          return { actual_record: 'N/A', expected_wins: 'N/A', luck_factor: 'N/A' };
        }
        
        // NBA Pythagorean exponent
        const exp = 13.91;
        const expectedWinPct = Math.pow(ppg, exp) / (Math.pow(ppg, exp) + Math.pow(oppPpg, exp));
        const expectedWins = Math.round(expectedWinPct * games * 10) / 10;
        const actualWinPct = wins / games;
        
        // Luck factor: positive = lucky (winning more than expected), negative = unlucky
        const luckFactor = ((actualWinPct - expectedWinPct) * 100).toFixed(1);
        const luckLabel = parseFloat(luckFactor) > 5 ? '⚠️ LUCKY (investigate sustainability)' :
                          parseFloat(luckFactor) < -5 ? '📈 UNLUCKY (improvement candidate)' :
                          'Normal variance';
        
        return {
          actual_record: `${wins}-${losses}`,
          actual_win_pct: `${(actualWinPct * 100).toFixed(1)}%`,
          expected_wins: expectedWins.toFixed(1),
          expected_win_pct: `${(expectedWinPct * 100).toFixed(1)}%`,
          ppg: ppg.toFixed(1),
          opp_ppg: oppPpg.toFixed(1),
          luck_factor: `${parseFloat(luckFactor) > 0 ? '+' : ''}${luckFactor}%`,
          interpretation: luckLabel
        };
      };
      
      return {
        category: 'Luck-Adjusted (Pythagorean Expected Wins)',
        home: {
          team: home.full_name || home.name,
          ...calcPythagorean(homeStanding, homeScoring)
        },
        away: {
          team: away.full_name || away.name,
          ...calcPythagorean(awayStanding, awayScoring)
        },
        note: 'Teams with expected wins significantly different from actual wins - investigate sustainability.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching luck-adjusted stats:`, error.message);
      return {
        category: 'Luck-Adjusted',
        error: 'Data unavailable'
      };
    }
  },

  // ===== USAGE RATES (Using FGA as proxy - shots taken = possession usage) =====
  USAGE_RATES: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching USAGE_RATES for ${away.name} @ ${home.name}`);
    
    try {
      // Get roster for both teams
      const [homePlayersRaw, awayPlayersRaw] = await Promise.all([
        ballDontLieService.getPlayersActive(bdlSport, { team_ids: [home.id], per_page: 15 }),
        ballDontLieService.getPlayersActive(bdlSport, { team_ids: [away.id], per_page: 15 })
      ]);
      
      // Handle both array and {data: [...]} response formats
      const homePlayers = Array.isArray(homePlayersRaw) ? homePlayersRaw : (homePlayersRaw?.data || []);
      const awayPlayers = Array.isArray(awayPlayersRaw) ? awayPlayersRaw : (awayPlayersRaw?.data || []);
      
      const homePlayerIds = homePlayers.slice(0, 10).map(p => p.id);
      const awayPlayerIds = awayPlayers.slice(0, 10).map(p => p.id);
      
      // Fetch base season averages (FGA, PTS, AST as usage proxies)
      const fetchBaseStats = async (playerIds, teamName) => {
        if (!playerIds.length) return [];
        try {
          const url = `https://api.balldontlie.io/v1/season_averages?season=${season}&player_ids[]=${playerIds.join('&player_ids[]=')}`;
          const response = await fetch(url, {
            headers: { 'Authorization': process.env.BALL_DONT_LIE_API_KEY }
          });
          if (!response.ok) return [];
          const data = await response.json();
          return data.data || [];
        } catch (e) {
          console.error(`[Usage Stats] Error for ${teamName}:`, e.message);
          return [];
        }
      };
      
      const [homeStats, awayStats] = await Promise.all([
        fetchBaseStats(homePlayerIds, home.name),
        fetchBaseStats(awayPlayerIds, away.name)
      ]);
      
      // Map player IDs to names
      const homePlayerMap = Object.fromEntries((homePlayers || []).map(p => [p.id, `${p.first_name} ${p.last_name}`]));
      const awayPlayerMap = Object.fromEntries((awayPlayers || []).map(p => [p.id, `${p.first_name} ${p.last_name}`]));
      
      // Format top usage players (using FGA + FTA + TOV as possession usage proxy)
      const formatUsage = (statsData, playerMap) => {
        return statsData
          .filter(s => s.fga > 0 || s.pts > 0)
          .map(s => ({
            ...s,
            usage_proxy: (s.fga || 0) + (s.fta || 0) * 0.44 + (s.turnover || 0) // Standard usage formula components
          }))
          .sort((a, b) => b.usage_proxy - a.usage_proxy)
          .slice(0, 5)
          .map(s => ({
            player: playerMap[s.player_id] || `Player ${s.player_id}`,
            ppg: s.pts?.toFixed(1) || 'N/A',
            fga: s.fga?.toFixed(1) || 'N/A',
            ast: s.ast?.toFixed(1) || 'N/A',
            min: s.min || 'N/A',
            fg_pct: s.fg_pct ? `${(s.fg_pct * 100).toFixed(1)}%` : 'N/A'
          }));
      };
      
      return {
        category: 'Shot Volume Leaders (Who Takes the Most Shots)',
        home: {
          team: home.full_name || home.name,
          top_players: formatUsage(homeStats, homePlayerMap)
        },
        away: {
          team: away.full_name || away.name,
          top_players: formatUsage(awayStats, awayPlayerMap)
        },
        note: 'Players sorted by shot volume (FGA + FTA). Higher = more involved in offense.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching usage rates:`, error.message);
      return { category: 'Usage Rates', error: 'Data unavailable' };
    }
  },

  // ===== VS ELITE TEAMS (Record vs Top 5 teams by conference) =====
  VS_ELITE_TEAMS: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching VS_ELITE_TEAMS for ${away.name} @ ${home.name}`);
    
    try {
      // Get standings to identify elite teams (top 5 in each conference)
      const standings = await ballDontLieService.getNbaStandings(season);
      
      // Get top 5 teams from each conference
      const eastElite = standings
        .filter(s => s.team?.conference === 'East')
        .sort((a, b) => (b.wins || 0) - (a.wins || 0))
        .slice(0, 5)
        .map(s => s.team?.id);
      
      const westElite = standings
        .filter(s => s.team?.conference === 'West')
        .sort((a, b) => (b.wins || 0) - (a.wins || 0))
        .slice(0, 5)
        .map(s => s.team?.id);
      
      const eliteTeamIds = [...eastElite, ...westElite];
      
      // Get games for each team this season
      const seasonStart = new Date(season - 1, 9, 1); // Oct 1
      const today = new Date();
      
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, {
          team_ids: [home.id],
          start_date: seasonStart.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 50
        }),
        ballDontLieService.getGames(bdlSport, {
          team_ids: [away.id],
          start_date: seasonStart.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 50
        })
      ]);
      
      // Calculate record vs elite teams
      const calcVsElite = (games, teamId) => {
        let wins = 0, losses = 0;
        const eliteGames = [];
        
        for (const game of games || []) {
          const homeScore = game.home_team_score || 0;
          const awayScore = game.visitor_team_score || 0;
          if (homeScore === 0 && awayScore === 0) continue; // Unplayed
          
          const isHome = game.home_team?.id === teamId;
          const opponentId = isHome ? game.visitor_team?.id : game.home_team?.id;
          
          if (eliteTeamIds.includes(opponentId)) {
            const won = isHome ? homeScore > awayScore : awayScore > homeScore;
            if (won) wins++;
            else losses++;
            eliteGames.push({
              opponent: isHome ? game.visitor_team?.name : game.home_team?.name,
              result: won ? 'W' : 'L',
              score: isHome ? `${homeScore}-${awayScore}` : `${awayScore}-${homeScore}`
            });
          }
        }
        
        return {
          record: `${wins}-${losses}`,
          win_pct: wins + losses > 0 ? `${((wins / (wins + losses)) * 100).toFixed(0)}%` : 'N/A',
          games_played: wins + losses,
          recent_results: eliteGames.slice(0, 5)
        };
      };
      
      // Get elite team names for context
      const eliteTeamNames = standings
        .filter(s => eliteTeamIds.includes(s.team?.id))
        .map(s => s.team?.name)
        .slice(0, 10);
      
      return {
        category: 'Record vs Elite Teams (Top 5 Each Conference)',
        elite_teams: eliteTeamNames,
        home: {
          team: home.full_name || home.name,
          ...calcVsElite(homeGames, home.id)
        },
        away: {
          team: away.full_name || away.name,
          ...calcVsElite(awayGames, away.id)
        },
        note: 'Shows how each team performs against the best competition.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching vs elite teams:`, error.message);
      return { category: 'Record vs Elite Teams', error: 'Data unavailable' };
    }
  },

  // ===== BENCH DEPTH (NBA - Critical for Large Spreads) =====
  BENCH_DEPTH: async (bdlSport, home, away, season) => {
    // Only for NBA
    if (bdlSport !== 'basketball_nba') {
      return { category: 'Bench Depth', note: 'Only available for NBA', error: 'Sport not supported' };
    }
    
    console.log(`[Stat Router] Fetching BENCH_DEPTH for ${away.name} @ ${home.name}`);
    
    try {
      // Get recent games for both teams (last 10)
      const seasonStart = new Date(season - 1, 9, 1); // Oct 1
      const today = new Date();
      
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, {
          team_ids: [home.id],
          start_date: seasonStart.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 15
        }),
        ballDontLieService.getGames(bdlSport, {
          team_ids: [away.id],
          start_date: seasonStart.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 15
        })
      ]);
      
      // Get last 10 completed games for each team
      const getCompletedGames = (games, limit = 10) => {
        return (games || [])
          .filter(g => g.status === 'Final' && (g.home_team_score || 0) > 0)
          .sort((a, b) => new Date(b.date) - new Date(a.date))
          .slice(0, limit);
      };
      
      const recentHomeGames = getCompletedGames(homeGames);
      const recentAwayGames = getCompletedGames(awayGames);
      
      if (recentHomeGames.length < 3 || recentAwayGames.length < 3) {
        return { category: 'Bench Depth', error: 'Not enough games to calculate bench depth' };
      }
      
      // Get player stats for these games
      const homeGameIds = recentHomeGames.map(g => g.id);
      const awayGameIds = recentAwayGames.map(g => g.id);
      
      const [homePlayerStats, awayPlayerStats] = await Promise.all([
        ballDontLieService.getPlayerStats(bdlSport, { game_ids: homeGameIds, per_page: 100 }),
        ballDontLieService.getPlayerStats(bdlSport, { game_ids: awayGameIds, per_page: 100 })
      ]);
      
      // Calculate bench depth for a team
      const calcBenchDepth = (playerStats, teamId, numGames) => {
        // Filter to only this team's players
        const teamStats = (playerStats || []).filter(s => s.team?.id === teamId);
        
        if (teamStats.length === 0) {
          return { error: 'No player stats available' };
        }
        
        // Aggregate stats by player
        const playerAgg = {};
        for (const stat of teamStats) {
          const playerId = stat.player?.id;
          if (!playerId) continue;
          
          if (!playerAgg[playerId]) {
            playerAgg[playerId] = {
              name: `${stat.player?.first_name || ''} ${stat.player?.last_name || ''}`.trim(),
              games: 0,
              minutes: 0,
              points: 0,
              plusMinus: 0
            };
          }
          
          // Parse minutes (format: "32" or "32:45")
          const minStr = stat.min || '0';
          const mins = parseInt(minStr.split(':')[0]) || 0;
          
          playerAgg[playerId].games++;
          playerAgg[playerId].minutes += mins;
          playerAgg[playerId].points += stat.pts || 0;
          playerAgg[playerId].plusMinus += stat.plus_minus || 0;
        }
        
        // Convert to array and sort by total minutes (most minutes = starter)
        const players = Object.entries(playerAgg)
          .map(([id, data]) => ({
            id,
            ...data,
            mpg: data.games > 0 ? data.minutes / data.games : 0,
            ppg: data.games > 0 ? data.points / data.games : 0,
            avgPlusMinus: data.games > 0 ? data.plusMinus / data.games : 0
          }))
          .sort((a, b) => b.mpg - a.mpg);
        
        // Top 5 by minutes = starters, rest = bench
        const starters = players.slice(0, 5);
        const bench = players.slice(5);
        
        // Calculate aggregates
        const starterPPG = starters.reduce((sum, p) => sum + p.ppg, 0);
        const benchPPG = bench.reduce((sum, p) => sum + p.ppg, 0);
        const starterMPG = starters.reduce((sum, p) => sum + p.mpg, 0);
        const benchMPG = bench.reduce((sum, p) => sum + p.mpg, 0);
        const starterPlusMinus = starters.reduce((sum, p) => sum + p.avgPlusMinus, 0) / Math.max(starters.length, 1);
        const benchPlusMinus = bench.reduce((sum, p) => sum + p.avgPlusMinus, 0) / Math.max(bench.length, 1);
        
        // Identify top bench scorers
        const topBench = bench.slice(0, 3).map(p => ({
          name: p.name,
          ppg: p.ppg.toFixed(1),
          mpg: p.mpg.toFixed(1)
        }));
        
        return {
          starter_ppg: starterPPG.toFixed(1),
          bench_ppg: benchPPG.toFixed(1),
          starter_mpg: starterMPG.toFixed(1),
          bench_mpg: benchMPG.toFixed(1),
          bench_plus_minus: benchPlusMinus.toFixed(1),
          starter_plus_minus: starterPlusMinus.toFixed(1),
          rotation_size: players.filter(p => p.mpg >= 10).length,
          top_bench_players: topBench,
          games_analyzed: numGames
        };
      };
      
      const homeDepth = calcBenchDepth(homePlayerStats, home.id, recentHomeGames.length);
      const awayDepth = calcBenchDepth(awayPlayerStats, away.id, recentAwayGames.length);
      
      // Determine which team has depth advantage
      const homeBenchPPG = parseFloat(homeDepth.bench_ppg) || 0;
      const awayBenchPPG = parseFloat(awayDepth.bench_ppg) || 0;
      const depthEdge = homeBenchPPG > awayBenchPPG + 3 ? 'HOME' : 
                        awayBenchPPG > homeBenchPPG + 3 ? 'AWAY' : 'EVEN';
      
      return {
        category: 'Bench Depth Analysis (Last 10 Games)',
        home: {
          team: home.full_name || home.name,
          ...homeDepth
        },
        away: {
          team: away.full_name || away.name,
          ...awayDepth
        },
        depth_edge: depthEdge,
        insight: `⚠️ FOR LARGE SPREADS (7+): The bench must sustain leads. ${
          depthEdge === 'HOME' ? home.name + ' has deeper bench scoring (+' + (homeBenchPPG - awayBenchPPG).toFixed(1) + ' PPG)' :
          depthEdge === 'AWAY' ? away.name + ' has deeper bench scoring (+' + (awayBenchPPG - homeBenchPPG).toFixed(1) + ' PPG)' :
          'Bench scoring is roughly even - starters will determine margin'
        }`
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching bench depth:`, error.message);
      return { category: 'Bench Depth', error: 'Data unavailable - ' + error.message };
    }
  },

  // ===== NFL SPECIFIC =====
  // Helper to extract first element from BDL team_season_stats array response
  _extractNflStats: (statsArray) => {
    if (Array.isArray(statsArray) && statsArray.length > 0) return statsArray[0];
    return statsArray || {};
  },

  OFFENSIVE_EPA: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    // Extract first element from array response
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    // NCAAF uses different field names than NFL
    if (bdlSport === 'americanfootball_ncaaf') {
      const homeTotalYpg = (homeStats?.passing_yards_per_game || 0) + (homeStats?.rushing_yards_per_game || 0);
      const awayTotalYpg = (awayStats?.passing_yards_per_game || 0) + (awayStats?.rushing_yards_per_game || 0);
      const homeTotalTds = (homeStats?.passing_touchdowns || 0) + (homeStats?.rushing_touchdowns || 0);
      const awayTotalTds = (awayStats?.passing_touchdowns || 0) + (awayStats?.rushing_touchdowns || 0);
      
      return {
        category: 'Offensive Production',
        home: {
          team: home.full_name || home.name,
          total_yards_per_game: fmtNum(homeTotalYpg),
          passing_ypg: fmtNum(homeStats?.passing_yards_per_game),
          rushing_ypg: fmtNum(homeStats?.rushing_yards_per_game),
          total_tds: homeTotalTds.toString()
        },
        away: {
          team: away.full_name || away.name,
          total_yards_per_game: fmtNum(awayTotalYpg),
          passing_ypg: fmtNum(awayStats?.passing_yards_per_game),
          rushing_ypg: fmtNum(awayStats?.rushing_yards_per_game),
          total_tds: awayTotalTds.toString()
        }
      };
    }
    
    // NFL and other sports
    // Calculate yards per play correctly using season totals
    const homeGamesPlayed = homeStats?.games_played || 1;
    const awayGamesPlayed = awayStats?.games_played || 1;
    const homeTotalYards = homeStats?.total_offensive_yards || (homeStats?.total_offensive_yards_per_game * homeGamesPlayed);
    const awayTotalYards = awayStats?.total_offensive_yards || (awayStats?.total_offensive_yards_per_game * awayGamesPlayed);
    const homeTotalPlays = (homeStats?.passing_attempts || 0) + (homeStats?.rushing_attempts || 0);
    const awayTotalPlays = (awayStats?.passing_attempts || 0) + (awayStats?.rushing_attempts || 0);
    
    return {
      category: 'Offensive Efficiency',
      home: {
        team: home.full_name || home.name,
        points_per_game: fmtNum(homeStats?.total_points_per_game),
        yards_per_game: fmtNum(homeStats?.total_offensive_yards_per_game),
        yards_per_play: fmtNum(homeTotalPlays > 0 ? homeTotalYards / homeTotalPlays : 0, 1)
      },
      away: {
        team: away.full_name || away.name,
        points_per_game: fmtNum(awayStats?.total_points_per_game),
        yards_per_game: fmtNum(awayStats?.total_offensive_yards_per_game),
        yards_per_play: fmtNum(awayTotalPlays > 0 ? awayTotalYards / awayTotalPlays : 0, 1)
      }
    };
  },
  
  DEFENSIVE_EPA: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    // NCAAF uses different field names
    if (bdlSport === 'americanfootball_ncaaf') {
      const homeOppYards = (homeStats?.opp_passing_yards || 0) + (homeStats?.opp_rushing_yards || 0);
      const awayOppYards = (awayStats?.opp_passing_yards || 0) + (awayStats?.opp_rushing_yards || 0);
      
      return {
        category: 'Defensive Production',
        home: {
          team: home.full_name || home.name,
          opp_total_yards: fmtNum(homeOppYards),
          opp_passing_yards: fmtNum(homeStats?.opp_passing_yards),
          opp_rushing_yards: fmtNum(homeStats?.opp_rushing_yards)
        },
        away: {
          team: away.full_name || away.name,
          opp_total_yards: fmtNum(awayOppYards),
          opp_passing_yards: fmtNum(awayStats?.opp_passing_yards),
          opp_rushing_yards: fmtNum(awayStats?.opp_rushing_yards)
        }
      };
    }
    
    // NFL and other sports
    return {
      category: 'Defensive EPA (Points Allowed / Yards Allowed proxies)',
      home: {
        team: home.full_name || home.name,
        opp_points_per_game: fmtNum(homeStats?.opp_total_points_per_game),
        opp_yards_per_game: fmtNum(homeStats?.opp_total_offensive_yards_per_game)
      },
      away: {
        team: away.full_name || away.name,
        opp_points_per_game: fmtNum(awayStats?.opp_total_points_per_game),
        opp_yards_per_game: fmtNum(awayStats?.opp_total_offensive_yards_per_game)
      }
    };
  },
  
  TURNOVER_MARGIN: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Turnover Margin',
      home: {
        team: home.full_name || home.name,
        turnover_diff: fmtNum(homeStats?.misc_turnover_differential, 0),
        takeaways: fmtNum(homeStats?.misc_total_takeaways, 0),
        giveaways: fmtNum(homeStats?.misc_total_giveaways, 0)
      },
      away: {
        team: away.full_name || away.name,
        turnover_diff: fmtNum(awayStats?.misc_turnover_differential, 0),
        takeaways: fmtNum(awayStats?.misc_total_takeaways, 0),
        giveaways: fmtNum(awayStats?.misc_total_giveaways, 0)
      },
      interpretation: interpretTurnoverMargin(homeStats, awayStats)
    };
  },
  
  RED_ZONE_OFFENSE: async (bdlSport, home, away, season) => {
    const homeName = home.full_name || home.name;
    const awayName = away.full_name || away.name;
    
    // NCAAF: Use Gemini Grounding for red zone stats (BDL doesn't have NCAAF red zone data)
    if (bdlSport === 'americanfootball_ncaaf') {
      console.log(`[Stat Router] NCAAF Red Zone: Using Gemini Grounding for ${awayName} @ ${homeName}`);
      return await fetchNCAAFRedZoneFromGrounding(homeName, awayName);
    }
    
    // Try to get actual red zone data from recent games (NFL)
    const [homeGames, awayGames] = await Promise.all([
      ballDontLieService.getTeamStats ? 
        ballDontLieService.getTeamStats(bdlSport, { team_ids: [home.id], seasons: [season], per_page: 10 }) : [],
      ballDontLieService.getTeamStats ? 
        ballDontLieService.getTeamStats(bdlSport, { team_ids: [away.id], seasons: [season], per_page: 10 }) : []
    ]);
    
    // Aggregate red zone stats from games
    const aggregateRedZone = (games, teamId) => {
      let rzScores = 0, rzAttempts = 0;
      const teamGames = (games || []).filter(g => g.team?.id === teamId);
      teamGames.forEach(g => {
        rzScores += g.red_zone_scores || 0;
        rzAttempts += g.red_zone_attempts || 0;
      });
      return {
        scores: rzScores,
        attempts: rzAttempts,
        pct: rzAttempts > 0 ? ((rzScores / rzAttempts) * 100).toFixed(1) + '%' : 'N/A',
        games: teamGames.length
      };
    };
    
    const homeRZ = aggregateRedZone(homeGames, home.id);
    const awayRZ = aggregateRedZone(awayGames, away.id);
    
    // If we got real red zone data, use it
    if (homeRZ.attempts > 0 || awayRZ.attempts > 0) {
      return {
        category: 'Red Zone Scoring Efficiency',
        home: {
          team: homeName,
          red_zone_td_pct: homeRZ.pct,
          red_zone_scores: homeRZ.scores.toString(),
          red_zone_attempts: homeRZ.attempts.toString()
        },
        away: {
          team: awayName,
          red_zone_td_pct: awayRZ.pct,
          red_zone_scores: awayRZ.scores.toString(),
          red_zone_attempts: awayRZ.attempts.toString()
        },
        note: `Aggregated from ${homeRZ.games} home games, ${awayRZ.games} away games`
      };
    }
    
    // Fallback to season stats (third/fourth down as proxy - clearly labeled)
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Down Conversion Efficiency (Red Zone Proxy)',
      home: {
        team: homeName,
        third_down_pct: fmtPct(homeStats?.misc_third_down_conv_pct / 100),
        fourth_down_pct: fmtPct(homeStats?.misc_fourth_down_conv_pct / 100)
      },
      away: {
        team: awayName,
        third_down_pct: fmtPct(awayStats?.misc_third_down_conv_pct / 100),
        fourth_down_pct: fmtPct(awayStats?.misc_fourth_down_conv_pct / 100)
      },
      note: 'Red zone data unavailable - showing 3rd/4th down conversion as efficiency proxy'
    };
  },
  
  QB_STATS: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Quarterback/Passing Stats',
      home: {
        team: home.full_name || home.name,
        qb_rating: fmtNum(homeStats?.passing_qb_rating),
        completion_pct: fmtPct(homeStats?.passing_completion_pct / 100),
        yards_per_attempt: fmtNum(homeStats?.yards_per_pass_attempt),
        passing_tds: fmtNum(homeStats?.passing_touchdowns, 0),
        interceptions: fmtNum(homeStats?.passing_interceptions, 0)
      },
      away: {
        team: away.full_name || away.name,
        qb_rating: fmtNum(awayStats?.passing_qb_rating),
        completion_pct: fmtPct(awayStats?.passing_completion_pct / 100),
        yards_per_attempt: fmtNum(awayStats?.yards_per_pass_attempt),
        passing_tds: fmtNum(awayStats?.passing_touchdowns, 0),
        interceptions: fmtNum(awayStats?.passing_interceptions, 0)
      }
    };
  },
  
  RB_STATS: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Rushing Stats',
      home: {
        team: home.full_name || home.name,
        rushing_yards_per_game: fmtNum(homeStats?.rushing_yards_per_game),
        yards_per_carry: fmtNum(homeStats?.rushing_yards_per_rush_attempt),
        rushing_tds: fmtNum(homeStats?.rushing_touchdowns, 0)
      },
      away: {
        team: away.full_name || away.name,
        rushing_yards_per_game: fmtNum(awayStats?.rushing_yards_per_game),
        yards_per_carry: fmtNum(awayStats?.rushing_yards_per_rush_attempt),
        rushing_tds: fmtNum(awayStats?.rushing_touchdowns, 0)
      }
    };
  },

  // ===== NFL-SPECIFIC STATS (unique data for each token) =====
  
  SUCCESS_RATE_OFFENSE: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Offensive Success Rate (3rd/4th Down)',
      home: {
        team: home.full_name || home.name,
        third_down_pct: fmtPct(homeStats?.misc_third_down_conv_pct / 100),
        fourth_down_pct: fmtPct(homeStats?.misc_fourth_down_conv_pct / 100),
        third_down_att: fmtNum(homeStats?.misc_third_down_conv_att, 0),
        third_down_made: fmtNum(homeStats?.misc_third_down_conv_made, 0)
      },
      away: {
        team: away.full_name || away.name,
        third_down_pct: fmtPct(awayStats?.misc_third_down_conv_pct / 100),
        fourth_down_pct: fmtPct(awayStats?.misc_fourth_down_conv_pct / 100),
        third_down_att: fmtNum(awayStats?.misc_third_down_conv_att, 0),
        third_down_made: fmtNum(awayStats?.misc_third_down_conv_made, 0)
      }
    };
  },

  SUCCESS_RATE_DEFENSE: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Defensive Success Rate (Opp 3rd/4th Down)',
      home: {
        team: home.full_name || home.name,
        opp_third_down_pct: fmtPct(homeStats?.opp_third_down_conv_pct / 100),
        opp_fourth_down_pct: fmtPct(homeStats?.opp_fourth_down_conv_pct / 100)
      },
      away: {
        team: away.full_name || away.name,
        opp_third_down_pct: fmtPct(awayStats?.opp_third_down_conv_pct / 100),
        opp_fourth_down_pct: fmtPct(awayStats?.opp_fourth_down_conv_pct / 100)
      }
    };
  },

  EXPLOSIVE_PLAYS: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    // BDL doesn't have actual explosive play data (plays > 20 yards)
    // Use longest plays and yards per attempt as proxies for explosiveness
    return {
      category: 'Explosive Play Potential',
      home: {
        team: home.full_name || home.name,
        longest_pass: fmtNum(homeStats?.passing_long, 0),
        longest_rush: fmtNum(homeStats?.rushing_long, 0),
        yards_per_catch: fmtNum(homeStats?.receiving_yards_per_reception, 1),
        yards_per_carry: fmtNum(homeStats?.rushing_yards_per_rush_attempt, 1)
      },
      away: {
        team: away.full_name || away.name,
        longest_pass: fmtNum(awayStats?.passing_long, 0),
        longest_rush: fmtNum(awayStats?.rushing_long, 0),
        yards_per_catch: fmtNum(awayStats?.receiving_yards_per_reception, 1),
        yards_per_carry: fmtNum(awayStats?.rushing_yards_per_rush_attempt, 1)
      }
    };
  },

  PRESSURE_RATE: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Pressure/Sack Stats',
      home: {
        team: home.full_name || home.name,
        sacks_made: fmtNum(homeStats?.defense_sacks, 0),
        sacks_allowed: fmtNum(homeStats?.passing_sacks_allowed, 0),
        qb_hits: fmtNum(homeStats?.defense_qb_hits, 0)
      },
      away: {
        team: away.full_name || away.name,
        sacks_made: fmtNum(awayStats?.defense_sacks, 0),
        sacks_allowed: fmtNum(awayStats?.passing_sacks_allowed, 0),
        qb_hits: fmtNum(awayStats?.defense_qb_hits, 0)
      }
    };
  },

  EPA_LAST_5: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    // Scoring efficiency (proxy for EPA)
    return {
      category: 'Scoring Efficiency',
      home: {
        team: home.full_name || home.name,
        points_per_game: fmtNum(homeStats?.total_points_per_game),
        opp_points_per_game: fmtNum(homeStats?.opp_total_points_per_game),
        point_diff: fmtNum((homeStats?.total_points_per_game || 0) - (homeStats?.opp_total_points_per_game || 0))
      },
      away: {
        team: away.full_name || away.name,
        points_per_game: fmtNum(awayStats?.total_points_per_game),
        opp_points_per_game: fmtNum(awayStats?.opp_total_points_per_game),
        point_diff: fmtNum((awayStats?.total_points_per_game || 0) - (awayStats?.opp_total_points_per_game || 0))
      }
    };
  },

  RED_ZONE_DEFENSE: async (bdlSport, home, away, season) => {
    // Try to get actual red zone defense data from recent games (opponent stats)
    const [homeGames, awayGames] = await Promise.all([
      ballDontLieService.getTeamStats ? 
        ballDontLieService.getTeamStats(bdlSport, { team_ids: [home.id], seasons: [season], per_page: 10 }) : [],
      ballDontLieService.getTeamStats ? 
        ballDontLieService.getTeamStats(bdlSport, { team_ids: [away.id], seasons: [season], per_page: 10 }) : []
    ]);
    
    // For defense, we need opponent's red zone stats when playing against this team
    // This requires getting opponent stats from games, which is complex
    // For now, fall back to defensive efficiency metrics
    
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Defensive Efficiency',
      home: {
        team: home.full_name || home.name,
        opp_ppg: fmtNum(homeStats?.opp_total_points_per_game),
        opp_yards_per_game: fmtNum(homeStats?.opp_total_offensive_yards_per_game),
        takeaways: fmtNum((homeStats?.defense_interceptions || 0) + (homeStats?.defense_fumble_recoveries || 0), 0),
        sacks: fmtNum(homeStats?.opp_passing_sacks || homeStats?.defense_sacks, 0)
      },
      away: {
        team: away.full_name || away.name,
        opp_ppg: fmtNum(awayStats?.opp_total_points_per_game),
        opp_yards_per_game: fmtNum(awayStats?.opp_total_offensive_yards_per_game),
        takeaways: fmtNum((awayStats?.defense_interceptions || 0) + (awayStats?.defense_fumble_recoveries || 0), 0),
        sacks: fmtNum(awayStats?.opp_passing_sacks || awayStats?.defense_sacks, 0)
      }
    };
  },

  WR_TE_STATS: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Receiving/Passing Attack',
      home: {
        team: home.full_name || home.name,
        receiving_yards_per_game: fmtNum(homeStats?.passing_yards_per_game),
        receiving_tds: fmtNum(homeStats?.passing_touchdowns, 0),
        yards_per_catch: fmtNum(homeStats?.passing_yards / (homeStats?.passing_completions || 1)),
        completion_pct: fmtPct(homeStats?.passing_completion_pct / 100)
      },
      away: {
        team: away.full_name || away.name,
        receiving_yards_per_game: fmtNum(awayStats?.passing_yards_per_game),
        receiving_tds: fmtNum(awayStats?.passing_touchdowns, 0),
        yards_per_catch: fmtNum(awayStats?.passing_yards / (awayStats?.passing_completions || 1)),
        completion_pct: fmtPct(awayStats?.passing_completion_pct / 100)
      }
    };
  },

  DEFENSIVE_PLAYMAKERS: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Defensive Playmaking',
      home: {
        team: home.full_name || home.name,
        interceptions: fmtNum(homeStats?.defense_interceptions, 0),
        fumble_recoveries: fmtNum(homeStats?.defense_fumble_recoveries, 0),
        sacks: fmtNum(homeStats?.defense_sacks, 0),
        total_takeaways: fmtNum((homeStats?.defense_interceptions || 0) + (homeStats?.defense_fumble_recoveries || 0), 0)
      },
      away: {
        team: away.full_name || away.name,
        interceptions: fmtNum(awayStats?.defense_interceptions, 0),
        fumble_recoveries: fmtNum(awayStats?.defense_fumble_recoveries, 0),
        sacks: fmtNum(awayStats?.defense_sacks, 0),
        total_takeaways: fmtNum((awayStats?.defense_interceptions || 0) + (awayStats?.defense_fumble_recoveries || 0), 0)
      }
    };
  },

  TURNOVER_LUCK: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    const homeTakeaways = (homeStats?.defense_interceptions || 0) + (homeStats?.defense_fumble_recoveries || 0);
    const homeGiveaways = (homeStats?.passing_interceptions || 0) + (homeStats?.offense_fumbles_lost || 0);
    const awayTakeaways = (awayStats?.defense_interceptions || 0) + (awayStats?.defense_fumble_recoveries || 0);
    const awayGiveaways = (awayStats?.passing_interceptions || 0) + (awayStats?.offense_fumbles_lost || 0);
    
    return {
      category: 'Turnover Analysis',
      home: {
        team: home.full_name || home.name,
        takeaways: fmtNum(homeTakeaways, 0),
        giveaways: fmtNum(homeGiveaways, 0),
        turnover_diff: fmtNum(homeTakeaways - homeGiveaways, 0)
      },
      away: {
        team: away.full_name || away.name,
        takeaways: fmtNum(awayTakeaways, 0),
        giveaways: fmtNum(awayGiveaways, 0),
        turnover_diff: fmtNum(awayTakeaways - awayGiveaways, 0)
      }
    };
  },
  
  // ===== DERIVED STATS (single-value for clean display) =====
  PASSING_TDS: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Passing Touchdowns',
      home: {
        team: home.full_name || home.name,
        passing_tds: fmtNum(homeStats?.passing_touchdowns, 0)
      },
      away: {
        team: away.full_name || away.name,
        passing_tds: fmtNum(awayStats?.passing_touchdowns, 0)
      }
    };
  },
  
  INTERCEPTIONS: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Interceptions Thrown',
      home: {
        team: home.full_name || home.name,
        interceptions: fmtNum(homeStats?.passing_interceptions, 0)
      },
      away: {
        team: away.full_name || away.name,
        interceptions: fmtNum(awayStats?.passing_interceptions, 0)
      }
    };
  },
  
  RUSHING_TDS: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Rushing Touchdowns',
      home: {
        team: home.full_name || home.name,
        rushing_tds: fmtNum(homeStats?.rushing_touchdowns, 0)
      },
      away: {
        team: away.full_name || away.name,
        rushing_tds: fmtNum(awayStats?.rushing_touchdowns, 0)
      }
    };
  },
  
  TOTAL_TDS: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    const homeTotalTds = (homeStats?.passing_touchdowns || 0) + (homeStats?.rushing_touchdowns || 0);
    const awayTotalTds = (awayStats?.passing_touchdowns || 0) + (awayStats?.rushing_touchdowns || 0);
    
    return {
      category: 'Total Touchdowns',
      home: {
        team: home.full_name || home.name,
        total_tds: homeTotalTds.toString()
      },
      away: {
        team: away.full_name || away.name,
        total_tds: awayTotalTds.toString()
      }
    };
  },
  
  PASSING_YPG: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Array.isArray(homeStatsArr) ? homeStatsArr[0] : homeStatsArr;
    const awayStats = Array.isArray(awayStatsArr) ? awayStatsArr[0] : awayStatsArr;
    
    return {
      category: 'Passing Yards Per Game',
      home: {
        team: home.full_name || home.name,
        passing_ypg: fmtNum(homeStats?.passing_yards_per_game)
      },
      away: {
        team: away.full_name || away.name,
        passing_ypg: fmtNum(awayStats?.passing_yards_per_game)
      }
    };
  },

  // ===== SITUATIONAL =====
  REST_SITUATION: async (bdlSport, home, away, season, gameId, gameDate) => {
    // Fetch recent games for both teams to calculate rest situation
    console.log(`[Stat Router] Fetching REST_SITUATION for ${away.name} @ ${home.name}`);
    
    try {
      // Determine date range - look back 7 days from game date
      const targetDate = gameDate ? new Date(gameDate) : new Date();
      const endDateStr = targetDate.toISOString().split('T')[0];
      const startDate = new Date(targetDate);
      startDate.setDate(startDate.getDate() - 10); // Look back 10 days
      const startDateStr = startDate.toISOString().split('T')[0];
      
      // Fetch recent games for both teams
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, { 
          team_ids: [home.id], 
          start_date: startDateStr,
          end_date: endDateStr,
          per_page: 10 
        }),
        ballDontLieService.getGames(bdlSport, { 
          team_ids: [away.id], 
          start_date: startDateStr,
          end_date: endDateStr,
          per_page: 10 
        })
      ]);
      
      // Calculate rest for each team
      const calculateRest = (games, teamId, targetDateObj) => {
        const targetDateStr = targetDateObj.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        
        // Helper to get game date (handles both NBA's "date" and NHL's "game_date")
        const getGameDateStr = (g) => (g.game_date || g.date || '').split('T')[0];
        
        // Filter to completed games before today
        const completedGames = (games || [])
          .filter(g => {
            const gameStr = getGameDateStr(g);
            // NHL uses home_score/away_score, NBA/NFL use home_team_score/visitor_team_score
            const hasScore = (g.home_team_score || g.home_score || 0) > 0 || (g.visitor_team_score || g.away_score || 0) > 0;
            return gameStr < targetDateStr || (gameStr === targetDateStr && hasScore);
          })
          .sort((a, b) => new Date(getGameDateStr(b)) - new Date(getGameDateStr(a))); // Most recent first
        
        if (completedGames.length === 0) {
          return { daysRest: null, isBackToBack: false, lastGameDate: null, gamesInLast4Days: 0 };
        }
        
        const lastGame = completedGames[0];
        const lastGameDateStr = getGameDateStr(lastGame);
        const lastGameDate = new Date(lastGameDateStr + 'T12:00:00');
        const targetMidnight = new Date(targetDateStr + 'T12:00:00');
        
        const diffDays = Math.round((targetMidnight - lastGameDate) / (1000 * 60 * 60 * 24));
        const isBackToBack = diffDays <= 1;
        
        // Count games in last 4 days
        const fourDaysAgo = new Date(targetMidnight);
        fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);
        const gamesInLast4Days = completedGames.filter(g => {
          const gDate = new Date(getGameDateStr(g) + 'T12:00:00');
          return gDate >= fourDaysAgo;
        }).length;
        
        return {
          daysRest: diffDays,
          isBackToBack,
          isHeavySchedule: gamesInLast4Days >= 3,
          gamesInLast4Days,
          lastGameDate: lastGameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        };
      };
      
      const homeRest = calculateRest(homeGames, home.id, targetDate);
      const awayRest = calculateRest(awayGames, away.id, targetDate);
      
      // Determine rest advantage
      let restAdvantage = 'EVEN';
      if (homeRest.daysRest !== null && awayRest.daysRest !== null) {
        if (homeRest.daysRest > awayRest.daysRest + 1) restAdvantage = 'HOME';
        else if (awayRest.daysRest > homeRest.daysRest + 1) restAdvantage = 'AWAY';
      }
      
      // Format status strings
      const formatStatus = (rest) => {
        if (rest.daysRest === null) return 'No recent games found';
        if (rest.isBackToBack) return `⚠️ BACK-TO-BACK (played ${rest.lastGameDate})`;
        if (rest.isHeavySchedule) return `⚠️ Heavy schedule (${rest.gamesInLast4Days} games in 4 days)`;
        if (rest.daysRest >= 3) return `✅ Well-rested (${rest.daysRest} days)`;
        return `${rest.daysRest} day(s) rest`;
      };
      
      return {
        category: 'Rest & Schedule Situation',
        source: 'Ball Don\'t Lie API (calculated)',
        home: {
          team: home.full_name || home.name,
          days_rest: homeRest.daysRest,
          status: formatStatus(homeRest),
          is_back_to_back: homeRest.isBackToBack,
          is_heavy_schedule: homeRest.isHeavySchedule || false,
          last_game: homeRest.lastGameDate
        },
        away: {
          team: away.full_name || away.name,
          days_rest: awayRest.daysRest,
          status: formatStatus(awayRest),
          is_back_to_back: awayRest.isBackToBack,
          is_heavy_schedule: awayRest.isHeavySchedule || false,
          last_game: awayRest.lastGameDate
        },
        rest_advantage: restAdvantage,
        note: 'Back-to-backs and heavy schedules can impact performance - investigate how this specific team handles them.'
      };
      
    } catch (error) {
      console.error(`[Stat Router] Error fetching REST_SITUATION:`, error.message);
      return {
        category: 'Rest & Schedule Situation',
        error: 'Unable to calculate rest data',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }
  },

  // ===== CATCH-ALL for unimplemented tokens =====
  DEFAULT: async (bdlSport, home, away) => {
    return {
      error: 'Stat not yet implemented',
      home: { team: home.full_name || home.name },
      away: { team: away.full_name || away.name }
    };
  },

  // ===== NHL SPECIFIC FETCHERS (BETA) =====
  
  POWER_PLAY_PCT: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeRates = ballDontLieService.deriveNhlTeamRates(homeStatsArr);
    const awayRates = ballDontLieService.deriveNhlTeamRates(awayStatsArr);
    
    return {
      category: 'Power Play Percentage',
      source: 'Ball Don\'t Lie API',
      home: {
        team: home.full_name || home.name,
        power_play_pct: homeRates?.ppPct ? fmtPct(homeRates.ppPct) : 'N/A'
      },
      away: {
        team: away.full_name || away.name,
        power_play_pct: awayRates?.ppPct ? fmtPct(awayRates.ppPct) : 'N/A'
      },
      note: 'League average PP% is ~20%. Elite is 24%+.'
    };
  },
  
  PENALTY_KILL_PCT: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeRates = ballDontLieService.deriveNhlTeamRates(homeStatsArr);
    const awayRates = ballDontLieService.deriveNhlTeamRates(awayStatsArr);
    
    return {
      category: 'Penalty Kill Percentage',
      source: 'Ball Don\'t Lie API',
      home: {
        team: home.full_name || home.name,
        penalty_kill_pct: homeRates?.pkPct ? fmtPct(homeRates.pkPct) : 'N/A'
      },
      away: {
        team: away.full_name || away.name,
        penalty_kill_pct: awayRates?.pkPct ? fmtPct(awayRates.pkPct) : 'N/A'
      },
      note: 'League average PK% is ~80%. Elite is 82%+.'
    };
  },
  
  SPECIAL_TEAMS: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeRates = ballDontLieService.deriveNhlTeamRates(homeStatsArr);
    const awayRates = ballDontLieService.deriveNhlTeamRates(awayStatsArr);
    
    return {
      category: 'Special Teams (PP% + PK%)',
      source: 'Ball Don\'t Lie API',
      home: {
        team: home.full_name || home.name,
        power_play_pct: homeRates?.ppPct ? fmtPct(homeRates.ppPct) : 'N/A',
        penalty_kill_pct: homeRates?.pkPct ? fmtPct(homeRates.pkPct) : 'N/A'
      },
      away: {
        team: away.full_name || away.name,
        power_play_pct: awayRates?.ppPct ? fmtPct(awayRates.ppPct) : 'N/A',
        penalty_kill_pct: awayRates?.pkPct ? fmtPct(awayRates.pkPct) : 'N/A'
      },
      interpretation: `Compare ${home.name} PP% vs ${away.name} PK% and vice versa for scoring edges`
    };
  },
  
  GOALS_FOR: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeRates = ballDontLieService.deriveNhlTeamRates(homeStatsArr);
    const awayRates = ballDontLieService.deriveNhlTeamRates(awayStatsArr);
    
    return {
      category: 'Goals For Per Game',
      source: 'Ball Don\'t Lie API',
      home: {
        team: home.full_name || home.name,
        goals_for_per_game: fmtNum(homeRates?.goalsForPerGame)
      },
      away: {
        team: away.full_name || away.name,
        goals_for_per_game: fmtNum(awayRates?.goalsForPerGame)
      }
    };
  },
  
  GOALS_AGAINST: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeRates = ballDontLieService.deriveNhlTeamRates(homeStatsArr);
    const awayRates = ballDontLieService.deriveNhlTeamRates(awayStatsArr);
    
    return {
      category: 'Goals Against Per Game',
      source: 'Ball Don\'t Lie API',
      home: {
        team: home.full_name || home.name,
        goals_against_per_game: fmtNum(homeRates?.goalsAgainstPerGame)
      },
      away: {
        team: away.full_name || away.name,
        goals_against_per_game: fmtNum(awayRates?.goalsAgainstPerGame)
      },
      note: 'Lower is better for defense'
    };
  },
  
  SHOTS_FOR: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeRates = ballDontLieService.deriveNhlTeamRates(homeStatsArr);
    const awayRates = ballDontLieService.deriveNhlTeamRates(awayStatsArr);
    
    return {
      category: 'Shots For Per Game (Possession Proxy)',
      source: 'Ball Don\'t Lie API',
      home: {
        team: home.full_name || home.name,
        shots_for_per_game: fmtNum(homeRates?.shotsForPerGame)
      },
      away: {
        team: away.full_name || away.name,
        shots_for_per_game: fmtNum(awayRates?.shotsForPerGame)
      },
      note: 'Higher shot volume indicates more puck possession'
    };
  },
  
  SHOTS_AGAINST: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeRates = ballDontLieService.deriveNhlTeamRates(homeStatsArr);
    const awayRates = ballDontLieService.deriveNhlTeamRates(awayStatsArr);
    
    return {
      category: 'Shots Against Per Game',
      source: 'Ball Don\'t Lie API',
      home: {
        team: home.full_name || home.name,
        shots_against_per_game: fmtNum(homeRates?.shotsAgainstPerGame)
      },
      away: {
        team: away.full_name || away.name,
        shots_against_per_game: fmtNum(awayRates?.shotsAgainstPerGame)
      },
      note: 'Lower is better - indicates defensive structure'
    };
  },
  
  SHOT_DIFFERENTIAL: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeRates = ballDontLieService.deriveNhlTeamRates(homeStatsArr);
    const awayRates = ballDontLieService.deriveNhlTeamRates(awayStatsArr);
    
    const homeDiff = (homeRates?.shotsForPerGame || 0) - (homeRates?.shotsAgainstPerGame || 0);
    const awayDiff = (awayRates?.shotsForPerGame || 0) - (awayRates?.shotsAgainstPerGame || 0);
    
    return {
      category: 'Shot Differential (Corsi Proxy)',
      source: 'Ball Don\'t Lie API',
      home: {
        team: home.full_name || home.name,
        shots_for: fmtNum(homeRates?.shotsForPerGame),
        shots_against: fmtNum(homeRates?.shotsAgainstPerGame),
        differential: fmtNum(homeDiff, 1)
      },
      away: {
        team: away.full_name || away.name,
        shots_for: fmtNum(awayRates?.shotsForPerGame),
        shots_against: fmtNum(awayRates?.shotsAgainstPerGame),
        differential: fmtNum(awayDiff, 1)
      },
      interpretation: homeDiff > awayDiff 
        ? `${home.name} controls possession better (+${fmtNum(homeDiff - awayDiff, 1)} shots/game)`
        : `${away.name} controls possession better (+${fmtNum(awayDiff - homeDiff, 1)} shots/game)`
    };
  },
  
  FACEOFF_PCT: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeRates = ballDontLieService.deriveNhlTeamRates(homeStatsArr);
    const awayRates = ballDontLieService.deriveNhlTeamRates(awayStatsArr);
    
    return {
      category: 'Faceoff Win Percentage',
      source: 'Ball Don\'t Lie API',
      home: {
        team: home.full_name || home.name,
        faceoff_pct: homeRates?.faceoffWinPct ? fmtPct(homeRates.faceoffWinPct) : 'N/A'
      },
      away: {
        team: away.full_name || away.name,
        faceoff_pct: awayRates?.faceoffWinPct ? fmtPct(awayRates.faceoffWinPct) : 'N/A'
      },
      note: 'Faceoff wins correlate with puck possession and zone time'
    };
  },
  
  GOALIE_STATS: async (bdlSport, home, away, season) => {
    // For NHL, try to get goalie stats from player leaders
    try {
      const leaders = await ballDontLieService.getLeadersGeneric(bdlSport, { season, type: 'save_pct' });
      
      // Find goalies for each team
      const homeGoalies = (leaders || []).filter(l => 
        l.player?.team?.id === home.id || l.team?.id === home.id
      );
      const awayGoalies = (leaders || []).filter(l => 
        l.player?.team?.id === away.id || l.team?.id === away.id
      );
      
      return {
        category: 'Goaltending Stats',
        source: 'Ball Don\'t Lie API (Player Leaders)',
        home: {
          team: home.full_name || home.name,
          goalies: homeGoalies.length > 0 
            ? homeGoalies.slice(0, 2).map(g => ({
                name: g.player?.full_name || `${g.player?.first_name} ${g.player?.last_name}`,
                save_pct: g.value ? fmtPct(g.value) : 'N/A'
              }))
            : [{ note: 'Goalie data unavailable - check scout report' }]
        },
        away: {
          team: away.full_name || away.name,
          goalies: awayGoalies.length > 0 
            ? awayGoalies.slice(0, 2).map(g => ({
                name: g.player?.full_name || `${g.player?.first_name} ${g.player?.last_name}`,
                save_pct: g.value ? fmtPct(g.value) : 'N/A'
              }))
            : [{ note: 'Goalie data unavailable - check scout report' }]
        },
        note: 'Save% >.920 = elite, .910-.920 = average, <.905 = liability'
      };
    } catch (e) {
      return {
        category: 'Goaltending Stats',
        error: 'Goalie data unavailable',
        home: { team: home.full_name || home.name, note: 'Check scout report for goalie info' },
        away: { team: away.full_name || away.name, note: 'Check scout report for goalie info' }
      };
    }
  },
  
  GOAL_DIFFERENTIAL: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeRates = ballDontLieService.deriveNhlTeamRates(homeStatsArr);
    const awayRates = ballDontLieService.deriveNhlTeamRates(awayStatsArr);
    
    const homeDiff = (homeRates?.goalsForPerGame || 0) - (homeRates?.goalsAgainstPerGame || 0);
    const awayDiff = (awayRates?.goalsForPerGame || 0) - (awayRates?.goalsAgainstPerGame || 0);
    
    return {
      category: 'Goal Differential',
      source: 'Ball Don\'t Lie API',
      home: {
        team: home.full_name || home.name,
        goals_for: fmtNum(homeRates?.goalsForPerGame),
        goals_against: fmtNum(homeRates?.goalsAgainstPerGame),
        differential: fmtNum(homeDiff, 2)
      },
      away: {
        team: away.full_name || away.name,
        goals_for: fmtNum(awayRates?.goalsForPerGame),
        goals_against: fmtNum(awayRates?.goalsAgainstPerGame),
        differential: fmtNum(awayDiff, 2)
      },
      interpretation: homeDiff > awayDiff 
        ? `${home.name} has stronger goal differential (+${fmtNum(homeDiff - awayDiff, 2)}/game)`
        : `${away.name} has stronger goal differential (+${fmtNum(awayDiff - homeDiff, 2)}/game)`
    };
  },

  // ===== NHL ENHANCED FETCHERS =====
  
  // NHL Standings with home/road records, streak, and playoff position
  NHL_STANDINGS: async (bdlSport, home, away, season) => {
    if (bdlSport !== 'icehockey_nhl') return null;
    
    try {
      const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });
      
      const findTeam = (teamId) => standings.find(s => s.team?.id === teamId);
      const homeStanding = findTeam(home.id);
      const awayStanding = findTeam(away.id);
      
      const formatStanding = (standing, team) => {
        if (!standing) return { team: team.full_name || team.name, error: 'Standings data unavailable' };
        return {
          team: team.full_name || team.name,
          record: `${standing.wins}-${standing.losses}-${standing.ot_losses || 0}`,
          points: standing.points || 0,
          points_pct: standing.points_pctg ? fmtPct(standing.points_pctg) : 'N/A',
          home_record: standing.home_record || 'N/A',
          road_record: standing.road_record || 'N/A',
          streak: standing.streak || 'N/A',
          goal_differential: standing.goal_differential || 0,
          division: standing.division_name || 'N/A',
          conference: standing.conference_name || 'N/A'
        };
      };
      
      return {
        category: 'NHL Standings & Records',
        source: 'Ball Don\'t Lie API',
        home: formatStanding(homeStanding, home),
        away: formatStanding(awayStanding, away),
        note: 'Home/road records and streaks are critical for NHL betting'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching NHL_STANDINGS:`, error.message);
      return { category: 'NHL Standings', error: 'Data unavailable' };
    }
  },
  
  // NHL Home/Away Splits from standings
  NHL_HOME_AWAY_SPLITS: async (bdlSport, home, away, season) => {
    if (bdlSport !== 'icehockey_nhl') return null;
    
    try {
      const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });
      
      const findTeam = (teamId) => standings.find(s => s.team?.id === teamId);
      const homeStanding = findTeam(home.id);
      const awayStanding = findTeam(away.id);
      
      // Parse record strings like "27-13-1"
      const parseRecord = (recordStr) => {
        if (!recordStr || recordStr === 'N/A') return { wins: 0, losses: 0, otl: 0 };
        const parts = recordStr.split('-').map(n => parseInt(n) || 0);
        return { wins: parts[0] || 0, losses: parts[1] || 0, otl: parts[2] || 0 };
      };
      
      const homeTeamHome = parseRecord(homeStanding?.home_record);
      const homeTeamRoad = parseRecord(homeStanding?.road_record);
      const awayTeamHome = parseRecord(awayStanding?.home_record);
      const awayTeamRoad = parseRecord(awayStanding?.road_record);
      
      // Key insight: home team's HOME record vs away team's ROAD record
      const homeAdvantage = homeTeamHome.wins - homeTeamHome.losses;
      const awayRoadStruggle = awayTeamRoad.wins - awayTeamRoad.losses;
      
      let interpretation = '';
      if (homeAdvantage > 5 && awayRoadStruggle < 0) {
        interpretation = `STRONG HOME EDGE: ${home.name} is ${homeStanding?.home_record} at home vs ${away.name}'s ${awayStanding?.road_record} on road`;
      } else if (awayRoadStruggle > 5) {
        interpretation = `ROAD WARRIOR: ${away.name} is ${awayStanding?.road_record} on the road - home ice less impactful`;
      } else {
        interpretation = `Standard splits - evaluate other factors`;
      }
      
      return {
        category: 'Home/Away Splits',
        source: 'Ball Don\'t Lie API',
        home: {
          team: home.full_name || home.name,
          home_record: homeStanding?.home_record || 'N/A',
          road_record: homeStanding?.road_record || 'N/A',
          note: 'Playing at HOME tonight'
        },
        away: {
          team: away.full_name || away.name,
          home_record: awayStanding?.home_record || 'N/A',
          road_record: awayStanding?.road_record || 'N/A',
          note: 'Playing on ROAD tonight'
        },
        interpretation,
        note: 'NHL home teams have last change advantage - investigate how each team performs home vs road'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching NHL_HOME_AWAY_SPLITS:`, error.message);
      return { category: 'Home/Away Splits', error: 'Data unavailable' };
    }
  },
  
  // NHL Recent Form with L5/L10 analysis including opponent quality
  NHL_RECENT_FORM: async (bdlSport, home, away, season) => {
    if (bdlSport !== 'icehockey_nhl') return null;
    
    try {
      // Get last 45 days of games for both teams
      const today = new Date();
      const dates = [];
      for (let i = 0; i < 45; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().split('T')[0]);
      }
      
      // Get standings for opponent quality context
      const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });
      const standingsMap = {};
      (standings || []).forEach(s => {
        if (s.team?.id) standingsMap[s.team.id] = s;
      });
      
      // Fetch games for both teams
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, { team_ids: [home.id], seasons: [season], per_page: 100 }),
        ballDontLieService.getGames(bdlSport, { team_ids: [away.id], seasons: [season], per_page: 100 })
      ]);
      
      const analyzeRecentForm = (games, teamId, teamName) => {
        if (!games || games.length === 0) return { team: teamName, error: 'No recent games found' };
        
        // Sort by date descending and filter completed games
        const completedGames = games
          .filter(g => g.game_state === 'OFF' || g.game_state === 'FINAL' || g.status === 'Final')
          .sort((a, b) => new Date(b.game_date || b.date) - new Date(a.game_date || a.date));
        
        const l5Games = completedGames.slice(0, 5);
        const l10Games = completedGames.slice(0, 10);
        
        const analyzeGames = (gameList) => {
          let wins = 0, losses = 0, otLosses = 0;
          let goalsFor = 0, goalsAgainst = 0;
          const gameDetails = [];
          
          gameList.forEach(g => {
            const isHome = g.home_team?.id === teamId;
            const teamScore = isHome ? g.home_score : g.away_score;
            const oppScore = isHome ? g.away_score : g.home_score;
            const oppTeam = isHome ? g.away_team : g.home_team;
            const oppStanding = standingsMap[oppTeam?.id];
            
            goalsFor += teamScore || 0;
            goalsAgainst += oppScore || 0;
            
            const margin = (teamScore || 0) - (oppScore || 0);
            let result = 'W';
            if (margin > 0) wins++;
            else if (margin < 0) {
              // Check if OT loss (need to infer from game data)
              losses++;
              result = 'L';
            }
            
            gameDetails.push({
              opponent: oppTeam?.full_name || oppTeam?.name || 'Unknown',
              result: `${result} ${teamScore}-${oppScore}`,
              margin,
              opponent_record: oppStanding ? `${oppStanding.wins}-${oppStanding.losses}-${oppStanding.ot_losses || 0}` : 'N/A',
              opponent_points: oppStanding?.points || 'N/A',
              home_away: isHome ? 'H' : 'A'
            });
          });
          
          const record = `${wins}-${losses}${otLosses > 0 ? `-${otLosses}` : ''}`;
          const avgGF = gameList.length > 0 ? (goalsFor / gameList.length).toFixed(1) : '0';
          const avgGA = gameList.length > 0 ? (goalsAgainst / gameList.length).toFixed(1) : '0';
          
          // Calculate opponent quality
          const avgOppPoints = gameDetails.reduce((sum, g) => sum + (g.opponent_points || 0), 0) / gameDetails.length;
          let scheduleStrength = 'AVERAGE';
          if (avgOppPoints > 90) scheduleStrength = 'TOUGH';
          else if (avgOppPoints < 70) scheduleStrength = 'SOFT';
          
          return { record, wins, losses, avgGF, avgGA, scheduleStrength, games: gameDetails };
        };
        
        const l5Analysis = analyzeGames(l5Games);
        const l10Analysis = analyzeGames(l10Games);
        
        // Trend analysis
        let trend = 'STABLE';
        if (l5Analysis.wins >= 4) trend = 'HOT';
        else if (l5Analysis.losses >= 4) trend = 'COLD';
        else if (l5Analysis.wins > l10Analysis.wins / 2) trend = 'IMPROVING';
        else if (l5Analysis.losses > l10Analysis.losses / 2) trend = 'DECLINING';
        
        return {
          team: teamName,
          l5: {
            record: l5Analysis.record,
            avg_goals_for: l5Analysis.avgGF,
            avg_goals_against: l5Analysis.avgGA,
            schedule_strength: l5Analysis.scheduleStrength,
            recent_games: l5Analysis.games.slice(0, 5)
          },
          l10: {
            record: l10Analysis.record,
            avg_goals_for: l10Analysis.avgGF,
            avg_goals_against: l10Analysis.avgGA,
            schedule_strength: l10Analysis.scheduleStrength
          },
          trend
        };
      };
      
      const homeForm = analyzeRecentForm(homeGames, home.id, home.full_name || home.name);
      const awayForm = analyzeRecentForm(awayGames, away.id, away.full_name || away.name);
      
      return {
        category: 'Recent Form (L5 & L10)',
        source: 'Ball Don\'t Lie API',
        home: homeForm,
        away: awayForm,
        interpretation: `${home.name}: ${homeForm.trend} (L5: ${homeForm.l5?.record || 'N/A'}) | ${away.name}: ${awayForm.trend} (L5: ${awayForm.l5?.record || 'N/A'})`,
        note: 'L5 trends with opponent quality context - investigate WHY not just WHAT'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching NHL_RECENT_FORM:`, error.message);
      return { category: 'Recent Form', error: 'Data unavailable' };
    }
  },
  
  // NHL Hot Players using box scores
  NHL_HOT_PLAYERS: async (bdlSport, home, away, season) => {
    if (bdlSport !== 'icehockey_nhl') return null;
    
    try {
      // Get last 14 days of box scores
      const today = new Date();
      const dates = [];
      for (let i = 0; i < 14; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().split('T')[0]);
      }
      
      // Fetch box scores for both teams
      const boxScores = await ballDontLieService.getNhlRecentBoxScores(dates, {
        team_ids: [home.id, away.id]
      });
      
      if (!boxScores || boxScores.length === 0) {
        return { category: 'Hot Players', error: 'No recent box score data available' };
      }
      
      // Aggregate player stats
      const playerStats = {};
      boxScores.forEach(bs => {
        const playerId = bs.player?.id;
        const teamId = bs.team?.id;
        if (!playerId) return;
        
        if (!playerStats[playerId]) {
          playerStats[playerId] = {
            name: bs.player?.full_name || `${bs.player?.first_name} ${bs.player?.last_name}`,
            position: bs.position || bs.player?.position_code,
            teamId,
            games: 0,
            goals: 0,
            assists: 0,
            points: 0,
            shots: 0,
            plusMinus: 0
          };
        }
        
        playerStats[playerId].games++;
        playerStats[playerId].goals += bs.goals || 0;
        playerStats[playerId].assists += bs.assists || 0;
        playerStats[playerId].points += bs.points || 0;
        playerStats[playerId].shots += bs.shots_on_goal || 0;
        playerStats[playerId].plusMinus += bs.plus_minus || 0;
      });
      
      // Convert to array and calculate PPG
      const players = Object.values(playerStats).map(p => ({
        ...p,
        ppg: p.games > 0 ? (p.points / p.games).toFixed(2) : '0.00'
      }));
      
      // Filter by team and sort by points
      const homeHotPlayers = players
        .filter(p => p.teamId === home.id && p.games >= 3 && p.position !== 'G')
        .sort((a, b) => parseFloat(b.ppg) - parseFloat(a.ppg))
        .slice(0, 5);
      
      const awayHotPlayers = players
        .filter(p => p.teamId === away.id && p.games >= 3 && p.position !== 'G')
        .sort((a, b) => parseFloat(b.ppg) - parseFloat(a.ppg))
        .slice(0, 5);
      
      const formatPlayer = (p) => ({
        name: p.name,
        position: p.position,
        games: p.games,
        goals: p.goals,
        assists: p.assists,
        points: p.points,
        ppg: p.ppg,
        plus_minus: p.plusMinus > 0 ? `+${p.plusMinus}` : p.plusMinus.toString()
      });
      
      return {
        category: 'Hot Players (Last 14 Days)',
        source: 'Ball Don\'t Lie API (Box Scores)',
        home: {
          team: home.full_name || home.name,
          hot_players: homeHotPlayers.map(formatPlayer),
          note: homeHotPlayers.length > 0 && parseFloat(homeHotPlayers[0].ppg) >= 1.0 
            ? `🔥 ${homeHotPlayers[0].name} is HOT (${homeHotPlayers[0].ppg} PPG)` 
            : 'No standout hot players'
        },
        away: {
          team: away.full_name || away.name,
          hot_players: awayHotPlayers.map(formatPlayer),
          note: awayHotPlayers.length > 0 && parseFloat(awayHotPlayers[0].ppg) >= 1.0 
            ? `🔥 ${awayHotPlayers[0].name} is HOT (${awayHotPlayers[0].ppg} PPG)` 
            : 'No standout hot players'
        },
        note: 'Players with 1.0+ PPG over last 14 days are considered "hot"'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching NHL_HOT_PLAYERS:`, error.message);
      return { category: 'Hot Players', error: 'Data unavailable' };
    }
  },
  
  // NHL Head-to-Head History
  NHL_H2H_HISTORY: async (bdlSport, home, away, season) => {
    if (bdlSport !== 'icehockey_nhl') return null;
    
    try {
      // Get games between these two teams (current + last season)
      const seasons = [season, season - 1];
      const games = await ballDontLieService.getGames(bdlSport, {
        team_ids: [home.id],
        seasons,
        per_page: 100
      });
      
      // Filter to only games between these two teams
      const h2hGames = (games || [])
        .filter(g => {
          const isH2H = (g.home_team?.id === home.id && g.away_team?.id === away.id) ||
                        (g.home_team?.id === away.id && g.away_team?.id === home.id);
          const isComplete = g.game_state === 'OFF' || g.game_state === 'FINAL' || g.status === 'Final';
          return isH2H && isComplete;
        })
        .sort((a, b) => new Date(b.game_date || b.date) - new Date(a.game_date || a.date))
        .slice(0, 5);
      
      if (h2hGames.length === 0) {
        return {
          category: 'Head-to-Head History',
          home: { team: home.full_name || home.name },
          away: { team: away.full_name || away.name },
          note: 'No recent head-to-head games found'
        };
      }
      
      let homeWins = 0, awayWins = 0;
      const meetings = h2hGames.map(g => {
        const homeInGame = g.home_team?.id === home.id;
        const homeScore = homeInGame ? g.home_score : g.away_score;
        const awayScore = homeInGame ? g.away_score : g.home_score;
        
        if (homeScore > awayScore) homeWins++;
        else awayWins++;
        
        return {
          date: g.game_date || g.date,
          venue: homeInGame ? 'Home' : 'Away',
          score: `${home.name} ${homeScore} - ${awayScore} ${away.name}`,
          winner: homeScore > awayScore ? home.name : away.name,
          margin: Math.abs(homeScore - awayScore)
        };
      });
      
      // Calculate average margin
      const avgMargin = meetings.reduce((sum, m) => sum + m.margin, 0) / meetings.length;
      
      return {
        category: 'Head-to-Head History',
        source: 'Ball Don\'t Lie API',
        home: {
          team: home.full_name || home.name,
          h2h_record: `${homeWins}-${awayWins}`,
          h2h_wins: homeWins
        },
        away: {
          team: away.full_name || away.name,
          h2h_record: `${awayWins}-${homeWins}`,
          h2h_wins: awayWins
        },
        recent_meetings: meetings,
        avg_margin: avgMargin.toFixed(1),
        interpretation: homeWins > awayWins 
          ? `${home.name} has won ${homeWins} of last ${meetings.length} meetings`
          : awayWins > homeWins 
            ? `${away.name} has won ${awayWins} of last ${meetings.length} meetings`
            : `Series is even at ${homeWins}-${awayWins}`,
        note: 'Divisional matchups tend to be tighter regardless of record'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching NHL_H2H_HISTORY:`, error.message);
      return { category: 'Head-to-Head History', error: 'Data unavailable' };
    }
  },

  // ===== EPL SPECIFIC FETCHERS (BETA) =====

  CLEAN_SHEETS: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Object.fromEntries((homeStatsArr || []).map(s => [s.name, s.value]));
    const awayStats = Object.fromEntries((awayStatsArr || []).map(s => [s.name, s.value]));
    
    return {
      home: {
        team: home.name,
        clean_sheets: homeStats.clean_sheet || 0,
        goals_against: homeStats.goals_conceded || homeStats.goals_conceded_ibox || 0,
        saves: homeStats.saves || 0
      },
      away: {
        team: away.name,
        clean_sheets: awayStats.clean_sheet || 0,
        goals_against: awayStats.goals_conceded || awayStats.goals_conceded_ibox || 0,
        saves: awayStats.saves || 0
      },
      interpretation: `${home.name}: ${homeStats.clean_sheet || 0} clean sheets, ${away.name}: ${awayStats.clean_sheet || 0} clean sheets`
    };
  },

  POSSESSION_PCT: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Object.fromEntries((homeStatsArr || []).map(s => [s.name, s.value]));
    const awayStats = Object.fromEntries((awayStatsArr || []).map(s => [s.name, s.value]));
    
    return {
      home: {
        team: home.name,
        touches: homeStats.touches || 0,
        total_pass: homeStats.total_pass || 0,
        accurate_pass: homeStats.accurate_pass || 0,
        pass_accuracy: homeStats.accurate_pass && homeStats.total_pass ? 
          ((homeStats.accurate_pass / homeStats.total_pass) * 100).toFixed(1) + '%' : 'N/A'
      },
      away: {
        team: away.name,
        touches: awayStats.touches || 0,
        total_pass: awayStats.total_pass || 0,
        accurate_pass: awayStats.accurate_pass || 0,
        pass_accuracy: awayStats.accurate_pass && awayStats.total_pass ?
          ((awayStats.accurate_pass / awayStats.total_pass) * 100).toFixed(1) + '%' : 'N/A'
      },
      interpretation: `Passing comparison - ${home.name} vs ${away.name}`
    };
  },

  SHOTS_ON_TARGET: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Object.fromEntries((homeStatsArr || []).map(s => [s.name, s.value]));
    const awayStats = Object.fromEntries((awayStatsArr || []).map(s => [s.name, s.value]));
    
    return {
      home: {
        team: home.name,
        shots_on_target: homeStats.ontarget_scoring_att || 0,
        total_shots: homeStats.total_scoring_att || 0,
        shot_accuracy: homeStats.ontarget_scoring_att && homeStats.total_scoring_att ?
          ((homeStats.ontarget_scoring_att / homeStats.total_scoring_att) * 100).toFixed(1) + '%' : 'N/A',
        big_chances_missed: homeStats.big_chance_missed || 0
      },
      away: {
        team: away.name,
        shots_on_target: awayStats.ontarget_scoring_att || 0,
        total_shots: awayStats.total_scoring_att || 0,
        shot_accuracy: awayStats.ontarget_scoring_att && awayStats.total_scoring_att ?
          ((awayStats.ontarget_scoring_att / awayStats.total_scoring_att) * 100).toFixed(1) + '%' : 'N/A',
        big_chances_missed: awayStats.big_chance_missed || 0
      },
      interpretation: `Shot comparison - ${home.name}: ${homeStats.ontarget_scoring_att || 0} on target, ${away.name}: ${awayStats.ontarget_scoring_att || 0} on target`
    };
  },

  TACKLES: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Object.fromEntries((homeStatsArr || []).map(s => [s.name, s.value]));
    const awayStats = Object.fromEntries((awayStatsArr || []).map(s => [s.name, s.value]));
    
    return {
      home: {
        team: home.name,
        tackles: homeStats.total_tackle || 0,
        won_tackles: homeStats.won_tackle || 0,
        interceptions: homeStats.interception || 0,
        clearances: homeStats.total_clearance || 0
      },
      away: {
        team: away.name,
        tackles: awayStats.total_tackle || 0,
        won_tackles: awayStats.won_tackle || 0,
        interceptions: awayStats.interception || 0,
        clearances: awayStats.total_clearance || 0
      },
      interpretation: `Defensive actions comparison`
    };
  },

  YELLOW_CARDS: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Object.fromEntries((homeStatsArr || []).map(s => [s.name, s.value]));
    const awayStats = Object.fromEntries((awayStatsArr || []).map(s => [s.name, s.value]));
    
    return {
      home: {
        team: home.name,
        yellow_cards: homeStats.total_yel_card || 0,
        red_cards: homeStats.total_red_card || 0,
        fouls: homeStats.fk_foul_lost || 0
      },
      away: {
        team: away.name,
        yellow_cards: awayStats.total_yel_card || 0,
        red_cards: awayStats.total_red_card || 0,
        fouls: awayStats.fk_foul_lost || 0
      },
      interpretation: `Discipline comparison - ${home.name}: ${homeStats.total_yel_card || 0} yellows, ${away.name}: ${awayStats.total_yel_card || 0} yellows`
    };
  },

  CORNERS: async (bdlSport, home, away, season) => {
    const [homeStatsArr, awayStatsArr] = await Promise.all([
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
      ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
    ]);
    const homeStats = Object.fromEntries((homeStatsArr || []).map(s => [s.name, s.value]));
    const awayStats = Object.fromEntries((awayStatsArr || []).map(s => [s.name, s.value]));
    
    return {
      home: {
        team: home.name,
        corners_won: homeStats.won_corners || 0,
        corners_lost: homeStats.lost_corners || 0,
        corners_into_box: homeStats.total_corners_intobox || 0
      },
      away: {
        team: away.name,
        corners_won: awayStats.won_corners || 0,
        corners_lost: awayStats.lost_corners || 0,
        corners_into_box: awayStats.total_corners_intobox || 0
      },
      interpretation: `Set piece comparison`
    };
  },

  LEAGUE_POSITION: async (bdlSport, home, away, season) => {
    try {
      const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });
      const homeStanding = standings?.find(s => s.team?.id === home.id || s.team?.name?.toLowerCase().includes(home.name?.toLowerCase()));
      const awayStanding = standings?.find(s => s.team?.id === away.id || s.team?.name?.toLowerCase().includes(away.name?.toLowerCase()));
      
      return {
        home: {
          team: home.name,
          position: homeStanding?.position || 'N/A',
          points: homeStanding?.overall_points || 0,
          played: homeStanding?.overall_played || 0,
          won: homeStanding?.overall_won || 0,
          drawn: homeStanding?.overall_drawn || 0,
          lost: homeStanding?.overall_lost || 0,
          goal_difference: homeStanding?.overall_goals_difference || 0,
          form: homeStanding?.form || 'N/A'
        },
        away: {
          team: away.name,
          position: awayStanding?.position || 'N/A',
          points: awayStanding?.overall_points || 0,
          played: awayStanding?.overall_played || 0,
          won: awayStanding?.overall_won || 0,
          drawn: awayStanding?.overall_drawn || 0,
          lost: awayStanding?.overall_lost || 0,
          goal_difference: awayStanding?.overall_goals_difference || 0,
          form: awayStanding?.form || 'N/A'
        },
        interpretation: `${home.name} is ${homeStanding?.position || '?'}th, ${away.name} is ${awayStanding?.position || '?'}th in the table`
      };
    } catch (e) {
      return { error: `Could not fetch standings: ${e.message}` };
    }
  },

  HOME_RECORD: async (bdlSport, home, away, season) => {
    try {
      const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });
      const homeStanding = standings?.find(s => s.team?.id === home.id || s.team?.name?.toLowerCase().includes(home.name?.toLowerCase()));
      const awayStanding = standings?.find(s => s.team?.id === away.id || s.team?.name?.toLowerCase().includes(away.name?.toLowerCase()));
      
      return {
        home: {
          team: home.name,
          home_played: homeStanding?.home_played || 0,
          home_won: homeStanding?.home_won || 0,
          home_drawn: homeStanding?.home_drawn || 0,
          home_lost: homeStanding?.home_lost || 0,
          home_goals_for: homeStanding?.home_goals_for || 0,
          home_goals_against: homeStanding?.home_goals_against || 0,
          home_points: homeStanding?.home_points || 0
        },
        away: {
          team: away.name,
          home_played: awayStanding?.home_played || 0,
          home_won: awayStanding?.home_won || 0,
          home_drawn: awayStanding?.home_drawn || 0,
          home_lost: awayStanding?.home_lost || 0,
          home_goals_for: awayStanding?.home_goals_for || 0,
          home_goals_against: awayStanding?.home_goals_against || 0,
          home_points: awayStanding?.home_points || 0
        },
        interpretation: `Home form - ${home.name}: ${homeStanding?.home_won || 0}W-${homeStanding?.home_drawn || 0}D-${homeStanding?.home_lost || 0}L`
      };
    } catch (e) {
      return { error: `Could not fetch home records: ${e.message}` };
    }
  },

  AWAY_RECORD: async (bdlSport, home, away, season) => {
    try {
      const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });
      const homeStanding = standings?.find(s => s.team?.id === home.id || s.team?.name?.toLowerCase().includes(home.name?.toLowerCase()));
      const awayStanding = standings?.find(s => s.team?.id === away.id || s.team?.name?.toLowerCase().includes(away.name?.toLowerCase()));
      
      return {
        home: {
          team: home.name,
          away_played: homeStanding?.away_played || 0,
          away_won: homeStanding?.away_won || 0,
          away_drawn: homeStanding?.away_drawn || 0,
          away_lost: homeStanding?.away_lost || 0,
          away_goals_for: homeStanding?.away_goals_for || 0,
          away_goals_against: homeStanding?.away_goals_against || 0,
          away_points: homeStanding?.away_points || 0
        },
        away: {
          team: away.name,
          away_played: awayStanding?.away_played || 0,
          away_won: awayStanding?.away_won || 0,
          away_drawn: awayStanding?.away_drawn || 0,
          away_lost: awayStanding?.away_lost || 0,
          away_goals_for: awayStanding?.away_goals_for || 0,
          away_goals_against: awayStanding?.away_goals_against || 0,
          away_points: awayStanding?.away_points || 0
        },
        interpretation: `Away form - ${away.name}: ${awayStanding?.away_won || 0}W-${awayStanding?.away_drawn || 0}D-${awayStanding?.away_lost || 0}L`
      };
    } catch (e) {
      return { error: `Could not fetch away records: ${e.message}` };
    }
  },

  // EPL Player Stats - Top Scorers
  EPL_TOP_SCORERS: async (bdlSport, home, away, season) => {
    try {
      // Get league top scorers
      const leaders = await ballDontLieService.getLeadersGeneric(bdlSport, { season, stat_type: 'goals' });
      
      // Find players from the two teams
      const homeScorers = leaders.filter(p => 
        p.player?.team_ids?.includes(home.id) || 
        p.player?.name?.toLowerCase().includes(home.name?.toLowerCase().split(' ')[0])
      ).slice(0, 3);
      
      const awayScorers = leaders.filter(p => 
        p.player?.team_ids?.includes(away.id) ||
        p.player?.name?.toLowerCase().includes(away.name?.toLowerCase().split(' ')[0])
      ).slice(0, 3);
      
      // Also get top 5 overall
      const topOverall = leaders.slice(0, 5).map(p => ({
        name: p.player?.name || 'Unknown',
        goals: p.value,
        rank: p.rank,
        position: p.player?.position || 'N/A'
      }));
      
      return {
        league_top_5: topOverall,
        home: {
          team: home.name,
          scorers: homeScorers.map(p => ({
            name: p.player?.name || 'Unknown',
            goals: p.value,
            rank: p.rank
          }))
        },
        away: {
          team: away.name,
          scorers: awayScorers.map(p => ({
            name: p.player?.name || 'Unknown',
            goals: p.value,
            rank: p.rank
          }))
        },
        interpretation: `Top scorers comparison for ${home.name} vs ${away.name}`
      };
    } catch (e) {
      return { error: `Could not fetch EPL top scorers: ${e.message}` };
    }
  },

  // EPL Player Stats - Top Assists
  EPL_TOP_ASSISTS: async (bdlSport, home, away, season) => {
    try {
      const leaders = await ballDontLieService.getLeadersGeneric(bdlSport, { season, stat_type: 'goal_assist' });
      
      const homeAssisters = leaders.filter(p => 
        p.player?.team_ids?.includes(home.id)
      ).slice(0, 3);
      
      const awayAssisters = leaders.filter(p => 
        p.player?.team_ids?.includes(away.id)
      ).slice(0, 3);
      
      const topOverall = leaders.slice(0, 5).map(p => ({
        name: p.player?.name || 'Unknown',
        assists: p.value,
        rank: p.rank,
        position: p.player?.position || 'N/A'
      }));
      
      return {
        league_top_5: topOverall,
        home: {
          team: home.name,
          assisters: homeAssisters.map(p => ({
            name: p.player?.name || 'Unknown',
            assists: p.value,
            rank: p.rank
          }))
        },
        away: {
          team: away.name,
          assisters: awayAssisters.map(p => ({
            name: p.player?.name || 'Unknown',
            assists: p.value,
            rank: p.rank
          }))
        },
        interpretation: `Top assist providers for ${home.name} vs ${away.name}`
      };
    } catch (e) {
      return { error: `Could not fetch EPL top assists: ${e.message}` };
    }
  },

  // EPL Key Players - Combined goals + assists leaders
  EPL_KEY_PLAYERS: async (bdlSport, home, away, season) => {
    try {
      const [goalLeaders, assistLeaders] = await Promise.all([
        ballDontLieService.getLeadersGeneric(bdlSport, { season, stat_type: 'goals' }),
        ballDontLieService.getLeadersGeneric(bdlSport, { season, stat_type: 'goal_assist' })
      ]);
      
      // Create a map of player contributions (goals + assists)
      const playerMap = new Map();
      
      goalLeaders.forEach(p => {
        const key = p.player?.id || p.player?.name;
        if (key) {
          playerMap.set(key, {
            name: p.player?.name,
            position: p.player?.position,
            team_ids: p.player?.team_ids || [],
            goals: p.value,
            assists: 0,
            total: p.value
          });
        }
      });
      
      assistLeaders.forEach(p => {
        const key = p.player?.id || p.player?.name;
        if (key) {
          if (playerMap.has(key)) {
            const existing = playerMap.get(key);
            existing.assists = p.value;
            existing.total = existing.goals + p.value;
          } else {
            playerMap.set(key, {
              name: p.player?.name,
              position: p.player?.position,
              team_ids: p.player?.team_ids || [],
              goals: 0,
              assists: p.value,
              total: p.value
            });
          }
        }
      });
      
      const allPlayers = Array.from(playerMap.values()).sort((a, b) => b.total - a.total);
      
      const homeKeyPlayers = allPlayers
        .filter(p => p.team_ids?.includes(home.id))
        .slice(0, 3);
      
      const awayKeyPlayers = allPlayers
        .filter(p => p.team_ids?.includes(away.id))
        .slice(0, 3);
      
      return {
        home: {
          team: home.name,
          key_players: homeKeyPlayers.map(p => ({
            name: p.name,
            position: p.position,
            goals: p.goals,
            assists: p.assists,
            goal_contributions: p.total
          }))
        },
        away: {
          team: away.name,
          key_players: awayKeyPlayers.map(p => ({
            name: p.name,
            position: p.position,
            goals: p.goals,
            assists: p.assists,
            goal_contributions: p.total
          }))
        },
        league_top_contributors: allPlayers.slice(0, 5).map(p => ({
          name: p.name,
          goals: p.goals,
          assists: p.assists,
          total: p.total
        })),
        interpretation: `Key attacking players comparison`
      };
    } catch (e) {
      return { error: `Could not fetch EPL key players: ${e.message}` };
    }
  },

  // ===== WEATHER (NFL/NCAAF - uses Gemini Grounding) =====
  WEATHER: async (bdlSport, home, away, season, options = {}) => {
    // Only applicable for football
    if (bdlSport !== 'americanfootball_nfl' && bdlSport !== 'americanfootball_ncaaf') {
      return {
        category: 'Weather',
        note: 'Weather impact primarily relevant for outdoor football games',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }

    const sport = bdlSport === 'americanfootball_ncaaf' ? 'NCAAF' : 'NFL';
    console.log(`[Stat Router] Fetching WEATHER for ${away.name} @ ${home.name} (${sport})`);

    try {
      const dateStr = new Date().toISOString().slice(0, 10);
      const weather = await getGroundedWeather(
        home.full_name || home.name,
        away.full_name || away.name,
        dateStr
      );

      if (!weather) {
        return {
          category: 'Weather',
          note: 'Weather data unavailable',
          home: { team: home.full_name || home.name },
          away: { team: away.full_name || away.name }
        };
      }

      if (weather.is_dome) {
        return {
          category: 'Weather',
          conditions: 'Indoor/Dome Stadium',
          temperature: 'Controlled (~72°F)',
          wind: 'None',
          impact: 'No weather impact - indoor stadium',
          home: { team: home.full_name || home.name },
          away: { team: away.full_name || away.name }
        };
      }

      const temp = weather.temperature;
      const feelsLike = weather.feels_like;
      const wind = weather.wind_speed;
      const conditions = weather.conditions || 'Clear';

      // Determine impact level
      let impact = 'minimal';
      let impactNotes = [];
      
      if (temp && temp < 32) {
        impact = 'significant';
        impactNotes.push('Freezing temperatures affect ball handling and grip');
      } else if (temp && temp < 40) {
        impact = 'moderate';
        impactNotes.push('Cold weather may reduce passing efficiency');
      }
      
      if (conditions.toLowerCase().includes('snow')) {
        impact = 'significant';
        impactNotes.push('Snow affects visibility and footing');
      } else if (conditions.toLowerCase().includes('rain')) {
        impact = 'moderate';
        impactNotes.push('Rain affects ball security and passing game');
      }
      
      if (wind && wind > 20) {
        impact = 'significant';
        impactNotes.push('High winds affect kicking and deep passing');
      } else if (wind && wind > 12) {
        impact = impact === 'significant' ? 'significant' : 'moderate';
        impactNotes.push('Wind may affect field goals and long passes');
      }

      // Structure weather data in home/away format for proper flattening
      const weatherData = {
        temperature: temp ? `${temp}°F` : 'N/A',
        feels_like: feelsLike ? `${feelsLike}°F` : null,
        wind_speed: wind ? `${wind} mph` : 'N/A',
        conditions: conditions,
        impact: impact
      };
      
      return {
        category: 'Game Weather',
        home: {
          team: home.full_name || home.name,
          ...weatherData
        },
        away: {
          team: away.full_name || away.name,
          ...weatherData  // Same weather for both (it's for the game, not team-specific)
        },
        impact_notes: impactNotes.length > 0 ? impactNotes.join('; ') : 'Normal conditions expected',
        note: 'Weather data via Gemini Grounding'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching weather:`, error.message);
      return {
        category: 'Weather',
        error: error.message,
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }
  },

  // ===== QB WEATHER HISTORY (NFL only - uses Gemini Grounding) =====
  QB_WEATHER_HISTORY: async (bdlSport, home, away, season, options = {}) => {
    // Only applicable for NFL
    if (bdlSport !== 'americanfootball_nfl') {
      return {
        category: 'QB Weather History',
        note: 'Only available for NFL games',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }

    console.log(`[Stat Router] Fetching QB_WEATHER_HISTORY for ${away.name} @ ${home.name}`);

    try {
      // First, get weather for the game via Gemini Grounding
      const dateStr = new Date().toISOString().slice(0, 10);
      const weather = await getGroundedWeather(
        home.full_name || home.name,
        away.full_name || away.name,
        dateStr
      );

      if (!weather || weather.isDome) {
        return {
          category: 'QB Weather History',
          note: weather?.isDome ? 'Indoor/dome stadium - weather not a factor' : 'Weather data unavailable',
          home: { team: home.full_name || home.name },
          away: { team: away.full_name || away.name },
          weather_conditions: weather?.isDome ? 'Indoor' : 'Unknown'
        };
      }

      // Check if weather is adverse enough to matter
      const temp = weather.temperature;
      const windStr = weather.wind || '';
      const windSpeed = parseInt((windStr.match(/(\d+)/) || [])[1]) || 0;
      const conditions = (weather.conditions || '').toLowerCase();
      const isAdverse = (temp && temp < 40) || 
                        (windSpeed > 15) || 
                        conditions.includes('snow') || 
                        conditions.includes('rain');

      if (!isAdverse) {
        return {
          category: 'QB Weather History',
          note: 'Weather conditions are normal - no significant impact expected',
          home: { team: home.full_name || home.name },
          away: { team: away.full_name || away.name },
          weather_conditions: `${temp}°F, ${windStr}, ${weather.conditions}`,
          impact: 'minimal'
        };
      }

      // Use Gemini Grounding for QB weather performance history
      const qbQuery = `NFL QB weather performance history for ${away.full_name || away.name} @ ${home.full_name || home.name}:

Weather conditions: ${temp}°F, ${windStr}, ${conditions}

For each team's starting QB:
1. Name of current starting QB
2. Career games in similar conditions (cold/snow/rain/wind)
3. Career record in adverse weather
4. Completion percentage in cold/adverse weather
5. Assessment: Does this QB perform better or worse in bad weather?

Be factual with historical stats where available.`;

      const qbResult = await geminiGroundingSearch(qbQuery, { temperature: 0.2, maxTokens: 1500 });

      return {
        category: 'QB Cold/Adverse Weather History',
        weather_conditions: `${temp}°F, ${windStr}, ${weather.conditions}`,
        home: {
          team: home.full_name || home.name,
          analysis: qbResult?.success ? qbResult.data : 'Weather analysis unavailable'
        },
        away: {
          team: away.full_name || away.name,
          analysis: qbResult?.success ? qbResult.data : 'Weather analysis unavailable'
        },
        note: 'Historical QB performance in similar weather conditions via Gemini Grounding'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching QB weather history:`, error.message);
      return {
        category: 'QB Weather History',
        error: error.message,
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name },
        note: 'Unable to fetch QB weather performance data'
      };
    }
  }
};

// Add aliases for tokens that use the same fetcher
const ALIASES = {
  // NHL Aliases - Enhanced with new fetchers
  SHOT_METRICS: 'SHOT_DIFFERENTIAL',
  SHOT_QUALITY: 'SHOT_DIFFERENTIAL',
  SAVE_PCT: 'GOALIE_STATS',
  GOALS_AGAINST_AVG: 'GOALIE_STATS',
  GOALIE_MATCHUP: 'GOALIE_STATS',
  PP_OPPORTUNITIES: 'SPECIAL_TEAMS',
  SCORING_FIRST: 'RECENT_FORM',
  CORSI_FOR_PCT: 'SHOT_DIFFERENTIAL',
  EXPECTED_GOALS: 'SHOT_DIFFERENTIAL',
  PDO: 'SHOT_DIFFERENTIAL',
  HIGH_DANGER_CHANCES: 'SHOT_DIFFERENTIAL',
  BACK_TO_BACK: 'REST_SITUATION',
  HOME_ICE: 'HOME_AWAY_SPLITS',
  ROAD_PERFORMANCE: 'HOME_AWAY_SPLITS',
  POSSESSION_METRICS: 'FACEOFF_PCT',
  TOP_SCORERS: 'TOP_PLAYERS',
  LINE_COMBINATIONS: 'TOP_PLAYERS',
  LUCK_INDICATORS: 'RECENT_FORM',
  OVERTIME_RECORD: 'RECENT_FORM',
  DIVISION_STANDING: 'STANDINGS',
  // NHL-specific aliases for new fetchers (auto-routed via sportSpecificToken)
  NHL_HOME_ICE: 'NHL_HOME_AWAY_SPLITS',
  NHL_ROAD_PERFORMANCE: 'NHL_HOME_AWAY_SPLITS',
  NHL_BACK_TO_BACK: 'REST_SITUATION',
  NHL_STREAK: 'NHL_STANDINGS',
  NHL_RECORD: 'NHL_STANDINGS',
  NHL_SCORING_LEADERS: 'NHL_HOT_PLAYERS',
  NHL_POINT_LEADERS: 'NHL_HOT_PLAYERS',
  NHL_HEAD_TO_HEAD: 'NHL_H2H_HISTORY',
  NHL_SERIES_HISTORY: 'NHL_H2H_HISTORY',
  NHL_L5: 'NHL_RECENT_FORM',
  NHL_L10: 'NHL_RECENT_FORM',
  NHL_MOMENTUM: 'NHL_RECENT_FORM',
  // EPL Aliases
  PASS_ACCURACY: 'POSSESSION_PCT',
  TOUCHES_IN_BOX: 'SHOTS_ON_TARGET',
  CROSSES: 'CORNERS',
  INTERCEPTIONS: 'TACKLES',
  CLEARANCES: 'TACKLES',
  SAVES: 'CLEAN_SHEETS',
  SHOTS_TOTAL: 'SHOTS_ON_TARGET',
  BIG_CHANCES_CREATED: 'SHOTS_ON_TARGET',
  BIG_CHANCES_MISSED: 'SHOTS_ON_TARGET',
  FREE_KICKS: 'CORNERS',
  PENALTIES_WON: 'CORNERS',
  PENALTIES_CONCEDED: 'CORNERS',
  RED_CARDS: 'YELLOW_CARDS',
  FOULS: 'YELLOW_CARDS',
  HOME_FORM: 'HOME_RECORD',
  AWAY_FORM: 'AWAY_RECORD',
  LAST_5_RESULTS: 'LEAGUE_POSITION',
  HEAD_TO_HEAD: 'RECENT_FORM',
  DRAW_FREQUENCY: 'RECENT_FORM',
  FIXTURE_CONGESTION: 'RECENT_FORM',
  EUROPEAN_FOOTBALL: 'RECENT_FORM',
  MOTIVATION: 'RECENT_FORM',
  XG_DIFFERENCE: 'SHOTS_ON_TARGET',
  XG_OVERPERFORMANCE: 'SHOTS_ON_TARGET',
  PACE_LAST_10: 'PACE',
  PACE_HOME_AWAY: 'HOME_AWAY_SPLITS',
  EFFICIENCY_LAST_10: 'NET_RATING',
  OPP_EFG_PCT: 'EFG_PCT',
  OPP_TOV_RATE: 'TURNOVER_RATE',
  PAINT_SCORING: 'EFG_PCT',
  MIDRANGE: 'EFG_PCT',
  PAINT_DEFENSE: 'DEFENSIVE_RATING',
  PERIMETER_DEFENSE: 'THREE_PT_SHOOTING',
  TRANSITION_DEFENSE: 'DEFENSIVE_RATING',
  // CLUTCH_STATS now has its own fetcher - calculates close game record
  QUARTER_SPLITS: 'RECENT_FORM',
  // LINEUP_DATA only available once game starts (BDL limitation) - not useful for pre-game
  LINEUP_DATA: 'TOP_PLAYERS',
  // NBA-specific aliases for quarter scoring (point to NFL implementations - same BDL structure)
  FIRST_HALF_SCORING: 'FIRST_HALF_TRENDS',
  SECOND_HALF_SCORING: 'SECOND_HALF_TRENDS',
  BACK_TO_BACK: 'REST_SITUATION',
  // USAGE_RATES has its own fetcher now - no alias needed
  // VS_ELITE_TEAMS has its own fetcher now - no alias needed
  // H2H_HISTORY has its own fetcher now - no alias needed
  ATS_TRENDS: 'RECENT_FORM',
  // LUCK_ADJUSTED has its own fetcher now - no alias needed
  SCHEDULE_STRENGTH: 'HOME_AWAY_SPLITS',
  TEMPO_CONTROL: 'PACE',
  DREB_RATE: 'OREB_RATE',
  OPP_FT_RATE: 'FT_RATE',
  THREE_PT_DEFENSE: 'THREE_PT_SHOOTING',
  TWO_PT_SHOOTING: 'EFG_PCT',
  HOME_COURT_VALUE: 'HOME_AWAY_SPLITS',
  ROAD_PERFORMANCE: 'HOME_AWAY_SPLITS',
  CONFERENCE_STATS: 'HOME_AWAY_SPLITS',
  NON_CONF_STRENGTH: 'HOME_AWAY_SPLITS',
  EXPERIENCE: 'TOP_PLAYERS',
  // BENCH_DEPTH has its own fetcher now - no alias needed
  VS_RANKED: 'RECENT_FORM',
  CLOSE_GAME_RECORD: 'RECENT_FORM',
  EFFICIENCY_TREND: 'NET_RATING',
  // NFL/NCAAF aliases removed - each token should return unique data
  // Keeping only essential NCAAF aliases that don't have BDL data
  SP_PLUS_RATINGS: 'NET_RATING',
  SP_PLUS_TREND: 'NET_RATING',
  FEI_RATINGS: 'NET_RATING',
  TALENT_COMPOSITE: 'TOP_PLAYERS',
  BLUE_CHIP_RATIO: 'TOP_PLAYERS',
  TRANSFER_PORTAL: 'TOP_PLAYERS',
  // NCAAF schedule strength aliases - these are CRITICAL for CFP analysis
  STRENGTH_OF_SCHEDULE: 'NCAAF_STRENGTH_OF_SCHEDULE',
  OPPONENT_ADJUSTED: 'NCAAF_OPPONENT_ADJUSTED',
  CONFERENCE_STRENGTH: 'NCAAF_CONFERENCE_STRENGTH',
  VS_POWER_OPPONENTS: 'NCAAF_VS_POWER_OPPONENTS',
  TRAVEL_FATIGUE: 'NCAAF_TRAVEL_FATIGUE',
  // NCAAF-specific advanced stat aliases (BDL doesn't have these - use Gemini Grounding)
  NCAAF_SP_PLUS_RATINGS: 'NCAAF_SP_PLUS',
  NCAAF_FPI_RATINGS: 'NCAAF_FPI',
  NCAAF_FEI_RATINGS: 'NCAAF_FPI',
  NCAAF_EPA: 'NCAAF_EPA_ADVANCED',
  NCAAF_SUCCESS_RATE: 'NCAAF_EPA_ADVANCED',
  NCAAF_HAVOC: 'NCAAF_HAVOC_RATE',
  NCAAF_EXPLOSIVE_PLAYS: 'NCAAF_EXPLOSIVENESS',
  NCAAF_RUSH_EFFICIENCY: 'NCAAF_RUSHING_EFFICIENCY',
  NCAAF_PASS_EFFICIENCY: 'NCAAF_PASSING_EFFICIENCY',
  NCAAF_REDZONE: 'NCAAF_RED_ZONE'
};

// Resolve aliases
for (const [alias, target] of Object.entries(ALIASES)) {
  if (!FETCHERS[alias] && FETCHERS[target]) {
    FETCHERS[alias] = FETCHERS[target];
  }
}

// Default handler for unknown tokens
for (const token of Object.keys(ALIASES)) {
  if (!FETCHERS[token]) {
    FETCHERS[token] = FETCHERS.DEFAULT;
  }
}

// Helper functions
async function fetchTopPlayersForTeam(bdlSport, team, season) {
  try {
    // For NCAAB, use the player_season_stats endpoint which gives season averages directly
    // This is more reliable than aggregating per-game stats
    if (bdlSport === 'basketball_ncaab') {
      const seasonStats = await ballDontLieService.getNcaabPlayerSeasonStats({
        teamIds: [team.id],
        season
      });
      
      if (!seasonStats || seasonStats.length === 0) {
        // Fallback to per-game stats if season stats unavailable
        const gameStats = await ballDontLieService.getPlayerStats(bdlSport, {
          seasons: [season],
          team_ids: [team.id],
          per_page: 10
        });
        
        if (!gameStats || gameStats.length === 0) {
          return [{ note: 'No player stats available' }];
        }
        
        // Aggregate per-game stats
        const playerMap = new Map();
        gameStats.forEach(g => {
          const playerId = g.player?.id;
          if (!playerId) return;
          if (!playerMap.has(playerId)) {
            playerMap.set(playerId, {
              player: g.player,
              games: 0,
              pts: 0, reb: 0, ast: 0, stl: 0, blk: 0,
              fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0
            });
          }
          const p = playerMap.get(playerId);
          p.games++;
          p.pts += g.pts || 0;
          p.reb += g.reb || 0;
          p.ast += g.ast || 0;
          p.stl += g.stl || 0;
          p.blk += g.blk || 0;
          p.fgm += g.fgm || 0;
          p.fga += g.fga || 0;
          p.fg3m += g.fg3m || 0;
          p.fg3a += g.fg3a || 0;
          p.ftm += g.ftm || 0;
          p.fta += g.fta || 0;
        });
        
        const sorted = Array.from(playerMap.values())
          .filter(p => p.games >= 3)
          .sort((a, b) => (b.pts / b.games) - (a.pts / a.games))
          .slice(0, 5);
        
        return sorted.map(p => ({
          name: `${p.player?.first_name || ''} ${p.player?.last_name || ''}`.trim(),
          position: p.player?.position || 'N/A',
          games: p.games,
          ppg: fmtNum(p.pts / p.games),
          rpg: fmtNum(p.reb / p.games),
          apg: fmtNum(p.ast / p.games),
          fg_pct: p.fga > 0 ? fmtNum((p.fgm / p.fga) * 100) + '%' : 'N/A',
          fg3_pct: p.fg3a > 0 ? fmtNum((p.fg3m / p.fg3a) * 100) + '%' : 'N/A'
        }));
      }
      
      // Use season stats directly - this is the preferred path
      const sorted = seasonStats
        .filter(p => p.games_played >= 3)
        .sort((a, b) => (b.pts || 0) - (a.pts || 0)) // pts is total points, higher = more production
        .slice(0, 5);
      
      return sorted.map(p => {
        const games = p.games_played || 1;
        return {
          name: `${p.player?.first_name || ''} ${p.player?.last_name || ''}`.trim(),
          position: p.player?.position || 'N/A',
          games: games,
          // Season stats gives totals, calculate per-game
          ppg: fmtNum((p.pts || 0) / games),
          rpg: fmtNum((p.reb || 0) / games),
          apg: fmtNum((p.ast || 0) / games),
          spg: fmtNum((p.stl || 0) / games),
          bpg: fmtNum((p.blk || 0) / games),
          fg_pct: p.fg_pct ? fmtNum(p.fg_pct) + '%' : 'N/A',
          fg3_pct: p.fg3_pct ? fmtNum(p.fg3_pct) + '%' : 'N/A',
          ft_pct: p.ft_pct ? fmtNum(p.ft_pct) + '%' : 'N/A',
          min_pg: fmtNum(p.min || 0)
        };
      });
    }
    
    // Default path for other sports
    const seasonStats = await ballDontLieService.getPlayerStats(bdlSport, {
      seasons: [season],
      team_ids: [team.id],
      per_page: 10
    });
    
    if (!seasonStats || seasonStats.length === 0) {
      return [{ note: 'No player stats available' }];
    }
    
    // Sort by points or relevant stat
    const sorted = seasonStats
      .filter(p => p.games_played > 0)
      .sort((a, b) => (b.pts || b.points || 0) - (a.pts || a.points || 0))
      .slice(0, 5);
    
    return sorted.map(p => ({
      name: `${p.player?.first_name || ''} ${p.player?.last_name || ''}`.trim(),
      position: p.player?.position || 'N/A',
      games: p.games_played,
      ppg: fmtNum(p.pts_per_game || p.points_per_game || (p.pts / p.games_played)),
      rpg: fmtNum(p.reb_per_game || p.rebounds_per_game || (p.reb / p.games_played)),
      apg: fmtNum(p.ast_per_game || p.assists_per_game || (p.ast / p.games_played))
    }));
  } catch (error) {
    console.warn(`[Stat Router] Error fetching players for ${team.name}:`, error.message);
    return [{ note: 'Player stats unavailable' }];
  }
}

function formatRecentGames(games, teamName, standingsMap = null) {
  if (!games || games.length === 0) {
    return { record: 'N/A', games: [], note: 'No recent game data available' };
  }
  
  // Filter to only completed games - handle NBA, NCAAB, and NFL field names
  // Per BDL API docs:
  // - NFL: status: 'Final', uses home_team_score/visitor_team_score
  // - NBA: status: 'Final', uses home_team_score/visitor_team_score  
  // - NCAAB: status: 'post', period_detail: 'Final', uses home_score/away_score
  const completedGames = games.filter(g => {
    // NFL and NBA use 'Final', NCAAB uses 'post' or period_detail='Final'
    const hasStatus = isGameCompleted(g.status) || g.period_detail?.toLowerCase() === 'final';
    const hasNBAScore = g.home_team_score !== null && g.home_team_score !== undefined;
    const hasNCAABScore = g.home_score !== null && g.home_score !== undefined;
    // Ensure game date is in the past (avoids including scheduled games)
    const gameDate = new Date(g.date);
    const isPast = gameDate < new Date();
    return hasStatus && (hasNBAScore || hasNCAABScore) && isPast;
  });
  
  if (completedGames.length === 0) {
    return { record: 'N/A', games: [], note: 'No completed games found' };
  }
  
  // Helper function to process N games
  const processGames = (gamesToProcess) => {
    let wins = 0, losses = 0, ties = 0;
    let closeWins = 0, closeLosses = 0, blowoutWins = 0, blowoutLosses = 0;
    let totalOppWins = 0, oppsWithRecords = 0;
    
    const gameDetails = gamesToProcess.map(g => {
      // Handle both nested object and string team names
      const homeTeamName = g.home_team?.name || g.home_team?.full_name || g.home_team;
      const awayTeamName = g.visitor_team?.name || g.visitor_team?.full_name || g.away_team?.name || g.away_team;
      const homeTeamId = g.home_team?.id;
      const awayTeamId = g.visitor_team?.id || g.away_team?.id;
      
      // Normalize for comparison
      const normalizedTeamName = String(teamName).toLowerCase();
      const normalizedHome = String(homeTeamName).toLowerCase();
      const normalizedAway = String(awayTeamName).toLowerCase();
      
      const isHome = normalizedHome.includes(normalizedTeamName) || normalizedTeamName.includes(normalizedHome);
      
      // Handle both NBA and NCAAB field names for scores
      const homeScore = g.home_team_score ?? g.home_score ?? 0;
      const awayScore = g.visitor_team_score ?? g.away_score ?? 0;
      
      const teamScore = isHome ? homeScore : awayScore;
      const oppScore = isHome ? awayScore : homeScore;
      const opponent = isHome ? awayTeamName : homeTeamName;
      const opponentId = isHome ? awayTeamId : homeTeamId;
      
      // Calculate margin
      const margin = teamScore - oppScore;
      const absMargin = Math.abs(margin);
      
      // Classify game type
      let gameType = 'comfortable';
      if (absMargin <= 7) gameType = 'CLOSE';
      else if (absMargin >= 14) gameType = 'BLOWOUT';
      
      let result = 'T';
      if (teamScore > oppScore) {
        wins++;
        result = 'W';
        if (gameType === 'CLOSE') closeWins++;
        else if (gameType === 'BLOWOUT') blowoutWins++;
      } else if (oppScore > teamScore) {
        losses++;
        result = 'L';
        if (gameType === 'CLOSE') closeLosses++;
        else if (gameType === 'BLOWOUT') blowoutLosses++;
      } else {
        ties++;
      }
      
      // Get opponent record from standings if available
      let oppRecord = null;
      let oppWins = null;
      if (standingsMap && opponentId) {
        const oppStanding = standingsMap.get(opponentId);
        if (oppStanding) {
          oppRecord = oppStanding.overall_record || `${oppStanding.wins || 0}-${oppStanding.losses || 0}`;
          oppWins = oppStanding.wins || 0;
          totalOppWins += oppWins;
          oppsWithRecords++;
        }
      }
      
      // Format date
      const gameDate = g.date ? new Date(g.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
      
      return {
        result,
        score: `${teamScore}-${oppScore}`,
        margin: margin,
        absMargin: absMargin,
        gameType: gameType,
        opponent: opponent || 'Unknown',
        opponentRecord: oppRecord,
        opponentWins: oppWins,
        location: isHome ? 'Home' : 'Away',
        date: gameDate,
        week: g.week || null,
        display: `${result} ${teamScore}-${oppScore} (${margin > 0 ? '+' : ''}${margin}) ${isHome ? 'vs' : '@'} ${opponent}${oppRecord ? ` (${oppRecord})` : ''}${gameDate ? ` - ${gameDate}` : ''}`
      };
    });
    
    const record = ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
    const streak = gameDetails.map(g => g.result).join('');
    
    // Build enhanced analysis
    const avgOppWins = oppsWithRecords > 0 ? (totalOppWins / oppsWithRecords).toFixed(1) : null;
    const playoffCaliberOpps = gameDetails.filter(g => g.opponentWins && g.opponentWins >= 8).length;
    
    return {
      record,
      streak,
      games: gameDetails,
      analysis: {
        wins, losses, ties,
        closeWins,
        closeLosses,
        blowoutWins,
        blowoutLosses,
        avgOpponentWins: avgOppWins,
        playoffCaliberOpponents: playoffCaliberOpps
      }
    };
  };
  
  // Process L5 and L10
  const l5Games = completedGames.slice(0, 5);
  const l10Games = completedGames.slice(0, 10);
  
  const l5Data = processGames(l5Games);
  const l10Data = processGames(l10Games);
  
  // Build narrative context for Gary (based on L5)
  const narrativeParts = [];
  const { closeLosses, closeWins, blowoutLosses, losses, wins, avgOpponentWins } = l5Data.analysis;
  
  if (closeLosses >= 2) {
    narrativeParts.push(`⚠️ ${closeLosses} of ${losses} L5 losses were CLOSE (≤7 pts) - NOT a freefall`);
  }
  if (closeWins >= 2) {
    narrativeParts.push(`⚠️ ${closeWins} of ${wins} L5 wins were close - investigate sustainability`);
  }
  if (blowoutLosses >= 2) {
    narrativeParts.push(`🚨 ${blowoutLosses} BLOWOUT losses (14+ pts) in L5 - concerning trend`);
  }
  if (avgOpponentWins && parseFloat(avgOpponentWins) >= 7) {
    narrativeParts.push(`📊 Tough L5 schedule: avg opponent has ${avgOpponentWins} wins`);
  }
  if (avgOpponentWins && parseFloat(avgOpponentWins) <= 4) {
    narrativeParts.push(`📊 Easy L5 schedule: avg opponent has only ${avgOpponentWins} wins`);
  }
  
  // Compare L5 vs L10 trend
  const l5WinPct = l5Data.analysis.wins / (l5Data.analysis.wins + l5Data.analysis.losses) || 0;
  const l10WinPct = l10Data.analysis.wins / (l10Data.analysis.wins + l10Data.analysis.losses) || 0;
  const trendDiff = l5WinPct - l10WinPct;
  
  if (trendDiff >= 0.2) {
    narrativeParts.push(`📈 TRENDING UP: L5 (${l5Data.record}) is better than L10 (${l10Data.record})`);
  } else if (trendDiff <= -0.2) {
    narrativeParts.push(`📉 TRENDING DOWN: L5 (${l5Data.record}) is worse than L10 (${l10Data.record})`);
  }
  
  return {
    // L5 Summary (primary)
    record: l5Data.record,
    last_5: l5Data.streak,
    games: l5Data.games,
    summary: l5Data.games.map(g => g.display).join(' | '),
    analysis: l5Data.analysis,
    
    // L10 Summary (extended view)
    L10: {
      record: l10Data.record,
      streak: l10Data.streak,
      gamesPlayed: l10Data.games.length,
      summary: l10Data.games.slice(0, 10).map(g => g.display).join(' | '),
      analysis: l10Data.analysis
    },
    
    // Trend comparison
    trend: {
      L5_win_pct: (l5WinPct * 100).toFixed(0) + '%',
      L10_win_pct: (l10WinPct * 100).toFixed(0) + '%',
      direction: trendDiff >= 0.2 ? 'UP' : trendDiff <= -0.2 ? 'DOWN' : 'STABLE',
      note: trendDiff >= 0.2 ? 'Recent form better than extended form' : 
            trendDiff <= -0.2 ? 'Recent form worse than extended form' : 
            'Consistent performance over L5 and L10'
    },
    
    narrative: narrativeParts.length > 0 ? narrativeParts.join('. ') : 'No significant patterns detected.',
    CONTEXT: '🔍 INVESTIGATE THE WHY: A 1-4 team with 3 close losses to playoff teams is NOT the same as a 1-4 team with 3 blowout losses to weak teams.'
  };
}

function buildPaceAnalysis(homeStats, awayStats) {
  const homePace = homeStats?.pace || 0;
  const awayPace = awayStats?.pace || 0;
  const gap = Math.abs(homePace - awayPace);
  
  if (gap > 4) {
    return `SIGNIFICANT PACE CLASH: ${gap.toFixed(1)} possession difference`;
  } else if (gap > 2) {
    return `Moderate pace difference: ${gap.toFixed(1)} possessions`;
  } else {
    return `Similar pace profiles`;
  }
}

function interpretTurnoverMargin(homeStats, awayStats) {
  const homeDiff = homeStats?.misc_turnover_differential || 0;
  const awayDiff = awayStats?.misc_turnover_differential || 0;
  
  const parts = [];
  if (Math.abs(homeDiff) > 6) {
    parts.push(`${homeStats?.team?.name || 'Home'}: ${homeDiff > 0 ? 'LUCKY' : 'UNLUCKY'} (investigate sustainability)`);
  }
  if (Math.abs(awayDiff) > 6) {
    parts.push(`${awayStats?.team?.name || 'Away'}: ${awayDiff > 0 ? 'LUCKY' : 'UNLUCKY'} (investigate sustainability)`);
  }
  
  return parts.length > 0 ? parts.join('; ') : 'Both teams near expected turnover rates';
}

/**
 * Introspection helpers (used for debugging / smoke testing token menus)
 */
export function listAvailableStatTokens() {
  return Object.keys(FETCHERS);
}

export default { fetchStats, listAvailableStatTokens };
