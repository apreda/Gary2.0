// NFL-native, dated evidence for the shared Fantasy decision writer. Candidate
// discovery is bounded; it never assigns a recommendation or fantasy tier.
import { numericStat } from '../playerGameLogFacts.js';
import { etDateStr } from './shared.js';
import { NFL_FANTASY_POSITIONS, NFL_FANTASY_STAT_FIELDS } from './nflFantasyProvider.js';

const FORMATS = ['standard', 'half_ppr', 'ppr'];
const ROLES = { QB: 'quarterback', RB: 'running_back', WR: 'receiver', TE: 'tight_end' };
const MAX_CANDIDATES = 32;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const FORECAST_HOURS = 6;
const OWNERSHIP_HOURS = 24;
const MAX_CLOCK_SKEW = 5 * 60_000;
const object = value => value != null && typeof value === 'object' && !Array.isArray(value);
const id = value => /^\d+$/.test(String(value)) && Number(value) > 0 ? String(value) : null;
const stamp = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const round = (value, digits = 1) => numericStat(value) == null ? null : Number(Number(value).toFixed(digits));
const key = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[.'’]/g, '').replace(/[-\s]+/g, ' ').trim();
const name = player => player?.full_name || [player?.first_name, player?.last_name].filter(Boolean).join(' ').trim();
const label = team => team?.abbreviation || team?.full_name || team?.name || null;
const away = game => game?.visitor_team ?? game?.away_team;
const position = row => String(row?.position_abbreviation || row?.position || '').toUpperCase();
const firstSeason = value => /^(?:rookie|r|0(?:th)? season|1st season)$/i.test(String(value || '').trim());
const gameState = game => `${game?.status_state || ''} ${game?.status || ''}`.trim().toLowerCase().replace(/status_/g, '');
const final = game => /\b(final|post|complete|completed)\b/.test(gameState(game));
const unavailableGame = game => /postpon|cancel|suspend|delay|\btbd\b/.test(gameState(game));
const live = game => !final(game) && !unavailableGame(game) && /in.progress|\bin\b|\blive\b|quarter|halftime|overtime|\b[1-4](?:st|nd|rd|th)\b/.test(gameState(game));
const regular = row => ![row?.postseason, row?.game?.postseason].some(value => value === true || String(value).toLowerCase() === 'true')
  && [row?.season_type, row?.game?.season_type].filter(value => value != null).every(value => Number(value) === 2 || /^(regular|reg)$/i.test(String(value)));
const currentForecast = (game, at) => stamp(game?.date) && Date.parse(game.date) > Date.parse(at) && !final(game) && !unavailableGame(game) && !live(game);

function dateValid(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) && stamp(`${date}T12:00:00Z`)?.slice(0, 10) === date;
}
function sourceAge(value, asOf, maxHours) {
  const iso = stamp(value);
  const ms = iso ? Date.parse(asOf) - Date.parse(iso) : NaN;
  return { at: iso, hours: Number.isFinite(ms) ? round(Math.max(0, ms) / HOUR) : null,
    fresh: Number.isFinite(ms) && ms >= -MAX_CLOCK_SKEW && ms <= maxHours * HOUR };
}
function factsNumber(value, field, projected = false) {
  const n = numericStat(value);
  if (n == null || (!field.endsWith('yards') && n < 0) || (!projected && !Number.isInteger(n))) return null;
  return projected ? round(n, /touchdowns|interceptions|fumbles/.test(field) ? 2 : 1) : n;
}
function average(rows, field) {
  const values = rows.map(row => row[field]);
  return values.length && values.every(value => value != null) ? round(values.reduce((a, b) => a + b, 0) / values.length) : null;
}
function normalizedGame(row) {
  return { game_id: id(row.id), season: Number(row.season), week: Number(row.week), date: etDateStr(row.date), start_at: stamp(row.date),
    home_team_id: id(row.home_team?.id), home_team: label(row.home_team), away_team_id: id(away(row)?.id), away_team: label(away(row)),
    status: row.status ?? null, status_state: row.status_state ?? null, postseason: row.postseason ?? null };
}

/** A season/week belongs to the provider schedule, not a Thursday calendar.
 * Quiet days resolve the next real scoring week. Live games keep their week
 * until completion; canceled/postponed events cannot pin an obsolete week. */
export function resolveNflFantasyWeek(rows, { season, asOf }) {
  if (!Array.isArray(rows) || !stamp(asOf)) throw new Error('NFL Fantasy schedule collection is invalid');
  const byId = new Map();
  for (const row of rows) {
    if (!object(row) || !id(row.id) || !stamp(row.date) || Number(row.season) !== season || !regular(row)
        || !Number.isInteger(Number(row.week)) || Number(row.week) < 1 || Number(row.week) > 18
        || !id(row.home_team?.id) || !id(away(row)?.id) || id(row.home_team.id) === id(away(row).id)) {
      throw new Error('NFL Fantasy schedule has an invalid or wrong-season game');
    }
    const normalized = normalizedGame(row);
    const old = byId.get(String(row.id));
    if (old && JSON.stringify(normalizedGame(old)) !== JSON.stringify(normalized)) {
      throw new Error(`NFL Fantasy schedule conflicts for game ${row.id}`);
    }
    byId.set(String(row.id), row);
  }
  const games = [...byId.values()].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const inProgress = games.filter(game => Date.parse(game.date) <= Date.parse(asOf) && live(game));
  if (inProgress.some(game => Date.parse(asOf) - Date.parse(game.date) > DAY)) {
    throw new Error('NFL Fantasy schedule has a stale in-progress game; previous briefing must be preserved');
  }
  const next = inProgress[0] || games.find(game => currentForecast(game, asOf));
  if (!next) return { season, week: null, games: [], allGames: games, gameIndex: byId, window_start: etDateStr(asOf), window_end: etDateStr(asOf) };
  const selected = games.filter(game => Number(game.week) === Number(next.week));
  const days = selected.map(game => etDateStr(game.date)).sort();
  return { season, week: Number(next.week), games: selected, allGames: games, gameIndex: byId,
    window_start: days[0], window_end: days.at(-1) };
}

/** Full collections are filtered before the last-N limit. A sample only sums
 * a field when every game actually measured it. No absence is made a zero. */
export function buildNflFantasyRecent({ rows, playerId, season, asOf, currentTeamId, limit = 5 }) {
  if (!Array.isArray(rows) || !stamp(asOf)) throw new Error('NFL Fantasy recent sample is malformed');
  const accepted = new Map(), conflicts = new Set();
  let excluded = 0;
  for (const row of rows) {
    const game = row?.game;
    const at = stamp(game?.date || game?.datetime), pid = id(row?.player?.id ?? row?.player_id), gid = id(game?.id);
    if (pid !== String(playerId)) continue;
    if (!gid || !at || Date.parse(at) >= Date.parse(asOf) || !final(game) || !regular(row)
        || Number(game.season) !== season || (row.season != null && Number(row.season) !== season)
        || Date.parse(at) < Date.parse(`${season}-07-01`) || Date.parse(at) >= Date.parse(`${season + 1}-07-01`)) { excluded++; continue; }
    // The per-game team is historical context. A player's current directory
    // team must not silently replace it following a trade or free agency.
    const tid = id(row?.team?.id ?? row?.team_id), homeId = id(game.home_team?.id), awayId = id(away(game)?.id);
    if (tid && homeId && awayId && ![homeId, awayId].includes(tid)) { excluded++; continue; }
    const home = tid && homeId && awayId ? tid === homeId : null;
    const opponent = home === true ? away(game) : home === false ? game.home_team : null;
    const value = { game_id: gid, season, week: Number.isInteger(Number(game.week)) ? Number(game.week) : null,
      date: etDateStr(at), start_at: at, team_id: tid, team: label(row.team), opponent_team_id: id(opponent?.id), opponent: label(opponent), home,
      ...Object.fromEntries(NFL_FANTASY_STAT_FIELDS.map(field => [field, factsNumber(row[field], field)])) };
    if (NFL_FANTASY_STAT_FIELDS.every(field => value[field] == null)) { excluded++; continue; }
    const signature = JSON.stringify(value);
    if (accepted.has(gid) && accepted.get(gid).signature !== signature) conflicts.add(gid);
    else if (!accepted.has(gid)) accepted.set(gid, { value, signature });
  }
  const selected = [...accepted].filter(([gid]) => !conflicts.has(gid)).map(([, value]) => value.value)
    .sort((a, b) => Date.parse(b.start_at) - Date.parse(a.start_at)).slice(0, Math.max(1, Math.min(5, limit)));
  const totals = {}, averages = {}, measured = {};
  for (const field of NFL_FANTASY_STAT_FIELDS) {
    measured[field] = selected.filter(row => row[field] != null).length;
    totals[field] = selected.length && measured[field] === selected.length ? selected.reduce((sum, row) => sum + row[field], 0) : null;
    averages[field] = average(selected, field);
  }
  const sameTeam = selected.length > 0 && selected.every(row => row.team_id != null && row.team_id === String(currentTeamId));
  const comparisons = [];
  if (selected.length >= 4 && sameTeam) {
    const latest = selected.slice(0, 2), previous = selected.slice(2, 5);
    for (const field of ['passing_attempts', 'rushing_attempts', 'receiving_targets', 'receptions']) {
      const a = average(latest, field), b = average(previous, field);
      if (a != null && b != null) comparisons.push({ stat: field, latest_games: latest.length, previous_games: previous.length,
        latest_average: a, previous_average: b, change: round(a - b) });
    }
  }
  const latest = selected[0];
  return { season, season_type: 'regular', cutoff_exclusive: stamp(asOf), sample_games: selected.length, requested_games: 5,
    latest_game_date: latest?.date || null, latest_game_at: latest?.start_at || null,
    days_since_latest_game: latest ? Math.floor((Date.parse(`${etDateStr(asOf)}T12:00:00Z`) - Date.parse(`${latest.date}T12:00:00Z`)) / DAY) : null,
    same_team_entire_sample: sameTeam, rows: selected, totals, averages, measured_games_by_stat: measured,
    latest_two_vs_preceding_games: comparisons, excluded_conflicting_games: conflicts.size, excluded_rows: excluded };
}

function scoringIndex(rows, season) {
  if (!Array.isArray(rows)) throw new Error('NFL Fantasy scoring collection is malformed');
  const byKey = new Map();
  const relevant = new Set([...NFL_FANTASY_STAT_FIELDS, 'passing_two_point_conversions', 'receiving_two_point_conversions', 'rushing_two_point_conversions']);
  for (const row of rows) {
    if (!FORMATS.includes(row.key)) continue;
    if (Number(row.season) !== season || !Array.isArray(row.rules?.items)) throw new Error('NFL Fantasy scoring definition has the wrong season or shape');
    const rules = row.rules.items.filter(rule => relevant.has(rule?.stat)).map(rule => {
      if (numericStat(rule.points) == null || rule.is_reverse === true) throw new Error('NFL Fantasy scoring rule is unsupported');
      const overrides = {};
      for (const pos of NFL_FANTASY_POSITIONS) {
        if (Object.hasOwn(rule.position_points || {}, pos)) {
          if (numericStat(rule.position_points[pos]) == null) throw new Error('NFL Fantasy positional scoring rule is malformed');
          overrides[pos] = Number(rule.position_points[pos]);
        }
      }
      return { stat: rule.stat, points: Number(rule.points), position_points: overrides };
    });
    if (new Set(rules.map(rule => rule.stat)).size !== rules.length) throw new Error('NFL Fantasy scoring has duplicate rules');
    const value = { key: row.key, name: row.name || row.key, season, rules };
    if (byKey.has(row.key) && JSON.stringify(byKey.get(row.key)) !== JSON.stringify(value)) throw new Error('NFL Fantasy scoring definitions conflict');
    byKey.set(row.key, value);
  }
  if (FORMATS.some(format => !byKey.has(format))) throw new Error('NFL Fantasy requires complete standard, half-PPR and PPR scoring definitions');
  return byKey;
}

function ownershipIndex(rows, { season, asOf }) {
  const byPlayer = new Map(), conflicts = new Set();
  for (const row of rows) {
    const pid = id(row?.player?.id);
    if (!pid || Number(row.season) !== season || row.date != null || row.week != null) continue;
    const collected = sourceAge(row.collected_at, asOf, OWNERSHIP_HOURS);
    const market = row.market_updated_at == null ? collected : sourceAge(row.market_updated_at, asOf, OWNERSHIP_HOURS);
    const fresh = collected.fresh && market.fresh;
    const percentage = value => numericStat(value) != null && Number(value) >= 0 && Number(value) <= 100 ? round(value) : null;
    const value = { player_id: pid, name: name(row.player), team_id: id(row.team?.id),
      rostered_percent: fresh ? percentage(row.percent_rostered) : null,
      started_percent: fresh ? percentage(row.percent_started) : null,
      rostered_change: fresh ? round(row.percent_rostered_change) : null,
      collected_at: collected.at, market_updated_at: stamp(row.market_updated_at),
      source_age_hours: market.hours, freshness: fresh ? 'current' : 'unavailable_or_stale',
      average_draft_position: numericStat(row.average_draft_position) };
    const old = byPlayer.get(pid);
    if (old && JSON.stringify(old) !== JSON.stringify(value)) conflicts.add(pid);
    else byPlayer.set(pid, value);
  }
  for (const pid of conflicts) byPlayer.delete(pid);
  return byPlayer;
}

function projectionCandidates(rows, { weekContext, asOf, ownership, coverage }) {
  const byPlayer = new Map(), conflicts = new Set();
  for (const row of rows) {
    const pid = id(row?.player?.id), tid = id(row?.team?.id), pos = String(row?.position || position(row?.player)).toUpperCase();
    const game = weekContext.gameIndex.get(id(row?.game?.id));
    const collected = sourceAge(row?.collected_at, asOf, FORECAST_HOURS);
    if (!pid || !tid || !name(row.player) || !NFL_FANTASY_POSITIONS.includes(pos)
        || Number(row.season) !== weekContext.season || Number(row.week) !== weekContext.week || row.date != null
        || Number(row.projected_games) !== 1 || !game || Number(game.week) !== weekContext.week
        || Number(row.game.season) !== weekContext.season || Number(row.game.week) !== weekContext.week
        || !regular(row.game) || stamp(row.game.date) !== stamp(game.date)
        || id(row.game.home_team?.id) !== id(game.home_team?.id) || id(away(row.game)?.id) !== id(away(game)?.id)
        || ![id(game.home_team?.id), id(away(game)?.id)].includes(tid)) { coverage.excluded_projection_conflicts++; continue; }
    if (!currentForecast(game, asOf) || !currentForecast(row.game, asOf)) { coverage.excluded_closed_games++; continue; }
    if (!collected.fresh) { coverage.excluded_stale_projections++; continue; }
    const points = {}, seen = new Set();
    let invalid = false;
    for (const item of Array.isArray(row.projections) ? row.projections : []) {
      const format = item?.key || (typeof item?.scoring_format === 'string' ? item.scoring_format : item?.scoring_format?.key);
      if (!FORMATS.includes(format)) continue;
      if (seen.has(format) || numericStat(item.total_points) == null) { invalid = true; break; }
      seen.add(format); points[format] = round(item.total_points);
    }
    if (invalid || FORMATS.some(format => points[format] == null)) { coverage.excluded_projection_conflicts++; continue; }
    if (!FORMATS.some(format => points[format] > 0)) { coverage.excluded_no_projected_opportunity++; continue; }
    let rostered = ownership.get(pid);
    if (rostered && (rostered.team_id !== tid || key(rostered.name) !== key(name(row.player)))) rostered = null;
    const home = tid === id(game.home_team.id), opponent = home ? away(game) : game.home_team;
    const c = { id: `bdl:${pid}`, player_id: pid, player_name: name(row.player), name: name(row.player), team_id: tid,
      team: label(row.team), position: pos, role: ROLES[pos], experience: row.player.experience || null,
      context: { opportunities: [{ game_id: String(game.id), date: etDateStr(game.date), start_at: stamp(game.date), season: weekContext.season,
        week: weekContext.week, home, opponent: label(opponent), opponent_team_id: id(opponent?.id) }] },
      availability: { rostered_percent: rostered?.rostered_percent ?? null, league_available: null },
      evidence: [], limitations: ['Your roster, league availability, lineup slots and custom scoring bonuses are not supplied.',
        'Provider forecasts are estimates; a scheduled team game does not confirm this player\'s starting role or playing time.'],
      _projection: { season: weekContext.season, week: weekContext.week, game_id: String(game.id), game_date: etDateStr(game.date),
        opponent: label(opponent), projected_games: 1, collected_at: collected.at, source_age_hours: collected.hours,
        stats: Object.fromEntries(NFL_FANTASY_STAT_FIELDS.map(field => [field, factsNumber(row.stats?.[field], field, true)])),
        format_points: points, ppr_difference_from_standard: round(points.ppr - points.standard), half_ppr_difference_from_standard: round(points.half_ppr - points.standard) },
      _ownership: rostered || null,
    };
    const signature = JSON.stringify(c);
    if (byPlayer.has(pid) && byPlayer.get(pid).signature !== signature) conflicts.add(pid);
    else if (!byPlayer.has(pid)) byPlayer.set(pid, { candidate: c, signature });
  }
  coverage.excluded_projection_conflicts += conflicts.size;
  return [...byPlayer].filter(([pid]) => !conflicts.has(pid)).map(([, value]) => value.candidate);
}

/** Discovery reserves room for each football position, less-rostered players
 * and first-season listings. No selection bucket becomes a verdict. */
export function selectNflFantasyCandidates(pool, max = MAX_CANDIDATES) {
  const used = new Set(), teamCounts = new Map(), posCounts = new Map(), out = [];
  const size = Math.max(1, Math.min(MAX_CANDIDATES, max)), perPosition = Math.ceil(size / 4);
  const ordered = [...pool].sort((a, b) => (b._projection?.format_points?.ppr ?? -Infinity) - (a._projection?.format_points?.ppr ?? -Infinity)
    || a.context.opportunities[0].start_at.localeCompare(b.context.opportunities[0].start_at) || a.id.localeCompare(b.id));
  const pools = new Map(NFL_FANTASY_POSITIONS.map(pos => {
    const all = ordered.filter(c => c.position === pos);
    return [pos, [all.filter(c => c.availability.rostered_percent != null && c.availability.rostered_percent < 50),
      all.filter(c => firstSeason(c.experience)),
      all.filter(c => c._ownership?.started_percent != null && c._ownership.started_percent < 65), all]];
  }));
  for (let cycle = 0; cycle < MAX_CANDIDATES && out.length < size; cycle++) {
    let added = false;
    for (const pos of NFL_FANTASY_POSITIONS) {
      if (out.length >= size || (posCounts.get(pos) || 0) >= perPosition) continue;
      const lanes = pools.get(pos), preferred = [lanes[cycle % lanes.length], ...lanes];
      const candidate = preferred.flat().find(c => !used.has(c.id) && (teamCounts.get(c.team_id) || 0) < 3);
      if (!candidate) continue;
      out.push(candidate); used.add(candidate.id); added = true;
      teamCounts.set(candidate.team_id, (teamCounts.get(candidate.team_id) || 0) + 1);
      posCounts.set(pos, (posCounts.get(pos) || 0) + 1);
    }
    if (!added) break;
  }
  // A small Monday slate may not fill every position's reservation. Redistribute
  // unused places without manufacturing missing-position candidates.
  for (const c of ordered) {
    if (out.length >= size) break;
    if (!used.has(c.id) && (teamCounts.get(c.team_id) || 0) < 3) {
      out.push(c); used.add(c.id); teamCounts.set(c.team_id, (teamCounts.get(c.team_id) || 0) + 1);
    }
  }
  return out;
}

function recentSummary(facts, pos, baseline) {
  const scope = baseline ? `${facts.season} regular-season baseline` : `${facts.season} regular season`;
  if (!facts.sample_games) return `${scope}: no completed player game rows returned before this briefing. Missing observations are not zero production.`;
  const labels = pos === 'QB' ? [['passing_yards', 'passing yards'], ['passing_attempts', 'pass attempts'], ['rushing_attempts', 'carries']]
    : pos === 'RB' ? [['rushing_attempts', 'carries'], ['receiving_targets', 'targets'], ['receptions', 'receptions']]
      : [['receiving_targets', 'targets'], ['receptions', 'receptions'], ['receiving_yards', 'receiving yards']];
  const metrics = labels.filter(([field]) => facts.averages[field] != null).map(([field, label]) => `${facts.averages[field]} ${label} per observed game`).join(', ');
  return `${scope}: ${facts.sample_games} observed games, ${facts.rows.at(-1).date} through ${facts.latest_game_date}.${metrics ? ` ${metrics}.` : ' Complete usage measurements are unavailable.'} Latest observation ${facts.days_since_latest_game} days before this briefing.${baseline ? ' This is not current role or current form.' : ''}${!facts.same_team_entire_sample ? ' The sample does not all belong to the current team.' : ''}`;
}

// A single table preserves measured counts, totals and averages without
// repeating every stat key three times. Empty samples carry no measurements;
// their explicit sample_games=0 must not become zero-valued production.
function recentEvidenceFacts(recent) {
  const { totals, averages, measured_games_by_stat, ...facts } = recent;
  return { ...facts, measurements: recent.sample_games ? NFL_FANTASY_STAT_FIELDS.map(stat => ({ stat,
    measured_games: measured_games_by_stat[stat], total: totals[stat], average: averages[stat] })) : [] };
}

export async function buildNflFantasyEvidence(ctx = {}, options = {}) {
  const date = ctx.date, asOf = stamp(ctx.as_of || options.asOf || options.now || new Date().toISOString());
  if (!dateValid(date) || !asOf || etDateStr(asOf) !== date) throw new Error('NFL Fantasy requires a matching publication date and as-of timestamp');
  const provider = ctx.provider || ctx.nflProvider || options.provider;
  const required = ['schedule', 'ownership', 'projections', 'scoringFormats', 'players', 'playerStats'];
  if (!provider || required.some(method => typeof provider[method] !== 'function')) throw new Error('NFL Fantasy requires its strict provider adapter');
  const signal = options.signal || ctx.signal;
  signal?.throwIfAborted();
  // January regular-season games belong to the preceding NFL season. From
  // spring onward a newly released schedule belongs to the coming season.
  const month = Number(date.slice(5, 7)), calendarYear = Number(date.slice(0, 4));
  const season = ctx.season == null ? (month <= 2 ? calendarYear - 1 : calendarYear) : Number(ctx.season);
  if (!Number.isInteger(season) || season < 2002 || season > 2200) throw new Error('Invalid NFL Fantasy season');
  const max = Number.isInteger(options.maxCandidates) ? Math.max(1, Math.min(MAX_CANDIDATES, options.maxCandidates)) : MAX_CANDIDATES;
  const coverage = { complete: true, candidate_limit: max, season, week: null, schedule_games: 0, week_games: 0,
    candidates_available: 0, candidates_selected: 0, candidates_by_position: {}, first_season_listings: 0,
    projections_returned: 0, ownership_returned: 0, excluded_projection_conflicts: 0, excluded_stale_projections: 0,
    excluded_closed_games: 0, excluded_no_projected_opportunity: 0, excluded_identity_conflicts: 0,
    stale_or_missing_ownership: 0, current_sample_players: 0, prior_baseline_players: 0,
    requests_attempted: 0, requests_succeeded: 0, mandatory_requests_failed: 0, sources_failed: [],
    selection: 'balanced_positions_with_rostered_context_and_first_season_coverage',
    projection_freshness_hours: FORECAST_HOURS, ownership_freshness_hours: OWNERSHIP_HOURS };
  const result = { date, league: 'nfl', season, as_of: asOf, week: null, window_start: date, window_end: date, candidates: [], coverage };
  const read = async (label, fn) => {
    coverage.requests_attempted++;
    try {
      signal?.throwIfAborted();
      const rows = await fn();
      signal?.throwIfAborted();
      if (!Array.isArray(rows) || rows.some(row => !object(row))) throw new Error('Malformed collection');
      coverage.requests_succeeded++;
      return rows;
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      coverage.complete = false; coverage.mandatory_requests_failed++; coverage.sources_failed.push(label);
      throw new Error(`NFL Fantasy ${label} collection failed; previous briefing must be preserved`);
    }
  };
  const diagnostics = () => {
    if (typeof provider.diagnostics === 'function') coverage.transport = provider.diagnostics();
    return result;
  };
  const rawSchedule = await read('regular-season schedule', () => provider.schedule({ season, signal }));
  const weekContext = resolveNflFantasyWeek(rawSchedule, { season, asOf });
  Object.assign(result, { week: weekContext.week, window_start: weekContext.window_start, window_end: weekContext.window_end });
  Object.assign(coverage, { week: weekContext.week, schedule_games: weekContext.allGames.length, week_games: weekContext.games.length });
  if (!weekContext.week) { coverage.state = 'no_upcoming_regular_season_week'; return diagnostics(); }
  const [rawOwnership, rawProjections, rawFormats] = await Promise.all([
    read('ownership', () => provider.ownership({ season, signal })),
    read('weekly projections', () => provider.projections({ season, week: weekContext.week, signal })),
    read('scoring definitions', () => provider.scoringFormats({ season, signal })),
  ]);
  const formats = scoringIndex(rawFormats, season);
  result.scoring_formats = [...formats.values()];
  result.scoring_scope = 'Provider standard, half-PPR and PPR definitions; personal custom bonuses and roster slots are unknown.';
  coverage.projections_returned = rawProjections.length; coverage.ownership_returned = rawOwnership.length;
  const ownership = ownershipIndex(rawOwnership, { season, asOf });
  const pool = projectionCandidates(rawProjections, { weekContext, asOf, ownership, coverage });
  coverage.candidates_available = pool.length;
  if (!pool.length) {
    if (!rawProjections.length || coverage.excluded_projection_conflicts || coverage.excluded_stale_projections
        || weekContext.games.some(game => currentForecast(game, asOf))) {
      throw new Error('NFL Fantasy has no current, schedule-verified projections; previous briefing must be preserved');
    }
    coverage.state = 'no_remaining_projected_opportunities';
    return diagnostics();
  }
  const chosen = selectNflFantasyCandidates(pool, max), playerIds = chosen.map(c => c.player_id);
  const [headers, currentRows] = await Promise.all([
    read('current player identities', () => provider.players({ playerIds, signal })),
    read('current regular-season game stats', () => provider.playerStats({ season, playerIds, signal })),
  ]);
  const identityIndex = new Map(), conflictingHeaders = new Set();
  for (const header of headers) {
    const pid = id(header?.id);
    if (!pid) continue;
    const identity = { player_id: pid, player_name: name(header), team_id: id(header?.team?.id), position: position(header), experience: header.experience || null };
    if (identityIndex.has(pid) && JSON.stringify(identityIndex.get(pid)) !== JSON.stringify(identity)) conflictingHeaders.add(pid);
    else identityIndex.set(pid, identity);
  }
  const selected = chosen.filter(c => {
    const header = identityIndex.get(c.player_id);
    const valid = header && !conflictingHeaders.has(c.player_id) && key(header.player_name) === key(c.player_name)
      && header.team_id === c.team_id && header.position === c.position;
    if (!valid) coverage.excluded_identity_conflicts++;
    else c.experience = header.experience || c.experience;
    return valid;
  });
  if (!selected.length) throw new Error('NFL Fantasy current player identities could not be verified');
  const sourceDeadlines = selected.flatMap(c => [Date.parse(c._projection.collected_at) + FORECAST_HOURS * HOUR,
    ...(c._ownership?.freshness === 'current'
      ? [c._ownership.collected_at, c._ownership.market_updated_at].filter(Boolean).map(at => Date.parse(at) + OWNERSHIP_HOURS * HOUR) : [])]);
  // Repeated collection cannot extend the life of an aging forecast. The
  // shared writer also bounds its serving TTL by this provider deadline.
  result.valid_until = new Date(Math.min(...sourceDeadlines)).toISOString();
  const recentById = new Map(selected.map(c => [c.player_id, buildNflFantasyRecent({ rows: currentRows, playerId: c.player_id, season, asOf, currentTeamId: c.team_id })]));
  const baselineIds = selected.filter(c => recentById.get(c.player_id).sample_games === 0 && !firstSeason(c.experience)).map(c => c.player_id);
  const priorRows = baselineIds.length ? await read('prior regular-season game stats', () => provider.playerStats({ season: season - 1, playerIds: baselineIds, signal })) : [];
  const sameTeamCandidates = new Map();
  for (const c of selected) {
    const group = sameTeamCandidates.get(c.team_id) || [];
    group.push(c); sameTeamCandidates.set(c.team_id, group);
  }
  for (const c of selected) {
    signal?.throwIfAborted();
    const add = (eid, title, source, facts, summary) => c.evidence.push({ id: eid, label: title, source, observed_at: asOf, summary, facts });
    const opportunity = c.context.opportunities[0], forecast = c._projection, recent = recentById.get(c.player_id);
    const currentHeader = identityIndex.get(c.player_id);
    c.experience = currentHeader.experience || c.experience;
    add('scheduled_matchup', `Week ${result.week} scheduled game`, 'BALLDONTLIE regular-season schedule and weekly game identity',
      { season, week: result.week, opportunities: c.context.opportunities, current_team_verified: true, listed_experience: c.experience,
        confirmed_player_start: false, league_lineup_lock_known: false },
      `${c.team} ${opportunity.home ? 'hosts' : 'visits'} ${opportunity.opponent} on ${opportunity.date}, kickoff ${opportunity.start_at}. This is a team schedule, not confirmation of this player's starting role.`);
    const perFormat = FORMATS.map(format => {
      const receptionRule = formats.get(format).rules.find(rule => rule.stat === 'receptions');
      return { format, projected_points: forecast.format_points[format],
        reception_points_per_catch: receptionRule ? receptionRule.position_points[c.position] ?? receptionRule.points : null,
        reception_rule_present: !!receptionRule };
    });
    const projectedMetrics = (c.position === 'QB' ? [['passing_yards', 'passing yards'], ['rushing_attempts', 'carries']]
      : c.position === 'RB' ? [['rushing_attempts', 'carries'], ['receptions', 'receptions']]
        : [['receptions', 'receptions'], ['receiving_yards', 'receiving yards']])
      .filter(([field]) => forecast.stats[field] != null).map(([field, label]) => `${forecast.stats[field]} ${label}`).join(', ');
    add('weekly_projection', `Week ${result.week} forecast by scoring format`, 'BALLDONTLIE weekly fantasy projections and season scoring definitions',
      { ...forecast, formats: perFormat, scope: 'Provider estimates for the linked upcoming game, not observed performance.' },
      `Week ${result.week} forecast: ${forecast.format_points.standard} Standard, ${forecast.format_points.half_ppr} Half PPR, ${forecast.format_points.ppr} PPR points.${projectedMetrics ? ` Projected ${projectedMetrics}.` : ''} Collected ${forecast.collected_at}. These are provider estimates, not Gary's point prediction.`);
    if (c._ownership) {
      const owner = c._ownership;
      add('provider_ownership', 'Provider rostered context', 'BALLDONTLIE fantasy ownership',
        { season, rostered_percent: owner.rostered_percent, started_percent: owner.started_percent, rostered_change: owner.rostered_change,
          collected_at: owner.collected_at, market_updated_at: owner.market_updated_at, source_age_hours: owner.source_age_hours,
          freshness: owner.freshness, league_available: null, source_population: 'Provider aggregate; specific host population is not documented.' },
        owner.rostered_percent != null ? `${owner.rostered_percent}% rostered in the provider aggregate.${owner.started_percent != null ? ` ${owner.started_percent}% started.` : ''} Market updated ${owner.market_updated_at || 'time unavailable'}; collected ${owner.collected_at}. Availability in your league is unknown.`
          : 'Provider ownership is missing or outside the accepted freshness window. Current rostered share and your league availability are unknown.');
    }
    if (c.availability.rostered_percent == null) { coverage.stale_or_missing_ownership++; c.limitations.push('Current provider ownership is unavailable; no claim is made that this player is on waivers.'); }
    add('current_regular_games', `${season} observed regular-season games`, 'BALLDONTLIE dated final player game stats',
      { ...recentEvidenceFacts(recent), evidence_scope: 'current_season' }, recentSummary(recent, c.position, false));
    if (recent.sample_games) coverage.current_sample_players++;
    else c.limitations.push(`No completed ${season} regular-season player observations were returned; the current-week information is a projection.`);
    if (recent.excluded_conflicting_games) c.limitations.push(`${recent.excluded_conflicting_games} conflicting current-season game records were excluded.`);
    if (baselineIds.includes(c.player_id)) {
      const baseline = buildNflFantasyRecent({ rows: priorRows, playerId: c.player_id, season: season - 1, asOf, currentTeamId: c.team_id });
      if (baseline.sample_games) {
        coverage.prior_baseline_players++;
        add('prior_regular_baseline', `${season - 1} regular-season baseline`, 'BALLDONTLIE dated final player game stats',
          { ...recentEvidenceFacts(baseline), evidence_scope: 'prior_season_baseline', scope: 'Historical performance only; does not establish current role, team usage or form.' }, recentSummary(baseline, c.position, true));
      } else c.limitations.push(`No verified ${season - 1} regular-season baseline was returned for this player.`);
    }
    const nextGames = weekContext.allGames.filter(game => currentForecast(game, asOf)
      && Number(game.week) >= result.week && Number(game.week) <= result.week + 2
      && [id(game.home_team?.id), id(away(game)?.id)].includes(c.team_id)).slice(0, 3).map(game => {
      const home = id(game.home_team.id) === c.team_id;
      return { game_id: String(game.id), week: Number(game.week), date: etDateStr(game.date), start_at: stamp(game.date), home, opponent: label(home ? away(game) : game.home_team) };
    });
    add('upcoming_schedule', 'This game and the next scheduled opportunities', 'BALLDONTLIE regular-season schedule',
      { season, games: nextGames, missing_week_is_not_a_verified_bye: true, scope: 'Schedule context only; no opponent strength or role forecast is inferred.' },
      nextGames.map(game => `Week ${game.week}: ${game.date} ${game.home ? 'vs' : 'at'} ${game.opponent}`).join('; ') + '. Missing weeks are not labeled as byes.');
    const peers = (sameTeamCandidates.get(c.team_id) || []).filter(peer => peer.player_id !== c.player_id && peer.position === c.position)
      .map(peer => ({ candidate: peer, recent: recentById.get(peer.player_id) }))
      .filter(({ recent: sample }) => sample.sample_games > 0 && sample.same_team_entire_sample);
    if (recent.sample_games && recent.same_team_entire_sample && peers.length) {
      const comparisons = [{ candidate: c, recent }, ...peers].map(({ candidate: peer, recent: sample }) => ({ player_id: peer.player_id, player_name: peer.player_name,
        position: peer.position, sample_games: sample.sample_games, latest_game_date: sample.latest_game_date,
        carries_per_game: sample.averages.rushing_attempts, targets_per_game: sample.averages.receiving_targets, receptions_per_game: sample.averages.receptions }));
      add('selected_teammate_samples', 'Selected teammates in the same position', 'BALLDONTLIE current-season final player game stats',
        { season, team: c.team, players: comparisons, full_position_group: false, scope: 'These are selected same-position players, not the full team; do not calculate team shares.' },
        comparisons.map(row => `${row.player_name}: ${row.sample_games} games through ${row.latest_game_date}${row.carries_per_game != null ? `, ${row.carries_per_game} carries/game` : ''}${row.targets_per_game != null ? `, ${row.targets_per_game} targets/game` : ''}`).join('; ') + '. Selected players only, not a complete team denominator.');
    }
    delete c._projection; delete c._ownership;
    c.limitations = [...new Set(c.limitations)];
    result.candidates.push(c);
    coverage.candidates_by_position[c.position] = (coverage.candidates_by_position[c.position] || 0) + 1;
    if (firstSeason(c.experience)) coverage.first_season_listings++;
  }
  coverage.candidates_selected = result.candidates.length;
  coverage.state = 'current_week_evidence';
  return diagnostics();
}
