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
    .init(id: 5, name: "GAME NIGHT", cue: "VOLUMETRIC LIGHT · LIVE"),
    .init(id: 6, name: "THE MARKET", cue: "DATA TERRAIN · LIVE"),
    .init(id: 7, name: "THE VAULT", cue: "MONUMENTAL SCALE"),
    .init(id: 8, name: "FIELD LEVEL", cue: "FULL SCENE · NO RULES · LIVE"),
    .init(id: 9, name: "GOLDEN HOUR", cue: "COLOSSAL SKYBOX · NO RULES · LIVE"),
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
                    Text("\(page + 1)/\(depthStudies.count)")
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
        .task { GaryTour.start() }
        .onGaryTour { verb, arg in
            // host-driven page flips for QA screenshots: `depth 6` jumps there
            if verb == "depth", let i = Int(arg), depthStudies.indices.contains(i) {
                page = i
            }
        }
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

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            Group {
                if [5, 6, 8, 9].contains(study.id) && !reduceMotion {
                    // the LIVE studies: slow ambient animation at a throttled
                    // frame rate — atmosphere breathing, the market drawing
                    TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { tl in
                        DepthBackground(study: study.id, intensity: intensity,
                                        time: tl.date.timeIntervalSinceReferenceDate)
                    }
                } else {
                    DepthBackground(study: study.id, intensity: intensity, time: 1234)
                }
            }
            .offset(y: scrollY * 0.10)
            .ignoresSafeArea()
            // occlusion scrim: the central column stays on quiet ground.
            // The NO RULES studies (8-9) run nearly bare — the cards fend
            // for themselves against the full scene. That is the experiment.
            LinearGradient(stops: study.id >= 8 ? [
                .init(color: .black.opacity(0.22), location: 0),
                .init(color: .black.opacity(0.04), location: 0.20),
                .init(color: .black.opacity(0.10), location: 0.60),
                .init(color: .black.opacity(0.40), location: 1),
            ] : [
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
    var time: Double = 0

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width, h = geo.size.height
            ZStack {
                switch study {
                case 0: upperDeck(w: w, h: h)
                case 1: rooftop(w: w, h: h)
                case 2: terminalVoid(w: w, h: h)
                case 3: tunnel(w: w, h: h)
                case 4: nightFlight(w: w, h: h)
                case 5: gameNight(w: w, h: h)
                case 6: market(w: w, h: h)
                case 7: vault(w: w, h: h)
                case 8: fieldLevel(w: w, h: h)
                case 9: goldenHour(w: w, h: h)
                default: Color.black
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

    // STUDY 6 — GAME NIGHT. The light towers are OFF-frame: four volumetric
    // beams rake in from above, dust drifts up through them, and the haze
    // breathes on a slow cycle. An unseen source reads as a bigger world
    // than any drawn one.
    @ViewBuilder private func gameNight(w: CGFloat, h: CGFloat) -> some View {
        LinearGradient(colors: [Color(hex: "#050707"), Color(hex: "#081009"), Color(hex: "#060807")],
                       startPoint: .top, endPoint: .bottom)
        Canvas { ctx, size in
            let W = size.width, H = size.height
            struct Beam { let o: CGPoint; let e: CGPoint; let w0: CGFloat; let w1: CGFloat; let phase: Double }
            let beams: [Beam] = [
                Beam(o: CGPoint(x: -0.10 * W, y: -0.08 * H), e: CGPoint(x: 0.62 * W, y: 1.04 * H), w0: 0.020 * W, w1: 0.30 * W, phase: 0.0),
                Beam(o: CGPoint(x: 0.06 * W, y: -0.10 * H), e: CGPoint(x: 0.30 * W, y: 1.04 * H), w0: 0.016 * W, w1: 0.22 * W, phase: 1.9),
                Beam(o: CGPoint(x: 1.10 * W, y: -0.06 * H), e: CGPoint(x: 0.40 * W, y: 1.04 * H), w0: 0.020 * W, w1: 0.30 * W, phase: 3.7),
                Beam(o: CGPoint(x: 0.95 * W, y: -0.10 * H), e: CGPoint(x: 0.73 * W, y: 1.04 * H), w0: 0.016 * W, w1: 0.22 * W, phase: 5.2),
            ]
            for b in beams {
                let breath = 0.80 + 0.20 * sin(time / 5.0 + b.phase)
                let dx = b.e.x - b.o.x, dy = b.e.y - b.o.y
                let len = max(sqrt(dx * dx + dy * dy), 1)
                let px = -dy / len, py = dx / len
                var quad = Path()
                quad.move(to: CGPoint(x: b.o.x + px * b.w0 / 2, y: b.o.y + py * b.w0 / 2))
                quad.addLine(to: CGPoint(x: b.o.x - px * b.w0 / 2, y: b.o.y - py * b.w0 / 2))
                quad.addLine(to: CGPoint(x: b.e.x - px * b.w1 / 2, y: b.e.y - py * b.w1 / 2))
                quad.addLine(to: CGPoint(x: b.e.x + px * b.w1 / 2, y: b.e.y + py * b.w1 / 2))
                quad.closeSubpath()
                ctx.fill(quad, with: .linearGradient(
                    Gradient(colors: [Color(hex: "#F2E4BC").opacity(alpha(0.062) * breath),
                                      Color(hex: "#F2E4BC").opacity(0)]),
                    startPoint: b.o, endPoint: b.e))
                // where the light lands: a faint pool at the beam's foot
                let pool = CGRect(x: b.e.x - b.w1 * 0.7, y: H * 0.97, width: b.w1 * 1.4, height: H * 0.05)
                ctx.fill(Path(ellipseIn: pool), with: .color(Color(hex: "#E8DCB0").opacity(alpha(0.030) * breath)))
            }
            // dust rising through the beams — position parameterized along
            // each beam (s) and across it (u), so motes never leave the light
            var rnd = DepthLCG(seed: 606)
            for _ in 0..<44 {
                let bi = Int(rnd.next() * 4) % 4
                let b = beams[bi]
                let s0 = rnd.next(), u = rnd.next() * 2 - 1
                let speed = 0.008 + rnd.next() * 0.012
                let dot = 1.0 + rnd.next() * 1.5
                let s = (s0 + time * speed).truncatingRemainder(dividingBy: 1)
                let dx = b.e.x - b.o.x, dy = b.e.y - b.o.y
                let len = max(sqrt(dx * dx + dy * dy), 1)
                let px = -dy / len, py = dx / len
                let widthAtS = b.w0 + (b.w1 - b.w0) * s
                let cx = b.o.x + dx * s + px * widthAtS * 0.5 * u
                let cy = b.o.y + dy * s + py * widthAtS * 0.5 * u
                let breath = 0.80 + 0.20 * sin(time / 5.0 + b.phase)
                let op = alpha(0.30) * sin(.pi * s) * (1 - 0.55 * abs(u)) * breath
                ctx.fill(Path(ellipseIn: CGRect(x: cx, y: cy, width: dot, height: dot)),
                         with: .color(Color(hex: "#F6ECC8").opacity(op)))
            }
        }
    }

    // STUDY 7 — THE MARKET. Gary's actual landscape: three ridgelines that
    // are line charts, stacked in aerial perspective. Squint and it is a
    // mountain range at night; look and it is the number moving. A slow
    // gold tracer draws the nearest ridge — the market never sleeps.
    @ViewBuilder private func market(w: CGFloat, h: CGFloat) -> some View {
        LinearGradient(colors: [Color(hex: "#07080B"), Color(hex: "#0B0D12"), Color(hex: "#080909")],
                       startPoint: .top, endPoint: .bottom)
        Canvas { ctx, size in
            let W = size.width, H = size.height
            func ridge(seed: UInt64, baseY: CGFloat, amp: CGFloat) -> (fill: Path, top: Path) {
                var rnd = DepthLCG(seed: seed)
                let n = 40
                var v = [Double](repeating: 0, count: n)
                var acc = 0.0
                for i in 0..<n { acc += (rnd.next() - 0.5) * 0.9; acc = max(-1, min(1, acc)); v[i] = acc }
                for _ in 0..<2 {
                    for i in 1..<(n - 1) { v[i] = (v[i - 1] + v[i] * 2 + v[i + 1]) / 4 }
                }
                var top = Path()
                for i in 0..<n {
                    let x = -0.02 * W + (1.04 * W) * CGFloat(i) / CGFloat(n - 1)
                    let y = baseY - amp * CGFloat(v[i])
                    if i == 0 { top.move(to: CGPoint(x: x, y: y)) } else { top.addLine(to: CGPoint(x: x, y: y)) }
                }
                var fill = top
                fill.addLine(to: CGPoint(x: 1.02 * W, y: H + 60))
                fill.addLine(to: CGPoint(x: -0.02 * W, y: H + 60))
                fill.closeSubpath()
                return (fill, top)
            }
            let far = ridge(seed: 301, baseY: 0.40 * H, amp: 0.030 * H)
            let mid = ridge(seed: 302, baseY: 0.50 * H, amp: 0.045 * H)
            let near = ridge(seed: 303, baseY: 0.615 * H, amp: 0.065 * H)
            ctx.drawLayer { far_ctx in
                far_ctx.addFilter(.blur(radius: 1.6))
                far_ctx.fill(far.fill, with: .color(Color(hex: "#12161E").opacity(alpha(0.55))))
                far_ctx.stroke(far.top, with: .color(Color(hex: "#9FB0C8").opacity(alpha(0.045))), lineWidth: 0.8)
            }
            ctx.drawLayer { mid_ctx in
                mid_ctx.addFilter(.blur(radius: 0.8))
                mid_ctx.fill(mid.fill, with: .color(Color(hex: "#0C0F15").opacity(0.9)))
                mid_ctx.stroke(mid.top, with: .color(Color(hex: "#B9C2D4").opacity(alpha(0.055))), lineWidth: 0.9)
            }
            ctx.fill(near.fill, with: .color(Color(hex: "#080A0E")))
            ctx.stroke(near.top, with: .color(GaryColors.gold.opacity(alpha(0.10))), lineWidth: 1.0)
            // node dots on the near ridge's swings
            var prnd = DepthLCG(seed: 304)
            for _ in 0..<5 {
                let t = 0.08 + prnd.next() * 0.84
                if let p = near.top.trimmedPath(from: 0, to: CGFloat(t)).currentPoint {
                    ctx.fill(Path(ellipseIn: CGRect(x: p.x - 1.6, y: p.y - 1.6, width: 3.2, height: 3.2)),
                             with: .color(GaryColors.gold.opacity(alpha(0.12))))
                }
            }
            // the tracer: a bright segment endlessly re-drawing the line
            let head = CGFloat((time * 0.045).truncatingRemainder(dividingBy: 1))
            let tail = max(head - 0.07, 0)
            let seg = near.top.trimmedPath(from: tail, to: head)
            ctx.stroke(seg, with: .color(GaryColors.gold.opacity(alpha(0.30))), lineWidth: 1.5)
            if let tip = seg.currentPoint {
                ctx.fill(Path(ellipseIn: CGRect(x: tip.x - 2.1, y: tip.y - 2.1, width: 4.2, height: 4.2)),
                         with: .color(GaryColors.gold.opacity(alpha(0.45))))
            }
        }
    }

    // STUDY 8 — THE VAULT. Vastness by architecture: colossal pilasters
    // converge to a vanishing point ABOVE the screen, tie-bands compress as
    // they climb, and a warm vault-light waits at the top. The head-tilt
    // read — you are standing at the bottom of the house.
    @ViewBuilder private func vault(w: CGFloat, h: CGFloat) -> some View {
        Color(hex: "#0A0908")
        Canvas { ctx, size in
            let W = size.width, H = size.height
            let vp = CGPoint(x: 0.5 * W, y: -0.18 * H)
            let topY = 0.055 * H
            func toward(_ p: CGPoint, atY y: CGFloat) -> CGPoint {
                let t = (p.y - y) / (p.y - vp.y)
                return CGPoint(x: p.x + (vp.x - p.x) * t, y: y)
            }
            let feet: [CGFloat] = [-0.55, -0.34, -0.155, 0.155, 0.34, 0.55]
            let half = 0.045 * W
            for f in feet {
                let footL = CGPoint(x: (0.5 + f) * W - half, y: H + 40)
                let footR = CGPoint(x: (0.5 + f) * W + half, y: H + 40)
                let headL = toward(footL, atY: topY)
                let headR = toward(footR, atY: topY)
                var col = Path()
                col.move(to: footL); col.addLine(to: headL)
                col.addLine(to: headR); col.addLine(to: footR)
                col.closeSubpath()
                ctx.fill(col, with: .color(Color(hex: "#050505").opacity(0.88)))
                var edgeL = Path(); edgeL.move(to: footL); edgeL.addLine(to: headL)
                var edgeR = Path(); edgeR.move(to: footR); edgeR.addLine(to: headR)
                ctx.stroke(edgeL, with: .color(GaryColors.gold.opacity(alpha(0.055))), lineWidth: 0.7)
                ctx.stroke(edgeR, with: .color(GaryColors.gold.opacity(alpha(0.055))), lineWidth: 0.7)
            }
            // tie-bands: equal architecture, unequal spacing — foreshortening
            for j in 1...8 {
                let t = pow(Double(j) / 8.0, 1.65)
                let y = H * (0.06 + 0.87 * CGFloat(t))
                var band = Path()
                band.move(to: CGPoint(x: 0, y: y))
                band.addQuadCurve(to: CGPoint(x: W, y: y),
                                  control: CGPoint(x: 0.5 * W, y: y + H * 0.014))
                ctx.stroke(band, with: .color(Color(hex: "#EFE7D8").opacity(alpha(0.016 + 0.005 * Double(j)))), lineWidth: 0.7)
            }
            // dust hanging in the vault light
            var rnd = DepthLCG(seed: 808)
            for _ in 0..<16 {
                let x = (0.30 + rnd.next() * 0.40) * W
                let y = (0.04 + rnd.next() * 0.16) * H
                ctx.fill(Path(ellipseIn: CGRect(x: x, y: y, width: 1.3, height: 1.3)),
                         with: .color(Color(hex: "#F2E4BC").opacity(alpha(0.05 + rnd.next() * 0.05))))
            }
        }
        RadialGradient(colors: [Color(hex: "#E8CE8C").opacity(alpha(0.11)),
                                Color(hex: "#B08E3E").opacity(alpha(0.04)), .clear],
                       center: .init(x: 0.5, y: 0.015), startRadius: 4, endRadius: w * 0.62)
        RadialGradient(stops: [
            .init(color: .clear, location: 0.42),
            .init(color: .black.opacity(0.38), location: 0.75),
            .init(color: .black.opacity(0.8), location: 1),
        ], center: .init(x: 0.5, y: 0.35), startRadius: 10, endRadius: h * 0.8)
    }

    // STUDY 9 — FIELD LEVEL (NO RULES). The whole scene, literally: you are
    // standing at the plate during a packed night game. Grandstands climb
    // both sides full of crowd, floodlight banks blaze with star flares,
    // camera flashes pop at random through the stands, and the chalk of the
    // infield runs under the tab bar. Every restraint rule broken on purpose.
    @ViewBuilder private func fieldLevel(w: CGFloat, h: CGFloat) -> some View {
        LinearGradient(colors: [Color(hex: "#0A1526"), Color(hex: "#0D1B30"), Color(hex: "#0B1420")],
                       startPoint: .top, endPoint: .bottom)
        Canvas { ctx, size in
            let W = size.width, H = size.height
            func P(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x * W, y: y * H) }
            func quadFill(_ a: CGPoint, _ b: CGPoint, _ c: CGPoint, _ d: CGPoint, _ color: Color) {
                var p = Path(); p.move(to: a); p.addLine(to: b); p.addLine(to: c); p.addLine(to: d); p.closeSubpath()
                ctx.fill(p, with: .color(color))
            }
            func lerp(_ a: CGPoint, _ b: CGPoint, _ t: CGFloat) -> CGPoint {
                CGPoint(x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t)
            }
            // grandstand slabs: [topLeft, topRight, bottomRight, bottomLeft]
            let slabs: [(CGPoint, CGPoint, CGPoint, CGPoint, Color)] = [
                (P(0.00, 0.14), P(0.40, 0.30), P(0.40, 0.44), P(0.00, 0.34), Color(hex: "#0C1119")),
                (P(0.00, 0.36), P(0.42, 0.46), P(0.42, 0.60), P(0.00, 0.58), Color(hex: "#101620")),
                (P(0.60, 0.30), P(1.00, 0.14), P(1.00, 0.34), P(0.60, 0.44), Color(hex: "#0C1119")),
                (P(0.58, 0.46), P(1.00, 0.36), P(1.00, 0.58), P(0.58, 0.60), Color(hex: "#101620")),
                (P(0.38, 0.335), P(0.62, 0.335), P(0.62, 0.435), P(0.38, 0.435), Color(hex: "#0A0F16")),
            ]
            for s in slabs { quadFill(s.0, s.1, s.2, s.3, s.4) }
            // the crowd: ~640 souls, warm and cool, seeded into each slab
            var rnd = DepthLCG(seed: 909)
            let crowdColors = [Color(hex: "#C8B896"), Color(hex: "#8FA0B8"), Color(hex: "#B87F6F"), Color(hex: "#9BB39B")]
            for s in slabs {
                for _ in 0..<128 {
                    let u = CGFloat(rnd.next()), v = CGFloat(rnd.next())
                    let pt = lerp(lerp(s.0, s.1, u), lerp(s.3, s.2, u), v)
                    let c = crowdColors[Int(rnd.next() * 4) % 4]
                    let d = 1.0 + rnd.next() * 0.9
                    ctx.fill(Path(ellipseIn: CGRect(x: pt.x, y: pt.y, width: d, height: d)),
                             with: .color(c.opacity(alpha(0.22 + rnd.next() * 0.30))))
                }
            }
            // camera flashes popping through the stands — the World Series tell
            var frnd = DepthLCG(seed: 910)
            for _ in 0..<14 {
                let si = Int(frnd.next() * 5) % 5
                let s = slabs[si]
                let u = CGFloat(frnd.next()), v = CGFloat(frnd.next())
                let pt = lerp(lerp(s.0, s.1, u), lerp(s.3, s.2, u), v)
                let period = 1.4 + frnd.next() * 2.6
                let offset = frnd.next() * period
                let phase = ((time + offset).truncatingRemainder(dividingBy: period)) / period
                if phase < 0.055 {
                    let pop = sin(phase / 0.055 * .pi)
                    ctx.fill(Path(ellipseIn: CGRect(x: pt.x - 1.6, y: pt.y - 1.6, width: 3.2, height: 3.2)),
                             with: .color(.white.opacity(0.9 * pop)))
                    ctx.fill(Path(ellipseIn: CGRect(x: pt.x - 5, y: pt.y - 5, width: 10, height: 10)),
                             with: .color(.white.opacity(0.28 * pop)))
                }
            }
            // floodlight banks, in frame and blazing
            let breath = 0.88 + 0.12 * sin(time / 4.0)
            for bank in [P(0.115, 0.075), P(0.885, 0.075)] {
                quadFill(CGPoint(x: bank.x - 0.052 * W, y: bank.y - 0.016 * H),
                         CGPoint(x: bank.x + 0.052 * W, y: bank.y - 0.016 * H),
                         CGPoint(x: bank.x + 0.052 * W, y: bank.y + 0.016 * H),
                         CGPoint(x: bank.x - 0.052 * W, y: bank.y + 0.016 * H),
                         Color(hex: "#1A2130"))
                var mast = Path()
                mast.move(to: CGPoint(x: bank.x, y: bank.y + 0.016 * H))
                mast.addLine(to: CGPoint(x: bank.x, y: bank.y + 0.09 * H))
                ctx.stroke(mast, with: .color(Color(hex: "#1A2130")), lineWidth: 2.4)
                for i in 0..<8 {
                    let lx = bank.x + CGFloat(i % 4 - 2) * 0.021 * W + 0.0105 * W
                    let ly = bank.y + (i < 4 ? -0.007 : 0.007) * H
                    ctx.fill(Path(ellipseIn: CGRect(x: lx - 2.2, y: ly - 2.2, width: 4.4, height: 4.4)),
                             with: .color(Color(hex: "#FFF4D6").opacity(0.95 * breath)))
                }
                ctx.fill(Path(ellipseIn: CGRect(x: bank.x - 0.16 * W, y: bank.y - 0.11 * H, width: 0.32 * W, height: 0.22 * H)),
                         with: .radialGradient(Gradient(colors: [Color(hex: "#FFEDB8").opacity(0.34 * breath), .clear]),
                                               center: bank, startRadius: 2, endRadius: 0.17 * W))
                for (ddx, ddy, len) in [(CGFloat(1), CGFloat(0), 0.13 * W), (0, 1, 0.10 * W), (0.7, 0.7, 0.08 * W), (0.7, -0.7, 0.08 * W)] {
                    var flare = Path()
                    flare.move(to: CGPoint(x: bank.x - ddx * len, y: bank.y - ddy * len))
                    flare.addLine(to: CGPoint(x: bank.x + ddx * len, y: bank.y + ddy * len))
                    ctx.stroke(flare, with: .linearGradient(
                        Gradient(colors: [.clear, Color(hex: "#FFF4D6").opacity(0.5 * breath), .clear]),
                        startPoint: CGPoint(x: bank.x - ddx * len, y: bank.y - ddy * len),
                        endPoint: CGPoint(x: bank.x + ddx * len, y: bank.y + ddy * len)), lineWidth: 1.3)
                }
            }
            // the field: glowing grass, dirt arc, chalk, the mound
            quadFill(P(0, 0.80), P(1, 0.80), P(1, 1.02), P(0, 1.02), Color(hex: "#1C3A24"))
            ctx.fill(Path(ellipseIn: CGRect(x: -0.25 * W, y: 0.755 * H, width: 1.5 * W, height: 0.14 * H)),
                     with: .color(Color(hex: "#274D2E")))
            ctx.fill(Path(ellipseIn: CGRect(x: 0.18 * W, y: 0.86 * H, width: 0.64 * W, height: 0.30 * H)),
                     with: .color(Color(hex: "#4A3524")))
            ctx.fill(Path(ellipseIn: CGRect(x: 0.30 * W, y: 0.905 * H, width: 0.40 * W, height: 0.20 * H)),
                     with: .color(Color(hex: "#245231")))
            ctx.fill(Path(ellipseIn: CGRect(x: 0.44 * W, y: 0.940 * H, width: 0.12 * W, height: 0.045 * H)),
                     with: .color(Color(hex: "#54402C")))
            for target in [P(-0.05, 0.70), P(1.05, 0.70)] {
                var foul = Path()
                foul.move(to: P(0.5, 1.01))
                foul.addLine(to: target)
                ctx.stroke(foul, with: .color(Color(hex: "#EDE6D4").opacity(0.5)), lineWidth: 1.6)
            }
            // scoreboard glow over the far stand
            ctx.fill(Path(CGRect(x: 0.415 * W, y: 0.295 * H, width: 0.17 * W, height: 0.028 * H)),
                     with: .color(Color(hex: "#F5B93F").opacity(0.5 + 0.1 * sin(time / 2))))
        }
    }

    // STUDY 10 — GOLDEN HOUR (NO RULES). One colossal gesture: a sun the
    // width of half the screen sinks behind the skyline, god rays wheel in
    // slow motion, birds cross the disc, and the whole world is Gary gold.
    // Maximum luminance, zero apology.
    @ViewBuilder private func goldenHour(w: CGFloat, h: CGFloat) -> some View {
        Canvas { ctx, size in
            let W = size.width, H = size.height
            let sun = CGPoint(x: 0.5 * W, y: 0.60 * H)
            let sunR = 0.42 * W
            let horizonY = 0.665 * H
            // sky: radiance falling off from the sun
            ctx.fill(Path(CGRect(x: 0, y: 0, width: W, height: H)),
                     with: .radialGradient(
                        Gradient(stops: [
                            .init(color: Color(hex: "#F7C868"), location: 0),
                            .init(color: Color(hex: "#D99E37"), location: 0.22),
                            .init(color: Color(hex: "#8A5A18"), location: 0.46),
                            .init(color: Color(hex: "#3A250C"), location: 0.72),
                            .init(color: Color(hex: "#120C05"), location: 1),
                        ]),
                        center: sun, startRadius: 0, endRadius: 1.25 * H))
            // god rays, wheeling at one revolution per eight minutes
            let baseAngle = time * 0.013
            for k in 0..<14 {
                let a = baseAngle + Double(k) * (.pi * 2 / 14)
                let halfSpread = 0.055
                let R = 1.6 * H
                var wedge = Path()
                wedge.move(to: sun)
                wedge.addLine(to: CGPoint(x: sun.x + CGFloat(cos(a - halfSpread)) * R,
                                          y: sun.y + CGFloat(sin(a - halfSpread)) * R))
                wedge.addLine(to: CGPoint(x: sun.x + CGFloat(cos(a + halfSpread)) * R,
                                          y: sun.y + CGFloat(sin(a + halfSpread)) * R))
                wedge.closeSubpath()
                let rayAlpha = (k % 2 == 0 ? 0.085 : 0.04)
                ctx.fill(wedge, with: .radialGradient(
                    Gradient(colors: [Color(hex: "#FFE9AE").opacity(rayAlpha), .clear]),
                    center: sun, startRadius: sunR * 0.85, endRadius: R))
            }
            // the disc: white-hot core, gold limb, breathing halo
            let breath = 0.9 + 0.1 * sin(time / 6.0)
            ctx.fill(Path(ellipseIn: CGRect(x: sun.x - sunR * 1.55, y: sun.y - sunR * 1.55,
                                            width: sunR * 3.1, height: sunR * 3.1)),
                     with: .radialGradient(Gradient(colors: [Color(hex: "#FFDD8F").opacity(0.42 * breath), .clear]),
                                           center: sun, startRadius: sunR * 0.8, endRadius: sunR * 1.55))
            ctx.fill(Path(ellipseIn: CGRect(x: sun.x - sunR, y: sun.y - sunR, width: sunR * 2, height: sunR * 2)),
                     with: .radialGradient(
                        Gradient(stops: [
                            .init(color: Color(hex: "#FFF7DE"), location: 0),
                            .init(color: Color(hex: "#FFE49A"), location: 0.55),
                            .init(color: Color(hex: "#F2B94E"), location: 0.85),
                            .init(color: Color(hex: "#E0A030"), location: 1),
                        ]),
                        center: sun, startRadius: 0, endRadius: sunR))
            // birds crossing the disc, forty-second loop
            var brnd = DepthLCG(seed: 111)
            for _ in 0..<5 {
                let speed = 0.014 + brnd.next() * 0.012
                let offset = brnd.next()
                let yy = sun.y - sunR * CGFloat(0.15 + brnd.next() * 0.5)
                let s = CGFloat(3.2 + brnd.next() * 2.6)
                let t = ((time * speed + offset).truncatingRemainder(dividingBy: 1))
                let xx = CGFloat(t) * (W + 120) - 60
                let flap = CGFloat(0.75 + 0.25 * sin(time * 9 + offset * 40))
                var bird = Path()
                bird.move(to: CGPoint(x: xx - s, y: yy))
                bird.addQuadCurve(to: CGPoint(x: xx, y: yy - s * 0.55 * flap),
                                  control: CGPoint(x: xx - s * 0.5, y: yy - s * 0.95 * flap))
                bird.addQuadCurve(to: CGPoint(x: xx + s, y: yy),
                                  control: CGPoint(x: xx + s * 0.5, y: yy - s * 0.95 * flap))
                ctx.stroke(bird, with: .color(Color(hex: "#1E1408").opacity(0.85)), lineWidth: 1.3)
            }
            // skyline + the stadium, pure silhouette against the blaze
            var srnd = DepthLCG(seed: 112)
            var x: Double = -6
            while x < W + 10 {
                let bw = 16 + srnd.next() * 30
                let bh = 14 + srnd.next() * 52
                ctx.fill(Path(CGRect(x: x, y: horizonY - bh, width: bw, height: bh)),
                         with: .color(Color(hex: "#0B0704")))
                if srnd.next() > 0.6 {
                    ctx.fill(Path(CGRect(x: x + bw * 0.3, y: horizonY - bh - 7, width: 1.6, height: 7)),
                             with: .color(Color(hex: "#0B0704")))
                }
                x += bw + 2 + srnd.next() * 5
            }
            var bowl = Path()
            bowl.addArc(center: CGPoint(x: 0.30 * W, y: horizonY),
                        radius: 0.115 * W, startAngle: .degrees(180), endAngle: .degrees(0), clockwise: false)
            bowl.closeSubpath()
            ctx.fill(bowl, with: .color(Color(hex: "#0B0704")))
            for mast in [-0.10, -0.04, 0.04, 0.10] {
                var m = Path()
                m.move(to: CGPoint(x: (0.30 + mast) * W, y: horizonY - 0.10 * W))
                m.addLine(to: CGPoint(x: (0.30 + mast * 1.25) * W, y: horizonY - 0.155 * W))
                ctx.stroke(m, with: .color(Color(hex: "#0B0704")), lineWidth: 1.5)
            }
            // ground and the sun road on it
            ctx.fill(Path(CGRect(x: 0, y: horizonY, width: W, height: H - horizonY)),
                     with: .color(Color(hex: "#0A0705")))
            ctx.fill(Path(CGRect(x: sun.x - 0.11 * W, y: horizonY, width: 0.22 * W, height: H - horizonY)),
                     with: .linearGradient(
                        Gradient(colors: [Color(hex: "#F2B94E").opacity(0.30), Color(hex: "#F2B94E").opacity(0.02)]),
                        startPoint: CGPoint(x: sun.x, y: horizonY),
                        endPoint: CGPoint(x: sun.x, y: H)))
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
