/**
 * DraftKings Slate Service
 *
 * Fetches actual DFS slate-to-game mappings from DraftKings' public lobby API.
 * This is the SOURCE OF TRUTH for which games belong to which DFS contest.
 *
 * Endpoint: GET https://www.draftkings.com/lobby/getcontests?sport=NBA
 * - No auth required
 * - Returns GameSets[] with exact game-to-slate mappings
 * - Returns DraftGroups[] with DraftGroupIds for per-slate player data
 *
 * Key response structure:
 * - GameSets[].ContestStartTimeSuffix: "" = Main, "(Turbo)" = Turbo, "(Night)" = Night
 * - GameSets[].Competitions[]: games in that slate with team names and start times
 * - GameSets[].GameStyles[]: contest formats available (Classic, Showdown, etc.)
 * - DraftGroups[].DraftGroupId: unique ID for fetching per-slate player salaries
 * - DraftGroups[].GameTypeId: 70 = Classic, 81 = Showdown, 73 = Tiers, etc.
 */

import { normalizeTeamAbbreviation } from './agentic/agenticUtils.js';
import { getESTDate, toESTDate } from '../utils/dateUtils.js';

// Cache: keyed by sport (one call per sport per run)
const _cache = new Map(); // sport -> { response, cachedAt }
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// DK sport name mapping
const DK_SPORT_MAP = {
  'NBA': 'NBA',
  'NFL': 'NFL',
  'NHL': 'NHL',
  'MLB': 'MLB'
};

// Classic game type IDs (we only want these, not Showdown/Tiers/Snake)
const CLASSIC_GAME_TYPE_IDS = [70]; // 70 = Classic

// NBA city → standard abbreviation mapping
// DK uses city names in Competitions (e.g., "Atlanta", "Charlotte")
const NBA_CITY_TO_ABV = {
  'atlanta': 'ATL', 'boston': 'BOS', 'brooklyn': 'BKN', 'charlotte': 'CHA',
  'chicago': 'CHI', 'cleveland': 'CLE', 'dallas': 'DAL', 'denver': 'DEN',
  'detroit': 'DET', 'golden state': 'GSW', 'houston': 'HOU', 'indiana': 'IND',
  'los angeles': null, // Ambiguous — need to check team name
  'la clippers': 'LAC', 'la lakers': 'LAL',
  'memphis': 'MEM', 'miami': 'MIA', 'milwaukee': 'MIL', 'minnesota': 'MIN',
  'new orleans': 'NOP', 'new york': 'NYK', 'oklahoma city': 'OKC',
  'orlando': 'ORL', 'philadelphia': 'PHI', 'phoenix': 'PHX', 'portland': 'POR',
  'sacramento': 'SAC', 'san antonio': 'SAS', 'toronto': 'TOR', 'utah': 'UTA',
  'washington': 'WAS'
};

// Fallback: DK team ID → abbreviation (if city name is ambiguous)
const DK_NBA_TEAM_ID_TO_ABV = {
  // These IDs come from DK's internal system
  // We'll populate dynamically if needed
};

/**
 * Fetch DraftKings contest/slate data for a sport
 * @param {string} sport - 'NBA', 'NFL', etc.
 * @returns {Promise<Object>} Raw DK lobby response
 */
async function fetchDKContests(sport) {
  const sportKey = sport.toUpperCase();
  const now = Date.now();
  const cached = _cache.get(sportKey);
  if (cached && (now - cached.cachedAt) < CACHE_TTL_MS) {
    console.log(`[DK Slates] Using cached ${sportKey} response (${Math.round((now - cached.cachedAt) / 1000)}s old)`);
    return cached.response;
  }

  const dkSport = DK_SPORT_MAP[sport.toUpperCase()];
  if (!dkSport) {
    throw new Error(`Unsupported sport for DK slate discovery: ${sport}`);
  }

  const url = `https://www.draftkings.com/lobby/getcontests?sport=${dkSport}`;
  console.log(`[DK Slates] Fetching: ${url}`);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    }
  });

  if (!response.ok) {
    throw new Error(`DK API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // Cache it keyed by sport
  _cache.set(sportKey, { response: data, cachedAt: now });

  const gameSetCount = data.GameSets?.length || 0;
  const draftGroupCount = data.DraftGroups?.length || 0;
  console.log(`[DK Slates] Fetched: ${gameSetCount} GameSets, ${draftGroupCount} DraftGroups`);

  return data;
}

/**
 * Resolve a DK city name to a standard team abbreviation
 * Handles the "Los Angeles" ambiguity by checking DK team IDs or context
 */
function resolveTeamAbv(cityName, teamId, sport = 'NBA') {
  if (!cityName) return null;
  const city = cityName.toLowerCase().trim();

  if (sport === 'NBA') {
    // Check direct city mapping first
    const direct = NBA_CITY_TO_ABV[city];
    if (direct) return direct;

    // Handle "Los Angeles" ambiguity for NBA
    if (city === 'los angeles' || city === 'la') {
      // DK typically uses full names like "Los Angeles Clippers" or IDs to differentiate
      // For now, check the team ID if available
      if (DK_NBA_TEAM_ID_TO_ABV[teamId]) return DK_NBA_TEAM_ID_TO_ABV[teamId];
      // If still ambiguous, return null and we'll try the Description field
      return null;
    }
  }

  // Try normalizeTeamAbbreviation as last resort
  return normalizeTeamAbbreviation(cityName) || null;
}

/**
 * Parse a DK Competition's Description field for team abbreviations
 * Format is typically: "ATL @ CHA" or "MIL @ ORL"
 */
function parseDescriptionForTeams(description) {
  if (!description) return null;

  // Try "AWAY @ HOME" or "AWAY vs HOME" format
  const match = description.match(/^(\w{2,4})\s*[@vs]+\s*(\w{2,4})$/i);
  if (match) {
    return {
      away: normalizeTeamAbbreviation(match[1]),
      home: normalizeTeamAbbreviation(match[2])
    };
  }
  return null;
}

/**
 * Extract team abbreviations from a DK Competition object
 * Uses multiple strategies: Description parsing, city name mapping, team IDs
 */
function extractTeamsFromCompetition(comp, sport = 'NBA') {
  // Strategy 1: Parse Description (e.g., "ATL @ CHA")
  const fromDesc = parseDescriptionForTeams(comp.Description);
  if (fromDesc && fromDesc.away && fromDesc.home) {
    return fromDesc;
  }

  // Strategy 2: City name mapping
  const away = resolveTeamAbv(comp.AwayTeamCity || comp.AwayTeam, comp.AwayTeamId, sport);
  const home = resolveTeamAbv(comp.HomeTeamCity || comp.HomeTeam, comp.HomeTeamId, sport);

  if (away && home) {
    return { away, home };
  }

  // Strategy 3: FullDescription might have more info
  if (comp.FullDescription) {
    const fromFull = parseDescriptionForTeams(comp.FullDescription);
    if (fromFull) return fromFull;
  }

  console.warn(`[DK Slates] Could not resolve teams for competition:`, {
    Description: comp.Description,
    AwayTeamCity: comp.AwayTeamCity,
    HomeTeamCity: comp.HomeTeamCity
  });
  return null;
}

/**
 * Classify a DK slate by its ContestStartTimeSuffix
 * @returns {string} Slate type: 'main', 'turbo', 'night', 'showdown', 'other'
 */
function classifySlate(suffix) {
  if (!suffix || suffix.trim() === '') return 'main';

  const s = suffix.toLowerCase().trim();
  if (s.includes('turbo')) return 'turbo';
  if (s.includes('night')) return 'night';
  if (s.includes('late')) return 'late';
  if (s.includes('early')) return 'early';
  if (s.includes('express')) return 'express';
  if (s.includes('after hours')) return 'after_hours';
  if (s.includes('@') || s.includes('vs')) return 'showdown';
  if (s.includes('2h ')) return 'in_game_showdown';
  if (s.includes('sit & go') || s.includes('midseason')) return 'other';

  return 'other';
}

/**
 * Get a human-readable slate name from DK suffix
 */
function getSlateDisplayName(suffix, gameCount) {
  if (!suffix || suffix.trim() === '') return 'Main';

  const s = suffix.trim().replace(/^\(/, '').replace(/\)$/, '').trim();
  if (s === 'Turbo') return `Turbo`;
  if (s === 'Night') return 'Night';
  if (s === 'Late') return 'Late';
  if (s === 'Early') return 'Early';
  if (s.includes('After Hours')) return 'After Hours';

  return s;
}

/**
 * Parse start date from DK's date format
 * DK uses "/Date(milliseconds)/" or ISO strings
 */
function parseDKDate(dateStr) {
  if (!dateStr) return null;

  // Handle "/Date(1234567890000)/" format
  const msMatch = dateStr.match(/\/Date\((\d+)\)\//);
  if (msMatch) {
    return new Date(parseInt(msMatch[1], 10));
  }

  // Try ISO string
  try {
    return new Date(dateStr);
  } catch {
    return null;
  }
}

/**
 * Format a Date to Eastern time display string
 */
function formatETTime(date) {
  if (!date) return 'TBD';
  try {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/New_York'
    }) + ' ET';
  } catch {
    return 'TBD';
  }
}

// ============================================================================
// MAIN EXPORT: Discover slates from DraftKings
// ============================================================================

/**
 * Discover all DFS slates from DraftKings' lobby API.
 * Returns slate objects compatible with the DFS pipeline.
 *
 * @param {string} sport - 'NBA', 'NFL', etc.
 * @returns {Promise<Array>} Array of slate objects with: name, type, gameCount, startTime, matchups, teams, games, draftGroupId
 */
export async function discoverSlatesFromDK(sport) {
  const data = await fetchDKContests(sport);

  if (!data.GameSets || !Array.isArray(data.GameSets)) {
    console.warn('[DK Slates] No GameSets in response');
    return [];
  }

  // Get today's date in ET for filtering out future/stale slates
  const todayET = getESTDate();

  // Build DraftGroup lookup: GameSetKey → DraftGroups (filtered to Classic only + today only)
  const classicDraftGroups = {};
  for (const dg of (data.DraftGroups || [])) {
    // Only include Classic game type
    if (!CLASSIC_GAME_TYPE_IDS.includes(dg.GameTypeId)) continue;

    // Filter to today's slates only — DK API returns future slates (e.g., next Tuesday)
    const dgDate = parseDKDate(dg.StartDate || dg.StartDateEst);
    if (dgDate) {
      const dgDateET = toESTDate(dgDate);
      if (dgDateET !== todayET) {
        console.log(`[DK Slates] Skipping DraftGroup ${dg.DraftGroupId} (${dgDateET} — not today ${todayET})`);
        continue;
      }
    }

    const key = dg.GameSetKey;
    if (!classicDraftGroups[key]) classicDraftGroups[key] = [];
    classicDraftGroups[key].push(dg);
  }

  const slates = [];

  for (const gs of data.GameSets) {
    const suffix = gs.ContestStartTimeSuffix || '';
    const slateType = classifySlate(suffix);

    // Skip non-classic slates (showdowns, in-game, etc.)
    if (['showdown', 'in_game_showdown', 'other'].includes(slateType)) continue;

    const competitions = gs.Competitions || [];
    if (competitions.length < 2) continue; // Need at least 2 games for a classic slate

    // Check if this GameSet has any Classic DraftGroups
    const draftGroups = classicDraftGroups[gs.GameSetKey] || [];
    if (draftGroups.length === 0) continue; // No classic contest for this slate

    // Extract teams from competitions
    const matchups = [];
    const teamSet = new Set();

    for (const comp of competitions) {
      const teams = extractTeamsFromCompetition(comp, sport);
      if (!teams) continue;

      const away = normalizeTeamAbbreviation(teams.away);
      const home = normalizeTeamAbbreviation(teams.home);
      matchups.push(`${away}@${home}`);
      teamSet.add(away);
      teamSet.add(home);
    }

    if (matchups.length < 2) continue;

    // Get the lock time from the first DraftGroup's StartDate
    const primaryDG = draftGroups[0];
    const lockDate = parseDKDate(primaryDG.StartDate || primaryDG.StartDateEst);
    const lockTimeStr = formatETTime(lockDate);

    const slateName = getSlateDisplayName(suffix, matchups.length);

    slates.push({
      name: slateName,
      type: 'Classic',
      gameCount: matchups.length,
      startTime: lockTimeStr,
      matchups,
      teams: Array.from(teamSet),
      games: matchups, // Alias for backward compat
      draftGroupId: primaryDG.DraftGroupId,
      draftGroupIds: draftGroups.map(dg => dg.DraftGroupId),
      gameSetKey: gs.GameSetKey,
      slateType,
      source: 'DraftKings API'
    });
  }

  // Sort: Main first, then by game count descending
  slates.sort((a, b) => {
    if (a.slateType === 'main' && b.slateType !== 'main') return -1;
    if (b.slateType === 'main' && a.slateType !== 'main') return 1;
    return b.gameCount - a.gameCount;
  });

  console.log(`[DK Slates] Discovered ${slates.length} classic slates:`);
  for (const s of slates) {
    console.log(`  ${s.name}: ${s.gameCount} games (DraftGroupId: ${s.draftGroupId}) — ${s.matchups.join(', ')}`);
  }

  return slates;
}

export default {
  discoverSlatesFromDK,
};
