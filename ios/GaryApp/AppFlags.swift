import Foundation

/// World Cup feature flag + its data-layer helpers.
///
/// `AppFlags` is declared in ContentView.swift (alongside the other ship-level
/// switches); this extension adds the single switch that gates EVERY World Cup
/// surface in the iOS build. The 2026 tournament ended Jul 19 — permanently OFF
/// (founder, Jul 21: the backend pipeline was fully deleted, next Cup is 2030).
/// The entire WC system — picks, Hub lanes, the paywall pass, the game-intel
/// dashboard — lives behind this flag; the rendering code stays in place
/// (unreachable while this is false) rather than tearing out ~17 call sites
/// blind with no build available to verify the result compiles.
extension AppFlags {
    /// Master World Cup switch. OFF = the app renders ZERO World Cup anything:
    /// no WC picks, no WC shelf, no WC Hub lanes, no WC paywall pass, no WC
    /// front-page module, and no WC rows leak through the data layer.
    static let worldCupEnabled = false

    /// Canonical World Cup league test, mirroring the normalization in
    /// `Models.swift` (`effectiveLeague`): world_cup / worldcup / wc /
    /// soccer_world_cup all map to the WC league. Used at the data layer to drop
    /// WC-tagged rows when `worldCupEnabled` is off, so nothing WC can leak into
    /// any list even if a render path was missed (defense in depth).
    static func isWorldCupLeague(_ raw: String?) -> Bool {
        guard let raw, !raw.isEmpty else { return false }
        let n = raw.lowercased()
        return n.contains("world_cup") || n.contains("worldcup") || n == "wc" || n.contains("soccer_world_cup")
    }

    /// True when a row carrying league string `raw` should be HIDDEN from the UI.
    /// Convenience for `.filter { !AppFlags.hidesWorldCupRow($0.league) }`.
    static func hidesWorldCupRow(_ raw: String?) -> Bool {
        !worldCupEnabled && isWorldCupLeague(raw)
    }

    /// The leagues the Home/Hub "edges" loops iterate when fetching insight
    /// connections. WC drops out entirely when the feature is off, so those loops
    /// never even request the World Cup lane.
    static var insightLeagues: [String] {
        worldCupEnabled ? ["MLB", "NBA", "WC"] : ["MLB", "NBA"]
    }

    /// Picks-page ALL tab (founder, Jul 13 2026: "we don't need an ALL tab at
    /// all, just the sport leagues — but don't delete it, hide it"). OFF = the
    /// filter strip shows only real league chips and the selection snaps to the
    /// day's first league; every ALL code path stays intact. Flip to true to
    /// bring ALL back exactly as it was.
    static let picksAllTab = false
}
