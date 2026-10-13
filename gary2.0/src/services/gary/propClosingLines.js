// Closing prices for published props (founder GO, Sep 23 2026). Internal
// measurement only: never shown in the app, never read by Gary. The props
// runner calls this from its "already stored" retries at T-30 and T-15; the
// last write before first pitch stands as the close. One BDL read per game.

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const CAPTURE_WINDOW_MIN = 45;

/** Record the current best price of each stored pick for this game. Never throws. */
export async function recordClosingPrices({ supabase, picks, game, league, slateDate, fetchMarkets }) {
  try {
    if (!supabase || !Array.isArray(picks) || !picks.length || !game?.commence_time) return 0;
    const minutes = Math.round((Date.parse(game.commence_time) - Date.now()) / 60000);
    if (minutes > CAPTURE_WINDOW_MIN || minutes < -5) return 0;
    const rows = await fetchMarkets();
    if (!Array.isArray(rows) || !rows.length) return 0;
    const writes = [];
    for (const pick of picks) {
      const [propType] = String(pick.prop || '').split(' ');
      const bet = String(pick.bet || '').toLowerCase();
      const line = Number(pick.line);
      const row = rows.find(r => norm(r.player) === norm(pick.player) && String(r.prop_type).toLowerCase() === propType.toLowerCase()
        && Number(r.line) === line);
      const close = row ? (bet === 'under' ? row.under_odds : row.over_odds) : null;
      if (close == null) continue;
      writes.push({
        game_date: slateDate, league, game_id: String(pick.game_id ?? game.bdl_game_id ?? game.id),
        player: pick.player, prop: pick.prop, bet,
        taken_odds: Number.isFinite(Number(pick.odds)) ? Number(pick.odds) : null,
        close_odds: Number(close), minutes_before: minutes, captured_at: new Date().toISOString(),
      });
    }
    if (!writes.length) return 0;
    const { error } = await supabase.from('prop_closing_lines').upsert(writes, { onConflict: 'game_date,league,game_id,player,prop,bet' });
    if (error) throw error;
    console.log(`📈 Closing prices: ${writes.length}/${picks.length} ${league} prop(s) recorded ${minutes} min before first pitch`);
    return writes.length;
  } catch (error) {
    console.warn(`[Closing prices] skipped: ${error.message}`);
    return 0;
  }
}
