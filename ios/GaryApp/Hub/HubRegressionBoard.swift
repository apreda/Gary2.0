import SwiftUI

// MARK: - The Regression Board

struct HubRegressionBoard: View {
    let signals: [Signal]
    /// The CURRENT EST slate day — anchors the Tonight/Tomorrow split so the
    /// 6am rollover re-buckets rows instead of trusting their baked strings.
    var todayEST: String = SupabaseAPI.todayEST()
    let onTap: (Signal) -> Void
    @State private var tab: Tab? = nil
    @State private var expandedID: UUID? = nil

    private enum Tab: Hashable { case pitchers, hitters, tomorrow }

    private var tomorrowEST: String {
        SupabaseAPI.dayAfter(todayEST)
    }

    private func rowSlateDay(_ s: Signal) -> String? {
        guard let base = s.slateDate else { return nil }
        guard s.reg?.day == "tomorrow" else { return base }
        return SupabaseAPI.dayAfter(base)
    }

    private var pitcherRows: [Signal] {
        signals.filter { s in
            guard s.reg != nil else { return false }
            if let day = rowSlateDay(s) { return day == todayEST }
            return s.reg?.day == "tonight"
        }
    }
    private var tomorrowRows: [Signal] {
        signals.filter { s in
            guard s.reg != nil else { return false }
            if let day = rowSlateDay(s) { return day == tomorrowEST }
            return s.reg?.day == "tomorrow"
        }
    }
    private var hitterRows: [Signal] { signals.filter { $0.reg == nil } }

    private func rowsFor(_ t: Tab) -> [Signal] {
        switch t {
        case .pitchers: return pitcherRows
        case .hitters:  return hitterRows
        case .tomorrow: return tomorrowRows
        }
    }
    private var availableTabs: [Tab] {
        [Tab.pitchers, .hitters, .tomorrow].filter { !rowsFor($0).isEmpty }
    }
    private var activeTab: Tab {
        if let t = tab, availableTabs.contains(t) { return t }
        return availableTabs.first ?? .pitchers
    }
    private var rows: [Signal] { rowsFor(activeTab) }

    var body: some View {
        VStack(spacing: 0) {
            if availableTabs.count >= 2 { tabStrip }
            ForEach(Array(rows.enumerated()), id: \.element.id) { i, s in
                row(s)
                if i < rows.count - 1 { HubRule(inset: 18) }
            }
        }
    }

    private func label(_ t: Tab) -> String {
        switch t {
        case .pitchers: return "Tonight"
        // These rows are the TEAM one-run records, not hitters (Aug 3: the
        // "Hitters" name put team rows under an ERA header — wrong twice).
        case .hitters:  return "Teams"
        case .tomorrow: return "Tomorrow"
        }
    }

    /// What the active tab actually measures — rides the strip so the section
    /// header never lies about a tab it can't see.
    private func subline(_ t: Tab) -> String {
        switch t {
        case .pitchers, .tomorrow: return "ERA vs expected"
        case .hitters:             return "one-run records"
        }
    }

    private var tabStrip: some View {
        VStack(alignment: .leading, spacing: 8) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 20) {
                    ForEach(availableTabs, id: \.self) { t in
                        let on = t == activeTab
                        Button { withAnimation(.easeInOut(duration: 0.15)) { tab = t; expandedID = nil } } label: {
                            HStack(spacing: 5) {
                                Text(label(t).uppercased()).hubKickerFont(11)
                                Text("\(rowsFor(t).count)").hubDataFont(12, .medium)
                            }
                            .foregroundStyle(on ? GaryColors.gold : GaryColors.sectionSub)
                            .fixedSize()
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(on ? .isSelected : [])
                    }
                }
            }
            Text(subline(activeTab).uppercased())
                .hubKickerFont(11)
                .foregroundStyle(GaryColors.sectionSub)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 18)
        .padding(.bottom, 8)
    }

    @ViewBuilder private func row(_ s: Signal) -> some View {
        let expandable = s.reg != nil
        let expanded = expandedID == s.id
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                // THE LAW (founder, Aug 3): a name tap opens the player card,
                // a team row opens the team card — period. The whole row is
                // that tap; the chevron alone owns expand/collapse.
                Button { onTap(s) } label: {
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(HubFmt.subject(s.headline))
                                .hubBodyFont(15, .semibold)
                                .foregroundStyle(.white.opacity(0.95))
                                .fixedSize(horizontal: false, vertical: true)
                            Text(s.game.uppercased())
                                .hubDataFont(9, .medium)
                                .foregroundStyle(.white.opacity(0.62))
                        }
                        Spacer(minLength: 6)
                        Text(s.value)
                            .hubDataFont(15)
                            .foregroundStyle(hubValueTint(s))
                            .fixedSize(horizontal: true, vertical: false)
                            .frame(minWidth: 48, alignment: .trailing)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                if expandable {
                    Button {
                        withAnimation(.easeInOut(duration: 0.18)) {
                            expandedID = expanded ? nil : s.id
                        }
                    } label: {
                        Image(systemName: "chevron.down")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(expanded ? GaryColors.gold : .white.opacity(0.45))
                            .rotationEffect(.degrees(expanded ? 180 : 0))
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(expanded ? "Collapse details" : "Expand details")
                }
            }
            .padding(.horizontal, 18).padding(.vertical, 10)
            if expanded, let r = s.reg { detail(s, r) }
        }
    }

    @ViewBuilder private func detail(_ s: Signal, _ r: SwapMeta) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            // The Gary read (founder, Jul 30): WHY the gap exists and what it
            // means for this start — never a re-statement of the row's number.
            // Falls back to the terse verdict on rows written before the layer.
            if let read = r.read, !read.isEmpty {
                Text(read)
                    .hubBodyFont(13)
                    .foregroundStyle(.white.opacity(0.85))
                    .lineSpacing(2.5)
                    .fixedSize(horizontal: false, vertical: true)
            } else if let v = r.verdict, !v.isEmpty {
                let fresh = v.components(separatedBy: ". ")
                    .filter { !(s.value.isEmpty == false && $0.contains(s.value)) }
                    .joined(separator: ". ")
                if !fresh.isEmpty {
                    Text(fresh.hasSuffix(".") ? fresh : fresh + ".")
                        .hubBodyFont(12.5)
                        .foregroundStyle(.white.opacity(0.78))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 18) {
                    if let w = r.whip { stat("WHIP", HubFmt.stat(w)) }
                    if let k = r.k9 { stat("K/9", String(format: "%.1f", k)) }
                    if let hh = r.hard_hit { stat("Hard-Hit", String(format: "%.1f%%", hh)) }
                    if let b = r.barrel { stat("Barrel", String(format: "%.1f%%", b)) }
                    if let oba = r.opp_ba, let oxba = r.opp_xba { stat("Opp BA→xBA", "\(oba)→\(oxba)") }
                }
            }
            // (The "TAP AGAIN" hint died Aug 3 — the row tap always opens the
            // profile now; the chevron owns this drawer.)
        }
        .padding(.leading, 48).padding(.trailing, 18).padding(.bottom, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func stat(_ label: String, _ value: String, tint: Color = Color.white.opacity(0.92)) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased()).hubKickerFont(8.5).tracking(0.6).foregroundStyle(.white.opacity(0.62))
            Text(value).hubDataFont(12).foregroundStyle(tint)
        }
    }


}

