// npm run test:edge — pure settlement math for user tail/fade bets.
import test from "node:test";
import { deepStrictEqual as assertEquals } from "node:assert/strict";
import { settleUserBet } from "./userbets.ts";

test("tail inherits a win, pays at the pick's price", () => {
  const r = settleUserBet("tail", "won", 1, -158);
  assertEquals(r.status, "won");
  assertEquals(Math.round(r.units * 100), 63); // 100/158 = 0.633
  assertEquals(r.estimated, false);
});

test("tail inherits a loss at flat stake", () => {
  assertEquals(settleUserBet("tail", "lost", 2, -158), { status: "lost", units: -2, estimated: false });
});

test("fade inverts the pick result", () => {
  assertEquals(settleUserBet("fade", "lost", 1, 136).status, "won");
  assertEquals(settleUserBet("fade", "won", 1, 136).status, "lost");
});

test("fade win pays at the fade's own stored odds", () => {
  const r = settleUserBet("fade", "lost", 1, 136);
  assertEquals(Math.round(r.units * 100), 136);
});

test("push stays push for both kinds, zero units", () => {
  assertEquals(settleUserBet("tail", "push", 1, -110), { status: "push", units: 0, estimated: false });
  assertEquals(settleUserBet("fade", "push", 3, null), { status: "push", units: 0, estimated: true });
});

test("missing odds settle at assumed -110 and are flagged estimated", () => {
  const r = settleUserBet("fade", "lost", 1, null);
  assertEquals(r.status, "won");
  assertEquals(r.units, 0.91); // 100/110 rounded to 2 places
  assertEquals(r.estimated, true);
});

test("positive-odds tail win pays odds/100", () => {
  const r = settleUserBet("tail", "won", 2, 240);
  assertEquals(Math.round(r.units * 100), 480);
});

// ── settle push copy shapes ──────────────────────────────────────────────────
import { settleMessage } from "./push.ts";

test("single tail win push copy", () => {
  const m = settleMessage({ events: [{ kind: "tail", status: "won", units: 0.63, streak_pick: false }], streakAfter: null })!;
  assertEquals(m.body, "Your tail won: +0.63u.");
});

test("single fade loss with streak over", () => {
  const m = settleMessage({ events: [{ kind: "fade", status: "lost", units: -1, streak_pick: true }], streakAfter: { current: 0 } })!;
  assertEquals(m.body, "Your fade lost: -1.00u. The streak is over.");
});

test("multi-settle summary with living streak", () => {
  const m = settleMessage({
    events: [
      { kind: "tail", status: "won", units: 0.91, streak_pick: true },
      { kind: "tail", status: "lost", units: -1, streak_pick: false },
      { kind: "fade", status: "won", units: 1.2, streak_pick: false },
    ], streakAfter: { current: 5 },
  })!;
  assertEquals(m.body, "3 plays settled (2-1): +1.11u on the night. Day 5 of the streak.");
});

test("push-only settles stay silent", () => {
  assertEquals(settleMessage({ events: [{ kind: "tail", status: "push", units: 0, streak_pick: false }], streakAfter: null }), null);
});

import { throws as assertThrows } from "node:assert/strict";
import { matchingGameGrade, matchingPropGrade, fetchUserBetsForDates, settleUserBetsForDates } from "./userbets.ts";
test("void remains neutral for tail and fade", () => {
  assertEquals(settleUserBet("tail", "void", 1, 120), { status: "void", units: 0, estimated: false });
  assertEquals(settleUserBet("fade", "void", 1, 120), { status: "void", units: 0, estimated: false });
});
test("unsettled/unknown result must never become a fade win", () => {
  assertThrows(() => settleUserBet("fade", "pending", 1, 110));
  assertThrows(() => settleUserBet("tail", "", 1, 110));
  assertThrows(() => settleUserBet("tail", "won", Number.NaN, 110));
});
test("invalid stored price is explicitly estimated", () => {
  assertEquals(settleUserBet("tail", "won", 1, 0), { status: "won", units: 0.91, estimated: true });
});
test("game grades require correct source identity and legacy ambiguity is rejected", () => {
  const grades = [
    { game_date: "2026-09-04", pick_text: "Tigers ML", game_id: "1", league: "MLB", result: "won" },
    { game_date: "2026-09-04", pick_text: "Tigers ML", game_id: "2", league: "MLB", result: "lost" },
  ];
  const row = { game_date: "2026-09-04", pick_text: "Tigers ML", league: "MLB" };
  assertEquals(matchingGameGrade(row, grades), undefined);
  assertEquals(matchingGameGrade({ ...row, source_game_id: "2" }, grades), "lost");
  assertEquals(matchingGameGrade({ ...row, source_game_id: "3" }, grades), undefined);
});
test("prop grading distinguishes doubleheaders and lines", () => {
  const base = { game_date: "2026-09-04", player_name: "José One", prop_type: "strikeouts", sport: "MLB", bet: "over", line_value: 5.5 };
  const grades = [{ ...base, game_id: "1", result: "won" }, { ...base, game_id: "2", result: "lost" }];
  const row = { game_date: base.game_date, player_name: "Jose One", prop_type: base.prop_type, league: "MLB" };
  assertEquals(matchingPropGrade(row, grades), undefined);
  assertEquals(matchingPropGrade({ ...row, source_game_id: "2", source_line: 5.5, source_side: "over" }, grades), "lost");
  assertEquals(matchingPropGrade({ ...row, source_game_id: "2", source_line: 6.5, source_side: "over" }, grades), undefined);
});
test("settlement fetches all user pages before any writes", async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = String(input); calls.push(url);
    return Promise.resolve(new Response(JSON.stringify(url.includes("offset=0") ? Array.from({ length: 500 }, (_, id) => ({ id })) : [{ id: 500 }])));
  }) as typeof fetch;
  try {
    const rows = await fetchUserBetsForDates(["2026-09-04"], "https://test.invalid", {});
    assertEquals(rows.length, 501); assertEquals(calls.length, 2);
    assertEquals(calls[1].includes("offset=500"), true);
  } finally { globalThis.fetch = original; }
});
test("older corrections update saved grade once and repeats do not write", async () => {
  const original = globalThis.fetch;
  let row: any = { id: "bet", game_date: "2026-09-04", pick_text: "Home ML", pick_type: "game", kind: "tail",
    stake_units: 1, odds_american: 150, status: "won", units_net: 1.5, graded_by: "system", source_game_id: "1" };
  let patches = 0;
  globalThis.fetch = ((_input: string | URL | Request, options?: RequestInit) => {
    if (options?.method === "PATCH") { patches++; row = { ...row, ...JSON.parse(String(options.body)) }; return Promise.resolve(new Response(null, { status: 204 })); }
    return Promise.resolve(new Response(JSON.stringify([row])));
  }) as typeof fetch;
  const grades = [{ game_date: row.game_date, pick_text: row.pick_text, result: "lost", game_id: "1" }];
  try {
    assertEquals((await settleUserBetsForDates([row.game_date], grades, "https://test.invalid", {})).settled, 1);
    assertEquals(row.units_net, -1);
    assertEquals((await settleUserBetsForDates([row.game_date], grades, "https://test.invalid", {})).settled, 0);
    assertEquals(patches, 1);
  } finally { globalThis.fetch = original; }
});

test("persisted NFL and college prop grades settle older pending receipts without new MLB grading", async () => {
  const original = globalThis.fetch;
  const rows = [
    { id: "nfl-bet", game_date: "2026-09-01", pick_text: "Bills ML", pick_type: "game", kind: "tail", league: "NFL",
      stake_units: 1, odds_american: 150, status: "pending", source_game_id: "701" },
    { id: "college-prop", game_date: "2026-09-01", player_name: "Runner One", prop_type: "rush_yds", pick_type: "prop", kind: "fade", league: "NCAAF",
      stake_units: 1, odds_american: -110, status: "pending", source_game_id: "702", source_line: 60.5, source_side: "over" },
  ];
  const patched: Record<string, any> = {};
  globalThis.fetch = ((input: string | URL | Request, options?: RequestInit) => {
    const url = String(input);
    if (options?.method === "PATCH") { patched[url.includes("nfl-bet") ? "nfl" : "prop"] = JSON.parse(String(options.body)); return Promise.resolve(new Response(null, { status: 204 })); }
    const data = url.includes("/nfl_results?")
      ? [{ game_date: "2026-09-01", game_id: "701", pick_text: "Bills ML", result: "won", season_type: 2 }]
      : url.includes("/prop_results?") ? [{ game_date: "2026-09-01", game_id: "702", player_name: "Runner One", prop_type: "rush_yds", sport: "NCAAF", line_value: 60.5, bet: "over", result: "lost" }]
      : url.includes("/game_results?") ? [] : rows;
    return Promise.resolve(new Response(JSON.stringify(data)));
  }) as typeof fetch;
  try {
    const result = await settleUserBetsForDates(["2026-09-04"], [], "https://test.invalid", {});
    assertEquals(result, { settled: 2, voided: 0, failed: 0 });
    assertEquals(patched.nfl.status, "won"); assertEquals(patched.nfl.units_net, 1.5);
    assertEquals(patched.prop.status, "won"); assertEquals(patched.prop.units_net, 0.91);
  } finally { globalThis.fetch = original; }
});
test("unavailable persisted result source never voids a valid pending receipt", async () => {
  const original = globalThis.fetch; let patches = 0;
  globalThis.fetch = ((input: string | URL | Request, options?: RequestInit) => {
    if (options?.method === "PATCH") patches++;
    return Promise.resolve(String(input).includes("/nfl_results?") ? new Response(null, { status: 503 }) : new Response("[]"));
  }) as typeof fetch;
  try {
    assertEquals((await settleUserBetsForDates(["2026-09-04"], [], "https://test.invalid", {})).failed, 1);
    assertEquals(patches, 0);
  } finally { globalThis.fetch = original; }
});

import { patchUserBet } from "./userbets.ts";
test("conditional settlement avoids duplicate notifications from concurrent graders", async () => {
  const original = globalThis.fetch; let requested = "";
  globalThis.fetch = ((input: string | URL | Request) => { requested = String(input); return Promise.resolve(new Response("[]")); }) as typeof fetch;
  try {
    assertEquals(await patchUserBet("https://test.invalid", {}, "bet", { status: "won" }, "pending"), false);
    assertEquals(requested.endsWith("&status=eq.pending"), true);
  } finally { globalThis.fetch = original; }
});
