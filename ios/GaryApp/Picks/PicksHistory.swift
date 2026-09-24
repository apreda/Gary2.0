import Foundation
import Combine

/// Thin archive navigation; fetching this list never downloads old cards.
struct NFLPicksWeek: Decodable, Identifiable, Equatable {
    let week_start: String
    let week_number: Int?
    let season: Int?
    // NFL's existing wire format is unchanged; college weeks use the same
    // bounded navigation model, with a separate cache identity.
    var league: String = "NFL"
    private enum CodingKeys: String, CodingKey { case week_start, week_number, season }
    var id: String { "\(league)|\(week_start)" }
    var end: String { GamePageDataScope.shiftDay(week_start, 6) ?? week_start }
    // Legacy August rows reuse regular-season week numbers without a season-type
    // column. Identify them by their dated preseason window in archive navigation.
    var isPreseason: Bool { league == "NFL" && (season.map { week_start >= "\($0)-07-01" && week_start < "\($0)-09-01" } ?? false) }
    var shortLabel: String { label.uppercased() }
    var label: String { "\(isPreseason ? "Preseason Week" : "Week") \(week_number.map(String.init) ?? "—")" }

    /// College Week 1 includes Labor Day weekend (Week 0 is the preceding
    /// week). Tuesday–Monday windows keep opening Monday games together.
    /// This is navigation only; exact kickoff dates still own picks/research.
    static func collegeWeek(containing day: String) -> NFLPicksWeek? {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = formatter.timeZone
        guard let date = formatter.date(from: day), formatter.string(from: date) == day else { return nil }
        let year = calendar.component(.year, from: date)
        let season = calendar.component(.month, from: date) >= 7 ? year : year - 1
        guard let september = formatter.date(from: "\(season)-09-01"),
              let laborDay = calendar.date(byAdding: .day, value: (9 - calendar.component(.weekday, from: september)) % 7, to: september),
              let firstWeek = calendar.date(byAdding: .day, value: -6, to: laborDay),
              let start = calendar.date(byAdding: .day, value: -(calendar.component(.weekday, from: date) + 4) % 7, to: date),
              let days = calendar.dateComponents([.day], from: firstWeek, to: start).day,
              days >= -7 else { return nil }
        return NFLPicksWeek(week_start: formatter.string(from: start), week_number: days / 7 + 1,
                            season: season, league: "NCAAF")
    }

    /// NFL Week 1 is the Tuesday–Monday window after Labor Day (the Thursday
    /// opener's week), the college calculation shifted one week. Regular season
    /// only: outside Weeks 1–18 there is no week to name (founder, Sep 23 2026:
    /// the upcoming week reads "Week 3", not "This Week", before its first pick).
    static func nflWeek(containing day: String) -> NFLPicksWeek? {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = formatter.timeZone
        guard let date = formatter.date(from: day), formatter.string(from: date) == day else { return nil }
        let year = calendar.component(.year, from: date)
        let season = calendar.component(.month, from: date) >= 7 ? year : year - 1
        guard let september = formatter.date(from: "\(season)-09-01"),
              let laborDay = calendar.date(byAdding: .day, value: (9 - calendar.component(.weekday, from: september)) % 7, to: september),
              let firstWeek = calendar.date(byAdding: .day, value: 1, to: laborDay),
              let start = calendar.date(byAdding: .day, value: -(calendar.component(.weekday, from: date) + 4) % 7, to: date),
              let days = calendar.dateComponents([.day], from: firstWeek, to: start).day,
              days >= 0, days / 7 < 18 else { return nil }
        return NFLPicksWeek(week_start: formatter.string(from: start), week_number: days / 7 + 1,
                            season: season, league: "NFL")
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
    private var weeksByLeague: [String: [NFLPicksWeek]] = [:]
    private var indexLeague = "NFL"

    func loadWeeks(league: String = "NFL") async {
        indexLeague = league
        weeks = weeksByLeague[league] ?? []
        guard weeks.isEmpty else { return }
        do {
            let loaded = try await (league == "NCAAF" ? SupabaseAPI.fetchNCAAFPicksWeeks() : SupabaseAPI.fetchNFLPicksWeeks())
            try Task.checkCancellation()
            weeksByLeague[league] = loaded
            if indexLeague == league { weeks = loaded }
        }
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
            let fresh = try await (week.league == "NCAAF" ? SupabaseAPI.fetchNCAAFPicksHistory(week: week) : SupabaseAPI.fetchNFLPicksHistory(week: week))
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
