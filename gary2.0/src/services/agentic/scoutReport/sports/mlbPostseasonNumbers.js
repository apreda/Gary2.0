/**
 * THIS POSTSEASON, BY THE NUMBERS — MLB (founder GO, Oct 4 2026).
 *
 * "Season long averages are just too old at this point ... it's about right
 * now ... who the teams are now for this game, this matchup, this series."
 * A playoff desk used to open its team numbers with the final division table
 * (103-59 over 91-71) and one line of 162-game averages. This is each club's
 * postseason line, printed ahead of them, with the game count beside it: a
 * handful of games is a count, and the desk says so. Facts only. Outside the
 * postseason, or when the feed fails, it prints nothing.
 */
import { getCachedOrFetch } from '../../../ballDontLieService.js';

const STATSAPI = 'https://statsapi.mlb.com/api/v1';

async function clubPostseasonStats(teamId, season, fetchImpl) {
  return getCachedOrFetch(`mlb_postseason_team_stats_${teamId}_${season}`, async () => {
    const resp = await fetchImpl(`${STATSAPI}/teams/${teamId}/stats?season=${season}&group=hitting,pitching&stats=season&gameType=P`, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) throw new Error(`statsapi postseason team stats ${resp.status}`);
    const json = await resp.json();
    const of = (group) => (json?.stats || []).find((s) => s?.group?.displayName === group)?.splits?.[0]?.stat || null;
    return { hitting: of('hitting'), pitching: of('pitching') };
  }, 10);
}

const perGame = (total, games) => (games > 0 && total != null ? (Number(total) / games).toFixed(1) : '—');

function clubBlock(name, stats) {
  const h = stats?.hitting, p = stats?.pitching;
  const games = Number(h?.gamesPlayed || p?.gamesPlayed || 0);
  if (!games) return `${name}: no postseason game played yet this year.`;
  const record = p?.wins != null && p?.losses != null ? ` (${p.wins}-${p.losses})` : '';
  return [
    `${name} — this postseason, ${games} game${games === 1 ? '' : 's'}${record}`,
    h ? `  Hitting: ${perGame(h.runs, games)} R/G | ${h.avg}/${h.obp}/${h.slg} | ${h.homeRuns ?? 0} HR, ${h.stolenBases ?? 0} SB | ${h.strikeOuts ?? 0} K, ${h.baseOnBalls ?? 0} BB` : null,
    p ? `  Pitching: ${perGame(p.runs, games)} RA/G | ${p.era} ERA, ${p.whip} WHIP | ${p.strikeOuts ?? 0} K, ${p.baseOnBalls ?? 0} BB, ${p.homeRuns ?? 0} HR allowed in ${p.inningsPitched} IP` : null,
  ].filter(Boolean).join('\n');
}

/**
 * @param {{id: number, name: string}} input.home @param {{id: number, name: string}} input.away  MLBAM ids, the desk's labels
 * @returns {Promise<string>} '' when neither club's line could be read
 */
export async function mlbPostseasonNumbers({ home, away, season, fetchImpl = fetch } = {}) {
  const blocks = await Promise.all([away, home].map(async (club) => {
    if (!club?.id || !club?.name) return null;
    try { return clubBlock(club.name, await clubPostseasonStats(club.id, season, fetchImpl)); } catch { return null; }
  }));
  return blocks.filter(Boolean).join('\n\n');
}
