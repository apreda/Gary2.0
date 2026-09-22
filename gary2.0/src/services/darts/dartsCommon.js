// DARTS (founder, Sep 22 2026): Gary's fun leans for the day, thrown every
// morning from the day's real markets. Their own lane: they never touch game
// picks, prop picks, the grader, the Billfold, Winners or any record. Gary
// always throws; a category is never empty while the board has a market in it.

export const DART_COUNT = 5;

// The categories, in page order. `label` is what the ask and the board print.
export const DART_CATEGORIES = {
  MLB: [
    { kind: 'hr', label: 'HOME RUN' },
    { kind: 'hits_run', label: '2+ HITS AND A RUN' },
    { kind: 'first_inning', label: 'FIRST-INNING RUN' },
  ],
  NFL: [
    { kind: 'td', label: 'ANYTIME TD' },
    { kind: 'tetd', label: 'TIGHT END TD' },
    { kind: 'qbtd', label: 'QB RUSHING TD' },
    { kind: 'ftd', label: 'FIRST TD' },
    { kind: 'recyds', label: 'RECEIVING YARDS' },
    { kind: 'passtd', label: 'PASSING TDS' },
    { kind: 'int', label: 'INTERCEPTION THROWN' },
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
