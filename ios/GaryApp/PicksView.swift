// PicksView.swift — Gary's Picks View.
// Split out of Views.swift on Sep 1 2026 (the 28K-line monolith); pure move,
// no behavior change. Section boundaries follow the original MARK headers.

import SwiftUI
import Combine
import Charts
import WebKit
import SafariServices
import StoreKit

// MARK: - Gary's Picks View

struct GaryPicksView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var allPicks: [GaryPick] = []
    @State private var loading = true
    @State private var fetchFailed = false
    @State private var selectedSport: Sport = .all
    @State private var lastUpdated: Date?

    // Yesterday's results fallback (per-sport: sports with no fresh picks today show yesterday's stamped cards)
    @State private var showingYesterdayResults = false
    @State private var yesterdayPicks: [GaryPick] = []
    @State private var yesterdayResultsMap: [String: String] = [:] // matchup key -> "won"/"lost"/"push"
    @State private var sportsWithFreshPicks: Set<String> = [] // sports that have today's picks
    @State private var selectedPick: GaryPick? = nil

    /// Today's date formatted for the header
    private var headerDateString: String {
        let formatter = DateFormatter()
        formatter.timeZone = TimeZone(identifier: "America/New_York")
        formatter.dateFormat = "EEEE, MMM d"
        return formatter.string(from: Date()).uppercased()
    }

    private var filteredPicks: [GaryPick] {
        // Sort picks by game time (commence_time) - earliest games first
        let sortByTime: ([GaryPick]) -> [GaryPick] = { picks in
            picks.sorted { a, b in
                let timeA = a.commence_time ?? ""
                let timeB = b.commence_time ?? ""
                return timeA < timeB
            }
        }
        
        // Show all picks for today until 6am ET the next day (no filtering by game start time)
        // This matches the web app behavior where users can see all picks for the day
        let filterToTodaysPicks: ([GaryPick]) -> [GaryPick] = { picks in
            let now = Date()
            
            // Set up EST calendar
            var estCalendar = Calendar.current
            estCalendar.timeZone = TimeZone(identifier: "America/New_York") ?? .current
            
            // Get today's date in EST
            let todayEST = estCalendar.startOfDay(for: now)
            
            // Calculate 6am ET the next day (the cutoff for "today's" picks)
            guard let tomorrowEST = estCalendar.date(byAdding: .day, value: 1, to: todayEST),
                  let cutoffTime = estCalendar.date(bySettingHour: SupabaseAPI.slateRolloverHourET, minute: 0, second: 0, of: tomorrowEST) else {
                return picks // If we can't calculate, show all picks
            }
            
            return picks.filter { pick in
                let league = (pick.league ?? "").uppercased()

                guard let commenceTime = pick.commence_time else {
                    // No time specified, show the pick
                    return true
                }
                
                guard let gameDate = parseISO8601(commenceTime) else {
                    // Couldn't parse date, show the pick
                    return true
                }
                
                // Get the game's date in EST
                let gameDayEST = estCalendar.startOfDay(for: gameDate)
                
                // Show pick if:
                // 1. Game is today (in EST), OR
                // 2. We haven't passed 6am ET yet (for overnight viewing of yesterday's picks)
                let isGameToday = estCalendar.isDate(gameDate, inSameDayAs: now)
                let isBeforeCutoff = now < cutoffTime
                let wasGameYesterday = estCalendar.isDate(gameDayEST, inSameDayAs: estCalendar.date(byAdding: .day, value: -1, to: todayEST) ?? todayEST)

                // Every sport stays on the normal today-only window, with the late-night cutoff.
                return isGameToday || (isBeforeCutoff && wasGameYesterday)
            }
        }
        
        // Apply today's picks filter
        let todayFiltered = filterToTodaysPicks(allPicks)
        // For "All" tab: show today's picks if any exist, otherwise fall back to yesterday's stamped results
        guard selectedSport != .all else {
            if todayFiltered.isEmpty && showingYesterdayResults {
                return interleaveBySport(yesterdayPicks)
            }
            return interleaveBySport(todayFiltered)
        }

        // For specific sport tabs: merge in yesterday's picks if that sport has no fresh picks today
        var mergedPicks = todayFiltered
        if showingYesterdayResults && !sportsWithFreshPicks.contains(selectedSport.rawValue) {
            let yesterdayForSport = yesterdayPicks.filter { ($0.league ?? "").uppercased() == selectedSport.rawValue }
            mergedPicks.append(contentsOf: yesterdayForSport)
        }

        let sportFiltered = sortByTime(mergedPicks.filter { ($0.league ?? "").uppercased() == selectedSport.rawValue })

        return sportFiltered
    }
    
    /// Interleave picks by sport in round-robin order
    /// Order: NBA, NFL, NCAAB, NHL, NCAAF, EPL (skips sports with no picks)
    private func interleaveBySport(_ picks: [GaryPick]) -> [GaryPick] {
        let sportOrder = ["NBA", "NFL", "NCAAB", "NHL", "NCAAF", "EPL", "MLB"]
        
        // Sort each sport's picks by game time first
        var picksBySport: [String: [GaryPick]] = [:]
        for sport in sportOrder {
            let sportPicks = picks
                .filter { ($0.league ?? "").uppercased() == sport }
                .sorted { a, b in
                    let timeA = a.commence_time ?? ""
                    let timeB = b.commence_time ?? ""
                    return timeA < timeB
                }
            if !sportPicks.isEmpty {
                picksBySport[sport] = sportPicks
            }
        }
        
        // Track current index for each sport
        var indices: [String: Int] = [:]
        for sport in sportOrder {
            indices[sport] = 0
        }
        
        // Interleave: take one pick from each sport in order, repeat
        var result: [GaryPick] = []
        var hasMore = true
        
        while hasMore {
            hasMore = false
            for sport in sportOrder {
                guard let sportPicks = picksBySport[sport],
                      let idx = indices[sport],
                      idx < sportPicks.count else { continue }
                
                result.append(sportPicks[idx])
                indices[sport] = idx + 1
                hasMore = true
            }
        }
        
        return result
    }
    
    private var availableSports: Set<String> {
        var sports = Set(allPicks.compactMap { $0.league?.uppercased() })
        // Include yesterday's sports in filter tabs
        for pick in yesterdayPicks {
            if let league = pick.league?.uppercased(), !league.isEmpty {
                sports.insert(league)
            }
        }
        return sports
    }

    /// Get time slot string for NFL picks (e.g., "Sunday 1:00 PM ET")
    private func getTimeSlot(for pick: GaryPick) -> String? {
        guard let isoTime = pick.commence_time, !isoTime.isEmpty else { return nil }
        guard let gameDate = parseISO8601(isoTime) else { return nil }
        return Formatters.dayTimeFormatterEST.string(from: gameDate) + " ET"
    }
    
    /// Group picks by time slot for section headers (works for all sports)
    private var picksByTimeSlot: [(timeSlot: String, picks: [GaryPick])] {
        var grouped: [String: [GaryPick]] = [:]
        var order: [String] = []
        
        for pick in filteredPicks {
            let slot = getTimeSlot(for: pick) ?? "TBD"
            if grouped[slot] == nil {
                grouped[slot] = []
                order.append(slot)
            }
            grouped[slot]?.append(pick)
        }
        
        return order.map { (timeSlot: $0, picks: grouped[$0] ?? []) }
    }
    
    var body: some View {
        ZStack {
            // Background - ignores safe area
            LiquidGlassBackground(grainDensity: 0)
            
            // Content - respects safe area
            VStack(spacing: 0) {
                // Logo + sport filter inline
                HStack(spacing: 0) {
                    Image(GaryBrand.mark)
                        .resizable()
                        .scaledToFit()
                        .frame(height: 74)
                        .offset(y: -10)

                    SportFilterBar(selected: $selectedSport, availableSports: availableSports, todaySports: sportsWithFreshPicks, showAll: true)
                        .offset(x: -4, y: 10)
                }
                .padding(.leading, 10)
                .padding(.top, -14)
                .padding(.bottom, -18)

                Spacer().frame(height: 6)

                // Content
                if loading {
                    Spacer()
                    ProgressView()
                        .tint(GaryColors.gold)
                        .scaleEffect(1.2)
                    Spacer()
                } else if fetchFailed {
                    Spacer()
                    VStack(spacing: 16) {
                        Image(systemName: "wifi.slash")
                            .font(.system(size: 50))
                            .foregroundStyle(.tertiary)
                        Text("Couldn't load picks")
                            .foregroundStyle(.secondary)
                        Button {
                            Task { await loadPicks(forceRefresh: true) }
                        } label: {
                            Text("Tap to retry")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(GaryColors.gold)
                        }
                    }
                    .padding()
                    .liquidGlass(cornerRadius: 24)
                    Spacer()
                } else if filteredPicks.isEmpty {
                    Spacer()
                    VStack(spacing: 16) {
                        Image(systemName: "sportscourt")
                            .font(.system(size: 50))
                            .foregroundStyle(.tertiary)
                        Text(selectedSport == .all ? "No picks today." : "No \(selectedSport.rawValue) picks today.")
                            .foregroundStyle(.secondary)
                    }
                    .padding()
                    .liquidGlass(cornerRadius: 24)
                    Spacer()
                } else {
                    ScrollView(showsIndicators: false) {
                        LazyVStack(spacing: 5) {
                            // Yesterday's Results header
                            if showingYesterdayResults && filteredPicks.contains(where: { isYesterdayPick($0) }) {
                                HStack(spacing: 6) {
                                    Image(systemName: "clock.arrow.counterclockwise")
                                        .font(.system(size: 11, weight: .semibold))
                                        .foregroundStyle(.white.opacity(0.62))
                                    Text("Yesterday's Results")
                                        .font(.system(size: 12, weight: .bold))
                                        .foregroundStyle(.white.opacity(0.62))
                                    Text(yesterdayRecord)
                                        .font(.system(size: 12, weight: .bold))
                                        .foregroundStyle(GaryColors.gold)
                                }
                                .frame(maxWidth: .infinity, alignment: .center)
                                .padding(.top, 1)
                                .padding(.bottom, 1)
                            }

                            // Compact pick rows (time displayed on each card)
                            ForEach(filteredPicks) { pick in
                                CompactPickRow(
                                    pick: pick,
                                    gameResult: isYesterdayPick(pick) ? resultForPick(pick) : nil,
                                    showSportBadge: selectedSport == .all
                                )
                                .contentShape(Rectangle())
                                .onTapGesture {
                                    withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                                        selectedPick = pick
                                    }
                                }
                                .padding(.horizontal, 12)
                                .transaction { $0.animation = nil }
                            }
                        }
                        .padding(.vertical, 4)
                        .padding(.bottom, 120)
                        .transaction { $0.animation = nil }
                    }
                    .refreshable {
                        await loadPicks(forceRefresh: true)
                    }
                }
            }
        }
        .overlay {
            if let selected = selectedPick {
                PickDetailPopup(
                    pick: selected,
                    gameResult: isYesterdayPick(selected) ? resultForPick(selected) : nil,
                    onDismiss: { selectedPick = nil }
                )
                .transition(.opacity.combined(with: .scale(scale: 0.95)))
                .zIndex(100)
            }
        }
        .onChange(of: selectedPick?.pick_id) { _ in
            PickDetailState.shared.isShowing = selectedPick != nil
        }
        .task {
            await loadPicks()
        }
        .onReceive(NotificationCenter.default.publisher(for: Notification.Name("NavigateToSport"))) { notification in
            if let sportName = notification.object as? String {
                withAnimation {
                    selectedSport = Sport(rawValue: sportName) ?? .all
                }
            }
        }
    }

    /// W-L record string for yesterday's picks in the current sport filter
    private var yesterdayRecord: String {
        let yPicks = filteredPicks.filter { isYesterdayPick($0) }
        let wins = yPicks.filter { resultForPick($0)?.lowercased() == "won" }.count
        let losses = yPicks.filter { resultForPick($0)?.lowercased() == "lost" }.count
        let pushes = yPicks.filter { resultForPick($0)?.lowercased() == "push" }.count
        return pushes > 0 ? "\(wins)-\(losses)-\(pushes)" : "\(wins)-\(losses)"
    }

    /// Check if a pick is from yesterday's fallback
    private func isYesterdayPick(_ pick: GaryPick) -> Bool {
        let sport = (pick.league ?? "").uppercased()
        return showingYesterdayResults && !sportsWithFreshPicks.contains(sport)
    }

    /// Match a pick to its result from yesterdayResultsMap
    private func resultForPick(_ pick: GaryPick) -> String? {
        guard let key = normalizedMatchupKey(awayTeam: pick.awayTeam, homeTeam: pick.homeTeam) else { return nil }
        return yesterdayResultsMap[key]
    }

    private func normalizedTeamKey(_ value: String) -> String {
        value
            .lowercased()
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .joined()
    }

    private func normalizedMatchupKey(awayTeam: String?, homeTeam: String?) -> String? {
        guard let awayTeam, let homeTeam else { return nil }
        let away = normalizedTeamKey(awayTeam)
        let home = normalizedTeamKey(homeTeam)
        guard !away.isEmpty, !home.isEmpty else { return nil }
        return "\(away)@\(home)"
    }

    private func normalizedMatchupKey(from matchup: String?) -> String? {
        guard let matchup else { return nil }
        for separator in [" @ ", " vs ", " v "] {
            let parts = matchup.components(separatedBy: separator)
            if parts.count == 2 {
                let away = normalizedTeamKey(parts[0])
                let home = normalizedTeamKey(parts[1])
                guard !away.isEmpty, !home.isEmpty else { return nil }
                return "\(away)@\(home)"
            }
        }
        return nil
    }

    private func loadPicks(forceRefresh: Bool = false) async {
        await MainActor.run {
            loading = true
            fetchFailed = false
        }

        let date = SupabaseAPI.todayEST()

        // PERF (Jul 13): yesterday's board rides alongside today's fetch —
        // it was a serial round trip after the 30s-gated today load.
        async let yesterdayFetch = SupabaseAPI.fetchExactDatePicks(date: SupabaseAPI.yesterdayEST(), forceRefresh: forceRefresh)

        // Use a timeout to prevent infinite loading
        var picks: [GaryPick] = []
        var didFail = false
        var transientFailure = false
        do {
            let arr = try await withTimeout(seconds: 30) {
                try await SupabaseAPI.fetchAllPicks(date: date, forceRefresh: forceRefresh)
            }
            picks = arr.filter { !($0.pick ?? "").isEmpty && !($0.rationale ?? "").isEmpty }
        } catch {
            didFail = true
            transientFailure = SupabaseAPI.isTransientExternalFailure(error)
        }

        // Determine which sports have fresh picks today
        let freshSports = Set(picks.compactMap { ($0.league ?? "").uppercased() }.filter { !$0.isEmpty })
        let effectiveFreshSports = transientFailure ? sportsWithFreshPicks : freshSports

        // Always fetch yesterday's picks + results for sports without fresh picks today
        var yPicks: [GaryPick] = []
        var resultsMap: [String: String] = [:]
        var hasYesterday = false
        var yesterdayFailed = false
        do {
            let yesterday = SupabaseAPI.yesterdayEST()
            let fetched = try await yesterdayFetch
            let filtered = fetched.filter { !($0.pick ?? "").isEmpty && !($0.rationale ?? "").isEmpty }

            // Only keep yesterday picks for sports that DON'T have fresh picks today
            let yesterdaySportsNeeded = filtered.filter { !effectiveFreshSports.contains(($0.league ?? "").uppercased()) }
            if !yesterdaySportsNeeded.isEmpty {
                yPicks = yesterdaySportsNeeded
                hasYesterday = true

                // Fetch results for yesterday
                let results = (try? await SupabaseAPI.fetchAllGameResults(since: yesterday, forceRefresh: forceRefresh)) ?? []
                let yesterdayResults = results.filter { $0.game_date == yesterday }
                for result in yesterdayResults {
                    guard let matchupKey = normalizedMatchupKey(from: result.matchup),
                          let outcome = result.result else { continue }
                    resultsMap[matchupKey] = outcome.lowercased()
                }
            }
        } catch {
            yesterdayFailed = true
        }

        await MainActor.run {
            // Any failure keeps last-good on screen; fetchFailed carries the
            // retry state (Aug 26 — a failed refresh must never blank a board).
            if !didFail {
                allPicks = picks
                sportsWithFreshPicks = freshSports
            }
            if !yesterdayFailed {
                yesterdayPicks = yPicks
                showingYesterdayResults = hasYesterday
                yesterdayResultsMap = resultsMap
            }
            fetchFailed = didFail && picks.isEmpty && yPicks.isEmpty
            loading = false
            if !didFail { lastUpdated = Date() }

            // Auto-select the first sport with picks if only one sport has fresh picks
            // This way users see MLB picks immediately instead of an empty ALL tab
            if selectedSport == .all && freshSports.count == 1, let onlySport = freshSports.first {
                if let match = Sport.allCases.first(where: { $0.rawValue == onlySport }) {
                    selectedSport = match
                }
            }
        }
    }
}
