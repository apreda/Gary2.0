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
  // Look back 45 days so the window always covers the last `limit` games played
  const startDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const data = await apiFetch(`/schedule?sportId=${MLB_SPORT_ID}&teamId=${teamId}&startDate=${startDate}&endDate=${today}`);
  const games = [];
  const seenPks = new Set();
  for (const dateEntry of (data.dates || [])) {
    for (const game of (dateEntry.games || [])) {
      if (game.status?.detailedState !== 'Final') continue;
      // Suspended/resumed games can appear on two dates with the same gamePk — count once
      if (game.gamePk && seenPks.has(game.gamePk)) continue;
      if (game.gamePk) seenPks.add(game.gamePk);
      games.push(game);
    }
  }
  // Don't rely on API date ordering — sort chronologically before taking the last N
  games.sort((a, b) => new Date(a.gameDate || a.officialDate || 0) - new Date(b.gameDate || b.officialDate || 0));
  const recent = games.slice(-limit);
  setCache(key, recent);
  return recent;
}

/**
 * Upcoming (not-final) games for a team, tomorrow through +daysAhead days.
 * Feeds the scout report's SERIES STATE "of N" (Jul 9 2026): remaining
 * meetings vs tonight's opponent complete "Game 2 of 3". Same /schedule
 * source and date conventions as getMlbRecentGames above.
 */
export async function getMlbUpcomingGames(teamId, daysAhead = 4) {
  const key = `mlb_upcoming_${teamId}_${daysAhead}`;
  const cached = getCached(key);
  if (cached) return cached;

  const start = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const end = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const data = await apiFetch(`/schedule?sportId=${MLB_SPORT_ID}&teamId=${teamId}&startDate=${start}&endDate=${end}`);
  const games = [];
  for (const dateEntry of (data.dates || [])) {
    for (const game of (dateEntry.games || [])) {
      if (game.status?.detailedState === 'Final') continue;
      games.push(game);
    }
  }
  games.sort((a, b) => new Date(a.gameDate || a.officialDate || 0) - new Date(b.gameDate || b.officialDate || 0));
  setCache(key, games);
  return games;
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

/**
 * Pitcher platoon splits — opponent batting line vs LHB and vs RHB.
 * BDL's splits endpoint carries no L/R breakdown for pitchers, so this is the
 * structured source for platoon claims about a starter.
 * Returns { vsLeft: {avg, ops, hr, bb, so, ab}, vsRight: {...} } or null.
 */
export async function getPitcherPlatoonSplits(playerId, season) {
  const year = season || new Date().getFullYear();
  const key = `pitcher_platoon_${playerId}_${year}`;
  const cached = getCached(key);
  if (cached) return cached;

  const data = await apiFetch(
    `/people/${playerId}?hydrate=stats(group=[pitching],type=[statSplits],sitCodes=[vl,vr],season=${year})`
  );
  const stats = data.people?.[0]?.stats || [];
  const result = { vsLeft: null, vsRight: null };
  for (const block of stats) {
    for (const split of (block.splits || [])) {
      const code = split.split?.code;
      const st = split.stat || {};
      const line = {
        avg: st.avg ?? null,
        ops: st.ops ?? null,
        hr: st.homeRuns ?? null,
        bb: st.baseOnBalls ?? null,
        so: st.strikeOuts ?? null,
        ab: st.atBats ?? null,
      };
      if (code === 'vl') result.vsLeft = line;
      if (code === 'vr') result.vsRight = line;
    }
  }
  const final = (result.vsLeft || result.vsRight) ? result : null;
  setCache(key, final);
  return final;
}

/**
 * Player season FIELDING splits (one entry per position played). For catchers
 * the stat block carries the run-game numbers: stolenBases (allowed),
 * caughtStealing, stolenBasePercentage, caughtStealingPercentage, innings,
 * passedBall, catcherERA. Returns the raw splits array ([{ stat, position }])
 * or [] when none.
 */
export async function getPlayerFieldingStats(playerId, season) {
  const year = season || new Date().getFullYear();
  const key = `player_fielding_${playerId}_${year}`;
  const cached = getCached(key);
  if (cached) return cached;

  const data = await apiFetch(`/people/${playerId}/stats?stats=season&season=${year}&group=fielding`);
  const splits = data.stats?.[0]?.splits || [];
  setCache(key, splits);
  return splits;
}

/**
 * Team season HITTING stats (one stat block for the whole team) — includes
 * stolenBases, caughtStealing, gamesPlayed, runs, homeRuns, avg, ops.
 * Returns the stat object or null.
 */
export async function getTeamHittingStats(teamId, season) {
  const year = season || new Date().getFullYear();
  const key = `team_hitting_${teamId}_${year}`;
  const cached = getCached(key);
  if (cached) return cached;

  const data = await apiFetch(`/teams/${teamId}/stats?stats=season&season=${year}&group=hitting`);
  const stat = data.stats?.[0]?.splits?.[0]?.stat || null;
  setCache(key, stat);
  return stat;
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
// PRE-GAME LINEUPS (extracts batting order + handedness from boxscore)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract posted lineups (batting order + probable/starting pitcher with handedness)
 * from the MLB Stats API boxscore for the given gamePk. Returns a map keyed by
 * team abbreviation so MLB_LINEUP can match it against the home/away abbreviations
 * we already resolved upstream.
 *
 * Returns null if the boxscore call fails (game not found, gamePk missing, etc.).
 * Returns an empty per-team batters array when the lineup hasn't been posted yet —
 * the caller renders that as "Lineup not yet posted".
 */
export async function getMlbGameLineups(gamePk) {
  if (!gamePk) return null;
  const key = `mlb_lineups_${gamePk}`;
  const cached = getCached(key);
  if (cached) return cached;

  let box;
  try {
    box = await getGameBoxScore(gamePk);
  } catch (e) {
    console.warn(`[MLB Stats API] getMlbGameLineups boxscore failed for ${gamePk}: ${e.message}`);
    return null;
  }

  const teams = box?.teams;
  if (!teams) return null;

  const extractSide = (sideData) => {
    if (!sideData) return null;
    const players = sideData.players || {};
    const battingOrderIds = Array.isArray(sideData.battingOrder) ? sideData.battingOrder : [];

    const batters = battingOrderIds.map((rawId, idx) => {
      const lookupKey = typeof rawId === 'string' ? rawId : `ID${rawId}`;
      const p = players[lookupKey] || players[`ID${rawId}`] || null;
      if (!p) return null;
      const bats = p?.person?.batSide?.code || p?.batSide?.code || '?';
      const throws = p?.person?.pitchHand?.code || p?.pitchHand?.code || '?';
      return {
        battingOrder: idx + 1,
        name: p?.person?.fullName || 'Unknown',
        position: p?.position?.abbreviation || '—',
        batsThrows: `${bats}/${throws}`,
      };
    }).filter(Boolean);

    // Probable pitcher (pre-game) lives on the schedule hydrate, but boxscore exposes
    // currentPitcher / pitchers list once the game starts. Best-effort either way.
    const probable = sideData.probablePitcher || null;
    const firstPitcherId = Array.isArray(sideData.pitchers) ? sideData.pitchers[0] : null;
    const pitcherPlayer = firstPitcherId ? players[`ID${firstPitcherId}`] : null;
    const pitcher = probable
      ? {
          name: probable.fullName || probable.name || 'Unknown',
          batsThrows: `${probable.batSide?.code || '?'}/${probable.pitchHand?.code || '?'}`,
        }
      : pitcherPlayer
        ? {
            name: pitcherPlayer.person?.fullName || 'Unknown',
            batsThrows: `${pitcherPlayer.person?.batSide?.code || '?'}/${pitcherPlayer.person?.pitchHand?.code || '?'}`,
          }
        : null;

    const teamAbbr = sideData.team?.abbreviation || sideData.team?.teamCode || '';
    const teamName = sideData.team?.name || sideData.team?.teamName || '';
    return { teamName, teamAbbr, batters, pitcher };
  };

  const homeSide = extractSide(teams.home);
  const awaySide = extractSide(teams.away);

  const result = {};
  if (homeSide?.teamAbbr) result[homeSide.teamAbbr] = homeSide;
  if (awaySide?.teamAbbr) result[awaySide.teamAbbr] = awaySide;

  setCache(key, result);
  return result;
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


// ─── Fan-parity additions (Jul 22 2026, founder-approved) ────────────────────

/** Roster transactions for a team over a date window. Facts only. */
export async function getMlbTransactions(teamId, startDate, endDate) {
  const key = `mlb_tx_${teamId}_${startDate}_${endDate}`;
  const cached = getCached(key);
  if (cached) return cached;
  const data = await apiFetch(`/transactions?teamId=${teamId}&startDate=${startDate}&endDate=${endDate}`);
  const rows = (data.transactions || [])
    .filter(t => t.description && !/minor league contract/i.test(t.description))
    .map(t => ({ date: t.date, description: t.description }));
  setCache(key, rows);
  return rows;
}

/** A pitcher's completed starts this season (gameLog), most recent last.
 *  Excludes any entry dated today ET — an in-progress start would leak a
 *  partial line onto the desk. */
export async function getPitcherLastStarts(personId, season, limit = 3) {
  const key = `mlb_sp_log_${personId}_${season}`;
  let splits = getCached(key);
  if (!splits) {
    const data = await apiFetch(`/people/${personId}/stats?stats=gameLog&season=${season}&group=pitching`);
    splits = data.stats?.[0]?.splits || [];
    setCache(key, splits);
  }
  const todayEt = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  return splits
    .filter(g => g.date && g.date < todayEt && g.stat?.gamesStarted > 0)
    .slice(-limit)
    .map(g => ({
      date: g.date,
      opponent: g.opponent?.name || '?',
      isHome: !!g.isHome,
      ip: g.stat?.inningsPitched, h: g.stat?.hits, er: g.stat?.earnedRuns,
      k: g.stat?.strikeOuts, bb: g.stat?.baseOnBalls, hr: g.stat?.homeRuns,
    }));
}

/** A pitcher's career line vs one opponent (vsTeamTotal). Null when absent. */
export async function getPitcherVsTeam(personId, opposingTeamId) {
  const key = `mlb_sp_vsteam_${personId}_${opposingTeamId}`;
  const cached = getCached(key);
  if (cached) return cached;
  const data = await apiFetch(`/people/${personId}/stats?stats=vsTeamTotal&group=pitching&opposingTeamId=${opposingTeamId}`);
  const st = data.stats?.[0]?.splits?.[0]?.stat || null;
  const out = st ? { games: st.gamesPlayed, starts: st.gamesStarted, era: st.era, avgAgainst: st.avg, ip: st.inningsPitched } : null;
  setCache(key, out);
  return out;
}

export default {
  getMlbSchedule,
  getMlbRecentGames,
  getMlbUpcomingGames,
  getMlbTeams,
  findMlbTeam,
  getMlbStandings,
  formatMlbGameForPipeline,
  getTeamRoster,
  getPlayerSeasonStats,
  getPlayerFieldingStats,
  getTeamHittingStats,
  getPlayerInfo,
  searchPlayer,
  getPitcherPlatoonSplits,
  getGameBoxScore,
  getGameLineScore,
  getGameFeed,
  getConfirmedLineups,
  getProbablePitchers,
  getMlbTransactions,
  getPitcherLastStarts,
  getPitcherVsTeam,
};
