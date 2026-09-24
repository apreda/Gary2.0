import Foundation

/// World Cup data-layer guard. The 2026 tournament ended Jul 19 and the
/// backend pipeline was deleted Jul 21 (founder; next Cup is 2030). The WC
/// render code left the app Sep 1 2026; what remains is the row drop below,
/// because June-July WC rows still exist in the database and must never leak
/// into any list (founder: the app renders ZERO World Cup anything).
extension AppFlags {
    /// Canonical World Cup league test, mirroring the normalization in
    /// `Models/PropPickModels.swift` (`effectiveLeague`): world_cup / worldcup / wc /
    /// soccer_world_cup all map to the WC league.
    static func isWorldCupLeague(_ raw: String?) -> Bool {
        guard let raw, !raw.isEmpty else { return false }
        let n = raw.lowercased()
        return n.contains("world_cup") || n.contains("worldcup") || n == "wc" || n.contains("soccer_world_cup")
    }

    /// True when a row carrying league string `raw` should be HIDDEN from the UI.
    /// Convenience for `.filter { !AppFlags.hidesWorldCupRow($0.league) }`.
    static func hidesWorldCupRow(_ raw: String?) -> Bool {
        isWorldCupLeague(raw)
    }

    /// The leagues the Home/Hub "edges" loops iterate when fetching insight
    /// connections.
    static let insightLeagues: [String] = ["MLB", "NFL", "NCAAF", "NBA"]
}
