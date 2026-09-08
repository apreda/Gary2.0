import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const hasSwift = spawnSync('swiftc', ['--version'], { encoding: 'utf8' }).status === 0;
const hubSource = () => readFileSync(new URL('../../../ios/GaryApp/HubView.swift', import.meta.url), 'utf8');

function block(text, start) {
  const begin = text.indexOf(start);
  if (begin < 0) throw new Error(`Missing declaration: ${start}`);
  let depth = 0;
  for (let i = text.indexOf('{', begin); i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    if (text[i] === '}' && --depth === 0) return text.slice(begin, i + 1);
  }
  throw new Error(`Unclosed declaration: ${start}`);
}

function runSwift(body, optimized = false) {
  const directory = mkdtempSync(join(tmpdir(), 'gary-hub-lifecycle-'));
  try {
    const file = join(directory, 'Fixture.swift');
    const binary = join(directory, 'fixture');
    writeFileSync(file, `import Foundation\n${body}`);
    execFileSync('swiftc', ['-parse-as-library', ...(optimized ? ['-O'] : []), file, '-o', binary], { encoding: 'utf8', timeout: 30_000 });
    expect(execFileSync(binary, [], { encoding: 'utf8', timeout: 10_000 })).toContain('Hub lifecycle assertions passed');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function runLoadFixture(body) {
  const hub = hubSource();
  runSwift(`
enum HubLeagueSel: String, CaseIterable, Codable {
 case mlb, nfl, ncaaf, nba, wc
 var label: String { rawValue.uppercased() }
 static func from(_ raw: String) -> HubLeagueSel? { HubLeagueSel(rawValue: raw.lowercased()) }
}
enum SignalKind: String, Hashable, Codable { case story }
struct Signal: Codable {
 let id: String
 var league: HubLeagueSel
 var slateDate: String?
 var result: String? = nil
 var detail = "original"
 var confirmedXI: Bool? = nil
 var kind: SignalKind = .story
 func toSignal() -> Signal? { self }
}
struct Connection: Codable {
 var payload: Signal
 var date: String? { payload.slateDate }
 var league: String? { payload.league.label }
 func toSignal() -> Signal? { payload }
}
struct Row { var league: String?; var bdl_game_id: Int? }
struct TomorrowBoard { var date: String; var board: [Row] }
struct PlaceholderRow { var marker = "support" }
typealias NightHighlightRow = PlaceholderRow
typealias StreakRow = PlaceholderRow
typealias PlayerInsightCardRow = PlaceholderRow
typealias LeaguePulseRow = PlaceholderRow
enum FixtureFailure: Error { case unavailable }
enum AppFlags { static let insightLeagues = ["MLB", "NFL", "NCAAF", "NBA"] }
${block(readFileSync(new URL('../../../ios/GaryApp/SharedStores.swift', import.meta.url), 'utf8'), 'enum PicksContentEquality {')}
@MainActor enum SupabaseAPI {
 struct Support { var rows: [PlaceholderRow] = []; var succeeded = true; var cancelled = false }
 static var held: Set<String> = []
 static var waiters: [String: [CheckedContinuation<Void, Never>]] = [:]
 static var intel = Support()
 static var pulses: [String: Support] = [:]
 static func wait(_ key: String) async {
  if held.contains(key) { await withCheckedContinuation { waiters[key, default: []].append($0) } }
 }
 static func release(_ key: String) {
  held.remove(key)
  let pending = waiters.removeValue(forKey: key) ?? []
  pending.forEach { $0.resume() }
 }
 nonisolated static func isCancellation(_ error: Error) -> Bool { error is CancellationError }
 static var date = "2026-09-07"
 static var signals: [String: [String: [Signal]]] = [:]
 static var failures: [String: Set<String>] = [:]
 static var boards: [String: Result<TomorrowBoard?, Error>] = [:]
 static var calls: [(date: String, league: String)] = []
 static var holdBoard = false
 static var boardWaiters: [CheckedContinuation<Void, Never>] = []
 static func todayEST() -> String { date }
 static func hubGradedDateEST() -> String { "2026-09-06" }
 static var rates: [String: Result<(hit: Int, graded: Int)?, Error>] = [:]
 static var nights: [String: Result<[NightHighlightRow], Error>] = [:]
 static var streaks: Result<[StreakRow], Error> = .success([])
 static func fetchInsightHitRateResult(date: String) async -> Result<(hit: Int, graded: Int)?, Error> { await wait("history"); return rates[date] ?? .success((1, 2)) }
 static func fetchNightHighlightsResult(date: String) async -> Result<[NightHighlightRow], Error> { nights[date] ?? .success([]) }
 static func fetchStreaksResult() async -> Result<[StreakRow], Error> { streaks }
 static func fetchTodayBoardResult(date: String) async -> Result<TomorrowBoard?, Error> {
  let response = boards[date] ?? .success(nil)
  if holdBoard { await withCheckedContinuation { boardWaiters.append($0) } }
  return response
 }
 static func fetchPlayerIntelRowsResult(date: String, forceRefresh: Bool) async -> Support { let result = intel; await wait("intel"); return result }
 static func fetchLeaguePulseResult(date: String, league: String, forceRefresh: Bool) async -> Support { let result = pulses[league] ?? Support(); await wait(league); return result }
 static func fetchInsightConnections(date: String, league: String) async throws -> [Connection] {
  calls.append((date, league))
  if failures[date]?.contains(league) == true { throw FixtureFailure.unavailable }
  return (signals[date]?[league] ?? []).map { Connection(payload: $0) }
 }
 static func releaseBoard() {
  holdBoard = false
  let waiters = boardWaiters
  boardWaiters = []
  waiters.forEach { $0.resume() }
 }
}
@MainActor final class Reader {
 var loadTask: Task<Void, Never>?
 var fetchedWrites = 0
 var indexWrites = 0
 var fetched: [Signal] = [] { didSet { fetchedWrites += 1 } }
 var loadGeneration: UInt64 = 0
 var requestDate = ""
 var connectionSnapshots: [HubLeagueSel: Data] = [:]
 var sourceObservationClocks: [HubLeagueSel: [String: Date]] = [:]
 var boardLoading = false
 var intelLoading = false
 var intelFetchFailed = false
 var pulseLoadingLeagues: Set<String> = []
 var pulseErrorLeagues: Set<String> = []
 var historyLoading = false
 var historyFetchFailed = false
 var historyDate = ""
 var selectedSignal: Signal?
 var playerRead: Signal?
 var teamCardSignal: Signal?
 var namedCard: PlaceholderRow?
 var gameSheet: PlaceholderRow?
 var didLoad = false
 var loadedAt: Date?
 var loadedDate = ""
 var fetchErrorLeagues: Set<HubLeagueSel> = []
 var hitRate: (hit: Int, graded: Int)?
 var gradedIsYesterday = true
 var gradedDayShort = ""
 var ydaySignals: [Signal] = []
 var streakRows: [StreakRow] = []
 var nightRows: [NightHighlightRow] = []
 var intelCards: [PlayerInsightCardRow] = []
 var todayBoard: TomorrowBoard?
 var boardFetchFailed = false
 var pulseByLeague: [String: [LeaguePulseRow]] = [:]
 var itemsIndex: [HubLeagueSel: [SignalKind: [Signal]]] = [:] { didSet { indexWrites += 1 } }
 var sel: HubLeagueSel = .mlb
 var consumedFocus = 0
 static func dedupe(_ rows: [Signal]) -> [Signal] { rows }
 ${block(hub, '    private static func buildItemsIndex(')}
 ${block(hub, '    private static func shiftDate(')}
 ${block(hub, '    private static func failedSupport')}
 ${block(hub, '    @MainActor private func load() async')}
 ${['resetForSlate(', 'acceptsLoad(', 'performLoad(', 'loadCurrent(', 'loadIntel(', 'loadPulse(', 'loadHistory('].map(name => block(hub, '    @MainActor private func ' + name)).join('\n')}
 func refresh() async { await load() }
 func consumeFocus() { consumedFocus += 1 }
 func refreshJudgments() {}
 func refreshSourceObservations(_ signals: [Signal], league: HubLeagueSel) {}
}
@MainActor func waitUntil(_ ready: () -> Bool) async {
 for _ in 0..<10_000 {
  if ready() { return }
  await Task.yield()
 }
 preconditionFailure("The bounded load fixture did not reach its expected state")
}
@main struct Fixture {
 @MainActor static func main() async {
  ${body}
  print("Hub lifecycle assertions passed")
 }
}
`, true);
}

describe('native Hub lifecycle', () => {
  it.skipIf(!hasSwift)('opens reference player cards only for a current, populated and unambiguous league match and keeps retired leagues out', () => {
    const hub = hubSource();
    const source = file => readFileSync(new URL(`../../../ios/GaryApp/${file}`, import.meta.url), 'utf8');
    const insightLeagues = source('AppFlags.swift').match(/static let insightLeagues: \[String\] = \[[^\]]+\]/)?.[0];
    expect(insightLeagues).toBeTruthy();
    runSwift(`
${source('NCAAFTeams.swift')}
${source('HubCardIdentity.swift')}
enum HubLeagueSel: String { case mlb, nfl, ncaaf, nba, wc; var label: String { rawValue.uppercased() } }
enum SupabaseAPI { static func todayEST() -> String { "2026-09-07" } }
enum AppFlags { ${insightLeagues} }
struct Pack { let name: String }
struct PlayerInsightCardRow {
 let id: String
 var league: String?
 var player_name: String?
 var payload: Pack?
}
struct Signal { var league: HubLeagueSel }
struct BoardRow { var league: String? }
struct TomorrowBoard { var board: [BoardRow] }
struct Reader {
 var loadedDate = "2026-09-07"
 var sel: HubLeagueSel = .mlb
 var intelCards: [PlayerInsightCardRow] = []
 var fetched: [Signal] = []
 var todayBoard: TomorrowBoard?
 ${block(hub, '    private func intelCard(')}
 ${block(hub, '    private var availableLeagues:')}
 func card(_ name: String?, league: HubLeagueSel? = nil) -> PlayerInsightCardRow? { intelCard(for: name, league: league) }
 var leagues: [HubLeagueSel] { availableLeagues }
}
@main struct Fixture {
 static func main() {
  let populated = PlayerInsightCardRow(id: "mlb", league: "MLB", player_name: "John Smith", payload: Pack(name: "John Smith"))
  let football = PlayerInsightCardRow(id: "nfl", league: "NFL", player_name: "John Smith", payload: Pack(name: "John Smith"))
  let empty = PlayerInsightCardRow(id: "empty", league: "MLB", player_name: "John Smith")
  var reader = Reader()
  reader.intelCards = [populated, football]
  precondition(reader.card("J. Smith")?.id == "mlb")
  precondition(reader.card("John Smith", league: .nfl)?.id == "nfl")
  precondition(reader.card(nil) == nil && reader.card("") == nil)
  for rows in [[empty], [populated, empty], [populated, PlayerInsightCardRow(id: "other", league: "MLB", player_name: "James Smith")]] {
   reader.intelCards = rows
   precondition(reader.card("J. Smith") == nil, "Empty packs remain part of name ambiguity but never become tappable")
  }
  reader.intelCards = [PlayerInsightCardRow(id: "payload-name", league: "MLB", payload: Pack(name: "John Smith"))]
  precondition(reader.card("John Smith")?.id == "payload-name")
  for date in ["", "2026-09-06", "2026-09-08"] {
   reader.loadedDate = date
   precondition(reader.card("John Smith") == nil, "Reference cards may not borrow a pack from another loaded slate")
  }
  precondition(reader.leagues == [.mlb, .nfl, .ncaaf], "Quiet permanent desks remain selectable")
  reader.fetched = [Signal(league: .wc)]
  reader.todayBoard = TomorrowBoard(board: [BoardRow(league: "WC")])
  precondition(!reader.leagues.contains(.wc), "A residual row cannot reintroduce a retired league")
  reader.todayBoard = TomorrowBoard(board: [BoardRow(league: "NBA"), BoardRow(league: "WC")])
  precondition(reader.leagues == [.mlb, .nfl, .ncaaf, .nba])
  reader.todayBoard = nil
  reader.fetched = [Signal(league: .nba)]
  precondition(reader.leagues.contains(.nba), "An active NBA insight desk is exposed even without a schedule row")
  print("Hub lifecycle assertions passed")
 }
}
`);
  }, 45_000);

  it.skipIf(!hasSwift)('keeps NBA, college and retired leagues in the main Hub when the preceding league was in Fantasy', () => {
    const hub = hubSource();
    const masthead = block(hub, 'fileprivate struct HubMasthead:');
    const searchButtonGuard = masthead.match(/if\s+([^\n{]+)\{\s*searchButton\s*\}/)?.[1]?.trim();
    const searchFieldGuard = masthead.match(/if\s+([^\n{]+)\{\s*searchField\s*\}/)?.[1]?.trim();
    expect(searchButtonGuard).toBeTruthy();
    expect(searchFieldGuard).toBeTruthy();
    runSwift(`
enum HubLeagueSel { case mlb, nfl, ncaaf, nba, wc }
${block(hub, 'fileprivate extension HubLeagueSel {')}
struct Reader {
 var hubScope = "hub"
 var sel: HubLeagueSel = .mlb
 var searchOpen = false
 ${block(hub, '    private var showsFantasy:')}
 ${block(masthead, '    private var mainScope:')}
 var isFantasy: Bool { showsFantasy }
 var isMain: Bool { mainScope }
 var searchButtonVisible: Bool { if ${searchButtonGuard} { return true }; return false }
 var searchFieldVisible: Bool { if ${searchFieldGuard} { return true }; return false }
}
@main struct Fixture {
 static func main() {
  var reader = Reader()
  for league in [HubLeagueSel.mlb, .nfl, .ncaaf, .nba, .wc] {
   reader.sel = league
   precondition(!reader.isFantasy && reader.isMain, "The page and masthead agree that the main Hub remains main for every league")
  }
  reader.hubScope = "fantasy"
  for league in [HubLeagueSel.nfl] {
   reader.sel = league
   precondition(reader.isFantasy && !reader.isMain)
   for unsupported in [HubLeagueSel.mlb, .ncaaf, .nba, .wc] {
    reader.sel = unsupported
    precondition(!reader.isFantasy && reader.isMain, "Unsupported Fantasy desks keep their main page, search, section index and slate clock")
   }
  }
  // Execute the actual masthead predicate and the actual two SwiftUI guards;
  // the label's capitalization or an extracted property name is not behavior.
  for scope in ["hub", "fantasy", "legacy"] {
   reader.hubScope = scope
   for league in [HubLeagueSel.mlb, .nfl, .ncaaf, .nba, .wc] {
    reader.sel = league
    let expectedFantasy = scope == "fantasy" && league == .nfl
    precondition(reader.isFantasy == expectedFantasy && reader.isMain == !expectedFantasy)
    for isOpen in [false, true] {
     reader.searchOpen = isOpen
     precondition(reader.searchButtonVisible == !expectedFantasy, "The search toggle remains reachable for every main Hub desk")
     precondition(reader.searchFieldVisible == (isOpen && !expectedFantasy), "An open search field cannot leak onto the Fantasy page")
    }
   }
  }
  print("Hub lifecycle assertions passed")
 }
}
`);
    // These callbacks live inside SwiftUI. Check their use of the executed
    // predicate so testing it alone cannot miss the original mismatched guard.
    expect(block(hub, '        .onReceive(Timer.publish(every: 60,')).toContain('!showsFantasy');
    expect(block(hub, '        .overlay(alignment: .bottomTrailing)')).toContain('!showsFantasy');
    expect(block(hub, '        .refreshable')).toContain('if showsFantasy');
    expect(block(hub, '    private func consumeFocus()')).toContain('Self.fantasyKinds.contains(lane), sel.supportsFantasy');
    expect(masthead).toContain('if sel.supportsFantasy {');
    expect(masthead).toMatch(/scopeWord\([^,]+,\s*on:\s*mainScope\)\s*\{\s*hubScope = "hub"\s*\}/);
    expect(masthead).toMatch(/scopeWord\([^,]+,\s*on:\s*!mainScope\)\s*\{\s*hubScope = "fantasy"\s*\}/);
  }, 45_000);

  it.skipIf(!hasSwift)('shares one refresh across simultaneous triggers and keeps a canceled waiter from poisoning the shared load', () => {
    runLoadFixture(`
let reader = Reader()
SupabaseAPI.holdBoard = true
let first = Task { await reader.refresh() }
await waitUntil { SupabaseAPI.boardWaiters.count == 1 }
let foreground = Task { await reader.refresh() }
let pull = Task { await reader.refresh() }
first.cancel()
for _ in 0..<30 { await Task.yield() }
precondition(SupabaseAPI.boardWaiters.count == 1)
SupabaseAPI.releaseBoard()
await first.value; await foreground.value; await pull.value
precondition(reader.didLoad && !reader.boardFetchFailed && reader.loadTask == nil)
precondition(SupabaseAPI.calls.filter { $0.date == SupabaseAPI.date }.count == AppFlags.insightLeagues.count)
await reader.refresh()
precondition(SupabaseAPI.calls.filter { $0.date == SupabaseAPI.date }.count == 2 * AppFlags.insightLeagues.count)
`);
  }, 45_000);

  it.skipIf(!hasSwift)('honors a quiet league selected during the first request while keeping the independently loaded schedule', () => {
    runLoadFixture(`
let reader = Reader()
let date = SupabaseAPI.date
SupabaseAPI.signals[date] = ["MLB": [Signal(id: "mlb-new", league: .mlb, slateDate: date)]]
SupabaseAPI.failures[date] = ["NFL"]
SupabaseAPI.boards[date] = .success(TomorrowBoard(date: date, board: [Row(league: "NFL", bdl_game_id: 700)]))
SupabaseAPI.holdBoard = true
let refresh = Task { await reader.refresh() }
await waitUntil { !SupabaseAPI.boardWaiters.isEmpty }
reader.sel = .nfl
SupabaseAPI.releaseBoard()
await refresh.value
precondition(reader.sel == .nfl, "MLB having rows cannot override the NFL desk chosen while loading")
precondition(reader.didLoad && reader.loadedDate == date && reader.boardFetchFailed == false)
precondition(reader.fetchErrorLeagues == [.nfl] && reader.fetched.map(\\.id) == ["mlb-new"])
precondition(reader.todayBoard?.board.first?.bdl_game_id == 700, "Independent schedule success survives an insight failure")
reader.sel = .ncaaf
await reader.refresh()
precondition(reader.sel == .ncaaf, "A successful quiet college desk must also stay selected")
`);
    const hub = hubSource();
    const scope = block(hub, '    private var hubScopeContent:');
    const mainScope = scope
      .replace(block(scope, 'if showsFantasy {'), '');
    expect(mainScope).not.toContain('hubError');
    expect(block(hub, '    private var hubEditorialStateContent:')).not.toContain('hubError');
    const loaded = block(hub, '    private var hubLoadedContent:');
    expect(loaded.indexOf('HubSlateStrip')).toBeLessThan(loaded.indexOf('hubRefreshNotice'));
  }, 45_000);

  it.skipIf(!hasSwift)('retains only same-slate failed sources, clears authoritative empty data, and cannot relabel an old rollover response', () => {
    runLoadFixture(`
let reader = Reader()
let date = SupabaseAPI.date
reader.loadedDate = date
reader.didLoad = true
reader.fetched = [Signal(id: "old-nfl", league: .nfl, slateDate: date),
                  Signal(id: "old-mlb", league: .mlb, slateDate: date),
                  Signal(id: "old-college", league: .ncaaf, slateDate: date),
                  Signal(id: "prior-day-nfl", league: .nfl, slateDate: "2026-09-06")]
reader.todayBoard = TomorrowBoard(date: date, board: [Row(league: "MLB", bdl_game_id: 100)])
SupabaseAPI.signals[date] = ["MLB": [Signal(id: "new-mlb", league: .mlb, slateDate: date)]]
SupabaseAPI.failures[date] = ["NFL"]
SupabaseAPI.boards[date] = .failure(FixtureFailure.unavailable)
await reader.refresh()
precondition(Set(reader.fetched.map(\\.id)) == ["new-mlb", "old-nfl"], "Only the failed desk's current-slate rows survive")
precondition(reader.todayBoard?.board.first?.bdl_game_id == 100 && reader.boardFetchFailed)
precondition(reader.fetchErrorLeagues == [.nfl])
SupabaseAPI.failures[date] = []
SupabaseAPI.boards[date] = .success(nil)
await reader.refresh()
precondition(reader.fetched.map(\\.id) == ["new-mlb"] && reader.fetchErrorLeagues.isEmpty)
precondition(reader.todayBoard == nil && !reader.boardFetchFailed, "A successful empty board clears the retained snapshot and warning")

SupabaseAPI.signals[date] = [
 "MLB": [Signal(id: "wrong-league", league: .nfl, slateDate: date)],
 "NFL": [Signal(id: "wrong-date", league: .nfl, slateDate: "2026-09-06")]
]
await reader.refresh()
precondition(reader.fetched.map(\\.id) == ["new-mlb"], "Mismatched responses preserve last-good current-slate content")
precondition(reader.fetchErrorLeagues == [.mlb, .nfl], "A wrong league or date is a source failure, not an authoritative empty response")
SupabaseAPI.signals[date] = ["MLB": [Signal(id: "new-mlb", league: .mlb, slateDate: date)]]

reader.todayBoard = TomorrowBoard(date: date, board: [Row(league: "MLB", bdl_game_id: 101)])
SupabaseAPI.boards[date] = .success(TomorrowBoard(date: date, board: [Row(league: "MLB", bdl_game_id: 999)]))
SupabaseAPI.holdBoard = true
let crossing = Task { await reader.refresh() }
await waitUntil { !SupabaseAPI.boardWaiters.isEmpty }
let nextDate = "2026-09-08"
SupabaseAPI.date = nextDate
SupabaseAPI.failures[nextDate] = ["MLB", "NFL"]
SupabaseAPI.signals[nextDate] = ["NCAAF": [Signal(id: "next-college", league: .ncaaf, slateDate: nextDate)]]
SupabaseAPI.boards[nextDate] = .failure(FixtureFailure.unavailable)
SupabaseAPI.releaseBoard()
await crossing.value
precondition(reader.loadedDate == nextDate && reader.fetched.map(\\.id) == ["next-college"])
precondition(reader.todayBoard == nil && reader.boardFetchFailed, "Neither the retained nor returned old board crosses the slate boundary")
precondition(reader.fetchErrorLeagues == [.mlb, .nfl])
precondition(SupabaseAPI.calls.contains { $0.date == nextDate && $0.league == "NCAAF" }, "Rollover reruns inside the shared owner")
precondition(reader.loadTask == nil)
`);
  }, 45_000);

  it.skipIf(!hasSwift)('publishes today before blocked support, accepts each support independently, and preserves unchanged identities', () => {
    runLoadFixture(`
let reader = Reader()
let date = SupabaseAPI.date
SupabaseAPI.signals[date] = ["MLB": [Signal(id: "story", league: .mlb, slateDate: date)]]
SupabaseAPI.boards[date] = .success(TomorrowBoard(date: date, board: [Row(league: "MLB", bdl_game_id: 9)]))
SupabaseAPI.held = ["intel", "MLB", "NFL", "NCAAF", "history"]
SupabaseAPI.intel = .init(rows: [PlaceholderRow(marker: "player")])
SupabaseAPI.pulses["MLB"] = .init(rows: [PlaceholderRow(marker: "table")])
let first = Task { await reader.refresh() }
await waitUntil { reader.didLoad && SupabaseAPI.waiters.count == 5 }
precondition(reader.fetched.first?.id == "story" && reader.todayBoard?.board.first?.bdl_game_id == 9)
precondition(reader.intelLoading && reader.historyLoading && reader.pulseLoadingLeagues.count == 3)
precondition(reader.intelCards.isEmpty && reader.loadTask != nil, "Primary content is ready while every supplemental request is blocked")
SupabaseAPI.release("MLB")
await waitUntil { !reader.pulseLoadingLeagues.contains("MLB") }
precondition(reader.pulseByLeague["MLB"]?.first?.marker == "table" && reader.intelLoading && reader.historyLoading)
SupabaseAPI.release("intel")
await waitUntil { !reader.intelLoading }
precondition(reader.intelCards.first?.marker == "player" && reader.historyLoading)
for key in ["NFL", "NCAAF", "history"] { SupabaseAPI.release(key) }
await first.value
let writes = reader.fetchedWrites
let indexes = reader.indexWrites
await reader.refresh()
precondition(reader.fetchedWrites == writes && reader.indexWrites == indexes, "An identical source never reconstructs stories or the grouping index")
var revised = SupabaseAPI.signals[date]!["MLB"]![0]
revised.detail = "same count, revised reasoning"
SupabaseAPI.signals[date]!["MLB"] = [revised]
await reader.refresh()
precondition(reader.fetched.first?.detail == revised.detail && reader.indexWrites == indexes + 1)
SupabaseAPI.intel = .init(succeeded: false)
SupabaseAPI.pulses["MLB"] = .init(succeeded: false)
await reader.refresh()
precondition(reader.intelFetchFailed && reader.intelCards.first?.marker == "player")
precondition(reader.pulseErrorLeagues.contains("MLB") && reader.pulseByLeague["MLB"]?.first?.marker == "table")
SupabaseAPI.intel = .init()
SupabaseAPI.pulses["MLB"] = .init()
await reader.refresh()
precondition(reader.intelCards.isEmpty && !reader.intelFetchFailed)
precondition(reader.pulseByLeague["MLB"]?.isEmpty == true && !reader.pulseErrorLeagues.contains("MLB"))
`);
  }, 45_000);

  it.skipIf(!hasSwift)('starts a new slate while old support remains blocked and discards its eventual completion', () => {
    runLoadFixture(`
let reader = Reader()
let oldDate = SupabaseAPI.date
SupabaseAPI.signals[oldDate] = ["MLB": [Signal(id: "old", league: .mlb, slateDate: oldDate)]]
SupabaseAPI.intel = .init(rows: [PlaceholderRow(marker: "old-player")])
SupabaseAPI.held = ["intel"]
let old = Task { await reader.refresh() }
await waitUntil { reader.didLoad && SupabaseAPI.waiters["intel"]?.count == 1 }
SupabaseAPI.date = "2026-09-08"
SupabaseAPI.intel = .init(rows: [PlaceholderRow(marker: "new-player")])
SupabaseAPI.signals[SupabaseAPI.date] = ["NFL": [Signal(id: "new", league: .nfl, slateDate: SupabaseAPI.date)]]
// Release only the gate for future callers; the old continuation stays held.
SupabaseAPI.held.remove("intel")
await reader.refresh()
precondition(reader.loadedDate == SupabaseAPI.date && reader.fetched.first?.id == "new")
precondition(reader.intelCards.first?.marker == "new-player" && !reader.intelLoading)
SupabaseAPI.release("intel")
await old.value
precondition(reader.fetched.first?.id == "new" && reader.intelCards.first?.marker == "new-player")
precondition(reader.loadTask == nil && !reader.boardLoading)
`);
  }, 45_000);

  it.skipIf(!hasSwift)('treats empty history as success and never relabels retained statistics under a different day', () => {
    runLoadFixture(`
let reader = Reader()
let graded = "2026-09-06"
let back = "2026-09-05"
SupabaseAPI.nights[graded] = .success([PlaceholderRow(marker: "graded-day")])
await reader.refresh()
precondition(reader.historyDate == graded && reader.nightRows.first?.marker == "graded-day")
SupabaseAPI.rates[graded] = .failure(FixtureFailure.unavailable)
SupabaseAPI.nights[graded] = .failure(FixtureFailure.unavailable)
await reader.refresh()
precondition(reader.historyFetchFailed && reader.historyDate == graded && reader.nightRows.first?.marker == "graded-day")
SupabaseAPI.rates[graded] = .success(nil)
SupabaseAPI.nights[graded] = .success([])
SupabaseAPI.rates[back] = .failure(FixtureFailure.unavailable)
SupabaseAPI.nights[back] = .failure(FixtureFailure.unavailable)
await reader.refresh()
precondition(reader.historyDate == back && reader.historyFetchFailed)
precondition(reader.hitRate == nil && reader.nightRows.isEmpty, "Earlier fallback cannot borrow later-day values")
SupabaseAPI.rates[back] = .success(nil)
SupabaseAPI.nights[back] = .success([])
await reader.refresh()
precondition(!reader.historyFetchFailed && reader.hitRate == nil && reader.nightRows.isEmpty && reader.streakRows.isEmpty)
precondition(!reader.gradedIsYesterday)
`);
  }, 45_000);

  it.skipIf(!hasSwift)('distinguishes an empty schedule from HTTP, decoding and transport failures at the real reader seam', () => {
    const api = readFileSync(new URL('../../../ios/GaryApp/SupabaseAPI.swift', import.meta.url), 'utf8');
    runSwift(`
struct TomorrowBoard: Decodable { let date: String }
final class FixtureSession {
 var status = 200
 var payload = Data("[]".utf8)
 var error: Error?
 var requests: [URLRequest] = []
 func data(for request: URLRequest) async throws -> (Data, URLResponse) {
  requests.append(request)
  if let error { throw error }
  return (payload, HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
 }
}
enum URLSession { static let shared = FixtureSession() }
enum Reader {
 static func buildURL(table: String, query: [URLQueryItem]) -> URL {
  var url = URLComponents(string: "https://fixture.invalid/" + table)!
  url.queryItems = query
  return url.url!
 }
 static func makeRequest(url: URL) -> URLRequest { URLRequest(url: url) }
 ${block(api, '    static func fetchTodayBoardResult(')}
 ${block(api, '    static func fetchTomorrowBoard(')}
}
@main struct Fixture {
 static func main() async {
  let session = URLSession.shared
  switch await Reader.fetchTodayBoardResult(date: "2026-09-07") {
  case .success(let board): precondition(board == nil)
  case .failure: preconditionFailure("An authoritative empty schedule is successful")
  }
  session.payload = Data("[{\\"date\\":\\"2026-09-07\\"}]".utf8)
  switch await Reader.fetchTodayBoardResult(date: "2026-09-07") {
  case .success(let board): precondition(board?.date == "2026-09-07")
  case .failure: preconditionFailure("A populated schedule must decode")
  }
  for failure in 0..<3 {
   session.status = failure == 0 ? 503 : 200
   session.payload = Data((failure == 1 ? "not-json" : "[]").utf8)
   session.error = failure == 2 ? URLError(.notConnectedToInternet) : nil
   switch await Reader.fetchTodayBoardResult(date: "2026-09-07") {
   case .success: preconditionFailure("A failed schedule must not become an authoritative empty response")
   case .failure: break
   }
   let legacy = await Reader.fetchTomorrowBoard(date: "2026-09-07")
   precondition(legacy == nil, "Existing optional callers retain their public interface")
  }
  for request in session.requests {
   let url = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!
   precondition(url.path == "/tomorrow_board")
   precondition(url.queryItems?.contains(URLQueryItem(name: "date", value: "eq.2026-09-07")) == true)
  }
  print("Hub lifecycle assertions passed")
 }
}
`);
  }, 45_000);
});
