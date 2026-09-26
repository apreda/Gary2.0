import SwiftUI

// ─────────────────────────────────────────────────────────────────────────────
// YOUR BOOK ANALYTICS — the views (Sep 9 2026): period pager, summary strip,
// the calendar, a day sheet, breakdowns, bankroll windows, tag chips and the
// bet-type picker. Math lives in BookAnalytics.swift; these only draw it in
// the Billfold's grammar (section titles, hairlines, mono numerals).
// ─────────────────────────────────────────────────────────────────────────────

extension UserBet {
    /// The analytics slice of a bet.
    var analyticsEntry: BookEntry {
        BookEntry(id: id, date: game_date, kind: kind, status: status, stake: stake_units, net: units_net,
                  odds: odds_american, league: league, market: market, bookmaker: bookmaker,
                  tags: tags ?? [], confidence: gary_confidence)
    }
}

private let bookHairline = Color.white.opacity(0.08)

// MARK: - Period pager (WEEK · MONTH · YEAR · ALL)

struct BookPeriodPager: View {
    @Binding var period: BookPeriod
    let today: String

    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 18) {
                ForEach(BookPeriodKind.allCases, id: \.rawValue) { kind in
                    BillfoldFilterTab(title: kind.title, isSelected: period.kind == kind) {
                        guard period.kind != kind else { return }
                        let anchor = period.kind == .all ? today : min(period.end, today)
                        period = BookPeriod.containing(anchor, kind: kind)
                    }
                }
                Spacer()
            }
            HStack(spacing: 6) {
                pagerButton("chevron.left", enabled: period.kind != .all) { period = period.shifted(by: -1) }
                Text(period.kicker)
                    .font(GaryFonts.mono(10.5, bold: true)).tracking(0.9)
                    .foregroundStyle(.white.opacity(0.75))
                    .lineLimit(1).minimumScaleFactor(0.7)
                    .frame(maxWidth: .infinity)
                    .contentTransition(.numericText())
                pagerButton("chevron.right", enabled: period.canMoveForward(today: today)) { period = period.shifted(by: 1) }
            }
        }
    }

    private func pagerButton(_ symbol: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(enabled ? GaryColors.gold : .white.opacity(0.18))
                .frame(width: 36, height: 30)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .accessibilityLabel(symbol.contains("left") ? "Previous period" : "Next period")
    }
}

// MARK: - The calendar

/// How a calendar reads its days. The YOU tab's book shows the user's money
/// on green and red; Gary's calendars (founder, Sep 26 2026) sit on gold for a
/// winning day and black for a losing one, with the figure itself still green
/// or red. `garyMoney` prints dollars (his Winners bankroll); `garyRecord`
/// prints the day's wins and losses (his pick history).
enum BookCalendarStyle {
    case book, garyMoney, garyRecord
    var isGary: Bool { self != .book }
}

struct BookCalendarView: View {
    let grid: BookMonthGrid
    let today: String
    let canMoveForward: Bool
    let onShift: (Int) -> Void
    let onSelect: (BookDayCell) -> Void
    var style: BookCalendarStyle = .book

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 4), count: 7)

    private static func dollars(_ value: Double) -> String {
        let v = Int(abs(value).rounded())
        return (value < 0 ? "-$" : "+$") + v.formatted(.number.grouping(.automatic))
    }

    /// The month's line in the corner: money, or the record.
    private var monthLine: String {
        switch style {
        case .book: return grid.settledCount > 0 ? "\(grid.activeDays) DAYS · \(BookMoney.netTotal(grid.net))" : "NO SETTLED PLAYS"
        case .garyMoney: return grid.settledCount > 0 ? "\(grid.activeDays) DAYS · \(Self.dollars(grid.net))" : "NO SETTLED BETS"
        case .garyRecord: return grid.settledCount > 0 ? "\(grid.wins)–\(grid.losses)" : "NO SETTLED PICKS"
        }
    }

    private var monthLineTint: Color {
        guard grid.settledCount > 0 else { return .white.opacity(0.4) }
        if style == .garyRecord { return grid.wins > grid.losses ? GaryColors.win : grid.wins < grid.losses ? GaryColors.loss : GaryColors.gold }
        return grid.net >= 0 ? GaryColors.win : GaryColors.loss
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                BillfoldSectionTitle(title: "THE CALENDAR")
                Spacer()
                Text(monthLine)
                    .font(GaryFonts.mono(9, bold: true)).tracking(0.5)
                    .foregroundStyle(monthLineTint)
                    .lineLimit(1).minimumScaleFactor(0.7)
            }
            HStack(spacing: 4) {
                Button { onShift(-1) } label: { chevron("chevron.left", enabled: true) }
                    .buttonStyle(.plain).accessibilityLabel("Previous month")
                Text(grid.kicker)
                    .font(GaryFonts.mono(11, bold: true)).tracking(1)
                    .foregroundStyle(.white.opacity(0.85))
                    .frame(maxWidth: .infinity)
                    .contentTransition(.numericText())
                Button { onShift(1) } label: { chevron("chevron.right", enabled: canMoveForward) }
                    .buttonStyle(.plain).disabled(!canMoveForward).accessibilityLabel("Next month")
            }
            HStack(spacing: 4) {
                ForEach(Array(["S", "M", "T", "W", "T", "F", "S"].enumerated()), id: \.offset) { _, day in
                    Text(day)
                        .font(GaryFonts.mono(8.5, bold: true))
                        .foregroundStyle(.white.opacity(0.4))
                        .frame(maxWidth: .infinity)
                }
            }
            LazyVGrid(columns: columns, spacing: 4) {
                ForEach(grid.weeks.flatMap { $0 }) { cell in
                    Button { onSelect(cell) } label: { dayCell(cell) }
                        .buttonStyle(.plain)
                        .disabled(!cell.hasActivity || style.isGary)
                        .accessibilityLabel(accessibility(cell))
                }
            }
            if style == .book {
                Text("Tap a day to see every slip on it. Cells follow your source filter.")
                    .font(GaryFonts.mono(8.5)).tracking(0.2)
                    .foregroundStyle(.white.opacity(0.4))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    /// Which way the day went: 1 up, -1 down, 0 even, nil nothing settled.
    private func sign(_ cell: BookDayCell) -> Int? {
        if style == .garyRecord {
            guard cell.settledCount > 0 else { return nil }
            return cell.wins > cell.losses ? 1 : cell.wins < cell.losses ? -1 : 0
        }
        guard let net = cell.net else { return nil }
        return net > 0.005 ? 1 : net < -0.005 ? -1 : 0
    }

    private func chevron(_ symbol: String, enabled: Bool) -> some View {
        Image(systemName: symbol)
            .font(.system(size: 11, weight: .bold))
            .foregroundStyle(enabled ? GaryColors.gold : .white.opacity(0.18))
            .frame(width: 36, height: 30)
            .contentShape(Rectangle())
    }

    private func fill(_ cell: BookDayCell) -> Color {
        if let s = sign(cell) {
            if style.isGary {
                // Gold for a winning day, black for a losing one (founder, Sep 26 2026).
                if s > 0 { return GaryColors.gold.opacity(0.55) }
                if s < 0 { return Color.black }
                return GaryColors.gold.opacity(0.16)
            }
            if s > 0 { return GaryColors.win.opacity(0.24) }
            if s < 0 { return GaryColors.loss.opacity(0.24) }
            return GaryColors.gold.opacity(0.16)
        }
        return cell.pendingCount > 0 ? Color.white.opacity(0.07) : Color.white.opacity(0.03)
    }

    private func netTint(_ net: Double) -> Color {
        net > 0.005 ? GaryColors.win : net < -0.005 ? GaryColors.loss : GaryColors.gold
    }

    private func figure(_ cell: BookDayCell) -> (text: String, tint: Color)? {
        switch style {
        case .book:
            guard let net = cell.net else { return nil }
            return (BookMoney.net(net), netTint(net))
        case .garyMoney:
            guard let net = cell.net else { return nil }
            return (Self.dollars(net), netTint(net))
        case .garyRecord:
            guard cell.settledCount > 0 else { return nil }
            let tint: Color = cell.wins > cell.losses ? GaryColors.win : cell.wins < cell.losses ? GaryColors.loss : GaryColors.gold
            return ("\(cell.wins)–\(cell.losses)", tint)
        }
    }

    private func dayCell(_ cell: BookDayCell) -> some View {
        VStack(spacing: 2) {
            HStack {
                Text("\(cell.day)")
                    .font(GaryFonts.mono(8.5, bold: cell.date == today))
                    .foregroundStyle(cell.date == today ? GaryColors.gold : .white.opacity(0.5))
                Spacer(minLength: 0)
                if cell.pendingCount > 0 {
                    Circle().fill(GaryColors.gold).frame(width: 4, height: 4)
                        .accessibilityHidden(true)
                }
            }
            Spacer(minLength: 0)
            if let figure = figure(cell) {
                Text(figure.text)
                    .font(GaryFonts.mono(9.5, bold: true))
                    .foregroundStyle(figure.tint)
                    .lineLimit(1).minimumScaleFactor(0.55)
            } else if cell.pendingCount > 0 {
                Text("\(cell.pendingCount) OPEN")
                    .font(GaryFonts.mono(7.5, bold: true)).tracking(0.3)
                    .foregroundStyle(.white.opacity(0.5))
                    .lineLimit(1).minimumScaleFactor(0.6)
            } else {
                Text(" ").font(GaryFonts.mono(9.5))
            }
        }
        .padding(.horizontal, 5).padding(.vertical, 4)
        .frame(maxWidth: .infinity, minHeight: 46, alignment: .top)
        .background(
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(fill(cell))
                .overlay(
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .stroke(cell.date == today ? GaryColors.gold.opacity(0.7)
                                : (style.isGary && sign(cell) != nil) ? GaryColors.gold.opacity(0.35) : Color.white.opacity(0.06),
                                lineWidth: cell.date == today ? 1 : 0.5)
                )
        )
        .opacity(cell.inMonth ? 1 : 0.35)
        .contentShape(Rectangle())
    }

    private func accessibility(_ cell: BookDayCell) -> String {
        var parts = [BookDates.shortLabel(cell.date)]
        if style == .garyRecord, cell.settledCount > 0 { parts.append("\(cell.wins) wins, \(cell.losses) losses") }
        else if let figure = figure(cell) { parts.append("net \(figure.text), \(cell.settledCount) settled") }
        if cell.pendingCount > 0 { parts.append("\(cell.pendingCount) open") }
        if parts.count == 1 { parts.append("no plays") }
        return parts.joined(separator: ", ")
    }
}

// MARK: - One day's slips

struct BookDaySheet: View {
    let date: String
    let bets: [UserBet]
    var onUpdate: (UserBet) -> Void
    var onDelete: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    private var settled: [UserBet] { bets.filter { !$0.isPending } }
    private var open: [UserBet] { bets.filter { $0.isPending } }
    private var net: Double { settled.reduce(0.0) { $0 + ($1.units_net ?? 0) } }

    private var dayTitle: String {
        guard let d = BookDates.parse(date) else { return date }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = BookDates.zone
        f.dateFormat = "EEEE, MMMM d"
        return f.string(from: d)
    }

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(dayTitle.uppercased())
                            .font(GaryFonts.mono(10, bold: true)).tracking(1)
                            .foregroundStyle(GaryColors.gold)
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Text(settled.isEmpty ? "No result yet" : BookMoney.netTotal(net))
                                .font(GaryFonts.mono(28, bold: true))
                                .foregroundStyle(settled.isEmpty ? .white.opacity(0.5) : net >= 0 ? GaryColors.win : GaryColors.loss)
                            Text(BookSummary.of(bets.map(\.analyticsEntry)).record)
                                .font(GaryFonts.mono(13))
                                .foregroundStyle(.white.opacity(0.6))
                        }
                    }
                    if !open.isEmpty {
                        VStack(alignment: .leading, spacing: 0) {
                            BillfoldSectionTitle(title: "OPEN")
                            ForEach(open) { bet in slipRow(bet) }
                        }
                    }
                    if !settled.isEmpty {
                        VStack(alignment: .leading, spacing: 0) {
                            BillfoldSectionTitle(title: "SETTLED")
                            ForEach(settled) { bet in slipRow(bet) }
                        }
                    }
                    if bets.isEmpty {
                        Text("Nothing on your book for this day.")
                            .font(GaryFonts.text(13)).foregroundStyle(.white.opacity(0.55))
                    }
                }
                .padding(20).padding(.bottom, 30)
            }
            .background(Color(hex: "#0F0D0C"))
            .navigationTitle("Day ledger").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() }.foregroundStyle(GaryColors.gold) } }
        }
        .preferredColorScheme(.dark)
    }

    @ViewBuilder private func slipRow(_ bet: UserBet) -> some View {
        UserBetSlipRow(bet: bet, onUpdate: onUpdate) { onDelete(bet.id) }
        Rectangle().fill(Color.white.opacity(0.05)).frame(height: 0.5)
    }
}

// MARK: - Breakdowns (LEAGUE · TYPE · BOOK · TAGS · VS GARY · GARY'S LEAN)

struct BookBreakdownsCard: View {
    let entries: [BookEntry]
    let scopeLine: String
    @Binding var dimension: BookBreakdownDimension

    private var rows: [BookBreakdownRow] { BookBreakdown.rows(entries, by: dimension) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                BillfoldSectionTitle(title: "BREAKDOWNS")
                Spacer()
                Text(scopeLine)
                    .font(GaryFonts.mono(8, bold: true)).tracking(0.6)
                    .foregroundStyle(.white.opacity(0.4))
                    .lineLimit(1).minimumScaleFactor(0.7)
            }
            .padding(.bottom, 10)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 16) {
                    ForEach(BookBreakdownDimension.allCases, id: \.rawValue) { d in
                        BillfoldFilterTab(title: d.title, isSelected: dimension == d) { dimension = d }
                    }
                }
            }
            .padding(.bottom, 10)
            if rows.isEmpty {
                Text(dimension.emptyLine)
                    .font(GaryFonts.text(12.5)).foregroundStyle(.white.opacity(0.5))
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.vertical, 10)
            } else {
                HStack(spacing: 4) {
                    Text(dimension.columnHeader).frame(maxWidth: .infinity, alignment: .leading)
                    Text("GP").frame(width: 36, alignment: .trailing)
                    Text("WIN%").frame(width: 48, alignment: .trailing)
                    Text("NET").frame(width: 70, alignment: .trailing)
                }
                .font(.system(size: 8, weight: .bold)).tracking(0.5)
                .foregroundStyle(.white.opacity(0.4))
                .padding(.bottom, 5)
                ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                    if index > 0 { Rectangle().fill(bookHairline).frame(height: 0.5) }
                    HStack(spacing: 4) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(row.label)
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(.white.opacity(0.85))
                                .lineLimit(1).minimumScaleFactor(0.7)
                            Text(row.record)
                                .font(GaryFonts.mono(8.5))
                                .foregroundStyle(.white.opacity(0.4))
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        Text("\(row.played)")
                            .font(GaryFonts.mono(12)).foregroundStyle(.white.opacity(0.5))
                            .frame(width: 36, alignment: .trailing)
                        Text(row.winPct.map { String(format: "%.0f%%", $0) } ?? "--")
                            .font(GaryFonts.mono(12))
                            .foregroundStyle((row.winPct ?? 0) >= 50 && row.winPct != nil ? GaryColors.win.opacity(0.9) : .white.opacity(0.5))
                            .frame(width: 48, alignment: .trailing)
                        Text(BookMoney.netTotal(row.net))
                            .font(GaryFonts.mono(12, bold: true))
                            .foregroundStyle(abs(row.net) < 0.005 ? .white.opacity(0.5) : row.net > 0 ? GaryColors.win : GaryColors.loss)
                            .lineLimit(1).minimumScaleFactor(0.7)
                            .frame(width: 70, alignment: .trailing)
                    }
                    .padding(.vertical, 8)
                }
            }
        }
    }
}

// MARK: - Bankroll windows (rolling 30 · 60 · 90)

struct BookBankrollCard: View {
    let windows: [BookRollingWindow]
    let sourceLine: String

    private var scale: Double { max(windows.map { abs($0.summary.profit) }.max() ?? 0, 0.01) }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                BillfoldSectionTitle(title: "BANKROLL HEALTH")
                Spacer()
                Text("ROLLING · ENDS TODAY")
                    .font(GaryFonts.mono(8, bold: true)).tracking(0.6)
                    .foregroundStyle(.white.opacity(0.4))
            }
            HStack(spacing: 10) {
                ForEach(windows) { window in
                    let s = window.summary
                    let tint: Color = s.settledCount == 0 ? .white.opacity(0.4) : s.profit >= 0 ? GaryColors.win : GaryColors.loss
                    VStack(alignment: .leading, spacing: 5) {
                        Text(window.title)
                            .font(GaryFonts.mono(9, bold: true)).tracking(0.8)
                            .foregroundStyle(GaryColors.gold)
                        Text(s.settledCount == 0 ? "--" : BookMoney.netTotal(s.profit))
                            .font(GaryFonts.mono(15, bold: true))
                            .foregroundStyle(tint)
                            .lineLimit(1).minimumScaleFactor(0.6)
                        Text(s.roi.map { String(format: "ROI %+.0f%%", $0) } ?? "ROI --")
                            .font(GaryFonts.mono(9.5))
                            .foregroundStyle(.white.opacity(0.6))
                        Text(s.settledCount == 0 ? "No plays" : "\(s.record) · \(s.settledCount) plays")
                            .font(GaryFonts.mono(8.5))
                            .foregroundStyle(.white.opacity(0.4))
                            .lineLimit(1).minimumScaleFactor(0.7)
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                Capsule().fill(Color.white.opacity(0.08))
                                Capsule().fill(tint)
                                    .frame(width: max(geo.size.width * min(abs(s.profit) / scale, 1), s.settledCount == 0 ? 0 : 2))
                            }
                        }
                        .frame(height: 4)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(10)
                    .background(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(Color.white.opacity(0.04))
                            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(bookHairline, lineWidth: 0.5))
                    )
                }
            }
            Text(sourceLine)
                .font(GaryFonts.mono(8.5)).tracking(0.2)
                .foregroundStyle(.white.opacity(0.4))
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

// MARK: - Tags

/// Wraps chips onto as many lines as they need (iOS 16 Layout).
struct BookFlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width { x = 0; y += rowHeight + spacing; rowHeight = 0 }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: width == .infinity ? x : width, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > bounds.minX, x + size.width > bounds.maxX { x = bounds.minX; y += rowHeight + spacing; rowHeight = 0 }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

struct TagChip: View {
    let tag: String
    var onRemove: (() -> Void)? = nil

    var body: some View {
        HStack(spacing: 4) {
            Text(tag.uppercased())
                .font(GaryFonts.mono(8.5, bold: true)).tracking(0.5)
                .lineLimit(1)
            if let onRemove {
                Button(action: onRemove) {
                    Image(systemName: "xmark")
                        .font(.system(size: 7, weight: .bold))
                        .frame(width: 16, height: 16)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Remove tag \(tag)")
            }
        }
        .foregroundStyle(GaryColors.gold.opacity(0.9))
        .padding(.leading, 2).padding(.trailing, onRemove == nil ? 2 : 0).padding(.vertical, 4)
        .overlay(alignment: .bottom) {
            Rectangle().fill(GaryColors.gold.opacity(0.5)).frame(height: 1)
        }
    }
}

struct TagChipsRow: View {
    let tags: [String]
    var body: some View {
        if !tags.isEmpty {
            BookFlowLayout(spacing: 5) {
                ForEach(tags, id: \.self) { TagChip(tag: $0) }
            }
        }
    }
}

struct TagChipsEditor: View {
    @Binding var tags: [String]
    var suggestions: [String] = []
    @State private var draft = ""

    private var offered: [String] { suggestions.filter { !tags.contains($0) }.prefix(6).map { $0 } }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !tags.isEmpty {
                BookFlowLayout(spacing: 6) {
                    ForEach(tags, id: \.self) { tag in
                        TagChip(tag: tag) { tags.removeAll { $0 == tag } }
                    }
                }
            }
            HStack(spacing: 8) {
                TextField(tags.count >= BookTags.maxPerBet ? "Tag limit reached" : "Add a tag (live, promo, primetime)", text: $draft)
                    .font(GaryFonts.text(13))
                    .foregroundStyle(.white)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .disabled(tags.count >= BookTags.maxPerBet)
                    .onSubmit { commit() }
                    .padding(.horizontal, 11).padding(.vertical, 9)
                    .background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.06)))
                Button { commit() } label: {
                    Text("ADD")
                        .font(GaryFonts.mono(9.5, bold: true)).tracking(0.8)
                        .foregroundStyle(draft.trimmingCharacters(in: .whitespaces).isEmpty ? .white.opacity(0.3) : GaryColors.gold)
                        .frame(minWidth: 40, minHeight: 36)
                }
                .buttonStyle(.plain)
                .disabled(draft.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            if !offered.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(offered, id: \.self) { s in
                            Button { tags = BookTags.adding(s, to: tags) } label: {
                                Text("+ \(s.uppercased())")
                                    .font(GaryFonts.mono(8.5, bold: true)).tracking(0.4)
                                    .foregroundStyle(.white.opacity(0.6))
                                    .padding(.horizontal, 8).padding(.vertical, 5)
                                    .background(Capsule().fill(Color.white.opacity(0.06)))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
    }

    private func commit() {
        for tag in BookTags.parse(draft) { tags = BookTags.adding(tag, to: tags) }
        draft = ""
    }
}

// MARK: - Bet type picker (outside bets)

struct BookMarketPicker: View {
    @Binding var market: String?

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(BookMarket.options, id: \.key) { option in
                    let isOn = market == option.key
                    Button { market = isOn ? nil : option.key } label: {
                        Text(option.label.uppercased())
                            .font(GaryFonts.mono(9, bold: true)).tracking(0.6)
                            .foregroundStyle(isOn ? GaryColors.gold : .white.opacity(0.5))
                            .fixedSize()
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(isOn ? .isSelected : [])
                }
            }
        }
    }
}
