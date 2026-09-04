// gary2.0/supabase/functions/social-auto-post/recap.test.ts
// Run: node --test gary2.0/supabase/functions/social-auto-post/recap.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { composeRecaps, ordinalDate, recapLeague, type RecapRow } from "./recap.ts";

const row = (pick_text: string, result: string, league = "MLB", extra: Partial<RecapRow> = {}): RecapRow =>
  ({ league, result, pick_text, confidence: 0.7, ...extra });

test("ordinalDate spells the slate day the way the tape reads it", () => {
  assert.equal(ordinalDate("2026-09-03"), "September 3rd");
  assert.equal(ordinalDate("2026-09-01"), "September 1st");
  assert.equal(ordinalDate("2026-09-11"), "September 11th");
  assert.equal(ordinalDate("2026-08-22"), "August 22nd");
});

test("each sport gets its own post, biggest slate first", () => {
  const posts = composeRecaps([
    row("Cardinals ML -108", "won"),
    row("Guardians -1.5 +106", "won"),
    row("Rays ML -160", "lost"),
    row("Georgia Tech -6.5 -110", "lost", "NCAAF"),
    row("UAB +27.5 -118", "won", "NCAAF"),
  ], "2026-09-03");

  assert.equal(posts.length, 2);
  assert.equal(posts[0].league, "MLB");
  assert.equal(posts[1].league, "NCAAF");

  assert.equal(posts[0].text, [
    "September 3rd:",
    "",
    "MLB: 2-1",
    "- Cardinals ML -108 ✅",
    "- Guardians -1.5 +106 ✅",
    "- Rays ML -160 ❌",
    "",
    "Every game, every day. The full card is in the app.",
  ].join("\n"));

  // The college post stands alone — its own date line, its own record.
  assert.match(posts[1].text, /^September 3rd:\n\nNCAAF: 1-1\n/);
  assert.equal(posts[1].text.includes("MLB"), false);
});

test("ungraded rows never reach a post, and a sport with none is absent", () => {
  const posts = composeRecaps([
    row("Cardinals ML -108", "won"),
    row("Reds ML -120", "pending"),
    row("Toledo +14", "", "NCAAF"),
  ], "2026-09-03");

  assert.equal(posts.length, 1);
  assert.equal(posts[0].league, "MLB");
  assert.equal(posts[0].text.includes("Reds"), false);
});

test("preseason never enters the tape that states a record", () => {
  const posts = composeRecaps([
    row("Rams -3 -110", "won", "NFL", { season_type: 1 }),
    row("Bears +6 -105", "lost", "NFL", { season_type: 1 }),
    row("Cardinals ML -108", "won"),
  ], "2026-09-03");

  assert.equal(posts.length, 1);
  assert.equal(posts[0].league, "MLB");
});

test("a push shows as a push and stays out of the W-L", () => {
  const [post] = composeRecaps([
    row("Cardinals ML -108", "won"),
    row("Over 8 +100", "push"),
  ], "2026-09-03");

  assert.match(post.text, /MLB: 1-0/);
  assert.match(post.text, /- Over 8 \+100 \(push\)/);
  assert.equal(post.pushes, 1);
});

test("provider league spellings resolve to the sport's own name", () => {
  assert.equal(recapLeague("americanfootball_ncaaf"), "NCAAF");
  assert.equal(recapLeague("americanfootball_nfl"), "NFL");
  assert.equal(recapLeague("baseball_mlb"), "MLB");
  assert.equal(recapLeague("ncaaf"), "NCAAF");
  assert.equal(recapLeague(null), "OTHER");
});

test("no graded rows at all means no posts", () => {
  assert.deepEqual(composeRecaps([], "2026-09-03"), []);
});
