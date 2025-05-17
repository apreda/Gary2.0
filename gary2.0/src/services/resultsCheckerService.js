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
    
    // First try to get scores from TheSportsDB for comparison
    console.log('Getting scores from TheSportsDB for validation...');
    let sportsDbScores = {};
    
    try {
      const nhlResults = await sportsDbApiService.getGameResults('4380', date); // NHL league ID: 4380
      
      if (nhlResults && nhlResults.events) {
        nhlResults.events.forEach(game => {
          const matchup = `${game.strAwayTeam} @ ${game.strHomeTeam}`;
          sportsDbScores[matchup] = {
            home_team: game.strHomeTeam,
            away_team: game.strAwayTeam,
            home_score: parseInt(game.intHomeScore) || 0,
            away_score: parseInt(game.intAwayScore) || 0,
            league: 'NHL',
            final: game.strStatus === 'FT',
            source: 'TheSportsDB'
          };
          
          // Also index by teams individually for easier lookup
          sportsDbScores[game.strHomeTeam] = {
            home_team: game.strHomeTeam,
            away_team: game.strAwayTeam,
            home_score: parseInt(game.intHomeScore) || 0,
            away_score: parseInt(game.intAwayScore) || 0,
            league: 'NHL',
            final: game.strStatus === 'FT',
            source: 'TheSportsDB'
          };
          
          sportsDbScores[game.strAwayTeam] = {
            home_team: game.strHomeTeam,
            away_team: game.strAwayTeam,
            home_score: parseInt(game.intHomeScore) || 0,
            away_score: parseInt(game.intAwayScore) || 0,
            league: 'NHL',
            final: game.strStatus === 'FT',
            source: 'TheSportsDB'
          };
        });
        
        console.log(`Found ${Object.keys(sportsDbScores).length} games from TheSportsDB for validation`);
      }
    } catch (sportsDbError) {
      console.error('Error fetching from TheSportsDB:', sportsDbError.message);
    }

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
        
        // First check if we already have score data from TheSportsDB
        const matchupKey = `${awayTeam} @ ${homeTeam}`;
        if (sportsDbScores[matchupKey]) {
          console.log(`Found score in TheSportsDB for ${matchupKey}: ${sportsDbScores[matchupKey].away_score}-${sportsDbScores[matchupKey].home_score}`);
          scores[pickText] = sportsDbScores[matchupKey];
          continue;
        }
        
        // Check if we can find the home or away team individually
        if (sportsDbScores[homeTeam]) {
          console.log(`Found score in TheSportsDB for ${homeTeam}: ${sportsDbScores[homeTeam].away_score}-${sportsDbScores[homeTeam].home_score}`);
          scores[pickText] = sportsDbScores[homeTeam];
          continue;
        }
        
        if (sportsDbScores[awayTeam]) {
          console.log(`Found score in TheSportsDB for ${awayTeam}: ${sportsDbScores[awayTeam].away_score}-${sportsDbScores[awayTeam].home_score}`);
          scores[pickText] = sportsDbScores[awayTeam];
          continue;
        }
        
        // If we can't find scores in the database, use Perplexity as a fallback
        console.log(`No scores found in database for ${matchupKey}, using Perplexity as fallback`);
        
        // Create a focused query to get the final score
        const formattedDate = new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        const query = `What was the final score of the ${league} game: ${awayTeam} at ${homeTeam} on ${formattedDate}? Include the exact score for both teams. Do NOT add any explanation, just provide the team names and score.`;
        
        try {
          const result = await perplexityService.fetchRealTimeInfo(query, {
            model: 'sonar',
            temperature: 0.1,
            maxTokens: 150
          });
          
          if (result) {
            // Try to parse the result using regex
            const scorePattern = new RegExp(`(${awayTeam}|${homeTeam})\\s*(\\d+)[^\\d]+(\\d+)\\s*(${homeTeam}|${awayTeam})`, 'i');
            const scoreMatch = result.match(scorePattern);
            
            if (scoreMatch && scoreMatch.length >= 5) {
              // Determine which team is home and which is away
              const firstTeam = scoreMatch[1].trim();
              const secondTeam = scoreMatch[4].trim();
              
              const firstScore = parseInt(scoreMatch[2]);
              const secondScore = parseInt(scoreMatch[3]);
              
              let homeScore, awayScore;
              
              if (firstTeam.toLowerCase().includes(homeTeam.toLowerCase())) {
                homeScore = firstScore;
                awayScore = secondScore;
              } else {
                homeScore = secondScore;
                awayScore = firstScore;
              }
              
              scores[pickText] = {
                home_team: homeTeam,
                away_team: awayTeam,
                home_score: homeScore,
                away_score: awayScore,
                league,
                final: true,
                source: 'Perplexity'
              };
              
              console.log(`Successfully extracted score for ${awayTeam} @ ${homeTeam}: ${awayScore}-${homeScore}`);
            } else {
              console.error(`Could not find score pattern in Perplexity response: ${result}`);
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
        
        // First check if we already have score data from the database
        if (sportsDbScores[teamName]) {
          console.log(`Found score in TheSportsDB for ${teamName}: ${sportsDbScores[teamName].away_score}-${sportsDbScores[teamName].home_score}`);
          scores[pickText] = sportsDbScores[teamName];
          continue;
        }
        
        // If team isn't found directly, try a more lenient match
        const teamKeys = Object.keys(sportsDbScores);
        for (const key of teamKeys) {
          if (key.toLowerCase().includes(teamName.toLowerCase()) || 
              teamName.toLowerCase().includes(key.toLowerCase())) {
            console.log(`Found partial match in TheSportsDB for ${teamName} -> ${key}: ${sportsDbScores[key].away_score}-${sportsDbScores[key].home_score}`);
            scores[pickText] = sportsDbScores[key];
            break;
          }
        }
        
        // If we still don't have a match, use Perplexity as a fallback
        if (!scores[pickText]) {
          console.log(`No scores found in database for ${teamName}, using Perplexity as fallback`);
          
          // Create a query to find games involving this team
          const formattedDate = new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
          const query = `What was the final score of the ${league} game involving ${teamName} on ${formattedDate}? Include the names of both teams and their scores. Respond with only the team names and the score.`;
          
          try {
            const result = await perplexityService.fetchRealTimeInfo(query, {
              model: 'sonar',
              temperature: 0.1,
              maxTokens: 150
            });
            
            if (result) {
              // Try to find team names and scores with enhanced regex patterns
              // Try JSON format first
              let match = null;
              
              try {
                const jsonMatch = result.match(/\{[^\}]+\}/g);
                if (jsonMatch) {
                  const jsonData = JSON.parse(jsonMatch[0]);
                  if (jsonData.home_score !== undefined && jsonData.away_score !== undefined) {
                    return {
                      away_team: jsonData.away_team,
                      home_team: jsonData.home_team,
                      away_score: parseInt(jsonData.away_score),
                      home_score: parseInt(jsonData.home_score),
                      league,
                      final: true,
                      source: 'Perplexity JSON'
                    };
                  }
                }
              } catch (jsonError) {
                console.log('Not a valid JSON response, trying text patterns');
              }
              
              // Try multiple regex patterns to handle different formatting
              const patterns = [
                // Pattern 1: Team A 3 - 2 Team B
                /(\w[\w\s]+\w)\s+(\d+)\s*[-–]\s*(\d+)\s+(\w[\w\s]+\w)/i,
                
                // Pattern 2: Team A defeated Team B 3-2
                /(\w[\w\s]+\w)\s+(?:defeated|beat|won against)\s+(\w[\w\s]+\w)\s+(?:by a score of|with a score of|)\s*(\d+)\s*[-–]\s*(\d+)/i,
                
                // Pattern 3: The final score was Team A 3, Team B 2
                /(?:final score|score)\s+(?:was|:|is)?\s*(\w[\w\s]+\w)\s+(\d+)(?:,|\s+)\s*(\w[\w\s]+\w)\s+(\d+)/i
              ];
              
              // Try each pattern until we find a match
              for (const pattern of patterns) {
                const patternMatch = result.match(pattern);
                if (patternMatch && patternMatch.length >= 5) {
                  match = patternMatch;
                  break;
                }
              }
              
              // If no match yet, try a simpler pattern to just extract numbers
              if (!match) {
                const simpleScorePattern = /(\d+)\s*[-–]\s*(\d+)/i;
                const simpleMatch = result.match(simpleScorePattern);
                
                if (simpleMatch) {
                  // We found scores but not team names, use the teamName we have
                  const score1 = parseInt(simpleMatch[1]);
                  const score2 = parseInt(simpleMatch[2]);
                  
                  // We'll need to guess which team is home vs away
                  const keywords = result.toLowerCase();
                  const isTeamAway = keywords.includes('away') && keywords.includes(teamName.toLowerCase());
                  
                  if (isTeamAway) {
                    return {
                      away_team: teamName,
                      home_team: 'Opponent',
                      away_score: score1,
                      home_score: score2,
                      league,
                      final: true,
                      source: 'Perplexity Simple'
                    };
                  } else {
                    return {
                      away_team: 'Opponent',
                      home_team: teamName,
                      away_score: score2,
                      home_score: score1,
                      league,
                      final: true,
                      source: 'Perplexity Simple'
                    };
                  }
                }
              }
              
              if (match && match.length >= 5) {
                const teamA = match[1].trim();
                const teamB = match[4].trim();
                const scoreA = parseInt(match[2]);
                const scoreB = parseInt(match[3]);
                
                const isTeamAMatch = teamA.toLowerCase().includes(teamName.toLowerCase()) || 
                                     teamName.toLowerCase().includes(teamA.toLowerCase());
                                     
                if (isTeamAMatch) {
                  // If teamA matches our search team, determine if it's home or away
                  // For simplicity, we'll assume first mentioned team is away, second is home
                  // This is a common convention but not universal
                  scores[pickText] = {
                    away_team: teamA,
                    home_team: teamB,
                    away_score: scoreA,
                    home_score: scoreB,
                    league,
                    final: true,
                    source: 'Perplexity'
                  };
                } else {
                  // If teamB matches our search team
                  scores[pickText] = {
                    away_team: teamA,
                    home_team: teamB,
                    away_score: scoreA,
                    home_score: scoreB,
                    league,
                    final: true,
                    source: 'Perplexity'
                  };
                }
                
                console.log(`Successfully extracted score for ${teamName}: ${scores[pickText].away_team} ${scores[pickText].away_score} - ${scores[pickText].home_score} ${scores[pickText].home_team}`);
              } else {
                console.error(`Could not find score pattern in Perplexity response: ${result}`);
              }
            }
          } catch (error) {
            console.error(`Error with Perplexity API: ${error.message}`);
          }
        }
      }
    }
    
    // Log the final scores we've collected
    console.log('Final collected scores:', JSON.stringify(scores, null, 2));

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
