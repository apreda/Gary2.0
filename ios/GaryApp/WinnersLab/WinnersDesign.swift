import SwiftUI

// WINNERS, the Nov 2026 look (founder GO, Nov 10 2026, "version A, the new look"):
// one family, Mona Sans. The wide cut carries numbers and the title; the regular
// cut carries everything that is read, in sentence case, nothing under 13 pt.
// Each play's card is lit in its team's color; gold is Gary's money.

enum W {
    // MARK: Type
    /// Wide ExtraBold: numbers and the page title.
    static func wide(_ size: CGFloat) -> Font { .custom("MonaSansExpanded-ExtraBold", fixedSize: size) }
    /// Wide Bold: the line under a number ("rebounds", "covering by 4.5").
    static func wideBold(_ size: CGFloat) -> Font { .custom("MonaSansExpanded-Bold", fixedSize: size) }
    /// Regular cut for everything read.
    static func text(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        let name: String
        switch weight {
        case .medium: name = "MonaSans-Medium"
        case .semibold: name = "MonaSans-SemiBold"
        case .bold, .heavy, .black: name = "MonaSans-Bold"
        default: name = "MonaSans-Regular"
        }
        return .custom(name, fixedSize: size)
    }

    // MARK: Color
    static let stage = Color(hex: "#0A0908")
    static let lamp = Color(hex: "#2A2316")
    static let bone = Color(hex: "#F7F2E8")
    static let dim = Color(hex: "#F7F2E8").opacity(0.64)
    static let faint = Color(hex: "#F7F2E8").opacity(0.45)
    static let hair = Color(hex: "#F7F2E8").opacity(0.10)
    static let gold = Color(hex: "#EDBE4F")
    static let goldSoft = Color(hex: "#F6D47A")
    static let win = Color(hex: "#4ADE80")
    static let loss = Color(hex: "#F26D6D")
    static let cardTop = Color(hex: "#1B1916")
    static let cardBottom = Color(hex: "#131210")
    static let ink = Color(hex: "#17130A")
    static var foil: LinearGradient {
        LinearGradient(colors: [Color(hex: "#FBE6A2"), gold, Color(hex: "#C4912A")], startPoint: .top, endPoint: .bottom)
    }
    static var goldButton: LinearGradient {
        LinearGradient(colors: [goldSoft, Color(hex: "#E3AE3C")], startPoint: .top, endPoint: .bottom)
    }

    // MARK: Money
    /// "$1,100", "−$596", "+$250": whole dollars, a real minus sign.
    static func dollars(_ value: Double, signed: Bool = false) -> String {
        let whole = Int(value.magnitude.rounded())
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.usesGroupingSeparator = true
        let digits = f.string(from: NSNumber(value: whole)) ?? String(whole)
        if value < -0.49 { return "\u{2212}$\(digits)" }
        return (signed && value > 0.49 ? "+$" : "$") + digits
    }
    /// American odds with a real minus: "+105", "−112".
    static func price(_ odds: Int?) -> String {
        guard let odds else { return "" }
        return odds > 0 ? "+\(odds)" : "\u{2212}\(abs(odds))"
    }
    /// A hyphen-minus in a spread or price becomes a real minus sign.
    static func minus(_ s: String) -> String { s.replacingOccurrences(of: "-", with: "\u{2212}") }
}

// MARK: - Teams

/// Team identity for a card: a color to light it and a short code for the badge.
enum WTeam {
    /// NBA colors, brightened to sit on black the way `TeamColors` does for MLB and the NFL.
    private static let nba: [String: String] = [
        "Hawks": "#E0484C", "Celtics": "#19A85A", "Nets": "#B9BCC2", "Hornets": "#22B4C2", "Bulls": "#E0304F",
        "Cavaliers": "#C83A63", "Mavericks": "#3D84E6", "Nuggets": "#4A95E0", "Pistons": "#4670E0", "Warriors": "#3F78E6",
        "Rockets": "#E03350", "Pacers": "#F2C230", "Clippers": "#E0414F", "Lakers": "#8E62DB", "Grizzlies": "#7A9BE0",
        "Heat": "#E22B4E", "Bucks": "#23A05C", "Timberwolves": "#4A9BE0", "Pelicans": "#C8A45A", "Knicks": "#F58A30",
        "Thunder": "#2A9BE6", "Magic": "#2F8FE6", "76ers": "#2F7BE0", "Suns": "#F28C28", "Trail Blazers": "#E0393F",
        "Blazers": "#E0393F", "Kings": "#8A5CD6", "Spurs": "#C4CED4", "Raptors": "#E0304F", "Jazz": "#7B55D9", "Wizards": "#E0414F",
    ]
    static func color(_ team: String?, league: String) -> Color? {
        guard let team, !team.isEmpty else { return nil }
        switch league.uppercased() {
        case "NBA":
            return nba.first { team.localizedCaseInsensitiveContains($0.key) }.map { Color(hex: $0.value) }
        case "NFL", "MLB":
            return TeamColors.color(for: team, league: league.uppercased())
        default:
            return nil
        }
    }
    /// "BOS", "PHI": the club's own code when the league names it, never three guessed letters.
    static func code(_ team: String?, league: String) -> String? {
        guard let team, !team.isEmpty else { return nil }
        return HubCardIdentity.abbreviation(nil, name: team, league: league)
    }
    /// "Celtics" from "Boston Celtics"; the full name when the league's table does not know it.
    static func nickname(_ team: String?, league: String) -> String {
        guard let team, !team.isEmpty else { return "" }
        let tables: [[String]] = [Array(nba.keys), Array(TeamColors.nfl.keys), Array(TeamColors.mlb.keys)]
        let keys = league.uppercased() == "NBA" ? tables[0] : league.uppercased() == "NFL" ? tables[1] : league.uppercased() == "MLB" ? tables[2] : []
        // Longest first, so "Trail Blazers" wins over "Blazers" and "Red Sox" over "Sox".
        if let hit = keys.sorted(by: { $0.count > $1.count }).first(where: { team.localizedCaseInsensitiveContains($0) }) { return hit }
        return team
    }
}

// MARK: - Small parts

/// A round team badge with the club's code.
struct WBadge: View {
    let code: String
    let color: Color
    var body: some View {
        Text(code)
            .font(W.text(10, .bold)).tracking(0.3)
            .foregroundStyle(.white)
            .fitsOneLine()
            .frame(width: 30, height: 30)
            .background(
                Circle().fill(LinearGradient(colors: [color, color.opacity(0.62)], startPoint: .topLeading, endPoint: .bottomTrailing))
            )
            .overlay(Circle().strokeBorder(.white.opacity(0.16), lineWidth: 1))
            .shadow(color: .black.opacity(0.4), radius: 3, y: 2)
            .accessibilityHidden(true)
    }
}

/// A small filled label: "Tips in 25 min", "Q1 2:41".
struct WChip: View {
    let text: String
    var icon: String? = nil
    var live: Bool = false
    var tint: Color = W.bone
    var body: some View {
        HStack(spacing: 6) {
            if live { Circle().fill(tint).frame(width: 7, height: 7) }
            if let icon { Image(systemName: icon).font(.system(size: 12, weight: .semibold)) }
            Text(text).font(W.text(14, .semibold)).fitsOneLine()
        }
        .foregroundStyle(tint)
        .padding(.horizontal, 11).frame(height: 30)
        .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(tint.opacity(0.16)))
        .fixedSize()
    }
}

/// Text in the page's gold, top to bottom like foil.
struct WGold: ViewModifier {
    func body(content: Content) -> some View { content.foregroundStyle(W.foil) }
}
extension View {
    func wGold() -> some View { modifier(WGold()) }
    /// A large numeral's line box trimmed toward its cap height, so the lines around it sit close.
    func wTight(_ size: CGFloat) -> some View { padding(.vertical, -size * 0.1) }
    /// The card surface: a dark plate lit from the top in `glow`.
    func wCard(glow: Color, strength: Double = 0.58, radius: CGFloat = 30) -> some View {
        background(WCardSurface(glow: glow, strength: strength, radius: radius))
    }
    /// A quiet raised panel: results list, record tiles.
    func wPanel(radius: CGFloat = 24) -> some View {
        background(
            RoundedRectangle(cornerRadius: radius, style: .continuous)
                .fill(LinearGradient(colors: [W.cardTop, W.cardBottom], startPoint: .top, endPoint: .bottom))
                .shadow(color: .black.opacity(0.5), radius: 16, y: 12)
        )
        .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).strokeBorder(.white.opacity(0.08), lineWidth: 1))
    }
}

struct WCardSurface: View {
    let glow: Color
    var strength: Double = 0.58
    var radius: CGFloat = 30
    var body: some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        ZStack {
            shape.fill(LinearGradient(colors: [W.cardTop, W.cardBottom], startPoint: .top, endPoint: .bottom))
            GeometryReader { geo in
                EllipticalGradient(
                    stops: [.init(color: glow.opacity(strength), location: 0),
                            .init(color: glow.opacity(strength * 0.3), location: 0.42),
                            .init(color: glow.opacity(0), location: 0.7)],
                    center: UnitPoint(x: 0.5, y: -0.06),
                    startRadiusFraction: 0, endRadiusFraction: 1)
                    .frame(width: geo.size.width * 2.4, height: geo.size.height * 1.28)
                    .position(x: geo.size.width / 2, y: geo.size.height * 0.36)
            }
            .clipShape(shape)
            shape.strokeBorder(
                LinearGradient(colors: [.white.opacity(0.22), .white.opacity(0.07)], startPoint: .top, endPoint: .center), lineWidth: 1)
        }
        .shadow(color: .black.opacity(0.6), radius: 22, y: 16)
    }
}

/// The page's stage: near black with a warm lamp over the top.
struct WStage: View {
    var body: some View {
        ZStack(alignment: .top) {
            W.stage
            EllipticalGradient(colors: [W.lamp, W.lamp.opacity(0)], center: UnitPoint(x: 0.5, y: 0), startRadiusFraction: 0, endRadiusFraction: 0.9)
                .frame(height: 420)
        }
        .ignoresSafeArea()
    }
}

/// Three numbers under a hairline-free row: Gary's bet, the price, to win.
struct WTrio: View {
    struct Cell { let label: String; let value: String; var gold: Bool = false; var hidden: Bool = false; var tint: Color? = nil }
    let cells: [Cell]
    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            ForEach(Array(cells.enumerated()), id: \.offset) { i, cell in
                VStack(alignment: .leading, spacing: 6) {
                    Text(cell.label).font(W.text(14)).foregroundStyle(W.dim).fitsOneLine()
                    Group {
                        if cell.gold { Text(cell.value).wGold() } else { Text(cell.value).foregroundStyle(cell.tint ?? W.bone) }
                    }
                    .font(W.wide(24)).tracking(-0.6)
                    .fitsOneLine()
                    .blur(radius: cell.hidden ? 7 : 0)
                    .accessibilityHidden(cell.hidden)
                }
                .padding(.leading, i == 0 ? 0 : 14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .overlay(alignment: .leading) {
                    if i > 0 { Rectangle().fill(W.hair).frame(width: 1) }
                }
            }
        }
    }
}

/// The glass button at the foot of a card.
struct WGlassButton: View {
    let title: String
    var chevron: Bool = true
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Text(title).font(W.text(16, .semibold)).fitsOneLine()
                if chevron { Image(systemName: "chevron.right").font(.system(size: 13, weight: .bold)) }
            }
            .foregroundStyle(W.bone)
            .frame(maxWidth: .infinity).frame(height: 48)
            .background(RoundedRectangle(cornerRadius: 15, style: .continuous).fill(W.bone.opacity(0.09)))
            .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous).strokeBorder(.white.opacity(0.08), lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// The gold button: open a sealed pick, unlock a league.
struct WGoldButton: View {
    let title: String
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Text(title).font(W.text(16, .bold)).foregroundStyle(W.ink)
                .fitsOneLine()
                .frame(maxWidth: .infinity).frame(height: 48)
                .background(RoundedRectangle(cornerRadius: 15, style: .continuous).fill(W.goldButton))
                .shadow(color: W.gold.opacity(0.25), radius: 10, y: 6)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// Segments in a glass track: tonight's plays, a range, a league. Scrolls when they do not fit.
struct WSegments: View {
    struct Item: Identifiable, Equatable {
        let id: String
        let title: String
        var dot: Color? = nil
        var lock: Bool = false
    }
    let items: [Item]
    @Binding var selection: String
    /// Segments share the width until there are more than this many.
    var fits: Int = 3
    var height: CGFloat = 40

    var body: some View {
        let track = RoundedRectangle(cornerRadius: 18, style: .continuous)
        Group {
            if items.count <= fits {
                HStack(spacing: 4) { ForEach(items) { segment($0).frame(maxWidth: .infinity) } }
            } else {
                ScrollViewReader { proxy in
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 4) { ForEach(items) { segment($0).frame(minWidth: 104).id($0.id) } }
                    }
                    .onChange(of: selection) { id in withAnimation(.easeInOut(duration: 0.25)) { proxy.scrollTo(id, anchor: .center) } }
                }
            }
        }
        .padding(4)
        .background(track.fill(W.bone.opacity(0.06)))
        .overlay(track.strokeBorder(.white.opacity(0.04), lineWidth: 1))
    }

    private func segment(_ item: Item) -> some View {
        let on = item.id == selection
        return Button { withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { selection = item.id } } label: {
            HStack(spacing: 6) {
                if let dot = item.dot { Circle().fill(dot).frame(width: 7, height: 7) }
                if item.lock { Image(systemName: "lock.fill").font(.system(size: 11, weight: .semibold)) }
                Text(item.title).font(W.text(15, .semibold)).fitsOneLine()
            }
            .foregroundStyle(on ? W.bone : W.bone.opacity(0.7))
            .padding(.horizontal, 8)
            .frame(maxWidth: .infinity).frame(height: height)
            .background {
                if on {
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(LinearGradient(colors: [W.bone.opacity(0.17), W.bone.opacity(0.09)], startPoint: .top, endPoint: .bottom))
                        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(.white.opacity(0.12), lineWidth: 1))
                        .shadow(color: .black.opacity(0.35), radius: 7, y: 6)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

/// One card at a time, the next one showing at the edge; a sideways drag turns the page.
struct WPager<Item: Identifiable, Card: View>: View where Item.ID == String {
    let items: [Item]
    @Binding var selection: String
    var gutter: CGFloat = 20
    var spacing: CGFloat = 12
    var peek: CGFloat = 24
    /// True when the page under the pager scrolls up and down: the turn then shares the touch with it.
    var inScroll: Bool = false
    @ViewBuilder let card: (Item) -> Card
    @GestureState private var drag: CGFloat = 0
    /// The turn under way when UIKit reads it (`inScroll`).
    @State private var pan: CGFloat = 0

    var body: some View {
        GeometryReader { geo in
            let width = max(geo.size.width - gutter * 2 - (items.count > 1 ? peek - gutter + spacing : 0), 200)
            let index = items.firstIndex { $0.id == selection } ?? 0
            let last = items.count > 1 && index == items.count - 1
            let swipe = DragGesture(minimumDistance: 14)
                .updating($drag) { value, state, _ in
                    if abs(value.translation.width) > abs(value.translation.height) { state = value.translation.width }
                }
                .onEnded { value in
                    guard abs(value.translation.width) > abs(value.translation.height) else { return }
                    turn(by: value.predictedEndTranslation.width, width: width)
                }
            HStack(spacing: spacing) {
                ForEach(items) { item in
                    card(item).frame(width: width, height: geo.size.height)
                }
            }
            .padding(.leading, gutter)
            // The last card sits against the right gutter, so the one before it shows on the left.
            .offset(x: -CGFloat(index) * (width + spacing) + (last ? geo.size.width - gutter * 2 - width : 0) + resisted(drag + pan, index: index))
            .frame(width: geo.size.width, alignment: .leading)
            .contentShape(Rectangle())
            // A turn that starts on a card's button turns the page and leaves the button alone.
            .highPriorityGesture(swipe, including: inScroll ? .subviews : .all)
            // Inside a scrolling page SwiftUI's drag stops the page scrolling under the finger
            // (seen on iOS 26), so UIKit reads the turn there and lets the scroll have the rest.
            .background {
                if inScroll {
                    WTurnPan(onChange: { pan = $0 }, onEnd: { turn(by: $0, width: width) })
                }
            }
            .animation(.spring(response: 0.38, dampingFraction: 0.86), value: selection)
        }
    }

    /// Settles on the next card, the one before, or back where it was.
    private func turn(by travel: CGFloat, width: CGFloat) {
        let index = items.firstIndex { $0.id == selection } ?? 0
        var next = index
        if travel < -width * 0.22 { next += 1 } else if travel > width * 0.22 { next -= 1 }
        next = min(max(next, 0), items.count - 1)
        withAnimation(.spring(response: 0.38, dampingFraction: 0.86)) {
            pan = 0
            if items.indices.contains(next) { selection = items[next].id }
        }
    }

    /// The drag follows the finger, and gives at the two ends.
    private func resisted(_ value: CGFloat, index: Int) -> CGFloat {
        let atStart = index == 0 && value > 0
        let atEnd = index == items.count - 1 && value < 0
        return (atStart || atEnd) ? value / 3 : value
    }
}

/// A sideways pan read by UIKit, for a pager inside a page that scrolls up and down. It sits on the
/// scroll view around the pager, begins only on a sideways move over the pager, and the scroll
/// waits for it to pass.
private struct WTurnPan: UIViewRepresentable {
    var onChange: (CGFloat) -> Void
    /// The travel the turn would reach if left to coast.
    var onEnd: (CGFloat) -> Void

    final class Anchor: UIView {
        var onWindow: () -> Void = {}
        override func didMoveToWindow() { super.didMoveToWindow(); onWindow() }
    }

    func makeUIView(context: Context) -> Anchor {
        let view = Anchor()
        view.backgroundColor = .clear
        view.isUserInteractionEnabled = false
        let coordinator = context.coordinator
        view.onWindow = { [weak view, weak coordinator] in
            guard let view else { return }
            coordinator?.attach(from: view)
        }
        return view
    }
    func updateUIView(_ view: Anchor, context: Context) { context.coordinator.parent = self }
    static func dismantleUIView(_ view: Anchor, coordinator: Coordinator) { coordinator.detach() }
    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        var parent: WTurnPan
        private weak var anchor: UIView?
        private lazy var pan: UIPanGestureRecognizer = {
            let pan = UIPanGestureRecognizer(target: self, action: #selector(moved(_:)))
            pan.delegate = self
            return pan
        }()
        init(_ parent: WTurnPan) { self.parent = parent }

        /// Onto the nearest scroll view above the pager; with none, the top of its window.
        func attach(from anchor: UIView) {
            detach()
            guard anchor.window != nil else { return }
            self.anchor = anchor
            var host = anchor.superview
            while let view = host, !(view is UIScrollView), let above = view.superview { host = above }
            host?.addGestureRecognizer(pan)
        }
        func detach() { pan.view?.removeGestureRecognizer(pan) }

        @objc private func moved(_ g: UIPanGestureRecognizer) {
            let dx = g.translation(in: g.view).x
            switch g.state {
            case .began, .changed: parent.onChange(dx)
            case .ended: parent.onEnd(dx + g.velocity(in: g.view).x * 0.2)
            case .cancelled, .failed: parent.onEnd(0)
            default: break
            }
        }
        func gestureRecognizerShouldBegin(_ g: UIGestureRecognizer) -> Bool {
            guard let pan = g as? UIPanGestureRecognizer, let anchor, anchor.bounds.contains(pan.location(in: anchor)) else { return false }
            let t = pan.translation(in: pan.view), v = pan.velocity(in: pan.view)
            return abs(t.x) + abs(v.x) * 0.02 > abs(t.y) + abs(v.y) * 0.02
        }
        /// The scroll views around the pager wait for the turn to pass.
        func gestureRecognizer(_ g: UIGestureRecognizer, shouldBeRequiredToFailBy other: UIGestureRecognizer) -> Bool {
            other is UIPanGestureRecognizer && other.view is UIScrollView
        }
    }
}

/// Text tabs under the title: Tonight, Results, Record.
struct WTabs: View {
    let items: [String]
    @Binding var selection: String
    var body: some View {
        HStack(spacing: 22) {
            ForEach(items, id: \.self) { item in
                Button { withAnimation(.easeInOut(duration: 0.2)) { selection = item } } label: {
                    Text(item).font(W.text(18, .semibold))
                        .foregroundStyle(item == selection ? W.bone : W.faint)
                        .frame(height: 44).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(item == selection ? .isSelected : [])
            }
            Spacer(minLength: 0)
        }
    }
}
