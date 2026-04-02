/**
 * NFL Props Agentic Context Builder
 * Builds rich context for NFL player prop analysis via the orchestrator pipeline.
 *
 * Fetches ALL data UPFRONT so Gary has everything before iterations:
 * - Player season stats (passing, rushing, receiving)
 * - Recent game logs (L5) with trends, consistency, splits
 * - Advanced passing/rushing/receiving stats (BDL v2)
 * - Injuries (BDL practice reports)
 * - Comprehensive narrative context (Gemini Grounding)
 * - Prop line movement (opening vs current)
 * - Game environment (implied team totals, spread, O/U)
 */
import { ballDontLieService } from '../ballDontLieService.js';
import {
  formatGameTimeEST,
  buildMarketSnapshot,
  parseGameDate,
  safeApiCallArray,
  safeApiCallObject,
  fixBdlInjuryStatus,
  normalizeTeamName
} from './sharedUtils.js';
import { fetchComprehensivePropsNarrative, fetchPropLineMovement } from './scoutReport/scoutReportBuilder.js';

const SPORT_KEY = 'americanfootball_nfl';

// ── NFL prop type filtering ─────────────────────────────────────────────────

/** Props we CAN analyze (predictable with data) */
const VALID_NFL_PROP_TYPES = [
  'passing_yards', 'player_pass_yds', 'pass_yds',
  'rushing_yards', 'player_rush_yds', 'rush_yds',
  'receiving_yards', 'player_rec_yds', 'rec_yds',
  'receptions', 'player_receptions',
  'passing_touchdowns', 'player_pass_tds', 'pass_tds',
  'rushing_touchdowns', 'player_rush_tds', 'rush_tds',
  'anytime_touchdown', 'anytime_td', 'player_anytime_td',
  'completions', 'player_completions', 'pass_completions',
  'pass_attempts', 'player_pass_attempts', 'passing_attempts',
  'interceptions', 'player_interceptions',
  'longest_completion', 'longest_rush', 'longest_reception',
  'rushing_receiving_yards', 'rush_rec_yds',
  'passing_rushing_yards', 'pass_rush_yds',
  'yards', 'total_yards'
];

/** Props we CANNOT analyze (random/situational) */
const INVALID_NFL_PROP_TYPES = [
  'first_td', 'first_touchdown', '1st_td', 'first_scorer',
  'last_td', 'last_touchdown', 'last_scorer',
  '1q_', '2q_', '3q_', '4q_', // Quarter-specific
  'first_quarter', 'second_quarter', 'third_quarter', 'fourth_quarter',
  'first_half', 'second_half',
  '1h_', '2h_'
];

/**
 * Group props by player, filtering to valid NFL prop types only
 */
function groupNflPropsByPlayer(props) {
  const grouped = {};

  for (const prop of props) {
    const propType = (prop.prop_type || '').toLowerCase();

    if (INVALID_NFL_PROP_TYPES.some(invalid => propType.includes(invalid))) continue;

    const isValid = VALID_NFL_PROP_TYPES.some(valid => propType.includes(valid));
    if (!isValid && propType) {
      console.log(`[NFL Props] Skipping unknown prop type: ${propType}`);
      continue;
    }

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
 * Get top prop candidates based on line count and odds quality.
 * Returns top N players PER TEAM.
 */
function getTopNflPropCandidates(props, maxPlayersPerTeam = 7, homeTeamName = null, awayTeamName = null) {
  const grouped = groupNflPropsByPlayer(props);

  const normalizeTeam = (name) => (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const homeNorm = normalizeTeam(homeTeamName);
  const awayNorm = normalizeTeam(awayTeamName);

  const scored = grouped.map(player => {
    const avgOdds = player.props.reduce((sum, p) => sum + (p.over_odds || p.under_odds || 0), 0) / player.props.length;
    const uniquePropTypes = new Set(player.props.map(p => p.type)).size;
    return {
      ...player,
      score: player.props.length * 10 + (avgOdds > -110 ? 20 : 0) + (uniquePropTypes * 5)
    };
  });

  let filtered = scored;
  if (homeNorm && awayNorm) {
    filtered = scored.filter(player => {
      const teamNorm = normalizeTeam(player.team);
      return teamNorm.includes(homeNorm) || homeNorm.includes(teamNorm) ||
             teamNorm.includes(awayNorm) || awayNorm.includes(teamNorm);
    });
    const dropped = scored.length - filtered.length;
    if (dropped > 0) console.log(`[NFL Props] Filtered out ${dropped} players not on ${homeTeamName} or ${awayTeamName}`);
  }

  // Group by team and take top N per team
  const byTeam = {};
  for (const player of filtered) {
    const teamKey = (player.team || 'unknown').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!byTeam[teamKey]) byTeam[teamKey] = { name: player.team, players: [] };
    byTeam[teamKey].players.push(player);
  }

  const result = [];
  for (const teamKey of Object.keys(byTeam)) {
    const teamData = byTeam[teamKey];
    const teamPlayers = teamData.players.sort((a, b) => b.score - a.score).slice(0, maxPlayersPerTeam);
    result.push(...teamPlayers);
    console.log(`[NFL Props] Team "${teamData.name}": ${teamPlayers.length} players selected`);
  }

  console.log(`[NFL Props] Total: ${result.length} candidates`);
  return result.sort((a, b) => b.score - a.score);
}

// ── NFL hit rate calculation ────────────────────────────────────────────────

/**
 * Calculate hit rate for an NFL player prop against recent game logs.
 * Tells Gary "hit O 245.5 pass yards in 7/10 games."
 */
function calculateNflHitRate(games, propType, line) {
  if (!games || games.length === 0 || line == null) return null;

  const propToField = {
    'passing_yards': 'pass_yds', 'player_pass_yds': 'pass_yds', 'pass_yds': 'pass_yds',
    'rushing_yards': 'rush_yds', 'player_rush_yds': 'rush_yds', 'rush_yds': 'rush_yds',
    'receiving_yards': 'rec_yds', 'player_rec_yds': 'rec_yds', 'rec_yds': 'rec_yds',
    'receptions': 'receptions', 'player_receptions': 'receptions',
    'passing_touchdowns': 'pass_tds', 'player_pass_tds': 'pass_tds', 'pass_tds': 'pass_tds',
    'rushing_touchdowns': 'rush_tds', 'player_rush_tds': 'rush_tds', 'rush_tds': 'rush_tds',
    'completions': 'pass_comp', 'player_completions': 'pass_comp',
    'interceptions': 'ints', 'player_interceptions': 'ints',
    'pass_attempts': 'pass_att', 'player_pass_attempts': 'pass_att'
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
    avgValue: avgValue.toFixed(1),
    values: values.slice(0, 5),
    line
  };
}

// ── NFL game total / game script context ────────────────────────────────────

/**
 * Get NFL game total context for prop implications.
 * Calculates implied team points from spread + O/U.
 * NFL totals typically range from 36 to 55+.
 */
function getNflGameTotalContext(marketSnapshot, homeTeam = '', awayTeam = '') {
  const total = parseFloat(marketSnapshot?.total?.line) || null;
  const spread = parseFloat(marketSnapshot?.spread?.home?.point) ||
                 parseFloat(marketSnapshot?.spread?.line) || null;

  if (!total) {
    return { available: false, reason: 'Total not available', total: null, spread: null };
  }

  let homeImplied = total / 2;
  let awayImplied = total / 2;

  if (spread !== null) {
    homeImplied = (total - spread) / 2;
    awayImplied = (total + spread) / 2;
  }

  let favorite = null, underdog = null;
  if (spread !== null) {
    if (spread < 0) { favorite = homeTeam || 'Home'; underdog = awayTeam || 'Away'; }
    else if (spread > 0) { favorite = awayTeam || 'Away'; underdog = homeTeam || 'Home'; }
  }

  // Game script categories for NFL props
  let gameScript = 'BALANCED';
  if (spread !== null) {
    const absSpread = Math.abs(spread);
    if (absSpread >= 10) gameScript = 'BLOWOUT_LIKELY';
    else if (absSpread >= 6.5) gameScript = 'MODERATE_FAVORITE';
    else if (absSpread <= 3) gameScript = 'TOSS_UP';
  }

  return {
    available: true,
    total,
    spread: spread || null,
    favorite,
    underdog,
    gameScript,
    impliedPoints: {
      home: { team: homeTeam || 'Home', points: parseFloat(homeImplied.toFixed(1)) },
      away: { team: awayTeam || 'Away', points: parseFloat(awayImplied.toFixed(1)) }
    },
    sharpContext: total >= 50
      ? 'Game total is high (50+) — pace/shootout potential.'
      : total <= 40
        ? 'Game total is low (40 or less) — defensive/grind game.'
        : 'Game total is average.'
  };
}

// ── NFL volume metrics ──────────────────────────────────────────────────────

/**
 * Calculate NFL volume metrics from game logs.
 * Focus on targets, carries, snap proxy (touches), and position role.
 */
function calculateNflVolumeMetrics(gameLogs) {
  if (!gameLogs || !gameLogs.games || gameLogs.games.length === 0) {
    return { hasData: false };
  }

  const games = gameLogs.games;
  const gp = games.length;

  // Determine primary role from stats
  const totalPassAtt = games.reduce((s, g) => s + (g.pass_att || 0), 0);
  const totalRushAtt = games.reduce((s, g) => s + (g.rush_att || 0), 0);
  const totalTargets = games.reduce((s, g) => s + (g.targets || 0), 0);
  const totalReceptions = games.reduce((s, g) => s + (g.receptions || 0), 0);

  let role = 'UNKNOWN';
  if (totalPassAtt > totalRushAtt * 3) role = 'QB';
  else if (totalRushAtt > totalTargets * 2) role = 'RB';
  else if (totalTargets > totalRushAtt) role = 'WR/TE';
  else if (totalRushAtt > 0 && totalTargets > 0) role = 'RB'; // Dual threat

  const avgTargets = gp > 0 ? (totalTargets / gp).toFixed(1) : null;
  const avgCarries = gp > 0 ? (totalRushAtt / gp).toFixed(1) : null;
  const avgPassAtt = gp > 0 ? (totalPassAtt / gp).toFixed(1) : null;
  const avgReceptions = gp > 0 ? (totalReceptions / gp).toFixed(1) : null;

  // Touch share proxy (targets + carries) — higher = more involved
  const totalTouches = totalTargets + totalRushAtt + totalReceptions;
  const avgTouches = gp > 0 ? (totalTouches / gp).toFixed(1) : null;

  return {
    hasData: true,
    role,
    avgTargets: avgTargets ? parseFloat(avgTargets) : null,
    avgCarries: avgCarries ? parseFloat(avgCarries) : null,
    avgPassAtt: avgPassAtt ? parseFloat(avgPassAtt) : null,
    avgReceptions: avgReceptions ? parseFloat(avgReceptions) : null,
    avgTouches: avgTouches ? parseFloat(avgTouches) : null,
    targetTrend: gameLogs.targetTrend || null,
    usageTrend: gameLogs.usageTrend || null
  };
}

// ── Player ID resolution ────────────────────────────────────────────────────

/**
 * Resolve player IDs from prop data (embedded by odds API).
 * Falls back to team roster search if needed.
 * Returns: { playerNameLower: { id, team } }
 */
async function resolveNflPlayerIds(propCandidates, teamIds, season, homeTeamName, awayTeamName) {
  const playerIdMap = {};

  if (propCandidates.length === 0) return playerIdMap;

  const homeNorm = normalizeTeamName(homeTeamName);
  const awayNorm = normalizeTeamName(awayTeamName);

  let playersWithIds = 0;
  let playersValidated = 0;

  for (const candidate of propCandidates) {
    const playerName = candidate.player;
    const playerId = candidate.playerId;
    const playerTeam = candidate.team || '';
    const playerTeamNorm = normalizeTeamName(playerTeam);

    if (!playerId) continue;
    playersWithIds++;

    const isOnValidTeam =
      playerTeamNorm.includes(homeNorm) || homeNorm.includes(playerTeamNorm) ||
      playerTeamNorm.includes(awayNorm) || awayNorm.includes(playerTeamNorm);

    if (isOnValidTeam) {
      playerIdMap[playerName.toLowerCase()] = { id: playerId, team: playerTeam };
      playersValidated++;
    }
  }

  console.log(`[NFL Props Context] Validated ${playersValidated}/${propCandidates.length} players against ${homeTeamName} + ${awayTeamName}`);

  // If we got 0 validated but had IDs, try fallback to roster search
  if (playersValidated === 0 && playersWithIds > 0) {
    console.log(`[NFL Props Context] ⚠️ Team matching failed — accepting all players with IDs as fallback`);
    for (const candidate of propCandidates) {
      if (candidate.playerId) {
        playerIdMap[candidate.player.toLowerCase()] = { id: candidate.playerId, team: candidate.team };
      }
    }
  }

  return playerIdMap;
}

// ── Season stats batch fetching ─────────────────────────────────────────────

/**
 * Fetch season stats for all prop candidates via team-level endpoint.
 * More efficient than per-player calls (2 calls instead of 14+).
 * Returns: { playerId: statsObject }
 */
async function fetchNflSeasonStatsBatch(playerIdMap, teamIds, season) {
  if (teamIds.length === 0) {
    console.warn('[NFL Props Context] No team IDs for season stats');
    return {};
  }

  try {
    // Fetch all players on both teams in parallel
    const teamStatsArrays = await Promise.all(
      teamIds.map(teamId =>
        safeApiCallArray(
          () => ballDontLieService.getNflSeasonStatsByTeam(teamId, season),
          `NFL Props: Season stats for team ${teamId}`
        )
      )
    );

    // Flatten and index by player ID
    const statsMap = {};
    const knownPlayerIds = new Set(Object.values(playerIdMap).map(p => p?.id || p));

    for (const teamStats of teamStatsArrays) {
      for (const stat of teamStats) {
        const pid = stat.player?.id || stat.player_id;
        if (pid && knownPlayerIds.has(pid)) {
          statsMap[pid] = stat;
        }
      }
    }

    console.log(`[NFL Props Context] ✓ Got season stats for ${Object.keys(statsMap).length} prop candidates`);
    return statsMap;
  } catch (e) {
    console.warn('[NFL Props Context] Failed to fetch season stats:', e.message);
    return {};
  }
}

/**
 * Fetch game logs for all prop candidates (last 5 games).
 */
async function fetchNflPlayerGameLogs(playerIdMap, season) {
  const playerIds = Object.values(playerIdMap).map(p => p?.id || p).filter(id => id);
  if (playerIds.length === 0) {
    console.warn('[NFL Props Context] No player IDs for game logs');
    return {};
  }

  console.log(`[NFL Props Context] Fetching game logs for ${playerIds.length} players...`);
  try {
    const logsMap = await ballDontLieService.getNflPlayerGameLogsBatch(playerIds, season, 5);
    console.log(`[NFL Props Context] ✓ Got game logs for ${Object.keys(logsMap).length} players`);
    return logsMap;
  } catch (e) {
    console.warn('[NFL Props Context] Failed to fetch game logs:', e.message);
    return {};
  }
}

// ── Injury formatting ───────────────────────────────────────────────────────

function formatNflPropsInjuries(injuries = []) {
  return (injuries || [])
    .filter(inj => inj?.player?.full_name || inj?.player?.first_name)
    .slice(0, 20) // NFL rosters are bigger
    .map((injury) => {
      const fixedInj = fixBdlInjuryStatus(injury);
      return {
        player: fixedInj?.player?.full_name || `${fixedInj?.player?.first_name || ''} ${fixedInj?.player?.last_name || ''}`.trim(),
        position: fixedInj?.player?.position || fixedInj?.player?.position_abbreviation || 'Unknown',
        status: fixedInj?.status || 'Unknown',
        description: fixedInj?.description || '',
        team: fixedInj?.team?.full_name || '',
        duration: fixedInj?.duration || 'UNKNOWN',
        isEdge: fixedInj?.isEdge || false
      };
    });
}

// ── Player stats text building ──────────────────────────────────────────────

/**
 * Build comprehensive player stats text for Gary.
 * Position-aware formatting (QB / RB / WR-TE).
 */
function buildNflPlayerStatsText(homeTeam, awayTeam, propCandidates, playerSeasonStats, playerIdMap, injuries, playerGameLogs) {
  let statsText = '';

  const getStats = (name) => {
    const p = playerIdMap[name.toLowerCase()];
    return p ? playerSeasonStats[p.id || p] : null;
  };

  const getLogs = (name) => {
    const p = playerIdMap[name.toLowerCase()];
    return p ? playerGameLogs[p.id || p] : null;
  };

  const formatRecentGames = (logs, statKey) => {
    if (!logs?.games || logs.games.length === 0) return '';
    return logs.games.slice(0, 5).map(g => g[statKey] ?? '-').join(', ');
  };

  // Determine position from stats
  const getPosition = (stats, logs) => {
    if (stats?.passing_yards > 500) return 'QB';
    if (stats?.rushing_attempts > stats?.receiving_targets * 2) return 'RB';
    if (stats?.receiving_targets > 0) return 'WR/TE';
    // Fallback to game logs
    if (logs?.averages) {
      if (parseFloat(logs.averages.pass_att) > 10) return 'QB';
      if (parseFloat(logs.averages.rush_att) > parseFloat(logs.averages.receptions) * 2) return 'RB';
      if (parseFloat(logs.averages.receptions) > 0 || parseFloat(logs.averages.rec_yds) > 0) return 'WR/TE';
    }
    return 'SKILL';
  };

  // Separate candidates by team
  const awayPlayers = propCandidates.filter(p => {
    const teamNorm = normalizeTeamName(p.team);
    const awayNorm = normalizeTeamName(awayTeam);
    return teamNorm.includes(awayNorm) || awayNorm.includes(teamNorm);
  });
  const homePlayers = propCandidates.filter(p => {
    const teamNorm = normalizeTeamName(p.team);
    const homeNorm = normalizeTeamName(homeTeam);
    return teamNorm.includes(homeNorm) || homeNorm.includes(teamNorm);
  });

  const buildPlayerSection = (players, teamName) => {
    let section = `### ${teamName} Players\n`;

    if (players.length === 0) {
      section += '(No prop candidates)\n';
      return section;
    }

    section += '\n**Player Season Stats & Recent Form:**\n';

    for (const candidate of players) {
      const stats = getStats(candidate.player);
      const logs = getLogs(candidate.player);
      const position = getPosition(stats, logs);
      const propsStr = candidate.props.map(p => `${p.type} ${p.line}`).join(', ');

      const injuryRecord = injuries.find(i => i.player.toLowerCase() === candidate.player.toLowerCase());
      const durationTag = injuryRecord?.duration ? ` [${injuryRecord.duration}]` : '';
      const injuryFlag = injuryRecord ? ` ⚠️ INJURED${durationTag}` : '';

      section += `- **${candidate.player}** (${position})${injuryFlag}:\n`;

      if (stats) {
        // Position-specific season stat formatting
        if (position === 'QB') {
          section += `  Season: ${stats.games_played || 0} GP, ${stats.passing_yards || 0} pass yds, ${stats.passing_touchdowns || 0} pass TD, ${stats.passing_completions || 0}/${stats.passing_attempts || 0} (${stats.passing_attempts > 0 ? ((stats.passing_completions / stats.passing_attempts) * 100).toFixed(1) : 'N/A'}%), ${stats.passing_interceptions || 0} INT\n`;
          if (stats.rushing_yards > 50) {
            section += `  Rushing: ${stats.rushing_yards || 0} yds, ${stats.rushing_touchdowns || 0} TD, ${stats.rushing_attempts || 0} att\n`;
          }
        } else if (position === 'RB') {
          section += `  Season: ${stats.games_played || 0} GP, ${stats.rushing_yards || 0} rush yds, ${stats.rushing_touchdowns || 0} rush TD, ${stats.rushing_attempts || 0} att`;
          if (stats.receptions > 0) {
            section += `, ${stats.receptions || 0} rec, ${stats.receiving_yards || 0} rec yds`;
          }
          section += '\n';
        } else {
          section += `  Season: ${stats.games_played || 0} GP, ${stats.receptions || 0} rec, ${stats.receiving_yards || 0} rec yds, ${stats.receiving_touchdowns || 0} rec TD, ${stats.receiving_targets || 0} tgt\n`;
          if (stats.rushing_yards > 0) {
            section += `  Rushing: ${stats.rushing_yards || 0} yds, ${stats.rushing_touchdowns || 0} TD\n`;
          }
        }
      }

      // Recent form from game logs
      if (logs) {
        const avg = logs.averages;
        if (position === 'QB') {
          section += `  L${logs.gamesAnalyzed} Avg: ${avg.pass_yds} pass yds, ${avg.pass_tds} TD, ${avg.pass_comp}/${avg.pass_att} comp/att, ${avg.ints} INT\n`;
          section += `  Recent pass yds: [${formatRecentGames(logs, 'pass_yds')}]\n`;
          section += `  Recent pass TDs: [${formatRecentGames(logs, 'pass_tds')}]\n`;
        } else if (position === 'RB') {
          section += `  L${logs.gamesAnalyzed} Avg: ${avg.rush_yds} rush yds, ${avg.rush_att} att, ${avg.rec_yds} rec yds, ${avg.receptions} rec\n`;
          section += `  Recent rush yds: [${formatRecentGames(logs, 'rush_yds')}]\n`;
          if (parseFloat(avg.receptions) > 0) {
            section += `  Recent rec yds: [${formatRecentGames(logs, 'rec_yds')}]\n`;
          }
        } else {
          section += `  L${logs.gamesAnalyzed} Avg: ${avg.rec_yds} rec yds, ${avg.receptions} rec, ${avg.rush_yds > '0.0' ? avg.rush_yds + ' rush yds, ' : ''}targets ${logs.targetTrend?.l5Avg || 'N/A'}/g\n`;
          section += `  Recent rec yds: [${formatRecentGames(logs, 'rec_yds')}]\n`;
          section += `  Recent receptions: [${formatRecentGames(logs, 'receptions')}]\n`;
        }

        // Consistency
        if (logs.consistency) {
          const parts = [];
          if (position === 'QB') {
            const c = parseFloat(logs.consistency.pass_yds);
            if (!isNaN(c)) parts.push(`pass yds ${(c * 100).toFixed(0)}%`);
          }
          if (position === 'RB' || position === 'QB') {
            const c = parseFloat(logs.consistency.rush_yds);
            if (!isNaN(c)) parts.push(`rush yds ${(c * 100).toFixed(0)}%`);
          }
          if (position !== 'QB') {
            const cr = parseFloat(logs.consistency.rec_yds);
            if (!isNaN(cr)) parts.push(`rec yds ${(cr * 100).toFixed(0)}%`);
            const cc = parseFloat(logs.consistency.receptions);
            if (!isNaN(cc)) parts.push(`rec ${(cc * 100).toFixed(0)}%`);
          }
          if (parts.length > 0) section += `  Consistency: ${parts.join(' | ')}\n`;
        }

        // Home/Away splits
        if (logs.splits?.home && logs.splits?.away) {
          if (position === 'QB') {
            section += `  Home: ${logs.splits.home.pass_yds} pass yds (${logs.splits.home.games}g) | Away: ${logs.splits.away.pass_yds} pass yds (${logs.splits.away.games}g)\n`;
          } else if (position === 'RB') {
            section += `  Home: ${logs.splits.home.rush_yds} rush yds (${logs.splits.home.games}g) | Away: ${logs.splits.away.rush_yds} rush yds (${logs.splits.away.games}g)\n`;
          } else {
            section += `  Home: ${logs.splits.home.rec_yds} rec yds (${logs.splits.home.games}g) | Away: ${logs.splits.away.rec_yds} rec yds (${logs.splits.away.games}g)\n`;
          }
        }

        // Target / usage trends (important for WR/TE/RB)
        if (logs.targetTrend && position !== 'QB') {
          const tt = logs.targetTrend;
          section += `  Targets: L5 avg ${tt.l5Avg}, L2 avg ${tt.l2Avg} (${tt.trend}) [${tt.gameByGame?.join(', ') || ''}]\n`;
        }
        if (logs.usageTrend) {
          const ut = logs.usageTrend;
          section += `  Usage: ${ut.level} (L5 ${ut.l5Avg} touches/g, ${ut.trend})\n`;
        }
      }

      section += `  Props: ${propsStr}\n`;
    }

    return section;
  };

  statsText += buildPlayerSection(awayPlayers, awayTeam);
  statsText += '\n';
  statsText += buildPlayerSection(homePlayers, homeTeam);

  return statsText;
}

// ── Token slice building ────────────────────────────────────────────────────

/**
 * Build token data slices for the orchestrator pipeline.
 * Enhances candidates with stats, volume metrics, hit rates, and line movement.
 */
function buildNflPropsTokenSlices(playerStats, propCandidates, injuries, marketSnapshot, playerSeasonStats, playerIdMap, playerGameLogs, lineMovements, homeTeamName, awayTeamName) {
  const enhancedCandidates = propCandidates.map(p => {
    const playerData = playerIdMap[p.player.toLowerCase()];
    const playerId = playerData?.id || playerData;
    const stats = playerId ? playerSeasonStats[playerId] : null;
    const logs = playerId ? playerGameLogs[playerId] : null;
    const games = logs?.games || [];

    // Calculate volume metrics
    const volume = calculateNflVolumeMetrics(logs);

    // Calculate hit rates for each prop
    const hitRates = {};
    for (const prop of p.props) {
      const hr = calculateNflHitRate(games, prop.type, prop.line);
      if (hr) hitRates[prop.type] = hr;
    }

    // Get line movement for this player's props
    const playerMovements = {};
    for (const prop of p.props) {
      const key = `${p.player.toLowerCase()}_${(prop.type || '').toLowerCase()}`;
      if (lineMovements[key]) playerMovements[prop.type] = lineMovements[key];
    }

    return {
      ...p,
      seasonStats: stats,
      recentForm: {
        targetTrend: logs?.targetTrend || null,
        usageTrend: logs?.usageTrend || null,
        formTrend: volume.hasData ? volume : null
      },
      volume,
      hitRates,
      lineMovements: Object.keys(playerMovements).length > 0 ? playerMovements : null
    };
  });

  // Game environment context
  const gameEnvironment = getNflGameTotalContext(marketSnapshot, homeTeamName, awayTeamName);

  return {
    propCandidates: enhancedCandidates,
    injuries,
    marketSnapshot,
    gameEnvironment,
    playerStats
  };
}

// ── Main export ─────────────────────────────────────────────────────────────

/**
 * Build comprehensive NFL props context for the orchestrator pipeline.
 * Fetches all data upfront so Gary has everything before iteration.
 *
 * @param {Object} game - Game object from odds API
 * @param {Array} playerProps - Available prop lines from propOddsService
 * @param {Object} options - { nocache, regularOnly }
 * @returns {Object} - Context object for orchestrator
 */
export async function buildNflPropsAgenticContext(game, playerProps, options = {}) {
  const commenceDate = parseGameDate(game.commence_time) || new Date();
  const month = commenceDate.getMonth() + 1;
  const year = commenceDate.getFullYear();
  // NFL season starts in August/September: Aug(8)-Dec = currentYear, Jan-Jul = previousYear
  const season = month >= 8 ? year : year - 1;
  const dateStr = commenceDate.toISOString().slice(0, 10);

  console.log(`[NFL Props Context] Building context for ${game.away_team} @ ${game.home_team} (Season ${season})`);

  // Resolve teams
  let homeTeam = null, awayTeam = null;
  try {
    [homeTeam, awayTeam] = await Promise.all([
      safeApiCallObject(
        () => ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.home_team),
        `NFL Props: Resolve home team "${game.home_team}"`
      ),
      safeApiCallObject(
        () => ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.away_team),
        `NFL Props: Resolve away team "${game.away_team}"`
      )
    ]);
  } catch (e) {
    console.warn('[NFL Props Context] Failed to resolve teams:', e.message);
  }

  const teamIds = [];
  if (homeTeam?.id) teamIds.push(homeTeam.id);
  if (awayTeam?.id) teamIds.push(awayTeam.id);

  // Process prop candidates (7 per team = 14 total)
  const propCandidates = getTopNflPropCandidates(playerProps, 7, game.home_team, game.away_team);

  // Filter regular-only props (yards/receptions, exclude TDs) if requested
  let filteredProps = playerProps;
  if (options.regularOnly) {
    const tdTypes = ['anytime_td', 'anytime_touchdown', 'passing_touchdowns', 'rushing_touchdowns', 'receiving_touchdowns', 'player_pass_tds', 'player_rush_tds'];
    filteredProps = playerProps.filter(p => !tdTypes.some(t => (p.prop_type || '').toLowerCase().includes(t)));
    console.log(`[NFL Props Context] Regular-only mode: ${filteredProps.length}/${playerProps.length} props (TDs excluded)`);
  }

  // Parallel fetch: injuries, player IDs, narrative, line movement
  console.log('[NFL Props Context] Fetching injuries, player IDs, narrative, and line movement...');
  const [injuries, playerIdMap, comprehensiveNarrative, lineMovementData] = await Promise.all([
    // Injuries from BDL
    teamIds.length > 0
      ? safeApiCallArray(
          () => ballDontLieService.getInjuriesGeneric(SPORT_KEY, { team_ids: teamIds }, options.nocache ? 0 : 5),
          `NFL Props: Fetch injuries for teams ${teamIds.join(', ')}`
        )
      : Promise.resolve([]),

    // Resolve player IDs
    resolveNflPlayerIds(propCandidates, teamIds, season, game.home_team, game.away_team),

    // Props narrative removed — scout report from game picks (via disk cache) already has context.
    // Line movement removed — no reliable API for opening vs closing lines.
    Promise.resolve(null),
    Promise.resolve({ movements: {}, source: 'DISABLED' })
  ]);

  const lineMovements = lineMovementData?.movements || {};
  const lineMovementCount = Object.keys(lineMovements).length;
  if (lineMovementCount > 0) {
    console.log(`[NFL Props Context] ✓ Found ${lineMovementCount} prop line movements from ${lineMovementData.source}`);
  }

  const narrativeContext = comprehensiveNarrative?.raw || null;
  const narrativeSections = comprehensiveNarrative?.sections || {};
  if (narrativeContext) {
    console.log(`[NFL Props Context] ✓ Got comprehensive narrative (${narrativeContext.length} chars)`);
  }

  // Validate candidates against teams
  const validatedCandidates = propCandidates.filter(c => {
    const playerData = playerIdMap[c.player.toLowerCase()];
    if (playerData) {
      c.team = playerData.team;
      return true;
    }
    return false;
  });

  if (validatedCandidates.length < propCandidates.length) {
    console.log(`[NFL Props Context] Validated ${validatedCandidates.length}/${propCandidates.length} players`);
  }

  const formattedInjuries = formatNflPropsInjuries(injuries);

  // Exclude Doubtful/Day-To-Day players (risk of void bets)
  const riskyStatuses = ['doubtful', 'day-to-day', 'day to day', 'out'];
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
      console.log(`[NFL Props Context] ⚠️ EXCLUDED ${c.player} - Doubtful/Out (risk of void bet)`);
    }
    return !isRisky;
  });

  if (availableCandidates.length < validatedCandidates.length) {
    const excluded = validatedCandidates.length - availableCandidates.length;
    console.log(`[NFL Props Context] Filtered out ${excluded} unavailable player(s)`);
  }

  // Fetch player season stats and game logs in parallel
  console.log('[NFL Props Context] Fetching player season stats and game logs...');
  const [playerSeasonStats, playerGameLogs] = await Promise.all([
    fetchNflSeasonStatsBatch(playerIdMap, teamIds, season),
    fetchNflPlayerGameLogs(playerIdMap, season)
  ]);

  const playersWithStats = Object.keys(playerSeasonStats).length;
  const playersWithLogs = Object.keys(playerGameLogs).length;
  const totalCandidates = availableCandidates.length;
  console.log(`[NFL Props Context] Stats coverage: ${playersWithStats}/${totalCandidates} | Logs coverage: ${playersWithLogs}/${totalCandidates}`);

  const marketSnapshot = buildMarketSnapshot(game.bookmakers || [],
    homeTeam?.full_name || game.home_team,
    awayTeam?.full_name || game.away_team
  );

  // Build player stats text
  const playerStats = buildNflPlayerStatsText(
    game.home_team,
    game.away_team,
    availableCandidates,
    playerSeasonStats,
    playerIdMap,
    formattedInjuries,
    playerGameLogs
  );

  // Build token data
  const tokenData = buildNflPropsTokenSlices(
    playerStats,
    availableCandidates,
    formattedInjuries,
    marketSnapshot,
    playerSeasonStats,
    playerIdMap,
    playerGameLogs,
    lineMovements,
    game.home_team,
    game.away_team
  );

  // Build game summary
  const gameSummary = {
    gameId: `nfl-props-${game.id}`,
    sport: SPORT_KEY,
    league: 'NFL',
    matchup: `${game.away_team} @ ${game.home_team}`,
    homeTeam: homeTeam?.full_name || game.home_team,
    awayTeam: awayTeam?.full_name || game.away_team,
    tipoff: formatGameTimeEST(game.commence_time),
    odds: {
      spread: marketSnapshot.spread,
      total: marketSnapshot.total,
      moneyline: marketSnapshot.moneyline
    },
    gameEnvironment: getNflGameTotalContext(marketSnapshot, game.home_team, game.away_team),
    propCount: playerProps.length,
    topCandidates: availableCandidates.map(p => p.player).slice(0, 6),
    playerStatsAvailable: playersWithStats > 0
  };

  // Data quality assessment
  const statsCoverage = totalCandidates > 0 ? playersWithStats / totalCandidates : 0;
  const logsCoverage = totalCandidates > 0 ? playersWithLogs / totalCandidates : 0;
  const dataGaps = [];

  if (statsCoverage < 0.7) dataGaps.push(`⚠️ LOW STATS COVERAGE: Only ${playersWithStats}/${totalCandidates} players have season stats`);
  if (logsCoverage < 0.7) dataGaps.push(`⚠️ LOW GAME LOGS COVERAGE: Only ${playersWithLogs}/${totalCandidates} players have recent game logs`);
  if (!narrativeContext) dataGaps.push(`⚠️ NO NARRATIVE CONTEXT: Missing news, injury updates, trends`);
  if (formattedInjuries.length === 0 && teamIds.length > 0) dataGaps.push(`⚠️ NO INJURIES RETURNED: BDL may have failed`);

  if (dataGaps.length > 0) {
    console.warn(`[NFL Props Context] ⚠️ DATA GAPS:`);
    dataGaps.forEach(gap => console.warn(`   ${gap}`));
  }

  console.log(`[NFL Props Context] ✓ Built context:`);
  console.log(`   - ${availableCandidates.length} player candidates`);
  console.log(`   - ${playersWithStats} with season stats (${(statsCoverage * 100).toFixed(0)}%)`);
  console.log(`   - ${playersWithLogs} with game logs (${(logsCoverage * 100).toFixed(0)}%)`);
  console.log(`   - ${formattedInjuries.length} injuries`);
  console.log(`   - Narrative: ${narrativeContext ? 'YES' : 'NO'}`);
  console.log(`   - Line movement: ${lineMovementCount > 0 ? `${lineMovementCount} props tracked` : 'N/A'}`);

  return {
    gameSummary,
    tokenData,
    playerProps: filteredProps,
    propCandidates: availableCandidates,
    playerStats,
    playerSeasonStats,
    playerGameLogs,
    narrativeContext,
    lineMovementData: {
      movements: lineMovements,
      count: lineMovementCount,
      source: lineMovementData?.source || 'UNKNOWN',
      significantMoves: Object.values(lineMovements).filter(m => Math.abs(m.magnitude) >= 1.5)
    },
    narrativeSections: {
      breakingNews: narrativeSections.breakingNews || null,
      motivation: narrativeSections.motivation || null,
      schedule: narrativeSections.schedule || null,
      playerContext: narrativeSections.playerContext || null,
      teamTrends: narrativeSections.teamTrends || null,
      bettingSignals: narrativeSections.bettingSignals || null,
    },
    meta: {
      homeTeam: homeTeam?.full_name || game.home_team,
      awayTeam: awayTeam?.full_name || game.away_team,
      season,
      gameTime: game.commence_time,
      playerStatsCoverage: `${playersWithStats}/${totalCandidates}`,
      playerLogsCoverage: `${playersWithLogs}/${totalCandidates}`,
      hasNarrativeContext: !!narrativeContext,
      hasLineMovementData: lineMovementCount > 0,
      dataAvailability: {
        statsAvailable: playersWithStats > 0,
        logsAvailable: playersWithLogs > 0,
        injuriesAvailable: formattedInjuries.length > 0,
        narrativeAvailable: !!narrativeContext,
        lineMovementAvailable: lineMovementCount > 0,
        dataGaps: dataGaps.length > 0 ? dataGaps : null,
        dataQuality: dataGaps.length === 0 ? 'HIGH' : dataGaps.length <= 1 ? 'MEDIUM' : 'LOW'
      }
    }
  };
}

export default {
  buildNflPropsAgenticContext
};
