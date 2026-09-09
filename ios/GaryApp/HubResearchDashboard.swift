import SwiftUI
import Charts

// Hub 920: the compact research dashboard. A lead observation, a quick list
// per research category, independently expandable research modules and a
// chart sheet drawn only from dated bullpen ledgers. Everything here shows
// observed measurements; nothing predicts, recommends or asserts availability.

/// One research category's quick list on the Hub front page.
struct HubQuickResearchPage: Identifiable {
    let id: String
    let title: String
    let rows: [Signal]
}

/// One expandable research module in the Hub workspace. `signals` is empty for
/// modules whose content comes from another feed (Fantasy, League Pulse).
struct HubResearchModule: Identifiable {
    let id: String
    let title: String
    let count: Int?
    let preview: String
    var signals: [Signal] = []
}

extension Signal {
    /// The dated bullpen ledger behind a bullpen observation, when its
    /// metadata carries the current schema and the exact team identity.
    var researchLedger: BullpenResearchLedger? {
        guard kind == .bullpenFatigue else { return nil }
        return BullpenResearchLedger(meta: lane, league: league.label, slateDate: slateDate, teamID: teamId)
    }
}

/// Baseball innings ("5.2" = five innings and two outs) as a decimal for a
/// chart axis. Only the provider's .0/.1/.2 notation is accepted.
func reliefInnings(_ ip: String?) -> Double? {
    guard let ip, BullpenResearchArm.validIP(ip) else { return nil }
    let parts = ip.split(separator: ".", omittingEmptySubsequences: false)
    guard let whole = Double(parts[0]) else { return nil }
    let outs = parts.count > 1 ? (Double(parts[1]) ?? 0) : 0
    return whole + outs / 3
}

/// "2026-09-04" → "Sep 4". Other strings pass through unchanged.
func hubResearchShortDate(_ value: String) -> String {
    let input = DateFormatter()
    input.dateFormat = "yyyy-MM-dd"
    input.timeZone = TimeZone(identifier: "America/New_York")
    guard let date = input.date(from: value) else { return value }
    let output = DateFormatter()
    output.dateFormat = "MMM d"
    output.timeZone = input.timeZone
    return output.string(from: date)
}

// MARK: - Lead observation + quick research list

struct HubResearchDashboard: View {
    let lead: Signal
    let pages: [HubQuickResearchPage]
    let contextFor: (Signal) -> String
    let kickerFor: (Signal) -> String
    let destinationFor: (Signal) -> String
    let onSignal: (Signal) -> Void
    let onCategory: (String) -> Void
    let onChart: (Signal) -> Void
    /// A small box that sits to the right of the lead card (THE BOARD IS
    /// MOVING, Sep 9 2026). Nil when the league has none.
    var aside: AnyView? = nil
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let aside, !dynamicTypeSize.isAccessibilitySize {
                // The strip sizes itself and vanishes when there is nothing
                // to show, so the lead card never gives up width for nothing.
                // Both boxes stand the same height (founder, Sep 9 2026: the
                // strip stopped short of the lead card's bottom). fixedSize on
                // the row lets the taller child set the height; each child
                // fills it.
                HStack(alignment: .top, spacing: 0) {
                    leadCard.frame(maxHeight: .infinity, alignment: .top)
                    aside.frame(maxHeight: .infinity, alignment: .top)
                }
                .fixedSize(horizontal: false, vertical: true)
            } else {
                leadCard
                if let aside { aside }
            }
            if !pages.isEmpty { quickList }
        }
        .padding(.horizontal, GaryLayout.gutter)
    }

    private var leadCard: some View {
        VStack(alignment: .leading, spacing: 4) {
            Button { onSignal(lead) } label: {
                VStack(alignment: .leading, spacing: 10) {
                    Text(kickerFor(lead).uppercased()).hubKickerFont(11).tracking(1.1)
                        .foregroundStyle(GaryColors.gold)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(lead.headline)
                        .hubTitleFont(20, .semibold)
                        .foregroundStyle(GaryColors.warmWhite)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(lead.detail.trimmingCharacters(in: .whitespacesAndNewlines))
                        .hubBodyFont(14)
                        .foregroundStyle(GaryColors.warmWhite.opacity(0.78))
                        .lineSpacing(2)
                        .fixedSize(horizontal: false, vertical: true)
                    footer
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint("Opens \(destinationFor(lead).lowercased())")
            if lead.researchLedger != nil {
                Button { onChart(lead) } label: {
                    Label("Compare recent workload", systemImage: "chart.bar.xaxis")
                        .hubBodyFont(13, .medium)
                        .foregroundStyle(GaryColors.gold)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityHint("Shows each reliever's recent innings and pitches")
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .garyPanel(radius: GaryLayout.Radius.card, fill: GaryColors.readingPanel)
        .multilineTextAlignment(.leading)
    }

    private var footer: some View {
        let context = contextFor(lead)
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: 12))
        return layout {
            if !context.isEmpty {
                Text(context).hubDataFont(11, .medium)
                    .foregroundStyle(GaryColors.sectionSub)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if !dynamicTypeSize.isAccessibilitySize { Spacer(minLength: 0) }
            HStack(spacing: 6) {
                Text(destinationFor(lead)).hubDataFont(11, .medium)
                Image(systemName: "arrow.up.right").font(.system(size: 11, weight: .medium))
            }
            .foregroundStyle(GaryColors.gold)
            .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, 2)
    }

    private var quickList: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(pages) { page in
                Button { onCategory(page.id) } label: {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(page.title.uppercased()).hubKickerFont(11).tracking(1.1)
                            .foregroundStyle(GaryColors.gold)
                        Spacer(minLength: 0)
                        Text("All \(page.title.lowercased())").hubDataFont(11, .medium)
                            .foregroundStyle(GaryColors.sectionSub)
                        Image(systemName: "chevron.right")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(GaryColors.sectionSub)
                    }
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(page.title) research")
                .accessibilityHint("Opens the full \(page.title.lowercased()) research")
                ForEach(page.rows) { row in
                    Button { onSignal(row) } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(row.headline)
                                .hubBodyFont(15, .semibold)
                                .foregroundStyle(GaryColors.warmWhite)
                                .fixedSize(horizontal: false, vertical: true)
                            HStack(alignment: .firstTextBaseline, spacing: 6) {
                                Text(contextFor(row)).hubDataFont(10.5, .medium)
                                    .foregroundStyle(GaryColors.sectionSub)
                                    .fixedSize(horizontal: false, vertical: true)
                                Spacer(minLength: 0)
                                Text(destinationFor(row)).hubDataFont(10.5, .medium)
                                    .foregroundStyle(GaryColors.gold)
                                    .fixedSize(horizontal: false, vertical: true)
                                Image(systemName: "arrow.up.right")
                                    .font(.system(size: 10, weight: .medium))
                                    .foregroundStyle(GaryColors.gold)
                            }
                        }
                        .padding(.vertical, 10)
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("Opens \(destinationFor(row).lowercased())")
                    Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1)
                }
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .garyPanel(radius: GaryLayout.Radius.card, fill: GaryColors.readingPanel)
        .multilineTextAlignment(.leading)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Quick research")
    }
}

// MARK: - Expandable research module

struct HubResearchModuleCard<Content: View>: View {
    let module: HubResearchModule
    @Binding var open: Set<String>
    @ViewBuilder let content: () -> Content

    private var isOpen: Bool { open.contains(module.id) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    if isOpen { open.remove(module.id) } else { open.insert(module.id) }
                }
            } label: {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        // One line, scaled to fit — a wrapped title made two
                        // cards in a row different heights (founder, Sep 9).
                        Text(module.title)
                            .hubBodyFont(15, .semibold)
                            .foregroundStyle(GaryColors.warmWhite)
                            .lineLimit(1).minimumScaleFactor(0.8)
                        Spacer(minLength: 0)
                        if let count = module.count, count > 0 {
                            Text("\(count)").hubDataFont(11, .medium)
                                .foregroundStyle(GaryColors.sectionSub)
                        }
                        Image(systemName: "chevron.right")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(GaryColors.gold)
                            .rotationEffect(.degrees(isOpen ? 90 : 0))
                    }
                    if !isOpen {
                        // Two reserved lines so every closed card in a row is
                        // the same height; long previews scale, never clip.
                        Text(module.preview)
                            .hubBodyFont(13)
                            .foregroundStyle(GaryColors.sectionSub)
                            .lineLimit(3, reservesSpace: true)
                            .minimumScaleFactor(0.6)
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
                .multilineTextAlignment(.leading)
                .padding(16)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(module.count.map { "\(module.title), \($0) \($0 == 1 ? "item" : "items")" } ?? module.title)
            .accessibilityValue(isOpen ? "expanded" : "collapsed")
            .accessibilityHint(isOpen ? "Collapse \(module.title)" : "Expand \(module.title)")
            if isOpen {
                Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1).padding(.horizontal, 16)
                content().padding(.vertical, 8)
            }
        }
        .garyPanel(radius: GaryLayout.Radius.card, fill: GaryColors.readingPanel)
    }
}

// MARK: - Bullpen workload chart

struct HubBullpenChartSheet: View {
    let signal: Signal
    let onClose: () -> Void
    let onResearch: () -> Void
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private struct ArmWorkload: Identifiable {
        let id: Int
        let name: String
        let innings: Double
        let inningsLabel: String
        let pitches: Int?
        let appearances: Int?
        let lastUsed: String?
    }

    private var ledger: BullpenResearchLedger? { signal.researchLedger }

    private func workloads(_ ledger: BullpenResearchLedger) -> [ArmWorkload] {
        ledger.arms.compactMap { arm in
            guard let id = arm.id, let name = arm.name, let innings = reliefInnings(arm.ip) else { return nil }
            return ArmWorkload(id: id, name: name, innings: innings, inningsLabel: arm.inningsLabel,
                               pitches: arm.pitches, appearances: arm.g, lastUsed: arm.last_used)
        }
        .sorted { $0.innings > $1.innings }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text(signal.headline)
                        .hubTitleFont(20, .semibold)
                        .foregroundStyle(GaryColors.warmWhite)
                        .fixedSize(horizontal: false, vertical: true)
                    if let ledger {
                        let rows = workloads(ledger)
                        Text("Relief innings by pitcher · \(ledger.dates.map(hubResearchShortDate).joined(separator: ", ")) · \(ledger.asOf.prefix(4))")
                            .hubKickerFont(11)
                            .foregroundStyle(GaryColors.sectionSub)
                            .fixedSize(horizontal: false, vertical: true)
                        if rows.isEmpty {
                            Text("This ledger has no innings that can be charted.")
                                .hubBodyFont(14).foregroundStyle(GaryColors.sectionSub)
                        } else {
                            chart(rows)
                            legend(rows)
                        }
                        Text("\(ledger.source) · innings and pitches are the observed totals through \(hubResearchShortDate(ledger.asOf)). Workload alone says nothing about who pitches tonight.")
                            .hubBodyFont(12)
                            .foregroundStyle(GaryColors.sectionSub)
                            .fixedSize(horizontal: false, vertical: true)
                    } else {
                        Text("No dated bullpen ledger is attached to this observation.")
                            .hubBodyFont(14).foregroundStyle(GaryColors.sectionSub)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Button(action: onResearch) {
                        HStack(spacing: 6) {
                            Text("Open team research")
                            Image(systemName: "arrow.up.right").font(.system(size: 11, weight: .medium))
                        }
                        .hubBodyFont(14, .medium)
                        .foregroundStyle(GaryColors.gold)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("Opens the team's full research")
                }
                .padding(GaryLayout.gutter)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(GaryColors.darkBg.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close", action: onClose)
                        .foregroundStyle(GaryColors.gold)
                        .accessibilityLabel("Close workload chart")
                }
            }
            .toolbarBackground(GaryColors.darkBg, for: .navigationBar)
        }
        .accessibilityAddTraits(.isModal)
    }

    @ViewBuilder private func chart(_ rows: [ArmWorkload]) -> some View {
        Chart(rows) { arm in
            BarMark(x: .value("Innings", arm.innings), y: .value("Reliever", arm.name))
                .foregroundStyle(GaryColors.gold)
                .cornerRadius(3)
                .accessibilityLabel(arm.name)
                .accessibilityValue(arm.pitches.map { "\(arm.inningsLabel) innings, \($0) pitches" } ?? "\(arm.inningsLabel) innings")
        }
        .chartXAxisLabel("Innings", alignment: .trailing)
        .chartXAxis {
            AxisMarks(values: .automatic(desiredCount: 4)) { _ in
                AxisGridLine().foregroundStyle(Color.white.opacity(0.08))
                AxisValueLabel().foregroundStyle(GaryColors.sectionSub)
            }
        }
        .chartYAxis {
            AxisMarks { _ in
                AxisValueLabel().foregroundStyle(GaryColors.warmWhite)
            }
        }
        .frame(height: CGFloat(rows.count) * (dynamicTypeSize.isAccessibilitySize ? 48 : 34) + 36)
        .padding(14)
        .garyPanel(radius: GaryLayout.Radius.card, fill: GaryColors.readingPanel)
    }

    private func legend(_ rows: [ArmWorkload]) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.element.id) { index, arm in
                let layout = dynamicTypeSize.isAccessibilitySize
                    ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4))
                    : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: 10))
                layout {
                    Text(arm.name).hubBodyFont(14, .semibold).foregroundStyle(GaryColors.warmWhite)
                        .frame(maxWidth: dynamicTypeSize.isAccessibilitySize ? nil : .infinity, alignment: .leading)
                    Text("\(arm.inningsLabel) IP").hubDataFont(12, .medium).foregroundStyle(GaryColors.warmWhite)
                    Text(arm.pitches.map { "\($0) pitches" } ?? "pitches —").hubDataFont(12, .medium).foregroundStyle(GaryColors.sectionSub)
                    Text("\(arm.appearances.map(String.init) ?? "—") app · last \(arm.lastUsed.map(hubResearchShortDate) ?? "—")")
                        .hubDataFont(11, .medium).foregroundStyle(GaryColors.sectionSub)
                }
                .fixedSize(horizontal: false, vertical: true)
                .padding(.vertical, 9)
                .accessibilityElement(children: .combine)
                if index < rows.count - 1 {
                    Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 4)
        .garyPanel(radius: GaryLayout.Radius.card, fill: GaryColors.readingPanel)
    }
}
