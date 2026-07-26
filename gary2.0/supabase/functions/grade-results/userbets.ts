// Settlement for user tail/fade bets (Your Book). Pure math + the REST sweep
// grade-results/grade-props call after picks grade. A TAIL inherits the
// pick's result; a FADE inverts it (fade wins iff the pick loses); push and
// void carry through untouched. Units pay at the row's stored odds — the
// place RPC resolved real prices where it could; rows without a price settle
// at an assumed -110 and stay flagged odds_estimated so the UI shows "est".
import { updateUserStreak } from "./streaks.ts";

export type SettleStatus = "won" | "lost" | "push";

export function settleUserBet(
  kind: "tail" | "fade",
  pickResult: string,
  stake: number,
  odds: number | null,
): { status: SettleStatus; units: number; estimated: boolean } {
  const estimated = odds == null;
  const price = odds == null ? -110 : odds;
  const norm = String(pickResult || "").toLowerCase();
  let status: SettleStatus;
  if (norm === "push") status = "push";
  else if (norm === "won") status = kind === "tail" ? "won" : "lost";
  else status = kind === "tail" ? "lost" : "won";
  const units = status === "push" ? 0
    : status === "lost" ? -stake
    : stake * (price > 0 ? price / 100 : 100 / Math.abs(price));
  return { status, units: Math.round(units * 100) / 100, estimated };
}

export async function patchUserBet(
  sbBase: string, sbHeaders: Record<string, string>, id: string,
  body: Record<string, unknown>,
): Promise<boolean> {
  const res = await fetch(`${sbBase}/rest/v1/user_bets?id=eq.${id}`, {
    method: "PATCH", headers: { ...sbHeaders, Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  return res.ok;
}

// Settle every pending GAME-pick user bet whose pick graded this run, then
// void stale strays of ANY pick_type (pending tail/fades >48h past lock with
// no result to inherit — e.g. the pick was replaced by a regeneration before
// lock). Prop settlement itself lives in grade-props, which shares
// settleUserBet/patchUserBet from here.
export async function settleUserBetsForDates(
  dates: string[],
  graded: Array<{ game_date: string; pick_text: string; result: string }>,
  sbBase: string, sbHeaders: Record<string, string>,
): Promise<{ settled: number; voided: number; failed: number }> {
  const out = { settled: 0, voided: 0, failed: 0 };
  const res = await fetch(
    `${sbBase}/rest/v1/user_bets?game_date=in.(${dates.join(",")})` +
    `&status=eq.pending&kind=in.(tail,fade)` +
    `&select=id,kind,pick_type,game_date,pick_text,stake_units,odds_american,lock_at,user_id,streak_pick`,
    { headers: sbHeaders },
  );
  if (!res.ok) { out.failed++; return out; }
  const rows: any[] = await res.json();
  const byKey = new Map(graded.map((g) => [`${g.game_date}|${g.pick_text}`, g.result]));
  for (const r of rows) {
    const result = r.pick_type === "game" ? byKey.get(`${r.game_date}|${r.pick_text}`) : undefined;
    if (result) {
      const s = settleUserBet(r.kind, result, Number(r.stake_units), r.odds_american ?? null);
      const ok = await patchUserBet(sbBase, sbHeaders, r.id, {
        status: s.status, units_net: s.units,
        ...(s.estimated ? { odds_estimated: true } : {}),
        graded_at: new Date().toISOString(), graded_by: "system",
      });
      ok ? out.settled++ : out.failed++;
      if (ok && r.streak_pick && r.user_id) {
        await updateUserStreak(sbBase, sbHeaders, r.user_id, r.game_date, s.status);
      }
    } else if (r.lock_at && Date.now() - new Date(r.lock_at).getTime() > 48 * 3600_000) {
      const ok = await patchUserBet(sbBase, sbHeaders, r.id, {
        status: "void", units_net: 0,
        graded_at: new Date().toISOString(), graded_by: "system",
      });
      ok ? out.voided++ : out.failed++;
      if (ok && r.streak_pick && r.user_id) {
        await updateUserStreak(sbBase, sbHeaders, r.user_id, r.game_date, "void");
      }
    }
  }
  return out;
}
