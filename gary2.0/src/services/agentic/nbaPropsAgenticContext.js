/**
 * NBA Props Agentic Context Builder
 * Builds rich context for NBA player prop analysis
 * 
 * ENHANCED: Now fetches actual player season stats from BDL API including:
 * - PPG (points per game)
 * - RPG (rebounds per game)
 * - APG (assists per game)
 * - TPG (threes per game)
 * - SPG, BPG (steals, blocks per game)
 * - PRA (points + rebounds + assists)
 * - Minutes per game
 */
import { ballDontLieService } from '../ballDontLieService.js';
import { perplexityService } from '../perplexityService.js';
import { formatGameTimeEST, buildMarketSnapshot, parseGameDate } from './sharedUtils.js';
import { fetchGroundedContext } from './scoutReport/scoutReportBuilder.js';

const SPORT_KEY = 'basketball_nba';

/**
 * Group props by player for easier analysis
 */
function groupPropsByPlayer(props) {
  const grouped = {};
  
  for (const prop of props) {
    const playerName = prop.player || 'Unknown';
    if (!grouped[playerName]) {
      grouped[playerName] = {
        player: playerName,
        team: prop.team || 'Unknown',
        playerId: prop.player_id || null,
        props: []
      };
    }
    // Store player_id if available
    if (prop.player_id && !grouped[playerName].playerId) {
      grouped[playerName].playerId = prop.player_id;
    }
    grouped[playerName].props.push({
      type: prop.prop_type,
      line: prop.line,
      over_odds: prop.over_odds,
      under_odds: prop.under_odds
    });
  }
  
  return Object.values(grouped);
}

/**
 * Get top prop candidates based on line value and odds quality
 * LIMITED: Only top 7 players per team to reduce API token usage
 */
function getTopPropCandidates(props, maxPlayersPerTeam = 7) {
  const grouped = groupPropsByPlayer(props);
  
  // Score each player by number of props and odds quality
  // NOTE: No bias toward any specific prop type - Gary decides organically
  const scored = grouped.map(player => {
    const avgOdds = player.props.reduce((sum, p) => {
      const odds = p.over_odds || p.under_odds || -110;
      return sum + odds;
    }, 0) / player.props.length;
    
    // Prop variety bonus - reward players with multiple prop types available
    const uniquePropTypes = new Set(player.props.map(p => p.type)).size;
    
    return {
      ...player,
      score: player.props.length * 10 + (avgOdds > -110 ? 20 : 0) + (uniquePropTypes * 5)
    };
  });
  
  // Group by team and take top N from each
  const byTeam = {};
  for (const player of scored) {
    const team = player.team || 'Unknown';
    if (!byTeam[team]) byTeam[team] = [];
    byTeam[team].push(player);
  }
  
  // Sort each team's players and take top N
  const result = [];
  for (const team of Object.keys(byTeam)) {
    const teamPlayers = byTeam[team]
      .sort((a, b) => b.score - a.score)
      .slice(0, maxPlayersPerTeam);
    result.push(...teamPlayers);
  }
  
  console.log(`[NBA Props] Filtered to top ${maxPlayersPerTeam} players per team: ${result.length} total candidates`);
  
  return result.sort((a, b) => b.score - a.score);
}

/**
 * Format injuries relevant to NBA props
 */
function formatPropsInjuries(injuries = []) {
  return (injuries || [])
    .filter(inj => inj?.player?.full_name || inj?.player?.first_name)
    .slice(0, 12)
    .map((injury) => ({
      player: injury?.player?.full_name || `${injury?.player?.first_name || ''} ${injury?.player?.last_name || ''}`.trim(),
      position: injury?.player?.position || 'Unknown',
      status: injury?.status || 'Unknown',
      description: injury?.description || '',
      team: injury?.team?.full_name || ''
    }));
}

/**
 * Resolve player IDs from prop data or by searching BDL
 * CRITICAL: Also stores player's actual team to prevent wrong team assignment
 * Returns: { playerName: { id, team } }
 */
async function resolvePlayerIds(propCandidates, teamIds, season, homeTeamName, awayTeamName) {
  const playerIdMap = {}; // name -> { id, team }
  
  // CRITICAL: Do NOT trust pre-populated playerId from Odds API
  // Always verify against BDL roster to prevent players from other teams slipping through
  // E.g., De'Aaron Fox (Kings) should not appear in OKC @ SAS game props
  
  // Get all player names - we'll validate ALL of them against the roster
  const allPlayerNames = propCandidates.map(c => c.player);
  
  if (allPlayerNames.length > 0 && teamIds.length > 0) {
    try {
      // Fetch players for ONLY these two teams - this is our source of truth
      const playersResponse = await ballDontLieService.getPlayersGeneric(SPORT_KEY, {
        team_ids: teamIds,
        per_page: 100
      }).catch(() => []);
      
      // Build team ID to name mapping
      const teamIdToName = {};
      if (teamIds[0]) teamIdToName[teamIds[0]] = homeTeamName;
      if (teamIds[1]) teamIdToName[teamIds[1]] = awayTeamName;
      
      // Build a lookup from BDL roster - these are the ONLY valid players
      const bdlRoster = new Map();
      for (const player of playersResponse) {
        const fullName = player.full_name || `${player.first_name} ${player.last_name}`;
        const normalizedName = fullName.toLowerCase().trim();
        const lastName = (player.last_name || '').toLowerCase().trim();
        const playerTeamId = player.team?.id || player.team_id;
        const playerTeam = teamIdToName[playerTeamId] || player.team?.full_name || 'Unknown';
        
        bdlRoster.set(normalizedName, { id: player.id, team: playerTeam });
        // Also store by last name for fuzzy matching
        if (lastName && !bdlRoster.has(lastName)) {
          bdlRoster.set(lastName, { id: player.id, team: playerTeam });
        }
      }
      
      // Match prop candidates against BDL roster
      for (const candidateName of allPlayerNames) {
        const candidateNormalized = candidateName.toLowerCase().trim();
        
        // Try exact match first
        if (bdlRoster.has(candidateNormalized)) {
          playerIdMap[candidateNormalized] = bdlRoster.get(candidateNormalized);
          continue;
        }
        
        // Try substring match against roster
        for (const [rosterName, playerData] of bdlRoster) {
          if (rosterName === candidateNormalized ||
              rosterName.includes(candidateNormalized) ||
              candidateNormalized.includes(rosterName)) {
            playerIdMap[candidateNormalized] = playerData;
            break;
          }
        }
      }
      
      console.log(`[NBA Props Context] Validated ${Object.keys(playerIdMap).length}/${allPlayerNames.length} players against ${homeTeamName} + ${awayTeamName} roster`);
      
      // Log players that aren't on either team (will be filtered out)
      const invalidPlayers = allPlayerNames.filter(name => !playerIdMap[name.toLowerCase()]);
      if (invalidPlayers.length > 0) {
        console.log(`[NBA Props Context] ⚠️ FILTERED OUT ${invalidPlayers.length} players NOT on ${homeTeamName} or ${awayTeamName}: ${invalidPlayers.slice(0, 5).join(', ')}${invalidPlayers.length > 5 ? '...' : ''}`);
      }
    } catch (e) {
      console.warn('[NBA Props Context] Failed to validate player roster:', e.message);
    }
  }
  
  return playerIdMap;
}

/**
 * Fetch season stats for all prop candidates
 */
async function fetchPlayerSeasonStats(playerIdMap, season) {
  // Extract just the IDs from the playerIdMap (now stores { id, team })
  const playerIds = Object.values(playerIdMap).map(p => p?.id || p).filter(id => id);
  
  if (playerIds.length === 0) {
    console.warn('[NBA Props Context] No player IDs to fetch stats for');
    return {};
  }
  
  console.log(`[NBA Props Context] Fetching season stats for ${playerIds.length} players...`);
  
  try {
    const statsMap = await ballDontLieService.getNbaPlayerSeasonStatsForProps(playerIds, season);
    console.log(`[NBA Props Context] ✓ Got season stats for ${Object.keys(statsMap).length} players`);
    return statsMap;
  } catch (e) {
    console.warn('[NBA Props Context] Failed to fetch player season stats:', e.message);
    return {};
  }
}

/**
 * Fetch game logs for all prop candidates (last 10 games)
 * Includes consistency metrics, home/away splits, and recent form
 */
async function fetchPlayerGameLogs(playerIdMap) {
  // Extract just the IDs from the playerIdMap (now stores { id, team })
  const playerIds = Object.values(playerIdMap).map(p => p?.id || p).filter(id => id);
  
  if (playerIds.length === 0) {
    console.warn('[NBA Props Context] No player IDs to fetch game logs for');
    return {};
  }
  
  console.log(`[NBA Props Context] Fetching game logs for ${playerIds.length} players...`);
  
  try {
    const logsMap = await ballDontLieService.getNbaPlayerGameLogsBatch(playerIds, 10);
    console.log(`[NBA Props Context] ✓ Got game logs for ${Object.keys(logsMap).length} players`);
    return logsMap;
  } catch (e) {
    console.warn('[NBA Props Context] Failed to fetch player game logs:', e.message);
    return {};
  }
}

/**
 * Detect if either team is on a back-to-back (played yesterday)
 * B2B significantly impacts NBA player fatigue and performance
 * @param {Array<number>} teamIds - Team IDs
 * @param {string} gameDate - Game date string (YYYY-MM-DD)
 * @returns {Object} - { home: boolean, away: boolean }
 */
async function detectBackToBack(teamIds, gameDate) {
  const result = { home: false, away: false, homeLastGame: null, awayLastGame: null };

  if (!teamIds || teamIds.length === 0) return result;

  try {
    // Get yesterday's date
    const gameDateObj = new Date(gameDate);
    const yesterday = new Date(gameDateObj);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    // Check recent games for both teams using BDL
    // NBA uses getGames with date filter
    const recentGames = await ballDontLieService.getGames(SPORT_KEY, {
      dates: [yesterdayStr],
      team_ids: teamIds
    }).catch(() => []);

    if (recentGames.length > 0) {
      console.log(`[NBA Props Context] Found ${recentGames.length} games from yesterday for B2B check`);

      for (const game of recentGames) {
        const homeId = game.home_team?.id;
        const awayId = game.visitor_team?.id;

        // Check if our home team played yesterday
        if (teamIds[0] && (homeId === teamIds[0] || awayId === teamIds[0])) {
          result.home = true;
          result.homeLastGame = yesterdayStr;
        }

        // Check if our away team played yesterday
        if (teamIds[1] && (homeId === teamIds[1] || awayId === teamIds[1])) {
          result.away = true;
          result.awayLastGame = yesterdayStr;
        }
      }
    }

    return result;
  } catch (e) {
    console.warn('[NBA Props Context] B2B detection failed:', e.message);
    return result;
  }
}

/**
 * Build comprehensive player stats text with actual BDL data
 * ENHANCED: Now includes recent form, consistency, and home/away splits
 */
function buildPlayerStatsText(homeTeam, awayTeam, propCandidates, playerSeasonStats, playerIdMap, injuries, playerGameLogs = {}) {
  let statsText = '';
  
  // Helper to get stats for a player
  const getPlayerStats = (playerName) => {
    const playerId = playerIdMap[playerName.toLowerCase()];
    return playerId ? playerSeasonStats[playerId] : null;
  };
  
  // Helper to get game logs for a player
  const getPlayerLogs = (playerName) => {
    const playerId = playerIdMap[playerName.toLowerCase()];
    return playerId ? playerGameLogs[playerId] : null;
  };
  
  // Helper to format recent games as a string
  const formatRecentGames = (logs, statKey) => {
    if (!logs?.games || logs.games.length === 0) return '';
    const last5 = logs.games.slice(0, 5).map(g => g[statKey]);
    return `L5: [${last5.join(', ')}]`;
  };
  
  // Separate candidates by team
  const awayPlayers = propCandidates.filter(p => 
    p.team?.toLowerCase().includes(awayTeam.toLowerCase().split(' ').pop()) ||
    awayTeam.toLowerCase().includes(p.team?.toLowerCase().split(' ').pop() || '')
  );
  const homePlayers = propCandidates.filter(p => 
    p.team?.toLowerCase().includes(homeTeam.toLowerCase().split(' ').pop()) ||
    homeTeam.toLowerCase().includes(p.team?.toLowerCase().split(' ').pop() || '')
  );
  
  // Check for injured players
  const injuredNames = new Set(injuries.map(i => i.player?.toLowerCase()));
  
  // Away team section
  statsText += `### ${awayTeam} Players\n`;
  
  if (awayPlayers.length > 0) {
    statsText += '\n**Player Season Stats & Recent Form:**\n';
    for (const candidate of awayPlayers) {
      const stats = getPlayerStats(candidate.player);
      const logs = getPlayerLogs(candidate.player);
      const propsStr = candidate.props.map(p => `${p.type} ${p.line}`).join(', ');
      const isInjured = injuredNames.has(candidate.player.toLowerCase());
      const injuryFlag = isInjured ? ' ⚠️ INJURED' : '';
      
      if (stats) {
        statsText += `- **${candidate.player}** (${stats.position || 'N/A'})${injuryFlag}:\n`;
        statsText += `  Season: PPG ${stats.ppg || 'N/A'}, RPG ${stats.rpg || 'N/A'}, APG ${stats.apg || 'N/A'}, 3PG ${stats.tpg || 'N/A'}, PRA ${stats.pra || 'N/A'}, MPG ${stats.mpg || 'N/A'}\n`;
        
        // Add recent form if available - show ALL stat types equally for organic analysis
        if (logs) {
          const formIcon = logs.formTrend === 'hot' ? '🔥' : logs.formTrend === 'cold' ? '❄️' : '';
          statsText += `  L${logs.gamesAnalyzed} Avg: PTS ${logs.averages?.pts || 'N/A'}, REB ${logs.averages?.reb || 'N/A'}, AST ${logs.averages?.ast || 'N/A'}, 3PM ${logs.averages?.fg3m || 'N/A'} ${formIcon}\n`;
          
          // Show recent games for ALL prop types - no bias toward any stat
          statsText += `  Recent: PTS [${formatRecentGames(logs, 'pts')}] | REB [${formatRecentGames(logs, 'reb')}] | AST [${formatRecentGames(logs, 'ast')}]\n`;
          
          // Consistency scores for ALL stat types - Gary decides which matters
          if (logs.consistency) {
            const ptsC = logs.consistency.pts ? (parseFloat(logs.consistency.pts) * 100).toFixed(0) : 'N/A';
            const rebC = logs.consistency.reb ? (parseFloat(logs.consistency.reb) * 100).toFixed(0) : 'N/A';
            const astC = logs.consistency.ast ? (parseFloat(logs.consistency.ast) * 100).toFixed(0) : 'N/A';
            statsText += `  Consistency: PTS ${ptsC}% | REB ${rebC}% | AST ${astC}%\n`;
          }
          
          // Home/Away splits - show multiple stats
          if (logs.splits?.home && logs.splits?.away) {
            statsText += `  Home: ${logs.splits.home.pts} PTS, ${logs.splits.home.reb || 'N/A'} REB, ${logs.splits.home.ast || 'N/A'} AST (${logs.splits.home.games}g)\n`;
            statsText += `  Away: ${logs.splits.away.pts} PTS, ${logs.splits.away.reb || 'N/A'} REB, ${logs.splits.away.ast || 'N/A'} AST (${logs.splits.away.games}g)\n`;
          }
        }
        
        statsText += `  Props: ${propsStr}\n`;
      } else {
        statsText += `- ${candidate.player}${injuryFlag}: (stats unavailable) | Props: ${propsStr}\n`;
      }
    }
  }
  
  statsText += '\n';
  
  // Home team section
  statsText += `### ${homeTeam} Players\n`;
  
  if (homePlayers.length > 0) {
    statsText += '\n**Player Season Stats & Recent Form:**\n';
    for (const candidate of homePlayers) {
      const stats = getPlayerStats(candidate.player);
      const logs = getPlayerLogs(candidate.player);
      const propsStr = candidate.props.map(p => `${p.type} ${p.line}`).join(', ');
      const isInjured = injuredNames.has(candidate.player.toLowerCase());
      const injuryFlag = isInjured ? ' ⚠️ INJURED' : '';
      
      if (stats) {
        statsText += `- **${candidate.player}** (${stats.position || 'N/A'})${injuryFlag}:\n`;
        statsText += `  Season: PPG ${stats.ppg || 'N/A'}, RPG ${stats.rpg || 'N/A'}, APG ${stats.apg || 'N/A'}, 3PG ${stats.tpg || 'N/A'}, PRA ${stats.pra || 'N/A'}, MPG ${stats.mpg || 'N/A'}\n`;
        
        // Add recent form if available - show ALL stat types equally for organic analysis
        if (logs) {
          const formIcon = logs.formTrend === 'hot' ? '🔥' : logs.formTrend === 'cold' ? '❄️' : '';
          statsText += `  L${logs.gamesAnalyzed} Avg: PTS ${logs.averages?.pts || 'N/A'}, REB ${logs.averages?.reb || 'N/A'}, AST ${logs.averages?.ast || 'N/A'}, 3PM ${logs.averages?.fg3m || 'N/A'} ${formIcon}\n`;
          
          // Show recent games for ALL prop types - no bias toward any stat
          statsText += `  Recent: PTS [${formatRecentGames(logs, 'pts')}] | REB [${formatRecentGames(logs, 'reb')}] | AST [${formatRecentGames(logs, 'ast')}]\n`;
          
          // Consistency scores for ALL stat types - Gary decides which matters
          if (logs.consistency) {
            const ptsC = logs.consistency.pts ? (parseFloat(logs.consistency.pts) * 100).toFixed(0) : 'N/A';
            const rebC = logs.consistency.reb ? (parseFloat(logs.consistency.reb) * 100).toFixed(0) : 'N/A';
            const astC = logs.consistency.ast ? (parseFloat(logs.consistency.ast) * 100).toFixed(0) : 'N/A';
            statsText += `  Consistency: PTS ${ptsC}% | REB ${rebC}% | AST ${astC}%\n`;
          }
          
          // Home/Away splits - show multiple stats
          if (logs.splits?.home && logs.splits?.away) {
            statsText += `  Home: ${logs.splits.home.pts} PTS, ${logs.splits.home.reb || 'N/A'} REB, ${logs.splits.home.ast || 'N/A'} AST (${logs.splits.home.games}g)\n`;
            statsText += `  Away: ${logs.splits.away.pts} PTS, ${logs.splits.away.reb || 'N/A'} REB, ${logs.splits.away.ast || 'N/A'} AST (${logs.splits.away.games}g)\n`;
          }
        }
        
        statsText += `  Props: ${propsStr}\n`;
      } else {
        statsText += `- ${candidate.player}${injuryFlag}: (stats unavailable) | Props: ${propsStr}\n`;
      }
    }
  }
  
  // Add injury summary if any
  if (injuries.length > 0) {
    statsText += '\n### Injury Report\n';
    injuries.slice(0, 8).forEach(inj => {
      statsText += `- ${inj.player} (${inj.status}): ${inj.description?.slice(0, 80) || 'No details'}\n`;
    });
  }
  
  return statsText;
}

/**
 * Build token slices for prop analysis - enhanced with player stats and game logs
 */
function buildPropsTokenSlices(playerStats, propCandidates, injuries, marketSnapshot, playerSeasonStats, playerIdMap, playerGameLogs = {}) {
  // Enhance prop candidates with their season stats and recent form
  const enhancedCandidates = propCandidates.map(p => {
    const playerId = playerIdMap[p.player.toLowerCase()];
    const stats = playerId ? playerSeasonStats[playerId] : null;
    const logs = playerId ? playerGameLogs[playerId] : null;
    
    return {
      player: p.player,
      team: p.team,
      props: p.props,
      seasonStats: stats ? {
        ppg: stats.ppg,
        rpg: stats.rpg,
        apg: stats.apg,
        tpg: stats.tpg,
        spg: stats.spg,
        bpg: stats.bpg,
        pra: stats.pra,
        prCombo: stats.prCombo,
        paCombo: stats.paCombo,
        raCombo: stats.raCombo,
        mpg: stats.mpg,
        position: stats.position
      } : null,
      // NEW: Recent form data
      recentForm: logs ? {
        gamesAnalyzed: logs.gamesAnalyzed,
        averages: logs.averages,
        consistency: logs.consistency,
        splits: logs.splits,
        formTrend: logs.formTrend,
        lastGame: logs.lastGame,
        last5Games: logs.games?.slice(0, 5).map(g => ({
          pts: g.pts,
          reb: g.reb,
          ast: g.ast,
          fg3m: g.fg3m,
          opponent: g.opponent,
          isHome: g.isHome
        }))
      } : null
    };
  });
  
  return {
    player_stats: {
      summary: playerStats.substring(0, 5000), // Increased for more context
      playerCount: (playerStats.match(/\*\*/g) || []).length / 2
    },
    prop_lines: {
      candidates: enhancedCandidates,
      totalProps: propCandidates.reduce((sum, p) => sum + p.props.length, 0)
    },
    injury_report: {
      notable: injuries.slice(0, 10),
      total_listed: injuries.length
    },
    market_context: marketSnapshot
  };
}

/**
 * Build agentic context for NBA prop picks
 * ENHANCED: Now fetches and includes real player season stats
 */
export async function buildNbaPropsAgenticContext(game, playerProps, options = {}) {
  const commenceDate = parseGameDate(game.commence_time) || new Date();
  const month = commenceDate.getMonth() + 1;
  const year = commenceDate.getFullYear();
  // NBA season: Oct-Jun, so if month <= 6, it's previous year's season
  const season = month <= 6 ? year - 1 : year;
  const dateStr = commenceDate.toISOString().slice(0, 10);

  console.log(`[NBA Props Context] Building context for ${game.away_team} @ ${game.home_team} (${season} season)`);

  // Resolve teams
  let homeTeam = null;
  let awayTeam = null;
  try {
    [homeTeam, awayTeam] = await Promise.all([
      ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.home_team).catch(() => null),
      ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.away_team).catch(() => null)
    ]);
  } catch (e) {
    console.warn('[NBA Props Context] Failed to resolve teams:', e.message);
  }

  const teamIds = [];
  if (homeTeam?.id) teamIds.push(homeTeam.id);
  if (awayTeam?.id) teamIds.push(awayTeam.id);

  // Process prop candidates first - limit to top 7 players per team
  const propCandidates = getTopPropCandidates(playerProps, 7);
  
  // Parallel fetch: injuries, player IDs, AND narrative context via Gemini Grounding
  console.log('[NBA Props Context] Fetching injuries, player IDs, and narrative context...');
  const [injuries, playerIdMap, groundedContext] = await Promise.all([
    // Injuries from BDL
    teamIds.length > 0 
      ? ballDontLieService.getInjuriesGeneric(SPORT_KEY, { team_ids: teamIds }, options.nocache ? 0 : 5).catch(() => [])
      : Promise.resolve([]),
    
    // Resolve player IDs from BDL - also validates players are on one of the two teams
    resolvePlayerIds(propCandidates, teamIds, season, game.home_team, game.away_team),
    
    // NARRATIVE CONTEXT via Gemini Grounding - Critical for props like "Zion off bench", "Cooper Flagg rise"
    // Use Flash model for props to avoid Pro quota issues
    fetchGroundedContext(game.home_team, game.away_team, 'NBA', dateStr, { useFlash: true }).catch(e => {
      console.warn('[NBA Props Context] Gemini Grounding failed:', e.message);
      return null;
    })
  ]);
  
  // Extract narrative context for props
  const narrativeContext = groundedContext?.groundedRaw || null;
  if (narrativeContext) {
    console.log(`[NBA Props Context] ✓ Got narrative context (${narrativeContext.length} chars) from Gemini Grounding`);
  }
  
  // CRITICAL: Filter prop candidates to only include players verified on either team
  // This prevents players like "Anthony Davis" from appearing in DAL @ NOP props
  const validatedCandidates = propCandidates.filter(c => {
    const playerData = playerIdMap[c.player.toLowerCase()];
    if (playerData) {
      // Update the candidate's team with verified team from BDL
      c.team = playerData.team;
      return true;
    }
    return false; // Filter out players not on either team
  });
  
  if (validatedCandidates.length < propCandidates.length) {
    console.log(`[NBA Props Context] Validated ${validatedCandidates.length}/${propCandidates.length} players (filtered out players not on ${game.away_team} or ${game.home_team})`);
  }

  // NOW fetch player season stats AND game logs in parallel (requires player IDs)
  console.log('[NBA Props Context] Fetching BDL player season stats and game logs...');
  const [playerSeasonStats, playerGameLogs] = await Promise.all([
    fetchPlayerSeasonStats(playerIdMap, season),
    fetchPlayerGameLogs(playerIdMap)
  ]);
  
  // Log stats coverage (use validated candidates)
  const playersWithStats = Object.keys(playerSeasonStats).length;
  const playersWithLogs = Object.keys(playerGameLogs).length;
  const totalCandidates = validatedCandidates.length;
  console.log(`[NBA Props Context] Player stats coverage: ${playersWithStats}/${totalCandidates} players`);
  console.log(`[NBA Props Context] Player game logs coverage: ${playersWithLogs}/${totalCandidates} players`);

  // B2B (back-to-back) detection - important for NBA fatigue
  const b2bInfo = await detectBackToBack(teamIds, dateStr);
  if (b2bInfo.home || b2bInfo.away) {
    console.log(`[NBA Props Context] ⚠️ B2B detected: Home=${b2bInfo.home ? 'YES' : 'no'}, Away=${b2bInfo.away ? 'YES' : 'no'}`);
  }

  const formattedInjuries = formatPropsInjuries(injuries);
  const marketSnapshot = buildMarketSnapshot(game.bookmakers || [], 
    homeTeam?.full_name || game.home_team, 
    awayTeam?.full_name || game.away_team
  );

  // Build player stats text with REAL player data and recent form
  // Use validatedCandidates which only includes players on either team
  const playerStats = buildPlayerStatsText(
    game.home_team,
    game.away_team,
    validatedCandidates,
    playerSeasonStats,
    playerIdMap,
    formattedInjuries,
    playerGameLogs // Pass game logs for recent form
  );

  // Build token data with enhanced player info and game logs
  const tokenData = buildPropsTokenSlices(
    playerStats,
    validatedCandidates,
    formattedInjuries,
    marketSnapshot,
    playerSeasonStats,
    playerIdMap,
    playerGameLogs // Pass game logs
  );

  // Build game summary with B2B info
  const gameSummary = {
    gameId: `nba-props-${game.id}`,
    sport: SPORT_KEY,
    league: 'NBA',
    matchup: `${game.away_team} @ ${game.home_team}`,
    homeTeam: homeTeam?.full_name || game.home_team,
    awayTeam: awayTeam?.full_name || game.away_team,
    tipoff: formatGameTimeEST(game.commence_time),
    odds: {
      spread: marketSnapshot.spread,
      total: marketSnapshot.total,
      moneyline: marketSnapshot.moneyline
    },
    propCount: playerProps.length,
    topCandidates: validatedCandidates.map(p => p.player).slice(0, 6),
    playerStatsAvailable: playersWithStats > 0,
    // B2B detection - important for fatigue impact on props
    backToBack: {
      home: b2bInfo.home,
      away: b2bInfo.away
    }
  };

  console.log(`[NBA Props Context] ✓ Built context:`);
  console.log(`   - ${validatedCandidates.length} player candidates (verified on team)`);
  console.log(`   - ${playersWithStats} players with season stats`);
  console.log(`   - ${playersWithLogs} players with game logs`);
  console.log(`   - ${formattedInjuries.length} injuries`);
  console.log(`   - Narrative context: ${narrativeContext ? 'YES' : 'NO'}`);

  return {
    gameSummary,
    tokenData,
    playerProps,
    propCandidates: validatedCandidates, // Only return validated players on either team
    playerStats,
    playerSeasonStats,
    playerGameLogs, // Include game logs in return
    narrativeContext, // CRITICAL: Gemini Grounding context (e.g., Zion off bench, Cooper Flagg rise)
    meta: {
      homeTeam: homeTeam?.full_name || game.home_team,
      awayTeam: awayTeam?.full_name || game.away_team,
      season,
      gameTime: game.commence_time,
      playerStatsCoverage: `${playersWithStats}/${totalCandidates}`,
      playerLogsCoverage: `${playersWithLogs}/${totalCandidates}`,
      hasNarrativeContext: !!narrativeContext
    }
  };
}

export default {
  buildNbaPropsAgenticContext
};
