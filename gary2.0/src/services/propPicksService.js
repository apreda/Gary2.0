import axios from 'axios';
import { propOddsService } from './propOddsService.js';
import { oddsService } from './oddsService.js';
import { mlbStatsApiService } from './mlbStatsApiService.js';
import { openaiService } from './openaiService.js';
// Using MLB Stats API exclusively for prop picks - no need for sportsDbApiService or perplexityService
import { nbaSeason, formatSeason, getCurrentEST, formatInEST } from '../utils/dateUtils.js';

// Import Supabase named export
import { supabase } from '../supabaseClient.js';

/**
 * Service for generating prop picks based on MLB Stats API data
 */
const propPicksService = {
  /**
   * Format MLB player stats from MLB Stats API
   */
  formatMLBPlayerStats: async (homeTeam, awayTeam) => {
    try {
      console.log(`Formatting comprehensive MLB player stats for ${homeTeam} vs ${awayTeam}`);

      // Get today's date
      const today = new Date().toISOString().slice(0, 10);

      // Get today's games
      const games = await mlbStatsApiService.getGamesByDate(today);
      if (!games || games.length === 0) {
        console.log('No MLB games found for today');
        return '';
      }

      // Find the game for these teams
      let targetGame = null;
      for (const game of games) {
        const homeMatches = game.teams?.home?.team?.name?.includes(homeTeam);
        const awayMatches = game.teams?.away?.team?.name?.includes(awayTeam);
        if (homeMatches && awayMatches) {
          targetGame = game;
          break;
        }
      }

      if (!targetGame) {
        console.log(`No game found for ${homeTeam} vs ${awayTeam}`);
        return '';
      }

      // Get enhanced data using our MLB Stats API service
      const homeTeamId = targetGame.teams.home.team.id;
      const awayTeamId = targetGame.teams.away.team.id;
      const gameId = targetGame.gamePk;

      // Get starting pitchers
      let startingPitchers = null;
      try {
        startingPitchers = await mlbStatsApiService.getStartingPitchersEnhanced(gameId);
      } catch (error) {
        console.log(`Error getting starting pitchers: ${error.message}`);
      }

      // Get team rosters with stats
      let homeRoster = [];
      let awayRoster = [];

      try {
        if (typeof mlbStatsApiService.getTeamRosterWithStats === 'function') {
          const rosterData = await mlbStatsApiService.getTeamRosterWithStats(homeTeamId);
          if (rosterData && rosterData.hitters) {
            homeRoster = rosterData.hitters;
          }
        }
      } catch (error) {
        console.log(`Error getting enhanced home roster: ${error.message}`);
      }

      try {
        if (typeof mlbStatsApiService.getTeamRosterWithStats === 'function') {
          const rosterData = await mlbStatsApiService.getTeamRosterWithStats(awayTeamId);
          if (rosterData && rosterData.hitters) {
            awayRoster = rosterData.hitters;
          }
        }
      } catch (error) {
        console.log(`Error getting enhanced away roster: ${error.message}`);
      }

      // Get league leaders for context
      let homeRunLeaders = [];
      let battingAvgLeaders = [];
      let eraLeaders = [];
      let strikeoutLeaders = [];

      try {
        if (typeof mlbStatsApiService.getLeagueLeaders === 'function') {
          const leagueLeadersData = await mlbStatsApiService.getLeagueLeaders();
          homeRunLeaders = leagueLeadersData.homeRuns || [];
          battingAvgLeaders = leagueLeadersData.battingAvg || [];
          eraLeaders = leagueLeadersData.era || [];
          strikeoutLeaders = leagueLeadersData.strikeouts || [];
        }
      } catch (error) {
        console.log(`Error getting league leaders: ${error.message}`);
      }

      // Helper function to find player ranking in league leaders
      function findPlayerRanking(leaders, playerId) {
        const index = leaders.findIndex(leader => leader.person?.id === playerId);
        return index !== -1 ? { rank: index + 1, value: leaders[index].value } : null;
      }

      // Format all the data into a comprehensive stats text
      let statsText = '';

      // SECTION 1: Starting Pitchers
      statsText += 'STARTING PITCHERS:\n';

      if (startingPitchers?.homeStarter) {
        const hp = startingPitchers.homeStarter;
        const hpStats = hp.seasonStats || {};
        statsText += `${homeTeam} - ${hp?.fullName || 'Unknown Pitcher'}: ERA ${hpStats.era || 'N/A'}, ` +
          `${hpStats.wins || 0}W-${hpStats.losses || 0}L, ` +
          `${hpStats.inningsPitched || '0.0'} IP, ` +
          `${hpStats.strikeouts || 0} K, ` +
          `WHIP ${hpStats.whip || 'N/A'}, ` +
          `BAA ${hpStats.battingAvgAgainst || '.000'}\n`;

        if (eraLeaders.length > 0 || strikeoutLeaders.length > 0) {
          statsText += `RANKINGS: `;
          const eraRank = findPlayerRanking(eraLeaders, hp.id);
          if (eraRank) {
            statsText += `ERA #${eraRank.rank} in MLB (${eraRank.value}), `;
          }
          const soRank = findPlayerRanking(strikeoutLeaders, hp.id);
          if (soRank) {
            statsText += `K #${soRank.rank} in MLB (${soRank.value}), `;
          }
          statsText += '\n';
        }
      } else {
        statsText += `${homeTeam} - Starting pitcher not announced\n`;
      }

      if (startingPitchers?.awayStarter) {
        const ap = startingPitchers.awayStarter;
        const apStats = ap.seasonStats || {};
        statsText += `${awayTeam} - ${ap?.fullName || 'Unknown Pitcher'}: ERA ${apStats.era || 'N/A'}, ` +
          `${apStats.wins || 0}W-${apStats.losses || 0}L, ` +
          `${apStats.inningsPitched || '0.0'} IP, ` +
          `${apStats.strikeouts || 0} K, ` +
          `WHIP ${apStats.whip || 'N/A'}, ` +
          `BAA ${apStats.battingAvgAgainst || '.000'}\n`;

        if (eraLeaders.length > 0 || strikeoutLeaders.length > 0) {
          statsText += `RANKINGS: `;
          const eraRank = findPlayerRanking(eraLeaders, ap.id);
          if (eraRank) {
            statsText += `ERA #${eraRank.rank} in MLB (${eraRank.value}), `;
          }
          const soRank = findPlayerRanking(strikeoutLeaders, ap.id);
          if (soRank) {
            statsText += `K #${soRank.rank} in MLB (${soRank.value}), `;
          }
          statsText += '\n';
        }
      } else {
        statsText += `${awayTeam} - Starting pitcher not announced\n`;
      }

      // SECTION 2: Team Hitters
      statsText += `\n${homeTeam} HITTERS:\n`;

      if (homeRoster.length > 0) {
        for (const hitter of homeRoster) {
          const s = hitter.stats;
          statsText += `${hitter?.fullName || 'Unknown Player'} (${hitter?.position || 'N/A'}): ` +
            `AVG ${s.avg || '.000'}, ` +
            `${s.hits || 0} H, ` +
            `${s.homeRuns || 0} HR, ` +
            `${s.rbi || 0} RBI, ` +
            `${s.runs || 0} R, ` +
            `${s.strikeouts || 0} K, ` +
            `${s.walks || 0} BB, ` +
            `OPS ${s.ops || '.000'}\n`;

          if (homeRunLeaders.length > 0 || battingAvgLeaders.length > 0) {
            const hrRank = findPlayerRanking(homeRunLeaders, hitter.id);
            const avgRank = findPlayerRanking(battingAvgLeaders, hitter.id);

            if (hrRank || avgRank) {
              statsText += `RANKINGS: `;
              if (hrRank) {
                statsText += `HR #${hrRank.rank} in MLB (${hrRank.value}), `;
              }
              if (avgRank) {
                statsText += `AVG #${avgRank.rank} in MLB (${avgRank.value}), `;
              }
              statsText += '\n';
            }
          }
        }
      } else {
        statsText += `No detailed stats available for ${homeTeam} hitters\n`;
      }

      statsText += `\n${awayTeam} HITTERS:\n`;

      if (awayRoster.length > 0) {
        for (const hitter of awayRoster) {
          const s = hitter.stats;
          statsText += `${hitter?.fullName || 'Unknown Player'} (${hitter?.position || 'N/A'}): ` +
            `AVG ${s.avg || '.000'}, ` +
            `${s.hits || 0} H, ` +
            `${s.homeRuns || 0} HR, ` +
            `${s.rbi || 0} RBI, ` +
            `${s.runs || 0} R, ` +
            `${s.strikeouts || 0} K, ` +
            `${s.walks || 0} BB, ` +
            `OPS ${s.ops || '.000'}\n`;

          if (homeRunLeaders.length > 0 || battingAvgLeaders.length > 0) {
            const hrRank = findPlayerRanking(homeRunLeaders, hitter.id);
            const avgRank = findPlayerRanking(battingAvgLeaders, hitter.id);

            if (hrRank || avgRank) {
              statsText += `RANKINGS: `;
              if (hrRank) {
                statsText += `HR #${hrRank.rank} in MLB (${hrRank.value}), `;
              }
              if (avgRank) {
                statsText += `AVG #${avgRank.rank} in MLB (${avgRank.value}), `;
              }
              statsText += '\n';
            }
          }
        }
      } else {
        statsText += `No detailed stats available for ${awayTeam} hitters\n`;
      }

      // SECTION 3: League Leaders
      statsText += '\nMVP CANDIDATES & LEAGUE LEADERS:\n';

      if (homeRunLeaders.length > 0) {
        statsText += 'HOME RUNS: ';
        for (let i = 0; i < Math.min(homeRunLeaders.length, 5); i++) {
          const leader = homeRunLeaders[i];
          statsText += `${i + 1}. ${leader?.person?.fullName || 'Unknown Player'} (${leader?.value || 'N/A'}), `;
        }
        statsText += '\n';
      }

      if (battingAvgLeaders.length > 0) {
        statsText += 'BATTING AVG: ';
        for (let i = 0; i < Math.min(battingAvgLeaders.length, 5); i++) {
          const leader = battingAvgLeaders[i];
          statsText += `${i + 1}. ${leader?.person?.fullName || 'Unknown Player'} (${leader?.value || 'N/A'}), `;
        }
        statsText += '\n';
      }

      if (eraLeaders.length > 0) {
        statsText += 'ERA: ';
        for (let i = 0; i < Math.min(eraLeaders.length, 5); i++) {
          const leader = eraLeaders[i];
          statsText += `${i + 1}. ${leader?.person?.fullName || 'Unknown Player'} (${leader?.value || 'N/A'}), `;
        }
        statsText += '\n';
      }

      if (strikeoutLeaders.length > 0) {
        statsText += 'STRIKEOUTS: ';
        for (let i = 0; i < Math.min(strikeoutLeaders.length, 5); i++) {
          const leader = strikeoutLeaders[i];
          statsText += `${i + 1}. ${leader?.person?.fullName || 'Unknown Player'} (${leader?.value || 'N/A'}), `;
        }
        statsText += '\n';
      }

      return statsText;
    } catch (error) {
      console.error('Error formatting MLB player stats:', error);
      return 'Error retrieving player statistics. Please check back later.';
    }
  },

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

Give me your TOP picks only, focusing on value bets with favorable odds (prefer +100 or better when possible).

For each pick, provide:
1. The player name and exact prop as listed
2. A confidence score between 0-1 (where 1 is highest confidence)
3. A brief reasoning (2-3 sentences maximum)

Format your response as a JSON array with these fields:
- pick: The exact player prop selection (PLAYER NAME + OVER/UNDER + STAT + LINE + ODDS)
- confidence: Your confidence score (0-1)
- reasoning: Brief explanation for the pick

Your confidence score should be based primarily on:
- Winning probability (50% weight)
- Return on investment potential (30% weight)
- Size of the edge you've identified (20% weight)

Respond with ONLY the JSON array of your best prop picks.
`;
  },

  /**
   * Parse the OpenAI response for prop picks
   */
  parseOpenAIResponse: (response) => {
    try {
      // First, try direct JSON parsing
      try {
        const parsed = JSON.parse(response);
        if (Array.isArray(parsed)) {
          console.log(`Successfully parsed JSON response with ${parsed.length} picks`);
          return parsed;
        }
      } catch (jsonError) {
        // Not direct JSON, continue with regex extraction
        console.log('Response is not direct JSON, trying to extract JSON blocks');
      }

      // Try to extract JSON from the response
      const jsonMatch = response.match(/\[\s*\{[\s\S]*?\}\s*\]/g);
      if (jsonMatch && jsonMatch[0]) {
        try {
          const extracted = JSON.parse(jsonMatch[0]);
          console.log(`Successfully extracted JSON with ${extracted.length} picks`);
          return extracted;
        } catch (extractError) {
          console.error('Error parsing extracted JSON:', extractError);
        }
      }

      // If we couldn't extract JSON, try to parse the formatted text response
      // Example format: 
      // "PICK: Aaron Judge OVER Home Runs 0.5 (+160)
      // CONFIDENCE: 0.85
      // REASONING: ..."
      console.log('Attempting to parse formatted text response');
      const picks = [];
      const sections = response.split(/PICK:|Pick:/gi).filter(Boolean);

      for (const section of sections) {
        try {
          const confidenceMatch = section.match(/CONFIDENCE:? (0\.\d+)/i) || section.match(/Confidence:? (0\.\d+)/i);
          const reasoningMatch = section.match(/REASONING:? (.+?)(?=PICK:|Pick:|$)/is) || section.match(/Reasoning:? (.+?)(?=PICK:|Pick:|$)/is);

          if (confidenceMatch) {
            const pickText = section.split(/\n/)[0].trim();
            const confidence = parseFloat(confidenceMatch[1]);
            const reasoning = reasoningMatch ? reasoningMatch[1].trim() : 'No reasoning provided';

            picks.push({
              pick: pickText,
              confidence,
              reasoning
            });
          }
        } catch (sectionError) {
          console.error('Error parsing section:', sectionError);
        }
      }

      if (picks.length > 0) {
        console.log(`Successfully parsed ${picks.length} picks from formatted text`);
        return picks;
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
          // Filter for high confidence picks (75% or higher)
          const originalCount = entry.picks.length;
          const highConfidencePicks = entry.picks.filter(pick => pick.confidence >= 0.75);

          return {
            ...entry,
            picks: highConfidencePicks,
            originalPickCount: originalCount
          };
        }
        return entry;
      });

      console.log(`Found ${data.length} entries for ${dateString}, filtered to 70%+ confidence threshold`);
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
      const playerProps = await propOddsService.getPlayerProps(gameData.sport, gameData.homeTeam, gameData.awayTeam);
      console.log(`Found ${playerProps.length} prop options for ${gameData.homeTeam} vs ${gameData.awayTeam}`);

      if (playerProps.length === 0) {
        return [];
      }

      // 2. Format props and stats
      const formattedProps = playerProps.map(p => `${p.player} ${p.type} ${p.stat} ${p.line} (${p.odds})`).join('\n');
      const playerStatsText = await propPicksService.formatMLBPlayerStats(gameData.homeTeam, gameData.awayTeam);

      // 3. Create the prompt for OpenAI
      const prompt = propPicksService.createPropPicksPrompt(formattedProps, playerStatsText);

      // 4. Call the OpenAI API
      console.log('Calling OpenAI to generate prop picks...');
      const response = await openaiService.generatePropPicks(prompt);

      // 5. Parse the response to extract the picks
      const picks = propPicksService.parseOpenAIResponse(response);
      console.log(`Parsed ${picks.length} prop picks from OpenAI response`);

      // 6. Validate and filter the picks
      // Filter out picks with invalid format
      const valid = picks.filter(p => {
        const hasRequiredFields = p.pick && p.confidence && p.reasoning;
        if (!hasRequiredFields) {
          console.log(`Filtering out prop pick with missing fields: ${JSON.stringify(p)}`);
        }
        return hasRequiredFields;
      });

      // Filter by odds quality (prefer +EV bets)
      const validOdds = valid.filter(p => {
        // Extract the odds from the pick string
        const oddsMatch = p.pick.match(/\(([+-]\d+)\)/);
        if (oddsMatch && oddsMatch[1]) {
          const odds = parseInt(oddsMatch[1]);
          const oddsOK = odds > -150;
          if (!oddsOK) {
            console.log(`Filtering out prop pick with poor odds: ${p.pick} (${odds} is worse than -150)`);
          }
          return oddsOK;
        }
        return true; // Keep picks where we can't determine odds
      });

      // Further filter by high confidence threshold - standard 0.75 confidence threshold
      const highConf = validOdds.filter(p => p.confidence >= 0.75);

      // Sort by confidence (highest first) and take only the top 10
      const sortedByConfidence = [...highConf].sort((a, b) => b.confidence - a.confidence);
      const topTenPicks = sortedByConfidence.slice(0, 10);

      console.log(
        `Original: ${playerProps.length}, Valid: ${valid.length}, HighConf: ${highConf.length}, Top 10: ${topTenPicks.length}`
      );

      return topTenPicks;
    } catch (error) {
      console.error('Error generating prop picks:', error);
      return [];
    }
  },
  
  /**
   * Get today's prop picks from the database
   * This function is used by the GaryProps component
   */
  getTodayPropPicks: async () => {
    try {
      const today = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
      console.log(`Fetching prop picks for today: ${today}`);
      
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
      return data || [];
    } catch (error) {
      console.error('Error in getTodayPropPicks:', error);
      return [];
    }
  }
};

export { propPicksService };