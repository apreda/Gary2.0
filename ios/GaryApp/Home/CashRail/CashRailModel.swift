import Foundation

/// CASH RAIL (founder-picked, Oct 29 2026): once the day's big NFL game kicks
/// off, the marquee card becomes the betting scoreboard: every bet the game has
/// already cashed, at the price frozen at kickoff, with what $10 would have paid.
/// The worker writes one `live_boards` row per game; this is that row.

/// One cashed rung of an alt-line ladder ("70+" at +185).
struct CashRailRung: Codable, Equatable {
    let label: String
    let price: Int
}

/// One cashed bet. A ladder (a player's yards, receptions…) is ONE hit whose
/// `rungs` climb low → high; `price` is the top cashed rung's price.
struct CashRailHit: Codable, Equatable, Identifiable {
    let key: String
    let who: String
    let market: String
    let price: Int
    let rungs: [CashRailRung]?
    /// Elapsed game seconds when it cashed (0–3600, past it in overtime) — the rail's x.
    let elapsed: Int
    /// "Q2 4:30" / "END Q1" / "FINAL".
    let when: String
    let play: String?
    /// The bet is Gary's own pick for this game.
    let gary: Bool?
    var id: String { key }

    /// One rung is already said by the market line; the strip starts at two.
    var showsStrip: Bool { (rungs?.count ?? 0) >= 2 }

    /// "Rec yards 70+" / "Rec yards over 58.5": a ladder reads as its top cashed rung.
    var displayMarket: String {
        guard let top = rungs?.last else { return market }
        return top.label.hasPrefix("O ") ? "\(market) over \(top.label.dropFirst(2))" : "\(market) \(top.label)"
    }
}

struct CashRailBoard: Codable, Equatable {
    let league: String
    let game_id: String
    let status: String
    /// Team abbreviation with the ball ("GB").
    let possession: String?
    /// "2ND & 11 · CAR 21" from the latest play.
    let situation: String?
    let elapsed_s: Int
    let clock: String?
    let hits: [CashRailHit]
    /// The favorite and its frozen line ("GB -3.5").
    var spread: String? = nil
    /// Gary's own pick, props and darts on this game (the strip under the scoreboard).
    var gary_bets: [CashRailGaryBet]? = nil
}

/// One box of the strip: GAME PICK, PROPS or DARTS (cash-rail garyBets.js).
struct CashRailGaryBet: Codable, Equatable, Identifiable {
    /// One bet's progress: "LOVE O 259.5 PASS YDS", "212 OF 259.5", 0.82.
    struct Focus: Codable, Equatable {
        let label: String
        let note: String?
        let progress: Double?
        let status: String?
        let ok: Bool?
    }
    let kind: String
    let title: String
    var label: String? = nil
    var note: String? = nil
    var progress: Double? = nil
    var status: String? = nil
    var ok: Bool? = nil
    /// One per prop or dart: "won", "lost" or "live".
    var dots: [String]? = nil
    var focus: Focus? = nil
    var id: String { kind }
}

extension CashRailBoard {
    /// The latest landing owns the hero (a tie goes to the longer price); once
    /// the game is final the night's biggest hit takes it back.
    var hero: CashRailHit? {
        if status == "final" {
            return hits.max { CashRailFormat.decimal($0.price) < CashRailFormat.decimal($1.price) }
        }
        return hits.max { a, b in
            a.elapsed != b.elapsed ? a.elapsed < b.elapsed
                : CashRailFormat.decimal(a.price) < CashRailFormat.decimal(b.price)
        }
    }

    /// Everything but the hero, longest price first, newer first on a tie.
    var ranked: [CashRailHit] {
        let heroKey = hero?.key
        return hits.filter { $0.key != heroKey }.sorted { a, b in
            let (da, db) = (CashRailFormat.decimal(a.price), CashRailFormat.decimal(b.price))
            return da != db ? da > db : a.elapsed > b.elapsed
        }
    }

    /// Bets cashed, a player's ladder counted once (a 100-yard night is one story).
    var cashedCount: Int { hits.count }
}

enum CashRailFormat {
    /// "+2200" / "−115" — a true minus, as the scoreboard sets it.
    static func price(_ p: Int) -> String { p > 0 ? "+\(p)" : "\u{2212}\(abs(p))" }

    static func decimal(_ p: Int) -> Double {
        p > 0 ? 1 + Double(p) / 100 : 1 + 100 / Double(abs(p))
    }

    /// The line over the card: the NFL's night games by name, every other game as the league.
    static func billing(league: String?, commence: Date?) -> String {
        let lg = (league ?? "").uppercased()
        guard lg == "NFL", let commence else { return lg.isEmpty ? "NFL" : lg }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "America/New_York")!
        let c = cal.dateComponents([.weekday, .hour], from: commence)
        guard (c.hour ?? 0) >= 19 else { return "NFL" }
        switch c.weekday {
        case 5: return "THURSDAY NIGHT FOOTBALL"
        case 1: return "SUNDAY NIGHT FOOTBALL"
        case 2: return "MONDAY NIGHT FOOTBALL"
        default: return "NFL"
        }
    }

    /// "GB −2.5 · GARY PACKERS −2.5": the spread off the board (the total when
    /// there is no spread), then Gary's pick. Nil when there is neither.
    static func marketLine(oddsLine: String?, pickLine: String?, spread boardSpread: String? = nil) -> String? {
        let parts = (oddsLine ?? "").components(separatedBy: " · ").map { $0.trimmingCharacters(in: .whitespaces) }
        let spread = parts.first { $0.uppercased().hasPrefix("RL ") }.map { String($0.dropFirst(3)) }
        let total = parts.first { $0.uppercased().hasPrefix("O/U") }
        var out: [String] = []
        if let market = spread ?? boardSpread ?? total { out.append(market) }
        if let pick = pickLine?.trimmingCharacters(in: .whitespaces), !pick.isEmpty { out.append("GARY \(pick)") }
        guard !out.isEmpty else { return nil }
        return out.joined(separator: " · ").uppercased().replacingOccurrences(of: "-", with: "\u{2212}")
    }

    /// What $10 returned: whole dollars from $100 up, else cents with ".00" dropped.
    static func payout10(_ p: Int) -> String {
        let v = 10 * decimal(p)
        if v >= 100 { return "$\(Int(v.rounded()))" }
        let s = String(format: "%.2f", v)
        return "$" + (s.hasSuffix(".00") ? String(s.dropLast(3)) : s)
    }
}

/// Gary celebrating a big hit: the scorer's number and team colors, one of ten
/// dances (scripts/cash-rail-celebrate.js draws the frames).
struct CashRailCelebration: Codable, Equatable, Identifiable {
    /// One beat of the routine: which frame, how long, and how it moves.
    struct Step: Codable, Equatable {
        let slug: String
        let hold: Int
        let move: String
        init(slug: String, hold: Int, move: String) { self.slug = slug; self.hold = hold; self.move = move }
        init(from decoder: Decoder) throws {
            var c = try decoder.unkeyedContainer()
            slug = try c.decode(String.self)
            hold = try c.decode(Int.self)
            move = (try? c.decode(String.self)) ?? ""
        }
        func encode(to encoder: Encoder) throws {
            var c = encoder.unkeyedContainer()
            try c.encode(slug); try c.encode(hold); try c.encode(move)
        }
    }
    struct Assets: Codable, Equatable {
        let bg: String
        let frames: [String: String]
        let seq: [Step]
        let name: String
        /// A piece of the field drawn behind Gary ("goalpost" for the dunk).
        var prop: String? = nil
    }
    let play_key: String
    let who: String
    let market: String
    let price: Int
    let when_label: String?
    let play: String?
    let kind: String
    let dance: String
    let team: String?
    let number: String?
    let ready_at: String?
    let assets: Assets
    var id: String { play_key }

    /// A celebration is news for 20 minutes after its art is ready.
    static let freshFor: TimeInterval = 20 * 60

    var readyDate: Date? {
        guard let s = ready_at else { return nil }
        // Postgres writes fractional seconds of any length; whole seconds are plenty.
        let trimmed = s.replacingOccurrences(of: #"\.\d+"#, with: "", options: .regularExpression)
        return ISO8601DateFormatter().date(from: trimmed)
    }

    /// The one to play now: the biggest price among fresh ones not yet seen.
    static func next(_ rows: [CashRailCelebration], seen: Set<String>, now: Date) -> CashRailCelebration? {
        rows.filter { c in
            guard !seen.contains(c.play_key), let d = c.readyDate else { return false }
            return now.timeIntervalSince(d) <= freshFor
        }
        .max { $0.price < $1.price }
    }
}

extension CashRailHit {
    /// The play this hit cashed on ("935@592"), matching a celebration's
    /// play_key. Game lines settle at the final whistle, not on a play.
    var playKey: String? {
        guard let id = key.split(separator: "|").first, id != "game" else { return nil }
        return "\(id)@\(elapsed)"
    }
}
