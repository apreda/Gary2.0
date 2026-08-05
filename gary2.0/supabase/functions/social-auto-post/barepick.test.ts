// gary2.0/supabase/functions/social-auto-post/barepick.test.ts
// Run: node --test --experimental-strip-types gary2.0/supabase/functions/social-auto-post/barepick.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { barePick, isPublishableReply } from "./barepick.ts";

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

const TODAY = ["Cubs ML -108", "Astros -1.5 -106", "Tampa Bay Rays ML -153"];

test("publishable: an exact bare pick from today's board", () => {
  assert.equal(isPublishableReply("Cubs ML", TODAY), true);
  assert.equal(isPublishableReply("Astros -1.5", TODAY), true);
});

test("REFUSED: anything that is not exactly a pick Gary made today", () => {
  // The whole point of the rule — no generated sentence can ever reach the timeline.
  assert.equal(isPublishableReply("Cubs ML is the play here, easy money.", TODAY), false);
  assert.equal(isPublishableReply("I like the Cubs tonight", TODAY), false);
  assert.equal(isPublishableReply("Cubs ML.", TODAY), false, "even a trailing period is prose");
  assert.equal(isPublishableReply("Cubs ML 🔥", TODAY), false);
  assert.equal(isPublishableReply("Cubs ML #MLB", TODAY), false);
  assert.equal(isPublishableReply("Cubs ML https://betwithgary.ai", TODAY), false);
  assert.equal(isPublishableReply("@someone Cubs ML", TODAY), false);
  assert.equal(isPublishableReply("Cubs ML\nAstros -1.5", TODAY), false, "one reply, one pick");
});

test("REFUSED: a pick Gary did not actually make", () => {
  assert.equal(isPublishableReply("Yankees ML", TODAY), false, "never invent a pick for the conversation");
  assert.equal(isPublishableReply("Cubs ML -108", TODAY), false, "odds were explicitly cut");
});
