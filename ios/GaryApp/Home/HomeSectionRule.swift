import SwiftUI

/// BARE section rule (founder, Aug 4, round 2: the state lines and the gold
/// slash went the way of the section names — "clean up the other stuff").
/// One hairline is all the punctuation a block boundary gets; the content
/// says everything else. Tint stays so the board's rule can go win-green
/// while games are live.
struct HomeSectionRule: View {
    var tint: Color = GaryColors.gold
    var body: some View {
        Rectangle().fill(tint.opacity(0.25)).frame(height: 1)
            .pageGutter()
            .padding(.top, 6)
    }
}

