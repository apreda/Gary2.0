import Foundation

/// World Cup feature flag + its data-layer helpers.
///
/// `AppFlags` is declared in ContentView.swift (alongside the other ship-level
/// switches); this extension adds the single switch that gates EVERY World Cup
/// surface in the iOS build. It was briefly OFF after Apple's Guideline 5.2.1
/// rejection (FIFA IP), but is back ON (founder's call — the app has passed review
/// before with WC, and the 5.2.1 flag was judged to be driven by the description
/// metadata, now cleaned). The entire WC system — picks, Hub lanes, the paywall
/// pass, the game-intel dashboard — lives behind this flag. Set
/// `worldCupEnabled = false` to hide everything again.
extension AppFlags {
    /// Master World Cup switch. OFF = the app renders ZERO World Cup anything:
    /// no WC picks, no WC shelf, no WC Hub lanes, no WC paywall pass, no WC
    /// front-page module, and no WC rows leak through the data layer.
    static let worldCupEnabled = true

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
