import Foundation
import CoreFoundation

/// A provider game is never inferred from a team name or the current date.
struct ExactGameIdentity: Hashable {
    let date: String
    let gameID: Int
    static let largestJSONInteger = 9_007_199_254_740_991
    private static let utcCalendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar
    }()
    private static let easternCalendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/New_York")!
        return calendar
    }()

    init?(date: String?, gameID: Int?) {
        guard let date, let gameID, gameID > 0, gameID <= Self.largestJSONInteger,
              date.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil else { return nil }
        let parts = date.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3,
              let parsed = Self.utcCalendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])) else { return nil }
        let checked = Self.utcCalendar.dateComponents([.year, .month, .day], from: parsed)
        guard checked.year == parts[0], checked.month == parts[1], checked.day == parts[2] else { return nil }
        self.date = date
        self.gameID = gameID
    }

    static func easternDate(of start: Date?) -> String? {
        guard let start else { return nil }
        let parts = easternCalendar.dateComponents([.year, .month, .day], from: start)
        guard let year = parts.year, let month = parts.month, let day = parts.day else { return nil }
        return String(format: "%04d-%02d-%02d", year, month, day)
    }

    static func canonicalProviderID(in row: [String: Any]) throws -> Int? {
        var selected: Int?
        for key in ["game_id", "bdl_game_id"] {
            guard let raw = row[key], !(raw is NSNull) else { continue }
            let value: Int?
            if let string = raw as? String {
                let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
                value = trimmed.range(of: #"^\d+$"#, options: .regularExpression) == nil ? nil : Int(trimmed)
            // A JSON bool is an NSNumber whose encoding is "c"; JSON integers never
            // are. Portable to the Linux swift the fixture tests compile with, which
            // has no CFGetTypeID (Sep 9 2026).
            } else if let number = raw as? NSNumber, String(cString: number.objCType) != "c" {
                let decimal = number.doubleValue
                value = decimal.isFinite && decimal.rounded() == decimal && decimal > 0
                    && decimal <= Double(largestJSONInteger) ? Int(decimal) : nil
            } else { value = nil }
            guard let value, value > 0, value <= largestJSONInteger else {
                throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "Invalid provider game identity"))
            }
            if let selected, selected != value {
                throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "Conflicting provider game identities"))
            }
            selected = value
        }
        return selected
    }
}

/// Retain the weekly alias through PicksValue's typed-array decode. The normal
/// pick parser then coalesces both names under the canonical game_id field.
struct StoredProviderGameID: Codable {
    let value: Int
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw: Any
        if let number = try? container.decode(Int.self) { raw = NSNumber(value: number) }
        else { raw = try container.decode(String.self) }
        guard let value = try ExactGameIdentity.canonicalProviderID(in: ["game_id": raw]) else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Missing provider game identity")
        }
        self.value = value
    }
    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(value)
    }
}

