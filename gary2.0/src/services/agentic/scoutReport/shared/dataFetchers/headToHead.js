/** Scout-report data: Head-to-head meetings. (split from dataFetchers.js, Oct 13 2026) */
import { ballDontLieService } from '../../../../ballDontLieService.js';
import { providerGameInstant, providerGameDateLabel } from '../../../../../utils/dateUtils.js';
import { seasonForSport, sportToBdlKey, findTeam } from '../utilities.js';
import { fetchNbaBoxScoresForGames, findMatchingBoxScore, formatBoxScoreLines } from './recentGames.js';

export async function fetchH2HData(homeTeam, awayTeam, sport, recentHome, recentAway) {
  try {
    const bdlSport = sportToBdlKey(sport);

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
    
    // College teams rarely meet twice in one season, so a current-season look
    // was nearly always empty (Oct 10 2026: Utah State and Washington State met
    // in December's bowl game and the desk said "no previous matchups"). College
    // reads the last five seasons; every other league is unchanged.
    const isCollege = bdlSport === 'americanfootball_ncaaf';
    const h2hSeasons = isCollege ? [0, 1, 2, 3, 4].map(back => currentSeason - back) : [currentSeason];
    const homeSeasonGames = await ballDontLieService.getGames(bdlSport, {
      team_ids: [home.id],
      seasons: h2hSeasons,
      per_page: 100
    });
    
    console.log(`[Scout Report] H2H: Found ${homeSeasonGames?.length || 0} total games for ${homeTeam} in ${h2hSeasons.join(', ')}`);
    
    // Filter to only H2H games between these two teams
    const h2hGames = (homeSeasonGames || []).filter(game => {
      const gameHomeId = game.home_team?.id || game.home_team_id;
      const gameAwayId = game.visitor_team?.id || game.away_team?.id || game.visitor_team_id || game.away_team_id;
      
      const isMatch = (gameHomeId === home.id && gameAwayId === away.id) ||
                      (gameHomeId === away.id && gameAwayId === home.id);
      
      const hasScores = ((game.home_team_score ?? game.home_score ?? 0) > 0 || (game.visitor_team_score ?? game.away_team_score ?? game.away_score ?? 0) > 0);
      // Ensure game is in the past (completed)
      const isPast = providerGameInstant(game.datetime || game.date) < new Date();
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
        message: isCollege
          ? `No meetings between ${homeTeam} and ${awayTeam} found since the ${h2hSeasons.at(-1)} season.`
          : `No H2H games found between ${homeTeam} and ${awayTeam} in the ${currentSeason} season.`,
        games: []
      };
    }
    
    // Format H2H results
    const homeName = home.full_name || home.name;
    const awayName = away.full_name || away.name;
    let homeWins = 0, awayWins = 0;

    // Fetch box scores for NBA/NHL H2H games
    const isNba = bdlSport === 'basketball_nba';
    let h2hNbaBoxScoreMap = {};
    if (isNba) {
      try {
        h2hNbaBoxScoreMap = await fetchNbaBoxScoresForGames(uniqueH2H.slice(0, 5));
      } catch (e) {
        console.warn(`[Scout Report] H2H NBA box score fetch failed: ${e.message}`);
      }
    }

    const meetings = uniqueH2H.slice(0, 5).map(game => {
      const isHomeTeamHome = (game.home_team?.id || game.home_team_id) === home.id;
      const homeScore = isHomeTeamHome ? (game.home_team_score ?? game.home_score ?? 0) : (game.visitor_team_score ?? game.away_team_score ?? game.away_score ?? 0);
      const awayScore = isHomeTeamHome ? (game.visitor_team_score ?? game.away_team_score ?? game.away_score ?? 0) : (game.home_team_score ?? game.home_score ?? 0);
      const winner = homeScore > awayScore ? homeName : awayName;
      const margin = Math.abs(homeScore - awayScore);
      const gameDate = providerGameDateLabel(game.datetime || game.date, isCollege ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' });

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
      recordLabel: isCollege ? `Meetings since ${h2hSeasons.at(-1)}` : 'Season Record',
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
    `${h2hData.recordLabel || 'Season Record'}: ${h2hData.record}`,
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
