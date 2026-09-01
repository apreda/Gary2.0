// gary2.0/supabase/functions/social-auto-post/weektape.ts
// Pure composition for the WEEK TAPE — one post every Monday with the completed Mon–Sun record.
// No Deno, no network, no model: the same node-testable shape as pl.ts / verdicts.ts / window.ts.
//
// Why it exists (Sep 1 2026 marketing review, co-founder ruling): the record is the brand, and once the
// daily recap was retired (Aug 21) nothing on the timeline ever stated the aggregate — verdicts are
// per-game receipts, and the pin promised a Monday standing that stopped Jul 7. One plain post a week
// restores the ledger without bringing back a daily results table nobody was following live.
//
// Register: verdict-plain. Numbers and the fixed closing line. No emojis, no hashtags, no link (the bio
// carries the install path), no commentary — the founder has cut every editorial one-liner on every
// surface where one appeared.

export type TapeRow = { game_date: string; league: string | null; result: string | null };

const DAY = 86400_000;

function toUTC(ymd: string): Date {
  return new Date(ymd + "T12:00:00Z");
}
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function shift(ymdStr: string, days: number): string {
  return ymd(new Date(toUTC(ymdStr).getTime() + days * DAY));
}

/** The most recent COMPLETED Monday-to-Sunday week strictly before `today`'s week. */
export function previousWeek(today: string): { start: string; end: string } {
  const dow = toUTC(today).getUTCDay();          // 0 = Sunday … 6 = Saturday
  const sinceMonday = (dow + 6) % 7;             // Monday -> 0, Sunday -> 6
  const thisMonday = shift(today, -sinceMonday);
  const end = shift(thisMonday, -1);
  return { start: shift(end, -6), end };
}

// "2026-08-31" -> "Aug 31"
function shortDate(ymdStr: string): string {
  return toUTC(ymdStr).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

type Tally = { w: number; l: number; p: number; n: number };
function tally(rows: TapeRow[]): Tally {
  const t: Tally = { w: 0, l: 0, p: 0, n: 0 };
  for (const r of rows) {
    const res = String(r.result ?? "").trim().toLowerCase();
    if (res === "won") t.w++;
    else if (res === "lost") t.l++;
    else if (res === "push") t.p++;
    else continue;
    t.n++;
  }
  return t;
}
const record = (t: Tally) => `${t.w}-${t.l}`;
const pushes = (t: Tally) => (t.p ? `, ${t.p} push${t.p === 1 ? "" : "es"}` : "");

/**
 * Compose the Monday post. Returns null when the completed week holds no graded game — nothing to say.
 * With two or more leagues on the week, one plain line per league follows the headline record, most
 * graded picks first (ties alphabetical) so the busiest board leads.
 */
export function composeWeekTape(
  rows: TapeRow[],
  today: string,
): { text: string; week: { start: string; end: string }; record: string } | null {
  const week = previousWeek(today);
  const inWeek = rows.filter((r) => r.game_date >= week.start && r.game_date <= week.end);
  const weekTally = tally(inWeek);
  if (!weekTally.n) return null;

  const since30 = shift(today, -30);
  const last30 = tally(rows.filter((r) => r.game_date >= since30 && r.game_date < today));

  const lines: string[] = [
    `Last week on the board, ${shortDate(week.start)} to ${shortDate(week.end)}: ${record(weekTally)}${pushes(weekTally)}.`,
  ];

  const byLeague = new Map<string, TapeRow[]>();
  for (const r of inWeek) {
    const lg = (r.league ?? "").toUpperCase();
    if (!lg) continue;
    byLeague.set(lg, [...(byLeague.get(lg) ?? []), r]);
  }
  const leagues = [...byLeague.entries()]
    .map(([lg, rs]) => ({ lg, t: tally(rs) }))
    .filter((x) => x.t.n > 0)
    .sort((a, b) => b.t.n - a.t.n || a.lg.localeCompare(b.lg));
  if (leagues.length >= 2) {
    for (const { lg, t } of leagues) lines.push(`${lg} ${record(t)}`);
  }

  const text = `${lines.join("\n")}\n\nLast 30 days: ${record(last30)}.\n\nWins and losses stay up.`;
  return { text, week, record: record(weekTally) };
}
