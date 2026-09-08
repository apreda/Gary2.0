import Foundation

@main
@MainActor
struct GaryPushRouterFixture {
    static func instant(_ text: String) -> Date { ISO8601DateFormatter().date(from: text)! }

    static func main() {
        precondition(SupabaseAPI.todayEST(now: instant("2026-09-10T09:59:59Z")) == "2026-09-09")
        precondition(SupabaseAPI.todayEST(now: instant("2026-09-10T10:00:00Z")) == "2026-09-10")
        precondition(SupabaseAPI.todayEST(now: instant("2026-11-01T10:59:59Z")) == "2026-10-31")
        precondition(SupabaseAPI.todayEST(now: instant("2026-11-01T11:00:00Z")) == "2026-11-01")
        precondition(GaryPushIntent.parse(["destination": "book", "book_scope": "you"]) == nil)
        let now = instant("2026-09-09T23:30:00Z")
        let accountA = UUID(uuidString: "A0000000-0000-4000-8000-000000000001")!
        let accountB = UUID(uuidString: "B0000000-0000-4000-8000-000000000002")!
        let game: [AnyHashable: Any] = [
            "destination": "picks", "league": "NFL", "game_id": "9001",
            "game_date": "2026-09-09", "matchup": "Away @ Home",
            "url": "https://untrusted.example/never-open", "gcm.message_id": "fixture-game"
        ]
        let parsed = GaryPushIntent.parse(game)!
        precondition(parsed.resolve(nativeSlateDate: "2026-09-09", currentAccountID: nil) == .nativeGame(
            .init(league: "NFL", gameID: 9001, date: "2026-09-09", matchup: "Away @ Home")))
        // Production supplies the actual native slate date (6 AM ET rollover).
        precondition(parsed.resolve(nativeSlateDate: SupabaseAPI.todayEST(now: instant("2026-09-10T09:59:59Z")), currentAccountID: nil) ==
               .nativeGame(.init(league: "NFL", gameID: 9001, date: "2026-09-09", matchup: "Away @ Home")))
        precondition(parsed.resolve(nativeSlateDate: "2026-09-10", currentAccountID: nil) ==
               .webArchive(URL(string: "https://www.betwithgary.ai/picks/nfl/2026-09-09")!))

        // Missing dates never focus today's same matchup or provider id.
        var undated = game; undated.removeValue(forKey: "game_date")
        precondition(GaryPushIntent.parse(undated)!.resolve(nativeSlateDate: "2026-09-09", currentAccountID: nil) ==
               .webArchive(URL(string: "https://www.betwithgary.ai/archive")!))
        var missingID = game; missingID.removeValue(forKey: "game_id")
        precondition(GaryPushIntent.parse(missingID)!.resolve(nativeSlateDate: "2026-09-09", currentAccountID: nil) ==
               .webArchive(URL(string: "https://www.betwithgary.ai/picks/nfl/2026-09-09")!))
        var retired = game; retired["league"] = "NHL"
        precondition(GaryPushIntent.parse(retired)!.resolve(nativeSlateDate: "2026-09-09", currentAccountID: nil) ==
               .webArchive(URL(string: "https://www.betwithgary.ai/picks/nhl/2026-09-09")!))
        var noLeague = game; noLeague.removeValue(forKey: "league")
        precondition(GaryPushIntent.parse(noLeague)!.resolve(nativeSlateDate: "2026-09-09", currentAccountID: nil) ==
               .webArchive(URL(string: "https://www.betwithgary.ai/archive/2026-09-09")!))
        precondition(GaryPushIntent.parse(["destination": "picks"]) == .picksOverview)

        for value: Any in ["-1", "0", "1.5", "001", "9007199254740992", true, 4, "A123", "1\n"] {
            var bad = game; bad["game_id"] = value
            precondition(GaryPushIntent.parse(bad) == nil, "Rejected bad id: \(value)")
        }
        for value in ["2026-02-30", "2026-2-09", "2026-09-09/../../account", "2026-13-01", "2026-09-09T00:00:00Z"] {
            var bad = game; bad["game_date"] = value
            precondition(GaryPushIntent.parse(bad) == nil, "Rejected bad date: \(value)")
        }
        precondition(GaryPushIntent.validDate("2024-02-29"))
        precondition(!GaryPushIntent.validDate("2025-02-29"))
        var badLeague = game; badLeague["league"] = "WNBA"
        precondition(GaryPushIntent.parse(badLeague) == nil)
        var badDestination = game; badDestination["destination"] = "web"
        precondition(GaryPushIntent.parse(badDestination) == nil)
        var badMatchup = game; badMatchup["matchup"] = "A\nB"
        precondition(GaryPushIntent.parse(badMatchup) == nil)
        precondition(GaryPushIntent.parse(["aps": ["alert": "Your book settled"]]) == nil)

        let book: [AnyHashable: Any] = ["destination": "book", "book_scope": "you", "account_id": accountA.uuidString]
        precondition(GaryPushIntent.parse(book)!.resolve(nativeSlateDate: "2026-09-09", currentAccountID: accountA) == .yourBook)
        precondition(GaryPushIntent.parse(book)!.resolve(nativeSlateDate: "2026-09-09", currentAccountID: accountB) == .bookAccountRequired(expectedAccountID: accountA))
        precondition(GaryPushIntent.parse(book)!.resolve(nativeSlateDate: "2026-09-09", currentAccountID: nil) == .bookAccountRequired(expectedAccountID: accountA))
        precondition(GaryPushIntent.parse(["destination": "book", "book_scope": "board"]) == nil)
        precondition(GaryPushIntent.parse(["destination": "book", "account_id": "invalid"]) == nil)

        var currentNativeDate = "2026-09-09"
        var lastConsumedAt: Date?
        let router = GaryPushRouter(slateDate: { now in
            lastConsumedAt = now
            return currentNativeDate
        })
        precondition(router.receive(game, requestID: "system-one"))
        // Cold launch: no observer exists yet. Pending survives entry/onboarding.
        precondition(router.takeIfReady(shellReady: false, identityReady: false, currentAccountID: nil, now: now) == nil)
        precondition(router.pending != nil)
        precondition(!router.receive(game, requestID: "different-system-id"))
        precondition(!router.receive(badDestination, requestID: "invalid"))
        precondition(router.pending != nil)
        // Public routes do not wait for auth; the native date is read only now.
        precondition(lastConsumedAt == nil)
        currentNativeDate = "2026-09-10"
        precondition(router.takeIfReady(shellReady: true, identityReady: false, currentAccountID: nil,
                                  now: instant("2026-09-10T10:01:00Z")) ==
               .webArchive(URL(string: "https://www.betwithgary.ai/picks/nfl/2026-09-09")!))
        precondition(router.takeIfReady(shellReady: true, identityReady: true, currentAccountID: nil, now: now) == nil)

        precondition(lastConsumedAt == instant("2026-09-10T10:01:00Z"))
        var secondGame = game; secondGame["gcm.message_id"] = "second"; secondGame["game_id"] = "9002"
        precondition(router.receive(secondGame, requestID: "second"))
        precondition(router.receive(book, requestID: "book-one"))
        precondition(router.takeIfReady(shellReady: true, identityReady: false, currentAccountID: nil, now: now) == nil)
        precondition(router.pending == .yourBook(accountID: accountA))
        precondition(router.takeIfReady(shellReady: true, identityReady: true, currentAccountID: accountA, now: now) == .yourBook)

        var observerCalls = 0
        router.onPendingChange = { observerCalls += 1 }
        precondition(router.receive(book, requestID: "book-two"))
        precondition(observerCalls == 1)
        precondition(router.takeIfReady(shellReady: true, identityReady: true, currentAccountID: accountB, now: now) ==
               .bookAccountRequired(expectedAccountID: accountA))
        // Optional cross-runtime contract fixture generated by the real Edge
        // pickAlerts -> pushMessage helpers, using synthetic game/token values.
        if CommandLine.arguments.count > 1 {
            let data = try! Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
            let envelope = try! JSONSerialization.jsonObject(with: data) as! [String: Any]
            let message = envelope["message"] as! [String: Any]
            let payload = message["data"] as! [AnyHashable: Any]
            precondition(GaryPushIntent.parse(payload)!.resolve(nativeSlateDate: "2026-09-09", currentAccountID: nil) ==
                   .nativeGame(.init(league: "NFL", gameID: 42, date: "2026-09-09", matchup: "Away Club @ Home Club")))
            print("Real Edge payload -> native parser contract passed")
        }
        print("Gary push router assertions passed: exact game, ET dates, retired/legacy archives, account changes, cold launch, duplicate and malformed payloads")
    }
}
