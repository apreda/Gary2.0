/**
 * Barttorvik NCAAB Service
 * Provides T-Rank advanced metrics for all D1 college basketball teams.
 * Data source: barttorvik.com (free, no auth required)
 *
 * Fetches the full team ratings JSON once per session (365 teams),
 * caches for 6 hours, and serves individual team lookups from cache.
 *
 * Replaces Gemini Grounding calls for:
 *   - NCAAB_BARTTORVIK (T-Rank, AdjOE, AdjDE, Barthag, WAB)
 *   - NCAAB_KENPOM_RATINGS (KenPom-equivalent AdjO/AdjD/AdjEM)
 *   - NCAAB_OFFENSIVE_RATING / NCAAB_DEFENSIVE_RATING (broken BDL calc)
 *   - NCAAB_TEMPO (broken BDL calc)
 *   - fetchNcaabAdvancedMetrics() in scout report (2 Grounding calls)
 */

import https from 'https';

// ═══════════════════════════════════════════════════════════════
// Cache: full dataset fetched once, reused for every game
// ═══════════════════════════════════════════════════════════════
let _cache = null;           // { data: Map<normalizedName, teamObj>, ts: number, year: number }
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

// ═══════════════════════════════════════════════════════════════
// Field mapping: Barttorvik JSON returns arrays with 45 fields
// ═══════════════════════════════════════════════════════════════
const FIELD_MAP = {
  rank: 0,           // T-Rank (overall ranking)
  team: 1,           // Team name (Barttorvik format)
  conference: 2,     // Conference code (B10, SEC, ACC, B12, BE, P12, etc.)
  record: 3,         // Season W-L record
  adjOE: 4,          // Adjusted Offensive Efficiency (pts/100 poss)
  adjOE_rank: 5,     // AdjOE rank
  adjDE: 6,          // Adjusted Defensive Efficiency (pts/100 poss, lower = better)
  adjDE_rank: 7,     // AdjDE rank
  barthag: 8,        // Barthag (win probability metric)
  barthag_rank: 9,   // Barthag rank
  projW: 10,         // Projected wins
  projL: 11,         // Projected losses
  wab: 12,           // Wins Above Bubble
  confRecord: 14,    // Conference record
  tempo: 44,         // Tempo (possessions per game)
};

// ═══════════════════════════════════════════════════════════════
// BDL → Barttorvik name aliases for ambiguous teams
// Maps normalized BDL names to normalized Barttorvik keys.
// Prevents "Arizona State Sun Devils" from matching "Arizona"
// instead of "Arizona St." via greedy substring matching.
// ═══════════════════════════════════════════════════════════════
const BDL_TO_BARTTORVIK = {
  // "X State" teams that collide with "X" base teams
  'arizona state sun devils': 'arizona st',
  'arizona state': 'arizona st',
  'michigan state spartans': 'michigan st',
  'michigan state': 'michigan st',
  'mississippi state bulldogs': 'mississippi st',
  'mississippi state': 'mississippi st',
  'iowa state cyclones': 'iowa st',
  'iowa state': 'iowa st',
  'indiana state sycamores': 'indiana st',
  'indiana state': 'indiana st',
  'ohio state buckeyes': 'ohio st',
  'ohio state': 'ohio st',
  'kansas state wildcats': 'kansas st',
  'kansas state': 'kansas st',
  'oklahoma state cowboys': 'oklahoma st',
  'oklahoma state': 'oklahoma st',
  'florida state seminoles': 'florida st',
  'florida state': 'florida st',
  'penn state nittany lions': 'penn st',
  'penn state': 'penn st',
  'washington state cougars': 'washington st',
  'washington state': 'washington st',
  'oregon state beavers': 'oregon st',
  'oregon state': 'oregon st',
  'georgia state panthers': 'georgia st',
  'georgia state': 'georgia st',
  'tennessee state tigers': 'tennessee st',
  'tennessee state': 'tennessee st',
  'utah state aggies': 'utah st',
  'utah state': 'utah st',
  'texas state bobcats': 'texas st',
  'texas state': 'texas st',
  'colorado state rams': 'colorado st',
  'colorado state': 'colorado st',
  'boise state broncos': 'boise st',
  'boise state': 'boise st',
  'san diego state aztecs': 'san diego st',
  'san diego state': 'san diego st',
  'fresno state bulldogs': 'fresno st',
  'fresno state': 'fresno st',
  'new mexico state aggies': 'new mexico st',
  'new mexico state': 'new mexico st',
  'wichita state shockers': 'wichita st',
  'wichita state': 'wichita st',
  'north dakota state bison': 'north dakota st',
  'north dakota state': 'north dakota st',
  'south dakota state jackrabbits': 'south dakota st',
  'south dakota state': 'south dakota st',
  'montana state bobcats': 'montana st',
  'montana state': 'montana st',
  'illinois state redbirds': 'illinois st',
  'illinois state': 'illinois st',
  'missouri state bears': 'missouri st',
  'missouri state': 'missouri st',

  // NC State special case (Barttorvik uses "nc state" not "north carolina state")
  'nc state wolfpack': 'nc state',
  'north carolina state wolfpack': 'nc state',
  'north carolina state': 'nc state',

  // Mississippi / Ole Miss ambiguity
  'ole miss rebels': 'mississippi',
  'ole miss': 'mississippi',
  'mississippi rebels': 'mississippi',

  // Other common BDL → Barttorvik mismatches
  'uconn huskies': 'connecticut',
  'uconn': 'connecticut',
  'smu mustangs': 'smu',
  'pitt panthers': 'pittsburgh',
  'pitt': 'pittsburgh',
};

// Conference code → display name mapping
const CONF_DISPLAY_NAMES = {
  'B10': 'Big Ten', 'SEC': 'SEC', 'ACC': 'ACC', 'B12': 'Big 12',
  'BE': 'Big East', 'P12': 'Pac-12', 'Amer': 'AAC', 'MWC': 'Mountain West',
  'WCC': 'WCC', 'A10': 'Atlantic 10', 'MVC': 'Missouri Valley',
  'CUSA': 'Conference USA', 'MAC': 'MAC', 'SB': 'Sun Belt',
  'CAA': 'CAA', 'SC': 'Southern', 'Sum': 'Summit', 'WAC': 'WAC',
  'Ivy': 'Ivy League', 'Pat': 'Patriot', 'BSth': 'Big South',
  'AE': 'America East', 'Horz': 'Horizon', 'MAAC': 'MAAC',
  'NEC': 'NEC', 'OVC': 'Ohio Valley', 'ASun': 'Atlantic Sun',
  'BSky': 'Big Sky', 'BW': 'Big West', 'Slnd': 'Southland',
  'MEAC': 'MEAC', 'SWAC': 'SWAC',
};

/**
 * Normalize team name for fuzzy matching.
 * Strips punctuation, lowercases, handles common abbreviations.
 */
function normalize(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')  // strip punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fetch the full Barttorvik dataset for a given year.
 * Returns a Map of normalizedName → parsed team object.
 */
async function fetchAllTeams(year) {
  const now = Date.now();

  // Return cached data if still valid
  if (_cache && _cache.year === year && (now - _cache.ts) < CACHE_TTL) {
    return _cache.data;
  }

  const url = `https://barttorvik.com/${year}_team_results.json`;
  console.log(`[Barttorvik] Fetching all teams from ${url}...`);

  const raw = await new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 15000 }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} from barttorvik.com`));
        res.resume();
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Barttorvik request timed out')); });
  });

  const teams = JSON.parse(raw);
  if (!Array.isArray(teams) || teams.length === 0) {
    throw new Error('Barttorvik returned empty or invalid data');
  }

  // Build lookup map: multiple keys per team for fuzzy matching
  const teamMap = new Map();
  for (const arr of teams) {
    if (!Array.isArray(arr) || arr.length < 45) continue;

    const teamObj = {
      rank: arr[FIELD_MAP.rank],
      team: arr[FIELD_MAP.team],
      conference: arr[FIELD_MAP.conference],
      conferenceName: CONF_DISPLAY_NAMES[arr[FIELD_MAP.conference]] || arr[FIELD_MAP.conference],
      record: arr[FIELD_MAP.record],
      adjOE: parseFloat(arr[FIELD_MAP.adjOE]?.toFixed?.(1) ?? arr[FIELD_MAP.adjOE]),
      adjOE_rank: arr[FIELD_MAP.adjOE_rank],
      adjDE: parseFloat(arr[FIELD_MAP.adjDE]?.toFixed?.(1) ?? arr[FIELD_MAP.adjDE]),
      adjDE_rank: arr[FIELD_MAP.adjDE_rank],
      adjEM: parseFloat((arr[FIELD_MAP.adjOE] - arr[FIELD_MAP.adjDE]).toFixed(1)),
      barthag: parseFloat(arr[FIELD_MAP.barthag]?.toFixed?.(4) ?? arr[FIELD_MAP.barthag]),
      barthag_rank: arr[FIELD_MAP.barthag_rank],
      projW: parseFloat(arr[FIELD_MAP.projW]?.toFixed?.(1) ?? arr[FIELD_MAP.projW]),
      projL: parseFloat(arr[FIELD_MAP.projL]?.toFixed?.(1) ?? arr[FIELD_MAP.projL]),
      wab: parseFloat(arr[FIELD_MAP.wab]?.toFixed?.(1) ?? arr[FIELD_MAP.wab]),
      confRecord: arr[FIELD_MAP.confRecord],
      tempo: parseFloat(arr[FIELD_MAP.tempo]?.toFixed?.(1) ?? arr[FIELD_MAP.tempo]),
    };

    // Store under multiple normalized keys for matching
    const name = teamObj.team;
    teamMap.set(normalize(name), teamObj);

    // Also store without common suffixes for BDL name matching
    // e.g., "St. John's (NY)" → "st johns ny" AND "st johns"
    const stripped = normalize(name).replace(/\s*\(.*?\)\s*/g, '').trim();
    if (stripped !== normalize(name)) {
      teamMap.set(stripped, teamObj);
    }
  }

  console.log(`[Barttorvik] Cached ${teamMap.size} team entries (${teams.length} teams) for ${year}`);

  _cache = { data: teamMap, ts: now, year };
  return teamMap;
}

/**
 * Get Barttorvik ratings for a specific team.
 * Tries exact match first, then fuzzy substring matching.
 *
 * @param {string} teamName - Team name (any format: BDL, ESPN, full, etc.)
 * @param {number} [year] - Season year (defaults to current)
 * @returns {object|null} Team ratings object or null if not found/API fails
 */
async function getTeamRatings(teamName, year) {
  if (!year) year = getCurrentYear();

  try {
    const teams = await fetchAllTeams(year);
    if (!teams) return null;

    const key = normalize(teamName);

    // 1. Exact match
    if (teams.has(key)) return teams.get(key);

    // 2. Known BDL → Barttorvik alias (prevents X State → X collisions)
    const alias = BDL_TO_BARTTORVIK[key];
    if (alias && teams.has(alias)) return teams.get(alias);

    // 3. Try common name transformations
    const transforms = [
      key.replace(/state$/, 'st'),
      key.replace(/\bst\b/, 'state'),
      key.replace(/\buniversity\b/, ''),
      key.replace(/\buc\b/, 'california'),
      key.replace(/\bcal\b/, 'california'),
    ];
    for (const t of transforms) {
      const trimmed = t.trim();
      if (trimmed && teams.has(trimmed)) return teams.get(trimmed);
    }

    // 4. Substring / contains matching — prefer LONGEST match to avoid X matching X State
    let bestMatch = null;
    let bestMatchLen = 0;
    for (const [mapKey, teamObj] of teams) {
      if (mapKey.includes(key) || key.includes(mapKey)) {
        if (mapKey.length > bestMatchLen) {
          bestMatch = teamObj;
          bestMatchLen = mapKey.length;
        }
      }
    }
    if (bestMatch) return bestMatch;

    // 5. Last-word matching (e.g., "Eagles" for "Boston College Eagles")
    const words = key.split(' ');
    if (words.length >= 2) {
      const lastTwo = words.slice(-2).join(' ');
      let bestLastMatch = null;
      let bestLastLen = 0;
      for (const [mapKey] of teams) {
        if (mapKey.includes(lastTwo)) {
          if (mapKey.length > bestLastLen) {
            bestLastMatch = teams.get(mapKey);
            bestLastLen = mapKey.length;
          }
        }
      }
      if (bestLastMatch) return bestLastMatch;
    }

    console.warn(`[Barttorvik] No match for "${teamName}" (normalized: "${key}")`);
    return null;
  } catch (err) {
    console.warn(`[Barttorvik] getTeamRatings failed for "${teamName}":`, err.message);
    return null;
  }
}

/**
 * Get conference display name for a team.
 */
async function getConferenceName(teamName, year) {
  const team = await getTeamRatings(teamName, year);
  return team?.conferenceName || null;
}

/**
 * Get all teams (full cached dataset).
 */
async function getAllTeams(year) {
  if (!year) year = getCurrentYear();
  try {
    return await fetchAllTeams(year);
  } catch (err) {
    console.warn(`[Barttorvik] getAllTeams failed:`, err.message);
    return null;
  }
}

/**
 * Determine the current Barttorvik season year.
 * Barttorvik uses the END year of the season (e.g., 2025-26 season = 2026).
 */
function getCurrentYear() {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  const year = now.getFullYear();
  // If before August, we're still in the previous season's year
  // e.g., Feb 2026 → 2026 season (2025-26)
  // e.g., Sep 2026 → 2027 season (2026-27)
  return month >= 8 ? year + 1 : year;
}

export {
  getTeamRatings,
  getConferenceName,
  getAllTeams,
  getCurrentYear,
  CONF_DISPLAY_NAMES,
};
