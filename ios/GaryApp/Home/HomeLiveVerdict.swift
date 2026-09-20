import Foundation

/// Where Gary's pick stands against a live or final score — drives the
/// tape/takeover/slate tint. ML and spread picks get a read; totals only
/// color once an over has clinched (an under can't clinch mid-game and we
/// don't pretend).
enum HomeLiveVerdict {
    case covering, trailing, neutral

    static func evaluate(pick: GaryPick, live: LiveScore) -> HomeLiveVerdict {
        guard let away = live.away_score, let home = live.home_score else { return .neutral }
        let text = (pick.pick ?? "").lowercased().replacingOccurrences(of: "−", with: "-")
        guard !text.isEmpty else { return .neutral }

        // Totals — "over/under N".
        if text.contains("over") || text.contains("under") {
            guard let line = unsignedNumber(in: text) else { return .neutral }
            let combined = Double(away + home)
            if live.isFinal, combined == line { return .neutral }
            if text.contains("over") {
                if combined > line { return .covering }              // clinched
                return live.isFinal ? .trailing : .neutral
            }
            if combined > line { return .trailing }
            return live.isFinal ? .covering : .neutral
        }

        // Side picks: which team does the text name? SCORED, not a yes/no
        // (Aug 5 bug: "Red Sox ML -140" in a White Sox @ Red Sox game read
        // SWEATING with Boston up 3-0). A boolean can't split two clubs that
        // share a word — "sox" names both — and the old >3-character filter
        // dropped "red" and "sox" entirely, so NEITHER side matched and every
        // Red Sox game fell through to neutral. Scoring settles it: the pick
        // text scores 2 on Boston (red + sox) and 1 on Chicago (sox alone),
        // and the higher score is the side Gary took. A genuine tie is still
        // neutral — that's an unreadable pick, not a coin flip.
        let words = text.split { !$0.isLetter }.map(String.init)
        func nameScore(_ name: String?, _ abbr: String?) -> Int {
            var score = 0
            // The abbreviation is unambiguous when it's there, so it outweighs
            // any single shared nickname word.
            if let a = abbr?.lowercased(), a.count >= 2, words.contains(a) { score += 2 }
            if let n = name?.lowercased() {
                for token in n.split(separator: " ") where token.count >= 3 {
                    if words.contains(String(token)) { score += 1 }
                }
            }
            return score
        }
        let awayScore = nameScore(pick.awayTeam, live.away_abbr)
        let homeScore = nameScore(pick.homeTeam, live.home_abbr)
        guard awayScore != homeScore else { return .neutral }
        let tookAway = awayScore > homeScore
        let margin = Double(tookAway ? away - home : home - away)

        if let spread = signedNumber(in: text) {                     // spread
            let edge = margin + spread
            if edge > 0 { return .covering }
            if edge < 0 { return .trailing }
            return .neutral
        }
        if margin > 0 { return .covering }                           // moneyline
        if margin < 0 { return .trailing }
        return .neutral
    }

    /// College spreads can exceed 30 points. American prices start at 100;
    /// the smaller signed number remains the ticket's handicap.
    private static func signedNumber(in text: String) -> Double? {
        for raw in text.split(separator: " ") {
            let s = raw.trimmingCharacters(in: CharacterSet(charactersIn: "()[],"))
            guard s.hasPrefix("+") || s.hasPrefix("-"), let d = Double(s), abs(d) < 100 else { continue }
            return d
        }
        return nil
    }

    /// First bare number that reads like a total line.
    static func unsignedNumber(in text: String) -> Double? {
        for raw in text.split(separator: " ") {
            let s = raw.trimmingCharacters(in: CharacterSet(charactersIn: "()[],"))
            guard !s.hasPrefix("+"), !s.hasPrefix("-"), let d = Double(s), d > 3, d < 400 else { continue }
            return d
        }
        return nil
    }
}

