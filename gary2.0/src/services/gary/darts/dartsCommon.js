// DARTS (founder, Sep 22 2026): Gary's fun leans for the day, thrown every
// morning from the day's real markets. Their own lane: they never touch game
// picks, prop picks, the grader, the Billfold, Winners or any record. Gary
// always throws; a category is never empty while the board has a market in it.

export const DART_COUNT = 5;

/**
 * How many anytime-TD darts the NFL gets today (MLB's counts are in dartCounts). NFL (founder, Sep 23
 * 2026: "on Sunday we do 5... on Thursday night football, at least 1 or 2"):
 * one more than the games left to kick off that day, never more than five,
 * so a one-game Thursday or Monday gets two and a Sunday slate five.
 */
export function dartCount(league, games) {
  if (league !== 'NFL') return DART_COUNT;
  return Math.min(DART_COUNT, Math.max(1, Number(games) || 0) + 1);
}

/**
 * Every category's count today (founder, Sep 24 2026). MLB (Oct 13 2026): one
 * more than the games, at most five (home runs: at most that, see FLEX_KINDS),
 * one first-inning dart a game. NFL:
 * receiving yards two or three a game ("we should only pick, per game, about
 * two or three receivers"): three on a one-game night, five on two games,
 * five on a full slate; rushing yards one back on a one-game night, two on
 * two games, five on a full slate; passing TDs one for each quarterback on a
 * one-game night, five on a full slate; QB rushing TDs three and
 * interceptions up to five on a Sunday, none on any other day ("on Sunday
 * we're going to pick three quarterbacks... no need to have it here"; the
 * same for interceptions); anytime TD one more than the games, never more
 * than five.
 */
export function dartCounts(league, games, date) {
  const kinds = DART_CATEGORIES[league].map((c) => c.kind);
  // MLB scales with the slate like the NFL (founder, Oct 13 2026: "when there's only one MLB game, we do not need to
  // be doing four home runs and four darts for all of these ... a reasonable number of darts per number of games"):
  // one more than the games in each category, never more than five (a one-game day: two H+R+RBI, two total bases,
  // up to two home runs), and one first-inning dart a game. It was five in every category whatever the slate.
  if (league === 'MLB') {
    const g = Math.max(1, Number(games) || 0);
    const each = Math.min(DART_COUNT, g + 1);
    return { hrr: each, tb: each, hr: each, first_inning: Math.min(DART_COUNT, g) };
  }
  // NBA (Oct 19 2026, the opener): one more than the games in each category, never more than five, like MLB.
  if (league === 'NBA') {
    const each = Math.min(DART_COUNT, Math.max(1, Number(games) || 0) + 1);
    return Object.fromEntries(kinds.map((k) => [k, each]));
  }
  if (league !== 'NFL') return Object.fromEntries(kinds.map((k) => [k, DART_COUNT]));
  const g = Math.max(1, Number(games) || 0);
  const sunday = new Date(`${date}T12:00:00Z`).getUTCDay() === 0;
  const perGame = Math.min(DART_COUNT, 2 * g);
  return {
    td: dartCount(league, g),
    qbtd: sunday ? 3 : 0,
    recyds: g === 1 ? 3 : DART_COUNT,
    rushyds: g === 1 ? 1 : g === 2 ? 2 : DART_COUNT,
    passtd: perGame,
    int: sunday ? perGame : 0,
  };
}

/**
 * Categories where Gary throws as many as he thinks will hit (founder, Oct 1
 * 2026: "if he thinks 5 will, great; if not then 1, 2 etc is fine. 1 is the
 * min, 5 is the max"): at least FLEX_MIN, at most the category's count.
 */
// THE SAME BET ONCE (founder GO, Oct 10 2026: "if it happens to be the same bet for ... H R RBI and total
// bases then let's just keep it at one of them ... I don't want to replace the one we remove"). An H+R+RBI
// dart and a total-bases dart on the same player, side and line are one read. The one Gary ranked higher in
// its own category stays (a tie keeps H+R+RBI, the first tab; a dart already on the board always stays). The
// other is stored scratched as "repeat of <kind> #<rank>": hidden from the board, never graded or bet, and
// nothing is thrown in its place.
export const REPEAT_PAIRS = Object.freeze({ hrr: 'tb', tb: 'hrr' });
export const isRepeatDart = (d) => /^repeat of /.test(String(d?.scratch_reason || ''));
export const repeatKey = (d) => `${normName(d?.player || '')}|${String(d?.bet || '').toLowerCase()}|${String(d?.prop || '').trim().split(/\s+/).pop()}`;

export const FLEX_KINDS = new Set(['hr']);
export const FLEX_MIN = 1;

/** Categories Gary takes a side on (over or under the main line). */
export const SIDED_KINDS = new Set(['hrr', 'tb', 'recyds', 'rushyds', 'passtd', 'int', 'pts', 'reb', 'ast', 'threes', 'pra']);

// The categories, in page order. `label` is what the ask and the board print.
export const DART_CATEGORIES = {
  // H+R+RBI and total bases, over or under, replace 2+ hits for good; home
  // runs third, the first inning last (founder, Oct 1 2026).
  MLB: [
    { kind: 'hrr', label: 'H+R+RBI' },
    { kind: 'tb', label: 'TOTAL BASES' },
    { kind: 'hr', label: 'HOME RUN' },
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
  // NBA (Oct 19 2026, the opener): the main over/under line in each, either way.
  NBA: [
    { kind: 'pts', label: 'POINTS' },
    { kind: 'reb', label: 'REBOUNDS' },
    { kind: 'ast', label: 'ASSISTS' },
    { kind: 'threes', label: 'THREES' },
    { kind: 'pra', label: 'PTS+REB+AST' },
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
 * A book's over/under rows for one market. A book that prints two for the same player has one mislabeled: FanDuel
 * files its rushing + receiving yards as receiving yards (Blake Corum "under 40.5 receiving yards" against a real 2.5,
 * Oct 12 2026). Its row nearest the other books' lines still counts toward the line (round 13: dropping the whole book
 * let one book's outlier become the dart line), marked `doubled` so it never prices the line (the props board's
 * ambiguousBookLines rule).
 */
function mainLineRows(rows, propType) {
  const ou = (rows || []).filter((r) => r.prop_type === propType && r.market?.type === 'over_under');
  const perBook = new Map();
  for (const r of ou) {
    const key = `${r.vendor}|${r.player_id}`;
    perBook.set(key, [...(perBook.get(key) || []), r]);
  }
  const out = [];
  for (const list of perBook.values()) {
    if (list.length === 1) { out.push(list[0]); continue; }
    const others = ou.filter((r) => !list.includes(r) && String(r.player_id) === String(list[0].player_id) && perBook.get(`${r.vendor}|${r.player_id}`)?.length === 1).map((r) => Number(r.line_value)).sort((a, b) => a - b);
    if (!others.length) continue;
    const mid = others[Math.floor((others.length - 1) / 2)];
    const near = [...list].sort((a, b) => Math.abs(Number(a.line_value) - mid) - Math.abs(Number(b.line_value) - mid))[0];
    out.push({ ...near, doubled: true });
  }
  return out;
}

/** The market's line: the one most books post, and in a split market the middle of the books' lines (round 11: the
 * darts took DraftKings' line even when it stood alone; the props board uses the same rule). */
export function consensusLine(lines) {
  const ls = lines.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!ls.length) return null;
  const count = new Map(); for (const l of ls) count.set(l, (count.get(l) || 0) + 1);
  const top = Math.max(...count.values()); const tied = [...count].filter(([, c]) => c === top).map(([l]) => l);
  if (tied.length === 1) return tied[0];
  const middle = ls[Math.floor((ls.length - 1) / 2)];
  return tied.sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle) || a - b)[0];
}

/**
 * The main two-sided line of a market with both prices: the consensus line, priced by the first book in BOOK_ORDER
 * that posts it. Returns { line, over, under, book } or null.
 */
export function mainLineBoth(rows, propType) {
  const ou = mainLineRows(rows, propType).filter((r) =>
    Number.isFinite(Number(r.market?.over_odds)) && Number.isFinite(Number(r.market?.under_odds)));
  if (!ou.length) return null;
  const line = consensusLine(ou.map((r) => r.line_value));
  const at = ou.filter((r) => Number(r.line_value) === line && !r.doubled);
  at.sort((a, b) => bookRank(a.vendor) - bookRank(b.vendor));
  const r = at[0];
  if (!r) return null;
  return { line: Number(r.line_value), over: Number(r.market.over_odds), under: Number(r.market.under_odds), book: r.vendor };
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
/**
 * Offensive skill positions: the only players NFL props and darts price. nflverse shares display names across
 * players (audit, Oct 13 2026: Minnesota's WR Justin Jefferson and Cleveland's LB Justin Jefferson), so the
 * name-keyed weekly maps keep these positions only.
 */
export const NFL_SKILL_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'FB']);
// A skill row by its position, or by what it holds: a two-way player listed at corner who caught passes counts (round 11:
// Travis Hunter's catches and touchdown read "no touches").
export const isNflSkillRow = (row) => NFL_SKILL_POSITIONS.has(String(row?.position || '').toUpperCase())
  || Number(row?.targets) > 0 || Number(row?.carries) > 0 || Number(row?.receptions) > 0;

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
