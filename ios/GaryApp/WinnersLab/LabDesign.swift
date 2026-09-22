import SwiftUI

// THE WINNERS LAB — shared surfaces and formatting. The app's colors, the
// Bebas display face for figures, plates of different heights, states as a
// word and a dot, filters as text with the gold underline (design.md).

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

/// The unit stamp: the board's real stake, the row's hierarchy.
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

/// Text filters with the gold underline — the only selector shape in the app.
struct LabTextTabs: View {
    let items: [String]
    @Binding var selected: String
    var size: CGFloat = 15
    var body: some View {
        HStack(spacing: 18) {
            ForEach(items, id: \.self) { item in
                Button { withAnimation(.easeOut(duration: 0.18)) { selected = item } } label: {
                    VStack(spacing: 3) {
                        Text(item.uppercased()).font(GaryFonts.display(size)).tracking(1.2)
                            .foregroundStyle(selected == item ? GaryColors.gold : LabInk.dimmer)
                        Rectangle().fill(selected == item ? GaryColors.gold : .clear).frame(height: 2)
                    }
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
    static func units(_ u: Double?) -> String {
        guard let u, u > 0 else { return "" }
        if abs(u - 1) < 0.001 { return "1u" }
        if abs(u - 0.5) < 0.001 { return "½u" }
        if abs(u - 0.25) < 0.001 { return "¼u" }
        if abs(u - 0.75) < 0.001 { return "¾u" }
        if abs(u - u.rounded()) < 0.001 { return "\(Int(u))u" }
        return String(format: "%.2fu", u)
    }
    static func unitOpacity(_ u: Double?) -> Double {
        guard let u else { return 0.5 }
        if u >= 1 { return 1 }
        if u >= 0.5 { return 0.85 }
        return 0.62
    }
    static func unitsNet(_ u: Double?) -> String {
        guard let u else { return "" }
        let s = String(format: "%.1f", abs(u))
        if abs(u) < 0.05 { return "0.0u" }
        return (u > 0 ? "+" : "-") + s + "u"
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
