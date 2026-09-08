import Foundation

/// Additive interpretation of preserved source research. Reference semantics
/// keep the large evidence packet out of every Signal's inline storage.
/// Malformed/newer judgment payloads leave the original Connection readable.
final class HubJudgment: Codable {
    let schema_version: Int
    let status: String
    let date: String
    let league: String
    let game_id: String
    let primary_source_key: String
    let take: String
    let explanation: String
    let full_case: String
    let counterargument: String
    let watch_for: String
    let horizon: String
    let as_of: String
    let valid_until: String
    let prominence: String?
    let critical_condition: String?
    let what_changed: String?
    let evidence: [Evidence]
    let supporting_evidence_ids: [String]
    let counter_evidence_ids: [String]
    let supersedes_source_keys: [String]
    let input_fingerprint: String?
    let editorial_rank: Int?
    let editorial_fingerprint: String?
    private let observedAt: Date?
    private let expiresAt: Date?
    private let evidenceIsValid: Bool

    var validUntilDate: Date? { expiresAt }
    var checkedAt: Date? { observedAt }

    struct Evidence: Codable, Identifiable, Equatable {
        let id: String
        let source_key: String?
        let label: String
        let summary: String
        let source: String
        let as_of: String
        let game_id: String
        let player_id: String?
        let team_id: String?
        let facts: HubEvidenceValue?
    }

    enum CodingKeys: String, CodingKey {
        case schema_version, status, date, league, game_id, primary_source_key
        case take, explanation, full_case, counterargument, watch_for, horizon
        case as_of, valid_until, prominence, critical_condition, what_changed
        case evidence, supporting_evidence_ids, counter_evidence_ids, supersedes_source_keys, input_fingerprint
        case editorial_rank, editorial_fingerprint
    }

    init(from decoder: Decoder) throws {
        let values = try? decoder.container(keyedBy: CodingKeys.self)
        func read<T: Decodable>(_ key: CodingKeys, as: T.Type = T.self) -> T? {
            try? values?.decodeIfPresent(T.self, forKey: key)
        }
        schema_version = read(.schema_version) ?? 0
        status = read(.status) ?? ""
        date = read(.date) ?? ""
        league = read(.league) ?? ""
        game_id = read(.game_id) ?? ""
        primary_source_key = read(.primary_source_key) ?? ""
        take = read(.take) ?? ""
        explanation = read(.explanation) ?? ""
        full_case = read(.full_case) ?? ""
        counterargument = read(.counterargument) ?? ""
        watch_for = read(.watch_for) ?? ""
        horizon = read(.horizon) ?? ""
        as_of = read(.as_of) ?? ""
        valid_until = read(.valid_until) ?? ""
        prominence = read(.prominence)
        critical_condition = read(.critical_condition)
        what_changed = read(.what_changed)
        evidence = read(.evidence) ?? []
        supporting_evidence_ids = read(.supporting_evidence_ids) ?? []
        counter_evidence_ids = read(.counter_evidence_ids) ?? []
        supersedes_source_keys = read(.supersedes_source_keys) ?? []
        input_fingerprint = read(.input_fingerprint)
        let rank: Int? = read(.editorial_rank)
        let fingerprint: String? = read(.editorial_fingerprint)
        if let rank, rank > 0, let fingerprint, fingerprint.utf8.count == 64,
           fingerprint.utf8.allSatisfy({ (48...57).contains($0) || (97...102).contains($0) }) {
            editorial_rank = rank
            editorial_fingerprint = fingerprint
        } else {
            // Incomplete/future editorial metadata cannot spoil real research.
            editorial_rank = nil
            editorial_fingerprint = nil
        }
        observedAt = Self.timestamp(as_of)
        expiresAt = Self.timestamp(valid_until)
        let ids = Set(evidence.map(\.id))
        let expectedGame = game_id
        let observedTime = observedAt
        evidenceIsValid = evidence.count >= 2 && ids.count == evidence.count
            && Set(supporting_evidence_ids).count >= 2
            && Set(supporting_evidence_ids).count == supporting_evidence_ids.count
            && Set(counter_evidence_ids).count == counter_evidence_ids.count
            && Set(supporting_evidence_ids).isSubset(of: ids)
            && Set(counter_evidence_ids).isSubset(of: ids)
            && evidence.allSatisfy { item in
                Self.hasText(item.id) && Self.hasText(item.label) && Self.hasText(item.summary)
                    && Self.hasText(item.source) && item.game_id == expectedGame
                    && Self.timestamp(item.as_of).map { stamp in
                        observedTime.map { stamp <= $0.addingTimeInterval(60) } == true
                    } == true
            }
    }

    /// A judgment cannot acquire another game's identity, survive its playing
    /// window, or suppress observations when the supporting case is invalid.
    func isCurrent(league expectedLeague: String, date expectedDate: String,
                   gameID: String?, sourceKey: String?, now: Date) -> Bool {
        guard schema_version == 1, status == "ready", date == expectedDate,
              league.uppercased() == expectedLeague.uppercased(),
              !game_id.isEmpty, gameID == game_id,
              !primary_source_key.isEmpty, sourceKey == primary_source_key,
              ["pregame", "next_game"].contains(horizon),
              [take, explanation, full_case, counterargument, watch_for].allSatisfy(Self.hasText),
              let observed = observedAt, observed <= now.addingTimeInterval(60),
              let expires = expiresAt, expires > now, expires > observed,
              evidenceIsValid else { return false }
        return true
    }

    /// A passed clock is not proof of live play, but it is enough to stop
    /// presenting a pregame judgment as usable. No name-based game joins.
    static func gameIsUpcoming(startsAt: String?, status: String?, now: Date) -> Bool {
        let state = (status ?? "").lowercased().replacingOccurrences(of: "status_", with: "")
            .filter { $0.isLetter || $0.isNumber }
        if state.hasPrefix("final") || ["live", "inprogress", "inplay", "halftime", "playing", "post",
            "completed", "complete", "gameover", "closed", "postponed", "canceled", "cancelled",
            "suspended", "delayed", "abandoned"].contains(state) { return false }
        guard let startsAt, let start = timestamp(startsAt) else { return false }
        return start > now
    }

    static func sourceKey(category: String?, gameID: String?, playerID: String?, teamID: String?) -> String? {
        guard let category, hasText(category), let gameID, hasText(gameID) else { return nil }
        return [category, gameID, playerID ?? "", teamID ?? ""].joined(separator: "|")
    }

    static func timestamp(_ value: String) -> Date? {
        guard value.contains("T") else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: value)
    }

    /// Collection/computation observe the source. Persistence clocks can be
    /// later than a same-pass case and must not invalidate that research.
    static func latestSourceObservation(computedAsOf: String?, collectedAt: String?) -> Date? {
        [computedAsOf, collectedAt].compactMap { $0.flatMap(timestamp) }.max()
    }

    private static func hasText(_ value: String) -> Bool {
        !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// Display-only numbered references preserve all original prose, values,
    /// punctuation and unknown bracket contents, including non-ASCII names.
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
        var result = "", cursor = 0, index = 0
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
}

/// One eligibility pass per feed/clock/status change, shared by the lead,
/// matchup groups and source suppression. SwiftUI only reads the result.
enum HubJudgmentSelection {
    struct Candidate {
        let index: Int
        let league: String
        let date: String?
        let gameID: String?
        let sourceKey: String?
        let judgment: HubJudgment?
        var blocked = false
        var sourceObservedAt: Date? = nil
    }
    struct Game {
        let league: String
        let gameID: String
        let startsAt: String?
        let status: String?
    }

    struct EditorialCandidate {
        let index: Int
        let judgment: HubJudgment
    }

    /// The caller supplies only current, reachable cases. Partial publication
    /// cannot make a new rank outrun a different editorial slate: the complete
    /// visible set must agree on one ordering fingerprint and unique ranks.
    static func editorialOrder(candidates: [EditorialCandidate], games: [Game]) -> [Int] {
        let fingerprints = Set(candidates.compactMap { $0.judgment.editorial_fingerprint })
        let ranks = candidates.compactMap { $0.judgment.editorial_rank }
        let useEditorialOrder = fingerprints.count == 1 && ranks.count == candidates.count
            && Set(ranks).count == candidates.count
            && candidates.allSatisfy { $0.judgment.editorial_fingerprint != nil }
        let gameGroups = Dictionary(grouping: games) { "\($0.league.uppercased())|\($0.gameID)" }
        let ordered = candidates.enumerated().map { offset, candidate in
            let judgment = candidate.judgment
            let matches = gameGroups["\(judgment.league.uppercased())|\(judgment.game_id)"] ?? []
            let start = matches.count == 1 ? matches.first?.startsAt.flatMap(HubJudgment.timestamp) : nil
            return (candidate: candidate, offset: offset, start: start)
        }.sorted { lhs, rhs in
            let left = lhs.candidate.judgment, right = rhs.candidate.judgment
            let leftMajor = left.prominence == "major", rightMajor = right.prominence == "major"
            if leftMajor != rightMajor { return leftMajor }
            if useEditorialOrder, left.editorial_rank != right.editorial_rank {
                return left.editorial_rank! < right.editorial_rank!
            }
            if lhs.start != rhs.start {
                if let first = lhs.start, let second = rhs.start { return first < second }
                return lhs.start != nil
            }
            return lhs.offset < rhs.offset
        }
        return ordered.map { $0.candidate.index }
    }

    /// Preserve the latest envelope before the legacy headline deduper runs.
    /// A newer invalidation must not disappear behind an older ready source.
    /// Conflicting ready copies at one check clock retain factual research but
    /// cannot authorize an interpretation until the source is resolved.
    static func sourceChoices(_ candidates: [Candidate]) -> [Int: Bool] {
        let groups = Dictionary(grouping: candidates) { candidate in
            suppressionKey(league: candidate.league, date: candidate.date,
                           gameID: candidate.gameID, sourceKey: candidate.sourceKey) ?? "row:\(candidate.index)"
        }
        var choices: [Int: Bool] = [:]
        for group in groups.values {
            if !group.contains(where: { $0.judgment != nil }) {
                for candidate in group { choices[candidate.index] = true }
                continue
            }
            let newest = group.compactMap { $0.judgment?.checkedAt }.max()
            let latest = newest.map { clock in group.filter { $0.judgment?.checkedAt == clock } } ?? group
            guard let candidate = latest.first else { continue }
            let invalidated = latest.first { item in
                item.judgment != nil && item.judgment?.status != "ready"
            }
            if let invalidated { choices[invalidated.index] = true; continue }
            let permits = latest.allSatisfy { item in
                guard let expected = candidate.judgment, let other = item.judgment else { return true }
                return sameCase(expected, other)
            }
            choices[candidate.index] = permits
        }
        return choices
    }

    static func sameCase(_ lhs: HubJudgment, _ rhs: HubJudgment) -> Bool {
        lhs.valid_until == rhs.valid_until && sameArgument(lhs, rhs)
    }

    /// Renewing a check/expiry clock does not change the argument already open
    /// in a sheet. Publication conflicts still use the stricter sameCase gate.
    static func sameArgument(_ lhs: HubJudgment, _ rhs: HubJudgment) -> Bool {
        lhs.date == rhs.date && lhs.league.uppercased() == rhs.league.uppercased() && lhs.game_id == rhs.game_id
            && lhs.primary_source_key == rhs.primary_source_key && lhs.input_fingerprint == rhs.input_fingerprint
            && lhs.take == rhs.take && lhs.explanation == rhs.explanation && lhs.full_case == rhs.full_case
            && lhs.counterargument == rhs.counterargument && lhs.watch_for == rhs.watch_for
            && lhs.critical_condition == rhs.critical_condition
            && lhs.what_changed == rhs.what_changed
            && lhs.horizon == rhs.horizon && lhs.evidence == rhs.evidence
            && lhs.supporting_evidence_ids == rhs.supporting_evidence_ids
            && lhs.counter_evidence_ids == rhs.counter_evidence_ids
    }

    /// Capture every source before presentation deduplication. A duplicate
    /// with newer observations must still retire a case based on old facts.
    static func observationClocks(_ candidates: [Candidate]) -> [String: Date] {
        var result: [String: Date] = [:]
        for candidate in candidates {
            guard let observed = candidate.sourceObservedAt,
                  let key = suppressionKey(league: candidate.league, date: candidate.date,
                                           gameID: candidate.gameID, sourceKey: candidate.sourceKey) else { continue }
            result[key] = result[key].map { max($0, observed) } ?? observed
        }
        return result
    }

    static func current(candidates: [Candidate], games: [Game], date: String, now: Date,
                        sourceClocks: [String: Date] = [:]) -> [Int: HubJudgment] {
        let gameGroups = Dictionary(grouping: games) { "\($0.league.uppercased())|\($0.gameID)" }
        let observations = sourceClocks.merging(observationClocks(candidates), uniquingKeysWith: max)
        let scoped = candidates.filter {
            guard $0.date == date, let judgment = $0.judgment,
                  judgment.schema_version == 1, judgment.date == date,
                  judgment.league.uppercased() == $0.league.uppercased(),
                  !judgment.game_id.isEmpty, judgment.game_id == $0.gameID,
                  !judgment.primary_source_key.isEmpty, judgment.primary_source_key == $0.sourceKey,
                  let checked = judgment.checkedAt, checked <= now.addingTimeInterval(60) else { return false }
            return true
        }
        let candidateGroups = Dictionary(grouping: scoped) { "\($0.league.uppercased())|\($0.gameID ?? "")" }
        var result: [Int: HubJudgment] = [:]
        for group in candidateGroups.values {
            // A newer failed-context check invalidates an older ready read.
            // During anchor migration, a ready read can share the check clock
            // with the superseded source. Conflicting ready ties fail closed.
            guard let newest = group.compactMap({ $0.judgment?.checkedAt }).max() else { continue }
            guard !group.contains(where: { $0.blocked && $0.judgment?.checkedAt == newest }) else { continue }
            let ready = group.filter { $0.judgment?.checkedAt == newest && $0.judgment?.status == "ready" }
            guard let candidate = ready.first, let judgment = candidate.judgment,
                  ready.allSatisfy({ item in
                      guard let other = item.judgment else { return false }
                      return sameCase(other, judgment)
                  }),
                  judgment.isCurrent(league: candidate.league, date: date, gameID: candidate.gameID,
                                     sourceKey: candidate.sourceKey, now: now),
                  !Set([judgment.primary_source_key] + judgment.evidence.compactMap(\.source_key)).contains(where: { source in
                      guard let key = suppressionKey(league: judgment.league, date: judgment.date,
                                                     gameID: judgment.game_id, sourceKey: source),
                            let observed = observations[key], let checked = judgment.checkedAt else { return false }
                      return observed > checked
                  }),
                  let gameID = candidate.gameID,
                  let matching = gameGroups["\(candidate.league.uppercased())|\(gameID)"], matching.count == 1,
                  let game = matching.first,
                  HubJudgment.gameIsUpcoming(startsAt: game.startsAt, status: game.status, now: now) else { continue }
            result[candidate.index] = judgment
        }
        return result
    }

    static func suppressionKey(league: String, date: String?, gameID: String?, sourceKey: String?) -> String? {
        guard let date, !date.isEmpty, let gameID, !gameID.isEmpty, let sourceKey, !sourceKey.isEmpty else { return nil }
        return [league.uppercased(), date, gameID, sourceKey].map { "\($0.utf8.count):\($0)" }.joined(separator: "|")
    }

    static func suppressedKeys(_ current: [HubJudgment]) -> Set<String> {
        Set(current.flatMap { judgment in
            judgment.supersedes_source_keys.compactMap {
                suppressionKey(league: judgment.league, date: judgment.date, gameID: judgment.game_id, sourceKey: $0)
            }
        })
    }
}

/// Source names are presentation labels; the original provenance stays in
/// the evidence envelope and round-trips without alteration.
enum HubResearchSource {
    static func displayName(_ source: String) -> String {
        guard source.hasPrefix("Gary "), source.hasSuffix(" collector") else { return source }
        let category = String(source.dropFirst(5).dropLast(10))
        guard !category.isEmpty, category.utf8.allSatisfy({ (97...122).contains($0) || (48...57).contains($0) || $0 == 95 }) else { return source }
        let subject: String? = [
            "bullpen_fatigue": "bullpen", "heat_check": "recent form", "cooling_off": "recent form",
            "starter_form": "recent pitching form", "starter_team_record": "team results in pitcher starts",
            "regression_watch": "underlying performance", "head_to_head": "matchup history",
            "ballpark_shift": "venue", "platoon_edge": "handedness matchup", "first_inning": "first inning",
            "park_weather": "ballpark weather", "weather": "weather", "streak": "streak",
            "streaks": "streak", "team_record": "team results", "running_game": "running game",
            "beneficiary": "roster changes", "injury": "player availability", "availability": "player availability",
            "practice_report": "practice participation", "quarterback": "quarterback", "trenches": "line play",
            "pass_rush": "pass rush", "coverage": "coverage", "pace_script": "pace and game flow",
            "red_zone": "red zone", "turnover_edge": "turnovers", "explosive_play": "explosive plays",
            "special_teams": "special teams", "coaching": "coaching", "travel_rest": "travel and rest"
        ][category]
        return subject.map { "Gary \($0) research" } ?? "Gary research"
    }
}

/// Preserves the actual cited measurements behind every evidence summary.
/// The reader presents human labels; JSON/provider keys never become prose.
indirect enum HubEvidenceValue: Codable, Equatable {
    case object([String: HubEvidenceValue]), array([HubEvidenceValue])
    case string(String), number(Double), bool(Bool), null

    init(from decoder: Decoder) throws {
        let value = try decoder.singleValueContainer()
        if value.decodeNil() { self = .null }
        else if let object = try? value.decode([String: HubEvidenceValue].self) { self = .object(object) }
        else if let array = try? value.decode([HubEvidenceValue].self) { self = .array(array) }
        else if let text = try? value.decode(String.self) { self = .string(text) }
        else if let boolean = try? value.decode(Bool.self) { self = .bool(boolean) }
        else if let number = try? value.decode(Double.self) { self = .number(number) }
        else { self = .null }
    }

    func encode(to encoder: Encoder) throws {
        var value = encoder.singleValueContainer()
        switch self {
        case .object(let item): try value.encode(item)
        case .array(let item): try value.encode(item)
        case .string(let item): try value.encode(item)
        case .number(let item): try value.encode(item)
        case .bool(let item): try value.encode(item)
        case .null: try value.encodeNil()
        }
    }

    var text: String? {
        switch self {
        case .string(let value): return value.isEmpty ? nil : value
        case .number(let value): return value.rounded() == value && abs(value) < Double(Int.max) ? String(Int(value)) : String(value)
        case .bool(let value): return value ? "Yes" : "No"
        default: return nil
        }
    }
}
