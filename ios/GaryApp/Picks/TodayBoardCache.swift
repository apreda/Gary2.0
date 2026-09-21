import Foundation

/// Day-keyed cache of the today board (today_board → tomorrow_board fallback,
/// written the evening before) — ONE fetch feeds every game page's scout.
@MainActor
enum TodayBoardCache {
    private static var stored: [String: (board: TomorrowBoard, fetchedAt: Date)] = [:]
    private static var inFlight: [String: Task<TomorrowBoard?, Never>] = [:]

    /// A board can improve after the first morning read (probables, lines and
    /// generated copy land in stages). The former day-long cache froze a 6 AM
    /// incomplete snapshot until the app process died, even after the server
    /// had repaired it. Complete boards refresh every five minutes; an MLB
    /// board missing Arms copy gets another chance after 30 seconds.
    private static func cacheLifetime(for board: TomorrowBoard) -> TimeInterval {
        let postedStarters = Set(board.starters.compactMap { starter -> String? in
            guard (starter.league ?? "").uppercased() == "MLB",
                  let game = starter.game,
                  let team = starter.abbr ?? starter.team else { return nil }
            return "\(game)|\(team.uppercased())"
        })
        let hasMissingMLBArms = board.board.contains {
            guard ($0.league ?? "").uppercased() == "MLB",
                  ($0.arms_take?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true),
                  let away = $0.away_abbr,
                  let home = $0.home_abbr else { return false }
            let game = "\(away) @ \(home)"
            // A take is required only after BOTH official probables exist.
            // One-posted/TBA games are legitimately incomplete and can wait
            // for the normal five-minute board refresh.
            return postedStarters.contains("\(game)|\(away)")
                && postedStarters.contains("\(game)|\(home)")
        }
        // Every league: the server marks a row "pending" when both starters are
        // known and the take is still to come (NFL quarterbacks, Sep 21 2026).
        let hasPendingTake = board.board.contains {
            $0.arms_take_status == "pending"
                && ($0.arms_take?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
        }
        return (hasMissingMLBArms || hasPendingTake) ? 30 : 300
    }

    static func get(date: String? = nil) async -> TomorrowBoard? {
        let day = date ?? SupabaseAPI.todayEST()
        guard GamePageDataScope.shiftDay(day, 0) == day else { return nil }
        if let cached = stored[day],
           Date().timeIntervalSince(cached.fetchedAt) < cacheLifetime(for: cached.board) {
            return cached.board
        }
        if let task = inFlight[day] { return await task.value ?? stored[day]?.board }
        let task = Task { () -> TomorrowBoard? in
            let board = await SupabaseAPI.fetchTodayBoard(date: day)
            guard let board, board.date == day else { return nil }
            return board
        }
        inFlight[day] = task
        let board = await task.value
        inFlight[day] = nil
        guard let board else { return stored[day]?.board }
        stored[day] = (board, Date())
        // Only nearby slates are reachable here; bound retained historical data.
        for key in stored.keys.sorted(by: { stored[$0]!.fetchedAt > stored[$1]!.fetchedAt }).dropFirst(4) {
            stored[key] = nil
        }
        return board
    }
}
