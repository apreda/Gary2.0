import Foundation

/// World Cup data-layer guard. The 2026 tournament ended Jul 19 and the
/// backend pipeline was deleted Jul 21 (founder; next Cup is 2030). The WC
/// render code left the app Sep 1 2026; what remains is the row drop below,
/// because June-July WC rows still exist in the database and must never leak
/// into any list (founder: the app renders ZERO World Cup anything).
extension AppFlags {
    /// Canonical World Cup league test, mirroring the normalization in
    /// `Models.swift` (`effectiveLeague`): world_cup / worldcup / wc /
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

// ═════════════════════════════════════════════════════════════════════════════
// STORE-SAFE BRIDGE (Aug 11 2026)
//
// Apple no longer distributes betting-adjacent apps from individual developer
// accounts (App Review, app 6751238914: 2.3.6 on Aug 10 + policy letter on
// Aug 11 — the pair is unsatisfiable from a personal account). Until the LLC →
// org enrollment → app transfer completes, the iOS DISPLAY LAYER carries no
// betting language: no odds or prices, no market notation (ML/±1.5/over-under),
// no units or dollars, no wager tracking. One master switch:
// render code stays in place, one master switch, data layer untouched.
//
// THE PICK ENGINE IS NOT TOUCHED. Picks are still made against real prices and
// stored with odds; this flag gates rendering only. The web (betwithgary.ai)
// never bridges.
//
// RESTORE: flip `storeSafe` to false after the org-account resubmission —
// see GaryMarketing/APPSTORE_BRIDGE_AUG11.md for the full checklist.
// ═════════════════════════════════════════════════════════════════════════════
extension AppFlags {
    /// Master bridge switch. TRUE = store-safe display everywhere.
    /// FALSE since Aug 12 (founder): real Gary — odds, prices, markets — for
    /// his own phone/sim/TestFlight. The submitted store-safe build keeps the
    /// bridge in its archive; flip back true only for a personal-account
    /// resubmission. 2.24 = the LLC-track version and ships with this false.
    static let storeSafe = false

    /// Market notation → plain-English prediction, for a pick string whose
    /// trailing American odds were already stripped by `splitPickAndOdds`.
    ///   "Dodgers ML"      → "Dodgers win"
    ///   "Phillies -1.5"   → "Phillies by 2+"
    ///   "Athletics +1.5"  → "Athletics within 1"
    ///   "Over 8.5"        → "9+ total"      (defensive — games have no O/U picks)
    ///   "Under 8.5"       → "8 or fewer total"
    /// Anything unrecognized passes through unchanged.
    static func bridgePickText(_ raw: String) -> String {
        let t = raw.trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty else { return t }

        // "Team ML" / "Team moneyline" → "Team win"
        if let r = t.range(of: #"\s+(ML|moneyline)$"#, options: [.regularExpression, .caseInsensitive]) {
            return String(t[..<r.lowerBound]) + " win"
        }

        // "Over 8.5" / "Under 8.5" (with optional unit word after the number)
        if let m = t.range(of: #"^(?i)(over|under)\s+(\d+(?:\.\d+)?)"#, options: .regularExpression) {
            let isOver = t.lowercased().hasPrefix("over")
            let numStr = t[m].split(separator: " ").last.map(String.init) ?? ""
            let tail = String(t[m.upperBound...]).trimmingCharacters(in: .whitespaces)
            let unit = tail.isEmpty ? "total" : tail
            if let v = Double(numStr) {
                let hasHalf = v != v.rounded(.down)
                if isOver {
                    let n = Int(v.rounded(.down)) + 1
                    return "\(n)+ \(unit)"
                } else {
                    let n = hasHalf ? Int(v.rounded(.down)) : Int(v)
                    return "\(n) or fewer \(unit)"
                }
            }
        }

        // "Team -1.5" / "Team +3.5" — spread magnitudes are < 100 (odds ≥ 100
        // were already peeled off upstream).
        if let m = t.range(of: #"\s+[-+]\d+(\.\d+)?$"#, options: .regularExpression) {
            let team = String(t[..<m.lowerBound])
            let tok = String(t[m.lowerBound...]).trimmingCharacters(in: .whitespaces)
            let mag = abs(Double(tok) ?? 0)
            guard mag > 0, mag < 100 else { return t }
            if tok.hasPrefix("-") {
                return "\(team) by \(Int(mag.rounded(.up)))+"
            } else {
                return "\(team) within \(max(Int(mag.rounded(.down)), 1))"
            }
        }

        return t
    }

    /// Prose safety net for any displayed analysis text: strips price tokens
    /// and book names. The primary bridge for reasoning is the blind
    /// `game_read` (written before Gary ever sees lines); this catches
    /// pre-Aug-5 rows and stray references.
    static func bridgeProse(_ s: String) -> String {
        guard storeSafe else { return s }
        var t = s
        for p in [#"\s*\([-+]\d{3,}\)"#,          // " (-112)"
                  #"(?<=\s)[-+]\d{3,}(?=[\s.,;)])"#, // bare -112 mid-sentence
                  #"(?i)\bat\s[-+]?\d{3,}\b"#] {   // "at -112"
            t = t.replacingOccurrences(of: p, with: "", options: .regularExpression)
        }
        for book in ["DraftKings", "FanDuel", "BetMGM", "Caesars", "BetRivers", "Fanatics"] {
            t = t.replacingOccurrences(of: book, with: "the market", options: .caseInsensitive)
        }
        return t
    }

    /// Graded stamp: the bettor's "CASHED" reads as plain "WON" in bridge.
    static var wonStamp: String { storeSafe ? "WON" : "CASHED" }
}
