import SwiftUI

/// The Gary orb — a living visual presence for "Talk to Gary."
/// Four states with distinct visual languages:
///   - .idle: slow breathing pulse, calm gold gradient, ambient dust
///   - .listening: tight focused glow, amplitude-reactive ring, color shifts to amber
///   - .thinking: galactic swirl, rotating multi-layer gradients, denser particles
///   - .speaking: expanding wave-rings, warm gold/orange, audio-reactive scale
///
/// Implementation:
///   - TimelineView(.animation) for smooth 60fps redraws
///   - Canvas for particle field and waveform rendering
///   - Multiple SwiftUI layers with .blendMode for depth
///   - All math derived from a single time parameter so animations stay smooth
public enum GaryOrbState: Equatable {
    case idle
    case listening
    case speaking
    case thinking
}

public struct GaryOrbView: View {
    public var state: GaryOrbState
    /// 0...1 amplitude from mic (listening) or playback (speaking)
    public var amplitude: CGFloat = 0

    public init(state: GaryOrbState, amplitude: CGFloat = 0) {
        self.state = state
        self.amplitude = amplitude
    }

    public var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 60.0, paused: false)) { context in
            let t = context.date.timeIntervalSinceReferenceDate
            GeometryReader { geo in
                let size = min(geo.size.width, geo.size.height)
                ZStack {
                    OuterHalo(size: size, t: t, state: state, amplitude: amplitude)
                    ParticleField(size: size, t: t, state: state)
                    if state == .thinking {
                        GalacticSwirl(size: size, t: t)
                    }
                    if state == .speaking {
                        SpeakingRipples(size: size, t: t, amplitude: amplitude)
                    }

                    // SwiftUI core orb — base render for iOS 16 and the foundation
                    // for the Metal plasma shader to layer on top of (iOS 17+)
                    OrbCore(size: size, t: t, state: state, amplitude: amplitude)

                    // ── Metal plasma layer (iOS 17+) — paints fluid energy inside the orb ──
                    metalPlasmaLayer(size: size, t: t)

                    SpecularSheen(size: size, t: t, state: state, amplitude: amplitude)
                    if state == .listening {
                        ListeningRing(size: size, t: t, amplitude: amplitude)
                        WaveformBase(size: size, t: t, amplitude: amplitude)
                    }
                }
                .frame(width: size, height: size)
                .compositingGroup() // ensures blendModes work cleanly
                .modifier(MetalEdgeEffects(state: state, t: t, amplitude: amplitude))
            }
        }
    }

    // ── Metal plasma layer (color effect) ──
    @ViewBuilder
    private func metalPlasmaLayer(size: CGFloat, t: TimeInterval) -> some View {
        if #available(iOS 17.0, *) {
            Color.clear
                .frame(width: size * 0.72, height: size * 0.72)
                .colorEffect(
                    ShaderLibrary.garyPlasma(
                        .boundingRect,
                        .float(Float(t)),
                        .float(Self.stateFloat(state)),
                        .float(Float(amplitude))
                    )
                )
                .clipShape(Circle())
                .blendMode(.screen) // sit additively on top of the SwiftUI core
                .opacity(0.95)
                .allowsHitTesting(false)
        } else {
            EmptyView()
        }
    }

    /// Map state enum to a float for the shader (0=idle, 1=listening, 2=thinking, 3=speaking)
    fileprivate static func stateFloat(_ state: GaryOrbState) -> Float {
        switch state {
        case .idle: return 0.0
        case .listening: return 1.0
        case .thinking: return 2.0
        case .speaking: return 3.0
        }
    }
}

// MARK: - Metal edge effects (chromatic aberration + state-driven distortion)

@available(iOS 17.0, *)
private struct MetalEdgeEffectsIOS17: ViewModifier {
    let state: GaryOrbState
    let t: TimeInterval
    let amplitude: CGFloat

    func body(content: Content) -> some View {
        let chromaIntensity: Float = {
            switch state {
            case .idle: return 0.10
            case .listening: return 0.22 + Float(amplitude) * 0.20
            case .thinking: return 0.35
            case .speaking: return 0.28 + Float(amplitude) * 0.18
            }
        }()
        let distortAmp: Float = {
            switch state {
            case .idle: return 0.05
            case .listening: return 0.18 + Float(amplitude) * 0.30
            case .thinking: return 0.55
            case .speaking: return 0.35 + Float(amplitude) * 0.30
            }
        }()
        content
            .distortionEffect(
                ShaderLibrary.garyDistortion(
                    .float(Float(t)),
                    .float(distortAmp),
                    .float(GaryOrbView.stateFloat(state))
                ),
                maxSampleOffset: CGSize(width: 40, height: 40)
            )
            .layerEffect(
                ShaderLibrary.garyChromaAB(.boundingRect, .float(chromaIntensity)),
                maxSampleOffset: CGSize(width: 12, height: 12)
            )
    }
}

private struct MetalEdgeEffects: ViewModifier {
    let state: GaryOrbState
    let t: TimeInterval
    let amplitude: CGFloat

    func body(content: Content) -> some View {
        if #available(iOS 17.0, *) {
            content.modifier(MetalEdgeEffectsIOS17(state: state, t: t, amplitude: amplitude))
        } else {
            content
        }
    }
}

// MARK: - Outer halo (subtle rotating glow that grounds the orb)

private struct OuterHalo: View {
    let size: CGFloat
    let t: TimeInterval
    let state: GaryOrbState
    let amplitude: CGFloat

    var body: some View {
        let rotation = Double(t * rotationSpeed).truncatingRemainder(dividingBy: 360.0)
        Circle()
            .fill(
                AngularGradient(
                    gradient: Gradient(colors: haloColors),
                    center: .center,
                    angle: .degrees(rotation)
                )
            )
            .frame(width: size * 1.05, height: size * 1.05)
            .blur(radius: size * 0.10)
            .opacity(0.55 + amplitudeBoost * 0.20)
    }

    private var rotationSpeed: Double {
        switch state {
        case .idle: return 8
        case .listening: return 20
        case .thinking: return 30
        case .speaking: return 16
        }
    }

    private var amplitudeBoost: CGFloat { max(0, min(1, amplitude)) }

    private var haloColors: [Color] {
        switch state {
        case .listening:
            return [GaryColors.gold, .cyan.opacity(0.7), GaryColors.gold, .yellow.opacity(0.6), GaryColors.gold]
        case .thinking:
            return [GaryColors.gold, .purple.opacity(0.7), .orange.opacity(0.7), GaryColors.gold, .purple.opacity(0.6)]
        case .speaking:
            return [GaryColors.gold, .orange.opacity(0.85), .yellow.opacity(0.7), GaryColors.gold]
        case .idle:
            return [GaryColors.gold.opacity(0.5), Color(red: 0.55, green: 0.35, blue: 0.10).opacity(0.6), GaryColors.gold.opacity(0.5)]
        }
    }
}

// MARK: - Particle field (subtle floating motes)

private struct ParticleField: View {
    let size: CGFloat
    let t: TimeInterval
    let state: GaryOrbState

    private static let count = 36
    private static let seeds: [(angle: Double, radius: Double, speed: Double, baseSize: Double, phase: Double)] = (0..<count).map { i in
        let g = Double(i) / Double(count)
        return (
            angle: g * 2 * .pi,
            radius: 0.55 + 0.40 * fract(sin(Double(i) * 12.9898) * 43758.5453),
            speed: 0.10 + 0.30 * fract(sin(Double(i) * 78.233) * 12345.6789),
            baseSize: 1.5 + 3.0 * fract(sin(Double(i) * 33.317) * 67890.1234),
            phase: 6.28 * fract(sin(Double(i) * 4.7) * 98765.4321)
        )
    }

    var body: some View {
        Canvas { ctx, sz in
            let center = CGPoint(x: sz.width / 2, y: sz.height / 2)
            let r = min(sz.width, sz.height) / 2
            for s in Self.seeds {
                // each particle orbits at its own speed and pulses in brightness
                let theta = s.angle + t * s.speed + s.phase
                let wobble = sin(t * 0.7 + s.phase) * 0.04
                let dist = (s.radius + wobble) * r
                let x = center.x + CGFloat(cos(theta)) * dist
                let y = center.y + CGFloat(sin(theta)) * dist
                let brightnessPhase = sin(t * 1.4 + s.phase) * 0.5 + 0.5 // 0..1
                let dotSize = s.baseSize * (0.7 + brightnessPhase * 0.6) * densityMultiplier
                let opacity = (0.25 + brightnessPhase * 0.55) * densityMultiplier
                let color = particleColor(brightnessPhase: brightnessPhase)
                let rect = CGRect(x: x - dotSize / 2, y: y - dotSize / 2, width: dotSize, height: dotSize)
                ctx.fill(Path(ellipseIn: rect), with: .color(color.opacity(opacity)))
            }
        }
        .frame(width: size, height: size)
        .blendMode(.screen)
    }

    private var densityMultiplier: Double {
        switch state {
        case .idle: return 0.55
        case .listening: return 0.85
        case .thinking: return 1.10
        case .speaking: return 0.95
        }
    }

    private func particleColor(brightnessPhase: Double) -> Color {
        switch state {
        case .listening:
            return brightnessPhase > 0.6 ? .cyan : GaryColors.gold
        case .thinking:
            return brightnessPhase > 0.7 ? .purple : (brightnessPhase > 0.4 ? .orange : GaryColors.gold)
        case .speaking:
            return brightnessPhase > 0.6 ? .yellow : GaryColors.gold
        case .idle:
            return GaryColors.gold
        }
    }
}

// MARK: - Galactic swirl (thinking state)

private struct GalacticSwirl: View {
    let size: CGFloat
    let t: TimeInterval

    var body: some View {
        ZStack {
            ForEach(0..<3, id: \.self) { layer in
                let rot = Double(t * (8 + Double(layer) * 4)).truncatingRemainder(dividingBy: 360)
                Circle()
                    .fill(
                        AngularGradient(
                            gradient: Gradient(stops: [
                                .init(color: .clear, location: 0.0),
                                .init(color: GaryColors.gold.opacity(0.4), location: 0.25),
                                .init(color: .purple.opacity(0.5), location: 0.50),
                                .init(color: .orange.opacity(0.45), location: 0.75),
                                .init(color: .clear, location: 1.0),
                            ]),
                            center: .center,
                            angle: .degrees(rot)
                        )
                    )
                    .frame(width: size * (0.85 - 0.10 * CGFloat(layer)),
                           height: size * (0.85 - 0.10 * CGFloat(layer)))
                    .blur(radius: size * (0.025 + 0.010 * CGFloat(layer)))
                    .opacity(0.55)
            }
        }
        .blendMode(.screen)
    }
}

// MARK: - Speaking ripples

private struct SpeakingRipples: View {
    let size: CGFloat
    let t: TimeInterval
    let amplitude: CGFloat

    var body: some View {
        let amp = max(0, min(1, amplitude))
        ZStack {
            ForEach(0..<4, id: \.self) { i in
                let phase = (t * 0.7 + Double(i) * 0.35).truncatingRemainder(dividingBy: 1.6) / 1.6 // 0..1
                let progress = CGFloat(phase)
                let scale = 0.65 + progress * (0.55 + amp * 0.15)
                let alpha = (1.0 - Double(progress)) * (0.30 + Double(amp) * 0.20)
                Circle()
                    .stroke(GaryColors.gold.opacity(alpha), lineWidth: 1.8)
                    .frame(width: size * scale, height: size * scale)
            }
        }
    }
}

// MARK: - Orb core

private struct OrbCore: View {
    let size: CGFloat
    let t: TimeInterval
    let state: GaryOrbState
    let amplitude: CGFloat

    var body: some View {
        let amp = max(0, min(1, amplitude))
        let breath = breathing(t: t)
        let scale = baseScale + breath * pulseDepth + amp * 0.05
        ZStack {
            // Deep inner gradient
            Circle()
                .fill(
                    RadialGradient(
                        gradient: Gradient(colors: coreColors),
                        center: .center,
                        startRadius: 0,
                        endRadius: size * 0.55
                    )
                )
                .frame(width: size * 0.72, height: size * 0.72)

            // Inner subtle "iris" — gets tighter during listening, looser during speaking
            Circle()
                .fill(
                    RadialGradient(
                        gradient: Gradient(colors: [Color.black.opacity(irisOpacity), .clear]),
                        center: .center,
                        startRadius: 0,
                        endRadius: size * irisRadius
                    )
                )
                .frame(width: size * 0.72, height: size * 0.72)
                .blendMode(.multiply)
        }
        .scaleEffect(scale)
        .shadow(color: shadowColor.opacity(0.6 + Double(amp) * 0.2), radius: size * (0.16 + Double(amp) * 0.06))
        .animation(.spring(response: 0.5, dampingFraction: 0.7), value: state)
    }

    private var baseScale: CGFloat { 1.0 }

    private var pulseDepth: CGFloat {
        switch state {
        case .idle: return 0.025
        case .listening: return 0.045
        case .thinking: return 0.035
        case .speaking: return 0.060
        }
    }

    private func breathing(t: TimeInterval) -> CGFloat {
        let speed: Double = {
            switch state {
            case .idle: return 0.45
            case .listening: return 1.20
            case .thinking: return 0.85
            case .speaking: return 1.40
            }
        }()
        return CGFloat(sin(t * speed * 2.0 * .pi))
    }

    private var coreColors: [Color] {
        switch state {
        case .idle:
            return [
                Color(red: 1.0, green: 0.86, blue: 0.42),
                GaryColors.gold,
                Color(red: 0.55, green: 0.36, blue: 0.10),
                Color(red: 0.18, green: 0.12, blue: 0.04),
            ]
        case .listening:
            return [
                Color(red: 1.0, green: 0.93, blue: 0.68),
                Color(red: 0.95, green: 0.75, blue: 0.30),
                Color(red: 0.45, green: 0.30, blue: 0.10),
                Color(red: 0.15, green: 0.10, blue: 0.04),
            ]
        case .thinking:
            return [
                Color(red: 0.95, green: 0.78, blue: 0.40),
                Color(red: 0.75, green: 0.45, blue: 0.55), // hint of purple in the warm core
                Color(red: 0.45, green: 0.25, blue: 0.30),
                Color(red: 0.15, green: 0.10, blue: 0.12),
            ]
        case .speaking:
            return [
                Color(red: 1.0, green: 0.90, blue: 0.50),
                Color(red: 1.0, green: 0.72, blue: 0.25),
                Color(red: 0.70, green: 0.35, blue: 0.05),
                Color(red: 0.25, green: 0.12, blue: 0.02),
            ]
        }
    }

    private var irisOpacity: Double {
        switch state {
        case .listening: return 0.38
        case .speaking: return 0.18
        case .thinking: return 0.28
        case .idle: return 0.25
        }
    }

    private var irisRadius: CGFloat {
        switch state {
        case .listening: return 0.20
        case .speaking: return 0.10
        case .thinking: return 0.18
        case .idle: return 0.16
        }
    }

    private var shadowColor: Color {
        switch state {
        case .listening: return .cyan
        case .thinking: return .purple
        case .speaking: return .orange
        case .idle: return GaryColors.gold
        }
    }
}

// MARK: - Specular sheen (subtle "alive" highlight)

private struct SpecularSheen: View {
    let size: CGFloat
    let t: TimeInterval
    let state: GaryOrbState
    let amplitude: CGFloat

    var body: some View {
        let drift = CGFloat(sin(t * 0.3)) * 0.04
        let amp = max(0, min(1, amplitude))
        Circle()
            .fill(
                RadialGradient(
                    gradient: Gradient(colors: [
                        Color.white.opacity(0.55 + Double(amp) * 0.10),
                        Color.white.opacity(0.10),
                        .clear,
                    ]),
                    center: UnitPoint(x: 0.35 + drift, y: 0.32 - drift / 2),
                    startRadius: 0,
                    endRadius: size * 0.28
                )
            )
            .frame(width: size * 0.62, height: size * 0.62)
            .blendMode(.screen)
    }
}

// MARK: - Listening ring (focused, amplitude-reactive)

private struct ListeningRing: View {
    let size: CGFloat
    let t: TimeInterval
    let amplitude: CGFloat

    var body: some View {
        let amp = max(0, min(1, amplitude))
        let pulse = CGFloat(sin(t * 4.0)) * 0.02 + amp * 0.10
        Circle()
            .stroke(
                LinearGradient(
                    gradient: Gradient(colors: [GaryColors.gold, .cyan.opacity(0.85), GaryColors.gold]),
                    startPoint: .top,
                    endPoint: .bottom
                ),
                style: StrokeStyle(lineWidth: 2.5 + amp * 1.5)
            )
            .frame(width: size * (0.78 + pulse), height: size * (0.78 + pulse))
            .opacity(0.85)
    }
}

// MARK: - Waveform (small audio bars under orb)

private struct WaveformBase: View {
    let size: CGFloat
    let t: TimeInterval
    let amplitude: CGFloat

    private static let barCount = 24

    var body: some View {
        let amp = Double(max(0, min(1, amplitude)))
        HStack(spacing: size * 0.012) {
            ForEach(0..<Self.barCount, id: \.self) { i in
                let phase = Double(i) * 0.4
                let oscill = sin(t * 6 + phase) * 0.5 + 0.5 // 0..1
                let height = size * 0.04 + CGFloat(oscill) * size * 0.10 * CGFloat(0.4 + amp * 0.8)
                RoundedRectangle(cornerRadius: 1.5)
                    .fill(GaryColors.gold.opacity(0.55 + oscill * 0.35))
                    .frame(width: size * 0.015, height: height)
            }
        }
        .frame(width: size * 0.78)
        .offset(y: size * 0.38)
    }
}

// MARK: - Helpers

private func fract(_ x: Double) -> Double {
    let f = x - floor(x)
    return f < 0 ? f + 1 : f
}

#if DEBUG
struct GaryOrbView_Previews: PreviewProvider {
    static var previews: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            VStack(spacing: 24) {
                GaryOrbView(state: .idle).frame(width: 280, height: 280)
                GaryOrbView(state: .listening, amplitude: 0.6).frame(width: 280, height: 280)
                GaryOrbView(state: .thinking).frame(width: 280, height: 280)
                GaryOrbView(state: .speaking, amplitude: 0.4).frame(width: 280, height: 280)
            }
        }
    }
}
#endif
