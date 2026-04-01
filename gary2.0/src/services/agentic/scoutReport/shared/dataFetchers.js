/**
 * shared/dataFetchers.js
 * Core data fetching functions used by ALL sports in scout report generation.
 */

import { ballDontLieService } from '../../../ballDontLieService.js';
import { fetchNbaInjuriesForGame } from '../../../nbaInjuryReportService.js';
import axios from 'axios';
import { nflSeason, formatSeason } from '../../../../utils/dateUtils.js';
import {
  seasonForSport,
  playerNamesMatch,
  getInjuryStatusFromMap,
  isPlayerOutFromMap,
  findTeamInStandings,
  normalizeSport,
  sportToBdlKey,
  findTeam,
  formatStreak,
  escapeRegex
} from './utilities.js';
import { getGeminiClient, groundingSearch, geminiGroundingSearch } from './grounding.js';

// ============================================================================
// TEAM PROFILE FUNCTIONS
// ============================================================================

export async function fetchTeamProfile(teamName, sport) {
  try {
    const bdlSport = sportToBdlKey(sport);
    if (!bdlSport) return createEmptyProfile(teamName);
    
    // Get team data
    const teams = await ballDontLieService.getTeams(bdlSport);
    const team = findTeam(teams, teamName);
    if (!team) return createEmptyProfile(teamName);
    
    // Calculate current season dynamically
    const currentSeason = seasonForSport(sport);
    
    // Get season stats
    let seasonStats = await ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: team.id, season: currentSeason, postseason: false });
    
    // NCAAF: BDL returns an array of stats, extract the team's stats object
    // The array may contain stats for the specific team we queried
    if (bdlSport === 'americanfootball_ncaaf' && Array.isArray(seasonStats)) {
      if (seasonStats.length > 0) {
        // Find the stats for our team (in case multiple returned) or use first
        const teamStats = seasonStats.find(s => s.team?.id === team.id) || seasonStats[0];
        seasonStats = teamStats;
        // Log actual NCAAF fields (BDL doesn't have PPG for NCAAF)
        console.log(`[Scout Report] NCAAF ${teamName} season stats:`, 
          `Pass YPG=${seasonStats.passing_yards_per_game || 'N/A'}, ` +
          `Rush YPG=${seasonStats.rushing_yards_per_game || 'N/A'}`);
      } else {
        seasonStats = null;
        console.log(`[Scout Report] NCAAF ${teamName} - no team season stats from BDL`);
      }
    }
    
    // Fetch standings - NCAAB and NCAAF require conference_id from the team data
    let standings = [];
    let teamStanding = null;
    if (bdlSport === 'basketball_ncaab') {
      // NCAAB: Use dedicated getNcaabStandings method which handles the API correctly
      if (team.conference_id) {
        console.log(`[Scout Report] Fetching NCAAB standings for ${teamName} (conference_id: ${team.conference_id})`);
        standings = await ballDontLieService.getNcaabStandings(team.conference_id, currentSeason);
        teamStanding = standings?.find(s => s.team?.id === team.id || s.team?.name === teamName);
      }
    } else if (bdlSport === 'americanfootball_ncaaf') {
      // NCAAF: Requires conference_id - get from team.conference field
      const conferenceId = team.conference;
      if (conferenceId) {
        try {
          console.log(`[Scout Report] Fetching NCAAF standings for ${teamName} (conference: ${conferenceId})`);
          const standingsData = await ballDontLieService.getStandingsGeneric(bdlSport, { 
            conference_id: conferenceId, 
            season: currentSeason 
          });
          standings = standingsData || [];
          teamStanding = standings?.find(s => s.team?.id === team.id || s.team?.full_name === teamName);
          if (teamStanding) {
            // BDL can return null for 0 losses/wins - coerce to 0
            const w = teamStanding.wins ?? 0;
            const l = teamStanding.losses ?? 0;
            console.log(`[Scout Report] NCAAF ${teamName} standings: ${w}-${l}`);
          }
        } catch (e) {
          console.warn(`[Scout Report] NCAAF standings fetch failed for ${teamName}:`, e.message);
        }
      }
    } else {
      // NBA, NHL, NFL - no conference_id needed
      standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season: currentSeason });
      teamStanding = standings?.find(s => s.team?.id === team.id || s.team?.name === teamName);
    }
    
    // BDL standings return wins/losses separately, not as "overall_record"
    // Use BDL as primary source, Gemini grounding as fallback when BDL fails
    // Note: BDL may return null for 0 wins/losses, so use ?? to coerce to 0
    let record = 'N/A';
    let homeRecord = teamStanding?.home_record || 'N/A';
    let awayRecord = teamStanding?.road_record || 'N/A';
    let conferenceRecord = teamStanding?.conference_record || 'N/A';
    
    // Try BDL first - check that wins exists (can be 0, which is falsy but valid)
    const standingWins = teamStanding?.wins;
    const standingLosses = teamStanding?.losses;
    const statsWins = seasonStats?.wins;
    const statsLosses = seasonStats?.losses;
    
    const isNHL = sport === 'NHL' || bdlSport === 'icehockey_nhl';
    
    if (standingWins !== undefined || standingLosses !== undefined) {
      // Use ?? to coerce null to 0 (BDL returns null for teams with 0 losses)
      if (isNHL) {
        const otLosses = teamStanding?.ot_losses ?? 0;
        record = `${standingWins ?? 0}-${standingLosses ?? 0}-${otLosses}`;
      } else {
        record = `${standingWins ?? 0}-${standingLosses ?? 0}`;
      }
      console.log(`[Scout Report] ${teamName} record from BDL standings: ${record}, conf: ${conferenceRecord}`);
    } else if (statsWins !== undefined || statsLosses !== undefined) {
      if (isNHL) {
        const otLosses = seasonStats?.ot_losses ?? 0;
        record = `${statsWins ?? 0}-${statsLosses ?? 0}-${otLosses}`;
      } else {
        record = `${statsWins ?? 0}-${statsLosses ?? 0}`;
      }
      console.log(`[Scout Report] ${teamName} record from BDL season stats: ${record}`);
    }
    
    // No grounding fallback — if BDL doesn't have the record, surface the gap
    if (record === 'N/A') {
      console.warn(`[Scout Report] ⚠️ ${teamName} record unavailable from BDL — check standings API. Returning N/A.`);
    }
    
    return {
      name: teamName,
      record,
      homeRecord,
      awayRecord,
      conferenceRecord,
      streak: formatStreak(teamStanding),
      seasonStats: seasonStats,
      standing: teamStanding,
    };
  } catch (error) {
    console.warn(`[Scout Report] Error fetching profile for ${teamName}:`, error.message);
    return createEmptyProfile(teamName);
  }
}

/**
 * Create empty profile for missing data
 */
export function createEmptyProfile(teamName) {
  return {
    name: teamName,
    record: 'N/A',
    homeRecord: 'N/A',
    awayRecord: 'N/A',
    streak: 'N/A',
    seasonStats: null,
    standing: null
  };
}

// ============================================================================
// RECENT GAMES & REST FUNCTIONS
// ============================================================================

export async function fetchRecentGames(teamName, sport, count = 5) {
  try {
    const bdlSport = sportToBdlKey(sport);
    if (!bdlSport) return [];
    
    const teams = await ballDontLieService.getTeams(bdlSport);
    const team = findTeam(teams, teamName);
    if (!team) return [];
    
    // Build params based on sport - NFL/NCAAF/NHL/NCAAB use seasons[], NBA uses date range
    // Per BDL API docs: NFL/NHL games endpoint does NOT support start_date/end_date (documented for NBA)
    // NCAAB switched to seasons param to fetch full season (needed for Season/L10/L5 home/away splits)
    const usesSeasonParam = bdlSport === 'americanfootball_nfl' ||
                           bdlSport === 'americanfootball_ncaaf' ||
                           bdlSport === 'icehockey_nhl' ||
                           bdlSport === 'basketball_ncaab';
    
    let params;
    if (usesSeasonParam) {
      // NFL/NCAAF/NHL/NCAAB: Use seasons parameter
      const season = seasonForSport(sport);
      params = {
        team_ids: [team.id],
        seasons: [season],
        per_page: 100  // NHL plays 82 games; 100 covers full season for all sports
      };
    } else {
      // NBA/etc: Use date range filtering
      const today = new Date();
      const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      params = {
        team_ids: [team.id],
        start_date: thirtyDaysAgo.toISOString().split('T')[0],
        end_date: today.toISOString().split('T')[0],
        per_page: 20
      };
    }
    
    const recentGames = await ballDontLieService.getGames(bdlSport, params);
    
    // Sort by date descending and return the requested count
    // For sports with season fetch, also filter to only completed games
    const today = new Date();
    const sorted = (recentGames || [])
      .filter(g => {
        const rawDate = g.date || g.datetime;
        const hasDate = !!rawDate;
        const gameDateStr = (rawDate || '').split('T')[0];
        const todayStr = today.toISOString().split('T')[0];
        const isPast = gameDateStr < todayStr;
        if (usesSeasonParam) {
          const status = (g.status || '').toLowerCase();
          const isFinished = status === 'final' || status === 'post' || status === 'off';
          return hasDate && (isPast || isFinished);
        }
        return hasDate && isPast;
      })
      .sort((a, b) => {
        const dateA = new Date(a.date || a.datetime);
        const dateB = new Date(b.date || b.datetime);
        return dateB - dateA;
      })
      .slice(0, count);
    
    return sorted;
  } catch (error) {
    console.warn(`[Scout Report] Error fetching recent games for ${teamName}:`, error.message);
    return [];
  }
}

/**
 * Calculate rest situation for a team based on recent games
 * Returns object with days rest, back-to-back status, and whether last game was home/away
 * @param {Array} recentGames - Recent games for the team
 * @param {string} gameDate - The upcoming game date
 * @param {string} teamName - The team name (to determine if last game was home or away)
 */
export function calculateRestSituation(recentGames, gameDate, teamName = null) {
  if (!recentGames || recentGames.length === 0) {
    console.log('[Rest Calc] No recent games available');
    return { daysRest: null, isBackToBack: false, lastGameDate: null, lastGameWasHome: null };
  }
  
  // Parse the game date (the upcoming game) - use US Eastern time for NBA games
  const upcoming = gameDate ? new Date(gameDate) : new Date();
  // Convert to Eastern time to get correct date (avoids UTC midnight rollover issues)
  const upcomingDateStr = upcoming.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD format
  
  // Parse games and their dates
  // NOTE: BDL stores game dates in UTC, so late-night EST games (7:30PM+) may be stored as the NEXT day
  // Example: Dec 18 7:30PM EST = Dec 19 12:30AM UTC = stored as "2025-12-19"
  // We need to include completed games from "today" that actually happened last night
  const gamesWithDates = recentGames
    .filter(g => g.date || g.datetime)
    .map(g => {
      // BDL may return date as full ISO timestamp (e.g., "2025-12-20T05:00:00.000Z") or just "YYYY-MM-DD"
      let rawDate = g.date || g.datetime;
      const dateStr = rawDate ? rawDate.split('T')[0] : null;
      // Check if game has completed (has scores)
      const homeScore = g.home_team_score || 0;
      const awayScore = g.visitor_team_score || 0;
      const hasCompleted = homeScore > 0 || awayScore > 0;
      return {
        ...g,
        dateStr,
        gameDate: new Date(dateStr + 'T12:00:00'), // Noon to avoid timezone issues
        hasCompleted
      };
    })
    .filter(g => {
      if (!g.dateStr) return false;
      // Include games from dates strictly before today
      if (g.dateStr < upcomingDateStr) return true;
      // Also include completed games from "today" (these are actually last night's late games in EST)
      if (g.dateStr === upcomingDateStr && g.hasCompleted) {
        console.log(`[Rest Calc] Including completed game from ${g.dateStr} (late-night EST game stored in UTC)`);
        return true;
      }
      return false;
    })
    .sort((a, b) => b.gameDate - a.gameDate); // Most recent first
  
  if (gamesWithDates.length === 0) {
    console.log('[Rest Calc] No completed games found before', upcomingDateStr);
    return { daysRest: null, isBackToBack: false, lastGameDate: null };
  }
  
  const lastGame = gamesWithDates[0];
  console.log(`[Rest Calc] Last game: ${lastGame.dateStr}, Upcoming: ${upcomingDateStr}`);
  
  // Calculate days between using date strings to avoid timezone issues
  const lastDate = new Date(lastGame.dateStr + 'T12:00:00');
  const upcomingDate = new Date(upcomingDateStr + 'T12:00:00');
  const diffTime = upcomingDate.getTime() - lastDate.getTime();
  const daysRest = Math.round(diffTime / (1000 * 60 * 60 * 24));
  
  // Back-to-back = played yesterday (1 day gap)
  const isBackToBack = daysRest <= 1;
  
  // Determine if last game was home or away for this team
  // Match team name to the home_team in the game record
  let lastGameWasHome = null;
  if (teamName && lastGame) {
    const homeTeamName = lastGame.home_team?.name || lastGame.home_team?.full_name || '';
    const teamNameLower = teamName.toLowerCase();
    const homeNameLower = homeTeamName.toLowerCase();
    // Match by last word (e.g., "Celtics" from "Boston Celtics")
    const teamLastWord = teamNameLower.split(' ').pop();
    const homeLastWord = homeNameLower.split(' ').pop();
    lastGameWasHome = teamLastWord === homeLastWord || 
                      homeNameLower.includes(teamLastWord) || 
                      teamNameLower.includes(homeLastWord);
    console.log(`[Rest Calc] Last game was ${lastGameWasHome ? 'HOME' : 'ROAD'} for ${teamName}`);
  }
  
  // Check for 3 games in 4 days (heavy schedule)
  const fourDaysAgo = new Date(upcomingDate);
  fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);
  const recentGamesInWindow = gamesWithDates.filter(g => g.gameDate >= fourDaysAgo);
  const gamesInLast4Days = recentGamesInWindow.length;
  const isHeavySchedule = gamesInLast4Days >= 3;
  
  // Check for 4 games in 5 days
  const fiveDaysAgo = new Date(upcomingDate);
  fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
  const gamesInLast5Days = gamesWithDates.filter(g => g.gameDate >= fiveDaysAgo).length;
  const isVeryHeavySchedule = gamesInLast5Days >= 4;
  
  console.log(`[Rest Calc] Days rest: ${daysRest}, Back-to-back: ${isBackToBack}, Games in 4 days: ${gamesInLast4Days}`);
  
  return {
    daysRest,
    isBackToBack,
    isHeavySchedule,
    isVeryHeavySchedule,
    gamesInLast4Days,
    gamesInLast5Days,
    lastGameDate: lastGame.gameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    lastGameWasHome
  };
}

/**
 * Format rest situation for scout report
 * FACTUAL OUTPUT ONLY - no commentary, emojis, or editorial (Gary interprets)
 */
export function formatRestSituation(homeTeam, awayTeam, homeRest, awayRest) {
  const formatTeamRest = (team, rest, isHomeTeam) => {
    if (!rest || rest.daysRest === null) {
      return `${team}: Rest data unavailable`;
    }
    
    const parts = [];
    
    // Days of rest (simple number)
    parts.push(`${rest.daysRest} days rest`);
    
    // Back-to-back status with home/away context
    if (rest.isBackToBack) {
      // For B2B, note where they played last (important for fatigue assessment)
      // Tonight's game location is known (isHomeTeam), last game location we track
      const lastGameLocation = rest.lastGameWasHome === true ? 'at home' : 
                               rest.lastGameWasHome === false ? 'on road' : '';
      parts.push(`On B2B - played ${lastGameLocation} ${rest.lastGameDate}`.trim());
    }
    
    // Heavy schedule context (factual)
    if (rest.isVeryHeavySchedule) {
      parts.push(`${rest.gamesInLast5Days} games in 5 nights`);
    } else if (rest.isHeavySchedule) {
      parts.push(`${rest.gamesInLast4Days} games in 4 nights`);
    }
    
    return `• ${team}: ${parts.join('. ')}`;
  };
  
  return `${formatTeamRest(homeTeam, homeRest, true)}
${formatTeamRest(awayTeam, awayRest, false)}`;
}

/**
 * Format recent form (simple — used by non-NBA sports)
 */
export function formatRecentForm(teamName, recentGames, count = 5) {
  if (!recentGames || recentGames.length === 0) {
    return `• ${teamName}: Recent games unavailable`;
  }

  let wins = 0, losses = 0;

  // Filter to only completed games (have scores > 0)
  const completedGames = recentGames.filter(game => {
    const homeScore = game.home_team_score ?? game.home_score ?? 0;
    const awayScore = game.visitor_team_score ?? game.away_score ?? 0;
    return homeScore > 0 || awayScore > 0; // At least one team scored
  });

  if (completedGames.length === 0) {
    return `• ${teamName}: No recent completed games`;
  }

  const results = completedGames.slice(0, count).map(game => {
    // Determine if this team was home or away
    const homeTeamName = game.home_team?.name || game.home_team?.full_name || '';
    const awayTeamName = game.visitor_team?.name || game.visitor_team?.full_name || game.away_team?.name || game.away_team?.full_name || '';
    const isHome = homeTeamName.toLowerCase().includes(teamName.toLowerCase().split(' ').pop()) ||
                   teamName.toLowerCase().includes(homeTeamName.toLowerCase().split(' ').pop());

    const teamScore = isHome ? (game.home_team_score ?? game.home_score ?? 0) : (game.visitor_team_score ?? game.away_team_score ?? game.away_score ?? 0);
    const oppScore = isHome ? (game.visitor_team_score ?? game.away_team_score ?? game.away_score ?? 0) : (game.home_team_score ?? game.home_score ?? 0);
    const oppName = isHome ? awayTeamName : homeTeamName;

    // Skip if opponent name is empty or same as team
    if (!oppName || oppName.toLowerCase().includes(teamName.toLowerCase().split(' ').pop())) {
      return null;
    }

    if (teamScore > oppScore) {
      wins++;
      return `W vs ${oppName} (${teamScore}-${oppScore})`;
    } else {
      losses++;
      return `L vs ${oppName} (${teamScore}-${oppScore})`;
    }
  }).filter(r => r !== null);

  const shown = Math.min(completedGames.length, count);
  return `• ${teamName}: ${wins}-${losses} last ${shown}
  ${results.slice(0, count).join(' | ')}`;
}

/**
 * Fetch NBA box scores for a set of games.
 * Returns a map of dateKey (YYYY-MM-DD) → boxScore object.
 * Each boxScore has .home_team_stats[] and .away_team_stats[] with player lines.
 */
export async function fetchNbaBoxScoresForGames(games) {
  const boxScoreMap = {};
  if (!games || games.length === 0) return boxScoreMap;

  // Deduplicate by date to avoid redundant API calls
  const dateKeys = [...new Set(games.map(g => (g.date || g.datetime || '').split('T')[0]).filter(Boolean))];

  await Promise.all(dateKeys.map(async (dateKey) => {
    try {
      const boxScores = await ballDontLieService.getNbaBoxScores(dateKey, 30);
      if (boxScores && boxScores.length > 0) {
        // Store all box scores for this date — we'll match by team later
        boxScoreMap[dateKey] = boxScores;
      }
    } catch (e) {
      console.warn(`[Scout Report] Box score fetch failed for ${dateKey}: ${e.message}`);
    }
  }));

  return boxScoreMap;
}

/**
 * Find the box score matching a specific game from the date's box scores.
 */
function findMatchingBoxScore(boxScoresForDate, game) {
  if (!boxScoresForDate || !Array.isArray(boxScoresForDate)) return null;
  const gameHomeId = game.home_team?.id || game.home_team_id;
  const gameAwayId = game.visitor_team?.id || game.away_team?.id || game.visitor_team_id || game.away_team_id;
  return boxScoresForDate.find(bs => {
    const bsHomeId = bs.game?.home_team?.id || bs.home_team?.id;
    const bsAwayId = bs.game?.visitor_team?.id || bs.visitor_team?.id || bs.game?.away_team?.id || bs.away_team?.id;
    return (bsHomeId === gameHomeId && bsAwayId === gameAwayId) ||
           (bsHomeId === gameAwayId && bsAwayId === gameHomeId);
  });
}

/**
 * Format full box score for one team.
 * Returns all players who played (sorted by min desc) + DNP list.
 * @param {Array} playerStats - array of player stat objects from BDL box score
 * @param {string} indent - whitespace prefix for each line
 * @returns {string[]} array of formatted lines
 */
function formatBoxScoreLines(playerStats, indent = '    ') {
  if (!playerStats || playerStats.length === 0) return [];

  const lines = [];
  const played = [];
  const dnp = [];

  for (const p of playerStats) {
    const name = `${p.player?.first_name?.[0] || '?'}. ${p.player?.last_name || '?'}`;
    const minRaw = p.min || '0:00';
    const didPlay = minRaw !== '0:00' && minRaw !== '00:00' && minRaw !== 0 && minRaw !== '0';
    if (didPlay) {
      played.push({ name, pts: p.pts || 0, reb: p.reb || 0, ast: p.ast || 0, min: minRaw });
    } else {
      dnp.push(name);
    }
  }

  // Sort by minutes desc (parse "MM:SS" to total seconds for sorting)
  played.sort((a, b) => {
    const parseMin = m => { const parts = String(m).split(':'); return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0); };
    return parseMin(b.min) - parseMin(a.min);
  });

  if (played.length > 0) {
    lines.push(`${indent}${played.map(p => `${p.name} ${p.pts}p/${p.reb}r/${p.ast}a/${p.min}min`).join(', ')}`);
  }
  if (dnp.length > 0) {
    lines.push(`${indent}DNP: ${dnp.join(', ')}`);
  }

  return lines;
}

/**
 * Fetch NHL box scores for a set of games.
 * NHL box scores are flat (one entry per player), so we group by game date + team.
 * Returns a map of dateKey → { homePlayerStats: [], awayPlayerStats: [], homeTeamId, awayTeamId }
 */
export async function fetchNhlBoxScoresForGames(games) {
  const boxScoreMap = {};
  if (!games || games.length === 0) return boxScoreMap;

  const dateKeys = [...new Set(games.map(g => (g.date || g.datetime || '').split('T')[0]).filter(Boolean))];
  if (dateKeys.length === 0) return boxScoreMap;

  try {
    const allEntries = await ballDontLieService.getNhlRecentBoxScores(dateKeys);
    if (!allEntries || allEntries.length === 0) return boxScoreMap;

    // Group entries by game date + home/away team
    for (const entry of allEntries) {
      const dateKey = (entry.game?.game_date || '').split('T')[0];
      if (!dateKey) continue;

      const gameHomeId = entry.game?.home_team?.id;
      const gameAwayId = entry.game?.away_team?.id;
      const playerTeamId = entry.team?.id;

      // Create a composite key: date + homeId + awayId
      const gameKey = `${dateKey}_${gameHomeId}_${gameAwayId}`;
      if (!boxScoreMap[gameKey]) {
        boxScoreMap[gameKey] = { homePlayerStats: [], awayPlayerStats: [], homeTeamId: gameHomeId, awayTeamId: gameAwayId, dateKey };
      }

      if (playerTeamId === gameHomeId) {
        boxScoreMap[gameKey].homePlayerStats.push(entry);
      } else if (playerTeamId === gameAwayId) {
        boxScoreMap[gameKey].awayPlayerStats.push(entry);
      }
    }
  } catch (e) {
    console.warn(`[Scout Report] NHL box score fetch failed: ${e.message}`);
  }

  return boxScoreMap;
}

/**
 * Find the NHL box score matching a specific game from the grouped map.
 */
function findMatchingNhlBoxScore(boxScoreMap, game) {
  if (!boxScoreMap) return null;
  const dateKey = (game.date || game.datetime || '').split('T')[0];
  const gameHomeId = game.home_team?.id || game.home_team_id;
  const gameAwayId = game.visitor_team?.id || game.away_team?.id || game.visitor_team_id || game.away_team_id;

  // Try exact match first
  const exactKey = `${dateKey}_${gameHomeId}_${gameAwayId}`;
  if (boxScoreMap[exactKey]) return boxScoreMap[exactKey];

  // Try reversed (BDL might have different team ID assignment)
  const reversedKey = `${dateKey}_${gameAwayId}_${gameHomeId}`;
  if (boxScoreMap[reversedKey]) return { ...boxScoreMap[reversedKey], reversed: true };

  return null;
}

/**
 * Format full NHL box score for one team.
 * NHL stats: goals/assists/points/shots/TOI instead of pts/reb/ast/min.
 */
function formatNhlBoxScoreLines(playerStats, indent = '    ') {
  if (!playerStats || playerStats.length === 0) return [];

  const lines = [];
  const played = [];
  const dnp = [];

  for (const p of playerStats) {
    const name = `${p.player?.first_name?.[0] || '?'}. ${p.player?.last_name || '?'}`;
    const toi = p.time_on_ice || '0:00';
    const didPlay = toi !== '0:00' && toi !== '00:00' && toi !== 0 && toi !== '0';
    if (didPlay) {
      played.push({
        name,
        goals: p.goals || 0,
        assists: p.assists || 0,
        points: p.points || 0,
        sog: p.shots_on_goal || 0,
        toi
      });
    } else {
      dnp.push(name);
    }
  }

  // Sort by TOI desc
  played.sort((a, b) => {
    const parseToi = t => { const parts = String(t).split(':'); return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0); };
    return parseToi(b.toi) - parseToi(a.toi);
  });

  if (played.length > 0) {
    lines.push(`${indent}${played.map(p => `${p.name} ${p.goals}g/${p.assists}a/${p.points}pts/${p.sog}sog/${p.toi}toi`).join(', ')}`);
  }
  if (dnp.length > 0) {
    lines.push(`${indent}DNP: ${dnp.join(', ')}`);
  }

  return lines;
}

/**
 * Format recent form with box scores (NBA-specific).
 * Shows W/L, score, and full box score per game.
 */
export function formatRecentFormWithBoxScores(teamName, recentGames, boxScoreMap, count = 3) {
  if (!recentGames || recentGames.length === 0) {
    return `${teamName}: Recent games unavailable`;
  }

  let wins = 0, losses = 0;

  const completedGames = recentGames.filter(game => {
    const homeScore = game.home_team_score ?? game.home_score ?? 0;
    const awayScore = game.visitor_team_score ?? game.away_score ?? 0;
    return homeScore > 0 || awayScore > 0;
  });

  if (completedGames.length === 0) {
    return `${teamName}: No recent completed games`;
  }

  const lines = [];

  completedGames.slice(0, count).forEach(game => {
    const homeTeamName = game.home_team?.name || game.home_team?.full_name || '';
    const awayTeamName = game.visitor_team?.name || game.visitor_team?.full_name || game.away_team?.name || game.away_team?.full_name || '';
    const isHome = homeTeamName.toLowerCase().includes(teamName.toLowerCase().split(' ').pop()) ||
                   teamName.toLowerCase().includes(homeTeamName.toLowerCase().split(' ').pop());

    const teamScore = isHome ? (game.home_team_score ?? game.home_score ?? 0) : (game.visitor_team_score ?? game.away_team_score ?? game.away_score ?? 0);
    const oppScore = isHome ? (game.visitor_team_score ?? game.away_team_score ?? game.away_score ?? 0) : (game.home_team_score ?? game.home_score ?? 0);
    const oppName = isHome ? awayTeamName : homeTeamName;

    if (!oppName || oppName.toLowerCase().includes(teamName.toLowerCase().split(' ').pop())) return;

    const wl = teamScore > oppScore ? 'W' : 'L';
    if (wl === 'W') wins++; else losses++;

    const gameDate = new Date(game.date || game.datetime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    lines.push(`  ${wl} vs ${oppName} ${teamScore}-${oppScore} (${gameDate})`);

    // Add full box score if available
    const dateKey = (game.date || game.datetime || '').split('T')[0];
    const boxScoresForDate = boxScoreMap?.[dateKey];
    const boxScore = findMatchingBoxScore(boxScoresForDate, game);
    if (boxScore) {
      const teamStats = isHome ? boxScore.home_team_stats : boxScore.away_team_stats;
      const boxLines = formatBoxScoreLines(teamStats, '    ');
      lines.push(...boxLines);
    }
  });

  const shown = Math.min(completedGames.length, count);
  return `${teamName} (${wins}-${losses} L${shown}):\n${lines.join('\n')}`;
}

/**
 * Format recent form with box scores (NHL-specific).
 * Shows W/L, score, and full box score per game with hockey stats.
 */
export function formatNhlRecentFormWithBoxScores(teamName, recentGames, boxScoreMap, count = 5) {
  if (!recentGames || recentGames.length === 0) {
    return `${teamName}: Recent games unavailable`;
  }

  let wins = 0, losses = 0;

  const completedGames = recentGames.filter(game => {
    const homeScore = game.home_team_score ?? game.home_score ?? 0;
    const awayScore = game.visitor_team_score ?? game.away_score ?? 0;
    return homeScore > 0 || awayScore > 0;
  });

  if (completedGames.length === 0) {
    return `${teamName}: No recent completed games`;
  }

  const lines = [];

  completedGames.slice(0, count).forEach(game => {
    const homeTeamName = game.home_team?.name || game.home_team?.full_name || '';
    const awayTeamName = game.visitor_team?.name || game.visitor_team?.full_name || game.away_team?.name || game.away_team?.full_name || '';
    const isHome = homeTeamName.toLowerCase().includes(teamName.toLowerCase().split(' ').pop()) ||
                   teamName.toLowerCase().includes(homeTeamName.toLowerCase().split(' ').pop());

    const teamScore = isHome ? (game.home_team_score ?? game.home_score ?? 0) : (game.visitor_team_score ?? game.away_team_score ?? game.away_score ?? 0);
    const oppScore = isHome ? (game.visitor_team_score ?? game.away_team_score ?? game.away_score ?? 0) : (game.home_team_score ?? game.home_score ?? 0);
    const oppName = isHome ? awayTeamName : homeTeamName;

    if (!oppName || oppName.toLowerCase().includes(teamName.toLowerCase().split(' ').pop())) return;

    const wl = teamScore > oppScore ? 'W' : 'L';
    if (wl === 'W') wins++; else losses++;

    const gameDate = new Date(game.date || game.datetime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    lines.push(`  ${wl} vs ${oppName} ${teamScore}-${oppScore} (${gameDate})`);

    // Add full NHL box score if available
    const nhlBox = findMatchingNhlBoxScore(boxScoreMap, game);
    if (nhlBox) {
      const teamStats = (isHome && !nhlBox.reversed) || (!isHome && nhlBox.reversed)
        ? nhlBox.homePlayerStats : nhlBox.awayPlayerStats;
      const boxLines = formatNhlBoxScoreLines(teamStats, '    ');
      lines.push(...boxLines);
    }
  });

  const shown = Math.min(completedGames.length, count);
  return `${teamName} (${wins}-${losses} L${shown}):\n${lines.join('\n')}`;
}

// ============================================================================
// H2H DATA
// ============================================================================

export async function fetchH2HData(homeTeam, awayTeam, sport, recentHome, recentAway) {
  try {
    const bdlSport = sportToBdlKey(sport);

    // NCAAB: Use Highlightly H2H API (simpler, more reliable team matching)
    if (bdlSport === 'basketball_ncaab') {
      try {
        const { getH2H } = await import('../../../ncaabVenueService.js');
        const highlightlyH2H = await getH2H(homeTeam, awayTeam, 'ncaab');
        if (highlightlyH2H) {
          console.log(`[Scout Report] H2H: Highlightly returned ${highlightlyH2H.gamesFound || 0} game(s) for ${homeTeam} vs ${awayTeam}`);
          return highlightlyH2H;
        }
        console.log(`[Scout Report] H2H: Highlightly returned null, falling back to BDL`);
      } catch (e) {
        console.warn(`[Scout Report] H2H: Highlightly failed (${e.message}), falling back to BDL`);
      }
    }

    // Get team IDs
    const teams = await ballDontLieService.getTeams(bdlSport);

    const home = findTeam(teams, homeTeam);
    const away = findTeam(teams, awayTeam);

    if (!home?.id || !away?.id) {
      console.log(`[Scout Report] H2H: Could not find team IDs for ${homeTeam} or ${awayTeam}`);
      return null;
    }

    // Debug: Log which teams were resolved
    console.log(`[Scout Report] H2H: Resolved teams - Home: ${home.full_name} (ID: ${home.id}), Away: ${away.full_name} (ID: ${away.id})`);

    // Sanity check: Ensure we didn't accidentally match wrong teams (e.g., "Nets" in "Hornets")
    if (!homeTeam.toLowerCase().includes(home.name?.toLowerCase() || '')) {
      console.warn(`[Scout Report] H2H: WARNING - Home team mismatch? Searched for "${homeTeam}" but found "${home.full_name}"`);
    }
    if (!awayTeam.toLowerCase().includes(away.name?.toLowerCase() || '')) {
      console.warn(`[Scout Report] H2H: WARNING - Away team mismatch? Searched for "${awayTeam}" but found "${away.full_name}"`);
    }
    
    // Calculate current season using centralized function
    const currentSeason = seasonForSport(sport);
    
    // FIX: Fetch FULL SEASON games for H2H lookup (not just recent 5 games)
    // This catches H2H matchups from earlier in the season (e.g., October/November)
    console.log(`[Scout Report] H2H: Fetching full season games for ${homeTeam} vs ${awayTeam}`);
    
    const homeSeasonGames = await ballDontLieService.getGames(bdlSport, {
      team_ids: [home.id],
      seasons: [currentSeason],
      per_page: 100
    });
    
    console.log(`[Scout Report] H2H: Found ${homeSeasonGames?.length || 0} total games for ${homeTeam} in ${currentSeason} season`);
    
    // Filter to only H2H games between these two teams
    const h2hGames = (homeSeasonGames || []).filter(game => {
      const gameHomeId = game.home_team?.id || game.home_team_id;
      const gameAwayId = game.visitor_team?.id || game.away_team?.id || game.visitor_team_id || game.away_team_id;
      
      const isMatch = (gameHomeId === home.id && gameAwayId === away.id) ||
                      (gameHomeId === away.id && gameAwayId === home.id);
      
      const hasScores = ((game.home_team_score ?? game.home_score ?? 0) > 0 || (game.visitor_team_score ?? game.away_team_score ?? game.away_score ?? 0) > 0);
      // Ensure game is in the past (completed)
      const gameDate = new Date(game.date);
      const isPast = gameDate < new Date();
      const included = isMatch && hasScores && isPast;
      if (included) {
        const awayName = game.visitor_team?.full_name || game.away_team?.full_name || game.visitor_team_id || game.away_team_id;
        const awayScoreVal = game.visitor_team_score ?? game.away_team_score ?? game.away_score ?? 'N/A';
        console.log(`[Scout Report] H2H Match found: ${game.date} - ${game.home_team?.full_name || game.home_team_id} vs ${awayName} (Score: ${game.home_team_score ?? game.home_score ?? 'N/A'}-${awayScoreVal})`);
      }
      return included;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // Deduplicate by date (in case of data issues)
    const uniqueH2H = [];
    const seenDates = new Set();
    for (const game of h2hGames) {
      const dateKey = game.date?.split('T')[0];
      if (!seenDates.has(dateKey)) {
        seenDates.add(dateKey);
        uniqueH2H.push(game);
      }
    }
    
    console.log(`[Scout Report] H2H: Found ${uniqueH2H.length} game(s) between ${homeTeam} and ${awayTeam} this season`);
    
    if (uniqueH2H.length === 0) {
      return {
        found: false,
        message: `No H2H games found between ${homeTeam} and ${awayTeam} in the ${currentSeason} season.`,
        games: []
      };
    }
    
    // Format H2H results
    const homeName = home.full_name || home.name;
    const awayName = away.full_name || away.name;
    let homeWins = 0, awayWins = 0;

    // Fetch box scores for NBA/NHL H2H games
    const isNba = bdlSport === 'basketball_nba';
    const isNhl = bdlSport === 'icehockey_nhl';
    let h2hNbaBoxScoreMap = {};
    let h2hNhlBoxScoreMap = {};
    if (isNba) {
      try {
        h2hNbaBoxScoreMap = await fetchNbaBoxScoresForGames(uniqueH2H.slice(0, 5));
      } catch (e) {
        console.warn(`[Scout Report] H2H NBA box score fetch failed: ${e.message}`);
      }
    } else if (isNhl) {
      try {
        h2hNhlBoxScoreMap = await fetchNhlBoxScoresForGames(uniqueH2H.slice(0, 5));
      } catch (e) {
        console.warn(`[Scout Report] H2H NHL box score fetch failed: ${e.message}`);
      }
    }

    const meetings = uniqueH2H.slice(0, 5).map(game => {
      const isHomeTeamHome = (game.home_team?.id || game.home_team_id) === home.id;
      const homeScore = isHomeTeamHome ? (game.home_team_score ?? game.home_score ?? 0) : (game.visitor_team_score ?? game.away_team_score ?? game.away_score ?? 0);
      const awayScore = isHomeTeamHome ? (game.visitor_team_score ?? game.away_team_score ?? game.away_score ?? 0) : (game.home_team_score ?? game.home_score ?? 0);
      const winner = homeScore > awayScore ? homeName : awayName;
      const margin = Math.abs(homeScore - awayScore);
      const gameDate = new Date(game.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      if (homeScore > awayScore) homeWins++;
      else awayWins++;

      // Get full box score lines if available (NBA or NHL)
      let homeBoxLines = [];
      let awayBoxLines = [];

      if (isNba) {
        const dateKey = (game.date || '').split('T')[0];
        const boxScoresForDate = h2hNbaBoxScoreMap[dateKey];
        const boxScore = findMatchingBoxScore(boxScoresForDate, game);
        if (boxScore) {
          const homeStats = isHomeTeamHome ? boxScore.home_team_stats : boxScore.away_team_stats;
          const awayStats = isHomeTeamHome ? boxScore.away_team_stats : boxScore.home_team_stats;
          homeBoxLines = formatBoxScoreLines(homeStats, '      ');
          awayBoxLines = formatBoxScoreLines(awayStats, '      ');
        }
      } else if (isNhl) {
        const nhlBox = findMatchingNhlBoxScore(h2hNhlBoxScoreMap, game);
        if (nhlBox) {
          const homeStats = (isHomeTeamHome && !nhlBox.reversed) || (!isHomeTeamHome && nhlBox.reversed)
            ? nhlBox.homePlayerStats : nhlBox.awayPlayerStats;
          const awayStats = (isHomeTeamHome && !nhlBox.reversed) || (!isHomeTeamHome && nhlBox.reversed)
            ? nhlBox.awayPlayerStats : nhlBox.homePlayerStats;
          homeBoxLines = formatNhlBoxScoreLines(homeStats, '      ');
          awayBoxLines = formatNhlBoxScoreLines(awayStats, '      ');
        }
      }

      return {
        date: gameDate,
        result: `${winner} won by ${margin}`,
        score: `${homeName} ${homeScore} - ${awayScore} ${awayName}`,
        homeBoxLines,
        awayBoxLines
      };
    });

    return {
      found: true,
      homeName,
      awayName,
      gamesFound: uniqueH2H.length,
      record: `${homeName} ${homeWins}-${awayWins} ${awayName}`,
      meetings,
      season: currentSeason
    };
  } catch (e) {
    console.error(`[Scout Report] H2H fetch error:`, e.message);
    return null;
  }
}

/**
 * Format H2H data for Scout Report display
 */
export function formatH2HSection(h2hData, homeTeam, awayTeam) {
  if (!h2hData) {
    return `H2H DATA UNAVAILABLE`;
  }
  
  if (!h2hData.found) {
    return `H2H DATA VERIFIED: NO PREVIOUS MATCHUPS
${h2hData.message}`;
  }
  
  const lines = [
    `H2H DATA VERIFIED: ${h2hData.gamesFound} GAME(S) FOUND`,
    `Season Record: ${h2hData.record}`,
    '',
    'Recent Meetings:'
  ];
  
  h2hData.meetings.forEach(m => {
    lines.push(`  • ${m.date}: ${m.score} (${m.result})`);
    if (m.homeBoxLines?.length > 0 || m.awayBoxLines?.length > 0) {
      if (m.homeBoxLines?.length > 0) {
        lines.push(`    ${h2hData.homeName}:`);
        lines.push(...m.homeBoxLines);
      }
      if (m.awayBoxLines?.length > 0) {
        lines.push(`    ${h2hData.awayName}:`);
        lines.push(...m.awayBoxLines);
      }
    }
  });
  
  lines.push('');
  lines.push(`[DATA BOUNDARY]: ${h2hData.gamesFound} game(s) shown above.`);

  return lines.join('\n');
}

// ============================================================================
// INJURY FUNCTIONS
// ============================================================================

/**
 * Fetch injuries for both teams
 * SOURCE OF TRUTH varies by sport:
 * - NFL/NCAAF: BDL is PRIMARY (reliable weekly practice reports)
 * - NBA: RapidAPI is PRIMARY (structured injury status, no Grounding)
 * - NHL/NCAAB: Rotowire via Gemini Grounding is PRIMARY
 */
export async function fetchInjuries(homeTeam, awayTeam, sport) {
  try {
    const bdlSport = sportToBdlKey(sport);
    const isFootball = sport === 'NFL' || sport === 'NCAAF' || 
                       bdlSport === 'americanfootball_nfl' || bdlSport === 'americanfootball_ncaaf';
    
    // =============================================================================
    // NFL/NCAAF: Use BDL as PRIMARY source for injury data
    // BDL has official practice report data (Questionable/Doubtful/Out status)
    // Apply 10-day freshness rule: only injuries reported within 10 days matter
    // =============================================================================
    if (isFootball && bdlSport) {
      console.log(`[Scout Report] NFL/NCAAF: Fetching BDL injuries (official practice reports)`);

      // Fetch current state for narratives and additional context
      let narrativeContext = null;
      try {
        const currentState = await fetchCurrentState(homeTeam, awayTeam, sport);
        narrativeContext = currentState?.groundedRaw || null;
      } catch (e) {
        console.log(`[Scout Report] Failed to fetch ${sport} current state: ${e.message}`);
      }

      // Fetch BDL injuries for both teams
      let homeInjuries = [];
      let awayInjuries = [];

      try {
        // Get team IDs from BDL
        const [homeTeamData, awayTeamData] = await Promise.all([
          ballDontLieService.getTeamByNameGeneric(bdlSport, homeTeam),
          ballDontLieService.getTeamByNameGeneric(bdlSport, awayTeam)
        ]);

        const homeTeamId = homeTeamData?.id;
        const awayTeamId = awayTeamData?.id;

        if (homeTeamId || awayTeamId) {
          const teamIds = [homeTeamId, awayTeamId].filter(Boolean);
          console.log(`[Scout Report] NFL team IDs: ${homeTeam}=${homeTeamId}, ${awayTeam}=${awayTeamId}`);

          // Fetch injuries from BDL (uses nfl/v1/player_injuries endpoint)
          const bdlInjuries = await ballDontLieService.getNflPlayerInjuries(teamIds);
          console.log(`[Scout Report] BDL returned ${bdlInjuries?.length || 0} NFL injuries`);

          // Calculate freshness (10-day window for NFL)
          const now = new Date();
          const FRESH_WINDOW_DAYS = 10;

          // Process injuries and assign to home/away
          for (const inj of (bdlInjuries || [])) {
            const playerTeamId = inj.player?.team?.id || inj.team?.id;
            const injuryDate = inj.date ? new Date(inj.date) : null;
            const daysSinceReport = injuryDate ? Math.floor((now - injuryDate) / (1000 * 60 * 60 * 24)) : null;

            // Determine freshness category
            let freshness = 'UNKNOWN';
            if (daysSinceReport !== null) {
              if (daysSinceReport <= FRESH_WINDOW_DAYS) {
                freshness = 'FRESH';
              } else {
                freshness = 'STALE';
              }
            }

            const injuryObj = {
              player: {
                first_name: inj.player?.first_name,
                last_name: inj.player?.last_name,
                position: inj.player?.position || inj.player?.position_abbreviation
              },
              status: inj.status || 'Unknown',
              type: inj.comment?.split('(')[1]?.split(')')[0] || 'Unknown', // Extract injury type from comment
              daysSinceReport,
              reportDateStr: injuryDate ? injuryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null,
              freshness,
              comment: inj.comment?.substring(0, 150) || '',
              source: 'BDL'
            };

            // Log fresh injuries prominently
            if (freshness === 'FRESH') {
              console.log(`[Scout Report] FRESH NFL INJURY: ${inj.player?.first_name} ${inj.player?.last_name} (${inj.status}) - ${daysSinceReport} days ago`);
            }

            if (playerTeamId === homeTeamId) {
              homeInjuries.push(injuryObj);
            } else if (playerTeamId === awayTeamId) {
              awayInjuries.push(injuryObj);
            }
          }

          console.log(`[Scout Report] NFL injuries parsed: ${homeInjuries.length} for ${homeTeam}, ${awayInjuries.length} for ${awayTeam}`);
        }
      } catch (e) {
        console.warn(`[Scout Report] Failed to fetch BDL NFL injuries: ${e.message}`);
      }

      return {
        home: homeInjuries,
        away: awayInjuries,
        lineups: { home: [], away: [] },
        narrativeContext
      };
    }
    
    // =============================================================================
    // NBA: Injuries from RapidAPI + starting lineups from RotoWire via Grounding
    // NCAAB: separate lineup flow in sport builder (RotoWire via Grounding)
    // NHL: injuries from BDL + goalie/lineup context from Grounding
    // =============================================================================

    // OPTIMIZATION: For NCAAB, skip the separate injury grounding call
    // The RotoWire lineups fetch (later in buildScoutReport) already includes injuries
    // This avoids duplicate API calls and wasted tokens
    const isNcaab = sport === 'NCAAB' || sport === 'basketball_ncaab';

    let groundingInjuries;
    if (isNcaab) {
      console.log(`[Scout Report] NCAAB: Skipping separate injury fetch - will use RotoWire lineups response`);
      // Return empty injuries - they'll be populated from the lineups fetch
      groundingInjuries = { home: [], away: [], groundingRaw: null };
    } else {
      groundingInjuries = await fetchGroundingInjuries(homeTeam, awayTeam, sport);
    }

    // Use groundingRaw from the single call (no duplicate fetchGroundedContext call needed)
    const narrativeContext = groundingInjuries?.groundingRaw || null;

    const groundingHomeCount = groundingInjuries?.home?.length || 0;
    const groundingAwayCount = groundingInjuries?.away?.length || 0;

    // Check if grounding WORKED (got a response) - even if 0 injuries found
    // If narrativeContext has substantial content (>100 chars), grounding succeeded
    // NBA RapidAPI groundingRaw can be ~130 chars for healthy teams — use 50 as threshold
    const groundingWorked = narrativeContext && narrativeContext.length > 50;

    // If grounding worked (got a response with content), 0 injuries is VALID
    // Teams CAN be healthy - both college and pro. Treating 0 injuries as a failure
    // causes unnecessary errors when teams are actually healthy.
    const zeroInjuriesIsValid = groundingWorked;

    // Use injury data as source of truth (NHL: BDL, others: Rotowire Grounding)
    // Duration enrichment handled by box-score resolution for NBA/NHL
    if (groundingHomeCount > 0 || groundingAwayCount > 0 || zeroInjuriesIsValid) {
      const isNhlSport = sport === 'NHL' || sport === 'icehockey_nhl';
      if (groundingHomeCount === 0 && groundingAwayCount === 0) {
        console.log(`[Scout Report] ${isNhlSport ? 'BDL' : 'Grounding'} worked - both teams appear HEALTHY (no injuries reported)`);
      } else {
        console.log(`[Scout Report] Using ${isNhlSport ? 'BDL' : 'Rotowire'} injuries (${groundingHomeCount} home, ${groundingAwayCount} away) as source of truth`);
      }

      // Fetch BDL injuries for duration enrichment (BDL has return_date and description)
      let enrichedHome = groundingInjuries.home || [];
      let enrichedAway = groundingInjuries.away || [];

      // NOTE: NCAAB RotoWire injury merge now happens in buildScoutReport() after lineups fetch
      // (see the parseNcaabInjuriesFromResponse section around line 1577)

      try {
        const bdlSport = sportToBdlKey(sport);
        if (bdlSport === 'basketball_nba') {
          // NBA: Duration resolved via box-score in buildScoutReport()
          // RapidAPI provides status + reason; box-score determines how long each player has been out
          console.log(`[Scout Report] NBA: Duration will be resolved via box-score in buildScoutReport()`);
        } else if (bdlSport === 'icehockey_nhl') {
          // NHL: Injuries now come from BDL (in fetchGroundingInjuries)
          // Duration will be resolved via box-score in buildScoutReport() (same as NBA)
          console.log(`[Scout Report] NHL: Duration will be resolved via box-score in buildScoutReport()`);
        }
      } catch (e) {
        console.log(`[Scout Report] BDL duration enrichment failed: ${e.message}`);
      }

      // NBA: Skip stale marking — box-score resolution in buildScoutReport() handles duration + freshness.
      // Also enforce required starting lineups (5 per team).
      if (bdlSport === 'basketball_nba') {
        const nbaLineups = groundingInjuries?.lineups || { home: [], away: [] };
        if (nbaLineups.home.length < 5 || nbaLineups.away.length < 5) {
          throw new Error(`[Scout Report] CRITICAL: NBA starting lineups missing or incomplete (${awayTeam}: ${nbaLineups.away.length}/5, ${homeTeam}: ${nbaLineups.home.length}/5).`);
        }

        return {
          home: enrichedHome,
          away: enrichedAway,
          staleInjuries: [], // Computed in buildScoutReport after box-score resolution
          lineups: nbaLineups,
          narrativeContext,
          _homeTeamId: groundingInjuries?._homeTeamId,
          _awayTeamId: groundingInjuries?._awayTeamId
        };
      }

      // NHL: Skip stale marking — box-score resolution in buildScoutReport() handles duration + freshness.
      if (bdlSport === 'icehockey_nhl') {
        return {
          home: enrichedHome,
          away: enrichedAway,
          staleInjuries: [], // Computed in buildScoutReport after box-score resolution
          lineups: { home: [], away: [] },
          narrativeContext,
          // Pass team IDs for NHL box-score duration resolution
          _homeTeamId: groundingInjuries?._homeTeamId,
          _awayTeamId: groundingInjuries?._awayTeamId
        };
      }

      // STALE INJURY MARKING (NBA: 3-day window, NHL: 3-day window)
      // Enriches injury objects with freshness data (FRESH/STALE)
      // Constitution teaches Gary how to think about injury timing
      // NOTE: Only log significant players (starters/high usage)
      // =========================================================================
      const STALE_WINDOW_DAYS = 3;
      const freshSignificantPlayers = [];
      const staleSignificantPlayers = [];

      const markStaleInjuries = (injuries, teamName) => {
        const marked = [];
        for (const inj of injuries) {
          const name = `${inj.player?.first_name || ''} ${inj.player?.last_name || ''}`.trim();
          const days = inj.daysSinceReport;
          const status = (inj.status || '').toLowerCase();
          // Check if player is significant (Out status only - Questionable players might play)
          const isOut = status.includes('out') || status.includes('doubtful');

          // If we don't have duration info, we can't determine staleness
          if (days === null || days === undefined) {
            inj.freshness = 'UNKNOWN';
            inj.isPricedIn = false;
          } else if (days <= STALE_WINDOW_DAYS) {
            inj.freshness = 'FRESH';
            inj.isPricedIn = false;
            // Only track significant fresh injuries (OUT players, not questionable)
            if (isOut) {
              freshSignificantPlayers.push(`${name} (${days}d, ${teamName})`);
            }
          } else {
            inj.freshness = 'STALE';
            inj.isPricedIn = true;
            if (isOut) {
              staleSignificantPlayers.push(`${name} (${days}d)`);
            }
          }
          marked.push(inj);
        }
        return marked;
      };

      const markedHome = markStaleInjuries(enrichedHome, homeTeam);
      const markedAway = markStaleInjuries(enrichedAway, awayTeam);

      // Mark UNKNOWN-duration injuries as STALE (assume priced in — duration unknown, not fresh news)
      // Gary still sees who's OUT (for lineup/matchup context) but won't cite as a fresh factor
      const markUnknownAsStale = (injuries, teamName) => {
        const unknowns = [];
        for (const inj of injuries) {
          if (inj.freshness === 'UNKNOWN' && (inj.daysSinceReport === null || inj.daysSinceReport === undefined)) {
            const name = `${inj.player?.first_name || ''} ${inj.player?.last_name || ''}`.trim();
            inj.freshness = 'STALE';
            inj.isPricedIn = true;
            inj.durationContext = 'OUT - duration unknown';
            unknowns.push(`${name} (${inj.status})`);
          }
        }
        if (unknowns.length > 0) {
          console.warn(`[Scout Report] ${unknowns.length} injuries with UNKNOWN duration for ${teamName} marked as STALE (assume priced in): ${unknowns.join(', ')}`);
        }
        return injuries;
      };

      const finalHome = markUnknownAsStale(markedHome, homeTeam);
      const finalAway = markUnknownAsStale(markedAway, awayTeam);

      // Log injury summary (per CLAUDE.md: include date + games missed to distinguish fresh vs stale)
      if (freshSignificantPlayers.length > 0) {
        console.log(`[Scout Report] Fresh OUT (0-3 days): ${freshSignificantPlayers.join(', ')}`);
      }
      if (staleSignificantPlayers.length > 0) {
        console.log(`[Scout Report] Stale OUT (>3 days, priced in): ${staleSignificantPlayers.join(', ')}`);
      }

      // Track stale injuries for context (OUT but priced in — not a fresh factor)
      const staleInjuries = [
        ...finalHome.filter(i => i.isPricedIn).map(i => `${i.player?.first_name || ''} ${i.player?.last_name || ''}`.trim()),
        ...finalAway.filter(i => i.isPricedIn).map(i => `${i.player?.first_name || ''} ${i.player?.last_name || ''}`.trim())
      ];

      return {
        home: finalHome,
        away: finalAway,
        staleInjuries, // OUT players with stale status (priced in)
        lineups: { home: [], away: [] },
        narrativeContext
      };
    }
    
    // FALLBACK 1: Try parsing injuries from narrative context (often has better data)
    if (narrativeContext) {
      console.log(`[Scout Report] Trying to parse injuries from narrative context...`);
      const narrativeParsed = parseGroundingInjuries(narrativeContext, homeTeam, awayTeam, sport);
      const narrativeHomeCount = narrativeParsed?.home?.length || 0;
      const narrativeAwayCount = narrativeParsed?.away?.length || 0;

      if (narrativeHomeCount > 0 || narrativeAwayCount > 0) {
        console.log(`[Scout Report] Parsed injuries from narrative context (${narrativeHomeCount} home, ${narrativeAwayCount} away)`);
        return {
          home: narrativeParsed.home || [],
          away: narrativeParsed.away || [],
          filteredLongTerm: narrativeParsed.filteredLongTerm || [],
          lineups: { home: [], away: [] },
          narrativeContext
        };
      }
    }

    // NO BDL FALLBACK FOR STATUS
    // BDL injury status data is often stale (e.g., player listed as "Questionable" when they've been playing for days)
    // Rotowire (via Gemini Grounding) is the ONLY source of truth for:
    //   - Expected starting lineups
    //   - Current injury status (OUT, GTD, Questionable, Doubtful, Probable)
    // BDL is ONLY used for duration enrichment (how long a player has been out)
    // If grounding fails, we must fail - cannot trust BDL for current game-day status

    // NCAAB: Return empty - injuries will be populated from RotoWire lineups fetch in buildScoutReport
    if (isNcaab) {
      return {
        home: [],
        away: [],
        lineups: { home: [], away: [] },
        narrativeContext: null
      };
    }

    // NO FALLBACK - Rotowire grounding MUST work (for NBA/NHL)
    // If grounding fails, throw error to fail the process
    const errorMsg = `[Scout Report] CRITICAL: Rotowire grounding failed to get injury/lineup data. Cannot proceed without Rotowire.`;
    console.error(errorMsg);
    throw new Error(errorMsg);
    
  } catch (error) {
    // NCAAB uses a different flow (lineups fetch includes injuries) — non-critical here
    if (sport === 'NCAAB' || sport === 'basketball_ncaab') {
      console.warn(`[Scout Report] NCAAB injury fetch error (non-critical): ${error.message}`);
      return { home: [], away: [], narrativeContext: null };
    }
    // For NBA/NHL/NFL: ALL injury grounding errors are critical — process MUST fail
    // If Rotowire grounding fails for ANY reason (timeout, rate limit, API error),
    // we cannot proceed because Gary would analyze the game without knowing who's playing
    console.error(`[Scout Report] CRITICAL: Injury grounding failed for ${sport}: ${error.message}`);
    throw new Error(`[Scout Report] CRITICAL: Rotowire grounding failed to get injury/lineup data for ${sport}. Cannot proceed without Rotowire. Original error: ${error.message}`);
  }
}

// ============================================================================
// CURRENT STATE / NARRATIVE
// ============================================================================

export async function fetchCurrentState(homeTeam, awayTeam, sport, gameDate) {
  const genAI = getGeminiClient();
  if (!genAI) {
    console.log('[Scout Report] Gemini not available for current state');
    return null;
  }

  try {
    const now = new Date();
    const today = gameDate || now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const todayFull = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const seasonContext = formatSeason(seasonForSport(sport));

    const sportName = {
      'NFL': 'NFL', 'americanfootball_nfl': 'NFL',
      'NBA': 'NBA', 'basketball_nba': 'NBA',
      'NHL': 'NHL', 'icehockey_nhl': 'NHL',
      'NCAAB': 'college basketball', 'basketball_ncaab': 'college basketball',
      'NCAAF': 'college football', 'americanfootball_ncaaf': 'college football'
    }[sport] || sport;

    const isNFL = sport === 'NFL' || sport === 'americanfootball_nfl';
    const isNCAAF = sport === 'NCAAF' || sport === 'americanfootball_ncaaf';
    const isFootball = isNFL || isNCAAF;
    const isNBA = sport === 'NBA' || sport === 'basketball_nba';

    console.log(`[Scout Report] Fetching CURRENT STATE for ${awayTeam} @ ${homeTeam} (2-phase: Flash search → narrative)...`);
    const startTime = Date.now();

    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const recentWindow = `${sevenDaysAgo.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} to ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;

    const searchQueries = [
      `${homeTeam} ${sportName} news ${recentWindow}. Recent games, results, scores, storylines, trades, roster moves, headlines, beat writer articles, coach quotes.`,
      `${awayTeam} ${sportName} news ${recentWindow}. Recent games, results, scores, storylines, trades, roster moves, headlines, beat writer articles, coach quotes.`,
      `${awayTeam} vs ${homeTeam} ${sportName} game ${today}. Game preview, matchup analysis, storylines, broadcast info, breaking news.`
    ];
    const queryLabels = ['HOME', 'AWAY', 'MATCHUP'];

    if (isFootball) {
      searchQueries.push(`${homeTeam} stadium weather forecast ${today}. Temperature, wind, precipitation for tonight's game.`);
      queryLabels.push('WEATHER');
    }

    if (isNBA) {
      searchQueries.push(`${homeTeam} ${awayTeam} NBA game tonight ${today}. Player availability, rest decisions, load management, who is sitting out, who is playing, game-day status, lineup decisions.`);
      queryLabels.push('AVAILABILITY');
    }

    const searchResults = await Promise.all(
      searchQueries.map((q, i) => {
        const label = queryLabels[i] || `QUERY_${i}`;
        return groundingSearch(genAI, q, todayFull)
          .then(text => {
            if (!text) {
              console.warn(`[Scout Report] Search ${label}: returned null/empty`);
              return { label, text: '' };
            }
            console.log(`[Scout Report] Search ${label}: ${text.length} chars`);
            return { label, text };
          })
          .catch(e => {
            console.warn(`[Scout Report] Search ${label} failed: ${e.message}`);
            return { label, text: '' };
          });
      })
    );

    const searchDuration = Date.now() - startTime;
    console.log(`[Scout Report] Phase 1 (search) completed in ${searchDuration}ms`);

    const homeContext = searchResults.find(r => r.label === 'HOME')?.text || '';
    const awayContext = searchResults.find(r => r.label === 'AWAY')?.text || '';
    const matchupContext = searchResults.find(r => r.label === 'MATCHUP')?.text || '';
    const weatherContext = searchResults.find(r => r.label === 'WEATHER')?.text || '';
    const availabilityContext = searchResults.find(r => r.label === 'AVAILABILITY')?.text || '';

    const totalSearchChars = homeContext.length + awayContext.length + matchupContext.length;
    if (totalSearchChars < 200) {
      throw new Error(`Search phase returned insufficient data (${totalSearchChars} chars total). Searches may have failed.`);
    }

    const narrativeModel = genAI.getGenerativeModel({
      model: 'gemini-3-flash-preview',
      generationConfig: {
        temperature: 1.0,
        thinkingConfig: { thinkingLevel: 'high' }
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ]
    });

    const isNHL = sport === 'NHL' || sport === 'icehockey_nhl';

    const footballNarrativeInstructions = isFootball ? `
Also include (if found in the search results):
- **WEATHER:** Game-time conditions — only mention if SEVERE (blizzard, 25+ mph sustained wind, sub-15°F, heavy rain). Skip if dome/indoor.
- **GAME CONTEXT:** Game type (TNF/SNF/MNF/Saturday${isNCAAF ? '/Bowl/CFP' : ''}), divisional/conference matchup, playoff implications, what's at stake.
` : '';

    const narrativePrompt = `You are a sports journalist writing a current state report for a ${sportName} game.
Today is ${todayFull}. Season: ${seasonContext}.

Below are raw search results about both teams and tonight's matchup. Use this information to write a rich, detailed current state report.

<search_results>
--- ${homeTeam} NEWS & CONTEXT ---
${homeContext || '[No results found]'}

--- ${awayTeam} NEWS & CONTEXT ---
${awayContext || '[No results found]'}

--- MATCHUP: ${awayTeam} @ ${homeTeam} (${today}) ---
${matchupContext || '[No results found]'}
${weatherContext ? `\n--- WEATHER ---\n${weatherContext}` : ''}
${availabilityContext ? `\n--- GAME-DAY AVAILABILITY ---\n${availabilityContext}` : ''}
</search_results>

Based on the search results above, write the current state report. For EACH team, cover:

**${homeTeam} — What's going on with this team right now?**
- **RECENT TRAJECTORY:** Record, ranking, recent performance over the last 5-10 games. Winning streak? Losing streak?
- **LAST GAME:** What happened? Score, key performances, beat writer narrative (was it a blowout, comeback, overtime thriller, buzzer beater?).
- **TOP STORYLINES & HEADLINES:** The big stories around this team RIGHT NOW:
  * Recent trades, acquisitions, roster moves
  * Breakout performances or slumps from key players
  * Coaching news, fines, controversies, front office moves
  * Players RETURNING tonight who missed recent games (rest, minor injury, suspension)
  * Anything a knowledgeable fan would know about this team this week
  * Roster notes — key players emerging, role changes

**${awayTeam} — What's going on with this team right now?**
- Same categories as above.
${footballNarrativeInstructions}
**TODAY'S MATCHUP NEWS (${today}):**
- Game preview context: time, broadcast, venue
- Key matchup storylines specific to THIS game
- Coach or player quotes about tonight
- Any breaking news affecting tonight's game

RULES:
- Do NOT mention injuries or injury statuses (e.g., "OUT", "questionable", "OFS"). Injury data comes from a dedicated real-time source and is handled separately. EXCEPTIONS: (1) You MAY mention a player RETURNING tonight from absence as a storyline. (2) You MAY mention load management, rest decisions, or DNP-Rest — these game-day decisions do NOT appear on injury reports and are important context.
- Do NOT include ATS records, betting trends, cover percentages, or any against-the-spread statistics.
- Do NOT include HISTORICAL records or series history (e.g., "Team is 28-49 all-time at...", "first win since 2019", "lost 13 of last 19 trips"). These are descriptive, not predictive.
- Do NOT include conditional records (e.g., "15-0 when scoring 80+", "2-6 in Quad 1 games"). Focus on HOW they are playing, not won-loss tallies.
- Do NOT include future-tense content — no recruiting commitments, no next-season roster plans, no draft projections. Only cover what has ALREADY happened and what is relevant to TODAY'S game.
- Do NOT make betting predictions or pick a winner.
- Use specific details — names, dates, scores, quotes. No vague generalities.
- Only use information from the search results above. Do not make anything up.
- Write in a knowledgeable, factual tone. Think beat writer, not hype man.`;

    const narrativeStart = Date.now();
    let text;
    try {
      const result = await narrativeModel.generateContent(narrativePrompt);
      text = result.response.text();
    } catch (flashError) {
      const flashMsg = flashError.message?.toLowerCase() || '';
      const isFlash429 = flashError.status === 429 || flashError.message?.includes('429') || flashMsg.includes('quota');
      if (isFlash429) {
        console.log(`[Scout Report] Flash 429 for narrative — retrying with Flash (backup key)`);
        const proModel = genAI.getGenerativeModel({
          model: 'gemini-3-flash-preview',
          generationConfig: { temperature: 1.0 },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ]
        });
        const proResult = await proModel.generateContent(narrativePrompt);
        text = proResult.response.text();
      } else {
        throw flashError;
      }
    }
    const narrativeDuration = Date.now() - narrativeStart;
    const totalDuration = Date.now() - startTime;
    console.log(`[Scout Report] Phase 2 (narrative) completed in ${narrativeDuration}ms. Total: ${totalDuration}ms`);

    const MIN_RESPONSE_LENGTH = 200;
    if (!text || text.length < MIN_RESPONSE_LENGTH) {
      const errorMsg = `Narrative too short (${text?.length || 0} chars). Response: "${text?.substring(0, 100) || 'empty'}"`;
      console.error(`[Scout Report] [NARRATIVE FAIL] ${errorMsg}`);
      throw new Error(`Current state narrative failed: ${errorMsg}`);
    }

    const textLower = text.toLowerCase();
    const homeMascot = homeTeam.split(' ').pop().toLowerCase();
    const awayMascot = awayTeam.split(' ').pop().toLowerCase();
    const mentionsHome = textLower.includes(homeTeam.toLowerCase()) || textLower.includes(homeMascot);
    const mentionsAway = textLower.includes(awayTeam.toLowerCase()) || textLower.includes(awayMascot);

    if (!mentionsHome && !mentionsAway) {
      throw new Error(`Narrative does not mention either team. Expected "${homeTeam}" or "${awayTeam}".`);
    }

    console.log(`[Scout Report] [NARRATIVE OK] ${text.length} chars, mentions: home=${mentionsHome}, away=${mentionsAway}`);

    let cleanedText = text;
    const atsPattern = /^[^\n]*\b(\d+-\d+(?:-\d+)?\s+ATS|ATS\s+record|ATS\s+in|against the spread|cover\s+(?:percentage|pct|rate)|covers?\s+the\s+spread|betting\s+trend|public\s+betting|action\s+on)\b[^\n]*$/gim;
    const atsMatches = cleanedText.match(atsPattern);
    if (atsMatches) {
      console.log(`[Scout Report] Stripped ${atsMatches.length} ATS/betting line(s) from narrative`);
      cleanedText = cleanedText.replace(atsPattern, '').replace(/\n{3,}/g, '\n\n').trim();
    }

    const preview = cleanedText.substring(0, 300).replace(/\n/g, ' ');
    console.log(`[Scout Report] Current state preview: ${preview}...`);
    console.log(`[Scout Report] === FULL CURRENT STATE START ===`);
    console.log(cleanedText);
    console.log(`[Scout Report] === FULL CURRENT STATE END ===`);

    return {
      groundedRaw: cleanedText,
      groundingUsed: true
    };

  } catch (error) {
    console.warn(`[Scout Report] Current state fetch failed: ${error.message}`);
    return null;
  }
}

export async function scrubNarrative(narrative, allowedPlayers, homeTeam, awayTeam, excludedPlayers = []) {
  if (!narrative || !allowedPlayers || allowedPlayers.length === 0) return narrative;

  const scrubCheck = evaluateNarrativeScrubNeed(narrative, allowedPlayers, homeTeam, awayTeam, excludedPlayers);
  if (!scrubCheck.shouldScrub) {
    console.log('[Scout Report] Narrative scrub skipped - no invalid names or betting noise detected');
    return narrative;
  }

  console.log(`[Scout Report] Narrative scrub triggered: ${scrubCheck.reasons.join(', ')}`);

  const genAI = getGeminiClient();
  if (!genAI) return narrative;

  try {
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-3-flash-preview',
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ]
    });
    
    const excludedSection = excludedPlayers.length > 0
      ? `\n### EXCLUDED PLAYERS (NEVER PLAYED THIS SEASON - 0 GAMES - ALWAYS REMOVE):\n${excludedPlayers.join(', ')}\nThese players have 0 games played this season. They have been out all year — the team has fully adjusted and the line reflects their absence. Remove ALL mentions.\n`
      : '';

    const prompt = `You are a data integrity tool. I will provide a news report about a sports matchup.

### TASK:
1. Remove any mentions of players in the EXCLUDED list (never played this season - 0 games, team has adjusted, absence is priced in)
2. Remove any mentions of players NOT in the VALID list
${excludedSection}
### VALID PLAYERS:
${allowedPlayers.join(', ')}

### NEWS REPORT TO CLEAN:
${narrative}

### STRICT RULES:
1. PRIORITY: If a sentence/bullet mentions ANY player in the EXCLUDED list, DELETE the entire sentence/bullet.
2. If a sentence mentions a player NOT in the VALID list, DELETE the entire sentence.
3. If a bullet point discusses a "ghost" player (not on the current roster), DELETE the entire bullet.
4. If a paragraph discusses the impact of an EXCLUDED player, DELETE that paragraph.
5. KEEP mentions of players who recently got injured (even season-ending injuries) IF they are in the VALID list.
6. DELETE any lines with ATS records, against-the-spread stats, cover percentages, or betting trends. These are FORBIDDEN.
7. DO NOT add any new info.
8. DO NOT explain your changes.
9. Return ONLY the cleaned text.
10. Preserve the headers and bullets for players who ARE in the valid list and NOT in excluded.

Cleaned Report:`;

    const result = await model.generateContent(prompt);
    const cleaned = (result.response?.text() || narrative).trim();
    
    if (cleaned.length < 50 && narrative.length > 500) {
      console.warn(`[Scout Report] Scrubbing was too aggressive, falling back to original narrative`);
      return narrative;
    }
    
    return cleaned;
  } catch (e) {
    console.warn(`[Scout Report] Narrative scrubbing failed: ${e.message}`);
    return narrative;
  }
}

const NARRATIVE_ATS_PATTERN = /\b(?:ATS|against the spread|cover(?:s|ing| percentage| pct| rate)?|betting trend|public betting|action on)\b/i;
const NARRATIVE_NAME_PATTERN = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}\b/g;
const NARRATIVE_IGNORED_PHRASES = new Set([
  'Recent Trajectory',
  'Last Game',
  'Top Storylines',
  'Top Storylines Headlines',
  'Todays Matchup News',
  'Today Matchup News',
  'Game Context',
  'Current State',
  'No Results Found',
  'Home Team',
  'Away Team'
]);

function normalizeNarrativeEntity(value = '') {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function buildTeamWordSet(homeTeam = '', awayTeam = '') {
  return new Set(
    `${homeTeam} ${awayTeam}`
      .split(/\s+/)
      .map(word => word.trim().toLowerCase())
      .filter(Boolean)
  );
}

function isTeamLikePhrase(candidate = '', teamWords = new Set()) {
  const words = String(candidate || '')
    .split(/\s+/)
    .map(word => word.trim().toLowerCase())
    .filter(Boolean);
  return words.length > 0 && words.every(word => teamWords.has(word));
}

function evaluateNarrativeScrubNeed(narrative, allowedPlayers, homeTeam, awayTeam, excludedPlayers = []) {
  const reasons = [];
  const normalizedNarrative = String(narrative || '');

  if (NARRATIVE_ATS_PATTERN.test(normalizedNarrative)) {
    reasons.push('betting-noise');
  }

  const excluded = excludedPlayers
    .map(name => normalizeNarrativeEntity(name))
    .filter(Boolean);

  if (excluded.some(name => normalizedNarrative.toLowerCase().includes(name))) {
    reasons.push('excluded-player');
  }

  const allowedSet = new Set(
    allowedPlayers
      .map(name => normalizeNarrativeEntity(name))
      .filter(Boolean)
  );
  const teamWords = buildTeamWordSet(homeTeam, awayTeam);
  const unknownNames = new Set();
  const matches = normalizedNarrative.match(NARRATIVE_NAME_PATTERN) || [];

  for (const rawMatch of matches) {
    const candidate = String(rawMatch || '').trim();
    const normalized = normalizeNarrativeEntity(candidate);
    if (!normalized) continue;
    if (allowedSet.has(normalized)) continue;
    if (normalizeNarrativeEntity(homeTeam) === normalized || normalizeNarrativeEntity(awayTeam) === normalized) continue;
    if (NARRATIVE_IGNORED_PHRASES.has(candidate)) continue;
    if (isTeamLikePhrase(candidate, teamWords)) continue;
    unknownNames.add(candidate);
  }

  if (unknownNames.size > 0) {
    reasons.push(`unknown-names:${Array.from(unknownNames).slice(0, 3).join('|')}`);
  }

  return {
    shouldScrub: reasons.length > 0,
    reasons
  };
}

// ============================================================================
// GROUNDING INJURIES & PARSING
// ============================================================================

function parseNbaStartingLineupsFromGrounding(content = '', homeTeam = '', awayTeam = '') {
  const lineups = { home: [], away: [] };
  const seen = { home: new Set(), away: new Set() };
  let section = null; // "home" | "away"

  const cleanName = (raw = '') => raw
    .replace(/^\s*[-*•\d.)]+\s*/, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const pushPlayer = (teamKey, position, nameRaw) => {
    if (!teamKey || !nameRaw) return;
    const name = cleanName(nameRaw);
    if (!name || /unknown/i.test(name)) return;
    const key = name.toLowerCase();
    if (seen[teamKey].has(key)) return;
    seen[teamKey].add(key);
    lineups[teamKey].push({ name, position: position || '' });
  };

  const lines = String(content).split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const lower = line.toLowerCase();

    if (lower.startsWith('away_starters')) {
      section = 'away';
      continue;
    }
    if (lower.startsWith('home_starters')) {
      section = 'home';
      continue;
    }
    if (homeTeam && lower.includes(homeTeam.toLowerCase()) && /starters|lineup|starting/.test(lower)) {
      section = 'home';
      continue;
    }
    if (awayTeam && lower.includes(awayTeam.toLowerCase()) && /starters|lineup|starting/.test(lower)) {
      section = 'away';
      continue;
    }
    if (!section) continue;

    const posMatch = line.match(/^(PG|SG|SF|PF|C)\s*[:|-]\s*(.+)$/i);
    if (posMatch) {
      pushPlayer(section, posMatch[1].toUpperCase(), posMatch[2]);
      continue;
    }

    const posBulletMatch = line.match(/^[-*•]?\s*(PG|SG|SF|PF|C)\s+(.+)$/i);
    if (posBulletMatch) {
      pushPlayer(section, posBulletMatch[1].toUpperCase(), posBulletMatch[2]);
      continue;
    }

    // Fallback: comma-separated names under an active section
    if (line.includes(',')) {
      const parts = line.split(',').map(p => cleanName(p)).filter(Boolean);
      for (const p of parts) pushPlayer(section, '', p);
      continue;
    }

    // Last-resort fallback: plain name line under active section
    if (/^[A-Za-z'.-]+(?:\s+[A-Za-z'.-]+)+$/.test(line)) {
      pushPlayer(section, '', line);
    }
  }

  if (lineups.home.length > 5) lineups.home = lineups.home.slice(0, 5);
  if (lineups.away.length > 5) lineups.away = lineups.away.slice(0, 5);
  return lineups;
}

async function fetchNbaStartingLineups(homeTeam, awayTeam) {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const buildQuery = (attempt) => {
    if (attempt === 1) {
      return `What are the projected starting lineups for the NBA game ${awayTeam} at ${homeTeam} on ${today}?

Return EXACTLY in this format:

AWAY_STARTERS:
PG: [name]
SG: [name]
SF: [name]
PF: [name]
C: [name]

HOME_STARTERS:
PG: [name]
SG: [name]
SF: [name]
PF: [name]
C: [name]

Rules:
1. Use player names exactly.
2. If a starter is unknown, write UNKNOWN.
3. Do not include injuries, analysis, or extra text.`;
    }
    // Retry with different phrasing
    return `NBA starting lineups for ${today}: ${awayTeam} at ${homeTeam}.

List the projected starting five for BOTH teams. Format:

AWAY_STARTERS (${awayTeam}):
PG: [name]
SG: [name]
SF: [name]
PF: [name]
C: [name]

HOME_STARTERS (${homeTeam}):
PG: [name]
SG: [name]
SF: [name]
PF: [name]
C: [name]

Only names and positions. No extra text.`;
  };

  for (let attempt = 1; attempt <= 2; attempt++) {
    const query = buildQuery(attempt);
    const response = await geminiGroundingSearch(query, { temperature: 1.0, maxTokens: 4000 });
    if (!response?.success || !response?.data) {
      if (attempt === 2) throw new Error('NBA lineup grounding returned no data after 2 attempts');
      console.warn(`[Scout Report] NBA lineup grounding attempt ${attempt} returned no data — retrying`);
      continue;
    }

    const lineups = parseNbaStartingLineupsFromGrounding(response.data, homeTeam, awayTeam);

    if (lineups.home.length >= 5 && lineups.away.length >= 5) {
      return { lineups, groundingRaw: response.data };
    }

    if (attempt === 1) {
      console.warn(`[Scout Report] NBA lineup attempt 1 incomplete (${awayTeam}: ${lineups.away.length}/5, ${homeTeam}: ${lineups.home.length}/5) — retrying with different query`);
      continue;
    }

    // Return whatever we got on attempt 2 — let the caller decide if it's enough
    return { lineups, groundingRaw: response.data };
  }

  throw new Error('NBA lineup grounding failed after 2 attempts');
}

export async function fetchGroundingInjuries(homeTeam, awayTeam, sport) {
  try {
    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    // Sport-specific queries for Gemini Grounding
    let query;
    if (sport === 'NHL' || sport === 'icehockey_nhl') {
      // NHL-specific: Search rotowire.com/hockey/nhl-lineups.php directly
      // This page ALWAYS shows TODAY's lineups and injuries by default
      console.log(`[Scout Report] Using Gemini Grounding for injury data: ${homeTeam} vs ${awayTeam}`);

      // DEDICATED INJURY-ONLY QUERY - This is critical!
      // The combined query often skips injuries. This query ONLY asks for injuries.
      // Use the exact RotoWire URL and be very specific about what to extract
      // ALSO ask for duration info (when the injury started, how long out)
      const makeNhlInjuryOnlyQuery = (teamName) => `Go to https://www.rotowire.com/hockey/nhl-lineups.php

Find the ${teamName} lineup card on this page.

Look at the INJURIES section of the ${teamName} card. List each injured player with:
1. Position (D, C, LW, RW, G)
2. Full Name
3. Status (IR, IR-LT, DTD, OUT, IR-NR)
4. How long they've been out (if shown in news/notes)

FORMAT REQUIRED:
Position Name Status | Duration

EXAMPLES:
D Ryan Ellis IR | since Nov 15, missed 20+ games
D Shea Weber IR-LT | season-long injury
LW Kirill Marchenko DTD | day-to-day, missed 2 games
C Anton Lundell OUT | just ruled out today

If duration/games missed is not shown, just write the position, name, and status.

If ${teamName} has no injuries listed, say: "No injuries"

Only list injuries for ${teamName}.`;

      // GOALIE QUERY - separate for reliability
      const makeNhlGoalieQuery = (teamName, opponentName) => `Search site:rotowire.com/hockey/nhl-lineups.php for the ${teamName} vs ${opponentName} game.

Look at the lineup card for ${teamName}. Extract ONLY:

1. STARTING GOALIE:
${teamName} Goalie: [Name] (Confirmed/Expected)

Report whether the goalie is "Confirmed" or "Expected" based on what RotoWire shows.`;

      // Run goalie queries via Grounding (lineup data) AND BDL injuries in parallel
      // BDL provides structured injury data with team info; Grounding provides goalie/lineup context
      const bdlSportKey = sportToBdlKey(sport);
      const bdlTeams = await ballDontLieService.getTeams(bdlSportKey);
      const homeTeamObj = bdlTeams?.find(t =>
        (t.full_name || '').toLowerCase().includes(homeTeam.toLowerCase()) ||
        (t.name || '').toLowerCase().includes(homeTeam.toLowerCase()) ||
        homeTeam.toLowerCase().includes((t.name || '').toLowerCase())
      );
      const awayTeamObj = bdlTeams?.find(t =>
        (t.full_name || '').toLowerCase().includes(awayTeam.toLowerCase()) ||
        (t.name || '').toLowerCase().includes(awayTeam.toLowerCase()) ||
        awayTeam.toLowerCase().includes((t.name || '').toLowerCase())
      );

      const teamIds = [homeTeamObj?.id, awayTeamObj?.id].filter(Boolean);
      if (!homeTeamObj) console.warn(`[Scout Report] ⚠️ NHL injury: Could not match home team "${homeTeam}" in BDL teams (${bdlTeams?.length || 0} teams available)`);
      if (!awayTeamObj) console.warn(`[Scout Report] ⚠️ NHL injury: Could not match away team "${awayTeam}" in BDL teams (${bdlTeams?.length || 0} teams available)`);
      if (teamIds.length < 2) console.warn(`[Scout Report] ⚠️ NHL injury: Only ${teamIds.length} team IDs resolved: [${teamIds.join(', ')}] — may fetch incomplete injury data`);

      const [awayGoalieResponse, homeGoalieResponse, bdlInjuries] = await Promise.all([
        geminiGroundingSearch(makeNhlGoalieQuery(awayTeam, homeTeam), { maxTokens: 500 }),
        geminiGroundingSearch(makeNhlGoalieQuery(homeTeam, awayTeam), { maxTokens: 500 }),
        ballDontLieService.getNhlPlayerInjuries(teamIds)
      ]);

      // Build goalie context for narrative (still from Grounding)
      const awayGoalieText = typeof awayGoalieResponse === 'string' ? awayGoalieResponse : (awayGoalieResponse?.data || '');
      const homeGoalieText = typeof homeGoalieResponse === 'string' ? homeGoalieResponse : (homeGoalieResponse?.data || '');
      const goalieRaw = `${awayGoalieText}\n\n${homeGoalieText}`.trim();

      // HARD FAIL: NHL picks require confirmed/expected starting goalies
      if (!goalieRaw || goalieRaw.length < 20) {
        throw new Error(`[HARD FAIL] NHL goalie data unavailable from RotoWire for ${awayTeam} @ ${homeTeam}. Cannot make an accurate NHL pick without knowing who is starting in net.`);
      }

      // Normalize BDL injury status to standard format
      const normalizeNhlStatus = (bdlStatus) => {
        const s = (bdlStatus || '').toUpperCase();
        if (s === 'IR-LT' || s === 'LTIR' || s === 'IR-NR') return 'Out';
        if (s === 'IR') return 'Out';
        if (s === 'DTD' || s === 'DAY-TO-DAY') return 'Questionable';
        if (s === 'OUT') return 'Out';
        return bdlStatus || 'Unknown';
      };

      // Convert BDL injuries to standard injury format and filter by team
      const homeInjuries = [];
      const awayInjuries = [];

      for (const inj of (bdlInjuries || [])) {
        const playerTeamId = inj.player?.teams?.[0]?.id || inj.player?.team?.id;
        if (!playerTeamId) continue;

        const injObj = {
          player: {
            first_name: inj.player?.first_name || '',
            last_name: inj.player?.last_name || '',
            position: inj.player?.position_code || inj.player?.position || '',
            id: inj.player?.id
          },
          status: normalizeNhlStatus(inj.status),
          statusRaw: inj.status, // Keep original BDL status (IR, IR-LT, DTD, OUT)
          durationContext: inj.injury_type || inj.comment || '',
          returnDate: inj.return_date || null,
          source: 'BDL',
          duration: 'UNKNOWN', // Will be resolved by box-score
          freshness: 'UNKNOWN'
        };

        if (playerTeamId === homeTeamObj?.id) {
          homeInjuries.push(injObj);
        } else if (playerTeamId === awayTeamObj?.id) {
          awayInjuries.push(injObj);
        }
      }

      console.log(`[Scout Report] BDL NHL injuries: ${homeInjuries.length} for ${homeTeam}, ${awayInjuries.length} for ${awayTeam}`);

      return {
        home: homeInjuries,
        away: awayInjuries,
        groundingRaw: goalieRaw, // Goalie lineup context from Grounding
        _homeTeamId: homeTeamObj?.id,
        _awayTeamId: awayTeamObj?.id
      };

    } else if (sport === 'NCAAB' || sport === 'basketball_ncaab') {
      query = `Search site:rotowire.com/cbb/lineups.php for the college basketball game ${awayTeam} vs ${homeTeam}.

Look at the lineup card for this matchup on that page. Extract the following EXACTLY as shown:

1. STARTING LINEUPS - For EACH team, list the starting 5:
${awayTeam}:
PG [Name]
SG [Name]
SF [Name]
PF [Name]
C [Name]

${homeTeam}:
PG [Name]
SG [Name]
SF [Name]
PF [Name]
C [Name]

2. INJURIES section - List players with EXACT status:
${awayTeam} Injuries:
- [Position] [Name] [Status]
(Example: C I. Ufochukwu Out, F S. Wilkins OFS)
OR "None" if no injuries

${homeTeam} Injuries:
- [Position] [Name] [Status]
OR "None" if no injuries

STATUS CODES:
- Out = Confirmed out for this game
- OFS = Out For Season
- GTD = Game Time Decision

RULES:
1. Return BOTH teams' starting lineups
2. Use EXACT status codes from Rotowire (Out, OFS, GTD)
3. If no injuries, say "None"`;
    } else if (sport === 'NFL' || sport === 'americanfootball_nfl') {
      // NFL-specific query - search rotowire.com/football/nfl-lineups.php directly
      query = `Search site:rotowire.com/football/nfl-lineups.php for the ${awayTeam} vs ${homeTeam} game.

Look at the lineup card for this matchup on that page. Extract the following EXACTLY as shown:

1. STARTING LINEUPS - Most importantly the STARTING QB:
${awayTeam}:
- QB [Name]
- RB [Name]
- WR [Name], [Name], [Name]
- TE [Name]
- K [Name]

${homeTeam}:
- QB [Name]
- RB [Name]
- WR [Name], [Name], [Name]
- TE [Name]
- K [Name]

2. PLAYER STATUSES - Look for status codes after player names:
- "Q" = Questionable
- "D" = Doubtful
- "O" = Out
- "IR" = Injured Reserve

3. INACTIVES section (if available):
${awayTeam} Inactives: [List players or "Not Yet Available"]
${homeTeam} Inactives: [List players or "Not Yet Available"]

CRITICAL:
1. Verify the STARTING QB — who is confirmed to start?
2. Note any player with Q/D/O/IR status code
3. If inactives aren't available yet, say "Not Yet Available"`;
    } else if (sport === 'NCAAF' || sport === 'americanfootball_ncaaf') {
      query = `For the college football game ${awayTeam} @ ${homeTeam} on ${today} (2025-26 Bowl Season):

1. INJURIES & ROSTER ATTRITION - CRITICAL:
   - List ALL players OUT, DOUBTFUL, or QUESTIONABLE for each team.
   - Include player name, position, and impact (e.g., "Starting LT", "Leading Tackler").
   - MUST IDENTIFY: NFL Draft Opt-outs, Transfer Portal entries, and Academically Ineligible players.
   - For bowl games, distinguish between "Regular Season Starters" and "Bowl Game Starters".
   - For DURATION, include "since [Month] [Day]" or "missed [X] games" when available.

2. QB SITUATION: 
   - Who is the confirmed starting QB for each team? 
   - If the regular starter is out (portal/opt-out), describe the backup's experience and style.
   - Any QB controversies or split-snap situations?

3. COACHING & MOTIVATION:
   - Are there any coaching changes? (Head Coach, OC, or DC leaving for other jobs/fired).
   - Who is calling the plays for the bowl game?
   - Motivation context: Is one team "happy to be there" vs. "disappointed to miss the playoff"? 
   - Is this a "home" bowl for one team?

4. WEATHER & VENUE:
   - Current weather forecast for kickoff (Temp, Rain/Snow, Wind Speed).
   - Is the game in a dome or outdoors?

5. ADVANCED ANALYTICS (if found):
   - Current FPI (Football Power Index) or S&P+ rankings for both teams.
   - Strength of Schedule (SOS) and recent margin of victory/loss.

Be factual and concise. Format injuries clearly. NO betting predictions.

CRITICAL ANTI-OPINION RULES:
1. FACTS ONLY - Do NOT include betting predictions from articles.
2. NO OPINIONS - Extract FACTS only, ignore betting advice.
3. YOUR OWN WORDS - Synthesize facts, do NOT plagiarize.
4. NO BETTING ADVICE - Gary makes his own picks.`;

    } else if (sport === 'NBA' || sport === 'basketball_nba') {
      // NBA: RapidAPI for injuries + RotoWire via Grounding for starting lineups.
      // Both are required for this pipeline.
      console.log(`[Scout Report] Fetching NBA injuries (RapidAPI) + starting lineups (RotoWire) for ${awayTeam} @ ${homeTeam}`);

      // Generate ISO date (YYYY-MM-DD) for the API — use EST, not UTC
      const isoDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

      // Fetch injuries from RapidAPI — this is the ONLY source
      const apiInjuries = await fetchNbaInjuriesForGame(homeTeam, awayTeam, isoDate);

      if (apiInjuries) {
        console.log(`[Scout Report] NBA injuries from RapidAPI: ${apiInjuries.away.length} ${awayTeam}, ${apiInjuries.home.length} ${homeTeam}`);

        const groundingRaw = [
          `=== ${awayTeam} ===`,
          `${awayTeam} INJURY REPORT:`,
          apiInjuries.away.length > 0
            ? apiInjuries.away.map(i => `${i.player.first_name} ${i.player.last_name} - ${i.status} (${i.durationContext})`).join('\n')
            : 'No injuries reported',
          '',
          `=== ${homeTeam} ===`,
          `${homeTeam} INJURY REPORT:`,
          apiInjuries.home.length > 0
            ? apiInjuries.home.map(i => `${i.player.first_name} ${i.player.last_name} - ${i.status} (${i.durationContext})`).join('\n')
            : 'No injuries reported'
        ].join('\n');

        const lineupResult = await fetchNbaStartingLineups(homeTeam, awayTeam);
        const lineups = lineupResult?.lineups || { home: [], away: [] };

        if (lineups.home.length < 5 || lineups.away.length < 5) {
          throw new Error(`NBA starting lineups incomplete (${awayTeam}: ${lineups.away.length}/5, ${homeTeam}: ${lineups.home.length}/5)`);
        }

        console.log(`[Scout Report] NBA lineups parsed: ${awayTeam} ${lineups.away.length}/5, ${homeTeam} ${lineups.home.length}/5`);
        console.log(`[Scout Report] NBA injury context (${groundingRaw.length} chars):\n${groundingRaw}`);

        return {
          home: apiInjuries.home,
          away: apiInjuries.away,
          groundingRaw,
          lineups
        };
      }

      // API failed — process MUST fail (no Grounding fallback)
      throw new Error(`[Scout Report] CRITICAL: NBA Injuries API failed — cannot proceed without injury data. Gary would analyze the game without knowing who's playing.`);

    } else {
      // Non-NBA: BDL has injuries for all sports — no grounding fallback
      console.warn(`[Scout Report] ⚠️ ${sport} injury data should come from BDL API, not grounding. Returning empty.`);
      return { home: [], away: [], groundingRaw: null };
    }

    // This code is only reached if the NBA path somehow falls through (shouldn't happen)
    console.warn(`[Scout Report] Unexpected injury fetch path for ${sport}`);
    return { home: [], away: [], groundingRaw: null };

    // If parsing found 0 injuries for both teams, log a warning - this might be a parsing issue
    if (parsed.home.length === 0 && parsed.away.length === 0 && sport === 'basketball_nba') {
      console.warn(`[Scout Report] ⚠️ NBA grounding returned 0 injuries for BOTH teams - verify if this is correct or a parsing issue`);
    }
    
    return parsed;
    
  } catch (error) {
    console.warn(`[Scout Report] Grounding injury check failed:`, error.message);
    return { home: [], away: [], groundingRaw: null };
  }
}

/**
 * Parse Gemini Grounding response to extract injury information
 * Returns: { home: [], away: [], filteredLongTerm: [] } - filteredLongTerm contains names of players
 * filtered out due to 14+ day absence (for narrative scrubbing)
 */
function parseGroundingInjuries(content, homeTeam, awayTeam, sport = '') {
  const injuries = { home: [], away: [], filteredLongTerm: [] };
  const foundPlayers = new Set(); // Prevent duplicates
  
  // Normalize status to standard format
  // CRITICAL: Preserve GTD (Game Time Decision) as distinct from Questionable
  // CRITICAL: Handle Prob/Probable correctly - these players are EXPECTED TO PLAY
  const normalizeStatus = (status) => {
    const s = status.toLowerCase().trim();
    if (s.includes('ltir') || s.includes('long-term') || s.includes('long term')) return 'LTIR';
    if (s === 'ir' || s.includes('injured reserve')) return 'IR';
    if (s.includes('ofs') || s.includes('out for season')) return 'OFS';
    // GTD is a specific status - game time decision, preserve it
    if (s === 'gtd' || s.includes('gtd') || s.includes('game-time decision') || s.includes('game time decision')) return 'GTD';
    // Probable = ~75% chance to play (expected to play) - NOT a concern
    if (s.includes('prob') || s.includes('probable')) return 'Prob';
    if (s.includes('out') || s.includes('ruled out')) return 'Out';
    if (s.includes('doubtful') || s.includes('doubt')) return 'Doubtful';
    if (s.includes('questionable') || s.includes('ques') || s.includes('day-to-day')) return 'Questionable';
    return 'Unknown'; // Default to Unknown for unrecognized statuses (don't assume Out)
  };
  
  // Extract duration context from injury text
  // Returns: { duration, isEdge, note, outSinceDate, daysSinceOut }
  const extractDuration = (text, returnDate = null) => {
    const t = text.toLowerCase();
    const now = new Date();
    let outSinceDate = null;
    let daysSinceOut = null;

    // Try to extract "since [DATE]" patterns from text
    // Matches: "since Dec. 18", "since December 18", "since Jan 6", "since October"
    const sinceMatch = t.match(/since\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[.\s]*(\d{1,2})?/i);
    if (sinceMatch) {
      const monthStr = sinceMatch[1].toLowerCase();
      const day = sinceMatch[2] ? parseInt(sinceMatch[2], 10) : 1;
      const monthMap = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
      const monthNum = monthMap[monthStr.substring(0, 3)];
      if (monthNum !== undefined) {
        // Assume current season (adjust year if month is after current month)
        let year = now.getFullYear();
        if (monthNum > now.getMonth()) year -= 1; // Previous year if month is in the future
        outSinceDate = new Date(year, monthNum, day);
        daysSinceOut = Math.floor((now - outSinceDate) / (1000 * 60 * 60 * 24));
      }
    }

    // Detect "missed X games" or "Xth game in a row" patterns
    const gamesMatch = t.match(/missed\s+(\d+)\s+games/);
    const gameInRowMatch = t.match(/(\d+)(?:th|rd|nd|st)\s+game\s+in\s+a\s+row/);
    const consecutiveMatch = t.match(/(\d+)\s+consecutive\s+games/);
    const straightMatch = t.match(/(\d+)\s+straight\s+games/);

    let games = 0;
    if (gamesMatch) games = parseInt(gamesMatch[1], 10);
    else if (gameInRowMatch) games = parseInt(gameInRowMatch[1], 10);
    else if (consecutiveMatch) games = parseInt(consecutiveMatch[1], 10);
    else if (straightMatch) games = parseInt(straightMatch[1], 10);

    // Estimate days from games missed if we don't have a specific date
    // NBA: ~3 games per week, NFL: 1 game per week
    if (games > 0 && !daysSinceOut) {
      const daysPerGame = 2.5; // NBA average
      daysSinceOut = Math.round(games * daysPerGame);
      outSinceDate = new Date(now.getTime() - (daysSinceOut * 24 * 60 * 60 * 1000));
    }

    // Format the outSince string for display
    const outSinceStr = outSinceDate
      ? outSinceDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : null;

    // Determine duration category based on days out
    if (daysSinceOut !== null) {
      if (daysSinceOut >= 45) {
        return { duration: 'SEASON-LONG', isEdge: false, note: `Out since ~${outSinceStr} (${daysSinceOut}+ days)`, outSinceDate: outSinceStr, daysSinceOut };
      } else if (daysSinceOut >= 21) {
        return { duration: 'SHORT-TERM', isEdge: false, note: `Out since ~${outSinceStr} (~${Math.round(daysSinceOut / 7)} weeks)`, outSinceDate: outSinceStr, daysSinceOut };
      } else if (daysSinceOut >= 7) {
        return { duration: 'SHORT-TERM', isEdge: false, note: `Out since ~${outSinceStr} (~${daysSinceOut} days)`, outSinceDate: outSinceStr, daysSinceOut };
      } else {
        return { duration: 'FRESH', isEdge: true, note: `Out since ~${outSinceStr} (${daysSinceOut} days)`, outSinceDate: outSinceStr, daysSinceOut };
      }
    }

    // Text-based detection (fallback if no dates/games found)
    // OFS = Rotowire's status code for "Out For Season"
    if (t.includes('season-long') || t.includes('all season') || t.includes('since week 1') ||
        t.includes('since week 2') || t.includes('since week 3') || t.includes('most of the season') ||
        t.includes('out for the year') || t.includes('out all year') ||
        t.includes('indefinitely') || t.includes('no timetable') || t.includes('no return') ||
        t.includes('season-ending') || t.includes('out for season') || t.includes('ofs') ||
        t.includes('won\'t return') || t.includes('will not return') ||
        t.includes('since the start') || t.includes('long-term') || t.includes('long term')) {
      return { duration: 'SEASON-LONG', isEdge: false, note: '', outSinceDate: null, daysSinceOut: null };
    }
    if (t.includes('mid-season') || t.includes('since week 4') || t.includes('since week 5') ||
        t.includes('since week 6') || t.includes('since week 7') || t.includes('since week 8') ||
        t.includes('since week 9') || t.includes('since week 10') || t.includes('since week 11') ||
        t.includes('several weeks') || t.includes('multiple weeks') || t.includes('month') ||
        t.includes('extended') || t.includes('prolonged')) {
      return { duration: 'SHORT-TERM', isEdge: false, note: '', outSinceDate: null, daysSinceOut: null };
    }
    if (t.includes('recent') || t.includes('last week') || t.includes('this week') ||
        t.includes('just') || t.includes('new') || t.includes('since week 14') ||
        t.includes('since week 15') || t.includes('since week 16') ||
        t.includes('day-to-day') || t.includes('game-time')) {
      return { duration: 'FRESH', isEdge: true, note: '', outSinceDate: null, daysSinceOut: null };
    }
    // Default
    return { duration: 'UNKNOWN', isEdge: null, note: '', outSinceDate: null, daysSinceOut: null };
  };

  // NBA-specific: Prefer strict parsing from "MAY NOT PLAY" sections
  const parseNbaMayNotPlay = () => {
    const result = { home: [], away: [], filteredLongTerm: [] };
    if (!content) return result;

    const lines = content.split('\n');
    const homeLower = homeTeam.toLowerCase();
    const awayLower = awayTeam.toLowerCase();

    const isTeamHeader = (lineLower, teamLower) => {
      // Strip markdown formatting (**, ##, etc.) and === markers before checking
      const cleanLine = lineLower.replace(/\*\*/g, '').replace(/^[=#]+\s*/, '').replace(/\s*[=#]+$/, '').trim();

      // Section headers like "MAY NOT PLAY (Team Name)" are NOT team headers
      // They contain the team name but are section markers — must be handled by section check
      if (cleanLine.startsWith('may not play') || cleanLine.startsWith('injuries') ||
          cleanLine.startsWith('expected lineup') || cleanLine.startsWith('starting lineup')) {
        return false;
      }

      // Match team name at start of line (with === markers from strict query format)
      // e.g., "washington wizards", "=== miami heat ===", "miami heat:"
      if (cleanLine.startsWith(teamLower)) return true;

      // For non-startsWith matches, require SHORT lines to avoid matching intro sentences
      // like "The following Miami Heat players are listed with an injury..." (85+ chars)
      // Real team headers are short: "Miami Heat - Injuries" (~22 chars)
      if (cleanLine.length > 60) return false;

      const hasTeam = cleanLine.includes(teamLower);
      if (!hasTeam) return false;

      // Match "Team: injuries" or "Team injuries" or "Team - Out Players"
      if (cleanLine.includes('injur') || cleanLine.includes('may not play') || cleanLine.includes('out')) {
        return true;
      }

      // Allow simple team header lines like "Memphis Grizzlies:" or "**Washington Wizards:**"
      if (/[:\-–]\s*$/.test(cleanLine)) return true;
      return false;
    };

    const shouldStopInjurySection = (lineLower) => {
      // Strip markdown before checking
      const cleanLine = lineLower.replace(/\*\*/g, '').replace(/^#+\s*/, '').replace(/^[=#]+\s*/, '').replace(/\s*[=#]+$/, '').trim();
      // Stop injury parsing when we hit lineup sections or next team header
      return cleanLine.includes('expected lineup') ||
        cleanLine.includes('starting lineup') ||
        cleanLine.includes('starting lineups') ||
        cleanLine.includes('expected starting') ||
        cleanLine.startsWith(homeLower) ||
        cleanLine.startsWith(awayLower);
    };

    // Validate that a parsed "player name" is actually a name, not an English phrase
    // (e.g., "are officially ruled" or "has been ruled" can slip through regex patterns)
    const isValidPlayerName = (nameStr) => {
      if (!nameStr || nameStr.length < 4) return false;
      const invalidWords = ['has', 'been', 'ruled', 'are', 'officially', 'will', 'not', 'expected', 'the', 'this', 'that', 'is', 'was', 'were', 'may', 'might', 'could', 'should', 'would', 'can', 'did', 'does', 'do', 'no', 'for', 'with', 'from', 'they', 'their', 'his', 'her', 'out', 'listed'];
      const words = nameStr.toLowerCase().split(/\s+/);
      if (words.every(w => invalidWords.includes(w))) return false;
      // Real player names start with an uppercase letter
      if (!/[A-Z]/.test(nameStr.charAt(0))) return false;
      return true;
    };

    const addParsedInjury = (team, playerName, status, rawLine) => {
      const name = (playerName || '').trim();
      if (!isValidPlayerName(name)) return;
      const playerKey = name.toLowerCase();
      if (foundPlayers.has(playerKey)) return;

      const durationInfo = extractDuration(rawLine);
      const normalizedStatus = normalizeStatus(status);

      // Give Gary context about injury significance
      // Long-term injuries = already reflected in the line and team's recent stats (priced in)
      // Recent injuries = new information, line may not fully reflect yet
      // UNKNOWN duration gets enriched by BDL later — marked STALE if still UNKNOWN after enrichment
      let durationContext = '';
      if (durationInfo.duration === 'SEASON-LONG') {
        durationContext = 'Out For Season';
      } else if (durationInfo.duration === 'SHORT-TERM') {
        durationContext = `OUT${durationInfo.daysSinceOut ? ` (${durationInfo.daysSinceOut}d)` : ''}`;
      } else if (durationInfo.duration === 'FRESH') {
        durationContext = `FRESH${durationInfo.daysSinceOut ? ` (${durationInfo.daysSinceOut}d)` : ''}`;
      } else {
        durationContext = 'PENDING_ENRICHMENT';
      }

      foundPlayers.add(playerKey);
      const nameParts = name.split(' ');

      result[team].push({
        player: {
          first_name: nameParts[0],
          last_name: nameParts.slice(1).join(' '),
          position: ''
        },
        status: normalizedStatus,
        duration: durationInfo.duration,
        durationContext: durationContext,
        isEdge: durationInfo.isEdge,
        durationNote: durationInfo.note,
        reportDateStr: durationInfo.outSinceDate,
        daysSinceReport: durationInfo.daysSinceOut,
        source: 'gemini_grounding'
      });
    };

    const parseInjuryLine = (line, team) => {
      // Strip markdown formatting (bold **text**, headers ###, etc.) before parsing
      const cleanLine = line
        .replace(/\*\*/g, '')  // Remove bold markers
        .replace(/^#+\s*/, '') // Remove markdown headers
        .replace(/^\s*[-•*]\s*/, '- ') // Normalize bullet points
        // Normalize "Name: Status" → "Name Status" (Gemini grounding uses colons)
        .replace(/:\s+(Out|Ques|Questionable|Prob|Probable|Doubt|Doubtful|GTD|OFS|IR|LTIR)\b/i, ' $1')
        // Normalize "(Status)" → "Status" (Gemini grounding wraps status in parentheses)
        .replace(/\((Out|Ques|Questionable|Prob|Probable|Doubt|Doubtful|GTD|OFS|IR|LTIR)\)/gi, '$1')
        .trim();

      // Skip lines that indicate no injuries
      const lowerLine = cleanLine.toLowerCase();
      if (lowerLine.includes('none reported') || lowerLine.includes('no injuries') ||
          lowerLine === 'none' || lowerLine === 'n/a' || lowerLine.includes('fully healthy')) {
        return false;
      }

      const patterns = [
        // Simple strict format: FirstName LastName Status (from strict query format - prioritize this)
        /^([A-Z][a-z'.-]+\s+[A-Z][a-z'.-]+(?:\s+[A-Z][a-z'.-]+)?)\s+(Out|GTD|Ques|Questionable|Doubtful|Prob|Probable)\s*$/i,
        // Rotowire format: Position Initial. LastName Status (e.g., "C S. Adams Out", "G F. VanVleet Out")
        /[PGCSF]+\s+([A-Z]\.\s*[A-Z][a-z'.-]+)\s+(Out|Ques|Questionable|Prob|Probable|Doubt|Doubtful|GTD|OFS|IR|LTIR)\b/i,
        // Rotowire format with full position: PG/SG/SF/PF/C Initial. LastName Status
        /(?:PG|SG|SF|PF|C|G|F)\s+([A-Z]\.\s*[A-Z][a-z'.-]+(?:\s+[A-Z][a-z'.-]+)?)\s+(Out|Ques|Questionable|Prob|Probable|Doubt|Doubtful|GTD|OFS|IR|LTIR)\b/i,
        // Full name with position in parens: Steven Adams (C) - Out
        /([A-Z][a-z'.-]+(?:\s+[A-Z][a-z'.-]+)+)\s*\([PGCSF]+\)\s*[-–:]\s*(Out|Ques|Questionable|Prob|Probable|Doubt|Doubtful|GTD|OFS|IR|LTIR)\b/i,
        // Triple Pipe (New): - Name | Status | Duration
        /[-•*]\s*([A-Z][a-z'.-]+(?:\s+[A-Z][a-z'.-]+)+)\s*\|\s*(Out|Ques|Questionable|Prob|Probable|Doubt|Doubtful|GTD|OFS|IR|LTIR)\s*\|\s*([^|\n]+)/i,
        // Standard: - Name (Pos) - Status
        /[-•*]\s*([A-Z][a-z'.-]+(?:\s+[A-Z][a-z'.-]+)+)\s*(?:\([^)]+\))?\s*[-–:|]\s*(Out|Ques|Questionable|Prob|Probable|Doubt|Doubtful|GTD|OFS|IR|LTIR)\b/i,
        // Status First: - Status: Name
        /[-•*]\s*(Out|Ques|Questionable|Prob|Probable|Doubt|Doubtful|GTD|OFS|IR|LTIR)\s*[:]\s*([A-Z][a-z'.-]+(?:\s+[A-Z][a-z'.-]+)+)/i,
        // Pipe format: - Name | Status: Status
        /[-•*]\s*([A-Z][a-z'.-]+(?:\s+[A-Z][a-z'.-]+)+)\s*\|\s*Status:\s*(Out|Ques|Questionable|Prob|Probable|Doubt|Doubtful|GTD|OFS|IR|LTIR)\b/i,
        // Simple Pipe: Name | Status
        /([A-Z][a-z'.-]+(?:\s+[A-Z][a-z'.-]+)+)\s*\|\s*(Out|Ques|Questionable|Prob|Probable|Doubt|Doubtful|GTD|OFS|IR|LTIR)\b/i,
        // No bullet: Name (Pos) Status
        /([A-Z][a-z'.-]+(?:\s+[A-Z][a-z'.-]+)+)\s*(?:\([^)]+\))?\s+(Out|Ques|Questionable|Prob|Probable|Doubt|Doubtful|GTD|OFS|IR|LTIR)\b/i,
        // Markdown style: Name - Status (reason)
        /([A-Z][a-z'.-]+(?:\s+[A-Z][a-z'.-]+)+)\s*[-–]\s*(Out|Ques|Questionable|Prob|Probable|Doubt|Doubtful|GTD|OFS|IR|LTIR)\b/i,
        // Simple: Initial. LastName Status (no position prefix)
        /([A-Z]\.\s*[A-Z][a-z'.-]+)\s+(Out|Ques|Questionable|Prob|Probable|Doubt|Doubtful|GTD|OFS|IR|LTIR)\b/i,
        // "Name is out" format
        /([A-Z][a-z'.-]+(?:\s+[A-Z][a-z'.-]+)+)\s+is\s+(out|questionable|probable|doubtful)\b/i
      ];

      for (const pattern of patterns) {
        const match = cleanLine.match(pattern);
        if (match) {
          // Special handling for triple pipe to capture duration context
          if (pattern.source.includes('\\|\\s*([^|\\n]+)')) {
            addParsedInjury(team, match[1], match[2], line);
          } else if (pattern.source.startsWith('[-•*]\\s*(Out|Ques')) {
            addParsedInjury(team, match[2], match[1], line);
          } else {
            addParsedInjury(team, match[1], match[2], line);
          }
          return true;
        }
      }
      return false;
    };

    let currentTeam = null;
    let inMayNotPlaySection = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      const lower = line.toLowerCase();
      const cleanLower = lower.replace(/\*\*/g, '').replace(/^[=#]+\s*/, '').replace(/\s*[=#]+$/, '').trim();

      // Check for team header (=== Team Name ===)
      if (isTeamHeader(lower, awayLower)) {
        currentTeam = 'away';
        inMayNotPlaySection = false; // Reset section flag for new team
        continue;
      }
      if (isTeamHeader(lower, homeLower)) {
        currentTeam = 'home';
        inMayNotPlaySection = false; // Reset section flag for new team
        continue;
      }

      // Check for MAY NOT PLAY / INJURIES section header
      // Only match short lines (actual headers like "### 1. INJURIES / MAY NOT PLAY", not sentences)
      if (cleanLower.length < 60 && (cleanLower.includes('may not play') || cleanLower.includes('injuries') || cleanLower === 'injuries:')) {
        inMayNotPlaySection = true;
        continue;
      }

      // Check for EXPECTED LINEUP section header (stop parsing injuries)
      // Only match short lines — long sentences mentioning "starting lineup" are descriptions, not headers
      if (cleanLower.length < 60 && (cleanLower.includes('expected lineup') || cleanLower.includes('starting lineup'))) {
        inMayNotPlaySection = false;
        continue;
      }

      // Only parse injury lines when we're in the MAY NOT PLAY section
      if (currentTeam && inMayNotPlaySection) {
        parseInjuryLine(line, currentTeam);
      }
    }

    return result;
  };

  if (sport === 'NBA' || sport === 'basketball_nba') {
    const strictNba = parseNbaMayNotPlay();
    if (strictNba.home.length || strictNba.away.length) {
      injuries.home = strictNba.home;
      injuries.away = strictNba.away;
      return injuries;
    }
  }

  // NHL-specific: Parse injury sections from Gemini markdown format
  // Handles formats like: **Hampus Lindholm (D) - OUT** or * Player Name - IR
  const parseNhlInjuries = () => {
    const result = { home: [], away: [] };
    if (!content) return result;

    const lines = content.split('\n');
    const homeLower = homeTeam.toLowerCase();
    const awayLower = awayTeam.toLowerCase();
    const foundPlayers = new Set();

    let currentTeam = null;
    let inInjurySection = false;

    // Detect injury section headers or team-specific sections
    const isInjurySectionStart = (lineLower) => {
      return lineLower.includes('injuries') || 
             lineLower.includes('injury report') ||
             lineLower.includes('injured') ||
             (lineLower.includes('out') && (lineLower.includes('list') || lineLower.includes('report')));
    };

    // Detect team headers like **Boston Bruins** or "Boston Bruins:"
    const isTeamHeader = (lineLower, teamLower) => {
      // Must contain the team name
      if (!lineLower.includes(teamLower)) return false;
      // Must be a header-style line (markdown bold, colon ending, or standalone team name)
      return lineLower.includes('**') || 
             lineLower.endsWith(':') || 
             lineLower.trim() === teamLower ||
             /^\s*[-*•]?\s*\*?\*?[^*]*\*?\*?\s*:?\s*$/.test(lineLower);
    };

    const shouldStopSection = (lineLower) => {
      // Stop if we hit a clearly different section
      return (lineLower.includes('goalie') && !lineLower.includes('injur')) ||
             (lineLower.includes('starting lineup') && !lineLower.includes('injur')) ||
             (lineLower.includes('power play') && !lineLower.includes('injur')) ||
             lineLower.includes('### 2.') ||  // Markdown section number change
             lineLower.includes('### 3.') ||
             lineLower.includes('line combinations') ||
             lineLower.includes('confirmed starters');
    };

    const addInjury = (team, playerName, status) => {
      if (!playerName || playerName.length < 3 || playerName.length > 35) return;
      
      // Clean markdown formatting
      playerName = playerName.replace(/\*+/g, '').trim();
      
      // Skip common false positives
      const skipWords = ['injuries', 'injury', 'team', 'roster', 'report', 'status', 'update', 'expected', 'confirmed', 'none', 'n/a'];
      if (skipWords.some(w => playerName.toLowerCase() === w || playerName.toLowerCase().includes('listed'))) return;
      
      // Skip if already found
      const key = playerName.toLowerCase();
      if (foundPlayers.has(key)) return;
      foundPlayers.add(key);

      // Normalize status - keep DTD visible as it's an uncertain status
      let normalizedStatus = (status || 'OUT').toUpperCase();
      if (normalizedStatus.includes('IR-LT') || normalizedStatus.includes('LTIR') || normalizedStatus.includes('LONG TERM')) normalizedStatus = 'IR-LT';
      else if (normalizedStatus === 'IR' || normalizedStatus.includes('INJURED RESERVE')) normalizedStatus = 'IR';
      else if (normalizedStatus.includes('DAY-TO-DAY') || normalizedStatus.includes('DAY TO DAY') || normalizedStatus === 'DTD') normalizedStatus = 'DTD';
      else if (normalizedStatus.includes('PROB')) normalizedStatus = 'Probable';
      else if (normalizedStatus.includes('QUES')) normalizedStatus = 'Questionable';
      else if (normalizedStatus.includes('DOUBT')) normalizedStatus = 'Doubtful';
      else if (normalizedStatus.includes('OUT') || normalizedStatus === 'O') normalizedStatus = 'OUT';
      else normalizedStatus = status; // Preserve original if unknown

      const nameParts = playerName.split(' ');
      result[team].push({
        player: {
          first_name: nameParts[0],
          last_name: nameParts.slice(1).join(' '),
          position: ''
        },
        status: normalizedStatus,
        source: 'rotowire'
      });
      console.log(`[Scout Report] NHL parser: Found ${playerName} (${normalizedStatus}) for ${team}`);
    };

    // Common status pattern for all line parsers
    const lineStatusPattern = 'OUT|IR|IR-LT|DTD|DAY-TO-DAY|LTIR|Probable|Questionable|Doubtful';
    
    const parseNhlInjuryLine = (line, team) => {
      // Pattern 1: **Name (D)** - OUT (most common narrative format - bold closes after position)
      const narrativePattern = new RegExp(`\\*\\*([A-Z][a-z'.-]+(?:\\s+[A-Z][a-z'.-]+)*)\\s*\\(([A-Z]{1,2})\\)\\*\\*\\s*[-–]\\s*(${lineStatusPattern})`, 'i');
      let match = line.match(narrativePattern);
      if (match) {
        addInjury(team, match[1], match[3]);
        return true;
      }

      // Pattern 2: **Name (D) - OUT** (bold includes status)
      const markdownPattern = new RegExp(`\\*\\*([A-Z][a-z'.-]+(?:\\s+[A-Z][a-z'.-]+)*)\\s*\\(([A-Z]{1,2})\\)\\s*[-–]\\s*(${lineStatusPattern})\\*\\*`, 'i');
      match = line.match(markdownPattern);
      if (match) {
        addInjury(team, match[1], match[3]);
        return true;
      }

      // Pattern 3: **Player Name** - OUT (no position)
      const simpleBoldPattern = new RegExp(`\\*\\*([A-Z][a-z'.-]+(?:\\s+[A-Z][a-z'.-]+)*)\\*\\*\\s*[-–]\\s*(${lineStatusPattern})`, 'i');
      match = line.match(simpleBoldPattern);
      if (match) {
        addInjury(team, match[1], match[2]);
        return true;
      }

      // Pattern 4: Pipe format - Player Name | Position | Status
      const pipePattern = new RegExp(`[-•*]?\\s*([A-Z][a-z'.-]+(?:\\s+[A-Z][a-z'.-]+)*)\\s*\\|\\s*(?:([A-Z]{1,3})\\s*\\|)?\\s*(${lineStatusPattern})`, 'i');
      match = line.match(pipePattern);
      if (match) {
        addInjury(team, match[1], match[3]);
        return true;
      }

      // Pattern 5: Player Name (D) - OUT (plain text with position)
      const positionPattern = new RegExp(`([A-Z][a-z'.-]+(?:\\s+[A-Z][a-z'.-]+)*)\\s*\\([A-Z]{1,2}\\)\\s*[-–]\\s*(${lineStatusPattern})`, 'i');
      match = line.match(positionPattern);
      if (match) {
        addInjury(team, match[1], match[2]);
        return true;
      }

      // Pattern 6: Player Name - OUT (simple dash format)
      const dashPattern = new RegExp(`[-•*]?\\s*([A-Z][a-z'.-]+(?:\\s+[A-Z][a-z'.-]+)*)\\s*[-–]\\s*(${lineStatusPattern})\\b`, 'i');
      match = line.match(dashPattern);
      if (match) {
        addInjury(team, match[1], match[2]);
        return true;
      }

      // Pattern 7: Status: Player Name
      const statusFirstPattern = new RegExp(`(${lineStatusPattern})\\s*[-–:]\\s*([A-Z][a-z'.-]+(?:\\s+[A-Z][a-z'.-]+)*)`, 'i');
      match = line.match(statusFirstPattern);
      if (match) {
        addInjury(team, match[2], match[1]);
        return true;
      }

      return false;
    };

    // First pass: look for injury section with team subsections
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const lower = line.toLowerCase();

      // Check for injury section start
      if (isInjurySectionStart(lower)) {
        inInjurySection = true;
        continue;
      }

      // Check for team headers within injury section
      if (inInjurySection) {
        if (isTeamHeader(lower, awayLower)) {
          currentTeam = 'away';
          continue;
        }
        if (isTeamHeader(lower, homeLower)) {
          currentTeam = 'home';
          continue;
        }

        // Check if we should stop the injury section entirely
        if (shouldStopSection(lower)) {
          if (!lower.includes(homeLower) && !lower.includes(awayLower)) {
            inInjurySection = false;
            currentTeam = null;
          }
          continue;
        }

        // Parse injury lines if we have a current team
        if (currentTeam) {
          parseNhlInjuryLine(line, currentTeam);
        }
      }
    }

    // Second pass: ALWAYS run flexible parsing to supplement line-by-line results
    // This catches injuries that might be on a single line or in unusual formatting
    console.log('[Scout Report] NHL parser: Running flexible full-text parsing');

    const fullText = content;

    // Multiple patterns to catch all injury formats in full text
    // Status options: OUT, IR, IR-LT, IR-NR, DTD, DAY-TO-DAY, LTIR, Probable, Questionable, Doubtful
    const statusPattern = 'OUT|IR-LT|IR-NR|IR|DTD|DAY-TO-DAY|LTIR|Probable|Questionable|Doubtful';

    // ROTOWIRE EXACT FORMAT PATTERN - CRITICAL!
    // RotoWire shows injuries as: "D Ryan Ellis IR" or "LW K. Marchenko DTD"
    // Format: [Position] [Name] [Status] - can be on SAME LINE (space-separated)
    // IMPORTANT: NO ^ or $ anchors - grounding often returns multiple injuries on one line
    // Example: "D Ryan Ellis IR D Shea Weber IR-LT" - must match BOTH
    // Also captures optional duration info after status (e.g., "| since Nov 15, missed 20 games")
    const rotoWirePattern = /\b([CLDRGW]{1,2})\s+([A-Z][a-z'.-]+(?:\s+[A-Z][a-z'.-]+)*)\s+(IR-LT|IR-NR|IR|OUT|DTD|LTIR)\b(?:\s*\|?\s*([^|D\n]{5,50}))?/gi;

    // First, try RotoWire exact format (highest priority)
    const rotoWireMatches = [...fullText.matchAll(rotoWirePattern)];
    for (const match of rotoWireMatches) {
      const position = match[1];
      const playerName = match[2];
      const status = match[3];
      const durationText = match[4]?.trim() || '';

      // Find team context by looking back
      const matchIndex = match.index;
      const contextStart = Math.max(0, matchIndex - 500);
      const context = fullText.substring(contextStart, matchIndex).toLowerCase();

      let team = null;
      const homeIdx = context.lastIndexOf(homeLower);
      const awayIdx = context.lastIndexOf(awayLower);

      if (homeIdx > awayIdx && homeIdx !== -1) {
        team = 'home';
      } else if (awayIdx > homeIdx && awayIdx !== -1) {
        team = 'away';
      }

      if (team && playerName) {
        // Extract duration info if present
        let daysSinceOut = null;
        let outSinceStr = null;

        if (durationText) {
          // Parse "since [date]" or "missed X games" from duration text
          const sinceMatch = durationText.match(/since\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[.\s]*(\d{1,2})?/i);
          const missedMatch = durationText.match(/missed\s+(\d+)/i);
          const seasonMatch = durationText.match(/season[-\s]?long|out\s+for\s+(the\s+)?season/i);

          if (sinceMatch) {
            const monthMap = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
            const monthNum = monthMap[sinceMatch[1].toLowerCase()];
            const day = sinceMatch[2] ? parseInt(sinceMatch[2], 10) : 1;
            const now = new Date();
            let year = now.getFullYear();
            if (monthNum > now.getMonth()) year -= 1;
            const outDate = new Date(year, monthNum, day);
            daysSinceOut = Math.floor((now - outDate) / (1000 * 60 * 60 * 24));
            outSinceStr = outDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            console.log(`[Scout Report] NHL duration parsed: ${playerName} out since ${outSinceStr} (${daysSinceOut} days)`);
          } else if (missedMatch) {
            const games = parseInt(missedMatch[1], 10);
            daysSinceOut = Math.round(games * 2.5); // ~2.5 days per NHL game
            console.log(`[Scout Report] NHL duration parsed: ${playerName} missed ${games} games (~${daysSinceOut} days)`);
          } else if (seasonMatch) {
            daysSinceOut = 120; // Season-long = ~4 months
            console.log(`[Scout Report] NHL duration parsed: ${playerName} season-long injury`);
          }
        }

        console.log(`[Scout Report] NHL RotoWire format found: ${position} ${playerName} ${status} -> ${team}${daysSinceOut ? ` (${daysSinceOut} days out)` : ''}`);

        // Add injury with duration info
        const nameParts = playerName.trim().split(/\s+/);
        const normalizedStatus = normalizeStatus(status);
        result[team].push({
          player: {
            first_name: nameParts[0],
            last_name: nameParts.slice(1).join(' '),
            position: position
          },
          status: normalizedStatus,
          daysSinceReport: daysSinceOut,
          reportDateStr: outSinceStr,
          duration: daysSinceOut > 45 ? 'SEASON-LONG' : daysSinceOut > 21 ? 'SHORT-TERM' : daysSinceOut > 3 ? 'EXTENDED' : 'FRESH',
          source: 'rotowire'
        });
      }
    }

    // If RotoWire format found injuries, return early
    if (result.home.length > 0 || result.away.length > 0) {
      console.log(`[Scout Report] NHL RotoWire parser found: ${result.home.length} home, ${result.away.length} away injuries`);
      return result;
    }

    const flexiblePatterns = [
      // Pattern A: **Name (D)** - OUT (markdown bold closes AFTER position, status is outside)
      // This is the most common narrative format: **Hampus Lindholm (D)** - OUT - details
      new RegExp(`\\*\\*([A-Z][a-z'.-]+(?:\\s+[A-Z][a-z'.-]+)*)\\s*\\(([A-Z]{1,2})\\)\\*\\*\\s*[-–]\\s*(${statusPattern})`, 'gi'),
      // Pattern B: **Name (D) - OUT** (markdown bold includes status)
      new RegExp(`\\*\\*([A-Z][a-z'.-]+(?:\\s+[A-Z][a-z'.-]+)*)\\s*\\(([A-Z]{1,2})\\)\\s*[-–]\\s*(${statusPattern})\\*\\*`, 'gi'),
      // Pattern C: Asterisk bullets - *   **Player Name (D)** - OUT
      new RegExp(`\\*\\s+\\*\\*([A-Z][a-z'.-]+(?:\\s+[A-Z][a-z'.-]+)*)\\s*\\(([A-Z]{1,2})\\)\\*\\*\\s*[-–]\\s*(${statusPattern})`, 'gi'),
      // Pattern D: Simple markdown - **Player Name** - OUT
      new RegExp(`\\*\\*([A-Z][a-z'.-]+(?:\\s+[A-Z][a-z'.-]+)*)\\*\\*\\s*[-–]\\s*(${statusPattern})`, 'gi'),
      // Pattern E: Plain text with position - Player Name (D) - OUT
      new RegExp(`([A-Z][a-z'.-]+(?:\\s+[A-Z][a-z'.-]+)*)\\s*\\([A-Z]{1,2}\\)\\s*[-–]\\s*(${statusPattern})`, 'gi'),
      // Pattern F: Pipe format - Name | Position | Status
      new RegExp(`[-•*]?\\s*([A-Z][a-z'.-]+(?:\\s+[A-Z][a-z'.-]+)*)\\s*\\|\\s*([A-Z]{1,3})\\s*\\|\\s*(${statusPattern})`, 'gi'),
      // Pattern G: Name - Status (no position)
      new RegExp(`[-•*]?\\s*([A-Z][a-z'.-]+(?:\\s+[A-Z][a-z'.-]+)*)\\s*[-–]\\s*(${statusPattern})\\b`, 'gi')
    ];
    
    for (const pattern of flexiblePatterns) {
      pattern.lastIndex = 0; // Reset regex state
      const matches = [...fullText.matchAll(pattern)];
      
      for (const match of matches) {
        // Determine which capture group has the player name and status
        let playerName, status;
        if (match[3]) {
          playerName = match[1];
          status = match[3];
        } else {
          playerName = match[1];
          status = match[2];
        }
        
        const matchIndex = match.index;
        
        // Look back ~300 chars to find team context
        const contextStart = Math.max(0, matchIndex - 300);
        const context = fullText.substring(contextStart, matchIndex).toLowerCase();
        
        let team = null;
        const homeIdx = context.lastIndexOf(homeLower);
        const awayIdx = context.lastIndexOf(awayLower);
        
        if (homeIdx > awayIdx && homeIdx !== -1) {
          team = 'home';
        } else if (awayIdx > homeIdx && awayIdx !== -1) {
          team = 'away';
        }
        
        if (team && playerName) {
          addInjury(team, playerName, status);
        }
      }
    }

    console.log(`[Scout Report] NHL strict parser found: ${result.home.length} home, ${result.away.length} away injuries`);
    return result;
  };

  if (sport === 'NHL' || sport === 'icehockey_nhl') {
    const strictNhl = parseNhlInjuries();
    if (strictNhl.home.length || strictNhl.away.length) {
      injuries.home = strictNhl.home;
      injuries.away = strictNhl.away;
      console.log(`[Scout Report] NHL strict parser found: ${strictNhl.home.length} home, ${strictNhl.away.length} away injuries`);
      return injuries;
    }
    console.log(`[Scout Report] NHL strict parser found 0 injuries, falling back to generic parser`);
  }

  // NCAAB-specific parser: Handles RotoWire format "F Mookie Cook Out" or "PG John Smith OFS"
  // Format: [Position] [Name] [Status] - no separator between name and status
  const parseNcaabInjuries = () => {
    const result = { home: [], away: [], filteredLongTerm: [] };
    if (!content) return result;

    const homeLower = homeTeam.toLowerCase();
    const awayLower = awayTeam.toLowerCase();
    const foundPlayers = new Set();

    // NCAAB ROTOWIRE EXACT FORMAT PATTERN
    // Format: Position Name Status (e.g., "F Mookie Cook Out", "G John Smith GTD", "C Mike Jones OFS")
    // Positions: PG, SG, SF, PF, C, G, F
    // Status: Out, OFS (Out For Season), GTD (Game Time Decision)
    // IMPORTANT: NO separators - just space between name and status
    // IMPORTANT: NO ^ or $ anchors - grounding often returns multiple injuries on one line
    // Example: "F Mookie Cook Out F Kristers Skrinda Out F Tallis Toure Out" - must match ALL
    const ncaabRotoWirePattern = /\b(PG|SG|SF|PF|C|G|F)\s+([A-Z][a-z'.-]+(?:\s+[A-Z][a-z'.-]+)*)\s+(Out|OFS|GTD)\b/gi;

    const fullText = content;
    const matches = [...fullText.matchAll(ncaabRotoWirePattern)];

    console.log(`[Scout Report] NCAAB parser: Found ${matches.length} potential injuries in grounding response`);

    for (const match of matches) {
      const position = match[1];
      const playerName = match[2];
      const status = match[3];

      // Skip if already found
      const playerKey = playerName.toLowerCase();
      if (foundPlayers.has(playerKey)) continue;

      // Find team context by looking back from match position
      const matchIndex = match.index;
      const contextStart = Math.max(0, matchIndex - 500);
      const context = fullText.substring(contextStart, matchIndex).toLowerCase();

      let team = null;
      const homeIdx = context.lastIndexOf(homeLower);
      const awayIdx = context.lastIndexOf(awayLower);

      if (homeIdx > awayIdx && homeIdx !== -1) {
        team = 'home';
      } else if (awayIdx > homeIdx && awayIdx !== -1) {
        team = 'away';
      }

      if (team && playerName) {
        foundPlayers.add(playerKey);

        // Normalize NCAAB status
        let normalizedStatus = status.toUpperCase();
        if (normalizedStatus === 'OFS') normalizedStatus = 'Out (Season)';
        else if (normalizedStatus === 'GTD') normalizedStatus = 'GTD';
        else normalizedStatus = 'Out';

        const nameParts = playerName.trim().split(/\s+/);
        result[team].push({
          player: {
            first_name: nameParts[0],
            last_name: nameParts.slice(1).join(' '),
            position: position
          },
          status: normalizedStatus,
          source: 'rotowire'
        });
        console.log(`[Scout Report] NCAAB parser: Found ${position} ${playerName} ${status} -> ${team}`);
      }
    }

    // If RotoWire pattern didn't catch injuries, try alternate formats common in NCAAB
    // Format: "- Position Initial. LastName Status" (e.g., "- F M. Cook Out")
    if (result.home.length === 0 && result.away.length === 0) {
      const altPattern = /[-•*]\s*(PG|SG|SF|PF|C|G|F)\s+([A-Z]\.\s*[A-Z][a-z'.-]+(?:\s+[A-Z][a-z'.-]+)?)\s+(Out|OFS|GTD)\b/gi;
      const altMatches = [...fullText.matchAll(altPattern)];

      for (const match of altMatches) {
        const position = match[1];
        const playerName = match[2].replace(/\.\s*/, '. '); // Normalize "M.Cook" to "M. Cook"
        const status = match[3];

        const playerKey = playerName.toLowerCase();
        if (foundPlayers.has(playerKey)) continue;

        const matchIndex = match.index;
        const contextStart = Math.max(0, matchIndex - 500);
        const context = fullText.substring(contextStart, matchIndex).toLowerCase();

        let team = null;
        const homeIdx = context.lastIndexOf(homeLower);
        const awayIdx = context.lastIndexOf(awayLower);

        if (homeIdx > awayIdx && homeIdx !== -1) {
          team = 'home';
        } else if (awayIdx > homeIdx && awayIdx !== -1) {
          team = 'away';
        }

        if (team && playerName) {
          foundPlayers.add(playerKey);
          let normalizedStatus = status.toUpperCase();
          if (normalizedStatus === 'OFS') normalizedStatus = 'Out (Season)';
          else if (normalizedStatus === 'GTD') normalizedStatus = 'GTD';
          else normalizedStatus = 'Out';

          const nameParts = playerName.trim().split(/\s+/);
          result[team].push({
            player: {
              first_name: nameParts[0],
              last_name: nameParts.slice(1).join(' '),
              position: position
            },
            status: normalizedStatus,
            source: 'rotowire'
          });
          console.log(`[Scout Report] NCAAB alt parser: Found ${position} ${playerName} ${status} -> ${team}`);
        }
      }
    }

    console.log(`[Scout Report] NCAAB parser found: ${result.home.length} home, ${result.away.length} away injuries`);
    return result;
  };

  if (sport === 'NCAAB' || sport === 'basketball_ncaab') {
    const strictNcaab = parseNcaabInjuries();
    if (strictNcaab.home.length || strictNcaab.away.length) {
      injuries.home = strictNcaab.home;
      injuries.away = strictNcaab.away;
      injuries.filteredLongTerm = strictNcaab.filteredLongTerm || [];
      return injuries;
    }
    console.log(`[Scout Report] NCAAB strict parser found 0 injuries, falling back to generic parser`);
  }

  // Split content into sections by team (pass other team to find boundary)
  const homeSection = extractTeamSection(content, homeTeam, awayTeam);
  const awaySection = extractTeamSection(content, awayTeam, homeTeam);
  
  // Extract injuries from each section with multiple pattern types
  const extractFromSection = (section, team) => {
    const found = [];
    
    // Patterns to match various injury formats
    const patterns = [
      // "Player Name - OUT - injury type" or "Player Name - IR - upper body"
      /([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)\s*[-–:]\s*(OUT|Out|IR|LTIR|Doubtful|Questionable|GTD|Day-to-Day)/gi,
      // "OUT: Player Name" or "IR: Player Name"
      /(OUT|IR|LTIR|Doubtful|Questionable|GTD)\s*[-–:]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)/gi,
      // "Player Name (OUT)" or "Player Name (IR)"
      /([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)\s*\((OUT|Out|IR|LTIR|Doubtful|Questionable|GTD|Day-to-Day|injured reserve)\)/gi,
      // "Player Name is out" or "Player Name remains out"  
      /([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)\s+(?:is|remains|was|has been)\s+(out|on IR|on LTIR|doubtful|questionable)/gi,
      // Bullet point format: "• Player Name - Status"
      /[•\-\*]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)\s*[-–:]\s*(OUT|Out|IR|LTIR|Doubtful|Questionable|GTD)/gi,
      // NHL specific: "Player Name (upper body)" implies IR/Out
      /([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)\s*\((upper body|lower body|illness|undisclosed)\)/gi
    ];
    
    for (const pattern of patterns) {
      let match;
      pattern.lastIndex = 0; // Reset regex state
      
      while ((match = pattern.exec(section)) !== null) {
        let playerName, status;
        
        // Handle different capture group orders
        if (match[1] && /^(OUT|IR|LTIR|Doubtful|Questionable|GTD)$/i.test(match[1])) {
          // Status first, then name
          status = match[1];
          playerName = match[2];
        } else {
          // Name first, then status
          playerName = match[1];
          status = match[2] || 'Out';
        }
        
        // Clean up player name
        playerName = playerName?.trim();
        if (!playerName || playerName.length < 3) continue;
        
        // Skip common false positives
        const skipWords = ['injuries', 'injury', 'team', 'roster', 'report', 'status', 'update'];
        if (skipWords.some(w => playerName.toLowerCase().includes(w))) continue;
        
        // Prevent duplicates
        const playerKey = playerName.toLowerCase();
        if (foundPlayers.has(playerKey)) continue;
        foundPlayers.add(playerKey);
        
        const nameParts = playerName.split(' ');
        // Get surrounding context to extract duration
        const matchStart = Math.max(0, match.index - 50);
        const matchEnd = Math.min(section.length, match.index + match[0].length + 100);
        const contextText = section.substring(matchStart, matchEnd);
        const durationInfo = extractDuration(contextText);
        
        // IR status usually means long-term unless marked recent
        const normalizedStatus = normalizeStatus(status);
        if ((normalizedStatus === 'IR' || normalizedStatus === 'LTIR') && durationInfo.duration === 'UNKNOWN') {
          durationInfo.duration = 'SEASON-LONG';
          durationInfo.isEdge = false;
          durationInfo.note = 'IR = typically season-long, team adjusted';
        }
        
        found.push({
          player: {
            first_name: nameParts[0],
            last_name: nameParts.slice(1).join(' '),
            position: ''
          },
          status: normalizedStatus,
          injuryType: status.toLowerCase().includes('body') || status.toLowerCase().includes('illness') ? status : '',
          duration: durationInfo.duration,
          isEdge: durationInfo.isEdge,
          durationNote: durationInfo.note,
          reportDateStr: durationInfo.outSinceDate,
          daysSinceReport: durationInfo.daysSinceOut,
          source: 'gemini_grounding'
        });
      }
    }
    
    return found;
  };
  
  injuries.home = extractFromSection(homeSection, homeTeam);
  injuries.away = extractFromSection(awaySection, awayTeam);
  
  // If we still have no injuries, try a more aggressive whole-content search
  if (injuries.home.length === 0 && injuries.away.length === 0) {
    console.log('[Scout Report] No injuries found with section parsing, trying whole-content search');
    
    // Try to find ANY player-status pairs in the whole content
    const wholeContentPatterns = [
      /([A-Z][a-z]+\s+[A-Z][a-z']+(?:\s+[A-Z][a-z']+)?)\s*[-–:]\s*(OUT|IR|LTIR)/gi,
      /([A-Z][a-z]+\s+[A-Z][a-z']+)\s+(?:is|remains)\s+(out|on IR)/gi
    ];
    
    for (const pattern of wholeContentPatterns) {
      let match;
      pattern.lastIndex = 0;
      
      while ((match = pattern.exec(content)) !== null) {
        const playerName = match[1]?.trim();
        const status = match[2];
        
        if (!playerName || playerName.length < 3) continue;
        const playerKey = playerName.toLowerCase();
        if (foundPlayers.has(playerKey)) continue;
        foundPlayers.add(playerKey);
        
        // Try to determine which team based on context
        const contextStart = Math.max(0, match.index - 100);
        const context = content.substring(contextStart, match.index + match[0].length + 50).toLowerCase();
        
        const nameParts = playerName.split(' ');
        const injury = {
          player: { first_name: nameParts[0], last_name: nameParts.slice(1).join(' '), position: '' },
          status: normalizeStatus(status),
          source: 'gemini_grounding'
        };
        
        if (context.includes(homeTeam.toLowerCase()) || context.includes(homeTeam.split(' ').pop().toLowerCase())) {
          injuries.home.push(injury);
        } else if (context.includes(awayTeam.toLowerCase()) || context.includes(awayTeam.split(' ').pop().toLowerCase())) {
          injuries.away.push(injury);
        }
      }
    }
  }
  
  return injuries;
}

// ============================================================================
// EXTRACT TEAM SECTION
// ============================================================================

function extractTeamSection(content, teamName, otherTeamName = '') {
  const contentLower = content.toLowerCase();
  const teamLower = teamName.toLowerCase();
  const otherTeamLower = otherTeamName.toLowerCase();
  
  // Find ALL positions where each team name appears
  const findAllPositions = (text, search) => {
    const positions = [];
    let pos = 0;
    while ((pos = text.indexOf(search, pos)) !== -1) {
      positions.push(pos);
      pos += 1;
    }
    return positions;
  };
  
  const teamPositions = findAllPositions(contentLower, teamLower);
  const otherTeamPositions = otherTeamLower ? findAllPositions(contentLower, otherTeamLower) : [];
  
  if (teamPositions.length === 0) return ''; // Team not found
  
  // Find the best position for this team's injury section
  // Prefer positions followed by injury-related content ("::", "injur", "out", "-")
  let bestTeamPos = -1;
  for (const pos of teamPositions) {
    const afterTeam = contentLower.substring(pos + teamLower.length, pos + teamLower.length + 30);
    // Look for markers that indicate this is a section header
    if (afterTeam.match(/^[^a-z]*(:|\*|injur|-)/i)) {
      bestTeamPos = pos;
      break;
    }
  }
  // Fallback to first position if no section header found
  if (bestTeamPos === -1) bestTeamPos = teamPositions[0];
  
  // Find the best position for other team's section (must be AFTER our team's section)
  let bestOtherPos = -1;
  for (const pos of otherTeamPositions) {
    if (pos <= bestTeamPos) continue; // Must be after our team's section
    const afterTeam = contentLower.substring(pos + otherTeamLower.length, pos + otherTeamLower.length + 30);
    if (afterTeam.match(/^[^a-z]*(:|\*|injur|-)/i)) {
      bestOtherPos = pos;
      break;
    }
  }
  // Fallback: first position after our team
  if (bestOtherPos === -1) {
    for (const pos of otherTeamPositions) {
      if (pos > bestTeamPos) {
        bestOtherPos = pos;
        break;
      }
    }
  }
  
  // Extract from this team's section to other team's section (or end)
  const sectionEnd = bestOtherPos !== -1 ? bestOtherPos : content.length;
  return content.substring(bestTeamPos, sectionEnd);
}

// ============================================================================
// FORMAT INJURY REPORT
// ============================================================================

export function formatInjuryReport(homeTeam, awayTeam, injuries, sportKey, rosterDepth = null) {
  const lines = [];

  // ADD TODAY'S DATE AT THE TOP - Gary needs this anchor to understand injury timing
  const today = new Date();
  const todayStr = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  lines.push(`TODAY'S DATE: ${todayStr}`);
  lines.push('');
  lines.push('');

  // Categorize injuries by importance/duration
  const categorize = (teamInjuries) => {
    const critical = teamInjuries.filter(i => (i.duration === 'FRESH' || i.duration === 'SHORT-TERM' || i.isEdge === true) && i.status !== 'Out' && i.status !== 'OFS');
    // OFS = Out For Season (Rotowire status code)
    const out = teamInjuries.filter(i => i.status === 'Out' || i.status === 'IR' || i.status === 'LTIR' || i.status === 'OFS' || i.status === 'Injured Reserve');
    const seasonal = teamInjuries.filter(i => i.duration === 'SEASON-LONG' && i.status !== 'Out' && i.status !== 'IR' && i.status !== 'OFS' && (i.status || '').toUpperCase() !== 'GTD');
    const others = teamInjuries.filter(i =>
      !critical.includes(i) && !out.includes(i) && !seasonal.includes(i)
    );
    return { critical, out, seasonal, others };
  };

  const homeCats = categorize(injuries.home || []);
  const awayCats = categorize(injuries.away || []);

  // Build roster lookup for team-share context (NBA only, when rosterDepth available)
  const rosterUsageLookup = new Map();
  if (rosterDepth) {
    const allRosterPlayers = [...(rosterDepth.home || []), ...(rosterDepth.away || [])];
    for (const p of allRosterPlayers) {
      if (p.name && (p.pct_pts || p.pct_ast || p.pct_fga)) {
        rosterUsageLookup.set(p.name.toLowerCase().trim(), {
          pct_pts: p.pct_pts || 0,
          pct_reb: p.pct_reb || 0,
          pct_fga: p.pct_fga || 0,
          pct_ast: p.pct_ast || 0
        });
      }
    }
  }

  // Helper to find usage data for an injured player via name matching
  const getPlayerUsage = (playerName) => {
    const nameLower = (playerName || '').toLowerCase().trim();
    if (!nameLower || rosterUsageLookup.size === 0) return null;
    // Direct match first
    if (rosterUsageLookup.has(nameLower)) return rosterUsageLookup.get(nameLower);
    // Fuzzy match (handles hyphenated names etc.)
    for (const [rosterName, usage] of rosterUsageLookup) {
      if (playerNamesMatch(nameLower, rosterName)) return usage;
    }
    return null;
  };

  const formatPlayer = (i) => {
    const name = `${i.player?.first_name || i.firstName || ''} ${i.player?.last_name || i.lastName || ''}`.trim() || i.name || 'Unknown';
    const pos = i.player?.position_abbreviation || i.player?.position || i.position || '';
    const reason = i.description || i.comment || i.injury || '';
    const shortReason = reason ? ` - ${reason.split('.')[0].substring(0, 60)}` : '';

    // Build duration tag with ACTUAL DATE, days, and games missed for Gary to see clearly
    let durationTag = '';
    const days = i.daysSinceReport;
    const reportDate = i.reportDateStr; // e.g., "Jan 8"

    // Games-missed label — factual count, no conclusions
    const gm = i.gamesMissed;
    const gmMin = i.gamesMissedIsMinimum;
    let gmLabel = '';
    if (gm !== null && gm !== undefined && gm >= 0) {
      gmLabel = `, ${gmMin ? `${gm}+` : gm} game${gm !== 1 ? 's' : ''} missed`;
    }

    // Show actual date, days ago, AND games missed for maximum clarity
    let timeInfo = '';
    if (reportDate && days !== null && days !== undefined) {
      timeInfo = ` — Since ${reportDate} (${days}d${gmLabel})`;
    } else if (days !== null && days !== undefined) {
      timeInfo = ` (${days}d${gmLabel})`;
    } else if (reportDate) {
      timeInfo = ` — Since ${reportDate}${gmLabel}`;
    } else if (gmLabel) {
      timeInfo = ` (${gmLabel.substring(2)})`;
    }

    // Factual duration labels — just the facts, no conclusions about line movement
    // GTD checked FIRST — a GTD player might return regardless of how long they were out
    const isNcaab = sportKey && (sportKey.includes('ncaab') || sportKey.includes('NCAAB'));
    const isNhl = sportKey && (sportKey.includes('nhl') || sportKey.includes('NHL'));

    if (i.status?.toUpperCase() === 'GTD') {
      const durationContext = days ? ` - was out ${days}d` : '';
      durationTag = ` [GTD${durationContext}]`;
    } else if (i.duration === 'SEASON-LONG' || i.status === 'Injured Reserve' || i.status === 'IR' || i.status === 'LTIR' || i.status === 'OFS') {
      durationTag = ` [SEASON-LONG]`;
    } else if (i.duration === 'LONG-TERM') {
      durationTag = ` [LONG-TERM${timeInfo}]`;
    } else if (i.duration === 'FRESH') {
      durationTag = ` [FRESH${timeInfo}]`;
    } else if (i.duration === 'SHORT-TERM') {
      durationTag = ` [SHORT-TERM${timeInfo}]`;
    } else if (i.duration === 'PRICED IN') {
      durationTag = ` [PRICED IN${timeInfo}]`;
    } else if (days !== null && days !== undefined) {
      durationTag = ` [OUT${timeInfo}]`;
    }

    if (!durationTag && (i.status === 'IR' || i.status === 'Injured Reserve' || i.status === 'LTIR' || i.status === 'OFS' ||
        (i.description && i.description.toLowerCase().includes('injured reserve')))) {
      durationTag = ' [Out For Season]';
    }

    // Probable = expected to play (~75%+ chance). NOT out — do not label as OUT.
    if (!durationTag && (i.status === 'Prob' || i.status === 'Probable')) {
      durationTag = ' [Probable — Expected to Play]';
    }

    // Fallback: no duration info resolved
    if (!durationTag && !reportDate && days === null) {
      durationTag = ' [OUT - duration unknown]';
    }

    let result = `  • ${name}${pos ? ` (${pos})` : ''} (${i.status || 'Unknown'})${shortReason}${durationTag}`;

    // Add team-share context for OUT/DOUBTFUL players (NBA only)
    // Shows what % of team production is missing — helps Gary assess line adjustment
    const statusUp = (i.status || '').toUpperCase();
    const isOut = statusUp.includes('OUT') || statusUp === 'IR' || statusUp === 'LTIR' || statusUp === 'OFS' || statusUp === 'DOUBTFUL';
    if (isOut) {
      const usage = getPlayerUsage(name);
      if (usage && (usage.pct_pts > 0.05 || usage.pct_ast > 0.05)) {
        const shareParts = [];
        if (usage.pct_pts) shareParts.push(`${(usage.pct_pts * 100).toFixed(1)}% PTS`);
        if (usage.pct_reb) shareParts.push(`${(usage.pct_reb * 100).toFixed(1)}% REB`);
        if (usage.pct_fga) shareParts.push(`${(usage.pct_fga * 100).toFixed(1)}% FGA`);
        result += `\n      Team Share: ${shareParts.join(' | ')}`;
      }
    }

    return result;
  };

  // Split injuries into two structural tiers per team
  const splitTeam = (cats) => {
    // Active = new developments that may not be reflected in recent form/line
    const recentOut = cats.out.filter(i => i.duration === 'FRESH' || i.isEdge === true);
    const questionableGtd = cats.others.filter(i => i.status !== 'Prob' && i.status !== 'Probable');
    const probable = cats.others.filter(i => i.status === 'Prob' || i.status === 'Probable');
    const active = [...cats.critical, ...recentOut, ...questionableGtd, ...probable];

    // Established = team has been playing without these players
    const midSeasonOut = cats.out.filter(i => i.duration === 'SHORT-TERM');
    const seasonLongOut = cats.out.filter(i =>
      i.duration === 'SEASON-LONG' || i.status === 'IR' || i.status === 'LTIR' || i.status === 'OFS' || i.status === 'Injured Reserve'
    );
    const unknownOut = cats.out.filter(i =>
      !recentOut.includes(i) && !midSeasonOut.includes(i) && !seasonLongOut.includes(i)
    );
    const established = [...midSeasonOut, ...seasonLongOut, ...cats.seasonal, ...unknownOut];

    return { active, established, recentOut, questionableGtd, probable, midSeasonOut, seasonLongOut, unknownOut };
  };

  const homeSplit = splitTeam(homeCats);
  const awaySplit = splitTeam(awayCats);

  // ── TIER 1: ACTIVE INJURIES ──
  const hasAnyActive = homeSplit.active.length > 0 || awaySplit.active.length > 0;
  if (hasAnyActive) {
    lines.push('ACTIVE INJURIES');
    lines.push('────────────────────────────────────────');

    const renderActive = (teamName, cats, split, locationTag) => {
      const parts = [];
      if (cats.critical.length > 0) {
        cats.critical.forEach(i => parts.push(formatPlayer(i)));
      }
      if (split.recentOut.length > 0) {
        split.recentOut.forEach(i => parts.push(formatPlayer(i)));
      }
      if (split.questionableGtd.length > 0) {
        split.questionableGtd.forEach(i => parts.push(formatPlayer(i)));
      }
      if (split.probable.length > 0) {
        split.probable.forEach(i => parts.push(formatPlayer(i)));
      }
      if (parts.length > 0) {
        lines.push(`${locationTag} ${teamName}:`);
        parts.forEach(p => lines.push(p));
        lines.push('');
      }
    };

    renderActive(homeTeam, homeCats, homeSplit, '[HOME]');
    renderActive(awayTeam, awayCats, awaySplit, '[AWAY]');
  }

  // ── TIER 2: ESTABLISHED ABSENCES ──
  const hasAnyEstablished = homeSplit.established.length > 0 || awaySplit.established.length > 0;
  if (hasAnyEstablished) {
    lines.push('ESTABLISHED ABSENCES (already reflected in line + all stats above — do NOT cite these players by name as reasons for your pick)');
    lines.push('────────────────────────────────────────');

    const renderEstablished = (teamName, split, locationTag) => {
      if (split.established.length === 0) return;
      lines.push(`${locationTag} ${teamName}:`);
      split.established.forEach(i => lines.push(formatPlayer(i)));
      lines.push('');
    };

    renderEstablished(homeTeam, homeSplit, '[HOME]');
    renderEstablished(awayTeam, awaySplit, '[AWAY]');
  }

  // No injuries at all
  if (!hasAnyActive && !hasAnyEstablished) {
    lines.push(`[HOME] ${homeTeam}: No injuries reported`);
    lines.push(`[AWAY] ${awayTeam}: No injuries reported`);
    lines.push('');
  }


  return lines.join('\n');
}

// ============================================================================
// FORMAT STARTING LINEUPS
// ============================================================================

export function formatStartingLineups(homeTeam, awayTeam, lineups) {
  if (!lineups || (!lineups.home?.length && !lineups.away?.length)) return '';

  const lines = ['STARTING LINEUPS (PROBABLE/CONFIRMED)'];
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  if (lineups.away?.length) {
    lines.push(`[AWAY] ${awayTeam}: ${lineups.away.map(p => `${p.name}${p.position ? ` (${p.position})` : ''}`).join(', ')}`);
  }
  
  if (lineups.home?.length) {
    lines.push(`[HOME] ${homeTeam}: ${lineups.home.map(p => `${p.name}${p.position ? ` (${p.position})` : ''}`).join(', ')}`);
  }
  
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  return lines.join('\n');
}

// ============================================================================
// FORMAT ODDS, MONEYLINE
// ============================================================================

// formatSituationalFactors removed — Layer 3 violation (told Gary what factors mean)

export function formatOdds(game, sport = '') {
  const lines = [];
  const isNHL = sport === 'icehockey_nhl' || sport === 'NHL';

  // Spread - SKIP FOR NHL (NHL is moneyline only, no puck lines)
  let spreadValue = null;
  let spreadOdds = null;
  if (isNHL) {
    lines.push('NHL IS MONEYLINE ONLY - No puck lines, no spreads');
    spreadValue = null; // Explicitly null for NHL
    spreadOdds = null;
  } else if (game.spread_home !== undefined && game.spread_home !== null) {
    const homeSpread = parseFloat(game.spread_home);
    const awaySpread = -homeSpread;
    spreadValue = homeSpread;
    spreadOdds = game.spread_home_odds || game.spread_odds || null;
    // Always present away @ home convention for deterministic data presentation
    lines.push(`Spread: ${game.away_team} ${awaySpread > 0 ? '+' : ''}${awaySpread.toFixed(1)} | ${game.home_team} ${homeSpread > 0 ? '+' : ''}${homeSpread.toFixed(1)} (${spreadOdds})`);
  } else if (game.spreads) {
    lines.push(`Spread: ${game.spreads}`);
  } else {
    lines.push('Spread: Not available');
  }

  // Moneyline
  let mlHome = null;
  let mlAway = null;
  if (game.moneyline_home !== undefined && game.moneyline_away !== undefined) {
    mlHome = game.moneyline_home;
    mlAway = game.moneyline_away;
    lines.push(`Moneyline: ${game.away_team} ${formatMoneyline(mlAway)} | ${game.home_team} ${formatMoneyline(mlHome)}`);
  } else if (game.h2h) {
    lines.push(`Moneyline: ${game.h2h}`);
  }

  // Total - parse for database storage but do NOT display to Gary
  let totalValue = null;
  if (game.total !== undefined && game.total !== null) {
    totalValue = parseFloat(game.total);
  }

  // Add raw values for Gary to include in JSON output
  lines.push('');
  if (isNHL) {
    lines.push('RAW ODDS VALUES (NHL - MONEYLINE ONLY):');
    lines.push('  spread: null  ← NHL does not use puck lines');
    lines.push('  spreadOdds: null');
  } else {
    lines.push('RAW ODDS VALUES (copy these to your JSON output):');
    lines.push(`  spread: ${spreadValue !== null ? spreadValue : 'null'}`);
    lines.push(`  spreadOdds: ${spreadOdds}`);
  }
  lines.push(`  moneylineHome: ${mlHome !== null ? mlHome : 'null'}`);
  lines.push(`  moneylineAway: ${mlAway !== null ? mlAway : 'null'}`);

  return lines.join('\n') || 'Odds not available';
}

function formatMoneyline(ml) {
  const num = parseFloat(ml);
  return num > 0 ? `+${num}` : num.toString();
}

// ============================================================================
// DETECT RETURNING PLAYERS
// ============================================================================

export function detectReturningPlayers(rosterDepth, injuries, recentHome, recentAway, homeTeam, awayTeam) {
  if (!rosterDepth) return '';

  const results = [];

  const teamConfigs = [
    { label: 'HOME', players: rosterDepth.home, l5: rosterDepth.homeL5, recent: recentHome, inj: injuries?.home || [], name: homeTeam },
    { label: 'AWAY', players: rosterDepth.away, l5: rosterDepth.awayL5, recent: recentAway, inj: injuries?.away || [], name: awayTeam }
  ];

  for (const { label, players, l5, recent, inj, name } of teamConfigs) {
    if (!players || !l5?.playersByGame) continue;

    const playersByGame = l5.playersByGame;
    // Get game IDs that actually have player data (filters out today's unplayed game)
    const allGameIds = (recent || []).map(g => g.id).filter(Boolean).slice(0, 5);
    const gameIds = allGameIds.filter(gid => playersByGame[gid] && playersByGame[gid].length > 0).slice(0, 3);
    if (gameIds.length < 2) continue;

    // recentGames is sorted most-recent-first from fetchRecentGames
    // gameIds[0] is the most recent PLAYED game (not today's unplayed game)
    const lastGameId = gameIds[0];
    // Build set of players who played in the last game
    const lastGamePlayers = new Set();
    for (const p of (playersByGame[lastGameId] || [])) {
      lastGamePlayers.add(p.name.toLowerCase().trim());
    }

    // Build map: playerName → count of games they appeared in (out of L5)
    const playerGameCounts = {};
    for (const gid of gameIds) {
      for (const p of (playersByGame[gid] || [])) {
        const pName = p.name.toLowerCase().trim();
        playerGameCounts[pName] = (playerGameCounts[pName] || 0) + 1;
      }
    }

    // Get OUT/DOUBTFUL players from injury report
    const outPlayers = new Set();
    for (const injury of inj) {
      const status = (injury.status || '').toLowerCase();
      if (status === 'out' || status.startsWith('out') || status.includes('out for season') || status === 'doubtful' || status.includes('suspended')) {
        const pName = typeof injury.player === 'string' ? injury.player :
          `${injury.player?.first_name || ''} ${injury.player?.last_name || ''}`.trim();
        outPlayers.add(pName.toLowerCase().trim());
      }
    }

    // Check each roster player for returning status
    const returning = [];
    for (const player of players) {
      const pName = (player.name || `${player.first_name || ''} ${player.last_name || ''}`).trim();
      const pNameLower = pName.toLowerCase();

      // Skip if they played in the last game (exact or fuzzy)
      if (lastGamePlayers.has(pNameLower)) continue;
      if ([...lastGamePlayers].some(lp => playerNamesMatch(lp, pNameLower))) continue;

      // Skip if they are OUT/DOUBTFUL
      if (outPlayers.has(pNameLower)) continue;
      if ([...outPlayers].some(op => playerNamesMatch(op, pNameLower))) continue;

      // Count how many of the L5 games they played in
      const gamesPlayed = playerGameCounts[pNameLower] ||
        Object.entries(playerGameCounts).find(([k]) => playerNamesMatch(k, pNameLower))?.[1] || 0;
      const gamesMissed = gameIds.length - gamesPlayed;

      // Only flag if they missed the last game and are a meaningful player
      if (gamesMissed >= 1) {
        // NCAAB has ppg (string, per-game), pts (total season); NBA has pts (per-game number)
        const ppg = parseFloat(player.ppg) || player.pts || 0;
        const rpg = parseFloat(player.reb) || 0;
        const apg = parseFloat(player.ast) || 0;

        // Check if they have an injury status (QUESTIONABLE/PROBABLE/GTD)
        let injuryStatus = 'Available';
        for (const injury of inj) {
          const injName = typeof injury.player === 'string' ? injury.player :
            `${injury.player?.first_name || ''} ${injury.player?.last_name || ''}`.trim();
          if (playerNamesMatch(injName, pName)) {
            injuryStatus = `${injury.status}${injury.injury ? ` (${injury.injury})` : ''}`;
            break;
          }
        }

        returning.push({
          name: pName,
          gamesMissed,
          gamesPlayed,
          ppg: typeof ppg === 'number' ? ppg.toFixed(1) : ppg,
          rpg: typeof rpg === 'number' ? rpg.toFixed(1) : rpg,
          apg: typeof apg === 'number' ? apg.toFixed(1) : apg,
          injuryStatus,
          // Team-share percentages for impact context
          pct_pts: player.pct_pts || 0,
          pct_ast: player.pct_ast || 0,
          pct_fga: player.pct_fga || 0,
          pct_reb: player.pct_reb || 0
        });
      }
    }

    if (returning.length > 0) {
      returning.sort((a, b) => parseFloat(b.ppg) - parseFloat(a.ppg));
      console.log(`[Returning Players] ${name}: ${returning.map(r => `${r.name} (${r.ppg} PPG, missed ${r.gamesMissed})`).join(', ')}`);
      results.push({ team: name, players: returning });
    }
  }

  if (results.length === 0) return '';

  const lines = [];
  lines.push('');
  lines.push('RETURNING PLAYERS (DID NOT PLAY LAST GAME — NOW AVAILABLE)');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('These players were ABSENT from their team\'s most recent game but are');
  lines.push('NOT currently listed as OUT. Status and season averages shown below.');
  lines.push('');

  for (const { team, players } of results) {
    lines.push(`  ${team}:`);
    for (const p of players) {
      lines.push(`    ${p.name} — Missed ${p.gamesMissed} of last ${p.gamesMissed + p.gamesPlayed} games | ${p.ppg} PPG / ${p.rpg} RPG / ${p.apg} APG | Status: ${p.injuryStatus}`);
      // Show team-share context if available — helps Gary assess the impact of this player returning
      const shareParts = [];
      if (p.pct_pts) shareParts.push(`${(p.pct_pts * 100).toFixed(1)}% PTS`);
      if (p.pct_ast) shareParts.push(`${(p.pct_ast * 100).toFixed(1)}% AST`);
      if (p.pct_fga) shareParts.push(`${(p.pct_fga * 100).toFixed(1)}% FGA`);
      if (shareParts.length > 0) {
        lines.push(`      Team Share: ${shareParts.join(' | ')}`);
      }
    }
    lines.push('');
  }

  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  return lines.join('\n');
}
