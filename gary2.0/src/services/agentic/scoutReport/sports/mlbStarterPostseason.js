/**
 * A STARTER'S POSTSEASON, GAME BY GAME — MLB (founder GO, Oct 7 2026).
 *
 * The desk's starter lines were the regular season only: BDL is never asked
 * for postseason rows in the pick lane, so Newcomb, opening on one day's rest
 * in ALDS Game 3, read as his 162-game season. The founder: "it needs to be
 * current to the moment right now Oct 7th 2026." This prints every appearance
 * the starter has made this postseason, one line each, from the MLB Stats API
 * (the same source as the lineup cards' postseason lines). Facts only; an
 * empty postseason says so; a failed feed prints nothing.
 */
import { getCachedOrFetch } from '../../../ballDontLieService.js';

const STATSAPI = 'https://statsapi.mlb.com/api/v1';

export async function postseasonLog(personId, season, fetchImpl) {
  return getCachedOrFetch(`mlb_pitcher_postseason_log_${personId}_${season}`, async () => {
    const resp = await fetchImpl(`${STATSAPI}/people/${personId}/stats?stats=gameLog&group=pitching&season=${season}&gameType=P`, { signal: AbortSignal.timeout(12000) });
    if (!resp.ok) throw new Error(`statsapi pitcher postseason log ${resp.status}`);
    const json = await resp.json();
    return json?.stats?.[0]?.splits || [];
  }, 10);
}

const day = (date) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });

/** "This postseason, game by game: Oct 1 at Astros (start): 6.0 IP, 4 H, 1 ER, 1 BB, 7 K, 92 pitches" or null on a failed feed. */
export async function mlbStarterPostseasonLines({ personId, season, beforeDate, fetchImpl = fetch } = {}) {
  if (!personId || !season) return null;
  try {
    const games = (await postseasonLog(personId, season, fetchImpl)).filter((g) => !beforeDate || g.date < beforeDate);
    if (!games.length) return '  This postseason: no appearances before tonight.';
    const lines = games.map((g) => {
      const s = g.stat || {};
      const where = `${g.isHome ? 'vs' : 'at'} ${g.opponent?.name || 'opponent'}`;
      const role = Number(s.gamesStarted) > 0 ? 'start' : 'relief';
      return `    ${day(g.date)} ${where} (${role}): ${s.inningsPitched ?? '—'} IP, ${s.hits ?? '—'} H, ${s.earnedRuns ?? '—'} ER, ${s.baseOnBalls ?? '—'} BB, ${s.strikeOuts ?? '—'} K${s.numberOfPitches != null ? `, ${s.numberOfPitches} pitches` : ''}`;
    });
    return `  This postseason, game by game:\n${lines.join('\n')}`;
  } catch {
    return null;
  }
}
