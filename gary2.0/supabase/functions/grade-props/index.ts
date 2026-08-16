// Supabase Edge Function: grade-props
//
// Cloud grade-on-final for PROP picks (the sibling of grade-results, which does
// game picks). Runs on pg_cron so props settle 24/7 with no laptop. Ported from
// scripts/run-all-results.js (processPropBets / getStatValue / gradeProp), scoped
// to the active sports: MLB (incl. "MLB HR"). Other leagues are counted-and-skipped,
// never silently mis-graded.
//
// Two deliberate improvements over the laptop script, both correctness-positive:
//   1. FINALITY GATE — only grade props whose game is FINAL (MLB STATUS_FINAL).
//      The laptop grader has none and relies on re-grade self-correction; gating
//      means a prop is never shown "lost" mid-game.
//   2. SKIP-ALREADY-GRADED — read prop_results once up front; any prop already
//      settled (result not null) is skipped before any BDL call. Combined
//      with the finality gate this is safe (a final stat won't change) and makes
//      steady-state nearly free.
//
// Writes to prop_results using the same exact game/sport/player/market/side/line
// identity as the laptop grader, so the two established lanes stay idempotent
// even on doubleheaders or alternate lines.
//
// prop_type stored to match existing rows: first token of the prop string
// ("home_runs", "total_bases", "hits_runs_rbis").

import { settleUserBet, patchUserBet } from "../grade-results/userbets.ts";
import { updateUserStreak } from "../grade-results/streaks.ts";
import { notifySettles, type UserSettleBatch } from "../grade-results/push.ts";
import { gradePropResult } from "./grading.ts";
import {
  normalizedResultSport,
  propResultIdentityKey,
  storedExactGameId,
} from "../grade-results/resultIdentity.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BDL_KEY = Deno.env.get("BALLDONTLIE_API_KEY") ?? "";
const BDL_BASE = "https://api.balldontlie.io";

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
// Follows meta.next_cursor so multi-page results aren't truncated at page 1.
async function bdlGet(path: string, params: Record<string, string | string[]>): Promise<any[]> {
  const all: any[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 50; page++) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) v.forEach((x) => qs.append(`${k}[]`, x)); else qs.append(k, v);
    }
    if (cursor != null) qs.append("cursor", cursor);
    const res = await fetch(`${BDL_BASE}${path}?${qs.toString()}`, { headers: { Authorization: BDL_KEY } });
    if (!res.ok) throw new Error(`BDL ${path} ${res.status}`);
    const json = await res.json();
    const rows = Array.isArray(json?.data) ? json.data : [];
    all.push(...rows);
    const next = json?.meta?.next_cursor;
    if (next == null || String(next) === cursor || rows.length === 0) break;
    cursor = String(next);
  }
  return all;
}

// MLB: `token` is the first word of the prop ("home_runs", "total_bases", ...).
// `p` is a BallDontLie mlb/v1/stats row. Returns the actual stat or null if the
// market isn't supported.
function mlbStat(token: string, p: any): number | null {
  const t = token.toLowerCase();
  // Combo prop FIRST — "hits_runs_rbis" contains "rbi" as a substring, so it must be
  // checked before the individual rbi/hit tests below or it gets intercepted by them
  // and graded on RBI count alone instead of the hits+runs+rbi sum.
  if (t.includes("hits_runs_rbi") || t.includes("h+r+rbi")) return num(p.hits) + num(p.runs) + num(p.rbi);
  if (t.includes("hit") && !t.includes("run") && !t.includes("allow")) return num(p.hits);
  if (t.includes("home_run") || t.includes("homer")) return num(p.hr ?? p.home_runs);
  if (t.includes("total_base")) return p.total_bases != null ? num(p.total_bases) : null;
  if (t.includes("rbi") || t.includes("runs_batted")) return num(p.rbi);
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
  // MLB IP is THIRDS notation ("5.2" = 5⅔ = 17 outs) — `ip * 3` graded 16
  // on every fractional line (Jul 30, mirrors the local grader fix).
  if (t.includes("pitcher_out") || t.includes("outs_recorded")) {
    if (p.ip == null) return null;
    const raw = parseFloat(p.ip);
    return Number.isFinite(raw) ? Math.floor(raw) * 3 + Math.round((raw % 1) * 10) : null;
  }
  if (t.includes("earned_run") || t.includes("pitcher_earned")) return num(p.er);
  if (t.includes("hits_allowed") || t.includes("pitcher_hit")) return num(p.p_hits);
  if (t.includes("pitcher_walk")) return num(p.p_bb);
  // Board semantics (Jul 30, attribution-swap class): 'pitcher_strikeouts'
  // = p_k; bare 'strikeouts' = the BATTER's Ks. The old pitcher-first
  // heuristic graded a batter-Ks prop on pitching Ks when he also pitched.
  if (t.includes("strikeout")) {
    if (t.includes("pitcher")) return num(p.p_k);
    if (p.k != null) return num(p.k);
    return num(p.p_k);
  }
  return null;
}

function playerMatchesMlb(pickName: string, pl: any): boolean {
  if (!pl) return false;
  const target = normalizeName(pickName);
  const targetLast = target.split(" ").pop()!;
  const full = normalizeName(pl.full_name || `${pl.first_name || ""} ${pl.last_name || ""}`);
  if (full === target) return true;
  if (strip(full) === strip(target)) return true;
  // Surname alone is NOT identity (Jul 30, attribution-swap class): two
  // same-surname players in one game graded the prop on whichever appeared
  // first. Require the first initial whenever both sides carry one.
  const last = normalizeName(pl.last_name || full.split(" ").pop() || "");
  if (last === targetLast && last.length > 3) {
    const fi = normalizeName(pl.first_name || full.split(" ")[0] || "").charAt(0);
    const ti = target.charAt(0);
    return !fi || !ti || fi === ti;
  }
  return false;
}

// ── prop_results dedup write ─────────────────────────────────────────────────
async function writeProp(row: any): Promise<"insert" | "update" | "noop" | "fail"> {
  if (!row.game_id || !row.sport) return "fail";

  // Prefer the full deployed identity. If this exact result does not exist,
  // adopt one matching pre-contract NULL-game/NULL-sport row in place. The
  // legacy lookup includes every dimension its schema can represent so a
  // doubleheader, alternate line, or opposite side cannot be collapsed.
  const fields = "id,result,actual_value,game_id,sport";
  let ex = await sbGet("prop_results",
    `game_date=eq.${row.game_date}` +
    `&sport=ilike.${encodeURIComponent(row.sport)}` +
    `&game_id=eq.${encodeURIComponent(row.game_id)}` +
    `&player_name=ilike.${encodeURIComponent(row.player_name)}` +
    `&prop_type=ilike.${encodeURIComponent(row.prop_type)}` +
    `&bet=ilike.${encodeURIComponent(row.bet)}` +
    `&line_value=eq.${row.line_value}` +
    `&select=${fields}&limit=1`);
  if (!ex.length) {
    const matchup = row.matchup == null
      ? "matchup=is.null"
      : `matchup=eq.${encodeURIComponent(row.matchup)}`;
    ex = await sbGet("prop_results",
      `prop_pick_id=eq.${row.prop_pick_id}` +
      `&game_date=eq.${row.game_date}` +
      `&game_id=is.null&sport=is.null` +
      `&player_name=ilike.${encodeURIComponent(row.player_name)}` +
      `&prop_type=ilike.${encodeURIComponent(row.prop_type)}` +
      `&bet=ilike.${encodeURIComponent(row.bet)}` +
      `&line_value=eq.${row.line_value}` +
      `&${matchup}&select=${fields}&order=created_at.asc&limit=1`);
  }
  if (ex.length) {
    const e = ex[0];
    const identityCurrent = String(e.game_id ?? "") === row.game_id
      && String(e.sport ?? "") === row.sport;
    if (identityCurrent && e.result === row.result
      && Number(e.actual_value) === Number(row.actual_value)) return "noop";
    const r = await fetch(`${SUPABASE_URL}/rest/v1/prop_results?id=eq.${e.id}`, {
      method: "PATCH", headers: { ...sbHeaders, Prefer: "return=minimal" },
      body: JSON.stringify({ actual_value: row.actual_value, result: row.result,
        pick_text: row.pick_text, odds: row.odds, game_id: row.game_id, sport: row.sport,
        updated_at: new Date().toISOString() }),
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
  // ?date=YYYY-MM-DD → grade exactly that ET game date (backfill/re-grade lane;
  //   default stays today+yesterday for the pg_cron runs).
  const url = new URL(req.url);
  const dry = url.searchParams.get("dry") === "1";
  const force = url.searchParams.get("force") === "1";
  const dateParam = url.searchParams.get("date");
  const sample: any[] = [];

  const dates = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
    ? [dateParam]
    : [estDate(0), estDate(-1)];
  const stats = { insert: 0, update: 0, noop: 0, fail: 0, invalidIdentity: 0,
    skippedGraded: 0, skippedNotFinal: 0, skippedOther: 0, skippedNoStat: 0, dnpPush: 0 };

  // 1. read all prop picks for the window, flatten with parent row id + date
  const pickRows = await sbGet("prop_picks", `date=in.(${dates.join(",")})&select=id,date,picks`);
  type Flat = {
    parentId: string; date: string; p: any; sport: string; gameId: string;
    propType: string; key: string;
  };
  const flat: Flat[] = [];
  for (const r of pickRows) {
    for (const p of (r.picks ?? [])) {
      const sport = normalizedResultSport(p.sport) ?? "";
      const gameId = storedExactGameId(p);
      const propRaw = String(p.prop ?? p.prop_type ?? "").trim();
      const player = String(p.player ?? p.player_name ?? "");
      if (!propRaw || !player) continue;
      // This Edge function grades only MLB lanes. Every current MLB pick is
      // exact-game stamped; a legacy/id-less row stays pending for the local
      // repair path instead of creating another NULL-identity result.
      if (!gameId) { stats.invalidIdentity++; continue; }
      const propType = propRaw.split(/\s+/)[0];
      const key = propResultIdentityKey({
        gameDate: r.date, sport, gameId, playerName: player, propType,
        bet: p.bet, line: p.line ?? p.line_value,
      });
      if (!key) { stats.invalidIdentity++; continue; }
      flat.push({ parentId: r.id, date: r.date, p, sport, gameId, propType, key });
    }
  }

  // 2. skip anything already settled (result not null) — before any BDL call
  const settled = await sbGet("prop_results", `game_date=in.(${dates.join(",")})` +
    `&select=player_name,prop_type,game_date,result,game_id,sport,bet,line_value`);
  const gradedKeys = new Set(settled.filter((r) => r.result != null)
    .map((r) => propResultIdentityKey({
      gameDate: r.game_date, sport: r.sport, gameId: r.game_id,
      playerName: r.player_name, propType: r.prop_type, bet: r.bet, line: r.line_value,
    })).filter((key): key is string => key != null));
  const todo = flat.filter((f) => {
    if (!force && gradedKeys.has(f.key)) { stats.skippedGraded++; return false; }
    return true;
  });

  const mlb = todo.filter((f) => f.sport.startsWith("MLB"));
  todo.forEach((f) => { if (!f.sport.startsWith("MLB")) stats.skippedOther++; });

  const writes: any[] = [];

  // 3. MLB — finality gate via games status, then per-game stats
  if (mlb.length) {
    // BDL /games `dates` is UTC-keyed: an ET-evening game files under the NEXT
    // UTC day. The default [today, yesterday] window covers that accidentally;
    // a single ?date backfill must fetch D and D+1 or every late game on D
    // reads "not final" (the ETDate law — this exact hole shorted the Aug 3
    // backfill by ~189 props). The ET-date guard below still pins grading to D.
    const utcNext = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    const gameFetchDates = dates.length === 1 ? [dates[0], utcNext(dates[0])] : dates;
    const games = (await Promise.all(gameFetchDates.map((d) => bdlGet("/mlb/v1/games", { dates: [d], per_page: "50" })))).flat();
    const finalById = new Map<string, boolean>();
    const etDateById = new Map<string, string>();
    const etDateOf = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    for (const g of games) {
      finalById.set(String(g.id), String(g.status ?? "").toUpperCase().includes("FINAL"));
      if (g.date) etDateById.set(String(g.id), etDateOf(String(g.date)));
    }

    const byGame: Record<string, Flat[]> = {};
    for (const f of mlb) {
      const gid = f.gameId;
      if (!finalById.get(gid)) { stats.skippedNotFinal++; continue; }
      // DATE GUARD: a pick whose game_id points at an ADJACENT day's game (the
      // BDL midnight-UTC artifact that mis-attributed generation-side ids) must
      // not grade against that game's final — tonight's Bleday prop graded
      // "won" off YESTERDAY'S box while his real game hadn't started (Jul 2).
      const gDate = etDateById.get(gid);
      if (gDate && gDate !== f.date) { stats.skippedNotFinal++; continue; }
      (byGame[gid] ||= []).push(f);
    }
    for (const gid of Object.keys(byGame)) {
      let statRows: any[] = [];
      try { statRows = await bdlGet("/mlb/v1/stats", { game_ids: [gid], per_page: "100" }); }
      catch { stats.skippedNotFinal += byGame[gid].length; continue; }
      // Empty box on a FINAL game = provider data hole, not a slate of DNPs —
      // skip the game rather than voiding every prop in it.
      if (!statRows.length) { stats.skippedNotFinal += byGame[gid].length; continue; }
      for (const f of byGame[gid]) {
        const row = statRows.find((s) => playerMatchesMlb(String(f.p.player), s.player));
        // DNP VOID (Aug 3 2026): the game is FINAL and its box has no line for
        // this player — he didn't appear, so the book voids the bet and the
        // ledger records a push (it used to sit "pending" forever). Pick names
        // and box names share one source (BDL player records), so absent-from-
        // box means absence, not a name miss.
        if (!row) {
          stats.dnpPush++;
          writes.push(buildRow(f, null, "push", parseFloat(f.p.line)));
          continue;
        }
        const actual = mlbStat(f.propType, row);
        if (actual == null) { stats.skippedNoStat++; continue; }
        const line = parseFloat(f.p.line);
        const result = gradePropResult(actual, line, String(f.p.bet ?? ""));
        if (result == null) { stats.skippedNoStat++; continue; }
        writes.push(buildRow(f, actual, result, line));
      }
    }
  }

  // 4. write (dedup) — or, in dry mode, just sample what would be written
  if (dry) {
    for (const w of writes.slice(0, 40)) sample.push({ player: w.player_name, prop: w.prop_type,
      bet: w.bet, line: w.line_value, actual: w.actual_value, result: w.result });
  } else {
    for (const w of writes) { stats[await writeProp(w)]++; }

    // Your Book: settle prop tail/fades against this run's grades; never fatal.
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/user_bets?game_date=in.(${dates.join(",")})` +
        `&pick_type=eq.prop&status=eq.pending&kind=in.(tail,fade)` +
        `&select=id,kind,game_date,player_name,prop_type,stake_units,odds_american,user_id,streak_pick`,
        { headers: sbHeaders },
      );
      if (res.ok) {
        const rows: any[] = await res.json();
        const byKey = new Map(writes.map((w) => [
          `${w.game_date}|${normalizeName(w.player_name)}|${String(w.prop_type).toLowerCase()}`, w.result,
        ]));
        const pushBatch = new Map<string, UserSettleBatch>();
        for (const r of rows) {
          const result = byKey.get(
            `${r.game_date}|${normalizeName(r.player_name ?? "")}|${String(r.prop_type ?? "").toLowerCase()}`);
          if (!result) continue;
          const s = settleUserBet(r.kind, result, Number(r.stake_units), r.odds_american ?? null);
          const ok = await patchUserBet(SUPABASE_URL, sbHeaders, r.id, {
            status: s.status, units_net: s.units,
            ...(s.estimated ? { odds_estimated: true } : {}),
            graded_at: new Date().toISOString(), graded_by: "system",
          });
          if (ok && r.user_id) {
            if (!pushBatch.has(r.user_id)) pushBatch.set(r.user_id, { events: [], streakAfter: null });
            const b = pushBatch.get(r.user_id)!;
            b.events.push({ kind: r.kind, status: s.status, units: s.units, streak_pick: !!r.streak_pick });
            if (r.streak_pick) {
              const after = await updateUserStreak(SUPABASE_URL, sbHeaders, r.user_id, r.game_date, s.status);
              if (after) b.streakAfter = { current: after.current };
            }
          }
        }
        const p = await notifySettles(SUPABASE_URL, sbHeaders, pushBatch);
        if (p.sent || p.failed) console.log(`[SettlePush] props sent=${p.sent} skipped=${p.skipped} failed=${p.failed}`);
      }
    } catch (e) {
      console.warn(`[UserBets] prop settle failed: ${(e as Error).message}`);
    }
  }

  return new Response(JSON.stringify({ ok: true, dry, force, dates, picks: flat.length, todo: todo.length,
    mlb: mlb.length, wouldWrite: writes.length, ...stats, sample },
    null, dry ? 2 : 0), { headers: { "Content-Type": "application/json" } });
});

function buildRow(f: any, actual: number | null, result: string, line: number) {
  const p = f.p;
  return {
    prop_pick_id: f.parentId, game_date: f.date, game_id: f.gameId, sport: f.sport,
    player_name: String(p.player ?? p.player_name ?? ""),
    prop_type: f.propType, line_value: Number.isFinite(line) ? line : null, actual_value: actual,
    result, pick_text: `${p.player} ${p.bet} ${p.line} ${f.propType}`,
    matchup: p.matchup ?? null, bet: p.bet ?? null, odds: p.odds != null ? String(p.odds) : null,
  };
}
