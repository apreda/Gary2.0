import axios from 'axios';
import { propOddsService } from './propOddsService.js';
import { oddsService } from './oddsService.js';
import { mlbStatsApiService } from './mlbStatsApiService.enhanced.js';
import { openaiService } from './openaiService.js';
// Using MLB Stats API exclusively for prop picks - no need for sportsDbApiService or perplexityService
import { nbaSeason, formatSeason, getCurrentEST, formatInEST, getESTDate } from '../utils/dateUtils.js';
import { debugUtils } from '../utils/debugUtils.js';

// Import Supabase named export
import { supabase } from '../supabaseClient.js';
import { propUtils } from './propUtils.js';
import { generatePropBets } from './propGenerator.js';

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
   */
  createPropPicksPrompt: (props, playerStats) => {
    return `You are Gary, an expert sports analyst specialized in player prop betting.

Your job is to analyze player props for today's games and identify value bets based on the provided player statistics and prop odds.

Here are the available props for today:
${props}

Here are the player statistics to consider in your analysis:
${playerStats}

For each prop, analyze the player's performance metrics, recent form, matchup advantages, and betting odds to determine if there's value.

Give me your TOP 5 picks only, focusing on value bets with favorable odds (prefer +100 or better when possible).

IMPORTANT: Assign high confidence scores (0.8-1.0) to your strongest picks where the statistical edge is clear and significant. Use moderate confidence (0.6-0.79) for solid picks with good value but some uncertainty. Only use lower confidence (below 0.6) for speculative picks. Do not artificially limit your confidence scores - if a pick deserves a 0.9 or higher based on your analysis, assign it accordingly.

Your confidence score should be based primarily on:
- Winning probability (50% weight)
- Return on investment potential (30% weight)
- Size of the edge you've identified (20% weight)

Respond with ONLY a JSON array of your best prop picks.
`;
  },

  /**
   * Parse the OpenAI response for prop picks
   */
  parseOpenAIResponse: (response) => {
    try {
      // First, try direct JSON parsing
      let parsed = null;
      
      try {
        parsed = JSON.parse(response);
        if (Array.isArray(parsed)) {
          console.log(`Successfully parsed JSON response with ${parsed.length} picks`);
        }
      } catch (jsonError) {
        // Not direct JSON, try to extract JSON array
        console.log('Response is not direct JSON, trying to extract JSON blocks');
        const jsonMatch = response.match(/\[\s*\{[\s\S]*?\}\s*\]/);
        if (jsonMatch && jsonMatch[0]) {
          parsed = JSON.parse(jsonMatch[0]);
          console.log(`Successfully extracted JSON with ${parsed.length} picks`);
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
          // Filter for confident picks (0.6 or higher) - LOWERED from 0.7
          const confidencePicks = entry.picks.filter(pick => pick.confidence >= 0.6);

          return {
            ...entry,
            picks: confidencePicks,
            originalPickCount: entry.picks.length
          };
        }
        return entry;
      });

      console.log(`Found ${data.length} entries for ${dateString}, filtered to 60%+ confidence threshold (LOWERED from 70%)`);
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

      // CRITICAL: Limit the number of props to prevent rate limiting
      // Filter to most common prop types and limit total number
      const priorityPropTypes = ['hits', 'strikeouts', 'home_runs', 'rbi', 'runs_scored', 'stolen_bases', 'total_bases'];
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
        console.log('Fetching player stats for analysis...');
        playerStatsText = await propPicksService.formatMLBPlayerStats(gameData.homeTeam, gameData.awayTeam);
        
        // Limit stats text to prevent token overflow
        if (playerStatsText.length > 5000) {
          playerStatsText = playerStatsText.substring(0, 5000) + '\n... (stats truncated for brevity)';
        }
        
        console.log(`Player stats retrieved successfully (${playerStatsText.length} characters)`);
      } catch (statsError) {
        console.error('Error getting player stats:', statsError);
        playerStatsText = `Basic game analysis for ${gameData.homeTeam} vs ${gameData.awayTeam}. Player statistics temporarily unavailable.`;
      }

      // Ensure we have some content for analysis
      if (!playerStatsText || playerStatsText.trim().length === 0) {
        playerStatsText = `Analyzing ${gameData.homeTeam} vs ${gameData.awayTeam} matchup. Using available prop data for analysis.`;
      }

      // 3. Create the prompt for OpenAI
      const prompt = propPicksService.createPropPicksPrompt(formattedProps, playerStatsText);

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

      // Further filter by high confidence threshold - standard 0.7 confidence threshold
      const highConf = validOdds.filter(p => p.confidence >= 0.7);

      // Sort by confidence (highest first) and take only the top 5 per game
      const sortedByConfidence = [...highConf].sort((a, b) => b.confidence - a.confidence);
      const topFivePicks = sortedByConfidence.slice(0, 5);

      // Enhance picks with team info, EV calculation, and time
      const enhancedPicks = topFivePicks.map(pick => {
        // The pick already has all the fields we need from OpenAI
        // Just ensure we have all the required fields
        return {
          // Core fields from OpenAI
          player: pick.player || 'Unknown Player',
          team: pick.team || playerTeamMap[pick.player] || 'MLB',
          prop: pick.prop || 'unknown',
          line: pick.line || '',
          bet: pick.bet || 'over',
          odds: pick.odds || 100,
          confidence: pick.confidence || 0.7,
          ev: pick.ev || null,
          rationale: pick.rationale || pick.reasoning || 'Analysis not available',
          
          // Additional fields
          sport: 'MLB', // Default to MLB for now
          time: propPicksService.formatGameTime(gameData.time || gameData.gameTime || gameData.commence_time),
          
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
      
      // Filter the picks by confidence threshold (0.7)
      const filteredData = data.map(record => {
        // Filter each record's picks to only include those with confidence >= 0.7
        record.picks = record.picks.filter(pick => pick.confidence >= 0.7);
        return record;
      }).filter(record => record.picks.length > 0);
      
      console.log(`After filtering for confidence >= 0.7, ${filteredData.length} records remain`);
      
      return filteredData || [];
    } catch (error) {
      console.error('Error in getTodayPropPicks:', error);
      return [];
    }
  }
};