#!/usr/bin/env node
/**
 * Agentic NFL Touchdown Scorer Runner
 * Special feature: Gary picks 5 standard TDs + 5 underdog TDs (+200 or better) + 1 First TD per game
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env.local') });
dotenv.config({ path: join(__dirname, '..', '.env') });

// Dynamic imports after env is loaded
const { oddsService } = await import('../src/services/oddsService.js');
const { propOddsService } = await import('../src/services/propOddsService.js');
const { openaiService, GEMINI_FLASH_MODEL } = await import('../src/services/openaiService.js');
const { ballDontLieService } = await import('../src/services/ballDontLieService.js');
const { fetchGroundedContext } = await import('../src/services/agentic/scoutReport/scoutReportBuilder.js');

const SPORT_KEY = 'americanfootball_nfl';

function getESTDate() {
  // DST-safe: Use Intl with America/New_York timezone
  const now = new Date();
  const options = { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' };
  const estDate = new Intl.DateTimeFormat('en-US', options).format(now);
  const [month, day, year] = estDate.split('/');
  return `${year}-${month}-${day}`;
}

// Format game time to readable EST string
function formatGameTimeEST(isoString) {
  if (!isoString) return 'TBD';
  try {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return 'TBD';
  }
}

function parseArgs() {
  return process.argv.slice(2).reduce((acc, arg) => {
    const [key, value] = arg.split('=');
    if (!key) return acc;
    acc[key.replace(/^--/, '')] = value ?? true;
    return acc;
  }, {});
}

/**
 * Ensure diverse game coverage - get best options from EACH game
 */
function getBalancedOptions(props, maxPerGame = 8, totalMax = 80) {
  // Group by matchup
  const byMatchup = {};
  for (const prop of props) {
    if (!byMatchup[prop.matchup]) byMatchup[prop.matchup] = [];
    byMatchup[prop.matchup].push(prop);
  }
  
  // Get top N from each game (sorted by odds for that game)
  const balanced = [];
  for (const matchup of Object.keys(byMatchup)) {
    const gameProps = byMatchup[matchup].sort((a, b) => a.odds - b.odds);
    balanced.push(...gameProps.slice(0, maxPerGame));
  }
  
  // Sort final list by odds and cap total
  return balanced.sort((a, b) => a.odds - b.odds).slice(0, totalMax);
}

/**
 * Validate TD prop players are actually on the correct team via BDL API
 * Modeled after NBA's resolvePlayerIds() - prevents team assignment errors
 * @param {Array} tdProps - Array of TD prop objects with player/team
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @returns {Array} - Validated props with correct team assignments
 */
async function validateTDPropPlayers(tdProps, homeTeam, awayTeam) {
  if (!tdProps || tdProps.length === 0) return [];
  
  // Normalize team names for matching
  const normalizeTeamName = (name) => (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const homeNorm = normalizeTeamName(homeTeam);
  const awayNorm = normalizeTeamName(awayTeam);
  
  // Get unique player names
  const uniquePlayers = [...new Set(tdProps.map(p => p.player))];
  
  // Build player-to-team map via BDL search
  const playerTeamMap = {};
  const batchSize = 5;
  
  for (let i = 0; i < uniquePlayers.length; i += batchSize) {
    const batch = uniquePlayers.slice(i, i + batchSize);
    
    const searchPromises = batch.map(async (playerName) => {
      try {
        // Extract last name for search (more reliable)
        const nameParts = playerName.trim().split(' ');
        const lastName = nameParts[nameParts.length - 1];
        
        // Search BDL by last name
        const searchResults = await ballDontLieService.getPlayersGeneric(SPORT_KEY, {
          search: lastName,
          per_page: 15
        }).catch(() => []);
        
        if (!searchResults || searchResults.length === 0) {
          return { name: playerName, found: false };
        }
        
        // Find match by full name
        const playerNorm = playerName.toLowerCase().trim();
        const match = searchResults.find(p => {
          const fullName = `${p.first_name} ${p.last_name}`.toLowerCase();
          return fullName === playerNorm || fullName.includes(playerNorm) || playerNorm.includes(fullName);
        });
        
        if (!match) {
          return { name: playerName, found: false };
        }
        
        // Get player's actual team
        const playerTeamName = match.team?.full_name || match.team?.name || '';
        const playerTeamNorm = normalizeTeamName(playerTeamName);
        
        // Check if player is on home or away team
        const isOnHome = playerTeamNorm.includes(homeNorm) || homeNorm.includes(playerTeamNorm);
        const isOnAway = playerTeamNorm.includes(awayNorm) || awayNorm.includes(playerTeamNorm);
        
        if (isOnHome) {
          return { name: playerName, found: true, team: homeTeam, teamFull: playerTeamName };
        } else if (isOnAway) {
          return { name: playerName, found: true, team: awayTeam, teamFull: playerTeamName };
        } else {
          return { name: playerName, found: false, wrongTeam: playerTeamName };
        }
      } catch (e) {
        return { name: playerName, found: false, error: e.message };
      }
    });
    
    const results = await Promise.all(searchPromises);
    for (const result of results) {
      if (result.found) {
        playerTeamMap[result.name.toLowerCase()] = result.team;
      }
    }
  }
  
  // Update props with validated team assignments
  const validatedProps = tdProps.map(prop => {
    const validatedTeam = playerTeamMap[prop.player.toLowerCase()];
    if (validatedTeam) {
      return { ...prop, team: validatedTeam, validated: true };
    }
    return { ...prop, validated: false };
  });
  
  const validCount = validatedProps.filter(p => p.validated).length;
  console.log(`   [Validation] Verified ${validCount}/${tdProps.length} player-team assignments via BDL`);
  
  return validatedProps;
}

/**
 * Fetch player TD rates from BDL season stats
 * Returns TD rate per game for each player to help Gary make better TD picks
 * @param {Array} players - Array of player objects with {player, team} 
 * @param {number} season - Season year (2025)
 * @returns {Object} Map of player name -> TD rate data
 */
async function fetchPlayerTDRates(players, season) {
  if (!players || players.length === 0) return {};
  
  const tdRates = {};
  const uniquePlayers = [...new Set(players.map(p => p.player))];
  
  console.log(`   Fetching TD rates for ${uniquePlayers.length} players...`);
  
  // Search and fetch stats in batches of 5
  const batchSize = 5;
  let foundCount = 0;
  
  for (let i = 0; i < uniquePlayers.length; i += batchSize) {
    const batch = uniquePlayers.slice(i, i + batchSize);
    
    const statPromises = batch.map(async (playerName) => {
      try {
        // Search for player in BDL
        const nameParts = playerName.trim().split(' ');
        const lastName = nameParts[nameParts.length - 1];
        
        const searchResults = await ballDontLieService.getPlayersGeneric(SPORT_KEY, {
          search: lastName,
          per_page: 10
        }).catch(() => []);
        
        if (!searchResults || searchResults.length === 0) {
          return { name: playerName, found: false };
        }
        
        // Find match
        const playerNorm = playerName.toLowerCase().trim();
        const match = searchResults.find(p => {
          const fullName = `${p.first_name} ${p.last_name}`.toLowerCase();
          return fullName === playerNorm || fullName.includes(playerNorm) || playerNorm.includes(fullName);
        });
        
        if (!match) {
          return { name: playerName, found: false };
        }
        
        // Fetch season stats for this player
        const seasonStats = await ballDontLieService.getNflPlayerSeasonStats({
          playerId: match.id,
          season: season,
          postseason: false
        }).catch(() => []);
        
        if (!seasonStats || seasonStats.length === 0) {
          return { name: playerName, found: false };
        }
        
        const stats = seasonStats[0];
        const gamesPlayed = stats.games_played || 1;
        
        // Calculate TDs by type
        const rushTDs = stats.rushing_touchdowns || 0;
        const recTDs = stats.receiving_touchdowns || 0;
        const passTDs = stats.passing_touchdowns || 0;
        const totalTDs = rushTDs + recTDs;
        
        // Calculate TD rate per game
        const tdPerGame = totalTDs / gamesPlayed;
        
        // Calculate hit rate for anytime TD (any game with 1+ TD)
        // This is an approximation since we don't have game-by-game TD data
        const impliedHitRate = totalTDs > 0 ? Math.min(95, (totalTDs / gamesPlayed) * 70) : 5;
        
        return {
          name: playerName,
          found: true,
          playerId: match.id,
          position: match.position_abbreviation || match.position,
          gamesPlayed,
          rushTDs,
          recTDs,
          passTDs,
          totalTDs,
          tdPerGame: tdPerGame.toFixed(2),
          // Calculate implied anytime TD probability
          impliedHitRate: impliedHitRate.toFixed(0),
          // Scoring opportunity proxy
          rushAttempts: stats.rushing_attempts || 0,
          targets: stats.receiving_targets || 0,
          receptions: stats.receptions || 0
        };
      } catch (e) {
        return { name: playerName, found: false, error: e.message };
      }
    });
    
    const results = await Promise.all(statPromises);
    
    for (const result of results) {
      if (result.found) {
        tdRates[result.name.toLowerCase()] = result;
        foundCount++;
      }
    }
  }
  
  console.log(`   ✓ Found TD rate data for ${foundCount}/${uniquePlayers.length} players`);
  return tdRates;
}

/**
 * Format TD rates into context for Gary
 */
function formatTDRatesContext(tdRates, players) {
  if (!tdRates || Object.keys(tdRates).length === 0) return '';
  
  let context = '\n## 📊 PLAYER TD RATES (2025 Season - BDL Verified)\n';
  context += 'Use these TD rates to assess value vs odds:\n\n';
  
  // Group by high/medium/low TD rate
  const highTD = []; // 0.6+ TD/game
  const mediumTD = []; // 0.3-0.6 TD/game
  const lowTD = []; // <0.3 TD/game
  
  for (const [name, data] of Object.entries(tdRates)) {
    const rate = parseFloat(data.tdPerGame);
    if (rate >= 0.6) highTD.push({ name, ...data });
    else if (rate >= 0.3) mediumTD.push({ name, ...data });
    else if (data.totalTDs > 0) lowTD.push({ name, ...data });
  }
  
  if (highTD.length > 0) {
    context += '**High TD volume (0.6+ TD/game):**\n';
    highTD.sort((a, b) => parseFloat(b.tdPerGame) - parseFloat(a.tdPerGame)).forEach(p => {
      context += `- ${p.name}: ${p.totalTDs} TDs in ${p.gamesPlayed}g (${p.tdPerGame}/g), rush ${p.rushTDs}, rec ${p.recTDs}\n`;
    });
    context += '\n';
  }
  
  if (mediumTD.length > 0) {
    context += '**Moderate TD volume (0.3-0.6 TD/game):**\n';
    mediumTD.sort((a, b) => parseFloat(b.tdPerGame) - parseFloat(a.tdPerGame)).forEach(p => {
      context += `- ${p.name}: ${p.totalTDs} TDs in ${p.gamesPlayed}g (${p.tdPerGame}/g), rush ${p.rushTDs}, rec ${p.recTDs}\n`;
    });
    context += '\n';
  }
  
  if (lowTD.length > 0) {
    context += '**Low TD volume (<0.3 TD/game - value plays only):**\n';
    lowTD.sort((a, b) => parseFloat(b.tdPerGame) - parseFloat(a.tdPerGame)).slice(0, 10).forEach(p => {
      context += `- ${p.name}: ${p.totalTDs} TDs in ${p.gamesPlayed}g (${p.tdPerGame}/g)\n`;
    });
    context += '\n';
  }
  
  return context;
}

/**
 * Extract structured injuries from Gemini Grounding context
 * Parses OUT, IR, Questionable players into a structured format
 * @param {string} groundedContext - Raw grounded context from Gemini
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @returns {Array} - Structured injury list [{player, team, status, description}]
 */
function extractStructuredInjuries(groundedContext, homeTeam, awayTeam) {
  if (!groundedContext) return [];
  
  const injuries = [];
  const lines = groundedContext.split('\n');
  
  let currentTeam = null;
  
  for (const line of lines) {
    const lineLower = line.toLowerCase();
    
    // Detect team context
    if (lineLower.includes(homeTeam.toLowerCase())) {
      currentTeam = homeTeam;
    } else if (lineLower.includes(awayTeam.toLowerCase())) {
      currentTeam = awayTeam;
    }
    
    // Look for injury patterns: "Player Name (Position) – STATUS – injury"
    // Common patterns: OUT, IR, Questionable, Doubtful
    const injuryPatterns = [
      /\*\*([^*]+)\s*\(([^)]+)\)\*\*\s*[–-]\s*(OUT|IR|Questionable|Doubtful|INJURED RESERVE)/i,
      /([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+(?:Jr\.|Sr\.|III|II|IV))?)\s*\(([^)]+)\)\s*[–-]\s*(OUT|IR|Questionable|Doubtful)/i,
      /\*\s*\*\*([^*]+)\*\*\s*[–-]\s*(OUT|IR|Questionable|Doubtful)/i
    ];
    
    for (const pattern of injuryPatterns) {
      const match = line.match(pattern);
      if (match) {
        const playerName = match[1].trim().replace(/\*+/g, '');
        const status = (match[3] || match[2]).toUpperCase();
        
        // Skip invalid names
        if (playerName.length < 3 || playerName.includes('MISSED') || playerName.includes('Week')) {
          continue;
        }
        
        // Extract description if present
        const descMatch = line.match(/[–-]\s*(OUT|IR|Questionable|Doubtful)[^–-]*[–-]\s*([^–-]+)/i);
        const description = descMatch ? descMatch[2].trim() : '';
        
        injuries.push({
          player: playerName,
          team: currentTeam || 'Unknown',
          status: status,
          description: description.substring(0, 100)
        });
        break;
      }
    }
  }
  
  // Deduplicate by player name
  const seen = new Set();
  const uniqueInjuries = injuries.filter(inj => {
    const key = inj.player.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  
  return uniqueInjuries;
}

/**
 * Run Gary's TD Scorer Analysis
 * @param {Array} allTDProps - All anytime TD props (validated)
 * @param {Array} firstTDProps - All first TD props (validated)
 * @param {string} playerStats - Formatted player stats text
 * @param {Array} gameMatchups - Array of matchup strings
 * @param {string} narrativeContext - Raw narrative context
 * @param {Array} gamesData - Structured game data with injuries [{matchup, homeTeam, awayTeam, injuries, homePlayers, awayPlayers}]
 */
async function runTDScorerAnalysis(allTDProps, firstTDProps, playerStats, gameMatchups, narrativeContext = '', gamesData = []) {
  // Split into standard odds and underdog odds (+200 or better)
  const standardTDs = allTDProps.filter(p => p.odds < 200);
  const underdogTDs = allTDProps.filter(p => p.odds >= 200);

  // Get balanced options from ALL games (not just sorted by odds globally)
  const balancedStandard = getBalancedOptions(standardTDs, 6, 60);
  const balancedUnderdog = getBalancedOptions(underdogTDs, 8, 80);
  const balancedFirstTD = getBalancedOptions(firstTDProps, 6, 60);

  console.log(`\n📊 TD Props Breakdown:`);
  console.log(`   Standard odds (<+200): ${standardTDs.length} total → ${balancedStandard.length} balanced`);
  console.log(`   Underdog odds (+200+): ${underdogTDs.length} total → ${balancedUnderdog.length} balanced`);
  console.log(`   First TD options: ${firstTDProps.length} total → ${balancedFirstTD.length} balanced`);
  console.log(`   Games covered: ${new Set([...balancedStandard, ...balancedUnderdog, ...balancedFirstTD].map(p => p.matchup)).size}`);

  // Build CRITICAL GAME CONTEXT section with verified team rosters, injuries, and game script data
  const buildCriticalContext = () => {
    if (!gamesData || gamesData.length === 0) return '';
    
    let context = '\n## CRITICAL GAME CONTEXT (USE THIS DATA - DO NOT HALLUCINATE TEAM ASSIGNMENTS)\n';
    context += 'The following player-team assignments have been VERIFIED via official NFL data.\n';
    context += 'ONLY use these team assignments. Do NOT assign players to teams not listed.\n\n';
    
    for (const game of gamesData) {
      context += `### ${game.awayTeam} @ ${game.homeTeam}\n`;
      
      // GAME SCRIPT DATA - Critical for TD distribution modeling
      if (game.spread != null || game.total != null) {
        context += `**GAME SCRIPT DATA (Use for TD distribution):**\n`;
        if (game.spread != null) {
          const favoriteTeam = game.spread < 0 ? game.homeTeam : game.awayTeam;
          const spreadAbs = Math.abs(game.spread);
          context += `- Spread: ${game.homeTeam} ${game.spread > 0 ? '+' : ''}${game.spread} (${favoriteTeam} favored by ${spreadAbs})\n`;
          context += `- Game Type: ${game.spreadContext.replace(/_/g, ' ')}\n`;
        }
        if (game.total != null) {
          context += `- Total (O/U): ${game.total} → ${game.totalContext.replace(/_/g, ' ')} expected scoring\n`;
        }
        // Game script impact guidance
        if (game.spreadContext === 'HOME_BIG_FAVORITE' || game.spreadContext === 'AWAY_BIG_FAVORITE') {
          const favorite = game.spreadContext === 'HOME_BIG_FAVORITE' ? game.homeTeam : game.awayTeam;
          const underdog = game.spreadContext === 'HOME_BIG_FAVORITE' ? game.awayTeam : game.homeTeam;
          context += `- ⚠️ GAME SCRIPT: ${favorite} RB1 likely high volume late. ${underdog} may trail = more passing TDs.\n`;
        }
        if (game.totalContext === 'HIGH_SCORING') {
          context += `- High total: Multiple TDs expected - WRs/TEs have increased equity.\n`;
        } else if (game.totalContext === 'LOW_SCORING') {
          context += `- Low total: Grind game expected - RBs have increased TD equity.\n`;
        }
      }
      
      // List verified players per team
      if (game.awayPlayers && game.awayPlayers.length > 0) {
        context += `**${game.awayTeam} TD CANDIDATES:** ${game.awayPlayers.join(', ')}\n`;
      }
      if (game.homePlayers && game.homePlayers.length > 0) {
        context += `**${game.homeTeam} TD CANDIDATES:** ${game.homePlayers.join(', ')}\n`;
      }
      
      // List key injuries (especially QBs and stars)
      if (game.injuries && game.injuries.length > 0) {
        context += `**KEY INJURIES (affects TD opportunities):**\n`;
        for (const inj of game.injuries.slice(0, 8)) {
          context += `- ${inj.player} (${inj.team}): ${inj.status}${inj.description ? ` - ${inj.description}` : ''}\n`;
        }
      }
      context += '\n';
    }
    
    return context;
  };

  const criticalContext = buildCriticalContext();

  const isSingleGame = gameMatchups.length === 1;
  const standardCount = isSingleGame ? 1 : 5;
  const underdogCount = isSingleGame ? 1 : 5;

  const systemPrompt = `
You are Gary, the expert NFL analyst. You're picking Touchdown Scorers for today's games.

🚨🚨🚨 ZERO TOLERANCE FOR HALLUCINATION - READ THIS FIRST 🚨🚨🚨

YOU ARE ABSOLUTELY FORBIDDEN FROM INVENTING ANY STATISTICS OR FACTS.

The ONLY information you can use is:
1. Player-team assignments from CRITICAL GAME CONTEXT below (verified via BDL API)
2. Injury reports explicitly listed in the context
3. Stats explicitly provided in the player_context or live_context data
4. Information found via Google Search grounding during this analysis

❌ YOU CANNOT:
- Invent touchdown counts (e.g., "9 TDs in 15 games" unless you verified it)
- Make up red zone statistics unless explicitly provided
- Claim any player stat you did not see in the provided data
- Assign players to wrong teams (CHECK the verified team assignments!)

✅ YOU MUST:
- Use ONLY verified player-team assignments from the context
- Cite only stats you actually see in the data
- Say "strong TD scoring role" instead of inventing specific TD counts
- Focus on matchup context and game script if stats are unavailable

THE VERIFICATION TEST: Before writing ANY stat, ask:
"Did I see this EXACT number in the data provided?"
- If YES → Use it
- If NO → Do NOT use it, describe qualitatively instead

${criticalContext}
## CRITICAL RULE: SPREAD YOUR PICKS ACROSS MULTIPLE GAMES
${isSingleGame ? 'This is a single game slate. Focus your analysis on this specific matchup.' : 'You MUST pick from at least 4 DIFFERENT games for each category. Do NOT concentrate all picks in 1-2 games.'}
Today's available games: ${gameMatchups.join(', ')}

## IMPORTANT: USE VERIFIED DATA ONLY
- ONLY use the player-team assignments shown in CRITICAL GAME CONTEXT above
- Do NOT mention injured players (OUT/IR) as active or capable of affecting the game
- Check the injury list before including any player in your analysis

## YOUR TASK
You must make THREE types of TD scorer picks:

### CATEGORY 1: STANDARD TD SCORERS (${standardCount} pick${standardCount > 1 ? 's' : ''})
Pick your ${standardCount} BEST touchdown scorer bet${standardCount > 1 ? 's' : ''} regardless of odds. These are your highest-confidence plays backed by:
- Red zone usage and targets
- Goal line carries
- Recent TD scoring trends
- Matchup advantages
- Game script projections

RULE: ${isSingleGame ? 'Pick exactly 1 standard TD scorer.' : 'Pick from at least 4 different games.'} For standard picks, use line 0.5 (Over 0.5 TDs = scores at least 1 TD).

### CATEGORY 2: UNDERDOG TD SCORERS (${underdogCount} pick${underdogCount > 1 ? 's' : ''})  
Pick ${underdogCount} touchdown scorer bet${underdogCount > 1 ? 's' : ''} with odds of +200 or better (higher payout). These are your VALUE plays:
- Players who could vulture a TD or score multiple
- Boom/bust candidates in high-scoring games
- Players in favorable TD-scoring situations that oddsmakers are undervaluing
- You CAN pick Over 1.5 TDs (2+ touchdowns) for players you think will have big games

RULE: ${isSingleGame ? 'Pick exactly 1 value TD scorer.' : 'Pick from at least 4 different games.'}

### CATEGORY 3: FIRST TD SCORER (1 pick PER GAME)
Pick exactly ONE player from EACH game who is most likely to score the FIRST touchdown of that game. These are HIGH VARIANCE plays (typically +300 to +2000 odds):
- Players who get early red zone usage
- Teams with strong opening drive scripts
- Goal line backs and red zone targets
- Consider each team's first-drive tendencies
- Weight toward RB1s (28% of first TDs) and WR1s (22% of first TDs)

CRITICAL RULE: You MUST pick exactly 1 First TD scorer from EACH game on the slate. If there are 4 games, pick 4 First TD scorers (one per game).

## ANALYSIS FRAMEWORK FOR TD PROPS

### 1. HISTORICAL TD RATES BY POSITION (Use this to weight First TD picks)
First TD scorers historically by position (NFL averages):
- RB1 (lead back): ~28% of all First TDs - HIGHEST equity
- WR1 (team's top receiver): ~22% of First TDs
- TE1 (primary tight end): ~12% of First TDs
- WR2/Slot: ~10% of First TDs
- QB (rushing): ~8% of First TDs
- RB2/Goal-line specialist: ~8% of First TDs
- All other players: ~12% combined

USE THIS: Weight your First TD picks toward RB1s and WR1s who are their team's primary scoring threats.

### 2. GAME SCRIPT MODELING (Critical for TD distribution)
Analyze the spread and total to predict game flow:

**CLOSE GAMES (Spread ±3):**
- More balanced TD distribution
- Both teams stay committed to game plan
- RBs maintain volume throughout
- Good for both sides' TD scorers

**FAVORITES BY 7+ POINTS:**
- Favorite's RB1 likely to get late-game clock-killing carries = MORE TD EQUITY
- Underdog may trail = MORE passing TDs to WRs/TEs
- Underdog RB1 may see REDUCED volume if trailing

**HIGH TOTALS (O/U 48+):**
- Expect shootout = PASSING TDs more likely
- WRs and TEs have increased TD equity
- Multiple TD scorers per game expected

**LOW TOTALS (O/U 40 or less):**
- Grind-it-out game = RUSHING TDs more likely
- RBs have increased TD equity
- Fewer total TDs to go around - pick carefully

### 3. WEATHER IMPACT (For outdoor games - check live_context)
**COLD WEATHER (Below 35°F):**
- Passing games suffer (-10-15% efficiency)
- RBs gain TD equity
- TEs gain short-yardage TD equity (reliable hands in cold)
- WR deep threats LOSE equity

**WIND (15+ mph):**
- Deep passing drastically affected
- Short/intermediate routes still viable
- RBs and short-area TEs benefit
- Kicking game affected = more 4th down attempts in red zone

**RAIN/SNOW:**
- Run game favored heavily
- RBs gain significant TD equity
- Turnovers increase = defensive TDs possible
- WR TD equity drops significantly

### 4. SNAP COUNT & USAGE TRENDS (From player_context data)
Look for INCREASING usage patterns:
- Player's snap % trending UP = more opportunities
- New role (injury to teammate) = usage spike expected
- Veteran's snap count declining = vulture back opportunity

Red flags:
- "Pitch count" or "limited snaps" = reduced TD ceiling
- Coming off injury = may not have full role yet
- Backup QB = entire offense's ceiling affected

## ANALYSIS APPROACH
- Consider red zone opportunity rates
- Look at defensive TD rates allowed by position
- Factor in game script (blowout vs close game)
- Consider goal-line personnel tendencies
- For First TD: opening drive efficiency, scripted plays, early usage patterns
- APPLY THE WEATHER IMPACT analysis if game is outdoors
- USE THE GAME SCRIPT MODEL based on spread and total
- SPREAD PICKS ACROSS THE FULL SLATE - find value in multiple games

## RESPONSE FORMAT (STRICT JSON)
{
  "standard_td_picks": [
    {
      "player": "Player Name",
      "team": "Team Abbreviation",
      "line": 0.5,
      "odds": -120,
      "matchup": "vs OPP",
      "rationale": "Red zone usage: X TDs in last Y games | Goal-line role: describe\n\n[Main thesis in 3-5 sentences explaining why this player will score, including specific stats, matchup advantages, and game script factors.]\n\nKey factors:\n• Factor 1 with specific stat\n• Factor 2 with matchup context\n• Factor 3 with usage/role info\n\nRisk: Brief note on what could go wrong.\n\nConfidence: X% | TD equity: high/medium"
    }
  ],
  "underdog_td_picks": [
    {
      "player": "Player Name", 
      "team": "Team Abbreviation",
      "line": 0.5,
      "odds": 250,
      "matchup": "vs OPP",
      "rationale": "Odds value: +XXX for a player who [role description]\n\n[Main thesis in 3-5 sentences explaining the value opportunity - why these odds are too long, what role gives them TD equity, and what game script would unlock them.]\n\nKey factors:\n• Factor 1 (e.g., goal-line vulture role)\n• Factor 2 (e.g., matchup soft spot)\n• Factor 3 (e.g., game script projection)\n\nRisk: Brief note on low-volume or situational concern.\n\nConfidence: X% | Value rating: strong/moderate"
    }
  ],
  "first_td_picks": [
    {
      "player": "Player Name",
      "team": "Team Abbreviation",
      "odds": 500,
      "matchup": "vs OPP",
      "rationale": "Opening drive equity: [team's scripted play tendency]\n\n[Main thesis in 3-5 sentences explaining why this player could score FIRST - consider opening possession efficiency, scripted red zone plays, early usage patterns, and whether their team typically receives the opening kick.]\n\nKey factors:\n• Factor 1 (e.g., team's opening drive TD rate)\n• Factor 2 (e.g., player's early-game usage)\n• Factor 3 (e.g., opponent's slow-start defense)\n\nRisk: High variance play - first TD is inherently unpredictable.\n\nConfidence: X% | First TD equity: present/longshot"
    }
  ],
  "game_notes": "Brief overall thoughts on TD-scoring environment today"
}

IMPORTANT:
- Standard picks: Pick exactly ${standardCount} from any odds, line is always 0.5
- Underdog picks: Pick exactly ${underdogCount} with odds +200 or better. Line can be 0.5 (1+ TD) or 1.5 (2+ TDs)
- First TD picks: Pick exactly 1 player PER GAME (so if 1 game, pick 1 First TD scorer)
- RATIONALES MUST BE DETAILED: Include stats line, 3-5 sentence thesis, bullet point factors, risk note, and confidence
- Be specific about WHY each player will score - use real stats and matchup analysis
`;

  // Build structured game context for user content
  const structuredGames = gamesData.map(game => ({
    matchup: game.matchup,
    away_team: game.awayTeam,
    home_team: game.homeTeam,
    verified_players: {
      away: game.awayPlayers,
      home: game.homePlayers
    },
    key_injuries: game.injuries.map(inj => ({
      player: inj.player,
      team: inj.team,
      status: inj.status,
      description: inj.description || ''
    }))
  }));

  const userContent = JSON.stringify({
    date: getESTDate(),
    games_today: gameMatchups,
    // NEW: Structured per-game context with verified players and injuries
    games_context: structuredGames,
    standard_td_options: balancedStandard.map(p => ({
      player: p.player,
      team: p.team, // Now validated via BDL
      odds: p.odds,
      matchup: p.matchup,
      validated: p.validated || false
    })),
    underdog_td_options: balancedUnderdog.map(p => ({
      player: p.player,
      team: p.team, // Now validated via BDL
      odds: p.odds,
      matchup: p.matchup,
      validated: p.validated || false
    })),
    first_td_options: balancedFirstTD.map(p => ({
      player: p.player,
      team: p.team, // Now validated via BDL
      odds: p.odds,
      matchup: p.matchup,
      validated: p.validated || false
    })),
    player_context: playerStats.substring(0, 5000),  // Player stats from BDL
    live_context: narrativeContext.substring(0, 3000)  // Live narrative from Gemini Grounding
  });

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent }
  ];

  console.log(`\n🤖 Gary analyzing TD scorers (using Flash)...`);
  
  const raw = await openaiService.generateResponse(messages, {
    model: GEMINI_FLASH_MODEL, // Use Flash for TD props (high volume)
    temperature: 0.5,
    maxTokens: 12000  // High limit to handle detailed rationales for 13 picks
  });

  // Parse response - sanitize control characters that Gemini sometimes includes
  let parsed;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      // Sanitize control characters (except newlines/tabs which are valid in strings)
      let cleanJson = jsonMatch[0]
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control chars except \t \n \r
        .replace(/\n\s*\n/g, '\n') // Collapse multiple newlines
        .replace(/\\n/g, ' ') // Replace literal \n in strings with space
        .replace(/\r/g, ''); // Remove carriage returns
      parsed = JSON.parse(cleanJson);
    }
  } catch (e) {
    console.error('Failed to parse Gary response:', e.message);
    // Try one more time with aggressive sanitization
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        // More aggressive: replace ALL problematic characters in string values
        let cleanJson = jsonMatch[0]
          .replace(/[\x00-\x1F\x7F]/g, ' ') // Replace all control chars with space
          .replace(/\s+/g, ' '); // Collapse whitespace
        parsed = JSON.parse(cleanJson);
        console.log('✓ Parsed JSON after aggressive sanitization');
      }
    } catch (e2) {
      console.error('Failed to parse even after sanitization:', e2.message);
      return null;
    }
  }

  return parsed;
}

async function main() {
  const args = parseArgs();
  const shouldStore = args.store === '1' || args.store === 'true';
  const nocache = args.nocache === '1';
  const matchupFilter = args.matchup || null; // Filter for specific matchup (e.g., "49ers")

  console.log(`\n🏈 NFL Touchdown Scorer Picks`);
  console.log(`${'='.repeat(50)}`);
  console.log(`📅 Date: ${getESTDate()}`);
  console.log(`💾 Store: ${shouldStore ? 'Yes' : 'No (pass --store=1 to save)'}`);
  if (matchupFilter) console.log(`🎯 Matchup Filter: ${matchupFilter}`);
  console.log(`${'='.repeat(50)}\n`);

  // Fetch NFL games
  const games = await oddsService.getUpcomingGames(SPORT_KEY, { nocache });
  
  // Get current EST date boundaries (start of today and start of tomorrow in EST)
  const todayEST = getESTDate();
  const todayStart = new Date(`${todayEST}T00:00:00-05:00`).getTime();
  const tomorrowStart = new Date(`${todayEST}T00:00:00-05:00`).getTime() + (24 * 60 * 60 * 1000);
  
  // Filter games that start on the current EST day
  let filteredGames = games.filter(g => {
    const tip = new Date(g.commence_time).getTime();
    return !Number.isNaN(tip) && tip >= todayStart && tip < tomorrowStart;
  });
  
  // Apply matchup filter if specified (e.g., --matchup="49ers")
  if (matchupFilter) {
    const lowerFilter = matchupFilter.toLowerCase();
    filteredGames = filteredGames.filter(g => 
      g.home_team.toLowerCase().includes(lowerFilter) ||
      g.away_team.toLowerCase().includes(lowerFilter)
    );
    console.log(`🎯 Filtered to ${filteredGames.length} game(s) matching "${matchupFilter}"`);
  }
  
  // No hardcoded limit - process all games for the day

  console.log(`Found ${filteredGames.length} NFL games.\n`);

  if (filteredGames.length === 0) {
    console.log('⚠️ No upcoming NFL games found.');
    return;
  }

  // Collect all TD props across games with per-game validation
  const allTDProps = [];
  const firstTDProps = [];
  const gamesData = []; // NEW: Structured game data with validated players and injuries
  let playerStats = '';
  let narrativeContext = '';

  // Import player stats formatter
  let formatNFLPlayerStats;
  try {
    const playerPropsModule = await import('../src/services/nflPlayerPropsService.js');
    formatNFLPlayerStats = playerPropsModule.formatNFLPlayerStats;
  } catch (e) {
    console.warn('Could not import formatNFLPlayerStats:', e.message);
  }

  console.log(`\n📡 Fetching TD props and validating player-team assignments...\n`);

  for (const game of filteredGames) {
    const matchup = `${game.away_team} @ ${game.home_team}`;
    console.log(`🏈 ${matchup}`);
    console.log(`   Fetching props...`);

    try {
      const props = await propOddsService.getPlayerPropOdds(SPORT_KEY, game.home_team, game.away_team);
      
      // Filter for anytime TD props ONLY (single TD to score)
      // IMPORTANT: Do NOT include player_tds_over (2+ TDs) - that's a different market!
      const rawTdProps = props.filter(p => {
        const propType = (p.prop_type || '').toLowerCase();
        // Only anytime TD (single TD) - exclude tds_over which is 2+ TDs
        return propType === 'anytime_td' || 
               propType === 'player_anytime_td';
      });

      // Filter for First TD props
      const rawFirstProps = props.filter(p => {
        const propType = (p.prop_type || '').toLowerCase();
        return propType === 'first_td' || 
               propType === 'player_1st_td' ||
               propType === '1st_td';
      });

      console.log(`   Found ${rawTdProps.length} anytime TD, ${rawFirstProps.length} first TD props`);

      // NEW: Validate player-team assignments via BDL API
      const allGameProps = [...rawTdProps, ...rawFirstProps].map(p => ({
        player: p.player,
        team: p.team,
        odds: p.over_odds || p.odds
      }));
      
      const validatedProps = await validateTDPropPlayers(allGameProps, game.home_team, game.away_team);
      
      // Build player-team map from validated props
      const playerTeamMap = {};
      for (const vp of validatedProps.filter(p => p.validated)) {
        playerTeamMap[vp.player.toLowerCase()] = vp.team;
      }

      // Apply validated teams to TD props
      rawTdProps.forEach(p => {
        const validatedTeam = playerTeamMap[p.player.toLowerCase()];
        allTDProps.push({
          player: p.player,
          team: validatedTeam || p.team, // Use validated team if available
          odds: p.over_odds || p.odds,
          matchup: matchup,
          game_time: game.commence_time,
          validated: !!validatedTeam
        });
      });

      rawFirstProps.forEach(p => {
        const validatedTeam = playerTeamMap[p.player.toLowerCase()];
        firstTDProps.push({
          player: p.player,
          team: validatedTeam || p.team, // Use validated team if available
          odds: p.over_odds || p.odds,
          matchup: matchup,
          game_time: game.commence_time,
          validated: !!validatedTeam
        });
      });

      // Fetch narrative context via Gemini Grounding
      const dateStr = new Date(game.commence_time).toLocaleDateString('en-US', { 
        month: 'long', day: 'numeric', year: 'numeric' 
      });
      console.log(`   Fetching narrative context...`);
      const grounded = await fetchGroundedContext(game.home_team, game.away_team, 'NFL', dateStr, { useFlash: true }).catch(() => null);
      
      // NEW: Extract structured injuries from grounded context
      const gameInjuries = grounded?.groundedRaw 
        ? extractStructuredInjuries(grounded.groundedRaw, game.home_team, game.away_team)
        : [];
      
      if (gameInjuries.length > 0) {
        console.log(`   📋 Extracted ${gameInjuries.length} injuries: ${gameInjuries.map(i => `${i.player} (${i.status})`).join(', ')}`);
      }
      
      if (grounded?.groundedRaw) {
        narrativeContext += `\n=== ${matchup} - Live Context ===\n${grounded.groundedRaw.substring(0, 1500)}\n`;
        console.log(`   ✅ Got narrative context`);
      }

      // Fetch player stats
      if (formatNFLPlayerStats) {
        try {
          const stats = await formatNFLPlayerStats(game.home_team, game.away_team);
          playerStats += `\n=== ${matchup} ===\n${stats}\n`;
        } catch (e) {
          // Continue if stats fail
        }
      }

      // NEW: Build structured game data for prompt context
      const homePlayers = validatedProps
        .filter(p => p.validated && p.team === game.home_team)
        .map(p => p.player);
      const awayPlayers = validatedProps
        .filter(p => p.validated && p.team === game.away_team)
        .map(p => p.player);

      // Extract spread and total for game script modeling
      const spread = game.spread_home != null ? game.spread_home : null;
      const total = game.total != null ? game.total : null;
      
      gamesData.push({
        matchup: matchup,
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        homePlayers: [...new Set(homePlayers)], // Deduplicate
        awayPlayers: [...new Set(awayPlayers)], // Deduplicate
        injuries: gameInjuries,
        gameTime: game.commence_time,
        // Game script modeling data
        spread: spread,  // Home team spread (negative = favorite)
        total: total,    // Over/Under total
        spreadContext: spread != null 
          ? Math.abs(spread) <= 3 
            ? 'CLOSE_GAME' 
            : spread < -6.5 
              ? 'HOME_BIG_FAVORITE' 
              : spread > 6.5 
                ? 'AWAY_BIG_FAVORITE' 
                : spread < 0 
                  ? 'HOME_SLIGHT_FAVORITE' 
                  : 'AWAY_SLIGHT_FAVORITE'
          : 'UNKNOWN',
        totalContext: total != null
          ? total >= 48 
            ? 'HIGH_SCORING' 
            : total <= 40 
              ? 'LOW_SCORING' 
              : 'MODERATE'
          : 'UNKNOWN'
      });

      console.log(`   ✅ Validated ${homePlayers.length} ${game.home_team} players, ${awayPlayers.length} ${game.away_team} players\n`);
    } catch (e) {
      console.warn(`   ⚠️ Could not fetch props: ${e.message}\n`);
    }
  }

  console.log(`\n📊 Total TD props collected: ${allTDProps.length} anytime, ${firstTDProps.length} first TD`);
  const validatedCount = allTDProps.filter(p => p.validated).length;
  console.log(`   ✓ ${validatedCount}/${allTDProps.length} props have verified player-team assignments`);

  if (allTDProps.length === 0) {
    console.log('⚠️ No TD props available. Exiting.');
    return;
  }

  // NEW: Fetch TD rates for all unique players
  console.log(`\nFetching TD rates from BDL for value analysis...`);
  const currentSeason = new Date().getMonth() <= 7 ? new Date().getFullYear() - 1 : new Date().getFullYear();
  const allUniquePlayers = [...new Set([...allTDProps, ...firstTDProps].map(p => ({ player: p.player, team: p.team })))];
  const tdRates = await fetchPlayerTDRates(allUniquePlayers, currentSeason);
  
  // Add TD rate context to player stats
  const tdRatesContext = formatTDRatesContext(tdRates, allUniquePlayers);
  if (tdRatesContext) {
    playerStats = tdRatesContext + '\n' + playerStats;
  }

  // Collect all game matchups for prompt
  const gameMatchups = filteredGames.map(g => `${g.away_team} @ ${g.home_team}`);
  console.log(`\n🏈 Games to analyze: ${gameMatchups.length}`);
  gameMatchups.forEach((m, i) => console.log(`   ${i + 1}. ${m}`));

  // Log injury summary
  const totalInjuries = gamesData.reduce((sum, g) => sum + g.injuries.length, 0);
  if (totalInjuries > 0) {
    console.log(`\n🏥 Key Injuries Detected (${totalInjuries} total):`);
    for (const game of gamesData) {
      if (game.injuries.length > 0) {
        console.log(`   ${game.matchup}:`);
        game.injuries.slice(0, 5).forEach(inj => {
          console.log(`      - ${inj.player} (${inj.team}): ${inj.status}`);
        });
      }
    }
  }

  // Run Gary's analysis with structured game data including validated players and injuries
  const result = await runTDScorerAnalysis(allTDProps, firstTDProps, playerStats, gameMatchups, narrativeContext, gamesData);

  if (!result) {
    console.error('❌ Failed to get TD picks from Gary');
    return;
  }

  // Display results
  console.log(`\n${'='.repeat(50)}`);
  console.log(`🏈 GARY'S TD SCORER PICKS`);
  console.log(`${'='.repeat(50)}`);

  console.log(`\n📋 STANDARD TD SCORERS (Gary's Best 5):`);
  (result.standard_td_picks || []).forEach((pick, i) => {
    console.log(`   ${i + 1}. ${pick.player} (${pick.team}) @ ${pick.odds > 0 ? '+' : ''}${pick.odds}`);
    console.log(`      ${pick.matchup}`);
    console.log(`      💡 ${pick.rationale}\n`);
  });

  console.log(`\n🎰 UNDERDOG TD SCORERS (5 Value Plays @ +200+):`);
  (result.underdog_td_picks || []).forEach((pick, i) => {
    console.log(`   ${i + 1}. ${pick.player} (${pick.team}) @ +${pick.odds}`);
    console.log(`      ${pick.matchup}`);
    console.log(`      💡 ${pick.rationale}\n`);
  });

  console.log(`\n🥇 FIRST TD SCORERS (1 Per Game):`);
  (result.first_td_picks || []).forEach((pick, i) => {
    console.log(`   ${i + 1}. ${pick.player} (${pick.team}) @ +${pick.odds}`);
    console.log(`      ${pick.matchup}`);
    console.log(`      💡 ${pick.rationale}\n`);
  });

  if (result.game_notes) {
    console.log(`\n📝 Gary's Notes: ${result.game_notes}`);
  }

  // Store if requested
  if (shouldStore) {
    console.log(`\n💾 Storing TD picks in Supabase...`);
    
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ Missing Supabase credentials');
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const dateParam = getESTDate();

    // Create lookup maps for game times - by player and by matchup
    const playerGameTimeMap = {};
    const matchupGameTimeMap = {};
    allTDProps.forEach(p => {
      playerGameTimeMap[p.player] = p.game_time;
      if (p.matchup) {
        matchupGameTimeMap[p.matchup] = p.game_time;
      }
    });

    // Helper to find game time - try player first, then matchup
    const findGameTime = (pick) => {
      // Try exact player match
      if (playerGameTimeMap[pick.player]) {
        return playerGameTimeMap[pick.player];
      }
      // Try matchup match
      if (pick.matchup && matchupGameTimeMap[pick.matchup]) {
        return matchupGameTimeMap[pick.matchup];
      }
      // Try partial matchup match (in case format differs)
      for (const [matchup, gameTime] of Object.entries(matchupGameTimeMap)) {
        if (pick.matchup && (matchup.includes(pick.matchup) || pick.matchup.includes(matchup))) {
          return gameTime;
        }
      }
      return null;
    };

    // Format picks for storage with time
    const standardPicks = (result.standard_td_picks || []).map(pick => {
      const line = pick.line || 0.5;
      const gameTime = findGameTime(pick);
      const tdLabel = line === 0.5 ? 'Anytime TD' : `${line + 0.5}+ TDs`;
      return {
        sport: 'NFL',
        player: pick.player,
        team: pick.team,
        prop: tdLabel,
        line: line,
        bet: 'over',
        odds: pick.odds,
        confidence: 0.70, // Standard confidence for display
        rationale: pick.rationale,
        matchup: pick.matchup,
        td_category: 'standard',
        time: formatGameTimeEST(gameTime),
        commence_time: gameTime // ISO format for sorting
      };
    });

    const underdogPicks = (result.underdog_td_picks || []).map(pick => {
      const line = pick.line || 0.5;
      const gameTime = findGameTime(pick);
      const tdLabel = line === 0.5 ? 'Anytime TD' : `${line + 0.5}+ TDs`;
      return {
        sport: 'NFL',
        player: pick.player,
        team: pick.team,
        prop: tdLabel,
        line: line,
        bet: 'over',
        odds: pick.odds,
        confidence: 0.50, // Lower confidence for underdogs (they're longshots!)
        rationale: pick.rationale,
        matchup: pick.matchup,
        td_category: 'underdog',
        time: formatGameTimeEST(gameTime),
        commence_time: gameTime // ISO format for sorting
      };
    });

    const firstTDPicks = (result.first_td_picks || []).map(pick => {
      const gameTime = findGameTime(pick);
      return {
        sport: 'NFL',
        player: pick.player,
        team: pick.team,
        prop: 'First TD',
        line: 0.5,
        bet: 'over',
        odds: pick.odds,
        confidence: 0.35, // Low confidence for first TD (high variance)
        rationale: pick.rationale,
        matchup: pick.matchup,
        td_category: 'first_td',
        time: formatGameTimeEST(gameTime),
        commence_time: gameTime // ISO format for sorting
      };
    });

    const allTDPicks = [...standardPicks, ...underdogPicks, ...firstTDPicks];

    // Fetch existing picks and merge
    const { data: existingData } = await supabase
      .from('prop_picks')
      .select('picks')
      .eq('date', dateParam)
      .single();

    let existingPicks = [];
    if (existingData?.picks) {
      // Keep non-NFL picks and non-TD NFL picks
      existingPicks = existingData.picks.filter(p => 
        p.sport !== 'NFL' || (p.sport === 'NFL' && p.td_category === undefined)
      );
    }

    const mergedPicks = [...existingPicks, ...allTDPicks];

    // Delete and re-insert
    await supabase.from('prop_picks').delete().eq('date', dateParam);
    
    const { error: insertError } = await supabase
      .from('prop_picks')
      .insert({
        date: dateParam,
        picks: mergedPicks,
        created_at: new Date().toISOString()
      });

    if (insertError) {
      console.error(`❌ Insert error: ${insertError.message}`);
    } else {
      console.log(`✅ Stored ${allTDPicks.length} NFL TD picks (${standardPicks.length} standard + ${underdogPicks.length} underdog + ${firstTDPicks.length} first TD)`);
    }
  }

  console.log(`\n🏁 NFL TD Scorer Picks Complete.\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('NFL TD runner crashed:', error);
    process.exit(1);
  });

