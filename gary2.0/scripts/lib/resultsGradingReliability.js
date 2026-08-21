const clean = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

const finiteNumber = (value) => {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const cleanText = (value) => {
  const text = String(value ?? '').trim();
  return text || null;
};

/** nfl_results.confidence is an integer percentage in the deployed schema. */
export function nflResultConfidence(value) {
  const confidence = finiteNumber(value);
  if (confidence == null || confidence < 0 || confidence > 100) return null;
  return confidence <= 1
    ? Math.round(confidence * 100)
    : Math.round(confidence);
}

/**
 * Build the canonical nfl_results write shape from the weekly ledger row, its
 * stored pick, and the exact provider final. The weekly row owns season/week;
 * the immutable pick owns teams/confidence; `homeScore`/`awayScore` are already
 * aligned to those stored teams by the grader's exact-game matcher.
 *
 * Both inserts and idempotent updates use this helper so a previously sparse
 * result row self-repairs without changing its identity or graded result.
 */
export function buildNflResultWritePayload({
  mode = 'insert',
  weeklyRow = {},
  pick = {},
  nflPickId = null,
  gameDate = null,
  gameId = null,
  result = null,
  homeScore = null,
  awayScore = null,
  isWinnersPick = false,
  updatedAt = null,
  seasonType = null,
} = {}) {
  const season = finiteNumber(weeklyRow?.season ?? pick?.season);
  const weekNumber = finiteNumber(weeklyRow?.week_number ?? pick?.week_number ?? pick?.week);
  // 1=preseason, 2=regular, 3=postseason (BDL numbering). Preseason rows are
  // excluded from every Gary record surface, so the stamp must ride both
  // inserts and idempotent updates.
  const normalizedSeasonType = [1, 2, 3].includes(Number(seasonType)) ? Number(seasonType) : null;
  const confidence = nflResultConfidence(pick?.confidence);
  const normalizedHomeScore = finiteNumber(homeScore);
  const normalizedAwayScore = finiteNumber(awayScore);
  const homeTeam = cleanText(pick?.homeTeam ?? pick?.home_team);
  const awayTeam = cleanText(pick?.awayTeam ?? pick?.away_team);
  const normalizedGameId = cleanText(gameId);

  const shared = {
    result,
    final_score: normalizedAwayScore != null && normalizedHomeScore != null
      ? `${normalizedAwayScore}-${normalizedHomeScore}`
      : null,
    season,
    week_number: weekNumber,
    confidence,
    home_team: homeTeam,
    away_team: awayTeam,
    home_score: normalizedHomeScore,
    away_score: normalizedAwayScore,
    is_winners_pick: isWinnersPick,
    ...(normalizedGameId ? { game_id: normalizedGameId } : {}),
    ...(normalizedSeasonType != null ? { season_type: normalizedSeasonType } : {}),
  };

  if (mode === 'update') {
    return {
      ...shared,
      updated_at: updatedAt || new Date().toISOString(),
    };
  }

  return {
    nfl_pick_id: nflPickId,
    game_date: gameDate,
    pick_text: pick?.pick ?? null,
    matchup: homeTeam && awayTeam ? `${awayTeam} @ ${homeTeam}` : null,
    ...shared,
  };
}

/**
 * Return only provider lanes that have stored props in this run. `MLB HR`
 * shares MLB data sources. An explicit settlement filter is an intersection,
 * so a football-only pass can never open MLB/NBA/NHL and a normal MLB-only pass
 * can never probe off-season or unauthorized sources.
 */
export function requiredPropSourceSports(storedPicks = [], allowedSports = null) {
  const allowed = allowedSports == null
    ? null
    : new Set([...allowedSports].map((sport) => String(sport).trim().toUpperCase()));
  const required = new Set();

  for (const pick of storedPicks || []) {
    const storedSport = String(pick?.sport ?? '').trim().toUpperCase();
    const sourceSport = storedSport === 'MLB HR' ? 'MLB' : storedSport;
    if (!sourceSport || (allowed && !allowed.has(sourceSport))) continue;
    required.add(sourceSport);
  }

  return required;
}

/**
 * Grade a point-spread selection once the picked side has been resolved.
 * Football books legitimately post half-point pick'em lines (+0.5/-0.5),
 * signed zero, and PK/pick'em text; none of those may fall through to the
 * moneyline grader.
 */
export function gradeGameSpread(pickText, side, homeScore, awayScore) {
  const text = String(pickText ?? '');
  const numeric = text.match(/([+-](?:0|[1-9]\d{0,1})(?:\.\d+)?)(?![\d.])/);
  const pickEm = /\b(?:pk|pick\s*['’]?\s*em)\b/i.test(text);
  if (!numeric && !pickEm) return null;
  if (!['home', 'away'].includes(side)) return null;

  const spread = numeric ? Number(numeric[1]) : 0;
  const home = Number(homeScore);
  const away = Number(awayScore);
  if (![spread, home, away].every(Number.isFinite)) return null;

  const margin = side === 'home' ? home - away : away - home;
  const covered = margin + spread;
  if (covered === 0) return 'push';
  return covered > 0 ? 'won' : 'lost';
}

/**
 * Stored props normally use an underscore token followed by the display line
 * (for example `passing_yards 252.5`). Older rows can contain the human label
 * instead. Preserve the complete market token and remove only a trailing line;
 * splitting on the first space turns `passing yards 252.5` into the unusable
 * token `passing`.
 */
export function normalizeStoredPropType(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+[+-]?(?:\d+(?:\.\d+)?|\.\d+)\s*$/, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

const NFL_PROP_TYPE_ALIASES = new Map([
  ['passing_yards', 'passing_yards'],
  ['player_passing_yards', 'passing_yards'],
  ['player_pass_yds', 'passing_yards'],
  ['pass_yds', 'passing_yards'],
  ['rushing_yards', 'rushing_yards'],
  ['player_rushing_yards', 'rushing_yards'],
  ['player_rush_yds', 'rushing_yards'],
  ['rush_yds', 'rushing_yards'],
  ['receiving_yards', 'receiving_yards'],
  ['player_receiving_yards', 'receiving_yards'],
  ['player_reception_yds', 'receiving_yards'],
  ['player_rec_yds', 'receiving_yards'],
  ['rec_yds', 'receiving_yards'],
  ['receptions', 'receptions'],
  ['player_receptions', 'receptions'],
  ['passing_touchdowns', 'passing_touchdowns'],
  ['passing_tds', 'passing_touchdowns'],
  ['player_passing_touchdowns', 'passing_touchdowns'],
  ['player_pass_tds', 'passing_touchdowns'],
  ['pass_tds', 'passing_touchdowns'],
  ['rushing_touchdowns', 'rushing_touchdowns'],
  ['player_rushing_touchdowns', 'rushing_touchdowns'],
  ['player_rush_tds', 'rushing_touchdowns'],
  ['rush_tds', 'rushing_touchdowns'],
  ['receiving_touchdowns', 'receiving_touchdowns'],
  ['player_receiving_touchdowns', 'receiving_touchdowns'],
  ['player_reception_tds', 'receiving_touchdowns'],
  ['player_rec_tds', 'receiving_touchdowns'],
  ['rec_tds', 'receiving_touchdowns'],
  ['anytime_touchdown', 'anytime_touchdown'],
  ['anytime_td', 'anytime_touchdown'],
  ['player_anytime_td', 'anytime_touchdown'],
  ['completions', 'completions'],
  ['passing_completions', 'completions'],
  ['player_completions', 'completions'],
  ['pass_completions', 'completions'],
  ['pass_attempts', 'pass_attempts'],
  ['player_pass_attempts', 'pass_attempts'],
  ['passing_attempts', 'pass_attempts'],
  ['rushing_attempts', 'rushing_attempts'],
  ['rush_attempts', 'rushing_attempts'],
  ['player_rushing_attempts', 'rushing_attempts'],
  ['player_rush_attempts', 'rushing_attempts'],
  ['interceptions', 'interceptions'],
  ['passing_interceptions', 'interceptions'],
  ['pass_interceptions', 'interceptions'],
  ['player_pass_interceptions', 'interceptions'],
  ['player_interceptions', 'interceptions'],
  ['longest_completion', 'longest_completion'],
  ['longest_pass', 'longest_completion'],
  ['player_longest_completion', 'longest_completion'],
  ['player_longest_pass', 'longest_completion'],
  ['longest_rush', 'longest_rush'],
  ['player_longest_rush', 'longest_rush'],
  ['longest_reception', 'longest_reception'],
  ['player_longest_reception', 'longest_reception'],
  ['rushing_receiving_yards', 'rushing_receiving_yards'],
  ['player_rushing_receiving_yards', 'rushing_receiving_yards'],
  ['rush_reception_yds', 'rushing_receiving_yards'],
  ['player_rush_reception_yds', 'rushing_receiving_yards'],
  ['rush_rec_yds', 'rushing_receiving_yards'],
  ['passing_rushing_yards', 'passing_rushing_yards'],
  ['player_passing_rushing_yards', 'passing_rushing_yards'],
  ['pass_rush_yds', 'passing_rushing_yards'],
  ['yards', 'total_yards'],
  ['total_yards', 'total_yards'],
  ['player_total_yards', 'total_yards'],
]);

export function canonicalNFLPropType(value) {
  return NFL_PROP_TYPE_ALIASES.get(normalizeStoredPropType(value)) ?? null;
}

function finiteStat(row, ...fields) {
  for (const field of fields) {
    const value = Number(row?.[field]);
    if (row?.[field] != null && Number.isFinite(value)) return value;
  }
  return null;
}

function statOrZero(row, ...fields) {
  return finiteStat(row, ...fields) ?? 0;
}

function sameNFLTeam(left, right) {
  const leftId = left?.team?.id ?? left?.team_id;
  const rightId = right?.team?.id ?? right?.team_id;
  if (leftId != null && rightId != null) return String(leftId) === String(rightId);
  const leftKey = left?.team?.abbreviation ?? left?.team?.full_name ?? left?.team?.name;
  const rightKey = right?.team?.abbreviation ?? right?.team?.full_name ?? right?.team?.name;
  return leftKey != null && rightKey != null && clean(leftKey) === clean(rightKey);
}

/**
 * Deterministic NFL box-score extraction for every market the NFL prop desk is
 * authorized to publish. `allRows` must already be scoped to the prop's exact
 * game. Longest completion is the longest reception by the passer's team when
 * the provider does not repeat that derived value on the quarterback row.
 */
export function nflActualFromStatRow(row, propType, allRows = []) {
  if (!row) return null;
  const type = canonicalNFLPropType(propType);
  if (!type) return null;

  switch (type) {
    case 'passing_yards':
      return statOrZero(row, 'passing_yards');
    case 'rushing_yards':
      return statOrZero(row, 'rushing_yards');
    case 'receiving_yards':
      return statOrZero(row, 'receiving_yards');
    case 'receptions':
      return statOrZero(row, 'receptions');
    case 'passing_touchdowns':
      return statOrZero(row, 'passing_touchdowns');
    case 'rushing_touchdowns':
      return statOrZero(row, 'rushing_touchdowns');
    case 'receiving_touchdowns':
      return statOrZero(row, 'receiving_touchdowns');
    case 'anytime_touchdown':
      return [
        'rushing_touchdowns',
        'receiving_touchdowns',
        'fumbles_touchdowns',
        'interception_touchdowns',
        'kick_return_touchdowns',
        'punt_return_touchdowns',
      ].reduce((total, field) => total + statOrZero(row, field), 0);
    case 'completions':
      return statOrZero(row, 'passing_completions');
    case 'pass_attempts':
      return statOrZero(row, 'passing_attempts');
    case 'rushing_attempts':
      return statOrZero(row, 'rushing_attempts');
    case 'interceptions':
      return statOrZero(row, 'passing_interceptions');
    case 'longest_rush':
      return statOrZero(row, 'long_rushing', 'rushing_long', 'longest_rush');
    case 'longest_reception':
      return statOrZero(row, 'long_reception', 'receiving_long', 'longest_reception');
    case 'longest_completion': {
      const direct = finiteStat(row, 'longest_completion', 'passing_long', 'long_passing');
      if (direct != null) return direct;
      const teammateLongs = (allRows || [])
        .filter((candidate) => sameNFLTeam(candidate, row))
        .map((candidate) => finiteStat(candidate, 'long_reception', 'receiving_long', 'longest_reception'))
        .filter((value) => value != null);
      return teammateLongs.length ? Math.max(...teammateLongs) : 0;
    }
    case 'rushing_receiving_yards':
      return statOrZero(row, 'rushing_yards') + statOrZero(row, 'receiving_yards');
    case 'passing_rushing_yards':
      return statOrZero(row, 'passing_yards') + statOrZero(row, 'rushing_yards');
    case 'total_yards':
      return statOrZero(row, 'passing_yards')
        + statOrZero(row, 'rushing_yards')
        + statOrZero(row, 'receiving_yards');
    default:
      return null;
  }
}

/**
 * BDL's NFL stats endpoint defaults to regular-season rows even when an exact
 * preseason game id is supplied. The games response does not currently echo
 * `season_type`, so infer the only ambiguous case from the kickoff month while
 * honoring explicit/provider postseason metadata whenever it is present.
 */
export function nflSeasonTypeForGame(game) {
  const explicit = Number(game?.season_type ?? game?.seasonType);
  if ([1, 2, 3].includes(explicit)) return explicit;
  if (game?.postseason === true || String(game?.postseason).toLowerCase() === 'true') return 3;

  const rawDate = game?.date ?? game?.datetime ?? game?.commence_time ?? game?.start_time_utc;
  const instant = new Date(rawDate);
  if (!Number.isNaN(instant.getTime())) {
    const month = Number(new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      month: 'numeric',
    }).format(instant));
    if (month === 7 || month === 8) return 1;
  }
  return 2;
}

/** Numeric over/under props push on an exact tie; binary TD sides do not. */
export function gradePropResult(actual, line, bet) {
  const actualValue = Number(actual);
  const lineValue = Number(line);
  const side = clean(bet);
  if (!Number.isFinite(actualValue)) return null;

  if (side === 'yes' || side === 'anytime') return actualValue >= 1 ? 'won' : 'lost';
  if (side === 'no') return actualValue < 1 ? 'won' : 'lost';
  if (!Number.isFinite(lineValue) || !['over', 'under'].includes(side)) return null;
  if (actualValue === lineValue) return 'push';
  if (side === 'over') return actualValue > lineValue ? 'won' : 'lost';
  return actualValue < lineValue ? 'won' : 'lost';
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

/** Build the machine-readable outcome emitted by the narrow cloud grader. */
export function buildFootballSettlementOutcome(date, lanes) {
  const normalizedLanes = Object.fromEntries(Object.entries(lanes || {}).map(([name, lane]) => [name, {
    candidates: nonNegativeInteger(lane?.candidates),
    final_eligible: nonNegativeInteger(lane?.finalEligible),
    persisted: nonNegativeInteger(lane?.persisted),
    readback: nonNegativeInteger(lane?.readBack),
    pending_non_final: nonNegativeInteger(lane?.pendingNonFinal),
    invalid_identity: nonNegativeInteger(lane?.invalidIdentity),
    unmatched: nonNegativeInteger(lane?.unmatched),
    unresolved_final: nonNegativeInteger(lane?.unresolvedFinal),
    wins: nonNegativeInteger(lane?.w),
    losses: nonNegativeInteger(lane?.l),
    pushes: nonNegativeInteger(lane?.p),
    errors: Array.isArray(lane?.errors) ? lane.errors.map(String) : [],
  }]));

  const totals = Object.values(normalizedLanes).reduce((sum, lane) => {
    for (const key of [
      'candidates',
      'final_eligible',
      'persisted',
      'readback',
      'pending_non_final',
      'invalid_identity',
      'unmatched',
      'unresolved_final',
      'wins',
      'losses',
      'pushes',
    ]) sum[key] += lane[key];
    sum.errors += lane.errors.length;
    return sum;
  }, {
    candidates: 0,
    final_eligible: 0,
    persisted: 0,
    readback: 0,
    pending_non_final: 0,
    invalid_identity: 0,
    unmatched: 0,
    unresolved_final: 0,
    wins: 0,
    losses: 0,
    pushes: 0,
    errors: 0,
  });

  return {
    version: 1,
    date: String(date),
    status: 'ok',
    lanes: normalizedLanes,
    totals,
  };
}

/**
 * A zero-write poll is healthy only when there was no final eligible work.
 * Once a final is seen, every result must be persisted and read back in the
 * same process; malformed identities, unmatched stored picks, or row errors
 * make the workflow fail visibly instead of producing a false-green Action.
 */
export function footballSettlementCoverageFailures(outcome) {
  const failures = [];
  for (const [name, lane] of Object.entries(outcome?.lanes || {})) {
    if (lane.errors.length) failures.push(`${name}: ${lane.errors.join('; ')}`);
    if (lane.invalid_identity) failures.push(`${name}: ${lane.invalid_identity} invalid exact-game identity`);
    if (lane.unmatched) failures.push(`${name}: ${lane.unmatched} stored pick(s) unmatched to provider game`);
    if (lane.unresolved_final) failures.push(`${name}: ${lane.unresolved_final} final pick(s) lacked a deterministic grade`);
    if (lane.persisted !== lane.final_eligible) {
      failures.push(`${name}: persisted ${lane.persisted}/${lane.final_eligible} final eligible result(s)`);
    }
    if (lane.readback !== lane.persisted) {
      failures.push(`${name}: read back ${lane.readback}/${lane.persisted} persisted result(s)`);
    }
  }
  return failures;
}

export function assertFootballSettlementCoverage(outcome) {
  const failures = footballSettlementCoverageFailures(outcome);
  if (!failures.length) return outcome;
  outcome.status = 'failed';
  throw new Error(`Football settlement coverage failed: ${failures.join(' | ')}`);
}

/**
 * BDL final statuses are not limited to the exact string "Final". NFL games,
 * for example, use "Final/OT" for overtime finishes.
 */
export function isFinalGameStatus(status) {
  const normalized = clean(status);
  if (!normalized) return false;

  // Check explicit non-final terminal/interruption labels before the broad
  // final-token match ("postponed" must never be mistaken for "post").
  if (/cancel|postpon|suspend|delay|scheduled|in[ _-]?progress|halftime/.test(normalized)) {
    return false;
  }

  return /(?:^|[^a-z])final(?:[^a-z]|$)/.test(normalized)
    || ['post', 'completed', 'finished', 'closed'].includes(normalized);
}

export function propGameId(prop) {
  const value = prop?.game_id ?? prop?.bdl_game_id ?? null;
  return value == null || String(value).trim() === '' ? null : String(value);
}

/** Game picks use the same two historical provider-id field names as props. */
export function pickGameId(pick) {
  const value = pick?.game_id ?? pick?.bdl_game_id ?? null;
  return value == null || String(value).trim() === '' ? null : String(value);
}

function canonicalLine(line) {
  const number = Number(line);
  return Number.isFinite(number) ? String(number) : clean(line);
}

/**
 * Process-level prop identity. Every dimension is intentional: one player can
 * carry two sides/lines, play twice on one date, or appear in similarly named
 * markets across sports.
 */
export function propResultIdentity({
  gameId,
  sport,
  playerName,
  propType,
  bet,
  line,
  gameDate,
}) {
  return JSON.stringify([
    clean(sport).toUpperCase(),
    gameId == null ? '' : String(gameId),
    clean(playerName),
    clean(propType),
    clean(bet),
    canonicalLine(line),
    clean(gameDate),
  ]);
}

/** Scope a date-wide NFL stat pool to the exact game attached to the prop. */
export function statsForGame(stats, gameId) {
  if (gameId == null) return [];
  const wanted = String(gameId);
  return (stats || []).filter((row) => String(row?._game_id ?? '') === wanted);
}
