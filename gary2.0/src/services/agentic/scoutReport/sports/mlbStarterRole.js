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

const outing = (row) => {
  const pitches = row.stat?.numberOfPitches;
  return `${day(row.date)} ${row.stat?.inningsPitched ?? '?'} IP${pitches != null ? ` (${pitches} pitches)` : ''}`;
};

const seasonGames = (rows, season) => (Array.isArray(rows) ? rows : [])
  .filter((r) => r.gameType === 'R' && Number(r.season) === Number(season) && r.date)
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
  const games = seasonGames(await Promise.resolve().then(() => getLog(personId, season)).catch(() => null), season);
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
  }
  const last = games[0];
  parts.push(`Last outing: ${outing(last)}, ${isStart(last) ? 'a start' : 'in relief'}.`);

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
