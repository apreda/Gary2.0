// PropCards.swift — Flippable Prop Card, Floating Pick Detail Popup, Social Links, Odds table, Angular shape, Prop Card Slate.
// Split out of Views.swift on Sep 1 2026 (the 28K-line monolith); pure move,
// no behavior change. Section boundaries follow the original MARK headers.

import SwiftUI
import Combine
import Charts
import WebKit
import SafariServices
import StoreKit

// MARK: - Flippable Prop Card (front = CompactPropRow, back = Gary's read)
//
// Mirrors FlippablePickCard exactly so prop cards flip like the game-pick cards.

/// Prop pick text with the call wearing its direction — OVERs stay gold,
/// UNDERs go silver from the direction word on ("TOTAL BASES" gold ·
/// "UNDER 1.5" silver). Inherits the surrounding gold otherwise; props only.
func propPickStyled(_ s: String) -> Text {
    var out = Text("")
    var silver = false
    for (i, word) in s.split(separator: " ").enumerated() {
        let w = String(word)
        if w.uppercased() == "UNDER" { silver = true }
        let piece = silver ? Text(w).foregroundColor(GaryColors.silver) : Text(w)
        out = i == 0 ? piece : out + Text(" ") + piece
    }
    return out
}

/// Strip labeled section markers (HYPOTHESIS:, THE EDGE:, CONVERGENCE (x):, RISK:…)
/// out of a prop analysis blob into clean readable paragraphs.
func cleanPropAnalysis(_ text: String) -> String {
    // Raw markdown bold ("**THE PICK:**") reads as a glitch on-card — drop it.
    var cleaned = text.replacingOccurrences(of: "**", with: "")
    // The brain sometimes opens with its own "Gary's Take" heading — the card
    // already says GARY'S TAKE in the kicker, so on-card it read twice
    // (founder caught it Aug 19). Same strip splitTake does for game cards.
    let lowered = cleaned.lowercased()
    if lowered.hasPrefix("gary's take") || lowered.hasPrefix("garys take") {
        cleaned = String(cleaned.dropFirst(cleaned.lowercased().hasPrefix("gary's take") ? "gary's take".count : "garys take".count))
        if cleaned.hasPrefix(":") { cleaned.removeFirst() }
        cleaned = cleaned.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    let labels = ["HYPOTHESIS:", "EVIDENCE:", "CONVERGENCE", "IF WRONG:", "THE EDGE:", "THE VERDICT:", "RISK:"]
    for label in labels {
        if let r = cleaned.range(of: label, options: .caseInsensitive) {
            let after = cleaned[r.upperBound...]
            if after.hasPrefix(" (") || after.hasPrefix("(") {
                if let c = after.range(of: "):") { cleaned.removeSubrange(r.lowerBound...c.upperBound) }
                else if let c = after.range(of: ")") { cleaned.removeSubrange(r.lowerBound...c.upperBound) }
                else { cleaned.removeSubrange(r) }
            } else {
                cleaned.removeSubrange(r)
            }
        }
    }
    return cleaned
        .components(separatedBy: "\n")
        .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }
        .joined(separator: "\n\n")
}

struct FlippablePropCard: View {
    let prop: PropPick
    var gameResult: String? = nil
    /// Stored "away-home" final for the settled footer — same plumbing as the
    /// game card, so historical boards don't depend on the live cache.
    var finalScore: String? = nil
    var showSportBadge: Bool = false
    var liveInSlot: Bool = true
    var interruptionLabel: String? = nil
    /// Passed straight to the front card — Winners shows the start time on settled
    /// cards (it sorts by time), mirroring the game card.
    var alwaysShowStartTime: Bool = false
    /// SilverBar front for sold (Winners) props — see CompactPropRow.
    var premiumFinish: Bool = false

    @State private var flipped = false
    /// Back (The Numbers / The Read) built only after the first flip — see
    /// FlippablePickCard for the rationale (halves a prop rail's build cost).
    @State private var hasEverFlipped = false
    @State private var frontH: CGFloat = CompactPickRow.uniformHeight

    var body: some View {
        ZStack {
            // Front pinned to the shared uniform height so prop cards match the
            // game cards exactly (fixedHeight on CompactPropRow) — no per-card
            // measuring, which is what let content-length drive different sizes.
            CompactPropRow(prop: prop, gameResult: gameResult, finalScore: finalScore, showSportBadge: showSportBadge, liveInSlot: liveInSlot, interruptionLabel: interruptionLabel, alwaysShowStartTime: alwaysShowStartTime, fixedHeight: CompactPickRow.uniformHeight, premiumFinish: premiumFinish)
                .opacity(flipped ? 0 : 1)

            // The exact same back-face shell as game picks: same take preview,
            // expansion control, actions, book row, flip cue and natural height.
            if flipped || hasEverFlipped {
                PropSlipBack(flipped: flipped, prop: prop, gameResult: gameResult)
                    .opacity(flipped ? 1 : 0)
                    .rotation3DEffect(.degrees(180), axis: (x: 0, y: 1, z: 0))
            }
        }
        .frame(height: flipped ? nil : frontH)
        .rotation3DEffect(.degrees(flipped ? 180 : 0), axis: (x: 0, y: 1, z: 0), perspective: 0.55)
        .animation(.spring(response: 0.6, dampingFraction: 0.82), value: flipped)
        .contentShape(Rectangle())
        .onTapGesture { hasEverFlipped = true; flipped.toggle() }
        .onGaryTour { verb, _ in
            if verb == "flip" { hasEverFlipped = true; flipped.toggle() }
        }
        .accessibilityAddTraits(.isButton)
    }
}

// MARK: - Floating Pick Detail Popup

struct PickDetailPopup: View {
    let pick: GaryPick
    var gameResult: String? = nil
    let onDismiss: () -> Void

    @State private var showSportsbookOdds = false

    private var sport: Sport { Sport.from(league: pick.league) }
    private var accentColor: Color { sport.accentColor }
    private var accentGradient: LinearGradient? { sport.accentGradient }
    private var awayName: String { Formatters.shortTeamName(pick.awayTeam, league: pick.league) }
    private var homeName: String { Formatters.shortTeamName(pick.homeTeam, league: pick.league) }
    private var isNCAAB: Bool { (pick.league ?? "").uppercased() == "NCAAB" }

    private var garyPickedHome: Bool {
        guard let pickText = pick.pick?.lowercased() else { return true }
        let homeLower = (pick.homeTeam ?? "").lowercased()
        let homeShort = Formatters.shortTeamName(pick.homeTeam, league: pick.league).lowercased()
        return pickText.contains(homeLower) || pickText.contains(homeShort)
    }

    private var narrative: String {
        // STORE-SAFE BRIDGE: blind read first, scrub whatever renders.
        if AppFlags.storeSafe,
           let read = pick.game_read?.trimmingCharacters(in: .whitespacesAndNewlines),
           !read.isEmpty {
            return AppFlags.bridgeProse(read)
        }
        guard let rationale = pick.rationale?.trimmingCharacters(in: .whitespacesAndNewlines), !rationale.isEmpty else { return "" }
        // The backend now stores prose only — normalizeCardHead strips every
        // leading masthead/ticket-header line before storage, never re-adds
        // one (Aug 14 2026: storage holding zero-or-more copies of "Gary's
        // Take" was the doubled-header bug). This branch still catches a
        // leading label on any ROW WRITTEN BEFORE that fix. The "\n\n
        // backwards" fallback below it is gone: with no header ever stored
        // going forward, that branch would fire on EVERY card and return
        // only the text after its LAST blank line — silently truncating a
        // normal multi-paragraph Take down to its closing paragraph. Never
        // trim shown content; a header-less rationale renders whole.
        if let range = rationale.range(of: "Gary's Take", options: .caseInsensitive) {
            return AppFlags.bridgeProse(String(rationale[range.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines))
        }
        return AppFlags.bridgeProse(rationale)
    }

    var body: some View {
        ZStack {
            // Dimmed backdrop
            Color.black.opacity(0.95)
                .ignoresSafeArea()
                .onTapGesture {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { onDismiss() }
                }

            // Floating card
            VStack(spacing: 0) {
                // Header bar
                HStack {
                    HStack(spacing: 8) {
                        Text(pick.league?.uppercased() ?? "")
                            .font(.system(size: 10, weight: .heavy))
                            .tracking(0.5)
                            .foregroundStyle(accentColor)
                        if let sig = pick.shortGameSignificance, sig.count < 30 {
                            Text(sig)
                                .font(.system(size: 10, weight: .medium))
                                .foregroundStyle(.white.opacity(0.62))
                        }
                    }
                    Spacer()
                    Button {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { onDismiss() }
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(.white.opacity(0.62))
                            .padding(8)
                            .background(Circle().fill(.white.opacity(0.08)))
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)
                .padding(.bottom, 10)

                // Thin accent line
                Rectangle()
                    .fill(accentColor.opacity(0.3))
                    .frame(height: 0.5)
                    .padding(.horizontal, 16)

                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 14) {
                        // Sportsbook Odds — at top
                        // STORE-SAFE BRIDGE: the multi-book board is betting
                        // content — the whole section rides the flag.
                        if !AppFlags.storeSafe, let odds = pick.sportsbook_odds, !odds.isEmpty {
                            VStack(spacing: 8) {
                                Button {
                                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                        showSportsbookOdds.toggle()
                                    }
                                } label: {
                                    HStack(spacing: 6) {
                                        Image(systemName: "chart.bar.doc.horizontal")
                                            .font(.system(size: 10, weight: .semibold))
                                        Text("Sportsbook Odds")
                                            .font(.system(size: 11, weight: .semibold))
                                        Spacer()
                                        Image(systemName: showSportsbookOdds ? "chevron.up" : "chevron.down")
                                            .font(.system(size: 9, weight: .bold))
                                    }
                                    .foregroundStyle(.white.opacity(0.9))
                                    .padding(.vertical, 10)
                                    .padding(.horizontal, 12)
                                    .background(
                                        RoundedRectangle(cornerRadius: 10)
                                            .fill(accentColor.opacity(0.25))
                                            .overlay(RoundedRectangle(cornerRadius: 10).stroke(accentColor.opacity(0.4), lineWidth: 0.5))
                                    )
                                }
                                .buttonStyle(.plain)

                                if showSportsbookOdds {
                                    SportsbookOddsTable(odds: odds)
                                        .transition(.opacity.combined(with: .scale(scale: 0.95, anchor: .top)))
                                }
                            }
                        }

                        // Tale of Tape
                        if let statsData = pick.statsData, !statsData.isEmpty {
                            TaleOfTapeSection(
                                homeTeam: homeName,
                                awayTeam: awayName,
                                statsData: statsData,
                                injuries: pick.injuries,
                                garyPickedHome: garyPickedHome
                            )
                        }

                        // Gary's Analysis
                        if !narrative.isEmpty {
                            GaryTakeSection(narrative: narrative, accentColor: accentColor)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 14)
                    .padding(.bottom, 30)
                }
            }
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(Color(hex: "#1C1A1A"))
                    .overlay(
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .stroke(Color.white.opacity(0.14), lineWidth: 0.8)
                    )
                    .shadow(color: .black.opacity(0.78), radius: 26, y: 14)
            )
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            .frame(maxHeight: UIScreen.main.bounds.height * 0.74)
            .padding(.horizontal, 16)
            .padding(.top, 6)
            .padding(.bottom, 96)
        }
    }
}

// MARK: - Social Links Bar

struct SocialLinksBar: View {
    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 16) {
                // X / Twitter
                SocialButton(
                    label: "Follow on X",
                    systemIcon: "bird.fill",
                    url: "twitter://user?screen_name=BetwithGary",
                    fallbackUrl: "https://x.com/BetwithGary"
                )

                // Discord
                SocialButton(
                    label: "Join Discord",
                    systemIcon: "bubble.left.and.bubble.right.fill",
                    url: "https://discord.gg/betwithgary",
                    fallbackUrl: nil
                )
            }
        }
    }
}

struct SocialButton: View {
    let label: String
    let systemIcon: String
    let url: String
    var fallbackUrl: String?

    var body: some View {
        Button {
            if let deepLink = URL(string: url), UIApplication.shared.canOpenURL(deepLink) {
                UIApplication.shared.open(deepLink)
            } else if let fallback = fallbackUrl, let fallbackURL = URL(string: fallback) {
                UIApplication.shared.open(fallbackURL)
            } else if let primary = URL(string: url) {
                UIApplication.shared.open(primary)
            }
        } label: {
            // The page's last whisper (Aug 3): borderless text links — the
            // boxed buttons outweighed THE RECORD above them.
            HStack(spacing: 7) {
                Image(systemName: systemIcon)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(GaryColors.gold.opacity(0.7))
                Text(label.uppercased())
                    .font(GaryFonts.mono(9.5, bold: true)).tracking(0.9)
                    .foregroundStyle(.white.opacity(0.62))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 9)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}




// MARK: - Sportsbook Odds Comparison Table
struct SportsbookOddsTable: View {
    let odds: [SportsbookOdds]

    /// Find the best spread value for the bettor (highest number is always best:
    /// favorites -2.5 > -3.5, underdogs +8.5 > +6.5). Tiebreak by best juice.
    private var bestSpreadBook: String? {
        let valid = odds.compactMap { o -> (String, Double, Int)? in
            guard let book = o.book, let spread = o.spread else { return nil }
            let oddsNum = o.spread_odds.flatMap { Int($0.replacingOccurrences(of: "+", with: "")) } ?? -999
            return (book, spread, oddsNum)
        }
        guard let bestSpread = valid.map({ $0.1 }).max() else { return nil }
        return valid
            .filter { $0.1 == bestSpread }
            .max(by: { $0.2 < $1.2 })?.0
    }

    private func displayName(for book: String) -> String {
        SportsbookNames.display(book)
    }

    /// Find the best ML odds (highest/least negative)
    private var bestMLBook: String? {
        odds.compactMap { o -> (String, Int)? in
            guard let book = o.book, let mlStr = o.ml else { return nil }
            let numOdds = Int(mlStr.replacingOccurrences(of: "+", with: "")) ?? -999
            return (book, numOdds)
        }
        .max(by: { $0.1 < $1.1 })?.0
    }

    var body: some View {
        VStack(spacing: 0) {
            // Header Row
            HStack {
                Text("Sportsbook")
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text("Spread")
                    .frame(width: 80)
                Text("ML")
                    .frame(width: 60)
            }
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(Color.white.opacity(0.62))
            .textCase(.uppercase)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)

            Divider().background(Color.white.opacity(0.15))

            // Odds Rows
            ForEach(odds) { o in
                HStack {
                    Text(displayName(for: o.book ?? "-"))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .foregroundStyle(Color.white.opacity(0.9))

                    // Spread column
                    if let spread = o.spread, let spreadOdds = o.spread_odds {
                        let isBestSpread = o.book == bestSpreadBook
                        Text("\(spread >= 0 ? "+" : "")\(String(format: "%.1f", spread)) (\(spreadOdds))")
                            .foregroundStyle(isBestSpread ? Color.green : Color.white.opacity(0.8))
                            .fontWeight(isBestSpread ? .bold : .regular)
                            .frame(width: 80)
                    } else {
                        Text("-")
                            .foregroundStyle(Color.white.opacity(0.62))
                            .frame(width: 80)
                    }

                    // ML column
                    if let ml = o.ml, ml != "-" {
                        let isBestML = o.book == bestMLBook
                        Text(ml)
                            .foregroundStyle(isBestML ? Color.green : Color.white.opacity(0.8))
                            .fontWeight(isBestML ? .bold : .regular)
                            .frame(width: 60)
                    } else {
                        Text("-")
                            .foregroundStyle(Color.white.opacity(0.62))
                            .frame(width: 60)
                    }
                }
                .font(.system(size: 12, weight: .medium))
                .padding(.horizontal, 10)
                .padding(.vertical, 8)

                if o.id != odds.last?.id {
                    Divider().background(Color.white.opacity(0.08))
                }
            }

            // Footer hint
            Text("Best odds highlighted in green")
                .font(.system(size: 10))
                .foregroundStyle(Color.white.opacity(0.62))
                .padding(.top, 8)
                .padding(.bottom, 4)
        }
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(Color(hex: "#1C1A1A"))
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(Color.white.opacity(0.12), lineWidth: 0.8)
                )
        )
    }
}



// MARK: - Angular Card Shape (Trading-Card silhouette with corner cut)
//
// Distinctive PropCardSlate silhouette — standard rounded rect with the
// bottom-right corner clipped at 45°. Gives each card a unique outline
// without sacrificing space or readability.

struct AngularCardShape: Shape {
    var cornerCut: CGFloat = 16
    var cornerRadius: CGFloat = 6

    func path(in rect: CGRect) -> Path {
        var p = Path()
        let r = cornerRadius
        let cc = cornerCut
        p.move(to: CGPoint(x: r, y: 0))
        p.addLine(to: CGPoint(x: rect.maxX - r, y: 0))
        p.addQuadCurve(to: CGPoint(x: rect.maxX, y: r), control: CGPoint(x: rect.maxX, y: 0))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - cc))
        p.addLine(to: CGPoint(x: rect.maxX - cc, y: rect.maxY))
        p.addLine(to: CGPoint(x: r, y: rect.maxY))
        p.addQuadCurve(to: CGPoint(x: 0, y: rect.maxY - r), control: CGPoint(x: 0, y: rect.maxY))
        p.addLine(to: CGPoint(x: 0, y: r))
        p.addQuadCurve(to: CGPoint(x: r, y: 0), control: CGPoint(x: 0, y: 0))
        return p
    }
}

// MARK: - Prop Card Slate (Sharp, Portrait, Trading-Card Energy)
//
// Narrower portrait card optimized to fit two side-by-side per game in the
// swipe-paged featured view:
//   - Square initials frame (architectural, not friendly)
//   - Massive line value as the hero element
//   - Pip-based confidence (●●●○)
//   - Asymmetric bet pill that breaks the rectangle on top
//   - Diagonal corner clip on bottom-right
//   - Single sharp accent line in sport color at the top

struct PropCardSlate: View {
    let prop: PropPick
    var gameResult: String? = nil

    private var sport: Sport { Sport.from(league: prop.effectiveLeague) }
    private var accentColor: Color { sport.accentColor }

    private var confidencePct: Int {
        Int(round((prop.confidence ?? 0.72) * 100))
    }

    /// 4-pip confidence indicator: ●●●● for 90+%, ●●●○ for 80-89%, etc.
    private var confidencePips: Int {
        let c = prop.confidence ?? 0.72
        if c >= 0.90 { return 4 }
        if c >= 0.80 { return 3 }
        if c >= 0.70 { return 2 }
        return 1
    }

    private var betLabel: String {
        // STORE-SAFE BRIDGE: the translated call ("2+") carries the chip alone.
        prop.bridgeCallText?.uppercased() ?? (prop.bet ?? "").uppercased()
    }
    private var betColor: Color {
        let b = prop.bet?.lowercased() ?? ""
        return (b == "over" || b == "yes") ? Color(hex: "#22C55E") : Color(hex: "#EF4444")
    }

    private var lineValue: String {
        // STORE-SAFE BRIDGE: betLabel already carries the translated call
        // ("2+") — a bare market line beside it would re-introduce notation.
        if AppFlags.storeSafe, prop.bridgeCallText != nil { return "" }
        if let l = prop.line, !l.isEmpty { return l }
        if let m = (prop.prop ?? "").range(of: #"[\d.]+$"#, options: .regularExpression) {
            return String((prop.prop ?? "")[m])
        }
        return "—"
    }

    private var propType: String {
        (prop.prop ?? "")
            .replacingOccurrences(of: #"\s+[\d.]+$"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: "_", with: " ")
            .uppercased()
    }

    private var oddsDisplay: String {
        // STORE-SAFE BRIDGE: no prices (local twin of Formatters.americanOdds).
        if AppFlags.storeSafe { return "" }
        guard let raw = prop.odds, !raw.isEmpty else { return "" }
        if raw.hasPrefix("-") || raw.hasPrefix("+") { return raw }
        if let n = Int(raw), n > 0 { return "+\(n)" }
        return raw
    }

    private var initials: String {
        let parts = (prop.player ?? "").split(separator: " ").filter { !$0.isEmpty }
        if parts.count >= 2 { return String(parts.first!.first!) + String(parts.last!.first!) }
        return String(parts.first?.first ?? "?")
    }

    private var resolvedResult: String? {
        guard let r = gameResult?.lowercased(), !r.isEmpty else { return nil }
        return r
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            // ── CARD BODY ──
            VStack(alignment: .leading, spacing: 0) {
                // Top accent line in sport color — single sharp stroke
                Rectangle()
                    .fill(accentColor)
                    .frame(height: 2)

                VStack(alignment: .leading, spacing: 10) {
                    // Square initials frame + sport tag in same row
                    HStack(alignment: .top, spacing: 8) {
                        // Square initials frame — bigger initials, tighter fit
                        ZStack {
                            RoundedRectangle(cornerRadius: 4, style: .continuous)
                                .fill(Color.black.opacity(0.6))
                                .frame(width: 46, height: 46)

                            RoundedRectangle(cornerRadius: 4, style: .continuous)
                                .stroke(
                                    LinearGradient(
                                        colors: [accentColor.opacity(0.7), accentColor.opacity(0.25)],
                                        startPoint: .top,
                                        endPoint: .bottom
                                    ),
                                    lineWidth: 1
                                )
                                .frame(width: 46, height: 46)

                            Text(initials)
                                .font(.system(size: 24, weight: .black))
                                .foregroundStyle(GaryColors.gold)
                                .tracking(-0.8)
                        }

                        Spacer(minLength: 0)

                        // Stacked sport pill + position/team in upper-right
                        VStack(alignment: .trailing, spacing: 3) {
                            Text((prop.effectiveLeague ?? "").uppercased())
                                .font(.system(size: 9, weight: .heavy))
                                .tracking(0.8)
                                .foregroundStyle(accentColor)

                            if let team = prop.team, !team.isEmpty {
                                Text(Formatters.shortTeamName(team, league: prop.effectiveLeague).uppercased())
                                    .font(.system(size: 8, weight: .bold))
                                    .tracking(0.6)
                                    .foregroundStyle(.white.opacity(0.62))
                            }
                        }
                    }
                    .padding(.top, 10)

                    // Player name — compact
                    Text(prop.player ?? "—")
                        .font(.system(size: 14, weight: .heavy))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)

                    // Prop type label
                    Text(propType)
                        .font(.system(size: 9, weight: .bold))
                        .tracking(0.8)
                        .foregroundStyle(.white.opacity(0.62))
                        .lineLimit(1)

                    Spacer(minLength: 4)

                    // HERO: massive line value
                    HStack(alignment: .firstTextBaseline, spacing: 0) {
                        Text(lineValue)
                            .font(.system(size: 44, weight: .black))
                            .foregroundStyle(.white)
                            .tracking(-1.5)

                        Spacer()
                    }

                    // Odds line
                    HStack(spacing: 8) {
                        Text(oddsDisplay)
                            .font(GaryFonts.mono(13, bold: true))
                            .foregroundStyle(GaryColors.gold)

                        Spacer()

                        // Pip confidence
                        HStack(spacing: 2) {
                            ForEach(0..<4, id: \.self) { i in
                                Circle()
                                    .fill(i < confidencePips ? GaryColors.gold : Color.white.opacity(0.12))
                                    .frame(width: 5, height: 5)
                            }
                        }
                    }

                    // Key stat bullets — 2 max, tight
                    if let stats = prop.key_stats?.prefix(2), !stats.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            ForEach(Array(stats.enumerated()), id: \.offset) { _, stat in
                                HStack(alignment: .top, spacing: 5) {
                                    Rectangle()
                                        .fill(accentColor.opacity(0.55))
                                        .frame(width: 6, height: 1)
                                        .offset(y: 6)
                                    Text(stat)
                                        .font(.system(size: 9, weight: .medium))
                                        .foregroundStyle(.white.opacity(0.72))
                                        .lineLimit(2)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                            }
                        }
                        .padding(.top, 6)
                    }

                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 12)
            }
            .frame(maxWidth: .infinity)
            .background(
                ZStack {
                    Color(hex: "#0A0907")
                    LinearGradient(
                        colors: [accentColor.opacity(0.08), .clear],
                        startPoint: .top,
                        endPoint: .center
                    )
                }
            )
            .overlay(
                // Border tier varies by confidence:
                //  - 4 pips (90%+): gold gradient = "premium / play of the day"
                //  - else:           subtle white-opacity (clean)
                AngularCardShape(cornerCut: 16, cornerRadius: 6)
                    .stroke(
                        confidencePips >= 4
                            ? LinearGradient(
                                colors: [
                                    GaryColors.lightGold,
                                    GaryColors.gold,
                                    GaryColors.lightGold.opacity(0.4)
                                ],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                            : LinearGradient(
                                colors: [
                                    Color.white.opacity(0.18),
                                    Color.white.opacity(0.05),
                                    Color.white.opacity(0.02)
                                ],
                                startPoint: .top,
                                endPoint: .bottom
                            ),
                        lineWidth: confidencePips >= 4 ? 1.2 : 0.5
                    )
            )
            .clipShape(AngularCardShape(cornerCut: 16, cornerRadius: 6))

            // ── ASYMMETRIC BET PILL (protrudes above the card) ──
            Text(betLabel)
                .font(.system(size: 10, weight: .black))
                .tracking(0.8)
                .foregroundStyle(.black)
                .padding(.horizontal, 9)
                .padding(.vertical, 4)
                .background(
                    Capsule().fill(betColor)
                )
                .overlay(
                    Capsule().stroke(Color.black.opacity(0.4), lineWidth: 0.5)
                )
                .shadow(color: .black.opacity(0.45), radius: 6, x: 0, y: 2)
                .offset(x: 10, y: -8)
        }
        .frame(height: 250)
        .overlay(alignment: .topTrailing) {
            // Result stamp if graded
            if let res = resolvedResult {
                Text(res == "won" ? "W" : res == "push" ? "P" : "L")
                    .font(.system(size: 10, weight: .black))
                    .foregroundStyle(.black)
                    .frame(width: 20, height: 20)
                    .background(
                        Circle().fill(
                            res == "won" ? GaryColors.gold :
                            res == "push" ? Color.yellow :
                            Color(hex: "#6A6A70")
                        )
                    )
                    .offset(x: -8, y: 12)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(prop.player ?? "") \(betLabel) \(propType) \(lineValue), \(confidencePct)% confidence")
    }
}
