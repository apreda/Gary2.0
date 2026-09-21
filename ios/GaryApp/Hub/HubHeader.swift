import SwiftUI

// MARK: - Pop-out section nav

/// Floating section nav (founder: "a pop out nav from the side") — a small
/// gold index button rides the trailing edge once the masthead scrolls off;
/// tapping it pops a vertical list of the page's sections, tap one to jump.
struct HubSectionNav: View {
    let items: [(anchor: String, label: String)]
    @Binding var open: Bool
    var availableHeight: CGFloat = 440
    let onTap: (String) -> Void
    @ScaledMetric(relativeTo: .caption) private var rowHeight: CGFloat = 44
    @ScaledMetric(relativeTo: .caption) private var menuWidth: CGFloat = 190

    var body: some View {
        VStack(alignment: .trailing, spacing: 10) {
            if open {
                ScrollView(showsIndicators: true) {
                VStack(alignment: .trailing, spacing: 0) {
                    ForEach(items, id: \.anchor) { item in
                        Button {
                            onTap(item.anchor)
                            withAnimation(.spring(response: 0.32, dampingFraction: 0.86)) { open = false }
                        } label: {
                            Text(item.label.uppercased())
                                .hubKickerFont(11).tracking(1.3)
                                .foregroundStyle(.white.opacity(0.85))
                                .padding(.vertical, 9)
                                .frame(maxWidth: .infinity, alignment: .trailing)
                                .frame(minHeight: 44)
                                .fixedSize(horizontal: false, vertical: true)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        if item.anchor != items.last?.anchor {
                            Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1)
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 6)
                }
                .frame(width: min(menuWidth, 280), height: min(CGFloat(items.count) * (rowHeight + 1) + 12, max(80, availableHeight - 54)))
                .background(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(Color(hex: "#141210").opacity(0.97))
                        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(GaryColors.gold.opacity(0.35), lineWidth: 1))
                        .shadow(color: .black.opacity(0.5), radius: 18, y: 6)
                )
                .transition(.move(edge: .trailing).combined(with: .opacity))
            }
            Button {
                withAnimation(.spring(response: 0.32, dampingFraction: 0.86)) { open.toggle() }
            } label: {
                Image(systemName: open ? "xmark" : "list.bullet")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(open ? GaryColors.ink : GaryColors.gold)
                    .frame(width: 44, height: 44)
                    .background(
                        Circle()
                            .fill(open ? AnyShapeStyle(GaryColors.gold) : AnyShapeStyle(Color(hex: "#141210").opacity(0.95)))
                            .overlay(Circle().stroke(GaryColors.gold.opacity(0.5), lineWidth: 1))
                            .shadow(color: .black.opacity(0.45), radius: 12, y: 4)
                    )
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(open ? "Close section list" : "Jump to a section")
        }
    }
}

// MARK: - Masthead

struct HubMasthead: View {
    @Binding var sel: HubLeagueSel
    let leagues: [HubLeagueSel]
    let gameCount: Int
    @Binding var searchOpen: Bool
    @Binding var searchText: String
    var searchFocused: FocusState<Bool>.Binding
    @AppStorage("hubScope") private var hubScope = "hub"
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private var mainScope: Bool { hubScope != "fantasy" || !sel.supportsFantasy }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if dynamicTypeSize.isAccessibilitySize {
                headerRow(inlineDate: false)
                dateLabel
            } else {
                ViewThatFits(in: .horizontal) {
                    headerRow(inlineDate: true)
                    VStack(alignment: .leading, spacing: 0) {
                        headerRow(inlineDate: false)
                        dateLabel
                    }
                }
            }
            if sel.supportsFantasy {
                let scopeLayout = dynamicTypeSize.isAccessibilitySize
                    ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4))
                    : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: 24))
                scopeLayout {
                    scopeWord("The Hub", on: mainScope) { hubScope = "hub" }
                    if sel.supportsFantasy {
                        scopeWord("Fantasy", on: !mainScope) { hubScope = "fantasy" }
                    }
                }
            }
            if searchOpen, mainScope { searchField }
        }
        .padding(.horizontal, GaryLayout.gutter)
    }

    private func headerRow(inlineDate: Bool) -> some View {
        HStack(spacing: 6) {
            Image(GaryBrand.mark).resizable().scaledToFit()
                .frame(width: 26, height: 26).accessibilityHidden(true)
            if !sel.supportsFantasy {
                Text("The Hub").hubTitleFont(21, .semibold)
                    .foregroundStyle(GaryColors.warmWhite)
                    .fixedSize(horizontal: !dynamicTypeSize.isAccessibilitySize, vertical: true)
            }
            Spacer(minLength: 4)
            if inlineDate { dateLabel.fixedSize() }
            leagueButton
            if mainScope { searchButton }
        }
    }

    private var dateLabel: some View {
        Text([FantasyBriefing.dayLabel(SupabaseAPI.todayEST()).uppercased(),
              gameCount > 0 ? "\(gameCount) GAME\(gameCount == 1 ? "" : "S")" : ""]
            .filter { !$0.isEmpty }.joined(separator: " · "))
            .hubKickerFont(12.5).foregroundStyle(GaryColors.sectionSub)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var leagueButton: some View {
        Button {
            let opts = leagues.map { league -> LeagueOverlayState.Option in
                let count = league == sel ? gameCount : 0
                return .init(code: league.label,
                             sup: count > 0 ? "\(count) GAME\(count == 1 ? "" : "S")" : nil,
                             live: false, selected: league == sel)
            }
            let full = opts + LeagueOverlayState.offSeasonOptions(excluding: Set(leagues.map(\.label)))
            LeagueOverlayState.shared.present(full) { picked in
                if let hit = leagues.first(where: { $0.label == picked }) {
                    withAnimation(.easeInOut(duration: 0.2)) { sel = hit }
                }
            }
        } label: {
            HStack(spacing: 7) {
                Text(sel.label).hubDataFont(14, .bold)
                Image(systemName: "chevron.down").font(.system(size: 10, weight: .semibold))
            }
            .foregroundStyle(GaryColors.gold)
            .frame(minWidth: 44, minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Switch league — \(sel.label) selected")
    }

    private var searchButton: some View {
        Button {
            withAnimation(.easeInOut(duration: 0.2)) {
                searchOpen.toggle()
                if !searchOpen { searchText = ""; searchFocused.wrappedValue = false }
                else { searchFocused.wrappedValue = true }
            }
        } label: {
            Image(systemName: searchOpen ? "xmark" : "magnifyingglass")
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(GaryColors.sectionSub)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(searchOpen ? "Close search" : "Search")
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            TextField("Search \(sel.label) players, teams, reads", text: $searchText)
                .hubBodyFont(15).foregroundStyle(GaryColors.warmWhite)
                .autocorrectionDisabled().textInputAutocapitalization(.never)
                .focused(searchFocused).submitLabel(.search)
                .onSubmit { searchFocused.wrappedValue = false }
            if !searchText.isEmpty {
                Button { searchText = "" } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(GaryColors.sectionSub).frame(width: 44, height: 44)
                }.buttonStyle(.plain).accessibilityLabel("Clear search")
            }
        }
        .padding(.horizontal, 14).frame(minHeight: 50)
        .garyPanel(fill: GaryColors.readingPanel)
        .padding(.top, 8)
    }

    private func scopeWord(_ label: String, on: Bool, tap: @escaping () -> Void) -> some View {
        Button(action: tap) {
            Text(label).hubTitleFont(22, on ? .semibold : .regular)
                .foregroundStyle(on ? GaryColors.warmWhite : GaryColors.sectionSub)
            .fixedSize(horizontal: false, vertical: true)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

