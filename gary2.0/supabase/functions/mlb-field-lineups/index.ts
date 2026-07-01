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
//
// PROJECTED-LINEUP FALLBACK: for any game on today's slate with NO posted BDL sheet,
// a PROJECTED payload is built from each team's most recent confirmed regulars (today's
// flags refreshed) + today's REAL probable starter (MLB Stats API hydrate=probablePitcher),
// written with status='projected'. When the confirmed sheet later posts it UPSERT-overwrites
// the projected row in place (status -> confirmed). So EVERY game shows a field immediately.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BDL_KEY = Deno.env.get("BALLDONTLIE_API_KEY") ?? "";
const BDL_BASE = "https://api.balldontlie.io";
// MLB Stats API — free, no key. Used to hydrate today's REAL probable starters
// (?hydrate=probablePitcher) for the projected-lineup fallback's pitcher slot.
const MLB_STATS_BASE = "https://statsapi.mlb.com/api/v1";

function estDate(offset = 0): string {
  const d = new Date(Date.now() + offset * 86400000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}
const handOf = (bt?: string) => (bt || "").split("/")[1]?.trim() || (bt || "").slice(-1) || "";
const batsOf = (bt?: string) => (bt || "").split("/")[0]?.trim() || "";
// BDL probable pitcher (from getMlbLineups) → the { name, hand, playerId } shape projTeam
// expects. Used as the projected pitcher source when the MLB Stats API schedule is down.
const bdlProbable = (p: any) => p?.name ? { name: p.name, hand: handOf(p.batsThrows), playerId: String(p.playerId ?? "") } : null;

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

// MLB Stats API schedule for a date, hydrated with probable starters. Flattens
// dates[].games[] → game[]. No key needed; plain fetch works in the edge runtime.
async function getMlbSchedule(date: string): Promise<any[]> {
  const res = await fetch(`${MLB_STATS_BASE}/schedule?sportId=1&date=${date}&hydrate=probablePitcher,linescore`);
  if (!res.ok) throw new Error(`MLB Stats API schedule ${res.status}`);
  const data = await res.json();
  const games: any[] = [];
  for (const d of (data?.dates || [])) for (const g of (d?.games || [])) games.push(g);
  return games;
}

// Match a BDL game side (abbreviation + name) to an MLB Stats API schedule team.
// Abbreviations don't always agree across providers (AZ/ARI, CWS/CHW, ...), so we
// accept either an exact abbreviation hit OR a team-name last-word hit (mirrors the
// laptop builder's resolver).
function teamMatches(schedTeam: any, bdlAbbr?: string, bdlName?: string): boolean {
  const sAbbr = (schedTeam?.abbreviation || "").toUpperCase();
  const sName = (schedTeam?.name || schedTeam?.teamName || "").toLowerCase();
  if (sAbbr && bdlAbbr && sAbbr === String(bdlAbbr).toUpperCase()) return true;
  const last = (bdlName || "").toLowerCase().split(" ").filter(Boolean).pop();
  return !!(last && sName.includes(last));
}

// Real probable starter from the MLB Stats API schedule (hydrate=probablePitcher).
// Returns { name, hand, playerId } or null when no probable is posted yet — NEVER
// reuses a prior game's arm (the rotation turns over every ~5 days).
function probableFrom(schedTeamSide: any): { name: string; hand: string; playerId: string } | null {
  const p = schedTeamSide?.probablePitcher;
  if (!p) return null;
  const name = p.fullName || `${p.firstName || ""} ${p.lastName || ""}`.trim();
  if (!name) return null;
  return { name, hand: p.pitchHand?.code || "", playerId: String(p.id ?? "") };
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

  // BDL files late-ET (West-Coast) games under tomorrow's UTC date — fetch both UTC
  // days and keep only games whose real ET date === dateStr (adds tonight's late games,
  // drops last night's leaked-in). Mirrors JS bdl.getMlbGamesForETDate.
  const _next = new Date(`${dateStr}T00:00:00Z`);
  _next.setUTCDate(_next.getUTCDate() + 1);
  const _nextStr = _next.toISOString().slice(0, 10);
  const [_g1, _g2] = await Promise.all([
    bdlGet("/mlb/v1/games", { dates: [dateStr], per_page: "50" }),
    bdlGet("/mlb/v1/games", { dates: [_nextStr], per_page: "50" }),
  ]);
  const _seen = new Set<string>();
  const games: any[] = [];
  for (const g of [...((_g1 as any[]) || []), ...((_g2 as any[]) || [])]) {
    if (!g || g.id == null || _seen.has(String(g.id))) continue;
    const iso = g.date;
    if (!iso) continue;
    if (new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" }) !== dateStr) continue;
    _seen.add(String(g.id));
    games.push(g);
  }

  // Real probable starters for the date, hydrated once from the MLB Stats API schedule
  // (?hydrate=probablePitcher). Used to fill the PROJECTED lineup's pitcher slot with the
  // ACTUAL probable for THIS game/date — NEVER the team's last game's starter (the rotation
  // turns over every ~5 days). Falls back to BDL's probable flag below if this fails.
  let schedule: any[] = [];
  let scheduleSource = "mlb-stats-api";
  try { schedule = await getMlbSchedule(dateStr); }
  catch { scheduleSource = "bdl-fallback"; }

  // Resolve { home, away } real probables for a BDL game by matching teams against the
  // MLB Stats API schedule. Doubleheaders share teams+date — take the scheduled game
  // closest to first pitch.
  function probablesForGame(game: any, homeAbbr?: string, awayAbbr?: string) {
    const homeName = game.home_team?.full_name || game.home_team?.name || "";
    const awayName = game.away_team?.full_name || game.away_team?.name || "";
    // BDL MLB games carry first-pitch ISO in `status` (for scheduled games); fall back to
    // the slate date. Only used to break doubleheader ties, so a NaN here is harmless.
    const startMs = new Date(game.start_time || game.status || game.date || dateStr).getTime();
    const candidates = schedule.filter((g) =>
      teamMatches(g.teams?.home?.team, homeAbbr, homeName) &&
      teamMatches(g.teams?.away?.team, awayAbbr, awayName));
    const match = candidates.sort((a, b) =>
      Math.abs(new Date(a.gameDate || 0).getTime() - (startMs || 0)) -
      Math.abs(new Date(b.gameDate || 0).getTime() - (startMs || 0)))[0];
    return { home: probableFrom(match?.teams?.home), away: probableFrom(match?.teams?.away) };
  }

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

  // Projected-lineup fallback: each team's most recent CONFIRMED set of fielders, reused
  // (with today's hot/cold/HR/platoon flags refreshed) when today's sheet isn't posted yet —
  // so EVERY game shows a projected lineup that upgrades to confirmed once BDL posts the
  // sheet. NOTE: we deliberately do NOT carry over the recent sheet's pitcher — that is the
  // LAST game's starter; the projected pitcher comes from today's real probable (below).
  const recentByTeam: Record<string, { team: string; fielders: any[] }> = {};
  try {
    const rr = await sbGet("mlb_field_lineups",
      `date=lt.${dateStr}&status=eq.confirmed&select=home_team,away_team,payload&order=date.desc&limit=300`);
    for (const row of (rr || [])) {
      for (const side of ["home", "away"] as const) {
        const abbr = side === "home" ? row.home_team : row.away_team;
        const t = row.payload?.[side];
        if (abbr && !recentByTeam[abbr] && t?.fielders?.length) recentByTeam[abbr] = { team: t.team, fielders: t.fielders };
      }
    }
  } catch { /* no projected fallback if this fails */ }

  // PROJECT a team from its most recent confirmed regulars (today's flags refreshed) —
  // used when there's no usable confirmed sheet (null OR empty batters). The starting
  // PITCHER is taken from today's REAL probable (NOT the recent sheet's arm, which is the
  // LAST game's starter and almost never starting again). When no probable is posted yet
  // we mark the slot unknown/projected rather than show the wrong pitcher.
  const projTeam = (abbr: string, ownProbable: any, facingProbable: any) => {
    const rec = recentByTeam[abbr];
    if (!rec?.fielders?.length) return null;
    const fielders = rec.fielders.map((b: any) => {
      const f = flagsFor(b.playerId, b.name);
      return { ...b, heat: f.heat, hrEdge: f.hrEdge, plat: f.plat };
    });
    const pitcher = ownProbable
      ? { name: ownProbable.name, hand: ownProbable.hand, playerId: ownProbable.playerId, projected: true }
      : { name: null, hand: "", playerId: "", projected: true, unknown: true };
    const facingPitcher = facingProbable
      ? { name: facingProbable.name, hand: facingProbable.hand, playerId: facingProbable.playerId, projected: true }
      : null;
    return { team: rec.team || abbr, pitcher, facingPitcher, fielders };
  };

  const rows: any[] = [];
  const log: string[] = [];
  for (const game of games) {
    try {
      const homeAbbr = game.home_team?.abbreviation, awayAbbr = game.away_team?.abbreviation;
      if (!homeAbbr || !awayAbbr) continue;

      // Real probable starters for THIS game/date (MLB Stats API), resolved per game.
      // When the schedule fetch failed, fall back to BDL's probable from getMlbLineups below.
      const probables = probablesForGame(game, homeAbbr, awayAbbr);

      const lineups = await getMlbLineups(String(game.id));
      const home = lineups?.[homeAbbr], away = lineups?.[awayAbbr];

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

      // own pitcher = the arm on the mound; facing pitcher = the opposing arm the batters face
      let status = "confirmed";
      let payload: { home: any; away: any } = {
        home: buildTeam(home, pitcherObj(home), pitcherObj(away)),
        away: buildTeam(away, pitcherObj(away), pitcherObj(home)),
      };
      if (!payload.home && !payload.away) {
        // No usable confirmed sheet (null or empty batters) → project from recent regulars,
        // with today's REAL probable starters. When the MLB Stats API schedule was
        // unavailable, fall back to BDL's probable arm (from getMlbLineups) for the slot.
        status = "projected";
        const homeProb = probables.home || (lineups?.[homeAbbr]?.pitcher ? bdlProbable(lineups[homeAbbr].pitcher) : null);
        const awayProb = probables.away || (lineups?.[awayAbbr]?.pitcher ? bdlProbable(lineups[awayAbbr].pitcher) : null);
        payload = {
          home: projTeam(homeAbbr, homeProb, awayProb),
          away: projTeam(awayAbbr, awayProb, homeProb),
        };
      }
      if (!payload.home && !payload.away) { log.push(`${awayAbbr}@${homeAbbr}: no lineup + no recent fallback`); continue; }

      rows.push({ date: dateStr, game_id: String(game.id), game: `${awayAbbr} @ ${homeAbbr}`,
        home_team: homeAbbr, away_team: awayAbbr, status, payload,
        generated_by: status === "projected" ? "field-lineup-cloud-projected" : "field-lineup-cloud" });
      log.push(`${awayAbbr}@${homeAbbr}: ${status.toUpperCase()} home ${payload.home?.fielders?.length || 0} / away ${payload.away?.fielders?.length || 0}`);
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

  const projected = rows.filter((r) => r.status === "projected").length;
  return new Response(JSON.stringify({ ok: true, date: dateStr, games: games.length, written,
    projected, confirmed: written - projected, scheduleSource, log }),
    { headers: { "Content-Type": "application/json" } });
});
