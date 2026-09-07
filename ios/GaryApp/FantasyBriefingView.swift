import SwiftUI

private struct FantasySelection: Identifiable {
    let id = UUID()
    let decision: FantasyDecision
    let briefing: FantasyBriefing
}

struct FantasyBriefingPage: View {
    let league: String
    let refreshToken: UUID
    let isVisible: Bool
    /// Return true only when the exact league/player has a populated card.
    var openPlayer: (FantasyDecision) -> Bool = { _ in false }
    @AppStorage("fantasyMLBFormat") private var mlbFormat = "categories"
    @AppStorage("fantasyNFLFormat") private var nflFormat = "half_ppr"
    @State private var briefing: FantasyBriefing?
    @State private var loaded = false
    @State private var failed = false
    @State private var focus = "all"
    @State private var selected: FantasySelection?
    @State private var loadRequest = UUID()

    private var format: String {
        let saved = league == "MLB" ? mlbFormat : nflFormat
        return formatOptions.contains { $0.0 == saved } ? saved : (league == "MLB" ? "categories" : "half_ppr")
    }
    private var formatOptions: [(String, String)] {
        league == "MLB" ? [("categories", "Categories"), ("points", "Points")]
            : [("standard", "Standard"), ("half_ppr", "Half PPR"), ("ppr", "PPR")]
    }
    private var formatLabel: String { formatOptions.first { $0.0 == format }?.1 ?? "Scoring" }
    private var requestKey: String { "\(league)|\(refreshToken)|\(isVisible)" }
    private func calls(now: Date) -> [FantasyDecision] {
        (briefing?.decisions ?? []).filter { decision in
            decision.isActionable(now: now) && decision.formats.contains(format) && (focus == "all"
                || (focus == "pickups" && decision.action == "CONSIDER_ADD")
                || (focus == "lineup" && ["START", "SIT"].contains(decision.action)))
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            masthead
            TimelineView(.periodic(from: .now, by: 60)) { context in
                content(now: context.date)
            }
        }
        .padding(.horizontal, GaryLayout.gutter)
        .environment(\.solidPanels, true)
        .task(id: requestKey) {
            guard isVisible else { return }
            repeat {
                await load()
                do { try await Task.sleep(nanoseconds: 300_000_000_000) }
                catch { return }
            } while !Task.isCancelled
        }
        .sheet(item: $selected) { selection in
            FantasyDecisionSheet(decision: selection.decision, league: league, briefing: selection.briefing) {
                selected = nil
            }
        }
    }

    private var masthead: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Gary’s fantasy briefing")
                    .font(.title2.weight(.bold)).foregroundStyle(GaryColors.warmWhite)
                    .fixedSize(horizontal: false, vertical: true)
                Text(league == "NFL" ? "Your next move, before the next kickoff." : "The call. The case. What matters today.")
                    .font(GaryFonts.ui(14)).foregroundStyle(GaryColors.sectionSub)
                if let briefing {
                    Text(league == "MLB" ? FantasyBriefing.dayLabel(briefing.date).uppercased()
                        : "\(briefing.week.map { "WEEK \($0) · " } ?? "")\(FantasyBriefing.dayLabel(briefing.window_start)) – \(FantasyBriefing.dayLabel(briefing.window_end))")
                        .font(GaryFonts.kicker(10)).foregroundStyle(GaryColors.gold).padding(.top, 4)
                }
            }
            HStack(alignment: .center, spacing: 16) {
                Menu {
                    ForEach(formatOptions, id: \.0) { item in
                        Button {
                            if league == "MLB" { mlbFormat = item.0 } else { nflFormat = item.0 }
                        } label: {
                            if format == item.0 { Label(item.1, systemImage: "checkmark") }
                            else { Text(item.1) }
                        }
                    }
                } label: {
                    HStack(spacing: 6) {
                        Text(formatLabel)
                        Image(systemName: "chevron.down").font(.system(size: 10, weight: .semibold))
                    }
                    .font(GaryFonts.ui(14, .semibold)).foregroundStyle(GaryColors.gold)
                    .padding(.vertical, 10)
                }
                .accessibilityLabel("Scoring format: \(formatLabel)")
                Spacer(minLength: 0)
                if let briefing, let at = FantasyBriefing.timestamp(briefing.fetched_as_of) {
                    Text("Checked \(at.formatted(.dateTime.hour().minute()))")
                        .font(GaryFonts.ui(12)).foregroundStyle(GaryColors.meta)
                }
            }
            HStack(spacing: 22) {
                focusButton("All calls", key: "all")
                focusButton("Pickups", key: "pickups")
                focusButton("Lineup", key: "lineup")
                Spacer(minLength: 0)
            }
            Rectangle().fill(GaryColors.panelStroke).frame(height: 1)
        }
    }

    private func focusButton(_ title: String, key: String) -> some View {
        Button { focus = key } label: {
            VStack(spacing: 9) {
                Text(title).font(GaryFonts.ui(14, focus == key ? .semibold : .regular))
                    .foregroundStyle(focus == key ? GaryColors.warmWhite : GaryColors.sectionSub)
                Rectangle().fill(focus == key ? GaryColors.gold : .clear).frame(height: 2)
            }
            .padding(.top, 5)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(focus == key ? [.isSelected] : [])
    }

    @ViewBuilder private func content(now: Date) -> some View {
        let calls = calls(now: now)
        if !loaded {
            ProgressView("Loading Gary’s briefing").tint(GaryColors.gold)
                .font(GaryFonts.ui(14)).foregroundStyle(GaryColors.sectionSub)
                .frame(maxWidth: .infinity).padding(.vertical, 40)
        } else if let briefing, briefing.isCurrent(now: now) {
            VStack(alignment: .leading, spacing: 18) {
                if failed {
                    notice("The latest check failed. These calls are still within their evidence window.", retry: true)
                }
                if calls.isEmpty {
                    notice(briefing.decisions.isEmpty
                        ? "No calls are available for this window. Check back as the evidence changes."
                        : "No calls match this view. Try All calls or a different scoring format.", retry: false)
                } else {
                    LazyVStack(alignment: .leading, spacing: 16) {
                        ForEach(Array(calls.enumerated()), id: \.element.id) { index, decision in
                            FantasyCallPanel(decision: decision, leading: index == 0, now: now, onPlayer: {
                                if !openPlayer(decision) { selected = FantasySelection(decision: decision, briefing: briefing) }
                            }, onDetails: { selected = FantasySelection(decision: decision, briefing: briefing) })
                        }
                    }
                }
                Text("Advice is filtered by scoring format. Availability in your league and your exact roster are still yours to check.")
                    .font(GaryFonts.ui(12)).foregroundStyle(GaryColors.meta)
                    .fixedSize(horizontal: false, vertical: true)
            }
        } else {
            notice(failed ? "Gary’s briefing couldn’t be loaded. Try checking again."
                : briefing == nil ? "The next briefing hasn’t arrived yet. Check again shortly."
                : "The evidence window has passed. Check for a refreshed briefing before making a move.", retry: true)
        }
    }

    private func notice(_ message: String, retry: Bool) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(message).font(GaryFonts.ui(15)).foregroundStyle(GaryColors.sectionSub)
                .fixedSize(horizontal: false, vertical: true)
            if retry {
                Button("Check for update") { Task { await load() } }
                    .font(GaryFonts.ui(14, .semibold)).foregroundStyle(GaryColors.gold)
            }
        }
        .padding(18).frame(maxWidth: .infinity, alignment: .leading)
        .quantPanel(radius: GaryLayout.Radius.card)
    }

    @MainActor private func load() async {
        let date = FantasyBriefing.today()
        let request = UUID()
        loadRequest = request
        do {
            let next = try await SupabaseAPI.fetchFantasyBriefing(date: date, league: league)
            guard !Task.isCancelled, loadRequest == request else { return }
            briefing = next
            failed = false
        } catch {
            guard !Task.isCancelled, loadRequest == request else { return }
            if briefing?.canRetainAfterRefreshFailure(isTransient: SupabaseAPI.isTransientExternalFailure(error)) != true { briefing = nil }
            failed = true
        }
        loaded = true
    }
}

private struct FantasyCallPanel: View {
    let decision: FantasyDecision
    let leading: Bool
    let now: Date
    let onPlayer: () -> Void
    let onDetails: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(decision.actionLabel).font(GaryFonts.kicker(11)).tracking(1)
                .foregroundStyle(GaryColors.gold)
            Button(action: onPlayer) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(decision.player_name).font(GaryFonts.ui(17, .semibold))
                        .foregroundStyle(GaryColors.warmWhite)
                    Text(decision.identity).font(GaryFonts.data(10, .medium)).foregroundStyle(GaryColors.meta)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)
            if let game = decision.nextGameLabel(now: now) {
                Text(game).font(GaryFonts.ui(12)).foregroundStyle(GaryColors.meta)
            }
            Text(decision.headline).font(GaryFonts.ui(leading ? 24 : 21, .semibold))
                .foregroundStyle(GaryColors.warmWhite).lineSpacing(2)
            Text(decision.why_now).font(GaryFonts.ui(15)).lineSpacing(4)
                .foregroundStyle(GaryColors.warmWhite.opacity(0.9))
            FantasyTextSection(title: "WHO THIS HELPS", text: decision.fit)
            Rectangle().fill(GaryColors.panelStroke).frame(height: 1)
            Button(action: onDetails) {
                HStack(spacing: 10) {
                    Text("Tradeoff & evidence").font(GaryFonts.ui(14, .semibold))
                    Spacer(minLength: 0)
                    Image(systemName: "arrow.up.right").font(.system(size: 12, weight: .semibold))
                }
                .foregroundStyle(GaryColors.gold).padding(.vertical, 3)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .fixedSize(horizontal: false, vertical: true)
        .padding(18).frame(maxWidth: .infinity, alignment: .leading)
        .quantPanel(radius: GaryLayout.Radius.card)
    }
}

private struct FantasyTextSection: View {
    let title: String
    let text: String
    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(title).font(GaryFonts.kicker(10)).tracking(0.8).foregroundStyle(GaryColors.gold)
            Text(text).font(GaryFonts.ui(14)).lineSpacing(3).foregroundStyle(GaryColors.sectionSub)
        }
        .fixedSize(horizontal: false, vertical: true)
    }
}

private struct FantasyDecisionSheet: View {
    let decision: FantasyDecision
    let league: String
    let briefing: FantasyBriefing
    let close: () -> Void
    var body: some View {
        NavigationStack {
            TimelineView(.periodic(from: .now, by: 30)) { context in
                if briefing.isCurrent(now: context.date), decision.isActionable(now: context.date) {
                    evidenceContent
                } else {
                    VStack(alignment: .leading, spacing: 16) {
                        Text("This call’s window has closed.").font(GaryFonts.ui(23, .semibold)).foregroundStyle(GaryColors.warmWhite)
                        Text("Return to the briefing for advice based on the next available update.").font(GaryFonts.ui(15)).foregroundStyle(GaryColors.sectionSub)
                        Button("Back to briefing", action: close).foregroundStyle(GaryColors.gold)
                    }
                    .padding(GaryLayout.gutter).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                }
            }
            .background(GaryColors.darkBg)
            .navigationTitle("Gary’s call").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done", action: close).tint(GaryColors.gold) } }
        }
        .preferredColorScheme(.dark)
    }

    private var evidenceContent: some View {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 7) {
                        Text(decision.player_name).font(GaryFonts.ui(27, .semibold)).foregroundStyle(GaryColors.warmWhite)
                        Text("\(league) · \(decision.identity)").font(GaryFonts.data(11, .medium)).foregroundStyle(GaryColors.meta)
                    }
                    Text(decision.headline).font(GaryFonts.ui(23, .semibold)).foregroundStyle(GaryColors.warmWhite)
                    FantasyTextSection(title: "WHY NOW", text: decision.why_now)
                    FantasyTextSection(title: "WHO THIS HELPS", text: decision.fit)
                    FantasyTextSection(title: "THE COUNTERARGUMENT", text: decision.risk)
                    FantasyTextSection(title: "WHAT TO CHECK NEXT", text: decision.watch_for)
                    Rectangle().fill(GaryColors.panelStroke).frame(height: 1)
                    VStack(alignment: .leading, spacing: 20) {
                        Text("THE EVIDENCE").font(GaryFonts.kicker(12)).tracking(1).foregroundStyle(GaryColors.gold)
                        ForEach(decision.evidence) { evidence in
                            VStack(alignment: .leading, spacing: 7) {
                                Text(evidence.label).font(GaryFonts.ui(15, .semibold)).foregroundStyle(GaryColors.warmWhite)
                                if let summary = evidence.summary, !summary.isEmpty {
                                    Text(summary).font(GaryFonts.ui(14)).foregroundStyle(GaryColors.sectionSub).lineSpacing(3)
                                }
                                Text(evidence.source).font(GaryFonts.ui(12)).foregroundStyle(GaryColors.meta)
                            }
                        }
                    }
                    if let ownership = decision.availability?.rostered_percent {
                        FantasyTextSection(title: "AVAILABILITY", text: "\(ownership.formatted(.number.precision(.fractionLength(1))))% rostered across the provider’s leagues. Check your own league’s player pool.")
                    }
                    if let at = FantasyBriefing.timestamp(briefing.fetched_as_of) {
                        Text("Evidence collected \(at.formatted(date: .abbreviated, time: .shortened)). Game and sample dates are shown above.")
                            .font(GaryFonts.ui(12)).foregroundStyle(GaryColors.meta)
                    }
                    if !decision.limitations.isEmpty {
                        FantasyTextSection(title: "LIMITS OF THIS READ", text: decision.limitations.joined(separator: "\n\n"))
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(GaryLayout.gutter).padding(.bottom, 24)
            }
    }
}
