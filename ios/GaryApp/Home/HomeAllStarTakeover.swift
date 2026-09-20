import SwiftUI

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

