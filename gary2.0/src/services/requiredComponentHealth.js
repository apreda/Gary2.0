export function collegeComponentRows(context, { game, date }) {
  const gameId = game.id ?? game.bdl_game_id ?? game.game_id ?? context.game_id;
  if (!/^\d+$/.test(String(gameId))) return [];
  return ['away', 'home'].flatMap(side => {
    const team = side === 'home' ? game.home_team : game.away_team || game.visitor_team;
    const evidence = context.sides?.[side];
    const checks = {
      quarterback: Boolean(evidence?.quarterback),
      availability: evidence?.availability === 'checked',
      coaching: Boolean(evidence?.coaches?.some(c => /head coach|^hc$/i.test(c.role))),
    };
    const reasons = {
      quarterback: evidence?.quarterback_uncertainty || 'Starting quarterback not established in current reporting and roster data',
      availability: evidence?.availability === 'partial'
        ? `${evidence.diagnostics?.invalid_injuries || 0} reported absences could not be matched; matched absences remain available`
        : 'Current availability report not established',
      coaching: 'Current head coach not established in the retrieved sources',
    };
    return Object.entries(checks).map(([component, ok]) => ({
      date, league: 'NCAAF', game_id: String(gameId), team_id: String(team.id), component,
      status: ok ? 'ok' : 'fail',
      reason: `${team.full_name || team.college}: ${ok ? `current ${component} evidence verified` : reasons[component]}`,
      observed_at: context.observed_at || new Date().toISOString(), sources: evidence?.sources || [],
    }));
  });
}

export async function publishCollegeComponentHealth(context, identity) {
  if (process.env.VITEST) return;
  const rows = collegeComponentRows(context, identity);
  if (!rows.length) return;
  try {
    const { supabaseAdmin } = await import('../supabaseClient.js');
    if (!supabaseAdmin) throw new Error('service client missing');
    const { error } = await supabaseAdmin.from('required_component_health').upsert(rows);
    if (error) throw error;
  } catch (error) {
    // Reporting an incident must not erase the underlying data we collected.
    console.error(`[College component health] Could not record game ${rows[0].game_id}: ${error.message}`);
  }
}
