import Foundation

/// League priority for defaults, headlines and Home board order. During the
/// football season, the NFL and NCAAF desks lead, followed by MLB; inactive
/// leagues naturally disappear because the callers only rank posted content.
enum LeaguePriority {
    static func rank(_ league: String?) -> Int {
        switch (league ?? "").uppercased() {
        case "NFL", "NFL TDS": return 0
        case "NCAAF": return 1
        case "MLB": return 2
        case "WC", "SOCCER_WORLD_CUP", "SOCCER": return 3
        case "NBA": return 4
        default: return 5
        }
    }
}
