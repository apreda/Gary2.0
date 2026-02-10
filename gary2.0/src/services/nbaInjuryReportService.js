/**
 * NBA Injury Report Service
 * Fetches structured NBA injury data from RapidAPI (NBA Injuries Reports)
 *
 * Endpoint: GET /injuries/nba/{YYYY-MM-DD}
 * Returns all NBA injury reports for a given date as structured JSON.
 * Updated 3x daily (11AM, 3PM, 5PM ET) from official NBA injury reports.
 *
 * This replaces unreliable Gemini Grounding for NBA injury STATUS extraction.
 * Grounding is still used for lineups (starters).
 * BDL is still used for duration enrichment.
 */

const NBA_INJURIES_BASE_URL = 'https://nba-injuries-reports.p.rapidapi.com';
const NBA_INJURIES_HOST = 'nba-injuries-reports.p.rapidapi.com';

// Cache: one call returns ALL teams, so cache per date (5 min TTL)
let cachedData = null;
let cachedDate = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour (API updates 3x daily, one fetch per run is enough)

/**
 * Get the RapidAPI key (same key used for Tank01 DFS)
 */
function getApiKey() {
  return process.env.TANK01_RAPIDAPI_KEY ||
         process.env.VITE_TANK01_RAPIDAPI_KEY ||
         null;
}

/**
 * Fetch all NBA injury reports for a given date
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {Promise<Array>} Array of injury report entries
 */
async function fetchAllInjuries(dateStr) {
  // Check cache
  const now = Date.now();
  if (cachedData && cachedDate === dateStr && (now - cachedAt) < CACHE_TTL_MS) {
    console.log(`[NBA Injuries API] Using cached data (${cachedData.length} entries, ${Math.round((now - cachedAt) / 1000)}s old)`);
    return cachedData;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('RapidAPI key not configured (TANK01_RAPIDAPI_KEY)');
  }

  const url = `${NBA_INJURIES_BASE_URL}/injuries/nba/${dateStr}`;
  console.log(`[NBA Injuries API] Fetching: ${url}`);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'x-rapidapi-key': apiKey,
      'x-rapidapi-host': NBA_INJURIES_HOST
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    // If 404, the date may be tomorrow — try today's date instead
    // Injury reports update 3x daily, today's data is valid for tomorrow's games
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    if (response.status === 404 && dateStr !== todayStr) {
      console.warn(`[NBA Injuries API] 404 for ${dateStr} — trying today's date (${todayStr})`);
      return fetchAllInjuries(todayStr);
    }
    console.error(`[NBA Injuries API] Error ${response.status}: ${errorText}`);
    throw new Error(`NBA Injuries API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    // Might be an error object like { message: "quota exceeded" }
    if (data?.message) {
      throw new Error(`NBA Injuries API: ${data.message}`);
    }
    throw new Error('NBA Injuries API returned unexpected format');
  }

  // Cache it
  cachedData = data;
  cachedDate = dateStr;
  cachedAt = now;

  console.log(`[NBA Injuries API] Fetched ${data.length} entries for ${dateStr}`);
  return data;
}

/**
 * Normalize team name for matching (handles variations)
 */
function normalizeTeamName(name) {
  return (name || '').toLowerCase().trim();
}

/**
 * Check if an API team name matches a target team name
 * Handles variations like "Miami Heat" matching "Miami Heat"
 */
function teamsMatch(apiTeam, targetTeam) {
  const api = normalizeTeamName(apiTeam);
  const target = normalizeTeamName(targetTeam);
  if (!api || !target) return false;
  return api === target || api.includes(target) || target.includes(api);
}

/**
 * Filter injury entries to only actionable statuses
 * Excludes: Available (cleared to play), G-League assignments
 */
function isActionableInjury(entry) {
  const status = (entry.status || '').toLowerCase();
  const reason = (entry.reason || '').toLowerCase();

  // Skip players cleared to play
  if (status === 'available') return false;

  // Skip G-League assignments (not injuries)
  if (reason.includes('g league') || reason.includes('g-league')) return false;

  return true;
}

/**
 * Map API status to the pipeline's expected status format
 */
function mapStatus(apiStatus) {
  const s = (apiStatus || '').toLowerCase();
  if (s === 'out') return 'Out';
  if (s === 'doubtful') return 'Doubtful';
  if (s === 'questionable') return 'Questionable';
  if (s === 'probable') return 'Prob';
  if (s === 'available') return 'Available';
  return apiStatus || 'Unknown';
}

/**
 * Parse full player name into first_name / last_name
 */
function parsePlayerName(fullName) {
  const parts = (fullName || '').trim().split(/\s+/);
  if (parts.length === 0) return { first_name: '', last_name: '' };
  if (parts.length === 1) return { first_name: parts[0], last_name: '' };
  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(' ')
  };
}

/**
 * Get NBA injuries for specific teams, formatted for the scout report pipeline.
 * Returns the same structure as parseGroundingInjuries() so it plugs in seamlessly.
 *
 * @param {string} homeTeam - Home team full name (e.g., "Miami Heat")
 * @param {string} awayTeam - Away team full name (e.g., "Utah Jazz")
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {Promise<{home: Array, away: Array, groundingRaw: string}|null>} Structured injuries or null on failure
 */
export async function fetchNbaInjuriesForGame(homeTeam, awayTeam, dateStr) {
  try {
    const allEntries = await fetchAllInjuries(dateStr);

    const homeInjuries = [];
    const awayInjuries = [];
    const homeRaw = [];
    const awayRaw = [];

    for (const entry of allEntries) {
      // Only process entries for our teams
      const isHome = teamsMatch(entry.team, homeTeam);
      const isAway = teamsMatch(entry.team, awayTeam);
      if (!isHome && !isAway) continue;

      // Skip non-actionable entries
      if (!isActionableInjury(entry)) continue;

      const { first_name, last_name } = parsePlayerName(entry.player);
      const status = mapStatus(entry.status);
      const reason = entry.reason || '';

      const injury = {
        player: {
          first_name,
          last_name,
          position: ''
        },
        status,
        duration: 'UNKNOWN', // BDL enrichment will fill this in
        durationContext: reason,
        isEdge: false,
        durationNote: '',
        reportDateStr: '',
        daysSinceReport: null,
        source: 'nba_injury_report_api'
      };

      const rawLine = `${entry.player} - ${status} (${reason})`;

      if (isHome) {
        homeInjuries.push(injury);
        homeRaw.push(rawLine);
      } else {
        awayInjuries.push(injury);
        awayRaw.push(rawLine);
      }
    }

    // Build groundingRaw-style text for downstream context
    const groundingRaw = [
      `=== ${awayTeam} ===`,
      `${awayTeam} INJURY REPORT:`,
      awayRaw.length > 0 ? awayRaw.join('\n') : 'No injuries reported',
      '',
      `=== ${homeTeam} ===`,
      `${homeTeam} INJURY REPORT:`,
      homeRaw.length > 0 ? homeRaw.join('\n') : 'No injuries reported'
    ].join('\n');

    // Log summary
    const homeOut = homeInjuries.filter(i => i.status === 'Out').length;
    const awayOut = awayInjuries.filter(i => i.status === 'Out').length;
    console.log(`[NBA Injuries API] ${homeTeam}: ${homeInjuries.length} injuries (${homeOut} OUT)`);
    console.log(`[NBA Injuries API] ${awayTeam}: ${awayInjuries.length} injuries (${awayOut} OUT)`);

    return {
      home: homeInjuries,
      away: awayInjuries,
      groundingRaw
    };
  } catch (error) {
    console.error(`[NBA Injuries API] Failed: ${error.message}`);
    return null;
  }
}

export default { fetchNbaInjuriesForGame };
