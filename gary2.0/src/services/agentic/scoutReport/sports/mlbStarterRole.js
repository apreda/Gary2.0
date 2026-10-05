import { getPitcherGameLogRaw, getTeamDepthChart } from '../../../mlbStatsApiService.js';

// A listed starter's role this season, as the game log and the club's depth
// chart record it: games, starts, relief, how long his starts ran, his last
// outing and where the depth chart lists him. When the depth chart does not
// list him in the rotation, the rotation's last starts follow, so the arms
// who could pitch after him are on the desk. The season line alone
// ("32.2 IP (5 starts)") made a reliever listed to start (Richard Lovelady,
// Sep 23 2026) read as a starter; these are the facts a fan already knows.
// Facts only; what they mean is Gary's read.

const STARTS_SHOWN = 5;

const day = (ymd) => new Date(`${ymd}T12:00:00Z`)
  .toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });

// Every start with its whole line (founder, Oct 5 2026: the bullpen got every arm's full record while the
// starters got innings and pitch counts; "last 5, last 3, last 1 for sure"). Postseason starts count.
const outing = (row) => {
  const st = row.stat || {};
  const opp = row.opponent?.name ? ` ${row.isHome === false ? '@' : 'vs'} ${row.opponent.name}` : '';
  const line = [`${st.inningsPitched ?? '?'} IP`, st.hits != null ? `${st.hits} H` : null, st.earnedRuns != null ? `${st.earnedRuns} ER` : null,
    st.baseOnBalls != null ? `${st.baseOnBalls} BB` : null, st.strikeOuts != null ? `${st.strikeOuts} K` : null,
    st.homeRuns ? `${st.homeRuns} HR` : null, st.numberOfPitches != null ? `${st.numberOfPitches} pitches` : null].filter(Boolean).join(', ');
  return `${day(row.date)}${row.gameType === 'P' ? ' (postseason)' : ''}${opp}: ${line}`;
};

const outs = (ip) => { const [w, f] = String(ip ?? '0').split('.'); return Number(w) * 3 + Number(f || 0); };
const windowLine = (rows) => {
  const t = (k) => rows.reduce((a, r) => a + (Number(r.stat?.[k]) || 0), 0);
  const o = rows.reduce((a, r) => a + outs(r.stat?.inningsPitched), 0);
  const ip = `${Math.floor(o / 3)}.${o % 3}`;
  const era = o ? ((t('earnedRuns') * 27) / o).toFixed(2) : '—';
  return `${ip} IP, ${t('hits')} H, ${t('earnedRuns')} ER (${era} ERA), ${t('baseOnBalls')} BB, ${t('strikeOuts')} K, ${t('homeRuns')} HR`;
};

const seasonGames = (rows, season) => (Array.isArray(rows) ? rows : [])
  .filter((r) => ['R', 'P'].includes(r.gameType || 'R') && Number(r.season) === Number(season) && r.date)
  .sort((a, b) => String(b.date).localeCompare(String(a.date)));

const isStart = (r) => Number(r.stat?.gamesStarted) === 1;

async function rotationLastStarts(chart, personId, season, getLog) {
  const rotation = chart.filter((p) => p.role === 'SP' && p.status === 'A' && p.id && String(p.id) !== String(personId));
  if (!rotation.length) return null;
  const rows = await Promise.all(rotation.map(async (p) => {
    const games = seasonGames(await Promise.resolve().then(() => getLog(p.id, season)).catch(() => null), season);
    const last = games.find(isStart);
    return { name: p.name, last: last ? last.date : null };
  }));
  rows.sort((a, b) => String(b.last || '').localeCompare(String(a.last || '')));
  return rows.map((r) => `${r.name} ${r.last ? day(r.last) : 'no start this season'}`).join(' · ');
}

/** One desk line, or null when the log is unavailable or empty. */
export async function mlbStarterRoleLine(personId, season, teamId, {
  getLog = getPitcherGameLogRaw, getChart = getTeamDepthChart,
} = {}) {
  if (!personId || !season) return null;
  const games = seasonGames(await Promise.resolve().then(() => getLog(personId, season, { withPostseason: true })).catch(() => null), season);
  if (!games.length) return null;

  const starts = games.filter(isStart);
  const relief = games.length - starts.length;
  const role = starts.length === 0
    ? `${games.length} games, no starts, all in relief`
    : relief === 0
      ? `${games.length} games, all starts`
      : `${games.length} games: ${starts.length} starts, ${relief} in relief`;

  const parts = [`Role this season: ${role}.`];
  if (starts.length) {
    const shown = starts.slice(0, STARTS_SHOWN).map(outing).join(' · ');
    parts.push(`${starts.length > STARTS_SHOWN ? `Last ${STARTS_SHOWN} starts` : 'His starts'}, newest first: ${shown}.`);
    const windows = [];
    if (starts.length > 3) windows.push(`last 3 starts: ${windowLine(starts.slice(0, 3))}`);
    if (starts.length > 5) windows.push(`last 5 starts: ${windowLine(starts.slice(0, 5))}`);
    if (windows.length) parts.push(`${windows.join(' · ')}.`);
  }
  const last = games[0];
  parts.push(last === starts[0] ? 'Last outing: his newest start above.' : `Last outing: ${outing(last)}, ${isStart(last) ? 'a start' : 'in relief'}.`);

  const chart = teamId ? await Promise.resolve().then(() => getChart(teamId, season)).catch(() => null) : null;
  if (Array.isArray(chart) && chart.length) {
    const listed = chart.find((p) => String(p.id) === String(personId));
    const where = listed?.role === 'SP' ? 'the rotation' : listed?.role === 'P' ? 'the bullpen' : null;
    parts.push(where ? `Club depth chart lists him in ${where}.` : 'Club depth chart does not list him.');
    if (listed?.role !== 'SP') {
      const rotation = await rotationLastStarts(chart, personId, season, getLog);
      if (rotation) parts.push(`Depth-chart rotation, last start each: ${rotation}.`);
    }
  }
  return parts.join(' ');
}
