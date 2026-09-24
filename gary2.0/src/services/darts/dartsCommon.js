// DARTS (founder, Sep 22 2026): Gary's fun leans for the day, thrown every
// morning from the day's real markets. Their own lane: they never touch game
// picks, prop picks, the grader, the Billfold, Winners or any record. Gary
// always throws; a category is never empty while the board has a market in it.

export const DART_COUNT = 5;

/**
 * How many darts a category gets today. MLB: five. NFL (founder, Sep 23
 * 2026: "on Sunday we do 5... on Thursday night football, at least 1 or 2"):
 * one more than the games left to kick off that day, never more than five,
 * so a one-game Thursday or Monday gets two and a Sunday slate five.
 */
export function dartCount(league, games) {
  if (league !== 'NFL') return DART_COUNT;
  return Math.min(DART_COUNT, Math.max(1, Number(games) || 0) + 1);
}

/**
 * Every category's count today (founder, Sep 24 2026). MLB: five each. NFL:
 * receiving yards two or three a game ("we should only pick, per game, about
 * two or three receivers"): three on a one-game night, five on two games,
 * five on a full slate; rushing yards one back on a one-game night, two on
 * two games, five on a full slate; passing TDs and interceptions one for each
 * quarterback on a one-game night, five on a full slate; QB rushing TDs three
 * on a Sunday, otherwise one more than the games; anytime TD one more than
 * the games, never more than five.
 */
export function dartCounts(league, games, date) {
  const kinds = DART_CATEGORIES[league].map((c) => c.kind);
  if (league !== 'NFL') return Object.fromEntries(kinds.map((k) => [k, DART_COUNT]));
  const g = Math.max(1, Number(games) || 0);
  const sunday = new Date(`${date}T12:00:00Z`).getUTCDay() === 0;
  const perGame = Math.min(DART_COUNT, 2 * g);
  return {
    td: dartCount(league, g),
    qbtd: sunday ? 3 : Math.min(3, g + 1),
    recyds: g === 1 ? 3 : DART_COUNT,
    rushyds: g === 1 ? 1 : g === 2 ? 2 : DART_COUNT,
    passtd: perGame,
    int: perGame,
  };
}

/** NFL categories Gary takes a side on (over or under the main line). */
export const SIDED_KINDS = new Set(['recyds', 'rushyds', 'passtd', 'int']);

// The categories, in page order. `label` is what the ask and the board print.
export const DART_CATEGORIES = {
  MLB: [
    { kind: 'hr', label: 'HOME RUN' },
    { kind: 'multihit', label: '2+ HITS' },
    { kind: 'first_inning', label: 'FIRST-INNING RUN' },
  ],
  // Tight end TD and first TD dropped (founder, Sep 23 2026); rushing yards
  // added and the yardage and quarterback lines taken either way (Sep 24).
  NFL: [
    { kind: 'td', label: 'ANYTIME TD' },
    { kind: 'qbtd', label: 'QB RUSHING TD' },
    { kind: 'recyds', label: 'RECEIVING YARDS' },
    { kind: 'rushyds', label: 'RUSHING YARDS' },
    { kind: 'passtd', label: 'PASSING TDS' },
    { kind: 'int', label: 'INTERCEPTIONS' },
  ],
};

// One consistent book per price: the first of these that posts it.
const BOOK_ORDER = ['draftkings', 'fanduel', 'betmgm', 'caesars', 'fanatics', 'espnbet', 'bet365', 'betrivers'];
const bookRank = (vendor) => {
  const i = BOOK_ORDER.indexOf(String(vendor || '').toLowerCase());
  return i < 0 ? BOOK_ORDER.length : i;
};

/**
 * The yes/over price of one market from BDL prop rows (milestone or
 * over_under), taken from the first book in BOOK_ORDER that posts it.
 * Returns { odds, book, line } or null.
 */
export function overPrice(rows, { propType, line = null } = {}) {
  const priced = (rows || [])
    .filter((r) => r.prop_type === propType && (line == null || Number(r.line_value) === Number(line)))
    .map((r) => ({
      odds: r.market?.type === 'milestone' ? r.market?.odds : r.market?.over_odds,
      book: r.vendor,
      line: Number(r.line_value),
      type: r.market?.type,
    }))
    .filter((p) => Number.isFinite(Number(p.odds)));
  if (!priced.length) return null;
  priced.sort((a, b) => bookRank(a.book) - bookRank(b.book));
  const best = priced[0];
  return { odds: Number(best.odds), book: best.book, line: best.line };
}

/**
 * The main two-sided line of a market with both prices, from the first book
 * in BOOK_ORDER that posts both. Returns { line, over, under, book } or null.
 */
export function mainLineBoth(rows, propType) {
  const ou = (rows || []).filter((r) => r.prop_type === propType && r.market?.type === 'over_under'
    && Number.isFinite(Number(r.market?.over_odds)) && Number.isFinite(Number(r.market?.under_odds)));
  if (!ou.length) return null;
  ou.sort((a, b) => bookRank(a.vendor) - bookRank(b.vendor));
  const r = ou[0];
  return { line: Number(r.line_value), over: Number(r.market.over_odds), under: Number(r.market.under_odds), book: r.vendor };
}

/** The main two-sided line of a market (the over_under row), first book in order. */
export function mainLineOver(rows, propType) {
  const ou = (rows || []).filter((r) => r.prop_type === propType && r.market?.type === 'over_under' && Number.isFinite(Number(r.market?.over_odds)));
  if (!ou.length) return null;
  ou.sort((a, b) => bookRank(a.vendor) - bookRank(b.vendor));
  const r = ou[0];
  return { odds: Number(r.market.over_odds), book: r.vendor, line: Number(r.line_value) };
}

export const fmtOdds = (o) => (o == null ? '' : o > 0 ? `+${o}` : String(o));

export function etDate(ms = Date.now()) {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

export function etClock(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })} ET`;
}

export function etMinutes(ms = Date.now()) {
  const [h, m] = new Date(ms).toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).split(':').map(Number);
  return h * 60 + m;
}

/** "Christian Encarnación-Strand Jr." → "christian encarnacion strand" */
export function normName(name) {
  return String(name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Club nickname: "Toronto Blue Jays" → "Blue Jays", "Green Bay Packers" → "Packers". */
export function clubShort(full) {
  const parts = String(full || '').trim().split(/\s+/);
  const twoWord = ['Red Sox', 'White Sox', 'Blue Jays'];
  const tail2 = parts.slice(-2).join(' ');
  return twoWord.includes(tail2) ? tail2 : parts[parts.length - 1] || String(full || '');
}
