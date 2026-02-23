/**
 * Highlightly NCAAB Service — Venue Data Only
 *
 * Provides arena/venue names for NCAAB games.
 * BDL handles all stats, H2H, and game data — Highlightly is only used
 * for venue info (arena name, city, state) which BDL doesn't provide.
 *
 * Endpoints used:
 *   GET /teams?league=ncaab              — team ID lookup (for match search)
 *   GET /matches?league=ncaab&date=X     — find today's match ID
 *   GET /matches/{id}                    — get venue from match detail
 *
 * If the API fails or key is not configured, everything returns null (graceful skip).
 */

const BASE_URL = 'https://nba-ncaab-api.p.rapidapi.com';
const RAPIDAPI_HOST = 'nba-ncaab-api.p.rapidapi.com';

// Caches
const teamIdCache = new Map();          // teamName → { id, fullName }  (never expires)
const responseCache = new Map();         // url → { data, ts }
const CACHE_TTL = 30 * 60 * 1000;       // 30 minutes
let allNcaabTeams = null;               // Full team list (fetched once, cached forever)
let _teamsLoadPromise = null;           // Mutex: prevents duplicate parallel fetches

function getApiKey() {
  return process.env.HIGHLIGHTLY_RAPIDAPI_KEY ||
         process.env.VITE_HIGHLIGHTLY_RAPIDAPI_KEY ||
         process.env.TANK01_RAPIDAPI_KEY ||
         process.env.VITE_TANK01_RAPIDAPI_KEY ||
         null;
}

/**
 * Generic API call with caching and error handling
 */
async function apiCall(endpoint, params = {}, cacheTtl = CACHE_TTL) {
  const key = getApiKey();
  if (!key) return null;

  const url = new URL(`${BASE_URL}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) {
      url.searchParams.append(k, String(v));
    }
  });

  const cacheKey = url.toString();
  const cached = responseCache.get(cacheKey);
  if (cached && (Date.now() - cached.ts < cacheTtl)) {
    return cached.data;
  }

  const response = await fetch(url.toString(), {
    headers: {
      'x-rapidapi-key': key,
      'x-rapidapi-host': RAPIDAPI_HOST
    }
  });

  if (!response.ok) {
    console.warn(`[Highlightly] API ${response.status} on ${endpoint}: ${response.statusText}`);
    return null;
  }

  const data = await response.json();
  responseCache.set(cacheKey, { data, ts: Date.now() });
  return data;
}

// ─────────────────────────────────────────────────────────────
// Team ID Lookup (needed for match search)
// ─────────────────────────────────────────────────────────────

async function getAllNcaabTeams() {
  if (allNcaabTeams) return allNcaabTeams;
  // Mutex: if a fetch is already in flight, await it instead of fetching again
  if (_teamsLoadPromise) return _teamsLoadPromise;

  _teamsLoadPromise = (async () => {
    const data = await apiCall('/teams', { league: 'ncaab' }, Infinity);
    const teams = data?.data || data || [];
    if (Array.isArray(teams) && teams.length > 0) {
      allNcaabTeams = teams.filter(t =>
        (t.league === 'NCAA' || t.league === 'ncaab' || (t.displayName || '').length > 0)
      );
      console.log(`[Highlightly] Loaded ${allNcaabTeams.length} teams for venue matching`);
    } else {
      console.warn('[Highlightly] Failed to load teams — will retry next call');
      _teamsLoadPromise = null;
      return [];
    }
    return allNcaabTeams;
  })();

  return _teamsLoadPromise;
}

async function findNcaabTeamId(teamName) {
  const cacheKey = teamName.toLowerCase().trim();
  if (teamIdCache.has(cacheKey)) return teamIdCache.get(cacheKey);

  const teams = await getAllNcaabTeams();
  if (!teams.length) {
    teamIdCache.set(cacheKey, null);
    return null;
  }

  const input = teamName.toLowerCase().trim();

  // 1. Exact displayName match
  let match = teams.find(t => (t.displayName || '').toLowerCase() === input);

  // 2. displayName contains input or input contains displayName
  if (!match) {
    match = teams.find(t => {
      const dn = (t.displayName || '').toLowerCase();
      return dn && (dn.includes(input) || input.includes(dn));
    });
  }

  // 3. Progressive word-dropping
  if (!match) {
    const words = input.split(/\s+/);
    for (let dropCount = 1; !match && dropCount < words.length; dropCount++) {
      const candidate = words.slice(0, words.length - dropCount).join(' ');
      if (candidate.length < 3) continue;
      match = teams.find(t => (t.displayName || '').toLowerCase().includes(candidate));
    }
  }

  if (match) {
    const id = match.id || match.teamId;
    const fullName = match.displayName || match.name || teamName;
    const result = { id, fullName };
    teamIdCache.set(cacheKey, result);
    return result;
  }

  teamIdCache.set(cacheKey, null);
  return null;
}

// ─────────────────────────────────────────────────────────────
// Venue Lookup
// ─────────────────────────────────────────────────────────────

/**
 * Get venue info for an NCAAB game.
 * Searches Highlightly matches for today's game between these teams,
 * then fetches match detail for venue (arena name, city, state).
 *
 * @returns {string|null} Venue string like "Cameron Indoor Stadium, Durham, NC" or null
 */
async function getNcaabVenue(homeTeamName, awayTeamName) {
  try {
    const startTime = Date.now();

    // Find Highlightly team IDs
    const [homeTeam, awayTeam] = await Promise.all([
      findNcaabTeamId(homeTeamName),
      findNcaabTeamId(awayTeamName)
    ]);

    if (!homeTeam?.id || !awayTeam?.id) {
      console.log(`[Highlightly] Could not match teams for venue: ${homeTeamName} / ${awayTeamName}`);
      return null;
    }

    // Search for today's match between these teams
    const today = new Date().toISOString().split('T')[0];
    // Also check tomorrow (UTC date may differ from EST game date)
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    const [todayMatches, tomorrowMatches] = await Promise.all([
      apiCall('/matches', { league: 'ncaab', date: today, homeTeamId: homeTeam.id, limit: 5 }),
      apiCall('/matches', { league: 'ncaab', date: tomorrow, homeTeamId: homeTeam.id, limit: 5 })
    ]);

    const allMatches = [
      ...(todayMatches?.data || []),
      ...(tomorrowMatches?.data || [])
    ];

    // Find the match with our away team
    const match = allMatches.find(m => {
      const mAwayId = m.awayTeam?.id;
      const mHomeId = m.homeTeam?.id;
      return (mHomeId === homeTeam.id && mAwayId === awayTeam.id) ||
             (mHomeId === awayTeam.id && mAwayId === homeTeam.id);
    });

    if (!match) {
      console.log(`[Highlightly] No match found for ${awayTeamName} @ ${homeTeamName} (${Date.now() - startTime}ms)`);
      return null;
    }

    // Fetch match detail for venue
    const detail = await apiCall(`/matches/${match.id}`, {}, 24 * 60 * 60 * 1000);
    const matchDetail = Array.isArray(detail) ? detail[0] : detail;
    const venue = matchDetail?.venue;

    if (!venue?.name) {
      console.log(`[Highlightly] Match found but no venue data (${Date.now() - startTime}ms)`);
      return null;
    }

    console.log(`[Highlightly] ✓ Venue: ${venue.name} (${Date.now() - startTime}ms)`);
    return venue.name;
  } catch (e) {
    console.warn(`[Highlightly] Venue lookup failed: ${e.message}`);
    return null;
  }
}

export { getNcaabVenue };
