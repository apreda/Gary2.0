import SwiftUI
import AVFoundation

// THE WINNERS LAB — talk to Gary. The bar rides the bottom of the board and
// the breakdown; the sheet is the conversation. Gary reads his own desk on the
// server (`gary-talk`) and answers in character. Voice is a toggle.

struct GaryTalkMessage: Identifiable, Equatable {
    enum Role { case fan, gary }
    let id = UUID()
    let role: Role
    var text: String
    var reads: [String] = []
    var audioURL: String? = nil
    var failed = false
}

@MainActor
final class GaryTalkStore: ObservableObject {
    static let shared = GaryTalkStore()
    @Published var messages: [GaryTalkMessage] = []
    @Published var sending = false
    @Published var error: String?
    @Published var used: Int? = nil
    @Published var limit: Int? = nil
    @AppStorage("garyVoice") var voiceOn: Bool = false
    private var day = ""

    func prepare(for date: String) {
        if day != date { day = date; messages = []; error = nil }
    }

    func send(_ text: String, date: String, candidateID: Int?, context: String?) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !sending else { return }
        prepare(for: date)
        messages.append(GaryTalkMessage(role: .fan, text: trimmed))
        sending = true; error = nil
        let history = messages.dropLast().suffix(10).map { ["role": $0.role == .fan ? "user" : "gary", "text": $0.text] }
        do {
            // The text comes first; the rendered voice follows in its own request.
            let reply = try await SupabaseAPI.garyTalk(message: trimmed, date: date, candidateID: candidateID,
                                                      history: Array(history), voice: false, context: context)
            let message = GaryTalkMessage(role: .gary, text: reply.text, reads: reply.reads ?? [], audioURL: reply.audio_url)
            messages.append(message)
            used = reply.used; limit = reply.limit
            if voiceOn { await renderVoice(for: message.id) }
        } catch {
            self.error = LabFormat.errorText(error)
            if let last = messages.indices.last, messages[last].role == .fan { messages[last].failed = true }
        }
        sending = false
    }

    @Published var rendering: UUID? = nil
    /// Ask the desk for Gary's voice on a reply, then play it. On any failure
    /// the phone reads it in its own voice instead.
    func renderVoice(for id: UUID) async {
        guard let index = messages.firstIndex(where: { $0.id == id }) else { return }
        if messages[index].audioURL == nil {
            rendering = id
            let url = try? await SupabaseAPI.garyVoice(text: messages[index].text)
            if rendering == id { rendering = nil }
            if let url, let again = messages.firstIndex(where: { $0.id == id }) { messages[again].audioURL = url }
        }
        guard let again = messages.firstIndex(where: { $0.id == id }) else { return }
        GaryVoice.shared.speak(messages[again])
    }
}

/// Gary out loud: the server's rendered voice when it sends one, otherwise
/// the phone's own speech, pitched low and unhurried.
final class GaryVoice: NSObject, AVSpeechSynthesizerDelegate {
    static let shared = GaryVoice()
    private let synthesizer = AVSpeechSynthesizer()
    private var player: AVPlayer?
    @Published private(set) var speaking = false

    private override init() {
        super.init()
        synthesizer.delegate = self
    }

    func speak(_ message: GaryTalkMessage) {
        stop()
        prepareSession()
        if let raw = message.audioURL, let url = URL(string: raw), url.scheme == "https" {
            let item = AVPlayerItem(url: url)
            let p = AVPlayer(playerItem: item)
            player = p
            p.play()
            return
        }
        let utterance = AVSpeechUtterance(string: message.text)
        utterance.voice = Self.voice
        utterance.rate = 0.46
        utterance.pitchMultiplier = 0.78
        utterance.preUtteranceDelay = 0.05
        synthesizer.speak(utterance)
    }

    func stop() {
        player?.pause(); player = nil
        if synthesizer.isSpeaking { synthesizer.stopSpeaking(at: .immediate) }
    }

    private func prepareSession() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
        try? session.setActive(true, options: [])
    }

    /// The deepest en-US voice on the phone; premium, then enhanced, then default.
    private static let voice: AVSpeechSynthesisVoice? = {
        let all = AVSpeechSynthesisVoice.speechVoices().filter { $0.language.hasPrefix("en-US") }
        let preferred = ["Aaron", "Evan", "Nathan", "Fred", "Tom", "Alex", "Reed", "Rocko"]
        func pick(_ quality: AVSpeechSynthesisVoiceQuality) -> AVSpeechSynthesisVoice? {
            for name in preferred {
                if let v = all.first(where: { $0.quality == quality && $0.name.contains(name) }) { return v }
            }
            return nil
        }
        return pick(.premium) ?? pick(.enhanced) ?? all.first(where: { preferred.contains(where: $0.name.contains) })
            ?? AVSpeechSynthesisVoice(language: "en-US")
    }()

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
    }
}

/// What Gary is looking at with the fan. A page sets the focus while it is
/// on screen (the play, the system); the button in the corner opens the
/// conversation with that focus. Cleared when the page goes.
@MainActor final class GaryTalkContext: ObservableObject {
    static let shared = GaryTalkContext()
    /// Talk to Gary is shelved (founder, Sep 23 2026). The code stays for later;
    /// while this is false no button, sheet or `gary-talk` request reaches the app.
    static let isAvailable = false
    @Published var present = false
    /// True while a full-screen moment (the unveil) owns the screen.
    @Published var hidden = false
    @Published private(set) var date: String = SupabaseAPI.todayEST()
    @Published private(set) var candidateID: Int? = nil
    @Published private(set) var focusLabel: String? = nil
    @Published private(set) var context: String? = nil

    func focus(date: String, candidateID: Int? = nil, label: String? = nil, context: String? = nil) {
        self.date = date; self.candidateID = candidateID; self.focusLabel = label; self.context = context
    }
    func clear() {
        date = SupabaseAPI.todayEST(); candidateID = nil; focusLabel = nil; context = nil
    }
}

/// The orb in the corner (founder, Sep 22 2026: "a gold orb or something
/// really cool motion design to show like this thing is alive down here,
/// you can talk to Gary at any time"). Small, at the dock's edge, never over
/// the page. It breathes; Reduce Motion stills it.
/// GARY'S TOKEN — the button that reaches him.
///
/// A flat gold dot was a dot. A bettor's world is struck metal: the milled edge
/// of a chip, a brass token on a counter, a coin with a face pressed into it.
/// So this is an object, not an icon — a milled rim, a domed face with Gary set
/// into it, and one light from the upper left that everything obeys. The only
/// motion is that light crawling across the metal, which is what metal does;
/// pressing it presses the token in.
struct GaryTalkButton: View {
    let onTap: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var sweep = false
    @State private var pressed = false

    private let coin: CGFloat = 38

    var body: some View {
        Button(action: onTap) {
            token
                .frame(width: 44, height: 44)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Talk to Gary")
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.linear(duration: 14).repeatForever(autoreverses: false)) { sweep = true }
        }
        .simultaneousGesture(DragGesture(minimumDistance: 0)
            .onChanged { _ in if !pressed { withAnimation(.easeOut(duration: 0.12)) { pressed = true } } }
            .onEnded { _ in withAnimation(.easeOut(duration: 0.22)) { pressed = false } })
    }

    private var token: some View {
        ZStack {
            // the milled edge, struck from the same brass
            Circle().fill(milling)
            // the bevel between edge and face
            Circle().fill(GaryMetal.rim).frame(width: coin - 5, height: coin - 5)
            // the face, lit from the upper left
            Circle()
                .fill(RadialGradient(colors: [GaryMetal.lit, GaryMetal.body, GaryMetal.deep],
                                     center: UnitPoint(x: 0.34, y: 0.28), startRadius: 1, endRadius: coin * 0.58))
                .frame(width: coin - 7, height: coin - 7)
            // Gary set into the face like a portrait, with the shadow the
            // setting would cast around him
            Image(GaryBrand.mark)
                .resizable().scaledToFill()
                .frame(width: coin - 13, height: coin - 13)
                .clipShape(Circle())
                .overlay(Circle().fill(RadialGradient(colors: [.clear, .black.opacity(0.45)],
                                                      center: UnitPoint(x: 0.38, y: 0.32),
                                                      startRadius: coin * 0.18, endRadius: coin * 0.42)))
                .overlay(Circle().strokeBorder(Color.black.opacity(0.55), lineWidth: 0.8))
                .overlay(Circle().strokeBorder(GaryMetal.lit.opacity(0.5), lineWidth: 0.5).blur(radius: 0.4).offset(y: 0.5))
            // the light crawling the rim
            Circle()
                .strokeBorder(AngularGradient(colors: [.clear, GaryMetal.spec.opacity(0.9), .clear, .clear],
                                              center: .center), lineWidth: 1.4)
                .frame(width: coin - 1, height: coin - 1)
                .rotationEffect(.degrees(sweep ? 360 : 0))
                .blendMode(.screen)
        }
        .frame(width: coin, height: coin)
        .shadow(color: .black.opacity(0.55), radius: 7, y: 4)
        .shadow(color: GaryMetal.body.opacity(0.28), radius: 12)
        .scaleEffect(pressed ? 0.93 : 1)
        .brightness(pressed ? -0.05 : 0)
    }

    /// Fine spokes, the knurl you feel on a chip's edge.
    private var milling: AngularGradient {
        var stops: [Gradient.Stop] = []
        let spokes = 44
        for i in 0..<spokes {
            let t = Double(i) / Double(spokes)
            stops.append(.init(color: i % 2 == 0 ? GaryMetal.lit : GaryMetal.deep, location: t))
            stops.append(.init(color: i % 2 == 0 ? GaryMetal.body : GaryMetal.rim, location: t + 0.5 / Double(spokes)))
        }
        return AngularGradient(stops: stops, center: .center)
    }
}

/// One brass, one light. Everything struck in the app reads off these.
enum GaryMetal {
    static let deep = Color(hex: "#5E430F")   // the shadowed side
    static let rim  = Color(hex: "#8A681B")   // the bevel
    static let body = Color(hex: "#C9A227")   // the brass itself
    static let lit  = Color(hex: "#E8CE72")   // the lit face
    static let spec = Color(hex: "#FFF6D8")   // the highlight, used sparingly
}

struct GaryTalkSheet: View {
    let date: String
    var candidateID: Int? = nil
    var focusLabel: String? = nil
    var context: String? = nil
    @ObservedObject private var store = GaryTalkStore.shared
    @Environment(\.dismiss) private var dismiss
    @State private var draft = ""
    @FocusState private var focused: Bool

    var body: some View {
        VStack(spacing: 0) {
            header
            LabHairline()
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 14) {
                        ForEach(store.messages) { message in
                            row(message).id(message.id)
                        }
                        if store.sending {
                            ProgressView().tint(GaryColors.gold).id("sending")
                        }
                        if let error = store.error {
                            Text(error).font(GaryFonts.ui(12.5, .medium)).foregroundStyle(GaryColors.loss).padding(.top, 2)
                        }
                    }
                    .padding(.horizontal, 18).padding(.vertical, 16)
                }
                .onChange(of: store.messages.count) { _ in
                    if let last = store.messages.last { withAnimation { proxy.scrollTo(last.id, anchor: .bottom) } }
                }
                .onChange(of: store.sending) { sending in
                    if sending { withAnimation { proxy.scrollTo("sending", anchor: .bottom) } }
                }
            }
            composer
        }
        .background(LabInk.plateDeep.ignoresSafeArea())
        .onAppear { store.prepare(for: date); focused = true }
        .presentationDragIndicator(.visible)
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text("GARY").font(GaryFonts.display(28)).foregroundStyle(GaryColors.warmWhite)
                if let focusLabel { Text(focusLabel).font(GaryFonts.ui(12, .medium)).foregroundStyle(LabInk.dim).lineLimit(1).minimumScaleFactor(0.7) }
            }
            Spacer()
            Button {
                store.voiceOn.toggle()
                if !store.voiceOn { GaryVoice.shared.stop() }
            } label: {
                Text(store.voiceOn ? "VOICE ON" : "VOICE OFF").font(GaryFonts.display(13)).tracking(1)
                    .foregroundStyle(store.voiceOn ? GaryColors.gold : LabInk.dimmer)
            }
            .buttonStyle(.plain)
            Button { dismiss() } label: {
                Image(systemName: "xmark").font(.system(size: 13, weight: .bold)).foregroundStyle(LabInk.dim)
                    .frame(width: 30, height: 30)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 18).padding(.top, 18).padding(.bottom, 12)
    }

    @ViewBuilder
    private func row(_ message: GaryTalkMessage) -> some View {
        switch message.role {
        case .fan:
            HStack {
                Spacer(minLength: 60)
                Text(message.text)
                    .font(GaryFonts.text(13.5)).foregroundStyle(GaryColors.warmWhite)
                    .padding(.horizontal, 12).padding(.vertical, 9)
                    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(message.failed ? GaryColors.loss.opacity(0.25) : LabInk.raised))
            }
        case .gary:
            VStack(alignment: .leading, spacing: 6) {
                ForEach(message.reads, id: \.self) { read in
                    HStack(spacing: 8) {
                        Circle().fill(GaryColors.gold).frame(width: 6, height: 6)
                        Text(read).font(GaryFonts.ui(11.5, .medium)).foregroundStyle(LabInk.dim)
                    }
                }
                HStack(alignment: .top, spacing: 12) {
                    Rectangle().fill(LinearGradient(colors: [GaryColors.gold, GaryColors.gold.opacity(0)], startPoint: .top, endPoint: .bottom)).frame(width: 2)
                    VStack(alignment: .leading, spacing: 8) {
                        Text("GARY").font(GaryFonts.display(13)).tracking(1.2).foregroundStyle(GaryColors.gold)
                        Text(message.text).font(GaryFonts.text(14)).foregroundStyle(LabInk.reading).fixedSize(horizontal: false, vertical: true)
                        Button { Task { await store.renderVoice(for: message.id) } } label: {
                            HStack(spacing: 6) {
                                if store.rendering == message.id {
                                    ProgressView().tint(GaryColors.gold).scaleEffect(0.6)
                                } else {
                                    Image(systemName: "waveform").font(.system(size: 11, weight: .semibold))
                                    Text("Hear it").font(GaryFonts.ui(12, .semibold))
                                }
                            }.foregroundStyle(GaryColors.gold)
                        }.buttonStyle(.plain).disabled(store.rendering == message.id)
                    }
                }
            }
            .padding(.trailing, 24)
        }
    }

    private var composer: some View {
        VStack(spacing: 0) {
            LabHairline()
            HStack(spacing: 10) {
                TextField("Ask about the board", text: $draft, axis: .vertical)
                    .font(GaryFonts.text(14)).foregroundStyle(GaryColors.warmWhite)
                    .lineLimit(1...4)
                    .focused($focused)
                    .submitLabel(.send)
                    .onSubmit { send() }
                Button(action: send) {
                    Image(systemName: "arrow.up").font(.system(size: 14, weight: .bold))
                        .foregroundStyle(draft.trimmingCharacters(in: .whitespaces).isEmpty ? LabInk.dimmer : Color.black)
                        .frame(width: 32, height: 32)
                        .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(draft.trimmingCharacters(in: .whitespaces).isEmpty ? LabInk.raised : GaryColors.gold))
                }
                .buttonStyle(.plain)
                .disabled(store.sending || draft.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
        }
        .background(LabInk.plate)
    }

    private func send() {
        let text = draft
        draft = ""
        Task { await store.send(text, date: date, candidateID: candidateID, context: context) }
    }
}
