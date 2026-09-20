import SwiftUI
import Charts
import PhotosUI

@MainActor private var unitPromptShownThisSession = false

// ── YOUR BOOK (the Billfold's YOU page) ─────────────────────────────────────
// Two ledgers, never mixed: WITH GARY = system-graded tails/fades (the
// flagship, unfakeable number); YOUR PLAYS = self-logged bets, labeled.
// Founder, Aug 20: "the You part should be very very close to the Gary
// billfold page" — same card grammar (soft-fill cards on the page ground,
// 14pt radius, 18pt section rhythm), same wallet-header voice, the pieces
// only a user has (streak, filters, split book, slips) as its own sections.
struct UserBookSection: View {
    @ObservedObject private var auth = AuthManager.shared
    @Environment(\.scenePhase) private var scenePhase
    @State private var visibleDays = 30
    @State private var favoritesOnly = false
    @State private var query = ""
    @State private var bets: [UserBet] = []
    @State private var loading = true
    @State private var showQuickLog = false
    @State private var showAuthSheet = false
    @State private var showUnitSheet = false
    @AppStorage("userUnitDollars") private var userUnitDollars = 0.0
    @State private var shareImage: UserBookShareImage? = nil
    @State private var streak: UserBookAPI.UserStreak? = nil
    // Tracker controls (YOU page): calendar period + source filters, live-slip context.
    @AppStorage("bookPeriodKind") private var periodKindRaw = "month"
    @State private var period = BookPeriod.containing(SupabaseAPI.todayEST(), kind: .month)
    /// Any date inside the month the calendar shows; follows the period when it is a month.
    @State private var calendarAnchor = SupabaseAPI.todayEST()
    @State private var breakdownDimension: BookBreakdownDimension = .league
    @State private var selectedDay: BookSelectedDay? = nil
    @State private var kindFilter = "all"         // all | tail | fade | manual
    @State private var liveScores: [LiveScore] = []
    @State private var todayPicks: [GaryPick] = []
    /// The book couldn't be read (network/session), as opposed to being empty.
    @State private var loadFailed = false

    private var withGary: [UserBet] { bets.filter { $0.isVerified } }
    private var yourPlays: [UserBet] { bets.filter { $0.kind == "manual" } }

    private func record(_ rows: [UserBet]) -> (w: Int, l: Int, p: Int, units: Double) {
        var w = 0, l = 0, p = 0; var u = 0.0
        for b in rows {
            switch b.status {
            case "won": w += 1
            case "lost": l += 1
            case "push": p += 1
            default: break
            }
            u += b.units_net ?? 0
        }
        return (w, l, p, u)
    }

    /// The Gary-page card surface, verbatim (BillfoldView.paperCard).
    private func bookCard(radius: CGFloat = 14) -> some View {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
            .fill(Color.white.opacity(0.055))
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .stroke(Color.white.opacity(0.10), lineWidth: 1)
            )
    }

    var body: some View {
        VStack(spacing: 0) {
            if auth.bearerToken != nil, !loading, !loadFailed, !bets.isEmpty {
                trackerFilters
                    .padding(.horizontal, 18)
                    .padding(.top, 4)
            }
            ScrollView(showsIndicators: false) {
                bookContent
                    .padding(.horizontal, 16)
                    .padding(.top, 4)
                    .padding(.bottom, 120)
            }
            .refreshable { await refreshBook() }
        }
        .task(id: auth.currentUser?.id) {
            bets = []; streak = nil; todayPicks = []; liveScores = []
            loading = true; loadFailed = false
            let kind = BookPeriodKind(rawValue: periodKindRaw) ?? .month
            if period.kind != kind { period = BookPeriod.containing(SupabaseAPI.todayEST(), kind: kind) }
            await refreshBook()
        }
        .onChange(of: period) { next in
            periodKindRaw = next.kind.rawValue
            if next.kind == .month { calendarAnchor = next.start }
        }
        .sheet(item: $selectedDay) { day in
            BookDaySheet(date: day.date, bets: laneBets.filter { $0.game_date == day.date }) { updated in
                if let i = bets.firstIndex(where: { $0.id == updated.id }) { bets[i] = updated }
            } onDelete: { id in bets.removeAll { $0.id == id } }
        }
        .onReceive(NotificationCenter.default.publisher(for: .userBookChanged)) { _ in
            Task { await refreshBook() }
        }
        .onChange(of: scenePhase) { phase in
            if phase == .active { Task { await refreshBook() } }
        }
        .onGaryTour { verb, arg in
            // DEBUG harness only (GaryTour posts these): drive the analytics
            // surfaces the simulator cannot tap on its own.
            switch verb {
            case "logbet": showQuickLog = true
            case "bookday": selectedDay = BookSelectedDay(date: arg)
            case "bookperiod": period = BookPeriod.containing(SupabaseAPI.todayEST(), kind: BookPeriodKind(rawValue: arg) ?? .month)
            case "bookdim": breakdownDimension = BookBreakdownDimension(rawValue: arg) ?? .league
            case "bookfilter": kindFilter = arg
            default: break
            }
        }
        .sheet(isPresented: $showUnitSheet) { UnitSizeSheet() }
        .sheet(isPresented: $showQuickLog) {
            QuickLogSheet { newBet in bets.insert(newBet, at: 0) }
        }
        .sheet(isPresented: $showAuthSheet) { AuthView() }
        .sheet(item: $shareImage) { item in
            UserBookShareSheet(items: [item.image])
        }
    }

    private var bookContent: some View {
        VStack(alignment: .leading, spacing: 26) {
            if AuthManager.shared.bearerToken == nil {
                signedOutCard
            } else if loading {
                ProgressView().tint(.white.opacity(0.4))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 60)
            } else if loadFailed {
                unavailableCard
            } else if withGary.isEmpty && yourPlays.isEmpty {
                emptyBookCard
            } else {
                periodPager
                walletHeader
                profitChart
                calendarCard
                bookActions
                streakCrown
                splitBookHeader
                statTiles
                breakdownsCard
                bankrollCard
                HStack(spacing: 12) {
                    TextField("Search your bets", text: $query)
                        .font(GaryFonts.text(13)).textInputAutocapitalization(.never)
                    Button { favoritesOnly.toggle() } label: {
                        Image(systemName: favoritesOnly ? "heart.fill" : "heart")
                            .foregroundStyle(favoritesOnly ? GaryColors.gold : .white.opacity(0.6))
                            .frame(width: 44, height: 44)
                    }.accessibilityLabel(favoritesOnly ? "Show all bets" : "Show favorites")
                    ShareLink(item: BookExport.csv(scopedBets), preview: SharePreview("My Gary bet history")) {
                        Image(systemName: "square.and.arrow.up").frame(width: 44, height: 44)
                    }.accessibilityLabel("Export filtered bet history as CSV")
                }
                .padding(.horizontal, 12)
                .overlay(alignment: .bottom) {
                    Rectangle().fill(Color.white.opacity(0.08)).frame(height: 0.5)
                }
                pendingBlock
                settledByDay
                if scopedBets.isEmpty {
                    Text("No history matches this date range and filters.")
                        .font(GaryFonts.text(13)).foregroundStyle(.white.opacity(0.6))
                }
            }
        }
    }

    // The headline and curve always describe one grading source. The ledger
    // can show both sources, with their records separately labeled below.
    private var summaryBets: [UserBet] {
        kindFilter == "manual" ? scopedYourPlays : scopedWithGary
    }

    private var summarySettled: [UserBet] {
        summaryBets.filter { !$0.isPending && $0.status != "void" }
            .sorted { a, b in
                a.game_date == b.game_date
                    ? (a.placed_at ?? "") < (b.placed_at ?? "")
                    : a.game_date < b.game_date
            }
    }

    private var summarySource: String {
        switch kindFilter {
        case "tail": return "TAILS · VERIFIED"
        case "fade": return "FADES · VERIFIED"
        case "manual": return "YOUR PLAYS · SELF-GRADED"
        default: return "WITH GARY · VERIFIED"
        }
    }

    private var timeframeLabel: String { period.label }

    /// The graded lane the headline describes (verified, or self-graded on
    /// YOURS), every date, with the search and favorite filters applied.
    private var laneBets: [UserBet] {
        bets.filter { (kindFilter == "manual" ? $0.kind == "manual" : $0.isVerified) && matchesBookFilters($0) }
    }

    private var periodPager: some View {
        BookPeriodPager(period: $period, today: SupabaseAPI.todayEST())
            .padding(.horizontal, 12)
    }

    private var monthGrid: BookMonthGrid {
        let m = BookCalendar.monthOf(calendarAnchor)
        return BookCalendar.month(year: m.year, month: m.month, entries: laneBets.map(\.analyticsEntry))
    }

    private var calendarCard: some View {
        let today = SupabaseAPI.todayEST()
        let grid = monthGrid
        return BookCalendarView(
            grid: grid, today: today,
            canMoveForward: grid.period.canMoveForward(today: today),
            onShift: { steps in
                if period.kind == .month {
                    period = period.shifted(by: steps)
                } else {
                    calendarAnchor = grid.period.shifted(by: steps).start
                }
            },
            onSelect: { cell in selectedDay = BookSelectedDay(date: cell.date) })
        .padding(.horizontal, 12)
    }

    private var breakdownsCard: some View {
        BookBreakdownsCard(entries: summaryBets.map(\.analyticsEntry),
                           scopeLine: "\(summarySource) · \(period.kicker)",
                           dimension: $breakdownDimension)
            .padding(.horizontal, 12)
    }

    private var bankrollCard: some View {
        BookBankrollCard(windows: BookBankroll.rolling(laneBets.map(\.analyticsEntry), today: SupabaseAPI.todayEST()),
                         sourceLine: "\(summarySource.lowercased()) · the last 30, 60 and 90 days, ending today in Eastern time · independent of the period above")
            .padding(.horizontal, 12)
    }

    private var walletHeader: some View {
        let g = record(summarySettled)
        let decided = g.w + g.l
        let staked = summarySettled.filter { $0.status == "won" || $0.status == "lost" }
            .reduce(0.0) { $0 + $1.stake_units }
        return VStack(spacing: 7) {
            Text("NET BALANCE · \(kindFilter == "manual" ? "YOUR PLAYS" : "WITH GARY")")
                .font(.system(size: 10, weight: .semibold)).tracking(1)
                .foregroundStyle(GaryColors.gold.opacity(0.85))
            BillfoldBalanceValue(value: BookMoney.netTotal(g.units))
            VStack(spacing: 5) {
                HStack(spacing: 9) {
                    Text(staked > 0 ? String(format: "ROI %+.1f%%", g.units / staked * 100) : "ROI —")
                        .font(.system(size: 14, weight: .bold).monospacedDigit())
                        .foregroundStyle(staked > 0 ? (g.units >= 0 ? GaryColors.win : GaryColors.loss) : .white.opacity(0.5))
                    Text("·").foregroundStyle(GaryColors.gold.opacity(0.5))
                    Text("\(g.w)–\(g.l)–\(g.p)")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.85))
                    Text("·").foregroundStyle(GaryColors.gold.opacity(0.5))
                    Text(String(format: "%+.1fu", g.units))
                        .font(GaryFonts.mono(12, bold: true)).foregroundStyle(.white.opacity(0.75))
                }
                HStack(spacing: 9) {
                    Text(decided > 0 ? String(format: "%.0f%% win", Double(g.w) / Double(decided) * 100) : "Win rate —")
                    Text("·").foregroundStyle(GaryColors.gold.opacity(0.5))
                    Text(timeframeLabel)
                }
                .font(.system(size: 12, weight: .medium)).foregroundStyle(GaryColors.gold)
            }
            BillfoldResultDots(results: Array(summarySettled.suffix(10).map(\.status)))
            Text(summarySource)
                .font(.system(size: 8, weight: .semibold)).tracking(0.8)
                .foregroundStyle(.white.opacity(0.45))
                .padding(.top, 3)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 6).padding(.bottom, 2)
    }

    private var bookActions: some View {
        HStack(spacing: 16) {
            Button { showQuickLog = true } label: {
                Label("LOG A BET", systemImage: "plus")
                    .font(.system(size: 12, weight: .semibold))
                    .frame(minHeight: 44)
            }
            Spacer()
            if withGary.contains(where: { !$0.isPending }) {
                Button {
                    let g = record(withGary.filter { !$0.isPending })
                    let line = (streak?.current ?? 0) >= 2
                        ? "Day \(streak!.current) of the streak" : currentStreakText(withGary)
                    if let img = renderRideShareImage(record: g, streakText: line) {
                        shareImage = UserBookShareImage(image: img)
                    }
                } label: {
                    VStack(alignment: .trailing, spacing: 3) {
                        Label("SHARE VERIFIED", systemImage: "square.and.arrow.up")
                            .font(.system(size: 11, weight: .semibold))
                        Text("ALL TIME")
                            .font(.system(size: 8, weight: .medium)).tracking(0.5)
                            .foregroundStyle(.white.opacity(0.45))
                    }
                    .frame(minHeight: 44)
                }
                .accessibilityLabel("Share your all-time verified record")
            }
        }
        .buttonStyle(.plain)
        .foregroundStyle(GaryColors.gold)
        .padding(.horizontal, 12)
        .overlay(alignment: .bottom) {
            Rectangle().fill(Color.white.opacity(0.08)).frame(height: 0.5)
        }
    }

    private var signedOutCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("YOUR BOOK")
                .font(GaryFonts.mono(11, bold: true)).tracking(1.4)
                .foregroundStyle(GaryColors.gold)
            Text("Sign in and every pick you tail or fade goes on your own record — graded by the same system that grades Gary.")
                .font(GaryFonts.text(13))
                .foregroundStyle(.white.opacity(0.6))
                .fixedSize(horizontal: false, vertical: true)
            Button { showAuthSheet = true } label: {
                Text("Sign in")
                    .font(GaryFonts.mono(11, bold: true)).tracking(1)
                    .foregroundStyle(.black)
                    .padding(.horizontal, 16).padding(.vertical, 8)
                    .background(RoundedRectangle(cornerRadius: 7).fill(GaryColors.gold))
            }
            .buttonStyle(.plain)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(bookCard())
    }

    /// Honest state when the book can't be read — never "no entries" over a
    /// record that exists (founder law: an unavailable surface says so).
    private var unavailableCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("YOUR BOOK")
                .font(GaryFonts.mono(11, bold: true)).tracking(1.4)
                .foregroundStyle(GaryColors.gold)
            Text("Couldn't reach your book just now. Your record is safe — pull to refresh, or sign in again if this keeps up.")
                .font(GaryFonts.text(13))
                .foregroundStyle(.white.opacity(0.6))
                .fixedSize(horizontal: false, vertical: true)
            Button {
                Task {
                    loading = true
                    let rows = await UserBookAPI.fetchMyBets()
                    if let rows { bets = rows; loadFailed = false } else { loadFailed = true }
                    loading = false
                }
            } label: {
                Text("TRY AGAIN")
                    .font(GaryFonts.mono(10, bold: true)).tracking(0.8)
                    .foregroundStyle(.black)
                    .padding(.horizontal, 12).padding(.vertical, 7)
                    .background(Capsule().fill(GaryColors.gold))
            }
            .buttonStyle(.plain)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(bookCard())
    }

    private var emptyBookCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("YOUR BOOK")
                .font(GaryFonts.mono(11, bold: true)).tracking(1.4)
                .foregroundStyle(GaryColors.gold)
            Text("No entries yet. Tail or fade any pick from its card — your side locks at first pitch and grades itself.")
                .font(GaryFonts.text(13))
                .foregroundStyle(.white.opacity(0.6))
                .fixedSize(horizontal: false, vertical: true)
            Button { showQuickLog = true } label: {
                Text("+ LOG A BET")
                    .font(GaryFonts.mono(10, bold: true)).tracking(0.8)
                    .foregroundStyle(.black)
                    .padding(.horizontal, 12).padding(.vertical, 7)
                    .background(Capsule().fill(GaryColors.gold))
            }
            .buttonStyle(.plain)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(bookCard())
    }

    /// The personal streak uses the same open ledger treatment as Gary's stats.
    private var streakCrown: some View {
        let todayPlay = bets.first { $0.streak_pick == true && $0.isPending }
        let current = streak?.current ?? 0
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                BillfoldSectionTitle(title: "THE STREAK")
                Spacer()
                Text("BEST \(streak?.best ?? 0)")
                    .font(GaryFonts.mono(9, bold: true)).foregroundStyle(.white.opacity(0.45))
            }
            HStack(alignment: .top, spacing: 14) {
                Text(current > 0 ? "W\(current)" : "0")
                    .font(GaryFonts.mono(30, bold: true))
                    .foregroundStyle(current > 0 ? GaryColors.gold : .white.opacity(0.4))
                    .frame(minWidth: 44, alignment: .leading)
                Text(streakStateLine(todayPlay: todayPlay))
                    .font(GaryFonts.text(12.5))
                    .foregroundStyle(.white.opacity(0.6))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, 12)
    }

    private func streakStateLine(todayPlay: UserBet?) -> String {
        if let p = todayPlay {
            return "Tonight's streak play is set: \(p.pick_text)"
        }
        if (streak?.current ?? 0) > 0 {
            return "Your streak carries over on days off. Choose a pregame tail or fade when you're ready."
        }
        return "Star one pregame tail or fade per date. Wins build your streak; a loss resets it. Pushes, voids and days off keep it intact."
    }

    private func currentStreakText(_ rows: [UserBet]) -> String? {
        let graded = rows.filter { !$0.isPending && $0.status != "void" && $0.status != "push" }
            .sorted { ($0.placed_at ?? "") > ($1.placed_at ?? "") }
        guard let first = graded.first, first.status == "won" else { return nil }
        var count = 0
        for b in graded { if b.status == "won" { count += 1 } else { break } }
        guard count >= 2 else { return nil }
        return "Riding a \(count)-bet heater"
    }

    /// Verified and self-graded histories retain separate, explicit records.
    private var splitBookHeader: some View {
        VStack(alignment: .leading, spacing: 0) {
            BillfoldSectionTitle(title: "BY SOURCE")
                .padding(.bottom, 10)
            HStack(spacing: 4) {
                Text("SOURCE").frame(maxWidth: .infinity, alignment: .leading)
                Text("RECORD").frame(width: 64, alignment: .trailing)
                Text("NET").frame(width: 78, alignment: .trailing)
            }
            .font(.system(size: 8, weight: .bold)).tracking(0.5)
            .foregroundStyle(.white.opacity(0.4))
            .padding(.bottom, 5)
            sourceRow("WITH GARY", subtitle: "VERIFIED", rows: scopedWithGary)
            Rectangle().fill(Color.white.opacity(0.08)).frame(height: 0.5)
            sourceRow("YOUR PLAYS", subtitle: "SELF-GRADED", rows: scopedYourPlays)
        }
        .padding(.horizontal, 12)
    }

    private func sourceRow(_ title: String, subtitle: String, rows: [UserBet]) -> some View {
        let r = record(rows.filter { !$0.isPending })
        return HStack(spacing: 4) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.system(size: 12, weight: .bold)).foregroundStyle(.white.opacity(0.85))
                Text(subtitle).font(.system(size: 8, weight: .medium)).tracking(0.5)
                    .foregroundStyle(.white.opacity(0.45))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text("\(r.w)-\(r.l)\(r.p > 0 ? "-\(r.p)" : "")")
                .font(GaryFonts.mono(12)).foregroundStyle(.white.opacity(0.5))
                .frame(width: 64, alignment: .trailing)
            Text(BookMoney.netTotal(r.units))
                .font(GaryFonts.mono(12, bold: true))
                .foregroundStyle(r.units == 0 ? .white.opacity(0.5) : r.units > 0 ? GaryColors.win : GaryColors.loss)
                .lineLimit(1).minimumScaleFactor(0.7)
                .frame(width: 78, alignment: .trailing)
        }
        .padding(.vertical, 9)
    }

    // ── Tracker: scope filters ──────────────────────────────────────────────

    private var scopedBets: [UserBet] {
        bets.filter { b in period.contains(b.game_date) && matchesBookFilters(b) }
    }
    private var scopedWithGary: [UserBet] { scopedBets.filter { $0.isVerified } }
    private var scopedYourPlays: [UserBet] { scopedBets.filter { $0.kind == "manual" } }
    private var scopedSettled: [UserBet] { scopedBets.filter { !$0.isPending } }
    /// Open slips ignore the timeframe — a pending bet is always "now".
    private var openSlips: [UserBet] {
        bets.filter { $0.isPending && matchesBookFilters($0) }
            .sorted { ($0.lock_at ?? "9999") < ($1.lock_at ?? "9999") }
    }

    private var trackerFilters: some View {
        HStack(spacing: 8) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 14) {
                    filterChip("ALL", key: "all")
                    filterChip("TAILS", key: "tail")
                    filterChip("FADES", key: "fade")
                    filterChip("YOURS", key: "manual")
                }
            }
            Spacer(minLength: 0)
            Text(period.kicker)
                .font(GaryFonts.mono(9, bold: true)).tracking(0.6)
                .foregroundStyle(GaryColors.gold)
                .lineLimit(1).minimumScaleFactor(0.7)
                .accessibilityLabel("Book period: \(timeframeLabel)")
        }
    }

    private func filterChip(_ label: String, key: String) -> some View {
        BillfoldFilterTab(title: label, isSelected: kindFilter == key) { kindFilter = key }
    }

    // ── Tracker: stat tiles ─────────────────────────────────────────────────

    private var statTiles: some View {
        let settled = summarySettled
        let decisive = settled.filter { $0.status == "won" || $0.status == "lost" }
        let wins = decisive.filter { $0.status == "won" }.count
        let winPct = decisive.isEmpty ? nil : Double(wins) / Double(decisive.count) * 100
        let staked = decisive.reduce(0.0) { $0 + $1.stake_units }
        let net = settled.reduce(0.0) { $0 + ($1.units_net ?? 0) }
        let roi = staked > 0 ? net / staked * 100 : nil
        // American odds never average by arithmetic mean — a +100 and a -108
        // "averaged" to -4 (seen live Aug 20). Average in implied-probability
        // space, then convert back to a real American price.
        let oddsVals = decisive.compactMap { $0.odds_american }.map(Double.init)
        let avgOdds: Int? = {
            guard !oddsVals.isEmpty else { return nil }
            let probs = oddsVals.map { o in o > 0 ? 100 / (o + 100) : -o / (-o + 100) }
            let p = probs.reduce(0, +) / Double(probs.count)
            guard p > 0, p < 1 else { return nil }
            let american = p >= 0.5 ? -(p / (1 - p)) * 100 : ((1 - p) / p) * 100
            return Int(american.rounded())
        }()
        let bestDay = Dictionary(grouping: settled, by: \.game_date).values
            .map { $0.reduce(0.0) { $0 + ($1.units_net ?? 0) } }.max()

        return HStack(spacing: 0) {
            statTile("WIN%", winPct.map { String(format: "%.0f%%", $0) } ?? "--")
            statDivider
            statTile("ROI", roi.map { String(format: "%+.0f%%", $0) } ?? "--",
                     tint: (roi ?? 0) >= 0 ? GaryColors.win : GaryColors.loss)
            statDivider
            statTile("AVG ODDS", avgOdds.map { "\($0 > 0 ? "+" : "")\($0)" } ?? "--")
            statDivider
            statTile("BEST DAY", bestDay.map { BookMoney.netTotal($0) } ?? "--",
                     tint: GaryColors.gold)
        }
    }

    private func statTile(_ label: String, _ value: String, tint: Color = .white.opacity(0.88)) -> some View {
        VStack(spacing: 3) {
            Text(value)
                .font(GaryFonts.mono(13, bold: true))
                .foregroundStyle(tint)
                .lineLimit(1).minimumScaleFactor(0.7)
            Text(label)
                .font(GaryFonts.mono(8, bold: true)).tracking(0.7)
                .foregroundStyle(.white.opacity(0.4))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 9)

    }

    private var statDivider: some View {
        Rectangle().fill(Color.white.opacity(0.08)).frame(width: 0.5, height: 24)
    }

    private struct ProfitPoint: Identifiable {
        let date: Date
        let net: Double
        var id: Date { date }
    }

    private var profitPoints: [ProfitPoint] {
        let grouped = Dictionary(grouping: summarySettled, by: \.game_date)
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "America/New_York")
        formatter.dateFormat = "yyyy-MM-dd"
        var running = 0.0
        return grouped.keys.sorted().compactMap { day in
            guard let date = formatter.date(from: day) else { return nil }
            running += (grouped[day] ?? []).reduce(0.0) { $0 + ($1.units_net ?? 0) }
            return ProfitPoint(date: date, net: running)
        }
    }

    private var profitChart: some View {
        let points = profitPoints
        let final = points.last?.net ?? 0
        let tint = final >= 0 ? GaryColors.win : GaryColors.loss
        // Daily history should never repeat the same date at intraday ticks.
        let axisDates = points.count <= 4 ? points.map(\.date)
            : (0..<4).map { points[$0 * (points.count - 1) / 3].date }
        return VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text("EQUITY CURVE")
                        .foregroundStyle(.white.opacity(0.7))
                    Text(kindFilter == "manual" ? "SELF-GRADED" : "VERIFIED")
                        .foregroundStyle(.white.opacity(0.58))
                    Spacer()
                }
                .font(GaryFonts.mono(9.5, bold: true)).tracking(1)
                Text(BookMoney.netTotal(final))
                    .font(GaryFonts.mono(22, bold: true)).foregroundStyle(tint)
                    .contentTransition(.numericText())
            }
            .padding(.horizontal, 14).padding(.top, 12)

            Group {
                if points.isEmpty {
                    Text("No settled entries in this view")
                        .font(GaryFonts.mono(10)).foregroundStyle(.white.opacity(0.4))
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    Chart(points) { point in
                        AreaMark(x: .value("Date", point.date), yStart: .value("Zero", 0),
                                 yEnd: .value("Units", max(0, point.net)), series: .value("Fill", "pos"))
                            .foregroundStyle(GaryColors.win.opacity(0.13))
                            .interpolationMethod(.catmullRom)
                        AreaMark(x: .value("Date", point.date), yStart: .value("Zero", 0),
                                 yEnd: .value("Units", min(0, point.net)), series: .value("Fill", "neg"))
                            .foregroundStyle(GaryColors.loss.opacity(0.13))
                            .interpolationMethod(.catmullRom)
                        LineMark(x: .value("Date", point.date), y: .value("Units", point.net))
                            .foregroundStyle(tint).lineStyle(StrokeStyle(lineWidth: 1.6))
                            .interpolationMethod(.catmullRom)
                        if point.id == points.last?.id {
                            PointMark(x: .value("Date", point.date), y: .value("Units", point.net))
                                .foregroundStyle(tint).symbolSize(16)
                        }
                    }
                    .chartYScale(domain: min(-0.01, points.map(\.net).min() ?? 0)...max(0.01, points.map(\.net).max() ?? 0))
                    .chartXAxis {
                        AxisMarks(values: axisDates) { _ in
                            AxisValueLabel(format: .dateTime.month(.abbreviated).day())
                                .foregroundStyle(.white.opacity(0.45))
                        }
                    }
                    .chartYAxis {
                        AxisMarks(position: .leading, values: .automatic(desiredCount: 3)) { value in
                            AxisGridLine(stroke: StrokeStyle(lineWidth: 0.3)).foregroundStyle(.white.opacity(0.12))
                            AxisValueLabel {
                                if let units = value.as(Double.self) {
                                    Text(BookMoney.netTotal(units)).font(.system(size: 9))
                                        .foregroundStyle(.white.opacity(0.45))
                                }
                            }
                        }
                    }
                }
            }
            .frame(height: 185).padding(.horizontal, 10).padding(.top, 6).padding(.bottom, 8)
            Text(BookMoney.isSet ? "Your logged stakes · \(summarySource.lowercased())" : "Illustrative $100/unit · set your unit size in Settings")
                .font(GaryFonts.mono(9.5)).foregroundStyle(.white.opacity(0.55))
                .frame(maxWidth: .infinity).multilineTextAlignment(.center)
                .padding(.top, 2)
        }
    }

    // ── Tracker: open slips with live context ───────────────────────────────

    /// slip -> tonight's live score, bridged through today's pick identity
    /// (slip.pick_text == pick.pick, pick.game_id == live_scores.game_id).
    private func liveScore(for bet: UserBet) -> LiveScore? {
        guard bet.game_date == SupabaseAPI.todayEST(), bet.pick_type == "game" else { return nil }
        guard let gid = todayPicks.first(where: { ($0.pick ?? "") == bet.pick_text })?.game_id else { return nil }
        return liveScores.first { $0.game_id == String(gid) }
    }

    private func startTime(for bet: UserBet) -> String? {
        guard let lock = bet.lock_at else { return nil }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let d = iso.date(from: lock) ?? ISO8601DateFormatter().date(from: lock)
        guard let date = d else { return nil }
        let f = DateFormatter()
        f.dateFormat = "h:mm a"
        f.timeZone = TimeZone(identifier: "America/New_York")
        return f.string(from: date)
    }

    @ViewBuilder private var pendingBlock: some View {
        if !openSlips.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                BillfoldSectionTitle(title: "OPEN SLIPS")
                    .padding(.bottom, 4)
                openSlipRows
            }
            .padding(.horizontal, 12)
        }
    }

    private var openSlipRows: some View {
        ForEach(openSlips) { bet in
            VStack(alignment: .leading, spacing: 2) {
                UserBetSlipRow(bet: bet) { updated in
                    if let i = bets.firstIndex(where: { $0.id == updated.id }) { bets[i] = updated }
                } onDelete: { bets.removeAll { $0.id == bet.id } }
                if bet.isVerified { pendingTrailing(bet).padding(.bottom, 6) }
            }
            if bet.id != openSlips.last?.id {
                Rectangle().fill(.white.opacity(0.05)).frame(height: 0.5)
            }
        }
    }

    @ViewBuilder private func pendingTrailing(_ bet: UserBet) -> some View {
        if let live = liveScore(for: bet) {
            if live.isLive {
                HStack(spacing: 5) {
                    Circle().fill(GaryColors.loss).frame(width: 5, height: 5)
                    Text("\(live.away_score ?? 0)-\(live.home_score ?? 0)\(live.detail.map { " · \($0)" } ?? "")")
                        .font(GaryFonts.mono(10, bold: true))
                        .foregroundStyle(.white.opacity(0.8))
                }
            } else if live.isFinal {
                Text("FINAL · SETTLING")
                    .font(GaryFonts.mono(8.5, bold: true)).tracking(0.6)
                    .foregroundStyle(.white.opacity(0.45))
            } else if let t = startTime(for: bet) {
                Text(t)
                    .font(GaryFonts.mono(10, bold: true))
                    .foregroundStyle(.white.opacity(0.5))
            }
        } else if let t = startTime(for: bet) {
            Text(t)
                .font(GaryFonts.mono(10, bold: true))
                .foregroundStyle(.white.opacity(0.5))
        } else {
            Text("OPEN")
                .font(GaryFonts.mono(8.5, bold: true)).tracking(0.8)
                .foregroundStyle(.white.opacity(0.35))
        }
    }

    // ── Tracker: the day ledger ─────────────────────────────────────────────

    private var dayGroups: [(date: String, net: Double, rows: [UserBet])] {
        let settled = scopedSettled
        let grouped = Dictionary(grouping: settled, by: { $0.game_date })
        return grouped.keys.sorted(by: >).map { d in
            let rows = (grouped[d] ?? []).sorted { ($0.placed_at ?? "") > ($1.placed_at ?? "") }
            let net = rows.reduce(0.0) { $0 + ($1.units_net ?? 0) }
            return (d, net, rows)
        }
    }

    private func dayLabel(_ dateStr: String) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "America/New_York")
        guard let d = f.date(from: dateStr) else { return dateStr }
        let out = DateFormatter()
        out.dateFormat = "EEE M/d"
        out.timeZone = TimeZone(identifier: "America/New_York")
        return out.string(from: d).uppercased()
    }

    @ViewBuilder private var settledByDay: some View {
        if !dayGroups.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                BillfoldSectionTitle(title: "DAILY LEDGER")
                    .padding(.bottom, 2)
                ForEach(dayGroups.prefix(visibleDays), id: \.date) { group in
                    HStack {
                        Text(dayLabel(group.date))
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(.white.opacity(0.85))
                        Spacer()
                        Text(BookMoney.netTotal(group.net))
                            .font(GaryFonts.mono(10, bold: true))
                            .foregroundStyle(group.net > 0 ? GaryColors.win
                                             : group.net < 0 ? GaryColors.loss : .white.opacity(0.45))
                    }
                    .padding(.top, 12).padding(.bottom, 6)
                    Rectangle().fill(Color.white.opacity(0.08)).frame(height: 0.5)
                    ForEach(group.rows) { bet in
                        UserBetSlipRow(bet: bet) { updated in
                            if let i = bets.firstIndex(where: { $0.id == updated.id }) { bets[i] = updated }
                        } onDelete: {
                            bets.removeAll { $0.id == bet.id }
                        }
                        if bet.id != group.rows.last?.id {
                            Rectangle().fill(.white.opacity(0.04)).frame(height: 0.5)
                        }
                    }
                }
            }
            .padding(.horizontal, 12)
            if dayGroups.count > visibleDays {
                Button("Show more history") { visibleDays += 30 }
                    .font(GaryFonts.text(13, .semibold)).foregroundStyle(GaryColors.gold)
                    .frame(maxWidth: .infinity).padding(12)
            }
        }
    }

    private func matchesBookFilters(_ bet: UserBet) -> Bool {
        let text = ([bet.pick_text, bet.league ?? "", bet.notes ?? "", bet.bookmaker ?? "", BookMarket.label(bet.market)] + (bet.tags ?? []))
            .joined(separator: " ")
        return (kindFilter == "all" || bet.kind == kindFilter)
            && (!favoritesOnly || bet.is_favorite == true)
            && (query.isEmpty || text.localizedCaseInsensitiveContains(query))
    }

    private func refreshBook() async {
        guard let owner = auth.currentUser?.id else { loading = false; return }
        async let fetchedBets = UserBookAPI.fetchMyBets()
        async let fetchedStreak = UserBookAPI.fetchMyStreak()
        async let fetchedProfile = try? ProfileIdentityAPI.mine()
        async let fetchedPicks = try? SupabaseAPI.fetchDailyPicks(date: SupabaseAPI.todayEST())
        async let fetchedScores = SupabaseAPI.fetchLiveScores(date: SupabaseAPI.todayEST())
        let (rows, run, profile, picks, scores) = await (fetchedBets, fetchedStreak, fetchedProfile, fetchedPicks, fetchedScores)
        guard owner == auth.currentUser?.id, !Task.isCancelled else { return }
        loadFailed = rows == nil
        if let profile { ProfileIdentityAPI.cache(profile) }
        if let rows { bets = rows }
        streak = run
        if let picks { todayPicks = picks }
        if let scores { liveScores = scores }
        loading = false
        if rows != nil, !BookMoney.isSet, !unitPromptShownThisSession {
            unitPromptShownThisSession = true; showUnitSheet = true
        }
    }
}
