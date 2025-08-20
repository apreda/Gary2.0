import Foundation

struct SupabaseAPI {
    private static var baseURL: URL { Secrets.supabaseURL.appendingPathComponent("/rest/v1") }
    private static var headers: [String: String] {
        [
            "apikey": Secrets.supabaseAnonKey,
            "Authorization": "Bearer \(Secrets.supabaseAnonKey)",
            "Content-Type": "application/json"
        ]
    }

    static func todayEST() -> String {
        let tz = TimeZone(identifier: "America/New_York")!
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = tz
        let now = Date()
        let comps = cal.dateComponents([.year, .month, .day], from: now)
        let y = comps.year!, m = comps.month!, d = comps.day!
        return String(format: "%04d-%02d-%02d", y, m, d)
    }

    private static func yesterdayESTString() -> String {
        let tz = TimeZone(identifier: "America/New_York")!
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = tz
        let now = Date()
        guard let yday = cal.date(byAdding: .day, value: -1, to: now) else { return todayEST() }
        let c = cal.dateComponents([.year,.month,.day], from: yday)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }

    private static func isBefore10amEST() -> Bool {
        let tz = TimeZone(identifier: "America/New_York")!
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = tz
        let hour = cal.component(.hour, from: Date())
        return hour < 10
    }

    static func fetchDailyPicks(date: String) async throws -> [GaryPick] {
        let url = baseURL.appendingPathComponent("daily_picks")
        var comps = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        comps.queryItems = [
            .init(name: "select", value: "picks::text,date"),
            .init(name: "date", value: "eq.\(date)")
        ]
        var req = URLRequest(url: comps.url!)
        headers.forEach { req.setValue($1, forHTTPHeaderField: $0) }

        req.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, res) = try await URLSession.shared.data(for: req)
        guard let http = res as? HTTPURLResponse, http.statusCode == 200 else { return [] }
        let rows = try JSONDecoder().decode([DailyPicksRow].self, from: data)
        guard let row = rows.first else { return [] }

        if let arr = row.picksArray { return arr }
        if let s = row.picksString, let json = s.data(using: .utf8) {
            let any = try JSONSerialization.jsonObject(with: json) as? [[String: Any]] ?? []
            return any.compactMap { GaryPick.from(dict: $0) }
        }
        // Fallback to yesterday before 10am EST if no picks
        if isBefore10amEST() {
            return try await fetchDailyPicks(date: yesterdayESTString())
        }
        return []
    }

    static func fetchPropPicks(date: String) async throws -> [PropPick] {
        let url = baseURL.appendingPathComponent("prop_picks")
        var comps = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        comps.queryItems = [
            .init(name: "select", value: "picks,date"),
            .init(name: "date", value: "eq.\(date)")
        ]
        var req = URLRequest(url: comps.url!)
        headers.forEach { req.setValue($1, forHTTPHeaderField: $0) }
        req.setValue("application/json", forHTTPHeaderField: "Accept")

        // Attempt exact date
        do {
            let (data, res) = try await URLSession.shared.data(for: req)
            if let http = res as? HTTPURLResponse, http.statusCode == 200 {
                let rows = try JSONDecoder().decode([PropPicksRow].self, from: data)
                if let row = rows.first {
                    if let arr = row.picksArray, !arr.isEmpty { return arr }
                    if let s = row.picksString, !s.isEmpty, let json = s.data(using: .utf8) {
                        let any = try JSONSerialization.jsonObject(with: json) as? [[String: Any]] ?? []
                        let parsed = any.compactMap { PropPick.from(dict: $0) }
                        if !parsed.isEmpty { return parsed }
                    }
                }
            }
        } catch {}

        // Fallback to yesterday (before 10am EST)
        if isBefore10amEST() {
            if let y = try? await fetchPropPicks(date: yesterdayESTString()), !y.isEmpty { return y }
        }

        // Fallback to latest non-empty row (fetch a few and pick the first with content)
        var latest = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        latest.queryItems = [
            .init(name: "select", value: "picks::text,date"),
            .init(name: "order", value: "date.desc"),
            .init(name: "limit", value: "5")
        ]
        var lreq = URLRequest(url: latest.url!)
        headers.forEach { lreq.setValue($1, forHTTPHeaderField: $0) }
        lreq.setValue("application/json", forHTTPHeaderField: "Accept")
        let (d2, r2) = try await URLSession.shared.data(for: lreq)
        guard let http2 = r2 as? HTTPURLResponse, http2.statusCode == 200 else { return [] }
        let rows2 = try JSONDecoder().decode([PropPicksRow].self, from: d2)
        for row in rows2 {
            if let arr = row.picksArray, !arr.isEmpty { return arr }
            if let s = row.picksString, !s.isEmpty, let json = s.data(using: .utf8) {
                let any = try JSONSerialization.jsonObject(with: json) as? [[String: Any]] ?? []
                let parsed = any.compactMap { PropPick.from(dict: $0) }
                if !parsed.isEmpty { return parsed }
            }
        }
        return []
    }

    // MARK: - Billfold data (mirror website Billfold.jsx)
    static func fetchGameResults(since dateFilter: String?) async throws -> [GameResult] {
        let url = baseURL.appendingPathComponent("game_results")
        var reqURL: URL
        if let since = dateFilter, !since.isEmpty {
            var comps = URLComponents(url: url, resolvingAgainstBaseURL: false)!
            comps.queryItems = [
                .init(name: "select", value: "game_date,league,matchup,pick_text,result,odds,final_score"),
                .init(name: "game_date", value: "gte.\(since)"),
                .init(name: "order", value: "game_date.desc"),
                .init(name: "limit", value: "500")
            ]
            reqURL = comps.url!
        } else {
            var comps = URLComponents(url: url, resolvingAgainstBaseURL: false)!
            comps.queryItems = [
                .init(name: "select", value: "game_date,league,matchup,pick_text,result,odds,final_score"),
                .init(name: "order", value: "game_date.desc"),
                .init(name: "limit", value: "500")
            ]
            reqURL = comps.url!
        }
        var req = URLRequest(url: reqURL)
        headers.forEach { req.setValue($1, forHTTPHeaderField: $0) }
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, res) = try await URLSession.shared.data(for: req)
        guard let http = res as? HTTPURLResponse, http.statusCode == 200 else { return [] }
        return try JSONDecoder().decode([GameResult].self, from: data)
    }

    static func fetchPropResults(since dateFilter: String?) async throws -> [PropResult] {
        let url = baseURL.appendingPathComponent("prop_results")
        var reqURL: URL
        if let since = dateFilter, !since.isEmpty {
            var comps = URLComponents(url: url, resolvingAgainstBaseURL: false)!
            comps.queryItems = [
                .init(name: "select", value: "game_date,matchup,player_name,pick_text,prop_type,bet,line_value,result,odds,actual_value,confidence"),
                .init(name: "game_date", value: "gte.\(since)"),
                .init(name: "order", value: "game_date.desc"),
                .init(name: "limit", value: "500")
            ]
            reqURL = comps.url!
        } else {
            var comps = URLComponents(url: url, resolvingAgainstBaseURL: false)!
            comps.queryItems = [
                .init(name: "select", value: "game_date,matchup,player_name,pick_text,prop_type,bet,line_value,result,odds,actual_value,confidence"),
                .init(name: "order", value: "game_date.desc"),
                .init(name: "limit", value: "500")
            ]
            reqURL = comps.url!
        }
        var req = URLRequest(url: reqURL)
        headers.forEach { req.setValue($1, forHTTPHeaderField: $0) }
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, res) = try await URLSession.shared.data(for: req)
        guard let http = res as? HTTPURLResponse, http.statusCode == 200 else { return [] }
        return try JSONDecoder().decode([PropResult].self, from: data)
    }
}


