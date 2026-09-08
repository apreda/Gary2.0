const count = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
const positiveID = value => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

/** Normalize only observed batting appearances. Final requires a complete
 * per-game collection whose batting hits/runs reconcile to both team totals. */
export function normalizeMlbLiveBatting(game, stats) {
  if (!positiveID(game?.id) || !positiveID(game.home_team?.id) || !positiveID(game.away_team?.id) ||
      game.home_team.id === game.away_team.id || !Array.isArray(stats)) throw new Error('Invalid MLB batting game');
  const teams = new Map([game.home_team.id, game.away_team.id].map(id => [id, { hits: 0, runs: 0, complete: true, appeared: false }]));
  const players = new Set(), lines = [];
  for (const row of stats) {
    if (row?.game_id !== game.id || !teams.has(row.team?.id) || !positiveID(row.player?.id)) throw new Error('MLB batting identity mismatch');
    if (players.has(row.player.id)) throw new Error('Duplicate MLB batting player');
    players.add(row.player.id);
    // A pinch runner can record a run/steal without a plate appearance. Only
    // a roster row with no observed batting or baserunning fact is excluded.
    const appearances = ['plate_appearances', 'at_bats', 'bb', 'hit_by_pitch', 'sac_flies', 'sac_bunts',
      'hits', 'runs', 'rbi', 'hr', 'stolen_bases', 'caught_stealing'];
    if (!appearances.some(field => (count(row[field]) ?? 0) > 0)) continue;
    const fullName = row.player.full_name || [row.player.first_name, row.player.last_name].filter(Boolean).join(' ');
    if (typeof fullName !== 'string' || !fullName.trim()) throw new Error('Missing MLB batting identity');
    const hits = count(row.hits), runs = count(row.runs), hr = count(row.hr);
    const doubles = count(row.doubles), triples = count(row.triples);
    const totalBases = count(row.total_bases) ?? ([hits, doubles, triples, hr].every(n => n != null)
      ? hits + doubles + 2 * triples + 3 * hr : null);
    const totals = teams.get(row.team.id);
    totals.appeared = true;
    if (hits == null || runs == null) totals.complete = false;
    else { totals.hits += hits; totals.runs += runs; }
    lines.push({ player_id: row.player.id, name: fullName.trim(), hits, runs, rbi: count(row.rbi),
      walks: count(row.bb), home_runs: hr, total_bases: totalBases });
  }
  // A final cache stops refreshing. Do not freeze while any supported market
  // remains unknown even if the scoreboard's hits/runs already reconcile.
  const marketFields = ['hits', 'runs', 'rbi', 'walks', 'home_runs', 'total_bases'];
  const complete = lines.every(line => marketFields.every(field => line[field] != null)) &&
    [[game.home_team.id, game.home_team_data], [game.away_team.id, game.away_team_data]]
    .every(([id, expected]) => {
      const observed = teams.get(id);
      return observed.appeared && observed.complete && count(expected?.hits) != null && count(expected?.runs) != null
        && observed.hits === expected.hits && observed.runs === expected.runs;
    });
  return { lines, complete };
}
