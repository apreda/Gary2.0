import SwiftUI

/// THE MARQUEE — the day's big games, tracked through their whole lifecycle
/// (founder, Jul 5): countdown to the next big one + Gary's pick → the live
/// score + where Gary stands → the result → on to the next. Tap the hero to
/// open the game; the footer unfolds the full ranked list, which stamps
/// CASHED/LOST as the day settles and teases tomorrow's marquee once done.
struct HomeMarqueeTracker: View {
    // Self-contained card: adapts its own FILL for the ground (surface
    // doctrine) — solid over THE FLOOR grid when Home sets `solidPanels`.
    @Environment(\.solidPanels) private var solidPanels
    struct Entry: Identifiable {
        let id: String
        let rank: Int
        let league: String?
        let matchupFull: String
        let title: String
        let context: String?
        let commence: String?
        let pickLine: String?
        let pendingLine: String?
        /// "ARI +160 · LAD −186 · O/U 8.5" — tonight's market off the board.
        var oddsLine: String? = nil
        let live: LiveScore?
        let verdict: HomeLiveVerdict?
        let result: (String, Color)?   // settled stamp, nil until final
        /// Exact daily-slate mirror while the live poll catches up.
        var slateInterruptionLabel: String? = nil
        /// Every slate game can hold the countdown; marquee games and Gary's
        /// published underdogs also remain available in the ribbon.
        var railWorthy: Bool = true
        var awayRanking: Int? = nil
        var homeRanking: Int? = nil
        var isLive: Bool { live?.isLive == true }
        var interruptionLabel: String? {
            if live?.isLive == true || live?.isFinal == true { return nil }
            return live?.interruptionLabel ?? slateInterruptionLabel
        }
        var isInterrupted: Bool { interruptionLabel != nil }
        var isFinal: Bool { result != nil }
        /// Begun by the clock, score feed not caught up yet.
        var started: Bool {
            guard !isLive, !isInterrupted, !isFinal,
                  let c = commence, let d = parseISO8601(c) else { return false }
            return d.addingTimeInterval(180) < Date()
        }
    }

    let entries: [Entry]
    /// (matchup, clock, start) — `start` drives the hero's live countdown.
    var tomorrowTease: (matchup: String, time: String, start: Date?)? = nil
    let onOpenGame: (String) -> Void

    /// A ribbon tap pins its game as the hero (founder, Jul 5) — cleared
    /// implicitly once that game settles.
    @State private var promotedId: String? = nil

    /// The hero is ALWAYS the UP NEXT card (founder, Jul 7 — "i loved the up
    /// next card... always there with the next game even while one is live"):
    /// live games hand off to the sheet's LIVE zone + the ribbon, never here.
    private var hero: Entry? {
        if let promotedId,
           let pinned = entries.first(where: { $0.id == promotedId && upNext($0) }) {
            return pinned
        }
        // SOONEST first (founder, Aug 4: "count down to the first game, then
        // the next based on time; tie breaker goes to the biggest game") —
        // supersedes the Jul 7 biggest-first rule from the WC era. The rank
        // only breaks a shared start time.
        return entries.filter(upNext).min {
            ($0.commence ?? "~") != ($1.commence ?? "~")
                ? ($0.commence ?? "~") < ($1.commence ?? "~")
                : $0.rank < $1.rank
        }
    }
    private func upNext(_ e: Entry) -> Bool { !e.isLive && !e.started && !e.isFinal }
    /// The rail: other marquee games and posted underdogs beside the hero (founder:
    /// no drop-down — the space was already there).
    private func rail(excluding heroID: String?) -> [Entry] {
        entries.filter { $0.id != heroID && $0.railWorthy }.sorted { a, b in
            func weight(_ e: Entry) -> Int {
                if e.isLive { return 0 }
                if e.isInterrupted || e.started { return 1 }
                if !e.isFinal { return 2 }
                return 3
            }
            let (wa, wb) = (weight(a), weight(b))
            if wa != wb { return wa < wb }
            return (a.commence ?? "") < (b.commence ?? "")
        }
    }
    private var settledLine: String? {
        let done = entries.filter { $0.isFinal }
        guard !done.isEmpty else { return nil }
        // Matches both stamps — "CASHED" (full era) and "WON" (store-safe bridge).
        let cashed = done.filter { ($0.result?.0).map { $0.contains("CASHED") || $0.contains("WON") } == true }.count
        let lost = done.filter { $0.result?.0.contains("LOST") == true }.count
        return "\(cashed)–\(lost) in the big ones"
    }

    var body: some View {
        // M1 — hero owns the full width; the rest of the day's big ones run
        // as one slim ticker ribbon along the card's bottom (founder-picked
        // over the side rail: shorter card, nothing competing with the hero).
        let hero = self.hero
        let rail = rail(excluding: hero?.id)
        VStack(spacing: 0) {
            Group {
                if let hero {
                    Button { onOpenGame(hero.matchupFull) } label: { heroView(hero) }
                        .buttonStyle(.plain)
                } else if let tease = tomorrowTease {
                    tomorrowHeroView(tease)
                } else {
                    doneView
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if !rail.isEmpty || tomorrowTease != nil {
                // C1's dark crawl band: the slate runs on its own darker
                // surface under a gold rule, so it reads as the wire and the
                // hero keeps the room.
                Rectangle().fill(GaryColors.gold.opacity(0.3)).frame(height: 1)
                ribbonView(rail)
                    .background(GaryColors.insetBand)
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(solidPanels ? GaryColors.panelFillOpaque : GaryColors.panelFill)
        )
        // The ribbon band is a square-cornered surface — clip it to the card
        // shape so it never pokes past the rounded border (Aug 3 polish).
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        // Floating over THE FLOOR (Aug 19): lit near edge + shadow puddle on
        // the grid — same treatment as every solid Home panel. Applied after
        // the clip so the shadow itself never gets cut.
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
            .stroke(LinearGradient(stops: [
                .init(color: GaryColors.warmWhite.opacity(solidPanels ? 0.16 : 0.0), location: 0),
                .init(color: GaryColors.warmWhite.opacity(solidPanels ? 0.06 : 0.0), location: 0.35),
                .init(color: GaryColors.warmWhite.opacity(solidPanels ? 0.025 : 0.0), location: 1),
            ], startPoint: .top, endPoint: .bottom), lineWidth: 1))
        .shadow(color: .black.opacity(solidPanels ? 0.55 : 0.0), radius: 18, y: 10)
        .shadow(color: .black.opacity(solidPanels ? 0.65 : 0.0), radius: 4, y: 2)
        // The old gold 0.3 outline sat over the lit rim and read as a flat
        // gold box (founder, Aug 19: the countdown "doesn't have that same
        // effect" as the headline cards). The rim carries the float now; the
        // LIVE green survives as a state signal, never as chrome.
        .overlay {
            if hero?.isLive == true {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(GaryColors.win.opacity(0.35), lineWidth: 1)
            }
        }
        .pageGutter()
    }

    /// Compact "PIT @ WSH" from the full matchup, via the league abbr maps.
    private func railTitle(_ e: Entry) -> String {
        let sides = e.matchupFull.components(separatedBy: " @ ")
        guard sides.count == 2 else { return e.matchupFull }
        let rankings = CollegeTeamRankings(league: e.league, away: e.awayRanking, home: e.homeRanking)
        return rankings.matchup(away: teamAbbrevFromName(sides[0], league: e.league),
                                home: teamAbbrevFromName(sides[1], league: e.league))
    }

    /// Sport-correct start word for the countdown row — "FIRST PITCH 7:10 PM".
    private func startWord(_ league: String?) -> String {
        switch (league ?? "").uppercased() {
        case "MLB":                return "FIRST PITCH"
        case "WC", "NFL", "NCAAF": return "KICKOFF"
        case "NBA", "NCAAB":       return "TIP-OFF"
        case "NHL":                return "PUCK DROP"
        default:                   return "STARTS"
        }
    }

    /// The bottom ticker — every non-hero big game as a "PIT @ WSH ▶ 5–3"
    /// chip, hairlines between, tomorrow's marquee dimmed at the end.
    private func ribbonView(_ rail: [Entry]) -> some View {
        let lastID = rail.last?.id
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 0) {
                ForEach(rail) { e in
                    Button {
                        // Live/upcoming chips swap INTO the hero slot; a
                        // settled chip has nothing to sweat — it opens its
                        // game sheet directly.
                        if e.isFinal || e.isLive || e.isInterrupted || e.started {
                            onOpenGame(e.matchupFull)
                        } else {
                            withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                                promotedId = e.id
                            }
                        }
                    } label: {
                        HStack(spacing: 6) {
                            Text(railTitle(e))
                                .font(GaryFonts.mono(12, bold: true))
                                .foregroundStyle(.white.opacity(0.9))
                                .lineLimit(1)
                            railStatus(e)
                        }
                        .padding(.horizontal, 12).padding(.vertical, 10)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    if e.id != lastID || tomorrowTease != nil {
                        Rectangle().fill(Color.white.opacity(0.1))
                            .frame(width: 1, height: 14)
                    }
                }
                if let tease = tomorrowTease {
                    HStack(spacing: 6) {
                        Text(tease.matchup)
                            .font(GaryFonts.mono(12, bold: true))
                            .foregroundStyle(.white.opacity(0.6))
                            .lineLimit(1)
                        Text("TMRW \(tease.time)")
                            .font(GaryFonts.mono(10, bold: true))
                            .foregroundStyle(.white.opacity(0.62))
                    }
                    .padding(.horizontal, 12).padding(.vertical, 10)
                }
            }
            .padding(.horizontal, 2)
        }
        // The viewport edge must read as a FADE, never a mid-word chop
        // (A pass, Jul 26 — the clip law applies to tickers too). The color
        // is the card's COMPOSITE surface (warmWhite 3% over the page), not
        // the raw page tone — a mismatched fade is an invisible fade.
        .overlay(alignment: .trailing) {
            LinearGradient(stops: [.init(color: GaryColors.insetBand.opacity(0), location: 0),
                                   .init(color: GaryColors.insetBand, location: 0.55),
                                   .init(color: GaryColors.insetBand, location: 1)],
                           startPoint: .leading, endPoint: .trailing)
                .frame(width: 64)
                .allowsHitTesting(false)
        }
    }

    @ViewBuilder private func railStatus(_ e: Entry) -> some View {
        if let (text, color) = e.result {
            Text(text)
                .font(GaryFonts.mono(10.5, bold: true))
                .foregroundStyle(color)
        } else if e.isLive, let det = e.live?.detail {
            HStack(spacing: 5) {
                Circle().fill(GaryColors.win).frame(width: 6, height: 6)
                Text(det.uppercased())
                    .font(GaryFonts.mono(10.5, bold: true))
                    .foregroundStyle(GaryColors.win)
            }
        } else if let interruption = e.interruptionLabel {
            Text(interruption)
                .font(GaryFonts.mono(10.5, bold: true))
                .foregroundStyle(GaryColors.gold)
        } else if e.started {
            HStack(spacing: 5) {
                Circle().fill(GaryColors.win).frame(width: 6, height: 6)
                Text("STARTED")
                    .font(GaryFonts.mono(10.5, bold: true))
                    .foregroundStyle(GaryColors.win)
            }
        } else {
            Text(TomorrowView.etTime(e.commence, withZone: false, meridiem: true).uppercased())
                .font(GaryFonts.mono(10.5))
                .foregroundStyle(.white.opacity(0.66))
        }
    }

    // The hero face — C1 (founder-picked Jul 26): the matchup as two Bebas
    // wire lines with the market inline, and the clock ALONE in its own
    // right-hand column — a simple timer to first pitch, nothing else.
    // Falls back to the single-line title when the market line can't split.
    @ViewBuilder private func heroView(_ e: Entry) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            // No header label at all (founder, Jul 27): the "PICK ~x:xx" row is
            // gone — the card opens straight onto the wire and sits shorter
            // until the pick lands.
            let sides = wireSides(e)
            let headed = false
            HStack(spacing: 0) {
                VStack(alignment: .leading, spacing: 2) {
                    if let s = sides {
                        wireLine(name: s.away.name, price: s.away.price, home: false)
                        wireLine(name: s.home.name, price: s.home.price, home: true)
                    } else {
                        Text(e.title)
                            .font(GaryFonts.display(40))
                            .foregroundStyle(GaryColors.warmWhite)
                            .lineLimit(1).minimumScaleFactor(0.7)
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        // NO pick on the hero (founder, Aug 19: "it's just a
                        // countdown") — the card reads identically before and
                        // after the pick lands, so the spacing never shifts.
                        // The pick lives on the board rows and the Picks tab.
                        // The rest of the board — total and run line — rides
                        // as one dim market row whether or not a pick posted.
                        // STORE-SAFE BRIDGE: the market row IS market data — off.
                        let market = AppFlags.storeSafe ? "" : [sides?.total, sides?.runLine].compactMap { $0 }.joined(separator: " · ")
                        if !market.isEmpty {
                            Text(market.uppercased())
                                .font(GaryFonts.mono(10.5, bold: true)).tracking(1)
                                .foregroundStyle(.white.opacity(0.38))
                                .lineLimit(1).minimumScaleFactor(0.8)
                        }
                    }
                    .padding(.top, 7)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.leading, 14).padding(.trailing, 12)

                if let interruption = e.interruptionLabel {
                    Rectangle().fill(Color.white.opacity(0.07)).frame(width: 1)
                        .padding(.vertical, 2)
                    Text(interruption)
                        .font(GaryFonts.mono(11, bold: true)).tracking(0.8)
                        .foregroundStyle(GaryColors.gold)
                        .lineLimit(2)
                        .minimumScaleFactor(0.75)
                        .frame(width: 88)
                        .padding(.horizontal, 8)
                } else if let ct = e.commence, let d = parseISO8601(ct) {
                    Rectangle().fill(Color.white.opacity(0.07)).frame(width: 1)
                        .padding(.vertical, 2)
                    // The timer, and under it the hour it's counting to
                    // (founder, Aug 5) — the clock alone says how long, not
                    // when. Same dim register as the market row, so the gold
                    // digits keep the emphasis. Inset so nothing kisses the
                    // card edge.
                    VStack(spacing: 3) {
                        HomeCountdownText(target: d, size: 17)
                            .lineLimit(1).minimumScaleFactor(0.65)
                        Text(Self.etClock(d).uppercased())
                            .font(GaryFonts.mono(10.5, bold: true)).tracking(1)
                            .foregroundStyle(.white.opacity(0.38))
                            .lineLimit(1).minimumScaleFactor(0.8)
                    }
                    .frame(width: 88)
                    .padding(.horizontal, 8)
                }
            }
            // The wire carries the card's own top air when no header ran.
            .padding(.top, headed ? 0 : 13)
            .padding(.bottom, 14)
        }
        .contentShape(Rectangle())
    }

    /// First pitch in ET — the marquee's own copy (Home's is private to its
    /// own view). Game clocks are ET everywhere in this app, never local.
    private static func etClock(_ d: Date) -> String {
        let f = DateFormatter()
        f.timeZone = TimeZone(identifier: "America/New_York")
        f.dateFormat = "h:mm a"
        return f.string(from: d)
    }

    /// "ROCKIES @ BREWERS" + "COL +270 · MIL -335 · O/U 8 · RL MIL -1.5" →
    /// the two wire sides with their prices, the total, and the run line.
    /// Nil when either half doesn't parse — the caller falls back to the
    /// plain title.
    private func wireSides(_ e: Entry)
        -> (away: (name: String, price: String?), home: (name: String, price: String?),
            total: String?, runLine: String?)? {
        let names = e.title.components(separatedBy: " @ ")
        guard names.count == 2 else { return nil }
        var away: String? = nil, home: String? = nil, total: String? = nil, runLine: String? = nil
        for (i, part) in (e.oddsLine ?? "").components(separatedBy: " · ").enumerated() {
            let p = part.trimmingCharacters(in: .whitespaces)
            if p.uppercased().hasPrefix("O/U") { total = p }
            else if p.uppercased().hasPrefix("RL ") { runLine = p }
            else if i == 0 { away = p.components(separatedBy: " ").last }
            else if i == 1 { home = p.components(separatedBy: " ").last }
        }
        return (away: (names[0], away), home: (names[1], home), total: total, runLine: runLine)
    }

    /// One wire line: the club in Bebas, its price inline. Home side carries
    /// the gold; the away price stays dim so the pair reads as a hierarchy.
    @ViewBuilder private func wireLine(name: String, price: String?, home: Bool) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(name)
                .font(GaryFonts.display(34))
                .foregroundStyle(home ? GaryColors.gold : GaryColors.warmWhite)
                .lineLimit(1).minimumScaleFactor(0.6)
            // STORE-SAFE BRIDGE: club names only on the wire — no prices.
            if let price, !AppFlags.storeSafe {
                Text(price)
                    .font(GaryFonts.display(21))
                    .foregroundStyle(home ? GaryColors.warmWhite.opacity(0.9) : .white.opacity(0.5))
                    .lineLimit(1)
            }
        }
    }

    /// The all-live / all-done state still keeps an UP NEXT on the wall —
    /// tomorrow's marquee steps in as the hero.
    private func tomorrowHeroView(_ tease: (matchup: String, time: String, start: Date?)) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("TOMORROW")
                .font(GaryFonts.mono(11, bold: true)).tracking(1.5)
                .foregroundStyle(GaryColors.gold)
            Text(tease.matchup)
                .font(GaryFonts.display(36))
                .foregroundStyle(GaryColors.warmWhite)
                .lineLimit(1).minimumScaleFactor(0.7)
            // THE CLOCK TICKS (founder, Aug 4: "this should be counting down
            // to the start of the next game"). The static "7:10 PM" told you
            // nothing you couldn't get from the board; the countdown is the
            // reason to look. Start time rides beside it so the clock has a
            // referent. Falls back to the plain time if the board's row
            // carried no parseable commence_time.
            if let start = tease.start, start > Date() {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    HomeCountdownText(target: start, size: 15)
                    Text("· FIRST PITCH \(tease.time.uppercased())")
                        .font(GaryFonts.mono(11.5, bold: true))
                        .foregroundStyle(.white.opacity(0.72))
                }
            } else {
                Text(tease.time.uppercased())
                    .font(GaryFonts.mono(11.5, bold: true))
                    .foregroundStyle(.white.opacity(0.72))
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 13)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // Every big one settled — the day's marquee line.
    private var doneView: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("TODAY'S BIG GAMES · SETTLED")
                .font(GaryFonts.mono(11, bold: true)).tracking(1.5)
                .foregroundStyle(GaryColors.gold)
            if let line = settledLine {
                Text(line)
                    .font(GaryFonts.display(22))
                    .foregroundStyle(GaryColors.warmWhite)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

}

