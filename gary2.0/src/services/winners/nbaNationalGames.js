/**
 * NBA BIG GAMES (founder GO, Oct 23 2026: Winners game bets are the big games people watch): the night's games on
 * national TV, read from ESPN's scoreboard. Up to two a night; when more are national, the better combined record
 * first, then the later tip. NBA TV and local channels are not national TV here.
 */
import { espnNbaTeamIs } from '../providers/espnRecaps.js';

const SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
const NATIONAL = /^(ABC|ESPN|ESPN2|NBC|Peacock|Prime Video|TNT)$/i;

const winPct = (summary) => {
  const [w, l] = String(summary || '').split('-').map(Number);
  return Number.isFinite(w) && Number.isFinite(l) && w + l > 0 ? w / (w + l) : 0.5;
};

/** Slate rows (away_team, home_team, bdl_game_id, commence_time) on national TV per ESPN's events, biggest first. */
export function nationalNbaGames(events = [], slate = [], max = 2) {
  const found = [];
  for (const e of events || []) {
    const comp = e?.competitions?.[0];
    const networks = [...new Set((comp?.broadcasts || []).filter((b) => b?.market === 'national')
      .flatMap((b) => b?.names || []).filter((n) => NATIONAL.test(String(n).trim())))];
    if (!networks.length) continue;
    const side = (s) => (comp?.competitors || []).find((c) => c?.homeAway === s);
    const home = side('home'), away = side('away');
    const row = (slate || []).find((r) => espnNbaTeamIs(home?.team, r.home_team) && espnNbaTeamIs(away?.team, r.away_team));
    if (!row) continue;
    found.push({
      row, networks,
      record: winPct(home?.records?.[0]?.summary) + winPct(away?.records?.[0]?.summary),
      t: Date.parse(row.commence_time || e?.date) || 0,
    });
  }
  return found.sort((x, y) => y.record - x.record || y.t - x.t).slice(0, max);
}

/** The ET date's national-TV NBA games from the slate, biggest first: [{ row, networks }]. */
export async function fetchNationalNbaGames(etDateStr, slate, { fetchImpl = fetch, max = 2 } = {}) {
  const res = await fetchImpl(`${SCOREBOARD}?dates=${String(etDateStr).replace(/-/g, '')}`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`ESPN scoreboard unavailable (${res.status})`);
  const json = await res.json();
  return nationalNbaGames(json?.events || [], slate, max);
}
