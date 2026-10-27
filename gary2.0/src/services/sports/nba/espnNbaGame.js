/**
 * ESPN'S RECORD OF AN NBA GAME (Oct 27 2026 data loop): where it was played and each team's official box. The schedule
 * feed has no venue (Houston at San Antonio on Oct 23 was played in Austin), and the stats feed's team totals are its
 * players' rows summed: no team turnovers or team rebounds (Houston's "14 turnovers" were 16), and now and then a
 * missing shot (Dallas "41-79, 11-37" on Oct 21; the official box has 41-80, 11-38). One scoreboard call per date, one
 * summary call per game; null when ESPN has no such game, so a read says not on file rather than guessing.
 */
const scoreboards = new Map();
const summaries = new Map();
const nick = (name) => String(name || '').toLowerCase().split(' ').pop();
const get = (url) => fetch(url, { signal: AbortSignal.timeout(10_000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

async function eventOf(g) {
  const day = String(g.date || '').slice(0, 10).replace(/-/g, '');
  if (!scoreboards.has(day)) scoreboards.set(day, get(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${day}`).then((j) => j?.events || null));
  const events = await scoreboards.get(day);
  return (events || []).find((e) => {
    const c = e.competitions?.[0]?.competitors || [];
    const home = c.find((x) => x.homeAway === 'home')?.team, away = c.find((x) => x.homeAway === 'away')?.team;
    return home && away && nick(home.name || home.displayName) === nick(g.home_team?.name || g.home_team?.full_name)
      && nick(away.name || away.displayName) === nick(g.visitor_team?.name || g.visitor_team?.full_name);
  }) || null;
}

/** Where a game was played: { name, city, state, neutral } or null. */
export async function espnVenue(g) {
  const c = (await eventOf(g))?.competitions?.[0];
  return c?.venue ? { name: c.venue.fullName || null, city: c.venue.address?.city || null, state: c.venue.address?.state || null, neutral: Boolean(c.neutralSite) } : null;
}

const pair = (v) => { const m = String(v || '').match(/^(\d+)-(\d+)$/); return m ? [Number(m[1]), Number(m[2])] : [null, null]; };
/** Each team's official box for a finished game, keyed 'home' and 'away': FG, 3PT, FT made and attempted, rebounds
 * (offensive, defensive, total), assists, steals, blocks, turnovers (players' and the team's), fouls, points in the
 * paint, fast-break points and points off turnovers. Null when ESPN has no final box. */
export async function espnTeamBox(g) {
  const ev = await eventOf(g);
  if (!ev || !/final/i.test(String(ev.status?.type?.name || ev.status?.type?.description || ''))) return null;
  if (!summaries.has(ev.id)) summaries.set(ev.id, get(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${ev.id}`));
  const sum = await summaries.get(ev.id);
  const out = {};
  for (const t of sum?.boxscore?.teams || []) {
    const s = Object.fromEntries((t.statistics || []).map((x) => [x.name, x.displayValue]));
    const side = nick(t.team?.name || t.team?.displayName) === nick(g.home_team?.name || g.home_team?.full_name) ? 'home' : 'away';
    const [fgm, fga] = pair(s['fieldGoalsMade-fieldGoalsAttempted']);
    const [fg3m, fg3a] = pair(s['threePointFieldGoalsMade-threePointFieldGoalsAttempted']);
    const [ftm, fta] = pair(s['freeThrowsMade-freeThrowsAttempted']);
    const n = (k) => (s[k] == null || s[k] === '' ? null : Number(s[k]));
    out[side] = { fgm, fga, fg3m, fg3a, ftm, fta, reb: n('totalRebounds'), oreb: n('offensiveRebounds'), dreb: n('defensiveRebounds'), ast: n('assists'),
      stl: n('steals'), blk: n('blocks'), turnover: n('totalTurnovers') ?? n('turnovers'), teamTurnovers: n('teamTurnovers'), pf: n('fouls'),
      paint: n('pointsInPaint'), fastBreak: n('fastBreakPoints'), offTurnovers: n('turnoverPoints') };
  }
  return out.home && out.away && out.home.fga != null && out.away.fga != null ? out : null;
}

const keyOf = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '').replace(/[^a-z]/g, '');
/** Each player's official line for a finished game: [{ side, name, key, last, min, pts, reb, oreb, dreb, ast, stl, blk,
 * turnover, pf, fgm, fga, fg3m, fg3a, ftm, fta, pm }], or null when ESPN has no final box. */
export async function espnPlayerLines(g) {
  const ev = await eventOf(g);
  if (!ev || !/final/i.test(String(ev.status?.type?.name || ev.status?.type?.description || ''))) return null;
  if (!summaries.has(ev.id)) summaries.set(ev.id, get(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${ev.id}`));
  const sum = await summaries.get(ev.id);
  const out = [];
  for (const t of sum?.boxscore?.players || []) {
    const side = nick(t.team?.name || t.team?.displayName) === nick(g.home_team?.name || g.home_team?.full_name) ? 'home' : 'away';
    const st = t.statistics?.[0]; const names = st?.names || st?.labels || [];
    for (const a of st?.athletes || []) {
      if (!a.stats?.length) continue;
      const v = Object.fromEntries(names.map((n, i) => [n, a.stats[i]]));
      const [fgm, fga] = pair(v.FG), [fg3m, fg3a] = pair(v['3PT']), [ftm, fta] = pair(v.FT);
      const num = (x) => (x == null || x === '' ? null : Number(x));
      out.push({ side, name: a.athlete?.displayName, key: keyOf(a.athlete?.displayName), last: keyOf(a.athlete?.lastName || String(a.athlete?.displayName || '').split(' ').pop()),
        min: num(v.MIN), pts: num(v.PTS), reb: num(v.REB), oreb: num(v.OREB), dreb: num(v.DREB), ast: num(v.AST), stl: num(v.STL), blk: num(v.BLK), turnover: num(v.TO), pf: num(v.PF),
        fgm, fga, fg3m, fg3a, ftm, fta, pm: num(String(v['+/-'] ?? '').replace('+', '')) });
    }
  }
  return out.length ? out : null;
}
export { keyOf as espnNameKey };
