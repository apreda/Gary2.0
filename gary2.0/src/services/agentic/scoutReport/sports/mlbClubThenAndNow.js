/**
 * EACH CLUB, SEASON TO NOW — MLB postseason (founder GO, Oct 7 2026).
 *
 * The founder: "I'm totally fine to give the basic season-long stats, but I
 * think that also has to be highlighted and contextualized with what's happened
 * recently ... the White Sox have been so hot in the playoffs, and Gary's just
 * so far behind." And: "the record is not the best way to communicate that to
 * Gary." So each club gets the same measures over three windows, side by side:
 * the regular season, its final 30 days, and this postseason, each with its
 * game count. Measures only, no win-loss records; nothing here says what the
 * difference means. From the MLB Stats API; a window that fails prints a dash.
 */
import { getCachedOrFetch } from '../../../ballDontLieService.js';

const STATSAPI = 'https://statsapi.mlb.com/api/v1';

async function getJson(path, fetchImpl) {
  const resp = await fetchImpl(`${STATSAPI}${path}`, { signal: AbortSignal.timeout(12000) });
  if (!resp.ok) throw new Error(`statsapi ${resp.status} ${path}`);
  return resp.json();
}

async function regularSeasonEnd(season, fetchImpl) {
  return getCachedOrFetch(`mlb_regular_season_end_${season}`, async () => {
    const json = await getJson(`/seasons/${season}?sportId=1`, fetchImpl);
    return json?.seasons?.[0]?.regularSeasonEndDate || null;
  }, 720);
}

/** { hitting, pitching } stat objects for one window, or null. */
async function windowStats(teamId, season, query, fetchImpl) {
  return getCachedOrFetch(`mlb_club_window_${teamId}_${season}_${query}`, async () => {
    const json = await getJson(`/teams/${teamId}/stats?group=hitting,pitching&season=${season}&${query}`, fetchImpl);
    const out = {};
    for (const block of json?.stats || []) {
      const group = block?.group?.displayName;
      const stat = block?.splits?.[0]?.stat;
      if (group && stat) out[group] = stat;
    }
    return out.hitting || out.pitching ? out : null;
  }, 30);
}

const dayKey = (date, shift = 0) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + shift);
  return d.toISOString().slice(0, 10);
};
const num = (v, digits) => (v == null || v === '' || Number.isNaN(Number(v)) ? '—' : Number(v).toFixed(digits));
const rate = (v) => (v == null || v === '' ? '—' : String(v).replace(/^0(?=\.)/, ''));
const perGame = (count, games) => (Number(games) > 0 && count != null ? (Number(count) / Number(games)).toFixed(2) : '—');

function rows(windows) {
  const g = (w) => Number(w?.hitting?.gamesPlayed ?? w?.pitching?.gamesPlayed) || 0;
  const cell = (w, fn) => (w ? fn(w) : '—');
  return [
    ['Games', (w) => String(g(w) || '—')],
    ['Runs scored per game', (w) => perGame(w.hitting?.runs, g(w))],
    ['AVG / OBP / SLG', (w) => `${rate(w.hitting?.avg)} / ${rate(w.hitting?.obp)} / ${rate(w.hitting?.slg)}`],
    ['OPS', (w) => rate(w.hitting?.ops)],
    ['Home runs per game', (w) => perGame(w.hitting?.homeRuns, g(w))],
    ['Strikeouts per game (batting)', (w) => perGame(w.hitting?.strikeOuts, g(w))],
    ['Runs allowed per game', (w) => perGame(w.pitching?.runs, g(w))],
    ['Staff ERA', (w) => num(w.pitching?.era, 2)],
    ['Staff WHIP', (w) => num(w.pitching?.whip, 2)],
    ['Staff strikeouts per 9', (w) => num(w.pitching?.strikeoutsPer9Inn, 1)],
    ['Staff walks per 9', (w) => num(w.pitching?.walksPer9Inn, 1)],
  ].map(([label, fn]) => `  ${label}: ${windows.map((w) => cell(w, fn)).join(' | ')}`);
}

/**
 * @param {object} input
 * @param {{id: number, name: string}} input.home @param {{id: number, name: string}} input.away  MLBAM ids, desk labels
 * @param {number} input.season
 * @returns {Promise<string>} the section text, or '' when nothing could be read
 */
export async function mlbClubThenAndNow({ home, away, season, fetchImpl = fetch } = {}) {
  try {
    if (!home?.id || !away?.id || !season) return '';
    const end = await regularSeasonEnd(season, fetchImpl).catch(() => null);
    const finalStart = end ? dayKey(end, -29) : null;
    const queries = [
      'stats=season&gameType=R',
      finalStart ? `stats=byDateRange&gameType=R&startDate=${finalStart}&endDate=${end}` : null,
      'stats=season&gameType=P',
    ];
    const blocks = await Promise.all([away, home].map(async (club) => {
      const windows = await Promise.all(queries.map((q) => (q ? windowStats(club.id, season, q, fetchImpl).catch(() => null) : null)));
      if (!windows.some(Boolean)) return null;
      return [`${club.name} — regular season | final 30 days of the regular season${finalStart ? ` (${finalStart.slice(5).replace('-', '/')}–${end.slice(5).replace('-', '/')})` : ''} | this postseason`, ...rows(windows)].join('\n');
    }));
    const kept = blocks.filter(Boolean);
    if (!kept.length) return '';
    return ['The same measures for each club over three windows, side by side: the regular season, its final 30 days, and this postseason. Each window shows its game count.', ...kept].join('\n\n');
  } catch {
    return '';
  }
}
