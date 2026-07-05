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
