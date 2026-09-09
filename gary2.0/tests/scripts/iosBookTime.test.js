import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const book = readFileSync(new URL('../../../ios/GaryApp/UserBookView.swift', import.meta.url), 'utf8');
const shared = readFileSync(new URL('../../../ios/GaryApp/ViewsShared.swift', import.meta.url), 'utf8');
const models = readFileSync(new URL('../../../ios/GaryApp/Models.swift', import.meta.url), 'utf8');
const hasSwift = spawnSync('swiftc', ['--version']).status === 0;

function declaration(source, marker) {
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing declaration: ${marker}`);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unclosed declaration: ${marker}`);
}

describe('native Book date and verified start-time boundaries', () => {
  it.skipIf(!hasSwift)('runs production Swift across Eastern New Year, DST and fractional timestamps', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gary-book-time-'));
    try {
      const file = join(directory, 'main.swift');
      writeFileSync(file, `import Foundation
${declaration(shared, 'let isoFormatterFrac:')}()
${declaration(shared, 'let isoFormatterNoFrac:')}()
${declaration(shared, 'func parseISO8601')}
${declaration(book, 'private func userBookInstant')}
${declaration(book, 'enum BookTimeframe')}
${declaration(book, 'enum BookTicketTime')}
struct PropPick {
  var lane: String? = nil
  var prop: String? = nil
  var tdCategory: String? = nil
  ${declaration(models, 'var isHRLane: Bool')}
}
${declaration(book, 'enum BookPropEligibility')}
${declaration(book, 'struct BookDirectorySnapshot')}
${declaration(book, 'private struct DirectoryEntry:')}
func instant(_ value: String) -> Date { parseISO8601(value)! }
let before = instant("2027-01-01T04:59:59Z")
let after = instant("2027-01-01T05:00:00Z")
let oldSeason = BookTimeframe.window("season", now: before)!
precondition(oldSeason.start == "2026-03-01" && oldSeason.end == "2026-12-31")
precondition(oldSeason.contains("2026-12-31") && !oldSeason.contains("2027-01-01"))
let newSeason = BookTimeframe.window("season", now: after)!
precondition(newSeason.start == "2027-01-01" && newSeason.end == "2027-01-01")
precondition(!newSeason.contains("2026-12-31") && newSeason.contains("2027-01-01"))
precondition(!newSeason.contains("2027-01-02"))
let week = BookTimeframe.window("7d", now: after)!
precondition(week.start == "2026-12-26" && week.contains("2026-12-26"))
precondition(!week.contains("2026-12-25") && !week.contains("2027-01-02"))
let month = BookTimeframe.window("30d", now: after)!
precondition(month.start == "2026-12-03" && month.contains("2026-12-03"))
precondition(!month.contains("2026-12-02") && !month.contains("2027-01-02"))
precondition(BookTimeframe.window("all", now: after) == nil)
precondition(BookTimeframe.window("7d", now: instant("2027-03-14T12:00:00Z"))!.start == "2027-03-08")
precondition(BookTimeframe.window("7d", now: instant("2026-11-01T12:00:00Z"))!.start == "2026-10-26")
for value in ["2026-09-08T02:00:00Z", "2026-09-08T02:00:00.000Z", "2026-09-08T02:00:00.000+00:00", "2026-09-07T22:00:00.000-04:00"] {
  precondition(BookTicketTime.gameDate(value) == "2026-09-07")
  precondition(!BookTicketTime.isLocked(value, now: instant("2026-09-08T01:59:59.999Z")))
  precondition(BookTicketTime.isLocked(value, now: instant("2026-09-08T02:00:00Z")))
  precondition(BookTicketTime.isLocked(value, now: instant("2026-09-08T02:00:00.001Z")))
}
for value in [nil, "", "invalid", "2026-09-07"] as [String?] {
  precondition(BookTicketTime.gameDate(value) == nil)
  precondition(BookTicketTime.isLocked(value, now: after))
}
private func entry(_ start: String?) -> DirectoryEntry {
  DirectoryEntry(id: "fixture", title: "Fixture", subtitle: "", isProp: true,
    gameDate: BookTicketTime.gameDate(start) ?? "", pickText: "hits 1.5", player: "Fixture",
    propToken: "hits", pickId: nil, commenceTime: start)
}
precondition(entry(nil).locked && entry("unavailable").locked)
precondition(entry("2020-09-08T02:00:00.000+00:00").locked)
precondition(!entry("2099-09-08T02:00:00.000Z").locked)
for lane in ["HR", "hr", "TD", "td"] {
  precondition(!BookPropEligibility.canVerify(PropPick(lane: lane, prop: "hits 0.5")))
}
precondition(!BookPropEligibility.canVerify(PropPick(prop: "home_runs 0.5")))
precondition(BookPropEligibility.canVerify(PropPick(prop: "pitcher_home_runs 1.5")))
precondition(BookPropEligibility.canVerify(PropPick(lane: "CORE", prop: "hits 0.5")))
precondition(BookPropEligibility.canVerify(PropPick(prop: "anytime_touchdown 0.5", tdCategory: "standard")))
var directory = BookDirectorySnapshot<Int, String>()
directory.apply(date: "2026-09-07", games: nil, props: nil)
precondition(directory.games.isEmpty && directory.props.isEmpty && directory.errorMessage != nil)
directory.apply(date: "2026-09-07", games: [1], props: ["first"])
precondition(directory.games == [1] && directory.props == ["first"] && directory.errorMessage == nil)
directory.apply(date: "2026-09-07", games: nil, props: ["second"])
precondition(directory.games == [1] && directory.props == ["second"] && directory.failedLanes == ["Game picks"])
precondition(directory.errorMessage!.contains("earlier refresh"))
directory.apply(date: "2026-09-07", games: [], props: [])
precondition(directory.games.isEmpty && directory.props.isEmpty && directory.errorMessage == nil)
directory.apply(date: "2026-09-07", games: [2], props: ["old-date"])
directory.apply(date: "2026-09-08", games: nil, props: nil)
precondition(directory.games.isEmpty && directory.props.isEmpty && directory.failedLanes.count == 2)
print("BOOK_TIME_BOUNDARIES_OK")
`);
      const output = execFileSync('swift', [file], { encoding: 'utf8', timeout: 30_000 });
      expect(output).toContain('BOOK_TIME_BOUNDARIES_OK');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 35_000);

  it('uses the same date/lock boundary for prop placement and the Add Bet directory', () => {
    const prop = book.slice(book.indexOf('struct PropTailFadeRow:'));
    const placeProp = declaration(prop, 'private func place(_ side: String)');
    expect(placeProp).toContain('guard !locked, let dateStr = BookTicketTime.gameDate(prop.commence_time)');
    expect(placeProp).not.toContain('todayEST');
    const placeEntry = declaration(book, 'private func place(_ entry: DirectoryEntry)');
    expect(placeEntry).toContain('guard !entry.locked, !entry.gameDate.isEmpty');
    // Sep 9 2026: history is bounded by the calendar period (BookAnalytics), open slips never are.
    expect(declaration(book, 'private var scopedBets:')).toContain('period.contains(b.game_date)');
    expect(declaration(book, 'private var openSlips:')).not.toContain('period');
  });
});
