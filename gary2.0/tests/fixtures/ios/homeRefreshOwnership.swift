import Foundation
/* SHIPPING_RECAP_SCORES */

// Network/model/rendering collaborators only. Every request/commit statement,
// account gate and Eastern clock below is inserted from shipping Swift source.
struct GaryPick {
    var id: String; var commence_time: String?; var league: String? = "MLB"
    var is_top_pick: Bool? = true; var confidence: Double? = 0.7; var game_id: Int? = 1
    var homeTeam: String? = "Home"; var awayTeam: String? = "Away"
    var rationale = "Original reasoning"; var type: String?; var venue: String?
}
struct PropPick { var id: String; var commence_time: String?; var isHRLane = false; var confidence: Double? = 0.8; var player: String? = "Player" }
struct GameResult {
    var displayFinalScore: String? { final_score }
    var effectiveLeague: String? { league }
    var pick_text: String? { "Away ML" }
    var teamScores: (away: String, home: String, a: Int, h: Int)? { ("Away", "Home", 3, 1) }
    var id: String; var game_date: String?; var matchup: String? = "Away @ Home"
    var final_score: String? = "3-1"; var result: String? = "won"; var league: String? = "MLB"
}
struct PropResult { var id: String; var game_date: String?; var isHRResult = false; var result: String? = "won"; var player_name: String? = "Player" }
extension Array where Element == GameResult { var countable: Self { self } }
struct DailySlateRow {
    var league: String; var away_team: String; var home_team: String?; var commence_time: String?
    var bdl_game_id: Int?; var venue: String?; var spread: Double?; var ml_home: Double?; var ml_away: Double?; var total: Double?
}
struct LiveScore { var id: String; var isLive = false }
struct UserBet { var id: String; var game_date: String }
struct Signal { var id: String; var result: String? = "won"; func toSignal() -> Self { self } }
struct Claim { var verdict: String }
struct FactCheck { var claims: [Claim]? }
struct Story { var id: String; var take: String?; var tier: String?; var claims: [Claim] = [] }
struct Night {
    var story: Story?; var marqueeGame: GameResult?; var cashes: [String] = []; var beat: String?
    var net = 1.0; var graded = 1; var bestOdds: Double? = 100; var record = (w: 1, l: 0, p: 0)
}
enum Formatters { static func shortTeamName(_ value: String?, league: String?) -> String { value ?? "" } }
func splitTake(_ text: String) -> (take: String, extra: String) { (text, "") }
func convictionTier(_ value: Double) -> String { "tier" }
func slateDayShort(_ date: String) -> String { date }
func parseISO8601(_ iso: String) -> Date? { ISO8601DateFormatter().date(from: iso) }
struct Animation { static func easeOut(duration: Double) -> Self { Self() } }
func withAnimation(_ animation: Animation, _ operation: () -> Void) { operation() }
enum FixtureError: Error { case transient, invalid, timeout }
@MainActor final class AuthManager {
    struct User { var id: String }
    static let shared = AuthManager()
    var currentUser: User? = .init(id: "A")
    var bearerToken: String? { currentUser == nil ? nil : "fixture-only" }
}
enum AppFlags { static let userBookEnabled = true; static let insightLeagues = ["MLB"] }
@MainActor enum HomeHeadlinesCache {
    static var writes = 0
    static func load() -> [String]? { nil }
    static func save(_ stories: [String]) { writes += 1 }
}
@MainActor final class LiveScoreCache { static let shared = LiveScoreCache(); func startIfNeeded() {} }
@MainActor enum SupabaseAPI {
    static var clock = parseISO8601("2026-09-08T09:59:59Z")!
    static let slateRolloverHourET = 6
    /* SHIPPING_CLOCK */
    static func todayEST() -> String { slateDate(now: clock) }
    static func yesterdayEST() -> String { HomeFixture.shiftDate(todayEST(), by: -1)! }
    static func hubGradedDateEST() -> String { yesterdayEST() }
    static let propsBookSince = "2026-05-01"
    static func isTransientExternalFailure(_ error: Error) -> Bool {
        if case FixtureError.transient = error { return true }; return false
    }
    static var wave = "seed"
    static var held: Set<String> = []
    static var waiters: [String: [CheckedContinuation<Void, Never>]] = [:]
    static var calls: [String: Int] = [:]
    static var transientResults: Set<String> = []
    static var transientProps: Set<String> = []
    static var transientPicks: Set<String> = []
    static var emptyResults: Set<String> = []
    static var failedBets: Set<String> = []
    static var emptyBets: Set<String> = []
    static var timeoutWaves: Set<String> = []
    static var produceMarquee = false
    static func wait(_ key: String) async {
        calls[key, default: 0] += 1
        if held.contains(key) { await withCheckedContinuation { waiters[key, default: []].append($0) } }
    }
    static func release(_ key: String) {
        held.remove(key); (waiters.removeValue(forKey: key) ?? []).forEach { $0.resume() }
    }
    struct SportRecord { var league: String; var wins: Int; var losses: Int; var pushes: Int }
    struct WireItem { var id: String; var kind: String? = "result" }
    struct MarketPulseRow { var id: String }
    struct InsightLedgerRow { var id: String; var result: String? = "won" }
    static func fetchYesterdayGameRecord() async throws -> (wins: Int, losses: Int, pushes: Int) {
        let wave = wave; await wait(wave + "|record"); return (wave == "old" ? 99 : 3, 0, 0)
    }
    static func fetchYesterdayBySport() async throws -> [SportRecord] {
        let wave = wave; await wait(wave + "|breakdown"); return [.init(league: wave, wins: 1, losses: 0, pushes: 0)]
    }
    static func fetchSevenDayFormBySport() async throws -> [SportRecord] {
        let wave = wave; await wait(wave + "|form"); return [.init(league: wave, wins: 1, losses: 0, pushes: 0)]
    }
    static func fetchPropPicks(date: String, forceRefresh: Bool = false) async throws -> [PropPick] {
        let wave = wave; await wait(wave + "|props|" + date)
        if transientProps.contains(wave) { throw FixtureError.transient }
        return [.init(id: wave, commence_time: date + "T20:00:00Z")]
    }
    static func fetchRecentGameResults(limit: Int) async throws -> [GameResult] {
        let wave = wave, date = todayEST(); await wait(wave + "|games")
        if transientResults.contains(wave) { throw FixtureError.transient }
        return emptyResults.contains(wave) ? [] : [.init(id: wave, game_date: date)]
    }
    static func fetchRecentPropResults(limit: Int, since: String) async throws -> [PropResult] {
        let wave = wave, date = todayEST(); await wait(wave + "|propResults")
        if transientResults.contains(wave) { throw FixtureError.transient }
        return emptyResults.contains(wave) ? [] : [.init(id: wave, game_date: date)]
    }
    static func fetchLiveScores(date: String) async -> [LiveScore]? {
        let wave = wave; await wait(wave + "|live"); return [.init(id: wave)]
    }
    static func fetchInsightLedger(date: String) async -> [InsightLedgerRow] {
        let wave = wave; await wait(wave + "|ledger|" + date); return [.init(id: wave)]
    }
    static func fetchWireItems(date: String) async -> [WireItem] {
        let wave = wave; await wait(wave + "|wire"); return [.init(id: wave)]
    }
    static func fetchMarketPulse(date: String) async -> [MarketPulseRow] {
        let wave = wave; await wait(wave + "|pulse"); return [.init(id: wave)]
    }
    static func fetchGameRecaps(date: String) async -> [String] {
        let wave = wave; await wait(wave + "|recaps|" + date); return [wave]
    }
    static func fetchDailySlate(date: String) async -> [DailySlateRow] {
        let wave = wave; await wait(wave + "|slate")
        return [.init(league: "MLB", away_team: wave, home_team: "Home", commence_time: date + "T00:00:00Z", bdl_game_id: 1, venue: nil, spread: nil, ml_home: nil, ml_away: nil, total: nil)]
    }
    static func fetchTomorrowBoard(date: String) async -> String? {
        let wave = wave; await wait(wave + "|tomorrowBoard"); return wave
    }
    static func fetchTodayBoard(date: String) async -> String? {
        let wave = wave; await wait(wave + "|todayBoard"); return wave
    }
    static func fetchStreaks() async -> [String] { let wave = wave; await wait(wave + "|streaks"); return [wave] }
    static func fetchInsightConnections(date: String, league: String) async throws -> [Signal] {
        let wave = wave; await wait(wave + "|edges|" + date); return [.init(id: wave)]
    }
    static func fetchInsightHitRate(date: String) async -> (hit: Int, graded: Int)? {
        let wave = wave; await wait(wave + "|hitRate"); return (wave == "old" ? 99 : 1, 1)
    }
    static func fetchDailyPicks(date: String) async throws -> [GaryPick] {
        let wave = wave; await wait(wave + "|daily|" + date)
        return [.init(id: wave, commence_time: date + "T20:00:00Z", rationale: wave)]
    }
    static func fetchFactCheck(date: String, matchup: String) async -> FactCheck? {
        let wave = wave; await wait(wave + "|fact"); return .init(claims: [.init(verdict: "right")])
    }
}
@MainActor func withTimeout<T>(seconds: TimeInterval, operation: () async throws -> T) async throws -> T {
    let wave = SupabaseAPI.wave
    let result = try await operation()
    if SupabaseAPI.timeoutWaves.contains(wave) {
        await SupabaseAPI.wait(wave + "|timeout")
        throw FixtureError.timeout
    }
    return result
}
@MainActor enum UserBookAPI {
    static func fetchMyBets() async -> [UserBet]? {
        let wave = SupabaseAPI.wave, date = SupabaseAPI.todayEST(), account = AuthManager.shared.currentUser?.id ?? "guest"
        await SupabaseAPI.wait(wave + "|bets")
        if SupabaseAPI.failedBets.contains(wave) { return nil }
        return SupabaseAPI.emptyBets.contains(wave) ? [] : [.init(id: account + ":" + wave, game_date: date)]
    }
}
struct GamePickSourceSnapshot { var picks: [GaryPick]; var failed = false }
@MainActor func fetchIsolatedGamePickSources(date: String) async -> GamePickSourceSnapshot {
    let wave = SupabaseAPI.wave; await SupabaseAPI.wait(wave + "|picks|" + date)
    return .init(picks: [.init(id: wave, commence_time: date + "T20:00:00Z")], failed: SupabaseAPI.transientPicks.contains(wave))
}
func mergeGamePickSnapshot(_ snapshot: GamePickSourceSnapshot, retaining previous: [GaryPick]) -> [GaryPick] { snapshot.failed ? previous : snapshot.picks }

@MainActor final class HomeFixture {
    let homeAuth = AuthManager.shared
    var homeNonce = 0
    var fullHomeRefreshNonce: Int?; var fullHomeRefreshID = UUID(); var fullHomeRefreshDate: String?
    var rollingHomeRefreshInFlight = false
    var loadedSlateDate = ""
    var myTodayBetsRows: [UserBet] = []; var myTodayBetsAccountID: String?; var myTodayBetsDate = ""; var myBetsRefreshID = UUID()
    var loading = true; var hasCompletedInitialHomeLoad = false; var animateIn = false
    var cachedHeadlines: [String]?; var yesterdayRecord = (wins: 0, losses: 0, pushes: 0)
    var sportBreakdown: [SupabaseAPI.SportRecord] = []; var sevenDayForm: [SupabaseAPI.SportRecord] = []
    var recentGameResultsLastGood: [GameResult] = []; var recentPropResultsLastGood: [PropResult] = []
    var todayPicks: [GaryPick] = []; var yesterdayTopPick: GaryPick?; var freePick: GaryPick?
    var freeProp: PropPick?; var yesterdayTopProp: PropPick?; var yesterdayTopPropResult: String?
    var yesterdayTopPickResult: String?; var yesterdayTopPickScore: String?
    var marqueeRequestID = UUID()
    var recapLabel = "LAST NIGHT"; var marquee: Story?; var cashRows: [String] = []; var worstBeat: String?
    var lastNightNet: Double?; var lastNightRecord = (w: 0, l: 0, p: 0); var lastNightGraded = 0; var bestCashOdds: Double?
    var sheetGameResults: [GameResult] = []; var slateGames: [DailySlateRow] = []
    var dailyRecapRecord = (w: 0, l: 0, p: 0); var dailyRecapNet: Double?; var dailyRecapBest: Double?
    var gamesNightRecord = (w: 0, l: 0, p: 0); var gamesNightNet: Double?; var gamesNightBest: Double?
    var form: [String] = []; var dailyForm: [String] = []
    var wireItems: [SupabaseAPI.WireItem] = []; var pulseRows: [SupabaseAPI.MarketPulseRow] = []
    var gamesLiveNow = 0; var initialLive: [LiveScore] = []; var recordBoxLabel = "YESTERDAY"
    var edgesPostedToday = 0; var receiptLanes: [String] = []; var tonightSignals: [Signal] = []; var ydayEdges: [Signal] = []
    var edgesHitRate: (hit: Int, graded: Int)?; var scoreByMatchup: [String: String] = [:]
    var nightRecaps: [String] = []; var tomorrowBoard: String?; var todayBoard: String?; var homeStreaks: [String] = []
    var receiptsSub = ""; var playsOnBoard = 0; var picksByGameId: [String: GaryPick] = [:]
    var hasHomeContent: Bool { !todayPicks.isEmpty }
    var headlineStories: [String] { nightRecaps }
    var liveScoresNow: [LiveScore] { initialLive }
    static func buildLastNight(games: [GameResult], props: [PropResult], includeToday: Bool = true) -> Night {
        .init(story: games.first.map { .init(id: $0.id) }, marqueeGame: SupabaseAPI.produceMarquee ? games.first : nil,
              cashes: games.map(\.id), beat: props.first?.id, graded: games.count)
    }
    static func buildForm(games: [GameResult]) -> [String] { games.map(\.id) }
    static func buildDailyFormBySport(games: [GameResult], live: [LiveScore], slateDay: String, anchor: String?) -> [String] { games.map(\.id) }
    static func buildReceiptLanes(_ ledger: [SupabaseAPI.InsightLedgerRow]) -> [String] { ledger.map(\.id) }
    static func prettyDate(_ value: String) -> String { value }
    static func tomorrowSlateDateEST() -> String { shiftDate(SupabaseAPI.todayEST(), by: 1)! }
    static func shiftDate(_ value: String, by days: Int) -> String? {
        let date = parseISO8601(value + "T12:00:00Z")!.addingTimeInterval(Double(days) * 86400)
        return String(ISO8601DateFormatter().string(from: date).prefix(10))
    }
    func presentDailyRecapIfNeeded(graded: Int, todayKey: String) {}
    // Compare all published fields, including loading flags and last-good caches.
    func published() -> String {
        let control: Set<String> = ["homeAuth", "homeNonce", "fullHomeRefreshNonce", "fullHomeRefreshID", "fullHomeRefreshDate", "rollingHomeRefreshInFlight", "myBetsRefreshID", "marqueeRequestID"]
        return Mirror(reflecting: self).children.filter { !control.contains($0.label ?? "") }
            .map { ($0.label ?? "") + ":" + String(reflecting: $0.value) }.joined(separator: "\n")
    }
    /* SHIPPING_METHODS */
}
@MainActor func check(_ condition: @autoclosure () -> Bool, _ message: String) {
    if !condition() { FileHandle.standardError.write(Data(("FAILED: " + message + "\n").utf8)); exit(1) }
}
@MainActor func waitUntil(_ predicate: () -> Bool) async {
    for _ in 0..<100_000 { if predicate() { return }; await Task.yield() }
    check(false, "Fixture never reached its controlled suspension point")
}
@main struct Fixture {
    @MainActor static func main() async {
        let previous = "2026-09-07", current = "2026-09-08"
        check(SupabaseAPI.todayEST() == previous, "Shipping Eastern clock keeps prior slate at 05:59:59")
        SupabaseAPI.clock = parseISO8601("2026-09-08T10:00:00Z")!
        check(SupabaseAPI.todayEST() == current, "Shipping Eastern clock rolls at exactly 06:00")
        // Run each actual full-load await as the deliberately slow old response.
        // The replacement runs the entire same shipping full task, completes first,
        // then the old response resumes. Compare every published field/cache.
        let endpoints = ["record", "breakdown", "form", "games", "propResults", "slate", "wire", "pulse", "live", "ledger|" + current,
                         "ledger|" + previous, "edges|" + current, "recaps|" + current, "tomorrowBoard", "todayBoard", "streaks",
                         "picks|" + previous, "props|" + previous, "picks|" + current, "props|" + current]
        for endpoint in endpoints {
            let home = HomeFixture()
            SupabaseAPI.wave = "old"; let key = "old|" + endpoint; SupabaseAPI.held = [key]
            let old = Task { await home.refreshFull() }
            await waitUntil { SupabaseAPI.waiters[key]?.isEmpty == false }
            home.homeNonce += 1
            SupabaseAPI.wave = "new"
            await home.refreshFull()
            check(home.todayPicks.first?.id == "new" && home.loadedSlateDate == current, "Replacement full refresh completed")
            let expected = home.published(), writes = HomeHeadlinesCache.writes
            SupabaseAPI.release(key); await old.value
            check(home.published() == expected && HomeHeadlinesCache.writes == writes, "Stale full response changed newer content at " + endpoint)
            check(home.fullHomeRefreshNonce == nil && !home.loading, "Stale defer cannot disturb completed owner")
        }
        // Both kinds of response cross exactly 6 a.m.; newer full load commits first.
        for rolling in [false, true] {
            let home = HomeFixture()
            SupabaseAPI.clock = parseISO8601("2026-09-08T09:59:59Z")!; SupabaseAPI.wave = "seed"
            await home.refreshFull()
            SupabaseAPI.wave = "old"; let key = "old|recaps|" + previous; SupabaseAPI.held = [key]
            let old = Task { if rolling { await home.refreshRollingHomeContent() } else { await home.refreshFull() } }
            await waitUntil { SupabaseAPI.waiters[key]?.isEmpty == false }
            SupabaseAPI.clock = parseISO8601("2026-09-08T10:00:00Z")!
            home.homeNonce += 1; SupabaseAPI.wave = "new"; await home.refreshFull()
            let expected = home.published(), writes = HomeHeadlinesCache.writes
            SupabaseAPI.release(key); await old.value
            check(home.published() == expected && HomeHeadlinesCache.writes == writes, "Pre-6AM " + (rolling ? "rolling" : "full") + " response overwrote the completed new slate")
        }
        // The full wave itself may cross the boundary before the timer fires.
        do {
            let home = HomeFixture()
            SupabaseAPI.clock = parseISO8601("2026-09-08T09:59:59Z")!; SupabaseAPI.wave = "old"; SupabaseAPI.held = ["old|slate"]
            let old = Task { await home.refreshFull() }
            await waitUntil { SupabaseAPI.waiters["old|slate"]?.isEmpty == false }
            SupabaseAPI.clock = parseISO8601("2026-09-08T10:00:00Z")!
            let expected = home.published()
            SupabaseAPI.release("old|slate"); await old.value
            check(home.published() == expected && home.loadedSlateDate.isEmpty, "Old-date full load published after cutoff without waiting for timer")
            check(home.homeNonce == 1, "Cold-boundary owner schedules exactly one current-day retry")
            SupabaseAPI.wave = "new"; await home.refreshFull()
            check(home.loadedSlateDate == current && !home.loading && home.hasCompletedInitialHomeLoad, "Cold-boundary retry hydrates the new slate")
        }
        // A late timeout must not clear the newer in-progress loading owner.
        do {
            let home = HomeFixture(); SupabaseAPI.wave = "old"
            SupabaseAPI.timeoutWaves = ["old"]; SupabaseAPI.held = ["old|timeout"]
            let old = Task { await home.refreshFull() }
            await waitUntil { SupabaseAPI.waiters["old|timeout"]?.isEmpty == false }
            home.homeNonce += 1; SupabaseAPI.wave = "new"; SupabaseAPI.held.insert("new|props|" + current)
            let newer = Task { await home.refreshFull() }
            await waitUntil { SupabaseAPI.waiters["new|props|" + current]?.isEmpty == false && home.loading }
            check(home.loading, "New load is waiting on the props wave")
            let owner = home.fullHomeRefreshID
            SupabaseAPI.release("old|timeout"); await old.value
            check(home.loading && home.fullHomeRefreshID == owner && home.fullHomeRefreshNonce == home.homeNonce, "Late timeout/defer cleared newer loading owner")
            SupabaseAPI.release("new|props|" + current); await newer.value
            SupabaseAPI.timeoutWaves = []
        }
        // Cancellation and account changes reject both full and rolling commits.
        for rolling in [false, true] {
            for change in ["cancel", "account", "date", "same-day-reload"] {
                let home = HomeFixture(); SupabaseAPI.wave = "seed"; AuthManager.shared.currentUser = .init(id: "A")
                SupabaseAPI.clock = parseISO8601("2026-09-08T10:00:00Z")!; await home.refreshFull()
                SupabaseAPI.wave = "old"; let key = "old|picks|" + current; SupabaseAPI.held = [key]
                let old = Task { if rolling { await home.refreshRollingHomeContent() } else { await home.refreshFull() } }
                await waitUntil { SupabaseAPI.waiters[key]?.isEmpty == false }
                switch change {
                case "cancel": old.cancel()
                case "account": AuthManager.shared.currentUser = .init(id: "B")
                case "date": SupabaseAPI.clock = parseISO8601("2026-09-09T10:00:00Z")!
                default: home.homeNonce += 1; SupabaseAPI.wave = "new"; await home.refreshFull()
                }
                let expected = home.published(), writes = HomeHeadlinesCache.writes
                SupabaseAPI.release(key); await old.value
                check(home.published() == expected && HomeHeadlinesCache.writes == writes, "Stale " + (rolling ? "rolling " : "full ") + change + " published")
            }
        }
        // Marquee enrichment is deliberately off the main load; it needs the same
        // request owner even if its parent full wave already returned successfully.
        do {
            let home = HomeFixture(); SupabaseAPI.clock = parseISO8601("2026-09-08T10:00:00Z")!
            AuthManager.shared.currentUser = .init(id: "A"); SupabaseAPI.produceMarquee = true
            SupabaseAPI.wave = "old"; SupabaseAPI.held = ["old|fact"]
            await home.refreshFull(); await waitUntil { SupabaseAPI.waiters["old|fact"]?.isEmpty == false }
            home.homeNonce += 1; SupabaseAPI.wave = "new"; SupabaseAPI.produceMarquee = false; await home.refreshFull()
            let expected = home.published(); SupabaseAPI.release("old|fact")
            for _ in 0..<200 { await Task.yield() }
            check(home.published() == expected, "Late marquee fact check overwrote newer story")
        }
        // Same-date rolling content supersedes a still-pending full story enrichment.
        do {
            let home = HomeFixture(); SupabaseAPI.produceMarquee = true; SupabaseAPI.wave = "old"
            SupabaseAPI.held = ["old|fact"]; await home.refreshFull()
            await waitUntil { SupabaseAPI.waiters["old|fact"]?.isEmpty == false }
            SupabaseAPI.produceMarquee = false; SupabaseAPI.wave = "rolling"; await home.refreshRollingHomeContent()
            let expected = home.published(); SupabaseAPI.release("old|fact")
            for _ in 0..<200 { await Task.yield() }
            check(home.published() == expected, "Full-load enrichment cannot replace newer rolling story")
        }
        // A healthy new slate with failed pick desks cannot relabel yesterday's
        // free prop or a two-days-old pick as current fallback content.
        do {
            let home = HomeFixture(); SupabaseAPI.clock = parseISO8601("2026-09-08T09:59:59Z")!
            SupabaseAPI.wave = "seed"; await home.refreshFull()
            check(home.freeProp != nil && home.yesterdayTopPick != nil && home.yesterdayTopProp != nil, "Seed prior-date fallback slots")
            SupabaseAPI.clock = parseISO8601("2026-09-08T10:00:00Z")!; home.homeNonce += 1
            SupabaseAPI.wave = "failed-date"; SupabaseAPI.transientProps = ["failed-date"]; SupabaseAPI.transientPicks = ["failed-date"]
            await home.refreshFull()
            check(home.loadedSlateDate == current && home.freeProp == nil && home.freePick == nil && home.yesterdayTopPick == nil && home.yesterdayTopProp == nil, "New slate rejects old-day fallback slots on transient source failures")
            SupabaseAPI.wave = "healthy"; await home.refreshFull()
            SupabaseAPI.wave = "failed-date"; await home.refreshFull()
            check(home.freeProp?.id == "healthy" && home.yesterdayTopPick?.id == "healthy", "Same-date transient fallbacks remain available")
            SupabaseAPI.transientProps = []; SupabaseAPI.transientPicks = []
        }
        // A -> B -> A with the same nonce still rejects the original request.
        do {
            let home = HomeFixture(); SupabaseAPI.wave = "old"; SupabaseAPI.held = ["old|props|" + current]
            let old = Task { await home.refreshFull() }
            await waitUntil { SupabaseAPI.waiters["old|props|" + current]?.isEmpty == false }
            AuthManager.shared.currentUser = .init(id: "B"); SupabaseAPI.wave = "B"; await home.refreshFull()
            AuthManager.shared.currentUser = .init(id: "A"); SupabaseAPI.wave = "new"; await home.refreshFull()
            let expected = home.published(); SupabaseAPI.release("old|props|" + current); await old.value
            check(home.published() == expected, "Returning account resurrected an obsolete full request")
        }
        // Private book content disappears synchronously on account/date mismatch,
        // stale requests cannot commit; failures retain same-owner rows, empty clears.
        do {
            let home = HomeFixture(); SupabaseAPI.wave = "seed"; await home.refreshMyTodayBets()
            check(home.myTodayBets.first?.id == "A:seed", "Owner sees their current bets")
            SupabaseAPI.wave = "old"; SupabaseAPI.held = ["old|bets"]
            let old = Task { await home.refreshMyTodayBets() }
            await waitUntil { SupabaseAPI.waiters["old|bets"]?.isEmpty == false }
            AuthManager.shared.currentUser = .init(id: "B")
            check(home.myTodayBets.isEmpty, "Previous account bets are never exposed while new task schedules")
            SupabaseAPI.wave = "new"; await home.refreshMyTodayBets()
            SupabaseAPI.release("old|bets"); await old.value
            check(home.myTodayBets.first?.id == "B:new", "Delayed A response cannot replace B's book")
            SupabaseAPI.wave = "failed"; SupabaseAPI.failedBets = ["failed"]; await home.refreshMyTodayBets()
            check(home.myTodayBets.first?.id == "B:new", "Book failure preserves only current owner's rows")
            SupabaseAPI.wave = "empty"; SupabaseAPI.emptyBets = ["empty"]; await home.refreshMyTodayBets()
            check(home.myTodayBets.isEmpty, "Successful empty book clears stale entries")
            AuthManager.shared.currentUser = nil; await home.refreshMyTodayBets(); check(home.myTodayBets.isEmpty, "Signed-out book is empty")
        }
        // A healthy rolling wave is still accepted and transient last-good behavior
        // remains; successful empty result responses replace the transport buffers.
        do {
            let home = HomeFixture(); SupabaseAPI.wave = "seed"; await home.refreshFull()
            SupabaseAPI.wave = "fresh"; await home.refreshRollingHomeContent()
            check(home.todayPicks.first?.id == "fresh" && home.recentGameResultsLastGood.first?.id == "fresh", "Healthy rolling wave updates board and buffers")
            SupabaseAPI.wave = "transient"; SupabaseAPI.transientResults = ["transient"]; await home.refreshRollingHomeContent()
            check(home.recentGameResultsLastGood.first?.id == "fresh" && home.sheetGameResults.first?.id == "fresh", "Same-session transient results retain last-good data")
            SupabaseAPI.wave = "empty"; SupabaseAPI.emptyResults = ["empty"]; await home.refreshRollingHomeContent()
            check(home.recentGameResultsLastGood.isEmpty && home.recentPropResultsLastGood.isEmpty, "Authoritative empty results replace transport buffers")
        }
        print("PASS: shipping full/rolling/MyBets requests reject stale owners across 20 awaited sources, 6AM, cancellation, account changes, timeout and late marquee enrichment")
    }
}
