// PickCards.swift — Pick cards, Poured/SilverBar finishes, Members Only reveal, Reveal Ceremony.
// Split out of Views.swift on Sep 1 2026 (the 28K-line monolith); pure move,
// no behavior change. Section boundaries follow the original MARK headers.

import SwiftUI
import Combine
import Charts
import WebKit
import SafariServices
import StoreKit

// MARK: - Reusable Components



// MARK: - Pick Cards



// MARK: - Pick Text Helper (shared spread-sign fix)

extension GaryPick {
    /// Formatted pick text with spread sign correction from the elected server line.
    var formattedPickParts: (pick: String, odds: String) {
        var parts = Formatters.splitPickAndOdds(self.pick)
        // The backend has already elected the authoritative best line and
        // stores it in `spread`. A raw book row may be an outlier or even cross
        // zero, so it is only a compatibility fallback for historical rows.
        if let pickType = self.type, pickType == "spread",
           let displaySpread = self.spread ?? self.sportsbook_odds?.compactMap({ $0.spread }).first {
            var text = parts.0
            if let regex = try? NSRegularExpression(pattern: #"([+-]?)(\d{1,2}\.?\d*)\s*$"#),
               let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
               let signRange = Range(match.range(at: 1), in: text),
               let fullRange = Range(match.range(at: 0), in: text) {
                let sign = String(text[signRange])
                let correctSign = displaySpread >= 0 ? "+" : "-"
                if sign.isEmpty || sign != correctSign {
                    let num = abs(displaySpread)
                    let s = num.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(num)) : String(num)
                    text = text.replacingCharacters(in: fullRange, with: "\(correctSign)\(s)")
                    parts = (text, parts.1)
                }
            }
        }
        return parts
    }
}


// MARK: - Compact Pick Row (Scoreboard-style)

// MARK: - 21B-S "Poured — Still" (Jul 2 2026, user-locked premium finish)
//
// The entitled Winners GAME card is a solid poured-gold bar with a machined
// bevel lip — no animation, dark ink type. Free/standard cards keep the dark
// card; prop cards keep their silver language. One source for the metal.
enum GoldBar {
    static let inkHero   = Color(hex: "#2C2304")
    static let inkStrong = Color(hex: "#3A2C04")
    static let inkBody   = Color(hex: "#5C4708")
    static let inkSoft   = Color(hex: "#4A3A08")
    /// LIGHT GOLD, never white/cream — founder call Jul 3: no white anywhere on the bar.
    static let sheen     = Color(hex: "#F0D879")
    /// LOST reads as deep oxblood on gold — lostTint (warm gold-red) vanishes on the bar.
    static let lost      = Color(hex: "#7E2B20")

    /// Brand mark on the bar — A/B under review (Jul 3): micro-engraved
    /// "GARY A.I." text vs the black/gold crest badge. Hidden on WON cards
    /// (the check + payout own that corner).
    enum BrandMark { case none, text, badge }
    /// Founder call (Jul 3 PM): NO mark on the gold bar — the metal and the
    /// type ARE the brand; the corner stays clean (the win check + payout
    /// still claim it). `.text` / `.badge` stay wired if he ever overrules.
    static let brandMark: BrandMark = .none

    // TRUE gold (founder call, Jul 3 — "real clean solid gold, not yellow, no
    // white"): a rich #C9A227-family metal in a tight range, one soft golden
    // polish band for the metal feel, zero pale/white tones anywhere.
    // (dialed ~7% darker Jul 3 PM — founder: "slightly too bright but i like it")
    static let bar = LinearGradient(stops: [
        .init(color: Color(hex: "#D0AC3C"), location: 0.00),
        .init(color: Color(hex: "#BF9927"), location: 0.32),
        .init(color: Color(hex: "#AE8926"), location: 0.58),
        .init(color: Color(hex: "#BF9C33"), location: 0.80),
        .init(color: Color(hex: "#9E7D1C"), location: 1.00)
    ], startPoint: UnitPoint(x: 0.38, y: 0), endPoint: UnitPoint(x: 0.62, y: 1))

    /// The full card background: solid gold + one diagonal polish band + bevel lip.
    static func background(cornerRadius r: CGFloat = 20) -> some View {
        RoundedRectangle(cornerRadius: r, style: .continuous)
            .fill(bar)
            .overlay(
                // The polish: a single soft LIGHT-GOLD band sweeping the metal.
                RoundedRectangle(cornerRadius: r, style: .continuous)
                    .fill(LinearGradient(stops: [
                        .init(color: .clear, location: 0.30),
                        .init(color: Color(hex: "#EFD470").opacity(0.17), location: 0.46),
                        .init(color: .clear, location: 0.62)
                    ], startPoint: UnitPoint(x: 0, y: 0.1), endPoint: UnitPoint(x: 1, y: 0.9))))
            .overlay(
                // Machined bevel: lit gold above, bronze shadow below.
                RoundedRectangle(cornerRadius: r, style: .continuous)
                    .strokeBorder(LinearGradient(colors: [sheen.opacity(0.85),
                                                          Color(hex: "#3A2C04").opacity(0.7)],
                                                 startPoint: .top, endPoint: .bottom),
                                  lineWidth: 2))
            .shadow(color: .black.opacity(0.5), radius: 18, y: 8)
    }
}

// MARK: - SilverBar (Jul 3 2026, user-locked): the SOLD prop card is the
// silver twin of the gold game bar — same machining, same physics, silver
// metal, the black Gary badge as its crest. Winners-page props ONLY; the
// free Picks-page prop cards stay dark.
enum SilverBar {
    static let inkHero   = Color(hex: "#1C1C22")
    static let inkStrong = Color(hex: "#2A2A32")
    static let inkBody   = Color(hex: "#45454E")
    static let inkSoft   = Color(hex: "#3A3A44")
    /// Light SILVER — same rule as gold: never pure white.
    static let sheen     = Color(hex: "#E2E2E8")
    static let lost      = Color(hex: "#6E1F16")

    static let bar = LinearGradient(stops: [
        .init(color: Color(hex: "#C6C6CC"), location: 0.00),
        .init(color: Color(hex: "#B2B2B9"), location: 0.32),
        .init(color: Color(hex: "#A2A2AA"), location: 0.58),
        .init(color: Color(hex: "#B5B5BC"), location: 0.80),
        .init(color: Color(hex: "#90909A"), location: 1.00)
    ], startPoint: UnitPoint(x: 0.38, y: 0), endPoint: UnitPoint(x: 0.62, y: 1))

    static func background(cornerRadius r: CGFloat = 20) -> some View {
        RoundedRectangle(cornerRadius: r, style: .continuous)
            .fill(bar)
            .overlay(
                RoundedRectangle(cornerRadius: r, style: .continuous)
                    .fill(LinearGradient(stops: [
                        .init(color: .clear, location: 0.30),
                        .init(color: Color(hex: "#E8E8EE").opacity(0.18), location: 0.46),
                        .init(color: .clear, location: 0.62)
                    ], startPoint: UnitPoint(x: 0, y: 0.1), endPoint: UnitPoint(x: 1, y: 0.9))))
            // (The gold trim came off Aug 6 — founder: "remove the gold outline
            // around the prop picks". The silver bar carries the card on its
            // own metal now; the Jul 3 machined-lip rim is gone, not dimmed.)
            .shadow(color: .black.opacity(0.5), radius: 18, y: 8)
    }
}

// MARK: - Members Only reveal system (Jul 3 2026, user-locked)
//
// A new Winners pick sits SEALED in the rail — black members card, chrome bear,
// live countdown to first pitch. The owner taps to flip it open into the gold
// bar (haptic; revealed state persists per pick, per device). Locked non-payers
// see a card that carries ZERO pick data — the old blurred-real-card could leak
// the pick through a light blur; this cannot.

/// Per-device ledger of which picks the user has unwrapped.
enum RevealedPicks {
    private static let key = "revealedPickIds"
    private static var cache: Set<String> = Set(UserDefaults.standard.stringArray(forKey: key) ?? [])
    static func isRevealed(_ id: String) -> Bool { cache.contains(id) }
    static func markRevealed(_ id: String) {
        guard !cache.contains(id) else { return }
        cache.insert(id)
        var arr = UserDefaults.standard.stringArray(forKey: key) ?? []
        arr.append(id)
        if arr.count > 400 { arr.removeFirst(arr.count - 400) }
        UserDefaults.standard.set(arr, forKey: key)
    }
    /// Tour harness: wipe the ledger so sealed faces can be re-reviewed.
    static func clearAll() {
        cache.removeAll()
        UserDefaults.standard.removeObject(forKey: key)
    }
}

/// Per-device ledger of which WON picks already played their celebration —
/// the confetti + count-up fire exactly once per pick.
enum CelebratedWins {
    private static let key = "celebratedPickIds"
    private static var cache: Set<String> = Set(UserDefaults.standard.stringArray(forKey: key) ?? [])
    static func contains(_ id: String) -> Bool { cache.contains(id) }
    static func mark(_ id: String) {
        guard !cache.contains(id) else { return }
        cache.insert(id)
        var arr = UserDefaults.standard.stringArray(forKey: key) ?? []
        arr.append(id)
        if arr.count > 400 { arr.removeFirst(arr.count - 400) }
        UserDefaults.standard.set(arr, forKey: key)
    }
    /// Tour harness: wipe the ledger so the win celebration can re-fire.
    static func clearAll() {
        cache.removeAll()
        UserDefaults.standard.removeObject(forKey: key)
    }
}

/// The sealed Winners face — ONE object, three honest states (founder,
/// Jul 5 redo): the pick is IN (tap to reveal), the pick is COMING (when it
/// drops), or the pre-post PLACEHOLDER for the day's card. The normal gold
/// Gary mark, lifted card chrome, and words instead of ticking countdowns.
struct MembersOnlyCardFace: View {
    enum SealState {
        /// A real pick sits behind the seal — invite the tap.
        case pickIn(firstPitch: String?)
        /// The league's pick hasn't dropped yet — say when it lands.
        case coming(note: String)
        /// Pre-post morning placeholder — nothing behind it yet.
        case placeholder(note: String)
    }
    var state: SealState = .placeholder(note: "PICKS DROP ~90 MIN BEFORE EACH GAME")
    /// The gift tag (founder, Jul 5: "this is a wrapping around a present —
    /// say what game the pick is for"). Short matchup: "Twins @ Yankees".
    var tease: String? = nil
    /// League chip in the eyebrow row ("MLB").
    var leagueTag: String? = nil
    /// Kicker override — the prop shelf says PROP PICK instead of PICK.
    var kicker: String? = nil
    /// SILVER seal (founder, Aug 4: "no gold outline around the props").
    /// Props are the silver twin of the gold game card everywhere else
    /// (SilverBar, Jul 3) — the seal was the one place they still wore gold.
    var silverSeal: Bool = false
    private var sealTint: Color { silverSeal ? GaryColors.silver : GaryColors.gold }
    var footnote: String? = nil
    /// True inside MembersWrap — the face stretches to cover whatever it seals
    /// (a stacked prop group runs taller than one card).
    var fillsContainer: Bool = false

    /// The two stacked display lines — away over home in the pick states
    /// ("TWINS" / "YANKEES"), state words when there's no matchup yet.
    private var stack: (top: String, bottom: String) {
        if let tease, tease.contains(" @ ") {
            let sides = tease.components(separatedBy: " @ ")
            return (sides[0].uppercased(), sides[1].uppercased())
        }
        switch state {
        case .pickIn:      return ("THE PICK", "IS IN")
        case .coming:      return ("TONIGHT'S", "\(leagueTag ?? "GARY") PICK")
        case .placeholder: return ("TODAY'S CARD", "COMING SOON")
        }
    }
    private var kickerLine: String? {
        switch state {
        case .pickIn:  return kicker ?? "GARY'S PICK IS IN"
        // Founder, Jul 6: the pre-post seal needs to say it plainly, not
        // just imply it via the note line.
        case .coming:  return "COMING SOON"
        case .placeholder: return nil
        }
    }
    /// Sport-correct start-of-game word — FIRST PITCH is baseball-only.
    private var startWord: String {
        switch leagueTag ?? "" {
        case "MLB":            return "FIRST PITCH"
        case "WC", "NFL", "NCAAF": return "KICKOFF"
        case "NBA", "NCAAB":   return "TIP-OFF"
        case "NHL":            return "PUCK DROP"
        default:               return "STARTS"
        }
    }
    private var noteLine: String? {
        switch state {
        case .pickIn:             return nil
        case .coming(let n):      return n
        case .placeholder(let n): return n
        }
    }
    /// .pickIn's right side only carries the clock + TAP TO REVEAL — narrower
    /// than COMING SOON's two-line stack, so its seam sits further left
    /// (restores the pre-Jul-13 position) instead of crossing the words.
    private var seamX: (top: CGFloat, bottom: CGFloat) {
        switch state {
        case .pickIn:                return (0.62, 0.44)
        case .coming, .placeholder:  return (0.74, 0.56)
        }
    }
    var body: some View {
        VStack(spacing: 0) {
            // Eyebrow — membership left, league right.
            HStack {
                Text("MEMBERS ONLY")
                    .font(GaryFonts.accent(12)).tracking(1.0)
                    .foregroundStyle(sealTint.opacity(0.85))
                Spacer()
                if let leagueTag {
                    Text(leagueTag)
                        .font(GaryFonts.mono(11.5, bold: true)).tracking(1.6)
                        .foregroundStyle(.white.opacity(0.72))
                }
            }
            Spacer(minLength: 10)
            HStack(alignment: .center, spacing: 12) {
                // The face-off stack: away white over home gold — the two
                // sides of the diagonal, Gary's gold hinting he took one.
                VStack(alignment: .leading, spacing: 2) {
                    Text(stack.top)
                        .font(GaryFonts.display(38))
                        .foregroundStyle(.white)
                        .lineLimit(1).minimumScaleFactor(0.55)
                    Text(stack.bottom)
                        .font(GaryFonts.display(38))
                        .foregroundStyle(sealTint)
                        .lineLimit(1).minimumScaleFactor(0.55)
                    if let kickerLine {
                        Text(kickerLine)
                            .font(GaryFonts.mono(9, bold: true)).tracking(1.8)
                            .foregroundStyle(GaryColors.lightGold)
                            .lineLimit(1).minimumScaleFactor(0.7)
                            .padding(.top, 5)
                    }
                }
                Spacer(minLength: 8)
                // R1 "The Plain Call" (founder-picked off reveal-affordance-25,
                // Jul 6 — R10's footer rail was MY unrequested pick, not his):
                // no container at all, just light-gold mono words + a chevron,
                // sitting under the clock the way the mock draws it.
                if case .pickIn(let fp) = state {
                    VStack(alignment: .trailing, spacing: 6) {
                        if let fp {
                            VStack(alignment: .trailing, spacing: 1) {
                                Text(startWord)
                                    .font(GaryFonts.mono(9.5, bold: true)).tracking(1.2)
                                    .foregroundStyle(.white.opacity(0.78))
                                Text(fp)
                                    .font(GaryFonts.mono(11, bold: true)).tracking(1)
                                    .foregroundStyle(.white.opacity(0.9))
                            }
                        }
                        Text("TAP TO REVEAL ›")
                            .font(GaryFonts.mono(10.5, bold: true)).tracking(1.4)
                            .foregroundStyle(GaryColors.lightGold)
                            .lineLimit(1)
                    }
                }
            }
            Spacer(minLength: 10)
            // The when-line rides the card's bottom edge (founder, Jul 7 —
            // lowering it bought the eyebrow + note their bigger type).
            if let noteLine {
                Text(noteLine)
                    .font(GaryFonts.mono(11.5, bold: true)).tracking(1.2)
                    .foregroundStyle(GaryColors.warmWhite.opacity(0.58))
                    .lineLimit(1).minimumScaleFactor(0.75)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            if let footnote {
                Text(footnote)
                    .font(GaryFonts.mono(10, bold: false)).tracking(2)
                    .foregroundStyle(.white.opacity(0.62))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 4)
            }
        }
        .padding(.horizontal, 18).padding(.vertical, 13)
        .frame(maxWidth: .infinity)
        .frame(height: fillsContainer ? nil : CompactPickRow.uniformHeight)
        .frame(maxHeight: fillsContainer ? .infinity : nil)
        .background(
            // W17 — the split diagonal: two warm tones, gold seam between the
            // sides. The card is the matchup; the seam is Gary in the middle.
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color(hex: "#14110D"))
                .overlay(SealDiagonalShape(topX: seamX.top, bottomX: seamX.bottom).fill(Color(hex: "#2B2620")))
                .overlay(
                    SealSeamShape(topX: seamX.top, bottomX: seamX.bottom).stroke(
                        LinearGradient(colors: [sealTint.opacity(0), sealTint, sealTint.opacity(0)],
                                       startPoint: .top, endPoint: .bottom),
                        lineWidth: 1.5)
                )
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .stroke(sealTint.opacity(silverSeal ? 0.30 : 0.45), lineWidth: 1)
                )
                .overlay(alignment: .top) {
                    // Lit-from-above highlight — the lift cue.
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .stroke(.white.opacity(0.16), lineWidth: 1)
                        .mask(LinearGradient(colors: [.white, .clear], startPoint: .top, endPoint: .center))
                }
                // Deep two-layer lift (founder, Jul 22: "lifted off the
                // background significantly") — was invisible anyway while the
                // shelf rails clipped it; the rails are .unclippedRail() now.
                .shadow(color: .black.opacity(0.7), radius: 26, y: 12)
                .shadow(color: .black.opacity(0.4), radius: 4, y: 2)
        )
    }
}

/// The lit side of the W17 seal — covers the top-left, leaning 25° right.
/// `topX`/`bottomX` default to the COMING SOON-width position (founder Jul
/// 13); callers with narrower right-side content (e.g. TAP TO REVEAL) pass a
/// more-left pair so their own text doesn't cross the seam.
struct SealDiagonalShape: Shape {
    var topX: CGFloat = 0.74
    var bottomX: CGFloat = 0.56
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: .zero)
        p.addLine(to: CGPoint(x: rect.width * topX, y: 0))
        p.addLine(to: CGPoint(x: rect.width * bottomX, y: rect.height))
        p.addLine(to: CGPoint(x: 0, y: rect.height))
        p.closeSubpath()
        return p
    }
}

/// The gold seam along the W17 split.
struct SealSeamShape: Shape {
    var topX: CGFloat = 0.74
    var bottomX: CGFloat = 0.56
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.width * topX, y: 0))
        p.addLine(to: CGPoint(x: rect.width * bottomX, y: rect.height))
        return p
    }
}

/// Seals any entitled Winners card until its owner opens it. Tap → heavy haptic
/// + 3D flip into the real card. Auto-open when already revealed or once the
/// game has started (a live/settled card is never gated behind a wrapper).
struct MembersWrap<Content: View>: View {
    let revealId: String
    var commence: Date? = nil
    /// Short matchup for the seal's gift tag ("Twins @ Yankees").
    var tease: String? = nil
    /// League chip for the seal's eyebrow ("MLB").
    var league: String? = nil
    /// Kicker override ("GARY'S PROP PICKS ARE IN").
    var sealKicker: String? = nil
    /// Sealed footprint override — a stacked prop group seals at ONE card's
    /// height instead of the whole stack (the double-tall seal read wrong,
    /// founder Jul 5), then grows to the real stack on reveal.
    var sealedHeight: CGFloat? = nil
    /// Props seal in SILVER (founder, Aug 4) — see MembersOnlyCardFace.
    var silverSeal: Bool = false

    /// "12:30 PM" (ET) — the seal names first pitch instead of ticking at it.
    static func pitchClock(_ d: Date) -> String {
        let f = DateFormatter()
        f.timeZone = TimeZone(identifier: "America/New_York")
        f.dateFormat = "h:mm a"
        return f.string(from: d)
    }
    @ViewBuilder var content: () -> Content
    @State private var revealed: Bool

    init(revealId: String, commence: Date? = nil, tease: String? = nil,
         league: String? = nil, sealKicker: String? = nil, sealedHeight: CGFloat? = nil,
         silverSeal: Bool = false,
         @ViewBuilder content: @escaping () -> Content) {
        self.revealId = revealId
        self.commence = commence
        self.tease = tease
        self.league = league
        self.sealKicker = sealKicker
        self.sealedHeight = sealedHeight
        self.silverSeal = silverSeal
        self.content = content
        let started = commence.map { $0 <= Date() } ?? true
        _revealed = State(initialValue: RevealedPicks.isRevealed(revealId) || started)
    }

    @State private var opening = false
    @State private var flashOn = false
    @State private var burstOn = false

    var body: some View {
        // The face rides as an OVERLAY of the content, never a ZStack sibling
        // (founder, Aug 19 round two: the invisible face kept its intrinsic
        // height in the slot after reveal, so revealed cards floated ~20pt
        // low in the rail). The CARD alone drives layout in both states —
        // the cover is literally the same size as the pick behind it.
        content()
            .opacity(revealed ? 1 : 0)
            .allowsHitTesting(revealed)
            .rotation3DEffect(.degrees(180), axis: (x: 0, y: 1, z: 0))
            .overlay {
                MembersOnlyCardFace(state: .pickIn(firstPitch: commence.map { Self.pitchClock($0) }),
                                    tease: tease, leagueTag: league, kicker: sealKicker,
                                    silverSeal: silverSeal,
                                    fillsContainer: true)
                    .opacity(revealed ? 0 : 1)
                    .allowsHitTesting(!revealed)
            }
        // Prop stacks still seal at ONE card's height (sealedHeight), then
        // grow to the real stack on reveal.
        .frame(height: revealed ? nil : sealedHeight)
        .rotation3DEffect(.degrees(revealed ? 180 : 0), axis: (x: 0, y: 1, z: 0), perspective: 0.55)
        .animation(.spring(response: 0.7, dampingFraction: 0.8), value: revealed)
        // In-place reveal FX (founder call, Jul 3: on the page, never a popup).
        // The flash clips to the card; the sparks fly past its edges (CALayer
        // doesn't clip) so the moment breathes without leaving the rail.
        .overlay {
            if flashOn {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(RadialGradient(colors: [Color(hex: "#F7E7AE").opacity(0.95),
                                                  Color(hex: "#F7E7AE").opacity(0)],
                                         center: .center, startRadius: 0, endRadius: 280))
                    .allowsHitTesting(false)
            }
        }
        .overlay {
            if burstOn {
                GeometryReader { geo in
                    SparkBurstView(center: CGPoint(x: geo.size.width / 2, y: geo.size.height / 2))
                }
                .allowsHitTesting(false)
            }
        }
        .scaleEffect(opening ? 1.03 : 1)
        .contentShape(Rectangle())
        .onTapGesture { openInPlace() }
        .onGaryTour { verb, _ in
            if verb == "reveal", !revealed, GaryTour.claimReveal() { openInPlace() }
            if verb == "reseal" { opening = false; revealed = false }
        }
    }

    /// The six beats compressed into the card's own slot: anticipation pinch →
    /// heavy rip haptic + gold flash → spark burst past the card edges → the
    /// 3D flip lands the gold → success haptic. ~1.2s, no modal anywhere.
    private func openInPlace() {
        guard !revealed, !opening else { return }
        opening = true
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        withAnimation(.spring(response: 0.26, dampingFraction: 0.55)) { opening = true }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.30) {
            UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
            withAnimation(.easeOut(duration: 0.10)) { flashOn = true }
            burstOn = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.13) {
                withAnimation(.easeOut(duration: 0.30)) { flashOn = false }
                RevealedPicks.markRevealed(revealId)
                revealed = true
                UINotificationFeedbackGenerator().notificationOccurred(.success)
                withAnimation(.spring(response: 0.35, dampingFraction: 0.7)) { opening = false }
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.8) { burstOn = false }
        }
    }
}

// MARK: - Reveal Ceremony (Jul 3 2026) — the production pack opening
//
// The six beats every FUT-class reveal runs: anticipation (pack pulses under a
// ray field) → interaction (HOLD to tear, haptic ticks) → flash frame (hides
// the pack→card swap) → particle burst (CAEmitterLayer sparks + confetti) →
// the card entering under a specular sweep → land. All native — no engine,
// no dependencies.


/// One-shot GPU particle burst — gold sparks + bar-palette confetti with
/// real gravity, emitted for ~0.2s then left to die out.
struct SparkBurstView: UIViewRepresentable {
    var center: CGPoint
    func makeUIView(context: Context) -> UIView {
        let v = UIView()
        v.isUserInteractionEnabled = false
        let e = CAEmitterLayer()
        e.emitterPosition = center
        e.emitterShape = .point
        e.renderMode = .additive

        func img(_ color: UIColor, w: CGFloat, h: CGFloat, corner: CGFloat) -> CGImage? {
            UIGraphicsImageRenderer(size: CGSize(width: w, height: h)).image { _ in
                color.setFill()
                UIBezierPath(roundedRect: CGRect(x: 0, y: 0, width: w, height: h), cornerRadius: corner).fill()
            }.cgImage
        }
        func cell(_ image: CGImage?, birth: Float, life: Float, v0: CGFloat, vr: CGFloat,
                  scale: CGFloat, spin: CGFloat, yAccel: CGFloat) -> CAEmitterCell {
            let c = CAEmitterCell()
            c.contents = image
            c.birthRate = birth
            c.lifetime = life
            c.velocity = v0
            c.velocityRange = vr
            c.emissionRange = .pi * 2
            c.scale = scale
            c.scaleRange = scale * 0.5
            c.spin = spin
            c.spinRange = spin
            c.yAcceleration = yAccel
            c.alphaSpeed = -0.85
            return c
        }
        let spark = img(UIColor(red: 0.95, green: 0.86, blue: 0.49, alpha: 1), w: 4, h: 4, corner: 2)
        let ember = img(UIColor(red: 0.91, green: 0.79, blue: 0.36, alpha: 1), w: 6, h: 6, corner: 3)
        let confettiGold = img(UIColor(red: 0.79, green: 0.64, blue: 0.15, alpha: 1), w: 6, h: 10, corner: 2)
        let confettiInk = img(UIColor(red: 0.23, green: 0.17, blue: 0.02, alpha: 1), w: 5, h: 9, corner: 2)
        e.emitterCells = [
            cell(spark, birth: 650, life: 0.9, v0: 430, vr: 220, scale: 0.9, spin: 4, yAccel: 280),
            cell(ember, birth: 240, life: 1.3, v0: 320, vr: 160, scale: 1.0, spin: 6, yAccel: 360),
            cell(confettiGold, birth: 90, life: 2.2, v0: 250, vr: 140, scale: 1.0, spin: 8, yAccel: 430),
            cell(confettiInk, birth: 70, life: 2.2, v0: 230, vr: 120, scale: 1.0, spin: 8, yAccel: 430)
        ]
        v.layer.addSublayer(e)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.22) { e.birthRate = 0 }
        return v
    }
    func updateUIView(_ uiView: UIView, context: Context) {}
}


/// Clip helpers for the crimp caps (round only the pack's outer corners).
struct RoundedCorners22Top: Shape {
    func path(in rect: CGRect) -> Path {
        Path(UIBezierPath(roundedRect: rect,
                          byRoundingCorners: [.topLeft, .topRight],
                          cornerRadii: CGSize(width: 22, height: 22)).cgPath)
    }
}
struct RoundedCorners22Bottom: Shape {
    func path(in rect: CGRect) -> Path {
        Path(UIBezierPath(roundedRect: rect,
                          byRoundingCorners: [.bottomLeft, .bottomRight],
                          cornerRadii: CGSize(width: 22, height: 22)).cgPath)
    }
}
struct Triangle: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: 0, y: rect.midY - rect.height / 2))
        p.addLine(to: CGPoint(x: rect.width, y: rect.midY))
        p.addLine(to: CGPoint(x: 0, y: rect.midY + rect.height / 2))
        p.closeSubpath()
        return p
    }
}


/// The locked state for NON-entitled users — same members language, ZERO pick
/// data in the view tree. Tapping opens the plans sheet on this sport.
struct LockedPickCard: View {
    let league: String
    var onUnlock: () -> Void

    var body: some View {
        Button(action: onUnlock) {
            VStack(spacing: 0) {
                HStack {
                    Text("MEMBERS ONLY")
                        .font(GaryFonts.accent(12)).tracking(1.0)
                        .foregroundStyle(GaryColors.gold.opacity(0.85))
                    Spacer()
                    Text(league.uppercased())
                        .font(GaryFonts.mono(9.5, bold: true)).tracking(2)
                        .foregroundStyle(.white.opacity(0.66))
                }
                Spacer(minLength: 10)
                HStack(alignment: .center, spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(league.uppercased()) PICKS")
                            .font(GaryFonts.display(38))
                            .foregroundStyle(.white)
                            .lineLimit(1).minimumScaleFactor(0.55)
                        Text("ARE IN")
                            .font(GaryFonts.display(38))
                            .foregroundStyle(GaryColors.gold)
                            .lineLimit(1).minimumScaleFactor(0.55)
                        Text("GARY'S BOARD FOR TONIGHT")
                            .font(GaryFonts.mono(9, bold: true)).tracking(1.8)
                            .foregroundStyle(GaryColors.lightGold)
                            .padding(.top, 5)
                    }
                    Spacer(minLength: 8)
                    // R1 "The Plain Call" — same words-only reveal cue as the
                    // members seal, no container.
                    Text("UNLOCK ›")
                        .font(GaryFonts.mono(10.5, bold: true)).tracking(1.4)
                        .foregroundStyle(GaryColors.lightGold)
                        .lineLimit(1)
                }
                Spacer(minLength: 10)
            }
            .padding(.horizontal, 18).padding(.vertical, 13)
            .frame(maxWidth: .infinity)
            .frame(height: CompactPickRow.uniformHeight)
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(Color(hex: "#14110D"))
                    .overlay(SealDiagonalShape().fill(Color(hex: "#2B2620")))
                    .overlay(
                        SealSeamShape().stroke(
                            LinearGradient(colors: [GaryColors.gold.opacity(0), GaryColors.gold, GaryColors.gold.opacity(0)],
                                           startPoint: .top, endPoint: .bottom),
                            lineWidth: 1.5)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .stroke(GaryColors.gold.opacity(0.45), lineWidth: 1)
                    )
                    .overlay(alignment: .top) {
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .stroke(.white.opacity(0.16), lineWidth: 1)
                            .mask(LinearGradient(colors: [.white, .clear], startPoint: .top, endPoint: .center))
                    }
                    .shadow(color: .black.opacity(0.55), radius: 20, y: 10)
                    .shadow(color: .black.opacity(0.35), radius: 3, y: 2)
            )
            .contentShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

/// The locked LOST physics for the gold bar: a hairline fracture with a branch.
/// Authored on the 346×232 mock, scaled to whatever the card measures.
struct CrackShape: Shape {
    func path(in rect: CGRect) -> Path {
        // Single jagged fracture, top to bottom — no fork (founder call, Jul 4:
        // the branch off the main line, even fixed, wasn't wanted at all).
        let main: [(CGFloat, CGFloat)] = [(252, 0), (240, 38), (258, 72), (234, 116), (250, 158), (230, 200), (240, 232)]
        func pt(_ p: (CGFloat, CGFloat)) -> CGPoint {
            CGPoint(x: p.0 / 346 * rect.width, y: p.1 / 232 * rect.height)
        }
        var path = Path()
        path.move(to: pt(main[0]))
        for p in main.dropFirst() { path.addLine(to: pt(p)) }
        return path
    }
}

/// One-shot confetti in the bar's own palette (cream/ink/warm gold) — plays
/// when a fresh gold win first appears; the parent removes it after ~3.5s.
struct GoldConfettiBurst: View {
    private struct Piece: Identifiable {
        let id: Int
        let x: CGFloat, w: CGFloat, h: CGFloat
        let color: Color
        let delay: Double, duration: Double, spin: Double
    }
    @State private var animate = false
    private let pieces: [Piece] = {
        let colors = [Color(hex: "#FFFCEB"), Color(hex: "#3A2C04"), Color(hex: "#F4E4BA"), Color(hex: "#96781A")]
        return (0..<10).map { i in
            Piece(id: i,
                  x: CGFloat.random(in: 0.05...0.95),
                  w: CGFloat.random(in: 5...8), h: CGFloat.random(in: 8...12),
                  color: colors[i % colors.count],
                  delay: Double.random(in: 0...0.7),
                  duration: Double.random(in: 2.0...2.9),
                  spin: Double.random(in: 360...720))
        }
    }()

    var body: some View {
        GeometryReader { geo in
            ForEach(pieces) { p in
                RoundedRectangle(cornerRadius: 2)
                    .fill(p.color.opacity(0.9))
                    .frame(width: p.w, height: p.h)
                    .rotationEffect(.degrees(animate ? p.spin : 0))
                    .position(x: p.x * geo.size.width, y: animate ? geo.size.height + 20 : -20)
                    .animation(.linear(duration: p.duration).delay(p.delay), value: animate)
            }
        }
        .allowsHitTesting(false)
        .onAppear { animate = true }
    }
}

struct CompactPickRow: View {
    let pick: GaryPick
    var gameResult: String? = nil
    var finalScore: String? = nil   // settled cards: shown in place of GARY'S LEAN
    var showSportBadge: Bool = false
    /// Game pages carry the score in the page hero (LiveScoreStrip), so their
    /// cards keep the plain start time in the slot. Everywhere else stays state-aware.
    var liveInSlot: Bool = true
    /// Exact daily-slate mirror used while live_scores catches up. Game pages
    /// supply this only from the same league + provider game id.
    var interruptionLabel: String? = nil
    /// Billfold's recent picks are static (no flip) — they hide the affordance.
    var showTakeAffordance: Bool = true
    /// Overrides the eyebrow label (e.g. "FREE PICK" on the Tonight page).
    var eyebrowOverride: String? = nil
    /// Winners keeps the start time visible even on settled cards (it sorts by start time).
    var alwaysShowStartTime: Bool = false
    /// When set, the card renders at this EXACT height so every pick card in a
    /// rail/list is the same size regardless of headline length or footer (the
    /// flip-card wrappers pass it; Billfold/share leave it nil for natural size).
    var fixedHeight: CGFloat? = nil
    /// App-wide uniform headline-card height — game and prop cards share it.
    static let uniformHeight: CGFloat = 232
    /// 21B-S (Jul 2 2026): entitled Winners game cards render as the poured-gold
    /// bar with dark ink type. Geometry identical — finish and palette only.
    var premiumFinish: Bool = false
    /// Winners slot cue — the wordless edge rail. nil everywhere but the
    /// curated Winners shelves.
    var winnersSlot: WinnersSlot? = nil

    /// System review prompt — fired once per app version right after a pick CASHES (see ReviewPrompt).
    @Environment(\.requestReview) private var requestReview

    private var sport: Sport { Sport.from(league: pick.league) }
    private var accentColor: Color { sport.accentColor }
    /// Accent for the odds chip in the meta line — MLB reads on its grass green,
    /// every other sport on its own accent.
    private var metaAccent: Color { (sport == .mlb || sport == .mlbHR) ? GaryColors.mlbGrass : accentColor }
    private var accentGradient: LinearGradient {
        sport.accentGradient
            ?? LinearGradient(colors: [accentColor, accentColor], startPoint: .leading, endPoint: .trailing)
    }
    private var hasCustomGradient: Bool { sport.accentGradient != nil }

    // 21B-S palette switches — every tint the card paints resolves through these,
    // so the gold finish is dark-ink everywhere without per-line ternaries.
    private var eyebrowTint: Color { premiumFinish ? GoldBar.inkSoft : GaryColors.gold }
    private var heroTint: Color { premiumFinish ? GoldBar.inkHero : .white }
    private var leagueTint: Color { premiumFinish ? GoldBar.inkStrong : metaAccent }
    /// Team name reads gold (founder call, Jul 4).
    private var metaBodyTint: Color { premiumFinish ? GoldBar.inkBody : GaryColors.gold }
    private var metaDotTint: Color { premiumFinish ? GoldBar.inkBody.opacity(0.7) : .white.opacity(0.4) }
    private var oddsTint: Color { premiumFinish ? GoldBar.inkStrong : GaryColors.gold }
    private var footerTint: Color { premiumFinish ? GoldBar.inkSoft : GaryColors.gold }
    private var dividerTint: Color { premiumFinish ? GoldBar.inkStrong.opacity(0.35) : .white.opacity(0.12) }
    private var shareTint: Color { premiumFinish ? GoldBar.inkSoft.opacity(0.8) : .white.opacity(0.5) }
    private var chevronTint: Color { premiumFinish ? GoldBar.inkStrong.opacity(0.7) : GaryColors.heroAccent.opacity(0.7) }

    // D3 verdict system (Jul 3 2026, user-locked): dark cards drop the diagonal
    // stamp. Wins celebrate — full brightness, giant green ghost ✓ behind the
    // content, green footer verdict. Losses recede — content dims to ~40%, a
    // whisper-faint ✕ behind, lostTint footer verdict at full strength. The
    // stamp survives only on the gold bar (its treatment is still being picked).
    private var isGoldLost: Bool { premiumFinish && displayResult == "lost" }
    private var isGoldWon: Bool { premiumFinish && displayResult == "won" }
    /// Premium type scale (founder call, Jul 3): EVERYTHING on the gold bar
    /// reads ~15% larger — the paid card is the most legible object in the app.
    private var pf: CGFloat { premiumFinish ? 1.15 : 1 }
    /// No-op (founder call, Jul 4): the free Picks-page card no longer dims a
    /// loss at all — full brightness, the ✕ ghost still tells the story. The
    /// Winners metal keeps ITS loss treatment entirely separately (whole-bar
    /// saturation/brightness + the hero-specific dim on isGoldLost).
    private func d3Dim(_ lostOpacity: Double) -> Double { 1 }
    /// Struck-green — the win color that belongs on gold (traffic-green vanishes).
    private static let goldWinGreen = Color(hex: "#1E6B33")
    /// Footer verdict color on settled cards: win green / lostTint / push gold —
    /// with gold-dialect values on the premium bar.
    private var settledFooterTint: Color {
        guard let v = displayResult else { return footerTint }
        switch v {
        case "won": return premiumFinish ? Self.goldWinGreen : GaryColors.win
        case "lost": return premiumFinish ? GoldBar.lost : GaryColors.lostTint
        default: return premiumFinish ? GoldBar.inkSoft : GaryColors.gold
        }
    }
    /// "FINAL · CIN 7 · MIL 2" → "✓ CASHED · CIN 7 · MIL 2" on settled cards —
    /// with no stamp anywhere, the footer line IS the verdict.
    private func verdictFooterLine(_ line: String) -> String {
        guard let v = displayResult else { return line }
        // The gold bar's corner already carries the big struck check on a win —
        // its footer says CASHED without repeating the mark.
        let word = v == "won" ? (premiumFinish ? AppFlags.wonStamp : "✓ \(AppFlags.wonStamp)") : (v == "push" ? "PUSH" : "LOST")
        if line.hasPrefix("FINAL · ") { return word + " · " + line.dropFirst("FINAL · ".count) }
        if line == "FINAL" { return word }
        return line
    }

    // X1+X4 win moment (Jul 3 2026, user-locked): struck green check + the
    // payout counting up in the eyebrow row's right corner, one-shot confetti
    // for FRESH wins. LOST = hairline crack + whole-bar dim (locked earlier).
    @State private var shownPayout: Int = 0
    @State private var showConfetti = false
    /// Profit on a $100 stake from the American odds ("+172" → 172, "-125" → 80).
    private var payoutPer100: Int? {
        let raw = pickParts.odds
            .replacingOccurrences(of: "+", with: "")
            .replacingOccurrences(of: "−", with: "-")
            .trimmingCharacters(in: .whitespaces)
        guard let v = Int(raw), v != 0 else { return nil }
        return v > 0 ? v : Int((10000.0 / Double(abs(v))).rounded())
    }
    /// Fresh = the game started within the last 24h — old wins browsed later
    /// show the settled state without re-celebrating.
    private var isFreshWin: Bool {
        guard let iso = pick.commence_time, let d = parseISO8601(iso) else { return false }
        return Date().timeIntervalSince(d) < 86_400
    }
    private func runWinMoment() {
        let target = payoutPer100 ?? 0
        if isFreshWin && !CelebratedWins.contains(pick.id) {
            CelebratedWins.mark(pick.id)
            showConfetti = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 3.5) { showConfetti = false }
            shownPayout = 0
            Task { @MainActor in
                guard target > 0 else { return }
                for i in 1...30 {
                    try? await Task.sleep(nanoseconds: 30_000_000)
                    shownPayout = Int(Double(target) * Double(i) / 30.0)
                }
                shownPayout = target
            }
        } else {
            shownPayout = target
        }
    }

    private var awayName: String { Formatters.shortTeamName(pick.awayTeam, league: pick.league) }
    private var homeName: String { Formatters.shortTeamName(pick.homeTeam, league: pick.league) }
    private var isNCAAB: Bool { (pick.league ?? "").uppercased() == "NCAAB" }
    private var isNCAAF: Bool { (pick.league ?? "").uppercased() == "NCAAF" }
    private var isCFP: Bool { pick.isCFP }
    private var pickParts: (pick: String, odds: String) { pick.formattedPickParts }

    /// Either side's abbreviation for the compact meta row (long-tag cards).
    /// NCAAF prefers the pick's own stored abbreviations; every other league
    /// resolves through the shared keyword maps.
    private func metaTeamAbbrev(homeSide: Bool) -> String {
        if (pick.league ?? "").uppercased() == "NCAAF" {
            let stored = homeSide ? pick.homeTeamAbbreviation : pick.awayTeamAbbreviation
            if let value = stored?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty {
                return value.uppercased()
            }
        }
        return teamAbbrevFromName(homeSide ? homeName : awayName, league: pick.league)
    }

    /// Picked team's standard abbreviation (PHI, NYK, VGK, ...) via the league
    /// keyword maps, with a mascot-initials fallback for other leagues.
    private func teamAbbrev(_ shortName: String) -> String {
        let lower = shortName.lowercased()
        let lg = (pick.league ?? "").uppercased()
        if lg == "NCAAF" {
            let stored = homeIsPicked ? pick.homeTeamAbbreviation : pick.awayTeamAbbreviation
            if let value = stored?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty {
                return value.uppercased()
            }
            return shortName.uppercased()
        }
        let maps: [[String: [String]]] = lg == "NBA" ? [nbaTeamKeywords]
            : lg == "MLB" ? [mlbTeamKeywords]
            : lg == "NHL" ? [nhlTeamKeywords]
            : lg == "NFL" || lg == "NFL TDS" ? [nflTeamKeywords]
            : lg == "WC" ? [wcTeamKeywords]
            : [mlbTeamKeywords, nbaTeamKeywords, nhlTeamKeywords, nflTeamKeywords, wcTeamKeywords]
        for map in maps {
            for (abbr, kws) in map where kws.contains(where: { lower.contains($0) }) { return abbr }
        }
        let last = lower.split(separator: " ").last.map(String.init) ?? lower
        return String(last.prefix(3)).uppercased()
    }
    /// The pick with the team name collapsed to its abbreviation (e.g. "PHI ML",
    /// "VGK ML"). The pick text may carry the full name, the short name, or a
    /// display-truncated fragment ("Vegas Golden ML", "Columbus ML", "Red Wings
    /// ML") — so strip the LEADING RUN of team-name words and put the standard
    /// abbreviation in its place; no fragment can survive.
    private var compactPick: String {
        let raw = pickParts.pick
        guard homeIsPicked || awayIsPicked else { return raw.uppercased() }
        let pickedFull = homeIsPicked ? (pick.homeTeam ?? "") : (pick.awayTeam ?? "")
        let pickedShort = homeIsPicked ? homeName : awayName
        let abbrev = teamAbbrev(pickedShort.isEmpty ? pickedFull : pickedShort)
        var teamWords = Set(pickedFull.lowercased().split(separator: " ").map(String.init))
        teamWords.formUnion(pickedShort.lowercased().split(separator: " ").map(String.init))
        var words = raw.split(separator: " ").map(String.init)
        var lead = 0
        while lead < words.count, teamWords.contains(words[lead].lowercased()) { lead += 1 }
        guard lead > 0 else { return raw.uppercased() }
        words.removeFirst(lead)
        return ([abbrev] + words).joined(separator: " ").uppercased()
    }

    private var confidenceValue: CGFloat {
        CGFloat(max(0.18, min(1.0, pick.confidence ?? 0.72)))
    }
    private var interruptionOverride: String? {
        guard let value = interruptionLabel?.trimmingCharacters(in: .whitespacesAndNewlines),
              !value.isEmpty else { return nil }
        return value.uppercased()
    }
    private var resolvedResult: String? {
        // The exact slate row may see the interruption before live_scores. It
        // must suppress a stale matchup-keyed grade during that short window.
        if interruptionOverride != nil { return nil }
        // Doubleheader guard: gameResult is MATCHUP-keyed, so a pick whose game shares a matchup
        // with another (a doubleheader) can borrow the OTHER game's graded result. If THIS pick's
        // own game (by game_id) is still live, suppress it so the card shows live, not a false FINAL.
        if let gid = pick.game_id,
           let status = liveCache.status(forGameId: gid, league: pick.league),
           status.isLive || status.isInterrupted { return nil }
        guard let result = gameResult?.lowercased(), !result.isEmpty else { return nil }
        return result
    }
    private var resultStampColor: Color {
        switch displayResult {
        case "won": return Color(hex: "#3FB950")
        case "push": return GaryColors.gold
        case "lost": return Color(hex: "#E5484D")
        default: return Color(hex: "#E5484D")
        }
    }

    private var significanceTag: String? {
        // Skip generic defaults — only show meaningful game significance
        let genericLabels = ["regular season", "conference play", "regular season game"]
        if let cleaned = pick.shortGameSignificance, cleaned.count < 32 {
            if !genericLabels.contains(cleaned.lowercased()) {
                return cleaned.uppercased()
            }
        }
        if let cleaned = pick.shortTournamentContext, cleaned.count < 28 {
            if !genericLabels.contains(cleaned.lowercased()) {
                return cleaned.uppercased()
            }
        }
        // Regular games just say the sport ("MLB") — the tag only earns words
        // when the game is special (playoffs, finals, tournament rounds).
        return (pick.league ?? "").uppercased()
    }

    private var formattedTime: String {
        guard let time = pick.displayTime else { return "" }
        return Formatters.formatCommenceTime(time)
    }

    /// Live/final state for THIS matchup (shared cache; nil when scheduled
    /// or unknown). Only consulted when the card has no settled result.
    @ObservedObject private var liveCache = LiveScoreCache.shared
    /// One-tap share from the card FRONT — renders the Stack Row share card
    /// (story + square) and presents the system sheet.
    @State private var shareItem: PickShareItem? = nil
    @State private var showPickInfo = false
    private var liveStatus: LiveScore? {
        guard liveInSlot, resolvedResult == nil else { return nil }
        if let gameId = pick.game_id {
            return liveCache.status(forGameId: gameId, league: pick.league)
        }
        let legacy = liveCache.status(forMatchup: "\(pick.awayTeam ?? "") @ \(pick.homeTeam ?? "")")
        return legacy?.isInterrupted == true ? nil : legacy
    }

    /// FINAL board for this matchup with no stored grade yet — feeds the
    /// client-side verdict so results land the moment the game ends, not the
    /// next morning. Deliberately ignores liveInSlot: a verdict is the card's
    /// business everywhere, score-in-slot chrome is not.
    private var liveFinal: LiveScore? {
        guard resolvedResult == nil else { return nil }
        let ls: LiveScore?
        if let gameId = pick.game_id {
            ls = liveCache.status(forGameId: gameId, league: pick.league)
        } else {
            let legacy = liveCache.status(forMatchup: "\(pick.awayTeam ?? "") @ \(pick.homeTeam ?? "")")
            ls = legacy?.isInterrupted == true ? nil : legacy
        }
        return (ls?.isFinal == true) ? ls : nil
    }
    private var liveGraded: String? {
        guard let ls = liveFinal,
              let s = orientedFinalScores(ls, awayTeam: pick.awayTeam, homeTeam: pick.homeTeam) else { return nil }
        return liveGradeGamePick(pickText: pickParts.pick, betType: pick.type ?? "",
                                 awayPicked: awayIsPicked, homePicked: homeIsPicked,
                                 away: s.away, home: s.home)
    }
    /// True once this game's start time has passed — an UPCOMING game can't be graded.
    private var gameHasStarted: Bool {
        guard let iso = pick.commence_time, let d = parseISO8601(iso) else { return true }
        return d <= Date()
    }
    /// Stored grade first (authoritative); else the live verdict on a FINAL board.
    /// Gated on the game having STARTED: the result/score maps are matchup-keyed, so a
    /// REPEATED matchup (same teams the next day — e.g. Padres@Cubs today vs last night)
    /// would otherwise leak yesterday's LOST/FINAL onto today's not-yet-played game.
    private var displayResult: String? {
        guard gameHasStarted else { return nil }
        return resolvedResult ?? liveGraded
    }

    private static let bookDisplayNames: [String: String] = [
        "draftkings": "DraftKings",
        "fanduel": "FanDuel",
        "betmgm": "BetMGM",
        "betrivers": "BetRivers",
        "caesars": "Caesars",
        "fanatics": "Fanatics",
        "pointsbet": "PointsBet",
        "bovada": "Bovada",
    ]

    private var bestBookName: String? {
        // STORE-SAFE BRIDGE: never name a sportsbook.
        guard !AppFlags.storeSafe, let books = pick.sportsbook_odds, let first = books.first, let name = first.book, !name.isEmpty else { return nil }
        return Self.bookDisplayNames[name.lowercased()] ?? name.prefix(1).uppercased() + name.dropFirst()
    }

    // Which side did Gary take? Match the pick string against the short team
    // names so the matchup hero can brighten the picked team. Falls back to
    // "neither bright" for totals (Over/Under) where no single team is backed.
    private var pickedSideLower: String {
        pickParts.pick.lowercased()
    }
    /// Short mascot first (the common case), then any distinctive word of the
    /// full name — display truncation can strip the mascot from the pick text
    /// ("Vegas Golden Knights ML" arrives as "Vegas Golden ML", "Columbus Blue
    /// Jackets ML" as "Columbus ML"), so the mascot alone isn't reliable.
    private func sideIsPicked(full: String?, short: String, otherFull: String?) -> Bool {
        let p = pickedSideLower
        if !short.isEmpty, p.contains(short.lowercased()) { return true }
        guard let full, !full.isEmpty else { return false }
        let otherWords = Set((otherFull ?? "").lowercased().split(separator: " ").map(String.init))
        return full.lowercased().split(separator: " ").map(String.init)
            .contains { $0.count >= 4 && !otherWords.contains($0) && p.contains($0) }
    }
    private var awayIsPicked: Bool {
        sideIsPicked(full: pick.awayTeam, short: awayName, otherFull: pick.homeTeam)
    }
    private var homeIsPicked: Bool {
        sideIsPicked(full: pick.homeTeam, short: homeName, otherFull: pick.awayTeam)
    }

    /// The number a college team wears next to its name: a playoff SEED when
    /// the game is a CFP game, otherwise its AP poll rank (founder, Sep 3
    /// 2026: "for the team names on the Pick cards we could just put the
    /// ranking next to the team"). Both ride the pick itself — NCAAF ranks are
    /// stamped on the game at pick time, so the number is the poll as it stood
    /// when Gary made the call. Unranked stays bare; nothing is guessed.
    private var awaySeedTag: String? {
        if isCFP, let s = pick.awaySeed { return "#\(s)" }
        if isNCAAB || isNCAAF, let r = pick.awayRanking { return "#\(r)" }
        return nil
    }
    private var homeSeedTag: String? {
        if isCFP, let s = pick.homeSeed { return "#\(s)" }
        if isNCAAB || isNCAAF, let r = pick.homeRanking { return "#\(r)" }
        return nil
    }
    private var isRankedMatchup: Bool { awaySeedTag != nil || homeSeedTag != nil }

    // MARK: Headline front (June 11 2026 — THE pick card design, everywhere)
    //
    // The approved share card ("09-headline-mlb-story") IS the in-app card:
    // gold eyebrow + bear, the pick as stacked display type, sport-accent
    // league token leading one meta line, share/tier/take footer. Settled
    // picks wear the diagonal CASHED/LOST stamp, same as the export.

    /// Always "GARY'S PICK" app-wide, unless a caller overrides it (the Tonight
    /// page passes "FREE PICK", so it needs no separate section label).
    private var eyebrowLabel: String {
        eyebrowOverride ?? "GARY'S PICK"
    }

    /// Noun for a totals card's second line, by league ("TOTAL RUNS" /
    /// "TOTAL GOALS" / "TOTAL POINTS") so totals carry the same two-line shape
    /// as side picks — every card then measures to one uniform height.
    private var totalNoun: String {
        switch (pick.league ?? "").uppercased() {
        case "MLB": return "RUNS"
        case "NHL", "WC", "EPL": return "GOALS"
        default: return "POINTS"
        }
    }

    /// Hero: the picked team's short name over the bet ("NATIONALS" /
    /// "MONEYLINE", "KNICKS" / "+6.5"). Totals get a matching two-line shape
    /// ("UNDER 3.5" / "TOTAL GOALS") so every card reads at one uniform height.
    private var heroLines: String {
        // Specials ("Schwarber to win the Derby +330") carry a phrase, not
        // team+market grammar — the truncating pick parser cuts them to the
        // first word. Split name / claim by hand: name huge, claim under it.
        if (pick.type ?? "") == "special" {
            var w = (pick.pick ?? "").split(separator: " ").map(String.init)
            w.removeAll { $0.range(of: #"^[+-]?\d{3,}$"#, options: .regularExpression) != nil }
            let raw = w.joined(separator: " ")
            // Name on top, claim below — split at the bet verb ("to win…",
            // "over 8.5 R1 HRs…") so long specials never shrink to one line.
            for verb in [" to ", " over ", " under "] {
                if let r = raw.range(of: verb, options: .caseInsensitive) {
                    let claim = String(raw[r.lowerBound...]).trimmingCharacters(in: .whitespaces)
                    return "\(String(raw[..<r.lowerBound]).uppercased())\n\(claim.uppercased())"
                }
            }
            // No bet verb ("Walker longest HR") — name still leads its own line.
            let parts = raw.split(separator: " ").map(String.init)
            if parts.count >= 3 {
                return "\(parts[0].uppercased())\n\(parts.dropFirst().joined(separator: " ").uppercased())"
            }
            return raw.uppercased()
        }
        var words = pickParts.pick.split(separator: " ").map(String.init)
        // The headline never shows odds or a stray "@" — those belong in the meta line.
        // Strip "@" and any American-odds integer (3+ digits) a malformed/legacy pick
        // string may carry (e.g. "Under 2.5 @ -135"); decimals (handicap/total lines) stay.
        words.removeAll { $0 == "@" || $0.range(of: #"^[+-]?\d{3,}$"#, options: .regularExpression) != nil }
        if let i = words.firstIndex(where: { $0.uppercased() == "ML" }) { words[i] = "MONEYLINE" }
        if (pick.type ?? "").lowercased() == "total" {
            return "\(words.joined(separator: " ").uppercased())\nTOTAL \(totalNoun)"
        }
        guard homeIsPicked || awayIsPicked else {
            // Team-word matching missed — the pick text names the CITY
            // ("Colorado Moneyline") while the roster field stores the
            // MASCOT ("Rockies"), so no word is shared and sideIsPicked
            // can't confirm either side. Split first word / rest anyway so
            // the hero still gets its two-line shape (founder, Aug 4: "how
            // come the word Moneyline didn't drop down" — it silently fell
            // back to one line here instead of matching Tigers/Diamondbacks'
            // behavior). Only a true single-word pick stays on one line.
            guard words.count >= 2 else { return words.joined(separator: " ").uppercased() }
            return "\(words[0].uppercased())\n\(words[1...].joined(separator: " ").uppercased())"
        }
        let pickedShort = homeIsPicked ? homeName : awayName
        let pickedFull = homeIsPicked ? (pick.homeTeam ?? "") : (pick.awayTeam ?? "")
        var teamWords = Set(pickedFull.lowercased().split(separator: " ").map(String.init))
        teamWords.formUnion(pickedShort.lowercased().split(separator: " ").map(String.init))
        var lead = 0
        while lead < words.count, teamWords.contains(words[lead].lowercased()) { lead += 1 }
        let bet = words[lead...].joined(separator: " ")
        return bet.isEmpty ? pickedShort.uppercased()
            : "\(pickedShort.uppercased())\n\(bet.uppercased())"
    }

    /// Skyscraper type (Jul 2 2026, user-locked; bumped Jul 3 "fill the cards"):
    /// ONE max size for every call — the pick fills the card. Long team names
    /// rein themselves in per line via minimumScaleFactor, so the type is
    /// always as big as the name allows. D3's ghost mark rides BEHIND the type,
    /// so settled cards need no reserve for it.
    /// Free/dark cards read at 58 (founder walked 76→64→58, Jul 3); the gold
    /// bar walked down too (Jul 4, "−15%"): 76→65 base × 1.15 scale ≈ 75.
    /// PARITY LAW: the silver prop card uses the SAME premium base — the only
    /// visible differences between Winners cards are the metal and the words.
    private var heroFontSize: CGFloat { premiumFinish ? 65 : 52 }
    /// Tight stacked leading (the mock's line-height .9) — all-caps display type
    /// has no descenders, so the lines pull together safely.
    private var heroLineSpacing: CGFloat { premiumFinish ? -24 : -18 }
    // Optical spacing (Jul 3 spacing pass): Barlow smuggles ~0.22em of invisible
    // leading above the caps and ~0.25em below the baseline. These pads target a
    // TRUE 12pt gap eyebrow→hero and hero→meta at ANY size or finish — no more
    // hand-tuned magic numbers drifting when the type scale changes.
    private var heroTopPad: CGFloat { 12 - 0.22 * heroFontSize * pf }
    private var metaTopPad: CGFloat { 12 - 0.25 * heroFontSize * pf }

    /// Meta slot after the league token — opponent + time/live/final + odds.
    /// State-aware: live games show the live line, settled show the score.
    private var metaLine: String {
        // Specials: the event name already leads the page strip — repeating
        // "HR Derby @ Philly" here just ellipsizes the price off the row.
        if (pick.type ?? "") == "special" { return "" }
        // A long tag ("NFL PRESEASON", playoff labels) squeezes this row until
        // a full nickname has to truncate — the Aug 24 sweep caught
        // "vs Seaha…". When the tag carries words beyond the bare league, the
        // matchup rides abbreviations instead (the board's own register), and
        // the price keeps its fixed slot either way. No ellipsis, ever.
        // A ranked college game rides abbreviations too: the number is two more
        // characters on each side, and this row scales rather than truncates.
        let compact = significanceTag != (pick.league ?? "").uppercased() || isRankedMatchup
        let awayLabel = compact ? metaTeamAbbrev(homeSide: false) : awayName
        let homeLabel = compact ? metaTeamAbbrev(homeSide: true) : homeName
        func ranked(_ tag: String?, _ label: String) -> String {
            guard let tag else { return label }
            return "\(tag) \(label)"
        }
        // When either side is ranked, BOTH sides print — the "vs opponent"
        // short form would hide the number on the team Gary actually picked.
        let opponent = isRankedMatchup
            ? "\(ranked(awaySeedTag, awayLabel)) @ \(ranked(homeSeedTag, homeLabel))"
            : homeIsPicked ? "vs \(awayLabel)"
            : awayIsPicked ? "@ \(homeLabel)"
            : "\(awayLabel) @ \(homeLabel)"
        let parts = [opponent]
        // The final score + LIVE/FINAL state now ride the FOOTER strip on every card
        // (user call, Jun 18) — meta keeps just the matchup; odds render after it.
        // Start time moved to the eyebrow row (frontTime); meta keeps matchup + odds.
        // Odds render separately in the sport's accent color (see body) — not appended here.
        return parts.joined(separator: " · ")
    }

    /// Footer's gold state slot — the live line while the game runs, the
    /// final board before grading lands. Nil keeps the footer slim.
    private var footerStateText: String? {
        guard displayResult == nil else { return nil }
        guard let live = liveStatus else { return interruptionOverride }
        if live.isLive { return liveSlotText(live, label: "LIVE") }
        if live.isFinal { return liveSlotText(live, label: "FINAL") }
        if let interruption = live.interruptionLabel { return interruption }
        return interruptionOverride
    }

    private enum LiveBetTone { case covering, trailing, neutral }
    /// The numeric line in the pick text (total goals line, handicap) — for live grading.
    private var pickLineValue: Double? {
        for tok in pickParts.pick.split(separator: " ") { if let d = Double(tok) { return d } }
        return nil
    }
    /// Is Gary's pick currently covering (green) or trailing (red) live? Neutral when
    /// the game isn't live, the score's tied, or it can't be determined.
    private var liveBetTone: LiveBetTone {
        guard let ls = liveStatus, ls.isLive, let a = ls.away_score, let h = ls.home_score else { return .neutral }
        let t = (pick.type ?? "").lowercased()
        if t == "total" {
            guard let line = pickLineValue else { return .neutral }
            let total = Double(a + h)
            return pickParts.pick.lowercased().contains("under")
                ? (total < line ? .covering : .trailing)
                : (total > line ? .covering : .trailing)
        }
        if t == "draw" { return a == h ? .covering : .trailing }
        guard homeIsPicked || awayIsPicked else { return .neutral }
        let pickedScore = Double(homeIsPicked ? h : a)
        let otherScore = Double(homeIsPicked ? a : h)
        let hcap = (t == "asian_handicap" || t == "spread") ? (pickLineValue ?? 0) : 0
        let adj = pickedScore + hcap
        if adj > otherScore { return .covering }
        if adj < otherScore { return .trailing }
        return .neutral
    }
    private var liveToneColor: Color {
        switch liveBetTone {
        case .covering: return Color(hex: "#3FB950")
        case .trailing: return Color(hex: "#E5484D")
        case .neutral: return GaryColors.gold
        }
    }
    /// Footer live line — "LIVE · SD 4 · PHI 6 · COVERING": teams + score + Gary's
    /// live standing, colored green/red by `liveToneColor`.
    private var liveFooterText: String? {
        // Graded/settled card: show the FINAL SCORE in the footer (user call, Jun 18
        // — "FINAL · CAN 3 · QAT 1" beside the CASHED stamp), from the live board
        // first, then the stored final score; bare "FINAL" only when neither carries
        // a score. This is the one place the final state lives on every card now.
        if displayResult != nil {
            let mk = "\(pick.awayTeam ?? "") @ \(pick.homeTeam ?? "")"
            // The rich cache line only when it can NAME the teams — a bare
            // "17-1" slot line reads like a fragment on a settled card, so
            // abbr-less cache rows fall through to the formatted paths below.
            if let ls = liveFinal, ls.away_score != nil, ls.home_score != nil,
               ls.away_abbr != nil, ls.home_abbr != nil {
                return liveLineRich(ls, label: "FINAL")
            }
            if let fs = finalScore, !fs.isEmpty { return "FINAL · \(finalScoreLine(matchup: mk, raw: fs, league: pick.league))" }
            if let g = liveCache.gradedScore(forMatchup: mk) { return "FINAL · \(finalScoreLine(matchup: mk, raw: g, league: pick.league))" }
            if let ls = liveFinal, let a = ls.away_score, let h = ls.home_score {
                return "FINAL · \(finalScoreLine(matchup: mk, raw: "\(a)-\(h)", league: pick.league))"
            }
            return "FINAL"
        }
        guard let ls = liveStatus else { return interruptionOverride }
        if ls.isLive { return liveLineRich(ls, label: "LIVE") }
        if ls.isFinal { return liveLineRich(ls, label: "FINAL") }
        if let interruption = ls.interruptionLabel { return interruption }
        return interruptionOverride
    }

    /// Start time, shown on the eyebrow row pre-game. Live/settled cards carry
    /// their state in the meta line / footer instead, so this returns nil for them.
    private var frontTime: String? {
        // Pre-game shows the start time. Settled cards normally hide it, but the Winners
        // page (alwaysShowStartTime) keeps it visible since that page sorts by start time.
        if displayResult != nil { return alwaysShowStartTime ? (formattedTime.isEmpty ? nil : formattedTime) : nil }
        if interruptionOverride != nil { return nil }
        if let live = liveStatus, live.isLive || live.isFinal || live.isInterrupted { return nil }
        return formattedTime.isEmpty ? nil : formattedTime
    }

    var body: some View {
        ZStack {
            // D3 ghost verdict — a giant serif check/cross floating behind the
            // content (win green at 14%, loss red at 7% — the loss whispers).
            // The card's clipShape contains the overflow. The METAL cards carry
            // the same giant check on a WIN (founder call, Jul 4 — the free-card
            // look), struck in deep win-green ink; a premium LOSS keeps the
            // crack fracture instead, no ghost.
            // A WIN celebrates with the ghost check. A LOSS carries the crack
            // and nothing else on EVERY finish now (founder, Aug 6: "no X
            // please just the crack") — the ✕ behind a fracture was two marks
            // telling one story.
            if displayResult == "won" {
                Text("✓")
                    .font(.system(size: 200, weight: .regular, design: .serif))
                    .foregroundStyle(premiumFinish ? Self.goldWinGreen.opacity(0.18)
                                                   : GaryColors.win.opacity(0.14))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                    .offset(x: 12, y: -14)
                    .allowsHitTesting(false)
            }

            VStack(alignment: .leading, spacing: 0) {
                // UNIFORM eyebrow (founder law, Jul 4): mark + GARY'S PICK, same
                // slot on EVERY pick card — game/prop, gold/silver/dark alike.
                // Share-card grammar app-wide (founder, Jul 12): eyebrow text
                // left with air below; the BIG mark floats in the corner as an
                // overlay (attached after this VStack) so the hero band never
                // loses a point of height to it.
                HStack(alignment: .top, spacing: 10) {
                    Text(eyebrowLabel)
                        .font(GaryFonts.accent(12.5 * pf)).tracking(1.0)
                        .foregroundStyle(eyebrowTint)
                        .padding(.top, 6)
                    Spacer()
                }
                .padding(.bottom, 6 * pf)
                .opacity(d3Dim(0.4))
                .overlay(alignment: .topTrailing) {
                    // Graded cards surrender the corner — the check + payout
                    // block owns it (founder, Jul 13: the mark printed over
                    // "+$68 · PAID" on WON bars).
                    if displayResult == nil {
                        Image(GaryBrand.mark)
                            .resizable().scaledToFit()
                            .frame(width: 46 * pf, height: 46 * pf)
                            .shadow(color: .black.opacity(premiumFinish ? 0.35 : 0.5), radius: 2, y: 1)
                            // Raised (founder, Jul 13): a two-line hero could
                            // brush the mark at -2; -10 clears every layout.
                            .offset(y: -10)
                            .allowsHitTesting(false)
                    }
                }

                // Balanced hero (founder, Jul 5): a one-word pick like DRAW
                // hugged the eyebrow with all the slack pooled below — equal
                // flexible space above and below centers the hero in its band.
                Spacer(minLength: 0)

                // Skyscraper hero: one Text per line so tight (negative) leading is
                // possible in SwiftUI and each line scales independently — the team
                // name shrinks to fit, the call stays at full size.
                // Leading does NOT scale with pf — at 87pt the scaled −28 made
                // the lines kiss; −24 keeps the stack tight without contact.
                VStack(alignment: .leading, spacing: heroLineSpacing) {
                    ForEach(Array(heroLines.components(separatedBy: "\n").enumerated()), id: \.offset) { _, line in
                        Text(line)
                            .font(GaryFonts.display(heroFontSize * pf))
                            .lineLimit(1)
                            .minimumScaleFactor(0.45)
                    }
                }
                    .foregroundStyle(heroTint)
                    // Stamped-in-metal read on the gold bar: a hairline of light kicked
                    // off the bottom edge of the dark letters.
                    .shadow(color: premiumFinish ? GoldBar.sheen.opacity(0.55) : .clear, radius: 0, y: 1)
                    // A lost GOLD bar mutes the pick words specifically (not just
                    // the whole-card saturation pass) — the words recede so the
                    // crack reads with more depth/density against them (Jul 4).
                    .opacity(isGoldLost ? 0.5 : d3Dim(0.36))
                    .padding(.top, heroTopPad)
                    // A WON premium bar carries the payout block down its right
                    // side — reserve that column so long picks wrap clear of the
                    // money. Everything else rides full width (the D3 ghost and
                    // the corner bear are gone/behind the type).
                    .padding(.trailing, (premiumFinish && isGoldWon) ? 96 : 0)

                // LOCKED GEOMETRY (founder law, Jul 4): meta + divider + score
                // pin to the card BOTTOM — a hero that scales down for a long
                // name can never float the lower parts upward.
                Spacer(minLength: 0)

                HStack(alignment: .center, spacing: 8) {
                    Text(significanceTag ?? (pick.league ?? "").uppercased())
                        .font(GaryFonts.mono(11 * pf, bold: true)).tracking(1.2)
                        .foregroundStyle(leagueTint)
                        .lineLimit(1)
                        .layoutPriority(1)
                    // PRICE NEVER TRUNCATES (founder, Aug 24: the NFL card's
                    // long "NFL PRESEASON" tag squeezed this row until the odds
                    // ellipsized to "-..." — a hard-law violation). The odds are
                    // their own fixed-size Text with top layout priority; the
                    // opponent scales down instead. No ellipsis, ever.
                    // Scales, never truncates. A college card whose pick was
                    // written before the provider abbreviations were stamped
                    // still carries the whole school name here ("Colorado"),
                    // and at the old 0.6 floor that row printed "vs COLORA…" —
                    // the hard law says shorten or scale, never clip.
                    (Text(metaLine).foregroundColor(metaBodyTint))
                        .font(GaryFonts.text(13.5 * pf, .medium))
                        .lineLimit(1)
                        .minimumScaleFactor(0.45)
                    if !pickParts.odds.isEmpty {
                        (Text("· ").foregroundColor(metaDotTint)
                            + Text(pickParts.odds).foregroundColor(oddsTint))
                            .font(GaryFonts.text(13.5 * pf, .medium))
                            .lineLimit(1)
                            .fixedSize()
                            .layoutPriority(2)
                    }
                    Spacer(minLength: 4)
                    // ⓘ — the how-it-works pop (drop, grading, flat-$100 money).
                    Button { showPickInfo = true } label: {
                        Image(systemName: "info.circle")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(shareTint)
                            .frame(width: 22, height: 22)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("How the picks work")
                    // Share moved up here (compact) — frees the footer for the live line.
                    Button {
                        let images = renderPickShareImages(pick: pick, gameResult: displayResult)
                        if !images.isEmpty { shareItem = PickShareItem(images: images) }
                    } label: {
                        Image(systemName: "square.and.arrow.up")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(shareTint)
                            .frame(width: 26, height: 22)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Share this pick")
                }
                .padding(.top, metaTopPad)
                .opacity(d3Dim(0.45))
                .sheet(isPresented: $showPickInfo) { PickInfoSheet() }

                // Footer — the live line while the game runs (teams + score + COVERING/
                // TRAILING in green/red), with a tap-to-flip chevron on the right. Share
                // moved up to the meta line; "Gary's Take" is now just the chevron.
                // Footer renders when there's a tap-to-flip affordance OR a settled/live
                // line to show — so Billfold receipts (showTakeAffordance:false) still get
                // the "FINAL · score" line, just without the chevron.
                if showTakeAffordance || liveFooterText != nil {
                    Rectangle()
                        .fill(dividerTint)
                        .frame(height: 1)
                        .padding(.vertical, 10)
                        .opacity(d3Dim(0.6))

                    HStack(spacing: 10) {
                        if let live = liveFooterText {
                            // Settled dark cards: the footer line carries the verdict
                            // ("✓ CASHED · CIN 7 · MIL 2") in win-green / lostTint —
                            // full strength even when the rest of a lost card dims.
                            Text(verdictFooterLine(live))
                                .font(GaryFonts.mono(11 * pf, bold: true)).tracking(0.5)
                                .foregroundStyle(settledFooterTint)
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                        } else if let t = frontTime {
                            // Pre-game: start time anchors the footer's left corner, opposite the chevron.
                            Text(t)
                                .font(GaryFonts.mono(11 * pf, bold: true)).tracking(0.5)
                                .foregroundStyle(footerTint)
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                        }
                        Spacer()
                        if showTakeAffordance {
                            Image(systemName: "chevron.right")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(chevronTint)
                                .opacity(d3Dim(0.5))
                        }
                    }
                }
            }
            .padding(18)

            // (Corner bear retired Jul 4 — the mark lives in the eyebrow row on
            // every card now, so the top-right corner stays clean everywhere.)

            // Brand mark on the bar (A/B, Jul 3): micro-engraved GARY A.I. text
            // or the crest badge — top-right corner, ceded to the win block.
            if premiumFinish, displayResult != "won" {
                Group {
                    switch GoldBar.brandMark {
                    case .text:
                        Text("GARY A.I.")
                            .font(GaryFonts.mono(10, bold: true)).tracking(2.4)
                            .foregroundStyle(GoldBar.inkSoft)
                            .shadow(color: GoldBar.sheen.opacity(0.55), radius: 0, y: 1)
                    case .badge:
                        Image("GaryBadgeGold")
                            .resizable().scaledToFit()
                            .frame(width: 44, height: 44)
                            .shadow(color: Color(hex: "#3A2C04").opacity(0.5), radius: 3, y: 2)
                    case .none:
                        EmptyView()
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                .padding(.top, 16).padding(.trailing, 18)
                .allowsHitTesting(false)
            }

            // GOLD WIN (X1+X4): struck green check + payout counting up own the
            // eyebrow row's right corner — the hero starts a row lower, so the
            // pick words can never collide with the money.
            // The corner ✓ retired Jul 4 — the giant ghost check behind the type
            // (free-card look) carries the win now; the corner keeps the money.
            if isGoldWon, payoutPer100 != nil {
                VStack(alignment: .trailing, spacing: 1) {
                    Text("+$\(shownPayout)")
                        .font(GaryFonts.display(36))
                        .foregroundStyle(GoldBar.inkHero)
                        .shadow(color: GoldBar.sheen.opacity(0.6), radius: 0, y: 1)
                    // "PER $100 · PAID" subline retired Jul 13 (founder) — the
                    // ⓘ sheet explains the flat-$100 scoring once, app-wide.
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                .padding(.top, 12).padding(.trailing, 16)
                .allowsHitTesting(false)
            }

            // GOLD LOSS (locked): the hairline fracture — dark cut with a light
            // kick off its right edge; the whole bar dims below.
            if isGoldLost {
                CrackShape()
                    .stroke(Color(hex: "#231A02").opacity(0.72), lineWidth: 2)
                    .allowsHitTesting(false)
                CrackShape()
                    .stroke(GoldBar.sheen.opacity(0.4), lineWidth: 1)
                    .offset(x: 2)
                    .allowsHitTesting(false)
            }

            // DARK LOSS carries the same fracture (founder, Aug 6: the Picks
            // page should crack like Winners does) — but the card never dims
            // here, so the crack is the whole story rather than a companion to
            // a mute. Struck in ink with a loss-red kick, the dark-card
            // inversion of the gold bar's light one.
            if !premiumFinish, displayResult == "lost" {
                CrackShape()
                    .stroke(Color.black.opacity(0.75), lineWidth: 2)
                    .allowsHitTesting(false)
                CrackShape()
                    .stroke(GaryColors.loss.opacity(0.38), lineWidth: 1)
                    .offset(x: 2)
                    .allowsHitTesting(false)
            }

            // One-shot confetti for a fresh gold win (bar palette, self-clearing).
            if showConfetti { GoldConfettiBurst() }
        }
        // Uniform card height regardless of headline length / footer presence.
        // A FIXED height (not a floor) when the flip wrapper passes one — a
        // minHeight let 2-line heroes stay taller than 1-line ones (the bug).
        .frame(minHeight: fixedHeight == nil ? 210 : nil)
        .frame(height: fixedHeight)
        // (The wordless Winners slot rail came off the leading edge Aug 6 —
        // founder: "what are those little green and white stripes? remove
        // those". The slot system still ORDERS the card; it just no longer
        // paints a cue. winnersSlot rides on for that ordering.)
        // Contains the oversized D3 ghost mark; background (and its shadow)
        // draws after this, so the card's drop shadow is unaffected.
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .background(
            Group {
                if premiumFinish {
                    GoldBar.background()
                } else {
                    // Lift v3 (founder, Jul 6: "+20% more off the page"):
                    // brighter top face, harder edge light, longer throw —
                    // dark cards only; the Winners gold/silver bars keep
                    // their own finish.
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .fill(LinearGradient(colors: [Color(hex: "#272522"), Color(hex: "#100F0D")],
                                             startPoint: .top, endPoint: .bottom))
                        .overlay(
                            RoundedRectangle(cornerRadius: 20, style: .continuous)
                                .stroke(.white.opacity(0.19), lineWidth: 1)
                        )
                        .overlay(alignment: .top) {
                            // Lit-from-above highlight — the lift cue.
                            RoundedRectangle(cornerRadius: 20, style: .continuous)
                                .stroke(.white.opacity(0.24), lineWidth: 1)
                                .mask(LinearGradient(colors: [.white, .clear], startPoint: .top, endPoint: .center))
                        }
                        .shadow(color: .black.opacity(0.68), radius: 32, y: 17)
                        .shadow(color: .black.opacity(0.45), radius: 5, y: 3)
                }
            }
        )
        // Locked LOST physics for the gold bar: the metal loses saturation and
        // light (the crack overlay rides above). Dark cards dim per-element (D3).
        .saturation(isGoldLost ? 0.8 : 1)
        .brightness(isGoldLost ? -0.06 : 0)
        .onAppear {
            LiveScoreCache.shared.startIfNeeded()
            if isGoldWon { runWinMoment() }
            // The user is looking at one of their picks that CASHED — the highest-sentiment moment.
            // Ask for a review. Heavily gated (once per app version, >=3 sessions) + Apple-throttled
            // to ~3/365 days, so it can never nag even though winning cards appear all over the app.
            if displayResult == "won", ReviewPrompt.shouldRequestAfterWin() { requestReview() }
        }
        // The card can be ON SCREEN when the result lands (live → won via a
        // background reload): onAppear has already fired, so the transition
        // itself must start the win moment — otherwise the payout counter
        // renders its initial $0 and the confetti never plays.
        .onChange(of: isGoldWon) { won in
            guard won else { return }
            runWinMoment()
            if ReviewPrompt.shouldRequestAfterWin() { requestReview() }
        }
        .sheet(item: $shareItem) { ActivityShareSheet(items: $0.images) }
    }
}
