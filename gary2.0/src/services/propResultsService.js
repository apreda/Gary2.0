/**
 * Prop Results Service
 * Handles checking and recording player prop bet results
 * Uses multiple data sources with fallback mechanisms:
 * 1. Ball Don't Lie API (primary source)
 * 2. SportsDB API (fallback #1)
 * 3. Perplexity API for web searches (fallback #2)
 * 4. OpenAI for complex prop bet outcome determination
 */
import { supabase } from '../supabaseClient.js';
import { openaiService } from './openaiService.js';
import { sportsDbApiService } from './sportsDbApiService.js';
import { ballDontLieApiService } from './ballDontLieApiService.js';
import axios from 'axios';

const propResultsService = {
  /**
   * Check and process results for player props
   */
  checkPropResults: async (date) => {
    try {
      console.log(`Checking player prop results for ${date}`);
      
      // 1. Get prop picks from the database
      const { data: propPicksRows, error: propPicksError } = await supabase
        .from('prop_picks')
        .select('*')
        .eq('date', date);
        
      if (propPicksError) {
        throw new Error(`Error getting prop picks: ${propPicksError.message}`);
      }
      
      if (!propPicksRows || propPicksRows.length === 0) {
        return {
          success: false,
          message: `No prop picks found for ${date}`,
          results: []
        };
      }
      
      // Parse the picks array from the JSON column
      let allPropPicks = [];
      for (const row of propPicksRows) {
        if (row.picks && Array.isArray(row.picks)) {
          // Transform the picks array format into our expected format
          const formattedPicks = row.picks.map(pick => ({
            id: row.id, // Use the row ID as the prop_pick_id
            date: row.date,
            player_name: pick.player,
            team: pick.team,
            league: row.league || null, // Use the league from the row if available
            prop_type: pick.prop?.split(' ')?.[0] || pick.prop, // Extract prop type from "hits 0.5"
            prop_line: pick.line || parseFloat(pick.prop?.split(' ')?.[1]) || 0, // Extract line from prop or use provided line
            pick_direction: pick.bet,
            pick_text: `${pick.player} ${pick.bet} ${pick.line || (pick.prop?.split(' ')?.[1] || '')} ${pick.prop?.split(' ')?.[0] || pick.prop}`,
            odds: pick.odds,
            confidence: pick.confidence,
            matchup: row.matchup || null
          }));
          
          allPropPicks = [...allPropPicks, ...formattedPicks];
        }
      }
      
      console.log(`Found ${allPropPicks.length} individual prop picks for ${date}`);
      
      // For prop results, we only care about MLB stats
      console.log('Processing MLB prop stats with multiple data sources (Ball Don\'t Lie API, SportsDB API, Perplexity, and OpenAI)');
      
      // Filter to MLB picks only and add any picks with MLB teams
      const mlbTeams = [
        'New York Yankees', 'New York Mets', 'Chicago White Sox', 'Chicago Cubs', 
        'Detroit Tigers', 'Toronto Blue Jays', 'St. Louis Cardinals', 'Washington Nationals',
        'Baltimore Orioles', 'Miami Marlins', 'Tampa Bay Rays', 'Boston Red Sox', 'Cleveland Guardians',
        'Philadelphia Phillies', 'Atlanta Braves', 'Pittsburgh Pirates', 'Cincinnati Reds',
        'Colorado Rockies', 'Milwaukee Brewers', 'Los Angeles Angels', 'Los Angeles Dodgers',
        'Minnesota Twins', 'Oakland Athletics', 'San Diego Padres', 'San Francisco Giants',
        'Seattle Mariners', 'Texas Rangers', 'Kansas City Royals', 'Houston Astros', 'Arizona Diamondbacks'
      ];
      
      // Identify MLB picks by league or team name
      const mlbPicks = allPropPicks.filter(pick => {
        return pick.league === 'MLB' || 
          (pick.team && mlbTeams.some(team => pick.team.toLowerCase().includes(team.toLowerCase()) || 
                                     team.toLowerCase().includes(pick.team.toLowerCase())));
      });
      
      console.log(`Found ${mlbPicks.length} MLB prop picks to process`);
      
      // Group MLB picks by team for efficient API calls
      const teamGroupedPicks = {};
      mlbPicks.forEach(pick => {
        const team = pick.team || 'unknown';
        if (!teamGroupedPicks[team]) {
          teamGroupedPicks[team] = [];
        }
        teamGroupedPicks[team].push(pick);
      });
      
      // Helper function to generate name variations for better matching
      function generateNameVariations(name) {
        const variations = [];
        
        // Always include the original name
        variations.push(name);
        
        // Remove suffixes like Jr./Sr.
        if (name.includes(' Jr.')) {
          variations.push(name.replace(' Jr.', ''));
          variations.push(name.replace(' Jr.', ' Jr'));
        }
        
        if (name.includes(' Sr.')) {
          variations.push(name.replace(' Sr.', ''));
          variations.push(name.replace(' Sr.', ' Sr'));
        }
        
        // Handle middle initials
        const parts = name.split(' ');
        if (parts.length > 2) {
          // Remove middle name/initial
          variations.push(`${parts[0]} ${parts[parts.length-1]}`);
          
          // First initial + last name
          if (parts[0].length > 0) {
            variations.push(`${parts[0][0]}. ${parts[parts.length-1]}`);
          }
        }
        
        return variations;
      }
      
      /**
       * Query Perplexity API to search for player statistics
       * Used as a fallback when other APIs don't return data
       */
      async function searchPerplexityForPlayerStats(playerName, team, date, propType) {
        try {
          console.log(`Searching Perplexity for stats for ${playerName} (${team}) on ${date} for ${propType}`);
          
          // Format the date for better search results (May 20, 2025)
          const searchDate = new Date(date).toLocaleDateString('en-US', { 
            month: 'long', day: 'numeric', year: 'numeric'
          });
          
          // Create a direct, specific prompt as recommended
          let statName = propType;
          // Map our internal prop types to natural language for better results
          if (propType === 'hits') statName = 'hits';
          else if (propType === 'runs') statName = 'runs';
          else if (propType === 'rbi') statName = 'RBIs';
          else if (propType === 'hr') statName = 'home runs';
          else if (propType === 'strikeouts') statName = 'strikeouts';
          else if (propType === 'total_bases') statName = 'total bases';
          else if (propType === 'hits_runs_rbis') statName = 'combined hits, runs, and RBIs';
          
          const query = `How many ${statName} did ${playerName} have in the ${team} MLB game on ${searchDate}? Return just the number of ${statName}, and nothing else.`;
          
          // Check if Perplexity API key is available
          const perplexityApiKey = import.meta.env?.VITE_PERPLEXITY_API_KEY || process.env.VITE_PERPLEXITY_API_KEY;
          
          if (!perplexityApiKey) {
            console.log('Perplexity API key not available');
            return null;
          }
          
          // Make the API call as recommended
          const response = await axios.post('https://api.perplexity.ai/chat/completions', {
            model: 'pplx-70b-online', // Use the recommended model
            messages: [{ role: 'user', content: query }],
            temperature: 0.0, // Keep temperature at 0 for more deterministic answers
            max_tokens: 50
          }, {
            headers: {
              'Authorization': `Bearer ${perplexityApiKey}`,
              'Content-Type': 'application/json'
            }
          });
          
          // Parse the result
          if (response.data && response.data.choices && response.data.choices.length > 0) {
            const content = response.data.choices[0].message.content.trim();
            console.log(`Perplexity result for ${playerName} ${propType}: "${content}"`);
            
            // First check if the entire content is just a number
            if (/^\d+(\.\d+)?$/.test(content)) {
              const statValue = parseFloat(content);
              console.log(`Found exact stat value for ${playerName}: ${statValue}`);
              return {
                [propType]: statValue,
                source: 'Perplexity API'
              };
            }
            
            // Otherwise try to extract a number from the response
            const numberMatch = content.match(/\d+(\.\d+)?/);
            if (numberMatch) {
              const statValue = parseFloat(numberMatch[0]);
              console.log(`Extracted stat value for ${playerName}: ${statValue}`);
              return {
                [propType]: statValue,
                source: 'Perplexity API'
              };
            }
            
            // Look for written numbers (zero, one, two, etc.)
            const writtenNumbers = {
              'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
              'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10
            };
            
            for (const [word, value] of Object.entries(writtenNumbers)) {
              if (content.toLowerCase().includes(word)) {
                console.log(`Found written number ${word} (${value}) for ${playerName}`);
                return {
                  [propType]: value,
                  source: 'Perplexity API'
                };
              }
            }
          }
          
          console.log(`Could not extract a valid statistic value from Perplexity response for ${playerName}`);
          return null;
        } catch (error) {
          console.error(`Error searching Perplexity for ${playerName}:`, error);
          return null;
        }
      }
      
      /**
       * Use Perplexity to directly determine if a prop bet is a win, loss, or push by searching the web
       * This combines the stat lookup and outcome determination in one step
       */
      async function determineResultWithPerplexity(playerName, team, date, propType, propLine, pickDirection) {
        try {
          console.log(`Using Perplexity to determine result for ${playerName}'s ${propType} ${pickDirection} ${propLine}`);
          
          // Format the date for better search results (May 20, 2025)
          const searchDate = new Date(date).toLocaleDateString('en-US', { 
            month: 'long', day: 'numeric', year: 'numeric'
          });
          
          // Map our internal prop types to natural language for better results
          let statName = propType;
          if (propType === 'hits') statName = 'hits';
          else if (propType === 'runs') statName = 'runs';
          else if (propType === 'rbi') statName = 'RBIs';
          else if (propType === 'hr') statName = 'home runs';
          else if (propType === 'strikeouts') statName = 'strikeouts';
          else if (propType === 'total_bases') statName = 'total bases';
          else if (propType === 'hits_runs_rbis') statName = 'combined hits, runs, and RBIs';
          
          // Create a direct, specific prompt for Perplexity to determine the outcome
          const query = `I need to check a baseball prop bet outcome. ${playerName} playing for ${team} on ${searchDate} had a prop bet of ${pickDirection} ${propLine} ${statName}. 
          1. First, find how many ${statName} ${playerName} had in that game exactly. 
          2. Then determine if the bet WON, LOST, or was a PUSH based on these rules:
             - For OVER bets: Bet WON if actual > ${propLine}, LOST if actual < ${propLine}, PUSH if equal
             - For UNDER bets: Bet WON if actual < ${propLine}, LOST if actual > ${propLine}, PUSH if equal
          Answer with ONLY ONE WORD at the end: "won", "lost", or "push".`;
          
          // Check if Perplexity API key is available
          const perplexityApiKey = import.meta.env?.VITE_PERPLEXITY_API_KEY || process.env.VITE_PERPLEXITY_API_KEY;
          
          if (!perplexityApiKey) {
            console.log('Perplexity API key not available');
            return 'pending';
          }
          
          // Make the API call
          const response = await axios.post('https://api.perplexity.ai/chat/completions', {
            model: 'pplx-70b-online',
            messages: [{ role: 'user', content: query }],
            temperature: 0.0,
            max_tokens: 150 // Allow for enough tokens to provide reasoning and final answer
          }, {
            headers: {
              'Authorization': `Bearer ${perplexityApiKey}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (response.data && response.data.choices && response.data.choices.length > 0) {
            const content = response.data.choices[0].message.content.trim();
            console.log(`Perplexity result for ${playerName} ${propType}: "${content}"`);
            
            // Extract actual value if present in the response
            let actualResult = null;
            const statsMatch = content.match(/had\s+(\d+(?:\.\d+)?)\s+${statName}/i) || 
                              content.match(/recorded\s+(\d+(?:\.\d+)?)\s+${statName}/i) ||
                              content.match(/${statName}:\s*(\d+(?:\.\d+)?)/i);
            
            if (statsMatch) {
              actualResult = parseFloat(statsMatch[1]);
              console.log(`Extracted actual result: ${actualResult} ${statName}`);
            }
            
            // Extract the final verdict - look for won/lost/push at the end or in specific patterns
            if (content.toLowerCase().match(/\bwon\b\s*$/)) {
              console.log(`Perplexity determined result: WON`);
              return { result: 'won', actualResult };
            } else if (content.toLowerCase().match(/\blost\b\s*$/)) {
              console.log(`Perplexity determined result: LOST`);
              return { result: 'lost', actualResult };
            } else if (content.toLowerCase().match(/\bpush\b\s*$/)) {
              console.log(`Perplexity determined result: PUSH`);
              return { result: 'push', actualResult };
            }
            
            // If no clear verdict at the end, search the entire text
            if (content.toLowerCase().includes('bet won') || 
                content.toLowerCase().includes('the bet would win') || 
                content.toLowerCase().includes('is a win')) {
              console.log(`Perplexity determined result from context: WON`);
              return { result: 'won', actualResult };
            } else if (content.toLowerCase().includes('bet lost') || 
                       content.toLowerCase().includes('the bet would lose') ||
                       content.toLowerCase().includes('is a loss')) {
              console.log(`Perplexity determined result from context: LOST`);
              return { result: 'lost', actualResult };
            } else if (content.toLowerCase().includes('push') ||
                       content.toLowerCase().includes('bet tied')) {
              console.log(`Perplexity determined result from context: PUSH`);
              return { result: 'push', actualResult };
            }
            
            // If we extracted the stats but couldn't find a verdict, calculate it ourselves
            if (actualResult !== null) {
              const normalizedDirection = pickDirection.toUpperCase();
              if (normalizedDirection === 'OVER' || normalizedDirection === 'O') {
                const result = actualResult > propLine ? 'won' : actualResult === propLine ? 'push' : 'lost';
                console.log(`Calculated result based on extracted stats: ${result}`);
                return { result, actualResult };
              } else {
                const result = actualResult < propLine ? 'won' : actualResult === propLine ? 'push' : 'lost';
                console.log(`Calculated result based on extracted stats: ${result}`);
                return { result, actualResult };
              }
            }
          }
          
          console.log(`Could not determine result from Perplexity response`);
          return { result: 'pending', actualResult: null };
        } catch (error) {
          console.error(`Error using Perplexity to determine result:`, error);
          return { result: 'pending', actualResult: null };
        }
      }
      
      /**
       * Use OpenAI to determine if a prop bet is a win, loss, or push
       */
      async function determineResultWithOpenAI(playerName, propType, propLine, pickDirection, actualResult) {
        try {
          console.log(`Using OpenAI to determine result for ${playerName} ${propType} ${pickDirection} ${propLine} (actual: ${actualResult})`);
          
          if (actualResult === null) {
            console.log('No actual result available for OpenAI to analyze');
            return 'pending';
          }
          
          const prompt = `
            You are tasked with determining the outcome of a sports prop bet based on the following information:
            
            Player: ${playerName}
            Prop Type: ${propType}
            Prop Line: ${propLine}
            Pick Direction: ${pickDirection} (OVER or UNDER)
            Actual Result: ${actualResult}
            
            Based solely on comparing the actual result to the prop line and pick direction, determine if this bet is a WIN, LOSS, or PUSH.
            
            A bet is a WIN if:
            - For OVER bets: The actual result is greater than the prop line
            - For UNDER bets: The actual result is less than the prop line
            
            A bet is a LOSS if:
            - For OVER bets: The actual result is less than the prop line
            - For UNDER bets: The actual result is greater than the prop line
            
            A bet is a PUSH if the actual result equals exactly the prop line.
            
            Respond with only one word: 'won', 'lost', or 'push'.
          `;
          
          const response = await openaiService.generateResponse([
            { role: 'system', content: 'You are a sports betting expert focusing on determining prop bet outcomes. Respond with only one word: "won", "lost", or "push".' },
            { role: 'user', content: prompt }
          ], { temperature: 0, maxTokens: 10 });
          
          // Normalize the response
          const normalizedResponse = response.toLowerCase().trim();
          
          if (['won', 'lost', 'push'].includes(normalizedResponse)) {
            console.log(`OpenAI determined result for ${playerName} ${propType}: ${normalizedResponse}`);
            return normalizedResponse;
          } else {
            console.log(`OpenAI returned unexpected response: ${normalizedResponse}`); 
            // Fall back to basic logic
            const normalizedDirection = pickDirection.toUpperCase();
            if (normalizedDirection === 'OVER' || normalizedDirection === 'O') {
              return actualResult > propLine ? 'won' : actualResult === propLine ? 'push' : 'lost';
            } else {
              return actualResult < propLine ? 'won' : actualResult === propLine ? 'push' : 'lost';
            }
          }
        } catch (error) {
          console.error(`Error using OpenAI to determine result:`, error);
          // Fall back to basic logic
          const normalizedDirection = pickDirection.toUpperCase();
          if (normalizedDirection === 'OVER' || normalizedDirection === 'O') {
            return actualResult > propLine ? 'won' : actualResult === propLine ? 'push' : 'lost';
          } else {
            return actualResult < propLine ? 'won' : actualResult === propLine ? 'push' : 'lost';
          }
        }
      }
      
      // Process each team's picks
      const results = [];
      for (const team in teamGroupedPicks) {
        const picks = teamGroupedPicks[team];
        
        console.log(`Processing ${picks.length} prop picks for team ${team}`);
        
        // Get player stats data using Ball Don't Lie API
        let teamPlayerStats = null;
        
        try {
          // STEP 1: Try to get data from Ball Don't Lie API (primary source)
          console.log(`Step 1: Getting MLB player stats for team ${team} on ${date} from Ball Don't Lie API`);
          const playerStatsData = await ballDontLieApiService.getTeamPlayersStatsForDate(team, date);
          
          if (playerStatsData && playerStatsData.players && playerStatsData.players.length > 0) {
            teamPlayerStats = playerStatsData;
            console.log(`Successfully retrieved stats for ${teamPlayerStats.team} (${teamPlayerStats.players.length} players)`);
          } else {
            console.log(`No player stats found for team ${team} from Ball Don't Lie API, trying SportsDB...`);
            
            // STEP 2: Try SportsDB API as fallback
            try {
              console.log(`Step 2: Getting MLB player stats for team ${team} from SportsDB API`);
              const sportsDbStats = await sportsDbApiService.getPlayerStatsForProps(team, null, 'MLB');
              
              if (sportsDbStats && 
                 ((sportsDbStats.homeTeam && sportsDbStats.homeTeam.players && sportsDbStats.homeTeam.players.length > 0) ||
                  (sportsDbStats.awayTeam && sportsDbStats.awayTeam.players && sportsDbStats.awayTeam.players.length > 0))) {
                
                console.log(`Retrieved player data from SportsDB API for ${team}`);
                
                // Format SportsDB data to match our expected format
                const players = [];
                const teamData = sportsDbStats.homeTeam.name.toLowerCase().includes(team.toLowerCase()) || 
                                team.toLowerCase().includes(sportsDbStats.homeTeam.name.toLowerCase()) ?
                                sportsDbStats.homeTeam : sportsDbStats.awayTeam;
                
                if (teamData && teamData.players) {
                  teamData.players.forEach(player => {
                    players.push({
                      name: player.name,
                      statistics: {
                        // Since SportsDB doesn't provide game-by-game stats, we'll need to look them up separately
                        hits: null,
                        runs: null,
                        rbi: null,
                        hr: null,
                        strikeouts: null,
                        total_bases: null,
                        source: 'SportsDB API'
                      }
                    });
                  });
                }
                
                teamPlayerStats = {
                  team: teamData.name,
                  players: players
                };
                
                console.log(`Formatted ${players.length} players from SportsDB data`);
              } else {
                console.log(`No player data found from SportsDB for team ${team}`);
              }
            } catch (sportsDbError) {
              console.error(`Error getting stats from SportsDB for team ${team}:`, sportsDbError);
            }
          }
        } catch (statsError) {
          console.error(`Error getting player stats for team ${team}:`, statsError);          
        }
        
        // Process each pick for this team
        for (const pick of picks) {
          console.log(`Processing prop for ${pick.player_name} (${pick.prop_type}) as ${pick.pick_direction}`);
          
          // Default values if we don't find stats
          let resultStatus = 'postponed'; // Default to postponed if no stats available
          let actualResult = null;
          let playerMatchFound = false;
          
          // Find the player stats in our data
          const playerName = pick.player_name;
          let nameVariations = generateNameVariations(playerName);
          
          // Try with different name variations to find a matching player
          let playerStats = null;
          
          // First try to find player stats from the team stats results
          if (teamPlayerStats && teamPlayerStats.players) {
            // Try to match by exact name first
            let playerMatches = teamPlayerStats.players.filter(p => {
              const pName = p.name.toLowerCase();
              const targetName = playerName.toLowerCase();
              return pName === targetName || targetName === pName;
            });
            
            // If no exact match, try variations
            if (!playerMatches || playerMatches.length === 0) {
              playerMatches = teamPlayerStats.players.filter(p => {
                const pName = p.name.toLowerCase();
                
                // Check if player name matches any of our variations
                for (const variant of nameVariations) {
                  const vLower = variant.toLowerCase();
                  if (pName.includes(vLower) || vLower.includes(pName)) {
                    return true;
                  }
                }
                return false;
              });
            }
            
            // Use the first match if available
            if (playerMatches && playerMatches.length > 0) {
              playerStats = playerMatches[0].statistics;
              playerMatchFound = true;
              console.log(`Found stats for ${playerMatches[0].name} from team data`);
            }
          }
          
          // If still no match, try to fetch the individual player directly
          if (!playerMatchFound) {
            // STEP 3: Try direct player search with Ball Don't Lie
            try {
              console.log(`Step 3: Trying direct player search for ${playerName} on ${date} with Ball Don't Lie API`);
              const individualPlayerData = await ballDontLieApiService.getPlayerStatsForProps(playerName, date);
              
              if (individualPlayerData && individualPlayerData.statistics) {
                playerStats = individualPlayerData.statistics;
                playerMatchFound = true;
                console.log(`Found stats for ${individualPlayerData.player.full_name} from direct player search`);
              } else {
                console.log(`No player stats found for ${playerName} from direct Ball Don't Lie search`);
                
                // STEP 4: Try Perplexity API to search the web for player stats
                console.log(`Step 4: Searching web with Perplexity for ${playerName} stats`);
                const perplexityStats = await searchPerplexityForPlayerStats(
                  playerName, 
                  pick.team, 
                  date, 
                  pick.prop_type
                );
                
                if (perplexityStats && Object.keys(perplexityStats).length > 0) {
                  playerStats = perplexityStats;
                  playerMatchFound = true;
                  console.log(`Found ${playerName} stats via Perplexity web search: ${JSON.stringify(perplexityStats)}`);
                } else {
                  console.log(`No stats found for ${playerName} from Perplexity either`);
                }
              }
            } catch (playerError) {
              console.error(`Error fetching individual player stats for ${playerName}:`, playerError);
            }
          }
          
          if (!playerMatchFound) {
            console.log(`No player match found for ${playerName} after all attempts`);
          }
          
          // Map prop_type to the correct stat key
          const statKey = pick.prop_type.toLowerCase();
          const statMapping = {
            'hits': 'hits',
            'runs': 'runs',
            'rbi': 'rbi',
            'total_bases': 'total_bases',
            'strikeouts': 'strikeouts',
            'outs': 'outs',
            'hits_runs_rbis': 'hits_runs_rbis'
          };
          
          // Check if we have the needed stat
          let statFound = false;
          let mappedStatKey;
          
          if (statKey in statMapping) {
            mappedStatKey = statMapping[statKey];
            if (playerStats && playerStats[mappedStatKey] !== undefined) {
              actualResult = playerStats[mappedStatKey];
              statFound = true;
              console.log(`Found stat ${mappedStatKey} = ${actualResult} for ${playerName}`);
            }
          } else if (playerStats && playerStats[statKey] !== undefined) {
            // If we don't have a mapping, try to use the prop type directly as a key
            actualResult = playerStats[statKey];
            statFound = true;
            console.log(`Found direct stat ${statKey} = ${actualResult} for ${playerName}`);
          }
          
          // STEP 5: Try to determine the result
          if (statFound) {
            // If we already have the stats, calculate the result directly
            console.log(`Found stats for ${playerName} ${statKey} = ${actualResult}. Calculating result...`);
            
            const propLine = parseFloat(pick.prop_line);
            const normalizedDirection = pick.pick_direction.toUpperCase();
            
            if (normalizedDirection === 'OVER' || normalizedDirection === 'O') {
              resultStatus = actualResult > propLine ? 'won' : actualResult === propLine ? 'push' : 'lost';
            } else {
              resultStatus = actualResult < propLine ? 'won' : actualResult === propLine ? 'push' : 'lost';
            }
            
            console.log(`Calculated ${playerName} ${statKey} ${actualResult} vs line ${propLine} (${pick.pick_direction}) = ${resultStatus}`);
          } else {
            // We don't have stats yet, use Perplexity to determine the result directly
            console.log(`Step 5: Using Perplexity to determine the result for ${playerName} ${pick.prop_type}`);
            
            const perplexityResult = await determineResultWithPerplexity(
              playerName,
              pick.team,
              pick.date,
              pick.prop_type,
              parseFloat(pick.prop_line),
              pick.pick_direction
            );
            
            // Update the actual result if Perplexity found it
            if (perplexityResult.actualResult !== null) {
              actualResult = perplexityResult.actualResult;
              console.log(`Perplexity found stat: ${playerName} ${pick.prop_type} = ${actualResult}`);
            }
            
            // Update the result status
            resultStatus = perplexityResult.result;
            console.log(`Perplexity determined ${playerName} ${pick.prop_type} result = ${resultStatus}`);
          }
          
          if (!playerMatchFound) {
            console.log(`No stats found for player ${playerName}`);
          }
          
          // Create result object with only columns that exist in the database schema
          const resultObj = {
            prop_pick_id: pick.id,
            game_date: pick.date, // Use the date from the pick as game_date
            player_name: pick.player_name,
            prop_type: pick.prop_type,
            line_value: pick.prop_line, // This matches the line_value column in DB
            actual_value: actualResult, // This matches the actual_value column in DB
            result: resultStatus,
            odds: pick.odds || null, // Add odds if available
            pick_text: pick.pick_text || `${pick.player_name} ${pick.pick_direction} ${pick.prop_line} ${pick.prop_type}`,
            matchup: pick.matchup || null, // Add matchup if available
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          
          results.push(resultObj);
        }
      }
      
      // 4. Store results in the prop_results table
      if (results.length > 0) {
        const { error: insertError } = await supabase
          .from('prop_results')
          .insert(results);
          
        if (insertError) {
          console.error('Error inserting prop results:', insertError);
          throw new Error(`Failed to store prop results: ${insertError.message}`);
        }
        
        console.log(`Successfully recorded ${results.length} prop results`);
      }
      
      return {
        success: true,
        message: `Processed ${results.length} prop results`,
        count: results.length,
        results: results
      };
      
    } catch (error) {
      console.error('Error checking prop results:', error);
      return {
        success: false,
        message: `Error checking prop results: ${error.message}`,
        error: error.message
      };
    }
  },
  
  /**
   * Get prop results for a specific date
   */
  getPropResultsByDate: async (date) => {
    try {
      const { data, error } = await supabase
        .from('prop_results')
        .select(`
          *,
          prop_picks (*)
        `)
        .eq('prop_picks.date', date);
        
      if (error) {
        console.error('Error fetching prop results:', error);
        throw new Error(`Failed to fetch prop results: ${error.message}`);
      }
      
      return data || [];
    } catch (error) {
      console.error('Error getting prop results by date:', error);
      throw error;
    }
  },
  
  /**
   * Manually update a prop result
   */
  updatePropResult: async (resultId, updates) => {
    try {
      const { error } = await supabase
        .from('prop_results')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', resultId);
        
      if (error) {
        console.error('Error updating prop result:', error);
        throw new Error(`Failed to update prop result: ${error.message}`);
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error updating prop result:', error);
      return { success: false, error: error.message };
    }
  }
};

// For missing stats, we recommend using the admin panel at https://www.betwithgary.ai/admin/results
export { propResultsService };
