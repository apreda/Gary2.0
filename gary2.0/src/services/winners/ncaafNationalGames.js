/**
 * COLLEGE BIG GAMES ON NATIONAL TV (founder, Oct 23 2026: Winners follows the TV, the games people watch): the day's
 * covered games on the broadcast networks (ABC, CBS, FOX, NBC: the Big Noon, 3:30 and night windows), read from ESPN's
 * scoreboard, the better AP rankings first (an unranked team counts 26), then the later kickoff. Up to three; they
 * stand beside college's top two ranked games (winnersRules.ncaafBigGameIds).
 */
import { espnTeamIs } from '../providers/espnRecaps.js';

const SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard';
const BROADCAST = /^(ABC|CBS|FOX|NBC)$/i;

const rankOf = (competitor) => {
  const r = Number(competitor?.curatedRank?.current);
  return Number.isFinite(r) && r >= 1 && r <= 25 ? r : 26;
};

/** Slate rows (away_team, home_team, bdl_game_id, commence_time) on a broadcast network per ESPN's events, biggest first. */
export function nationalNcaafGames(events = [], slate = [], max = 3) {
  const found = [];
  for (const e of events || []) {
    const comp = e?.competitions?.[0];
    const networks = [...new Set((comp?.broadcasts || []).filter((b) => b?.market === 'national')
      .flatMap((b) => b?.names || []).filter((n) => BROADCAST.test(String(n).trim())))];
    if (!networks.length) continue;
    const side = (s) => (comp?.competitors || []).find((c) => c?.homeAway === s);
    const home = side('home'), away = side('away');
    const row = (slate || []).find((r) => espnTeamIs(home?.team, r.home_team) && espnTeamIs(away?.team, r.away_team));
    if (!row) continue;
    found.push({ row, networks, ranks: rankOf(home) + rankOf(away), t: Date.parse(row.commence_time || e?.date) || 0 });
  }
  return found.sort((x, y) => x.ranks - y.ranks || y.t - x.t).slice(0, max);
}

/** The ET date's covered college games on a broadcast network, biggest first: [{ row, networks }]. */
export async function fetchNationalNcaafGames(etDateStr, slate, { fetchImpl = fetch, max = 3 } = {}) {
  const res = await fetchImpl(`${SCOREBOARD}?dates=${String(etDateStr).replace(/-/g, '')}&groups=80&limit=300`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`ESPN college scoreboard unavailable (${res.status})`);
  const json = await res.json();
  return nationalNcaafGames(json?.events || [], slate, max);
}
