// Settlement for user tail/fade bets (Your Book). Pure math + the REST sweep
// grade-results/grade-props call after picks grade. A TAIL inherits the
// pick's result; a FADE inverts it (fade wins iff the pick loses); push and
// void carry through untouched. Units pay at the row's stored odds — the
// place RPC resolved real prices where it could; rows without a price settle
// at an assumed -110 and stay flagged odds_estimated so the UI shows "est".
import { updateUserStreak } from "./streaks.ts";
import { notifySettles, type UserSettleBatch } from "./push.ts";

export type SettleStatus = "won" | "lost" | "push" | "void";

export function settleUserBet(
  kind: "tail" | "fade",
  pickResult: string,
  stake: number,
  odds: number | null,
): { status: SettleStatus; units: number; estimated: boolean } {
  if (!Number.isFinite(stake) || stake <= 0 || stake > 10) throw new Error("invalid stake");
  const estimated = odds == null || !Number.isFinite(odds) || Math.abs(odds) < 100;
  const price = estimated ? -110 : odds!;
  const norm = String(pickResult || "").toLowerCase();
  let status: SettleStatus;
  if (!["won", "lost", "push", "void"].includes(norm)) throw new Error("unsettled pick result");
  if (norm === "push" || norm === "void") status = norm;
  else if (norm === "won") status = kind === "tail" ? "won" : "lost";
  else status = kind === "tail" ? "lost" : "won";
  const units = status === "push" || status === "void" ? 0
    : status === "lost" ? -stake
    : stake * (price > 0 ? price / 100 : 100 / Math.abs(price));
  return { status, units: Math.round(units * 100) / 100, estimated };
}

export async function patchUserBet(
  sbBase: string, sbHeaders: Record<string, string>, id: string,
  body: Record<string, unknown>, expectedStatus?: string,
): Promise<boolean> {
  const guard = expectedStatus ? `&status=eq.${encodeURIComponent(expectedStatus)}` : "";
  const res = await fetch(`${sbBase}/rest/v1/user_bets?id=eq.${id}${guard}`, {
    method: "PATCH", headers: { ...sbHeaders, Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return false;
  if (res.status === 204) return true;
  // A concurrent worker already changed this status: do not notify twice.
  const changed = await res.json();
  return Array.isArray(changed) && changed.length > 0;
}

export type UserBetGrade = { game_date: string; pick_text: string; result: string; league?: string; game_id?: string };

async function readAllRows(table: string, filter: string, fields: string, sbBase: string, headers: Record<string, string>): Promise<any[]> {
  const rows: any[] = [];
  for (let offset = 0; ; offset += 500) {
    const response = await fetch(`${sbBase}/rest/v1/${table}?${filter}&select=${fields}&order=id.asc&limit=500&offset=${offset}`, { headers });
    if (!response.ok) throw new Error(`${table} fetch failed (${response.status})`);
    const page = await response.json(); rows.push(...page);
    if (page.length < 500) return rows;
  }
}

// Complete, stable pagination before mutation. Chunk date sets so recovery
// of old pending receipts cannot exceed HTTP URL size limits.
export async function fetchUserBetsForDates(
  dates: string[], sbBase: string, sbHeaders: Record<string, string>, pickType?: string,
): Promise<any[]> {
  const rows: any[] = [];
  const unique = [...new Set(dates)];
  for (let i = 0; i < unique.length; i += 80) {
    rows.push(...await readAllRows("user_bets", `game_date=in.(${unique.slice(i, i + 80).join(",")})` +
      `&kind=in.(tail,fade)${pickType ? `&pick_type=eq.${pickType}` : ""}`, "*", sbBase, sbHeaders));
  }
  return rows;
}

// Local football/NBA graders persist results independently of this MLB edge
// worker. Read their verified ledgers so every supported league settles here.
async function readPersistedGrades(dates: string[], sbBase: string, headers: Record<string, string>) {
  const games: UserBetGrade[] = [], props: any[] = [];
  for (let i = 0; i < dates.length; i += 80) {
    const filter = `game_date=in.(${dates.slice(i, i + 80).join(",")})`;
    const [g, n, p] = await Promise.all([
      readAllRows("game_results", filter, "game_date,pick_text,result,game_id,league", sbBase, headers),
      readAllRows("nfl_results", filter, "game_date,pick_text,result,game_id,season_type", sbBase, headers),
      readAllRows("prop_results", filter, "game_date,player_name,prop_type,game_id,sport,bet,line_value,result", sbBase, headers),
    ]);
    games.push(...g, ...n.filter((r) => Number(r.season_type) !== 1).map((r) => ({ ...r, league: "NFL" })));
    props.push(...p);
  }
  return { games, props };
}

export function matchingGameGrade(row: any, grades: UserBetGrade[]): string | undefined {
  const candidates = grades.filter((g) => g.game_date === row.game_date && g.pick_text === row.pick_text &&
    (!row.source_game_id || String(g.game_id) === String(row.source_game_id)) &&
    (!row.league || !g.league || row.league.toUpperCase() === g.league.toUpperCase()));
  // Legacy tickets without game identity may only inherit an unambiguous grade.
  const identities = new Set(candidates.map((g) => `${g.game_id ?? ""}|${g.result}`));
  return identities.size === 1 ? candidates[0]?.result : undefined;
}

export function matchingPropGrade(row: any, grades: any[]): string | undefined {
  const name = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const candidates = grades.filter((g) => g.game_date === row.game_date &&
    name(g.player_name) === name(row.player_name) &&
    String(g.prop_type).toLowerCase() === String(row.prop_type).toLowerCase() &&
    (!row.league || !g.sport || row.league.toUpperCase() === String(g.sport).toUpperCase()) &&
    (!row.source_game_id || String(g.game_id) === String(row.source_game_id)) &&
    (row.source_line == null || Number(g.line_value) === Number(row.source_line)) &&
    (!row.source_side || String(g.bet).toLowerCase() === row.source_side.toLowerCase()));
  const identities = new Set(candidates.map((g) => `${g.game_id}|${g.line_value}|${g.bet}|${g.result}`));
  return identities.size === 1 ? candidates[0]?.result : undefined;
}

// Reconcile settled rows too: upstream corrections must reach the personal
// ledger and repair its streak. Identical repeats do not re-notify users.
export async function settleUserBetsForDates(
  dates: string[], graded: UserBetGrade[], sbBase: string, sbHeaders: Record<string, string>,
): Promise<{ settled: number; voided: number; failed: number }> {
  const out = { settled: 0, voided: 0, failed: 0 };
  let rows: any[], gameGrades: UserBetGrade[], propGrades: any[];
  try {
    const pending = await readAllRows("user_bets", `status=eq.pending&kind=in.(tail,fade)&lock_at=lt.${encodeURIComponent(new Date().toISOString())}`,
      "game_date", sbBase, sbHeaders);
    // A corrected older source row must repair an already-settled personal
    // receipt too, even when this cron invocation targets today/yesterday.
    const changedSince = encodeURIComponent(new Date(Date.now() - 48 * 3600_000).toISOString());
    const recentChanges = await Promise.all(["game_results", "nfl_results", "prop_results"].map((table) =>
      readAllRows(table, `or=(updated_at.gte.${changedSince},created_at.gte.${changedSince})`, "game_date", sbBase, sbHeaders)));
    const allDates = [...new Set([...dates, ...pending.map((r) => r.game_date), ...recentChanges.flat().map((r) => r.game_date)])]
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    const persisted = await readPersistedGrades(allDates, sbBase, sbHeaders);
    rows = await fetchUserBetsForDates(allDates, sbBase, sbHeaders);
    const byIdentity = new Map<string, UserBetGrade>();
    for (const g of [...persisted.games, ...graded]) {
      if (!["won", "lost", "push", "void"].includes(String(g.result).toLowerCase())) continue;
      byIdentity.set(`${g.game_date}|${g.league ?? ""}|${g.game_id ?? ""}|${g.pick_text}`, g);
    }
    gameGrades = [...byIdentity.values()];
    propGrades = persisted.props.filter((p) => ["won", "lost", "push", "void"].includes(String(p.result).toLowerCase()));
  } catch { out.failed++; return out; }
  const pushBatch = new Map<string, UserSettleBatch>();
  for (const r of rows) {
    const result = r.pick_type === "game" ? matchingGameGrade(r, gameGrades) : matchingPropGrade(r, propGrades);
    if (result) {
      const s = settleUserBet(r.kind, result, Number(r.stake_units), r.odds_american ?? null);
      if (r.status === s.status && Number(r.units_net) === s.units && r.graded_by === "system") continue;
      const ok = await patchUserBet(sbBase, sbHeaders, r.id, {
        status: s.status, units_net: s.units,
        ...(s.estimated ? { odds_estimated: true } : {}),
        graded_at: new Date().toISOString(), graded_by: "system",
      }, r.status);
      ok ? out.settled++ : out.failed++;
      if (ok && r.user_id && r.status === "pending") {
        if (!pushBatch.has(r.user_id)) pushBatch.set(r.user_id, { events: [], streakAfter: null });
        const b = pushBatch.get(r.user_id)!;
        b.events.push({ kind: r.kind, status: s.status, units: s.units, streak_pick: !!r.streak_pick });
        if (r.streak_pick) {
          const after = await updateUserStreak(sbBase, sbHeaders, r.user_id, r.game_date, s.status);
          if (after) b.streakAfter = { current: after.current };
        }
      }
    } else if (r.status === "pending" && r.lock_at && Date.now() - new Date(r.lock_at).getTime() > 48 * 3600_000) {
      const ok = await patchUserBet(sbBase, sbHeaders, r.id, {
        status: "void", units_net: 0, graded_at: new Date().toISOString(), graded_by: "system",
      }, r.status);
      ok ? out.voided++ : out.failed++;
    }
  }
  try {
    const p = await notifySettles(sbBase, sbHeaders, pushBatch);
    if (p.sent || p.failed) console.log(`[SettlePush] sent=${p.sent} skipped=${p.skipped} failed=${p.failed}`);
  } catch (e) { console.warn(`[SettlePush] sweep-level failure: ${(e as Error).message}`); }
  return out;
}
