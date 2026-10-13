/**
 * An NBA team's depth chart from ESPN's free feed (founder, Oct 13 2026: ESPN replaces the lapsed Tank01 depth
 * chart). Same shape the tool returned from Tank01: { team, depthChart: { PG: [{ depth, name }], ... } }, plus the
 * feed's own injury note on a listed player and when ESPN last updated the chart. ESPN's predictor, odds and
 * against-the-spread blocks are never read here.
 */
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
// BDL / common abbreviations ESPN writes differently.
const ESPN_ABBREVIATION = { GSW: 'GS', NOP: 'NO', NYK: 'NY', SAS: 'SA', UTA: 'UTAH', WAS: 'WSH' };

async function getJson(url, fetchImpl) {
  // A plain request: ESPN refuses an unfamiliar custom agent name (403) and serves the default one.
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`ESPN unavailable (${response.status})`);
  return response.json();
}

export async function fetchNbaDepthChart(teamAbv, { fetchImpl = fetch } = {}) {
  const wanted = String(teamAbv || '').toUpperCase().replace(/[^A-Z]/g, '');
  try {
    const teams = (await getJson(`${BASE}/teams`, fetchImpl)).sports?.[0]?.leagues?.[0]?.teams?.map((t) => t.team) || [];
    const team = teams.find((t) => t.abbreviation === (ESPN_ABBREVIATION[wanted] || wanted));
    if (!team) return { team: wanted, error: 'Team not found in depth charts' };
    const chart = await getJson(`${BASE}/teams/${team.id}/depthcharts`, fetchImpl);
    const positions = chart.depthchart?.[0]?.positions || {};
    const depthChart = {};
    for (const [pos, slot] of Object.entries(positions)) {
      depthChart[pos.toUpperCase()] = (slot.athletes || []).map((a, i) => ({
        depth: i + 1,
        name: a.displayName,
        ...(a.injuries?.length ? { injury: a.injuries[0].longComment || a.injuries[0].shortComment || 'listed injured', injuryDate: a.injuries[0].date || null } : {}),
      }));
    }
    if (!Object.keys(depthChart).length) return { team: wanted, error: 'No depth chart published' };
    return { team: wanted, source: 'ESPN depth chart', updatedAt: chart.timestamp || null, depthChart };
  } catch (error) {
    return { team: wanted, error: error.message };
  }
}
