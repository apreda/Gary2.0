import Foundation
import SwiftUI

// MARK: - Smart Cache for Performance
// Caches data for 60 seconds to make tab switching instant
// Pull-to-refresh always bypasses cache for fresh data
// Manual Supabase edits appear after 60s OR on pull-to-refresh

actor APICache {
    static let shared = APICache()

    private var cache: [String: (data: Any, timestamp: Date)] = [:]
    private let ttl: TimeInterval = 60 // 60 second cache

    func get<T>(_ key: String) -> T? {
        guard let entry = cache[key],
              Date().timeIntervalSince(entry.timestamp) < ttl,
              let data = entry.data as? T else {
            return nil
        }
        return data
    }

    func set<T>(_ key: String, value: T) {
        cache[key] = (data: value, timestamp: Date())
    }

    func invalidate(_ key: String) {
        cache.removeValue(forKey: key)
    }

    func invalidateAll() {
        cache.removeAll()
    }
}

// MARK: - Supabase API Client

enum SupabaseAPI {

    // MARK: - Configuration

    private static var baseURL: URL {
        Secrets.supabaseURL.appendingPathComponent("/rest/v1")
    }
    
    private static var headers: [String: String] {
        [
            "apikey": Secrets.supabaseAnonKey,
            "Authorization": "Bearer \(Secrets.supabaseAnonKey)",
            "Content-Type": "application/json",
            "Accept": "application/json"
        ]
    }
    
    // MARK: - Date Utilities
    
    /// Current date in EST timezone (YYYY-MM-DD format)
    /// Picks reset at 3am EST instead of midnight to keep late-night games visible
    static func todayEST() -> String {
        guard let tz = TimeZone(identifier: "America/New_York") else { return formatDateEST(Date()) }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = tz
        
        let now = Date()
        let hour = cal.component(.hour, from: now)
        
        // Before 3am EST, show previous day's picks
        if hour < 3 {
            if let yesterday = cal.date(byAdding: .day, value: -1, to: now) {
                return formatDateEST(yesterday)
            }
        }
        
        return formatDateEST(now)
    }
    
    private static func formatDateEST(_ date: Date) -> String {
        guard let tz = TimeZone(identifier: "America/New_York") else { return "" }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = tz
        let comps = cal.dateComponents([.year, .month, .day], from: date)
        // Use current year as fallback instead of hardcoded 2024
        let year = comps.year ?? Calendar.current.component(.year, from: Date())
        let month = comps.month ?? 1
        let day = comps.day ?? 1
        return String(format: "%04d-%02d-%02d", year, month, day)
    }
    
    /// Yesterday's date in EST timezone (YYYY-MM-DD format)
    static func yesterdayEST() -> String {
        guard let tz = TimeZone(identifier: "America/New_York") else { return "" }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = tz
        
        let now = Date()
        if let yesterday = cal.date(byAdding: .day, value: -1, to: now) {
            return formatDateEST(yesterday)
        }
        return formatDateEST(now)
    }
    
    /// Fetch yesterday's game pick record (wins, losses, pushes) - excludes props
    static func fetchYesterdayGameRecord() async throws -> (wins: Int, losses: Int, pushes: Int) {
        // Use the new function that finds the most recent day with results
        return try await fetchMostRecentGameRecord()
    }
    
    /// Fetch game record from the most recent day that has results
    /// Falls back up to 7 days to find actual performance data
    /// This ensures Gary always shows a mood based on real results, not a default
    static func fetchMostRecentGameRecord() async throws -> (wins: Int, losses: Int, pushes: Int) {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone(identifier: "America/New_York")

        // Fetch ONE batch of results from the last 7 days instead of looping
        guard let weekAgo = Calendar.current.date(byAdding: .day, value: -7, to: Date()) else {
            return (0, 0, 0)
        }
        let sinceDate = formatter.string(from: weekAgo)
        let allResults = try await fetchAllGameResults(since: sinceDate)

        // Walk backwards from yesterday to find the most recent day with results
        for daysBack in 1...7 {
            guard let checkDate = Calendar.current.date(byAdding: .day, value: -daysBack, to: Date()) else {
                continue
            }
            let dateStr = formatter.string(from: checkDate)

            var wins = 0
            var losses = 0
            var pushes = 0

            for result in allResults where result.game_date == dateStr {
                switch result.result?.lowercased() {
                case "won", "win", "w":
                    wins += 1
                case "lost", "loss", "l":
                    losses += 1
                case "push", "p":
                    pushes += 1
                default:
                    break
                }
            }

            // If we found results for this day, return them
            if wins + losses > 0 {
                print("[SupabaseAPI] Found results from \(dateStr): \(wins)W-\(losses)L")
                return (wins, losses, pushes)
            }
        }

        // No results found in last 7 days - return zeros (GaryCoin will show)
        print("[SupabaseAPI] No results found in last 7 days")
        return (0, 0, 0)
    }
    
    /// Sport record for yesterday's breakdown
    struct SportRecord: Identifiable {
        let id = UUID()
        let league: String
        let wins: Int
        let losses: Int
        let pushes: Int
        
        var total: Int { wins + losses }
        var winRate: Double { total > 0 ? Double(wins) / Double(total) : 0 }
        
        var icon: String {
            switch league.uppercased() {
            case "NBA": return "basketball.fill"
            case "NFL": return "football.fill"
            case "NHL": return "hockey.puck.fill"
            case "NCAAB": return "basketball.fill"
            case "NCAAF": return "football.fill"
            case "EPL": return "soccerball"
            case "WBC": return "baseball.fill"
            default: return "sportscourt.fill"
            }
        }
        
        var color: Color {
            switch league.uppercased() {
            case "NBA": return Color(hex: "#3B82F6")
            case "NFL": return Color(hex: "#22C55E")
            case "NHL": return Color(hex: "#00A3E0")
            case "NCAAB": return Color(hex: "#F97316")
            case "NCAAF": return Color(hex: "#DC2626")
            case "EPL": return Color(hex: "#8B5CF6")
            case "WBC": return Color(hex: "#16A34A")
            default: return GaryColors.gold
            }
        }
    }
    
    /// Fetch yesterday's game record broken down by sport
    static func fetchYesterdayBySport() async throws -> [SportRecord] {
        let yesterday = yesterdayEST()
        let results = try await fetchAllGameResults(since: yesterday)
        
        // Filter to exactly yesterday's date
        let yesterdayResults = results.filter { $0.game_date == yesterday }
        
        // Group by league
        var sportStats: [String: (wins: Int, losses: Int, pushes: Int)] = [:]
        
        for result in yesterdayResults {
            let league = result.league?.uppercased() ?? "OTHER"
            var current = sportStats[league] ?? (0, 0, 0)
            
            switch result.result?.lowercased() {
            case "won", "win", "w":
                current.wins += 1
            case "lost", "loss", "l":
                current.losses += 1
            case "push", "p":
                current.pushes += 1
            default:
                break
            }
            
            sportStats[league] = current
        }
        
        // Convert to SportRecord array, sorted by total games
        return sportStats.map { league, stats in
            SportRecord(league: league, wins: stats.wins, losses: stats.losses, pushes: stats.pushes)
        }.sorted { $0.total > $1.total }
    }
    
    /// Get NFL week start date (Monday) for a given date
    private static func getNFLWeekStart(for date: Date = Date()) -> String {
        guard let tz = TimeZone(identifier: "America/New_York") else { return todayEST() }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = tz
        
        let weekday = cal.component(.weekday, from: date)
        // Sunday = 1, Monday = 2, etc. Find previous Monday.
        let daysToSubtract = (weekday == 1) ? 6 : (weekday - 2)
        
        guard let monday = cal.date(byAdding: .day, value: -daysToSubtract, to: date) else {
            return todayEST()
        }
        return formatDateEST(monday)
    }
    
    // MARK: - Network Helpers
    
    private static func makeRequest(url: URL) -> URLRequest {
        var request = URLRequest(url: url)
        headers.forEach { request.setValue($1, forHTTPHeaderField: $0) }
        return request
    }
    
    private static func buildURL(table: String, query: [URLQueryItem]) -> URL {
        let url = baseURL.appendingPathComponent(table)
        guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            return url
        }
        components.queryItems = query
        return components.url ?? url
    }
    
    // MARK: - Daily Picks (Non-NFL sports)
    
    /// Fetch daily picks for a specific date (excludes NFL)
    /// Returns empty array if no picks exist for the given date - NO FALLBACK
    static func fetchDailyPicks(date: String) async throws -> [GaryPick] {
        let url = buildURL(table: "daily_picks", query: [
            URLQueryItem(name: "select", value: "picks::text,date"),
            URLQueryItem(name: "date", value: "eq.\(date)")
        ])
        
        let (data, response) = try await URLSession.shared.data(for: makeRequest(url: url))
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            print("[SupabaseAPI] fetchDailyPicks failed: HTTP \((response as? HTTPURLResponse)?.statusCode ?? -1)")
            return []
        }

        let rows = try JSONDecoder().decode([DailyPicksRow].self, from: data)
        guard let row = rows.first else { return [] }

        return parsePicksRow(row.picks)
    }
    
    // MARK: - Weekly NFL Picks
    
    /// Fetch NFL picks for the current week
    /// Gets the most recent week's picks (NFL weeks run Thu-Mon, so Monday games are still previous week)
    /// Returns empty array if no picks exist - NO FALLBACK
    static func fetchWeeklyNFLPicks() async throws -> [GaryPick] {
        // NFL season spans Sept-Feb, so in Jan-July we want previous year's season
        let currentYear = Calendar.current.component(.year, from: Date())
        let currentMonth = Calendar.current.component(.month, from: Date())
        let nflSeason = currentMonth <= 7 ? currentYear - 1 : currentYear
        
        let url = buildURL(table: "weekly_nfl_picks", query: [
            URLQueryItem(name: "select", value: "picks::text,week_start,week_number,season"),
            URLQueryItem(name: "season", value: "eq.\(nflSeason)"),
            URLQueryItem(name: "order", value: "week_start.desc"),
            URLQueryItem(name: "limit", value: "1")
        ])
        
        let (data, response) = try await URLSession.shared.data(for: makeRequest(url: url))
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            print("[SupabaseAPI] fetchWeeklyNFLPicks failed: HTTP \((response as? HTTPURLResponse)?.statusCode ?? -1)")
            return []
        }

        let rows = try JSONDecoder().decode([WeeklyNFLPicksRow].self, from: data)
        
        if let row = rows.first {
            return parsePicksRow(row.picks)
        }
        
        return []
    }
    
    // MARK: - Combined Picks

    /// Fetch all picks: non-NFL from daily_picks + NFL from weekly_nfl_picks
    /// - Parameter forceRefresh: Set to true for pull-to-refresh to bypass cache
    static func fetchAllPicks(date: String, forceRefresh: Bool = false) async throws -> [GaryPick] {
        let cacheKey = "allPicks_\(date)"

        // Check cache first (unless forcing refresh)
        if !forceRefresh, let cached: [GaryPick] = await APICache.shared.get(cacheKey) {
            return cached
        }

        // Fetch fresh data
        async let dailyTask = fetchDailyPicks(date: date)
        async let nflTask = fetchWeeklyNFLPicks()

        let dailyPicks = (try? await dailyTask) ?? []
        let nflPicks = (try? await nflTask) ?? []

        // Filter out NFL from daily picks (they come from weekly_nfl_picks)
        let nonNFLPicks = dailyPicks.filter { ($0.league ?? "").uppercased() != "NFL" }

        let result = nonNFLPicks + nflPicks

        // Store in cache
        await APICache.shared.set(cacheKey, value: result)

        return result
    }
    
    // MARK: - Prop Picks

    /// Fetch prop picks for a specific date
    /// - Parameter forceRefresh: Set to true for pull-to-refresh to bypass cache
    /// Returns empty array if no picks exist for the given date - NO FALLBACK
    static func fetchPropPicks(date: String, forceRefresh: Bool = false) async throws -> [PropPick] {
        let cacheKey = "propPicks_\(date)"

        // Check cache first (unless forcing refresh)
        if !forceRefresh, let cached: [PropPick] = await APICache.shared.get(cacheKey) {
            return cached
        }

        let url = buildURL(table: "prop_picks", query: [
            URLQueryItem(name: "select", value: "*"),
            URLQueryItem(name: "date", value: "eq.\(date)")
        ])

        let (data, response) = try await URLSession.shared.data(for: makeRequest(url: url))

        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            print("[SupabaseAPI] fetchPropPicks failed: HTTP \((response as? HTTPURLResponse)?.statusCode ?? -1)")
            return []
        }

        // Parse as array of dictionaries
        guard let jsonArray = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            print("[SupabaseAPI] fetchPropPicks: failed to parse JSON")
            return []
        }

        var allPicks: [PropPick] = []

        for row in jsonArray {
            let rowLeague = row["league"] as? String

            // Get picks from the row
            var picksData: [[String: Any]] = []
            if let picksArray = row["picks"] as? [[String: Any]] {
                picksData = picksArray
            } else if let picksString = row["picks"] as? String,
                      let pData = picksString.data(using: .utf8),
                      let parsed = try? JSONSerialization.jsonObject(with: pData) as? [[String: Any]] {
                picksData = parsed
            }

            // Parse each pick
            for var pickDict in picksData {
                if pickDict["league"] == nil && pickDict["sport"] == nil {
                    pickDict["league"] = rowLeague
                }
                if let pick = PropPick.from(dict: pickDict) {
                    allPicks.append(pick)
                }
            }
        }

        // Store in cache
        await APICache.shared.set(cacheKey, value: allPicks)

        return allPicks
    }
    
    // MARK: - Billfold (Results)
    
    /// Fetch game results with optional date filter (excludes NFL - those come from nfl_results)
    static func fetchGameResults(since dateFilter: String?) async throws -> [GameResult] {
        var query = [
            URLQueryItem(name: "select", value: "*"),
            URLQueryItem(name: "order", value: "game_date.desc"),
            URLQueryItem(name: "limit", value: "500")
        ]
        
        if let since = dateFilter, !since.isEmpty {
            query.insert(URLQueryItem(name: "game_date", value: "gte.\(since)"), at: 1)
        }
        
        let url = buildURL(table: "game_results", query: query)
        let (data, response) = try await URLSession.shared.data(for: makeRequest(url: url))

        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            print("[SupabaseAPI] fetchGameResults failed: HTTP \((response as? HTTPURLResponse)?.statusCode ?? -1)")
            return []
        }

        let decoder = JSONDecoder()
        do {
            return try decoder.decode([GameResult].self, from: data)
        } catch {
            print("[SupabaseAPI] fetchGameResults decode error: \(error.localizedDescription)")
            return []
        }
    }
    
    /// Fetch NFL results from nfl_results table
    static func fetchNFLResults(since dateFilter: String?) async throws -> [GameResult] {
        var query = [
            URLQueryItem(name: "select", value: "*"),
            URLQueryItem(name: "order", value: "game_date.desc"),
            URLQueryItem(name: "limit", value: "500")
        ]
        
        if let since = dateFilter, !since.isEmpty {
            query.insert(URLQueryItem(name: "game_date", value: "gte.\(since)"), at: 1)
        }
        
        let url = buildURL(table: "nfl_results", query: query)
        let (data, response) = try await URLSession.shared.data(for: makeRequest(url: url))

        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            print("[SupabaseAPI] fetchNFLResults failed: HTTP \((response as? HTTPURLResponse)?.statusCode ?? -1)")
            return []
        }

        let decoder = JSONDecoder()
        do {
            let nflResults = try decoder.decode([NFLResult].self, from: data)
            // Convert to GameResult for unified display
            return nflResults.map { $0.toGameResult() }
        } catch {
            print("[SupabaseAPI] fetchNFLResults decode error: \(error.localizedDescription)")
            return []
        }
    }
    
    /// Fetch all game results (game_results + nfl_results combined)
    /// - Parameter forceRefresh: Set to true for pull-to-refresh to bypass cache
    static func fetchAllGameResults(since dateFilter: String?, forceRefresh: Bool = false) async throws -> [GameResult] {
        let cacheKey = "gameResults_\(dateFilter ?? "all")"

        // Check cache first (unless forcing refresh)
        if !forceRefresh, let cached: [GameResult] = await APICache.shared.get(cacheKey) {
            return cached
        }

        async let gameTask = fetchGameResults(since: dateFilter)
        async let nflTask = fetchNFLResults(since: dateFilter)

        let gameResults = (try? await gameTask) ?? []
        let nflResults = (try? await nflTask) ?? []

        // Combine and sort by date descending
        let combined = gameResults + nflResults
        let result = combined.sorted { ($0.game_date ?? "") > ($1.game_date ?? "") }

        // Store in cache
        await APICache.shared.set(cacheKey, value: result)

        return result
    }
    
    /// Fetch prop results with optional date filter
    /// - Parameter forceRefresh: Set to true for pull-to-refresh to bypass cache
    static func fetchPropResults(since dateFilter: String?, forceRefresh: Bool = false) async throws -> [PropResult] {
        let cacheKey = "propResults_\(dateFilter ?? "all")"

        // Check cache first (unless forcing refresh)
        if !forceRefresh, let cached: [PropResult] = await APICache.shared.get(cacheKey) {
            return cached
        }

        var query = [
            URLQueryItem(name: "select", value: "*"),
            URLQueryItem(name: "order", value: "game_date.desc"),
            URLQueryItem(name: "limit", value: "500")
        ]

        if let since = dateFilter, !since.isEmpty {
            query.insert(URLQueryItem(name: "game_date", value: "gte.\(since)"), at: 1)
        }

        let url = buildURL(table: "prop_results", query: query)
        let (data, response) = try await URLSession.shared.data(for: makeRequest(url: url))

        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            print("[SupabaseAPI] fetchPropResults failed: HTTP \((response as? HTTPURLResponse)?.statusCode ?? -1)")
            return []
        }

        let decoder = JSONDecoder()
        do {
            let result = try decoder.decode([PropResult].self, from: data)
            await APICache.shared.set(cacheKey, value: result)
            return result
        } catch {
            print("[SupabaseAPI] fetchPropResults decode error: \(error.localizedDescription)")
            return []
        }
    }
    
    // MARK: - DFS Lineups (Gary's Fantasy)

    /// Fetch DFS lineups for a specific date
    /// - Parameter forceRefresh: Set to true for pull-to-refresh to bypass cache
    /// Returns lineups for both platforms (DraftKings, FanDuel) and available sports
    static func fetchDFSLineups(date: String, forceRefresh: Bool = false) async throws -> [DFSLineup] {
        let cacheKey = "dfsLineups_\(date)"

        // Check cache first (unless forcing refresh)
        if !forceRefresh, let cached: [DFSLineup] = await APICache.shared.get(cacheKey) {
            return cached
        }

        let url = buildURL(table: "dfs_lineups", query: [
            URLQueryItem(name: "select", value: "*"),
            URLQueryItem(name: "date", value: "eq.\(date)"),
            URLQueryItem(name: "order", value: "platform.asc,sport.asc")
        ])

        let (data, response) = try await URLSession.shared.data(for: makeRequest(url: url))

        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            print("[SupabaseAPI] fetchDFSLineups failed: HTTP \((response as? HTTPURLResponse)?.statusCode ?? -1)")
            return []
        }

        // Parse as array of dictionaries
        guard let jsonArray = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            print("[SupabaseAPI] fetchDFSLineups: failed to parse JSON")
            return []
        }

        let result = jsonArray.compactMap { DFSLineup.from(dict: $0) }

        // Store in cache
        await APICache.shared.set(cacheKey, value: result)

        return result
    }
    
    /// Fetch DFS lineups for a specific platform
    static func fetchDFSLineups(date: String, platform: DFSPlatform) async throws -> [DFSLineup] {
        let url = buildURL(table: "dfs_lineups", query: [
            URLQueryItem(name: "select", value: "*"),
            URLQueryItem(name: "date", value: "eq.\(date)"),
            URLQueryItem(name: "platform", value: "eq.\(platform.rawValue)"),
            URLQueryItem(name: "order", value: "sport.asc")
        ])
        
        let (data, response) = try await URLSession.shared.data(for: makeRequest(url: url))

        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            print("[SupabaseAPI] fetchDFSLineups(platform) failed: HTTP \((response as? HTTPURLResponse)?.statusCode ?? -1)")
            return []
        }

        // Parse as array of dictionaries
        guard let jsonArray = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return [] }

        return jsonArray.compactMap { DFSLineup.from(dict: $0) }
    }

    /// Fetch a specific DFS lineup by platform and sport
    static func fetchDFSLineup(date: String, platform: DFSPlatform, sport: String) async throws -> DFSLineup? {
        let url = buildURL(table: "dfs_lineups", query: [
            URLQueryItem(name: "select", value: "*"),
            URLQueryItem(name: "date", value: "eq.\(date)"),
            URLQueryItem(name: "platform", value: "eq.\(platform.rawValue)"),
            URLQueryItem(name: "sport", value: "eq.\(sport)")
        ])
        
        let (data, response) = try await URLSession.shared.data(for: makeRequest(url: url))

        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            print("[SupabaseAPI] fetchDFSLineup(single) failed: HTTP \((response as? HTTPURLResponse)?.statusCode ?? -1)")
            return nil
        }

        // Parse as array of dictionaries
        guard let jsonArray = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
              let first = jsonArray.first else { return nil }
        
        return DFSLineup.from(dict: first)
    }
    
    // MARK: - Parsing Helpers
    
    private static func parsePicksRow(_ picks: PicksValue<GaryPick>?) -> [GaryPick] {
        guard let picks = picks else { return [] }
        
        if let arr = picks.asArray { return arr }
        if let str = picks.asString, let data = str.data(using: .utf8) {
            let json = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] ?? []
            return json.compactMap { GaryPick.from(dict: $0) }
        }
        return []
    }
    
    private static func parsePropPicksRow(_ picks: PicksValue<PropPick>?) -> [PropPick]? {
        guard let picks = picks else { return nil }
        
        if let arr = picks.asArray { return arr }
        if let str = picks.asString, !str.isEmpty, let data = str.data(using: .utf8) {
            let json = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] ?? []
            return json.compactMap { PropPick.from(dict: $0) }
        }
        return nil
    }
}
