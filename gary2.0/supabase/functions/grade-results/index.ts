// Supabase Edge Function: grade-results
//
// Cloud grade-on-final for GAME picks (props are a separate next layer — they
// need box-score stat extraction). Runs on pg_cron alongside live-scores so
// Gary's game picks settle 24/7, no laptop. For each FINAL game it grades the
// pick (MLB ML/total/spread; WC 3-way ML/draw/total/Asian-handicap on the 90'
// regulation score) and writes to game_results — dedup'd by (pick_text,
// game_date): a wrong early grade self-corrects on the next run (UPDATE), an
// ungraded one inserts, an already-correct one is a no-op.
//
// Faithful port of the grading + is_winners_pick logic in run-all-results.js.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BDL_KEY = Deno.env.get("BALLDONTLIE_API_KEY") ?? "";
const BDL_BASE = "https://api.balldontlie.io";
const WC_SEASON = 2026;

// ── date helpers (ET) ───────────────────────────────────────────────────────
function estDate(offset = 0): string {
  const d = new Date(Date.now() + offset * 86400000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}
const num = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };

function isFinalStatus(raw: unknown): boolean {
  return String(raw ?? "").toUpperCase().includes("FINAL");
}

// ── BDL / Supabase REST ─────────────────────────────────────────────────────
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
const sbHeaders = {
  apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json",
};
async function sbGet(table: string, query: string): Promise<any[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: sbHeaders });
  if (!res.ok) throw new Error(`${table} GET ${res.status}`);
  return await res.json();
}

// ── grading (ported from run-all-results.js + soccerGrading.js) ──────────────
function gradeGame(pickText: string, homeTeam: string, awayTeam: string, hScore: number, vScore: number): string {
  const p = pickText.toLowerCase();
  const hFull = homeTeam.toLowerCase(), vFull = awayTeam.toLowerCase();
  const hM = hFull.split(" ").pop()!, vM = vFull.split(" ").pop()!;
  const isML = p.includes(" ml") || p.includes("moneyline");
  const total = pickText.match(/(over|under)\s+(\d+\.?\d*)/i);
  if (total) {
    const line = parseFloat(total[2]), actual = hScore + vScore;
    if (actual === line) return "push";
    return (total[1].toLowerCase() === "over" ? actual > line : actual < line) ? "won" : "lost";
  }
  if (!isML) {
    const sp = pickText.match(/([+-][1-9]\d{0,1}(\.\d)?)(?!\d)/);
    if (sp) {
      const spread = parseFloat(sp[1]);
      const isHome = p.includes(hM) || p.includes(hFull);
      const diff = isHome ? hScore - vScore : vScore - hScore;
      if (diff + spread === 0) return "push";
      return diff + spread > 0 ? "won" : "lost";
    }
  }
  if (/\b(draw|tie)\b/.test(p)) return hScore === vScore ? "won" : "lost";
  const isHome = p.includes(hM) || p.includes(hFull);
  const isVis = p.includes(vM) || p.includes(vFull);
  if (isHome && !isVis) return hScore > vScore ? "won" : "lost";
  if (isVis && !isHome) return vScore > hScore ? "won" : "lost";
  if (isHome) return hScore > vScore ? "won" : "lost";
  if (isVis) return vScore > hScore ? "won" : "lost";
  return "lost";
}

function gradeSoccer(pick: any, regHome: number, regAway: number): string | null {
  const type = String(pick.type ?? "moneyline").toLowerCase();
  const text = String(pick.pick ?? "").toLowerCase();
  const hFull = String(pick.homeTeam ?? "").toLowerCase(), aFull = String(pick.awayTeam ?? "").toLowerCase();
  const hM = hFull.split(" ").pop()!, aM = aFull.split(" ").pop()!;
  const picksHome = !!hFull && (text.includes(hFull) || (!!hM && text.includes(hM)));
  const picksAway = !!aFull && (text.includes(aFull) || (!!aM && text.includes(aM)));
  if (type === "draw") return regHome === regAway ? "won" : "lost";
  if (type === "total") {
    const line = parseFloat(pick.goal_line), tot = regHome + regAway;
    if (tot === line) return "push";
    return (/over/.test(text) ? tot > line : tot < line) ? "won" : "lost";
  }
  if (type === "asian_handicap") {
    const h = parseFloat(pick.handicap);
    const margin = picksAway ? regAway - regHome : regHome - regAway;
    const adj = margin + h;
    if (adj === 0) return "push";
    return adj > 0 ? "won" : "lost";
  }
  if (picksHome && !picksAway) return regHome > regAway ? "won" : "lost";
  if (picksAway && !picksHome) return regAway > regHome ? "won" : "lost";
  return null;
}

// 90' regulation for WC: full score when no extra time, else sum of halves.
function regulationScore(m: any): { home: number; away: number } | null {
  const halves = m.first_half_home_score != null && m.second_half_home_score != null &&
    m.first_half_away_score != null && m.second_half_away_score != null;
  const sum = () => ({
    home: num(m.first_half_home_score)! + num(m.second_half_home_score)!,
    away: num(m.first_half_away_score)! + num(m.second_half_away_score)!,
  });
  if (!m.has_extra_time) {
    if (m.home_score != null && m.away_score != null) return { home: num(m.home_score)!, away: num(m.away_score)! };
    return halves ? sum() : null;
  }
  return halves ? sum() : null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

// ── game_results dedup write (re-grade on exist) ─────────────────────────────
async function writeResult(row: any): Promise<"insert" | "update" | "noop" | "fail"> {
  const existing = await sbGet("game_results",
    `pick_text=eq.${encodeURIComponent(row.pick_text)}&game_date=eq.${row.game_date}&select=id,result,final_score`);
  if (existing.length) {
    const e = existing[0];
    if (e.result === row.result && e.final_score === row.final_score) return "noop";
    const res = await fetch(`${SUPABASE_URL}/rest/v1/game_results?id=eq.${e.id}`, {
      method: "PATCH", headers: { ...sbHeaders, Prefer: "return=minimal" },
      body: JSON.stringify({ result: row.result, final_score: row.final_score,
        is_winners_pick: row.is_winners_pick, updated_at: new Date().toISOString() }),
    });
    return res.ok ? "update" : "fail";
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/game_results`, {
    method: "POST", headers: { ...sbHeaders, Prefer: "return=minimal" }, body: JSON.stringify(row),
  });
  return res.ok ? "insert" : "fail";
}

Deno.serve(async () => {
  if (!BDL_KEY) return new Response(JSON.stringify({ ok: false, error: "BALLDONTLIE_API_KEY not set" }),
    { status: 500, headers: { "Content-Type": "application/json" } });

  const dates = [estDate(0), estDate(-1)]; // today + yesterday (late finals)
  const stats = { insert: 0, update: 0, noop: 0, fail: 0, skipped: 0 };

  // Pull MLB games + WC matches once (final-status only matters at grade time).
  const [mlbGames, wcMatches] = await Promise.all([
    Promise.all(dates.map((d) => bdlGet("/mlb/v1/games", { dates: [d], per_page: "50" }))).then((a) => a.flat()),
    bdlGet("/fifa/worldcup/v1/matches", { seasons: [String(WC_SEASON)], per_page: "100" }),
  ]);

  for (const date of dates) {
    const rows = await sbGet("daily_picks", `date=eq.${date}&select=date,picks`);
    const picks: any[] = rows[0]?.picks ?? [];
    if (!picks.length) continue;

    // is_winners_pick = top 3 per league by (is_top_pick, then confidence).
    const winnerKeys = new Set<string>();
    const byLeague: Record<string, any[]> = {};
    for (const p of picks) (byLeague[String(p.league ?? "UNKNOWN").toUpperCase()] ||= []).push(p);
    for (const lg of Object.keys(byLeague)) {
      const ranked = byLeague[lg].slice().sort((a, b) => {
        const at = a.is_top_pick ? 1 : 0, bt = b.is_top_pick ? 1 : 0;
        if (at !== bt) return bt - at;
        return (b.confidence ?? 0) - (a.confidence ?? 0);
      });
      for (const p of ranked.slice(0, 3))
        winnerKeys.add(`${String(p.league ?? "").toUpperCase()}|${p.pick}|${p.awayTeam} @ ${p.homeTeam}`);
    }
    const isWinner = (p: any) =>
      winnerKeys.has(`${String(p.league ?? "").toUpperCase()}|${p.pick}|${p.awayTeam} @ ${p.homeTeam}`);

    for (const pick of picks) {
      const league = String(pick.league ?? "").toUpperCase();
      let result: string | null = null, vScore: number | null = null, hScore: number | null = null;

      if (league === "WC" || league === "SOCCER_WORLD_CUP" || pick.soccer_match_id) {
        const m = wcMatches.find((x: any) => String(x.id) === String(pick.soccer_match_id));
        if (!m || String(m.status).toLowerCase() !== "completed") { stats.skipped++; continue; }
        const reg = regulationScore(m);
        if (!reg) { stats.skipped++; continue; }
        result = gradeSoccer({ ...pick, homeTeam: m.home_team?.name, awayTeam: m.away_team?.name }, reg.home, reg.away);
        hScore = reg.home; vScore = reg.away;
      } else if (league === "MLB") {
        const g = mlbGames.find((x: any) => {
          const gh = norm(x.home_team?.full_name ?? x.home_team?.name ?? "");
          const gv = norm(x.away_team?.full_name ?? x.away_team?.name ?? "");
          const ph = norm(pick.homeTeam ?? ""), pv = norm(pick.awayTeam ?? "");
          return (gh.includes(ph) || ph.includes(gh)) && (gv.includes(pv) || pv.includes(gv));
        });
        if (!g || !isFinalStatus(g.status)) { stats.skipped++; continue; }
        hScore = num(g.home_team_data?.runs); vScore = num(g.away_team_data?.runs);
        if (hScore == null || vScore == null) { stats.skipped++; continue; }
        result = gradeGame(pick.pick, pick.homeTeam, pick.awayTeam, hScore, vScore);
      } else { stats.skipped++; continue; } // other leagues: not handled in the cloud grader yet

      if (result == null || hScore == null || vScore == null) { stats.skipped++; continue; }
      const outcome = await writeResult({
        pick_id: null, game_date: date, league, result,
        final_score: `${vScore}-${hScore}`, pick_text: pick.pick,
        matchup: `${pick.awayTeam} @ ${pick.homeTeam}`, is_winners_pick: isWinner(pick),
      });
      stats[outcome]++;
    }
  }

  return new Response(JSON.stringify({ ok: true, dates, ...stats }),
    { headers: { "Content-Type": "application/json" } });
});
