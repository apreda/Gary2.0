import Foundation

// No app, Firebase, Keychain, or network dependencies.
// The payload chooses a semantic destination, never an arbitrary URL or tab index.
enum GaryPushIntent: Equatable {
    case picksOverview
    case pick(league: String?, gameID: Int?, date: String?, matchup: String)
    case yourBook(accountID: UUID?)

    static let webSports = [
        "MLB": "mlb", "NFL": "nfl", "NCAAF": "ncaaf", "NBA": "nba",
        "NHL": "nhl", "NCAAB": "ncaab", "WC": "world-cup"
    ]
    static let activeSports: Set<String> = ["MLB", "NFL", "NCAAF", "NBA"]

    static func parse(_ payload: [AnyHashable: Any]) -> Self? {
        guard let destination = payload["destination"] as? String else { return nil }
        switch destination {
        case "book":
            guard payload["book_scope"] as? String == "you",
                  let text = payload["account_id"] as? String,
                  let accountID = UUID(uuidString: text) else { return nil }
            return .yourBook(accountID: accountID)
        case "picks":
            let league: String?
            if let value = payload["league"] {
                guard let text = value as? String,
                      webSports[text.uppercased()] != nil else { return nil }
                league = text.uppercased()
            } else { league = nil }

            let date: String?
            if let value = payload["game_date"] {
                guard let text = value as? String, validDate(text) else { return nil }
                date = text
            } else { date = nil }

            let gameID: Int?
            if let value = payload["game_id"] {
                // FCM custom data is string-valued. Do not truncate decimals,
                // coerce booleans, or accept provider ids from another namespace.
                guard let text = value as? String,
                      text.range(of: "^[1-9][0-9]{0,15}$", options: .regularExpression) != nil,
                      let parsed = Int(text), parsed <= 9_007_199_254_740_991 else { return nil }
                gameID = parsed
            } else { gameID = nil }

            let matchup: String
            if let value = payload["matchup"] {
                guard let text = value as? String, text.count <= 240,
                      text.unicodeScalars.allSatisfy({ !CharacterSet.controlCharacters.contains($0) }) else { return nil }
                matchup = text.trimmingCharacters(in: .whitespacesAndNewlines)
            } else { matchup = "" }

            if league == nil && gameID == nil && date == nil { return .picksOverview }
            return .pick(league: league, gameID: gameID, date: date, matchup: matchup)
        default:
            return nil
        }
    }

    static func dateFormatter() -> DateFormatter {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "America/New_York")!
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false
        return formatter
    }

    static func validDate(_ text: String) -> Bool {
        guard text.range(of: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$", options: .regularExpression) != nil else { return false }
        let formatter = dateFormatter()
        guard let date = formatter.date(from: text) else { return false }
        return formatter.string(from: date) == text
    }

    /// The caller supplies SupabaseAPI.todayEST(now:), whose native board rolls
    /// at 6 AM ET. Do not substitute a calendar date or duplicate that policy.
    func resolve(nativeSlateDate: String, currentAccountID: UUID?) -> GaryPushAction {
        switch self {
        case .picksOverview:
            return .picksOverview
        case let .yourBook(expectedAccountID):
            guard let currentAccountID,
                  expectedAccountID == nil || expectedAccountID == currentAccountID else {
                return .bookAccountRequired(expectedAccountID: expectedAccountID)
            }
            return .yourBook
        case let .pick(league, gameID, date, matchup):
            if let league, let gameID, let date,
               Self.activeSports.contains(league),
               date == nativeSlateDate {
                return .nativeGame(.init(league: league, gameID: gameID, date: date,
                                        matchup: matchup.isEmpty ? "Game \(gameID)" : matchup))
            }
            // PicksTab only targets today's exact id. Never send yesterday,
            // an unknown date, or a retired league through its today-only focus.
            let path: String
            if let date, let league, let slug = Self.webSports[league] {
                path = "/picks/\(slug)/\(date)"
            } else if let date {
                path = "/archive/\(date)"
            } else {
                path = "/archive"
            }
            return .webArchive(URL(string: "https://www.betwithgary.ai\(path)")!)
        }
    }
}

struct GaryPushGame: Equatable {
    let league: String
    let gameID: Int
    let date: String
    let matchup: String
}

enum GaryPushAction: Equatable {
    case nativeGame(GaryPushGame)
    case picksOverview
    case webArchive(URL)
    case yourBook
    case bookAccountRequired(expectedAccountID: UUID?)
}

/// Keeps the latest deliberate tap until the main shell can navigate. Receiving
/// a banner alone must never call receive(); use the default tap action only.
@MainActor
final class GaryPushRouter {
    private let slateDate: (Date) -> String
    private(set) var pending: GaryPushIntent?
    private var recentMessageIDs: [String] = []
    var onPendingChange: (() -> Void)?

    init(slateDate: @escaping (Date) -> String) {
        self.slateDate = slateDate
    }

    @discardableResult
    func receive(_ payload: [AnyHashable: Any], requestID: String) -> Bool {
        guard let intent = GaryPushIntent.parse(payload) else { return false }
        let suppliedID = (payload["gcm.message_id"] as? String) ?? requestID
        // Bound retained identifiers to a few KB even if a payload is malformed.
        let messageID = String(suppliedID.prefix(256))
        if !messageID.isEmpty, recentMessageIDs.contains(messageID) { return false }
        if !messageID.isEmpty {
            recentMessageIDs.append(messageID)
            if recentMessageIDs.count > 32 { recentMessageIDs.removeFirst() }
        }
        pending = intent
        onPendingChange?()
        return true
    }

    /// shellReady means ContentView is mounted and any entry/modal transition
    /// that would swallow navigation has finished. Identity restoration only
    /// blocks Book routes; public game routes do not wait on authentication.
    func takeIfReady(shellReady: Bool, identityReady: Bool,
                     currentAccountID: UUID?, now: Date) -> GaryPushAction? {
        guard shellReady, let pending else { return nil }
        if case .yourBook = pending, !identityReady { return nil }
        self.pending = nil
        return pending.resolve(nativeSlateDate: slateDate(now), currentAccountID: currentAccountID)
    }
}
