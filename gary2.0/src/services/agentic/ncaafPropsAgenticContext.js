/**
 * NCAAF props context.
 *
 * The market board comes from The Odds API, but no player reaches Gary until
 * Ball Don't Lie proves all three facts below:
 *   1. the player is on one (and only one) of the two current team rosters;
 *   2. the player has a dated BDL player-game stat sample;
 *   3. that row contains the field needed for the offered prop.
 *
 * Current-season stats win. The same current-roster player's prior-season
 * player-game rows may be used, labeled with their actual year and school.
 * Lines and prices are never derived from stats.
 */

import { ballDontLieService } from '../ballDontLieService.js';
import {
  buildMarketSnapshot,
  formatGameTimeEST,
  normalizePlayerName,
  normalizeTeamName,
  safeApiCallArray,
} from './sharedUtils.js';
import { footballSeasonForDate } from './scoutReport/sports/footballSeason.js';
import { cleanNcaafPlayerRows, aggregateNcaafPlayerRows, formatNcaafPlayerEvidence } from './scoutReport/sports/ncaafPlayerEvidence.js';
import {
  hasNcaafPropStatEvidence,
  ncaafStatPlayerId,
} from '../ncaafPropStats.js';

const SPORT_KEY = 'americanfootball_ncaaf';

function rosterPlayer(entry) {
  return entry?.player || entry || null;
}

function rosterPlayerName(entry) {
  const player = rosterPlayer(entry);
  return String(player?.full_name || `${player?.first_name || ''} ${player?.last_name || ''}`).trim();
}

function rosterPlayerId(entry) {
  const player = rosterPlayer(entry);
  const value = player?.id ?? entry?.player_id ?? null;
  return value == null || String(value).trim() === '' ? null : String(value);
}

function exactTeam(teams, targetName) {
  const target = normalizeTeamName(targetName);
  const matches = (Array.isArray(teams) ? teams : []).filter((team) =>
    normalizeTeamName(team?.full_name || team?.name) === target
  );
  return matches.length === 1 ? matches[0] : null;
}

export async function fetchCompleteNcaafRoster(teamId, ttlMinutes = 10) {
  const players = [];
  const seenPlayerIds = new Set();
  const seenCursors = new Set();
  let cursor = null;

  // NCAAF active rosters can exceed BDL's 100-row page maximum. Pull every
  // page so a market player cannot fail validation merely because he landed on
  // page two. Cursor repetition or an implausibly deep roster is a technical
  // failure, not permission to proceed with a truncated roster.
  for (let page = 0; page < 5; page += 1) {
    const response = await ballDontLieService.getPlayersActive(SPORT_KEY, {
      team_ids: [teamId],
      per_page: 100,
      ...(cursor != null ? { cursor } : {}),
    }, ttlMinutes);
    const pagePlayers = Array.isArray(response) ? response : (response?.data || []);
    for (const player of pagePlayers) {
      const id = rosterPlayerId(player);
      if (!id || seenPlayerIds.has(id)) continue;
      seenPlayerIds.add(id);
      players.push(player);
    }

    const nextCursor = Array.isArray(response) ? null : response?.meta?.next_cursor;
    if (nextCursor == null) return players;
    const cursorKey = String(nextCursor);
    if (seenCursors.has(cursorKey)) {
      throw new Error(`BDL repeated an NCAAF roster cursor for team ${teamId}`);
    }
    seenCursors.add(cursorKey);
    cursor = nextCursor;
  }

  throw new Error(`BDL NCAAF roster pagination exceeded the safety cap for team ${teamId}`);
}

export function buildNcaafRosterIndex({ homeRoster = [], awayRoster = [], homeTeam, awayTeam } = {}) {
  const index = new Map();
  const add = (entries, team) => {
    for (const entry of entries) {
      const name = rosterPlayerName(entry);
      const id = rosterPlayerId(entry);
      const key = normalizePlayerName(name);
      if (!key || !id) continue;
      const record = { id, name, team, entry };
      const existing = index.get(key) || [];
      existing.push(record);
      index.set(key, existing);
    }
  };
  add(homeRoster, homeTeam);
  add(awayRoster, awayTeam);
  return index;
}

function indexStats(rows) {
  const index = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = ncaafStatPlayerId(row);
    if (id && !index.has(id)) index.set(id, row);
  }
  return index;
}

/**
 * Pure validation helper used by focused tests and the live context builder.
 * Ambiguous same-name roster entries fail closed instead of guessing a team.
 */
export function validateNcaafPropBoard({
  props = [],
  rosterIndex,
  currentStats = [],
  previousStats = [],
  season,
} = {}) {
  const current = indexStats(currentStats);
  const previous = indexStats(previousStats);
  const accepted = [];
  const rejected = [];

  for (const source of props) {
    const key = normalizePlayerName(source?.player);
    const rosterMatches = rosterIndex?.get(key) || [];
    if (rosterMatches.length !== 1) {
      rejected.push({ prop: source, reason: rosterMatches.length ? 'ambiguous_roster_name' : 'player_not_on_game_roster' });
      continue;
    }

    const roster = rosterMatches[0];
    const currentRow = current.get(roster.id);
    const previousRow = previous.get(roster.id);
    const stats = hasNcaafPropStatEvidence(currentRow, source.prop_type)
      ? currentRow
      : (hasNcaafPropStatEvidence(previousRow, source.prop_type) ? previousRow : null);
    if (!stats) {
      rejected.push({ prop: source, reason: 'missing_bdl_stat_field' });
      continue;
    }

    const statsSeason = stats === currentRow ? Number(season) : Number(season) - 1;
    accepted.push({
      ...source,
      player: roster.name,
      player_id: roster.id,
      team: roster.team,
      _bdlStats: stats,
      _bdlStatsSeason: statsSeason,
    });
  }

  return { accepted, rejected };
}

function candidateRows(validatedProps) {
  const grouped = new Map();
  for (const prop of validatedProps) {
    const key = normalizePlayerName(prop.player);
    if (!grouped.has(key)) {
      grouped.set(key, {
        player: prop.player,
        playerId: prop.player_id,
        team: prop.team,
        props: [],
        stats: prop._bdlStats,
        statsSeason: prop._bdlStatsSeason,
      });
    }
    grouped.get(key).props.push(`${prop.prop_type} ${prop.line}`);
  }

  // Balance the slate at seven candidates per team, just like the NFL lane.
  const byTeam = new Map();
  for (const candidate of grouped.values()) {
    if (!byTeam.has(candidate.team)) byTeam.set(candidate.team, []);
    byTeam.get(candidate.team).push(candidate);
  }
  const result = [];
  for (const players of byTeam.values()) {
    result.push(...players
      .sort((a, b) => b.props.length - a.props.length || a.player.localeCompare(b.player))
      .slice(0, 7));
  }
  return result;
}

function present(stats, field) {
  const value = stats?.[field];
  return value === null || value === undefined || value === '' ? null : Number(value);
}

function formatPlayerStats(candidates, season) {
  const lines = [
    'NCAAF PLAYER EVIDENCE — active roster + dated BDL player_stats',
    'Values below are sums of the dated game rows in each stated sample, not per-game averages or a guarantee of a complete season. Prior school and season remain labeled. Missing fields stay unavailable.',
  ];
  for (const candidate of candidates) {
    const stats = candidate.stats || {};
    const parts = [
      ['pass yds', 'passing_yards'],
      ['pass TD', 'passing_touchdowns'],
      ['pass att', 'passing_attempts'],
      ['completions', 'passing_completions'],
      ['INT', 'passing_interceptions'],
      ['rush yds', 'rushing_yards'],
      ['rush att', 'rushing_attempts'],
      ['rush TD', 'rushing_touchdowns'],
      ['receptions', 'receptions'],
      ['rec yds', 'receiving_yards'],
      ['rec TD', 'receiving_touchdowns'],
    ].map(([label, field]) => {
      const value = present(stats, field);
      return Number.isFinite(value) ? `${value} ${label}` : null;
    }).filter(Boolean);
    lines.push(`- ${candidate.player} (${candidate.team}) — BDL game-row totals: ${parts.join(', ')}${formatNcaafPlayerEvidence(stats.evidence, season)}`);
  }
  return lines.join('\n');
}

export async function buildNcaafPropsAgenticContext(game, playerProps, options = {}) {
  const kickoff = new Date(game?.commence_time);
  if (Number.isNaN(kickoff.getTime())) throw new Error('NCAAF props context requires a valid kickoff');
  const season = footballSeasonForDate('NCAAF', kickoff);

  const teams = await safeApiCallArray(
    () => ballDontLieService.getTeams(SPORT_KEY),
    'NCAAF Props: Resolve game teams',
  );
  const home = exactTeam(teams, game.home_team);
  const away = exactTeam(teams, game.away_team);
  if (!home || !away) {
    throw new Error(`BDL could not resolve both exact NCAAF teams for ${game.away_team} @ ${game.home_team}`);
  }

  const [homeRoster, awayRoster] = await Promise.all([
    safeApiCallArray(() => fetchCompleteNcaafRoster(home.id, options.nocache ? 0 : 10), `NCAAF Props: ${home.full_name} roster`),
    safeApiCallArray(() => fetchCompleteNcaafRoster(away.id, options.nocache ? 0 : 10), `NCAAF Props: ${away.full_name} roster`),
  ]);
  if (!homeRoster.length || !awayRoster.length) {
    throw new Error(`BDL returned an incomplete NCAAF roster pair for ${game.away_team} @ ${game.home_team}`);
  }

  const rosterIndex = buildNcaafRosterIndex({
    homeRoster,
    awayRoster,
    homeTeam: home.full_name || game.home_team,
    awayTeam: away.full_name || game.away_team,
  });
  const rosterPlayerIds = [...new Set([...rosterIndex.values()].flat().map((player) => player.id))];
  const marketPlayerIds = [...new Set((playerProps || [])
    .flatMap((prop) => (rosterIndex.get(normalizePlayerName(prop.player)) || []).map((player) => player.id)))];
  const playerIds = marketPlayerIds.length ? marketPlayerIds : rosterPlayerIds;

  const asOf = new Date(Math.min(Date.now(), kickoff.getTime()));
  const fetchSample = async (sampleSeason) => {
    const rows = [];
    for (let offset = 0; offset < playerIds.length; offset += 100) {
      rows.push(...await safeApiCallArray(
        () => ballDontLieService.getNcaafPlayerGameStats({ playerIds: playerIds.slice(offset, offset + 100), season: sampleSeason }, options.nocache ? 0 : (sampleSeason === season ? 10 : 360)),
        `NCAAF Props: ${sampleSeason} dated player games`,
      ));
    }
    const clean = cleanNcaafPlayerRows(rows, { season: sampleSeason, playerIds, asOf });
    return {
      stats: [...aggregateNcaafPlayerRows(clean.rows, sampleSeason)].map(([id, line]) => ({ ...line, player: { id } })),
      diagnostics: clean.diagnostics,
    };
  };
  const [current, previous] = await Promise.all([fetchSample(season), fetchSample(season - 1)]);
  const currentStats = current.stats;
  const previousStats = previous.stats;

  const { accepted, rejected } = validateNcaafPropBoard({
    props: playerProps,
    rosterIndex,
    currentStats,
    previousStats,
    season,
  });
  if (!accepted.length) {
    const reasons = rejected.reduce((counts, item) => {
      counts[item.reason] = (counts[item.reason] || 0) + 1;
      return counts;
    }, {});
    throw new Error(`No NCAAF prop line passed BDL roster/stat validation (${JSON.stringify(reasons)})`);
  }

  const candidates = candidateRows(accepted);
  const playerStats = formatPlayerStats(candidates, season);
  const marketSnapshot = buildMarketSnapshot(
    game.bookmakers || [],
    home.full_name || game.home_team,
    away.full_name || game.away_team,
  );

  return {
    gameSummary: {
      gameId: `ncaaf-props-${game.id}`,
      bdlGameId: String(game.bdl_game_id ?? game.id),
      sport: SPORT_KEY,
      league: 'NCAAF',
      matchup: `${game.away_team} @ ${game.home_team}`,
      homeTeam: home.full_name || game.home_team,
      awayTeam: away.full_name || game.away_team,
      kickoff: formatGameTimeEST(game.commence_time),
      odds: marketSnapshot,
      marketSource: 'The Odds API (current event markets)',
      statsSource: 'Ball Don\'t Lie (active roster + dated player-game rows)',
    },
    tokenData: {
      propCandidates: candidates,
      playerStats,
      marketSnapshot,
    },
    // The shared runner adopts this validated board before presenting lines to
    // Gary and before provider-price reconciliation.
    playerProps: accepted,
    propCandidates: candidates.map((candidate) => ({
      player: candidate.player,
      playerId: candidate.playerId,
      team: candidate.team,
      props: candidate.props,
      recentForm: {
        targetTrend: null,
        usageTrend: null,
        formTrend: `BDL summed dated game rows${formatNcaafPlayerEvidence(candidate.stats.evidence, season)}`,
      },
    })),
    playerStats,
    playerSeasonStats: Object.fromEntries(candidates.map((candidate) => [candidate.playerId, candidate.stats])),
    playerGameLogs: {},
    narrativeContext: null,
    meta: {
      season,
      evidenceAsOf: asOf.toISOString(),
      evidenceChecks: { current: current.diagnostics, previous: previous.diagnostics },
      gameTime: game.commence_time,
      marketRows: playerProps.length,
      validatedMarketRows: accepted.length,
      rejectedMarketRows: rejected.length,
      validatedPlayers: candidates.length,
      sourceSeasons: [...new Set(candidates.map((candidate) => candidate.statsSeason))].sort(),
      exactBdlGameId: String(game.bdl_game_id ?? game.id),
    },
  };
}

export default {
  buildNcaafPropsAgenticContext,
  buildNcaafRosterIndex,
  fetchCompleteNcaafRoster,
  validateNcaafPropBoard,
};
