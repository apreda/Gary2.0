import Foundation
import CoreGraphics

/// In-memory measurement only. Callers supply monotonic time and actual
/// foreground/visibility state; this value has no storage or network access.
struct UsefulSessionMeasurement {
    struct Event: Equatable {
        let name: String
        let props: [String: String]
    }
    enum Surface: String { case gameCard = "game_card", propCard = "prop_card" }
    private struct Reading {
        let contentKey: String
        let surface: Surface
        var started: TimeInterval
        var lastSample: TimeInterval
    }
    static let readingSeconds: TimeInterval = 5
    static let backgroundSessionTimeout: TimeInterval = 30 * 60
    // A stalled main run loop cannot establish uninterrupted visibility.
    static let maximumSampleGap: TimeInterval = 0.25
    private(set) var sessionID: String?
    private(set) var foreground = false
    private(set) var consented = false
    private var accountID: String?
    private var backgroundedAt: TimeInterval?
    private var readings: [UUID: Reading] = [:]
    private var measured: Set<String> = []

    mutating func updateContext(consent: Bool, foreground nextForeground: Bool,
                                accountID nextAccount: String?, now: TimeInterval,
                                makeID: () -> String = { UUID().uuidString }) -> [Event] {
        let accountChanged = nextAccount != accountID
        accountID = nextAccount
        if !consent {
            consented = false; foreground = nextForeground
            resetSession(); backgroundedAt = nil
            return []
        }
        guard now.isFinite, now >= 0 else { foreground = false; readings.removeAll(); return [] }
        consented = true
        if accountChanged { resetSession() }
        if !nextForeground {
            if foreground || backgroundedAt == nil { backgroundedAt = now }
            foreground = false; readings.removeAll()
            return []
        }
        if let last = backgroundedAt, now < last || now - last >= Self.backgroundSessionTimeout { resetSession() }
        foreground = true; backgroundedAt = nil
        guard sessionID == nil else { return [] }
        let id = makeID()
        guard UUID(uuidString: id) != nil else { return [] }
        sessionID = id
        return [Event(name: "session_started", props: ["session_id": id, "measurement_version": "reasoning_v2"])]
    }

    mutating func observe(presentation: UUID, contentKey: String, surface: Surface,
                         visible: Bool, now: TimeInterval) -> [Event] {
        guard consented, foreground, let sessionID, visible, now.isFinite,
              !contentKey.isEmpty, !measured.contains(contentKey) else {
            readings.removeValue(forKey: presentation); return []
        }
        guard var reading = readings[presentation], reading.contentKey == contentKey,
              reading.surface == surface, now >= reading.lastSample,
              now - reading.lastSample <= Self.maximumSampleGap else {
            readings[presentation] = Reading(contentKey: contentKey, surface: surface, started: now, lastSample: now)
            return []
        }
        reading.lastSample = now; readings[presentation] = reading
        guard now - reading.started >= Self.readingSeconds else { return [] }
        measured.insert(contentKey)
        readings = readings.filter { $0.value.contentKey != contentKey }
        return [Event(name: "meaningful_pick_view", props: ["session_id": sessionID,
            "measurement_version": "reasoning_v2", "content_type": "pick", "surface": surface.rawValue])]
    }

    func hasMeasured(_ contentKey: String) -> Bool { measured.contains(contentKey) }
    mutating func endPresentation(_ id: UUID) { readings.removeValue(forKey: id) }
    private mutating func resetSession() {
        sessionID = nil; readings.removeAll(); measured.removeAll()
    }
}

/// The exact original-text rectangle must intersect every scroll clip and the
/// unobstructed viewport by at least 32 points in both dimensions.
enum ReasoningViewport {
    static func readable(text: CGRect, viewport: CGRect, clips: [CGRect], unobscured: Bool) -> Bool {
        guard unobscured, [text, viewport].allSatisfy({
            !$0.isNull && !$0.isInfinite && $0.minX.isFinite && $0.minY.isFinite && $0.width.isFinite && $0.height.isFinite
        }) else { return false }
        var visible = text.intersection(viewport)
        for clip in clips { visible = visible.intersection(clip) }
        return !visible.isNull && visible.width >= 32 && visible.height >= 32
    }
}
