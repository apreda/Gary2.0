// Supabase Edge Function: grade-props
//
// Cloud grade-on-final for PROP picks (the sibling of grade-results, which does
// game picks). Runs on pg_cron so props settle 24/7 with no laptop. Ported from
// scripts/run-all-results.js (processPropBets / getStatValue / gradeProp), scoped
// to the active sports: MLB (incl. "MLB HR") + World Cup. Other leagues are
// counted-and-skipped, never silently mis-graded.
//
// Two deliberate improvements over the laptop script, both correctness-positive:
//   1. FINALITY GATE — only grade props whose game is FINAL (MLB STATUS_FINAL,
//      WC status "completed"). The laptop grader has none and relies on re-grade
//      self-correction; gating means a prop is never shown "lost" mid-game.
//   2. SKIP-ALREADY-GRADED — read prop_results once up front; any prop already
//      settled (result not null) is skipped before any BDL/FIFA call. Combined
//      with the finality gate this is safe (a final stat won't change) and makes
//      steady-state nearly free.
//
// Writes to prop_results, dedup'd by (player_name, prop_type, game_date) — same
// shape the laptop writes, so the two graders agree and the dedup is idempotent.
//
// prop_type stored to match existing rows: MLB = first token ("home_runs",
// "total_bases", "hits_runs_rbis"); WC = full prop string ("anytime_goal 1",
// "shots 2.5").

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BDL_KEY = Deno.env.get("BALLDONTLIE_API_KEY") ?? "";
const BDL_BASE = "https://api.balldontlie.io";
const WC_SEASON = 2026;

// ── helpers ──────────────────────────────────────────────────────────────────
function estDate(offset = 0): string {
  const d = new Date(Date.now() + offset * 86400000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}
const num = (v: unknown): number => (v == null ? 0 : Number(v));
const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
function normalizeName(name?: string): string {
  if (!name) return "";
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

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

// ── grading core (ported from run-all-results.js) ────────────────────────────
function gradeProp(actual: number | null, line: number, bet: string): string | null {
  if (actual === null) return null;
  const b = (bet || "").toLowerCase();
  if (b === "over" || b === "yes" || b === "anytime") {
    return (actual > line || (b === "anytime" && actual >= 1)) ? "won" : "lost";
  }
  return actual < line ? "won" : "lost";
}

// MLB: `token` is the first word of the prop ("home_runs", "total_bases", ...).
// `p` is a BallDontLie mlb/v1/stats row. Returns the actual stat or null if the
// market isn't supported.
function mlbStat(token: string, p: any): number | null {
  const t = token.toLowerCase();
  if (t.includes("hit") && !t.includes("run") && !t.includes("allow")) return num(p.hits);
  if (t.includes("home_run") || t.includes("homer")) return num(p.hr ?? p.home_runs);
  if (t.includes("total_base")) return p.total_bases != null ? num(p.total_bases) : null;
  if (t.includes("rbi") || t.includes("runs_batted")) return num(p.rbi);
  if (t.includes("hits_runs_rbi") || t.includes("h+r+rbi")) return num(p.hits) + num(p.runs) + num(p.rbi);
  if (t.includes("runs_scored") || t === "runs") return num(p.runs);
  if (t.includes("walk") || t.includes("bases_on_ball")) return num(p.bb);
  if (t.includes("stolen_base") || t.includes("steal")) {
    if (p.stolen_bases != null) return num(p.stolen_bases);
    if (p.sb != null) return num(p.sb);
    return null;
  }
  if (t.includes("triple")) return p.triples != null ? num(p.triples) : null;
  if (t.includes("double") && !t.includes("play")) return p.doubles != null ? num(p.doubles) : null;
  if (t.includes("single")) {
    return (p.hits != null && p.doubles != null && p.triples != null && p.hr != null)
      ? num(p.hits) - num(p.doubles) - num(p.triples) - num(p.hr) : null;
  }
  // pitcher markets
  if (t.includes("pitcher_out") || t.includes("outs_recorded")) return p.ip != null ? Math.round(parseFloat(p.ip) * 3) : null;
  if (t.includes("earned_run") || t.includes("pitcher_earned")) return num(p.er);
  if (t.includes("hits_allowed") || t.includes("pitcher_hit")) return num(p.p_hits);
  if (t.includes("pitcher_walk")) return num(p.p_bb);
  if (t.includes("strikeout")) return (p.p_k != null && p.p_k > 0) ? num(p.p_k) : num(p.k);
  return null;
}

// WC: `t` is the lowercased full prop string. `row` is a player_match_stats row,
// `shots` the per-player shot-event count (player_match_stats has no total-shots).
function soccerStat(t: string, row: any, pid: number, shots: Record<number, number>): number | null {
  if (/anytime|goalscorer|to score/.test(t) || (t.includes("goal") && !t.includes("against"))) return num(row.goals);
  if (t.includes("assist")) return num(row.assists);
  if (t.includes("save")) return num(row.saves);
  if (t.includes("tackle")) return num(row.tackles);
  if (t.includes("interception")) return num(row.interceptions);
  if (t.includes("clearance")) return num(row.clearances);
  if (t.includes("pass")) return num(row.key_passes);
  if (t.includes("shot") && (t.includes("target") || t.includes(" on ") || t.includes("sot"))) return num(row.shots_on_target);
  if (t.includes("shot")) return shots[pid] != null ? shots[pid] : null;
  return null;
}

function playerMatchesMlb(pickName: string, pl: any): boolean {
  if (!pl) return false;
  const target = normalizeName(pickName);
  const targetLast = target.split(" ").pop()!;
  const full = normalizeName(pl.full_name || `${pl.first_name || ""} ${pl.last_name || ""}`);
  if (full === target) return true;
  if (strip(full) === strip(target)) return true;
  const last = normalizeName(pl.last_name || full.split(" ").pop() || "");
  if (last === targetLast && last.length > 3) return true;
  return false;
}

// ── prop_results dedup write ─────────────────────────────────────────────────
async function writeProp(row: any): Promise<"insert" | "update" | "noop" | "fail"> {
  const ex = await sbGet("prop_results",
    `player_name=eq.${encodeURIComponent(row.player_name)}&prop_type=eq.${encodeURIComponent(row.prop_type)}` +
    `&game_date=eq.${row.game_date}&select=id,result,actual_value`);
  if (ex.length) {
    const e = ex[0];
    if (e.result === row.result && Number(e.actual_value) === Number(row.actual_value)) return "noop";
    const r = await fetch(`${SUPABASE_URL}/rest/v1/prop_results?id=eq.${e.id}`, {
      method: "PATCH", headers: { ...sbHeaders, Prefer: "return=minimal" },
      body: JSON.stringify({ actual_value: row.actual_value, result: row.result,
        pick_text: row.pick_text, odds: row.odds, updated_at: new Date().toISOString() }),
    });
    return r.ok ? "update" : "fail";
  }
  const r = await fetch(`${SUPABASE_URL}/rest/v1/prop_results`, {
    method: "POST", headers: { ...sbHeaders, Prefer: "return=minimal" }, body: JSON.stringify(row),
  });
  return r.ok ? "insert" : "fail";
}

Deno.serve(async (req) => {
  if (!BDL_KEY) return new Response(JSON.stringify({ ok: false, error: "BALLDONTLIE_API_KEY not set" }),
    { status: 500, headers: { "Content-Type": "application/json" } });

  // ?dry=1 → compute but don't write, return a sample (verify the math safely).
  // ?force=1 → ignore the already-graded skip (re-grade settled props for testing).
  const url = new URL(req.url);
  const dry = url.searchParams.get("dry") === "1";
  const force = url.searchParams.get("force") === "1";
  const sample: any[] = [];

  const dates = [estDate(0), estDate(-1)];
  const stats = { insert: 0, update: 0, noop: 0, fail: 0, skippedGraded: 0, skippedNotFinal: 0, skippedOther: 0, skippedNoStat: 0 };

  // 1. read all prop picks for the window, flatten with parent row id + date
  const pickRows = await sbGet("prop_picks", `date=in.(${dates.join(",")})&select=id,date,picks`);
  type Flat = { parentId: string; date: string; p: any; sport: string; propType: string; key: string };
  const flat: Flat[] = [];
  for (const r of pickRows) {
    for (const p of (r.picks ?? [])) {
      const sport = String(p.sport ?? "").toUpperCase();
      const propRaw = String(p.prop ?? p.prop_type ?? "").trim();
      const player = String(p.player ?? p.player_name ?? "");
      if (!propRaw || !player) continue;
      const propType = sport === "WC" ? propRaw : propRaw.split(/\s+/)[0];
      flat.push({ parentId: r.id, date: r.date, p, sport, propType,
        key: `${player}|${propType}|${r.date}` });
    }
  }

  // 2. skip anything already settled (result not null) — before any BDL call
  const settled = await sbGet("prop_results", `game_date=in.(${dates.join(",")})&select=player_name,prop_type,game_date,result`);
  const gradedKeys = new Set(settled.filter((r) => r.result != null)
    .map((r) => `${r.player_name}|${r.prop_type}|${r.game_date}`));
  const todo = flat.filter((f) => { if (!force && gradedKeys.has(f.key)) { stats.skippedGraded++; return false; } return true; });

  const mlb = todo.filter((f) => f.sport.startsWith("MLB"));
  const wc = todo.filter((f) => f.sport === "WC");
  todo.forEach((f) => { if (!f.sport.startsWith("MLB") && f.sport !== "WC") stats.skippedOther++; });

  const writes: any[] = [];

  // 3. MLB — finality gate via games status, then per-game stats
  if (mlb.length) {
    const games = (await Promise.all(dates.map((d) => bdlGet("/mlb/v1/games", { dates: [d], per_page: "50" })))).flat();
    const finalById = new Map<string, boolean>();
    for (const g of games) finalById.set(String(g.id), String(g.status ?? "").toUpperCase().includes("FINAL"));

    const byGame: Record<string, Flat[]> = {};
    for (const f of mlb) {
      const gid = String(f.p.game_id ?? "");
      if (!finalById.get(gid)) { stats.skippedNotFinal++; continue; }
      (byGame[gid] ||= []).push(f);
    }
    for (const gid of Object.keys(byGame)) {
      let statRows: any[] = [];
      try { statRows = await bdlGet("/mlb/v1/stats", { game_ids: [gid], per_page: "100" }); }
      catch { stats.skippedNotFinal += byGame[gid].length; continue; }
      for (const f of byGame[gid]) {
        const row = statRows.find((s) => playerMatchesMlb(String(f.p.player), s.player));
        const actual = row ? mlbStat(f.propType, row) : null;
        if (actual == null) { stats.skippedNoStat++; continue; }
        const line = parseFloat(f.p.line);
        const result = gradeProp(actual, line, String(f.p.bet ?? "over"));
        if (result == null) { stats.skippedNoStat++; continue; }
        writes.push(buildRow(f, actual, result, line));
      }
    }
  }

  // 4. WC — finality gate via match status, batched player stats + lineups + shots
  if (wc.length) {
    const matches = await bdlGet("/fifa/worldcup/v1/matches", { seasons: [String(WC_SEASON)], per_page: "100" });
    const completedById = new Map<string, boolean>();
    for (const m of matches) completedById.set(String(m.id), String(m.status ?? "").toLowerCase() === "completed");

    const matchIds = [...new Set(wc.map((f) => String(f.p.game_id ?? "")).filter((id) => completedById.get(id)))];
    wc.forEach((f) => { if (!completedById.get(String(f.p.game_id ?? ""))) stats.skippedNotFinal++; });

    if (matchIds.length) {
      const [pms, lineups, shotEvents] = await Promise.all([
        bdlGet("/fifa/worldcup/v1/player_match_stats", { match_ids: matchIds, per_page: "100" }),
        bdlGet("/fifa/worldcup/v1/match_lineups", { match_ids: matchIds, per_page: "100" }),
        bdlGet("/fifa/worldcup/v1/match_shots", { match_ids: matchIds, per_page: "100" }),
      ]);
      // name → player_id from lineups (player_match_stats has no name)
      const nameToId: Record<string, number> = {}, lastToId: Record<string, number> = {};
      for (const l of lineups) {
        const pl = l.player; if (!pl?.id) continue;
        const nm = normalizeName(pl.name || "");
        if (!nm) continue;
        nameToId[nm] = pl.id; nameToId[strip(nm)] = pl.id;
        const last = nm.split(" ").pop()!; if (last.length > 3) lastToId[last] = pl.id;
      }
      const resolvePid = (name: string): number | null => {
        const t = normalizeName(name);
        if (nameToId[t] != null) return nameToId[t];
        if (nameToId[strip(t)] != null) return nameToId[strip(t)];
        const last = t.split(" ").pop()!;
        return lastToId[last] != null ? lastToId[last] : null;
      };
      const shotsByPid: Record<number, number> = {};
      for (const s of shotEvents) { const id = s.player_id ?? s.player?.id; if (id != null) shotsByPid[id] = (shotsByPid[id] || 0) + 1; }

      for (const f of wc) {
        if (!completedById.get(String(f.p.game_id ?? ""))) continue;
        const pid = resolvePid(String(f.p.player));
        if (pid == null) { stats.skippedNoStat++; continue; }
        const row = pms.find((s) => s.player_id === pid);
        if (!row) { stats.skippedNoStat++; continue; }
        const t = f.propType.toLowerCase();
        const actual = soccerStat(t, row, pid, shotsByPid);
        if (actual == null) { stats.skippedNoStat++; continue; }
        const line = parseFloat(f.p.line);
        // Anytime/goalscorer grades on a threshold: plain anytime = 1+, a brace
        // ("anytime_goal 2") = line+. (The laptop script grades every anytime as
        // 1+, a latent brace bug — flagged separately.)
        const isAnytime = /anytime|goalscorer|to score/.test(t);
        const result = isAnytime
          ? (actual >= (Number.isFinite(line) && line > 1 ? line : 1) ? "won" : "lost")
          : gradeProp(actual, line, String(f.p.bet ?? "over"));
        if (result == null) { stats.skippedNoStat++; continue; }
        writes.push(buildRow(f, actual, result, line));
      }
    }
  }

  // 5. write (dedup) — or, in dry mode, just sample what would be written
  if (dry) {
    for (const w of writes.slice(0, 40)) sample.push({ player: w.player_name, prop: w.prop_type,
      bet: w.bet, line: w.line_value, actual: w.actual_value, result: w.result });
  } else {
    for (const w of writes) { stats[await writeProp(w)]++; }
  }

  return new Response(JSON.stringify({ ok: true, dry, force, dates, picks: flat.length, todo: todo.length,
    mlb: mlb.length, wc: wc.length, wouldWrite: writes.length, ...stats, sample },
    null, dry ? 2 : 0), { headers: { "Content-Type": "application/json" } });
});

function buildRow(f: any, actual: number, result: string, line: number) {
  const p = f.p;
  return {
    prop_pick_id: f.parentId, game_date: f.date, player_name: String(p.player ?? p.player_name ?? ""),
    prop_type: f.propType, line_value: Number.isFinite(line) ? line : null, actual_value: actual,
    result, pick_text: `${p.player} ${p.bet} ${p.line} ${f.propType}`,
    matchup: p.matchup ?? null, bet: p.bet ?? null, odds: p.odds != null ? String(p.odds) : null,
  };
}
