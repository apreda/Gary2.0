// Appended to actual source by iosExactGameIdentity.test.js. The GaryPick,
// PicksValue, normalizer and async lineup reader are actual draft source.
final class IdentityFixtureProtocol: URLProtocol {
    static var rows: [[String: Any]] = []
    static var requests: [URL] = []
    static var ignoreFilters = false
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let url = request.url!
        precondition(url.host == "fixture.invalid", "No fixture may contact a real host")
        Self.requests.append(url)
        let query = URLComponents(url: url, resolvingAgainstBaseURL: false)!.queryItems ?? []
        let date = query.first(where: { $0.name == "date" })?.value?.replacingOccurrences(of: "eq.", with: "")
        let id = query.first(where: { $0.name == "game_id" })?.value?.replacingOccurrences(of: "eq.", with: "")
        let matches = Self.ignoreFilters ? Self.rows : Self.rows.filter { row in
            (row["date"] as? String) == date && (id == nil || (row["game_id"] as? String) == id)
        }
        let data = try! JSONSerialization.data(withJSONObject: matches)
        client!.urlProtocol(self, didReceive: HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: nil)!, cacheStoragePolicy: .notAllowed)
        client!.urlProtocol(self, didLoad: data)
        client!.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

func lineup(_ id: String, date: String = "2026-09-06") -> [String: Any] {
    ["date": date, "game_id": id, "game": "BOS @ CWS", "home_team": "CWS", "away_team": "BOS", "status": "confirmed",
     "payload": ["home": ["team": "CWS", "fielders": []], "away": ["team": "BOS", "fielders": []]]]
}

func verifyExactGameIdentity() async throws {
    var checks = 0
    func expect(_ condition: Bool, _ message: String) {
        precondition(condition, message)
        checks += 1
    }
    func rejects(_ operation: () throws -> Void, _ message: String) {
        var rejected = false
        do { try operation() } catch { rejected = true }
        expect(rejected, message)
    }
    _ = URLProtocol.registerClass(IdentityFixtureProtocol.self)
    defer { URLProtocol.unregisterClass(IdentityFixtureProtocol.self) }

    IdentityFixtureProtocol.rows = [lineup("99"), lineup("100"), lineup("99", date: "2026-08-01")]
    let first = await SupabaseAPI.fetchMlbFieldLineup(date: "2026-09-06", gameID: 99)
    let second = await SupabaseAPI.fetchMlbFieldLineup(date: "2026-09-06", gameID: 100)
    expect(first?.game_id?.value == 99, "First doubleheader game keeps its own lineup")
    expect(second?.game_id?.value == 100, "Second game cannot borrow the same-home first lineup")
    let historical = await SupabaseAPI.fetchMlbFieldLineup(date: "2026-08-01", gameID: 99)
    expect(historical?.date == "2026-08-01", "Historical page keeps the game's stored date")
    for url in IdentityFixtureProtocol.requests {
        let query = URLComponents(url: url, resolvingAgainstBaseURL: false)!.queryItems!
        expect(query.contains { $0.name == "game_id" }, "Every read pins game_id")
        expect(!query.contains { $0.name == "home_team" }, "There is no same-home fallback")
    }
    let beforeMissing = IdentityFixtureProtocol.requests.count
    for (date, id) in [("2026-09-06" as String?, nil as Int?), (nil, 99), ("2026-02-30", 99), ("2026-09-06", 0), ("2026-09-06", -1)] {
        let result = await SupabaseAPI.fetchMlbFieldLineup(date: date, gameID: id)
        expect(result == nil, "Missing/invalid identity remains unavailable")
    }
    expect(IdentityFixtureProtocol.requests.count == beforeMissing, "Missing identity makes no request")
    // A provider/cache contract violation cannot satisfy the requested game.
    IdentityFixtureProtocol.ignoreFilters = true
    for rows in [[lineup("99")], [lineup("100", date: "2026-08-01")], [lineup("100"), lineup("100")], []] {
        IdentityFixtureProtocol.rows = rows
        let result = await SupabaseAPI.fetchMlbFieldLineup(date: "2026-09-06", gameID: 100)
        expect(result == nil, "Wrong id/date, duplicate and empty rows fail closed")
    }
    let lateGame = ISO8601DateFormatter().date(from: "2026-09-07T02:00:00Z")!
    expect(ExactGameIdentity.easternDate(of: lateGame) == "2026-09-06", "Late Eastern first pitch retains its real date")
    expect(ExactGameIdentity.easternDate(of: nil) == nil, "Missing commencement never becomes today")

    let base: [String: Any] = ["pick_id": "weekly-ticket", "league": "NFL", "pick": "Bills +3.5", "homeTeam": "Jets", "awayTeam": "Bills", "commence_time": "2026-09-09T23:00:00Z", "spread": "3.5", "moneylineHome": "-110", "sportsbook_odds": [["book": "Fixture", "spread": "3.5", "spread_odds": -110, "ml": 120]]]
    func parsed(_ additions: [String: Any], direct: Bool) throws -> [GaryPick] {
        var pick = base.merging(additions) { _, incoming in incoming }
        if direct {
            // Typed-array transport must already satisfy the existing betting
            // number model; the production picks::text route normalizes strings.
            pick["spread"] = 3.5
            pick["moneylineHome"] = -110
            pick["sportsbook_odds"] = [["book": "Fixture", "spread": 3.5, "spread_odds": "-110", "ml": "+120"]]
        }
        let pickData = try JSONSerialization.data(withJSONObject: [pick])
        let picks: Any = direct ? [pick] : String(data: pickData, encoding: .utf8)!
        let rowData = try JSONSerialization.data(withJSONObject: ["week_start": "2026-09-08", "week_number": 1, "season": 2026, "picks": picks])
        let row = try JSONDecoder().decode(WeeklyNFLPicksRow.self, from: rowData)
        return try SupabaseAPI.parsePicksRow(row.picks)
    }
    for direct in [true, false] {
        for alias: Any in [42, "42"] {
            let pick = try parsed(["bdl_game_id": alias], direct: direct).first!
            expect(pick.game_id == 42, "Typed/direct and stringified weekly NFL retain provider ID")
            expect(pick.spread == 3.5, "Existing betting-number normalization remains intact")
            expect(pick.sportsbook_odds?.first?.spread_odds == "-110", "Existing sportsbook odds normalization remains intact")
        }
        expect(try parsed(["game_id": 42, "bdl_game_id": 42], direct: direct).first?.game_id == 42, "Equal aliases resolve once")
        rejects({ _ = try parsed(["game_id": 42, "bdl_game_id": 43], direct: direct) }, "Conflicting IDs reject the source")
        for invalid: Any in [true, 2.5, -1, 0, "bad", "9007199254740992"] {
            rejects({ _ = try parsed(["bdl_game_id": invalid], direct: direct) }, "Invalid provider aliases cannot be coerced")
        }
    }
    let manual = GaryPick.from(dict: base.merging(["bdl_game_id": "42"]) { _, new in new })
    expect(manual?.game_id == 42, "Manual dictionary fallback has the same alias contract")
    expect(GaryPick.from(dict: base.merging(["game_id": 42, "bdl_game_id": 43]) { _, new in new }) == nil, "Manual dictionary rejects conflicting aliases")
    expect(GaryPick.from(dict: base.merging(["game_id": true]) { _, new in new }) == nil, "Boolean is not provider ID one")
    expect(try parsed([:], direct: false).first?.game_id == nil, "Legacy missing ID stays missing without an invented matchup identity")
    print("PASS \(checks) actual Swift identity checks; all lineup HTTP intercepted; no app build or production access")
}

do { try await verifyExactGameIdentity() }
catch { print("FAIL actual Swift identity fixture: \(error)"); exit(1) }
