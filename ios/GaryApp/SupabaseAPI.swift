import Foundation
import SwiftUI

// MARK: - Smart Cache for Performance
// Default: 60s for picks (need to stay fresh)
// Billfold: day-scoped cache keys plus a longer TTL so the daily snapshot stays hot after preload
// Pull-to-refresh always bypasses cache for fresh data

actor APICache {
    static let shared = APICache()

    private var cache: [String: (data: Any, timestamp: Date)] = [:]
    private let ttl: TimeInterval = 60 // 60 second default
    static let liveContentTTL: TimeInterval = 15 // picks/props/DFS should reflect Supabase edits quickly
    static let recentResultsTTL: TimeInterval = 20 // recent result surfaces can refresh often
    static let billfoldTTL: TimeInterval = 60 * 60 * 36 // 36 hours; daily invalidation is handled by a 7am EST cache scope key

    func get<T>(_ key: String, ttl override: TimeInterval? = nil) -> T? {
        let effectiveTTL = override ?? ttl
        guard let entry = cache[key],
              Date().timeIntervalSince(entry.timestamp) < effectiveTTL,
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

    /// Billfold rolls over after the daily 7:00 AM EST results ingest.
    static func billfoldSnapshotWindowKey(for date: Date = Date()) -> String {
        guard let tz = TimeZone(identifier: "America/New_York") else {
            return formatDateEST(date)
        }

        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = tz

        let startOfToday = cal.startOfDay(for: date)
        guard let refreshCutoff = cal.date(byAdding: .hour, value: 7, to: startOfToday) else {
            return formatDateEST(date)
        }

        if date >= refreshCutoff {
            return formatDateEST(refreshCutoff)
        }

        let previousRefresh = cal.date(byAdding: .day, value: -1, to: refreshCutoff) ?? refreshCutoff
        return formatDateEST(previousRefresh)
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
            case "WC": return "trophy.fill"
            case "MLB": return "baseball.fill"
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
            case "MLB": return Color(hex: "#2D5A27")
            case "WC": return Color(hex: "#14B8A6")
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

    private static func fetchDecodablePage<T: Decodable>(table: String, query: [URLQueryItem]) async throws -> [T] {
        let url = buildURL(table: table, query: query)
        let (data, response) = try await URLSession.shared.data(for: makeRequest(url: url))
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            print("[SupabaseAPI] \(table) fetch failed: HTTP \((response as? HTTPURLResponse)?.statusCode ?? -1)")
            return []
        }

        do {
            return try JSONDecoder().decode([T].self, from: data)
        } catch {
            print("[SupabaseAPI] \(table) decode error: \(error.localizedDescription)")
            return []
        }
    }

    private static func fetchAllPages<T: Decodable>(
        table: String,
        baseQuery: [URLQueryItem],
        pageSize: Int = 500
    ) async throws -> [T] {
        var allRows: [T] = []
        var offset = 0

        while true {
            var query = baseQuery
            query.append(URLQueryItem(name: "limit", value: "\(pageSize)"))
            query.append(URLQueryItem(name: "offset", value: "\(offset)"))

            let page: [T] = try await fetchDecodablePage(table: table, query: query)
            allRows.append(contentsOf: page)

            if page.count < pageSize {
                break
            }

            offset += pageSize
        }

        return allRows
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

    // MARK: - Insight Connections ("Today's Edges" hub)

    /// The day before `todayEST()` — the hub's "yesterday" for the graded-edge
    /// track record. Rollover-aware: between midnight and 3am EST, todayEST()
    /// is already yesterday's slate, so this returns two calendar days back
    /// (unlike the plain-calendar `yesterdayEST()` used elsewhere).
    static func hubGradedDateEST() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone(identifier: "America/New_York")
        var cal = Calendar(identifier: .gregorian)
        if let tz = TimeZone(identifier: "America/New_York") { cal.timeZone = tz }
        guard let hubToday = formatter.date(from: todayEST()),
              let prior = cal.date(byAdding: .day, value: -1, to: hubToday) else { return yesterdayEST() }
        return formatter.string(from: prior)
    }

    /// Today's live-score snapshots (status/detail/scores per game), written by
    /// the 2-minute poller. Returns [] on any failure.
    static func fetchLiveScores(date: String) async -> [LiveScore] {
        let url = buildURL(table: "live_scores", query: [
            URLQueryItem(name: "select", value: "league,game_id,away_abbr,home_abbr,away_score,home_score,status,detail,outs,bases"),
            URLQueryItem(name: "date", value: "eq.\(date)")
        ])
        guard let (data, response) = try? await URLSession.shared.data(for: makeRequest(url: url)),
              let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode),
              let rows = try? JSONDecoder().decode([LiveScore].self, from: data) else { return [] }
        return rows
    }

    /// One betting-angle wire item for the Home "Wire" feed — a result framed
    /// against the closing number, a line move, an injury with its market
    /// consequence, a curated X voice, or league pace. Written 3x daily by
    /// run-wire-items.js.
    struct WireItem: Decodable, Identifiable {
        struct Meta: Decodable { let body: String? }
        let id: Int?
        let date: String?
        let league: String?
        let kind: String?          // result | line_move | injury | voice | pace
        let headline: String?
        let subline: String?
        let source_handle: String? // set for kind == voice ("@handle")
        let game: String?
        let relevance_score: Int?
        /// meta.body = the deeper read revealed by the inline expand.
        let meta: Meta?
    }

    /// Today's wire items, lead-worthiest first. Returns [] on any failure.
    static func fetchWireItems(date: String, limit: Int = 12) async -> [WireItem] {
        let url = buildURL(table: "wire_items", query: [
            URLQueryItem(name: "select", value: "id,date,league,kind,headline,subline,source_handle,game,relevance_score,meta"),
            URLQueryItem(name: "date", value: "eq.\(date)"),
            URLQueryItem(name: "order", value: "relevance_score.desc.nullslast"),
            URLQueryItem(name: "limit", value: "\(limit)")
        ])
        guard let (data, response) = try? await URLSession.shared.data(for: makeRequest(url: url)),
              let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode),
              let rows = try? JSONDecoder().decode([WireItem].self, from: data) else { return [] }
        return rows
    }

    /// League-wide market results for one settled night (overs record,
    /// favorites record, dog flat-stake units) — one row per league, written
    /// nightly by run-market-pulse.js after grading.
    struct MarketPulseRow: Decodable {
        let date: String?
        let league: String?
        let overs_wins: Int?
        let overs_losses: Int?
        let overs_pushes: Int?
        let fav_wins: Int?
        let fav_losses: Int?
        let dog_wins: Int?
        let dog_losses: Int?
        let dog_net_units: Double?
        let games_counted: Int?
    }

    /// Market pulse rows for a date. Returns [] on any failure.
    static func fetchMarketPulse(date: String) async -> [MarketPulseRow] {
        let url = buildURL(table: "market_pulse", query: [
            URLQueryItem(name: "select", value: "date,league,overs_wins,overs_losses,overs_pushes,fav_wins,fav_losses,dog_wins,dog_losses,dog_net_units,games_counted"),
            URLQueryItem(name: "date", value: "eq.\(date)")
        ])
        guard let (data, response) = try? await URLSession.shared.data(for: makeRequest(url: url)),
              let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode),
              let rows = try? JSONDecoder().decode([MarketPulseRow].self, from: data) else { return [] }
        return rows
    }

    /// Fetch a player's full insight pack for a date (the Hub breakdown view).
    /// Returns nil when no pack exists or on any failure — the card back
    /// simply hides the breakdown affordance gracefully.
    static func fetchPlayerInsightCard(date: String, playerId: String) async -> PlayerInsightPack? {
        let url = buildURL(table: "player_insight_cards", query: [
            URLQueryItem(name: "select", value: "player_id,player_name,payload"),
            URLQueryItem(name: "date", value: "eq.\(date)"),
            URLQueryItem(name: "player_id", value: "eq.\(playerId)")
        ])
        guard let (data, response) = try? await URLSession.shared.data(for: makeRequest(url: url)),
              let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode),
              let rows = try? JSONDecoder().decode([PlayerInsightCardRow].self, from: data) else { return nil }
        return rows.first?.payload
    }

    /// All of a date's player insight packs (one fetch, shared across the
    /// Picks carousel) — each game page filters to its own matchup via the
    /// pack's `game` label. 30-min in-memory cache, same idiom as DFS lineups.
    private static var _playerIntelCache: (date: String, rows: [PlayerInsightCardRow], at: Date)?
    static func fetchPlayerIntelRows(date: String) async -> [PlayerInsightCardRow] {
        if let c = _playerIntelCache, c.date == date, Date().timeIntervalSince(c.at) < 1800 {
            return c.rows
        }
        let url = buildURL(table: "player_insight_cards", query: [
            URLQueryItem(name: "select", value: "player_id,player_name,team_abbr,game_id,payload"),
            URLQueryItem(name: "date", value: "eq.\(date)"),
            URLQueryItem(name: "order", value: "player_name.asc")
        ])
        guard let (data, response) = try? await URLSession.shared.data(for: makeRequest(url: url)),
              let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode),
              let rows = try? JSONDecoder().decode([PlayerInsightCardRow].self, from: data) else { return [] }
        _playerIntelCache = (date, rows, Date())
        return rows
    }

    /// The full day's slate — every game + opening lines (daily_slate,
    /// written at the 5am plan step). The board exists before picks do.
    static func fetchDailySlate(date: String) async -> [DailySlateRow] {
        let url = buildURL(table: "daily_slate", query: [
            URLQueryItem(name: "select", value: "league,away_team,home_team,commence_time,venue,spread,ml_home,ml_away,total"),
            URLQueryItem(name: "date", value: "eq.\(date)"),
            URLQueryItem(name: "order", value: "commence_time.asc")
        ])
        guard let (data, response) = try? await URLSession.shared.data(for: makeRequest(url: url)),
              let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode),
              let rows = try? JSONDecoder().decode([DailySlateRow].self, from: data) else { return [] }
        return rows
    }

    /// The night's betting recaps (game_recaps): headline + 2-4 sentence
    /// story per settled game Gary picked — the story player's slides.
    /// Live streaks as of the last completed night — newest snapshot wins
    /// (no date math at the call site; the latest written date is the truth).
    static func fetchStreaks() async -> [StreakRow] {
        let url = buildURL(table: "streaks", query: [
            URLQueryItem(name: "select", value: "game_date,league,subject_type,subject,team,kind,length,detail,next_game"),
            URLQueryItem(name: "order", value: "game_date.desc,length.desc"),
            URLQueryItem(name: "limit", value: "200")
        ])
        guard let (data, response) = try? await URLSession.shared.data(for: makeRequest(url: url)),
              let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode),
              let rows = try? JSONDecoder().decode([StreakRow].self, from: data) else { return [] }
        // Latest snapshot PER LEAGUE — a global latest date would evict any
        // league whose pipeline wrote a day earlier than its siblings.
        var latestByLeague: [String: String] = [:]
        for r in rows {
            guard let lg = r.league, let d = r.game_date else { continue }
            if let cur = latestByLeague[lg] { if d > cur { latestByLeague[lg] = d } }
            else { latestByLeague[lg] = d }
        }
        return rows.filter { r in
            guard let lg = r.league, let d = r.game_date else { return false }
            return latestByLeague[lg] == d
        }
    }

    /// Last night across the whole league — every homer, multi-hit night and
    /// strikeout show, Gary's result attached where he had a position.
    static func fetchNightHighlights(date: String) async -> [NightHighlightRow] {
        let url = buildURL(table: "night_highlights", query: [
            URLQueryItem(name: "select", value: "league,category,player_name,team,detail,gary_result"),
            URLQueryItem(name: "game_date", value: "eq.\(date)"),
            URLQueryItem(name: "order", value: "category.asc")
        ])
        guard let (data, response) = try? await URLSession.shared.data(for: makeRequest(url: url)),
              let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode),
              let rows = try? JSONDecoder().decode([NightHighlightRow].self, from: data) else { return [] }
        return rows
    }

    static func fetchGameRecaps(date: String) async -> [GameRecapRow] {
        let url = buildURL(table: "game_recaps", query: [
            URLQueryItem(name: "select", value: "game_date,league,matchup,pick_text,result,headline,recap,bullets"),
            URLQueryItem(name: "game_date", value: "eq.\(date)"),
            URLQueryItem(name: "order", value: "result.desc")
        ])
        guard let (data, response) = try? await URLSession.shared.data(for: makeRequest(url: url)),
              let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode),
              let rows = try? JSONDecoder().decode([GameRecapRow].self, from: data) else { return [] }
        return rows
    }

    /// The fact check for one graded pick — claims from the rationale graded
    /// right/wrong/unclear against what actually happened (pick_fact_checks,
    /// written by the nightly grader). Keyed exactly like game_results.
    static func fetchFactCheck(date: String, matchup: String) async -> FactCheckRow? {
        let url = buildURL(table: "pick_fact_checks", query: [
            URLQueryItem(name: "select", value: "claims,right_count,wrong_count"),
            URLQueryItem(name: "game_date", value: "eq.\(date)"),
            URLQueryItem(name: "matchup", value: "eq.\(matchup)")
        ])
        guard let (data, response) = try? await URLSession.shared.data(for: makeRequest(url: url)),
              let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode),
              let rows = try? JSONDecoder().decode([FactCheckRow].self, from: data) else { return nil }
        return rows.first
    }

    /// Graded-edge tally for a date: how many hub edges hit vs were graded
    /// (hit + miss; pushes excluded). Powers the hub's track-record line.
    /// Returns nil on any failure or when nothing is graded yet.
    static func fetchInsightHitRate(date: String) async -> (hit: Int, graded: Int)? {
        struct ResultRow: Decodable { let result: String? }
        let url = buildURL(table: "insight_connections", query: [
            URLQueryItem(name: "select", value: "result"),
            URLQueryItem(name: "date", value: "eq.\(date)"),
            URLQueryItem(name: "result", value: "not.is.null")
        ])
        guard let (data, response) = try? await URLSession.shared.data(for: makeRequest(url: url)),
              let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode),
              let rows = try? JSONDecoder().decode([ResultRow].self, from: data) else { return nil }
        let hit = rows.filter { $0.result == "hit" }.count
        let miss = rows.filter { $0.result == "miss" }.count
        let graded = hit + miss
        return graded > 0 ? (hit, graded) : nil
    }

    /// One ledger row per insight card (league/category/result) — fuels the
    /// Home front page: per-lane Receipts records (graded days) and the
    /// "edges posted tonight" door count (today). Returns [] on any failure.
    struct InsightLedgerRow: Decodable {
        let league: String?
        let category: String?
        let result: String?
    }
    /// Anonymous, durable per-install identity — what entitlements key on
    /// when nobody is signed in.
    static var installationId: String {
        let key = "garyInstallationId"
        if let v = UserDefaults.standard.string(forKey: key) { return v }
        let v = UUID().uuidString
        UserDefaults.standard.set(v, forKey: key)
        return v
    }

    /// The identity entitlements key on — the signed-in auth user when there
    /// is one, otherwise the anonymous install. This is the
    /// `client_reference_id` that rides to Stripe checkout. Reads AuthManager's
    /// backing store directly (same UserDefaults key) so non-MainActor callers
    /// stay simple.
    static var identityId: String {
        if let uid = UserDefaults.standard.string(forKey: "gary_user_id"), !uid.isEmpty { return uid }
        return installationId
    }

    /// Active Stripe-purchased entitlements ("MLB", "ALL", ...). Union of
    /// account and device grants, so a board bought signed-out (keyed to the
    /// install) stays unlocked after signing in.
    static func fetchEntitlements() async -> Set<String> {
        struct Row: Decodable { let product_key: String? }
        let ids = Set([identityId, installationId])
        let orFilter = ids.map { "installation_id.eq.\($0)" }.joined(separator: ",")
        let url = buildURL(table: "user_entitlements", query: [
            URLQueryItem(name: "select", value: "product_key"),
            URLQueryItem(name: "or", value: "(\(orFilter))"),
            URLQueryItem(name: "status", value: "eq.active")
        ])
        guard let (data, response) = try? await URLSession.shared.data(for: makeRequest(url: url)),
              let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode),
              let rows = try? JSONDecoder().decode([Row].self, from: data) else { return [] }
        return Set(rows.compactMap { $0.product_key })
    }

    /// Server-created Stripe Checkout for bundles ("any two sports") — the
    /// sport selection rides in session metadata, which payment links can't
    /// carry. Debug builds checkout in Stripe test mode; Release is live.
    static func createCheckout(leagues: [String]) async -> URL? {
        guard let url = URL(string: "\(Secrets.supabaseURL)/functions/v1/create-checkout") else { return nil }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(Secrets.supabaseAnonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(Secrets.supabaseAnonKey)", forHTTPHeaderField: "Authorization")
        #if DEBUG
        let mode = "test"
        #else
        let mode = "live"
        #endif
        req.httpBody = try? JSONSerialization.data(withJSONObject: [
            "leagues": leagues, "identity": identityId, "mode": mode,
        ])
        guard let (data, response) = try? await URLSession.shared.data(for: req),
              let http = response as? HTTPURLResponse, http.statusCode == 200,
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let urlString = obj["url"] as? String else { return nil }
        return URL(string: urlString)
    }

    /// Fire-and-forget conversion-funnel event → the shared `app_events` table
    /// via the `log_app_event` SECURITY DEFINER RPC (same trust model as
    /// `register_push_token`: the anon key can write but can't read/enumerate).
    /// The web pricing page posts to the SAME RPC, so iOS + web land in one
    /// funnel. Never throws, never blocks UI — detached and best-effort.
    static func logEvent(_ event: String, _ props: [String: Any] = [:]) {
        guard let url = URL(string: "\(Secrets.supabaseURL)/rest/v1/rpc/log_app_event") else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(Secrets.supabaseAnonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(Secrets.supabaseAnonKey)", forHTTPHeaderField: "Authorization")
        let payload: [String: Any] = [
            "p_event": event,
            "p_identity": identityId,
            "p_platform": "ios",
            "p_props": props,
        ]
        guard let body = try? JSONSerialization.data(withJSONObject: payload) else { return }
        req.httpBody = body
        Task.detached { _ = try? await URLSession.shared.data(for: req) }
    }

    static func fetchInsightLedger(date: String) async -> [InsightLedgerRow] {
        let url = buildURL(table: "insight_connections", query: [
            URLQueryItem(name: "select", value: "league,category,result"),
            URLQueryItem(name: "date", value: "eq.\(date)")
        ])
        guard let (data, response) = try? await URLSession.shared.data(for: makeRequest(url: url)),
              let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode),
              let rows = try? JSONDecoder().decode([InsightLedgerRow].self, from: data) else { return [] }
        return rows
    }

    /// Fetch hub connections for a specific date + league (e.g. "MLB" / "NBA").
    /// Mirrors `fetchDailyPicks`: anon headers, dual `eq.` filter, 2xx guard
    /// returning [] (never throws on HTTP/decode failure). Returns [] when
    /// nothing exists; the hub renders an honest empty state.
    static func fetchInsightConnections(date: String, league: String) async throws -> [Connection] {
        let url = buildURL(table: "insight_connections", query: [
            URLQueryItem(name: "select", value: "date,league,category,headline,detail,game,value,tone,spark,line_val,relevance_score,player_id,game_id,meta,result,result_note"),
            URLQueryItem(name: "date", value: "eq.\(date)"),
            URLQueryItem(name: "league", value: "eq.\(league)"),
            URLQueryItem(name: "order", value: "relevance_score.desc")
        ])

        let (data, response) = try await URLSession.shared.data(for: makeRequest(url: url))
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            print("[SupabaseAPI] fetchInsightConnections failed: HTTP \((response as? HTTPURLResponse)?.statusCode ?? -1)")
            return []
        }
        do {
            // Flat table, decoded row-by-row: one malformed row (e.g. a future
            // meta shape) drops one card, never the league's whole day.
            struct Lossy: Decodable {
                let value: Connection?
                init(from decoder: Decoder) throws { value = try? Connection(from: decoder) }
            }
            let rows = try JSONDecoder().decode([Lossy].self, from: data)
            let conns = rows.compactMap { $0.value }
            if conns.count != rows.count {
                print("[SupabaseAPI] fetchInsightConnections(\(league)): dropped \(rows.count - conns.count) undecodable row(s)")
            }
            return conns
        } catch {
            print("[SupabaseAPI] fetchInsightConnections decode error: \(error.localizedDescription)")
            return []
        }
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
    
    // MARK: - Upcoming NCAAB Tournament Picks

    /// Fetch NCAAB picks for today and future dates (tournament games stored in advance)
    /// Returns only NCAAB picks with date >= today so all active tournament picks show
    static func fetchUpcomingNCAABPicks(afterDate: String) async throws -> [GaryPick] {
        // Fetch daily_picks rows with date > today (today is already fetched by fetchDailyPicks)
        let url = buildURL(table: "daily_picks", query: [
            URLQueryItem(name: "select", value: "picks::text,date"),
            URLQueryItem(name: "date", value: "gt.\(afterDate)"),
            URLQueryItem(name: "order", value: "date.asc")
        ])

        let (data, response) = try await URLSession.shared.data(for: makeRequest(url: url))
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            return []
        }

        let rows = try JSONDecoder().decode([DailyPicksRow].self, from: data)
        var allPicks: [GaryPick] = []
        for row in rows {
            let picks = parsePicksRow(row.picks)
            // Only include NCAAB picks from future dates
            let ncaabPicks = picks.filter { ($0.league ?? "").uppercased() == "NCAAB" }
            allPicks.append(contentsOf: ncaabPicks)
        }
        return allPicks
    }

    // MARK: - Combined Picks

    /// Fetch all picks: non-NFL from daily_picks + NFL from weekly_nfl_picks + upcoming NCAAB tournament picks
    /// - Parameter forceRefresh: Set to true for pull-to-refresh to bypass cache
    static func fetchAllPicks(date: String, forceRefresh: Bool = false) async throws -> [GaryPick] {
        let cacheKey = "allPicks_\(date)"

        // Check cache first (unless forcing refresh)
        if !forceRefresh, let cached: [GaryPick] = await APICache.shared.get(cacheKey, ttl: APICache.liveContentTTL) {
            return cached
        }

        // Fetch fresh data
        async let dailyTask = fetchDailyPicks(date: date)
        async let nflTask = fetchWeeklyNFLPicks()
        async let ncaabUpcomingTask = fetchUpcomingNCAABPicks(afterDate: date)

        let dailyPicks = (try? await dailyTask) ?? []
        let nflPicks = (try? await nflTask) ?? []
        let ncaabUpcoming = (try? await ncaabUpcomingTask) ?? []

        // Filter out NFL from daily picks (they come from weekly_nfl_picks)
        let nonNFLPicks = dailyPicks.filter { ($0.league ?? "").uppercased() != "NFL" }

        let result = nonNFLPicks + nflPicks + ncaabUpcoming

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
        if !forceRefresh, let cached: [PropPick] = await APICache.shared.get(cacheKey, ttl: APICache.liveContentTTL) {
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
            URLQueryItem(name: "order", value: "game_date.desc")
        ]
        
        if let since = dateFilter, !since.isEmpty {
            query.insert(URLQueryItem(name: "game_date", value: "gte.\(since)"), at: 1)
        }

        return try await fetchAllPages(table: "game_results", baseQuery: query)
    }
    
    /// Fetch NFL results from nfl_results table
    static func fetchNFLResults(since dateFilter: String?) async throws -> [GameResult] {
        var query = [
            URLQueryItem(name: "select", value: "*"),
            URLQueryItem(name: "order", value: "game_date.desc")
        ]
        
        if let since = dateFilter, !since.isEmpty {
            query.insert(URLQueryItem(name: "game_date", value: "gte.\(since)"), at: 1)
        }

        let nflResults: [NFLResult] = try await fetchAllPages(table: "nfl_results", baseQuery: query)
        return nflResults.map { $0.toGameResult() }
    }
    
    /// Fetch all game results (game_results + nfl_results combined)
    /// - Parameter forceRefresh: Set to true for pull-to-refresh to bypass cache
    static func fetchAllGameResults(since dateFilter: String?, forceRefresh: Bool = false, billfold: Bool = false) async throws -> [GameResult] {
        let cacheScope = billfold ? "_billfold_\(billfoldSnapshotWindowKey())" : ""
        let cacheKey = "gameResults_\(dateFilter ?? "all")\(cacheScope)"
        let cacheTTL: TimeInterval? = billfold ? APICache.billfoldTTL : APICache.recentResultsTTL

        // Check cache first (unless forcing refresh)
        if !forceRefresh, let cached: [GameResult] = await APICache.shared.get(cacheKey, ttl: cacheTTL) {
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
    
    /// Fetch all daily_picks rows (for TOPD matching)
    static func fetchAllDailyPicksRaw(forceRefresh: Bool = false, billfold: Bool = false) async throws -> [DailyPicksRow] {
        let cacheScope = billfold ? "_billfold_\(billfoldSnapshotWindowKey())" : ""
        let cacheKey = "dailyPicksRaw\(cacheScope)"
        let cacheTTL: TimeInterval? = billfold ? APICache.billfoldTTL : nil

        if !forceRefresh, let cached: [DailyPicksRow] = await APICache.shared.get(cacheKey, ttl: cacheTTL) {
            return cached
        }

        let query = [
            URLQueryItem(name: "select", value: "picks::text,date"),
            URLQueryItem(name: "order", value: "date.desc")
        ]
        let result: [DailyPicksRow] = try await fetchAllPages(table: "daily_picks", baseQuery: query)
        await APICache.shared.set(cacheKey, value: result)
        return result
    }

    /// Fetch prop results with optional date filter
    /// - Parameter forceRefresh: Set to true for pull-to-refresh to bypass cache
    static func fetchPropResults(since dateFilter: String?, forceRefresh: Bool = false, billfold: Bool = false) async throws -> [PropResult] {
        let cacheScope = billfold ? "_billfold_\(billfoldSnapshotWindowKey())" : ""
        let cacheKey = "propResults_\(dateFilter ?? "all")\(cacheScope)"
        let cacheTTL: TimeInterval? = billfold ? APICache.billfoldTTL : APICache.recentResultsTTL

        // Check cache first (unless forcing refresh)
        if !forceRefresh, let cached: [PropResult] = await APICache.shared.get(cacheKey, ttl: cacheTTL) {
            return cached
        }

        var query = [
            URLQueryItem(name: "select", value: "*"),
            URLQueryItem(name: "order", value: "game_date.desc")
        ]

        if let since = dateFilter, !since.isEmpty {
            query.insert(URLQueryItem(name: "game_date", value: "gte.\(since)"), at: 1)
        }

        let result: [PropResult] = try await fetchAllPages(table: "prop_results", baseQuery: query)
        await APICache.shared.set(cacheKey, value: result)
        return result
    }
    
    // MARK: - DFS Lineups (Gary's Fantasy)

    /// Fetch DFS lineups for a specific date
    /// - Parameter forceRefresh: Set to true for pull-to-refresh to bypass cache
    /// Returns lineups for both platforms (DraftKings, FanDuel) and available sports
    static func fetchDFSLineups(date: String, forceRefresh: Bool = false) async throws -> [DFSLineup] {
        let cacheKey = "dfsLineups_\(date)"

        // DFS lineups: 30-min cache. Lineups are generated once per day across all slates.
        // Pull-to-refresh bypasses cache if user needs fresh data.
        if !forceRefresh, let cached: [DFSLineup] = await APICache.shared.get(cacheKey, ttl: 60 * 30) {
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

        // Parse using JSONDecoder (DFSLineup is Decodable)
        let decoder = JSONDecoder()
        let result: [DFSLineup]
        do {
            result = try decoder.decode([DFSLineup].self, from: data)
        } catch {
            print("[SupabaseAPI] fetchDFSLineups: decode failed: \(error)")
            return []
        }

        // Store in cache
        await APICache.shared.set(cacheKey, value: result)

        return result
    }

    static func fetchRecentGameResults(limit: Int = 30, since dateFilter: String? = nil) async throws -> [GameResult] {
        var gameQuery = [
            URLQueryItem(name: "select", value: "*"),
            URLQueryItem(name: "order", value: "game_date.desc"),
            URLQueryItem(name: "limit", value: "\(limit)")
        ]
        var nflQuery = [
            URLQueryItem(name: "select", value: "*"),
            URLQueryItem(name: "order", value: "game_date.desc"),
            URLQueryItem(name: "limit", value: "\(limit)")
        ]

        if let since = dateFilter, !since.isEmpty {
            gameQuery.insert(URLQueryItem(name: "game_date", value: "gte.\(since)"), at: 1)
            nflQuery.insert(URLQueryItem(name: "game_date", value: "gte.\(since)"), at: 1)
        }

        let finalGameQuery = gameQuery
        let finalNFLQuery = nflQuery

        async let gameResults: [GameResult] = fetchDecodablePage(table: "game_results", query: finalGameQuery)
        async let nflResultsRaw: [NFLResult] = fetchDecodablePage(table: "nfl_results", query: finalNFLQuery)

        let combined = try await gameResults + nflResultsRaw.map { $0.toGameResult() }
        return Array(combined.sorted { ($0.game_date ?? "") > ($1.game_date ?? "") }.prefix(limit))
    }

    static func fetchRecentPropResults(limit: Int = 30, since dateFilter: String? = nil) async throws -> [PropResult] {
        var query = [
            URLQueryItem(name: "select", value: "*"),
            URLQueryItem(name: "order", value: "game_date.desc"),
            URLQueryItem(name: "limit", value: "\(limit)")
        ]

        if let since = dateFilter, !since.isEmpty {
            query.insert(URLQueryItem(name: "game_date", value: "gte.\(since)"), at: 1)
        }

        return try await fetchDecodablePage(table: "prop_results", query: query)
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
    
    static func parsePicksRow(_ picks: PicksValue<GaryPick>?) -> [GaryPick] {
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
