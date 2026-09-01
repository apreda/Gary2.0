// HomeFrontPage.swift — Front Page Blocks, League Words, ESPN-for-bettors layer.
// Split out of Views.swift on Sep 1 2026 (the 28K-line monolith); pure move,
// no behavior change. Section boundaries follow the original MARK headers.

import SwiftUI
import Combine
import Charts
import WebKit
import SafariServices
import StoreKit

// MARK: - Front Page Blocks (Home)

/// The Home masthead — the mock wordmark (Jul 4, founder-picked): heavy
/// "GARY" + gold "A.I.", the date in mono on the same baseline, bear mark,
/// settings dots, one gold hairline. Dynamic sports-tech, never serif.
/// The green "already cashed" slot under a LIVE row's status — one hit shows
/// static, two-plus roll on a slow cadence (founder, Jul 7; slowed further Jul 15 —
/// "far too fast" at the old ~3-4.6s pace).
/// Was retired to a static "N PROPS CASHED" line on Jul 12 — over-scoped:
/// the founder's "too much motion, too much green" note was about THE BOARD
/// section, not this one. Restored Jul 14 (founder: Live/Earlier Today was
/// never supposed to lose the roll) — same current type/color, cycling back.
// (HomeMasthead retired Aug 6 night — headers came off every page but Picks;
// Home opens straight on the phase switcher.)

/// Act head — mock language: gold hairline, mono uppercase label, mono count,
/// quiet sub right-aligned. Twin of the Hub's section head.
// ── ALL-STAR WEEK takeover ──────────────────────────────────────────────
// One-week surface (July 2026 break): the exhibitions get the marquee slot.
// Flat on the page — kicker row, the event in display type, Gary's call in
// gold, his opening line, then the week's runway. Tap anywhere → Picks tab.
// Exhibition rules: no seal/Winners language, no pick-promise beyond the
// call that actually exists in the store.
struct HomeAllStarTakeover: View {
    let specials: [GaryPick]
    var onOpenPicks: () -> Void

    // ASG identity duotone (founder: "add in some All-Star game colors") —
    // local to this one-week surface so it retires with it; the featured call
    // and Gary's voice stay gold.
    private let asgRed = Color(hex: "#D50032")
    private let asgBlue = Color(hex: "#2D68C4")

    /// Derby day vs ASG day, from the data (ASG picks ride AL/NL team slots).
    // Both team spellings: the board originally carried "American League" and
    // was renamed to "AL" (Jul 14) when the long names shortened to
    // "LEAGUE @ LEAGUE" on the pick card — the rename broke this gate and the
    // takeover fell back to the Derby face.
    private var isAsgDay: Bool { specials.contains { $0.awayTeam == "AL" || $0.awayTeam == "American League" } }
    /// Headline pick — only its start time surfaces here (no pick reveals on Home).
    private var featured: GaryPick? {
        specials.first { $0.game_id == 20260713 || $0.game_id == 8712499 } ?? specials.first
    }

    /// One runway row: event + detail left, day + clock right-aligned.
    @ViewBuilder private func runwayRow(event: String, detail: String, day: String, clock: String?) -> some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 2) {
                Text(event)
                    .font(.system(size: 14.5, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.92))
                Text(detail)
                    .font(GaryFonts.text(12))
                    .foregroundStyle(GaryColors.meta)
            }
            Spacer(minLength: 12)
            VStack(alignment: .trailing, spacing: 2) {
                Text(day)
                    .font(GaryFonts.mono(10, bold: true))
                    .tracking(0.8)
                    .foregroundStyle(GaryColors.meta)
                if let clock {
                    Text(clock)
                        .font(GaryFonts.mono(12, bold: true))
                        .foregroundStyle(.white.opacity(0.85))
                }
            }
        }
        .padding(.vertical, 9)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                // The ASG duotone pair replaces the gold slab on this surface.
                HStack(spacing: 3) {
                    BroadcastBar(tint: asgRed, height: 14)
                    BroadcastBar(tint: asgBlue, height: 14)
                }
                Text("ALL-STAR WEEK")
                    .font(GaryFonts.accent(15))
                    .foregroundStyle(.white)
                    .tracking(1.2)
                Text("★")
                    .font(.system(size: 11, weight: .black))
                    .foregroundStyle(asgRed)
                    .baselineOffset(1)
                Spacer(minLength: 0)
                Text("CITIZENS BANK PARK")
                    .font(GaryFonts.mono(11, bold: true))
                    .tracking(0.8)
                    .foregroundStyle(GaryColors.meta)
            }

            HStack(alignment: .firstTextBaseline) {
                // Explicit two-line stack — on wide phones the headline fit one
                // line and lost the marquee read (founder, Jul 13: the stacked
                // face IS the view, on every device).
                Text(isAsgDay ? "ALL-STAR\nGAME" : "HOME RUN\nDERBY")
                    .font(GaryFonts.display(34))
                    .foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 8)
                Text("TONIGHT · \(featured?.time ?? "8:00 PM") ET")
                    .font(GaryFonts.mono(12, bold: true))
                    .foregroundStyle(GaryColors.sectionSub)
            }

            // No pick reveals here (founder): Home says the board EXISTS and
            // where it lives — the picks themselves stay on the Picks tab.
            Button(action: onOpenPicks) {
                HStack(spacing: 8) {
                    Text("GARY'S BOARD — \(specials.count) PICK\(specials.count == 1 ? "" : "S") · ON THE PICKS TAB")
                        .font(GaryFonts.mono(14, bold: true))
                        .foregroundStyle(GaryColors.gold)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(GaryColors.gold.opacity(0.8))
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            // The week's runway — a real schedule block (founder: no wrapping
            // meta strings): event + detail left, day + time right, hairlines.
            // (On ASG day the WC semi has its own live surfaces — no ad here.)
            VStack(alignment: .leading, spacing: 0) {
                if !isAsgDay {
                    runwayRow(event: "ALL-STAR GAME", detail: "Cease vs Sánchez",
                              day: "TOMORROW", clock: "8:00 PM ET")
                    Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1)
                    runwayRow(event: "WC SEMIFINAL", detail: "Spain @ France",
                              day: "TOMORROW", clock: "3:00 PM ET")
                    Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1)
                }
                // First pitch back = TB @ BOS 1:35 PM ET Fri Jul 17 (BDL-verified).
                runwayRow(event: "MLB RETURNS", detail: "Full slate",
                          day: "FRIDAY", clock: "1:35 PM ET")
            }
            Rectangle().fill(Color.white.opacity(0.08)).frame(height: 1)
        }
        .pageGutter()
        .padding(.top, 4)
    }
}

// ── THE CONTEST — the Derby's own lineup view (custom, Jul 13 2026): every
// participant with his season power, tonight's Round 1 line, and Gary's
// OVER/UNDER call on each posted line (allstar_props — Sol's list board).
// Lives on the Derby game page AND under the Hub's All-Star card; the pick
// cards stay untouched — this is the "pump out a ton of picks" list product.
struct DerbyContestSection: View {
    /// Kept for call-site compatibility; the full take now lives in the
    /// floating pop (tap a row), so rows stay tight everywhere.
    var showReasons = true
    @State private var rows: [SupabaseAPI.AllStarPropRow] = []
    @State private var extras: [SupabaseAPI.AllStarPropRow] = []
    @State private var takeRow: SupabaseAPI.AllStarPropRow? = nil
    @State private var cardRow: SupabaseAPI.AllStarPropRow? = nil
    @State private var showRules = false

    /// Bet text sometimes arrives with the price baked in ("… final +210") —
    /// strip it for display; the gold odds column is the single price source.
    static func cleanBet(_ s: String?) -> String {
        (s ?? "").replacingOccurrences(of: #"\s*[+-]\d{3,4}\s*$"#, with: "", options: .regularExpression)
    }

    /// Settled-call mark (✓ / ✗ / –) for the row's trailing seat — nil until
    /// the live grading writes the row's result mid-event.
    static func resultMark(_ result: String?) -> (icon: String, color: Color)? {
        switch result {
        case "won": ("checkmark", GaryColors.win)
        case "lost": ("xmark", GaryColors.loss)
        case "push": ("minus", GaryColors.meta)
        default: nil
        }
    }

    /// Ticker abbreviation for the one-line rows (first-list layout).
    static func abbr(_ team: String?) -> String {
        switch (team ?? "") {
        case "Phillies": return "PHI"; case "Rays": return "TB"
        case "White Sox": return "CHW"; case "Yankees": return "NYY"
        case "Cardinals": return "STL"; case "Royals": return "KC"
        case "Red Sox": return "BOS"
        default: return String((team ?? "").prefix(3)).uppercased()
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Derby-day only: with no contest rows and no extras (the ASG, any
            // future special) the whole section vanishes — a bare "THE
            // CONTESTANTS" header leaked onto the ASG page (founder, Jul 14).
            if !rows.isEmpty || !extras.isEmpty {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                BroadcastBar(height: 12)
                Text("THE CONTESTANTS")
                    .font(GaryFonts.accent(12.5))
                    .tracking(0.5)
                    .foregroundStyle(GaryColors.gold)
                // ⓘ pops the full Derby breakdown — rules never sit as page
                // prose (founder: explain in a pop, nothing else up here).
                Button { showRules = true } label: {
                    Image(systemName: "info.circle")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.5))
                        .frame(width: 22, height: 22)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Derby format and rules")
                Spacer(minLength: 0)
            }
            // Two-line rows with air (founder): name + team-colored tag with
            // TO WIN on the top line, the R1 call in gold under the name.
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { i, r in
                    Button { if r.reason != nil { takeRow = r } } label: {
                        // Odds column vertically CENTERED against the two-line
                        // left block (founder); gold lives ONLY on the win odds
                        // and the OVER/UNDER word; R1 rows show no juice.
                        HStack(alignment: .center, spacing: 10) {
                            VStack(alignment: .leading, spacing: 4) {
                                HStack(spacing: 8) {
                                    // Name opens the STANDARD player card.
                                    Button { if r.player_id != nil { cardRow = r } } label: {
                                        Text(r.player ?? "")
                                            .font(.system(size: 15.5, weight: .semibold))
                                            .foregroundStyle(.white.opacity(0.92))
                                            .lineLimit(1)
                                            .minimumScaleFactor(0.8)
                                            .contentShape(Rectangle())
                                    }
                                    .buttonStyle(.plain)
                                    Text(Self.abbr(r.team))
                                        .font(GaryFonts.mono(11, bold: true)).tracking(0.6)
                                        .foregroundStyle(TeamColors.color(for: r.team) ?? .white.opacity(0.55))
                                    Spacer(minLength: 8)
                                }
                                if let line = r.line, let call = r.call, !call.isEmpty {
                                    (Text("R1 ").foregroundColor(.white.opacity(0.7))
                                        + Text(call.uppercased()).foregroundColor(GaryColors.gold)
                                        + Text(" \(line.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(line)) : String(line))").foregroundColor(.white.opacity(0.7)))
                                        .font(GaryFonts.mono(12, bold: true))
                                } else {
                                    Text("LINE PENDING")
                                        .font(GaryFonts.mono(11.5, bold: true))
                                        .foregroundStyle(GaryColors.meta)
                                }
                            }
                            // One right column, vertically centered: season HR
                            // stacked over the win odds (founder).
                            VStack(alignment: .trailing, spacing: 2) {
                                if let hr = r.season_hr {
                                    Text("\(hr) HR")
                                        .font(GaryFonts.mono(11.5, bold: true))
                                        .foregroundStyle(.white.opacity(0.85))
                                }
                                if let w = r.win_odds {
                                    Text("\(w > 0 ? "+" : "")\(w)")
                                        .font(GaryFonts.mono(13, bold: true))
                                        .foregroundStyle(GaryColors.gold)
                                }
                            }
                            // Graded LIVE during the event — the mark takes the
                            // chevron's seat the moment a round settles the call.
                            if let mark = Self.resultMark(r.result) {
                                Image(systemName: mark.icon)
                                    .font(.system(size: 12, weight: .black))
                                    .foregroundStyle(mark.color)
                            } else if r.reason != nil {
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundStyle(GaryColors.gold.opacity(0.6))
                            }
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .padding(.vertical, 12)
                    if i < rows.count - 1 {
                        Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1)
                    }
                }
            }

            // MORE DERBY PLAYS — the extra board (founder): a simple list,
            // bet line + price, tap for the take. Never contradicts the
            // locked board (enforced at generation).
            if !extras.isEmpty {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    BroadcastBar(height: 12)
                    Text("MORE DERBY PLAYS")
                        .font(GaryFonts.accent(12.5))
                        .tracking(0.5)
                        .foregroundStyle(GaryColors.gold)
                    Spacer(minLength: 0)
                }
                .padding(.top, 14)
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(extras.enumerated()), id: \.element.id) { i, r in
                        Button { if r.reason != nil { takeRow = r } } label: {
                            HStack(spacing: 8) {
                                Text(Self.cleanBet(r.call))
                                    .font(.system(size: 15, weight: .semibold))
                                    .foregroundStyle(.white.opacity(0.92))
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.75)
                                Spacer(minLength: 8)
                                if let o = r.odds {
                                    Text("\(o > 0 ? "+" : "")\(o)")
                                        .font(GaryFonts.mono(13, bold: true))
                                        .foregroundStyle(GaryColors.gold)
                                }
                                if let mark = Self.resultMark(r.result) {
                                    Image(systemName: mark.icon)
                                        .font(.system(size: 12, weight: .black))
                                        .foregroundStyle(mark.color)
                                } else if r.reason != nil {
                                    Image(systemName: "chevron.right")
                                        .font(.system(size: 10, weight: .bold))
                                        .foregroundStyle(GaryColors.gold.opacity(0.6))
                                }
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .padding(.vertical, 11)
                        if i < extras.count - 1 {
                            Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1)
                        }
                    }
                }
            }
            }   // end rows/extras-present gate
        }
        .pageGutter()
        .padding(.top, 8)
        .task {
            if rows.isEmpty {
                rows = await SupabaseAPI.fetchAllStarProps(date: SupabaseAPI.todayEST())
                extras = await SupabaseAPI.fetchAllStarProps(date: SupabaseAPI.todayEST(), market: "extra")
            }
        }
        .sheet(item: $cardRow) { r in
            PlayerInsightSheet(signal: nil, directPlayerId: r.player_id, directName: r.player)
        }
        // Floating center pop (founder: never a bottom pull-up for these) —
        // full-screen dim with the take card centered, tap anywhere to close.
        .fullScreenCover(item: $takeRow) { r in
            DerbyTakeOverlay(row: r) { takeRow = nil }
        }
        .fullScreenCover(isPresented: $showRules) {
            FloatingRulesOverlay(
                title: "THE DERBY, EXPLAINED",
                rows: [
                    ("ROUND 1", "All 8 hitters, 20 swings each — every swing counts. The top four home run totals advance."),
                    ("THE BRACKET", "Semifinals seed 1 vs 4 and 2 vs 3 by Round 1 totals; semis and the final are 15 swings each."),
                    ("NO CLOCK", "No timer anywhere — hitters take pitches freely; only swings count."),
                    ("FINAL SWING", "Homer on your last swing and you keep swinging until you miss."),
                    ("TIEBREAKERS", "Round 1 ties break on longest homer; bracket ties go to three-swing swing-offs."),
                ]) { showRules = false }
        }
        .transaction { $0.disablesAnimations = false }
    }
}

/// Reusable floating rules/info pop (founder: rules live in a pop, never as
/// prose on the page) — centered card over a dim field, same grammar as the
/// take overlay. Feed it any title + rows wherever rules need explaining.
struct FloatingRulesOverlay: View {
    let title: String
    let rows: [(String, String)]
    var onClose: () -> Void
    var body: some View {
        ZStack {
            Color.black.opacity(0.9).ignoresSafeArea()
                .onTapGesture { onClose() }
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    BroadcastBar(height: 13)
                    Text(title)
                        .font(GaryFonts.accent(13))
                        .tracking(1.0)
                        .foregroundStyle(GaryColors.gold)
                    Spacer(minLength: 0)
                    Button(action: onClose) {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 22))
                            .foregroundStyle(.white.opacity(0.4))
                    }
                    .buttonStyle(.plain)
                }
                ForEach(rows, id: \.0) { r in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(r.0)
                            .font(GaryFonts.mono(11, bold: true)).tracking(1.0)
                            .foregroundStyle(GaryColors.gold)
                        Text(r.1)
                            .font(GaryFonts.text(13.5))
                            .foregroundStyle(.white.opacity(0.85))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .padding(20)
            .background(RoundedRectangle(cornerRadius: 18).fill(GaryColors.cardBg))
            .overlay(RoundedRectangle(cornerRadius: 18).stroke(Color.white.opacity(0.1), lineWidth: 1))
            .padding(.horizontal, 22)
        }
    }
}

/// The floating GARY'S TAKE pop for a contest row — centered card over a
/// dimmed field, tap-out or ✕ to close.
struct DerbyTakeOverlay: View {
    let row: SupabaseAPI.AllStarPropRow
    var onClose: () -> Void
    var body: some View {
        ZStack {
            Color.black.opacity(0.9).ignoresSafeArea()
                .onTapGesture { onClose() }
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    BroadcastBar(height: 13)
                    Text("GARY'S TAKE")
                        .font(GaryFonts.accent(13))
                        .tracking(1.0)
                        .foregroundStyle(GaryColors.gold)
                    Spacer(minLength: 0)
                    Button(action: onClose) {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 22))
                            .foregroundStyle(.white.opacity(0.4))
                    }
                    .buttonStyle(.plain)
                }
                Text((row.player ?? "").uppercased())
                    .font(GaryFonts.display(30))
                    .foregroundStyle(.white)
                HStack(spacing: 8) {
                    if let line = row.line, let call = row.call {
                        Text("R1 O/U \(line.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(line)) : String(line)) — \(call.uppercased())\(row.odds.map { " \($0 > 0 ? "+" : "")\($0)" } ?? "")")
                            .font(GaryFonts.mono(13.5, bold: true))
                            .foregroundStyle(GaryColors.gold)
                    } else if row.call != nil {
                        // Extras: the whole bet line rides `call` (price stripped —
                        // the odds render once, from the odds field).
                        Text("\(DerbyContestSection.cleanBet(row.call).uppercased())\(row.odds.map { " \($0 > 0 ? "+" : "")\($0)" } ?? "")")
                            .font(GaryFonts.mono(13.5, bold: true))
                            .foregroundStyle(GaryColors.gold)
                            .lineLimit(2)
                    }
                    Spacer(minLength: 0)
                    if let w = row.win_odds {
                        Text("TO WIN \(w > 0 ? "+" : "")\(w)")
                            .font(GaryFonts.mono(11.5, bold: true))
                            .foregroundStyle(GaryColors.meta)
                    }
                }
                ScrollView(showsIndicators: false) {
                    // Readable paragraphs (founder): honor authored \n\n breaks;
                    // a single-block take gets soft-split into sentence groups.
                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(Array(Self.paragraphs(row.reason ?? "").enumerated()), id: \.offset) { _, p in
                            Text(p)
                                .font(GaryFonts.text(14.5))
                                .foregroundStyle(.white.opacity(0.88))
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                .frame(maxHeight: 380)
            }
            .padding(20)
            .background(RoundedRectangle(cornerRadius: 18).fill(GaryColors.cardBg))
            .overlay(RoundedRectangle(cornerRadius: 18).stroke(Color.white.opacity(0.1), lineWidth: 1))
            .padding(.horizontal, 22)
        }
    }

    /// Authored \n\n paragraphs pass through; a single block splits into
    /// groups of ~3 sentences (layout only — the words are untouched).
    static func paragraphs(_ text: String) -> [String] {
        let authored = text.components(separatedBy: "\n\n").filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        if authored.count > 1 { return authored }
        let sentences = text.components(separatedBy: ". ")
        guard sentences.count > 4 else { return [text] }
        let per = Int(ceil(Double(sentences.count) / 3.0))
        return stride(from: 0, to: sentences.count, by: per).map { start in
            let chunk = sentences[start..<min(start + per, sentences.count)].joined(separator: ". ")
            return chunk.hasSuffix(".") || chunk.hasSuffix("!") ? chunk : chunk + "."
        }
    }
}

/// BARE section rule (founder, Aug 4, round 2: the state lines and the gold
/// slash went the way of the section names — "clean up the other stuff").
/// One hairline is all the punctuation a block boundary gets; the content
/// says everything else. Tint stays so the board's rule can go win-green
/// while games are live.
struct HomeSectionRule: View {
    var tint: Color = GaryColors.gold
    var body: some View {
        Rectangle().fill(tint.opacity(0.25)).frame(height: 1)
            .pageGutter()
            .padding(.top, 6)
    }
}

/// THE MARQUEE — the day's big games, tracked through their whole lifecycle
/// (founder, Jul 5): countdown to the next big one + Gary's pick → the live
/// score + where Gary stands → the result → on to the next. Tap the hero to
/// open the game; the footer unfolds the full ranked list, which stamps
/// CASHED/LOST as the day settles and teases tomorrow's marquee once done.
struct HomeMarqueeTracker: View {
    // Self-contained card: adapts its own FILL for the ground (surface
    // doctrine) — solid over THE FLOOR grid when Home sets `solidPanels`.
    @Environment(\.solidPanels) private var solidPanels
    struct Entry: Identifiable {
        let id: String
        let rank: Int
        let league: String?
        let matchupFull: String
        let title: String
        let context: String?
        let commence: String?
        let pickLine: String?
        let pendingLine: String?
        /// "ARI +160 · LAD −186 · O/U 8.5" — tonight's market off the board.
        var oddsLine: String? = nil
        let live: LiveScore?
        let verdict: HomeLiveVerdict?
        let result: (String, Color)?   // settled stamp, nil until final
        /// Exact daily-slate mirror while the live poll catches up.
        var slateInterruptionLabel: String? = nil
        /// Hero-eligible but not a ribbon chip (Aug 4: every slate game can
        /// hold the countdown; the rail stays big-games-only).
        var railWorthy: Bool = true
        var isLive: Bool { live?.isLive == true }
        var interruptionLabel: String? {
            if live?.isLive == true || live?.isFinal == true { return nil }
            return live?.interruptionLabel ?? slateInterruptionLabel
        }
        var isInterrupted: Bool { interruptionLabel != nil }
        var isFinal: Bool { result != nil }
        /// Begun by the clock, score feed not caught up yet.
        var started: Bool {
            guard !isLive, !isInterrupted, !isFinal,
                  let c = commence, let d = parseISO8601(c) else { return false }
            return d.addingTimeInterval(180) < Date()
        }
    }

    let entries: [Entry]
    /// (matchup, clock, start) — `start` drives the hero's live countdown.
    var tomorrowTease: (matchup: String, time: String, start: Date?)? = nil
    let onOpenGame: (String) -> Void

    /// A ribbon tap pins its game as the hero (founder, Jul 5) — cleared
    /// implicitly once that game settles.
    @State private var promotedId: String? = nil

    /// The hero is ALWAYS the UP NEXT card (founder, Jul 7 — "i loved the up
    /// next card... always there with the next game even while one is live"):
    /// live games hand off to the sheet's LIVE zone + the ribbon, never here.
    private var hero: Entry? {
        if let promotedId,
           let pinned = entries.first(where: { $0.id == promotedId && upNext($0) }) {
            return pinned
        }
        // SOONEST first (founder, Aug 4: "count down to the first game, then
        // the next based on time; tie breaker goes to the biggest game") —
        // supersedes the Jul 7 biggest-first rule from the WC era. The rank
        // only breaks a shared start time.
        return entries.filter(upNext).min {
            ($0.commence ?? "~") != ($1.commence ?? "~")
                ? ($0.commence ?? "~") < ($1.commence ?? "~")
                : $0.rank < $1.rank
        }
    }
    private func upNext(_ e: Entry) -> Bool { !e.isLive && !e.started && !e.isFinal }
    /// The rail: every other big game, docked beside the hero (founder:
    /// no drop-down — the space was already there).
    private var rail: [Entry] {
        entries.filter { $0.id != hero?.id && $0.railWorthy }.sorted { a, b in
            func weight(_ e: Entry) -> Int {
                if e.isLive { return 0 }
                if e.isInterrupted || e.started { return 1 }
                if !e.isFinal { return 2 }
                return 3
            }
            let (wa, wb) = (weight(a), weight(b))
            if wa != wb { return wa < wb }
            return (a.commence ?? "") < (b.commence ?? "")
        }
    }
    private var settledLine: String? {
        let done = entries.filter { $0.isFinal }
        guard !done.isEmpty else { return nil }
        // Matches both stamps — "CASHED" (full era) and "WON" (store-safe bridge).
        let cashed = done.filter { ($0.result?.0).map { $0.contains("CASHED") || $0.contains("WON") } == true }.count
        let lost = done.filter { $0.result?.0.contains("LOST") == true }.count
        return "\(cashed)–\(lost) in the big ones"
    }

    var body: some View {
        // M1 — hero owns the full width; the rest of the day's big ones run
        // as one slim ticker ribbon along the card's bottom (founder-picked
        // over the side rail: shorter card, nothing competing with the hero).
        VStack(spacing: 0) {
            Group {
                if let hero {
                    Button { onOpenGame(hero.matchupFull) } label: { heroView(hero) }
                        .buttonStyle(.plain)
                } else if let tease = tomorrowTease {
                    tomorrowHeroView(tease)
                } else {
                    doneView
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if !rail.isEmpty || tomorrowTease != nil {
                // C1's dark crawl band: the slate runs on its own darker
                // surface under a gold rule, so it reads as the wire and the
                // hero keeps the room.
                Rectangle().fill(GaryColors.gold.opacity(0.3)).frame(height: 1)
                ribbonView
                    .background(GaryColors.insetBand)
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(solidPanels ? GaryColors.panelFillOpaque : GaryColors.panelFill)
        )
        // The ribbon band is a square-cornered surface — clip it to the card
        // shape so it never pokes past the rounded border (Aug 3 polish).
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        // Floating over THE FLOOR (Aug 19): lit near edge + shadow puddle on
        // the grid — same treatment as every solid Home panel. Applied after
        // the clip so the shadow itself never gets cut.
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
            .stroke(LinearGradient(stops: [
                .init(color: GaryColors.warmWhite.opacity(solidPanels ? 0.16 : 0.0), location: 0),
                .init(color: GaryColors.warmWhite.opacity(solidPanels ? 0.06 : 0.0), location: 0.35),
                .init(color: GaryColors.warmWhite.opacity(solidPanels ? 0.025 : 0.0), location: 1),
            ], startPoint: .top, endPoint: .bottom), lineWidth: 1))
        .shadow(color: .black.opacity(solidPanels ? 0.55 : 0.0), radius: 18, y: 10)
        .shadow(color: .black.opacity(solidPanels ? 0.65 : 0.0), radius: 4, y: 2)
        // The old gold 0.3 outline sat over the lit rim and read as a flat
        // gold box (founder, Aug 19: the countdown "doesn't have that same
        // effect" as the headline cards). The rim carries the float now; the
        // LIVE green survives as a state signal, never as chrome.
        .overlay {
            if hero?.isLive == true {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(GaryColors.win.opacity(0.35), lineWidth: 1)
            }
        }
        .pageGutter()
    }

    /// Compact "PIT @ WSH" from the full matchup, via the league abbr maps.
    private func railTitle(_ e: Entry) -> String {
        let sides = e.matchupFull.components(separatedBy: " @ ")
        guard sides.count == 2 else { return e.matchupFull }
        return "\(teamAbbrevFromName(sides[0], league: e.league)) @ \(teamAbbrevFromName(sides[1], league: e.league))"
    }

    /// Sport-correct start word for the countdown row — "FIRST PITCH 7:10 PM".
    private func startWord(_ league: String?) -> String {
        switch (league ?? "").uppercased() {
        case "MLB":                return "FIRST PITCH"
        case "WC", "NFL", "NCAAF": return "KICKOFF"
        case "NBA", "NCAAB":       return "TIP-OFF"
        case "NHL":                return "PUCK DROP"
        default:                   return "STARTS"
        }
    }

    /// The bottom ticker — every non-hero big game as a "PIT @ WSH ▶ 5–3"
    /// chip, hairlines between, tomorrow's marquee dimmed at the end.
    private var ribbonView: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 0) {
                ForEach(rail) { e in
                    Button {
                        // Live/upcoming chips swap INTO the hero slot; a
                        // settled chip has nothing to sweat — it opens its
                        // game sheet directly.
                        if e.isFinal || e.isLive || e.isInterrupted || e.started {
                            onOpenGame(e.matchupFull)
                        } else {
                            withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                                promotedId = e.id
                            }
                        }
                    } label: {
                        HStack(spacing: 6) {
                            Text(railTitle(e))
                                .font(GaryFonts.mono(12, bold: true))
                                .foregroundStyle(.white.opacity(0.9))
                                .lineLimit(1)
                            railStatus(e)
                        }
                        .padding(.horizontal, 12).padding(.vertical, 10)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    if e.id != rail.last?.id || tomorrowTease != nil {
                        Rectangle().fill(Color.white.opacity(0.1))
                            .frame(width: 1, height: 14)
                    }
                }
                if let tease = tomorrowTease {
                    HStack(spacing: 6) {
                        Text(tease.matchup)
                            .font(GaryFonts.mono(12, bold: true))
                            .foregroundStyle(.white.opacity(0.6))
                            .lineLimit(1)
                        Text("TMRW \(tease.time)")
                            .font(GaryFonts.mono(10, bold: true))
                            .foregroundStyle(.white.opacity(0.62))
                    }
                    .padding(.horizontal, 12).padding(.vertical, 10)
                }
            }
            .padding(.horizontal, 2)
        }
        // The viewport edge must read as a FADE, never a mid-word chop
        // (A pass, Jul 26 — the clip law applies to tickers too). The color
        // is the card's COMPOSITE surface (warmWhite 3% over the page), not
        // the raw page tone — a mismatched fade is an invisible fade.
        .overlay(alignment: .trailing) {
            LinearGradient(stops: [.init(color: GaryColors.insetBand.opacity(0), location: 0),
                                   .init(color: GaryColors.insetBand, location: 0.55),
                                   .init(color: GaryColors.insetBand, location: 1)],
                           startPoint: .leading, endPoint: .trailing)
                .frame(width: 64)
                .allowsHitTesting(false)
        }
    }

    @ViewBuilder private func railStatus(_ e: Entry) -> some View {
        if let (text, color) = e.result {
            Text(text)
                .font(GaryFonts.mono(10.5, bold: true))
                .foregroundStyle(color)
        } else if e.isLive, let det = e.live?.detail {
            HStack(spacing: 5) {
                Circle().fill(GaryColors.win).frame(width: 6, height: 6)
                Text(det.uppercased())
                    .font(GaryFonts.mono(10.5, bold: true))
                    .foregroundStyle(GaryColors.win)
            }
        } else if let interruption = e.interruptionLabel {
            Text(interruption)
                .font(GaryFonts.mono(10.5, bold: true))
                .foregroundStyle(GaryColors.gold)
        } else if e.started {
            HStack(spacing: 5) {
                Circle().fill(GaryColors.win).frame(width: 6, height: 6)
                Text("STARTED")
                    .font(GaryFonts.mono(10.5, bold: true))
                    .foregroundStyle(GaryColors.win)
            }
        } else {
            Text(TomorrowView.etTime(e.commence, withZone: false, meridiem: true).uppercased())
                .font(GaryFonts.mono(10.5))
                .foregroundStyle(.white.opacity(0.66))
        }
    }

    // The hero face — C1 (founder-picked Jul 26): the matchup as two Bebas
    // wire lines with the market inline, and the clock ALONE in its own
    // right-hand column — a simple timer to first pitch, nothing else.
    // Falls back to the single-line title when the market line can't split.
    @ViewBuilder private func heroView(_ e: Entry) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            // No header label at all (founder, Jul 27): the "PICK ~x:xx" row is
            // gone — the card opens straight onto the wire and sits shorter
            // until the pick lands.
            let sides = wireSides(e)
            let headed = false
            HStack(spacing: 0) {
                VStack(alignment: .leading, spacing: 2) {
                    if let s = sides {
                        wireLine(name: s.away.name, price: s.away.price, home: false)
                        wireLine(name: s.home.name, price: s.home.price, home: true)
                    } else {
                        Text(e.title)
                            .font(GaryFonts.display(40))
                            .foregroundStyle(GaryColors.warmWhite)
                            .lineLimit(1).minimumScaleFactor(0.7)
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        // NO pick on the hero (founder, Aug 19: "it's just a
                        // countdown") — the card reads identically before and
                        // after the pick lands, so the spacing never shifts.
                        // The pick lives on the board rows and the Picks tab.
                        // The rest of the board — total and run line — rides
                        // as one dim market row whether or not a pick posted.
                        // STORE-SAFE BRIDGE: the market row IS market data — off.
                        let market = AppFlags.storeSafe ? "" : [sides?.total, sides?.runLine].compactMap { $0 }.joined(separator: " · ")
                        if !market.isEmpty {
                            Text(market.uppercased())
                                .font(GaryFonts.mono(10.5, bold: true)).tracking(1)
                                .foregroundStyle(.white.opacity(0.38))
                                .lineLimit(1).minimumScaleFactor(0.8)
                        }
                    }
                    .padding(.top, 7)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.leading, 14).padding(.trailing, 12)

                if let interruption = e.interruptionLabel {
                    Rectangle().fill(Color.white.opacity(0.07)).frame(width: 1)
                        .padding(.vertical, 2)
                    Text(interruption)
                        .font(GaryFonts.mono(11, bold: true)).tracking(0.8)
                        .foregroundStyle(GaryColors.gold)
                        .lineLimit(2)
                        .minimumScaleFactor(0.75)
                        .frame(width: 88)
                        .padding(.horizontal, 8)
                } else if let ct = e.commence, let d = parseISO8601(ct) {
                    Rectangle().fill(Color.white.opacity(0.07)).frame(width: 1)
                        .padding(.vertical, 2)
                    // The timer, and under it the hour it's counting to
                    // (founder, Aug 5) — the clock alone says how long, not
                    // when. Same dim register as the market row, so the gold
                    // digits keep the emphasis. Inset so nothing kisses the
                    // card edge.
                    VStack(spacing: 3) {
                        HomeCountdownText(target: d, size: 17)
                            .lineLimit(1).minimumScaleFactor(0.65)
                        Text(Self.etClock(d).uppercased())
                            .font(GaryFonts.mono(10.5, bold: true)).tracking(1)
                            .foregroundStyle(.white.opacity(0.38))
                            .lineLimit(1).minimumScaleFactor(0.8)
                    }
                    .frame(width: 88)
                    .padding(.horizontal, 8)
                }
            }
            // The wire carries the card's own top air when no header ran.
            .padding(.top, headed ? 0 : 13)
            .padding(.bottom, 14)
        }
        .contentShape(Rectangle())
    }

    /// First pitch in ET — the marquee's own copy (Home's is private to its
    /// own view). Game clocks are ET everywhere in this app, never local.
    private static func etClock(_ d: Date) -> String {
        let f = DateFormatter()
        f.timeZone = TimeZone(identifier: "America/New_York")
        f.dateFormat = "h:mm a"
        return f.string(from: d)
    }

    /// "ROCKIES @ BREWERS" + "COL +270 · MIL -335 · O/U 8 · RL MIL -1.5" →
    /// the two wire sides with their prices, the total, and the run line.
    /// Nil when either half doesn't parse — the caller falls back to the
    /// plain title.
    private func wireSides(_ e: Entry)
        -> (away: (name: String, price: String?), home: (name: String, price: String?),
            total: String?, runLine: String?)? {
        let names = e.title.components(separatedBy: " @ ")
        guard names.count == 2 else { return nil }
        var away: String? = nil, home: String? = nil, total: String? = nil, runLine: String? = nil
        for (i, part) in (e.oddsLine ?? "").components(separatedBy: " · ").enumerated() {
            let p = part.trimmingCharacters(in: .whitespaces)
            if p.uppercased().hasPrefix("O/U") { total = p }
            else if p.uppercased().hasPrefix("RL ") { runLine = p }
            else if i == 0 { away = p.components(separatedBy: " ").last }
            else if i == 1 { home = p.components(separatedBy: " ").last }
        }
        return (away: (names[0], away), home: (names[1], home), total: total, runLine: runLine)
    }

    /// One wire line: the club in Bebas, its price inline. Home side carries
    /// the gold; the away price stays dim so the pair reads as a hierarchy.
    @ViewBuilder private func wireLine(name: String, price: String?, home: Bool) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(name)
                .font(GaryFonts.display(34))
                .foregroundStyle(home ? GaryColors.gold : GaryColors.warmWhite)
                .lineLimit(1).minimumScaleFactor(0.6)
            // STORE-SAFE BRIDGE: club names only on the wire — no prices.
            if let price, !AppFlags.storeSafe {
                Text(price)
                    .font(GaryFonts.display(21))
                    .foregroundStyle(home ? GaryColors.warmWhite.opacity(0.9) : .white.opacity(0.5))
                    .lineLimit(1)
            }
        }
    }

    /// The all-live / all-done state still keeps an UP NEXT on the wall —
    /// tomorrow's marquee steps in as the hero.
    private func tomorrowHeroView(_ tease: (matchup: String, time: String, start: Date?)) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("TOMORROW")
                .font(GaryFonts.mono(11, bold: true)).tracking(1.5)
                .foregroundStyle(GaryColors.gold)
            Text(tease.matchup)
                .font(GaryFonts.display(36))
                .foregroundStyle(GaryColors.warmWhite)
                .lineLimit(1).minimumScaleFactor(0.7)
            // THE CLOCK TICKS (founder, Aug 4: "this should be counting down
            // to the start of the next game"). The static "7:10 PM" told you
            // nothing you couldn't get from the board; the countdown is the
            // reason to look. Start time rides beside it so the clock has a
            // referent. Falls back to the plain time if the board's row
            // carried no parseable commence_time.
            if let start = tease.start, start > Date() {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    HomeCountdownText(target: start, size: 15)
                    Text("· FIRST PITCH \(tease.time.uppercased())")
                        .font(GaryFonts.mono(11.5, bold: true))
                        .foregroundStyle(.white.opacity(0.72))
                }
            } else {
                Text(tease.time.uppercased())
                    .font(GaryFonts.mono(11.5, bold: true))
                    .foregroundStyle(.white.opacity(0.72))
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 13)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // Every big one settled — the day's marquee line.
    private var doneView: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("TODAY'S BIG GAMES · SETTLED")
                .font(GaryFonts.mono(11, bold: true)).tracking(1.5)
                .foregroundStyle(GaryColors.gold)
            if let line = settledLine {
                Text(line)
                    .font(GaryFonts.display(22))
                    .foregroundStyle(GaryColors.warmWhite)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

}

/// "2026-07-06" → "7/6" — the overnight strip's date tag (founder, Jul 7: the
/// words LAST NIGHT were spending the roller's room; the date says it shorter).
func slateDayShort(_ iso: String) -> String {
    let p = iso.split(separator: "-")
    guard p.count == 3, let m = Int(p[1]), let d = Int(p[2]) else { return iso }
    return "\(m)/\(d)"
}

/// THE HEADLINES — the horizontal swipe is back (founder, Aug 3 round 4:
/// "back to how it was ... but enhanced design and info wise"; the vertical
/// container is dead). Enhanced: board-chrome cards, the lead card wider
/// with a bigger headline, snap paging on iOS 17. Feed order, wins AND
/// losses where the night put them. Tap → the ledger.
struct HomeHeadlinesBoard: View {
    let stories: [HomeMarqueeHero.Story]
    let onOpen: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // No rule of its own — headlines lead the page all day, so a rule
            // here just doubled the masthead's hairline with a dead band
            // between (founder screenshot, Aug 6 night: "duplicate lines").
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(Array(stories.prefix(6).enumerated()), id: \.offset) { _, s in
                        HeadlineFlipCard(story: s, onOpen: onOpen)
                    }
                }
                .pageGutter()
                .snapTargets()
            }
            .snapAligned()
            // The house helper, not the raw modifier — it degrades quietly on
            // iOS 16 instead of failing the build (DesignSystem, Jul 22).
            .unclippedRail()
        }
    }
}

/// THE HEADLINE CARD (founder pick, Aug 5 — mock 14 off the twenty-one round,
/// with the flip he specified). FRONT: the ticket where colour is the verdict —
/// the pick, the game, and the money on a flat $100. No stamp, no label, no
/// word for the result: the sign and the colour say it. BACK: what ELSE hit in
/// that game — the stat lines the recap writer already produces, prices carried
/// only where they're real — against what happened.
///
/// The bullets lane is the whole data story here: gameRecap.js asks for
/// "betting events that hit — the markets that would have cashed", with the
/// standing rule that a price rides along ONLY when that exact price is in the
/// evidence. So a prop Gary never took shows its stat line without a price
/// rather than an invented one.
struct HeadlineFlipCard: View {
    let story: HomeMarqueeHero.Story
    let onOpen: () -> Void
    @State private var flipped = false

    private static let W: CGFloat = 296
    private static let H: CGFloat = 138

    private var leagueAccent: Color { Sport.from(league: story.league).accentColor }

    var body: some View {
        ZStack {
            front.opacity(flipped ? 0 : 1)
            back
                .rotation3DEffect(.degrees(180), axis: (x: 0, y: 1, z: 0))
                .opacity(flipped ? 1 : 0)
        }
        .frame(width: Self.W, height: Self.H)
        .garyPanel(radius: 14)
        .rotation3DEffect(.degrees(flipped ? 180 : 0), axis: (x: 0, y: 1, z: 0))
        .contentShape(Rectangle())
        .onTapGesture {
            // Tap turns the card; the long press keeps the old jump to the
            // Billfold, so the flip never steals the existing gesture.
            withAnimation(.spring(response: 0.5, dampingFraction: 0.82)) { flipped.toggle() }
        }
        .onLongPressGesture(minimumDuration: 0.35) { onOpen() }
        // QA can't tap a sim (GaryTour, iOS 2.18): `flip` turns every headline
        // card so a screenshot can prove the back renders. DEBUG-only by the
        // harness's own construction.
        .onGaryTour { verb, _ in
            guard verb == "flip" else { return }
            withAnimation(.spring(response: 0.5, dampingFraction: 0.82)) { flipped.toggle() }
        }
        // A card always opens on the ticket. Home re-pulls recaps on every
        // foreground, and a card left turned over would otherwise come back
        // showing its back for a story the reader hasn't seen the front of.
        .onChange(of: story.headline) { _ in flipped = false }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityHint(flipped ? "Turn back to the ticket" : "Turn for what else hit")
    }

    // MARK: front — mock 14

    private var front: some View {
        // MOCK 05 — the story on the left, the box docked right. The card stops
        // being either a table or a story and becomes both, in columns. The
        // money lives in the box's own spare room under the score (founder,
        // Aug 5), so the result reads in the same column that produced it.
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 0) {
                // The turn glyph rides the kicker row, not the pick row: down
                // there it stole the width "CARDINALS +1.5" needed, and the
                // pick answered by truncating to "CARDINALS…". An ellipsis is
                // never acceptable — the glyph moved instead.
                HStack(spacing: 6) {
                    if !story.league.isEmpty {
                        Text(story.league.uppercased())
                            .font(GaryFonts.kicker(9.9)).tracking(1.6)
                            .foregroundStyle(leagueAccent)
                    }
                    if !story.date.isEmpty {
                        Text(story.league.isEmpty ? story.date : "· \(story.date)")
                            .font(GaryFonts.kicker(9.9)).tracking(1.6)
                            .foregroundStyle(GaryColors.gold)
                    }
                    Spacer(minLength: 4)
                    if !story.bullets.isEmpty {
                        Image(systemName: "arrow.left.arrow.right")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(.white.opacity(0.3))
                    }
                }
                Text(story.headline)
                    // The words are the ONLY thing allowed to give (founder,
                    // Aug 5). Aug 19 round two: the STORY owns the whole left
                    // column now — the bet and the cash moved into the box
                    // column, so the headline runs bigger and deeper.
                    .font(GaryFonts.text(15, .semibold))
                    .foregroundStyle(.white.opacity(0.92))
                    .lineLimit(5).minimumScaleFactor(0.7)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .padding(.top, 7)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Rectangle().fill(Color.white.opacity(0.07)).frame(width: 1)

            VStack(alignment: .leading, spacing: 0) {
                // Two rows, nothing computed on top of them (founder, Aug 5:
                // a margin row is just the two numbers above it subtracted).
                // Real box lines — hits, errors, the winning pitcher — need a
                // pipeline field first: game_results stores only the score.
                if let s = Self.sides(story) {
                    scoreRow(s.away.name, s.away.runs, winner: s.away.runs > s.home.runs)
                    boxRule
                    scoreRow(s.home.name, s.home.runs, winner: s.home.runs > s.away.runs)
                    // HR sits UNDER the score, not beside it (founder, Aug 5) —
                    // its own line, away-home in the same order as the rows
                    // above. Hits came back off the card entirely.
                    if let a = story.awayHR, let h = story.homeHR {
                        boxRule
                        // Same weights, same sizes, same colours as the club
                        // rows above it (founder, Aug 5) — it IS a box line,
                        // so it shouldn't look like a caption stapled under one.
                        HStack(alignment: .firstTextBaseline, spacing: 0) {
                            Text("HOMERS")
                                .font(GaryFonts.mono(11.5, bold: true)).tracking(0.6)
                                .foregroundStyle(.white.opacity(0.55))
                            Spacer(minLength: 4)
                            // The game's total, not a split (founder, Aug 5).
                            Text("\(a + h)")
                                .font(GaryFonts.mono(13.5, bold: true))
                                .foregroundStyle(.white.opacity(0.62))
                        }
                    }
                }
                Spacer(minLength: 4)
                // Aug 20 (founder): the money and the odds came OFF the card —
                // just the pick, sitting on the bottom line where they were.
                // Scale, never truncate — an ellipsis is never acceptable.
                Text(story.receiptPick)
                    .font(GaryFonts.mono(10.5, bold: true)).tracking(0.6)
                    .foregroundStyle(GaryColors.gold)
                    .lineLimit(1).minimumScaleFactor(0.65)
            }
            // Narrower box column (Aug 19, with the smaller box type) — the
            // freed points go to the story column the founder wants leading.
            .frame(width: 112, alignment: .leading)
        }
        .padding(.horizontal, 15).padding(.vertical, 14)
        .frame(width: Self.W, height: Self.H, alignment: .topLeading)
    }

    /// The box's own hairline — every row separated the same way. Tight on
    /// purpose: the extra rows come out of the space the one-line money
    /// figure freed, NOT out of a taller card (founder, Aug 5).
    private var boxRule: some View {
        Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1)
            .padding(.vertical, 2.5)
    }

    /// One box row: club left, runs and (when captured) hits right, the winner
    /// in gold. Hits are the quiet column — they lose games as often as they
    /// win them, so they never take the gold even on the winning line.
    @ViewBuilder private func scoreRow(_ name: String, _ runs: Int, winner: Bool) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 0) {
            // Abbreviated, like a real box — the headline beside it already
            // names both clubs in full.
            // Aug 19 (founder): the box is the SUPPORTING column — one step
            // below the headline beside it, same internal law as before.
            // Round two: a touch back up ("to the right... a little bit
            // bigger maybe too") now that the bet+cash rows joined the box.
            Text(teamAbbrevFromName(name, league: story.league))
                .font(GaryFonts.mono(11.5, bold: true)).tracking(0.6)
                .foregroundStyle(winner ? GaryColors.warmGold : .white.opacity(0.55))
                .lineLimit(1).minimumScaleFactor(0.6)
            Spacer(minLength: 4)
            Text("\(runs)")
                .font(GaryFonts.mono(13.5, bold: true))
                .foregroundStyle(winner ? GaryColors.warmGold : .white.opacity(0.62))
        }
    }

    /// "Angels @ Orioles" + "1-3" → the two box rows. nil when either half is
    /// missing, and the column simply doesn't draw — never a half-built box.
    static func sides(_ s: HomeMarqueeHero.Story)
        -> (away: (name: String, runs: Int), home: (name: String, runs: Int))? {
        let clubs = s.matchup.components(separatedBy: " @ ")
            .map { $0.trimmingCharacters(in: .whitespaces) }
        guard clubs.count == 2, !clubs[0].isEmpty, !clubs[1].isEmpty else { return nil }
        let runs = (s.score ?? "").components(separatedBy: CharacterSet(charactersIn: "-–—"))
            .compactMap { Int($0.trimmingCharacters(in: .whitespaces)) }
        guard runs.count == 2 else { return nil }
        return (away: (clubs[0], runs[0]), home: (clubs[1], runs[1]))
    }

    // (moneyText/footMeta deleted Aug 20 — the founder took the money and the
    // odds off the card front; the pick alone holds the bottom line.)

    // MARK: back — what else hit

    private var back: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(story.bullets.isEmpty ? "THE STORY" : "WHAT ELSE HIT")
                .font(GaryFonts.kicker(8.5)).tracking(1.6)
                .foregroundStyle(GaryColors.gold)
                .padding(.bottom, 7)
            // Two or three bullets leave slack on a card sized for the front's
            // four-line headline; the group sits centred rather than stranded
            // at the top with a hole under it.
            Spacer(minLength: 0)

            ForEach(Array(story.bullets.prefix(3).enumerated()), id: \.offset) { i, b in
                if i > 0 {
                    Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1)
                        .padding(.vertical, 3.5)
                }
                bulletLine(b)
            }

            Spacer(minLength: 0)
            // Bullets ONLY (founder, Aug 5). The headline moved to the front's
            // left column and the verdict rides the money there, so repeating
            // either here would just be the same card twice.
        }
        .padding(.horizontal, 15).padding(.vertical, 12)
        .frame(width: Self.W, height: Self.H, alignment: .topLeading)
    }

    /// One stat line, no bullet glyph (founder, Aug 5). A trailing parenthetical
    /// is where the recap writer puts a real price — it takes the gold so the
    /// payout reads apart from the stat without parsing the sentence.
    @ViewBuilder private func bulletLine(_ raw: String) -> some View {
        let parts = Self.splitPrice(raw)
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(parts.stat)
                .font(GaryFonts.text(11.5, .semibold))
                .foregroundStyle(.white.opacity(0.82))
                // Scales hard rather than clipping — no ellipsis, ever.
                .lineLimit(1).minimumScaleFactor(0.5)
            Spacer(minLength: 4)
            if let price = parts.price {
                Text(price)
                    // A two-market bullet carries two prices ("+300 · +150"),
                    // so the gold column can now run long. It scales like the
                    // stat beside it rather than truncating — no ellipsis, ever.
                    .font(GaryFonts.mono(10.5, bold: true))
                    .foregroundStyle(GaryColors.warmGold)
                    .lineLimit(1).minimumScaleFactor(0.6)
            }
        }
    }

    /// "Pete Alonso 2 RBI (+110 TB lost)" → stat + "+110 TB lost". Pulls EVERY
    /// parenthetical that really holds an American price out of the line,
    /// wherever it sits, and hands them to the gold column.
    ///
    /// Placement-agnostic on purpose (founder, Aug 6): the writer's contract
    /// says one TRAILING parenthetical, but on a two-market bullet where only
    /// one market is priced it attaches the price inline — "JJ Bleday 1 HR
    /// (+336), 1 RBI" — and a trailing-only parser left that +336 stranded in
    /// the stat text while the row above it wore its price in gold. Parsing
    /// beats another prompt law here: the price lands in the same column no
    /// matter where the model puts it.
    static func splitPrice(_ raw: String) -> (stat: String, price: String?) {
        // A parenthetical qualifies only if it contains a signed 2+ digit
        // number, so "(6.2 IP)" or "(2 for 5)" stay part of the stat.
        let pattern = #"\(([^()]*[-+−]\d{2,}[^()]*)\)"#
        guard let re = try? NSRegularExpression(pattern: pattern) else { return (raw, nil) }
        let ns = raw as NSString
        let full = NSRange(location: 0, length: ns.length)
        let matches = re.matches(in: raw, range: full)
        guard !matches.isEmpty else { return (raw, nil) }

        var prices: [String] = []
        for m in matches {
            let inner = ns.substring(with: m.range(at: 1))
            // A price that DIDN'T cash has no business in gold under a header
            // that says "what else hit" — the recap writer sometimes annotates
            // Gary's own losing prop there ("Pete Alonso 2 RBI (+110 TB
            // lost)"). The stat is true and stays; the payout comes off.
            if inner.range(of: #"\b(lost|loses|losing|missed|miss|no cash)\b"#,
                           options: [.regularExpression, .caseInsensitive]) != nil { continue }
            prices.append(inner.trimmingCharacters(in: .whitespaces))
        }

        // Strip the priced parentheticals, then close the seams the removal
        // leaves ("1 HR , 1 RBI", a dangling trailing comma).
        var stat = re.stringByReplacingMatches(in: raw, range: full, withTemplate: "")
        stat = stat.replacingOccurrences(of: #"\s{2,}"#, with: " ", options: .regularExpression)
        stat = stat.replacingOccurrences(of: #"\s+([,;])"#, with: "$1", options: .regularExpression)
        stat = stat.trimmingCharacters(in: CharacterSet(charactersIn: " ,;"))

        return (stat, prices.isEmpty ? nil : prices.joined(separator: " · "))
    }
}

extension View {
    /// Snap-paging pair for horizontal rails (iOS 17; quiet no-op on 16).
    @ViewBuilder func snapTargets() -> some View {
        if #available(iOS 17.0, *) { self.scrollTargetLayout() } else { self }
    }
    @ViewBuilder func snapAligned() -> some View {
        if #available(iOS 17.0, *) { self.scrollTargetBehavior(.viewAligned) } else { self }
    }
}

/// One row of THE SHEET — matchup (or live score), Gary's call in gold, the
/// rolling status on the right. The whole row taps through to the game.
struct HomeSheetRowView: View {
    let row: HomeView.HomeSheetRow
    var body: some View {
        HStack(alignment: .center, spacing: 8) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 7) {
                    // Team names in the HERO face (founder, Aug 3: the italic
                    // accent read wrong here) — Bebas caps, the same voice the
                    // marquee's PIRATES/BREWERS speak, upright and confident.
                    Text(row.title)
                        .font(GaryFonts.display(19))
                        .tracking(0.5)
                        .foregroundStyle(GaryColors.warmWhite.opacity(0.94))
                        .lineLimit(1).minimumScaleFactor(0.75)
                    // The clock belongs to the SCORE (founder, Aug 5): "LAA 2 ·
                    // BAL 3   ▶ INN 8". Gold while live, neutral once final —
                    // the same weight the verdict slot used to carry it at.
                    if let clock = row.clockText {
                        Text(clock)
                            .font(.system(size: 13, weight: .semibold).monospacedDigit())
                            .foregroundStyle(
                                row.zone == .live || row.zone == .interrupted
                                    ? GaryColors.gold : Color.white.opacity(0.55)
                            )
                            .lineLimit(1).fixedSize()
                    }
                    if row.bigOne {
                        Text("THE BIG ONE")
                            .font(.system(size: 12, weight: .bold).monospacedDigit()).tracking(0.8)
                            .foregroundStyle(GaryColors.gold)
                    }
                }
                if let call = row.callLine {
                    VStack(alignment: .leading, spacing: 2) {
                        ForEach(call.components(separatedBy: "  ·  "), id: \.self) { line in
                            Text(line)
                                .font(.system(size: 13.5, weight: .semibold).monospacedDigit())
                                .foregroundStyle(GaryColors.gold.opacity(0.95))
                                .lineLimit(1).minimumScaleFactor(0.75)
                        }
                    }
                } else if let pending = row.pendingLine {
                    // The market line wears GOLD (founder, Aug 4: the board had
                    // "nothing pulling any attention" pre-pick). One step dimmer
                    // + lighter than Gary's call, so the slot speaks gold all
                    // day and the posted call still visibly outranks the market.
                    Text(pending)
                        .font(.system(size: 13, weight: .medium).monospacedDigit())
                        .foregroundStyle(GaryColors.gold.opacity(0.8))
                }
            }
            Spacer(minLength: 8)
            // The status CENTERS on the row (founder, Aug 3): with the hits
            // ledger gone it's a single element against a two-line stack, so
            // top-hugging left a dead corner under it. Centered, it sits
            // between the score and the gold call and binds them — and every
            // row wears the same geometry, live or scheduled.
            // (hitLines data still rides the rows for a future home that
            // doesn't warp the queue.)
            // Empty on a live row Gary has no call on (or hasn't been decided
            // yet) — the slot says how HIS call stands, so it says nothing when
            // there's nothing to stand on, rather than echoing the clock.
            if !row.statusText.isEmpty {
                Text(row.statusText)
                    .font(.system(size: 13.5, weight: .semibold).monospacedDigit())
                    .foregroundStyle(row.statusColor)
                    .lineLimit(1).fixedSize()
            }
            Image(systemName: "chevron.right")
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.white.opacity(0.62))
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .contentShape(Rectangle())
    }
}

/// THE WINNERS STUB — the premium card as a sealed slip object (the ticket
/// idea, living where slips belong). One tap → Winners.
struct HomeWinnersStub: View {
    let onOpen: () -> Void
    /// Real information that earns the tap (founder, Jul 12): how many plays
    /// are sealed, which sports, and when the next one seals. All optional —
    /// the strip degrades to the plain door when Home has nothing yet.
    var plays: Int = 0
    var leagues: String? = nil
    var nextSeal: String? = nil

    private var valueLine: String? {
        if plays > 0 {
            let count = "\(plays) play\(plays == 1 ? "" : "s") sealed"
            return leagues.map { "\(count) · \($0)" } ?? count
        }
        if let nextSeal { return "First play seals ~\(nextSeal)" }
        return nil
    }

    private var weekday: String {
        let f = DateFormatter()
        f.timeZone = TimeZone(identifier: "America/New_York")
        f.dateFormat = "EEEE"
        return f.string(from: Date())
    }

    var body: some View {
        Button(action: onOpen) {
            VStack(spacing: 0) {
                HStack(spacing: 8) {
                    Text("WINNERS")
                        .font(GaryFonts.accent(12)).tracking(0.8)
                        .foregroundStyle(GaryColors.gold)
                    Spacer()
                    Text("SEALED")
                        .font(GaryFonts.accent(10)).tracking(1.2)
                        .foregroundStyle(GaryColors.gold.opacity(0.85))
                }
                .padding(.horizontal, 14).padding(.vertical, 10)
                Rectangle()
                    .fill(Color.clear)
                    .frame(height: 1)
                    .overlay(DashedLine().stroke(GaryColors.gold.opacity(0.35), style: StrokeStyle(lineWidth: 1, dash: [5, 4])))
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("The \(weekday) Card")
                            .font(GaryFonts.display(25))
                            .foregroundStyle(GaryColors.warmWhite)
                        Text(valueLine ?? "Gary's best of the board · games + props")
                            .font(GaryFonts.text(12, .semibold))
                            .foregroundStyle(GaryColors.sectionSub)
                        if valueLine != nil {
                            Text("Gary's best of the board · games + props")
                                .font(GaryFonts.text(11))
                                .foregroundStyle(GaryColors.meta)
                        }
                    }
                    Spacer()
                    HStack(spacing: 5) {
                        Text("UNLOCK")
                            .font(GaryFonts.accent(12)).tracking(0.8)
                        Image(systemName: "chevron.right")
                            .font(.system(size: 11, weight: .black))
                    }
                    .foregroundStyle(GaryColors.gold)
                }
                .padding(.horizontal, 14).padding(.vertical, 11)
            }
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(Color(hex: "#100F0D"))
                    .overlay(SealSheen().clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous)))
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(GaryColors.gold.opacity(0.55), lineWidth: 1))
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .pageGutter()
    }
}

/// Status-bar scrim — every scrolling page fades its content under the clock
/// (Aug 3: bare rows collided with "9:41"). One component, one identity.
struct StatusBarScrim: View {
    var body: some View {
        VStack(spacing: 0) {
            LinearGradient(colors: [Color(hex: "#08080A").opacity(0.94),
                                    Color(hex: "#08080A").opacity(0)],
                           startPoint: .top, endPoint: .bottom)
                .frame(height: 64)
            Spacer(minLength: 0)
        }
        .ignoresSafeArea(edges: .top)
        .allowsHitTesting(false)
    }
}

// MARK: - League Words (founder pick, Aug 4 — mock 64 "Big Words", verbatim)
//
// The league switcher: the page dims to near-black and the leagues stack HUGE
// in the display face — the words are the interface. No panel, no chrome, no
// push; "it was perfect the way you had it." Replaces the underline league
// tabs the Hub and Picks mastheads used to wear. Presented app-wide (over the
// dock too) from ContentView; pages call `present` with their own options.

final class LeagueOverlayState: ObservableObject {
    static let shared = LeagueOverlayState()
    struct Option: Identifiable {
        let id = UUID()
        /// The big word ("MLB", "MLB HR", "NFL").
        let code: String
        /// Superscript beside it — real info only ("13 GAMES", "SEP 9"), nil = bare word.
        let sup: String?
        /// Green superscript (live games on the board right now).
        let live: Bool
        let selected: Bool
        /// False for an off-season league with no board yet — tapping it
        /// dismisses the overlay but never hands a league with no data to
        /// the page (mock 64's dimmed words with return dates, founder,
        /// Aug 4: "we should still have the other sports and their start
        /// date just like the mock showed").
        var selectable: Bool = true
    }
    @Published var options: [Option] = []
    @Published var isOpen = false
    private(set) var onPick: (String) -> Void = { _ in }

    func present(_ opts: [Option], onPick: @escaping (String) -> Void) {
        options = opts
        self.onPick = onPick
        withAnimation(.easeOut(duration: 0.18)) { isOpen = true }
    }
    func dismiss() {
        withAnimation(.easeIn(duration: 0.15)) { isOpen = false }
    }

    /// Off-season leagues with their return date, appended after every
    /// selectable league so the overlay always shows the whole calendar
    /// (mock 64) — never just the leagues currently live. `already` is the
    /// set of codes the caller already built real options for (skip those).
    /// PLACEHOLDER DATES (founder-approved off the mock, not yet backed by a
    /// schedule field) — swap for a real `season_windows` lookup if/when one
    /// exists; until then these are display copy only, never used for gating.
    static func offSeasonOptions(excluding already: Set<String>) -> [Option] {
        let calendar: [(code: String, date: String)] = [
            ("NFL", "SEP 9"), ("NCAAF", "AUG 30"), ("NBA", "OCT 21"), ("NHL", "OCT 7"),
        ]
        return calendar
            .filter { !already.contains($0.code) }
            .map { .init(code: $0.code, sup: $0.date, live: false, selected: false, selectable: false) }
    }
}

struct LeagueWordsOverlay: View {
    @ObservedObject private var state = LeagueOverlayState.shared

    var body: some View {
        if state.isOpen {
            ZStack(alignment: .leading) {
                // Mock 64's ground: rgba(8,7,6,.91) — the page ghosts through.
                Color(hex: "#080706").opacity(0.91)
                    .ignoresSafeArea()
                    .onTapGesture { state.dismiss() }

                VStack(alignment: .leading, spacing: 11) {
                    ForEach(state.options) { o in
                        Button {
                            // Off-season leagues (selectable == false) just
                            // close the overlay — there's no board to hand
                            // them to yet.
                            if o.selectable { state.onPick(o.code) }
                            state.dismiss()
                        } label: {
                            HStack(alignment: .top, spacing: 8) {
                                Text(o.code)
                                    .font(GaryFonts.display(48))
                                    .foregroundStyle(o.selected ? GaryColors.gold
                                                                : GaryColors.warmWhite.opacity(0.28))
                                    .lineLimit(1).minimumScaleFactor(0.6)
                                if let sup = o.sup, !sup.isEmpty {
                                    Text(sup.uppercased())
                                        .font(GaryFonts.mono(9.5, bold: true)).tracking(0.5)
                                        .foregroundStyle(o.live ? GaryColors.win : .white.opacity(0.35))
                                        .padding(.top, 7)
                                }
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(o.selectable ? "\(o.code) league" : "\(o.code) — not yet in season, \(o.sup ?? "")")
                        .accessibilityAddTraits(o.selected ? [.isSelected, .isButton] : .isButton)
                    }
                }
                .padding(.horizontal, 34)
            }
            .transition(.opacity)
            .zIndex(50)
        }
    }
}

/// The masthead trigger that opens the words — the current league in the
/// display face with a small gold chevron. This row replaces the underline
/// league tab strips on the Hub and Picks pages.
struct LeagueWordsTrigger: View {
    let current: String
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Text(current)
                    .font(GaryFonts.display(19))
                    .foregroundStyle(GaryColors.gold)
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: false)
                Image(systemName: "chevron.down")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(GaryColors.gold.opacity(0.8))
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .layoutPriority(2)
        .accessibilityLabel("Switch league — \(current) selected")
    }
}

/// The SEALED motif — one diagonal hairline with a faint brighter wash to its
/// right, shared by every "sealed" surface (the Winners wrapper card wears the
/// same geometry) so the app speaks ONE seal language.
struct SealSheen: View {
    var tint: Color = GaryColors.gold
    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width, h = geo.size.height
            ZStack {
                Path { p in
                    p.move(to: CGPoint(x: w * 0.68, y: 0))
                    p.addLine(to: CGPoint(x: w * 0.56, y: h))
                }
                .stroke(tint.opacity(0.3), lineWidth: 1)
                Path { p in
                    p.move(to: CGPoint(x: w * 0.68, y: 0))
                    p.addLine(to: CGPoint(x: w * 0.56, y: h))
                    p.addLine(to: CGPoint(x: w, y: h))
                    p.addLine(to: CGPoint(x: w, y: 0))
                }
                .fill(Color.white.opacity(0.025))
            }
        }
        .allowsHitTesting(false)
    }
}

/// Straight dashed line (the slip perforation).
struct DashedLine: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.minX, y: rect.midY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        return p
    }
}

/// 1Hz live countdown to the next first pitch/kickoff — a chip, not a hero.
struct HomeCountdownText: View {
    let target: Date
    /// Base size — the hero's clock column runs it smaller than the old
    /// full-width clock did.
    var size: CGFloat = 24

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { ctx in
            let s = max(0, Int(target.timeIntervalSince(ctx.date)))
            // Gold and tabular (A pass, Jul 26): the clock is the card's
            // pulse — and never jitters. No leading zero on the lead unit
            // (founder, Jul 27) — it reads like a clock, not a stopwatch:
            // "9:55:16", and "55:16" once the hour is gone.
            let h = s / 3600, m = (s % 3600) / 60
            Text(s == 0 ? "ANY MINUTE"
                        : (h > 0 ? String(format: "%d:%02d:%02d", h, m, s % 60)
                                 : String(format: "%d:%02d", m, s % 60)))
                .font(GaryFonts.mono(size, bold: true))
                .foregroundStyle(GaryColors.gold)
        }
    }
}

/// ③ The Marquee — last night's story as a static hero (no footage, no
/// logos: facts are free). League chip up top, the game headline, and the
/// receipt bar: "Gary had it · Phillies TT over 4.5 — CASHED +145".
// Day-keyed on-disk cache of the derived headline cards, so the Home marquee paints instantly
// on cold open and then refreshes. Keyed on the graded night (rolls 6am ET) so it can never
// surface yesterday's card today; never stores [] so a transient failure can't poison it.
struct HomeHeadlinesCacheEntry: Codable {
    let payloadDayKey: String
    let stories: [HomeMarqueeHero.Story]
}
enum HomeHeadlinesCache {
    // v2 drops the pre-editorial schema whose cached cards could still contain
    // old betting-result copy after the database headline had been repaired.
    private static let key = "homeHeadlines.editorial.v2"
    static func load() -> [HomeMarqueeHero.Story]? {
        guard let data = UserDefaults.standard.data(forKey: key),
              let entry = try? JSONDecoder().decode(HomeHeadlinesCacheEntry.self, from: data),
              entry.payloadDayKey == SupabaseAPI.hubGradedDateEST(),
              !entry.stories.isEmpty
        else { return nil }
        return entry.stories
    }
    static func save(_ stories: [HomeMarqueeHero.Story]) {
        guard !stories.isEmpty else { return }
        let entry = HomeHeadlinesCacheEntry(payloadDayKey: SupabaseAPI.hubGradedDateEST(), stories: stories)
        if let data = try? JSONEncoder().encode(entry) { UserDefaults.standard.set(data, forKey: key) }
    }
}

struct HomeMarqueeHero: View {
    struct Story: Codable {
        let league: String
        var headline: String
        let sub: String
        let receiptLead: String   // "Gary had it" / "Gary was on" — prose voice
        let receiptPick: String   // "ANGELS ML" — data voice, rendered mono
        let verdict: String
        let cashed: Bool
        // The flip side — what Gary CALLED before the game played. Enriched
        // from that night's daily picks after the story is built; nil = the
        // card doesn't flip (no matching pick found).
        var take: String? = nil
        var tier: String? = nil
        /// The betting recap body (game_recaps) — the ESPN-style story of
        /// how the bet lived and died, under the headline.
        var recap: String? = nil
        /// Graded claims from the rationale (right/wrong only — "unclear"
        /// stays off the card). Empty = no fact check yet.
        var claims: [FactClaim] = []
        /// The night's stat lines, real prop prices attached (game_recaps
        /// bullets). Rendered mono under the recap.
        var bullets: [String] = []
        /// "Angels @ Orioles" — the game, for the card's own line.
        var matchup: String = ""
        /// The price Gary took, split off pick_text ("−150").
        var odds: String = ""
        /// "3-1" once the game settles; nil until then. Away runs first.
        var score: String? = nil
        /// "AUG 4" — the slate day, for the card's kicker.
        var date: String = ""
        /// Hits and home runs per side when the recap captured them.
        var awayHits: Int? = nil
        var homeHits: Int? = nil
        var awayHR: Int? = nil
        var homeHR: Int? = nil
        /// Profit on a flat $100 at `odds` — positive when the ticket cashed,
        /// −100 when it didn't, 0 on a push. nil when the price won't parse.
        var netOnFlat: Double? {
            let raw = odds.replacingOccurrences(of: "−", with: "-")
                .trimmingCharacters(in: CharacterSet(charactersIn: "+ "))
            guard let n = Double(raw), n != 0 else { return nil }
            if verdict == "PUSH" { return 0 }
            guard cashed else { return -100 }
            return n > 0 ? n : 10000 / abs(n)
        }
    }
    let story: Story
    /// Carousel cards disable the flip (fixed-height pages); tap falls
    /// through to onTap instead.
    var flipEnabled: Bool = true
    /// Carousel pages fill a fixed frame so the receipt pins to the same
    /// bottom edge on every slide — the section below never jumps.
    var fillsHeight: Bool = false
    /// The card's horizontal screen margin — 16 full-width, 0 in the 70/30
    /// side-by-side where the row provides the margin and the Wire sits beside it.
    var edgePad: CGFloat = 16
    let onTap: () -> Void
    /// Carousel expand: when a toggle is provided, the card shows a MORE/LESS
    /// affordance and tapping it expands the full recap inline — the carousel
    /// grows the card and pauses auto-advance — instead of flipping/navigating.
    var isExpanded: Bool = false
    var onToggleExpand: (() -> Void)? = nil

    @State private var flipped = false
    @State private var frontH: CGFloat = 0

    private var tint: Color { Sport.from(league: story.league).accentColor }
    /// The league reads in its own accent — MLB in its white-green-brown field
    /// gradient (user call, Jun 17); every other league in its flat accent color.
    private var leagueStyle: AnyShapeStyle {
        (story.league == "MLB" || story.league == "MLB HR")
            ? AnyShapeStyle(GaryColors.mlbFieldText)
            : AnyShapeStyle(tint)
    }
    private var canFlip: Bool { flipEnabled && story.take != nil }
    private var verdictColor: Color { story.cashed ? GaryColors.win : GaryColors.lostTint }

    var body: some View {
        ZStack {
            front
                // In the carousel (fillsHeight) DON'T fix the vertical size — let the
                // card fill the uniform page height so every slide matches (a fixedSize
                // here shrank each card to its content, making the short-headline lead
                // card smaller than the rest). Single-card use still sizes to content.
                .fixedSize(horizontal: false, vertical: !fillsHeight)
                .background(GeometryReader { g in
                    Color.clear.preference(key: PickCardHeightKey.self, value: g.size.height)
                })
                .opacity(flipped ? 0 : 1)

            if canFlip {
                back
                    .opacity(flipped ? 1 : 0)
                    .rotation3DEffect(.degrees(180), axis: (x: 0, y: 1, z: 0))
            }
        }
        // fillsHeight (carousel): fill the parent's fixed frame so every slide is the
        // same height and the receipt pins to one bottom edge — no per-card measuring.
        .frame(height: flipped ? max(frontH + 150 + CGFloat(min(story.claims.count, 4)) * 38, 320) : (fillsHeight ? nil : (frontH > 0 ? frontH : nil)))
        .rotation3DEffect(.degrees(flipped ? 180 : 0), axis: (x: 0, y: 1, z: 0), perspective: 0.55)
        .onPreferenceChange(PickCardHeightKey.self) { frontH = $0 }
        .padding(.horizontal, edgePad)
        .contentShape(Rectangle())
        .onTapGesture {
            if let toggle = onToggleExpand {
                toggle()                              // grow/collapse the recap inline
            } else if canFlip {
                withAnimation(.spring(response: 0.6, dampingFraction: 0.82)) { flipped.toggle() }
            } else {
                onTap()
            }
        }
    }

    // MARK: Front — the news + the receipt stub

    private var front: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                // The headline LEADS — full width, tight, at the very top (user call,
                // Jun 17). Nothing crowds it; the brand cues sit in the byline below.
                // The headline LEADS, with room on the right for the league chip
                // that now lives in the top-right corner (user call, Jun 18).
                Text(story.headline)
                    .font(GaryFonts.display(26))
                    .foregroundStyle(.white.opacity(0.96))
                    .lineLimit(2).minimumScaleFactor(0.8)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.trailing, 40)
                    .padding(.bottom, 9)
                // Headline → BULLETS lead the card (founder). The prose recap is
                // hidden until MORE — most of the value is the headline + the stat
                // lines; the write-up is optional depth.
                if !story.bullets.isEmpty {
                    bulletList.padding(.top, 10)
                }
                if isExpanded, let recap = story.recap, !recap.isEmpty {
                    Text(recap)
                        .font(GaryFonts.text(13))
                        .foregroundStyle(.white.opacity(0.82))
                        .lineSpacing(2.5)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .topLeading)
                        .padding(.top, 12)
                }
                if onToggleExpand != nil, story.recap?.isEmpty == false {
                    HStack(spacing: 4) {
                        Text(isExpanded ? "LESS" : "MORE")
                            .font(GaryFonts.mono(8.5, bold: true)).tracking(1)
                        Image(systemName: "chevron.down")
                            .font(.system(size: 7, weight: .bold))
                            .rotationEffect(.degrees(isExpanded ? 180 : 0))
                    }
                    .foregroundStyle(GaryColors.gold.opacity(0.65))
                    .padding(.top, 8)
                }
            }
            // Center the (now shorter, prose-less) content in the card body so the
            // slack is balanced — not dumped as a void between the bullets and the
            // receipt (founder: removing the prose left the layout invalid).
            .frame(maxWidth: .infinity, maxHeight: fillsHeight ? .infinity : nil, alignment: .leading)
            .padding(14)
            // The bear is an overlaid corner stamp now — it no longer takes a layout
            // row that crowds the story (user call, Jun 18). The text may run beneath
            // it; that's intended (no fight for space, no awkward gap).
            .overlay(alignment: .bottomTrailing) {
                Image(GaryBrand.mark)
                    .resizable().scaledToFit()
                    .frame(width: 38, height: 38)
                    .padding(.trailing, 10)
                    .padding(.bottom, 8)
                    .allowsHitTesting(false)
            }
            // The sport accent (WC / MLB) sits in the top-right corner — its own
            // league color, mirroring the bear stamp in the opposite corner.
            .overlay(alignment: .topTrailing) {
                HStack(spacing: 5) {
                    Circle().fill(tint.opacity(0.9)).frame(width: 5, height: 5)
                    Text(story.league)
                        .font(GaryFonts.mono(11, bold: true)).tracking(1.2)
                        .foregroundStyle(leagueStyle)
                }
                .padding(.trailing, 14)
                .padding(.top, 16)
            }
            if !story.receiptPick.isEmpty || !story.verdict.isEmpty {
                receiptStub(lead: story.receiptLead, pick: story.receiptPick,
                            trailing: story.verdict, hint: nil)
            }
        }
        .frame(maxHeight: fillsHeight ? .infinity : nil, alignment: .top)
        // Clean, sharp, simple black — no glow, no watermark (user call, Jun 17).
        // Branding lives in the gold GARY'S CALL eyebrow + the small corner bear mark.
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color(hex: "#181616")))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color.white.opacity(0.08), lineWidth: 1))
    }

    /// The night's stat lines — gold tick + mono, the data voice. Bigger + more
    /// readable (founder); the stat line is the point of the card.
    private var bulletList: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(Array(story.bullets.prefix(3)), id: \.self) { (b: String) in
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Rectangle()
                        .fill(GaryColors.gold.opacity(0.85))
                        .frame(width: 11, height: 2)
                    Text(b)
                        .font(GaryFonts.mono(15))
                        .foregroundStyle(.white.opacity(0.96))
                        .lineLimit(1)
                        .minimumScaleFactor(0.78)
                }
            }
        }
    }

    // MARK: Back — what Gary called vs what the game did

    private var back: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text("THE CALL")
                        .font(GaryFonts.mono(10, bold: true)).tracking(1)
                        .foregroundStyle(GaryColors.gold)
                    Spacer()
                    Text("BEFORE THE GAME")
                        .font(GaryFonts.mono(9, bold: true)).tracking(1)
                        .foregroundStyle(.white.opacity(0.62))
                }
                .padding(.bottom, 14)

                // Gary's voice — gold rule (the app-wide quote marker).
                if let take = story.take {
                    HStack(alignment: .top, spacing: 10) {
                        RoundedRectangle(cornerRadius: 1)
                            .fill(GaryColors.gold.opacity(0.7))
                            .frame(width: 2)
                        Text(take)
                            .font(GaryFonts.text(13.5))
                            .foregroundStyle(.white.opacity(0.85))
                            .lineSpacing(3)
                            .lineLimit(8)
                            .minimumScaleFactor(0.85)
                    }
                }

                // The fact check — the rationale's claims, graded by the game.
                if !story.claims.isEmpty {
                    VStack(alignment: .leading, spacing: 7) {
                        Text("THE FACT CHECK")
                            .font(GaryFonts.mono(8.5, bold: true)).tracking(1.2)
                            .foregroundStyle(.white.opacity(0.62))
                        ForEach(Array(story.claims.prefix(4).enumerated()), id: \.offset) { _, c in
                            HStack(alignment: .top, spacing: 8) {
                                Text(c.verdict == "right" ? "✓" : "✗")
                                    .font(GaryFonts.mono(11, bold: true))
                                    .foregroundStyle(c.verdict == "right" ? GaryColors.win : GaryColors.loss)
                                Text(c.claim ?? "")
                                    .font(.system(size: 12))
                                    .foregroundStyle(.white.opacity(0.7))
                                    .lineLimit(2)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                    .padding(.top, 12)
                }

                HStack(spacing: 14) {
                    if let tier = story.tier {
                        HStack(spacing: 6) {
                            Text("CONVICTION")
                                .font(GaryFonts.mono(8.5, bold: true)).tracking(1.2)
                                .foregroundStyle(.white.opacity(0.62))
                            Text(tier)
                                .font(GaryFonts.mono(11, bold: true))
                                .foregroundStyle(.white.opacity(0.85))
                        }
                    }
                    Spacer()
                    Button(action: onTap) {
                        Text("FULL CARD ›")
                            .font(GaryFonts.mono(9.5, bold: true)).tracking(1)
                            .foregroundStyle(.white.opacity(0.62))
                    }
                    .buttonStyle(.plain)
                }
                .padding(.top, 12)

                Spacer(minLength: 8)

                Text("tap to flip back  ↺")
                    .font(GaryFonts.mono(9, bold: false))
                    .foregroundStyle(.white.opacity(0.62))
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.bottom, 8)
            }
            .padding(14)

            receiptStub(lead: "How it played ·", pick: story.sub.uppercased(),
                        trailing: story.verdict, hint: nil)
        }
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color(hex: "#181616")))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color.white.opacity(0.08), lineWidth: 1))
    }

    // MARK: Shared pieces

    /// The ticket stub: dashed stitch perforation + full-bleed darker band.
    /// Prose lead, mono data, and the verdict as the row's ONLY color moment.
    private func receiptStub(lead: String, pick: String, trailing: String, hint: String?) -> some View {
        VStack(spacing: 0) {
            StitchLine()
                .stroke(Color.white.opacity(0.14), style: StrokeStyle(lineWidth: 1, dash: [4, 5]))
                .frame(height: 1)
            HStack(spacing: 6) {
                Text(lead)
                    .font(.system(size: 14))
                    .foregroundStyle(.white.opacity(0.85))
                Text(pick)
                    .font(GaryFonts.mono(13, bold: true))
                    .foregroundStyle(GaryColors.gold)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Spacer(minLength: 8)
                if let hint {
                    Text(hint)
                        .font(GaryFonts.mono(10, bold: true)).tracking(0.8)
                        .foregroundStyle(.white.opacity(0.62))
                }
                Text(trailing)
                    .font(GaryFonts.mono(12.5, bold: true)).tracking(0.6)
                    .foregroundStyle(verdictColor)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(Color.black.opacity(0.32))
        }
    }

}

/// ③b Biggest cashes — last night's winners in units, with the honest net
/// in the header (losses are in the number; that's why the wins are real).
struct HomeCashesSection: View {
    struct Row: Identifiable {
        let id: String
        let title: String
        let sub: String
        let units: Double        // sort key (flat stakes)
        let odds: String         // display — bettors speak odds, not units
        var league: String? = nil  // sport-variety key for Hits & heartbreakers
    }
    let rows: [Row]
    let graded: Int
    let onOpenBillfold: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HubSectionHeader(eyebrow: "Biggest cashes", sub: "")
            VStack(spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { i, row in
                    Button(action: onOpenBillfold) {
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(row.title)
                                    .font(.system(size: 14.5, weight: .semibold))
                                    .foregroundStyle(.white.opacity(0.92))
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.8)
                                Text(row.sub)
                                    .font(.system(size: 11))
                                    .foregroundStyle(.white.opacity(0.62))
                                    .lineLimit(1)
                            }
                            Spacer(minLength: 8)
                            Text(row.odds)
                                .font(GaryFonts.mono(15, bold: true))
                                .foregroundStyle(GaryColors.win)
                        }
                        .padding(.vertical, 10)
                        .padding(.horizontal, 14)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    Rectangle().fill(Color.white.opacity(0.05)).frame(height: 1).padding(.leading, 14)
                }
                Button(action: onOpenBillfold) {
                    HStack(spacing: 4) {
                        Text("See all \(graded) graded")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(GaryColors.heroAccent.opacity(0.85))
                        Image(systemName: "arrow.right")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundStyle(GaryColors.heroAccent.opacity(0.6))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            .quantPanel()
            .pageGutter()
        }
    }
}

/// ④ The Receipts — yesterday's boards, graded. Each lane's record routes to
/// today's version of itself on the Hub: results are the hook, the Hub is
/// the destination.
struct HomeReceiptsSection: View {
    struct LaneRecord: Identifiable {
        let id: String
        let name: String
        let icon: String
        let hits: Int
        let misses: Int
    }
    let lanes: [LaneRecord]
    let sub: String
    let onOpenHub: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HubSectionHeader(eyebrow: "The Receipts", sub: sub)
            VStack(spacing: 0) {
                ForEach(Array(lanes.enumerated()), id: \.element.id) { i, lane in
                    // One ledger line per lane: name, record, in. The icon
                    // circles and the repeated "live on the Hub" sub said
                    // nothing four times over.
                    Button(action: onOpenHub) {
                        HStack(spacing: 10) {
                            Text(lane.name.uppercased())
                                .font(.system(size: 12.5, weight: .semibold)).tracking(0.5)
                                .foregroundStyle(.white.opacity(0.85))
                            Spacer(minLength: 8)
                            Text("\(lane.hits)–\(lane.misses)")
                                .font(GaryFonts.mono(15, bold: true))
                                .foregroundStyle(lane.hits >= lane.misses
                                                 ? GaryColors.win : GaryColors.loss)
                            Image(systemName: "chevron.right")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundStyle(.white.opacity(0.25))
                        }
                        .padding(.vertical, 13)
                        .padding(.horizontal, 14)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    if i < lanes.count - 1 {
                        Rectangle().fill(Color.white.opacity(0.05)).frame(height: 1).padding(.leading, 14)
                    }
                }
            }
            .quantPanel()
            .pageGutter()
        }
    }
}

// MARK: - Home: ESPN-for-bettors layer (the Wire, market pulse, prop box,
// live tape + takeover, slate) — the time-aware front page, June 2026.

/// Where Gary's pick stands against a live or final score — drives the
/// tape/takeover/slate tint. ML and spread picks get a read; totals only
/// color once an over has clinched (an under can't clinch mid-game and we
/// don't pretend).
enum HomeLiveVerdict {
    case covering, trailing, neutral

    static func evaluate(pick: GaryPick, live: LiveScore) -> HomeLiveVerdict {
        guard let away = live.away_score, let home = live.home_score else { return .neutral }
        let text = (pick.pick ?? "").lowercased()
        guard !text.isEmpty else { return .neutral }

        // Totals — "over/under N".
        if text.contains("over") || text.contains("under") {
            guard let line = unsignedNumber(in: text) else { return .neutral }
            let combined = Double(away + home)
            if text.contains("over") {
                if combined > line { return .covering }              // clinched
                return live.isFinal ? .trailing : .neutral
            }
            if combined >= line { return .trailing }                 // under dead or pushing
            return live.isFinal ? .covering : .neutral
        }

        // Side picks: which team does the text name? SCORED, not a yes/no
        // (Aug 5 bug: "Red Sox ML -140" in a White Sox @ Red Sox game read
        // SWEATING with Boston up 3-0). A boolean can't split two clubs that
        // share a word — "sox" names both — and the old >3-character filter
        // dropped "red" and "sox" entirely, so NEITHER side matched and every
        // Red Sox game fell through to neutral. Scoring settles it: the pick
        // text scores 2 on Boston (red + sox) and 1 on Chicago (sox alone),
        // and the higher score is the side Gary took. A genuine tie is still
        // neutral — that's an unreadable pick, not a coin flip.
        let words = text.split { !$0.isLetter }.map(String.init)
        func nameScore(_ name: String?, _ abbr: String?) -> Int {
            var score = 0
            // The abbreviation is unambiguous when it's there, so it outweighs
            // any single shared nickname word.
            if let a = abbr?.lowercased(), a.count >= 2, words.contains(a) { score += 2 }
            if let n = name?.lowercased() {
                for token in n.split(separator: " ") where token.count >= 3 {
                    if words.contains(String(token)) { score += 1 }
                }
            }
            return score
        }
        let awayScore = nameScore(pick.awayTeam, live.away_abbr)
        let homeScore = nameScore(pick.homeTeam, live.home_abbr)
        guard awayScore != homeScore else { return .neutral }
        let tookAway = awayScore > homeScore
        let margin = Double(tookAway ? away - home : home - away)

        if let spread = signedNumber(in: text) {                     // spread
            let edge = margin + spread
            if edge > 0 { return .covering }
            if edge < 0 { return .trailing }
            return .neutral
        }
        if margin > 0 { return .covering }                           // moneyline
        if margin < 0 { return .trailing }
        return .neutral
    }

    /// First +/-prefixed number that reads like a spread (|x| ≤ 30) — skips
    /// American odds like -120.
    private static func signedNumber(in text: String) -> Double? {
        for raw in text.split(separator: " ") {
            let s = raw.trimmingCharacters(in: CharacterSet(charactersIn: "()[],"))
            guard s.hasPrefix("+") || s.hasPrefix("-"), let d = Double(s), abs(d) <= 30 else { continue }
            return d
        }
        return nil
    }

    /// First bare number that reads like a total line.
    static func unsignedNumber(in text: String) -> Double? {
        for raw in text.split(separator: " ") {
            let s = raw.trimmingCharacters(in: CharacterSet(charactersIn: "()[],"))
            guard !s.hasPrefix("+"), !s.hasPrefix("-"), let d = Double(s), d > 3, d < 400 else { continue }
            return d
        }
        return nil
    }
}

/// One cell of the LIVE FORM — a single sport's GAME-pick record for the current
/// active slate day. Built today as games settle (LIVE while in progress), then
/// holds last night's final until the next day's results land.
struct DailyFormCell: Identifiable {
    enum State { case live, today, lastNight }
    let league: String
    let wins: Int
    let losses: Int
    let pushes: Int
    let state: State
    var id: String { league }
    var record: String { pushes > 0 ? "\(wins)-\(losses)-\(pushes)" : "\(wins)-\(losses)" }
    var stateLabel: String {
        switch state {
        case .live:      return "LIVE"
        case .today:     return "TODAY"
        case .lastNight: return "LAST NIGHT"
        }
    }
}

struct HomeGarysForm: View {
    struct Model {
        let pips: [String]      // oldest → newest, the WHOLE graded history
        let story: String       // the editorial headline — what the data means
        let net: Double         // last-10 net units — the one colored number
        let total: Int          // graded count, for the footer affordance
    }
    let model: Model
    let onTap: () -> Void

    private let win = GaryColors.win
    private let loss = GaryColors.loss

    /// Fills only — no outlines (fill contrast and weight carry the
    /// difference); older picks fade as they recede left, so the rail
    /// itself shows time direction.
    private func pip(_ p: String, age: Double) -> some View {
        let base: Color = p == "W" ? win : p == "L" ? loss : GaryColors.gold
        let isWin = p == "W"
        return Text(p)
            .font(GaryFonts.mono(10.5, bold: isWin))
            .foregroundStyle(base.opacity(isWin ? 0.95 : 0.6))
            .frame(width: 20, height: 24)
            .background(
                RoundedRectangle(cornerRadius: 5, style: .continuous)
                    .fill(base.opacity(isWin ? 0.16 : 0.09))
            )
            .opacity(0.35 + 0.65 * age)   // oldest 0.35 → newest 1.0
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HubSectionHeader(eyebrow: "Gary's form", sub: "Newest on the right — drag for history")
            Button(action: onTap) {
                VStack(alignment: .leading, spacing: 0) {
                    // The headline: one sentence with a point of view, and the
                    // net as the single number the eye should land on.
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text(model.story)
                            .font(GaryFonts.text(15, .semibold))
                            .foregroundStyle(.white.opacity(0.92))
                            .lineLimit(2)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 8)
                        // STORE-SAFE BRIDGE: the story sentence stands alone —
                        // no unit tally beside it.
                        if !AppFlags.storeSafe {
                            Text(String(format: "%+.1fu", model.net))
                                .font(GaryFonts.mono(15, bold: true))
                                .foregroundStyle(model.net >= 0 ? win : loss)
                        }
                    }
                    .padding(.horizontal, 14).padding(.top, 13).padding(.bottom, 11)

                    // The rail — every graded pick, anchored at NOW.
                    ScrollViewReader { proxy in
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 4) {
                                ForEach(Array(model.pips.enumerated()), id: \.offset) { i, p in
                                    pip(p, age: model.pips.count > 1 ? Double(i) / Double(model.pips.count - 1) : 1)
                                        .id(i)
                                }
                            }
                            .padding(.horizontal, 14)
                        }
                        .onAppear { proxy.scrollTo(model.pips.count - 1, anchor: .trailing) }
                    }
                    .padding(.bottom, 12)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("Form, oldest to newest: \(model.pips.joined(separator: " "))")

                    Rectangle().fill(Color.white.opacity(0.05)).frame(height: 1)

                    HStack {
                        Text("ALL \(model.total) GRADED")
                            .font(GaryFonts.mono(9.5, bold: true)).tracking(1)
                            .foregroundStyle(.white.opacity(0.62))
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.62))
                    }
                    .padding(.horizontal, 14).padding(.vertical, 10)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .quantPanel()
            .pageGutter()
        }
    }
}


/// Fresh-account / failed-fetch placeholder — the scroll area below the
/// header never renders blank (App Review runs empty states).
struct HomeContentPlaceholder: View {
    let loading: Bool
    var body: some View {
        VStack(spacing: 14) {
            if loading {
                ProgressView().tint(GaryColors.gold.opacity(0.85))
                Text("Loading tonight's board…")
                    .font(GaryFonts.text(13)).foregroundStyle(.white.opacity(0.6))
            } else {
                Image(systemName: "calendar.badge.clock")
                    .font(.system(size: 30, weight: .light)).foregroundStyle(GaryColors.gold.opacity(0.7))
                Text("Nothing on the board yet")
                    .font(GaryFonts.text(15, .semibold)).foregroundStyle(.white.opacity(0.85))
                Text("Gary posts his picks a few hours before games. Pull down to refresh.")
                    .font(GaryFonts.text(12.5)).foregroundStyle(.white.opacity(0.55))
                    .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 32).padding(.vertical, 60)
    }
}
