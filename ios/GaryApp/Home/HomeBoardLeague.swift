import Foundation

enum HomeBoardLeague: String, CaseIterable, Hashable {
    case mlb = "MLB"
    case nfl = "NFL"
    /// College football is a first-class board tab (founder, Aug 26:
    /// "we need an NCAAF tab") — same board, same empty-state honesty.
    case ncaaf = "NCAAF"
    /// The user's own slate (founder, Aug 20: "a You tab next to NFL") —
    /// same board, same rows, THEIR side's standing in the verdict slot.
    case you = "YOU"

    var sport: Sport {
        switch self {
        case .mlb: return .mlb
        case .ncaaf: return .ncaaf
        default: return .nfl
        }
    }

    /// Sports with games on this slate lead. Football precedes baseball
    /// when both play; inactive sports stay tappable and YOU stays last.
    static func ordered(available: Set<HomeBoardLeague>) -> [HomeBoardLeague] {
        let sports: [HomeBoardLeague] = [.nfl, .ncaaf, .mlb]
        return sports.filter { available.contains($0) }
            + sports.filter { !available.contains($0) }
            + (available.contains(.you) ? [.you] : [])
    }
}
