import { supabase } from '../supabaseClient';
import { createClient } from '@supabase/supabase-js';
import { garyPerformanceService } from './garyPerformanceService';
import { sportsDbApiService } from './sportsDbApiService';
import { ballDontLieService } from './ballDontLieService';
import { perplexityService } from './perplexityService';
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

const resultsCheckerService = {
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
          const bdlScores = await ballDontLieService.getGamesByDate(date);
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
            const sportsDbScores = await sportsDbApiService.getScores(date, league);
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
          const finalPerplexityScores = await resultsCheckerService.getScoresFromPerplexity(date, missingGames);
          
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
          if (!pick.pick) continue;
          const teamMatch = pick.pick.match(/([\w\s]+)(?:\s+[-+]?\d+\.?\d*|ML|\+\d+)?(?:\s+vs\.?\s+|\s+at\s+|\s+@\s+)([\w\s]+)/i);
          let team1 = '', team2 = '';
          if (teamMatch && teamMatch.length >= 3) {
            team1 = teamMatch[1].trim();
            team2 = teamMatch[2].trim();
          } else {
            team1 = pick.pick;
          }
          let searchQuery = `What was the final score for ${team1}`;
          if (team2) searchQuery += ` vs ${team2}`;
          searchQuery += ` on ${formattedDate}? Only respond with the score in format "AwayScore-HomeScore" if found.`;
          const response = await perplexityService.search(searchQuery, {
            maxTokens: 50, temperature: 0.1
          });
          if (response.success && response.data) {
            const scoreMatch = response.data.match(/(\d+)-(\d+)/);
            if (scoreMatch) {
              const [_, awayScore, homeScore] = scoreMatch;
              const score = parseInt(awayScore) > parseInt(homeScore)
                ? `${awayScore}-${homeScore}`
                : `${homeScore}-${awayScore}`;
              scores[pick.pick] = score;
            } else {
              errors.push(`No score found for ${pick.pick}`);
            }
          } else {
            errors.push(`API error for ${pick.pick}: ${response.error}`);
          }
          await new Promise(resolve => setTimeout(resolve, 1500));
        } catch (error) {
          errors.push(`Error processing ${pick.pick || 'unknown pick'}: ${error.message}`);
        }
      }
      return {
        success: errors.length === 0,
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
      const { success: recordSuccess, message: recordMessage } = await garyPerformanceService.recordPickResults(
        date,
        Object.entries(scores).map(([matchup, score]) => ({
          pick: `${score.away_team} @ ${score.home_team}`,
          result: score.final ? 'won' : 'lost',
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

export default resultsCheckerService;
