// gary2.0/supabase/functions/social-auto-post/window.test.ts
// Run: node --test --experimental-strip-types gary2.0/supabase/functions/social-auto-post/window.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { selectPicks, slotOf, type Slot } from "./window.ts";
import { marqueeScore } from "./marquee.ts";

const RESERVE: Record<Slot, number> = { morning: 0, afternoon: 1, evening: 2, late: 1 };
const BASE = {
  leadMinMin: 5, leadMaxMin: 120, maxPerRun: 3,
  dailyCap: 5, postedToday: 0, reserve: RESERVE, marqueeScore,
};
const at = (etTime: string) => new Date(`2026-08-05T${etTime}:00-04:00`).getTime();
const et = (t: string) => new Date(`2026-08-05T${t}:00-04:00`).toISOString();
const names = (r: { queue: { pick: string }[] }) => r.queue.map((p) => p.pick);

// The real Aug 5 2026 board, straight from daily_picks — the day the founder flagged this.
const AUG5 = [
  { pick: "Astros -1.5 -106", commence_time: et("14:10"), awayTeam: "Blue Jays", homeTeam: "Astros" },
  { pick: "Cubs ML -108", commence_time: et("14:20"), awayTeam: "Dodgers", homeTeam: "Cubs" },
  { pick: "Rangers ML -147", commence_time: et("14:35"), awayTeam: "Giants", homeTeam: "Rangers" },
  { pick: "Tampa Bay Rays ML -153", commence_time: et("15:10"), awayTeam: "Rays", homeTeam: "Rockies" },
];

test("THE DEADLINE: a pick is never queued once first pitch has passed", () => {
  // 2:45 PM ET — the old code tweeted "Rangers ML -147" here, 10 minutes after first pitch.
  const r = selectPicks(AUG5, { ...BASE, nowMs: at("14:45") });
  assert.equal(names(r).includes("Rangers ML -147"), false, "Rangers had already started");
  assert.deepEqual(r.missed, ["Astros -1.5 -106", "Cubs ML -108", "Rangers ML -147"]);
  assert.deepEqual(names(r), ["Tampa Bay Rays ML -153"]);
});

test("THE DEADLINE: the 60-minute _live path is gone — a started game is never resurrected", () => {
  // 3:45 PM ET. The old code posted the Rays here via `_live`, 35 min late, opening the tweet with
  // "First pitch just went in Denver". Nothing may be queued now.
  const r = selectPicks(AUG5, { ...BASE, nowMs: at("15:45") });
  assert.deepEqual(r.queue, []);
  assert.equal(r.missed.length, 4);
});

test("a clustered slate is fully covered before every first pitch", () => {
  const posted = new Set<string>();
  const log: { pick: string; leadMin: number }[] = [];
  for (const t of ["11:45", "12:45", "13:45", "14:45", "15:45"]) {
    const nowMs = at(t);
    const left = AUG5.filter((p) => !posted.has(p.pick));
    const r = selectPicks(left, { ...BASE, nowMs, postedToday: posted.size });
    for (const p of r.queue) {
      posted.add(p.pick);
      log.push({ pick: p.pick, leadMin: (new Date(p.commence_time).getTime() - nowMs) / 60000 });
    }
  }
  assert.equal(posted.size, 4, "all four picks posted");
  for (const e of log) assert.ok(e.leadMin >= 5, `${e.pick} posted only ${e.leadMin}min before first pitch`);
});

test("FOUNDER'S CASE: only two games in the window -> BOTH post, marquee never enters into it", () => {
  const twoAtTwo = [
    { pick: "Rangers ML -147", commence_time: et("14:00"), awayTeam: "Giants", homeTeam: "Rangers" },
    { pick: "Rockies ML +130", commence_time: et("14:00"), awayTeam: "Marlins", homeTeam: "Rockies" },
  ];
  const r = selectPicks(twoAtTwo, { ...BASE, nowMs: at("13:00") });
  assert.equal(r.queue.length, 2, "both games post — nobody is dropped when there is room");
});

test("FOUNDER'S CASE: night games keep their slots when the afternoon is crowded", () => {
  // Six afternoon games plus two West Coast night games. Afternoon must NOT eat the whole cap.
  const board = [
    ...["13:05", "13:10", "13:15", "13:20", "13:35", "13:40"].map((t, i) => ({
      pick: `Day game ${i}`, commence_time: et(t), awayTeam: "Marlins", homeTeam: "Athletics",
    })),
    { pick: "Dodgers ML -150", commence_time: et("22:10"), awayTeam: "Padres", homeTeam: "Dodgers" },
    { pick: "Mariners ML -120", commence_time: et("22:40"), awayTeam: "Angels", homeTeam: "Mariners" },
  ];
  const noon = selectPicks(board, { ...BASE, nowMs: at("12:30") });
  assert.equal(noon.reserved, 1, "one slot held for the late day-part (2 late games, reserve=1)");
  assert.ok(noon.queue.length <= 4, "afternoon cannot spend the reserved slot");

  // Now replay the whole day and confirm a night game actually makes it out.
  const posted = new Set<string>();
  for (const t of ["12:30", "13:00", "18:00", "21:00", "21:30", "22:00"]) {
    const left = board.filter((p) => !posted.has(p.pick));
    for (const p of selectPicks(left, { ...BASE, nowMs: at(t), postedToday: posted.size }).queue) {
      posted.add(p.pick);
    }
  }
  assert.ok([...posted].some((p) => p.includes("Dodgers")), "a West Coast night game got airtime");
});

test("FOUNDER'S CASE: an all-afternoon getaway day still posts a full slate", () => {
  // Nothing later on the board -> nothing to reserve -> the early games get the entire cap.
  const board = ["13:05", "13:10", "13:15", "13:20", "13:35"].map((t, i) => ({
    pick: `Getaway ${i}`, commence_time: et(t), awayTeam: "Marlins", homeTeam: "Athletics",
  }));
  const r = selectPicks(board, { ...BASE, nowMs: at("12:30") });
  assert.equal(r.reserved, 0, "no later games exist, so nothing is held back");
  assert.equal(r.queue.length, 3, "capped only by the per-run burst guard");
});

test("marquee breaks the tie when a day-part is oversubscribed", () => {
  const crowded = [
    { pick: "Athletics ML +140", commence_time: et("19:05"), awayTeam: "Marlins", homeTeam: "Athletics" },
    { pick: "Cubs ML -108", commence_time: et("19:10"), awayTeam: "Dodgers", homeTeam: "Cubs" },
    { pick: "Rays ML -120", commence_time: et("19:15"), awayTeam: "Rays", homeTeam: "Guardians" },
  ];
  const r = selectPicks(crowded, { ...BASE, nowMs: at("18:00"), maxPerRun: 1, reserve: { ...RESERVE, evening: 0 } });
  assert.deepEqual(names(r), ["Cubs ML -108"], "Dodgers at Cubs is the biggest draw on the board");
});

test("queue posts in first-pitch order even when marquee chose it", () => {
  const r = selectPicks(AUG5, { ...BASE, nowMs: at("13:00"), maxPerRun: 4, reserve: { ...RESERVE, afternoon: 0 } });
  const times = r.queue.map((p) => new Date(p.commence_time).getTime());
  assert.deepEqual(times, [...times].sort((a, b) => a - b), "soonest first pitch goes out first");
});

test("a pick with no commence_time is refused, not gambled on", () => {
  const r = selectPicks([{ pick: "Mystery ML -110", commence_time: null }], { ...BASE, nowMs: at("12:45") });
  assert.deepEqual(r.queue, []);
  assert.deepEqual(r.missed, ["Mystery ML -110"]);
});

test("the deadline is exact at the boundary", () => {
  const g = [{ pick: "Edge ML -110", commence_time: et("14:10") }];
  assert.equal(selectPicks(g, { ...BASE, nowMs: at("14:05") }).queue.length, 1, "exactly 5min out: posts");
  assert.equal(selectPicks(g, { ...BASE, nowMs: at("14:06") }).queue.length, 0, "4min out: refused");
  assert.equal(selectPicks(g, { ...BASE, nowMs: at("12:10") }).queue.length, 1, "exactly 120min out: posts");
  assert.equal(selectPicks(g, { ...BASE, nowMs: at("12:09") }).queue.length, 0, "121min out: waits");
});

test("slotOf matches the social_post_log taxonomy", () => {
  assert.equal(slotOf(et("13:05")), "morning");
  assert.equal(slotOf(et("14:10")), "afternoon");
  assert.equal(slotOf(et("19:40")), "evening");
  assert.equal(slotOf(et("22:10")), "late");
});

test("marqueeScore ranks by audience, not by who is favored", () => {
  const dodgersCubs = marqueeScore({ awayTeam: "Dodgers", homeTeam: "Cubs", league: "MLB" });
  const raysGuardians = marqueeScore({ awayTeam: "Rays", homeTeam: "Guardians", league: "MLB" });
  const marlinsAs = marqueeScore({ awayTeam: "Marlins", homeTeam: "Athletics", league: "MLB" });
  assert.ok(dodgersCubs > raysGuardians, "two national clubs outrank one");
  assert.ok(raysGuardians > marlinsAs);
  assert.ok(marqueeScore({ awayTeam: "Cowboys", homeTeam: "Eagles", league: "NFL" }) > 0, "NFL is scored too");
});
