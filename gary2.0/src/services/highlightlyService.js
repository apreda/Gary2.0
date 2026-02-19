/**
 * Highlightly NCAAB Service
 * Provides H2H with verified scores and advanced player stats for NCAAB games.
 * Used selectively — only for NCAAB, only for the two teams in the current game.
 *
 * Endpoints used:
 *   GET /teams?league=ncaab&name=X        — team ID lookup
 *   GET /head-2-head?teamIdOne=X&teamIdTwo=Y — last 10 H2H meetings with scores
 *   GET /teams/statistics/{id}?fromDate=X  — team-level advanced stats
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

function getApiKey() {
  // Highlightly is on RapidAPI — same subscription key as Tank01
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
  if (!key) return null;  // No key configured — graceful skip

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
// Team ID Lookup
// ─────────────────────────────────────────────────────────────

/**
 * Fetch all NCAAB teams from the API once, cache forever.
 * The API name param searches mascots only, so we fetch all teams
 * and match locally by displayName for reliable lookups.
 */
async function getAllNcaabTeams() {
  if (allNcaabTeams) return allNcaabTeams;

  const data = await apiCall('/teams', { league: 'ncaab' }, Infinity);
  const teams = data?.data || data || [];
  if (Array.isArray(teams) && teams.length > 0) {
    // Filter to NCAA only (API returns mixed leagues)
    allNcaabTeams = teams.filter(t =>
      (t.league === 'NCAA' || t.league === 'ncaab' || (t.displayName || '').length > 0)
    );
    console.log(`[Highlightly] Loaded ${allNcaabTeams.length} teams for local matching`);
  } else {
    console.warn('[Highlightly] Failed to load teams (API returned empty or null) — will retry next call');
    return []; // Return empty but DON'T cache — leave allNcaabTeams as null so next call retries
  }
  return allNcaabTeams;
}

/**
 * Find Highlightly's team ID for an NCAAB team by name.
 * Fetches all teams once, then matches locally by displayName.
 * Results cached indefinitely.
 */
async function findNcaabTeamId(teamName) {
  const cacheKey = teamName.toLowerCase().trim();
  if (teamIdCache.has(cacheKey)) return teamIdCache.get(cacheKey);

  const teams = await getAllNcaabTeams();
  if (!teams.length) {
    console.warn(`[Highlightly] No teams loaded, cannot match "${teamName}"`);
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

  // 3. Progressive word-dropping from input against displayName
  //    e.g., "North Texas Mean Green" → try "North Texas Mean", "North Texas"
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
    console.log(`[Highlightly] Matched "${teamName}" → ID ${id} (${fullName})`);
    const result = { id, fullName };
    teamIdCache.set(cacheKey, result);
    return result;
  }

  console.warn(`[Highlightly] Could not find NCAAB team: "${teamName}"`);
  teamIdCache.set(cacheKey, null);
  return null;
}

// ─────────────────────────────────────────────────────────────
// H2H (Head-to-Head)
// ─────────────────────────────────────────────────────────────

/**
 * Get H2H games between two NCAAB teams for the current season.
 * Returns games with actual scores — no undefined-undefined problem.
 * Filters to 2025-26 season only (games after Nov 1, 2025).
 */
async function getNcaabH2H(homeTeamName, awayTeamName) {
  const startTime = Date.now();
  const [homeTeam, awayTeam] = await Promise.all([
    findNcaabTeamId(homeTeamName),
    findNcaabTeamId(awayTeamName)
  ]);

  if (!homeTeam?.id || !awayTeam?.id) return null;

  const data = await apiCall('/head-2-head', {
    teamIdOne: homeTeam.id,
    teamIdTwo: awayTeam.id
  }, 24 * 60 * 60 * 1000); // Cache 24h — H2H doesn't change within a day

  if (!data) return null;

  const allGames = data?.data || data || [];
  if (!Array.isArray(allGames) || allGames.length === 0) {
    console.log(`[Highlightly] No H2H games found between ${homeTeamName} and ${awayTeamName}`);
    return null;
  }

  // Filter to current season only (dynamic — NCAAB starts in November)
  // Also filter to completed games only (state.description === "Finished")
  const filterNow = new Date();
  const filterYr = filterNow.getMonth() >= 6 ? filterNow.getFullYear() : filterNow.getFullYear() - 1;
  const seasonStart = new Date(`${filterYr}-11-01`).getTime();
  const nowMs = Date.now();
  const seasonGames = allGames.filter(g => {
    const ts = g.date ? new Date(g.date).getTime() : (g.startTimestamp ? g.startTimestamp * 1000 : 0);
    const isFinished = g.state?.description === 'Finished' || g.state?.description === 'Final';
    return ts >= seasonStart && ts < nowMs && isFinished;
  });

  console.log(`[Highlightly] H2H: ${seasonGames.length} game(s) this season between ${homeTeamName} and ${awayTeamName} (${Date.now() - startTime}ms)`);

  return {
    homeTeamName,
    awayTeamName,
    homeTeamId: homeTeam.id,
    awayTeamId: awayTeam.id,
    games: seasonGames
  };
}

// ─────────────────────────────────────────────────────────────
// Team Advanced Stats
// ─────────────────────────────────────────────────────────────

/**
 * Get team-level advanced stats from Highlightly for an NCAAB team.
 * Uses fromDate to get current season data only.
 */
async function getNcaabTeamStats(teamName) {
  const team = await findNcaabTeamId(teamName);
  if (!team?.id) return null;

  // Dynamic season start (NCAAB starts in November)
  const now = new Date();
  const yr = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const data = await apiCall(`/teams/statistics/${team.id}`, {
    fromDate: `${yr}-11-01`
  });

  if (!data) return null;

  console.log(`[Highlightly] Team stats for ${teamName}: ${JSON.stringify(data).substring(0, 200)}...`);
  return { teamName, teamId: team.id, stats: data?.data || data };
}

// ─────────────────────────────────────────────────────────────
// Formatting for Scout Report
// ─────────────────────────────────────────────────────────────

/**
 * Format Highlightly H2H data for the scout report.
 * Returns formatted string or empty string if no data.
 */
function formatHighlightlyH2H(h2hData, homeTeam, awayTeam) {
  if (!h2hData?.games?.length) return '';

  // Dynamic season label
  const _now = new Date();
  const _yr = _now.getMonth() >= 6 ? _now.getFullYear() : _now.getFullYear() - 1;
  const seasonLabel = `${_yr}-${String(_yr + 1).slice(2)}`;

  const lines = [];
  lines.push(`HEAD-TO-HEAD HISTORY (${seasonLabel} SEASON)`);
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  let homeWins = 0;
  let awayWins = 0;

  for (const g of h2hData.games) {
    // Extract scores — API uses state.score.homeTeam/awayTeam as arrays of half scores
    const gameHomeScoreArr = g.state?.score?.homeTeam || [];
    const gameAwayScoreArr = g.state?.score?.awayTeam || [];
    const gameHomeTotal = gameHomeScoreArr.reduce((s, v) => s + (v || 0), 0);
    const gameAwayTotal = gameAwayScoreArr.reduce((s, v) => s + (v || 0), 0);

    if (gameHomeTotal === 0 && gameAwayTotal === 0) continue;

    // Determine which team is home in this game
    const gameHomeId = g.homeTeam?.id || g.homeTeamId;
    const isOurHomeTeamHome = gameHomeId === h2hData.homeTeamId;

    const ourHomeScore = isOurHomeTeamHome ? gameHomeTotal : gameAwayTotal;
    const ourAwayScore = isOurHomeTeamHome ? gameAwayTotal : gameHomeTotal;

    if (ourHomeScore > ourAwayScore) homeWins++;
    else if (ourAwayScore > ourHomeScore) awayWins++;

    const date = g.date
      ? new Date(g.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : 'Unknown date';
    const winner = ourHomeScore > ourAwayScore ? homeTeam : awayTeam;
    const margin = Math.abs(ourHomeScore - ourAwayScore);

    // Include half scores if available
    const homeH1 = isOurHomeTeamHome ? (gameHomeScoreArr[0] ?? '') : (gameAwayScoreArr[0] ?? '');
    const awayH1 = isOurHomeTeamHome ? (gameAwayScoreArr[0] ?? '') : (gameHomeScoreArr[0] ?? '');
    const halfInfo = homeH1 !== '' && awayH1 !== '' ? ` (1H: ${homeH1}-${awayH1})` : '';

    lines.push(`  ${date}: ${homeTeam} ${ourHomeScore} - ${ourAwayScore} ${awayTeam}${halfInfo} → ${winner} by ${margin}`);
  }

  if (homeWins + awayWins > 0) {
    lines.push(`  Season H2H: ${homeTeam} ${homeWins}-${awayWins} ${awayTeam}`);
  }
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  return lines.join('\n');
}

export {
  findNcaabTeamId,
  getNcaabH2H,
  getNcaabTeamStats,
  formatHighlightlyH2H
};
