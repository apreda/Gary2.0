import SwiftUI
import UIKit

// MARK: - Simulator tour harness (design QA)
//
// Lets the sim be driven from the host WITHOUT macOS Accessibility/Screen
// Recording grants: the host writes a command file into the app's data
// container and posts a Darwin notification; the app reads + dispatches it.
//
//   UDID=ED009270-1822-4142-8558-4931B381685D
//   CONT=$(xcrun simctl get_app_container $UDID ai.betwithgary.app data)
//   echo "winners props" > "$CONT/tmp/gary-tour.txt"
//   xcrun simctl spawn $UDID notifyutil -p com.gary.tour
//
// Commands (one per line: verb [args]):
//   tab 0..4                     switch root tab
//   winners games|props          Winners board mode
//   winners today                back to the live board
//   winners date 2026-07-02      Winners historical board
//   plans | auth | settings      present those sheets
//   flip                         flip every pick card (games + prop slips)
//   reveal                       open the first sealed Members card (in-place FX)
//   reseal                       clear the revealed ledger + re-seal cards
//   recelebrate                  clear the win-celebration ledger (count-up/confetti re-fire)
//   picks 2                      Picks carousel page index
//   picksday today|yesterday     Picks board day
//   hub mlb|nba|wc               Hub league tab
//   billfold LINE|CANDLES|SPORTS Billfold chart mode
//   scroll 800 / scroll -400     scroll the frontmost scroll view by px
//   dismiss                      dismiss the presented sheet
//
// The observer is only registered in DEBUG (`start()` is a no-op in Release),
// so nothing can post these commands in a shipping binary.
enum GaryTour {
    static let command = Notification.Name("GaryTourCommand")
    private static var revealBudget = 0

    static func start() {
        #if DEBUG
        let center = CFNotificationCenterGetDarwinNotifyCenter()
        CFNotificationCenterAddObserver(center, nil, { _, _, _, _, _ in
            DispatchQueue.main.async { GaryTour.fire() }
        }, "com.gary.tour" as CFString, nil, .deliverImmediately)
        #endif
    }

    private static func fire() {
        let path = NSTemporaryDirectory() + "gary-tour.txt"
        guard let raw = try? String(contentsOfFile: path, encoding: .utf8) else { return }
        for line in raw.split(separator: "\n") {
            let parts = line.split(separator: " ", maxSplits: 1).map(String.init)
            guard let verb = parts.first, !verb.isEmpty else { continue }
            handle(verb: verb, arg: parts.count > 1 ? parts[1] : "")
        }
    }

    private static func handle(verb: String, arg: String) {
        switch verb {
        case "scroll":
            scrollFrontmost(by: CGFloat(Double(arg) ?? 0))
        case "dismiss":
            topController()?.dismiss(animated: true)
        case "settings":
            NotificationCenter.default.post(name: Notification.Name("ShowSettingsMenu"), object: nil)
        case "reveal":
            revealBudget = max(1, Int(arg) ?? 1)
            post(verb, arg)
        case "reseal":
            RevealedPicks.clearAll()
            post(verb, arg)
        case "recelebrate":
            CelebratedWins.clearAll()
            post(verb, arg)
        default:
            post(verb, arg)
        }
    }

    /// MembersWrap instances race for this on "reveal" — only the first
    /// sealed card claims the budget, so one card opens per command.
    static func claimReveal() -> Bool {
        guard revealBudget > 0 else { return false }
        revealBudget -= 1
        return true
    }

    private static func post(_ verb: String, _ arg: String) {
        NotificationCenter.default.post(name: command, object: nil, userInfo: ["verb": verb, "arg": arg])
    }

    // MARK: UIKit plumbing

    /// Scroll the dominant vertical scroll view on the frontmost surface
    /// (the presented sheet when one is up, else the active tab page).
    private static func scrollFrontmost(by dy: CGFloat) {
        guard let window = frontWindow() else { return }
        let root: UIView = topController()?.view ?? window
        var best: UIScrollView? = nil
        func walk(_ v: UIView) {
            guard !v.isHidden, v.alpha > 0.01 else { return }   // skip opacity-parked tab pages
            if let sv = v as? UIScrollView,
               sv.contentSize.height > sv.bounds.height + 1,
               sv.bounds.height > (best?.bounds.height ?? 0) {
                best = sv
            }
            v.subviews.forEach(walk)
        }
        walk(root)
        guard let sv = best else { return }
        let minY = -sv.adjustedContentInset.top
        let maxY = max(minY, sv.contentSize.height + sv.adjustedContentInset.bottom - sv.bounds.height)
        let target = min(max(sv.contentOffset.y + dy, minY), maxY)
        sv.setContentOffset(CGPoint(x: sv.contentOffset.x, y: target), animated: false)
    }

    private static func frontWindow() -> UIWindow? {
        let windows = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
        return windows.first(where: { $0.isKeyWindow }) ?? windows.first(where: { !$0.isHidden })
    }

    private static func topController() -> UIViewController? {
        guard var top = frontWindow()?.rootViewController else { return nil }
        while let presented = top.presentedViewController { top = presented }
        return top
    }
}

extension View {
    /// Tour command receiver. Handlers only ever fire in DEBUG — `GaryTour.start()`
    /// is the sole poster and it's compiled out of Release.
    func onGaryTour(_ handler: @escaping (_ verb: String, _ arg: String) -> Void) -> some View {
        onReceive(NotificationCenter.default.publisher(for: GaryTour.command)) { note in
            guard let verb = note.userInfo?["verb"] as? String else { return }
            handler(verb, note.userInfo?["arg"] as? String ?? "")
        }
    }
}
