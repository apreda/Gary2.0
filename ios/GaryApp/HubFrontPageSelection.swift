import Foundation

/// Select a small front page from a relevance-ordered, already league-scoped
/// story pool. The caller retains the full feed and excludes product modules.
enum HubFrontPageSelection {
    struct Story {
        let index: Int
        let kind: String
        let gameID: String?
    }

    struct Game {
        let id: String
        let startsAt: String?
        let status: String?

        init(id: String, startsAt: String? = nil, status: String? = nil) {
            self.id = id
            self.startsAt = startsAt
            self.status = status
        }
    }

    enum Phase: Equatable {
        case upcoming, live, unknown, completed, unavailable

        var label: String {
            switch self {
            case .upcoming: return "UPCOMING"
            case .live: return "LIVE"
            case .unknown: return "CONTEXT"
            case .completed: return "FINAL · CONTEXT"
            case .unavailable: return "STATUS CHANGED · CONTEXT"
            }
        }

        fileprivate var priority: Int {
            switch self {
            case .upcoming: return 0
            case .live: return 1
            case .unknown: return 2
            case .completed, .unavailable: return 3
            }
        }
    }

    struct Selection: Equatable {
        let lead: Int?
        let supporting: [Int]
    }

    private struct RankedStory {
        let story: Story
        let order: Int
        let phase: Phase
    }

    private static func gameKey(_ value: String?) -> String? {
        guard let value, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        // IDs stay exact. In particular, never join by matchup text or strip
        // digits in a way that could merge two doubleheader games.
        return value
    }

    private static func statusKey(_ value: String?) -> String {
        let value = (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let bare = value.hasPrefix("status_") ? String(value.dropFirst(7)) : value
        return bare.filter { $0.isLetter || $0.isNumber }
    }

    /// Board and live observations may share an exact game ID. A terminal or
    /// interrupted observation overrides an older scheduled clock. Conflicting
    /// past/future clocks remain unknown without an explicit current status.
    static func phases(games: [Game], now: Date = Date()) -> [String: Phase] {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let whole = ISO8601DateFormatter()
        whole.formatOptions = [.withInternetDateTime]
        let groups = Dictionary(grouping: games.filter { gameKey($0.id) != nil }, by: \.id)
        return groups.mapValues { observations in
            let states = Set(observations.map { statusKey($0.status) })
            if !states.isDisjoint(with: ["postponed", "canceled", "cancelled", "suspended", "delayed", "abandoned"]) {
                return .unavailable
            }
            if states.contains(where: { $0.hasPrefix("final") || ["completed", "gameover", "closed"].contains($0) }) {
                return .completed
            }
            if !states.isDisjoint(with: ["live", "inprogress", "inplay", "halftime", "playing"]) {
                return .live
            }
            let starts = observations.compactMap { observation -> Date? in
                guard let value = observation.startsAt else { return nil }
                return fractional.date(from: value) ?? whole.date(from: value)
            }
            // A missing/date-only clock cannot be converted to midnight or
            // distantPast. Passing a scheduled clock does not prove live play.
            return !starts.isEmpty && starts.allSatisfy { $0 > now } ? .upcoming : .unknown
        }
    }

    static func phase(for gameID: String?, games: [Game], now: Date = Date()) -> Phase {
        guard let key = gameKey(gameID) else { return .unknown }
        return phases(games: games, now: now)[key] ?? .unknown
    }

    static func select(stories: [Story], games: [Game], now: Date = Date(), supportingLimit: Int = 2) -> Selection {
        let limit = min(4, max(0, supportingLimit))
        let phaseByGame = phases(games: games, now: now)
        var seen = Set<Int>()
        var ordered: [RankedStory] = []
        for (offset, story) in stories.enumerated() {
            guard story.index >= 0, seen.insert(story.index).inserted else { continue }
            let phase = gameKey(story.gameID).flatMap { phaseByGame[$0] } ?? .unknown
            ordered.append(RankedStory(story: story, order: offset, phase: phase))
        }
        ordered.sort { lhs, rhs in
            if lhs.phase.priority == rhs.phase.priority { return lhs.order < rhs.order }
            return lhs.phase.priority < rhs.phase.priority
        }
        // Any researched observation can lead, including a streak or recent
        // performance run. Keep source relevance inside the best game phase.
        guard let lead = ordered.first else { return Selection(lead: nil, supporting: []) }
        var selected: Set<Int> = [lead.story.index]
        var kinds: Set<String> = [lead.story.kind]
        var gameIDs = Set([gameKey(lead.story.gameID)].compactMap { $0 })
        var supporting: [Int] = []
        for priority in 0...3 {
            let phaseRows = ordered.filter { $0.phase.priority == priority && !selected.contains($0.story.index) }
            // A small dashboard should show different research and matchups
            // when available. Unknown IDs are not a shared game; exact IDs
            // preserve doubleheaders. Never promote final context for variety.
            for pass in 0...3 {
                for row in phaseRows where supporting.count < limit && !selected.contains(row.story.index) {
                    let newKind = !kinds.contains(row.story.kind)
                    let newGame = gameKey(row.story.gameID).map { !gameIDs.contains($0) } ?? true
                    if pass == 0 && !(newKind && newGame) { continue }
                    if pass == 1 && !newKind { continue }
                    if pass == 2 && !newGame { continue }
                    supporting.append(row.story.index)
                    selected.insert(row.story.index)
                    kinds.insert(row.story.kind)
                    if let gameID = gameKey(row.story.gameID) { gameIDs.insert(gameID) }
                }
            }
            if supporting.count == limit { break }
        }
        return Selection(lead: lead.story.index, supporting: supporting)
    }
}

/// Presentation state is scoped to a sport. It contains category identifiers,
/// never cached research, so yesterday's observations cannot be restored here.
enum HubResearchLayout {
    static func openSections(in saved: String, league: String) -> Set<String> {
        guard let data = saved.data(using: .utf8),
              let values = try? JSONDecoder().decode([String: [String]].self, from: data) else { return [] }
        return Set(values[league] ?? [])
    }

    static func saving(_ sections: Set<String>, league: String, in saved: String) -> String {
        var values = saved.data(using: .utf8).flatMap {
            try? JSONDecoder().decode([String: [String]].self, from: $0)
        } ?? [:]
        values[league] = sections.sorted()
        guard let data = try? JSONEncoder().encode(values) else { return saved }
        return String(data: data, encoding: .utf8) ?? saved
    }

    /// Expanded research uses the full width; compact peers share a row.
    /// Stable source order keeps every category reachable after any toggle.
    static func rows(ids: [String], open: Set<String>, columns: Int) -> [[String]] {
        var result: [[String]] = []
        var pending: [String] = []
        var seen: Set<String> = []
        for id in ids where seen.insert(id).inserted {
            if columns < 2 || open.contains(id) {
                if !pending.isEmpty { result.append(pending); pending = [] }
                result.append([id])
            } else {
                pending.append(id)
                if pending.count == 2 { result.append(pending); pending = [] }
            }
        }
        if !pending.isEmpty { result.append(pending) }
        return result
    }
}
