/**
 * THE CLOSING-LINE READ (founder GO, Sep 3 2026 — "the ledger is cheap and
 * I'd still build it, because without it every test we run gets read on
 * win-loss").
 *
 * For each stored game pick: the price Gary took, the same ticket's price at
 * first pitch (the close), and the day's first price (the open), all turned
 * into vig-free probabilities of the picked side, so two questions get a
 * number:
 *   1. pick → close: did the world move toward Gary's side after he picked?
 *      (`clv_pts`, probability points; positive = toward him)
 *   2. open → close: was Gary on the side the whole day's information moved
 *      toward, no matter when he picked? (`open_to_close_pts`)
 * Read over 200-300 picks these separate reading from luck in weeks; win-loss
 * takes thousands. Nothing here reaches Gary — it is the founder's ruler.
 *
 * Pure functions; the runner owns the fetches.
 */

/** American price → implied probability (with the vig still in it). Null when unpriced. */
export function impliedProb(american) {
  const o = Number(american);
  if (!Number.isFinite(o) || o === 0) return null;
  return o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100);
}

/** Vig-free probability of the side priced `mine` against the other side priced `theirs`. */
export function fairProb(mine, theirs) {
  const a = impliedProb(mine);
  if (a == null) return null;
  const b = impliedProb(theirs);
  if (b == null) return null;
  return a / (a + b);
}

/** The club named on the ticket (text before ' ML', ' -1.5', ' +1.5', or a spread). */
export function pickTeamOf(pickText) {
  return String(pickText || '').replace(/\s+(ML|[+-]\d+(\.\d+)?)(\s+[+-]?\d{3,4})?\s*$/i, '').replace(/\s+[+-]\d{3,4}\s*$/, '').trim();
}

/** 'home' | 'away' | null for a stored pick. */
export function pickSideOf(pick) {
  const team = pickTeamOf(pick?.pick).toLowerCase();
  const home = String(pick?.homeTeam || '').toLowerCase();
  const away = String(pick?.awayTeam || '').toLowerCase();
  if (!team) return null;
  if (team === home || (home && home.endsWith(team))) return 'home';
  if (team === away || (away && away.endsWith(team))) return 'away';
  return null;
}

/** The pick's spread point when it is a spread / run-line ticket, else null. */
export function pickPointOf(pick) {
  const type = String(pick?.type || '').toLowerCase();
  if (type !== 'spread') return null;
  const m = String(pick?.pick || '').match(/\s([+-]\d+(?:\.\d+)?)(?:\s|$)/);
  if (m) return Number(m[1]);
  const sp = Number(pick?.spread);
  return Number.isFinite(sp) ? sp : null;
}

/**
 * The two prices of the pick's ticket on one snapshot row: `mine` for the
 * picked side, `theirs` for the other. Spread tickets only match when the
 * row still carries the same point (a moved number is a different ticket).
 */
export function ticketPrices(row, side, betType, point = null) {
  if (!row || (side !== 'home' && side !== 'away')) return null;
  const other = side === 'home' ? 'away' : 'home';
  if (String(betType || '').toLowerCase() === 'spread') {
    const rowPoint = Number(row[`spread_${side}`]);
    if (point != null && (!Number.isFinite(rowPoint) || rowPoint !== Number(point))) return null;
    const mine = row[`spread_${side}_odds`];
    const theirs = row[`spread_${other}_odds`];
    return mine == null || theirs == null ? null : { mine: Number(mine), theirs: Number(theirs) };
  }
  const mine = row[`moneyline_${side}`];
  const theirs = row[`moneyline_${other}`];
  return mine == null || theirs == null ? null : { mine: Number(mine), theirs: Number(theirs) };
}

const ts = (iso) => (iso ? new Date(iso).getTime() : NaN);
const bookOf = (v) => (v == null ? null : String(v).toLowerCase());

/**
 * Pick the open (earliest board of the day) and the close (latest board at or
 * before first pitch + `graceMs`), preferring the pick's own book when it has
 * rows, else any book. Snapshots are one game's rows, any order.
 */
export function pickOpenAndClose(snapshots, { book = null, commenceTime = null, graceMs = 10 * 60 * 1000 } = {}) {
  const rows = (snapshots || []).filter((r) => Number.isFinite(ts(r.seen_at))).sort((a, b) => ts(a.seen_at) - ts(b.seen_at));
  if (!rows.length) return { open: null, close: null, book: null };
  const cutoff = Number.isFinite(ts(commenceTime)) ? ts(commenceTime) + graceMs : Infinity;
  const pool = book ? rows.filter((r) => bookOf(r.line_vendor) === bookOf(book)) : [];
  const use = pool.length ? pool : rows;
  const open = use[0];
  const beforePitch = use.filter((r) => ts(r.seen_at) <= cutoff);
  const close = beforePitch.length ? beforePitch[beforePitch.length - 1] : null;
  return { open, close, book: pool.length ? bookOf(book) : (open?.line_vendor ?? null) };
}

const pts = (a, b) => (a == null || b == null ? null : Math.round((b - a) * 1000) / 10);

/**
 * One ledger row for one pick. `snapshots` = that game's odds_snapshots rows
 * (all books). The pick's own stored prices give the pick-time probability
 * for moneylines (both sides ride the pick); a spread pick falls back to the
 * board nearest 90 minutes before first pitch from the same book.
 */
export function readPick(pick, snapshots, { commenceTime = null } = {}) {
  const side = pickSideOf(pick);
  const betType = String(pick?.type || (pickPointOf(pick) != null ? 'spread' : 'moneyline')).toLowerCase();
  const point = pickPointOf(pick);
  const book = bookOf(pick?.bestLineBook || pick?.line_vendor);
  const notes = [];
  const base = {
    game_date: pick?.game_date ?? null,
    league: String(pick?.league || pick?.sport || '').toUpperCase(),
    game_id: pick?.game_id != null ? String(pick.game_id) : null,
    pick_text: String(pick?.pick || ''),
    side,
    bet_type: betType,
    point,
    book,
    price_pick: Number.isFinite(Number(pick?.odds)) ? Number(pick.odds) : null,
    prob_pick: null,
    open_seen_at: null, price_open: null, prob_open: null,
    close_seen_at: null, price_close: null, prob_close: null,
    clv_pts: null, open_to_close_pts: null,
    right_side_pick: null, right_side_open: null,
    result: pick?.result ?? null,
    notes: '',
  };
  if (!side) { notes.push('side unrecognised'); return { ...base, notes: notes.join('; ') }; }

  // Pick-time probability.
  if (betType === 'moneyline') {
    const mine = Number(pick?.odds);
    const theirs = Number(side === 'home' ? pick?.moneylineAway : pick?.moneylineHome);
    base.prob_pick = fairProb(mine, theirs);
    if (base.prob_pick == null) notes.push('pick-time pair missing');
  } else {
    const start = ts(commenceTime);
    const target = Number.isFinite(start) ? start - 90 * 60 * 1000 : NaN;
    const same = (snapshots || []).filter((r) => (!book || bookOf(r.line_vendor) === book) && ticketPrices(r, side, betType, point));
    const near = same.length && Number.isFinite(target)
      ? same.slice().sort((a, b) => Math.abs(ts(a.seen_at) - target) - Math.abs(ts(b.seen_at) - target))[0]
      : null;
    const p = near ? ticketPrices(near, side, betType, point) : null;
    base.prob_pick = p ? fairProb(p.mine, p.theirs) : null;
    if (base.price_pick == null && p) base.price_pick = p.mine;
    if (!p) notes.push('no pick-time board at this point');
  }

  const { open, close, book: usedBook } = pickOpenAndClose(snapshots, { book, commenceTime });
  if (usedBook && book && usedBook !== book) notes.push(`open/close from ${usedBook}, pick from ${book}`);
  const o = open ? ticketPrices(open, side, betType, point) : null;
  const c = close ? ticketPrices(close, side, betType, point) : null;
  if (open && !o) notes.push('open board carries a different point');
  if (close && !c) notes.push('close board carries a different point');
  if (o) { base.open_seen_at = open.seen_at; base.price_open = o.mine; base.prob_open = fairProb(o.mine, o.theirs); }
  if (c) { base.close_seen_at = close.seen_at; base.price_close = c.mine; base.prob_close = fairProb(c.mine, c.theirs); }
  base.clv_pts = pts(base.prob_pick, base.prob_close);
  base.open_to_close_pts = pts(base.prob_open, base.prob_close);
  base.right_side_pick = base.clv_pts == null ? null : base.clv_pts > 0;
  base.right_side_open = base.open_to_close_pts == null ? null : base.open_to_close_pts > 0;
  base.notes = notes.join('; ');
  return base;
}

/** The founder's Monday read over a set of rows. */
export function summarizeClosingLine(rows) {
  const withClv = (rows || []).filter((r) => r.clv_pts != null);
  const withOpen = (rows || []).filter((r) => r.open_to_close_pts != null);
  const rec = (rs, key) => {
    if (!rs.length) return { n: 0, right: 0, rate: null, mean_pts: null };
    const right = rs.filter((r) => r[key] > 0).length;
    const mean = rs.reduce((s, r) => s + r[key], 0) / rs.length;
    return { n: rs.length, right, rate: Math.round((1000 * right) / rs.length) / 10, mean_pts: Math.round(mean * 100) / 100 };
  };
  const isFav = (r) => Number(r.price_pick) < 0;
  return {
    pickToClose: rec(withClv, 'clv_pts'),
    openToClose: rec(withOpen, 'open_to_close_pts'),
    favorites: { pickToClose: rec(withClv.filter(isFav), 'clv_pts'), openToClose: rec(withOpen.filter(isFav), 'open_to_close_pts') },
    dogs: { pickToClose: rec(withClv.filter((r) => !isFav(r)), 'clv_pts'), openToClose: rec(withOpen.filter((r) => !isFav(r)), 'open_to_close_pts') },
    unread: (rows || []).length - withClv.length,
  };
}
