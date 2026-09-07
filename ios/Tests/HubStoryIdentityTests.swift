import Foundation

// Run without SwiftUI or app credentials:
// swiftc ios/GaryApp/HubStoryIdentity.swift ios/Tests/HubStoryIdentityTests.swift -o /tmp/gary-hub-story-identity-tests
// /tmp/gary-hub-story-identity-tests
@main
struct HubStoryIdentityTests {
    static func main() {
        typealias Card = HubStoryIdentity.PlayerCard
        var checks = 0
        func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
            precondition(condition(), message)
            checks += 1
        }
        func card(_ player: String? = "7", _ game: String? = "101", _ name: String? = "José Ramírez",
                  league: String? = "MLB", populated: Bool = true) -> Card {
            Card(league: league, playerID: player, gameID: game, name: name, hasPayload: populated)
        }
        func resolve(_ cards: [Card], player: String? = "7", name: String? = "José Ramírez",
                     game: String? = "101", league: String = "MLB", day: String? = "2026-09-07",
                     loaded: String = "2026-09-07", current: String = "2026-09-07") -> Int? {
            HubStoryIdentity.playerCardIndex(league: league, slateDate: day, playerID: player,
                playerName: name, gameID: game, loadedDate: loaded, currentDate: current, candidates: cards)
        }

        let doubleheader = [card("99", "101", "Different Player"), card(), card("7", "102")]
        expect(resolve(doubleheader) == 1, "Return the original candidate index")
        expect(resolve(doubleheader, game: "102") == 2, "Second game selects its own populated pack")
        expect(resolve(doubleheader, game: "103") == nil, "An exact game miss must not choose a sibling")
        expect(resolve([card("7", nil)]) == nil, "A missing card game ID cannot satisfy a supplied ID")
        expect(resolve(doubleheader, game: nil) == nil, "A game-less doubleheader story is ambiguous")
        expect(resolve([card()], game: nil) == 0, "A game-less story can use its single known card")
        expect(resolve([card(), card("7", "102", populated: false)], game: nil) == nil,
               "An unfinished sibling pack still proves game ambiguity")
        expect(resolve([card(populated: false)]) == nil, "Never open an empty player pack")
        expect(resolve([card(), card()]) == nil, "Duplicate exact identities are ambiguous")
        expect(resolve([card(), card(populated: false)]) == nil,
               "An exact duplicate is ambiguous even if only one payload arrived")
        expect(resolve([card(league: "NFL"), card()]) == 1, "Provider IDs are scoped to their league")
        expect(resolve([card(league: nil)]) == nil, "An unknown card league cannot match")
        expect(resolve([card(" 7 ", " 101 ", league: " mlb ")], league: " mlb ") == 0,
               "Normalize harmless surrounding provider whitespace")

        expect(resolve([card("8")]) == nil, "A supplied wrong player ID cannot fall back to the same name")
        expect(resolve([card(nil)]) == nil, "A missing card player ID cannot satisfy a supplied player ID")
        expect(resolve([card("7", "101", nil)]) == 0, "An exact provider identity does not require a display name")
        expect(resolve([card()], player: nil, name: "Jose Ramirez") == 0, "ID-less names tolerate accents")
        expect(resolve([card()], player: " ", name: "Jose Ramirez") == 0, "A blank identifier is absent")
        expect(resolve(doubleheader, player: nil, game: "102") == 2, "Name fallback stays inside the exact game")
        expect(resolve(doubleheader, player: nil, game: nil) == nil, "Name fallback cannot guess a DH game")
        expect(resolve([card("7"), card("8")], player: nil) == nil, "Duplicate names are ambiguous")
        expect(resolve([card()], player: nil, name: "J. Ramirez") == 0, "A unique initial and surname may resolve")
        expect(resolve([card("7"), card("8", "101", "Julio Ramirez")], player: nil, name: "J. Ramirez") == nil,
               "A shared initial and surname cannot choose a player")
        expect(resolve([card()], player: nil, name: "Ramirez") == nil, "A surname alone is not a player match")
        expect(resolve([card()], player: nil, name: nil) == nil, "Missing identity leaves the story readable")
        expect(resolve([card()], player: nil, name: "Jose Ram") == nil, "No partial surname matching")
        expect(resolve([card("7", "101", "Pete Crow-Armstrong")], player: nil, name: "Pete Crow Armstrong") == 0,
               "Name punctuation cannot split the same complete identity")

        expect(resolve([card()], day: "2026-09-06") == nil, "Yesterday's story must not open today's matchup")
        expect(resolve([card()], loaded: "2026-09-06") == nil, "Yesterday's loaded cards are unavailable today")
        expect(resolve([card()], current: "2026-09-08") == nil, "Rollover expires both previously loaded identities")
        expect(resolve([card()], day: nil) == nil, "An undated story cannot claim the current pack")
        expect(resolve([card()], day: "", loaded: "", current: "") == nil, "Empty dates never match")

        func key(league: String = "MLB", day: String? = "2026-09-07", gameID: String? = "101",
                 game: String = "CLE @ DET", kind: String = "hot", subject: String = "José Ramírez",
                 variant: String? = nil) -> String {
            HubStoryIdentity.dedupeKey(league: league, slateDate: day, gameID: gameID, game: game,
                                      kind: kind, subject: subject, variant: variant)
        }
        expect(key() == key(league: " mlb ", game: "Cleveland Guardians @ Detroit Tigers", subject: "JOSE RAMIREZ"),
               "The same provider game remains one story despite display spelling changes")
        expect(key() != key(gameID: "102"), "Dedupe preserves both doubleheader games")
        expect(key() != key(league: "NFL"), "Dedupe preserves cross-league identities")
        expect(key() != key(day: "2026-09-06"), "Dedupe preserves different slate dates")
        expect(key() != key(kind: "cold"), "Different story lanes remain distinct")
        expect(key() != key(subject: "Different Player"), "Different subjects remain distinct")
        expect(key(variant: "tonight") != key(variant: "tomorrow"), "Regression look-ahead remains separate")
        expect(key(gameID: nil) == key(gameID: " ", game: " cle  @  det "), "Legacy matchup labels normalize whitespace")
        expect(key(gameID: nil) != key(gameID: nil, game: "CLE @ BOS"), "Legacy games remain distinct")
        expect(key(kind: "a|b", subject: "c") != key(kind: "a", subject: "b|c"), "Provider delimiters cannot collide")

        print("Hub story identity: \(checks) checks passed for exact cards, doubleheaders, current slate, unique names and dedupe")
    }
}
