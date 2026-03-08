/**
 * MLB/WBC Scout Report Builder
 *
 * Uses MLB Stats API (free, no key) for WBC data:
 * - Schedule, rosters, box scores, standings, player stats
 * Uses Gemini Grounding for:
 * - Odds (no API has WBC odds)
 * - Live context, injuries, lineup confirmations
 */

import { geminiGroundingSearch } from '../shared/grounding.js';
import { formatTokenMenu } from '../../tools/toolDefinitions.js';
import { buildVerifiedTaleOfTape } from '../shared/taleOfTape.js';
import {
  getWbcSchedule,
  getWbcTeams,
  getTeamRoster,
  getPlayerCareerStats,
  getWbcStandings,
  getProbablePitchers,
  getGameBoxScore,
  getWbcFullSchedule,
  getWbcTeamBattingStats,
} from '../../../mlbStatsApiService.js';

export async function buildMlbScoutReport(game, options = {}) {
  // home_team/away_team are strings; team objects with IDs are in home_team_data/away_team_data
  const homeTeam = typeof game.home_team === 'string' ? game.home_team : (game.home_team?.full_name || game.home_team?.name || 'Home');
  const awayTeam = typeof game.away_team === 'string' ? game.away_team : (game.away_team?.full_name || game.away_team?.name || 'Away');
  const homeTeamId = game.home_team_data?.id || game.home_team?.id;
  const awayTeamId = game.away_team_data?.id || game.away_team?.id;
  const gamePk = game.gamePk || game.id;
  const venue = game.venue || game._raw?.venue?.name || 'Unknown Venue';
  const gameDesc = game.description || '';
  const startTime = game.start_time || game.commence_time || '';

  console.log(`[Scout Report] Building MLB/WBC report: ${awayTeam} @ ${homeTeam}`);

  // ═══════════════════════════════════════════════════════════════════
  // PARALLEL DATA FETCH
  // ═══════════════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════════
  // CONSOLIDATED GROUNDING: 2 mega-queries instead of 6 small ones
  // Uses thinkingLevel 'low' — these are fact-retrieval, not reasoning
  // ═══════════════════════════════════════════════════════════════════
  const groundingOpts = { thinkingLevel: 'low', maxTokens: 1500 };

  const [
    homeRoster,
    awayRoster,
    standings,
    probablePitchersData,
    fullSchedule,
    gameContextGrounding,
    rosterStorylineGrounding,
  ] = await Promise.all([
    homeTeamId ? getTeamRoster(homeTeamId).catch(e => { console.warn(`[Scout Report] Home roster error: ${e.message}`); return []; }) : Promise.resolve([]),
    awayTeamId ? getTeamRoster(awayTeamId).catch(e => { console.warn(`[Scout Report] Away roster error: ${e.message}`); return []; }) : Promise.resolve([]),
    getWbcStandings().catch(e => { console.warn(`[Scout Report] Standings error: ${e.message}`); return null; }),
    gamePk ? getProbablePitchers(gamePk).catch(e => { console.warn(`[Scout Report] Probable pitchers error: ${e.message}`); return null; }) : Promise.resolve(null),
    getWbcFullSchedule().catch(e => { console.warn(`[Scout Report] Full schedule error: ${e.message}`); return []; }),
    // MEGA-QUERY 1: Game context — odds, preview, pitchers, injuries, venue
    geminiGroundingSearch(
      `WBC 2026 World Baseball Classic: ${awayTeam} vs ${homeTeam} March 2026. ` +
      `Find ALL of the following for this game: ` +
      `(1) Current moneyline odds and run line from FanDuel, DraftKings, or any sportsbook. ` +
      `(2) Starting pitcher matchup and probable lineups. ` +
      `(3) Any injuries, scratches, or last-minute roster changes. ` +
      `(4) Game preview and betting analysis. ` +
      `Report facts only with numbers and names.`,
      groundingOpts
    ).then(r => r?.data || '').catch(() => ''),
    // MEGA-QUERY 2: Tournament storylines + both teams' form, roster profiles, key player backgrounds
    geminiGroundingSearch(
      `WBC 2026 World Baseball Classic tournament update March 2026. ` +
      `Find ALL of the following: ` +
      `(1) ${homeTeam} WBC results so far, key players, roster background (which leagues they play in — MLB, NPB, KBO, etc.), recent performance. ` +
      `(2) ${awayTeam} WBC results so far, key players, roster background (which leagues they play in), recent performance. ` +
      `(3) Overall WBC 2026 tournament storylines, standings updates, and news. ` +
      `Include player names, their regular-season teams/leagues, and any stats from this tournament.`,
      groundingOpts
    ).then(r => r?.data || '').catch(() => ''),
  ]);

  // ═══════════════════════════════════════════════════════════════════
  // TEAM BATTING STATS (top 5 position players' MLB career stats)
  // ═══════════════════════════════════════════════════════════════════
  const [homeBatting, awayBatting] = await Promise.all([
    getWbcTeamBattingStats(homeRoster).catch(() => null),
    getWbcTeamBattingStats(awayRoster).catch(() => null),
  ]);

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
  // STANDINGS / POOL RECORD
  // ═══════════════════════════════════════════════════════════════════
  let standingsSection = 'Pool standings unavailable.';
  if (standings?.records) {
    const lines = [];
    for (const record of standings.records) {
      const divName = record.division?.name || record.division?.nameShort || 'Pool';
      const teamRecords = (record.teamRecords || [])
        .sort((a, b) => (a.divisionRank || 99) - (b.divisionRank || 99))
        .map(tr => `  ${tr.team?.name || 'Unknown'}: ${tr.wins || 0}-${tr.losses || 0}`)
        .join('\n');
      if (teamRecords) lines.push(`${divName}\n${teamRecords}`);
    }
    if (lines.length > 0) standingsSection = lines.join('\n\n');
  }

  // ═══════════════════════════════════════════════════════════════════
  // RECENT WBC RESULTS (completed games from schedule)
  // ═══════════════════════════════════════════════════════════════════
  let recentResults = 'No completed WBC games yet (tournament just started).';
  const completedGames = fullSchedule.filter(g =>
    g.status?.detailedState === 'Final' || g.status?.statusCode === 'F'
  );
  if (completedGames.length > 0) {
    const resultLines = completedGames.slice(-10).map(g => {
      const home = g.teams?.home;
      const away = g.teams?.away;
      return `${away?.team?.name} ${away?.score || 0} @ ${home?.team?.name} ${home?.score || 0} (${g.venue?.name || ''})`;
    });
    recentResults = resultLines.join('\n');
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
  // ASSEMBLE REPORT
  // ═══════════════════════════════════════════════════════════════════
  const text = `
══════════════════════════════════════════════════════════════════
MATCHUP: ${awayTeam} @ ${homeTeam}
${gameDesc ? `Context: ${gameDesc}` : ''}
Venue: ${typeof venue === 'string' ? venue : venue?.name || 'Unknown'}
${startTime ? `Start: ${new Date(startTime).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' })} ET` : ''}
${weatherSection}
══════════════════════════════════════════════════════════════════

═══ PROBABLE PITCHERS ═══
${probablePitchersSection}

═══ BETTING CONTEXT ═══
${oddsSection}

═══ POOL STANDINGS ═══
${standingsSection}

═══ COMPLETED WBC RESULTS ═══
${recentResults}

═══ GAME CONTEXT (odds, preview, pitchers, injuries) ═══
${gameContextGrounding || 'No game context available.'}

═══ TOURNAMENT CONTEXT (storylines, team form, player backgrounds) ═══
${rosterStorylineGrounding || 'No tournament context available.'}

═══ ROSTERS ═══
${formatRoster(homeRoster, homeTeam)}

${formatRoster(awayRoster, awayTeam)}
`.trim();

  // Token menu for Flash
  const tokenMenu = formatTokenMenu('MLB');

  // Tale of Tape (12-15 rows: SP pitching + team batting + pool record)
  // Must return { text, rows } to match buildVerifiedTaleOfTape() format used by all other sports
  const tapeRows = [];
  const fmtNum = (v, d = 3) => { if (v == null) return '—'; const n = parseFloat(v); return isNaN(n) ? '—' : n.toFixed(d); };
  const fmtInt = (v) => { if (v == null) return '—'; const n = parseInt(v); return isNaN(n) ? '—' : String(n); };

  // Pool Record — compute from completed games (standings API often shows 0-0 early in WBC)
  {
    const computePoolRecord = (teamName) => {
      const lastWord = teamName.toLowerCase().split(' ').pop();
      let wins = 0, losses = 0;
      for (const g of completedGames) {
        const homeName = g.teams?.home?.team?.name || '';
        const awayName = g.teams?.away?.team?.name || '';
        const homeScore = g.teams?.home?.score ?? 0;
        const awayScore = g.teams?.away?.score ?? 0;
        const isHome = homeName.toLowerCase().includes(lastWord);
        const isAway = awayName.toLowerCase().includes(lastWord);
        if (isHome) { homeScore > awayScore ? wins++ : losses++; }
        else if (isAway) { awayScore > homeScore ? wins++ : losses++; }
      }
      return `${wins}-${losses}`;
    };
    // Try standings API first, fall back to computed record
    let homeRecord = '—', awayRecord = '—';
    if (standings?.records) {
      const findRecord = (teamName) => {
        for (const rec of standings.records) {
          const tr = (rec.teamRecords || []).find(t => t.team?.name?.toLowerCase().includes(teamName.toLowerCase().split(' ').pop()));
          if (tr && (tr.wins > 0 || tr.losses > 0)) return `${tr.wins}-${tr.losses}`;
        }
        return null;
      };
      homeRecord = findRecord(homeTeam) || computePoolRecord(homeTeam);
      awayRecord = findRecord(awayTeam) || computePoolRecord(awayTeam);
    } else {
      homeRecord = computePoolRecord(homeTeam);
      awayRecord = computePoolRecord(awayTeam);
    }
    tapeRows.push({ name: 'Pool Record', token: 'POOL_RECORD', away: { team: awayTeam, value: awayRecord }, home: { team: homeTeam, value: homeRecord } });

    // Game 1 Result — most recent completed game for each team
    const findLastGame = (teamName) => {
      const lastWord = teamName.toLowerCase().split(' ').pop();
      for (let i = completedGames.length - 1; i >= 0; i--) {
        const g = completedGames[i];
        const homeName = g.teams?.home?.team?.name || '';
        const awayName = g.teams?.away?.team?.name || '';
        const homeScore = g.teams?.home?.score ?? 0;
        const awayScore = g.teams?.away?.score ?? 0;
        const isHome = homeName.toLowerCase().includes(lastWord);
        const isAway = awayName.toLowerCase().includes(lastWord);
        if (isHome) {
          const opp = awayName.split(' ').pop();
          const wl = homeScore > awayScore ? 'W' : 'L';
          return { result: `${wl} ${homeScore}-${awayScore}`, opponent: opp };
        }
        if (isAway) {
          const opp = homeName.split(' ').pop();
          const wl = awayScore > homeScore ? 'W' : 'L';
          return { result: `${wl} ${awayScore}-${homeScore}`, opponent: opp };
        }
      }
      return null;
    };
    const homeGame1 = findLastGame(homeTeam);
    const awayGame1 = findLastGame(awayTeam);
    if (homeGame1 && awayGame1) {
      tapeRows.push({ name: 'Game 1', token: 'GAME1_RESULT', away: { team: awayTeam, value: awayGame1.result }, home: { team: homeTeam, value: homeGame1.result } });
      tapeRows.push({ name: 'Last Played', token: 'LAST_PLAYED', away: { team: awayTeam, value: awayGame1.opponent }, home: { team: homeTeam, value: homeGame1.opponent } });
    }
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
  // WBC pitchers without MLB careers return null; one-sided "—" rows are useless
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

  console.log(`[Scout Report] MLB/WBC report complete: ${text.length} chars, ${tapeRows.length} tape rows`);

  return {
    text,
    injuries: gameContextGrounding || '',
    verifiedTaleOfTape,
    venue: typeof venue === 'string' ? venue : venue?.name || 'Unknown',
    tokenMenu,
    homeRecord: null,
    awayRecord: null,
    gameSignificance: game.gameSignificance || null,
    tournamentContext: game.description || 'World Baseball Classic',
  };
}
