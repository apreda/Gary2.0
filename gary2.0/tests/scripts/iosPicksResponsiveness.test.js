import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const source = file => readFileSync(new URL(`../../../ios/GaryApp/${file}`, import.meta.url), 'utf8');
const hasSwift = spawnSync('swiftc', ['--version'], { encoding: 'utf8' }).status === 0;
function block(text, start) {
  const begin = text.indexOf(start);
  if (begin < 0) throw new Error(`Missing declaration: ${start}`);
  let depth = 0;
  for (let i = text.indexOf('{', begin); i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}' && --depth === 0) return text.slice(begin, i + 1);
  }
  throw new Error(`Unclosed declaration: ${start}`);
}
function runSwift(body) {
  const directory = mkdtempSync(join(tmpdir(), 'gary-picks-responsiveness-'));
  try {
    const file = join(directory, 'Fixture.swift');
    const binary = join(directory, 'fixture');
    writeFileSync(file, body);
    execFileSync('swiftc', ['-O', '-swift-version', '5', '-parse-as-library', '-Xfrontend', '-enable-actor-data-race-checks', file, '-o', binary], { encoding: 'utf8', timeout: 45_000 });
    return execFileSync(binary, [], { encoding: 'utf8', timeout: 15_000 });
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

describe('Picks accepted-content loading', () => {
  it.skipIf(!hasSwift)('labels the accepted slate across midnight, 6 AM refreshes, time zones and DST', () => {
    const picks = source('PicksTab.swift'), api = source('SupabaseAPI.swift');
    expect(block(picks, '    private var dayBlock:')).toContain(
      'Self.slateDayLabel(loadedDate: store.loadedDate, yesterday: pickDay == .yesterday)',
    );
    const rollover = api.match(/static let slateRolloverHourET = \d+/)?.[0];
    expect(rollover).toBeTruthy();
    expect(runSwift(`import Foundation
enum SupabaseAPI {
 ${rollover}
 ${block(api, '    static func todayEST(')}
 ${block(api, '    private static func formatDateEST(')}
}
enum Label {
 ${block(picks, '    private static func slateDayLabel(').replace('private static', 'static')}
}
@main struct Fixture {
 static func main() {
  let originalTimeZone = NSTimeZone.default
  defer { NSTimeZone.default = originalTimeZone }
  let iso = ISO8601DateFormatter()
  func label(_ loaded: String, _ yesterday: Bool, _ instant: String) -> String {
   Label.slateDayLabel(loadedDate: loaded, yesterday: yesterday, now: iso.date(from: instant)!)
  }
  for zone in ["America/Los_Angeles", "Asia/Tokyo", "Pacific/Kiritimati"] {
   NSTimeZone.default = TimeZone(identifier: zone)!
   precondition(label("2026-09-07", false, "2026-09-08T04:58:00Z") == "SEP 7",
    "At 00:58 ET the accepted Sep 7 slate must say Sep 7")
   precondition(label("2026-09-07", true, "2026-09-08T04:58:00Z") == "SEP 6")
   precondition(label("", false, "2026-09-08T04:58:00Z") == "SEP 7")
   precondition(label("", true, "2026-09-08T04:58:00Z") == "SEP 6")
   precondition(label("", false, "2026-09-08T09:59:59Z") == "SEP 7")
   precondition(label("", false, "2026-09-08T10:00:00Z") == "SEP 8")
   precondition(label("2026-09-07", false, "2026-09-08T10:00:00Z") == "SEP 7",
    "The 6 AM clock change cannot relabel retained content during refresh")
   precondition(label("2026-09-07", true, "2026-09-08T10:00:00Z") == "SEP 6")
   precondition(label("2026-09-08", false, "2026-09-08T10:00:01Z") == "SEP 8")
   precondition(label("2026-09-08", true, "2026-09-08T10:00:01Z") == "SEP 7")
   precondition(label("bad-date", false, "2026-09-08T04:58:00Z") == "SEP 7")
   precondition(label("2026-02-30", false, "2026-09-08T04:58:00Z") == "SEP 7")
   precondition(label("", false, "2026-03-08T05:30:00Z") == "MAR 7")
   precondition(label("", false, "2026-03-08T09:59:59Z") == "MAR 7")
   precondition(label("", false, "2026-03-08T10:00:00Z") == "MAR 8")
   precondition(label("2026-03-09", true, "2026-03-09T10:00:00Z") == "MAR 8",
    "Yesterday is an Eastern calendar day across the 23-hour spring transition")
   for repeatedHour in ["2026-11-01T04:30:00Z", "2026-11-01T05:30:00Z", "2026-11-01T06:30:00Z", "2026-11-01T10:59:59Z"] {
    precondition(label("", false, repeatedHour) == "OCT 31")
    precondition(label("", true, repeatedHour) == "OCT 30")
   }
   precondition(label("", false, "2026-11-01T11:00:00Z") == "NOV 1")
   precondition(label("2026-11-02", true, "2026-11-02T11:00:00Z") == "NOV 1")
   precondition(label("2028-03-01", true, "2028-03-01T11:00:00Z") == "FEB 29")
   precondition(label("2027-01-01", true, "2027-01-01T11:00:00Z") == "DEC 31")
  }
  print("Accepted slate date-label assertions passed")
 }
}
`)).toContain('Accepted slate date-label assertions passed');
  }, 60_000);

  it.skipIf(!hasSwift)('executes the shipping store with suspended sources, unchanged refreshes, same-count edits, failures and rollovers', () => {
    const store = source('SharedStores.swift');
    const home = source('HomeView.swift');
    const api = source('SupabaseAPI.swift');
    const output = runSwift(`
import Foundation
import Combine
struct PropPick: Codable {
 var player: String? = "Player"
 var prop: String? = "hits"
 var line: String? = "1.5"
 var matchup: String? = "Away @ Home"
 var commence_time: String?
 var league: String? = "MLB"
 var analysis = "original"
 var time: String? = nil
 var team: String? = nil
 var effectiveLeague: String? { league }
}
struct GaryPick: Codable {
 var id: String
 var league: String? = "MLB"
 var pick: String? = "Away ML"
 var rationale = "original"
 var commence_time: String?
 var awayTeam: String? = "Away"
 var homeTeam: String? = "Home"
}
struct DailySlateRow: Codable { var game_id: Int; var league = "MLB"; var detail = "original" }
struct StringOrNumber { var value: String }
struct PropResult {
 var player_name: String? = "Player"
 var prop_type: String? = "hits"
 var line_value: StringOrNumber? = .init(value: "1.5")
 var actual_value: StringOrNumber? = .init(value: "2")
 var matchup: String? = "Away @ Home"
 var game_date: String?
 var result: String? = "won"
}
struct GameResult {
 var displayFinalScore: String? { final_score }
 var matchup: String? = "Away @ Home"
 var pick_text: String? = "Away ML"
 var result: String? = "won"
 var game_date: String?
 var final_score: String? = "3-1"
}
enum Formatters { static let dayTimeFormatterEST = DateFormatter() }
func parseISO8601(_ value: String) -> Date? { ISO8601DateFormatter().date(from: value) }
func shortenMatchup(_ value: String) -> String { value }
func garyGameResultKey(matchupKey: String, pickText: String?) -> String { matchupKey + "|" + (pickText ?? "") }
func withTimeout<T>(seconds: TimeInterval, operation: @escaping () async throws -> T) async throws -> T { try await operation() }
@MainActor final class LiveScoreCache: ObservableObject {
 static let shared = LiveScoreCache()
 @Published var gradedFinals: [String: String] = [:]
}
enum FixtureError: Error { case unavailable }
@MainActor enum SupabaseAPI {
 ${block(api, '    static func isCancellation(').replace('static func', 'nonisolated static func')}
 nonisolated static func isTransientExternalFailure(_ error: Error) -> Bool { true }
 static var date = "2026-09-07"
 static func todayEST() -> String { date }
 static func yesterdayEST() -> String { date == "2026-09-07" ? "2026-09-06" : "2026-09-07" }
 static var held: Set<String> = []
 static var waiters: [String: [CheckedContinuation<Void, Never>]] = [:]
 static var calls: [String: Int] = [:]
 static func wait(_ key: String) async {
  calls[key, default: 0] += 1
  if held.contains(key) { await withCheckedContinuation { waiters[key, default: []].append($0) } }
 }
 static func release(_ key: String) {
  held.remove(key)
  let pending = waiters.removeValue(forKey: key) ?? []
  pending.forEach { $0.resume() }
 }
 static var props: [String: Result<[PropPick], Error>] = [:]
 static var daily: [String: Result<[GaryPick], Error>] = [:]
 static var nfl: [String: Result<[GaryPick], Error>] = [:]
 static var propResults: Result<[PropResult], Error> = .success([])
 static var gameResults: Result<[GameResult], Error> = .success([])
 struct SlateResult { var rows: [DailySlateRow] = []; var succeeded = true; var transientExternalFailure = false; var cancelled = false }
 static var board = SlateResult()
 static func fetchPropPicks(date: String, forceRefresh: Bool) async throws -> [PropPick] {
  let value = props[date] ?? .success([]); await wait("props|" + date); return try value.get()
 }
 static func fetchPropResults(since: String, forceRefresh: Bool) async throws -> [PropResult] {
  let value = propResults; await wait("propResults"); return try value.get()
 }
 static func fetchDailyPicks(date: String) async throws -> [GaryPick] {
  let value = daily[date] ?? .success([]); await wait("daily|" + date); return try value.get()
 }
 static func fetchWeeklyNFLPicks(for date: String) async throws -> [GaryPick] {
  let value = nfl[date] ?? .success([]); await wait("nfl|" + date); return try value.get()
 }
 static func fetchAllGameResults(since: String, forceRefresh: Bool) async throws -> [GameResult] {
  let value = gameResults; await wait("gameResults"); return try value.get()
 }
 static func fetchDailySlateWithStatus(date: String, forceRefresh: Bool) async -> SlateResult {
  let value = board; await wait("slate|" + date); return value
 }
}
${['enum GamePickSource:', 'struct GamePickSourceSnapshot', 'func fetchIsolatedGamePickSources(', 'func mergeGamePickSnapshot('].map(name => block(home, name)).join('\n')}
${block(store, 'enum PicksContentEquality {')}
${block(store, '@MainActor\nfinal class PropsSlateStore:')}
@MainActor func waitUntil(_ predicate: () -> Bool) async {
 for _ in 0..<20_000 { if predicate() { return }; await Task.yield() }
 preconditionFailure("Controlled request did not reach the expected suspension point")
}
@main struct Fixture {
 @MainActor static func main() async {
  let store = PropsSlateStore()
  let today = SupabaseAPI.date, yesterday = SupabaseAPI.yesterdayEST()
  let current = PropPick(commence_time: today + "T20:00:00Z")
  let oldMLB = PropPick(commence_time: yesterday + "T20:00:00Z")
  let oldNFL = PropPick(commence_time: yesterday + "T20:00:00Z", league: "NFL")
  SupabaseAPI.props[today] = .success([current])
  SupabaseAPI.props[yesterday] = .success([oldMLB, oldNFL])
  SupabaseAPI.daily[today] = .success([GaryPick(id: "today", commence_time: today + "T20:00:00Z")])
  SupabaseAPI.daily[yesterday] = .success([GaryPick(id: "yesterday", commence_time: yesterday + "T20:00:00Z")])
  SupabaseAPI.board = .init(rows: [.init(game_id: 9)])
  SupabaseAPI.propResults = .success([PropResult(game_date: yesterday)])
  SupabaseAPI.gameResults = .success([GameResult(game_date: yesterday)])
  SupabaseAPI.held = ["daily|" + today, "props|" + yesterday]
  let initial = Task { await store.loadIfNeeded() }
  await waitUntil { store.slate.count == 1 && store.allProps.count == 1 }
  precondition(store.loading && store.gamePicks.isEmpty && store.yesterdayPropsAll.isEmpty,
   "Ready slate and today props publish while independent pick/history requests stay blocked")
  let duplicate = Task { await store.refresh() }
  initial.cancel()
  for _ in 0..<20 { await Task.yield() }
  precondition(SupabaseAPI.calls["slate|" + today] == 1, "Simultaneous readers share one owner")
  SupabaseAPI.release("daily|" + today)
  await waitUntil { store.gamePicks.count == 1 }
  precondition(store.loading && store.yesterdayPropsAll.isEmpty)
  SupabaseAPI.release("props|" + yesterday)
  await initial.value; await duplicate.value
  precondition(!store.loading && store.loaded && store.yesterdayProps.count == 1)
  precondition(store.yesterdayProps.first?.league == "NFL" && store.yesterdayPropsAll.count == 2)
  precondition(store.resultForProp(oldMLB) == "won", "Explicit yesterday grades remain for sports with today's props")
  precondition(store.gamePickResult(store.yesterdayGamePicksAll[0]) == "won")
  precondition(store.yesterdayGamePicks.isEmpty && store.gameResultsMap.count == 1)
  var contentPublishes = 0, finalPublishes = 0
  let contentSink = store.$contentRevision.dropFirst().sink { _ in contentPublishes += 1 }
  let finalSink = LiveScoreCache.shared.$gradedFinals.dropFirst().sink { _ in finalPublishes += 1 }
  let before = store.contentRevision
  SupabaseAPI.held = ["slate|" + today]
  let unchanged = Task { await store.refresh() }
  await waitUntil { SupabaseAPI.waiters["slate|" + today]?.count == 1 }
  precondition(store.contentRevision == before && contentPublishes == 0)
  SupabaseAPI.release("slate|" + today)
  await unchanged.value
  precondition(store.contentRevision == before && contentPublishes == 0 && finalPublishes == 0,
   "An identical refresh publishes zero content revisions and zero graded-final changes")
  var edited = current; edited.analysis = "same count, revised analysis"
  SupabaseAPI.props[today] = .success([edited])
  await store.refresh()
  precondition(store.allProps.first?.analysis == edited.analysis && contentPublishes == 1)
  precondition(finalPublishes == 0)
  SupabaseAPI.props[today] = .failure(FixtureError.unavailable)
  SupabaseAPI.daily[today] = .failure(FixtureError.unavailable)
  await store.refresh()
  precondition(store.propPickSourceFailed && store.allProps.first?.analysis == edited.analysis)
  precondition(store.yesterdayProps.count == 1 && store.yesterdayProps.first?.league == "NFL")
  precondition(store.gamePicks.first?.id == "today" && store.gamePickSourceFailures == ["DAILY"])
  SupabaseAPI.props[today] = .success([])
  SupabaseAPI.daily[today] = .success([])
  SupabaseAPI.board = .init()
  await store.refresh()
  precondition(store.allProps.isEmpty && store.gamePicks.isEmpty && store.slate.isEmpty)
  precondition(store.yesterdayProps.count == 2 && store.yesterdayGamePicks.count == 1)
  precondition(!store.propPickSourceFailed && store.gamePickSourceFailures.isEmpty)
  SupabaseAPI.props[today] = .success([current])
  SupabaseAPI.held = ["props|" + today]
  let old = Task { await store.refresh() }
  await waitUntil { SupabaseAPI.waiters["props|" + today]?.count == 1 }
  SupabaseAPI.date = "2026-09-08"
  SupabaseAPI.held.remove("props|" + today)
  SupabaseAPI.props[SupabaseAPI.date] = .success([PropPick(commence_time: "2026-09-08T20:00:00Z", analysis: "new slate")])
  await store.refresh()
  precondition(store.loadedDate == SupabaseAPI.date && store.allProps.first?.analysis == "new slate")
  SupabaseAPI.release("props|" + today)
  await old.value
  precondition(store.loadedDate == SupabaseAPI.date && store.allProps.first?.analysis == "new slate" && !store.loading)
  withExtendedLifetime([contentSink, finalSink]) {}
  print("Picks responsiveness assertions passed; unchanged refresh: 0 content + 0 final publications")
 }
}
`);
    expect(output).toContain('Picks responsiveness assertions passed');
    // The real memo entry guard is executable independently of SwiftUI.
    const picks = source('PicksTab.swift');
    const memo = block(picks, '    private func rebuildMemo()');
    const guardBody = memo.slice(memo.indexOf('        let signature'), memo.indexOf('        let built'));
    const digest = block(picks, '    private var dataSignature:');
    expect(runSwift(`import Foundation
struct Store { var contentRevision: UInt64 = 0 }
final class Reader {
 var store = Store(); var connectionRevision: UInt64 = 0
 var sport = "MLB"; var pickDay = "today"; var ncaafConference = "RANKED"
 var notificationFocusGameID: Int?
 var memoSignature: String?; var rebuilds = 0
 ${digest}
 func rebuildMemo() { ${guardBody}\n rebuilds += 1 }
}
@main struct Fixture { static func main() {
 let reader = Reader()
 reader.rebuildMemo(); reader.rebuildMemo(); precondition(reader.rebuilds == 1)
 reader.store.contentRevision += 1; reader.rebuildMemo(); precondition(reader.rebuilds == 2)
 reader.connectionRevision += 1; reader.rebuildMemo(); precondition(reader.rebuilds == 3)
 reader.sport = "NFL"; reader.rebuildMemo(); precondition(reader.rebuilds == 4)
 reader.pickDay = "yesterday"; reader.rebuildMemo(); precondition(reader.rebuilds == 5)
 reader.ncaafConference = "SEC"; reader.rebuildMemo(); precondition(reader.rebuilds == 6)
 reader.rebuildMemo(); precondition(reader.rebuilds == 6)
 reader.notificationFocusGameID = 41; reader.rebuildMemo(); precondition(reader.rebuilds == 7,
  "A newly pinned notification target must rebuild the visible game set")
 reader.notificationFocusGameID = 41; reader.rebuildMemo(); precondition(reader.rebuilds == 7,
  "An unchanged notification target must preserve the memo")
 reader.notificationFocusGameID = 42; reader.rebuildMemo(); precondition(reader.rebuilds == 8)
 reader.notificationFocusGameID = nil; reader.rebuildMemo(); precondition(reader.rebuilds == 9,
  "Clearing notification focus must rebuild the ordinary filtered game set")
 reader.rebuildMemo(); precondition(reader.rebuilds == 9)
 print("Memo assertions passed")
} }
`)).toContain('Memo assertions passed');
  }, 90_000);
  it.skipIf(!hasSwift)('keeps real connection metadata lossless and isolates stories when a new date outruns the old request', () => {
    const models = source('Models.swift'), picks = source('PicksTab.swift');
    const graph = source('HubJudgment.swift') + '\n' + models.slice(models.indexOf('struct Connection:'), models.indexOf('// MARK: - Live Scores'));
    expect(runSwift(`import Foundation
${graph}
${block(source('SharedStores.swift'), 'enum PicksContentEquality {')}
enum HubLeagueSel: String { case mlb, nfl, ncaaf, nba; var label: String { rawValue.uppercased() }; static func from(_ s: String) -> Self? { Self(rawValue: s.lowercased()) } }
enum SignalKind: Hashable { case story, fantasyUsage }
struct Signal { var id = UUID(); var league: HubLeagueSel; var slateDate: String?; var kind: SignalKind; var detail: String? }
extension Connection {
 func toSignal() -> Signal? {
  guard let league = HubLeagueSel.from(league ?? "") else { return nil }
  return Signal(league: league, slateDate: date, kind: category == "fantasy_usage" ? .fantasyUsage : .story, detail: detail)
 }
}
enum AppFlags { static let insightLeagues = ["MLB", "NFL", "NCAAF", "NBA"] }
@MainActor enum SupabaseAPI {
 static var date = "2026-09-07"
 static var sources: [String: [Connection]] = [:]
 static var held: Set<String> = []
 static var waiters: [String: CheckedContinuation<Void, Never>] = [:]
 static func todayEST() -> String { date }
 nonisolated static func isCancellation(_ error: Error) -> Bool { error is CancellationError }
 static func fetchInsightConnections(date: String, league: String) async throws -> [Connection] {
  let key = date + "|" + league
  let rows = sources[key] ?? []
  if held.contains(key) { await withCheckedContinuation { waiters[key] = $0 } }
  return rows
 }
 static func release(_ key: String) { held.remove(key); waiters.removeValue(forKey: key)?.resume() }
}
@MainActor final class Reader {
 var connections: [Signal] = []
 var connLoaded = false; var connectionLoadInFlight = false
 var connectionDate = ""; var connectionSnapshots: [HubLeagueSel: Data] = [:]
 var connectionRevision: UInt64 = 0; var connectionErrorLeagues: Set<HubLeagueSel> = []
 struct Store { var loadedDate = "2026-09-07" }
 var store = Store()
 enum PicksDay { case today, yesterday }
 var pickDay: PicksDay = .today
 static let fantasyOnlyKinds: Set<SignalKind> = [.fantasyUsage]
 ${block(picks, '    @MainActor\n    private func loadConnections()')}
 ${block(picks, '    private var currentConnections:')}
 func refresh() async { await loadConnections() }
 var current: [Signal] { currentConnections }
}
@MainActor func waitUntil(_ predicate: () -> Bool) async {
 for _ in 0..<20_000 { if predicate() { return }; await Task.yield() }
 preconditionFailure("Connection fixture did not reach its gate")
}
@main struct Fixture {
 @MainActor static func main() async throws {
  let decoder = JSONDecoder()
  let raw = #"[{"date":"2026-09-07","league":"MLB","category":"heat_check","headline":"Story","detail":"original","meta":{"baseline":1,"live_value":true,"season_type":"1","next_slate_games":[{"game_id":"7","scheduled_date":"2026-09-13","kickoff_status":"date_only"}]}}]"#
  let rows = try decoder.decode([Connection].self, from: Data(raw.utf8))
  let encoded = PicksContentEquality.encoded(rows)!
  let roundtrip = try decoder.decode([Connection].self, from: encoded)
  precondition(PicksContentEquality.equal(rows, roundtrip))
  let object = try JSONSerialization.jsonObject(with: encoded) as! [[String: Any]]
  let meta = object[0]["meta"] as! [String: Any]
  precondition(meta["season_type"] as? String == "1" && meta["live_value"] as? Bool == true)
  precondition((meta["baseline"] as? NSNumber)?.intValue == 1)
  precondition(roundtrip[0].meta?.next_slate_games?.first?.game_id == "7")
  precondition(!PicksContentEquality.equal(InsightMetaValue.number(.infinity), InsightMetaValue.number(.infinity)), "Encoding failure cannot masquerade as equality")
  let reader = Reader()
  let key = SupabaseAPI.date + "|MLB"
  SupabaseAPI.sources[key] = rows
  await reader.refresh()
  let identity = reader.connections[0].id, revision = reader.connectionRevision
  reader.pickDay = .yesterday
  precondition(reader.current.isEmpty, "Historical picks must not expose today’s connections")
  reader.pickDay = .today
  precondition(reader.current.count == 1)
  await reader.refresh()
  precondition(reader.connections[0].id == identity && reader.connectionRevision == revision)
  SupabaseAPI.sources[key] = try decoder.decode([Connection].self, from: Data(raw.replacingOccurrences(of: "original", with: "revised").utf8))
  await reader.refresh()
  precondition(reader.connections[0].detail == "revised" && reader.connections[0].id != identity)
  SupabaseAPI.held.insert(key)
  let old = Task { await reader.refresh() }
  await waitUntil { SupabaseAPI.waiters[key] != nil }
  SupabaseAPI.date = "2026-09-08"; reader.store.loadedDate = SupabaseAPI.date
  precondition(reader.current.isEmpty, "New slate cannot expose yesterday's stories before refresh starts")
  let newKey = SupabaseAPI.date + "|MLB"
  SupabaseAPI.sources[newKey] = try decoder.decode([Connection].self, from: Data(raw.replacingOccurrences(of: "2026-09-07", with: "2026-09-08").replacingOccurrences(of: "original", with: "new slate").utf8))
  SupabaseAPI.held.insert(newKey)
  let next = Task { await reader.refresh() }
  await waitUntil { SupabaseAPI.waiters[newKey] != nil }
  precondition(reader.connections.isEmpty && reader.connectionLoadInFlight)
  SupabaseAPI.release(key)
  await old.value
  precondition(reader.connectionLoadInFlight && reader.connections.isEmpty, "Old completion cannot release the newer owner")
  SupabaseAPI.release(newKey)
  await next.value
  precondition(reader.current.first?.detail == "new slate" && !reader.connectionLoadInFlight)
  SupabaseAPI.sources[newKey] = []
  await reader.refresh()
  precondition(reader.current.isEmpty)
  print("Connection identity and rollover assertions passed")
 }
}
`)).toContain('Connection identity and rollover assertions passed');
  }, 60_000);

});
