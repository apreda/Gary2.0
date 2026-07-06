import SwiftUI

// ============================================================================
// THE HUB — tonight's front page (July 2026 redesign)
//
// The Hub is Gary's daily intelligence sheet, structured like the front of a
// sports section instead of a filing cabinet of lanes: the lead story, the
// best of the board (relevance-ranked across every lane), the signature
// boards (Regression, Streak Watch), the beats (the long tail in four human
// sections), and the receipts closing the page all day.
//
// Visual language (Jul 4, founder-tuned): heavy SF display for the wordmark
// and headlines, mono uppercase kickers for lanes/sections, monospaced digits
// for data, gold hairline rules — "legit A.I. tech meets sports betting",
// never newspaper-serif, never crypto-dashboard. Palette stays Gary: warm
// black, gold signature, HubPalette green/red tones.
//
// Data machinery (staleness gates, 3am EST rollover, graded-date walk-back,
// kept-alive-tab visibility flips) is carried over from the original Hub page
// (PropsHubView, removed Jul 4 2026 once the founder approved this one) — that
// plumbing encodes weeks of fixed production bugs and is presentation-free.
// ============================================================================

// MARK: - Type + chrome system

fileprivate enum HubFont {
    /// Display voice — heavy SF, the dynamic sports-tech face. (The serif
    /// newspaper voice was retired Jul 4: founder — "reads blog, not betting
    /// app"; the mock language is heavy sans + mono.)
    static func display(_ size: CGFloat, _ weight: Font.Weight = .heavy) -> Font {
        // Saira Condensed — the app's bundled athletic display face (Jul 5).
        _ = weight
        return GaryFonts.display(size)
    }
    /// Mono kickers/labels — always uppercase at the call site.
    static func kicker(_ size: CGFloat = 10.5) -> Font {
        .system(size: size, weight: .semibold, design: .monospaced)
    }
    /// Monospaced data numerals.
    static func data(_ size: CGFloat, _ weight: Font.Weight = .bold) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }
    static func body(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight)
    }
}

/// Gold mono kicker — the lane/section label idiom (no chips, no boxes).
fileprivate struct HubKicker: View {
    let text: String
    var size: CGFloat = 10.5
    var color: Color = GaryColors.gold
    var body: some View {
        Text(text.uppercased())
            .font(HubFont.kicker(size))
            .tracking(1.2)
            .foregroundStyle(color)
            .lineLimit(1)
    }
}

/// Section head — mock language: gold hairline, mono uppercase label, mono
/// count, quiet sub on the right. The rows below carry the big type.
fileprivate struct HubHead: View {
    let title: String
    var count: Int? = nil
    var sub: String? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Rectangle().fill(GaryColors.gold.opacity(0.25)).frame(height: 1)
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(title.uppercased())
                    .font(HubFont.kicker(12)).tracking(1.6)
                    .foregroundStyle(GaryColors.gold)
                if let count, count > 0 {
                    Text("\(count)")
                        .font(HubFont.data(11.5))
                        .foregroundStyle(.white.opacity(0.7))
                }
                Spacer(minLength: 0)
                if let sub, !sub.isEmpty {
                    Text(sub.uppercased())
                        .font(HubFont.kicker(9.5)).tracking(0.8)
                        .foregroundStyle(.white.opacity(0.62))
                        .lineLimit(1)
                }
            }
        }
        .padding(.horizontal, 18)
    }
}

/// Hairline row divider.
fileprivate struct HubRule: View {
    var inset: CGFloat = 0
    var body: some View {
        Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1).padding(.leading, inset)
    }
}

/// The page-wide "See all n / Show less" expander control.
fileprivate struct HubSeeAllButton: View {
    let isOpen: Bool
    let total: Int
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            HStack(spacing: 5) {
                Text(isOpen ? "SHOW LESS" : "SEE ALL \(total)")
                    .font(HubFont.kicker(10.5)).tracking(1.2)
                    .foregroundStyle(GaryColors.gold)
                Image(systemName: isOpen ? "chevron.up" : "chevron.down")
                    .font(.system(size: 8, weight: .bold))
                    .foregroundStyle(GaryColors.gold)
            }
            .padding(.horizontal, 18)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

fileprivate enum HubFmt {
    /// Compact stat formatting: .851 for sub-1 rates, 8.53 for ERAs, 14.7 for IP.
    static func stat(_ v: Double) -> String {
        if v < 1, v > 0 {
            let s = String(format: "%.3f", v)
            return s.hasPrefix("0") ? String(s.dropFirst()) : s
        }
        if v >= 10 { return String(format: "%.1f", v) }
        let s = String(format: "%.2f", v)
        return s.hasSuffix("00") ? String(format: "%.0f", v) : s
    }
    /// The subject a headline is about — the part before ":" / "(", else the
    /// leading tokens. Used for dedupe keys and compact board names.
    static func subject(_ headline: String) -> String {
        let h = headline.trimmingCharacters(in: .whitespaces)
        if let d = h.rangeOfCharacter(from: CharacterSet(charactersIn: "(:")) {
            return String(h[..<d.lowerBound]).trimmingCharacters(in: .whitespaces)
        }
        return h
    }
}

/// Body text with the headline echo stripped: drops a first sentence that
/// restates the headline, and any sentence that only re-reads the value the
/// card already shows big. Returns "" when nothing new remains.
fileprivate func hubDedupedDetail(_ s: Signal) -> String {
    let detail = s.detail.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !detail.isEmpty else { return "" }
    let norm: (String) -> String = { $0.lowercased().filter { $0.isLetter || $0.isNumber } }
    let nHead = norm(s.headline)
    var sentences = detail.components(separatedBy: ". ")
    sentences = sentences.enumerated().filter { i, sent in
        let n = norm(sent)
        if n.isEmpty { return false }
        // The headline restated (or containing it) adds nothing.
        if n == nHead || (nHead.count > 20 && (n.hasPrefix(nHead) || nHead.hasPrefix(n))) { return false }
        // A sentence whose only job is re-reading the shown value adds nothing —
        // but only cut it up front; mid-body mentions carry context.
        if i == 0, !s.value.isEmpty, sent.contains(s.value), sent.count < 60 { return false }
        return true
    }.map { $0.element }
    let out = sentences.joined(separator: ". ").trimmingCharacters(in: .whitespaces)
    guard !out.isEmpty else { return "" }
    return out.hasSuffix(".") ? out : out + "."
}

fileprivate extension Signal {
    /// True when the right-side value would only echo a number the headline
    /// already carries ("Giants 7-1 in…" beside a 7-1, "…pen: 13.7 relief IP"
    /// beside "13.7 IP") — those rows read cleaner with the headline alone.
    var valueEchoesHeadline: Bool {
        guard !value.isEmpty else { return true }
        if headline.contains(value) { return true }
        if let lead = value.split(separator: " ").first,
           lead.contains(where: { $0.isNumber }),
           headline.contains(lead) { return true }
        return false
    }
    /// A value earns stat treatment only when it's a compact token — sentence
    /// values ("8-game unbeaten") belong to the headline, not a number slot.
    var valueIsCompact: Bool { !value.isEmpty && value.count <= 8 }
    /// The right-side stat for list rows: compact and not a headline echo.
    var displayValue: String? { (valueIsCompact && !valueEchoesHeadline) ? value : nil }
}

// MARK: - The Hub

struct HubView: View {
    /// Whether the Hub tab is frontmost. ContentView keeps tab pages alive
    /// (opacity-switched), so visibility flips drive the staleness refetch
    /// and deep-link consumption instead of onAppear/.task.
    var isVisible: Bool = true
    var onSelectGame: (String) -> Void = { _ in }

    @StateObject private var focus = HubFocusState.shared
    @Environment(\.scenePhase) private var scenePhase

    @State private var sel: HubLeagueSel = .mlb
    @State private var selectedSignal: Signal? = nil
    @State private var breakdownSignal: Signal? = nil
    @State private var wcIntel: Signal? = nil
    /// Slate-strip tap → the in-place game sheet (everything the Hub knows
    /// about that matchup). Picks is a CTA inside it, not a forced jump.
    @State private var gameSheet: HubGameSel? = nil
    @State private var searchOpen = false
    @State private var searchText: String = ""
    @FocusState private var searchFocused: Bool

    // Fetched data — real rows only, honest empty states.
    @State private var fetched: [Signal] = []
    @State private var didLoad = false
    @State private var loadedAt: Date? = nil
    @State private var loadedDate: String = ""
    @State private var fetchErrored = false
    /// Yesterday's graded tally + the rolling 7-day record (masthead).
    @State private var hitRate: (hit: Int, graded: Int)? = nil
    @State private var record7: (hit: Int, miss: Int)? = nil
    /// Whether the graded surface really is yesterday (vs the walk-back day).
    @State private var gradedIsYesterday = true
    @State private var gradedDayShort = ""
    @State private var ydaySignals: [Signal] = []
    @State private var streakRows: [StreakRow] = []
    @State private var nightRows: [NightHighlightRow] = []
    @State private var todayBoard: TomorrowBoard? = nil
    @State private var pendingScrollAnchor: String? = nil
    /// Beats currently expanded past their top rows ("See all n").
    @State private var openBeats: Set<String> = []
    /// Floating section nav — the trailing index button pops the section
    /// list so everything is one tap away (founder, Jul 4).
    @State private var sectionNavOpen = false
    /// Pre-grouped [league: [kind: rows]] — rebuilt once per load.
    @State private var itemsIndex: [HubLeagueSel: [SignalKind: [Signal]]] = [:]

    private var nightLabel: String {
        (gradedIsYesterday || gradedDayShort.isEmpty) ? "Last Night" : gradedDayShort
    }

    // ---- data plumbing (carried from the original Hub page — hardened in production) ----

    private static func buildItemsIndex(_ all: [Signal]) -> [HubLeagueSel: [SignalKind: [Signal]]] {
        var idx: [HubLeagueSel: [SignalKind: [Signal]]] = [:]
        for s in all where s.confirmedXI == nil {
            idx[s.league, default: [:]][s.kind, default: []].append(s)
        }
        return idx
    }

    /// Defensive dedupe: the pipeline occasionally lands the same read twice
    /// with a rounding difference ("7.4 vs 4.33" and "7.4 vs 4.3"). Key on
    /// lane + game + subject (+ regression day) and keep the first (rows come
    /// relevance-ordered), so a double insert never renders as two rows.
    private static func dedupe(_ all: [Signal]) -> [Signal] {
        var seen = Set<String>()
        var out: [Signal] = []
        for s in all {
            // Digits are stripped from the subject so a re-run with moved
            // numbers ("France head the title market at +170" → "+175")
            // still collapses to one story.
            let subj = HubFmt.subject(s.headline).filter { !$0.isNumber }
            let key = "\(s.kind)|\(s.game)|\(subj)|\(s.reg?.day ?? "")"
            if seen.insert(key).inserted { out.append(s) }
        }
        return out
    }

    private func items(_ k: SignalKind) -> [Signal] { itemsIndex[sel]?[k] ?? [] }

    private var selStreakRows: [StreakRow] {
        streakRows.filter { ($0.league ?? "MLB").uppercased() == sel.label }
    }
    private var selNightRows: [NightHighlightRow] {
        nightRows.filter { ($0.league ?? "MLB").uppercased() == sel.label }
    }
    private var selYdaySignals: [Signal] { ydaySignals.filter { $0.league == sel } }

    private var availableLeagues: [HubLeagueSel] {
        let wcActive: Bool = {
            let cal = Calendar(identifier: .gregorian)
            var comps = DateComponents()
            comps.year = 2026; comps.month = 6; comps.day = 11
            let start = cal.date(from: comps)!
            comps.month = 7; comps.day = 20
            let end = cal.date(from: comps)!
            return Date() >= start && Date() < end
        }()
        let order: [HubLeagueSel] = [.nba, .wc, .mlb]
        let present = order.filter { lg in
            (lg == .wc && wcActive) || fetched.contains { $0.league == lg }
        }
        return present.isEmpty ? [.mlb] : present
    }

    private func load() async {
        let date = SupabaseAPI.todayEST()
        let gradedDate0 = SupabaseAPI.hubGradedDateEST()
        async let rateF = SupabaseAPI.fetchInsightHitRate(date: gradedDate0)
        async let nightF = SupabaseAPI.fetchNightHighlights(date: gradedDate0)
        async let streaksF = SupabaseAPI.fetchStreaks()
        async let tbF = SupabaseAPI.fetchTodayBoard(date: date)
        async let recordF = SupabaseAPI.fetchInsightRecord(days: 7)

        var collected: [Signal] = []
        var anyError = false
        await withTaskGroup(of: (sigs: [Signal], errored: Bool).self) { group in
            for lg in AppFlags.insightLeagues {
                group.addTask {
                    do {
                        let conns = try await SupabaseAPI.fetchInsightConnections(date: date, league: lg)
                        return (conns.compactMap { $0.toSignal() }, false)
                    } catch {
                        print("[HubView] fetchInsightConnections(\(lg)) error: \(error.localizedDescription)")
                        return ([], true)
                    }
                }
            }
            for await r in group {
                collected.append(contentsOf: r.sigs)
                if r.errored { anyError = true }
            }
        }
        collected = Self.dedupe(collected)
        #if DEBUG
        // Sim-QA breadcrumb (GaryTour's file channel, reversed): lane counts
        // after the dedupe, readable from the host via the data container.
        var kindCounts: [String: Int] = [:]
        for s in collected where s.league == .mlb { kindCounts[s.kind.chip, default: 0] += 1 }
        let dbg = kindCounts.map { "\($0.key)=\($0.value)" }.sorted().joined(separator: "\n")
        try? dbg.write(toFile: NSTemporaryDirectory() + "hub-debug.txt", atomically: true, encoding: .utf8)
        #endif

        // Graded surfaces flip at 3am ET but grading lands ~6:45am — walk back
        // one day when the morning void has nothing yet.
        var gradedDate = gradedDate0
        var rate = await rateF
        var night = await nightF
        if rate == nil, night.isEmpty, let back = Self.shiftDate(gradedDate, by: -1) {
            gradedDate = back
            async let rateB = SupabaseAPI.fetchInsightHitRate(date: back)
            async let nightB = SupabaseAPI.fetchNightHighlights(date: back)
            rate = await rateB
            night = await nightB
        }
        let liveStreaks = await streaksF
        let tb = await tbF
        let rec = await recordF
        // The receipts close the page ALL DAY now (not just the morning void).
        let receiptsDate = gradedDate
        var yday: [Signal] = []
        await withTaskGroup(of: [Signal].self) { group in
            for lg in AppFlags.insightLeagues {
                group.addTask {
                    guard let conns = try? await SupabaseAPI.fetchInsightConnections(date: receiptsDate, league: lg) else { return [] }
                    return conns.compactMap { $0.toSignal() }.filter { $0.result != nil }
                }
            }
            for await sigs in group { yday.append(contentsOf: sigs) }
        }
        yday = Self.dedupe(yday)

        await MainActor.run {
            didLoad = true
            loadedAt = Date()
            loadedDate = date
            fetchErrored = anyError && collected.isEmpty
            hitRate = rate
            record7 = rec
            gradedIsYesterday = (gradedDate == gradedDate0)
            if gradedIsYesterday { gradedDayShort = "" } else {
                let inF = DateFormatter(); inF.dateFormat = "yyyy-MM-dd"; inF.timeZone = TimeZone(identifier: "America/New_York")
                let outF = DateFormatter(); outF.dateFormat = "EEE, MMM d"; outF.timeZone = TimeZone(identifier: "America/New_York")
                gradedDayShort = inF.date(from: gradedDate).map { outF.string(from: $0) } ?? ""
            }
            streakRows = liveStreaks
            nightRows = night
            ydaySignals = yday
            todayBoard = tb
            // Keep last-good data only when the fetch ERRORED; a successful
            // zero-row day must clear the board (3am rollover honesty).
            if !collected.isEmpty || !anyError {
                fetched = collected
                itemsIndex = Self.buildItemsIndex(collected)
            }
            // Land on the highest-priority league with edges tonight, without
            // stomping a user-picked league that still has rows.
            if !collected.contains(where: { $0.league == sel }),
               let top = availableLeagues.first(where: { lg in collected.contains { $0.league == lg } }) {
                sel = top
            }
            consumeFocus()
        }
    }

    private func reloadIfStale() async {
        guard didLoad else { return }
        let expired = loadedAt.map { Date().timeIntervalSince($0) > 1800 } ?? true
        let emptyBoard = fetched.isEmpty && ydaySignals.isEmpty
        if loadedDate != SupabaseAPI.todayEST() || expired || fetchErrored || emptyBoard {
            await load()
        }
    }

    /// Deep-linked lane → its section anchor on the new page. A missing anchor
    /// no-ops harmlessly; the request stays pending until the page can render.
    private func consumeFocus() {
        guard focus.focusLane != nil, didLoad, !fetchErrored else { return }
        guard let lane = focus.focusLane else { return }
        focus.focusLane = nil
        searchText = ""
        searchOpen = false
        searchFocused = false
        let anchor: String
        switch lane {
        case .regression:                            anchor = "regression"
        case .streak:                                anchor = "streaks"
        case .fantasyPickups:                        anchor = "fantasy"
        case .hot, .cold, .platoon, .hrThreat:       anchor = "bats"
        case .starterForm, .teamRecord,
             .bullpenFatigue, .ballpark:             anchor = sel == .wc ? "matchups" : "arms"
        case .situational:                           anchor = sel == .wc ? "matchups" : "arms"
        case .h2h, .injury, .firstInning,
             .runningGame, .parkWeather:             anchor = "matchups"
        case .tournament, .advancement:              anchor = "cup"
        case .xgRegression, .xgRecap:                anchor = "numbers"
        }
        openBeats.insert(anchor)
        pendingScrollAnchor = anchor
    }

    private static func shiftDate(_ s: String, by days: Int) -> String? {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "America/New_York")
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "America/New_York") ?? .current
        guard let d = f.date(from: s),
              let shifted = cal.date(byAdding: .day, value: days, to: d) else { return nil }
        return f.string(from: shifted)
    }

    private var leagueSignals: [Signal] { fetched.filter { $0.league == sel } }
    private var wcIntelSignals: [Signal] { fetched.filter { $0.league == .wc && $0.confirmedXI != nil } }
    private func wcEdges(for game: String) -> [Signal] { fetched.filter { $0.league == .wc && $0.game == game } }

    /// Every edge the Hub carries for one slate game (abbr-exact, then the
    /// name-keyword fallback). Look-ahead regression rows are excluded — their
    /// `game` names TOMORROW's matchup, which collides on series nights.
    private func edgesFor(_ r: TomorrowBoardRow) -> [Signal] {
        let full = "\(r.away_team ?? "") @ \(r.home_team ?? "")"
        let abbr = "\(r.away_abbr ?? "") @ \(r.home_abbr ?? "")".uppercased()
        return leagueSignals.filter { s in
            guard s.confirmedXI == nil, s.reg?.day != "tomorrow" else { return false }
            return s.game.uppercased() == abbr || abbrGameMatches(s.game, matchup: full)
        }
    }

    /// Streaks on the line in this game — either side's team (or a bat on it).
    private func streaksFor(_ r: TomorrowBoardRow) -> [StreakRow] {
        let full = "\(r.away_team ?? "") @ \(r.home_team ?? "")".lowercased()
        guard full.count > 3 else { return [] }
        return selStreakRows.filter { st in
            guard st.next_game != nil else { return false }
            let team = (st.team ?? st.subject ?? "").lowercased()
            guard let nick = team.split(separator: " ").last.map(String.init), nick.count > 2 else { return false }
            return full.contains(nick)
        }
    }

    // ---- the front page ranking ----

    /// Relevance-ranked stories across every lane (rows arrive relevance-
    /// ordered per league): no look-ahead regression, no confirmed-XI cards,
    /// no fantasy corner content, max 2 per lane so the top of the page mixes.
    private var ranked: [Signal] {
        var counts: [SignalKind: Int] = [:]
        var out: [Signal] = []
        for s in leagueSignals {
            if s.confirmedXI != nil { continue }
            if s.kind == .fantasyPickups { continue }
            if s.reg?.day == "tomorrow" { continue }
            let c = counts[s.kind] ?? 0
            guard c < 2 else { continue }
            counts[s.kind] = c + 1
            out.append(s)
            if out.count == 7 { break }
        }
        return out
    }
    private var lead: Signal? { ranked.first }
    private var bestOfBoard: [Signal] { Array(ranked.dropFirst()) }

    /// Tonight's slate for the selected league, from the 5am board snapshot.
    private var slateRows: [TomorrowBoardRow] {
        (todayBoard?.board ?? []).filter { ($0.league ?? "").uppercased() == sel.label }
    }

    /// The slate panel's countdown target (founder, Jul 6). WC: the day's
    /// BIGGEST match (pipeline rank-1 big game, e.g. USA @ Belgium) — the
    /// tournament runs on marquee moments. MLB: the FIRST game of the day —
    /// a 15-game slate rarely has one game that owns the night.
    private var slateCountdown: (title: String, date: Date)? {
        let now = Date()
        if sel == .wc,
           let bg = (todayBoard?.big_games ?? [])
               .filter({ ($0.league ?? "").uppercased() == "WC" })
               .sorted(by: { $0.rank < $1.rank })
               .first(where: { (parseISO8601($0.commence_time ?? "") ?? .distantPast) > now }),
           let d = parseISO8601(bg.commence_time ?? "") {
            return ((bg.matchup ?? "").uppercased(), d)
        }
        let next = slateRows
            .compactMap { r -> (Date, TomorrowBoardRow)? in
                guard let d = parseISO8601(r.commence_time ?? ""), d > now else { return nil }
                return (d, r)
            }
            .min { $0.0 < $1.0 }
        guard let next else { return nil }
        return ("\(next.1.away_abbr ?? "?") @ \(next.1.home_abbr ?? "?")", next.0)
    }

    // ---- the beats (the long tail, in human sections) ----

    private struct Beat: Identifiable {
        let anchor: String
        let title: String
        let kinds: [SignalKind]
        var id: String { anchor }
    }

    private var beats: [Beat] {
        if sel == .wc {
            return [
                Beat(anchor: "cup", title: "The Cup", kinds: [.tournament, .advancement]),
                Beat(anchor: "numbers", title: "The Numbers", kinds: [.xgRegression, .xgRecap]),
                Beat(anchor: "matchups", title: "The Matchups", kinds: [.h2h, .situational, .ballpark, .streak]),
            ]
        }
        return [
            Beat(anchor: "bats", title: "The Bats", kinds: [.hot, .cold, .platoon, .hrThreat]),
            Beat(anchor: "arms", title: "The Arms", kinds: [.starterForm, .teamRecord, .bullpenFatigue, .situational, .ballpark]),
            Beat(anchor: "matchups", title: "The Matchups", kinds: [.h2h, .injury, .firstInning, .runningGame, .parkWeather]),
        ]
    }

    /// Rows for a beat, in the feed's relevance order (each row keeps its own
    /// lane kicker). Regression rows live on the board, never in a beat.
    private func beatRows(_ beat: Beat) -> [Signal] {
        let kinds = Set(beat.kinds)
        return leagueSignals.filter { kinds.contains($0.kind) && $0.confirmedXI == nil && $0.reg == nil }
    }

    /// Everything not already on the page — a safety net so a future backend
    /// lane always renders somewhere instead of vanishing.
    private var overflow: [Signal] {
        var placed: Set<SignalKind> = [.regression, .fantasyPickups, .streak]
        for b in beats { for k in b.kinds { placed.insert(k) } }
        return leagueSignals.filter { !placed.contains($0.kind) && $0.confirmedXI == nil }
    }

    // ---- body ----

    var body: some View {
        GeometryReader { geo in
        ScrollViewReader { proxy in
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 26) {
                HubMasthead(
                    sel: $sel,
                    leagues: availableLeagues,
                    gameCount: slateRows.count,
                    record7: record7,
                    searchOpen: $searchOpen,
                    searchText: $searchText,
                    searchFocused: $searchFocused
                )
                .id("top")

                if !didLoad {
                    hubLoading
                } else if searchOpen && !searchText.isEmpty {
                    HubSearchResults(
                        query: searchText,
                        edges: fetched,
                        receipts: ydaySignals,
                        streaks: streakRows,
                        night: nightRows,
                        nightLabel: nightLabel,
                        onEdge: { s in if s.playerId != nil { breakdownSignal = s } else { selectedSignal = s } }
                    )
                } else if fetchErrored && leagueSignals.isEmpty && ydaySignals.isEmpty
                            && nightRows.isEmpty && streakRows.isEmpty {
                    hubError
                } else {
                    if !slateRows.isEmpty {
                        // THE SLATE panel (founder, Jul 5: the Tomorrow-page
                        // masthead earns a daily spot here too) — the day's
                        // shape in one card; the strip below carries the games.
                        HubSlatePanel(rows: slateRows, countdown: slateCountdown)
                        HubSlateStrip(rows: slateRows) { r in
                            gameSheet = HubGameSel(row: r)
                        }
                    }

                    if leagueSignals.isEmpty {
                        hubMorningNotice
                    } else {
                        if let lead {
                            HubLeadStory(s: lead) { s in
                                if s.playerId != nil { breakdownSignal = s } else { selectedSignal = s }
                            }
                            .id("lead")
                        }
                        if !bestOfBoard.isEmpty {
                            VStack(alignment: .leading, spacing: 4) {
                                HubHead(title: "The Best of the Board")
                                HubBestOf(signals: bestOfBoard) { s in
                                    if s.playerId != nil { breakdownSignal = s } else { selectedSignal = s }
                                }
                            }
                            .id("bestof")
                        }
                        if !items(.regression).isEmpty {
                            VStack(alignment: .leading, spacing: 12) {
                                HubHead(title: "The Regression Board", sub: "ERA vs expected")
                                HubRegressionBoard(signals: items(.regression), todayEST: SupabaseAPI.todayEST()) { s in
                                    if s.playerId != nil { breakdownSignal = s } else { selectedSignal = s }
                                }
                            }
                            .id("regression")
                        }
                        if sel == .wc, !items(.xgRegression).isEmpty {
                            VStack(alignment: .leading, spacing: 12) {
                                HubHead(title: "The xG Board", sub: "goals vs expected")
                                HubBeatList(rows: items(.xgRegression), open: true, kickerFor: kickerText,
                                            onRow: { s in if s.playerId != nil { breakdownSignal = s } else { selectedSignal = s } },
                                            onProfile: { breakdownSignal = $0 })
                            }
                            .id("xgboard")
                        }
                    }

                    if !selStreakRows.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            HubHead(title: "Streak Watch", count: selStreakRows.count)
                            HubStreakWatch(rows: selStreakRows, onTapGame: { onSelectGame($0) })
                        }
                        .id("streaks")
                    }

                    if !leagueSignals.isEmpty {
                        ForEach(beats) { beat in
                            let rows = beatRows(beat)
                            if !rows.isEmpty {
                                HubBeatSection(
                                    anchor: beat.anchor,
                                    title: beat.title,
                                    rows: rows,
                                    openBeats: $openBeats,
                                    kickerFor: kickerText,
                                    onRow: { s in if s.playerId != nil { breakdownSignal = s } else { selectedSignal = s } },
                                    onProfile: { breakdownSignal = $0 }
                                )
                                .id(beat.anchor)
                            }
                        }

                        if sel == .wc, !wcIntelSignals.isEmpty {
                            VStack(alignment: .leading, spacing: 12) {
                                HubHead(title: "Game Intel", count: wcIntelSignals.count)
                                VStack(spacing: 0) {
                                    ForEach(wcIntelSignals) { s in
                                        HubStoryRow(s: s, kicker: kickerText(s), expandable: false,
                                                    showsChevron: true,
                                                    onTap: { wcIntel = s }, onProfile: nil)
                                        HubRule(inset: 18)
                                    }
                                }
                            }
                            .id("wcIntel")
                        }

                        let fantasy = items(.fantasyPickups)
                        if !fantasy.isEmpty {
                            VStack(alignment: .leading, spacing: 12) {
                                HubHead(title: "Fantasy Corner", count: fantasy.count)
                                HubFantasyCorner(signals: fantasy) { s in
                                    if s.playerId != nil { breakdownSignal = s } else { selectedSignal = s }
                                }
                            }
                            .id("fantasy")
                        }

                        if !overflow.isEmpty {
                            HubBeatSection(
                                anchor: "more",
                                title: "More Edges",
                                rows: overflow,
                                openBeats: $openBeats,
                                kickerFor: kickerText,
                                onRow: { s in if s.playerId != nil { breakdownSignal = s } else { selectedSignal = s } },
                                onProfile: { breakdownSignal = $0 }
                            )
                            .id("more")
                        }
                    }

                    if !selNightRows.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            HubHead(title: nightLabel, count: selNightRows.count)
                            HubNightBoard(rows: selNightRows)
                        }
                        .id("lastNight")
                    }

                    if !selYdaySignals.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            HubHead(title: "The Receipts", sub: receiptsTally)
                            HubReceipts(signals: selYdaySignals) { selectedSignal = $0 }
                        }
                        .id("receipts")
                    }
                }
            }
            .padding(.top, 8)
            .padding(.bottom, 120)
            .frame(minHeight: geo.size.height, alignment: .top)
            .task { if !didLoad { await load() } }
        }
        .overlay(alignment: .bottomTrailing) {
            if !searchOpen, didLoad, !jumpItems.isEmpty {
                HubSectionNav(items: jumpItems, open: $sectionNavOpen) { anchor in
                    withAnimation(.easeInOut(duration: 0.3)) { proxy.scrollTo(anchor, anchor: .top) }
                }
                .padding(.trailing, 14)
                .padding(.bottom, 108)   // clears the floating tab bar
                .transition(.move(edge: .trailing).combined(with: .opacity))
            }
        }
        .scrollDismissesKeyboard(.immediately)
        .refreshable { await load() }
        .onChange(of: isVisible) { vis in
            guard vis else { return }
            consumeFocus()
            Task { await reloadIfStale() }
        }
        .onChange(of: scenePhase) { phase in
            guard phase == .active, isVisible else { return }
            Task { await reloadIfStale() }
        }
        .onGaryTour { verb, arg in
            // "hubgame 1" — open the game sheet for slate index 1 (sim QA:
            // the tour harness can't tap, so the sheet gets its own verb).
            if verb == "hubnav" {
                withAnimation(.spring(response: 0.32, dampingFraction: 0.86)) { sectionNavOpen.toggle() }
                return
            }
            if verb == "hubgame" {
                if let i = Int(arg), slateRows.indices.contains(i) {
                    gameSheet = HubGameSel(row: slateRows[i])
                }
                return
            }
            guard verb == "hub" else { return }
            switch arg.lowercased() {
            case "mlb": withAnimation { sel = .mlb }
            case "nba": withAnimation { sel = .nba }
            case "wc": withAnimation { sel = .wc }
            // Any other arg = a section anchor ("hub fantasy", "hub lastNight")
            // — the tour harness can't drive the pop-out nav.
            default: withAnimation { proxy.scrollTo(arg, anchor: .top) }
            }
        }
        .overlay {
            if let s = selectedSignal {
                HubEdgeOverlay(signal: s,
                               onClose: { withAnimation(.spring(response: 0.3, dampingFraction: 0.88)) { selectedSignal = nil } },
                               onViewGame: { g in
                                   selectedSignal = nil
                                   onSelectGame(g)
                               })
                    .transition(.opacity.combined(with: .scale(scale: 0.94)))
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.88), value: selectedSignal?.id)
        .sheet(item: $breakdownSignal) { PlayerInsightSheet(signal: $0) }
        // Centered pop-up, not a pull-up (founder, Jul 6: no bottom sheets
        // on the game widget) — dim + scale, tap outside to close.
        .overlay {
            if let sel = gameSheet {
                ZStack {
                    Color.black.opacity(0.55).ignoresSafeArea()
                        .onTapGesture { withAnimation(.spring(response: 0.3, dampingFraction: 0.88)) { gameSheet = nil } }
                    HubGameSheet(row: sel.row,
                                 edges: edgesFor(sel.row),
                                 streaks: streaksFor(sel.row),
                                 kickerFor: kickerText,
                                 onClose: { withAnimation(.spring(response: 0.3, dampingFraction: 0.88)) { gameSheet = nil } },
                                 onViewGame: { onSelectGame($0) })
                        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous)
                            .stroke(GaryColors.gold.opacity(0.3), lineWidth: 1))
                        .overlay(alignment: .topTrailing) {
                            Button { withAnimation(.spring(response: 0.3, dampingFraction: 0.88)) { gameSheet = nil } } label: {
                                Image(systemName: "xmark")
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundStyle(.white.opacity(0.55))
                                    .frame(width: 38, height: 38)
                                    .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                        .shadow(color: .black.opacity(0.6), radius: 30, y: 14)
                        .padding(.horizontal, 14)
                        .frame(maxHeight: UIScreen.main.bounds.height * 0.66)
                }
                .transition(.opacity.combined(with: .scale(scale: 0.94)))
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.88), value: gameSheet?.id)
        .fullScreenCover(item: $wcIntel) { s in
            ZStack(alignment: .top) {
                GaryColors.darkBg.ignoresSafeArea()
                ScrollView(showsIndicators: false) {
                    WCGameIntelView(matchup: s.game,
                                    confirmedXI: s.confirmedXI,
                                    read: s,
                                    edges: wcEdges(for: s.game),
                                    onClose: { wcIntel = nil })
                }
            }
        }
        .onChange(of: pendingScrollAnchor) { anchor in
            guard let anchor else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                withAnimation(.easeInOut(duration: 0.35)) { proxy.scrollTo(anchor, anchor: .top) }
                pendingScrollAnchor = nil
            }
        }
        // Switching leagues rebuilds the whole page — land the reader back at
        // the masthead instead of mid-scroll into shorter content.
        .onChange(of: sel) { _ in
            withAnimation(.easeInOut(duration: 0.3)) { proxy.scrollTo("top", anchor: .top) }
        }
        }
        }
    }

    /// Lane label for a row's kicker (VENUE for WC "ballpark" reads).
    private func kickerText(_ s: Signal) -> String {
        (s.kind == .ballpark && s.league == .wc) ? "VENUE" : s.kind.chip
    }

    /// Jump-bar entries — only sections that exist right now, in page order.
    private var jumpItems: [(anchor: String, label: String)] {
        var out: [(String, String)] = []
        if !leagueSignals.isEmpty {
            if lead != nil || !bestOfBoard.isEmpty { out.append(("lead", "The Best")) }
            if !items(.regression).isEmpty { out.append(("regression", "Regression")) }
            if sel == .wc, !items(.xgRegression).isEmpty { out.append(("xgboard", "xG")) }
        }
        if !selStreakRows.isEmpty { out.append(("streaks", "Streaks")) }
        if !leagueSignals.isEmpty {
            for beat in beats where !beatRows(beat).isEmpty {
                out.append((beat.anchor, beat.title.replacingOccurrences(of: "The ", with: "")))
            }
            if sel == .wc, !wcIntelSignals.isEmpty { out.append(("wcIntel", "Intel")) }
            if !items(.fantasyPickups).isEmpty { out.append(("fantasy", "Fantasy")) }
        }
        if !selNightRows.isEmpty { out.append(("lastNight", nightLabel)) }
        if !selYdaySignals.isEmpty { out.append(("receipts", "Receipts")) }
        return out
    }

    private var receiptsTally: String {
        let rows = selYdaySignals
        let (hit, graded) = hitRate
            ?? (rows.filter { $0.result == "hit" }.count,
                rows.filter { $0.result == "hit" || $0.result == "miss" }.count)
        guard graded > 0 else { return "" }
        let pct = Int((Double(hit) / Double(graded) * 100).rounded())
        let day = gradedIsYesterday ? "yday" : gradedDayShort
        return "\(hit) of \(graded) hit · \(pct)% · \(day)"
    }

    // ---- page states ----

    private var hubLoading: some View {
        VStack(spacing: 14) {
            ProgressView().tint(GaryColors.gold)
            Text("PULLING TONIGHT'S BOARD")
                .font(HubFont.kicker(11)).tracking(1.4)
                .foregroundStyle(.white.opacity(0.62))
        }
        .frame(maxWidth: .infinity).padding(.top, 120)
    }

    private var hubError: some View {
        VStack(spacing: 12) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 30, weight: .light))
                .foregroundStyle(GaryColors.gold.opacity(0.6))
            Text("Couldn't load the Hub")
                .font(HubFont.display(17, .bold))
                .foregroundStyle(GaryColors.warmWhite)
            Text("Check your connection, then pull down to retry.")
                .font(HubFont.body(12.5)).foregroundStyle(.white.opacity(0.62))
                .multilineTextAlignment(.center).padding(.horizontal, 40)
            Button { Task { await load() } } label: {
                Text("RETRY")
                    .font(HubFont.data(12))
                    .foregroundStyle(GaryColors.ink)
                    .padding(.horizontal, 24).padding(.vertical, 10)
                    .background(Capsule().fill(GaryColors.gold))
            }
            .buttonStyle(.plain)
            .padding(.top, 4)
        }
        .frame(maxWidth: .infinity).padding(.top, 90)
    }

    /// Pre-lineup morning: the paper still has a front section (slate, streaks,
    /// last night, receipts render below) — this is just the honest note.
    private var hubMorningNotice: some View {
        VStack(alignment: .leading, spacing: 6) {
            HubKicker(text: "Tonight's Board")
            Text("No \(sel.label) edges posted yet — tonight's board fills in as lineups and matchups firm up.")
                .font(HubFont.body(14.5, .semibold))
                .foregroundStyle(.white.opacity(0.8))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 18)
    }
}

// MARK: - Pop-out section nav

/// Floating section nav (founder: "a pop out nav from the side") — a small
/// gold index button rides the trailing edge once the masthead scrolls off;
/// tapping it pops a vertical list of the page's sections, tap one to jump.
fileprivate struct HubSectionNav: View {
    let items: [(anchor: String, label: String)]
    @Binding var open: Bool
    let onTap: (String) -> Void

    var body: some View {
        VStack(alignment: .trailing, spacing: 10) {
            if open {
                VStack(alignment: .trailing, spacing: 0) {
                    ForEach(items, id: \.anchor) { item in
                        Button {
                            onTap(item.anchor)
                            withAnimation(.spring(response: 0.32, dampingFraction: 0.86)) { open = false }
                        } label: {
                            Text(item.label.uppercased())
                                .font(HubFont.kicker(11)).tracking(1.3)
                                .foregroundStyle(.white.opacity(0.85))
                                .padding(.vertical, 9)
                                .frame(maxWidth: .infinity, alignment: .trailing)
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
                .frame(width: 168)
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
                    .frame(width: 40, height: 40)
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

fileprivate struct HubMasthead: View {
    @Binding var sel: HubLeagueSel
    let leagues: [HubLeagueSel]
    let gameCount: Int
    let record7: (hit: Int, miss: Int)?
    @Binding var searchOpen: Bool
    @Binding var searchText: String
    var searchFocused: FocusState<Bool>.Binding

    private var dateLine: String {
        let f = DateFormatter()
        f.timeZone = TimeZone(identifier: "America/New_York")
        f.dateFormat = "EEEE, MMMM d"
        return f.string(from: Date())
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 10) {
                Image(GaryBrand.mark)
                    .resizable().scaledToFit()
                    .frame(width: 30, height: 30)
                    .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
                (Text("THE ").foregroundColor(GaryColors.warmWhite)
                    + Text("HUB").foregroundColor(GaryColors.gold))
                    .font(HubFont.display(30))
                    .tracking(0.5)
                Spacer()
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        searchOpen.toggle()
                        if !searchOpen { searchText = ""; searchFocused.wrappedValue = false }
                        else { searchFocused.wrappedValue = true }
                    }
                } label: {
                    Image(systemName: searchOpen ? "xmark" : "magnifyingglass")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.white.opacity(searchOpen ? 0.8 : 0.55))
                        .frame(width: 30, height: 30)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(searchOpen ? "Close search" : "Search")
                Button {
                    NotificationCenter.default.post(name: Notification.Name("ShowSettingsMenu"), object: nil)
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.4))
                        .frame(width: 28, height: 30)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Settings")
            }

            HStack(spacing: 8) {
                // Date + count moved into HubSlatePanel (Jul 5) — saying them
                // twice two blocks apart failed the duplication rule.
                Spacer()
                if let r = record7 {
                    let pct = Int((Double(r.hit) / Double(max(r.hit + r.miss, 1)) * 100).rounded())
                    HStack(spacing: 5) {
                        HubKicker(text: "Last 7 Days", size: 9.5, color: .white.opacity(0.62))
                        Text("\(r.hit)–\(r.miss) · \(pct)%")
                            .font(HubFont.data(11))
                            .foregroundStyle(GaryColors.gold)
                    }
                }
            }
            .padding(.top, 5)

            // Double rule — the newspaper masthead seam.
            VStack(spacing: 2.5) {
                Rectangle().fill(GaryColors.gold.opacity(0.55)).frame(height: 2)
                Rectangle().fill(GaryColors.gold.opacity(0.3)).frame(height: 1)
            }
            .padding(.top, 11)

            if leagues.count > 1 {
                HStack(spacing: 22) {
                    ForEach(leagues, id: \.self) { l in
                        let on = l == sel
                        Button { withAnimation(.easeInOut(duration: 0.2)) { sel = l } } label: {
                            VStack(spacing: 5) {
                                Text(l.label)
                                    .font(HubFont.kicker(12))
                                    .tracking(1.6)
                                    .foregroundStyle(on ? GaryColors.warmWhite : .white.opacity(0.5))
                                Capsule().fill(GaryColors.gold)
                                    .frame(width: 22, height: 2)
                                    .opacity(on ? 1 : 0)
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                    Spacer()
                }
                .padding(.top, 10)
            }

            if searchOpen {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.5))
                    TextField("Players, teams, edges", text: $searchText)
                        .font(HubFont.body(13.5))
                        .foregroundStyle(.white)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .focused(searchFocused)
                        .submitLabel(.search)
                        .onSubmit { searchFocused.wrappedValue = false }
                    if !searchText.isEmpty {
                        Button { searchText = "" } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.system(size: 14)).foregroundStyle(.white.opacity(0.45))
                        }.buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 12).padding(.vertical, 9)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(GaryColors.fieldBg)
                        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .stroke(GaryColors.warmWhite.opacity(0.08), lineWidth: 1))
                )
                .padding(.top, 12)
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 10)
    }
}

// MARK: - Tonight's slate strip

/// Identifiable wrapper for the slate-strip → game-sheet presentation.
fileprivate struct HubGameSel: Identifiable {
    let row: TomorrowBoardRow
    var id: String { "\(row.away_team ?? row.away_abbr ?? "") @ \(row.home_team ?? row.home_abbr ?? "")" }
}

/// WC board rows carry no abbreviations — fall back to the first three
/// letters of the team name ("France" → FRA) so labels never read "—".
fileprivate func hubSideLabel(_ abbr: String?, _ team: String?) -> String {
    if let a = abbr, !a.isEmpty { return a }
    guard let t = team, !t.isEmpty else { return "—" }
    return String(t.uppercased().filter { $0.isLetter }.prefix(3))
}

/// THE SLATE — the Tomorrow-page masthead, day-aware for today: Bebas date,
/// then one mono line with the count, what's live, and what's next.
fileprivate struct HubSlatePanel: View {
    let rows: [TomorrowBoardRow]
    var countdown: (title: String, date: Date)? = nil
    @ObservedObject private var live = LiveScoreCache.shared

    /// "IN 5H 42M" / "IN 42M" — minutes are plenty; a ticking second hand
    /// on a slate panel is noise (same call as the Tomorrow clock removal).
    private static func inClock(to d: Date, from now: Date) -> String {
        let mins = max(0, Int(d.timeIntervalSince(now) / 60))
        return mins >= 60 ? "IN \(mins / 60)H \(mins % 60)M" : "IN \(mins)M"
    }

    private var dateLine: String {
        let f = DateFormatter()
        f.timeZone = TimeZone(identifier: "America/New_York")
        f.dateFormat = "EEEE, MMMM d"
        return f.string(from: Date())
    }

    private func matchup(_ r: TomorrowBoardRow) -> String {
        "\(r.away_team ?? r.away_abbr ?? "?") @ \(r.home_team ?? r.home_abbr ?? "?")"
    }

    private var meta: String {
        let now = Date()
        var bits = ["\(rows.count) \(rows.count == 1 ? "GAME" : "GAMES")"]
        let liveCount = rows.filter { live.status(forMatchup: matchup($0))?.isLive == true }.count
        if liveCount > 0 { bits.append("\(liveCount) LIVE NOW") }
        let next = rows
            .compactMap { r -> (Date, TomorrowBoardRow)? in
                guard let d = parseISO8601(r.commence_time ?? ""), d > now else { return nil }
                return (d, r)
            }
            .min { $0.0 < $1.0 }
        // (The upcoming game itself lives on the gold countdown line now —
        // naming it here too failed the duplication rule.)
        if next == nil, liveCount == 0 {
            bits.append("ALL DONE")
        }
        return bits.joined(separator: " · ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("THE SLATE")
                .font(GaryFonts.mono(10, bold: true)).tracking(2)
                .foregroundStyle(GaryColors.gold)
            Text(dateLine)
                .font(GaryFonts.display(30))
                .foregroundStyle(GaryColors.warmWhite)
                .lineLimit(1).minimumScaleFactor(0.7)
                .padding(.top, 5)
            Text(meta)
                .font(GaryFonts.mono(11, bold: true)).tracking(0.8)
                .foregroundStyle(.white.opacity(0.66))
                .lineLimit(1).minimumScaleFactor(0.8)
                .padding(.top, 7)
            if let countdown {
                TimelineView(.periodic(from: .now, by: 60)) { ctx in
                    Text("\(countdown.title) \(Self.inClock(to: countdown.date, from: ctx.date))")
                        .font(GaryFonts.mono(11, bold: true)).tracking(0.8)
                        .foregroundStyle(GaryColors.gold)
                        .lineLimit(1).minimumScaleFactor(0.8)
                }
                .padding(.top, 4)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(GaryColors.warmWhite.opacity(0.03))
                .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(GaryColors.warmWhite.opacity(0.08), lineWidth: 1))
        )
        .overlay(alignment: .topTrailing) {
            RadialGradient(colors: [GaryColors.gold.opacity(0.18), .clear],
                           center: .topTrailing, startRadius: 0, endRadius: 150)
                .frame(width: 200, height: 200)
                .allowsHitTesting(false)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .padding(.horizontal, 16)
    }
}

fileprivate struct HubSlateStrip: View {
    let rows: [TomorrowBoardRow]
    let onTap: (TomorrowBoardRow) -> Void
    /// Live scores overlay the scheduled time once a game starts — the strip
    /// reads scheduled → ▶ live score → final across the day.
    @ObservedObject private var live = LiveScoreCache.shared

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.offset) { i, r in
                    Button { onTap(r) } label: { block(r) }
                        .buttonStyle(.plain)
                    if i < rows.count - 1 {
                        Rectangle().fill(Color.white.opacity(0.1)).frame(width: 1, height: 26)
                    }
                }
            }
            .padding(.horizontal, 18)
        }
    }

    private func side(_ abbr: String?, _ team: String?) -> String { hubSideLabel(abbr, team) }

    @ViewBuilder private func block(_ r: TomorrowBoardRow) -> some View {
        let marquee = r.is_marquee == true
        let matchup = "\(side(r.away_abbr, r.away_team)) @ \(side(r.home_abbr, r.home_team))"
        // The live lookup resolves through team-NAME keywords — feed it the
        // full names ("Pirates @ Nationals"); "PIT @ WSH" resolves to nothing.
        let ls = live.status(forMatchup: "\(r.away_team ?? "") @ \(r.home_team ?? "")")
        VStack(alignment: .leading, spacing: 3) {
            Text((ls?.isLive == true || ls?.isFinal == true) ? (ls?.scoreLine ?? matchup) : matchup)
                .font(HubFont.data(11.5, .semibold))
                .foregroundStyle(.white.opacity(marquee ? 0.95 : 0.8))
            HStack(spacing: 6) {
                if let ls, ls.isLive {
                    Text("▶ \((ls.detail ?? "LIVE").uppercased())")
                        .font(HubFont.data(9.5, .medium))
                        .foregroundStyle(GaryColors.win)
                } else if let ls, ls.isFinal {
                    Text("FINAL")
                        .font(HubFont.data(9.5, .medium))
                        .foregroundStyle(.white.opacity(0.55))
                } else {
                    Text(TomorrowView.etTime(r.commence_time, withZone: false, meridiem: true))
                        .font(HubFont.data(9.5, .medium))
                        .foregroundStyle(marquee ? GaryColors.gold : .white.opacity(0.55))
                    if let t = r.total {
                        Text("O/U \(HubFmt.stat(t))")
                            .font(HubFont.data(9.5, .medium))
                            .foregroundStyle(.white.opacity(0.55))
                    }
                }
            }
        }
        .padding(.horizontal, 13)
        .contentShape(Rectangle())
    }
}

// MARK: - The Lead

fileprivate struct HubLeadStory: View {
    let s: Signal
    let onTap: (Signal) -> Void

    /// The read under the headline — first two sentences, tight.
    private var read: String {
        let d = s.detail.trimmingCharacters(in: .whitespacesAndNewlines)
        var count = 0
        var idx = d.startIndex
        while idx < d.endIndex, count < 2 {
            guard let r = d.range(of: ". ", range: idx..<d.endIndex) else { return d }
            count += 1
            idx = r.upperBound
        }
        return count == 2 ? String(d[..<idx]).trimmingCharacters(in: .whitespaces) : d
    }

    /// What the hero number is measured against — spark[0]'s meaning differs
    /// per lane, so the label names it (a generic "from X" misreads a platoon
    /// split as a trend). Lanes without a known baseline shape show nothing.
    private var baseline: String? {
        guard s.spark.count >= 2 else { return nil }
        let base = HubFmt.stat(s.spark[0])
        switch s.kind {
        case .hot, .cold, .starterForm: return "season \(base)"
        case .ballpark:                 return "\(base) elsewhere"
        case .platoon:                  return "\(base) other side"
        case .regression:               return "\(base) ERA"
        default:                        return nil
        }
    }

    var body: some View {
        Button { onTap(s) } label: {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 8) {
                    HubKicker(text: "The Lead", size: 11, color: GaryColors.gold)
                    Rectangle().fill(GaryColors.gold.opacity(0.35)).frame(width: 26, height: 1)
                    HubKicker(text: s.kind.chip, size: 10, color: .white.opacity(0.55))
                    Spacer()
                    Text(s.game.uppercased())
                        .font(HubFont.data(9.5, .medium))
                        .foregroundStyle(.white.opacity(0.55))
                        .lineLimit(1)
                }
                Text(s.headline)
                    .font(HubFont.display(26))
                    .foregroundStyle(GaryColors.warmWhite)
                    .lineSpacing(0)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 10)
                // The giant number is for compact stats only — a sentence
                // value ("8-game unbeaten") already lives in the headline.
                if s.valueIsCompact {
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        Text(s.value)
                            .font(HubFont.data(40))
                            .foregroundStyle(s.tone.color)
                            .lineLimit(1).minimumScaleFactor(0.6)
                        if let baseline {
                            Text(baseline)
                                .font(HubFont.data(12, .medium))
                                .foregroundStyle(.white.opacity(0.62))
                        }
                    }
                    .padding(.top, 10)
                }
                Text(read)
                    .font(HubFont.body(14))
                    .foregroundStyle(.white.opacity(0.78))
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 10)
                HStack(spacing: 5) {
                    Text(s.playerId != nil ? "FULL BREAKDOWN" : "THE FULL READ")
                        .font(HubFont.kicker(10.5)).tracking(1.2)
                        .foregroundStyle(GaryColors.gold)
                    Image(systemName: "arrow.right")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(GaryColors.gold)
                }
                .padding(.top, 12)
            }
            .padding(.horizontal, 18)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - The Best of the Board

fileprivate struct HubBestOf: View {
    let signals: [Signal]
    let onTap: (Signal) -> Void

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(signals.enumerated()), id: \.element.id) { i, s in
                Button { onTap(s) } label: { row(i, s) }.buttonStyle(.plain)
                if i < signals.count - 1 { HubRule(inset: 52) }
            }
        }
    }

    @ViewBuilder private func row(_ i: Int, _ s: Signal) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Text(String(format: "%02d", i + 2))
                .font(HubFont.data(13, .medium))
                .foregroundStyle(.white.opacity(0.45))
                .frame(width: 24, alignment: .leading)
                .padding(.top, 2)
            VStack(alignment: .leading, spacing: 4) {
                HubKicker(text: s.kind.chip, size: 9.5, color: GaryColors.gold.opacity(0.9))
                Text(s.headline)
                    .font(HubFont.body(14.5, .semibold))
                    .foregroundStyle(.white.opacity(0.95))
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                    .multilineTextAlignment(.leading)
                Text(s.game.uppercased())
                    .font(HubFont.data(10, .medium))
                    .foregroundStyle(.white.opacity(0.62))
            }
            Spacer(minLength: 8)
            if let v = s.displayValue {
                Text(v)
                    .font(HubFont.data(16))
                    .foregroundStyle(s.tone.color)
                    .lineLimit(1)
                    .padding(.top, 14)
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 11)
        .contentShape(Rectangle())
    }
}

// MARK: - The Regression Board

fileprivate struct HubRegressionBoard: View {
    let signals: [Signal]
    /// The CURRENT EST slate day — anchors the Tonight/Tomorrow split so the
    /// 3am rollover re-buckets rows instead of trusting their baked strings.
    var todayEST: String = SupabaseAPI.todayEST()
    let onTap: (Signal) -> Void
    @State private var tab: Tab? = nil
    @State private var expandedID: UUID? = nil

    private enum Tab: Hashable { case pitchers, hitters, tomorrow }

    private var tomorrowEST: String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "America/New_York")
        guard let d = f.date(from: todayEST),
              let next = Calendar.current.date(byAdding: .day, value: 1, to: d) else { return todayEST }
        return f.string(from: next)
    }

    private func rowSlateDay(_ s: Signal) -> String? {
        guard let base = s.slateDate else { return nil }
        guard s.reg?.day == "tomorrow" else { return base }
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "America/New_York")
        guard let d = f.date(from: base),
              let next = Calendar.current.date(byAdding: .day, value: 1, to: d) else { return base }
        return f.string(from: next)
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
    private var rows: [Signal] { Array(rowsFor(activeTab).prefix(8)) }

    var body: some View {
        VStack(spacing: 0) {
            if availableTabs.count >= 2 { tabStrip }
            ForEach(Array(rows.enumerated()), id: \.element.id) { i, s in
                row(i, s)
                if i < rows.count - 1 { HubRule(inset: 52) }
            }
        }
    }

    private func label(_ t: Tab) -> String {
        switch t {
        case .pitchers: return "Tonight"
        case .hitters:  return "Hitters"
        case .tomorrow: return "Tomorrow"
        }
    }

    private var tabStrip: some View {
        HStack(spacing: 20) {
            ForEach(availableTabs, id: \.self) { t in
                let on = t == activeTab
                Button { withAnimation(.easeInOut(duration: 0.15)) { tab = t; expandedID = nil } } label: {
                    HStack(spacing: 5) {
                        Text(label(t).uppercased()).font(HubFont.kicker(11)).tracking(1.3)
                        Text("\(rowsFor(t).count)").font(HubFont.data(10, .medium))
                    }
                    .foregroundStyle(on ? GaryColors.gold : .white.opacity(0.45))
                    .frame(minHeight: 30)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 18)
        .padding(.bottom, 2)
    }

    @ViewBuilder private func row(_ i: Int, _ s: Signal) -> some View {
        let expandable = s.reg != nil
        let expanded = expandedID == s.id
        VStack(spacing: 0) {
            Button {
                guard expandable else { onTap(s); return }
                if expanded {
                    if s.playerId != nil { onTap(s) }
                    else { withAnimation(.easeInOut(duration: 0.18)) { expandedID = nil } }
                } else {
                    withAnimation(.easeInOut(duration: 0.18)) { expandedID = s.id }
                }
            } label: {
                HStack(spacing: 12) {
                    Text("\(i + 1)")
                        .font(HubFont.data(12, .medium))
                        .foregroundStyle(.white.opacity(0.45))
                        .frame(width: 18, alignment: .leading)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(HubFmt.subject(s.headline))
                            .font(HubFont.body(15, .semibold))
                            .foregroundStyle(.white.opacity(0.95))
                            .lineLimit(1).minimumScaleFactor(0.65)
                        Text(s.game.uppercased())
                            .font(HubFont.data(9, .medium))
                            .foregroundStyle(.white.opacity(0.5))
                    }
                    Spacer(minLength: 6)
                    if s.spark.count >= 2 { gapBar(s.spark[0], s.spark[1]) }
                    Text(s.value)
                        .font(HubFont.data(15))
                        .foregroundStyle(s.tone.color)
                        .frame(width: 48, alignment: .trailing)
                }
                .padding(.horizontal, 18).padding(.vertical, 10)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if expanded, let r = s.reg { detail(s, r) }
        }
    }

    @ViewBuilder private func detail(_ s: Signal, _ r: SwapMeta) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            // Only the sentences the row DOESN'T already say (the row carries
            // the gap bar + xERA; a verdict clause re-reading them is noise).
            if let v = r.verdict, !v.isEmpty {
                let fresh = v.components(separatedBy: ". ")
                    .filter { !(s.value.isEmpty == false && $0.contains(s.value)) }
                    .joined(separator: ". ")
                if !fresh.isEmpty {
                    Text(fresh.hasSuffix(".") ? fresh : fresh + ".")
                        .font(HubFont.body(12.5))
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
            if s.playerId != nil {
                HStack(spacing: 5) {
                    Text("TAP AGAIN FOR THE FULL PROFILE")
                        .font(HubFont.kicker(9.5)).tracking(1)
                        .foregroundStyle(GaryColors.gold.opacity(0.9))
                    Image(systemName: "arrow.right")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundStyle(GaryColors.gold.opacity(0.9))
                }
            }
        }
        .padding(.leading, 48).padding(.trailing, 18).padding(.bottom, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func stat(_ label: String, _ value: String, tint: Color = Color.white.opacity(0.92)) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased()).font(HubFont.kicker(8.5)).tracking(0.6).foregroundStyle(.white.opacity(0.5))
            Text(value).font(HubFont.data(12)).foregroundStyle(tint)
        }
    }

    /// The gap IS the read: a diverging bar from a center baseline. Left/red =
    /// outperforming (due to regress), right/green = underperforming (due to
    /// bounce back). Length scales with magnitude.
    private func gapBar(_ era: Double, _ xera: Double) -> some View {
        let gap = era - xera
        let W: CGFloat = 88
        let half = W / 2
        let len = min(CGFloat(abs(gap) / 2.0), 1.0) * (half - 4)
        let toRight = gap > 0
        return ZStack(alignment: .center) {
            Capsule().fill(Color.white.opacity(0.07)).frame(width: W, height: 6)
            Rectangle().fill(Color.white.opacity(0.22)).frame(width: 1.5, height: 13)
            Capsule().fill(toRight ? HubPalette.green : HubPalette.red)
                .frame(width: max(4, len), height: 6)
                .offset(x: toRight ? len / 2 : -len / 2)
        }
        .frame(width: W, alignment: .center)
    }
}

// MARK: - Streak Watch

fileprivate struct HubStreakWatch: View {
    let rows: [StreakRow]
    var onTapGame: (String) -> Void = { _ in }

    /// Tonight's actionable streaks lead; longest runs break ties; directions
    /// interleave so a lopsided night still shows both sides near the top.
    private var ordered: [StreakRow] {
        func sortDir(_ rows: [StreakRow]) -> [StreakRow] {
            rows.sorted {
                let (a, b) = ($0.next_game != nil, $1.next_game != nil)
                if a != b { return a }
                return ($0.length ?? 0) > ($1.length ?? 0)
            }
        }
        let positive: Set<String> = ["win", "over", "hit", "hr"]
        var pos = sortDir(rows.filter { positive.contains($0.kind ?? "") })
        var neg = sortDir(rows.filter { !positive.contains($0.kind ?? "") })
        var takePos = (pos.first?.length ?? -1) >= (neg.first?.length ?? -1)
        var out: [StreakRow] = []
        while !pos.isEmpty || !neg.isEmpty {
            if takePos, !pos.isEmpty { out.append(pos.removeFirst()) }
            else if !neg.isEmpty { out.append(neg.removeFirst()) }
            else if !pos.isEmpty { out.append(pos.removeFirst()) }
            takePos.toggle()
        }
        return out
    }

    private func badge(_ r: StreakRow) -> (text: String, color: Color) {
        let n = r.length ?? 0
        switch r.kind {
        case "win":     return ("W\(n)", GaryColors.win)
        case "loss":    return ("L\(n)", GaryColors.loss)
        case "hit":     return ("\(n) GM", GaryColors.gold)
        case "hr":      return ("HR ×\(n)", GaryColors.gold)
        case "hitless": return ("0-\(n)", GaryColors.loss)
        case "over":    return ("O ×\(n)", GaryColors.win)
        case "under":   return ("U ×\(n)", GaryColors.loss)
        default:        return ("\(n)", .white.opacity(0.6))
        }
    }

    private func cleanDetail(_ r: StreakRow, badgeText: String) -> String? {
        guard var d = r.detail, !d.isEmpty else { return nil }
        for sep in [" — ", " - "] where d.hasPrefix(badgeText + sep) {
            d = String(d.dropFirst(badgeText.count + sep.count))
        }
        return d.isEmpty ? nil : d
    }

    /// "AT METS · 7:10" + subject → "Cardinals @ Mets" for the Picks deep link.
    private func matchup(_ r: StreakRow) -> String? {
        guard let next = r.next_game, let team = r.team ?? r.subject else { return nil }
        let head = next.components(separatedBy: "·").first?
            .trimmingCharacters(in: .whitespaces) ?? ""
        let up = head.uppercased()
        let opp: String
        let homeGame: Bool
        if up.hasPrefix("AT ") { opp = String(head.dropFirst(3)); homeGame = false }
        else if up.hasPrefix("VS ") { opp = String(head.dropFirst(3)); homeGame = true }
        else { return nil }
        guard !opp.isEmpty else { return nil }
        return homeGame ? "\(opp) @ \(team)" : "\(team) @ \(opp)"
    }

    @State private var showAll = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            let all = ordered
            let shown = showAll ? all : Array(all.prefix(10))
            ForEach(Array(shown.enumerated()), id: \.offset) { i, r in
                streakRow(r)
                if i < shown.count - 1 { HubRule(inset: 76) }
            }
            if all.count > 10 {
                HubSeeAllButton(isOpen: showAll, total: all.count) {
                    withAnimation(.easeInOut(duration: 0.2)) { showAll.toggle() }
                }
                .padding(.top, 10)
            }
        }
    }

    @ViewBuilder private func streakRow(_ r: StreakRow) -> some View {
        let b = badge(r)
        let game = matchup(r)
        let row = HStack(spacing: 12) {
            Text(b.text)
                .font(HubFont.data(13))
                .foregroundStyle(b.color)
                .lineLimit(1).minimumScaleFactor(0.7)
                .frame(width: 46, alignment: .leading)
            VStack(alignment: .leading, spacing: 3) {
                Text(r.subject ?? "")
                    .font(HubFont.body(14, .semibold))
                    .foregroundStyle(.white.opacity(0.92))
                    .lineLimit(1)
                if let d = cleanDetail(r, badgeText: b.text) {
                    Text(d)
                        .font(HubFont.body(11.5))
                        .foregroundStyle(.white.opacity(0.62))
                        .lineLimit(1).minimumScaleFactor(0.8)
                }
            }
            Spacer(minLength: 8)
            if let next = r.next_game, !next.isEmpty {
                Text(next.uppercased())
                    .font(HubFont.data(9.5, .semibold))
                    .foregroundStyle(GaryColors.gold.opacity(0.9))
                    .lineLimit(1).minimumScaleFactor(0.75)
                if game != nil {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.4))
                }
            }
        }
        .padding(.horizontal, 18).padding(.vertical, 10)
        if let game {
            Button { onTapGame(game) } label: { row.contentShape(Rectangle()) }
                .buttonStyle(.plain)
        } else {
            row
        }
    }
}

// MARK: - The Beats

/// A beat: section head + top rows + "See all n". Rows keep the feed's
/// relevance order; each carries its own lane kicker and special shape
/// (swap / tug-of-war / first-inning dots) when its meta calls for one.
fileprivate struct HubBeatSection: View {
    let anchor: String
    let title: String
    let rows: [Signal]
    @Binding var openBeats: Set<String>
    let kickerFor: (Signal) -> String
    let onRow: (Signal) -> Void
    let onProfile: (Signal) -> Void

    private var isOpen: Bool { openBeats.contains(anchor) }
    private let topCount = 4

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HubHead(title: title, count: rows.count)
            HubBeatList(rows: isOpen ? rows : Array(rows.prefix(topCount)),
                        open: isOpen, kickerFor: kickerFor, onRow: onRow, onProfile: onProfile)
            if rows.count > topCount {
                HubSeeAllButton(isOpen: isOpen, total: rows.count) {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        if isOpen { openBeats.remove(anchor) } else { openBeats.insert(anchor) }
                    }
                }
            }
        }
    }
}

fileprivate struct HubBeatList: View {
    let rows: [Signal]
    var open: Bool = false
    let kickerFor: (Signal) -> String
    let onRow: (Signal) -> Void
    let onProfile: (Signal) -> Void

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.element.id) { i, s in
                Group {
                    if s.swap != nil {
                        HubSwapRow(s: s) { onRow(s) }
                    } else if s.h2h != nil {
                        HubTugRow(s: s) { onRow(s) }
                    } else if s.nrfi != nil {
                        HubDotsRow(s: s, kicker: kickerFor(s)) { onRow(s) }
                    } else {
                        HubStoryRow(s: s, kicker: kickerFor(s), expandable: true,
                                    onTap: { onRow(s) },
                                    onProfile: s.playerId != nil ? { onProfile(s) } : nil)
                    }
                }
                if i < rows.count - 1 { HubRule(inset: 18) }
            }
        }
    }
}

/// The default beat row: kicker + story + tone value, tap to expand the read.
fileprivate struct HubStoryRow: View {
    let s: Signal
    let kicker: String
    var expandable: Bool = true
    /// Rows that NAVIGATE on tap (Game Intel fullscreen, search results) show
    /// a trailing chevron; expandable rows carry the chevron.down instead.
    var showsChevron: Bool = false
    let onTap: () -> Void
    let onProfile: (() -> Void)?
    @State private var expanded = false

    /// Body text with the headline/value echo stripped (shared helper).
    private var dedupedDetail: String { hubDedupedDetail(s) }

    var body: some View {
        Button {
            if expandable, !dedupedDetail.isEmpty {
                withAnimation(.easeInOut(duration: 0.18)) { expanded.toggle() }
            } else {
                onTap()
            }
        } label: {
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 8) {
                    HubKicker(text: kicker, size: 9.5, color: GaryColors.gold.opacity(0.9))
                    Spacer(minLength: 6)
                    Text(s.game.uppercased())
                        .font(HubFont.data(10, .medium))
                        .foregroundStyle(.white.opacity(0.62))
                        .lineLimit(1)
                }
                HStack(alignment: .top, spacing: 10) {
                    Text(s.headline)
                        .font(HubFont.body(14.5, .semibold))
                        .foregroundStyle(.white.opacity(0.95))
                        .lineLimit(expanded ? nil : 2)
                        .fixedSize(horizontal: false, vertical: true)
                        .multilineTextAlignment(.leading)
                    Spacer(minLength: 6)
                    if let v = s.displayValue {
                        Text(v)
                            .font(HubFont.data(15))
                            .foregroundStyle(s.tone.color)
                            .lineLimit(1)
                    }
                    if expandable, !dedupedDetail.isEmpty {
                        Image(systemName: "chevron.down")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundStyle(.white.opacity(0.4))
                            .rotationEffect(.degrees(expanded ? 180 : 0))
                            .padding(.top, 4)
                    } else if showsChevron {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.35))
                            .padding(.top, 4)
                    }
                }
                if expanded {
                    Text(dedupedDetail)
                        .font(HubFont.body(13))
                        .foregroundStyle(.white.opacity(0.75))
                        .lineSpacing(2)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 2)
                    if let onProfile {
                        Button(action: onProfile) {
                            HStack(spacing: 5) {
                                Text("FULL PROFILE")
                                    .font(HubFont.kicker(10)).tracking(1.1)
                                    .foregroundStyle(GaryColors.gold)
                                Image(systemName: "arrow.right")
                                    .font(.system(size: 8, weight: .bold))
                                    .foregroundStyle(GaryColors.gold)
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .padding(.top, 4)
                    }
                }
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 11)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// Injury swap: the OUT player struck through, tonight's replacement below.
fileprivate struct HubSwapRow: View {
    let s: Signal
    let onTap: () -> Void

    var body: some View {
        if let swap = s.swap {
            Button(action: onTap) {
                VStack(alignment: .leading, spacing: 7) {
                    HStack(spacing: 8) {
                        HubKicker(text: "Replacement", size: 9.5, color: GaryColors.gold.opacity(0.9))
                        if let t = swap.team {
                            Text(t.uppercased())
                                .font(HubFont.data(9, .medium))
                                .foregroundStyle(.white.opacity(0.62))
                        }
                        Spacer(minLength: 6)
                        Text(s.game.uppercased())
                            .font(HubFont.data(9, .medium))
                            .foregroundStyle(.white.opacity(0.5))
                            .lineLimit(1)
                    }
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Image(systemName: "xmark")
                            .font(.system(size: 9, weight: .heavy))
                            .foregroundStyle(HubPalette.red)
                            .frame(width: 14)
                        Text(swap.out_name ?? "—")
                            .font(HubFont.body(14, .semibold))
                            .strikethrough(true, color: HubPalette.red.opacity(0.7))
                            .foregroundStyle(.white.opacity(0.55))
                            .lineLimit(1)
                        Spacer(minLength: 6)
                        if let note = swap.out_note, !note.isEmpty {
                            Text(note)
                                .font(HubFont.body(10.5, .medium))
                                .foregroundStyle(HubPalette.red.opacity(0.85))
                                .lineLimit(1).minimumScaleFactor(0.8)
                        }
                    }
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Image(systemName: "checkmark")
                            .font(.system(size: 9, weight: .heavy))
                            .foregroundStyle(HubPalette.green)
                            .frame(width: 14)
                        Text(swap.in_name ?? "—")
                            .font(HubFont.body(15, .bold))
                            .foregroundStyle(.white)
                            .lineLimit(1)
                        Spacer(minLength: 6)
                        if let note = swap.in_note, !note.isEmpty {
                            Text(note)
                                .font(HubFont.data(9.5, .semibold))
                                .foregroundStyle(HubPalette.green)
                                .lineLimit(1).minimumScaleFactor(0.8)
                        }
                    }
                }
                .padding(.horizontal, 18).padding(.vertical, 11)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }
}

/// Season-series dominance as a tug-of-war bar + the last meeting.
fileprivate struct HubTugRow: View {
    let s: Signal
    let onTap: () -> Void
    private let green = Color(hex: "#63D17E")

    var body: some View {
        let h = s.h2h
        let wins = max(h?.wins ?? 0, 0)
        let losses = max(h?.losses ?? 0, 0)
        let total = max(wins + losses, 1)
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    HubKicker(text: "Head-To-Head", size: 9.5, color: GaryColors.gold.opacity(0.9))
                    Spacer(minLength: 6)
                    Text(s.game.uppercased())
                        .font(HubFont.data(10, .medium))
                        .foregroundStyle(.white.opacity(0.62))
                }
                HStack(spacing: 6) {
                    Text(h?.dominant_name ?? "Team")
                        .font(HubFont.body(14, .semibold)).foregroundStyle(.white)
                    Text("own \(h?.opponent_name ?? "the series")")
                        .font(HubFont.body(13)).foregroundStyle(.white.opacity(0.62)).lineLimit(1)
                    Spacer(minLength: 6)
                    Text("\(wins)-\(losses)")
                        .font(HubFont.data(14)).foregroundStyle(green)
                }
                GeometryReader { geo in
                    let w = max(geo.size.width * CGFloat(wins) / CGFloat(total), 30)
                    HStack(spacing: 0) {
                        Text("\(h?.dominant ?? "") \(wins)")
                            .font(HubFont.data(9.5, .semibold)).foregroundStyle(Color(hex: "#0B160C"))
                            .padding(.leading, 8)
                            .frame(width: w, height: 18, alignment: .leading)
                            .background(LinearGradient(colors: [green.opacity(0.9), green.opacity(0.5)], startPoint: .leading, endPoint: .trailing))
                        Text("\(h?.opponent ?? "") \(losses)")
                            .font(HubFont.data(9.5, .semibold)).foregroundStyle(.white.opacity(0.62))
                            .frame(maxWidth: .infinity, alignment: .trailing).padding(.trailing, 8)
                            .frame(height: 18)
                            .background(Color.white.opacity(0.08))
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
                }
                .frame(height: 18)
                if let last = h?.last_meeting, let score = last.score {
                    Text(last.revenge == true
                         ? "\(h?.opponent ?? "") took the last meeting \(score) — revenge spot"
                         : "\(h?.dominant ?? "") won the last meeting \(score)")
                        .font(HubFont.body(11)).foregroundStyle(.white.opacity(0.62))
                }
            }
            .padding(.horizontal, 18).padding(.vertical, 11)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// First-inning (NRFI/YRFI): recent first innings as scoreless-vs-run dots.
fileprivate struct HubDotsRow: View {
    let s: Signal
    let kicker: String
    let onTap: () -> Void
    private let green = Color(hex: "#3FB950")
    private let red = Color(hex: "#E5614D")

    var body: some View {
        let m = s.nrfi
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    HubKicker(text: kicker, size: 9.5, color: GaryColors.gold.opacity(0.9))
                    Spacer(minLength: 6)
                    Text(s.game.uppercased())
                        .font(HubFont.data(10, .medium))
                        .foregroundStyle(.white.opacity(0.62))
                }
                Text(s.headline)
                    .font(HubFont.body(14, .semibold)).foregroundStyle(.white.opacity(0.95))
                    .lineLimit(2).fixedSize(horizontal: false, vertical: true)
                    .multilineTextAlignment(.leading)
                if let teamSeq = m?.team_seq {
                    dotRow(m?.team_abbr ?? "", teamSeq)
                } else {
                    dotRow(m?.away_abbr ?? "", m?.away_seq ?? [])
                    dotRow(m?.home_abbr ?? "", m?.home_seq ?? [])
                }
            }
            .padding(.horizontal, 18).padding(.vertical, 11)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder private func dotRow(_ abbr: String, _ seq: [Int]) -> some View {
        HStack(spacing: 4) {
            Text(abbr)
                .font(HubFont.data(9.5, .semibold)).foregroundStyle(.white.opacity(0.62))
                .frame(width: 34, alignment: .leading)
            ForEach(Array(seq.enumerated()), id: \.offset) { _, v in
                Circle().fill(v == 0 ? green.opacity(0.85) : red.opacity(0.5)).frame(width: 7, height: 7)
            }
            Spacer(minLength: 6)
            Text("\(seq.filter { $0 == 0 }.count)/\(seq.count) clean")
                .font(HubFont.data(9, .medium)).foregroundStyle(.white.opacity(0.55))
        }
    }
}

// MARK: - Fantasy Corner

fileprivate struct HubFantasyCorner: View {
    let signals: [Signal]
    let onTap: (Signal) -> Void

    private var pitchers: [Signal] { signals.filter { ($0.fantasy?.role ?? "") == "SP" } }
    private var hitters: [Signal] { signals.filter { ($0.fantasy?.role ?? "") == "HITTER" } }

    var body: some View {
        // ONE column, two groups (Jul 5 founder fix: side-by-side columns
        // with 4 pitchers vs 10 hitters stretched a half-screen void under
        // the short column). Stat rides the right edge; rows tightened.
        VStack(alignment: .leading, spacing: 14) {
            group("Pitchers", pitchers, stat: GaryColors.gold)
            group("Hitters", hitters, stat: HubPalette.green)
        }
        .padding(.horizontal, 18)
    }

    @ViewBuilder private func group(_ title: String, _ items: [Signal], stat: Color) -> some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                HubKicker(text: title, size: 10, color: .white.opacity(0.62))
                    .padding(.bottom, 4)
                ForEach(Array(items.enumerated()), id: \.element.id) { i, s in
                    Button { onTap(s) } label: { row(s, stat: stat) }.buttonStyle(.plain)
                    if i < items.count - 1 { HubRule() }
                }
            }
        }
    }

    @ViewBuilder private func row(_ s: Signal, stat: Color) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 5) {
                    Text(s.headline)
                        .font(HubFont.body(13.5, .semibold)).foregroundStyle(.white.opacity(0.95))
                        .lineLimit(1).minimumScaleFactor(0.7)
                    if let pos = s.fantasy?.position, !pos.isEmpty, pos != "SP" {
                        Text(pos)
                            .font(HubFont.data(8.5, .semibold)).foregroundStyle(.white.opacity(0.55))
                    }
                }
                Text(s.fantasy?.reason ?? s.detail)
                    .font(HubFont.body(11)).foregroundStyle(.white.opacity(0.62))
                    .lineLimit(1)
                    .multilineTextAlignment(.leading)
            }
            Spacer(minLength: 8)
            Text(s.value)
                .font(HubFont.data(14)).foregroundStyle(stat)
                .lineLimit(1).minimumScaleFactor(0.7)
        }
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }
}

// MARK: - Last Night board

fileprivate struct HubNightBoard: View {
    let rows: [NightHighlightRow]
    @State private var tab = 0
    @State private var showAll = false

    private var present: [(key: String, label: String, noun: String)] {
        NightBoard.cats.filter { c in rows.contains { $0.category == c.key } }
    }

    private static func lead(_ d: String?) -> Int {
        Int((d ?? "").prefix(while: { $0.isNumber })) ?? 0
    }

    private var visible: [NightHighlightRow] {
        guard !present.isEmpty else { return [] }
        let key = present[min(tab, present.count - 1)].key
        return rows.filter { $0.category == key }.sorted {
            let (a, b) = (Self.lead($0.detail), Self.lead($1.detail))
            if a != b { return a > b }
            return ($0.gary_result != nil) && ($1.gary_result == nil)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if present.count > 1 {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 20) {
                        ForEach(Array(present.enumerated()), id: \.offset) { i, c in
                            let on = i == tab
                            Button { withAnimation(.easeInOut(duration: 0.15)) { tab = i; showAll = false } } label: {
                                Text(c.label.uppercased())
                                    .font(HubFont.kicker(11)).tracking(1.3)
                                    .foregroundStyle(on ? GaryColors.gold : .white.opacity(0.45))
                                    .frame(minHeight: 28)
                                    .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 18)
                }
            }
            VStack(alignment: .leading, spacing: 0) {
                let shown = showAll ? visible : Array(visible.prefix(12))
                ForEach(Array(shown.enumerated()), id: \.offset) { i, r in
                    boardRow(r)
                    if i < shown.count - 1 { HubRule(inset: 18) }
                }
                if visible.count > 12 {
                    HubSeeAllButton(isOpen: showAll, total: visible.count) {
                        withAnimation(.easeInOut(duration: 0.2)) { showAll.toggle() }
                    }
                    .padding(.top, 10)
                }
            }
        }
    }

    private func boardRow(_ r: NightHighlightRow) -> some View {
        HStack(spacing: 8) {
            Text(NightBoard.shortPlayer(r.player_name))
                .font(HubFont.body(13.5, .semibold))
                .foregroundStyle(.white.opacity(0.92))
                .lineLimit(1).minimumScaleFactor(0.7)
                .frame(width: 108, alignment: .leading)
            Text(HomeView.shortTeam(r.team).uppercased())
                .font(HubFont.data(10, .semibold))
                .foregroundStyle(TeamColors.color(for: r.team) ?? .white.opacity(0.5))
                .lineLimit(1).minimumScaleFactor(0.7)
                .frame(width: 62, alignment: .leading)
            Text(r.detail ?? "")
                .font(HubFont.data(11, .semibold))
                .foregroundStyle(.white.opacity(0.92))
                .lineLimit(1).minimumScaleFactor(0.75)
                .frame(maxWidth: .infinity, alignment: .trailing)
            Group {
                switch r.gary_result {
                case "won":  Text("✓").foregroundStyle(GaryColors.win)
                case "lost": Text("✗").foregroundStyle(GaryColors.loss)
                default:     Text("–").foregroundStyle(.white.opacity(0.4))
                }
            }
            .font(.system(size: 11, weight: .bold))
            .frame(width: 20, alignment: .center)
        }
        .padding(.vertical, 9).padding(.horizontal, 18)
    }
}

// MARK: - The Receipts

fileprivate struct HubReceipts: View {
    let signals: [Signal]
    let onTap: (Signal) -> Void
    @State private var showAll = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            let shown = showAll ? signals : Array(signals.prefix(12))
            ForEach(Array(shown.enumerated()), id: \.element.id) { i, s in
                Button { onTap(s) } label: { row(s) }.buttonStyle(.plain)
                if i < shown.count - 1 { HubRule(inset: 18) }
            }
            if signals.count > 12 {
                HubSeeAllButton(isOpen: showAll, total: signals.count) {
                    withAnimation(.easeInOut(duration: 0.2)) { showAll.toggle() }
                }
                .padding(.top, 10)
            }
        }
    }

    @ViewBuilder private func row(_ s: Signal) -> some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                HubKicker(text: s.kind.chip, size: 9, color: GaryColors.gold.opacity(0.75))
                Text(s.headline)
                    .font(HubFont.body(13))
                    .foregroundStyle(.white.opacity(0.88))
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                if let note = s.resultNote, !note.isEmpty {
                    Text(note)
                        .font(HubFont.data(10.5, .medium))
                        .foregroundStyle(.white.opacity(0.62))
                        .lineLimit(1).minimumScaleFactor(0.85)
                }
            }
            Spacer(minLength: 8)
            Text(s.result == "hit" ? "HIT" : s.result == "push" ? "PUSH" : "MISS")
                .font(HubFont.data(10))
                .foregroundStyle(s.result == "hit" ? GaryColors.win
                                 : s.result == "push" ? GaryColors.gold
                                 : GaryColors.loss)
                .padding(.top, 2)
            Image(systemName: "chevron.right")
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.white.opacity(0.25))
                .padding(.top, 4)
        }
        .padding(.horizontal, 18).padding(.vertical, 10)
        .contentShape(Rectangle())
    }
}

// MARK: - Game sheet (slate-strip tap)

/// Everything the Hub knows about one slate game, in place: status/score,
/// the lines, every edge touching the matchup, streaks on the line — with
/// Picks as a CTA at the bottom instead of a forced tab jump.
fileprivate struct HubGameSheet: View {
    let row: TomorrowBoardRow
    let edges: [Signal]
    let streaks: [StreakRow]
    let kickerFor: (Signal) -> String
    var onClose: () -> Void = {}
    let onViewGame: (String) -> Void
    @ObservedObject private var live = LiveScoreCache.shared
    @State private var detailSignal: Signal? = nil
    @State private var breakdownSignal: Signal? = nil

    private var abbrMatchup: String {
        "\(hubSideLabel(row.away_abbr, row.away_team)) @ \(hubSideLabel(row.home_abbr, row.home_team))"
    }
    private var ls: LiveScore? {
        live.status(forMatchup: "\(row.away_team ?? "") @ \(row.home_team ?? "")")
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 22) {
                header
                if edges.isEmpty {
                    Text("No edges posted for this game yet — they land as lineups and matchups firm up.")
                        .font(HubFont.body(12.5)).foregroundStyle(.white.opacity(0.62))
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 18)
                } else {
                    VStack(alignment: .leading, spacing: 4) {
                        HubHead(title: "The Edges", count: edges.count)
                        HubBeatList(rows: edges, open: true, kickerFor: kickerFor,
                                    onRow: { s in if s.playerId != nil { breakdownSignal = s } else { detailSignal = s } },
                                    onProfile: { breakdownSignal = $0 })
                    }
                }
                if !streaks.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        HubHead(title: "On the Line", count: streaks.count)
                        HubStreakWatch(rows: streaks, onTapGame: { g in onClose(); onViewGame(g) })
                    }
                }
                cta
            }
            .padding(.top, 26).padding(.bottom, 34)
        }
        .background(GaryColors.darkBg)
        .overlay {
            if let s = detailSignal {
                HubEdgeOverlay(signal: s,
                               onClose: { withAnimation(.spring(response: 0.3, dampingFraction: 0.88)) { detailSignal = nil } },
                               onViewGame: { g in
                                   detailSignal = nil
                                   onClose()
                                   onViewGame(g)
                               })
                    .transition(.opacity.combined(with: .scale(scale: 0.94)))
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.88), value: detailSignal?.id)
        .sheet(item: $breakdownSignal) { PlayerInsightSheet(signal: $0) }
    }

    private func fmtML(_ v: Double) -> String { v > 0 ? "+\(Int(v))" : "\(Int(v))" }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            if ls?.isLive == true {
                HubKicker(text: "Live", size: 10.5, color: GaryColors.win)
            } else if ls?.isFinal == true {
                HubKicker(text: "Final", size: 10.5, color: .white.opacity(0.62))
            } else {
                HubKicker(text: "Tonight", size: 10.5, color: GaryColors.gold)
            }
            Text("\(row.away_team ?? hubSideLabel(row.away_abbr, nil)) @ \(row.home_team ?? hubSideLabel(row.home_abbr, nil))")
                .font(HubFont.display(24))
                .foregroundStyle(GaryColors.warmWhite)
                .fixedSize(horizontal: false, vertical: true)
            if let ls, ls.isLive || ls.isFinal {
                HStack(spacing: 10) {
                    Text(ls.scoreLine ?? "")
                        .font(HubFont.data(15))
                        .foregroundStyle(.white.opacity(0.95))
                    if ls.isLive, let det = ls.detail, !det.isEmpty {
                        Text("▶ \(det.uppercased())")
                            .font(HubFont.data(11, .medium))
                            .foregroundStyle(GaryColors.win)
                    }
                }
            } else {
                HStack(spacing: 8) {
                    Text(TomorrowView.etTime(row.commence_time))
                        .font(HubFont.data(11, .medium))
                        .foregroundStyle(.white.opacity(0.7))
                    if let v = row.venue, !v.isEmpty {
                        Text(v).font(HubFont.body(11.5)).foregroundStyle(.white.opacity(0.62)).lineLimit(1)
                    }
                }
                // The lines, quietly (meta, never the headline).
                HStack(spacing: 18) {
                    if let t = row.total { numberStat("O/U", HubFmt.stat(t)) }
                    if let sp = row.spread {
                        numberStat("Spread \(hubSideLabel(row.home_abbr, row.home_team))", HubFmt.stat(sp))
                    }
                    if let mh = row.ml_home, let ma = row.ml_away {
                        numberStat("ML", "\(hubSideLabel(row.home_abbr, row.home_team)) \(fmtML(mh)) · \(hubSideLabel(row.away_abbr, row.away_team)) \(fmtML(ma))")
                    }
                }
                .padding(.top, 4)
            }
        }
        .padding(.horizontal, 18)
    }

    private func numberStat(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased()).font(HubFont.kicker(8.5)).tracking(0.6).foregroundStyle(.white.opacity(0.5))
            Text(value).font(HubFont.data(12)).foregroundStyle(.white.opacity(0.92))
        }
    }

    private var cta: some View {
        Button { onClose(); onViewGame(abbrMatchup) } label: {
            HStack(spacing: 6) {
                Text("VIEW GAME ON PICKS")
                Image(systemName: "arrow.right")
            }
            .font(HubFont.data(12))
            .foregroundStyle(GaryColors.ink)
            .frame(maxWidth: .infinity).padding(.vertical, 13)
            .background(Capsule().fill(GaryColors.gold))
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 18)
        .padding(.top, 4)
    }
}

// MARK: - Edge overlay (centered — founder: nothing pulls up from the bottom)

/// A tapped edge, as a centered card over the dimmed page: kicker + game,
/// the headline once, the value only when it isn't already in the headline,
/// and only the sentences the row didn't say. VIEW GAME → Picks.
fileprivate struct HubEdgeOverlay: View {
    let signal: Signal
    let onClose: () -> Void
    let onViewGame: (String) -> Void

    private var isMatchup: Bool {
        let g = signal.game.lowercased()
        return g.contains("@") || g.contains(" vs ") || g.contains(" v ")
    }

    var body: some View {
        ZStack {
            Color.black.opacity(0.62).ignoresSafeArea()
                .onTapGesture { onClose() }
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    HubKicker(text: signal.kind.chip, size: 10.5)
                    Spacer()
                    if let r = signal.result {
                        Text(r == "hit" ? "CASHED" : r == "push" ? "PUSH" : "LOST")
                            .font(HubFont.data(10.5))
                            .foregroundStyle(r == "hit" ? GaryColors.win : r == "push" ? GaryColors.gold : GaryColors.loss)
                    }
                    Button(action: onClose) {
                        Image(systemName: "xmark")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(.white.opacity(0.6))
                            .frame(width: 30, height: 30)
                            .background(Circle().fill(Color.white.opacity(0.08)))
                    }
                    .buttonStyle(.plain)
                }
                Text(signal.game.uppercased())
                    .font(HubFont.data(10, .medium))
                    .foregroundStyle(.white.opacity(0.62))
                Text(signal.headline)
                    .font(HubFont.display(21))
                    .foregroundStyle(GaryColors.warmWhite)
                    .fixedSize(horizontal: false, vertical: true)
                if !signal.valueEchoesHeadline, !signal.value.isEmpty {
                    Text(signal.value)
                        .font(HubFont.data(30))
                        .foregroundStyle(signal.tone.color)
                }
                let body = hubDedupedDetail(signal)
                if !body.isEmpty {
                    Text(body)
                        .font(HubFont.body(14))
                        .foregroundStyle(.white.opacity(0.8))
                        .lineSpacing(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let note = signal.resultNote, !note.isEmpty {
                    Text(note)
                        .font(HubFont.data(11, .medium))
                        .foregroundStyle(.white.opacity(0.7))
                }
                if isMatchup {
                    Button { onViewGame(signal.game) } label: {
                        HStack(spacing: 6) {
                            Text("VIEW GAME")
                            Image(systemName: "arrow.right")
                        }
                        .font(HubFont.data(12))
                        .foregroundStyle(GaryColors.ink)
                        .frame(maxWidth: .infinity).padding(.vertical, 12)
                        .background(Capsule().fill(GaryColors.gold))
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 4)
                }
            }
            .padding(18)
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(Color(hex: "#141210"))
                    .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .stroke(GaryColors.gold.opacity(0.3), lineWidth: 1))
                    .shadow(color: .black.opacity(0.6), radius: 28, y: 12)
            )
            .padding(.horizontal, 26)
        }
    }
}

// MARK: - Search results

fileprivate struct HubSearchResults: View {
    let query: String
    let edges: [Signal]
    let receipts: [Signal]
    let streaks: [StreakRow]
    let night: [NightHighlightRow]
    let nightLabel: String
    let onEdge: (Signal) -> Void

    var body: some View {
        let q = query.lowercased()
        func hits(_ s: Signal) -> Bool {
            s.headline.lowercased().contains(q)
                || s.detail.lowercased().contains(q)
                || s.game.lowercased().contains(q)
                || s.value.lowercased().contains(q)
                || s.kind.chip.lowercased().contains(q)
        }
        let edgeMatches = edges.filter { hits($0) && $0.result == nil }
        let receiptMatches = receipts.filter(hits)
        let streakMatches = streaks.filter {
            ($0.subject ?? "").lowercased().contains(q)
                || ($0.team ?? "").lowercased().contains(q)
                || ($0.detail ?? "").lowercased().contains(q)
        }
        let nightMatches = night.filter {
            ($0.player_name ?? "").lowercased().contains(q)
                || ($0.team ?? "").lowercased().contains(q)
        }
        let total = edgeMatches.count + receiptMatches.count + streakMatches.count + nightMatches.count
        return Group {
            if total == 0 {
                VStack(spacing: 8) {
                    Text("No matches")
                        .font(HubFont.display(15, .bold))
                        .foregroundStyle(.white.opacity(0.7))
                    Text("Try a player, a team, or a lane like \"platoon\".")
                        .font(HubFont.body(12)).foregroundStyle(.white.opacity(0.62))
                }
                .frame(maxWidth: .infinity).padding(.top, 40)
            } else {
                VStack(alignment: .leading, spacing: 22) {
                    if !edgeMatches.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            HubHead(title: "Edges", count: edgeMatches.count)
                            VStack(spacing: 0) {
                                ForEach(edgeMatches) { s in
                                    HubStoryRow(s: s, kicker: s.kind.chip, expandable: false,
                                                showsChevron: true,
                                                onTap: { onEdge(s) }, onProfile: nil)
                                    HubRule(inset: 18)
                                }
                            }
                        }
                    }
                    if !receiptMatches.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            HubHead(title: "Receipts", count: receiptMatches.count)
                            HubReceipts(signals: receiptMatches) { onEdge($0) }
                        }
                    }
                    if !streakMatches.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            HubHead(title: "Streaks", count: streakMatches.count)
                            VStack(spacing: 0) {
                                ForEach(Array(streakMatches.enumerated()), id: \.offset) { i, r in
                                    auxRow(title: r.subject ?? "", sub: r.detail ?? "", trail: r.next_game ?? "")
                                    if i < streakMatches.count - 1 { HubRule(inset: 18) }
                                }
                            }
                        }
                    }
                    if !nightMatches.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            HubHead(title: nightLabel, count: nightMatches.count)
                            VStack(spacing: 0) {
                                ForEach(Array(nightMatches.enumerated()), id: \.offset) { i, r in
                                    auxRow(title: r.player_name ?? "", sub: r.detail ?? "", trail: r.team ?? "")
                                    if i < nightMatches.count - 1 { HubRule(inset: 18) }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private func auxRow(title: String, sub: String, trail: String) -> some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(HubFont.body(13.5, .semibold)).foregroundStyle(.white).lineLimit(1)
                if !sub.isEmpty {
                    Text(sub).font(HubFont.body(11)).foregroundStyle(.white.opacity(0.62)).lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            if !trail.isEmpty {
                Text(trail.uppercased())
                    .font(HubFont.data(9, .medium))
                    .foregroundStyle(.white.opacity(0.5)).lineLimit(1)
            }
        }
        .padding(.horizontal, 18).padding(.vertical, 10)
    }
}
