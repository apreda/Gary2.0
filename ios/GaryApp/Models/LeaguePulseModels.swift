import Foundation
import CoreFoundation

// MARK: - League Pulse (one league_pulse row per tab — generic table)
// A fully data-driven table: the row carries its own columns[] (header schema)
// and rows[] (flat string maps keyed by columns[].key). ONE Swift table view
// renders every tab with zero per-tab code; a dropped tab is simply an absent
// row. Optional reserved cell keys the UI reads when present: "team", "trend"
// ("hot"/"cold"), "highlight" ("today").

struct LeaguePulseColumn: Decodable {
    let key: String
    let label: String
    let align: String?       // "leading" | "trailing"
    let emphasis: String?    // "primary" | "stat" | "muted"
}

struct LeaguePulseRow: Decodable, Identifiable {
    let date: String?
    let league: String?
    let tab: String?
    let title: String?
    let subtitle: String?
    let sortNote: String?
    let columns: [LeaguePulseColumn]
    /// Each cell is a display string (nullable in the payload). Decoded into a
    /// `[String: String]` so the table can read `cells[col.key]` with no casts.
    let rows: [[String: String]]

    var id: String { tab ?? title ?? "" }

    enum CodingKeys: String, CodingKey {
        case date, league, tab, title, subtitle
        case sortNote = "sort_note"
        case columns, rows
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        date = try c.decodeIfPresent(String.self, forKey: .date)
        league = try c.decodeIfPresent(String.self, forKey: .league)
        tab = try c.decodeIfPresent(String.self, forKey: .tab)
        title = try c.decodeIfPresent(String.self, forKey: .title)
        subtitle = try c.decodeIfPresent(String.self, forKey: .subtitle)
        sortNote = try c.decodeIfPresent(String.self, forKey: .sortNote)
        columns = (try? c.decode([LeaguePulseColumn].self, forKey: .columns)) ?? []
        // rows[] is [{ key: String? }] in the payload — null cells collapse to
        // "" so every cell is a plain display string downstream.
        let raw = (try? c.decode([[String: String?]].self, forKey: .rows)) ?? []
        rows = raw.map { dict in
            var out: [String: String] = [:]
            for (k, v) in dict { out[k] = v ?? "" }
            return out
        }
    }
}

