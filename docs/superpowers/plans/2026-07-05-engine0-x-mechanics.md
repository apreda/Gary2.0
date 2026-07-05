# Engine 0 — X Mechanics Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Verdict Loop (Gary quote-tweets his own picks with a one-line verdict when games go final), upgrade WC recaps to quote-tweets, add the season-arc pinned ledger with weekly updates, and seed Gary's recurring vocabulary — per spec §4 of `docs/superpowers/specs/2026-07-05-social-growth-three-engines-design.md`.

**Architecture:** Everything extends the existing `social-auto-post` Deno edge function plus ONE new posting endpoint (`post-quote-tweet`, a clone of `post-reply-tweet` with `quote_tweet_id`). Pure matching/math logic lives in two new dependency-free TypeScript modules colocated with the function and tested with `node --test` (node v25 runs .ts natively). New posting surfaces are reachable ONLY via `force_mode` + `dry_run` until the founder approves samples; a final gated task wires them into the hourly cron path.

**Tech Stack:** Deno (Supabase edge functions), X API v2 (OAuth 1.0a user context), Gemini `gemini-3.5-flash`, node:test for pure modules, Supabase Postgres (`social_post_log`, `game_results`).

## Global Constraints

- ZERO emojis in any tweet text (VOICE_RULES rule 1; `killEmoji` backstop). NOTE: the ✓/✗ glyphs in `wc_recap` lines are existing founder-approved output — leave them.
- No em/en dashes (`killDashes` backstop), no hashtags, no links in tweet bodies, no rule-of-three, Gary is a CHARACTER never an AI (VOICE_RULES rules 2–10 in `gary2.0/supabase/functions/social-auto-post/index.ts:181`).
- Never claim a cash wager or a lived human experience ("I put 3 units on this" is banned).
- Every new posting surface must be dry-runnable and is NOT wired into the hourly cron until Task 9 (founder gate).
- Deploy command (from `Desktop/Gary2.0/`): `npx supabase functions deploy <fn> --project-ref xuttubsfgdcjfgmskcol --use-api`. A fix is not fixed until DEPLOYED (repo CLAUDE.md rule).
- Commit after every task; messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- All dates/hours are ET (`etParts()` exists for this).
- Founder approval already given for this build ("the spec is good build it", Jul 5); the remaining founder gates are the ones named in Tasks 6–9.

---

### Task 1: `post-quote-tweet` edge function

**Files:**
- Create: `gary2.0/supabase/functions/post-quote-tweet/index.ts`

**Interfaces:**
- Consumes: X OAuth secrets already set in Supabase (`X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`).
- Produces: HTTP endpoint `POST /functions/v1/post-quote-tweet` with body `{ text: string, quoteTweetId: string }` → `{ success: true, tweetId: string, quoteTweetId: string }` (or `{ error }` with status 400/500). Task 3's `postQuote()` helper calls this.

- [ ] **Step 1: Create the function** — copy `gary2.0/supabase/functions/post-reply-tweet/index.ts` verbatim (the `hmacSha1`, `percentEncode`, `generateOAuthHeader` helpers are identical), then replace the `Deno.serve` block with:

```ts
Deno.serve(async (req: Request) => {
  try {
    const { text, quoteTweetId } = await req.json();
    if (!text) {
      return new Response(JSON.stringify({ error: "Missing 'text' in body" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    if (!quoteTweetId) {
      return new Response(JSON.stringify({ error: "Missing 'quoteTweetId' in body. Use post-single-tweet for non-quote tweets." }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const apiKey = (Deno.env.get("X_API_KEY") || "").trim();
    const apiSecret = (Deno.env.get("X_API_SECRET") || "").trim();
    const accessToken = (Deno.env.get("X_ACCESS_TOKEN") || "").trim();
    const accessTokenSecret = (Deno.env.get("X_ACCESS_TOKEN_SECRET") || "").trim();

    const url = "https://api.x.com/2/tweets";
    const authHeader = await generateOAuthHeader(
      "POST", url, {},
      apiKey, apiSecret, accessToken, accessTokenSecret
    );

    const body = {
      text,
      quote_tweet_id: String(quoteTweetId),
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) {
      return new Response(JSON.stringify({ error: "Quote tweet failed", status: response.status, details: data }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ success: true, tweetId: data?.data?.id, quoteTweetId }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
```

Update the top-of-file comment to say: `// post-quote-tweet — posts a tweet quoting another tweet (X API v2 quote_tweet_id). Body: { text, quoteTweetId }.`

- [ ] **Step 2: Deploy**

Run: `cd /Users/adam.preda/Desktop/Gary2.0 && npx supabase functions deploy post-quote-tweet --project-ref xuttubsfgdcjfgmskcol --use-api`
Expected: deploy success output listing `post-quote-tweet`.

- [ ] **Step 3: Verify validation path (no live tweet)**

Run (ANON_KEY from `gary2.0/.env` `SUPABASE_ANON_KEY`):
```bash
curl -s -X POST "https://xuttubsfgdcjfgmskcol.supabase.co/functions/v1/post-quote-tweet" \
  -H "Authorization: Bearer $ANON_KEY" -H "Content-Type: application/json" -d '{}'
```
Expected: `{"error":"Missing 'text' in body"}`. Then with `-d '{"text":"x"}'` expected: `{"error":"Missing 'quoteTweetId' in body. ..."}`. Do NOT post a real quote tweet in this task — the first live fire is the founder-approved verdict in Task 9.

- [ ] **Step 4: Commit**

```bash
git add gary2.0/supabase/functions/post-quote-tweet/index.ts
git commit -m "feat: post-quote-tweet endpoint (X v2 quote_tweet_id)"
```

---

### Task 2: `verdicts.ts` pure matching module + tests

**Files:**
- Create: `gary2.0/supabase/functions/social-auto-post/verdicts.ts`
- Test: `gary2.0/supabase/functions/social-auto-post/verdicts.test.ts`

**Interfaces:**
- Consumes: nothing (dependency-free).
- Produces: `normalizePick(s: string): string` and `matchVerdicts(logRows: LogRow[], results: ResultRow[], opts?: { cap?: number }): VerdictCandidate[]` with the exact types below. Task 3 imports both from `./verdicts.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
// gary2.0/supabase/functions/social-auto-post/verdicts.test.ts
// Run: node --test gary2.0/supabase/functions/social-auto-post/verdicts.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { normalizePick, matchVerdicts, type LogRow, type ResultRow } from "./verdicts.ts";

const log = (o: Partial<LogRow>): LogRow => ({
  id: "L1", post_date: "2026-07-05", league: "MLB", pick_text: "Pirates ML -190",
  thread_format: "standard", hook_tweet_id: "111", ...o,
});
const res = (o: Partial<ResultRow>): ResultRow => ({
  game_date: "2026-07-05", league: "MLB", pick_text: "Pirates ML -190",
  result: "won", final_score: "5-2", matchup: "Pirates @ Reds", ...o,
});

test("normalizePick strips trailing American odds and parenthesized odds", () => {
  assert.equal(normalizePick("Pirates ML -190"), "pirates ml");
  assert.equal(normalizePick("Yankees -1.5 (+135)"), "yankees -1.5");
  assert.equal(normalizePick("Under 8.5"), "under 8.5"); // spread/total decimals survive
});

test("matches a graded standard pick to a verdict candidate", () => {
  const out = matchVerdicts([log({})], [res({})]);
  assert.equal(out.length, 1);
  assert.equal(out[0].hookTweetId, "111");
  assert.equal(out[0].result, "won");
  assert.equal(out[0].finalScore, "5-2");
});

test("skips rows already verdicted (dedup by post_date + normalized pick)", () => {
  const done = log({ id: "L2", thread_format: "verdict", pick_text: "Pirates ML -190" });
  const out = matchVerdicts([log({}), done], [res({})]);
  assert.equal(out.length, 0);
});

test("skips WC rows (finals-driven wc_recap owns those)", () => {
  const out = matchVerdicts([log({ league: "WC" })], [res({ league: "WC" })]);
  assert.equal(out.length, 0);
});

test("skips ungraded and pending results", () => {
  assert.equal(matchVerdicts([log({})], [res({ result: "pending" })]).length, 0);
  assert.equal(matchVerdicts([log({})], []).length, 0);
});

test("requires same date and league; matches on normalized pick text", () => {
  assert.equal(matchVerdicts([log({})], [res({ game_date: "2026-07-04" })]).length, 0);
  assert.equal(matchVerdicts([log({})], [res({ league: "NBA" })]).length, 0);
  const out = matchVerdicts([log({ pick_text: "Pirates ML" })], [res({ pick_text: "Pirates ML -190" })]);
  assert.equal(out.length, 1); // odds mismatch tolerated via normalization
});

test("caps candidates per run", () => {
  const rows = ["A ML -110", "B ML -110", "C ML -110", "D ML -110", "E ML -110"]
    .map((p, i) => log({ id: `L${i}`, pick_text: p, hook_tweet_id: `${i}` }));
  const results = rows.map((r) => res({ pick_text: r.pick_text! }));
  assert.equal(matchVerdicts(rows, results).length, 4);
  assert.equal(matchVerdicts(rows, results, { cap: 2 }).length, 2);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/adam.preda/Desktop/Gary2.0 && node --test gary2.0/supabase/functions/social-auto-post/verdicts.test.ts`
Expected: FAIL — cannot find module `./verdicts.ts`.

- [ ] **Step 3: Write the module**

```ts
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

// Lowercase, strip ONE trailing odds token — either "(+135)" / "(-190)" or a bare "+135" / "-190"
// (3+ digits so spreads like "-1.5" and totals like "8.5" survive), collapse whitespace.
export function normalizePick(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/\s*\(\s*[+-]?\d{3,}\s*\)\s*$/, "")
    .replace(/\s*[+-]\d{3,}\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test gary2.0/supabase/functions/social-auto-post/verdicts.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add gary2.0/supabase/functions/social-auto-post/verdicts.ts gary2.0/supabase/functions/social-auto-post/verdicts.test.ts
git commit -m "feat: verdict-loop matching module with node tests"
```

---

### Task 3: `runVerdictMode` in social-auto-post (force_mode only)

**Files:**
- Modify: `gary2.0/supabase/functions/social-auto-post/index.ts` (imports at top; new helpers + mode after `runPickMode`, which ends at line 296; serve() routing at lines 657–694)

**Interfaces:**
- Consumes: `matchVerdicts`/`normalizePick` from `./verdicts.ts` (Task 2); `post-quote-tweet` endpoint (Task 1); existing `callLLM`, `parseJsonBlock`, `clean`, `yesterdayOf`, `VOICE_RULES`, `sb`.
- Produces: `postQuote(text: string, quoteTweetId: string): Promise<string>` (Task 4 reuses it); `runVerdictMode(today: string, dryRun: boolean)` returning `{ posted, dry_run?, verdicts: [...] }`; URL param `force_mode=verdict`. Log rows with `thread_format='verdict'`, `hook_tweet_id`=the verdict tweet, `cta_tweet_id`=the quoted original (so `refreshMetrics` picks both up automatically via its existing id-sweep).

- [ ] **Step 1: Add the import** — top of `index.ts` after the `createClient` import:

```ts
import { matchVerdicts } from "./verdicts.ts";
```

- [ ] **Step 2: Add `postQuote` helper** — directly after the `postTweet` function (after line 139):

```ts
async function postQuote(text: string, quoteTweetId: string): Promise<string> {
  const r = await fetch(`${SB_URL}/functions/v1/post-quote-tweet`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text, quoteTweetId }),
  });
  const j = await r.json();
  if (!j.success || !j.tweetId) throw new Error(`post-quote-tweet failed: ${JSON.stringify(j).slice(0, 300)}`);
  return j.tweetId as string;
}
```

- [ ] **Step 3: Add `runVerdictMode`** — after `runPickMode` (after line 296):

```ts
// VERDICT LOOP (Engine 0, Jul 2026): when a game Gary tweeted a pick for goes FINAL, quote-tweet HIS OWN
// pick tweet with a one-line verdict. Win = short swagger, loss = owned flat, push = shrug. The quote surfaces
// the original timestamped call (native receipts). Covers standard/top_pick threads from today AND yesterday
// (late finals grade after midnight ET); WC is excluded (runWcCardMode's finals recap owns it).
const VERDICT_CAP_PER_RUN = 4;

function fallbackVerdict(result: string, finalScore: string): string {
  if (result === "won") return `Cashed.${finalScore ? ` Final ${finalScore}.` : ""}`;
  if (result === "push") return "Push. Money back.";
  return `Didn't land.${finalScore ? ` Final ${finalScore}.` : ""} On the tape like everything else.`;
}

async function verdictLine(c: { pickText: string; matchup: string; result: string; finalScore: string; league: string }): Promise<string> {
  try {
    const user = `Gary is quote-tweeting HIS OWN pick from earlier today, now that the game is final. Write the ONE short verdict line that goes above the quoted pick. Return ONLY JSON: {"verdict":"..."}.
PICK: ${c.pickText} | GAME: ${c.matchup} (${c.league}) | FINAL SCORE: ${c.finalScore || "n/a"} | RESULT: ${c.result.toUpperCase()}
Match this VOICE (different games, copy the register not the facts):
WIN example: "Never sweated it. Pirates by three."
WIN example: "Cashed. That bullpen had no business holding a lead and it didn't."
LOSS example: "Scored twice all night. I'll wear that one."
LOSS example: "Had the right read and the wrong ninth inning. It stays on the tape."
PUSH example: "Push. Money back, nothing learned."
Rules: under 180 characters. Past tense, first person. Reference the real final score or one real detail. On a WIN no gloating cliches (banned: easy, free, told you, never a doubt). On a LOSS own it flat, no excuses, no apology tour. Never mention money or units wagered.`;
    const out = parseJsonBlock(await callLLM(VOICE_RULES, user));
    const v = clean(out.verdict);
    return v || fallbackVerdict(c.result, c.finalScore);
  } catch (e) {
    console.error("verdictLine LLM failed, using fallback: " + String(e));
    return fallbackVerdict(c.result, c.finalScore);
  }
}

async function runVerdictMode(today: string, dryRun: boolean) {
  const dates = [today, yesterdayOf(today)];
  const { data: logRows, error: logErr } = await sb.from("social_post_log")
    .select("id, post_date, league, pick_text, thread_format, hook_tweet_id")
    .in("post_date", dates);
  if (logErr) throw logErr;
  const { data: results, error: resErr } = await sb.from("game_results")
    .select("game_date, league, pick_text, result, final_score, matchup")
    .in("game_date", dates);
  if (resErr) throw resErr;
  const cands = matchVerdicts(
    (logRows ?? []) as any,
    (results ?? []).map((r: any) => ({ ...r, game_date: String(r.game_date) })),
    { cap: VERDICT_CAP_PER_RUN },
  );
  if (!cands.length) return { posted: false, reason: "no graded, unverdicted pick tweets" };

  const verdicts: any[] = [];
  for (const c of cands) {
    const text = await verdictLine(c);
    if (dryRun) { verdicts.push({ pick: c.pickText, result: c.result, quoting: c.hookTweetId, text }); continue; }
    try {
      const id = await postQuote(text, c.hookTweetId);
      await sb.from("social_post_log").insert({
        post_date: c.postDate, slot: "verdict", league: c.league, pick_text: c.pickText,
        thread_format: "verdict", hook_tweet_id: id, cta_tweet_id: c.hookTweetId,
        thread_url: `https://x.com/BetwithGary/status/${id}`,
      });
      verdicts.push({ pick: c.pickText, result: c.result, thread_url: `https://x.com/BetwithGary/status/${id}` });
    } catch (e) {
      console.error(`verdict post failed for ${c.pickText}: ` + String(e));
      verdicts.push({ pick: c.pickText, result: c.result, error: String(e) });
    }
  }
  return { posted: verdicts.some((v) => v.thread_url), dry_run: dryRun || undefined, verdicts };
}
```

- [ ] **Step 4: Route `force_mode=verdict` in serve()** — in the `Deno.serve` handler, directly after the `if (force === "wc") {...}` line (line 684), add:

```ts
    if (force === "verdict") {
      const verdict = await runVerdictMode(today, dryRun);
      console.log(JSON.stringify({ mode: "verdict", verdict }).slice(0, 500));
      return Response.json({ mode: "verdict", metrics, verdict });
    }
```

Also update the file-header comment (line 20) `?force_mode=pick|recap|personality|wc` → `?force_mode=pick|recap|personality|wc|verdict`. Do NOT add verdict to the unforced hourly path yet — that is Task 9's founder-gated flip.

- [ ] **Step 5: Deploy and dry-run against real data**

```bash
npx supabase functions deploy social-auto-post --project-ref xuttubsfgdcjfgmskcol --use-api
curl -s "https://xuttubsfgdcjfgmskcol.supabase.co/functions/v1/social-auto-post?force_mode=verdict&dry_run=1" \
  -H "Authorization: Bearer $ANON_KEY" | python3 -m json.tool
```
Expected: `{"mode":"verdict", ..., "verdict":{...}}` — either `reason: "no graded, unverdicted pick tweets"` (valid on a quiet morning) or a `verdicts` array whose every `text` is under 200 chars, has no emoji/dash/hashtag, and reads in Gary's voice. If today has no graded picks yet, re-run after tonight's slate grades and paste the output for the founder.

- [ ] **Step 6: Run the module tests still pass + commit**

```bash
node --test gary2.0/supabase/functions/social-auto-post/verdicts.test.ts
git add gary2.0/supabase/functions/social-auto-post/index.ts
git commit -m "feat: verdict-loop mode in social-auto-post (force_mode=verdict, dry-run gated)"
```

---

### Task 4: WC recap upgrade — quote the original picks tweet

**Files:**
- Modify: `gary2.0/supabase/functions/social-auto-post/index.ts` (`runWcCardMode`: log select at line 466, recap-action builder at lines 489–501, posting switch at lines 564–566)

**Interfaces:**
- Consumes: `postQuote` (Task 3).
- Produces: `wc_recap` tweets become quote-tweets of that game's `wc_picks` tweet when one exists (receipts show the original call); plain text otherwise. No schema or log-shape change.

- [ ] **Step 1: Include `hook_tweet_id` in the log select** — line 466 becomes:

```ts
  const { data: logRows } = await sb.from("social_post_log").select("pick_text, thread_format, hook_tweet_id").eq("post_date", today).eq("league", "WC");
```

- [ ] **Step 2: Attach the quote target to recap actions** — inside the recap loop (after the `header` line at 499), find the game's picks tweet and add it to the action:

```ts
    const picksRow = log.find((r) => r.thread_format === "wc_picks" && sameGame(String(r.pick_text), g.key));
    actions.push({ type: "recap", game: g.key, quoteId: picksRow?.hook_tweet_id ?? null, text: `WC Picks all day long.\n\n${header}\n\n${lines.join("\n")}` });
```
(This replaces the existing `actions.push({ type: "recap", ... })` line.)

- [ ] **Step 3: Post recaps as quotes when possible** — the `else` branch of the posting switch (lines 564–566) becomes:

```ts
      } else {
        tweetId = a.quoteId ? await postQuote(a.text, a.quoteId) : await postTweet(a.text);
      }
```

Wrap nothing else — if `postQuote` throws, the existing per-action try/catch already logs and continues; add a text fallback inside the branch:

```ts
      } else {
        if (a.quoteId) {
          try { tweetId = await postQuote(a.text, a.quoteId); }
          catch (e) { console.error("wc recap quote failed, posting plain: " + String(e)); tweetId = await postTweet(a.text); }
        } else {
          tweetId = await postTweet(a.text);
        }
      }
```
(Use this second form — it is the final code.)

- [ ] **Step 4: Deploy + dry-run**

```bash
npx supabase functions deploy social-auto-post --project-ref xuttubsfgdcjfgmskcol --use-api
curl -s "https://xuttubsfgdcjfgmskcol.supabase.co/functions/v1/social-auto-post?force_mode=wc&dry_run=1" \
  -H "Authorization: Bearer $ANON_KEY" | python3 -m json.tool
```
Expected: recap actions (when a WC final exists today) now carry `"quoteId"` alongside `"text"`. On a day with no WC finals yet, expected `actions: []` or picks-only actions — re-check after the next WC final.

- [ ] **Step 5: Commit**

```bash
git add gary2.0/supabase/functions/social-auto-post/index.ts
git commit -m "feat: WC finals recap quote-tweets the original picks tweet (receipts)"
```

---

### Task 5: `pl.ts` — $100-flat P/L math module + tests

**Files:**
- Create: `gary2.0/supabase/functions/social-auto-post/pl.ts`
- Test: `gary2.0/supabase/functions/social-auto-post/pl.test.ts`

**Interfaces:**
- Consumes: nothing (dependency-free). Math ported from `gary2.0/results-card/lib.cjs` (`profitOn100`, trailing-odds parse) so the arc ledger matches the results card's numbers.
- Produces: `parseTrailingOdds(pickText: string): number | null`, `profitOn100(odds: number | null, result: string): number | null`, `money(n: number): string`, `computeStanding(rows: { pick_text: string | null; result: string | null }[]): { w: number; l: number; p: number; net: number; record: string; netLabel: string }`. Task 6 imports `computeStanding` from `./pl.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
// gary2.0/supabase/functions/social-auto-post/pl.test.ts
// Run: node --test gary2.0/supabase/functions/social-auto-post/pl.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { parseTrailingOdds, profitOn100, money, computeStanding } from "./pl.ts";

test("parseTrailingOdds reads a trailing American odds token", () => {
  assert.equal(parseTrailingOdds("Pirates ML -190"), -190);
  assert.equal(parseTrailingOdds("Yankees -1.5 (+135)"), 135);
  assert.equal(parseTrailingOdds("Under 8.5"), null);      // a total line is not odds
  assert.equal(parseTrailingOdds("Dodgers -1.5"), null);   // a spread is not odds
});

test("profitOn100 matches the results-card math", () => {
  assert.equal(profitOn100(-190, "won"), 10000 / 190);
  assert.equal(profitOn100(135, "won"), 135);
  assert.equal(profitOn100(-190, "lost"), -100);
  assert.equal(profitOn100(null, "push"), 0);
  assert.equal(profitOn100(null, "won"), null); // unpriced win counts in record, $0 in net
});

test("money renders whole dollars with sign", () => {
  assert.equal(money(1240.4), "+$1,240");
  assert.equal(money(-52.63), "-$53");
  assert.equal(money(0), "+$0");
});

test("computeStanding aggregates record and net", () => {
  const s = computeStanding([
    { pick_text: "A ML -200", result: "won" },   // +50
    { pick_text: "B ML +150", result: "won" },   // +150
    { pick_text: "C ML -110", result: "lost" },  // -100
    { pick_text: "D ML -110", result: "push" },  // 0
    { pick_text: "E ML -110", result: "pending" }, // ignored
  ]);
  assert.equal(s.w, 2); assert.equal(s.l, 1); assert.equal(s.p, 1);
  assert.equal(Math.round(s.net), 100);
  assert.equal(s.record, "2-1");
  assert.equal(s.netLabel, "+$100");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test gary2.0/supabase/functions/social-auto-post/pl.test.ts`
Expected: FAIL — cannot find module `./pl.ts`.

- [ ] **Step 3: Write the module**

```ts
// gary2.0/supabase/functions/social-auto-post/pl.ts
// $100-flat-stake P/L math for the season-arc ledger. Ported from results-card/lib.cjs so the arc's
// numbers always agree with the results card. Odds ride the trailing token of pick_text ("Pirates ML -190");
// 3+ digits so spreads (-1.5) and totals (8.5) are never mistaken for a price.

export function parseTrailingOdds(pickText: string): number | null {
  const m = String(pickText ?? "").match(/\(?([+-]\d{3,})\)?\s*$/);
  return m ? parseInt(m[1], 10) : null;
}

export function profitOn100(odds: number | null, result: string): number | null {
  if (result === "push") return 0;
  if (result !== "won") return -100;
  if (odds == null) return null;
  return odds > 0 ? odds : 10000 / Math.abs(odds);
}

export function money(n: number): string {
  const rounded = Math.round(Math.abs(n));
  return `${n >= 0 ? "+$" : "-$"}${rounded.toLocaleString("en-US")}`;
}

export function computeStanding(
  rows: { pick_text: string | null; result: string | null }[],
): { w: number; l: number; p: number; net: number; record: string; netLabel: string } {
  let w = 0, l = 0, p = 0, net = 0;
  for (const r of rows) {
    const result = String(r.result ?? "");
    if (result === "won") w++;
    else if (result === "lost") l++;
    else if (result === "push") p++;
    else continue;
    net += profitOn100(parseTrailingOdds(r.pick_text ?? ""), result) ?? 0;
  }
  return { w, l, p, net, record: `${w}-${l}`, netLabel: money(net) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test gary2.0/supabase/functions/social-auto-post/pl.test.ts`
Expected: all PASS. (Note `money(-52.63)` = `-$53` — Math.round on the absolute value.)

- [ ] **Step 5: Commit**

```bash
git add gary2.0/supabase/functions/social-auto-post/pl.ts gary2.0/supabase/functions/social-auto-post/pl.test.ts
git commit -m "feat: $100-flat P/L standing module for the season arc"
```

---

### Task 6: Season arc — pin draft + weekly `runArcUpdateMode`

**Files:**
- Modify: `gary2.0/supabase/functions/social-auto-post/index.ts` (import `computeStanding`; new mode after `runVerdictMode`; serve() wiring)
- Create: `GaryMarketing/ARC_PIN.md` (the pin copy + launch runbook, founder-facing)

**Interfaces:**
- Consumes: `computeStanding` from `./pl.ts` (Task 5); existing `postTweet` (reply form), `etParts`, `sb`.
- Produces: `runArcUpdateMode(today: string, dryRun: boolean)`; URL param `force_mode=arc`; log rows `thread_format='arc_update'`; expects ONE manually-inserted `thread_format='arc_pin'` row whose `hook_tweet_id` is the pinned tweet (runbook below). Fires unforced only on Monday ET hour 12 (Task 9 wires that; until then force-only).

- [ ] **Step 1: Write `GaryMarketing/ARC_PIN.md`** — full content:

```markdown
# Season Arc Pin — "$100 flat, every pick, all season"

## The pinned tweet (post once, founder pins it)

    Every pick I post. $100 flat on each. All season.

    Wins and losses stay up. The standing posts here every Monday.

    This is the tape.

## First reply to the pin (carries the install link, ct=x_pinned)

    The full tape, graded daily, is in the app:
    https://apps.apple.com/us/app/gary-ai/id6751238914?ppid=3c207d81-dc0d-4cc3-a50d-b5f47e29b18f&ct=x_pinned

## Launch runbook (manual, founder-gated)
1. Post the pin text via post-single-tweet (curl or session helper). Save the returned tweetId.
2. Post the reply via post-reply-tweet with replyToId=<pin tweetId>.
3. Founder pins the tweet in the X app (replacing pin 2067647642495029725).
4. Insert the anchor row so the weekly update can find the pin:
   insert into social_post_log (post_date, slot, league, pick_text, thread_format, hook_tweet_id, thread_url, posted_at)
   values ('<ET date>', 'pin', 'ARC', 'SEASON ARC PIN', 'arc_pin', '<pin tweetId>', 'https://x.com/BetwithGary/status/<pin tweetId>', now());
5. Verify: force_mode=arc&dry_run=1 returns the standing reply text.

ARC_START is 2026-07-06 (the season ledger starts the day the arc goes live).
```

- [ ] **Step 2: Add the import** — extend the Task 3 import line:

```ts
import { matchVerdicts } from "./verdicts.ts";
import { computeStanding } from "./pl.ts";
```

- [ ] **Step 3: Add `runArcUpdateMode`** — after `runVerdictMode`:

```ts
// SEASON ARC (Engine 0, Jul 2026): the pinned post promises "every pick, $100 flat, all season"; this mode
// posts the weekly standing as a REPLY under the pin (Monday noon ET). The pin itself is posted+pinned once,
// manually (GaryMarketing/ARC_PIN.md runbook), and anchored by a thread_format='arc_pin' log row.
const ARC_START = "2026-07-06";

async function runArcUpdateMode(today: string, dryRun: boolean) {
  const { data: pinRows } = await sb.from("social_post_log")
    .select("hook_tweet_id").eq("thread_format", "arc_pin")
    .order("posted_at", { ascending: false }).limit(1);
  const pinId = pinRows?.[0]?.hook_tweet_id;
  if (!pinId) return { posted: false, reason: "no arc_pin row yet (see GaryMarketing/ARC_PIN.md runbook)" };

  const weekAgo = new Date(Date.now() - 6 * 86400_000).toISOString().slice(0, 10);
  const { data: recent } = await sb.from("social_post_log")
    .select("id").eq("thread_format", "arc_update").gte("post_date", weekAgo).limit(1);
  if (recent?.length && !dryRun) return { posted: false, reason: "arc update already posted this week" };

  const { data: rows, error } = await sb.from("game_results")
    .select("pick_text, result").gte("game_date", ARC_START);
  if (error) throw error;
  const s = computeStanding(rows ?? []);
  if (!s.w && !s.l && !s.p) return { posted: false, reason: "no graded picks since ARC_START yet" };

  const pushes = s.p ? ` with ${s.p} push${s.p === 1 ? "" : "es"}` : "";
  const text = `The tape since July 6th, every pick at $100 flat:\n\n${s.record}${pushes}\nNet: ${s.netLabel}\n\nEvery result stays up. Wins and losses.`;

  if (dryRun) return { posted: false, dry_run: true, standing: s, text };

  const tweetId = await postTweet(text, pinId);
  await sb.from("social_post_log").insert({
    post_date: today, slot: "pin", league: "ARC", pick_text: `ARC UPDATE ${today}`,
    thread_format: "arc_update", hook_tweet_id: tweetId,
    thread_url: `https://x.com/BetwithGary/status/${tweetId}`,
  });
  return { posted: true, standing: s, thread_url: `https://x.com/BetwithGary/status/${tweetId}` };
}
```

- [ ] **Step 4: Route `force_mode=arc` in serve()** — directly after the Task 3 `force === "verdict"` block:

```ts
    if (force === "arc") {
      const arc = await runArcUpdateMode(today, dryRun);
      console.log(JSON.stringify({ mode: "arc", arc }).slice(0, 500));
      return Response.json({ mode: "arc", metrics, arc });
    }
```

Update the header comment's force_mode list to `pick|recap|personality|wc|verdict|arc`.

- [ ] **Step 5: Deploy + dry-run**

```bash
npx supabase functions deploy social-auto-post --project-ref xuttubsfgdcjfgmskcol --use-api
curl -s "https://xuttubsfgdcjfgmskcol.supabase.co/functions/v1/social-auto-post?force_mode=arc&dry_run=1" \
  -H "Authorization: Bearer $ANON_KEY" | python3 -m json.tool
```
Expected BEFORE the pin exists: `{"arc":{"posted":false,"reason":"no arc_pin row yet (see GaryMarketing/ARC_PIN.md runbook)"}}`. That is the correct pass state for this task — the live pin launch is the founder-gated step in Task 9.

- [ ] **Step 6: Run both module test files + commit**

```bash
node --test gary2.0/supabase/functions/social-auto-post/verdicts.test.ts gary2.0/supabase/functions/social-auto-post/pl.test.ts
git add gary2.0/supabase/functions/social-auto-post/index.ts GaryMarketing/ARC_PIN.md
git commit -m "feat: season-arc weekly standing mode (force_mode=arc) + pin runbook"
```

---

### Task 7: Gary's running-bits sheet (founder-gated creative)

**Files:**
- Create: `GaryMarketing/GARY_BITS.md`

**Interfaces:**
- Consumes: nothing.
- Produces: the approved-bits list Task 8 seeds into both functions' prompts. FOUNDER GATE: present this file in chat and get approval/edits BEFORE starting Task 8.

- [ ] **Step 1: Write the draft sheet** — full content:

```markdown
# Gary's Running Bits — recurring vocabulary (draft for founder review, Jul 2026)

Why: Trent has "MEGA MAX", biev has "how's ya". Followers learn the bits and echo them; the account
becomes quotable. Gary needs his own. Rules: zero emojis, never money-wagered claims, never AI-adjacent,
must work in his cigar-boss-bear register. Use at most ONE bit per post, and only where it fits naturally.

## The anchor noun: "the tape"
Gary's public ledger of results is always "the tape". Never "my record", never "the ledger".
- "It's on the tape." (anything graded, win or loss)
- "Check the tape." (receipts pointer, replying to doubters)
- "The tape since July 6th..." (the weekly arc standing)

## The bits
1. "That's the play." — pick closer. His stamp on a call.
2. "Never sweated it." — win that was never close.
3. "Cashed. Next." — quick win verdict on a routine day.
4. "I'll wear that one." — loss ownership. Flat, no excuses.
5. "Money back, nothing learned." — push.
6. "The number's the number." — when the stat IS the argument; also for defending an unpopular pick.
7. "Paid like it should've." — an underdog or plus-money win.
8. "Same read, next game." — after a loss where the process was right (no chasing, no tilt).

## Explicitly rejected
- "Book it" (collides with the Bookit brand), "Lock", "Whale", ALL-CAPS bits, anything with an emoji,
  "easy money" and every banned capper line in VOICE_RULES rule 8.
```

- [ ] **Step 2: Present to the founder in chat** — paste the bits list and ask for cuts/edits/additions. STOP until he reacts. Record his edits in the file.

- [ ] **Step 3: Commit**

```bash
git add GaryMarketing/GARY_BITS.md
git commit -m "docs: Gary running-bits sheet (founder-approved vocabulary)"
```

---

### Task 8: Seed the approved bits into both functions' prompts

**Files:**
- Modify: `gary2.0/supabase/functions/social-auto-post/index.ts:194` (the STYLE line at the end of `VOICE_RULES`)
- Modify: `gary2.0/supabase/functions/gary-mention-reply/index.ts:109` (its `VOICE_RULES` copy, same insertion)

**Interfaces:**
- Consumes: the approved bits from `GaryMarketing/GARY_BITS.md` (Task 7). If the founder changed wording, use HIS wording verbatim.
- Produces: both prompts carry the same RECURRING VOCABULARY block; the verdict few-shots in `verdictLine` already model two bits ("I'll wear that one", "on the tape").

- [ ] **Step 1: Append the vocabulary block to `VOICE_RULES` in social-auto-post** — insert before the final `Always return ONLY valid JSON as instructed.` sentence of the STYLE line:

```
RECURRING VOCABULARY (Gary's own bits; use AT MOST one per post and only where it fits naturally, never forced): his results ledger is always "the tape" ("It's on the tape", "Check the tape"). Closers he actually uses: "That's the play." (stamping a pick), "Never sweated it." (a win never in doubt), "Cashed. Next." (routine win), "I'll wear that one." (owning a loss), "Money back, nothing learned." (push), "The number's the number." (the stat is the argument), "Paid like it should've." (plus-money win), "Same read, next game." (loss, process was right).
```

- [ ] **Step 2: Make the identical insertion in gary-mention-reply's `VOICE_RULES`** (line 109's template literal, same position — before its final JSON-instruction sentence).

- [ ] **Step 3: Deploy BOTH functions + voice-check dry-runs**

```bash
npx supabase functions deploy social-auto-post --project-ref xuttubsfgdcjfgmskcol --use-api
npx supabase functions deploy gary-mention-reply --project-ref xuttubsfgdcjfgmskcol --use-api
curl -s "https://xuttubsfgdcjfgmskcol.supabase.co/functions/v1/social-auto-post?preview=1" -H "Authorization: Bearer $ANON_KEY" | python3 -m json.tool
curl -s "https://xuttubsfgdcjfgmskcol.supabase.co/functions/v1/gary-mention-reply?dry=1&all=1" -H "Authorization: Bearer $ANON_KEY" | python3 -m json.tool
```
Expected: composed samples read naturally; a bit appears in SOME outputs (not all — "at most one, only where natural"). If every sample forces a bit, strengthen the "never forced" clause and redeploy.

- [ ] **Step 4: Commit**

```bash
git add gary2.0/supabase/functions/social-auto-post/index.ts gary2.0/supabase/functions/gary-mention-reply/index.ts
git commit -m "feat: seed Gary's recurring vocabulary into poster + mention-bot prompts"
```

---

### Task 9: Founder gates + go-live wiring (verdict hourly, arc Monday, pin launch)

**Files:**
- Modify: `gary2.0/supabase/functions/social-auto-post/index.ts` (serve() unforced path, lines 679–689)

**Interfaces:**
- Consumes: everything above. THREE founder gates, in order: (a) founder approves a full slate day of verdict dry-runs (paste tonight's `force_mode=verdict&dry_run=1` output after games grade); (b) founder approves the arc pin copy in `ARC_PIN.md`; (c) founder executes the pin runbook (post, pin in app, insert `arc_pin` row).
- Produces: verdicts fire on the hourly cron; arc standing fires Monday noon ET; the whole Engine 0 loop is live.

- [ ] **Step 1 (after gate a): Wire verdict into the unforced hourly path** — in serve(), after the WC block (`if (!force || force === "wc") {...}` at lines 679–683) add:

```ts
    // Verdict loop rides every unforced hourly run (like WC): finals detected within ~1hr, quote-tweeted.
    let verdict: any = undefined;
    if (!force) {
      try { verdict = await runVerdictMode(today, dryRun); }
      catch (e) { console.error("verdict mode failed: " + String(e)); verdict = { error: String(e) }; }
    }
```

Then include `verdict` in the two `Response.json` returns that currently include `wc` (lines 686 and 689): `{ posted: false, reason: ..., metrics, wc, verdict }` and `{ mode, metrics, wc, verdict, ...result }`.

- [ ] **Step 2 (after gate a): Wire arc into Monday noon** — extend the same block:

```ts
    let arc: any = undefined;
    if (!force && hour === 12 && new Date().toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short" }) === "Mon") {
      try { arc = await runArcUpdateMode(today, dryRun); }
      catch (e) { console.error("arc mode failed: " + String(e)); arc = { error: String(e) }; }
    }
```
Include `arc` in the same two responses. (The noon hour is free — the personality post retired Jun 29.)

- [ ] **Step 3: Deploy + verify the hourly path stays healthy**

```bash
npx supabase functions deploy social-auto-post --project-ref xuttubsfgdcjfgmskcol --use-api
curl -s "https://xuttubsfgdcjfgmskcol.supabase.co/functions/v1/social-auto-post?dry_run=1" -H "Authorization: Bearer $ANON_KEY" | python3 -m json.tool
```
Expected: response now carries `wc`, `verdict` (and `arc` only Monday noon) keys; no errors. The next real cron tick (:45 UTC) posts the first live verdict when a graded pick exists — check `social_post_log` for a `thread_format='verdict'` row and open its `thread_url`.

- [ ] **Step 4 (gates b+c): Launch the pin** — walk the founder through `GaryMarketing/ARC_PIN.md` steps 1–4 (post pin, post link reply, he pins in the X app, insert the `arc_pin` row via `execute_sql`). Then verify:

```bash
curl -s "https://xuttubsfgdcjfgmskcol.supabase.co/functions/v1/social-auto-post?force_mode=arc&dry_run=1" -H "Authorization: Bearer $ANON_KEY" | python3 -m json.tool
```
Expected: `{"arc":{"dry_run":true,"standing":{...},"text":"The tape since July 6th..."}}`.

- [ ] **Step 5: Commit + update memory**

```bash
git add gary2.0/supabase/functions/social-auto-post/index.ts
git commit -m "feat: verdict loop live on hourly cron; arc standing live Monday noon ET"
```
Update `memory/project_social_growth_three_engines.md`: Engine 0 SHIPPED (verdict live date, pin tweet id, what remains = Engines 1–3).

---

## Self-Review Notes

- **Spec coverage:** §4.1 Verdict Loop → Tasks 1–3, 9; §4.2 bits → Tasks 7–8; §4.3 arc pin → Tasks 5–6, 9; §4.4 live sweats → deferred by spec (no task, correct); WC receipts upgrade (research finding #1 applied to the existing surface) → Task 4; preview-first discipline → force_mode-only until Task 9, table in spec §8 honored.
- **Types:** `matchVerdicts` and `computeStanding` signatures consumed in Tasks 3/6 match Tasks 2/5 definitions exactly. `postQuote` (Task 3) reused in Task 4.
- **Verified against live schema:** `social_post_log` (post_date, slot, league, pick_text, confidence, commence_time, thread_format, hook_tweet_id, reasoning_tweet_id, cta_tweet_id, thread_url, posted_at) and `game_results` (game_date, league, result, final_score, pick_text, matchup, confidence, is_winners_pick) — both checked via information_schema on Jul 5.
- **Known judgment calls:** verdicts exclude WC (double-post guard, Task 4 gives WC its own receipts form); unpriced picks count in the arc record but $0 in net (identical to results-card behavior); verdict window = today+yesterday post_dates (late finals grade after midnight).
```
