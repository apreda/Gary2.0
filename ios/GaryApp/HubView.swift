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

/// Internal (not fileprivate): the Picks masthead re-uses this exact ramp —
/// founder, Jul 22: the Hub's upper part is the model for the Picks page.
enum HubFont {
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
        .system(size: size, weight: .semibold).monospacedDigit()
    }
    /// Data numerals — system face with tabular digits (mono retired Jul 12).
    static func data(_ size: CGFloat, _ weight: Font.Weight = .bold) -> Font {
        .system(size: max(12, size * 1.18), weight: weight).monospacedDigit()
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
                    .font(HubFont.kicker(13.5)).tracking(1.6)
                    .foregroundStyle(GaryColors.gold)
                if let count, count > 0 {
                    Text("\(count)")
                        .font(HubFont.data(13))
                        .foregroundStyle(.white.opacity(0.7))
                }
                Spacer(minLength: 0)
                if let sub, !sub.isEmpty {
                    Text(sub.uppercased())
                        .font(HubFont.kicker(11)).tracking(0.8)
                        .foregroundStyle(.white.opacity(0.62))
                        .lineLimit(1)
                }
            }
        }
        .padding(.horizontal, 18)
    }
}

/// Value tint with market-direction correction: O/U streak values are
/// ANGLES (neither good nor bad) so they wear gold — the backend tone stays
/// hot/cold because the morning grader branches on it (functional, not
/// cosmetic). Everything else keeps its tone color.
func hubValueTint(_ s: Signal) -> Color {
    if s.kind == .streak, let first = s.value.first, first == "O" || first == "U" {
        return GaryColors.gold
    }
    return s.tone.color
}

/// Collapsed-by-default section (founder, Jul 30: the graded long-tail boards
/// fold away — the page leads with tonight's signals). Header mirrors
/// HubHead's grammar with a trailing chevron; the whole line toggles.
fileprivate struct HubCollapsible<Content: View>: View {
    let anchor: String
    @Binding var open: Set<String>
    let title: String
    var count: Int? = nil
    var sub: String? = nil
    @ViewBuilder let content: () -> Content

    private var isOpen: Bool { open.contains(anchor) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    if isOpen { open.remove(anchor) } else { open.insert(anchor) }
                }
            } label: {
                VStack(alignment: .leading, spacing: 8) {
                    Rectangle().fill(GaryColors.gold.opacity(0.25)).frame(height: 1)
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(title.uppercased())
                            .font(HubFont.kicker(13.5)).tracking(1.6)
                            .foregroundStyle(GaryColors.gold)
                        if let count, count > 0 {
                            Text("\(count)")
                                .font(HubFont.data(13))
                                .foregroundStyle(.white.opacity(0.7))
                        }
                        Spacer(minLength: 0)
                        if let sub, !sub.isEmpty {
                            Text(sub.uppercased())
                                .font(HubFont.kicker(11)).tracking(0.8)
                                .foregroundStyle(.white.opacity(0.62))
                                .lineLimit(1)
                        }
                        Image(systemName: "chevron.down")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(.white.opacity(0.55))
                            .rotationEffect(.degrees(isOpen ? 180 : 0))
                    }
                }
                .padding(.horizontal, 18)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if isOpen { content() }
        }
    }
}

/// Hairline row divider.
fileprivate struct HubRule: View {
    var inset: CGFloat = 0
    var body: some View {
        Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1).padding(.leading, inset)
    }
}

// ── ALL-STAR WEEK card — one-off break surface (Jul 13-14 2026). Every line
// below was verified Jul 13 (field, format, times, starters); the call site's
// date gate self-retires the card after the break.
fileprivate struct HubAllStarCard: View {
    // The winner board (FanDuel, grounded midday Jul 13), short→long — pure
    // market data; Gary's picks live on the Picks tab (pointer line below).
    private let field: [(name: String, team: String, price: String)] = [
        ("Kyle Schwarber", "PHI", "+310"),
        ("Junior Caminero", "TB", "+370"),
        ("Munetaka Murakami", "CHW", "+500"),
        ("Jordan Walker", "STL", "+600"),
        ("Jac Caglianone", "KC", "+600"),
        ("Bryce Harper", "PHI", "+800"),
        ("Ben Rice", "NYY", "+950"),
        ("Willson Contreras", "BOS", "+1700"),
    ]
    private var isDerbyDay: Bool { SupabaseAPI.todayEST() == "2026-07-13" }
    // ASG identity duotone — local to this self-retiring card.
    private let asgRed = Color(hex: "#D50032")
    private let asgBlue = Color(hex: "#2D68C4")

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HubHead(title: "MLB · All-Star Week", sub: "Citizens Bank Park")

            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    HStack(spacing: 3) {
                        Rectangle().fill(asgRed).frame(width: 3, height: 20)
                        Rectangle().fill(asgBlue).frame(width: 3, height: 20)
                    }
                    Text(isDerbyDay ? "HOME RUN DERBY" : "ALL-STAR GAME")
                        .font(HubFont.display(30))
                        .foregroundStyle(.white)
                    Spacer(minLength: 8)
                    Text("TONIGHT · 8:00 PM ET")
                        .font(HubFont.kicker(11.5)).tracking(1.0)
                        .foregroundStyle(GaryColors.gold)
                }

                if isDerbyDay {
                    Text("NEW FORMAT — 20 SWINGS IN ROUND ONE · TOP FOUR ADVANCE · ON NETFLIX")
                        .font(HubFont.kicker(10.5)).tracking(0.8)
                        .foregroundStyle(.white.opacity(0.62))

                    // The winner board — market order, prices on the right,
                    // Gary's break-from-chalk row ticked in gold.
                    VStack(alignment: .leading, spacing: 0) {
                        HStack {
                            Text("TO WIN")
                                .font(HubFont.kicker(10)).tracking(1.2)
                                .foregroundStyle(.white.opacity(0.55))
                            Spacer(minLength: 8)
                            Text("FANDUEL · MIDDAY")
                                .font(HubFont.kicker(10)).tracking(0.8)
                                .foregroundStyle(.white.opacity(0.45))
                        }
                        .padding(.bottom, 7)
                        // Pure market board — no pick reveals (founder): the
                        // pointer line below says where Gary's picks live.
                        ForEach(Array(field.enumerated()), id: \.element.name) { i, p in
                            HStack(spacing: 7) {
                                Text(p.name)
                                    .font(.system(size: 14.5, weight: .semibold))
                                    .foregroundStyle(.white.opacity(0.92))
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.8)
                                Text(p.team)
                                    .font(HubFont.kicker(10)).tracking(0.6)
                                    .foregroundStyle(.white.opacity(0.55))
                                Spacer(minLength: 8)
                                Text(p.price)
                                    .font(HubFont.data(14.5))
                                    .foregroundStyle(.white.opacity(0.85))
                            }
                            .padding(.vertical, 5)
                            if i < field.count - 1 { HubRule() }
                        }
                    }
                    .padding(.vertical, 2)

                    HubRule()
                    HStack(alignment: .firstTextBaseline) {
                        Text("TOMORROW — ALL-STAR GAME")
                            .font(HubFont.kicker(10.5)).tracking(0.8)
                            .foregroundStyle(.white.opacity(0.62))
                        Spacer(minLength: 8)
                        Text("CEASE (AL) VS SÁNCHEZ (NL)")
                            .font(HubFont.kicker(10.5)).tracking(0.8)
                            .foregroundStyle(.white.opacity(0.75))
                    }
                } else {
                    Text("CEASE (AL) VS SÁNCHEZ (NL) · MLB RETURNS FRIDAY")
                        .font(HubFont.kicker(10.5)).tracking(0.8)
                        .foregroundStyle(.white.opacity(0.62))
                }

                Text(isDerbyDay ? "GARY'S BOARD — 5 PICKS · ON THE PICKS TAB"
                                : "GARY'S BOARD — ON THE PICKS TAB")
                    .font(HubFont.kicker(10.5)).tracking(1.0)
                    .foregroundStyle(GaryColors.gold.opacity(0.9))
            }
            .padding(.horizontal, 18)

            // THE CONTEST — Sol's R1 over/under on every participant
            // (founder: the fun list product; reasons included — the Hub
            // is the insight surface).
            if isDerbyDay {
                DerbyContestSection(showReasons: true)
            }
        }
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

/// Internal (not fileprivate): the Picks slate strip formats its O/U with the
/// same rule so the two strips read identically.
enum HubFmt {
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
    @State private var teamCardSignal: Signal? = nil

    /// Routing law (founder, Jul 26): a player-backed signal ALWAYS opens the
    /// player card; a team-backed one opens the team card; the small signal
    /// pop-up survives only when neither identity exists.
    private func openSignal(_ s: Signal) {
        if s.playerId != nil { breakdownSignal = s }
        else if s.teamId != nil || s.h2h != nil { teamCardSignal = s }
        else { selectedSignal = s }
    }

    /// The display name a team card is about (mirrors the sheet's own header).
    static func teamCardName(for s: Signal) -> String {
        if let h = s.h2h, let d = h.dominant_name, !d.isEmpty { return d }
        if let t = s.fantasy?.team, !t.isEmpty { return t }
        if let t = s.swap?.team, !t.isEmpty { return t }
        return s.headline
    }

    /// Everything else tonight about this team — id-exact when the signal
    /// carries one, name match otherwise (streak-seeded cards have no id).
    private func relatedTeamSignals(for s: Signal) -> [Signal] {
        if let tid = s.teamId {
            return leagueSignals.filter { $0.id != s.id && $0.teamId == tid }
        }
        let name = Self.teamCardName(for: s).lowercased()
        guard let nick = name.split(separator: " ").last.map(String.init), nick.count > 2 else { return [] }
        return leagueSignals.filter { r in
            r.id != s.id && (r.headline.lowercased().contains(nick) || r.detail.lowercased().contains(nick))
        }
    }

    /// Tonight's board row for a team name (nickname or abbr, either side).
    private func slateRowForTeamName(_ name: String) -> TomorrowBoardRow? {
        let n = name.lowercased()
        guard n.count > 2 else { return nil }
        return slateRows.first { r in
            let names = [r.home_team, r.away_team].compactMap { $0?.lowercased() }
            let abbrs = [r.home_abbr, r.away_abbr].compactMap { $0?.uppercased() }
            return names.contains { $0.contains(n) || n.contains($0) } || abbrs.contains(name.uppercased())
        }
    }

    /// Streak rows carry no team id — synthesize the seed signal so a team tap
    /// still lands on the TEAM CARD (routing law, everywhere; founder Jul 30:
    /// tapping the Reds must never dump you on the Picks page).
    private func openTeamCard(for r: StreakRow) {
        let name = r.subject ?? r.team ?? ""
        guard !name.isEmpty else { return }
        teamCardSignal = Signal(
            league: sel, kind: .streak, headline: name,
            detail: r.detail ?? "", game: r.next_game?.uppercased() ?? "",
            value: "", tone: .neutral)
    }
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
    /// Tap-a-name → player card (founder, Jul 22): the day's player cards,
    /// resolved by name; a tapped name opens the same breakdown sheet the
    /// intel rows use. Names with no card stay plain text — no dead taps.
    @State private var intelCards: [PlayerInsightCardRow] = []
    @State private var namedCard: PlayerInsightCardRow? = nil
    @State private var todayBoard: TomorrowBoard? = nil
    /// LEAGUE PULSE (moved from the Picks page — founder, Jul 30): league-wide
    /// daily tables, fetched with the page load so pull-to-refresh and the
    /// staleness refetch cover it like everything else on the page.
    @State private var pulseRows: [LeaguePulseRow] = []
    @State private var pulseTab: String? = nil
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

    /// Name → today's player card, punctuation/case-tolerant. Only names that
    /// resolve become tappable (founder, Jul 22: click a name, get the card).
    private func intelCard(for name: String?) -> PlayerInsightCardRow? {
        guard let name, !name.isEmpty else { return nil }
        func key(_ s: String) -> String { s.lowercased().filter { $0.isLetter || $0.isNumber } }
        let k = key(name)
        guard k.count >= 5 else { return nil }   // tiny keys collide across players
        return intelCards.first {
            let n = key($0.player_name ?? $0.payload?.name ?? "")
            return !n.isEmpty && (n == k || n.contains(k) || k.contains(n))
        }
    }

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
        // All-Star break (Jul 13-14 2026): a dark MLB slate is still an MLB
        // day — keep the tab so the All-Star card has a home (founder call;
        // same date-window treatment WC already gets). Self-retires Jul 15.
        let allStarActive = ["2026-07-13", "2026-07-14"].contains(SupabaseAPI.todayEST())
        let present = order.filter { lg in
            (lg == .wc && wcActive) || (lg == .mlb && allStarActive) || fetched.contains { $0.league == lg }
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
        async let intelF = SupabaseAPI.fetchPlayerIntelRows(date: date)
        // Force past the 30-min pulse cache on refresh/rollover, not first paint.
        async let pulseF = SupabaseAPI.fetchLeaguePulse(date: date, league: "MLB", forceRefresh: didLoad)

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
        let pulse = await pulseF
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
        let intel = await intelF

        await MainActor.run {
            intelCards = intel
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
            pulseRows = pulse
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
        case .fantasyPickups, .twoStart,
             .closerWatch, .returnWatch, .cutList:   anchor = "fantasy"
        case .hot, .cold, .platoon:                  anchor = "bats"
        case .hrThreat:                              anchor = HubView.hrThreatsLive ? "hr" : "bats"
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

    /// Slate position + first-pitch label for a signal's game string — the
    /// Matchups storyboard orders its blocks by real first pitch. Abbr-exact
    /// first, then the same name-keyword fallback the game sheet uses.
    private func slateIndexFor(_ game: String) -> (index: Int, time: String?)? {
        for (i, r) in slateRows.enumerated() {
            let full = "\(r.away_team ?? "") @ \(r.home_team ?? "")"
            let abbr = "\(r.away_abbr ?? "") @ \(r.home_abbr ?? "")".uppercased()
            if game.uppercased() == abbr || abbrGameMatches(game, matchup: full) {
                let t = TomorrowView.etTime(r.commence_time, withZone: true, meridiem: true)
                return (i, t == "—" ? nil : t)
            }
        }
        return nil
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
        // HOME RUN THREATS gets its own stage back (founder green-light
        // Jul 22; debut gated to Jul 23 so the first run is a fresh slate —
        // self-activates at the 3 AM ET rollover). Until then HR reads keep
        // riding The Bats exactly as before.
        if Self.hrThreatsLive {
            return [
                Beat(anchor: "hr", title: "Home Run Threats", kinds: [.hrThreat]),
                Beat(anchor: "bats", title: "The Bats", kinds: [.hot, .cold, .platoon]),
                Beat(anchor: "arms", title: "The Arms", kinds: [.starterForm, .teamRecord, .bullpenFatigue, .situational, .ballpark]),
                Beat(anchor: "matchups", title: "The Matchups", kinds: [.h2h, .injury, .firstInning, .runningGame, .parkWeather]),
            ]
        }
        return [
            Beat(anchor: "bats", title: "The Bats", kinds: [.hot, .cold, .platoon, .hrThreat]),
            Beat(anchor: "arms", title: "The Arms", kinds: [.starterForm, .teamRecord, .bullpenFatigue, .situational, .ballpark]),
            Beat(anchor: "matchups", title: "The Matchups", kinds: [.h2h, .injury, .firstInning, .runningGame, .parkWeather]),
        ]
    }
    /// Founder, Jul 22: "green light it but don't run it tonight — first run
    /// tomorrow." String compare works on ISO dates.
    static var hrThreatsLive: Bool { SupabaseAPI.todayEST() >= "2026-07-23" }

    /// Rows for a beat, in the feed's relevance order (each row keeps its own
    /// lane kicker). Regression rows live on the board, never in a beat.
    private func beatRows(_ beat: Beat) -> [Signal] {
        let kinds = Set(beat.kinds)
        return leagueSignals.filter { kinds.contains($0.kind) && $0.confirmedXI == nil && $0.reg == nil }
    }

    /// "hub" | "fantasy" — which desk the page shows (header toggle, persisted).
    /// Fantasy is its OWN page (founder, Jul 26): never a section in the feed.
    @AppStorage("hubScope") private var hubScope = "hub"

    private var hubScopeToggle: some View {
        // House selector grammar: text + underline bar, never a pill
        // (founder law, Jul 26 — no oval bubbles).
        HStack(spacing: 18) {
            hubScopeTab("THE HUB", isOn: hubScope != "fantasy") { hubScope = "hub" }
            hubScopeTab("FANTASY", isOn: hubScope == "fantasy") { hubScope = "fantasy" }
            Spacer()
        }
        .padding(.horizontal, 18)
    }

    private func hubScopeTab(_ label: String, isOn: Bool, tap: @escaping () -> Void) -> some View {
        Button(action: tap) {
            VStack(spacing: 4) {
                Text(label)
                    .font(HubFont.data(11, .bold)).tracking(1.2)
                    .foregroundStyle(isOn ? GaryColors.gold : .white.opacity(0.5))
                Rectangle().fill(isOn ? GaryColors.gold : .clear).frame(height: 1.5)
            }
            .fixedSize()
        }
        .buttonStyle(.plain)
    }

    /// Everything not already on the page — a safety net so a future backend
    /// lane always renders somewhere instead of vanishing.
    private var overflow: [Signal] {
        var placed: Set<SignalKind> = [.regression, .fantasyPickups, .streak,
                                       .twoStart, .closerWatch, .returnWatch, .cutList]
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

                hubScopeToggle

                if hubScope == "fantasy" {
                    FantasyCornerPage(
                        pickups: items(.fantasyPickups),
                        cuts: items(.cutList),
                        twoStarts: items(.twoStart),
                        closers: items(.closerWatch),
                        returners: items(.returnWatch),
                        loaded: didLoad
                    ) { s in openSignal(s) }
                } else {

                // ── ALL-STAR WEEK — one-off break surface (Jul 13-14 2026 only;
                // the date gate self-retires it). Founder call Jul 13: the break
                // is an acquisition window — "its not an all-star break for Gary".
                // MLB tab only (founder): All-Star is MLB — never mixed into WC.
                if sel == .mlb, ["2026-07-13", "2026-07-14"].contains(SupabaseAPI.todayEST()) {
                    HubAllStarCard()
                }

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
                        onEdge: { s in openSignal(s) }
                    )
                } else if fetchErrored && leagueSignals.isEmpty && ydaySignals.isEmpty
                            && nightRows.isEmpty && streakRows.isEmpty {
                    hubError
                } else {
                    if !slateRows.isEmpty {
                        HubSlateStrip(rows: slateRows) { r in
                            gameSheet = HubGameSel(row: r)
                        }
                    }

                    if leagueSignals.isEmpty {
                        hubMorningNotice
                    } else {
                        if let lead {
                            HubLeadStory(s: lead) { s in
                                openSignal(s)
                            }
                            .id("lead")
                        }
                        if !bestOfBoard.isEmpty {
                            VStack(alignment: .leading, spacing: 4) {
                                HubHead(title: "The Best of the Board")
                                HubBestOf(signals: bestOfBoard) { s in
                                    openSignal(s)
                                }
                            }
                            .id("bestof")
                        }
                        if !items(.regression).isEmpty {
                            VStack(alignment: .leading, spacing: 12) {
                                HubHead(title: "The Regression Board", sub: "ERA vs expected")
                                HubRegressionBoard(signals: items(.regression), todayEST: SupabaseAPI.todayEST()) { s in
                                    openSignal(s)
                                }
                            }
                            .id("regression")
                        }
                        if sel == .wc, !items(.xgRegression).isEmpty {
                            VStack(alignment: .leading, spacing: 12) {
                                HubHead(title: "The xG Board", sub: "goals vs expected")
                                HubBeatList(rows: items(.xgRegression), open: true, kickerFor: kickerText,
                                            onRow: { s in openSignal(s) },
                                            onProfile: { breakdownSignal = $0 })
                            }
                            .id("xgboard")
                        }
                    }

                    // League-wide daily tables — the agate page between the
                    // boards and the streaks (moved off Picks, founder Jul 30).
                    if sel == .mlb, !pulseRows.isEmpty {
                        HubLeaguePulse(rows: pulseRows, selectedTab: $pulseTab)
                            .id("pulse")
                    }

                    if !selStreakRows.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            HubHead(title: "Streak Watch", count: selStreakRows.count)
                            HubStreakWatch(rows: selStreakRows, onTeam: { openTeamCard(for: $0) },
                                           cardFor: { intelCard(for: $0) }, onPlayer: { namedCard = $0 })
                        }
                        .id("streaks")
                    }

                    if !leagueSignals.isEmpty {
                        ForEach(beats) { beat in
                            let rows = beatRows(beat)
                            if !rows.isEmpty {
                                // The Matchups reads as a slate storyboard —
                                // one block per game (founder, Jul 30) — while
                                // every other beat keeps the flat feed.
                                if beat.anchor == "matchups" {
                                    HubMatchupsSection(
                                        rows: rows,
                                        slateIndexFor: { slateIndexFor($0) },
                                        openBeats: $openBeats,
                                        kickerFor: kickerText,
                                        onRow: { s in openSignal(s) },
                                        onProfile: { breakdownSignal = $0 }
                                    )
                                    .id(beat.anchor)
                                } else {
                                    HubBeatSection(
                                        anchor: beat.anchor,
                                        title: beat.title,
                                        rows: rows,
                                        openBeats: $openBeats,
                                        kickerFor: kickerText,
                                        onRow: { s in openSignal(s) },
                                        onProfile: { breakdownSignal = $0 }
                                    )
                                    .id(beat.anchor)
                                }
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

                        // Fantasy lives on its OWN page behind the header toggle
                        // (founder, Jul 26) — never as a section in this feed.

                        if !overflow.isEmpty {
                            HubBeatSection(
                                anchor: "more",
                                title: "More Edges",
                                rows: overflow,
                                openBeats: $openBeats,
                                kickerFor: kickerText,
                                onRow: { s in openSignal(s) },
                                onProfile: { breakdownSignal = $0 }
                            )
                            .id("more")
                        }
                    }

                    // Folded by default (founder, Jul 30): the graded boards
                    // are reference tables — the page leads with tonight.
                    if !selNightRows.isEmpty {
                        HubCollapsible(anchor: "lastNight", open: $openBeats,
                                       title: nightLabel, count: selNightRows.count) {
                            HubNightBoard(rows: selNightRows,
                                          cardFor: { intelCard(for: $0) }, onPlayer: { namedCard = $0 })
                        }
                        .id("lastNight")
                    }

                    if !selYdaySignals.isEmpty {
                        HubCollapsible(anchor: "receipts", open: $openBeats,
                                       title: "The Receipts", sub: receiptsTally) {
                            HubReceipts(signals: selYdaySignals) { selectedSignal = $0 }
                        }
                        .id("receipts")
                    }
                }
                }
            }
            .padding(.top, 8)
            .padding(.bottom, 120)
            .frame(minHeight: geo.size.height, alignment: .top)
            .task { if !didLoad { await load() } }
        }
        .overlay(alignment: .bottomTrailing) {
            if !searchOpen, didLoad, !jumpItems.isEmpty, hubScope != "fantasy" {
                HubSectionNav(items: jumpItems, open: $sectionNavOpen) { anchor in
                    if ["lastNight", "receipts"].contains(anchor) { openBeats.insert(anchor) }
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
            // "hubscope fantasy|hub" — flip the header toggle (sim QA).
            if verb == "hubscope" {
                hubScope = arg.lowercased() == "fantasy" ? "fantasy" : "hub"
                return
            }
            // "hubtap <lane> <i>" — run the EXACT tap router a row's button
            // calls (openSignal), so sim QA verifies the real routing law:
            // player-backed → player card, team-backed → team card.
            if verb == "hubtap" {
                let parts = arg.split(separator: " ")
                let lane = parts.first.map(String.init)?.lowercased() ?? ""
                let idx = parts.count > 1 ? Int(parts[1]) ?? 0 : 0
                let pool: [Signal]
                switch lane {
                case "fantasy": pool = items(.fantasyPickups)
                case "cut": pool = items(.cutList)
                case "twostart": pool = items(.twoStart)
                case "closer": pool = items(.closerWatch)
                case "return": pool = items(.returnWatch)
                case "h2h": pool = items(.h2h)
                default: pool = leagueSignals
                }
                if pool.indices.contains(idx) { openSignal(pool[idx]) }
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
        .sheet(item: $teamCardSignal) { s in
            HubTeamCardSheet(
                signal: s,
                related: relatedTeamSignals(for: s),
                tonight: slateRowForTeamName(Self.teamCardName(for: s)),
                onSignal: { next in
                    teamCardSignal = nil
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { openSignal(next) }
                }
            )
        }
        // Tap-a-name → the same breakdown card, prefetched by name.
        .sheet(item: $namedCard) { PlayerInsightSheet(signal: nil, prefetched: $0) }
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
                                 onViewGame: { onSelectGame($0) },
                                 onTeam: { r in
                                     withAnimation(.spring(response: 0.3, dampingFraction: 0.88)) { gameSheet = nil }
                                     openTeamCard(for: r)
                                 })
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
                        .frame(maxHeight: UIScreen.main.bounds.height * 0.58)
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
        if sel == .mlb, !pulseRows.isEmpty { out.append(("pulse", "Pulse")) }
        if !selStreakRows.isEmpty { out.append(("streaks", "Streaks")) }
        if !leagueSignals.isEmpty {
            for beat in beats where !beatRows(beat).isEmpty {
                out.append((beat.anchor, beat.title.replacingOccurrences(of: "The ", with: "")))
            }
            if sel == .wc, !wcIntelSignals.isEmpty { out.append(("wcIntel", "Intel")) }
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
                        .foregroundStyle(.white.opacity(0.62))
                        .frame(width: 28, height: 30)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Settings")
            }

            HStack(spacing: 8) {
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
                        .foregroundStyle(.white.opacity(0.62))
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
                                .font(.system(size: 14)).foregroundStyle(.white.opacity(0.62))
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
                            .foregroundStyle(hubValueTint(s))
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
                .foregroundStyle(.white.opacity(0.62))
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
                    .foregroundStyle(hubValueTint(s))
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
                        .foregroundStyle(.white.opacity(0.62))
                        .frame(width: 18, alignment: .leading)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(HubFmt.subject(s.headline))
                            .font(HubFont.body(15, .semibold))
                            .foregroundStyle(.white.opacity(0.95))
                            .lineLimit(1).minimumScaleFactor(0.65)
                        Text(s.game.uppercased())
                            .font(HubFont.data(9, .medium))
                            .foregroundStyle(.white.opacity(0.62))
                    }
                    Spacer(minLength: 6)
                    if s.spark.count >= 2 { gapBar(s.spark[0], s.spark[1]) }
                    Text(s.value)
                        .font(HubFont.data(15))
                        .foregroundStyle(hubValueTint(s))
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
            // The Gary read (founder, Jul 30): WHY the gap exists and what it
            // means for this start — never a re-statement of the row's number.
            // Falls back to the terse verdict on rows written before the layer.
            if let read = r.read, !read.isEmpty {
                Text(read)
                    .font(HubFont.body(13))
                    .foregroundStyle(.white.opacity(0.85))
                    .lineSpacing(2.5)
                    .fixedSize(horizontal: false, vertical: true)
            } else if let v = r.verdict, !v.isEmpty {
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
            Text(label.uppercased()).font(HubFont.kicker(8.5)).tracking(0.6).foregroundStyle(.white.opacity(0.62))
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

// MARK: - League Pulse (moved from the Picks page — founder, Jul 30)

/// League-wide daily tables (starting pitchers / hot & cold bats / bullpen /
/// injuries) in Hub chrome: HubHead, gold-underline kicker tabs, and the
/// proven PulseTable row grammar (the no-ellipsis scars live in there — the
/// table itself is untouched, only the chrome is Hub-native).
fileprivate struct HubLeaguePulse: View {
    let rows: [LeaguePulseRow]
    @Binding var selectedTab: String?

    /// Fixed display order; any tab without a row drops out.
    private static let tabOrder = ["starting_pitchers", "hot_cold_bats", "bullpen", "injuries"]

    private var ordered: [LeaguePulseRow] {
        rows.sorted { a, b in
            let ai = Self.tabOrder.firstIndex(of: a.tab ?? "") ?? Int.max
            let bi = Self.tabOrder.firstIndex(of: b.tab ?? "") ?? Int.max
            if ai != bi { return ai < bi }
            return (a.tab ?? "") < (b.tab ?? "")
        }
    }
    private var active: LeaguePulseRow? {
        if let t = selectedTab, let r = ordered.first(where: { $0.tab == t }) { return r }
        return ordered.first
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HubHead(title: "League Pulse", sub: "around the league")
            if ordered.count > 1 { tabs }
            if let row = active {
                VStack(alignment: .leading, spacing: 4) {
                    let cap = [row.subtitle, row.sortNote]
                        .compactMap { $0?.isEmpty == false ? $0 : nil }
                        .joined(separator: " · ")
                    if !cap.isEmpty {
                        Text(cap)
                            .font(HubFont.body(12))
                            .foregroundStyle(.white.opacity(0.62))
                            .padding(.horizontal, 18)
                    }
                    PulseTable(row: row)
                        .padding(.horizontal, 4)
                }
            }
        }
    }

    private var tabs: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 20) {
                ForEach(ordered) { row in
                    let isActive = (active?.tab == row.tab)
                    Button {
                        withAnimation(.easeInOut(duration: 0.15)) { selectedTab = row.tab }
                    } label: {
                        Text((row.title ?? row.tab ?? "").uppercased())
                            .font(HubFont.kicker(11)).tracking(1.3)
                            .foregroundStyle(isActive ? GaryColors.gold : .white.opacity(0.45))
                            .padding(.bottom, 7)
                            .overlay(alignment: .bottom) {
                                Rectangle().fill(isActive ? GaryColors.gold : .clear).frame(height: 2)
                            }
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 18)
        }
    }
}

// MARK: - Streak Watch

fileprivate struct HubStreakWatch: View {
    let rows: [StreakRow]
    /// Routing law (founder, Jul 26/30): a team row opens the TEAM CARD —
    /// never a page jump. Player rows open the player card.
    var onTeam: (StreakRow) -> Void = { _ in }
    /// Tap-a-name → player card (only names with a resolved card).
    var cardFor: (String?) -> PlayerInsightCardRow? = { _ in nil }
    var onPlayer: (PlayerInsightCardRow) -> Void = { _ in }

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
        // Over/under runs are ANGLES, not good/bad — gold both directions
        // (founder, Jul 6: red on a scoring streak read as a warning).
        case "over":    return ("O ×\(n)", GaryColors.gold)
        case "under":   return ("U ×\(n)", GaryColors.gold)
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

    @State private var showAll = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            let all = ordered
            let shown = showAll ? all : Array(all.prefix(10))
            ForEach(Array(shown.enumerated()), id: \.offset) { i, r in
                streakRow(r)
                if i < shown.count - 1 { HubRule(inset: 84) }
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
        let playerCard = r.subject_type == "player" ? cardFor(r.subject) : nil
        let isTeam = r.subject_type == "team"
        // The next-game tag gets its own line now (founder, Jul 8: cramming
        // "AT ORIOLES · 6:35 PM ET" into the trailing slot beside the name
        // truncated both it and the detail line to an unreadable stub).
        let row = HStack(alignment: .center, spacing: 12) {
            Text(b.text)
                .font(HubFont.data(16))
                .foregroundStyle(b.color)
                .lineLimit(1).minimumScaleFactor(0.7)
                .frame(width: 54, alignment: .leading)
            VStack(alignment: .leading, spacing: 4) {
                // Names read like every other name (founder, Jul 30: the gold
                // tappable tint was noise) — the whole row routes: team row →
                // team card, player row → player card.
                Text(r.subject ?? "")
                    .font(HubFont.body(17, .semibold))
                    .foregroundStyle(.white.opacity(0.92))
                    .lineLimit(1)
                if let d = cleanDetail(r, badgeText: b.text) {
                    Text(d)
                        .font(HubFont.body(13.5))
                        .foregroundStyle(.white.opacity(0.62))
                        .lineLimit(1).minimumScaleFactor(0.8)
                }
                if let next = r.next_game, !next.isEmpty {
                    Text(next.uppercased())
                        .font(HubFont.data(12.5, .semibold))
                        .foregroundStyle(GaryColors.gold.opacity(0.9))
                        .lineLimit(1).minimumScaleFactor(0.85)
                        .padding(.top, 1)
                }
            }
            Spacer(minLength: 8)
            if isTeam || playerCard != nil {
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.62))
            }
        }
        .padding(.horizontal, 18).padding(.vertical, 13)
        if isTeam {
            Button { onTeam(r) } label: { row.contentShape(Rectangle()) }
                .buttonStyle(.plain)
        } else if let playerCard {
            Button { onPlayer(playerCard) } label: { row.contentShape(Rectangle()) }
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
    /// Off inside the Matchups storyboard — the game is the block's masthead.
    var showsGame: Bool = true
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
                    if showsGame {
                        Text(s.game.uppercased())
                            .font(HubFont.data(10, .medium))
                            .foregroundStyle(.white.opacity(0.62))
                            .lineLimit(1)
                    }
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
                            .foregroundStyle(hubValueTint(s))
                            .lineLimit(1)
                    }
                    if expandable, !dedupedDetail.isEmpty {
                        Image(systemName: "chevron.down")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundStyle(.white.opacity(0.62))
                            .rotationEffect(.degrees(expanded ? 180 : 0))
                            .padding(.top, 4)
                    } else if showsChevron {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.62))
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
    /// Off inside the Matchups storyboard — the game is the block's masthead.
    var showsGame: Bool = true
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
                        if showsGame {
                            Text(s.game.uppercased())
                                .font(HubFont.data(9, .medium))
                                .foregroundStyle(.white.opacity(0.62))
                                .lineLimit(1)
                        }
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

/// Season series as a broadcast face-off (founder, Jul 27: the fill bar is
/// gone). The story is told by WEIGHT — the side that owns the series gets
/// the big gold number, the other side sits smaller and dimmer. No bars, no
/// gauges: a scorebug, then the last meeting in words.
fileprivate struct HubTugRow: View {
    let s: Signal
    /// Off inside the Matchups storyboard — the game is the block's masthead.
    var showsGame: Bool = true
    let onTap: () -> Void

    var body: some View {
        let h = s.h2h
        let wins = max(h?.wins ?? 0, 0)
        let losses = max(h?.losses ?? 0, 0)
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 9) {
                HStack(spacing: 8) {
                    HubKicker(text: "Head-To-Head", size: 9.5, color: GaryColors.gold.opacity(0.9))
                    Spacer(minLength: 6)
                    if showsGame {
                        Text(s.game.uppercased())
                            .font(HubFont.data(10, .medium))
                            .foregroundStyle(.white.opacity(0.62))
                    }
                }
                HStack(alignment: .lastTextBaseline, spacing: 10) {
                    Text(h?.dominant ?? "—")
                        .font(GaryFonts.accent(15))
                        .foregroundStyle(.white.opacity(0.95))
                    Text("\(wins)")
                        .font(GaryFonts.display(34))
                        .foregroundStyle(GaryColors.gold)
                    Text("–")
                        .font(GaryFonts.display(22))
                        .foregroundStyle(.white.opacity(0.35))
                    Text("\(losses)")
                        .font(GaryFonts.display(24))
                        .foregroundStyle(.white.opacity(0.55))
                    Text(h?.opponent ?? "—")
                        .font(GaryFonts.accent(12))
                        .foregroundStyle(.white.opacity(0.6))
                    Spacer(minLength: 6)
                    Text("THIS SEASON")
                        .font(HubFont.data(9, .semibold)).tracking(1.1)
                        .foregroundStyle(.white.opacity(0.45))
                }
                if let last = h?.last_meeting, let score = last.score {
                    Text(last.revenge == true
                         ? "\(h?.opponent ?? "") took the last meeting \(score) — revenge spot"
                         : "\(h?.dominant ?? "") won the last meeting \(score)")
                        .font(HubFont.body(12)).foregroundStyle(.white.opacity(0.72))
                }
            }
            .padding(.horizontal, 18).padding(.vertical, 11)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// First-inning (NRFI/YRFI): recent first innings as scored-vs-scoreless dots.
/// Color law (founder, Jul 30): scored = green, scoreless = red — yes is
/// green and no is red app-wide, whatever the bettor's angle.
fileprivate struct HubDotsRow: View {
    let s: Signal
    let kicker: String
    /// Off inside the Matchups storyboard — the game is the block's masthead.
    var showsGame: Bool = true
    let onTap: () -> Void
    private let green = Color(hex: "#3FB950")
    private let red = Color(hex: "#E5614D")

    var body: some View {
        let m = s.nrfi
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 9) {
                HStack(spacing: 8) {
                    HubKicker(text: kicker, size: 9.5, color: GaryColors.gold.opacity(0.9))
                    Spacer(minLength: 6)
                    if showsGame {
                        Text(s.game.uppercased())
                            .font(HubFont.data(10, .medium))
                            .foregroundStyle(.white.opacity(0.62))
                    }
                }
                Text(s.headline)
                    .font(HubFont.body(14.5, .semibold)).foregroundStyle(.white.opacity(0.95))
                    .lineLimit(2).fixedSize(horizontal: false, vertical: true)
                    .multilineTextAlignment(.leading)
                // First-inning timeline, oldest → newest (founder Jul 27 built
                // the section out; Jul 30 color law: scored = green, scoreless
                // = red — the dots show what HAPPENED, tallies stay neutral).
                if let teamSeq = m?.team_seq {
                    seqRow(m?.team_abbr ?? "", teamSeq)
                } else {
                    seqRow(m?.away_abbr ?? "", m?.away_seq ?? [])
                    seqRow(m?.home_abbr ?? "", m?.home_seq ?? [])
                }
                // Gary's read on the spot — same voice as every hub card.
                if !s.detail.isEmpty {
                    Text(s.detail)
                        .font(HubFont.body(13)).foregroundStyle(.white.opacity(0.88))
                        .lineSpacing(2.5)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.horizontal, 18).padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    /// Trailing run of clean first innings (seq is oldest → newest, 0 = clean).
    private func cleanStreak(_ seq: [Int]) -> Int {
        var n = 0
        for v in seq.reversed() { if v == 0 { n += 1 } else { break } }
        return n
    }

    @ViewBuilder private func seqRow(_ abbr: String, _ seq: [Int]) -> some View {
        let clean = seq.filter { $0 == 0 }.count
        let streak = cleanStreak(seq)
        HStack(spacing: 8) {
            Text(abbr)
                .font(GaryFonts.accent(11)).foregroundStyle(.white.opacity(0.85))
                .frame(width: 40, alignment: .leading)
            HStack(spacing: 3.5) {
                // Color law (founder, Jul 30): yes = green, no = red — a run
                // SCORED glows green, a scoreless first burns red, everywhere
                // in the app. The tallies stay neutral so the dots tell it.
                ForEach(Array(seq.enumerated()), id: \.offset) { _, v in
                    RoundedRectangle(cornerRadius: 2.5, style: .continuous)
                        .fill(v > 0 ? green.opacity(0.9) : red.opacity(0.45))
                        .frame(width: 10, height: 10)
                }
            }
            Spacer(minLength: 6)
            VStack(alignment: .trailing, spacing: 1) {
                Text("CLEAN \(clean)/\(seq.count)")
                    .font(HubFont.data(10, .bold)).foregroundStyle(.white.opacity(0.7))
                if streak >= 3 {
                    Text("\(streak) STRAIGHT")
                        .font(HubFont.data(9, .semibold)).tracking(0.8)
                        .foregroundStyle(.white.opacity(0.62))
                }
            }
        }
    }
}

// MARK: - The Matchups (per-game storyboard — founder, Jul 30 redesign)

/// The Matchups, rebuilt as a slate storyboard: one block per GAME in
/// first-pitch order — a matchup masthead (away @ home in the display face,
/// first pitch on the right) with that game's intel nested under it. This
/// replaces the shuffled deck of unrelated one-off rows; the special shapes
/// (head-to-head scorebug, first-inning dots, replacement swaps) live on
/// under their game, with the now-redundant per-row game tag hidden. The
/// head-to-head scorebug, when a game has one, leads its block — it reads as
/// the matchup's identity stat.
fileprivate struct HubMatchupsSection: View {
    let rows: [Signal]
    /// Slate position + first-pitch label for a game string (nil = off-board).
    let slateIndexFor: (String) -> (index: Int, time: String?)?
    @Binding var openBeats: Set<String>
    let kickerFor: (Signal) -> String
    let onRow: (Signal) -> Void
    let onProfile: (Signal) -> Void

    private let anchor = "matchups"
    private let topCount = 3
    private var isOpen: Bool { openBeats.contains(anchor) }

    private struct GameBlock: Identifiable {
        let game: String
        let time: String?
        let rows: [Signal]
        var id: String { game }
    }

    /// Rows grouped by game: slate (first-pitch) order, off-board games last
    /// in feed order. Inside a block the h2h scorebug leads, the rest keep
    /// the feed's relevance order.
    private var blocks: [GameBlock] {
        var order: [String] = []
        var by: [String: [Signal]] = [:]
        for s in rows {
            if by[s.game] == nil { order.append(s.game) }
            by[s.game, default: []].append(s)
        }
        let entries: [(game: String, slate: Int, feed: Int, time: String?)] = order.enumerated().map { i, g in
            let hit = slateIndexFor(g)
            return (g, hit?.index ?? Int.max, i, hit?.time)
        }
        return entries
            .sorted { a, b in a.slate != b.slate ? a.slate < b.slate : a.feed < b.feed }
            .map { e in
                let sorted = (by[e.game] ?? []).enumerated()
                    .sorted { a, b in
                        let ah = a.element.h2h != nil ? 0 : 1
                        let bh = b.element.h2h != nil ? 0 : 1
                        return ah != bh ? ah < bh : a.offset < b.offset
                    }
                    .map(\.element)
                return GameBlock(game: e.game, time: e.time, rows: sorted)
            }
    }

    var body: some View {
        let all = blocks
        let shown = isOpen ? all : Array(all.prefix(topCount))
        VStack(alignment: .leading, spacing: 4) {
            HubHead(title: "The Matchups", count: all.count, sub: "by first pitch")
            VStack(spacing: 0) {
                ForEach(shown) { block in
                    gameBlock(block)
                    if block.id != shown.last?.id { HubRule() }
                }
            }
            if all.count > topCount {
                HubSeeAllButton(isOpen: isOpen, total: all.count) {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        if isOpen { openBeats.remove(anchor) } else { openBeats.insert(anchor) }
                    }
                }
                .padding(.top, 6)
            }
        }
    }

    @ViewBuilder private func gameBlock(_ block: GameBlock) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .lastTextBaseline, spacing: 8) {
                Text(block.game.uppercased())
                    .font(HubFont.display(20))
                    .foregroundStyle(GaryColors.warmWhite)
                    .lineLimit(1).minimumScaleFactor(0.7)
                Spacer(minLength: 8)
                if let t = block.time {
                    Text(t.uppercased())
                        .font(HubFont.data(9.5, .semibold))
                        .foregroundStyle(.white.opacity(0.55))
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 14)
            VStack(spacing: 0) {
                ForEach(Array(block.rows.enumerated()), id: \.element.id) { i, s in
                    factRow(s)
                    if i < block.rows.count - 1 { HubRule(inset: 30) }
                }
            }
            .padding(.bottom, 4)
        }
    }

    @ViewBuilder private func factRow(_ s: Signal) -> some View {
        if s.swap != nil {
            HubSwapRow(s: s, showsGame: false) { onRow(s) }
        } else if s.h2h != nil {
            HubTugRow(s: s, showsGame: false) { onRow(s) }
        } else if s.nrfi != nil {
            HubDotsRow(s: s, kicker: kickerFor(s), showsGame: false) { onRow(s) }
        } else {
            HubStoryRow(s: s, kicker: kickerFor(s), expandable: true, showsGame: false,
                        onTap: { onRow(s) },
                        onProfile: s.playerId != nil ? { onProfile(s) } : nil)
        }
    }
}

// MARK: - Fantasy Corner

// MARK: - Fantasy Corner (the dedicated page behind the header toggle)

/// One player on the Fantasy desk: the name, the numbers strip, and — the
/// whole point — Gary's full case with his verdict pulled out, so a manager
/// reads the argument and just decides whether they agree (founder, Jul 26).
fileprivate struct FantasyCard: View {
    let s: Signal
    var accent: Color = GaryColors.gold
    let onTap: (Signal) -> Void

    private var m: SwapMeta? { s.fantasy }

    private var tierWord: (String, Color)? {
        switch m?.tier {
        case "MUST_ADD": return ("MUST ADD", GaryColors.gold)
        case "STREAM": return ("STREAM", HubPalette.green)
        case "DEEP": return ("DEEP LEAGUES", Color.white.opacity(0.5))
        case "PLAN_AROUND": return ("PLAN AROUND", GaryColors.gold)
        case "STREAM_BOTH": return ("START BOTH", HubPalette.green)
        case "MATCHUP_CALL": return ("MATCHUP CALL", Color.white.opacity(0.5))
        case "CUT": return ("CUT", HubPalette.red)
        default: return nil
        }
    }

    /// The supporting numbers, kind by kind — every figure is the computer's
    /// own stored fact, never re-derived here.
    private var statStrip: String? {
        guard let m else { return nil }
        var bits: [String] = []
        switch m.kind {
        case "fantasy_pickup":
            if m.role == "SP" {
                // Matchup leads, numbers follow — the same construction the
                // bats rows use (founder, Jul 26: arms mirror bats).
                if let o = m.opp, !o.isEmpty { bits.append("vs \(o)") }
                if let x = m.xera { bits.append("\(x) xERA") }
                if let k = m.k9 { bits.append("\(k) K/9") }
                if let w = m.whip { bits.append("\(w) WHIP") }
            } else {
                if let o = m.ops { bits.append(String(format: "%.3f OPS", o)) }
                if let a = m.avg { bits.append(String(format: "%.3f AVG", a)) }
                if let b = m.batting_order { bits.append("bats \(b)") }
                if let sp = m.opp_sp, !sp.isEmpty {
                    bits.append("vs \(sp)" + (m.opp_sp_era.map { " (\($0) xERA)" } ?? ""))
                }
            }
        case "two_start":
            for st in m.starts ?? [] {
                if let opp = st.opp { bits.append("\(st.home == true ? "vs" : "at") \(opp)") }
            }
            if let x = m.xera { bits.append("\(x) xERA") }
        case "closer_watch":
            if let l = m.leader { bits.append("\(l.name ?? "") \(l.sv ?? 0) SV") }
            if let r = m.runner { bits.append("next \(r.name ?? "") \(r.sv ?? 0) SV") }
        case "return_watch":
            if let st = m.status, !st.isEmpty { bits.append(st) }
            if let inj = m.injury, !inj.isEmpty { bits.append(inj) }
            if let line = m.season_line { bits.append(line) }
        case "cut_list":
            if m.role == "SP" {
                if let x = m.xera { bits.append("\(x) xERA") }
                if let e = m.era { bits.append("\(e) ERA") }
            } else {
                if let o = m.ops { bits.append(String(format: "%.3f OPS", o)) }
                if let a = m.avg { bits.append(String(format: "%.3f AVG", a)) }
                if let b = m.batting_order { bits.append("bats \(b)") }
            }
        default: break
        }
        return bits.isEmpty ? nil : bits.joined(separator: "  ·  ")
    }

    var body: some View {
        Button { onTap(s) } label: {
            VStack(alignment: .leading, spacing: 6) {
                // No stat anchors the card (founder, Jul 26): the TAKE is the
                // anchor — the tier word rides the right edge, the numbers
                // live quietly in the strip, and the read carries the case.
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(s.headline)
                        .font(HubFont.body(14.5, .bold)).foregroundStyle(.white.opacity(0.95))
                        .lineLimit(1).minimumScaleFactor(0.7)
                    if let pos = m?.position, !pos.isEmpty, pos != "SP" {
                        Text(pos)
                            .font(HubFont.data(9.5, .semibold)).foregroundStyle(.white.opacity(0.62))
                    }
                    if let t = m?.team, !t.isEmpty {
                        Text(t)
                            .font(HubFont.data(9.5, .semibold)).foregroundStyle(.white.opacity(0.55))
                    }
                    Spacer(minLength: 8)
                    if let tier = tierWord {
                        Text(tier.0)
                            .font(HubFont.data(10, .bold)).tracking(0.9)
                            .foregroundStyle(tier.1)
                    }
                }

                if let strip = statStrip {
                    Text(strip)
                        .font(HubFont.data(10.5, .semibold)).foregroundStyle(.white.opacity(0.72))
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }

                // Gary's case in full — the product, at reading brightness
                // (founder, Jul 27: no more grey words on black). Verdict on
                // its own line so the call lands.
                Text(m?.read ?? s.detail)
                    .font(HubFont.body(13.5)).foregroundStyle(.white.opacity(0.9))
                    .lineSpacing(3)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                if let v = m?.verdict, !v.isEmpty {
                    Text(v)
                        .font(HubFont.body(13, .bold)).foregroundStyle(accent)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.vertical, 11)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// A kicker-titled run of FantasyCards. Hides itself when empty.
fileprivate struct FantasyCardList: View {
    // No sub-captions under headers (founder, Jul 27): the header says it,
    // the cards carry the rest.
    let items: [Signal]
    var accent: Color = GaryColors.gold
    let onTap: (Signal) -> Void

    var body: some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(items.enumerated()), id: \.element.id) { i, s in
                    FantasyCard(s: s, accent: accent, onTap: onTap)
                    if i < items.count - 1 { HubRule() }
                }
            }
            .padding(.horizontal, 18)
        }
    }
}

/// The season-long manager's daily desk — a FULL page, not a feed section
/// (founder, Jul 26): adds and drops with Gary's complete case on every name,
/// the week's two-start arms, the ninth-inning ladder, and the stash list.
/// Every lane is honest about its data: a quiet lane says why it's quiet.
fileprivate struct FantasyCornerPage: View {
    let pickups: [Signal]
    let cuts: [Signal]
    let twoStarts: [Signal]
    let closers: [Signal]
    let returners: [Signal]
    let loaded: Bool
    let onTap: (Signal) -> Void

    private var total: Int {
        pickups.count + cuts.count + twoStarts.count + closers.count + returners.count
    }
    private var addArms: [Signal] { pickups.filter { ($0.fantasy?.role ?? "") == "SP" } }
    private var addBats: [Signal] { pickups.filter { ($0.fantasy?.role ?? "") != "SP" } }

    var body: some View {
        VStack(alignment: .leading, spacing: 26) {
            VStack(alignment: .leading, spacing: 6) {
                (Text("FANTASY ").foregroundColor(GaryColors.warmWhite)
                    + Text("CORNER").foregroundColor(GaryColors.gold))
                    .font(HubFont.display(26))
                    .tracking(0.5)
            }
            .padding(.horizontal, 18)

            if !loaded {
                HStack {
                    Spacer()
                    ProgressView().tint(.white.opacity(0.4))
                    Spacer()
                }
                .padding(.vertical, 40)
            } else if total == 0 {
                Text("The desk sets up with the morning run — check back once today's board is in.")
                    .font(HubFont.body(13))
                    .foregroundStyle(.white.opacity(0.55))
                    .padding(.horizontal, 18)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                if !pickups.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        HubHead(title: "The Waiver Wire", count: pickups.count)
                        FantasyCardList(items: addArms, accent: GaryColors.gold, onTap: onTap)
                        FantasyCardList(items: addBats, accent: HubPalette.green, onTap: onTap)
                    }
                }

                if !cuts.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        HubHead(title: "The Cut List", count: cuts.count)
                        FantasyCardList(items: cuts, accent: HubPalette.red, onTap: onTap)
                    }
                }

                VStack(alignment: .leading, spacing: 12) {
                    HubHead(title: "Two-Start Week", count: twoStarts.count)
                    if twoStarts.isEmpty {
                        Text("MLB posts probables only a few days out, so next week's two-start arms land here late in the week. Nothing is listed twice yet.")
                            .font(HubFont.body(12.5))
                            .foregroundStyle(.white.opacity(0.5))
                            .padding(.horizontal, 18)
                            .fixedSize(horizontal: false, vertical: true)
                    } else {
                        FantasyCardList(items: twoStarts, accent: GaryColors.gold, onTap: onTap)
                    }
                }

                if !closers.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        HubHead(title: "Closer Watch", count: closers.count)
                        FantasyCardList(items: closers, accent: HubPalette.green, onTap: onTap)
                    }
                }

                if !returners.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        HubHead(title: "Back Soon", count: returners.count)
                        FantasyCardList(items: returners, accent: .white.opacity(0.75), onTap: onTap)
                    }
                }
            }
        }
    }
}

/// The TEAM CARD (founder, Jul 26): tapping a team name anywhere in the Hub
/// lands here — the tapped signal rides the top the same way a player signal
/// rides the player card, then everything else the board knows about this
/// team today, each row routing onward by the same law.
fileprivate struct HubTeamCardSheet: View {
    let signal: Signal
    let related: [Signal]
    /// Tonight's board row for this team — matchup, first pitch, the lines.
    var tonight: TomorrowBoardRow? = nil
    let onSignal: (Signal) -> Void
    @Environment(\.dismiss) private var dismiss

    private var teamName: String { HubView.teamCardName(for: signal) }

    /// "NYY -142 · CHW +120 · O/U 8.5" — whatever the board actually has.
    private func linesLine(_ t: TomorrowBoardRow) -> String {
        func ml(_ v: Double) -> String { v > 0 ? "+\(Int(v))" : "\(Int(v))" }
        var bits: [String] = []
        if let a = t.ml_away { bits.append("\(t.away_abbr ?? "AWY") \(ml(a))") }
        if let h = t.ml_home { bits.append("\(t.home_abbr ?? "HOM") \(ml(h))") }
        if let tot = t.total { bits.append("O/U \(String(format: "%.1f", tot))") }
        return bits.joined(separator: " · ")
    }

    var body: some View {
        ZStack {
            Color(hex: "#151312").ignoresSafeArea()
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    HStack(alignment: .firstTextBaseline) {
                        VStack(alignment: .leading, spacing: 4) {
                            HubKicker(text: "TEAM", size: 10, color: GaryColors.gold)
                            Text(teamName.uppercased())
                                .font(HubFont.display(28)).tracking(0.5)
                                .foregroundStyle(GaryColors.warmWhite)
                            if !signal.game.isEmpty {
                                Text(signal.game)
                                    .font(HubFont.data(11, .semibold))
                                    .foregroundStyle(.white.opacity(0.55))
                            }
                        }
                        Spacer()
                        Button { dismiss() } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(.white.opacity(0.6))
                                .frame(width: 30, height: 30)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }

                    // Tonight at a glance (founder, Jul 30): the card mirrors
                    // the player card's shape — identity, tonight, the edge.
                    if let t = tonight {
                        VStack(alignment: .leading, spacing: 6) {
                            HubKicker(text: "Tonight", size: 10, color: GaryColors.gold)
                            HStack(alignment: .lastTextBaseline, spacing: 10) {
                                Text("\(t.away_abbr ?? t.away_team ?? "") @ \(t.home_abbr ?? t.home_team ?? "")")
                                    .font(HubFont.display(22))
                                    .foregroundStyle(GaryColors.warmWhite)
                                Spacer(minLength: 6)
                                Text(TomorrowView.etTime(t.commence_time, withZone: true, meridiem: true))
                                    .font(HubFont.data(10, .semibold))
                                    .foregroundStyle(.white.opacity(0.55))
                            }
                            let lines = linesLine(t)
                            if !lines.isEmpty {
                                Text(lines)
                                    .font(HubFont.data(11, .medium))
                                    .foregroundStyle(.white.opacity(0.7))
                            }
                        }
                    }

                    // The tapped signal — same treatment as the player card's
                    // signal banner: the edge that brought you here, in full.
                    VStack(alignment: .leading, spacing: 6) {
                        HubKicker(text: signal.kind.chip, size: 10, color: GaryColors.gold)
                        Text(signal.headline)
                            .font(HubFont.body(15, .bold)).foregroundStyle(.white.opacity(0.95))
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                        if !signal.detail.isEmpty {
                            Text(signal.detail)
                                .font(HubFont.body(13)).foregroundStyle(.white.opacity(0.88))
                                .lineSpacing(2.5)
                                .multilineTextAlignment(.leading)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        // The numbers behind the read (meta.evidence — the
                        // computer's own stored facts, Jul 27).
                        if let ev = signal.fantasy?.evidence, !ev.isEmpty, ev != signal.detail {
                            Text(ev)
                                .font(HubFont.data(10.5, .medium)).foregroundStyle(.white.opacity(0.6))
                                .lineSpacing(2)
                                .multilineTextAlignment(.leading)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: 12).fill(Color.white.opacity(0.04)))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(GaryColors.gold.opacity(0.35), lineWidth: 1))

                    if !related.isEmpty {
                        VStack(alignment: .leading, spacing: 0) {
                            HubKicker(text: "MORE ON THIS TEAM TODAY", size: 10, color: .white.opacity(0.62))
                                .padding(.bottom, 4)
                            ForEach(Array(related.enumerated()), id: \.element.id) { i, r in
                                Button { onSignal(r) } label: {
                                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                                        VStack(alignment: .leading, spacing: 2) {
                                            HubKicker(text: r.kind.chip, size: 8.5, color: .white.opacity(0.45))
                                            Text(r.headline)
                                                .font(HubFont.body(13, .semibold))
                                                .foregroundStyle(.white.opacity(0.9))
                                                .multilineTextAlignment(.leading)
                                                .fixedSize(horizontal: false, vertical: true)
                                        }
                                        Spacer(minLength: 8)
                                        Text(r.value)
                                            .font(HubFont.data(12)).foregroundStyle(.white.opacity(0.6))
                                            .lineLimit(1).minimumScaleFactor(0.7)
                                    }
                                    .padding(.vertical, 9)
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                if i < related.count - 1 { HubRule() }
                            }
                        }
                    }
                }
                .padding(18)
                .padding(.bottom, 30)
            }
        }
        .presentationDragIndicator(.visible)
    }
}

// MARK: - Last Night board

fileprivate struct HubNightBoard: View {
    let rows: [NightHighlightRow]
    /// Tap-a-name → player card (only names with a resolved card).
    var cardFor: (String?) -> PlayerInsightCardRow? = { _ in nil }
    var onPlayer: (PlayerInsightCardRow) -> Void = { _ in }
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
            // A name with a card is tappable — same ink as every other name
            // (founder, Jul 30: the gold tint was noise); the tap still opens
            // the breakdown sheet (founder, Jul 22).
            if let card = cardFor(r.player_name) {
                Button { onPlayer(card) } label: {
                    Text(NightBoard.shortPlayer(r.player_name))
                        .font(HubFont.body(13.5, .semibold))
                        .foregroundStyle(.white.opacity(0.92))
                        .lineLimit(1).minimumScaleFactor(0.7)
                        .frame(width: 108, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            } else {
                Text(NightBoard.shortPlayer(r.player_name))
                    .font(HubFont.body(13.5, .semibold))
                    .foregroundStyle(.white.opacity(0.92))
                    .lineLimit(1).minimumScaleFactor(0.7)
                    .frame(width: 108, alignment: .leading)
            }
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
                default:     Text("–").foregroundStyle(.white.opacity(0.62))
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
    /// Team tap on an On-the-Line row → close, then the team card (routing law).
    var onTeam: (StreakRow) -> Void = { _ in }
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
            VStack(alignment: .leading, spacing: 26) {
                header
                if edges.isEmpty {
                    Text("No edges posted for this game yet — they land as lineups and matchups firm up.")
                        .font(HubFont.body(15)).foregroundStyle(.white.opacity(0.62))
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
                        HubStreakWatch(rows: streaks, onTeam: { onTeam($0) })
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
        VStack(alignment: .leading, spacing: 10) {
            if ls?.isLive == true {
                HubKicker(text: "Live", size: 12.5, color: GaryColors.win)
            } else if ls?.isFinal == true {
                HubKicker(text: "Final", size: 12.5, color: .white.opacity(0.62))
            } else {
                HubKicker(text: "Tonight", size: 12.5, color: GaryColors.gold)
            }
            Text("\(row.away_team ?? hubSideLabel(row.away_abbr, nil)) @ \(row.home_team ?? hubSideLabel(row.home_abbr, nil))")
                .font(HubFont.display(30))
                .foregroundStyle(GaryColors.warmWhite)
                .fixedSize(horizontal: false, vertical: true)
            if let ls, ls.isLive || ls.isFinal {
                HStack(spacing: 10) {
                    Text(ls.scoreLine ?? "")
                        .font(HubFont.data(17))
                        .foregroundStyle(.white.opacity(0.95))
                    if ls.isLive, let det = ls.detail, !det.isEmpty {
                        Text("▶ \(det.uppercased())")
                            .font(HubFont.data(13, .medium))
                            .foregroundStyle(GaryColors.win)
                    }
                }
            } else {
                HStack(spacing: 8) {
                    Text(TomorrowView.etTime(row.commence_time))
                        .font(HubFont.data(13.5, .medium))
                        .foregroundStyle(.white.opacity(0.7))
                    if let v = row.venue, !v.isEmpty {
                        Text(v).font(HubFont.body(13.5)).foregroundStyle(.white.opacity(0.62)).lineLimit(1)
                    }
                }
                // The lines, quietly (meta, never the headline).
                HStack(spacing: 22) {
                    if let t = row.total { numberStat("O/U", HubFmt.stat(t)) }
                    if let sp = row.spread {
                        numberStat("Spread \(hubSideLabel(row.home_abbr, row.home_team))", HubFmt.stat(sp))
                    }
                    if let mh = row.ml_home, let ma = row.ml_away {
                        numberStat("ML", "\(hubSideLabel(row.home_abbr, row.home_team)) \(fmtML(mh)) · \(hubSideLabel(row.away_abbr, row.away_team)) \(fmtML(ma))")
                    }
                }
                .padding(.top, 6)
            }
        }
        .padding(.horizontal, 18)
    }

    private func numberStat(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label.uppercased()).font(HubFont.kicker(10.5)).tracking(0.6).foregroundStyle(.white.opacity(0.62))
            Text(value).font(HubFont.data(15)).foregroundStyle(.white.opacity(0.92))
        }
    }

    private var cta: some View {
        Button { onClose(); onViewGame(abbrMatchup) } label: {
            HStack(spacing: 8) {
                Text("VIEW GAME ON PICKS")
                Image(systemName: "arrow.right")
            }
            .font(HubFont.data(15))
            .foregroundStyle(GaryColors.gold)
            .frame(maxWidth: .infinity).padding(.vertical, 16)
            .background(Capsule().fill(Color.black))
            .overlay(Capsule().stroke(GaryColors.gold, lineWidth: 1.5))
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
                        .foregroundStyle(hubValueTint(signal))
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
                    .foregroundStyle(.white.opacity(0.62)).lineLimit(1)
            }
        }
        .padding(.horizontal, 18).padding(.vertical, 10)
    }
}
