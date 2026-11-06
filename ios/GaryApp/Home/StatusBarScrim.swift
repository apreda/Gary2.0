import SwiftUI

/// Status-bar scrim — every scrolling page fades its content under the clock
/// (Aug 3: bare rows collided with "9:41"). One component, one identity.
struct StatusBarScrim: View {
    var body: some View {
        // Nearly solid behind the clock itself, then a short fade just under it (Nov 6: a fixed 64 pt fade was already
        // half gone at the clock on a Dynamic Island phone, and rows still read through it).
        GeometryReader { geo in
            LinearGradient(stops: [.init(color: Color(hex: "#08080A").opacity(0.96), location: 0),
                                   .init(color: Color(hex: "#08080A").opacity(0.9), location: 0.72),
                                   .init(color: Color(hex: "#08080A").opacity(0), location: 1)],
                           startPoint: .top, endPoint: .bottom)
                .frame(height: geo.safeAreaInsets.top + 12)
                .ignoresSafeArea(edges: .top)
        }
        .allowsHitTesting(false)
    }
}
