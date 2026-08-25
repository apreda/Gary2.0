/**
 * CollegeFootballData — the NCAAF context BDL cannot provide (Aug 25 2026).
 *
 * BDL's NCAAF season row carries thirteen fields and no points, no defense
 * beyond opponent yards, and no ratings at all. Five checklist factors were
 * therefore answering "not available": SP+, FPI, strength of schedule,
 * conference strength, and quality of opposition. CFBD publishes all of them.
 *
 * REQUEST BUDGET IS THE DESIGN CONSTRAINT. The free tier allows 1,000 requests
 * per CALENDAR MONTH — about 33 a day, which a single Saturday slate would
 * blow through if anything called per-game. Every endpoint here returns the
 * WHOLE LEAGUE in one request (SP+ 137 teams, venues 852, returning production
 * 134), so a complete refresh of every NCAAF context we use costs FIVE
 * requests. They are fetched in bulk, cached for hours, and keyed by season.
 *
 * Nothing here is ever called per-game.
 */

const BASE = 'https://api.collegefootballdata.com';
const REQUEST_TIMEOUT_MS = 20_000;
// Ratings move once a week at most; venues essentially never.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const cache = new Map();
let requestsThisProcess = 0;

export function cfbdRequestCount() {
  return requestsThisProcess;
}

function apiKey() {
  return process.env.CFBD_API_KEY || null;
}

/**
 * One bulk GET, cached. Returns { rows } or { unavailable, reason } — never a
 * bare empty array, so a missing key or a dead endpoint can never be mistaken
 * for "this league has no ratings".
 */
async function bulkGet(path, cacheKey, { fetchImpl = globalThis.fetch } = {}) {
  const hit = cache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit.value;

  const key = apiKey();
  if (!key) {
    return {
      unavailable: true,
      reason: 'CFBD_API_KEY is not set. CollegeFootballData issues a free key at collegefootballdata.com; without it SP+, FPI, strength of schedule and NCAAF venue data are genuinely unavailable.'
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let value;
  try {
    requestsThisProcess += 1;
    const response = await fetchImpl(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal
    });
    if (response.status === 401) {
      value = { unavailable: true, reason: 'CFBD rejected the API key (401).' };
    } else if (response.status === 429) {
      // The monthly cap. Say so loudly — this is the one failure that silently
      // degrades everything downstream if it is mistaken for "no data".
      value = { unavailable: true, reason: 'CFBD rate limit reached (429). The free tier allows 1,000 requests per calendar month.' };
    } else if (!response.ok) {
      value = { unavailable: true, reason: `CFBD returned HTTP ${response.status} for ${path}.` };
    } else {
      const json = await response.json();
      value = { rows: Array.isArray(json) ? json : [] };
    }
  } catch (error) {
    // A failed fetch is not an empty result.
    return { unavailable: true, reason: `Could not reach CFBD for ${path}: ${error.message}` };
  } finally {
    clearTimeout(timer);
  }
  cache.set(cacheKey, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
}

/** Match CFBD's school names against the pipeline's team names. */
export function cfbdTeamMatches(cfbdTeam, teamName) {
  if (!cfbdTeam || !teamName) return false;
  const a = String(cfbdTeam).toLowerCase().trim();
  const b = String(teamName).toLowerCase().trim();
  if (a === b) return true;
  // BDL says "Ohio State Buckeyes"; CFBD says "Ohio State". Require the CFBD
  // school to be a whole-word PREFIX of the full name, so "Ohio" alone or
  // "Ohio State" vs "Ohio" cannot cross-match.
  return b === a || b.startsWith(`${a} `);
}

/** SP+ for the whole league, one request. */
export async function getSpPlus(season, opts = {}) {
  return bulkGet(`/ratings/sp?year=${season}`, `sp_${season}`, opts);
}

/** FPI for the whole league, one request. */
export async function getFpi(season, opts = {}) {
  return bulkGet(`/ratings/fpi?year=${season}`, `fpi_${season}`, opts);
}

/** SRS — carries strength of schedule where SP+ leaves it null. */
export async function getSrs(season, opts = {}) {
  return bulkGet(`/ratings/srs?year=${season}`, `srs_${season}`, opts);
}

/** Returning production (share of last year's PPA back on the roster). */
export async function getReturningProduction(season, opts = {}) {
  return bulkGet(`/player/returning?year=${season}`, `returning_${season}`, opts);
}

/** Recruiting talent composite. */
export async function getTalent(season, opts = {}) {
  return bulkGet(`/talent?year=${season}`, `talent_${season}`, opts);
}

/**
 * Every venue: latitude, longitude, elevation, dome, grass, timezone.
 * This is what makes NCAAF weather possible at all — 130+ FBS stadiums were
 * the reason the weather lane had to decline for college.
 */
export async function getVenues(opts = {}) {
  return bulkGet('/venues', 'venues', opts);
}

/** Find one team's row in a bulk result. */
export function rowFor(result, teamName) {
  if (!result || result.unavailable || !Array.isArray(result.rows)) return null;
  return result.rows.find((r) => cfbdTeamMatches(r.team, teamName)) || null;
}

/** Find a venue by name (CFBD venue names are close to, not equal to, BDL's). */
export function venueFor(result, venueName) {
  if (!result || result.unavailable || !Array.isArray(result.rows) || !venueName) return null;
  const wanted = String(venueName).toLowerCase().trim();
  const exact = result.rows.find((v) => String(v.name || '').toLowerCase().trim() === wanted);
  if (exact) return exact;
  const contains = result.rows.filter((v) => {
    const n = String(v.name || '').toLowerCase();
    return n.includes(wanted) || wanted.includes(n);
  });
  // Ambiguity is refused, never guessed.
  return contains.length === 1 ? contains[0] : null;
}

/** Test seam. */
export function _clearCfbdCache() {
  cache.clear();
  requestsThisProcess = 0;
}
