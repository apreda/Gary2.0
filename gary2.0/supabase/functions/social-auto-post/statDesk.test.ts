// gary2.0/supabase/functions/social-auto-post/statDesk.test.ts
// Run: node --test --experimental-strip-types gary2.0/supabase/functions/social-auto-post/statDesk.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { numbersIn, statPostProblems } from "./statDesk.ts";

const RESEARCH = "Carolina has 11 sacks in six games. Jordan Love has thrown for 270-plus yards in five of seven games. Two of their three wins came against backup quarterbacks.";

test("a number the research doesn't have stops the post", () => {
  assert.deepEqual(statPostProblems("Two of Carolina's three wins came against backup quarterbacks.", RESEARCH, []), []);
  assert.deepEqual(statPostProblems("Jordan Love has 270-plus passing yards in five of seven games.", RESEARCH, []), []);
  assert.match(statPostProblems("Carolina has 14 sacks in six games.", RESEARCH, []).join(), /number 14/);
  assert.deepEqual(numbersIn("a .450 OPS against 0.45"), ["0.45", "0.45"]);
});

test("team names with digits are not numbers; betting words, Gary and first person stop the post", () => {
  const research = "San Francisco has scored 30 points in each of its last 3 games.";
  assert.deepEqual(statPostProblems("The 49ers have scored 30 in each of their last 3 games.", research, ["49ers"]), []);
  assert.match(statPostProblems("The 49ers cover easily with 30 a game in their last 3.", research, ["49ers"]).join(), /betting/);
  assert.match(statPostProblems("Gary sees 30 points in each of the last 3 games.", research, []).join(), /Gary/);
  assert.deepEqual(statPostProblems("The 49ers offensive line has kept them at 30 points in their last 3.", research, ["49ers"]), []);
});
