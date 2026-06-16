/**
 * API-Football (api-sports.io) service — recent-international form, injuries, and
 * player club stats for the World Cup. BDL FIFA only has World-Cup-edition match
 * data, which is empty on opening matchday; API-Football fills that gap with
 * CURRENT cross-competition data (qualifiers, friendlies, Nations League) so
 * Gary's WC picks rest on real, verifiable numbers instead of web grounding.
 *
 * Standalone by design — does NOT touch ballDontLieService / fifaWorldCupService.
 * Auth: x-apisports-key header, key from API_FOOTBALL_KEY. Base v3.football.api-sports.io.
 */

const BASE = 'https://v3.football.api-sports.io';
const API_KEY =
  (typeof process !== 'undefined' && process?.env?.API_FOOTBALL_KEY) ||
  (typeof process !== 'undefined' && process?.env?.VITE_API_FOOTBALL_KEY) || '';

// TTLs by volatility.
const TTL_STATIC = 24 * 60 * 60 * 1000; // team-id resolution
const TTL_FORM = 6 * 60 * 60 * 1000;    // recent fixtures / form
const TTL_INJURY = 2 * 60 * 60 * 1000;  // injuries

const cache = new Map();
const getCached = (k) => { const e = cache.get(k); return e && Date.now() - e.ts < e.ttl ? e.data : null; };
const setCache = (k, data, ttl) => cache.set(k, { data, ts: Date.now(), ttl });
export const clearApiFootballCache = () => cache.clear();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function hasApiFootballKey() { return !!API_KEY; }

/**
 * Low-level GET. Returns the `response` array (API-Football wraps payloads in
 * { response, errors, results }). Retries transient network blips; throws on a
 * real HTTP error or an API-level `errors` payload. Returns [] on no key (so the
 * scout report degrades gracefully rather than crashing).
 */
async function afFetch(path, params = {}) {
  if (!API_KEY) return [];
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const url = `${BASE}${path}${qs ? `?${qs}` : ''}`;
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: { 'x-apisports-key': API_KEY } });
      if (!res.ok) throw new Error(`API-Football ${res.status}: ${path}`);
      const json = await res.json();
      // API-Football returns errors as {} (object) when none, or a populated
      // object/array when present. Only treat a non-empty payload as an error.
      const errs = json?.errors;
      const hasErr = Array.isArray(errs) ? errs.length > 0 : (errs && typeof errs === 'object' && Object.keys(errs).length > 0);
      if (hasErr) throw new Error(`API-Football error: ${JSON.stringify(errs)}`);
      return Array.isArray(json?.response) ? json.response : [];
    } catch (e) {
      lastErr = e;
      if (i < 2) await sleep(500 * (i + 1));
    }
  }
  throw lastErr;
}

/** Resolve a national team name (e.g. "France", "Senegal") to its API-Football team id. */
export async function resolveNationalTeamId(name) {
  if (!name) return null;
  const key = `natid_${name.toLowerCase()}`;
  const cached = getCached(key);
  if (cached !== null) return cached;
  let id = null;
  try {
    const rows = await afFetch('/teams', { search: name });
    const national = rows.filter((r) => r.team?.national === true);
    const pool = national.length ? national : rows;
    // Prefer an exact (case-insensitive) name match, else the first national team.
    const exact = pool.find((r) => (r.team?.name || '').toLowerCase() === name.toLowerCase());
    id = (exact || pool[0])?.team?.id ?? null;
  } catch (e) {
    console.warn(`[API-Football] resolveNationalTeamId(${name}) failed: ${e.message}`);
  }
  setCache(key, id, TTL_STATIC);
  return id;
}

/**
 * Recent form for a national team across ALL competitions (qualifiers, friendlies,
 * Nations League). Returns structured fixtures + last-5 / last-10 aggregates:
 *   { fixtures: [{date, league, opponent, gf, ga, result, home}],
 *     l5:  { played, w, d, l, gfPerMatch, gaPerMatch, form },
 *     l10: { ... } }
 * Empty shape if no data / no key.
 */
export async function getRecentForm(teamIdOrName, lastN = 10) {
  const teamId = typeof teamIdOrName === 'number' ? teamIdOrName : await resolveNationalTeamId(teamIdOrName);
  const empty = { teamId: teamId ?? null, fixtures: [], l5: null, l10: null };
  if (!teamId) return empty;
  const key = `form_${teamId}_${lastN}`;
  const cached = getCached(key);
  if (cached) return cached;

  let rows;
  try {
    rows = await afFetch('/fixtures', { team: teamId, last: lastN });
  } catch (e) {
    console.warn(`[API-Football] getRecentForm(${teamId}) failed: ${e.message}`);
    return empty;
  }

  const fixtures = [];
  for (const f of rows) {
    const isHome = f.teams?.home?.id === teamId;
    const gf = isHome ? f.goals?.home : f.goals?.away;
    const ga = isHome ? f.goals?.away : f.goals?.home;
    if (gf == null || ga == null) continue; // skip unplayed/void
    fixtures.push({
      date: f.fixture?.date?.slice(0, 10) || null,
      league: f.league?.name || null,
      opponent: (isHome ? f.teams?.away?.name : f.teams?.home?.name) || null,
      home: isHome,
      gf, ga,
      result: gf > ga ? 'W' : gf < ga ? 'L' : 'D',
    });
  }

  const agg = (n) => {
    const slice = fixtures.slice(0, n);
    if (!slice.length) return null;
    const sum = (sel) => slice.reduce((a, x) => a + sel(x), 0);
    const w = slice.filter((x) => x.result === 'W').length;
    const d = slice.filter((x) => x.result === 'D').length;
    const l = slice.filter((x) => x.result === 'L').length;
    return {
      played: slice.length,
      w, d, l,
      gfPerMatch: +(sum((x) => x.gf) / slice.length).toFixed(2),
      gaPerMatch: +(sum((x) => x.ga) / slice.length).toFixed(2),
      form: slice.map((x) => x.result).join(''), // most-recent first
    };
  };

  const out = { teamId, fixtures, l5: agg(5), l10: agg(10) };
  setCache(key, out, TTL_FORM);
  return out;
}

/** Current injuries for a national team's squad. Returns [{player, reason, type}]. */
export async function getInjuries(teamIdOrName, season) {
  const teamId = typeof teamIdOrName === 'number' ? teamIdOrName : await resolveNationalTeamId(teamIdOrName);
  if (!teamId) return [];
  const key = `inj_${teamId}_${season}`;
  const cached = getCached(key);
  if (cached) return cached;
  let out = [];
  try {
    const rows = await afFetch('/injuries', { team: teamId, season });
    out = rows.map((r) => ({
      player: r.player?.name || null,
      reason: r.player?.reason || null,
      type: r.player?.type || null,
    })).filter((x) => x.player);
  } catch (e) {
    console.warn(`[API-Football] getInjuries(${teamId}) failed: ${e.message}`);
  }
  setCache(key, out, TTL_INJURY);
  return out;
}

export default { hasApiFootballKey, resolveNationalTeamId, getRecentForm, getInjuries, clearApiFootballCache };
