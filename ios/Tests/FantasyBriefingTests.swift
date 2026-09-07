import Foundation

@main
struct FantasyBriefingTests {
    static func main() throws {
        let text = String(repeating: "A complete explanation. ", count: 40)
        let decision: [String: Any] = [
            "id": "bdl:38", "player_id": "38", "player_name": "Fixture Quarterback",
            "team": "BUF", "position": "QB", "role": "quarterback", "action": "START",
            "horizon": "next_game", "valid_until": "2026-09-13T17:00:00Z",
            "headline": "The next game matters", "why_now": text, "fit": "PPR managers",
            "risk": "The projection is uncertain", "watch_for": "Confirm the lineup",
            "formats": ["ppr"], "categories": ["quarterback"], "limitations": [],
            "opportunities": [["game_id": "1392225", "start_at": "2026-09-13T17:00:00Z", "opponent": "HOU", "home": false]],
            "evidence": [["id": "schedule", "label": "Week 1", "source": "Provider", "summary": "September 13 kickoff"]]
        ]
        var payload: [String: Any] = [
            "schema_version": 1, "date": "2026-09-07", "league": "NFL",
            "generated_at": "2026-09-07T16:05:00.000Z", "fetched_as_of": "2026-09-07T16:00:00.000Z",
            "expires_at": "2026-09-07T22:00:00.000Z", "window_start": "2026-09-09", "window_end": "2026-09-14",
            "week": 1, "coverage": ["complete": true], "decisions": [decision]
        ]
        func decode(_ payload: [String: Any]) throws -> FantasyBriefing {
            try JSONDecoder().decode(FantasyBriefing.self, from: JSONSerialization.data(withJSONObject: payload))
        }
        let briefing = try decode(payload)
        try briefing.validate(date: "2026-09-07", league: "NFL")
        precondition(briefing.decisions[0].why_now == text, "Full copy must survive decoding")
        precondition(briefing.isCurrent(now: FantasyBriefing.timestamp("2026-09-07T18:00:00Z")!))
        precondition(!briefing.isCurrent(now: FantasyBriefing.timestamp("2026-09-07T22:00:00Z")!))
        precondition(!briefing.isCurrent(now: FantasyBriefing.timestamp("2026-09-08T16:00:00Z")!))
        precondition(briefing.decisions[0].isActionable(now: FantasyBriefing.timestamp("2026-09-13T16:59:59Z")!))
        precondition(!briefing.decisions[0].isActionable(now: FantasyBriefing.timestamp("2026-09-13T17:00:00Z")!))
        precondition(briefing.decisions[0].nextGameLabel(now: FantasyBriefing.timestamp("2026-09-13T17:00:00Z")!) == nil)
        precondition(FantasyBriefing.today(now: FantasyBriefing.timestamp("2026-09-08T05:00:00Z")!) == "2026-09-08", "Fantasy uses calendar dates, even before the picks board rolls over")
        do { try briefing.validate(date: "2026-09-07", league: "MLB"); preconditionFailure("League isolation") } catch {}
        payload["decisions"] = [decision, decision]
        do { try decode(payload).validate(date: "2026-09-07", league: "NFL"); preconditionFailure("Duplicate identity") } catch {}
        payload["decisions"] = [decision]
        payload["coverage"] = ["complete": false]
        do { try decode(payload).validate(date: "2026-09-07", league: "NFL"); preconditionFailure("Incomplete collection") } catch {}
        payload["coverage"] = ["complete": true]
        payload["generated_at"] = "2026-09-08T03:35:00Z"
        payload["fetched_as_of"] = "2026-09-08T03:30:00Z"
        payload["expires_at"] = "2026-09-08T09:30:00Z"
        let afterMidnight = FantasyBriefing.timestamp("2026-09-08T04:15:00Z")!
        let overnightNFL = try decode(payload)
        precondition(overnightNFL.isCurrent(now: afterMidnight), "A current NFL week survives Eastern midnight")
        precondition(overnightNFL.canRetainAfterRefreshFailure(isTransient: true, now: afterMidnight), "A transient failure must retain the still-current prior-date NFL briefing")
        precondition(!overnightNFL.canRetainAfterRefreshFailure(isTransient: false, now: afterMidnight), "Invalid or unauthorized responses must not retain a briefing")
        precondition(!overnightNFL.canRetainAfterRefreshFailure(isTransient: true, now: FantasyBriefing.timestamp("2026-09-08T09:30:00Z")!), "A failed refresh cannot extend expiry")
        payload["window_end"] = "2026-09-07"
        let finishedWeek = try decode(payload)
        precondition(!finishedWeek.isCurrent(now: afterMidnight), "A finished NFL week cannot roll forward")
        payload["window_end"] = "2026-09-14"
        payload["league"] = "MLB"
        let priorMLB = try decode(payload)
        precondition(!priorMLB.isCurrent(now: afterMidnight), "MLB remains exact-date scoped")
        precondition(!priorMLB.canRetainAfterRefreshFailure(isTransient: true, now: afterMidnight), "MLB cannot retain yesterday's briefing through a network failure")

        // A valid player card must describe the exact next game. Provider IDs
        // alone do not disambiguate two games involving the same player today.
        var doubleheader = decision
        doubleheader["valid_until"] = "2026-09-07T23:00:00Z"
        doubleheader["opportunities"] = [
            ["game_id": "later", "start_at": "2026-09-08T01:00:00Z", "opponent": "BOS", "home": true],
            ["game_id": "first", "start_at": "2026-09-07T17:00:00Z", "opponent": "BOS", "home": true],
            ["game_id": "second", "start_at": "2026-09-07T23:00:00Z", "opponent": "BOS", "home": true],
        ]
        let secondGame = try JSONDecoder().decode(FantasyDecision.self, from: JSONSerialization.data(withJSONObject: doubleheader))
        let beforeSecond = FantasyBriefing.timestamp("2026-09-07T20:00:00Z")!
        precondition(secondGame.matchesPlayerCard(playerID: "38", gameID: "second", loadedDate: "2026-09-07", now: beforeSecond))
        precondition(!secondGame.matchesPlayerCard(playerID: "38", gameID: "first", loadedDate: "2026-09-07", now: beforeSecond), "An earlier game's pack must fall back to the full decision")
        precondition(!secondGame.matchesPlayerCard(playerID: "38", gameID: "later", loadedDate: "2026-09-07", now: beforeSecond), "A later game must not replace the decision's next opportunity")
        precondition(!secondGame.matchesPlayerCard(playerID: "39", gameID: "second", loadedDate: "2026-09-07", now: beforeSecond), "Exact player identity is required")
        precondition(!secondGame.matchesPlayerCard(playerID: "38", gameID: nil, loadedDate: "2026-09-07", now: beforeSecond), "A missing game ID is not a matchup match")
        precondition(!secondGame.matchesPlayerCard(playerID: "38", gameID: "second", loadedDate: "2026-09-06", now: beforeSecond), "Yesterday's prefetched card cannot route today's call")
        precondition(!secondGame.matchesPlayerCard(playerID: "38", gameID: "second", loadedDate: "2026-09-07", now: FantasyBriefing.timestamp("2026-09-07T23:00:00Z")!), "A call closed at first pitch cannot open a different game's pack")
        print("Fantasy native model: full copy, league/date isolation, expiry, overnight recovery and exact player/game routing passed")
    }
}
