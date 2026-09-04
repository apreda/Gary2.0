import Foundation
import CoreFoundation
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

    /// A multi-source read keeps the underlying failure class instead of
    /// collapsing schema/auth bugs into a generic outage. Only a complete set
    /// of transient external failures may retain same-date last-good content.
    struct SourceReadFailure: LocalizedError {
        let source: String
        let transientExternal: Bool
        let underlying: [Error]

        var errorDescription: String? {
            "\(source) failed (\(transientExternal ? "transient external" : "internal/non-transient"))"
        }
    }

    /// Explicit allow-list for emergency last-good behavior. URL/config/decode
    /// mistakes are deliberately absent; a broad `error is URLError` check also
    /// includes bad URL, authentication and content-decode failures.
    static func isTransientExternalFailure(_ error: Error) -> Bool {
        if let aggregate = error as? SourceReadFailure {
            return aggregate.transientExternal
        }

        if let urlError = error as? URLError {
            switch urlError.code {
            case .timedOut,
                 .cannotFindHost,
                 .cannotConnectToHost,
                 .networkConnectionLost,
                 .dnsLookupFailed,
                 .notConnectedToInternet,
                 .internationalRoamingOff,
                 .callIsActive,
                 .dataNotAllowed,
                 .secureConnectionFailed,
                 .cannotLoadFromNetwork,
                 .resourceUnavailable:
                return true
            default:
                return false
            }
        }

        let nsError = error as NSError
        guard nsError.domain.hasPrefix("SupabaseAPI.") else { return false }
        return nsError.code == 408
            || nsError.code == 429
            || (500...599).contains(nsError.code)
    }

    // MARK: - Configuration

    private static var baseURL: URL {
        Secrets.supabaseRESTOriginURL.appendingPathComponent("/rest/v1")
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
    
    /// Current betting-slate date in Eastern time (YYYY-MM-DD format).
    /// The completed board, including its CASHED/LOST grades, remains the active
    /// day until 6:00 AM ET. At 6 the app advances every date-keyed surface to
    /// the new slate together instead of exposing a half-rolled board overnight.
    static let slateRolloverHourET = 6

    static func todayEST(now: Date = Date()) -> String {
        #if DEBUG
        // Local regression harness: lets simulator checks reopen a historical
        // board without changing device time. Never exists in TestFlight.
        let args = ProcessInfo.processInfo.arguments
        if let flag = args.firstIndex(of: "-previewSlateDate"), args.indices.contains(flag + 1) {
            return args[flag + 1]
        }
        #endif
        guard let tz = TimeZone(identifier: "America/New_York") else { return formatDateEST(now) }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = tz

        let hour = cal.component(.hour, from: now)

        // Before 6am ET, keep the completed prior slate and its grades visible.
        if hour < slateRolloverHourET {
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
    
    /// Yesterday's date in EST timezone (YYYY-MM-DD format).
    /// One day before the 6am-aware SLATE day (todayEST), NOT before wall-clock now:
    /// between midnight–6am ET, todayEST() is already yesterday's calendar date, so
    /// subtracting from `now` would return the slate day itself (showing 2-days-ago
    /// as "yesterday"). Anchor on todayEST so it stays one real day behind the slate.
    static func yesterdayEST() -> String {
        guard let tz = TimeZone(identifier: "America/New_York") else { return "" }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = tz
        let fmt = DateFormatter()
        fmt.timeZone = tz
        fmt.dateFormat = "yyyy-MM-dd"
        if let today = fmt.date(from: todayEST()),
           let yesterday = cal.date(byAdding: .day, value: -1, to: today) {
            return formatDateEST(yesterday)
        }
        // Fallback (parse failure): one day before wall-clock now.
        if let yesterday = cal.date(byAdding: .day, value: -1, to: Date()) {
            return formatDateEST(yesterday)
        }
        return formatDateEST(Date())
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

    /// Rolling 7-day GAME-pick record for the selected Picks desk. Passing nil
    /// keeps the all-sports behavior used by the optional ALL desk; a league
    /// tab must never inherit another sport's record. Pushes sit out of the
    /// headline count, matching the Hub's two-number read.
    static func fetchSevenDayPickRecord(league: String? = nil) async -> (w: Int, l: Int)? {
        guard let tz = TimeZone(identifier: "America/New_York") else { return nil }
        var cal = Calendar(identifier: .gregorian); cal.timeZone = tz
        let since = formatDateEST(cal.date(byAdding: .day, value: -7, to: Date()) ?? Date())
        guard let results = try? await fetchAllGameResults(since: since) else { return nil }
        var w = 0, l = 0
        let normalizedLeague = league?.uppercased()
        // PRESEASON NEVER COUNTS (founder law, Aug 21): this header record was
        // the one tally that skipped `.countable`, so the NFL Picks page wore
        // an all-exhibition "L7 10-5 · 67%" (caught in the Aug 24 parity
        // sweep). Rows stay graded on their cards; only the math excludes.
        for r in results.countable where !AppFlags.hidesWorldCupRow(r.league) {
            if let normalizedLeague, r.effectiveLeague?.uppercased() != normalizedLeague {
                continue
            }
            switch r.result?.lowercased() {
            case "won", "win", "w":   w += 1
            case "lost", "loss", "l": l += 1
            default: break
            }
        }
        return (w + l) > 0 ? (w, l) : nil
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

        // No results found in last 7 days - return zeros (neutral GaryIconBG mark will show)
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
            case "NFL": return GaryColors.nflAccent
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
        }
        // Defense in depth: no World Cup box in the Home form/record strips when
        // the WC feature is off.
        .filter { !AppFlags.hidesWorldCupRow($0.league) }
        .sorted { $0.total > $1.total }
    }

    /// Per-sport GAME-pick record over the last 7 days (game_results, all sports) —
    /// feeds the Home "7-Day Form" module. Every graded game pick; no props, no
    /// Winners filter. Sports with no graded games in the window drop out.
    static func fetchSevenDayFormBySport() async throws -> [SportRecord] {
        guard let tz = TimeZone(identifier: "America/New_York") else { return [] }
        var cal = Calendar(identifier: .gregorian); cal.timeZone = tz
        let since = formatDateEST(cal.date(byAdding: .day, value: -7, to: Date()) ?? Date())
        let results = try await fetchAllGameResults(since: since)

        var sportStats: [String: (wins: Int, losses: Int, pushes: Int)] = [:]
        for result in results {
            let league = result.league?.uppercased() ?? "OTHER"
            var current = sportStats[league] ?? (0, 0, 0)
            switch result.result?.lowercased() {
            case "won", "win", "w":   current.wins += 1
            case "lost", "loss", "l": current.losses += 1
            case "push", "p":         current.pushes += 1
            default: break
            }
            sportStats[league] = current
        }
        return sportStats.map { league, stats in
            SportRecord(league: league, wins: stats.wins, losses: stats.losses, pushes: stats.pushes)
        }
        // Defense in depth: no World Cup box in the 7-Day Form strip when the WC
        // feature is off.
        .filter { !AppFlags.hidesWorldCupRow($0.league) }
        // Only sports with a meaningful week — keeps end-of-season stragglers
        // (a stray NHL/NBA game) off the Home module; the active sports lead.
        .filter { $0.wins + $0.losses + $0.pushes >= 3 }
        .sorted { $0.total > $1.total }
    }

    /// Get the Tuesday week identity for an explicit Eastern calendar date.
    /// NFL storage is weekly, but every app surface still requests one slate day;
    /// deriving this from that requested day prevents a Thursday pick from leaking
    /// onto Sunday (or a prior week from appearing as today's card).
    private static func getNFLWeekStart(for dateString: String) -> String? {
        guard let tz = TimeZone(identifier: "America/New_York") else { return nil }
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = tz
        formatter.dateFormat = "yyyy-MM-dd"
        guard let date = formatter.date(from: dateString) else { return nil }

        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = tz

        let weekday = cal.component(.weekday, from: date)
        // The NFL slate is Tuesday through Monday: Tuesday = 3 in Calendar's
        // Sunday-based numbering. Monday therefore remains in the week that
        // began six days earlier instead of being split from Thu/Sun.
        let daysToSubtract = (weekday - 3 + 7) % 7

        guard let tuesday = cal.date(byAdding: .day, value: -daysToSubtract, to: date) else {
            return nil
        }
        return formatDateEST(tuesday)
    }

    /// The NFL season is named for the calendar year in which it starts.
    /// Preseason begins in August; January/February games belong to the prior year.
    private static func nflSeason(for dateString: String) -> Int? {
        let parts = dateString.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return parts[1] >= 8 ? parts[0] : parts[0] - 1
    }

    private static func easternCalendarDate(ofISO8601 string: String) -> String? {
        let standard = ISO8601DateFormatter()
        var parsed = standard.date(from: string)
        if parsed == nil {
            let fractional = ISO8601DateFormatter()
            fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            parsed = fractional.date(from: string)
        }
        guard let parsed else { return nil }
        return formatDateEST(parsed)
    }
    
    // MARK: - Network Helpers
    
    private static func makeRequest(url: URL) -> URLRequest {
        var request = URLRequest(url: url)
        // No Gary screen should spin forever when the data origin is unhealthy.
        // Callers keep their last-good snapshots or present an honest retry state.
        request.timeoutInterval = 15
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
            let status = (response as? HTTPURLResponse)?.statusCode ?? -1
            print("[SupabaseAPI] \(table) fetch failed: HTTP \(status)")
            throw NSError(
                domain: "SupabaseAPI.fetchDecodablePage.\(table)",
                code: status,
                userInfo: [NSLocalizedDescriptionKey: "\(table) returned HTTP \(status)"]
            )
        }

        return try JSONDecoder().decode([T].self, from: data)
    }

    private static func fetchAllPages<T: Decodable>(
        table: String,
        baseQuery: [URLQueryItem],
        pageSize: Int = 1_000
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
    /// THE WINNERS BOARD (founder GO, Sep 2 2026): one row per game pick —
    /// on the board or not, why (first_dog | big_game | review), and the
    /// reviewer's verdict. The Winners tab shows the on-board rows for any
    /// league that has rows for the date; a league with none (dates before
    /// the reviewer shipped) keeps the old slot curation.
    struct WinnersReviewRow: Decodable {
        let game_date: String?
        let league: String?
        let game_id: String?
        let pick_text: String?
        let on_board: Bool?
        let reason: String?
        let verdict: String?
    }

    /// Never throws: a failed read is an empty list, and the shelf falls back
    /// to slot curation rather than blanking the board.
    static func fetchWinnersReviews(date: String) async -> [WinnersReviewRow] {
        let url = buildURL(table: "winners_reviews", query: [
            URLQueryItem(name: "select", value: "game_date,league,game_id,pick_text,on_board,reason,verdict"),
            URLQueryItem(name: "game_date", value: "eq.\(date)")
        ])
        do {
            let (data, response) = try await URLSession.shared.data(for: makeRequest(url: url))
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                print("[SupabaseAPI] fetchWinnersReviews failed: HTTP \((response as? HTTPURLResponse)?.statusCode ?? -1)")
                return []
            }
            return try JSONDecoder().decode([WinnersReviewRow].self, from: data)
        } catch {
            print("[SupabaseAPI] fetchWinnersReviews failed: \(error.localizedDescription)")
            return []
        }
    }

    /// Immutable Winners publications. Empty is a valid board; failure throws.
    /// Private review evidence and rejected candidates never reach this endpoint.
    struct WinnersBoardSnapshot {
        var games: [GaryPick] = []
        var props: [PropPick] = []
        var gamePublicationIDs: [String] = []
        var propPublicationIDs: [String] = []
    }

    static let winnersAdmissionCutover = "2026-09-04"

    static func fetchWinnersBoard(date: String) async throws -> WinnersBoardSnapshot {
        let url = buildURL(table: "winners_board", query: [
            URLQueryItem(name: "select", value: "candidate_id,game_date,kind,league,pick_snapshot,admitted_at"),
            URLQueryItem(name: "game_date", value: "eq.\(date)"),
            URLQueryItem(name: "order", value: "admitted_at.asc,candidate_id.asc")
        ])
        let (data, response) = try await URLSession.shared.data(for: makeRequest(url: url))
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw NSError(domain: "SupabaseAPI.fetchWinnersBoard", code: (response as? HTTPURLResponse)?.statusCode ?? -1)
        }
        return try decodeWinnersBoard(data, date: date)
    }

    static func decodeWinnersBoard(_ data: Data, date: String) throws -> WinnersBoardSnapshot {
        guard let rows = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "Invalid Winners board"))
        }
        var snapshot = WinnersBoardSnapshot()
        var seen: Set<String> = []
        for row in rows {
            guard row["game_date"] as? String == date,
                  let publicationID = row["candidate_id"] as? String, !publicationID.isEmpty,
                  seen.insert(publicationID).inserted,
                  let league = row["league"] as? String, !league.isEmpty,
                  let kind = row["kind"] as? String, var ticket = row["pick_snapshot"] as? [String: Any] else {
                throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "Missing Winners ticket"))
            }
            if AppFlags.hidesWorldCupRow(league) { continue }
            if ticket["league"] == nil || ticket["league"] is NSNull { ticket["league"] = league }
            if let gameID = ticket["game_id"] as? String, let number = Int(gameID) { ticket["game_id"] = number }
            if kind == "game" {
                let ticketData = try JSONSerialization.data(withJSONObject: [ticket])
                let normalized = try normalizeStoredGamePickPayload(ticketData)
                let picks = try JSONDecoder().decode([GaryPick].self, from: normalized)
                try validateStoredGamePicks(picks, source: "winners_board")
                guard let pick = picks.first, pick.league?.uppercased() == league.uppercased() else {
                    throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "Winners game league mismatch"))
                }
                snapshot.games.append(pick)
                snapshot.gamePublicationIDs.append(publicationID)
            } else if kind == "prop" {
                if let line = ticket["line"] as? NSNumber, CFGetTypeID(line) != CFBooleanGetTypeID() { ticket["line"] = line.stringValue }
                guard let pick = PropPick.from(dict: ticket), pick.hasValidStoredPayload,
                      pick.effectiveLeague?.uppercased() == league.uppercased() else {
                    throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "Invalid Winners prop ticket"))
                }
                snapshot.props.append(pick)
                snapshot.propPublicationIDs.append(publicationID)
            } else {
                throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "Unknown Winners ticket kind"))
            }
        }
        return snapshot
    }

    /// Merge only within one date's cache. Earlier publications retain their
    /// original ticket and price even if a slower response arrives afterward.
    static func retainWinnersPublications(previous: WinnersBoardSnapshot?, incoming: WinnersBoardSnapshot) -> WinnersBoardSnapshot {
        guard var result = previous else { return incoming }
        var games = Set(result.gamePublicationIDs)
        var props = Set(result.propPublicationIDs)
        for (publicationID, pick) in zip(incoming.gamePublicationIDs, incoming.games) where games.insert(publicationID).inserted {
            result.gamePublicationIDs.append(publicationID)
            result.games.append(pick)
        }
        for (publicationID, pick) in zip(incoming.propPublicationIDs, incoming.props) where props.insert(publicationID).inserted {
            result.propPublicationIDs.append(publicationID)
            result.props.append(pick)
        }
        return result
    }

    static func fetchDailyPicks(date: String) async throws -> [GaryPick] {
        let url = buildURL(table: "daily_picks", query: [
            URLQueryItem(name: "select", value: "picks::text,date"),
            URLQueryItem(name: "date", value: "eq.\(date)")
        ])

        #if DEBUG
        // Kick the parked-preview fetch CONCURRENTLY (perf, Jul 13) — as a
        // serial tail it added a full round trip to every sim picks load.
        async let parkedPreview: [GaryPick] = ["2026-07-13", "2026-07-14"].contains(date)
            ? fetchParkedAllStarPicks(date: date) : []
        #endif

        let (data, response) = try await URLSession.shared.data(for: makeRequest(url: url))
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            let status = (response as? HTTPURLResponse)?.statusCode ?? -1
            print("[SupabaseAPI] fetchDailyPicks failed: HTTP \(status)")
            throw NSError(domain: "SupabaseAPI.fetchDailyPicks", code: status,
                          userInfo: [NSLocalizedDescriptionKey: "Daily picks returned HTTP \(status)"])
        }

        let rows = try JSONDecoder().decode([DailyPicksRow].self, from: data)
        // Defense in depth: drop any World Cup-tagged pick when the WC feature is
        // off (Apple 5.2.1) so no WC pick can reach a shelf, list, or card.
        var out: [GaryPick] = try rows.first.map { row in
            let decoded = try parsePicksRow(row.picks)
            try validateStoredGamePicks(decoded, source: "daily_picks")
            return decoded.filter { !AppFlags.hidesWorldCupRow($0.league) }
        } ?? []
        #if DEBUG
        // Sim preview of the PARKED All-Star board (production stays empty
        // until App Store approval). Living here means EVERY picks surface —
        // Picks tab, Home, shelves — behaves exactly like a normal pick day
        // in the sim. Compiled out of Release.
        if !out.contains(where: { ($0.type ?? "") == "special" }) {
            out += await parkedPreview
        }
        #endif
        return out
    }

    /// One row of the All-Star contest board (allstar_props): a participant,
    /// his season power, tonight's R1 line, and Gary's O/U call.
    struct AllStarPropRow: Decodable, Identifiable {
        let id: Int
        let player: String?
        let team: String?
        let season_hr: Int?
        let line: Double?
        let call: String?
        let odds: Int?
        let book: String?
        let reason: String?
        let win_odds: Int?
        let player_id: Int?
        /// "won"/"lost"/"push" once the call settles — graded LIVE during the
        /// event, so rows flip on-screen as rounds finish.
        let result: String?
    }

    /// THE CONTESTANTS list (Jul 13 2026 one-off): Sol's R1 over/under call on
    /// every Derby participant — plus market "extra" for the added plays list.
    static func fetchAllStarProps(date: String, event: String = "hr_derby", market: String = "r1_hr_ou") async -> [AllStarPropRow] {
        let url = buildURL(table: "allstar_props", query: [
            URLQueryItem(name: "select", value: "id,player,team,season_hr,line,call,odds,book,reason,win_odds,player_id,result"),
            URLQueryItem(name: "date", value: "eq.\(date)"),
            URLQueryItem(name: "event", value: "eq.\(event)"),
            URLQueryItem(name: "market", value: market == "extra" ? "like.extra*" : "eq.\(market)"),
            URLQueryItem(name: "order", value: "season_hr.desc.nullslast")
        ])
        guard let (data, response) = try? await URLSession.shared.data(for: makeRequest(url: url)),
              let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode),
              let rows = try? JSONDecoder().decode([AllStarPropRow].self, from: data) else { return [] }
        return rows
    }

    #if DEBUG
    /// DEBUG preview only: the All-Star boards parked in test_daily_picks
    /// (test_name 'allstar-parked') until App Store approval — lets the sim
    /// render the break surfaces while production stays clean. Compiled out
    /// of Release, so no shipped build can ever read the parked table.
    static func fetchParkedAllStarPicks(date: String) async -> [GaryPick] {
        let url = buildURL(table: "test_daily_picks", query: [
            URLQueryItem(name: "select", value: "picks::text,date"),
            URLQueryItem(name: "date", value: "eq.\(date)"),
            URLQueryItem(name: "test_name", value: "eq.allstar-parked")
        ])
        guard let (data, response) = try? await URLSession.shared.data(for: makeRequest(url: url)),
              let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode),
              let rows = try? JSONDecoder().decode([DailyPicksRow].self, from: data),
              let row = rows.first else { return [] }
        return (try? parsePicksRow(row.picks)) ?? []
    }
    #endif

    // MARK: - Insight Connections ("Today's Edges" hub)

    /// The day before `todayEST()` — the hub's "yesterday" for the graded-edge
    /// track record. Rollover-aware: between midnight and 6am ET, todayEST()
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
    /// the 2-minute poller. nil means transport/HTTP/decode failure; an empty
    /// array is a successful response with no rows. Keeping those states distinct
    /// prevents one network hiccup from wiping every live card.
    static func fetchLiveScores(date: String) async -> [LiveScore]? {
        let url = buildURL(table: "live_scores", query: [
            URLQueryItem(name: "select", value: "league,game_id,away_abbr,home_abbr,away_score,home_score,status,detail,outs,bases,events"),
            URLQueryItem(name: "date", value: "eq.\(date)")
        ])
        guard let (data, response) = try? await URLSession.shared.data(for: makeRequest(url: url)),
              let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode),
              let rows = try? JSONDecoder().decode([LiveScore].self, from: data) else { return nil }
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
        // Defense in depth: no World Cup wire stories when the WC feature is off.
        return rows.filter { !AppFlags.hidesWorldCupRow($0.league) }
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
        // Per-game dogs/favs detail (MLB builder writes these into meta jsonb).
        // winner_is_dog: true = winning +ML underdog, false = winning -ML favorite,
        // null = no pre-game ML snapshot or a push (skip from the dogs/favs view).
        let meta: [MarketPulseGame]?
    }

    struct MarketPulseGame: Decodable {
        let matchup: String?
        let winner_team: String?
        let winner_ml: Int?
        let winner_is_dog: Bool?
        let away_score: Int?
        let home_score: Int?
    }

    /// Market pulse rows for a date. Returns [] on any failure.
    static func fetchMarketPulse(date: String) async -> [MarketPulseRow] {
        let url = buildURL(table: "market_pulse", query: [
            URLQueryItem(name: "select", value: "date,league,overs_wins,overs_losses,overs_pushes,fav_wins,fav_losses,dog_wins,dog_losses,dog_net_units,games_counted,meta"),
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

    /// League-wide "League Pulse" tables for a date+league (one row per tab).
    /// Generic schema: each row carries its own columns[] + rows[] so the UI
    /// renders every tab with no per-tab code. 30-min in-memory cache (keyed by
    /// date+league), [] on any failure — the section then collapses.
    private static var _leaguePulseCache: [String: (rows: [LeaguePulseRow], at: Date)] = [:]
    /// - Parameter forceRefresh: bypass the 30-min cache (pull-to-refresh / EST
    ///   day rollover) so a manual refresh and the 6am slate flip always refetch.
    static func fetchLeaguePulse(date: String, league: String, forceRefresh: Bool = false) async -> [LeaguePulseRow] {
        let cacheKey = "\(date)|\(league)"
        if !forceRefresh, let c = _leaguePulseCache[cacheKey], Date().timeIntervalSince(c.at) < 1800 {
            return c.rows
        }
        let url = buildURL(table: "league_pulse", query: [
            URLQueryItem(name: "select", value: "date,league,tab,title,subtitle,sort_note,columns,rows"),
            URLQueryItem(name: "date", value: "eq.\(date)"),
            URLQueryItem(name: "league", value: "eq.\(league)"),
            URLQueryItem(name: "order", value: "tab.asc")
        ])
        guard let (data, response) = try? await URLSession.shared.data(for: makeRequest(url: url)),
              let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode),
              let rows = try? JSONDecoder().decode([LeaguePulseRow].self, from: data) else { return [] }
        _leaguePulseCache[cacheKey] = (rows, Date())
        return rows
    }

    /// The full day's slate — every game + opening lines (daily_slate,
    /// written at the 5am plan step). The board exists before picks do.
    struct DailySlateFetch {
        let rows: [DailySlateRow]
        let succeeded: Bool
        /// Only transport/rate-limit/provider-server failures may retain a
        /// same-date last-good slate. Auth/config/schema failures must surface.
        let transientExternalFailure: Bool
        /// The request died because OUR OWN task was cancelled (SwiftUI tears
        /// down a .refreshable task on mid-pull re-render). Neither a success
        /// nor a failure: last-good stands, no banner (Aug 26 sim repro —
        /// "cancelled" was being branded a source failure on every pull).
        var cancelled: Bool = false
    }

    /// A thrown error that means WE cancelled the work, not that the source
    /// failed. Never a banner, never a wipe — the state simply stands.
    static func isCancellation(_ error: Error) -> Bool {
        if error is CancellationError { return true }
        if let urlError = error as? URLError, urlError.code == .cancelled { return true }
        let ns = error as NSError
        return ns.domain == NSURLErrorDomain && ns.code == NSURLErrorCancelled
    }

    private static let dailySlateCacheKey = "gary.dailySlate.lastGood"
    private static let dailySlateCacheDateKey = "gary.dailySlate.lastGoodDate"

    private static func cachedDailySlate(date: String) -> [DailySlateRow] {
        let defaults = UserDefaults.standard
        guard defaults.string(forKey: dailySlateCacheDateKey) == date,
              let data = defaults.data(forKey: dailySlateCacheKey),
              let rows = try? JSONDecoder().decode([DailySlateRow].self, from: data) else { return [] }
        return rows
    }

    private static func storeDailySlate(_ rows: [DailySlateRow], date: String) {
        let defaults = UserDefaults.standard
        if rows.isEmpty {
            // A successful explicit empty is authoritative. Remove the same-day
            // snapshot so a later transient request cannot resurrect canceled
            // games from an earlier run.
            if defaults.string(forKey: dailySlateCacheDateKey) == date {
                defaults.removeObject(forKey: dailySlateCacheKey)
                defaults.removeObject(forKey: dailySlateCacheDateKey)
            }
            return
        }
        guard let data = try? JSONEncoder().encode(rows) else { return }
        defaults.set(date, forKey: dailySlateCacheDateKey)
        defaults.set(data, forKey: dailySlateCacheKey)
    }

    static func fetchDailySlate(date: String, forceRefresh: Bool = false) async -> [DailySlateRow] {
        await fetchDailySlateWithStatus(date: date, forceRefresh: forceRefresh).rows
    }

    static func fetchDailySlateWithStatus(date: String, forceRefresh: Bool = false) async -> DailySlateFetch {
        let url = buildURL(table: "daily_slate", query: [
            URLQueryItem(name: "select", value: "league,away_team,home_team,commence_time,scheduled_date,kickoff_status,game_status,status_detail,bdl_game_id,venue,spread,ml_home,ml_away,total,home_conference,away_conference,home_ranking,away_ranking"),
            URLQueryItem(name: "date", value: "eq.\(date)"),
            URLQueryItem(name: "order", value: "commence_time.asc")
        ])
        var request = makeRequest(url: url)
        request.timeoutInterval = 12
        // `daily_slate` is populated after the day first becomes visible. An app
        // opened before that write can otherwise keep an empty URL-cache response
        // even after pull-to-refresh. Always revalidate this small, day-scoped feed;
        // an explicit refresh additionally tells every intermediary not to reuse it.
        request.cachePolicy = .reloadIgnoringLocalCacheData
        if forceRefresh {
            request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
            request.setValue("no-cache", forHTTPHeaderField: "Pragma")
        }

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                let code = (response as? HTTPURLResponse)?.statusCode ?? -1
                print("[fetchDailySlate] HTTP \(code) \(date): \(String(data: data, encoding: .utf8)?.prefix(180) ?? "")")
                let isTransient = code == 429 || (500...599).contains(code)
                return DailySlateFetch(
                    rows: isTransient ? cachedDailySlate(date: date) : [],
                    succeeded: false,
                    transientExternalFailure: isTransient
                )
            }
            let rows = try JSONDecoder().decode([DailySlateRow].self, from: data)
            guard rows.allSatisfy(\.hasValidStoredPayload) else {
                throw DecodingError.dataCorrupted(
                    .init(codingPath: [], debugDescription: "daily_slate contains a row without required game identity")
                )
            }
            // Defense in depth: no World Cup games on the slate when the WC feature
            // is off — keeps a WC fixture out of every slate list and placeholder lane.
            let visible = rows.filter { !AppFlags.hidesWorldCupRow($0.league) }
            storeDailySlate(visible, date: date)
            return DailySlateFetch(rows: visible, succeeded: true, transientExternalFailure: false)
        } catch {
            print("[fetchDailySlate] error \(date): \(error.localizedDescription)")
            if isCancellation(error) {
                return DailySlateFetch(
                    rows: cachedDailySlate(date: date),
                    succeeded: false,
                    transientExternalFailure: true,
                    cancelled: true
                )
            }
            let isTransient = isTransientExternalFailure(error)
            return DailySlateFetch(
                rows: isTransient ? cachedDailySlate(date: date) : [],
                succeeded: false,
                transientExternalFailure: isTransient
            )
        }
    }

    /// Tomorrow's look-ahead board (tomorrow_board) — the "TOMORROW" Home state.
    /// One row per date carrying the precomputed countdown target/sport, the full
    /// scoreboard, big-games-to-watch, and by-sport starters/returns. The app does
    /// no slate-min math; everything is display-formatted server-side.
    static func fetchTomorrowBoard(date: String) async -> TomorrowBoard? {
        let url = buildURL(table: "tomorrow_board", query: [
            URLQueryItem(name: "select", value: "date,countdown_iso,countdown_sport,countdown_matchup,game_count,any_lines,board,big_games,starters,returns,form,run_profile,weather,league_avg_era,league_avg_xera"),
            URLQueryItem(name: "date", value: "eq.\(date)"),
            URLQueryItem(name: "limit", value: "1")
        ])
        do {
            let (data, response) = try await URLSession.shared.data(for: makeRequest(url: url))
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                // A 400 here usually means a select column was dropped from the table —
                // log it so the empty board is debuggable, not silent.
                print("[fetchTomorrowBoard] HTTP \((response as? HTTPURLResponse)?.statusCode ?? -1) \(date): \(String(data: data, encoding: .utf8)?.prefix(180) ?? "")")
                return nil
            }
            return try JSONDecoder().decode([TomorrowBoard].self, from: data).first
        } catch {
            print("[fetchTomorrowBoard] error \(date): \(error.localizedDescription)")
            return nil
        }
    }

    /// Today's look-ahead board. The scheduler's canonical writer stores every
    /// game-date snapshot in `tomorrow_board`, including the row whose date is
    /// today. Read that primary directly instead of probing the unwritten
    /// `today_board` table and treating the real source as a fallback.
    static func fetchTodayBoard(date: String) async -> TomorrowBoard? {
        return await fetchTomorrowBoard(date: date)
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

    /// `yyyy-MM-dd` one day after the given date string (UTC-safe, no TZ math).
    static func dayAfter(_ dateStr: String) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "UTC")
        guard let d = f.date(from: dateStr) else { return dateStr }
        return f.string(from: d.addingTimeInterval(86_400))
    }

    static func fetchGameRecaps(date: String) async -> [GameRecapRow] {
        // A sporting night spans two UTC dates: a 9pm-ET game (a World Cup night
        // kickoff, a late west-coast game) is graded under the NEXT day's UTC
        // date. Fetch the graded ET date AND the following day so those late
        // games' recaps — and their bullet summaries — aren't dropped from the
        // Morning headline carousel (the bug where the USA card showed a
        // headline but no bullets).
        let next = dayAfter(date)
        // `box` ships ahead of its migration: PostgREST 400s the WHOLE query on
        // an unknown column, which would empty the headline carousel. Ask for
        // it, and fall back to the columns that have always been there.
        func fetch(withBox: Bool) async -> [GameRecapRow]? {
            let cols = "game_date,league,matchup,pick_text,result,headline,recap,bullets"
            let url = buildURL(table: "game_recaps", query: [
                URLQueryItem(name: "select", value: withBox ? cols + ",box" : cols),
                URLQueryItem(name: "game_date", value: "in.(\(date),\(next))"),
                // Chronological, never result-sorted (founder, Aug 3): the old
                // result.desc put every CASHED recap first — a page of wins that
                // "would look fake and would be fake." Written-at order = the
                // night as it actually unfolded, losses where they landed.
                URLQueryItem(name: "order", value: "created_at.asc")
            ])
            guard let (data, response) = try? await URLSession.shared.data(for: makeRequest(url: url)),
                  let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode),
                  let rows = try? JSONDecoder().decode([GameRecapRow].self, from: data) else { return nil }
            return rows
        }
        var fetched = await fetch(withBox: true)
        if fetched == nil { fetched = await fetch(withBox: false) }
        guard let rows = fetched else { return [] }
        // Defense in depth: keep World Cup recaps out of the Home headline
        // carousel (the marquee + slides) when the WC feature is off.
        return rows.filter { !AppFlags.hidesWorldCupRow($0.league) }
    }

    /// The most recent WINNERS-only game record (the top-per-sport game picks the
    /// premium tab surfaces and we grade daily — `is_winners_pick` is stamped at
    /// grading time). Anchors on the date with the MOST winners results (the real
    /// slate) + its UTC-rollover day, matching the Home scorecard's logic — so a
    /// missed/empty day (an outage) shows the last real slate, not a lone
    /// straggler. Returns nil if nothing graded. Games only (props excluded).
    static func fetchYesterdayWinnersRecord() async -> (w: Int, l: Int, p: Int)? {
        struct Row: Decodable { let result: String?; let game_date: String? }
        let url = buildURL(table: "game_results", query: [
            URLQueryItem(name: "select", value: "result,game_date"),
            URLQueryItem(name: "is_winners_pick", value: "eq.true"),
            URLQueryItem(name: "order", value: "game_date.desc"),
            URLQueryItem(name: "limit", value: "60")
        ])
        guard let (data, response) = try? await URLSession.shared.data(for: makeRequest(url: url)),
              let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode),
              let rows = try? JSONDecoder().decode([Row].self, from: data), !rows.isEmpty else { return nil }
        var counts: [String: Int] = [:]
        for r in rows { if let d = r.game_date { counts[d, default: 0] += 1 } }
        guard let anchor = counts.max(by: { $0.value != $1.value ? $0.value < $1.value : $0.key < $1.key })?.key else { return nil }
        let nightSet: Set<String> = [anchor, dayAfter(anchor)]
        var w = 0, l = 0, p = 0
        for r in rows where nightSet.contains(r.game_date ?? "") {
            switch r.result?.lowercased() {
            case "won": w += 1
            case "lost": l += 1
            case "push": p += 1
            default: break
            }
        }
        return (w + l + p) > 0 ? (w, l, p) : nil
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

    /// Rolling graded record for the Hub masthead: every graded edge across
    /// the last `days` EST slate days (pushes excluded). Returns nil when the
    /// window has nothing graded (or on any failure) — the masthead falls back
    /// to yesterday's tally, then the plain date.
    static func fetchInsightRecord(days: Int) async -> (hit: Int, miss: Int)? {
        struct ResultRow: Decodable { let result: String? }
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "America/New_York")
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "America/New_York") ?? .current
        guard let today = f.date(from: todayEST()),
              let since = cal.date(byAdding: .day, value: -days, to: today) else { return nil }
        let url = buildURL(table: "insight_connections", query: [
            URLQueryItem(name: "select", value: "result"),
            URLQueryItem(name: "date", value: "gte.\(f.string(from: since))"),
            URLQueryItem(name: "result", value: "not.is.null")
        ])
        guard let (data, response) = try? await URLSession.shared.data(for: makeRequest(url: url)),
              let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode),
              let rows = try? JSONDecoder().decode([ResultRow].self, from: data) else { return nil }
        let hit = rows.filter { $0.result == "hit" }.count
        let miss = rows.filter { $0.result == "miss" }.count
        return (hit + miss) > 0 ? (hit, miss) : nil
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
    ///
    /// Reads via the `get_entitlements` SECURITY DEFINER RPC (2.18): the anon
    /// key can ask about ids it already holds but can never enumerate the
    /// table — the old direct SELECT let anyone dump every installation_id
    /// and impersonate one for a free unlock.
    static func fetchEntitlements() async -> Set<String> {
        struct Row: Decodable { let product_key: String? }
        guard let url = URL(string: "\(Secrets.supabaseURL)/rest/v1/rpc/get_entitlements") else { return [] }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(Secrets.supabaseAnonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(Secrets.supabaseAnonKey)", forHTTPHeaderField: "Authorization")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["p_ids": Array(Set([identityId, installationId]))])
        guard let (data, response) = try? await URLSession.shared.data(for: req),
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
    /// Returns [] only for a successful, genuinely empty league. Transport,
    /// HTTP, and top-level schema failures throw so callers can preserve the
    /// last good board and render a retry state instead of a false dark day.
    static func fetchInsightConnections(date: String, league: String) async throws -> [Connection] {
        let url = buildURL(table: "insight_connections", query: [
            URLQueryItem(name: "select", value: "date,league,category,headline,detail,game,value,tone,spark,line_val,relevance_score,player_id,team_id,game_id,meta,result,result_note"),
            URLQueryItem(name: "date", value: "eq.\(date)"),
            URLQueryItem(name: "league", value: "eq.\(league)"),
            URLQueryItem(name: "order", value: "relevance_score.desc")
        ])

        let (data, response) = try await URLSession.shared.data(for: makeRequest(url: url))
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            let status = (response as? HTTPURLResponse)?.statusCode ?? -1
            print("[SupabaseAPI] fetchInsightConnections failed: HTTP \(status)")
            throw NSError(
                domain: "SupabaseAPI.fetchInsightConnections",
                code: status,
                userInfo: [NSLocalizedDescriptionKey: "Insight feed returned HTTP \(status)"]
            )
        }
        do {
            // Flat table, decoded row-by-row: one malformed row (e.g. a future
            // meta shape) drops one card, never the league's whole day.
            struct Lossy: Decodable {
                let value: Connection?
                init(from decoder: Decoder) throws { value = try? Connection(from: decoder) }
            }
            let rows = try JSONDecoder().decode([Lossy].self, from: data)
            // Defense in depth: when the WC feature is off, drop every World Cup
            // row (and short-circuit the `league: "WC"` iteration the Hub/Home make)
            // so no WC edge, tournament lane, or game-intel signal can surface.
            let decoded = rows.compactMap { $0.value }
            if !rows.isEmpty && decoded.isEmpty {
                throw NSError(
                    domain: "SupabaseAPI.fetchInsightConnections",
                    code: -2,
                    userInfo: [NSLocalizedDescriptionKey: "Every insight row failed to decode"]
                )
            }
            let conns = decoded.filter { !AppFlags.hidesWorldCupRow($0.league) }
            if conns.count != rows.count {
                print("[SupabaseAPI] fetchInsightConnections(\(league)): dropped \(rows.count - conns.count) undecodable/filtered row(s)")
            }
            return conns
        } catch {
            print("[SupabaseAPI] fetchInsightConnections decode error: \(error.localizedDescription)")
            throw error
        }
    }

    /// The per-game MLB field lineup (real players + positions + opposing starter),
    /// built daily by run-mlb-field-lineups.js into mlb_field_lineups. Matched by the
    /// home team's BDL abbreviation. Returns nil before lineups post (~2-3h pre-game).
    static func fetchMlbFieldLineup(date: String, homeTeam: String) async -> MLBFieldLineupRow? {
        let url = buildURL(table: "mlb_field_lineups", query: [
            URLQueryItem(name: "select", value: "game,home_team,away_team,status,payload"),
            URLQueryItem(name: "date", value: "eq.\(date)"),
            URLQueryItem(name: "home_team", value: "eq.\(homeTeam)")
        ])
        guard let (data, response) = try? await URLSession.shared.data(for: makeRequest(url: url)),
              let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode),
              let rows = try? JSONDecoder().decode([MLBFieldLineupRow].self, from: data) else { return nil }
        return rows.first
    }

    struct MLBFieldLineupRow: Decodable { let game: String?; let home_team: String?; let away_team: String?; let status: String?; let payload: MLBFieldPayload }
    struct MLBFieldPayload: Decodable { let home: MLBTeamLineup?; let away: MLBTeamLineup? }
    struct MLBTeamLineup: Decodable {
        let team: String?; let pitcher: MLBLineupPitcher?; let facingPitcher: MLBLineupPitcher?; let fielders: [MLBLineupFielder]
    }
    struct MLBLineupPitcher: Decodable { let name: String?; let hand: String?; let playerId: String? }
    struct MLBLineupFielder: Decodable {
        let playerId: String?; let name: String?; let pos: String?; let order: Int?
        let bats: String?; let ops: String?; let heat: String?; let hrEdge: Bool?; let plat: Bool?; let fillIn: Bool?
        /// The player's OWN team abbreviation — set only on mixed-team rows
        /// (the HR Derby field, where the eight contestants each wear their
        /// club's colours). Absent on every normal lineup.
        let team: String?
    }

    // MARK: - Weekly NFL Picks
    
    /// Fetch NFL picks for one explicit slate date from the canonical weekly row.
    /// Returns empty if that exact week/day has no pick — never a prior-week fallback.
    static func fetchWeeklyNFLPicks(for date: String) async throws -> [GaryPick] {
        guard let weekStart = getNFLWeekStart(for: date),
              let season = nflSeason(for: date) else { return [] }

        let url = buildURL(table: "weekly_nfl_picks", query: [
            URLQueryItem(name: "select", value: "picks::text,week_start,week_number,season"),
            URLQueryItem(name: "week_start", value: "eq.\(weekStart)"),
            URLQueryItem(name: "season", value: "eq.\(season)"),
            URLQueryItem(name: "limit", value: "1")
        ])
        
        let (data, response) = try await URLSession.shared.data(for: makeRequest(url: url))
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            let status = (response as? HTTPURLResponse)?.statusCode ?? -1
            print("[SupabaseAPI] fetchWeeklyNFLPicks failed: HTTP \(status)")
            throw NSError(domain: "SupabaseAPI.fetchWeeklyNFLPicks", code: status,
                          userInfo: [NSLocalizedDescriptionKey: "NFL picks returned HTTP \(status)"])
        }

        let rows = try JSONDecoder().decode([WeeklyNFLPicksRow].self, from: data)
        
        guard let row = rows.first else { return [] }
        let decoded = try parsePicksRow(row.picks)
        try validateStoredGamePicks(decoded, source: "weekly_nfl_picks")
        return decoded.filter { pick in
            guard (pick.league ?? "").uppercased() == "NFL",
                  let commence = pick.commence_time else { return false }
            return easternCalendarDate(ofISO8601: commence) == date
        }
    }
    
    // MARK: - Combined Picks

    /// Fetch the picks stored for exactly one slate date, including NFL picks
    /// from the weekly table. Yesterday and historical boards stay pinned to
    /// the date the user selected.
    /// - Parameter forceRefresh: Set to true for pull-to-refresh to bypass cache
    static func fetchExactDatePicks(date: String, forceRefresh: Bool = false) async throws -> [GaryPick] {
        let cacheKey = "exactDatePicks_\(date)"

        if !forceRefresh,
           let cached: [GaryPick] = await APICache.shared.get(cacheKey, ttl: APICache.liveContentTTL) {
            return cached
        }

        async let dailyTask = fetchDailyPicks(date: date)
        async let nflTask = fetchWeeklyNFLPicks(for: date)

        var dailyPicks: [GaryPick] = []
        var nflPicks: [GaryPick] = []
        var sourceErrors: [Error] = []
        do { dailyPicks = try await dailyTask } catch { sourceErrors.append(error) }
        do { nflPicks = try await nflTask } catch { sourceErrors.append(error) }

        guard !Task.isCancelled else { throw CancellationError() }

        // Weekly storage is canonical for NFL. Excluding legacy daily NFL rows
        // prevents one card from appearing twice on historical surfaces.
        let result = dailyPicks.filter { ($0.league ?? "").uppercased() != "NFL" } + nflPicks
        guard sourceErrors.isEmpty else {
            throw SourceReadFailure(
                source: "Exact-date picks",
                transientExternal: sourceErrors.allSatisfy(isTransientExternalFailure),
                underlying: sourceErrors
            )
        }
        // A multi-table read is complete or it throws. Callers retain their
        // last-good board instead of mistaking a partial response for an empty league.
        await APICache.shared.set(cacheKey, value: result)
        return result
    }

    /// Fetch all picks: non-NFL from daily_picks + NFL from weekly_nfl_picks
    /// - Parameter forceRefresh: Set to true for pull-to-refresh to bypass cache
    static func fetchAllPicks(date: String, forceRefresh: Bool = false) async throws -> [GaryPick] {
        let cacheKey = "allPicks_\(date)"

        // Check cache first (unless forcing refresh)
        if !forceRefresh, let cached: [GaryPick] = await APICache.shared.get(cacheKey, ttl: APICache.liveContentTTL) {
            return cached
        }

        // Fetch fresh data
        async let dailyTask = fetchDailyPicks(date: date)
        async let nflTask = fetchWeeklyNFLPicks(for: date)

        var dailyPicks: [GaryPick] = []
        var nflPicks: [GaryPick] = []
        var sourceErrors: [Error] = []
        do { dailyPicks = try await dailyTask } catch { sourceErrors.append(error) }
        do { nflPicks = try await nflTask } catch { sourceErrors.append(error) }

        // A SwiftUI preload can be cancelled while the user changes tabs. Do
        // not turn that cancellation into a successful empty response and
        // poison the shared 15-second cache with "no picks".
        guard !Task.isCancelled else { throw CancellationError() }

        // Filter out NFL from daily picks (they come from weekly_nfl_picks)
        let nonNFLPicks = dailyPicks.filter { ($0.league ?? "").uppercased() != "NFL" }

        let result = nonNFLPicks + nflPicks

        guard sourceErrors.isEmpty else {
            throw SourceReadFailure(
                source: "Combined picks",
                transientExternal: sourceErrors.allSatisfy(isTransientExternalFailure),
                underlying: sourceErrors
            )
        }
        // A combined board is complete or it throws. League-scoped callers that
        // need partial progress fetch each source independently and preserve it.
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
            let status = (response as? HTTPURLResponse)?.statusCode ?? -1
            print("[SupabaseAPI] fetchPropPicks failed: HTTP \(status)")
            throw NSError(domain: "SupabaseAPI.fetchPropPicks", code: status,
                          userInfo: [NSLocalizedDescriptionKey: "Prop picks returned HTTP \(status)"])
        }

        // Parse as array of dictionaries
        guard let jsonArray = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            print("[SupabaseAPI] fetchPropPicks: failed to parse JSON")
            throw NSError(domain: "SupabaseAPI.fetchPropPicks", code: -2,
                          userInfo: [NSLocalizedDescriptionKey: "Prop picks payload could not be decoded"])
        }

        var allPicks: [PropPick] = []

        for (rowIndex, row) in jsonArray.enumerated() {
            let rowLeague = row["league"] as? String
            let picksData = try decodePropPickDictionaries(
                row["picks"],
                source: "prop_picks row \(rowIndex)"
            )

            // One malformed element invalidates the row/request. Publishing a
            // compacted partial list would make a schema regression look like a
            // legitimate day with fewer props and then cache that result.
            for (pickIndex, rawPick) in picksData.enumerated() {
                var pickDict = rawPick
                if pickDict["league"] == nil && pickDict["sport"] == nil,
                   let rowLeague, !rowLeague.isEmpty {
                    pickDict["league"] = rowLeague
                }
                guard let pick = PropPick.from(dict: pickDict),
                      pick.hasValidStoredPayload else {
                    throw DecodingError.dataCorrupted(
                        .init(
                            codingPath: [],
                            debugDescription: "prop_picks row \(rowIndex) element \(pickIndex) lacks required prop identity"
                        )
                    )
                }
                allPicks.append(pick)
            }
        }

        // Hide World Cup props when WC is off (App Store FIFA-IP gate). WC props carry
        // sport:"WC" with a NULL top-level league, so filter on the RESOLVED league — this
        // is the one feed the master sweep missed; it closes the Props-tab/Winners-shelf leak.
        allPicks = allPicks.filter { !AppFlags.hidesWorldCupRow($0.effectiveLeague) }

        // Store in cache
        await APICache.shared.set(cacheKey, value: allPicks)

        return allPicks
    }
    
    // MARK: - Billfold (Results)
    
    /// Fetch game results with optional date filter (excludes NFL - those come from nfl_results)
    static func fetchGameResults(since dateFilter: String?) async throws -> [GameResult] {
        var query = [
            URLQueryItem(name: "select", value: "game_id,game_date,league,matchup,pick_text,result,final_score"),
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

        var gameResults: [GameResult] = []
        var nflResults: [GameResult] = []
        var sourceErrors: [Error] = []
        do { gameResults = try await gameTask } catch { sourceErrors.append(error) }
        do { nflResults = try await nflTask } catch { sourceErrors.append(error) }
        guard sourceErrors.isEmpty else {
            throw SourceReadFailure(
                source: "Combined game results",
                transientExternal: sourceErrors.allSatisfy(isTransientExternalFailure),
                underlying: sourceErrors
            )
        }

        // Combine and sort by date descending
        let combined = gameResults + nflResults
        let result = combined.sorted { ($0.game_date ?? "") > ($1.game_date ?? "") }

        // Store in cache
        await APICache.shared.set(cacheKey, value: result)

        return result
    }
    
    /// Fetch only the historical pick facts Billfold actually displays.
    ///
    /// History lives in `pick_history_summary` — a server-side materialized
    /// view (refreshed every 15 minutes) that flattens `daily_picks` +
    /// canonical `weekly_nfl_picks` into one thin row per pick, with each
    /// NFL date already derived from `commence_time` in Eastern time. The
    /// previous shape — a 30-slot `picks->N->>…` projection over 90 days of
    /// large jsonb rows, from every phone — was killed by the database's
    /// statement timeout under the Aug 20 2026 late-morning load and blanked
    /// the Picks surfaces. This read is a plain index scan (~0.5 ms measured)
    /// and still covers ALL history, so every range's ledger math stays exact.
    static func fetchBillfoldPickMetadata(
        since dateFilter: String,
        forceRefresh: Bool = false
    ) async throws -> [BillfoldPickMetadata] {
        // v3: the summary-view payload invalidates the old projection caches.
        let cacheKey = "billfoldPickMetadataV3_\(dateFilter)_\(billfoldSnapshotWindowKey())"
        if !forceRefresh,
           let cached: [BillfoldPickMetadata] = await APICache.shared.get(cacheKey, ttl: APICache.billfoldTTL) {
            return cached
        }

        let url = buildURL(table: "pick_history_summary", query: [
            URLQueryItem(name: "select", value: "game_date,pick,confidence,is_top_pick"),
            URLQueryItem(name: "game_date", value: "gte.\(dateFilter)"),
            URLQueryItem(name: "order", value: "game_date.desc")
        ])

        let (data, response) = try await URLSession.shared.data(for: makeRequest(url: url))
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            let status = (response as? HTTPURLResponse)?.statusCode ?? -1
            print("[SupabaseAPI] fetchBillfoldPickMetadata failed: HTTP \(status)")
            throw NSError(domain: "SupabaseAPI.fetchBillfoldPickMetadata", code: status,
                          userInfo: [NSLocalizedDescriptionKey: "Pick history returned HTTP \(status)"])
        }

        struct SummaryRow: Decodable {
            let game_date: String
            let pick: String
            let confidence: Double?
            let is_top_pick: Bool?
        }
        let rows = try JSONDecoder().decode([SummaryRow].self, from: data)
        let result = rows.map {
            BillfoldPickMetadata(
                date: $0.game_date,
                pick: $0.pick,
                confidence: $0.confidence,
                isTopPick: $0.is_top_pick ?? false
            )
        }

        await APICache.shared.set(cacheKey, value: result)
        return result
    }

    /// THE PROPS BOOK starts here (Sep 2 2026, the props rebuild): the day the
    /// old props brain was deleted. The Billfold's props ledger never reads
    /// earlier rows; the archive keeps them.
    static let propsBookSince = "2026-09-02"

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
            URLQueryItem(
                name: "select",
                value: "game_date,matchup,player_name,pick_text,prop_type,bet,line_value,result,odds,actual_value,sport"
            ),
            URLQueryItem(name: "order", value: "game_date.desc")
        ]

        if let since = dateFilter, !since.isEmpty {
            query.insert(URLQueryItem(name: "game_date", value: "gte.\(since)"), at: 1)
        }

        let result: [PropResult] = try await fetchAllPages(table: "prop_results", baseQuery: query)
        await APICache.shared.set(cacheKey, value: result)
        return result
    }
    
    // MARK: - Recent Results

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
    
    // MARK: - Parsing Helpers
    
    /// The pick writers have historically serialized betting numbers in either
    /// JSON representation: `1.5` or `"1.5"`, and book prices as `-110` or
    /// `"-110"`. Those are the same domain values (GaryPick.from(dict:) has
    /// always accepted both), but synthesized Codable rejects the whole day's
    /// array on the first representation change. Canonicalize only those known
    /// number/string fields, then return to the strict model decoder so an
    /// unrelated schema defect still fails the source closed.
    private static func normalizeStoredGamePickPayload(_ data: Data) throws -> Data {
        guard var rows = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            throw DecodingError.typeMismatch(
                [[String: Any]].self,
                .init(codingPath: [], debugDescription: "Stored picks payload is not an object array")
            )
        }

        func canonicalAmericanOdds(_ raw: Any?) -> Any? {
            guard let raw else { return nil }
            if raw is NSNull { return raw }
            if let number = raw as? NSNumber, !(raw is Bool) {
                let text = number.stringValue
                return number.doubleValue > 0 ? "+\(text)" : text
            }
            if let text = raw as? String {
                let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
                guard let value = Double(trimmed) else { return raw }
                return value > 0 && !trimmed.hasPrefix("+") ? "+\(trimmed)" : trimmed
            }
            // Leave an unsupported shape untouched. The strict GaryPick decode
            // below will reject it instead of laundering a schema defect.
            return raw
        }

        for index in rows.indices {
            for key in ["spread", "moneylineHome", "moneylineAway"] {
                if let text = rows[index][key] as? String,
                   let value = Double(text.trimmingCharacters(in: .whitespacesAndNewlines)) {
                    rows[index][key] = value
                }
            }

            guard var books = rows[index]["sportsbook_odds"] as? [[String: Any]] else { continue }
            for bookIndex in books.indices {
                if let text = books[bookIndex]["spread"] as? String,
                   let value = Double(text.trimmingCharacters(in: .whitespacesAndNewlines)) {
                    books[bookIndex]["spread"] = value
                }
                for key in ["spread_odds", "ml"] {
                    if let canonical = canonicalAmericanOdds(books[bookIndex][key]) {
                        books[bookIndex][key] = canonical
                    }
                }
            }
            rows[index]["sportsbook_odds"] = books
        }

        return try JSONSerialization.data(withJSONObject: rows)
    }

    static func parsePicksRow(_ picks: PicksValue<GaryPick>?) throws -> [GaryPick] {
        guard let picks = picks else {
            throw DecodingError.valueNotFound(
                PicksValue<GaryPick>.self,
                .init(codingPath: [], debugDescription: "Stored picks row is present but picks is null or missing")
            )
        }
        
        let data: Data
        if let arr = picks.asArray {
            // Do not let a direct JSON-array response bypass the same canonical
            // betting-number contract used by the normal `picks::text` path.
            data = try JSONEncoder().encode(arr)
        } else if let str = picks.asString, !str.isEmpty, let stringData = str.data(using: .utf8) {
            data = stringData
        } else {
            throw DecodingError.dataCorrupted(
                DecodingError.Context(codingPath: [], debugDescription: "Invalid stringified pick payload")
            )
        }
        let normalized = try normalizeStoredGamePickPayload(data)
        return try JSONDecoder().decode([GaryPick].self, from: normalized)
    }

    private static func validateStoredGamePicks(_ picks: [GaryPick], source: String) throws {
        guard picks.allSatisfy(\.hasValidStoredPayload) else {
            throw DecodingError.dataCorrupted(
                .init(codingPath: [], debugDescription: "\(source) contains a pick without required play/game identity")
            )
        }
    }

    private static func decodePropPickDictionaries(
        _ raw: Any?,
        source: String
    ) throws -> [[String: Any]] {
        let value: Any
        if let string = raw as? String {
            guard !string.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  let data = string.data(using: .utf8) else {
                throw DecodingError.dataCorrupted(
                    .init(codingPath: [], debugDescription: "\(source) has an empty stringified picks payload")
                )
            }
            value = try JSONSerialization.jsonObject(with: data)
        } else if let raw, !(raw is NSNull) {
            value = raw
        } else {
            throw DecodingError.valueNotFound(
                [Any].self,
                .init(codingPath: [], debugDescription: "\(source) is present but picks is null or missing")
            )
        }

        guard let elements = value as? [Any] else {
            throw DecodingError.typeMismatch(
                [Any].self,
                .init(codingPath: [], debugDescription: "\(source) picks must be an array")
            )
        }
        return try elements.enumerated().map { index, element in
            guard let dictionary = element as? [String: Any] else {
                throw DecodingError.typeMismatch(
                    [String: Any].self,
                    .init(codingPath: [], debugDescription: "\(source) element \(index) must be an object")
                )
            }
            return dictionary
        }
    }

}
