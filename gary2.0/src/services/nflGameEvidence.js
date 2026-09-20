import { getPlayLedger, teamLedger } from './nflPlayLedger.js';
import { gradeSplits } from './nflSeasonPhase.js';
import { getPassRushAndCoverage, getQbPressureProfile, getSnapShare, nflverseCode } from './nflverseService.js';
import { fetchNflTeamBaseline } from './nflTeamBaseline.js';

const named = team => team?.full_name || team?.name || null;
const missing = reason => ({ unavailable: true, reason });
const select = (row, keys) => Object.fromEntries(keys.map(key => [key, row?.[key] ?? null]));
const read = async (loader, ...args) => {
  try { return await loader(...args) ?? missing('Source returned no data.'); }
  catch (error) { return missing(error?.message || 'Source unavailable.'); }
};

// Count the games actually contributing to this team's ledger, including games
// without a named passer. Never call a postseason-inclusive ledger "17 games".
function gameSample(ledger, code) {
  const games = new Map();
  let incomplete = !Array.isArray(ledger.games);
  for (const game of ledger.games || []) {
    if (!Object.hasOwn(game?.lines || {}, code) && !Object.hasOwn(game?.starters || {}, code)) continue;
    if (!game.game_id) { incomplete = true; continue; }
    const id = String(game.game_id);
    const phase = ['REG', 'POST', 'PRE'].includes(game.season_type) ? game.season_type : 'UNKNOWN';
    if (games.has(id) && games.get(id) !== phase) { games.set(id, 'UNKNOWN'); incomplete = true; }
    else games.set(id, phase);
  }
  const phases = { regular_season: 0, postseason: 0, preseason: 0, unknown: 0 };
  const phaseNames = { REG: 'regular_season', POST: 'postseason', PRE: 'preseason', UNKNOWN: 'unknown' };
  for (const phase of games.values()) phases[phaseNames[phase]]++;
  const verified = games.size > 0 && !incomplete && phases.unknown === 0;
  return { games: verified ? games.size : null, phases, game_ids: [...games.keys()],
    ...(verified ? {} : { note: 'Complete game count or season-phase provenance unavailable; listed games are the identifiable sample.' }) };
}

function measuredSide(side) {
  if (!side?.overall) return missing('No measured scrimmage-play sample for this unit.');
  const graded = gradeSplits(side);
  return {
    overall: side.overall,
    early_down: graded.splits?.early_down ?? missing('Early-down split unavailable.'),
    red_zone: graded.splits?.red_zone ?? missing('Red-zone split unavailable.'),
    pass_protection_or_rush: select(side, ['dropbacks', 'sacks', 'sack_rate', 'qb_hits', 'qb_hit_rate']),
    formation_and_tempo: select(side, ['pass_rate_over_expected', 'shotgun_rate', 'no_huddle_rate']),
    turnovers: side.turnovers ?? null,
  };
}

function playEvidence(ledger, code, season, prior = false) {
  const source = { source: 'nflverse play-by-play', season };
  if (!code) return { ...source, ...missing('NFL team code could not be resolved.') };
  if (ledger?.unavailable) return { ...source, ...missing(ledger.reason) };
  if (Number(ledger?.season) !== season) return { ...source, ...missing('Returned play ledger does not identify the requested season.') };
  const entry = teamLedger(ledger, code);
  if (!entry) return { ...source, ...missing(`No ${season} play-ledger entry for ${code}; this does not establish that no games were played.`) };
  const sample = gameSample(ledger, code);
  return {
    ...source,
    generated_at: ledger.generated_at ?? null,
    ...(ledger.stale ? { stale: true, stale_reason: ledger.stale_reason ?? 'Source supplied a stale ledger.' } : {}),
    sample,
    ...(prior ? { sample_note: 'Prior-season background; personnel and coaching may differ from the current team.' }
      : sample.games !== null && sample.games <= 3
        ? { sample_note: `Only ${sample.games} game${sample.games === 1 ? '' : 's'} in this current-season sample; every split retains its own snap count.` } : {}),
    offense: measuredSide(entry.offense),
    defense: measuredSide(entry.defense),
  };
}

function aggregateEvidence(baseline) {
  if (!baseline?.stats || baseline.unavailable) return missing(baseline?.reason || baseline?.label || 'Verified team aggregates unavailable.');
  return {
    source: 'Ball Don\'t Lie verified regular-season team totals — all players combined',
    season: baseline.season,
    scope: baseline.scope,
    label: baseline.label,
    games_played: baseline.stats.games_played ?? null,
    current_regular_games_played: baseline.currentRegularGamesPlayed ?? null,
    offense: select(baseline.stats, ['total_points_per_game', 'total_offensive_yards_per_game',
      'passing_yards_per_game', 'rushing_yards_per_game', 'misc_third_down_conv_pct']),
    defense: select(baseline.stats, ['opp_total_points_per_game', 'opp_total_offensive_yards_per_game',
      'opp_passing_yards_per_game', 'opp_rushing_yards_per_game', 'opp_passing_qb_rating',
      'opp_yards_per_pass_attempt', 'opp_net_yards_per_pass_attempt', 'opp_misc_third_down_conv_pct',
      'opp_passing_touchdowns', 'opp_rushing_touchdowns', 'misc_total_takeaways']),
  };
}

function chartingEvidence(result, season, kind) {
  const source = { source: 'Pro Football Reference charting via nflverse', season,
    season_phase: 'Not supplied by charting helper; do not assume the play-ledger phase counts apply.' };
  if (result?.unavailable) return { ...source, ...missing(result.reason) };
  if (Number(result?.season) !== season) return { ...source, ...missing('Charting did not identify the requested season.') };
  if (kind === 'passing') return { ...source, sample: 'Individual pass attempts accompany each quarterback.',
    quarterbacks: result.quarterbacks ?? [], note: 'Observed quarterback charting; not an offensive-line ranking or a starting-QB declaration.' };
  return { ...source, sample: 'Games accompany pass rushers; coverage uses individual targets. The helper returns at most eight of each, with a 20-target coverage floor.',
    pass_rush: result.pass_rush ?? [], coverage: result.coverage ?? [],
    note: 'An empty player list means no rows passed the source filter, not zero pressures or zero coverage targets.' };
}

function snapEvidence(result, season) {
  const source = { source: 'nflverse snap counts', season };
  if (result?.unavailable) return { ...source, ...missing(result.reason) };
  if (!(Number(result?.week) > 0)) return { ...source, ...missing('Snap-count week unavailable.') };
  return { ...source, week: result.week, opponent: result.opponent ?? null,
    sample: 'Latest reported week in the requested season; up to 12 players per unit with at least 25% of snaps. Percentages use a 0–100 scale.',
    season_phase: 'Not supplied by snap-count helper.',
    offense: result.offense ?? [], defense: result.defense ?? [],
    note: 'Past participation only; this is not a game-day availability or starting-lineup declaration.' };
}

/** Guaranteed measured NFL context, with each source retaining its own vintage. */
export async function nflGameEvidence({ home, away, season, loaders = {} }) {
  const requested = Number(season);
  if (!Number.isInteger(requested)) return missing('An explicit NFL season is required.');
  const source = { getPlayLedger, getPassRushAndCoverage, getQbPressureProfile, getSnapShare, fetchNflTeamBaseline, ...loaders };
  const teams = [home, away];
  const [currentLedger, teamSources] = await Promise.all([
    read(source.getPlayLedger, requested),
    Promise.all(teams.map(async team => {
      const [baseline, passing, defense, snaps] = await Promise.all([
        read(source.fetchNflTeamBaseline, team?.id, requested),
        read(source.getQbPressureProfile, named(team), requested),
        read(source.getPassRushAndCoverage, named(team), requested),
        read(source.getSnapShare, named(team), requested),
      ]);
      const code = nflverseCode(named(team));
      return { code, baseline, passing, defense, snaps };
    })),
  ]);
  const current = teamSources.map(data => playEvidence(currentLedger, data.code, requested));
  const needsPrior = current.some((plays, index) => plays.unavailable || plays.sample.games === null || plays.sample.games <= 3
    || Number(teamSources[index].baseline?.season) === requested - 1);
  const prior = needsPrior ? await read(source.getPlayLedger, requested - 1) : null;
  const sides = teams.map((team, index) => {
    const data = teamSources[index];
    const aggregates = aggregateEvidence(data.baseline);
    const currentAggregates = Number(aggregates.season) === requested ? aggregates
      : missing(aggregates.reason || `No verified ${requested} team aggregates; any prior baseline is shown separately.`);
    return {
      team: named(team), team_id: team?.id ?? null, nflverse_team_code: data.code,
      current_season: { season: requested, play_by_play: current[index], team_aggregates: currentAggregates,
        quarterback_charting: chartingEvidence(data.passing, requested, 'passing'),
        defender_charting: chartingEvidence(data.defense, requested, 'defense'),
        snap_participation: snapEvidence(data.snaps, requested) },
      ...(needsPrior ? { prior_season_background: { season: requested - 1,
        play_by_play: playEvidence(prior, data.code, requested - 1, true),
        ...(Number(aggregates.season) === requested - 1 ? { team_aggregates: aggregates } : {}) } } : {}),
    };
  });
  return {
    category: 'NFL offense and defense — measured game evidence', requested_season: requested,
    assembled_at: new Date().toISOString(),
    units: 'Play-ledger rates are fractions (0–1); EPA is expected points added per play; pass rate over expected is percentage points. BDL fields ending pct and charted fields ending pct use percentage units. Counts and per-game fields retain their names.',
    reading_note: 'Offense reports production; defense reports opponent production allowed. Red-zone figures describe plays inside the 20, not drive touchdown rates. Sack and QB-hit rates are distinct from charted pressure rates. Team aggregates are never individual player lines. Missing charting is not zero.',
    home: sides[0], away: sides[1],
  };
}
