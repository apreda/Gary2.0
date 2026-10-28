// College finals into team_games (founder, Oct 28 2026: a tapped team name opens its team card, college too). The
// team card reads a club's season from team_games, which the NFL and MLB fill from public schedules and the NBA from
// the local live-score poller (nbaTeamGames.js); college comes the NBA's way: the poller hands its BDL games here and
// every final of the day lands in team_games. A season's earlier finals come in once through
// scripts/backfill-ncaaf-team-games.js. Never throws; the poller's live scores don't wait on it.

const env = () => ({
  url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
  key: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
});
const headers = (key, extra = {}) => ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extra });
const etDate = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const finite = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

/** BDL's college games as team_games rows: finals only, both scores present, dated by the Eastern calendar. */
export function ncaafTeamGameRows(games) {
  return (games || []).filter((g) => /final/i.test(String(g?.status_state || g?.status || ''))
    && finite(g?.home_score) && finite(g?.away_score)
    && g?.home_team?.full_name && g?.visitor_team?.full_name && g?.date)
    .map((g) => ({
      league: 'NCAAF', game_id: String(g.id), game_date: etDate(g.date), start_time: g.date,
      game_type: 'REG', season: Number(g.season) || Number(etDate(g.date).slice(0, 4)),
      home_team: g.home_team.full_name, away_team: g.visitor_team.full_name,
      home_abbr: g.home_team.abbreviation || null, away_abbr: g.visitor_team.abbreviation || null,
      home_score: Number(g.home_score), away_score: Number(g.away_score),
    }));
}

/** Store college finals. Returns what it did; never throws. */
export async function syncNcaafTeamGames(games, { fetchImpl = fetch } = {}) {
  const { url, key } = env();
  if (!url || !key) return { skipped: 'no service credentials' };
  const finals = ncaafTeamGameRows(games);
  if (!finals.length) return { finals: 0 };
  try {
    const up = await fetchImpl(`${url}/rest/v1/team_games?on_conflict=league,game_id`, {
      method: 'POST', headers: headers(key, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(finals.map((r) => ({ ...r, updated_at: new Date().toISOString() }))),
    });
    return up.ok ? { finals: finals.length } : { finals: 0, error: `team_games upsert ${up.status}` };
  } catch (e) {
    return { error: String(e?.message || e) };
  }
}
