import { normalizeStoredPropType } from './resultsGradingReliability.js';
import { footballSeasonForDate } from '../../src/services/insights/footballData.js';

const FOOTBALL = new Set(['NFL', 'NCAAF']);
const FINAL_PROOF_STATES = new Set(['HELD', 'MISSED', 'PUSH']);
const TERMINAL_RESULTS = new Set(['won', 'lost', 'push']);

function clean(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function exactGameId(value) {
  return clean(value?.game_id ?? value?.bdl_game_id ?? value?.gameId);
}

function leagueOf(value) {
  const raw = clean(value?.league ?? value?.sport)?.toUpperCase() ?? null;
  const token = raw?.replace(/[^A-Z0-9]/g, '') ?? null;
  if (token === 'AMERICANFOOTBALLNFL') return 'NFL';
  if (token === 'AMERICANFOOTBALLNCAAF') return 'NCAAF';
  return raw;
}

function normalizedText(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function numeric(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function hasTerminalResult(row) {
  return TERMINAL_RESULTS.has(String(row?.result ?? '').trim().toLowerCase());
}

function hasValidFinalScore(row) {
  return /^\s*\d+\s*-\s*\d+\s*$/.test(String(row?.final_score ?? ''));
}

function hasNumericActualValue(row) {
  const value = row?.actual_value;
  return value != null && String(value).trim() !== '' && numeric(value) != null;
}

function propType(value, league) {
  const raw = clean(value?.prop ?? value?.prop_type);
  if (!raw) return null;
  return league === 'NFL'
    ? normalizeStoredPropType(raw)
    : (raw.split(/\s+/)[0] || raw);
}

function matchingGameResult(pick, rows, league, gameId) {
  const pickText = normalizedText(pick?.pick);
  return rows.some((row) =>
    exactGameId(row) === gameId
      && (league !== 'NCAAF' || leagueOf(row) === 'NCAAF')
      && normalizedText(row?.pick_text) === pickText
      && hasTerminalResult(row)
      && hasValidFinalScore(row));
}

function matchingPropResult(pick, rows, league, gameId) {
  const player = normalizedText(pick?.player ?? pick?.player_name);
  const type = normalizedText(propType(pick, league));
  const bet = normalizedText(pick?.bet ?? pick?.direction);
  const line = numeric(pick?.line ?? pick?.line_value);
  return rows.some((row) =>
    exactGameId(row) === gameId
      && leagueOf(row) === league
      && normalizedText(row?.player_name) === player
      && normalizedText(row?.prop_type) === type
      && normalizedText(row?.bet) === bet
      && numeric(row?.line_value) === line
      && hasTerminalResult(row)
      && hasNumericActualValue(row));
}

function finalNumberProof(pick, rows, league, gameId) {
  const pickId = clean(pick?.pick_id);
  if (!pickId) return false;
  return rows.some((row) =>
    leagueOf(row) === league
      && exactGameId(row) === gameId
      && String(row?.category ?? '').toLowerCase() === 'the_sweat'
      && clean(row?.meta?.pick_id) === pickId
      && String(row?.meta?.factor_code ?? '').toUpperCase() === 'THE_NUMBER'
      && FINAL_PROOF_STATES.has(String(row?.meta?.state ?? '').toUpperCase()));
}

/**
 * Pure exact-game coverage check. A final with no Gary pick or prop has no
 * settlement work. A picked game remains level-triggered until its result,
 * every exact prop result, and its final THE NUMBER receipt all exist.
 */
export function incompleteFinalFootballGames({
  finalGames = [],
  gamePicks = [],
  propPicks = [],
  nflResults = [],
  ncaafResults = [],
  propResults = [],
  proofRows = [],
} = {}) {
  const incomplete = [];
  for (const game of finalGames) {
    const league = leagueOf(game);
    const gameId = exactGameId(game);
    if (!FOOTBALL.has(league) || !gameId) continue;
    const picks = gamePicks.filter((pick) => leagueOf(pick) === league && exactGameId(pick) === gameId);
    const props = propPicks.filter((pick) => leagueOf(pick) === league && exactGameId(pick) === gameId);
    if (!picks.length && !props.length) continue;

    const missing = [];
    const resultRows = league === 'NFL' ? nflResults : ncaafResults;
    if (picks.some((pick) => !matchingGameResult(pick, resultRows, league, gameId))) {
      missing.push('game_result');
    }
    if (props.some((pick) => !matchingPropResult(pick, propResults, league, gameId))) {
      missing.push('prop_result');
    }
    if (picks.some((pick) => !finalNumberProof(pick, proofRows, league, gameId))) {
      missing.push('final_proof');
    }
    if (missing.length) {
      incomplete.push({
        date: clean(game?.date),
        league,
        game_id: gameId,
        missing: [...new Set(missing)],
      });
    }
  }
  return incomplete;
}

function asArray(data, label) {
  if (!Array.isArray(data)) throw new TypeError(`${label} response must be an array`);
  return data;
}

function flattenPickRows(rows, label) {
  return asArray(rows, label).flatMap((row, index) => {
    let picks = row?.picks;
    if (typeof picks === 'string') picks = JSON.parse(picks);
    if (!Array.isArray(picks)) throw new TypeError(`${label}[${index}].picks must be an array`);
    return picks;
  });
}

function addUtcDay(date) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function etDate(value) {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(instant);
}

/** Load only the rows needed to prove exact final football settlement. */
export async function loadIncompleteFinalFootballGames({
  date,
  finalGames,
  supabaseUrl,
  key,
  client,
}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date ?? ''))) throw new Error(`Invalid reconciliation date: ${date}`);
  if (!supabaseUrl || !key || typeof client?.get !== 'function') {
    throw new Error('Football reconciliation requires Supabase REST configuration');
  }
  const games = finalGames
    .map((game) => ({ ...game, date, league: leagueOf(game), game_id: exactGameId(game) }))
    .filter((game) => FOOTBALL.has(game.league) && game.game_id);
  if (!games.length) return [];
  const leagues = [...new Set(games.map((game) => game.league))];
  const gameIds = [...new Set(games.map((game) => game.game_id))];
  const gameIdFilter = `in.(${gameIds.join(',')})`;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const get = async (table, params) => {
    const { data } = await client.get(`${supabaseUrl}/rest/v1/${table}`, { headers, params });
    return asArray(data, table);
  };
  const nextDate = addUtcDay(date);
  const requests = [];
  const names = [];
  if (leagues.includes('NFL')) {
    requests.push(get('weekly_nfl_picks', {
      season: `eq.${footballSeasonForDate(date)}`,
      week_start: `lte.${date}`, select: 'picks', order: 'week_start.desc', limit: 3,
    }));
    names.push('nflPicks');
    requests.push(get('nfl_results', {
      game_date: `eq.${date}`, game_id: gameIdFilter,
      select: 'game_id,pick_text,result,final_score', limit: 500,
    }));
    names.push('nflResults');
  }
  if (leagues.includes('NCAAF')) {
    requests.push(get('daily_picks', { date: `eq.${date}`, select: 'picks', limit: 1 }));
    names.push('ncaafPicks');
    requests.push(get('game_results', {
      game_date: `eq.${date}`, league: 'eq.NCAAF', game_id: gameIdFilter,
      select: 'league,game_id,pick_text,result,final_score', limit: 500,
    }));
    names.push('ncaafResults');
  }
  requests.push(get('prop_picks', {
    date: `in.(${date},${nextDate})`, select: 'date,picks', limit: 10,
  }));
  names.push('propPicks');
  requests.push(get('prop_results', {
    game_date: `in.(${date},${nextDate})`, sport: 'in.(NFL,NCAAF)',
    game_id: gameIdFilter,
    select: 'game_date,game_id,sport,player_name,prop_type,bet,line_value,result,actual_value', limit: 1000,
  }));
  names.push('propResults');
  requests.push(get('insight_connections', {
    date: `eq.${date}`, league: `in.(${leagues.join(',')})`, category: 'eq.the_sweat',
    game_id: gameIdFilter,
    select: 'league,category,game_id,meta', limit: 1000,
  }));
  names.push('proofRows');
  const values = await Promise.all(requests);
  const loaded = Object.fromEntries(names.map((name, index) => [name, values[index]]));

  const nflPicks = flattenPickRows(loaded.nflPicks ?? [], 'weekly_nfl_picks')
    .filter((pick) => !pick?.commence_time || etDate(pick.commence_time) === date);
  const ncaafPicks = flattenPickRows(loaded.ncaafPicks ?? [], 'daily_picks');
  const propPicks = flattenPickRows(loaded.propPicks ?? [], 'prop_picks');
  return incompleteFinalFootballGames({
    finalGames: games,
    gamePicks: nflPicks.concat(ncaafPicks),
    propPicks,
    nflResults: loaded.nflResults ?? [],
    ncaafResults: loaded.ncaafResults ?? [],
    propResults: loaded.propResults ?? [],
    proofRows: loaded.proofRows ?? [],
  });
}

export default { incompleteFinalFootballGames, loadIncompleteFinalFootballGames };
