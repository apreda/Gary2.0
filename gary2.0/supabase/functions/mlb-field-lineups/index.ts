// Supabase Edge Function: mlb-field-lineups
//
// Cloud port of run-mlb-field-lineups.js — builds the per-game MLB "field lineup"
// payload the iOS field view renders (each team's 9 fielders w/ position, batting
// order, bats, season OPS + hot/cold / HR-edge / platoon / fill-in flags, plus the
// opposing probable pitcher), so lineups populate 24/7 as they post (~2-3h before
// first pitch) with no laptop. Designed for pg_cron every ~30 min.
//
// Upserts on the table's UNIQUE(date, game_id) (merge-duplicates) — flicker-free,
// unlike the laptop builder's delete-day-then-insert. Faithful port of the BDL
// getMlbLineups transform (incl. the conflicting-probable-pitcher null guard) and
// the fielder flag/fill-in logic. Splits/BvP/xStats are NOT duplicated here — they
// live in player_insight_cards; iOS pulls the full card on tap by player_id.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BDL_KEY = Deno.env.get("BALLDONTLIE_API_KEY") ?? "";
const BDL_BASE = "https://api.balldontlie.io";

function estDate(offset = 0): string {
  const d = new Date(Date.now() + offset * 86400000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}
const handOf = (bt?: string) => (bt || "").split("/")[1]?.trim() || (bt || "").slice(-1) || "";
const batsOf = (bt?: string) => (bt || "").split("/")[0]?.trim() || "";

const sbHeaders = {
  apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json",
};
async function sbGet(table: string, query: string): Promise<any[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: sbHeaders });
  if (!res.ok) throw new Error(`${table} GET ${res.status}`);
  return await res.json();
}
async function bdlGet(path: string, params: Record<string, string | string[]>): Promise<any[]> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((x) => qs.append(`${k}[]`, x)); else qs.append(k, v);
  }
  const res = await fetch(`${BDL_BASE}${path}?${qs.toString()}`, { headers: { Authorization: BDL_KEY } });
  if (!res.ok) throw new Error(`BDL ${path} ${res.status}`);
  const json = await res.json();
  return Array.isArray(json?.data) ? json.data : [];
}

// Port of bdl.getMlbLineups: group entries by team abbr → { batters[], pitcher, teamName }.
// A team handed TWO different probable starters (stale + updated) gets a null pitcher —
// we refuse to guess which is real (pins H2H/form on the wrong arm otherwise).
async function getMlbLineups(gameId: string): Promise<Record<string, any> | null> {
  const entries = await bdlGet("/mlb/v1/lineups", { game_ids: [gameId], per_page: "100" });
  if (!entries.length) return null;
  const teams: Record<string, any> = {};
  for (const e of entries) {
    const abbr = e.team?.abbreviation;
    if (!abbr) continue;
    if (!teams[abbr]) teams[abbr] = { batters: [], pitcher: null, teamName: e.team?.display_name || e.team?.name, _conflict: false };
    const playerName = e.player?.full_name || `${e.player?.first_name} ${e.player?.last_name}`;
    if (e.is_probable_pitcher) {
      const cand = { name: playerName, position: e.position, batsThrows: e.player?.bats_throws || "", playerId: e.player?.id };
      const prior = teams[abbr].pitcher;
      if (teams[abbr]._conflict) { /* poisoned — stays null */ }
      else if (prior && prior.playerId != null && cand.playerId != null && String(prior.playerId) !== String(cand.playerId)) {
        teams[abbr].pitcher = null; teams[abbr]._conflict = true;
      } else teams[abbr].pitcher = cand;
    } else if (e.batting_order != null) {
      teams[abbr].batters.push({ name: playerName, position: e.position, battingOrder: e.batting_order,
        batsThrows: e.player?.bats_throws || "", playerId: e.player?.id });
    }
  }
  for (const abbr of Object.keys(teams)) teams[abbr].batters.sort((a: any, b: any) => a.battingOrder - b.battingOrder);
  return teams;
}

Deno.serve(async (req) => {
  if (!BDL_KEY) return new Response(JSON.stringify({ ok: false, error: "BALLDONTLIE_API_KEY not set" }),
    { status: 500, headers: { "Content-Type": "application/json" } });

  const url = new URL(req.url);
  const dateStr = url.searchParams.get("date") || estDate();
  const season = Number(dateStr.slice(0, 4));

  const games = await bdlGet("/mlb/v1/games", { dates: [dateStr], per_page: "50" });

  // today's MLB insight_connections → hot/cold / HR / platoon flags by player
  let insights: any[] = [];
  try { insights = await sbGet("insight_connections", `date=eq.${dateStr}&league=eq.MLB&select=category,headline,player_id&limit=2000`); }
  catch { /* flags fall back to steady */ }
  function flagsFor(playerId: any, name: string) {
    const n = (name || "").toLowerCase();
    const mine = insights.filter((r) =>
      (r.player_id && String(r.player_id) === String(playerId)) || (n && (r.headline || "").toLowerCase().includes(n)));
    const has = (...cats: string[]) => mine.some((r) => cats.includes(r.category));
    return { heat: has("heat_check") ? "hot" : has("cooling_off") ? "cold" : "steady",
      hrEdge: has("ballpark_shift", "hr_threat"), plat: has("platoon_edge") };
  }

  const rows: any[] = [];
  const log: string[] = [];
  for (const game of games) {
    try {
      const homeAbbr = game.home_team?.abbreviation, awayAbbr = game.away_team?.abbreviation;
      if (!homeAbbr || !awayAbbr) continue;
      const lineups = await getMlbLineups(String(game.id));
      if (!lineups) { log.push(`${awayAbbr}@${homeAbbr}: no lineup yet`); continue; }
      const home = lineups[homeAbbr], away = lineups[awayAbbr];

      const allIds: any[] = [];
      [home, away].forEach((t) => t?.batters?.forEach((b: any) => b.playerId != null && allIds.push(b.playerId)));
      const statById: Record<string, any> = {};
      if (allIds.length) {
        const stats = await bdlGet("/mlb/v1/season_stats", { season: String(season), player_ids: allIds.map(String), per_page: "100" });
        for (const s of stats) { const id = s.player?.id; if (id != null) statById[id] = { ops: s.batting_ops, avg: s.batting_avg, hr: s.batting_hr, gp: s.batting_gp ?? 0 }; }
      }

      const pitcherObj = (t: any) => t?.pitcher ? { name: t.pitcher.name, hand: handOf(t.pitcher.batsThrows), playerId: String(t.pitcher.playerId ?? "") } : null;

      const buildTeam = (t: any, ownPitcher: any, facingPitcher: any) => {
        if (!t?.batters?.length) return null;
        // Fill-in flag (MLB "contested"): a starter in FAR fewer games than the team's
        // regulars = the usual starter is resting/out. Conservative (clear backups only,
        // ≥30 team games) so a platoon regular is never mislabelled.
        const teamGames = Math.max(0, ...t.batters.map((b: any) => statById[b.playerId]?.gp ?? 0));
        const fielders = t.batters.map((b: any) => {
          const f = flagsFor(b.playerId, b.name);
          const st = statById[b.playerId] || {};
          const gp = st.gp ?? 0;
          const fillIn = teamGames >= 30 && gp > 0 && gp < 0.45 * teamGames;
          return { playerId: String(b.playerId ?? ""), name: b.name, pos: b.position,
            order: b.battingOrder, bats: batsOf(b.batsThrows),
            ops: st.ops != null ? Number(st.ops).toFixed(3) : null, seasonHr: st.hr ?? null,
            heat: f.heat, hrEdge: f.hrEdge, plat: f.plat, fillIn };
        });
        return { team: t.teamName, pitcher: ownPitcher, facingPitcher, fielders };
      };

      const payload = {
        home: buildTeam(home, pitcherObj(home), pitcherObj(away)),
        away: buildTeam(away, pitcherObj(away), pitcherObj(home)),
      };
      if (!payload.home && !payload.away) continue;

      rows.push({ date: dateStr, game_id: String(game.id), game: `${awayAbbr} @ ${homeAbbr}`,
        home_team: homeAbbr, away_team: awayAbbr, status: "confirmed", payload, generated_by: "field-lineup-cloud" });
      log.push(`${awayAbbr}@${homeAbbr}: home ${payload.home?.fielders?.length || 0} / away ${payload.away?.fielders?.length || 0}`);
    } catch (e) { log.push(`game ${game.id} error: ${String(e)}`); }
  }

  // flicker-free upsert on UNIQUE(date, game_id)
  let written = 0;
  if (rows.length) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/mlb_field_lineups?on_conflict=date,game_id`, {
      method: "POST", headers: { ...sbHeaders, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows),
    });
    if (!res.ok) return new Response(JSON.stringify({ ok: false, error: `upsert ${res.status}: ${await res.text()}`, date: dateStr }),
      { status: 500, headers: { "Content-Type": "application/json" } });
    written = rows.length;
  }

  return new Response(JSON.stringify({ ok: true, date: dateStr, games: games.length, written, log }),
    { headers: { "Content-Type": "application/json" } });
});
