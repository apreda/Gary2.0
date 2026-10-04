/**
 * THE MARKET ON THESE TEAMS (founder GO, Oct 4 2026).
 *
 * After the Week 4 Sunday, where Gary took the side last week's results
 * pointed to (Bills over a Patriots team coming off a 35-6 loss, Rams over an
 * Eagles team coming off a 27-7 loss): the founder's point is that a team that
 * just looked bad is priced as that team, and the bet on them only exists
 * before they prove it. Gary could not see how the market had rated either
 * team before last week, or what this game's line was before last week's
 * results. This section gives him both, from the lines the odds feed recorded:
 *
 *   - each team's closing spread in every game this season and how the game
 *     finished against it;
 *   - this game's first recorded line and its line just before each team's
 *     last game, when the recorder had it then.
 *
 * Facts only. Nothing here says which side the history favours.
 */

let _db = null;
async function db() {
  if (!_db) {
    const m = await import('../../../../supabaseClient.js');
    _db = m.supabaseAdmin || m.supabase;
  }
  return _db;
}

const RULE = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
const signed = (n) => (n === 0 ? 'PK' : `${n > 0 ? '+' : ''}${n}`);
const etWhen = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const possessive = (team) => (/s$/i.test(team) ? `${team}'` : `${team}'s`);
const etDay = (iso) => new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });

/** The median of the books' last home spread before `cutoff`, or null. */
function consensusHomeSpread(rows, cutoff) {
  const last = new Map();
  for (const r of rows) {
    if (r.spread_home == null || Date.parse(r.seen_at) >= Date.parse(cutoff)) continue;
    const vendor = r.line_vendor || '';
    if (!last.has(vendor) || Date.parse(r.seen_at) > Date.parse(last.get(vendor).seen_at)) last.set(vendor, r);
  }
  const values = [...last.values()].map((r) => Number(r.spread_home)).filter(Number.isFinite).sort((a, b) => a - b);
  if (!values.length) return null;
  const mid = Math.floor(values.length / 2);
  const median = values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
  return Math.round(median * 2) / 2;
}

// One game per request: the API returns at most 1,000 rows, and a game holds
// a few hundred, so a combined request would silently cut the newest lines.
async function rowsFor(sport, gameIds) {
  const client = await db();
  const perGame = await Promise.all(gameIds.map(async (id) => {
    const { data, error } = await client.from('odds_snapshots')
      .select('game_id, spread_home, line_vendor, seen_at, commence_time')
      .eq('sport', sport).eq('game_id', String(id))
      .order('seen_at', { ascending: true }).limit(1000);
    if (error) throw new Error(error.message);
    return data || [];
  }));
  return perGame.flat();
}

/** One team's games this season against their closing lines. */
function teamLines(team, results, byGame) {
  const lines = [`${team}`];
  for (const r of [...results].sort((a, b) => new Date(b.date) - new Date(a.date))) {
    const rows = byGame.get(String(r.gameId)) || [];
    const kickoff = rows[0]?.commence_time || r.date;
    const home = consensusHomeSpread(rows, kickoff);
    const where = `${r.home ? 'vs' : '@'} ${r.opponent}`;
    const score = `${r.won ? 'W' : r.scored === r.allowed ? 'T' : 'L'} ${r.scored}-${r.allowed}`;
    if (home == null) { lines.push(`  ${etDay(r.date)} ${where}: ${score} · no closing line recorded`); continue; }
    const own = r.home ? home : -home;
    const against = (r.scored - r.allowed) + own;
    const verdict = against > 0 ? `covered by ${against}` : against < 0 ? `failed to cover by ${-against}` : 'pushed';
    lines.push(`  ${etDay(r.date)} ${where}: closed ${team.split(' ').pop()} ${signed(own)} · ${score} · ${verdict}`);
  }
  if (lines.length === 1) lines.push('  no completed games this season');
  return lines;
}

/**
 * @param {{ sport: string, game: object, homeTeam: string, awayTeam: string, homeResults: Array, awayResults: Array }} args
 *   results are footballTeamGames.loadTeamResults rows (gameId, date, home, opponent, scored, allowed, won)
 * @returns {Promise<string>} the desk section
 */
export async function marketHistorySection({ sport, game, homeTeam, awayTeam, homeResults = [], awayResults = [] }) {
  const thisGameId = String(game?.bdl_game_id ?? game?.id ?? '');
  const kickoff = game?.commence_time;
  const prior = (results) => results.filter((r) => !kickoff || new Date(r.date) < new Date(kickoff));
  const home = prior(homeResults), away = prior(awayResults);
  const ids = [...new Set([thisGameId, ...home.map((r) => r.gameId), ...away.map((r) => r.gameId)].filter(Boolean).map(String))];
  const rows = await rowsFor(sport, ids);
  const byGame = new Map();
  for (const r of rows) {
    if (!byGame.has(String(r.game_id))) byGame.set(String(r.game_id), []);
    byGame.get(String(r.game_id)).push(r);
  }

  // This game's line through last week.
  const own = byGame.get(thisGameId) || [];
  const short = (team) => team.split(' ').pop();
  const fmtHome = (spread) => (spread == null ? null : spread <= 0 ? `${short(homeTeam)} ${signed(spread)}` : `${short(awayTeam)} ${signed(-spread)}`);
  const thisGame = [];
  if (!own.length) {
    thisGame.push('No line has been recorded for this game.');
  } else {
    const first = own[0];
    thisGame.push(`First recorded: ${etWhen(first.seen_at)} ET, ${fmtHome(consensusHomeSpread(own, new Date(Date.parse(first.seen_at) + 3600_000).toISOString()))}.`);
    for (const [team, results] of [[awayTeam, away], [homeTeam, home]]) {
      const last = [...results].sort((a, b) => new Date(b.date) - new Date(a.date))[0];
      if (!last) continue;
      const lastKick = (byGame.get(String(last.gameId)) || [])[0]?.commence_time || last.date;
      const before = consensusHomeSpread(own, lastKick);
      thisGame.push(before == null
        ? `Before ${possessive(team)} last game (${etDay(lastKick)}): no line for this game had been recorded yet.`
        : `Before ${possessive(team)} last game (${etDay(lastKick)}): ${fmtHome(before)}.`);
    }
    const cutoff = kickoff && Date.parse(kickoff) < Date.now() ? kickoff : new Date().toISOString();
    const now = consensusHomeSpread(own, cutoff);
    if (now != null) thisGame.push(`Latest: ${fmtHome(now)}.`);
  }

  return `THE MARKET ON THESE TEAMS
${RULE}
How the betting market has rated each team this season: the closing spread
in every game (the median of the books' last line before kickoff, from the
lines this system recorded) and how the game finished against it. Then this
game's line through last week.

${[...teamLines(awayTeam, away, byGame), '', ...teamLines(homeTeam, home, byGame)].join('\n')}

THIS GAME'S LINE
${thisGame.join('\n')}
${RULE}
`;
}
