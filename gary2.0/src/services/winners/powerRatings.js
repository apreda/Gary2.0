// THE WORST MATCHUPS OFF GARY'S BOARDS (founder, Oct 23 2026: "those are way too hard to predict when it's literally
// like the 4 worst teams in the league playing each other ... not just by record but ... the power rankings, which
// adjust each week"). ESPN's power index (NFL FPI, NBA BPI) rates every team from its margins and schedule and updates
// through the season. Of a slate's games where both teams are in the league's bottom third, the two with the lowest
// combined rating are left off the NFL and NBA boards; Gary still picks them for the Picks page. A rating that does not
// load leaves nothing off and the log says so.
import { espnNbaTeamIs } from '../providers/espnRecaps.js';

const PATH = { NFL: 'football/nfl', NBA: 'basketball/nba' };
const INDEX = { NFL: 'fpi', NBA: 'bpi' };
const TTL_MS = 60 * 60_000;
const cache = new Map();   // league → { at, ratings }

/** Every team's power rating, [{ team, rating }], from ESPN's power index; cached an hour. */
export async function fetchPowerRatings(league, { fetchImpl = fetch, now = Date.now() } = {}) {
  const hit = cache.get(league);
  if (hit && now - hit.at < TTL_MS) return hit.ratings;
  const url = `https://site.web.api.espn.com/apis/fitt/v3/sports/${PATH[league]}/powerindex?region=us&lang=en`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`ESPN power index ${res.status}`);
  const body = await res.json();
  const ratings = (body?.teams || []).map((t) => ({
    team: t.team,
    rating: Number((t.categories || []).find((c) => c?.name === INDEX[league])?.values?.[0]),
  })).filter((r) => r.team && Number.isFinite(r.rating));
  if (ratings.length < 20) throw new Error(`ESPN power index: ${ratings.length} teams`);
  cache.set(league, { at: now, ratings });
  return ratings;
}

/**
 * The slate's worst matchups: games ({ gameId, home, away }) whose two teams are both in the bottom third of the
 * ratings, the lowest combined rating first, at most `max`. Returns Map gameId → the reason, in words.
 */
export function worstMatchups(games, ratings, { league, max = 2 } = {}) {
  const ranked = [...ratings].sort((a, b) => b.rating - a.rating);
  const bottom = Math.floor(ranked.length / 3);
  const find = (name) => {
    const i = ranked.findIndex((r) => espnNbaTeamIs(r.team, name));
    return i < 0 ? null : { ...ranked[i], rank: i + 1 };
  };
  const both = [];
  for (const g of games || []) {
    const h = find(g.home), a = find(g.away);
    if (!h || !a || h.rank <= ranked.length - bottom || a.rank <= ranked.length - bottom) continue;
    both.push({ g, h, a, sum: h.rating + a.rating });
  }
  const label = INDEX[league]?.toUpperCase() || 'power index';
  const out = new Map();
  for (const { g, h, a } of both.sort((x, y) => x.sum - y.sum).slice(0, max)) {
    out.set(String(g.gameId), `two bottom-third teams by ESPN's ${label}: ${a.team.shortDisplayName || a.team.displayName} ${a.rating} (${a.rank} of ${ranked.length}), ${h.team.shortDisplayName || h.team.displayName} ${h.rating} (${h.rank} of ${ranked.length})`);
  }
  return out;
}

/**
 * What stays off a board today, Map gameId → reason: the day's big games (they go on Winners through the sweep, never
 * from a board) and, for the NFL and NBA, the slate's two worst matchups. `slate`: [{ gameId, home, away }] for the
 * whole day, so a board boarded in batches leaves the same games off each time.
 */
export async function offTheBoard(client, { date, league, slate, log = console } = {}) {
  const off = new Map();
  const { data: bigs, error } = await client.from('winners_big_games').select('game_id').eq('game_date', date).eq('league', league);
  if (error) throw error;
  for (const b of bigs || []) off.set(String(b.game_id), 'a big game: it goes on Winners as one, not from the board');
  if (!PATH[league]) return off;
  try {
    const ratings = await fetchPowerRatings(league);
    for (const [id, why] of worstMatchups(slate.filter((g) => !off.has(String(g.gameId))), ratings, { league })) off.set(id, why);
  } catch (e) {
    log.warn?.(`[${league} Board] power ratings unavailable (${e?.message || e}); no matchup is left off for it`);
  }
  return off;
}
