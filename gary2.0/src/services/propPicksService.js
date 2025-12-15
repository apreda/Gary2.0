import axios from 'axios';
import { propOddsService } from './propOddsService.js';
import { oddsService } from './oddsService.js';
import { mlbStatsApiService } from './mlbStatsApiService.enhanced.js';
import { openaiService } from './openaiService.js';
// Using MLB Stats API exclusively for prop picks to avoid legacy data sources
import { nbaSeason, formatSeason, getCurrentEST, formatInEST, getESTDate } from '../utils/dateUtils.js';
import { debugUtils } from '../utils/debugUtils.js';

// Import Supabase named export
import { supabase } from '../supabaseClient.js';
import { propUtils } from './propUtils.js';
import { generatePropBets } from './propGenerator.js';
// NBA player props service for fetching NBA player stats
import { formatNBAPlayerStats } from './nbaPlayerPropsService.js';
// NFL player props service for fetching NFL player stats
import { formatNFLPlayerStats } from './nflPlayerPropsService.js';

/**
 * Service for generating prop picks based on MLB Stats API data
 */
export const propPicksService = {
  /**
   * Helper function to format game time in a readable format
   */
  formatGameTime: function(timeString) {
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
   * Format MLB player stats from MLB Stats API
   */
  formatMLBPlayerStats: propUtils.formatMLBPlayerStats,

  /**
   * Create prompt for the OpenAI API to generate prop picks
   * @param {string} props - Formatted prop lines
   * @param {string} playerStats - Formatted player statistics
   * @param {string} sport - Sport key (basketball_nba, baseball_mlb, americanfootball_nfl)
   */
  createPropPicksPrompt: (props, playerStats, sport = 'baseball_mlb') => {
    // Sport-specific guidance
    let sportGuidance = '';
    let propTypes = '';
    
    if (sport === 'basketball_nba') {
      sportGuidance = `
## NBA-Specific Analysis Guidelines:
- **Points**: Compare player's PPG average to the line. Consider pace of play, defensive matchups, and back-to-back situations.
- **Rebounds**: Focus on centers and power forwards. Consider opponent's rebounding rate and pace.
- **Assists**: Point guards and primary ball handlers. Consider team's offensive system and opponent's turnover forcing ability.
- **3-Pointers Made**: Check 3PA (attempts) and 3P%. Volume shooters on high-paced teams are key.
- **Blocks**: Big men against teams with high paint scoring attempts.
- **Steals**: Guards against turnover-prone teams.
- **Minutes context**: Players averaging 30+ MPG have more stable props.
- **Recent form**: Last 5-10 games matter more than season averages.`;
      propTypes = 'points, rebounds, assists, threes (3-pointers made), blocks, steals';
    } else if (sport === 'americanfootball_nfl') {
      sportGuidance = `
## NFL-Specific Analysis Guidelines:
- **Passing Yards**: Compare player's yards/game to the line. Consider opponent pass defense and game script.
- **Passing TDs**: Red zone opportunities and QB's TD rate. Check opponent red zone defense.
- **Rush Yards**: Focus on RB's yards/game, attempts, and opponent run defense ranking.
- **Receiving Yards**: Target share, yards/game, and cornerback matchups.
- **Receptions**: Check targets and catch rate. Slot receivers often safer in PPR.
- **Anytime TD**: Red zone usage, goal-line work, and scoring history.
- **Recent form**: Last 3-5 games matter - look for trends in the stats provided.`;
      propTypes = 'passing yards, passing TDs, rush yards, receiving yards, receptions, anytime TD';
    } else {
      sportGuidance = `
## MLB-Specific Analysis Guidelines:
- **Hits**: Consider batting average, at-bat opportunities, and pitcher matchup.
- **Home Runs**: Power metrics, park factors, and pitcher home run rate.
- **Total Bases**: Power + extra base hit potential.
- **Strikeouts (Pitcher)**: K rate, opponent strikeout rate, and pitch count expectations.
- **RBIs/Runs**: Lineup position and run-scoring environment.`;
      propTypes = 'hits, home runs, total bases, strikeouts, RBIs, runs';
    }

    return `You are Gary, an expert sports analyst specialized in player prop betting.

Your job is to analyze player props for today's games and identify value bets based on the provided player statistics and prop odds.

🚨 CRITICAL RULE: USE ONLY THE STATS PROVIDED 🚨
- You can ONLY cite statistics that appear in the "Player Statistics" section below
- If a stat is not provided, DO NOT make one up or estimate it
- NEVER invent a player's average, recent game stats, or matchup data
- If you don't have enough data on a player, skip that player entirely
- Every number in your rationale MUST come from the data provided

❌ BAD: "LeBron is averaging 27.3 PPG" (if that exact number isn't in the data)
❌ BAD: "Derrick Henry has 150 yards" (if that exact number isn't in the data)
✅ GOOD: Only cite stats you can see in the Player Statistics section

${sportGuidance}

## Available Props:
${props}

## Player Statistics:
${playerStats}

## Analysis Requirements:
For each prop, analyze USING ONLY THE DATA PROVIDED:
1. Player's season average vs. the prop line (ONLY if average is in the data)
2. Recent performance trends (ONLY if recent game data is provided)
3. Matchup advantages/disadvantages (ONLY if matchup data is provided)
4. Betting odds value (implied probability vs. your estimated probability)

If you don't have a specific stat, DO NOT mention it. Focus on what you DO have.

## Output Requirements:
Give me your TOP 5 picks only, focusing on value bets with favorable odds (prefer +100 or better when possible).

For prop types, focus on: ${propTypes}

IMPORTANT: The confidence score should represent your ESTIMATED WIN PROBABILITY for the bet (0.0 to 1.0).
- 0.85 = you estimate 85% chance this bet wins
- This is used to calculate Expected Value (EV)
- Only recommend picks where your estimated probability exceeds the implied probability from the odds
- Be realistic - most bets should be in the 0.55-0.75 range unless you have strong evidence

Example: If odds are -110 (implied probability ~52.4%), you should only recommend if your estimated probability is higher (e.g., 0.60 = 60%).

Respond with ONLY a JSON array of your best prop picks in this format:
[
  {
    "player": "Player Name",
    "team": "Team Name",
    "prop": "prop_type line" (e.g., "points 24.5"),
    "line": 24.5,
    "bet": "over" or "under",
    "odds": -110,
    "confidence": 0.65,
    "rationale": "Brief explanation citing ONLY stats from the data provided"
  }
]
`;
  },

  /**
   * Parse the OpenAI response for prop picks
   */
  parseOpenAIResponse: (response) => {
    try {
      // First, try direct JSON parsing
      let parsed = null;
      let cleanedResponse = String(response || '');
      
      // Strip markdown code blocks if present
      if (cleanedResponse.includes('```')) {
        cleanedResponse = cleanedResponse
          .replace(/```json\s*/gi, '')
          .replace(/```\s*/g, '')
          .trim();
      }
      
      try {
        parsed = JSON.parse(cleanedResponse);
        if (Array.isArray(parsed)) {
          console.log(`Successfully parsed JSON response with ${parsed.length} picks`);
        } else if (typeof parsed === 'object' && parsed !== null) {
          // Handle wrapped responses like {"picks": [...]} or {"bets": [...]}
          const possibleKeys = ['picks', 'bets', 'recommendations', 'props', 'data'];
          for (const key of possibleKeys) {
            if (Array.isArray(parsed[key])) {
              console.log(`Found ${parsed[key].length} picks in response.${key}`);
              parsed = parsed[key];
              break;
            }
          }
          // If still not an array after checking known keys, look for any array property
          if (!Array.isArray(parsed)) {
            const arrayKey = Object.keys(parsed).find(k => Array.isArray(parsed[k]));
            if (arrayKey) {
              console.log(`Found ${parsed[arrayKey].length} picks in response.${arrayKey}`);
              parsed = parsed[arrayKey];
            }
          }
        }
      } catch (jsonError) {
        // Not direct JSON, try to extract JSON array using a more robust approach
        console.log('Response is not direct JSON, trying to extract JSON blocks');
        
        // Try to find JSON array by looking for [ ... ] that contains objects
        const startIdx = cleanedResponse.indexOf('[');
        const endIdx = cleanedResponse.lastIndexOf(']');
        
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          const jsonStr = cleanedResponse.slice(startIdx, endIdx + 1);
          try {
            parsed = JSON.parse(jsonStr);
            console.log(`Successfully extracted JSON with ${parsed.length} picks`);
          } catch (innerError) {
            console.warn('Failed to parse extracted JSON:', innerError.message);
          }
        }
      }
      
      // If we successfully parsed JSON, return it with all fields intact
      if (Array.isArray(parsed)) {
        return parsed.map(item => {
          // Check if we have structured data with all fields
          if (item.player && item.prop && item.bet && item.odds !== undefined) {
            // New format with separate fields
            return {
              player: item.player || 'Unknown Player',
              team: item.team || 'MLB',
              prop: item.prop || 'unknown',
              line: item.line || '',
              bet: (item.bet || 'over').toLowerCase(),
              odds: item.odds || 100,
              confidence: item.confidence || 0.7,
              ev: item.ev || null,
              rationale: item.rationale || item.reasoning || 'Analysis based on recent performance and matchup data.',
              pick: `${item.player} ${(item.bet || 'OVER').toUpperCase()} ${item.prop} ${item.odds}`
            };
          } else if (item.pick) {
            // Old format where everything is in the "pick" field - need to parse it
            // Example: "Ketel Marte OVER hits 0.5 (plus170)" or "Ketel Marte OVER hits 0.5 +170"
            
            // Remove parentheses if present
            const cleanPick = item.pick.replace(/[()]/g, '');
            
            // Try to parse the pick string
            // Pattern: Player Name OVER/UNDER prop_type line odds
            const pickMatch = cleanPick.match(/^(.+?)\s+(OVER|UNDER)\s+(.+?)\s+([\d.]+)\s*(?:plus)?([+-]?\d+)$/i);
            
            if (pickMatch) {
              const [_, playerName, betType, propType, line, odds] = pickMatch;
              
              // Clean up odds - remove "plus" prefix if present
              let cleanOdds = odds.replace(/^plus/i, '');
              if (cleanOdds && !cleanOdds.startsWith('+') && !cleanOdds.startsWith('-')) {
                cleanOdds = '+' + cleanOdds;
              }
              
              return {
                player: playerName.trim(),
                team: 'MLB', // Default, will be enhanced later
                prop: `${propType.trim()} ${line}`,
                line: parseFloat(line),
                bet: betType.toLowerCase(),
                odds: parseInt(cleanOdds) || 100,
                confidence: item.confidence || 0.7,
                ev: null, // Will be calculated later
                rationale: item.reasoning || item.rationale || 'Analysis based on recent performance and matchup data.',
                pick: item.pick
              };
            } else {
              // If we can't parse it, log the issue and return minimal data
              console.warn('Could not parse pick string:', item.pick);
              return {
                player: 'Unknown Player',
                team: 'MLB',
                prop: 'unknown',
                line: '',
                bet: 'over',
                odds: 100,
                confidence: item.confidence || 0.7,
                ev: null,
                rationale: item.reasoning || item.rationale || 'Analysis not available',
                pick: item.pick || 'Invalid pick format'
              };
            }
          }
          
          // Fallback for any other format
          return null;
        }).filter(item => item && item.player !== 'Unknown Player'); // Filter out invalid entries
      }

      // If all else fails, return empty array
      console.error('Could not parse response in any format');
      return [];
    } catch (error) {
      console.error('Error parsing OpenAI response:', error);
      return [];
    }
  },

  /**
   * Generate daily prop picks
   */
  generateDailyPropPicks: async (date) => {
    try {
      // Format date for consistency
      const dateObj = date ? new Date(date) : new Date();
      const dateString = dateObj.toISOString().split('T')[0]; // YYYY-MM-DD

      // Check for existing prop picks in database
      const { data, error } = await supabase
        .from('prop_picks')
        .select('*')
        .eq('date', dateString);

      if (error) {
        console.error('Error fetching existing prop picks:', error);
        throw error;
      }

      // Process existing entries to include high confidence picks
      const processedEntries = data.map(entry => {
        if (entry.picks && Array.isArray(entry.picks) && entry.picks.length > 0) {
          // Filter for confident picks (0.55 or higher) and exclude -200 or worse odds
          const confidencePicks = entry.picks.filter(pick => {
            if (pick.confidence < 0.55) return false;
            const odds = pick.odds || 0;
            if (typeof odds === 'number' && odds <= -200) return false;
            return true;
          });

          return {
            ...entry,
            picks: confidencePicks,
            originalPickCount: entry.picks.length
          };
        }
        return entry;
      });

      console.log(`Found ${data.length} entries for ${dateString}, filtered to 55%+ confidence, excluding ≤-200 odds`);
      return processedEntries;
    } catch (error) {
      console.error(`Error fetching for ${dateString}:`, error);
      throw error;
    }
  },

  /**
   * Generate prop bets
   */
  generatePropBets: async (gameData) => {
    try {
      console.log('Generating prop picks for game:', gameData.homeTeam, 'vs', gameData.awayTeam);

      // 1. Get available props from the propOddsService
      let playerProps = [];
      try {
        playerProps = await propOddsService.getPlayerPropOdds(gameData.sport, gameData.homeTeam, gameData.awayTeam);
        console.log(`Found ${playerProps.length} prop options for ${gameData.homeTeam} vs ${gameData.awayTeam}`);
      } catch (propsError) {
        console.error('Error fetching player props:', propsError.message);
        return []; // Return empty array if we can't get props
      }

      if (playerProps.length === 0) {
        console.log('No player props available for this game');
        return [];
      }

      // 1.5. Get the correct game time from The Odds API (more accurate than BDL)
      let actualGameTime = gameData.time || gameData.commence_time;
      try {
        const upcomingGames = await oddsService.getUpcomingGames(gameData.sport);
        const normalizeTeam = (name) => (name || '').toLowerCase().replace(/[^a-z]/g, '');
        const homeNorm = normalizeTeam(gameData.homeTeam);
        const awayNorm = normalizeTeam(gameData.awayTeam);
        
        const matchedGame = upcomingGames.find(g => {
          const gHome = normalizeTeam(g.home_team);
          const gAway = normalizeTeam(g.away_team);
          return (gHome.includes(homeNorm) || homeNorm.includes(gHome)) &&
                 (gAway.includes(awayNorm) || awayNorm.includes(gAway));
        });
        
        if (matchedGame?.commence_time) {
          actualGameTime = matchedGame.commence_time;
          console.log(`[Props] Found accurate game time: ${new Date(actualGameTime).toLocaleString('en-US', { timeZone: 'America/New_York' })} EST`);
        }
      } catch (timeError) {
        console.warn('[Props] Could not fetch accurate game time, using provided time');
      }

      // CRITICAL: Limit the number of props to prevent rate limiting
      // Filter to most common prop types and limit total number
      // Choose priority prop types per sport
      const sportKey = gameData.sport;
      let priorityPropTypes = [];
      if (sportKey === 'baseball_mlb') {
        priorityPropTypes = ['hits', 'strikeouts', 'home_runs', 'rbi', 'runs_scored', 'stolen_bases', 'total_bases'];
      } else if (sportKey === 'basketball_nba') {
        priorityPropTypes = ['points', 'rebounds', 'assists', 'threes', 'blocks', 'steals'];
      } else if (sportKey === 'americanfootball_nfl') {
        priorityPropTypes = ['pass_yds', 'pass_tds', 'interceptions', 'rush_yds', 'rush_att', 'receptions', 'rec_yds', 'anytime_td'];
      } else if (sportKey === 'icehockey_nhl') {
        priorityPropTypes = ['points', 'goals', 'assists', 'shots_on_goal'];
      } else {
        // Fallback to include everything moderately common
        priorityPropTypes = ['points', 'rebounds', 'assists', 'threes', 'hits', 'strikeouts', 'total_bases', 'receptions', 'rec_yds', 'rush_yds'];
      }
      let filteredProps = playerProps.filter(p => {
        // Filter out props with odds worse than -150
        const overOdds = p.over_odds || 0;
        const underOdds = p.under_odds || 0;
        
        // Check if either over or under odds are acceptable (better than -150)
        const hasAcceptableOdds = (overOdds > -150) || (underOdds > -150);
        
        if (!hasAcceptableOdds) {
          return false; // Skip props where both sides are worse than -150
        }
        
        // Check if prop type contains any of our priority types
        const propTypeLower = (p.prop_type || '').toLowerCase();
        return priorityPropTypes.some(type => propTypeLower.includes(type));
      });

      // If we still have too many, limit to 150 props max
      if (filteredProps.length > 150) {
        console.log(`Limiting props from ${filteredProps.length} to 150 to avoid rate limits`);
        // Sort by line value to get a good mix of over/under opportunities
        filteredProps = filteredProps.sort((a, b) => (a.line || 0) - (b.line || 0)).slice(0, 150);
      }

      // If no filtered props, take first 100 of any type (still filtering by odds)
      if (filteredProps.length === 0 && playerProps.length > 0) {
        filteredProps = playerProps
          .filter(p => {
            const overOdds = p.over_odds || 0;
            const underOdds = p.under_odds || 0;
            return (overOdds > -150) || (underOdds > -150);
          })
          .slice(0, 100);
      }

      console.log(`Using ${filteredProps.length} filtered props for analysis`);

      // Create a map of player to team from the prop data
      const playerTeamMap = {};
      filteredProps.forEach(prop => {
        if (prop.player && prop.team) {
          playerTeamMap[prop.player] = prop.team;
        }
      });

      // 2. Format props and stats
      const formattedProps = filteredProps.map(p => {
        // Format each prop with both over and under options if available
        const props = [];
        if (p.over_odds) {
          props.push(`${p.player} (${p.team}) OVER ${p.prop_type} ${p.line} (${p.over_odds})`);
        }
        if (p.under_odds) {
          props.push(`${p.player} (${p.team}) UNDER ${p.prop_type} ${p.line} (${p.under_odds})`);
        }
        return props;
      }).flat().join('\n');
      
      // Get player stats but with comprehensive error handling
      let playerStatsText = '';
      try {
        console.log('Fetching player stats for analysis (sport-aware)...');
        if (sportKey === 'baseball_mlb') {
          playerStatsText = await propPicksService.formatMLBPlayerStats(gameData.homeTeam, gameData.awayTeam);
        } else if (sportKey === 'basketball_nba') {
          // Fetch NBA player stats from Ball Don't Lie API
          console.log('[Props] Fetching NBA player stats from Ball Don\'t Lie...');
          playerStatsText = await formatNBAPlayerStats(gameData.homeTeam, gameData.awayTeam);
        } else if (sportKey === 'americanfootball_nfl') {
          // Fetch NFL player stats from Ball Don't Lie API
          console.log('[Props] Fetching NFL player stats from Ball Don\'t Lie...');
          playerStatsText = await formatNFLPlayerStats(gameData.homeTeam, gameData.awayTeam);
        } else {
          // Fallback for other sports
          playerStatsText = `${gameData.awayTeam} at ${gameData.homeTeam} matchup context with current sportsbook prop lines.`;
        }
        
        // Ensure we have a string; guard against undefined/null returns
        if (typeof playerStatsText !== 'string') {
          playerStatsText = '';
        }

        // Limit stats text to prevent token overflow
        if (playerStatsText && playerStatsText.length > 5000) {
          playerStatsText = playerStatsText.substring(0, 5000) + '\n... (stats truncated for brevity)';
        }
        
        console.log(`Player stats retrieved successfully (${playerStatsText?.length || 0} characters)`);
      } catch (statsError) {
        console.warn('Error getting player stats, using fallback text:', statsError?.message || statsError);
        playerStatsText = `Basic game analysis for ${gameData.homeTeam} vs ${gameData.awayTeam}. Player statistics temporarily unavailable.`;
      }

      // Ensure we have some content for analysis
      if (!playerStatsText || playerStatsText.trim().length === 0) {
        playerStatsText = `Analyzing ${gameData.homeTeam} vs ${gameData.awayTeam} matchup. Using available prop data for analysis.`;
      }

      // 3. Create the prompt for OpenAI (sport-aware)
      const prompt = propPicksService.createPropPicksPrompt(formattedProps, playerStatsText, sportKey);

      // 4. Call the OpenAI API with retry logic for rate limits
      console.log('Calling OpenAI to generate prop picks...');
      let response;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries) {
        try {
          response = await openaiService.generatePropPicks(prompt);
          break; // Success, exit loop
        } catch (error) {
          if (error.message && error.message.includes('429') && retryCount < maxRetries - 1) {
            // Rate limit error - wait and retry
            const waitTime = Math.min(20000, (retryCount + 1) * 10000); // 10s, 20s, 20s
            console.log(`Rate limit hit, waiting ${waitTime/1000}s before retry ${retryCount + 1}/${maxRetries}`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            retryCount++;
          } else {
            // Other error or final retry failed
            console.error('OpenAI API error:', error.message);
            throw error;
          }
        }
      }

      if (!response) {
        console.error('Failed to get response from OpenAI after retries');
        return [];
      }

      // 5. Parse the response to extract the picks
      let picks = [];
      try {
        picks = propPicksService.parseOpenAIResponse(response);
        console.log(`Parsed ${picks.length} prop picks from OpenAI response`);
      } catch (parseError) {
        console.error('Error parsing OpenAI response:', parseError.message);
        return [];
      }

      // 6. Validate and filter the picks
      // Filter out picks with invalid format
      const valid = picks.filter(p => {
        const hasRequiredFields = p.player && p.confidence && (p.rationale || p.reasoning);
        if (!hasRequiredFields) {
          console.log(`Filtering out prop pick with missing fields: ${JSON.stringify(p)}`);
        }
        return hasRequiredFields;
      });

      // Filter by odds quality (prefer +EV bets)
      const validOdds = valid.filter(p => {
        // Use the odds field directly if it exists, otherwise parse from pick string
        const odds = p.odds || 100;
        const oddsOK = odds > -150;
        if (!oddsOK) {
          console.log(`Filtering out prop pick with poor odds: ${p.player} ${p.prop} (${odds} is worse than -150)`);
        }
        return oddsOK;
      });

      // Filter by confidence threshold - 0.55 minimum for all picks
      const highConf = validOdds.filter(p => p.confidence >= 0.55);

      // Sort by confidence (highest first) and take only the top 5 per game
      const sortedByConfidence = [...highConf].sort((a, b) => b.confidence - a.confidence);
      const topFivePicks = sortedByConfidence.slice(0, 5);

      // Enhance picks with team info, EV calculation, and time
      const enhancedPicks = topFivePicks.map(pick => {
        // The pick already has all the fields we need from OpenAI
        // Just ensure we have all the required fields
        const leagueLabel = sportKey === 'basketball_nba' ? 'NBA'
          : sportKey === 'americanfootball_nfl' ? 'NFL'
          : 'MLB';
        
        // Calculate EV properly using confidence as estimated win probability
        // EV% = (TrueProbability × DecimalOdds) - 1
        const odds = pick.odds || 100;
        const confidence = pick.confidence || 0.7;
        
        // Convert American odds to decimal odds
        let decimalOdds;
        if (odds < 0) {
          decimalOdds = 1 + (100 / Math.abs(odds));
        } else {
          decimalOdds = 1 + (odds / 100);
        }
        
        // Calculate EV as percentage
        const calculatedEV = ((confidence * decimalOdds) - 1) * 100;
        
        return {
          // Core fields from OpenAI
          player: pick.player || 'Unknown Player',
          team: pick.team || playerTeamMap[pick.player] || leagueLabel,
          prop: pick.prop || 'unknown',
          line: pick.line || '',
          bet: pick.bet || 'over',
          odds: odds,
          confidence: confidence,
          ev: Math.round(calculatedEV * 10) / 10, // Round to 1 decimal place
          rationale: pick.rationale || pick.reasoning || 'Analysis not available',
          
          // Additional fields
          sport: leagueLabel,
          time: propPicksService.formatGameTime(actualGameTime),
          commence_time: actualGameTime || null, // ISO format for sorting/grouping
          
          // Keep the original pick string for backwards compatibility
          pick: pick.pick || `${pick.player} ${(pick.bet || 'OVER').toUpperCase()} ${pick.prop} ${pick.odds}`
        };
      });

      console.log(
        `Generated prop picks summary: Original: ${playerProps.length}, Valid: ${valid.length}, HighConf: ${highConf.length}, Final: ${enhancedPicks.length}`
      );

      return enhancedPicks;
    } catch (error) {
      console.error('Error generating prop picks:', error);
      // Return empty array instead of throwing to prevent breaking the UI
      return [];
    }
  },
  
  /**
   * Get today's prop picks from the database
   * This function is used by the GaryProps component
   */
  getTodayPropPicks: async () => {
    try {
      // Get today's date in EST
      const today = getESTDate();
      console.log(`Fetching prop picks for today (EST): ${today}`);
      
      // Query the prop_picks table for today's date
      const { data, error } = await supabase
        .from('prop_picks')
        .select('*')
        .eq('date', today);
      
      if (error) {
        console.error('Error fetching today\'s prop picks:', error);
        throw error;
      }
      
      console.log(`Found ${data?.length || 0} prop pick records for today`);
      
      // Filter the picks by confidence threshold (0.55 minimum) and exclude ≤-200 odds
      // DON'T slice here - let frontend handle per-sport slicing
      const filteredData = data.map(record => {
        const filtered = record.picks.filter(pick => {
          if (pick.confidence < 0.55) return false;
          const odds = pick.odds || 0;
          if (typeof odds === 'number' && odds <= -200) return false;
          return true;
        });
        record.picks = filtered
          .sort((a, b) => (b.confidence !== a.confidence ? b.confidence - a.confidence : (b.ev || 0) - (a.ev || 0)));
        return record;
      }).filter(record => record.picks.length > 0);
      
      // Log sport distribution
      const allPicks = filteredData.flatMap(r => r.picks);
      const sportCounts = allPicks.reduce((acc, p) => {
        acc[p.sport || 'unknown'] = (acc[p.sport || 'unknown'] || 0) + 1;
        return acc;
      }, {});
      console.log(`After filtering (>= 0.55 conf, not ≤-200 odds): ${allPicks.length} picks by sport:`, sportCounts);
      
      return filteredData || [];
    } catch (error) {
      console.error('Error in getTodayPropPicks:', error);
      return [];
    }
  }
};