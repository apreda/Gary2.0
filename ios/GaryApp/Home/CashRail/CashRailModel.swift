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
}

extension CashRailBoard {
    /// The latest landing owns the hero (a tie goes to the longer price).
    var hero: CashRailHit? {
        hits.max { a, b in
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

    /// Bets cashed: every rung of a ladder counts.
    var cashedCount: Int { hits.reduce(0) { $0 + ($1.rungs?.count ?? 1) } }
}

enum CashRailFormat {
    /// "+2200" / "−115" — a true minus, as the scoreboard sets it.
    static func price(_ p: Int) -> String { p > 0 ? "+\(p)" : "\u{2212}\(abs(p))" }

    static func decimal(_ p: Int) -> Double {
        p > 0 ? 1 + Double(p) / 100 : 1 + 100 / Double(abs(p))
    }

    /// What $10 returned: whole dollars from $100 up, else cents with ".00" dropped.
    static func payout10(_ p: Int) -> String {
        let v = 10 * decimal(p)
        if v >= 100 { return "$\(Int(v.rounded()))" }
        let s = String(format: "%.2f", v)
        return "$" + (s.hasSuffix(".00") ? String(s.dropLast(3)) : s)
    }
}
