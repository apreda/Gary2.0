import SwiftUI

/// The judgment opens its own complete case. Player/game research remains a
/// separate exact-identity action, so a current profile never replaces it.
struct HubJudgmentCaseView: View {
    let judgment: HubJudgment
    let context: String
    let isCurrent: (Date) -> Bool
    var onPlayer: (() -> Void)? = nil
    var onGame: (() -> Void)? = nil
    let onClose: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Gary’s case").font(.headline).foregroundStyle(GaryColors.warmWhite)
                Spacer(minLength: 12)
                Button(action: onClose) {
                    Image(systemName: "xmark").font(.body.weight(.semibold))
                        .foregroundStyle(GaryColors.sectionSub).frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }.buttonStyle(.plain).accessibilityLabel("Close Gary’s full case")
            }
            .padding(.horizontal, GaryLayout.gutter).padding(.top, 8)
            Divider().overlay(GaryColors.gold.opacity(0.25))
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    TimelineView(.periodic(from: .now, by: 30)) { clock in
                        if !isCurrent(clock.date) {
                            Text("This saved case is no longer current. Check the latest Hub context before using it.")
                                .font(.callout).foregroundStyle(GaryColors.warmWhite)
                                .padding(14).background(GaryColors.cardBg, in: RoundedRectangle(cornerRadius: 12))
                        }
                    }
                    VStack(alignment: .leading, spacing: 12) {
                        Text(context).font(.system(.caption, design: .monospaced))
                            .foregroundStyle(GaryColors.gold)
                        Text(judgment.displayText(judgment.take)).font(.title2.weight(.bold))
                            .foregroundStyle(GaryColors.warmWhite)
                        if let condition = judgment.critical_condition, !condition.isEmpty {
                            Text(judgment.displayText(condition)).font(.callout.weight(.semibold))
                                .foregroundStyle(GaryColors.lightGold)
                        }
                        Text(judgment.displayText(judgment.explanation)).font(.body).lineSpacing(4)
                            .foregroundStyle(GaryColors.warmWhite.opacity(0.88))
                        HubJudgmentTiming(judgment: judgment)
                    }
                    if let changed = judgment.what_changed, !changed.isEmpty {
                        caseSection("What changed", text: changed)
                    }
                    caseSection("How I see it", text: judgment.full_case)
                    caseSection("The other side", text: judgment.counterargument)
                    caseSection("What could change my view", text: judgment.watch_for)
                    evidence
                    if onPlayer != nil || onGame != nil {
                        VStack(alignment: .leading, spacing: 0) {
                            if let onPlayer { researchButton("Player details", icon: "person.text.rectangle", action: onPlayer) }
                            if let onGame { researchButton("More on this game", icon: "sportscourt", action: onGame) }
                        }
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, GaryLayout.gutter).padding(.vertical, 22)
            }
        }
        .background(GaryColors.darkBg)
        .preferredColorScheme(.dark)
        .accessibilityAction(.escape, onClose)
    }

    private func caseSection(_ title: String, text: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title).font(.headline).foregroundStyle(GaryColors.warmWhite)
            Text(judgment.displayText(text)).font(.body).lineSpacing(4)
                .foregroundStyle(GaryColors.warmWhite.opacity(0.88))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var evidence: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("The evidence").font(.headline).foregroundStyle(GaryColors.warmWhite)
            ForEach(Array(judgment.evidence.enumerated()), id: \.element.id) { index, item in
                VStack(alignment: .leading, spacing: 9) {
                    Text("[\(index + 1)] \(item.label)").font(.subheadline.weight(.semibold))
                        .foregroundStyle(GaryColors.lightGold)
                    Text(judgment.displayText(item.summary)).font(.callout).lineSpacing(3)
                        .foregroundStyle(GaryColors.warmWhite.opacity(0.88))
                    Text([item.source, HubJudgmentTiming.timestamp(item.as_of)].filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(.caption).foregroundStyle(GaryColors.sectionSub)
                    if let facts = item.facts {
                        HubEvidenceNode(label: "Observed data", value: facts)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if index < judgment.evidence.count - 1 { Divider().overlay(GaryColors.warmWhite.opacity(0.08)) }
            }
        }
    }

    private func researchButton(_ title: String, icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Label(title, systemImage: icon)
                Spacer(minLength: 0)
                Image(systemName: "arrow.right").accessibilityHidden(true)
            }
            .font(.subheadline.weight(.semibold)).foregroundStyle(GaryColors.gold)
            .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading).contentShape(Rectangle())
        }.buttonStyle(.plain)
    }
}

struct HubJudgmentTiming: View {
    let judgment: HubJudgment
    var compact = false

    var body: some View {
        Text(compact ? "Checked \(Self.timestamp(judgment.as_of, short: true))"
             : "Checked \(Self.timestamp(judgment.as_of)) · Before \(Self.timestamp(judgment.valid_until, short: true))")
            .font(.caption).foregroundStyle(GaryColors.sectionSub)
            .fixedSize(horizontal: false, vertical: true)
    }

    static func timestamp(_ text: String, short: Bool = false) -> String {
        guard let date = HubJudgment.timestamp(text) else { return "" }
        let formatter = DateFormatter()
        formatter.locale = .current
        formatter.timeZone = TimeZone(identifier: "America/New_York")
        formatter.dateFormat = short ? "h:mm a 'ET'" : "MMM d, h:mm a 'ET'"
        return formatter.string(from: date)
    }
}

/// A voluntary measurement drill-down, preserving every numerical source
/// value. Provider IDs and transport keys are omitted from reading labels.
private struct HubEvidenceNode: View {
    let label: String
    let value: HubEvidenceValue

    var body: some View {
        Group {
            if let text = value.text {
                VStack(alignment: .leading, spacing: 3) {
                    Text(label).font(.caption).foregroundStyle(GaryColors.sectionSub)
                    Text(text).font(.callout.monospacedDigit()).foregroundStyle(GaryColors.warmWhite)
                }
            } else if !children.isEmpty {
                DisclosureGroup {
                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(children, id: \.id) { child in
                            HubEvidenceNode(label: child.label, value: child.value)
                        }
                    }.padding(.top, 10).padding(.leading, 4)
                } label: {
                    Text(label).font(.subheadline).foregroundStyle(GaryColors.gold)
                        .frame(minHeight: 44, alignment: .leading)
                }
                .tint(GaryColors.gold)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private struct Child {
        let id: String
        let label: String
        let value: HubEvidenceValue
    }

    private var children: [Child] {
        switch value {
        case .object(let object):
            let hidden: Set<String> = ["id", "ids", "source_key", "kind", "source", "category", "schema_version", "version",
                                       "as_of", "computed_detail", "computed_detail_kind", "display_measurements", "summary_type"]
            var measured = object
            if case .object(let display)? = object["display_measurements"] {
                for (key, value) in display { measured[key] = value }
            }
            return measured.keys.sorted().filter {
                !hidden.contains($0) && !$0.hasSuffix("_id") && !$0.hasSuffix("_ids")
                    && !$0.hasSuffix("Id") && !$0.hasSuffix("ID") && !$0.hasSuffix("Ids")
                    && !$0.hasSuffix("_at") && !$0.hasSuffix("_as_of")
            }.compactMap { key in
                guard let value = measured[key] else { return nil }
                if case .null = value { return nil }
                return Child(id: key, label: Self.readable(key), value: value)
            }
        case .array(let array):
            return array.enumerated().compactMap { index, item in
                if case .null = item { return nil }
                var label = "Observation \(index + 1)"
                if case .object(let object) = item {
                    label = object["name"]?.text ?? object["player_name"]?.text ?? object["team"]?.text ?? label
                }
                return Child(id: String(index), label: label, value: item)
            }
        default: return []
        }
    }

    private static func readable(_ key: String) -> String {
        let labels = ["era": "ERA", "whip": "WHIP", "ops": "OPS", "xera": "xERA", "xba": "xBA", "xwoba": "xwOBA",
                      "obp": "On-base percentage", "avg": "Batting average", "slg": "Slugging percentage", "ip": "Innings pitched",
                      "hr": "Home runs", "rbi": "RBI", "k_pct": "Strikeout rate", "bb_pct": "Walk rate", "pa": "Plate appearances",
                      "sides": "Teams", "season_baseline": "Season measurements", "probable_pitcher": "Probable starting pitcher"]
        if let label = labels[key] { return label }
        let batting = ["gp": "Games", "pa": "Plate appearances", "ab": "At-bats", "r": "Runs", "h": "Hits",
                       "hr": "Home runs", "rbi": "RBI", "bb": "Walks", "so": "Strikeouts", "sb": "Stolen bases",
                       "avg": "Batting average", "obp": "On-base percentage", "slg": "Slugging percentage", "ops": "OPS"]
        let pitching = ["gp": "Pitching appearances", "gs": "Starts", "ip": "Innings pitched", "h": "Hits allowed",
                        "er": "Earned runs", "bb": "Walks allowed", "k": "Strikeouts", "k_per_9": "Strikeouts per nine innings",
                        "era": "ERA", "whip": "WHIP"]
        if key.hasPrefix("batting_"), let label = batting[String(key.dropFirst(8))] { return label }
        if key.hasPrefix("pitching_"), let label = pitching[String(key.dropFirst(9))] { return label }
        return key.replacingOccurrences(of: "_", with: " ").capitalized
    }
}
