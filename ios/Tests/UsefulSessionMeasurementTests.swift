import Foundation
import CoreGraphics

@main
struct UsefulSessionMeasurementTests {
    static let sessionA = "10000000-0000-4000-8000-000000000001"
    static let sessionB = "20000000-0000-4000-8000-000000000002"
    static func main() {
        let presentation = UUID(), secondPresentation = UUID()
        var meter = UsefulSessionMeasurement()
        precondition(meter.updateContext(consent: false, foreground: true, accountID: nil, now: 0).isEmpty)
        precondition(meter.observe(presentation: presentation, contentKey: "never-sent", surface: .gameCard, visible: true, now: 6).isEmpty)
        let start = meter.updateContext(consent: true, foreground: true, accountID: "local-owner", now: 10, makeID: { sessionA })
        precondition(start.count == 1 && start[0].name == "session_started")
        precondition(start[0].props == ["session_id": sessionA, "measurement_version": "reasoning_v2"])
        precondition(meter.updateContext(consent: true, foreground: true, accountID: "local-owner", now: 11).isEmpty)
        // Mounted but hidden, collapsed, clipped or covered text is not a read.
        for index in 0...60 {
            precondition(meter.observe(presentation: presentation, contentKey: "hidden", surface: .gameCard, visible: false, now: 20 + Double(index) / 10).isEmpty)
        }
        // Four seconds, then one invisible sample: the next read starts over.
        for index in 0...40 {
            precondition(meter.observe(presentation: presentation, contentKey: "private-content-key", surface: .gameCard, visible: true, now: 30 + Double(index) / 10).isEmpty)
        }
        precondition(meter.observe(presentation: presentation, contentKey: "private-content-key", surface: .gameCard, visible: false, now: 34.1).isEmpty)
        for index in 0..<50 {
            precondition(meter.observe(presentation: presentation, contentKey: "private-content-key", surface: .gameCard, visible: true, now: 35 + Double(index) / 10).isEmpty)
        }
        let read = meter.observe(presentation: presentation, contentKey: "private-content-key", surface: .gameCard, visible: true, now: 40)
        precondition(read.count == 1 && read[0].name == "meaningful_pick_view")
        precondition(read[0].props == ["session_id": sessionA, "measurement_version": "reasoning_v2", "content_type": "pick", "surface": "game_card"])
        // Reopening, another card instance or a foreground return cannot double-count.
        meter.endPresentation(presentation)
        for index in 0...60 {
            precondition(meter.observe(presentation: secondPresentation, contentKey: "private-content-key", surface: .gameCard, visible: true, now: 41 + Double(index) / 10).isEmpty)
        }
        precondition(meter.updateContext(consent: true, foreground: false, accountID: "local-owner", now: 50).isEmpty)
        precondition(meter.updateContext(consent: true, foreground: true, accountID: "local-owner", now: 55).isEmpty)
        precondition(meter.hasMeasured("private-content-key"))
        // A main-thread stall is not evidence of continuously visible reading.
        precondition(meter.observe(presentation: presentation, contentKey: "stall", surface: .propCard, visible: true, now: 60).isEmpty)
        precondition(meter.observe(presentation: presentation, contentKey: "stall", surface: .propCard, visible: true, now: 70).isEmpty)
        for index in 1..<50 {
            precondition(meter.observe(presentation: presentation, contentKey: "stall", surface: .propCard, visible: true, now: 70 + Double(index) / 10).isEmpty)
        }
        precondition(meter.observe(presentation: presentation, contentKey: "stall", surface: .propCard, visible: true, now: 75).count == 1)
        // Backgrounding resets an incomplete read, even during a short return.
        for index in 0...40 { _ = meter.observe(presentation: presentation, contentKey: "interrupted", surface: .gameCard, visible: true, now: 80 + Double(index) / 10) }
        _ = meter.updateContext(consent: true, foreground: false, accountID: "local-owner", now: 84)
        _ = meter.updateContext(consent: true, foreground: true, accountID: "local-owner", now: 85)
        for index in 0..<50 {
            precondition(meter.observe(presentation: presentation, contentKey: "interrupted", surface: .gameCard, visible: true, now: 85 + Double(index) / 10).isEmpty)
        }
        precondition(meter.observe(presentation: presentation, contentKey: "interrupted", surface: .gameCard, visible: true, now: 90).count == 1)
        // Thirty-minute background cutoff starts a denominator before any new read.
        _ = meter.updateContext(consent: true, foreground: false, accountID: "local-owner", now: 100)
        let resumed = meter.updateContext(consent: true, foreground: true, accountID: "local-owner", now: 1900, makeID: { sessionB })
        precondition(resumed.count == 1 && meter.sessionID == sessionB && !meter.hasMeasured("private-content-key"))
        let changed = meter.updateContext(consent: true, foreground: true, accountID: nil, now: 1901, makeID: { sessionA })
        precondition(changed.count == 1 && meter.sessionID == sessionA)
        _ = meter.updateContext(consent: false, foreground: true, accountID: nil, now: .nan)
        precondition(meter.sessionID == nil && !meter.consented)
        precondition(meter.observe(presentation: presentation, contentKey: "revoked", surface: .gameCard, visible: true, now: 2000).isEmpty)
        precondition(meter.updateContext(consent: true, foreground: true, accountID: nil, now: 2001, makeID: { sessionB }).count == 1)
        // A fresh app process never restores a previous session or a measured-key set.
        let fresh = UsefulSessionMeasurement()
        precondition(fresh.sessionID == nil && !fresh.hasMeasured("private-content-key"))

        let viewport = CGRect(x: 0, y: 0, width: 390, height: 650)
        let text = CGRect(x: 20, y: 100, width: 350, height: 500)
        precondition(ReasoningViewport.readable(text: text, viewport: viewport, clips: [], unobscured: true))
        precondition(!ReasoningViewport.readable(text: text, viewport: viewport, clips: [], unobscured: false))
        precondition(!ReasoningViewport.readable(text: text.offsetBy(dx: 0, dy: 700), viewport: viewport, clips: [], unobscured: true))
        precondition(!ReasoningViewport.readable(text: text, viewport: viewport, clips: [CGRect(x: 0, y: 0, width: 390, height: 131)], unobscured: true))
        precondition(ReasoningViewport.readable(text: text, viewport: viewport, clips: [CGRect(x: 0, y: 0, width: 390, height: 132)], unobscured: true))
        precondition(!ReasoningViewport.readable(text: text, viewport: viewport, clips: [CGRect(x: 0, y: 0, width: 51, height: 650)], unobscured: true))
        precondition(!ReasoningViewport.readable(text: .null, viewport: viewport, clips: [], unobscured: true))
        print("USEFUL_SESSION_MEASUREMENT_OK")
    }
}
