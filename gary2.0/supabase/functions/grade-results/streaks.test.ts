import test from "node:test";
import { deepStrictEqual as assertEquals } from "node:assert/strict";
import { recomputeStreak, type StreakPlay } from "./streaks.ts";
const plays = (...statuses: string[]): StreakPlay[] => statuses.map((status, i) => ({
  id: String(i), game_date: `2026-08-${String(i * 2 + 1).padStart(2, "0")}`, status,
}));
test("wins count once and missed days preserve designated streak", () => {
  const r = recomputeStreak(plays("won", "won", "won"));
  assertEquals(r.current, 3); assertEquals(r.best, 3); assertEquals(r.prev_current, 2);
});
test("push and void preserve run", () => {
  assertEquals(recomputeStreak(plays("won", "push", "void", "won")).current, 2);
});
test("earlier unresolved pick blocks later wins", () => {
  assertEquals(recomputeStreak(plays("won", "pending", "won")).current, 1);
});
test("late settlement uses game chronology, not arrival order", () => {
  const p = plays("won", "lost", "won", "won");
  assertEquals(recomputeStreak([p[3], p[1], p[0], p[2]]), recomputeStreak(p));
  assertEquals(recomputeStreak(p).current, 2);
});
test("older correction repairs both current and best", () => {
  const p = plays("won", "won", "won", "lost", "won");
  assertEquals(recomputeStreak(p).best, 3);
  p[1].status = "lost";
  assertEquals(recomputeStreak(p).best, 1);
  assertEquals(recomputeStreak(p).current, 1);
  assertEquals(recomputeStreak(p), recomputeStreak(p));
});
test("correction to void removes result and reconnects surviving wins", () => {
  const p = plays("won", "lost", "won"); p[1].status = "void";
  assertEquals(recomputeStreak(p).current, 2);
  assertEquals(recomputeStreak(p).best, 2);
});
