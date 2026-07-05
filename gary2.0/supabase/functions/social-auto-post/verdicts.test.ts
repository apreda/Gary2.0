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

import { openerOf, avoidRepeat } from "./verdicts.ts";

test("openerOf normalizes the first words", () => {
  assert.equal(openerOf("Never sweated it. Tigers pitch a 3-0 shutout."), "never sweated it");
  assert.equal(openerOf("Cashed. Next."), "cashed next");
});

test("avoidRepeat keeps a fresh opener", () => {
  assert.equal(avoidRepeat("Cashed. Final 5-2.", ["Never sweated it. Pirates by six."], ["fallback one"]), "Cashed. Final 5-2.");
});

test("avoidRepeat swaps in the first non-colliding fallback on an opener collision", () => {
  const used = ["Never sweated it. Pirates by six."];
  const out = avoidRepeat("Never sweated it. Tigers pitch a shutout.", used, ["Never sweated it again.", "That one paid. Final 3-0."]);
  assert.equal(out, "That one paid. Final 3-0.");
});

test("avoidRepeat returns the candidate when everything collides", () => {
  const used = ["Never sweated it. A.", "That one paid. B."];
  const out = avoidRepeat("Never sweated it. C.", used, ["That one paid. D."]);
  assert.equal(out, "Never sweated it. C.");
});

test("caps candidates per run", () => {
  const rows = ["A ML -110", "B ML -110", "C ML -110", "D ML -110", "E ML -110"]
    .map((p, i) => log({ id: `L${i}`, pick_text: p, hook_tweet_id: `${i}` }));
  const results = rows.map((r) => res({ pick_text: r.pick_text! }));
  assert.equal(matchVerdicts(rows, results).length, 4);
  assert.equal(matchVerdicts(rows, results, { cap: 2 }).length, 2);
});
