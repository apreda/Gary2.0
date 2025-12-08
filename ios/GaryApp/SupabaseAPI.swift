import Foundation

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
    static func todayEST() -> String {
        formatDateEST(Date())
    }
    
    private static func yesterdayEST() -> String {
        let yesterday = Calendar.current.date(byAdding: .day, value: -1, to: Date()) ?? Date()
        return formatDateEST(yesterday)
    }
    
    private static func formatDateEST(_ date: Date) -> String {
        let tz = TimeZone(identifier: "America/New_York")!
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = tz
        let comps = cal.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", comps.year!, comps.month!, comps.day!)
    }
    
    private static func isBefore10amEST() -> Bool {
        let tz = TimeZone(identifier: "America/New_York")!
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = tz
        return cal.component(.hour, from: Date()) < 10
    }
    
    /// Get NFL week start date (Monday) for a given date
    private static func getNFLWeekStart(for date: Date = Date()) -> String {
        let tz = TimeZone(identifier: "America/New_York")!
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
        var components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        components.queryItems = query
        return components.url!
    }
    
    // MARK: - Daily Picks (Non-NFL sports)
    
    /// Fetch daily picks for a specific date (excludes NFL)
    static func fetchDailyPicks(date: String) async throws -> [GaryPick] {
        let url = buildURL(table: "daily_picks", query: [
            URLQueryItem(name: "select", value: "picks::text,date"),
            URLQueryItem(name: "date", value: "eq.\(date)")
        ])
        
        let (data, response) = try await URLSession.shared.data(for: makeRequest(url: url))
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return [] }
        
        let rows = try JSONDecoder().decode([DailyPicksRow].self, from: data)
        guard let row = rows.first else {
            // Fallback to yesterday before 10am EST
            if isBefore10amEST() {
                return try await fetchDailyPicks(date: yesterdayEST())
            }
            return []
        }
        
        return parsePicksRow(row.picks)
    }
    
    // MARK: - Weekly NFL Picks
    
    /// Fetch NFL picks for the current week
    static func fetchWeeklyNFLPicks() async throws -> [GaryPick] {
        let weekStart = getNFLWeekStart()
        let url = buildURL(table: "weekly_nfl_picks", query: [
            URLQueryItem(name: "select", value: "picks::text,week_start,week_number,season"),
            URLQueryItem(name: "week_start", value: "eq.\(weekStart)")
        ])
        
        let (data, response) = try await URLSession.shared.data(for: makeRequest(url: url))
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return [] }
        
        let rows = try JSONDecoder().decode([WeeklyNFLPicksRow].self, from: data)
        
        if let row = rows.first {
            return parsePicksRow(row.picks)
        }
        
        // Fallback: try previous week on Sunday/Monday
        return try await fetchPreviousWeekNFLPicks()
    }
    
    private static func fetchPreviousWeekNFLPicks() async throws -> [GaryPick] {
        let tz = TimeZone(identifier: "America/New_York")!
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = tz
        
        let weekday = cal.component(.weekday, from: Date())
        guard weekday <= 2, // Sunday or Monday
              let lastWeek = cal.date(byAdding: .day, value: -7, to: Date()) else {
            return []
        }
        
        let prevWeekStart = getNFLWeekStart(for: lastWeek)
        let url = buildURL(table: "weekly_nfl_picks", query: [
            URLQueryItem(name: "select", value: "picks::text,week_start,week_number,season"),
            URLQueryItem(name: "week_start", value: "eq.\(prevWeekStart)")
        ])
        
        let (data, response) = try await URLSession.shared.data(for: makeRequest(url: url))
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return [] }
        
        let rows = try JSONDecoder().decode([WeeklyNFLPicksRow].self, from: data)
        return rows.first.map { parsePicksRow($0.picks) } ?? []
    }
    
    // MARK: - Combined Picks
    
    /// Fetch all picks: non-NFL from daily_picks + NFL from weekly_nfl_picks
    static func fetchAllPicks(date: String) async throws -> [GaryPick] {
        async let dailyTask = fetchDailyPicks(date: date)
        async let nflTask = fetchWeeklyNFLPicks()
        
        let dailyPicks = (try? await dailyTask) ?? []
        let nflPicks = (try? await nflTask) ?? []
        
        // Filter out NFL from daily picks (they come from weekly_nfl_picks)
        let nonNFLPicks = dailyPicks.filter { ($0.league ?? "").uppercased() != "NFL" }
        
        return nonNFLPicks + nflPicks
    }
    
    // MARK: - Prop Picks
    
    /// Fetch prop picks for a specific date
    static func fetchPropPicks(date: String) async throws -> [PropPick] {
        let url = buildURL(table: "prop_picks", query: [
            URLQueryItem(name: "select", value: "*"),
            URLQueryItem(name: "date", value: "eq.\(date)")
        ])
        
        let (data, response) = try await URLSession.shared.data(for: makeRequest(url: url))
        
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return [] }
        
        // Parse as array of dictionaries
        guard let jsonArray = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return [] }
        
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
        
        // If no picks for today, try fallback
        if allPicks.isEmpty {
            if isBefore10amEST() {
                return try await fetchPropPicks(date: yesterdayEST())
            }
            return try await fetchLatestPropPicks()
        }
        
        print("PropPicks: Loaded \(allPicks.count) picks for \(date)")
        return allPicks
    }
    
    private static func fetchLatestPropPicks() async throws -> [PropPick] {
        let url = buildURL(table: "prop_picks", query: [
            URLQueryItem(name: "select", value: "*"),
            URLQueryItem(name: "order", value: "date.desc"),
            URLQueryItem(name: "limit", value: "10")
        ])
        
        let (data, response) = try await URLSession.shared.data(for: makeRequest(url: url))
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return [] }
        
        // Parse as array of dictionaries to get row-level league
        guard let jsonArray = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return [] }
        
        var allPicks: [PropPick] = []
        
        for row in jsonArray {
            let rowLeague = row["league"] as? String
            
            // Get picks from the row
            var picksData: [[String: Any]] = []
            if let picksArray = row["picks"] as? [[String: Any]] {
                picksData = picksArray
            } else if let picksString = row["picks"] as? String,
                      let data = picksString.data(using: .utf8),
                      let parsed = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
                picksData = parsed
            }
            
            // Parse each pick, inheriting league from row if not in pick
            for var pickDict in picksData {
                if pickDict["league"] == nil && pickDict["sport"] == nil {
                    pickDict["league"] = rowLeague
                }
                if let pick = PropPick.from(dict: pickDict) {
                    allPicks.append(pick)
                }
            }
            
            // Return as soon as we have picks
            if !allPicks.isEmpty {
                return allPicks
            }
        }
        
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
        
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            print("GameResults fetch failed with status: \((response as? HTTPURLResponse)?.statusCode ?? -1)")
            return []
        }
        
        let decoder = JSONDecoder()
        do {
            return try decoder.decode([GameResult].self, from: data)
        } catch {
            print("GameResults decode error: \(error)")
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
        
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            print("NFLResults fetch failed with status: \((response as? HTTPURLResponse)?.statusCode ?? -1)")
            return []
        }
        
        let decoder = JSONDecoder()
        do {
            let nflResults = try decoder.decode([NFLResult].self, from: data)
            // Convert to GameResult for unified display
            return nflResults.map { $0.toGameResult() }
        } catch {
            print("NFLResults decode error: \(error)")
            return []
        }
    }
    
    /// Fetch all game results (game_results + nfl_results combined)
    static func fetchAllGameResults(since dateFilter: String?) async throws -> [GameResult] {
        async let gameTask = fetchGameResults(since: dateFilter)
        async let nflTask = fetchNFLResults(since: dateFilter)
        
        let gameResults = (try? await gameTask) ?? []
        let nflResults = (try? await nflTask) ?? []
        
        // Combine and sort by date descending
        let combined = gameResults + nflResults
        return combined.sorted { ($0.game_date ?? "") > ($1.game_date ?? "") }
    }
    
    /// Fetch prop results with optional date filter
    static func fetchPropResults(since dateFilter: String?) async throws -> [PropResult] {
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
        
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            print("PropResults fetch failed with status: \((response as? HTTPURLResponse)?.statusCode ?? -1)")
            return []
        }
        
        // Debug: print raw response
        if let jsonStr = String(data: data, encoding: .utf8) {
            print("PropResults raw response (first 500 chars): \(String(jsonStr.prefix(500)))")
        }
        
        let decoder = JSONDecoder()
        do {
            return try decoder.decode([PropResult].self, from: data)
        } catch {
            print("PropResults decode error: \(error)")
            return []
        }
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
