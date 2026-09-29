// gary2.0/supabase/functions/social-auto-post/barepick.test.ts
// Run: node --test --experimental-strip-types gary2.0/supabase/functions/social-auto-post/barepick.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { barePick } from "./barepick.ts";

test("strips the price, keeps the bet", () => {
  assert.equal(barePick("Cubs ML -108"), "Cubs ML");
  assert.equal(barePick("Yankees ML -144"), "Yankees ML");
  assert.equal(barePick("Tampa Bay Rays ML -153"), "Tampa Bay Rays ML");
  assert.equal(barePick("Astros -1.5 -106"), "Astros -1.5", "the spread IS the bet, the price is not");
  assert.equal(barePick("Nationals +1.5 +119"), "Nationals +1.5");
  assert.equal(barePick("Yankees -1.5 (+135)"), "Yankees -1.5", "parenthesised price also goes");
});

test("leaves a pick alone when there is no price to strip", () => {
  assert.equal(barePick("Under 8.5"), "Under 8.5", "a total is not a price");
  assert.equal(barePick("Dodgers -1.5"), "Dodgers -1.5", "a spread is not a price");
  assert.equal(barePick("Cubs ML"), "Cubs ML");
});

test("handles junk without throwing", () => {
  assert.equal(barePick(""), "");
  assert.equal(barePick("   Cubs   ML   -108 "), "Cubs ML");
});

