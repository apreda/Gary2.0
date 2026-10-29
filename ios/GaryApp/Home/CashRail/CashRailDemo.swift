#if DEBUG
import Foundation

/// Sim-only Cash Rail game (tour verb `cashrail demo` / `cashrail off`): the
/// approved mock's Panthers @ Packers night, replayed at 55 game seconds per
/// second so the card can be checked without a live NFL game. Includes one
/// touchdown taken back on review, so a hit leaving the board is exercised.
@MainActor
final class CashRailDemo: ObservableObject {
    static let shared = CashRailDemo()

    @Published private(set) var isOn = false
    @Published private(set) var board: CashRailBoard?
    @Published private(set) var away = 0
    @Published private(set) var home = 0
    @Published private(set) var clock = "Q1 15:00"
    let marketLine = "GB \u{2212}2.5 · GARY OVER 46.5"

    private struct Ent { let who: String; let market: String; let price: Int?; let rungs: [CashRailRung]?; var gary = false }
    private struct Hit { let id: String; var n = 0; let play: String }
    private struct Ev { let gs: Int; var car = 0; var gb = 0; var poss: String? = nil; var end = false; var final = false; var undo: String? = nil; var hits: [Hit] = [] }

    private static func r(_ pairs: [(String, Int)]) -> [CashRailRung] { pairs.map { CashRailRung(label: $0.0, price: $0.1) } }

    private let ents: [String: Ent] = [
        "sanders_ftd": Ent(who: "Ja'Tavion Sanders", market: "First TD scorer", price: 2200, rungs: nil),
        "sanders_atd": Ent(who: "Ja'Tavion Sanders", market: "Anytime TD", price: 500, rungs: nil),
        "kraft_atd": Ent(who: "Tucker Kraft", market: "Anytime TD", price: 250, rungs: nil),
        "jacobs_atd": Ent(who: "Josh Jacobs", market: "Anytime TD", price: -160, rungs: nil),
        "legette_atd": Ent(who: "Xavier Legette", market: "Anytime TD", price: 340, rungs: nil),
        "doubs_atd": Ent(who: "Romeo Doubs", market: "Anytime TD", price: 210, rungs: nil),
        "watson_atd": Ent(who: "Christian Watson", market: "Anytime TD", price: 240, rungs: nil),
        "hubbard_atd": Ent(who: "Chuba Hubbard", market: "Anytime TD", price: 150, rungs: nil),
        "game_over": Ent(who: "Game total", market: "Over 46.5", price: -110, rungs: nil, gary: true),
        "kraft_2td": Ent(who: "Tucker Kraft", market: "2+ TDs", price: 1200, rungs: nil),
        "gb_ml": Ent(who: "Packers", market: "Moneyline", price: -145, rungs: nil),
        "gb_spread": Ent(who: "Packers", market: "Spread \u{2212}2.5", price: -110, rungs: nil),
        "golden_yds": Ent(who: "Matthew Golden", market: "Rec yards", price: nil, rungs: r([("40+", -165), ("O 52.5", -115), ("60+", 125), ("70+", 185), ("80+", 260), ("90+", 360), ("100+", 500)])),
        "jacobs_yds": Ent(who: "Josh Jacobs", market: "Rush yards", price: nil, rungs: r([("60+", -145), ("O 72.5", -115), ("80+", 125), ("90+", 190), ("100+", 270)])),
        "love_yds": Ent(who: "Jordan Love", market: "Pass yards", price: nil, rungs: r([("O 236.5", -115), ("250+", 140), ("275+", 230)])),
        "mcm_yds": Ent(who: "Tetairoa McMillan", market: "Rec yards", price: nil, rungs: r([("O 58.5", -115), ("70+", 150), ("80+", 220)])),
        "kraft_rec": Ent(who: "Tucker Kraft", market: "Receptions", price: nil, rungs: r([("O 3.5", -120), ("5+", 150), ("6+", 260)])),
        "young_ptd": Ent(who: "Bryce Young", market: "Pass TDs", price: nil, rungs: r([("O 0.5", -220), ("2+", 190)])),
        "love_ptd": Ent(who: "Jordan Love", market: "Pass TDs", price: nil, rungs: r([("O 1.5", -150), ("3+", 240)])),
    ]

    private let events: [Ev] = [
        Ev(gs: 205, car: 7, poss: "GB", hits: [Hit(id: "sanders_ftd", play: "14-yd TD catch from Bryce Young"), Hit(id: "sanders_atd", play: "14-yd TD catch from Bryce Young"), Hit(id: "young_ptd", n: 1, play: "TD pass to Ja'Tavion Sanders")]),
        Ev(gs: 520, gb: 7, poss: "CAR", hits: [Hit(id: "kraft_atd", play: "9-yd TD catch from Jordan Love")]),
        Ev(gs: 760, hits: [Hit(id: "golden_yds", n: 1, play: "31-yd catch · 44 yds")]),
        Ev(gs: 880, car: 3, poss: "GB"),
        Ev(gs: 900, end: true),
        Ev(gs: 1060, hits: [Hit(id: "golden_yds", n: 3, play: "24-yd catch · 68 yds")]),
        Ev(gs: 1220, hits: [Hit(id: "jacobs_yds", n: 1, play: "18-yd run · 63 yds")]),
        Ev(gs: 1330, gb: 7, poss: "CAR", hits: [Hit(id: "jacobs_atd", play: "2-yd TD run")]),
        Ev(gs: 1620, car: 7, poss: "GB", hits: [Hit(id: "legette_atd", play: "41-yd TD catch from Bryce Young"), Hit(id: "young_ptd", n: 2, play: "2nd TD pass, to Xavier Legette")]),
        Ev(gs: 1760, hits: [Hit(id: "golden_yds", n: 5, play: "21-yd catch · 89 yds")]),
        Ev(gs: 1792, gb: 3, poss: "CAR"),
        Ev(gs: 1800, end: true),
        Ev(gs: 2050, gb: 7, poss: "CAR", hits: [Hit(id: "doubs_atd", play: "12-yd TD catch from Jordan Love"), Hit(id: "love_ptd", n: 1, play: "2nd TD pass, to Romeo Doubs"), Hit(id: "love_yds", n: 1, play: "241 pass yds")]),
        Ev(gs: 2140, hits: [Hit(id: "kraft_rec", n: 1, play: "4th catch of the night")]),
        Ev(gs: 2240, hits: [Hit(id: "mcm_yds", n: 1, play: "15-yd catch · 61 yds")]),
        Ev(gs: 2330, hits: [Hit(id: "golden_yds", n: 7, play: "13-yd catch · 102 yds"), Hit(id: "love_yds", n: 2, play: "254 pass yds")]),
        Ev(gs: 2470, hits: [Hit(id: "jacobs_yds", n: 2, play: "11-yd run · 76 yds")]),
        Ev(gs: 2580, car: 7, poss: "GB", hits: [Hit(id: "hubbard_atd", play: "6-yd TD run"), Hit(id: "game_over", play: "Hubbard TD made it 48 points")]),
        Ev(gs: 2700, end: true),
        Ev(gs: 2860, hits: [Hit(id: "kraft_rec", n: 2, play: "5th catch of the night")]),
        Ev(gs: 2990, gb: 7, poss: "CAR", hits: [Hit(id: "watson_atd", play: "38-yd TD catch from Jordan Love")]),
        Ev(gs: 3060, gb: -7, poss: "GB", undo: "watson_atd"),
        Ev(gs: 3080, gb: 3, poss: "CAR"),
        Ev(gs: 3150, hits: [Hit(id: "mcm_yds", n: 3, play: "23-yd catch · 84 yds")]),
        Ev(gs: 3300, car: 3, poss: "GB"),
        Ev(gs: 3400, hits: [Hit(id: "jacobs_yds", n: 5, play: "25-yd run · 101 yds")]),
        Ev(gs: 3510, gb: 7, poss: "CAR", hits: [Hit(id: "kraft_2td", play: "18-yd TD catch, his 2nd"), Hit(id: "kraft_rec", n: 3, play: "6th catch, the 18-yd TD"), Hit(id: "love_ptd", n: 2, play: "3rd TD pass, to Tucker Kraft"), Hit(id: "love_yds", n: 3, play: "281 pass yds")]),
        Ev(gs: 3600, end: true, final: true, hits: [Hit(id: "gb_ml", play: "Final 34–27"), Hit(id: "gb_spread", play: "Final 34–27")]),
    ]

    private var timer: Timer?
    private var gs = 0.0
    private var idx = 0
    private var hits: [String: CashRailHit] = [:]
    private var rungN: [String: Int] = [:]
    private var poss = "CAR"
    private var holdUntil = Date.distantPast
    private var status = "live"
    private var lastPublish = Date.distantPast

    func start() {
        isOn = true
        restart()
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
    }

    func stop() {
        isOn = false
        timer?.invalidate(); timer = nil
        board = nil
    }

    private func restart() {
        gs = 0; idx = 0; hits = [:]; rungN = [:]; poss = "CAR"; status = "live"
        away = 0; home = 0; holdUntil = .distantPast
        publish()
    }

    private func tick() {
        let now = Date()
        if now < holdUntil { return }
        if status == "final" { restart(); return }
        let target = gs + 5.5
        while idx < events.count, Double(events[idx].gs) <= target {
            let ev = events[idx]; idx += 1
            gs = Double(ev.gs)
            apply(ev)
            if ev.end {
                holdUntil = now.addingTimeInterval(ev.final ? 11 : 2)
                publish(); return
            }
        }
        gs = min(3600, target)
        // The clock and rail move every tick; the board only republishes twice a second.
        clock = Self.clockText(Int(gs))
        if now.timeIntervalSince(lastPublish) > 0.5 { publish() }
    }

    private func apply(_ ev: Ev) {
        away += ev.car; home += ev.gb
        if let p = ev.poss { poss = p }
        if let undo = ev.undo { hits[undo] = nil }
        let when = ev.final ? "FINAL" : ev.end ? ["900": "END Q1", "1800": "HALF", "2700": "END Q3"]["\(ev.gs)"] ?? "" : Self.clockText(ev.gs)
        for h in ev.hits {
            guard let e = ents[h.id] else { continue }
            if let rungs = e.rungs {
                let n = max(rungN[h.id] ?? 0, h.n); rungN[h.id] = n
                let cashed = Array(rungs.prefix(n))
                hits[h.id] = CashRailHit(key: h.id, who: e.who, market: e.market, price: cashed.last?.price ?? 0,
                                         rungs: cashed, elapsed: ev.gs, when: when, play: h.play, gary: e.gary)
            } else {
                hits[h.id] = CashRailHit(key: h.id, who: e.who, market: e.market, price: e.price ?? 0,
                                         rungs: nil, elapsed: ev.gs, when: when, play: h.play, gary: e.gary)
            }
        }
        if ev.final { status = "final"; clock = "FINAL" }
        else if ev.end { clock = ["900": "END Q1", "1800": "HALF", "2700": "END Q3"]["\(ev.gs)"] ?? clock }
    }

    private func publish() {
        lastPublish = Date()
        let k = Int(gs) / 30
        let downs = ["1ST & 10", "2ND & 7", "3RD & 2", "1ST & 10", "2ND & 4", "3RD & 1", "2ND & 11", "3RD & 6"]
        let side = (k * 7) % 5 < 2 ? poss : (poss == "CAR" ? "GB" : "CAR")
        board = CashRailBoard(league: "NFL", game_id: "demo", status: status, possession: poss,
                              situation: status == "final" ? "PACKERS BY 7" : gs < 20 ? "KICKOFF" : "\(downs[k % downs.count]) · \(side) \(14 + (k * 37) % 36)",
                              elapsed_s: Int(gs), clock: clock, hits: Array(hits.values))
    }

    static func clockText(_ gs: Int) -> String {
        let q = min(4, gs / 900 + 1)
        let rem = max(0, q * 900 - gs)
        return "Q\(q) \(rem / 60):\(String(format: "%02d", rem % 60))"
    }
}
#endif
