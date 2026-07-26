// gary2.0/supabase/functions/social-auto-post/verdicts.test.ts
// Run: node --test gary2.0/supabase/functions/social-auto-post/verdicts.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { normalizePick, matchVerdicts, plainVerdict, verdictOpener, buildVerdictPrompt, trimTweet, type LogRow, type ResultRow } from "./verdicts.ts";

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

test("dedup matches verdict rows whose pick_text carries the [verdict] uniqueness tag", () => {
  const done = log({ id: "L2", thread_format: "verdict", pick_text: "Pirates ML -190 [verdict]" });
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

test("plainVerdict is a flat deterministic template in the v3 vocabulary", () => {
  assert.equal(plainVerdict("won", "5-2"), "Hit. Final 5-2.");
  assert.equal(plainVerdict("lost", "3-1"), "Miss. Final 3-1.");
  assert.equal(plainVerdict("push", "4-4"), "Push. Final 4-4.");
  assert.equal(plainVerdict("won", ""), "Hit."); // no score available
});

test("verdictOpener maps result to the chat-register word", () => {
  assert.equal(verdictOpener("won"), "Hit.");
  assert.equal(verdictOpener("lost"), "Miss.");
  assert.equal(verdictOpener("push"), "Push.");
});

test("buildVerdictPrompt carries the bet, the outcome, the evidence, and the opener contract", () => {
  const c = { pickText: "Giants ML -130", league: "MLB", result: "won", finalScore: "2-9", matchup: "Angels @ Giants" };
  const p = buildVerdictPrompt(c, "FINAL SCORE: Angels (away) 2 — Giants (home) 9");
  assert.ok(p.includes("The bet was: Giants ML -130 (MLB). It won."));
  assert.ok(p.includes("Final score 2-9, Angels @ Giants"));
  assert.ok(p.includes("FINAL SCORE: Angels (away) 2"));
  assert.ok(p.includes('starting with exactly "Hit."'));
  assert.ok(p.includes("only source of facts"));
  assert.ok(p.includes("well under 100 characters"));
  assert.ok(p.includes("It's a tweet"));
  assert.ok(p.includes("No betting phrases, no hype words, no emojis"));
  assert.ok(!p.includes("Example"), "no baked example line — examples are direction, not templates");
});

test("trimTweet passes short text through and cuts long text at a sentence end", () => {
  assert.equal(trimTweet("Hit. Short and done."), "Hit. Short and done.");
  const long = "Hit. " + "Robbie Ray threw six shutout innings. ".repeat(12);
  const out = trimTweet(long);
  assert.ok(out.length <= 275);
  assert.ok(out.endsWith("."));
  assert.ok(!out.endsWith(" ")); // no dangling fragment
});

test("trimTweet never splits on a decimal like an ERA", () => {
  const s = "Miss. Johnson's 7.36 road ERA held true. " + "x".repeat(300);
  const out = trimTweet(s);
  assert.ok(out.includes("7.36 road ERA held true."));
});

test("caps candidates per run", () => {
  const rows = ["A ML -110", "B ML -110", "C ML -110", "D ML -110", "E ML -110"]
    .map((p, i) => log({ id: `L${i}`, pick_text: p, hook_tweet_id: `${i}` }));
  const results = rows.map((r) => res({ pick_text: r.pick_text! }));
  assert.equal(matchVerdicts(rows, results).length, 4);
  assert.equal(matchVerdicts(rows, results, { cap: 2 }).length, 2);
});
