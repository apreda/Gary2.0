// NBA player streaks and Hot & Cold for the Darts page (Oct 19 2026), the NBA's half of what streaksService.js and
// nflStreaksService.js write for MLB and the NFL. From BDL's box scores of the last three weeks:
//   streaks      pts20  20 or more points in 3+ straight games played   "20+ in 4 straight — 27.5 a game"
//                dd     a double-double in 3+ straight games played      "double-double in 3 straight"
//   player_form  hot    the most points over the last three games (min. 25 minutes a game)
//                cold   established scorers (18+ a game in at least 5 of the 8 games before) with the fewest
// A streak counts the games a player played; a game he sat is not a break. next_game is his team's next game on
// the schedule ("vs NYK · Thu 7:30 PM ET"). Idempotent per (game_date, 'NBA'); team win/loss rows are the live-score
// poller's (nbaTeamGames.js). Never throws to its caller's caller: the results run wraps it.

const BASE = 'https://api.balldontlie.io/v1';
const WINDOW_DAYS = 21;
const MIN_STREAK = 3;
const FORM_GAMES = 3;
const FORM_CAP = 5;
const HOT_MIN_MINUTES = 25;
const COLD_PRIOR_GAMES = 8, COLD_PRIOR_MIN = 5, COLD_PRIOR_PPG = 18;

const minutes = (m) => { const [a, b] = String(m ?? '').split(':'); return (Number(a) || 0) + (Number(b) || 0) / 60; };
const shiftDate = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const doubleDouble = (r) => ['pts', 'reb', 'ast', 'stl', 'blk'].filter((k) => (Number(r[k]) || 0) >= 10).length >= 2;

async function bdlAll(path, key, fetchImpl) {
  const out = [];
  let cursor = null;
  for (let page = 0; page < 30; page++) {
    const url = `${BASE}/${path}${path.includes('?') ? '&' : '?'}per_page=100${cursor != null ? `&cursor=${cursor}` : ''}`;
    const res = await fetchImpl(url, { headers: { Authorization: key }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`BDL ${path} ${res.status}`);
    const j = await res.json();
    out.push(...(j.data || []));
    cursor = j.meta?.next_cursor;
    if (cursor == null) break;
  }
  return out;
}

const whenET = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' }).replace(',', '');

/** The rows for a date: { streaks, form }. Pure over the fetched data. */
export function nbaStreakRows(statRows, upcoming, date) {
  const byPlayer = new Map();
  for (const r of statRows) {
    if (!(minutes(r.min) > 0) || r?.game?.postseason) continue;
    const id = String(r.player?.id);
    if (!byPlayer.has(id)) byPlayer.set(id, { name: `${r.player.first_name} ${r.player.last_name}`.trim(), teamId: r.team?.id, team: r.team?.full_name, games: [] });
    byPlayer.get(id).games.push({ date: String(r.game?.date || '').slice(0, 10), pts: Number(r.pts) || 0, dd: doubleDouble(r), min: minutes(r.min) });
  }
  const next = new Map();
  for (const g of [...upcoming].sort((a, b) => Date.parse(a.datetime) - Date.parse(b.datetime))) {
    if (!next.has(g.home_team.id)) next.set(g.home_team.id, `vs ${g.visitor_team.abbreviation} · ${whenET(g.datetime)} ET`);
    if (!next.has(g.visitor_team.id)) next.set(g.visitor_team.id, `at ${g.home_team.abbreviation} · ${whenET(g.datetime)} ET`);
  }
  const streaks = [], hot = [], cold = [];
  for (const p of byPlayer.values()) {
    const games = p.games.sort((a, b) => b.date.localeCompare(a.date));   // newest first
    const base = { game_date: date, league: 'NBA', subject_type: 'player', subject: p.name, team: p.team, next_game: next.get(p.teamId) ?? null };
    let n = 0, sum = 0;
    for (const g of games) { if (g.pts < 20) break; n++; sum += g.pts; }
    if (n >= MIN_STREAK) streaks.push({ ...base, kind: 'pts20', length: n, detail: `20+ in ${n} straight — ${(sum / n).toFixed(1)} a game` });
    let d = 0;
    for (const g of games) { if (!g.dd) break; d++; }
    if (d >= MIN_STREAK) streaks.push({ ...base, kind: 'dd', length: d, detail: `double-double in ${d} straight` });
    const last = games.slice(0, FORM_GAMES);
    if (last.length < FORM_GAMES || !next.get(p.teamId)) continue;
    const pts = last.reduce((a, g) => a + g.pts, 0);
    const fbase = { game_date: date, league: 'NBA', player: p.name, team: p.team, next_game: next.get(p.teamId) };
    if (last.every((g) => g.min >= HOT_MIN_MINUTES)) hot.push({ ...fbase, short: `${pts} PTS`, detail: `${(pts / FORM_GAMES).toFixed(1)} a game · last ${FORM_GAMES} games`, _score: pts });
    const prior = games.slice(FORM_GAMES, FORM_GAMES + COLD_PRIOR_GAMES);
    const priorPpg = prior.length ? prior.reduce((a, g) => a + g.pts, 0) / prior.length : 0;
    if (prior.length >= COLD_PRIOR_MIN && priorPpg >= COLD_PRIOR_PPG) cold.push({ ...fbase, short: `${pts} PTS`, detail: `${(pts / FORM_GAMES).toFixed(1)} a game · last ${FORM_GAMES} games (${priorPpg.toFixed(1)} before)`, _score: pts });
  }
  const top = (list, dir, skip = new Set()) => list.filter((r) => !skip.has(r.player)).sort((a, b) => dir * (b._score - a._score)).slice(0, FORM_CAP);
  const hotRows = top(hot, 1);
  const tag = (list, kind) => list.map(({ _score, ...r }, i) => ({ ...r, kind, rank: i + 1 }));
  return { streaks, form: [...tag(hotRows, 'hot'), ...tag(top(cold, -1, new Set(hotRows.map((r) => r.player))), 'cold')] };
}

/** Write the NBA player streaks and Hot & Cold as of `date` (an ET date whose games are final). */
export async function writeNbaStreaks({ supabase, date, bdlApiKey = process.env.BALLDONTLIE_API_KEY, fetchImpl = globalThis.fetch, dryRun = false }) {
  if (!bdlApiKey) throw new Error('BALLDONTLIE_API_KEY missing');
  const days = Array.from({ length: WINDOW_DAYS }, (_, i) => shiftDate(date, -i));
  const stats = await bdlAll(`stats?${days.map((d) => `dates[]=${d}`).join('&')}`, bdlApiKey, fetchImpl);
  // The date's own games count: a pass for today, before tip, names tonight's game (Oct 28 2026: the
  // board said Maxey's next game was Friday while he played Indiana that night). Finals drop out below.
  const ahead = Array.from({ length: 4 }, (_, i) => shiftDate(date, i));
  const upcoming = (await bdlAll(`games?${ahead.map((d) => `dates[]=${d}`).join('&')}`, bdlApiKey, fetchImpl)).filter((g) => !/final/i.test(String(g.status || '')));
  const { streaks, form } = nbaStreakRows(stats, upcoming, date);
  if (dryRun) return { streaks, form };
  const del = await supabase.from('streaks').delete().eq('game_date', date).eq('league', 'NBA').in('kind', ['pts20', 'dd']);
  if (del.error) throw new Error(`streaks delete failed: ${del.error.message}`);
  if (streaks.length) {
    const ins = await supabase.from('streaks').insert(streaks);
    if (ins.error) throw new Error(`streaks insert failed: ${ins.error.message}`);
  }
  const carry = await supabase.rpc('carry_streaks_forward', { p_date: date, p_league: 'NBA' });
  if (carry.error) throw new Error(`streaks carry failed: ${carry.error.message}`);
  try {
    const delForm = await supabase.from('player_form').delete().eq('game_date', date).eq('league', 'NBA');
    if (delForm.error) throw new Error(delForm.error.message);
    if (form.length) {
      const insForm = await supabase.from('player_form').insert(form);
      if (insForm.error) throw new Error(insForm.error.message);
    }
  } catch (err) {
    console.warn(`[nbaStreaks] hot & cold not written: ${err.message}`);
  }
  return { streaks, form };
}
