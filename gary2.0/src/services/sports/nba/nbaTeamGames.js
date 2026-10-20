// NBA finals into team_games and the NBA win/loss runs (Oct 19 2026, for the opener). The team-streaks edge function
// writes MLB and NFL from public schedules; the NBA has no such feed it can read, so the local live-score poller hands
// its BDL games here: every final of the day lands in team_games (the log a team card and a game breakdown read), and
// the league's current runs are rebuilt from team_games through replace_team_runs, the edge function's own RPC, with
// its rule (two straight results or more). Never throws; the poller's live scores don't wait on it.

const MIN_RUN = 2;
const KEEP_DAYS = 120;

const env = () => ({
  url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
  key: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
});
const headers = (key, extra = {}) => ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extra });
const etDate = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

/** BDL's NBA games as team_games rows: finals only, scores present. */
export function nbaTeamGameRows(games) {
  return (games || []).filter((g) => /final/i.test(String(g?.status || ''))
    && Number.isFinite(Number(g?.home_team_score)) && Number.isFinite(Number(g?.visitor_team_score))
    && g?.home_team?.full_name && g?.visitor_team?.full_name)
    .map((g) => ({
      league: 'NBA', game_id: String(g.id), game_date: String(g.date || '').slice(0, 10) || etDate(g.datetime),
      start_time: g.datetime || null, game_type: g.postseason ? 'POST' : 'REG', season: Number(g.season),
      home_team: g.home_team.full_name, away_team: g.visitor_team.full_name,
      home_abbr: g.home_team.abbreviation || null, away_abbr: g.visitor_team.abbreviation || null,
      home_score: Number(g.home_team_score), away_score: Number(g.visitor_team_score),
    }));
}

/** Each club's current run from its games, newest first; the edge function's runRow. */
export function nbaRuns(gameRows) {
  const byTeam = new Map();
  for (const g of [...gameRows].sort((a, b) => String(b.start_time || b.game_date).localeCompare(String(a.start_time || a.game_date)))) {
    for (const [team, mine, theirs] of [[g.home_team, g.home_score, g.away_score], [g.away_team, g.away_score, g.home_score]]) {
      if (!byTeam.has(team)) byTeam.set(team, []);
      byTeam.get(team).push({ won: mine === theirs ? null : mine > theirs, mine, theirs });
    }
  }
  const rows = [];
  for (const [team, results] of byTeam) {
    if (!results.length || results[0].won === null) continue;
    const won = results[0].won;
    let n = 0, mine = 0, theirs = 0;
    for (const r of results) { if (r.won !== won) break; n++; mine += r.mine; theirs += r.theirs; }
    if (n < MIN_RUN) continue;
    rows.push({ league: 'NBA', subject_type: 'team', subject: team, team, kind: won ? 'win' : 'loss', length: n,
      detail: won ? `W${n} — outscored foes ${mine}-${theirs}` : `L${n} — outscored ${theirs}-${mine} in the skid`, next_game: null });
  }
  return rows;
}

/** Store the day's NBA finals and rebuild the NBA runs. Returns what it did; never throws. */
export async function syncNbaTeamGames(games, { today = etDate(new Date()), fetchImpl = fetch } = {}) {
  const { url, key } = env();
  if (!url || !key) return { skipped: 'no service credentials' };
  const finals = nbaTeamGameRows(games);
  if (!finals.length) return { finals: 0 };
  try {
    const up = await fetchImpl(`${url}/rest/v1/team_games?on_conflict=league,game_id`, {
      method: 'POST', headers: headers(key, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(finals.map((r) => ({ ...r, updated_at: new Date().toISOString() }))),
    });
    if (!up.ok) return { error: `team_games upsert ${up.status}` };
    const since = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
    const res = await fetchImpl(`${url}/rest/v1/team_games?league=eq.NBA&game_type=eq.REG&game_date=gte.${since}&select=game_date,start_time,home_team,away_team,home_score,away_score`, { headers: headers(key) });
    if (!res.ok) return { finals: finals.length, error: `team_games read ${res.status}` };
    const runs = nbaRuns(await res.json());
    const rep = await fetchImpl(`${url}/rest/v1/rpc/replace_team_runs`, {
      method: 'POST', headers: headers(key), body: JSON.stringify({ p_date: today, p_league: 'NBA', p_rows: runs }),
    });
    return { finals: finals.length, runs: runs.length, ...(rep.ok ? {} : { error: `replace_team_runs ${rep.status}` }) };
  } catch (e) {
    return { error: String(e?.message || e) };
  }
}
