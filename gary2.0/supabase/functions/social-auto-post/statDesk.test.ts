// gary2.0/supabase/functions/social-auto-post/statDesk.test.ts
// Run: node --test --experimental-strip-types gary2.0/supabase/functions/social-auto-post/statDesk.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { factSheet, nbaLastNight, numbersIn, statPostProblems } from "./statDesk.ts";

const SHEET = "MIN is at 12.3 points allowed per game over 6 games; DET is at 27.5 over 6 games.";

test("a number the facts don't have stops the post", () => {
  assert.deepEqual(statPostProblems("Minnesota allows 12.3 points a game over 6 games.\nDetroit allows 27.5.", SHEET, []), []);
  assert.match(statPostProblems("Minnesota allows 12.3 points a game, 15.2 fewer than Detroit.", SHEET, []).join(), /15\.2/);
  assert.deepEqual(numbersIn("a .450 OPS against 0.45"), ["0.45", "0.45"]);
});

test("team names with digits are not numbers; abbreviations and betting words stop the post", () => {
  const sheet = "SF is at 30 points per game over 7 games.";
  assert.deepEqual(statPostProblems("The 49ers score 30 points a game over 7 games.", sheet, ["San Francisco 49ers", "49ers"]), []);
  assert.match(statPostProblems("SF score 30 points a game over 7 games.", sheet, [], ["SF"]).join(), /abbreviation/);
  assert.match(statPostProblems("The 49ers cover the spread, 30 points a game.", sheet, ["49ers"]).join(), /betting/);
  assert.deepEqual(statPostProblems("The 49ers offensive line has helped them score 30 points a game.", sheet, ["49ers"]), []);
});

test("the fact sheet drops last season and market sentences", () => {
  const ins = { meta: { computed_detail: "KSU is at 240.8 rushing yards per game over 6 games. Last season KSU was at 171.3 over 12 games. His total-bases line tonight: 0.5." } };
  assert.equal(factSheet(ins), "KSU is at 240.8 rushing yards per game over 6 games.");
});

test("last night's line is the box score's best, with the winner's score first", () => {
  const game = { id: 9, status: "Final", home_team_id: 1, visitor_team_id: 2, home_team_score: 117, visitor_team_score: 129 };
  const row = (id: number, team: any, s: any) => ({ player: { id, first_name: "P", last_name: String(id) }, team, game, fg3m: 0, fgm: 0, fga: 0, stl: 0, blk: 0, ...s });
  const hawks = { id: 1, name: "Hawks" }, hornets = { id: 2, name: "Hornets" };
  const post = nbaLastNight([row(1, hawks, { pts: 22, reb: 4, ast: 3 }), row(2, hornets, { pts: 31, reb: 12, ast: 3 })]);
  assert.ok(post);
  assert.match(post.text, /^P 2 vs\. the Hawks:/);
  assert.match(post.text, /The Hornets won 129-117\.$/);
  assert.equal(nbaLastNight([row(1, hawks, { pts: 18, reb: 4, ast: 3 })]), null, "a quiet night posts nothing");
});
