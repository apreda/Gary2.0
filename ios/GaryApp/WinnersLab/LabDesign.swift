import SwiftUI

// THE WINNERS LAB — shared surfaces and formatting. The app's colors, the
// Bebas display face for figures, plates of different heights, states as a
// word and a dot, filters as text that turns gold when selected (design.md).

enum LabInk {
    static let plate = Color(hex: "#141210")
    static let plateDeep = Color(hex: "#100E0C")
    static let raised = Color(hex: "#1D1915")
    static let hair = GaryColors.warmWhite.opacity(0.09)
    static let dim = GaryColors.warmWhite.opacity(0.52)
    static let dimmer = GaryColors.warmWhite.opacity(0.32)
    static let reading = GaryColors.warmWhite.opacity(0.88)
}

struct LabPlateSurface: ViewModifier {
    var radius: CGFloat = 12
    var fill: Color = LabInk.plate
    var edge: Color = LabInk.hair
    func body(content: Content) -> some View {
        content
            .background(RoundedRectangle(cornerRadius: radius, style: .continuous).fill(fill))
            .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).stroke(edge, lineWidth: 1))
    }
}

extension View {
    func labPlate(radius: CGFloat = 12, fill: Color = LabInk.plate, edge: Color = LabInk.hair) -> some View {
        modifier(LabPlateSurface(radius: radius, fill: fill, edge: edge))
    }
}

/// A panel title: Bebas, gold, letterspaced, with an optional quiet note.
struct LabTitle: View {
    let text: String
    var note: String? = nil
    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(text.uppercased())
                .font(GaryFonts.display(17)).tracking(1)
                .foregroundStyle(GaryColors.gold)
            Spacer(minLength: 8)
            if let note, !note.isEmpty {
                Text(note).font(GaryFonts.ui(11, .medium)).foregroundStyle(LabInk.dim)
                    .lineLimit(1).minimumScaleFactor(0.8)
            }
        }
    }
}

/// THE TICKET PLATE — one design, two homes (founder, Sep 22 2026: the app
/// must match the approved mock, `winners-unveil-pack-board.html`, exactly).
/// Two columns: the league, the pick and the price down the left; the matchup,
/// the money and the state stacked down the right and spread apart. Every
/// number below is the mock's: 14/46/30 type on the left, a 12pt matchup, a
/// 30pt stamp rotated 8 degrees, a 15pt state line, an 18pt radius and a gold
/// hairline at 70%. The unveil and the breakdown both draw this and nothing
/// else, so the two can never drift apart again.
enum LabTicketState {
    case won, lost, push, open
    /// Takes a bare result ("won") or a whole state line ("Win, WSH 2 · DET 9").
    init(result: String?) {
        let text = (result ?? "").trimmingCharacters(in: .whitespaces).lowercased()
        if text.hasPrefix("won") || text.hasPrefix("win") { self = .won }
        else if text.hasPrefix("lost") || text.hasPrefix("loss") { self = .lost }
        else if text.hasPrefix("push") || text.hasPrefix("void") { self = .push }
        else { self = .open }
    }
    var color: Color {
        switch self {
        case .won: return GaryColors.win
        case .lost: return GaryColors.loss
        case .push: return GaryColors.silver
        case .open: return GaryColors.gold.opacity(0.85)
        }
    }
}

struct LabTicketPlate<Pick: View, Leading: View>: View {
    let league: String
    let matchup: String
    let price: Int?
    let stakeUnits: Double?
    /// The right column's bottom line: a graded result, else the game's time and note.
    let stateText: String?
    let state: LabTicketState
    /// Parked and breakdown draw the smaller ticket; the landing ticket the larger.
    var compact: Bool = true
    var showStamp: Bool = true
    var stampRotated: Bool = true
    @ViewBuilder let pick: () -> Pick
    @ViewBuilder let leading: () -> Leading

    var body: some View {
        // Three rows, not two loose columns: the matchup sits with the league,
        // the money with the pick and the state with the price. A stretched
        // right column pushed them to the corners and the plate grew tall;
        // the mock's ticket is this compact.
        Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: compact ? 6 : 10) {
            GridRow(alignment: .firstTextBaseline) {
                HStack(spacing: 6) {
                    leading()
                    Text(league).font(GaryFonts.display(14)).tracking(1.4).foregroundStyle(GaryColors.gold)
                }
                Text(matchup).font(GaryFonts.ui(12, .medium)).foregroundStyle(LabInk.dim)
                    .lineLimit(1).minimumScaleFactor(0.7)
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
            GridRow(alignment: .center) {
                // Before the stamp lands the pick has the whole width, so the
                // spelled-out flaps never squeeze the matchup above them.
                pick().gridCellColumns(showStamp ? 1 : 2)
                if showStamp {
                    LabUnitStamp(units: stakeUnits, size: 30)
                        .rotationEffect(.degrees(stampRotated ? -8 : 0))
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }
            }
            GridRow(alignment: .firstTextBaseline) {
                Text(LabFormat.price(price)).font(GaryFonts.display(30)).foregroundStyle(GaryColors.silver)
                if let stateText, !stateText.isEmpty {
                    Text(stateText.uppercased())
                        .font(GaryFonts.display(15)).tracking(1)
                        .foregroundStyle(state.color)
                        .multilineTextAlignment(.trailing).lineLimit(2).minimumScaleFactor(0.7)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                } else {
                    Color.clear.frame(width: 1, height: 1)
                }
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        .padding(.horizontal, 18)
        .padding(.top, compact ? 14 : 16)
        .padding(.bottom, compact ? 15 : 18)
        .labPlate(radius: 18, fill: LabInk.plate, edge: GaryColors.gold.opacity(0.7))
    }
}

extension LabTicketPlate where Leading == EmptyView {
    init(league: String, matchup: String, price: Int?, stakeUnits: Double?, stateText: String?,
         state: LabTicketState, compact: Bool = true, showStamp: Bool = true, stampRotated: Bool = true,
         @ViewBuilder pick: @escaping () -> Pick) {
        self.init(league: league, matchup: matchup, price: price, stakeUnits: stakeUnits,
                  stateText: stateText, state: state, compact: compact, showStamp: showStamp,
                  stampRotated: stampRotated, pick: pick, leading: { EmptyView() })
    }
}

/// The stake stamp: the board's real money on the play, the row's hierarchy.
struct LabUnitStamp: View {
    let units: Double?
    var size: CGFloat = 26
    var body: some View {
        Text(LabFormat.units(units))
            .font(GaryFonts.display(size))
            .foregroundStyle(GaryColors.gold.opacity(LabFormat.unitOpacity(units)))
            .monospacedDigit()
    }
}

enum LabDirection {
    case over, under
    var word: String { self == .over ? "OVER" : "UNDER" }
}

/// The ticket stub under the stake (founder, Sep 23 2026: over/under and the
/// odds come off the title). The direction rides on top, a triangle pointing
/// the way the number needs to go, green up for over and red down for under;
/// the price sits under a hairline.
/// Square-cornered like a ticket punch, never a pill (design.md). A play with
/// no direction shows the price alone.
struct LabTicketStub: View {
    let direction: LabDirection?
    let price: Int?
    var size: CGFloat = 12
    var body: some View {
        let priceText = LabFormat.price(price)
        VStack(spacing: 0) {
            if let direction {
                HStack(spacing: size * 0.35) {
                    Image(systemName: direction == .over ? "arrowtriangle.up.fill" : "arrowtriangle.down.fill")
                        .font(.system(size: size * 0.62, weight: .bold))
                        .foregroundStyle(direction == .over ? GaryColors.win : GaryColors.loss)
                    Text(direction.word).font(GaryFonts.display(size)).tracking(size * 0.14)
                        .foregroundStyle(GaryColors.gold)
                }
                .padding(.vertical, size * 0.22)
                .frame(maxWidth: .infinity)
            }
            if direction != nil && !priceText.isEmpty {
                Rectangle().fill(GaryColors.gold.opacity(0.35)).frame(height: 1)
            }
            if !priceText.isEmpty {
                Text(priceText).font(GaryFonts.display(size * 1.25)).foregroundStyle(GaryColors.silver)
                    .monospacedDigit()
                    .padding(.vertical, size * 0.18)
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal, size * 0.5)
        .overlay(RoundedRectangle(cornerRadius: 2, style: .continuous).stroke(GaryColors.gold.opacity(0.55), lineWidth: 1))
        .fixedSize()
    }
}

/// A state as a word and a dot, never a pill.
struct LabStateWord: View {
    let text: String
    let color: Color
    var pulse: Bool = false
    var size: CGFloat = 20
    @State private var on = false
    var body: some View {
        HStack(spacing: 6) {
            if pulse {
                Circle().fill(color).frame(width: 7, height: 7)
                    .shadow(color: color.opacity(on ? 0.7 : 0.15), radius: on ? 5 : 1)
                    .onAppear { withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) { on = true } }
            }
            Text(text.uppercased()).font(GaryFonts.display(size)).tracking(0.6).foregroundStyle(color)
        }
    }
}

struct LabHairline: View {
    var body: some View { Rectangle().fill(LabInk.hair).frame(height: 1) }
}

/// Text filters: the selected one turns gold, no bar under it — the only selector shape in the app.
struct LabTextTabs: View {
    let items: [String]
    @Binding var selected: String
    var size: CGFloat = 15
    var body: some View {
        HStack(spacing: 18) {
            ForEach(items, id: \.self) { item in
                Button { withAnimation(.easeOut(duration: 0.18)) { selected = item } } label: {
                    Text(item.uppercased()).font(GaryFonts.display(size)).tracking(1.2)
                        .foregroundStyle(selected == item ? GaryColors.gold : LabInk.dimmer)
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selected == item ? .isSelected : [])
            }
            Spacer(minLength: 0)
        }
    }
}

/// A large figure with a quiet caption.
struct LabFigure: View {
    let value: String
    let caption: String
    var size: CGFloat = 34
    var tint: Color = GaryColors.warmWhite
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(GaryFonts.display(size)).foregroundStyle(tint).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6)
            Text(caption).font(GaryFonts.ui(11, .medium)).foregroundStyle(LabInk.dim)
        }
    }
}

/// A gold-edged receipt block for the admission reason.
struct LabReceipt<Content: View>: View {
    @ViewBuilder var content: () -> Content
    var body: some View {
        content()
            .padding(.vertical, 10).padding(.horizontal, 12)
            .background(LabInk.plateDeep)
            .overlay(alignment: .leading) { Rectangle().fill(GaryColors.gold).frame(width: 2) }
            .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
    }
}

enum LabFormat {
    static let et = TimeZone(identifier: "America/New_York")!

    static func intValue(_ v: Any?) -> Int? {
        if let i = v as? Int { return i }
        if let n = v as? NSNumber { return n.intValue }
        if let s = v as? String { return Int(s) }
        return nil
    }
    static func doubleValue(_ v: Any?) -> Double? {
        if let d = v as? Double { return d }
        if let n = v as? NSNumber { return n.doubleValue }
        if let s = v as? String { return Double(s) }
        return nil
    }
    static func stringValue(_ v: Any?) -> String? {
        if let s = v as? String { return s }
        if let n = v as? NSNumber { return n.stringValue }
        return nil
    }

    static func price(_ odds: Int?) -> String {
        guard let odds else { return "" }
        return odds > 0 ? "+\(odds)" : "\(odds)"
    }
    /// The trailing American price on a ticket string ("Giants +6.5 -102" → -102).
    static func trailingPrice(_ text: String) -> Int? {
        guard let r = text.range(of: #"[+-]\d{3,4}\s*$"#, options: .regularExpression) else { return nil }
        return Int(text[r].replacingOccurrences(of: "+", with: "").trimmingCharacters(in: .whitespaces))
    }
    /// A ticket without its price ("Giants +6.5").
    static func ticketBody(_ text: String) -> String {
        guard let r = text.range(of: #"\s*[+-]\d{3,4}\s*$"#, options: .regularExpression) else { return text }
        return String(text[..<r.lowerBound])
    }
    /// Over/under leaves the title for the card's direction mark (founder,
    /// Sep 23 2026): "Nick Martinez over 4.5 hits allowed" → (.over, "Nick
    /// Martinez 4.5 hits allowed"). Only a word right before a number counts,
    /// so a name is never cut. A game total left as a bare number gets the
    /// league's scoring word ("Under 8.5" → "8.5 runs").
    static func splitDirection(_ body: String, league: String) -> (direction: LabDirection?, body: String) {
        guard let r = body.range(of: #"(?i)\b(over|under)\s+(?=[0-9])"#, options: .regularExpression) else { return (nil, body) }
        let direction: LabDirection = body[r].lowercased().hasPrefix("over") ? .over : .under
        var rest = body.replacingCharacters(in: r, with: "").trimmingCharacters(in: .whitespaces)
        if rest.range(of: #"^[0-9]+(\.[0-9]+)?$"#, options: .regularExpression) != nil {
            switch league.uppercased() {
            case "MLB": rest += " runs"
            case "NFL", "NCAAF", "NBA", "NCAAB": rest += " points"
            default: rest += " goals"
            }
        }
        return (direction, rest)
    }
    /// Gary's Winners bankroll is real money: $10,000 to start, one unit is $100 of it.
    static let bankrollDollars: Double = 10_000
    static let unitDollars: Double = 100
    static func dollars(_ value: Double) -> String {
        let whole = abs(value).rounded() == abs(value)
        let f = NumberFormatter(); f.numberStyle = .decimal; f.groupingSeparator = ","
        f.minimumFractionDigits = whole ? 0 : 2; f.maximumFractionDigits = whole ? 0 : 2
        return "$" + (f.string(from: NSNumber(value: abs(value))) ?? String(format: "%.0f", abs(value)))
    }
    /// The stake as money ("$50").
    static func units(_ u: Double?) -> String {
        guard let u, u > 0 else { return "" }
        return dollars(u * unitDollars)
    }
    /// Bigger money, brighter gold: $500 and up is full, $250 and up is most of it.
    static func unitOpacity(_ u: Double?) -> Double {
        guard let u else { return 0.5 }
        if u >= 5 { return 1 }
        if u >= 2.5 { return 0.85 }
        return 0.7
    }
    /// A net result as money ("+$478", "-$50").
    static func unitsNet(_ u: Double?) -> String {
        guard let u else { return "" }
        let money = u * unitDollars
        if abs(money) < 0.5 { return "$0" }
        return (money > 0 ? "+" : "-") + dollars(money.rounded())
    }
    static func propTicket(_ p: PropPick) -> String {
        let market = marketWords(p.prop)
        let line = (p.line ?? "").trimmingCharacters(in: .whitespaces)
        let bet = (p.bet ?? "").lowercased()
        var parts: [String] = []
        if let player = p.player { parts.append(player) }
        if !bet.isEmpty { parts.append(bet) }
        if !line.isEmpty { parts.append(line) } else if let n = trailingNumber(p.prop) { parts.append(n) }
        if !market.isEmpty { parts.append(market) }
        return parts.joined(separator: " ")
    }
    static func trailingNumber(_ s: String?) -> String? {
        guard let s, let r = s.range(of: #"[0-9]+(\.[0-9]+)?$"#, options: .regularExpression) else { return nil }
        return String(s[r])
    }
    /// "pitcher_earned_runs 2.5" → "earned runs"; "receiving_yards" → "receiving yards".
    static func marketWords(_ raw: String?) -> String {
        guard var s = raw?.lowercased() else { return "" }
        s = s.replacingOccurrences(of: #"\s*[0-9]+(\.[0-9]+)?$"#, with: "", options: .regularExpression)
        s = s.replacingOccurrences(of: "pitcher_", with: "").replacingOccurrences(of: "batter_", with: "")
        s = s.replacingOccurrences(of: "_", with: " ")
        if s == "hits runs rbis" { return "hits + runs + RBI" }
        if s == "rbi" || s == "rbis" { return "RBI" }
        return s
    }
    static func pickNames(_ pick: String, team: String) -> Bool {
        let p = pick.lowercased(), t = team.lowercased()
        if p.hasPrefix(t) { return true }
        if let last = t.split(separator: " ").last, p.hasPrefix(String(last)) { return true }
        return false
    }
    static func firstSentence(_ text: String?) -> String? {
        guard let text = text?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return nil }
        if let r = text.range(of: #"[.!?](\s|$)"#, options: .regularExpression) {
            return String(text[..<r.lowerBound]) + "."
        }
        return text
    }
    /// "Gary's Take" heading lines and stray markdown marks are the card's, not the reader's.
    static func stripTakeHeading(_ text: String?) -> String {
        guard var t = text else { return "" }
        t = t.replacingOccurrences(of: #"^\s*Gary'?s Take\s*\n+"#, with: "", options: .regularExpression)
        return prose(t)
    }
    /// Stored prose for a reader: no lines that are only marks, no leading heading marks.
    static func prose(_ text: String?) -> String {
        guard let text else { return "" }
        let lines = text.split(separator: "\n", omittingEmptySubsequences: false).map { line -> String in
            var s = String(line)
            if s.range(of: #"^\s*[#*_\-=]+\s*$"#, options: .regularExpression) != nil { return "" }
            s = s.replacingOccurrences(of: #"^\s*#{1,6}\s*"#, with: "", options: .regularExpression)
            return s
        }
        return lines.joined(separator: "\n")
            .replacingOccurrences(of: #"\n{3,}"#, with: "\n\n", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f
    }()
    static let isoPlain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime]; return f
    }()
    static func parseISO(_ s: String?) -> Date? {
        guard let s else { return nil }
        return iso.date(from: s) ?? isoPlain.date(from: s) ?? postgres.date(from: s)
    }
    private static let postgres: DateFormatter = {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSSSSSxxx"; return f
    }()
    static func timeET(_ iso: String?) -> String {
        guard let d = parseISO(iso) else { return "" }
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.timeZone = et; f.dateFormat = "h:mm a"
        return f.string(from: d)
    }
    static func dateWords(_ ymd: String) -> String {
        let p = DateFormatter(); p.locale = Locale(identifier: "en_US_POSIX"); p.timeZone = et; p.dateFormat = "yyyy-MM-dd"
        guard let d = p.date(from: ymd) else { return ymd }
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US"); f.timeZone = et; f.dateFormat = "EEEE, MMMM d"
        return f.string(from: d)
    }
    static func shortDateWords(_ ymd: String) -> String {
        let p = DateFormatter(); p.locale = Locale(identifier: "en_US_POSIX"); p.timeZone = et; p.dateFormat = "yyyy-MM-dd"
        guard let d = p.date(from: ymd) else { return ymd }
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US"); f.timeZone = et; f.dateFormat = "EEE MMM d"
        return f.string(from: d)
    }
    static func timeAgoWords(_ iso: String?, now: Date = Date()) -> String {
        guard let d = parseISO(iso) else { return "" }
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.timeZone = et; f.dateFormat = "h:mm a"
        let cal = Calendar(identifier: .gregorian)
        var c = cal; c.timeZone = et
        if c.isDate(d, inSameDayAs: now) { return "today at \(f.string(from: d))" }
        let day = DateFormatter(); day.locale = Locale(identifier: "en_US"); day.timeZone = et; day.dateFormat = "EEEE"
        return "\(day.string(from: d)) at \(f.string(from: d))"
    }
    /// "in 35 min", "in 2 h 23 min", nil once the time has passed.
    static func countdown(to iso: String?, now: Date = Date()) -> String? {
        guard let d = parseISO(iso) else { return nil }
        let secs = Int(d.timeIntervalSince(now))
        guard secs > 0 else { return nil }
        let h = secs / 3600, m = (secs % 3600) / 60
        if h >= 24 { return "in \(h / 24) d \(h % 24) h" }
        if h > 0 { return "in \(h) h \(m) min" }
        if m > 0 { return "in \(m) min" }
        return "in under a minute"
    }
    static func yesterday(of ymd: String) -> String {
        let p = DateFormatter(); p.locale = Locale(identifier: "en_US_POSIX"); p.timeZone = et; p.dateFormat = "yyyy-MM-dd"
        guard let d = p.date(from: ymd) else { return ymd }
        var cal = Calendar(identifier: .gregorian); cal.timeZone = et
        return p.string(from: cal.date(byAdding: .day, value: -1, to: d) ?? d)
    }
    static func payout(_ odds: Int?) -> Double {
        guard let odds, odds != 0 else { return 1 }
        return odds > 0 ? Double(odds) / 100 : 100 / Double(abs(odds))
    }
}
