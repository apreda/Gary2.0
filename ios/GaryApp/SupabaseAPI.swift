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

    static func fetchDailyPicks(date: String) async throws -> [GaryPick] {
        let url = baseURL.appendingPathComponent("daily_picks")
        var comps = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        comps.queryItems = [
            .init(name: "select", value: "picks,date"),
            .init(name: "date", value: "eq.\(date)")
        ]
        var req = URLRequest(url: comps.url!)
        headers.forEach { req.setValue($1, forHTTPHeaderField: $0) }

        let (data, res) = try await URLSession.shared.data(for: req)
        guard let http = res as? HTTPURLResponse, http.statusCode == 200 else { return [] }
        let rows = try JSONDecoder().decode([DailyPicksRow].self, from: data)
        guard let row = rows.first else { return [] }

        if let arr = row.picksArray { return arr }
        if let s = row.picksString, let json = s.data(using: .utf8) {
            let any = try JSONSerialization.jsonObject(with: json) as? [[String: Any]] ?? []
            return any.compactMap { GaryPick.from(dict: $0) }
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

        let (data, res) = try await URLSession.shared.data(for: req)
        guard let http = res as? HTTPURLResponse, http.statusCode == 200 else { return [] }
        let rows = try JSONDecoder().decode([PropPicksRow].self, from: data)
        guard let row = rows.first else { return [] }

        if let arr = row.picksArray { return arr }
        if let s = row.picksString, let json = s.data(using: .utf8) {
            let any = try JSONSerialization.jsonObject(with: json) as? [[String: Any]] ?? []
            return any.compactMap { PropPick.from(dict: $0) }
        }
        return []
    }
}


