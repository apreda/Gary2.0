import SwiftUI

/// Status-bar scrim — every scrolling page fades its content under the clock
/// (Aug 3: bare rows collided with "9:41"). One component, one identity.
struct StatusBarScrim: View {
    var body: some View {
        VStack(spacing: 0) {
            LinearGradient(colors: [Color(hex: "#08080A").opacity(0.94),
                                    Color(hex: "#08080A").opacity(0)],
                           startPoint: .top, endPoint: .bottom)
                .frame(height: 64)
            Spacer(minLength: 0)
        }
        .ignoresSafeArea(edges: .top)
        .allowsHitTesting(false)
    }
}

