import Foundation

enum GaryMlbMetricPolicy {
    static func containsExcludedAnalysis(_ text: String) -> Bool {
        text.range(of: #"\bx[\s_-]*era\b|\bexpected[\s-]+(?:era|earned[\s-]+run[\s-]+average)\b"#,
                   options: [.regularExpression, .caseInsensitive]) != nil
    }
}


/// Fantasy owns its publication date and freshness independently of game-pick
/// slates. In particular, a quiet NFL Tuesday still has a weekly briefing.
struct FantasyBriefing: Decodable {
    let schema_version: Int
    let date: String
    let league: String
    let generated_at: String
    let fetched_as_of: String
    let expires_at: String
    let window_start: String
    let window_end: String
    let week: Int?
    let decisions: [FantasyDecision]
    let coverage: Coverage

    struct Coverage: Decodable { let complete: Bool }

    static func timestamp(_ value: String) -> Date? {
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = parser.date(from: value) { return date }
        parser.formatOptions = [.withInternetDateTime]
        return parser.date(from: value)
    }

    static func today(now: Date = Date()) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "America/New_York")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: now)
    }

    static func dayLabel(_ value: String) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "America/New_York")
        formatter.dateFormat = "yyyy-MM-dd"
        guard let date = formatter.date(from: value) else { return value }
        formatter.dateFormat = "MMM d"
        return formatter.string(from: date)
    }

    static func previousDay(now: Date = Date()) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/New_York")!
        return today(now: calendar.date(byAdding: .day, value: -1, to: now)!)
    }

    func validate(date expectedDate: String, league expectedLeague: String) throws {
        guard schema_version == 1, coverage.complete,
              date == expectedDate, league == expectedLeague,
              let collected = Self.timestamp(fetched_as_of),
              let generated = Self.timestamp(generated_at),
              let expires = Self.timestamp(expires_at),
              generated >= collected, expires > generated,
              decisions.count <= 24,
              Set(decisions.map(\.player_id)).count == decisions.count,
              Set(decisions.map(\.id)).count == decisions.count,
              decisions.allSatisfy({ $0.isValid(league: league) }) else {
            throw NSError(domain: "SupabaseAPI.fetchFantasyBriefing", code: -2,
                          userInfo: [NSLocalizedDescriptionKey: "The Fantasy briefing could not be verified."])
        }
    }

    func isCurrent(now: Date = Date()) -> Bool {
        let today = Self.today(now: now)
        // A still-current weekly NFL read can cross midnight while the new
        // publication finishes. It cannot cross its expiry or scoring window.
        let dateMatches = league == "NFL"
            ? date >= Self.previousDay(now: now) && date <= today && window_end >= today
            : date == today
        guard dateMatches, coverage.complete,
              let expires = Self.timestamp(expires_at),
              let generated = Self.timestamp(generated_at) else { return false }
        return expires > now && generated <= now.addingTimeInterval(300)
    }

    func canRetainAfterRefreshFailure(isTransient: Bool, now: Date = Date()) -> Bool {
        isTransient && isCurrent(now: now)
    }
}

struct FantasyDecision: Decodable, Identifiable {
    let id: String
    let player_id: String
    let player_name: String
    let team: String?
    let position: String?
    let role: String?
    let action: String
    let horizon: String
    let valid_until: String?
    let headline: String
    let why_now: String
    let fit: String
    let risk: String
    let watch_for: String
    let formats: [String]
    let categories: [String]
    let opportunities: [Opportunity]
    let evidence: [Evidence]
    let availability: Availability?
    let limitations: [String]

    struct Evidence: Decodable, Identifiable {
        let id: String
        let label: String
        let source: String
        let observed_at: String?
        let summary: String?
    }
    struct Availability: Decodable {
        let rostered_percent: Double?
        let league_available: Bool?
    }
    struct Opportunity: Decodable {
        let game_id: String?
        let start_at: String?
        let opponent: String?
        let home: Bool?
    }

    var actionLabel: String {
        switch action {
        case "CONSIDER_ADD": return "CONSIDER ADDING"
        case "START": return "LINEUP CALL"
        case "HOLD": return "HOLD"
        case "SIT": return "CONSIDER SITTING"
        default: return "WATCH"
        }
    }

    var identity: String { [position, team].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ") }

    /// Converts cited source IDs for display only. Evidence keeps its original
    /// order and the stored advice remains unchanged, including unknown brackets.
    func displayText(_ source: String) -> String {
        let numbers = Dictionary(evidence.enumerated().map { ($0.element.id, $0.offset + 1) },
                                 uniquingKeysWith: { first, _ in first })
        guard !source.isEmpty, !numbers.isEmpty,
              let pattern = try? NSRegularExpression(pattern: #"\[([^\[\]\r\n]+)\]"#) else { return source }
        let text = source as NSString
        let references = pattern.matches(in: source, range: NSRange(location: 0, length: text.length))
            .compactMap { match -> (range: NSRange, number: Int)? in
                guard let number = numbers[text.substring(with: match.range(at: 1))] else { return nil }
                return (match.range, number)
            }
        guard !references.isEmpty else { return source }

        var result = ""
        var cursor = 0
        var index = 0
        while index < references.count {
            let reference = references[index]
            result += text.substring(with: NSRange(location: cursor, length: reference.range.location - cursor))
            var citations = [reference.number]
            cursor = NSMaxRange(reference.range)
            index += 1
            while index < references.count, references[index].range.location == cursor {
                citations.append(references[index].number)
                cursor = NSMaxRange(references[index].range)
                index += 1
            }
            result += "[" + citations.map(String.init).joined(separator: ", ") + "]"
        }
        result += text.substring(from: cursor)
        return result
    }

    func isActionable(now: Date) -> Bool {
        if horizon == "week" { return true }
        guard let valid_until, let closes = FantasyBriefing.timestamp(valid_until) else { return false }
        return closes > now
    }

    private func nextGame(now: Date) -> (Opportunity, Date)? {
        opportunities.compactMap { opportunity -> (Opportunity, Date)? in
            guard let start = opportunity.start_at.flatMap(FantasyBriefing.timestamp), start > now else { return nil }
            return (opportunity, start)
        }.sorted { $0.1 < $1.1 }.first
    }

    /// League identity is checked by the Hub. A populated pack from another
    /// day or a prior doubleheader game cannot stand in for this opportunity.
    func matchesPlayerCard(playerID: String?, gameID: String?, loadedDate: String, now: Date = Date()) -> Bool {
        guard playerID == player_id, loadedDate == FantasyBriefing.today(now: now),
              isActionable(now: now), let gameID, !gameID.isEmpty,
              let (opportunity, _) = nextGame(now: now) else { return false }
        return opportunity.game_id == gameID
    }

    func nextGameLabel(now: Date) -> String? {
        guard let (game, date) = nextGame(now: now) else { return nil }
        let matchup = game.opponent.map { "\(game.home == true ? "vs" : "at") \($0) · " } ?? ""
        let formatter = DateFormatter()
        formatter.dateFormat = "EEE, MMM d · h:mm a"
        return matchup + formatter.string(from: date)
    }

    func isValid(league: String) -> Bool {
        let allowed = league == "MLB" ? ["categories", "points"] : ["standard", "half_ppr", "ppr"]
        return !id.isEmpty && !player_id.isEmpty && !player_name.isEmpty
            && ["CONSIDER_ADD", "START", "HOLD", "WATCH", "SIT"].contains(action)
            && ["next_game", "week"].contains(horizon)
            && (!["START", "SIT"].contains(action) || horizon == "next_game")
            && (horizon == "week" || valid_until.flatMap(FantasyBriefing.timestamp) != nil)
            && [headline, why_now, fit, risk, watch_for].allSatisfy { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            && ([headline, why_now, fit, risk, watch_for] + limitations + evidence.compactMap(\.summary))
                .allSatisfy { !GaryMlbMetricPolicy.containsExcludedAnalysis($0) }
            && !formats.isEmpty && formats.allSatisfy { allowed.contains($0) }
            && !evidence.isEmpty && Set(evidence.map(\.id)).count == evidence.count
    }
}
