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

// Minor-league sportIds on the same StatsAPI host (AAA=11, AA=12). Serves the
// debut-starter line: a probable with zero MLB data shows his labeled
// minor-league season instead of a blank plate (founder GO, Aug 17 2026).
const MILB_SPORT_IDS = { AAA: 11, AA: 12 };

/** Raw season-pitching stats for one person at one minor-league level. */
export async function getPitcherMilbSeasonRaw(personId, season, level) {
  const sportId = MILB_SPORT_IDS[level];
  if (!sportId) throw new Error(`Unknown MiLB level "${level}"`);
  const key = `milb_season_${personId}_${season}_${level}`;
  const cached = getCached(key);
  if (cached) return cached;
  const data = await apiFetch(
    `/people/${personId}/stats?stats=season&group=pitching&season=${season}&sportId=${sportId}`,
  );
  setCache(key, data);
  return data;
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

  // ET calendar math, never UTC-now (Jul 30): after 8 PM ET the old
  // `Date.now()+24h → toISOString` landed on the ET day-AFTER-tomorrow, so
  // every evening window's upcoming-games read skipped tomorrow entirely
  // (broke the scout's SERIES STATE "Game N of M").
  const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const shift = (days) => {
    const d = new Date(`${todayET}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const start = shift(1);
  const end = shift(daysAhead);
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
/**
 * TEAM season hitting splits vs LHP / vs RHP (founder GO, Aug 12): the
 * team-level platoon picture — "how does this lineup hit tonight's kind of
 * arm" — was invisible while the pitcher's own platoon line printed. Same
 * statSplits machinery as getPitcherPlatoonSplits.
 */
export async function getTeamVsHandSplits(teamId, season) {
  const year = season || new Date().getFullYear();
  const key = `team_vshand_${teamId}_${year}`;
  const cached = getCached(key);
  if (cached) return cached;

  const data = await apiFetch(
    `/teams/${teamId}/stats?stats=statSplits&group=hitting&sitCodes=vl,vr&season=${year}`
  );
  const result = { vsLeft: null, vsRight: null };
  for (const block of (data.stats || [])) {
    for (const split of (block.splits || [])) {
      const st = split.stat || {};
      const line = {
        avg: st.avg ?? null,
        obp: st.obp ?? null,
        slg: st.slg ?? null,
        ops: st.ops ?? null,
        hr: st.homeRuns ?? null,
        so: st.strikeOuts ?? null,
        bb: st.baseOnBalls ?? null,
        pa: st.plateAppearances ?? null,
      };
      if (split.split?.code === 'vl') result.vsLeft = line;
      if (split.split?.code === 'vr') result.vsRight = line;
    }
  }
  const final = (result.vsLeft || result.vsRight) ? result : null;
  setCache(key, final);
  return final;
}

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

/**
 * SCORING FLOW WITH ATTRIBUTION (founder GO, Aug 12: "Alonso homered to left
 * center — off of who? In what inning?"): every scoring play from the
 * official play-by-play with the pitcher who allowed it. Finals are
 * immutable → cached. Returns lines like
 *   "[T1] Pete Alonso homers (26) on a fly ball to left center field.
 *    Gunnar Henderson scores. — off Ober (2-0)"
 */
export async function getScoringFlowAttributed(gamePk) {
  const key = `scoring_flow_attr_${gamePk}`;
  const cached = getCached(key);
  if (cached) return cached;
  const data = await apiFetch(`/game/${gamePk}/playByPlay`);
  const all = data?.allPlays || [];
  const idxs = Array.isArray(data?.scoringPlays) ? data.scoringPlays : [];
  const lines = [];
  for (const i of idxs) {
    const p = all[i];
    if (!p?.result) continue;
    const half = String(p.about?.halfInning || '').startsWith('t') ? 'T' : 'B';
    const inning = p.about?.inning ?? '?';
    const desc = String(p.result.description || '').trim().replace(/\s+/g, ' ');
    const pitcher = p.matchup?.pitcher?.fullName;
    const off = pitcher ? ` — off ${String(pitcher).split(' ').pop()}` : '';
    lines.push(`[${half}${inning}] ${desc}${off} (${p.result.awayScore}-${p.result.homeScore})`);
  }
  setCache(key, lines);
  return lines;
}

/**
 * PEN ENTRY CONTEXT (founder GO, Aug 12 — the bullpen's missing story):
 * for each pitcher in a final game, the situation he ENTERED into — inning,
 * half, and the score before his first pitch. Keyed by MLBAM pitcher id.
 */
export async function getPitcherEntryContext(gamePk) {
  const key = `pitcher_entry_ctx_v2_${gamePk}`;
  const cached = getCached(key);
  if (cached) return cached;
  const data = await apiFetch(`/game/${gamePk}/playByPlay`);
  const all = data?.allPlays || [];
  const ctx = new Map();
  let prevAway = 0;
  let prevHome = 0;
  for (const p of all) {
    const pid = p?.matchup?.pitcher?.id;
    if (pid == null) continue;
    if (!ctx.has(pid)) {
      const half = String(p.about?.halfInning || '').startsWith('t') ? 'T' : 'B';
      ctx.set(pid, { inning: p.about?.inning ?? null, half, awayScore: prevAway, homeScore: prevHome, maxOn: 0 });
    }
    // THE JAM (V2, same day): base state after each plate appearance of the
    // stint — the traffic his next pitch was thrown into. "1.0 IP, 0 ER"
    // cannot say whether he cruised or escaped the bases loaded; this can.
    const m = p.matchup || {};
    const on = (m.postOnFirst ? 1 : 0) + (m.postOnSecond ? 1 : 0) + (m.postOnThird ? 1 : 0);
    const entry = ctx.get(pid);
    if (on > entry.maxOn) entry.maxOn = on;
    if (p?.result?.awayScore != null) prevAway = p.result.awayScore;
    if (p?.result?.homeScore != null) prevHome = p.result.homeScore;
  }
  setCache(key, ctx);
  return ctx;
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
  // The feed repeats rows (a rehab assignment can print twice) — dedupe on
  // date+description so the desk never shows the same move twice (Aug 10).
  const seen = new Set();
  const rows = (data.transactions || [])
    .filter(t => t.description && !/minor league contract/i.test(t.description))
    .filter(t => { const k = `${t.date}|${t.description}`; if (seen.has(k)) return false; seen.add(k); return true; })
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
      // gamePk (Aug 5): lets a distortion flag attach THAT game's official
      // story — the context layer's pointer, not display data.
      gamePk: g.game?.gamePk ?? null,
      opponent: g.opponent?.name || '?',
      isHome: !!g.isHome,
      ip: g.stat?.inningsPitched, h: g.stat?.hits, er: g.stat?.earnedRuns,
      k: g.stat?.strikeOuts, bb: g.stat?.baseOnBalls, hr: g.stat?.homeRuns,
      // Pitch count (founder, Aug 10: "just innings doesn't tell the whole
      // story") — null when the feed omits it, and the line simply skips it.
      pitches: g.stat?.numberOfPitches ?? null,
      // Team result in his start (Jul 30, founder: "7-1 in his last 8" must
      // arrive as the ledger, not a headline) — null when the feed omits it.
      win: typeof g.isWin === 'boolean' ? g.isWin : null,
    }));
}

/** Raw season pitching game log for one person — shares the cache key with
 *  getPitcherLastStarts, so starter devices and the pen usage patterns never
 *  double-fetch the same log. Returns the statsapi splits verbatim. */
export async function getPitcherGameLogRaw(personId, season) {
  const key = `mlb_sp_log_${personId}_${season}`;
  let splits = getCached(key);
  if (!splits) {
    const data = await apiFetch(`/people/${personId}/stats?stats=gameLog&season=${season}&group=pitching`);
    splits = data.stats?.[0]?.splits || [];
    setCache(key, splits);
  }
  return splits;
}

/** Situational splits for a pitcher — FIRST INNING only (sitCode i01,
 *  verified live Aug 18 2026). Ahead/behind-count splits were dropped by
 *  founder ruling Aug 19: too granular for the desk — context stays
 *  high-level. Times-through-the-order codes do NOT exist on this endpoint.
 *  Null when the API returns nothing usable. */
export async function getPitcherSituationalSplits(personId, season) {
  const year = season || new Date().getFullYear();
  const key = `mlb_sp_situational_i01_${personId}_${year}`;
  const cached = getCached(key);
  if (cached) return cached;
  const data = await apiFetch(`/people/${personId}/stats?stats=statSplits&group=pitching&season=${year}&sitCodes=i01`);
  const rows = data.stats?.[0]?.splits || [];
  const fi = rows.find((s) => s.split?.code === 'i01')?.stat || null;
  if (!fi) return null;
  const out = { firstInning: { era: fi.era ?? null, ip: fi.inningsPitched ?? null, avg: fi.avg ?? null } };
  setCache(key, out);
  return out;
}

/** Team batting in games following a win / following a loss (sitCodes
 *  taw/tal — verified live Aug 19 2026). The founder's bounce-back context:
 *  not just the record after losses, but how the bats actually swing there.
 *  Null when the API has nothing. */
export async function getTeamSituationalHitting(teamId, season) {
  const year = season || new Date().getFullYear();
  const key = `mlb_team_situ_hitting_${teamId}_${year}`;
  const cached = getCached(key);
  if (cached) return cached;
  const data = await apiFetch(`/teams/${teamId}/stats?stats=statSplits&group=hitting&season=${year}&sitCodes=taw,tal`);
  const rows = data.stats?.[0]?.splits || [];
  const find = (code) => rows.find((s) => s.split?.code === code)?.stat || null;
  const shape = (s) => (s ? { avg: s.avg ?? null, ops: s.ops ?? null, games: s.gamesPlayed ?? null } : null);
  const out = { afterWin: shape(find('taw')), afterLoss: shape(find('tal')) };
  if (!out.afterWin && !out.afterLoss) return null;
  setCache(key, out);
  return out;
}

/** League standings context keyed by MLBAM team id: FETCHED run differential
 *  (never derived), streak, division rank, wild-card distance, and the split
 *  records a bettor holds — vs LH/RH starters, one-run, extra innings, last
 *  ten, home/road. One call for the whole league, 2h cache. */
export async function getMlbStandingsContext(season) {
  const year = season || new Date().getFullYear();
  const key = `mlb_standings_ctx_${year}`;
  const cached = getCached(key);
  if (cached) return cached;
  const data = await apiFetch(`/standings?leagueId=103,104&season=${year}&standingsTypes=regularSeason`);
  const byTeamId = new Map();
  for (const rec of data.records || []) {
    for (const tr of rec.teamRecords || []) {
      const splits = {};
      for (const s of tr.records?.splitRecords || []) {
        if (s.type) splits[s.type] = `${s.wins}-${s.losses}`;
      }
      // Record vs each division (Aug 19, founder's division-context ask) —
      // keyed by division name, e.g. "American League Central": "19-9".
      const divisionRecords = {};
      for (const d of tr.records?.divisionRecords || []) {
        if (d.division?.name) divisionRecords[d.division.name] = `${d.wins}-${d.losses}`;
      }
      byTeamId.set(tr.team?.id, {
        name: tr.team?.name || '',
        divisionRecords,
        wins: tr.wins ?? null,
        losses: tr.losses ?? null,
        streak: tr.streak?.streakCode || null,
        divisionRank: tr.divisionRank || null,
        gamesBack: tr.divisionGamesBack ?? tr.gamesBack ?? null,
        wildCardGamesBack: tr.wildCardGamesBack ?? null,
        runsScored: tr.runsScored ?? null,
        runsAllowed: tr.runsAllowed ?? null,
        runDifferential: tr.runDifferential ?? null,
        gamesPlayed: tr.gamesPlayed ?? null,
        splits,
      });
    }
  }
  if (byTeamId.size) setCache(key, byTeamId);
  return byTeamId;
}

/** Batch bat-side / pitch-hand lookup: MLBAM person ids → { bat, throw }.
 *  Handedness never changes, so hits cache for the life of the process. */
const peopleHandsCache = new Map();
export async function getMlbPeopleHands(personIds = []) {
  const wanted = [...new Set(personIds.filter(Boolean))];
  const need = wanted.filter((id) => !peopleHandsCache.has(id));
  for (let i = 0; i < need.length; i += 40) {
    const batch = need.slice(i, i + 40);
    try {
      const data = await apiFetch(`/people?personIds=${batch.join(',')}`);
      for (const p of data.people || []) {
        peopleHandsCache.set(p.id, { bat: p.batSide?.code || '?', throw: p.pitchHand?.code || '?' });
      }
    } catch { /* missing entries print '?' at the caller */ }
  }
  const out = new Map();
  for (const id of wanted) if (peopleHandsCache.has(id)) out.set(id, peopleHandsCache.get(id));
  return out;
}

/** A pitcher's season decomposed by month (byMonth splits). Rows sorted by
 *  month: [{ month, era, ip, gs, k, bb }]. Empty array when absent. */
export async function getPitcherMonthSplits(personId, season) {
  const year = season || new Date().getFullYear();
  const key = `mlb_sp_bymonth_${personId}_${year}`;
  const cached = getCached(key);
  if (cached) return cached;
  const data = await apiFetch(`/people/${personId}/stats?stats=byMonth&season=${year}&group=pitching`);
  const rows = (data.stats?.[0]?.splits || [])
    .filter(s => s.month != null)
    .map(s => ({
      month: s.month,
      era: s.stat?.era ?? null,
      ip: s.stat?.inningsPitched ?? null,
      gs: s.stat?.gamesStarted ?? null,
      k: s.stat?.strikeOuts ?? null,
      bb: s.stat?.baseOnBalls ?? null,
    }))
    .sort((a, b) => a.month - b.month);
  setCache(key, rows);
  return rows;
}

/** A pitcher's career pitching profile: career totals + season-by-season IP/GS
 *  ledger (yearByYear; traded seasons collapse to one row per season).
 *  Returns { career: { era, ip, gs, w, l, k }, seasons: [{ season, ip, gs, era }] }
 *  or null when the API has nothing. */
export async function getPitcherCareerProfile(personId) {
  const key = `mlb_sp_career_${personId}`;
  const cached = getCached(key);
  if (cached) return cached;
  const data = await apiFetch(`/people/${personId}/stats?stats=career,yearByYear&group=pitching`);
  let career = null;
  const bySeason = new Map();
  for (const block of (data.stats || [])) {
    const type = block.type?.displayName;
    for (const s of (block.splits || [])) {
      const st = s.stat || {};
      if (type === 'career') {
        career = {
          era: st.era ?? null, ip: st.inningsPitched ?? null,
          gs: st.gamesStarted ?? null, w: st.wins ?? null, l: st.losses ?? null,
          k: st.strikeOuts ?? null,
        };
      } else if (type === 'yearByYear' && s.season) {
        // A traded season arrives as several splits — sum outs/starts, keep
        // ERA only when the season came as a single row (summing ERA is wrong).
        const prev = bySeason.get(s.season);
        const outs = (ip) => {
          const n = parseFloat(ip);
          return Number.isFinite(n) ? Math.floor(n) * 3 + Math.round((n % 1) * 10) : 0;
        };
        if (prev) {
          prev._outs += outs(st.inningsPitched);
          prev.gs += st.gamesStarted || 0;
          prev.era = null;
        } else {
          bySeason.set(s.season, {
            season: s.season, _outs: outs(st.inningsPitched),
            gs: st.gamesStarted || 0, era: st.era ?? null,
          });
        }
      }
    }
  }
  const seasons = [...bySeason.values()]
    .map(({ _outs, ...row }) => ({ ...row, ip: `${Math.floor(_outs / 3)}.${_outs % 3}` }))
    .sort((a, b) => Number(a.season) - Number(b.season));
  const out = (career || seasons.length) ? { career, seasons } : null;
  setCache(key, out);
  return out;
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
  getPitcherMilbSeasonRaw,
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
  getPitcherGameLogRaw,
  getPitcherSituationalSplits,
  getTeamSituationalHitting,
  getMlbStandingsContext,
  getMlbPeopleHands,
  getPitcherMonthSplits,
  getPitcherCareerProfile,
  getPitcherVsTeam,
};
