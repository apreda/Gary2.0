/** Scout-report data: Recent games, rest, recent form and box scores. (split from dataFetchers.js, Oct 13 2026) */
import { ballDontLieService } from '../../../../../providers/ballDontLieService.js';
import { getESTDate, toESTDate, providerGameDateLabel } from '../../../../../../utils/dateUtils.js';
import { seasonForSport, sportToBdlKey, findTeam } from '../utilities.js';
import { footballSeasonForDate, nflSeasonTypeForGame } from '../../sports/footballSeason.js';
import { namesRefer } from './teamProfile.js';

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
      // NBA/etc: Use date range filtering (ET calendar days — after 8 PM ET
      // toISOString is already tomorrow, the recurring UTC-date class)
      params = {
        team_ids: [team.id],
        start_date: toESTDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
        end_date: getESTDate(),
        per_page: 20
      };
    }
    
    const recentGames = await ballDontLieService.getGames(bdlSport, params);

    // /games?seasons[] returns regular-season rows only; NFL preseason games
    // never reach recent form. When the current football season still has
    // fewer finished games than requested (Week 0/1), backfill from the prior
    // season — each line carries its date, so the season stays self-evident.
    const isFootball = bdlSport === 'americanfootball_nfl' || bdlSport === 'americanfootball_ncaaf';
    const pooledGames = recentGames || [];

    // Sort by date descending and return the requested count
    // For sports with season fetch, also filter to only completed games.
    // "Today" must be the ET calendar day: after 8 PM ET the UTC date is
    // already tomorrow, which made tonight's in-progress game read as past.
    const todayStr = getESTDate();
    const finishedSorted = (rows) => {
      const seen = new Set();
      return (rows || [])
        .filter(g => {
          if (g?.id != null) {
            if (seen.has(String(g.id))) return false;
            seen.add(String(g.id));
          }
          const rawDate = g.date || g.datetime;
          const hasDate = !!rawDate;
          const gameDateStr = (rawDate || '').split('T')[0];
          const isPast = gameDateStr < todayStr;
          if (usesSeasonParam) {
            const status = (g.status || '').toLowerCase();
            const isFinished = status.startsWith('final') || status === 'post' || status === 'off';
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
    };

    let sorted = finishedSorted(pooledGames);
    if (isFootball && sorted.length < count) {
      try {
        const prior = await ballDontLieService.getGames(bdlSport, { ...params, seasons: [seasonForSport(sport) - 1] });
        if (Array.isArray(prior) && prior.length) sorted = finishedSorted([...pooledGames, ...prior]);
      } catch { /* prior-season backfill is additive only */ }
    }

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
      // BDL may return date as full ISO timestamp (e.g., "2025-12-20T05:00:00.000Z") or just "YYYY-MM-DD".
      // A timestamp resolves to its ET calendar day (the recurring UTC class:
      // an 8 PM ET kickoff is the NEXT UTC day — the dossier printed "last
      // game Aug 14" for an Aug 13 ET game and shorted daysRest by one).
      let rawDate = g.date || g.datetime;
      const dateStr = rawDate
        ? (rawDate.includes('T')
            ? new Date(rawDate).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
            : rawDate)
        : null;
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
    // Whole-name match (see namesRefer) — a last-word join cross-wired
    // shared-mascot clubs ("Ohio State" home vs "Oklahoma State" visiting).
    lastGameWasHome = namesRefer(homeTeamName, teamName);
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
export function formatRecentForm(teamName, recentGames, count = 5, options = {}) {
  if (!recentGames || recentGames.length === 0) {
    return `• ${teamName}: Recent games unavailable`;
  }

  let wins = 0, losses = 0, ties = 0;

  // Filter to only completed games (have scores > 0)
  const completedGames = recentGames.filter(game => {
    const homeScore = game.home_team_score ?? game.home_score ?? 0;
    const awayScore = game.visitor_team_score ?? game.away_score ?? 0;
    if ((options.sport === 'NFL' || options.allowTies) && /^(final|completed)$/i.test(game.status || '')
      && (game.home_team_score ?? game.home_score) != null && (game.visitor_team_score ?? game.away_score) != null) return true;
    return homeScore > 0 || awayScore > 0; // At least one team scored
  });

  if (completedGames.length === 0) {
    return `• ${teamName}: No recent completed games`;
  }

  if (options.sport === 'NFL') {
    const groups = new Map();
    for (const game of completedGames.slice(0, count)) {
      const rawDate = game.date || game.datetime;
      const instant = /^\d{4}-\d{2}-\d{2}$/.test(rawDate || '') ? `${rawDate}T12:00:00Z` : rawDate;
      const validDate = Number.isFinite(Date.parse(instant));
      const season = game.season ?? (validDate ? footballSeasonForDate('NFL', instant) : 'Unknown season');
      const phase = validDate ? nflSeasonTypeForGame(game, instant) : Number(game.season_type);
      const label = `${season} ${{ 1: 'preseason', 2: 'regular season', 3: 'postseason' }[phase] || 'phase unavailable'}`;
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(game);
    }
    return [...groups].map(([label, games]) => formatRecentForm(teamName, games, games.length, { includeDates: true, allowTies: true })
      .replace(`• ${teamName}:`, `• ${teamName} — ${label}:`)).join('\n');
  }

  const results = completedGames.slice(0, count).map(game => {
    // Determine if this team was home or away
    const homeTeamName = game.home_team?.name || game.home_team?.full_name || '';
    const awayTeamName = game.visitor_team?.name || game.visitor_team?.full_name || game.away_team?.name || game.away_team?.full_name || '';
    // Whole-name match (see namesRefer) — the last-word join here both
    // painted every shared-mascot game as home AND deleted legit games via
    // the opponent check below ("Ohio State" vs any other State school).
    const isHome = namesRefer(homeTeamName, teamName);

    const teamScore = isHome ? (game.home_team_score ?? game.home_score ?? 0) : (game.visitor_team_score ?? game.away_team_score ?? game.away_score ?? 0);
    const oppScore = isHome ? (game.visitor_team_score ?? game.away_team_score ?? game.away_score ?? 0) : (game.home_team_score ?? game.home_score ?? 0);
    const oppName = isHome ? awayTeamName : homeTeamName;

    // Skip if opponent name is empty or resolves to the team itself
    if (!oppName || namesRefer(oppName, teamName)) {
      return null;
    }

    // Venue was computed above and then discarded: every result printed "vs",
    // so a road win read as a home win. Where a game was played is a real
    // factor in every one of these sports — say which it was.
    const venue = isHome ? 'vs' : '@';
    const rawDate = game.date || game.datetime;
    const dateLabel = options.includeDates ? ` [${/^\d{4}-\d{2}-\d{2}$/.test(rawDate || '') ? rawDate
      : Number.isFinite(Date.parse(rawDate)) ? toESTDate(rawDate) : 'date unavailable'}]` : '';

    if (options.allowTies && Number(teamScore) === Number(oppScore)) {
      ties++;
      return `T ${venue} ${oppName} (${teamScore}-${oppScore})${dateLabel}`;
    } else if (teamScore > oppScore) {
      wins++;
      return `W ${venue} ${oppName} (${teamScore}-${oppScore})${dateLabel}`;
    } else {
      losses++;
      return `L ${venue} ${oppName} (${teamScore}-${oppScore})${dateLabel}`;
    }
  }).filter(r => r !== null);

  // The record must count the same games the line lists. `shown` used to be
  // min(completedGames.length, count), which ignored the games dropped by the
  // filter above — printing e.g. "2-2 last 5" beside four listed games.
  const listed = results.slice(0, count);
  return `• ${teamName}: ${wins}-${losses}${ties ? `-${ties}` : ''} last ${listed.length}
  ${listed.join(' | ')}`;
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
export function findMatchingBoxScore(boxScoresForDate, game) {
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
export function formatBoxScoreLines(playerStats, indent = '    ') {
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

    const gameDate = providerGameDateLabel(game.datetime || game.date);
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
