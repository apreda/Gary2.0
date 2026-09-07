import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const source = readFileSync(new URL('../../../ios/GaryApp/HubFrontPageSelection.swift', import.meta.url), 'utf8');
const hasSwift = spawnSync('swift', ['--version'], { encoding: 'utf8' }).status === 0;

function runSwift(body) {
  const directory = mkdtempSync(join(tmpdir(), 'gary-hub-front-selection-'));
  const path = join(directory, 'selection.swift');
  try {
    writeFileSync(path, `${source}
let selector = HubFrontPageSelection.self
typealias Story = HubFrontPageSelection.Story
typealias Game = HubFrontPageSelection.Game
let clock = ISO8601DateFormatter()
let now = clock.date(from: "2026-09-07T20:00:00Z")!
func story(_ index: Int, _ kind: String = "connection", _ game: String? = nil, _ lead: Bool = true) -> Story {
    Story(index: index, kind: kind, gameID: game, prefersLead: lead)
}
${body}
print("Hub front page assertions passed")
`);
    expect(execFileSync('swift', [path], { encoding: 'utf8', timeout: 30_000 })).toContain('Hub front page assertions passed');
  } finally {
    unlinkSync(path);
    rmdirSync(directory);
  }
}

describe('native Hub front page selection', () => {
  it.skipIf(!hasSwift)('selects one lead and two supports by game phase before connection preference', () => {
    runSwift(`
let games = [Game(id: "done", startsAt: "2026-09-07T17:00:00Z", status: "final"),
             Game(id: "playing", status: "live"),
             Game(id: "next", startsAt: "2026-09-07T23:00:00Z", status: "scheduled")]
let ranked = [story(40, "platoon", "done"), story(10, "heat", "next", false),
              story(80, "park", "playing"), story(22, "bullpen", "next")]
let selected = selector.select(stories: ranked, games: games, now: now)
precondition(selected.lead == 22 && selected.supporting == [10, 80])
let onlyOneUpcoming = selector.select(stories: Array(ranked.prefix(3)), games: games, now: now)
precondition(onlyOneUpcoming.lead == 10, "A final/live connection cannot displace an upcoming counting story")
precondition(onlyOneUpcoming.supporting == [80, 40])
let empty = selector.select(stories: [], games: games, now: now)
precondition(empty.lead == nil && empty.supporting.isEmpty)
let one = selector.select(stories: [story(91)], games: [], now: now)
precondition(one.lead == 91 && one.supporting.isEmpty)
`);
  }, 40_000);

  it.skipIf(!hasSwift)('preserves server order within a phase and treats diversity as secondary to upcoming opportunities', () => {
    runSwift(`
let games = [Game(id: "later", startsAt: "2026-09-08T02:00:00Z"),
             Game(id: "earlier", startsAt: "2026-09-07T21:00:00Z"),
             Game(id: "done", status: "final")]
let selected = selector.select(stories: [story(900, "one", "later"), story(3, "two", "earlier"), story(1, "three", "later")], games: games, now: now)
precondition(selected.lead == 900 && selected.supporting == [3, 1], "Neither clock order nor numeric indexes replace server relevance")
let repeated = [story(0, "heat", "later", false), story(1, "heat", "earlier", false),
                story(2, "heat", "later", false), story(3, "platoon", "done")]
let upcomingOnly = selector.select(stories: repeated, games: games, now: now)
precondition(upcomingOnly.lead == 0 && upcomingOnly.supporting == [1, 2], "Do not insert final context just to diversify kinds")
let diverse = selector.select(stories: [story(0, "heat", "later"), story(1, "heat", "later"), story(2, "heat", "later"), story(3, "park", "earlier")], games: games, now: now)
precondition(diverse.lead == 0 && diverse.supporting == [1, 3])
let deduped = selector.select(stories: [story(-1), story(7), story(7), story(20), story(30), story(40)], games: [], now: now)
precondition(deduped.lead == 7 && deduped.supporting == [20, 30])
`);
  }, 40_000);

  it.skipIf(!hasSwift)('preserves exact doubleheader IDs and lets live/terminal provider states override stale scheduled clocks', () => {
    runSwift(`
let games = [Game(id: "100", startsAt: "2026-09-07T23:00:00Z", status: "scheduled"),
             Game(id: "100", status: "final"),
             Game(id: "101", startsAt: "2026-09-07T23:00:00Z", status: "scheduled"),
             Game(id: "102", startsAt: "2026-09-08T00:00:00Z", status: "scheduled"),
             Game(id: "102", status: "live")]
let phases = selector.phases(games: games, now: now)
precondition(phases["100"] == .completed && phases["101"] == .upcoming && phases["102"] == .live)
precondition(selector.phase(for: "0101", games: games, now: now) == .unknown)
precondition(selector.phase(for: nil, games: games, now: now) == .unknown)
let selected = selector.select(stories: [story(0, "park", "100"), story(1, "heat", "101", false), story(2, "bullpen", "102")], games: games, now: now)
precondition(selected.lead == 1 && selected.supporting == [2, 0])
for status in ["postponed", "cancelled", "canceled", "suspended", "delayed", "STATUS_POSTPONED"] {
    let unavailable = [Game(id: "x", startsAt: "2026-09-08T01:00:00Z", status: status)]
    precondition(selector.phase(for: "x", games: unavailable, now: now) == .unavailable)
}
precondition(selector.phase(for: "x", games: [Game(id: "x", status: "STATUS_IN_PROGRESS")], now: now) == .live)
precondition(selector.phase(for: "x", games: [Game(id: "x", status: "STATUS_FINAL_OVERTIME")], now: now) == .completed)
precondition(HubFrontPageSelection.Phase.completed.label.contains("CONTEXT"))
precondition(HubFrontPageSelection.Phase.unavailable.label.contains("CONTEXT"))
`);
  }, 40_000);

  it.skipIf(!hasSwift)('does not invent live status or chronological priority from absent, malformed, date-only or conflicting clocks', () => {
    runSwift(`
for at in [nil, "not-a-time", "2026-09-07", "2026-09-07T20:00:00Z", "2026-09-07T19:00:00Z"] as [String?] {
    precondition(selector.phase(for: "x", games: [Game(id: "x", startsAt: at, status: "scheduled")], now: now) == .unknown)
}
precondition(selector.phase(for: "x", games: [Game(id: "x", startsAt: "2026-09-07T20:00:00.001Z")], now: now) == .upcoming)
let conflicting = [Game(id: "x", startsAt: "2026-09-07T19:00:00Z"), Game(id: "x", startsAt: "2026-09-07T21:00:00Z")]
precondition(selector.phase(for: "x", games: conflicting, now: now) == .unknown)
let unknowns = selector.select(stories: [story(30, "heat", nil, false), story(2, "heat", "missing", false), story(99, "heat", "", false)], games: [Game(id: "", startsAt: "2026-09-08T00:00:00Z")], now: now)
precondition(unknowns.lead == 30 && unknowns.supporting == [2, 99], "Missing identifiers/times retain server order")
`);
  }, 40_000);
});
