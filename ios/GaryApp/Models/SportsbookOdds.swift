import Foundation
import CoreFoundation

// MARK: - Sportsbook Odds (multi-book comparison)
struct SportsbookOdds: Codable, Identifiable {
    let book: String?
    let spread: Double?
    let spread_odds: String?
    let ml: String?

    /// Identifiable values must be stable across SwiftUI body evaluations. A
    /// freshly generated UUID here rebuilt every nil-book row on every render.
    var id: String {
        [book ?? "unknown", spread.map { String($0) } ?? "", spread_odds ?? "", ml ?? ""]
            .joined(separator: "|")
    }

    /// Parse from dictionary
    static func from(dict: [String: Any]) -> SportsbookOdds? {
        func text(_ value: Any?) -> String? {
            if let value = value as? String { return value }
            if let value = value as? NSNumber { return value.stringValue }
            return nil
        }
        return SportsbookOdds(
            book: dict["book"] as? String,
            spread: (dict["spread"] as? NSNumber)?.doubleValue,
            spread_odds: text(dict["spread_odds"]),
            ml: text(dict["ml"])
        )
    }
}

