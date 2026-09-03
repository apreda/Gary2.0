/**
 * ODDS SNAPSHOTS (founder GO, Sep 1 2026 — "make the price a real leg"):
 * every MLB/NFL/NCAAF board the odds service fetches is recorded once per change, so
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
// MLB and both football lanes keep price history (Sep 1 2026).
const SNAPSHOT_SPORTS = new Set(['baseball_mlb', 'americanfootball_nfl', 'americanfootball_ncaaf']);
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
    // The book the numbers came from: two books' prices are not a line
    // move (the odds service can legitimately switch vendors between
    // fetches), so history compares like with like.
    line_vendor: g.line_vendor ? String(g.line_vendor).toLowerCase() : null,
  };
}
const BOARD_KEYS = ['moneyline_home', 'moneyline_away', 'spread_home', 'spread_home_odds', 'spread_away', 'spread_away_odds', 'line_vendor'];
const sameBoard = (a, b) => a && b && BOARD_KEYS.every((k) => (a[k] ?? null) === (b[k] ?? null));

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * EVERY BOOK PER SNAPSHOT (founder GO, Sep 3 2026): the selected vendor's
 * board (what Gary saw) plus one board per bookmaker the odds feed carried,
 * so the closing-line read can compare a pick against its own book's close
 * and the ledger can see the whole market. Bookmakers arrive in the unified
 * shape { key, markets: [{ key: 'h2h'|'spreads', outcomes: [{ name, price, point }] }] }.
 */
export function boardsOfGame(g) {
  const selected = boardOf(g);
  const out = [];
  const seen = new Set();
  if (selected.moneyline_home != null || selected.moneyline_away != null || selected.spread_home_odds != null) {
    out.push(selected);
    if (selected.line_vendor) seen.add(selected.line_vendor);
  }
  const home = norm(g.home_team);
  const away = norm(g.away_team);
  for (const bk of Array.isArray(g.bookmakers) ? g.bookmakers : []) {
    const vendor = bk?.key ? String(bk.key).toLowerCase() : null;
    if (!vendor || seen.has(vendor)) continue;
    const board = { moneyline_home: null, moneyline_away: null, spread_home: null, spread_home_odds: null, spread_away: null, spread_away_odds: null, line_vendor: vendor };
    const sideOf = (name) => {
      const n = norm(name);
      if (!n) return null;
      if (n === home || home.endsWith(n) || n.endsWith(home)) return 'home';
      if (n === away || away.endsWith(n) || n.endsWith(away)) return 'away';
      return null;
    };
    for (const m of Array.isArray(bk.markets) ? bk.markets : []) {
      for (const o of Array.isArray(m?.outcomes) ? m.outcomes : []) {
        const side = sideOf(o?.name);
        if (!side) continue;
        if (m.key === 'h2h') board[`moneyline_${side}`] = num(o.price);
        if (m.key === 'spreads') { board[`spread_${side}`] = num(o.point); board[`spread_${side}_odds`] = num(o.price); }
      }
    }
    if (board.moneyline_home == null && board.moneyline_away == null && board.spread_home_odds == null) continue;
    seen.add(vendor);
    out.push(board);
  }
  return out;
}

/** Record the boards of a fetched slate — every book, on change only. Never throws. */
export async function recordOddsSnapshots(sport, games) {
  try {
    if (!SNAPSHOT_SPORTS.has(sport) || !Array.isArray(games) || games.length === 0) return 0;
    const rows = games
      .flatMap((g) => {
        const gameId = String(g.bdl_game_id ?? g.id ?? '');
        const gameDate = etDate(g.start_time || g.commence_time);
        if (!gameId || !gameDate) return [];
        return boardsOfGame(g).map((board) => ({ sport, game_date: gameDate, game_id: gameId, home_team: String(g.home_team || ''), away_team: String(g.away_team || ''), ...board }));
      })
      .filter(Boolean);
    if (!rows.length) return 0;
    const dates = [...new Set(rows.map((r) => r.game_date))];
    const { data: latest } = await (await db())
      .from('odds_snapshots')
      .select('game_id, game_date, moneyline_home, moneyline_away, spread_home, spread_home_odds, spread_away, spread_away_odds, line_vendor, seen_at')
      .eq('sport', sport)
      .in('game_date', dates)
      .order('seen_at', { ascending: false });
    const lastByGame = new Map();
    for (const r of latest || []) {
      const k = `${r.game_date}|${r.game_id}|${r.line_vendor ?? ''}`;
      if (!lastByGame.has(k)) lastByGame.set(k, r);
    }
    const changed = rows.filter((r) => !sameBoard(lastByGame.get(`${r.game_date}|${r.game_id}|${r.line_vendor ?? ''}`), r));
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
export async function getOddsHistory(sport, gameDate, gameId, vendor = null) {
  try {
    const { data, error } = await (await db())
      .from('odds_snapshots')
      .select('moneyline_home, moneyline_away, spread_home, spread_home_odds, spread_away, spread_away_odds, line_vendor, seen_at')
      .eq('sport', sport)
      .eq('game_date', gameDate)
      .eq('game_id', String(gameId))
      .order('seen_at', { ascending: true });
    if (error || !data?.length) return null;
    // Rows are one per book since Sep 3 2026. The desk's history is one
    // book's story: the caller's vendor when it has rows, else the book
    // with the most rows (the selected board's book on a normal day), so
    // "first seen" and "now" stay like for like.
    const want = vendor ? String(vendor).toLowerCase() : null;
    let rows = want ? data.filter((r) => (r.line_vendor ?? null) === want) : [];
    if (!rows.length) {
      const counts = new Map();
      for (const r of data) counts.set(r.line_vendor ?? '', (counts.get(r.line_vendor ?? '') || 0) + 1);
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
      rows = data.filter((r) => (r.line_vendor ?? '') === top);
    }
    return { first: rows[0], latest: rows[rows.length - 1], boards: rows.length };
  } catch {
    return null;
  }
}

const fmtMl = (v) => (v == null ? '—' : v > 0 ? `+${v}` : `${v}`);
const fmtRl = (line, price) => (line == null ? '—' : `${line > 0 ? '+' : ''}${line}${price != null ? ` (${price > 0 ? '+' : ''}${price})` : ''}`);
const fmtEt = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' });
const vendorName = (v) => (v ? String(v).replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : null);

/**
 * The desk's line-history line for a game. `now` is the board on the game
 * row being built (the latest fetch); history supplies the first sighting.
 * `scope` is the caller's word for the window — "today" for a daily slate,
 * "this week" for a football game whose board was first seen days out.
 * Facts only — where it opened, where it is, and which book each is from
 * when they differ, because two books' prices are not a move.
 */
export function formatLineHistory(history, now, homeTeam, awayTeam, scope = 'today', tickets = 'both') {
  if (!history?.first) return null;
  // Which tickets the sentence covers (MLB, Sep 2 2026: a moneyline game's
  // history is the moneyline; a run-line game's is the run line).
  const wantMl = tickets !== 'runline';
  const wantRl = tickets !== 'moneyline';
  const f = history.first;
  const nowBoard = boardOf(now || {});
  const openMl = `${homeTeam} ${fmtMl(f.moneyline_home)} / ${awayTeam} ${fmtMl(f.moneyline_away)}`;
  const nowMl = `${homeTeam} ${fmtMl(nowBoard.moneyline_home)} / ${awayTeam} ${fmtMl(nowBoard.moneyline_away)}`;
  const openRl = `${homeTeam} ${fmtRl(f.spread_home, f.spread_home_odds)} / ${awayTeam} ${fmtRl(f.spread_away, f.spread_away_odds)}`;
  const nowRl = `${homeTeam} ${fmtRl(nowBoard.spread_home, nowBoard.spread_home_odds)} / ${awayTeam} ${fmtRl(nowBoard.spread_away, nowBoard.spread_away_odds)}`;
  const when = fmtEt(f.seen_at);
  const sameBook = (f.line_vendor ?? null) === (nowBoard.line_vendor ?? null) || !f.line_vendor || !nowBoard.line_vendor;
  if ((!wantMl || openMl === nowMl) && (!wantRl || openRl === nowRl)) {
    return `Line history ${scope}: unchanged since first seen ${when} ET.`;
  }
  if (!sameBook) {
    // Different books, different numbers — say so rather than call it a move.
    const openBits = [wantMl ? `moneyline ${openMl}` : null, wantRl ? `run/spread line ${openRl}` : null].filter(Boolean).join(', ');
    const nowBits = [wantMl ? `moneyline ${nowMl}` : null, wantRl ? `line ${nowRl}` : null].filter(Boolean).join(', ');
    return `Line history ${scope}: first seen ${when} ET at ${vendorName(f.line_vendor)} — ${openBits}; the board now shows ${vendorName(nowBoard.line_vendor)} — ${nowBits}. Different books; not a like-for-like move.`;
  }
  const bits = [`Line history ${scope}: first seen ${when} ET — ${wantMl ? `moneyline ${openMl}` : `line ${openRl}`}`];
  if (wantMl && openMl !== nowMl) bits.push(`now ${nowMl}`);
  if (wantRl && openRl !== nowRl) bits.push(wantMl ? `line opened ${openRl}, now ${nowRl}` : `now ${nowRl}`);
  return `${bits.join('; ')}.`;
}
