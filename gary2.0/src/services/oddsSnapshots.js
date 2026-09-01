/**
 * ODDS SNAPSHOTS (founder GO, Sep 1 2026 — "make the price a real leg"):
 * every MLB board the odds service fetches is recorded once per change, so
 * the desk can say where a line opened for the day and where it is now.
 * Our own T90/T60/T30/T15 fetches were the free source nobody kept.
 *
 * Fail-open everywhere: a ledger write or read that fails never touches a
 * pick run. Writes only when the board changed since the last row for that
 * game (or on the first sighting), so the table stays small.
 */
// The client loads lazily: this module is imported by the odds service,
// which many env-less callers (and tests) import — the ledger must never
// be the reason the slate fails to load.
let _db = null;
async function db() {
  if (!_db) {
    const m = await import('../supabaseClient.js');
    _db = m.supabaseAdmin || m.supabase;
  }
  return _db;
}
const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const etDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) : null);

function boardOf(g) {
  return {
    moneyline_home: num(g.moneyline_home),
    moneyline_away: num(g.moneyline_away),
    spread_home: num(g.spread_home),
    spread_home_odds: num(g.spread_home_odds),
    spread_away: num(g.spread_away),
    spread_away_odds: num(g.spread_away_odds),
  };
}
const sameBoard = (a, b) => a && b && ['moneyline_home', 'moneyline_away', 'spread_home', 'spread_home_odds', 'spread_away', 'spread_away_odds']
  .every((k) => (a[k] ?? null) === (b[k] ?? null));

/** Record the boards of a fetched slate. Never throws. */
export async function recordOddsSnapshots(sport, games) {
  try {
    if (sport !== 'baseball_mlb' || !Array.isArray(games) || games.length === 0) return 0;
    const rows = games
      .map((g) => {
        const gameId = String(g.bdl_game_id ?? g.id ?? '');
        const gameDate = etDate(g.start_time || g.commence_time);
        if (!gameId || !gameDate) return null;
        const board = boardOf(g);
        if (board.moneyline_home == null && board.moneyline_away == null && board.spread_home_odds == null) return null;
        return { sport, game_date: gameDate, game_id: gameId, home_team: String(g.home_team || ''), away_team: String(g.away_team || ''), ...board };
      })
      .filter(Boolean);
    if (!rows.length) return 0;
    const dates = [...new Set(rows.map((r) => r.game_date))];
    const { data: latest } = await (await db())
      .from('odds_snapshots')
      .select('game_id, game_date, moneyline_home, moneyline_away, spread_home, spread_home_odds, spread_away, spread_away_odds, seen_at')
      .eq('sport', sport)
      .in('game_date', dates)
      .order('seen_at', { ascending: false });
    const lastByGame = new Map();
    for (const r of latest || []) {
      const k = `${r.game_date}|${r.game_id}`;
      if (!lastByGame.has(k)) lastByGame.set(k, r);
    }
    const changed = rows.filter((r) => !sameBoard(lastByGame.get(`${r.game_date}|${r.game_id}`), r));
    if (!changed.length) return 0;
    const { error } = await (await db()).from('odds_snapshots').insert(changed);
    if (error) { console.warn(`[Odds Snapshots] insert failed: ${error.message}`); return 0; }
    return changed.length;
  } catch (e) {
    console.warn(`[Odds Snapshots] record failed: ${e.message}`);
    return 0;
  }
}

/**
 * The day's first and latest boards for one game, plus how many distinct
 * boards were seen. Null when nothing is recorded. Never throws.
 */
export async function getOddsHistory(sport, gameDate, gameId) {
  try {
    const { data, error } = await (await db())
      .from('odds_snapshots')
      .select('moneyline_home, moneyline_away, spread_home, spread_home_odds, spread_away, spread_away_odds, seen_at')
      .eq('sport', sport)
      .eq('game_date', gameDate)
      .eq('game_id', String(gameId))
      .order('seen_at', { ascending: true });
    if (error || !data?.length) return null;
    return { first: data[0], latest: data[data.length - 1], boards: data.length };
  } catch {
    return null;
  }
}

const fmtMl = (v) => (v == null ? '—' : v > 0 ? `+${v}` : `${v}`);
const fmtRl = (line, price) => (line == null ? '—' : `${line > 0 ? '+' : ''}${line}${price != null ? ` (${price > 0 ? '+' : ''}${price})` : ''}`);
const fmtEt = (iso) => new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });

/**
 * The desk's line-history lines for a game. `now` is the board on the game
 * row being built (the latest fetch); history supplies the day's first
 * sighting. Facts only — where it opened, where it is.
 */
export function formatLineHistory(history, now, homeTeam, awayTeam) {
  if (!history?.first) return null;
  const f = history.first;
  const openMl = `${homeTeam} ${fmtMl(f.moneyline_home)} / ${awayTeam} ${fmtMl(f.moneyline_away)}`;
  const nowMl = `${homeTeam} ${fmtMl(num(now?.moneyline_home))} / ${awayTeam} ${fmtMl(num(now?.moneyline_away))}`;
  const openRl = `${homeTeam} ${fmtRl(f.spread_home, f.spread_home_odds)} / ${awayTeam} ${fmtRl(f.spread_away, f.spread_away_odds)}`;
  const nowRl = `${homeTeam} ${fmtRl(num(now?.spread_home), num(now?.spread_home_odds))} / ${awayTeam} ${fmtRl(num(now?.spread_away), num(now?.spread_away_odds))}`;
  const when = fmtEt(f.seen_at);
  if (openMl === nowMl && openRl === nowRl) {
    return `Line history today: unchanged since first seen at ${when} ET.`;
  }
  const bits = [`Line history today: first seen at ${when} ET — moneyline ${openMl}`];
  if (openMl !== nowMl) bits.push(`now ${nowMl}`);
  if (openRl !== nowRl) bits.push(`run line opened ${openRl}, now ${nowRl}`);
  return `${bits.join('; ')}.`;
}
