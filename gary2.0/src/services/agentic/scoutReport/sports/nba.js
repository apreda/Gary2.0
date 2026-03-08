/**
 * NBA Scout Report Builder
 * Handles all NBA-specific logic for building the pre-game scout report.
 */

import { ballDontLieService } from '../../../ballDontLieService.js';
import { generateGameSignificance } from '../gameSignificanceGenerator.js';
import { formatTokenMenu } from '../../tools/toolDefinitions.js';
import { nbaSeason } from '../../../../utils/dateUtils.js';
import {
  seasonForSport,
  playerNamesMatch,
  sportToBdlKey,
  findTeam,
  formatGameTime,
  getInjuryStatusFromMap,
  isPlayerOutFromMap
} from '../shared/utilities.js';
import { geminiGroundingSearch, fetchStandingsSnapshot } from '../shared/grounding.js';
import { buildVerifiedTaleOfTape } from '../shared/taleOfTape.js';
import {
  fetchTeamProfile,
  fetchInjuries,
  fetchRecentGames,
  fetchH2HData,
  fetchCurrentState,
  scrubNarrative,
  formatInjuryReport,
  formatStartingLineups,
  formatOdds,
  formatRestSituation,
  calculateRestSituation,
  formatRecentFormWithBoxScores,
  fetchNbaBoxScoresForGames,
  formatH2HSection,
  detectReturningPlayers
} from '../shared/dataFetchers.js';


// =========================================================================
// NBA KEY PLAYERS HELPER
// Uses active roster + season stats to show who's ACTUALLY on the team
// =========================================================================
// FORMAT NBA ROSTER DEPTH
// Shows top 10 players per team (starters + key bench) with base + advanced stats
// Cross-references with injury data to mark availability
// Includes: Four Factors, advanced stats, Unit comparison
// =========================================================================
function formatNbaRosterDepth(homeTeam, awayTeam, rosterDepth, injuries) {
  if (!rosterDepth || (!rosterDepth.home?.length && !rosterDepth.away?.length)) {
    return '';
  }

  // ===================================================================
  // FOUR FACTORS & EFFICIENCY (Team-Level Aggregates)
  // ===================================================================
  // Use REAL team-level stats from BDL team_season_averages endpoint (not player weight-averaging)
  const teamStatsToFourFactors = (teamStats) => {
    if (!teamStats) return null;
    return {
      efgPct: (teamStats.efg_pct || 0) * 100,
      tsPct: (teamStats.ts_pct || 0) * 100,
      netRating: teamStats.net_rating || 0,
      offRating: teamStats.off_rating || 0,
      defRating: teamStats.def_rating || 0,
      pace: teamStats.pace || 0,
      orebPct: (teamStats.oreb_pct || 0) * 100,
      tovPct: (teamStats.tm_tov_pct || 0) * 100,
      gp: teamStats.gp || 0
    };
  };

  const homeFourFactors = teamStatsToFourFactors(rosterDepth.homeTeamStats);
  const awayFourFactors = teamStatsToFourFactors(rosterDepth.awayTeamStats);

  // Build a set of injured player names for quick lookup (including fresh injury tagging)
  const injuredPlayers = new Map();
  const allInjuries = [...(injuries?.home || []), ...(injuries?.away || [])];
  for (const inj of allInjuries) {
    const name = inj.name?.toLowerCase() || `${inj.player?.first_name || ''} ${inj.player?.last_name || ''}`.toLowerCase().trim();
    if (name && name !== 'unknown') {
      const daysSince = inj.daysSinceReport || inj.days_since || null;
      injuredPlayers.set(name, {
        status: inj.status || 'Unknown',
        description: inj.description || inj.comment || '',
        daysSinceReport: daysSince,
        gamesMissed: inj.gamesMissed ?? null,
        gamesMissedIsMinimum: inj.gamesMissedIsMinimum || false,
        duration: inj.duration || null,
        freshness: inj.freshness || null,
        durationContext: inj.durationContext || null
      });
    }
  }

  const getInjuryStatus = (playerName) => getInjuryStatusFromMap(playerName, injuredPlayers);
  const isPlayerOut = (playerName) => isPlayerOutFromMap(playerName, injuredPlayers);

  // Helper to format a single player row with base + advanced stats
  const formatPlayerRow = (player, index) => {
    const injury = getInjuryStatus(player.name);
    let statusNote = '';
    if (injury) {
      const s = (injury.status || '').toUpperCase();
      const isOut = s.includes('OUT') || s.includes('INJURED') || s.includes('IR');
      const isGTD = s === 'GTD' || s === 'GAME TIME DECISION' || s === 'QUESTIONABLE' || s === 'PROBABLE';
      const isDoubtful = s === 'DOUBTFUL';
      const gm = injury.gamesMissed;
      const gmStr = gm !== null && gm !== undefined ? (injury.gamesMissedIsMinimum ? `${gm}+` : `${gm}`) : '?';
      const days = injury.daysSinceReport;
      const daysStr = days ? `${days}d` : '';
      const gpStr = player.gp ? `GP: ${player.gp}` : '';
      const gmDisplay = `GM: ${gmStr}`;

      if (isOut) {
        const isOFS = injury.duration === 'SEASON-LONG' || s.includes('OUT FOR SEASON') || s === 'IR' || s === 'LTIR';
        if (isOFS) {
          statusNote = ` — OUT [Out For Season]`;
        } else if (gm !== null && gm !== undefined && gm >= 10) {
          statusNote = ` — OUT [${gmStr}g missed${daysStr ? ', ' + daysStr : ''}] ${gpStr ? gpStr + ' / ' : ''}${gmDisplay}`;
        } else if (gm !== null && gm !== undefined && gm <= 2) {
          statusNote = ` — OUT [RECENT — ${gmStr}g missed${daysStr ? ', ' + daysStr : ''}] ${gpStr ? gpStr + ' / ' : ''}${gmDisplay}`;
        } else {
          statusNote = ` — OUT [OUT — ${gmStr}g missed${daysStr ? ', ' + daysStr : ''}] ${gpStr ? gpStr + ' / ' : ''}${gmDisplay}`;
        }
      } else if (isDoubtful) {
        statusNote = ` — DOUBTFUL [DOUBTFUL] ${gpStr ? gpStr + ' / ' : ''}${gmDisplay}`;
      } else if (isGTD) {
        statusNote = ` — QUESTIONABLE [GTD] ${gpStr ? gpStr + ' / ' : ''}${gmDisplay}`;
      } else {
        statusNote = ` [${s}]`;
      }
    }

    // Format shooting percentages (show as whole numbers with %)
    const fgPct = player.fg_pct ? `${(player.fg_pct * 100).toFixed(1)}%` : 'N/A';
    const fg3Pct = player.fg3_pct ? `${(player.fg3_pct * 100).toFixed(1)}%` : 'N/A';

    // Format advanced stats
    const efgPct = player.efg_pct ? `${(player.efg_pct * 100).toFixed(1)}%` : null;
    const tsPct = player.ts_pct ? `${(player.ts_pct * 100).toFixed(1)}%` : null;
    const netRtg = player.net_rating ? (player.net_rating >= 0 ? `+${player.net_rating.toFixed(1)}` : player.net_rating.toFixed(1)) : null;
    const plusMinus = player.plus_minus ? (player.plus_minus >= 0 ? `+${player.plus_minus.toFixed(1)}` : player.plus_minus.toFixed(1)) : null;

    // Format stats - only show if player has meaningful minutes
    const usageStr = player.usg_pct ? `USG: ${(player.usg_pct * 100).toFixed(1)}%` : '';

    // Format team-share percentages (from type=usage endpoint)
    const teamShareParts = [];
    if (player.pct_pts) teamShareParts.push(`${(player.pct_pts * 100).toFixed(1)}% PTS`);
    if (player.pct_reb) teamShareParts.push(`${(player.pct_reb * 100).toFixed(1)}% REB`);
    if (player.pct_ast) teamShareParts.push(`${(player.pct_ast * 100).toFixed(1)}% AST`);
    if (player.pct_fga) teamShareParts.push(`${(player.pct_fga * 100).toFixed(1)}% FGA`);
    const teamShareLine = teamShareParts.length > 0 ? `\n       Team Share: ${teamShareParts.join(' | ')}` : '';

    if (player.min > 5) {
      // Line 1: Base stats (PPG, REB, AST, MIN)
      const gpStr = player.gp ? ` | GP: ${player.gp}` : '';
      const baseLine = `${player.pts.toFixed(1)} PPG | ${player.reb.toFixed(1)} REB | ${player.ast.toFixed(1)} AST | ${player.min.toFixed(1)} MIN${gpStr}`;
      // Line 2: Advanced/efficiency stats (eFG%, TS%, Net Rating, +/-, USG%)
      const advParts = [];
      if (efgPct) advParts.push(`eFG: ${efgPct}`);
      if (tsPct) advParts.push(`TS: ${tsPct}`);
      if (netRtg) advParts.push(`NetRtg: ${netRtg}`);
      if (plusMinus) advParts.push(`+/-: ${plusMinus}`);
      if (usageStr) advParts.push(usageStr);
      const advLine = advParts.length > 0 ? `\n       ${advParts.join(' | ')}` : '';

      return `  ${player.name}${statusNote} - ${baseLine}${advLine}${teamShareLine}`;
    } else {
      return `  ${player.name}${statusNote} - ${player.pts.toFixed(1)} PPG | Limited role${usageStr ? ` | ${usageStr}` : ''}${teamShareLine}`;
    }
  };

  // Show ALL top 10 players including injured — injury labels inline tell the full story
  // Gary and Flash can immediately see who's available and who's not
  const availableHomePlayers = rosterDepth.home || [];
  const availableAwayPlayers = rosterDepth.away || [];

  // Count how many players are OUT (for header note)
  const homeOutCount = availableHomePlayers.filter(p => isPlayerOut(p.name)).length;
  const awayOutCount = availableAwayPlayers.filter(p => isPlayerOut(p.name)).length;

  // Format team rosters
  const lines = [];

  // ===================================================================
  // FOUR FACTORS & EFFICIENCY SECTION
  // ===================================================================
  if (homeFourFactors || awayFourFactors) {
    lines.push('');
    lines.push('FOUR FACTORS & EFFICIENCY');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');

    const formatTeamStats = (ff, teamName, label) => {
      if (!ff) return [`[${label}] ${teamName}: Stats unavailable`];
      const netRtgStr = ff.netRating >= 0 ? `+${ff.netRating.toFixed(1)}` : ff.netRating.toFixed(1);
      const offRtgStr = ff.offRating > 0 ? ff.offRating.toFixed(1) : 'N/A';
      const defRtgStr = ff.defRating > 0 ? ff.defRating.toFixed(1) : 'N/A';
      return [
        `[${label}] ${teamName.toUpperCase()}:`,
        `  eFG%: ${ff.efgPct.toFixed(1)}% | TS%: ${ff.tsPct.toFixed(1)}% | Net Rating: ${netRtgStr}`,
        `  ORtg: ${offRtgStr} | DRtg: ${defRtgStr} | Pace: ${ff.pace?.toFixed(1) || 'N/A'} | GP: ${ff.gp || '?'}`
      ];
    };

    const homeTeamName = rosterDepth.homeTeamName || homeTeam;
    const awayTeamName = rosterDepth.awayTeamName || awayTeam;

    lines.push(...formatTeamStats(homeFourFactors, homeTeamName, 'HOME'));
    lines.push('');
    lines.push(...formatTeamStats(awayFourFactors, awayTeamName, 'AWAY'));
    lines.push('');

    // Comparison summary — raw numbers only, no "winner" labels
    if (homeFourFactors && awayFourFactors) {
      lines.push('EFFICIENCY COMPARISON:');
      lines.push(`  eFG%: ${homeTeamName} ${homeFourFactors.efgPct.toFixed(1)}% | ${awayTeamName} ${awayFourFactors.efgPct.toFixed(1)}%`);
      lines.push(`  Net Rating: ${homeTeamName} ${homeFourFactors.netRating >= 0 ? '+' : ''}${homeFourFactors.netRating.toFixed(1)} | ${awayTeamName} ${awayFourFactors.netRating >= 0 ? '+' : ''}${awayFourFactors.netRating.toFixed(1)}`);
      lines.push('');
    }

    // L5 EFFICIENCY vs SEASON section (if L5 data available)
    const homeL5 = rosterDepth.homeL5;
    const awayL5 = rosterDepth.awayL5;
    if (homeL5?.efficiency || awayL5?.efficiency) {
      lines.push('');
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      lines.push('L5 EFFICIENCY vs SEASON (Last 5 Games)');
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      lines.push('');

      const formatL5Section = (teamName, l5Data, fourFactors, roster, label) => {
        if (!l5Data?.efficiency) return;
        const eff = l5Data.efficiency;
        lines.push(`[${label}] ${teamName}:`);
        lines.push(`  L5:      eFG% ${eff.efg_pct || '?'} | TS% ${eff.ts_pct || '?'} | Approx ORtg ${eff.approx_ortg || '?'} | DRtg ${eff.approx_drtg || '?'} | Net ${eff.approx_net_rtg || '?'}`);
        if (eff.opp_efg_pct || eff.opp_fg3_pct) {
          lines.push(`  L5 DEF:  Opp eFG% ${eff.opp_efg_pct || '?'} | Opp 3P% ${eff.opp_fg3_pct || '?'} | Opp PPG ${eff.opp_ppg || '?'}`);
        }
        if (fourFactors) {
          lines.push(`  Season:  eFG% ${fourFactors.efgPct?.toFixed(1) || '?'} | TS% ${fourFactors.tsPct?.toFixed(1) || '?'} | ORtg ${fourFactors.offRating?.toFixed(1) || '?'} | DRtg ${fourFactors.defRating?.toFixed(1) || '?'} | Net ${fourFactors.netRating?.toFixed(1) || '?'}`);
        }

        // Roster context: compare L5 game participation against expected starters
        if (l5Data.playersByGame && roster && roster.length > 0) {
          // Top 5 players by minutes = expected key players
          const keyPlayers = roster.slice(0, 5);
          const totalGames = Object.keys(l5Data.playersByGame).length;
          const missingPlayers = [];

          for (const player of keyPlayers) {
            let gamesPlayed = 0;
            for (const gameId of Object.keys(l5Data.playersByGame)) {
              const gamePlayers = l5Data.playersByGame[gameId];
              // Match by player ID (most reliable)
              const found = gamePlayers.some(p => p.playerId === player.id);
              if (found) gamesPlayed++;
            }
            if (gamesPlayed < totalGames) {
              missingPlayers.push({
                name: player.name,
                ppg: player.pts?.toFixed(1) || '?',
                gamesPlayed,
                totalGames
              });
            }
          }

          // Check: key players who PLAYED L5 games but are OUT TONIGHT
          // These stats include contributions from a player who won't play
          const outTonight = [];
          for (const player of keyPlayers) {
            if (!isPlayerOut(player.name)) continue;
            let gamesPlayed = 0;
            for (const gameId of Object.keys(l5Data.playersByGame)) {
              const gamePlayers = l5Data.playersByGame[gameId];
              const found = gamePlayers.some(p => p.playerId === player.id);
              if (found) gamesPlayed++;
            }
            if (gamesPlayed > 0) {
              outTonight.push({ name: player.name, ppg: player.pts?.toFixed(1) || '?', gamesPlayed, totalGames });
            }
          }

          if (missingPlayers.length === 0 && outTonight.length === 0) {
            lines.push(`  L5 Roster: All 5 key players played all ${totalGames} L5 games.`);
          } else {
            for (const mp of missingPlayers) {
              lines.push(`  L5 Roster: ${mp.name} (${mp.ppg} PPG) — played ${mp.gamesPlayed} of ${mp.totalGames} L5 games. Tonight: STARTING.`);
            }
          }

          if (outTonight.length > 0) {
            for (const p of outTonight) {
              lines.push(`  L5 Note: ${p.name} (${p.ppg} PPG) — played ${p.gamesPlayed}/${p.totalGames} L5 games but is OUT tonight`);
            }
          }
        }
        lines.push('');
      };

      formatL5Section(homeTeamName, homeL5, homeFourFactors, rosterDepth.home, 'HOME');
      formatL5Section(awayTeamName, awayL5, awayFourFactors, rosterDepth.away, 'AWAY');
    }

    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');
  }

  // Roster section header
  lines.push('');
  lines.push('AVAILABLE ROSTER — TOP 10 PLAYERS BY MINUTES (W/ ADVANCED + TEAM SHARE STATS)');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');

  // Helper: compute team concentration summary for top 3 players
  const getTeamConcentration = (players) => {
    if (!players || players.length < 3) return null;
    const top3 = players.slice(0, 3);
    const pctPtsSum = top3.reduce((sum, p) => sum + (p.pct_pts || 0), 0);
    const pctAstSum = top3.reduce((sum, p) => sum + (p.pct_ast || 0), 0);
    if (pctPtsSum === 0 && pctAstSum === 0) return null;
    return {
      pctPts: (pctPtsSum * 100).toFixed(1),
      pctAst: (pctAstSum * 100).toFixed(1),
      names: top3.map(p => p.name.split(' ').pop()).join('/')
    };
  };

  // Home team
  if (availableHomePlayers.length > 0) {
    const homeTeamName = rosterDepth.homeTeamName || homeTeam;
    const outNote = homeOutCount > 0 ? ` (${homeOutCount} player${homeOutCount > 1 ? 's' : ''} OUT)` : '';
    lines.push(`[HOME] ${homeTeamName.toUpperCase()}${outNote}:`);

    availableHomePlayers.forEach((player, index) => {
      lines.push(formatPlayerRow(player, index));
      // Add visual separator between starters and bench (after top 5)
      if (index === 4 && availableHomePlayers.length > 5) {
        lines.push('  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ (BENCH) ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─');
      }
    });
    // Team concentration summary
    const homeConc = getTeamConcentration(availableHomePlayers);
    if (homeConc) {
      lines.push(`  TEAM CONCENTRATION: Top 3 (${homeConc.names}) account for ${homeConc.pctPts}% of points, ${homeConc.pctAst}% of assists`);
    }
    lines.push('');
  }

  // Away team
  if (availableAwayPlayers.length > 0) {
    const awayTeamName = rosterDepth.awayTeamName || awayTeam;
    const outNote = awayOutCount > 0 ? ` (${awayOutCount} player${awayOutCount > 1 ? 's' : ''} OUT)` : '';
    lines.push(`[AWAY] ${awayTeamName.toUpperCase()}${outNote}:`);

    availableAwayPlayers.forEach((player, index) => {
      lines.push(formatPlayerRow(player, index));
      // Add visual separator between starters and bench (after top 5)
      if (index === 4 && availableAwayPlayers.length > 5) {
        lines.push('  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ (BENCH) ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─');
      }
    });
    // Team concentration summary
    const awayConc = getTeamConcentration(availableAwayPlayers);
    if (awayConc) {
      lines.push(`  TEAM CONCENTRATION: Top 3 (${awayConc.names}) account for ${awayConc.pctPts}% of points, ${awayConc.pctAst}% of assists`);
    }
    lines.push('');
  }

  // ===================================================================
  // UNIT SUMMARIES - Starters (Unit 1) vs Bench (Unit 2) analysis - OPTION B (Advanced)
  // First 5 by minutes = Starters, Next 5 = Key Bench (Top 10 rotation)
  // Includes: Combined PPG, +/-, eFG%, Net Rating, Depth Ratio
  // ===================================================================
  const calculateUnitStats = (players) => {
    if (!players || players.length < 5) return null;
    const starters = players.slice(0, 5);
    const bench = players.slice(5, 10); // Now top 10 players

    const sumStats = (arr) => {
      const ppg = arr.reduce((sum, p) => sum + (p.pts || 0), 0);
      const rpg = arr.reduce((sum, p) => sum + (p.reb || 0), 0);
      const apg = arr.reduce((sum, p) => sum + (p.ast || 0), 0);
      const min = arr.reduce((sum, p) => sum + (p.min || 0), 0);
      const plusMinus = arr.reduce((sum, p) => sum + (p.plus_minus || 0), 0);

      // Calculate weighted average efficiency (weighted by minutes)
      let weightedEfg = 0, weightedTs = 0, weightedNetRtg = 0, totalWeight = 0;
      for (const p of arr) {
        const weight = p.min || 0;
        if (weight > 0) {
          totalWeight += weight;
          weightedEfg += (p.efg_pct || 0) * weight;
          weightedTs += (p.ts_pct || 0) * weight;
          weightedNetRtg += (p.net_rating || 0) * weight;
        }
      }

      return {
        ppg,
        rpg,
        apg,
        min,
        plusMinus,
        efgPct: totalWeight > 0 ? (weightedEfg / totalWeight) * 100 : 0,
        tsPct: totalWeight > 0 ? (weightedTs / totalWeight) * 100 : 0,
        netRating: totalWeight > 0 ? weightedNetRtg / totalWeight : 0,
        count: arr.length
      };
    };

    const starterStats = sumStats(starters);
    const benchStats = sumStats(bench);
    const totalPPG = starterStats.ppg + benchStats.ppg;

    return {
      starters: starterStats,
      bench: benchStats,
      benchRatio: totalPPG > 0 ? ((benchStats.ppg / totalPPG) * 100).toFixed(1) : '0'
    };
  };

  const homeUnits = calculateUnitStats(availableHomePlayers);
  const awayUnits = calculateUnitStats(availableAwayPlayers);

  if (homeUnits || awayUnits) {
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('UNIT COMPARISON — STARTERS VS BENCH (ADVANCED METRICS)');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const formatUnit = (unitStats, label) => {
      const plusMinusStr = unitStats.plusMinus >= 0 ? `+${unitStats.plusMinus.toFixed(1)}` : unitStats.plusMinus.toFixed(1);
      const netRtgStr = unitStats.netRating >= 0 ? `+${unitStats.netRating.toFixed(1)}` : unitStats.netRating.toFixed(1);
      return [
        `  ${label}: ${unitStats.ppg.toFixed(1)} PPG | +/-: ${plusMinusStr} | ${unitStats.min.toFixed(0)} MIN`,
        `       eFG%: ${unitStats.efgPct.toFixed(1)}% | TS%: ${unitStats.tsPct.toFixed(1)}% | NetRtg: ${netRtgStr}`
      ];
    };

    if (homeUnits) {
      const homeTeamName = rosterDepth.homeTeamName || homeTeam;
      lines.push(`[HOME] ${homeTeamName.toUpperCase()}:`);
      lines.push(...formatUnit(homeUnits.starters, 'Starters (Unit 1)'));
      if (homeUnits.bench.count > 0) {
        lines.push(...formatUnit(homeUnits.bench, 'Bench (Unit 2)   '));
        lines.push(`  Bench Contribution: ${homeUnits.benchRatio}% of top-10 scoring`);
      }
      lines.push('');
    }

    if (awayUnits) {
      const awayTeamName = rosterDepth.awayTeamName || awayTeam;
      lines.push(`[AWAY] ${awayTeamName.toUpperCase()}:`);
      lines.push(...formatUnit(awayUnits.starters, 'Starters (Unit 1)'));
      if (awayUnits.bench.count > 0) {
        lines.push(...formatUnit(awayUnits.bench, 'Bench (Unit 2)   '));
        lines.push(`  Bench Contribution: ${awayUnits.benchRatio}% of top-10 scoring`);
      }
      lines.push('');
    }

    // Compare depth
    if (homeUnits && awayUnits && homeUnits.bench.count > 0 && awayUnits.bench.count > 0) {
      const homeBenchAdv = parseFloat(homeUnits.benchRatio) - parseFloat(awayUnits.benchRatio);
      lines.push(`DEPTH COMPARISON: ${rosterDepth.homeTeamName} bench ${homeUnits.benchRatio}% | ${rosterDepth.awayTeamName} bench ${awayUnits.benchRatio}% (gap: ${Math.abs(homeBenchAdv).toFixed(1)}%)`);
    }
    lines.push('');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');
  }


  return lines.join('\n');
}


// =========================================================================
// MAIN EXPORT: buildNbaScoutReport
// =========================================================================
export async function buildNbaScoutReport(game, options = {}) {
  const homeTeam = game.home_team;
  const awayTeam = game.away_team;
  const sportKey = 'NBA';

  // ===================================================================
  // Step A: Fetch basic data in parallel
  // ===================================================================
  const [homeProfile, awayProfile, injuries, recentHome, recentAway, standingsSnapshot] = await Promise.all([
    fetchTeamProfile(homeTeam, sportKey),
    fetchTeamProfile(awayTeam, sportKey),
    fetchInjuries(homeTeam, awayTeam, sportKey),
    fetchRecentGames(homeTeam, sportKey, 12),
    fetchRecentGames(awayTeam, sportKey, 12),
    fetchStandingsSnapshot(sportKey, homeTeam, awayTeam)
  ]);

  // ===================================================================
  // Step B: NBA INJURY DURATION RESOLUTION (box-score method — single source of truth)
  // Uses the team's recent game box scores to determine when each injured player
  // last played. Counts GAMES missed (not calendar days) — naturally handles
  // All-Star breaks, bye weeks, and any schedule gap.
  // Also handles: suspension detection, FRESH/STALE marking, HARD FAIL on UNKNOWN.
  // ===================================================================
  if (injuries?.home?.length > 0 || injuries?.away?.length > 0) {
    const STALE_WINDOW_GAMES = 2; // 0-2 games missed = FRESH/RECENT, >2 = STALE

    const resolveDurationByBoxScore = async (injuryList, teamRecentGames, teamName) => {
      // Step 1: Tag suspensions (but let them go through box-score resolution for real dates)
      for (const inj of injuryList) {
        const context = (inj.durationContext || '').toLowerCase();
        if (context.includes('suspension') || context.includes('suspended')) {
          inj.isSuspension = true;
        }
      }

      // Step 2: Identify all actionable injuries that need duration resolution
      const actionableInjuries = injuryList.filter(inj => {
        const status = (inj.status || '').toLowerCase();
        return status.includes('out') || status.includes('doubtful') || status.includes('questionable') || status.includes('day-to-day');
      });
      if (actionableInjuries.length === 0) return;

      const gameIds = (teamRecentGames || []).map(g => g.id).filter(Boolean).slice(0, 10);
      if (gameIds.length === 0) {
        throw new Error(`[Scout Report] CRITICAL: No recent game IDs available for ${teamName} — cannot resolve injury durations`);
      }

      // Build game date map from recentGames
      const gameDateMap = new Map();
      const gameOrder = []; // ordered most-recent-first
      for (const g of teamRecentGames) {
        if (g.id) {
          gameDateMap.set(g.id, g.date || g.datetime);
          gameOrder.push(g.id);
        }
      }

      // Fetch player stats per-game in parallel (avoids pagination issues —
      // 10 games x ~30 players = ~300 entries, exceeds single-page 100 limit)
      const perGameResults = await Promise.all(
        gameIds.map(gId => ballDontLieService.getPlayerStats('basketball_nba', {
          game_ids: [gId],
          per_page: 100
        }))
      );
      const allStats = perGameResults.flat();
      if (!allStats || allStats.length === 0) {
        throw new Error(`[Scout Report] CRITICAL: No box-score data returned for ${teamName} recent games — cannot resolve injury durations`);
      }

      // Step 3: Resolve each injury via box scores
      for (const inj of actionableInjuries) {
        const injName = `${inj.player?.first_name || ''} ${inj.player?.last_name || ''}`.toLowerCase().trim();
        if (!injName) continue;
        const pName = `${inj.player?.first_name || ''} ${inj.player?.last_name || ''}`.trim();

        // Find this player's entries in the box scores
        const playerEntries = allStats.filter(s => {
          const statName = `${s.player?.first_name || ''} ${s.player?.last_name || ''}`.toLowerCase().trim();
          return playerNamesMatch(injName, statName) && parseFloat(s.min || '0') > 0;
        });

        if (playerEntries.length > 0) {
          // Sort by game date descending to find most recent appearance
          playerEntries.sort((a, b) => {
            const dateA = new Date(a.game?.date || gameDateMap.get(a.game?.id) || 0);
            const dateB = new Date(b.game?.date || gameDateMap.get(b.game?.id) || 0);
            return dateB - dateA;
          });

          const lastGameDate = new Date(playerEntries[0].game?.date || gameDateMap.get(playerEntries[0].game?.id));
          const daysSince = Math.floor((Date.now() - lastGameDate) / (1000 * 60 * 60 * 24));

          // Count games the TEAM played after this player's last game
          const gamesMissed = gameOrder.filter(gId => {
            const gDate = gameDateMap.get(gId);
            return gDate && new Date(gDate) > lastGameDate;
          }).length;

          // Set duration + freshness based on games missed AND calendar days
          // Both matter: games missed shows team impact, but calendar days shows
          // how long the market has had to adjust. During schedule breaks (All-Star,
          // bye weeks), a player can miss few games over many days — the market
          // still adjusts over calendar time regardless.
          const STALE_DAYS_THRESHOLD = 5; // 5+ calendar days = market has adjusted
          if (gamesMissed <= STALE_WINDOW_GAMES && daysSince < STALE_DAYS_THRESHOLD) {
            inj.duration = 'FRESH';
            inj.freshness = 'FRESH';
          } else if (gamesMissed <= 3) {
            inj.duration = 'SHORT-TERM';
            inj.freshness = 'STALE';
          } else if (gamesMissed >= 20) {
            inj.duration = 'SEASON-LONG';
            inj.freshness = 'STALE';
          } else {
            inj.duration = 'PRICED IN';
            inj.freshness = 'STALE';
          }

          inj.daysSinceReport = daysSince;
          inj.gamesMissed = gamesMissed;
          inj.reportDateStr = lastGameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          inj.durationSource = 'box_score';

          const suspTag = inj.isSuspension ? ' (suspension)' : '';
          console.log(`[Scout Report] ${pName} (${teamName})${suspTag} last played ${inj.reportDateStr} — ${gamesMissed} game(s) missed → ${inj.duration} [${inj.freshness}]`);
        } else {
          // Not found in any of the last N games → long-term absence
          // gamesMissed is a MINIMUM (player has been out longer than our window)
          inj.gamesMissed = gameIds.length;
          inj.gamesMissedIsMinimum = true;
          inj.duration = 'SEASON-LONG';
          inj.freshness = 'STALE';
          inj.durationSource = 'box_score';
          const suspTag2 = inj.isSuspension ? ' (suspension)' : '';
          console.log(`[Scout Report] ${pName} (${teamName})${suspTag2} not in last ${gameIds.length} games → SEASON-LONG [STALE]`);
        }
      }
    };

    await Promise.all([
      resolveDurationByBoxScore(injuries.home || [], recentHome, homeTeam),
      resolveDurationByBoxScore(injuries.away || [], recentAway, awayTeam)
    ]);

    // HARD FAIL: If any Out/Doubtful injury still has UNKNOWN duration, something broke
    const allInjuries = [...(injuries.home || []), ...(injuries.away || [])];
    const unresolved = allInjuries.filter(inj => {
      const status = (inj.status || '').toLowerCase();
      const isActionable = status.includes('out') || status.includes('doubtful');
      return isActionable && inj.duration === 'UNKNOWN';
    });
    if (unresolved.length > 0) {
      const details = unresolved.map(inj => {
        const name = `${inj.player?.first_name || ''} ${inj.player?.last_name || ''}`.trim();
        return `${name} (${inj.status}, reason: ${inj.durationContext || 'none'}, source: ${inj.source || 'unknown'})`;
      }).join('; ');
      throw new Error(`[Scout Report] CRITICAL: ${unresolved.length} NBA injuries with UNKNOWN duration after box-score resolution. This should never happen. Details: ${details}`);
    }


    // Log summary
    const freshPlayers = allInjuries.filter(i => i.freshness === 'FRESH' && (i.status || '').toLowerCase().includes('out'));
    const stalePlayers = allInjuries.filter(i => i.freshness === 'STALE' && (i.status || '').toLowerCase().includes('out'));
    if (freshPlayers.length > 0) {
      console.log(`[Scout Report] Fresh OUT (0-2 games missed): ${freshPlayers.map(i => `${i.player?.first_name} ${i.player?.last_name} (${i.gamesMissed ?? 0}g)`).join(', ')}`);
    }
    if (stalePlayers.length > 0) {
      console.log(`[Scout Report] Stale OUT (>2 games, line likely adjusted): ${stalePlayers.map(i => `${i.player?.first_name} ${i.player?.last_name} (${i.gamesMissedIsMinimum ? i.gamesMissed + '+' : i.gamesMissed}g)`).join(', ')}`);
    }
  }

  // ===================================================================
  // Step C: Fetch NBA game context via Gemini Grounding (venue, tournament, game significance)
  // This works dynamically for regular season, NBA Cup, playoffs, etc.
  // ===================================================================
  let gameContextData = null;
  try {
    // Use US Eastern time to get correct date (avoids UTC offset issues for evening games)
    let dateStr;
    if (game.commence_time) {
      const gameDate = new Date(game.commence_time);
      dateStr = gameDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD format
    } else {
      dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    }
    console.log(`[Scout Report] Fetching NBA game context via Gemini Grounding for ${dateStr}...`);

    // Ask Gemini to determine game type with structured output at the end
    const contextQuery = `Given this NBA game: ${awayTeam} vs ${homeTeam} on ${dateStr}.

Determine what type of game this is, where it is being played, and any special significance.
Search for current information about this specific game.

After your analysis, include this EXACT summary block at the very end of your response:
---GAME_CONTEXT---
GAME_TYPE: [one of: regular_season, nba_cup_group, nba_cup_quarterfinal, nba_cup_semifinal, nba_cup_championship, playoffs]
NEUTRAL_SITE: [yes or no]
VENUE: [arena name, city]
---END_CONTEXT---`;

    const contextResult = await geminiGroundingSearch(contextQuery, {
      temperature: 1.0,
      maxTokens: 1500
    });

    if (contextResult?.success && contextResult?.data) {
      const responseText = contextResult.data;

      // Store full Grounding response — Gary reads this directly
      game.gameSignificance = responseText;

      // Parse the structured block (if Gemini included it)
      const contextMatch = responseText.match(/---GAME_CONTEXT---\s*([\s\S]*?)\s*---END_CONTEXT---/);
      if (contextMatch) {
        const block = contextMatch[1];
        const gameType = block.match(/GAME_TYPE:\s*(.+)/i)?.[1]?.trim().toLowerCase() || '';
        const neutralSite = block.match(/NEUTRAL_SITE:\s*(.+)/i)?.[1]?.trim().toLowerCase() || '';
        const venue = block.match(/VENUE:\s*(.+)/i)?.[1]?.trim() || '';

        if (gameType.includes('nba_cup')) {
          if (gameType.includes('championship')) game.tournamentContext = 'NBA Cup Championship';
          else if (gameType.includes('semifinal')) game.tournamentContext = 'NBA Cup Semifinal';
          else if (gameType.includes('quarterfinal')) game.tournamentContext = 'NBA Cup Quarterfinal';
          else game.tournamentContext = 'NBA Cup';
          console.log(`[Scout Report] ${game.tournamentContext} detected`);
        } else if (gameType.includes('playoff')) {
          game.tournamentContext = 'NBA Playoffs';
          console.log('[Scout Report] Playoff game detected');
        } else {
          console.log('[Scout Report] Regular season game');
        }

        if (neutralSite === 'yes') {
          game.isNeutralSite = true;
        }

        if (venue && venue.toLowerCase() !== 'n/a') {
          // Strip city/state — UI only needs arena name (e.g., "Madison Square Garden" not "Madison Square Garden, New York")
          game.venue = venue.split(',')[0].trim();
          console.log(`[Scout Report] Venue: ${game.venue}`);
        }
      } else {
        // Structured block not found — default to regular season (safe)
        console.log('[Scout Report] Regular season game (no structured context block)');
      }

      gameContextData = {
        rawContext: responseText,
        isNbaCup: !!game.tournamentContext?.includes('NBA Cup'),
        isPlayoffs: game.tournamentContext === 'NBA Playoffs',
        isNeutralSite: game.isNeutralSite || false
      };

      console.log('[Scout Report] Game context retrieved via Gemini Grounding');
    }
  } catch (e) {
    console.warn('[Scout Report] NBA game context fetch failed:', e.message);
  }

  // ===================================================================
  // Step D: Fetch NBA key players + roster depth + L5 + team advanced
  // ===================================================================
  let nbaRosterDepth = null;

  const nbaSeasonYear = nbaSeason();

  // Fetch in parallel: BDL roster depth + current state (news/headlines)
  const [rosterDepth, nbaCurrentState] = await Promise.all([
    ballDontLieService.getNbaRosterDepth(homeTeam, awayTeam, nbaSeasonYear),
    fetchCurrentState(homeTeam, awayTeam, 'basketball_nba').catch(e => {
      console.warn('[Scout Report] NBA current state error (non-fatal):', e.message);
      return null;
    })
  ]);
  nbaRosterDepth = rosterDepth;

  // Set narrative context from Grounding current state (includes news/headlines/storylines)
  // This supplements the RapidAPI injury data with game context and today's news
  if (nbaCurrentState?.groundedRaw && injuries) {
    // Combine: keep RapidAPI injury data as the injury source, add Grounding narrative for context
    const existingNarrative = injuries.narrativeContext || '';
    injuries.narrativeContext = existingNarrative
      ? `${existingNarrative}\n\n--- TODAY'S GAME CONTEXT & NEWS ---\n${nbaCurrentState.groundedRaw}`
      : nbaCurrentState.groundedRaw;
    console.log(`[Scout Report] NBA current state added to narrative (${nbaCurrentState.groundedRaw.length} chars)`);
  }

  // Compute L5 efficiency + roster context (uses game IDs from recentHome/recentAway)
  // We fetch 8 recent games as buffer (some may lack box scores), but only use 5 for L5 calc
  if (rosterDepth?.homeTeamId && rosterDepth?.awayTeamId) {
    const homeGameIds = (recentHome || []).map(g => g.id).filter(Boolean).slice(0, 5);
    const awayGameIds = (recentAway || []).map(g => g.id).filter(Boolean).slice(0, 5);
    if (homeGameIds.length > 0 || awayGameIds.length > 0) {
      try {
        const [homeL5, awayL5] = await Promise.all([
          homeGameIds.length > 0 ? ballDontLieService.getTeamL5Efficiency(rosterDepth.homeTeamId, homeGameIds) : null,
          awayGameIds.length > 0 ? ballDontLieService.getTeamL5Efficiency(rosterDepth.awayTeamId, awayGameIds) : null
        ]);
        // Attach to rosterDepth so formatNbaRosterDepth can use it
        nbaRosterDepth.homeL5 = homeL5;
        nbaRosterDepth.awayL5 = awayL5;
        console.log(`[Scout Report] L5 efficiency computed: Home ${homeL5?.efficiency?.games || 0} games, Away ${awayL5?.efficiency?.games || 0} games`);
      } catch (e) {
        console.warn(`[Scout Report] L5 efficiency computation failed (non-fatal):`, e.message);
      }
    }

    // Fetch REAL team-level advanced + base stats for season comparison in scout report
    try {
      const [homeTeamStats, awayTeamStats, homeBaseStats, awayBaseStats] = await Promise.all([
        ballDontLieService.getTeamSeasonAdvanced(rosterDepth.homeTeamId, nbaSeasonYear),
        ballDontLieService.getTeamSeasonAdvanced(rosterDepth.awayTeamId, nbaSeasonYear),
        ballDontLieService.getTeamBaseStats(rosterDepth.homeTeamId, nbaSeasonYear),
        ballDontLieService.getTeamBaseStats(rosterDepth.awayTeamId, nbaSeasonYear)
      ]);
      nbaRosterDepth.homeTeamStats = homeTeamStats;
      nbaRosterDepth.awayTeamStats = awayTeamStats;
      nbaRosterDepth.homeBaseStats = homeBaseStats;
      nbaRosterDepth.awayBaseStats = awayBaseStats;
    } catch (e) {
      console.warn(`[Scout Report] Team season stats fetch failed (non-fatal):`, e.message);
    }
  }

  // Post-process: Filter injuries against BDL active roster
  // RapidAPI injury feed can have stale team assignments (e.g., traded players still listed under old team)
  // BDL active roster is ground truth for who is actually on each team RIGHT NOW
  if (injuries && nbaRosterDepth) {
    const buildRosterNames = (players) => {
      if (!players || !Array.isArray(players)) return [];
      return players.map(p => (p.name || `${p.first_name || ''} ${p.last_name || ''}`).toLowerCase().trim()).filter(n => n);
    };
    const homeRosterNames = buildRosterNames(nbaRosterDepth.home);
    const awayRosterNames = buildRosterNames(nbaRosterDepth.away);
    const allRosterNames = [...homeRosterNames, ...awayRosterNames];

    const filterInjuriesToRoster = (injuryList, teamLabel) => {
      if (!injuryList || injuryList.length === 0) return injuryList;
      return injuryList.filter(inj => {
        const injName = typeof inj.player === 'string' ? inj.player :
          `${inj.player?.first_name || ''} ${inj.player?.last_name || ''}`.trim();
        const onRoster = allRosterNames.some(rn => playerNamesMatch(rn, injName));
        if (!onRoster) {
          console.log(`[Scout Report] FILTERED injury: ${injName} (${inj.status}) — NOT on BDL active roster for ${teamLabel} (likely traded)`);
        }
        return onRoster;
      });
    };

    const homeBefore = injuries.home?.length || 0;
    const awayBefore = injuries.away?.length || 0;
    injuries.home = filterInjuriesToRoster(injuries.home, homeTeam);
    injuries.away = filterInjuriesToRoster(injuries.away, awayTeam);
    const filtered = (homeBefore - (injuries.home?.length || 0)) + (awayBefore - (injuries.away?.length || 0));
    if (filtered > 0) {
      console.log(`[Scout Report] Roster filter removed ${filtered} stale injury entry/entries (traded players)`);
      // Rebuild groundingRaw to reflect filtered injuries
      injuries.groundingRaw = [
        `=== ${awayTeam} ===`, `${awayTeam} INJURY REPORT:`,
        injuries.away.length > 0
          ? injuries.away.map(i => `${i.player.first_name} ${i.player.last_name} - ${i.status} (${i.durationContext})`).join('\n')
          : 'No injuries reported',
        '', `=== ${homeTeam} ===`, `${homeTeam} INJURY REPORT:`,
        injuries.home.length > 0
          ? injuries.home.map(i => `${i.player.first_name} ${i.player.last_name} - ${i.status} (${i.durationContext})`).join('\n')
          : 'No injuries reported'
      ].join('\n');
    }
  }

  // Post-process: Cross-reference API injuries against roster depth
  // This catches name mismatches and truncated grounding responses
  // (e.g., "Shai Alexander" in API vs "Shai Gilgeous-Alexander" in BDL)
  if (injuries && nbaRosterDepth) {
    const apiOutNames = [...(injuries.home || []), ...(injuries.away || [])]
      .filter(inj => {
        const s = (inj.status || '').toLowerCase();
        return s === 'out' || s.includes('out for season');
      })
      .map(inj => {
        const name = typeof inj.player === 'string' ? inj.player :
          `${inj.player?.first_name || ''} ${inj.player?.last_name || ''}`.trim();
        return name.toLowerCase();
      })
      .filter(n => n);

    if (apiOutNames.length > 0) {
      const filterOutFromRoster = (players) => {
        if (!players) return players;
        return players.filter(p => {
          const pName = (p.name || '').toLowerCase();
          const isOut = apiOutNames.some(outName => playerNamesMatch(pName, outName));
          if (isOut) {
            if ((p.pts || p.ppg || 0) >= 10) {
              console.log(`[Scout Report] Post-filter excluded ${p.name} (${(p.pts || p.ppg || 0).toFixed?.(1) || '?'} PPG) from roster - API injury match`);
            }
          }
          return !isOut;
        });
      };
      nbaRosterDepth.home = filterOutFromRoster(nbaRosterDepth.home);
      nbaRosterDepth.away = filterOutFromRoster(nbaRosterDepth.away);
    }
  }

  // ===================================================================
  // Step E: Fetch H2H data + box scores for Recent Form
  // ===================================================================
  let h2hData = null;
  let recentFormBoxScores = {};
  try {
    // Fetch H2H and box scores for L3 recent games in parallel
    const [h2hResult, boxScores] = await Promise.all([
      fetchH2HData(homeTeam, awayTeam, sportKey, recentHome, recentAway),
      fetchNbaBoxScoresForGames([...(recentHome || []).slice(0, 3), ...(recentAway || []).slice(0, 3)])
    ]);
    h2hData = h2hResult;
    recentFormBoxScores = boxScores;
    console.log(`[Scout Report] H2H Data: ${h2hData?.found ? `${h2hData.gamesFound} game(s) found` : 'No games found'}`);
    console.log(`[Scout Report] Box scores fetched for ${Object.keys(recentFormBoxScores).length} date(s)`);
  } catch (e) {
    console.log(`[Scout Report] H2H/box score fetch failed: ${e.message}`);
  }

  // ===================================================================
  // Step F: Generate game significance
  // ===================================================================
  if (!game.gameSignificance || game.gameSignificance === 'Regular season game' || game.gameSignificance.length > 100) {
    try {
      // Fetch standings for significance generation (optional - fallbacks exist)
      const bdlSport = sportToBdlKey(sportKey);
      let standings = [];
      if (bdlSport) {
        const currentSeason = seasonForSport(sportKey);
        try {
          standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season: currentSeason }) || [];
        } catch (standingsErr) {
          console.log(`[Scout Report] Standings fetch failed (will use fallbacks): ${standingsErr.message}`);
        }
      }

      // Generate significance even without standings - fallbacks handle conference matchups
      const significance = generateGameSignificance(
        {
          home_team: homeTeam,
          away_team: awayTeam,
          venue: game.venue,
          date: game.date || game.datetime,
          postseason: game.postseason,
          homeConference: game.homeConference,
          awayConference: game.awayConference
        },
        sportKey,
        standings,
        game.week || null
      );
      if (significance) {
        game.gameSignificance = significance;
        console.log(`[Scout Report] Game significance: ${significance}`);
      }
    } catch (sigErr) {
      console.log(`[Scout Report] Could not generate game significance: ${sigErr.message}`);
    }
  }

  // ===================================================================
  // Step G: Format injuries for storage
  // ===================================================================
  const formatInjuriesForStorage = (injuriesData) => {
    // Common word fragments that indicate parsing errors (not real first names)
    const invalidFirstNamePatterns = /^(th|nd|rd|st|with|for|and|the|or|by|to|in|on|at|of|is|as|a|an)\s/i;

    const formatList = (list) => list.map(i => {
      // Build and sanitize player name - remove newlines, extra spaces
      const firstName = (i.player?.first_name || '').trim();
      const lastName = (i.player?.last_name || '').trim();
      let name = `${firstName} ${lastName}`.trim() || i.name || 'Unknown';
      name = name.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

      // Skip malformed entries:
      // 1. Total name too short (less than 5 chars like "A B")
      // 2. First name too short (less than 2 chars)
      // 3. Last name too short (less than 2 chars)
      // 4. Name starts with common word fragments (parsing errors)
      const nameParts = name.split(' ');
      const isValidName = (
        name.length >= 5 &&
        nameParts.length >= 2 &&
        nameParts[0].length >= 2 &&
        nameParts[nameParts.length - 1].length >= 2 &&
        !invalidFirstNamePatterns.test(name)
      );

      if (!isValidName) {
        console.log(`[Scout Report] Skipping malformed injury entry: "${name}"`);
        name = 'Unknown';
      }

      return {
        name,
        status: (i.status || 'Unknown').replace(/[\r\n]+/g, '').trim(),
        description: (i.description || i.comment || i.injury || '').replace(/[\r\n]+/g, ' ').trim()
      };
    }).filter(i => i.name !== 'Unknown'); // Filter out unknown entries

    return {
      home: formatList(injuriesData.home || []),
      away: formatList(injuriesData.away || [])
    };
  };

  const injuriesForStorage = formatInjuriesForStorage(injuries);

  // ===================================================================
  // Step H: Narrative Scrubbing — Remove "ghost" players from the grounding narrative
  // This ensures Gary never even sees names of players who are not in the active stats or filtered injuries.
  // ===================================================================
  if (injuries?.narrativeContext) {
    const allowedNames = new Set();

    // 1. Add names from BDL roster depth (primary source of truth for active players)
    const roster = nbaRosterDepth;

    // Helper to add names from different roster/keyPlayer formats
    const addNamesFromSource = (teamData) => {
      if (!teamData) return;
      if (Array.isArray(teamData)) {
        teamData.forEach(p => { if (p.name) allowedNames.add(p.name.trim()); });
      } else {
        // Handle object structures
        const collectionKeys = [
          'players', 'roster', 'active_players', 'depth_chart'
        ];

        collectionKeys.forEach(key => {
          const coll = teamData[key];
          if (Array.isArray(coll)) {
            coll.forEach(p => {
              if (p.name) allowedNames.add(p.name.trim());
              else if (p.player?.first_name) {
                const name = `${p.player.first_name} ${p.player.last_name || ''}`.trim();
                allowedNames.add(name);
              }
            });
          }
        });

        // Also check if the object itself has name/player properties (if it's a single player object)
        if (teamData.name) allowedNames.add(teamData.name.trim());
        else if (teamData.player?.first_name) {
          const name = `${teamData.player.first_name} ${teamData.player.last_name || ''}`.trim();
          allowedNames.add(name);
        }
      }
    };

    if (roster) {
      addNamesFromSource(roster.home);
      addNamesFromSource(roster.away);
    }

    // 2. Add names from structured injury list (which already has hard filters applied)
    [...(injuries.home || []), ...(injuries.away || [])].forEach(i => {
      const name = i.name || `${i.player?.first_name || ''} ${i.player?.last_name || ''}`.trim();
      if (name && name.length > 3) allowedNames.add(name);
    });

    // 3. Add names from starting lineups
    if (injuries.lineups) {
      if (injuries.lineups.home) injuries.lineups.home.forEach(p => { if (p.name) allowedNames.add(p.name.trim()); });
      if (injuries.lineups.away) injuries.lineups.away.forEach(p => { if (p.name) allowedNames.add(p.name.trim()); });
    }

    // Collect long-term injured players to EXCLUDE from narrative
    const excludedLongTerm = new Set(injuries.filteredLongTerm || []);

    // Use BDL season stats (games played) to detect players who never played this season
    // gp === 0 means the player has been out ALL season — team has played without them all year, safe to remove
    // gp > 0 means they played at some point — any current injury is fresh/relevant, KEEP them
    if (nbaRosterDepth?.gpMap) {
      const gpMap = nbaRosterDepth.gpMap;
      [...(injuries.home || []), ...(injuries.away || [])].forEach(i => {
        const name = i.name || `${i.player?.first_name || ''} ${i.player?.last_name || ''}`.trim();
        if (!name || name.length < 4) return;
        if (gpMap[name] === 0) {
          excludedLongTerm.add(name);
        }
      });
    }

    if (excludedLongTerm.size > 0) {
      console.log(`[Scout Report] Excluding ${excludedLongTerm.size} long-term injured players from narrative (gp=0): ${Array.from(excludedLongTerm).join(', ')}`);
    }

    if (allowedNames.size > 0) {
      console.log(`[Scout Report] Scrubbing NBA narrative with ${allowedNames.size} allowed player names...`);
      const scrubbed = await scrubNarrative(injuries.narrativeContext, Array.from(allowedNames), homeTeam, awayTeam, Array.from(excludedLongTerm));
      injuries.narrativeContext = scrubbed;
    }
  }

  // ===================================================================
  // Step I: Detect returning players (uses L5 playersByGame data)
  // ===================================================================
  const returningPlayersSection = nbaRosterDepth
    ? detectReturningPlayers(nbaRosterDepth, injuries, recentHome, recentAway, homeTeam, awayTeam)
    : '';

  // ===================================================================
  // Step J: Assemble the report text
  // ===================================================================
  // Extract narrative context from Gemini Grounding (valuable even if injury parsing returned 0)
  // NO TRUNCATION — Gary needs the full narrative for both teams + matchup context
  let narrativeContext = injuries?.narrativeContext || null;

  const matchupLabel = game.isNeutralSite ? `${awayTeam} vs ${homeTeam}` : `${awayTeam} @ ${homeTeam}`;
  const venueLabel = game.venue || (game.isNeutralSite ? 'Neutral Site' : `${homeTeam} Home`);
  const tournamentLabel = game.tournamentContext ? `[${game.tournamentContext}]` : '';

  // Dynamic season label (e.g., "2025-26") — works for any year
  const _now = new Date();
  const _yr = _now.getFullYear();
  const _mo = _now.getMonth() + 1;
  const seasonLabel = _mo >= 7 ? `${_yr}-${String(_yr + 1).slice(2)}` : `${_yr - 1}-${String(_yr).slice(2)}`;

  // Build game context section if we have special context (NBA Cup, playoffs, etc.)
  let gameContextSection = '';
  if (game.gameSignificance && game.tournamentContext) {
    gameContextSection = `
GAME CONTEXT & SIGNIFICANCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${game.gameSignificance}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;
  }


  // Generate injury report separately so we can log it for debugging
  // Pass rosterDepth for NBA so injury report can show team-share context for OUT players
  const injuryReportText = formatInjuryReport(homeTeam, awayTeam, injuries, sportKey, nbaRosterDepth);

  // Debug: Log the injury report Gary will see (first 3000 chars)
  if (injuryReportText && injuryReportText.length > 50) {
    console.log(`[Scout Report] Injury report preview (${injuryReportText.length} chars):`);
    console.log(injuryReportText.substring(0, 3000));
    if (injuryReportText.length > 3000) console.log('...[log truncated, full report sent to Gary]');
  }


  const report = `
══════════════════════════════════════════════════════════════════════
MATCHUP: ${matchupLabel}
Sport: ${sportKey} | ${game.commence_time ? formatGameTime(game.commence_time) : 'Time TBD'}
${game.venue ? `Venue: ${venueLabel}` : ''}${tournamentLabel ? `\n${tournamentLabel}` : ''}
══════════════════════════════════════════════════════════════════════
${gameContextSection}${standingsSnapshot || ''}
INJURY REPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${injuryReportText}
${formatStartingLineups(homeTeam, awayTeam, injuries.lineups)}
${returningPlayersSection}${narrativeContext ? `
CURRENT STATE & CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━
${narrativeContext}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : ''}
REST & SCHEDULE SITUATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatRestSituation(homeTeam, awayTeam, calculateRestSituation(recentHome, game.commence_time, homeTeam), calculateRestSituation(recentAway, game.commence_time, awayTeam))}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${nbaRosterDepth ? formatNbaRosterDepth(homeTeam, awayTeam, nbaRosterDepth, injuries) : ''}

LAST GAME
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatRecentFormWithBoxScores(homeTeam, recentHome, recentFormBoxScores, 1)}
${formatRecentFormWithBoxScores(awayTeam, recentAway, recentFormBoxScores, 1)}
HEAD-TO-HEAD HISTORY (${seasonLabel} SEASON)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatH2HSection(h2hData, homeTeam, awayTeam)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BETTING CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatOdds(game, sportKey)}
`.trim();

  // ===================================================================
  // Step K: Build verified Tale of Tape from BDL advanced + base stats
  // ===================================================================
  const homeSeasonStats = { ...(nbaRosterDepth?.homeTeamStats || {}), ...(nbaRosterDepth?.homeBaseStats || {}) };
  const awaySeasonStats = { ...(nbaRosterDepth?.awayTeamStats || {}), ...(nbaRosterDepth?.awayBaseStats || {}) };
  const verifiedTaleOfTape = buildVerifiedTaleOfTape(
    homeTeam, awayTeam,
    { ...homeProfile, seasonStats: homeSeasonStats },
    { ...awayProfile, seasonStats: awaySeasonStats },
    sportKey, injuries, recentHome, recentAway
  );

  // ===================================================================
  // Step L: Return the same object shape
  // ===================================================================
  return {
    text: report,
    tokenMenu: formatTokenMenu(sportKey),
    injuries: injuriesForStorage,
    verifiedTaleOfTape,
    homeRecord: homeProfile?.record || null,
    awayRecord: awayProfile?.record || null,
    venue: game.venue || null,
    isNeutralSite: game.isNeutralSite || false,
    tournamentContext: game.tournamentContext || null,
    // Game significance/context (from Gemini Grounding for NBA Cup, playoffs, etc.)
    gameSignificance: game.gameSignificance || null,
    // CFP-specific fields (not applicable for NBA)
    cfpRound: null,
    homeSeed: null,
    awaySeed: null,
    // Conference data (not applicable for NBA — no filtering by conference)
    homeConference: null,
    awayConference: null
  };
}
