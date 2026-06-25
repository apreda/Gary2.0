// gary2.0/src/services/insights/shared.js
//
// Shared, side-effect-free helpers for the insight_connections generator.
// Nothing here fetches data — these are pure utilities used by the
// orchestrator and the per-lane computers.
//
// Table contract (one row per connection):
//   {
//     category, headline, detail, game, value, tone,
//     spark?, line_val?, relevance_score,
//     player_id?, team_id?, game_id?
//   }
// Computers MUST return rows of exactly this shape (build via makeRow()).

/** Valid tones for a connection row. */
export const TONES = Object.freeze({
  HOT: 'hot',
  COLD: 'cold',
  EDGE: 'edge',
  CAUTION: 'caution',
  NEUTRAL: 'neutral',
});

/**
 * Build a table-contract row. Centralizes the shape so every computer is
 * guaranteed to emit identical keys. Optional fields are only attached when
 * defined (keeps the JSONB payload clean).
 *
 * @param {object} o
 * @param {string} o.category   lane name, e.g. 'heatCheck'
 * @param {string} o.headline   short plain-English hook
 * @param {string} o.detail     one/two sentences incl. the betting angle
 * @param {string} o.game       "AWAY @ HOME" display string
 * @param {string|number} o.value  the headline number (e.g. ".410 over L7")
 * @param {string} o.tone       one of TONES
 * @param {number} o.relevance_score  0..100 heuristic, bigger edge = higher
 * @param {string} [o.spark]    optional tiny sparkline / trend string
 * @param {number} [o.line_val] optional numeric betting line tie-in
 * @param {number|string} [o.player_id]
 * @param {number|string} [o.team_id]
 * @param {number|string} [o.game_id]
 * @returns {object} row
 */
export function makeRow(o) {
  const row = {
    category: toSnakeCase(o.category),
    headline: o.headline,
    detail: o.detail,
    game: o.game,
    value: o.value != null ? String(o.value) : o.value,
    tone: normalizeTone(o.tone),
    relevance_score: clampScore(o.relevance_score),
  };
  // `spark` is a numeric series for the iOS mini bar chart. Drop any non-numeric
  // (display-string) spark so a `[Double]` decode on the client can't choke.
  if (Array.isArray(o.spark) && o.spark.length && o.spark.every((n) => Number.isFinite(Number(n)))) {
    row.spark = o.spark.map(Number);
  }
  if (o.line_val != null && Number.isFinite(Number(o.line_val))) row.line_val = Number(o.line_val);
  // Keep ids in their native type so the orchestrator's numeric slate-membership
  // check (slateGameIds.has(game_id)) still matches. The writer stringifies for
  // the TEXT columns at persist time.
  if (o.player_id != null) row.player_id = o.player_id;
  if (o.team_id != null) row.team_id = o.team_id;
  if (o.game_id != null) row.game_id = o.game_id;
  // Optional structured payload for lanes whose cards render more than prose
  // (e.g. beneficiary's player-swap rows). Plain JSON object, stored as jsonb.
  if (o.meta != null && typeof o.meta === 'object') row.meta = o.meta;
  return row;
}

/** camelCase or spaced lane name -> snake_case category token (heatCheck -> heat_check). */
export function toSnakeCase(s) {
  return String(s || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/\s+/g, '_')
    .toLowerCase();
}

/** Collapse any tone vocabulary to the stored good|bad|neutral set. */
export function normalizeTone(t) {
  const s = String(t || '').toLowerCase();
  if (['good', 'hot', 'edge', 'positive', 'up'].includes(s)) return 'good';
  if (['bad', 'cold', 'caution', 'negative', 'down'].includes(s)) return 'bad';
  return 'neutral';
}

/** Clamp a relevance score into the 0..100 integer band. */
export function clampScore(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, Math.round(x)));
}

/**
 * Parse a BDL "bats_throws" / "batsThrows" string like "R/R", "L/L", "S/R".
 * Returns { bats, throws } using single chars 'L' | 'R' | 'S' (switch),
 * or nulls when unparseable.
 */
export function parseBatsThrows(str) {
  if (!str || typeof str !== 'string') return { bats: null, throws: null };
  const parts = str.split('/').map((s) => s.trim().toUpperCase()[0]).filter(Boolean);
  const valid = (c) => c === 'L' || c === 'R' || c === 'S';
  return {
    bats: valid(parts[0]) ? parts[0] : null,
    throws: valid(parts[1]) ? parts[1] : null,
  };
}

/**
 * Given a pitcher's throwing hand, which batter-split bucket applies?
 * Switch hitters bat opposite the pitcher (their platoon-advantage side),
 * so a switch hitter vs a RHP is treated as a left-handed-batter split.
 * @param {'L'|'R'|'S'|null} bats
 * @param {'L'|'R'|null} pitcherThrows
 * @returns {'vs. Left'|'vs. Right'|null}  the split_name to look up on the PITCHER's byBreakdown,
 *          OR the batter-side label — see splitNameForBatterSide / splitNameForPitcherFacing.
 */
export function effectiveBatterSide(bats, pitcherThrows) {
  if (bats === 'S') {
    if (pitcherThrows === 'R') return 'L';
    if (pitcherThrows === 'L') return 'R';
    return null;
  }
  return bats || null;
}

/**
 * On a HITTER's getMlbPlayerSplits().byBreakdown, the split_name describing
 * how the hitter performs against a given pitcher hand.
 * @param {'L'|'R'|null} pitcherThrows
 * @returns {'vs. Left'|'vs. Right'|null}
 */
export function splitNameForPitcherFacing(pitcherThrows) {
  if (pitcherThrows === 'L') return 'vs. Left';
  if (pitcherThrows === 'R') return 'vs. Right';
  return null;
}

/** Today's date as YYYY-MM-DD in the runtime's local tz (callers may override). */
export function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Calendar date (YYYY-MM-DD) in US Eastern for an ISO datetime. BDL MLB game
 * dates are UTC instants — a 9:40pm ET first pitch carries TOMORROW'S UTC date —
 * while the MLB Stats API schedule keys on the ET calendar date. Any join
 * between the two goes through this. Returns null on garbage input.
 */
export function etDateStr(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // en-CA locale formats as YYYY-MM-DD.
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/** YYYY-MM-DD shifted by `delta` days via UTC math (no tz drift). */
export function shiftDateStr(dateStr, delta) {
  const parsed = Date.parse(`${dateStr}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed + delta * 86400000).toISOString().slice(0, 10);
}

/** Median of an array of finite numbers; null when the array has none. */
export function median(nums) {
  const xs = (nums || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

/**
 * Parse an MLB "ip" thirds-decimal value (5.2 = 5 2/3 innings) into true
 * innings. Returns 0 on garbage/negative input.
 */
export function parseIpThirds(ip) {
  const n = Number(ip);
  if (!Number.isFinite(n) || n < 0) return 0;
  const whole = Math.floor(n);
  const thirds = Math.round((n - whole) * 10); // 0, 1, 2
  return whole + thirds / 3;
}

/** "AWAY @ HOME" display string from a normalized BDL game. */
export function gameLabel(game) {
  const away = game?.visitor_team?.abbreviation || game?.visitor_team?.name || 'AWY';
  const home = game?.home_team?.abbreviation || game?.home_team?.name || 'HOM';
  return `${away} @ ${home}`;
}

/** Lowercased, punctuation-light name key for fuzzy joins (no diacritic strip). */
export function nameKey(s) {
  return String(s || '').toLowerCase().replace(/[.\-']/g, '').replace(/\s+/g, ' ').trim();
}

/** First word of a venue name, lowercased — matches BDL byArena split_name logic. */
export function venueFirstWord(venue) {
  return String(venue || '').toLowerCase().trim().split(/\s+/)[0] || '';
}

/**
 * Map an absolute "edge" magnitude onto a relevance band with a floor/ceiling.
 *
 * The curve is linear near zero (slope = scale) but eases asymptotically toward
 * `cap` instead of clamping, so big edges keep their ORDERING instead of all
 * pinning at the cap. (The old hard `min(cap, base + m*scale)` saturated at a
 * 0.25 OPS edge, which made every hot bat score an identical 95 and turned the
 * hub's relevance ranking into a coin flip.)
 *
 * @param {number} magnitude   the raw edge (e.g. OPS delta, ERA-xERA gap)
 * @param {object} opts
 * @param {number} opts.scale  multiplier applied to magnitude
 * @param {number} [opts.base] floor score for any surfaced row (default 40)
 * @param {number} [opts.cap]  ceiling approached asymptotically (default 95)
 * @returns {number}
 */
export function scoreFromEdge(magnitude, { scale, base = 40, cap = 95 }) {
  const m = Math.abs(Number(magnitude) || 0);
  const range = Math.max(1, cap - base);
  const eased = range * (1 - Math.exp(-(m * scale) / range));
  return clampScore(base + eased);
}

/**
 * Find a batting split entry on a getMlbPlayerSplits() byBreakdown array.
 * Centralized so every computer matches the same way: case/punctuation-tolerant
 * ("vs. Left" == "vs Left"), and a missing `category` is treated as batting
 * rather than failing a strict equality check.
 * @param {object} splits     getMlbPlayerSplits() result
 * @param {string} splitName  e.g. "vs. Left"
 * @returns {object|null}
 */
export function getBreakdownSplit(splits, splitName) {
  const rows = splits?.byBreakdown;
  if (!Array.isArray(rows)) return null;
  const want = nameKey(splitName);
  return rows.find((s) => {
    if (!s || typeof s.split_name !== 'string') return false;
    if (s.category != null && s.category !== 'batting') return false;
    return nameKey(s.split_name) === want;
  }) || null;
}

/**
 * Deterministically pick one of `variants` from a stable key (player_id, name…)
 * so card copy varies across a slate without reshuffling between idempotent
 * re-runs of the same day. No randomness on purpose.
 */
export function pickVariant(variants, key) {
  if (!Array.isArray(variants) || variants.length === 0) return '';
  const s = String(key ?? '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return variants[h % variants.length];
}

/** Round a number to n decimals, returning a Number (not string). */
export function round(n, decimals = 3) {
  const f = 10 ** decimals;
  return Math.round((Number(n) || 0) * f) / f;
}

/** Format a rate stat for display, e.g. .312 -> ".312". Strips leading 0. */
export function pct3(n) {
  const v = round(n, 3);
  const s = v.toFixed(3);
  return s.startsWith('0.') ? s.slice(1) : s.startsWith('-0.') ? `-${s.slice(2)}` : s;
}

// ─────────────────────────────────────────────────────────────────────────────
// Player Insight Card helpers (shared by the MLB + WC card builders)
//
// These were originally local to playerInsightCards.js (MLB). They are pure,
// sport-agnostic utilities; lifting them here lets the World Cup card builder
// reuse the EXACT same prop-formatting / rate-attaching / dedupe logic without a
// copy. The two sport-specific knobs (the prop display LABEL and the MAX cap) are
// passed in by each caller, so neither sport's output changes.
// ─────────────────────────────────────────────────────────────────────────────

/** Coerce to a finite Number or null (empty string / null / NaN -> null). */
export function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Normalize a fetcher return (array OR keyed object OR null) to an array. */
export function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') return Object.values(v);
  return [];
}

/** De-duplicate (case-insensitive) a list of strings and cap its length. */
export function dedupeCap(arr, cap) {
  const out = [];
  const seen = new Set();
  for (const item of arr) {
    if (!item) continue;
    const k = String(item).toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * Run an async fn, returning a fallback on any throw (never propagates). `tag`
 * only labels the console.error so a builder's logs stay identifiable.
 */
export async function safeCall(fn, fallback, tag = 'insights') {
  try {
    const v = await fn();
    return v == null ? fallback : v;
  } catch (err) {
    console.error(`[${tag}] data fetch error:`, err?.message || err);
    return fallback;
  }
}

/** American-odds display: +150 / -120 (passes through non-numeric unchanged). */
export function formatOdds(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n)) return String(odds);
  return n > 0 ? `+${n}` : String(n);
}

/**
 * Rank a prop row's market so a standard over/under is preferred over a
 * milestone/extreme-odds rung when two rows share a prop type. Sport-agnostic
 * (MLB milestone HR markets + WC anytime_goal milestone markets both sort last).
 */
export function marketRank(r) {
  const t = String(r?.market?.type || '').toLowerCase();
  if (t.includes('over') || t.includes('under') || t === 'over_under') return 0;
  if (t === 'milestone') return 2;
  return 1;
}

/**
 * Format up to `maxProps` posted lines for a player into [{label, line, odds}].
 *
 * Generic over sport: `priorityTypes` is BOTH the trackable allow-list (a type
 * not in it is dropped so a card never ships a rate-less, untrackable prop) and
 * the display order; `labelFor(propType)` maps the raw type to its card label;
 * `maxProps` caps the row count. Each entry carries an internal `_type` so
 * attachPropRates() can join the per-game hit rate, then strips it.
 *
 * Defensive: omits a row with neither a line nor odds; dedupes by prop type
 * (keeping the highest-priority / least-juiced market for that type).
 *
 * @param {Array}  propRows       raw prop rows: { player_id, prop_type, line_value, market:{type,odds} }
 * @param {string|number} playerId
 * @param {string[]} priorityTypes  trackable types, in display-priority order
 * @param {object} opts
 * @param {(t:string)=>string} opts.labelFor  prop_type -> display label
 * @param {number} opts.maxProps   max rows returned
 * @returns {Array<{label:string, line?:string, odds?:string, _type:string}>}
 */
export function formatProps(propRows, playerId, priorityTypes, { labelFor, maxProps } = {}) {
  const allowed = new Set(priorityTypes);
  const rows = (Array.isArray(propRows) ? propRows : [])
    .filter((r) => String(r?.player_id) === String(playerId))
    .filter((r) => allowed.has(String(r?.prop_type || '').toLowerCase()));
  if (!rows.length) return [];

  const ranked = [...rows].sort((a, b) => {
    const ap = priorityTypes.indexOf(String(a?.prop_type || '').toLowerCase());
    const bp = priorityTypes.indexOf(String(b?.prop_type || '').toLowerCase());
    const aw = ap === -1 ? 99 : ap;
    const bw = bp === -1 ? 99 : bp;
    if (aw !== bw) return aw - bw;
    return marketRank(a) - marketRank(b);
  });

  const out = [];
  const seen = new Set();
  for (const r of ranked) {
    const propType = String(r?.prop_type || '').toLowerCase();
    if (seen.has(propType)) continue;
    const line = num(r?.line_value);
    const entry = { label: labelFor ? labelFor(propType) : propType, _type: propType };
    if (line != null) entry.line = String(line);
    const odds = r?.market?.odds;
    if (odds != null && Number.isFinite(Number(odds))) entry.odds = formatOdds(odds);
    if (entry.line == null && entry.odds == null) continue;
    seen.add(propType);
    out.push(entry);
    if (out.length >= (maxProps || 4)) break;
  }
  return out;
}

/**
 * Mutate each prop entry with `rate` — "7/10 over" — counting the games in the
 * trailing window where the stat finished ABOVE the posted line. Strictly factual
 * (no lean implied). Strips the internal `_type` either way. A type with no
 * statMap extractor, or a sub-minRows window, simply gets no rate (fail closed).
 *
 * @param {Array}  props    formatProps() output (mutated in place)
 * @param {Array}  rows     per-game stat rows, oldest -> newest
 * @param {object} statMap  prop_type -> (row) => Number
 * @param {object} cfg
 * @param {number} cfg.window  trailing window size
 * @param {number} cfg.minRows minimum rows required to publish a rate
 */
export function attachPropRates(props, rows, statMap, { window, minRows } = {}) {
  if (!Array.isArray(props) || !props.length) return;
  const win = (Array.isArray(rows) ? rows : []).slice(-window);
  for (const p of props) {
    const type = p._type;
    delete p._type;
    if (win.length < minRows) continue;
    const statOf = statMap[type];
    const line = Number(p.line);
    if (!statOf || !Number.isFinite(line)) continue;
    const cleared = win.filter((r) => statOf(r) > line).length;
    p.rate = `${cleared}/${win.length} over`;
  }
}
