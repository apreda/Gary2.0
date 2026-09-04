// gary2.0/supabase/functions/social-auto-post/recap.ts
// Pure composition for the DAILY RECAP — yesterday's game picks, ONE POST PER
// SPORT. No Deno, no network, no model: the same node-testable shape as
// weektape.ts / pl.ts / verdicts.ts.
//
// History: revived Jul 8 2026, retired Aug 21 2026 ("they dont do well at
// all"), and revived again Sep 4 2026 by the founder — this time split by
// league, because one post carrying MLB and college football together buries
// whichever sport the reader came for and reads as a spreadsheet. Each sport
// now gets its own tape: its own date line, its own record, its own picks.
//
// Register: the ledger only. No opening commentary, no hashtags, no link.
// The ✅/❌ markers stay — in a results table they are scannable structure,
// the one sanctioned exception to the account's no-emoji rule.

export type RecapRow = {
  league: string | null;
  result: string | null;
  pick_text: string | null;
  confidence?: number | string | null;
  /** BDL season type; 1 = preseason, which never enters a Gary record. */
  season_type?: number | null;
};

export type RecapPost = { league: string; text: string; won: number; lost: number; pushes: number };

const GRADED = new Set(["won", "lost", "push"]);

/** "2026-09-03" -> "September 3rd" */
export function ordinalDate(ymd: string): string {
  const d = new Date(ymd + "T12:00:00Z");
  const month = d.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  const day = d.getUTCDate();
  const suffix = (day % 100 >= 11 && day % 100 <= 13) ? "th" : (["th", "st", "nd", "rd"][day % 10] ?? "th");
  return `${month} ${day}${suffix}`;
}

const marker = (result: string) => result === "won" ? "✅" : result === "lost" ? "❌" : "(push)";

/** Display league, normalized the way every Gary surface spells it. */
export function recapLeague(raw: string | null): string {
  const n = String(raw ?? "").trim().toUpperCase();
  if (!n) return "OTHER";
  if (n.includes("NCAAF") || n.includes("COLLEGE_FOOTBALL")) return "NCAAF";
  if (n.includes("NFL")) return "NFL";
  if (n.includes("NCAAB") || n.includes("NCAAM")) return "NCAAB";
  if (n.includes("NBA") && !n.includes("WNBA")) return "NBA";
  if (n.includes("WNBA")) return "WNBA";
  if (n.includes("NHL")) return "NHL";
  if (n.includes("MLB")) return "MLB";
  return n;
}

/**
 * One post per sport with graded picks, biggest slate first.
 *
 * Preseason rows are dropped whole — they never count in a Gary record, so
 * they never appear in the tape that states one.
 */
export function composeRecaps(rows: RecapRow[], slateDay: string): RecapPost[] {
  const graded = (rows ?? []).filter((r) =>
    GRADED.has(String(r?.result ?? "").toLowerCase()) && Number(r?.season_type) !== 1
  );
  if (!graded.length) return [];

  const byLeague = new Map<string, RecapRow[]>();
  for (const r of graded) {
    const league = recapLeague(r.league);
    byLeague.set(league, [...(byLeague.get(league) ?? []), r]);
  }

  const posts: RecapPost[] = [];
  for (const [league, picks] of byLeague) {
    let won = 0, lost = 0, pushes = 0;
    for (const p of picks) {
      const result = String(p.result ?? "").toLowerCase();
      if (result === "won") won++;
      else if (result === "lost") lost++;
      else pushes++;
    }
    const lines = [...picks]
      .sort((a, b) => Number(b.confidence ?? 0) - Number(a.confidence ?? 0))
      .map((p) => `- ${p.pick_text} ${marker(String(p.result ?? "").toLowerCase())}`);
    const text = `${ordinalDate(slateDay)}:\n\n${league}: ${won}-${lost}\n${lines.join("\n")}`
      + `\n\nEvery game, every day. The full card is in the app.`;
    posts.push({ league, text, won, lost, pushes });
  }

  return posts.sort((a, b) =>
    (b.won + b.lost + b.pushes) - (a.won + a.lost + a.pushes) || a.league.localeCompare(b.league)
  );
}
