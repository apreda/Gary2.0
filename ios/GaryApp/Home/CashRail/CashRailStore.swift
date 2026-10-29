import Foundation

/// Polls the Cash Rail board for the live NFL hero every 15 seconds while the
/// card is on screen. A failed fetch keeps the last good board.
@MainActor
final class CashRailStore: ObservableObject {
    static let shared = CashRailStore()
    @Published private(set) var boards: [String: CashRailBoard] = [:]

    private var watching: (league: String, gameID: String)?
    private var loop: Task<Void, Never>?

    static func key(league: String, gameID: String) -> String { "\(league.uppercased())|\(gameID)" }

    func board(league: String, gameID: String) -> CashRailBoard? { boards[Self.key(league: league, gameID: gameID)] }

    func watch(league: String, gameID: String) {
        let lg = league.uppercased()
        if let w = watching, w.league == lg, w.gameID == gameID, loop != nil { return }
        watching = (lg, gameID)
        loop?.cancel()
        loop = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                if let board = await SupabaseAPI.fetchLiveBoard(league: lg, gameID: gameID) {
                    let k = Self.key(league: lg, gameID: gameID)
                    if self?.boards[k] != board { self?.boards[k] = board }
                    if board.status == "final" { break }
                }
                try? await Task.sleep(nanoseconds: 15_000_000_000)
            }
        }
    }

    func stop() {
        loop?.cancel(); loop = nil; watching = nil
    }
}
