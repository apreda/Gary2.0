import Foundation
import Combine

/// Thin archive navigation; fetching this list never downloads old cards.
struct NFLPicksWeek: Decodable, Identifiable, Equatable {
    let week_start: String
    let week_number: Int?
    let season: Int?
    var id: String { week_start }
    var end: String { GamePageDataScope.shiftDay(week_start, 6) ?? week_start }
    // Legacy August rows reuse regular-season week numbers without a season-type
    // column. Identify them by their dated preseason window in archive navigation.
    var isPreseason: Bool { season.map { week_start >= "\($0)-07-01" && week_start < "\($0)-09-01" } ?? false }
    var shortLabel: String { isPreseason ? "PRESEASON" : "WEEK \(week_number.map(String.init) ?? "—")" }
    var label: String { "\(season.map(String.init) ?? "NFL") · \(isPreseason ? "Preseason" : "Week \(week_number.map(String.init) ?? "—")")" }
    var displayRange: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        guard let start = formatter.date(from: week_start), let finish = formatter.date(from: end) else { return week_start }
        formatter.dateFormat = "MMM d"
        return "\(formatter.string(from: start))–\(formatter.string(from: finish))"
    }
}

struct NFLPicksHistory {
    let week: NFLPicksWeek
    let picks: [GaryPick]
    let props: [PropPick]
    let slate: [DailySlateRow]
    let games: PicksSettledGames
    let propGrades: PicksSettledProps
}

/// One selected week, at most three cached weeks. No background archive polling.
/// A failed/cancelled read never replaces the accepted snapshot with empty data.
@MainActor final class PicksHistoryStore: ObservableObject {
    @Published private(set) var weeks: [NFLPicksWeek] = []
    @Published private(set) var snapshot: NFLPicksHistory?
    @Published private(set) var loading = false
    @Published private(set) var failed = false
    @Published private(set) var revision: UInt64 = 0
    private var cache: [String: (value: NFLPicksHistory, fetched: Date)] = [:]
    private var requested: String?
    private var generation: UInt64 = 0

    func loadWeeks() async {
        guard weeks.isEmpty else { return }
        do { weeks = try await SupabaseAPI.fetchNFLPicksWeeks() }
        catch { /* Current picks stay usable when the optional archive index fails. */ }
    }

    func select(_ week: NFLPicksWeek?, force: Bool = false) async {
        generation &+= 1
        let owner = generation
        requested = week?.id
        guard let week else { snapshot = nil; loading = false; failed = false; revision &+= 1; return }
        if snapshot?.week != week { snapshot = cache[week.id]?.value; revision &+= 1 }
        failed = false
        if !force, let cached = cache[week.id], Date().timeIntervalSince(cached.fetched) < 900 {
            snapshot = cached.value; loading = false; return
        }
        loading = true
        do {
            let fresh = try await SupabaseAPI.fetchNFLPicksHistory(week: week)
            guard generation == owner, requested == week.id, !Task.isCancelled else { return }
            cache[week.id] = (fresh, Date())
            for key in cache.keys.sorted(by: { cache[$0]!.fetched > cache[$1]!.fetched }).dropFirst(3) { cache[key] = nil }
            snapshot = fresh; revision &+= 1
        } catch {
            guard generation == owner else { return }
            failed = !SupabaseAPI.isCancellation(error)
        }
        guard generation == owner else { return }
        loading = false
    }
}
