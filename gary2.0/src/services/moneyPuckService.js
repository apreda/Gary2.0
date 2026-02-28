/**
 * MoneyPuck NHL Service
 * Provides advanced analytics for all NHL teams and goalies.
 * Data source: moneypuck.com (free, no auth required)
 *
 * Fetches full-season CSV data once per session (all teams/goalies),
 * caches for 2 hours, and serves individual team lookups from cache.
 *
 * Replaces Gemini Grounding calls for:
 *   - CORSI_FOR_PCT (teams.csv → corsiPercentage)
 *   - EXPECTED_GOALS (teams.csv → xGoalsFor/Against/Percentage)
 *   - HIGH_DANGER_CHANCES (teams.csv → highDangerShotsFor/Against)
 *   - NHL_GSAX (goalies.csv → xGoals - goals)
 *   - NHL_HIGH_DANGER_SV_PCT (goalies.csv → 1 - highDangerGoals/highDangerShots)
 *   - SHOOTING_REGRESSION (teams.csv → shootingPercentage, savePercentage)
 *   - LUCK_INDICATORS (teams.csv → shooting% + save% for PDO, xG deltas)
 */

import https from 'https';

// ═══════════════════════════════════════════════════════════════
// Cache: full datasets fetched once, reused for every game
// ═══════════════════════════════════════════════════════════════
let _teamsCache = null;      // { data: Map<abbr, { all: obj, '5on5': obj }>, ts: number, year: number }
let _goaliesCache = null;    // { data: Map<abbr, [goalieObj]>, ts: number, year: number }
let _teamsFetchPromise = null;
let _goaliesFetchPromise = null;
const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours

// ═══════════════════════════════════════════════════════════════
// BDL full name → MoneyPuck 3-letter abbreviation
// ═══════════════════════════════════════════════════════════════
const BDL_TO_MONEYPUCK = {
  'anaheim ducks': 'ANA',
  'boston bruins': 'BOS',
  'buffalo sabres': 'BUF',
  'calgary flames': 'CGY',
  'carolina hurricanes': 'CAR',
  'chicago blackhawks': 'CHI',
  'colorado avalanche': 'COL',
  'columbus blue jackets': 'CBJ',
  'dallas stars': 'DAL',
  'detroit red wings': 'DET',
  'edmonton oilers': 'EDM',
  'florida panthers': 'FLA',
  'los angeles kings': 'LAK',
  'minnesota wild': 'MIN',
  'montreal canadiens': 'MTL',
  'nashville predators': 'NSH',
  'new jersey devils': 'NJD',
  'new york islanders': 'NYI',
  'new york rangers': 'NYR',
  'ottawa senators': 'OTT',
  'philadelphia flyers': 'PHI',
  'pittsburgh penguins': 'PIT',
  'san jose sharks': 'SJS',
  'seattle kraken': 'SEA',
  'st. louis blues': 'STL',
  'st louis blues': 'STL',
  'tampa bay lightning': 'TBL',
  'toronto maple leafs': 'TOR',
  'utah hockey club': 'UTA',
  'vancouver canucks': 'VAN',
  'vegas golden knights': 'VGK',
  'washington capitals': 'WSH',
  'winnipeg jets': 'WPG',
};

// Reverse mapping for goalie team lookup
const MONEYPUCK_TO_FULLNAME = {};
for (const [full, abbr] of Object.entries(BDL_TO_MONEYPUCK)) {
  if (!MONEYPUCK_TO_FULLNAME[abbr]) MONEYPUCK_TO_FULLNAME[abbr] = full;
}

/**
 * Normalize team name for lookup
 */
function normalize(name) {
  if (!name) return '';
  return name.toLowerCase().replace(/[^a-z0-9\s.]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Resolve a BDL team name to MoneyPuck 3-letter abbreviation.
 */
function resolveAbbr(teamName) {
  const key = normalize(teamName);

  // Direct match
  if (BDL_TO_MONEYPUCK[key]) return BDL_TO_MONEYPUCK[key];

  // Already an abbreviation?
  const upper = teamName.toUpperCase().trim();
  const validAbbrs = new Set(Object.values(BDL_TO_MONEYPUCK));
  if (validAbbrs.has(upper)) return upper;

  // Substring match (e.g., "Avalanche" matches "colorado avalanche")
  for (const [fullName, abbr] of Object.entries(BDL_TO_MONEYPUCK)) {
    if (fullName.includes(key) || key.includes(fullName)) return abbr;
  }

  // Last word match (e.g., "Bruins" → "boston bruins")
  const words = key.split(' ');
  const lastWord = words[words.length - 1];
  if (lastWord.length >= 4) {
    for (const [fullName, abbr] of Object.entries(BDL_TO_MONEYPUCK)) {
      if (fullName.endsWith(lastWord)) return abbr;
    }
  }

  console.warn(`[MoneyPuck] No abbreviation match for "${teamName}" (normalized: "${key}")`);
  return null;
}

/**
 * Parse CSV text into array of objects using header row as keys.
 */
function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',');
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    if (values.length !== headers.length) continue;

    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      const val = values[j];
      // Try to parse as number
      const num = Number(val);
      obj[headers[j]] = (val !== '' && !isNaN(num)) ? num : val;
    }
    rows.push(obj);
  }

  return rows;
}

/**
 * Fetch raw CSV text from MoneyPuck via HTTPS.
 */
function fetchCSV(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      timeout: 20000,
      headers: { 'User-Agent': 'Gary2.0/1.0 (NHL Analytics)' }
    }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} from moneypuck.com`));
        res.resume();
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('MoneyPuck request timed out')); });
  });
}

// ═══════════════════════════════════════════════════════════════
// Teams data
// ═══════════════════════════════════════════════════════════════

async function fetchTeamsData(year) {
  const now = Date.now();
  if (_teamsCache && _teamsCache.year === year && (now - _teamsCache.ts) < CACHE_TTL) {
    return _teamsCache.data;
  }
  if (_teamsFetchPromise) return _teamsFetchPromise;

  _teamsFetchPromise = _fetchTeamsDataInner(year);
  try {
    return await _teamsFetchPromise;
  } finally {
    _teamsFetchPromise = null;
  }
}

async function _fetchTeamsDataInner(year) {
  const url = `https://moneypuck.com/moneypuck/playerData/seasonSummary/${year}/regular/teams.csv`;
  console.log(`[MoneyPuck] Fetching teams data from ${url}...`);

  const raw = await fetchCSV(url);
  const rows = parseCSV(raw);

  if (rows.length === 0) {
    throw new Error('MoneyPuck teams.csv returned empty data');
  }

  // Build map: abbr → { '5on5': row, 'all': row, '5on4': row, '4on5': row }
  const teamMap = new Map();
  for (const row of rows) {
    // Column 0 is team abbreviation (first 'team' column)
    const abbr = row.team;
    const situation = row.situation;
    if (!abbr || !situation) continue;

    if (!teamMap.has(abbr)) teamMap.set(abbr, {});
    teamMap.get(abbr)[situation] = row;
  }

  console.log(`[MoneyPuck] Cached ${teamMap.size} teams for ${year}`);
  _teamsCache = { data: teamMap, ts: Date.now(), year };
  return teamMap;
}

// ═══════════════════════════════════════════════════════════════
// Goalies data
// ═══════════════════════════════════════════════════════════════

async function fetchGoaliesData(year) {
  const now = Date.now();
  if (_goaliesCache && _goaliesCache.year === year && (now - _goaliesCache.ts) < CACHE_TTL) {
    return _goaliesCache.data;
  }
  if (_goaliesFetchPromise) return _goaliesFetchPromise;

  _goaliesFetchPromise = _fetchGoaliesDataInner(year);
  try {
    return await _goaliesFetchPromise;
  } finally {
    _goaliesFetchPromise = null;
  }
}

async function _fetchGoaliesDataInner(year) {
  const url = `https://moneypuck.com/moneypuck/playerData/seasonSummary/${year}/regular/goalies.csv`;
  console.log(`[MoneyPuck] Fetching goalies data from ${url}...`);

  const raw = await fetchCSV(url);
  const rows = parseCSV(raw);

  if (rows.length === 0) {
    throw new Error('MoneyPuck goalies.csv returned empty data');
  }

  // Build map: team abbr → [goalie objects] (sorted by games_played desc)
  const goalieMap = new Map();
  for (const row of rows) {
    const abbr = row.team;
    const situation = row.situation;
    if (!abbr || situation !== '5on5' || row.position !== 'G') continue;

    const onGoal = row.ongoal || 0;
    const goals = row.goals || 0;
    const xGoals = row.xGoals || 0;
    const hdShots = row.highDangerShots || 0;
    const hdGoals = row.highDangerGoals || 0;

    const goalieObj = {
      name: row.name,
      team: abbr,
      games_played: row.games_played || 0,
      icetime: row.icetime || 0,
      // GSAx: positive = saved more than expected
      gsax: parseFloat((xGoals - goals).toFixed(2)),
      xg_against: parseFloat(xGoals.toFixed(2)),
      goals_against: goals,
      shots_on_goal: onGoal,
      saves: onGoal - goals,
      save_pct: onGoal > 0 ? parseFloat(((onGoal - goals) / onGoal).toFixed(4)) : null,
      // High danger
      hd_shots: hdShots,
      hd_goals: hdGoals,
      hd_sv_pct: hdShots > 0 ? parseFloat((1 - (hdGoals / hdShots)).toFixed(4)) : null,
      // Low/medium danger
      low_danger_shots: row.lowDangerShots || 0,
      low_danger_goals: row.lowDangerGoals || 0,
      medium_danger_shots: row.mediumDangerShots || 0,
      medium_danger_goals: row.mediumDangerGoals || 0,
    };

    if (!goalieMap.has(abbr)) goalieMap.set(abbr, []);
    goalieMap.get(abbr).push(goalieObj);
  }

  // Sort each team's goalies by games played (desc)
  for (const [, goalies] of goalieMap) {
    goalies.sort((a, b) => b.games_played - a.games_played);
  }

  console.log(`[MoneyPuck] Cached goalies for ${goalieMap.size} teams for ${year}`);
  _goaliesCache = { data: goalieMap, ts: Date.now(), year };
  return goalieMap;
}

// ═══════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════

/**
 * Get team advanced stats from MoneyPuck.
 * Returns 5v5 and all-situations data.
 *
 * @param {string} teamName - Team name (any format: BDL full name, abbreviation, etc.)
 * @param {number} [year] - MoneyPuck year (defaults to current)
 * @returns {object|null} Team stats object or null if not found
 */
async function getTeamStats(teamName, year) {
  if (!year) year = getCurrentMoneyPuckYear();

  try {
    const teams = await fetchTeamsData(year);
    const abbr = resolveAbbr(teamName);
    if (!abbr) return null;

    const teamData = teams.get(abbr);
    if (!teamData) {
      console.warn(`[MoneyPuck] No data for team "${teamName}" (abbr: ${abbr})`);
      return null;
    }

    const ev = teamData['5on5']; // 5v5 (even strength)
    const all = teamData['all']; // all situations

    if (!ev) {
      console.warn(`[MoneyPuck] No 5on5 data for ${abbr}`);
      return null;
    }

    // Games played from all-situations row
    const gp = all?.games_played || ev.games_played || 0;

    return {
      team: abbr,
      games_played: gp,
      // Possession (5v5, values are 0-1)
      corsi_pct: parseFloat(((ev.corsiPercentage || 0) * 100).toFixed(2)),
      fenwick_pct: parseFloat(((ev.fenwickPercentage || 0) * 100).toFixed(2)),
      // Expected goals (5v5, cumulative season totals)
      xg_pct: parseFloat(((ev.xGoalsPercentage || 0) * 100).toFixed(2)),
      xg_for: parseFloat((ev.xGoalsFor || 0).toFixed(2)),
      xg_against: parseFloat((ev.xGoalsAgainst || 0).toFixed(2)),
      // Actual goals (5v5)
      goals_for: ev.goalsFor || 0,
      goals_against: ev.goalsAgainst || 0,
      goals_above_expected: parseFloat(((ev.goalsFor || 0) - (ev.xGoalsFor || 0)).toFixed(2)),
      goals_allowed_above_expected: parseFloat(((ev.goalsAgainst || 0) - (ev.xGoalsAgainst || 0)).toFixed(2)),
      // High danger (5v5)
      hd_shots_for: ev.highDangerShotsFor || 0,
      hd_shots_against: ev.highDangerShotsAgainst || 0,
      hd_goals_for: ev.highDangerGoalsFor || 0,
      hd_goals_against: ev.highDangerGoalsAgainst || 0,
      hd_xg_for: parseFloat((ev.highDangerxGoalsFor || 0).toFixed(2)),
      hd_xg_against: parseFloat((ev.highDangerxGoalsAgainst || 0).toFixed(2)),
      // Shots (5v5)
      shots_on_goal_for: ev.shotsOnGoalFor || 0,
      shots_on_goal_against: ev.shotsOnGoalAgainst || 0,
      shot_attempts_for: ev.shotAttemptsFor || 0,
      shot_attempts_against: ev.shotAttemptsAgainst || 0,
      // Shooting/save rates (5v5, derived)
      shooting_pct: ev.goalsFor && ev.shotsOnGoalFor
        ? parseFloat(((ev.goalsFor / ev.shotsOnGoalFor) * 100).toFixed(2))
        : null,
      save_pct: ev.goalsAgainst != null && ev.shotsOnGoalAgainst
        ? parseFloat(((1 - ev.goalsAgainst / ev.shotsOnGoalAgainst) * 100).toFixed(2))
        : null,
      // PDO (5v5 shooting% + save%)
      pdo: (ev.goalsFor && ev.shotsOnGoalFor && ev.goalsAgainst != null && ev.shotsOnGoalAgainst)
        ? parseFloat(((ev.goalsFor / ev.shotsOnGoalFor) + (1 - ev.goalsAgainst / ev.shotsOnGoalAgainst)).toFixed(4))
        : null,
      // Ice time
      icetime_5v5: ev.iceTime || 0,
    };
  } catch (err) {
    console.error(`[MoneyPuck] getTeamStats failed for "${teamName}":`, err.message);
    return null;
  }
}

/**
 * Get goalie stats for a team from MoneyPuck.
 * Returns array of goalie objects sorted by games played (desc).
 *
 * @param {string} teamName - Team name (any format)
 * @param {number} [year] - MoneyPuck year (defaults to current)
 * @returns {Array|null} Array of goalie stat objects or null
 */
async function getGoalieStats(teamName, year) {
  if (!year) year = getCurrentMoneyPuckYear();

  try {
    const goalies = await fetchGoaliesData(year);
    const abbr = resolveAbbr(teamName);
    if (!abbr) return null;

    const teamGoalies = goalies.get(abbr);
    if (!teamGoalies || teamGoalies.length === 0) {
      console.warn(`[MoneyPuck] No goalie data for "${teamName}" (abbr: ${abbr})`);
      return null;
    }

    return teamGoalies;
  } catch (err) {
    console.error(`[MoneyPuck] getGoalieStats failed for "${teamName}":`, err.message);
    return null;
  }
}

/**
 * Determine the current MoneyPuck season year.
 * MoneyPuck uses the START year of the season (e.g., 2025-26 season = 2025).
 */
function getCurrentMoneyPuckYear() {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  const year = now.getFullYear();
  // If before August, we're in the previous year's season
  // e.g., Feb 2026 → 2025 (2025-26 season)
  // e.g., Oct 2026 → 2026 (2026-27 season)
  return month >= 8 ? year : year - 1;
}

export {
  getTeamStats,
  getGoalieStats,
  getCurrentMoneyPuckYear,
  resolveAbbr,
  BDL_TO_MONEYPUCK,
};
