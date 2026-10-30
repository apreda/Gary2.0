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
    @Environment(\.panelEdge) private var panelEdge
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
        let result: (String, Color)?   // settled stamp, nil until final
        /// Exact daily-slate mirror while the live poll catches up.
        var slateInterruptionLabel: String? = nil
        /// Only selected marquee games rotate into the hero automatically.
        /// A posted underdog can stay in the ribbon without becoming a big game.
        var heroEligible: Bool = true
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
    var tomorrowTease: (matchup: String, time: String, start: Date?, league: String?)? = nil
    /// The game's matchup and league; Home opens it over the page.
    let onOpenGame: (String, String?) -> Void

    /// A ribbon tap pins its game as the hero (founder, Jul 5) — cleared
    /// implicitly once that game settles.
    @State private var promotedId: String? = nil
    /// The live hero currently turned over to Gary's side of the card.
    @State private var flippedId: String? = nil

    /// The hero follows the day's next big game through its whole life
    /// (founder, Sep 22 2026: "once that big game starts, I want to show the
    /// score and what's happening in that big game, and once that game's
    /// over, then we can count down to the next game"). The game in progress
    /// that started first holds the slot; with nothing in progress, the
    /// soonest kickoff (founder, Aug 4: soonest first, rank breaks a shared
    /// start time). A ribbon chip the fan pinned keeps the slot until it
    /// settles. Supersedes the Jul 7 always-UP-NEXT rule.
    private var hero: Entry? {
        if let promotedId,
           let pinned = entries.first(where: { $0.id == promotedId && !$0.isFinal && !$0.isInterrupted }) {
            return pinned
        }
        // One pass: each entry's clock is read once (the performance fixture
        // bounds this to one timestamp parse per row).
        var live: Entry? = nil, next: Entry? = nil
        for e in entries where e.heroEligible && !e.isFinal && !e.isInterrupted {
            if e.isLive || e.started {
                if live.map({ byStart(e, $0) }) ?? true { live = e }
            } else if next.map({ byStart(e, $0) }) ?? true {
                next = e
            }
        }
        if live == nil, let done = finishedCashRail(next: next) { return done }
        return live ?? next
    }
    /// Cash Rail (Oct 29 2026): a finished big game with a scoreboard stays as
    /// the night's record until the next big game is within the hour.
    private func finishedCashRail(next: Entry?) -> Entry? {
        if let n = next?.commence.flatMap(parseISO8601), n.timeIntervalSinceNow < 3600 { return nil }
        return entries.filter { $0.heroEligible && $0.isFinal && CashRailFormat.hasScoreboard($0.league) && $0.live?.game_id != nil }
            .max { ($0.commence ?? "") < ($1.commence ?? "") }
    }
    private func isCashRail(_ e: Entry) -> Bool {
        CashRailFormat.hasScoreboard(e.league) && e.live?.game_id != nil && !e.isInterrupted && (inPlay(e) || e.isFinal)
    }
    private func inPlay(_ e: Entry) -> Bool { (e.isLive || e.started) && !e.isFinal && !e.isInterrupted }
    private func byStart(_ a: Entry, _ b: Entry) -> Bool {
        (a.commence ?? "~") != (b.commence ?? "~")
            ? (a.commence ?? "~") < (b.commence ?? "~")
            : a.rank < b.rank
    }
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
        let done = entries.filter { $0.heroEligible && $0.isFinal }
        guard !done.isEmpty else { return nil }
        // Matches both stamps — "CASHED" (full era) and "WON" (store-safe bridge).
        let cashed = done.filter { ($0.result?.0).map { $0.contains("CASHED") || $0.contains("WON") } == true }.count
        let lost = done.filter { $0.result?.0.contains("LOST") == true }.count
        return "\(cashed)–\(lost) in the big ones"
    }

    @ObservedObject private var cashStore = CashRailStore.shared
    #if DEBUG
    /// Sim-only Cash Rail replay (tour verb `cashrail demo`).
    @ObservedObject private var cashDemo = CashRailDemo.shared
    #endif

    var body: some View {
        #if DEBUG
        if cashDemo.isOn {
            VStack(spacing: 0) {
                CashRailLabelRow(title: "THURSDAY NIGHT FOOTBALL", live: cashDemo.board?.status != "final")
                CashRailCard(awayName: "Panthers", homeName: "Packers", awayAbbr: "CAR", homeAbbr: "GB",
                             awayScore: cashDemo.away, homeScore: cashDemo.home,
                             marketLine: cashDemo.marketLine, clockBig: cashDemo.clock,
                             board: cashDemo.board, onOpenGame: {})
            }
            .pageGutter()
        } else {
            trackerBody
        }
        #else
        trackerBody
        #endif
    }

    @ViewBuilder private var trackerBody: some View {
        if let hero, isCashRail(hero) { cashRailBody(hero) } else { classicBody }
    }

    /// The live big game (NFL, NBA): the Cash Rail card, the other big games' ribbon under it.
    @ViewBuilder private func cashRailBody(_ e: Entry) -> some View {
        let names = e.title.components(separatedBy: " @ ")
        let gameID = e.live?.game_id ?? ""
        let league = (e.league ?? "NFL").uppercased()
        let board = cashStore.board(league: league, gameID: gameID)
        let rail = rail(excluding: e.id)
        VStack(spacing: 0) {
            CashRailLabelRow(title: CashRailFormat.billing(league: e.league, commence: e.commence.flatMap(parseISO8601)),
                             live: !e.isFinal)
            CashRailCard(awayName: names.first ?? e.title,
                         homeName: names.count > 1 ? names[1] : "",
                         awayAbbr: e.live?.away_abbr, homeAbbr: e.live?.home_abbr,
                         awayScore: e.live?.away_score, homeScore: e.live?.home_score,
                         marketLine: CashRailFormat.marketLine(oddsLine: e.oddsLine, pickLine: e.pickLine, spread: board?.spread),
                         clockBig: e.isFinal ? "FINAL" : (board?.clock ?? e.live?.detail ?? "STARTED").uppercased(),
                         board: board,
                         onOpenGame: { onOpenGame(e.matchupFull, e.league) })
            if !rail.isEmpty || tomorrowTease != nil {
                ribbonView(rail)
                    .background(GaryColors.insetBand)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .padding(.top, 10)
            }
        }
        .pageGutter()
        .onAppear { if !gameID.isEmpty { cashStore.watch(league: league, gameID: gameID) } }
        .onChange(of: gameID) { id in if !id.isEmpty { cashStore.watch(league: league, gameID: id) } }
    }

    @ViewBuilder private var classicBody: some View {
        // M1 — hero owns the full width; the rest of the day's big ones run
        // as one slim ticker ribbon along the card's bottom (founder-picked
        // over the side rail: shorter card, nothing competing with the hero).
        let hero = self.hero
        let rail = rail(excluding: hero?.id)
        VStack(spacing: 0) {
            Group {
                if let hero {
                    // A live game answers a different question than a
                    // scheduled one (founder, Sep 22 2026): tapping it shows
                    // the score, where Gary's money stands and what has
                    // happened, rather than opening the matchup page.
                    Button {
                        if hero.isLive {
                            withAnimation(.spring(response: 0.55, dampingFraction: 0.82)) {
                                flippedId = flippedId == hero.id ? nil : hero.id
                            }
                        } else { onOpenGame(hero.matchupFull, hero.league) }
                    } label: {
                        let turned = flippedId == hero.id
                        // The FRONT sizes the card. The back rides as an overlay
                        // so its content can never stretch the front: a ZStack
                        // sized the card to the taller hidden face and left a
                        // band of dead space above the scores (Sep 22 2026).
                        heroView(hero)
                            .opacity(turned ? 0 : 1)
                            .rotation3DEffect(.degrees(turned ? 180 : 0), axis: (x: 0, y: 1, z: 0))
                            .overlay {
                                HomeLiveGameBack(league: hero.league ?? "",
                                                 matchup: hero.matchupFull,
                                                 gameID: hero.live?.game_id,
                                                 live: hero.live,
                                                 pickLine: hero.pickLine ?? hero.pendingLine)
                                    .opacity(turned ? 1 : 0)
                                    .allowsHitTesting(turned)
                                    .rotation3DEffect(.degrees(turned ? 0 : -180), axis: (x: 0, y: 1, z: 0))
                            }
                    }
                        .buttonStyle(.plain)
                } else if let tease = tomorrowTease {
                    tomorrowHeroView(tease)
                } else {
                    doneView
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            // (With no game today the hero IS tomorrow's tease; the band would only say it again.)
            if !rail.isEmpty || (tomorrowTease != nil && hero != nil) {
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
            .stroke(panelEdge.map { AnyShapeStyle($0) } ?? AnyShapeStyle(LinearGradient(stops: [
                .init(color: GaryColors.warmWhite.opacity(solidPanels ? 0.16 : 0.0), location: 0),
                .init(color: GaryColors.warmWhite.opacity(solidPanels ? 0.06 : 0.0), location: 0.35),
                .init(color: GaryColors.warmWhite.opacity(solidPanels ? 0.025 : 0.0), location: 1),
            ], startPoint: .top, endPoint: .bottom)), lineWidth: 1))
        .shadow(color: .black.opacity(solidPanels ? 0.55 : 0.0), radius: 18, y: 10)
        .shadow(color: .black.opacity(solidPanels ? 0.65 : 0.0), radius: 4, y: 2)
        // The old gold 0.3 outline sat over the lit rim and read as a flat
        // gold box (founder, Aug 19). Green chrome went the same way (founder,
        // Sep 22 2026: "the outline should be just a subtle color, not
        // green"): a warm hairline says the card is awake without painting it
        // a state colour. The LIVE dot and word inside stay green.
        .overlay {
            if hero?.isLive == true {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(GaryColors.warmWhite.opacity(0.18), lineWidth: 1)
            }
        }
        .pageGutter()
        // `home live` in the tour harness turns the card over, so the back
        // can be checked without a tap.
        .onReceive(NotificationCenter.default.publisher(for: GaryTour.command)) { note in
            guard (note.userInfo?["verb"] as? String) == "home",
                  (note.userInfo?["arg"] as? String) == "live",
                  let hero, hero.isLive else { return }
            withAnimation(.spring(response: 0.55, dampingFraction: 0.82)) {
                flippedId = flippedId == hero.id ? nil : hero.id
            }
        }
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
                            onOpenGame(e.matchupFull, e.league)
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
                                .fitsOneLine()
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
                            .fitsOneLine()
                        // The day by name, set like the other chips' times (founder, Oct 14 2026: "TMRW" looked weird).
                        Text("\(teaseDay(tease.start)) \(tease.time)".uppercased())
                            .font(GaryFonts.mono(10.5))
                            .foregroundStyle(.white.opacity(0.66))
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

    /// "THU" for tomorrow's start in Eastern time; "TOMORROW" when the board carried no start.
    private func teaseDay(_ start: Date?) -> String {
        guard let start else { return "TOMORROW" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "America/New_York")
        f.dateFormat = "EEE"
        return f.string(from: start)
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

    @ViewBuilder private func heroView(_ e: Entry) -> some View {
        if inPlay(e) { liveHeroView(e) } else { upNextHeroView(e) }
    }

    /// The game in progress (founder, Sep 22 2026): the same two wire lines
    /// with the score on each, the clock in the right column where the
    /// countdown sat, and where Gary's pick stands under the wire. Reads
    /// the same shape before and after kickoff, so nothing jumps.
    @ViewBuilder private func liveHeroView(_ e: Entry) -> some View {
        let names = e.title.components(separatedBy: " @ ")
        let awayName = names.first ?? e.title
        let homeName = names.count > 1 ? names[1] : ""
        HStack(alignment: .center, spacing: 0) {
            // The scores stand as one block centred top to bottom in the card
            // (founder, Sep 23 2026), not on the name rows, where the pick line
            // under the names left them riding high.
            HStack(alignment: .center, spacing: 10) {
                VStack(alignment: .leading, spacing: 1) {
                    teamLine(awayName, home: false)
                    if !homeName.isEmpty { teamLine(homeName, home: true) }
                    // The pick alone (founder, Sep 24 2026): the score beside
                    // it already says whether it is hitting, so no COVERING or
                    // TRAILING, and the whole pick gets the line.
                    if let pick = e.pickLine, !pick.isEmpty {
                        Text(pick.uppercased())
                            .font(GaryFonts.mono(10.5, bold: true)).tracking(1)
                            .foregroundStyle(.white.opacity(0.62))
                            .clipsWithoutEllipsis()
                            .padding(.top, 7)
                    }
                }
                Spacer(minLength: 6)
                VStack(alignment: .trailing, spacing: 1) {
                    scoreText(e.live?.away_score)
                    if !homeName.isEmpty { scoreText(e.live?.home_score) }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.leading, 14).padding(.trailing, 12)

            Rectangle().fill(Color.white.opacity(0.07)).frame(width: 1)
            VStack(spacing: 5) {
                // The dot is the word (founder, Sep 22 2026): a small green
                // dot beside the inning says live without spelling it out.
                HStack(spacing: 6) {
                    Circle().fill(GaryColors.win).frame(width: 5, height: 5)
                    Text((e.live?.detail ?? "STARTED").uppercased())
                        .font(GaryFonts.mono(12, bold: true)).tracking(0.6)
                        .foregroundStyle(GaryColors.warmWhite)
                        .fitsOneLine()
                }
                // The diamond and the outs read as one line, centred under the
                // inning, and only while a half is actually being played — a
                // diamond hanging under "MID 4" is a runner who is not there.
                if let half = inningHalf(e), half, let outs = e.live?.outs, outs < 3 {
                    HStack(spacing: 7) {
                        LiveDiamond(onFirst: e.live?.onFirst == true,
                                    onSecond: e.live?.onSecond == true,
                                    onThird: e.live?.onThird == true,
                                    size: 7)
                        Text(outs == 1 ? "1 OUT" : "\(outs) OUTS")
                            .font(GaryFonts.mono(9.5, bold: true)).tracking(0.6)
                            .foregroundStyle(.white.opacity(0.5))
                    }
                }
            }
            .frame(width: 92)
            .frame(maxHeight: .infinity)
            .padding(.horizontal, 6)
        }
        .padding(.vertical, 11)
        .contentShape(Rectangle())
    }

    /// True while a half-inning is in play: the linescore says TOP or BOT, and
    /// MID/END mean the sides are changing.
    private func inningHalf(_ e: Entry) -> Bool? {
        guard e.live?.isLive == true else { return nil }
        let d = (e.live?.detail ?? "").uppercased()
        if d.hasPrefix("TOP") || d.hasPrefix("BOT") { return true }
        if d.hasPrefix("MID") || d.hasPrefix("END") { return false }
        return e.live?.bases != nil      // feeds that never name the half
    }

    /// One wire line: the club, home side in gold.
    private func teamLine(_ name: String, home: Bool) -> some View {
        Text(name)
            .font(GaryFonts.display(30))
            .foregroundStyle(home ? GaryColors.gold : GaryColors.warmWhite)
            .fitsOneLine()
    }

    /// One side's runs, set in the wire's own size; an unscored side keeps its
    /// row empty so the two scores stay paired.
    private func scoreText(_ score: Int?) -> some View {
        Text(score.map(String.init) ?? " ")
            .font(GaryFonts.display(30))
            .foregroundStyle(GaryColors.warmWhite)
            .monospacedDigit()
    }

    /// Before the start: the same compact countdown card as tomorrow's game (founder, Oct 30 2026: the card
    /// "just became a different size" when tonight's game took over from tomorrow's), so it never changes size.
    @ViewBuilder private func upNextHeroView(_ e: Entry) -> some View {
        let start = e.commence.flatMap(parseISO8601)
        countdownHero(kicker: start.map(Self.dayWord) ?? "TODAY", matchup: e.title,
                      time: start.map(Self.etClock) ?? "", start: start, league: e.league,
                      interruption: e.interruptionLabel)
    }

    /// First pitch in ET — the marquee's own copy (Home's is private to its
    /// own view). Game clocks are ET everywhere in this app, never local.
    private static func etClock(_ d: Date) -> String {
        let f = DateFormatter()
        f.timeZone = TimeZone(identifier: "America/New_York")
        f.dateFormat = "h:mm a"
        return f.string(from: d)
    }

    /// The all-live / all-done state still keeps an UP NEXT on the wall —
    /// tomorrow's marquee steps in as the hero.
    private func tomorrowHeroView(_ tease: (matchup: String, time: String, start: Date?, league: String?)) -> some View {
        countdownHero(kicker: "TOMORROW", matchup: tease.matchup, time: tease.time, start: tease.start,
                      league: tease.league, interruption: nil)
    }

    /// "TONIGHT" for a start at 5 PM ET or later, else "TODAY".
    private static func dayWord(_ d: Date) -> String {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "America/New_York")!
        return cal.component(.hour, from: d) >= 17 ? "TONIGHT" : "TODAY"
    }

    /// The countdown card, one size for every game: when, the matchup, and the clock to the start.
    private func countdownHero(kicker: String, matchup: String, time: String, start: Date?, league: String?,
                               interruption: String?) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(kicker)
                .font(GaryFonts.mono(11, bold: true)).tracking(1.5)
                .foregroundStyle(GaryColors.gold)
            Text(matchup)
                .font(GaryFonts.display(36))
                .foregroundStyle(GaryColors.warmWhite)
                .fitsOneLine()
            // THE CLOCK TICKS (founder, Aug 4: "this should be counting down
            // to the start of the next game"). The static "7:10 PM" told you
            // nothing you couldn't get from the board; the countdown is the
            // reason to look. Start time rides beside it so the clock has a
            // referent. Falls back to the plain time if the board's row
            // carried no parseable commence_time.
            if let interruption {
                Text(interruption.uppercased())
                    .font(GaryFonts.mono(11.5, bold: true))
                    .foregroundStyle(GaryColors.gold)
            } else if let start, start > Date() {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    HomeCountdownText(target: start, size: 15)
                    // The sport's own start word: an NFL game kicks off (founder, Oct 29 2026: "it says First Pitch").
                    Text("· \(startWord(league)) \(time.uppercased())")
                        .font(GaryFonts.mono(11.5, bold: true))
                        .foregroundStyle(.white.opacity(0.72))
                }
            } else {
                Text(time.uppercased())
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
