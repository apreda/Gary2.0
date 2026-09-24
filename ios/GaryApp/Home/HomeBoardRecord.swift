import Foundation

/// A selected sport’s dated game-pick receipt. Missing results stay missing.
struct HomeBoardRecord {
    var w = 0
    var l = 0
    var p = 0
    var net: Double? = nil
    var bestOdds: Double? = nil
    static func calculate(games: [GameResult], league: String,
                                        slateDate: String) -> HomeBoardRecord {
        var record = HomeBoardRecord()
        // ALL is Gary's whole day, every league.
        let all = league.uppercased() == HomeBoardLeague.all.rawValue
        for game in games.countable where game.game_date == slateDate
            && (all || game.effectiveLeague == league.uppercased()) {
            let result = (game.result ?? "").lowercased()
            switch result {
            case "won": record.w += 1
            case "lost": record.l += 1
            case "push": record.p += 1
            default: continue
            }
            let odds = HomeReceiptMath.resultOdds(game.odds, pickText: game.pick_text)
            record.net = (record.net ?? 0) + HomeReceiptMath.unitsDelta(odds: odds, result: result)
            if result == "won" {
                record.bestOdds = max(record.bestOdds ?? -Double.infinity, odds)
            }
        }
        return record
    }
}
