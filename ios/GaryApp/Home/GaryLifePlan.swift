import Foundation

/// What Gary does next on Home (founder, Oct 30 2026: "a live character who is fluid, does his own thing").
/// `GaryLife` runs it: a stand of a few seconds, then a clip, chosen here. Pure, so it can be tested.
enum GaryLifePlan {
    /// A clip and its odds after a good night and after a bad one.
    struct Clip: Equatable {
        let name: String
        let good: Double
        let bad: Double
        /// A bit that lands once (founder, Oct 30 2026: "break the 4th wall just once"): at most once a day,
        /// never the first thing he does when Home opens.
        var rare = false
        /// The seconds his prop is out past him (the board up, the ball spinning by his head): the diagram's
        /// lines step back and he plays in front of the labels.
        var stage: ClosedRange<Double>? = nil

        func performs(at seconds: Double) -> Bool { stage?.contains(seconds) ?? false }
    }

    /// Every clip he has, by the bundled file's name.
    static let clips: [Clip] = [
        Clip(name: "gary-cigar", good: 3, bad: 1),
        // He reads the paper, turns a page or two, folds it into his pocket.
        Clip(name: "gary-paper", good: 1, bad: 3),
        // The cigar out of his mouth: a smoke ring, the ash tapped, back in.
        Clip(name: "gary-cigarout", good: 3, bad: 1),
        // A basketball spun on one finger.
        Clip(name: "gary-spin", good: 2, bad: 1, stage: 1.3...6.3),
        Clip(name: "gary-watch", good: 1, bad: 2),
        Clip(name: "gary-pencil", good: 1, bad: 2),
        Clip(name: "gary-cash", good: 3, bad: 0.5),
        Clip(name: "gary-chuckle", good: 3, bad: 0.5),
        // He flashes his phone at you: a ticket that cashed.
        Clip(name: "gary-phone", good: 2, bad: 1, rare: true),
        // He writes his bet on a whiteboard and turns it around to you (`board`).
        Clip(name: "gary-board", good: 2, bad: 1.5, stage: 4.4...8.1),
        // The fourth wall again: sunglasses down his nose, a look over them, a point and a wink at you.
        Clip(name: "gary-peek", good: 2, bad: 1, rare: true),
        // Gary the fortune teller: a crystal ball out of thin air, a long look into it, a tap of the nose.
        Clip(name: "gary-crystal", good: 1.5, bad: 1.5, rare: true),
    ]

    /// The next clip: never one of the last two he played (when there are others to play), weighted by last
    /// night's face; a rare clip only when `rareAllowed`. `roll` is a number in 0..<1.
    static func next(from clips: [Clip], recent: [String], mood: String?, roll: Double, rareAllowed: Bool = false) -> String? {
        let clips = clips.filter { rareAllowed || !$0.rare }
        let fresh = Set(recent.suffix(min(2, max(0, clips.count - 1))))
        let pool = clips.filter { !fresh.contains($0.name) }
        guard !pool.isEmpty else { return nil }
        let good = mood == "GaryFire" || mood == "GaryCooking"
        let bad = mood == "GaryIceCold" || mood == "GaryDoomsday"
        let weights = pool.map { good ? $0.good : bad ? $0.bad : 1 }
        var left = roll * weights.reduce(0, +)
        for (clip, w) in zip(pool, weights) {
            if left < w { return clip.name }
            left -= w
        }
        return pool.last?.name
    }

    /// The clips he may play next: every everyday one, and each once-a-day bit that hasn't had its day
    /// (`rareDays`: clip name → the day it last played).
    static func pool(_ clips: [Clip], first: Bool, rareDays: [String: String], today: String) -> [Clip] {
        clips.filter { !$0.rare || rareAllowed(first: first, lastRareDay: rareDays[$0.name], today: today) }
    }

    /// A rare clip may come up: not as the first thing he does, and not twice in a day (`today` and
    /// `lastRareDay` are the same kind of day string).
    static func rareAllowed(first: Bool, lastRareDay: String?, today: String) -> Bool {
        !first && lastRareDay != today
    }

    /// Seconds he stands before the next clip: a short beat when Home opens, a few seconds after that.
    static func stand(first: Bool, roll: Double) -> Double {
        first ? 1.5 + roll * 1.5 : 2.5 + roll * 4.5
    }

    // MARK: - His whiteboard

    /// A streak pick as the board needs it (get_streak's today / yesterday; the streak pick is the free pick).
    struct Ticket: Equatable {
        let kind: String?
        let league: String?
        let pickText: String?
        var player: String? = nil
        var prop: String? = nil
        var bet: String? = nil
        var result: String? = nil
    }

    /// What he writes: two short lines in his hand, and a check when it already cashed.
    struct Board: Equatable {
        let lines: [String]
        let check: Bool
    }

    /// The board he turns around (founder, Oct 30 2026: "a bet on it in his hand writing like Rams -3.5 ...
    /// a real one of his bets"): today's streak pick; before it's set, last night's if it cashed, with a check;
    /// after today's misses, he's back tomorrow.
    static func board(today: Ticket?, yesterday: Ticket?) -> Board {
        if let t = today, let lines = words(t) {
            if t.result == "lost" { return Board(lines: ["BACK", "TOMORROW"], check: false) }
            return Board(lines: lines, check: t.result == "won")
        }
        if let y = yesterday, y.result == "won", let lines = words(y) { return Board(lines: lines, check: true) }
        return Board(lines: ["WORKING", "ON IT"], check: false)
    }

    /// "Golden State Warriors +2.5 -104" → WARRIORS / +2.5; "Brewers ML -142" → BREWERS / TO WIN; a college
    /// side by its school; a prop by the player's last name and the line ("WIGGINS UNDER" / "12.5 PTS").
    private static func words(_ t: Ticket) -> [String]? {
        guard var text = t.pickText?.trimmingCharacters(in: .whitespaces), !text.isEmpty else { return nil }
        // The price is never on the board.
        text = text.replacingOccurrences(of: #"\s*@?\s*[+-]?\d{3,4}$"#, with: "", options: .regularExpression)
        if t.kind == "prop", let player = t.player, !player.isEmpty {
            let last = player.split(separator: " ").last.map(String.init) ?? player
            let line = number(in: t.prop) ?? number(in: text) ?? ""
            let side = (t.bet ?? "over").uppercased()
            return ["\(last.uppercased()) \(side)", [line, market(t.prop)].filter { !$0.isEmpty }.joined(separator: " ")]
        }
        var tokens = text.split(separator: " ").map(String.init)
        guard let tail = tokens.popLast() else { return nil }
        let line: String
        if tail.uppercased() == "ML" { line = "TO WIN" } else if tail.range(of: #"^[+-]?\d+(\.\d+)?$"#, options: .regularExpression) != nil {
            line = tail
        } else { return [text.uppercased()] }
        guard !tokens.isEmpty else { return nil }
        let team = tokens.joined(separator: " ")
        if ["over", "under"].contains(team.lowercased()) { return [team.uppercased(), line] }
        return [name(team, college: ["NCAAF", "NCAAB"].contains((t.league ?? "").uppercased())).uppercased(), line]
    }

    /// Nicknames of two words, so "Red Sox" stays whole and "Wake Forest Demon Deacons" is Wake Forest.
    private static let twoWordNicknames: Set<String> = [
        "red sox", "white sox", "blue jays", "trail blazers", "maple leafs", "golden knights", "blue jackets",
        "red wings", "demon deacons", "crimson tide", "fighting irish", "golden gophers", "red raiders",
        "blue devils", "tar heels", "yellow jackets", "sun devils", "nittany lions", "horned frogs",
        "scarlet knights", "golden bears", "mean green", "green wave", "golden hurricane", "golden eagles",
        "fighting illini", "black knights", "red wolves", "rainbow warriors", "thundering herd", "blue raiders",
        "golden flashes", "ragin' cajuns", "black bears", "blue hens", "big red", "golden griffins",
    ]

    /// A pro team by its nickname, a college team by its school.
    private static func name(_ team: String, college: Bool) -> String {
        let w = team.split(separator: " ").map(String.init)
        guard w.count > 1 else { return team }
        let nickWords = w.count > 2 && twoWordNicknames.contains(w.suffix(2).joined(separator: " ").lowercased()) ? 2 : 1
        return (college ? w.dropLast(nickWords) : w.suffix(nickWords)).joined(separator: " ")
    }

    private static func number(in s: String?) -> String? {
        guard let s, let r = s.range(of: #"\d+(\.\d+)?$"#, options: .regularExpression) else { return nil }
        return String(s[r])
    }

    /// The market the way a bettor jots it.
    private static func market(_ prop: String?) -> String {
        let key = (prop ?? "").lowercased()
            .replacingOccurrences(of: #"\s*\d+(\.\d+)?$"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: "batter_", with: "")
        let short: [String: String] = [
            "points": "PTS", "rebounds": "REB", "assists": "AST", "threes": "3S", "steals": "STL", "blocks": "BLK",
            "points_rebounds_assists": "PTS+REB+AST", "passing_yards": "PASS YDS", "rushing_yards": "RUSH YDS",
            "receiving_yards": "REC YDS", "receptions": "CATCHES", "passing_tds": "TD PASSES", "pitcher_outs": "OUTS",
            "pitcher_strikeouts": "KS", "pitcher_earned_runs": "RUNS", "pitcher_hits_allowed": "HITS", "hits": "HITS",
            "hits_runs_rbis": "H+R+RBI", "total_bases": "BASES", "shots_on_goal": "SHOTS", "saves": "SAVES",
        ]
        return short[key] ?? key.replacingOccurrences(of: "_", with: " ").uppercased()
    }
}
