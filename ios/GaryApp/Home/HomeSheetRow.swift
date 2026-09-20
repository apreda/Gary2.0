import SwiftUI

struct HomeSheetRow: Identifiable {
    enum Zone { case settled, live, interrupted, upcoming }
    let id: String
    let gameID: Int?
    let zone: Zone
    let league: String
    let matchupFull: String
    let title: String
    let callLine: String?
    let pendingLine: String?
    /// GAME state, riding the score line: "▶ INN 8", "FINAL". Separate from
    /// `statusText`, which is GARY's state (founder, Aug 5) — the clock
    /// belongs next to the score it's describing, not in the verdict slot.
    var clockText: String? = nil
    let statusText: String
    let statusColor: Color
    let bigOne: Bool
    /// Gary's pick on this game is on today's Winners board.
    var onWinnersBoard: Bool = false
    let commence: String
    /// Picks already mathematically HIT mid-game (an OVER whose line the
    /// score has passed) — stacked under the live status (founder, Jul 7).
    var hitLines: [String] = []
}
