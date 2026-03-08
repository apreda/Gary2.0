/**
 * DFS Scout Report Builder
 *
 * Phase 1.5 of the Agentic DFS system.
 * Builds per-game DFS scouting reports from context data.
 * Pure data formatting — no Gemini calls.
 *
 * Every player on both teams appears with salary. No filtering.
 * Gary sees the full roster and decides who to investigate.
 *
 * Returns two text variants per game:
 * - garyText: Data-only report for Gary's investigation
 * - flashText: Same report + tool menu for Flash research sessions
 */

import { getSalaryCap, getRosterSlots } from './dfsSportConfig.js';

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build per-game DFS scouting reports from context data.
 *
 * @param {Object} context - Full DFS context (players, games, injuries, etc.)
 * @returns {Array<{ game: string, homeTeam: string, awayTeam: string, garyText: string, flashText: string }>}
 */
export function buildDfsScoutReports(context) {
  const { players, games, injuries, platform, sport } = context;
  const isFD = (platform || '').toLowerCase().includes('fanduel');
  const platformLabel = isFD ? 'FD' : 'DK';

  if (!games || games.length === 0) {
    console.warn('[Scout Reports] No games in context — cannot build reports');
    return [];
  }

  const reports = [];

  for (const game of games) {
    const home = game.homeTeam || game.home_team || '';
    const away = game.awayTeam || game.visitor_team || game.away_team || '';

    if (!home || !away) {
      console.warn('[Scout Reports] Skipping game with missing team:', game);
      continue;
    }

    const homePlayers = (players || []).filter(p => p.team === home);
    const awayPlayers = (players || []).filter(p => p.team === away);

    const sections = [];

    // 1. MATCHUP
    sections.push(formatMatchup(away, home, game));

    // 2. GAME ENVIRONMENT
    sections.push(formatGameEnvironment(game, home, away));

    // 3. INJURY REPORT
    sections.push(formatInjuryReport(injuries, home, away));

    // 4. AWAY TEAM ROSTER (visiting team first — standard matchup order)
    sections.push(formatTeamRoster(away, awayPlayers, isFD, platformLabel));

    // 5. HOME TEAM ROSTER
    sections.push(formatTeamRoster(home, homePlayers, isFD, platformLabel));

    // 6. TEAM DEFENSE
    sections.push(formatTeamDefense(game, home, away));

    // 7. RECENT FORM — top L5 performers
    sections.push(formatRecentForm([...homePlayers, ...awayPlayers], isFD, platformLabel));

    const garyText = sections.join('\n\n');

    // Flash gets the same report + tool menu
    const flashText = garyText + '\n\n' + getFlashToolMenu();

    reports.push({
      game: `${away}@${home}`,
      homeTeam: home,
      awayTeam: away,
      garyText,
      flashText
    });
  }

  console.log(`[Scout Reports] Built ${reports.length} per-game scouting reports`);
  for (const r of reports) {
    console.log(`[Scout Reports]   ${r.game}: ${r.garyText.length} chars`);
  }

  return reports;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION FORMATTERS
// ═══════════════════════════════════════════════════════════════════════════════

function formatMatchup(away, home, game) {
  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  return `## MATCHUP: ${away} @ ${home}
Date: ${date}`;
}

function formatGameEnvironment(game, home, away) {
  const ou = game.overUnder || game.total || null;
  const sp = game.spread || game.homeSpread || null;
  const homeImplied = game.impliedTotal?.home ?? (ou && sp != null ? ((ou - sp) / 2).toFixed(1) : '?');
  const awayImplied = game.impliedTotal?.away ?? (ou && sp != null ? ((ou + sp) / 2).toFixed(1) : '?');

  const lines = [`## GAME ENVIRONMENT`];
  lines.push(`O/U: ${ou || '?'} | Spread: ${sp || '?'} (${home})`);
  lines.push(`Implied Totals: ${home} ${homeImplied} / ${away} ${awayImplied}`);

  if (game.homePace || game.awayPace) {
    lines.push(`Pace: ${home} ${game.homePace?.toFixed(1) || '?'} / ${away} ${game.awayPace?.toFixed(1) || '?'}${game.gamePace ? ` (Combined: ${game.gamePace.toFixed(1)})` : ''}`);
  }

  if (game.homeB2B) lines.push(`${home}: BACK-TO-BACK`);
  if (game.awayB2B) lines.push(`${away}: BACK-TO-BACK`);

  return lines.join('\n');
}

function formatInjuryReport(injuries, home, away) {
  const lines = ['## INJURY REPORT'];

  for (const team of [away, home]) {
    const teamInjuries = injuries?.[team];
    if (!teamInjuries || teamInjuries.length === 0) {
      lines.push(`${team}: No reported injuries`);
      continue;
    }

    const parts = [];
    for (const inj of teamInjuries) {
      const name = inj.player?.first_name
        ? `${inj.player.first_name} ${inj.player.last_name}`
        : inj.player;
      const status = (inj.status || '').toUpperCase();
      const reason = inj.injury || inj.reason || '';

      let durationTag = '';
      if (inj.duration) {
        durationTag = ` [${inj.duration} — ${inj.gamesMissed} team games missed]`;
      }
      parts.push(`  ${name} (${status})${durationTag}${reason ? ` ${reason}` : ''}`);
    }
    lines.push(`${team}:\n${parts.join('\n')}`);
  }

  return lines.join('\n');
}

function formatTeamRoster(team, teamPlayers, isFD, platformLabel) {
  const lines = [`## ${team} ROSTER`];

  if (teamPlayers.length === 0) {
    lines.push(`  No players from ${team} on this slate`);
    return lines.join('\n');
  }

  // Sort by salary descending — highest paid first
  const sorted = [...teamPlayers].sort((a, b) => (b.salary || 0) - (a.salary || 0));

  for (const p of sorted) {
    const pos = (p.positions || [p.position]).join('/');
    const salary = p.salary ? `$${p.salary.toLocaleString()}` : '$?';

    // Season FPTS
    const seasonFpts = isFD
      ? (p.seasonStats?.fdFpts || null)
      : (p.seasonStats?.dkFpts || null);

    // L5 FPTS
    const l5Fpts = isFD
      ? (p.l5Stats?.fdFptsAvg || null)
      : (p.l5Stats?.dkFptsAvg || null);

    // Season averages
    const ss = p.seasonStats || {};
    const ppg = ss.ppg?.toFixed(1) || '?';
    const rpg = ss.rpg?.toFixed(1) || '?';
    const apg = ss.apg?.toFixed(1) || '?';
    const mpg = ss.mpg?.toFixed(1) || '?';

    let line = `  ${p.name} [${pos}] ${salary}`;
    line += ` | ${ppg}/${rpg}/${apg} (${mpg} MPG)`;

    if (seasonFpts) line += ` | Season ${platformLabel}: ${seasonFpts.toFixed(1)}`;
    if (l5Fpts) line += ` | L5: ${l5Fpts.toFixed(1)}`;

    // Status flags
    if (p.isQuestionable) line += ' [Q/GTD]';
    if (p.status && p.status !== 'ACTIVE' && p.status !== 'HEALTHY' && !p.isQuestionable) {
      line += ` [${p.status}]`;
    }

    // Benchmark projection if available
    if (p.benchmarkProjection) {
      line += ` | Proj: ${p.benchmarkProjection.toFixed(1)}`;
    }

    lines.push(line);
  }

  return lines.join('\n');
}

function formatTeamDefense(game, home, away) {
  const lines = ['## TEAM DEFENSE'];

  const hd = game.home_defense;
  const ad = game.away_defense;

  if (hd) {
    lines.push(`${home} DEF: ${hd.opp_pts?.toFixed(1) || '?'} PPG allowed${hd.opp_efg_pct ? `, ${hd.opp_efg_pct.toFixed(1)}% eFG allowed` : ''}${hd.pace ? `, Pace ${hd.pace.toFixed(1)}` : ''}`);
  } else {
    lines.push(`${home} DEF: No defense data available`);
  }

  if (ad) {
    lines.push(`${away} DEF: ${ad.opp_pts?.toFixed(1) || '?'} PPG allowed${ad.opp_efg_pct ? `, ${ad.opp_efg_pct.toFixed(1)}% eFG allowed` : ''}${ad.pace ? `, Pace ${ad.pace.toFixed(1)}` : ''}`);
  } else {
    lines.push(`${away} DEF: No defense data available`);
  }

  return lines.join('\n');
}

function formatRecentForm(allPlayers, isFD, platformLabel) {
  const lines = ['## RECENT FORM (Top L5 Performers)'];

  // Rank all players by L5 FPTS and show top performers
  const withL5 = allPlayers
    .filter(p => {
      const fpts = isFD ? p.l5Stats?.fdFptsAvg : p.l5Stats?.dkFptsAvg;
      return fpts && fpts > 0;
    })
    .sort((a, b) => {
      const aFpts = isFD ? a.l5Stats?.fdFptsAvg : a.l5Stats?.dkFptsAvg;
      const bFpts = isFD ? b.l5Stats?.fdFptsAvg : b.l5Stats?.dkFptsAvg;
      return (bFpts || 0) - (aFpts || 0);
    });

  // Show top 8 or all if fewer
  const topN = withL5.slice(0, 8);

  if (topN.length === 0) {
    lines.push('  No L5 data available');
    return lines.join('\n');
  }

  for (const p of topN) {
    const l5Fpts = isFD ? p.l5Stats?.fdFptsAvg : p.l5Stats?.dkFptsAvg;
    const seasonFpts = isFD ? p.seasonStats?.fdFpts : p.seasonStats?.dkFpts;
    const best = isFD ? p.l5Stats?.bestFdFpts : p.l5Stats?.bestDkFpts;
    const worst = isFD ? p.l5Stats?.worstFdFpts : p.l5Stats?.worstDkFpts;

    let line = `  ${p.name} (${p.team}) $${p.salary?.toLocaleString() || '?'}: L5 ${platformLabel} ${l5Fpts?.toFixed(1)}`;

    // Trend vs season
    if (seasonFpts && l5Fpts) {
      const ratio = l5Fpts / seasonFpts;
      if (ratio >= 1.15) line += ' [TRENDING UP]';
      else if (ratio <= 0.85) line += ' [TRENDING DOWN]';
    }

    // Range
    if (best != null && worst != null) {
      line += ` | Range: ${worst.toFixed(1)}-${best.toFixed(1)}`;
    }

    // Game log highlights (last 3)
    const gameRows = (p.l5Stats?.gameRows || []).slice(0, 3);
    if (gameRows.length > 0) {
      const gameSummaries = gameRows.map(g => {
        const fpts = isFD
          ? (g.fdFpts || 0)
          : (g.dkFpts || 0);
        return `${g.opponent || '?'}: ${fpts.toFixed(1)}`;
      });
      line += ` | Recent: ${gameSummaries.join(', ')}`;
    }

    lines.push(line);
  }

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// FLASH TOOL MENU
// ═══════════════════════════════════════════════════════════════════════════════

function getFlashToolMenu() {
  return `## AVAILABLE TOOLS
Use these tools to investigate this game:
- GET_TEAM_INJURIES(team) — Injury report with duration tags
- GET_TEAM_USAGE_STATS(team) — Usage, minutes, and workload data
- GET_GAME_ENVIRONMENT(homeTeam, awayTeam) — Vegas lines and pace
- GET_PLAYER_SALARY(playerName) — Salary and projection
- GET_PLAYER_GAME_LOGS(playerName, games) — Recent game-by-game stats
- GET_PLAYER_SEASON_STATS(playerName) — Season averages and advanced metrics
- GET_MATCHUP_DATA(playerName, position, opponent) — DvP matchup data
- GET_PLAYER_RECENT_VS_OPPONENT(playerName, opponent) — H2H recent history
- SEARCH_LIVE_NEWS(query) — Latest news via Google Search`;
}
