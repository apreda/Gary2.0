import Foundation

/// Select a small front page from a relevance-ordered, already league-scoped
/// story pool. The caller retains the full feed and excludes product modules.
enum HubFrontPageSelection {
    struct Story {
        let index: Int
        let kind: String
        let gameID: String?
        let prefersLead: Bool
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

    static func select(stories: [Story], games: [Game], now: Date = Date()) -> Selection {
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
        guard let bestPhase = ordered.first?.phase.priority else { return Selection(lead: nil, supporting: []) }
        // Connection kinds may lead only within the best available phase. A
        // completed connection must never outrank an upcoming counting story.
        let lead = ordered.first { $0.phase.priority == bestPhase && $0.story.prefersLead } ?? ordered[0]
        var selected: Set<Int> = [lead.story.index]
        var perKind = [lead.story.kind: 1]
        var supporting: [Int] = []
        for priority in 0...3 {
            let phaseRows = ordered.filter { $0.phase.priority == priority && !selected.contains($0.story.index) }
            // Seek diversity inside this phase, then exhaust its remaining
            // stories before considering a lower-priority game phase.
            for respectKindCap in [true, false] {
                for row in phaseRows where supporting.count < 2 && !selected.contains(row.story.index) {
                    if respectKindCap && perKind[row.story.kind, default: 0] >= 2 { continue }
                    supporting.append(row.story.index)
                    selected.insert(row.story.index)
                    perKind[row.story.kind, default: 0] += 1
                }
            }
            if supporting.count == 2 { break }
        }
        return Selection(lead: lead.story.index, supporting: supporting)
    }
}
