import SwiftUI
import UIKit

/// A celebration ready to play: its row, the backdrop, and each frame trimmed
/// to Gary so every pose stands on the same spot.
struct CashRailReel: Identifiable {
    struct Frame {
        let image: UIImage
        /// Gary's height as a fraction of the drawn canvas (a crouch is shorter).
        let height: Double
        /// Gary's center of mass as a fraction of the trimmed width.
        let cx: Double
        var aspect: Double { image.size.width / max(1, image.size.height) }
    }
    let celebration: CashRailCelebration
    let backdrop: UIImage
    /// The backdrop's top edge color: the card behind the stat box, so the
    /// box sits on the same color as the scene (founder, Oct 30 2026).
    let tint: Color
    let frames: [String: Frame]
    let timeline: CashRailDance.Timeline
    var id: String { celebration.play_key }
}

/// Plays Gary's celebrations over the app, once per hit (founder, Oct 29 2026:
/// ESPN fantasy's big-play celebrations, Gary in the scorer's number).
@MainActor
final class CashRailCelebrations: ObservableObject {
    static let shared = CashRailCelebrations()
    @Published private(set) var reel: CashRailReel?
    /// Every ready celebration seen this session, by play key, for replays.
    @Published private(set) var known: [String: CashRailCelebration] = [:]

    private var loading = false
    private static let seenKey = "cashRail.celebrated"

    private var seen: Set<String> { Set(UserDefaults.standard.stringArray(forKey: Self.seenKey) ?? []) }
    private func markSeen(_ key: String) {
        var list = UserDefaults.standard.stringArray(forKey: Self.seenKey) ?? []
        guard !list.contains(key) else { return }
        list.append(key)
        UserDefaults.standard.set(Array(list.suffix(200)), forKey: Self.seenKey)
    }

    /// Called with each poll's rows: plays the biggest fresh one not yet seen.
    func consider(_ rows: [CashRailCelebration]) {
        for c in rows { known[c.play_key] = c }
        guard reel == nil, !loading, let next = CashRailCelebration.next(rows, seen: seen, now: Date()) else { return }
        markSeen(next.play_key)
        play(next)
    }

    /// Plays one now, seen or not (a tap on the hit, or the tour).
    func play(_ c: CashRailCelebration) {
        guard !loading else { return }
        loading = true
        Task {
            let reel = await Self.load(c)
            loading = false
            if let reel { self.reel = reel }
        }
    }

    func finish(_ id: String) {
        if reel?.id == id { reel = nil }
    }

    #if DEBUG
    /// Tour verb `cashrail celebrate`: replays the newest celebration drawn.
    func replayLatest() {
        Task {
            if let c = await SupabaseAPI.fetchCelebrations(league: "NFL", gameID: nil, limit: 1)?.first { play(c) }
        }
    }
    #endif

    // MARK: Loading

    private static func image(_ s: String) async -> UIImage? {
        guard let url = URL(string: s), let (data, _) = try? await URLSession.shared.data(from: url) else { return nil }
        return UIImage(data: data)
    }

    /// Everything downloads and trims before anything shows, so the dance
    /// never starts on a half-loaded frame.
    private static func load(_ c: CashRailCelebration) async -> CashRailReel? {
        let slugs = Set(c.assets.seq.map(\.slug))
        guard !slugs.isEmpty, slugs.allSatisfy({ c.assets.frames[$0] != nil }) else { return nil }
        async let bg = image(c.assets.bg)
        var frames: [String: CashRailReel.Frame] = [:]
        await withTaskGroup(of: (String, CashRailReel.Frame?).self) { group in
            for slug in slugs {
                group.addTask {
                    guard let img = await image(c.assets.frames[slug]!) else { return (slug, nil) }
                    return (slug, await Task.detached(priority: .userInitiated) { trim(img) }.value)
                }
            }
            for await (slug, frame) in group { if let frame { frames[slug] = frame } }
        }
        guard frames.count == slugs.count, let backdrop = await bg else { return nil }
        let tint = await Task.detached { topColor(backdrop) }.value
        return CashRailReel(celebration: c, backdrop: backdrop.preparingForDisplay() ?? backdrop, tint: tint,
                            frames: frames, timeline: CashRailDance.Timeline(seq: c.assets.seq))
    }

    /// Finds Gary in the frame's alpha (measured at a quarter size, which is
    /// plenty for a bounding box) and crops the full-size art to him.
    nonisolated private static func trim(_ img: UIImage) -> CashRailReel.Frame? {
        guard let cg = img.cgImage else { return nil }
        let w = max(1, cg.width / 4), h = max(1, cg.height / 4)
        var alpha = [UInt8](repeating: 0, count: w * h)
        let drew: Bool = alpha.withUnsafeMutableBytes { buf in
            guard let ctx = CGContext(data: buf.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w,
                                      space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.alphaOnly.rawValue) else { return false }
            ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
            return true
        }
        guard drew, let f = CashRailDance.figure(alpha: alpha, width: w, height: h) else { return nil }
        let sx = Double(cg.width) / Double(w), sy = Double(cg.height) / Double(h)
        let box = CGRect(x: Double(f.minX) * sx, y: Double(f.minY) * sy,
                         width: Double(f.maxX - f.minX + 1) * sx, height: Double(f.maxY - f.minY + 1) * sy)
            .integral.intersection(CGRect(x: 0, y: 0, width: cg.width, height: cg.height))
        guard let cropped = cg.cropping(to: box) else { return nil }
        let out = UIImage(cgImage: cropped, scale: 1, orientation: .up)
        return CashRailReel.Frame(image: out.preparingForDisplay() ?? out,
                                  height: Double(f.maxY - f.minY + 1) / Double(h), cx: f.cx)
    }

    /// The average of the backdrop's top 6%, where it is plain team color.
    nonisolated private static func topColor(_ img: UIImage) -> Color {
        guard let full = img.cgImage,
              let cg = full.cropping(to: CGRect(x: 0, y: 0, width: full.width, height: max(1, full.height * 6 / 100)))
        else { return Color(hex: "#0F3D25") }
        var px = [UInt8](repeating: 0, count: 4)
        let ok: Bool = px.withUnsafeMutableBytes { buf in
            guard let ctx = CGContext(data: buf.baseAddress, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                                      space: CGColorSpaceCreateDeviceRGB(),
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
            ctx.interpolationQuality = .medium
            ctx.draw(cg, in: CGRect(x: 0, y: 0, width: 1, height: 1))
            return true
        }
        guard ok else { return Color(hex: "#0F3D25") }
        return Color(red: Double(px[0]) / 255, green: Double(px[1]) / 255, blue: Double(px[2]) / 255)
    }
}

/// Mounted at the app root (ContentView) so the celebration dims the dock
/// too. It waits for Home: a celebration never interrupts another page.
struct CashRailCelebrationHost: View {
    @ObservedObject private var player = CashRailCelebrations.shared
    @AppStorage("selectedTab") private var selectedTab: Int = 0

    var body: some View {
        ZStack {
            if let reel = player.reel, selectedTab == 0 {
                CashRailCelebrationView(reel: reel) { player.finish(reel.id) }
                    .id(reel.id)
                    .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.25), value: player.reel?.id)
    }
}

/// The celebration itself, as the approved mock drew it: the stat box, then
/// Gary's dance on his team's backdrop, confetti on the last beat, the
/// dance's name. Tap anywhere to close; it closes itself when the dance ends.
struct CashRailCelebrationView: View {
    let reel: CashRailReel
    let onDone: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var start = Date()

    /// Gary's standing height as a share of the scene (the mock's K).
    private static let figureShare = 0.64
    private static let linger = 0.9

    private var c: CashRailCelebration { reel.celebration }

    var body: some View {
        // Measured inside the safe area: the card starts under the status bar
        // and leaves the dock its room, as the mock placed it.
        GeometryReader { geo in
            let cardW = min(geo.size.width - 36, 420)
            let sceneH = min(cardW * 1.5, geo.size.height - 150)
            TimelineView(.animation(paused: false)) { ctx in
                let t = reduceMotion ? reel.timeline.end : ctx.date.timeIntervalSince(start)
                card(t: t, width: cardW, sceneH: sceneH)
            }
            .padding(.top, 40)
            .frame(width: geo.size.width, height: geo.size.height, alignment: .top)
        }
        .background(scrim.ignoresSafeArea())
        .contentShape(Rectangle())
        .onTapGesture(perform: onDone)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(c.who), \(c.market), \(CashRailFormat.price(c.price)). Ten dollars paid \(CashRailFormat.payout10(c.price)).")
        .accessibilityAddTraits(.isButton)
        .accessibilityHint("Closes the celebration")
        .task {
            start = Date()
            let wait = reduceMotion ? 3.0 : reel.timeline.end + Self.linger
            try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
            onDone()
        }
    }

    private var scrim: some View {
        ZStack {
            // Home stays readable behind it, dimmed (a system blur erased it).
            Color(hex: "#090808").opacity(0.55)
            RadialGradient(colors: [Color(hex: "#090808").opacity(0.2), Color(hex: "#090808").opacity(0.75)],
                           center: UnitPoint(x: 0.5, y: 0.45), startRadius: 0, endRadius: 520)
        }
    }

    // MARK: Card

    private func card(t: Double, width: CGFloat, sceneH: CGFloat) -> some View {
        VStack(spacing: 0) {
            statBox(t: t).padding([.horizontal, .top], 12)
            scene(t: t, width: width, height: sceneH)
        }
        .frame(width: width)
        .background(reel.tint)
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(GaryColors.lightGold.opacity(0.45), lineWidth: 1))
        .shadow(color: .black.opacity(0.6), radius: 30, y: 30)
    }

    private func statBox(t: Double) -> some View {
        // The price punches in white and settles gold (the mock's 200ms-delayed pop).
        let pt = (t - 0.2) / 0.5
        let punch = pt < 0 || pt >= 1 ? 0 : 1 - CashRailDance.Ease.punch(pt)
        return HStack(spacing: 14) {
            VStack(spacing: 5) {
                Text(CashRailFormat.price(c.price))
                    .font(CR.bebas(44))
                    .foregroundColor(punch > 0.02 ? .white : GaryColors.lightGold)
                    .scaleEffect(1 + 0.4 * punch)
                    .fitsOneLine()
                Text("PAID")
                    .font(.system(size: 9.5, weight: .heavy)).tracking(1.6)
                    .foregroundColor(CR.ink.opacity(0.75))
            }
            .frame(minWidth: 92)
            Rectangle().fill(CR.ink.opacity(0.25)).frame(width: 1)
            VStack(alignment: .leading, spacing: 3) {
                Text("\(c.who), \(Self.lowerFirst(c.market))")
                    .font(.system(size: 14.5, weight: .bold))
                    .foregroundColor(CR.ink)
                    .fitsLines(2)
                (Text([c.play, c.when_label].compactMap { $0 }.map { $0 + " · " }.joined() + "$10 → ")
                    .foregroundColor(CR.ink.opacity(0.7))
                 + Text(CashRailFormat.payout10(c.price)).foregroundColor(GaryColors.win).fontWeight(.bold))
                    .font(.system(size: 12, weight: .semibold))
                    .fitsOneLine()
            }
            Spacer(minLength: 0)
        }
        .fixedSize(horizontal: false, vertical: true)
        .padding(.vertical, 11).padding(.horizontal, 14)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color(hex: "#090808").opacity(0.55)))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(GaryColors.lightGold.opacity(0.25), lineWidth: 1))
    }

    private static func lowerFirst(_ s: String) -> String {
        guard let f = s.first, s.dropFirst().first?.isLowercase ?? true else { return s }
        return f.lowercased() + s.dropFirst()
    }

    // MARK: Scene

    private func scene(t: Double, width: CGFloat, height: CGFloat) -> some View {
        let tl = reel.timeline
        let impact = reduceMotion ? nil : tl.sinceImpact(at: t)
        // The backdrop slams in (scale 1.5 → .97 → 1), then thumps on impacts.
        let intro = CashRailDance.sample([(0, .init(sx: 1.5)), (0.7, .init(sx: 0.97)), (1, .rest)],
                                         CashRailDance.Ease.slam(min(1, max(0, t / 0.52))))
        let introOpacity = min(1, max(0, CashRailDance.Ease.slam(min(1, t / 0.52)) / 0.7))
        var bgScale = intro.sx
        if let i = impact, i < 0.32 {
            bgScale = CashRailDance.sample([(0, .rest), (0.5, .init(sx: 1.05)), (1, .rest)], i / 0.32).sx
        }
        let shake: CGSize = {
            guard let i = impact, i < 0.26 else { return .zero }
            let p = CashRailDance.sample([(0, .rest), (1.0 / 3, .init(tx: -6, ty: 4)), (2.0 / 3, .init(tx: 5, ty: -3)), (1, .rest)], i / 0.26)
            return CGSize(width: p.tx, height: p.ty)
        }()
        let flash = impact.map { $0 < 0.2 ? 0.4 * (1 - $0 / 0.2) : 0 } ?? 0
        let labelP = min(1, max(0, (t - 0.25) / 0.4))

        return ZStack(alignment: .topLeading) {
            Image(uiImage: reel.backdrop)
                .resizable().scaledToFill()
                .frame(width: width, height: height)
                .scaleEffect(bgScale, anchor: UnitPoint(x: 0.5, y: 0.35))
                .opacity(introOpacity)
                .clipped()
            // The floor shadow shrinks and fades as Gary leaves the ground.
            let lift = tl.step(at: t).map { max(0, -tl.pose(tl.seq[$0].slug, at: t).ty) } ?? 0
            Ellipse()
                .fill(RadialGradient(colors: [.black.opacity(0.45), .clear], center: .center, startRadius: 0, endRadius: width * 0.28))
                .frame(width: width * 0.56, height: height * 0.04)
                .scaleEffect(1 - min(0.5, lift * 2.5))
                .opacity(1 - min(0.6, lift * 3))
                .position(x: width / 2, y: height * (1 - 0.016) - height * 0.02)
            ForEach(Array(Set(tl.seq.map(\.slug))).sorted(), id: \.self) { slug in
                let o = tl.opacity(slug, at: t)
                if o > 0, let f = reel.frames[slug] {
                    pose(f, tl.pose(slug, at: t), opacity: o, width: width, height: height)
                }
            }
            if !reduceMotion { confetti(t: t - tl.lastStart, width: width, height: height) }
            Color.white.opacity(flash).allowsHitTesting(false)
            Text(c.assets.name)
                .font(CR.bebas(24)).tracking(2)
                .foregroundColor(GaryColors.lightGold)
                .shadow(color: .black.opacity(0.7), radius: 4, y: 2)
                .opacity(labelP)
                .offset(y: 10 * (1 - labelP))
                .frame(width: width)
                .position(x: width / 2, y: height - 12 - 12)
        }
        .frame(width: width, height: height)
        .offset(shake)
    }

    private func pose(_ f: CashRailReel.Frame, _ p: CashRailDance.Pose, opacity: Double, width: CGFloat, height: CGFloat) -> some View {
        let h = height * Self.figureShare * f.height
        let w = h * f.aspect
        let x = width / 2 - (f.cx - 0.5) * w
        let floor = height * (1 - 0.025)
        return Image(uiImage: f.image)
            .resizable()
            .frame(width: w, height: h)
            .rotationEffect(.degrees(p.rot), anchor: .bottom)
            .scaleEffect(x: p.sx, y: p.sy, anchor: .bottom)
            .offset(x: p.tx * w, y: p.ty * h)
            .shadow(color: .black.opacity(0.35), radius: 9, y: 18)
            .opacity(opacity)
            .position(x: x, y: floor - h / 2)
    }

    private static let confettiColors = [GaryColors.lightGold, GaryColors.gold, CR.ink, Color(hex: "#1F6B3F")]

    /// Thirty flakes from the top on the last beat, as the mock threw them.
    private func confetti(t: Double, width: CGFloat, height: CGFloat) -> some View {
        Canvas { ctx, _ in
            guard t >= 0 else { return }
            let unit = height / 531
            for k in 0..<30 {
                let dur = (1800 + Double(k % 6) * 180) / 1000, local = t - Double(k % 8) * 0.06
                guard local >= 0, local < dur else { continue }
                let p = CashRailDance.Ease.fall(local / dur)
                let x = width * CGFloat((k * 29) % 100) / 100 + CGFloat(p) * CGFloat(k % 7 - 3) * 12 * unit
                let y = -14 * unit + CGFloat(p) * (520 + CGFloat(k % 5) * 30) * unit
                var flake = ctx
                flake.translateBy(x: x + 3.5 * unit, y: y + 6 * unit)
                flake.rotate(by: .degrees(p * Double(360 + k * 40)))
                flake.fill(Path(CGRect(x: -3.5 * unit, y: -6 * unit, width: 7 * unit, height: 12 * unit)),
                           with: .color(Self.confettiColors[k % 4]))
            }
        }
        .frame(width: width, height: height)
        .allowsHitTesting(false)
    }
}
