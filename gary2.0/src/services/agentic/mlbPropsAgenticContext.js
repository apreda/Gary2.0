/**
 * MLB Props Agentic Context Builder
 * Builds rich context for MLB player prop analysis
 *
 * MLB-specific focus areas:
 * - Lineup position and PA/AB opportunities
 * - Opposing pitcher matchup (handedness, ERA, K rate)
 * - Park factors (Coors, Yankee Stadium, etc.)
 * - Batter vs pitcher splits (L/R matchups)
 * - Game total environment (typically 7.0-11.0 range)
 * - Blowout awareness (MLB blowouts affect late-game playing time and bullpen usage)
 * - Starting pitcher prop context (strikeouts, earned runs, hits allowed)
 */
import { ballDontLieService } from '../ballDontLieService.js';
import {
  formatGameTimeEST,
  buildMarketSnapshot,
  parseGameDate,
  safeApiCallArray,
  safeApiCallObject,
  findBestPlayerMatch,
  checkDataAvailability,
  fixBdlInjuryStatus,
  normalizeTeamName
} from './sharedUtils.js';
import { getPlayerPropMovement } from './scoutReport/scoutReportBuilder.js';

const SPORT_KEY = 'baseball_mlb';

/**
 * Get Statcast process indicators for a player from recent plate appearances
 * Fetches PA data from the last 3-5 games and computes:
 *   - Average exit velocity (mph)
 *   - Barrel rate (% of PAs that are barrels)
 *   - Hard hit rate (exit velo >= 95 mph)
 *   - Average launch angle (degrees)
 *
 * @param {number} playerId - BDL player ID
 * @param {string} playerName - Player display name (for logging)
 * @param {Object} playerGameLogs - Pre-fetched game logs map (playerId -> { games: [...] })
 * @returns {Object|null} Statcast summary or null if unavailable
 */
async function getPlayerStatcastSummary(playerId, playerName, playerGameLogs) {
  try {
    if (!playerId) return null;

    // Get recent game IDs from pre-fetched game logs
    const logs = playerGameLogs[playerId];
    if (!logs?.games || logs.games.length === 0) return null;

    // Extract game IDs from the first 5 games (most recent)
    const recentGames = logs.games.slice(0, 5);
    const gameIds = recentGames
      .map(g => g.game?.id || g.game_id || g.gameId)
      .filter(Boolean);

    if (gameIds.length === 0) return null;

    // Fetch plate appearances for up to 3 games to limit API calls
    const gamesToFetch = gameIds.slice(0, 3);
    const paPromises = gamesToFetch.map(gid =>
      ballDontLieService.getMlbPlateAppearances(gid, 120).catch(() => [])
    );
    const paResults = await Promise.all(paPromises);

    // Flatten and filter to only this player's PAs
    const allPAs = paResults.flat().filter(pa => {
      const paPlayerId = pa.batter?.id || pa.player?.id || pa.player_id || pa.batter_id;
      return paPlayerId === playerId;
    });

    if (allPAs.length === 0) return null;

    // Compute Statcast metrics
    const exitVelos = allPAs
      .map(pa => pa.exit_velocity ?? pa.exitVelocity ?? pa.exit_velo)
      .filter(v => v != null && v > 0);

    const launchAngles = allPAs
      .map(pa => pa.launch_angle ?? pa.launchAngle)
      .filter(v => v != null);

    const barrels = allPAs.filter(pa => pa.is_barrel || pa.isBarrel || pa.barrel === true);
    const hardHits = exitVelos.filter(v => v >= 95);

    // Need at least some exit velocity data for meaningful metrics
    if (exitVelos.length === 0) return null;

    const avgExitVelo = exitVelos.reduce((a, b) => a + b, 0) / exitVelos.length;
    const barrelRate = (barrels.length / allPAs.length) * 100;
    const hardHitRate = (hardHits.length / exitVelos.length) * 100;
    const avgLaunchAngle = launchAngles.length > 0
      ? launchAngles.reduce((a, b) => a + b, 0) / launchAngles.length
      : null;

    return {
      playerName,
      playerId,
      avgExitVelo: parseFloat(avgExitVelo.toFixed(1)),
      barrelRate: parseFloat(barrelRate.toFixed(1)),
      hardHitRate: parseFloat(hardHitRate.toFixed(1)),
      avgLaunchAngle: avgLaunchAngle != null ? parseFloat(avgLaunchAngle.toFixed(1)) : null,
      plateAppearances: allPAs.length,
      gamesUsed: gamesToFetch.length
    };
  } catch (e) {
    console.warn(`[MLB Props Context] Statcast fetch failed for ${playerName}:`, e.message);
    return null;
  }
}

/**
 * Format Statcast summaries into a context string for Gary
 * @param {Array<Object>} summaries - Array of Statcast summary objects
 * @returns {string} Formatted context string
 */
function formatStatcastContext(summaries) {
  if (!summaries || summaries.length === 0) return '';

  let lines = ['STATCAST PROCESS INDICATORS (Last 3-5 games):'];
  for (const s of summaries) {
    let parts = [`Avg Exit Velo ${s.avgExitVelo} mph`];
    parts.push(`Barrel Rate ${s.barrelRate}%`);
    parts.push(`Hard Hit Rate ${s.hardHitRate}%`);
    if (s.avgLaunchAngle != null) {
      parts.push(`Avg Launch Angle ${s.avgLaunchAngle}\u00B0`);
    }
    lines.push(`  ${s.playerName}: ${parts.join(' | ')} (${s.plateAppearances} PAs)`);
  }
  return lines.join('\n');
}

/**
 * Calculate hit rate for an MLB player prop against recent game logs
 * Maps prop types to the corresponding game log field
 * @param {Array} games - Recent game log entries
 * @param {string} propType - The prop type (e.g., 'player_hits', 'home_runs')
 * @param {number} line - The line value (e.g., 1.5)
 * @returns {Object|null} Hit rate data
 */
function calculateMlbHitRate(games, propType, line) {
  if (!games || games.length === 0 || line == null) return null;

  // Map prop types to game log fields
  // Batters: hr, h, tb, rbi, r, sb, bb
  // Pitchers: so (strikeouts), er (earned runs), ha (hits allowed)
  const propToField = {
    'home_runs': 'hr', 'player_home_runs': 'hr', 'hrs': 'hr',
    'hits': 'h', 'player_hits': 'h', 'hits_allowed': 'ha', 'player_hits_allowed': 'ha',
    'total_bases': 'tb', 'player_total_bases': 'tb',
    'rbis': 'rbi', 'player_rbis': 'rbi', 'rbi': 'rbi', 'runs_batted_in': 'rbi',
    'runs': 'r', 'player_runs': 'r', 'runs_scored': 'r',
    'strikeouts': 'so', 'player_strikeouts': 'so', 'pitcher_strikeouts': 'so', 'ks': 'so',
    'walks': 'bb', 'player_walks': 'bb', 'bases_on_balls': 'bb',
    'stolen_bases': 'sb', 'player_stolen_bases': 'sb', 'steals': 'sb',
    'batting_average': 'avg',
    'pitcher_earned_runs': 'er', 'earned_runs': 'er', 'player_earned_runs': 'er',
    'pitcher_hits_allowed': 'ha', 'hits_allowed': 'ha'
  };

  const field = propToField[propType?.toLowerCase()] || propType;

  let hitsOver = 0, hitsUnder = 0, pushes = 0;
  const values = [];

  for (const game of games) {
    const value = game[field];
    if (value === undefined || value === null) continue;
    values.push(value);
    if (value > line) hitsOver++;
    else if (value < line) hitsUnder++;
    else pushes++;
  }

  const totalGames = values.length;
  if (totalGames === 0) return null;

  const avgValue = values.reduce((a, b) => a + b, 0) / totalGames;

  return {
    totalGames,
    hitsOver,
    hitsUnder,
    pushes,
    overRate: ((hitsOver / totalGames) * 100).toFixed(0),
    underRate: ((hitsUnder / totalGames) * 100).toFixed(0),
    avgValue: avgValue.toFixed(2),
    values: values.slice(0, 5),
    line: line
  };
}

/**
 * Group props by player for easier analysis
 * FILTERS OUT unpredictable prop types (first HR, grand slam, inning-specific, etc.)
 */
function groupPropsByPlayer(props) {
  const grouped = {};

  // Props we CAN analyze — core MLB props only (no exotic/long-shot props)
  const VALID_PROP_TYPES = [
    'home_runs', 'hrs', 'player_home_runs',
    'hits', 'player_hits',
    'total_bases', 'player_total_bases',
    'rbis', 'rbi', 'player_rbis', 'runs_batted_in', 'runs_scored',
    'singles', 'doubles',
    'walks', 'player_walks', 'bases_on_balls',
    'stolen_bases', 'player_stolen_bases', 'steals',
    'hits_runs_rbis',
    'pitcher_strikeouts', 'player_strikeouts', 'ks',
    'pitcher_earned_runs', 'earned_runs', 'player_earned_runs',
    'pitcher_hits_allowed', 'hits_allowed', 'player_hits_allowed',
    'pitcher_outs', 'outs_recorded',
    'pitcher_walks'
  ];

  // Props we CANNOT analyze (random/luck-based OR inning-specific)
  const INVALID_PROP_TYPES = [
    // First/last outcome — completely random timing
    'first_home_run', 'first_hr', '1st_home_run',
    'last_home_run', 'last_hr',
    'first_hit', '1st_hit',
    // Grand slam — extremely low frequency event
    'grand_slam', 'grand_slams',
    // Inning-specific props — timing is random
    '1st_inning', '2nd_inning', '3rd_inning', '4th_inning',
    '5th_inning', '6th_inning', '7th_inning', '8th_inning', '9th_inning',
    '_1i', '_2i', '_3i', '_4i', '_5i', '_6i', '_7i', '_8i', '_9i',
    'first_inning', 'inning_',
    // Exact score / parlay-style props
    'exact_', 'parlay',
    // Cycle / rare feats
    'hit_for_the_cycle', 'cycle', 'no_hitter', 'perfect_game',
    // Exotic props we don't analyze
    'triples', 'batting_average', 'player_batting_average',
    'pitcher_record_a_win'
  ];

  for (const prop of props) {
    const propType = (prop.prop_type || '').toLowerCase();

    // Skip unpredictable prop types
    if (INVALID_PROP_TYPES.some(invalid => propType.includes(invalid))) {
      continue;
    }

    // Only include if it's a valid analyzable prop type
    const isValidType = VALID_PROP_TYPES.some(valid => propType.includes(valid));
    if (!isValidType && propType) {
      console.log(`[MLB Props] Skipping unknown prop type: ${propType}`);
      continue;
    }

    // Filter out extreme lines (longshots we can't reliably analyze)
    const line = parseFloat(prop.line) || 0;
    if (propType.includes('stolen_bases') && line > 0.5) continue;  // Only 1+ steals
    if (propType.includes('home_runs') && line > 1.5) continue;     // Only 1+ or 1.5 HR
    if (propType.includes('doubles') && line > 0.5) continue;       // Only 1+ doubles
    if (propType.includes('singles') && line > 1.5) continue;       // Only 1+ or 1.5 singles

    const playerName = prop.player || 'Unknown';
    const propPlayerId = prop.player_id || prop.playerId || null;

    if (!grouped[playerName]) {
      grouped[playerName] = {
        player: playerName,
        team: prop.team || 'Unknown',
        playerId: propPlayerId,
        props: []
      };
    }
    // Store player_id if available (and not already set)
    if (propPlayerId && !grouped[playerName].playerId) {
      grouped[playerName].playerId = propPlayerId;
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
 * Get MLB game total context for prop analysis
 * MLB totals typically range from 7.0 to 11.0
 * Implied runs per team are critical for hitter props
 *
 * @param {Object} marketSnapshot - Market data with spread and total
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @returns {Object} Game environment analysis for props
 */
function getMlbGameTotalContext(marketSnapshot, homeTeam = '', awayTeam = '') {
  const total = parseFloat(marketSnapshot?.total?.line) || null;
  const spread = parseFloat(marketSnapshot?.spread?.home?.point) ||
                 parseFloat(marketSnapshot?.spread?.line) || null;

  if (!total) {
    return {
      available: false,
      reason: 'Total not available',
      total: null,
      spread: null,
    };
  }

  // Calculate implied runs per team
  // Formula: Home Implied = (Total - Spread) / 2, Away Implied = (Total + Spread) / 2
  // MLB spread (run line) is usually -1.5/+1.5
  let homeImplied = total / 2;
  let awayImplied = total / 2;

  if (spread !== null) {
    homeImplied = (total - spread) / 2;
    awayImplied = (total + spread) / 2;
  }

  // Favorite determination
  let favorite = null;
  let underdog = null;
  if (spread !== null) {
    if (spread < 0) {
      favorite = homeTeam || 'Home';
      underdog = awayTeam || 'Away';
    } else if (spread > 0) {
      favorite = awayTeam || 'Away';
      underdog = homeTeam || 'Home';
    }
  }

  return {
    available: true,
    total,
    spread: spread || null,
    favorite,
    underdog,
    impliedRuns: {
      home: { team: homeTeam || 'Home', runs: parseFloat(homeImplied.toFixed(2)) },
      away: { team: awayTeam || 'Away', runs: parseFloat(awayImplied.toFixed(2)) }
    },
    // Context for MLB totals
    sharpContext: total >= 9.5
      ? 'Game total is high (9.5+) — offensive environment.'
      : total <= 7.5
        ? 'Game total is low (7.5 or less) — pitching-dominant environment.'
        : 'Game total is average.',
    // Blowout awareness: unlike NHL, MLB blowouts significantly affect props
    // - Position players may be pulled in blowouts (less AB/PA)
    // - Starters pulled early in blowouts (fewer K opportunities)
    // - Bullpen usage changes drastically
    blowoutNote: 'MLB blowouts can reduce playing time for starters and alter bullpen usage. Large implied run differentials increase blowout risk.'
  };
}

/**
 * Get top prop candidates based on line value and odds quality
 * Returns top N players PER TEAM
 *
 * Filters to only players on homeTeam or awayTeam to prevent
 * pulling in players from other games when odds API returns multiple games
 */
function getTopPropCandidates(props, maxPlayersPerTeam = 7, homeTeamName = null, awayTeamName = null) {
  const grouped = groupPropsByPlayer(props);

  const normalizeTeam = (name) => (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const homeNorm = normalizeTeam(homeTeamName);
  const awayNorm = normalizeTeam(awayTeamName);

  // Score each player by number of props and odds quality
  const scored = grouped.map(player => {
    const avgOdds = player.props.reduce((sum, p) => {
      const odds = p.over_odds || p.under_odds || null;
      return sum + odds;
    }, 0) / player.props.length;

    // Prop variety bonus - reward players with multiple prop types available
    const uniquePropTypes = new Set(player.props.map(p => p.type)).size;

    return {
      ...player,
      score: player.props.length * 10 + (avgOdds > -110 ? 20 : 0) + (uniquePropTypes * 5)
    };
  });

  // Filter to only players on the two teams in this game
  let filteredPlayers = scored;
  if (homeNorm && awayNorm) {
    filteredPlayers = scored.filter(player => {
      const playerTeamNorm = normalizeTeam(player.team);
      return playerTeamNorm.includes(homeNorm) || homeNorm.includes(playerTeamNorm) ||
             playerTeamNorm.includes(awayNorm) || awayNorm.includes(playerTeamNorm);
    });

    const filteredOut = scored.length - filteredPlayers.length;
    if (filteredOut > 0) {
      console.log(`[MLB Props] Filtered out ${filteredOut} players not on ${homeTeamName} or ${awayTeamName}`);
    }
  }

  // Group by team and take top N from each
  const byTeam = {};
  for (const player of filteredPlayers) {
    const teamRaw = player.team || 'Unknown';
    const teamKey = teamRaw.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!byTeam[teamKey]) byTeam[teamKey] = { name: teamRaw, players: [] };
    byTeam[teamKey].players.push(player);
  }

  // Sort each team's players and take top N per team
  const result = [];
  const teamNames = Object.keys(byTeam);

  for (const teamKey of teamNames) {
    const teamData = byTeam[teamKey];
    const teamPlayers = teamData.players
      .sort((a, b) => b.score - a.score)
      .slice(0, maxPlayersPerTeam);
    result.push(...teamPlayers);
    console.log(`[MLB Props] Team "${teamData.name}": ${teamPlayers.length} players selected`);
  }

  console.log(`[MLB Props] Total: ${result.length} candidates (${maxPlayersPerTeam} per team x ${teamNames.length} teams)`);

  return result.sort((a, b) => b.score - a.score);
}

/**
 * Format injuries relevant to MLB props
 */
function formatPropsInjuries(injuries = []) {
  return (injuries || [])
    .filter(inj => inj?.player?.full_name || inj?.player?.first_name)
    .slice(0, 15)
    .map((injury) => {
      const fixedInj = fixBdlInjuryStatus(injury);
      return {
        player: fixedInj?.player?.full_name || `${fixedInj?.player?.first_name || ''} ${fixedInj?.player?.last_name || ''}`.trim(),
        position: fixedInj?.player?.position || 'Unknown',
        status: fixedInj?.status || 'Unknown',
        description: fixedInj?.description || '',
        team: fixedInj?.team?.full_name || '',
        duration: fixedInj?.duration || 'UNKNOWN',
        isEdge: fixedInj?.isEdge || false
      };
    });
}

/**
 * Resolve player IDs from prop data
 *
 * Uses the player_id already embedded in prop data from BDL.
 * Validates that each player is on one of the two teams in this game.
 *
 * Returns: { playerName: { id, team } }
 */
async function resolvePlayerIds(propCandidates, teamIds, season, homeTeamName, awayTeamName) {
  const playerIdMap = {};

  if (propCandidates.length === 0) {
    return playerIdMap;
  }

  const homeNorm = normalizeTeamName(homeTeamName);
  const awayNorm = normalizeTeamName(awayTeamName);
  const validTeamIds = new Set(teamIds);

  let playersWithIds = 0;
  let playersValidated = 0;

  for (const candidate of propCandidates) {
    const playerName = candidate.player;
    const playerId = candidate.playerId;
    const playerTeam = candidate.team || '';
    const playerTeamNorm = normalizeTeamName(playerTeam);

    if (!playerId) {
      continue;
    }
    playersWithIds++;

    // Validate team: check if player is on home or away team
    const isOnValidTeam =
      playerTeamNorm.includes(homeNorm) || homeNorm.includes(playerTeamNorm) ||
      playerTeamNorm.includes(awayNorm) || awayNorm.includes(playerTeamNorm);

    if (isOnValidTeam) {
      playerIdMap[playerName.toLowerCase()] = { id: playerId, team: playerTeam };
      playersValidated++;
    }
  }

  console.log(`[MLB Props Context] Validated ${playersValidated}/${propCandidates.length} players against ${homeTeamName} + ${awayTeamName}`);
  console.log(`[MLB Props Context] Players with BDL IDs: ${playersWithIds}/${propCandidates.length}`);

  if (playersValidated === 0 && playersWithIds > 0) {
    const samplePlayers = propCandidates.slice(0, 3).map(c => `${c.player} (${c.team})`).join(', ');
    console.log(`[MLB Props Context] Team matching failed. Sample: ${samplePlayers}`);
    console.log(`[MLB Props Context] Looking for: "${homeTeamName}" or "${awayTeamName}"`);
  }

  return playerIdMap;
}

/**
 * Fetch season stats for all prop candidates
 * Uses generic BDL player stats endpoint for MLB
 * Returns map of playerId -> stats object
 */
async function fetchPlayerSeasonStats(playerIdMap, season) {
  const playerEntries = Object.entries(playerIdMap);

  if (playerEntries.length === 0) {
    console.warn('[MLB Props Context] No player IDs to fetch stats for');
    return {};
  }

  console.log(`[MLB Props Context] Fetching season stats for ${playerEntries.length} players...`);

  const statsMap = {};

  try {
    // Fetch stats for each player via the generic BDL endpoint
    const promises = playerEntries.map(async ([name, data]) => {
      const playerId = data?.id || data;
      try {
        const stats = await ballDontLieService.getPlayerStats(SPORT_KEY, {
          player_ids: [playerId],
          season
        });
        if (stats && stats.length > 0) {
          statsMap[playerId] = stats[0];
        }
      } catch (e) {
        // Individual player failure is non-fatal
      }
    });

    await Promise.all(promises);
    console.log(`[MLB Props Context] Got season stats for ${Object.keys(statsMap).length} players`);
  } catch (e) {
    console.warn('[MLB Props Context] Failed to fetch player season stats:', e.message);
  }

  return statsMap;
}

/**
 * Fetch player splits for all prop candidates (includes byArena venue-specific data)
 * Used to show how each player performs at tonight's ballpark
 */
async function fetchPlayerSplits(playerIdMap, season, venueName) {
  const playerEntries = Object.entries(playerIdMap);
  if (playerEntries.length === 0) return {};

  console.log(`[MLB Props Context] Fetching splits for ${playerEntries.length} players (venue: ${venueName || 'unknown'})...`);
  const splitsMap = {};

  try {
    const promises = playerEntries.map(async ([name, data]) => {
      const playerId = data?.id || data;
      try {
        const splits = await ballDontLieService.getMlbPlayerSplits({ playerId, season }).catch(() => null);
        if (splits) {
          // Extract venue-specific stats if venue name is known
          let venueStats = null;
          if (venueName && splits.byArena) {
            const venueNorm = venueName.toLowerCase();
            venueStats = splits.byArena.find(a =>
              a.category === 'batting' && a.split_name && a.split_name.toLowerCase().includes(venueNorm.split(' ')[0])
            ) || null;
          }
          // Extract L/R splits
          const vsLeft = splits.byBreakdown?.find(s => s.category === 'batting' && s.split_name === 'vs. Left');
          const vsRight = splits.byBreakdown?.find(s => s.category === 'batting' && s.split_name === 'vs. Right');

          splitsMap[playerId] = { venueStats, vsLeft, vsRight, raw: splits };
        }
      } catch (e) { /* non-fatal */ }
    });
    await Promise.all(promises);
    console.log(`[MLB Props Context] Got splits for ${Object.keys(splitsMap).length} players`);
  } catch (e) {
    console.warn('[MLB Props Context] Failed to fetch player splits:', e.message);
  }
  return splitsMap;
}

/**
 * Fetch game logs for all prop candidates (last 10 games)
 * Includes consistency metrics and recent form
 */
async function fetchPlayerGameLogs(playerIdMap) {
  const playerEntries = Object.entries(playerIdMap);

  if (playerEntries.length === 0) {
    console.warn('[MLB Props Context] No player IDs to fetch game logs for');
    return {};
  }

  console.log(`[MLB Props Context] Fetching game logs for ${playerEntries.length} players...`);

  const logsMap = {};

  try {
    const promises = playerEntries.map(async ([name, data]) => {
      const playerId = data?.id || data;
      try {
        const stats = await ballDontLieService.getPlayerStats(SPORT_KEY, {
          player_ids: [playerId],
          per_mode: 'game'
        });
        if (stats && stats.length > 0) {
          // Structure as game logs with analysis
          const games = stats.slice(0, 10);
          logsMap[playerId] = {
            games,
            gamesAnalyzed: games.length
          };
        }
      } catch (e) {
        // Individual player failure is non-fatal
      }
    });

    await Promise.all(promises);
    console.log(`[MLB Props Context] Got game logs for ${Object.keys(logsMap).length} players`);
  } catch (e) {
    console.warn('[MLB Props Context] Failed to fetch player game logs:', e.message);
  }

  return logsMap;
}

/**
 * Detect if either team is on a day game after night game or doubleheader situation
 * In MLB, back-to-back is less relevant than in NHL/NBA, but travel and
 * day-game-after-night-game are fatigue factors
 *
 * @param {Array<number>} teamIds - Team IDs [homeTeamId, awayTeamId]
 * @param {string} gameDate - Game date string (YYYY-MM-DD)
 * @returns {Object} Schedule fatigue info
 */
async function detectScheduleFatigue(teamIds, gameDate) {
  const result = {
    home: false,
    away: false,
    homeLastGame: null,
    awayLastGame: null,
    significant: false
  };

  if (!teamIds || teamIds.length === 0) return result;

  try {
    const [year, month, day] = gameDate.split('-').map(Number);
    const gameDateObj = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

    // Check yesterday for back-to-back
    const yesterdayObj = new Date(gameDateObj);
    yesterdayObj.setDate(yesterdayObj.getDate() - 1);
    const yesterdayStr = yesterdayObj.toISOString().slice(0, 10);

    console.log(`[MLB Props Context] Schedule fatigue check: Game date=${gameDate}, checking yesterday=${yesterdayStr}`);

    // Use generic games endpoint to check for yesterday's games
    const yesterdayGames = await safeApiCallArray(
      () => ballDontLieService.getGamesGeneric(SPORT_KEY, { dates: [yesterdayStr], team_ids: teamIds }),
      `MLB Props: Schedule fatigue check for ${yesterdayStr}`
    );

    if (yesterdayGames.length > 0) {
      console.log(`[MLB Props Context] Found ${yesterdayGames.length} games from ${yesterdayStr} involving these teams`);

      for (const game of yesterdayGames) {
        const homeId = game?.home_team?.id;
        const awayId = game?.away_team?.id;

        const todayHomeId = teamIds[0];
        const todayAwayId = teamIds[1];

        if (todayHomeId && (homeId === todayHomeId || awayId === todayHomeId)) {
          result.home = true;
          result.homeLastGame = yesterdayStr;
          console.log(`[MLB Props Context] Home team (ID:${todayHomeId}) played yesterday`);
        }

        if (todayAwayId && (homeId === todayAwayId || awayId === todayAwayId)) {
          result.away = true;
          result.awayLastGame = yesterdayStr;
          console.log(`[MLB Props Context] Away team (ID:${todayAwayId}) played yesterday`);
        }
      }

      // In MLB, consecutive games are normal. Mark significant only for unusual situations.
      // Narrative context (from Grounding) will identify day-after-night, doubleheaders, etc.
      result.significant = false;
    } else {
      console.log(`[MLB Props Context] No games found on ${yesterdayStr}`);
    }

    return result;
  } catch (e) {
    console.warn('[MLB Props Context] Schedule fatigue detection failed:', e.message);
    return result;
  }
}

/**
 * Build comprehensive player stats text with BDL data
 * MLB-specific: shows batting stats (AVG, HR, H, RBI, SB) and pitching stats (ERA, K, WHIP)
 */
function buildPlayerStatsText(homeTeam, awayTeam, advancedStats, propCandidates, playerSeasonStats, playerIdMap, richContext, injuries = [], playerGameLogs = {}, playerSplits = {}) {
  let statsText = '';

  // Helper to get stats for a player
  const getPlayerStats = (playerName) => {
    const playerData = playerIdMap[playerName.toLowerCase()];
    const playerId = playerData?.id || playerData;
    return playerId ? playerSeasonStats[playerId] : null;
  };

  // Helper to get game logs for a player
  const getPlayerLogs = (playerName) => {
    const playerData = playerIdMap[playerName.toLowerCase()];
    const playerId = playerData?.id || playerData;
    return playerId ? playerGameLogs[playerId] : null;
  };

  // Helper to get splits (venue + L/R) for a player
  const getPlayerSplitsData = (playerName) => {
    const playerData = playerIdMap[playerName.toLowerCase()];
    const playerId = playerData?.id || playerData;
    return playerId ? playerSplits[playerId] : null;
  };

  // Helper to determine if a player is a pitcher based on their props
  const isPitcher = (candidate) => {
    return candidate.props.some(p => {
      const t = (p.type || '').toLowerCase();
      return t.includes('strikeout') || t.includes('earned_run') || t.includes('hits_allowed') ||
             t.includes('pitcher') || t.includes('outs') || t.includes('innings');
    });
  };

  // Helper to format recent games for a stat
  const formatRecentGames = (logs, statKey) => {
    if (!logs?.games || logs.games.length === 0) return '';
    const last5 = logs.games.slice(0, 5).map(g => g[statKey]).filter(v => v !== undefined);
    return last5.length > 0 ? `L5: [${last5.join(', ')}]` : '';
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

  // Away team section
  statsText += `### ${awayTeam} Players\n`;

  if (awayPlayers.length > 0) {
    statsText += '\n**Player Season Stats & Recent Form:**\n';
    for (const candidate of awayPlayers) {
      const stats = getPlayerStats(candidate.player);
      const logs = getPlayerLogs(candidate.player);
      const propsStr = candidate.props.map(p => `${p.type} ${p.line}`).join(', ');

      const injuryRecord = injuries.find(i => i.player.toLowerCase() === candidate.player.toLowerCase());
      const isInjured = !!injuryRecord;
      const durationTag = injuryRecord?.duration ? ` [${injuryRecord.duration}]` : '';
      const injuryFlag = isInjured ? ` INJURED${durationTag}` : '';

      if (stats) {
        statsText += `- **${candidate.player}**${injuryFlag}:\n`;

        if (isPitcher(candidate)) {
          // Pitcher stats
          statsText += `  Season: ${stats.games_played || stats.gs || 0} GP, ERA ${stats.era || 'N/A'}, K/9 ${stats.k_per_9 || stats.so_per_9 || 'N/A'}, WHIP ${stats.whip || 'N/A'}, IP ${stats.ip || stats.innings_pitched || 'N/A'}, K ${stats.so || stats.strikeouts || 'N/A'}, BB ${stats.bb || 'N/A'}\n`;
          if (logs) {
            statsText += `  Recent: K ${formatRecentGames(logs, 'so')} | ER ${formatRecentGames(logs, 'er')} | IP ${formatRecentGames(logs, 'ip')}\n`;
          }
        } else {
          // Batter stats
          statsText += `  Season: ${stats.games_played || 0} GP, AVG ${stats.avg || stats.batting_average || 'N/A'}, HR ${stats.hr || stats.home_runs || 'N/A'}, H ${stats.h || stats.hits || 'N/A'}, RBI ${stats.rbi || 'N/A'}, R ${stats.r || stats.runs || 'N/A'}, SB ${stats.sb || stats.stolen_bases || 'N/A'}, OPS ${stats.ops || 'N/A'}, AB ${stats.ab || stats.at_bats || 'N/A'}\n`;
          if (logs) {
            statsText += `  Recent: H ${formatRecentGames(logs, 'h')} | HR ${formatRecentGames(logs, 'hr')} | RBI ${formatRecentGames(logs, 'rbi')} | TB ${formatRecentGames(logs, 'tb')} | R ${formatRecentGames(logs, 'r')}\n`;
          }
          // Venue-specific + L/R splits from BDL
          const splitsData = getPlayerSplitsData(candidate.player);
          if (splitsData) {
            if (splitsData.venueStats) {
              const v = splitsData.venueStats;
              statsText += `  At this ballpark: AVG ${v.avg || 'N/A'}, OPS ${v.ops || 'N/A'}, HR ${v.home_runs || 0}, AB ${v.at_bats || 0}\n`;
            }
            if (splitsData.vsLeft) {
              statsText += `  vs LHP: AVG ${splitsData.vsLeft.avg || 'N/A'}, OPS ${splitsData.vsLeft.ops || 'N/A'}, HR ${splitsData.vsLeft.home_runs || 0}\n`;
            }
            if (splitsData.vsRight) {
              statsText += `  vs RHP: AVG ${splitsData.vsRight.avg || 'N/A'}, OPS ${splitsData.vsRight.ops || 'N/A'}, HR ${splitsData.vsRight.home_runs || 0}\n`;
            }
          }
        }

        // Home/Away splits if available
        if (logs?.splits?.home && logs?.splits?.away) {
          statsText += `  Home: ${JSON.stringify(logs.splits.home)}\n`;
          statsText += `  Away: ${JSON.stringify(logs.splits.away)}\n`;
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

      const injuryRecord = injuries.find(i => i.player.toLowerCase() === candidate.player.toLowerCase());
      const isInjured = !!injuryRecord;
      const durationTag = injuryRecord?.duration ? ` [${injuryRecord.duration}]` : '';
      const injuryFlag = isInjured ? ` INJURED${durationTag}` : '';

      if (stats) {
        statsText += `- **${candidate.player}**${injuryFlag}:\n`;

        if (isPitcher(candidate)) {
          statsText += `  Season: ${stats.games_played || stats.gs || 0} GP, ERA ${stats.era || 'N/A'}, K/9 ${stats.k_per_9 || stats.so_per_9 || 'N/A'}, WHIP ${stats.whip || 'N/A'}, IP ${stats.ip || stats.innings_pitched || 'N/A'}, K ${stats.so || stats.strikeouts || 'N/A'}, BB ${stats.bb || 'N/A'}\n`;
          if (logs) {
            statsText += `  Recent: K ${formatRecentGames(logs, 'so')} | ER ${formatRecentGames(logs, 'er')} | IP ${formatRecentGames(logs, 'ip')}\n`;
          }
        } else {
          statsText += `  Season: ${stats.games_played || 0} GP, AVG ${stats.avg || stats.batting_average || 'N/A'}, HR ${stats.hr || stats.home_runs || 'N/A'}, H ${stats.h || stats.hits || 'N/A'}, RBI ${stats.rbi || 'N/A'}, R ${stats.r || stats.runs || 'N/A'}, SB ${stats.sb || stats.stolen_bases || 'N/A'}, OPS ${stats.ops || 'N/A'}, AB ${stats.ab || stats.at_bats || 'N/A'}\n`;
          if (logs) {
            statsText += `  Recent: H ${formatRecentGames(logs, 'h')} | HR ${formatRecentGames(logs, 'hr')} | RBI ${formatRecentGames(logs, 'rbi')} | TB ${formatRecentGames(logs, 'tb')} | R ${formatRecentGames(logs, 'r')}\n`;
          }
        }

        if (logs?.splits?.home && logs?.splits?.away) {
          statsText += `  Home: ${JSON.stringify(logs.splits.home)}\n`;
          statsText += `  Away: ${JSON.stringify(logs.splits.away)}\n`;
        }

        statsText += `  Props: ${propsStr}\n`;
      } else {
        statsText += `- ${candidate.player}${injuryFlag}: (stats unavailable) | Props: ${propsStr}\n`;
      }
    }
  }

  // Key insights from grounding
  if (advancedStats?.key_analytics_insights?.length > 0) {
    statsText += '\n### Key Insights\n';
    advancedStats.key_analytics_insights.slice(0, 4).forEach((insight, i) => {
      statsText += `${i + 1}. ${insight}\n`;
    });
  }

  // Player streaks from rich context
  if (richContext?.player_streaks?.length > 0) {
    statsText += '\n### Player Streaks & Trends\n';
    richContext.player_streaks.slice(0, 5).forEach(streak => {
      const text = typeof streak === 'string' ? streak : streak?.description || JSON.stringify(streak);
      statsText += `- ${text}\n`;
    });
  }

  return statsText;
}

/**
 * Build token slices for prop analysis — enhanced with player stats, game logs,
 * hit rates, and LINE MOVEMENT
 */
function buildPropsTokenSlices(playerStats, propCandidates, injuries, marketSnapshot, advancedStats, playerSeasonStats, playerIdMap, playerGameLogs = {}, lineMovements = {}, homeTeamName = 'Home', awayTeamName = 'Away') {
  // Enhance prop candidates with their season stats, recent form, and line movement
  const enhancedCandidates = propCandidates.map(p => {
    const playerData = playerIdMap[p.player.toLowerCase()];
    const playerId = playerData?.id || playerData;
    const stats = playerId ? playerSeasonStats[playerId] : null;
    const logs = playerId ? playerGameLogs[playerId] : null;
    const games = logs?.games || [];

    // Calculate hit rates and line movement for each prop
    const propsWithContext = p.props.map(prop => {
      // Look up line movement for this player + prop
      const propKey = `${p.player}_${prop.type}`.toLowerCase().replace(/\s+/g, '_');
      const movement = lineMovements[propKey] || getPlayerPropMovement(lineMovements, p.player, prop.type);

      // Calculate hit rate from recent game logs
      const hitRate = games.length > 0
        ? calculateMlbHitRate(games, prop.type, prop.line)
        : null;

      return {
        ...prop,
        // HIT RATE DATA - "hit O 1.5 hits in 7/10 games"
        hitRate: hitRate ? {
          overRate: hitRate.overRate,
          underRate: hitRate.underRate,
          avgValue: hitRate.avgValue,
          lastValues: hitRate.values,
          line: hitRate.line,
          gamesAnalyzed: hitRate.totalGames
        } : null,
        // LINE MOVEMENT DATA
        lineMovement: movement ? {
          open: movement.open,
          current: movement.current,
          direction: movement.direction,
          magnitude: movement.magnitude,
          signal: movement.signal,
          movementNote: movement.magnitude >= 0.5
            ? `Line moved ${movement.direction} ${Math.abs(movement.magnitude)} (${movement.open} -> ${movement.current})`
            : null
        } : { source: 'NOT_FOUND' }
      };
    });

    return {
      player: p.player,
      team: p.team,
      props: propsWithContext,
      seasonStats: stats ? {
        gamesPlayed: stats.games_played,
        avg: stats.avg || stats.batting_average,
        hr: stats.hr || stats.home_runs,
        hits: stats.h || stats.hits,
        rbi: stats.rbi,
        runs: stats.r || stats.runs,
        sb: stats.sb || stats.stolen_bases,
        ops: stats.ops,
        // Pitcher-specific
        era: stats.era,
        whip: stats.whip,
        strikeouts: stats.so || stats.strikeouts,
        ip: stats.ip || stats.innings_pitched
      } : null,
      // Recent form data
      recentForm: logs ? {
        gamesAnalyzed: logs.gamesAnalyzed,
        last5Games: logs.games?.slice(0, 5).map(g => ({
          h: g.h,
          hr: g.hr,
          rbi: g.rbi,
          r: g.r,
          tb: g.tb,
          sb: g.sb,
          so: g.so,
          bb: g.bb,
          er: g.er,
          ip: g.ip,
          opponent: g.opponent,
          isHome: g.isHome
        }))
      } : null
    };
  });

  return {
    player_stats: {
      summary: playerStats,
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
    market_context: marketSnapshot,
    // GAME ENVIRONMENT - Critical for understanding scoring context
    // MLB totals (7.0-11.0) drive implied run expectations per team
    game_environment: getMlbGameTotalContext(marketSnapshot, homeTeamName, awayTeamName),
    team_analytics: {
      home: advancedStats?.home_advanced || null,
      away: advancedStats?.away_advanced || null
    },
    // LINE MOVEMENT SUMMARY
    lineMovementSummary: {
      totalFound: Object.keys(lineMovements).length,
      significantMoves: Object.values(lineMovements).filter(m => Math.abs(m.magnitude) >= 0.5).length
    }
  };
}

/**
 * Build agentic context for MLB prop picks
 * Main export function — follows the same return structure as NHL/NBA/NFL context builders
 */
export async function buildMlbPropsAgenticContext(game, playerProps, options = {}) {
  const commenceDate = parseGameDate(game.commence_time) || new Date();
  const month = commenceDate.getMonth() + 1;
  const year = commenceDate.getFullYear();
  // MLB season runs ~March/April through October
  // Season year is the calendar year the season is played in
  const season = year;
  const dateStr = commenceDate.toISOString().slice(0, 10);

  console.log(`[MLB Props Context] Building context for ${game.away_team} @ ${game.home_team} (Season ${season})`);

  // Resolve teams
  let homeTeam = null;
  let awayTeam = null;
  try {
    [homeTeam, awayTeam] = await Promise.all([
      safeApiCallObject(
        () => ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.home_team),
        `MLB Props: Resolve home team "${game.home_team}"`
      ),
      safeApiCallObject(
        () => ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.away_team),
        `MLB Props: Resolve away team "${game.away_team}"`
      )
    ]);
  } catch (e) {
    console.warn('[MLB Props Context] Failed to resolve teams:', e.message);
  }

  const teamIds = [];
  if (homeTeam?.id) teamIds.push(homeTeam.id);
  if (awayTeam?.id) teamIds.push(awayTeam.id);

  // Process prop candidates — 7 players per team (14 total)
  const propCandidates = getTopPropCandidates(playerProps, 7, game.home_team, game.away_team);

  // Parallel fetch: injuries, player ID resolution, narrative context, line movement
  console.log('[MLB Props Context] Fetching injuries, player IDs, narrative, and line movement...');
  const [injuries, playerIdMap, comprehensiveNarrative, lineMovementData] = await Promise.all([
    // Injuries from BDL
    teamIds.length > 0
      ? safeApiCallArray(
          () => ballDontLieService.getInjuriesGeneric(SPORT_KEY, { team_ids: teamIds }, options.nocache ? 0 : 5),
          `MLB Props: Fetch injuries for teams ${teamIds.join(', ')}`
        )
      : Promise.resolve([]),

    // Resolve player IDs — validates players are on one of the two teams
    resolvePlayerIds(propCandidates, teamIds, season, game.home_team, game.away_team),

    // COMPREHENSIVE NARRATIVE CONTEXT - Fetches ALL factors UPFRONT:
    // - Starting pitcher confirmations (critical for MLB)
    // - Lineup orders / batting order position
    // - Weather / park factor context
    // - Injury news, IL stints
    // - Hot/cold streaks, platoon splits
    // - Bullpen availability
    // Props narrative removed — scout report from game picks (via disk cache) already has context.
    // Line movement removed — no reliable API for opening vs closing lines.
    Promise.resolve(null),
    Promise.resolve({ movements: {}, source: 'DISABLED' })
  ]);

  // Log line movement results
  const lineMovements = lineMovementData?.movements || {};
  const lineMovementCount = Object.keys(lineMovements).length;
  if (lineMovementCount > 0) {
    console.log(`[MLB Props Context] Found ${lineMovementCount} prop line movements from ${lineMovementData.source}`);
  } else {
    console.log(`[MLB Props Context] No line movement data available (source: ${lineMovementData?.source || 'UNKNOWN'})`);
  }

  // Advanced stats placeholder (Gemini Grounding provides narrative context)
  const advancedStats = null;
  const richContext = null;

  // Extract narrative context
  const narrativeContext = comprehensiveNarrative?.raw || null;
  const narrativeSections = comprehensiveNarrative?.sections || {};
  if (narrativeContext) {
    console.log(`[MLB Props Context] Got COMPREHENSIVE narrative context (${narrativeContext.length} chars)`);
    const foundSections = Object.entries(narrativeSections)
      .filter(([_, v]) => v && v.length > 10)
      .map(([k, _]) => k);
    if (foundSections.length > 0) {
      console.log(`[MLB Props Context] Parsed sections: ${foundSections.join(', ')}`);
    }
  }

  // Filter prop candidates to only include players verified on either team
  const validatedCandidates = propCandidates.filter(c => {
    const playerData = playerIdMap[c.player.toLowerCase()];
    if (playerData) {
      c.team = playerData.team;
      return true;
    }
    return false;
  });

  if (validatedCandidates.length < propCandidates.length) {
    console.log(`[MLB Props Context] Validated ${validatedCandidates.length}/${propCandidates.length} players (filtered out players not on ${game.away_team} or ${game.home_team})`);
  }

  const formattedInjuries = formatPropsInjuries(injuries);

  // Filter out players who are Doubtful or Day-To-Day to avoid void bets
  // In MLB this also includes players on the IL (Injured List)
  const riskyStatuses = ['doubtful', 'day-to-day', 'day to day', 'questionable', '10-day il', '15-day il', '60-day il'];
  const injuredPlayerNames = formattedInjuries
    .filter(inj => riskyStatuses.some(status => (inj.status || '').toLowerCase().includes(status)))
    .map(inj => inj.player.toLowerCase())
    .filter(name => name.length > 2);

  const availableCandidates = validatedCandidates.filter(c => {
    const playerNameLower = c.player.toLowerCase();
    const isRisky = injuredPlayerNames.some(injName =>
      playerNameLower.includes(injName) || injName.includes(playerNameLower)
    );
    if (isRisky) {
      console.log(`[MLB Props Context] EXCLUDED ${c.player} - Doubtful/Day-To-Day/IL (risk of void bet)`);
    }
    return !isRisky;
  });

  if (availableCandidates.length < validatedCandidates.length) {
    const excluded = validatedCandidates.length - availableCandidates.length;
    console.log(`[MLB Props Context] Filtered out ${excluded} Doubtful/Day-To-Day/IL player(s) to avoid void bets`);
  }

  // Fetch player season stats, game logs, and splits (including byArena) in parallel
  const venueName = game.venue || null;
  console.log(`[MLB Props Context] Fetching BDL player season stats, game logs, and splits (venue: ${venueName})...`);
  const [playerSeasonStats, playerGameLogs, playerSplits] = await Promise.all([
    fetchPlayerSeasonStats(playerIdMap, season),
    fetchPlayerGameLogs(playerIdMap),
    fetchPlayerSplits(playerIdMap, season, venueName)
  ]);

  // Log stats coverage
  const playersWithStats = Object.keys(playerSeasonStats).length;
  const playersWithLogs = Object.keys(playerGameLogs).length;
  const playersWithSplits = Object.keys(playerSplits).length;
  const totalCandidates = availableCandidates.length;
  console.log(`[MLB Props Context] Player stats coverage: ${playersWithStats}/${totalCandidates} stats, ${playersWithLogs}/${totalCandidates} logs, ${playersWithSplits}/${totalCandidates} splits`);

  // Fetch Statcast process indicators for top 4 prop candidates (batters only)
  let statcastContext = '';
  try {
    const topBatters = availableCandidates
      .filter(c => {
        // Skip pitchers — focus on batters for Statcast
        const pid = playerIdMap[c.player.toLowerCase()]?.id;
        const stats = pid ? playerSeasonStats[pid] : null;
        // If they have ERA or IP, they're a pitcher
        return !(stats?.era || stats?.ip);
      })
      .slice(0, 4);

    if (topBatters.length > 0 && Object.keys(playerGameLogs).length > 0) {
      console.log(`[MLB Props Context] Fetching Statcast data for top ${topBatters.length} batters...`);
      const statcastPromises = topBatters.map(c => {
        const pid = playerIdMap[c.player.toLowerCase()]?.id;
        return getPlayerStatcastSummary(pid, c.player, playerGameLogs);
      });
      const statcastResults = (await Promise.all(statcastPromises)).filter(Boolean);
      if (statcastResults.length > 0) {
        statcastContext = formatStatcastContext(statcastResults);
        console.log(`[MLB Props Context] Statcast data: ${statcastResults.length} players with process indicators`);
      } else {
        console.log(`[MLB Props Context] No Statcast data available (plate appearances endpoint may not have data yet)`);
      }
    }
  } catch (e) {
    console.warn(`[MLB Props Context] Statcast aggregation failed (non-fatal):`, e.message);
  }

  // Schedule fatigue detection
  const fatigueInfo = await detectScheduleFatigue(teamIds, dateStr);

  const marketSnapshot = buildMarketSnapshot(game.bookmakers || [],
    homeTeam?.full_name || game.home_team,
    awayTeam?.full_name || game.away_team
  );

  // Build player stats text (now includes venue-specific + L/R splits)
  const playerStats = buildPlayerStatsText(
    game.home_team,
    game.away_team,
    advancedStats,
    availableCandidates,
    playerSeasonStats,
    playerIdMap,
    richContext,
    formattedInjuries,
    playerGameLogs,
    playerSplits
  );

  // Build token data with enhanced player info, game logs, and line movement
  const tokenData = buildPropsTokenSlices(
    playerStats,
    availableCandidates,
    formattedInjuries,
    marketSnapshot,
    advancedStats,
    playerSeasonStats,
    playerIdMap,
    playerGameLogs,
    lineMovements,
    game.home_team,
    game.away_team
  );

  // Inject Statcast process indicators into token data if available
  if (statcastContext) {
    tokenData.statcast_process_indicators = statcastContext;
  }

  // Build game summary
  const gameSummary = {
    gameId: `mlb-props-${game.id}`,
    sport: SPORT_KEY,
    league: 'MLB',
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
    topCandidates: availableCandidates.map(p => p.player).slice(0, 6),
    // Schedule info
    scheduleFatigue: {
      home: fatigueInfo.home,
      away: fatigueInfo.away
    },
    // Flag indicating player stats availability
    playerStatsAvailable: playersWithStats > 0
  };

  const advancedSource = advancedStats?._source || 'none';
  const richContextFound = richContext && Object.keys(richContext).length > 0;

  // Check data availability and flag any gaps
  const statsCoverage = totalCandidates > 0 ? playersWithStats / totalCandidates : 0;
  const logsCoverage = totalCandidates > 0 ? playersWithLogs / totalCandidates : 0;
  const dataGaps = [];

  if (statsCoverage < 0.7) {
    dataGaps.push(`LOW STATS COVERAGE: Only ${playersWithStats}/${totalCandidates} players have season stats`);
  }
  if (logsCoverage < 0.7) {
    dataGaps.push(`LOW GAME LOGS COVERAGE: Only ${playersWithLogs}/${totalCandidates} players have recent game logs`);
  }
  if (!narrativeContext) {
    dataGaps.push(`NO NARRATIVE CONTEXT: Gemini Grounding failed - missing pitcher confirmations, lineup orders, news`);
  }
  if (formattedInjuries.length === 0 && teamIds.length > 0) {
    dataGaps.push(`NO INJURIES RETURNED: BDL may have failed - injury context may be incomplete`);
  }

  if (dataGaps.length > 0) {
    console.warn(`[MLB Props Context] DATA GAPS DETECTED - Gary should proceed with caution:`);
    dataGaps.forEach(gap => console.warn(`   ${gap}`));
  }

  console.log(`[MLB Props Context] Built context:`);
  console.log(`   - ${availableCandidates.length} player candidates (verified on team, excludes Doubtful/Day-To-Day/IL)`);
  console.log(`   - ${playersWithStats} players with season stats (${(statsCoverage * 100).toFixed(0)}% coverage)`);
  console.log(`   - ${playersWithLogs} players with game logs (${(logsCoverage * 100).toFixed(0)}% coverage)`);
  console.log(`   - ${formattedInjuries.length} injuries`);
  console.log(`   - Advanced stats: ${advancedSource}`);
  console.log(`   - Rich context: ${richContextFound}`);
  console.log(`   - Narrative context: ${narrativeContext ? 'YES' : 'NO'}`);
  console.log(`   - Line movement data: ${lineMovementCount > 0 ? `${lineMovementCount} props tracked` : 'NOT AVAILABLE'}`);
  console.log(`   - Statcast data: ${statcastContext ? 'YES' : 'NOT AVAILABLE'}`);

  return {
    gameSummary,
    tokenData,
    playerProps,
    propCandidates: availableCandidates,
    playerStats,
    playerSeasonStats,
    playerGameLogs,
    narrativeContext,
    // STATCAST PROCESS INDICATORS
    statcastContext: statcastContext || null,
    // LINE MOVEMENT DATA
    lineMovementData: {
      movements: lineMovements,
      count: lineMovementCount,
      source: lineMovementData?.source || 'UNKNOWN',
      significantMoves: Object.values(lineMovements).filter(m => Math.abs(m.magnitude) >= 0.5)
    },
    // Structured narrative sections for easy access
    narrativeSections: {
      breakingNews: narrativeSections.breakingNews || null,
      motivation: narrativeSections.motivation || null,
      schedule: narrativeSections.schedule || null,
      playerContext: narrativeSections.playerContext || null,
      teamTrends: narrativeSections.teamTrends || null,
      bettingSignals: narrativeSections.bettingSignals || null,
      startingPitchers: narrativeSections.startingPitchers || null,
      weather: narrativeSections.weather || null,
      lineupOrders: narrativeSections.lineupOrders || null,
    },
    meta: {
      homeTeam: homeTeam?.full_name || game.home_team,
      awayTeam: awayTeam?.full_name || game.away_team,
      season,
      gameTime: game.commence_time,
      advancedStatsSource: advancedSource,
      groundingDataSources: advancedStats?.data_sources || [],
      keyFindings: richContext?.key_findings || advancedStats?.key_analytics_insights || [],
      playerStatsCoverage: `${playersWithStats}/${totalCandidates}`,
      playerLogsCoverage: `${playersWithLogs}/${totalCandidates}`,
      hasNarrativeContext: !!narrativeContext,
      hasLineMovementData: lineMovementCount > 0,
      hasStatcastData: !!statcastContext,
      narrativeSectionsFetched: Object.keys(narrativeSections).filter(k => narrativeSections[k]?.length > 10),
      // Data availability flags for Gary to see
      dataAvailability: {
        statsAvailable: playersWithStats > 0,
        logsAvailable: playersWithLogs > 0,
        injuriesAvailable: formattedInjuries.length > 0,
        narrativeAvailable: !!narrativeContext,
        lineMovementAvailable: lineMovementCount > 0,
        statcastAvailable: !!statcastContext,
        dataGaps: dataGaps.length > 0 ? dataGaps : null,
        dataQuality: dataGaps.length === 0 ? 'HIGH' : dataGaps.length <= 1 ? 'MEDIUM' : 'LOW'
      }
    }
  };
}

export default {
  buildMlbPropsAgenticContext
};
