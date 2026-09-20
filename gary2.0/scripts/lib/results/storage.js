/** Result schema capabilities, exact identity lookup and persisted-result readback. */

export function createResultsStorage({ supabase, console = globalThis.console }) {
  let gameResultIdentityColumnAvailable;
  let nflResultIdentityColumnAvailable;
  let propResultIdentityColumnsAvailable;
  const cache = { propRows: new Map() };

  async function supportsExactGameResultIdentity() {
    if (gameResultIdentityColumnAvailable !== undefined) return gameResultIdentityColumnAvailable;

    const { error } = await supabase.from('game_results').select('game_id').limit(1);
    if (!error) {
      gameResultIdentityColumnAvailable = true;
      return true;
    }

    const missingColumn = ['42703', 'PGRST204'].includes(String(error.code || ''))
      || /column .*?game_id.*?does not exist|could not find .*?game_id.*?column/i.test(error.message || '');
    if (!missingColumn) throw new Error(`Could not inspect game_results.game_id: ${error.message}`);

    // Keep grading safe while code and schema roll out separately. The legacy
    // lookup still uses league + matchup + pick text + date rather than the old
    // collision-prone pick-text/date pair.
    console.warn('  ⚠️ game_results.game_id is not deployed yet — using legacy-safe result identity');
    gameResultIdentityColumnAvailable = false;
    return false;
  }

  async function supportsExactNFLResultIdentity() {
    if (nflResultIdentityColumnAvailable !== undefined) return nflResultIdentityColumnAvailable;

    const { error } = await supabase.from('nfl_results').select('game_id').limit(1);
    if (!error) {
      nflResultIdentityColumnAvailable = true;
      return true;
    }

    const missingColumn = ['42703', 'PGRST204'].includes(String(error.code || ''))
      || /column .*?game_id.*?does not exist|could not find .*?game_id.*?column/i.test(error.message || '');
    if (!missingColumn) throw new Error(`Could not inspect nfl_results.game_id: ${error.message}`);

    // Deployment-safe rollout: old code keeps its matchup-aware lookup and fails
    // closed on the historical unique-index collision until the migration lands.
    console.warn('  ⚠️ nfl_results.game_id is not deployed yet — using legacy-safe result identity');
    nflResultIdentityColumnAvailable = false;
    return false;
  }

  async function fetchExistingGameResult({
    targetTable,
    league,
    gameDate,
    gameId,
    pickText,
    matchup,
    exactGameIdentity,
  }) {
    if (exactGameIdentity && gameId) {
      let exactQuery = supabase
        .from(targetTable)
        .select('id')
        .eq('game_date', gameDate)
        .eq('game_id', gameId)
        .eq('matchup', matchup)
        .eq('pick_text', pickText);
      if (targetTable === 'game_results') exactQuery = exactQuery.eq('league', league);
      const { data, error } = await exactQuery.limit(1);
      if (error) throw new Error(`Exact game-result identity lookup failed: ${error.message}`);
      if (data?.[0]) return data[0];
    }

    let query = supabase
      .from(targetTable)
      .select('id')
      .eq('game_date', gameDate)
      .eq('matchup', matchup)
      .eq('pick_text', pickText);
    if (targetTable === 'game_results') {
      query = query.eq('league', league);
    }
    if (exactGameIdentity) query = query.is('game_id', null);

    const { data, error } = await query.limit(1);
    if (error) throw new Error(`Legacy game-result identity lookup failed: ${error.message}`);
    return data?.[0] ?? null;
  }

  async function readBackPersistedResults(table, resultIds, label) {
    const ids = [...new Set((resultIds || []).filter(Boolean).map(String))];
    if (!ids.length) return 0;

    const { data, error } = await supabase.from(table).select('id').in('id', ids);
    if (error) throw new Error(`${label} result readback failed: ${error.message}`);
    const found = new Set((data || []).map((row) => String(row.id)));
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length) {
      throw new Error(`${label} result readback missing ${missing.length}/${ids.length} row(s)`);
    }
    return found.size;
  }

  async function supportsExactPropResultIdentity() {
    if (propResultIdentityColumnsAvailable !== undefined) return propResultIdentityColumnsAvailable;

    const { error } = await supabase.from('prop_results').select('game_id,sport').limit(1);
    if (!error) {
      propResultIdentityColumnsAvailable = true;
      return true;
    }

    const missingColumns = ['42703', 'PGRST204'].includes(String(error.code || ''))
      || /column .*?(game_id|sport).*?does not exist|could not find .*?(game_id|sport).*?column/i.test(error.message || '');
    if (!missingColumns) throw new Error(`Could not inspect prop_results identity columns: ${error.message}`);

    // Allows the script and schema migration to roll out independently. The
    // legacy lookup below is more specific than the old three-field query, but
    // exact cross-sport/game identity begins as soon as the migration is applied.
    console.warn('  ⚠️ prop_results.game_id/sport are not deployed yet — using legacy-safe result identity');
    propResultIdentityColumnsAvailable = false;
    return false;
  }

  function withNullSafeEq(query, column, value) {
    return value == null || String(value).trim() === ''
      ? query.is(column, null)
      : query.eq(column, value);
  }

  async function fetchExistingPropResult(identity, { exactColumns, claimedIds }) {
    const select = exactColumns ? 'id,game_id,sport,created_at' : 'id,created_at';
    const takeUnclaimed = (rows) => (rows || []).find((row) => !claimedIds.has(row.id)) || null;

    if (exactColumns && identity.gameId && identity.sport) {
      const { data, error } = await supabase
        .from('prop_results')
        .select(select)
        .eq('game_date', identity.gameDate)
        .eq('game_id', identity.gameId)
        .eq('sport', identity.sport)
        .eq('player_name', identity.playerName)
        .eq('prop_type', identity.propType)
        .ilike('bet', identity.bet)
        .eq('line_value', identity.line)
        .limit(2);
      if (error) throw new Error(`Exact prop-result identity lookup failed: ${error.message}`);
      const exact = takeUnclaimed(data);
      if (exact) return exact;
    }

    // Legacy rows predate game_id/sport. Include every identity dimension their
    // schema can represent, then claim each candidate at most once per run. That
    // lets a doubleheader adopt two historical rows instead of repeatedly
    // overwriting the first one while the new columns backfill organically.
    let query = supabase
      .from('prop_results')
      .select(select)
      .eq('prop_pick_id', identity.propPickId)
      .eq('game_date', identity.gameDate)
      .eq('player_name', identity.playerName)
      .eq('prop_type', identity.propType)
      .ilike('bet', identity.bet)
      .eq('line_value', identity.line)
      .order('created_at', { ascending: true })
      .limit(20);
    query = withNullSafeEq(query, 'matchup', identity.matchup);
    if (exactColumns) {
      query = query.is('game_id', null).is('sport', null);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Legacy prop-result identity lookup failed: ${error.message}`);
    return takeUnclaimed(data);
  }

  /**
   * Gary's graded props around a date (±1 day to absorb pick-date vs ET-game-date
   * drift). Used to enrich the recap evidence pack with REAL betting prices so
   * slide bullets can carry the betting lens. One Supabase query per date, cached.
   * Nightly ordering note: main() grades props BEFORE game picks so these rows
   * exist by the time recaps are written.
   */
  async function fetchGradedPropRowsAround(dateStr) {
    if (cache.propRows.has(dateStr)) return cache.propRows.get(dateStr);
    const base = new Date(`${dateStr}T12:00:00Z`);
    const dates = [-1, 0, 1].map((off) => {
      const d = new Date(base);
      d.setUTCDate(d.getUTCDate() + off);
      return d.toISOString().slice(0, 10);
    });
    const { data, error } = await supabase
      .from('prop_results')
      .select('player_name, prop_type, line_value, actual_value, result, bet, odds, matchup')
      .in('game_date', dates);
    if (error) {
      console.warn(`  ⚠️ prop_results fetch failed (recap evidence will omit props): ${error.message}`);
      cache.propRows.set(dateStr, []);
      return [];
    }
    cache.propRows.set(dateStr, data || []);
    return data || [];
  }

  return { supportsExactGameResultIdentity, supportsExactNFLResultIdentity, fetchExistingGameResult, readBackPersistedResults, supportsExactPropResultIdentity, fetchExistingPropResult, fetchGradedPropRowsAround };
}
