/**
 * MLB Stats API Service — MLB Regular Season
 *
 * Free API, no key required. Uses statsapi.mlb.com for:
 * - MLB regular season: schedule, rosters, standings, box scores, player stats
 *
 * MLB: sportId=1, leagueIds: AL=103, NL=104
 */

const BASE_URL = 'https://statsapi.mlb.com/api/v1';

const MLB_SPORT_ID = 1;
const MLB_AL_LEAGUE_ID = 103;
const MLB_NL_LEAGUE_ID = 104;

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
// MLB REGULAR SEASON SCHEDULE
// ═══════════════════════════════════════════════════════════════════════════

export async function getMlbSchedule(date) {
  const key = `mlb_schedule_${date}`;
  const cached = getCached(key);
  if (cached) return cached;

  const data = await apiFetch(`/schedule?sportId=${MLB_SPORT_ID}&date=${date}&hydrate=probablePitcher,linescore`);
  const games = [];
  for (const dateEntry of (data.dates || [])) {
    for (const game of (dateEntry.games || [])) {
      games.push(game);
    }
  }
  setCache(key, games);
  return games;
}

export async function getMlbRecentGames(teamId, limit = 10) {
  const key = `mlb_recent_${teamId}_${limit}`;
  const cached = getCached(key);
  if (cached) return cached;

  const today = new Date().toISOString().split('T')[0];
  // Look back 30 days for recent games
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const data = await apiFetch(`/schedule?sportId=${MLB_SPORT_ID}&teamId=${teamId}&startDate=${startDate}&endDate=${today}`);
  const games = [];
  for (const dateEntry of (data.dates || [])) {
    for (const game of (dateEntry.games || [])) {
      if (game.status?.detailedState === 'Final') games.push(game);
    }
  }
  const recent = games.slice(-limit);
  setCache(key, recent);
  return recent;
}

// ═══════════════════════════════════════════════════════════════════════════
// MLB REGULAR SEASON TEAMS
// ═══════════════════════════════════════════════════════════════════════════

export async function getMlbTeams() {
  const key = 'mlb_teams';
  const cached = getCached(key);
  if (cached) return cached;

  const season = new Date().getFullYear();
  const data = await apiFetch(`/teams?sportId=${MLB_SPORT_ID}&season=${season}`);
  const teams = (data.teams || []).filter(t => t.active);
  setCache(key, teams);
  return teams;
}

export async function findMlbTeam(teamName) {
  const teams = await getMlbTeams();
  const norm = (teamName || '').toLowerCase().trim();
  return teams.find(t =>
    (t.name || '').toLowerCase().includes(norm) ||
    (t.teamName || '').toLowerCase().includes(norm) ||
    (t.abbreviation || '').toLowerCase() === norm ||
    (t.shortName || '').toLowerCase().includes(norm)
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MLB REGULAR SEASON STANDINGS
// ═══════════════════════════════════════════════════════════════════════════

export async function getMlbStandings(season) {
  const year = season || new Date().getFullYear();
  const key = `mlb_standings_${year}`;
  const cached = getCached(key);
  if (cached) return cached;

  const data = await apiFetch(`/standings?leagueId=${MLB_AL_LEAGUE_ID},${MLB_NL_LEAGUE_ID}&season=${year}&standingsTypes=regularSeason`);
  setCache(key, data);
  return data;
}

// ═══════════════════════════════════════════════════════════════════════════
// ROSTERS
// ═══════════════════════════════════════════════════════════════════════════

export async function getTeamRoster(teamId) {
  const season = new Date().getFullYear();
  const key = `roster_${teamId}_${season}`;
  const cached = getCached(key);
  if (cached) return cached;

  const data = await apiFetch(`/teams/${teamId}/roster?season=${season}`);
  const roster = (data.roster || []).map(p => ({
    id: p.person?.id,
    name: p.person?.fullName,
    jersey: p.jerseyNumber,
    position: p.position?.abbreviation,
    positionType: p.position?.type,
    status: p.status?.description,
    ilStatus: p.status?.description, // e.g., "Active", "60-Day Injured List", "10-Day IL"
    parentTeamId: p.parentTeamId,
  }));
  setCache(key, roster);
  return roster;
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAYER STATS (MLB season)
// ═══════════════════════════════════════════════════════════════════════════

export async function getPlayerSeasonStats(playerId, season, group = 'hitting') {
  const year = season || new Date().getFullYear();
  const key = `player_season_${playerId}_${year}_${group}`;
  const cached = getCached(key);
  if (cached) return cached;

  const data = await apiFetch(`/people/${playerId}/stats?stats=season&season=${year}&group=${group}`);
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
// CONFIRMED LINEUPS (extracted from live game feed boxscore)
// ═══════════════════════════════════════════════════════════════════════════

export async function getConfirmedLineups(gamePk) {
  try {
    const feed = await getGameFeed(gamePk);
    const boxscore = feed?.liveData?.boxscore;
    if (!boxscore) return null;

    const extractLineup = (side) => {
      const teamData = boxscore.teams?.[side];
      if (!teamData) return null;
      const batters = teamData.batters || [];
      const players = teamData.players || {};

      const lineup = [];
      for (const playerId of batters) {
        const player = players[`ID${playerId}`] || {};
        const person = player.person || {};
        const battingOrder = player.battingOrder;
        if (!battingOrder) continue; // Not in batting lineup
        lineup.push({
          id: person.id,
          name: person.fullName || 'Unknown',
          position: player.position?.abbreviation || '',
          battingOrder: parseInt(battingOrder) / 100, // "100" = 1st, "200" = 2nd, etc.
          stats: player.stats?.batting || {},
        });
      }
      return lineup.sort((a, b) => a.battingOrder - b.battingOrder);
    };

    return {
      home: extractLineup('home'),
      away: extractLineup('away'),
      gameStatus: feed?.gameData?.status?.detailedState || 'Unknown',
    };
  } catch (e) {
    console.warn(`[MLB Stats API] Lineup extraction error: ${e.message}`);
    return null;
  }
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

export function formatMlbGameForPipeline(mlbGame) {
  const home = mlbGame.teams?.home;
  const away = mlbGame.teams?.away;
  const homeName = home?.team?.name || home?.team?.teamName || 'Home';
  const awayName = away?.team?.name || away?.team?.teamName || 'Away';
  return {
    id: mlbGame.gamePk,
    home_team: homeName,
    away_team: awayName,
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
    commence_time: mlbGame.gameDate,
    start_time: mlbGame.gameDate,
    status: mlbGame.status?.detailedState,
    venue: mlbGame.venue?.name,
    description: mlbGame.description || mlbGame.seriesDescription || 'MLB Regular Season',
    gamePk: mlbGame.gamePk,
    _raw: mlbGame,
  };
}

export default {
  getMlbSchedule,
  getMlbRecentGames,
  getMlbTeams,
  findMlbTeam,
  getMlbStandings,
  formatMlbGameForPipeline,
  getTeamRoster,
  getPlayerSeasonStats,
  getPlayerInfo,
  searchPlayer,
  getGameBoxScore,
  getGameLineScore,
  getGameFeed,
  getConfirmedLineups,
  getProbablePitchers,
};
