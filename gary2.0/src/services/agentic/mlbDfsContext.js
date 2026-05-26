/**
 * MLB DFS Context Builder
 *
 * Builds the complete player pool and game context for MLB DFS lineup generation.
 * Mirrors the interface of dfsAgenticContext.js but handles MLB-specific data:
 * - Pitchers vs hitters as distinct player types
 * - Confirmed lineup order (posted 2-4 hours before first pitch)
 * - Probable pitchers
 * - Park factors and weather
 * - Platoon splits (L/R)
 *
 * Data sources:
 * - Tank01: DFS salaries (DK/FD)
 * - BDL: Player season stats, injuries, game odds, player splits
 * - MLB Stats API: Schedule, probable pitchers, confirmed lineups, rosters
 * - Baseball Savant: xStats (xBA, xSLG, xWOBA, xERA)
 */

import { ballDontLieService } from '../ballDontLieService.js';
import { fetchDfsSalaries } from '../tank01DfsService.js';
import { fetchDKDraftables } from '../draftKingsSlateService.js';
import { getSalaryCap, getRosterSlots } from './dfs/dfsSportConfig.js';

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function normalizeMlbPosition(position) {
  if (!position) return 'UTIL';
  const pos = position.toUpperCase().trim();
  if (pos === 'SP' || pos === 'RP' || pos === 'P' || pos === 'PITCHER') return 'P';
  if (['C', '1B', '2B', '3B', 'SS', 'DH'].includes(pos)) return pos;
  if (pos === 'OF' || pos === 'LF' || pos === 'CF' || pos === 'RF') return 'OF';
  if (pos === 'CATCHER') return 'C';
  return 'UTIL';
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build complete MLB DFS context for lineup generation.
 *
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @param {string} dateStr - Date YYYY-MM-DD
 * @param {Object} slate - Optional slate info { teams: [], games: [], name: '' }
 * @param {Object} options - { nocache, sharedContextCache }
 * @returns {Object} Complete player pool with salaries, stats, injuries, games
 */
export async function buildMLBDFSContext(platform, dateStr, slate = null, options = {}) {
  const start = Date.now();
  console.log(`\n[MLB DFS Context] Building ${platform} MLB context for ${dateStr} ${slate ? `(${slate.name})` : '(Main Slate)'}`);

  const salaryCap = getSalaryCap(platform, 'MLB');
  const rosterSlots = getRosterSlots(platform, 'MLB');

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: Fetch DFS salaries
  // Primary: DK Draftables API (uses draftGroupId from slate discovery)
  // Fallback: Tank01 /getMLBDFS
  // ═══════════════════════════════════════════════════════════════════════════
  let salaryPlayers = [];

  // Try DK Draftables first if we have a draftGroupId from the slate
  if (platform === 'draftkings' && slate?.draftGroupId) {
    console.log(`[MLB DFS Context] Fetching salaries from DK Draftables API (DraftGroup ${slate.draftGroupId})...`);
    try {
      const draftables = await fetchDKDraftables(slate.draftGroupId);
      if (draftables && draftables.length > 0) {
        salaryPlayers = draftables.map(d => ({
          ...d,
          position: normalizeMlbPosition(d.position),
          positions: (d.positions || [d.position]).map(normalizeMlbPosition),
        }));
        console.log(`[MLB DFS Context] ✅ Got ${salaryPlayers.length} players from DK Draftables`);
      }
    } catch (e) {
      console.warn(`[MLB DFS Context] ⚠️ DK Draftables failed: ${e.message}`);
    }
  }

  // Fallback to Tank01 if DK draftables didn't work
  if (salaryPlayers.length === 0) {
    console.log(`[MLB DFS Context] Trying Tank01 for ${platform} salaries...`);
    const salaryResult = await fetchDfsSalaries('MLB', dateStr, platform);
    if (salaryResult.players && salaryResult.players.length > 0) {
      salaryPlayers = salaryResult.players;
      console.log(`[MLB DFS Context] ✅ Got ${salaryPlayers.length} players from Tank01`);
    }
  }

  if (salaryPlayers.length === 0) {
    throw new Error(`No MLB DFS salary data available for ${dateStr}. Neither DK Draftables nor Tank01 returned data.`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: Fetch today's MLB games and odds
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`[MLB DFS Context] Fetching today's MLB games...`);
  let games = [];
  let odds = [];

  try {
    const [gamesData, oddsData] = await Promise.all([
      ballDontLieService.getGames('baseball_mlb', { dates: [dateStr] }),
      ballDontLieService.getMlbGameOdds ? ballDontLieService.getMlbGameOdds(dateStr) : Promise.resolve([])
    ]);

    games = Array.isArray(gamesData) ? gamesData : [];
    odds = Array.isArray(oddsData) ? oddsData : [];
    console.log(`[MLB DFS Context] ✅ Found ${games.length} MLB games, ${odds.length} odds entries`);
  } catch (e) {
    console.warn(`[MLB DFS Context] ⚠️ Game/odds fetch error: ${e.message}`);
  }

  // Filter to slate teams if provided
  const slateTeams = new Set((slate?.teams || []).map(t => t.toUpperCase()));
  if (slateTeams.size > 0) {
    salaryPlayers = salaryPlayers.filter(p => slateTeams.has((p.team || '').toUpperCase()));
    console.log(`[MLB DFS Context] Filtered to slate teams: ${salaryPlayers.length} players`);
  }

  // Build game list with odds
  const gameList = games.map(g => {
    const homeTeam = g.home_team?.abbreviation || g.home_team_name || '';
    const awayTeam = g.away_team?.abbreviation || g.away_team_name || '';

    // Find odds for this game
    const gameOdds = odds.find(o => o.game_id === g.id);
    const dkOdds = gameOdds ? (Array.isArray(gameOdds) ? gameOdds : [gameOdds]).find(o => o.vendor === 'draftkings') : null;
    const fdOdds = gameOdds ? (Array.isArray(gameOdds) ? gameOdds : [gameOdds]).find(o => o.vendor === 'fanduel') : null;
    const bestOdds = platform === 'fanduel' ? (fdOdds || dkOdds) : (dkOdds || fdOdds);

    return {
      id: g.id,
      homeTeam,
      awayTeam,
      venue: g.venue || null,
      date: g.date,
      status: g.status,
      overUnder: bestOdds ? parseFloat(bestOdds.total_value) : null,
      spread: bestOdds ? parseFloat(bestOdds.spread_home_value) : null,
      moneylineHome: bestOdds?.moneyline_home_odds || null,
      moneylineAway: bestOdds?.moneyline_away_odds || null,
    };
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: Fetch injuries
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`[MLB DFS Context] Fetching injuries...`);
  const injuryMap = {};

  try {
    const teamIds = [...new Set(salaryPlayers.map(p => p.teamId).filter(Boolean))];
    if (teamIds.length > 0) {
      const injuries = await ballDontLieService.getInjuriesGeneric('baseball_mlb', { team_ids: teamIds });
      if (Array.isArray(injuries)) {
        for (const inj of injuries) {
          const team = inj.player?.team?.abbreviation || '';
          if (!team) continue;
          if (!injuryMap[team]) injuryMap[team] = [];
          const playerName = inj.player?.full_name || `${inj.player?.first_name || ''} ${inj.player?.last_name || ''}`.trim();
          injuryMap[team].push({
            player: playerName,
            status: inj.status || 'Unknown',
            injury: inj.type || inj.detail || '',
            side: inj.side || '',
            returnDate: inj.return_date || null,
          });
        }
        console.log(`[MLB DFS Context] ✅ Injuries: ${Object.keys(injuryMap).length} teams with injuries`);
      }
    }
  } catch (e) {
    console.warn(`[MLB DFS Context] ⚠️ Injury fetch error: ${e.message}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 4: Fetch player season stats for enrichment
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`[MLB DFS Context] Fetching season stats...`);
  const seasonStatsMap = new Map();
  const season = new Date(dateStr).getFullYear();

  try {
    // Get unique team IDs from salary players
    const teamIds = [...new Set(salaryPlayers.map(p => p.teamId).filter(Boolean))];

    // Fetch season stats by team (BDL supports team_id filter)
    for (const teamId of teamIds) {
      try {
        const stats = await ballDontLieService.getMlbPlayerSeasonStats
          ? await ballDontLieService.getMlbPlayerSeasonStats(null, season, teamId)
          : [];

        if (Array.isArray(stats)) {
          for (const s of stats) {
            const pid = s.player?.id;
            if (pid) seasonStatsMap.set(pid, s);
          }
        }
      } catch (e) {
        // Individual team fetch failure — continue
      }
    }

    console.log(`[MLB DFS Context] ✅ Season stats for ${seasonStatsMap.size} players`);
  } catch (e) {
    console.warn(`[MLB DFS Context] ⚠️ Season stats fetch error: ${e.message}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 5: Build enriched player pool
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`[MLB DFS Context] Building enriched player pool...`);

  // Determine which players are OUT
  const outPlayers = new Set();
  for (const [team, injuries] of Object.entries(injuryMap)) {
    for (const inj of injuries) {
      const st = (inj.status || '').toUpperCase();
      if (st.includes('OUT') || st === '60-DAY IL' || st === '15-DAY IL' || st === '10-DAY IL' || st.includes('IL')) {
        outPlayers.add((inj.player || '').toLowerCase());
      }
    }
  }

  const players = [];
  const excludedPlayers = [];

  for (const p of salaryPlayers) {
    const nameKey = (p.name || '').toLowerCase();

    // Exclude OUT players
    if (outPlayers.has(nameKey)) {
      excludedPlayers.push({ name: p.name, team: p.team, status: 'OUT', reason: 'Injury' });
      continue;
    }

    // Find season stats by player ID or name matching
    let stats = null;
    if (p.playerId) {
      stats = seasonStatsMap.get(parseInt(p.playerId)) || seasonStatsMap.get(p.playerId);
    }

    // Determine if pitcher or hitter
    const isPitcher = (p.position === 'P' || p.position === 'SP' || p.position === 'RP' ||
      (p.positions || []).some(pos => ['P', 'SP', 'RP'].includes(pos)));

    // Build stat display based on player type
    let seasonStats = {};
    if (stats) {
      if (isPitcher) {
        seasonStats = {
          gp: stats.pitching_gp || 0,
          gs: stats.pitching_gs || 0,
          era: stats.pitching_era || 0,
          whip: stats.pitching_whip || 0,
          ip: stats.pitching_ip || 0,
          k: stats.pitching_k || 0,
          kPer9: stats.pitching_k_per_9 || 0,
          w: stats.pitching_w || 0,
          l: stats.pitching_l || 0,
          er: stats.pitching_er || 0,
          h: stats.pitching_h || 0,
          bb: stats.pitching_bb || 0,
          hr: stats.pitching_hr || 0,
          war: stats.pitching_war || 0,
        };
      } else {
        seasonStats = {
          gp: stats.batting_gp || 0,
          avg: stats.batting_avg || 0,
          obp: stats.batting_obp || 0,
          slg: stats.batting_slg || 0,
          ops: stats.batting_ops || 0,
          hr: stats.batting_hr || 0,
          rbi: stats.batting_rbi || 0,
          r: stats.batting_r || 0,
          sb: stats.batting_sb || 0,
          h: stats.batting_h || 0,
          ab: stats.batting_ab || 0,
          bb: stats.batting_bb || 0,
          so: stats.batting_so || 0,
          doubles: stats.batting_2b || 0,
          triples: stats.batting_3b || 0,
          war: stats.batting_war || 0,
        };
      }
    }

    // Find the game this player is in
    const playerGame = gameList.find(g =>
      (g.homeTeam || '').toUpperCase() === (p.team || '').toUpperCase() ||
      (g.awayTeam || '').toUpperCase() === (p.team || '').toUpperCase()
    );

    // Check Q/GTD status from injury map
    const teamInjuries = injuryMap[(p.team || '').toUpperCase()] || [];
    const playerInjury = teamInjuries.find(i => (i.player || '').toLowerCase() === nameKey);
    const injuryStatus = playerInjury?.status || p.status || 'ACTIVE';
    const isQuestionable = ['QUESTIONABLE', 'GTD', 'DAY-TO-DAY', 'DTD'].some(
      s => (injuryStatus || '').toUpperCase().includes(s)
    );

    players.push({
      name: p.name,
      team: p.team,
      position: p.position,
      positions: p.positions || [p.position],
      salary: p.salary,
      playerId: p.playerId,
      isPitcher,
      seasonStats,
      status: injuryStatus,
      isQuestionable,
      injuryStatus: injuryStatus !== 'ACTIVE' && injuryStatus !== 'HEALTHY' ? injuryStatus : null,
      opponent: playerGame
        ? ((playerGame.homeTeam || '').toUpperCase() === (p.team || '').toUpperCase()
          ? playerGame.awayTeam : playerGame.homeTeam)
        : null,
      game: playerGame || null,
    });
  }

  console.log(`[MLB DFS Context] ✅ ${players.length} active players, ${excludedPlayers.length} excluded (OUT/IL)`);
  console.log(`[MLB DFS Context]   Pitchers: ${players.filter(p => p.isPitcher).length}, Hitters: ${players.filter(p => !p.isPitcher).length}`);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[MLB DFS Context] ✅ Context built in ${elapsed}s`);

  return {
    platform,
    sport: 'MLB',
    date: dateStr,
    salaryCap,
    rosterSlots,
    players,
    excludedPlayers,
    games: gameList,
    injuries: injuryMap,
    gamesCount: gameList.length,
    buildTime: elapsed,
  };
}
