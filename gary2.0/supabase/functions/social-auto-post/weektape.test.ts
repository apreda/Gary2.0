// gary2.0/supabase/functions/social-auto-post/weektape.test.ts
// Run: node --test gary2.0/supabase/functions/social-auto-post/weektape.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { composeWeekTape, previousWeek, type TapeRow } from "./weektape.ts";

const row = (game_date: string, result: string, league = "MLB"): TapeRow => ({ game_date, league, result });

test("previousWeek: on a Monday, the week is the Mon..Sun that just ended", () => {
  // 2026-09-07 is a Monday.
  assert.deepEqual(previousWeek("2026-09-07"), { start: "2026-08-31", end: "2026-09-06" });
});

test("previousWeek: mid-week still points at the last COMPLETED week", () => {
  // 2026-09-09 is a Wednesday -> same completed week as the Monday above.
  assert.deepEqual(previousWeek("2026-09-09"), { start: "2026-08-31", end: "2026-09-06" });
});

test("composeWeekTape: one league reads as a single record line, no per-league breakdown", () => {
  const rows = [
    row("2026-08-31", "won"), row("2026-09-01", "lost"), row("2026-09-03", "won"), row("2026-09-06", "won"),
    row("2026-08-30", "won"),                 // before the week: counts toward 30 days only
    row("2026-09-07", "lost"),                // today: not in the completed week, not in the 30-day window
    row("2026-07-01", "won"),                 // too old for everything
  ];
  const out = composeWeekTape(rows, "2026-09-07");
  assert.ok(out);
  assert.equal(out.week.start, "2026-08-31");
  assert.equal(out.record, "3-1");
  assert.equal(
    out.text,
    "Last week on the board, Aug 31 to Sep 6: 3-1.\n\nLast 30 days: 4-1.\n\nWins and losses stay up.",
  );
});

test("composeWeekTape: two or more leagues add one plain line per league, most picks first", () => {
  const rows = [
    row("2026-09-08", "won"), row("2026-09-09", "won"), row("2026-09-10", "lost"),
    row("2026-09-10", "won", "NFL"), row("2026-09-13", "lost", "NFL"), row("2026-09-13", "lost", "NFL"),
    row("2026-09-13", "push", "NFL"),
  ];
  const out = composeWeekTape(rows, "2026-09-14");
  assert.ok(out);
  assert.equal(out.record, "3-3");
  assert.equal(
    out.text,
    "Last week on the board, Sep 7 to Sep 13: 3-3, 1 push.\nNFL 1-2\nMLB 2-1\n\nLast 30 days: 3-3.\n\nWins and losses stay up.",
  );
});

test("composeWeekTape: no graded games in the week -> null (nothing to post)", () => {
  assert.equal(composeWeekTape([row("2026-08-20", "won")], "2026-09-07"), null);
  assert.equal(composeWeekTape([row("2026-09-02", "pending")], "2026-09-07"), null);
});

test("composeWeekTape: never emits emojis, hashtags, or a link", () => {
  const out = composeWeekTape([row("2026-09-01", "won"), row("2026-09-02", "lost")], "2026-09-07");
  assert.ok(out);
  assert.doesNotMatch(out.text, /[#\u{1F300}-\u{1FAFF}✅❌]/u);
  assert.doesNotMatch(out.text, /https?:\/\//);
  assert.ok(out.text.length < 280);
});
