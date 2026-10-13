/**
 * TEAM HITTING WITH RUNNERS IN SCORING POSITION (founder, Sep 25 2026: "we
 * need team RISP data for MLB game picks"). Per club: the season line with
 * runners on second or third (MLB Stats API team situational split), what its
 * pitchers allowed in the same spot, the league's season line beside them,
 * and from each box score's "Team RISP" and "Team LOB" lines the club's
 * current series, last series and last 10 games, dated with the opponent.
 *
 * Facts only, no reading on top. Additive: a source that does not answer
 * leaves its line out and never fails the pick, so these reads use their own
 * fetch instead of the StatsAPI client that records required-data failures.
 */
const BASE = 'https://statsapi.mlb.com/api/v1';

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`MLB Stats API HTTP ${res.status}`);
  return res.json();
}

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const c = (v) => n(v).toLocaleString('en-US');
const three = (v) => (v >= 1 ? v.toFixed(3) : v.toFixed(3).replace(/^0/, ''));

/** AVG/OBP/SLG/OPS from counting stats, so a league line sums honestly. */
export function slashFromTotals(s) {
  const ab = n(s.atBats), h = n(s.hits), bb = n(s.baseOnBalls), hbp = n(s.hitByPitch), sf = n(s.sacFlies), tb = n(s.totalBases);
  if (!ab) return null;
  const avg = h / ab;
  const obpDen = ab + bb + hbp + sf;
  const obp = obpDen ? (h + bb + hbp) / obpDen : 0;
  const slg = tb / ab;
  return { avg, obp, slg, ops: obp + slg };
}

const sumRows = (rows) => {
  const keys = ['atBats', 'hits', 'baseOnBalls', 'hitByPitch', 'sacFlies', 'totalBases', 'plateAppearances', 'homeRuns', 'strikeOuts'];
  const out = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const r of rows) for (const k of keys) out[k] += n(r[k]);
  return out;
};

/** "1,807 PA: .244 AVG / .339 OBP / .408 SLG (.747 OPS), 58 HR, 396 K, 209 BB" */
export function rispLine(stat, { pa = 'plateAppearances', paLabel = 'PA' } = {}) {
  const sl = slashFromTotals(stat || {});
  if (!sl) return null;
  return `${c(stat[pa])} ${paLabel}: ${three(sl.avg)} AVG / ${three(sl.obp)} OBP / ${three(sl.slg)} SLG (${three(sl.ops)} OPS), ${c(stat.homeRuns)} HR, ${c(stat.strikeOuts)} K, ${c(stat.baseOnBalls)} BB`;
}

async function loadSeasonSplits(season) {
  const q = (group) => getJson(`/teams/stats?stats=statSplits&group=${group}&season=${season}&sportIds=1&sitCodes=risp&gameType=R`)
    .then((d) => new Map((d?.stats?.[0]?.splits || []).map((s) => [String(s.team?.id), s.stat])))
    .catch(() => new Map());
  const [hitting, pitching] = await Promise.all([q('hitting'), q('pitching')]);
  return { hitting, pitching };
}

/** { risp: 'x-for-y', h, ab, lob } for one club from a box score's BATTING info. */
export function boxRisp(box, teamId) {
  const side = ['home', 'away'].find((s) => String(box?.teams?.[s]?.team?.id) === String(teamId));
  if (!side) return null;
  const fields = (box.teams[side].info || []).filter((b) => b.title === 'BATTING').flatMap((b) => b.fieldList || []);
  const risp = fields.find((f) => f.label === 'Team RISP')?.value;
  const lob = fields.find((f) => f.label === 'Team LOB')?.value;
  const m = String(risp || '').match(/(\d+)-for-(\d+)/);
  if (!m) return null;
  const lobN = String(lob || '').match(/\d+/);
  return { h: Number(m[1]), ab: Number(m[2]), lob: lobN ? Number(lobN[0]) : null, opp: box.teams[side === 'home' ? 'away' : 'home']?.team?.name, oppId: box.teams[side === 'home' ? 'away' : 'home']?.team?.id, home: side === 'home' };
}

const shortDate = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

const windowText = (list) => {
  const h = list.reduce((a, r) => a + r.h, 0);
  const ab = list.reduce((a, r) => a + r.ab, 0);
  const lob = list.filter((r) => r.lob != null);
  return `${h}-for-${ab}${ab ? ` (${three(h / ab)})` : ''}${lob.length ? `, ${lob.reduce((a, r) => a + r.lob, 0)} left on base` : ''}`;
};
const games = (k) => `${k} game${k === 1 ? '' : 's'}`;

/**
 * This series, last series and the last 10 games from the box scores, newest
 * first (founder, Sep 25 2026: "let's also show this series, and then last
 * series, and then last 10 as well"). A series is the run of consecutive
 * games against one club at one park; "this series" is shown only when it is
 * tonight's opponent.
 */
async function recentGamesLines(teamId, list, opponentId) {
  const recent = (list || []).filter((g) => g?.gamePk).slice(-10).reverse();
  const rows = await Promise.all(recent.map(async (g) => {
    const box = await getJson(`/game/${g.gamePk}/boxscore`).catch(() => null);
    const r = boxRisp(box, teamId);
    return r ? { ...r, date: g.officialDate || String(g.gameDate || '').slice(0, 10) } : null;
  }));
  const got = rows.filter(Boolean);
  if (!got.length) return null;
  const series = [];
  for (const r of got) {
    const last = series[series.length - 1];
    if (last && last[0].oppId === r.oppId && last[0].home === r.home) last.push(r); else series.push([r]);
  }
  const lines = [];
  const current = opponentId != null && String(series[0][0].oppId) === String(opponentId) ? series.shift() : null;
  const label = (s) => `${s[0].home ? 'vs' : 'at'} ${s[0].opp}, ${games(s.length)}`;
  if (current) lines.push(`this series (${label(current)}): ${windowText(current)}`);
  if (series[0]) lines.push(`last series (${label(series[0])}): ${windowText(series[0])}`);
  lines.push(`last ${games(got.length)}: ${windowText(got)}`);
  const byGame = got.map((r) => `${shortDate(r.date)} ${r.home ? 'vs' : 'at'} ${r.opp} ${r.h}-for-${r.ab}${r.lob != null ? `, ${r.lob} LOB` : ''}`);
  return { windows: lines, byGame: `by game, newest first: ${byGame.join('; ')}` };
}

/**
 * The desk section. Empty string when nothing answered.
 * @param {object} a { homeTeam, awayTeam, homeTeamId, awayTeamId (MLB ids), homeRecentGames, awayRecentGames, season }
 */
export async function mlbTeamRispSection({ homeTeam, awayTeam, homeTeamId, awayTeamId, homeRecentGames, awayRecentGames, season }) {
  try {
    const [splits, homeRecent, awayRecent] = await Promise.all([
      loadSeasonSplits(season),
      homeTeamId ? recentGamesLines(homeTeamId, homeRecentGames, awayTeamId).catch(() => null) : null,
      awayTeamId ? recentGamesLines(awayTeamId, awayRecentGames, homeTeamId).catch(() => null) : null,
    ]);
    const blocks = [];
    for (const [name, id, recent] of [[awayTeam, awayTeamId, awayRecent], [homeTeam, homeTeamId, homeRecent]]) {
      const lines = [];
      for (const l of recent?.windows || []) lines.push(`  hitting, ${l}`);
      const bat = rispLine(splits.hitting.get(String(id)));
      if (bat) lines.push(`  hitting, season — ${bat}`);
      if (recent?.byGame) lines.push(`  hitting, ${recent.byGame}`);
      const pit = rispLine(splits.pitching.get(String(id)), { pa: 'battersFaced', paLabel: 'batters faced' });
      if (pit) lines.push(`  pitching allowed, season — ${pit}`);
      if (lines.length) blocks.push(`${name}:\n${lines.join('\n')}`);
    }
    if (!blocks.length) return '';
    const league = splits.hitting.size >= 20 ? rispLine(sumRows([...splits.hitting.values()])) : null;
    if (league) blocks.push(`MLB, all ${splits.hitting.size} clubs, season — ${league}`);
    return blocks.join('\n\n');
  } catch (e) {
    console.warn(`[Scout Report] Team RISP error: ${e.message}`);
    return '';
  }
}
