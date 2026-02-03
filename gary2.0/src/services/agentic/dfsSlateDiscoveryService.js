/**
 * DFS Slate Discovery Service
 * 
 * This service handles the discovery of DFS slates (Main, Turbo, Night, etc.)
 * for DraftKings and FanDuel. It uses Gemini Grounding as the primary source
 * to accurately map which games belong to which slates.
 * 
 * Key Features:
 * - Gemini Grounding for accurate slate-to-game mappings
 * - Multiple fallback methods (RotoWire scraper, Tank01 heuristic, BDL schedule)
 * - Generates lineups for ALL available slates
 * - Excludes single-game/Showdown slates (not supported)
 */

import { geminiGroundingSearch } from './scoutReport/scoutReportBuilder.js';
import { normalizeTeamAbbreviation } from './agenticUtils.js';
import { fetchSlatesFromRotoWire, populateSlateTeams } from '../rotowireSlateService.js';
import { ballDontLieService } from '../ballDontLieService.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const SUPPORTED_SPORTS = ['nba', 'nfl', 'mlb', 'nhl'];

// Slate types we explicitly exclude
const EXCLUDED_SLATE_TYPES = [
  'showdown',
  'single game',
  'captain mode',
  'tiers',
  'battle royale'
];

// ============================================================================
// MAIN DISCOVERY FUNCTION
// ============================================================================

/**
 * Discovers all available DFS slates for a given sport, platform, and date.
 * Uses a cascading fallback strategy with Gemini Grounding as the primary source.
 * 
 * @param {string} sport - The sport (nba, nfl, mlb, nhl)
 * @param {string} platform - The platform (draftkings, fanduel)
 * @param {Date|string} date - The date to discover slates for
 * @returns {Promise<Array>} - Array of slate objects
 */
export async function discoverDFSSlates(sport, platform, date = new Date()) {
  const normalizedSport = sport.toLowerCase();
  const normalizedPlatform = normalizePlatform(platform);
  const targetDateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
  const targetDate = new Date(targetDateStr + 'T12:00:00');

  console.log(`[Slate Discovery] Starting discovery for ${normalizedSport.toUpperCase()} on ${normalizedPlatform} (${targetDateStr})`);

  // Define discovery methods in priority order
  const discoveryMethods = [
    {
      name: 'Gemini Grounding',
      fn: () => discoverSlatesWithGrounding(normalizedSport, normalizedPlatform, targetDateStr),
      priority: 1
    },
    {
      name: 'RotoWire Scraper',
      fn: () => scrapeRotoWireSlates(normalizedSport, normalizedPlatform, targetDateStr),
      priority: 2
    },
    {
      name: 'BDL Schedule Fallback',
      fn: () => getAllGamesAsSlate(normalizedSport, normalizedPlatform, targetDateStr),
      priority: 3
    }
  ];

  // Try each method in order
  for (const method of discoveryMethods) {
    try {
      console.log(`[Slate Discovery] Attempting ${method.name}...`);
      const slates = await method.fn();

      if (slates && slates.length > 0) {
        // Filter out single-game/showdown slates
        const classicSlates = filterToClassicSlates(slates);
        
        if (classicSlates.length > 0) {
          console.log(`[Slate Discovery] ✓ ${method.name} returned ${classicSlates.length} classic slates`);
          
          // Ensure all slates have IDs and consistent formatting
          return classicSlates.map(s => ({
            ...s,
            id: s.id || generateSlateId(s.name),
            source: method.name
          }));
        }
      }
      
      console.log(`[Slate Discovery] ✗ ${method.name} returned insufficient data`);
    } catch (error) {
      console.warn(`[Slate Discovery] ${method.name} failed:`, error.message);
    }
  }

  return [];
}

// ============================================================================
// GEMINI GROUNDING DISCOVERY (PRIMARY METHOD)
// ============================================================================

async function discoverSlatesWithGrounding(sport, platform, dateStr) {
  const formattedDate = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
  const sportName = sport.toUpperCase();
  
  const groundingPrompt = `
Search ${platform === 'fanduel' ? 'FanDuel' : 'DraftKings'} and RotoWire for today's ${sportName} DFS slates on ${formattedDate}.

CRITICAL: For ${platform}, find ALL available classic/full roster slates (NOT single-game or showdown contests).

IMPORTANT: Each slate contains DIFFERENT games. Late-night slates like "After Hours" or "Night" only contain the LATE games (10:00 PM+ ET), NOT the earlier games.

For EACH slate, I need:
1. The slate name (Main, Turbo, Night, Express, After Hours, etc.)
2. The EXACT matchups included in THAT SPECIFIC SLATE (format: AWAY@HOME)
3. The lock time (when the first game in THAT slate starts)
4. The number of games in THAT SPECIFIC slate

Example for FanDuel NBA:
- Main Slate (7:30 PM): ALL games
- Express (8:00 PM): Later games only (starting 8 PM or later)
- After Hours (10:30 PM): ONLY west coast late games (10:30 PM or later)

Return ONLY valid JSON in this exact format with no additional text:
{
  "slates": [
    {
      "name": "Main",
      "slateType": "classic",
      "gameCount": 5,
      "lockTime": "7:30 PM ET",
      "matchups": ["MIA@IND", "CHA@PHI", "OKC@MEM", "ATL@LAL", "POR@GSW"],
      "teams": ["MIA", "IND", "CHA", "PHI", "OKC", "MEM", "ATL", "LAL", "POR", "GSW"]
    },
    {
      "name": "After Hours",
      "slateType": "classic",
      "gameCount": 2,
      "lockTime": "10:30 PM ET",
      "matchups": ["ATL@LAL", "POR@GSW"],
      "teams": ["ATL", "LAL", "POR", "GSW"]
    }
  ]
}
`.trim();

  const response = await geminiGroundingSearch(groundingPrompt, {
    temperature: 1.0,
    maxTokens: 2048
  });

  if (!response || !response.data) return null;

  try {
    let jsonStr = response.data
      .replace(/```json\n?/gi, '')
      .replace(/```\n?/g, '')
      .trim();

    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const data = JSON.parse(jsonMatch[0]);
    if (!data.slates || !Array.isArray(data.slates)) {
      console.log('[Slate Parsing] No slates array in data:', data);
      return null;
    }

    const slates = data.slates.map(slate => normalizeSlateData(slate));
    console.log(`[Slate Parsing] Parsed ${slates.length} slates from Grounding`);
    return slates;
  } catch (error) {
    console.error('[Slate Parsing] Grounding parse failed:', error.message);
    return null;
  }
}

function normalizeSlateData(slate) {
  const normalizedTeams = (slate.teams || []).map(team => normalizeTeamAbbreviation(team));
  const normalizedMatchups = (slate.matchups || []).map(matchup => {
    const parts = matchup.split('@');
    if (parts.length !== 2) return matchup;
    return `${normalizeTeamAbbreviation(parts[0])}@${normalizeTeamAbbreviation(parts[1])}`;
  });

  // Ensure teams list matches matchups if it was missing or incomplete
  const derivedTeams = new Set(normalizedTeams);
  normalizedMatchups.forEach(m => {
    const parts = m.split('@');
    if (parts.length === 2) {
      derivedTeams.add(parts[0]);
      derivedTeams.add(parts[1]);
    }
  });

  return {
    name: slate.name,
    type: slate.slateType || 'Classic',
    gameCount: slate.gameCount || normalizedMatchups.length,
    startTime: slate.lockTime || slate.startTime || '7:00 PM ET',
    matchups: normalizedMatchups,
    teams: Array.from(derivedTeams),
    games: normalizedMatchups // Alias for backward compatibility
  };
}

// ============================================================================
// FALLBACK METHODS
// ============================================================================

/**
 * Get game time in Eastern minutes from midnight
 */
function getGameTimeMinutes(game) {
  // Game status/datetime is usually an ISO string in UTC
  const dateStr = game.datetime || game.status;
  if (!dateStr) return null;
  
  try {
    const date = new Date(dateStr);
    // Convert to Eastern time
    const etString = date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit', 
      hour12: true, 
      timeZone: 'America/New_York' 
    });
    return parseTimeToMinutes(etString);
  } catch (e) {
    return null;
  }
}

async function scrapeRotoWireSlates(sport, platform, dateStr) {
  const s = sport.toUpperCase();
  if (s !== 'NBA' && s !== 'NFL') throw new Error(`RotoWire scraper currently only for NBA/NFL, got ${s}`);
  
  let slates = await fetchSlatesFromRotoWire(platform, s, dateStr);
  
  if (slates && slates.length > 0) {
    // If some slates are missing teams, try to populate them from BDL schedule
    const missingTeams = slates.some(s => !s.teams || s.teams.length === 0);
    if (missingTeams) {
      console.log(`[Slate Discovery] 🔍 Some slates missing teams, populating from BDL schedule...`);
      const sportKey = s === 'NBA' ? 'basketball_nba' : 'americanfootball_nfl';
      
      // Try BDL service first
      let bdlGames = await ballDontLieService.getGames(sportKey, { dates: [dateStr] });
      
      // If BDL fails, try direct fetch with API key from env
      if (!bdlGames || bdlGames.length === 0) {
        console.log(`[Slate Discovery] ℹ️ BDL service unavailable, trying direct API...`);
        try {
          const apiKey = process.env.BALLDONTLIE_API_KEY;
          if (apiKey) {
            const resp = await fetch(`https://api.balldontlie.io/v1/games?dates[]=${dateStr}`, {
              headers: { 'Authorization': apiKey }
            });
            if (resp.ok) {
              const data = await resp.json();
              bdlGames = data.data || [];
            }
          }
        } catch (e) {
          console.log(`[Slate Discovery] ⚠️ Direct API also failed: ${e.message}`);
        }
      }
      
      if (bdlGames && bdlGames.length > 0) {
        // Log all game times for debugging
        console.log(`[Slate Discovery] 📅 Today's ${bdlGames.length} games:`);
        bdlGames.forEach(g => {
          const gameTimeMinutes = getGameTimeMinutes(g);
          const hours = Math.floor(gameTimeMinutes / 60);
          const mins = gameTimeMinutes % 60;
          const ampm = hours >= 12 ? 'PM' : 'AM';
          const displayHour = hours > 12 ? hours - 12 : hours;
          const timeStr = `${displayHour}:${String(mins).padStart(2, '0')} ${ampm} ET`;
          console.log(`   ${g.visitor_team?.abbreviation}@${g.home_team?.abbreviation} - ${timeStr}`);
        });
        
        slates = slates.map(slate => {
          if (slate.teams && slate.teams.length > 0) return slate;
          
          // Match games to slate based on start time
          const slateStartTime = slate.startTime || slate.lockTime;
          const slateMinutes = parseTimeToMinutes(slateStartTime);
          
          const matchingGames = bdlGames.filter(game => {
            const gameMinutes = getGameTimeMinutes(game);
            if (gameMinutes === null || slateMinutes === null) return false;
            
            // Determine slate type from name
            const nameLC = slate.name.toLowerCase();
            const isLateSlate = nameLC.includes('after hours') || 
                                nameLC.includes('night') || 
                                nameLC.includes('late');
            const isExpressSlate = nameLC.includes('express') || nameLC.includes('turbo');
            
            // Time window in minutes - how close must a game be to the slate lock time
            // CRITICAL: Turbo slates are TIME-SPECIFIC (only games at that exact time slot)
            const TURBO_WINDOW = 15; // Turbo slates = games starting within 15 min of lock
            const LATE_WINDOW = 90;  // Late slates = games within 90 min window

            // For Main/All slates: include games starting at or after lock
            // BUT exclude games that would be in late-night slates (they're separate)
            if (!isLateSlate && !isExpressSlate) {
              const LATE_NIGHT_CUTOFF = 22 * 60; // 10:00 PM = games after this are "Night"
              return gameMinutes >= slateMinutes && gameMinutes < LATE_NIGHT_CUTOFF;
            }

            // For Express/Turbo slates: ONLY games starting NEAR the lock time
            // These are time-specific slates, NOT "everything after X time"
            // Example: Turbo 7:30 PM = only 7:30 PM games, NOT all games 7:30+
            if (isExpressSlate) {
              const timeDiff = gameMinutes - slateMinutes;
              return timeDiff >= 0 && timeDiff <= TURBO_WINDOW;
            }

            // For late slates (After Hours, Night): games within 90 min window of lock
            const timeDiff = gameMinutes - slateMinutes;
            return timeDiff >= 0 && timeDiff <= LATE_WINDOW;
          });
          
          const teams = matchingGames.flatMap(g => [
            g.visitor_team?.abbreviation, 
            g.home_team?.abbreviation
          ]).filter(Boolean).map(t => normalizeTeamAbbreviation(t));
          
          const matchups = matchingGames.map(g => 
            `${normalizeTeamAbbreviation(g.visitor_team?.abbreviation)}@${normalizeTeamAbbreviation(g.home_team?.abbreviation)}`
          );
          
          console.log(`[Slate Discovery] 📋 ${slate.name} (${slateStartTime}): ${matchingGames.length} games → ${teams.join(', ')}`);
          
          return {
            ...slate,
            teams: [...new Set(teams)],
            matchups,
            games: matchups, // Alias
            gameCount: matchingGames.length || slate.gameCount
          };
        });
      }
    }
    return slates;
  }
  return null;
}

/**
 * Parse a time string like "7:30 PM ET" into minutes from midnight (ET)
 */
function parseTimeToMinutes(timeStr) {
  if (!timeStr || timeStr === 'TBD') return null;
  
  // Clean the string
  const clean = timeStr.replace(/\s*(ET|EST|EDT)\s*/gi, '').trim();
  
  // Match patterns like "7:30 PM", "10:00 PM", "7 PM"
  const match = clean.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (!match) return null;
  
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2] || '0', 10);
  const isPM = match[3].toUpperCase() === 'PM';
  
  // Convert to 24-hour
  if (isPM && hours !== 12) hours += 12;
  if (!isPM && hours === 12) hours = 0;
  
  return hours * 60 + minutes;
}

/**
 * Heuristic to determine if a game belongs in a slate
 * 
 * For late-night slates (After Hours, Night, Turbo):
 * - Only include games that START at or near the slate lock time
 * - NOT all games from earlier in the day
 * 
 * For Main slates:
 * - Include all games starting at or after the lock
 */
function isGameInSlate(game, slateStartTime, slateName = '') {
  if (!slateStartTime || slateStartTime === 'TBD') return true;
  
  try {
    const slateMinutes = parseTimeToMinutes(slateStartTime);
    if (slateMinutes === null) return true;
    
    // Parse game time from game.status (which is usually an ISO string or display time)
    let gameTimeStr = game.status || '';
    if (gameTimeStr.includes('T')) {
      const date = new Date(gameTimeStr);
      gameTimeStr = date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit', 
        hour12: true, 
        timeZone: 'America/New_York' 
      });
    }
    
    const gameMinutes = parseTimeToMinutes(gameTimeStr);
    if (gameMinutes === null) return true;
    
    // Determine slate type from name
    const nameLC = slateName.toLowerCase();
    const isLateSlate = nameLC.includes('after hours') || 
                        nameLC.includes('night') || 
                        nameLC.includes('late') ||
                        nameLC.includes('turbo') ||
                        nameLC.includes('express');
    
    // For Main/All slates: include games starting at or after lock
    if (!isLateSlate || nameLC.includes('main') || nameLC.includes('all')) {
      return gameMinutes >= slateMinutes;
    }
    
    // For late slates: ONLY include games starting within 90 min AFTER the lock time
    // This prevents early games (7:30 PM) from being included in After Hours (10:30 PM)
    const timeDiff = gameMinutes - slateMinutes;
    return timeDiff >= 0 && timeDiff <= 90;
    
  } catch (e) {
    return true;
  }
}

async function getAllGamesAsSlate(sport, platform, dateStr) {
  const s = sport.toUpperCase();
  const sportKey = s === 'NBA' ? 'basketball_nba' : 'americanfootball_nfl';
  const bdlGames = await ballDontLieService.getGames(sportKey, { dates: [dateStr] });
  
  if (bdlGames && bdlGames.length > 0) {
    const teams = bdlGames.flatMap(g => [
      g.visitor_team?.abbreviation, 
      g.home_team?.abbreviation
    ]).filter(Boolean).map(t => normalizeTeamAbbreviation(t));
    
    return [{
      name: 'All Games',
      type: 'Classic',
      startTime: 'TBD',
      gameCount: bdlGames.length,
      teams: [...new Set(teams)],
      games: bdlGames.map(g => `${normalizeTeamAbbreviation(g.visitor_team?.abbreviation)}@${normalizeTeamAbbreviation(g.home_team?.abbreviation)}`)
    }];
  }
  return null;
}

// ============================================================================
// HELPERS
// ============================================================================

function normalizePlatform(platform) {
  const p = platform.toLowerCase();
  if (p === 'dk' || p === 'draftkings') return 'draftkings';
  if (p === 'fd' || p === 'fanduel') return 'fanduel';
  return p;
}

function filterToClassicSlates(slates) {
  return slates.filter(slate => {
    const nameLower = slate.name.toLowerCase();
    const isExcluded = EXCLUDED_SLATE_TYPES.some(excluded => nameLower.includes(excluded));
    // Must have at least 2 games
    return !isExcluded && (slate.gameCount >= 2 || (slate.matchups && slate.matchups.length >= 2));
  });
}

function generateSlateId(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default {
  discoverDFSSlates
};
