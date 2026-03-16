/**
 * Highlightly Sports API Service
 *
 * Provides structured data from the Highlightly (sport-highlights) API:
 *   - Venue data for NCAAB games
 *   - Head-to-Head (H2H) matchup history
 *   - Last Five Games for team form
 *
 * Sport paths:
 *   NBA/NCAAB → /nba/ (league param distinguishes)
 *   NHL       → /nhl/
 *
 * If the API fails or key is not configured, everything returns null (graceful skip).
 */

// Highlightly has two base URLs — NBA/NCAAB and NHL use different RapidAPI hosts
const SPORT_CONFIG = {
  nba:   { base: 'https://nba-ncaab-api.p.rapidapi.com', host: 'nba-ncaab-api.p.rapidapi.com', path: '/nba' },
  ncaab: { base: 'https://nba-ncaab-api.p.rapidapi.com', host: 'nba-ncaab-api.p.rapidapi.com', path: '/nba' },
  nhl:   { base: 'https://nhl-ncaah-api.p.rapidapi.com', host: 'nhl-ncaah-api.p.rapidapi.com', path: '/nhl' },
};

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
 * Generic API call with caching and error handling.
 * @param {string} endpoint - API path (e.g., '/teams', '/head-2-head')
 * @param {object} params - Query parameters
 * @param {number} cacheTtl - Cache TTL in ms
 * @param {string} sport - Sport key for routing ('ncaab', 'nba', 'nhl'). Defaults to ncaab.
 */
async function apiCall(endpoint, params = {}, cacheTtl = CACHE_TTL, sport = 'ncaab') {
  const key = getApiKey();
  if (!key) return null;

  const config = SPORT_CONFIG[sport] || SPORT_CONFIG.ncaab;
  const url = new URL(`${config.base}${endpoint}`);
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
      'x-rapidapi-host': config.host
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

// ─────────────────────────────────────────────────────────────
// Head-to-Head (H2H) — Current Season Matchups
// ─────────────────────────────────────────────────────────────

/**
 * Get H2H history between two NCAAB teams using Highlightly API.
 * Returns up to 10 past matchups with scores, filtered to current season.
 *
 * @param {string} homeTeamName - Home team name (e.g., "Duke")
 * @param {string} awayTeamName - Away team name (e.g., "North Carolina")
 * @returns {{ found: boolean, games: Array, record: string } | null}
 */
async function getH2H(homeTeamName, awayTeamName, sport = 'ncaab') {
  try {
    const startTime = Date.now();

    const [homeTeam, awayTeam] = await Promise.all([
      findNcaabTeamId(homeTeamName),
      findNcaabTeamId(awayTeamName)
    ]);

    if (!homeTeam?.id || !awayTeam?.id) {
      console.log(`[Highlightly] H2H: Could not match teams: ${homeTeamName} / ${awayTeamName}`);
      return null;
    }

    const data = await apiCall('/head-2-head', {
      teamIdOne: homeTeam.id,
      teamIdTwo: awayTeam.id
    }, CACHE_TTL, sport);

    const games = Array.isArray(data) ? data : (data?.data || []);

    if (!games.length) {
      console.log(`[Highlightly] H2H: No matchups found for ${homeTeamName} vs ${awayTeamName} (${Date.now() - startTime}ms)`);
      return { found: false, games: [], message: `No H2H games found between ${homeTeamName} and ${awayTeamName}.` };
    }

    // Filter to current season only (games from this academic year)
    const seasonStart = getCurrentSeasonStart();
    const currentSeasonGames = games.filter(g => {
      const gameDate = new Date(g.date);
      return gameDate >= seasonStart && gameDate < new Date();
    });

    // Format results
    const homeName = homeTeam.fullName;
    const awayName = awayTeam.fullName;
    let homeWins = 0, awayWins = 0;

    const meetings = currentSeasonGames.slice(0, 5).map(game => {
      // Scores are in state.score.homeTeam / awayTeam as arrays (per-period), sum them
      const gameHomeTotal = Array.isArray(game.state?.score?.homeTeam)
        ? game.state.score.homeTeam.reduce((a, b) => a + b, 0)
        : (game.state?.score?.homeTeam ?? 0);
      const gameAwayTotal = Array.isArray(game.state?.score?.awayTeam)
        ? game.state.score.awayTeam.reduce((a, b) => a + b, 0)
        : (game.state?.score?.awayTeam ?? 0);

      // Map game's home/away to OUR home/away
      const homeScore = game.homeTeam?.id === homeTeam.id ? gameHomeTotal : gameAwayTotal;
      const awayScore = game.homeTeam?.id === homeTeam.id ? gameAwayTotal : gameHomeTotal;

      const winner = homeScore > awayScore ? homeName : awayName;
      const margin = Math.abs(homeScore - awayScore);
      const gameDate = new Date(game.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      if (homeScore > awayScore) homeWins++;
      else awayWins++;

      return {
        date: gameDate,
        result: `${winner} won by ${margin}`,
        score: `${homeName} ${homeScore} - ${awayScore} ${awayName}`,
        homeBoxLines: [],
        awayBoxLines: []
      };
    });

    console.log(`[Highlightly] H2H: ${currentSeasonGames.length} game(s) this season for ${homeTeamName} vs ${awayTeamName} (${Date.now() - startTime}ms)`);

    return {
      found: meetings.length > 0,
      homeName,
      awayName,
      gamesFound: currentSeasonGames.length,
      record: `${homeName} ${homeWins}-${awayWins} ${awayName}`,
      meetings,
      season: new Date().getFullYear()
    };
  } catch (e) {
    console.warn(`[Highlightly] H2H fetch failed: ${e.message}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Last Five Games — Recent Form
// ─────────────────────────────────────────────────────────────

/**
 * Get the last 5 finished games for a team.
 * @param {string} teamName - Team name
 * @param {string} sport - Sport key ('ncaab', 'nba', 'nhl')
 * @returns {Array|null} Array of recent game results with scores
 */
async function getLastFiveGames(teamName, sport = 'ncaab') {
  try {
    const team = await findNcaabTeamId(teamName);
    if (!team?.id) return null;

    const data = await apiCall('/last-five-games', { teamId: team.id }, CACHE_TTL, sport);
    const games = Array.isArray(data) ? data : (data?.data || []);

    return games.map(g => {
      const homeTotal = Array.isArray(g.state?.score?.homeTeam)
        ? g.state.score.homeTeam.reduce((a, b) => a + b, 0)
        : (g.state?.score?.homeTeam ?? 0);
      const awayTotal = Array.isArray(g.state?.score?.awayTeam)
        ? g.state.score.awayTeam.reduce((a, b) => a + b, 0)
        : (g.state?.score?.awayTeam ?? 0);
      return {
        date: g.date,
        homeTeam: g.homeTeam?.displayName || g.homeTeam?.name,
        awayTeam: g.awayTeam?.displayName || g.awayTeam?.name,
        homeScore: homeTotal,
        awayScore: awayTotal,
        state: g.state?.description || 'Finished'
      };
    });
  } catch (e) {
    console.warn(`[Highlightly] Last 5 games failed for ${teamName}: ${e.message}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Get the start date of the current NCAAB season (November 1 of the academic year).
 */
function getCurrentSeasonStart() {
  const now = new Date();
  const year = now.getMonth() >= 10 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(year, 10, 1); // November 1
}

export { getNcaabVenue, getH2H, getLastFiveGames, findNcaabTeamId };
