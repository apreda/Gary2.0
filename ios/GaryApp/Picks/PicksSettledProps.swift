import Foundation

/// Grades use the complete original ticket identity, independent of the UI day.
struct PicksSettledProps: Equatable {
    private var outcomes: [String: String] = [:]
    private static func key(league: String?, date: String?, gameID: Int?, player: String?, market: String?, side: String?, line: String?) -> String? {
        guard let league, !league.isEmpty, let identity = ExactGameIdentity(date: date, gameID: gameID),
              let player, !player.isEmpty, let market, let token = market.lowercased().split(separator: " ").first,
              let side, ["over", "under"].contains(side.lowercased()), let line, let number = Double(line), number.isFinite else { return nil }
        return [league.uppercased(), identity.date, String(identity.gameID),
                player.lowercased().trimmingCharacters(in: .whitespacesAndNewlines), String(token), side.lowercased(), String(number)].joined(separator: "|")
    }
    mutating func record(league: String?, date: String?, gameID: Int?, player: String?, market: String?, side: String?, line: String?, outcome: String?) {
        guard let key = Self.key(league: league, date: date, gameID: gameID, player: player, market: market, side: side, line: line),
              let outcome = outcome?.lowercased(), ["won", "lost", "push"].contains(outcome) else { return }
        outcomes[key] = outcome
    }
    func result(league: String?, date: String?, gameID: Int?, player: String?, market: String?, side: String?, line: String?) -> String? {
        guard let key = Self.key(league: league, date: date, gameID: gameID, player: player, market: market, side: side, line: line) else { return nil }
        return outcomes[key]
    }
}
