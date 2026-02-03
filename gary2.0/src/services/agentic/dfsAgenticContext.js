/**
 * DFS Agentic Context Builder
 * 
 * Data Sources:
 * - Tank01 Fantasy Stats API (RapidAPI): Real DFS salaries for FanDuel/DraftKings
 * - Ball Don't Lie (BDL) API: Player stats, team data, accurate rosters, and PROP LINES
 * - Gemini Grounding: Narrative context and ownership projections
 * 
 * PROP LINES INTEGRATION (2026 Enhancement):
 * Prop lines are the SHARPEST projection source available - they represent real money
 * being wagered on player performance. We now use BDL's player props API to get:
 * - Points props → Direct fantasy point baseline
 * - Assists props → Playmaking upside indicator
 * - Rebounds props → Glass work for bigs
 * - Threes props → Shooting upside for guards/wings
 * 
 * This bridges the gap between DFS salaries and actual expected performance.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { ballDontLieService } from '../ballDontLieService.js';
import { fetchDfsSalaries } from '../tank01DfsService.js';
import { fetchSlatesFromRotoWire, populateSlateTeams } from '../rotowireSlateService.js';
import { discoverDFSSlates as discoverSlatesWithService } from './dfsSlateDiscoveryService.js';
// Import DFS constitution for Sharp Gambler framework
import { getConstitution as getConstitutionWithBaseRules } from './constitution/index.js';
import { inferPlayerRole } from './nbaStackingRules.js';

// ═══════════════════════════════════════════════════════════════════════════
// MODULE-LEVEL INJURY CACHE
// ═══════════════════════════════════════════════════════════════════════════
// This cache allows mergePlayerData to check injury status by name
// It's populated when fetchInjuriesFromBDL is called and persists for the session
// This is necessary because Tank01 and BDL may use different player IDs
// ═══════════════════════════════════════════════════════════════════════════
let _injuryNameCache = new Map(); // normalized name -> { status, description }

export function setInjuryNameCache(injuries) {
  _injuryNameCache = new Map();
  for (const inj of injuries) {
    const playerName = `${inj.player?.first_name || ''} ${inj.player?.last_name || ''}`.trim();
    const normalizedName = normalizePlayerName(playerName);
    const status = (inj.status || '').toUpperCase();
    if (normalizedName && status) {
      _injuryNameCache.set(normalizedName, { 
        status, 
        description: inj.description || '',
        returnDate: inj.return_date 
      });
    }
  }
  console.log(`[DFS Context] 📋 Injury name cache populated with ${_injuryNameCache.size} entries`);
}

export function getInjuryByName(playerName) {
  const normalizedName = normalizePlayerName(playerName);
  return _injuryNameCache.get(normalizedName);
}

// SAFETY_SETTINGS and other constants remain same...

// Get API key from environment
function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY || 
         process.env.VITE_GEMINI_API_KEY || 
         null;
}

// Initialize Gemini client
function getGeminiClient() {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    console.warn('[DFS Context] GEMINI_API_KEY not set - Grounding disabled');
    return null;
  }
  return new GoogleGenerativeAI(apiKey);
}

// Safety settings for sports content
const SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
];

/**
 * Robust JSON cleaning for Gemini responses
 * @param {string} text - Raw response text
 * @returns {string} Cleaned JSON string
 */
function cleanJsonString(text) {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  
  let cleaned = jsonMatch[0]
    .replace(/[\u201C\u201D]/g, '"') // Smart quotes
    .replace(/,\s*([\}\]])/g, '$1') // Trailing commas
    .replace(/\/\/.*$/gm, '')      // Comments
    .replace(/\r?\n|\r/g, ' ')     // Newlines to spaces
    .replace(/\s+/g, ' ')          // Collapse extra whitespace
    .trim();
    
  // Try to repair truncated JSON (common with Gemini responses)
  cleaned = repairTruncatedJson(cleaned);
  
  return cleaned;
}

/**
 * Repair truncated JSON that was cut off mid-stream
 * Gary needs ALL the context - truncated responses lose critical info
 * 
 * Common truncation patterns:
 * - {"projections": [{"name": "Player", "points": 45.2}, {"name": "Another...
 * - {"game_narratives": [...], "target_players": [{"name": "P...
 * 
 * @param {string} json - Potentially truncated JSON string
 * @returns {string} Repaired JSON string
 */
function repairTruncatedJson(json) {
  if (!json) return json;
  
  try {
    // First, try to parse as-is
    JSON.parse(json);
    return json; // Valid JSON, no repair needed
  } catch (e) {
    // JSON is malformed, attempt repair
  }
  
  let repaired = json;
  
  // Step 1: Fix common Gemini issues
  // Fix missing commas between array elements (common Gemini issue: }{  should be },{)
  repaired = repaired.replace(/}\s*{/g, '},{');
  
  // Step 2: Count open/close brackets to find truncation point
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let lastValidPos = 0;
  
  for (let i = 0; i < repaired.length; i++) {
    const char = repaired[i];
    const prevChar = i > 0 ? repaired[i - 1] : '';
    
    // Track string state (ignore escaped quotes)
    if (char === '"' && prevChar !== '\\') {
      inString = !inString;
    }
    
    if (!inString) {
      if (char === '{') openBraces++;
      if (char === '}') openBraces--;
      if (char === '[') openBrackets++;
      if (char === ']') openBrackets--;
      
      // Track last position where JSON was potentially valid (after a complete value)
      if (char === '}' || char === ']' || char === '"' || /\d/.test(char)) {
        if (openBraces >= 0 && openBrackets >= 0) {
          lastValidPos = i;
        }
      }
    }
  }
  
  // Step 3: If truncated mid-string, close the string
  if (inString) {
    repaired = repaired + '"';
  }
  
  // Step 4: Close any open brackets/braces
  // Remove any trailing incomplete element (e.g., {"name": "Play...)
  const trailingIncomplete = repaired.match(/,\s*\{[^}]*$/);
  if (trailingIncomplete) {
    repaired = repaired.substring(0, repaired.length - trailingIncomplete[0].length);
  }
  
  // Close arrays first, then objects
  while (openBrackets > 0) {
    repaired += ']';
    openBrackets--;
  }
  while (openBraces > 0) {
    repaired += '}';
    openBraces--;
  }
  
  // Step 5: Remove trailing comma before closing brackets (invalid JSON)
  repaired = repaired.replace(/,\s*([\}\]])/g, '$1');
  
  // Step 6: Validate the repair worked
  try {
    JSON.parse(repaired);
    console.log(`[DFS Context] ✅ JSON repair successful - recovered partial data`);
    return repaired;
  } catch (e2) {
    // If repair failed, try a more aggressive approach: truncate at last valid position
    if (lastValidPos > 0) {
      let truncated = repaired.substring(0, lastValidPos + 1);
      
      // Re-count and close
      openBraces = (truncated.match(/{/g) || []).length - (truncated.match(/}/g) || []).length;
      openBrackets = (truncated.match(/\[/g) || []).length - (truncated.match(/]/g) || []).length;
      
      while (openBrackets > 0) { truncated += ']'; openBrackets--; }
      while (openBraces > 0) { truncated += '}'; openBraces--; }
      
      truncated = truncated.replace(/,\s*([\}\]])/g, '$1');
      
      try {
        JSON.parse(truncated);
        console.log(`[DFS Context] ✅ JSON repair (aggressive) successful - recovered partial data`);
        return truncated;
      } catch (e3) {
        // Give up, return original for debugging
        console.warn(`[DFS Context] ⚠️ JSON repair failed - returning original for debugging`);
        return json;
      }
    }
    
    return json;
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DFS MODEL CONFIGURATION - Gemini 3 Flash for Gary's Fantasy
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Model: gemini-3-flash-preview (high volume, low latency for DFS)
 * Temperature: 1.1 (High Creativity/Variance for diverse lineup builds)
 * Reasoning_Level: HIGH (Enable full chain-of-thought thinking blocks)
 * Grounding: ENABLED (Use Google Search tool for all sports/real-time data)
 * 
 * This configuration enables Gary to:
 * - Search for live DraftKings/FanDuel salaries via Google
 * - Find injury reports and late scratches
 * - Discover narrative context (revenge games, usage spikes, etc.)
 * - Generate creative lineup strategies with high variance
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */
// ═══════════════════════════════════════════════════════════════════════════
// DFS MODEL CONFIG - Optimized for Gemini 3 Best Practices
// ═══════════════════════════════════════════════════════════════════════════
// GEMINI 3 UPDATE: Temperature MUST be 1.0 per Google's recommendation
// "Setting it below 1.0 may lead to unexpected behavior, such as looping 
// or degraded performance, particularly in complex mathematical or reasoning tasks."
// DFS involves salary math, so this is critical.
// ═══════════════════════════════════════════════════════════════════════════
const GROUNDING_MODEL_ID = process.env.GEMINI_FLASH_MODEL || 'gemini-3-flash-preview';

const DFS_MODEL_CONFIG = {
  model: GROUNDING_MODEL_ID,
  reasoningLevel: 'HIGH',
  grounding: 'ENABLED',
  maxOutputTokens: 8192,
  topP: 0.95,
  // Gemini 3: Temperature fixed at 1.0 per Google's recommendation
  // Lower temps cause looping/degraded math in DFS salary calculations
  temperature: 1.0,
  // thinkingLevel replaces legacy thinkingBudget
  thinkingLevel: 'high' // "high" = deep reasoning for salary optimization
};

// Helper to get temperature (now returns fixed 1.0 for Gemini 3)
export function getDFSTemperature(contestType = 'gpp') {
  return DFS_MODEL_CONFIG.temperature; // Fixed at 1.0 per Google recommendation
}

/**
 * Get the DFS constitution for a sport (WITH BASE_RULES included)
 * This ensures DFS gets the same core identity (INDEPENDENT THINKER), 
 * data source rules, and external betting influence prohibition as game picks.
 * 
 * @param {string} sport - 'NBA' or 'NFL'
 * @returns {string} Full constitution with BASE_RULES prepended
 */
export function getDFSConstitution(sport) {
  const constitutionKey = sport === 'NFL' ? 'NFL_DFS' : 'NBA_DFS';
  let constitution = getConstitutionWithBaseRules(constitutionKey);
  
  // Replace date template if present
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  constitution = constitution.replace(/\{\{CURRENT_DATE\}\}/g, today);
  
  return constitution;
}

console.log(`[DFS Context] Initialized with MODEL_CONFIG:`, {
  model: DFS_MODEL_CONFIG.model,
  tempGPP: DFS_MODEL_CONFIG.temperature.gpp,
  tempCash: DFS_MODEL_CONFIG.temperature.cash,
  reasoning: DFS_MODEL_CONFIG.reasoningLevel,
  grounding: DFS_MODEL_CONFIG.grounding
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PROP LINES FOR DFS PROJECTIONS - The Sharpest Edge
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Prop lines are set by oddsmakers with real money on the line. They represent
 * the market's consensus on player performance - much sharper than "expert"
 * projections or historical averages.
 * 
 * DFS Fantasy Point Calculation (DraftKings):
 * - Points: 1 pt per point scored
 * - Rebounds: 1.25 pts per rebound
 * - Assists: 1.5 pts per assist
 * - Steals: 2 pts per steal
 * - Blocks: 2 pts per block
 * - Turnovers: -0.5 pts per turnover
 * - 3PM: 0.5 bonus per three made
 * - Double-Double: 1.5 bonus
 * - Triple-Double: 3 bonus
 * 
 * By using prop lines, we can estimate floor/ceiling:
 * - Points O/U 22.5 → baseline 22.5 fantasy pts just from scoring
 * - Assists O/U 6.5 → +9.75 fantasy pts from assists
 * - Rebounds O/U 8.5 → +10.6 fantasy pts from boards
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Fetch player prop lines for DFS projection enhancement
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {Array} gameIds - Array of game IDs to fetch props for
 * @returns {Object} Map of player names to prop-based projections
 */
export async function fetchPropLinesForDFS(sport, gameIds) {
  if (!gameIds || gameIds.length === 0) {
    console.log('[DFS Props] No game IDs provided - skipping prop lines');
    return {};
  }
  
  const propProjections = {};
  
  try {
    console.log(`[DFS Props] 📊 Fetching prop lines for ${gameIds.length} games to enhance DFS projections`);
    
    // Check if BDL service has player props method for this sport
    // NOTE: BDL SDK currently only supports NHL props, not NBA
    if (sport === 'NBA' && typeof ballDontLieService.getNbaPlayerProps !== 'function') {
      console.log('[DFS Props] ⚠️ NBA player props not available via BDL SDK - using MCP tools would be required');
      console.log('[DFS Props] ℹ️ Falling back to season stats for projections');
      return {};
    }
    
    // Fetch props for each game
    for (const gameId of gameIds) {
      try {
        // Use BDL API to fetch player props (NHL supported, NBA not yet)
        const propsMethod = sport === 'NBA' ? 'getNbaPlayerProps' : 
                          sport === 'NHL' ? 'getNhlPlayerProps' : null;
        
        if (!propsMethod || typeof ballDontLieService[propsMethod] !== 'function') {
          console.log(`[DFS Props] ⚠️ ${sport} props not available`);
          continue;
        }
        
        const props = await ballDontLieService[propsMethod](gameId);
        
        if (!props || props.length === 0) continue;
        
        // Group props by player
        const playerProps = {};
        for (const prop of props) {
          const playerName = prop.player?.full_name || prop.player_name;
          if (!playerName) continue;
          
          if (!playerProps[playerName]) {
            playerProps[playerName] = {
              name: playerName,
              team: prop.team?.abbreviation || prop.team,
              props: {}
            };
          }
          
          // Store the prop line (use the line value, not the odds)
          const propType = prop.prop_type || prop.stat_type;
          const line = prop.line || prop.over_under;
          
          if (propType && line) {
            playerProps[playerName].props[propType] = line;
          }
        }
        
        // Calculate DFS projection from props
        for (const [name, data] of Object.entries(playerProps)) {
          const p = data.props;
          
          // DraftKings scoring
          let projection = 0;
          let components = [];
          
          // Points (1 pt per point)
          if (p.points) {
            projection += p.points * 1;
            components.push(`${p.points} pts`);
          }
          
          // Rebounds (1.25 pts per rebound)
          if (p.rebounds) {
            projection += p.rebounds * 1.25;
            components.push(`${p.rebounds} reb`);
          }
          
          // Assists (1.5 pts per assist)
          if (p.assists) {
            projection += p.assists * 1.5;
            components.push(`${p.assists} ast`);
          }
          
          // Threes (0.5 bonus per 3PM - already counted in points)
          if (p.threes) {
            projection += p.threes * 0.5;
            components.push(`${p.threes} 3PM`);
          }
          
          // PRA (Points + Rebounds + Assists combo)
          if (p.points_rebounds_assists && !p.points && !p.rebounds && !p.assists) {
            // If we have PRA but not individual lines, use it as a rough estimate
            // PRA ≈ Points + Rebounds*1.25 + Assists*1.5 (but we only have raw total)
            // Estimate: PRA line * 1.2 for DFS conversion
            projection = p.points_rebounds_assists * 1.15;
            components.push(`${p.points_rebounds_assists} PRA`);
          }
          
          if (projection > 0) {
            propProjections[name] = {
              ...data,
              propBasedProjection: Math.round(projection * 10) / 10,
              propComponents: components.join(' + '),
              confidence: components.length >= 3 ? 'HIGH' : components.length >= 2 ? 'MEDIUM' : 'LOW'
            };
          }
        }
        
      } catch (gameError) {
        console.warn(`[DFS Props] Failed to fetch props for game ${gameId}: ${gameError.message}`);
      }
    }
    
    const playerCount = Object.keys(propProjections).length;
    console.log(`[DFS Props] ✅ Generated prop-based projections for ${playerCount} players`);
    
    return propProjections;
    
  } catch (error) {
    console.error(`[DFS Props] Error fetching prop lines: ${error.message}`);
    return {};
  }
}

/**
 * Enhance DFS player data with prop-based projections
 * @param {Array} players - Array of DFS players with salaries
 * @param {Object} propProjections - Prop-based projections from fetchPropLinesForDFS
 * @returns {Array} Enhanced player array with prop projections
 */
export function enhancePlayersWithProps(players, propProjections) {
  if (!propProjections || Object.keys(propProjections).length === 0) {
    return players;
  }
  
  let enhancedCount = 0;
  
  const enhanced = players.map(player => {
    const playerName = player.name || player.player;
    
    // Try exact match first, then fuzzy match
    let propData = propProjections[playerName];
    
    if (!propData) {
      // Try partial match (last name)
      const lastName = playerName?.split(' ').pop()?.toLowerCase();
      for (const [name, data] of Object.entries(propProjections)) {
        if (name.toLowerCase().includes(lastName)) {
          propData = data;
          break;
        }
      }
    }
    
    if (propData) {
      enhancedCount++;
      return {
        ...player,
        propProjection: propData.propBasedProjection,
        propComponents: propData.propComponents,
        propConfidence: propData.confidence,
        // Use prop projection as floor/ceiling estimate
        projectedFloor: Math.round(propData.propBasedProjection * 0.7 * 10) / 10,
        projectedCeiling: Math.round(propData.propBasedProjection * 1.4 * 10) / 10,
        valueScore: player.salary ? (propData.propBasedProjection / (player.salary / 1000)).toFixed(2) : null
      };
    }
    
    return player;
  });
  
  console.log(`[DFS Props] Enhanced ${enhancedCount}/${players.length} players with prop-based projections`);
  
  return enhanced;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PRE-LOCK INJURY REFRESH - Last-Minute Status Check
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * DFS lineups lock 5-15 minutes before game time. Players can be ruled OUT
 * at any point leading up to lock. This function performs a FINAL injury
 * check to prevent rostering players who are suddenly OUT.
 * 
 * CRITICAL: Run this 30-60 minutes before slate lock for final verification.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Perform pre-lock injury refresh to catch last-minute scratches
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {Array} lineup - Current lineup array
 * @param {string} dateStr - Date string (YYYY-MM-DD)
 * @returns {Object} { safe: boolean, warnings: Array, replacementSuggestions: Object }
 */
export async function preLockInjuryRefresh(sport, lineup, dateStr) {
  console.log(`[Pre-Lock] 🏥 Performing final injury check for ${lineup.length} players...`);
  
  const warnings = [];
  const replacementSuggestions = {};
  const playerStatuses = {};
  
  try {
    // Fetch latest injury data from BDL
    const sportKey = sport === 'NBA' ? 'basketball_nba' : 'americanfootball_nfl';
    const injuries = await ballDontLieService.getPlayerInjuries?.(sportKey) || [];
    
    // Build injury status map
    for (const injury of injuries) {
      const name = injury.player?.full_name || `${injury.player?.first_name} ${injury.player?.last_name}`;
      if (name) {
        playerStatuses[name.toLowerCase()] = {
          status: injury.status,
          comment: injury.comment,
          returnDate: injury.return_date
        };
      }
    }
    
    // Also use Gemini Grounding for real-time injury news (catches last-minute scratches)
    const genAI = getGeminiClient();
    if (genAI) {
      const playerNames = lineup.map(p => p.player || p.name).filter(Boolean);
      
      const model = genAI.getGenerativeModel({
        model: 'gemini-3-flash-preview',
        tools: [{ google_search: {} }],
        safetySettings: SAFETY_SETTINGS,
        generationConfig: { temperature: 1.0, maxOutputTokens: 2048 } // Gemini 3: Keep at 1.0
      });
      
      const prompt = `Search for the LATEST injury status for these ${sport} players playing TODAY (${dateStr}):
${playerNames.join(', ')}

I need ONLY players who are:
- Ruled OUT
- DOUBTFUL
- GTD (Game-Time Decision)
- Just ruled out in the last few hours

Return JSON:
{
  "lastMinuteOuts": [
    { "name": "Player Name", "status": "OUT", "reason": "Ankle", "announced": "1 hour ago" }
  ],
  "gtdWatch": [
    { "name": "Player Name", "status": "GTD", "reason": "Illness", "expected": "Likely to play" }
  ]
}

If all players are healthy and playing, return: { "lastMinuteOuts": [], "gtdWatch": [] }`;

      try {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          
          // Process last-minute outs
          for (const out of (parsed.lastMinuteOuts || [])) {
            const normalizedName = out.name?.toLowerCase();
            if (normalizedName) {
              playerStatuses[normalizedName] = { status: 'OUT', comment: out.reason, announced: out.announced };
            }
          }
          
          // Process GTD watch
          for (const gtd of (parsed.gtdWatch || [])) {
            const normalizedName = gtd.name?.toLowerCase();
            if (normalizedName && !playerStatuses[normalizedName]) {
              playerStatuses[normalizedName] = { status: 'GTD', comment: gtd.reason, expected: gtd.expected };
            }
          }
        }
      } catch (groundingError) {
        console.warn(`[Pre-Lock] Grounding search failed: ${groundingError.message}`);
      }
    }
    
    // Check each lineup player against status map
    let safeCount = 0;
    for (const player of lineup) {
      const playerName = (player.player || player.name || '').toLowerCase();
      const status = playerStatuses[playerName];
      
      if (status) {
        const statusUpper = (status.status || '').toUpperCase();
        
        if (statusUpper === 'OUT' || statusUpper === 'DOUBTFUL') {
          warnings.push({
            player: player.player || player.name,
            position: player.position,
            salary: player.salary,
            status: statusUpper,
            reason: status.comment,
            announced: status.announced,
            severity: 'CRITICAL'
          });
          
          // Suggest replacement would go here (from player pool)
          replacementSuggestions[player.player || player.name] = {
            reason: `${statusUpper} - ${status.comment || 'No reason given'}`,
            suggestion: `Find replacement at ${player.position} with similar salary ($${player.salary})`
          };
          
        } else if (statusUpper === 'GTD' || statusUpper === 'QUESTIONABLE') {
          warnings.push({
            player: player.player || player.name,
            position: player.position,
            salary: player.salary,
            status: statusUpper,
            reason: status.comment,
            expected: status.expected,
            severity: 'WARNING'
          });
        } else {
          safeCount++;
        }
      } else {
        safeCount++;
      }
    }
    
    const criticalCount = warnings.filter(w => w.severity === 'CRITICAL').length;
    const warningCount = warnings.filter(w => w.severity === 'WARNING').length;
    
    console.log(`[Pre-Lock] ✅ ${safeCount}/${lineup.length} players confirmed safe`);
    if (criticalCount > 0) console.log(`[Pre-Lock] ❌ ${criticalCount} CRITICAL: Players ruled OUT/DOUBTFUL`);
    if (warningCount > 0) console.log(`[Pre-Lock] ⚠️ ${warningCount} WARNING: GTD/Questionable players`);
    
    return {
      safe: criticalCount === 0,
      safeCount,
      criticalCount,
      warningCount,
      warnings,
      replacementSuggestions,
      checkedAt: new Date().toISOString()
    };
    
  } catch (error) {
    console.error(`[Pre-Lock] Error during injury refresh: ${error.message}`);
    return {
      safe: false,
      error: error.message,
      warnings: [{ severity: 'ERROR', message: 'Failed to check injuries - proceed with caution' }],
      replacementSuggestions: {}
    };
  }
}

/**
 * Discover DFS slates for a given sport and platform
 * Uses the DFS Slate Discovery Service which prioritizes Gemini Grounding
 * 
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @param {string} slateDate - Date string (e.g., '2025-01-05')
 * @returns {Array} List of discovered slates with teams
 */
export async function discoverDFSSlates(sport, platform, slateDate) {
  return await discoverSlatesWithService(sport, platform, slateDate);
}

// Note: fetchSlatesFromRotoWire is now imported from rotowireSlateService.js
// which uses Puppeteer browser automation for reliable slate scraping

/**
 * Fetch DFS salaries and injury data using Gemini Grounding
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} slateDate - Date string (e.g., 'December 23, 2025')
 * @param {Array} teams - Array of team names playing on this slate
 * @returns {Object} Player salaries and statuses
 */
export async function fetchDFSSalariesWithGrounding(platform, sport, slateDate, teams = []) {
  const genAI = getGeminiClient();
  if (!genAI) {
    console.log('[DFS Context] Gemini not available - returning empty salaries');
    return { players: [], groundingUsed: false };
  }
  
  const platformName = platform === 'draftkings' ? 'DraftKings' : 'FanDuel';
  const teamsStr = teams.length > 0 ? teams.join(', ') : 'all teams';
  
  // Apply DFS_MODEL_CONFIG for salary fetching
  try {
    console.log(`[DFS Context] 🔍 Fetching ${platformName} ${sport} salaries for ${slateDate}`);
    console.log(`[DFS Context] MODEL_CONFIG: ${DFS_MODEL_CONFIG.model} | temp=${DFS_MODEL_CONFIG.temperature} | reasoning=${DFS_MODEL_CONFIG.reasoningLevel} | grounding=${DFS_MODEL_CONFIG.grounding}`);
    
    // For salary fetching with grounding - DO NOT use responseMimeType as it breaks grounding
    // POLICY: Only Gemini 3 models allowed (never 1.x or 2.x)
    const model = genAI.getGenerativeModel({
      model: 'gemini-3-flash-preview', // Gemini 3 Flash for grounding
      tools: [{
        google_search: {} // Grounding: ENABLED - Use Google Search for salaries
      }],
      safetySettings: SAFETY_SETTINGS,
      generationConfig: {
        temperature: 1.0, // Gemini 3: MUST be 1.0 per Google recommendation
        topP: 0.95,
        maxOutputTokens: DFS_MODEL_CONFIG.maxOutputTokens
        // Note: responseMimeType: 'application/json' breaks grounding - don't use it here
      }
    });
    
    let prompt;
    if (sport === 'NBA') {
      prompt = `Search the web for ${platformName} NBA DFS salaries for ${slateDate}.

Find the ACTUAL ${platformName} salary prices for NBA players on today's slate. I need at least 40-60 players.

For each player found, provide in this EXACT JSON format:
{
  "slate_info": {
    "platform": "${platformName}",
    "sport": "NBA",
    "date": "${slateDate}",
    "games_count": <number of games>
  },
  "players": [
    {"name": "Player Name", "team": "TEAM", "position": "POS", "salary": 9500, "status": "HEALTHY"},
    ...more players
  ],
  "late_scratches": ["Player Name"],
  "rest_days": ["Player Name"]
}

IMPORTANT RULES:
- Search for "${platformName} NBA salaries ${slateDate}" or similar queries
- salary must be a NUMBER (not string), e.g. 9500 not "$9,500"
- Teams playing today: ${teamsStr}
- Include ALL salary tiers from $3000 to $12000+
- Position should be: PG, SG, SF, PF, or C
- Status: HEALTHY, OUT, GTD, QUESTIONABLE, or DOUBTFUL

Return ONLY valid JSON. Start with { and end with }. No explanation text.

Example player entry:
{"name": "LeBron James", "team": "LAL",
      "position": "SF",
      "salary": 10500,
      "status": "HEALTHY",
      "notes": ""
    }
  ],
  "late_scratches": ["Player Name if any"],
  "rest_days": ["Player Name if any"]
}

Only include players actually on today's ${platformName} slate. Be accurate with salaries.

IMPORTANT: Return ONLY valid JSON. No markdown, no explanation text. Start your response with { and end with }`;
    } else if (sport === 'NFL') {
      // Determine if this is a small slate (2-4 teams = Saturday games)
      const teamCount = teams.length;
      const isSmallSlate = teamCount <= 8; // 4 teams = 2 games = small slate
      const slateType = isSmallSlate ? 'Saturday 2-game' : 'Sunday main';
      const expectedPlayers = isSmallSlate ? '40-60' : '100+';
      
      prompt = `Search ${platformName}.com for the COMPLETE NFL DFS player pool and salaries for ${slateDate}.

THIS IS A ${slateType.toUpperCase()} SLATE: ${teamCount / 2} games with teams: ${teamsStr}

**CRITICAL: I NEED THE COMPLETE PLAYER LIST WITH REAL ${platformName.toUpperCase()} SALARIES**

Search for: "${platformName} NFL showdown ${slateDate}" or "${platformName} NFL classic ${slateDate}"

I need ${expectedPlayers} players - the FULL slate including:
- ALL QBs (${teamCount} teams = ~${teamCount} QBs)
- ALL RBs (3-4 per team = ~${teamCount * 3} RBs)
- ALL WRs (4-5 per team = ~${teamCount * 4} WRs)  
- ALL TEs (2-3 per team = ~${teamCount * 2} TEs)
- ALL Kickers (1 per team = ${teamCount} Ks)
- ALL Defenses (${teamCount} DSTs)

**ALSO CHECK INJURY STATUS:**
Search "NFL injury report ${slateDate}" for:
- OUT = Will NOT play
- DOUBTFUL = Unlikely to play  
- QUESTIONABLE = Game-time decision

**IMPORTANT: ONLY include NEW injuries from THIS WEEK (< 7 days)**
- ❌ DO NOT list season-long injuries (e.g., player out 3+ months)
- ✅ DO list recent injuries (e.g., "Kelce OUT tonight")
- Season stats already reflect long-term absences - NOT an angle
- HEALTHY = Playing

Return this EXACT JSON format:
{
  "slate_info": {
    "platform": "${platformName}",
    "sport": "NFL", 
    "date": "${slateDate}",
    "slate_type": "${slateType}",
    "games_count": ${teamCount / 2}
  },
  "players": [
    {"name": "Justin Herbert", "team": "LAC", "position": "QB", "salary": 8200, "status": "HEALTHY"},
    {"name": "Josh Jacobs", "team": "GB", "position": "RB", "salary": 6700, "status": "HEALTHY"},
    {"name": "Derrick Henry", "team": "BAL", "position": "RB", "salary": 7800, "status": "HEALTHY"},
    {"name": "Nico Collins", "team": "HOU", "position": "WR", "salary": 6400, "status": "HEALTHY"},
    {"name": "Mark Andrews", "team": "BAL", "position": "TE", "salary": 4300, "status": "HEALTHY"},
    {"name": "Tucker Kraft", "team": "GB", "position": "TE", "salary": 3500, "status": "HEALTHY"},
    {"name": "Tyler Conklin", "team": "LAC", "position": "TE", "salary": 3200, "status": "HEALTHY"},
    {"name": "HOU DST", "team": "HOU", "position": "DST", "salary": 3500, "status": "HEALTHY"},
    {"name": "Brandon McManus", "team": "GB", "position": "K", "salary": 4000, "status": "HEALTHY"}
  ],
  "confirmed_out": ["Lamar Jackson (BAL) - Hip"],
  "qb_changes": ["BAL - Tyler Huntley starting"]
}

RULES:
- salary = NUMBER not string (7800 not "$7,800")
- Include EVERY player on the ${platformName} slate for these teams
- Must have real ${platformName} salaries - do NOT estimate
- Position: QB, RB, WR, TE, K, or DST

Return ONLY valid JSON. Start with { end with }.`;
    }
    
    const startTime = Date.now();
    const result = await model.generateContent(prompt);
    const duration = Date.now() - startTime;
    
    console.log(`[DFS Context] ✅ Gemini Grounding response in ${duration}ms`);
    
    const response = result.response;
    const text = response.text();
    
    // Log grounding metadata if available
    const candidate = response.candidates?.[0];
    const groundingMetadata = candidate?.groundingMetadata;
    if (groundingMetadata?.webSearchQueries?.length > 0) {
      console.log(`[DFS Context] 🔍 Grounded searches: "${groundingMetadata.webSearchQueries.join('", "')}"`);
    }
    
    // Parse JSON from response
    const parsed = parseGroundingResponse(text);
    
    return {
      ...parsed,
      groundingUsed: !!groundingMetadata?.webSearchQueries?.length,
      rawResponse: text.substring(0, 500) // For debugging
    };
    
  } catch (error) {
    console.error(`[DFS Context] Gemini Grounding failed: ${error.message}`);
    return { players: [], groundingUsed: false, error: error.message };
  }
}

/**
 * Parse Gemini grounding response to extract JSON
 * @param {string} text - Raw response text
 * @returns {Object} Parsed player data
 */
function parseGroundingResponse(text) {
  try {
    // Step 0: Clean up markdown formatting
    let cleanText = text.trim();
    
    // Remove leading/trailing markdown code block markers
    if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```(?:json)?\s*/, '');
    }
    
    // Step 1: Find balanced JSON by counting braces
    const firstBrace = cleanText.indexOf('{');
    if (firstBrace !== -1) {
      let depth = 0;
      let inString = false;
      let escape = false;
      let endPos = -1;
      
      for (let i = firstBrace; i < cleanText.length; i++) {
        const char = cleanText[i];
        
        if (escape) {
          escape = false;
          continue;
        }
        
        if (char === '\\' && inString) {
          escape = true;
          continue;
        }
        
        if (char === '"' && !escape) {
          inString = !inString;
          continue;
        }
        
        if (!inString) {
          if (char === '{') depth++;
          else if (char === '}') {
            depth--;
            if (depth === 0) {
              endPos = i;
              break;
            }
          }
        }
      }
      
      if (endPos > firstBrace) {
        const jsonStr = cleanText.substring(firstBrace, endPos + 1);
        try {
          return JSON.parse(jsonStr);
        } catch (e) {
          console.warn(`[DFS Context] Balanced brace parse failed: ${e.message}`);
        }
      }
    }
    
    // Step 2: Try direct parse
    try {
      return JSON.parse(cleanText);
    } catch (e) {
      // Continue to other methods
    }
    
    // Step 3: Try regex for JSON object
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.warn(`[DFS Context] Regex JSON parse failed: ${e.message}`);
      }
    }
    
    // Step 4: Try to extract salary data from natural language response
    // This handles cases where Gemini grounding returns prose with embedded salary info
    console.log(`[DFS Context] Attempting to extract salaries from natural language response...`);
    const extractedPlayers = extractSalariesFromText(text);
    if (extractedPlayers.length > 0) {
      console.log(`[DFS Context] ✅ Extracted ${extractedPlayers.length} players from natural language`);
      return {
        slate_info: {},
        players: extractedPlayers,
        late_scratches: [],
        extracted: true // Flag that this was extracted, not parsed
      };
    }
    
    console.warn(`[DFS Context] All JSON parsing methods failed`);
    return {
      slate_info: {},
      players: [],
      late_scratches: [],
      error: 'Failed to parse response'
    };
    
  } catch (e) {
    console.warn(`[DFS Context] JSON parsing error: ${e.message}`);
    return {
      slate_info: {},
      players: [],
      late_scratches: [],
      error: 'Failed to parse response'
    };
  }
}

/**
 * Extract salary data from natural language text
 * Handles cases like: "Nikola Jokic (DEN) - $12,500" or "Jokic with a salary of $12,500"
 * @param {string} text - Natural language text containing salary info
 * @returns {Array} Extracted player objects
 */
function extractSalariesFromText(text) {
  const players = [];
  
  // Common team abbreviations
  const teamAbbrs = {
    // NBA
    'Lakers': 'LAL', 'Celtics': 'BOS', 'Warriors': 'GSW', 'Nuggets': 'DEN', 'Suns': 'PHX',
    'Heat': 'MIA', 'Bucks': 'MIL', 'Cavaliers': 'CLE', 'Nets': 'BKN', 'Knicks': 'NYK',
    'Hawks': 'ATL', 'Bulls': 'CHI', 'Clippers': 'LAC', 'Mavericks': 'DAL', 'Grizzlies': 'MEM',
    'Pelicans': 'NOP', 'Thunder': 'OKC', 'Kings': 'SAC', 'Timberwolves': 'MIN', 'Trail Blazers': 'POR',
    'Rockets': 'HOU', 'Jazz': 'UTA', 'Spurs': 'SAS', 'Magic': 'ORL', 'Pacers': 'IND',
    'Pistons': 'DET', 'Hornets': 'CHA', 'Wizards': 'WAS', '76ers': 'PHI', 'Raptors': 'TOR',
    // NFL
    'Chiefs': 'KC', 'Bills': 'BUF', 'Eagles': 'PHI', 'Cowboys': 'DAL', 'Ravens': 'BAL',
    'Bengals': 'CIN', 'Dolphins': 'MIA', 'Browns': 'CLE', 'Steelers': 'PIT', 'Titans': 'TEN',
    'Colts': 'IND', 'Jaguars': 'JAX', 'Texans': 'HOU', 'Broncos': 'DEN', 'Raiders': 'LV',
    'Chargers': 'LAC', 'Packers': 'GB', 'Vikings': 'MIN', 'Bears': 'CHI', 'Lions': 'DET',
    '49ers': 'SF', 'Seahawks': 'SEA', 'Rams': 'LAR', 'Cardinals': 'ARI', 'Giants': 'NYG',
    'Commanders': 'WAS', 'Saints': 'NO', 'Buccaneers': 'TB', 'Falcons': 'ATL', 'Panthers': 'CAR'
  };
  
  // Patterns to match salary mentions
  // Pattern 1: "Player Name (TEAM) - $X,XXX" or "Player Name (TEAM) with salary of $X,XXX"
  const pattern1 = /([A-Z][a-z]+(?:\s+[A-Z][a-z.']+)+)\s*\(([A-Z]{2,4})\)[^\$]*\$(\d{1,2},?\d{3})/gi;
  // Pattern 2: "Player Name ... salary of $X,XXX" or "Player Name ... $X,XXX salary"
  const pattern2 = /([A-Z][a-z]+(?:\s+[A-Z][a-z.']+)+)[^$]{1,50}(?:salary of |priced at |costing |at )\$?(\d{1,2},?\d{3})/gi;
  // Pattern 3: "Player Name - TEAM: $X,XXX"
  const pattern3 = /([A-Z][a-z]+(?:\s+[A-Z][a-z.']+)+)\s*[-–]\s*([A-Z]{2,4})[:\s]+\$?(\d{1,2},?\d{3})/gi;
  
  const seen = new Set();
  
  // Try pattern 1
  let match;
  while ((match = pattern1.exec(text)) !== null) {
    const name = match[1].trim();
    const team = match[2].toUpperCase();
    const salary = parseInt(match[3].replace(',', ''));
    
    const key = name.toLowerCase();
    if (!seen.has(key) && salary >= 3000 && salary <= 15000) {
      seen.add(key);
      players.push({
        name,
        team,
        position: guessPosition(name, text),
        salary,
        status: 'HEALTHY'
      });
    }
  }
  
  // Try pattern 3 if we didn't get many from pattern 1
  if (players.length < 10) {
    while ((match = pattern3.exec(text)) !== null) {
      const name = match[1].trim();
      const team = match[2].toUpperCase();
      const salary = parseInt(match[3].replace(',', ''));
      
      const key = name.toLowerCase();
      if (!seen.has(key) && salary >= 3000 && salary <= 15000) {
        seen.add(key);
        players.push({
          name,
          team,
          position: guessPosition(name, text),
          salary,
          status: 'HEALTHY'
        });
      }
    }
  }
  
  console.log(`[DFS Context] Extracted ${players.length} players from text: ${players.slice(0, 5).map(p => `${p.name} $${p.salary}`).join(', ')}${players.length > 5 ? '...' : ''}`);
  return players;
}

/**
 * Guess player position from context
 * @param {string} name - Player name
 * @param {string} text - Full text to search for context
 * @returns {string} Position abbreviation
 */
function guessPosition(name, text) {
  // Look for position mentions near the player name
  const nameIndex = text.toLowerCase().indexOf(name.toLowerCase());
  if (nameIndex === -1) return 'UTIL';
  
  const context = text.substring(Math.max(0, nameIndex - 50), Math.min(text.length, nameIndex + name.length + 50)).toLowerCase();
  
  // NFL positions
  if (context.includes('quarterback') || context.includes(' qb ')) return 'QB';
  if (context.includes('running back') || context.includes(' rb ')) return 'RB';
  if (context.includes('wide receiver') || context.includes(' wr ')) return 'WR';
  if (context.includes('tight end') || context.includes(' te ')) return 'TE';
  
  // NBA positions
  if (context.includes('point guard') || context.includes(' pg ')) return 'PG';
  if (context.includes('shooting guard') || context.includes(' sg ')) return 'SG';
  if (context.includes('small forward') || context.includes(' sf ')) return 'SF';
  if (context.includes('power forward') || context.includes(' pf ')) return 'PF';
  if (context.includes('center') || context.includes(' c ')) return 'C';
  
  // Default based on salary (very rough heuristic)
  return 'UTIL';
}

/**
 * Fetch ACTIVE players from BDL with current team assignments
 * This is the source of truth for rosters - more accurate than Gemini search
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {Array} teamIds - Team IDs to filter by
 * @returns {Array} Active players with current teams
 */
export async function fetchActivePlayersFromBDL(sport, teamIds = []) {
  const sportKey = sport === 'NBA' ? 'basketball_nba' : 'americanfootball_nfl';
  
  try {
    console.log(`[DFS Context] 📋 Fetching ACTIVE ${sport} players from BDL (team_ids: ${teamIds.join(', ')})`);
    
    let allPlayers = [];
    let nextCursor = undefined;
    let pageCount = 0;
    const maxPages = 20; // Increased to 20 for full coverage (approx 2000 players)
    
    do {
      const params = {
        team_ids: teamIds,
        per_page: 100
      };
      if (nextCursor) params.cursor = nextCursor;
      
      const response = await ballDontLieService.getPlayersActive(sportKey, params);
      
      // BDL SDK/Service might return array directly or object with data/meta
      // After our fix in ballDontLieService, it returns { data, meta } if meta exists
      const players = Array.isArray(response) ? response : (response?.data || []);
      const meta = response?.meta;
      
      allPlayers = allPlayers.concat(players);
      nextCursor = meta?.next_cursor;
      pageCount++;
      
      console.log(`[DFS Context]   - Page ${pageCount}: Got ${players.length} players (Total: ${allPlayers.length})`);
      
      // Fallback: If we got 100 players but no cursor, BDL might not be providing one
      // but there's likely another page. Try to stop after 1000 players as safety.
      if (!nextCursor && players.length === 100 && pageCount < 10) {
        // Some endpoints use offset instead of cursor, but we'll stick to cursor for now
        // since BDL v1 usually uses next_cursor.
      }
      
    } while (nextCursor && pageCount < maxPages);
    
    console.log(`[DFS Context] ✅ Found ${allPlayers.length} total active players`);
    return allPlayers;
  } catch (error) {
    console.error(`[DFS Context] Active players fetch failed: ${error.message}`);
    return [];
  }
}

/**
 * Fetch player injuries from BDL
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {Array} teamIds - Team IDs to filter by
 * @returns {Array} Injured players with status
 */
export async function fetchInjuriesFromBDL(sport, teamIds = []) {
  try {
    console.log(`[DFS Context] 🏥 Fetching ${sport} injuries from BDL for teams: ${teamIds.join(', ')}`);
    
    let injuries = [];
    
    if (sport === 'NBA') {
      // Use the correct method name
      injuries = await ballDontLieService.getNbaPlayerInjuries(teamIds);
    } else if (sport === 'NFL') {
      // NFL uses different method - may need to implement
      const sportKey = 'americanfootball_nfl';
      try {
        injuries = await ballDontLieService.getPlayerInjuries(sportKey, {
          team_ids: teamIds,
          per_page: 100
        });
      } catch (e) {
        console.warn(`[DFS Context] NFL injuries not available: ${e.message}`);
      }
    }
    
    console.log(`[DFS Context] ✅ Found ${injuries?.length || 0} injury reports`);
    
    // Log critical injuries (season-ending)
    const seasonEnding = (injuries || []).filter(inj => 
      inj.description?.toLowerCase().includes('season-ending') ||
      inj.description?.toLowerCase().includes('entire') ||
      inj.return_date?.includes('Oct 1')
    );
    if (seasonEnding.length > 0) {
      console.log(`[DFS Context] ⚠️ SEASON-ENDING injuries: ${seasonEnding.map(i => `${i.player?.first_name} ${i.player?.last_name}`).join(', ')}`);
    }
    
    return injuries || [];
  } catch (error) {
    console.error(`[DFS Context] Injuries fetch failed: ${error.message}`);
    return [];
  }
}

/**
 * Fetch player stats from Ball Don't Lie API
 * Uses ACTIVE PLAYERS endpoint for accurate current team assignments
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} dateStr - Date string YYYY-MM-DD
 * @returns {Array} Player stats with accurate team info
 */
export async function fetchPlayerStatsFromBDL(sport, dateStr) {
  try {
    if (sport === 'NBA') {
      // Get today's games
      const games = await ballDontLieService.getGames('basketball_nba', { dates: [dateStr] }, 5);
      
      if (!games || games.length === 0) {
        console.log('[DFS Context] No NBA games found for today');
        return [];
      }
      
      // Get team IDs from games
      const teamIds = [];
      const teamAbbreviations = new Map();
      for (const game of games) {
        if (game.home_team?.id) {
          teamIds.push(game.home_team.id);
          teamAbbreviations.set(game.home_team.id, game.home_team.abbreviation);
        }
        if (game.visitor_team?.id) {
          teamIds.push(game.visitor_team.id);
          teamAbbreviations.set(game.visitor_team.id, game.visitor_team.abbreviation);
        }
      }
      
      console.log(`[DFS Context] Teams playing today: ${[...teamAbbreviations.values()].join(', ')}`);
      
      // ⭐ Use ACTIVE PLAYERS endpoint - this has CURRENT team assignments after trades
      const players = await fetchActivePlayersFromBDL('NBA', teamIds);
      
      // Fetch injuries to mark players by status
      // ⚠️ FOR DFS: Track ALL risky statuses (OUT, DOUBTFUL, QUESTIONABLE, GTD)
      const injuries = await fetchInjuriesFromBDL('NBA', teamIds);
      
      // ⭐ CRITICAL: Populate module-level injury cache for use in mergePlayerData
      // This allows Tank01 players to be checked by name even if their IDs don't match BDL
      setInjuryNameCache(injuries);
      
      // Create ID-based injury map for fast lookup
      const playerInjuryStatusMap = new Map(); // ID -> status
      const playerInjuryNameMap = _injuryNameCache; // Use the module cache
      
      for (const inj of injuries) {
        const pid = inj.player?.id;
        const status = (inj.status || '').toUpperCase();
        
        if (pid && status) {
          playerInjuryStatusMap.set(pid, status);
        }
      }
      
      // Count by status type for logging
      const outCount = [...playerInjuryStatusMap.values()].filter(s => s === 'OUT').length;
      const questionableCount = [...playerInjuryStatusMap.values()].filter(s => s === 'QUESTIONABLE' || s.includes('GTD') || s.includes('DAY')).length;
      const doubtfulCount = [...playerInjuryStatusMap.values()].filter(s => s === 'DOUBTFUL').length;
      
      console.log(`[DFS Context] 🏥 Injuries: ${outCount} OUT, ${doubtfulCount} DOUBTFUL, ${questionableCount} QUESTIONABLE/GTD`);
      
      // Log OUT players specifically (these are CRITICAL to exclude)
      const outPlayers = injuries.filter(i => (i.status || '').toUpperCase() === 'OUT');
      if (outPlayers.length > 0) {
        console.log(`[DFS Context] 🚫 OUT PLAYERS (will exclude): ${outPlayers.map(i => `${i.player?.first_name} ${i.player?.last_name}`).join(', ')}`);
      }
      
      // Log questionable players specifically (for DFS these are risky!)
      const questionablePlayers = injuries.filter(i => {
        const status = (i.status || '').toUpperCase();
        return status === 'QUESTIONABLE' || status.includes('GTD') || status.includes('DAY') || status.includes('DOUBT');
      });
      if (questionablePlayers.length > 0) {
        console.log(`[DFS Context] ⚠️ RISKY PLAYERS (excluding from DFS): ${questionablePlayers.map(i => `${i.player?.first_name} ${i.player?.last_name} (${i.status})`).join(', ')}`);
      }
      
      // ═══════════════════════════════════════════════════════════════════════════
      // GEMINI GROUNDING INJURY CHECK - Catch last-minute scratches BDL might miss
      // ═══════════════════════════════════════════════════════════════════════════
      // BDL injury data can be stale. Use Gemini Grounding to search for TODAY's
      // injury news and catch players who were just ruled OUT (like Moe Wagner)
      // ═══════════════════════════════════════════════════════════════════════════
      try {
        const genAI = getGeminiClient();
        if (genAI) {
          console.log(`[DFS Context] 🔍 Searching for today's NBA injury updates via Gemini Grounding...`);
          const model = genAI.getGenerativeModel({
            model: GROUNDING_MODEL_ID,
            generationConfig: { temperature: 1.0 }, // Gemini 3: Keep at 1.0
            tools: [{ google_search: {} }] // Gemini 3: Use google_search instead of deprecated googleSearchRetrieval
          });
          
          const teamsPlaying = [...teamAbbreviations.values()].join(', ');
          const injuryPrompt = `Search for NBA injury report and rotation news TODAY ${dateStr}. 
          
          Check for:
          1. Players ruled OUT or DOUBTFUL for tonight's games.
          2. Players removed from the rotation (DNP-CD risks).
          3. Players who are "weeks away" or have extended injuries not yet updated in databases.
          
          Teams to check: ${teamsPlaying}
          
          Focus on finding recent news for these players specifically: ${players.slice(0, 20).map(p => p.name).join(', ')}
          
          Return ONLY confirmed news as JSON:
          {
            "outPlayers": [
              { "name": "Player Name", "team": "TM", "reason": "e.g., oblique strain", "source": "RotoWire/Twitter" }
            ],
            "rotationRisks": [
              { "name": "Player Name", "team": "TM", "reason": "e.g., out of rotation", "source": "Coach quote" }
            ]
          }`;
          
          const result = await model.generateContent(injuryPrompt);
          const responseText = result.response?.text?.() || '';
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          
          if (jsonMatch) {
            try {
              const injuryData = JSON.parse(jsonMatch[0]);
              
              // Add OUT players from Grounding to our injury map
              for (const outPlayer of (injuryData.outPlayers || [])) {
                const playerName = outPlayer.name?.toLowerCase();
                if (playerName) {
                  // Find matching player in our players array
                  const matchedPlayer = players.find(p => {
                    const pName = (p.first_name + ' ' + p.last_name).toLowerCase();
                    return pName.includes(playerName) || playerName.includes(pName);
                  });
                  if (matchedPlayer) {
                    if (!playerInjuryStatusMap.has(matchedPlayer.id)) {
                      console.log(`[DFS Context] 🚨 Grounding found: ${outPlayer.name} (${outPlayer.team}) OUT - ${outPlayer.reason}`);
                      playerInjuryStatusMap.set(matchedPlayer.id, 'OUT');
                    }
                  }
                }
              }
              
              // Add rotation risks
              for (const riskPlayer of (injuryData.rotationRisks || [])) {
                const playerName = riskPlayer.name?.toLowerCase();
                if (playerName) {
                  const matchedPlayer = players.find(p => {
                    const pName = (p.first_name + ' ' + p.last_name).toLowerCase();
                    return pName.includes(playerName) || playerName.includes(pName);
                  });
                  if (matchedPlayer && !playerInjuryStatusMap.has(matchedPlayer.id)) {
                    console.log(`[DFS Context] ⚠️ Grounding found rotation risk: ${riskPlayer.name} (${riskPlayer.team}) - ${riskPlayer.reason}`);
                    playerInjuryStatusMap.set(matchedPlayer.id, 'DNP-CD');
                  }
                }
              }
              
              const groundingOutCount = (injuryData.outPlayers || []).length;
              const groundingRiskCount = (injuryData.rotationRisks || []).length;
              if (groundingOutCount > 0 || groundingRiskCount > 0) {
                console.log(`[DFS Context] ✅ Grounding found ${groundingOutCount} OUT, ${groundingRiskCount} rotation risks`);
              }
            } catch (parseErr) {
              console.log(`[DFS Context] ⚠️ Could not parse Grounding injury response`);
            }
          }
        }
      } catch (groundingErr) {
        console.log(`[DFS Context] ⚠️ Grounding injury check failed: ${groundingErr.message}`);
      }
      
      // Get current NBA season (consistent with rest of codebase: 1-indexed months)
      // NBA season starts in October: Oct(10)-Dec = currentYear, Jan-Sep = previousYear
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1; // 1-indexed for consistency
      const season = currentMonth >= 10 ? currentYear : currentYear - 1;
      
      console.log(`[DFS Context] Fetching NBA season ${season}-${season + 1} stats`);
      
      // Fetch season averages from BDL for ALL players in batches
      const playerIds = players.map(p => p.id).filter(Boolean);
      let seasonAverages = [];
      const statsBatchSize = 100;
      
      for (let i = 0; i < playerIds.length; i += statsBatchSize) {
        const batchIds = playerIds.slice(i, i + statsBatchSize);
        console.log(`[DFS Context] Fetching NBA season averages for batch ${Math.floor(i/statsBatchSize) + 1} (${batchIds.length} players)`);
        const batchAverages = await ballDontLieService.getNbaSeasonAverages({
          season,
          player_ids: batchIds
        });
        if (Array.isArray(batchAverages)) {
          seasonAverages.push(...batchAverages);
        }
      }
      
      console.log(`[DFS Context] Retrieved ${seasonAverages.length} total player season averages`);
      
      // ═══════════════════════════════════════════════════════════════════════════
      // FETCH L5 GAME LOGS FOR TREND ANALYSIS
      // ═══════════════════════════════════════════════════════════════════════════
      // Get last 5 games for each player to calculate hot/cold streaks
      // This provides REAL data instead of relying on Gemini search
      const l5StatsMap = new Map();
      try {
        // ⭐ FIX: Use start_date instead of seasons to get RECENT games only
        // Query last 14 days to ensure we capture at least 5 games per player
        // NOTE: `dateStr` is the parameter passed to fetchPlayerStatsFromBDL (YYYY-MM-DD format)
        const targetDate = new Date(dateStr + 'T12:00:00'); // Parse the date string
        const fourteenDaysAgo = new Date(targetDate);
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
        const l5StartDate = fourteenDaysAgo.toISOString().split('T')[0]; // YYYY-MM-DD
        
        // ⭐ FIX: Fetch L5 for ALL players, not just top 60
        // Gary needs complete data to evaluate EVERY player in the pool
        // Without L5 data, Gary can't properly assess recent form/trends
        const trendBatchIds = playerIds; // ALL players get L5 data
        const L5_BATCH_SIZE = 15; // 15 players * ~6 games = ~90 records per batch
        console.log(`[DFS Context] Fetching L5 trends for ALL ${trendBatchIds.length} players (from ${l5StartDate} to ${dateStr})`);
        
        const allRecentStats = [];
        for (let i = 0; i < trendBatchIds.length; i += L5_BATCH_SIZE) {
          const batchIds = trendBatchIds.slice(i, i + L5_BATCH_SIZE);
          const batchStats = await ballDontLieService.getPlayerStats('basketball_nba', {
            player_ids: batchIds,
            start_date: l5StartDate,
            end_date: dateStr,
            per_page: 100
          });
          if (Array.isArray(batchStats)) {
            allRecentStats.push(...batchStats);
          }
        }
        
        console.log(`[DFS Context] Retrieved ${allRecentStats.length} recent game stats`);
        
        // Group by player and take last 5 games
        const playerGames = new Map();
        allRecentStats.forEach(stat => {
          const pid = stat.player?.id;
          if (!pid) return;
          if (!playerGames.has(pid)) playerGames.set(pid, []);
          playerGames.get(pid).push(stat);
        });
        
        // Calculate L5 averages for each player
        for (const [pid, games] of playerGames) {
          // Sort by game date descending and take last 5
          const sortedGames = games
            .filter(g => g.game?.date)
            .sort((a, b) => new Date(b.game.date) - new Date(a.game.date))
            .slice(0, 5);
          
          if (sortedGames.length >= 3) { // Need at least 3 games for meaningful trend
            const l5 = {
              games: sortedGames.length,
              ppg: sortedGames.reduce((sum, g) => sum + (g.pts || 0), 0) / sortedGames.length,
              rpg: sortedGames.reduce((sum, g) => sum + (g.reb || 0), 0) / sortedGames.length,
              apg: sortedGames.reduce((sum, g) => sum + (g.ast || 0), 0) / sortedGames.length,
              spg: sortedGames.reduce((sum, g) => sum + (g.stl || 0), 0) / sortedGames.length,
              bpg: sortedGames.reduce((sum, g) => sum + (g.blk || 0), 0) / sortedGames.length,
              mpg: sortedGames.reduce((sum, g) => sum + (parseFloat(g.min) || 0), 0) / sortedGames.length,
              // Track best and worst game for ceiling/floor
              bestPts: Math.max(...sortedGames.map(g => g.pts || 0)),
              worstPts: Math.min(...sortedGames.map(g => g.pts || 0))
            };
            l5StatsMap.set(pid, l5);
          }
        }
        
        console.log(`[DFS Context] 📈 Fetched L5 trends for ${l5StatsMap.size} players`);
      } catch (err) {
        console.warn(`[DFS Context] L5 fetch failed (non-critical): ${err.message}`);
      }
      
      // Merge stats with players
      // BDL season averages structure: { player: {...}, season: 2025, stats: { pts, reb, ast, ... } }
      const statsMap = new Map();
      (seasonAverages || []).forEach(entry => {
        const pid = entry?.player?.id;
        // ⭐ FIX: Stats are nested under entry.stats, not entry directly
        if (pid && entry.stats) statsMap.set(pid, entry.stats);
      });
      
      // Return players with ACCURATE team from BDL Active Players
      return players.map(p => {
        const stats = statsMap.get(p.id) || {};
        const l5 = l5StatsMap.get(p.id);
        
        // ⭐ Get injury status from BDL injury report - check BOTH ID and NAME
        // This includes OUT, DOUBTFUL, QUESTIONABLE, GTD - all risky for DFS
        let bdlInjuryStatus = playerInjuryStatusMap.get(p.id) || null;
        
        // Fallback: check by name if ID didn't match (covers Tank01/BDL ID mismatches)
        if (!bdlInjuryStatus) {
          const normalizedName = normalizePlayerName(p.name);
          const nameInjury = playerInjuryNameMap.get(normalizedName);
          if (nameInjury) {
            bdlInjuryStatus = nameInjury.status;
            console.log(`[DFS Context] 🏥 Injury found by name: ${p.name} → ${bdlInjuryStatus}`);
          }
        }
        
        // ⭐ FIX: Map position for DFS flex slots
        // NBA positions: PG, SG, SF, PF, C
        // Some players listed as "G" (guard) or "F" (forward) - normalize
        let position = (p.position || 'G').toUpperCase();
        if (position === 'G' || position === 'GUARD') position = 'PG';
        if (position === 'F' || position === 'FORWARD') position = 'SF';
        if (position === 'F-C' || position === 'C-F') position = 'PF'; // Power forward/center
        if (position === 'G-F' || position === 'F-G') position = 'SG'; // Combo guard/forward
        
        // Calculate trend (hot/cold) from L5 vs season
        const seasonPpg = stats.pts || 0;
        const l5Ppg = l5?.ppg || seasonPpg;
        let recentForm = 'neutral';
        if (seasonPpg > 0) {
          const pctDiff = ((l5Ppg - seasonPpg) / seasonPpg) * 100;
          if (pctDiff >= 15) recentForm = 'hot';      // 15%+ above season avg
          else if (pctDiff <= -15) recentForm = 'cold'; // 15%+ below season avg
        }
        
        return {
          id: p.id,
          name: `${p.first_name} ${p.last_name}`,
          // ⭐ Team comes from ACTIVE PLAYERS - this is accurate after trades
          team: p.team?.abbreviation || p.team?.name || 'UNK',
          position: position,
          injured: bdlInjuryStatus ? true : false,
          // ⭐ CRITICAL: Set actual injury status for DFS filtering
          // This will be checked by shouldExcludePlayer() to filter QUESTIONABLE/GTD
          status: bdlInjuryStatus || 'ACTIVE',
          // ⭐ Season stats
          seasonStats: {
            ppg: stats.pts || 0,
            rpg: stats.reb || 0,
            apg: stats.ast || 0,
            spg: stats.stl || 0,
            bpg: stats.blk || 0,
            tpg: stats.fg3m || 0,
            topg: stats.tov || 1.5,
            mpg: stats.min ? parseFloat(stats.min) : 0,
            fpts: stats.nba_fantasy_pts || 0
          },
          // ⭐ NEW: L5 Recent Form (real data!)
          l5Stats: l5 ? {
            ppg: Math.round(l5.ppg * 10) / 10,
            rpg: Math.round(l5.rpg * 10) / 10,
            apg: Math.round(l5.apg * 10) / 10,
            mpg: Math.round(l5.mpg * 10) / 10,
            bestPts: l5.bestPts,
            worstPts: l5.worstPts,
            games: l5.games
          } : null,
          recentForm: recentForm // 'hot', 'cold', or 'neutral'
        };
      });
      // ⚠️ DON'T filter injured players here! Let mergePlayerData handle it.
      // If we filter here, Tank01 will re-add them as "missing" players.
      
    } else if (sport === 'NFL') {
      // Get NFL games for today
      const allGames = await ballDontLieService.getGames('americanfootball_nfl', { dates: [dateStr] }, 5);
      
      if (!allGames || allGames.length === 0) {
        console.log('[DFS Context] No NFL games found for today');
        return [];
      }
      
      // ⭐ Filter to ONLY games actually on this specific date
      // BDL returns all Week 17 games, but status field has actual date like "12/27 - 4:30 PM EST"
      const targetMonth = dateStr.split('-')[1].replace(/^0/, ''); // "1" instead of "01"
      const targetDay = dateStr.split('-')[2].replace(/^0/, ''); // "4" instead of "04"
      const targetDateStr = `${targetMonth}/${targetDay}`; // "1/4"
      
      const games = allGames.filter(game => {
        // Check if game date matches dateStr (YYYY-MM-DD)
        // Or if status contains today's date (e.g., "1/4 - 1:00 PM EST")
        const gameDate = game.date || '';
        const status = game.status || '';
        return gameDate.startsWith(dateStr) || status.includes(targetDateStr);
      });
      
      console.log(`[DFS Context] Filtered to ${games.length} NFL games actually on ${targetDateStr} (from ${allGames.length} total week games)`);
      
      if (games.length === 0) {
        console.log('[DFS Context] No NFL games found for TODAY specifically');
        // List what games are available
        allGames.forEach(g => {
          console.log(`  - ${g.visitor_team?.abbreviation} @ ${g.home_team?.abbreviation}: ${g.status}`);
        });
        return [];
      }
      
      // Log today's games
      console.log(`[DFS Context] Today's NFL games:`);
      games.forEach(g => {
        console.log(`  - ${g.visitor_team?.abbreviation} @ ${g.home_team?.abbreviation}: ${g.status}`);
      });
      
      // Get team IDs from TODAY's games only
      const teamIds = new Set();
      for (const game of games) {
        if (game.home_team?.id) teamIds.add(game.home_team.id);
        if (game.visitor_team?.id) teamIds.add(game.visitor_team.id);
        if (game.away_team?.id) teamIds.add(game.away_team.id);
      }
      
      // Fetch active players for these teams with pagination
      let allPlayers = [];
      let nextCursor = undefined;
      let pageCount = 0;
      const maxPages = 5;
      
      do {
        const params = {
          team_ids: Array.from(teamIds),
          per_page: 100
        };
        if (nextCursor) params.cursor = nextCursor;
        
        const response = await ballDontLieService.getPlayersGeneric('americanfootball_nfl', params);
        
        const players = Array.isArray(response) ? response : (response?.data || []);
        const meta = response?.meta;
        
        allPlayers = allPlayers.concat(players);
        nextCursor = meta?.next_cursor;
        pageCount++;
        
        console.log(`[DFS Context]   - Page ${pageCount}: Got ${players.length} players (Total: ${allPlayers.length})`);
        
      } while (nextCursor && pageCount < maxPages);
      
      const players = allPlayers;
      
      // Get current NFL season (2025 season runs Sept 2025 - Feb 2026)
      // NFL season starts in September, so Sept-Dec = current year, Jan-Jul = previous year
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1; // 1-indexed for consistency
      // NFL: Sept(9)-Dec(12) = current year, Jan(1)-Jul(7) = previous year
      const season = currentMonth >= 9 ? currentYear : currentYear - 1;
      
      console.log(`[DFS Context] Fetching NFL ${season} season stats`);
      
      // Fetch NFL season stats from BDL
      // BDL NFL Season Stats provides: passing_yards, rushing_yards, receiving_yards, 
      // passing_touchdowns, rushing_touchdowns, receiving_touchdowns, receptions, etc.
      const playerIds = players.map(p => p.id).filter(Boolean);
      let seasonStats = [];
      
      try {
        // BDL NFL season_stats endpoint - fetch in parallel batches for ALL players
        const batchSize = 10;
        console.log(`[DFS Context] Fetching NFL season stats for ${playerIds.length} players in batches of ${batchSize}`);
        
        for (let i = 0; i < playerIds.length; i += batchSize) {
          const batch = playerIds.slice(i, i + batchSize);
          const batchResults = await Promise.all(
            batch.map(pid => 
              ballDontLieService.getNflPlayerSeasonStats?.({ playerId: pid, season })
                .catch(() => [])
            )
          );
          seasonStats.push(...batchResults.flat());
        }
      } catch (e) {
        console.warn(`[DFS Context] NFL season stats fetch failed: ${e.message}`);
      }
      
      // Create stats map
      const statsMap = new Map();
      (seasonStats || []).forEach(entry => {
        const pid = entry?.player?.id;
        if (pid) statsMap.set(pid, entry);
      });
      
      const playerList = players.map(p => {
        const stats = statsMap.get(p.id) || {};
        const position = (p.position_abbreviation || p.position || '').toUpperCase();
        
        // Map BDL NFL stats to our DFS format
        // Fields from BDL docs: passing_yards_per_game, passing_touchdowns, passing_interceptions,
        // rushing_yards_per_game, rushing_touchdowns, receptions, receiving_yards_per_game, etc.
        return {
          name: `${p.first_name} ${p.last_name}`,
          team: p.team?.abbreviation || p.team?.name || 'UNK',
          position: position === 'QUARTERBACK' ? 'QB' :
                   position === 'RUNNING BACK' ? 'RB' :
                   position === 'WIDE RECEIVER' ? 'WR' :
                   position === 'TIGHT END' ? 'TE' :
                   position || 'FLEX',
          seasonStats: {
            // QB stats
            passing_yards_per_game: stats.passing_yards_per_game || 0,
            passing_touchdowns: stats.passing_touchdowns || 0,
            passing_interceptions: stats.passing_interceptions || 0,
            passing_completion_pct: stats.passing_completion_pct || 0,
            // Rushing stats
            rushing_yards_per_game: stats.rushing_yards_per_game || 0,
            rushing_touchdowns: stats.rushing_touchdowns || 0,
            rushing_attempts: stats.rushing_attempts || 0,
            rushing_fumbles_lost: stats.rushing_fumbles_lost || 0,
            // Receiving stats
            receptions: stats.receptions || 0,
            receiving_yards_per_game: stats.receiving_yards_per_game || 0,
            receiving_touchdowns: stats.receiving_touchdowns || 0,
            receiving_targets: stats.receiving_targets || 0,
            receiving_fumbles_lost: stats.receiving_fumbles_lost || 0,
            // Games played
            games_played: stats.games_played || 0
          }
        };
      });
      
      // ⭐ Add DST entries for each team playing
      const teamAbbrs = [...new Set(playerList.map(p => p.team))];
      const dstEntries = teamAbbrs.map(team => ({
        name: `${team} DST`,
        team: team,
        position: 'DST',
        seasonStats: { isDST: true },
        isDST: true
      }));
      
      console.log(`[DFS Context] Added ${dstEntries.length} DST entries for teams: ${teamAbbrs.join(', ')}`);
      
      // ⭐ Fetch kickers from team rosters (BDL has them as "PK" position in roster)
      // Note: Only FanDuel NFL uses kickers (DraftKings NFL doesn't have K position)
      const kickerEntries = [];
      try {
        for (const teamId of teamIds) {
          // getNflTeamRoster returns array directly, not {data: []}
          const roster = await ballDontLieService.getNflTeamRoster(teamId, season);
          if (roster && roster.length > 0) {
            // Find kickers (PK position in roster depth chart)
            const kickers = roster.filter(r => 
              r.position === 'PK' || 
              r.player?.position_abbreviation === 'PK' ||
              r.player?.position === 'Place Kicker' ||
              r.player?.position === 'Kicker'
            );
            for (const k of kickers) {
              if (k.depth === 1) { // Only get starter
                // Get team abbreviation from the game data
                const teamAbbr = k.player?.team?.abbreviation || 
                  games.find(g => g.home_team?.id === teamId)?.home_team?.abbreviation ||
                  games.find(g => g.visitor_team?.id === teamId)?.visitor_team?.abbreviation ||
                  'UNK';
                kickerEntries.push({
                  name: k.player_name || `${k.player?.first_name} ${k.player?.last_name}`,
                  team: teamAbbr,
                  position: 'K',
                  seasonStats: { isKicker: true },
                  isKicker: true,
                  id: k.player?.id
                });
              }
            }
          }
        }
        if (kickerEntries.length > 0) {
          console.log(`[DFS Context] Added ${kickerEntries.length} kickers: ${kickerEntries.map(k => `${k.name} (${k.team})`).join(', ')}`);
        }
      } catch (e) {
        console.warn(`[DFS Context] Could not fetch kickers from rosters: ${e.message}`);
      }
      
      return [...playerList, ...dstEntries, ...kickerEntries];
    }
    
    return [];
  } catch (error) {
    console.error(`[DFS Context] BDL fetch error: ${error.message}`);
    return [];
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INJURY STATUS FILTERING FOR DFS
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * ⚠️ FOR DFS: We MUST be conservative! If a player is ruled out at game time,
 * users won't have time to adjust their lineup. Better to miss upside than
 * lock in a zero from a player who doesn't play.
 * 
 * EXCLUDE (too risky for DFS):
 * - OUT: Definitely not playing
 * - DOUBTFUL: Very unlikely (<25% chance)
 * - QUESTIONABLE: May or may not play (too risky - could be ruled out late!)
 * - GTD/DTD: Game-time/Day-to-day decision (no time to swap if ruled out)
 * - IR/PUP/SUSPENDED: Extended absence
 * 
 * INCLUDE (safe for DFS):
 * - PROBABLE: Likely to play (>75% chance)
 * - HEALTHY: Playing
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */
const EXCLUDED_INJURY_STATUSES = ['OUT', 'DOUBTFUL', 'QUESTIONABLE', 'GTD', 'DTD', 'DAY-TO-DAY', 'IR', 'PUP', 'SUSPENDED'];

/**
 * Check if a player should be excluded based on rotation risk (DNP-CD)
 * Gary hates "dead air" - players who haven't played in weeks but still have a salary.
 * 
 * Third-string players are DFS poison:
 * - They need TWO injuries to become relevant
 * - Their upside is capped by garbage time only
 * - Example: Kevon Looney (3rd string behind Derik Queen and Yves Missi)
 * 
 * @param {Object} p - The player object with stats
 * @returns {Object} { exclude: boolean, reason: string }
 */
function checkRotationRisk(p) {
  // NBA-specific rotation logic
  const l5Games = p.l5Stats?.games || 0;
  const l5Mpg = p.l5Stats?.mpg || 0;
  const seasonMpg = p.seasonStats?.mpg || 0;
  const seasonPpg = p.seasonStats?.ppg || 0;
  const salary = p.salary || 0;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CASE 0: ZERO MINUTES PLAYED - Player exists in BDL but has NEVER played
  // These are roster players who haven't seen the court (DNP-CD every game)
  // Examples: Enrique Freeman, Rocco Zikarsky, Tristen Newton
  // ═══════════════════════════════════════════════════════════════════════════
  if (seasonMpg === 0 && l5Mpg === 0) {
    return { exclude: true, reason: 'DNP-CD (0 minutes played this season)' };
  }
  
  // Case 1: Deep bench player who hasn't played in last 5 games
  if (l5Games === 0 && seasonMpg < 12 && p.l5Stats !== undefined) {
    return { exclude: true, reason: 'DNP-CD Risk (Out of rotation - 0 games in L5)' };
  }
  
  // Case 2: Deep bench player with effectively 0 minutes
  if (seasonMpg < 5 && l5Mpg < 5 && (seasonMpg > 0 || l5Mpg > 0)) {
    return { exclude: true, reason: 'Deep Bench (Insufficient minutes)' };
  }
  
  // Case 3: Third-string player - low minutes AND low production
  // These players only see garbage time and shouldn't be in optimal lineups
  // Threshold: <12 MPG season AND <6 PPG = backup's backup territory
  if (seasonMpg < 12 && seasonPpg < 6 && salary < 4500 && seasonMpg > 0) {
    return { exclude: true, reason: 'Third-String Risk (Low MPG + Low PPG at punt salary)' };
  }
  
  // Case 4: Minutes trending DOWN - player losing rotation spot
  // If L5 MPG is significantly less than season MPG, they're being phased out
  if (l5Mpg > 0 && seasonMpg > 0 && l5Mpg < seasonMpg * 0.6 && seasonMpg < 20) {
    return { exclude: true, reason: 'Rotation Shrinking (L5 MPG down 40%+ from season)' };
  }

  return { exclude: false };
}

/**
 * Check if a player should be excluded based on injury status
 */
function shouldExcludePlayer(status) {
  if (!status) return false;
  const upperStatus = status.toUpperCase();
  
  // Catch phrases like "Two weeks away" or "Out for season"
  const specialOutPhrases = ['WEEKS AWAY', 'FOR SEASON', 'INDEFINITE', 'SURGERY'];
  if (specialOutPhrases.some(phrase => upperStatus.includes(phrase))) return true;
  
  return EXCLUDED_INJURY_STATUSES.some(excluded => upperStatus.includes(excluded));
}

/**
 * Merge BDL stats with Grounding salary data
 * BDL is SOURCE OF TRUTH for: team, position, stats
 * Grounding provides: salary, ownership, DFS context, injury status
 * 
 * ⚠️ CRITICAL: Excludes OUT and DOUBTFUL players from lineup consideration
 * 
 * @param {Array} bdlPlayers - Players with stats from BDL (accurate teams/stats)
 * @param {Array} groundedPlayers - Players with salaries from Grounding
 * @returns {Array} Merged player pool (excluding OUT/DOUBTFUL)
 */
/**
 * Fetch benchmark projections from the web using Gemini Grounding
 * This replaces RotoWire projections for users without a key
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} dateStr - Formatted date
 * @param {Array} teams - Teams to search for
 * @returns {Map} Map of player names to projections
 */
async function fetchBenchmarkProjections(sport, dateStr, teams = []) {
  const genAI = getGeminiClient();
  const benchmarkMap = new Map();
  if (!genAI) return benchmarkMap;

  try {
    console.log(`[DFS Context] 📊 Fetching expert benchmark projections via Gemini Grounding...`);
    
    const model = genAI.getGenerativeModel({
      model: DFS_MODEL_CONFIG.model,
      tools: [{ google_search: {} }],
      safetySettings: SAFETY_SETTINGS,
      generationConfig: {
        temperature: 1.0, // Gemini 3: Keep at 1.0 - lower values cause looping/degraded performance
        maxOutputTokens: 8192 // Increased from 2048 - Gary needs ALL projections, no truncation
      }
    });

    const prompt = `Search for today's (${dateStr}) expert ${sport} DFS projections for DraftKings/FanDuel.
Check sites like RotoGrinders, FantasyLabs, Establish The Run, or NumberFire.

I need the projected fantasy points for the top 40-50 players in this slate: ${teams.join(', ')}.

Return as JSON:
{
  "projections": [
    { "name": "Player Name", "points": 45.2 },
    { "name": "Another Player", "points": 42.1 }
  ]
}

CRITICAL: Return ONLY valid JSON. Complete ALL array elements before closing brackets.
Do NOT truncate the response - Gary needs ALL player projections to build winning lineups.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    
    const cleanJson = cleanJsonString(text);
    if (cleanJson) {
      try {
        const parsed = JSON.parse(cleanJson);
        if (parsed.projections && Array.isArray(parsed.projections)) {
          parsed.projections.forEach(p => {
            if (p.name && p.points) {
              benchmarkMap.set(normalizePlayerName(p.name), parseFloat(p.points));
            }
          });
          console.log(`[DFS Context] ✅ Integrated ${benchmarkMap.size} expert benchmark projections`);
        }
      } catch (parseErr) {
        console.warn(`[DFS Context] Benchmark JSON parse failed: ${parseErr.message}`);
        console.debug(`[DFS Context] Problematic JSON snippet: ${cleanJson.substring(0, 100)}...`);
      }
    }
  } catch (error) {
    console.warn(`[DFS Context] Benchmark projection fetch failed: ${error.message}`);
  }
  
  return benchmarkMap;
}

export function mergePlayerData(bdlPlayers, groundedPlayers) {
  // Create lookup maps for grounded players - multiple keys for better matching
  const salaryMap = new Map();
  const lastNameMap = new Map(); // Secondary lookup by last name + team
  
  // Track excluded players for logging
  const excludedPlayers = [];
  
  // ⭐ CRITICAL: Check injury status by name for Tank01 players
  // This catches players like Josh Giddey who may have different IDs in Tank01 vs BDL
  // Uses the module-level injury cache populated during fetchInjuriesFromBDL
  const checkInjuryByName = (playerName) => {
    const injury = getInjuryByName(playerName);
    if (injury && injury.status) {
      return injury.status.toUpperCase();
    }
    return null;
  };
  
  for (const p of groundedPlayers) {
    const key = normalizePlayerName(p.name);
    const salaryEntry = {
      salary: p.salary,
      position: p.position,
      allPositions: p.allPositions,
      status: p.status,
      notes: p.notes,
      ownership: p.ownership,
      dvpRank: p.dvpRank,
      recentForm: p.recentForm,
      originalName: p.name
    };
    salaryMap.set(key, salaryEntry);
    
    // Also create last name + team key for fuzzy matching
    const nameParts = p.name.split(' ');
    if (nameParts.length >= 2 && p.team) {
      const lastName = nameParts[nameParts.length - 1].toLowerCase();
      const lastNameKey = `${lastName}_${(p.team || '').toLowerCase()}`;
      lastNameMap.set(lastNameKey, salaryEntry);
    }
  }
  
  // Merge data - BDL is source of truth for team/position/stats
  const merged = [];
  let directMatches = 0;
  let fuzzyMatches = 0;
  
  for (const p of bdlPlayers) {
    const key = normalizePlayerName(p.name);
    let salaryData = salaryMap.get(key);
    
    // Fuzzy match: try last name + team if exact match failed
    if (!salaryData && p.team) {
      const nameParts = p.name.split(' ');
      if (nameParts.length >= 2) {
        const lastName = nameParts[nameParts.length - 1].toLowerCase();
        const lastNameKey = `${lastName}_${(p.team || '').toLowerCase()}`;
        salaryData = lastNameMap.get(lastNameKey);
        if (salaryData) fuzzyMatches++;
      }
    } else if (salaryData) {
      directMatches++;
    }
    
    if (salaryData && salaryData.salary > 0) {
      // ⭐ CHECK INJURY STATUS - BDL is source of truth for injuries!
      // ALWAYS prefer p.status (from BDL) over salaryData.status (from Tank01)
      // This ensures we catch QUESTIONABLE/GTD players that Tank01 might miss
      const playerStatus = p.status || salaryData.status || 'HEALTHY';
      if (shouldExcludePlayer(playerStatus)) {
        excludedPlayers.push({ name: p.name, team: p.team, status: playerStatus, reason: 'Injury status (BDL)' });
        continue; // Skip this player - too risky for DFS!
      }
      
      // ⭐ CHECK ROTATION RISK - Catch players like Hunter Tyson who don't play
      const rotationRisk = checkRotationRisk(p);
      if (rotationRisk.exclude) {
        excludedPlayers.push({ name: p.name, team: p.team, status: playerStatus, reason: rotationRisk.reason });
        continue;
      }
      
      const playerWithSalary = {
        ...p,
        salary: salaryData.salary,
        position: salaryData.position || p.position,
        allPositions: salaryData.allPositions || [salaryData.position || p.position]
      };
      
      merged.push({
        // BDL provides accurate: name, team, seasonStats, l5Stats
        name: p.name,
        team: p.team,  // ALWAYS use BDL team (accurate after trades)
        // ⭐ CRITICAL: Use Tank01/platform position FIRST (DK/FD have different positions than real life)
        position: salaryData.position || p.position,
        allPositions: salaryData.allPositions || [salaryData.position || p.position],
        role: inferPlayerRole(playerWithSalary),
        seasonStats: p.seasonStats,
        l5Stats: p.l5Stats,  // ⭐ PRESERVE L5 data from BDL
        recentForm: p.recentForm || salaryData.recentForm,  // Use BDL's hot/cold calc
        id: p.id,
        // Grounding provides: salary and DFS context
        salary: salaryData.salary,
        status: playerStatus,
        notes: salaryData.notes || '',
        ownership: salaryData.ownership,
        dvpRank: salaryData.dvpRank
      });
    }
  }
  
  // ⭐ CRITICAL: Create set of excluded player names BEFORE Tank01 loop
  // This prevents Tank01 from re-adding players that BDL excluded due to injury
  const excludedPlayerNames = new Set(excludedPlayers.map(p => normalizePlayerName(p.name)));
  
  // Add Tank01/grounded players not in BDL (DST, K, OR players BDL missed)
  // These players get salary-based projection estimates from dfsLineupService
  // This ensures we have enough players for all positions, especially PF/SF which share F players
  let addedFromSalaryData = 0;
  for (const p of groundedPlayers) {
    const key = normalizePlayerName(p.name);
    const exists = merged.some(m => normalizePlayerName(m.name) === key);
    
    // ⭐ CRITICAL: Check if this player was already excluded by BDL injury status!
    // Tank01 might not have injury info, but BDL does - BDL is source of truth
    if (excludedPlayerNames.has(key)) {
      console.log(`[DFS Context] 🚫 Skipping ${p.name} from Tank01 - already excluded by BDL injury`);
      continue;
    }
    
    // ⭐ DOUBLE-CHECK: Look up injury by name (catches ID mismatches)
    const injuryByName = checkInjuryByName(p.name);
    if (injuryByName && shouldExcludePlayer(injuryByName)) {
      console.log(`[DFS Context] 🚫 Skipping ${p.name} from Tank01 - BDL injury by name: ${injuryByName}`);
      excludedPlayers.push({ name: p.name, team: p.team, status: injuryByName, reason: 'Injury status (BDL by name)' });
      continue;
    }
    
    // ⭐ CHECK INJURY STATUS for grounded-only players too (in case Tank01 has status)
    if (shouldExcludePlayer(p.status)) {
      excludedPlayers.push({ name: p.name, team: p.team, status: p.status, reason: 'Injury status (Tank01)' });
      continue;
    }
    
    // ⭐ EXPANDED: Add ANY player with salary who isn't in BDL merged list
    // Try to find their BDL stats first - NEVER fall back to salary-based projections
    if (!exists && p.salary > 0 && p.position) {
      // ═══════════════════════════════════════════════════════════════════════
      // 🔍 BDL LOOKUP: Search for this player in BDL by name (fuzzy match)
      // Use their REAL stats instead of salary-based fallback
      // ═══════════════════════════════════════════════════════════════════════
      let validatedTeam = p.team;
      let foundStats = null;
      
      // Look for this player name in BDL data - try multiple matching strategies
      const pNameLower = p.name?.toLowerCase() || '';
      const pNameParts = pNameLower.split(' ');
      const pFirstName = pNameParts[0] || '';
      const pLastName = pNameParts[pNameParts.length - 1] || '';
      
      // Strategy 1: Exact normalized name match
      let bdlMatch = bdlPlayers.find(b => normalizePlayerName(b.name) === normalizePlayerName(p.name));
      
      // Strategy 2: First 2 chars of first name + full last name
      if (!bdlMatch && pFirstName.length >= 2 && pLastName.length >= 3) {
        bdlMatch = bdlPlayers.find(b => {
          const bName = (b.name || '').toLowerCase();
          const bParts = bName.split(' ');
          const bFirstName = bParts[0] || '';
          const bLastName = bParts[bParts.length - 1] || '';
          return bFirstName.startsWith(pFirstName.slice(0, 2)) && bLastName === pLastName;
        });
      }
      
      // Strategy 3: Last name + same team
      if (!bdlMatch && pLastName.length >= 3) {
        bdlMatch = bdlPlayers.find(b => {
          const bName = (b.name || '').toLowerCase();
          const bLastName = bName.split(' ').pop() || '';
          return bLastName === pLastName && (b.team || '').toUpperCase() === (p.team || '').toUpperCase();
        });
      }
      
      if (bdlMatch) {
        // ⭐ CRITICAL: Use BDL's REAL stats, not salary-based fallback!
        console.log(`[DFS Context] ✅ Found BDL match for ${p.name} → ${bdlMatch.name} (${bdlMatch.team})`);
        validatedTeam = bdlMatch.team || p.team;
        foundStats = bdlMatch.seasonStats;
        
        // Add with REAL BDL stats
        merged.push({
          id: bdlMatch.id,
          name: p.name,
          team: validatedTeam,
          position: p.position || bdlMatch.position,
          allPositions: p.allPositions || [p.position || bdlMatch.position],
          salary: p.salary,
          status: bdlMatch.status || p.status || 'HEALTHY',
          notes: p.notes || '',
          ownership: p.ownership,
          // ⭐ Use REAL BDL stats
          seasonStats: foundStats || bdlMatch.seasonStats || { mpg: 0, ppg: 0 },
          l5Stats: bdlMatch.l5Stats, // Include L5 if available
          recentForm: bdlMatch.recentForm,
          fromSalaryDataOnly: false, // Has REAL stats
          teamValidated: true
        });
        addedFromSalaryData++;
      } else {
        // ═══════════════════════════════════════════════════════════════════════
        // 🐛 BUG: NO BDL MATCH - This should NOT happen
        // BDL has stats for ALL players including rookies (via Game Player Stats)
        // This is a name matching bug that needs fixing
        // ═══════════════════════════════════════════════════════════════════════
        console.error(`[DFS Context] 🐛 BUG: Cannot find ${p.name} (${p.team}) in BDL!`);
        console.error(`[DFS Context]    → Tank01 has: "${p.name}" salary=$${p.salary}`);
        console.error(`[DFS Context]    → Check: 1) Name spelling  2) Team abbreviation  3) BDL search`);
        
        // ⚠️ DO NOT add this player to the pool - we cannot use players without real stats
        // Log what we would have added so developers can debug
        console.error(`[DFS Context]    → SKIPPING this player until BDL matching is fixed`);
        // Count as skipped, not added
        // merged.push() intentionally omitted - don't add players without stats
      }
    }
  }
  
  // Log stats coverage - ALL players should have real BDL stats now
  console.log(`[DFS Context] 📊 Stats coverage: ${merged.length} players with REAL BDL stats`);
  if (addedFromSalaryData > 0) {
    console.log(`[DFS Context] ✅ Added ${addedFromSalaryData} Tank01 players with BDL stats matched`);
  }
  
  // Log excluded players
  if (excludedPlayers.length > 0) {
    console.log(`[DFS Context] ❌ EXCLUDED ${excludedPlayers.length} players (OUT/DOUBTFUL/QUESTIONABLE/GTD):`);
    excludedPlayers.forEach(p => console.log(`   - ${p.name}: ${p.status}`));
  }
  
  console.log(`[DFS Context] Merged ${merged.length} players (${directMatches} exact + ${fuzzyMatches} fuzzy matches from ${groundedPlayers.length} grounded, ${bdlPlayers.length} BDL)`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SALARY DATA CHECK - We need REAL salaries for accurate DFS optimization
  // ═══════════════════════════════════════════════════════════════════════════
  // DFS salaries change daily and are set by DraftKings/FanDuel.
  // Estimated salaries can be wildly inaccurate and defeat the purpose of lineup optimization.
  // 
  // If we have too few real salaries, we WARN the user prominently but still
  // add players (some lineup is better than no lineup, but user should know).
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (merged.length < 30 && bdlPlayers.length > merged.length) {
    console.error(`[DFS Context] ❌ SALARY DATA ISSUE: Only ${merged.length}/${bdlPlayers.length} players have REAL salaries`);
    console.error(`[DFS Context] ❌ Gemini Grounding couldn't fetch complete slate data`);
    console.error(`[DFS Context] ❌ Adding remaining players with ESTIMATED salaries - LINEUP MAY BE INACCURATE`);
    
    // Determine if this is a small slate (limited games = tighter salary distribution)
    const isSmallSlate = bdlPlayers.length < 80;
    console.log(`[DFS Context] Slate type: ${isSmallSlate ? 'SMALL (2-4 games)' : 'MAIN (5+ games)'}`);
    
    for (const p of bdlPlayers) {
      const key = normalizePlayerName(p.name);
      const alreadyMerged = merged.some(m => normalizePlayerName(m.name) === key);
      
      // Check if player has valid stats (NBA: ppg, NFL: passing/rushing/receiving)
      const hasNBAStats = p.seasonStats?.ppg > 0;
      // NFL stats use snake_case from BDL: passing_yards_per_game, rushing_touchdowns, etc.
      const hasNFLStats = (p.seasonStats?.passing_yards_per_game > 0 || 
                          p.seasonStats?.rushing_yards_per_game > 0 || 
                          p.seasonStats?.receiving_yards_per_game > 0 || 
                          p.seasonStats?.passing_touchdowns > 0 ||
                          p.seasonStats?.rushing_touchdowns > 0 ||
                          p.seasonStats?.receiving_touchdowns > 0 ||
                          p.seasonStats?.receptions > 0);
      
      // Handle DST and Kicker entries separately (no traditional stats)
      const isDST = p.position === 'DST' || p.isDST;
      const isKicker = p.position === 'K' || p.isKicker;
      
      // ⭐ Check if this player was already excluded due to injury status from grounding
      const normalizedName = normalizePlayerName(p.name);
      if (excludedPlayerNames.has(normalizedName)) {
        continue; // Skip players already marked OUT/DOUBTFUL from grounding
      }
      
      // Also check injury status on the BDL player object itself
      const playerStatus = p.status || 'HEALTHY';
      if (shouldExcludePlayer(playerStatus)) {
        continue; // Skip OUT/DOUBTFUL players
      }
      
      // Include ALL players - even those without stats get minimum salary
      // This ensures we have full position coverage on small slates
      const hasAnyStats = hasNBAStats || hasNFLStats;
      const isSpecialPosition = isDST || isKicker;
      const isRelevantPosition = ['QB', 'RB', 'WR', 'TE', 'K', 'DST', 'PG', 'SG', 'SF', 'PF', 'C', 'G', 'F'].includes((p.position || '').toUpperCase());
      
      if (!alreadyMerged && (hasAnyStats || isSpecialPosition || isRelevantPosition)) {
        let fpts, estimatedSalary;
        const position = (p.position || '').toUpperCase();
        
        if (isDST) {
          // DST average fantasy points per game (typical range: 5-12)
          fpts = 8;
          estimatedSalary = isSmallSlate ? 4000 : 3500;
        } else if (isKicker) {
          // Kicker average fantasy points per game (typical range: 6-10)
          fpts = 8;
          estimatedSalary = isSmallSlate ? 4500 : 4000;
        } else if (hasNBAStats) {
          // NBA fantasy points estimation
          fpts = p.seasonStats.fpts || (p.seasonStats.ppg + p.seasonStats.rpg * 1.2 + p.seasonStats.apg * 1.5);
        } else {
          // ═══════════════════════════════════════════════════════════════════
          // NFL Fantasy Points Estimation - CORRECT PER-GAME FORMULA
          // ═══════════════════════════════════════════════════════════════════
          // BDL provides:
          // - *_yards_per_game = already per-game (e.g., 233 pass ypg)
          // - *_touchdowns = SEASON TOTAL (e.g., 25 TDs)
          // - receptions = SEASON TOTAL (e.g., 65 receptions)
          //
          // DraftKings scoring (Full PPR):
          // - Passing: 0.04 pts/yd, 4 pts/TD, -1 pts/INT
          // - Rushing: 0.1 pts/yd, 6 pts/TD
          // - Receiving: 0.1 pts/yd, 6 pts/TD, 1 pt/reception
          // ═══════════════════════════════════════════════════════════════════
          
          const stats = p.seasonStats || {};
          const gamesPlayed = stats.games_played || 16;
          
          // Yards per game (already per-game from BDL)
          const passYpg = stats.passing_yards_per_game || 0;
          const rushYpg = stats.rushing_yards_per_game || 0;
          const recYpg = stats.receiving_yards_per_game || 0;
          
          // Convert season totals to per-game
          const passTdPg = (stats.passing_touchdowns || 0) / gamesPlayed;
          const intsPg = (stats.passing_interceptions || 0) / gamesPlayed;
          const rushTdPg = (stats.rushing_touchdowns || 0) / gamesPlayed;
          const recTdPg = (stats.receiving_touchdowns || 0) / gamesPlayed;
          const recPg = (stats.receptions || 0) / gamesPlayed;
          
          // Calculate per-game fantasy points (DraftKings Full PPR)
          fpts = (passYpg * 0.04) + (passTdPg * 4) - (intsPg * 1) + 
                 (rushYpg * 0.1) + (rushTdPg * 6) + 
                 (recYpg * 0.1) + (recTdPg * 6) + recPg;
        }
        
        // ═══════════════════════════════════════════════════════════════════
        // SALARY ESTIMATION - Position-aware for NFL, small slate adjustment
        // ═══════════════════════════════════════════════════════════════════
        // Small slates have TIGHTER salary distribution to prevent stacking all stars
        // Elite players cost MORE on small slates to force tough decisions
        // ═══════════════════════════════════════════════════════════════════
        
        if (!isDST && !isKicker) {
          if (hasNFLStats || (!hasNBAStats && isRelevantPosition && ['QB', 'RB', 'WR', 'TE'].includes(position))) {
            // NFL position-specific salary estimation
            // For players without stats, use position-based minimum salary
            if (!hasNFLStats) {
              // Minimum salary for NFL players without stats
              const minSalaries = { QB: 4500, RB: 4000, WR: 3500, TE: 3000 };
              fpts = 0;
              estimatedSalary = minSalaries[position] || 3000;
            } else if (position === 'QB') {
              // Elite QB (Herbert): 20+ fpts/game = $7,500-$8,500
              // Mid-tier QB: 15-20 fpts = $6,000-$7,500
              // Backup QB: <15 fpts = $4,500-$6,000
              if (fpts >= 20) {
                estimatedSalary = isSmallSlate ? 7800 + (fpts - 20) * 70 : 7000 + (fpts - 20) * 100;
              } else if (fpts >= 15) {
                estimatedSalary = isSmallSlate ? 6500 + (fpts - 15) * 260 : 5500 + (fpts - 15) * 300;
              } else {
                estimatedSalary = isSmallSlate ? 5000 + fpts * 100 : 4500 + fpts * 70;
              }
            } else if (position === 'RB') {
              // Elite RB (Henry/Jacobs): 18+ fpts = $7,200-$8,400
              // Starter RB: 12-18 fpts = $5,500-$7,200
              // Backup RB: <12 fpts = $4,000-$5,500
              if (fpts >= 18) {
                estimatedSalary = isSmallSlate ? 7500 + (fpts - 18) * 90 : 7000 + (fpts - 18) * 100;
              } else if (fpts >= 12) {
                estimatedSalary = isSmallSlate ? 5800 + (fpts - 12) * 285 : 5200 + (fpts - 12) * 300;
              } else {
                estimatedSalary = isSmallSlate ? 4200 + fpts * 130 : 4000 + fpts * 100;
              }
            } else if (position === 'WR') {
              // Elite WR (Nico Collins): 16+ fpts = $6,800-$8,000
              // WR2: 10-16 fpts = $5,000-$6,800
              // WR3: <10 fpts = $3,500-$5,000
              if (fpts >= 16) {
                estimatedSalary = isSmallSlate ? 7000 + (fpts - 16) * 100 : 6500 + (fpts - 16) * 100;
              } else if (fpts >= 10) {
                estimatedSalary = isSmallSlate ? 5200 + (fpts - 10) * 300 : 4800 + (fpts - 10) * 285;
              } else {
                estimatedSalary = isSmallSlate ? 3800 + fpts * 140 : 3500 + fpts * 130;
              }
            } else if (position === 'TE') {
              // Elite TE (Andrews): 12+ fpts = $6,000-$7,000
              // Mid TE: 8-12 fpts = $4,500-$6,000
              // Backup TE: <8 fpts = $3,000-$4,500
              if (fpts >= 12) {
                estimatedSalary = isSmallSlate ? 6200 + (fpts - 12) * 100 : 5800 + (fpts - 12) * 100;
              } else if (fpts >= 8) {
                estimatedSalary = isSmallSlate ? 4800 + (fpts - 8) * 350 : 4300 + (fpts - 8) * 375;
              } else {
                estimatedSalary = isSmallSlate ? 3200 + fpts * 200 : 3000 + fpts * 165;
              }
            } else {
              // Default NFL position
              estimatedSalary = 4500 + fpts * 150;
            }
          } else {
            // NBA salary estimation (existing logic)
            if (fpts >= 50) {
              estimatedSalary = 10000 + (fpts - 50) * 100;
            } else if (fpts >= 35) {
              estimatedSalary = 7000 + (fpts - 35) * 200;
            } else if (fpts >= 20) {
              estimatedSalary = 4500 + (fpts - 20) * 167;
            } else {
              estimatedSalary = 3500 + fpts * 50;
            }
          }
          
          // Round to nearest $100
          estimatedSalary = Math.round(estimatedSalary / 100) * 100;
        }
        
        // Determine note for player type
        let playerNote = 'Estimated salary';
        if (isDST) playerNote = 'Defense/Special Teams';
        else if (isKicker) playerNote = 'Place Kicker';
        
        merged.push({
          name: p.name,
          team: p.team,
          position: p.position,
          seasonStats: p.seasonStats || {},
          id: p.id,
          salary: Math.min(12500, Math.max(3000, estimatedSalary)), // Cap between $3000-$12500
          status: p.status || 'HEALTHY',
          notes: playerNote,
          estimatedSalary: true, // Flag so we know this is estimated
          isDST: isDST,
          isKicker: isKicker
        });
      }
    }
    
    console.log(`[DFS Context] After salary estimation: ${merged.length} players`);
  }
  
  // Return both merged players AND excluded players for teammate opportunity analysis
  return { merged, excludedPlayers };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SMART OWNERSHIP ESTIMATION - Salary-Based Model
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * When Gemini Grounding doesn't find real ownership data, we use a 
 * salary-based estimation model. This is what sharps use:
 * 
 * - High salary ($10K+) → Higher ownership (people pay up for studs)
 * - Mid salary ($6-9K) → Moderate ownership
 * - Low salary ($4-6K) → Lower ownership (value plays)
 * - Punts (< $4K) → Very low ownership (dart throws)
 * 
 * Modifiers:
 * - Recent hot streak → +5-10% ownership (recency bias)
 * - Injury replacement → +8-15% ownership (obvious value)
 * - Tough matchup → -3-5% ownership (faded)
 * - Back-to-back → -5-8% ownership (rest concerns)
 * 
 * @param {Object} player - Player object with salary and stats
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @param {string} sport - 'NBA' or 'NFL'
 * @returns {number} Estimated ownership percentage
 */
function estimateOwnershipFromSalary(player, platform = 'draftkings', sport = 'NBA') {
  const salary = player.salary || 0;
  
  // Platform-specific salary thresholds
  const thresholds = platform === 'fanduel' 
    ? { elite: 9500, high: 7500, mid: 5500, value: 4000 }
    : { elite: 10000, high: 8000, mid: 6000, value: 4000 };
  
  // Base ownership by salary tier
  let baseOwnership;
  if (salary >= thresholds.elite) {
    // Elite tier: 22-35% base
    baseOwnership = 22 + Math.random() * 13;
  } else if (salary >= thresholds.high) {
    // High tier: 15-25% base
    baseOwnership = 15 + Math.random() * 10;
  } else if (salary >= thresholds.mid) {
    // Mid tier: 10-18% base
    baseOwnership = 10 + Math.random() * 8;
  } else if (salary >= thresholds.value) {
    // Value tier: 5-12% base
    baseOwnership = 5 + Math.random() * 7;
  } else {
    // Punt tier: 1-6% base
    baseOwnership = 1 + Math.random() * 5;
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // MODIFIERS - Adjust based on context
  // ═══════════════════════════════════════════════════════════════════════
  
  // Hot streak modifier (+5-10%)
  if (player.recentForm === 'hot' || (player.l5Stats?.ppg > (player.seasonStats?.ppg || 0) * 1.15)) {
    baseOwnership += 5 + Math.random() * 5;
  }
  
  // Injury replacement / usage boost (+8-15%)
  if (player.usageBoost || player.teammateOpportunity || player.injuryBeneficiary) {
    baseOwnership += 8 + Math.random() * 7;
  }
  
  // Clear breakout candidate (+5%)
  if (player.isBreakoutCandidate || player.rotation_status === 'expanded_role') {
    baseOwnership += 5;
  }
  
  // Back-to-back fade (-5%)
  if (player.isB2B || player.isSecondOfB2B) {
    baseOwnership -= 5;
  }
  
  // Star returning / role diminished (-8%)
  if (player.starReturning || player.roleEnded) {
    baseOwnership -= 8;
  }
  
  // Ensure within valid range (1-50%)
  return Math.max(1, Math.min(50, Math.round(baseOwnership * 10) / 10));
}

/**
 * Normalize player name for matching
 * Handles: accents, apostrophes, Jr/Sr/III, hyphens, etc.
 */
function normalizePlayerName(name) {
  if (!name) return '';
  
  return name
    .toLowerCase()
    // Remove accents/diacritics (Dončić → Doncic, etc.)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Remove suffixes (Jr., Sr., III, II)
    .replace(/\s+(jr\.?|sr\.?|iii|ii|iv)$/i, '')
    // Replace hyphens with spaces (Karl-Anthony → Karl Anthony)
    .replace(/-/g, ' ')
    // Remove apostrophes (O'Neale → ONeale)
    .replace(/'/g, '')
    // Remove periods (P.J. → PJ)
    .replace(/\./g, '')
    // Remove all non-alphanumeric except spaces
    .replace(/[^a-z0-9\s]/g, '')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract ownership data from natural language text when JSON parsing fails
 * Looks for patterns like "Player Name (25% ownership)" or "Player Name at 25%"
 */
function extractOwnershipFromText(text) {
  const chalk = [];
  const contrarian = [];
  const lowOwned = [];
  
  // Pattern 1: "Player Name (XX% ownership)" or "Player Name at XX%"
  const ownershipPatterns = [
    /([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+)+)\s*[\(\[]?\s*(\d+(?:\.\d+)?)\s*%?\s*(?:ownership|owned|own)?\s*[\)\]]?/gi,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+)+)\s+(?:at|@)\s*(\d+(?:\.\d+)?)\s*%/gi,
  ];
  
  for (const pattern of ownershipPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1].trim();
      const ownership = parseFloat(match[2]);
      
      if (ownership > 0 && ownership <= 100) {
        const entry = { name, ownership };
        
        if (ownership >= 25) {
          chalk.push(entry);
        } else if (ownership < 10) {
          contrarian.push(entry);
        } else {
          lowOwned.push(entry);
        }
      }
    }
  }
  
  // Pattern 2: Look for chalk/contrarian mentions with player names
  const chalkSection = text.match(/chalk[^:]*:([^}]+)/i);
  if (chalkSection) {
    const names = chalkSection[1].match(/([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+)+)/g);
    if (names) {
      names.forEach(name => {
        if (!chalk.some(p => normalizePlayerName(p.name) === normalizePlayerName(name))) {
          chalk.push({ name: name.trim(), ownership: 30 }); // Default high ownership
        }
      });
    }
  }
  
  const contrarianSection = text.match(/contrarian[^:]*:([^}]+)/i);
  if (contrarianSection) {
    const names = contrarianSection[1].match(/([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+)+)/g);
    if (names) {
      names.forEach(name => {
        if (!contrarian.some(p => normalizePlayerName(p.name) === normalizePlayerName(name))) {
          contrarian.push({ name: name.trim(), ownership: 5 }); // Default low ownership
        }
      });
    }
  }
  
  return { chalk, contrarian, lowOwned, sources: [] };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * COMPREHENSIVE DFS CONTEXT - All the factors Gary searches for
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * GAME ENVIRONMENT:
 * - Pace of play (possessions per game)
 * - Blowout risk (heavy favorites = starters sit)
 * - Back-to-back games (rest/underperformance risk)
 * 
 * OWNERSHIP & STRATEGY:
 * - Projected ownership % (contrarian plays)
 * - Correlation stacks (QB+WR, game stacks)
 * 
 * PLAYER-SPECIFIC CONTEXT:
 * - Recent form (L5/L10 hot/cold streaks)
 * - Usage rate spikes (teammate injuries)
 * - DvP rankings (defense vs position)
 * - Revenge games (vs former teams)
 * - Defensive matchups (player vs defender)
 * 
 * NFL-SPECIFIC:
 * - Red zone targets (TD upside)
 * - Snap count % (opportunity)
 * - Target share (% of team targets)
 * - Weather (wind/rain affects passing)
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Fetch COMPREHENSIVE DFS context using Gemini Search Grounding
 * This is the main function that fetches ALL DFS-specific factors
 * 
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} slateDate - Date string (e.g., 'December 25, 2025')
 * @param {Array} teams - Array of team abbreviations playing today
 * @returns {Object} Complete DFS context with all factors
 */
export async function fetchComprehensiveDFSContext(platform, sport, slateDate, teams = []) {
  const genAI = getGeminiClient();
  if (!genAI) {
    console.log('[DFS Context] Gemini not available - returning empty context');
    return { players: [], gameContext: [], groundingUsed: false };
  }
  
  const platformName = platform === 'draftkings' ? 'DraftKings' : 'FanDuel';
  const teamsStr = teams.join(', ') || 'all teams';
  
  try {
    console.log(`[DFS Context] 🎯 Fetching COMPREHENSIVE ${platformName} ${sport} context for ${slateDate}`);
    
    const model = genAI.getGenerativeModel({
      model: DFS_MODEL_CONFIG.model,
      tools: [{ google_search: {} }],
      safetySettings: SAFETY_SETTINGS,
      generationConfig: {
        temperature: getDFSTemperature('gpp'), // Fixed at 1.0 per Gemini 3 best practices
        topP: DFS_MODEL_CONFIG.topP,
        maxOutputTokens: 16384, // Larger for comprehensive data
        thinkingConfig: { 
          includeThoughts: true,
          thinkingLevel: DFS_MODEL_CONFIG.thinkingLevel // "high" for deep reasoning
        }
      }
    });

    let prompt;
    if (sport === 'NBA') {
      prompt = `You are Gary AI - an INDEPENDENT THINKER who investigates, understands, and decides on your own.

You find VALUE where the market is wrong, not just highest projections. You don't follow consensus or copy what optimizers say.

## GARY'S SHARP DFS FRAMEWORK

**HARD FACTORS to INVESTIGATE:**
- Usage rate, target share, minutes trends (L5 vs season)
- Defense vs Position rankings (DvP)
- Salary efficiency (projected points per $1K)
- Confirmed starting lineups and role changes

**GARY'S APPROACH:**
Investigate the factors. Understand the opportunity. Make YOUR OWN recommendations based on YOUR analysis.

Search for COMPREHENSIVE DFS data for ${platformName} NBA on ${slateDate}.

🚨🚨🚨 ANTI-HALLUCINATION RULES (ABSOLUTE - ZERO TOLERANCE) 🚨🚨🚨

1. **NO TRAINING DATA**: Your training data is OUTDATED. It is ${slateDate} - use ONLY what you find via search.
2. **ROSTERS CHANGE DAILY**: Players are traded, injured, and signed constantly. DO NOT assume any player is on any team.
3. **ONLY CITE SEARCHED DATA**: Every player name, salary, and projection MUST come from your search results.
4. **IF NOT FOUND, SAY NULL**: If you cannot find data for a player, set their fields to null - DO NOT guess.
5. **TEAMS CHANGE**: Player X may have been traded since your training cutoff. VERIFY via search.
6. **NO INVENTED STATS**: If a stat (ownership %, projection, etc.) is not in search results, use null.

Teams playing: ${teamsStr}

**SEARCH FOR ALL OF THE FOLLOWING:**

0. **STARTING LINEUPS & ROTATION** (search "Basketball Monster starting lineups ${slateDate}" OR "RotoGrinders NBA lineups ${slateDate}"):
   ⚠️ MOST CRITICAL - Do this search FIRST
   - Confirmed starting 5 for EACH game
   - "Next Man Up": Which backups are starting due to injury?
   - Bench players projected for 25+ minutes
   - Minutes restrictions on injury returns
   - Recent rotation changes (last 3 games)

1. **PLAYER SALARIES & OWNERSHIP** (search "${platformName} NBA ownership projections ${slateDate}"):
   - Player salaries for today's slate
   - Projected ownership % for top 40 players
   - Identify chalk plays (>20% owned) vs contrarian (<5% owned)

2. **DEFENSE VS POSITION (DvP)** (search "NBA defense vs position rankings December 2025"):
   - Rank 1-30 for each position (1 = worst defense, easiest matchup)
   - Which defenses are exploitable at PG, SG, SF, PF, C?

3. **PACE OF PLAY** (search "NBA team pace rankings 2025"):
   - Possessions per game by team
   - Fast-paced games = more fantasy opportunities

4. **RECENT FORM (L5)** (search "NBA fantasy hot streaks December 2025"):
   - Players exceeding season average by 20%+ in last 5 games = "hot"
   - Players below average by 20%+ = "cold"

5. **USAGE RATE CHANGES** (search "NBA injury impacts fantasy December 2025"):
   - When star X is out, who gets the usage boost?
   - Target share redistribution

6. **BACK-TO-BACK STATUS** (search "NBA back to back schedule ${slateDate}"):
   - Which teams are on 2nd night of B2B?
   - Veterans may rest or underperform

7. **BLOWOUT RISK** (search "NBA point spreads ${slateDate}"):
   - Games with spread >10 = starters may sit in 4th quarter
   - Target close games for full minutes

8. **REVENGE GAMES** (search "NBA players vs former teams ${slateDate}"):
   - Players facing former team get extra motivation
   - Historical stats vs former team

9. **CORRELATION STACKS** (search "NBA DFS stacking strategies"):
   - Same-game parlay recommendations
   - High-scoring game stacks

**CRITICAL: PREDICTIVE vs REACTIVE Logic**
- ✅ Find players ABOUT TO have a big game (value BEFORE it pops) 
- ❌ Don't chase players who JUST HAD a big game (chasing after the pop)
- ✅ Check if hot streaks are SUSTAINABLE or just fill-in roles
- ❌ Don't reward yesterday's outlier if the role ended today

Return as JSON:
{
  "players": [
    {
      "name": "Player Name",
      "team": "TM",
      "position": "PG/SG/SF/PF/C",
      "salary": 9500,
      "ownership": 18.5,
      "dvpRank": 5,
      "recentForm": "hot|cold|neutral",
      "isB2B": false,
      "isRevenge": false,
      "usageBoost": null,
      "blowoutRisk": false,
      "rotation_status": "expanded_role|ongoing_starter|breakout_candidate|bench_return|diminished_role|stable",
      "minutes_trend": "increasing|stable|decreasing|volatile",
      "role_sustainability": "one_game|short_term|season_long|ended",
      "projected_minutes": 32,
      "notes": "Key context about this player - include WHY role is expanding/diminishing"
    }
  ],
  "target_players": [
    {
      "name": "Player Name",
      "team": "TM",
      "reason": "Why they're a strong play TONIGHT (predictive)",
      "narrative_type": "injury_boost|revenge|matchup|breakout_spot",
      "rotation_status": "expanded_role|breakout_candidate",
      "minutes_trend": "increasing",
      "role_sustainability": "ongoing|short_term",
      "projected_minutes": 28
    }
  ],
  "fade_players": [
    {
      "name": "Player Name",
      "team": "TM",
      "reason": "Why to fade TONIGHT (e.g., starter returns, role ended)",
      "rotation_status": "bench_return|diminished_role",
      "minutes_trend": "decreasing",
      "role_sustainability": "ended"
    }
  ],
  "gameContext": [
    {
      "game": "TM @ TM",
      "pace": "fast|average|slow",
      "spread": -5.5,
      "total": 225.5,
      "stackable": true,
      "notes": "Game-specific narrative"
    }
  ],
  "dvpRankings": {
    "PG": { "best_matchups": ["TM1", "TM2"], "worst_matchups": ["TM3", "TM4"] },
    "SG": { "best_matchups": ["TM1", "TM2"], "worst_matchups": ["TM3", "TM4"] },
    "SF": { "best_matchups": ["TM1", "TM2"], "worst_matchups": ["TM3", "TM4"] },
    "PF": { "best_matchups": ["TM1", "TM2"], "worst_matchups": ["TM3", "TM4"] },
    "C": { "best_matchups": ["TM1", "TM2"], "worst_matchups": ["TM3", "TM4"] }
  },
  "hotStreaks": ["Player1", "Player2"],
  "coldStreaks": ["Player3", "Player4"],
  "revengeGames": [{ "player": "Name", "formerTeam": "TM", "history": "avg vs team" }],
  "usageSpikes": [{ "player": "Name", "reason": "Star X is out", "boost": "+15% usage" }],
  "b2bFades": ["Team1", "Team2"],
  "recommendedStacks": [{ "game": "TM @ TM", "stack": ["Player1", "Player2"], "reason": "High total" }]
}`;
    } else {
      // NFL prompt
      prompt = `You are Gary AI - an INDEPENDENT THINKER who investigates, understands, and decides on your own.

You find VALUE where the market is wrong, not just highest projections. You don't follow consensus or copy what optimizers say.

## GARY'S SHARP DFS FRAMEWORK

**HARD FACTORS to INVESTIGATE:**
- Target share, snap %, red zone opportunities
- Defense vs Position rankings (DvP)
- Game script implications (spread + total)
- Weather impact on passing vs rushing

**GARY'S APPROACH:**
Investigate the factors. Understand the opportunity. Make YOUR OWN recommendations based on YOUR analysis.

Search for COMPREHENSIVE DFS data for ${platformName} NFL on ${slateDate}.

Teams playing: ${teamsStr}

**SEARCH FOR ALL OF THE FOLLOWING:**

1. **PLAYER SALARIES & OWNERSHIP** (search "${platformName} NFL ownership projections ${slateDate}"):
   - Player salaries for today's slate
   - Projected ownership % for top 50 players
   - Identify chalk plays vs contrarian options

2. **DEFENSE VS POSITION (DvP)** (search "NFL defense vs position rankings 2025"):
   - Fantasy points allowed by position
   - Which defenses are exploitable at QB, RB, WR, TE?

3. **RED ZONE TARGETS** (search "NFL red zone targets leaders 2025"):
   - Who gets the goal-line work?
   - Red zone target share for WRs/TEs
   - Goal-line carries for RBs

4. **SNAP COUNT %** (search "NFL snap counts week ${slateDate}"):
   - Players with 80%+ snaps = volume
   - Rising snap counts = opportunity increasing

5. **TARGET SHARE** (search "NFL target share leaders 2025"):
   - % of team's passes going to each player
   - Air yards share for big-play upside

6. **RECENT FORM (L3)** (search "NFL fantasy hot players December 2025"):
   - Players exceeding projections last 3 weeks
   - Cold streaks to investigate (sustainable or variance?)

7. **WEATHER** (search "NFL weather ${slateDate}"):
   - Wind >15mph = investigate impact on deep passing game
   - Rain/snow = investigate impact on passing vs rushing efficiency
   - Dome games = safe passing

8. **GAME SCRIPT** (search "NFL point spreads ${slateDate}"):
   - Heavy favorites run more (RB boost)
   - Underdogs pass more (WR/TE boost)

9. **INJURY IMPACTS** (search "NFL injury impacts fantasy ${slateDate}"):
   - WR1 out = WR2/WR3 target spike
   - RB1 out = backup RB value

10. **REVENGE GAMES** (search "NFL players vs former teams ${slateDate}"):
    - Extra motivation factor

11. **CORRELATION STACKS** (search "NFL DFS stacking strategies"):
    - QB + WR1 stacks
    - Game stacks for shootouts

Return as JSON:
{
  "players": [
    {
      "name": "Player Name",
      "team": "TM",
      "position": "QB/RB/WR/TE/DST/K",
      "salary": 7500,
      "ownership": 12.5,
      "dvpRank": 8,
      "recentForm": "hot|cold|neutral",
      "snapPct": 85,
      "targetShare": 24.5,
      "redZoneTargets": 8,
      "isRevenge": false,
      "weatherImpact": "none|positive|negative",
      "notes": "Key context"
    }
  ],
  "gameContext": [
    {
      "game": "TM @ TM",
      "spread": -7.5,
      "total": 48.5,
      "weather": "Clear/Dome/Wind/Rain",
      "gameScript": "Favorite runs / Underdog passes",
      "stackable": true,
      "notes": "Game narrative"
    }
  ],
  "dvpRankings": {
    "QB": { "best_matchups": ["TM1", "TM2"], "worst_matchups": ["TM3", "TM4"] },
    "RB": { "best_matchups": ["TM1", "TM2"], "worst_matchups": ["TM3", "TM4"] },
    "WR": { "best_matchups": ["TM1", "TM2"], "worst_matchups": ["TM3", "TM4"] },
    "TE": { "best_matchups": ["TM1", "TM2"], "worst_matchups": ["TM3", "TM4"] }
  },
  "hotStreaks": ["Player1", "Player2"],
  "coldStreaks": ["Player3", "Player4"],
  "revengeGames": [{ "player": "Name", "formerTeam": "TM" }],
  "injuryBoosts": [{ "player": "Name", "reason": "WR1 out", "boost": "+8 targets expected" }],
  "weatherFades": ["Player1 (wind)", "Player2 (rain)"],
  "recommendedStacks": [{ "qb": "QB Name", "receivers": ["WR1", "WR2"], "reason": "Shootout expected" }]
}`;
    }

    const startTime = Date.now();
    const result = await model.generateContent(prompt);
    const duration = Date.now() - startTime;
    
    console.log(`[DFS Context] ✅ Comprehensive context fetched in ${duration}ms`);
    
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        ...parsed,
        groundingUsed: true
      };
    }
    
    return { players: [], gameContext: [], groundingUsed: false };
    
  } catch (error) {
    console.error(`[DFS Context] Comprehensive context error: ${error.message}`);
    return { players: [], gameContext: [], groundingUsed: false, error: error.message };
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * FETCH OWNERSHIP PROJECTIONS - Dedicated Grounding for Chalk/Contrarian Analysis
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Uses Gemini Grounding to search specific DFS sites for ownership projections:
 * - Establish The Run (ETR)
 * - Stokastic
 * - FantasyLabs
 * - RotoGrinders
 * 
 * Returns:
 * - chalk: Players with >25% projected ownership
 * - contrarian: Players with <10% ownership but strong projections
 * - lowOwned: Players with 10-25% ownership (medium differentiation)
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */
export async function fetchOwnershipProjections(sport, platform, slateDate, teams = []) {
  const genAI = getGeminiClient();
  if (!genAI) {
    console.log('[DFS Context] Gemini not available - skipping ownership projections');
    return { chalk: [], contrarian: [], lowOwned: [], sources: [] };
  }
  
  const platformName = platform === 'draftkings' ? 'DraftKings' : 'FanDuel';
  const teamsStr = teams.join(', ');
  
  try {
    console.log(`[DFS Context] 📊 Fetching ownership projections from DFS industry sources...`);
    
    const model = genAI.getGenerativeModel({
      model: DFS_MODEL_CONFIG.model,
      tools: [{ google_search: {} }], // Grounding: ENABLED
      safetySettings: SAFETY_SETTINGS,
      generationConfig: {
        temperature: 1.0, // High temperature for creative searching and diverse data points
        topP: DFS_MODEL_CONFIG.topP,
        maxOutputTokens: 4096
      }
    });
    
    const prompt = `Search for ${platformName} ${sport} DFS ownership projections for ${slateDate}.

**SEARCH THESE SPECIFIC SOURCES:**
1. "${platformName} ${sport} ownership projections ${slateDate} Establish The Run"
2. "${platformName} ${sport} chalk plays ${slateDate} Stokastic"
3. "FantasyLabs ${sport} projected ownership ${slateDate}"
4. "RotoGrinders ${sport} ownership ${slateDate}"

**Teams playing:** ${teamsStr}

**FIND AND REPORT:**
1. **CHALK PLAYS** (>25% projected ownership):
   - The "obvious" plays everyone will roster
   - Usually top-projected players at their position

2. **CONTRARIAN PLAYS** (<10% projected ownership but high ceiling):
   - Undervalued players with strong upside
   - Often role players in favorable spots
   - Players with recent hot streaks that ownership hasn't caught up to

3. **LOW-OWNED VALUE** (10-25% ownership):
   - Medium differentiation plays
   - Good balance of upside and ownership

Return as JSON:
{
  "chalk": [
    {
      "name": "Player Name",
      "team": "TM",
      "position": "QB/RB/WR/TE/PG/SG/etc",
      "ownership": 35.5,
      "reason": "Why they're chalk (e.g., best matchup, highest projection)"
    }
  ],
  "contrarian": [
    {
      "name": "Player Name",
      "team": "TM", 
      "position": "RB",
      "ownership": 6.5,
      "upside": "Why they have upside despite low ownership",
      "ceiling": "20+ points possible if..."
    }
  ],
  "lowOwned": [
    {
      "name": "Player Name",
      "team": "TM",
      "position": "WR",
      "ownership": 18.5,
      "reason": "Value at moderate ownership"
    }
  ],
  "sources": ["Establish The Run", "Stokastic"]
}

IMPORTANT:
- Ownership must be a NUMBER (not string), e.g., 25.5 not "25.5%"
- Only include players actually on today's slate (teams: ${teamsStr})
- Chalk threshold: >25%
- Contrarian threshold: <10%
- Low-owned range: 10-25%

Return ONLY valid JSON. Start with { and end with }.`;

    const startTime = Date.now();
    const result = await model.generateContent(prompt);
    const duration = Date.now() - startTime;
    
    console.log(`[DFS Context] ✅ Ownership projections fetched in ${duration}ms`);
    
    const response = result.response;
    const text = response.text();
    
    // Log grounding metadata
    const candidate = response.candidates?.[0];
    const groundingMetadata = candidate?.groundingMetadata;
    if (groundingMetadata?.webSearchQueries?.length > 0) {
      console.log(`[DFS Context] 🔍 Ownership searches: "${groundingMetadata.webSearchQueries.slice(0, 3).join('", "')}"`);
    }
    
    // Parse JSON from response with repair for truncation
    const cleanedJson = cleanJsonString(text);
    if (cleanedJson) {
      try {
        const parsed = JSON.parse(cleanedJson);
        
        const chalkCount = parsed.chalk?.length || 0;
        const contrarianCount = parsed.contrarian?.length || 0;
        const lowOwnedCount = parsed.lowOwned?.length || 0;
        
        console.log(`[DFS Context] 📊 Found: ${chalkCount} chalk, ${contrarianCount} contrarian, ${lowOwnedCount} low-owned plays`);
        
        return {
          chalk: parsed.chalk || [],
          contrarian: parsed.contrarian || [],
          lowOwned: parsed.lowOwned || [],
          sources: parsed.sources || [],
          groundingUsed: !!groundingMetadata?.webSearchQueries?.length
        };
      } catch (parseErr) {
        console.warn(`[DFS Context] Ownership JSON parse failed after repair: ${parseErr.message}`);
        console.warn(`[DFS Context] Attempting to extract ownership from natural language...`);
        
        // Fallback: Extract ownership data from natural language
        const extractedData = extractOwnershipFromText(text);
        if (extractedData.chalk.length > 0 || extractedData.contrarian.length > 0) {
          console.log(`[DFS Context] 📊 Extracted: ${extractedData.chalk.length} chalk, ${extractedData.contrarian.length} contrarian plays from text`);
          return {
            ...extractedData,
            groundingUsed: !!groundingMetadata?.webSearchQueries?.length
          };
        }
      }
    }
    
    return { chalk: [], contrarian: [], lowOwned: [], sources: [], groundingUsed: false };
    
  } catch (error) {
    console.error(`[DFS Context] Ownership projections error: ${error.message}`);
    return { chalk: [], contrarian: [], lowOwned: [], sources: [], groundingUsed: false, error: error.message };
  }
}

/**
 * Fetch DFS narrative context using Gemini Grounding
 * This is what separates Gary from a "math bot" - understanding the STORY
 * 
 * Key narratives to identify:
 * - Revenge games (vs former teams)
 * - Injury impacts (elevated usage rates)
 * - Back-to-back situations (fatigue)
 * - Weather/dome factors (NFL)
 * - Vegas lines (high-scoring games)
 * - Hot streaks (recent performance)
 * - Minutes/usage trends
 * - Historical matchups vs defenses
 */
export async function fetchDFSNarrativeContext(sport, slateDate, games = []) {
  const genAI = getGeminiClient();
  if (!genAI) {
    console.log('[DFS Context] Gemini not available - skipping narrative context');
    return { narratives: [], targetPlayers: [], fadePlayers: [], starsReturning: [] };
  }
  
  const gameDescriptions = games.map(g => 
    `${g.visitor_team || g.away_team} @ ${g.home_team}`
  ).join(', ');
  
  // Apply DFS_MODEL_CONFIG for narrative context
  try {
    console.log(`[DFS Context] 📖 Fetching narrative context for ${sport} games`);
    console.log(`[DFS Context] MODEL_CONFIG: ${DFS_MODEL_CONFIG.model} | temp=${getDFSTemperature('gpp')} | reasoning=${DFS_MODEL_CONFIG.reasoningLevel} | grounding=${DFS_MODEL_CONFIG.grounding}`);
    
    const model = genAI.getGenerativeModel({
      model: DFS_MODEL_CONFIG.model,
      tools: [{ google_search: {} }], // Grounding: ENABLED
      safetySettings: SAFETY_SETTINGS,
      generationConfig: {
        temperature: getDFSTemperature('gpp'), // Fixed at 1.0 per Gemini 3 best practices
        topP: DFS_MODEL_CONFIG.topP,
        maxOutputTokens: DFS_MODEL_CONFIG.maxOutputTokens,
        // Gemini 3 thinkingConfig - use thinkingLevel (replaces legacy thinkingBudget)
        thinkingConfig: {
          includeThoughts: true,
          thinkingLevel: DFS_MODEL_CONFIG.thinkingLevel // "high" for deep reasoning
        }
      }
    });
    
    const prompt = sport === 'NBA' 
      ? `You are Gary - an INDEPENDENT THINKER who investigates, understands, and decides on your own.

You find VALUE where the market is wrong, not chase yesterday's heroes. You don't follow consensus—you make YOUR OWN recommendations.

## GARY'S SHARP DFS FRAMEWORK

**HARD FACTORS (Investigable - Trust These):**
- Usage rate, target share, minutes trends
- Defense vs Position (DvP) rankings
- Salary efficiency (points per $1K)

**SOFT FACTORS (Need Verification):**
- "Revenge game" → Need stats to back it
- "Hot streak" → Is the role sustainable?
- "Contract year" → Show elevated stats

**KEY QUESTION FOR EVERY PLAYER:**
"Is this player's SALARY priced for their role TONIGHT or their role from 2 weeks ago?"

---

Search Basketball Monster, RotoGrinders, or FantasyLabs for DFS context for tonight's NBA slate on ${slateDate}:
${gameDescriptions}

⚠️ STARTING LINEUPS & ROTATION (CRITICAL - search lineup sources first):
For EACH game, identify:
1. **CONFIRMED STARTING 5**: Who are the confirmed starters for each team?
2. **"NEXT MAN UP"**: Which backup is starting due to injury? (e.g., "Payton Pritchard starting for Jrue Holiday")
3. **MINUTES PROJECTION**: Which bench players are projected for 25+ minutes tonight?
4. **ROTATION CHANGES**: Any recent changes in last 3 games? (new starter, 6th man change)
5. **MINUTES RESTRICTIONS**: Any stars on a minutes limit due to injury return?

Identify and return as JSON:
{
  "game_narratives": [
    {
      "game": "Team @ Team",
      "vegas_total": 225.5,
      "narratives": [
        "Specific narrative (revenge game, injury impact, etc)"
      ],
      "starting_lineups": {
        "home": ["Player1 (PG)", "Player2 (SG)", "Player3 (SF)", "Player4 (PF)", "Player5 (C)"],
        "away": ["Player1 (PG)", "Player2 (SG)", "Player3 (SF)", "Player4 (PF)", "Player5 (C)"]
      },
      "rotation_changes": [
        "Player X now starting for injured Player Y",
        "Player Z back to bench after Player A returns"
      ]
    }
  ],
  "target_players": [
    {
      "name": "Player Name",
      "team": "TM",
      "reason": "Why they're a strong DFS play TONIGHT (be predictive, not reactive)",
      "narrative_type": "injury_boost|revenge|breakout_spot|usage_spike|matchup",
      "rotation_status": "expanded_role|breakout_candidate|ongoing_starter",
      "minutes_trend": "increasing|stable",
      "role_sustainability": "ongoing|short_term|season_long",
      "projected_minutes": 32
    }
  ],
  "fade_players": [
    {
      "name": "Player Name", 
      "team": "TM",
      "reason": "Why to avoid in DFS TONIGHT (include if their role just ended)",
      "narrative_type": "rest|blowout_risk|tough_matchup|cold_streak|role_ended",
      "rotation_status": "bench_return|diminished_role|stable",
      "minutes_trend": "decreasing|volatile",
      "role_sustainability": "ended|one_game"
    }
  ],
  "stars_returning": [
    {
      "name": "Star Player Name",
      "team": "TM",
      "returning_from": "injury description (e.g., 'knee injury - missed 5 games')",
      "games_missed": 5,
      "minutes_restriction": null | "15-20 min limit" | "no restriction",
      "restriction_confidence": "confirmed" | "expected" | "unknown",
      "impact_players": ["Player A", "Player B"],
      "impact_reason": "Why teammates lose usage (e.g., 'Embiid back = Maxey usage drops from 35% to 28%')",
      "impact_severity": "full" | "partial" | "minimal"
    }
  ]
}

**MINUTES RESTRICTION AWARENESS (CRITICAL):**
When a star returns, INVESTIGATE if they're on a minutes limit:
- "Full return" = teammates lose significant usage (impact_severity: "full")
- "Minutes restriction" (15-20 min) = teammates only lose SOME usage (impact_severity: "partial")  
- "First game back from extended injury" = expect caution, may not play 4th quarter (impact_severity: "partial")
- Example: Sabonis returning from 27-game absence → likely capped at 20-24 min = Achiuwa still has value

**CRITICAL THINKING FRAMEWORK - Stock Trader Mindset:**

🎯 **PREDICTIVE (Good)**: Find value BEFORE it pops
   - ✅ "Starter OUT tonight → Backup will get 30+ min" (leading indicator)
   - ✅ "Trade just happened → Player X now in starting role" (future opportunity)

❌ **REACTIVE (Bad)**: Chase value AFTER it already popped
   - ❌ "Backup had 25-point game yesterday" → Check: Was starter out? Is starter back tonight?
   - ❌ "Player on hot streak" → Check: Was it sustainable role or fill-in duty?

Focus on:
1. **PREDICTIVE Injury Impacts** (< 7 days):
   - ✅ "Starter OUT TONIGHT → Backup will play 30+ min" (future opportunity)
   - ❌ "Backup scored 25 last game" → Check if starter is BACK tonight (role ended?)
   - ❌ DO NOT mention season-long injuries (e.g., player out all year - stats already reflect this)
   - ✅ DO mention NEW injuries (< 7 days) that create usage spikes TONIGHT

2. **Rotation Context** (CRITICAL):
   - If a role player had a career game, check: WHY did they get minutes?
   - Were starters injured? Are those starters BACK tonight?
   - If starters return → investigate if role player's opportunity has ended
   - Example: "Kyle Anderson scored 22 on Jan 2 (Markkanen OUT). Markkanen returns tonight → investigate Anderson's expected minutes."

3. **Sustainable vs Fill-In Roles**:
   - ✅ Expanded Role: Backup → Starter due to injury/trade (ongoing opportunity)
   - ❌ Fill-In Role: One-game spike due to rest/injury, then back to bench (don't chase)

4. **Revenge Games**: Players facing former teams (extra motivation)

5. **Back-to-Backs**: Investigate how teams perform on 2nd night of B2B - check veteran minutes and role player opportunities

6. **Vegas Totals**: Games >230 = stack opportunities, <215 = lower ceilings
6. **Minutes Trends**: Recent increases (30+ min last 3 games vs 25 season avg)`

      : `You are Gary - an INDEPENDENT THINKER who investigates, understands, and decides on your own.

You find VALUE where the market is wrong, not chase yesterday's heroes. You don't follow consensus—you make YOUR OWN recommendations.

## GARY'S SHARP DFS FRAMEWORK

**HARD FACTORS (Investigable - Trust These):**
- Target share, snap percentage, red zone opportunities
- Defense vs Position (DvP) rankings
- Game script implications (spread, total)

**SOFT FACTORS (Need Verification):**
- "Revenge game" → Need target share data to back it
- "Weather boost" → Show actual weather impact stats
- "Primetime" → Show actual primetime splits

**KEY QUESTION FOR EVERY PLAYER:**
"Is this player's SALARY priced for their role TODAY or their role from 2 weeks ago?"

---

Search for DFS narrative context for today's NFL games on ${slateDate}:
${gameDescriptions}

Identify and return as JSON:
{
  "game_narratives": [
    {
      "game": "Team @ Team",
      "vegas_total": 48.5,
      "weather": "Dome/Clear/Rain/Wind",
      "narratives": [
        "Specific narrative (injury impact, revenge game, etc)"
      ]
    }
  ],
  "target_players": [
    {
      "name": "Player Name",
      "team": "TM",
      "position": "QB/RB/WR/TE",
      "reason": "Why they're a strong DFS play today (predictive, not reactive)",
      "narrative_type": "injury_boost|revenge|usage_spike|matchup|weather_benefit|breakout_spot",
      "rotation_status": "expanded_role|breakout_candidate|ongoing_starter",
      "snap_trend": "increasing|stable",
      "role_sustainability": "ongoing|short_term|season_long"
    }
  ],
  "fade_players": [
    {
      "name": "Player Name",
      "team": "TM", 
      "reason": "Why to avoid in DFS (include if role just ended)",
      "narrative_type": "weather|tough_matchup|game_script|cold_streak|role_ended",
      "rotation_status": "bench_return|diminished_role",
      "snap_trend": "decreasing",
      "role_sustainability": "ended"
    }
  ]
}

**CRITICAL: PREDICTIVE vs REACTIVE Logic (Same as NBA)**
- ✅ Find players ABOUT TO have a big game (value BEFORE it pops)
- ❌ Don't chase players who JUST HAD a big game (chasing after the pop)
- Check if big games were due to temporary injuries/rest
- If starter returns → fade the backup who had the big game

Focus on:
1. **PREDICTIVE Injury Impacts** (< 7 days): Starter JUST went OUT = backup gets elevated role TODAY
   - ✅ "RB1 OUT tonight → RB2 will get 20+ touches" (future opportunity)
   - ❌ "RB2 scored 3 TDs last week" → Check if RB1 is BACK tonight (role ended?)
   - ❌ DO NOT mention season-long injuries - the season stats already reflect them
   - ✅ DO mention new injuries from this week (e.g., "Travis Kelce OUT - Noah Gray 5x targets expected")
2. **Rotation Context**: If backup had big game last week due to injury, check if starter is back
3. **Weather Impact**: Rain/Wind >15mph = run-heavy, fade passing
4. **Game Script**: Heavy favorites = RB volume, underdogs = pass-heavy
5. **Revenge Games**: Players facing former teams
6. **Target Share Trends**: WR/TE seeing 20%+ target increase last 3 games
7. **Matchup Exploits**: RB vs worst rush defense, WR vs worst pass defense`;

    const startTime = Date.now();
    const result = await model.generateContent(prompt);
    const duration = Date.now() - startTime;
    
    console.log(`[DFS Context] ✅ Narrative context fetched in ${duration}ms`);
    
    const text = result.response.text();
    
    // Parse JSON response with repair for truncation
    const cleanedJson = cleanJsonString(text);
    if (cleanedJson) {
      try {
        const parsed = JSON.parse(cleanedJson);
        const narrativeCount = parsed.game_narratives?.length || 0;
        const targetCount = parsed.target_players?.length || 0;
        const fadeCount = parsed.fade_players?.length || 0;
        
        console.log(`[DFS Context] 📖 Narrative context: ${narrativeCount} games, ${targetCount} targets, ${fadeCount} fades`);
        
        // Extract stars returning context
        const starsReturning = parsed.stars_returning || [];
        if (starsReturning.length > 0) {
          console.log(`[DFS Context] 🔄 STARS RETURNING DETECTED: ${starsReturning.map(s => `${s.name} (${s.team})`).join(', ')}`);
          starsReturning.forEach(star => {
            console.log(`   → ${star.name}: ${star.impact_reason || 'Teammates lose usage'}`);
          });
        }
        
        return {
          narratives: parsed.game_narratives || [],
          targetPlayers: parsed.target_players || [],
          fadePlayers: parsed.fade_players || [],
          starsReturning: starsReturning
        };
      } catch (parseErr) {
        console.warn(`[DFS Context] Narrative JSON parse failed after repair: ${parseErr.message}`);
        // Try to extract partial data from the text using natural language parsing
        return extractNarrativeFromText(text);
      }
    }
    
    return { narratives: [], targetPlayers: [], fadePlayers: [], starsReturning: [] };
    
  } catch (error) {
    console.error(`[DFS Context] Narrative context error: ${error.message}`);
    return { narratives: [], targetPlayers: [], fadePlayers: [], starsReturning: [] };
  }
}

/**
 * Extract narrative context from natural language when JSON parsing fails
 * Gary needs this context even if the JSON was truncated
 */
function extractNarrativeFromText(text) {
  const result = { narratives: [], targetPlayers: [], fadePlayers: [], starsReturning: [] };
  
  // Extract target players from text mentions
  const targetMatches = text.match(/(?:target|boost|smash|play|leverage|upside)[:\s]+([A-Z][a-z]+\s[A-Z][a-z]+)/gi);
  if (targetMatches) {
    targetMatches.forEach(match => {
      const nameMatch = match.match(/([A-Z][a-z]+\s[A-Z][a-z]+)/);
      if (nameMatch) {
        result.targetPlayers.push({
          name: nameMatch[1],
          reason: 'Extracted from narrative context',
          narrative_type: 'extracted'
        });
      }
    });
  }
  
  // Extract fade players
  const fadeMatches = text.match(/(?:fade|avoid|skip|concern|risky)[:\s]+([A-Z][a-z]+\s[A-Z][a-z]+)/gi);
  if (fadeMatches) {
    fadeMatches.forEach(match => {
      const nameMatch = match.match(/([A-Z][a-z]+\s[A-Z][a-z]+)/);
      if (nameMatch) {
        result.fadePlayers.push({
          name: nameMatch[1],
          reason: 'Extracted from narrative context',
          narrative_type: 'extracted'
        });
      }
    });
  }
  
  if (result.targetPlayers.length > 0 || result.fadePlayers.length > 0) {
    console.log(`[DFS Context] 📖 Extracted from text: ${result.targetPlayers.length} targets, ${result.fadePlayers.length} fades`);
  }
  
  return result;
}

/**
 * Get teams playing on a specific date
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} dateStr - Date YYYY-MM-DD
 * @returns {Array} Team names
 */
export async function getTeamsPlayingToday(sport, dateStr) {
  try {
    const sportKey = sport === 'NBA' ? 'basketball_nba' : 'americanfootball_nfl';
    let games = await ballDontLieService.getGames(sportKey, { dates: [dateStr] }, 5);
    
    // For NFL, filter to only games actually on this date (BDL returns whole week)
    if (sport === 'NFL' && games?.length > 0) {
      const targetMonth = dateStr.split('-')[1];
      const targetDay = dateStr.split('-')[2];
      const targetDateStr = `${targetMonth}/${targetDay}`;
      
      games = games.filter(game => {
        const status = game.status || '';
        return status.includes(targetDateStr);
      });
    }
    
    const teams = new Set();
    for (const game of games || []) {
      if (game.home_team?.abbreviation) teams.add(game.home_team.abbreviation);
      if (game.home_team?.name) teams.add(game.home_team.name);
      if (game.visitor_team?.abbreviation) teams.add(game.visitor_team.abbreviation);
      if (game.visitor_team?.name) teams.add(game.visitor_team.name);
      if (game.away_team?.abbreviation) teams.add(game.away_team.abbreviation);
      if (game.away_team?.name) teams.add(game.away_team.name);
    }
    
    return Array.from(teams);
  } catch (error) {
    console.error(`[DFS Context] Failed to get teams: ${error.message}`);
    return [];
  }
}

/**
 * Build complete DFS context for lineup generation
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} dateStr - Date YYYY-MM-DD
 * @param {Object} slate - Optional slate info { teams: [], games: [], name: '' }
 * @returns {Object} Complete player pool with salaries and stats
 */
export async function buildDFSContext(platform, sport, dateStr, slate = null) {
  const start = Date.now();
  console.log(`\n[DFS Context] Building ${platform} ${sport} context for ${dateStr} ${slate ? `(${slate.name})` : '(Main Slate)'}`);
  
  // Format date for display
  const dateObj = new Date(dateStr + 'T12:00:00');
  const slateDate = dateObj.toLocaleDateString('en-US', { 
    month: 'long', 
    day: 'numeric', 
    year: 'numeric' 
  });
  
  // Get teams - STRICT: Must have slate-specific teams, no fallback to all teams
  // If no slate is provided (Main slate case), we'll derive teams from games later
  let teams = slate?.teams || [];

  // For Main slate with no explicit teams, get all teams as initial pool
  // This will be validated later against actual filtered games
  if (teams.length === 0 && !slate) {
    teams = await getTeamsPlayingToday(sport, dateStr);
  }

  console.log(`[DFS Context] Initial teams: ${teams.join(', ') || 'Will derive from games'}`);

  // Don't fail here yet - we'll validate after game filtering
  
  // Get game info for narrative context
  const sportKey = sport === 'NBA' ? 'basketball_nba' : 'americanfootball_nfl';
  let allGames = await ballDontLieService.getGames(sportKey, { dates: [dateStr] }, 5) || [];
  
  // Filter games based on slate - STRICT MODE: No fallbacks that produce wrong data
  // CRITICAL: Each slate (Main, Turbo, Night) has specific games - MUST be accurate or fail
  let games = [];

  // Try multiple properties to get slate games (some discovery methods use different property names)
  const slateGames = slate?.games || slate?.matchups || [];
  const inputSlateTeams = slate?.teams || [];  // Renamed to avoid conflict with derivedTeams later

  if (slateGames.length > 0) {
    // Use slate's explicit game list
    console.log(`[DFS Context] Filtering to slate games: ${slateGames.join(', ')}`);
    games = allGames.filter(g => {
      const match1 = `${g.visitor_team?.abbreviation}@${g.home_team?.abbreviation}`;
      const match2 = `${g.away_team?.abbreviation}@${g.home_team?.abbreviation}`;
      // Also try lowercase and various formats
      const match1Lower = match1.toLowerCase();
      const match2Lower = match2.toLowerCase();
      return slateGames.some(sg => {
        const sgLower = sg.toLowerCase();
        return sgLower === match1Lower || sgLower === match2Lower ||
               sg === match1 || sg === match2;
      });
    });
  } else if (inputSlateTeams.length > 0) {
    // Fallback: Filter by teams if games list not available
    console.log(`[DFS Context] No games list, filtering by teams: ${inputSlateTeams.join(', ')}`);
    const slateTeamSet = new Set(inputSlateTeams.map(t => t.toUpperCase()));
    games = allGames.filter(g => {
      const homeTeam = (g.home_team?.abbreviation || '').toUpperCase();
      const visitorTeam = (g.visitor_team?.abbreviation || g.away_team?.abbreviation || '').toUpperCase();
      return slateTeamSet.has(homeTeam) || slateTeamSet.has(visitorTeam);
    });
  } else if (!slate) {
    // NO SLATE PROVIDED = Main slate / all games for the day
    // This is the default case when user doesn't specify a specific slate
    console.log(`[DFS Context] No slate specified - using ALL ${allGames.length} games for the day (Main slate)`);
    games = allGames;
  } else {
    // SPECIFIC SLATE WAS PROVIDED but has no games/teams = FAIL
    // This means slate discovery failed to populate this slate's data
    // Do NOT fall back to all games - that produces contaminated lineups
    console.error(`[DFS Context] ❌ FATAL: No slate.games or slate.teams provided for slate "${slate?.name || 'unknown'}"`);
    console.error(`[DFS Context] Slate object:`, JSON.stringify(slate, null, 2));
    return {
      platform,
      sport,
      date: dateStr,
      slate: slate?.name,
      players: [],
      gamesCount: 0,
      error: `Slate "${slate?.name}" has no games or teams defined - cannot generate accurate lineup. Fix slate discovery.`
    };
  }

  // VALIDATION: Check if game count matches slate expectation
  if (slate?.gameCount && games.length !== slate.gameCount) {
    const expectedGames = slate.gameCount;
    const foundGames = games.length;

    if (foundGames === 0) {
      // No games found at all - definitely wrong slate data
      console.error(`[DFS Context] ❌ No games found for slate "${slate.name}" (expected ${expectedGames})`);
      console.error(`[DFS Context] Slate games tried: ${slateGames.join(', ')}`);
      return {
        platform,
        sport,
        date: dateStr,
        slate: slate?.name,
        players: [],
        gamesCount: 0,
        expectedGames,
        error: `No games matched for slate "${slate.name}" - expected ${expectedGames}. Check slate discovery matchup data.`
      };
    }

    if (foundGames > expectedGames) {
      // Found MORE games than expected = likely contamination from wrong slate
      console.error(`[DFS Context] ❌ Game count contamination! Slate "${slate.name}" expects ${expectedGames} games, found ${foundGames}`);
      console.error(`[DFS Context] Slate games: ${slateGames.join(', ')}`);
      console.error(`[DFS Context] Filtered games: ${games.map(g => `${g.visitor_team?.abbreviation}@${g.home_team?.abbreviation}`).join(', ')}`);
      return {
        platform,
        sport,
        date: dateStr,
        slate: slate?.name,
        players: [],
        gamesCount: foundGames,
        expectedGames,
        error: `Too many games matched for slate "${slate.name}": found ${foundGames} but expected ${expectedGames}. This indicates slate contamination.`
      };
    }

    // Found fewer games than expected - might be postponement/cancellation, warn but continue
    console.warn(`[DFS Context] ⚠️ Game count mismatch: slate "${slate.name}" expects ${expectedGames} games, found ${foundGames}`);
    console.warn(`[DFS Context] This may be due to postponements. Continuing with ${foundGames} games...`);
  }

  console.log(`[DFS Context] ✅ Filtered to ${games.length} games for slate "${slate?.name || 'unknown'}": ${games.map(g => `${g.visitor_team?.abbreviation}@${g.home_team?.abbreviation}`).join(', ')}`);

  // CRITICAL: Derive teams FROM the filtered games - this is the authoritative source
  // Do NOT use the original 'teams' variable which may have been set incorrectly
  const derivedTeams = new Set();
  games.forEach(g => {
    if (g.home_team?.abbreviation) derivedTeams.add(g.home_team.abbreviation.toUpperCase());
    if (g.visitor_team?.abbreviation) derivedTeams.add(g.visitor_team.abbreviation.toUpperCase());
    if (g.away_team?.abbreviation) derivedTeams.add(g.away_team.abbreviation.toUpperCase());
  });
  const slateTeams = Array.from(derivedTeams);
  console.log(`[DFS Context] ✅ Teams in this slate (derived from games): ${slateTeams.join(', ')}`);

  // Override 'teams' with accurate slate teams for downstream use
  teams = slateTeams;

  const gameList = games.map(g => ({
    home_team: g.home_team?.abbreviation || g.home_team?.name,
    visitor_team: g.visitor_team?.abbreviation || g.visitor_team?.name,
    away_team: g.away_team?.abbreviation || g.away_team?.name
  }));
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PARALLEL FETCH: Tank01 API salaries + BDL stats + Narrative context + Ownership + Props
  // ═══════════════════════════════════════════════════════════════════════════
  // Tank01 API provides accurate, real-time DFS salaries (replaces Gemini Grounding)
  // BDL provides player stats, team data, and PROP LINES for projections
  // Gemini Grounding used for narrative context, ownership, lineups, and projections
  // NOTE: BDL lineups API only works AFTER game starts - useless for pregame DFS
  
  // Get game IDs for prop line fetching
  const gameIds = games.map(g => g.id).filter(Boolean);
  
  const [bdlPlayers, salaryData, narrativeContext, ownershipData, propProjections] = await Promise.all([
    fetchPlayerStatsFromBDL(sport, dateStr),
    fetchDfsSalaries(sport, dateStr, platform), // Tank01 API for real salaries
    fetchDFSNarrativeContext(sport, slateDate, gameList),
    fetchOwnershipProjections(sport, platform, slateDate, teams),
    fetchPropLinesForDFS(sport, gameIds) // NEW: Prop lines for sharp projections
  ]);
  
  const bdlCount = bdlPlayers.length;
  const salaryCount = salaryData.players?.length || 0;
  
  console.log(`[DFS Context] BDL players (all): ${bdlCount}`);
  console.log(`[DFS Context] Tank01 salary data (all): ${salaryCount} players`);

  // Filter player stats and salaries to ONLY include teams in this slate
  // This is critical - using the derived teams from filtered games
  const slateTeamSet = new Set(teams.map(t => t.toUpperCase()));
  console.log(`[DFS Context] Filtering players to teams: ${Array.from(slateTeamSet).join(', ')}`);

  const filteredBdlPlayers = bdlPlayers.filter(p => slateTeamSet.has(p.team?.toUpperCase()));
  const filteredSalaryPlayers = (salaryData.players || []).filter(p => slateTeamSet.has(p.team?.toUpperCase()));

  console.log(`[DFS Context] ✅ Filtered BDL players: ${filteredBdlPlayers.length} (from ${bdlCount})`);
  console.log(`[DFS Context] ✅ Filtered salary players: ${filteredSalaryPlayers.length} (from ${salaryCount})`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // INTEGRATE CONFIRMED STARTERS & BENCHMARKS
  // ═══════════════════════════════════════════════════════════════════════════
  const confirmedStarters = new Set();
  
  // Note: BDL lineups API only works AFTER game starts - useless for pregame DFS
  // Confirmed starters will be populated from Gemini Grounding or narrative context

  // Fetch benchmark projections using Gemini Grounding (Industry Best Practice)
  // This helps Gary double-check his AI math against "Vegas/Expert" consensus
  const benchmarkProjections = await fetchBenchmarkProjections(sport, slateDate, teams);

  console.log(`[DFS Context] Integrated: ${confirmedStarters.size} confirmed starters, ${benchmarkProjections.size} benchmarks`);
  
  // Merge data sources (Tank01 salaries + BDL stats)
  // Also get excluded players for teammate opportunity analysis
  const { merged: mergedPlayersRaw, excludedPlayers } = mergePlayerData(filteredBdlPlayers, filteredSalaryPlayers);
  let mergedPlayers = mergedPlayersRaw;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ENHANCE WITH PROP LINES - The Sharpest Projection Source
  // ═══════════════════════════════════════════════════════════════════════════
  // Prop lines represent real money being wagered - sharper than "expert" projections
  if (Object.keys(propProjections).length > 0) {
    mergedPlayers = enhancePlayersWithProps(mergedPlayers, propProjections);
    console.log(`[DFS Context] 📊 Enhanced players with prop-based projections`);
  }
  
  // Apply metadata to merged players
  for (const player of mergedPlayers) {
    const key = normalizePlayerName(player.name);
    
    // Confirmed Starter Lock (from BDL)
    if (confirmedStarters.has(key)) {
      player.isConfirmedStarter = true;
      player.lockReason = 'Confirmed Starter (Ball Don\'t Lie)';
    }

    // Benchmark Projection (from Gemini Grounding)
    if (benchmarkProjections.has(key)) {
      player.benchmarkProjection = benchmarkProjections.get(key);
    }
  }

  // ⚠️ Filter out late scratches
  const finalMergedPlayers = mergedPlayers.filter(p => p.status !== 'OUT' && p.status !== 'INACTIVE');
  console.log(`[DFS Context] Final slate player pool: ${finalMergedPlayers.length}`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // APPLY OWNERSHIP DATA TO PLAYERS
  // ═══════════════════════════════════════════════════════════════════════════
  // Create lookup maps for ownership data
  const chalkMap = new Map();
  const contrarianMap = new Map();
  const lowOwnedMap = new Map();
  
  (ownershipData.chalk || []).forEach(p => {
    const key = normalizePlayerName(p.name);
    chalkMap.set(key, { ownership: p.ownership, reason: p.reason });
  });
  
  (ownershipData.contrarian || []).forEach(p => {
    const key = normalizePlayerName(p.name);
    contrarianMap.set(key, { ownership: p.ownership, upside: p.upside, ceiling: p.ceiling });
  });
  
  (ownershipData.lowOwned || []).forEach(p => {
    const key = normalizePlayerName(p.name);
    lowOwnedMap.set(key, { ownership: p.ownership, reason: p.reason });
  });
  
  // Apply ownership to merged players
  for (const player of mergedPlayers) {
    const key = normalizePlayerName(player.name);
    
    // Check if player is chalk (>25% ownership)
    if (chalkMap.has(key)) {
      const chalkInfo = chalkMap.get(key);
      player.ownership = chalkInfo.ownership;
      player.isChalk = true;
      player.isContrarian = false;
      player.ownershipNote = chalkInfo.reason;
    }
    // Check if player is contrarian (<10% ownership)
    else if (contrarianMap.has(key)) {
      const contrarianInfo = contrarianMap.get(key);
      player.ownership = contrarianInfo.ownership;
      player.isChalk = false;
      player.isContrarian = true;
      player.ownershipNote = contrarianInfo.upside;
      player.ceilingNote = contrarianInfo.ceiling;
    }
    // Check if player is low-owned (10-25%)
    else if (lowOwnedMap.has(key)) {
      const lowOwnedInfo = lowOwnedMap.get(key);
      player.ownership = lowOwnedInfo.ownership;
      player.isChalk = false;
      player.isContrarian = false;
      player.ownershipNote = lowOwnedInfo.reason;
    }
    // Default: estimate ownership using SMART SALARY-BASED MODEL
    // This is what sharps use when no grounding data is available
    else if (!player.ownership) {
      player.ownership = estimateOwnershipFromSalary(player, platform, sport);
      player.isChalk = player.ownership >= 25;
      player.isContrarian = player.ownership < 10;
      player.ownershipNote = 'Estimated from salary tier';
      player.ownershipEstimated = true; // Flag that this is an estimate
    }
  }
  
  // Log ownership integration results
  const estimatedCount = mergedPlayers.filter(p => p.ownershipEstimated).length;
  if (estimatedCount > 0) {
    console.log(`[DFS Context] ⚠️ ${estimatedCount} players have estimated ownership (Grounding didn't find real data)`);
  }
  const chalkInLineup = mergedPlayers.filter(p => p.isChalk).length;
  const contrarianInLineup = mergedPlayers.filter(p => p.isContrarian).length;
  console.log(`[DFS Context] Ownership applied: ${chalkInLineup} chalk, ${contrarianInLineup} contrarian players in pool`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // TEAMMATE USAGE CONTEXT - Dynamic Role Awareness
  // ═══════════════════════════════════════════════════════════════════════════
  // When high-usage players are OUT, their teammates inherit opportunity.
  // Gary investigates who benefits rather than applying fixed rules.
  // 
  // This is AWARENESS not prescription - Gary knows to look for these situations:
  // - Star PG out → backup PG and wing players see usage spike
  // - Star scorer out → secondary options become primary
  // - Big man out → small ball opportunities, guard rebounds
  // ═══════════════════════════════════════════════════════════════════════════
  const outPlayers = excludedPlayers.filter(p => 
    p.status === 'OUT' || p.status === 'OUT FOR SEASON' || p.status === 'DOUBTFUL'
  );
  
  // Group out players by team to find teammate opportunities
  const outByTeam = {};
  outPlayers.forEach(p => {
    if (!outByTeam[p.team]) outByTeam[p.team] = [];
    // Look up their projection/salary to estimate impact
    const salaryPlayer = filteredSalaryPlayers.find(sp => 
      normalizePlayerName(sp.name) === normalizePlayerName(p.name)
    );
    outByTeam[p.team].push({
      name: p.name,
      status: p.status,
      salary: salaryPlayer?.salary || 0,
      isHighUsage: (salaryPlayer?.salary || 0) >= 8000 // High-salary = high-usage assumption
    });
  });
  
  // For each team with high-usage players out, flag teammates for investigation
  const teamsWithOpportunity = Object.entries(outByTeam)
    .filter(([team, players]) => players.some(p => p.isHighUsage))
    .map(([team, players]) => ({
      team,
      outStars: players.filter(p => p.isHighUsage).map(p => p.name),
      totalOut: players.length
    }));
  
  if (teamsWithOpportunity.length > 0) {
    console.log(`[DFS Context] 🎯 USAGE OPPORTUNITY DETECTED:`);
    teamsWithOpportunity.forEach(({ team, outStars, totalOut }) => {
      console.log(`   ${team}: ${outStars.join(', ')} OUT - teammates may see usage spike`);
      
      // Flag active teammates with expanded role awareness
      mergedPlayers.forEach(player => {
        if (player.team === team && !player.status?.includes('OUT')) {
          // Mark as potential expanded role - not automatic boost, just awareness
          player.teammateOpportunity = {
            outStars,
            totalTeammatesOut: totalOut,
            reason: `${outStars[0]} OUT - investigate usage redistribution`
          };
          // If player is already a target from narrative, reinforce it
          if (player.narrative_type === 'injury_boost' || player.rotation_status === 'expanded_role') {
            player.usageChange = (player.usageChange || 0) + 5; // Signal increased opportunity
            player.isBreakoutCandidate = true;
          }
        }
      });
    });
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STARS RETURNING DETECTION - THE OPPOSITE OF INJURY BOOST
  // ═══════════════════════════════════════════════════════════════════════════
  // When high-usage stars RETURN from injury, their teammates LOSE opportunity.
  // This is critical because:
  // - Maxey's usage drops when Embiid/PG return
  // - Role players who "broke out" during star absence go back to bench
  // - Salaries haven't adjusted yet = overpriced players
  // 
  // SIGNAL: Star was OUT recently (< 7 days) but is NOW PLAYING
  // This means teammates who benefited from their absence now lose usage
  // ═══════════════════════════════════════════════════════════════════════════
  const starsReturning = narrativeContext.starsReturning || [];
  
  if (starsReturning.length > 0) {
    console.log(`[DFS Context] 🔄 STARS RETURNING - USAGE REDUCTION:`);
    starsReturning.forEach(star => {
      // ═══════════════════════════════════════════════════════════════════════════
      // MINUTES RESTRICTION AWARENESS - Critical for accurate impact assessment
      // ═══════════════════════════════════════════════════════════════════════════
      // If returning star is on a minutes restriction, the impact on teammates is REDUCED
      // - Full return (30+ min): Full impact (15% reduction)
      // - Partial (20-28 min restriction): Moderate impact (8% reduction)
      // - Limited (<20 min restriction): Minimal impact (3% reduction)
      // - Unknown: Assume moderate (8% reduction) with flag to monitor
      // ═══════════════════════════════════════════════════════════════════════════
      
      const hasMinutesRestriction = star.minutes_restriction && star.minutes_restriction !== 'no restriction';
      const impactSeverity = star.impact_severity || (hasMinutesRestriction ? 'partial' : 'full');
      const gamesMissed = star.games_missed || 0;
      
      // Determine usage multiplier based on restriction
      let usageMultiplier, usageChangeAmount, restrictionNote;
      
      if (impactSeverity === 'minimal' || (hasMinutesRestriction && star.minutes_restriction?.includes('15'))) {
        // Minimal impact - star is severely limited
        usageMultiplier = 0.97; // Only 3% reduction
        usageChangeAmount = -3;
        restrictionNote = `⏱️ MINUTES LIMIT: ${star.minutes_restriction} - minimal impact on teammates`;
      } else if (impactSeverity === 'partial' || hasMinutesRestriction || gamesMissed >= 15) {
        // Partial impact - star is on some restriction or returning from extended absence
        usageMultiplier = 0.92; // 8% reduction (was 15%)
        usageChangeAmount = -5;
        restrictionNote = hasMinutesRestriction 
          ? `⏱️ MINUTES LIMIT: ${star.minutes_restriction} - partial impact on teammates`
          : gamesMissed >= 15
            ? `⏱️ EXTENDED ABSENCE (${gamesMissed} games) - expect ramping minutes, partial impact`
            : `⏱️ RETURNING - partial impact expected`;
      } else {
        // Full impact - star is back without restriction
        usageMultiplier = 0.85; // Full 15% reduction
        usageChangeAmount = -10;
        restrictionNote = `✅ FULL RETURN - teammates lose significant usage`;
      }
      
      const restrictionStatus = hasMinutesRestriction ? ` [${star.minutes_restriction}]` : '';
      console.log(`   ${star.team}: ${star.name} returning${restrictionStatus} → ${(star.impact_players || []).join(', ')} lose usage`);
      console.log(`      ${restrictionNote}`);
      
      // Find and mark affected teammates
      const impactedNames = (star.impact_players || []).map(n => n.toLowerCase());
      
      mergedPlayers.forEach(player => {
        const playerNameLower = player.name?.toLowerCase() || '';
        const isImpacted = impactedNames.some(impName => 
          playerNameLower.includes(impName) || impName.includes(playerNameLower)
        );
        
        if (isImpacted || (player.team === star.team && !playerNameLower.includes(star.name.toLowerCase()))) {
          // Mark as having reduced opportunity due to star returning
          player.starReturning = {
            star: star.name,
            impact: star.impact_reason || `${star.name} returning - usage redistribution away from role players`,
            usageMultiplier,
            minutesRestriction: star.minutes_restriction,
            impactSeverity,
            gamesMissed,
            restrictionNote
          };
          player.usageChange = (player.usageChange || 0) + usageChangeAmount;
          
          // Only downgrade expanded role players if it's a FULL return
          if (impactSeverity === 'full' && (player.isBreakoutCandidate || player.rotation_status === 'expanded_role')) {
            player.rotation_status = 'role_ending';
            player.isBreakoutCandidate = false;
            console.log(`      ⚠️ ${player.name}: Downgraded - ${star.name} FULL return ends expanded role`);
          } else if (impactSeverity === 'partial' && (player.isBreakoutCandidate || player.rotation_status === 'expanded_role')) {
            // Partial return - don't fully downgrade, just note the situation
            player.starReturningPartial = true;
            console.log(`      ℹ️ ${player.name}: Still has value - ${star.name} on minutes restriction`);
          }
        }
      });
    });
  }
  
  // Also check fade_players for "role_ended" or "bench_return" status
  const roleFades = (narrativeContext.fadePlayers || []).filter(f => 
    f.rotation_status === 'bench_return' || 
    f.rotation_status === 'diminished_role' ||
    f.role_sustainability === 'ended' ||
    f.narrative_type === 'role_ended'
  );
  
  if (roleFades.length > 0) {
    console.log(`[DFS Context] ⚠️ ROLE ENDED FADES DETECTED:`);
    roleFades.forEach(fade => {
      console.log(`   ${fade.name} (${fade.team}): ${fade.reason}`);
      
      // Find and mark this player
      const fadeNameLower = fade.name?.toLowerCase() || '';
      mergedPlayers.forEach(player => {
        const playerNameLower = player.name?.toLowerCase() || '';
        if (playerNameLower.includes(fadeNameLower) || fadeNameLower.includes(playerNameLower)) {
          player.roleEnded = {
            reason: fade.reason,
            newStatus: fade.rotation_status
          };
          player.usageChange = (player.usageChange || 0) - 15; // Strong negative signal
          player.isFade = true;
          console.log(`   ⚠️ ${player.name}: Marked as FADE - role ended`);
        }
      });
    });
  }
  
  const duration = Date.now() - start;
  console.log(`[DFS Context] Context built in ${duration}ms`);
  
  // Count how many players have estimated vs real salaries
  const estimatedSalaryCount = mergedPlayers.filter(p => p.estimatedSalary).length;
  const realSalaryCount = mergedPlayers.length - estimatedSalaryCount;
  const salaryDataQuality = realSalaryCount >= mergedPlayers.length * 0.7 ? 'good' 
    : realSalaryCount >= mergedPlayers.length * 0.4 ? 'partial' 
    : 'poor';
  
  // Log salary data quality
  if (salaryDataQuality === 'poor') {
    console.error(`[DFS Context] ⚠️ SALARY WARNING: Only ${realSalaryCount}/${mergedPlayers.length} players have real salaries`);
    console.error(`[DFS Context] ⚠️ Lineup may be inaccurate - ${estimatedSalaryCount} players have estimated salaries`);
  } else if (salaryDataQuality === 'partial') {
    console.warn(`[DFS Context] ⚠️ Partial salary data: ${realSalaryCount}/${mergedPlayers.length} real, ${estimatedSalaryCount} estimated`);
  }
  
  return {
    platform,
    sport,
    date: dateStr,
    slateDate,
    players: mergedPlayers,
    gamesCount: games.length,
    games: gameList,
    // Late-breaking info (from narrative context since Tank01 doesn't provide these)
    lateScratches: narrativeContext.lateScratches || [],
    weatherAlerts: narrativeContext.weatherAlerts || [],
    qbChanges: narrativeContext.qbChanges || [],
    // Narrative context (what separates Gary from a math bot)
    narratives: narrativeContext.narratives || [],
    targetPlayers: narrativeContext.targetPlayers || [],
    fadePlayers: narrativeContext.fadePlayers || [],
    starsReturning: narrativeContext.starsReturning || [],
    // Ownership intelligence for tournament strategy
    ownershipData: {
      chalk: ownershipData.chalk || [],
      contrarian: ownershipData.contrarian || [],
      lowOwned: ownershipData.lowOwned || [],
      sources: ownershipData.sources || []
    },
    // Metadata
    salarySource: salaryData.source || 'Tank01 API',
    buildTimeMs: duration,
    // Salary data quality info
    salaryDataInfo: {
      realCount: realSalaryCount,
      estimatedCount: estimatedSalaryCount,
      quality: salaryDataQuality,
      fetchTimeMs: salaryData.fetchTimeMs,
      warning: salaryDataQuality === 'poor' 
        ? `⚠️ Only ${realSalaryCount} players have real salaries - lineup may be inaccurate` 
        : null
    },
    // Diagnostic info (for debugging when things fail)
    bdlPlayersCount: bdlCount,
    tank01PlayersCount: salaryCount,
    error: mergedPlayers.length === 0 
      ? (salaryCount === 0 ? 'Tank01 API failed - no salary data' : 'BDL fetch failed')
      : null
  };
}

export default {
  fetchDFSSalariesWithGrounding, // Keep for backward compatibility (will fall back to this if Tank01 fails)
  fetchDFSNarrativeContext,
  fetchPlayerStatsFromBDL,
  mergePlayerData,
  getTeamsPlayingToday,
  buildDFSContext,
  // Re-export Tank01 service for direct access if needed
  fetchDfsSalaries
};

