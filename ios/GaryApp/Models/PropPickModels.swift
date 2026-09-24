import Foundation
import CoreFoundation

struct PropQuoteReceipt: Codable {
    let quote_id: String
    let bookmaker: String
    let observed_at: String?
    let provider_updated_at: String?

    private static let plainISO = ISO8601DateFormatter()
    private static let fractionalISO: ISO8601DateFormatter = {
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return parser
    }()
    private static let clock: DateFormatter = {
        let formatter = DateFormatter()
        formatter.timeZone = TimeZone(identifier: "America/New_York")
        formatter.dateFormat = "MMM d, h:mm a 'ET'"
        return formatter
    }()
    var label: String {
        let raw = observed_at ?? provider_updated_at ?? ""
        let date = Self.fractionalISO.date(from: raw) ?? Self.plainISO.date(from: raw)
        let time = date.map { Self.clock.string(from: $0) } ?? "Time unavailable"
        return "Pregame quote · \(bookmaker.capitalized) · \(time)"
    }
}

struct PropPick: Identifiable, Codable {
    let player: String?
    var game_id: Int? = nil   // per-game id — disambiguates doubleheaders
    let team: String?
    let prop: String?
    let bet: String?
    let odds: String?
    let confidence: Double?
    let analysis: String?
    let league: String?
    let sport: String?  // Web app uses "sport" field
    let line: String?
    let time: String?
    let commence_time: String?  // ISO format for sorting/grouping by game time
    let position: String?    // Player position (e.g., "1B", "OF", "SP") — used for MLB HR badge
    let tdCategory: String?  // "standard" or "underdog" for TD scorer picks
    let matchup: String?     // Game matchup for TD picks
    let key_stats: [String]?  // 3-4 bullet points with key stats supporting the pick
    /// Backend lane stamp: "HR" (Home Run Threats, the fun lane) | "CORE"
    /// (the real props product). Older rows lack it — isHRLane carries the
    /// fallback rule, and every surface reads THAT, never this field raw.
    var lane: String? = nil
    var quote_receipt: PropQuoteReceipt? = nil

    // CodingKeys to map snake_case from JSON
    enum CodingKeys: String, CodingKey {
        case player, game_id, team, prop, bet, odds, confidence, analysis, league, sport, line, time, position, matchup, key_stats, lane, quote_receipt
        case commence_time = "commence_time"
        case tdCategory = "td_category"
    }
    
    var id: String {
        [
            effectiveLeague ?? "?", game_id.map { String($0) } ?? "", commence_time ?? "",
            matchup ?? "", team ?? "", player ?? "prop", prop ?? "", line ?? "",
            bet ?? "", odds ?? "", tdCategory ?? "",
        ].joined(separator: "|")
    }

    /// Required semantic identity for a persisted prop. Historical optional
    /// fields remain decodable, but a blank/malformed object cannot be accepted
    /// as a real pick or cached as a successful response.
    var hasValidStoredPayload: Bool {
        func hasText(_ value: String?) -> Bool {
            !(value?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
        }
        return hasText(effectiveLeague)
            && hasText(prop)
            && hasText(bet)
            && hasText(odds)
            && (hasText(player) || hasText(team))
            && (game_id != nil || hasText(matchup))
    }
    

    /// HR fun-lane membership — the ONE source of truth for every surface
    /// (founder, Jul 29: HR Threats never touch Gary's props record; they live
    /// in the Hub's HR Threats lane + the Billfold's longshot tracker only).
    /// The backend's lane stamp wins; older picks without it fall back to the
    /// prop text — "home_runs 0.5" / "home runs" reads as an HR bet.
    var isHRLane: Bool {
        if let lane, !lane.isEmpty { return lane.uppercased() == "HR" }
        // The prop text is "market line" ("home_runs 0.5"), so read the market
        // token. A pitcher's home runs ALLOWED is a core prop, never the fun
        // lane — a substring match made it wear the long shot's clothes.
        let t = (prop ?? "").lowercased().trimmingCharacters(in: .whitespaces)
        if t.hasPrefix("pitcher") { return false }
        return t.hasPrefix("home_run") || t.hasPrefix("home run")
    }
    
    /// Get the sport/league (checks both fields)
    /// Normalizes API format ("basketball_nba") to display format ("NBA")
    var effectiveLeague: String? {
        // Get the raw value from league or sport field
        let raw = (league?.isEmpty == false ? league : sport) ?? ""
        guard !raw.isEmpty else { return nil }

        let normalized = raw.lowercased()

        // Handle API sport keys like "basketball_nba" -> "NBA"
        if normalized.contains("nba") && !normalized.contains("wnba") { return "NBA" }
        if normalized.contains("nfl") { return "NFL" }
        if normalized.contains("ncaab") || normalized.contains("ncaam") { return "NCAAB" }
        if normalized.contains("ncaaf") { return "NCAAF" }
        if normalized.contains("world_cup") || normalized.contains("worldcup") || normalized == "wc" || normalized.contains("soccer_world_cup") { return "WC" }
        if normalized == "mlb hr" { return "MLB HR" }
        if normalized.contains("mlb") || normalized.contains("wbc") { return "MLB" }

        return raw.uppercased()
    }
    
    /// Parse from dictionary (for manual JSON parsing)
    static func from(dict: [String: Any]) -> PropPick? {
        let gameID: Int?
        do { gameID = try ExactGameIdentity.canonicalProviderID(in: dict) }
        catch { return nil }
        // Handle key_stats which may come as NSArray from JSON deserialization
        var keyStats: [String]? = nil
        if let statsArray = dict["key_stats"] as? [String] {
            keyStats = statsArray
        } else if let statsArray = dict["key_stats"] as? [Any] {
            // Convert NSArray elements to strings
            keyStats = statsArray.compactMap { $0 as? String }
        }
        
        return PropPick(
            player: dict["player"] as? String,
            game_id: gameID,
            team: dict["team"] as? String,
            prop: dict["prop"] as? String,
            bet: dict["bet"] as? String,
            odds: (dict["odds"] as? String) ?? (dict["odds"] as? NSNumber)?.stringValue,
            confidence: (dict["confidence"] as? NSNumber)?.doubleValue,
            analysis: (dict["analysis"] as? String) ?? (dict["rationale"] as? String),
            league: dict["league"] as? String,
            sport: dict["sport"] as? String,
            line: dict["line"] as? String,
            time: dict["time"] as? String,
            commence_time: dict["commence_time"] as? String,
            position: dict["position"] as? String,
            tdCategory: dict["td_category"] as? String,
            matchup: dict["matchup"] as? String,
            key_stats: keyStats,
            lane: dict["lane"] as? String,
            quote_receipt: (dict["quote_receipt"] as? [String: Any]).flatMap { raw in
                guard let data = try? JSONSerialization.data(withJSONObject: raw) else { return nil }
                return try? JSONDecoder().decode(PropQuoteReceipt.self, from: data)
            }
        )
    }
}

