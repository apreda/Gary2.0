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
enum SupabaseAPI { static func todayEST() -> String { "2026-09-07" } }
func parseISO8601(_ text: String) -> Date? { ISO8601DateFormatter().date(from: text) }
func teamAbbrevFromName(_ name: String, league: String?) -> String {
    ["Atlanta Braves": "ATL", "Philadelphia Phillies": "PHI", "New York Mets": "NYM", "Miami Marlins": "MIA"][name] ?? name
}

// ACTUAL_CACHE_SOURCE

final class FixtureProtocol: URLProtocol {
    static var handle: (URL) -> (Int, [String: Any]) = { _ in (500, [:]) }
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
    static func game(_ pk: Int, _ hour: String, final: Bool = false, away: String = "Atlanta Braves", home: String = "Philadelphia Phillies") -> [String: Any] {
        ["gamePk": pk, "gameDate": "2026-09-07T\(hour):00:00Z",
         "status": ["abstractGameState": final ? "Final" : "Live"],
         "teams": ["away": ["team": ["name": away]], "home": ["team": ["name": home]]]]
    }
    static func player(_ name: String, hits: Int?, atBats: Int = 4) -> [String: Any] {
        var batting: [String: Any] = ["atBats": atBats, "runs": 0, "rbi": 0, "baseOnBalls": 0,
                                      "doubles": 0, "triples": 0, "homeRuns": 0]
        if let hits { batting["hits"] = hits }
        return ["person": ["fullName": name], "stats": ["batting": batting]]
    }
    static func box(_ players: [[String: Any]]) -> [String: Any] {
        ["teams": ["away": ["players": Dictionary(uniqueKeysWithValues: players.enumerated().map { ("ID\($0.offset)", $0.element) })],
                   "home": ["players": [String: Any]()]]]
    }
    @MainActor static func main() async {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [FixtureProtocol.self]
        let session = URLSession(configuration: config)
        var day = "2026-09-07", final = false, failBoxes = false
        var schedules = 0, requested: [Int] = []
        FixtureProtocol.handle = { url in
            if url.path.hasSuffix("schedule") {
                schedules += 1
                return (200, ["dates": [["games": [game(101, "17", final: final), game(102, "23", final: final),
                    game(103, "18", final: final, away: "New York Mets", home: "Miami Marlins")]]]])
            }
            let pk = Int(url.pathComponents[url.pathComponents.count - 2])!
            requested.append(pk)
            if failBoxes { return (503, box([player("Ronald Acuña Jr.", hits: 99)])) }
            let hits = pk == 101 ? (final ? 2 : 1) : 3
            return (200, box([player("Ronald Acuña Jr.", hits: hits), player("Matt Olson", hits: 0),
                              player("Unknown Stat", hits: nil), player("Did Not Play", hits: 0, atBats: 0)]))
        }
        let cache = LivePropStatsCache(session: session, slateDay: { day }, automaticallyPoll: false)
        let early = PropPick(game_id: 1, player: "Ronald Acuna Jr", matchup: "ATL @ PHI", commence_time: "2026-09-07T17:00:00Z", prop: "hits")
        var late = early; late.game_id = 2; late.commence_time = "2026-09-07T23:00:00Z"
        LiveScoreCache.shared.statuses = [1: LiveScore(isLive: true, isFinal: false), 2: LiveScore(isLive: true, isFinal: false)]
        cache.track(early); cache.track(late)
        await cache.pollOnce()
        precondition(cache.observation(for: early)?.line.hits == 1, "First doubleheader game")
        precondition(cache.observation(for: late)?.line.hits == 3, "Second doubleheader game")
        precondition(cache.observation(for: early)?.isFinal == false)
        precondition(Set(requested) == Set([101, 102]))

        var ambiguous = early; ambiguous.game_id = 4; ambiguous.commence_time = "2026-09-07T20:00:00Z"
        var laterRegistration = early; laterRegistration.game_id = 3; laterRegistration.matchup = "NYM @ MIA"
        LiveScoreCache.shared.statuses[3] = LiveScore(isLive: true, isFinal: false)
        LiveScoreCache.shared.statuses[4] = LiveScore(isLive: true, isFinal: false)
        cache.track(ambiguous); cache.track(laterRegistration)
        await cache.pollOnce()
        precondition(cache.observation(for: ambiguous) == nil, "Ambiguous game must not guess")
        precondition(cache.observation(for: laterRegistration)?.line.hits == 3, "Late registration uses cached schedule")
        precondition(schedules == 1, "Reuse one slate schedule across players and games")

        LiveScoreCache.shared.statuses[1] = LiveScore(isLive: false, isFinal: true)
        final = true; failBoxes = true
        await cache.pollOnce()
        precondition(cache.observation(for: early)?.isFinal == false, "A scoreboard final cannot grade an old live line")
        precondition(cache.observation(for: early)?.line.hits == 1, "Reject even valid JSON from failed HTTP responses")
        failBoxes = false
        await cache.pollOnce()
        precondition(cache.observation(for: early)?.isFinal == true)
        precondition(cache.observation(for: early)?.line.hits == 2, "Read final box before final grading")
        let priorReads = requested.filter { $0 == 101 }.count
        await cache.pollOnce()
        precondition(requested.filter { $0 == 101 }.count == priorReads, "Settled final is not fetched every tick")

        var latePlayer = early; latePlayer.player = "Matt Olson"
        cache.track(latePlayer)
        await cache.pollOnce()
        precondition(cache.observation(for: latePlayer)?.line.hits == 0, "A newly visible player is fetched even after final")
        precondition(cache.observation(for: latePlayer)?.line.runs == 0, "Observed zero remains a real zero")
        var missing = early; missing.player = "Unknown Stat"
        var dnp = early; dnp.player = "Did Not Play"
        cache.track(missing); cache.track(dnp)
        await cache.pollOnce()
        precondition(cache.observation(for: missing)?.line.hits == nil, "Missing stats must not become zero")
        precondition(cache.observation(for: missing)?.line.value(forMarket: "hits_runs_rbis") == nil)
        precondition(cache.observation(for: dnp) == nil, "DNP is not a losing over")
        precondition(cache.observation(for: early)?.line.value(forMarket: "pitcher_hits_allowed") == nil)
        precondition(cache.observation(for: early)?.line.value(forMarket: "pitcher_earned_runs") == nil)
        precondition(cache.observation(for: early)?.line.value(forMarket: "hits 1.5") == 2)
        var wrongLeague = early; wrongLeague.effectiveLeague = "NFL"
        precondition(cache.observation(for: wrongLeague) == nil)

        day = "2026-09-08"
        precondition(cache.observation(for: early) == nil, "Yesterday cannot appear on today's slate before poll")
        await cache.pollOnce()
        precondition(cache.lines.isEmpty, "Rollover clears state")
        print("Live prop HTTP regressions passed")
    }
}
