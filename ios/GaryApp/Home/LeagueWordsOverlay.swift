import SwiftUI

// MARK: - League Words (founder pick, Aug 4 — mock 64 "Big Words", verbatim)
//
// The league switcher: the page dims to near-black and the leagues stack HUGE
// in the display face — the words are the interface. No panel, no chrome, no
// push; "it was perfect the way you had it." Replaces the underline league
// tabs the Hub and Picks mastheads used to wear. Presented app-wide (over the
// dock too) from ContentView; pages call `present` with their own options.

final class LeagueOverlayState: ObservableObject {
    static let shared = LeagueOverlayState()
    struct Option: Identifiable {
        let id = UUID()
        /// The big word ("MLB", "MLB HR", "NFL").
        let code: String
        /// Superscript beside it — real info only ("13 GAMES", "SEP 9"), nil = bare word.
        let sup: String?
        /// Green superscript (live games on the board right now).
        let live: Bool
        let selected: Bool
        /// False for an off-season league with no board yet — tapping it
        /// dismisses the overlay but never hands a league with no data to
        /// the page (mock 64's dimmed words with return dates, founder,
        /// Aug 4: "we should still have the other sports and their start
        /// date just like the mock showed").
        var selectable: Bool = true
    }
    @Published var options: [Option] = []
    @Published var isOpen = false
    private(set) var onPick: (String) -> Void = { _ in }

    func present(_ opts: [Option], onPick: @escaping (String) -> Void) {
        options = opts
        self.onPick = onPick
        withAnimation(.easeOut(duration: 0.18)) { isOpen = true }
    }
    func dismiss() {
        withAnimation(.easeIn(duration: 0.15)) { isOpen = false }
    }

    /// Off-season leagues with their return date, appended after every
    /// selectable league so the overlay always shows the whole calendar
    /// (mock 64) — never just the leagues currently live. `already` is the
    /// set of codes the caller already built real options for (skip those).
    /// Only supported desks appear. A missing board is availability, not a
    /// season date; never invent a kickoff or revive a retired sport.
    static func offSeasonOptions(excluding already: Set<String>) -> [Option] {
        AppFlags.insightLeagues.filter { !already.contains($0) }.map {
            .init(code: $0, sup: "COMING SOON", live: false, selected: false, selectable: false)
        }
    }

}

struct LeagueWordsOverlay: View {
    @ObservedObject private var state = LeagueOverlayState.shared

    var body: some View {
        if state.isOpen {
            ZStack(alignment: .leading) {
                // Mock 64's ground: rgba(8,7,6,.91) — the page ghosts through.
                Color(hex: "#080706").opacity(0.91)
                    .ignoresSafeArea()
                    .onTapGesture { state.dismiss() }

                VStack(alignment: .leading, spacing: 11) {
                    ForEach(state.options) { o in
                        Button {
                            // Off-season leagues (selectable == false) just
                            // close the overlay — there's no board to hand
                            // them to yet.
                            if o.selectable { state.onPick(o.code) }
                            state.dismiss()
                        } label: {
                            HStack(alignment: .top, spacing: 8) {
                                Text(o.code)
                                    .font(GaryFonts.display(48))
                                    .foregroundStyle(o.selected ? GaryColors.gold
                                                                : GaryColors.warmWhite.opacity(0.28))
                                    .lineLimit(1).minimumScaleFactor(0.6)
                                if let sup = o.sup, !sup.isEmpty {
                                    Text(sup.uppercased())
                                        .font(GaryFonts.mono(9.5, bold: true)).tracking(0.5)
                                        .foregroundStyle(o.live ? GaryColors.win : .white.opacity(0.35))
                                        .padding(.top, 7)
                                }
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(o.selectable ? "\(o.code) league" : "\(o.code) — \(o.sup ?? "Unavailable")")
                        .accessibilityAddTraits(o.selected ? [.isSelected, .isButton] : .isButton)
                    }
                }
                .padding(.horizontal, 34)
            }
            .transition(.opacity)
            .zIndex(50)
        }
    }
}

