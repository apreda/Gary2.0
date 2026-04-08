/**
 * MLB Scout Report Builder
 *
 * Uses BDL (GOAT tier) for structured data:
 * - Standings (W-L, home/away, L10, streak, GB, division)
 * - Injuries (with NEW/KNOWN/SP-SCRATCH labels)
 * Uses MLB Stats API (free, no key) for:
 * - Rosters, recent games, probable pitchers, player career stats
 * Uses Gemini Grounding for:
 * - Odds, live context, game preview, season storylines
 */

import { geminiGroundingSearch } from '../shared/grounding.js';
import { formatTokenMenu } from '../../tools/toolDefinitions.js';
import { buildVerifiedTaleOfTape } from '../shared/taleOfTape.js';
import { ballDontLieService } from '../../../ballDontLieService.js';
import { getPitcherXStats, getBatterXStats } from '../../../baseballSavantService.js';
import {
  getTeamRoster,
  getPlayerCareerStats,
  getMlbRecentGames,
  getProbablePitchers,
  getTeamBattingStats,
  getConfirmedLineups,
  getGameBoxScore,
} from '../../../mlbStatsApiService.js';

export async function buildMlbScoutReport(game, options = {}) {
  // home_team/away_team are strings; team objects with IDs are in home_team_data/away_team_data
  const homeTeam = typeof game.home_team === 'string' ? game.home_team : (game.home_team?.full_name || game.home_team?.name || 'Home');
  const awayTeam = typeof game.away_team === 'string' ? game.away_team : (game.away_team?.full_name || game.away_team?.name || 'Away');
  const homeTeamId = game.home_team_data?.id || game.home_team?.id;
  const awayTeamId = game.away_team_data?.id || game.away_team?.id;
  let gamePk = game.gamePk || null;
  const venue = game.venue || game._raw?.venue?.name || 'Unknown Venue';
  const gameDesc = game.description || '';
  const startTime = game.start_time || game.commence_time || '';

  console.log(`[Scout Report] Building MLB report: ${awayTeam} @ ${homeTeam}`);

  // Resolve MLB Stats API gamePk if not present (BDL games don't have it)
  if (!gamePk && startTime) {
    try {
      const { getMlbSchedule } = await import('../../../mlbStatsApiService.js');
      const gameDate = new Date(startTime).toISOString().split('T')[0];
      // Try both the game date and next day (UTC offset)
      for (const d of [gameDate, new Date(new Date(gameDate).getTime() + 86400000).toISOString().split('T')[0]]) {
        const schedule = await getMlbSchedule(d).catch(() => []);
        const match = schedule.find(g => {
          const hName = (g.teams?.home?.team?.name || '').toLowerCase();
          const aName = (g.teams?.away?.team?.name || '').toLowerCase();
          const homeLast = homeTeam.toLowerCase().split(' ').pop();
          const awayLast = awayTeam.toLowerCase().split(' ').pop();
          return hName.includes(homeLast) && aName.includes(awayLast);
        });
        if (match?.gamePk) { gamePk = match.gamePk; break; }
      }
      console.log(`[Scout Report] Resolved MLB Stats API gamePk: ${gamePk || 'not found'}`);
    } catch (e) {
      console.warn(`[Scout Report] gamePk resolution failed: ${e.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // RESOLVE BDL TEAM IDs (needed for structured standings + injuries)
  // ═══════════════════════════════════════════════════════════════════
  const [homeBdlTeam, awayBdlTeam] = await Promise.all([
    ballDontLieService.getTeamByNameGeneric('baseball_mlb', homeTeam).catch(e => {
      console.warn(`[Scout Report] BDL home team lookup error: ${e.message}`);
      return null;
    }),
    ballDontLieService.getTeamByNameGeneric('baseball_mlb', awayTeam).catch(e => {
      console.warn(`[Scout Report] BDL away team lookup error: ${e.message}`);
      return null;
    }),
  ]);
  const homeTeamBdlId = homeBdlTeam?.id || null;
  const awayTeamBdlId = awayBdlTeam?.id || null;
  console.log(`[Scout Report] BDL team IDs: ${homeTeam}=${homeTeamBdlId}, ${awayTeam}=${awayTeamBdlId}`);

  // ═══════════════════════════════════════════════════════════════════
  // PARALLEL DATA FETCH
  // ═══════════════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════════
  // CONSOLIDATED GROUNDING: 2 mega-queries instead of 6 small ones
  // Uses thinkingLevel 'low' — these are fact-retrieval, not reasoning
  // ═══════════════════════════════════════════════════════════════════
  const groundingOpts = { thinkingLevel: 'low', maxTokens: 1500 };
  const season = new Date().getFullYear();

  const [
    homeRoster,
    awayRoster,
    bdlStandings,
    bdlInjuries,
    probablePitchersData,
    homeRecentGames,
    awayRecentGames,
    gameContextGrounding,
    rosterStorylineGrounding,
    confirmedLineups,
  ] = await Promise.all([
    homeTeamId ? getTeamRoster(homeTeamId).catch(e => { console.warn(`[Scout Report] Home roster error: ${e.message}`); return []; }) : Promise.resolve([]),
    awayTeamId ? getTeamRoster(awayTeamId).catch(e => { console.warn(`[Scout Report] Away roster error: ${e.message}`); return []; }) : Promise.resolve([]),
    // BDL GOAT-tier standings (replaces mlbStatsApiService standings)
    ballDontLieService.getMlbStandings(season).catch(e => { console.warn(`[Scout Report] BDL Standings error: ${e.message}`); return []; }),
    // BDL structured injuries
    (homeTeamBdlId || awayTeamBdlId)
      ? ballDontLieService.getInjuriesGeneric('baseball_mlb', {
          team_ids: [homeTeamBdlId, awayTeamBdlId].filter(Boolean)
        }).catch(e => { console.warn(`[Scout Report] BDL Injuries error: ${e.message}`); return []; })
      : Promise.resolve([]),
    gamePk ? getProbablePitchers(gamePk).catch(e => { console.warn(`[Scout Report] Probable pitchers error: ${e.message}`); return null; }) : Promise.resolve(null),
    homeTeamId ? getMlbRecentGames(homeTeamId, 10).catch(e => { console.warn(`[Scout Report] Home recent games error: ${e.message}`); return []; }) : Promise.resolve([]),
    awayTeamId ? getMlbRecentGames(awayTeamId, 10).catch(e => { console.warn(`[Scout Report] Away recent games error: ${e.message}`); return []; }) : Promise.resolve([]),
    // MEGA-QUERY 1: Game context and preview (odds + lineups come from BDL API now)
    geminiGroundingSearch(
      `MLB 2026: ${awayTeam} vs ${homeTeam} game preview today. ` +
      `Key storylines, series context, and any breaking news for this matchup. ` +
      `Report facts only with names and details.`,
      groundingOpts
    ).then(r => r?.data || '').catch(() => ''),
    // MEGA-QUERY 2: Current state of each team — offseason moves, spring training, storylines
    geminiGroundingSearch(
      `MLB 2026: ${homeTeam} and ${awayTeam} current state heading into ${new Date().getMonth() <= 3 ? 'the start of the season' : 'tonight\'s game'}. ` +
      `Find ALL of the following: ` +
      `(1) ${homeTeam}: key offseason acquisitions, spring training standouts, manager/coaching changes, projected lineup and rotation, team outlook and expectations. ` +
      `(2) ${awayTeam}: same — offseason moves, spring training performance, roster changes, team outlook. ` +
      `(3) Any storylines, rivalries, or context for this specific matchup. ` +
      `Include player names, spring training stats where relevant, and concrete details.`,
      groundingOpts
    ).then(r => r?.data || '').catch(() => ''),
    // Lineups: BDL API (available pre-game, includes handedness + probable pitchers)
    (async () => {
      const gameId = game.id || game.gameId;
      if (!gameId) return null;
      const bdl = await ballDontLieService.getMlbLineups(gameId).catch(() => null);
      return bdl ? { source: 'bdl', data: bdl } : null;
    })(),
  ]);

  console.log(`[Scout Report] BDL standings: ${bdlStandings?.length || 0} teams, BDL injuries: ${bdlInjuries?.length || 0}`);

  // ═══════════════════════════════════════════════════════════════════
  // TEAM BATTING STATS (top 5 position players' MLB career stats)
  // ═══════════════════════════════════════════════════════════════════
  const [homeBatting, awayBatting] = await Promise.all([
    getTeamBattingStats(homeRoster).catch(() => null),
    getTeamBattingStats(awayRoster).catch(() => null),
  ]);

  // ═══════════════════════════════════════════════════════════════════
  // TEAM SEASON STATS (BDL GOAT-tier — batting + pitching aggregates)
  // ═══════════════════════════════════════════════════════════════════
  const [homeTeamStats, awayTeamStats] = await Promise.all([
    homeTeamBdlId ? ballDontLieService.getTeamSeasonStats('baseball_mlb', { teamId: homeTeamBdlId, season }).catch(() => null) : null,
    awayTeamBdlId ? ballDontLieService.getTeamSeasonStats('baseball_mlb', { teamId: awayTeamBdlId, season }).catch(() => null) : null,
  ]);
  console.log(`[Scout Report] MLB team season stats: ${homeTeam}=${homeTeamStats ? 'loaded' : 'N/A'}, ${awayTeam}=${awayTeamStats ? 'loaded' : 'N/A'}`);

  // ═══════════════════════════════════════════════════════════════════
  // BASEBALL SAVANT xSTATS (expected vs actual — regression indicators)
  // Try CURRENT season first, fall back to PRIOR year only if current is empty
  // (early in the season before enough samples accumulate).
  // ═══════════════════════════════════════════════════════════════════
  let [pitcherXStats, batterXStats] = await Promise.all([
    getPitcherXStats(season).catch(() => []),
    getBatterXStats(season).catch(() => []),
  ]);
  let xStatsSeason = season;
  // If current season has insufficient data (early-season cold start), fall back to prior year
  if (pitcherXStats.length < 50 || batterXStats.length < 100) {
    console.log(`[Scout Report] Savant xStats ${season} too sparse (${pitcherXStats.length}p / ${batterXStats.length}b) — falling back to ${season - 1}`);
    [pitcherXStats, batterXStats] = await Promise.all([
      getPitcherXStats(season - 1).catch(() => []),
      getBatterXStats(season - 1).catch(() => []),
    ]);
    xStatsSeason = season - 1;
  }
  console.log(`[Scout Report] Savant xStats: ${pitcherXStats.length} pitchers, ${batterXStats.length} batters (${xStatsSeason} season)`);

  // ═══════════════════════════════════════════════════════════════════
  // LAST 4 GAME BOX SCORES (BDL per-game stats for L1-L4 recaps)
  // ═══════════════════════════════════════════════════════════════════
  const homeGameIds = (homeRecentGames || []).slice(-4).map(g => g.id).filter(Boolean);
  const awayGameIds = (awayRecentGames || []).slice(-4).map(g => g.id).filter(Boolean);
  const allBoxGameIds = [...new Set([...homeGameIds, ...awayGameIds])];
  const recentBoxStats = allBoxGameIds.length > 0
    ? await ballDontLieService.getMlbGameStats({ gameIds: allBoxGameIds }).catch(e => { console.warn(`[Scout Report] BDL box stats error: ${e.message}`); return []; })
    : [];
  // Also fetch last game via MLB Stats API for the detailed box score (SP line, bullpen detail)
  const lastHomeGamePk = homeRecentGames?.[homeRecentGames.length - 1]?.gamePk;
  const lastAwayGamePk = awayRecentGames?.[awayRecentGames.length - 1]?.gamePk;
  const [lastHomeBoxScore, lastAwayBoxScore] = await Promise.all([
    lastHomeGamePk ? getGameBoxScore(lastHomeGamePk).catch(() => null) : null,
    lastAwayGamePk ? getGameBoxScore(lastAwayGamePk).catch(() => null) : null,
  ]);
  console.log(`[Scout Report] Box stats: ${recentBoxStats.length} player records for ${allBoxGameIds.length} games. MLB API box: ${homeTeam}=${lastHomeBoxScore ? 'Y' : 'N'}, ${awayTeam}=${lastAwayBoxScore ? 'Y' : 'N'}`);

  // ═══════════════════════════════════════════════════════════════════
  // PROBABLE PITCHERS + CAREER STATS
  // ═══════════════════════════════════════════════════════════════════
  let probablePitchersSection = 'Probable pitchers not yet announced.';
  const pitcherStats = {};

  if (probablePitchersData) {
    const parts = [];
    for (const [side, label] of [['away', awayTeam], ['home', homeTeam]]) {
      const pitcher = probablePitchersData[side];
      if (pitcher?.id) {
        const career = await getPlayerCareerStats(pitcher.id, 'pitching').catch(() => null);
        const statLine = career
          ? `${career.wins || 0}-${career.losses || 0}, ${career.era || '—'} ERA, ${career.strikeOuts || 0} K, ${career.whip || '—'} WHIP (MLB career)`
          : 'Career stats unavailable';
        parts.push(`${label}: ${pitcher.fullName || 'TBD'} — ${statLine}`);
        pitcherStats[side] = { name: pitcher.fullName, ...career };
      } else {
        parts.push(`${label}: TBD`);
      }
    }
    probablePitchersSection = parts.join('\n');
  }

  // ═══════════════════════════════════════════════════════════════════
  // ROSTERS — FORMAT KEY PLAYERS
  // ═══════════════════════════════════════════════════════════════════
  function formatRoster(roster, teamName) {
    if (!roster || roster.length === 0) return `${teamName}: Roster unavailable`;
    const pitchers = roster.filter(p => p.positionType === 'Pitcher');
    const position = roster.filter(p => p.positionType !== 'Pitcher');
    const lines = [`${teamName} (${roster.length} players)`];
    if (position.length > 0) {
      lines.push(`Position Players: ${position.map(p => `${p.name} (${p.position})`).join(', ')}`);
    }
    if (pitchers.length > 0) {
      lines.push(`Pitchers: ${pitchers.map(p => `${p.name} (${p.position})`).join(', ')}`);
    }
    return lines.join('\n');
  }

  // ═══════════════════════════════════════════════════════════════════
  // STANDINGS / DIVISION RECORD (BDL GOAT-tier structured data)
  // ═══════════════════════════════════════════════════════════════════
  let standingsSection = 'Division standings unavailable.';
  if (bdlStandings && bdlStandings.length > 0) {
    // Find which divisions the two teams belong to, show only those
    const homeLastWord = homeTeam.toLowerCase().split(' ').pop();
    const awayLastWord = awayTeam.toLowerCase().split(' ').pop();
    const relevantDivisions = new Set();
    for (const entry of bdlStandings) {
      const teamName = (entry.team?.display_name || entry.team?.full_name || '').toLowerCase();
      const abbr = (entry.team?.abbreviation || '').toLowerCase();
      if (teamName.includes(homeLastWord) || teamName.includes(awayLastWord) ||
          abbr === homeLastWord || abbr === awayLastWord) {
        relevantDivisions.add(entry.division_name || entry.team?.division || 'Division');
      }
    }
    // Group by division
    const divisionMap = {};
    for (const entry of bdlStandings) {
      const divName = entry.division_name || entry.team?.division || 'Division';
      if (relevantDivisions.size > 0 && !relevantDivisions.has(divName)) continue;
      if (!divisionMap[divName]) divisionMap[divName] = [];
      divisionMap[divName].push(entry);
    }
    const lines = [];
    for (const [divName, teams] of Object.entries(divisionMap)) {
      // Sort by wins descending (or win_percent)
      teams.sort((a, b) => (b.wins || 0) - (a.wins || 0));
      const teamLines = teams.map(t => {
        const w = t.wins || 0;
        const l = t.losses || 0;
        const name = t.team?.display_name || t.team?.abbreviation || 'Unknown';
        const home = t.home || '—';
        const road = t.road || '—';
        const l10 = t.last_ten_games || '—';
        const streak = t.streak || '—';
        const gb = t.division_games_behind ?? t.games_behind ?? '—';
        return `  ${name}: ${w}-${l} (Home: ${home} | Away: ${road} | L10: ${l10} | Streak: ${streak} | GB: ${gb})`;
      }).join('\n');
      if (teamLines) lines.push(`${divName}\n${teamLines}`);
    }
    if (lines.length > 0) standingsSection = lines.join('\n\n');
  }

  // ═══════════════════════════════════════════════════════════════════
  // L1-L4: INDIVIDUAL GAME RECAPS (what actually happened — narrative box scores)
  // L5/L10: STATISTICAL AGGREGATES (trend lines)
  // ═══════════════════════════════════════════════════════════════════
  let recentPerformanceSection = '';
  {
    const lastWord = (name) => name.toLowerCase().split(' ').pop();

    // Build per-game recap from BDL box stats + game result
    const formatGameRecap = (game, teamName, boxStats) => {
      if (!game) return null;
      const tLast = lastWord(teamName);
      const homeName = (game.teams?.home?.team?.name || '').toLowerCase();
      const isHome = homeName.includes(tLast);
      const teamScore = isHome ? (game.teams?.home?.score ?? 0) : (game.teams?.away?.score ?? 0);
      const oppScore = isHome ? (game.teams?.away?.score ?? 0) : (game.teams?.home?.score ?? 0);
      const oppName = isHome ? (game.teams?.away?.team?.name || 'Opp') : (game.teams?.home?.team?.name || 'Opp');
      const wl = teamScore > oppScore ? 'W' : 'L';
      const date = (game.officialDate || game.gameDate || '').split('T')[0];
      const loc = isHome ? 'vs' : '@';

      // Find box stats for this game
      const gameStats = boxStats.filter(s => s.game_id === game.id);
      let spLine = '';
      let bullpenLines = [];
      let keyHitters = [];

      if (gameStats.length > 0) {
        // All pitchers sorted by IP (starter first, then bullpen in order of appearance)
        const pitchers = gameStats.filter(s => s.ip != null && parseFloat(s.ip) > 0)
          .sort((a, b) => parseFloat(b.ip || 0) - parseFloat(a.ip || 0));
        if (pitchers[0]) {
          const sp = pitchers[0];
          spLine = `SP: ${sp.player?.last_name || '?'} ${sp.ip}IP ${sp.p_hits || 0}H ${sp.er || 0}ER ${sp.p_k || 0}K ${sp.p_bb || 0}BB${sp.p_hr ? ' ' + sp.p_hr + 'HR' : ''}`;
        }
        // Full bullpen — every reliever who pitched
        for (const rp of pitchers.slice(1)) {
          bullpenLines.push(`${rp.player?.last_name || '?'} ${rp.ip}IP ${rp.er || 0}ER ${rp.p_k || 0}K`);
        }
        // Full batting lineup — every hitter who had an at-bat, in batting order
        const hitters = gameStats.filter(s => s.at_bats != null && s.at_bats > 0)
          .sort((a, b) => (b.total_bases || 0) - (a.total_bases || 0));
        for (const h of hitters) {
          let extras = [];
          if (h.hr > 0) extras.push(`${h.hr}HR`);
          if (h.doubles > 0) extras.push(`${h.doubles}2B`);
          if (h.rbi > 0) extras.push(`${h.rbi}RBI`);
          if (h.runs > 0) extras.push(`${h.runs}R`);
          if (h.bb > 0) extras.push(`${h.bb}BB`);
          if (h.k > 0) extras.push(`${h.k}K`);
          if (h.stolen_bases > 0) extras.push(`${h.stolen_bases}SB`);
          keyHitters.push(`${h.player?.last_name || '?'} ${h.hits}-${h.at_bats}${extras.length ? ' ' + extras.join(' ') : ''}`);
        }
      }

      let recap = `  ${date}: ${wl} ${teamScore}-${oppScore} ${loc} ${oppName}`;
      if (spLine) recap += `\n    ${spLine}`;
      if (bullpenLines.length) recap += `\n    Bullpen: ${bullpenLines.join(' | ')}`;
      if (keyHitters.length) recap += `\n    Batting: ${keyHitters.join(' | ')}`;
      return recap;
    };

    // L5/L10 aggregate
    const aggregateGames = (games, teamName, count) => {
      if (!games || games.length === 0) return null;
      const slice = games.slice(-count);
      let wins = 0, losses = 0, runsFor = 0, runsAgainst = 0;
      const tLast = lastWord(teamName);
      for (const g of slice) {
        const homeName = (g.teams?.home?.team?.name || '').toLowerCase();
        const homeScore = g.teams?.home?.score ?? 0;
        const awayScore = g.teams?.away?.score ?? 0;
        const isHome = homeName.includes(tLast);
        if (isHome) {
          runsFor += homeScore; runsAgainst += awayScore;
          homeScore > awayScore ? wins++ : losses++;
        } else {
          runsFor += awayScore; runsAgainst += homeScore;
          awayScore > homeScore ? wins++ : losses++;
        }
      }
      const gp = slice.length;
      return gp > 0 ? `${wins}-${losses} (${(runsFor / gp).toFixed(1)} R/G, ${(runsAgainst / gp).toFixed(1)} RA/G)` : null;
    };

    const formatTeamRecent = (teamName, games) => {
      if (!games || games.length === 0) return `${teamName}: No recent games`;
      const lines = [`${teamName}:`];
      // L1-L4: individual game recaps (most recent first)
      const last4 = games.slice(-4).reverse();
      for (let i = 0; i < last4.length; i++) {
        const recap = formatGameRecap(last4[i], teamName, recentBoxStats);
        if (recap) lines.push(`  [L${i + 1}]${recap.trim().startsWith(' ') ? recap : ' ' + recap.trim()}`);
      }
      // L5/L10: aggregates
      const l5 = aggregateGames(games, teamName, 5);
      const l10 = aggregateGames(games, teamName, 10);
      if (l5) lines.push(`  [L5 aggregate] ${l5}`);
      if (l10) lines.push(`  [L10 aggregate] ${l10}`);
      return lines.join('\n');
    };

    recentPerformanceSection = [formatTeamRecent(homeTeam, homeRecentGames), formatTeamRecent(awayTeam, awayRecentGames)].join('\n\n');
  }

  // ═══════════════════════════════════════════════════════════════════
  // RECENT RESULTS (last 10 games for each team — individual game scores)
  // ═══════════════════════════════════════════════════════════════════
  let recentResults = 'No recent games available.';
  {
    const formatRecentGames = (games, teamName) => {
      if (!games || games.length === 0) return `${teamName}: No recent games`;
      const lines = games.map(g => {
        const home = g.teams?.home;
        const away = g.teams?.away;
        const date = g.officialDate || g.gameDate?.split('T')[0] || '';
        return `  ${date}: ${away?.team?.name} ${away?.score || 0} @ ${home?.team?.name} ${home?.score || 0}`;
      });
      return `${teamName} (Last ${games.length}):\n${lines.join('\n')}`;
    };
    const parts = [];
    parts.push(formatRecentGames(homeRecentGames, homeTeam));
    parts.push(formatRecentGames(awayRecentGames, awayTeam));
    recentResults = parts.join('\n\n');
  }

  // ═══════════════════════════════════════════════════════════════════
  // REST & SCHEDULE SITUATION
  // ═══════════════════════════════════════════════════════════════════
  let restScheduleSection = '';
  {
    const formatRestSchedule = (teamName, recentGames, opponentName) => {
      if (!recentGames || recentGames.length === 0) {
        return `${teamName}: Schedule data unavailable`;
      }
      const parts = [];

      // Most recent completed game
      const lastGame = recentGames[recentGames.length - 1];
      const lastGameDate = lastGame?.officialDate || lastGame?.gameDate?.split('T')[0] || null;
      const today = new Date().toISOString().split('T')[0];

      // Days rest
      if (lastGameDate) {
        const diff = Math.floor((new Date(today) - new Date(lastGameDate)) / (1000 * 60 * 60 * 24));
        if (diff === 0) {
          parts.push('played today');
        } else if (diff === 1) {
          parts.push('0 days rest (played yesterday)');
        } else {
          parts.push(`${diff - 1} day(s) rest`);
        }
      } else {
        parts.push('rest data unavailable');
      }

      // Series detection — count consecutive recent games vs the same opponent (today's opponent)
      // Walk backwards through recent games to find how many were against today's opponent
      const oppLastWord = opponentName.toLowerCase().split(' ').pop();
      let seriesGames = 0;
      for (let i = recentGames.length - 1; i >= 0; i--) {
        const g = recentGames[i];
        const homeT = (g?.teams?.home?.team?.name || '').toLowerCase();
        const awayT = (g?.teams?.away?.team?.name || '').toLowerCase();
        if (homeT.includes(oppLastWord) || awayT.includes(oppLastWord)) {
          seriesGames++;
        } else {
          break;
        }
      }

      if (seriesGames > 0) {
        // They've already played seriesGames games vs this opponent recently, so today is game seriesGames+1
        parts.push(`Game ${seriesGames + 1} of series vs ${opponentName}`);
      } else {
        parts.push(`Game 1 of series vs ${opponentName}`);
      }

      return `${teamName}: ${parts.join('. ')}.`;
    };

    const homeRest = formatRestSchedule(homeTeam, homeRecentGames, awayTeam);
    const awayRest = formatRestSchedule(awayTeam, awayRecentGames, homeTeam);
    restScheduleSection = `${homeRest}\n${awayRest}`;
  }

  // ═══════════════════════════════════════════════════════════════════
  // LAST GAME (DETAILED — full box score from most recent completed game)
  // ═══════════════════════════════════════════════════════════════════
  let lastGameSection = '';
  {
    /**
     * Format a detailed box score for a team's last game.
     * Uses MLB Stats API boxscore data (teams.home/away.players with stats.pitching / stats.batting).
     */
    const formatDetailedLastGame = (teamName, recentGames, boxScoreData) => {
      if (!recentGames || recentGames.length === 0) {
        return `${teamName}: No recent game data`;
      }
      const lastGame = recentGames[recentGames.length - 1];
      const homeT = lastGame?.teams?.home;
      const awayT = lastGame?.teams?.away;
      if (!homeT || !awayT) return `${teamName}: Last game data incomplete`;

      const homeScore = homeT.score ?? '?';
      const awayScore = awayT.score ?? '?';
      const homeName = homeT.team?.name || 'Home';
      const awayName = awayT.team?.name || 'Away';
      const date = lastGame.officialDate || lastGame.gameDate?.split('T')[0] || '';
      const dateFormatted = date ? new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

      // Determine if this team was home or away, and W/L
      const teamLastWord = teamName.toLowerCase().split(' ').pop();
      const wasHome = homeName.toLowerCase().includes(teamLastWord);
      const teamScore = wasHome ? homeScore : awayScore;
      const oppScore = wasHome ? awayScore : homeScore;
      const oppName = wasHome ? awayName : homeName;
      const result = teamScore > oppScore ? 'W' : teamScore < oppScore ? 'L' : 'T';
      const prefix = wasHome ? 'vs' : '@';

      // Header line
      const headerLine = `${teamName}: ${result} ${teamScore}-${oppScore} ${prefix} ${oppName} (${dateFormatted})`;

      // If no box score data, fall back to basic line
      if (!boxScoreData) {
        return headerLine;
      }

      // Extract this team's side from the box score
      const teamSide = wasHome ? 'home' : 'away';
      const teamBoxData = boxScoreData.teams?.[teamSide];
      if (!teamBoxData) return headerLine;

      const players = teamBoxData.players || {};
      const pitcherIds = teamBoxData.pitchers || [];
      const batterIds = teamBoxData.batters || [];

      // ── Starting Pitcher (first pitcher listed) ──
      let spLine = '';
      const relievers = [];
      for (let i = 0; i < pitcherIds.length; i++) {
        const p = players[`ID${pitcherIds[i]}`];
        if (!p) continue;
        const pStats = p.stats?.pitching;
        if (!pStats || (pStats.inningsPitched === '0.0' && !pStats.outs)) continue;
        const name = p.person?.fullName?.split(' ').pop() || p.person?.fullName || 'Unknown';
        const ip = pStats.inningsPitched || '0.0';
        const h = pStats.hits ?? 0;
        const r = pStats.runs ?? 0;
        const er = pStats.earnedRuns ?? 0;
        const bb = pStats.baseOnBalls ?? 0;
        const k = pStats.strikeOuts ?? 0;

        if (i === 0) {
          // Starting pitcher — full line
          spLine = `  SP: ${name} ${ip} IP, ${h}H, ${er}ER, ${bb}BB, ${k}K`;
        } else {
          // Reliever — compact line
          const sv = pStats.saves > 0 ? ' (SV)' : '';
          const hld = pStats.holds > 0 ? ' (HLD)' : '';
          const bs = pStats.blownSaves > 0 ? ' (BS)' : '';
          const tag = sv || hld || bs;
          relievers.push(`${name} ${ip} IP, ${er}ER${tag}`);
        }
      }

      // ── Bullpen line ──
      let bullpenLine = '';
      if (relievers.length > 0) {
        bullpenLine = `  Bullpen: ${relievers.join(' | ')}`;
      }

      // ── Key Hitters (anyone with 1+ hits) ──
      const hitters = [];
      for (const batterId of batterIds) {
        const p = players[`ID${batterId}`];
        if (!p) continue;
        const bStats = p.stats?.batting;
        if (!bStats) continue;
        const hits = parseInt(bStats.hits) || 0;
        const ab = parseInt(bStats.atBats) || 0;
        if (hits === 0 || ab === 0) continue;
        const name = p.person?.fullName?.split(' ').pop() || p.person?.fullName || 'Unknown';
        const hr = parseInt(bStats.homeRuns) || 0;
        const rbi = parseInt(bStats.rbi) || 0;
        const bb = parseInt(bStats.baseOnBalls) || 0;
        const doubles = parseInt(bStats.doubles) || 0;
        const triples = parseInt(bStats.triples) || 0;
        const sb = parseInt(bStats.stolenBases) || 0;

        let extras = '';
        if (hr > 0) extras += ` ${hr}HR`;
        if (rbi > 0) extras += ` ${rbi}RBI`;
        if (doubles > 0) extras += ` ${doubles}2B`;
        if (triples > 0) extras += ` ${triples}3B`;
        if (bb > 0) extras += ` ${bb}BB`;
        if (sb > 0) extras += ` ${sb}SB`;

        hitters.push({ name, hits, ab, extras: extras.trim(), totalBases: hits + doubles + triples * 2 + hr * 3 });
      }
      // Sort by total bases descending (most impactful hitters first)
      hitters.sort((a, b) => b.totalBases - a.totalBases);
      const keyHittersLine = hitters.length > 0
        ? `  Key Hitters: ${hitters.slice(0, 6).map(h => `${h.name} ${h.hits}-${h.ab}${h.extras ? ' ' + h.extras : ''}`).join(' | ')}`
        : '  Key Hitters: None (0 hits)';

      // ── Team Totals (from linescore if available) ──
      const linescore = lastGame.linescore?.teams?.[teamSide];
      let totalsLine = '';
      if (linescore) {
        const runs = linescore.runs ?? teamScore;
        const totalHits = linescore.hits ?? '?';
        const errors = linescore.errors ?? '?';
        totalsLine = `  Team: ${runs}R, ${totalHits}H, ${errors}E`;
      }

      // Assemble
      const lines = [headerLine];
      if (spLine) lines.push(spLine);
      if (bullpenLine) lines.push(bullpenLine);
      lines.push(keyHittersLine);
      if (totalsLine) lines.push(totalsLine);
      return lines.join('\n');
    };

    const homeLast = formatDetailedLastGame(homeTeam, homeRecentGames, lastHomeBoxScore);
    const awayLast = formatDetailedLastGame(awayTeam, awayRecentGames, lastAwayBoxScore);
    lastGameSection = `${homeLast}\n\n${awayLast}`;
  }

  // ═══════════════════════════════════════════════════════════════════
  // WEATHER / VENUE CONTEXT
  // ═══════════════════════════════════════════════════════════════════
  let weatherSection = '';
  if (probablePitchersData?.weather) {
    const w = probablePitchersData.weather;
    weatherSection = `Weather: ${w.condition || 'Unknown'}, ${w.temp || '—'}°F, Wind: ${w.wind || 'Unknown'}`;
  }

  // ═══════════════════════════════════════════════════════════════════
  // ODDS (BDL structured odds preferred, Gemini Grounding fallback)
  // ═══════════════════════════════════════════════════════════════════
  let oddsSection = '';
  // Use structured BDL odds if available on the game object
  if (game.moneyline_home != null || game.moneyline_away != null) {
    const lines = [];
    if (game.moneyline_home != null && game.moneyline_away != null) {
      lines.push(`Moneyline: ${homeTeam} ${game.moneyline_home > 0 ? '+' : ''}${game.moneyline_home} / ${awayTeam} ${game.moneyline_away > 0 ? '+' : ''}${game.moneyline_away}`);
    }
    if (game.spread_home != null) {
      lines.push(`Run Line: ${homeTeam} ${game.spread_home > 0 ? '+' : ''}${game.spread_home} (${game.spread_home_odds || ''}) / ${awayTeam} ${game.spread_away > 0 ? '+' : ''}${game.spread_away} (${game.spread_away_odds || ''})`);
    }
    oddsSection = lines.join('\n');
    console.log(`[Scout Report] MLB: Using structured BDL odds`);
  } else if (gameContextGrounding) {
    oddsSection = '(See Game Context section below — odds included in grounding results)';
    console.log(`[Scout Report] MLB: Odds included in consolidated grounding`);
  } else {
    oddsSection = 'No odds data available.';
  }

  // ═══════════════════════════════════════════════════════════════════
  // INJURIES (BDL structured data with freshness labels)
  // ═══════════════════════════════════════════════════════════════════
  let injuriesSection = '';
  if (bdlInjuries && bdlInjuries.length > 0) {
    const now = new Date();
    const homeInjuries = [];
    const awayInjuries = [];

    for (const inj of bdlInjuries) {
      const playerName = inj.player?.full_name || `${inj.player?.first_name || ''} ${inj.player?.last_name || ''}`.trim();
      const position = inj.player?.position || '—';
      const injuryType = inj.type || inj.detail || 'Unknown';
      const side = inj.side ? ` (${inj.side})` : '';
      const status = inj.status || 'Unknown';
      const comment = inj.short_comment || inj.long_comment || '';

      // Calculate days since injury for freshness label
      const injuryDate = inj.date ? new Date(inj.date) : null;
      const daysSince = injuryDate ? Math.floor((now - injuryDate) / (1000 * 60 * 60 * 24)) : null;

      // Apply duration labels
      // MLB simplified 3-tier injury labels (does not affect other sports)
      let label = 'KNOWN';
      if (daysSince !== null) {
        if (daysSince <= 3) {
          label = 'NEW';
        } else {
          label = 'KNOWN';
        }
      }
      // SP SCRATCH detection — pitcher position + very recent + "scratched" or "out" status
      const isPitcher = (position || '').toLowerCase().includes('pitcher') || (position || '').toLowerCase() === 'p';
      const isScratched = (status || '').toLowerCase().includes('scratch') ||
                          ((status || '').toLowerCase().includes('out') && isPitcher && daysSince !== null && daysSince <= 1);
      if (isPitcher && isScratched) {
        label = 'SP SCRATCH';
      }

      const dateStr = injuryDate ? injuryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
      const daysSinceStr = daysSince !== null ? ` — ${daysSince}d ago` : '';
      const formatted = `[${label}] ${playerName} (${position}) — ${injuryType}${side}: ${comment || status}${dateStr ? ` (${dateStr}${daysSinceStr})` : ''}`;

      // Assign to home or away based on player team
      const playerTeamId = inj.player?.team?.id || inj.team?.id;
      if (playerTeamId === homeTeamBdlId) {
        homeInjuries.push(formatted);
      } else if (playerTeamId === awayTeamBdlId) {
        awayInjuries.push(formatted);
      } else {
        // Fallback: try matching team name
        const playerTeamName = (inj.player?.team?.display_name || inj.player?.team?.full_name || '').toLowerCase();
        if (playerTeamName.includes(homeTeam.toLowerCase().split(' ').pop())) {
          homeInjuries.push(formatted);
        } else {
          awayInjuries.push(formatted);
        }
      }
    }

    const parts = [];
    if (homeInjuries.length > 0) parts.push(`${homeTeam}:\n${homeInjuries.map(i => `  ${i}`).join('\n')}`);
    if (awayInjuries.length > 0) parts.push(`${awayTeam}:\n${awayInjuries.map(i => `  ${i}`).join('\n')}`);
    if (parts.length > 0) {
      injuriesSection = parts.join('\n\n');
      console.log(`[Scout Report] MLB BDL injuries: ${homeInjuries.length} ${homeTeam}, ${awayInjuries.length} ${awayTeam}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // CONFIRMED LINEUPS — BDL API (pre-game, includes handedness + probable pitchers)
  // ═══════════════════════════════════════════════════════════════════
  let confirmedLineupsSection = 'Lineups not yet posted — check closer to game time.';
  if (confirmedLineups?.source === 'bdl' && confirmedLineups.data) {
    const homeAbbr = game.home_team?.abbreviation || game.home_team_data?.abbreviation || '';
    const awayAbbr = game.away_team?.abbreviation || game.away_team_data?.abbreviation || '';
    const homeData = confirmedLineups.data[homeAbbr] || Object.values(confirmedLineups.data).find(t => t.teamName?.toLowerCase().includes(homeTeam.toLowerCase().split(' ').pop()));
    const awayData = confirmedLineups.data[awayAbbr] || Object.values(confirmedLineups.data).find(t => t.teamName?.toLowerCase().includes(awayTeam.toLowerCase().split(' ').pop()));

    const formatBdl = (teamData, teamName) => {
      if (!teamData || teamData.batters.length === 0) return `${teamName}: Not yet posted`;
      let out = `${teamName}:\n`;
      out += teamData.batters.map(b => `  ${b.battingOrder}. ${b.name} (${b.position}) [Bats: ${b.batsThrows?.split('/')[0] || '?'}]`).join('\n');
      if (teamData.pitcher) out += `\n  SP: ${teamData.pitcher.name} (Throws: ${teamData.pitcher.batsThrows?.split('/')[1] || '?'})`;
      return out;
    };
    confirmedLineupsSection = [formatBdl(homeData, homeTeam), formatBdl(awayData, awayTeam)].join('\n\n');
    console.log(`[Scout Report] MLB lineups from BDL: ${homeTeam}=${homeData?.batters?.length || 0} batters, ${awayTeam}=${awayData?.batters?.length || 0} batters`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // TEAM SEASON STATS — FORMAT COMPARISON SECTION
  // ═══════════════════════════════════════════════════════════════════
  let teamSeasonStatsSection = '';
  {
    const fmtBattingLine = (teamName, stats) => {
      if (!stats) return `${teamName}: Team season stats unavailable`;
      const avg = stats.batting_avg != null ? parseFloat(stats.batting_avg).toFixed(3) : '—';
      const ops = stats.batting_ops != null ? parseFloat(stats.batting_ops).toFixed(3) : '—';
      const gp = stats.gp || 1;
      const runsTotal = stats.batting_r ?? stats.batting_runs ?? null;
      const rpg = runsTotal != null ? (parseFloat(runsTotal) / gp).toFixed(1) : '—';
      const era = stats.pitching_era != null ? parseFloat(stats.pitching_era).toFixed(2) : '—';
      const whip = stats.pitching_whip != null ? parseFloat(stats.pitching_whip).toFixed(2) : '—';
      // K/9: use pitching_k_per_9 if available, else calculate from pitching_k / pitching_ip * 9
      let k9 = '—';
      if (stats.pitching_k_per_9 != null) {
        k9 = parseFloat(stats.pitching_k_per_9).toFixed(1);
      } else if (stats.pitching_k != null && stats.pitching_ip != null && parseFloat(stats.pitching_ip) > 0) {
        k9 = (parseFloat(stats.pitching_k) / parseFloat(stats.pitching_ip) * 9).toFixed(1);
      }
      return `${teamName}: ${avg} AVG / ${ops} OPS / ${rpg} R/G | Pitching: ${era} ERA / ${whip} WHIP / ${k9} K/9`;
    };
    if (homeTeamStats || awayTeamStats) {
      teamSeasonStatsSection = [
        fmtBattingLine(homeTeam, homeTeamStats),
        fmtBattingLine(awayTeam, awayTeamStats),
      ].join('\n');
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // xSTATS — EXPECTED VS ACTUAL (Baseball Savant, regression indicators)
  // ═══════════════════════════════════════════════════════════════════
  let xStatsSection = '';
  {
    const findXStats = (data, name) => {
      if (!name || !data.length) return null;
      const lastName = name.split(' ').pop()?.toLowerCase();
      const firstName = name.split(' ')[0]?.toLowerCase();
      return data.find(p => {
        const pLast = (p.last_name || '').toLowerCase();
        const pFirst = (p.first_name || '').toLowerCase();
        return pLast === lastName && (pFirst.startsWith(firstName?.substring(0, 3)) || firstName?.startsWith(pFirst.substring(0, 3)));
      }) || data.find(p => (p.last_name || '').toLowerCase() === lastName) || null;
    };

    const lines = [];

    // Probable pitcher xStats
    const awaySPName = pitcherStats.away?.name || probablePitchersData?.away?.fullName;
    const homeSPName = pitcherStats.home?.name || probablePitchersData?.home?.fullName;
    const awaySPx = findXStats(pitcherXStats,awaySPName);
    const homeSPx = findXStats(pitcherXStats,homeSPName);
    if (awaySPx || homeSPx) {
      lines.push('Starting Pitchers (expected vs actual):');
      if (awaySPx) lines.push(`  ${awaySPName}: ERA ${awaySPx.era} vs xERA ${awaySPx.xera} (${awaySPx.era_minus_xera_diff > 0 ? 'underperforming' : 'overperforming'} by ${Math.abs(awaySPx.era_minus_xera_diff).toFixed(2)}) | opp wOBA ${awaySPx.woba} vs xwOBA ${awaySPx.est_woba}`);
      if (homeSPx) lines.push(`  ${homeSPName}: ERA ${homeSPx.era} vs xERA ${homeSPx.xera} (${homeSPx.era_minus_xera_diff > 0 ? 'underperforming' : 'overperforming'} by ${Math.abs(homeSPx.era_minus_xera_diff).toFixed(2)}) | opp wOBA ${homeSPx.woba} vs xwOBA ${homeSPx.est_woba}`);
    }

    // Key batter xStats (top 3 per team from roster if available)
    for (const [teamName, roster] of [[homeTeam, homeRoster], [awayTeam, awayRoster]]) {
      const hitters = (roster || []).filter(p => p.positionType !== 'Pitcher').slice(0, 4);
      const xLines = [];
      for (const h of hitters) {
        const x = findXStats(batterXStats,h.name);
        if (x) {
          const diff = (x.est_woba - x.woba).toFixed(3);
          const direction = diff > 0 ? 'unlucky' : 'lucky';
          xLines.push(`  ${h.name}: BA ${x.ba} vs xBA ${x.est_ba} | SLG ${x.slg} vs xSLG ${x.est_slg} (${direction} by ${Math.abs(diff)} wOBA)`);
        }
      }
      if (xLines.length > 0) {
        lines.push(`${teamName} Key Hitters (expected vs actual):`);
        lines.push(...xLines);
      }
    }

    if (lines.length > 0) {
      xStatsSection = lines.join('\n');
      console.log(`[Scout Report] Savant xStats section: ${lines.length} lines`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // SERIES CONTEXT (simple one-liner for the header)
  // ═══════════════════════════════════════════════════════════════════
  let seriesLine = '';
  {
    // Detect current series by looking at recent games between these two teams
    const homeLast = lastWord(homeTeam);
    const awayLast = lastWord(awayTeam);
    const recentAll = [...(homeRecentGames || [])].reverse(); // most recent first
    let seriesGames = 0;
    let homeWins = 0;
    let awayWins = 0;
    for (const g of recentAll) {
      const hName = (g.teams?.home?.team?.name || '').toLowerCase();
      const aName = (g.teams?.away?.team?.name || '').toLowerCase();
      const isSeriesGame = (hName.includes(homeLast) && aName.includes(awayLast)) ||
                           (hName.includes(awayLast) && aName.includes(homeLast));
      if (!isSeriesGame) break;
      seriesGames++;
      const hScore = g.teams?.home?.score ?? 0;
      const aScore = g.teams?.away?.score ?? 0;
      if (hName.includes(homeLast)) {
        hScore > aScore ? homeWins++ : awayWins++;
      } else {
        aScore > hScore ? homeWins++ : awayWins++;
      }
    }
    if (seriesGames > 0) {
      const gameNum = seriesGames + 1; // tonight is the next game
      seriesLine = `Series: Game ${gameNum} | ${homeTeam} ${homeWins}-${awayWins} ${awayTeam}`;
    }
  }

  // Helper used above
  function lastWord(name) { return (name || '').toLowerCase().split(' ').pop(); }

  // ═══════════════════════════════════════════════════════════════════
  // ASSEMBLE REPORT
  // ═══════════════════════════════════════════════════════════════════
  const text = `
══════════════════════════════════════════════════════════════════
MATCHUP: ${awayTeam} @ ${homeTeam}
${gameDesc ? `Context: ${gameDesc}` : ''}
Venue: ${typeof venue === 'string' ? venue : venue?.name || 'Unknown'}
${startTime ? `Start: ${new Date(startTime).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' })} ET` : ''}
${seriesLine ? seriesLine : ''}
${weatherSection}
${season === new Date().getFullYear() && new Date().getMonth() <= 3 ? `\nNOTE: Early season — the ${season} regular season is just beginning. Player and team stats below reflect ${season - 1} season numbers (last year) since no ${season} regular season games have been played yet. These are the same rosters (with offseason moves) but last year's production. Spring training performance and offseason changes are covered in the GAME CONTEXT and SEASON CONTEXT sections via live reporting. Opening Day has inherent uncertainty — no angle is a bad one, and any reasoning is valid.` : ''}
══════════════════════════════════════════════════════════════════

═══ PROBABLE PITCHERS ═══
${probablePitchersSection}

═══ CONFIRMED LINEUPS ═══
${confirmedLineupsSection}

═══ BETTING CONTEXT ═══
${oddsSection}

═══ DIVISION STANDINGS (BDL) ═══
${standingsSection}

═══ TEAM ${new Date().getMonth() <= 3 ? (season - 1) + ' ' : ''}SEASON STATS (BDL${new Date().getMonth() <= 3 ? ' — last season, similar roster' : ''}) ═══
${teamSeasonStatsSection || 'No team season stats available.'}

═══ EXPECTED VS ACTUAL (Baseball Savant xStats${xStatsSeason !== season ? ` — ${xStatsSeason} season` : ''}) ═══
${xStatsSection || 'No xStats data available.'}

═══ INJURIES (BDL Structured) ═══
${injuriesSection || 'No structured injury data available.'}

═══ RECENT PERFORMANCE (L1/L3/L5/L10) ═══
${recentPerformanceSection || 'No recent performance data.'}

═══ RECENT RESULTS ═══
${recentResults}

═══ REST & SCHEDULE SITUATION ═══
${restScheduleSection}

═══ LAST GAME (MLB Stats API — inning detail) ═══
${lastGameSection}

═══ GAME CONTEXT (odds, preview, pitchers) ═══
${gameContextGrounding || 'No game context available.'}

═══ SEASON CONTEXT (form, standings, player backgrounds) ═══
${rosterStorylineGrounding || 'No season context available.'}

═══ ROSTERS ═══
${formatRoster(homeRoster, homeTeam)}

${formatRoster(awayRoster, awayTeam)}
`.trim();

  // Token menu for Flash
  const tokenMenu = formatTokenMenu('MLB');

  // Tale of Tape (12-15 rows: SP pitching + team batting + season record)
  // Must return { text, rows } to match buildVerifiedTaleOfTape() format used by all other sports
  const tapeRows = [];
  const fmtNum = (v, d = 3) => { if (v == null) return '—'; const n = parseFloat(v); return isNaN(n) ? '—' : n.toFixed(d); };
  const fmtInt = (v) => { if (v == null) return '—'; const n = parseInt(v); return isNaN(n) ? '—' : String(n); };

  // Season Record — from BDL GOAT-tier standings
  {
    const findBdlTeamStanding = (teamName) => {
      if (!bdlStandings || bdlStandings.length === 0) return null;
      const lastWord = teamName.toLowerCase().split(' ').pop();
      return bdlStandings.find(s => {
        const name = (s.team?.display_name || s.team?.full_name || '').toLowerCase();
        const abbr = (s.team?.abbreviation || '').toLowerCase();
        return name.includes(lastWord) || abbr === lastWord;
      }) || null;
    };
    const homeBdlStanding = findBdlTeamStanding(homeTeam);
    const awayBdlStanding = findBdlTeamStanding(awayTeam);

    // Record — uses BDL `total` field (e.g., "94-68") or falls back to wins-losses
    const homeRecord = homeBdlStanding?.total || (homeBdlStanding ? `${homeBdlStanding.wins || 0}-${homeBdlStanding.losses || 0}` : '—');
    const awayRecord = awayBdlStanding?.total || (awayBdlStanding ? `${awayBdlStanding.wins || 0}-${awayBdlStanding.losses || 0}` : '—');
    tapeRows.push({ name: 'Record', token: 'RECORD', away: { team: awayTeam, value: awayRecord }, home: { team: homeTeam, value: homeRecord } });

    // L10 Record — uses BDL `last_ten_games` field (e.g., "5-5")
    const homeL10 = homeBdlStanding?.last_ten_games || '—';
    const awayL10 = awayBdlStanding?.last_ten_games || '—';
    tapeRows.push({ name: 'L10 Record', token: 'L10_RECORD', away: { team: awayTeam, value: awayL10 }, home: { team: homeTeam, value: homeL10 } });

    // Home/Away Record — uses BDL `home` and `road` fields
    const homeAtHome = homeBdlStanding?.home || '—';
    const awayOnRoad = awayBdlStanding?.road || '—';
    tapeRows.push({ name: 'Home/Away', token: 'HOME_AWAY_RECORD', away: { team: awayTeam, value: `Away: ${awayOnRoad}` }, home: { team: homeTeam, value: `Home: ${homeAtHome}` } });
  }

  // Starting Pitcher names — last name only for clean display
  {
    const getLastName = (fullName) => fullName?.split(' ').pop() || fullName;
    const awaySPName = getLastName(pitcherStats.away?.name || probablePitchersData?.away?.fullName);
    const homeSPName = getLastName(pitcherStats.home?.name || probablePitchersData?.home?.fullName);
    if (awaySPName && homeSPName) {
      tapeRows.push({ name: 'Starter', token: 'SP_NAME', away: { team: awayTeam, value: awaySPName }, home: { team: homeTeam, value: homeSPName } });
    }
  }

  // NOTE: Moneyline, Run Line, and Venue are shown on the pick card front — not in the tape

  // Starting Pitcher stats — only include rows where BOTH pitchers have that stat
  // Pitchers without career stats return null; one-sided "—" rows are useless
  {
    const awayP = pitcherStats.away || {};
    const homeP = pitcherStats.home || {};
    const pushIfBoth = (name, token, awayVal, homeVal) => {
      if (awayVal !== '—' && homeVal !== '—') {
        tapeRows.push({ name, token, away: { team: awayTeam, value: awayVal }, home: { team: homeTeam, value: homeVal } });
      }
    };
    pushIfBoth('SP ERA', 'SP_ERA', fmtNum(awayP.era, 2), fmtNum(homeP.era, 2));
    pushIfBoth('SP WHIP', 'SP_WHIP', fmtNum(awayP.whip, 2), fmtNum(homeP.whip, 2));
    pushIfBoth('SP K/9', 'SP_K9', fmtNum(awayP.strikeoutsPer9Inn, 1), fmtNum(homeP.strikeoutsPer9Inn, 1));
    pushIfBoth('SP BB/9', 'SP_BB9', fmtNum(awayP.walksPer9Inn, 1), fmtNum(homeP.walksPer9Inn, 1));
    pushIfBoth('SP Record', 'SP_RECORD',
      awayP.wins != null ? `${awayP.wins}-${awayP.losses || 0}` : '—',
      homeP.wins != null ? `${homeP.wins}-${homeP.losses || 0}` : '—');
    pushIfBoth('SP IP', 'SP_IP', fmtNum(awayP.inningsPitched, 1), fmtNum(homeP.inningsPitched, 1));
    pushIfBoth('SP SO', 'SP_SO', fmtInt(awayP.strikeOuts), fmtInt(homeP.strikeOuts));
  }

  // Team Batting (averaged from top 5 position players' MLB career stats)
  // Only include when BOTH teams have data — one-sided comparisons are useless
  if (homeBatting && awayBatting) {
    tapeRows.push({ name: 'Team AVG', token: 'TEAM_AVG', away: { team: awayTeam, value: fmtNum(awayBatting.avg) }, home: { team: homeTeam, value: fmtNum(homeBatting.avg) } });
    tapeRows.push({ name: 'Team OBP', token: 'TEAM_OBP', away: { team: awayTeam, value: fmtNum(awayBatting.obp) }, home: { team: homeTeam, value: fmtNum(homeBatting.obp) } });
    tapeRows.push({ name: 'Team SLG', token: 'TEAM_SLG', away: { team: awayTeam, value: fmtNum(awayBatting.slg) }, home: { team: homeTeam, value: fmtNum(homeBatting.slg) } });
    tapeRows.push({ name: 'Team OPS', token: 'TEAM_OPS', away: { team: awayTeam, value: fmtNum(awayBatting.ops) }, home: { team: homeTeam, value: fmtNum(homeBatting.ops) } });
    tapeRows.push({ name: 'Career HR', token: 'TEAM_HR', away: { team: awayTeam, value: fmtInt(awayBatting.homeRuns) }, home: { team: homeTeam, value: fmtInt(homeBatting.homeRuns) } });
  }

  // Team Season Stats (BDL GOAT-tier — team-level batting + pitching aggregates)
  // Always show in Tale of Tape — if early season with no real data, show 0.00
  // BDL mirrors prior season stats into 2026 slot — detect via GP >= 100 in March/April
  const isEarlySeason = new Date().getMonth() <= 4;
  const homeStatsReal = homeTeamStats && (!isEarlySeason || (homeTeamStats.gp || 0) < 100);
  const awayStatsReal = awayTeamStats && (!isEarlySeason || (awayTeamStats.gp || 0) < 100);
  {
    // Use real stats if available, otherwise show 0.00 for current season
    const hStats = homeStatsReal ? homeTeamStats : null;
    const aStats = awayStatsReal ? awayTeamStats : null;
    tapeRows.push({ name: 'Team ERA', token: 'TEAM_ERA',
      away: { team: awayTeam, value: aStats ? fmtNum(aStats.pitching_era, 2) : '0.00' },
      home: { team: homeTeam, value: hStats ? fmtNum(hStats.pitching_era, 2) : '0.00' }
    });
    tapeRows.push({ name: 'Team OPS', token: 'TEAM_OPS_BDL',
      away: { team: awayTeam, value: aStats ? fmtNum(aStats.batting_ops) : '0.000' },
      home: { team: homeTeam, value: hStats ? fmtNum(hStats.batting_ops) : '0.000' }
    });
    const homeGp = hStats?.gp || 1;
    const awayGp = aStats?.gp || 1;
    const homeRpg = hStats?.batting_r != null ? (parseFloat(hStats.batting_r) / homeGp).toFixed(1) : '0.0';
    const awayRpg = aStats?.batting_r != null ? (parseFloat(aStats.batting_r) / awayGp).toFixed(1) : '0.0';
    tapeRows.push({ name: 'Runs/Game', token: 'RUNS_PER_GAME',
      away: { team: awayTeam, value: awayRpg },
      home: { team: homeTeam, value: homeRpg }
    });
  }

  let verifiedTaleOfTape = null;
  if (tapeRows.length > 0) {
    const col1Width = Math.max(homeTeam.length, 20);
    const headerLine = `                    ${homeTeam.padEnd(col1Width)}    ${awayTeam}`;
    const rowLines = tapeRows.map(row => {
      const label = row.name.padEnd(14);
      const homeVal = String(row.home.value).padStart(12);
      const awayVal = String(row.away.value);
      return `${label}${homeVal}  |  ${awayVal}`;
    });
    const formattedText = `TALE OF THE TAPE (VERIFIED)\n\n${headerLine}\n${rowLines.join('\n')}`;
    verifiedTaleOfTape = { text: formattedText, rows: tapeRows };
  }

  console.log(`[Scout Report] MLB report complete: ${text.length} chars, ${tapeRows.length} tape rows`);

  return {
    text,
    injuries: injuriesSection || gameContextGrounding || '',
    verifiedTaleOfTape,
    venue: typeof venue === 'string' ? venue : venue?.name || 'Unknown',
    tokenMenu,
    homeRecord: null,
    awayRecord: null,
  };
}
