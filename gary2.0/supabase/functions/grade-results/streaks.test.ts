// deno test streaks.test.ts — streak transition math for THE STREAK.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { applyStreakResult } from "./streaks.ts";

const day = (n: number) => `2026-08-${String(n).padStart(2, "0")}`;

Deno.test("first win starts the streak", () => {
  assertEquals(applyStreakResult(null, day(1), "won"), {
    current: 1, best: 1, prev_current: 0, last_counted_date: day(1), last_result: "won",
  });
});

Deno.test("consecutive wins extend and raise best", () => {
  const s1 = applyStreakResult(null, day(1), "won")!;
  const s2 = applyStreakResult(s1, day(2), "won")!;
  assertEquals(s2.current, 2);
  assertEquals(s2.best, 2);
  assertEquals(s2.prev_current, 1);
});

Deno.test("a loss resets to zero, best survives", () => {
  const s = { current: 5, best: 7, prev_current: 4, last_counted_date: day(3), last_result: "won" };
  const out = applyStreakResult(s, day(4), "lost")!;
  assertEquals(out.current, 0);
  assertEquals(out.best, 7);
});

Deno.test("a missed day does not break the streak (only a loss does)", () => {
  const s = { current: 3, best: 3, prev_current: 2, last_counted_date: day(1), last_result: "won" };
  const out = applyStreakResult(s, day(5), "won")!; // three idle days between
  assertEquals(out.current, 4);
});

Deno.test("push and void hold — no change at all", () => {
  const s = { current: 3, best: 3, prev_current: 2, last_counted_date: day(1), last_result: "won" };
  assertEquals(applyStreakResult(s, day(2), "push"), null);
  assertEquals(applyStreakResult(s, day(2), "void"), null);
});

Deno.test("same-day repeat with same result is a no-op", () => {
  const s = { current: 4, best: 4, prev_current: 3, last_counted_date: day(2), last_result: "won" };
  assertEquals(applyStreakResult(s, day(2), "won"), null);
});

Deno.test("same-day re-grade won->lost rewinds the day then applies the loss", () => {
  const s = { current: 4, best: 6, prev_current: 3, last_counted_date: day(2), last_result: "won" };
  const out = applyStreakResult(s, day(2), "lost")!;
  assertEquals(out.current, 0);
  assertEquals(out.best, 6);
  assertEquals(out.last_result, "lost");
});

Deno.test("same-day re-grade lost->won rewinds the day then applies the win", () => {
  const s = { current: 0, best: 6, prev_current: 3, last_counted_date: day(2), last_result: "lost" };
  const out = applyStreakResult(s, day(2), "won")!;
  assertEquals(out.current, 4);       // 3 + 1
  assertEquals(out.best, 6);
  assertEquals(out.prev_current, 3);  // day base unchanged on a re-grade
});

Deno.test("same-day re-grade to push rewinds the day entirely", () => {
  const s = { current: 4, best: 6, prev_current: 3, last_counted_date: day(2), last_result: "won" };
  const out = applyStreakResult(s, day(2), "push")!;
  assertEquals(out.current, 3);
  assertEquals(out.last_result, "push");
});

Deno.test("best never decreases through any transition", () => {
  const s = { current: 6, best: 6, prev_current: 5, last_counted_date: day(2), last_result: "won" };
  const out = applyStreakResult(s, day(2), "lost")!;
  assertEquals(out.best, 6);
});
