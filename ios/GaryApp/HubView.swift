import SwiftUI

// ============================================================================
// THE HUB — daily observations, specialist boards and full player/team reads
//
// (The Receipts section came off the page Aug 6 — graded rows
// now surface only through search.)
//
//
// Data machinery (staleness gates, 6am ET rollover, graded-date walk-back,
// kept-alive-tab visibility flips) is carried over from the original Hub page
// (PropsHubView, removed Jul 4 2026 once the founder approved this one) — that
// plumbing encodes weeks of fixed production bugs and is presentation-free.
// ============================================================================

// MARK: - Type + chrome system

/// Compatibility aliases for existing call sites, including Picks. These
/// forward to GaryFonts; the Hub's current scalable type modifiers follow below.
/// This namespace does not prescribe typography for future work.
enum HubFont {
    /// → GaryFonts.display. The weight arg was already ignored (Bebas has one).
    static func display(_ size: CGFloat, _ weight: Font.Weight = .heavy) -> Font {
        _ = weight
        return GaryFonts.display(size)
    }
    /// → GaryFonts.kicker. Uppercase at the call site.
    static func kicker(_ size: CGFloat = 10.5) -> Font { GaryFonts.kicker(size) }
    /// → GaryFonts.data. Tabular digits, 12pt floor, 1.18 scale.
    static func data(_ size: CGFloat, _ weight: Font.Weight = .bold) -> Font {
        GaryFonts.data(size, weight)
    }
    /// → GaryFonts.ui. Exact size, no scaling.
    static func body(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        GaryFonts.ui(size, weight)
    }
}

/// Native, scalable typography for the Hub. Reading text, numerical context
/// and gold mono labels have distinct roles without forced all-caps headlines.
fileprivate struct HubScaledText: ViewModifier {
    @ScaledMetric private var size: CGFloat
    let weight: Font.Weight
    let tabular: Bool
    let design: Font.Design

    init(size: CGFloat, weight: Font.Weight, tabular: Bool, relativeTo: Font.TextStyle, design: Font.Design = .default) {
        _size = ScaledMetric(wrappedValue: size, relativeTo: relativeTo)
        self.weight = weight
        self.tabular = tabular
        self.design = design
    }

    func body(content: Content) -> some View {
        content.font(tabular ? .system(size: size, weight: weight, design: design).monospacedDigit()
                            : .system(size: size, weight: weight, design: design))
    }
}

extension View {
    func hubBodyFont(_ size: CGFloat, _ weight: Font.Weight = .regular) -> some View {
        modifier(HubScaledText(size: max(14, size), weight: weight, tabular: false, relativeTo: .body))
    }
    func hubDataFont(_ size: CGFloat, _ weight: Font.Weight = .bold) -> some View {
        modifier(HubScaledText(size: max(12, size), weight: weight, tabular: true, relativeTo: .caption))
    }
    func hubKickerFont(_ size: CGFloat = 10.5) -> some View {
        modifier(HubScaledText(size: max(11, size), weight: .medium, tabular: true, relativeTo: .caption, design: .monospaced))
    }
    func hubTitleFont(_ size: CGFloat, _ weight: Font.Weight = .bold) -> some View {
        modifier(HubScaledText(size: size, weight: weight, tabular: false, relativeTo: .title))
    }
}

/// Gold mono kicker — the lane/section label idiom (no chips, no boxes).
fileprivate struct HubKicker: View {
    let text: String
    var size: CGFloat = 10.5
    var color: Color = GaryColors.gold
    var body: some View {
        Text(text.uppercased())
            .hubKickerFont(size)
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
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(title)
                    .hubTitleFont(19, .semibold)
                    .foregroundStyle(GaryColors.warmWhite)
                    .fixedSize(horizontal: false, vertical: true)
                if let count, count > 0 {
                    Text("\(count)")
                        .hubDataFont(13)
                        .foregroundStyle(.white.opacity(0.7))
                }
                Spacer(minLength: 0)
                if let sub, !sub.isEmpty {
                    Text(sub.uppercased())
                        .hubKickerFont(11).tracking(0.8)
                        .foregroundStyle(.white.opacity(0.62))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(.horizontal, GaryLayout.gutter)
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
    // HR Threat prices are a price, not a hot/cold verdict — same carve-out
    // as O/U streaks above (founder, Aug 4: the green odds "read as already
    // graded"). Cosmetic only: s.tone itself is untouched, so the morning
    // grader's branch on it is unaffected.
    if s.kind == .hrThreat { return GaryColors.gold }
    return s.tone.color
}

/// A specialist board keeps its complete renderer behind one clear disclosure.
/// The compact first page gives the lead room without dropping the long tail.
fileprivate struct HubBoardSection<Content: View>: View {
    let anchor: String
    @Binding var open: Set<String>
    let title: String
    var count: Int? = nil
    @ViewBuilder let content: () -> Content

    private var isOpen: Bool { open.contains(anchor) }

    private var summary: String? {
        switch anchor {
        case "regression": return "Results, contact quality and what may change"
        case "streaks": return "Runs of form worth a closer look"
        case "hr": return "Power and today's pitching matchups"
        case "bats": return "Hitting form and opposing arms"
        case "arms": return "Starters, recent work and pitch profiles"
        case "nrfi": return "How the opening inning could unfold"
        case "mismatch": return "Where the teams meet unevenly"
        case "trenches": return "Protection, pressure and the line of scrimmage"
        case "field": return "Quarterbacks and player availability"
        case "edges": return "Coverage, game pace and scoring situations"
        case "form": return "Recent performance in context"
        case "series": return "What the previous meetings tell us"
        case "schedule": return "Rest, travel and the next matchup"
        case "availability": return "The latest player context"
        default: return nil
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    if isOpen { open.remove(anchor) } else { open.insert(anchor) }
                }
            } label: {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(title).hubBodyFont(17, .semibold)
                            .foregroundStyle(GaryColors.warmWhite)
                        if let summary, !isOpen {
                            Text(summary).hubBodyFont(13)
                                .foregroundStyle(GaryColors.sectionSub)
                        }
                    }
                    .fixedSize(horizontal: false, vertical: true)
                    .multilineTextAlignment(.leading)
                    Spacer(minLength: 0)
                    if let count, count > 0 {
                        Text("\(count)")
                            .hubDataFont(11, .medium)
                            .foregroundStyle(GaryColors.sectionSub)
                    }
                    Image(systemName: "chevron.right")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(GaryColors.gold)
                        .rotationEffect(.degrees(isOpen ? 90 : 0))
                }
                .padding(18)
                .frame(minHeight: 52)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(title)
            .accessibilityValue("\(count.map { "\($0) \($0 == 1 ? "item" : "items"), " } ?? "")\(isOpen ? "expanded" : "collapsed")")
            .accessibilityHint(isOpen ? "Collapse board" : [summary, "Expand board"].compactMap { $0 }.joined(separator: ". "))
            if isOpen {
                HubRule().padding(.horizontal, 20)
                content().padding(.vertical, 12)
            }
        }
        .garyPanel(radius: GaryLayout.Radius.card, fill: GaryColors.readingPanel)
        .padding(.horizontal, GaryLayout.gutter)
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
                        .hubTitleFont(30)
                        .foregroundStyle(.white)
                    Spacer(minLength: 8)
                    Text("TONIGHT · 8:00 PM ET")
                        .hubKickerFont(11.5).tracking(1.0)
                        .foregroundStyle(GaryColors.gold)
                }

                if isDerbyDay {
                    Text("NEW FORMAT — 20 SWINGS IN ROUND ONE · TOP FOUR ADVANCE · ON NETFLIX")
                        .hubKickerFont(10.5).tracking(0.8)
                        .foregroundStyle(.white.opacity(0.62))

                    // The winner board — market order, prices on the right,
                    // Gary's break-from-chalk row ticked in gold.
                    VStack(alignment: .leading, spacing: 0) {
                        HStack {
                            Text("TO WIN")
                                .hubKickerFont(10).tracking(1.2)
                                .foregroundStyle(.white.opacity(0.55))
                            Spacer(minLength: 8)
                            Text("FANDUEL · MIDDAY")
                                .hubKickerFont(10).tracking(0.8)
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
                                    .hubKickerFont(10).tracking(0.6)
                                    .foregroundStyle(.white.opacity(0.55))
                                Spacer(minLength: 8)
                                Text(p.price)
                                    .hubDataFont(14.5)
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
                            .hubKickerFont(10.5).tracking(0.8)
                            .foregroundStyle(.white.opacity(0.62))
                        Spacer(minLength: 8)
                        Text("CEASE (AL) VS SÁNCHEZ (NL)")
                            .hubKickerFont(10.5).tracking(0.8)
                            .foregroundStyle(.white.opacity(0.75))
                    }
                } else {
                    Text("CEASE (AL) VS SÁNCHEZ (NL) · MLB RETURNS FRIDAY")
                        .hubKickerFont(10.5).tracking(0.8)
                        .foregroundStyle(.white.opacity(0.62))
                }

                Text(isDerbyDay ? "GARY'S BOARD — 5 PICKS · ON THE PICKS TAB"
                                : "GARY'S BOARD — ON THE PICKS TAB")
                    .hubKickerFont(10.5).tracking(1.0)
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
                    .hubKickerFont(10.5).tracking(1.2)
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
        // A streak value is ALWAYS an echo — "TB have won 9 straight" beside a
        // green W9 says the same thing twice (founder, Aug 14). The literal
        // check below can't catch it because the headline never contains the
        // "W9" token itself.
        if kind == .streak { return true }
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

fileprivate extension HubLeagueSel {
    /// MLB's compact Fantasy watch lives inside the Hub; NFL keeps its weekly desk.
    var supportsFantasy: Bool { self == .nfl }
}

struct HubView: View {
    /// Whether the Hub tab is frontmost. ContentView keeps tab pages alive
    /// (opacity-switched), so visibility flips drive the staleness refetch
    /// and deep-link consumption instead of onAppear/.task.
    var isVisible: Bool = true
    var onSelectGame: (String, String?, Int?) -> Void = { _, _, _ in }

    @StateObject private var focus = HubFocusState.shared
    @ObservedObject private var liveScores = LiveScoreCache.shared
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var loadTask: Task<Void, Never>? = nil
    @State private var loadGeneration: UInt64 = 0
    @State private var requestDate = ""
    @State private var connectionSnapshots: [HubLeagueSel: Data] = [:]
    @State private var boardFetchFailed = false
    @State private var boardLoading = false
    @State private var intelLoading = false
    @State private var intelFetchFailed = false
    @State private var pulseLoadingLeagues: Set<String> = []
    @State private var pulseErrorLeagues: Set<String> = []
    @State private var historyLoading = false
    @State private var historyFetchFailed = false
    @State private var historyDate = ""
    @State private var mastheadOffscreen = false

    @State private var sel: HubLeagueSel = .mlb
    @State private var selectedSignal: Signal? = nil
    private struct PlayerRead: Identifiable {
        let signal: Signal
        let card: PlayerInsightCardRow
        var id: UUID { signal.id }
    }
    @State private var playerRead: PlayerRead? = nil
    @State private var teamCardSignal: Signal? = nil
    @State private var fantasyRefreshToken = UUID()
    @State private var frontPageNow = Date()

    /// Player-backed signals open their populated player card — MLB always,
    /// football when today's pack exists for the id. Team-backed rows use
    /// the team card, with the compact signal overlay as the safe fallback.
    private func openSignal(_ s: Signal) {
        // A populated, exact current-day/game card carries the full original
        // read. Never refetch a player without the doubleheader's game id.
        if let index = researchPlayerIndex(s) {
            playerRead = PlayerRead(signal: s, card: intelCards[index])
            return
        }
        // The college poll lane describes both sides of a matchup. Its
        // provider game id opens that game's existing sheet; the writer's
        // home-team bookkeeping id must not turn the story into a team card.
        if s.league == .ncaaf, s.lane?.source == "balldontlie_ncaaf_rankings" {
            let matches = slateRows.filter { row in
                HubCardIdentity.sameLeague(row.league, s.league.label)
                    && s.gameId != nil && row.bdl_game_id.map(String.init) == s.gameId
            }
            if matches.count == 1 { gameSheet = HubGameSel(row: matches[0]) }
            else { selectedSignal = s }
            return
        }
        // 2. A row the lanes stamped with a TEAM and no player is a team row —
        // a bullpen, a head-to-head, a one-run record — and it opens the team
        // card (the law, Aug 4 2026). This sits ahead of the name lookup so a
        // club's own name can never be read as a player's.
        if s.playerId == nil, s.teamId != nil || s.h2h != nil {
            teamCardSignal = s
            return
        }
        // Keep a player story's own full read when its exact card is absent.
        if s.playerId != nil { selectedSignal = s; return }
        // Team context without a populated player card uses the team page.
        if s.teamId != nil || s.h2h != nil { teamCardSignal = s }
        else { selectedSignal = s }
    }

    /// The visible action and the tap share the same exact-card eligibility.
    /// A missing player pack opens the observation, never an unrelated card.
    private func researchPlayerIndex(_ s: Signal) -> Int? {
        guard s.reg?.day != "tomorrow",
              s.playerId != nil || (s.teamId == nil && s.h2h == nil),
              !(s.league == .ncaaf && s.lane?.source == "balldontlie_ncaaf_rankings") else { return nil }
        return HubStoryIdentity.playerCardIndex(
            league: s.league.label, slateDate: s.slateDate,
            playerID: s.playerId, playerName: Self.signalPlayerName(s), gameID: s.gameId,
            loadedDate: loadedDate, currentDate: SupabaseAPI.todayEST(),
            candidates: intelCards.map {
                .init(league: $0.league, playerID: $0.player_id, gameID: $0.game_id,
                      name: $0.player_name ?? $0.payload?.name, hasPayload: $0.payload != nil)
            })
    }

    private func researchDestination(_ s: Signal) -> String {
        if researchPlayerIndex(s) != nil { return "Player research" }
        if s.league == .ncaaf, s.lane?.source == "balldontlie_ncaaf_rankings" {
            let count = slateRows.filter {
                HubCardIdentity.sameLeague($0.league, s.league.label)
                    && s.gameId != nil && $0.bdl_game_id.map(String.init) == s.gameId
            }.count
            return count == 1 ? "Game research" : "View insight"
        }
        if s.playerId == nil, s.teamId != nil || s.h2h != nil { return "Team research" }
        return "View insight"
    }

    /// The player a row is about, as the row spells him. Lanes append their own
    /// punctuation ("Max Scherzer: 6.16 ERA", "Grant Taylor /
    /// Bryan Hudson"), so the name is the head of the headline. Hyphens stay —
    /// Crow-Armstrong is one name.
    static func signalPlayerName(_ s: Signal) -> String {
        let head = s.headline.components(separatedBy: CharacterSet(charactersIn: ":(,/·—")).first ?? s.headline
        return head.trimmingCharacters(in: .whitespaces)
    }

    /// The display name a team card is about (mirrors the sheet's own header).
    static func teamCardName(for s: Signal) -> String {
        if let h = s.h2h, let d = h.dominant_name, !d.isEmpty { return d }
        if let t = s.fantasy?.team, !t.isEmpty { return t }
        if let t = s.swap?.team, !t.isEmpty { return t }
        if let t = s.lane?.team, !t.isEmpty { return t }
        if let t = s.lane?.team_abbr, !t.isEmpty { return t }
        if s.kind == .bullpenFatigue, let range = s.headline.range(of: " pen: ") {
            return String(s.headline[..<range.lowerBound])
        }
        if s.kind == .teamRecord, let range = s.headline.range(of: #" \d+-\d+ in "#, options: .regularExpression) {
            return String(s.headline[..<range.lowerBound])
        }
        if s.kind == .regression, s.playerId == nil,
           let range = s.headline.range(of: #" are \d+-\d+ in one-run games"#, options: .regularExpression) {
            return String(s.headline[..<range.lowerBound])
        }
        if s.league == .mlb, s.kind == .streak, s.teamId != nil,
           let code = s.headline.split(separator: " ").first.map(String.init),
           mlbTeamKeywords[code] != nil {
            return code
        }
        return s.headline
    }

    /// Everything else tonight about this team — id-exact when the signal
    /// carries one, name match otherwise (streak-seeded cards have no id).
    private func relatedTeamSignals(for s: Signal) -> [Signal] {
        // Tomorrow's projections have their own board and must not appear as
        // today's team evidence, even when the same clubs play both days.
        let todaySignals = leagueSignals.filter { $0.reg?.day != "tomorrow" }
        if let tid = s.teamId {
            return todaySignals.filter { $0.id != s.id && $0.teamId == tid }
        }
        let name = Self.teamCardName(for: s)
        return todaySignals.filter { r in
            r.id != s.id && r.league == s.league
                && HubCardIdentity.matchesTeam(Self.teamCardName(for: r), name: name, abbr: nil, league: s.league.label)
        }
    }

    /// Only a unique team within the selected league can own a slate row.
    private func slateRowForTeamName(_ name: String) -> TomorrowBoardRow? {
        let candidates = slateRows.filter { r in
            guard HubCardIdentity.sameLeague(r.league, sel.label) else { return false }
            let away = HubCardIdentity.matchesTeam(name, name: r.away_team, abbr: r.away_abbr, league: sel.label)
            let home = HubCardIdentity.matchesTeam(name, name: r.home_team, abbr: r.home_abbr, league: sel.label)
            return away != home
        }
        return candidates.count == 1 ? candidates[0] : nil
    }

    private func slateRowForTeamSignal(_ signal: Signal) -> TomorrowBoardRow? {
        if let id = signal.gameId, !id.isEmpty {
            let matches = (todayBoard?.board ?? []).filter {
                HubCardIdentity.sameLeague($0.league, signal.league.label)
                    && $0.bdl_game_id.map(String.init) == id
            }
            return matches.count == 1 ? matches[0] : nil
        }
        guard signal.league == sel else { return nil }
        return slateRowForTeamName(Self.teamCardName(for: signal))
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

    /// ANY team string — full name, nickname, or a bare abbr out of an agate
    /// table cell — opens the team card (the law, Aug 4: a tapped team name
    /// opens the team card, everywhere, no exceptions). The sheet resolves
    /// the string against the day board for its full identity.
    private func openTeamCard(named name: String) {
        let clean = name.trimmingCharacters(in: .whitespaces)
        guard !clean.isEmpty else { return }
        teamCardSignal = Signal(
            league: sel, kind: .teamRecord, headline: clean,
            detail: "", game: "", value: "", tone: .neutral)
    }
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
    /// Current-day insight transport/schema failures, tracked per desk. A
    /// healthy MLB response must never make a broken NFL/NCAAF feed look like
    /// an honest empty board.
    @State private var fetchErrorLeagues: Set<HubLeagueSel> = []
    /// Yesterday's graded tally.
    @State private var hitRate: (hit: Int, graded: Int)? = nil
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
    /// staleness refetch cover it like everything else on the page. Since
    /// Aug 27 2026 the pipeline writes NFL/NCAAF tabs too — one dict keyed by
    /// league label, the same generic table renderer for every desk.
    @State private var pulseByLeague: [String: [LeaguePulseRow]] = [:]
    @State private var pulseTab: String? = nil
    private var pulseRows: [LeaguePulseRow] { pulseByLeague[sel.label] ?? [] }
    @State private var pendingScrollAnchor: String? = nil
    /// Beats currently expanded past their top rows ("See all n").
    @AppStorage("hubOpenResearchModulesV1") private var savedOpenBeats = "{}"
    private var openBeats: Set<String> {
        get { HubResearchLayout.openSections(in: savedOpenBeats, league: sel.label) }
        nonmutating set { savedOpenBeats = HubResearchLayout.saving(newValue, league: sel.label, in: savedOpenBeats) }
    }
    private var openBeatsBinding: Binding<Set<String>> {
        Binding(get: { openBeats }, set: { openBeats = $0 })
    }
    @State private var researchChartSignal: Signal?
    /// THE BOARD IS MOVING → THE LADDER for the tapped game (Sep 9 2026).
    @State private var ladderSel: LineLadderSel?
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
            let key = HubStoryIdentity.dedupeKey(
                league: s.league.label, slateDate: s.slateDate, gameID: s.gameId,
                game: s.game, kind: String(describing: s.kind), subject: subj, variant: s.reg?.day)
            if seen.insert(key).inserted { out.append(s) }
        }
        return out
    }

    private func items(_ k: SignalKind) -> [Signal] { itemsIndex[sel]?[k] ?? [] }

    /// Name → today's player card, punctuation/case-tolerant. Only names that
    /// resolve become tappable (founder, Jul 22: click a name, get the card).
    private func intelCard(for name: String?, league: HubLeagueSel? = nil) -> PlayerInsightCardRow? {
        guard loadedDate == SupabaseAPI.todayEST(), let name, !name.isEmpty else { return nil }
        let candidates = intelCards.filter { HubCardIdentity.sameLeague($0.league, (league ?? sel).label) }
        guard let index = HubCardIdentity.uniquePlayerIndex(name, names: candidates.map { $0.player_name ?? $0.payload?.name ?? "" }) else { return nil }
        guard candidates[index].payload != nil else { return nil }
        return candidates[index]
    }

    private var selStreakRows: [StreakRow] {
        streakRows.filter { ($0.league ?? "MLB").uppercased() == sel.label }
    }
    private var selNightRows: [NightHighlightRow] {
        nightRows.filter { ($0.league ?? "MLB").uppercased() == sel.label }
    }
    private var selYdaySignals: [Signal] { ydaySignals.filter { $0.league == sel } }

    private var availableLeagues: [HubLeagueSel] {
        let order: [HubLeagueSel] = [.mlb, .nfl, .ncaaf, .nba]
        let supported = Set(AppFlags.insightLeagues)
        let permanentDesks: Set<HubLeagueSel> = [.mlb, .nfl, .ncaaf]
        let present = order.filter { lg in
            supported.contains(lg.label) && (
                permanentDesks.contains(lg)
                || fetched.contains { $0.league == lg }
                || (todayBoard?.board ?? []).contains { ($0.league ?? "").uppercased() == lg.label }
            )
        }
        return present.isEmpty ? [.mlb] : present
    }

    @MainActor private func load() async {
        let date = SupabaseAPI.todayEST()
        if let task = loadTask, requestDate == date { await task.value; return }
        loadTask?.cancel()
        loadGeneration &+= 1
        let generation = loadGeneration
        requestDate = date
        let forceRefresh = didLoad
        resetForSlate(date)
        boardLoading = true
        intelLoading = true
        pulseLoadingLeagues = ["MLB", "NFL", "NCAAF"]
        historyLoading = true
        // The shared owner survives cancellation of an individual view/gesture.
        let task = Task { await performLoad(date: date, generation: generation, forceRefresh: forceRefresh) }
        loadTask = task
        await task.value
        guard loadGeneration == generation else { return }
        loadTask = nil
        if date != SupabaseAPI.todayEST() { await load() }
    }

    @MainActor private func resetForSlate(_ date: String) {
        guard loadedDate != date else { return }
        fetched = []; itemsIndex = [:]; connectionSnapshots = [:]
        todayBoard = nil; intelCards = []; pulseByLeague = [:]
        ydaySignals = []; streakRows = []; nightRows = []; hitRate = nil; historyDate = ""
        fetchErrorLeagues = []; boardFetchFailed = false
        intelFetchFailed = false; pulseErrorLeagues = []; historyFetchFailed = false
        selectedSignal = nil; playerRead = nil; teamCardSignal = nil; namedCard = nil; gameSheet = nil
        loadedAt = nil; didLoad = false; loadedDate = date
    }

    @MainActor private func acceptsLoad(_ date: String, generation: UInt64) -> Bool {
        !Task.isCancelled && generation == loadGeneration
            && loadedDate == date && date == SupabaseAPI.todayEST()
    }

    @MainActor private func performLoad(date: String, generation: UInt64, forceRefresh: Bool) async {
        // Primary content owns first paint. Support starts at the same time;
        // each branch publishes independently once the current slate is ready.
        let primary = Task { await loadCurrent(date: date, generation: generation) }
        async let intel: Void = loadIntel(date: date, generation: generation, forceRefresh: forceRefresh, after: primary)
        async let mlb: Void = loadPulse(date: date, league: "MLB", generation: generation, forceRefresh: forceRefresh, after: primary)
        async let nfl: Void = loadPulse(date: date, league: "NFL", generation: generation, forceRefresh: forceRefresh, after: primary)
        async let ncaaf: Void = loadPulse(date: date, league: "NCAAF", generation: generation, forceRefresh: forceRefresh, after: primary)
        async let history: Void = loadHistory(date: date, generation: generation, after: primary)
        _ = await (primary.value, intel, mlb, nfl, ncaaf, history)
    }

    @MainActor private func loadCurrent(date: String, generation: UInt64) async {
        async let boardFetch = SupabaseAPI.fetchTodayBoardResult(date: date)
        var successful: [HubLeagueSel: [Connection]] = [:]
        var failures: Set<HubLeagueSel> = []
        var cancelled: Set<HubLeagueSel> = []
        await withTaskGroup(of: (HubLeagueSel?, [Connection], Bool, Bool).self) { group in
            for lg in AppFlags.insightLeagues {
                group.addTask {
                    do {
                        // Await before forming the tuple: an inline await here
                        // misassigns league keys in optimized Release builds.
                        let rows = try await SupabaseAPI.fetchInsightConnections(date: date, league: lg)
                        guard rows.allSatisfy({ $0.date == date && $0.league?.uppercased() == lg }) else {
                            return (HubLeagueSel.from(lg), [], true, false)
                        }
                        return (HubLeagueSel.from(lg), rows, false, false)
                    } catch {
                        return (HubLeagueSel.from(lg), [], true, SupabaseAPI.isCancellation(error))
                    }
                }
            }
            for await result in group {
                guard let league = result.0 else { continue }
                if result.3 { cancelled.insert(league) }
                else if result.2 { failures.insert(league) }
                else { successful[league] = result.1 }
            }
        }
        let boardResult = await boardFetch
        guard acceptsLoad(date, generation: generation) else { return }
        var resolved = fetched.filter { $0.slateDate == date }
        var changed = resolved.count != fetched.count
        for lg in AppFlags.insightLeagues {
            guard let league = HubLeagueSel.from(lg), let rows = successful[league] else { continue }
            let snapshot = PicksContentEquality.encoded(rows)
            if let snapshot, connectionSnapshots[league] == snapshot { continue }
            resolved.removeAll { $0.league == league }
            resolved.append(contentsOf: rows.compactMap { $0.toSignal() })
            connectionSnapshots[league] = snapshot
            changed = true
        }
        if changed {
            fetched = Self.dedupe(resolved)
            itemsIndex = Self.buildItemsIndex(fetched)
        }
        let errors = failures.union(fetchErrorLeagues.intersection(cancelled))
        if fetchErrorLeagues != errors { fetchErrorLeagues = errors }
        switch boardResult {
        case .success(let board):
            todayBoard = board
            boardFetchFailed = false
        case .failure(let error):
            if !SupabaseAPI.isCancellation(error) { boardFetchFailed = true }
        }
        boardLoading = false
        didLoad = true
        loadedAt = Date()
        consumeFocus()
    }

    @MainActor private func loadIntel(date: String, generation: UInt64, forceRefresh: Bool, after primary: Task<Void, Never>) async {
        let result = await SupabaseAPI.fetchPlayerIntelRowsResult(date: date, forceRefresh: forceRefresh)
        await primary.value
        guard acceptsLoad(date, generation: generation) else { return }
        if result.succeeded || !result.rows.isEmpty { intelCards = result.rows }
        if !result.cancelled { intelFetchFailed = !result.succeeded }
        intelLoading = false
    }

    @MainActor private func loadPulse(date: String, league: String, generation: UInt64, forceRefresh: Bool, after primary: Task<Void, Never>) async {
        let result = await SupabaseAPI.fetchLeaguePulseResult(date: date, league: league, forceRefresh: forceRefresh)
        await primary.value
        guard acceptsLoad(date, generation: generation) else { return }
        if result.succeeded || !result.rows.isEmpty { pulseByLeague[league] = result.rows }
        if !result.cancelled {
            if result.succeeded { pulseErrorLeagues.remove(league) }
            else { pulseErrorLeagues.insert(league) }
        }
        pulseLoadingLeagues.remove(league)
    }

    @MainActor private func loadHistory(date: String, generation: UInt64, after primary: Task<Void, Never>) async {
        let gradedDate0 = SupabaseAPI.hubGradedDateEST()
        async let rateFetch = SupabaseAPI.fetchInsightHitRateResult(date: gradedDate0)
        async let nightFetch = SupabaseAPI.fetchNightHighlightsResult(date: gradedDate0)
        async let streakFetch = SupabaseAPI.fetchStreaksResult()
        var gradedDate = gradedDate0
        var rateResult = await rateFetch
        var nightResult = await nightFetch
        // Only a verified empty publication warrants looking back another day.
        if case .success(nil) = rateResult, case .success(let rows) = nightResult,
           rows.isEmpty, let back = Self.shiftDate(gradedDate, by: -1) {
            gradedDate = back
            async let previousRate = SupabaseAPI.fetchInsightHitRateResult(date: back)
            async let previousNight = SupabaseAPI.fetchNightHighlightsResult(date: back)
            rateResult = await previousRate
            nightResult = await previousNight
        }
        let streakResult = await streakFetch
        let receiptsDate = gradedDate
        var successful: Set<HubLeagueSel> = []
        var yday: [Signal] = []
        await withTaskGroup(of: (HubLeagueSel?, [Signal]?).self) { group in
            for lg in AppFlags.insightLeagues {
                group.addTask {
                    let rows = try? await SupabaseAPI.fetchInsightConnections(date: receiptsDate, league: lg)
                    return (HubLeagueSel.from(lg), rows.map { $0.compactMap { $0.toSignal() }.filter { $0.result != nil } })
                }
            }
            for await (league, rows) in group {
                if let league, let rows { successful.insert(league); yday.append(contentsOf: rows) }
            }
        }
        await primary.value
        guard acceptsLoad(date, generation: generation) else { return }
        // Retained values keep their actual publication date. A different
        // history date must never borrow values from the previous heading.
        if historyDate != receiptsDate { hitRate = nil; nightRows = []; historyDate = receiptsDate }
        if case .success(let rate) = rateResult { hitRate = rate }
        if case .success(let night) = nightResult { nightRows = night }
        if case .success(let streaks) = streakResult { streakRows = streaks }
        let retained = ydaySignals.filter { $0.slateDate == receiptsDate && !successful.contains($0.league) }
        ydaySignals = Self.dedupe(yday + retained)
        historyFetchFailed = successful.count < AppFlags.insightLeagues.count
            || Self.failedSupport(rateResult) || Self.failedSupport(nightResult) || Self.failedSupport(streakResult)
        gradedIsYesterday = gradedDate == gradedDate0
        if gradedIsYesterday { gradedDayShort = "" }
        else {
            let input = DateFormatter(); input.dateFormat = "yyyy-MM-dd"; input.timeZone = TimeZone(identifier: "America/New_York")
            let output = DateFormatter(); output.dateFormat = "EEE, MMM d"; output.timeZone = input.timeZone
            gradedDayShort = input.date(from: gradedDate).map { output.string(from: $0) } ?? ""
        }
        historyLoading = false
    }

    private static func failedSupport<Value>(_ result: Result<Value, Error>) -> Bool {
        if case .failure(let error) = result { return !SupabaseAPI.isCancellation(error) }
        return false
    }

    private func reloadIfStale() async {
        guard didLoad else { return }
        let expired = loadedAt.map { Date().timeIntervalSince($0) >= 300 } ?? true
        let emptyBoard = fetched.isEmpty && ydaySignals.isEmpty
        if loadedDate != SupabaseAPI.todayEST() || expired || !fetchErrorLeagues.isEmpty || boardFetchFailed || intelFetchFailed || !pulseErrorLeagues.isEmpty || historyFetchFailed || emptyBoard {
            await load()
        }
    }

    /// Deep-linked lane → its section anchor on the new page. A missing anchor
    /// no-ops harmlessly; the request stays pending until the page can render.
    private func consumeFocus() {
        guard focus.focusLane != nil, didLoad, !fetchErrorLeagues.contains(sel) else { return }
        guard let lane = focus.focusLane else { return }
        focus.focusLane = nil
        searchText = ""
        searchOpen = false
        searchFocused = false
        if Self.fantasyKinds.contains(lane), sel == .mlb {
            hubScope = "hub"
            pendingScrollAnchor = "fantasy"
            return
        }
        if Self.fantasyKinds.contains(lane), sel.supportsFantasy {
            hubScope = "fantasy"
            pendingScrollAnchor = "top"
            return
        }
        hubScope = "hub"
        let selection = frontPageSelection
        let front = [selection.lead].compactMap { $0 } + selection.best
        let anchor: String
        if front.contains(where: { $0.kind == lane }) {
            anchor = "lead"
        } else if lane == .regression, !items(.regression).isEmpty {
            anchor = "regression"
        } else if lane == .streak, !selStreakRows.isEmpty {
            anchor = "streaks"
        } else if lane == .nextSlate, showsNextSlateCard {
            anchor = "nextSlate"
        } else if let beat = beats.first(where: {
            $0.kinds.contains(lane) && !beatRows($0).isEmpty
        }) {
            anchor = beat.anchor
        } else if overflow.contains(where: { $0.kind == lane }) {
            anchor = "more"
        } else {
            anchor = "top"
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

    /// The page's rows for the selected league. Football's fail-closed proof
    /// contract runs HERE — the one funnel every football surface downstream
    /// (the lead, the board, the beats, the overflow net, the jump nav, page
    /// search) draws from, so an unverifiable receipt or market range can
    /// never appear anywhere on the Hub, in any component.
    private var isFootball: Bool { sel == .nfl || sel == .ncaaf }

    private var leagueSignals: [Signal] {
        fetched.filter { $0.league == sel && isEligibleHubSignal($0) }
    }

    private func isEligibleHubSignal(_ signal: Signal) -> Bool {
        guard signal.league == .nfl || signal.league == .ncaaf else { return true }
            switch signal.kind {
            case .afterGary:
                return FootballProofContract.isRenderableAfterGary(signal)
            case .theSweat:
                return FootballProofContract.isRenderableSweat(signal, includeWatch: false)
            case .marketRange:
                // NCAAF only, and only against a confirmed slate row.
                guard signal.league == .ncaaf, let id = signal.gameId.flatMap(Int.init) else { return false }
                return FootballProofContract.isRenderableMarketRange(
                    signal, slateRow: (todayBoard?.board ?? []).first(where: {
                        $0.bdl_game_id == id && HubCardIdentity.sameLeague($0.league, signal.league.label)
                    })
                )
            default:
                return true
            }
    }

    /// Every edge the Hub carries for one slate game (league + provider id,
    /// then names only when an id is absent). Look-ahead regression rows are excluded — their
    /// `game` names TOMORROW's matchup, which collides on series nights.
    private func edgesFor(_ r: TomorrowBoardRow) -> [Signal] {
        let full = "\(r.away_team ?? "") @ \(r.home_team ?? "")"
        let abbr = "\(r.away_abbr ?? "") @ \(r.home_abbr ?? "")".uppercased()
        return leagueSignals.filter { s in
            guard HubCardIdentity.sameLeague(r.league, s.league.label),
                  s.confirmedXI == nil, s.reg?.day != "tomorrow" else { return false }
            // College board abbreviations may be null. The same provider id
            // also keeps separate games of a doubleheader from sharing edges.
            if let gameId = s.gameId, !gameId.isEmpty, let boardId = r.bdl_game_id {
                return gameId == String(boardId)
            }
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

    /// Team/player streak context for either side. The stored next-game label
    /// may refer to a later matchup; it does not identify this slate game.
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

    private static let fantasyKinds: Set<SignalKind> = [
        .fantasyPickups, .twoStart, .closerWatch, .returnWatch, .cutList,
        .fantasyUsage, .fantasyRedZone, .fantasyMatchup, .fantasyTrend,
    ]

    /// These are complete product modules, not editorial stories. Keeping them
    /// out of The Lead / Best of the Board prevents the same receipt from
    /// appearing once as a hero and again in its purpose-built section.
    /// Rows that own a module of their own and must never be told as a story.
    /// `.nextSlate` is the dark-day schedule card — it would otherwise headline
    /// an empty NCAAF Tuesday as if a schedule were an insight.
    private static let moduleKinds: Set<SignalKind> = [.theSweat, .afterGary, .nextSlate, .practiceReport]

    /// The dark-day schedule card stands in for the slate strip on a football
    /// day with no games — and takes the morning notice's place while it shows.
    private var showsNextSlateCard: Bool {
        slateRows.isEmpty && leagueSignals.contains { $0.kind == .nextSlate }
    }

    /// Original observations retain their server relevance order and dated eligibility.
    private var ranked: [Signal] {
        let currentDate = SupabaseAPI.todayEST()
        return leagueSignals.filter { s in
            s.confirmedXI == nil && !Self.fantasyKinds.contains(s.kind)
                && !Self.moduleKinds.contains(s.kind) && s.kind != .regression
                && s.reg == nil && !(sel == .mlb && s.kind == .h2h)
                && s.slateDate == currentDate
        }
    }
    /// Resolve the lead and remainder from one ranked snapshot. The previous
    /// `bestOfBoard` filter called `lead` inside its closure, which rebuilt
    /// `ranked` while an earlier ranked array was still on the SwiftUI render
    /// stack. Besides doing the work once per row, that nested large Signal
    /// copies deeply enough to exhaust the production iPhone thread stack.
    private var frontPageSelection: (lead: Signal?, best: [Signal]) {
        let rows = ranked
        let selection = HubFrontPageSelection.select(
            stories: rows.enumerated().map { index, signal in
                .init(index: index, kind: String(describing: signal.kind), gameID: signal.gameId)
            }, games: frontPageGames, now: frontPageNow)
        return (selection.lead.map { rows[$0] }, selection.supporting.map { rows[$0] })
    }

    private var frontPageGames: [HubFrontPageSelection.Game] {
        slateRows.compactMap { row in
            guard let id = row.bdl_game_id else { return nil }
            let live = liveScores.status(forGameId: id, league: row.league)
            return .init(id: String(id), startsAt: row.hasConfirmedKickoff ? row.commence_time : nil,
                         status: live?.status ?? row.game_status)
        }
    }

    /// Exact provider identity keeps game two's time separate from game one's
    /// final score. Missing status remains a scheduled-time label, never LIVE.
    private func storyContext(_ signal: Signal) -> String {
        guard let id = signal.gameId.flatMap(Int.init),
              let row = slateRows.first(where: { $0.bdl_game_id == id }) else { return signal.game.uppercased() }
        let score = liveScores.status(forGameId: id, league: signal.league.label)
        let status = score?.status ?? row.game_status
        let label: String
        switch status?.lowercased() {
        case "final": label = "FINAL"
        case "live": label = score?.detail?.uppercased() ?? "LIVE"
        case "postponed", "cancelled", "canceled", "suspended", "delayed":
            label = score?.interruptionLabel ?? row.interruptionLabel ?? status?.uppercased() ?? "STATUS UNAVAILABLE"
        default:
            label = row.kickoffTimeLabel ?? TomorrowView.etTime(row.commence_time, withZone: true, meridiem: true)
        }
        return [signal.game.uppercased(), label == "—" ? "" : label].filter { !$0.isEmpty }.joined(separator: " · ")
    }

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
        if sel == .nba {
            return [
                Beat(anchor: "series", title: "Season series", kinds: [.batterVsArm, .h2h]),
                Beat(anchor: "schedule", title: "Rest & schedule", kinds: [.situational]),
                Beat(anchor: "availability", title: "Availability", kinds: [.injury]),
                Beat(anchor: "form", title: "Team form", kinds: [.streak, .teamRecord, .hot, .cold]),
            ]
        }
        if sel == .wc {
            return [
                Beat(anchor: "cup", title: "The Cup", kinds: [.tournament, .advancement]),
                Beat(anchor: "numbers", title: "The Numbers", kinds: [.xgRegression, .xgRecap]),
                Beat(anchor: "matchups", title: "The Matchups", kinds: [.h2h, .situational, .ballpark, .streak]),
            ]
        }
        // Football speaks MLB's beat grammar (founder, Aug 21): the same
        // sections, the same renderers, football's lanes. THE MISMATCH leads —
        // it is football's marquee board, the way the Regression Board leads
        // MLB's long tail. Every football kind is named in exactly one beat so
        // nothing falls through to the More Edges net unnamed.
        if sel == .nfl {
            return [
                Beat(anchor: "mismatch", title: "The Mismatch", kinds: [.mismatch]),
                Beat(anchor: "trenches", title: "The Trenches", kinds: [.trenches, .passRush]),
                Beat(anchor: "field", title: "The Field", kinds: [.quarterback, .injury]),
                Beat(anchor: "edges", title: "The Edges", kinds: [.coverage, .paceScript, .redZone, .turnoverEdge, .explosivePlay, .coaching]),
                Beat(anchor: "form", title: "The Form", kinds: [.situational, .streak, .teamRecord, .h2h]),
                Beat(anchor: "afterGary", title: "After Gary", kinds: [.afterGary]),
            ]
        }
        if sel == .ncaaf {
            return [
                Beat(anchor: "mismatch", title: "The Mismatch", kinds: [.mismatch]),
                Beat(anchor: "trenches", title: "The Trenches", kinds: [.trenches, .passRush]),
                Beat(anchor: "field", title: "The Field", kinds: [.quarterback, .injury]),
                Beat(anchor: "edges", title: "The Edges", kinds: [.coverage, .paceScript, .specialTeams, .redZone, .turnoverEdge, .explosivePlay, .coaching, .marketRange]),
                Beat(anchor: "form", title: "The Form", kinds: [.situational, .streak, .teamRecord, .h2h]),
                Beat(anchor: "afterGary", title: "After Gary", kinds: [.afterGary]),
            ]
        }
        // HOME RUN THREATS gets its own stage back (founder green-light
        // Jul 22; debut gated to Jul 23 so the first run is a fresh slate —
        // self-activates at the 6 AM ET rollover). Until then HR reads keep
        // riding The Bats exactly as before.
        // The Matchups storyboard retired for MLB (founder, Aug 6: "we only
        // need the head to head") — H2H and the NRFI watch stand alone in the
        // founder-picked shapes (mocks H6 + N10). The storyboard's other
        // kinds (injury swaps, running game, park weather) fall through to
        // the More Edges overflow net, so nothing vanishes.
        // STORE-SAFE BRIDGE: NRFI is a bet market (No Run First Inning) —
        // the lane drops in bridge; everything else stands.
        let beats: [Beat]
        if Self.hrThreatsLive {
            beats = [
                Beat(anchor: "hr", title: "Home Run Threats", kinds: [.hrThreat]),
                Beat(anchor: "bats", title: "The Bats", kinds: [.hot, .cold, .platoon, .batterVsArm]),
                Beat(anchor: "arms", title: "The Arms", kinds: [.starterForm]),
                Beat(anchor: "bullpens", title: "Bullpens", kinds: [.bullpenFatigue]),
                Beat(anchor: "teams", title: "Team form", kinds: [.teamRecord, .situational, .streak]),
                Beat(anchor: "parks", title: "Parks & conditions", kinds: [.ballpark]),
                Beat(anchor: "nrfi", title: "The NRFI Watch", kinds: [.firstInning]),
            ]
        } else {
            beats = [
                Beat(anchor: "bats", title: "The Bats", kinds: [.hot, .cold, .platoon, .hrThreat, .batterVsArm]),
                Beat(anchor: "arms", title: "The Arms", kinds: [.starterForm]),
                Beat(anchor: "bullpens", title: "Bullpens", kinds: [.bullpenFatigue]),
                Beat(anchor: "teams", title: "Team form", kinds: [.teamRecord, .situational, .streak]),
                Beat(anchor: "parks", title: "Parks & conditions", kinds: [.ballpark]),
                Beat(anchor: "nrfi", title: "The NRFI Watch", kinds: [.firstInning]),
            ]
        }
        return AppFlags.storeSafe ? beats.filter { $0.anchor != "nrfi" } : beats
    }
    /// Founder, Jul 22: "green light it but don't run it tonight — first run
    /// tomorrow." String compare works on ISO dates.
    static var hrThreatsLive: Bool { SupabaseAPI.todayEST() >= "2026-07-23" }

    /// Rows for a beat, in the feed's relevance order (each row keeps its own
    /// lane kicker). Regression rows live on the board, never in a beat.
    private func beatRows(_ beat: Beat) -> [Signal] {
        let kinds = Set(beat.kinds)
        return leagueSignals.filter {
            kinds.contains($0.kind)
                && $0.confirmedXI == nil
                && $0.reg == nil
        }
    }

    /// MLB Fantasy stays in the Hub; NFL retains its separate weekly desk.
    @AppStorage("hubScope") private var hubScope = "hub"

    /// A saved Fantasy scope applies only to supported desks. Other sports
    /// retain their main Hub, search, section index and slate clock.
    private var showsFantasy: Bool { hubScope == "fantasy" && sel.supportsFantasy }

    // (hubScopeToggle folded onto the masthead line Aug 6 night — THE HUB /
    // FANTASY ride beside the league words as gold-text tabs, no underline.)

    /// Everything not already on the page — a safety net so a future backend
    /// lane always renders somewhere instead of vanishing.
    private var overflow: [Signal] {
        // .h2h is EXCLUDED from the Hub, not merely placed (founder, Aug 6:
        // "the H2H parts here doesnt need to be on The Hub") — the team season
        // series lives on the Picks page game view, where the ledger renders.
        // Without this it would fall through to More Edges and reappear.
        var placed: Set<SignalKind> = Self.fantasyKinds.union([.regression, .h2h, .theSweat, .nextSlate, .practiceReport])
        for b in beats { for k in b.kinds { placed.insert(k) } }
        return leagueSignals.filter { !placed.contains($0.kind) && $0.confirmedXI == nil }
    }

    // ---- the beats, one block each (extracted from body — the inline
    // if/else chain plus its closures blew the type-checker's budget) ----

    /// Matchups masthead tap → the slate game sheet for that game string.
    private func openGameSheet(for game: String) {
        if let hit = slateIndexFor(game), slateRows.indices.contains(hit.index) {
            gameSheet = HubGameSel(row: slateRows[hit.index])
        }
    }

    // ---- extracted body chunks (the inline runs plus their closures blew
    // the type-checker's budget) ----

    @ViewBuilder private var searchResultsView: some View {
        HubSearchResults(
            query: searchText,
            edges: leagueSignals,
            receipts: selYdaySignals.filter(isEligibleHubSignal),
            streaks: selStreakRows,
            night: selNightRows,
            league: sel,
            nightLabel: nightLabel,
            onEdge: { s in openSignal(s) },
            cardFor: { intelCard(for: $0) },
            onPlayer: { namedCard = $0 },
            onTeamRow: { openTeamCard(for: $0) },
            onTeamName: { openTeamCard(named: $0) }
        )
    }

    // ---- the front page's editorial boards (extracted from body — the
    // inline run plus its closures blew the type-checker's budget) ----

    @ViewBuilder private var frontPageBoards: some View {
        let selection = frontPageSelection
        if let lead = selection.lead {
            HubResearchDashboard(lead: lead, pages: quickResearchPages(excluding: lead),
                contextFor: storyContext, kickerFor: kickerText, destinationFor: researchDestination,
                onSignal: { openSignal($0) }, onCategory: { jumpToResearch($0) },
                onChart: { researchChartSignal = $0 }, aside: moversAside)
            .id("lead")
        } else if let aside = moversAside {
            // No lead today: the slim strip stands on its own, off to the right.
            HStack { Spacer(); aside }
                .padding(.horizontal, GaryLayout.gutter)
                .id("movers")
        }
    }

    /// Line movement (founder, Sep 9 2026): a slim strip to the right of the
    /// lead card — game and move, nothing else, and a door to the full board.
    /// Store-safe builds omit it, as they do the line-move wire.
    private var moversAside: AnyView? {
        guard !AppFlags.storeSafe, let sportKey = LineSport.key(forLeague: sel.label) else { return nil }
        return AnyView(HubLineMoversAside(league: sel.label, sportKey: sportKey) { story in
            ladderSel = LineLadderSel(story: story, sportKey: sportKey)
        })
    }

    private func jumpToResearch(_ anchor: String) {
        openBeats.insert(anchor)
        // Opening a module regroups the rows; let that layout settle before
        // the page scrolls so the target card exists at its new position.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { pendingScrollAnchor = anchor }
    }

    private func quickResearchPages(excluding lead: Signal) -> [HubQuickResearchPage] {
        let rows = ranked.filter { $0.id != lead.id }
        let games = frontPageGames
        let lanes: [(String, String, Set<SignalKind>)] = sel == .mlb
            ? [("bats", "Hitters", [.hot, .cold, .platoon, .batterVsArm, .hrThreat]),
               ("arms", "Starters", [.starterForm]),
               ("bullpens", "Bullpens", [.bullpenFatigue]),
               ("teams", "Teams", [.teamRecord, .streak, .situational])]
            : beats.map { ($0.anchor, $0.title.replacingOccurrences(of: "The ", with: ""), Set($0.kinds)) }
        return lanes.compactMap { anchor, title, kinds in
            let pool = rows.filter { kinds.contains($0.kind) }
            let selected = HubFrontPageSelection.select(stories: pool.enumerated().map {
                .init(index: $0.offset, kind: String(describing: $0.element.kind), gameID: $0.element.gameId)
            }, games: games, now: frontPageNow, supportingLimit: 2)
            let chosen = ([selected.lead].compactMap { $0 } + selected.supporting).map { pool[$0] }
            return chosen.isEmpty ? nil : HubQuickResearchPage(id: anchor, title: title, rows: chosen)
        }
    }

    /// One index powers both the visible modules and navigation. Featured
    /// observations remain in their research category so a shortcut opens the
    /// complete set, including the finding that brought the reader there.
    private var researchModules: [HubResearchModule] {
        let signals = leagueSignals
        var modules: [HubResearchModule] = []
        if !selStreakRows.isEmpty {
            let first = selStreakRows.max { ($0.length ?? 0) < ($1.length ?? 0) }
            let preview = first.flatMap { row -> String? in
                guard let detail = row.detail, !detail.isEmpty else { return nil }
                return [row.subject, detail].compactMap { $0 }.joined(separator: ": ")
            } ?? "Team and player streaks"
            modules.append(.init(id: "streaks", title: "Streak watch", count: selStreakRows.count, preview: preview))
        }
        if [.mlb, .nfl, .ncaaf].contains(sel), !pulseRows.isEmpty {
            modules.append(.init(id: "pulse", title: "League Pulse", count: nil,
                preview: sel == .mlb ? "Starting pitchers · hot & cold bats · bullpens" : "The board · form · league tables"))
        }
        let currentBeats = beats
        let beatOrder = sel == .mlb ? ["bats", "arms", "bullpens", "teams", "hr", "parks", "nrfi"] : currentBeats.map(\.anchor)
        for anchor in beatOrder {
            guard let beat = currentBeats.first(where: { $0.anchor == anchor }) else { continue }
            let rows = signals.filter { beat.kinds.contains($0.kind) && $0.confirmedXI == nil && $0.reg == nil }
            guard let first = rows.first else { continue }
            modules.append(.init(id: anchor, title: anchor == "nrfi" ? "First inning" : beat.title,
                count: rows.count, preview: first.headline, signals: rows))
        }
        let regression = signals.filter { $0.kind == .regression }
        if let first = regression.first {
            modules.append(.init(id: "regression", title: "Regression watch", count: regression.count,
                preview: first.headline, signals: regression))
        }
        if sel == .wc {
            let rows = signals.filter { $0.kind == .xgRegression }
            if let first = rows.first {
                modules.append(.init(id: "xgboard", title: "The xG Board", count: rows.count, preview: first.headline, signals: rows))
            }
        }
        if sel == .mlb {
            modules.append(.init(id: "fantasy", title: "Fantasy watch", count: nil,
                preview: "Roster decisions · playing time · roles"))
        }
        if !selNightRows.isEmpty {
            modules.append(.init(id: "lastNight", title: nightLabel, count: selNightRows.count,
                preview: "Recent performances around the league"))
        }
        var placed = Self.fantasyKinds.union([.regression, .h2h, .theSweat, .nextSlate, .practiceReport])
        for beat in currentBeats { placed.formUnion(beat.kinds) }
        let extras = signals.filter { !placed.contains($0.kind) && $0.confirmedXI == nil }
        if let first = extras.first {
            modules.append(.init(id: "more", title: "More research", count: extras.count, preview: first.headline, signals: extras))
        }
        return modules
    }

    private static func researchRowAnchor(_ index: Int) -> String { "research-row-\(index)" }
    private var researchColumns: Int { dynamicTypeSize >= .xxLarge ? 1 : 2 }
    /// The page anchor that reaches a research module: the row that holds it.
    private func researchScrollTarget(for anchor: String) -> String {
        let rows = HubResearchLayout.rows(ids: researchModules.map(\.id), open: openBeats, columns: researchColumns)
        guard let index = rows.firstIndex(where: { $0.contains(anchor) }) else { return anchor }
        return Self.researchRowAnchor(index)
    }

    private var researchWorkspace: some View {
        let modules = researchModules
        let groups = HubResearchLayout.rows(ids: modules.map(\.id), open: openBeats, columns: researchColumns)
        // Rows and cells are keyed by position so each card's explicit `.id`
        // stays a distinct scroll target for the navigation strip and quick list.
        return VStack(alignment: .leading, spacing: 10) {
            ForEach(Array(groups.enumerated()), id: \.offset) { index, group in
                HStack(alignment: .top, spacing: 10) {
                    ForEach(Array(group.enumerated()), id: \.offset) { _, id in
                        if let module = modules.first(where: { $0.id == id }) {
                            HubResearchModuleCard(module: module, open: openBeatsBinding) {
                                researchModuleContent(module)
                            }
                            .frame(maxWidth: .infinity, alignment: .topLeading)
                        }
                    }
                }
                // Scroll targets live on the row: an open module is its own row,
                // so its top is the row's top.
                .id(Self.researchRowAnchor(index))
            }
        }
        .padding(.horizontal, GaryLayout.gutter)
    }

    private func researchModuleContent(_ module: HubResearchModule) -> AnyView {
        switch module.id {
        case "streaks":
            return AnyView(HubStreakWatch(rows: selStreakRows, onTeam: { openTeamCard(for: $0) },
                cardFor: { intelCard(for: $0) }, onPlayer: { namedCard = $0 }))
        case "pulse":
            return AnyView(HubLeaguePulse(rows: pulseRows, selectedTab: $pulseTab,
                cardFor: { intelCard(for: $0) }, onPlayer: { namedCard = $0 }, onTeam: { openTeamCard(named: $0) }))
        case "fantasy":
            return AnyView(FantasyBriefingPage(league: "MLB", refreshToken: fantasyRefreshToken,
                isVisible: isVisible, compact: true, embeddedInHub: true, openPlayer: openFantasyPlayer))
        case "lastNight":
            return AnyView(HubNightBoard(rows: selNightRows, cardFor: { intelCard(for: $0) },
                onPlayer: { namedCard = $0 }, onTeam: { openTeamCard(named: $0) }))
        case "regression":
            return AnyView(HubRegressionBoard(signals: module.signals, todayEST: SupabaseAPI.todayEST()) { openSignal($0) })
        case "nrfi":
            return AnyView(HubNrfiSection(rows: module.signals, showsHeader: false) { openSignal($0) })
        case "afterGary":
            return AnyView(HubAfterGarySection(anchor: module.id, rows: module.signals,
                openBeats: openBeatsBinding, onRow: { openSignal($0) }))
        case "matchups":
            // Football keeps its game-grouped storyboard inside the module.
            return AnyView(HubMatchupsSection(rows: module.signals, slateIndexFor: { slateIndexFor($0) },
                openBeats: openBeatsBinding, kickerFor: kickerText, onRow: { openSignal($0) },
                onProfile: { openSignal($0) }, onGame: { openGameSheet(for: $0) }))
        default:
            return AnyView(VStack(alignment: .leading, spacing: 0) {
                if module.id == "bullpens", let signal = module.signals.first(where: { $0.researchLedger != nil }) {
                    Button { researchChartSignal = signal } label: {
                        Label("Compare recent workload", systemImage: "chart.bar.xaxis")
                            .hubBodyFont(14, .medium).foregroundStyle(GaryColors.gold)
                            .frame(minHeight: 44).padding(.horizontal, 18)
                    }.buttonStyle(.plain)
                }
                HubBeatList(rows: module.signals, open: true, kickerFor: kickerText,
                    onRow: { openSignal($0) }, onProfile: { openSignal($0) })
            })
        }
    }

    private var researchNavigation: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 18) {
                ForEach(researchModules) { module in
                    Button { jumpToResearch(module.id) } label: {
                        Text(module.title.replacingOccurrences(of: "The ", with: ""))
                            .hubDataFont(12, .medium)
                            .foregroundStyle(openBeats.contains(module.id) ? GaryColors.gold : GaryColors.sectionSub)
                            .frame(minHeight: 30)
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("Open \(module.title)")
                }
            }
            .padding(.horizontal, GaryLayout.gutter)
        }
        .accessibilityLabel("Browse research categories")
    }

    private func openFantasyPlayer(_ decision: FantasyDecision) -> Bool {
        let matches = intelCards.filter {
            decision.matchesPlayerCard(playerID: $0.player_id, gameID: $0.game_id, loadedDate: loadedDate)
                && $0.payload != nil && HubCardIdentity.sameLeague($0.league, sel.label)
        }
        guard matches.count == 1 else { return false }
        namedCard = matches[0]
        return true
    }

    // THE REFERENCE SHELF — folded by default (founder, Jul 30/Aug 3): league
    // tables and graded boards are look-ups, not the page's story. One tap
    // opens each. Every name in them routes by the law (Aug 4): player names
    // → player card when the day has one, team names → the team card.
    private var supportStatus: String? {
        var pending: [String] = []
        if intelLoading { pending.append("Player details") }
        if pulseLoadingLeagues.contains(sel.label) { pending.append("league tables") }
        if historyLoading { pending.append("recent history") }
        if !pending.isEmpty { return "Still loading: " + pending.joined(separator: ", ") + "." }
        var unavailable: [String] = []
        if intelFetchFailed { unavailable.append("Player details") }
        if pulseErrorLeagues.contains(sel.label) { unavailable.append("league tables") }
        if historyFetchFailed { unavailable.append("recent history") }
        return unavailable.isEmpty ? nil : "Couldn't refresh: " + unavailable.joined(separator: ", ") + ". Pull down to retry."
    }

    // Keep the top-level stack's concrete type deliberately shallow. Build 6
    // produced two TestFlight crashes in Swift's runtime demangler while it
    // instantiated the nested _ConditionalContent type generated here. The
    // state/scope branches below are erased independently so Release builds do
    // not have to materialize that pathological generic type at launch.
    private var hubPageStack: some View {
        VStack(alignment: .leading, spacing: 8) {
            HubMasthead(
                sel: $sel,
                leagues: availableLeagues,
                gameCount: slateRows.count,
                searchOpen: $searchOpen,
                searchText: $searchText,
                searchFocused: $searchFocused
            )
            .id("top")
            .background(GeometryReader { position in
                Color.clear
                    .onAppear { mastheadOffscreen = position.frame(in: .named("hubScroll")).maxY < 0 }
                    .onChange(of: position.frame(in: .named("hubScroll")).maxY) { bottom in
                        let offscreen = bottom < 0
                        if mastheadOffscreen != offscreen { mastheadOffscreen = offscreen }
                    }
            })

            hubScopeContent
        }
    }

    private var hubScopeContent: AnyView {
        if showsFantasy {
            return AnyView(VStack(alignment: .leading, spacing: 26) {
                FantasyBriefingPage(league: sel.label, refreshToken: fantasyRefreshToken, isVisible: isVisible,
                                    openPlayer: openFantasyPlayer).id(sel.label)
            }.environment(\.solidPanels, true))
        }
        return AnyView(hubEditorialContent)
    }

    private var hubEditorialContent: some View {
        VStack(alignment: .leading, spacing: 26) {
            // ── ALL-STAR WEEK — one-off break surface (Jul 13-14 2026 only;
            // the date gate self-retires it). Founder call Jul 13: the break
            // is an acquisition window — "its not an all-star break for Gary".
            // MLB tab only (founder): All-Star is MLB — never mixed into WC.
            if sel == .mlb, ["2026-07-13", "2026-07-14"].contains(SupabaseAPI.todayEST()) {
                HubAllStarCard()
            }

            hubEditorialStateContent
        }
    }

    private var hubEditorialStateContent: AnyView {
        if !didLoad {
            return AnyView(hubLoading)
        }
        if searchOpen && !searchText.isEmpty {
            return AnyView(searchResultsView)
        }
        // Each sport shares the briefing hierarchy while its own proof gates,
        // categories and next-slate context determine the content.
        return AnyView(hubLoadedContent)
    }

    private var hubLoadedContent: some View {
        VStack(alignment: .leading, spacing: 14) {
            // The schedule strip and the research categories are one header
            // block (founder, Sep 9: no dead space between them, and no dead
            // space under the categories before the boards).
            VStack(alignment: .leading, spacing: 2) {
                if !slateRows.isEmpty {
                    HubSlateStrip(rows: slateRows) { r in
                        gameSheet = HubGameSel(row: r)
                    }
                }
                researchNavigation
            }
            if boardFetchFailed {
                Text(slateRows.isEmpty ? "Game schedule couldn't load. Pull down to retry."
                                      : "Showing the last available schedule. Pull down to retry.")
                    .hubBodyFont(13)
                    .foregroundStyle(GaryColors.sectionSub)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 18)
            }

            if fetchErrorLeagues.contains(sel) {
                if leagueSignals.isEmpty { hubError }
                else { hubRefreshNotice }
            }

            // Football dark day (NFL + NCAAF since Aug 24): no slate to strip,
            // so the verified next kickoff takes the strip's place rather than
            // leaving the page headless.
            if showsNextSlateCard, let next = leagueSignals.first(where: { $0.kind == .nextSlate }) {
                FootballNextSlatePreview(signal: next, accent: GaryColors.gold)
                    .id("nextSlate")
            }

            frontPageBoards
            if frontPageSelection.lead == nil, items(.regression).isEmpty,
               !showsNextSlateCard, selStreakRows.isEmpty, !fetchErrorLeagues.contains(sel) {
                hubMorningNotice
            }

            researchWorkspace
            if let supportStatus {
                Text(supportStatus).hubBodyFont(13).foregroundStyle(GaryColors.sectionSub)
                    .fixedSize(horizontal: false, vertical: true).padding(.horizontal, GaryLayout.gutter)
            }
        }
        .environment(\.solidPanels, true)
    }

    // ---- body ----

    var body: some View {
        GeometryReader { geo in
        ScrollViewReader { proxy in
        ScrollView(showsIndicators: false) {
            hubPageStack
            .accessibilityHidden(selectedSignal != nil || gameSheet != nil)
            .padding(.top, 8)
            .padding(.bottom, 120)
            // WIDTH PINNED to the viewport (founder bug, Aug 4: you could grab
            // the whole Hub and drag it sideways, then it rubber-banded back).
            // A vertical ScrollView pans horizontally the moment ANY child's
            // minimum width exceeds the screen — one non-compressible row
            // (fixedSize label, agate table cell) silently widens the page.
            // Pinning the content stack to geo width closes that door for
            // every current and future section; an over-wide child now yields
            // internally instead of dragging the page with it.
            .frame(width: geo.size.width, alignment: .topLeading)
            .frame(minHeight: geo.size.height, alignment: .top)
            .task {
                if !didLoad { await load() }
                if sel == .mlb, hubScope == "fantasy" {
                    hubScope = "hub"
                    pendingScrollAnchor = "fantasy"
                }
            }
        }
        // Keep scrolled stories below the status bar while the backdrop fills
        // the safe area. The page itself remains a vertical viewport.
        .clipped()
        .background {
            LiquidGlassBackground(grainDensity: 0)
                .allowsHitTesting(false).accessibilityHidden(true)
        }
        .coordinateSpace(name: "hubScroll")
        .sheet(item: $researchChartSignal) { signal in
            HubBullpenChartSheet(signal: signal) {
                researchChartSignal = nil
            } onResearch: {
                researchChartSignal = nil
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { openSignal(signal) }
            }
        }
        .sheet(item: $ladderSel) { sel in
            LineLadderLoader(sel: sel)
        }
        .overlay(alignment: .bottomTrailing) {
            if !searchOpen, didLoad, !jumpItems.isEmpty, !showsFantasy, mastheadOffscreen,
               selectedSignal == nil, gameSheet == nil {
                HubSectionNav(items: jumpItems, open: $sectionNavOpen, availableHeight: geo.size.height - 190) { anchor in
                    openBeats.insert(anchor)
                    withAnimation(.easeInOut(duration: 0.3)) { proxy.scrollTo(anchor, anchor: .top) }
                }
                .padding(.trailing, 14)
                .padding(.bottom, 108)   // clears the floating tab bar
                .transition(.move(edge: .trailing).combined(with: .opacity))
            }
        }
        .scrollDismissesKeyboard(.immediately)
        .onReceive(Timer.publish(every: 60, on: .main, in: .common).autoconnect()) { now in
            guard isVisible, scenePhase == .active, !showsFantasy else { return }
            frontPageNow = now
            if didLoad, loadedDate != SupabaseAPI.todayEST() || loadedAt.map({ now.timeIntervalSince($0) >= 300 }) != false {
                Task { await load() }
            }
        }
        .refreshable {
            fantasyRefreshToken = UUID()
            if showsFantasy { return }
            await load()
        }
        .onChange(of: isVisible) { vis in
            guard vis else { return }
            frontPageNow = Date()
            consumeFocus()
            fantasyRefreshToken = UUID()
            Task { await reloadIfStale() }
        }
        .onChange(of: scenePhase) { phase in
            guard phase == .active, isVisible else { return }
            frontPageNow = Date()
            fantasyRefreshToken = UUID()
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
                if arg.lowercased() == "fantasy", sel == .mlb {
                    hubScope = "hub"
                    pendingScrollAnchor = "fantasy"
                } else { hubScope = arg.lowercased() == "fantasy" ? "fantasy" : "hub" }
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
            // "hubchart" — present the bullpen workload chart for the first
            // observation that carries a dated ledger (sim QA cannot tap).
            if verb == "hubchart" {
                researchChartSignal = leagueSignals.first { $0.researchLedger != nil }
                return
            }
            // "hubclose <module>" — collapse one research module (sim QA).
            if verb == "hubclose" {
                openBeats.remove(arg)
                return
            }
            guard verb == "hub" else { return }
            switch arg.lowercased() {
            case "mlb": withAnimation { sel = .mlb }
            case "nfl": withAnimation { sel = .nfl }
            case "ncaaf": withAnimation { sel = .ncaaf }
            case "nba": withAnimation { sel = .nba }
            case "wc": withAnimation { sel = .wc }
            // Any other arg = a section anchor ("hub fantasy", "hub lastNight")
            // — the tour harness can't drive the pop-out nav.
            default:
                openBeats.insert(arg)
                pendingScrollAnchor = arg
            }
        }
        .overlay {
            if let s = selectedSignal {
                HubEdgeOverlay(signal: s,
                               supportingNotice: s.playerId == nil ? nil : intelLoading
                                   ? "Player details are still loading. This is Gary’s full original read."
                                   : intelFetchFailed ? "Player details couldn't refresh. This is Gary’s full original read." : nil,
                               onClose: { withAnimation(.spring(response: 0.3, dampingFraction: 0.88)) { selectedSignal = nil } },
                               onViewGame: { g in
                                   selectedSignal = nil
                                   onSelectGame(g, s.league.label, s.gameId.flatMap(Int.init))
                               })
                    .transition(.opacity.combined(with: .scale(scale: 0.94)))
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.88), value: selectedSignal?.id)
        .onChange(of: isVisible && (selectedSignal != nil || gameSheet != nil)) { blocked in
            GaryPushNavigation.shared.setModalBlocked(blocked, owner: "hub-read")
        }
        .onDisappear { GaryPushNavigation.shared.setModalBlocked(false, owner: "hub-read") }
        .sheet(item: $playerRead) { PlayerInsightSheet(signal: $0.signal, prefetched: $0.card) }
        .sheet(item: $teamCardSignal) { s in
            HubTeamCardSheet(
                signal: s,
                related: relatedTeamSignals(for: s),
                tonight: slateRowForTeamSignal(s),
                board: todayBoard,
                streaks: selStreakRows,
                intel: loadedDate == SupabaseAPI.todayEST() ? intelCards.filter {
                    HubCardIdentity.sameLeague($0.league, s.league.label) && $0.payload != nil
                } : [],
                cardFor: { intelCard(for: $0, league: s.league) },
                onPlayer: { row in
                    // Card-to-card handoff: close the team card, then the
                    // player card (two sheets can't stack from one anchor).
                    teamCardSignal = nil
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { namedCard = row }
                },
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
                        .accessibilityHidden(true)
                    HubGameSheet(row: sel.row,
                                 edges: edgesFor(sel.row),
                                 streaks: streaksFor(sel.row),
                                 kickerFor: kickerText,
                                 onClose: { withAnimation(.spring(response: 0.3, dampingFraction: 0.88)) { gameSheet = nil } },
                                 onViewGame: { onSelectGame($0, sel.row.league, sel.row.bdl_game_id) },
                                 onSignal: { signal in
                                     gameSheet = nil
                                     openSignal(signal)
                                 },
                                 onTeam: { r in
                                     withAnimation(.spring(response: 0.3, dampingFraction: 0.88)) { gameSheet = nil }
                                     openTeamCard(for: r)
                                 },
                                 onTeamName: { openTeamCard(named: $0) },
                                 cardFor: { intelCard(for: $0) })
                        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous)
                            .stroke(GaryColors.gold.opacity(0.3), lineWidth: 1))
                        .overlay(alignment: .topTrailing) {
                            Button { withAnimation(.spring(response: 0.3, dampingFraction: 0.88)) { gameSheet = nil } } label: {
                                Image(systemName: "xmark")
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundStyle(.white.opacity(0.55))
                                    .frame(width: 44, height: 44)
                                    .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Close game research")
                        }
                        .shadow(color: .black.opacity(0.6), radius: 30, y: 14)
                        .padding(.horizontal, 14)
                        .frame(maxHeight: UIScreen.main.bounds.height * 0.58)
                }
                .accessibilityElement(children: .contain)
                .accessibilityAddTraits(.isModal)
                .accessibilityAction(.escape) { gameSheet = nil }
                .transition(.opacity.combined(with: .scale(scale: 0.94)))
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.88), value: gameSheet?.id)
        .onChange(of: pendingScrollAnchor) { anchor in
            guard let anchor else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                let target = researchScrollTarget(for: anchor)
                withAnimation(.easeInOut(duration: 0.35)) { proxy.scrollTo(target, anchor: .top) }
                pendingScrollAnchor = nil
            }
        }
        // Switching leagues rebuilds the whole page — land the reader back at
        // the masthead instead of mid-scroll into shorter content.
        .onChange(of: sel) { _ in
            searchText = ""
            searchOpen = false
            searchFocused = false
            sectionNavOpen = false
            if sel == .mlb, hubScope == "fantasy" {
                hubScope = "hub"
                pendingScrollAnchor = "fantasy"
            }
            withAnimation(.easeInOut(duration: 0.3)) { proxy.scrollTo("top", anchor: .top) }
        }
        .onChange(of: hubScope) { _ in
            searchText = ""
            searchOpen = false
            searchFocused = false
            sectionNavOpen = false
            proxy.scrollTo("top", anchor: .top)
        }
        .transaction { transaction in
            if reduceMotion { transaction.animation = nil; transaction.disablesAnimations = true }
        }
        }
        }
    }

    /// Lane label for a row's kicker (VENUE for WC "ballpark" reads).
    /// One lane label for every row on the page. Routes through the shared
    /// renamer so football's `.injury` reads AVAILABILITY (MLB's REPLACEMENT
    /// misnames "Mertz is out") and WC's `.ballpark` reads VENUE.
    private func kickerText(_ s: Signal) -> String {
        signalChipLabel(kind: s.kind, league: s.league)
    }

    /// Jump-bar entries — only sections that exist right now, in page order.
    private var jumpItems: [(anchor: String, label: String)] {
        var out: [(String, String)] = []
        if showsNextSlateCard { out.append(("nextSlate", "Next Slate")) }
        if frontPageSelection.lead != nil { out.append(("lead", "Quick scan")) }
        out += researchModules.map { ($0.id, $0.title) }
        return out
    }

    // ---- page states ----

    private var hubLoading: some View {
        VStack(spacing: 14) {
            ProgressView().tint(GaryColors.gold)
            Text("PULLING TONIGHT'S BOARD")
                .hubKickerFont(11).tracking(1.4)
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
                .hubTitleFont(17, .bold)
                .foregroundStyle(GaryColors.warmWhite)
            Text("Check your connection, then pull down to retry.")
                .hubBodyFont(12.5).foregroundStyle(.white.opacity(0.62))
                .multilineTextAlignment(.center).padding(.horizontal, 40)
            Button { Task { await load() } } label: {
                Text("RETRY")
                    .hubDataFont(12)
                    .foregroundStyle(GaryColors.ink)
                    .padding(.horizontal, 24).padding(.vertical, 10)
                    .background(Capsule().fill(GaryColors.gold))
            }
            .buttonStyle(.plain)
            .padding(.top, 4)
        }
        .frame(maxWidth: .infinity).padding(.top, 90)
    }

    private var hubRefreshNotice: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 5) {
                HubKicker(text: "Last available update")
                Text("Couldn't refresh \(sel.label). These reads may have changed.")
                    .hubBodyFont(13)
                    .foregroundStyle(GaryColors.sectionSub)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
            Button { Task { await load() } } label: {
                Image(systemName: "arrow.clockwise").frame(width: 44, height: 44)
            }
            .buttonStyle(.plain)
            .foregroundStyle(GaryColors.gold)
            .accessibilityLabel("Retry \(sel.label) Hub refresh")
            .disabled(loadTask != nil)
        }
        .padding(16)
        .garyPanel(radius: 12)
        .padding(.horizontal, 18)
    }

    /// Pre-lineup morning: the paper still has a front section (slate, streaks,
    /// last night render below) — this is just the honest note.
    private var hubMorningNotice: some View {
        VStack(alignment: .leading, spacing: 6) {
            HubKicker(text: "Tonight's Board")
            Text("No \(sel.label) edges posted yet.")
                .hubBodyFont(14.5, .semibold)
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

fileprivate struct HubMasthead: View {
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
            .hubKickerFont(11).foregroundStyle(GaryColors.sectionSub)
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

// MARK: - Tonight's slate strip

/// Identifiable wrapper for the slate-strip → game-sheet presentation.
fileprivate struct HubGameSel: Identifiable {
    let row: TomorrowBoardRow
    var id: String {
        let game = row.bdl_game_id.map(String.init)
            ?? "\(row.away_team ?? row.away_abbr ?? "")|\(row.home_team ?? row.home_abbr ?? "")|\(row.commence_time ?? row.scheduled_date ?? "")"
        return "\(row.league ?? "")|\(game)"
    }
}

/// Exact IDs are authoritative. A legacy name join is allowed only when a
/// single score in the same league owns it, never between doubleheader games.
@MainActor fileprivate func hubLiveScore(for row: TomorrowBoardRow, cache: LiveScoreCache) -> LiveScore? {
    if let id = row.bdl_game_id { return cache.status(forGameId: id, league: row.league) }
    let matchup = "\(row.away_team ?? "") @ \(row.home_team ?? "")"
    let matches = cache.scores.filter {
        HubCardIdentity.sameLeague($0.league, row.league ?? "") && abbrGameMatches($0.abbrGame, matchup: matchup)
    }
    return matches.count == 1 ? matches[0] : nil
}

/// WC board rows carry no abbreviations — fall back to the first three
/// letters of the team name ("France" → FRA) so labels never read "—".
/// Shared display formatting keeps ESPN college codes consistent across Hub rows.
fileprivate func hubSideLabel(_ abbr: String?, _ team: String?, league: String? = nil) -> String {
    scoreboardTeamAbbreviation(team, stored: abbr, league: league)
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

    private func side(_ abbr: String?, _ team: String?, _ league: String?) -> String { hubSideLabel(abbr, team, league: league) }

    @ViewBuilder private func block(_ r: TomorrowBoardRow) -> some View {
        let marquee = r.is_marquee == true
        let matchup = "\(side(r.away_abbr, r.away_team, r.league)) @ \(side(r.home_abbr, r.home_team, r.league))"
        let ls = hubLiveScore(for: r, cache: live)
        VStack(alignment: .leading, spacing: 3) {
            Text((ls?.isLive == true || ls?.isFinal == true) ? (ls?.scoreLine ?? matchup) : matchup)
                .hubDataFont(11.5, .semibold)
                .foregroundStyle(.white.opacity(marquee ? 0.95 : 0.8))
            HStack(spacing: 6) {
                if let ls, ls.isLive {
                    Text("▶ \((ls.detail ?? "LIVE").uppercased())")
                        .hubDataFont(9.5, .medium)
                        .foregroundStyle(GaryColors.win)
                } else if ls?.isFinal == true || (ls == nil && r.game_status?.lowercased() == "final") {
                    Text("FINAL")
                        .hubDataFont(9.5, .medium)
                        .foregroundStyle(.white.opacity(0.55))
                } else if let interruption = ls?.interruptionLabel ?? r.interruptionLabel {
                    Text(interruption)
                        .hubDataFont(9.5, .medium)
                        .foregroundStyle(GaryColors.gold)
                } else if ls == nil && r.game_status?.lowercased() == "live" {
                    Text("LIVE")
                        .hubDataFont(9.5, .medium)
                        .foregroundStyle(GaryColors.win)
                } else {
                    // A college row filed date-only carries no real kickoff —
                    // say so instead of printing a placeholder as a time.
                    Text(r.kickoffTimeLabel
                         ?? TomorrowView.etTime(r.commence_time, withZone: false, meridiem: true))
                        .hubDataFont(9.5, .medium)
                        .foregroundStyle(marquee ? GaryColors.gold : .white.opacity(0.55))
                    // STORE-SAFE BRIDGE: the strip is a schedule — no totals.
                    if let t = r.total, !AppFlags.storeSafe {
                        Text("O/U \(HubFmt.stat(t))")
                            .hubDataFont(9.5, .medium)
                            .foregroundStyle(.white.opacity(0.55))
                    }
                }
            }
        }
        .padding(.horizontal, 13)
        .frame(minHeight: 48)
        .contentShape(Rectangle())
    }
}

// MARK: - The Lead

// MARK: - The Regression Board

fileprivate struct HubRegressionBoard: View {
    let signals: [Signal]
    /// The CURRENT EST slate day — anchors the Tonight/Tomorrow split so the
    /// 6am rollover re-buckets rows instead of trusting their baked strings.
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

// MARK: - League Pulse (moved from the Picks page — founder, Jul 30)

/// League-wide daily tables (starting pitchers / hot & cold bats / bullpen /
/// injuries) in Hub chrome: HubHead, gold-underline kicker tabs, and the
/// proven PulseTable row grammar (the no-ellipsis scars live in there — the
/// table itself is untouched, only the chrome is Hub-native).
fileprivate struct HubLeaguePulse: View {
    let rows: [LeaguePulseRow]
    @Binding var selectedTab: String?
    /// Routing law (founder, Aug 4 — the standing order): names in the agate
    /// tables route like names everywhere else. Player cells open the player
    /// card when the day has his card; team cells always open the team card.
    var cardFor: (String?) -> PlayerInsightCardRow? = { _ in nil }
    var onPlayer: (PlayerInsightCardRow) -> Void = { _ in }
    var onTeam: ((String) -> Void)? = nil

    /// Fixed display order; any tab without a row drops out. MLB tabs first
    /// as before; football tabs (Aug 27 2026) lead with the market board.
    private static let tabOrder = [
        "starting_pitchers", "hot_cold_bats", "bullpen", "injuries",
        "the_board", "form", "injury_sheet", "rankings",
    ]

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
                            .hubBodyFont(12)
                            .foregroundStyle(.white.opacity(0.62))
                            .padding(.horizontal, 18)
                    }
                    PulseTable(row: row, cardFor: cardFor, onPlayer: onPlayer, onTeam: onTeam)
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
                            .hubKickerFont(11).tracking(1.3)
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

    /// Streaks with a stored next-game label lead; longest runs break ties.
    /// Directions interleave so both sides appear near the top.
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
                .hubDataFont(16)
                .foregroundStyle(b.color)
                .lineLimit(1).minimumScaleFactor(0.7)
                .frame(width: 54, alignment: .leading)
            VStack(alignment: .leading, spacing: 4) {
                // Names read like every other name (founder, Jul 30: the gold
                // tappable tint was noise) — the whole row routes: team row →
                // team card, player row → player card.
                Text(r.subject ?? "")
                    .hubBodyFont(17, .semibold)
                    .foregroundStyle(.white.opacity(0.92))
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                if let d = cleanDetail(r, badgeText: b.text) {
                    Text(d)
                        .hubBodyFont(13.5)
                        .foregroundStyle(.white.opacity(0.62))
                        .lineLimit(1).minimumScaleFactor(0.8)
                }
                if let next = r.next_game, !next.isEmpty {
                    Text("NEXT GAME · \(next.uppercased())")
                        .hubDataFont(12.5, .semibold)
                        .foregroundStyle(GaryColors.gold.opacity(0.9))
                        .lineLimit(nil)
                        .fixedSize(horizontal: false, vertical: true)
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

/// Market movement after Gary published, kept deliberately receipt-like:
/// matchup, locked line → current line, and which snapshot held the edge.
/// The book/as-of detail remains available on tap without adding tutorial copy
/// to the feed itself.
fileprivate struct HubAfterGarySection: View {
    let anchor: String
    let rows: [Signal]
    @Binding var openBeats: Set<String>
    let onRow: (Signal) -> Void

    private let topCount = 4
    private var isOpen: Bool { openBeats.contains(anchor) }
    private var visible: [Signal] { isOpen ? rows : Array(rows.prefix(topCount)) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HubHead(title: "After Gary", count: rows.count)
            VStack(spacing: 0) {
                ForEach(Array(visible.enumerated()), id: \.element.id) { index, signal in
                    Button { onRow(signal) } label: {
                        HStack(alignment: .center, spacing: 12) {
                            VStack(alignment: .leading, spacing: 4) {
                                if !signal.game.isEmpty {
                                    Text(signal.game.uppercased())
                                        .hubDataFont(9.5, .medium)
                                        .foregroundStyle(.white.opacity(0.55))
                                        .lineLimit(1)
                                }
                                Text(signal.headline)
                                    .hubBodyFont(14.5, .semibold)
                                    .foregroundStyle(.white.opacity(0.95))
                                    .fixedSize(horizontal: false, vertical: true)
                                    .multilineTextAlignment(.leading)
                            }
                            Spacer(minLength: 6)
                            if !signal.value.isEmpty {
                                Text(signal.value)
                                    .hubDataFont(12.5, .semibold)
                                    .foregroundStyle(GaryColors.gold)
                                    .lineLimit(1)
                            }
                            Image(systemName: "chevron.right")
                                .font(.system(size: 9, weight: .semibold))
                                .foregroundStyle(.white.opacity(0.45))
                        }
                        .padding(.horizontal, 18).padding(.vertical, 11)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    if index < visible.count - 1 { HubRule(inset: 18) }
                }
            }
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
                                    onProfile: { onProfile(s) })
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
        VStack(alignment: .leading, spacing: 0) {
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
                            .hubDataFont(10, .medium)
                            .foregroundStyle(.white.opacity(0.62))
                            .lineLimit(1)
                    }
                }
                HStack(alignment: .top, spacing: 10) {
                    Text(s.headline)
                        .hubBodyFont(14.5, .semibold)
                        .foregroundStyle(.white.opacity(0.95))
                        .lineLimit(nil)
                        .fixedSize(horizontal: false, vertical: true)
                        .multilineTextAlignment(.leading)
                    Spacer(minLength: 6)
                    if let v = s.displayValue {
                        Text(v)
                            .hubDataFont(15)
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
                        .hubBodyFont(13)
                        .foregroundStyle(.white.opacity(0.75))
                        .lineSpacing(2)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 2)
                }
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 11)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        if expanded, let onProfile {
            Button(action: onProfile) {
                HStack(spacing: 6) {
                    Text(s.playerId != nil ? "PLAYER CARD" : (s.teamId != nil || s.h2h != nil ? "TEAM CARD" : "THE FULL READ"))
                        .hubKickerFont(10.5).tracking(1)
                    Image(systemName: "arrow.right").font(.system(size: 10, weight: .semibold))
                }
                .foregroundStyle(GaryColors.gold)
                .frame(minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 18)
            .padding(.bottom, 6)
        }
        }
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
                                .hubDataFont(9, .medium)
                                .foregroundStyle(.white.opacity(0.62))
                        }
                        Spacer(minLength: 6)
                        if showsGame {
                            Text(s.game.uppercased())
                                .hubDataFont(9, .medium)
                                .foregroundStyle(.white.opacity(0.62))
                                .lineLimit(1)
                        }
                    }
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Image(systemName: "xmark")
                            .font(.system(size: 9, weight: .heavy))
                            .foregroundStyle(HubPalette.red)
                            .frame(width: 14)
                        // The NAME outranks its note for width and scales
                        // rather than clipping — "Gabriel Rincones Jr." beside
                        // a full BATS/OPS note otherwise ellipsized the player
                        // right out of his own row (no-ellipsis law).
                        Text(swap.out_name ?? "—")
                            .hubBodyFont(14, .semibold)
                            .strikethrough(true, color: HubPalette.red.opacity(0.7))
                            .foregroundStyle(.white.opacity(0.55))
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                            .layoutPriority(1)
                        Spacer(minLength: 6)
                        if let note = swap.out_note, !note.isEmpty {
                            Text(note)
                                .hubBodyFont(10.5, .medium)
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
                            .hubBodyFont(15, .bold)
                            .foregroundStyle(.white)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                            .layoutPriority(1)
                        Spacer(minLength: 6)
                        if let note = swap.in_note, !note.isEmpty {
                            Text(note)
                                .hubDataFont(9.5, .semibold)
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
                            .hubDataFont(10, .medium)
                            .foregroundStyle(.white.opacity(0.62))
                    }
                }
                HStack(alignment: .lastTextBaseline, spacing: 10) {
                    Text(h?.dominant ?? "—")
                        .hubKickerFont(15)
                        .foregroundStyle(.white.opacity(0.95))
                    Text("\(wins)")
                        .hubTitleFont(34)
                        .foregroundStyle(GaryColors.gold)
                    Text("–")
                        .hubTitleFont(22)
                        .foregroundStyle(.white.opacity(0.35))
                    Text("\(losses)")
                        .hubTitleFont(24)
                        .foregroundStyle(.white.opacity(0.55))
                    Text(h?.opponent ?? "—")
                        .hubKickerFont(12)
                        .foregroundStyle(.white.opacity(0.6))
                    Spacer(minLength: 6)
                    Text("THIS SEASON")
                        .hubDataFont(9, .semibold).tracking(1.1)
                        .foregroundStyle(.white.opacity(0.45))
                }
                if let last = h?.last_meeting, let score = last.score {
                    Text(last.revenge == true
                         ? "\(h?.opponent ?? "") took the last meeting \(score) — revenge spot"
                         : "\(h?.dominant ?? "") won the last meeting \(score)")
                        .hubBodyFont(12).foregroundStyle(.white.opacity(0.72))
                }
            }
            .padding(.horizontal, 18).padding(.vertical, 11)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

fileprivate struct HubDotsRow: View {
    let s: Signal
    let kicker: String
    /// Off inside the Matchups storyboard — the game is the block's masthead.
    var showsGame: Bool = true
    let onTap: () -> Void
    private let green = GaryColors.win
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
                            .hubDataFont(10, .medium)
                            .foregroundStyle(.white.opacity(0.62))
                    }
                }
                Text(s.headline)
                    .hubBodyFont(14.5, .semibold).foregroundStyle(.white.opacity(0.95))
                    .fixedSize(horizontal: false, vertical: true)
                    .multilineTextAlignment(.leading)
                if let teamSeq = m?.team_seq {
                    seqRow(m?.team_abbr ?? "", teamSeq)
                } else {
                    seqRow(m?.away_abbr ?? "", m?.away_seq ?? [])
                    seqRow(m?.home_abbr ?? "", m?.home_seq ?? [])
                }
                // Gary's read on the spot — same voice as every hub card.
                if !s.detail.isEmpty {
                    Text(s.detail)
                        .hubBodyFont(13).foregroundStyle(.white.opacity(0.88))
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
                .hubKickerFont(11).foregroundStyle(.white.opacity(0.85))
                .frame(width: 40, alignment: .leading)
            HStack(spacing: 3.5) {
                ForEach(Array(seq.enumerated()), id: \.offset) { _, v in
                    RoundedRectangle(cornerRadius: 2.5, style: .continuous)
                        .fill(v > 0 ? green.opacity(0.9) : red.opacity(0.45))
                        .frame(width: 10, height: 10)
                }
            }
            Spacer(minLength: 6)
            VStack(alignment: .trailing, spacing: 1) {
                Text("CLEAN \(clean)/\(seq.count)")
                    .hubDataFont(10, .bold).foregroundStyle(.white.opacity(0.7))
                if streak >= 3 {
                    Text("\(streak) STRAIGHT")
                        .hubDataFont(9, .semibold).tracking(0.8)
                        .foregroundStyle(.white.opacity(0.62))
                }
            }
        }
    }
}

// MARK: - The NRFI Watch (mock N10 story card — founder pick, Aug 6)

fileprivate struct HubNrfiSection: View {
    let rows: [Signal]
    var showsHeader: Bool = true
    let onTap: (Signal) -> Void

    private let green = HubPalette.green
    private let red = HubPalette.red

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if showsHeader { HubHead(title: "The NRFI Watch", count: rows.count) }
            VStack(spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { i, s in
                    Button { onTap(s) } label: { card(s) }.buttonStyle(.plain)
                    if i < rows.count - 1 { HubRule(inset: 18) }
                }
            }
        }
    }

    private func sideWord(_ s: Signal) -> String {
        switch s.nrfi?.side {
        case "NRFI": return "NRFI"
        case "YRFI": return "YRFI"
        case "TEAM_QUIET": return "Quiet Start"
        case "TEAM_HOT": return "Hot Start"
        default: return "First Inning"
        }
    }

    @ViewBuilder private func card(_ s: Signal) -> some View {
        let m = s.nrfi
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                HubKicker(text: sideWord(s), size: 9.5, color: GaryColors.gold.opacity(0.9))
                Spacer()
                Text(s.game.uppercased())
                    .hubDataFont(9.5, .medium)
                    .foregroundStyle(.white.opacity(0.55))
            }
            Text(s.headline)
                .hubTitleFont(21)
                .foregroundStyle(GaryColors.warmWhite)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 7)
            Text(s.detail)
                .hubBodyFont(13.5)
                .foregroundStyle(.white.opacity(0.82))
                .lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 6)
            // The evidence: both sides' sequences, or the one side the row is
            // about — drawn only when the payload really carries them.
            VStack(alignment: .leading, spacing: 6) {
                if let abbr = m?.away_abbr, let seq = m?.away_seq, !seq.isEmpty {
                    seqRow(abbr, seq)
                }
                if let abbr = m?.home_abbr, let seq = m?.home_seq, !seq.isEmpty {
                    seqRow(abbr, seq)
                }
                if let abbr = m?.team_abbr, let seq = m?.team_seq, !seq.isEmpty,
                   m?.away_seq == nil, m?.home_seq == nil {
                    seqRow(abbr, seq)
                }
            }
            .padding(.top, 10)
            if let p = m?.price, p.over != nil || p.under != nil {
                HStack(spacing: 12) {
                    Text("1ST-INNING RUN")
                        .hubKickerFont(9).tracking(1.2)
                        .foregroundStyle(.white.opacity(0.45))
                    if let o = p.over { priceBit("O0.5", o) }
                    if let u = p.under { priceBit("U0.5", u) }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.25))
                }
                .padding(.top, 10)
            }
        }
        .padding(.horizontal, 18).padding(.vertical, 12)
        .contentShape(Rectangle())
    }

    private func priceBit(_ side: String, _ odds: Int) -> some View {
        HStack(spacing: 4) {
            Text(side)
                .hubDataFont(10, .semibold)
                .foregroundStyle(.white.opacity(0.62))
            Text(odds > 0 ? "+\(odds)" : "\(odds)")
                .hubDataFont(12, .bold)
                .foregroundStyle(GaryColors.gold)
        }
    }

    @ViewBuilder private func seqRow(_ abbr: String, _ seq: [Int]) -> some View {
        let clean = seq.filter { $0 == 0 }.count
        HStack(spacing: 8) {
            Text(abbr.uppercased())
                .hubKickerFont(11).foregroundStyle(.white.opacity(0.85))
                .frame(width: 40, alignment: .leading)
            HStack(spacing: 3.5) {
                ForEach(Array(seq.enumerated()), id: \.offset) { _, v in
                    RoundedRectangle(cornerRadius: 2.5, style: .continuous)
                        .fill(v > 0 ? green.opacity(0.9) : red.opacity(0.45))
                        .frame(width: 10, height: 10)
                }
            }
            Spacer(minLength: 6)
            Text("CLEAN \(clean)/\(seq.count)")
                .hubDataFont(10, .bold).foregroundStyle(.white.opacity(0.7))
        }
    }
}

// MARK: - The Matchups (per-game storyboard — WC only since Aug 6; the MLB
// slate now speaks the H2H + NRFI sections above)

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
    /// Masthead tap → the game sheet (Aug 4: the block's title had been dead
    /// text; from the sheet, each team name is a door to its team card).
    var onGame: (String) -> Void = { _ in }

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
        // Off-board games (no slate row) keep a plain masthead — a chevron
        // that opens nothing would be a lying affordance (no dead taps).
        let onBoard = slateIndexFor(block.game) != nil
        VStack(alignment: .leading, spacing: 0) {
            let masthead = HStack(alignment: .lastTextBaseline, spacing: 8) {
                Text(block.game.uppercased())
                    .hubTitleFont(20)
                    .foregroundStyle(GaryColors.warmWhite)
                    .lineLimit(1).minimumScaleFactor(0.7)
                Spacer(minLength: 8)
                if let t = block.time {
                    Text(t.uppercased())
                        .hubDataFont(9.5, .semibold)
                        .foregroundStyle(.white.opacity(0.55))
                }
                if onBoard {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.35))
                }
            }
            if onBoard {
                Button { onGame(block.game) } label: {
                    masthead.contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 18)
                .padding(.top, 14)
            } else {
                masthead
                    .padding(.horizontal, 18)
                    .padding(.top, 14)
            }
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

/// Team details assembled from fetched board, streak and player evidence.
/// Missing facts are omitted; names retain their player/team detail routes.
fileprivate struct HubTeamCardSheet: View {
    let signal: Signal
    let related: [Signal]
    /// Tonight's board row for this team — matchup, first pitch, the lines.
    var tonight: TomorrowBoardRow? = nil
    /// The day board — form, run profile, weather, probable starters.
    var board: TomorrowBoard? = nil
    /// League streak rows (the card filters to this team's).
    var streaks: [StreakRow] = []
    /// The day's player cards (the card filters to this team's bats + arms).
    var intel: [PlayerInsightCardRow] = []
    var cardFor: (String?) -> PlayerInsightCardRow? = { _ in nil }
    var onPlayer: (PlayerInsightCardRow) -> Void = { _ in }
    let onSignal: (Signal) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @ObservedObject private var live = LiveScoreCache.shared
    @State private var shapeExpanded = false   // MORE STATS expander (player-card parity)
    @State private var bullpenExpanded = false

    // ── identity: the tapped string (name OR abbr) → full name + abbr ──

    private func matches(_ raw: String, team: String?, abbr: String?) -> Bool {
        HubCardIdentity.matchesTeam(raw, name: team, abbr: abbr, league: signal.league.label)
    }

    private func abbreviation(_ stored: String?, name: String) -> String? {
        HubCardIdentity.abbreviation(stored, name: name, league: signal.league.label)
    }

    private var rawName: String { HubView.teamCardName(for: signal) }

    /// Which side of tonight's row this card is about (nil = not on the slate).
    private var isAway: Bool? {
        guard let t = tonight else { return nil }
        guard HubCardIdentity.sameLeague(t.league, signal.league.label) else { return nil }
        let away = matches(rawName, team: t.away_team, abbr: t.away_abbr)
        let home = matches(rawName, team: t.home_team, abbr: t.home_abbr)
        return away == home ? nil : away
    }

    /// The best identity the board can vouch for. Never fabricated — when no
    /// source knows this team, the tapped string renders as-is.
    private var resolved: (name: String, abbr: String?) {
        if let away = isAway, let t = tonight {
            return away ? (t.away_team ?? rawName, abbreviation(t.away_abbr, name: t.away_team ?? rawName))
                        : (t.home_team ?? rawName, abbreviation(t.home_abbr, name: t.home_team ?? rawName))
        }
        if let f = (board?.form ?? []).first(where: { HubCardIdentity.sameLeague($0.league, signal.league.label) && matches(rawName, team: $0.team, abbr: $0.abbr) }) {
            return (f.team ?? rawName, abbreviation(f.abbr, name: f.team ?? rawName))
        }
        if let rp = (board?.run_profile ?? []).first(where: { HubCardIdentity.sameLeague($0.league, signal.league.label) && matches(rawName, team: $0.team, abbr: $0.abbr) }) {
            return (rp.team ?? rawName, abbreviation(rp.abbr, name: rp.team ?? rawName))
        }
        return (rawName, abbreviation(nil, name: rawName))
    }

    // ── the stored facts, each nil when its source has nothing ──

    private var formStat: TomorrowForm? {
        (board?.form ?? []).first { HubCardIdentity.sameLeague($0.league, signal.league.label) && matches(resolved.name, team: $0.team, abbr: $0.abbr) }
    }
    private var runProfile: TomorrowRunProfile? {
        (board?.run_profile ?? []).first { HubCardIdentity.sameLeague($0.league, signal.league.label) && matches(resolved.name, team: $0.team, abbr: $0.abbr) }
    }
    /// Tonight's probable arm for THIS team, from the board's starters lane.
    private var starter: TomorrowPerson? {
        (board?.starters ?? []).first { p in
            HubCardIdentity.sameLeague(p.league, signal.league.label) && matches(resolved.name, team: p.team, abbr: p.abbr)
        }
    }
    /// First-pitch weather for tonight's park (outdoor games only).
    private var weather: TomorrowWeather? {
        guard let t = tonight else { return nil }
        return (board?.weather ?? []).first { w in
            HubCardIdentity.sameLeague(w.league, signal.league.label) && (w.away_abbr != nil && w.away_abbr == t.away_abbr && w.home_abbr == t.home_abbr)
        }
    }
    /// The board's divisional-standing sentence, when this team made Big Games.
    private var standingLine: String? {
        let nick = resolved.name.split(separator: " ").last.map(String.init) ?? resolved.name
        guard nick.count > 2 else { return nil }
        return (board?.big_games ?? [])
            .filter { HubCardIdentity.sameLeague($0.league, signal.league.label) }
            .compactMap { $0.standing }
            .first { $0.localizedCaseInsensitiveContains(nick) }
    }
    /// This club's live runs (team-typed streak rows only).
    private var teamStreaks: [StreakRow] {
        streaks.filter { HubCardIdentity.sameLeague($0.league, signal.league.label) && $0.subject_type == "team" && matches(resolved.name, team: $0.subject ?? $0.team, abbr: nil) }
    }
    /// The day's player cards wearing this team's abbreviation — the bats and
    /// arms with a full breakdown behind them. Tap one, get the player card.
    private var teamIntel: [PlayerInsightCardRow] {
        intel.filter {
            $0.payload != nil && HubCardIdentity.cardBelongsToTeam(cardLeague: $0.league, cardAbbr: $0.team_abbr,
                league: signal.league.label, team: resolved.name, abbr: resolved.abbr)
        }
    }
    private var ls: LiveScore? {
        guard let t = tonight else { return nil }
        return hubLiveScore(for: t, cache: live)
    }
    private var bullpenResearch: BullpenResearchLedger? {
        guard signal.kind == .bullpenFatigue else { return nil }
        return BullpenResearchLedger(meta: signal.lane, league: signal.league.label,
                                     slateDate: signal.slateDate, teamID: signal.teamId)
    }
    /// True when not a single source produced a row — the honest-quiet state.
    private var deskIsQuiet: Bool {
        tonight == nil && formStat == nil && runProfile == nil && starter == nil
            && teamStreaks.isEmpty && teamIntel.isEmpty && related.isEmpty
            && edgeContent == nil
    }

    // ── body: shared player/team research surface ──

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 0) {
                header
                if let e = edgeContent { edgeHero(e) }
                if let ledger = bullpenResearch { bullpenSection(ledger) }
                if let t = tonight { tonightSection(t) }
                if formStat != nil || runProfile != nil { shapeSection }
                if let s = tonight?.series { seriesSection(s) }
                if let arm = starter { armSection(arm) }
                if !teamStreaks.isEmpty { streaksSection }
                if !teamIntel.isEmpty { clubhouseSection }
                if !related.isEmpty { relatedSection }
                if deskIsQuiet { quietSection }
                footerMark
            }
        }
        .background(PCV4.surface)
        .padding(16)
        .background(GaryColors.darkBg.ignoresSafeArea())
        .overlay(alignment: .topTrailing) {
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .semibold)).foregroundStyle(PCV4.mut)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Close team details")
            .padding(.top, 14).padding(.trailing, 16)
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    // ── header: context, identity, then a quiet observed streak ──

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let t = tonight {
                Text("\(hubSideLabel(t.away_abbr, t.away_team, league: t.league)) @ \(hubSideLabel(t.home_abbr, t.home_team, league: t.league))".uppercased())
                    .hubDataFont(11, .bold).foregroundStyle(PCV4.mut2)
                    .padding(.trailing, 30)
            } else if !signal.game.isEmpty {
                Text(signal.game.uppercased())
                    .hubDataFont(11, .bold).foregroundStyle(PCV4.mut2)
                    .padding(.trailing, 30)
            }
            Text(resolved.name)
                .font(.title.weight(.bold)).foregroundStyle(PCV4.ink)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let id = identityLine {
                Text(id).font(.subheadline).foregroundStyle(PCV4.mut)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let st = formStat?.streak, st.count >= 2,
               st.hasPrefix("W") || st.hasPrefix("L") {
                Text("CURRENT STREAK  ·  \(st)")
                    .font(.caption.monospaced().weight(.medium)).foregroundStyle(PCV4.mut2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, 24).padding(.top, 26).padding(.bottom, 24)
    }
    /// "MLB · NYY · Home tonight" — only the parts a source vouches for.
    private var identityLine: String? {
        var bits: [String] = [signal.league.label]
        if let a = resolved.abbr, !a.isEmpty, a.lowercased() != resolved.name.lowercased() { bits.append(a) }
        if let away = isAway { bits.append(away ? "Road tonight" : "Home tonight") }
        return bits.isEmpty ? nil : bits.joined(separator: "  ·  ")
    }

    // ── the observation that opened this team's research ──

    private var edgeContent: PlayerCardV4Edge? {
        // Synthesized taps (a bare name from a table cell) carry no story —
        // the hero renders only when there IS an edge to show.
        let bareName = signal.headline.trimmingCharacters(in: .whitespaces).lowercased() == rawName.trimmingCharacters(in: .whitespaces).lowercased()
        let body = [signal.detail, signal.fantasy?.evidence]
            .compactMap { $0?.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
            .removingDuplicates()
            .joined(separator: "\n")
        if bareName {
            guard !body.isEmpty else { return nil }
            // The header already says the name — the read alone is the hero.
            return PlayerCardV4Edge(eyebrow: signalChipLabel(kind: signal.kind, league: signal.league), title: body, body: "")
        }
        return PlayerCardV4Edge(eyebrow: signalChipLabel(kind: signal.kind, league: signal.league), title: signal.headline, body: body)
    }

    @ViewBuilder private func edgeHero(_ e: PlayerCardV4Edge) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(e.eyebrow.uppercased()).font(.caption.monospaced().weight(.medium)).tracking(1).foregroundStyle(PCV4.gold)
            Text(e.title).font(.headline).foregroundStyle(PCV4.ink).fixedSize(horizontal: false, vertical: true)
            if !e.body.isEmpty {
                Text(e.body).font(.subheadline).foregroundStyle(PCV4.mut).lineSpacing(3).fixedSize(horizontal: false, vertical: true)
            }
        }
        .modifier(PCV4ResearchInset())
    }

    // ── the player card's section frame, shared by every block below ──

    private func section<C: View>(_ cap: String, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 13) {
            Text(cap.uppercased()).font(.caption.monospaced().weight(.medium)).tracking(1)
                .foregroundStyle(PCV4.mut2)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 24).padding(.vertical, 20)
        .overlay(Rectangle().fill(PCV4.line).frame(height: 1), alignment: .top)
    }

    // ── TONIGHT: state line, then the lines as a 3-up grid ──

    private static let bullpenDateParser: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()
    private static let bullpenDayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "MMM d"
        return formatter
    }()
    private func bullpenDate(_ raw: String) -> String {
        Self.bullpenDateParser.date(from: raw).map(Self.bullpenDayFormatter.string(from:)) ?? raw
    }

    private func bullpenSection(_ ledger: BullpenResearchLedger) -> some View {
        section("Recent bullpen work") {
            VStack(alignment: .leading, spacing: 10) {
                Text("3-GAME WINDOW · \(ledger.dates.map(bullpenDate).joined(separator: ", ")) · \(ledger.asOf.prefix(4))")
                    .font(.caption.monospaced().weight(.medium)).foregroundStyle(PCV4.mut2)
                    .fixedSize(horizontal: false, vertical: true)
                if !dynamicTypeSize.isAccessibilitySize {
                    HStack(spacing: 10) {
                        Text("RELIEVER").frame(maxWidth: .infinity, alignment: .leading)
                        Text("RECENT IP").frame(width: 72, alignment: .trailing)
                        Text("SEASON ERA").frame(width: 76, alignment: .trailing)
                    }
                    .font(.caption2.monospaced().weight(.medium)).foregroundStyle(PCV4.mut2)
                    .accessibilityHidden(true)
                }
                let shown = bullpenExpanded ? ledger.arms : Array(ledger.arms.prefix(3))
                VStack(spacing: 0) {
                    ForEach(Array(shown.enumerated()), id: \.offset) { index, arm in
                        bullpenArmRow(arm)
                        if index < shown.count - 1 {
                            Rectangle().fill(PCV4.line).frame(height: 1)
                        }
                    }
                }
                if ledger.arms.count > 3 {
                    Button { withAnimation(.easeInOut(duration: 0.2)) { bullpenExpanded.toggle() } } label: {
                        HStack(spacing: 6) {
                            Text(bullpenExpanded ? "SHOW FEWER RELIEVERS" : "ALL \(ledger.arms.count) RELIEVERS")
                                .font(.caption.monospaced().weight(.medium))
                            Image(systemName: bullpenExpanded ? "chevron.up" : "chevron.down")
                                .font(.caption2.weight(.semibold))
                        }
                        .foregroundStyle(PCV4.gold)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(bullpenExpanded ? "Show fewer relievers" : "Show all \(ledger.arms.count) relievers")
                }
                Text("\(ledger.source) · through \(bullpenDate(ledger.asOf)), \(ledger.asOf.prefix(4)). Season lines show their observed date.")
                    .font(.caption).foregroundStyle(PCV4.mut2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func bullpenArmRow(_ arm: BullpenResearchArm) -> some View {
        let accessible = dynamicTypeSize.isAccessibilitySize
        let layout = accessible
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8))
            : AnyLayout(HStackLayout(alignment: .top, spacing: 10))
        return layout {
            VStack(alignment: .leading, spacing: 4) {
                Text(arm.name ?? "—").font(.subheadline.weight(.semibold)).foregroundStyle(PCV4.ink)
                Text("\(arm.g.map(String.init) ?? "—") app · last \(arm.last_used.map(bullpenDate) ?? "—")")
                    .font(.caption2).foregroundStyle(PCV4.mut2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: accessible ? .leading : .trailing, spacing: 4) {
                Text(accessible ? "Recent innings: \(arm.inningsLabel) IP" : arm.inningsLabel)
                    .font(.subheadline.monospacedDigit().weight(.semibold)).foregroundStyle(PCV4.ink)
                Text("\(arm.pitchesLabel) pitches").font(.caption2.monospacedDigit()).foregroundStyle(PCV4.mut2)
            }
            .frame(width: accessible ? nil : 72, alignment: .trailing)
            VStack(alignment: accessible ? .leading : .trailing, spacing: 4) {
                Text(accessible ? "Season ERA: \(arm.seasonERALabel)" : arm.seasonERALabel)
                    .font(.subheadline.monospacedDigit().weight(.semibold)).foregroundStyle(PCV4.ink)
                Text("\(arm.seasonIPLabel) IP").font(.caption2.monospacedDigit()).foregroundStyle(PCV4.mut2)
                if arm.hasSeasonLine, let date = arm.season_as_of {
                    Text(bullpenDate(date)).font(.caption2).foregroundStyle(PCV4.mut2)
                }
            }
            .frame(width: accessible ? nil : 76, alignment: .trailing)
        }
        .fixedSize(horizontal: false, vertical: true)
        .padding(.vertical, 11)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(arm.name ?? "Unknown reliever"). \(arm.g.map(String.init) ?? "Unknown") appearances in the three-game window, \(arm.inningsLabel) innings and \(arm.pitchesLabel) pitches. Last used \(arm.last_used ?? "unknown"). Season ERA \(arm.seasonERALabel) over \(arm.seasonIPLabel) innings, as of \(arm.hasSeasonLine ? arm.season_as_of ?? "unknown" : "unknown").")
    }

    private func fmtML(_ v: Double) -> String { v > 0 ? "+\(Int(v))" : "\(Int(v))" }

    @ViewBuilder private func tonightSection(_ t: TomorrowBoardRow) -> some View {
        section(ls?.isLive == true ? "Live" : ls?.isFinal == true ? "Final" : "Tonight") {
            VStack(alignment: .leading, spacing: 12) {
                if let ls, ls.isLive || ls.isFinal {
                    HStack(spacing: 10) {
                        Text(ls.scoreLine ?? "")
                            .hubTitleFont(22).foregroundStyle(PCV4.ink)
                        if ls.isLive, let det = ls.detail, !det.isEmpty {
                            Text(det.uppercased())
                                .hubDataFont(11, .bold).foregroundStyle(GaryColors.win)
                        }
                    }
                } else {
                    HStack(spacing: 8) {
                        Text(TomorrowView.etTime(t.commence_time, withZone: true, meridiem: true))
                            .hubTitleFont(18).foregroundStyle(PCV4.ink)
                        if let v = t.venue, !v.isEmpty {
                            Text(v).hubBodyFont(12).foregroundStyle(PCV4.mut2)
                                .lineLimit(1).minimumScaleFactor(0.7)
                        }
                    }
                }
                // The lines — abbr-labeled tiles, only the numbers the board has.
                let tiles: [(String, String)] = {
                    var out: [(String, String)] = []
                    if let a = t.ml_away { out.append((hubSideLabel(t.away_abbr, t.away_team, league: t.league), fmtML(a))) }
                    if let h = t.ml_home { out.append((hubSideLabel(t.home_abbr, t.home_team, league: t.league), fmtML(h))) }
                    if let tot = t.total { out.append(("O/U", HubFmt.stat(tot))) }
                    return out
                }()
                if !tiles.isEmpty {
                    // Board prices are a saved snapshot, separate from LiveScoreCache.
                    Text("SAVED ODDS · NOT LIVE")
                        .hubDataFont(9, .bold).foregroundStyle(PCV4.mut2)
                    HStack(spacing: 12) {
                        ForEach(tiles.indices, id: \.self) { i in
                            VStack(spacing: 6) {
                                Text(tiles[i].0.uppercased()).hubDataFont(9, .bold).foregroundStyle(PCV4.mut2)
                                Text(tiles[i].1).hubTitleFont(18).foregroundStyle(PCV4.ink)
                                    .lineLimit(1).minimumScaleFactor(0.6)
                            }.frame(maxWidth: .infinity)
                        }
                    }
                }
                if let w = weather, let note = w.note, !note.isEmpty {
                    splitLikeRow("FIRST-PITCH WEATHER", note)
                }
                if let st = standingLine {
                    Text(st).hubBodyFont(12, .medium).foregroundStyle(PCV4.mut)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    /// A splitRow-shaped line: mono label left, value right (player-card idiom).
    private func splitLikeRow(_ label: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label).hubDataFont(10, .bold).foregroundStyle(PCV4.mut2).lineLimit(1)
            Spacer(minLength: 12)
            Text(value).hubBodyFont(12, .medium).foregroundStyle(PCV4.mut)
                .lineLimit(1).minimumScaleFactor(0.7).multilineTextAlignment(.trailing)
        }
    }

    // ── THE SHAPE: 3-up grid + the MORE STATS expander (player-card parity) ──

    private func signedInt(_ v: Int) -> String { v > 0 ? "+\(v)" : "\(v)" }

    private var shapeSection: some View {
        // The grid: L10 / STREAK / RUN DIFF — whichever of the three exist.
        let cells: [(String, String)] = {
            var out: [(String, String)] = []
            if let l10 = formStat?.l10, !l10.isEmpty { out.append(("LAST 10", l10)) }
            if let st = formStat?.streak, !st.isEmpty { out.append(("STREAK", st)) }
            if let d = runProfile?.run_diff { out.append(("RUN DIFF", signedInt(d))) }
            return out
        }()
        // The expander: the run profile's full shape, rows only where data is.
        let extra: [(String, String)] = {
            var out: [(String, String)] = []
            if let v = runProfile?.rs_per_game { out.append(("RUNS SCORED / GAME", String(format: "%.1f", v))) }
            if let v = runProfile?.ra_per_game { out.append(("RUNS ALLOWED / GAME", String(format: "%.1f", v))) }
            if let v = runProfile?.runs_scored { out.append(("RUNS SCORED, SEASON", "\(v)")) }
            if let v = runProfile?.runs_allowed { out.append(("RUNS ALLOWED, SEASON", "\(v)")) }
            return out
        }()
        return section("The shape") {
            VStack(alignment: .leading, spacing: 0) {
                if !cells.isEmpty {
                    HStack(spacing: 12) {
                        ForEach(cells.indices, id: \.self) { i in
                            VStack(spacing: 6) {
                                Text(cells[i].0).hubDataFont(9, .bold).foregroundStyle(PCV4.mut2)
                                Text(cells[i].1).hubTitleFont(18).foregroundStyle(PCV4.ink)
                                    .lineLimit(1).minimumScaleFactor(0.6)
                            }.frame(maxWidth: .infinity)
                        }
                    }
                }
                if !extra.isEmpty {
                    if shapeExpanded {
                        VStack(alignment: .leading, spacing: 10) {
                            ForEach(extra.indices, id: \.self) { i in
                                splitLikeRow(extra[i].0, extra[i].1)
                            }
                        }
                        .padding(.top, 14)
                        .transition(.opacity)
                    }
                    Button { withAnimation(.easeInOut(duration: 0.2)) { shapeExpanded.toggle() } } label: {
                        HStack(spacing: 5) {
                            Text(shapeExpanded ? "LESS" : "MORE STATS").hubDataFont(10, .bold).tracking(1.4)
                            Image(systemName: shapeExpanded ? "chevron.up" : "chevron.down").font(.system(size: 8, weight: .bold))
                        }
                        .foregroundStyle(PCV4.gold)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(shapeExpanded ? "Show fewer team stats" : "Show more team stats")
                    .padding(.top, 12)
                }
            }
        }
    }

    // ── SEASON SERIES: the scorebug + this season's meetings ──

    @ViewBuilder private func seriesSection(_ s: TomorrowSeries) -> some View {
        section("Season series") {
            VStack(alignment: .leading, spacing: 12) {
                if let aw = s.away_w, let hw = s.home_w, let t = tonight {
                    // Scorebug weights (HubTugRow's grammar in the card's inks):
                    // the leader reads big and gold, the trailer smaller and dim.
                    let awayLeads = aw >= hw
                    HStack(alignment: .lastTextBaseline, spacing: 10) {
                        Text(hubSideLabel(t.away_abbr, t.away_team, league: t.league))
                            .hubKickerFont(13).foregroundStyle(awayLeads ? PCV4.ink : PCV4.mut2)
                        Text("\(aw)")
                            .hubTitleFont(awayLeads ? 30 : 22)
                            .foregroundStyle(awayLeads ? PCV4.gold : PCV4.mut2)
                        Text("–").hubTitleFont(18).foregroundStyle(PCV4.mut2)
                        Text("\(hw)")
                            .hubTitleFont(awayLeads ? 22 : 30)
                            .foregroundStyle(awayLeads ? PCV4.mut2 : PCV4.gold)
                        Text(hubSideLabel(t.home_abbr, t.home_team, league: t.league))
                            .hubKickerFont(13).foregroundStyle(awayLeads ? PCV4.mut2 : PCV4.ink)
                    }
                }
                if let split = s.split_line, !split.isEmpty {
                    Text(split).hubDataFont(10).foregroundStyle(PCV4.mut2)
                        .lineLimit(1).minimumScaleFactor(0.7)
                }
                if let meetings = s.meetings, !meetings.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(meetings.indices, id: \.self) { i in
                            let m = meetings[i]
                            HStack(alignment: .firstTextBaseline) {
                                Text(m.d ?? "").hubDataFont(10, .bold).foregroundStyle(PCV4.mut2)
                                    .frame(width: 52, alignment: .leading)
                                Text(m.line ?? "").hubBodyFont(12, .medium).foregroundStyle(PCV4.mut)
                                    .lineLimit(1).minimumScaleFactor(0.7)
                                Spacer(minLength: 8)
                                if let v = m.venue, !v.isEmpty {
                                    Text(v).hubDataFont(9.5).foregroundStyle(PCV4.mut2)
                                        .lineLimit(1).minimumScaleFactor(0.7)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // ── TONIGHT'S ARM: the board's probable, with his stored form lines ──

    @ViewBuilder private func armSection(_ p: TomorrowPerson) -> some View {
        let armName = p.full_name ?? p.name ?? ""
        section("Tonight's arm") {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    if let card = cardFor(armName) {
                        Button { onPlayer(card) } label: {
                            HStack(spacing: 6) {
                                Text(armName).hubTitleFont(18).foregroundStyle(PCV4.ink)
                                    .lineLimit(1).minimumScaleFactor(0.7)
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 9, weight: .semibold)).foregroundStyle(PCV4.mut2)
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    } else {
                        Text(armName).hubTitleFont(18).foregroundStyle(PCV4.ink)
                            .lineLimit(1).minimumScaleFactor(0.7)
                    }
                    Spacer(minLength: 8)
                    if let era = p.era {
                        Text("\(HubFmt.stat(era)) ERA").hubDataFont(11, .bold).foregroundStyle(PCV4.mut)
                    }
                }
                if let lo = p.last_outing, let ip = lo.ip, let er = lo.er {
                    let opp = lo.opp.map { " \(lo.at ?? "vs") \($0)" } ?? ""
                    let ks = lo.k.map { " · \($0) K" } ?? ""
                    splitLikeRow("LAST START", "\(ip) IP · \(er) ER\(ks)\(opp)")
                }
                if let l3 = p.l3, let ip = l3.ip, let er = l3.er, let gs = l3.gs {
                    splitLikeRow("LAST \(gs) STARTS", "\(ip) IP · \(er) ER" + (l3.k.map { " · \($0) K" } ?? ""))
                }
                if let q = p.qs_form, let qs = q.qs, let w = q.window {
                    splitLikeRow("QUALITY STARTS", (q.streak ?? 0) >= 2 ? "\(q.streak!) straight" : "\(qs) of last \(w)")
                }
                if let vs = p.vs_opp, let gs = vs.gs, let era = vs.era {
                    splitLikeRow("VS TONIGHT'S OPPONENT", "\(HubFmt.stat(era)) ERA in \(gs) start\(gs == 1 ? "" : "s")")
                }
                if let r = p.rest?.days { splitLikeRow("REST", "\(r) days") }
            }
        }
    }

    // ── ON THE LINE: this club's live runs ──

    private var streaksSection: some View {
        section("On the line") {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(Array(teamStreaks.prefix(4).enumerated()), id: \.offset) { _, r in
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text(streakBadge(r)).hubTitleFont(16).foregroundStyle(PCV4.gold)
                            .frame(width: 52, alignment: .leading)
                        Text(r.detail ?? r.kind?.capitalized ?? "")
                            .hubBodyFont(12, .medium).foregroundStyle(PCV4.mut)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                    }
                }
            }
        }
    }
    private func streakBadge(_ r: StreakRow) -> String {
        let n = r.length ?? 0
        switch r.kind {
        case "win": return "W\(n)"
        case "loss": return "L\(n)"
        case "over": return "O ×\(n)"
        case "under": return "U ×\(n)"
        default: return "\(n)"
        }
    }

    // ── THE CLUBHOUSE: the day's carded bats + arms, each tap → player card ──

    private var clubhouseSection: some View {
        section("The clubhouse") {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(teamIntel.prefix(6).enumerated()), id: \.element.id) { i, row in
                    Button { onPlayer(row) } label: {
                        HStack(spacing: 10) {
                            VStack(alignment: .leading, spacing: 2) {
                                HStack(spacing: 7) {
                                    Text(row.player_name ?? row.payload?.name ?? "")
                                        .hubBodyFont(13, .semibold).foregroundStyle(PCV4.ink)
                                        .lineLimit(1).minimumScaleFactor(0.7)
                                    if let pos = row.payload?.position, !pos.isEmpty {
                                        Text(pos).hubDataFont(9.5).foregroundStyle(PCV4.mut2)
                                    }
                                }
                                if let line = row.payload?.strengths?.first ?? row.payload?.weaknesses?.first {
                                    Text(line).hubBodyFont(11.5).foregroundStyle(PCV4.mut)
                                        .fixedSize(horizontal: false, vertical: true)
                                        .multilineTextAlignment(.leading)
                                }
                            }
                            Spacer(minLength: 8)
                            Image(systemName: "chevron.right")
                                .font(.system(size: 9, weight: .semibold)).foregroundStyle(PCV4.mut2)
                        }
                        .padding(.vertical, 9)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    if i < min(teamIntel.count, 6) - 1 {
                        Rectangle().fill(Color.white.opacity(0.06)).frame(height: 1)
                    }
                }
            }
        }
    }

    // ── MORE ON THIS TEAM TODAY: the other edges, routing by the law ──

    private var relatedSection: some View {
        section("More on this team today") {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(related.enumerated()), id: \.element.id) { i, r in
                    Button { onSignal(r) } label: {
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(signalChipLabel(kind: r.kind, league: r.league).uppercased())
                                    .hubDataFont(8.5, .bold).tracking(1.1).foregroundStyle(PCV4.mut2)
                                Text(r.headline)
                                    .hubBodyFont(12.5, .semibold).foregroundStyle(PCV4.ink)
                                    .multilineTextAlignment(.leading)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            Spacer(minLength: 8)
                            Image(systemName: "chevron.right")
                                .font(.system(size: 9, weight: .semibold)).foregroundStyle(PCV4.mut2)
                        }
                        .padding(.vertical, 9)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    if i < related.count - 1 {
                        Rectangle().fill(Color.white.opacity(0.06)).frame(height: 1)
                    }
                }
            }
        }
    }

    // ── the honest-quiet state (player card's "building" twin) ──

    private var quietSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("THE DESK IS QUIET")
                .hubDataFont(10.5, .bold).tracking(1.4).foregroundStyle(PCV4.gold).opacity(0.92)
            Text("Nothing filed on the \(resolved.name) yet — reads land as today's board firms up.")
                .hubBodyFont(13).foregroundStyle(PCV4.mut).lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 26).padding(.vertical, 24)
        .overlay(Rectangle().fill(PCV4.line).frame(height: 1), alignment: .top)
    }

    // ── Gary's mark, closing the card ──

    private var footerMark: some View {
        HStack {
            Spacer()
            Image(GaryBrand.mark)
                .resizable().scaledToFit()
                .frame(width: 20, height: 20)
                .opacity(0.45)
            Spacer()
        }
        .padding(.vertical, 16)
        .overlay(Rectangle().fill(PCV4.line).frame(height: 1), alignment: .top)
    }
}

fileprivate extension Array where Element == String {
    /// Order-preserving dedupe for the edge hero's read lines.
    func removingDuplicates() -> [String] {
        var seen = Set<String>()
        return filter { seen.insert($0).inserted }
    }
}

// MARK: - Last Night board

fileprivate struct HubNightBoard: View {
    let rows: [NightHighlightRow]
    /// Tap-a-name → player card (only names with a resolved card).
    var cardFor: (String?) -> PlayerInsightCardRow? = { _ in nil }
    var onPlayer: (PlayerInsightCardRow) -> Void = { _ in }
    /// Team tag → team card (the law, Aug 4 — this cell had been a dead tap).
    var onTeam: ((String) -> Void)? = nil
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
                                    .hubKickerFont(11).tracking(1.3)
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
                        .hubBodyFont(13.5, .semibold)
                        .foregroundStyle(.white.opacity(0.92))
                        .lineLimit(1).minimumScaleFactor(0.7)
                        .frame(width: 108, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            } else {
                Text(NightBoard.shortPlayer(r.player_name))
                    .hubBodyFont(13.5, .semibold)
                    .foregroundStyle(.white.opacity(0.92))
                    .lineLimit(1).minimumScaleFactor(0.7)
                    .frame(width: 108, alignment: .leading)
            }
            // The team tag routes to the team card (law, Aug 4); ink unchanged.
            let teamLabel = Text(HomeView.shortTeam(r.team).uppercased())
                .hubDataFont(10, .semibold)
                .foregroundStyle(TeamColors.color(for: r.team) ?? .white.opacity(0.5))
                .lineLimit(1).minimumScaleFactor(0.7)
            if let onTeam, let team = r.team, !team.isEmpty {
                Button { onTeam(team) } label: {
                    teamLabel
                        .frame(width: 62, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            } else {
                teamLabel
                    .frame(width: 62, alignment: .leading)
            }
            Text(r.detail ?? "")
                .hubDataFont(11, .semibold)
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

// MARK: - Receipt rows (search results only — the page section came off Aug 6)

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
                HubKicker(text: signalChipLabel(kind: s.kind, league: s.league), size: 9, color: GaryColors.gold.opacity(0.75))
                Text(s.headline)
                    .hubBodyFont(13)
                    .foregroundStyle(.white.opacity(0.88))
                    .fixedSize(horizontal: false, vertical: true)
                    .multilineTextAlignment(.leading)
                if let note = s.resultNote, !note.isEmpty {
                    Text(note)
                        .hubDataFont(10.5, .medium)
                        .foregroundStyle(.white.opacity(0.62))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 8)
            Text(s.result == "hit" ? AppFlags.wonStamp : s.result == "push" ? "PUSH" : "LOST")
                .hubDataFont(10)
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
/// the lines, every edge touching the matchup, related team/player streaks — with
/// Picks as a CTA at the bottom instead of a forced tab jump.
fileprivate struct HubGameSheet: View {
    let row: TomorrowBoardRow
    let edges: [Signal]
    let streaks: [StreakRow]
    let kickerFor: (Signal) -> String
    var onClose: () -> Void = {}
    let onViewGame: (String) -> Void
    let onSignal: (Signal) -> Void
    /// Team tap on a streak row → close, then the team card (routing law).
    var onTeam: (StreakRow) -> Void = { _ in }
    /// Header team names → close, then the team card (the law, Aug 4: a team
    /// name is a door to the team card everywhere it appears).
    var onTeamName: (String) -> Void = { _ in }
    /// Tap-a-name → player card (player streak rows).
    var cardFor: (String?) -> PlayerInsightCardRow? = { _ in nil }
    @ObservedObject private var live = LiveScoreCache.shared
    @State private var namedCard: PlayerInsightCardRow? = nil

    private var abbrMatchup: String {
        "\(hubSideLabel(row.away_abbr, row.away_team, league: row.league)) @ \(hubSideLabel(row.home_abbr, row.home_team, league: row.league))"
    }
    private var ls: LiveScore? {
        hubLiveScore(for: row, cache: live)
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 26) {
                header
                if edges.isEmpty {
                    Text("No edges posted for this game yet.")
                        .hubBodyFont(15).foregroundStyle(.white.opacity(0.62))
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 18)
                } else {
                    VStack(alignment: .leading, spacing: 4) {
                        HubHead(title: "The Edges", count: edges.count)
                        HubBeatList(rows: edges, open: true, kickerFor: kickerFor,
                                    onRow: onSignal, onProfile: onSignal)
                    }
                }
                if !streaks.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        HubHead(title: "Streaks", count: streaks.count)
                        HubStreakWatch(rows: streaks, onTeam: { onTeam($0) },
                                       cardFor: cardFor, onPlayer: { namedCard = $0 })
                    }
                }
                cta
            }
            .padding(.top, 26).padding(.bottom, 34)
        }
        .background(GaryColors.darkBg)
        .sheet(item: $namedCard) { PlayerInsightSheet(signal: nil, prefetched: $0) }
    }

    private func fmtML(_ v: Double) -> String { v > 0 ? "+\(Int(v))" : "\(Int(v))" }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            if ls?.isLive == true {
                HubKicker(text: "Live", size: 12.5, color: GaryColors.win)
            } else if ls?.isFinal == true || (ls == nil && row.game_status?.lowercased() == "final") {
                HubKicker(text: "Final", size: 12.5, color: .white.opacity(0.62))
            } else if let interruption = ls?.interruptionLabel ?? row.interruptionLabel {
                HubKicker(text: interruption, size: 12.5)
            } else if ls == nil && row.game_status?.lowercased() == "live" {
                HubKicker(text: "Live", size: 12.5, color: GaryColors.win)
            } else {
                HubKicker(text: "Tonight", size: 12.5, color: GaryColors.gold)
            }
            // Each side is a door to its team card (the law, Aug 4). Two lines
            // instead of one so long names never fight the tap targets.
            VStack(alignment: .leading, spacing: 0) {
                teamNameLine(row.away_team ?? hubSideLabel(row.away_abbr, nil), lead: nil)
                teamNameLine(row.home_team ?? hubSideLabel(row.home_abbr, nil), lead: "@")
            }
            if let ls, ls.isLive || ls.isFinal {
                HStack(spacing: 10) {
                    Text(ls.scoreLine ?? "")
                        .hubDataFont(17)
                        .foregroundStyle(.white.opacity(0.95))
                    if ls.isLive, let det = ls.detail, !det.isEmpty {
                        Text("▶ \(det.uppercased())")
                            .hubDataFont(13, .medium)
                            .foregroundStyle(GaryColors.win)
                    }
                }
            } else if row.game_status?.lowercased() == "final" || row.game_status?.lowercased() == "live" {
                Text("Score update unavailable")
                    .hubBodyFont(13.5).foregroundStyle(GaryColors.sectionSub)
            } else {
                HStack(spacing: 8) {
                    Text(TomorrowView.etTime(row.commence_time))
                        .hubDataFont(13.5, .medium)
                        .foregroundStyle(.white.opacity(0.7))
                    if let v = row.venue, !v.isEmpty {
                        Text(v).hubBodyFont(13.5).foregroundStyle(.white.opacity(0.62)).lineLimit(1)
                    }
                }
                // The lines, quietly (meta, never the headline).
                if row.total != nil || row.spread != nil || (row.ml_home != nil && row.ml_away != nil) {
                    Text("SAVED ODDS · NOT LIVE")
                        .hubKickerFont(10.5).foregroundStyle(.white.opacity(0.62))
                }
                HStack(spacing: 22) {
                    if let t = row.total { numberStat("O/U", HubFmt.stat(t)) }
                    if let sp = row.spread {
                        numberStat("Spread \(hubSideLabel(row.home_abbr, row.home_team, league: row.league))", HubFmt.stat(sp))
                    }
                    if let mh = row.ml_home, let ma = row.ml_away {
                        numberStat("ML", "\(hubSideLabel(row.home_abbr, row.home_team, league: row.league)) \(fmtML(mh)) · \(hubSideLabel(row.away_abbr, row.away_team, league: row.league)) \(fmtML(ma))")
                    }
                }
                .padding(.top, 6)
            }
        }
        .padding(.horizontal, 18)
    }

    private func numberStat(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label.uppercased()).hubKickerFont(10.5).tracking(0.6).foregroundStyle(.white.opacity(0.62))
            Text(value).hubDataFont(15).foregroundStyle(.white.opacity(0.92))
        }
    }

    /// One masthead side, tappable → its team card. The "@" stays plain ink.
    private func teamNameLine(_ name: String, lead: String?) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            if let lead {
                Text(lead)
                    .hubTitleFont(22)
                    .foregroundStyle(.white.opacity(0.35))
            }
            Button { onClose(); onTeamName(name) } label: {
                Text(name)
                    .hubTitleFont(30)
                    .foregroundStyle(GaryColors.warmWhite)
                    .lineLimit(1).minimumScaleFactor(0.6)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }

    private var cta: some View {
        Button { onClose(); onViewGame(abbrMatchup) } label: {
            HStack(spacing: 8) {
                Text("VIEW GAME ON PICKS")
                Image(systemName: "arrow.right")
            }
            .hubDataFont(15)
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
/// and the complete original read. Long copy scrolls inside the centered panel
/// while its close button stays reachable. VIEW GAME → exact game on Picks.
fileprivate struct HubEdgeOverlay: View {
    let signal: Signal
    var supportingNotice: String? = nil
    let onClose: () -> Void
    let onViewGame: (String) -> Void
    @State private var readHeight: CGFloat = 220
    @State private var headerHeight: CGFloat = 44

    private var isMatchup: Bool {
        guard signal.reg?.day != "tomorrow" else { return false }
        let g = signal.game.lowercased()
        return g.contains("@") || g.contains(" vs ") || g.contains(" v ")
    }

    var body: some View {
        GeometryReader { geo in
        ZStack {
            Color.black.opacity(0.62).ignoresSafeArea()
                .onTapGesture { onClose() }
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    HubKicker(text: signalChipLabel(kind: signal.kind, league: signal.league), size: 10.5)
                    Spacer()
                    if let r = signal.result {
                        Text(r == "hit" ? AppFlags.wonStamp : r == "push" ? "PUSH" : "LOST")
                            .hubDataFont(10.5)
                            .foregroundStyle(r == "hit" ? GaryColors.win : r == "push" ? GaryColors.gold : GaryColors.loss)
                    }
                    Button(action: onClose) {
                        Image(systemName: "xmark")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(.white.opacity(0.6))
                            .frame(width: 44, height: 44)
                            .background(Circle().fill(Color.white.opacity(0.08)))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Close full read")
                }
                .background(GeometryReader { measured in
                    Color.clear
                        .onAppear { headerHeight = max(44, measured.size.height) }
                        .onChange(of: measured.size.height) { headerHeight = max(44, $0) }
                })
                ScrollView(showsIndicators: true) {
                    readBody
                        .fixedSize(horizontal: false, vertical: true)
                        .background(GeometryReader { measured in
                            Color.clear
                                .onAppear { if measured.size.height > 0 { readHeight = measured.size.height } }
                                .onChange(of: measured.size.height) { if $0 > 0 { readHeight = $0 } }
                        })
                }
                .frame(height: min(readHeight, max(60, geo.size.height * 0.8 - headerHeight - 48)))
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
        .frame(width: geo.size.width, height: geo.size.height)
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isModal)
        .accessibilityAction(.escape, onClose)
        }
    }

    private var readBody: some View {
        VStack(alignment: .leading, spacing: 12) {
                Text((signal.reg?.day == "tomorrow" ? "Tomorrow · " : "") + signal.game.uppercased())
                    .hubDataFont(10, .medium)
                    .foregroundStyle(.white.opacity(0.62))
                Text(signal.headline)
                    .hubTitleFont(21)
                    .foregroundStyle(GaryColors.warmWhite)
                    .fixedSize(horizontal: false, vertical: true)
                if !signal.valueEchoesHeadline, !signal.value.isEmpty {
                    Text(signal.value)
                        .hubDataFont(14, .medium)
                        .foregroundStyle(GaryColors.sectionSub)
                }
                let body = signal.detail.trimmingCharacters(in: .whitespacesAndNewlines)
                if !body.isEmpty {
                    Text(body)
                        .hubBodyFont(14)
                        .foregroundStyle(.white.opacity(0.8))
                        .lineSpacing(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let note = signal.resultNote, !note.isEmpty {
                    Text(note)
                        .hubDataFont(11, .medium)
                        .foregroundStyle(.white.opacity(0.7))
                }
                if let supportingNotice {
                    Text(supportingNotice)
                        .hubBodyFont(12)
                        .foregroundStyle(GaryColors.sectionSub)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if isMatchup {
                    Button { onViewGame(signal.game) } label: {
                        HStack(spacing: 6) {
                            Text("VIEW GAME")
                            Image(systemName: "arrow.right")
                        }
                        .hubDataFont(12)
                        .foregroundStyle(GaryColors.ink)
                        .frame(maxWidth: .infinity).padding(.vertical, 12)
                        .background(Capsule().fill(GaryColors.gold))
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 4)
                }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Search results

fileprivate struct HubSearchResults: View {
    let query: String
    let edges: [Signal]
    let receipts: [Signal]
    let streaks: [StreakRow]
    let night: [NightHighlightRow]
    let league: HubLeagueSel
    let nightLabel: String
    let onEdge: (Signal) -> Void
    /// Routing law (Aug 4 — these rows had been dead): a team streak row →
    /// team card, a player row → his card when the day has one, night-board
    /// hits route the same way. Unresolvable player names stay plain.
    var cardFor: (String?) -> PlayerInsightCardRow? = { _ in nil }
    var onPlayer: (PlayerInsightCardRow) -> Void = { _ in }
    var onTeamRow: (StreakRow) -> Void = { _ in }
    var onTeamName: (String) -> Void = { _ in }

    var body: some View {
        let q = query.lowercased()
        func hits(_ s: Signal) -> Bool {
            s.headline.lowercased().contains(q)
                || s.detail.lowercased().contains(q)
                || s.game.lowercased().contains(q)
                || s.value.lowercased().contains(q)
                || signalChipLabel(kind: s.kind, league: s.league).lowercased().contains(q)
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
                        .hubTitleFont(15, .bold)
                        .foregroundStyle(.white.opacity(0.7))
                    Text("Try a \(league.label) player, team, or topic.")
                        .hubBodyFont(12).foregroundStyle(.white.opacity(0.62))
                }
                .frame(maxWidth: .infinity).padding(.top, 40)
            } else {
                VStack(alignment: .leading, spacing: 22) {
                    if !edgeMatches.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            HubHead(title: "Edges", count: edgeMatches.count)
                            VStack(spacing: 0) {
                                ForEach(edgeMatches) { s in
                                    HubStoryRow(s: s, kicker: signalChipLabel(kind: s.kind, league: s.league), expandable: false,
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
                                    // Routing law: team rows → team card; player
                                    // rows → player card when the day has one.
                                    let row = auxRow(title: r.subject ?? "", sub: r.detail ?? "", trail: r.next_game ?? "")
                                    if r.subject_type == "team" {
                                        Button { onTeamRow(r) } label: { row.contentShape(Rectangle()) }
                                            .buttonStyle(.plain)
                                    } else if let card = cardFor(r.subject) {
                                        Button { onPlayer(card) } label: { row.contentShape(Rectangle()) }
                                            .buttonStyle(.plain)
                                    } else {
                                        row
                                    }
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
                                    // Player name → his card; no card but a team
                                    // → the team card carries the tap instead.
                                    let row = auxRow(title: r.player_name ?? "", sub: r.detail ?? "", trail: r.team ?? "")
                                    if let card = cardFor(r.player_name) {
                                        Button { onPlayer(card) } label: { row.contentShape(Rectangle()) }
                                            .buttonStyle(.plain)
                                    } else if let team = r.team, !team.isEmpty {
                                        Button { onTeamName(team) } label: { row.contentShape(Rectangle()) }
                                            .buttonStyle(.plain)
                                    } else {
                                        row
                                    }
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
                    .hubBodyFont(13.5, .semibold).foregroundStyle(.white).lineLimit(1)
                if !sub.isEmpty {
                    Text(sub).hubBodyFont(11).foregroundStyle(.white.opacity(0.62)).lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            if !trail.isEmpty {
                Text(trail.uppercased())
                    .hubDataFont(9, .medium)
                    .foregroundStyle(.white.opacity(0.62)).lineLimit(1)
            }
        }
        .padding(.horizontal, 18).padding(.vertical, 10)
    }
}
