/** College game/prop recovery and storage share the canonical playing-date policy. */
import { ncaafSlateDateForInstant } from '../../../src/services/ncaafGamePolicy.js';
import { recordMlbDataFailure as defaultRecordFailure, resolveMlbDataFailure as defaultResolveFailure } from '../mlbDataFailure.js';

export function createNcaafPropRecovery({ supabase, winnersAdmin, fetchDailySlateGame,
  loadPiggyback = () => import('../../../src/services/pickdesk/ncaafPiggybackProps.js'),
  loadStorage = () => import('../propPicksStorage.js'),
  recordMlbDataFailure = defaultRecordFailure, resolveMlbDataFailure = defaultResolveFailure,
  Date = globalThis.Date, console = globalThis.console }) {
  async function completeNcaafProp(pick, { game = null, date, toTestTable = false } = {}) {
    if (!pick) return;
    const id = pick.bdl_game_id ?? pick.game_id ?? game?.bdl_game_id ?? game?.id;
    let targetGame = game || {
      id, bdl_game_id: id, home_team: pick.homeTeam, away_team: pick.awayTeam,
      commence_time: pick.commence_time,
    };
    try {
      if (!targetGame.commence_time) {
        targetGame = await fetchDailySlateGame('americanfootball_ncaaf', date, id);
      }
      if (!targetGame?.commence_time) throw new Error(`Kickoff missing for college prop ${id}`);
      if (new Date(targetGame.commence_time).getTime() <= Date.now()) return;
      const slateDate = ncaafSlateDateForInstant(targetGame.commence_time);
      const { data, error } = await winnersAdmin.from(toTestTable ? 'test_prop_picks' : 'prop_picks')
        .select('picks').eq('date', slateDate).maybeSingle();
      if (error) throw new Error(`Could not read college prop ${id}: ${error.message}`);
      if ((data?.picks || []).some(p => String(p.bdl_game_id ?? p.game_id) === String(id)
          && String(p.sport || p.league).toUpperCase() === 'NCAAF')) {
        console.log(`[NCAAF Piggyback] game ${id} already has its prop`);
        if (!toTestTable) resolveMlbDataFailure({ game_id: id }, { league: 'NCAAF', kind: 'props' });
        return;
      }
      const { runNcaafPiggyback } = await loadPiggyback();
      const result = await runNcaafPiggyback({ game: targetGame, pickText: pick.pick, rationale: pick.rationale });
      if (!result.picks.length) {
        const error = new Error(`NCAAF game ${id}: ${result.reason || 'Gary returned no prop'} (menu ${result.menuSize})`);
        error.code = 'NCAAF_PROP_UNAVAILABLE';
        throw error;
      }
      await storeNcaafPiggybackProps(result.picks, { useTestTable: toTestTable, winnersEvidence: result.winnersEvidence });
      if (!toTestTable) resolveMlbDataFailure({ game_id: id }, { league: 'NCAAF', kind: 'props' });
      console.log(`[NCAAF Piggyback] ${id}: ${result.picks[0].player} ${result.picks[0].bet} ${result.picks[0].prop} ${result.picks[0].line} @ ${result.picks[0].odds}`);
    } catch (error) {
      recordMlbDataFailure(targetGame || { id }, error, { league: 'NCAAF', kind: 'props' });
      console.warn(`[NCAAF Piggyback] ${error.message} — published game pick retained; missing prop remains retryable`);
    }
  }

  async function storeNcaafPiggybackProps(rows, { useTestTable: toTestTable = false, winnersEvidence = null } = {}) {
    if (!rows.length) return;
    const { storePropPicksAtomic, stampFootballTdCategory } = await loadStorage();

    const byDate = new Map();
    for (const row of rows) {
      const date = ncaafSlateDateForInstant(row.commence_time);
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date).push(row);
    }

    if (toTestTable) {
      for (const [date, datePicks] of byDate) {
        const stamped = datePicks.map((p) => stampFootballTdCategory(p, 'NCAAF'));
        const { data: existing, error: readErr } = await supabase
          .from('test_prop_picks').select('picks').eq('date', date).maybeSingle();
        if (readErr) throw new Error(`test_prop_picks read failed for ${date}: ${readErr.message}`);
        const kept = (existing?.picks || []).filter((p) =>
          !stamped.some((n) => String(p.game_id) === String(n.game_id)
            && (p.player || '').toLowerCase() === (n.player || '').toLowerCase()
            && (p.prop || '') === (n.prop || '')));
        const { error: upsertErr } = await supabase.from('test_prop_picks')
          .upsert({ date, picks: [...kept, ...stamped], created_at: new Date().toISOString() });
        if (upsertErr) throw new Error(`test_prop_picks upsert failed for ${date}: ${upsertErr.message}`);
        console.log(`🧪 [NCAAF Piggyback] TEST: ${stamped.length} prop(s) → test_prop_picks (${date})`);
      }
      return;
    }

    for (const [date, datePicks] of byDate) {
      const result = await storePropPicksAtomic({
        client: winnersAdmin,
        date,
        leagueLabel: 'NCAAF',
        picks: datePicks,
        winnersEvidenceByGame: Object.fromEntries(datePicks.map(p => [String(p.game_id), winnersEvidence || {}])),
        forceRun: false,
      });
      console.log(`✅ [NCAAF Piggyback] atomic prop storage (${date}): ${result.added} added, ${result.skipped} already present`);
    }
  }
  return { completeNcaafProp, storeNcaafPiggybackProps };
}
