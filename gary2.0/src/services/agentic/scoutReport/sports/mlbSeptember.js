/**
 * SEPTEMBER, AS FACTS (founder GO, Sep 3 2026 — "fill the September facts").
 * The MLB cousin of the NBA rest edge: where a club stands in the race with
 * the games it has left, and which regulars have been sitting. Facts only,
 * in the club's own line of the desk; nothing here says what any of it
 * means for the bet. Fail-soft: a missing feed prints nothing.
 */
import { getMlbRecentGames, getGameFeed } from '../../../mlbStatsApiService.js';

const num = (v) => (v == null || v === '' || v === '-' ? null : Number(String(v).replace('+', '')));

/** Race status from the standings context row (division rank, GB, wild card GB, games played). */
export function raceLine(ctx, { season = new Date().getFullYear(), gamesInSeason = 162 } = {}) {
  if (!ctx) return null;
  const played = num(ctx.gamesPlayed);
  const left = played != null ? Math.max(0, gamesInSeason - played) : null;
  const gb = num(ctx.gamesBack);
  const wc = num(ctx.wildCardGamesBack);
  const bits = [];
  if (left != null) bits.push(`${left} game${left === 1 ? '' : 's'} to play`);
  if (ctx.divisionRank) bits.push(`${ordinal(ctx.divisionRank)} in the division${gb != null && gb > 0 ? `, ${gb} back` : gb === 0 ? ', in first' : ''}`);
  if (wc != null) bits.push(wc > 0 ? `${wc} back of the last wild card` : 'holding a wild card spot');
  if (!bits.length) return null;
  let status = null;
  if (left != null && gb != null && wc != null) {
    if (gb > left && wc > left) status = 'out of the race';
    else if ((gb <= 2 && gb > 0) || (wc <= 2 && wc > 0) || gb === 0 || wc === 0) status = 'in a tight race';
  }
  return `September: ${bits.join(', ')}${status ? ` — ${status}` : ''}.`;
}

const ordinal = (n) => { const i = Number(n); if (!Number.isFinite(i)) return String(n); const s = ['th', 'st', 'nd', 'rd']; const v = i % 100; return `${i}${s[(v - 20) % 10] || s[v] || s[0]}`; };

/** The batting-order starters (names) of a final boxscore. */
export async function startersOf(gamePk) {
  const feed = await getGameFeed(gamePk);
  const out = { home: [], away: [] };
  for (const side of ['home', 'away']) {
    const team = feed?.liveData?.boxscore?.teams?.[side];
    const players = team?.players || {};
    for (const id of team?.batters || []) {
      const p = players[`ID${id}`];
      if (p?.battingOrder && String(p.battingOrder).endsWith('00')) out[side].push({ id: p.person?.id, name: p.person?.fullName || '', teamId: team?.team?.id });
    }
  }
  return out;
}

/**
 * Regulars who sat in the last `recent` games: a regular started at least
 * `minStarts` of the club's last `window` finals. Returns { regulars, rested, gamesRead }.
 */
export async function restedRegulars(mlbTeamId, { window = 10, recent = 4, minStarts = 7 } = {}) {
  const games = (await getMlbRecentGames(mlbTeamId, window).catch(() => [])) || [];
  const finals = games.filter((g) => g?.gamePk).slice(-window);
  if (!finals.length) return { regulars: [], rested: [], gamesRead: 0 };
  const perGame = [];
  for (const g of finals) {
    try {
      const s = await startersOf(g.gamePk);
      const side = String(g?.teams?.home?.team?.id) === String(mlbTeamId) ? 'home' : 'away';
      perGame.push({ gamePk: g.gamePk, date: String(g.officialDate || g.gameDate || '').slice(0, 10), names: new Set(s[side].map((b) => b.name).filter(Boolean)) });
    } catch { /* one game missing is fine */ }
  }
  if (!perGame.length) return { regulars: [], rested: [], gamesRead: 0 };
  perGame.sort((a, b) => a.date.localeCompare(b.date));
  const counts = new Map();
  for (const g of perGame) for (const n of g.names) counts.set(n, (counts.get(n) || 0) + 1);
  const need = Math.min(minStarts, Math.ceil(perGame.length * 0.7));
  const regulars = [...counts.entries()].filter(([, c]) => c >= need).map(([n]) => n);
  const last = perGame.slice(-recent);
  const rested = regulars.filter((n) => last.some((g) => !g.names.has(n))).map((n) => ({ name: n, satIn: last.filter((g) => !g.names.has(n)).map((g) => g.date) }));
  return { regulars, rested, gamesRead: perGame.length };
}

/** The club's September line for the desk, or null. */
export async function septemberLine({ teamName, mlbTeamId, standingsCtx, todayEt }) {
  const parts = [];
  const race = raceLine(standingsCtx);
  if (race) parts.push(race);
  if (mlbTeamId) {
    try {
      const r = await restedRegulars(mlbTeamId);
      if (r.gamesRead >= 4) {
        parts.push(r.rested.length
          ? `Regulars who sat at least once in the last 4 games: ${r.rested.map((x) => `${x.name} (${x.satIn.length})`).join(', ')}.`
          : 'Every regular started each of the last 4 games.');
      }
    } catch { /* no rest line */ }
  }
  if (!parts.length) return null;
  return `${teamName}: ${parts.join(' ')}`;
}
