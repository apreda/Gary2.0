/**
 * NHL Official Stats API Service
 * Provides team-level percentage stats (CF%, PDO, 5v5 shooting%, 5v5 save%).
 * Data source: api.nhle.com (free, no auth required)
 *
 * Fetches all teams' percentages once per session, caches for 2 hours,
 * and serves individual team lookups from cache.
 *
 * Used for:
 *   - PDO (shootingPlusSavePct5v5) — primary source
 *   - CF% cross-validation (satPct vs MoneyPuck corsiPercentage)
 *   - 5v5 shooting% and save% breakdowns
 *   - Zone start percentage
 *   - Game-state Corsi splits (ahead/behind/close/tied)
 */

import https from 'https';

// ═══════════════════════════════════════════════════════════════
// Cache
// ═══════════════════════════════════════════════════════════════
let _cache = null;           // { data: Map<normalizedName, teamObj>, ts: number, seasonId: string }
let _fetchPromise = null;
const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours

/**
 * Normalize team name for matching.
 */
function normalize(name) {
  if (!name) return '';
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Fetch all team percentages from the NHL API.
 */
async function fetchPercentages(seasonId) {
  const now = Date.now();
  if (_cache && _cache.seasonId === seasonId && (now - _cache.ts) < CACHE_TTL) {
    return _cache.data;
  }
  if (_fetchPromise) return _fetchPromise;

  _fetchPromise = _fetchPercentagesInner(seasonId);
  try {
    return await _fetchPromise;
  } finally {
    _fetchPromise = null;
  }
}

async function _fetchPercentagesInner(seasonId) {
  const url = `https://api.nhle.com/stats/rest/en/team/percentages?cayenneExp=seasonId=${seasonId}%20and%20gameTypeId=2`;
  console.log(`[NHL API] Fetching team percentages from api.nhle.com for season ${seasonId}...`);

  const raw = await new Promise((resolve, reject) => {
    const req = https.get(url, {
      timeout: 15000,
      headers: { 'User-Agent': 'Gary2.0/1.0 (NHL Analytics)' }
    }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} from api.nhle.com`));
        res.resume();
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('NHL API request timed out')); });
  });

  const json = JSON.parse(raw);
  const teams = json?.data;
  if (!Array.isArray(teams) || teams.length === 0) {
    throw new Error('NHL API returned empty or invalid data');
  }

  // Build lookup map: normalized team name → stats
  const teamMap = new Map();
  for (const t of teams) {
    const fullName = t.teamFullName;
    if (!fullName) continue;

    const obj = {
      team: fullName,
      teamId: t.teamId,
      games_played: t.gamesPlayed,
      points: t.points,
      point_pct: t.pointPct,
      // Corsi (shot attempts %)
      corsi_pct: parseFloat(((t.satPct || 0) * 100).toFixed(2)),
      corsi_pct_ahead: t.satPctAhead ? parseFloat((t.satPctAhead * 100).toFixed(2)) : null,
      corsi_pct_behind: t.satPctBehind ? parseFloat((t.satPctBehind * 100).toFixed(2)) : null,
      corsi_pct_close: t.satPctClose ? parseFloat((t.satPctClose * 100).toFixed(2)) : null,
      corsi_pct_tied: t.satPctTied ? parseFloat((t.satPctTied * 100).toFixed(2)) : null,
      // Fenwick (unblocked shot attempts %)
      fenwick_pct: t.usatPct ? parseFloat((t.usatPct * 100).toFixed(2)) : null,
      // PDO = shooting% + save% (5v5)
      pdo: t.shootingPlusSavePct5v5 ? parseFloat(t.shootingPlusSavePct5v5.toFixed(4)) : null,
      shooting_pct_5v5: t.shootingPct5v5 ? parseFloat((t.shootingPct5v5 * 100).toFixed(2)) : null,
      save_pct_5v5: t.savePct5v5 ? parseFloat((t.savePct5v5 * 100).toFixed(2)) : null,
      // Zone starts
      zone_start_pct_5v5: t.zoneStartPct5v5 ? parseFloat((t.zoneStartPct5v5 * 100).toFixed(2)) : null,
      // Goals
      goals_for_pct: t.goalsForPct ? parseFloat((t.goalsForPct * 100).toFixed(2)) : null,
      // PP%/PK% — merged from powerplay + penaltykill endpoints
      power_play_pct: null,
      penalty_kill_pct: null,
    };

    // Store under multiple keys for flexible matching
    teamMap.set(normalize(fullName), obj);

    // Also store under team abbreviation-like last word (e.g., "hurricanes")
    const words = normalize(fullName).split(' ');
    if (words.length >= 2) {
      teamMap.set(words[words.length - 1], obj);
    }
  }

  // Fetch PP% and PK% from separate NHL API endpoints and merge
  try {
    const fetchJson = (endpoint) => new Promise((resolve, reject) => {
      const u = `https://api.nhle.com/stats/rest/en/team/${endpoint}?cayenneExp=seasonId=${seasonId}%20and%20gameTypeId=2`;
      const req = https.get(u, { timeout: 10000 }, (res) => {
        if (res.statusCode !== 200) { console.warn(`[NHL API] PP/PK endpoint "${endpoint}" returned HTTP ${res.statusCode}`); res.resume(); resolve([]); return; }
        let d = '';
        res.on('data', chunk => d += chunk);
        res.on('end', () => { try { resolve(JSON.parse(d)?.data || []); } catch { resolve([]); } });
      });
      req.on('error', (e) => { console.warn(`[NHL API] PP/PK endpoint error: ${e.message}`); resolve([]); });
      req.on('timeout', () => { console.warn(`[NHL API] PP/PK endpoint timed out for ${endpoint}`); req.destroy(); resolve([]); });
    });

    const [ppData, pkData] = await Promise.all([fetchJson('powerplay'), fetchJson('penaltykill')]);

    // Build PP/PK lookup by teamId
    const ppMap = new Map();
    for (const t of ppData) { if (t.teamId) ppMap.set(t.teamId, t.powerPlayPct); }
    const pkMap = new Map();
    for (const t of pkData) { if (t.teamId) pkMap.set(t.teamId, t.penaltyKillPct); }

    // Merge into existing team objects
    for (const [, obj] of teamMap) {
      if (obj.teamId && ppMap.has(obj.teamId)) {
        obj.power_play_pct = parseFloat((ppMap.get(obj.teamId) * 100).toFixed(1));
      }
      if (obj.teamId && pkMap.has(obj.teamId)) {
        obj.penalty_kill_pct = parseFloat((pkMap.get(obj.teamId) * 100).toFixed(1));
      }
    }
    console.log(`[NHL API] Merged PP%/PK% for ${ppMap.size}/${pkMap.size} teams`);
  } catch (e) {
    console.warn(`[NHL API] PP%/PK% merge failed: ${e.message}`);
  }

  console.log(`[NHL API] Cached ${teamMap.size} entries (${teams.length} teams) for season ${seasonId}`);
  _cache = { data: teamMap, ts: Date.now(), seasonId };
  return teamMap;
}

/**
 * Get percentage stats for a specific team.
 *
 * @param {string} teamName - Team name (any format)
 * @param {string} [seasonId] - NHL season ID (defaults to current, e.g., "20252026")
 * @returns {object|null} Team percentages object or null
 */
async function getTeamPercentages(teamName, seasonId) {
  if (!seasonId) seasonId = getCurrentNhlSeasonId();

  try {
    const teams = await fetchPercentages(seasonId);
    const key = normalize(teamName);

    // Exact match
    if (teams.has(key)) return teams.get(key);

    // Substring match — prefer longest
    let bestMatch = null;
    let bestLen = 0;
    for (const [mapKey, obj] of teams) {
      if (mapKey.includes(key) || key.includes(mapKey)) {
        if (mapKey.length > bestLen) {
          bestMatch = obj;
          bestLen = mapKey.length;
        }
      }
    }
    if (bestMatch) return bestMatch;

    console.warn(`[NHL API] No match for "${teamName}" (normalized: "${key}")`);
    return null;
  } catch (err) {
    console.error(`[NHL API] getTeamPercentages failed for "${teamName}":`, err.message);
    return null;
  }
}

/**
 * Determine the current NHL season ID.
 * Format: "20252026" for the 2025-26 season.
 */
function getCurrentNhlSeasonId() {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  const year = now.getFullYear();
  // Before August = still in previous season
  const startYear = month >= 8 ? year : year - 1;
  return `${startYear}${startYear + 1}`;
}

export {
  getTeamPercentages,
  getCurrentNhlSeasonId,
};
