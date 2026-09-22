/**
 * NFL streaks — active team and player runs as of an ET date ($0: two
 * nflverse CSVs, no BDL calls). Founder, Sep 22 2026: the Darts page keeps
 * "player streaks and team streaks... X player on a 10-game hit streak, do
 * they keep it going?" Two weeks into a season every run is short, so runs
 * carry across from last regular season: a team that closed 2025 on six
 * wins and opened 2026 with two is on an eight-game run.
 *
 * Sources (nflverse-data releases, regular season only):
 *   schedules/games.csv                 — every game with scores and the
 *                                         closing spread (home line)
 *   stats_player/stats_player_week_Y    — weekly player lines
 *
 * Rows (same `streaks` table contract as MLB, league 'NFL'):
 *   - 'win' / 'loss'      team, W/L run >= 3            "W6 — outscored foes 171-98"
 *   - 'cover' / 'nocover' team, ATS run >= 3            "6 straight covers"
 *   - 'td'                player, TD in >= 3 straight   "TD in 5 straight — 7 total"
 *   - 'rush100'/'rec100'  player, 100-yard games >= 2   "3 straight 100-yard games"
 *
 * A player's streak counts the games he played (a week with no line is a
 * game missed, not a break). next_game is the team's next scheduled game:
 * "vs Rams · Sun 4:25 PM ET". Idempotent: delete-then-insert per
 * (game_date, 'NFL').
 */

export const RELEASE_BASE = 'https://github.com/nflverse/nflverse-data/releases/download';
const REQUEST_TIMEOUT_MS = 60_000;

export const TEAM_NAMES = {
  ARI: 'Arizona Cardinals', ATL: 'Atlanta Falcons', BAL: 'Baltimore Ravens', BUF: 'Buffalo Bills',
  CAR: 'Carolina Panthers', CHI: 'Chicago Bears', CIN: 'Cincinnati Bengals', CLE: 'Cleveland Browns',
  DAL: 'Dallas Cowboys', DEN: 'Denver Broncos', DET: 'Detroit Lions', GB: 'Green Bay Packers',
  HOU: 'Houston Texans', IND: 'Indianapolis Colts', JAX: 'Jacksonville Jaguars', KC: 'Kansas City Chiefs',
  LA: 'Los Angeles Rams', LAC: 'Los Angeles Chargers', LV: 'Las Vegas Raiders', MIA: 'Miami Dolphins',
  MIN: 'Minnesota Vikings', NE: 'New England Patriots', NO: 'New Orleans Saints', NYG: 'New York Giants',
  NYJ: 'New York Jets', PHI: 'Philadelphia Eagles', PIT: 'Pittsburgh Steelers', SEA: 'Seattle Seahawks',
  SF: 'San Francisco 49ers', TB: 'Tampa Bay Buccaneers', TEN: 'Tennessee Titans', WAS: 'Washington Commanders',
};
const nickname = (abbr) => (TEAM_NAMES[abbr] || abbr).split(' ').slice(-1)[0];

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length);
  if (!lines.length) return [];
  const split = (line) => {
    const out = []; let cur = ''; let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (c === ',' && !q) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out;
  };
  const head = split(lines[0]);
  return lines.slice(1).map((l) => { const v = split(l); const o = {}; head.forEach((h, i) => { o[h] = v[i] ?? ''; }); return o; });
}

export async function fetchCsv(url, fetchImpl = globalThis.fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`nflverse ${res.status} for ${url}`);
    return parseCsv(await res.text());
  } finally { clearTimeout(timer); }
}

const ET_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function nextGameLabel(game, team) {
  const home = game.home_team === team;
  const opp = home ? game.away_team : game.home_team;
  const d = new Date(`${game.gameday}T12:00:00-04:00`);
  const day = ET_DAYS[d.getUTCDay()];
  let clock = '';
  if (/^\d{2}:\d{2}$/.test(game.gametime || '')) {
    const [h, m] = game.gametime.split(':').map(Number);
    const hour = ((h + 11) % 12) + 1;
    clock = ` ${hour}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'} ET`;
  }
  return `${home ? 'vs' : 'at'} ${nickname(opp)} · ${day}${clock}`;
}

/** Longest current run of `pred` at the end of a chronological list. */
function trailingRun(list, pred) {
  let n = 0;
  for (let i = list.length - 1; i >= 0; i--) { if (pred(list[i])) n++; else break; }
  return n;
}

export async function computeNflStreaks({ date, seasons, fetchImpl = globalThis.fetch } = {}) {
  const asOf = String(date);
  const season = Number(asOf.slice(0, 4));
  const years = seasons || [season - 1, season];
  const games = (await fetchCsv(`${RELEASE_BASE}/schedules/games.csv`, fetchImpl))
    .filter((g) => years.includes(Number(g.season)) && g.game_type === 'REG');
  const played = games.filter((g) => g.home_score !== '' && g.away_score !== '' && g.gameday <= asOf)
    .sort((a, b) => (a.gameday + (a.gametime || '')).localeCompare(b.gameday + (b.gametime || '')));
  const upcoming = games.filter((g) => g.gameday > asOf || (g.gameday === asOf && g.home_score === ''))
    .sort((a, b) => (a.gameday + (a.gametime || '')).localeCompare(b.gameday + (b.gametime || '')));
  const nextByTeam = new Map();
  for (const g of upcoming) {
    for (const t of [g.home_team, g.away_team]) if (!nextByTeam.has(t)) nextByTeam.set(t, nextGameLabel(g, t));
  }

  const rows = [];
  const byTeam = new Map();
  for (const g of played) {
    const hs = Number(g.home_score), as = Number(g.away_score);
    const spread = g.spread_line === '' ? null : Number(g.spread_line);   // home margin the market expected
    for (const [team, mine, theirs, isHome] of [[g.home_team, hs, as, true], [g.away_team, as, hs, false]]) {
      const margin = mine - theirs;
      const line = spread == null ? null : (isHome ? spread : -spread);
      const cover = line == null || margin + line === 0 ? null : margin + line > 0;
      if (!byTeam.has(team)) byTeam.set(team, []);
      byTeam.get(team).push({ won: margin > 0, lost: margin < 0, cover, mine, theirs });
    }
  }
  for (const [team, list] of byTeam) {
    const name = TEAM_NAMES[team] || team;
    const next = nextByTeam.get(team) || null;
    const w = trailingRun(list, (x) => x.won), l = trailingRun(list, (x) => x.lost);
    if (w >= 3) {
      const tail = list.slice(-w);
      rows.push({ league: 'NFL', subject_type: 'team', subject: name, team: name, kind: 'win', length: w,
        detail: `W${w} — outscored foes ${tail.reduce((a, x) => a + x.mine, 0)}-${tail.reduce((a, x) => a + x.theirs, 0)}`, next_game: next });
    } else if (l >= 3) {
      const tail = list.slice(-l);
      rows.push({ league: 'NFL', subject_type: 'team', subject: name, team: name, kind: 'loss', length: l,
        detail: `L${l} — outscored ${tail.reduce((a, x) => a + x.theirs, 0)}-${tail.reduce((a, x) => a + x.mine, 0)}`, next_game: next });
    }
    const decided = list.filter((x) => x.cover !== null);
    const c = trailingRun(decided, (x) => x.cover === true), nc = trailingRun(decided, (x) => x.cover === false);
    if (c >= 3) rows.push({ league: 'NFL', subject_type: 'team', subject: name, team: name, kind: 'cover', length: c, detail: `${c} straight covers`, next_game: next });
    else if (nc >= 3) rows.push({ league: 'NFL', subject_type: 'team', subject: name, team: name, kind: 'nocover', length: nc, detail: `${nc} straight against the spread`, next_game: next });
  }

  // Players: weekly lines, regular season, in game order.
  const weekly = [];
  for (const y of years) {
    try {
      const lines = await fetchCsv(`${RELEASE_BASE}/stats_player/stats_player_week_${y}.csv`, fetchImpl);
      weekly.push(...lines.filter((r) => r.season_type === 'REG'));
    } catch (err) {
      if (y === season) throw err;   // last season missing is a real failure too, but this season's file is the one we cannot do without
      console.warn(`[nflStreaks] ${y} weekly lines unavailable: ${err.message}`);
    }
  }
  const byPlayer = new Map();
  for (const r of weekly) {
    if (!['RB', 'WR', 'TE', 'QB', 'FB'].includes(r.position)) continue;
    const key = r.player_id;
    if (!byPlayer.has(key)) byPlayer.set(key, { name: r.player_display_name, team: r.team, lines: [] });
    const p = byPlayer.get(key);
    p.team = r.team;
    p.lines.push({ season: Number(r.season), week: Number(r.week),
      td: Number(r.rushing_tds || 0) + Number(r.receiving_tds || 0),
      rush: Number(r.rushing_yards || 0), rec: Number(r.receiving_yards || 0) });
  }
  for (const [, p] of byPlayer) {
    p.lines.sort((a, b) => a.season - b.season || a.week - b.week);
    const teamName = TEAM_NAMES[p.team] || p.team;
    const next = nextByTeam.get(p.team) || null;
    const td = trailingRun(p.lines, (x) => x.td > 0);
    if (td >= 3) {
      const total = p.lines.slice(-td).reduce((a, x) => a + x.td, 0);
      rows.push({ league: 'NFL', subject_type: 'player', subject: p.name, team: teamName, kind: 'td', length: td,
        detail: `TD in ${td} straight — ${total} total`, next_game: next });
    }
    const rush = trailingRun(p.lines, (x) => x.rush >= 100);
    if (rush >= 2) rows.push({ league: 'NFL', subject_type: 'player', subject: p.name, team: teamName, kind: 'rush100', length: rush,
      detail: `${rush} straight 100-yard rushing games`, next_game: next });
    const rec = trailingRun(p.lines, (x) => x.rec >= 100);
    if (rec >= 2) rows.push({ league: 'NFL', subject_type: 'player', subject: p.name, team: teamName, kind: 'rec100', length: rec,
      detail: `${rec} straight 100-yard receiving games`, next_game: next });
  }
  return rows.map((r) => ({ game_date: asOf, ...r }));
}

export async function writeNflStreaks({ supabase, date, dryRun = false, fetchImpl } = {}) {
  const rows = await computeNflStreaks({ date, fetchImpl });
  const counts = {};
  for (const r of rows) counts[r.kind] = (counts[r.kind] || 0) + 1;
  if (dryRun) return { rows, counts };
  const del = await supabase.from('streaks').delete().eq('game_date', date).eq('league', 'NFL');
  if (del.error) throw new Error(`streaks delete failed: ${del.error.message}`);
  if (rows.length) {
    const ins = await supabase.from('streaks').insert(rows);
    if (ins.error) throw new Error(`streaks insert failed: ${ins.error.message}`);
  }
  return { rows, counts };
}
