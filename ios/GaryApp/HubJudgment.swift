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
