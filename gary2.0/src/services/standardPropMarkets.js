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
  if (!key) throw new Error('College prop verification requires the configured Odds API key');
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
  // BDL carries the 1+ home run bet as a milestone at 0.5 (Sep 23 2026: all 36
  // HR rows for Brewers @ Phillies); accepting only 1 dropped every HR market
  // and the home run lane published nothing from Sep 21 on. The Over 0.5 still
  // has to match the same book's standard batter_home_runs market below.
  if (type === 'home_runs' && source.market?.type === 'milestone') return [0.5, 1].includes(Number(source.line_value));
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
      const named = (market.outcomes || []).filter(outcome => playerKey(outcome.description) === wantedPlayer);
      // batter_home_runs lists 1+ (Over 0.5) and 2+ (Over 1.5) as separate bets
      // for each player; read as two main lines, every HR row was discarded.
      const outcomes = row.prop_type === 'home_runs' ? named.filter(o => finiteMarketNumber(o.point) === Number(row.line)) : named;
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

// THE CONSENSUS PRICE (founder GO, Sep 23 2026): the prop model priced each
// market against the vig-free number of the very row Gary bets, and that row
// merges each side's best retail price. Sharp bettors anchor to the market's
// consensus instead. Since Sep 25 2026 the quotes are BDL's own books (every
// two-sided over/under at this player, market and line): each book's two
// prices are de-vigged and the median is the fair chance of the over.
const americanToProb = price => (price > 0 ? 100 / (price + 100) : -price / (-price + 100));

export function consensusFair(rawRows, row) {
  if (isTd(row.prop_type) || row.prop_type === 'home_runs') return null;
  const line = Number(row.line);
  const quotes = [];
  for (const r of rawRows || []) {
    if (String(r.player_id) !== String(row.player_id) || r.prop_type !== row.prop_type || r.market?.type !== 'over_under') continue;
    if (Number(r.line_value) !== line || !isAmericanPrice(r.market.over_odds) || !isAmericanPrice(r.market.under_odds)) continue;
    const po = americanToProb(Number(r.market.over_odds)), pu = americanToProb(Number(r.market.under_odds));
    quotes.push(po / (po + pu));
  }
  if (!quotes.length) return null;
  quotes.sort((a, b) => a - b);
  return { fair_over: quotes[Math.floor((quotes.length - 1) / 2)], fair_books: quotes.length };
}

/**
 * BDL IS THE STANDARD SOURCE (founder, Sep 25 2026: "let's use BDL then").
 * A side is a standard bet when its own BDL row is the book's two-sided
 * over/under at that line (BDL labels ladders "milestone" and prints one
 * over/under per player, market and book), from the book that quoted it,
 * updated within the hour. The 1+ home run and anytime touchdown keep their
 * one-sided exceptions (sourceCanBeStandard). No second provider is asked.
 */
const BDL_FRESH_MS = 60 * 60_000;
export function bdlStandardProof(row, side, observedAt = new Date().toISOString()) {
  const source = row?.[`${side}_source_market`];
  if (!source || !sourceCanBeStandard(source, row.prop_type)) return null;
  if (isTd(row.prop_type) && side !== 'over') return null;
  if (source.market?.type === 'over_under' && !(isAmericanPrice(source.market.over_odds) && isAmericanPrice(source.market.under_odds))) return null;
  if (row[`${side}_vendor`] && source.vendor !== row[`${side}_vendor`]) return null;
  if (row.player_id != null && source.player_id != null && String(source.player_id) !== String(row.player_id)) return null;
  const updated = Date.parse(source.updated_at);
  if (Number.isFinite(updated) && Date.now() - updated > BDL_FRESH_MS) return null;
  return { provider: 'balldontlie', bookmaker: source.vendor, market_type: source.market?.type ?? null,
    prop_type: row.prop_type, side, line: Number(row.line), source_price: side === 'over'
      ? (source.market?.type === 'milestone' ? source.market?.odds : source.market?.over_odds) : source.market?.under_odds,
    provider_market_id: source.id ?? null, updated_at: source.updated_at ?? null, observed_at: observedAt };
}

async function rawBdlProps(league, gameId) {
  if (gameId == null) return [];
  const { ballDontLieService } = await import('./ballDontLieService.js');
  if (league === 'MLB') return ballDontLieService.getMlbPlayerProps(gameId);
  if (league === 'NFL') return ballDontLieService.getNflPlayerProps(gameId);
  return [];
}

/** Each quote must be the quoting book's standard market at that line. */
export async function filterStandardPropMarkets(rows, { league, game, env = process.env } = {}) {
  if (!Array.isArray(rows) || !rows.length) return [];
  if (!SPORTS[league]) throw new Error(`No standard prop market adapter for ${league}`);
  const oddsApiRows = rows.filter(row => ['over', 'under'].some(side => row[`${side}_source_market`]?.provider === 'the_odds_api'));
  const bdlRows = rows.filter(row => !oddsApiRows.includes(row));
  const observedAt = new Date().toISOString();
  const gameId = game?.bdl_game_id ?? game?.id;
  const raw = bdlRows.length ? await rawBdlProps(league, gameId).catch(() => []) : [];
  const filtered = [];
  for (const row of bdlRows) {
    const verified = { ...row, standard_market: {} };
    for (const side of ['over', 'under']) {
      const proof = isAmericanPrice(row[`${side}_odds`]) ? bdlStandardProof(row, side, observedAt) : null;
      if (proof) verified.standard_market[side] = proof;
      else {
        verified[`${side}_odds`] = null;
        verified[`${side}_vendor`] = null;
        verified[`${side}_source_market`] = null;
      }
    }
    if (Object.keys(verified.standard_market).length) filtered.push({ ...verified, ...(consensusFair(raw, row) || {}) });
  }
  if (oddsApiRows.length) filtered.push(...await filterOddsApiRows(oddsApiRows, { league, game, env }));
  console.log(`[Standard props] ${league} ${gameId}: ${filtered.length}/${rows.length} markets are the book's standard over/under`);
  if (!filtered.length) throw new Error(`${league}: no standard over/under prop markets on the board`);
  return filtered;
}

/**
 * A college board quoted from The Odds API's named books (BDL carries no
 * college props) is checked against that same provider, as before. Needs a
 * working THE_ODDS_API_KEY; without one those rows cannot publish.
 */
async function filterOddsApiRows(rows, { league, game, env }) {
  const sport = SPORTS[league];
  const mapping = league === 'MLB' ? MLB : NFL;
  const keys = [...new Set(rows.map(row => mapping[row.prop_type]).filter(Boolean))].sort();
  if (!keys.length) return [];
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
  return filtered;
}

/** Recheck main-market identity immediately before publication, without changing BDL prices. */
export async function verifyStandardPropSelections(picks, { league, env = process.env } = {}) {
  if (!picks.length) return picks;
  if (picks.some(pick => !pick.quote_receipt?.standard_market)) throw new Error('Selected prop has no standard-market receipt');
  // A BDL quote's receipt was just rebuilt from the re-read BDL row
  // (verifyPropQuotes); that row must still be the book's standard market.
  const bdlPicks = [], oddsApi = [];
  for (const pick of picks) (pick.quote_receipt.standard_market.provider === 'the_odds_api' ? oddsApi : bdlPicks).push(pick);
  const verifiedBdl = [];
  for (const pick of bdlPicks) {
    const r = pick.quote_receipt;
    const proof = bdlStandardProof({ player_id: r.player_id, prop_type: r.prop_type, line: r.line,
      [`${r.side}_vendor`]: r.bookmaker, [`${r.side}_source_market`]: r.source_market }, r.side);
    if (proof) verifiedBdl.push({ ...pick, quote_receipt: { ...r, standard_market: proof } });
    else console.warn(`[Standard props] Withheld: no longer the book's standard line: ${pick.player} ${r.side} ${r.line} ${r.odds} (${r.bookmaker})`);
  }
  if (!oddsApi.length) {
    if (!verifiedBdl.length) throw new Error('Selected standard prop lines moved or are no longer standard; fresh analysis required');
    return verifiedBdl;
  }
  picks = oddsApi;
  const proofs = picks.map(pick => pick.quote_receipt.standard_market);
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
  verified.push(...verifiedBdl);
  if (!verified.length) throw new Error('Selected standard prop lines moved or are no longer corroborated; fresh analysis required');
  return verified;
}
