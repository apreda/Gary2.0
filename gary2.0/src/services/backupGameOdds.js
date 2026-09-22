import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { normalizeNcaafTeamName as teamKey } from './ncaafPropOddsService.js';
import { isAmericanPrice, finiteMarketNumber } from './marketTruth.js';

const SPORTS = new Set(['americanfootball_ncaaf', 'americanfootball_nfl', 'baseball_mlb']);
const CACHE_DIR = fileURLToPath(new URL('../../.cache/game-odds/', import.meta.url));
const TTL = 5 * 60_000;
const pending = new Map();
const keyFor = () => process.env.NODE_ENV === 'test' ? null : process.env.THE_ODDS_API_KEY || process.env.ODDS_API_KEY;
const canonicalBook = key => key === 'williamhill_us' ? 'caesars' : key;

// Match the two named teams, not their ordering: neutral-site providers can
// disagree on which is home. Kickoff identity also protects repeated matchups.
// An MLB slate row can carry the club's short name only ("Yankees", "Red
// Sox") where the feed says "New York Yankees". A doubleheader row added off
// the odds feed arrives that way (Sep 22 2026: every Rays @ Yankees props run
// failed on "no exact matchup" while the feed listed both games). The
// fallback is MLB only, where the short name is the full name's tail;
// college mascots are never identities.
const plain = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
const shortNameMatches = (full, short) => {
  const f = plain(full), s = plain(short);
  return Boolean(f && s) && (f === s || f.endsWith(' ' + s));
};

export function matchingOddsEvent(events, game, sport) {
  const home = teamKey(game.home_team), away = teamKey(game.away_team);
  const kickoff = Date.parse(game.commence_time);
  if (!home || !away || home === away || !Number.isFinite(kickoff)) return null;
  const inWindow = event => event.sport_key === sport && Math.abs(Date.parse(event.commence_time) - kickoff) <= 90 * 60_000;
  const matches = events.filter(event => {
    const h = teamKey(event.home_team), a = teamKey(event.away_team);
    return inWindow(event) && ((h === home && a === away) || (h === away && a === home));
  });
  if (matches.length === 1) return matches[0];
  if (matches.length > 1 || sport !== 'baseball_mlb') return null;
  const byShortName = events.filter(event => inWindow(event)
    && ((shortNameMatches(event.home_team, game.home_team) && shortNameMatches(event.away_team, game.away_team))
      || (shortNameMatches(event.home_team, game.away_team) && shortNameMatches(event.away_team, game.home_team))));
  return byShortName.length === 1 ? byShortName[0] : null;
}

export function namedBookmakers(event, game, now = Date.now()) {
  const home = teamKey(game.home_team), away = teamKey(game.away_team);
  return (event?.bookmakers || []).flatMap(book => {
    if (['kalshi', 'polymarket'].includes(book.key)) return [];
    const markets = (book.markets || []).flatMap(market => {
      const updatedAt = market.last_update || book.last_update;
      const age = now - Date.parse(updatedAt);
      if (!Number.isFinite(age) || age < -60_000 || age > 20 * 60_000) return [];
      if (!['h2h', 'spreads', 'totals'].includes(market.key)) return [];
      const outcomes = (market.outcomes || []).flatMap(outcome => {
        let name;
        if (market.key === 'totals') {
          name = ['Over', 'Under'].includes(outcome.name) ? outcome.name : null;
        } else {
          const identity = teamKey(outcome.name);
          name = identity === home ? game.home_team : identity === away ? game.away_team : null;
        }
        const point = finiteMarketNumber(outcome.point);
        if (!name || !isAmericanPrice(outcome.price) || (market.key !== 'h2h' && point === null)) return [];
        return [{ name, price: Number(outcome.price), ...(market.key === 'h2h' ? {} : { point }) }];
      });
      if (outcomes.length !== 2 || new Set(outcomes.map(o => o.name)).size !== 2) return [];
      if (market.key === 'spreads' && Math.abs(outcomes[0].point + outcomes[1].point) > 0.001) return [];
      if (market.key === 'totals' && outcomes[0].point !== outcomes[1].point) return [];
      return [{ key: market.key, last_update: updatedAt, outcomes }];
    });
    return markets.length ? [{ key: canonicalBook(book.key), title: book.title, last_update: book.last_update,
      source: 'the_odds_api', source_event_id: event.id, markets }] : [];
  });
}

async function cachedFeed(sport, kind) {
  const cacheKey = `${sport}-${kind}`;
  if (pending.has(cacheKey)) return pending.get(cacheKey);
  const request = (async () => {
    const path = `${CACHE_DIR}${cacheKey}.json`;
    let saved;
    try { saved = JSON.parse(await readFile(path, 'utf8')); } catch { /* first request */ }
    if (saved && Date.now() - saved.fetched_at < TTL && Array.isArray(saved.events)) return saved.events;
    const url = new URL(`https://api.the-odds-api.com/v4/sports/${sport}/${kind}`);
    url.searchParams.set('apiKey', keyFor());
    if (kind === 'odds') {
      for (const [key, value] of Object.entries({ regions: 'us', markets: 'h2h,spreads,totals', oddsFormat: 'american' })) {
        url.searchParams.set(key, value);
      }
    }
    let events;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      events = await response.json();
      if (!Array.isArray(events)) throw new Error('Invalid event list');
    } catch (error) {
      // Old event identities may still identify a known side-order mismatch;
      // old prices never stand in for a successful current quote request.
      if (kind === 'events' && saved && Date.now() - saved.fetched_at < 24 * 60 * 60_000) return saved.events;
      throw new Error(`The Odds API ${kind} unavailable (${error.name === 'Error' ? error.message : error.name})`);
    }
    await mkdir(CACHE_DIR, { recursive: true });
    const temp = `${path}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify({ fetched_at: Date.now(), events }), { mode: 0o600 });
    await rename(temp, path);
    return events;
  })();
  pending.set(cacheKey, request);
  try { return await request; } finally { pending.delete(cacheKey); }
}

const hasMarket = (game, sport) => (game.bookmakers || []).some(book => (book.markets || []).some(market =>
  market.key === (sport === 'baseball_mlb' ? 'h2h' : 'spreads')
  && market.outcomes?.length === 2 && market.outcomes.every(outcome => isAmericanPrice(outcome.price)
    && (market.key === 'h2h' || finiteMarketNumber(outcome.point) !== null))));

// The canonical BDL game remains unchanged. Only its market board is replaced,
// using complete named quotes when BDL is empty or the providers disagree on
// home/away ordering. No signs or prices are synthesized.
export async function resolveBackupGameOdds(sport, games, { load = cachedFeed, enabled = Boolean(keyFor()), now = Date.now() } = {}) {
  if (!enabled || !SPORTS.has(sport) || !games.length) return games;
  let events;
  try { events = await load(sport, 'events'); }
  catch (error) { console.warn(`[Game Odds] ${error.message}`); return games; }
  const replacements = new Map();
  for (const game of games) {
    const event = matchingOddsEvent(events, game, sport);
    if (!event) continue;
    const reversed = teamKey(event.home_team) === teamKey(game.away_team);
    if (reversed || !hasMarket(game, sport)) replacements.set(game, { event, reversed });
  }
  if (!replacements.size) return games;
  let quoted = [];
  try { quoted = await load(sport, 'odds'); }
  catch (error) { console.warn(`[Game Odds] ${error.message}`); }
  return games.map(game => {
    const replacement = replacements.get(game);
    if (!replacement) return game;
    const quote = quoted.find(event => event.id === replacement.event.id);
    const bookmakers = matchingOddsEvent(quote ? [quote] : [], game, sport) ? namedBookmakers(quote, game, now) : [];
    if (!bookmakers.length && !replacement.reversed) return game;
    const clean = { ...game };
    // Prevent pre-existing flat BDL fields from overriding named quotes later.
    for (const key of ['moneyline_home', 'moneyline_away', 'moneyline_home_odds', 'moneyline_away_odds',
      'spread_home', 'spread_away', 'spread_home_value', 'spread_away_value', 'spread_home_odds', 'spread_away_odds',
      'total', 'total_value', 'total_over_odds', 'total_under_odds', 'line_vendor']) delete clean[key];
    return { ...clean, bookmakers, market_source: 'the_odds_api', market_event_id: replacement.event.id,
      market_source_reason: replacement.reversed ? 'provider_team_order_disagreement' : 'bdl_market_missing' };
  });
}

// Carry the same board into Gary's comparison and ticket storage. Refetching
// raw BDL fields here would undo both a recovered quote and a side-order repair.
export function sportsbookRowsFromGame(game) {
  return (game.bookmakers || []).map(book => {
    const row = { vendor: book.key, displayName: book.key, source: book.source || game.market_source || 'bdl',
      source_event_id: book.source_event_id || game.market_event_id || null, source_updated_at: book.last_update || null };
    for (const market of book.markets || []) for (const outcome of market.outcomes || []) {
      const side = outcome.name === game.home_team ? 'home' : outcome.name === game.away_team ? 'away' : null;
      if (market.key === 'h2h' && side) row[`ml_${side}`] = outcome.price;
      if (market.key === 'spreads' && side) { row[`spread_${side}`] = outcome.point; row[`spread_${side}_odds`] = outcome.price; }
      if (market.key === 'totals') { row.total = outcome.point; row[`total_${outcome.name.toLowerCase()}_odds`] = outcome.price; }
    }
    return row;
  });
}
