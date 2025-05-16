import { supabase } from '../supabaseClient.js';
import { createClient } from '@supabase/supabase-js';
import { garyPerformanceService } from './garyPerformanceService.js';
import { sportsDbApiService } from './sportsDbApiService.js';
import { ballDontLieService } from './ballDontLieService.js';
import { perplexityService } from './perplexityService.js';
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

  getScoresFromPerplexity: async (date, picks) => {
    try {
      if (!picks || picks.length === 0) {
        return { success: false, message: 'No picks provided' };
      }
      const formattedDate = new Date(date).toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      });
      const scores = {};
      const errors = [];
      for (const pick of picks) {
        try {
          const { home_team, away_team, league } = pick;
          if (!home_team || !away_team || !league) {
            errors.push(`Missing team or league info for pick: ${pick.pick}`);
            continue;
          }
          const response = await perplexityService.getScoresFromPerplexity(home_team, away_team, league, date);
          if (response.success && response.scores) {
            const pickKey = pick.pick || `${away_team} @ ${home_team}`;
            scores[pickKey] = response.scores;
          } else {
            errors.push(`API error for ${pick.pick}: ${response.error || 'Unknown error'}`);
          }
          await new Promise(resolve => setTimeout(resolve, 1500));
        } catch (error) {
          errors.push(`Error processing ${pick.pick || 'unknown pick'}: ${error.message}`);
        }
      }
      return {
        success: errors.length === 0 && Object.keys(scores).length > 0,
        scores,
        errors: errors.length > 0 ? errors : undefined
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        scores: {}
      };
    }
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
      const { data: dailyPicks, error: picksError } = await supabase
        .from('daily_picks')
        .select('*')
        .eq('date', date)
        .single();
      if (picksError) throw new Error(`Error fetching picks: ${picksError.message}`);
      if (!dailyPicks || !dailyPicks.picks || dailyPicks.picks.length === 0) {
        return { success: true, message: 'No picks found for this date', scores: {} };
      }
      const { success, scores, message } = await resultsCheckerService.getGameScores(date, dailyPicks.picks);
      if (!success) throw new Error(`Failed to get scores: ${message}`);
      
      // Process scores into the format expected by garyPerformanceService
      const processedResults = Object.entries(scores).map(([matchup, scoreData]) => {
        const homeScore = scoreData.home_score;
        const awayScore = scoreData.away_score;
        const homeTeam = scoreData.home_team;
        const awayTeam = scoreData.away_team;
        
        // Find the original pick to determine if it was won or lost
        const originalPick = dailyPicks.picks.find(p => 
          p.pick === matchup || 
          (p.home_team === homeTeam && p.away_team === awayTeam)
        );
        
        // Determine win/loss based on the bet type and scores
        let result = 'unknown';
        if (originalPick) {
          // For moneyline bets
          if (originalPick.type === 'moneyline') {
            // If the pick was for the home team
            if (originalPick.pick.includes(homeTeam)) {
              result = homeScore > awayScore ? 'won' : 'lost';
            } 
            // If the pick was for the away team
            else if (originalPick.pick.includes(awayTeam)) {
              result = awayScore > homeScore ? 'won' : 'lost';
            }
          }
          // For spread bets
          else if (originalPick.type === 'spread' && originalPick.spread) {
            const spread = parseFloat(originalPick.spread);
            if (originalPick.pick.includes(homeTeam)) {
              const adjScore = homeScore + spread;
              result = adjScore > awayScore ? 'won' : (adjScore === awayScore ? 'push' : 'lost');
            }
            else if (originalPick.pick.includes(awayTeam)) {
              const adjScore = awayScore + spread;
              result = adjScore > homeScore ? 'won' : (adjScore === homeScore ? 'push' : 'lost');
            }
          }
        }
        
        return {
          pick: `${awayTeam} @ ${homeTeam}`,
          result: result,
          score: `${awayScore}-${homeScore}`,
          league: scoreData.league || originalPick?.league || 'NBA'
        };
      });
      
      const { success: recordSuccess, message: recordMessage } = await garyPerformanceService.recordPickResults(
        date,
        Object.entries(scores).map(([matchup, score]) => ({
          pick: `${score.away_team} @ ${score.home_team}`,
          result: score.result || 'unknown',
          score: `${score.away_score}-${score.home_score}`,
          league: score.league || 'NBA'
        }))
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
