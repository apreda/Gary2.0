// deno test userbets.test.ts — pure settlement math for user tail/fade bets.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { settleUserBet } from "./userbets.ts";

Deno.test("tail inherits a win, pays at the pick's price", () => {
  const r = settleUserBet("tail", "won", 1, -158);
  assertEquals(r.status, "won");
  assertEquals(Math.round(r.units * 100), 63); // 100/158 = 0.633
  assertEquals(r.estimated, false);
});

Deno.test("tail inherits a loss at flat stake", () => {
  assertEquals(settleUserBet("tail", "lost", 2, -158), { status: "lost", units: -2, estimated: false });
});

Deno.test("fade inverts the pick result", () => {
  assertEquals(settleUserBet("fade", "lost", 1, 136).status, "won");
  assertEquals(settleUserBet("fade", "won", 1, 136).status, "lost");
});

Deno.test("fade win pays at the fade's own stored odds", () => {
  const r = settleUserBet("fade", "lost", 1, 136);
  assertEquals(Math.round(r.units * 100), 136);
});

Deno.test("push stays push for both kinds, zero units", () => {
  assertEquals(settleUserBet("tail", "push", 1, -110), { status: "push", units: 0, estimated: false });
  assertEquals(settleUserBet("fade", "push", 3, null), { status: "push", units: 0, estimated: true });
});

Deno.test("missing odds settle at assumed -110 and are flagged estimated", () => {
  const r = settleUserBet("fade", "lost", 1, null);
  assertEquals(r.status, "won");
  assertEquals(r.units, 0.91); // 100/110 rounded to 2 places
  assertEquals(r.estimated, true);
});

Deno.test("positive-odds tail win pays odds/100", () => {
  const r = settleUserBet("tail", "won", 2, 240);
  assertEquals(Math.round(r.units * 100), 480);
});

// ── settle push copy shapes ──────────────────────────────────────────────────
import { settleMessage } from "./push.ts";

Deno.test("single tail win push copy", () => {
  const m = settleMessage({ events: [{ kind: "tail", status: "won", units: 0.63, streak_pick: false }], streakAfter: null })!;
  assertEquals(m.body, "Your tail won: +0.63u.");
});

Deno.test("single fade loss with streak over", () => {
  const m = settleMessage({ events: [{ kind: "fade", status: "lost", units: -1, streak_pick: true }], streakAfter: { current: 0 } })!;
  assertEquals(m.body, "Your fade lost: -1.00u. The streak is over.");
});

Deno.test("multi-settle summary with living streak", () => {
  const m = settleMessage({
    events: [
      { kind: "tail", status: "won", units: 0.91, streak_pick: true },
      { kind: "tail", status: "lost", units: -1, streak_pick: false },
      { kind: "fade", status: "won", units: 1.2, streak_pick: false },
    ], streakAfter: { current: 5 },
  })!;
  assertEquals(m.body, "3 plays settled (2-1): +1.11u on the night. Day 5 of the streak.");
});

Deno.test("push-only settles stay silent", () => {
  assertEquals(settleMessage({ events: [{ kind: "tail", status: "push", units: 0, streak_pick: false }], streakAfter: null }), null);
});
