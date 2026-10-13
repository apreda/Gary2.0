// A PLAYER'S OWN LINE HISTORY (founder, Sep 24 2026): "his outs line was 14.5
// three starts ago and is 16.5 tonight". The props lane stores every market's
// line and price per game at seal time (prop_menu); the dart board keeps its
// own (dart_board_prices). public.player_price_history returns the named
// players' rows only. Facts, newest first; nothing says what a move means.

const fmt = (o) => (o == null ? null : Number(o) > 0 ? `+${Number(o)}` : String(o));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (d) => { const [, m, dd] = String(d).split('-').map(Number); return m ? `${MONTHS[m - 1]} ${dd}` : String(d); };

/** Rows for the players over the `days` before `date` (exclusive). A failed read returns an empty lookup. */
export async function loadPriceHistory(supabase, { league, players, date, days = 14 }) {
  const names = [...new Set((players || []).filter(Boolean))];
  const byKey = new Map();
  if (!names.length) return byKey;
  const from = new Date(Date.parse(`${date}T12:00:00Z`) - days * 86400000).toISOString().slice(0, 10);
  const to = new Date(Date.parse(`${date}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
  // Without a client (the props desks call over REST), the same RPC by fetch.
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const call = supabase ? (args) => supabase.rpc('player_price_history', args)
    : async (args) => {
      if (!url || !key) return { data: null, error: new Error('no database credentials') };
      try {
        const res = await fetch(`${url}/rest/v1/rpc/player_price_history`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args), signal: AbortSignal.timeout(15000) });
        return res.ok ? { data: await res.json(), error: null } : { data: null, error: new Error(`HTTP ${res.status}`) };
      } catch (e) { return { data: null, error: e }; }
    };
  for (let i = 0; i < names.length; i += 200) {
    const { data, error } = await call({ p_league: league, p_players: names.slice(i, i + 200), p_from: from, p_to: to });
    if (error) return byKey;
    for (const r of data || []) {
      const key = `${String(r.player).toLowerCase()}|${r.prop_type}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(r);
    }
  }
  return byKey;
}

/**
 * "his hits 1.5 before tonight, newest first: Sep 22 +210 · Sep 20 +240" — the
 * line itself when it moved ("pitcher_outs, newest first: Sep 18 16.5 (-120/-105)").
 */
export function priceHistoryLine(history, player, propType, { label = null, limit = 6, line = null } = {}) {
  const rows = (history?.get(`${String(player).toLowerCase()}|${propType}`) || []).filter((r) => line == null || Number(r.line) === Number(line));
  if (!rows.length) return null;
  // One row per date (the props menu wins over the dart board on a repeat), newest first.
  const byDate = new Map();
  for (const r of rows.sort((a, b) => (a.source === 'props menu' ? 1 : 0) - (b.source === 'props menu' ? 1 : 0))) byDate.set(`${r.game_date}|${r.line}`, r);
  const list = [...byDate.values()].sort((a, b) => String(b.game_date).localeCompare(String(a.game_date))).slice(0, limit);
  const lines = new Set(list.map((r) => String(r.line)));
  const one = (r) => {
    const price = [fmt(r.over_odds) && `over ${fmt(r.over_odds)}`, fmt(r.under_odds) && `under ${fmt(r.under_odds)}`].filter(Boolean).join(' / ');
    return `${day(r.game_date)} ${lines.size > 1 ? `${r.line} ` : ''}${price}`.trim();
  };
  const name = label || `${propType.replace(/_/g, ' ')}${lines.size === 1 ? ` ${[...lines][0]}` : ''}`;
  return `his ${name} before tonight, newest first: ${list.map(one).join(' · ')}`;
}
