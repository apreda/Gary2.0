import Foundation

@main
struct HubJudgmentTests {
    static func main() throws {
        let now = HubJudgment.timestamp("2026-09-08T16:00:00Z")!
        let sourceKey = "heat_check|100|44|8"
        let original = "José has a .320 average. [form][today] [unknown]"
        let payload: [String: Any] = [
            "schema_version": 1, "status": "ready", "date": "2026-09-08", "league": "mlb",
            "game_id": "100", "primary_source_key": sourceKey,
            "take": "A matchup worth a closer look", "explanation": original,
            "full_case": String(repeating: original, count: 50),
            "counterargument": "The sample is limited.", "watch_for": "Confirm the starting lineup.",
            "critical_condition": "Only if he starts.", "what_changed": "The starter changed.",
            "horizon": "pregame", "as_of": "2026-09-08T15:00:00.000Z", "valid_until": "2026-09-08T23:00:00Z",
            "supporting_evidence_ids": ["form", "today"], "counter_evidence_ids": ["form"],
            "supersedes_source_keys": [sourceKey], "prominence": "standard",
            "evidence": [
                ["id": "form", "label": "Recent form", "summary": "Observed performance", "source": "Provider", "game_id": "100", "as_of": "2026-09-08T14:00:00Z"],
                ["id": "today", "label": "Today's matchup", "summary": "Confirmed opponent", "source": "Provider", "game_id": "100", "as_of": "2026-09-08T15:00:00Z"]
            ]
        ]
        func decode(_ object: Any) throws -> HubJudgment {
            try JSONDecoder().decode(HubJudgment.self, from: JSONSerialization.data(withJSONObject: object, options: .fragmentsAllowed))
        }
        func valid(_ value: HubJudgment, at clock: Date? = nil, league: String = "MLB", date: String = "2026-09-08", game: String? = "100", key: String? = "heat_check|100|44|8") -> Bool {
            value.isCurrent(league: league, date: date, gameID: game, sourceKey: key, now: clock ?? now)
        }
        let read = try decode(payload)
        precondition(valid(read))
        precondition(read.displayText(original) == "José has a .320 average. [1, 2] [unknown]")
        precondition(read.explanation == original && read.full_case.count == original.count * 50)
        precondition(read.displayText("[today] [form][unknown] [Today]") == "[2] [1][unknown] [Today]")
        precondition(read.critical_condition == "Only if he starts." && read.what_changed == "The starter changed.")
        let cached = try JSONDecoder().decode(HubJudgment.self, from: JSONEncoder().encode(read))
        precondition(valid(cached) && cached.full_case == read.full_case)
        for game in [nil, "", "101", "0100"] as [String?] { precondition(!valid(read, game: game)) }
        for key in [nil, "", "heat_check|101|44|8", "heat_check|100|45|8"] as [String?] { precondition(!valid(read, key: key)) }
        precondition(!valid(read, league: "NFL") && !valid(read, date: "2026-09-09"))
        precondition(!valid(read, at: HubJudgment.timestamp("2026-09-08T23:00:00Z")!))
        precondition(!valid(read, at: HubJudgment.timestamp("2026-09-08T14:00:00Z")!))
        for (key, value) in [
            ("status", "context_changed"), ("status", "context_unavailable"), ("status", "superseded"),
            ("schema_version", 2), ("full_case", "  "), ("horizon", "week"),
            ("valid_until", "2026-09-08"), ("take", ["invalid": true]),
            ("supporting_evidence_ids", ["form"]), ("supporting_evidence_ids", ["form", "missing"]),
            ("counter_evidence_ids", ["missing"]), ("evidence", []), ("evidence", ["invalid"])
        ] as [(String, Any)] {
            var invalid = payload; invalid[key] = value
            let rejected = try decode(invalid)
            precondition(!valid(rejected), "Invalid \(key) must not hide the original research")
        }
        for bad in [NSNull(), "unsupported", ["future_schema": true]] as [Any] {
            let rejected = try decode(bad)
            precondition(!valid(rejected), "Malformed additive data preserves the source row")
        }
        var wrongEvidence = payload
        var sources = payload["evidence"] as! [[String: Any]]
        sources[1]["game_id"] = "101"; wrongEvidence["evidence"] = sources
        let wrongGame = try decode(wrongEvidence)
        precondition(!valid(wrongGame))
        sources[1]["game_id"] = "100"; sources[1]["id"] = "form"; wrongEvidence["evidence"] = sources
        let duplicate = try decode(wrongEvidence)
        precondition(!valid(duplicate))
        let future = "2026-09-08T23:00:00Z"
        precondition(HubJudgment.gameIsUpcoming(startsAt: future, status: "scheduled", now: now))
        for status in ["STATUS_FINAL_OVERTIME", "STATUS_IN_PROGRESS", "live", "delayed", "postponed", "suspended", "cancelled"] {
            precondition(!HubJudgment.gameIsUpcoming(startsAt: future, status: status, now: now))
        }
        for start in [nil, "not-a-time", "2026-09-08", "2026-09-08T16:00:00Z"] as [String?] {
            precondition(!HubJudgment.gameIsUpcoming(startsAt: start, status: "scheduled", now: now))
        }
        precondition(HubJudgment.sourceKey(category: "heat_check", gameID: "100", playerID: "44", teamID: "8") == sourceKey)
        precondition(HubJudgment.sourceKey(category: "heat_check", gameID: nil, playerID: "44", teamID: "8") == nil)
        typealias Candidate = HubJudgmentSelection.Candidate
        typealias Game = HubJudgmentSelection.Game
        let candidate = Candidate(index: 10, league: "MLB", date: "2026-09-08", gameID: "100", sourceKey: sourceKey, judgment: read)
        let game = Game(league: "MLB", gameID: "100", startsAt: future, status: "scheduled")
        func selected(_ games: [Game], _ candidates: [Candidate] = [candidate]) -> [Int: HubJudgment] {
            HubJudgmentSelection.current(candidates: candidates, games: games, date: "2026-09-08", now: now)
        }
        precondition(selected([game])[10] === read)
        precondition(selected([]).isEmpty && selected([game, game]).isEmpty, "Missing or ambiguous schedule identity cannot authorize a judgment")
        for other in [Game(league: "MLB", gameID: "101", startsAt: future, status: "scheduled"),
                      Game(league: "NFL", gameID: "100", startsAt: future, status: "scheduled"),
                      Game(league: "MLB", gameID: "100", startsAt: future, status: "live")] {
            precondition(selected([other]).isEmpty)
        }
        let suppressed = HubJudgmentSelection.suppressedKeys(Array(selected([game]).values))
        precondition(suppressed.contains(HubJudgmentSelection.suppressionKey(league: "MLB", date: "2026-09-08", gameID: "100", sourceKey: sourceKey)!))
        for (league, date, game) in [("NFL", "2026-09-08", "100"), ("MLB", "2026-09-09", "100"), ("MLB", "2026-09-08", "101")] {
            precondition(!suppressed.contains(HubJudgmentSelection.suppressionKey(league: league, date: date, gameID: game, sourceKey: sourceKey)!))
        }
        precondition(HubJudgmentSelection.suppressedKeys(Array(selected([]).values)).isEmpty, "An inaccessible judgment must never hide the underlying research")
        let unjudged = Candidate(index: 0, league: "MLB", date: "2026-09-08", gameID: "100", sourceKey: sourceKey, judgment: nil)
        precondition(HubJudgmentSelection.sourceChoices([unjudged, candidate]).keys.sorted() == [10], "An original row cannot discard its ready upgraded copy")
        var newerPayload = payload
        newerPayload["as_of"] = "2026-09-08T15:30:00Z"
        newerPayload["status"] = "context_unavailable"
        newerPayload["valid_until"] = "2026-09-08T15:30:00Z"
        let invalidated = try decode(newerPayload)
        let invalidCandidate = Candidate(index: 11, league: "MLB", date: "2026-09-08", gameID: "100", sourceKey: sourceKey, judgment: invalidated)
        let newerChoice = HubJudgmentSelection.sourceChoices([candidate, invalidCandidate])
        precondition(newerChoice.keys.sorted() == [11] && newerChoice[11] == true, "Newer invalidation must reach the game selector")
        precondition(selected([game], [candidate, invalidCandidate]).isEmpty)
        newerPayload["status"] = "ready"; newerPayload["valid_until"] = future
        newerPayload["take"] = "The revised current read"
        let revised = try decode(newerPayload)
        let revisedCandidate = Candidate(index: 12, league: "MLB", date: "2026-09-08", gameID: "100", sourceKey: sourceKey, judgment: revised)
        precondition(selected([game], [candidate, revisedCandidate]).keys.sorted() == [12])
        var tiedPayload = payload; tiedPayload["take"] = "A conflicting read at the same check time"
        let tied = try decode(tiedPayload)
        let tiedCandidate = Candidate(index: 13, league: "MLB", date: "2026-09-08", gameID: "100", sourceKey: sourceKey, judgment: tied)
        precondition(HubJudgmentSelection.sourceChoices([candidate, tiedCandidate])[10] == false)
        precondition(selected([game], [candidate, tiedCandidate]).isEmpty)
        var blockedCandidate = revisedCandidate; blockedCandidate.blocked = true
        precondition(selected([game], [candidate, blockedCandidate]).isEmpty, "Latest conflicting source cannot revive an older game take")
        var differentAnchorPayload = payload
        differentAnchorPayload["primary_source_key"] = "starter_form|100|55|9"
        differentAnchorPayload["as_of"] = "2026-09-08T15:45:00Z"
        let differentAnchor = try decode(differentAnchorPayload)
        let reanchored = Candidate(index: 14, league: "MLB", date: "2026-09-08", gameID: "100", sourceKey: "starter_form|100|55|9", judgment: differentAnchor)
        precondition(selected([game], [candidate, reanchored]).keys.sorted() == [14], "Only the newest reachable anchor can suppress source rows")
        let rawMeasurement = try JSONDecoder().decode(HubEvidenceValue.self, from: Data(#"{"pitching_era":3.123456,"name":"José","lineup":[1,2],"confirmed":true}"#.utf8))
        if case .object(let facts) = rawMeasurement {
            precondition(facts["pitching_era"]?.text == "3.123456" && facts["confirmed"]?.text == "Yes")
        } else { preconditionFailure("Structured cited data lost") }
        print("Hub judgment model passed: full copy, citations, exact source/game/date, malformed fallback, invalidation, expiry and schedule state")
    }
}
