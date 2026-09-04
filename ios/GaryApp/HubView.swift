import SwiftUI

// ============================================================================
// THE HUB — tonight's front page (July 2026 redesign)
//
// The Hub is Gary's daily intelligence sheet, structured like the front of a
// sports section instead of a filing cabinet of lanes: the lead story, the
// best of the board (relevance-ranked across every lane), the signature
// boards (Regression, Streak Watch), the beats (the long tail in four human
// sections). (The Receipts section came off the page Aug 6 — graded rows
// now surface only through search.)
//
// Visual language (Jul 4, founder-tuned): heavy SF display for the wordmark
// and headlines, mono uppercase kickers for lanes/sections, monospaced digits
// for data, gold hairline rules — "legit A.I. tech meets sports betting",
// never newspaper-serif, never crypto-dashboard. Palette stays Gary: warm
// black, gold signature, HubPalette green/red tones.
//
// Data machinery (staleness gates, 6am ET rollover, graded-date walk-back,
// kept-alive-tab visibility flips) is carried over from the original Hub page
// (PropsHubView, removed Jul 4 2026 once the founder approved this one) — that
// plumbing encodes weeks of fixed production bugs and is presentation-free.
// ============================================================================

// MARK: - Type + chrome system

/// DEPRECATED NAMESPACE (Aug 4 2026). HubFont was a second, parallel type ramp
/// — same intent as GaryFonts, subtly different math, so the Hub and Picks
/// pages rendered a "12" differently from Home's "12" and no size could be
/// reasoned about across pages. Every role now forwards to the one ramp in
/// DesignSystem.swift, byte-identical output. New code calls GaryFonts directly;
/// these aliases stay only so the ~140 existing call sites keep working.
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
    // HR Threat prices are a price, not a hot/cold verdict — same carve-out
    // as O/U streaks above (founder, Aug 4: the green odds "read as already
    // graded"). Cosmetic only: s.tone itself is untouched, so the morning
    // grader's branch on it is unaffected.
    if s.kind == .hrThreat { return GaryColors.gold }
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

    /// Player-backed signals open their populated player card — MLB always,
    /// football when today's pack exists for the id. Team-backed rows use
    /// the team card, with the compact signal overlay as the safe fallback.
    private func openSignal(_ s: Signal) {
        // Football rows open the player pack sheet ONLY when today's football
        // pack verifiably exists for that player id (the pipeline builds
        // NFL/NCAAF packs since Aug 27 2026); otherwise the edge overlay stays
        // the fallback, so a football tap can never land on a permanent
        // "building" screen. The MLB team-card pipeline remains MLB-only.
        if sel == .nfl || sel == .ncaaf {
            if let pid = s.playerId, intelCards.contains(where: { $0.player_id == pid }) {
                breakdownSignal = s
            } else {
                selectedSignal = s
            }
        }
        else if s.playerId != nil { breakdownSignal = s }
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
        if let hit = intelCards.first(where: {
            let n = key($0.player_name ?? $0.payload?.name ?? "")
            return !n.isEmpty && (n == k || n.contains(k) || k.contains(n))
        }) { return hit }
        // Short-form fallback (Aug 4): the agate tables send "J. Caminero" —
        // an initialed first token + surname. Match surname exactly and the
        // initial against the card's first name; full-name queries never take
        // this path (the containment scan above owns those).
        let tokens = name.split(separator: " ").map(String.init)
        guard tokens.count >= 2,
              let sur = tokens.last.map(key), sur.count >= 3 else { return nil }
        let first = tokens[0].filter { $0.isLetter }
        guard first.count == 1 else { return nil }
        return intelCards.first {
            let cn = ($0.player_name ?? $0.payload?.name ?? "").split(separator: " ").map(String.init)
            guard cn.count >= 2, let cSur = cn.last.map(key) else { return false }
            return cSur == sur && cn[0].lowercased().hasPrefix(first.lowercased())
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
        let order: [HubLeagueSel] = [.mlb, .nfl, .ncaaf, .nba, .wc]
        // All-Star break (Jul 13-14 2026): a dark MLB slate is still an MLB
        // day — keep the tab so the All-Star card has a home (founder call;
        // same date-window treatment WC already gets). Self-retires Jul 15.
        let allStarActive = ["2026-07-13", "2026-07-14"].contains(SupabaseAPI.todayEST())
        let permanentDesks: Set<HubLeagueSel> = [.mlb, .nfl, .ncaaf]
        let present = order.filter { lg in
            permanentDesks.contains(lg)
                || (lg == .wc && wcActive)
                || (lg == .mlb && allStarActive)
                || fetched.contains { $0.league == lg }
                || (todayBoard?.board ?? []).contains { ($0.league ?? "").uppercased() == lg.label }
        }
        return present.isEmpty ? [.mlb] : present
    }

    private func load() async {
        let date = SupabaseAPI.todayEST()
        let gradedDate0 = SupabaseAPI.hubGradedDateEST()
        let shouldChooseInitialLeague = !didLoad
        async let rateF = SupabaseAPI.fetchInsightHitRate(date: gradedDate0)
        async let nightF = SupabaseAPI.fetchNightHighlights(date: gradedDate0)
        async let streaksF = SupabaseAPI.fetchStreaks()
        async let tbF = SupabaseAPI.fetchTodayBoard(date: date)
        async let intelF = SupabaseAPI.fetchPlayerIntelRows(date: date)
        // Force past the 30-min pulse cache on refresh/rollover, not first paint.
        async let pulseMlbF = SupabaseAPI.fetchLeaguePulse(date: date, league: "MLB", forceRefresh: didLoad)
        async let pulseNflF = SupabaseAPI.fetchLeaguePulse(date: date, league: "NFL", forceRefresh: didLoad)
        async let pulseNcaafF = SupabaseAPI.fetchLeaguePulse(date: date, league: "NCAAF", forceRefresh: didLoad)

        var successful: [HubLeagueSel: [Signal]] = [:]
        var failedLeagues: Set<HubLeagueSel> = []
        await withTaskGroup(of: (league: HubLeagueSel?, sigs: [Signal], errored: Bool).self) { group in
            for lg in AppFlags.insightLeagues {
                group.addTask {
                    let league = HubLeagueSel.from(lg)
                    do {
                        let conns = try await SupabaseAPI.fetchInsightConnections(date: date, league: lg)
                        return (league, conns.compactMap { $0.toSignal() }, false)
                    } catch {
                        print("[HubView] fetchInsightConnections(\(lg)) error: \(error.localizedDescription)")
                        return (league, [], true)
                    }
                }
            }
            for await r in group {
                guard let league = r.league else { continue }
                if r.errored { failedLeagues.insert(league) }
                else { successful[league] = r.sigs }
            }
        }
        var collected = successful.values.flatMap { $0 }
        collected = Self.dedupe(collected)
        #if DEBUG
        // Sim-QA breadcrumb (GaryTour's file channel, reversed): lane counts
        // after the dedupe, readable from the host via the data container.
        var kindCounts: [String: Int] = [:]
        for s in collected where s.league == .mlb { kindCounts[s.kind.chip, default: 0] += 1 }
        let dbg = kindCounts.map { "\($0.key)=\($0.value)" }.sorted().joined(separator: "\n")
        try? dbg.write(toFile: NSTemporaryDirectory() + "hub-debug.txt", atomically: true, encoding: .utf8)
        #endif

        // Graded surfaces flip at 6am ET but grading lands ~6:45am — walk back
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
        let pulse: [String: [LeaguePulseRow]] = [
            "MLB": await pulseMlbF,
            "NFL": await pulseNflF,
            "NCAAF": await pulseNcaafF,
        ]
        // Graded rows still load — not for a page section (The Receipts came
        // off Aug 6), but search surfaces them and the tally maths read them.
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
            // Successful desks replace their prior rows, including a genuine
            // empty day. Failed desks alone retain their last-good snapshot.
            let retained = fetched.filter { failedLeagues.contains($0.league) }
            let resolved = Self.dedupe(collected + retained)
            intelCards = intel
            didLoad = true
            loadedAt = Date()
            loadedDate = date
            fetchErrorLeagues = failedLeagues
            hitRate = rate
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
            pulseByLeague = pulse
            fetched = resolved
            itemsIndex = Self.buildItemsIndex(resolved)
            // Land on the highest-priority league with edges tonight, without
            // stomping a user-picked league that still has rows.
            if shouldChooseInitialLeague,
               !resolved.contains(where: { $0.league == sel }),
               let top = availableLeagues.first(where: { lg in resolved.contains { $0.league == lg } }) {
                sel = top
            }
            consumeFocus()
        }
    }

    private func reloadIfStale() async {
        guard didLoad else { return }
        let expired = loadedAt.map { Date().timeIntervalSince($0) > 1800 } ?? true
        let emptyBoard = fetched.isEmpty && ydaySignals.isEmpty
        if loadedDate != SupabaseAPI.todayEST() || expired || !fetchErrorLeagues.isEmpty || emptyBoard {
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
        let anchor: String
        switch lane {
        case .regression:                            anchor = "regression"
        case .streak:                                anchor = isFootball ? "form" : "streaks"
        case .fantasyPickups, .twoStart,
             .closerWatch, .returnWatch, .cutList:   anchor = "fantasy"
        case .hot, .cold, .platoon, .batterVsArm:    anchor = "bats"
        case .hrThreat:                              anchor = HubView.hrThreatsLive ? "hr" : "bats"
        case .starterForm,
             .bullpenFatigue, .ballpark:             anchor = sel == .wc ? "matchups" : "arms"
        case .teamRecord:                            anchor = isFootball ? "form" : (sel == .wc ? "matchups" : "arms")
        case .situational:                           anchor = isFootball ? "form" : (sel == .wc ? "matchups" : "arms")
        case .injury:                                anchor = isFootball ? "field" : "matchups"
        case .h2h:                                   anchor = isFootball ? "form" : "matchups"
        case .firstInning,
             .runningGame, .parkWeather:             anchor = "matchups"
        case .tournament, .advancement:              anchor = "cup"
        case .xgRegression, .xgRecap:                anchor = "numbers"
        case .trenches, .passRush:                   anchor = "trenches"
        case .mismatch:                              anchor = "mismatch"
        case .quarterback:                           anchor = "field"
        case .coverage, .paceScript, .redZone,
             .turnoverEdge, .explosivePlay,
             .specialTeams, .coaching:               anchor = "edges"
        case .afterGary:                              anchor = "afterGary"
        case .marketRange:                            anchor = isFootball ? "edges" : "more"
        case .nextSlate:                              anchor = "nextSlate"
        case .practiceReport:                         anchor = "field"
        case .theSweat:                               anchor = "theSweat"
        case .fantasyUsage, .fantasyRedZone,
             .fantasyMatchup, .fantasyTrend:          anchor = "fantasy"
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
        let rows = fetched.filter { $0.league == sel }
        guard isFootball else { return rows }
        return rows.filter { signal in
            switch signal.kind {
            case .afterGary:
                return FootballProofContract.isRenderableAfterGary(signal)
            case .theSweat:
                return FootballProofContract.isRenderableSweat(signal, includeWatch: false)
            case .marketRange:
                // NCAAF only, and only against a confirmed slate row.
                guard sel == .ncaaf, let id = signal.gameId.flatMap(Int.init) else { return false }
                return FootballProofContract.isRenderableMarketRange(
                    signal, slateRow: slateRows.first(where: { $0.bdl_game_id == id })
                )
            default:
                return true
            }
        }
    }

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

    /// Every kind that lives in the Fantasy Corner — those rows render as
    /// FantasyCards (tier word + stat strip + the read); the front-page row
    /// template has none of that, so a leaked one strips to a naked player
    /// name ("Kohl Drake / ARI TONIGHT" — the Aug 6 bug: only .fantasyPickups
    /// was filtered).
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

    /// Rows that can actually carry the front page. Modules render in their own
    /// slots, so they must not decide whether the page reads as empty.
    private var storyRows: [Signal] {
        leagueSignals.filter { !Self.moduleKinds.contains($0.kind) && $0.confirmedXI == nil }
    }

    /// The dark-day schedule card stands in for the slate strip on a football
    /// day with no games — and takes the morning notice's place while it shows.
    private var showsNextSlateCard: Bool {
        slateRows.isEmpty && leagueSignals.contains { $0.kind == .nextSlate }
    }

    /// Relevance-ranked stories across every lane (rows arrive relevance-
    /// ordered per league): no look-ahead regression, no confirmed-XI cards,
    /// no fantasy corner content, max 2 per lane so the top of the page mixes.
    private var ranked: [Signal] {
        var counts: [SignalKind: Int] = [:]
        var out: [Signal] = []
        for s in leagueSignals {
            if s.confirmedXI != nil { continue }
            if Self.fantasyKinds.contains(s.kind) { continue }
            if Self.moduleKinds.contains(s.kind) { continue }
            if s.reg?.day == "tomorrow" { continue }
            let c = counts[s.kind] ?? 0
            guard c < 2 else { continue }
            counts[s.kind] = c + 1
            out.append(s)
            if out.count == 7 { break }
        }
        return out
    }
    /// THE LEAD must be an INSIGHT — a connection between facts — never a raw
    /// counting stat (founder, Aug 3: "the headline we have now isn't really
    /// a true insight, it's just a stat math thing"). Counting lanes (heat
    /// checks, streaks, records) still make the Best of the Board; they just
    /// can't headline the page. Falls back to the top row only when no
    /// connection lane produced anything today.
    private static let leadInsightKinds: Set<SignalKind> = [
        .regression, .ballpark, .platoon, .h2h, .bullpenFatigue,
        .firstInning, .closerWatch, .runningGame, .parkWeather,
        .trenches, .quarterback, .passRush, .coverage, .paceScript,
        .redZone, .turnoverEdge, .explosivePlay, .specialTeams, .coaching,
    ]
    /// Resolve the lead and remainder from one ranked snapshot. The previous
    /// `bestOfBoard` filter called `lead` inside its closure, which rebuilt
    /// `ranked` while an earlier ranked array was still on the SwiftUI render
    /// stack. Besides doing the work once per row, that nested large Signal
    /// copies deeply enough to exhaust the production iPhone thread stack.
    private var frontPageSelection: (lead: Signal?, best: [Signal]) {
        let rows = ranked
        let lead = rows.first(where: { Self.leadInsightKinds.contains($0.kind) }) ?? rows.first
        guard let lead else { return (nil, []) }
        return (lead, rows.filter { $0.id != lead.id })
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
                Beat(anchor: "arms", title: "The Arms", kinds: [.starterForm, .teamRecord, .bullpenFatigue, .ballpark]),
                Beat(anchor: "nrfi", title: "The NRFI Watch", kinds: [.firstInning]),
            ]
        } else {
            beats = [
                Beat(anchor: "bats", title: "The Bats", kinds: [.hot, .cold, .platoon, .hrThreat, .batterVsArm]),
                Beat(anchor: "arms", title: "The Arms", kinds: [.starterForm, .teamRecord, .bullpenFatigue, .ballpark]),
                Beat(anchor: "nrfi", title: "The NRFI Watch", kinds: [.firstInning]),
            ]
        }
        return AppFlags.storeSafe ? beats.filter { $0.anchor != "nrfi" } : beats
    }
    /// Founder, Jul 22: "green light it but don't run it tonight — first run
    /// tomorrow." String compare works on ISO dates.
    static var hrThreatsLive: Bool { SupabaseAPI.todayEST() >= "2026-07-23" }

    /// The stories already told at the top of the page. Football's thinner
    /// feeds made the same signal appear as THE LEAD, BEST OF THE BOARD, and
    /// again in its beat; once featured above, the beat keeps only the extras.
    ///
    /// PERF (measured Aug 21 2026): this used to be rebuilt INSIDE `beatRows`,
    /// so every beat — and every pass of the jump nav over the beats — rebuilt
    /// `frontPageSelection`, which rebuilds `ranked`, which rebuilds
    /// `leagueSignals` (proof-gated, date-parsing). Twelve tab switches cost
    /// 506 `leagueSignals` evaluations and 231 `ranked` rebuilds. The callers
    /// now compute this ONCE per pass and thread it in — the same "resolve the
    /// snapshot once" rule `frontPageSelection` itself was written for.
    private var featuredStoryIDs: Set<UUID> {
        guard isFootball else { return [] }
        let selection = frontPageSelection
        return Set(([selection.lead].compactMap { $0 } + selection.best).map(\.id))
    }

    /// Rows for a beat, in the feed's relevance order (each row keeps its own
    /// lane kicker). Regression rows live on the board, never in a beat.
    private func beatRows(_ beat: Beat, featured: Set<UUID>) -> [Signal] {
        let kinds = Set(beat.kinds)
        return leagueSignals.filter {
            kinds.contains($0.kind)
                && !featured.contains($0.id)
                && $0.confirmedXI == nil
                && $0.reg == nil
        }
    }

    /// "hub" | "fantasy" — which desk the page shows (header toggle, persisted).
    /// Fantasy is its OWN page (founder, Jul 26): never a section in the feed.
    @AppStorage("hubScope") private var hubScope = "hub"

    // (hubScopeToggle folded onto the masthead line Aug 6 night — THE HUB /
    // FANTASY ride beside the league words as gold-text tabs, no underline.)

    /// Everything not already on the page — a safety net so a future backend
    /// lane always renders somewhere instead of vanishing.
    private var overflow: [Signal] {
        // .h2h is EXCLUDED from the Hub, not merely placed (founder, Aug 6:
        // "the H2H parts here doesnt need to be on The Hub") — the team season
        // series lives on the Picks page game view, where the ledger renders.
        // Without this it would fall through to More Edges and reappear.
        var placed: Set<SignalKind> = Self.fantasyKinds.union([.regression, .streak, .h2h, .theSweat, .nextSlate, .practiceReport])
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

    @ViewBuilder private func beatView(_ beat: Beat, featured: Set<UUID>) -> some View {
        let rows = beatRows(beat, featured: featured)
        // (The second HR block — "Gary's HR Calls Tonight / Longshot Lane",
        // HubHRCallsBlock — was removed Aug 4 2026 on the founder's call: two
        // HR sections back to back was one too many. The gold-priced Home Run
        // Threats beat above stays. The struct and its isolated data path
        // (hrCalls/hrProps/hrPropsF) were fully self-contained — confirmed no
        // other surface referenced them — so this was a clean removal, not a
        // flag-off.)
        if !rows.isEmpty {
            // Founder-picked shapes (Aug 6): H2H = the case card (mock H6),
            // NRFI = the story card (mock N10). WC still speaks the old
            // storyboard; every other beat keeps the flat feed.
            if beat.anchor == "afterGary" {
                HubAfterGarySection(anchor: beat.anchor,
                                    rows: rows,
                                    openBeats: $openBeats,
                                    onRow: { s in openSignal(s) })
                    .id(beat.anchor)
            } else if beat.anchor == "nrfi" {
                HubNrfiSection(rows: rows) { s in openSignal(s) }
                    .id(beat.anchor)
            } else if beat.anchor == "matchups" {
                HubMatchupsSection(
                    rows: rows,
                    slateIndexFor: { slateIndexFor($0) },
                    openBeats: $openBeats,
                    kickerFor: kickerText,
                    onRow: { s in openSignal(s) },
                    onProfile: { breakdownSignal = $0 },
                    onGame: { openGameSheet(for: $0) }
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

    // ---- extracted body chunks (the inline runs plus their closures blew
    // the type-checker's budget) ----

    @ViewBuilder private var searchResultsView: some View {
        HubSearchResults(
            query: searchText,
            edges: fetched,
            receipts: ydaySignals,
            streaks: streakRows,
            night: nightRows,
            nightLabel: nightLabel,
            onEdge: { s in openSignal(s) },
            cardFor: { intelCard(for: $0) },
            onPlayer: { namedCard = $0 },
            onTeamRow: { openTeamCard(for: $0) },
            onTeamName: { openTeamCard(named: $0) }
        )
    }

    @ViewBuilder private var streakWatchSection: some View {
        if !selStreakRows.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                HubHead(title: "Streak Watch", count: selStreakRows.count)
                HubStreakWatch(rows: selStreakRows, onTeam: { openTeamCard(for: $0) },
                               cardFor: { intelCard(for: $0) }, onPlayer: { namedCard = $0 })
            }
            .id("streaks")
        }
    }

    // The beats + WC intel + the overflow net, one extracted run.
    @ViewBuilder private var beatsAndOverflow: some View {
        // ONE snapshot for the whole run (see `featuredStoryIDs`).
        let featured = featuredStoryIDs
        ForEach(beats) { beat in
            beatView(beat, featured: featured)
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

    // ---- the front page's editorial boards (extracted from body — the
    // inline run plus its closures blew the type-checker's budget) ----

    @ViewBuilder private var frontPageBoards: some View {
        let selection = frontPageSelection
        if let lead = selection.lead {
            HubLeadStory(s: lead) { s in
                openSignal(s)
            }
            .id("lead")
        }
        if !selection.best.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                HubHead(title: "The Best of the Board")
                HubBestOf(signals: selection.best) { s in
                    openSignal(s)
                }
            }
            .id("bestof")
        }
        if !items(.regression).isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                // Sub lives on the tab strip now — a static
                // "ERA vs expected" lied over the Teams tab.
                HubHead(title: "The Regression Board")
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

    // THE REFERENCE SHELF — folded by default (founder, Jul 30/Aug 3): league
    // tables and graded boards are look-ups, not the page's story. One tap
    // opens each. Every name in them routes by the law (Aug 4): player names
    // → player card when the day has one, team names → the team card.
    @ViewBuilder private var referenceShelf: some View {
        // MLB, NFL, and NCAAF all carry pulse tabs now (Aug 27 2026); the dict
        // read keeps a league with no stored tabs collapsed to nothing.
        if [.mlb, .nfl, .ncaaf].contains(sel), !pulseRows.isEmpty {
            HubCollapsible(anchor: "pulse", open: $openBeats,
                           title: "League Pulse", sub: "league-wide tables") {
                HubLeaguePulse(rows: pulseRows, selectedTab: $pulseTab,
                               cardFor: { intelCard(for: $0) },
                               onPlayer: { namedCard = $0 },
                               onTeam: { openTeamCard(named: $0) })
            }
            .id("pulse")
        }

        if !selNightRows.isEmpty {
            HubCollapsible(anchor: "lastNight", open: $openBeats,
                           title: nightLabel, count: selNightRows.count) {
                HubNightBoard(rows: selNightRows,
                              cardFor: { intelCard(for: $0) }, onPlayer: { namedCard = $0 },
                              onTeam: { openTeamCard(named: $0) })
            }
            .id("lastNight")
        }

        // (The Receipts section came off the page entirely — founder, Aug 6.
        // ydaySignals stays fetched: graded rows still power Hub search.)
    }

    // Keep the top-level stack's concrete type deliberately shallow. Build 6
    // produced two TestFlight crashes in Swift's runtime demangler while it
    // instantiated the nested _ConditionalContent type generated here. The
    // state/scope branches below are erased independently so Release builds do
    // not have to materialize that pathological generic type at launch.
    private var hubPageStack: some View {
        VStack(alignment: .leading, spacing: 26) {
            HubMasthead(
                sel: $sel,
                leagues: availableLeagues,
                gameCount: slateRows.count,
                searchOpen: $searchOpen,
                searchText: $searchText,
                searchFocused: $searchFocused
            )
            .id("top")

            hubScopeContent
        }
    }

    private var hubScopeContent: AnyView {
        if didLoad, fetchErrorLeagues.contains(sel), leagueSignals.isEmpty {
            return AnyView(hubError)
        }
        if hubScope == "fantasy", sel != .ncaaf {
            // One Fantasy Corner for every league but college (founder, Sep 3
            // 2026: MLB is the template; football differs only in its content;
            // Sep 4: no fantasy desk for NCAAF).
            return AnyView(
                FantasyCornerPage(
                    pickups: items(.fantasyPickups),
                    cuts: items(.cutList),
                    twoStarts: items(.twoStart),
                    closers: items(.closerWatch),
                    returners: items(.returnWatch),
                    league: sel,
                    usage: items(.fantasyUsage),
                    scoring: items(.fantasyRedZone) + items(.fantasyMatchup),
                    trending: items(.fantasyTrend),
                    loaded: didLoad
                ) { s in openSignal(s) }
            )
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
        if fetchErrorLeagues.contains(sel) && leagueSignals.isEmpty && ydaySignals.isEmpty
            && nightRows.isEmpty && streakRows.isEmpty {
            return AnyView(hubError)
        }
        // NFL and NCAAF run THIS page — the founder's call (Aug 21): the Hub
        // is MLB's layout, design and mechanics exactly, carrying football's
        // own lanes. The only football-specific machinery left is the proof
        // gate on `leagueSignals` (which rows may be shown at all) and the
        // dark-day next-slate card in the empty slot.
        return AnyView(hubLoadedContent)
    }

    private var hubLoadedContent: some View {
        VStack(alignment: .leading, spacing: 26) {
            if !slateRows.isEmpty {
                HubSlateStrip(rows: slateRows) { r in
                    gameSheet = HubGameSel(row: r)
                }
            }

            // Football dark day (NFL + NCAAF since Aug 24): no slate to strip,
            // so the verified next kickoff takes the strip's place rather than
            // leaving the page headless.
            if showsNextSlateCard, let next = leagueSignals.first(where: { $0.kind == .nextSlate }) {
                FootballNextSlatePreview(signal: next, accent: GaryColors.gold)
                    .id("nextSlate")
            }

            if !storyRows.isEmpty {
                frontPageBoards
            } else if !showsNextSlateCard {
                hubMorningNotice
            }

            // (League Pulse moved to the reference shelf at the bottom
            // — founder, Aug 3: the agate tables broke the page's flow
            // mid-editorial. It lives with Last Night now.)

            streakWatchSection

            if !leagueSignals.isEmpty {
                beatsAndOverflow
            }

            referenceShelf
        }
    }

    // ---- body ----

    var body: some View {
        GeometryReader { geo in
        ScrollViewReader { proxy in
        ScrollView(showsIndicators: false) {
            hubPageStack
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
            .task { if !didLoad { await load() } }
        }
        .overlay(alignment: .bottomTrailing) {
            if !searchOpen, didLoad, !jumpItems.isEmpty, hubScope != "fantasy" {
                HubSectionNav(items: jumpItems, open: $sectionNavOpen) { anchor in
                    if anchor == "lastNight" { openBeats.insert(anchor) }
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
            case "nfl": withAnimation { sel = .nfl }
            case "ncaaf": withAnimation { sel = .ncaaf }
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
                board: todayBoard,
                streaks: selStreakRows,
                intel: intelCards,
                cardFor: { intelCard(for: $0) },
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
                    HubGameSheet(row: sel.row,
                                 edges: edgesFor(sel.row),
                                 streaks: streaksFor(sel.row),
                                 kickerFor: kickerText,
                                 onClose: { withAnimation(.spring(response: 0.3, dampingFraction: 0.88)) { gameSheet = nil } },
                                 onViewGame: { onSelectGame($0) },
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
    /// One lane label for every row on the page. Routes through the shared
    /// renamer so football's `.injury` reads AVAILABILITY (MLB's REPLACEMENT
    /// misnames "Mertz is out") and WC's `.ballpark` reads VENUE.
    private func kickerText(_ s: Signal) -> String {
        signalChipLabel(kind: s.kind, league: s.league)
    }

    /// Jump-bar entries — only sections that exist right now, in page order.
    private var jumpItems: [(anchor: String, label: String)] {
        // One generic index for every league — the football branch is gone with
        // the football page (founder, Aug 21: the Hub is MLB's, everywhere).
        var out: [(String, String)] = []
        if showsNextSlateCard { out.append(("nextSlate", "Next Slate")) }
        if !leagueSignals.isEmpty {
            let selection = frontPageSelection
            if selection.lead != nil || !selection.best.isEmpty { out.append(("lead", "The Best")) }
            if !items(.regression).isEmpty { out.append(("regression", "Regression")) }
            if sel == .wc, !items(.xgRegression).isEmpty { out.append(("xgboard", "xG")) }
        }
        if sel == .mlb, !pulseRows.isEmpty { out.append(("pulse", "Pulse")) }
        if !selStreakRows.isEmpty { out.append(("streaks", "Streaks")) }
        if !leagueSignals.isEmpty {
            let featured = featuredStoryIDs
            for beat in beats where !beatRows(beat, featured: featured).isEmpty {
                out.append((beat.anchor, beat.title.replacingOccurrences(of: "The ", with: "")))
            }
        }
        if !selNightRows.isEmpty { out.append(("lastNight", nightLabel)) }
        return out
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
    /// last night render below) — this is just the honest note.
    private var hubMorningNotice: some View {
        VStack(alignment: .leading, spacing: 6) {
            HubKicker(text: "Tonight's Board")
            Text("No \(sel.label) edges posted yet.")
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
    @Binding var searchOpen: Bool
    @Binding var searchText: String
    var searchFocused: FocusState<Bool>.Binding
    /// Same key the page reads — the scope tabs live on the masthead line now.
    @AppStorage("hubScope") private var hubScope = "hub"

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // NO masthead on the Hub (founder, Aug 6 night, third ruling) —
            // one flat line at the very top, all four pieces horizontal:
            // MLB (league words) · THE HUB · FANTASY. Scope tabs wear
            // gold-text state, underline hardware gone (his call: "just use
            // gold font"); search keeps its corner seat.
            HStack(spacing: 16) {
                if !leagues.isEmpty {
                    LeagueWordsTrigger(current: sel.label) {
                        let opts = leagues.map { l -> LeagueOverlayState.Option in
                            let n = l == sel ? gameCount : 0
                            return .init(code: l.label,
                                         sup: n > 0 ? "\(n) GAME\(n == 1 ? "" : "S")" : nil,
                                         live: false, selected: l == sel)
                        }
                        // The whole calendar, not just what's live (founder, Aug 4).
                        let full = opts + LeagueOverlayState.offSeasonOptions(
                            excluding: Set(leagues.map(\.label)))
                        LeagueOverlayState.shared.present(full) { picked in
                            if let hit = leagues.first(where: { $0.label == picked }) {
                                withAnimation(.easeInOut(duration: 0.2)) { sel = hit }
                            }
                        }
                    }
                }
                scopeWord("THE HUB", on: hubScope != "fantasy" || sel == .ncaaf) { hubScope = "hub" }
                // No fantasy desk for college (founder, Sep 4 2026: "NCAAF
                // doesn't need fantasy"): the scope word is gone on the NCAAF
                // desk and the page below never routes there.
                if sel != .ncaaf {
                    scopeWord("FANTASY", on: hubScope == "fantasy") { hubScope = "fantasy" }
                }
                Spacer(minLength: 8)
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
                        .frame(width: 26, height: 26)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(searchOpen ? "Close search" : "Search")
            }
            .padding(.top, 10)
            .pageGutter()

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
                .pageGutter()
            }
        }
        // (No outer gutter — the top line and search field gutter themselves.)
    }

    /// Gold-text scope word — active wears gold, inactive waits dim; no
    /// underline (founder, Aug 6 night — same grammar as Home's day tabs).
    private func scopeWord(_ label: String, on: Bool, tap: @escaping () -> Void) -> some View {
        Button(action: tap) {
            Text(label)
                .font(HubFont.data(11, .bold)).tracking(1.2)
                .foregroundStyle(on ? GaryColors.gold : .white.opacity(0.5))
                .fixedSize()
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
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
/// Provider abbreviation when the row carries one; otherwise the league's own
/// abbreviation map. The old fallback took the first three LETTERS of the team
/// name, which is wrong far more often than it looks: "Green Bay Packers" came
/// out "GRE" instead of GB, and both Chicago clubs collapsed to "CHI" — two
/// different games showing the same side. `teamAbbrevFromName` already owns the
/// per-league keyword maps every other surface uses; the strip now shares them,
/// and only falls back to the blind prefix when the league is unknown.
fileprivate func hubSideLabel(_ abbr: String?, _ team: String?, league: String? = nil) -> String {
    if let a = abbr, !a.isEmpty { return a }
    guard let t = team, !t.isEmpty else { return "—" }
    let mapped = teamAbbrevFromName(t, league: league)
    if !mapped.isEmpty { return mapped.uppercased() }
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

    private func side(_ abbr: String?, _ team: String?, _ league: String?) -> String { hubSideLabel(abbr, team, league: league) }

    @ViewBuilder private func block(_ r: TomorrowBoardRow) -> some View {
        let marquee = r.is_marquee == true
        let matchup = "\(side(r.away_abbr, r.away_team, r.league)) @ \(side(r.home_abbr, r.home_team, r.league))"
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
                    // A college row filed date-only carries no real kickoff —
                    // say so instead of printing a placeholder as a time.
                    Text(r.kickoffTimeLabel
                         ?? TomorrowView.etTime(r.commence_time, withZone: false, meridiem: true))
                        .font(HubFont.data(9.5, .medium))
                        .foregroundStyle(marquee ? GaryColors.gold : .white.opacity(0.55))
                    // STORE-SAFE BRIDGE: the strip is a schedule — no totals.
                    if let t = r.total, !AppFlags.storeSafe {
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
            // 01-based: the list is its own board. (It used to start at 02 —
            // "the lead is 01" — but the lead wears THE LEAD, not a number,
            // so the 02 open read as a missing row, Aug 6.)
            Text(String(format: "%02d", i + 1))
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
        HStack(spacing: 20) {
            ForEach(availableTabs, id: \.self) { t in
                let on = t == activeTab
                Button { withAnimation(.easeInOut(duration: 0.15)) { tab = t; expandedID = nil } } label: {
                    HStack(spacing: 5) {
                        Text(label(t).uppercased()).font(HubFont.kicker(11)).tracking(1.3)
                        Text("\(rowsFor(t).count)").font(HubFont.data(10, .medium))
                    }
                    .foregroundStyle(on ? GaryColors.gold : .white.opacity(0.45))
                    .fixedSize()                      // labels never wrap — the sub yields instead
                    .frame(minHeight: 30)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            Spacer(minLength: 8)
            Text(subline(activeTab).uppercased())
                .font(HubFont.kicker(9)).tracking(1)
                .foregroundStyle(.white.opacity(0.45))
                .lineLimit(1).minimumScaleFactor(0.6)
        }
        .padding(.horizontal, 18)
        .padding(.bottom, 2)
    }

    @ViewBuilder private func row(_ i: Int, _ s: Signal) -> some View {
        let expandable = s.reg != nil
        let expanded = expandedID == s.id
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                // THE LAW (founder, Aug 3): a name tap opens the player card,
                // a team row opens the team card — period. The whole row is
                // that tap; the chevron alone owns expand/collapse.
                Button { onTap(s) } label: {
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
                            .frame(width: 30, height: 30)
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
            // (The "TAP AGAIN" hint died Aug 3 — the row tap always opens the
            // profile now; the chevron owns this drawer.)
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
                            .font(HubFont.body(12))
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
                    .minimumScaleFactor(0.6)
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
                                        .font(HubFont.data(9.5, .medium))
                                        .foregroundStyle(.white.opacity(0.55))
                                        .lineLimit(1)
                                }
                                Text(signal.headline)
                                    .font(HubFont.body(14.5, .semibold))
                                    .foregroundStyle(.white.opacity(0.95))
                                    .lineLimit(2)
                                    .multilineTextAlignment(.leading)
                            }
                            Spacer(minLength: 6)
                            if !signal.value.isEmpty {
                                Text(signal.value)
                                    .font(HubFont.data(12.5, .semibold))
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
                        // The NAME outranks its note for width and scales
                        // rather than clipping — "Gabriel Rincones Jr." beside
                        // a full BATS/OPS note otherwise ellipsized the player
                        // right out of his own row (no-ellipsis law).
                        Text(swap.out_name ?? "—")
                            .font(HubFont.body(14, .semibold))
                            .strikethrough(true, color: HubPalette.red.opacity(0.7))
                            .foregroundStyle(.white.opacity(0.55))
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                            .layoutPriority(1)
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
                            .minimumScaleFactor(0.6)
                            .layoutPriority(1)
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

// MARK: - The NRFI Watch (mock N10 story card — founder pick, Aug 6)

/// One story card per first-inning edge: kicker row (the row's own side word
/// + game), display-face headline, Gary's read, then the evidence — each
/// side's last-10 first innings as dots (color law, Jul 30: a run SCORED
/// glows green, a scoreless first burns red) and the 1st-inning price line.
fileprivate struct HubNrfiSection: View {
    let rows: [Signal]
    let onTap: (Signal) -> Void

    private let green = HubPalette.green
    private let red = HubPalette.red

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HubHead(title: "The NRFI Watch", count: rows.count)
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
                    .font(HubFont.data(9.5, .medium))
                    .foregroundStyle(.white.opacity(0.55))
            }
            Text(s.headline)
                .font(HubFont.display(21))
                .foregroundStyle(GaryColors.warmWhite)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 7)
            Text(s.detail)
                .font(HubFont.body(13.5))
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
                        .font(HubFont.kicker(9)).tracking(1.2)
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
                .font(HubFont.data(10, .semibold))
                .foregroundStyle(.white.opacity(0.62))
            Text(odds > 0 ? "+\(odds)" : "\(odds)")
                .font(HubFont.data(12, .bold))
                .foregroundStyle(GaryColors.gold)
        }
    }

    @ViewBuilder private func seqRow(_ abbr: String, _ seq: [Int]) -> some View {
        let clean = seq.filter { $0 == 0 }.count
        HStack(spacing: 8) {
            Text(abbr.uppercased())
                .font(GaryFonts.accent(11)).foregroundStyle(.white.opacity(0.85))
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
                .font(HubFont.data(10, .bold)).foregroundStyle(.white.opacity(0.7))
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
                    .font(HubFont.display(20))
                    .foregroundStyle(GaryColors.warmWhite)
                    .lineLimit(1).minimumScaleFactor(0.7)
                Spacer(minLength: 8)
                if let t = block.time {
                    Text(t.uppercased())
                        .font(HubFont.data(9.5, .semibold))
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
        // Football lanes (founder, Sep 3 2026: MLB is the template — same
        // card, football's numbers). Matchup leads, numbers follow.
        case "fantasy_usage":
            if let o = m.opp, !o.isEmpty { bits.append("vs \(o)") }
            if let n = m.per_game, let u = m.unit { bits.append("\(HubFmt.stat(n)) \(u)") }
            if let g = m.games_played { bits.append("\(g) G") }
            if m.evidence_scope == "prior_season_baseline", let y = m.season?.display { bits.append("\(y) baseline") }
        case "fantasy_matchup":
            if let o = m.opp, !o.isEmpty { bits.append("vs \(o)") }
            if let i = m.implied_team_total { bits.append("\(HubFmt.stat(i)) implied") }
            if let t = m.total { bits.append("O/U \(HubFmt.stat(t))") }
            if let n = m.per_game, let u = m.unit { bits.append("\(HubFmt.stat(n)) \(u)") }
        case "fantasy_trend":
            if let o = m.opp, !o.isEmpty { bits.append("vs \(o)") }
            if let p = m.percent_change { bits.append(String(format: "%@%.0f%% workload", p >= 0 ? "+" : "", p)) }
            if let a = m.latest_two, let b = m.prior_sample, let u = m.unit {
                bits.append("\(HubFmt.stat(a)) vs \(HubFmt.stat(b)) \(u.lowercased())")
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
    /// Football (founder, Sep 3 2026: MLB is the template — the ONLY
    /// difference is that NFL is NFL content): the same masthead, headers and
    /// FantasyCard, carrying football's lanes instead of baseball's.
    var league: HubLeagueSel = .mlb
    var usage: [Signal] = []
    var scoring: [Signal] = []
    var trending: [Signal] = []
    let loaded: Bool
    let onTap: (Signal) -> Void

    private var isFootball: Bool { league == .nfl || league == .ncaaf }
    private var total: Int {
        isFootball
            ? usage.count + scoring.count + trending.count
            : pickups.count + cuts.count + twoStarts.count + closers.count + returners.count
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
            } else if isFootball {
                if !usage.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        HubHead(title: "The Waiver Wire", count: usage.count)
                        FantasyCardList(items: usage, accent: GaryColors.gold, onTap: onTap)
                    }
                }
                if !scoring.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        HubHead(title: "Scoring Spots", count: scoring.count)
                        FantasyCardList(items: scoring, accent: HubPalette.green, onTap: onTap)
                    }
                }
                if !trending.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        HubHead(title: "Trending", count: trending.count)
                        FantasyCardList(items: trending, accent: GaryColors.gold, onTap: onTap)
                    }
                }
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

/// The TEAM CARD — the player breakdown's team twin (founder, Aug 4, the
/// standing law restated: a tapped team name opens THIS, everywhere, at the
/// SAME finish as the player card). One design language: PCV4's matte black,
/// the gold edge, cream ink, the same section grammar and the same MORE
/// STATS expander. Every figure is a stored fact the app already fetched —
/// board form / run profile / season series / probable arms, streak rows,
/// the day's player intel. A stat with no source simply isn't a row; a card
/// with nothing filed says so honestly. Names on it keep routing by the law:
/// player names → player card, edges → the router.
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
    @ObservedObject private var live = LiveScoreCache.shared
    @State private var shapeExpanded = false   // MORE STATS expander (player-card parity)

    // ── identity: the tapped string (name OR abbr) → full name + abbr ──

    /// Loose team match: abbreviation equality, name containment either way,
    /// or nickname hit — the taps arrive as anything from "NYY" to
    /// "New York Yankees" depending on the surface.
    private static func matches(_ raw: String, team: String?, abbr: String?) -> Bool {
        let n = raw.trimmingCharacters(in: .whitespaces).lowercased()
        guard !n.isEmpty else { return false }
        if let a = abbr?.lowercased(), !a.isEmpty, a == n { return true }
        if let t = team?.lowercased(), !t.isEmpty {
            if t == n || t.contains(n) || n.contains(t) { return true }
            if let nick = t.split(separator: " ").last.map(String.init), nick.count > 2, n.contains(nick) { return true }
        }
        return false
    }

    private var rawName: String { HubView.teamCardName(for: signal) }

    /// Which side of tonight's row this card is about (nil = not on the slate).
    private var isAway: Bool? {
        guard let t = tonight else { return nil }
        if Self.matches(rawName, team: t.away_team, abbr: t.away_abbr) { return true }
        if Self.matches(rawName, team: t.home_team, abbr: t.home_abbr) { return false }
        return nil
    }

    /// The best identity the board can vouch for. Never fabricated — when no
    /// source knows this team, the tapped string renders as-is.
    private var resolved: (name: String, abbr: String?) {
        if let away = isAway, let t = tonight {
            return away ? (t.away_team ?? rawName, t.away_abbr)
                        : (t.home_team ?? rawName, t.home_abbr)
        }
        if let f = (board?.form ?? []).first(where: { Self.matches(rawName, team: $0.team, abbr: $0.abbr) }) {
            return (f.team ?? rawName, f.abbr)
        }
        if let rp = (board?.run_profile ?? []).first(where: { Self.matches(rawName, team: $0.team, abbr: $0.abbr) }) {
            return (rp.team ?? rawName, rp.abbr)
        }
        return (rawName, nil)
    }

    // ── the stored facts, each nil when its source has nothing ──

    private var formStat: TomorrowForm? {
        (board?.form ?? []).first { Self.matches(resolved.name, team: $0.team, abbr: $0.abbr) }
    }
    private var runProfile: TomorrowRunProfile? {
        (board?.run_profile ?? []).first { Self.matches(resolved.name, team: $0.team, abbr: $0.abbr) }
    }
    /// Tonight's probable arm for THIS team, from the board's starters lane.
    private var starter: TomorrowPerson? {
        (board?.starters ?? []).first { p in
            Self.matches(resolved.name, team: p.team, abbr: p.abbr)
        }
    }
    /// First-pitch weather for tonight's park (outdoor games only).
    private var weather: TomorrowWeather? {
        guard let t = tonight else { return nil }
        return (board?.weather ?? []).first { w in
            (w.away_abbr != nil && w.away_abbr == t.away_abbr && w.home_abbr == t.home_abbr)
        }
    }
    /// The board's divisional-standing sentence, when this team made Big Games.
    private var standingLine: String? {
        let nick = resolved.name.split(separator: " ").last.map(String.init) ?? resolved.name
        guard nick.count > 2 else { return nil }
        return (board?.big_games ?? [])
            .compactMap { $0.standing }
            .first { $0.localizedCaseInsensitiveContains(nick) }
    }
    /// This club's live runs (team-typed streak rows only).
    private var teamStreaks: [StreakRow] {
        streaks.filter { $0.subject_type == "team" && Self.matches(resolved.name, team: $0.subject ?? $0.team, abbr: nil) }
    }
    /// The day's player cards wearing this team's abbreviation — the bats and
    /// arms with a full breakdown behind them. Tap one, get the player card.
    private var teamIntel: [PlayerInsightCardRow] {
        guard let a = resolved.abbr?.uppercased(), !a.isEmpty else { return [] }
        return intel.filter { ($0.team_abbr ?? "").uppercased() == a }
    }
    private var ls: LiveScore? {
        guard let t = tonight else { return nil }
        return live.status(forMatchup: "\(t.away_team ?? "") @ \(t.home_team ?? "")")
    }
    /// True when not a single source produced a row — the honest-quiet state.
    private var deskIsQuiet: Bool {
        tonight == nil && formStat == nil && runProfile == nil && starter == nil
            && teamStreaks.isEmpty && teamIntel.isEmpty && related.isEmpty
            && edgeContent == nil
    }

    // ── body: the v4 card, exactly the player card's chrome ──

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 0) {
                header
                if let e = edgeContent { edgeHero(e) }
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
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous).fill(PCV4.bg)
                .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(PCV4.gold.opacity(0.5), lineWidth: 1.5))
                .shadow(color: .black.opacity(0.55), radius: 24, y: 10)
        )
        .padding(16)
        .background(GaryColors.darkBg.ignoresSafeArea())
        .overlay(alignment: .topTrailing) {
            Button { dismiss() } label: {
                Image(systemName: "xmark.circle.fill").font(.system(size: 26)).foregroundStyle(.white.opacity(0.62))
            }.buttonStyle(.plain).padding(.top, 14).padding(.trailing, 16)
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    // ── header (player-card grammar: context line, display name, chip, identity) ──

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let t = tonight {
                Text("\(hubSideLabel(t.away_abbr, t.away_team, league: t.league)) @ \(hubSideLabel(t.home_abbr, t.home_team, league: t.league))".uppercased())
                    .font(GaryFonts.mono(11, bold: true)).foregroundStyle(PCV4.mut2)
            } else if !signal.game.isEmpty {
                Text(signal.game.uppercased())
                    .font(GaryFonts.mono(11, bold: true)).foregroundStyle(PCV4.mut2)
            }
            HStack(alignment: .top) {
                Text(resolved.name)
                    .font(GaryFonts.display(38)).foregroundStyle(PCV4.ink).lineLimit(2).minimumScaleFactor(0.7)
                Spacer()
                if let st = formStat?.streak, st.count >= 2 {
                    if st.hasPrefix("W") { chip("▲ \(st)") }
                    else if st.hasPrefix("L") { chip("▼ \(st)") }
                }
            }
            if let id = identityLine {
                Text(id).font(GaryFonts.text(13, .medium)).foregroundStyle(PCV4.mut)
            }
        }
        .padding(.horizontal, 26).padding(.top, 24).padding(.bottom, 18)
    }
    private func chip(_ t: String) -> some View {
        Text(t).font(GaryFonts.mono(10.5, bold: true))
            .foregroundStyle(Color(hex: "#1B1407"))
            .padding(.horizontal, 10).padding(.vertical, 5)
            .background(Capsule().fill(PCV4.gold))
    }
    /// "MLB · NYY · Home tonight" — only the parts a source vouches for.
    private var identityLine: String? {
        var bits: [String] = [signal.league.label]
        if let a = resolved.abbr, !a.isEmpty, a.lowercased() != resolved.name.lowercased() { bits.append(a) }
        if let away = isAway { bits.append(away ? "Road tonight" : "Home tonight") }
        return bits.isEmpty ? nil : bits.joined(separator: "  ·  ")
    }

    // ── the edge that brought you here (player-card edgeHero, verbatim style) ──

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
            return PlayerCardV4Edge(eyebrow: signal.kind.chip, title: body, body: "")
        }
        return PlayerCardV4Edge(eyebrow: signal.kind.chip, title: signal.headline, body: body)
    }

    @ViewBuilder private func edgeHero(_ e: PlayerCardV4Edge) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(e.eyebrow.uppercased()).font(GaryFonts.mono(9.5, bold: true)).tracking(1.4).foregroundStyle(PCV4.gold)
            Text(e.title).font(GaryFonts.display(18)).foregroundStyle(PCV4.ink).fixedSize(horizontal: false, vertical: true)
            if !e.body.isEmpty {
                Text(e.body).font(GaryFonts.text(13)).foregroundStyle(PCV4.mut).lineSpacing(2).fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(PCV4.gold.opacity(0.07))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(PCV4.line, lineWidth: 1)))
        .padding(.horizontal, 18).padding(.bottom, 4)
    }

    // ── the player card's section frame, shared by every block below ──

    private func section<C: View>(_ cap: String, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 13) {
            Text(cap.uppercased()).font(GaryFonts.mono(11, bold: true)).tracking(1.6)
                .foregroundStyle(PCV4.gold).opacity(0.92)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 26).padding(.vertical, 20)
        .overlay(Rectangle().fill(PCV4.line).frame(height: 1), alignment: .top)
    }

    // ── TONIGHT: state line, then the lines as a 3-up grid ──

    private func fmtML(_ v: Double) -> String { v > 0 ? "+\(Int(v))" : "\(Int(v))" }

    @ViewBuilder private func tonightSection(_ t: TomorrowBoardRow) -> some View {
        section(ls?.isLive == true ? "Live" : ls?.isFinal == true ? "Final" : "Tonight") {
            VStack(alignment: .leading, spacing: 12) {
                if let ls, ls.isLive || ls.isFinal {
                    HStack(spacing: 10) {
                        Text(ls.scoreLine ?? "")
                            .font(GaryFonts.display(22)).foregroundStyle(PCV4.ink)
                        if ls.isLive, let det = ls.detail, !det.isEmpty {
                            Text(det.uppercased())
                                .font(GaryFonts.mono(11, bold: true)).foregroundStyle(GaryColors.win)
                        }
                    }
                } else {
                    HStack(spacing: 8) {
                        Text(TomorrowView.etTime(t.commence_time, withZone: true, meridiem: true))
                            .font(GaryFonts.display(18)).foregroundStyle(PCV4.ink)
                        if let v = t.venue, !v.isEmpty {
                            Text(v).font(GaryFonts.text(12)).foregroundStyle(PCV4.mut2)
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
                    HStack(spacing: 12) {
                        ForEach(tiles.indices, id: \.self) { i in
                            VStack(spacing: 6) {
                                Text(tiles[i].0.uppercased()).font(GaryFonts.mono(9, bold: true)).foregroundStyle(PCV4.mut2)
                                Text(tiles[i].1).font(GaryFonts.display(18)).foregroundStyle(PCV4.ink)
                                    .lineLimit(1).minimumScaleFactor(0.6)
                            }.frame(maxWidth: .infinity)
                        }
                    }
                }
                if let w = weather, let note = w.note, !note.isEmpty {
                    splitLikeRow("FIRST-PITCH WEATHER", note)
                }
                if let st = standingLine {
                    Text(st).font(GaryFonts.text(12, .medium)).foregroundStyle(PCV4.mut)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    /// A splitRow-shaped line: mono label left, value right (player-card idiom).
    private func splitLikeRow(_ label: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label).font(GaryFonts.mono(10, bold: true)).foregroundStyle(PCV4.mut2).lineLimit(1)
            Spacer(minLength: 12)
            Text(value).font(GaryFonts.text(12, .medium)).foregroundStyle(PCV4.mut)
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
                                Text(cells[i].0).font(GaryFonts.mono(9, bold: true)).foregroundStyle(PCV4.mut2)
                                Text(cells[i].1).font(GaryFonts.display(18)).foregroundStyle(PCV4.ink)
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
                            Text(shapeExpanded ? "LESS" : "MORE STATS").font(GaryFonts.mono(10, bold: true)).tracking(1.4)
                            Image(systemName: shapeExpanded ? "chevron.up" : "chevron.down").font(.system(size: 8, weight: .bold))
                        }
                        .foregroundStyle(PCV4.gold)
                    }
                    .buttonStyle(.plain)
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
                            .font(GaryFonts.accent(13)).foregroundStyle(awayLeads ? PCV4.ink : PCV4.mut2)
                        Text("\(aw)")
                            .font(GaryFonts.display(awayLeads ? 30 : 22))
                            .foregroundStyle(awayLeads ? PCV4.gold : PCV4.mut2)
                        Text("–").font(GaryFonts.display(18)).foregroundStyle(PCV4.mut2)
                        Text("\(hw)")
                            .font(GaryFonts.display(awayLeads ? 22 : 30))
                            .foregroundStyle(awayLeads ? PCV4.mut2 : PCV4.gold)
                        Text(hubSideLabel(t.home_abbr, t.home_team, league: t.league))
                            .font(GaryFonts.accent(13)).foregroundStyle(awayLeads ? PCV4.mut2 : PCV4.ink)
                    }
                }
                if let split = s.split_line, !split.isEmpty {
                    Text(split).font(GaryFonts.mono(10)).foregroundStyle(PCV4.mut2)
                        .lineLimit(1).minimumScaleFactor(0.7)
                }
                if let meetings = s.meetings, !meetings.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(meetings.indices, id: \.self) { i in
                            let m = meetings[i]
                            HStack(alignment: .firstTextBaseline) {
                                Text(m.d ?? "").font(GaryFonts.mono(10, bold: true)).foregroundStyle(PCV4.mut2)
                                    .frame(width: 52, alignment: .leading)
                                Text(m.line ?? "").font(GaryFonts.text(12, .medium)).foregroundStyle(PCV4.mut)
                                    .lineLimit(1).minimumScaleFactor(0.7)
                                Spacer(minLength: 8)
                                if let v = m.venue, !v.isEmpty {
                                    Text(v).font(GaryFonts.mono(9.5)).foregroundStyle(PCV4.mut2)
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
                                Text(armName).font(GaryFonts.display(18)).foregroundStyle(PCV4.ink)
                                    .lineLimit(1).minimumScaleFactor(0.7)
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 9, weight: .semibold)).foregroundStyle(PCV4.mut2)
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    } else {
                        Text(armName).font(GaryFonts.display(18)).foregroundStyle(PCV4.ink)
                            .lineLimit(1).minimumScaleFactor(0.7)
                    }
                    Spacer(minLength: 8)
                    if let era = p.era {
                        Text("\(HubFmt.stat(era)) ERA").font(GaryFonts.mono(11, bold: true)).foregroundStyle(PCV4.mut)
                    }
                }
                if let x = p.xera { splitLikeRow("EXPECTED ERA", HubFmt.stat(x)) }
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
                        Text(streakBadge(r)).font(GaryFonts.display(16)).foregroundStyle(PCV4.gold)
                            .frame(width: 52, alignment: .leading)
                        Text(r.detail ?? r.kind?.capitalized ?? "")
                            .font(GaryFonts.text(12, .medium)).foregroundStyle(PCV4.mut)
                            .lineLimit(2).fixedSize(horizontal: false, vertical: true)
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
                                        .font(GaryFonts.text(13, .semibold)).foregroundStyle(PCV4.ink)
                                        .lineLimit(1).minimumScaleFactor(0.7)
                                    if let pos = row.payload?.position, !pos.isEmpty {
                                        Text(pos).font(GaryFonts.mono(9.5)).foregroundStyle(PCV4.mut2)
                                    }
                                }
                                if let line = row.payload?.strengths?.first ?? row.payload?.weaknesses?.first {
                                    Text(line).font(GaryFonts.text(11.5)).foregroundStyle(PCV4.mut)
                                        .lineLimit(2).fixedSize(horizontal: false, vertical: true)
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
                                Text(r.kind.chip.uppercased())
                                    .font(GaryFonts.mono(8.5, bold: true)).tracking(1.1).foregroundStyle(PCV4.mut2)
                                Text(r.headline)
                                    .font(GaryFonts.text(12.5, .semibold)).foregroundStyle(PCV4.ink)
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
                .font(GaryFonts.mono(10.5, bold: true)).tracking(1.4).foregroundStyle(PCV4.gold).opacity(0.92)
            Text("Nothing filed on the \(resolved.name) yet — reads land as today's board firms up.")
                .font(GaryFonts.text(13)).foregroundStyle(PCV4.mut).lineSpacing(2)
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
            // The team tag routes to the team card (law, Aug 4); ink unchanged.
            let teamLabel = Text(HomeView.shortTeam(r.team).uppercased())
                .font(HubFont.data(10, .semibold))
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
    /// Header team names → close, then the team card (the law, Aug 4: a team
    /// name is a door to the team card everywhere it appears).
    var onTeamName: (String) -> Void = { _ in }
    /// Tap-a-name → player card (On-the-Line player rows).
    var cardFor: (String?) -> PlayerInsightCardRow? = { _ in nil }
    @ObservedObject private var live = LiveScoreCache.shared
    @State private var detailSignal: Signal? = nil
    @State private var breakdownSignal: Signal? = nil
    @State private var namedCard: PlayerInsightCardRow? = nil

    private var abbrMatchup: String {
        "\(hubSideLabel(row.away_abbr, row.away_team, league: row.league)) @ \(hubSideLabel(row.home_abbr, row.home_team, league: row.league))"
    }
    private var ls: LiveScore? {
        live.status(forMatchup: "\(row.away_team ?? "") @ \(row.home_team ?? "")")
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 26) {
                header
                if edges.isEmpty {
                    Text("No edges posted for this game yet.")
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
                        HubStreakWatch(rows: streaks, onTeam: { onTeam($0) },
                                       cardFor: cardFor, onPlayer: { namedCard = $0 })
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
        .sheet(item: $namedCard) { PlayerInsightSheet(signal: nil, prefetched: $0) }
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
            // Each side is a door to its team card (the law, Aug 4). Two lines
            // instead of one so long names never fight the tap targets.
            VStack(alignment: .leading, spacing: 0) {
                teamNameLine(row.away_team ?? hubSideLabel(row.away_abbr, nil), lead: nil)
                teamNameLine(row.home_team ?? hubSideLabel(row.home_abbr, nil), lead: "@")
            }
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
            Text(label.uppercased()).font(HubFont.kicker(10.5)).tracking(0.6).foregroundStyle(.white.opacity(0.62))
            Text(value).font(HubFont.data(15)).foregroundStyle(.white.opacity(0.92))
        }
    }

    /// One masthead side, tappable → its team card. The "@" stays plain ink.
    private func teamNameLine(_ name: String, lead: String?) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            if let lead {
                Text(lead)
                    .font(HubFont.display(22))
                    .foregroundStyle(.white.opacity(0.35))
            }
            Button { onClose(); onTeamName(name) } label: {
                Text(name)
                    .font(HubFont.display(30))
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
                        Text(r == "hit" ? AppFlags.wonStamp : r == "push" ? "PUSH" : "LOST")
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
