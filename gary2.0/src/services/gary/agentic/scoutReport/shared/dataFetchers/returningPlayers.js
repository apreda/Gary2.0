/** Scout-report data: Players returning from absence. (split from dataFetchers.js, Oct 13 2026) */
import { playerNamesMatch } from '../utilities.js';

// ============================================================================
// DETECT RETURNING PLAYERS
// ============================================================================

export function detectReturningPlayers(rosterDepth, injuries, recentHome, recentAway, homeTeam, awayTeam) {
  if (!rosterDepth) return '';

  const results = [];

  const teamConfigs = [
    { label: 'HOME', players: rosterDepth.home, l5: rosterDepth.homeL5, recent: recentHome, inj: injuries?.home || [], name: homeTeam },
    { label: 'AWAY', players: rosterDepth.away, l5: rosterDepth.awayL5, recent: recentAway, inj: injuries?.away || [], name: awayTeam }
  ];

  for (const { label, players, l5, recent, inj, name } of teamConfigs) {
    if (!players || !l5?.playersByGame) continue;

    const playersByGame = l5.playersByGame;
    // Get game IDs that actually have player data (filters out today's unplayed game)
    const allGameIds = (recent || []).map(g => g.id).filter(Boolean).slice(0, 5);
    const gameIds = allGameIds.filter(gid => playersByGame[gid] && playersByGame[gid].length > 0).slice(0, 3);
    if (gameIds.length < 2) continue;

    // recentGames is sorted most-recent-first from fetchRecentGames
    // gameIds[0] is the most recent PLAYED game (not today's unplayed game)
    const lastGameId = gameIds[0];
    // Build set of players who played in the last game
    const lastGamePlayers = new Set();
    for (const p of (playersByGame[lastGameId] || [])) {
      lastGamePlayers.add(p.name.toLowerCase().trim());
    }

    // Build map: playerName → count of games they appeared in (out of L5)
    const playerGameCounts = {};
    for (const gid of gameIds) {
      for (const p of (playersByGame[gid] || [])) {
        const pName = p.name.toLowerCase().trim();
        playerGameCounts[pName] = (playerGameCounts[pName] || 0) + 1;
      }
    }

    // Get OUT/DOUBTFUL players from injury report
    const outPlayers = new Set();
    for (const injury of inj) {
      const status = (injury.status || '').toLowerCase();
      if (status === 'out' || status.startsWith('out') || status.includes('out for season') || status === 'doubtful' || status.includes('suspended')) {
        const pName = typeof injury.player === 'string' ? injury.player :
          `${injury.player?.first_name || ''} ${injury.player?.last_name || ''}`.trim();
        outPlayers.add(pName.toLowerCase().trim());
      }
    }

    // Check each roster player for returning status
    const returning = [];
    for (const player of players) {
      const pName = (player.name || `${player.first_name || ''} ${player.last_name || ''}`).trim();
      const pNameLower = pName.toLowerCase();

      // Skip if they played in the last game (exact or fuzzy)
      if (lastGamePlayers.has(pNameLower)) continue;
      if ([...lastGamePlayers].some(lp => playerNamesMatch(lp, pNameLower))) continue;

      // Skip if they are OUT/DOUBTFUL
      if (outPlayers.has(pNameLower)) continue;
      if ([...outPlayers].some(op => playerNamesMatch(op, pNameLower))) continue;

      // Count how many of the L5 games they played in
      const gamesPlayed = playerGameCounts[pNameLower] ||
        Object.entries(playerGameCounts).find(([k]) => playerNamesMatch(k, pNameLower))?.[1] || 0;
      const gamesMissed = gameIds.length - gamesPlayed;

      // Only flag if they missed the last game and are a meaningful player
      if (gamesMissed >= 1) {
        // NCAAB has ppg (string, per-game), pts (total season); NBA has pts (per-game number)
        const ppg = parseFloat(player.ppg) || player.pts || 0;
        const rpg = parseFloat(player.reb) || 0;
        const apg = parseFloat(player.ast) || 0;

        // Check if they have an injury status (QUESTIONABLE/PROBABLE/GTD)
        let injuryStatus = 'Available';
        for (const injury of inj) {
          const injName = typeof injury.player === 'string' ? injury.player :
            `${injury.player?.first_name || ''} ${injury.player?.last_name || ''}`.trim();
          if (playerNamesMatch(injName, pName)) {
            injuryStatus = `${injury.status}${injury.injury ? ` (${injury.injury})` : ''}`;
            break;
          }
        }

        returning.push({
          name: pName,
          gamesMissed,
          gamesPlayed,
          ppg: typeof ppg === 'number' ? ppg.toFixed(1) : ppg,
          rpg: typeof rpg === 'number' ? rpg.toFixed(1) : rpg,
          apg: typeof apg === 'number' ? apg.toFixed(1) : apg,
          injuryStatus,
          // Team-share percentages for impact context
          pct_pts: player.pct_pts || 0,
          pct_ast: player.pct_ast || 0,
          pct_fga: player.pct_fga || 0,
          pct_reb: player.pct_reb || 0
        });
      }
    }

    if (returning.length > 0) {
      returning.sort((a, b) => parseFloat(b.ppg) - parseFloat(a.ppg));
      console.log(`[Returning Players] ${name}: ${returning.map(r => `${r.name} (${r.ppg} PPG, missed ${r.gamesMissed})`).join(', ')}`);
      results.push({ team: name, players: returning });
    }
  }

  if (results.length === 0) return '';

  const lines = [];
  lines.push('');
  lines.push('RETURNING PLAYERS (DID NOT PLAY LAST GAME — NOW AVAILABLE)');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('These players were ABSENT from their team\'s most recent game but are');
  lines.push('NOT currently listed as OUT. Status and season averages shown below.');
  lines.push('');

  for (const { team, players } of results) {
    lines.push(`  ${team}:`);
    for (const p of players) {
      lines.push(`    ${p.name} — Missed ${p.gamesMissed} of last ${p.gamesMissed + p.gamesPlayed} games | ${p.ppg} PPG / ${p.rpg} RPG / ${p.apg} APG | Status: ${p.injuryStatus}`);
      // Show team-share context if available — helps Gary assess the impact of this player returning
      const shareParts = [];
      if (p.pct_pts) shareParts.push(`${(p.pct_pts * 100).toFixed(1)}% PTS`);
      if (p.pct_ast) shareParts.push(`${(p.pct_ast * 100).toFixed(1)}% AST`);
      if (p.pct_fga) shareParts.push(`${(p.pct_fga * 100).toFixed(1)}% FGA`);
      if (shareParts.length > 0) {
        lines.push(`      Team Share: ${shareParts.join(' | ')}`);
      }
    }
    lines.push('');
  }

  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  return lines.join('\n');
}
