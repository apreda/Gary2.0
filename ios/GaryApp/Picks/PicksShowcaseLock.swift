import Foundation

enum PicksDay { case today, yesterday }

/// The single showcase card at the top of the Picks landing page is a
/// published pick, not a live leaderboard. Once a current-day game or prop is
/// shown for a league, persist the full payload so later pick drops (or a
/// backend refresh with different ordering/confidence) cannot replace it.
/// The date is SupabaseAPI.todayEST(), so the lock naturally turns over with
/// the rest of the board at 6 a.m. ET.
struct PicksShowcaseLock: Codable {
    enum Kind: String, Codable { case game, prop }

    let slateDate: String
    let league: String
    let kind: Kind
    let gamePick: GaryPick?
    let propPick: PropPick?
}
