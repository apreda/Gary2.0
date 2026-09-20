import { describe, expect, it } from 'vitest';
import { hasSwiftCompiler, runSwiftFixture } from '../helpers/swiftFixture.js';

describe('Picks weekly grades and rolling game order', () => {
  it.skipIf(!hasSwiftCompiler)('keeps exact Thursday grades and moves each confirmed final behind remaining kickoffs', () => {
    const output = runSwiftFixture(['Models/ProviderIdentity.swift', 'Picks/PicksGameLifecycle.swift'], `
import Foundation
let iso = ISO8601DateFormatter()
func start(_ text: String) -> Date { iso.date(from: text)! }
var grades = PicksSettledGames()
grades.record(league: "NFL", date: "2026-09-17", gameID: 1392232,
              pick: "Detroit Lions +5.5 -108", outcome: "LOST", score: "DET 31 · BUF 41")
precondition(grades.result(league: "NFL", date: "2026-09-17", gameID: 1392232,
                          pick: "Detroit Lions +5.5 -108") == "lost")
for (league, date, id, ticket) in [
    ("MLB", "2026-09-17", 1392232, "Detroit Lions +5.5 -108"),
    ("NFL", "2026-09-20", 1392232, "Detroit Lions +5.5 -108"),
    ("NFL", "2026-09-17", 9999999, "Detroit Lions +5.5 -108"),
    ("NFL", "2026-09-17", 1392232, "Detroit Lions +6.5 -108"),
    ("NFL", "2026-09-17", 1392232, "Detroit Lions +5.5 -110")
] { precondition(grades.result(league: league, date: date, gameID: id, pick: ticket) == nil) }
precondition(!grades.isFinal(league: "NFL", date: "2026-09-17", gameID: nil))
grades.record(league: "NFL", date: "2026-09-20", gameID: 42, pick: "Home ML",
              outcome: "pending", score: "3-0")
precondition(!grades.isFinal(league: "NFL", date: "2026-09-20", gameID: 42))
typealias Item = PicksGameOrder.Item
var rows = [
 Item(id: "thursday", start: start("2026-09-18T00:15:00Z"), bucket: 2),
 Item(id: "late", start: start("2026-09-20T20:15:00Z"), bucket: 1),
 Item(id: "early-a", start: start("2026-09-20T17:00:00Z"), bucket: 1),
 Item(id: "early-b", start: start("2026-09-20T17:00:00Z"), bucket: 1),
 Item(id: "night", start: start("2026-09-21T00:20:00Z"), bucket: 1),
 Item(id: "monday", start: start("2026-09-22T00:15:00Z"), bucket: 1)
]
func order() -> [String] { PicksGameOrder.indices(rows).map { rows[$0].id } }
precondition(order() == ["early-a", "early-b", "late", "night", "monday", "thursday"])
let morning = order()
rows[2] = Item(id: "early-a", start: rows[2].start, bucket: 2)
rows[3] = Item(id: "early-b", start: rows[3].start, bucket: 0)
precondition(order() == ["early-b", "late", "night", "monday", "thursday", "early-a"])
rows[3] = Item(id: "early-b", start: rows[3].start, bucket: 2)
precondition(order() == ["late", "night", "monday", "thursday", "early-a", "early-b"])
precondition(PicksGameOrder.selectedPage(3, before: morning, after: order()) == 1)
precondition(PicksGameOrder.selectedPage(1, before: morning, after: order()) == 5)
precondition(PicksGameOrder.selectedPage(0, before: morning, after: order()) == 0)
precondition(PicksGameOrder.selectedPage(7, before: morning, after: order()) == 0)
precondition(PicksGameOrder.selectedPage(1, before: morning, after: []) == 0)
rows[1] = Item(id: "late", start: rows[1].start, bucket: 2)
precondition(order().first == "night")
precondition(PicksGameOrder.indices(rows, historical: true).map { rows[$0].id }.first == "thursday")
// Same-time rows and duplicate legacy keys remain stable and never trap.
let tied = [Item(id: "same", start: nil, bucket: 1), Item(id: "same", start: nil, bucket: 1)]
precondition(PicksGameOrder.indices(tied) == [0, 1])
precondition(PicksGameOrder.indices([]).isEmpty)
print("weekly grade and kickoff lifecycle passed")
`);
    expect(output).toContain('weekly grade and kickoff lifecycle passed');
  }, 60_000);
});
