import SwiftUI

/// TALKING TO GARY ON HOME (founder, Oct 31 2026: "id like to just be able to talk to him on the home screen
/// not have to go to another screen since we have gary here already"). Tap ASK GARY and he listens right where
/// he stands: the diagram's labels step back, his light swells with whoever is talking, and what's said runs
/// under him as captions. When he's done he listens again, so it goes back and forth hands-free; say nothing
/// for a while, or tap the x, and Home comes back.

/// What starts (or ends) talking from outside Home's figure: the tour, or a question to ask first.
struct GaryTalkOpening: Identifiable, Equatable {
    let id = UUID()
    /// Asked straight away; nil, he listens.
    var first: String? = nil
    var close = false
}

/// Keeps the talk engine for Home without Home watching it, so only the pieces that show him talking redraw
/// as his voice moves. Made the first time you talk to him.
@MainActor final class GaryTalkHolder: ObservableObject {
    lazy var talk = GaryTalk()
}

/// Ends the talking once he's sat quiet `after` seconds: not listening, not answering (and not waiting on
/// the mic being allowed, or the night being over, which say so until you close them).
struct GaryTalkQuiet: View {
    @ObservedObject var talk: GaryTalk
    let after: Double
    let onQuiet: () -> Void

    var body: some View {
        Color.clear.frame(width: 0, height: 0)
            .task(id: talk.phase) {
                guard talk.phase == .idle, talk.enabled, !talk.micRefused else { return }
                try? await Task.sleep(nanoseconds: UInt64(after * 1_000_000_000))
                guard !Task.isCancelled, talk.phase == .idle else { return }
                onQuiet()
            }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}

/// His light while you talk to him: breathing while he thinks, swelling with whoever is talking.
struct GaryTalkLight: View {
    @ObservedObject var talk: GaryTalk
    let radius: CGFloat
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: reduceMotion)) { ctx in
            let t = ctx.date.timeIntervalSinceReferenceDate
            let level = Double(talk.level)
            let think = !reduceMotion && talk.phase == .thinking ? 0.5 + 0.5 * sin(t * 2 * .pi / 1.6) : 0
            let glow = 1 + level * 0.9 + think * 0.35
            Ellipse()
                .fill(RadialGradient(colors: [GaryColors.lightGold.opacity(0.2 * glow), GaryColors.gold.opacity(0.07 * glow), .clear],
                                     center: .center, startRadius: 0, endRadius: radius))
                .scaleEffect(1 + level * 0.14 + think * 0.03)
        }
        .allowsHitTesting(false)
    }
}

/// Where ASK GARY was, while you talk: what he's doing, in the label's own type. Listening, it offers the
/// day's question to tap instead of saying something.
struct GaryTalkStateLabel: View {
    @ObservedObject var talk: GaryTalk
    /// Home's question for the day.
    let suggestion: String?
    let onAsk: (String) -> Void
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 6) {
                if talk.phase == .listening {
                    Circle().fill(GaryColors.win).frame(width: 6, height: 6)
                        .background(Circle().fill(GaryColors.win.opacity(0.22)).frame(width: 12, height: 12))
                }
                Image(systemName: state.symbol).font(.system(size: 8.5, weight: .bold))
                Text(state.word)
                    .font(GaryFonts.kicker(9.5, .bold)).tracking(1.5)
                    .fitsOneLine()
            }
            .foregroundStyle(state.color)
            if talk.micRefused, let url = URL(string: UIApplication.openSettingsURLString) {
                Button { openURL(url) } label: { line("SETTINGS") }.buttonStyle(.plain)
            } else if talk.phase == .listening, talk.heard.isEmpty, let q = suggestion {
                Button { onAsk(q) } label: {
                    VStack(alignment: .leading, spacing: 0) {
                        let lines = HomeGaryOpening.labelLines(q.uppercased())
                        ForEach(Array(lines.enumerated()), id: \.offset) { i, l in
                            line(l, chevron: i == lines.count - 1)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Ask: \(q)")
                .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.25), value: talk.heard.isEmpty)
    }

    private var state: (symbol: String, word: String, color: Color) {
        if talk.micRefused { return ("mic.slash", "MIC OFF", GaryColors.gold) }
        if !talk.enabled { return ("moon.zzz", "BACK TOMORROW", GaryColors.gold) }
        switch talk.phase {
        case .listening: return ("waveform", "LISTENING", GaryColors.win)
        case .thinking: return ("ellipsis", "THINKING", GaryColors.gold)
        case .speaking: return ("speaker.wave.2.fill", "TALKING", GaryColors.gold)
        case .idle: return ("mic.fill", "TAP HIM", GaryColors.gold)
        }
    }

    private func line(_ s: String, chevron: Bool = true) -> some View {
        HStack(spacing: 5) {
            Text(s).font(GaryFonts.display(21)).foregroundStyle(GaryColors.warmWhite).fitsOneLine()
            if chevron {
                Image(systemName: "chevron.right").font(.system(size: 9, weight: .bold)).foregroundStyle(GaryColors.gold)
            }
        }
        .frame(height: 23, alignment: .leading)
    }
}

/// The fade under him the captions read on, there only while there are captions: listening to silence, all
/// of him shows, the rings at his feet too.
struct GaryTalkScrim: View {
    @ObservedObject var talk: GaryTalk
    var body: some View {
        LinearGradient(stops: [.init(color: GaryColors.darkBg.opacity(0), location: 0),
                               .init(color: GaryColors.darkBg.opacity(0.88), location: 0.45),
                               .init(color: GaryColors.darkBg.opacity(0.96), location: 1)],
                       startPoint: .top, endPoint: .bottom)
            .opacity(talk.phase == .listening && talk.heard.isEmpty ? 0 : 1)
            .animation(.easeOut(duration: 0.3), value: talk.phase == .listening && talk.heard.isEmpty)
            .allowsHitTesting(false)
    }
}

/// The captions under him: your words as you say them, then his, the piece he's on lit as he says it and
/// the rest of it waiting.
struct GaryTalkCaptions: View {
    @ObservedObject var talk: GaryTalk
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let you = talk.turns.last(where: { $0.role == .user })?.text
        let gary = talk.turns.last.flatMap { $0.role == .assistant ? $0 : nil }
        VStack(alignment: .leading, spacing: 10) {
            if talk.phase == .listening {
                if !talk.heard.isEmpty { said("YOU", talk.heard, GaryColors.win) }
            } else {
                if talk.phase == .thinking, let you { said("YOU", you, GaryColors.silverDim) }
                if let gary {
                    VStack(alignment: .leading, spacing: 5) {
                        kicker("GARY", GaryColors.gold)
                        if gary.text.isEmpty {
                            GaryThinkingDots(still: reduceMotion)
                        } else {
                            let piece = GaryTalk.caption(gary.text, said: gary.said)
                            (Text(piece.lit).foregroundColor(GaryColors.warmWhite)
                                + Text(piece.rest).foregroundColor(GaryColors.warmWhite.opacity(0.32)))
                                .font(GaryFonts.text(19, .medium))
                                .lineSpacing(3)
                                .fixedSize(horizontal: false, vertical: true)
                                .accessibilityLabel(gary.text)
                        }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .animation(.easeOut(duration: 0.2), value: talk.phase)
    }

    private func said(_ who: String, _ text: String, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            kicker(who, color)
            Text(text)
                .font(GaryFonts.text(16)).foregroundStyle(GaryColors.silver)
                .fitsLines(3)
        }
    }

    private func kicker(_ s: String, _ color: Color) -> some View {
        Text(s).font(GaryFonts.kicker(9.5, .bold)).tracking(1.5).foregroundStyle(color)
    }
}

extension GaryTalk {
    /// The piece of his answer on screen while he says word `said`: a sentence, or a stretch of a long one
    /// broken at a comma, never more than `maxWords`, with the words he's said and the ones still to come.
    static func caption(_ text: String, said: Int, maxWords: Int = 22) -> (lit: String, rest: String) {
        let words = text.split(whereSeparator: \.isWhitespace)
        guard !words.isEmpty else { return ("", "") }
        var pieces: [Range<Int>] = []
        var start = 0
        for (i, w) in words.enumerated() {
            let n = i + 1 - start
            let sentence = w.last.map { ".!?".contains($0) } ?? false
            let comma = w.last == "," || w.last == ";"
            if (sentence && n >= 3) || (comma && n >= 14) || n >= maxWords {
                pieces.append(start..<(i + 1))
                start = i + 1
            }
        }
        if start < words.count { pieces.append(start..<words.count) }
        let on = min(max(said, 0), words.count - 1)
        let piece = pieces.first(where: { $0.contains(on) }) ?? pieces[pieces.count - 1]
        let cut = min(max(said, piece.lowerBound), piece.upperBound)
        let lit = words[piece.lowerBound..<cut].joined(separator: " ")
        let rest = words[cut..<piece.upperBound].joined(separator: " ")
        return (lit, lit.isEmpty || rest.isEmpty ? rest : " " + rest)
    }
}

/// Three gold dots that rise in turn while he works out what to say.
struct GaryThinkingDots: View {
    let still: Bool
    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: still)) { ctx in
            let t = ctx.date.timeIntervalSinceReferenceDate
            HStack(spacing: 6) {
                ForEach(0..<3, id: \.self) { i in
                    let p = still ? 0.5 : 0.5 + 0.5 * sin(t * 2 * .pi / 1.2 - Double(i) * 0.8)
                    Circle().fill(GaryColors.gold.opacity(0.35 + 0.65 * p))
                        .frame(width: 6, height: 6)
                        .offset(y: -3 * p)
                }
            }
            .frame(height: 22)
        }
        .accessibilityLabel("Gary is thinking")
    }
}

/// Hairline rings that drift out across the floor at his feet while he listens, wider when you're louder.
struct GaryListeningRings: View {
    @ObservedObject var talk: GaryTalk
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        if talk.phase == .listening && !reduceMotion { rings }
    }

    private var rings: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30)) { ctx in
            let t = ctx.date.timeIntervalSinceReferenceDate
            let level = Double(talk.level)
            Canvas { g, size in
                for i in 0..<3 {
                    let p = (t / 1.8 + Double(i) / 3).truncatingRemainder(dividingBy: 1)
                    let s = 0.55 + 0.45 * p + level * 0.2
                    let r = CGRect(x: size.width * (1 - s) / 2, y: size.height * (1 - s) / 2, width: size.width * s, height: size.height * s)
                    g.stroke(Path(ellipseIn: r), with: .color(GaryColors.win.opacity(0.45 * (1 - p))), lineWidth: 1)
                }
            }
        }
        .allowsHitTesting(false)
    }
}
