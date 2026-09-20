import Foundation

/// Fixed-stake receipt math shared by Home board and recap models.
enum HomeReceiptMath {
    static func recordLine(_ w: Int, _ l: Int, _ p: Int) -> String {
        p > 0 ? "\(w)–\(l)–\(p)" : "\(w)–\(l)"
    }

    static func unitsDelta(odds: Double, result: String) -> Double {
        switch result {
        case "won": return odds > 0 ? odds / 100.0 : (odds < 0 ? 100.0 / abs(odds) : 0)
        case "lost": return -1
        default: return 0
        }
    }

    static func oddsLabel(_ o: Double) -> String {
        o > 0 ? "+\(Int(o))" : "\(Int(o))"
    }

    static func resultOdds(_ odds: StringOrNumber?, pickText: String?) -> Double {
        if let v = Double(odds?.value ?? "") { return v }
        return Double(Formatters.splitPickAndOdds(pickText).1) ?? -110
    }
}
