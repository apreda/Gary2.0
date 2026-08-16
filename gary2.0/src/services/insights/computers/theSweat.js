// Pick-specific football proof. THE SWEAT never creates a pick and never
// rewrites Gary's card. It turns the immutable stored call plus exact-game BDL
// state into a compact set of auditable rows beneath that game's cards.

import axios from 'axios';
import { makeRow, TONES, etDateStr } from '../shared.js';
import { footballSeasonForDate } from '../footballData.js';

const FOOTBALL = new Set(['nfl', 'ncaaf']);
const SPORT_KEY = Object.freeze({
  nfl: 'americanfootball_nfl',
  ncaaf: 'americanfootball_ncaaf',
});

const FACTORS = Object.freeze([
  {
    code: 'RUSH_EDGE',
    label: 'GROUND',
    tokens: ['RUSH_YDS_GM', 'RUSHING_YARDS_PER_GAME', 'RUSHING_YPG', 'NCAAF_RUSHING_OFFENSE'],
    liveKeys: ['rushing_yards', 'rush_yards'],
    higherIsBetter: true,
  },
  {
    code: 'AIR_EDGE',
    label: 'AIR',
    tokens: ['PASS_YDS_GM', 'PASSING_YPG', 'PASSING_YARDS_PER_GAME', 'NCAAF_PASSING_OFFENSE'],
    liveKeys: ['passing_yards', 'pass_yards'],
    higherIsBetter: true,
  },
  {
    code: 'PRESSURE',
    label: 'PRESSURE',
    tokens: ['SACKS', 'PRESSURE_RATE', 'PASS_RUSH'],
    liveKeys: ['sacks', 'defensive_sacks'],
    higherIsBetter: true,
  },
  {
    code: 'BALL_SECURITY',
    label: 'BALL SECURITY',
    tokens: ['TURNOVER_MARGIN', 'TURNOVER_DIFF', 'NCAAF_TURNOVER_MARGIN'],
    liveKeys: ['turnovers', 'turnovers_lost'],
    higherIsBetter: false,
  },
]);

function finite(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clean(value) {
  const text = String(value ?? '').trim();
  if (!text || text.toUpperCase() === 'N/A' || text === '—') return null;
  return text;
}

function normalize(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function flattenPicks(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function exactGameId(value) {
  const id = value?.bdl_game_id ?? value?.game_id ?? value?.gameId;
  return id == null ? null : String(id);
}

function gameTeams(game) {
  return {
    away: game?.visitor_team ?? game?.away_team ?? {},
    home: game?.home_team ?? {},
  };
}

function teamAliases(team, fallback) {
  return [
    team?.full_name,
    team?.display_name,
    team?.name,
    team?.abbreviation,
    fallback,
  ].map(normalize).filter(Boolean);
}

function pickedSide(pick, game) {
  const text = normalize(pick?.pick);
  const teams = gameTeams(game);
  const awayAliases = teamAliases(teams.away, pick?.awayTeam);
  const homeAliases = teamAliases(teams.home, pick?.homeTeam);
  const contains = (aliases) => aliases.some((alias) => alias.length >= 2 && text.includes(alias));
  if (contains(homeAliases)) return 'home';
  if (contains(awayAliases)) return 'away';
  return null;
}

function shortTeam(game, side, pick) {
  const teams = gameTeams(game);
  const team = side === 'home' ? teams.home : teams.away;
  return clean(team?.abbreviation)
    ?? clean(team?.name)?.toUpperCase()
    ?? clean(side === 'home' ? pick?.homeTeam : pick?.awayTeam)?.toUpperCase()
    ?? side.toUpperCase();
}

function signed(value) {
  const number = finite(value);
  if (number == null) return null;
  const body = Number.isInteger(number) ? String(number) : String(number).replace(/\.0+$/, '');
  return number > 0 ? `+${body}` : body;
}

function firstSignedLine(text) {
  const match = String(text ?? '').match(/(?:^|\s)([+-]\d+(?:\.\d+)?)(?=\s|$)/);
  return match ? finite(match[1]) : null;
}

function marketForPick(pick) {
  const type = String(pick?.type ?? '').toLowerCase();
  const text = String(pick?.pick ?? '');
  const lower = text.toLowerCase();
  if (type.includes('total') || /\b(over|under)\b/i.test(text)) {
    const direction = lower.includes('under') ? 'under' : lower.includes('over') ? 'over' : null;
    const line = finite(pick?.total ?? pick?.goal_line)
      ?? finite(text.match(/\b(?:over|under|o\/u)\s*([0-9]+(?:\.[0-9]+)?)/i)?.[1]);
    return direction && line != null ? { type: 'total', direction, line } : null;
  }
  const side = type.includes('money') || /\bml\b/i.test(text) ? 'moneyline' : 'spread';
  if (side === 'moneyline') return { type: 'moneyline', line: null };
  const line = firstSignedLine(text) ?? finite(pick?.spread);
  return line == null ? null : { type: 'spread', line };
}

function normalizedStatus(score, game, nowMs) {
  const stored = String(score?.status ?? '').toLowerCase();
  if (stored === 'live' || stored === 'final' || stored === 'scheduled') return stored;
  const raw = String(game?.status_state ?? game?.status ?? '').toLowerCase();
  if (raw.includes('final')) return 'final';
  if (raw.includes('progress') || raw.includes('q1') || raw.includes('q2') || raw.includes('q3') || raw.includes('q4')) return 'live';
  const start = Date.parse(game?.date ?? game?.commence_time ?? '');
  return Number.isFinite(start) && start <= nowMs ? 'live' : 'scheduled';
}

function scorePair(score, game) {
  const home = finite(score?.home_score ?? game?.home_team_score);
  const away = finite(score?.away_score ?? score?.visitor_team_score ?? game?.visitor_team_score);
  return home == null || away == null ? null : { home, away };
}

function proofState({ status, held }) {
  if (status === 'scheduled' || held == null) return 'WATCH';
  if (held === 0) return 'PUSH';
  if (status === 'final') return held > 0 ? 'HELD' : 'MISSED';
  return held > 0 ? 'HOLDING' : 'FLIPPED';
}

function numberFactor({ pick, game, score, status, seasonType, asOf }) {
  const market = marketForPick(pick);
  if (!market) return null;
  const selected = pickedSide(pick, game);
  const scores = scorePair(score, game);
  let held = null;
  let baseline = null;
  let liveValue = null;

  if (market.type === 'total') {
    baseline = `${market.direction.toUpperCase()} ${market.line}`;
    if (scores) {
      const total = scores.home + scores.away;
      held = total === market.line ? 0 : (market.direction === 'over' ? total > market.line : total < market.line) ? 1 : -1;
      liveValue = `${total} / ${market.line}`;
    }
  } else if (selected) {
    const team = shortTeam(game, selected, pick);
    baseline = market.type === 'moneyline' ? `${team} ML` : `${team} ${signed(market.line)}`;
    if (scores) {
      const selectedScore = selected === 'home' ? scores.home : scores.away;
      const otherScore = selected === 'home' ? scores.away : scores.home;
      const cover = selectedScore - otherScore + (market.line ?? 0);
      held = cover === 0 ? 0 : cover > 0 ? 1 : -1;
      liveValue = `${team} ${selectedScore}–${otherScore}`;
    }
  }

  // Once play begins, a baseline-only row is not a live receipt. Omit this
  // identity so the storage layer preserves the last verified state instead of
  // replacing HOLDING/FLIPPED with a misleading WATCH during a score outage.
  if (status !== 'scheduled' && held == null) return null;

  return {
    code: 'THE_NUMBER',
    label: 'THE NUMBER',
    baseline,
    liveValue,
    state: proofState({ status, held }),
    tone: held == null || held === 0 ? TONES.NEUTRAL : held > 0 ? TONES.EDGE : TONES.CAUTION,
    relevance: 98,
    seasonType,
    asOf,
  };
}

function statToken(stat) {
  return String(stat?.token ?? '').trim().toUpperCase();
}

function statSideValue(stat, side) {
  const object = stat?.[side];
  if (!object || typeof object !== 'object') return null;
  const token = statToken(stat).toLowerCase();
  const preferred = [token, 'value'];
  for (const key of preferred) {
    const hit = clean(object[key]);
    if (hit != null) return hit;
  }
  for (const [key, value] of Object.entries(object)) {
    if (key === 'team' || key === 'name') continue;
    const hit = clean(value);
    if (hit != null) return hit;
  }
  return null;
}

function liveStatRows(teamStats, gameId) {
  if (!Array.isArray(teamStats)) return [];
  return teamStats.filter((row) => String(row?.game?.id ?? row?.game_id ?? row?.gameId ?? '') === String(gameId));
}

function teamStatSide(rows, game, side) {
  const teams = gameTeams(game);
  const wantedTeam = side === 'home' ? teams.home : teams.away;
  const wantedId = String(wantedTeam?.id ?? '');
  const wantedNames = new Set(teamAliases(wantedTeam));
  return rows.find((row) => String(row?.home_away ?? '').toLowerCase() === side)
    ?? rows.find((row) => wantedId && String(row?.team?.id ?? row?.team_id ?? '') === wantedId)
    ?? rows.find((row) => teamAliases(row?.team, row?.team_name)
      .some((name) => wantedNames.has(name)))
    ?? null;
}

function liveMetric(row, keys) {
  if (!row) return null;
  for (const key of keys) {
    const value = finite(row[key]);
    if (value != null) return value;
  }
  return null;
}

function evidenceFactor({ definition, pick, game, statsRows, status, seasonType, asOf }) {
  const stat = (pick?.statsData ?? []).find((row) => definition.tokens.includes(statToken(row)));
  const rationale = String(pick?.rationale ?? '').toLowerCase();
  const rationaleAllows = definition.code === 'PRESSURE'
    ? /\b(sack|pressure|pass rush)\b/.test(rationale)
    : definition.code === 'BALL_SECURITY'
      ? /\b(turnover|interception|giveaway|takeaway)\b/.test(rationale)
      : false;
  if (!stat && !rationaleAllows) return null;

  const selected = pickedSide(pick, game);
  if (!selected) return null;
  const other = selected === 'home' ? 'away' : 'home';
  const baselineSelected = stat ? statSideValue(stat, selected) : null;
  const baselineOther = stat ? statSideValue(stat, other) : null;
  const baseline = baselineSelected != null && baselineOther != null
    ? `${baselineSelected} · ${baselineOther}`
    : null;

  const selectedRow = teamStatSide(statsRows, game, selected);
  const otherRow = teamStatSide(statsRows, game, other);
  const selectedLive = liveMetric(selectedRow, definition.liveKeys);
  const otherLive = liveMetric(otherRow, definition.liveKeys);
  let held = null;
  let liveValue = null;
  if (selectedLive != null && otherLive != null && (selectedLive !== 0 || otherLive !== 0)) {
    const diff = definition.higherIsBetter ? selectedLive - otherLive : otherLive - selectedLive;
    held = diff === 0 ? 0 : diff > 0 ? 1 : -1;
    liveValue = `${selectedLive} · ${otherLive}`;
  }

  if (status !== 'scheduled' && held == null) return null;
  if (!baseline && !liveValue) return null;
  return {
    code: definition.code,
    label: definition.label,
    baseline,
    liveValue,
    state: proofState({ status, held }),
    tone: held == null || held === 0 ? TONES.NEUTRAL : held > 0 ? TONES.EDGE : TONES.CAUTION,
    relevance: 86,
    seasonType,
    asOf,
  };
}

function seasonTypeFor(game, league) {
  const explicit = Number(game?.season_type ?? game?.seasonType);
  if (explicit === 1) return 'PRE';
  if (explicit === 3 || game?.postseason === true) return 'POST';
  const month = Number(String(game?.date ?? '').slice(5, 7));
  if (league === 'nfl' && (month === 7 || month === 8)) return 'PRE';
  return 'REG';
}

function matchup(game, pick) {
  const teams = gameTeams(game);
  const away = teams.away?.abbreviation ?? teams.away?.full_name ?? pick?.awayTeam ?? 'AWAY';
  const home = teams.home?.abbreviation ?? teams.home?.full_name ?? pick?.homeTeam ?? 'HOME';
  return `${away} @ ${home}`;
}

export function buildTheSweatRows({ league, date, games = [], picks = [], liveScores = [], teamStats = [], nowMs = Date.now() } = {}) {
  const leagueKey = String(league ?? '').toLowerCase();
  if (!FOOTBALL.has(leagueKey)) return [];
  const gameById = new Map(games.map((game) => [String(game?.id), game]));
  const scoreById = new Map(liveScores.map((score) => [String(score?.game_id ?? score?.gameId), score]));
  const output = [];

  for (const pick of picks) {
    const gameId = exactGameId(pick);
    const game = gameId ? gameById.get(gameId) : null;
    if (!gameId || !game) continue;
    const commence = pick?.commence_time ?? game?.date;
    if (commence && etDateStr(commence) !== date) continue;
    const score = scoreById.get(gameId) ?? null;
    const status = normalizedStatus(score, game, nowMs);
    const asOf = score?.updated_at ?? new Date(nowMs).toISOString();
    const seasonType = seasonTypeFor(game, leagueKey);
    const statsRows = liveStatRows(teamStats, gameId);
    const factors = [numberFactor({ pick, game, score, status, seasonType, asOf })]
      .concat(FACTORS.map((definition) => evidenceFactor({
        definition, pick, game, statsRows, status, seasonType, asOf,
      })))
      .filter(Boolean)
      .slice(0, 4);

    for (const factor of factors) {
      const display = factor.liveValue ?? factor.baseline;
      if (!display) continue;
      output.push(makeRow({
        category: 'the_sweat',
        headline: factor.label,
        detail: String(pick?.pick ?? 'Gary pick proof'),
        game: matchup(game, pick),
        value: display,
        tone: factor.tone,
        relevance_score: factor.relevance,
        game_id: game?.id ?? gameId,
        meta: {
          kind: 'the_sweat',
          pick_id: pick?.pick_id ?? null,
          season_type: factor.seasonType,
          factor_code: factor.code,
          baseline: factor.baseline,
          live_value: factor.liveValue,
          state: factor.state,
          as_of: factor.asOf,
          team: pickedSide(pick, game) ? shortTeam(game, pickedSide(pick, game), pick) : null,
        },
      }));
    }
  }
  return output;
}

function restConfig(options = {}) {
  const supabaseUrl = options.supabaseUrl
    ?? process.env.NEXT_PUBLIC_SUPABASE_URL
    ?? process.env.SUPABASE_URL;
  const key = options.key
    ?? process.env.SUPABASE_SERVICE_ROLE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ?? process.env.SUPABASE_ANON_KEY;
  return { supabaseUrl, key, client: options.client ?? axios };
}

async function restRows(path, params, options) {
  const { supabaseUrl, key, client } = restConfig(options);
  if (!supabaseUrl || !key) throw new Error('Supabase configuration missing for football proof');
  const { data } = await client.get(`${supabaseUrl}/rest/v1/${path}`, {
    params,
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  return Array.isArray(data) ? data : [];
}

export async function loadStoredFootballPicks({ league, date, season, ...options }) {
  const leagueKey = String(league ?? '').toLowerCase();
  if (leagueKey === 'nfl') {
    const resolvedSeason = Number.isInteger(Number(season))
      ? Number(season)
      : footballSeasonForDate(date);
    if (!Number.isInteger(resolvedSeason)) return [];
    const rows = await restRows('weekly_nfl_picks', {
      season: `eq.${resolvedSeason}`,
      week_start: `lte.${date}`,
      select: 'picks',
      order: 'week_start.desc',
      limit: 3,
    }, options);
    return rows.flatMap((row) => flattenPicks(row?.picks)).filter((pick) => {
      const commence = pick?.commence_time;
      return String(pick?.league ?? '').toUpperCase() === 'NFL'
        && (!commence || etDateStr(commence) === date);
    });
  }
  if (leagueKey === 'ncaaf') {
    const rows = await restRows('daily_picks', {
      date: `eq.${date}`,
      select: 'picks',
      limit: 1,
    }, options);
    return rows.flatMap((row) => flattenPicks(row?.picks)).filter((pick) =>
      ['NCAAF', 'AMERICANFOOTBALLNCAAF'].includes(normalize(pick?.league ?? pick?.sport).toUpperCase())
    );
  }
  return [];
}

export async function loadFootballLiveScores({ league, date, ...options }) {
  return restRows('live_scores', {
    date: `eq.${date}`,
    league: `eq.${String(league).toUpperCase()}`,
    select: 'game_id,away_score,home_score,status,detail,updated_at',
  }, options);
}

function settledScoreRow(row) {
  const match = /^\s*(-?\d+)\s*-\s*(-?\d+)\s*$/.exec(String(row?.final_score ?? ''));
  const gameId = row?.game_id;
  if (!match || gameId == null) return null;
  return {
    game_id: String(gameId),
    away_score: Number(match[1]),
    home_score: Number(match[2]),
    status: 'final',
    detail: 'Final',
  };
}

/** Final-score fallback for the prior ET day after live_scores is pruned. */
export async function loadFootballSettledScores({ league, date, ...options }) {
  const leagueKey = String(league ?? '').toLowerCase();
  if (leagueKey === 'nfl') {
    const rows = await restRows('nfl_results', {
      game_date: `eq.${date}`,
      select: 'game_id,final_score',
      limit: 500,
    }, options);
    return rows.map(settledScoreRow).filter(Boolean);
  }
  if (leagueKey === 'ncaaf') {
    const rows = await restRows('game_results', {
      game_date: `eq.${date}`,
      league: 'eq.NCAAF',
      select: 'game_id,final_score',
      limit: 500,
    }, options);
    return rows.map(settledScoreRow).filter(Boolean);
  }
  return [];
}

export async function computeTheSweat(ctx) {
  const league = String(ctx?.league ?? '').toLowerCase();
  if (!FOOTBALL.has(league) || !Array.isArray(ctx?.games) || ctx.games.length === 0) return [];
  const picks = ctx?.proofData?.picks ?? await loadStoredFootballPicks({
    league,
    date: ctx.date,
    season: ctx.season,
  });
  if (!picks.length) return [];
  const liveScores = ctx?.proofData?.liveScores ?? await loadFootballLiveScores({ league, date: ctx.date });
  const activeIds = new Set(liveScores
    .filter((row) => ['live', 'final'].includes(String(row?.status).toLowerCase()))
    .map((row) => String(row?.game_id)));
  const activeGameIds = ctx.games.map((game) => game?.id).filter((id) => activeIds.has(String(id)));
  let teamStats = ctx?.proofData?.teamStats ?? [];
  if (!ctx?.proofData?.teamStats && activeGameIds.length) {
    teamStats = await ctx.bdl.getTeamStats(SPORT_KEY[league], { game_ids: activeGameIds, per_page: 100 }, 1);
  }
  return buildTheSweatRows({
    league,
    date: ctx.date,
    games: ctx.games,
    picks,
    liveScores,
    teamStats,
  });
}

export default {
  buildTheSweatRows,
  computeTheSweat,
  loadStoredFootballPicks,
  loadFootballLiveScores,
  loadFootballSettledScores,
};
