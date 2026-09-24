import SwiftUI

// THE FEATURED ROW (founder GO, Sep 24 2026, the Darts featured-row doc):
// four cards under the Darts header, each ending in a bet a fan can follow.
// Parlay, Primetime, Winners, Fantasy, in that order; a card with nothing
// to show today is not on the row, except the parlay and, on an NFL day, the
// fantasy column, which say they're coming. Each face carries one figure in
// the parlay's "Coming soon" type: the slot (TNF), the bankroll, the week.

// MARK: - Models

/// A finished day's Winners from `get_winners_recap`: every ticket, the
/// bankroll after it, and the next day's board as a count.
struct WinnersRecapModel: Decodable {
    struct Ticket: Decodable, Identifiable {
        let league: String?
        let kind: String?
        let pick_text: String?
        let odds: Int?
        let player: String?
        let prop: String?
        let line: LabText?
        let bet: String?
        let stake_dollars: LabNumber?
        let result: String?
        let net_dollars: LabNumber?
        var id: String { "\(pick_text ?? "")|\(stake_dollars?.value ?? 0)|\(player ?? "")" }

        /// "Sonny Gray over 17.5 outs"; a game ticket as published ("Angels ML -134").
        var words: String {
            if kind == "prop", let player {
                return [player, bet, line?.value, LabFormat.marketWords(prop)]
                    .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " ")
            }
            return pick_text ?? ""
        }
    }
    struct Next: Decodable {
        let date: String
        let count: Int
        let locked: Bool
    }
    let date: String
    let tickets: [Ticket]
    let bankroll_dollars: LabNumber?
    let initial_dollars: LabNumber?
    let started_date: String?
    let next: Next?

    var won: Int { tickets.filter { LabTicketState(result: $0.result) == .won }.count }
    var lost: Int { tickets.filter { LabTicketState(result: $0.result) == .lost }.count }
    var net: Double { tickets.compactMap { $0.net_dollars?.value }.reduce(0, +) }
}

/// The night's big games from `get_primetime`.
struct PrimetimeModel: Decodable {
    let date: String
    let games: [PrimetimeGame]
}

struct PrimetimeGame: Decodable, Identifiable {
    let league: String
    let game_id: String
    let slot: String?
    let away_team: String
    let home_team: String
    let commence_time: String?
    let venue: String?
    let spread: LabNumber?
    let total: LabNumber?
    let lede: String?
    let stat_to_know: String?
    let injuries: String?
    let live: LiveScore?
    let bets: [PrimetimeBet]
    var id: String { "\(league):\(game_id)" }

    var matchupWords: String { "\(LabFormat.nickname(away_team)) @ \(LabFormat.nickname(home_team))" }
    /// "Packers -4.5": the favorite and the spread.
    var lineWords: String? {
        guard let s = spread?.value, s != 0 else { return nil }
        let fav = s < 0 ? home_team : away_team
        let n = abs(s)
        let text = n == n.rounded() ? String(Int(n)) : String(n)
        return "\(LabFormat.nickname(fav)) -\(text)"
    }
    var started: Bool { live?.isLive == true || live?.isFinal == true }
    var gameBets: [PrimetimeBet] { bets.filter { $0.kind != "winners" } }
    var winners: [PrimetimeBet] { bets.filter { $0.kind == "winners" } }
}

struct PrimetimeBet: Decodable, Identifiable {
    let kind: String
    let label: String
    let text: String?
    let odds: Int?
    let result: String?
    let player: String?
    let player_id: String?
    let sealed: Bool?
    let stake_dollars: LabNumber?
    var id: String { "\(kind)|\(text ?? "")|\(odds ?? 0)|\(player ?? "")" }
}

/// Gary's start/sit column from `get_fantasy`.
struct FantasyColumnModel: Decodable {
    struct Bet: Decodable {
        let ref: String?
        let text: String?
        let odds: Int?
        let result: String?
    }
    struct Entry: Decodable, Identifiable {
        let player: String
        let player_id: String?
        let team: String?
        let position: String?
        let matchup: String?
        let game_id: String?
        let verdict: String
        let words: String
        let bet: Bet?
        var id: String { player }
    }
    let slate_date: String
    let week: Int?
    let games: [String]?
    let entries: [Entry]
}

extension SupabaseAPI {
    static func fetchWinnersRecap(date: String) async throws -> WinnersRecapModel {
        let data = try await WinnersAccessStore.request("rest/v1/rpc/get_winners_recap", body: ["p_date": date])
        return try JSONDecoder().decode(WinnersRecapModel.self, from: data)
    }
    static func fetchPrimetime(date: String) async throws -> PrimetimeModel {
        let data = try await WinnersAccessStore.request("rest/v1/rpc/get_primetime", body: ["p_date": date])
        return try JSONDecoder().decode(PrimetimeModel.self, from: data)
    }
    static func fetchFantasyColumn(date: String) async throws -> FantasyColumnModel? {
        let data = try await WinnersAccessStore.request("rest/v1/rpc/get_fantasy", body: ["p_date": date])
        if data.isEmpty || String(data: data, encoding: .utf8) == "null" { return nil }
        return try JSONDecoder().decode(FantasyColumnModel.self, from: data)
    }
}

// MARK: - Shared ink and parts

/// The featured sheets' ink, from the featured-row mock.
enum FeatureInk {
    static let muted = GaryColors.warmWhite.opacity(0.66)
    static let faint = GaryColors.warmWhite.opacity(0.40)
    static let rule = GaryColors.warmWhite.opacity(0.12)
    static let body = GaryColors.warmWhite.opacity(0.86)
    static let eye: Font = GaryFonts.ui(10.5, .bold)
}

/// A gold eyebrow line ("THURSDAY NIGHT FOOTBALL").
struct FeatureEyebrow: View {
    let text: String
    var body: some View {
        Text(text.uppercased()).font(FeatureInk.eye).tracking(1.7).foregroundStyle(GaryColors.gold)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// Gary's sign-off in his hand, the parlay ticket's.
struct GarySignature: View {
    var size: CGFloat = 19
    var body: some View {
        Text("— Gary A.I.").font(GaryFonts.hand(size)).foregroundStyle(GaryColors.lightGold)
    }
}

/// ✓, ✕ or – once a bet is graded; nothing while it rides.
struct ResultMark: View {
    let result: String?
    var body: some View {
        switch LabTicketState(result: result) {
        case .won: Text("✓").font(GaryFonts.ui(14, .heavy)).foregroundStyle(GaryColors.win)
        case .lost: Text("✕").font(GaryFonts.ui(14, .heavy)).foregroundStyle(GaryColors.loss)
        case .push: Text("–").font(GaryFonts.ui(14, .heavy)).foregroundStyle(GaryColors.silver)
        case .open: EmptyView()
        }
    }
}

/// The Winners play behind the paywall, or the next day's board: the gold
/// card with the mark, and UNLOCK (or OPEN for a member) to the Winners page.
struct SealedWinnersCard: View {
    let kicker: String
    let title: String
    let button: String?
    var action: () -> Void = {}

    var body: some View {
        HStack(spacing: 12) {
            Image(GaryBrand.mark).resizable().scaledToFit().frame(width: 34, height: 34)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            VStack(alignment: .leading, spacing: 1) {
                Text(kicker.uppercased()).font(GaryFonts.ui(9.5, .heavy)).tracking(1.5)
                Text(title.uppercased()).font(GaryFonts.display(20))
            }
            .foregroundStyle(Color(hex: "#15110A"))
            Spacer(minLength: 8)
            if let button {
                Button(action: action) {
                    Text(button).font(GaryFonts.ui(12, .bold)).tracking(1)
                        .foregroundStyle(GaryColors.lightGold)
                        .padding(.horizontal, 12).padding(.vertical, 10)
                        .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Color(hex: "#15110A")))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous)
            .fill(LinearGradient(colors: [GaryColors.lightGold, GaryColors.gold, Color(hex: "#8A6D14")],
                                 startPoint: .topLeading, endPoint: .bottomTrailing)))
        .accessibilityElement(children: .combine)
    }
}

/// A featured sheet's page: dark, scrolling, the grabber showing.
struct FeatureSheetPage<Content: View>: View {
    @ViewBuilder let content: () -> Content
    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 14) { content() }
                .padding(.horizontal, GaryLayout.gutter).padding(.top, 28).padding(.bottom, 48)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(GaryColors.darkBg.ignoresSafeArea())
        .presentationDragIndicator(.visible)
    }
}

// MARK: - The row

/// Darts page ink (founder, Sep 24 2026).
enum DartsInk {
    /// Unselected league and category words: a step brighter than the app's
    /// dim, "so it's just easier for people to read, even though it's not selected".
    static let idleTab = GaryColors.warmWhite.opacity(0.55)
    /// The band on a featured card with a small mark in it: warm, near the
    /// card's own face, where the parlay's coins cover a darker band.
    static let softBand = [Color(hex: "#1E1A15"), Color(hex: "#211C17")]
}

/// A tapped Primetime alert, held until Darts has read today's big game.
@MainActor enum DartsPushFocus {
    static var openPrimetime = false
    static let note = Notification.Name("DartsOpenPrimetime")
}

enum DartsFeatureSheet: String, Identifiable {
    case primetime, fantasy, winners
    var id: String { rawValue }
}

/// The featured row: the parlay at the far left, then the cards that have
/// something today.
struct DartsFeaturedRow: View {
    let parlay: ParlaySlipModel?
    let parlayOpen: Bool
    let primetime: PrimetimeModel?
    let fantasy: FantasyColumnModel?
    let recap: WinnersRecapModel?
    let onParlay: () -> Void
    let onSheet: (DartsFeatureSheet) -> Void
    @State private var rowWidth: CGFloat = 0

    private static let spacing: CGFloat = 10

    /// Four cards across the screen, never wider than the parlay's own 88.
    private var cardWidth: CGFloat {
        guard rowWidth > 0 else { return 88 }
        return min(88, ((rowWidth - 2 * GaryLayout.gutter - 3 * Self.spacing) / 4).rounded(.down))
    }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Self.spacing) {
                if let parlay {
                    ParlayEmblem(slip: parlay, open: parlayOpen, action: onParlay)
                        .anchorPreference(key: ParlayEmblemAnchor.self, value: .bounds) { $0 }
                } else {
                    ParlayEmblemSoon()
                }
                if let game = primetime?.games.first { primetimeCard(game) }
                if let recap, let bank = recap.bankroll_dollars?.value { winnersCard(bank) }
                if let fantasy {
                    fantasyCard(fantasy)
                } else if primetime?.games.contains(where: { $0.league == "NFL" }) == true {
                    fantasySoonCard
                }
            }
            .padding(.horizontal, GaryLayout.gutter)
        }
        .environment(\.emblemWidth, cardWidth)
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { rowWidth = $0 }
    }

    private func primetimeCard(_ game: PrimetimeGame) -> some View {
        let clubs = [game.away_team, game.home_team].map { name in
            ParlayClub(abbr: teamAbbrevFromName(name, league: game.league),
                       color: TeamColors.color(for: name, league: game.league) ?? GaryColors.gold, legs: 1)
        }
        return Button { onSheet(.primetime) } label: {
            ParlayEmblemCard(label: "PRIMETIME", bandInk: DartsInk.softBand) {
                ParlayBadges(clubs: clubs, ring: Color(hex: "#0F0D0B"))
            } figure: {
                EmblemFigure(text: primetimeFigure(game))
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Primetime, \(game.matchupWords), \(primetimeFigure(game))")
    }

    /// The NFL window as fans say it (TNF, SNF, MNF), a baseball game's
    /// kickoff; while it plays and after, the score.
    private func primetimeFigure(_ game: PrimetimeGame) -> String {
        if game.started, let a = game.live?.away_score, let h = game.live?.home_score { return "\(a)-\(h)" }
        if game.league == "NFL", let day = game.slot?.split(separator: " ").first {
            switch day {
            case "THURSDAY": return "TNF"
            case "SUNDAY": return "SNF"
            case "MONDAY": return "MNF"
            default: return "\(day.prefix(3)) NIGHT"
            }
        }
        guard let d = LabFormat.parseISO(game.commence_time) else { return "" }
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "America/New_York"); f.dateFormat = "h:mm"
        return f.string(from: d)
    }

    private func fantasyCard(_ column: FantasyColumnModel) -> some View {
        Button { onSheet(.fantasy) } label: {
            ParlayEmblemCard(label: "FANTASY", bandInk: DartsInk.softBand) {
                Text("START / SIT").font(GaryFonts.display(14)).tracking(0.6).foregroundStyle(GaryColors.gold)
            } figure: {
                EmblemFigure(text: column.week.map { "Week \($0)" } ?? LabFormat.weekdayWord(column.slate_date))
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Fantasy start and sit, \(column.week.map { "week \($0)" } ?? "")")
    }

    /// An NFL day before the column is written: the same card, nothing to tap.
    private var fantasySoonCard: some View {
        ParlayEmblemCard(label: "FANTASY", bandInk: DartsInk.softBand) {
            Text("START / SIT").font(GaryFonts.display(14)).tracking(0.6).foregroundStyle(GaryColors.gold)
        } figure: {
            EmblemFigure(text: "Coming soon")
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Fantasy start and sit, coming soon")
    }

    private func winnersCard(_ bankroll: Double) -> some View {
        Button { onSheet(.winners) } label: {
            ParlayEmblemCard(label: "WINNERS", bandInk: DartsInk.softBand) {
                Image(GaryBrand.mark).resizable().scaledToFit()
                    .frame(width: 24, height: 24)
                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            } figure: {
                EmblemFigure(text: LabFormat.dollars(bankroll.rounded()))
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Winners, bankroll \(LabFormat.dollars(bankroll.rounded()))")
    }
}

// MARK: - Winners recap

/// Yesterday's Winners in full (founder, Sep 24 2026: "the true transparency
/// of what happened the day before"): the record and the money, every
/// ticket in the board's order, the bankroll, then today's board sealed.
struct WinnersRecapSheet: View {
    let recap: WinnersRecapModel
    let onWinners: () -> Void

    var body: some View {
        FeatureSheetPage {
            FeatureEyebrow(text: "Winners · \(LabFormat.weekdayWord(recap.date))")
            if recap.tickets.isEmpty {
                Text("NO PLAYS").font(GaryFonts.display(40)).foregroundStyle(GaryColors.warmWhite)
            } else {
                HStack(alignment: .firstTextBaseline, spacing: 14) {
                    Text("\(recap.won)-\(recap.lost)").font(GaryFonts.display(52)).foregroundStyle(GaryColors.warmWhite)
                        .monospacedDigit()
                    Text(moneyWords(recap.net)).font(GaryFonts.display(31))
                        .foregroundStyle(recap.net >= 0 ? GaryColors.win : GaryColors.loss).monospacedDigit()
                }
            }
            if let bank = recap.bankroll_dollars?.value {
                bankLine(bank)
            }
            if !recap.tickets.isEmpty {
                VStack(spacing: 0) {
                    Rectangle().fill(FeatureInk.rule).frame(height: 1)
                    ForEach(recap.tickets) { t in
                        ticketRow(t)
                        Rectangle().fill(FeatureInk.rule).frame(height: 1)
                    }
                }
            }
            if let next = recap.next {
                SealedWinnersCard(kicker: LabFormat.weekdayWord(next.date),
                                  title: next.count == 0 ? "On the way" : (next.locked ? "Sealed" : "\(next.count) plays"),
                                  button: next.count == 0 ? nil : (next.locked ? "UNLOCK" : "OPEN"),
                                  action: onWinners)
                    .padding(.top, 4)
            }
        }
    }

    private func moneyWords(_ v: Double) -> String {
        (v < 0 ? "-" : "+") + LabFormat.dollars(v.rounded())
    }

    private func bankLine(_ bank: Double) -> some View {
        let start = recap.initial_dollars?.value ?? LabFormat.bankrollDollars
        let diff = bank - start
        var words = Text("Bankroll ").foregroundColor(FeatureInk.muted)
            + Text(LabFormat.dollars(bank.rounded())).foregroundColor(GaryColors.warmWhite).fontWeight(.semibold)
        if let started = recap.started_date, diff.rounded() != 0 {
            words = words + Text(" · \(diff > 0 ? "up" : "down") \(LabFormat.dollars(diff.rounded())) since \(LabFormat.monthDay(started))")
                .foregroundColor(FeatureInk.muted)
        }
        return words.font(GaryFonts.ui(12.5)).monospacedDigit()
    }

    private func ticketRow(_ t: WinnersRecapModel.Ticket) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            ResultMark(result: t.result).frame(width: 16, alignment: .leading)
            Text(t.words).font(GaryFonts.ui(12.5, .semibold)).foregroundStyle(GaryColors.warmWhite)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 8)
            if let stake = t.stake_dollars?.value {
                Text(LabFormat.dollars(stake.rounded())).font(GaryFonts.ui(12.5)).foregroundStyle(FeatureInk.faint).monospacedDigit()
            }
            if let net = t.net_dollars?.value {
                Text(moneyWords(net)).font(GaryFonts.ui(12.5, .bold))
                    .foregroundStyle(net > 0 ? GaryColors.win : (net < 0 ? GaryColors.loss : GaryColors.silver))
                    .monospacedDigit().frame(minWidth: 52, alignment: .trailing)
            }
        }
        .padding(.vertical, 8)
    }
}

extension LabFormat {
    /// "Sep 16" for "2026-09-16".
    static func monthDay(_ ymd: String) -> String {
        let p = DateFormatter(); p.locale = Locale(identifier: "en_US_POSIX"); p.dateFormat = "yyyy-MM-dd"
        p.timeZone = TimeZone(identifier: "America/New_York")
        guard let d = p.date(from: ymd) else { return ymd }
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US"); f.dateFormat = "MMM d"
        f.timeZone = TimeZone(identifier: "America/New_York")
        return f.string(from: d)
    }
}
