// gary2.0/supabase/functions/social-auto-post/verdicts.ts
// Pure matching logic for the Verdict Loop (no Deno, no network) so it can run under `node --test`.
// A verdict = Gary quote-tweeting HIS OWN pick tweet once that game grades in game_results.

export type LogRow = {
  id: string;
  post_date: string;            // ET date the pick was tweeted (matches game_results.game_date)
  league: string | null;
  pick_text: string | null;
  thread_format: string | null; // 'standard' | 'top_pick' | 'verdict' | ...
  hook_tweet_id: string | null;
};

export type ResultRow = {
  game_date: string;
  league: string | null;
  pick_text: string | null;
  result: string | null;        // 'won' | 'lost' | 'push' | 'pending' | ...
  final_score: string | null;
  matchup: string | null;
};

export type VerdictCandidate = {
  logId: string;
  hookTweetId: string;
  pickText: string;
  league: string;
  result: "won" | "lost" | "push";
  finalScore: string;
  matchup: string;
  postDate: string;
};

// Lowercase, strip a trailing bracketed tag ("[verdict]", "[recap]" — appended to satisfy the table's
// UNIQUE(post_date, pick_text) constraint), then ONE trailing odds token — either "(+135)" / "(-190)" or a
// bare "+135" / "-190" (3+ digits so spreads like "-1.5" and totals like "8.5" survive), collapse whitespace.
export function normalizePick(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/\s*\[[^\]]*\]\s*$/, "")
    .replace(/\s*\(\s*[+-]?\d{3,}\s*\)\s*$/, "")
    .replace(/\s*[+-]\d{3,}\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Emoji cap (Jul 10, founder): "naked" model output still keeps zero persona/voice-rule filtering, but
// emoji COUNT is capped — keep at most `max`, drop the rest in place, in the order they appeared. Same
// emoji code-point ranges as the rest of the account's killEmoji() for a consistent definition.
export function capEmoji(text: string, max = 1): string {
  const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu;
  let seen = 0;
  const capped = text.replace(EMOJI_RE, (m) => (++seen <= max ? m : ""));
  return capped.replace(/[ \t]{2,}/g, " ").replace(/ +\n/g, "\n").trim();
}

// Jul 8 2026 (founder): verdicts read worse the more they try to sound like commentary. Plain deterministic
// template, no LLM: "Cashed. Final X-Y." / "Lost. Final X-Y." / "Push. Final X-Y." Nothing else, ever.
export function plainVerdict(result: string, finalScore: string): string {
  const word = result === "won" ? "Cashed" : result === "push" ? "Push" : "Lost";
  return finalScore ? `${word}. Final ${finalScore}.` : `${word}.`;
}

const PICK_FORMATS = new Set(["standard", "top_pick"]);
const GRADED = new Set(["won", "lost", "push"]);

export function matchVerdicts(
  logRows: LogRow[],
  results: ResultRow[],
  opts?: { cap?: number },
): VerdictCandidate[] {
  const cap = opts?.cap ?? 4;
  const done = new Set(
    logRows
      .filter((r) => r.thread_format === "verdict")
      .map((r) => `${r.post_date}|${normalizePick(r.pick_text ?? "")}`),
  );
  const out: VerdictCandidate[] = [];
  for (const row of logRows) {
    if (out.length >= cap) break;
    if (!PICK_FORMATS.has(row.thread_format ?? "")) continue;
    if ((row.league ?? "").toUpperCase() === "WC") continue; // WC finals recaps live in runWcCardMode
    if (!row.hook_tweet_id || !row.pick_text) continue;
    const key = `${row.post_date}|${normalizePick(row.pick_text)}`;
    if (done.has(key)) continue;
    const hit = results.find(
      (r) =>
        String(r.game_date) === row.post_date &&
        (r.league ?? "") === (row.league ?? "") &&
        GRADED.has(String(r.result)) &&
        normalizePick(r.pick_text ?? "") === normalizePick(row.pick_text!),
    );
    if (!hit) continue;
    out.push({
      logId: row.id,
      hookTweetId: row.hook_tweet_id,
      pickText: row.pick_text,
      league: row.league ?? "",
      result: hit.result as VerdictCandidate["result"],
      finalScore: hit.final_score ?? "",
      matchup: hit.matchup ?? "",
      postDate: row.post_date,
    });
    done.add(key);
  }
  return out;
}
