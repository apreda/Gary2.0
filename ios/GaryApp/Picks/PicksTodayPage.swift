import SwiftUI

/// Creating the carousel's lightweight page list must not eagerly resolve
/// every game's picks, grades and scout inputs. SwiftUI requests this content
/// when the page controller mounts the page (including its swipe neighbours).
struct DeferredPicksPage<Content: View>: View {
    @ViewBuilder let content: () -> Content
    var body: some View { content() }
}

struct PicksTodayPage: View {
    let topProps: [PropPick]
    let topGamePick: (pick: GaryPick, isYesterday: Bool)?
    let gamePickResult: (GaryPick) -> String?
    let resultForProp: (PropPick) -> String?
    let edges: [Signal]
    /// The Picks page's current individual sport scope ("MLB"/"NFL"/…) — the same
    /// scope that filters the edges. LEAGUE PULSE is league-wide, so it only
    /// lights up on an MLB or WC scope and collapses otherwise.
    let scopeLeague: String
    /// True on the TODAY board (not the Yesterday view). Drives the blurred
    /// "pick coming" teaser: TODAY with nothing posted for this sport yet shows the
    /// lock card, never an empty top — Yesterday with no result just shows nothing.
    let isToday: Bool
    let onTapProp: (PropPick) -> Void
    /// TOP FREE PICK OF THE DAY (founder, Sep 24 2026): on today's MLB and NFL
    /// boards the top card is the sport's biggest-stake Winners ticket, free.
    var topFree: TopFreePick? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            topSinglePick
            // LEAGUE PULSE moved to The Hub (founder, Jul 30) — the Picks page
            // stays picks + edges.
            // (The World Cup's bespoke section was deleted with the WC UI on
            // Aug 24 2026 — the 2026 tournament ended Jul 19, pipeline removed
            // Jul 21, and the founder's cleanup order finished the job. A 2030
            // revival is a rebuild, not a revert — see the Jul 21 removal.)
            if scopeLeague == "NFL" || scopeLeague == "NCAAF" {
                // Football runs the same section as MLB — same category tabs,
                // same feed — through a proof gate that keeps unverified
                // market/live rows off this surface (founder, Aug 20).
                EdgesSection(title: "TODAY'S EDGES",
                             edges: FootballTodayFeed.rows(edges), tabbed: true)
            } else {
                // The season series belongs to its GAME, not the day's list
                // (founder, Aug 6: "Head to Head should not be on the Today's
                // page ONLY under the the matchup/game of the two teams").
                // Keep structured football proof rows out of this prose feed.
                // The filter is a no-op for MLB kinds.
                EdgesSection(title: "TODAY'S EDGES",
                             edges: FootballTodayFeed.rows(edges.filter { $0.kind != .h2h }),
                             tabbed: true)
            }
        }
    }

    /// The Today page is the free showcase — exactly ONE pick (user call, Jun 16):
    /// the highest-confidence play for this sport scope, game or prop, with today's
    /// fresh pick preferred over yesterday's stamped result.
    @ViewBuilder private var topSinglePick: some View {
        if isToday, let free = topFree {
            topFreeCard(free)
                .padding(.horizontal, 22)
                .padding(.top, 10)
        } else {
            showcasePick
        }
    }

    private static let freeEyebrow = "TOP FREE PICK OF THE DAY"

    @ViewBuilder private func topFreeCard(_ free: TopFreePick) -> some View {
        switch free.state {
        case .pick(let game, let prop):
            if let game {
                FlippablePickCard(pick: game, eyebrowOverride: Self.freeEyebrow,
                                  gameResult: gamePickResult(game), showSportBadge: true)
            } else if let prop {
                FlippablePropCard(prop: prop, gameResult: resultForProp(prop), showSportBadge: true,
                                  eyebrowOverride: Self.freeEyebrow)
            }
        case .pending:
            TeasedPickCard(league: free.league)
        case .noGames(let next):
            // Slightly blurred so the page keeps its shape (founder, Sep 24 2026).
            TeasedPickCard(league: free.league, eyebrow: Self.freeEyebrow, headline: ("NO GAMES", "TODAY"), caption: "")
                .blur(radius: 9)
                .overlay { RoundedRectangle(cornerRadius: 20, style: .continuous).fill(Color.black.opacity(0.35)) }
                .overlay {
                    Text(Self.noGamesLine(next))
                        .font(GaryFonts.text(16, .semibold))
                        .foregroundStyle(.white)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 28)
                }
        }
    }

    /// "No games today. Free picks coming Sunday." (the next game day, ET).
    private static func noGamesLine(_ next: String?) -> String {
        guard let next, let day = dayFormatter.date(from: next) else { return "No games today. Free picks coming soon." }
        let days = Calendar(identifier: .gregorian).dateComponents([.day], from: dayFormatter.date(from: SupabaseAPI.todayEST()) ?? Date(), to: day).day ?? 99
        let words = days <= 6 ? weekdayFormatter.string(from: day) : "on " + monthDayFormatter.string(from: day)
        return "No games today. Free picks coming \(words)."
    }
    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "America/New_York"); f.dateFormat = "yyyy-MM-dd"; return f
    }()
    private static let weekdayFormatter: DateFormatter = {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "America/New_York"); f.dateFormat = "EEEE"; return f
    }()
    private static let monthDayFormatter: DateFormatter = {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "America/New_York"); f.dateFormat = "MMM d"; return f
    }()

    @ViewBuilder private var showcasePick: some View {
        let gp = topGamePick
        let prop = topProps.first
        let gameFresh = gp.map { !$0.isYesterday && gamePickResult($0.pick) == nil } ?? false
        let propFresh = prop.map { resultForProp($0) == nil } ?? false
        // Prefer a fresh pick over a stamped one; within the same tier, higher
        // confidence wins. A graded yesterday card shows only if nothing fresh exists.
        let showGame: Bool = {
            guard gp != nil else { return false }
            guard prop != nil else { return true }
            if gameFresh != propFresh { return gameFresh }
            return (gp?.pick.confidence ?? 0) >= (prop?.confidence ?? 0)
        }()

        if showGame, let gp {
            FlippablePickCard(pick: gp.pick,
                              gameResult: gamePickResult(gp.pick),
                              showSportBadge: true)
                .padding(.horizontal, 22)   // match the per-game cards (screen−44) so eyebrow + time line up across the Picks tab
                .padding(.top, 10)          // breathing room from the day/matchup tab row (was flush after the gold underline came off)
        } else if let only = prop {
            FlippablePropCard(prop: only, gameResult: resultForProp(only), showSportBadge: true)
                .padding(.horizontal, 22)   // same width as the per-game prop cards
                .padding(.top, 10)          // breathing room from the tab row (matches the game-card variant)
        } else if isToday {
            // Nothing posted for this sport yet — tease it with the blurred lock card
            // (never an empty top). A fresh pick replaces it the moment Gary posts.
            TeasedPickCard(league: scopeLeague)
                .padding(.horizontal, 22)
                .padding(.top, 10)
        }
    }

}
