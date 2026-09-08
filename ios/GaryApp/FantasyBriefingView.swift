import SwiftUI

private enum FantasyInk {
    static let background = GaryColors.cardBg
    static let raised = GaryColors.readingPanelRaised
    static let paper = GaryColors.warmWhite
    static let secondary = GaryColors.warmWhite.opacity(0.86)
    static let muted = GaryColors.warmWhite.opacity(0.74)
    static let gold = GaryColors.gold
    static let rule = GaryColors.warmWhite.opacity(0.17)
}

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
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
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
        VStack(alignment: .leading, spacing: 24) {
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
            if league == "NFL", let briefing {
                FantasyEyebrow(text: "\(briefing.week.map { "WEEK \($0) · " } ?? "")\(FantasyBriefing.dayLabel(briefing.window_start)) – \(FantasyBriefing.dayLabel(briefing.window_end))")
            }
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 14) {
                    scoringMenu
                    checkedTime
                }
            } else {
                HStack(alignment: .center, spacing: 18) {
                    scoringMenu
                    checkedTime
                }
            }
            VStack(alignment: .leading, spacing: 0) {
                if dynamicTypeSize.isAccessibilitySize {
                    VStack(spacing: 0) { focusControls }
                } else {
                    HStack(spacing: 12) { focusControls }
                }
                FantasyRule()
            }
        }
    }

    private var scoringMenu: some View {
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
            VStack(alignment: .leading, spacing: 7) {
                FantasyEyebrow(text: "SCORING")
                scoringValue
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
            .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
            .garyPanel(fill: GaryColors.readingPanel)
            .contentShape(Rectangle())
        }
        .accessibilityLabel("Scoring format: \(formatLabel)")
        .accessibilityHint("Choose how your fantasy league scores players")
    }

    private var scoringValue: some View {
        HStack(spacing: 10) {
            Text(formatLabel).font(.subheadline.weight(.semibold))
                .foregroundStyle(FantasyInk.paper)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            Image(systemName: "chevron.down")
                .font(.caption.weight(.semibold)).foregroundStyle(FantasyInk.gold)
                .accessibilityHidden(true)
        }
    }

    @ViewBuilder private var checkedTime: some View {
        if let briefing, let at = FantasyBriefing.timestamp(briefing.fetched_as_of) {
            VStack(alignment: .leading, spacing: 7) {
                FantasyEyebrow(text: "CHECKED")
                Text(fantasyCheckedTime(at)).font(.caption).foregroundStyle(FantasyInk.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Evidence checked \(fantasyTimestamp(at))")
        }
    }

    @ViewBuilder private var focusControls: some View {
        focusButton("All calls", key: "all")
        focusButton("Pickups", key: "pickups")
        focusButton("Lineup", key: "lineup")
    }

    private func focusButton(_ title: String, key: String) -> some View {
        Button { focus = key } label: {
            VStack(spacing: 0) {
                HStack(spacing: 8) {
                    Text(title).font(.subheadline.weight(focus == key ? .semibold : .regular))
                        .fixedSize(horizontal: false, vertical: true)
                    if dynamicTypeSize.isAccessibilitySize {
                        Spacer(minLength: 0)
                        if focus == key { Image(systemName: "checkmark").accessibilityHidden(true) }
                    }
                }
                .frame(maxWidth: .infinity, minHeight: 44)
                .padding(.vertical, 4)
                Rectangle().fill(focus == key ? FantasyInk.gold : .clear).frame(height: 2)
            }
            .foregroundStyle(focus == key ? FantasyInk.paper : FantasyInk.secondary)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(focus == key ? [.isSelected] : [])
    }

    @ViewBuilder private func content(now: Date) -> some View {
        let calls = calls(now: now)
        if !loaded {
            ProgressView("Loading Gary’s briefing").tint(FantasyInk.gold)
                .font(.subheadline).foregroundStyle(FantasyInk.secondary)
                .frame(maxWidth: .infinity).padding(.vertical, 40)
        } else if let briefing, briefing.isCurrent(now: now) {
            VStack(alignment: .leading, spacing: 26) {
                if failed {
                    notice("The latest check failed. These calls are still within their evidence window.", retry: true)
                }
                if let featured = calls.first {
                    FantasyFeaturedCall(decision: featured, now: now, onPlayer: {
                        open(featured, briefing: briefing)
                    }, onDetails: { selected = FantasySelection(decision: featured, briefing: briefing) })
                    if calls.count > 1 {
                        VStack(alignment: .leading, spacing: 14) {
                            HStack(alignment: .firstTextBaseline, spacing: 12) {
                                Text("More calls").font(.title3.weight(.semibold)).foregroundStyle(FantasyInk.paper)
                                Text("\(calls.count - 1)").font(.subheadline.monospacedDigit()).foregroundStyle(FantasyInk.muted)
                            }
                            .accessibilityElement(children: .combine)
                            LazyVStack(alignment: .leading, spacing: 0) {
                                ForEach(Array(calls.dropFirst().enumerated()), id: \.element.id) { index, decision in
                                    if index > 0 { FantasyRule().padding(.horizontal, 18) }
                                    FantasyCompactCall(decision: decision, now: now, onPlayer: {
                                        open(decision, briefing: briefing)
                                    }, onDetails: { selected = FantasySelection(decision: decision, briefing: briefing) })
                                }
                            }
                            .garyPanel(radius: GaryLayout.Radius.card, fill: GaryColors.readingPanel)
                        }
                    }
                } else {
                    let allCallsClosed = !briefing.decisions.isEmpty && !briefing.decisions.contains { $0.isActionable(now: now) }
                    notice(allCallsClosed
                        ? "These calls have reached the end of their playing window. Check for a refreshed briefing."
                        : briefing.decisions.isEmpty
                        ? "No calls are available for this window. Check back as the evidence changes."
                        : "No calls match this view. Try All calls or a different scoring format.", retry: allCallsClosed)
                }
                Text("Advice is filtered by scoring format. Availability in your league and your exact roster are still yours to check.")
                    .font(.caption).foregroundStyle(FantasyInk.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        } else {
            notice(failed ? "Gary’s briefing couldn’t be loaded. Try checking again."
                : briefing == nil ? "No briefing is available for this slate. You can check for an update."
                : "The evidence window has passed. Check for a refreshed briefing before making a move.", retry: true)
        }
    }

    private func open(_ decision: FantasyDecision, briefing: FantasyBriefing) {
        if !openPlayer(decision) { selected = FantasySelection(decision: decision, briefing: briefing) }
    }

    private func notice(_ message: String, retry: Bool) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(message).font(.body).foregroundStyle(FantasyInk.secondary)
                .fixedSize(horizontal: false, vertical: true)
            if retry {
                Button { Task { await load() } } label: {
                    Text("Check for update")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(FantasyInk.gold)
                        .frame(minHeight: 44).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(18).frame(maxWidth: .infinity, alignment: .leading)
        .background(FantasyInk.raised, in: RoundedRectangle(cornerRadius: 18))
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

private struct FantasyFeaturedCall: View {
    let decision: FantasyDecision
    let now: Date
    let onPlayer: () -> Void
    let onDetails: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            FantasyEyebrow(text: "THE FEATURED CALL")
            VStack(alignment: .leading, spacing: 16) {
                FantasyPlayerLink(decision: decision, featured: true, action: onPlayer)
                FantasyEyebrow(text: fantasyAction(decision))
                Text(decision.displayText(decision.headline))
                    .font(.title2.weight(.bold)).foregroundStyle(FantasyInk.paper)
                    .fixedSize(horizontal: false, vertical: true)
                FantasyNextOpportunity(decision: decision, now: now)
                Text(decision.displayText(decision.why_now))
                    .font(.body).lineSpacing(4).foregroundStyle(FantasyInk.paper)
                    .fixedSize(horizontal: false, vertical: true)
                FantasyRule()
                FantasyTextSection(title: "THE RISK", text: decision.displayText(decision.risk))
                Button(action: onDetails) {
                    FantasyReadLink(title: "Read Gary’s full case")
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Read the full fantasy case for \(decision.player_name)")
                .accessibilityHint("Includes scoring fit, what to watch next, and every evidence source")
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .garyPanel(radius: GaryLayout.Radius.card, fill: FantasyInk.raised)
            .overlay(alignment: .topLeading) {
                Capsule().fill(GaryColors.gold).frame(width: 36, height: 3)
                    .padding(.leading, 20).accessibilityHidden(true)
            }
        }
    }
}

private struct FantasyCompactCall: View {
    let decision: FantasyDecision
    let now: Date
    let onPlayer: () -> Void
    let onDetails: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            FantasyEyebrow(text: fantasyAction(decision))
            FantasyPlayerLink(decision: decision, featured: false, action: onPlayer)
            Button(action: onDetails) {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .firstTextBaseline, spacing: 14) {
                        Text(decision.displayText(decision.headline))
                            .font(.headline).foregroundStyle(FantasyInk.paper)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Image(systemName: "arrow.up.right").font(.caption.weight(.semibold))
                            .foregroundStyle(FantasyInk.gold).accessibilityHidden(true)
                    }
                    FantasyNextOpportunity(decision: decision, now: now)
                }
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint("Opens the complete argument, scoring fit, risk, and evidence")
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct FantasyPlayerLink: View {
    let decision: FantasyDecision
    let featured: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(decision.player_name)
                        .font(featured ? .title3.weight(.semibold) : .subheadline.weight(.semibold))
                        .foregroundStyle(FantasyInk.paper)
                    if !decision.identity.isEmpty {
                        Text(decision.identity).font(.caption).foregroundStyle(FantasyInk.muted)
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "person.text.rectangle")
                    .font(.body).foregroundStyle(FantasyInk.muted).accessibilityHidden(true)
            }
            .frame(minHeight: 44).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(decision.player_name), \(decision.identity)")
        .accessibilityHint("Opens the matching player card when available, otherwise Gary’s full call")
    }
}

private struct FantasyReadLink: View {
    let title: String
    var body: some View {
        HStack(spacing: 12) {
            Text(title).font(.subheadline.weight(.semibold))
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            Image(systemName: "arrow.up.right").font(.caption.weight(.semibold)).accessibilityHidden(true)
        }
        .foregroundStyle(GaryColors.lightGold)
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        .contentShape(Rectangle())
    }
}

private struct FantasyEyebrow: View {
    let text: String
    var body: some View {
        Text(text).font(.system(.caption, design: .monospaced).weight(.semibold))
            .tracking(0.7).foregroundStyle(FantasyInk.gold)
            .fixedSize(horizontal: false, vertical: true)
    }
}

private struct FantasyRule: View {
    var body: some View { Rectangle().fill(FantasyInk.rule).frame(height: 1).accessibilityHidden(true) }
}

private struct FantasyTextSection: View {
    let title: String
    let text: String
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            FantasyEyebrow(text: title)
            Text(text).font(.callout).lineSpacing(4).foregroundStyle(FantasyInk.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private func fantasyAction(_ decision: FantasyDecision) -> String {
    decision.action == "START" ? "START" : decision.actionLabel
}

private func fantasyTimestamp(_ date: Date) -> String {
    let label = date.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day().hour().minute())
    let zone = TimeZone.current.abbreviation(for: date) ?? ""
    return zone.isEmpty ? label : "\(label) \(zone)"
}

private func fantasyCheckedTime(_ date: Date) -> String {
    let label = Calendar.current.isDateInToday(date)
        ? date.formatted(.dateTime.hour().minute())
        : date.formatted(.dateTime.month(.abbreviated).day().hour().minute())
    let zone = TimeZone.current.abbreviation(for: date) ?? ""
    return zone.isEmpty ? label : "\(label) \(zone)"
}

private func fantasyMatchup(_ opportunity: FantasyDecision.Opportunity) -> String? {
    guard let opponent = opportunity.opponent, !opponent.isEmpty else { return nil }
    if opportunity.home == true { return "vs \(opponent)" }
    if opportunity.home == false { return "at \(opponent)" }
    return opponent
}

private struct FantasyNextOpportunity: View {
    let decision: FantasyDecision
    let now: Date
    private var next: (FantasyDecision.Opportunity, Date)? {
        decision.opportunities.compactMap { opportunity -> (FantasyDecision.Opportunity, Date)? in
            guard let date = opportunity.start_at.flatMap(FantasyBriefing.timestamp), date > now else { return nil }
            return (opportunity, date)
        }.min { $0.1 < $1.1 }
    }
    var body: some View {
        if let (opportunity, date) = next {
            HStack(alignment: .firstTextBaseline, spacing: 7) {
                Image(systemName: "calendar").accessibilityHidden(true)
                Text([fantasyMatchup(opportunity), fantasyTimestamp(date)].compactMap { $0 }.joined(separator: " · "))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .font(.caption).foregroundStyle(FantasyInk.muted)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Next game: \([fantasyMatchup(opportunity), fantasyTimestamp(date)].compactMap { $0 }.joined(separator: ", "))")
        }
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
                    evidenceContent(now: context.date)
                } else {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 16) {
                            Text("This call’s window has closed.").font(.title2.weight(.semibold)).foregroundStyle(FantasyInk.paper)
                            Text("Return to the briefing for advice based on the next available update.")
                                .font(.body).foregroundStyle(FantasyInk.secondary)
                            Button(action: close) {
                                Text("Back to briefing").font(.headline).foregroundStyle(FantasyInk.gold)
                                    .frame(minHeight: 44).contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                        .padding(GaryLayout.gutter).frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
            .background(FantasyInk.background)
            .navigationTitle("Gary’s call").navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(FantasyInk.background, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(action: close) {
                        Text("Done").font(.body.weight(.semibold))
                            .frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
                    }
                    .tint(FantasyInk.gold)
                }
            }
        }
        .preferredColorScheme(.dark)
    }

    private func evidenceContent(now: Date) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 26) {
                VStack(alignment: .leading, spacing: 12) {
                    FantasyEyebrow(text: fantasyAction(decision))
                    Text(decision.player_name).font(.largeTitle.weight(.bold)).foregroundStyle(FantasyInk.paper)
                    Text([league, decision.identity].filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(.subheadline).foregroundStyle(FantasyInk.muted)
                    FantasyNextOpportunity(decision: decision, now: now)
                    Text(decision.displayText(decision.headline))
                        .font(.title2.weight(.semibold)).foregroundStyle(FantasyInk.paper)
                }
                FantasyTextSection(title: "WHY NOW", text: decision.displayText(decision.why_now))
                FantasyTextSection(title: "WHO THIS HELPS", text: decision.displayText(decision.fit))
                VStack(alignment: .leading, spacing: 18) {
                    FantasyTextSection(title: "THE COUNTERARGUMENT", text: decision.displayText(decision.risk))
                    FantasyRule()
                    FantasyTextSection(title: "WHAT TO CHECK NEXT", text: decision.displayText(decision.watch_for))
                }
                .padding(18).garyPanel(radius: GaryLayout.Radius.card, fill: FantasyInk.raised)
                applicability
                if !decision.opportunities.isEmpty { opportunities }
                if let ownership = decision.availability?.rostered_percent {
                    FantasyTextSection(title: "AVAILABILITY", text: "\(ownership.formatted(.number.precision(.fractionLength(1))))% rostered across the provider’s leagues. Check your own league’s player pool.")
                }
                FantasyRule()
                evidence
                if !decision.limitations.isEmpty {
                    FantasyTextSection(title: "LIMITS OF THIS READ", text: decision.limitations.map { decision.displayText($0) }.joined(separator: "\n\n"))
                }
                collectionWindow
            }
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(GaryLayout.gutter).padding(.bottom, 24)
            .textSelection(.enabled)
        }
    }

    private var applicability: some View {
        VStack(alignment: .leading, spacing: 10) {
            FantasyEyebrow(text: "WHERE THE CALL FITS")
            Text("Scoring: \(decision.formats.map(fantasyFormatLabel).joined(separator: ", "))")
                .font(.callout).foregroundStyle(FantasyInk.secondary)
            if !decision.categories.isEmpty {
                Text("Focus: \(decision.categories.map(fantasyCategoryLabel).joined(separator: ", "))")
                    .font(.callout).foregroundStyle(FantasyInk.secondary)
            }
            Text(decision.horizon == "week"
                ? "This week: \(FantasyBriefing.dayLabel(briefing.window_start)) – \(FantasyBriefing.dayLabel(briefing.window_end))"
                : "This call applies to the next game.")
                .font(.caption).foregroundStyle(FantasyInk.muted)
        }
    }

    private var opportunities: some View {
        VStack(alignment: .leading, spacing: 14) {
            FantasyEyebrow(text: "THE PLAYING WINDOW")
            ForEach(Array(decision.opportunities.enumerated()), id: \.offset) { _, opportunity in
                VStack(alignment: .leading, spacing: 5) {
                    if let matchup = fantasyMatchup(opportunity) {
                        Text(matchup).font(.callout.weight(.semibold)).foregroundStyle(FantasyInk.paper)
                    }
                    if let date = opportunity.start_at.flatMap(FantasyBriefing.timestamp) {
                        Text(fantasyTimestamp(date)).font(.callout).foregroundStyle(FantasyInk.secondary)
                    } else {
                        Text("Game time not available.").font(.callout).foregroundStyle(FantasyInk.muted)
                    }
                }
            }
        }
    }

    private var evidence: some View {
        VStack(alignment: .leading, spacing: 20) {
            FantasyEyebrow(text: "THE EVIDENCE")
            ForEach(Array(decision.evidence.enumerated()), id: \.element.id) { index, item in
                VStack(alignment: .leading, spacing: 8) {
                    Text("[\(index + 1)] \(decision.displayText(item.label))")
                        .font(.headline).foregroundStyle(FantasyInk.paper)
                    if let summary = item.summary, !summary.isEmpty {
                        Text(decision.displayText(summary)).font(.callout)
                            .foregroundStyle(FantasyInk.secondary).lineSpacing(4)
                    }
                    Text(item.source).font(.caption).foregroundStyle(FantasyInk.muted)
                    if let observedAt = item.observed_at.flatMap(FantasyBriefing.timestamp) {
                        Text("Source observed \(fantasyTimestamp(observedAt)).")
                            .font(.caption).foregroundStyle(FantasyInk.muted)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private var collectionWindow: some View {
        VStack(alignment: .leading, spacing: 8) {
            FantasyRule().padding(.bottom, 8)
            if let at = FantasyBriefing.timestamp(briefing.fetched_as_of) {
                Text("Evidence collected \(fantasyTimestamp(at)). Game and sample dates are shown above.")
            }
            if let expires = FantasyBriefing.timestamp(briefing.expires_at) {
                Text("Briefing evidence window ends \(fantasyTimestamp(expires)).")
            }
            if decision.horizon == "next_game", let validUntil = decision.valid_until.flatMap(FantasyBriefing.timestamp) {
                Text("This call closes \(fantasyTimestamp(validUntil)).")
            }
        }
        .font(.caption).foregroundStyle(FantasyInk.muted)
    }
}

private func fantasyFormatLabel(_ value: String) -> String {
    switch value {
    case "categories": return "Categories"
    case "points": return "Points"
    case "standard": return "Standard"
    case "half_ppr": return "Half PPR"
    case "ppr": return "PPR"
    default: return value
    }
}

private func fantasyCategoryLabel(_ value: String) -> String {
    switch value.lowercased() {
    case "era": return "ERA"
    case "whip": return "WHIP"
    case "rbi": return "RBI"
    case "flex": return "FLEX"
    case "obp": return "OBP"
    case "ops": return "OPS"
    case "avg": return "AVG"
    case "qb", "rb", "wr", "te", "hr", "sb", "ip", "qs": return value.uppercased()
    default:
        let words = value.replacingOccurrences(of: "_", with: " ")
        return words.prefix(1).uppercased() + words.dropFirst()
    }
}
