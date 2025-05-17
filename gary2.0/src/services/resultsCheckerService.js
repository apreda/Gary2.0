import { supabase } from '../supabaseClient.js';
import { createClient } from '@supabase/supabase-js';
import { garyPerformanceService } from './garyPerformanceService.js';
import { sportsDbApiService } from './sportsDbApiService.js';
import { ballDontLieService } from './ballDontLieService.js';
import { perplexityService } from './perplexityService.js';
import { pickResultsAnalyzer } from './pickResultsAnalyzer.js';
// import { userPickResultsService } from './userPickResultsService'; // Remove if not used
// import { oddsApiService } from './oddsApiService'; // Remove if not used

const VALID_RESULTS = new Set(['won', 'lost', 'push']);
const SCORE_REGEX = /^\d+-\d+$/;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://xuttubsfgdcjfgmskcol.supabase.co';
const SUPABASE_SERVICE_KEY = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const adminSupabase = SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : supabase;

sportsDbApiService.initialize();

export const resultsCheckerService = {
  validateResult(result) {
    if (!VALID_RESULTS.has(result)) {
      console.error(`Invalid result: ${result}. Must be one of: ${Array.from(VALID_RESULTS).join(', ')}`);
      return false;
    }
    return true;
  },

  validateScore(score) {
    if (!SCORE_REGEX.test(score)) {
      console.error(`Invalid score format: ${score}. Expected format: "##-##"`);
      return false;
    }
    return true;
  },

  withRetry: async (fn, retries = MAX_RETRIES, delay = RETRY_DELAY_MS) => {
    try {
      return await fn();
    } catch (error) {
      if (retries <= 0) {
        console.error(`Max retries reached. Error: ${error.message}`);
        throw error;
      }
      console.warn(`Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      // Use the direct function reference to avoid circular dependency
      return resultsCheckerService.withRetry(fn, retries - 1, delay * 1.5);
    }
  },

  getYesterdaysPicks: async () => {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const formattedDate = yesterday.toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('daily_picks')
        .select('*')
        .eq('date', formattedDate)
        .single();
      if (error) {
        console.error("Error fetching yesterday's picks:", error);
        return { success: false, message: error.message };
      }
      if (!data || !data.picks || data.picks.length === 0) {
        return { success: false, message: 'No picks found for yesterday' };
      }
      return { success: true, data: data.picks, date: formattedDate, id: data.id };
    } catch (error) {
      console.error('Error in getYesterdaysPicks:', error);
      return { success: false, message: error.message };
    }
  },

  getGameScores: async (date, picks) => {
    try {
      if (!picks || picks.length === 0) {
        return { success: false, message: 'No picks provided' };
      }
      const scores = {};
      let missingGames = [];

      // 1. Perplexity primary
      try {
        // Use direct method call with proper reference
        const perplexityScores = await resultsCheckerService.getScoresFromPerplexity(date, picks);
        if (perplexityScores?.success && Object.keys(perplexityScores.scores || {}).length > 0) {
          Object.assign(scores, perplexityScores.scores);
          const foundPicks = new Set(Object.keys(scores));
          missingGames = picks.filter(pick => !foundPicks.has(pick.pick || pick.originalPick));
          if (missingGames.length === 0) {
            return { success: true, scores, missingGames: [] };
          }
        } else {
          missingGames = [...picks];
        }
      } catch (err) {
        console.error('Perplexity failed', err);
        missingGames = [...picks];
      }

      // 2. Ball Don't Lie for NBA
      if (missingGames.length > 0) {
        try {
          // Use the correct function name with proper capitalization
          const bdlScores = await ballDontLieService.getNbaGamesByDate(date);
          const remainingGames = [];
          for (const pick of missingGames) {
            const pickStr = pick.pick || pick.originalPick || '';
            const teamMatch = pickStr.match(/^([A-Za-z. ]+?)(?: [\-+]?\d+(\.\d+)?(?: [\-+\-]?\d+)?)?(?: [\-+]?\d+(\.\d+)?(?: [\-+\-]?\d+)?)?$/);
            if (!teamMatch || !teamMatch[1]) {
              remainingGames.push(pick);
              continue;
            }
            const teamName = teamMatch[1].trim();
            const league = (pick.league || 'NBA').toUpperCase();
            if (league === 'NBA' && bdlScores) {
              const gameKey = Object.keys(bdlScores).find(key =>
                key.toLowerCase().includes(teamName.toLowerCase())
              );
              if (gameKey) {
                scores[pick.pick || pick.originalPick] = {
                  ...bdlScores[gameKey],
                  league,
                  final: true
                };
                continue;
              }
            }
            remainingGames.push(pick);
          }
          missingGames = remainingGames;
        } catch (err) {
          console.error('BallDontLie failed', err);
        }
      }

      // 3. SportsDB for others
      if (missingGames.length > 0) {
        const remainingGames = [];
        for (const pick of missingGames) {
          const pickStr = pick.pick || pick.originalPick || '';
          const teamMatch = pickStr.match(/^([A-Za-z. ]+?)(?: [\-+]?\d+(\.\d+)?(?: [\-+\-]?\d+)?)?(?: [\-+]?\d+(\.\d+)?(?: [\-+\-]?\d+)?)?$/);
          if (!teamMatch?.[1]) {
            remainingGames.push(pick);
            continue;
          }
          const teamName = teamMatch[1].trim();
          const league = (pick.league || 'NBA').toUpperCase();
          try {
            // Use the correct function from sportsDbApiService
            const sportsDbScores = await sportsDbApiService.getEventsByDate(
              sportsDbApiService.leagueIds[league] || sportsDbApiService.leagueIds.NBA,
              date
            );
            if (sportsDbScores) {
              const gameKey = Object.keys(sportsDbScores).find(key =>
                key.toLowerCase().includes(teamName.toLowerCase())
              );
              if (gameKey) {
                scores[pick.pick || pick.originalPick] = {
                  home_team: gameKey.split(' @ ')[1] || 'Unknown',
                  away_team: gameKey.split(' @ ')[0] || 'Unknown',
                  home_score: sportsDbScores[gameKey].split('-')[1],
                  away_score: sportsDbScores[gameKey].split('-')[0],
                  league,
                  final: true
                };
                continue;
              }
            }
          } catch (err) {
            console.error('SportsDB failed', err);
          }
          remainingGames.push(pick);
        }
        missingGames = remainingGames;
      }

      // 4. Final Perplexity pass if still missing
      if (missingGames.length > 0) {
        try {
          console.log('Making final attempt with Perplexity for remaining games...');
          // Use the perplexityService reference to call the function correctly
          const perplexityPromises = missingGames.map(async pick => {
            try {
              // Extract team names if not explicitly provided
              const pickStr = pick.pick || pick.originalPick || '';
              let homeTeam = pick.home_team;
              let awayTeam = pick.away_team;
              const league = pick.league || 'NBA';
              
              if (!homeTeam || !awayTeam) {
                // Extract team names from the pick string if not provided
                const teamMatch = pickStr.match(/([A-Za-z. ]+)\s+(?:@|vs\.?)\s+([A-Za-z. ]+)/i);
                if (teamMatch && teamMatch.length >= 3) {
                  awayTeam = teamMatch[1].trim();
                  homeTeam = teamMatch[2].trim();
                } else {
                  // If can't extract both teams, use what we can find
                  const singleTeamMatch = pickStr.match(/^([A-Za-z. ]+)/i);
                  const pickTeam = singleTeamMatch ? singleTeamMatch[1].trim() : '';
                  
                  if (!homeTeam && !awayTeam) {
                    // If we don't have either, use the extracted team as both for searching
                    homeTeam = pickTeam;
                    awayTeam = pickTeam;
                  } else if (!homeTeam) {
                    homeTeam = pickTeam;
                  } else if (!awayTeam) {
                    awayTeam = pickTeam;
                  }
                }
              }
              
              console.log(`Looking up results for ${awayTeam} @ ${homeTeam} (${league})`);
              const result = await perplexityService.getScoresFromPerplexity(
                homeTeam, 
                awayTeam, 
                league, 
                date
              );
              
              return { 
                pick: pick.pick || pick.originalPick, 
                pickData: pick,
                result,
                processedTeams: { homeTeam, awayTeam, league }
              };
            } catch (err) {
              console.error(`Error getting scores for ${pick.pick || pick.originalPick}:`, err);
              return { pick: pick.pick || pick.originalPick, result: { success: false } };
            }
          });
          
          const perplexityResults = await Promise.all(perplexityPromises);
          const finalPerplexityScores = { success: true, scores: {} };
          
          perplexityResults.forEach(({ pick, pickData, result, processedTeams }) => {
            if (result && result.success && result.scores) {
              // Extract the score data
              const scores = result.scores;
              
              // Determine if the bet won by checking which team was picked
              let betResult = 'unknown';
              
              if (pickData) {
                const pickedTeam = pickData.pick?.split(/\s+/)[0] || '';
                const spreadMatch = pickData.pick?.match(/([+-]?\d+(\.\d+)?)/i);
                const hasSpread = spreadMatch && spreadMatch.length > 0;
                const spread = hasSpread ? parseFloat(spreadMatch[0]) : 0;
                
                // Check if we're dealing with a spread bet or moneyline
                if (hasSpread) {
                  // It's a spread bet
                  const isPicked = (team) => pickedTeam.toLowerCase().includes(team.toLowerCase());
                  let homeScore = parseInt(scores.home_score);
                  let awayScore = parseInt(scores.away_score);
                  
                  // Determine if home or away team was picked
                  if (isPicked(scores.home_team)) {
                    // Home team picked with spread
                    const adjustedScore = homeScore + spread;
                    if (adjustedScore > awayScore) {
                      betResult = 'won';
                    } else if (adjustedScore < awayScore) {
                      betResult = 'lost';
                    } else {
                      betResult = 'push';
                    }
                  } else if (isPicked(scores.away_team)) {
                    // Away team picked with spread
                    const adjustedScore = awayScore + spread;
                    if (adjustedScore > homeScore) {
                      betResult = 'won';
                    } else if (adjustedScore < homeScore) {
                      betResult = 'lost';
                    } else {
                      betResult = 'push';
                    }
                  }
                } else {
                  // It's a moneyline bet
                  const isPicked = (team) => pickedTeam.toLowerCase().includes(team.toLowerCase());
                  
                  if (isPicked(scores.home_team)) {
                    // Home team picked
                    betResult = scores.home_score > scores.away_score ? 'won' : 'lost';
                  } else if (isPicked(scores.away_team)) {
                    // Away team picked
                    betResult = scores.away_score > scores.home_score ? 'won' : 'lost';
                  }
                }
              }
              
              // Add the determined result to the scores object
              finalPerplexityScores.scores[pick] = {
                ...scores,
                result: betResult,
                final_score: `${scores.away_score}-${scores.home_score}`,
                processed_teams: processedTeams
              };
            }
          });
          
          if (finalPerplexityScores && finalPerplexityScores.success) {
            Object.assign(scores, finalPerplexityScores.scores || {});
            
            // Remove found games from missingGames
            Object.keys(finalPerplexityScores.scores || {}).forEach(foundPick => {
              const index = missingGames.findIndex(p => 
                (p.pick || p.originalPick) === foundPick
              );
              if (index !== -1) {
                missingGames.splice(index, 1);
              }
            });
          }
        } catch (finalError) {
          console.error('Final Perplexity attempt failed:', finalError);
        }
      }

      return {
        success: Object.keys(scores).length > 0 || missingGames.length === 0,
        scores,
        missingGames
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  },

  generatePerplexityQuery: (homeTeam, awayTeam, date) => {
    // Don't query if both teams are the same or if one is a placeholder
    if (homeTeam === awayTeam || homeTeam === "Opponent" || awayTeam === "Opponent") {
      return null;
    }
    
    // Format date for human-readability
    const gameDate = new Date(date);
    const month = gameDate.toLocaleString('default', { month: 'long' });
    const day = gameDate.getDate();
    const year = gameDate.getFullYear();
    const humanDate = `${month} ${day}, ${year}`;

    // Yesterday's date for recent games
    const yesterday = new Date(gameDate);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayMonth = yesterday.toLocaleString('default', { month: 'short' });
    const yesterdayDay = yesterday.getDate();

    return `ONLY FACTUAL INFO: What was the EXACT final score of the game between ${awayTeam} and ${homeTeam} on ${yesterdayMonth} ${yesterdayDay}, ${year}? Respond in this JSON format only: {"home_score": X, "away_score": Y, "home_team": "${homeTeam}", "away_team": "${awayTeam}"}`;
  },

  getScoresFromPerplexity: async (date, picks) => {
    const scores = {};

    // Process each pick
    for (const pick of picks) {
      const pickText = pick.pick || '';
      const league = pick.league || 'NHL'; // Default to NHL

      // Extract clean team name from formatted pick
      let teamName = '';
      
      // Extract teams from the pick if it has @ format
      const teams = pickText.split(' @ ');
      if (teams.length === 2) {
        // Use both teams for better query
        const homeTeam = teams[1].trim();
        const awayTeam = teams[0].trim();
        console.log(`Looking up results for ${awayTeam} @ ${homeTeam} (${league})`);
        
        // Create a focused query to get the final score
        const formattedDate = new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        const query = `ONLY FACTUAL INFO: What was the EXACT final score of the ${league} game between ${awayTeam} and ${homeTeam} on ${formattedDate}? Respond with JSON only: {"home_score": X, "away_score": Y, "home_team": "${homeTeam}", "away_team": "${awayTeam}"}`;
        
        try {
          const result = await perplexityService.fetchRealTimeInfo(query, {
            model: 'sonar',
            temperature: 0.1,
            maxTokens: 200
          });
          
          if (result) {
            // Try to extract JSON
            const jsonMatch = result.match(/\{[\s\S]*?\}/);
            if (jsonMatch) {
              try {
                const scoreData = JSON.parse(jsonMatch[0]);
                scores[pickText] = {
                  home_score: parseInt(scoreData.home_score),
                  away_score: parseInt(scoreData.away_score),
                  home_team: scoreData.home_team || homeTeam,
                  away_team: scoreData.away_team || awayTeam,
                  league,
                  final: true
                };
                continue; // Move to next pick if successful
              } catch (e) {
                console.error('Error parsing JSON from Perplexity response:', e);
              }
            }
          }
        } catch (error) {
          console.error(`Error with Perplexity API: ${error.message}`);
        }
      } else {
        // This is a formatted pick like "Team +1.5 -110"
        // Extract team name by removing betting elements
        teamName = pickText
          .replace(/\s+[+-]?\d+(\.\d+)?\s+[+-]\d+$/, '') // Remove spread and odds
          .replace(/\s+ML\s+[+-]\d+$/, '')               // Remove ML and odds
          .replace(/\s+[+-]\d+$/, '')                    // Remove just odds
          .replace(/\s+OVER\s+.*$/i, '')                 // Remove OVER
          .replace(/\s+UNDER\s+.*$/i, '')                // Remove UNDER
          .trim();
          
        console.log(`Extracted team name "${teamName}" from pick: ${pickText}`);
        
        // Create a query to find games involving this team
        const formattedDate = new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        const query = `ONLY FACTUAL INFO: What was the final score of the ${league} game involving ${teamName} on ${formattedDate}? Respond with JSON only: {"home_team": "Team Name", "away_team": "Opponent Name", "home_score": X, "away_score": Y}`;
        
        try {
          const result = await perplexityService.fetchRealTimeInfo(query, {
            model: 'sonar',
            temperature: 0.1,
            maxTokens: 200
          });
          
          if (result) {
            // Try to extract JSON
            const jsonMatch = result.match(/\{[\s\S]*?\}/);
            if (jsonMatch) {
              try {
                const scoreData = JSON.parse(jsonMatch[0]);
                // Verify the team we asked about is in the game
                const homeTeamMatches = scoreData.home_team.toLowerCase().includes(teamName.toLowerCase()) || 
                                       teamName.toLowerCase().includes(scoreData.home_team.toLowerCase());
                const awayTeamMatches = scoreData.away_team.toLowerCase().includes(teamName.toLowerCase()) || 
                                       teamName.toLowerCase().includes(scoreData.away_team.toLowerCase());
                
                if (homeTeamMatches || awayTeamMatches) {
                  scores[pickText] = {
                    home_score: parseInt(scoreData.home_score),
                    away_score: parseInt(scoreData.away_score),
                    home_team: scoreData.home_team,
                    away_team: scoreData.away_team,
                    league,
                    final: true
                  };
                } else {
                  console.warn(`Team mismatch: Asked about ${teamName} but got ${scoreData.home_team} vs ${scoreData.away_team}`);
                }
              } catch (e) {
                console.error('Error parsing JSON from Perplexity response:', e);
              }
            }
          }
        } catch (error) {
          console.error(`Error with Perplexity API: ${error.message}`);
        }
      }
    }

    return {
      success: Object.keys(scores).length > 0,
      scores
    };
  },

  processTeamPicks: (picks) => {
    const teamPicks = picks.map(pick => {
      const pickStr = pick.pick || '';
      const teamMatch = pickStr.match(/(?:^|vs\.?|@|vs?\s+)([A-Z][A-Za-z0-9\s.]+?)(?:\s*\+|\s*$)/);
      const teamName = teamMatch && teamMatch[1] ? teamMatch[1].trim() : '';
      return {
        ...pick,
        teamName,
        normalizedTeamName: teamName.toLowerCase().replace(/[^a-z0-9]/g, '')
      };
    }).filter(pick => pick.teamName);
    const picksByLeague = {};
    teamPicks.forEach(pick => {
      const league = pick.league || 'unknown';
      if (!picksByLeague[league]) picksByLeague[league] = [];
      picksByLeague[league].push(pick);
    });
    return picksByLeague;
  },

  getLeagueUrls: () => ({
    nba: [
      'https://www.nba.com/scores',
      'https://www.espn.com/nba/scoreboard'
    ],
    mlb: [
      'https://www.mlb.com/scores',
      'https://www.espn.com/mlb/scoreboard'
    ],
    nhl: [
      'https://www.nhl.com/scores',
      'https://www.espn.com/nhl/scoreboard'
    ],
    unknown: [
      'https://www.espn.com/nba/scoreboard',
      'https://www.espn.com/mlb/scoreboard',
      'https://www.espn.com/nhl/scoreboard'
    ]
  }),

  checkResults: async (date) => {
    try {
      console.log(`Checking results for date: ${date}`);
      const { data: dailyPicks, error: picksError } = await supabase
        .from('daily_picks')
        .select('*')
        .eq('date', date)
        .single();
      if (picksError) throw new Error(`Error fetching picks: ${picksError.message}`);
      if (!dailyPicks || !dailyPicks.picks || dailyPicks.picks.length === 0) {
        console.log(`No picks found for date: ${date}`);
        return { success: true, message: 'No picks found for this date', scores: {} };
      }
      
      console.log(`Found ${dailyPicks.picks.length} picks for ${date}`);
      const { success, scores, message } = await resultsCheckerService.getGameScores(date, dailyPicks.picks);
      if (!success) throw new Error(`Failed to get scores: ${message}`);
      
      console.log(`Retrieved scores for ${Object.keys(scores).length} games`);
      
      // Process each pick to determine win/loss/push based on scores and bet type
      const processedResults = [];
      
      for (const pick of dailyPicks.picks) {
        // Extract the team name from the pick by removing the bet type and odds
        // Example: "Washington Capitals +1.5 -185" becomes "Washington Capitals"
        // Example: "Dallas Stars ML +110" becomes "Dallas Stars"
        let teamName = '';
        
        if (pick.pick) {
          // Extract team name by removing bet type and odds
          teamName = pick.pick.replace(/\+?\d+(\.\d+)?\s+[-+]\d+$/, '').trim(); // Remove spread and odds
          teamName = teamName.replace(/\s+ML\s+[-+]\d+$/, '').trim(); // Remove ML and odds
          teamName = teamName.replace(/\s+[-+]\d+$/, '').trim(); // Remove just odds
          
          // Store the original team name for reference
          if (teamName !== pick.pick) {
            console.log(`Extracted team name "${teamName}" from pick: ${pick.pick}`);
            
            // Add team name to the pick object for easier matching
            pick.team_name = teamName;
          }
        }
        
        // Get the pick teams (homeTeam/awayTeam format) if available
        const pickTeams = pick.pick?.split(' @ ') || [];
        if (pickTeams.length !== 2 && !teamName && !pick.pick) {
          console.warn(`Invalid pick format: ${pick.pick}`);
          continue;
        }
        
        // Try to find the corresponding game score
        let scoreData = null;
        
        // First try direct match by pick
        if (scores[pick.pick]) {
          scoreData = scores[pick.pick];
        } else {
          // Try to find by team names in any order
          for (const [matchup, data] of Object.entries(scores)) {
            const homeTeam = data.home_team;
            const awayTeam = data.away_team;
            
            // Check if the extracted team name is part of either team in the matchup
            if (teamName && (homeTeam.includes(teamName) || awayTeam.includes(teamName) || 
                teamName.includes(homeTeam) || teamName.includes(awayTeam))) {
              console.log(`Found matching game for team "${teamName}": ${awayTeam} @ ${homeTeam}`);
              scoreData = data;
              break;
            }
            // Try traditional matching approaches as fallbacks
            else if ((pick.home_team === homeTeam && pick.away_team === awayTeam) ||
                (pickTeams.length === 2 && pickTeams[0] === awayTeam && pickTeams[1] === homeTeam) ||
                (matchup.includes(pick.home_team) && matchup.includes(pick.away_team))) {
              scoreData = data;
              break;
            }
          }
        }
        
        if (!scoreData) {
          console.warn(`Could not find score data for pick: ${pick.pick}`);
          continue;
        }

        console.log(`Analyzing pick ${pick.pick} with score data:`, scoreData);
        
        // Use the new analyzer to determine the result
        const pickWithId = { ...pick, id: dailyPicks.id };
        const analyzedResult = await pickResultsAnalyzer.analyzePickResult(pickWithId, scoreData);
        
        console.log(`PickResultsAnalyzer determined: ${analyzedResult.result} for pick: ${pick.pick}`);
        
        // Format the result for garyPerformanceService
        processedResults.push({
          pick: analyzedResult.matchup,
          original_pick: pick.pick,
          pickText: pick.pick,
          result: analyzedResult.result,
          score: analyzedResult.final_score,
          final_score: analyzedResult.final_score,
          league: analyzedResult.league,
          confidence: analyzedResult.confidence
        });
      }
      
      console.log(`Processed ${processedResults.length} results`);
      
      // Record the results in the performance service
      const { success: recordSuccess, message: recordMessage } = await garyPerformanceService.recordPickResults(
        date,
        processedResults
      );
      if (!recordSuccess) throw new Error(`Failed to record results: ${recordMessage}`);
      await garyPerformanceService.updatePerformanceStats(date);
      return {
        success: true,
        message: 'Results checked and recorded successfully',
        scores,
        pickCount: dailyPicks.picks.length,
        recorded: true
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        error: error.stack
      };
    }
  },

  startDailyResultsChecker: () => {
    // To be implemented
    return { success: true, message: 'Daily results checker started' };
  }
};

// Use named export only to avoid circular reference issues
