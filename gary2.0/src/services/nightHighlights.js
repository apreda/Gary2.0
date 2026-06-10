/**
 * Night Highlights — league-wide "what cashed last night": ALL players with a
 * standout statistical night, NOT limited to Gary's picks.
 *
 * For a date, pulls the full MLB slate's box scores from BDL ($0 — data
 * fetches only, no LLM) and produces rows for:
 *   - 'hr'        every player who homered            → "2 HR · 5 RBI"
 *   - 'multi_hit' players with 2+ hits (top ~10)      → "3-for-4"
 *   - 'k_show'    pitchers with 7+ strikeouts         → "9 K over 6 IP"
 *
 * gary_result ('won'/'lost') is set ONLY when Gary had a graded prop on that
 * player that night — joined from prop_results by fuzzy player name + date,
 * preferring the prop type that matches the category (HR prop for 'hr', etc).
 *
 * Rows land in `night_highlights` (see supabase/migrations/
 * 20260610_create_night_highlights.sql); the iOS app reads them under the anon
 * role. Idempotent: upsert on (game_date, league, category, player_name).
 *
 * Callers: scripts/run-all-results.js (nightly, non-fatal) and
 * scripts/run-night-highlights.js (manual/backfill).
 */

const BDL_BASE = 'https://api.balldontlie.io';
const MULTI_HIT_CAP = 10;
const K_SHOW_MIN = 7;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────────────────────
// Name matching (mirrors run-all-results.js / backtest-dfs-lineups.js)
// ─────────────────────────────────────────────────────────────────────────────

function normalizeName(name) {
  if (!name) return '';
  let s = String(name).toLowerCase();
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // strip accents
  s = s.replace(/[.'’\-]/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/\b(jr|sr|iii|ii|iv)\b/g, '').replace(/\s+/g, ' ').trim(); // strip suffixes
  return s;
}

function firstInitialLast(normName) {
  const parts = normName.split(' ');
  if (parts.length < 2) return null;
  return `${parts[0][0]} ${parts[parts.length - 1]}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// BDL fetches
// ─────────────────────────────────────────────────────────────────────────────

async function bdlFetch(url, apiKey) {
  let res;
  for (let attempt = 0; attempt < 5; attempt++) {
    res = await fetch(url, { headers: { Authorization: apiKey } });
    if (res.status === 429) {
      await sleep(1500 * (attempt + 1));
      continue;
    }
    break;
  }
  if (!res.ok) throw new Error(`BDL ${res.status} for ${url}`);
  return res.json();
}

/**
 * MLB games for an ET date. BDL indexes MLB games by UTC date, so a 9:38 PM ET
 * game files under the next UTC day — query both days and filter to games
 * whose ET date matches (same pattern as fetchMlbGamesForETDate in
 * scripts/run-all-results.js).
 */
async function fetchMlbGamesForETDate(etDateStr, apiKey) {
  const next = new Date(`${etDateStr}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const nextStr = next.toISOString().slice(0, 10);

  const games = [];
  for (const d of [etDateStr, nextStr]) {
    const json = await bdlFetch(`${BDL_BASE}/mlb/v1/games?dates[]=${d}&per_page=100`, apiKey);
    games.push(...(json?.data || []));
  }

  const seen = new Set();
  const filtered = [];
  for (const g of games) {
    if (!g || g.id == null || seen.has(g.id)) continue;
    const iso = g.date; // MLB BDL returns a full ISO datetime in `date`
    if (!iso) continue;
    const gameETDate = new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    if (gameETDate !== etDateStr) continue;
    seen.add(g.id);
    filtered.push(g);
  }
  return filtered;
}

/**
 * Per-game MLB player stats, fetched PER GAME with cursor pagination —
 * per_page=100 is per request, not per game, and ~26 players play per game
 * (same gotcha fetchMLBStats in run-all-results.js works around).
 */
async function fetchMlbStatsForGames(gameIds, apiKey) {
  const all = [];
  for (const gameId of gameIds) {
    let cursor;
    for (let page = 0; page < 5; page++) {
      const params = new URLSearchParams();
      params.append('game_ids[]', String(gameId));
      params.append('per_page', '100');
      if (cursor != null) params.append('cursor', String(cursor));
      const json = await bdlFetch(`${BDL_BASE}/mlb/v1/stats?${params.toString()}`, apiKey);
      all.push(...(json?.data || []));
      cursor = json?.meta?.next_cursor;
      if (cursor == null) break;
      await sleep(120);
    }
    await sleep(120);
  }
  return all;
}

// ─────────────────────────────────────────────────────────────────────────────
// Highlight building
// ─────────────────────────────────────────────────────────────────────────────

/** Baseball IP (5.2 = 5 innings + 2 outs) → outs. */
function ipToOuts(ip) {
  const n = parseFloat(ip);
  if (isNaN(n)) return 0;
  return Math.floor(n) * 3 + Math.round((n % 1) * 10);
}

/** Outs → display IP string ("16 → 5.1", "18 → 6"). */
function outsToIpString(outs) {
  const whole = Math.floor(outs / 3);
  const rem = outs % 3;
  return rem ? `${whole}.${rem}` : `${whole}`;
}

/**
 * Aggregate the night's stat rows per player (doubleheaders produce two rows
 * for the same player+date; the unique constraint allows only one highlight).
 */
function aggregateByPlayer(statRows) {
  const byPlayer = new Map();
  for (const s of statRows) {
    const fullName = s.player?.full_name
      || `${s.player?.first_name || ''} ${s.player?.last_name || ''}`.trim();
    const key = normalizeName(fullName);
    if (!key) continue;
    let agg = byPlayer.get(key);
    if (!agg) {
      agg = { name: fullName, team: s.team_name || null, hits: 0, atBats: 0, hr: 0, rbi: 0, pK: 0, outs: 0, batted: false, pitched: false };
      byPlayer.set(key, agg);
    }
    if (s.at_bats != null) {
      agg.batted = true;
      agg.hits += s.hits || 0;
      agg.atBats += s.at_bats || 0;
      agg.hr += s.hr || 0;
      agg.rbi += s.rbi || 0;
    }
    if (s.ip != null) {
      agg.pitched = true;
      agg.pK += s.p_k || 0;
      agg.outs += ipToOuts(s.ip);
    }
  }
  return byPlayer;
}

/**
 * Build a lookup of Gary's graded props by normalized player name.
 * @returns Map<normName, Array<propRow>> plus a first-initial+last index.
 */
function buildPropIndex(propRows) {
  const exact = new Map();
  for (const r of propRows || []) {
    if (!r?.player_name || !r.result) continue;
    const key = normalizeName(r.player_name);
    if (!key) continue;
    if (!exact.has(key)) exact.set(key, []);
    exact.get(key).push(r);
  }
  const fil = new Map();
  for (const key of exact.keys()) {
    const f = firstInitialLast(key);
    if (!f) continue;
    if (!fil.has(f)) fil.set(f, []);
    fil.get(f).push(key);
  }
  return { exact, fil };
}

const CATEGORY_PROP_TYPES = {
  hr: ['home_run', 'homer'],
  multi_hit: ['hits', 'total_bases', 'hits_runs_rbis'],
  k_show: ['strikeout', 'pitcher'],
};

/**
 * gary_result for one player+category: 'won'/'lost' ONLY when Gary had a graded
 * prop on this player that night. Prefers the prop type that matches the
 * category, falls back to any prop on the player.
 */
function garyResultFor(normName, category, propIndex) {
  let rows = propIndex.exact.get(normName);
  if (!rows) {
    const f = firstInitialLast(normName);
    const candidates = f ? propIndex.fil.get(f) : null;
    if (candidates && candidates.length === 1) rows = propIndex.exact.get(candidates[0]);
  }
  if (!rows || !rows.length) return null;
  const wanted = CATEGORY_PROP_TYPES[category] || [];
  const preferred = rows.find((r) => wanted.some((t) => String(r.prop_type || '').toLowerCase().includes(t)));
  const chosen = preferred || rows[0];
  const result = String(chosen.result).toLowerCase();
  return result === 'won' || result === 'lost' ? result : null;
}

/**
 * Pure row builder: stat rows + graded prop rows → night_highlights rows.
 * Exported for tests/dry runs.
 */
export function buildHighlightRows({ date, statRows, propRows }) {
  const byPlayer = aggregateByPlayer(statRows);
  const propIndex = buildPropIndex(propRows);
  const rows = [];

  const push = (category, agg, normName, detail) => {
    rows.push({
      game_date: date,
      league: 'MLB',
      category,
      player_name: agg.name,
      team: agg.team,
      detail,
      gary_result: garyResultFor(normName, category, propIndex),
    });
  };

  // 'hr' — everyone who homered
  for (const [normName, agg] of byPlayer) {
    if (agg.hr >= 1) push('hr', agg, normName, `${agg.hr} HR · ${agg.rbi} RBI`);
  }

  // 'multi_hit' — 2+ hits, capped to the top of the night by hits
  const multiHitters = [...byPlayer.entries()]
    .filter(([, a]) => a.batted && a.hits >= 2)
    .sort(([, a], [, b]) => (b.hits - a.hits) || (b.rbi - a.rbi))
    .slice(0, MULTI_HIT_CAP);
  for (const [normName, agg] of multiHitters) {
    push('multi_hit', agg, normName, `${agg.hits}-for-${agg.atBats}`);
  }

  // 'k_show' — pitchers with 7+ K
  for (const [normName, agg] of byPlayer) {
    if (agg.pitched && agg.pK >= K_SHOW_MIN) {
      push('k_show', agg, normName, `${agg.pK} K over ${outsToIpString(agg.outs)} IP`);
    }
  }

  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build + store night highlights for one ET date. Idempotent (upsert on the
 * unique key) and cheap ($0 — BDL + Supabase only).
 *
 * @param {object} args
 * @param {object} args.supabase  service-role Supabase client
 * @param {string} args.bdlApiKey BallDontLie API key
 * @param {string} args.date      ET date YYYY-MM-DD
 * @param {boolean} [args.dryRun] build rows but skip the write
 * @returns {Promise<{rows: Array, counts: object}>}
 */
export async function runNightHighlights({ supabase, bdlApiKey, date, dryRun = false }) {
  if (!bdlApiKey) throw new Error('BDL API key required for night highlights');
  console.log(`\n🌙 NIGHT HIGHLIGHTS — ${date}${dryRun ? ' (DRY RUN)' : ''}`);

  const games = await fetchMlbGamesForETDate(date, bdlApiKey);
  const finals = games.filter((g) => /final/i.test(g.status || ''));
  console.log(`  ⚾ MLB games for ${date}: ${games.length} (${finals.length} final)`);
  const usable = finals.length ? finals : games;
  if (!usable.length) {
    console.log('  No MLB games — nothing to highlight.');
    return { rows: [], counts: { hr: 0, multi_hit: 0, k_show: 0, with_gary_result: 0 } };
  }

  const statRows = await fetchMlbStatsForGames(usable.map((g) => g.id), bdlApiKey);
  console.log(`  📊 ${statRows.length} player stat lines across ${usable.length} games`);

  // Gary's graded props that night (game_date in prop_results = the pick date,
  // which can sit one day off the ET game date — check both).
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const { data: propRows, error: propErr } = await supabase
    .from('prop_results')
    .select('player_name, prop_type, result')
    .in('game_date', [date, next.toISOString().slice(0, 10)]);
  if (propErr) console.warn(`  ⚠️ prop_results fetch failed (gary_result will be null): ${propErr.message}`);

  const rows = buildHighlightRows({ date, statRows, propRows: propRows || [] });
  const counts = {
    hr: rows.filter((r) => r.category === 'hr').length,
    multi_hit: rows.filter((r) => r.category === 'multi_hit').length,
    k_show: rows.filter((r) => r.category === 'k_show').length,
    with_gary_result: rows.filter((r) => r.gary_result != null).length,
  };

  if (!dryRun && rows.length) {
    const { error } = await supabase
      .from('night_highlights')
      .upsert(rows, { onConflict: 'game_date,league,category,player_name' });
    if (error) throw new Error(`night_highlights upsert failed: ${error.message}`);
  }

  console.log(`  🌙 ${rows.length} highlights — hr=${counts.hr} multi_hit=${counts.multi_hit} k_show=${counts.k_show} (gary_result set on ${counts.with_gary_result})${dryRun ? ' [not written]' : ''}`);
  return { rows, counts };
}
