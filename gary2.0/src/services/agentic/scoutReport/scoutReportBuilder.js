/**
 * Scout Report Builder
 * 
 * Builds the initial context that helps Gary form a unique hypothesis.
 * This is the "Level 1" context that Gary always receives.
 */

import { ballDontLieService } from '../../ballDontLieService.js';
import { formatTokenMenu } from '../tools/toolDefinitions.js';
import { perplexityService } from '../../perplexityService.js';

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
  
  // For NFL/NCAAF, fetch starting QBs
  let startingQBs = null;
  if (sportKey === 'NFL' || sportKey === 'NCAAF') {
    startingQBs = await fetchStartingQBs(homeTeam, awayTeam, sportKey);
  }
  
  // Format injuries for display
  const formatInjuriesForStorage = (injuries) => {
    const formatList = (list) => list.map(i => ({
      name: `${i.player?.first_name || ''} ${i.player?.last_name || ''}`.trim() || i.name || 'Unknown',
      status: i.status || 'Unknown',
      description: i.description || i.comment || i.injury || ''
    }));
    
    return {
      home: formatList(injuries.home || []),
      away: formatList(injuries.away || [])
    };
  };
  
  const injuriesForStorage = formatInjuriesForStorage(injuries);
  
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
${startingQBs ? formatStartingQBs(homeTeam, awayTeam, startingQBs) : ''}
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

  // Return both the report text and structured injuries data
  return {
    text: report,
    injuries: injuriesForStorage
  };
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
    'icehockey_nhl': 'NHL',
    'soccer_epl': 'EPL',
    'nba': 'NBA',
    'nfl': 'NFL',
    'ncaab': 'NCAAB',
    'ncaaf': 'NCAAF',
    'nhl': 'NHL',
    'epl': 'EPL'
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
  } else if (sport === 'NHL') {
    // Hockey identity
    if (stats.goals_for_per_game) {
      const gpg = parseFloat(stats.goals_for_per_game);
      if (gpg > 3.5) parts.push('high-scoring');
      else if (gpg < 2.5) parts.push('struggling offensively');
    }
    if (stats.goals_against_per_game) {
      const gaa = parseFloat(stats.goals_against_per_game);
      if (gaa < 2.5) parts.push('stingy defense');
      else if (gaa > 3.5) parts.push('leaky defense');
    }
    if (stats.power_play_percentage) {
      const pp = parseFloat(stats.power_play_percentage);
      if (pp > 0.24) parts.push('elite PP');
      else if (pp < 0.17) parts.push('weak PP');
    }
    if (stats.penalty_kill_percentage) {
      const pk = parseFloat(stats.penalty_kill_percentage);
      if (pk > 0.82) parts.push('elite PK');
      else if (pk < 0.76) parts.push('vulnerable PK');
    }
    if (stats.shots_for_per_game && stats.shots_against_per_game) {
      const sf = parseFloat(stats.shots_for_per_game);
      const sa = parseFloat(stats.shots_against_per_game);
      if (sf > sa + 5) parts.push('possession-heavy');
      else if (sa > sf + 5) parts.push('outshot regularly');
    }
  } else if (sport === 'EPL') {
    // Soccer/EPL identity
    if (stats.goals) {
      const gpg = parseFloat(stats.goals) / (stats.wins + stats.losses + stats.draws || 1);
      if (gpg > 2.0) parts.push('high-scoring');
      else if (gpg < 1.0) parts.push('struggling in attack');
    }
    if (stats.goals_conceded) {
      const gaa = parseFloat(stats.goals_conceded) / (stats.wins + stats.losses + stats.draws || 1);
      if (gaa < 1.0) parts.push('solid defense');
      else if (gaa > 1.5) parts.push('leaky defense');
    }
    if (stats.clean_sheet) {
      const cs = parseFloat(stats.clean_sheet);
      if (cs > 5) parts.push('keeps clean sheets');
    }
    if (stats.total_pass && stats.accurate_pass) {
      const passAcc = (parseFloat(stats.accurate_pass) / parseFloat(stats.total_pass)) * 100;
      if (passAcc > 85) parts.push('possession-based');
      else if (passAcc < 75) parts.push('direct style');
    }
    if (stats.total_scoring_att) {
      const shots = parseFloat(stats.total_scoring_att);
      if (shots > 200) parts.push('creates chances');
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
 * Fetch injuries for both teams - uses BDL + Perplexity verification
 */
async function fetchInjuries(homeTeam, awayTeam, sport) {
  try {
    const bdlSport = sportToBdlKey(sport);
    
    // Fetch from BDL
    let bdlInjuries = { home: [], away: [] };
    if (bdlSport) {
      const teams = await ballDontLieService.getTeams(bdlSport);
      const home = findTeam(teams, homeTeam);
      const away = findTeam(teams, awayTeam);
      
      console.log(`[Scout Report] Looking for injuries - Home: ${homeTeam} (ID: ${home?.id}), Away: ${awayTeam} (ID: ${away?.id})`);
      
      const teamIds = [];
      if (home) teamIds.push(home.id);
      if (away) teamIds.push(away.id);
      
      if (teamIds.length > 0) {
        const injuries = await ballDontLieService.getInjuriesGeneric(bdlSport, { team_ids: teamIds });
        console.log(`[Scout Report] BDL returned ${injuries?.length || 0} total injuries for teams ${teamIds.join(', ')}`);
        
        // Filter by team - check multiple possible team ID locations
        bdlInjuries = {
          home: injuries?.filter(i => 
            i.player?.team?.id === home?.id || 
            i.player?.team_id === home?.id || 
            i.team_id === home?.id
          ) || [],
          away: injuries?.filter(i => 
            i.player?.team?.id === away?.id || 
            i.player?.team_id === away?.id || 
            i.team_id === away?.id
          ) || []
        };
        
        console.log(`[Scout Report] BDL injuries filtered - Home: ${bdlInjuries.home.length}, Away: ${bdlInjuries.away.length}`);
        if (bdlInjuries.home.length > 0) {
          console.log(`[Scout Report] Home injuries:`, bdlInjuries.home.map(i => `${i.player?.first_name} ${i.player?.last_name} (${i.status})`));
        }
        if (bdlInjuries.away.length > 0) {
          console.log(`[Scout Report] Away injuries:`, bdlInjuries.away.map(i => `${i.player?.first_name} ${i.player?.last_name} (${i.status})`));
        }
      }
    }
    
    // CRITICAL: Also fetch from Perplexity as verification (injuries are too important to miss)
    const perplexityInjuries = await fetchPerplexityInjuries(homeTeam, awayTeam, sport);
    
    // Merge injuries - Perplexity fills in gaps
    return mergeInjuries(bdlInjuries, perplexityInjuries);
    
  } catch (error) {
    console.warn(`[Scout Report] Error fetching injuries:`, error.message);
    return { home: [], away: [] };
  }
}

/**
 * Fetch injuries from Perplexity as a verification/backup source
 */
async function fetchPerplexityInjuries(homeTeam, awayTeam, sport) {
  try {
    // First try the new Search API (more reliable, structured results)
    if (perplexityService?.searchInjuries) {
      console.log(`[Scout Report] Using Perplexity Search API for injury verification: ${homeTeam} vs ${awayTeam}`);
      const searchResult = await perplexityService.searchInjuries(homeTeam, awayTeam, sport);
      
      if (searchResult.home.length > 0 || searchResult.away.length > 0) {
        console.log(`[Scout Report] Perplexity Search API found injuries: ${searchResult.home.length} for ${homeTeam}, ${searchResult.away.length} for ${awayTeam}`);
        return searchResult;
      }
    }
    
    // Fallback to chat completions API if Search API didn't find anything
    if (!perplexityService?.queryPerplexity) {
      console.log('[Scout Report] Perplexity service not available for injury check');
      return { home: [], away: [], perplexityRaw: null };
    }
    
    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const query = `What are the current injuries and player availability for tonight's ${sport} game between ${awayTeam} and ${homeTeam}? Include all players who are OUT, DOUBTFUL, or QUESTIONABLE. Only include injuries confirmed as of ${today}. Be specific with player names, their status (Out/Doubtful/Questionable), and injury type.`;
    
    console.log(`[Scout Report] Querying Perplexity Chat API for injury verification: ${homeTeam} vs ${awayTeam}`);
    
    const response = await perplexityService.queryPerplexity(query, { timeout: 15000 });
    
    if (!response?.content) {
      return { home: [], away: [], perplexityRaw: null };
    }
    
    // Parse the Perplexity response to extract injuries
    const parsed = parsePerplexityInjuries(response.content, homeTeam, awayTeam);
    parsed.perplexityRaw = response.content; // Keep raw for display
    
    console.log(`[Scout Report] Perplexity injuries: ${parsed.home.length} for ${homeTeam}, ${parsed.away.length} for ${awayTeam}`);
    
    return parsed;
    
  } catch (error) {
    console.warn(`[Scout Report] Perplexity injury check failed:`, error.message);
    return { home: [], away: [], perplexityRaw: null };
  }
}

/**
 * Parse Perplexity response to extract injury information
 */
function parsePerplexityInjuries(content, homeTeam, awayTeam) {
  const injuries = { home: [], away: [] };
  
  // Look for common injury status patterns
  const patterns = [
    /(\w+[\w\s\.]+)\s*(?:is|remains|listed as|ruled)\s*(out|doubtful|questionable)/gi,
    /(out|doubtful|questionable)[:\s]+([^,\.\n]+)/gi,
    /(\w+[\w\s\.]+)\s*\((out|doubtful|questionable)\)/gi
  ];
  
  const contentLower = content.toLowerCase();
  const homeTeamLower = homeTeam.toLowerCase();
  const awayTeamLower = awayTeam.toLowerCase();
  
  // Split content into sections by team (rough heuristic)
  const homeSection = extractTeamSection(content, homeTeam);
  const awaySection = extractTeamSection(content, awayTeam);
  
  // Extract injuries from each section
  const extractFromSection = (section, team) => {
    const found = [];
    const statusRegex = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*[-–:]\s*(Out|Doubtful|Questionable|OUT|DOUBTFUL|QUESTIONABLE)/g;
    const altRegex = /(Out|Doubtful|Questionable|OUT|DOUBTFUL|QUESTIONABLE)\s*[-–:]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g;
    
    let match;
    while ((match = statusRegex.exec(section)) !== null) {
      found.push({
        player: { first_name: match[1].split(' ')[0], last_name: match[1].split(' ').slice(1).join(' '), position: '' },
        status: match[2].charAt(0).toUpperCase() + match[2].slice(1).toLowerCase(),
        source: 'perplexity'
      });
    }
    while ((match = altRegex.exec(section)) !== null) {
      found.push({
        player: { first_name: match[2].split(' ')[0], last_name: match[2].split(' ').slice(1).join(' '), position: '' },
        status: match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase(),
        source: 'perplexity'
      });
    }
    return found;
  };
  
  injuries.home = extractFromSection(homeSection, homeTeam);
  injuries.away = extractFromSection(awaySection, awayTeam);
  
  return injuries;
}

/**
 * Extract section of text related to a team
 */
function extractTeamSection(content, teamName) {
  // Try to find the team name and extract surrounding context
  const teamLower = teamName.toLowerCase();
  const idx = content.toLowerCase().indexOf(teamLower);
  if (idx === -1) return content; // Return full content if team not found
  
  // Get 500 chars after team mention
  return content.substring(Math.max(0, idx - 50), idx + 500);
}

/**
 * Merge BDL and Perplexity injuries, deduping by player name
 */
function mergeInjuries(bdlInjuries, perplexityInjuries) {
  const mergeTeam = (bdl, perp) => {
    const merged = [...bdl];
    const existingNames = new Set(bdl.map(i => 
      `${i.player?.first_name} ${i.player?.last_name}`.toLowerCase()
    ));
    
    // Add Perplexity injuries that aren't in BDL
    for (const injury of perp) {
      const name = `${injury.player?.first_name} ${injury.player?.last_name}`.toLowerCase();
      if (!existingNames.has(name)) {
        merged.push(injury);
        console.log(`[Scout Report] Added injury from Perplexity: ${name} (${injury.status})`);
      }
    }
    
    return merged;
  };
  
  return {
    home: mergeTeam(bdlInjuries.home || [], perplexityInjuries.home || []),
    away: mergeTeam(bdlInjuries.away || [], perplexityInjuries.away || []),
    perplexityRaw: perplexityInjuries.perplexityRaw
  };
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
    const name = `${i.player?.first_name || i.firstName || ''} ${i.player?.last_name || i.lastName || ''}`.trim() || i.name || 'Unknown';
    const pos = i.player?.position_abbreviation || i.player?.position || i.position || '';
    // BDL uses 'description', Perplexity may use 'comment' or 'injury'
    const reason = i.description || i.comment || i.injury || '';
    const shortReason = reason ? ` - ${reason.split('.')[0].substring(0, 50)}` : '';
    return `  • ${name}${pos ? ` (${pos})` : ''}${shortReason}`;
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
    'NHL': 'icehockey_nhl',
    'EPL': 'soccer_epl',
    'basketball_nba': 'basketball_nba',
    'americanfootball_nfl': 'americanfootball_nfl',
    'basketball_ncaab': 'basketball_ncaab',
    'americanfootball_ncaaf': 'americanfootball_ncaaf',
    'icehockey_nhl': 'icehockey_nhl',
    'soccer_epl': 'soccer_epl'
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

/**
 * Fetch starting QBs for both teams (NFL/NCAAF only)
 */
async function fetchStartingQBs(homeTeam, awayTeam, sport) {
  try {
    const bdlSport = sportToBdlKey(sport);
    if (!bdlSport || (bdlSport !== 'americanfootball_nfl' && bdlSport !== 'americanfootball_ncaaf')) {
      return null;
    }
    
    const teams = await ballDontLieService.getTeams(bdlSport);
    const homeTeamData = findTeam(teams, homeTeam);
    const awayTeamData = findTeam(teams, awayTeam);
    
    if (!homeTeamData && !awayTeamData) {
      console.warn('[Scout Report] Could not find team IDs for QB lookup');
      return null;
    }
    
    console.log(`[Scout Report] Fetching starting QBs for ${homeTeam} (ID: ${homeTeamData?.id}) and ${awayTeam} (ID: ${awayTeamData?.id})`);
    
    // Fetch QBs in parallel
    const [homeQB, awayQB] = await Promise.all([
      homeTeamData ? ballDontLieService.getTeamStartingQB(homeTeamData.id, 2025) : null,
      awayTeamData ? ballDontLieService.getTeamStartingQB(awayTeamData.id, 2025) : null
    ]);
    
    if (homeQB) {
      console.log(`[Scout Report] Home QB: ${homeQB.name} (${homeQB.passingYards} yds, ${homeQB.passingTds} TDs)`);
    }
    if (awayQB) {
      console.log(`[Scout Report] Away QB: ${awayQB.name} (${awayQB.passingYards} yds, ${awayQB.passingTds} TDs)`);
    }
    
    return { home: homeQB, away: awayQB };
  } catch (error) {
    console.error('[Scout Report] Error fetching starting QBs:', error.message);
    return null;
  }
}

/**
 * Format starting QBs section for display
 */
function formatStartingQBs(homeTeam, awayTeam, qbs) {
  if (!qbs || (!qbs.home && !qbs.away)) {
    return '';
  }
  
  const lines = [
    '',
    '🎯 STARTING QUARTERBACKS (USE THESE NAMES IN ANALYSIS)',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
  ];
  
  if (qbs.home) {
    const qb = qbs.home;
    lines.push(`🏠 ${homeTeam}: ${qb.name} (#${qb.jerseyNumber || '?'})`);
    lines.push(`   ${qb.gamesPlayed || '?'} GP | ${qb.passingYards || 0} yds | ${qb.passingTds || 0} TD / ${qb.passingInterceptions || 0} INT | ${qb.passingCompletionPct ? qb.passingCompletionPct.toFixed(1) : '?'}% | Rating: ${qb.qbRating ? qb.qbRating.toFixed(1) : '?'}`);
  } else {
    lines.push(`🏠 ${homeTeam}: QB data unavailable`);
  }
  
  if (qbs.away) {
    const qb = qbs.away;
    lines.push(`✈️ ${awayTeam}: ${qb.name} (#${qb.jerseyNumber || '?'})`);
    lines.push(`   ${qb.gamesPlayed || '?'} GP | ${qb.passingYards || 0} yds | ${qb.passingTds || 0} TD / ${qb.passingInterceptions || 0} INT | ${qb.passingCompletionPct ? qb.passingCompletionPct.toFixed(1) : '?'}% | Rating: ${qb.qbRating ? qb.qbRating.toFixed(1) : '?'}`);
  } else {
    lines.push(`✈️ ${awayTeam}: QB data unavailable`);
  }
  
  lines.push('');
  lines.push('⚠️ CRITICAL: Use the QB names above when discussing quarterbacks.');
  lines.push('   Do NOT guess or use outdated QB information.');
  lines.push('');
  
  return lines.join('\n');
}

export default { buildScoutReport };

