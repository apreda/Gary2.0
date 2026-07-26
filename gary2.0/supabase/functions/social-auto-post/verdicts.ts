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

// Verdict v3 vocabulary (founder, Jul 26 2026): plain chat register — "Hit." / "Miss." / "Push."
export function verdictOpener(result: string): string {
  return result === "won" ? "Hit." : result === "push" ? "Push." : "Miss.";
}

// Deterministic fallback when the grounded LLM verdict errors: opener + final score, nothing else.
export function plainVerdict(result: string, finalScore: string): string {
  const word = verdictOpener(result);
  return finalScore ? `${word} Final ${finalScore}.` : word;
}

// Verdict v3 prompt (founder-approved Jul 26 2026): naked model — no system prompt, no persona,
// no voice rules. The full grounded game report (grade-results ?evidence=1 dossier: final score,
// pitching lines, HRs, notable batting, graded props) is the ONLY fact source; the model opens
// with the result word and writes two plain chat-register sentences about the game.
export function buildVerdictPrompt(
  c: { pickText: string; league: string; result: string; finalScore: string; matchup: string },
  evidence: string,
): string {
  const outcome = c.result === "won" ? "won" : c.result === "push" ? "pushed" : "lost";
  return (
    `The bet was: ${c.pickText} (${c.league}). It ${outcome}. Final score ${c.finalScore}, ${c.matchup}.\n` +
    `Here is what happened in the game. This is the only source of facts you can use, ` +
    `don't add anything that isn't here:\n\n${evidence}\n\n` +
    `Reply starting with exactly "${verdictOpener(c.result)}" then two normal sentences about ` +
    `what happened in the game, like you'd say in a chat. No betting phrases, no hype words, no emojis.`
  );
}

// Sentence-aware tweet cap: cut at the last sentence end inside the limit; hard-slice only if
// there is none. "9-2. The" splits on ". " so decimals like 1.63 never break.
export function trimTweet(s: string, max = 275): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(".\n"));
  return end > 0 ? cut.slice(0, end + 1) : cut.trimEnd();
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
