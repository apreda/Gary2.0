import Foundation

/// Day-keyed cache of the wire (today + yesterday) — team news/injury lines
/// for the scout capsules. One fetch pair shared by every game page.
@MainActor
enum ScoutWireCache {
    private static var stored: [String: (items: [SupabaseAPI.WireItem], fetchedAt: Date)] = [:]
    private static var inFlight: [String: Task<[SupabaseAPI.WireItem], Never>] = [:]
    /// The wire is written mid-morning (and again through the day) — an
    /// all-day cache kept serving yesterday's headlines to anyone who opened
    /// the app before the day's first write (founder screenshot, Aug 20:
    /// a stale IL line at 9:48 AM). Twenty minutes keeps the page current
    /// without hammering the table.
    private static let ttl: TimeInterval = 20 * 60
    static func get(date: String? = nil) async -> [SupabaseAPI.WireItem] {
        let day = date ?? SupabaseAPI.todayEST()
        guard let priorDay = GamePageDataScope.shiftDay(day, -1) else { return [] }
        if let cached = stored[day], !cached.items.isEmpty,
           Date().timeIntervalSince(cached.fetchedAt) < ttl { return cached.items }
        if let task = inFlight[day] {
            let items = await task.value
            return items.isEmpty ? (stored[day]?.items ?? []) : items
        }
        let task = Task { () -> [SupabaseAPI.WireItem] in
            async let today = SupabaseAPI.fetchWireItems(date: day, limit: 24)
            async let prior = SupabaseAPI.fetchWireItems(date: priorDay, limit: 24)
            let items = await today + prior
            let scoped = items.filter { $0.date == day || $0.date == priorDay }
            return scoped
        }
        inFlight[day] = task
        let items = await task.value
        inFlight[day] = nil
        // NEVER cache an empty read — a page swipe cancels in-flight .tasks and
        // the cancelled fetch returns [], which would poison every later page.
        // On a failed refresh, the previous non-empty copy keeps serving.
        if !items.isEmpty { stored[day] = (items, Date()) }
        for key in stored.keys.sorted(by: { stored[$0]!.fetchedAt > stored[$1]!.fetchedAt }).dropFirst(4) {
            stored[key] = nil
        }
        return stored[day]?.items ?? items
    }
}
