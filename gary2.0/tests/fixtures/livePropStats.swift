import Foundation
import Combine

// Only the surrounding app contracts are stubbed. The cache is extracted
// unchanged from SharedStores.swift, including its real JSON/HTTP handling.
struct PropPick {
    var game_id: Int?, player: String?, matchup: String?, commence_time: String?, prop: String?
    var effectiveLeague: String? = "MLB"
}
struct LiveScore { let isLive: Bool, isFinal: Bool }
@MainActor final class LiveScoreCache {
    static let shared = LiveScoreCache()
    var statuses: [Int: LiveScore] = [:]
    func status(forGameId id: Int?, league: String?) -> LiveScore? { id.flatMap { statuses[$0] } }
}
struct ExactGameIdentity {
    let date: String, gameID: Int
    init?(date: String?, gameID: Int?) {
        guard let date, let gameID, gameID > 0 else { return nil }
        self.date = date; self.gameID = gameID
    }
}
enum SupabaseAPI {
    static func todayEST() -> String { "2026-09-07" }
    private static func buildURL(table: String, query: [URLQueryItem]) -> URL {
        var parts = URLComponents(string: "https://fixture.invalid/rest/v1/\(table)")!
        parts.queryItems = query; return parts.url!
    }
    private static func makeRequest(url: URL) -> URLRequest { URLRequest(url: url) }
    // ACTUAL_REQUEST_SOURCE
}
func parseISO8601(_ text: String) -> Date? { ISO8601DateFormatter().date(from: text) }
func teamAbbrevFromName(_ name: String, league: String?) -> String {
    ["Atlanta Braves": "ATL", "Philadelphia Phillies": "PHI", "New York Mets": "NYM", "Miami Marlins": "MIA"][name] ?? name
}

// ACTUAL_CACHE_SOURCE

final class FixtureProtocol: URLProtocol {
    static var handle: (URL) -> (Int, Any) = { _ in (500, []) }
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let (status, payload) = Self.handle(request.url!)
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: try! JSONSerialization.data(withJSONObject: payload))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

@main struct LivePropChecks {
    static func player(_ name: String, id: Int, hits: Int?) -> [String: Any] {
        var row: [String: Any] = ["player_id": id, "name": name, "runs": 0, "rbi": 0, "walks": 0,
                                  "home_runs": 0, "total_bases": hits ?? 0]
        if let hits { row["hits"] = hits }
        return row
    }
    @MainActor static func main() async {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [FixtureProtocol.self]
        let session = URLSession(configuration: config)
        var day = "2026-09-07", final = false, fail = false
        var clock = parseISO8601("2026-09-07T23:30:00Z")!
        var requested: [Int] = [], responseOverride: ((Int) -> Any)?
        func box(_ gameID: Int) -> [[String: Any]] {
            let hits = gameID == 1 ? (final ? 2 : 1) : 3
            return [["date": day, "game_id": String(gameID), "source": "balldontlie", "is_final": final,
                     "fetched_at": ISO8601DateFormatter().string(from: clock),
                     "lines": [player("Ronald Acuña Jr.", id: 10, hits: hits), player("Matt Olson", id: 11, hits: 0),
                               player("Unknown Stat", id: 12, hits: nil)]]]
        }
        FixtureProtocol.handle = { url in
            precondition(url.host == "fixture.invalid", "No direct league/provider requests from the app")
            precondition(url.path == "/rest/v1/mlb_live_batting")
            let query = URLComponents(url: url, resolvingAgainstBaseURL: false)!.queryItems!
            precondition(query.first { $0.name == "date" }?.value == "eq.\(day)")
            precondition(query.first { $0.name == "limit" }?.value == "2")
            let gameID = Int(query.first { $0.name == "game_id" }!.value!.replacingOccurrences(of: "eq.", with: ""))!
            requested.append(gameID)
            if fail { return (503, box(gameID)) }
            return (200, responseOverride?(gameID) ?? box(gameID))
        }
        let cache = LivePropStatsCache(session: session, slateDay: { day }, automaticallyPoll: false, now: { clock })
        let early = PropPick(game_id: 1, player: "Ronald Acuna Jr", matchup: "ATL @ PHI", commence_time: "2026-09-07T17:00:00Z", prop: "hits")
        var late = early; late.game_id = 2; late.commence_time = "2026-09-07T23:00:00Z"
        LiveScoreCache.shared.statuses = [1: LiveScore(isLive: true, isFinal: false), 2: LiveScore(isLive: true, isFinal: false)]
        cache.track(early); cache.track(late)
        await cache.pollOnce()
        precondition(cache.observation(for: early)?.line.hits == 1, "First doubleheader game")
        precondition(cache.observation(for: late)?.line.hits == 3, "Second doubleheader game")
        precondition(cache.observation(for: early)?.isFinal == false)
        precondition(Set(requested) == Set([1, 2]), "Only exact BDL IDs; no alternate MLB gamePk join")
        var notifications = 0
        let subscription = cache.$lines.dropFirst().sink { _ in notifications += 1 }
        clock = clock.addingTimeInterval(181)
        precondition(cache.observation(for: early) == nil, "An old live observation expires")
        fail = true
        await cache.pollOnce()
        precondition(cache.lines.isEmpty, "Failed polling removes expired live values")
        precondition(notifications > 0, "Expiry notifies the observing prop row without unrelated UI activity")
        subscription.cancel()
        fail = false
        await cache.pollOnce()
        precondition(cache.observation(for: early)?.line.hits == 1)

        LiveScoreCache.shared.statuses[1] = LiveScore(isLive: false, isFinal: true)
        final = true; fail = true
        await cache.pollOnce()
        precondition(cache.observation(for: early)?.isFinal == false, "Scoreboard final cannot grade an old live line")
        fail = false
        await cache.pollOnce()
        precondition(cache.observation(for: early)?.isFinal == true)
        precondition(cache.observation(for: early)?.line.hits == 2, "Read final cache before final grading")
        let priorReads = requested.filter { $0 == 1 }.count
        await cache.pollOnce()
        precondition(requested.filter { $0 == 1 }.count == priorReads, "Settled final is not fetched every tick")

        var latePlayer = early; latePlayer.player = "Matt Olson"
        cache.track(latePlayer); await cache.pollOnce()
        precondition(cache.observation(for: latePlayer)?.line.hits == 0, "Newly visible player is fetched after final")
        var missing = early; missing.player = "Unknown Stat"
        var dnp = early; dnp.player = "Did Not Play"
        cache.track(missing); cache.track(dnp); await cache.pollOnce()
        precondition(cache.observation(for: missing)?.line.hits == nil, "Missing stats do not become zero")
        precondition(cache.observation(for: missing)?.line.value(forMarket: "hits_runs_rbis") == nil)
        precondition(cache.observation(for: dnp) == nil, "Roster-only DNP is absent from the published cache")
        precondition(cache.observation(for: early)?.line.value(forMarket: "pitcher_hits_allowed") == nil)
        precondition(cache.observation(for: early)?.line.value(forMarket: "hits 1.5") == 2)
        var wrongLeague = early; wrongLeague.effectiveLeague = "NFL"
        precondition(cache.observation(for: wrongLeague) == nil)

        var foreign = early; foreign.game_id = 4
        LiveScoreCache.shared.statuses[4] = LiveScore(isLive: true, isFinal: false)
        let foreignCache = LivePropStatsCache(session: session, slateDay: { day }, automaticallyPoll: false, now: { clock })
        foreignCache.track(foreign)
        for changed in [["game_id": "1"], ["date": "2026-09-06"], ["source": "unknown"], ["fetched_at": "2026-09-08T23:00:00Z"]] {
            responseOverride = { id in [box(id)[0].merging(changed) { _, value in value }] }
            await foreignCache.pollOnce()
            precondition(foreignCache.observation(for: foreign) == nil, "Foreign/invalid cache snapshot fails closed")
        }
        responseOverride = { id in [box(id)[0], box(id)[0]] }
        await foreignCache.pollOnce()
        precondition(foreignCache.observation(for: foreign) == nil, "Duplicate cache rows cannot satisfy one exact game")
        responseOverride = { id in
            var row = box(id)[0]; row["is_final"] = false; row["fetched_at"] = "2026-09-07T21:00:00Z"; return [row]
        }
        await foreignCache.pollOnce()
        precondition(foreignCache.observation(for: foreign) == nil, "Stale live cache is unavailable")
        responseOverride = { id in
            var row = box(id)[0]; row["lines"] = [player("Ronald Acuna Jr", id: 10, hits: 2), player("Ronald Acuña Jr", id: 11, hits: 3)]; return [row]
        }
        await foreignCache.pollOnce()
        precondition(foreignCache.observation(for: foreign) == nil, "Different players with the same normalized name remain ambiguous")

        day = "2026-09-08"
        precondition(cache.observation(for: early) == nil, "Yesterday cannot appear before the next poll")
        await cache.pollOnce(); precondition(cache.lines.isEmpty, "Rollover clears state")
        print("Live prop HTTP regressions passed")
    }
}
