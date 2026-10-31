import SwiftUI

/// What opens the talk room: the question it asks first, if any.
struct GaryTalkOpening: Identifiable {
    let id = UUID()
    let first: String?
}

/// The room you talk to Gary in: him under his spotlight on the black page, the questions you could ask
/// pointing at him the way Home's labels do, and once you've asked, the conversation under him. His words
/// light up as he says them; the spotlight swells with his voice, and with yours while he listens.
struct GaryTalkRoom: View {
    /// Asked the moment the room opens (the Home label's question), or nil to open on the questions.
    let first: String?
    let onClose: () -> Void

    @StateObject private var talk = GaryTalk()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.openURL) private var openURL
    @State private var typing = false
    /// The long answer the page has already followed down.
    @State private var followed: UUID?
    @State private var draft = ""
    @FocusState private var fieldFocused: Bool

    private var started: Bool { !talk.turns.isEmpty || talk.phase == .listening }

    var body: some View {
        ZStack {
            GaryColors.darkBg.ignoresSafeArea()
            VStack(spacing: 0) {
                header
                // Before the first question he has the room; after it, he steps back above the conversation.
                stage
                    .frame(maxHeight: started ? 236 : .infinity)
                if started {
                    conversation
                        .transition(.opacity)
                }
                controls
            }
        }
        .animation(.timingCurve(0.22, 0.8, 0.24, 1, duration: 0.9), value: started)
        .preferredColorScheme(.dark)
        .onAppear {
            talk.open()
            talk.seed(first)
            if let first { talk.ask(first) }
        }
        .onDisappear { talk.close() }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Text("ASK GARY")
                .font(GaryFonts.kicker(10.5, .bold)).tracking(1.6)
                .foregroundStyle(GaryColors.gold)
            Spacer()
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(GaryColors.warmWhite.opacity(0.75))
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("Close")
        }
        .padding(.leading, GaryLayout.gutter)
        .padding(.trailing, GaryLayout.gutter - 12)
        .frame(height: 48)
    }

    // MARK: - Gary

    private var stage: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let gh = started ? 210.0 : min(352.0, max(260, geo.size.height - 60))
            let gw = gh * GaryIdleFigure.baseAspect
            let top = started ? 14.0 : max(20, (geo.size.height - gh) / 2 - 8)
            let gx = w / 2 - gw / 2
            let at = { (p: CGPoint) in CGPoint(x: gx + p.x * gw, y: top + p.y * gh) }
            ZStack(alignment: .topLeading) {
                TimelineView(.animation(minimumInterval: 1.0 / 30, paused: reduceMotion)) { ctx in
                    spotlight(t: ctx.date.timeIntervalSinceReferenceDate, radius: gh * 0.52)
                        .frame(width: gh * 1.04, height: gh * 1.12)
                        .position(x: w / 2, y: top + gh * 0.5)
                }
                Ellipse()
                    .fill(RadialGradient(colors: [.black.opacity(0.6), .clear], center: .center, startRadius: 0, endRadius: 85))
                    .frame(width: gh * 0.5, height: 14)
                    .position(x: w / 2, y: top + gh + 2)
                if talk.phase == .listening && !reduceMotion {
                    ListeningRings(level: CGFloat(talk.level))
                        .frame(width: gh * 0.62, height: 22)
                        .position(x: w / 2, y: top + gh + 2)
                }
                GaryIdleFigure(mood: nil, height: gh, active: true, lives: false)
                    .frame(width: gw + 60, height: gh + 30)
                    .position(x: w / 2, y: top - 30 + (gh + 30) / 2)
                if !started {
                    questions(width: w, top: top, height: gh, at: at)
                        .transition(.opacity)
                }
            }
            .animation(.easeOut(duration: 0.5), value: started)
        }
        .pageGutter()
    }

    /// His light: still when he's quiet, slow breathing while he thinks, swelling with whoever is talking.
    private func spotlight(t: Double, radius: CGFloat) -> some View {
        let level = Double(talk.level)
        let think = talk.phase == .thinking ? 0.5 + 0.5 * sin(t * 2 * .pi / 1.6) : 0
        let glow = 0.8 + level * 0.9 + think * 0.35
        return Ellipse()
            .fill(RadialGradient(colors: [GaryColors.lightGold.opacity(0.2 * glow), GaryColors.gold.opacity(0.07 * glow), .clear],
                                 center: .center, startRadius: 0, endRadius: radius))
            .scaleEffect(1 + level * 0.14 + think * 0.03)
    }

    /// The questions on offer, labeled onto him like Home's diagram: one at his head, one at his shoulder, one
    /// at his pocket.
    private func questions(width w: CGFloat, top: CGFloat, height gh: CGFloat, at: @escaping (CGPoint) -> CGPoint) -> some View {
        let qs = Array(talk.suggestions.prefix(3))
        let spots: [(x: CGFloat, y: CGFloat, right: Bool, anchor: CGPoint)] = [
            (0, top + gh * 0.05 - 20, false, GaryIdleFigure.head),
            (w - 100, top + gh * 0.11 - 20, true, GaryIdleFigure.shoulder),
            (0, top + gh * 0.57 - 20, false, GaryIdleFigure.pocket),
        ]
        return ZStack(alignment: .topLeading) {
            Canvas { ctx, _ in
                for (i, _) in qs.enumerated() {
                    let s = spots[i]
                    let y = s.y + 28
                    let from = CGPoint(x: s.right ? s.x - 6 : s.x + 90, y: y)
                    let elbow = CGPoint(x: s.right ? s.x - 20 : s.x + 104, y: y)
                    let to = at(s.anchor)
                    var p = Path(); p.move(to: from); p.addLine(to: elbow); p.addLine(to: to)
                    ctx.stroke(p, with: .color(GaryColors.lightGold.opacity(0.6)), lineWidth: 1)
                    ctx.fill(Path(ellipseIn: CGRect(x: to.x - 3, y: to.y - 3, width: 6, height: 6)), with: .color(GaryColors.lightGold))
                    ctx.stroke(Path(ellipseIn: CGRect(x: to.x - 7, y: to.y - 7, width: 14, height: 14)),
                               with: .color(GaryColors.lightGold.opacity(0.35)), lineWidth: 1)
                }
            }
            .allowsHitTesting(false)
            ForEach(Array(qs.enumerated()), id: \.offset) { i, q in
                Button { talk.ask(q) } label: { questionLabel(q) }
                    .buttonStyle(.plain)
                    .frame(width: 100, alignment: spots[i].right ? .trailing : .leading)
                    .offset(x: spots[i].x, y: spots[i].y)
                    .accessibilityLabel(q)
            }
        }
    }

    private func questionLabel(_ q: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("ASK")
                .font(GaryFonts.kicker(9.5, .bold)).tracking(1.5)
                .foregroundStyle(GaryColors.gold)
            HStack(alignment: .lastTextBaseline, spacing: 5) {
                Text(q.uppercased())
                    .font(GaryFonts.display(20)).foregroundStyle(GaryColors.warmWhite)
                    .fitsLines(3)
                Image(systemName: "chevron.right")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(GaryColors.gold)
            }
        }
        .contentShape(Rectangle())
    }

    // MARK: - The conversation

    private var conversation: some View {
        ScrollViewReader { proxy in
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 22) {
                    ForEach(talk.turns) { turn in
                        line(turn).id(turn.id)
                    }
                    if talk.phase == .listening {
                        heardLine.id("heard")
                    }
                    Color.clear.frame(height: 1).id("end")
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .pageGutter()
                .padding(.top, 8)
                .padding(.bottom, 12)
            }
            // A new question scrolls to itself, so his answer reads from the top; once he's past the middle of a
            // long one, the page follows him down.
            .onChange(of: talk.turns.count) { _ in
                guard let q = talk.turns.last(where: { $0.role == .user }) else { return }
                withAnimation(.easeOut(duration: 0.4)) { proxy.scrollTo(q.id, anchor: .top) }
            }
            .onChange(of: talk.turns.last?.said ?? 0) { said in
                guard let last = talk.turns.last, last.role == .assistant, followed != last.id else { return }
                let total = GaryTalk.words(last.text)
                if total > 40, Double(said) / Double(total) > 0.5 {
                    followed = last.id
                    withAnimation(.easeInOut(duration: 1.2)) { proxy.scrollTo("end", anchor: .bottom) }
                }
            }
            .onChange(of: talk.heard) { _ in proxy.scrollTo("end", anchor: .bottom) }
        }
        .mask(LinearGradient(stops: [.init(color: .clear, location: 0), .init(color: .black, location: 0.06),
                                     .init(color: .black, location: 0.94), .init(color: .clear, location: 1)],
                             startPoint: .top, endPoint: .bottom))
    }

    @ViewBuilder private func line(_ turn: GaryTalk.Turn) -> some View {
        if turn.role == .user {
            VStack(alignment: .leading, spacing: 4) {
                kicker("YOU", GaryColors.silverDim)
                Text(turn.text)
                    .font(GaryFonts.text(15)).foregroundStyle(GaryColors.silver)
                    .fixedSize(horizontal: false, vertical: true)
            }
        } else {
            VStack(alignment: .leading, spacing: 5) {
                kicker("GARY", GaryColors.gold)
                if turn.text.isEmpty {
                    ThinkingDots(still: reduceMotion)
                } else {
                    spoken(turn.text, said: turn.said)
                        .font(GaryFonts.text(19, .medium))
                        .lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    private var heardLine: some View {
        VStack(alignment: .leading, spacing: 4) {
            kicker("YOU", GaryColors.win)
            Text(talk.heard.isEmpty ? " " : talk.heard)
                .font(GaryFonts.text(15)).foregroundStyle(GaryColors.silver.opacity(0.85))
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    /// His answer with the words he's said lit and the rest waiting.
    private func spoken(_ text: String, said: Int) -> Text {
        let cut = Self.endOfWord(said, in: text)
        let lit = String(text[..<cut]), rest = String(text[cut...])
        return Text(lit).foregroundColor(GaryColors.warmWhite) + Text(rest).foregroundColor(GaryColors.warmWhite.opacity(0.3))
    }

    /// The index just past the `n`th word.
    static func endOfWord(_ n: Int, in s: String) -> String.Index {
        guard n > 0 else { return s.startIndex }
        var count = 0
        var inWord = false
        var i = s.startIndex
        while i < s.endIndex {
            if s[i].isWhitespace {
                if inWord { count += 1; inWord = false; if count == n { return i } }
            } else { inWord = true }
            i = s.index(after: i)
        }
        return s.endIndex
    }

    private func kicker(_ s: String, _ color: Color) -> some View {
        Text(s).font(GaryFonts.kicker(9.5, .bold)).tracking(1.5).foregroundStyle(color)
    }

    // MARK: - Controls

    private var controls: some View {
        VStack(spacing: 0) {
            Rectangle().fill(Color.white.opacity(0.08)).frame(height: 1)
            if typing {
                HStack(spacing: 12) {
                    TextField("", text: $draft, prompt: Text("Ask Gary").foregroundColor(GaryColors.silverDim))
                        .font(GaryFonts.text(16)).foregroundStyle(GaryColors.warmWhite)
                        .focused($fieldFocused)
                        .submitLabel(.send)
                        .onSubmit(sendDraft)
                    Button(action: sendDraft) {
                        HStack(spacing: 4) {
                            Text("ASK").font(GaryFonts.display(19))
                            Image(systemName: "chevron.right").font(.system(size: 10, weight: .bold))
                        }
                        .foregroundStyle(draft.trimmingCharacters(in: .whitespaces).isEmpty ? GaryColors.gold.opacity(0.4) : GaryColors.gold)
                    }
                    .disabled(draft.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                .pageGutter()
                .frame(height: 64)
            } else {
                ZStack {
                    HStack {
                        Button {
                            if talk.phase == .listening { talk.stopListening(send: false) }
                            typing = true
                            fieldFocused = true
                        } label: {
                            Image(systemName: "keyboard")
                                .font(.system(size: 17, weight: .regular))
                                .foregroundStyle(GaryColors.silver.opacity(0.8))
                                .frame(width: 48, height: 48)
                                .contentShape(Rectangle())
                        }
                        .accessibilityLabel("Type a question")
                        Spacer()
                    }
                    .padding(.leading, GaryLayout.gutter - 12)
                    micButton
                }
                .frame(height: 104)
            }
        }
        .animation(.easeOut(duration: 0.25), value: typing)
    }

    private var micButton: some View {
        let (symbol, word): (String, String) = {
            if talk.micRefused { return ("mic.slash", "MIC OFF") }
            if !talk.enabled { return ("moon.zzz", "BACK TOMORROW") }
            switch talk.phase {
            case .idle: return ("mic", "TALK")
            case .listening: return ("waveform", "LISTENING")
            case .thinking: return ("stop.fill", "STOP")
            case .speaking: return ("stop.fill", "STOP")
            }
        }()
        return Button {
            if talk.micRefused, let url = URL(string: UIApplication.openSettingsURLString) { openURL(url); return }
            guard talk.enabled else { return }
            talk.micTapped()
        } label: {
            VStack(spacing: 8) {
                ZStack {
                    Circle()
                        .fill(RadialGradient(colors: [GaryColors.gold.opacity(0.28), .clear], center: .center, startRadius: 0, endRadius: 40))
                        .frame(width: 80, height: 80)
                        .scaleEffect(talk.phase == .listening ? 0.85 + CGFloat(talk.level) * 0.6 : 0.85)
                        .opacity(talk.phase == .idle ? 0.55 : 1)
                    Image(systemName: symbol)
                        .font(.system(size: symbol == "stop.fill" ? 17 : 26, weight: .regular))
                        .foregroundStyle(talk.phase == .listening ? GaryColors.win : GaryColors.gold)
                }
                .frame(height: 52)
                Text(word)
                    .font(GaryFonts.kicker(9.5, .bold)).tracking(1.5)
                    .foregroundStyle(talk.phase == .listening ? GaryColors.win : GaryColors.gold)
                    .fixedSize()
            }
            .frame(width: 140)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .animation(.easeOut(duration: 0.12), value: talk.level)
        .accessibilityLabel(word.capitalized)
    }

    private func sendDraft() {
        let q = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return }
        draft = ""
        typing = false
        fieldFocused = false
        talk.ask(q)
    }
}

/// Three gold dots that rise in turn while he works out what to say.
private struct ThinkingDots: View {
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
private struct ListeningRings: View {
    let level: CGFloat
    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30)) { ctx in
            let t = ctx.date.timeIntervalSinceReferenceDate
            Canvas { g, size in
                for i in 0..<3 {
                    let p = (t / 1.8 + Double(i) / 3).truncatingRemainder(dividingBy: 1)
                    let s = 0.55 + 0.45 * p + Double(level) * 0.2
                    let r = CGRect(x: size.width * (1 - s) / 2, y: size.height * (1 - s) / 2, width: size.width * s, height: size.height * s)
                    g.stroke(Path(ellipseIn: r), with: .color(GaryColors.win.opacity(0.45 * (1 - p))), lineWidth: 1)
                }
            }
        }
        .allowsHitTesting(false)
    }
}
