import SwiftUI

/// Creating the carousel's lightweight page list must not eagerly resolve
/// every game's picks, grades and scout inputs. SwiftUI requests this content
/// when the page controller mounts the page (including its swipe neighbours).
struct DeferredPicksPage<Content: View>: View {
    @ViewBuilder let content: () -> Content
    var body: some View { content() }
}
