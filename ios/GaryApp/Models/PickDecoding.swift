import Foundation
import CoreFoundation

// MARK: - Generic Picks Value Decoder
// Handles both JSON array and stringified JSON from Supabase

enum PicksValue<T: Decodable>: Decodable {
    case array([T])
    case string(String)
    
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let arr = try? container.decode([T].self) {
            self = .array(arr)
        } else if let str = try? container.decode(String.self) {
            self = .string(str)
        } else {
            throw DecodingError.typeMismatch(
                PicksValue<T>.self,
                DecodingError.Context(
                    codingPath: decoder.codingPath,
                    debugDescription: "Expected a pick array or a stringified pick array"
                )
            )
        }
    }
    
    var asArray: [T]? {
        if case let .array(arr) = self { return arr }
        return nil
    }
    
    var asString: String? {
        if case let .string(str) = self { return str }
        return nil
    }
}

// MARK: - Database Row Models

struct DailyPicksRow: Decodable {
    let date: String
    let picks: PicksValue<GaryPick>?
}

/// The tiny subset of a historical game pick that Billfold needs for its
/// Top Pick and conviction-calibration panels. Keeping this separate prevents
/// that page from downloading every old card's rationale, stats, and injuries.
struct BillfoldPickMetadata {
    let date: String
    let pick: String
    let confidence: Double?
    let isTopPick: Bool
}

struct WeeklyNFLPicksRow: Decodable {
    let week_start: String
    let week_number: Int?
    let season: Int?
    let picks: PicksValue<GaryPick>?
}

