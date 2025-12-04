/**
 * Scout Report Builder
 * 
 * Builds the initial context that helps Gary form a unique hypothesis.
 * This is the "Level 1" context that Gary always receives.
 */

import { ballDontLieService } from '../../ballDontLieService.js';
import { formatTokenMenu } from '../tools/toolDefinitions.js';

/**
 * Build a scout report for a game
 * This gives Gary enough context to think, not just react to odds.
 */
export async function buildScoutReport(game, sport) {
  const homeTeam = game.home_team;
  const awayTeam = game.away_team;
  const sportKey = normalizeSport(sport);
  
  // Fetch basic data in parallel
  const [homeProfile, awayProfile, injuries, recentHome, recentAway] = await Promise.all([
    fetchTeamProfile(homeTeam, sportKey),
    fetchTeamProfile(awayTeam, sportKey),
    fetchInjuries(homeTeam, awayTeam, sportKey),
    fetchRecentGames(homeTeam, sportKey, 5),
    fetchRecentGames(awayTeam, sportKey, 5)
  ]);
  
  // Build the scout report
  const report = `
══════════════════════════════════════════════════════════════════════
MATCHUP: ${awayTeam} @ ${homeTeam}
Sport: ${sportKey} | ${game.commence_time ? formatGameTime(game.commence_time) : 'Time TBD'}
══════════════════════════════════════════════════════════════════════

⚠️⚠️⚠️ INJURY REPORT (READ THIS FIRST - CRITICAL) ⚠️⚠️⚠️
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatInjuryReport(homeTeam, awayTeam, injuries)}

🚨 INJURY RULE: Do NOT mention any player listed as OUT/DOUBTFUL/QUESTIONABLE
as if they are playing. If a star player is injured, this MUST be the 
PRIMARY factor in your analysis. Build your pick around who IS available.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TEAM IDENTITIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatTeamIdentity(homeTeam, homeProfile, 'Home')}
${formatTeamIdentity(awayTeam, awayProfile, 'Away')}

RECENT FORM (Last 5 Games)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatRecentForm(homeTeam, recentHome)}
${formatRecentForm(awayTeam, recentAway)}

KEY SITUATIONAL FACTORS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatSituationalFactors(game, injuries, sportKey)}

BETTING CONTEXT (For Reference Only - Do NOT base pick on these)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatOdds(game)}

⚠️ IMPORTANT: Odds are shown for value assessment AFTER you form your 
statistical conclusion. Your analysis must be independently justified 
by stats. Do NOT use "big spread" or "expensive ML" as reasoning.

══════════════════════════════════════════════════════════════════════
AVAILABLE STAT CATEGORIES (use fetch_stats tool to request):
${formatTokenMenu(sportKey)}
══════════════════════════════════════════════════════════════════════
`.trim();

  return report;
}

/**
 * Normalize sport key to standard format
 */
function normalizeSport(sport) {
  const mapping = {
    'basketball_nba': 'NBA',
    'americanfootball_nfl': 'NFL',
    'basketball_ncaab': 'NCAAB',
    'americanfootball_ncaaf': 'NCAAF',
    'nba': 'NBA',
    'nfl': 'NFL',
    'ncaab': 'NCAAB',
    'ncaaf': 'NCAAF'
  };
  return mapping[sport?.toLowerCase()] || sport?.toUpperCase() || 'UNKNOWN';
}

/**
 * Format game time
 */
function formatGameTime(timeString) {
  try {
    const date = new Date(timeString);
    return date.toLocaleString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  } catch {
    return timeString;
  }
}

/**
 * Fetch team profile (record, key metrics, identity)
 */
async function fetchTeamProfile(teamName, sport) {
  try {
    const bdlSport = sportToBdlKey(sport);
    if (!bdlSport) return createEmptyProfile(teamName);
    
    // Get team data
    const teams = await ballDontLieService.getTeams(bdlSport);
    const team = findTeam(teams, teamName);
    if (!team) return createEmptyProfile(teamName);
    
    // Get season stats
    const seasonStats = await ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: team.id, season: 2025, postseason: false });
    const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season: 2025 });
    const teamStanding = standings?.find(s => s.team?.id === team.id || s.team?.name === teamName);
    
    return {
      name: teamName,
      record: teamStanding?.overall_record || calculateRecord(seasonStats),
      homeRecord: teamStanding?.home_record || 'N/A',
      awayRecord: teamStanding?.road_record || 'N/A',
      streak: formatStreak(teamStanding),
      seasonStats: seasonStats,
      standing: teamStanding,
      identity: buildTeamIdentity(seasonStats, sport)
    };
  } catch (error) {
    console.warn(`[Scout Report] Error fetching profile for ${teamName}:`, error.message);
    return createEmptyProfile(teamName);
  }
}

/**
 * Build team identity string from stats
 */
function buildTeamIdentity(stats, sport) {
  if (!stats) return 'Profile unavailable';
  
  const parts = [];
  
  if (sport === 'NBA' || sport === 'NCAAB') {
    // Basketball identity
    if (stats.points_per_game) {
      const ppg = parseFloat(stats.points_per_game);
      if (ppg > 115) parts.push('high-scoring');
      else if (ppg < 105) parts.push('defensive-minded');
    }
    if (stats.pace) {
      const pace = parseFloat(stats.pace);
      if (pace > 100) parts.push('fast-paced');
      else if (pace < 96) parts.push('slow/methodical');
    }
    if (stats.three_point_pct && parseFloat(stats.three_point_pct) > 0.37) {
      parts.push('3PT-heavy');
    }
    if (stats.offensive_rating) {
      const ortg = parseFloat(stats.offensive_rating);
      if (ortg > 115) parts.push(`elite offense (#${stats.offensive_rating_rank || '?'})`);
    }
    if (stats.defensive_rating) {
      const drtg = parseFloat(stats.defensive_rating);
      if (drtg < 108) parts.push(`strong defense (#${stats.defensive_rating_rank || '?'})`);
      else if (drtg > 115) parts.push('leaky defense');
    }
  } else if (sport === 'NFL' || sport === 'NCAAF') {
    // Football identity
    if (stats.total_points_per_game) {
      const ppg = parseFloat(stats.total_points_per_game);
      if (ppg > 28) parts.push('high-powered offense');
      else if (ppg < 18) parts.push('struggling offense');
    }
    if (stats.rushing_yards_per_game && stats.net_passing_yards_per_game) {
      const rush = parseFloat(stats.rushing_yards_per_game);
      const pass = parseFloat(stats.net_passing_yards_per_game);
      if (rush > pass) parts.push('run-heavy');
      else if (pass > rush * 1.5) parts.push('pass-first');
      else parts.push('balanced attack');
    }
    if (stats.opp_total_points_per_game) {
      const oppPpg = parseFloat(stats.opp_total_points_per_game);
      if (oppPpg < 18) parts.push('elite defense');
      else if (oppPpg > 28) parts.push('porous defense');
    }
  }
  
  return parts.length > 0 ? parts.join(', ') : 'Profile building...';
}

/**
 * Create empty profile for missing data
 */
function createEmptyProfile(teamName) {
  return {
    name: teamName,
    record: 'N/A',
    homeRecord: 'N/A',
    awayRecord: 'N/A',
    streak: 'N/A',
    seasonStats: null,
    standing: null,
    identity: 'Profile unavailable'
  };
}

/**
 * Format team identity for display
 */
function formatTeamIdentity(teamName, profile, homeAway) {
  const record = profile.record !== 'N/A' ? `(${profile.record})` : '';
  return `• ${teamName} ${record} [${homeAway}]: ${profile.identity}
  Home: ${profile.homeRecord} | Away: ${profile.awayRecord} | Streak: ${profile.streak}`;
}

/**
 * Fetch recent games for a team
 */
async function fetchRecentGames(teamName, sport, count = 5) {
  try {
    const bdlSport = sportToBdlKey(sport);
    if (!bdlSport) return [];
    
    const teams = await ballDontLieService.getTeams(bdlSport);
    const team = findTeam(teams, teamName);
    if (!team) return [];
    
    // Get recent games - use getGames with team filter
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const recentGames = await ballDontLieService.getGames(bdlSport, {
      team_ids: [team.id],
      start_date: thirtyDaysAgo.toISOString().split('T')[0],
      end_date: today.toISOString().split('T')[0],
      per_page: count
    });
    return recentGames || [];
  } catch (error) {
    console.warn(`[Scout Report] Error fetching recent games for ${teamName}:`, error.message);
    return [];
  }
}

/**
 * Format recent form
 */
function formatRecentForm(teamName, recentGames) {
  if (!recentGames || recentGames.length === 0) {
    return `• ${teamName}: Recent games unavailable`;
  }
  
  let wins = 0, losses = 0;
  const results = recentGames.slice(0, 5).map(game => {
    const isHome = game.home_team?.name === teamName || game.home_team === teamName;
    const teamScore = isHome ? game.home_team_score : game.visitor_team_score;
    const oppScore = isHome ? game.visitor_team_score : game.home_team_score;
    const oppName = isHome ? (game.visitor_team?.name || game.away_team) : (game.home_team?.name || game.home_team);
    
    if (teamScore > oppScore) {
      wins++;
      return `W vs ${oppName} (${teamScore}-${oppScore})`;
    } else {
      losses++;
      return `L vs ${oppName} (${teamScore}-${oppScore})`;
    }
  });
  
  return `• ${teamName}: ${wins}-${losses} last 5
  ${results.slice(0, 3).join(' | ')}`;
}

/**
 * Fetch injuries for both teams
 */
async function fetchInjuries(homeTeam, awayTeam, sport) {
  try {
    const bdlSport = sportToBdlKey(sport);
    if (!bdlSport) return { home: [], away: [] };
    
    const teams = await ballDontLieService.getTeams(bdlSport);
    const home = findTeam(teams, homeTeam);
    const away = findTeam(teams, awayTeam);
    
    const teamIds = [];
    if (home) teamIds.push(home.id);
    if (away) teamIds.push(away.id);
    
    if (teamIds.length === 0) return { home: [], away: [] };
    
    const injuries = await ballDontLieService.getInjuriesGeneric(bdlSport, { team_ids: teamIds });
    
    return {
      home: injuries?.filter(i => i.player?.team?.id === home?.id || i.team_id === home?.id) || [],
      away: injuries?.filter(i => i.player?.team?.id === away?.id || i.team_id === away?.id) || []
    };
  } catch (error) {
    console.warn(`[Scout Report] Error fetching injuries:`, error.message);
    return { home: [], away: [] };
  }
}

/**
 * Format comprehensive injury report - this goes at the TOP of the scout report
 */
function formatInjuryReport(homeTeam, awayTeam, injuries) {
  const lines = [];
  
  // Get all injuries by status
  const homeOut = injuries.home?.filter(i => i.status === 'Out') || [];
  const homeDoubtful = injuries.home?.filter(i => i.status === 'Doubtful') || [];
  const homeQuestionable = injuries.home?.filter(i => i.status === 'Questionable') || [];
  
  const awayOut = injuries.away?.filter(i => i.status === 'Out') || [];
  const awayDoubtful = injuries.away?.filter(i => i.status === 'Doubtful') || [];
  const awayQuestionable = injuries.away?.filter(i => i.status === 'Questionable') || [];
  
  const formatPlayer = (i) => {
    const name = `${i.player?.first_name || ''} ${i.player?.last_name || ''}`.trim() || 'Unknown';
    const pos = i.player?.position_abbreviation || i.player?.position || '';
    const reason = i.comment ? ` - ${i.comment.split('.')[0]}` : '';
    return `  • ${name} (${pos})${reason}`;
  };
  
  // Home team injuries
  lines.push(`🏠 ${homeTeam}:`);
  if (homeOut.length > 0) {
    lines.push(`  ❌ OUT: ${homeOut.length} player(s)`);
    homeOut.forEach(i => lines.push(formatPlayer(i)));
  }
  if (homeDoubtful.length > 0) {
    lines.push(`  ⚠️ DOUBTFUL: ${homeDoubtful.length} player(s)`);
    homeDoubtful.forEach(i => lines.push(formatPlayer(i)));
  }
  if (homeQuestionable.length > 0) {
    lines.push(`  ❓ QUESTIONABLE: ${homeQuestionable.length} player(s)`);
    homeQuestionable.forEach(i => lines.push(formatPlayer(i)));
  }
  if (homeOut.length === 0 && homeDoubtful.length === 0 && homeQuestionable.length === 0) {
    lines.push(`  ✅ No significant injuries reported`);
  }
  
  lines.push('');
  
  // Away team injuries
  lines.push(`✈️ ${awayTeam}:`);
  if (awayOut.length > 0) {
    lines.push(`  ❌ OUT: ${awayOut.length} player(s)`);
    awayOut.forEach(i => lines.push(formatPlayer(i)));
  }
  if (awayDoubtful.length > 0) {
    lines.push(`  ⚠️ DOUBTFUL: ${awayDoubtful.length} player(s)`);
    awayDoubtful.forEach(i => lines.push(formatPlayer(i)));
  }
  if (awayQuestionable.length > 0) {
    lines.push(`  ❓ QUESTIONABLE: ${awayQuestionable.length} player(s)`);
    awayQuestionable.forEach(i => lines.push(formatPlayer(i)));
  }
  if (awayOut.length === 0 && awayDoubtful.length === 0 && awayQuestionable.length === 0) {
    lines.push(`  ✅ No significant injuries reported`);
  }
  
  return lines.join('\n');
}

/**
 * Format situational factors
 */
function formatSituationalFactors(game, injuries, sport) {
  const factors = [];
  
  // Injuries
  const homeInjuries = injuries.home?.filter(i => ['Out', 'Doubtful', 'Questionable'].includes(i.status));
  const awayInjuries = injuries.away?.filter(i => ['Out', 'Doubtful', 'Questionable'].includes(i.status));
  
  if (homeInjuries?.length > 0) {
    const injuryList = homeInjuries.slice(0, 3).map(i => 
      `${i.player?.first_name} ${i.player?.last_name}: ${i.status}`
    ).join(', ');
    factors.push(`• ${game.home_team} Injuries: ${injuryList}`);
  }
  
  if (awayInjuries?.length > 0) {
    const injuryList = awayInjuries.slice(0, 3).map(i => 
      `${i.player?.first_name} ${i.player?.last_name}: ${i.status}`
    ).join(', ');
    factors.push(`• ${game.away_team} Injuries: ${injuryList}`);
  }
  
  // Rest situation (if available)
  if (game.home_rest_days !== undefined) {
    factors.push(`• Rest: ${game.home_team} (${game.home_rest_days} days) vs ${game.away_team} (${game.away_rest_days} days)`);
  }
  
  // Week info for NFL/NCAAF
  if (game.week && (sport === 'NFL' || sport === 'NCAAF')) {
    factors.push(`• Week ${game.week} of the ${game.season || 2024} season`);
  }
  
  // Venue
  if (game.venue) {
    factors.push(`• Venue: ${game.venue}`);
  }
  
  if (factors.length === 0) {
    factors.push('• No significant situational factors identified');
  }
  
  return factors.join('\n');
}

/**
 * Format odds for display
 */
function formatOdds(game) {
  const lines = [];
  
  // Spread
  let spreadValue = null;
  let spreadOdds = -110;
  if (game.spread_home !== undefined && game.spread_home !== null) {
    const homeSpread = parseFloat(game.spread_home);
    const awaySpread = -homeSpread;
    spreadValue = homeSpread;
    spreadOdds = game.spread_home_odds || game.spread_odds || -110;
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
  
  // Total
  let totalValue = null;
  if (game.total !== undefined && game.total !== null) {
    totalValue = parseFloat(game.total);
    lines.push(`Total: O/U ${totalValue}`);
  } else if (game.totals) {
    lines.push(`Total: ${game.totals}`);
  }
  
  // Add raw values for Gary to include in JSON output
  lines.push('');
  lines.push('📊 RAW ODDS VALUES (copy these to your JSON output):');
  lines.push(`  spread: ${spreadValue !== null ? spreadValue : 'null'}`);
  lines.push(`  spreadOdds: ${spreadOdds}`);
  lines.push(`  moneylineHome: ${mlHome !== null ? mlHome : 'null'}`);
  lines.push(`  moneylineAway: ${mlAway !== null ? mlAway : 'null'}`);
  lines.push(`  total: ${totalValue !== null ? totalValue : 'null'}`);
  
  return lines.join('\n') || 'Odds not available';
}

/**
 * Format moneyline number
 */
function formatMoneyline(ml) {
  const num = parseFloat(ml);
  return num > 0 ? `+${num}` : num.toString();
}

/**
 * Convert sport to BDL API key
 */
function sportToBdlKey(sport) {
  const mapping = {
    'NBA': 'basketball_nba',
    'NFL': 'americanfootball_nfl',
    'NCAAB': 'basketball_ncaab',
    'NCAAF': 'americanfootball_ncaaf',
    'basketball_nba': 'basketball_nba',
    'americanfootball_nfl': 'americanfootball_nfl',
    'basketball_ncaab': 'basketball_ncaab',
    'americanfootball_ncaaf': 'americanfootball_ncaaf'
  };
  return mapping[sport] || null;
}

/**
 * Find team by name in teams array
 */
function findTeam(teams, teamName) {
  if (!teams || !teamName) return null;
  
  const normalized = teamName.toLowerCase();
  return teams.find(t => 
    t.full_name?.toLowerCase().includes(normalized) ||
    t.name?.toLowerCase().includes(normalized) ||
    normalized.includes(t.name?.toLowerCase()) ||
    normalized.includes(t.full_name?.toLowerCase())
  );
}

/**
 * Calculate record from season stats
 */
function calculateRecord(stats) {
  if (!stats) return 'N/A';
  if (stats.wins !== undefined && stats.losses !== undefined) {
    return `${stats.wins}-${stats.losses}`;
  }
  return 'N/A';
}

/**
 * Format streak
 */
function formatStreak(standing) {
  if (!standing) return 'N/A';
  if (standing.win_streak && standing.win_streak > 0) {
    return `W${standing.win_streak}`;
  }
  if (standing.loss_streak && standing.loss_streak > 0) {
    return `L${standing.loss_streak}`;
  }
  return standing.streak || 'N/A';
}

export default { buildScoutReport };

