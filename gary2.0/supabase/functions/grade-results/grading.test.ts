// gary2.0/supabase/functions/grade-results/grading.test.ts
// Run: node --test gary2.0/supabase/functions/grade-results/grading.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { pickSide, gradeGame, recapIsStale } from "./grading.ts";

// ── The regression this module exists for ────────────────────────────────────
// Boston Red Sox (away) beat Chicago White Sox (home) 5-0 on 2026-07-08. daily_picks
// stored short names, so gradeGame is called (pick, home="White Sox", away="Red Sox").
// The old grader returned 'lost' (graded the pick as the home White Sox, who scored 0).
test("Red Sox / White Sox: away ML on a shared 'Sox' mascot grades WON, not LOST", () => {
  assert.equal(pickSide("Red Sox ML -104", "White Sox", "Red Sox"), "away");
  assert.equal(gradeGame("Red Sox ML -104", "White Sox", "Red Sox", 0, 5), "won");
});

test("Red Sox / White Sox works with FULL stored names too", () => {
  assert.equal(pickSide("Red Sox ML", "Chicago White Sox", "Boston Red Sox"), "away");
  assert.equal(gradeGame("Red Sox ML", "Chicago White Sox", "Boston Red Sox", 0, 5), "won");
});

test("shared-mascot HOME pick still grades correctly (White Sox win at home)", () => {
  // Flip the scores: White Sox (home) win 6-2.
  assert.equal(pickSide("White Sox ML", "White Sox", "Red Sox"), "home");
  assert.equal(gradeGame("White Sox ML", "White Sox", "Red Sox", 6, 2), "won");
  // ...and correctly grades a losing home pick as a loss.
  assert.equal(gradeGame("White Sox ML", "White Sox", "Red Sox", 0, 5), "lost");
});

test("shared-mascot spread does not invert (Red Sox -1.5 away, win by 5)", () => {
  assert.equal(gradeGame("Red Sox -1.5", "White Sox", "Red Sox", 0, 5), "won");
  // Away -1.5 but only wins by 1 -> spread not covered.
  assert.equal(gradeGame("Red Sox -1.5", "White Sox", "Red Sox", 3, 4), "lost");
});

// ── No regression on ordinary, non-colliding matchups ────────────────────────
test("distinct mascots grade as before — away ML win", () => {
  assert.equal(pickSide("Dodgers ML", "Giants", "Dodgers"), "away");
  assert.equal(gradeGame("Dodgers ML", "Giants", "Dodgers", 2, 6), "won");
});

test("distinct mascots — home ML win", () => {
  assert.equal(gradeGame("Giants ML", "Giants", "Dodgers", 6, 2), "won");
});

test("totals are team-agnostic and unaffected", () => {
  assert.equal(gradeGame("Over 8.5", "White Sox", "Red Sox", 0, 5), "lost"); // total 5 < 8.5
  assert.equal(gradeGame("Under 8.5", "White Sox", "Red Sox", 0, 5), "won");
  assert.equal(gradeGame("Over 5", "White Sox", "Red Sox", 0, 5), "push");   // total 5 == 5
});

test("home favorite spread covers", () => {
  assert.equal(gradeGame("Giants -1.5", "Giants", "Dodgers", 6, 2), "won");
  assert.equal(gradeGame("Giants -1.5", "Giants", "Dodgers", 3, 2), "lost");
});

test("substring team names resolve via unique words (Inter vs Inter Miami)", () => {
  assert.equal(pickSide("Inter Miami ML", "Inter", "Inter Miami"), "away");
  assert.equal(pickSide("Inter ML", "Inter", "Inter Miami"), "home");
});

test("undetermined side returns null (no distinguishing token in pick)", () => {
  assert.equal(pickSide("Sox ML", "White Sox", "Red Sox"), null);
});

// ── The Jul 15 2026 "fabricated loss" bug this fixes ──────────────────────────
// "Freeman to win ASG MVP +1800" and "Cease 2+ strikeouts +100" are player props
// that ended up in daily_picks (not the dedicated props table). gradeGame can't
// classify them as ML/spread/total/draw, and pickSide finds no "NL"/"AL" token
// in the pick text — so both used to fall through to an unconditional "lost",
// regardless of what actually happened.
test("gradeGame: unclassifiable pick (player prop) stays ungraded, never a fabricated loss", () => {
  assert.equal(gradeGame("Freeman to win ASG MVP +1800", "NL", "AL", 0, 4), null);
  assert.equal(gradeGame("Cease 2+ strikeouts +100", "NL", "AL", 0, 4), null);
});

test("gradeGame: still grades ordinary ML/spread/total normally after the fix", () => {
  assert.equal(gradeGame("NL ML -134", "NL", "AL", 0, 4), "lost");
  assert.equal(gradeGame("Under 8.0", "NL", "AL", 0, 4), "won");
});

test("recapIsStale: no existing recap is not stale (fresh insert path)", () => {
  assert.equal(recapIsStale(null, "won"), false);
  assert.equal(recapIsStale(undefined, "lost"), false);
});

test("recapIsStale: existing recap matching the fresh grade is not stale", () => {
  assert.equal(recapIsStale("won", "won"), false);
});

test("recapIsStale: existing recap contradicting the fresh grade IS stale", () => {
  assert.equal(recapIsStale("won", "lost"), true);
  assert.equal(recapIsStale("lost", "won"), true);
});
