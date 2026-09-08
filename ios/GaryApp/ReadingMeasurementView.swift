import SwiftUI
import UIKit

private struct ReadingPageActiveKey: EnvironmentKey { static let defaultValue = false }
extension EnvironmentValues {
    /// Set explicitly by the root tab host. Opacity-hidden mounted tabs must
    /// never infer visibility from onAppear or a screen-intersecting frame.
    var readingPageActive: Bool {
        get { self[ReadingPageActiveKey.self] }
        set { self[ReadingPageActiveKey.self] = newValue }
    }
}

@MainActor
final class ReadingMeasurementCenter: ObservableObject {
    static let shared = ReadingMeasurementCenter()
    @Published private(set) var contextVersion = 0
    private var measurement = UsefulSessionMeasurement()

    func context(consent: Bool, foreground: Bool, accountID: String?) {
        let events = measurement.updateContext(consent: consent, foreground: foreground,
                                              accountID: accountID, now: ProcessInfo.processInfo.systemUptime)
        contextVersion += 1
        send(events)
    }
    func sample(presentation: UUID, key: String, surface: UsefulSessionMeasurement.Surface, visible: Bool) -> Bool {
        send(measurement.observe(presentation: presentation, contentKey: key, surface: surface,
                                 visible: visible, now: ProcessInfo.processInfo.systemUptime))
        return measurement.hasMeasured(key)
    }
    func end(_ id: UUID) { measurement.endPresentation(id) }
    private func send(_ events: [UsefulSessionMeasurement.Event]) {
        for event in events { SupabaseAPI.logEvent(event.name, event.props) }
    }
}

/// Apply once at ContentView, so sessions without any useful read are included
/// in the denominator. IDs remain in the center's memory and never UserDefaults.
struct ReadingMeasurementLifecycle: ViewModifier {
    @Environment(\.scenePhase) private var phase
    @AppStorage(PrivacyPreferences.readingAnalyticsKey) private var allowed = false
    @ObservedObject private var auth = AuthManager.shared
    func body(content: Content) -> some View {
        content
            .onAppear { update() }
            .onChange(of: phase) { _ in update() }
            .onChange(of: allowed) { _ in update() }
            .onChange(of: auth.currentUser?.id) { _ in update() }
            .onDisappear { ReadingMeasurementCenter.shared.context(consent: allowed, foreground: false, accountID: auth.currentUser?.id) }
    }
    private func update() {
        ReadingMeasurementCenter.shared.context(consent: allowed, foreground: phase == .active, accountID: auth.currentUser?.id)
    }
}

struct ReadingContentTarget {
    /// Local deduplication only. This key never enters an analytics payload.
    let key: String
    let surface: UsefulSessionMeasurement.Surface
}

private struct OriginalReasoningMeasurement: ViewModifier {
    let target: ReadingContentTarget?
    let presented: Bool
    @Environment(\.readingPageActive) private var activePage
    @Environment(\.scenePhase) private var phase
    @AppStorage(PrivacyPreferences.readingAnalyticsKey) private var allowed = false
    @ObservedObject private var center = ReadingMeasurementCenter.shared
    @ObservedObject private var leagueOverlay = LeagueOverlayState.shared
    @ObservedObject private var pickOverlay = PickDetailState.shared
    func body(content: Content) -> some View {
        content.background {
            if let target, allowed, activePage, phase == .active, presented,
               !leagueOverlay.isOpen, !pickOverlay.isShowing {
                ReadingVisibilityProbe(target: target, contextVersion: center.contextVersion)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
        }
    }
}

extension View {
    func measureOriginalReasoning(_ target: ReadingContentTarget?, presented: Bool) -> some View {
        modifier(OriginalReasoningMeasurement(target: target, presented: presented))
    }
}

private struct ReadingVisibilityProbe: UIViewRepresentable {
    let target: ReadingContentTarget
    let contextVersion: Int
    func makeUIView(context: Context) -> ReadingProbeView { ReadingProbeView() }
    func updateUIView(_ view: ReadingProbeView, context: Context) {
        view.configure(target: target, contextVersion: contextVersion)
    }
    static func dismantleUIView(_ view: ReadingProbeView, coordinator: ()) { view.stop() }
}

/// Inspect only this text's view geometry. No screenshots, content extraction,
/// touch capture, SDK, persistent identifier or network calls live here.
private final class ReadingProbeView: UIView {
    private let presentation = UUID()
    private var target: ReadingContentTarget?
    private var contextVersion = -1
    private var link: CADisplayLink?
    private var finished = false

    func configure(target: ReadingContentTarget, contextVersion: Int) {
        if self.target?.key != target.key || self.contextVersion != contextVersion {
            stop(); finished = false
        }
        self.target = target; self.contextVersion = contextVersion
        startIfNeeded()
    }
    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window == nil { stop() } else { startIfNeeded() }
    }
    private func startIfNeeded() {
        guard window != nil, target != nil, link == nil, !finished else { return }
        let next = CADisplayLink(target: self, selector: #selector(sample))
        next.preferredFramesPerSecond = 10
        next.add(to: .main, forMode: .common)
        link = next
    }
    func stop() {
        link?.invalidate(); link = nil
        ReadingMeasurementCenter.shared.end(presentation)
    }
    @objc private func sample() {
        guard let target else { stop(); return }
        finished = ReadingMeasurementCenter.shared.sample(presentation: presentation, key: target.key,
                                                         surface: target.surface, visible: reasoningIsVisible)
        if finished { stop() }
    }
    private var reasoningIsVisible: Bool {
        guard UIApplication.shared.applicationState == .active, let window, window.isKeyWindow,
              bounds.width >= 32, bounds.height >= 32 else { return false }
        // Be conservative around the floating dock, safe-area chrome and sheets.
        var viewport = window.bounds.inset(by: window.safeAreaInsets)
        viewport.size.height = max(0, viewport.height - 96)
        let textRect = convert(bounds, to: window)
        var clips: [CGRect] = []
        var ancestor: UIView? = self
        while let view = ancestor {
            if view.isHidden || view.alpha < 0.99 { return false }
            if view.clipsToBounds { clips.append(view.convert(view.bounds, to: window)) }
            ancestor = view.superview
        }
        var responder: UIResponder? = self
        while let item = responder {
            if let controller = item as? UIViewController,
               let presented = controller.presentedViewController, !presented.isBeingDismissed { return false }
            responder = item.next
        }
        return ReasoningViewport.readable(text: textRect, viewport: viewport, clips: clips, unobscured: true)
    }
}
