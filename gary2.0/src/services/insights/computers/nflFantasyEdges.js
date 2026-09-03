// Grounded NFL fantasy evidence for the Hub.
//
// BDL exposes current-season carries, targets, dated game logs and sportsbook
// totals. It does not expose snaps, route participation, goal-line touches or
// individual red-zone opportunities, so none of those concepts are inferred.
// Current-season regular evidence always wins. Before that sample reaches two
// games, the lane may use a PRIOR-SEASON BASELINE only after BDL's active-player
// directory confirms that the player is still on one of today's teams. Every
// fallback row says the prior season in both visible copy and structured meta.

import { makeRow, median, TONES } from '../shared.js';
import { selectFootballOddsByGame } from '../footballData.js';
import { generateSolText } from '../solText.js';

// THE CARD CONTRACT (founder, Sep 3 2026 — FOOTBALL = MLB SHAPE): the Hub's
// Fantasy Corner renders NFL rows through the same FantasyCard as MLB's
// waiver column, so every row carries what fantasyPickups.js writes —
// headline = the player's NAME, an availability tier, the stat-strip fields
// under meta, and Gary's read + verdict from the same analyst pass. The
// computed sentence stays as the fallback detail when the pass fails.
function tierFor(score) {
  if (score >= 74) return 'MUST_ADD';
  if (score >= 60) return 'STREAM';
  return 'DEEP';
}

const MAX_CANDIDATES = 8;
const MAX_PER_TEAM = 2;
const PLAYER_ID_CHUNK = 100;
const USAGE_MIN = Object.freeze({ RB: 12, RECEIVER: 6 });

function finite(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function fixed(value, places = 1) {
  const number = finite(value);
  if (number == null) return null;
  return number.toFixed(places).replace(/\.0$/, '');
}

function playerId(row) {
  return row?.player?.id ?? row?.player_id ?? null;
}

function teamId(row) {
  return row?.player?.team?.id ?? row?.team?.id ?? row?.team_id ?? null;
}

function playerName(row) {
  const player = row?.player || {};
  return player.full_name || [player.first_name, player.last_name].filter(Boolean).join(' ').trim();
}

function roleFor(row) {
  const position = String(row?.player?.position_abbreviation || row?.player?.position || '')
    .trim()
    .toUpperCase();
  if (position === 'RB' || position === 'FB') return 'RB';
  if (position === 'WR' || position === 'TE') return 'RECEIVER';
  return null;
}

function teamLabel(team) {
  return team?.abbreviation || team?.name || team?.full_name || 'TEAM';
}

function average(values) {
  const numbers = (values || []).map(finite).filter((value) => value != null);
  if (numbers.length === 0) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function etDate(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return null;
  return instant.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function chunks(values, size) {
  const output = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
  }
  return output;
}

async function hydrateAdvancedPlayerTeams(
  bdl,
  rushingRows,
  receivingRows,
  { requireActiveTeam = false } = {},
) {
  const rows = [...(Array.isArray(rushingRows) ? rushingRows : []),
    ...(Array.isArray(receivingRows) ? receivingRows : [])];
  const missingIds = [...new Set(rows
    .filter((row) => roleFor(row) && (requireActiveTeam || teamId(row) == null))
    .map(playerId)
    .filter((id) => id != null)
    .map(String))];
  if (missingIds.length === 0) {
    return { rushing: rushingRows, receiving: receivingRows };
  }
  if (typeof bdl?.getPlayersActive !== 'function') {
    return requireActiveTeam
      ? { rushing: [], receiving: [] }
      : { rushing: rushingRows, receiving: receivingRows };
  }

  const activeById = new Map();
  for (const group of chunks(missingIds, PLAYER_ID_CHUNK)) {
    try {
      const response = await bdl.getPlayersActive(
        'americanfootball_nfl',
        { player_ids: group, per_page: 100 },
        10,
      );
      const active = Array.isArray(response) ? response : response?.data;
      for (const player of Array.isArray(active) ? active : []) {
        if (player?.id != null && player?.team?.id != null) {
          activeById.set(String(player.id), player);
        }
      }
    } catch (error) {
      console.warn(`[nflFantasyEdges] active-player identity chunk omitted: ${error?.message || error}`);
    }
  }

  const hydrate = (row) => {
    if (!row || (!requireActiveTeam && teamId(row) != null)) return row;
    const active = activeById.get(String(playerId(row)));
    if (!active?.team?.id) return requireActiveTeam ? null : row;
    return {
      ...row,
      team: active.team,
      team_id: active.team.id,
      player: { ...(row.player || {}), ...active, team: active.team },
    };
  };
  return {
    rushing: (Array.isArray(rushingRows) ? rushingRows : []).map(hydrate).filter(Boolean),
    receiving: (Array.isArray(receivingRows) ? receivingRows : []).map(hydrate).filter(Boolean),
  };
}

function opportunityForGame(game, role) {
  if (role === 'RB') return (finite(game?.rush_att) ?? 0) + (finite(game?.targets) ?? 0);
  if (role === 'RECEIVER') return finite(game?.targets) ?? 0;
  return null;
}

function currentUsage(logs, role, beforeDate = null) {
  const games = (Array.isArray(logs?.games) ? logs.games : [])
    .filter((game) => !beforeDate || (etDate(game?.date) && etDate(game?.date) < beforeDate));
  if (!role || games.length < 2) return null;
  const values = games.map((game) => opportunityForGame(game, role));
  const perGame = average(values);
  const threshold = USAGE_MIN[role];
  if (perGame == null || !threshold || perGame < threshold) return null;
  return {
    role,
    games,
    values,
    perGame,
    threshold,
    unit: role === 'RB' ? 'OPP/G' : 'TGT/G',
    noun: role === 'RB' ? 'carries plus targets per game' : 'targets per game',
  };
}

function mergeCandidates(rushingRows, receivingRows, slateTeamIds) {
  const byPlayer = new Map();
  const ingest = (row, source) => {
    const pid = playerId(row);
    const tid = teamId(row);
    const role = roleFor(row);
    if (pid == null || tid == null || !role || !slateTeamIds.has(String(tid))) return;
    const key = String(pid);
    const current = byPlayer.get(key) || {
      player: row.player,
      player_id: pid,
      team_id: tid,
      role,
      rush_attempts: 0,
      targets: 0,
    };
    if (source === 'rush') current.rush_attempts = finite(row?.rush_attempts) ?? 0;
    if (source === 'receive') current.targets = finite(row?.targets) ?? 0;
    byPlayer.set(key, current);
  };
  for (const row of Array.isArray(rushingRows) ? rushingRows : []) ingest(row, 'rush');
  for (const row of Array.isArray(receivingRows) ? receivingRows : []) ingest(row, 'receive');

  const pools = {
    RB: [...byPlayer.values()]
      .filter((row) => row.role === 'RB')
      .sort((a, b) => (b.rush_attempts + b.targets) - (a.rush_attempts + a.targets)),
    RECEIVER: [...byPlayer.values()]
      .filter((row) => row.role === 'RECEIVER')
      .sort((a, b) => b.targets - a.targets),
  };
  const teamCounts = new Map();
  const chosen = [];
  const chosenIds = new Set();

  const takeNext = (role) => {
    const row = pools[role].find((candidate) => {
      if (chosenIds.has(String(candidate.player_id))) return false;
      return (teamCounts.get(String(candidate.team_id)) || 0) < MAX_PER_TEAM;
    });
    if (!row) return false;
    chosen.push(row);
    chosenIds.add(String(row.player_id));
    const teamKey = String(row.team_id);
    teamCounts.set(teamKey, (teamCounts.get(teamKey) || 0) + 1);
    return true;
  };

  // A football role board cannot be useful when volume sorting lets eight
  // running backs crowd out every receiver. Alternate the two grounded role
  // families first, then use whichever pool still has eligible players.
  while (chosen.length < MAX_CANDIDATES) {
    const before = chosen.length;
    takeNext('RB');
    if (chosen.length < MAX_CANDIDATES) takeNext('RECEIVER');
    if (chosen.length === before) break;
  }
  return chosen;
}

function usageRow({ candidate, usage, game, team, opponent, season, helpers, baseline = false }) {
  const name = playerName(candidate);
  const value = fixed(usage.perGame);
  if (!name || value == null) return null;
  const relevance = Math.min(92, Math.round(52 + (usage.perGame / usage.threshold) * 18));
  return makeRow({
    category: 'fantasy_usage',
    headline: name,
    detail: `${name} averaged ${value} ${usage.noun} across ${usage.games.length} ` +
      `${season} regular-season games. ${baseline
        ? `BDL confirms ${name} is currently active for ${teamLabel(team)}; this is a labeled prior-season baseline, not current form. `
        : ''}` +
      `${teamLabel(team)} faces ${teamLabel(opponent)} next; this is measured opportunity, ` +
      `not a projection or snap-share estimate.`,
    game: helpers.gameLabel(game),
    value: `${value} ${usage.unit}`,
    tone: TONES.NEUTRAL,
    relevance_score: relevance,
    spark: [...usage.values].reverse(),
    player_id: playerId(candidate),
    team_id: team?.id ?? null,
    game_id: game?.id,
    meta: {
      kind: 'fantasy_usage',
      team: teamLabel(team),
      position: usage.role === 'RECEIVER' ? 'WR/TE' : usage.role,
      source: 'balldontlie_nfl_advanced_stats+game_logs',
      metric: usage.role === 'RB' ? 'carries_plus_targets_per_game' : 'receiving_targets_per_game',
      season,
      season_type: 'regular',
      games_played: usage.games.length,
      team_id: team?.id ?? null,
      role: usage.role,
      evidence_scope: baseline ? 'prior_season_baseline' : 'current_season',
      tier: tierFor(relevance),
      per_game: Number(value),
      unit: usage.unit,
      opp: teamLabel(opponent),
      reason: `${value} ${usage.noun}${baseline ? ` in ${season}` : ''} · next vs ${teamLabel(opponent)}`,
    },
  });
}

function trendRow({ candidate, usage, game, team, opponent, season, helpers }) {
  if (usage.games.length < 4) return null;
  const newest = average(usage.values.slice(0, 2));
  const prior = average(usage.values.slice(2, 5));
  if (newest == null || prior == null || prior <= 0) return null;
  const delta = newest - prior;
  const pct = (delta / prior) * 100;
  if (Math.abs(delta) < 3 || Math.abs(pct) < 25) return null;
  const name = playerName(candidate);
  const deltaText = `${delta > 0 ? '+' : ''}${fixed(delta)}`;
  const direction = delta > 0 ? 'up' : 'down';
  const relevance = Math.min(94, Math.round(58 + Math.abs(pct) / 2));
  return makeRow({
    category: 'fantasy_trend',
    headline: name,
    detail: `${name} averaged ${fixed(newest)} ${usage.unit.toLowerCase()} over the latest two games ` +
      `versus ${fixed(prior)} across the preceding ${Math.min(3, usage.games.length - 2)}. ` +
      `The comparison uses verified ${season} game logs; ${name} is currently listed for ${teamLabel(team)}.`,
    game: helpers.gameLabel(game),
    value: `${deltaText} ${usage.unit}`,
    tone: delta > 0 ? TONES.HOT : TONES.COLD,
    relevance_score: relevance,
    spark: [...usage.values].reverse(),
    player_id: playerId(candidate),
    team_id: team?.id ?? null,
    game_id: game?.id,
    meta: {
      kind: 'fantasy_trend',
      team: teamLabel(team),
      position: usage.role === 'RECEIVER' ? 'WR/TE' : usage.role,
      source: 'balldontlie_nfl_game_logs',
      metric: 'latest_two_vs_prior_three_opportunity',
      season,
      season_type: 'regular',
      team_id: team?.id ?? null,
      latest_two: newest,
      prior_sample: prior,
      delta,
      percent_change: pct,
      evidence_scope: 'current_season',
      tier: tierFor(relevance),
      unit: usage.unit,
      opp: teamLabel(opponent),
      reason: `workload ${direction} ${Math.abs(Math.round(pct))}% — ${fixed(newest)} vs ${fixed(prior)} ${usage.unit.toLowerCase()}, last 2 vs prior ${Math.min(3, usage.games.length - 2)}`,
    },
  });
}

function impliedTeamTotal(game, team, market) {
  const total = finite(market?.total);
  const homeSpread = finite(market?.row?.spread_home_value);
  if (total == null || homeSpread == null) return null;
  const isHome = String(team?.id) === String(game?.home_team?.id);
  return isHome ? (total - homeSpread) / 2 : (total + homeSpread) / 2;
}

function matchupRow({ candidate, usage, game, team, opponent, season, helpers, market, impliedMedian, totalMedian, baseline = false }) {
  const total = finite(market?.total);
  const implied = impliedTeamTotal(game, team, market);
  const qualifiesWithSpread = implied != null && impliedMedian != null && implied >= 24.5 && implied >= impliedMedian + 2;
  const qualifiesWithoutSpread = implied == null && total != null && totalMedian != null && total >= totalMedian + 3.5;
  if (!qualifiesWithSpread && !qualifiesWithoutSpread) return null;
  const name = playerName(candidate);
  const environment = implied != null ? implied : total;
  const value = implied != null ? `${fixed(environment)} IMPLIED` : `${fixed(environment)} O/U`;
  const relevance = Math.min(92, Math.round(62 + Math.max(0, (environment || 0) - 24) * 3));
  return makeRow({
    category: 'fantasy_matchup',
    headline: name,
    detail: `${market.row?.vendor || 'The current sportsbook market'} puts ${teamLabel(team)} versus ` +
      `${teamLabel(opponent)} in one of this slate's stronger scoring environments. ` +
      `That is market context for a player ${baseline
        ? `who cleared the usage gate in the labeled ${season} baseline`
        : 'already clearing the current-season usage gate'}, not a coverage grade or projection.`,
    game: helpers.gameLabel(game),
    value,
    tone: TONES.NEUTRAL,
    relevance_score: relevance,
    line_val: total,
    player_id: playerId(candidate),
    team_id: team?.id ?? null,
    game_id: game?.id,
    meta: {
      kind: 'fantasy_matchup',
      team: teamLabel(team),
      position: usage.role === 'RECEIVER' ? 'WR/TE' : usage.role,
      source: 'balldontlie_nfl_game_logs+balldontlie_odds',
      metric: implied != null ? 'high_usage_player_implied_team_total' : 'high_usage_player_game_total',
      season,
      season_type: 'regular',
      team_id: team?.id ?? null,
      vendor: market.row?.vendor || null,
      total,
      implied_team_total: implied,
      slate_implied_median: impliedMedian,
      slate_total_median: totalMedian,
      evidence_scope: baseline ? 'prior_season_baseline' : 'current_season',
      tier: tierFor(relevance),
      per_game: usage.perGame != null ? Number(fixed(usage.perGame)) : null,
      unit: usage.unit,
      opp: teamLabel(opponent),
      reason: implied != null
        ? `${fixed(implied)} implied team total${total != null ? ` · O/U ${fixed(total)}` : ''} vs ${teamLabel(opponent)}`
        : `O/U ${fixed(total)} vs ${teamLabel(opponent)}`,
    },
  });
}

async function loadOpportunitySeason(bdl, season, { requireActiveTeam = false } = {}) {
  let rushing = [];
  let receiving = [];
  try {
    [rushing, receiving] = await Promise.all([
      bdl.getNflAdvancedRushingStats({ season }),
      bdl.getNflAdvancedReceivingStats({ season }),
    ]);
  } catch (error) {
    console.warn(`[nflFantasyEdges] ${season} opportunity leaders omitted: ${error?.message || error}`);
    return { rushing: [], receiving: [] };
  }
  return hydrateAdvancedPlayerTeams(bdl, rushing, receiving, { requireActiveTeam });
}

export async function computeNflFantasyEdges(ctx) {
  const { games, season, bdl, helpers, date } = ctx;
  if (String(ctx?.league || '').toLowerCase() !== 'nfl' || !Array.isArray(games) || games.length === 0) return [];
  if (typeof bdl?.getNflAdvancedRushingStats !== 'function' ||
      typeof bdl?.getNflAdvancedReceivingStats !== 'function' ||
      typeof bdl?.getNflPlayerGameLogsBatch !== 'function') return [];

  const slateTeamIds = new Set(games.flatMap((game) => [
    game?.away_team?.id ?? game?.visitor_team?.id,
    game?.home_team?.id,
  ]).filter((id) => id != null).map(String));
  let selectedMarkets = new Map();
  try {
    const odds = await bdl.getOddsV2(
      { game_ids: games.map((game) => game?.id).filter((id) => id != null), per_page: 100 },
      'americanfootball_nfl',
      1,
    );
    selectedMarkets = selectFootballOddsByGame(odds, new Set(games.map((game) => game?.id)));
  } catch (error) {
    console.warn(`[nflFantasyEdges] market context omitted: ${error?.message || error}`);
  }

  const teamContext = new Map();
  for (const game of games) {
    const away = game?.away_team ?? game?.visitor_team;
    const home = game?.home_team;
    const market = selectedMarkets.get(String(game?.id));
    if (away?.id != null) teamContext.set(String(away.id), { game, team: away, opponent: home, market });
    if (home?.id != null) teamContext.set(String(home.id), { game, team: home, opponent: away, market });
  }
  const impliedValues = [];
  for (const { game, team, market } of teamContext.values()) {
    const value = impliedTeamTotal(game, team, market);
    if (value != null) impliedValues.push(value);
  }
  const impliedMedian = median(impliedValues);
  const totalMedian = median([...selectedMarkets.values()].map((market) => market.total));

  const buildForSeason = async (evidenceSeason, baseline) => {
    const opportunity = await loadOpportunitySeason(bdl, evidenceSeason, { requireActiveTeam: baseline });
    const candidates = mergeCandidates(opportunity.rushing, opportunity.receiving, slateTeamIds);
    if (candidates.length === 0) return { candidates: 0, rows: [] };

    let logsByPlayer = {};
    try {
      logsByPlayer = await bdl.getNflPlayerGameLogsBatch(candidates.map(playerId), evidenceSeason, 5);
    } catch (error) {
      console.warn(`[nflFantasyEdges] ${evidenceSeason} recent usage omitted: ${error?.message || error}`);
      return { candidates: candidates.length, rows: [] };
    }

    const rows = [];
    for (const candidate of candidates) {
      const context = teamContext.get(String(candidate.team_id));
      const logs = logsByPlayer?.[String(playerId(candidate))] ?? logsByPlayer?.[playerId(candidate)];
      const usage = currentUsage(logs, roleFor(candidate), baseline ? null : date);
      if (!context || !usage) continue;
      const common = { candidate, usage, season: evidenceSeason, helpers, baseline, ...context };
      const usageCard = usageRow(common);
      // Calling old games "recent" during preseason would be misleading. The
      // trend lane resumes automatically once the current season has a sample.
      const trendCard = baseline ? null : trendRow(common);
      const matchupCard = context.market
        ? matchupRow({ ...common, impliedMedian, totalMedian })
        : null;
      if (usageCard) rows.push(usageCard);
      if (trendCard) rows.push(trendCard);
      if (matchupCard) rows.push(matchupCard);
    }
    return { candidates: candidates.length, rows };
  };

  const preseasonSlate = games.every((game) => Number(game?.season_type) === 1);
  let generated = preseasonSlate
    ? { candidates: 0, rows: [] }
    : await buildForSeason(season, false);
  if (generated.rows.length === 0) {
    generated = await buildForSeason(Number(season) - 1, true);
  }

  console.log(
    `[nflFantasyEdges] NFL ${date}: ${generated.candidates} candidates -> ` +
      `${generated.rows.length} grounded fantasy row(s)` +
      `${generated.rows.some((row) => row.meta?.evidence_scope === 'prior_season_baseline') ? ' (prior-season baseline)' : ''}`,
  );
  // The same analyst pass MLB's waiver column runs (fantasyPickups.js): ONE
  // call writes Gary's read + verdict per row from the grounded facts above.
  // The model is fenced to the listed numbers; any failure keeps the computed
  // detail, so the card never goes dark.
  await writeAnalystReads(generated.rows);
  return generated.rows;
}

/** Per-player grounded fact sheet → 2-3 sentence read + a verdict line. */
async function writeAnalystReads(rows) {
  if (!rows.length) return;
  const facts = rows.map((r, i) => {
    const m = r.meta || {};
    const scope = m.evidence_scope === 'prior_season_baseline'
      ? `${m.season} season baseline (prior season — the current one has no sample yet; BDL confirms he is active for ${m.team})`
      : `${m.season} season, ${m.games_played ?? 'current'} games`;
    const lane = m.kind === 'fantasy_usage' ? 'ROLE'
      : m.kind === 'fantasy_trend' ? 'TREND'
        : 'MATCHUP';
    return `${i}. ${lane} ${r.headline} (${m.position || 'FLEX'}, ${m.team}) — ${m.reason}. Evidence: ${scope}. Availability tier: ${m.tier}. Game: ${r.game}.`;
  }).join('\n');

  const prompt = `You are Gary — the bettor whose season-long fantasy column publishes in this app. You write as yourself, never as an AI, and your training data is old: the facts below are current and they are ALL you may use — never introduce a statistic, injury, trend, or player that isn't listed.

For each player below: the case for adding him today, and the call for who should.

Return STRICT JSON only: {"reads":[{"i":0,"read":"...","verdict":"..."}]}

PLAYERS:
${facts}`;

  try {
    const resp = await generateSolText(prompt, { maxTokens: 4000 });
    const text = typeof resp === 'string' ? resp : (resp?.content ?? resp?.text ?? '');
    const jsonStr = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(jsonStr.slice(jsonStr.indexOf('{'), jsonStr.lastIndexOf('}') + 1));
    for (const item of parsed?.reads || []) {
      const r = rows[item?.i];
      if (!r || !item?.read) continue;
      const verdict = (item.verdict || '').trim();
      r.meta = { ...(r.meta || {}), computed_detail: r.detail, read: item.read.trim(), ...(verdict ? { verdict } : {}) };
      r.detail = `${item.read.trim()}${verdict ? ` ${verdict}` : ''}`;
    }
    console.log(`[nflFantasyEdges] analyst reads attached: ${(parsed?.reads || []).length}/${rows.length}`);
  } catch (err) {
    console.error('[nflFantasyEdges] analyst pass failed (computed details kept):', err?.message || err);
  }
}

export const nflFantasyInternals = Object.freeze({
  currentUsage,
  hydrateAdvancedPlayerTeams,
  impliedTeamTotal,
  mergeCandidates,
  roleFor,
});

export default { computeNflFantasyEdges };
