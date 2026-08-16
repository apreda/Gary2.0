// Football-only data helpers for insight_connections.
//
// Every function in this file is deterministic or reads through the existing
// ballDontLieService surface. It deliberately does not fall back to the prior
// season: an empty current-season sample is more honest than presenting stale
// football as evidence for today's matchup.

import {
  classifyNcaafFbsGames,
  ncaafSlateDateForKickoff,
  resolveNcaafKickoff,
} from '../ncaafGamePolicy.js';

const FOOTBALL = Object.freeze({
  nfl: Object.freeze({ sportKey: 'americanfootball_nfl' }),
  ncaaf: Object.freeze({ sportKey: 'americanfootball_ncaaf' }),
});

// Four teams × a full 18-game pro season remains below the endpoint's
// 100-row page; the same bound safely covers a college regular season.
const TEAM_CHUNK_SIZE = 4;
const FOOTBALL_BOOK_PRIORITY = Object.freeze([
  'fanduel', 'draftkings', 'betrivers', 'caesars', 'betmgm',
  'fanatics', 'betway', 'ballybet', 'betparx', 'rebet',
]);
const NON_SPORTSBOOK_ODDS = new Set(['kalshi', 'polymarket', 'openingsnapshot']);

function normalizedVendor(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function footballBookRank(value) {
  const vendor = normalizedVendor(value);
  const priority = FOOTBALL_BOOK_PRIORITY.indexOf(vendor);
  return priority >= 0 ? priority : FOOTBALL_BOOK_PRIORITY.length;
}

function leagueKey(raw) {
  return String(raw || '').trim().toLowerCase();
}

function finiteValue(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function shiftDate(dateStr, delta) {
  const time = Date.parse(`${dateStr}T00:00:00Z`);
  if (!Number.isFinite(time)) return null;
  return new Date(time + delta * 86400000).toISOString().slice(0, 10);
}

function etDateForGame(game) {
  const raw = game?.date ?? game?.datetime ?? game?.commence_time ?? game?.start_time_utc;
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) return String(raw);
  const instant = new Date(raw);
  if (Number.isNaN(instant.getTime())) return null;
  return instant.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function finalFootballGame(game) {
  const status = String(game?.status ?? '').trim().toLowerCase();
  return status.includes('final') || status === 'post' || status === 'completed' || status === 'complete';
}

function nflSeasonTypeForGame(game) {
  const explicit = finiteValue(game?.season_type ?? game?.seasonType);
  if ([1, 2, 3].includes(explicit)) return explicit;
  if (game?.postseason === true || String(game?.postseason).toLowerCase() === 'true') return 3;

  const raw = game?.date ?? game?.datetime ?? game?.commence_time ?? game?.start_time_utc;
  const instant = new Date(raw);
  if (!Number.isNaN(instant.getTime())) {
    const month = Number(new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      month: 'numeric',
    }).format(instant));
    if (month === 7 || month === 8) return 1;
  }
  return 2;
}

function chunks(values, size) {
  const out = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

function teamIdFromRow(row) {
  return row?.team?.id ?? row?.team_id ?? null;
}

function gameIdFromRow(row) {
  return row?.game?.id ?? row?.game_id ?? null;
}

function gameDateFromRow(row) {
  const raw = row?.game?.date ?? row?.date ?? null;
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) return String(raw);
  const instant = new Date(raw);
  if (Number.isNaN(instant.getTime())) return null;
  return instant.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function gameSeasonFromRow(row) {
  return finiteValue(row?.game?.season ?? row?.season);
}

/**
 * NFL/NCAAF season is the calendar year in which play begins. January bowl and
 * playoff games therefore belong to the previous year's season; August is the
 * cutover into the new season.
 */
export function footballSeasonForDate(dateStr) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || month < 1 || month > 12) return null;
  return month >= 8 ? year : year - 1;
}

/**
 * Resolve one exact football slate using the current ballDontLieService method
 * signatures. NCAAF queries the requested provider date plus the next UTC date,
 * then applies the real ET day locally so late-night games survive without
 * admitting tomorrow's games.
 */
export async function loadFootballSlate({ bdl, league, date }) {
  const key = leagueKey(league);
  if (!bdl || !FOOTBALL[key] || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return [];

  const nextUtcDate = shiftDate(date, 1);
  let rows;
  if (key === 'nfl') {
    // NFL's date filter is UTC-based and defaults away from preseason. Pull
    // both possible UTC dates and every season type, then scope back to the
    // requested ET slate. Otherwise an 8 PM ET preseason game can disappear.
    rows = await bdl.getGames(
      FOOTBALL[key].sportKey,
      {
        dates: [date, nextUtcDate],
        season_type: [1, 2, 3],
        per_page: 100,
      },
    );
    rows = (Array.isArray(rows) ? rows : []).filter((game) => etDateForGame(game) === date);
  } else {
    rows = await bdl.getGames(
      FOOTBALL[key].sportKey,
      { dates: [date, nextUtcDate], per_page: 100 },
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      rows = [];
    } else {
      // Game rows and the team directory currently document different
      // conference-id namespaces. Classify through exact provider team ids from
      // the canonical directory instead of trusting an ambiguous embedded value.
      if (typeof bdl.getTeams !== 'function') {
        throw new Error('NCAAF insight slate cannot load the provider team directory');
      }
      const teams = await bdl.getTeams(FOOTBALL[key].sportKey);
      if (!Array.isArray(teams) || teams.length === 0) {
        throw new Error('NCAAF insight slate provider team directory is unavailable');
      }
      // The adjacent UTC-date query also contains tomorrow's daytime games.
      // Exclude rows with a known different ET slate before FBS classification
      // so an unrelated unresolved Sunday identity cannot suppress Saturday.
      // Unknown dates remain in scope and fail closed below.
      const targetDateRows = rows.filter((game) => {
        const kickoff = resolveNcaafKickoff(game);
        return !kickoff.scheduledDate || ncaafSlateDateForKickoff(game) === date;
      });
      const classified = classifyNcaafFbsGames(targetDateRows, teams);
      if (classified.unresolved.length > 0) {
        throw new Error(
          `NCAAF insight slate has ${classified.unresolved.length} game(s) without provider-grounded FBS identity`,
        );
      }
      rows = classified.accepted.filter((game) => {
        return ncaafSlateDateForKickoff(game) === date;
      });
    }
  }

  const seen = new Set();
  const games = [];
  for (const original of Array.isArray(rows) ? rows : []) {
    const id = original?.id;
    const home = original?.home_team;
    const away = original?.away_team ?? original?.visitor_team;
    if (id == null || !home?.id || !away?.id) continue;
    const identity = String(id);
    if (seen.has(identity)) continue;
    seen.add(identity);
    games.push({
      ...original,
      away_team: away,
      visitor_team: original?.visitor_team ?? away,
    });
  }
  return games;
}

/**
 * Fetch current-season team-game boxes for every team on the slate. Calls are
 * chunked to stay under the endpoint's 100-row page and run sequentially to
 * avoid creating a BDL rate-limit burst on a full college slate.
 */
export async function loadFootballTeamGameStats({ bdl, league, season, date, games }) {
  const key = leagueKey(league);
  const cfg = FOOTBALL[key];
  const before = String(date || '');
  const previousDate = shiftDate(before, -1);
  if (!bdl || !cfg || !Number.isInteger(Number(season)) || !previousDate) return [];

  const teamByIdentity = new Map();
  for (const id of (games || []).flatMap((game) => [
    game?.away_team?.id ?? game?.visitor_team?.id,
    game?.home_team?.id,
  ]).filter((value) => value != null)) {
    if (!teamByIdentity.has(String(id))) teamByIdentity.set(String(id), id);
  }
  const teamIds = [...teamByIdentity.values()];
  if (teamIds.length === 0) return [];

  const wanted = new Set(teamIds.map(String));
  const seen = new Set();
  const output = [];
  const nflSeasonTypes = new Set(
    key === 'nfl' ? (games || []).map(nflSeasonTypeForGame) : [],
  );
  let ncaafFinalGames = null;

  if (key === 'ncaaf') {
    // NCAAF /team_stats embeds only game id/date/season/week; unlike NFL, it
    // does not include status or scores. Join the exact current-season game
    // records so an in-progress or postponed row cannot enter the historical
    // sample and point-per-game can use authoritative final scores.
    try {
      const history = await bdl.getGames(
        cfg.sportKey,
        {
          team_ids: teamIds,
          seasons: [Number(season)],
          // Provider date filters are UTC-based. Include the slate's provider
          // date so a late game from the prior ET night is available; the
          // authoritative ET cutoff below still excludes every slate-day row.
          end_date: before,
          per_page: 100,
        },
        10,
      );
      ncaafFinalGames = new Map(
        (Array.isArray(history) ? history : [])
          .filter(finalFootballGame)
          .map((game) => [String(game?.id), game]),
      );
    } catch (err) {
      throw new Error(`NCAAF final-game index unavailable: ${err?.message || err}`);
    }
  }

  for (const group of chunks(teamIds, TEAM_CHUNK_SIZE)) {
    let rows = [];
    try {
      const params = {
        team_ids: group,
        seasons: [Number(season)],
        per_page: 100,
      };
      // The current NCAAF team_stats route supports end_date; the current NFL
      // route does not. Include the slate's UTC provider date to retain a late
      // prior-ET-night game, then enforce the exact pre-slate ET cutoff below.
      if (key === 'ncaaf') params.end_date = before;
      if (key === 'nfl' && nflSeasonTypes.size === 1) {
        params.season_type = [...nflSeasonTypes][0];
      }
      rows = await bdl.getTeamStats(
        cfg.sportKey,
        params,
        10,
      );
    } catch (err) {
      console.warn(`[footballInsights] ${key.toUpperCase()} team-stats chunk omitted: ${err?.message || err}`);
      continue;
    }

    for (const row of Array.isArray(rows) ? rows : []) {
      const teamId = teamIdFromRow(row);
      const gameId = gameIdFromRow(row);
      if (teamId == null || gameId == null || !wanted.has(String(teamId))) continue;
      const verifiedGame = key === 'ncaaf'
        ? ncaafFinalGames.get(String(gameId))
        : row?.game;
      if (!verifiedGame || !finalFootballGame(verifiedGame)) continue;
      const verifiedRow = verifiedGame === row?.game
        ? row
        : { ...row, game: { ...(row?.game || {}), ...verifiedGame } };
      const gameDate = gameDateFromRow(verifiedRow);
      const rowSeason = gameSeasonFromRow(verifiedRow);
      if (rowSeason == null || Number(rowSeason) !== Number(season)) continue;
      if (!gameDate || gameDate >= before) continue;
      const identity = `${teamId}|${gameId}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      output.push(verifiedRow);
    }
  }

  return output;
}

function parseEfficiency(value) {
  if (!value || typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d+)\s*[-/]\s*(\d+)$/);
  if (!match) return null;
  const made = Number(match[1]);
  const attempts = Number(match[2]);
  return attempts > 0 ? { made, attempts } : null;
}

function possessionSeconds(value) {
  if (!value || typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d+):(\d{2})$/);
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (!Number.isFinite(minutes) || seconds < 0 || seconds > 59) return null;
  return minutes * 60 + seconds;
}

function pointsFor(row, teamId) {
  const game = row?.game;
  if (!game) return null;
  const homeId = game?.home_team?.id ?? game?.home_team_id;
  const awayId = game?.away_team?.id ?? game?.visitor_team?.id ?? game?.away_team_id ?? game?.visitor_team_id;
  if (String(teamId) === String(homeId)) {
    return finiteValue(game?.home_team_score ?? game?.home_score);
  }
  if (String(teamId) === String(awayId)) {
    return finiteValue(game?.visitor_team_score ?? game?.away_score);
  }
  return null;
}

function accumulator(teamId) {
  return {
    teamId,
    games: 0,
    sums: Object.create(null),
    counts: Object.create(null),
    thirdDownMade: 0,
    thirdDownAttempts: 0,
  };
}

function add(acc, key, value) {
  const n = finiteValue(value);
  if (n == null) return;
  acc.sums[key] = (acc.sums[key] || 0) + n;
  acc.counts[key] = (acc.counts[key] || 0) + 1;
}

/** Aggregate exact BDL team-game rows into per-game comparison metrics. */
export function aggregateFootballTeamStats(rows, { league } = {}) {
  const key = leagueKey(league);
  const byTeam = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const teamId = teamIdFromRow(row);
    if (teamId == null) continue;
    const id = String(teamId);
    const acc = byTeam.get(id) || accumulator(teamId);
    acc.games += 1;

    add(acc, 'rushingYards', row?.rushing_yards);
    add(acc, 'passingYards', key === 'nfl' ? (row?.net_passing_yards ?? row?.passing_yards) : row?.passing_yards);
    add(acc, 'totalYards', row?.total_yards);
    add(acc, 'turnovers', row?.turnovers);
    add(acc, 'firstDowns', row?.first_downs);
    add(acc, 'yardsPerPlay', row?.yards_per_play);
    add(acc, 'sacks', row?.sacks);
    add(acc, 'possessionSeconds', possessionSeconds(row?.possession_time));
    add(acc, 'points', pointsFor(row, teamId));

    const made = finiteValue(row?.third_down_conversions);
    const attempts = finiteValue(row?.third_down_attempts);
    const parsed = made != null && attempts != null && attempts > 0
      ? { made, attempts }
      : parseEfficiency(row?.third_down_efficiency);
    if (parsed) {
      acc.thirdDownMade += parsed.made;
      acc.thirdDownAttempts += parsed.attempts;
    }

    byTeam.set(id, acc);
  }

  const result = new Map();
  for (const [id, acc] of byTeam) {
    const average = (name) => {
      const count = acc.counts[name] || 0;
      return count > 0 ? acc.sums[name] / count : null;
    };
    result.set(id, {
      teamId: acc.teamId,
      games: acc.games,
      rushingYardsPerGame: average('rushingYards'),
      passingYardsPerGame: average('passingYards'),
      totalYardsPerGame: average('totalYards'),
      turnoversPerGame: average('turnovers'),
      firstDownsPerGame: average('firstDowns'),
      yardsPerPlay: average('yardsPerPlay'),
      sacksPerGame: average('sacks'),
      possessionSecondsPerGame: average('possessionSeconds'),
      pointsPerGame: average('points'),
      thirdDownPct: acc.thirdDownAttempts > 0
        ? (acc.thirdDownMade / acc.thirdDownAttempts) * 100
        : null,
    });
  }
  return result;
}

/** Deterministically choose one complete/current BDL odds row per game. */
export function selectFootballOddsByGame(rows, slateGameIds) {
  const wanted = new Set([...(slateGameIds || [])].map(String));
  const grouped = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const gameId = row?.game_id ?? row?.game?.id;
    if (gameId == null || !wanted.has(String(gameId))) continue;
    const total = finiteValue(row?.total_value);
    if (total == null) continue;
    const vendor = normalizedVendor(row?.vendor);
    if (!vendor || NON_SPORTSBOOK_ODDS.has(vendor)) continue;
    const completeness = [row?.spread_home_value, row?.spread_away_value,
      row?.moneyline_home_odds, row?.moneyline_away_odds].filter((v) => v != null).length;
    const candidate = { row, total, completeness, bookRank: footballBookRank(row?.vendor) };
    const prior = grouped.get(String(gameId));
    if (!prior || candidate.bookRank < prior.bookRank ||
        (candidate.bookRank === prior.bookRank && candidate.completeness > prior.completeness) ||
        (candidate.bookRank === prior.bookRank && candidate.completeness === prior.completeness &&
          String(row?.updated_at || '').localeCompare(String(prior.row?.updated_at || '')) > 0) ||
        (candidate.bookRank === prior.bookRank && candidate.completeness === prior.completeness &&
          row?.updated_at === prior.row?.updated_at &&
          String(row?.vendor || '').localeCompare(String(prior.row?.vendor || '')) < 0)) {
      grouped.set(String(gameId), candidate);
    }
  }
  return grouped;
}

export const footballDataInternals = Object.freeze({
  etDateForGame,
  finalFootballGame,
  finiteValue,
  gameDateFromRow,
  gameSeasonFromRow,
  nflSeasonTypeForGame,
  normalizedVendor,
  pointsFor,
});
