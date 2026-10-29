import SwiftUI

/// THE WINNERS HERO — the top of Home sells Winners (founder, Oct 29 2026: "the ticker at the top of the
/// winners page is kinda distracting instead maybe in like a hero style ... advertise the winners page on the
/// home page so eventually when Winners arent free we can still try and get those free users to convert").
/// Gary's day on Winners: his face by the day's win rate, the record and the money large, the bets under it
/// (today's once the first one starts, yesterday's until then), and one gold action to the page. A board the
/// reader is locked out of shows its count only. One tap anywhere → Winners.
struct HomeWinnersHero: View {
    let onOpen: () -> Void

    @Environment(\.readingPageActive) private var activePage
    @Environment(\.scenePhase) private var scenePhase
    @State private var today: LabBoard?
    @State private var yesterday: LabBoard?
    @State private var now = Date()

    private static let shownRows = 3

    private var todayDate: String { GaryTour.winnersDay ?? SupabaseAPI.todayEST() }

    var body: some View {
        Button(action: onOpen) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .firstTextBaseline) {
                    Text("WINNERS")
                        .font(GaryFonts.accent(13)).tracking(1.2)
                        .foregroundStyle(GaryColors.gold)
                    Spacer()
                    if let word = dayWord {
                        Text(word)
                            .font(GaryFonts.kicker(11)).tracking(1.2)
                            .foregroundStyle(LabInk.dim)
                    }
                }
                .padding(.horizontal, 18).padding(.top, 16)

                headline
                    .padding(.horizontal, 18).padding(.top, 10).padding(.bottom, 16)

                if !rows.isEmpty || lockedLine != nil {
                    VStack(spacing: 0) {
                        ForEach(rows) { row in
                            LabHairline()
                            rowView(row)
                        }
                        if let lockedLine {
                            LabHairline()
                            Text(lockedLine)
                                .font(GaryFonts.ui(14, .semibold))
                                .foregroundStyle(LabInk.reading)
                                .frame(maxWidth: .infinity, minHeight: 46, alignment: .leading)
                        }
                    }
                    .padding(.horizontal, 18)
                }

                LabHairline().padding(.horizontal, 18)
                HStack(spacing: 7) {
                    Text("SEE GARY'S BETS").font(GaryFonts.display(18)).tracking(1.3)
                    Image(systemName: "chevron.right").font(.system(size: 12, weight: .bold)).opacity(0.75)
                    Spacer()
                    if let more = moreLine {
                        Text(more)
                            .font(GaryFonts.kicker(11)).tracking(1)
                            .foregroundStyle(LabInk.dim)
                            .fitsOneLine()
                    }
                }
                .foregroundStyle(GaryColors.gold)
                .padding(.horizontal, 18)
                .frame(minHeight: 54)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .labPlate(radius: 18, fill: LabInk.plate, edge: GaryColors.gold.opacity(0.55))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .pageGutter()
        .accessibilityElement(children: .combine)
        .accessibilityHint("Opens Winners")
        .task(id: activePage && scenePhase == .active) {
            if today == nil {
                let account = AuthManager.shared.currentUser?.id
                today = SupabaseAPI.cachedLabBoard(date: todayDate, account: account)
                yesterday = SupabaseAPI.cachedLabBoard(date: LabFormat.yesterday(of: todayDate), account: account)
            }
            guard activePage, scenePhase == .active else { return }
            while !Task.isCancelled {
                await refresh()
                do { try await Task.sleep(for: .seconds(60)) } catch { break }
            }
        }
    }

    // MARK: - The day on show

    /// Today's bets that count: a scratched play is off the board.
    private func bets(_ b: LabBoard?) -> [LabBoardTicket] { (b?.tickets ?? []).filter { !$0.scratched } }
    private func state(_ t: LabBoardTicket) -> LabTicketState { LabTicketState(result: t.outcome?.result) }
    private func settled(_ t: LabBoardTicket) -> Bool { t.outcome?.result.map { !$0.isEmpty } ?? false }
    private func started(_ t: LabBoardTicket) -> Bool { LabFormat.parseISO(t.commence).map { $0 <= now } ?? false }

    /// Today from the moment its first bet starts (the Winners page's own rule), yesterday until then.
    private var todayUnderway: Bool { bets(today).contains { settled($0) || started($0) } }
    private var showsYesterday: Bool { !todayUnderway && bets(yesterday).contains(where: settled) }
    private var shown: [LabBoardTicket] { showsYesterday ? bets(yesterday) : bets(today) }
    private var dayWord: String? {
        if showsYesterday { return "YESTERDAY" }
        return today == nil ? nil : "TODAY"
    }

    private struct Line { var won = 0, lost = 0, push = 0, units = 0.0 }
    private var line: Line {
        var l = Line()
        for t in shown where settled(t) {
            let stake = t.stakeUnits ?? 0
            switch state(t) {
            case .won: l.won += 1; l.units += stake * LabFormat.payout(t.price)
            case .lost: l.lost += 1; l.units -= stake
            case .push, .open: l.push += 1
            }
        }
        return l
    }

    /// Gary's face by the day's win rate (the daily recap's ladder); the mark before a result.
    private var face: String {
        let l = line
        guard l.won + l.lost > 0 else { return GaryBrand.mark }
        let pct = Double(l.won) / Double(l.won + l.lost)
        return pct >= 0.80 ? "GaryFire" : pct >= 0.70 ? "GaryCooking" : pct >= 0.50 ? "GaryBeer"
            : pct >= 0.40 ? "GaryIceCold" : "GaryDoomsday"
    }

    /// Bets on today's card, open or sealed, whether or not this reader can see them.
    private var todayCount: Int {
        let open = bets(today).count
        let locked = (today?.boards ?? []).filter(\.locked).reduce(0) { $0 + $1.count }
        return open + locked
    }

    @ViewBuilder private var headline: some View {
        let l = line
        HStack(alignment: .center, spacing: 14) {
            Image(face)
                .resizable().scaledToFit()
                .frame(width: 66, height: 66)
            if showsYesterday || todayUnderway {
                let tint = l.units > 0.049 ? GaryColors.win : l.units < -0.049 ? GaryColors.loss : GaryColors.silver
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Text("\(l.won)–\(l.lost)\(l.push > 0 ? "–\(l.push)" : "")")
                        .font(GaryFonts.display(44)).foregroundStyle(GaryColors.warmWhite)
                    Text(LabFormat.unitsNet(l.units))
                        .font(GaryFonts.display(44)).foregroundStyle(tint)
                        .shadow(color: tint.opacity(0.45), radius: 8)
                }
                .monospacedDigit()
                .fitsOneLine()
            } else if todayCount > 0 {
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(todayCount) \(todayCount == 1 ? "bet" : "bets") today")
                        .font(GaryFonts.display(34)).foregroundStyle(GaryColors.warmWhite)
                        .fitsOneLine()
                    if let first = firstStart {
                        Text("First at \(first)")
                            .font(GaryFonts.ui(14, .semibold)).foregroundStyle(LabInk.dim)
                    }
                }
            } else {
                Text("Gary's bets")
                    .font(GaryFonts.display(34)).foregroundStyle(GaryColors.warmWhite)
                    .fitsOneLine()
            }
            Spacer(minLength: 0)
        }
    }

    private var firstStart: String? {
        let next = bets(today)
            .compactMap { t in LabFormat.parseISO(t.commence).map { (start: $0, iso: t.commence) } }
            .filter { $0.start > now }
            .min { $0.start < $1.start }
        return next.map { LabFormat.timeET($0.iso) }
    }

    // MARK: - The bets

    private struct Row: Identifiable {
        let id: Int
        let word: String
        let color: Color
        let pick: String
        let amount: String
        let amountColor: Color
    }

    /// Results first, latest game first; then the bets still to play, soonest first.
    private var allRows: [Row] {
        let done = shown.filter(settled).sorted { (LabFormat.parseISO($0.commence) ?? .distantPast) > (LabFormat.parseISO($1.commence) ?? .distantPast) }
        let open = shown.filter { !settled($0) }.sorted { (LabFormat.parseISO($0.commence) ?? .distantFuture) < (LabFormat.parseISO($1.commence) ?? .distantFuture) }
        return (done + open).map { t in
            let pick = LabPlayModule.shortTitle(LabFormat.ticketBody(t.pickText).uppercased(), player: t.prop?.player, matchup: t.matchup)
            let stake = t.stakeUnits ?? 0
            switch settled(t) ? state(t) : .open {
            case .won:
                return Row(id: t.candidateID, word: "WIN", color: GaryColors.win, pick: pick,
                           amount: LabFormat.unitsNet(stake * LabFormat.payout(t.price)), amountColor: GaryColors.win)
            case .lost:
                return Row(id: t.candidateID, word: "LOSS", color: GaryColors.loss, pick: pick,
                           amount: LabFormat.unitsNet(-stake), amountColor: GaryColors.loss)
            case .push:
                return Row(id: t.candidateID, word: "PUSH", color: GaryColors.silver, pick: pick, amount: "$0", amountColor: GaryColors.silver)
            case .open:
                let live = started(t)
                return Row(id: t.candidateID, word: live ? "LIVE" : LabFormat.timeET(t.commence), color: live ? GaryColors.gold : LabInk.dim,
                           pick: pick, amount: LabFormat.units(stake), amountColor: LabInk.dim)
            }
        }
    }
    private var rows: [Row] { Array(allRows.prefix(Self.shownRows)) }

    private func rowView(_ row: Row) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(row.word)
                .font(GaryFonts.mono(12.5, bold: true)).foregroundStyle(row.color)
                .frame(width: 66, alignment: .leading)
                .fitsOneLine()
            Text(row.pick)
                .font(GaryFonts.mono(13.5)).foregroundStyle(GaryColors.warmWhite)
                .fitsOneLine()
            Spacer(minLength: 8)
            Text(row.amount)
                .font(GaryFonts.mono(13.5, bold: true)).foregroundStyle(row.amountColor)
                .fixedSize()
        }
        .frame(minHeight: 44)
    }

    /// A board this reader is locked out of: its count and sports, never its bets.
    private var lockedLine: String? {
        guard !showsYesterday else { return nil }
        let locked = (today?.boards ?? []).filter { $0.locked && $0.count > 0 }
        let count = locked.reduce(0) { $0 + $1.count }
        guard count > 0 else { return nil }
        var leagues: [String] = []
        for b in locked where !leagues.contains(b.league) { leagues.append(b.league) }
        return "\(count) sealed \(count == 1 ? "bet" : "bets") · " + leagues.joined(separator: " · ")
    }

    /// What the rows leave out: the rest of the day, or today's card under yesterday's results.
    private var moreLine: String? {
        if showsYesterday, todayCount > 0 { return "TODAY · \(todayCount) \(todayCount == 1 ? "BET" : "BETS")" }
        let rest = allRows.count - rows.count
        return rest > 0 ? "+\(rest) MORE" : nil
    }

    @MainActor private func refresh() async {
        now = Date()
        let day = todayDate
        async let t = try? SupabaseAPI.fetchLabBoard(date: day)
        async let y = try? SupabaseAPI.fetchLabBoard(date: LabFormat.yesterday(of: day))
        let (fresh, last) = await (t, y)
        guard !Task.isCancelled, day == todayDate else { return }
        if let fresh { today = fresh }
        if let last { yesterday = last }
    }
}
