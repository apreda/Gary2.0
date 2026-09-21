import { it, expect } from 'vitest';
import { hasSwiftCompiler, runSwiftFixture } from '../helpers/swiftFixture.js';

it.skipIf(!hasSwiftCompiler)('loads only selected weeks, bounds cache, retains failed snapshots and rejects stale completions', () => {
  const output = runSwiftFixture(['Models/ProviderIdentity.swift', 'Picks/PicksGameLifecycle.swift', 'Picks/PicksSettledProps.swift', 'Picks/PicksHistory.swift'], `
import Foundation
struct GaryPick {} ; struct PropPick {} ; struct DailySlateRow {}
enum GamePageDataScope {
 static func shiftDay(_ day: String, _ offset: Int) -> String? {
  let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.timeZone = TimeZone(secondsFromGMT: 0)
  return f.date(from: day).map { f.string(from: $0.addingTimeInterval(Double(offset) * 86400)) }
 }
}
@MainActor enum SupabaseAPI {
 static var calls: [String: Int] = [:]
 static var failure = false
 static var held: String?
 static var waiter: CheckedContinuation<Void, Never>?
 static func isCancellation(_ error: Error) -> Bool { error is CancellationError }
 static func fetchNFLPicksWeeks() async throws -> [NFLPicksWeek] { [] }
 static func fetchNFLPicksHistory(week: NFLPicksWeek) async throws -> NFLPicksHistory {
  calls[week.id, default: 0] += 1
  if failure { throw URLError(.notConnectedToInternet) }
  if held == week.id { await withCheckedContinuation { waiter = $0 } }
  return NFLPicksHistory(week: week, picks: [], props: [], slate: [], games: PicksSettledGames(), propGrades: PicksSettledProps())
 }
}
Task { @MainActor in
 let store = PicksHistoryStore()
 precondition(NFLPicksWeek(week_start: "2026-08-25", week_number: 4, season: 2026).shortLabel == "PRESEASON")
 precondition(NFLPicksWeek(week_start: "2026-09-08", week_number: 1, season: 2026).displayRange == "Sep 8–Sep 14")
 precondition(SupabaseAPI.calls.isEmpty)
 let weeks = ["2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29"].enumerated().map { NFLPicksWeek(week_start: $0.element, week_number: $0.offset + 1, season: 2026) }
 await store.select(weeks[0]); await store.select(weeks[0])
 precondition(SupabaseAPI.calls[weeks[0].id] == 1)
 SupabaseAPI.failure = true
 await store.select(weeks[0], force: true)
 precondition(store.failed && store.snapshot?.week == weeks[0])
 SupabaseAPI.failure = false
 for week in weeks.dropFirst() { await store.select(week) }
 await store.select(weeks[0])
 precondition(SupabaseAPI.calls[weeks[0].id] == 3, "Fourth week evicts oldest; no season preload")
 SupabaseAPI.held = weeks[1].id
 let old = Task { await store.select(weeks[1], force: true) }
 while SupabaseAPI.waiter == nil { await Task.yield() }
 await store.select(weeks[2])
 SupabaseAPI.waiter?.resume(); await old.value
 precondition(store.snapshot?.week == weeks[2] && !store.loading)
 await store.select(nil)
 precondition(store.snapshot == nil && !store.loading)
 var grades = PicksSettledProps()
 grades.record(league: "NFL", date: "2026-09-10", gameID: 42, player: "Player", market: "receiving_yards", side: "over", line: "19.5", outcome: "won")
 func grade(_ league: String = "NFL", _ date: String = "2026-09-10", _ id: Int = 42, _ side: String = "over", _ line: String = "19.5") -> String? {
  grades.result(league: league, date: date, gameID: id, player: "Player", market: "receiving_yards 19.5", side: side, line: line)
 }
 precondition(grade() == "won")
 precondition(grade("NCAAF") == nil && grade("NFL", "2026-09-17") == nil)
 precondition(grade("NFL", "2026-09-10", 99) == nil)
 precondition(grade("NFL", "2026-09-10", 42, "under") == nil)
 precondition(grade("NFL", "2026-09-10", 42, "over", "20.5") == nil)
 print("bounded history and exact prop grades passed")
 exit(0)
}
RunLoop.main.run()
`);
  expect(output).toContain('bounded history and exact prop grades passed');
}, 60_000);
