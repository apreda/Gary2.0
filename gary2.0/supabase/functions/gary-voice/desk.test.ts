import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { deskParts, readDesk } from "./desk.ts";

const RULE = "━".repeat(40);
const DESK = [
  "═".repeat(40), "MATCHUP: Chicago Bears @ Seattle Seahawks", "═".repeat(40), "",
  "THE SITUATION", RULE, "Monday night at Lumen Field.", "",
  "INJURY REPORT", RULE, "Seattle Seahawks: Kenneth Walker (out).", "",
  "RUSHING", RULE, "Sam LaPorta 2 carries", "Zach Charbonnet 6 carries, 23 yards", "Jalen Hurts 1 carry", "Someone else", "",
  "## THE STORYLINES, AS WRITTEN", "Walker's absence means a big week ahead.",
].join("\n");

Deno.test("the desk is cut at its headings and the rules go", () => {
  const parts = deskParts(DESK, "Late word on the Bears.");
  assertEquals(parts.map((p) => p.title), ["THE GAME", "THE SITUATION", "INJURY REPORT", "RUSHING", "THE STORYLINES, AS WRITTEN", "THE NEWS BRIEFING"]);
  assertEquals(parts.some((p) => p.lines.some((l) => l.includes("━"))), false);
});

Deno.test("a player brings back the lines about him, not the whole section", () => {
  const out = readDesk(deskParts(DESK), "Zach Charbonnet");
  assertStringIncludes(out, "6 carries, 23 yards");
  assertEquals(out.includes("Someone else"), false);
});

Deno.test("a topic finds its section whatever the word's ending", () => {
  assertStringIncludes(readDesk(deskParts(DESK), "injuries"), "Kenneth Walker (out)");
});

Deno.test("nothing found, or nothing asked: the opening and what else is there", () => {
  const nothing = readDesk(deskParts(DESK), "curling");
  assertStringIncludes(nothing, 'Nothing on "curling"');
  assertStringIncludes(nothing, "Also on this desk: ");
  assertStringIncludes(readDesk(deskParts(DESK), undefined), "Monday night at Lumen Field.");
});
