import SwiftUI

/// The "Talk to Gary" tab. Orb-first design — the orb is the ONLY interactive element.
/// Tap orb to start listening, tap again to send. Conversation transcript fades in below.
struct GaryChatView: View {

    @StateObject private var vm = GaryChatViewModel()
    @State private var hasInitializedPermissions: Bool = false

    var body: some View {
        ZStack {
            // Deep ambient background — Gary's environment, not a chat UI
            ambientBackground

            VStack(spacing: 0) {
                // Top status pill — minimal, just shows what Gary's doing
                statusPill
                    .padding(.top, 12)
                    .padding(.bottom, 8)

                Spacer(minLength: 0)

                // THE ORB — dead center, large, tap to talk
                orbInteractive
                    .padding(.bottom, 14)

                // Status text right below orb (bigger, primary)
                primaryStatusText
                    .padding(.bottom, 24)

                // Minimal transcript — last few turns, fading older ones
                transcriptArea
                    .frame(maxHeight: 220)
                    .padding(.horizontal, 24)

                Spacer(minLength: 12)
            }
        }
        .navigationBarHidden(true)
        .alert("Heads up", isPresented: $vm.showAlert, presenting: vm.alertMessage) { _ in
            Button("OK", role: .cancel) { }
        } message: { msg in
            Text(msg)
        }
        .task {
            if !hasInitializedPermissions {
                hasInitializedPermissions = true
                await vm.requestPermissions()
            }
        }
    }

    // MARK: - Background

    private var ambientBackground: some View {
        ZStack {
            // Deep gradient
            LinearGradient(
                colors: [Color.black, Color(red: 0.06, green: 0.05, blue: 0.04)],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            // Subtle radial vignette pointing at the orb
            RadialGradient(
                gradient: Gradient(colors: [
                    GaryColors.gold.opacity(0.10),
                    Color.clear,
                ]),
                center: .center,
                startRadius: 0,
                endRadius: 320
            )
            .ignoresSafeArea()
        }
    }

    // MARK: - Status pill (top)

    private var statusPill: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(statusDotColor)
                .frame(width: 7, height: 7)
                .shadow(color: statusDotColor.opacity(0.7), radius: 3)
            Text("GARY")
                .font(.system(size: 11, weight: .heavy))
                .tracking(2.2)
                .foregroundStyle(.white.opacity(0.75))
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 6)
        .background(
            Capsule()
                .fill(.ultraThinMaterial)
                .overlay(Capsule().stroke(GaryColors.gold.opacity(0.25), lineWidth: 0.8))
        )
    }

    private var statusDotColor: Color {
        switch vm.orbState {
        case .idle: return GaryColors.gold.opacity(0.6)
        case .listening: return .cyan
        case .thinking: return .purple
        case .speaking: return .orange
        }
    }

    // MARK: - Orb (the only tappable thing)

    private var orbInteractive: some View {
        GaryOrbView(state: vm.orbState, amplitude: CGFloat(vm.amplitude))
            .frame(width: orbDiameter, height: orbDiameter)
            .contentShape(Circle())
            .onTapGesture {
                handleOrbTap()
            }
            .scaleEffect(orbTapScale)
            .animation(.spring(response: 0.35, dampingFraction: 0.7), value: vm.orbState)
            .accessibilityLabel(orbAccessibilityLabel)
            .accessibilityAddTraits(.isButton)
    }

    private var orbDiameter: CGFloat {
        // Take a substantial portion of the screen — this is the hero element
        UIScreen.main.bounds.width * 0.78
    }

    private var orbTapScale: CGFloat {
        switch vm.orbState {
        case .listening: return 1.02
        case .thinking: return 1.0
        case .speaking: return 1.0
        case .idle: return 1.0
        }
    }

    private var orbAccessibilityLabel: String {
        switch vm.orbState {
        case .idle: return "Tap to talk to Gary"
        case .listening: return "Listening. Tap to send."
        case .thinking: return "Gary is thinking."
        case .speaking: return "Gary is talking. Tap to stop."
        }
    }

    private func handleOrbTap() {
        // Light haptic on every interaction
        let haptic = UIImpactFeedbackGenerator(style: .medium)
        haptic.impactOccurred()

        switch vm.orbState {
        case .idle:
            vm.toggleMic() // starts listening
        case .listening:
            vm.toggleMic() // stops listening, sends to Gary
        case .speaking:
            vm.interruptSpeaking() // tap orb mid-speak to stop Gary
        case .thinking:
            break // can't interrupt thinking; let it finish
        }
    }

    // MARK: - Primary status text (right under orb)

    private var primaryStatusText: some View {
        Text(primaryLabel)
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(.white.opacity(0.65))
            .textCase(.uppercase)
            .tracking(1.4)
            .animation(.easeOut(duration: 0.25), value: primaryLabel)
    }

    private var primaryLabel: String {
        switch vm.orbState {
        case .idle:
            return "Tap to talk to Gary"
        case .listening:
            return "Listening — tap when done"
        case .thinking:
            return "Gary's thinking…"
        case .speaking:
            return "Tap to interrupt"
        }
    }

    // MARK: - Transcript

    private var transcriptArea: some View {
        ScrollViewReader { proxy in
            ScrollView(showsIndicators: false) {
                VStack(spacing: 10) {
                    if vm.messages.isEmpty {
                        emptyHint
                    } else {
                        ForEach(vm.messages.suffix(8)) { msg in
                            transcriptLine(msg)
                                .id(msg.id)
                        }
                    }
                }
                .padding(.vertical, 4)
            }
            .onChange(of: vm.messages.count) { _ in
                if let last = vm.messages.last {
                    withAnimation(.easeOut(duration: 0.4)) {
                        proxy.scrollTo(last.id, anchor: .bottom)
                    }
                }
            }
            .mask(
                LinearGradient(
                    gradient: Gradient(stops: [
                        .init(color: .clear, location: 0.0),
                        .init(color: .black, location: 0.18),
                        .init(color: .black, location: 1.0),
                    ]),
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
        }
    }

    private var emptyHint: some View {
        VStack(spacing: 6) {
            Text("Try")
                .font(.system(size: 11, weight: .semibold))
                .tracking(1.2)
                .foregroundStyle(.white.opacity(0.40))
                .textCase(.uppercase)
            Text("\u{201c}Who you got tonight?\u{201d}")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(.white.opacity(0.55))
            Text("\u{201c}Why'd you take the Reds?\u{201d}")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(.white.opacity(0.55))
            Text("\u{201c}How's the Yankees pen looking?\u{201d}")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(.white.opacity(0.55))
        }
        .padding(.top, 14)
    }

    private func transcriptLine(_ msg: GaryChatViewModel.ChatMessage) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text(msg.isUser ? "YOU" : "GARY")
                .font(.system(size: 9, weight: .heavy))
                .tracking(1.2)
                .foregroundStyle(msg.isUser ? Color.white.opacity(0.40) : GaryColors.gold.opacity(0.85))
                .frame(width: 42, alignment: .leading)
                .padding(.top, 2)
            Text(msg.text)
                .font(.system(size: 14, weight: msg.isUser ? .medium : .regular))
                .foregroundStyle(msg.isUser ? .white.opacity(0.75) : .white.opacity(0.92))
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .transition(.opacity.combined(with: .move(edge: .bottom)))
    }
}
