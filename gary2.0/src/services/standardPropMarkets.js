import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { matchingOddsEvent } from './backupGameOdds.js';
import { isAmericanPrice, finiteMarketNumber } from './marketTruth.js';

export const STANDARD_PROPS_SHA = createHash('sha256').update(readFileSync(new URL('./standardPropMarkets.js', import.meta.url))).digest('hex').slice(0, 12);

const CACHE = fileURLToPath(new URL('../../.cache/standard-props/', import.meta.url));
const SPORTS = { MLB: 'baseball_mlb', NFL: 'americanfootball_nfl', NCAAF: 'americanfootball_ncaaf' };
const NFL = {
  passing_yards: 'player_pass_yds', passing_tds: 'player_pass_tds', passing_touchdowns: 'player_pass_tds',
  passing_attempts: 'player_pass_attempts', passing_completions: 'player_pass_completions', interceptions: 'player_pass_interceptions',
  rushing_yards: 'player_rush_yds', rushing_attempts: 'player_rush_attempts', receiving_yards: 'player_reception_yds',
  receptions: 'player_receptions', rushing_receiving_yards: 'player_rush_reception_yds',
  anytime_td: 'player_anytime_td', anytime_touchdown: 'player_anytime_td', player_anytime_td: 'player_anytime_td',
  rushing_touchdowns: 'player_rush_tds', receiving_touchdowns: 'player_reception_tds',
  completions: 'player_pass_completions', pass_attempts: 'player_pass_attempts',
  longest_completion: 'player_pass_longest_completion', longest_pass: 'player_pass_longest_completion',
  longest_rush: 'player_rush_longest', longest_reception: 'player_reception_longest',
  passing_rushing_yards: 'player_pass_rush_yds',
};
for (const [canonical, aliases] of Object.entries({
  passing_yards: ['player_pass_yds', 'pass_yds'], rushing_yards: ['player_rush_yds', 'rush_yds'],
  receiving_yards: ['player_rec_yds', 'rec_yds'], receptions: ['player_receptions'],
  passing_touchdowns: ['player_pass_tds', 'pass_tds'], rushing_touchdowns: ['player_rush_tds', 'rush_tds'],
  receiving_touchdowns: ['player_rec_tds', 'rec_tds'], passing_completions: ['player_completions', 'pass_completions'],
  passing_attempts: ['player_pass_attempts'], rushing_attempts: ['rush_attempts', 'player_rush_attempts'],
  interceptions: ['player_interceptions'], rushing_receiving_yards: ['rush_rec_yds'], passing_rushing_yards: ['pass_rush_yds'],
})) for (const alias of aliases) NFL[alias] = NFL[canonical];
const MLB = { hits: 'batter_hits', home_runs: 'batter_home_runs', total_bases: 'batter_total_bases',
  rbis: 'batter_rbis', runs_scored: 'batter_runs_scored', walks: 'batter_walks', stolen_bases: 'batter_stolen_bases',
  singles: 'batter_singles', doubles: 'batter_doubles', hits_runs_rbis: 'batter_hits_runs_rbis',
  pitcher_strikeouts: 'pitcher_strikeouts', pitcher_outs: 'pitcher_outs', pitcher_earned_runs: 'pitcher_earned_runs',
  pitcher_hits_allowed: 'pitcher_hits_allowed', pitcher_walks: 'pitcher_walks' };
const playerKey = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const bookKey = value => value === 'williamhill_us' ? 'caesars' : value;
const isTd = type => ['anytime_td', 'anytime_touchdown', 'player_anytime_td'].includes(type);
const pending = new Map();

async function feed(sport, endpoint, parameters, { fresh = false, env = process.env } = {}) {
  const key = env.THE_ODDS_API_KEY || env.ODDS_API_KEY || env.NCAAF_THE_ODDS_API_KEY;
  if (!key) throw new Error('Standard prop verification requires the configured Odds API key');
  const cacheId = createHash('sha256').update(JSON.stringify([sport, endpoint, parameters])).digest('hex');
  if (pending.has(cacheId)) return pending.get(cacheId);
  const request = (async () => {
    const filename = `${CACHE}${cacheId}.json`;
    if (!fresh) try {
      const saved = JSON.parse(await readFile(filename, 'utf8'));
      if (Date.now() - saved.fetched_at < 120_000) return saved;
    } catch { /* Fetch an uncached current board. */ }
    const url = new URL(`https://api.the-odds-api.com/v4/sports/${sport}/${endpoint}`);
    url.searchParams.set('apiKey', key);
    for (const [name, value] of Object.entries(parameters)) url.searchParams.set(name, value);
    let response;
    try { response = await fetch(url, { signal: AbortSignal.timeout(20_000) }); }
    catch { throw new Error('Standard prop market provider is unavailable'); }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Standard prop market provider returned HTTP ${response.status}`);
    }
    const data = await response.json();
    const saved = { fetched_at: Date.now(), data };
    await mkdir(CACHE, { recursive: true, mode: 0o700 });
    const temporary = `${filename}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(saved), { mode: 0o600 });
    await rename(temporary, filename);
    return saved;
  })();
  pending.set(cacheId, request);
  try { return await request; } finally { pending.delete(cacheId); }
}

function sourceCanBeStandard(source, type) {
  if (!source) return false;
  if (source.is_alternate === true || source.market?.is_alternate === true || /alternate/i.test(source.market?.type || '')) return false;
  if (isTd(type)) return ['over_under', 'milestone'].includes(source.market?.type)
    && [0.5, 1].includes(Number(source.line_value));
  if (type === 'home_runs' && source.market?.type === 'milestone') return Number(source.line_value) === 1;
  return source.market?.type === 'over_under';
}

function standardMatch(event, row, side, fetchedAt, league) {
  if (isTd(row.prop_type) && (side !== 'over' || ![0.5, 1].includes(Number(row.line)))) return null;
  const mapping = league === 'MLB' ? MLB : NFL;
  const marketKey = mapping[row.prop_type];
  const source = row[`${side}_source_market`];
  if (!marketKey || !sourceCanBeStandard(source, row.prop_type)) return null;
  const bookmaker = row[`${side}_vendor`];
  const wantedPlayer = playerKey(row.player);
  const expectedSide = isTd(row.prop_type) ? 'Yes' : side === 'over' ? 'Over' : 'Under';
  const matches = [];
  for (const book of event.bookmakers || []) {
    if (bookKey(book.key) !== bookKey(bookmaker)) continue;
    for (const market of book.markets || []) {
      if (market.key !== marketKey) continue; // Never request or accept an alternate key.
      const updatedAt = market.last_update || book.last_update;
      const age = Date.now() - Date.parse(updatedAt);
      if (!Number.isFinite(age) || age < -60_000 || age > 20 * 60_000) continue;
      const outcomes = (market.outcomes || []).filter(outcome => playerKey(outcome.description) === wantedPlayer);
      // Ambiguous names or multiple main lines cannot be fixed with a balanced-price guess.
      if (!isTd(row.prop_type) && new Set(outcomes.map(o => finiteMarketNumber(o.point))).size !== 1) continue;
      for (const outcome of outcomes) {
        if (outcome.name !== expectedSide || !isAmericanPrice(outcome.price)) continue;
        if (!isTd(row.prop_type) && finiteMarketNumber(outcome.point) !== Number(row.line)) continue;
        if (row.prop_type === 'home_runs' && Number(row.line) !== 0.5) continue;
        matches.push({ provider: 'the_odds_api', event_id: event.id, sport_key: event.sport_key,
          bookmaker: bookKey(book.key), market_key: market.key, player: outcome.description,
          side, line: row.line, source_price: outcome.price, updated_at: updatedAt,
          observed_at: new Date(fetchedAt).toISOString(), kickoff: event.commence_time,
          home_team: event.home_team, away_team: event.away_team });
      }
    }
  }
  return matches.length === 1 ? matches[0] : null;
}

/** Each BDL quote must identify the same book/player/standard market/line. */
export async function filterStandardPropMarkets(rows, { league, game, env = process.env } = {}) {
  const sport = SPORTS[league];
  if (!Array.isArray(rows) || !rows.length) return [];
  if (!sport) throw new Error(`No standard prop market adapter for ${league}`);
  const mapping = league === 'MLB' ? MLB : NFL;
  const keys = [...new Set(rows.map(row => mapping[row.prop_type]).filter(Boolean))].sort();
  if (!keys.length) throw new Error(`${league}: no supported standard prop markets`);
  const events = await feed(sport, 'events', {}, { env });
  const target = { ...game, home_team: typeof game.home_team === 'string' ? game.home_team : game.home_team?.full_name,
    away_team: typeof game.away_team === 'string' ? game.away_team : game.away_team?.full_name };
  const event = matchingOddsEvent(Array.isArray(events.data) ? events.data : [], target, sport);
  if (!event) throw new Error(`${league}: no exact matchup for standard prop market verification`);
  const board = await feed(sport, `events/${encodeURIComponent(event.id)}/odds`, { markets: keys.join(','), regions: 'us', oddsFormat: 'american' }, { env });
  if (!matchingOddsEvent([board.data], target, sport)) throw new Error('Standard prop board game identity changed');
  const filtered = [];
  for (const row of rows) {
    const verified = { ...row, standard_market: {} };
    for (const side of ['over', 'under']) {
      const proof = isAmericanPrice(row[`${side}_odds`]) ? standardMatch(board.data, row, side, board.fetched_at, league) : null;
      if (proof) verified.standard_market[side] = proof;
      else {
        verified[`${side}_odds`] = null;
        verified[`${side}_vendor`] = null;
        verified[`${side}_source_market`] = null;
      }
    }
    if (Object.keys(verified.standard_market).length) filtered.push(verified);
  }
  console.log(`[Standard props] ${league} ${game.bdl_game_id ?? game.id}: ${filtered.length}/${rows.length} markets match named standard books`);
  if (!filtered.length) throw new Error(`${league}: no props corroborated against the sportsbook's standard markets`);
  return filtered;
}

/** Recheck main-market identity immediately before publication, without changing BDL prices. */
export async function verifyStandardPropSelections(picks, { league, env = process.env } = {}) {
  if (!picks.length) return picks;
  const proofs = picks.map(pick => pick.quote_receipt?.standard_market);
  if (proofs.some(proof => !proof)) throw new Error('Selected prop has no standard-market receipt');
  const sport = SPORTS[league];
  const eventIds = [...new Set(proofs.map(proof => proof.event_id))];
  const boards = new Map();
  for (const eventId of eventIds) {
    const keys = [...new Set(proofs.filter(proof => proof.event_id === eventId).map(proof => proof.market_key))].sort();
    boards.set(eventId, await feed(sport, `events/${encodeURIComponent(eventId)}/odds`, { markets: keys.join(','), regions: 'us', oddsFormat: 'american' }, { fresh: true, env }));
  }
  // A moved or uncorroborated line withholds THAT ticket, exactly as the BDL
  // recheck in verifyPropQuotes does; the batch fails only when nothing
  // remains. A changed game identity still fails the whole batch.
  const verified = [];
  for (const pick of picks) {
    const receipt = pick.quote_receipt;
    const proof = receipt.standard_market;
    const board = boards.get(proof.event_id);
    const identity = { home_team: proof.home_team, away_team: proof.away_team, commence_time: proof.kickoff };
    if (!matchingOddsEvent([board.data], identity, sport)) throw new Error('Standard prop verification event changed');
    const row = { player: pick.player, prop_type: receipt.prop_type, line: receipt.line,
      [`${receipt.side}_vendor`]: receipt.bookmaker, [`${receipt.side}_source_market`]: receipt.source_market };
    const current = standardMatch(board.data, row, receipt.side, board.fetched_at, league);
    if (!current) {
      console.warn(`[Standard props] Withheld moved/uncorroborated standard line: ${pick.player} ${receipt.side} ${receipt.line} ${receipt.odds} (${receipt.bookmaker} ${proof.market_key})`);
      continue;
    }
    verified.push({ ...pick, quote_receipt: { ...receipt, standard_market: current } });
  }
  if (!verified.length) throw new Error('Selected standard prop lines moved or are no longer corroborated; fresh analysis required');
  return verified;
}
