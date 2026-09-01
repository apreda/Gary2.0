// PropsView.swift — Player Props + Props Dashboard support types.
// Split out of Views.swift on Sep 1 2026 (the 28K-line monolith); pure move,
// no behavior change. Section boundaries follow the original MARK headers.

import SwiftUI
import Combine
import Charts
import WebKit
import SafariServices
import StoreKit

// MARK: - Player Props

struct GaryPropsView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var allProps: [PropPick] = []
    @State private var loading = true
    @State private var fetchFailed = false
    @State private var selectedSport: Sport = .all
    @State private var selectedMatchup: String? = nil
    @State private var lastUpdated: Date?
    @State private var selectedProp: PropPick?
    @State private var propResultsMap: [String: String] = [:]
    @State private var showingYesterdayResults = false
    @State private var yesterdayProps: [PropPick] = []
    @State private var yesterdayResultsMap: [String: String] = [:]
    @State private var sportsWithFreshProps: Set<String> = []
    // Gary's GAME picks (ML / spread / total) — shown at the top of each game's
    // view so the per-game page carries the game pick + the prop picks together.
    @State private var gamePicks: [GaryPick] = []
    @State private var yesterdayGamePicks: [GaryPick] = []
    @State private var gameResultsMap: [String: String] = [:]

    // MARK: - Dashboard view state (Quant Terminal redesign)
    @State private var viewMode: PropDashViewMode = .cards
    @State private var sortMode: PropDashSort = .confidence
    @State private var ouFilter: PropDashOU = .all
    @State private var propTypeFilter: String? = nil
    @State private var openGames: Set<String> = []   // expanded game / TD-category sections
    @State private var openTakes: Set<String> = []   // expanded "Gary's Take" rows in table mode

    private let winColor = Color(hex: "#9cc88a")
    private let loseColor = Color(hex: "#cf6b5b")
    private let pushColor = GaryColors.gold

    private var headerDateString: String {
        let fmt = DateFormatter()
        fmt.dateFormat = "EEEE, MMM d"
        fmt.timeZone = TimeZone(identifier: "America/New_York")
        return fmt.string(from: Date()).uppercased()
    }
    
    private var filteredProps: [PropPick] {
        // Sort props by game time (commence_time) - earliest games first
        let sortByTime: ([PropPick]) -> [PropPick] = { props in
            props.sorted { a, b in
                let timeA = a.commence_time ?? ""
                let timeB = b.commence_time ?? ""
                return timeA < timeB
            }
        }

        switch selectedSport {
        case .all:
            // Only NFL TDs have a dedicated props lane. College touchdown
            // props remain normal NCAAF content in ALL.
            let todayCore = allProps.filter { !$0.isNFLTDPick }
            if todayCore.isEmpty && showingYesterdayResults {
                return sortByTime(yesterdayProps.filter { !$0.isNFLTDPick })
            }
            return sortByTime(todayCore)
        case .nflTDs:
            var merged = allProps
            if showingYesterdayResults { merged.append(contentsOf: yesterdayProps) }
            return merged.filter { $0.isNFLTDPick }.sorted { a, b in
                if a.tdCategory != b.tdCategory { return a.tdCategory == "standard" }
                return (a.commence_time ?? "") < (b.commence_time ?? "")
            }
        case .nfl:
            var merged = allProps
            if showingYesterdayResults && !sportsWithFreshProps.contains("NFL") {
                merged.append(contentsOf: yesterdayProps.filter { ($0.effectiveLeague ?? "") == "NFL" })
            }
            return sortByTime(merged.filter { ($0.effectiveLeague ?? "") == "NFL" && !$0.isNFLTDPick })
        default:
            var merged = allProps
            if showingYesterdayResults && !sportsWithFreshProps.contains(selectedSport.rawValue) {
                merged.append(contentsOf: yesterdayProps.filter { ($0.effectiveLeague ?? "") == selectedSport.rawValue })
            }
            return sortByTime(merged.filter { ($0.effectiveLeague ?? "") == selectedSport.rawValue })
        }
    }
    
    /// TD picks grouped by category for section headers
    private var tdPicksByCategory: [(category: String, label: String, picks: [PropPick])] {
        guard selectedSport == .nflTDs else { return [] }

        let standardPicks = filteredProps.filter { $0.tdCategory == "standard" }
        let underdogPicks = filteredProps.filter { $0.tdCategory == "underdog" }
        let firstTDPicks = filteredProps.filter { $0.tdCategory == "first_td" }

        var result: [(category: String, label: String, picks: [PropPick])] = []
        if !standardPicks.isEmpty {
            result.append(("standard", "Regular", standardPicks))
        }
        if !underdogPicks.isEmpty {
            result.append(("underdog", "Value", underdogPicks))
        }
        if !firstTDPicks.isEmpty {
            result.append(("first_td", "First TD", firstTDPicks))
        }
        return result
    }
    
    private var availableSports: Set<String> {
        let combined = allProps + (showingYesterdayResults ? yesterdayProps : [])
        // Keep the NFL TD-only payload out of the regular NFL chip. NCAAF TD
        // props are not special-cased and continue to surface NCAAF normally.
        var sports = Set(combined.filter { !$0.isNFLTDPick }.compactMap { $0.effectiveLeague })
        if combined.contains(where: { $0.isNFLTDPick }) {
            sports.insert("NFL TDs")
        }
        return sports
    }
    
    /// Get time slot string for props (e.g., "Sunday 1:00 PM ET")
    private func getTimeSlot(for prop: PropPick) -> String? {
        // Try commence_time first (ISO format)
        if let isoTime = prop.commence_time, !isoTime.isEmpty {
            if let gameDate = parseISO8601(isoTime) {
                return Formatters.dayTimeFormatterEST.string(from: gameDate) + " ET"
            }
        }
        
        // Fallback to time field if available (already formatted)
        if let time = prop.time, !time.isEmpty, time != "TBD" {
            return time
        }
        
        return nil
    }
    
    /// Group props by matchup for section headers (with time as secondary info)
    private var propsByMatchup: [(matchup: String, time: String, props: [PropPick])] {
        var grouped: [String: (time: String, props: [PropPick])] = [:]
        var order: [String] = []
        
        for prop in filteredProps {
            // Use matchup if available, otherwise fall back to time slot
            let matchup = prop.matchup ?? getTimeSlot(for: prop) ?? "TBD"
            let time = getTimeSlot(for: prop) ?? ""
            
            if grouped[matchup] == nil {
                grouped[matchup] = (time: time, props: [])
                order.append(matchup)
            }
            grouped[matchup]?.props.append(prop)
        }
        
        return order.map { (matchup: $0, time: grouped[$0]?.time ?? "", props: grouped[$0]?.props ?? []) }
    }

    var body: some View {
        ZStack {
            LiquidGlassBackground(grainDensity: 0)

            VStack(spacing: 0) {
                // Persistent sport switcher — always visible, even on the
                // empty / loading / recap states (so a filter can't trap you).
                topBar

                Group {
                    if loading {
                        loadingState
                    } else if fetchFailed {
                        failedState
                    } else if filteredProps.isEmpty {
                        emptyState
                    } else {
                        dashboard
                    }
                }
            }
        }
        .overlay {
            if let prop = selectedProp {
                PropDetailPopup(prop: prop) {
                    selectedProp = nil
                }
                .transition(.opacity)
            }
        }
        .task {
            await loadProps()
            await loadGamePicks()
            ensureFirstGameOpen()
        }
        .onChange(of: selectedSport) { _ in
            selectedMatchup = nil
            ouFilter = .all
            propTypeFilter = nil
            openGames = []
            ensureFirstGameOpen()
        }
    }

    // MARK: - Dashboard derived data (Quant Terminal)

    /// `filteredProps` after the O/U + prop-type controls. (Sport selection and
    /// the yesterday-recap fallback are already applied upstream by `filteredProps`.)
    private var visibleProps: [PropPick] {
        var out = filteredProps
        switch ouFilter {
        case .all:   break
        case .over:  out = out.filter { isOverBet($0.bet) }
        case .under: out = out.filter { !isOverBet($0.bet) }
        }
        if let t = propTypeFilter {
            out = out.filter { Formatters.propDisplay($0.prop, league: $0.effectiveLeague) == t }
        }
        return out
    }

    private func isOverBet(_ bet: String?) -> Bool {
        let b = (bet ?? "").lowercased()
        return b == "over" || b == "yes"
    }

    private func sortProps(_ props: [PropPick]) -> [PropPick] {
        switch sortMode {
        case .confidence: return props.sorted { ($0.confidence ?? 0) > ($1.confidence ?? 0) }
        case .time:       return props.sorted { ($0.commence_time ?? "") < ($1.commence_time ?? "") }
        case .player:     return props.sorted { ($0.player ?? "") < ($1.player ?? "") }
        }
    }

    /// Group an arbitrary prop list by matchup, preserving first-seen order.
    private func groupByMatchup(_ props: [PropPick]) -> [(matchup: String, time: String, props: [PropPick])] {
        var grouped: [String: (time: String, props: [PropPick])] = [:]
        var order: [String] = []
        for prop in props {
            let matchup = prop.matchup ?? getTimeSlot(for: prop) ?? "TBD"
            let time = getTimeSlot(for: prop) ?? ""
            if grouped[matchup] == nil { grouped[matchup] = (time, []); order.append(matchup) }
            grouped[matchup]?.props.append(prop)
        }
        return order.map { (matchup: $0, time: grouped[$0]?.time ?? "", props: grouped[$0]?.props ?? []) }
    }

    private var slateGames: [(matchup: String, time: String, props: [PropPick])] {
        groupByMatchup(visibleProps)
    }

    private var propTypeOptions: [String] {
        var seen = Set<String>(); var out: [String] = []
        for p in filteredProps {
            let t = Formatters.propDisplay(p.prop, league: p.effectiveLeague)
            if !t.isEmpty && !seen.contains(t) { seen.insert(t); out.append(t) }
        }
        return out.sorted()
    }

    private var topPlays: [PropPick] {
        Array(visibleProps.sorted { ($0.confidence ?? 0) > ($1.confidence ?? 0) }.prefix(3))
    }

    private var avgConfidence: Double {
        let vals = visibleProps.compactMap { $0.confidence }
        guard !vals.isEmpty else { return 0 }
        return vals.reduce(0, +) / Double(vals.count)
    }

    private var distinctSportCount: Int {
        Set(visibleProps.compactMap { $0.effectiveLeague }).count
    }

    private var gradedRecord: (w: Int, l: Int, p: Int) {
        visibleProps.reduce(into: (w: 0, l: 0, p: 0)) { acc, prop in
            switch resultForProp(prop) {
            case "won":  acc.w += 1
            case "lost": acc.l += 1
            case "push": acc.p += 1
            default:     break
            }
        }
    }

    private var isRecapMode: Bool {
        visibleProps.contains { isYesterdayProp($0) }
    }

    /// Sport pills for the persistent top bar — ALL first, then any sport that
    /// has props (fresh or recap), then NFL TDs if present.
    private var sportButtons: [(sport: Sport, label: String)] {
        var out: [(sport: Sport, label: String)] = [(.all, "ALL")]
        let order = ["MLB", "NBA", "NHL", "NFL", "NCAAB", "NCAAF", "EPL", "WNBA"]
        for s in order where availableSports.contains(s) {
            if let sp = Sport.allCases.first(where: { $0.rawValue == s }) { out.append((sp, s)) }
        }
        if availableSports.contains("NFL TDs") { out.append((.nflTDs, "NFL TDs")) }
        return out
    }

    private func avgConf(_ props: [PropPick]) -> Double {
        let v = props.compactMap { $0.confidence }
        guard !v.isEmpty else { return 0 }
        return v.reduce(0, +) / Double(v.count)
    }

    private func ensureFirstGameOpen() {
        guard openGames.isEmpty else { return }
        if selectedSport == .nflTDs {
            if let first = tdPicksByCategory.first?.category { openGames = ["TD-" + first] }
        } else if let first = slateGames.first?.matchup {
            openGames = [first]
        }
    }

    // MARK: - Formatting helpers

    private func formattedLine(_ raw: String?) -> String {
        guard let r = raw?.trimmingCharacters(in: .whitespaces), !r.isEmpty else { return "" }
        if let d = Double(r) {
            return d.truncatingRemainder(dividingBy: 1) == 0 ? String(format: "%g", d) : String(format: "%.1f", d)
        }
        return r
    }

    /// "TOTAL BASES · OVER 1.5 · −110"
    private func betLine(_ prop: PropPick) -> String {
        let type = Formatters.propDisplay(prop.prop, league: prop.effectiveLeague).uppercased()
        let bet = (prop.bet ?? "").uppercased()
        let line = formattedLine(prop.line)
        let odds = Formatters.americanOdds(prop.odds)
        var parts: [String] = []
        if !type.isEmpty { parts.append(type) }
        // STORE-SAFE BRIDGE: "2+" / "1 or fewer" instead of "OVER 1.5".
        if let b = prop.bridgeCallText {
            parts.append(b.uppercased())
        } else if !bet.isEmpty {
            parts.append(line.isEmpty ? bet : "\(bet) \(line)")
        }
        if !odds.isEmpty { parts.append(odds) }
        return parts.joined(separator: "  ·  ")
    }

    /// Short bet token for the dense table ("O 1.5" / "U 24.5" / "YES").
    private func betToken(_ prop: PropPick) -> String {
        let bet = (prop.bet ?? "").lowercased()
        let line = formattedLine(prop.line)
        // STORE-SAFE BRIDGE: dense-table tokens without market notation —
        // "2+" for overs, "≤ N" for unders.
        if AppFlags.storeSafe, let b = prop.bridgeCallText {
            return b.hasSuffix("or fewer") ? "≤ \(b.replacingOccurrences(of: " or fewer", with: ""))" : b
        }
        switch bet {
        case "over":  return line.isEmpty ? "OVER" : "O \(line)"
        case "under": return line.isEmpty ? "UNDER" : "U \(line)"
        case "yes":   return "YES"
        case "no":    return "NO"
        default:      return line.isEmpty ? bet.uppercased() : "\(bet.uppercased()) \(line)"
        }
    }

    private func betColor(_ prop: PropPick) -> Color {
        isOverBet(prop.bet) ? winColor : loseColor
    }

    private func oneLineTake(_ prop: PropPick) -> String? {
        guard let a = prop.analysis.map({ AppFlags.bridgeProse($0) })?.trimmingCharacters(in: .whitespacesAndNewlines), !a.isEmpty else { return nil }
        if let dot = a.firstIndex(where: { ".!?".contains($0) }) {
            let s = String(a[...dot]).trimmingCharacters(in: .whitespaces)
            if s.count > 12 { return s }
        }
        return a
    }

    private func gamePickSummary(_ pick: GaryPick) -> String {
        (pick.pick ?? "").trimmingCharacters(in: .whitespaces)
    }

    // MARK: - Dashboard shell

    private var dashboard: some View {
        ScrollView(showsIndicators: false) {
            LazyVStack(spacing: 14, pinnedViews: [.sectionHeaders]) {
                commandStrip
                kpiTiles
                Section {
                    slateContent
                } header: {
                    stickyControlBar
                }
            }
            .padding(.bottom, 120)
        }
        .refreshable {
            await loadProps(forceRefresh: true)
            await loadGamePicks(forceRefresh: true)
        }
    }

    private var topBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(sportButtons, id: \.label) { item in
                    sportPill(item.sport, item.label)
                }
            }
            .padding(.horizontal, 14)
        }
        .padding(.vertical, 10)
        .background(
            ZStack {
                GaryColors.darkBg.opacity(0.45)
                VStack { Spacer(); Rectangle().fill(Color.white.opacity(0.06)).frame(height: 1) }
            }
        )
    }

    private var commandStrip: some View {
        VStack(alignment: .leading, spacing: 13) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(headerDateString)
                        .font(GaryFonts.mono(9.5, bold: true)).tracking(1)
                        .foregroundStyle(GaryColors.gold.opacity(0.9))
                    Text("PROPS BOARD")
                        .font(GaryFonts.mono(24, bold: true)).tracking(0.5)
                        .foregroundStyle(.white)
                }
                Spacer()
                if isRecapMode {
                    Text("RECAP")
                        .font(GaryFonts.mono(9, bold: true)).tracking(1)
                        .foregroundStyle(GaryColors.gold)
                        .padding(.horizontal, 9).padding(.vertical, 5)
                        .background(Capsule().stroke(GaryColors.gold.opacity(0.25), lineWidth: 1))
                }
            }

            Text("\(visibleProps.count) PROPS    ·    \(distinctSportCount) \(distinctSportCount == 1 ? "SPORT" : "SPORTS")    ·    \(slateGames.count) \(slateGames.count == 1 ? "GAME" : "GAMES")")
                .font(GaryFonts.mono(11, bold: false)).tracking(1)
                .foregroundStyle(.white.opacity(0.55))

            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("CONFIDENCE SHAPE")
                        .font(GaryFonts.mono(8.5, bold: true)).tracking(1.4)
                        .foregroundStyle(.white.opacity(0.62))
                    Spacer()
                    Text("\(Int(round(avgConfidence * 100)))% AVG")
                        .font(GaryFonts.mono(8.5, bold: true)).tracking(1)
                        .foregroundStyle(GaryColors.gold.opacity(0.9))
                }
                ConfidenceShapeView(values: visibleProps.compactMap { $0.confidence }.sorted(by: >))
                    .frame(height: 32)
            }
        }
        .padding(16)
        .quantPanel()
        .padding(.horizontal, 14)
        .padding(.top, 8)
    }

    private var kpiTiles: some View {
        HStack(spacing: 8) {
            QuantKpiTile(label: "PROPS", value: "\(visibleProps.count)",
                         sub: "\(slateGames.count) \(slateGames.count == 1 ? "GAME" : "GAMES")")
            QuantKpiTile(label: "AVG LEAN", value: "\(Int(round(avgConfidence * 100)))%",
                         sub: "CONFIDENCE", accent: GaryColors.gold)
            if gradedRecord.w + gradedRecord.l + gradedRecord.p > 0 {
                QuantKpiTile(label: "RECORD",
                             value: "\(gradedRecord.w)-\(gradedRecord.l)\(gradedRecord.p > 0 ? "-\(gradedRecord.p)" : "")",
                             sub: "GRADED",
                             accent: gradedRecord.w >= gradedRecord.l ? winColor : loseColor)
            } else if let best = topPlays.first {
                QuantKpiTile(label: "BEST BET",
                             value: "\(Int(round((best.confidence ?? 0) * 100)))%",
                             sub: (best.player ?? best.team ?? "").uppercased(),
                             accent: GaryColors.gold)
            } else {
                QuantKpiTile(label: "SPORTS", value: "\(distinctSportCount)", sub: "LEAGUES")
            }
        }
        .padding(.horizontal, 14)
    }

    private var stickyControlBar: some View {
        HStack(spacing: 7) {
            sortMenu
            if selectedSport != .nflTDs { ouMenu }
            typeMenu
            Spacer()
            if selectedSport != .nflTDs { viewModeToggle }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
            ZStack {
                GaryColors.darkBg.opacity(0.97)
                VStack { Spacer(); Rectangle().fill(Color.white.opacity(0.08)).frame(height: 1) }
            }
        )
    }

    private func controlChip(_ icon: String, _ text: String, active: Bool = false) -> some View {
        HStack(spacing: 5) {
            Image(systemName: icon).font(.system(size: 9, weight: .semibold))
            Text(text).font(GaryFonts.mono(10.5, bold: true)).tracking(0.5)
                .lineLimit(1)
            Image(systemName: "chevron.down").font(.system(size: 7, weight: .bold)).opacity(0.5)
        }
        .foregroundStyle(active ? GaryColors.gold : .white.opacity(0.7))
        .padding(.horizontal, 10).padding(.vertical, 7)
        .background(
            RoundedRectangle(cornerRadius: 7, style: .continuous)
                .fill(Color.white.opacity(0.04))
                .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous)
                    .stroke(active ? GaryColors.gold.opacity(0.4) : Color.white.opacity(0.08), lineWidth: 1))
        )
    }

    private var sortMenu: some View {
        Menu {
            ForEach(PropDashSort.allCases) { m in
                Button { sortMode = m } label: {
                    HStack { Text(m.label); if sortMode == m { Image(systemName: "checkmark") } }
                }
            }
        } label: { controlChip("arrow.up.arrow.down", sortMode.label) }
    }

    private var ouMenu: some View {
        Menu {
            ForEach(PropDashOU.allCases) { m in
                Button { ouFilter = m } label: {
                    HStack { Text(m.label); if ouFilter == m { Image(systemName: "checkmark") } }
                }
            }
        } label: { controlChip("arrow.up.arrow.down.circle", ouFilter == .all ? "O/U" : ouFilter.label, active: ouFilter != .all) }
    }

    private var typeMenu: some View {
        Menu {
            Button { propTypeFilter = nil } label: {
                HStack { Text("All Types"); if propTypeFilter == nil { Image(systemName: "checkmark") } }
            }
            ForEach(propTypeOptions, id: \.self) { t in
                Button { propTypeFilter = t } label: {
                    HStack { Text(t); if propTypeFilter == t { Image(systemName: "checkmark") } }
                }
            }
        } label: { controlChip("line.3.horizontal.decrease", propTypeFilter ?? "TYPE", active: propTypeFilter != nil) }
    }

    private var viewModeToggle: some View {
        HStack(spacing: 0) {
            ForEach([PropDashViewMode.cards, .table], id: \.self) { mode in
                Button {
                    withAnimation(.easeInOut(duration: 0.18)) { viewMode = mode }
                } label: {
                    Image(systemName: mode == .cards ? "rectangle.grid.1x2" : "tablecells")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(viewMode == mode ? Color.black.opacity(0.85) : .white.opacity(0.55))
                        .frame(width: 34, height: 28)
                        .background(viewMode == mode ? GaryColors.gold : Color.clear)
                }
                .buttonStyle(.plain)
            }
        }
        .background(Color.white.opacity(0.04))
        .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous).stroke(Color.white.opacity(0.08), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
    }

    private func sportPill(_ sport: Sport, _ label: String) -> some View {
        let on = selectedSport == sport
        let fresh = sportsWithFreshProps.contains(sport.rawValue)
        return Button {
            withAnimation(.easeInOut(duration: 0.2)) {
                selectedSport = sport
                selectedMatchup = nil
                ouFilter = .all
                propTypeFilter = nil
                openGames = []
            }
        } label: {
            HStack(spacing: 5) {
                Text(label).font(GaryFonts.mono(11, bold: true)).tracking(0.6)
                if fresh && !on { Circle().fill(GaryColors.gold).frame(width: 4, height: 4) }
            }
            .foregroundStyle(on ? Color.black.opacity(0.9) : .white.opacity(0.6))
            .padding(.horizontal, 12).padding(.vertical, 7)
            .background(
                RoundedRectangle(cornerRadius: 7, style: .continuous)
                    .fill(on ? GaryColors.gold : Color.white.opacity(0.04))
                    .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous)
                        .stroke(on ? Color.clear : Color.white.opacity(0.08), lineWidth: 1))
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Slate

    @ViewBuilder
    private var slateContent: some View {
        if visibleProps.isEmpty {
            VStack(spacing: 12) {
                Text("NO PROPS MATCH THESE FILTERS")
                    .font(GaryFonts.mono(10, bold: true)).tracking(1.2)
                    .foregroundStyle(.white.opacity(0.62))
                Button {
                    withAnimation { ouFilter = .all; propTypeFilter = nil }
                } label: {
                    Text("CLEAR FILTERS")
                        .font(GaryFonts.mono(10, bold: true)).tracking(1)
                        .foregroundStyle(GaryColors.gold)
                        .padding(.horizontal, 14).padding(.vertical, 8)
                        .background(Capsule().stroke(GaryColors.gold.opacity(0.25), lineWidth: 1))
                }
            }
            .frame(maxWidth: .infinity).padding(.top, 50)
        } else {
            VStack(spacing: 14) {
                if !topPlays.isEmpty { topPlaysModule }

                if selectedSport == .nflTDs {
                    ForEach(tdPicksByCategory, id: \.category) { group in
                        tdCategorySection(group)
                    }
                } else if viewMode == .table {
                    propTable
                } else {
                    ForEach(slateGames, id: \.matchup) { group in
                        gameSection(group)
                    }
                }
            }
            .padding(.top, 12)
        }
    }

    private var topPlaysModule: some View {
        VStack(alignment: .leading, spacing: 9) {
            sectionLabel("GARY'S TOP PLAYS", accent: true)
                .padding(.horizontal, 14)
            VStack(spacing: 8) {
                ForEach(topPlays) { prop in topPlayCard(prop) }
            }
            .padding(.horizontal, 14)
        }
    }

    private func topPlayCard(_ prop: PropPick) -> some View {
        Button { selectedProp = prop } label: {
            HStack(spacing: 13) {
                confidenceRing(prop.confidence ?? 0)
                VStack(alignment: .leading, spacing: 5) {
                    HStack(spacing: 8) {
                        Text(prop.player ?? prop.team ?? "")
                            .font(GaryFonts.text(17))
                            .foregroundStyle(.white).lineLimit(1).minimumScaleFactor(0.8)
                        Spacer(minLength: 4)
                        if let lg = prop.effectiveLeague {
                            Text(lg.uppercased())
                                .font(GaryFonts.mono(8.5, bold: true)).tracking(1)
                                .foregroundStyle(.white.opacity(0.62))
                        }
                        if let r = resultForProp(prop) { resultChip(r) }
                    }
                    Text(betLine(prop))
                        .font(GaryFonts.mono(10.5, bold: true)).tracking(0.6)
                        .foregroundStyle(GaryColors.gold).lineLimit(1).minimumScaleFactor(0.7)
                    if let take = oneLineTake(prop) {
                        Text(take)
                            .font(.system(size: 11.5, weight: .regular))
                            .foregroundStyle(.white.opacity(0.62)).lineLimit(2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .padding(13)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(GaryColors.gold.opacity(0.05))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(GaryColors.gold.opacity(0.22), lineWidth: 1))
            )
        }
        .buttonStyle(.plain)
    }

    private func confidenceRing(_ value: Double) -> some View {
        ZStack {
            Circle().stroke(Color.white.opacity(0.08), lineWidth: 4)
            Circle().trim(from: 0, to: CGFloat(max(0.02, min(1, value))))
                .stroke(GaryColors.gold, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Text("\(Int(round(value * 100)))")
                .font(GaryFonts.mono(14, bold: true))
                .foregroundStyle(.white)
        }
        .frame(width: 48, height: 48)
    }

    private func sectionLabel(_ text: String, accent: Bool = false) -> some View {
        Text(text)
            .font(GaryFonts.mono(9.5, bold: true)).tracking(1)
            .foregroundStyle(accent ? GaryColors.gold.opacity(0.9) : .white.opacity(0.4))
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func resultChip(_ result: String) -> some View {
        let r = result.lowercased()
        let txt = r == "won" ? "W" : (r == "push" ? "P" : "L")
        let col = r == "won" ? winColor : (r == "push" ? pushColor : loseColor)
        return Text(txt)
            .font(GaryFonts.mono(9, bold: true))
            .foregroundStyle(col)
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(Capsule().fill(col.opacity(0.14)).overlay(Capsule().stroke(col.opacity(0.3), lineWidth: 1)))
    }

    private var rowDivider: some View {
        Rectangle().fill(Color.white.opacity(0.06)).frame(height: 1).padding(.horizontal, 16)
    }

    private func gameSection(_ group: (matchup: String, time: String, props: [PropPick])) -> some View {
        let isOpen = openGames.contains(group.matchup)
        let entry = gamePickEntry(forMatchup: group.matchup)
        return VStack(spacing: 0) {
            Button {
                withAnimation(.easeInOut(duration: 0.26)) {
                    openGames.formSymmetricDifference([group.matchup])
                }
            } label: {
                gameSectionHeader(group: group, entry: entry, isOpen: isOpen)
            }
            .buttonStyle(.plain)

            if isOpen {
                if let entry {
                    FlippablePickCard(
                        pick: entry.pick,
                        gameResult: entry.isYesterday ? gamePickResult(entry.pick) : nil,
                        showSportBadge: false
                    )
                    .padding(.horizontal, 10)
                    .padding(.top, 4)

                    sectionLabel("PLAYER PROPS")
                        .padding(.horizontal, 16).padding(.top, 12).padding(.bottom, 2)
                }
                VStack(spacing: 0) {
                    ForEach(Array(group.props.enumerated()), id: \.element.id) { i, prop in
                        if i > 0 { rowDivider }
                        CompactPropRow(prop: prop, gameResult: resultForProp(prop), showSportBadge: false)
                            .onTapGesture { selectedProp = prop }
                    }
                }
                .padding(.bottom, 6)
            }
        }
        .quantPanel()
        .padding(.horizontal, 14)
    }

    private func gameSectionHeader(group: (matchup: String, time: String, props: [PropPick]),
                                   entry: (pick: GaryPick, isYesterday: Bool)?,
                                   isOpen: Bool) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 5) {
                Text(shortenMatchup(group.matchup))
                    .font(GaryFonts.text(18))
                    .foregroundStyle(.white).lineLimit(1).minimumScaleFactor(0.8)
                HStack(spacing: 8) {
                    if !group.time.isEmpty {
                        Text(group.time.uppercased())
                            .font(GaryFonts.mono(9, bold: false)).tracking(1.2)
                            .foregroundStyle(.white.opacity(0.62))
                    }
                    if let entry, !gamePickSummary(entry.pick).isEmpty {
                        Text(gamePickSummary(entry.pick))
                            .font(GaryFonts.mono(9, bold: true)).tracking(0.6)
                            .foregroundStyle(GaryColors.gold.opacity(0.85)).lineLimit(1)
                    }
                }
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 5) {
                Text("\(group.props.count) \(group.props.count == 1 ? "PROP" : "PROPS")")
                    .font(GaryFonts.mono(9, bold: true)).tracking(0.8)
                    .foregroundStyle(.white.opacity(0.62))
                QuantConfidenceBar(value: avgConf(group.props)).frame(width: 48)
            }
            Image(systemName: "chevron.down")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(.white.opacity(0.62))
                .rotationEffect(.degrees(isOpen ? 0 : -90))
        }
        .padding(.horizontal, 16).padding(.vertical, 14)
        .contentShape(Rectangle())
    }

    private func tdCategorySection(_ group: (category: String, label: String, picks: [PropPick])) -> some View {
        let key = "TD-" + group.category
        let isOpen = openGames.contains(key)
        return VStack(spacing: 0) {
            Button {
                withAnimation(.easeInOut(duration: 0.26)) { openGames.formSymmetricDifference([key]) }
            } label: {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(group.label)
                            .font(GaryFonts.text(18)).foregroundStyle(.white)
                        Text("NFL TDs · \(group.label.uppercased())\(group.category == "underdog" ? " · +200+" : "")")
                            .font(GaryFonts.mono(9, bold: false)).tracking(1.2)
                            .foregroundStyle(.white.opacity(0.62))
                    }
                    Spacer(minLength: 8)
                    Text("\(group.picks.count)")
                        .font(GaryFonts.mono(11, bold: true))
                        .foregroundStyle(.white.opacity(0.62))
                    Image(systemName: "chevron.down")
                        .font(.system(size: 11, weight: .bold)).foregroundStyle(.white.opacity(0.62))
                        .rotationEffect(.degrees(isOpen ? 0 : -90))
                }
                .padding(.horizontal, 16).padding(.vertical, 14)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if isOpen {
                VStack(spacing: 0) {
                    ForEach(Array(group.picks.enumerated()), id: \.element.id) { i, prop in
                        if i > 0 { rowDivider }
                        CompactPropRow(prop: prop, gameResult: resultForProp(prop), showSportBadge: false)
                            .onTapGesture { selectedProp = prop }
                    }
                }
                .padding(.bottom, 6)
            }
        }
        .quantPanel()
        .padding(.horizontal, 14)
    }

    // MARK: - Dense table

    private var propTable: some View {
        let rows = sortProps(visibleProps)
        return VStack(spacing: 0) {
            tableHeaderRow
            ForEach(Array(rows.enumerated()), id: \.element.id) { i, prop in
                if i > 0 { rowDivider }
                propTableRow(prop)
            }
        }
        .quantPanel()
        .padding(.horizontal, 14)
    }

    private var tableHeaderRow: some View {
        HStack(spacing: 10) {
            Text("PLAYER / PROP").frame(maxWidth: .infinity, alignment: .leading)
            Text("PICK").frame(width: 58, alignment: .leading)
            Text("ODDS").frame(width: 44, alignment: .trailing)
            Text("LEAN").frame(width: 42, alignment: .trailing)
            Text("").frame(width: 22)
        }
        .font(GaryFonts.mono(8, bold: true)).tracking(1)
        .foregroundStyle(.white.opacity(0.62))
        .padding(.horizontal, 14).padding(.top, 12).padding(.bottom, 9)
    }

    private func propTableRow(_ prop: PropPick) -> some View {
        let expanded = openTakes.contains(prop.id)
        let result = resultForProp(prop)
        return VStack(spacing: 9) {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(prop.player ?? prop.team ?? "")
                        .font(.system(size: 13.5, weight: .medium)).foregroundStyle(.white)
                        .lineLimit(1).minimumScaleFactor(0.8)
                    Text(Formatters.propDisplay(prop.prop, league: prop.effectiveLeague).uppercased())
                        .font(GaryFonts.mono(8.5, bold: true)).tracking(0.8)
                        .foregroundStyle(GaryColors.gold.opacity(0.85)).lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Text(betToken(prop))
                    .font(GaryFonts.mono(11, bold: true))
                    .foregroundStyle(betColor(prop))
                    .frame(width: 58, alignment: .leading)

                Text(Formatters.americanOdds(prop.odds))
                    .font(GaryFonts.mono(11, bold: false))
                    .foregroundStyle(.white.opacity(0.6))
                    .frame(width: 44, alignment: .trailing)

                VStack(alignment: .trailing, spacing: 3) {
                    Text("\(Int(round((prop.confidence ?? 0) * 100)))")
                        .font(GaryFonts.mono(12, bold: true))
                        .foregroundStyle(GaryColors.gold)
                    QuantConfidenceBar(value: prop.confidence ?? 0, height: 3).frame(width: 38)
                }
                .frame(width: 42)

                Group {
                    if let result {
                        resultChip(result)
                    } else {
                        Image(systemName: expanded ? "chevron.up" : "chevron.down")
                            .font(.system(size: 9, weight: .bold)).foregroundStyle(.white.opacity(0.62))
                    }
                }
                .frame(width: 22)
            }

            if expanded, let take = prop.analysis, !take.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text(take)
                        .font(.system(size: 12, weight: .regular)).foregroundStyle(.white.opacity(0.62))
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Button { selectedProp = prop } label: {
                        Text("FULL BREAKDOWN  →")
                            .font(GaryFonts.mono(9.5, bold: true)).tracking(1)
                            .foregroundStyle(GaryColors.gold)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 11)
        .contentShape(Rectangle())
        .onTapGesture {
            withAnimation(.easeInOut(duration: 0.2)) { openTakes.formSymmetricDifference([prop.id]) }
        }
    }

    // MARK: - States

    private var loadingState: some View {
        VStack(spacing: 14) {
            RoundedRectangle(cornerRadius: 12).fill(Color.white.opacity(0.04)).frame(height: 116)
            HStack(spacing: 8) {
                ForEach(0..<3, id: \.self) { _ in
                    RoundedRectangle(cornerRadius: 10).fill(Color.white.opacity(0.04)).frame(height: 68)
                }
            }
            ForEach(0..<4, id: \.self) { _ in
                RoundedRectangle(cornerRadius: 12).fill(Color.white.opacity(0.03)).frame(height: 54)
            }
            Spacer()
        }
        .padding(.horizontal, 14).padding(.top, 12)
        .overlay(alignment: .top) {
            ProgressView().tint(GaryColors.gold).padding(.top, 44)
        }
    }

    private var failedState: some View {
        VStack {
            Spacer()
            VStack(spacing: 16) {
                Image(systemName: "wifi.slash").font(.system(size: 50)).foregroundStyle(.tertiary)
                Text("Couldn't load props").foregroundStyle(.secondary)
                Button {
                    Task { await loadProps(forceRefresh: true) }
                } label: {
                    Text("Tap to retry").font(.subheadline.weight(.semibold)).foregroundStyle(GaryColors.gold)
                }
            }
            .padding().liquidGlass(cornerRadius: 24)
            Spacer()
        }
    }

    private var emptyState: some View {
        VStack {
            Spacer()
            VStack(spacing: 16) {
                Image(systemName: "person.fill.questionmark").font(.system(size: 50)).foregroundStyle(.tertiary)
                Text(selectedSport == .all ? "No props yet." : "No \(selectedSport.rawValue) props today.")
                    .foregroundStyle(.secondary)
            }
            .padding().liquidGlass(cornerRadius: 24)
            Spacer()
        }
    }

    /// Check if a prop is from yesterday's fallback
    private func isYesterdayProp(_ prop: PropPick) -> Bool {
        let sport = (prop.effectiveLeague ?? "").uppercased()
        return showingYesterdayResults && !sportsWithFreshProps.contains(sport)
    }

    /// Strip the numeric line value from a prop string (e.g., "points 0.5" → "points")
    private func normalizePropType(_ raw: String) -> String {
        raw.lowercased().replacingOccurrences(of: #"\s+[\d.]+"#, with: "", options: .regularExpression).trimmingCharacters(in: .whitespaces)
    }

    /// Canonical line-value string so "1.5", "1.50", and " 1.5 " all match.
    /// Used to build a precise result-match key that includes the line value
    /// (player + prop_type + line) — prevents cross-day collisions where the
    /// same player has the same prop_type with different lines.
    private func normalizeLine(_ raw: String) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return "" }
        if let d = Double(trimmed) { return String(format: "%g", d) }
        return trimmed
    }

    /// Canonical matchup string for keying — lowercased + trimmed + run through
    /// shortenMatchup so "Los Angeles Angels @ Detroit Tigers" and "Angels @ Tigers"
    /// resolve to the same value. When both prop and result carry a matchup we add
    /// it to the key, which makes today's "Colt Keith Total Bases 1.5 (Angels @ Tigers)"
    /// impossible to collide with yesterday's same player + same prop_type + same
    /// line from a different opponent.
    private func normalizeMatchup(_ raw: String) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return "" }
        return shortenMatchup(trimmed).lowercased()
    }

    /// Build the canonical result-match key. Includes only the parts that are
    /// present on the input — keeps the key shape consistent between prop-side
    /// and result-side construction so matchup-rich data on one side and
    /// matchup-missing on the other don't accidentally collide via the looser key.
    private func makeResultKey(player: String, propType: String, line: String, matchup: String) -> String {
        var parts: [String] = [player.lowercased(), propType.lowercased()]
        if !line.isEmpty { parts.append(line) }
        if !matchup.isEmpty { parts.append(matchup) }
        return parts.joined(separator: "_")
    }

    /// Match a prop to its result — checks today's results first, then yesterday's
    private func resultForProp(_ prop: PropPick) -> String? {
        // Hard rule: W/L stamps only appear on YESTERDAY's fallback props
        // (the recap mode when a sport has no fresh picks today). Today's
        // fresh picks NEVER show a stamp — even if the Supabase result table
        // happens to have a row keyed under today's date, we don't trust it
        // for our own freshly-generated picks (some other cron may have put
        // it there before our grading actually ran).
        guard isYesterdayProp(prop) else { return nil }

        let player = (prop.player ?? "").lowercased()
        let propType = normalizePropType(prop.prop ?? "")
        guard !player.isEmpty, !propType.isEmpty else { return nil }

        let line = normalizeLine(prop.line ?? "")
        let matchup = normalizeMatchup(prop.matchup ?? "")
        let key = makeResultKey(player: player, propType: propType, line: line, matchup: matchup)

        return yesterdayResultsMap[key]
    }

    /// Load Gary's GAME picks so the per-game view can show the game pick above
    /// the prop picks — today's fresh picks AND yesterday's settled picks (for
    /// games without a fresh pick) plus their W/L results. Fails silently.
    private func loadGamePicks(forceRefresh: Bool = false) async {
        let date = SupabaseAPI.todayEST()
        var today: [GaryPick] = []
        if let arr = try? await SupabaseAPI.fetchAllPicks(date: date, forceRefresh: forceRefresh) {
            today = arr.filter { !($0.pick ?? "").isEmpty }
        }
        let freshSports = Set(today.compactMap { ($0.league ?? "").uppercased() }.filter { !$0.isEmpty })

        var yPicks: [GaryPick] = []
        var resultsMap: [String: String] = [:]
        let yesterday = SupabaseAPI.yesterdayEST()
        if let fetched = try? await SupabaseAPI.fetchExactDatePicks(date: yesterday, forceRefresh: forceRefresh) {
            // Only keep yesterday's picks for sports that DON'T have fresh picks today.
            yPicks = fetched.filter { !($0.pick ?? "").isEmpty && !freshSports.contains(($0.league ?? "").uppercased()) }
            if !yPicks.isEmpty {
                let results = (try? await SupabaseAPI.fetchAllGameResults(since: yesterday, forceRefresh: forceRefresh)) ?? []
                for r in results.filter({ $0.game_date == yesterday }) {
                    guard let k = gpKey(from: r.matchup), let outcome = r.result else { continue }
                    resultsMap[garyGameResultKey(matchupKey: k, pickText: r.pick_text)] = outcome.lowercased()
                }
            }
        }

        await MainActor.run {
            gamePicks = today
            yesterdayGamePicks = yPicks
            gameResultsMap = resultsMap
        }
    }

    /// The game pick for a matchup — prefers today's; falls back to yesterday's
    /// (settled). `isYesterday` drives whether we stamp a W/L result (per-game).
    private func gamePickEntry(forMatchup matchup: String) -> (pick: GaryPick, isYesterday: Bool)? {
        if let p = matchGamePick(in: gamePicks, matchup: matchup) { return (p, false) }
        if let p = matchGamePick(in: yesterdayGamePicks, matchup: matchup) { return (p, true) }
        return nil
    }

    private func matchGamePick(in arr: [GaryPick], matchup: String) -> GaryPick? {
        let m = matchup.lowercased()
        return arr.first { p in
            guard let h = p.homeTeam?.lowercased(), let a = p.awayTeam?.lowercased(), !h.isEmpty, !a.isEmpty else { return false }
            let hKey = h.split(separator: " ").last.map(String.init) ?? h
            let aKey = a.split(separator: " ").last.map(String.init) ?? a
            return m.contains(hKey) && m.contains(aKey)
        }
    }

    /// W/L for a settled (yesterday) game pick, matched by normalized teams AND the
    /// pick's own signature — so a game's side and total don't collide on a
    /// matchup-only key (the WC two-pick bug).
    private func gamePickResult(_ pick: GaryPick) -> String? {
        let away = gpTeamKey(pick.awayTeam), home = gpTeamKey(pick.homeTeam)
        guard !away.isEmpty, !home.isEmpty else { return nil }
        return gameResultsMap[garyGameResultKey(matchupKey: "\(away)@\(home)", pickText: pick.pick)]
    }

    private func gpTeamKey(_ value: String?) -> String {
        (value ?? "").lowercased().components(separatedBy: CharacterSet.alphanumerics.inverted).joined()
    }
    private func gpKey(from matchup: String?) -> String? {
        guard let matchup else { return nil }
        for sep in [" @ ", " vs ", " v "] {
            let parts = matchup.components(separatedBy: sep)
            if parts.count == 2 {
                let a = gpTeamKey(parts[0]), h = gpTeamKey(parts[1])
                if !a.isEmpty && !h.isEmpty { return "\(a)@\(h)" }
            }
        }
        return nil
    }

    private func loadProps(forceRefresh: Bool = false) async {
        await MainActor.run {
            loading = true
            fetchFailed = false
        }

        let date = SupabaseAPI.todayEST()

        // Use a timeout to prevent infinite loading
        var props: [PropPick] = []
        var didFail = false
        var wasCancelled = false
        var transientFailure = false
        do {
            props = try await withTimeout(seconds: 30) {
                try await SupabaseAPI.fetchPropPicks(date: date, forceRefresh: forceRefresh)
            }
        } catch {
            if SupabaseAPI.isCancellation(error) {
                // Our own torn-down refresh task — state stands, no banner.
                wasCancelled = true
                transientFailure = true
            } else {
                didFail = true
                transientFailure = SupabaseAPI.isTransientExternalFailure(error)
            }
        }

        // Fetch today's prop results to stamp W/L on completed props
        var todayMap: [String: String] = [:]
        let allResults = (try? await SupabaseAPI.fetchPropResults(since: SupabaseAPI.yesterdayEST(), forceRefresh: forceRefresh)) ?? []
        for result in allResults.filter({ $0.game_date == date }) {
            guard let playerName = result.player_name, let propType = result.prop_type,
                  let outcome = result.result, !outcome.isEmpty else { continue }
            // Only count actually-graded results — a record must have a real
            // measured actual_value to count as a true W/L. Skips stale/duplicate
            // records that may carry today's game_date without being real grades.
            let actualValue = (result.actual_value?.value ?? "").trimmingCharacters(in: .whitespaces)
            guard !actualValue.isEmpty else { continue }

            let line = normalizeLine(result.line_value?.value ?? "")
            let matchup = normalizeMatchup(result.matchup ?? "")
            let key = makeResultKey(player: playerName, propType: normalizePropType(propType), line: line, matchup: matchup)
            todayMap[key] = outcome.lowercased()
        }

        // Determine which sports have fresh props today
        let freshSports = Set(props.compactMap { ($0.effectiveLeague ?? "").uppercased() }.filter { !$0.isEmpty })
        let effectiveFreshSports = transientFailure ? sportsWithFreshProps : freshSports

        // Fetch yesterday's props + results for sports without fresh props today
        var yProps: [PropPick] = []
        var yMap: [String: String] = [:]
        var hasYesterday = false
        var yesterdayFailed = false
        do {
            let yesterday = SupabaseAPI.yesterdayEST()
            let fetched = try await withTimeout(seconds: 20) {
                try await SupabaseAPI.fetchPropPicks(date: yesterday, forceRefresh: forceRefresh)
            }

            let yesterdaySportsNeeded = fetched.filter { !effectiveFreshSports.contains(($0.effectiveLeague ?? "").uppercased()) }
            if !yesterdaySportsNeeded.isEmpty {
                yProps = yesterdaySportsNeeded
                hasYesterday = true

                for result in allResults.filter({ $0.game_date == yesterday }) {
                    guard let playerName = result.player_name, let propType = result.prop_type,
                          let outcome = result.result, !outcome.isEmpty else { continue }
                    let actualValue = (result.actual_value?.value ?? "").trimmingCharacters(in: .whitespaces)
                    guard !actualValue.isEmpty else { continue }

                    let line = normalizeLine(result.line_value?.value ?? "")
                    let matchup = normalizeMatchup(result.matchup ?? "")
                    let key = makeResultKey(player: playerName, propType: normalizePropType(propType), line: line, matchup: matchup)
                    yMap[key] = outcome.lowercased()
                }
            }
        } catch {
            yesterdayFailed = true
        }

        await MainActor.run {
            // HR fun-lane picks never render on the props board — they belong
            // to the Hub's Home Run Threats lane (Billfold tracks their tally).
            if !didFail || !transientFailure {
                allProps = props.filter { !$0.isHRLane }
                sportsWithFreshProps = freshSports
            }
            propResultsMap = todayMap
            // Any failure keeps last-good (Aug 26 — same wipe class as above).
            if !yesterdayFailed {
                yesterdayProps = yProps.filter { !$0.isHRLane }
                yesterdayResultsMap = yMap
                showingYesterdayResults = hasYesterday
            }
            fetchFailed = didFail && props.isEmpty && yProps.isEmpty
            loading = false
            if !didFail { lastUpdated = Date() }

            // Auto-select the first sport with props if only one sport has fresh props
            if selectedSport == .all && freshSports.count == 1, let onlySport = freshSports.first {
                if let match = Sport.allCases.first(where: { $0.rawValue == onlySport }) {
                    selectedSport = match
                }
            }
        }
    }
}

// MARK: - Props Dashboard support types (Quant Terminal)

enum PropDashViewMode: Hashable { case cards, table }

enum PropDashSort: CaseIterable, Identifiable {
    case confidence, time, player
    var id: Self { self }
    var label: String {
        switch self {
        case .confidence: return "Confidence"
        case .time:       return "Game Time"
        case .player:     return "Player"
        }
    }
}

enum PropDashOU: CaseIterable, Identifiable {
    case all, over, under
    var id: Self { self }
    var label: String {
        switch self {
        case .all:   return "All"
        case .over:  return "Over"
        case .under: return "Under"
        }
    }
}

/// Thin horizontal confidence bar (gold fill on a faint track). `value` is 0...1.
struct QuantConfidenceBar: View {
    let value: Double
    var height: CGFloat = 4
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.08))
                Capsule().fill(GaryColors.gold)
                    .frame(width: max(2, geo.size.width * CGFloat(max(0.04, min(1, value)))))
            }
        }
        .frame(height: height)
    }
}

/// "Confidence shape" — an equalizer of bars (one per prop), heights proportional
/// to confidence, sorted high→low. A 3-second read of how strong the slate leans.
struct ConfidenceShapeView: View {
    let values: [Double]
    var body: some View {
        GeometryReader { geo in
            let n = max(values.count, 1)
            let gap: CGFloat = 2
            let w = max(1.5, (geo.size.width - gap * CGFloat(n - 1)) / CGFloat(n))
            HStack(alignment: .bottom, spacing: gap) {
                ForEach(Array(values.enumerated()), id: \.offset) { _, v in
                    let h = max(0.12, min(1, v))
                    Capsule()
                        .fill(GaryColors.gold.opacity(0.3 + 0.6 * h))
                        .frame(width: w, height: max(2, geo.size.height * CGFloat(h)))
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        }
    }
}

/// Compact KPI stat tile for the dashboard's at-a-glance row.
struct QuantKpiTile: View {
    let label: String
    let value: String
    var sub: String? = nil
    var accent: Color = .white
    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label)
                .font(GaryFonts.mono(8.5, bold: true)).tracking(1.4)
                .foregroundStyle(.white.opacity(0.62))
            Text(value)
                .font(GaryFonts.mono(21, bold: true))
                .foregroundStyle(accent).lineLimit(1).minimumScaleFactor(0.55)
            if let sub {
                Text(sub)
                    .font(GaryFonts.mono(8, bold: false)).tracking(0.6)
                    .foregroundStyle(.white.opacity(0.62)).lineLimit(1).minimumScaleFactor(0.7)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12).padding(.vertical, 11)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Color.white.opacity(0.025))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Color.white.opacity(0.07), lineWidth: 1))
        )
    }
}

/// Faint card chrome shared by the dashboard's panels.
// (QuantPanel folded into garyPanel — Aug 4 2026. Its 0.022 fill and the six
// hand-rolled 0.03 panels were the same surface drifted 0.008 apart; both now
// read GaryColors.panelFill/panelStroke, so a retune hits every panel at once.)
extension View {
    func quantPanel(radius: CGFloat = 12) -> some View { garyPanel(radius: radius) }
}
