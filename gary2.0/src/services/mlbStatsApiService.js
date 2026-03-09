/**
 * MLB Stats API Service — WBC + MLB Regular Season Data
 *
 * Free API, no key required. Uses statsapi.mlb.com for:
 * - WBC schedule, rosters, box scores, standings, player stats
 * - MLB regular season (same endpoints, different sportId)
 *
 * WBC: sportId=51, leagueId=160
 * MLB: sportId=1
 */

const BASE_URL = 'https://statsapi.mlb.com/api/v1';

const WBC_SPORT_ID = 51;
const WBC_LEAGUE_ID = 160;
const MLB_SPORT_ID = 1;

// Simple in-memory cache (2hr TTL)
const cache = new Map();
const CACHE_TTL = 2 * 60 * 60 * 1000;

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  return null;
}
function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

async function apiFetch(path) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MLB Stats API ${res.status}: ${url}`);
  return res.json();
}

// ═══════════════════════════════════════════════════════════════════════════
// SCHEDULE
// ═══════════════════════════════════════════════════════════════════════════

export async function getWbcSchedule(date) {
  const key = `wbc_schedule_${date}`;
  const cached = getCached(key);
  if (cached) return cached;

  const data = await apiFetch(`/schedule?sportId=${WBC_SPORT_ID}&date=${date}`);
  const games = [];
  for (const dateEntry of (data.dates || [])) {
    for (const game of (dateEntry.games || [])) {
      // Only WBC games (league 160)
      if (game.seriesDescription?.includes('World Baseball Classic') ||
          game.gameType === 'F' ||
          game.teams?.home?.team?.sport?.id === WBC_SPORT_ID) {
        games.push(game);
      }
    }
  }
  setCache(key, games);
  return games;
}

export async function getWbcFullSchedule() {
  const key = 'wbc_full_schedule';
  const cached = getCached(key);
  if (cached) return cached;

  const data = await apiFetch(`/schedule?sportId=${WBC_SPORT_ID}&startDate=2026-03-05&endDate=2026-03-17`);
  const games = [];
  for (const dateEntry of (data.dates || [])) {
    for (const game of (dateEntry.games || [])) {
      games.push(game);
    }
  }
  setCache(key, games);
  return games;
}

// ═══════════════════════════════════════════════════════════════════════════
// TEAMS
// ═══════════════════════════════════════════════════════════════════════════

export async function getWbcTeams() {
  const key = 'wbc_teams';
  const cached = getCached(key);
  if (cached) return cached;

  const data = await apiFetch(`/teams?sportId=${WBC_SPORT_ID}&season=2026`);
  // Filter to active WBC teams (league 160)
  const teams = (data.teams || []).filter(t =>
    t.league?.id === WBC_LEAGUE_ID && t.active
  );
  setCache(key, teams);
  return teams;
}

// ═══════════════════════════════════════════════════════════════════════════
// ROSTERS
// ═══════════════════════════════════════════════════════════════════════════

export async function getTeamRoster(teamId) {
  const key = `wbc_roster_${teamId}`;
  const cached = getCached(key);
  if (cached) return cached;

  const data = await apiFetch(`/teams/${teamId}/roster?season=2026`);
  const roster = (data.roster || []).map(p => ({
    id: p.person?.id,
    name: p.person?.fullName,
    jersey: p.jerseyNumber,
    position: p.position?.abbreviation,
    positionType: p.position?.type,
    status: p.status?.description,
    parentTeamId: p.parentTeamId,
  }));
  setCache(key, roster);
  return roster;
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAYER STATS (MLB career / season)
// ═══════════════════════════════════════════════════════════════════════════

export async function getPlayerCareerStats(playerId, group = 'hitting') {
  const key = `player_career_${playerId}_${group}`;
  const cached = getCached(key);
  if (cached) return cached;

  const data = await apiFetch(`/people/${playerId}/stats?stats=career&group=${group}`);
  const splits = data.stats?.[0]?.splits?.[0]?.stat || null;
  setCache(key, splits);
  return splits;
}

export async function getPlayerSeasonStats(playerId, season = 2025, group = 'hitting') {
  const key = `player_season_${playerId}_${season}_${group}`;
  const cached = getCached(key);
  if (cached) return cached;

  const data = await apiFetch(`/people/${playerId}/stats?stats=season&season=${season}&group=${group}`);
  const splits = data.stats?.[0]?.splits?.[0]?.stat || null;
  setCache(key, splits);
  return splits;
}

export async function getPlayerInfo(playerId) {
  const key = `player_info_${playerId}`;
  const cached = getCached(key);
  if (cached) return cached;

  const data = await apiFetch(`/people/${playerId}`);
  const person = data.people?.[0] || null;
  setCache(key, person);
  return person;
}

export async function searchPlayer(name) {
  const data = await apiFetch(`/people/search?names=${encodeURIComponent(name)}`);
  return data.people || [];
}

// ═══════════════════════════════════════════════════════════════════════════
// TEAM STATS (career/season aggregates for WBC rosters)
// ═══════════════════════════════════════════════════════════════════════════

export async function getWbcTeamBattingStats(roster) {
  if (!roster || roster.length === 0) return null;
  const hitters = roster.filter(p => p.positionType !== 'Pitcher').slice(0, 5);
  if (hitters.length === 0) return null;

  const stats = await Promise.all(
    hitters.map(p => p.id ? getPlayerCareerStats(p.id, 'hitting').catch(() => null) : null)
  );
  const valid = stats.filter(Boolean);
  if (valid.length === 0) return null;

  const avg = (arr, key) => {
    const vals = arr.map(s => parseFloat(s[key])).filter(v => !isNaN(v));
    return vals.length > 0 ? (vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  };
  const sum = (arr, key) => {
    const vals = arr.map(s => parseInt(s[key])).filter(v => !isNaN(v));
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) : null;
  };

  return {
    avg: avg(valid, 'avg'),
    obp: avg(valid, 'obp'),
    slg: avg(valid, 'slg'),
    ops: avg(valid, 'ops'),
    homeRuns: sum(valid, 'homeRuns'),
    rbi: sum(valid, 'rbi'),
    stolenBases: sum(valid, 'stolenBases'),
    strikeOuts: sum(valid, 'strikeOuts'),
    playerCount: valid.length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// BOX SCORES
// ═══════════════════════════════════════════════════════════════════════════

export async function getGameBoxScore(gamePk) {
  const key = `boxscore_${gamePk}`;
  const cached = getCached(key);
  if (cached) return cached;

  const data = await apiFetch(`/game/${gamePk}/boxscore`);
  setCache(key, data);
  return data;
}

export async function getGameLineScore(gamePk) {
  const data = await apiFetch(`/game/${gamePk}/linescore`);
  return data;
}

export async function getGameFeed(gamePk) {
  const url = `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MLB Stats API ${res.status}: ${url}`);
  return res.json();
}

// ═══════════════════════════════════════════════════════════════════════════
// STANDINGS
// ═══════════════════════════════════════════════════════════════════════════

export async function getWbcStandings() {
  const key = 'wbc_standings';
  const cached = getCached(key);
  if (cached) return cached;

  const data = await apiFetch(`/standings?leagueId=${WBC_LEAGUE_ID}&season=2026`);
  setCache(key, data);
  return data;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROBABLE PITCHERS (from schedule endpoint)
// ═══════════════════════════════════════════════════════════════════════════

export async function getProbablePitchers(gamePk) {
  const feed = await getGameFeed(gamePk);
  const gameData = feed?.gameData || {};
  return {
    home: gameData.probablePitchers?.home || null,
    away: gameData.probablePitchers?.away || null,
    weather: gameData.weather || null,
    venue: gameData.venue || null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function formatWbcRound(seriesDescription, description) {
  const series = (seriesDescription || '').toLowerCase();
  const desc = description || '';
  if (series.includes('pool play')) return `WBC Pool Play - ${desc}`;
  if (series.includes('quarterfinal')) return 'WBC Quarterfinals';
  if (series.includes('semifinal')) return 'WBC Semifinals';
  if (series.includes('final') && !series.includes('semi') && !series.includes('quarter')) return 'WBC Finals';
  return 'World Baseball Classic';
}

export function formatWbcGameForPipeline(wbcGame) {
  const home = wbcGame.teams?.home;
  const away = wbcGame.teams?.away;
  const homeName = home?.team?.name || home?.team?.teamName || 'Home';
  const awayName = away?.team?.name || away?.team?.teamName || 'Away';
  return {
    id: wbcGame.gamePk,
    // Pipeline expects strings for home_team/away_team
    home_team: homeName,
    away_team: awayName,
    // Full team objects with IDs for scout report data fetching
    home_team_data: {
      id: home?.team?.id,
      full_name: homeName,
      name: home?.team?.teamName || homeName,
      abbreviation: home?.team?.abbreviation || '',
    },
    away_team_data: {
      id: away?.team?.id,
      full_name: awayName,
      name: away?.team?.teamName || awayName,
      abbreviation: away?.team?.abbreviation || '',
    },
    // commence_time alias for pipeline compatibility (filtering uses this field)
    commence_time: wbcGame.gameDate,
    start_time: wbcGame.gameDate,
    status: wbcGame.status?.detailedState,
    venue: wbcGame.venue?.name,
    description: wbcGame.description || wbcGame.seriesDescription,
    // Game significance for UI badge (e.g., "WBC Pool Play - Pool C", "WBC Quarterfinals")
    gameSignificance: formatWbcRound(wbcGame.seriesDescription, wbcGame.description),
    gamePk: wbcGame.gamePk,
    _raw: wbcGame,
  };
}

export default {
  getWbcSchedule,
  getWbcFullSchedule,
  getWbcTeams,
  getTeamRoster,
  getPlayerCareerStats,
  getPlayerSeasonStats,
  getPlayerInfo,
  searchPlayer,
  getWbcTeamBattingStats,
  getGameBoxScore,
  getGameLineScore,
  getGameFeed,
  getWbcStandings,
  getProbablePitchers,
  formatWbcGameForPipeline,
};
