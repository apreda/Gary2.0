import Foundation

/// One of the three prompts around Gary on Home (founder, Oct 30 2026: "prompting people to look at the Dart
/// page or the Parlay of the day has arrived and those kinds of things", beside last night, tonight and the
/// run). Each spot on Gary owns one page: his cigar the parlay of the day, his pocket the darts, his shoe the
/// picks. `key` names the news and changes when the news does, so a prompt reads as new (green dot, the spot
/// on Gary pulsing) until it has been seen; a prompt with no key is never news.
struct GaryPrompt: Equatable {
    enum Spot: String { case cigar, pocket, shoe }
    let spot: Spot
    let key: String?
    let kicker: String
    /// The kicker while the prompt is new ("JUST IN"), when it differs.
    let newKicker: String?
    /// One or two lines.
    let news: String
    let hook: String?
    /// The hook in the win green: something hit.
    let hookWins: Bool
}

enum GaryPrompts {
    /// A dart as the prompts need it (get_darts rows and last night's hits).
    struct Dart: Equatable {
        let id: Int
        let player: String
        let kind: String
        let prop: String?
        let bet: String?
        let odds: Int?
        /// hit | miss once graded; nil while it rides.
        let result: String?
    }

    /// Gary's parlay of the day (get_parlay).
    struct Parlay: Equatable {
        let odds: Int
        /// "won" | "lost" once settled.
        let result: String?
        /// Legs that have won so far.
        let landed: Int
        let legs: Int
    }

    /// His pocket: tonight's darts once they're up, then the biggest one that hit. Before the day's darts,
    /// last night's hits. The Darts page only celebrates hits, and so does this.
    static func darts(date: String, today: [Dart], yesterdayHits: [Dart]) -> GaryPrompt? {
        if !today.isEmpty {
            let hits = today.filter { $0.result == "hit" }
            if let best = biggest(hits) {
                let words = dartWords(best)
                return GaryPrompt(spot: .pocket, key: "darts-hit:\(date):\(hits.count)",
                                  kicker: hits.count == 1 ? "A DART HIT" : "\(hits.count) DARTS HIT", newKicker: nil,
                                  news: "\(words.name)\n\(words.what)", hook: best.odds.map(odds), hookWins: true)
            }
            let longest = today.compactMap(\.odds).max()
            return GaryPrompt(spot: .pocket, key: "darts-up:\(date)", kicker: "DARTS", newKicker: "JUST IN",
                              news: "\(today.count) \(today.count == 1 ? "DART" : "DARTS")\nUP TONIGHT",
                              hook: longest.flatMap { $0 > 0 ? "LONGEST \(odds($0))" : nil }, hookWins: false)
        }
        guard let best = biggest(yesterdayHits) else { return nil }
        let n = yesterdayHits.count
        return GaryPrompt(spot: .pocket, key: nil, kicker: "LAST NIGHT", newKicker: nil,
                          news: n == 1 ? "A DART\nHIT" : "\(n) DARTS\nHIT", hook: best.odds.map(odds), hookWins: true)
    }

    /// His cigar: the parlay of the day, from the evening it lands until it settles. A miss stays quiet.
    static func parlay(date: String, today: Parlay?, yesterday: Parlay?) -> GaryPrompt? {
        let name = "PARLAY OF\nTHE DAY"
        guard let p = today else {
            if let y = yesterday, y.result == "won" {
                return GaryPrompt(spot: .cigar, key: nil, kicker: "LAST NIGHT", newKicker: nil,
                                  news: "THE PARLAY\nHIT", hook: odds(y.odds), hookWins: true)
            }
            return GaryPrompt(spot: .cigar, key: nil, kicker: "COMING TONIGHT", newKicker: nil,
                              news: name, hook: nil, hookWins: false)
        }
        switch p.result {
        case "won":
            return GaryPrompt(spot: .cigar, key: "parlay-won:\(date)", kicker: "IT HIT", newKicker: nil,
                              news: name, hook: odds(p.odds), hookWins: true)
        case "lost":
            return GaryPrompt(spot: .cigar, key: nil, kicker: "PARLAY", newKicker: nil,
                              news: name, hook: odds(p.odds), hookWins: false)
        default:
            if p.landed > 0 {
                return GaryPrompt(spot: .cigar, key: "parlay-legs:\(date):\(p.landed)", kicker: "\(p.landed) OF \(p.legs) IN",
                                  newKicker: nil, news: name, hook: odds(p.odds), hookWins: false)
            }
            return GaryPrompt(spot: .cigar, key: "parlay:\(date)", kicker: "PARLAY", newKicker: "JUST IN",
                              news: name, hook: odds(p.odds), hookWins: false)
        }
    }

    /// His shoe: tonight's slate until Gary picks, then his picks, new again with every pick that lands.
    static func picks(date: String, picks: Int, games: Int) -> GaryPrompt? {
        if picks > 0 {
            return GaryPrompt(spot: .shoe, key: "picks:\(date):\(picks)", kicker: "PICKS", newKicker: "JUST IN",
                              news: "GARY'S PICKS\nARE IN",
                              hook: picks >= games ? "ALL \(picks) GAMES" : "\(picks) OF \(games) GAMES", hookWins: false)
        }
        guard games > 0 else { return nil }
        return GaryPrompt(spot: .shoe, key: nil, kicker: "PICKS", newKicker: nil,
                          news: "\(games) \(games == 1 ? "GAME" : "GAMES")\nTONIGHT", hook: nil, hookWins: false)
    }

    /// "+170", "−110".
    static func odds(_ o: Int) -> String { o > 0 ? "+\(o)" : "−\(abs(o))" }

    private static func biggest(_ darts: [Dart]) -> Dart? {
        darts.max { ($0.odds ?? .min) < ($1.odds ?? .min) }
    }

    private static let suffixes: Set<String> = ["JR", "JR.", "SR", "SR.", "II", "III", "IV"]

    /// A hit dart in two short lines: the player's last name, then what he did.
    static func dartWords(_ d: Dart) -> (name: String, what: String) {
        let words = d.player.uppercased().split(separator: " ").map(String.init)
        let name = words.last(where: { !suffixes.contains($0) }) ?? d.player.uppercased()
        let under = d.bet == "under"
        let line = d.prop?.split(separator: " ").last.flatMap { Double($0) }
        let stat: [String: String] = ["threes": "THREES", "pts": "PTS", "reb": "REB", "ast": "AST", "pra": "PTS+REB+AST",
                                      "hrr": "H+R+RBI", "tb": "TOTAL BASES", "recyds": "REC YDS", "rushyds": "RUSH YDS",
                                      "passtd": "TD PASSES"]
        switch d.kind {
        case "td", "tetd": return (name, "SCORED")
        case "ftd": return (name, "SCORED FIRST")
        case "qbtd": return (name, "RAN ONE IN")
        case "hr": return (name, "HOMERED")
        case "int": return (name, under ? "NO PICKS" : "THREW A PICK")
        case "first_inning": return ("1ST INNING", under ? "NO RUN" : "A RUN")
        default:
            guard let words = stat[d.kind], let line else { return (name, d.kind.uppercased()) }
            if under { return (name, "UNDER \(lineWords(line)) \(words)") }
            return (name, "\(Int(line.rounded(.up)))+ \(words)")
        }
    }

    private static func lineWords(_ x: Double) -> String {
        x == x.rounded() ? String(Int(x)) : String(format: "%.1f", x)
    }
}
