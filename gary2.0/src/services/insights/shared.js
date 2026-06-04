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
