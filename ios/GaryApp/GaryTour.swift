import SwiftUI
import UIKit

// MARK: - Simulator tour harness (design QA)
//
// Lets the sim be driven from the host WITHOUT macOS Accessibility/Screen
// Recording grants: the host writes a command file into the app's data
// container and posts a Darwin notification; the app reads + dispatches it.
//
//   UDID=ED009270-1822-4142-8558-4931B381685D
//   CONT=$(xcrun simctl get_app_container $UDID ai.betwithgary.app data)
//   echo "winners props" > "$CONT/tmp/gary-tour.txt"
//   xcrun simctl spawn $UDID notifyutil -p com.gary.tour
//
// Commands (one per line: verb [args]):
//   tab 0..4                     switch root tab
//   winners games|props          Winners board mode
//   winners today                back to the live board
//   winners date 2026-07-02      Winners historical board
//   plans | auth | settings      present those sheets
//   flip                         flip every pick card (games + prop slips)
//   reveal                       open the first sealed Members card (in-place FX)
//   reseal                       clear the revealed ledger + re-seal cards
//   recelebrate                  clear the win-celebration ledger (count-up/confetti re-fire)
//   picks 2                      Picks carousel page index
//   picksday today|yesterday     Picks board day
//   homeboard mlb|nfl            Home board league tab
//   hub mlb|nfl|ncaaf|nba|wc     Hub league tab
//   billfold LINE|CANDLES|SPORTS Billfold chart mode
//   scroll 800 / scroll -400     scroll the frontmost scroll view by px
//   hscroll 300                  scroll EVERY horizontal rail on screen by px
//                                (shelf card rails — QA screenshots can't swipe)
//   dismiss                      dismiss the presented sheet
//
// The observer is only registered in DEBUG (`start()` is a no-op in Release),
// so nothing can post these commands in a shipping binary.
enum GaryTour {
    static let command = Notification.Name("GaryTourCommand")
    private static var revealBudget = 0

    static func start() {
        #if DEBUG
        let center = CFNotificationCenterGetDarwinNotifyCenter()
        CFNotificationCenterAddObserver(center, nil, { _, _, _, _, _ in
            DispatchQueue.main.async { GaryTour.fire() }
        }, "com.gary.tour" as CFString, nil, .deliverImmediately)
        #endif
    }

    private static func fire() {
        let path = NSTemporaryDirectory() + "gary-tour.txt"
        guard let raw = try? String(contentsOfFile: path, encoding: .utf8) else { return }
        for line in raw.split(separator: "\n") {
            let parts = line.split(separator: " ", maxSplits: 1).map(String.init)
            guard let verb = parts.first, !verb.isEmpty else { continue }
            handle(verb: verb, arg: parts.count > 1 ? parts[1] : "")
        }
    }

    private static func handle(verb: String, arg: String) {
        switch verb {
        case "scroll":
            scrollFrontmost(by: CGFloat(Double(arg) ?? 0))
        case "hscroll":
            scrollAllHorizontalRails(by: CGFloat(Double(arg) ?? 0))
        case "dismiss":
            topController()?.dismiss(animated: true)
        case "settings":
            NotificationCenter.default.post(name: Notification.Name("ShowSettingsMenu"), object: nil)
        case "reveal":
            revealBudget = max(1, Int(arg) ?? 1)
            post(verb, arg)
        case "reseal":
            RevealedPicks.clearAll()
            post(verb, arg)
        case "recelebrate":
            CelebratedWins.clearAll()
            post(verb, arg)
        default:
            post(verb, arg)
        }
    }

    /// MembersWrap instances race for this on "reveal" — only the first
    /// sealed card claims the budget, so one card opens per command.
    static func claimReveal() -> Bool {
        guard revealBudget > 0 else { return false }
        revealBudget -= 1
        return true
    }

    private static func post(_ verb: String, _ arg: String) {
        NotificationCenter.default.post(name: command, object: nil, userInfo: ["verb": verb, "arg": arg])
    }

    // MARK: UIKit plumbing

    /// Scroll the dominant vertical scroll view on the frontmost surface
    /// (the presented sheet when one is up, else the active tab page).
    private static func scrollFrontmost(by dy: CGFloat) {
        guard let window = frontWindow() else { return }
        let root: UIView = topController()?.view ?? window
        var best: UIScrollView? = nil
        func walk(_ v: UIView) {
            guard !v.isHidden, v.alpha > 0.01 else { return }   // skip opacity-parked tab pages
            if let sv = v as? UIScrollView,
               sv.contentSize.height > sv.bounds.height + 1,
               sv.bounds.height > (best?.bounds.height ?? 0) {
                best = sv
            }
            v.subviews.forEach(walk)
        }
        walk(root)
        guard let sv = best else { return }
        let minY = -sv.adjustedContentInset.top
        let maxY = max(minY, sv.contentSize.height + sv.adjustedContentInset.bottom - sv.bounds.height)
        let target = min(max(sv.contentOffset.y + dy, minY), maxY)
        sv.setContentOffset(CGPoint(x: sv.contentOffset.x, y: target), animated: false)
    }

    /// Every horizontal-scrolling rail on the frontmost surface, shifted by
    /// the same dx — a screenshot tool can't swipe, and a page can carry
    /// several rails (one per league shelf) at once.
    private static func scrollAllHorizontalRails(by dx: CGFloat) {
        guard let window = frontWindow() else { return }
        let root: UIView = topController()?.view ?? window
        func walk(_ v: UIView) {
            guard !v.isHidden, v.alpha > 0.01 else { return }
            if let sv = v as? UIScrollView, sv.contentSize.width > sv.bounds.width + 1 {
                let minX = -sv.adjustedContentInset.left
                let maxX = max(minX, sv.contentSize.width + sv.adjustedContentInset.right - sv.bounds.width)
                let target = min(max(sv.contentOffset.x + dx, minX), maxX)
                sv.setContentOffset(CGPoint(x: target, y: sv.contentOffset.y), animated: false)
            }
            v.subviews.forEach(walk)
        }
        walk(root)
    }

    private static func frontWindow() -> UIWindow? {
        let windows = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
        return windows.first(where: { $0.isKeyWindow }) ?? windows.first(where: { !$0.isHidden })
    }

    private static func topController() -> UIViewController? {
        guard var top = frontWindow()?.rootViewController else { return nil }
        while let presented = top.presentedViewController { top = presented }
        return top
    }
}

extension View {
    /// Tour command receiver. Handlers only ever fire in DEBUG — `GaryTour.start()`
    /// is the sole poster and it's compiled out of Release.
    func onGaryTour(_ handler: @escaping (_ verb: String, _ arg: String) -> Void) -> some View {
        onReceive(NotificationCenter.default.publisher(for: GaryTour.command)) { note in
            guard let verb = note.userInfo?["verb"] as? String else { return }
            handler(verb, note.userInfo?["arg"] as? String ?? "")
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// DEPTH STUDIES (design branch only, Aug 17 2026) — five environmental-depth
// backgrounds under a fully loaded replica Home. Swipe horizontally between
// studies; the Subtle/Demo control switches shipping intensity vs. 2.6x so
// the mechanism is visible in review. Scroll the content: the background
// drifts at a tenth of content speed — motion parallax is the cue no static
// mock can show. This screen never ships; the winning background does.
// ═══════════════════════════════════════════════════════════════════════════

private struct DepthLCG {
    private var state: UInt64
    init(seed: UInt64) { state = seed }
    mutating func next() -> Double {
        state = state &* 6364136223846793005 &+ 1442695040888963407
        return Double(state >> 33) / Double(UInt64(1) << 31)
    }
}

private struct DepthStudy: Identifiable {
    let id: Int
    let name: String
    let cue: String
}

private let depthStudies: [DepthStudy] = [
    .init(id: 0, name: "THE UPPER DECK", cue: "SCALE LAYERING"),
    .init(id: 1, name: "ROOFTOP AT DUSK", cue: "ATMOSPHERIC HAZE"),
    .init(id: 2, name: "TERMINAL VOID", cue: "VANISHING POINT"),
    .init(id: 3, name: "THE TUNNEL", cue: "FOREGROUND OCCLUSION"),
    .init(id: 4, name: "NIGHT FLIGHT", cue: "AERIAL PERSPECTIVE"),
]

struct DepthStudiesView: View {
    @State private var page = 0
    @State private var demoIntensity = true

    var body: some View {
        ZStack(alignment: .top) {
            TabView(selection: $page) {
                ForEach(depthStudies) { study in
                    DepthStudyPage(study: study, intensity: demoIntensity ? 2.6 : 1.0)
                        .tag(study.id)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .ignoresSafeArea()

            VStack(spacing: 8) {
                HStack(spacing: 10) {
                    Text("\(page + 1)/5")
                        .font(GaryFonts.display(13)).foregroundStyle(GaryColors.gold)
                    Text(depthStudies[page].name)
                        .font(GaryFonts.display(15)).foregroundStyle(Color(hex: "#F6F1E7"))
                    Text(depthStudies[page].cue)
                        .font(.system(size: 9, weight: .semibold))
                        .tracking(1.1)
                        .foregroundStyle(GaryColors.gold.opacity(0.75))
                    Spacer()
                    Button(demoIntensity ? "DEMO" : "SUBTLE") { demoIntensity.toggle() }
                        .font(GaryFonts.display(11))
                        .foregroundStyle(.black)
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .background(GaryColors.gold, in: Capsule())
                }
                .padding(.horizontal, 16)
                HStack(spacing: 5) {
                    ForEach(depthStudies) { s in
                        Circle().fill(s.id == page ? GaryColors.gold : Color.white.opacity(0.22))
                            .frame(width: 5, height: 5)
                    }
                }
            }
            .padding(.top, 6)
        }
        .preferredColorScheme(.dark)
    }
}

private struct DepthScrollOffsetKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}

private struct DepthStudyPage: View {
    let study: DepthStudy
    let intensity: Double
    @State private var scrollY: CGFloat = 0

    var body: some View {
        ZStack {
            DepthBackground(study: study.id, intensity: intensity)
                .offset(y: scrollY * 0.10)
                .ignoresSafeArea()
            // occlusion scrim: the central column stays on quiet ground
            LinearGradient(stops: [
                .init(color: .black.opacity(0.50), location: 0),
                .init(color: .black.opacity(0.16), location: 0.18),
                .init(color: .black.opacity(0.30), location: 0.55),
                .init(color: .black.opacity(0.68), location: 1),
            ], startPoint: .top, endPoint: .bottom)
            .ignoresSafeArea()
            .allowsHitTesting(false)

            ScrollView(showsIndicators: false) {
                GeometryReader { g in
                    Color.clear.preference(key: DepthScrollOffsetKey.self,
                                           value: g.frame(in: .named("depthScroll")).minY)
                }
                .frame(height: 0)
                ReplicaHome()
            }
            .coordinateSpace(name: "depthScroll")
            .onPreferenceChange(DepthScrollOffsetKey.self) { scrollY = $0 }

            VStack { Spacer(); ReplicaTabBar() }
        }
        .background(Color.black)
    }
}

// ── the five backgrounds ────────────────────────────────────────────────────

private struct DepthBackground: View {
    let study: Int
    let intensity: Double

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width, h = geo.size.height
            ZStack {
                switch study {
                case 0: upperDeck(w: w, h: h)
                case 1: rooftop(w: w, h: h)
                case 2: terminalVoid(w: w, h: h)
                case 3: tunnel(w: w, h: h)
                default: nightFlight(w: w, h: h)
                }
            }
        }
    }

    private func alpha(_ base: Double) -> Double { min(base * intensity, 0.85) }

    @ViewBuilder private func upperDeck(w: CGFloat, h: CGFloat) -> some View {
        LinearGradient(colors: [Color(hex: "#060707"), Color(hex: "#0B0D0E"), Color(hex: "#0D0E0C"), Color(hex: "#080706")],
                       startPoint: .top, endPoint: .bottom)
        RadialGradient(colors: [Color(hex: "#D6C48C").opacity(alpha(0.12)), .clear],
                       center: .init(x: 0.5, y: 0.86), startRadius: 8, endRadius: w * 0.9)
        Canvas { ctx, size in
            var rnd = DepthLCG(seed: 77)
            for tier in 0..<5 {
                let y = size.height * (0.07 + Double(tier) * 0.095)
                let count = 9 + tier * 3
                for _ in 0..<count {
                    let d = (5.5 - Double(tier)) * (0.75 + rnd.next() * 0.5)
                    let op = alpha((0.28 - Double(tier) * 0.045) * (0.6 + rnd.next() * 0.5))
                    let rect = CGRect(x: rnd.next() * size.width, y: y + rnd.next() * size.height * 0.05,
                                      width: d, height: d)
                    ctx.fill(Path(ellipseIn: rect), with: .color(Color(hex: "#E8D8AE").opacity(op)))
                }
            }
        }
        .blur(radius: 1.4)
    }

    @ViewBuilder private func rooftop(w: CGFloat, h: CGFloat) -> some View {
        LinearGradient(stops: [
            .init(color: Color(hex: "#050607"), location: 0),
            .init(color: Color(hex: "#0A0B10"), location: 0.34),
            .init(color: Color(hex: "#1A120B"), location: 0.60),
            .init(color: Color(hex: "#0A0806"), location: 0.72),
            .init(color: Color(hex: "#060505"), location: 1),
        ], startPoint: .top, endPoint: .bottom)
        Rectangle()
            .fill(Color(hex: "#B05E26").opacity(alpha(0.15)))
            .frame(height: h * 0.06)
            .blur(radius: 8)
            .position(x: w / 2, y: h * 0.62)
        Canvas { ctx, size in
            var rnd = DepthLCG(seed: 41)
            let base = size.height * 0.655
            var x: Double = -8
            while x < size.width + 10 {
                let bw = 14 + rnd.next() * 24, bh = 26 + rnd.next() * 46
                ctx.fill(Path(CGRect(x: x, y: base - 16 - bh, width: bw, height: bh)),
                         with: .color(Color(hex: "#131318").opacity(alpha(0.5))))
                x += bw + 2 + rnd.next() * 6
            }
            x = -12
            while x < size.width + 14 {
                let bw = 20 + rnd.next() * 30, bh = 44 + rnd.next() * 70
                ctx.fill(Path(CGRect(x: x, y: base - bh, width: bw, height: bh)),
                         with: .color(Color(hex: "#0A0A0D").opacity(min(1, alpha(0.65)))))
                x += bw + 3 + rnd.next() * 8
            }
            for _ in 0..<52 {
                let px = rnd.next() * size.width
                let py = base - 8 - rnd.next() * 70
                ctx.fill(Path(CGRect(x: px, y: py, width: 1.4, height: 1.4)),
                         with: .color(Color(hex: "#D9C79A").opacity(alpha(0.16 + rnd.next() * 0.2))))
            }
        }
    }

    @ViewBuilder private func terminalVoid(w: CGFloat, h: CGFloat) -> some View {
        RadialGradient(colors: [Color(hex: "#0D0C09"), Color(hex: "#080706"), Color(hex: "#050504")],
                       center: .init(x: 0.5, y: 0.12), startRadius: 10, endRadius: h)
        Canvas { ctx, size in
            let vx = size.width / 2, vy = size.height * 0.135
            for i in -7...7 {
                var p = Path()
                p.move(to: CGPoint(x: vx, y: vy))
                p.addLine(to: CGPoint(x: vx + CGFloat(i) * size.width * 0.235, y: size.height + 60))
                ctx.stroke(p, with: .color(GaryColors.gold.opacity(alpha(0.05))), lineWidth: 0.7)
            }
            for j in 1...7 {
                let t = pow(Double(j) / 7.0, 2.1)
                let y = vy + t * (size.height - vy)
                var p = Path()
                p.move(to: CGPoint(x: 0, y: y)); p.addLine(to: CGPoint(x: size.width, y: y))
                ctx.stroke(p, with: .color(GaryColors.gold.opacity(alpha(0.018 + Double(j) * 0.010))), lineWidth: 0.6)
            }
            ctx.stroke(Path(ellipseIn: CGRect(x: vx - 26, y: vy - 26, width: 52, height: 52)),
                       with: .color(GaryColors.gold.opacity(alpha(0.08))), lineWidth: 0.7)
        }
        RadialGradient(colors: [GaryColors.gold.opacity(alpha(0.06)), .clear],
                       center: .init(x: 0.5, y: 0.16), startRadius: 4, endRadius: w * 0.7)
    }

    @ViewBuilder private func tunnel(w: CGFloat, h: CGFloat) -> some View {
        Color(hex: "#040404")
        Ellipse()
            .fill(RadialGradient(colors: [Color(hex: "#BECEA8").opacity(alpha(0.10)),
                                          Color(hex: "#96AA8C").opacity(alpha(0.045)), .clear],
                                 center: .center, startRadius: 6, endRadius: w * 0.5))
            .frame(width: w * 0.74, height: h * 0.38)
            .position(x: w / 2, y: h * 0.235)
            .blur(radius: 7)
        Rectangle()
            .fill(Color(hex: "#E2D6B2").opacity(alpha(0.13)))
            .frame(width: w * 0.6, height: 2)
            .blur(radius: 1)
            .position(x: w / 2, y: h * 0.27)
        RadialGradient(stops: [
            .init(color: .clear, location: 0.36),
            .init(color: .black.opacity(0.55), location: 0.68),
            .init(color: .black.opacity(0.92), location: 1),
        ], center: .init(x: 0.5, y: 0.30), startRadius: 10, endRadius: h * 0.75)
    }

    @ViewBuilder private func nightFlight(w: CGFloat, h: CGFloat) -> some View {
        LinearGradient(colors: [Color(hex: "#050607"), Color(hex: "#07090C"), Color(hex: "#0A0D0A"), Color(hex: "#0B0E0A")],
                       startPoint: .top, endPoint: .bottom)
        Canvas { ctx, size in
            var rnd = DepthLCG(seed: 9)
            ctx.translateBy(x: size.width / 2, y: size.height * 0.95)
            ctx.scaleBy(x: 1, y: 0.42)
            var arc = Path()
            arc.move(to: CGPoint(x: 0, y: -150))
            arc.addLine(to: CGPoint(x: 108, y: -42))
            arc.addArc(center: .zero, radius: 148,
                       startAngle: .degrees(-21), endAngle: .degrees(201), clockwise: false)
            arc.closeSubpath()
            ctx.stroke(arc, with: .color(Color(hex: "#CFE0BC").opacity(alpha(0.13))), lineWidth: 1.1)
            var dia = Path()
            dia.move(to: CGPoint(x: 0, y: -6))
            dia.addLine(to: CGPoint(x: 62, y: -68)); dia.addLine(to: CGPoint(x: 0, y: -130))
            dia.addLine(to: CGPoint(x: -62, y: -68)); dia.closeSubpath()
            ctx.stroke(dia, with: .color(Color(hex: "#E2D6B2").opacity(alpha(0.15))), lineWidth: 1.2)
            ctx.stroke(Path(ellipseIn: CGRect(x: -9, y: -77, width: 18, height: 18)),
                       with: .color(Color(hex: "#E2D6B2").opacity(alpha(0.13))), lineWidth: 1)
            for _ in 0..<30 {
                let px = (rnd.next() - 0.5) * Double(size.width) * 1.1
                let py = -180 - rnd.next() * 120
                ctx.fill(Path(CGRect(x: px, y: py, width: 1.2, height: 1.2)),
                         with: .color(Color(hex: "#B9C4CE").opacity(alpha(0.06 + rnd.next() * 0.12))))
            }
        }
        ForEach(0..<3, id: \.self) { i in
            Rectangle()
                .fill(Color(hex: "#101418").opacity(alpha(0.26 - Double(i) * 0.06)))
                .frame(height: h * 0.14)
                .blur(radius: 6)
                .position(x: w / 2, y: h * (0.56 + Double(i) * 0.13))
        }
    }
}

// ── replica loaded Home (foreground identical across studies) ───────────────

private struct ReplicaCard<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 6) { content }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 14).padding(.vertical, 12)
            .background(Color(hex: "#100E0B").opacity(0.82),
                        in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(GaryColors.gold.opacity(0.14), lineWidth: 1))
    }
}

private struct ReplicaKicker: View {
    let text: String
    var body: some View {
        Text(text).font(GaryFonts.display(11)).tracking(1.2)
            .foregroundStyle(GaryColors.gold)
    }
}

private struct ReplicaSheetRow: View {
    let m: String, t: String, o: String
    var body: some View {
        HStack {
            Text(m).font(.system(size: 13.5, weight: .medium)).foregroundStyle(Color(hex: "#F6F1E7"))
            Spacer()
            Text(t).font(.system(size: 11.5)).foregroundStyle(Color(hex: "#8E8677"))
            Text(o).font(.system(size: 13.5, weight: .semibold).monospacedDigit())
                .foregroundStyle(GaryColors.gold)
                .frame(width: 52, alignment: .trailing)
        }
        .padding(.vertical, 7)
    }
}

private struct ReplicaHome: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text("GARY ").font(GaryFonts.display(24)).foregroundColor(GaryColors.gold)
                + Text("A.I.").font(GaryFonts.display(24)).foregroundColor(Color(hex: "#F6F1E7"))
                Spacer()
                Text("L7 39–47 · 45%")
                    .font(.system(size: 12).monospacedDigit())
                    .foregroundStyle(Color(hex: "#8E8677"))
            }
            .padding(.top, 46)

            ReplicaCard {
                ReplicaKicker(text: "LAST NIGHT")
                Text("Cardinals cash the twin-bill opener")
                    .font(.system(size: 15.5, weight: .semibold)).foregroundStyle(Color(hex: "#F6F1E7"))
                Text("5–3 on the slate · +2.1u · full tape in Billfold")
                    .font(.system(size: 12).monospacedDigit()).foregroundStyle(Color(hex: "#8E8677"))
            }

            ReplicaCard {
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 3) {
                        ReplicaKicker(text: "NEXT FIRST PITCH")
                        Text("1:40 PM").font(GaryFonts.display(27)).foregroundStyle(Color(hex: "#F6F1E7"))
                    }
                    Spacer()
                    Text("STL @ CIN\nO/U 9.5")
                        .font(.system(size: 12).monospacedDigit())
                        .multilineTextAlignment(.trailing)
                        .foregroundStyle(Color(hex: "#8E8677"))
                }
            }

            ReplicaCard {
                ReplicaKicker(text: "THE SHEET")
                VStack(spacing: 0) {
                    ReplicaSheetRow(m: "STL @ CIN", t: "1:40", o: "-109")
                    Divider().overlay(Color(hex: "#F6F1E7").opacity(0.07))
                    ReplicaSheetRow(m: "BAL @ TB", t: "6:05", o: "O 7.5")
                    Divider().overlay(Color(hex: "#F6F1E7").opacity(0.07))
                    ReplicaSheetRow(m: "MIA @ PHI", t: "6:40", o: "-141")
                    Divider().overlay(Color(hex: "#F6F1E7").opacity(0.07))
                    ReplicaSheetRow(m: "ATH @ KC", t: "7:40", o: "+122")
                }
            }

            ReplicaCard {
                ReplicaKicker(text: "TODAY'S PICK")
                Text("Cardinals ML -109")
                    .font(.system(size: 17, weight: .bold).monospacedDigit())
                    .foregroundStyle(Color(hex: "#F6F1E7"))
                Text("St. Louis owns the fresher pen and the twin bill splits the Reds' rotation in half.")
                    .font(.system(size: 12.5)).foregroundStyle(Color(hex: "#8E8677"))
                    .lineSpacing(3)
            }

            ReplicaCard {
                ReplicaKicker(text: "TOMORROW")
                VStack(spacing: 0) {
                    ReplicaSheetRow(m: "STL @ CIN", t: "6:40", o: "TBD")
                    Divider().overlay(Color(hex: "#F6F1E7").opacity(0.07))
                    ReplicaSheetRow(m: "NYY @ BOS", t: "7:10", o: "TBD")
                }
            }
            Color.clear.frame(height: 110)
        }
        .padding(.horizontal, 16)
    }
}

private struct ReplicaTabBar: View {
    private let tabs = ["HOME", "WINNERS", "THE HUB", "PICKS", "BILLFOLD"]
    var body: some View {
        HStack {
            ForEach(tabs, id: \.self) { t in
                Text(t).font(GaryFonts.display(10)).tracking(0.8)
                    .foregroundStyle(t == "HOME" ? GaryColors.gold : Color(hex: "#8E8677"))
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(.top, 14).padding(.bottom, 26)
        .background(LinearGradient(colors: [.black.opacity(0), .black.opacity(0.92)],
                                   startPoint: .top, endPoint: .bottom))
    }
}
