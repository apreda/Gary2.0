// Grounded NCAAF fantasy context for the Hub.
//
// BDL exposes player season totals, active-player team identity and today's
// sportsbook total. It does not expose college snap share, routes, goal-line
// role or a dependable all-player game-log feed, so those concepts are never
// inferred here. Current-season totals win. At the start of a new season, a
// prior-season row is allowed only when BDL's current active-player directory
// confirms that the same player is now on one of today's teams; every such row
// is visibly labeled as a prior-season baseline.

import { makeRow, median, TONES } from '../shared.js';
import { selectFootballOddsByGame } from '../footballData.js';

const MAX_GAMES = 6;
const MAX_PER_TEAM = 2;
const PLAYER_CHUNK = 100;
const TEAM_CHUNK = 2;

const THRESHOLDS = Object.freeze({
  current: Object.freeze({ QB: 10, RB: 5, RECEIVER: 2 }),
  baseline: Object.freeze({ QB: 100, RB: 50, RECEIVER: 20 }),
});

function finite(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function chunks(values, size) {
  const output = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
  }
  return output;
}

function playerId(row) {
  return row?.player?.id ?? row?.player_id ?? row?.playerId ?? null;
}

function teamId(row) {
  return row?.team?.id ?? row?.team_id ?? row?.teamId ?? row?.player?.team?.id ?? null;
}

function playerName(row) {
  const player = row?.player || {};
  return String(player.full_name || [player.first_name, player.last_name].filter(Boolean).join(' ')).trim();
}

function positionFor(row) {
  return String(row?.player?.position_abbreviation || row?.player?.position || '')
    .trim()
    .toUpperCase();
}

function roleFor(row) {
  const position = positionFor(row);
  if (position === 'QB' || position === 'QUARTERBACK') return 'QB';
  if (position === 'RB' || position === 'FB' || position === 'RUNNING BACK') return 'RB';
  if (position === 'WR' || position === 'TE' || position === 'WIDE RECEIVER' || position === 'TIGHT END') {
    return 'RECEIVER';
  }
  return null;
}

function metricFor(row) {
  const role = roleFor(row);
  if (role === 'QB') {
    return {
      role,
      value: finite(row?.passing_attempts),
      label: 'pass attempts',
      token: 'PASS ATT',
      metric: 'passing_attempts',
    };
  }
  if (role === 'RB') {
    const rushes = finite(row?.rushing_attempts);
    const receptions = finite(row?.receptions);
    const value = rushes == null && receptions == null ? null : (rushes ?? 0) + (receptions ?? 0);
    return {
      role,
      value,
      label: 'carries plus receptions',
      token: 'TOUCHES',
      metric: 'rushing_attempts_plus_receptions',
    };
  }
  if (role === 'RECEIVER') {
    return {
      role,
      value: finite(row?.receptions),
      label: 'receptions',
      token: 'REC',
      metric: 'receptions',
    };
  }
  return null;
}

function teamLabel(team) {
  return team?.abbreviation || team?.full_name || team?.name || 'TEAM';
}

function slateContexts(games, selectedMarkets) {
  const byTeam = new Map();
  for (const game of games) {
    const away = game?.away_team ?? game?.visitor_team;
    const home = game?.home_team;
    const market = selectedMarkets.get(String(game?.id));
    if (away?.id != null) byTeam.set(String(away.id), { game, team: away, opponent: home, market });
    if (home?.id != null) byTeam.set(String(home.id), { game, team: home, opponent: away, market });
  }
  return byTeam;
}

async function loadSeasonRows(bdl, teamIds, season) {
  const output = [];
  for (const group of chunks(teamIds, TEAM_CHUNK)) {
    try {
      const rows = await bdl.getNcaafPlayerSeasonStats({ teamIds: group, season }, 10);
      if (Array.isArray(rows)) output.push(...rows);
    } catch (error) {
      console.warn(`[ncaafFantasyEdges] ${season} player totals omitted for ${group.join(',')}: ${error?.message || error}`);
    }
  }
  return output;
}

function selectCandidates(rows, allowedTeamIds, { baseline = false } = {}) {
  const bestByTeamRole = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const pid = playerId(row);
    const tid = teamId(row);
    const metric = metricFor(row);
    if (pid == null || tid == null || !allowedTeamIds.has(String(tid)) || !metric) continue;
    const threshold = THRESHOLDS[baseline ? 'baseline' : 'current'][metric.role];
    if (metric.value == null || metric.value < threshold) continue;
    const key = `${tid}|${metric.role}`;
    const prior = bestByTeamRole.get(key);
    if (!prior || metric.value > prior.metric.value) {
      bestByTeamRole.set(key, { row, metric, player_id: pid, team_id: tid, baseline });
    }
  }

  const byTeam = new Map();
  for (const candidate of bestByTeamRole.values()) {
    const key = String(candidate.team_id);
    if (!byTeam.has(key)) byTeam.set(key, []);
    byTeam.get(key).push(candidate);
  }

  return [...byTeam.values()].flatMap((teamRows) => teamRows
    .sort((a, b) => {
      const aThreshold = THRESHOLDS[a.baseline ? 'baseline' : 'current'][a.metric.role];
      const bThreshold = THRESHOLDS[b.baseline ? 'baseline' : 'current'][b.metric.role];
      return (b.metric.value / bThreshold) - (a.metric.value / aThreshold);
    })
    .slice(0, MAX_PER_TEAM));
}

async function validateBaselineRoster(bdl, candidates, allowedTeamIds) {
  if (!candidates.length || typeof bdl?.getPlayersActive !== 'function') return [];
  const activeById = new Map();
  const ids = [...new Set(candidates.map((candidate) => String(candidate.player_id)))];
  for (const group of chunks(ids, PLAYER_CHUNK)) {
    try {
      const response = await bdl.getPlayersActive(
        'americanfootball_ncaaf',
        { player_ids: group, per_page: 100 },
        10,
      );
      const players = Array.isArray(response) ? response : response?.data;
      for (const player of Array.isArray(players) ? players : []) {
        if (player?.id != null && player?.team?.id != null) activeById.set(String(player.id), player);
      }
    } catch (error) {
      console.warn(`[ncaafFantasyEdges] active-player validation omitted: ${error?.message || error}`);
    }
  }

  return candidates.flatMap((candidate) => {
    const active = activeById.get(String(candidate.player_id));
    const currentTeamId = active?.team?.id;
    if (currentTeamId == null || !allowedTeamIds.has(String(currentTeamId))) return [];
    return [{
      ...candidate,
      team_id: currentTeamId,
      row: {
        ...candidate.row,
        team: active.team,
        team_id: currentTeamId,
        player: { ...(candidate.row?.player || {}), ...active, team: active.team },
      },
    }];
  });
}

function usageRow(candidate, context, { season, helpers }) {
  const { row, metric, baseline } = candidate;
  const name = playerName(row);
  if (!name || !context?.game) return null;
  const scope = baseline ? 'prior_season_baseline' : 'current_season';
  const headline = baseline
    ? `${season} baseline: ${name} logged ${metric.value} ${metric.label}`
    : `${name} has ${metric.value} ${metric.label} in ${season}`;
  const detail = baseline
    ? `BDL confirms ${name} is currently active for ${teamLabel(context.team)}. ` +
      `The ${metric.value} ${metric.label} are his verified ${season} season total, shown as a prior-season baseline rather than current form or a projection.`
    : `${name}'s ${metric.value} ${metric.label} are a verified ${season} season total for ${teamLabel(context.team)}. ` +
      `This is measured volume, not a per-game rate, snap-share estimate or projection.`;

  return makeRow({
    category: 'fantasy_usage',
    headline,
    detail,
    game: helpers.gameLabel(context.game),
    value: `${metric.value} ${metric.token}`,
    tone: TONES.NEUTRAL,
    relevance_score: Math.min(91, Math.round(55 + metric.value / THRESHOLDS[baseline ? 'baseline' : 'current'][metric.role] * 9)),
    player_id: candidate.player_id,
    team_id: context.team?.id ?? candidate.team_id,
    game_id: context.game?.id,
    meta: {
      kind: 'fantasy_usage',
      team: teamLabel(context.team),
      position: positionFor(row) || metric.role,
      source: 'balldontlie_ncaaf_player_season_stats+active_players',
      metric: metric.metric,
      season,
      season_type: 'regular',
      team_id: context.team?.id ?? candidate.team_id,
      role: metric.role,
      evidence_scope: scope,
    },
  });
}

function matchupRow(candidate, context, { season, helpers, slateMedian }) {
  const total = finite(context?.market?.total);
  if (total == null || total < 52 || (slateMedian != null && total < slateMedian + 3)) return null;
  const name = playerName(candidate.row);
  if (!name) return null;
  return makeRow({
    category: 'fantasy_matchup',
    headline: `${name}'s game carries a ${total.toFixed(1).replace(/\.0$/, '')} total`,
    detail: `${context.market?.row?.vendor || 'The current sportsbook market'} lists ` +
      `${teamLabel(context.team)} versus ${teamLabel(context.opponent)} at ${total.toFixed(1).replace(/\.0$/, '')}. ` +
      `That is current scoring-environment context for a player with ${candidate.baseline ? `a labeled ${season} usage baseline` : `verified ${season} volume`}, not a player projection.`,
    game: helpers.gameLabel(context.game),
    value: `${total.toFixed(1).replace(/\.0$/, '')} O/U`,
    tone: TONES.NEUTRAL,
    relevance_score: Math.min(92, Math.round(60 + Math.max(0, total - 50) * 2)),
    line_val: total,
    player_id: candidate.player_id,
    team_id: context.team?.id ?? candidate.team_id,
    game_id: context.game?.id,
    meta: {
      kind: 'fantasy_matchup',
      team: teamLabel(context.team),
      position: positionFor(candidate.row) || candidate.metric.role,
      source: 'balldontlie_ncaaf_player_season_stats+balldontlie_odds',
      metric: 'high_volume_player_game_total',
      season,
      season_type: 'regular',
      team_id: context.team?.id ?? candidate.team_id,
      vendor: context.market?.row?.vendor || null,
      total,
      slate_total_median: slateMedian,
      evidence_scope: candidate.baseline ? 'prior_season_baseline' : 'current_season',
    },
  });
}

export async function computeNcaafFantasyEdges(ctx) {
  const { games, season, bdl, helpers, date } = ctx;
  if (String(ctx?.league || '').toLowerCase() !== 'ncaaf' || !Array.isArray(games) || games.length === 0) return [];
  if (typeof bdl?.getNcaafPlayerSeasonStats !== 'function') return [];

  let selectedMarkets = new Map();
  try {
    const odds = await bdl.getOddsV2(
      { game_ids: games.map((game) => game?.id).filter((id) => id != null), per_page: 100 },
      'americanfootball_ncaaf',
      1,
    );
    selectedMarkets = selectFootballOddsByGame(odds, new Set(games.map((game) => game?.id)));
  } catch (error) {
    console.warn(`[ncaafFantasyEdges] market context omitted: ${error?.message || error}`);
  }

  const selectedGames = [...games]
    .sort((a, b) => {
      const aTotal = selectedMarkets.get(String(a?.id))?.total ?? -Infinity;
      const bTotal = selectedMarkets.get(String(b?.id))?.total ?? -Infinity;
      return bTotal - aTotal || String(a?.id).localeCompare(String(b?.id));
    })
    .slice(0, MAX_GAMES);
  const contexts = slateContexts(selectedGames, selectedMarkets);
  const teamIds = [...contexts.keys()];
  const allowedTeamIds = new Set(teamIds);

  const currentRows = await loadSeasonRows(bdl, teamIds, season);
  const currentCandidates = selectCandidates(currentRows, allowedTeamIds);
  const teamsWithCurrent = new Set(currentCandidates.map((candidate) => String(candidate.team_id)));
  const missingTeamIds = teamIds.filter((id) => !teamsWithCurrent.has(String(id)));

  let baselineCandidates = [];
  if (missingTeamIds.length > 0 && Number.isInteger(Number(season))) {
    const baselineRows = await loadSeasonRows(bdl, missingTeamIds, Number(season) - 1);
    const selectedBaseline = selectCandidates(baselineRows, new Set(missingTeamIds.map(String)), { baseline: true });
    baselineCandidates = await validateBaselineRoster(bdl, selectedBaseline, allowedTeamIds);
  }

  const seenPlayers = new Set();
  const candidates = [...currentCandidates, ...baselineCandidates]
    .filter((candidate) => {
      const key = String(candidate.player_id);
      if (seenPlayers.has(key)) return false;
      seenPlayers.add(key);
      return contexts.has(String(candidate.team_id));
    });
  const totals = [...selectedMarkets.values()].map((market) => market.total).filter((value) => finite(value) != null);
  const slateMedian = median(totals);
  const rows = [];
  const matchupUsed = new Set();

  for (const candidate of candidates) {
    const context = contexts.get(String(candidate.team_id));
    if (!context) continue;
    const evidenceSeason = candidate.baseline ? Number(season) - 1 : Number(season);
    const usage = usageRow(candidate, context, { season: evidenceSeason, helpers });
    if (usage) rows.push(usage);

    const gameKey = String(context.game?.id);
    if (!matchupUsed.has(gameKey)) {
      const matchup = matchupRow(candidate, context, { season: evidenceSeason, helpers, slateMedian });
      if (matchup) {
        rows.push(matchup);
        matchupUsed.add(gameKey);
      }
    }
  }

  console.log(
    `[ncaafFantasyEdges] NCAAF ${date}: ${currentCandidates.length} current + ` +
      `${baselineCandidates.length} roster-verified baseline candidate(s) -> ${rows.length} row(s)`,
  );
  return rows;
}

export const ncaafFantasyInternals = Object.freeze({
  metricFor,
  roleFor,
  selectCandidates,
  validateBaselineRoster,
});

export default { computeNcaafFantasyEdges };
