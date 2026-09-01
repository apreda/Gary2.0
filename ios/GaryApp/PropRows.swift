// PropRows.swift — Compact Prop Row + Floating Prop Detail Popup.
// Split out of Views.swift on Sep 1 2026 (the 28K-line monolith); pure move,
// no behavior change. Section boundaries follow the original MARK headers.

import SwiftUI
import Combine
import Charts
import WebKit
import SafariServices
import StoreKit

// MARK: - Compact Prop Row (Redesigned)

struct CompactPropRow: View {
    let prop: PropPick
    var gameResult: String? = nil
    /// Stored "away-home" final for the settled footer (game-card parity) —
    /// historical boards pass it so the score never depends on the live cache.
    var finalScore: String? = nil
    var showSportBadge: Bool = false
    /// Game pages carry the score in the page hero (LiveScoreStrip), so their
    /// cards keep the plain start time in the slot. Everywhere else stays state-aware.
    var liveInSlot: Bool = true
    /// Exact daily-slate mirror used while live_scores catches up. Game pages
    /// supply this only from the same league + provider game id.
    var interruptionLabel: String? = nil
    /// Winners keeps the start time visible on settled cards (it sorts by time);
    /// elsewhere settled cards hide it. Mirrors the game card's flag exactly.
    /// Declared BEFORE fixedHeight to match CompactPickRow's field order (the
    /// synthesized init is positional, and the flip wrapper passes them in order).
    var alwaysShowStartTime: Bool = false
    /// Exact height when the flip wrapper passes one — uniform with the game card
    /// (shares CompactPickRow.uniformHeight). nil = natural size (raw/share use).
    var fixedHeight: CGFloat? = nil
    /// SilverBar finish (Jul 3, user-locked): Winners-page (sold) props render
    /// as the SILVER twin of the gold game bar — black badge crest, ink type,
    /// same verdict physics. Free Picks-page props stay dark (default false).
    var premiumFinish: Bool = false

    private var accentColor: Color { Sport.from(league: prop.effectiveLeague).accentColor }
    private var isMLBProp: Bool {
        let s = Sport.from(league: prop.effectiveLeague)
        return s == .mlb || s == .mlbHR
    }
    private var accentGradient: LinearGradient {
        Sport.from(league: prop.effectiveLeague).accentGradient
            ?? LinearGradient(colors: [accentColor, accentColor], startPoint: .leading, endPoint: .trailing)
    }
    private var interruptionOverride: String? {
        guard let value = interruptionLabel?.trimmingCharacters(in: .whitespacesAndNewlines),
              !value.isEmpty else { return nil }
        return value.uppercased()
    }
    // MARK: - Result Stamp Properties
    private var resolvedResult: String? {
        if interruptionOverride != nil { return nil }
        // Doubleheader guard: suppress the matchup-keyed graded result when THIS prop's game
        // (by game_id) is still live — else it borrows the other doubleheader game's result.
        if let status = identifiedGameStatus,
           status.isLive || status.isInterrupted { return nil }
        if let result = gameResult?.lowercased(), !result.isEmpty { return result }
        // Game-card parity (founder, Jul 23): no stored grade yet, but the game
        // is FINAL and we hold the player's final line — grade it ourselves.
        return livePropGraded
    }

    // MARK: - Live self-grading (game-card parity)
    @ObservedObject private var livePropCache = LivePropStatsCache.shared
    /// The market's line as a number — the stored field first, else the
    /// trailing number on the prop text ("total_bases 1.5").
    private var lineValue: Double? {
        if let l = prop.line, let d = Double(l.trimmingCharacters(in: .whitespaces)) { return d }
        guard let p = prop.prop,
              let r = p.range(of: "[0-9]+(\\.[0-9]+)?$", options: .regularExpression) else { return nil }
        return Double(p[r])
    }
    private var isUnderBet: Bool { (prop.bet ?? "").lowercased().contains("under") }
    /// The player's running value for this market (live box score), nil until
    /// the tracker has a line or for markets it can't read.
    private var liveValue: Int? {
        guard let market = prop.prop else { return nil }
        return livePropCache.lines[LivePropStatsCache.nameKey(prop.player)]?.value(forMarket: market)
    }
    /// The game card's liveGraded, prop edition: FINAL board + final line →
    /// verdict now, instead of waiting on the grading cron's next pass.
    private var livePropGraded: String? {
        guard identifiedGameStatus?.isFinal == true,
              let v = liveValue, let line = lineValue else { return nil }
        if Double(v) == line { return "push" }
        return (Double(v) > line) != isUnderBet ? "won" : "lost"
    }
    // D3 verdict system — IDENTICAL to the game card (user call, Jul 3: props
    // speak the same verdict language; the only split is Winners-silver vs
    // free-dark, mirroring Winners-gold vs free-dark on game picks).
    private var isPropLost: Bool { resolvedResult == "lost" }
    private var isSilverLost: Bool { premiumFinish && resolvedResult == "lost" }
    private var isSilverWon: Bool { premiumFinish && resolvedResult == "won" }
    /// No-op (founder call, Jul 4, game-card parity): the free Picks-page prop
    /// card no longer dims a loss — full brightness, the ✕ ghost still tells
    /// the story. The silver bar keeps its OWN loss treatment separately
    /// (whole-bar saturation/brightness + the hero-specific dim on isSilverLost).
    private func d3Dim(_ lostOpacity: Double) -> Double { 1 }
    /// Premium type scale — everything on the metal reads ~15% larger (gold parity).
    private var pf: CGFloat { premiumFinish ? 1.15 : 1 }
    /// One shared prop-headline geometry on Picks and Winners. The premium
    /// finish keeps its 15% lift on the smaller supporting labels through `pf`,
    /// but the two long player/market lines stay at the Picks card's 52pt base.
    /// Scaling this hero twice crowded the call and line out of the fixed card.
    private var propHeroSize: CGFloat { 52 }
    // Optical spacing (Jul 3 spacing pass) — see CompactPickRow.heroTopPad.
    private var heroTopPad: CGFloat { 12 - 0.22 * propHeroSize }
    private var metaTopPad: CGFloat { 12 - 0.25 * propHeroSize }
    private var eyebrowTint: Color { premiumFinish ? SilverBar.inkSoft : GaryColors.gold }
    private var heroTint: Color { premiumFinish ? SilverBar.inkHero : .white }
    private var propLeagueTint: Color { premiumFinish ? SilverBar.inkStrong : (isMLBProp ? GaryColors.mlbGrass : accentColor) }
    /// Team name reads gold (game-card parity, Jul 4 — founder call).
    private var metaBodyTint: Color { premiumFinish ? SilverBar.inkBody : GaryColors.gold }
    private var metaDotTint: Color { premiumFinish ? SilverBar.inkBody.opacity(0.7) : .white.opacity(0.4) }
    private var oddsTint: Color { premiumFinish ? SilverBar.inkStrong : GaryColors.gold }
    private var footerTint: Color { premiumFinish ? SilverBar.inkSoft : GaryColors.gold }
    private var dividerTint: Color { premiumFinish ? SilverBar.inkStrong.opacity(0.35) : .white.opacity(0.12) }
    private var shareTint: Color { premiumFinish ? SilverBar.inkSoft.opacity(0.8) : .white.opacity(0.5) }
    private var chevronTint: Color { premiumFinish ? SilverBar.inkStrong.opacity(0.7) : GaryColors.heroAccent.opacity(0.7) }
    private var settledFooterTint: Color {
        switch resolvedResult {
        case "won": return premiumFinish ? Color(hex: "#1E6B33") : GaryColors.win
        case "lost": return premiumFinish ? SilverBar.lost : GaryColors.lostTint
        case "push": return premiumFinish ? SilverBar.inkSoft : GaryColors.gold
        default: return premiumFinish ? SilverBar.inkSoft : GaryColors.gold
        }
    }

    // Win moment (gold parity): struck green check + payout count-up + one-shot
    // confetti for fresh wins. Loss = crack + whole-bar dim.
    @State private var shownPayout: Int = 0
    @State private var showConfetti = false
    private var payoutPer100: Int? {
        let raw = oddsText
            .replacingOccurrences(of: "+", with: "")
            .replacingOccurrences(of: "−", with: "-")
            .trimmingCharacters(in: .whitespaces)
        guard let v = Int(raw), v != 0 else { return nil }
        return v > 0 ? v : Int((10000.0 / Double(abs(v))).rounded())
    }
    private var isFreshWin: Bool {
        guard let d = parseISO8601(prop.commence_time ?? "") else { return false }
        return Date().timeIntervalSince(d) < 86_400
    }
    private func runWinMoment() {
        let target = payoutPer100 ?? 0
        if isFreshWin && !CelebratedWins.contains(prop.id) {
            CelebratedWins.mark(prop.id)
            showConfetti = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 3.5) { showConfetti = false }
            shownPayout = 0
            Task { @MainActor in
                guard target > 0 else { return }
                for i in 1...30 {
                    try? await Task.sleep(nanoseconds: 30_000_000)
                    shownPayout = Int(Double(target) * Double(i) / 30.0)
                }
                shownPayout = target
            }
        } else {
            shownPayout = target
        }
    }
    private func verdictFooterLine(_ line: String) -> String {
        guard let v = resolvedResult else { return line }
        let word = v == "won" ? "✓ \(AppFlags.wonStamp)" : (v == "push" ? "PUSH" : "LOST")
        if line.hasPrefix("FINAL · ") { return word + " · " + line.dropFirst("FINAL · ".count) }
        if line == "FINAL" { return word }
        return line
    }

    private var formattedTime: String {
        // Same formatter as the game card so both read "1:35 PM ET".
        let viaCommence = Formatters.formatCommenceTime(prop.commence_time)
        if !viaCommence.isEmpty { return viaCommence }
        if let time = prop.time, !time.isEmpty, time != "TBD" { return time }
        return ""
    }

    /// Live/final state for THIS matchup (shared cache; nil when scheduled
    /// or unknown). Only consulted when the card has no settled result.
    @ObservedObject private var liveCache = LiveScoreCache.shared
    /// One-tap share from the prop front — renders the prop share card
    /// (story + square) and presents the system sheet.
    @State private var shareItem: PickShareItem? = nil
    @State private var showPickInfo = false
    private var identifiedGameStatus: LiveScore? {
        if let gameId = prop.game_id {
            return liveCache.status(forGameId: gameId, league: prop.effectiveLeague)
        }
        let legacy = liveCache.status(forMatchup: prop.matchup ?? "")
        return legacy?.isInterrupted == true ? nil : legacy
    }
    private var liveStatus: LiveScore? {
        guard liveInSlot, resolvedResult == nil else { return nil }
        return identifiedGameStatus
    }

    /// The actual line value (e.g. "24.5") for use inside the bet pill so
    /// the user sees "OVER 24.5" instead of just "OVER". Strips trailing
    /// zeros but keeps the .5 half-points that prop markets actually use.
    private var formattedLineText: String? {
        guard let raw = prop.line?.trimmingCharacters(in: .whitespaces),
              !raw.isEmpty else { return nil }
        if let d = Double(raw) {
            return d.truncatingRemainder(dividingBy: 1) == 0
                ? String(format: "%g", d)
                : String(format: "%.1f", d)
        }
        return raw
    }

    private var leagueTag: String? {
        // Eyebrow league label — always shown so the header reads like the
        // gold game card's (sport accent dot + significance tag).
        guard let league = prop.effectiveLeague, !league.isEmpty else { return nil }
        return league.uppercased()
    }

    private var leagueIcon: String {
        switch (prop.effectiveLeague ?? "").uppercased() {
        case "NBA", "NCAAB", "WNBA": return "basketball.fill"
        case "NFL", "NCAAF", "NFL TDS": return "football.fill"
        case "NHL": return "hockey.puck.fill"
        case "MLB": return "baseball.fill"
        case "EPL": return "soccerball"
        default: return "sportscourt.fill"
        }
    }

    /// Market name without the line ("TOTAL BASES") — propDisplay carries the
    /// line when the raw prop type does, so strip a trailing numeric token; the
    /// chip composes market + call itself. Long names abbreviate so the chip
    /// stays one line.
    private var marketName: String {
        var words = Formatters.propDisplay(prop.prop, league: prop.effectiveLeague)
            .split(separator: " ").map(String.init)
        if let last = words.last, Double(last) != nil { words.removeLast() }
        let name = words.joined(separator: " ").uppercased()
        return Self.marketAbbrevShared[name] ?? name
    }
    static let marketAbbrevShared: [String: String] = [
        "STRIKEOUTS": "K'S", "HOME RUNS": "HR", "STOLEN BASES": "SB",
        "PITCHING OUTS": "OUTS", "HITS + RUNS + RBI": "H+R+RBI",
        // propDisplay yields "Hits Runs Rbis" (no + separators) for this combo —
        // map those raw forms too so the card hero abbreviates to H+R+RBI.
        "HITS RUNS RBIS": "H+R+RBI", "HITS RUNS RBI": "H+R+RBI",
        "POINTS + REBOUNDS + ASSISTS": "PRA", "REBOUNDS + ASSISTS": "R+A",
        "POINTS + REBOUNDS": "P+R", "POINTS + ASSISTS": "P+A",
        "GOALS + ASSISTS": "G+A", "SHOTS ON GOAL": "SOG",
    ]

    /// The pick chip's call text — side + line (e.g. "OVER 1.5"). Mirrors the
    /// gold card's abbreviated pick (compactPick), silver instead of gold.
    private var compactCall: String {
        // STORE-SAFE BRIDGE: chip reads "2+" / "1 OR FEWER", never "OVER 1.5".
        if let b = prop.bridgeCallText { return b.uppercased() }
        let side = (prop.bet ?? "").uppercased()
        if let lineText = formattedLineText {
            return side.isEmpty ? lineText : "\(side) \(lineText)"
        }
        return side
    }

    // MARK: Headline front (June 11 2026 — THE pick card design, everywhere)
    //
    // Same anatomy as the game card: gold eyebrow + bear, the market and call
    // stacked as display type, accent league token + player meta line, the
    // share/tier/take footer, diagonal stamp when settled.

    private var eyebrowLabel: String {
        "GARY'S PICK"
    }

    /// "MATT CHAPMAN" over "H+R+RBI OVER 0.5" — the player IS the headline
    /// (user call, Jun 11: the name was hiding in the meta line).
    /// WORDS, not arrows (founder, Jul 14: "massive fucked up doing the
    /// arrows — go back to the words Over and Under" on prop cards).
    private var heroLines: String {
        let call = compactCall
        let bet = call.isEmpty ? marketName : "\(marketName) \(call)"
        let player = (prop.player ?? "").uppercased()
        return player.isEmpty ? bet : "\(player)\n\(bet)"
    }

    /// Matchup context for the meta row — just the team now. The FINAL score + situation
    /// moved to the footer (game-card parity), so the meta row stays "Rangers · +130"
    /// rather than carrying the result. Time and odds render SEPARATELY.
    private var metaLine: String {
        return Formatters.shortTeamName(prop.team, league: prop.effectiveLeague)
    }

    /// Odds rendered separately in sport-gold in the meta row (game card parity).
    private var oddsText: String { Formatters.americanOdds(prop.odds) }

    /// Start time on the footer's left corner — game card parity. Settled cards
    /// keep it on the Winners page (alwaysShowStartTime), matching the game card;
    /// live cards hide it (the footer carries the live line instead).
    private var propFrontTime: String? {
        if resolvedResult != nil { return alwaysShowStartTime ? (formattedTime.isEmpty ? nil : formattedTime) : nil }
        if interruptionOverride != nil { return nil }
        if let live = liveStatus, live.isLive || live.isFinal || live.isInterrupted { return nil }
        return formattedTime.isEmpty ? nil : formattedTime
    }

    /// Footer live line — teams + score + situation (minute / outs+bases),
    /// IDENTICAL to the game card via the shared formatter.
    private var liveFooterText: String? {
        // Settled — the FINAL score with team names rides the footer's left corner, exactly
        // like the game card (the prop's own CASHED/LOST stamp sits separately in the corner).
        if resolvedResult != nil {
            let mk = prop.matchup ?? ""
            // Game-card parity: rich cache line only when it names the teams,
            // else the formatted score paths (never a bare "17-1" fragment).
            if let ls = identifiedGameStatus,
               ls.isFinal, ls.away_score != nil, ls.home_score != nil,
               ls.away_abbr != nil, ls.home_abbr != nil {
                return liveLineRich(ls, label: "FINAL")
            }
            if let fs = finalScore, !fs.isEmpty { return "FINAL · \(finalScoreLine(matchup: mk, raw: fs, league: prop.effectiveLeague))" }
            if let g = liveCache.gradedScore(forMatchup: mk) { return "FINAL · \(finalScoreLine(matchup: mk, raw: g, league: prop.effectiveLeague))" }
            if let ls = identifiedGameStatus, ls.isFinal,
               let a = ls.away_score, let h = ls.home_score {
                return "FINAL · \(finalScoreLine(matchup: mk, raw: "\(a)-\(h)", league: prop.effectiveLeague))"
            }
            return "FINAL"
        }
        guard let ls = liveStatus else { return interruptionOverride }
        if ls.isLive {
            // The sweat, live: the player's running value against the line
            // ("· 1/1.5") rides the game situation. Only when the tracker
            // actually holds a line — never a fabricated zero.
            let base = liveLineRich(ls, label: "LIVE")
            if let v = liveValue, let lv = formattedLineText {
                return "\(base)  ·  \(v)/\(lv)"
            }
            return base
        }
        if ls.isFinal { return liveLineRich(ls, label: "FINAL") }
        if let interruption = ls.interruptionLabel { return interruption }
        return interruptionOverride
    }

    var body: some View {
        ZStack {
            // D3 ghost verdict — same object as the game card's (win ✓ green 14%,
            // loss ✕ red 7%), clipped by the card shape. The silver bar carries
            // the giant check on a WIN too (game-card parity, Jul 4); a premium
            // LOSS keeps the crack fracture instead, no ghost.
            // Game-card parity (founder, Aug 6): the win keeps its ghost check,
            // the loss is the crack alone on every finish.
            if resolvedResult == "won" {
                Text("✓")
                    .font(.system(size: 200, weight: .regular, design: .serif))
                    .foregroundStyle(premiumFinish ? Color(hex: "#1E6B33").opacity(0.16)
                                                   : GaryColors.win.opacity(0.14))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                    .offset(x: 12, y: -14)
                    .allowsHitTesting(false)
            }

            VStack(alignment: .leading, spacing: 0) {
                // UNIFORM eyebrow (game-card grammar, Jul 12): accent text left,
                // the mark floats big in the corner via overlay — same slot,
                // every finish, every page.
                HStack(alignment: .top, spacing: 10) {
                    Text(eyebrowLabel)
                        .font(GaryFonts.accent(12.5 * pf)).tracking(1.0)
                        .foregroundStyle(eyebrowTint)
                        .padding(.top, 6)
                    Spacer()
                }
                .padding(.bottom, 6 * pf)
                .overlay(alignment: .topTrailing) {
                    // Parity with the game face: graded cards surrender the
                    // corner to the check + payout block.
                    if resolvedResult == nil {
                        Image(GaryBrand.mark)
                            .resizable().scaledToFit()
                            .frame(width: 46 * pf, height: 46 * pf)
                            .shadow(color: .black.opacity(premiumFinish ? 0.35 : 0.5), radius: 2, y: 1)
                            // Raised (founder, Jul 13): a two-line hero could
                            // brush the mark at -2; -10 clears every layout.
                            .offset(y: -10)
                            .allowsHitTesting(false)
                    }
                }
                .opacity(d3Dim(0.4))

                // Balanced hero (game-card parity, Jul 5): equal flexible space
                // above and below centers the hero in its band.
                Spacer(minLength: 0)

                // Skyscraper hero (game-card parity): one Text per line with tight
                // leading; both prop lines run long and self-scale. Premium leading
                // matches the gold bar's fixed −24 (leading does not scale with pf).
                // Each line gets an EXPLICIT box instead of a negative-leading
                // stack (founder bug, Aug 6: "NATHANIEL LOWE" and "H+R+RBI
                // OVER 1.5" collided on the silver card while the dark card
                // read fine). A prop hero is two LONG lines — the player and
                // the market — and on a won premium card the payout column
                // narrows them further; natural line boxes plus -24 made the
                // block taller than the card's hero band, so the layout
                // compressed the stack and the lines touched. A fixed
                // per-line height can't compress, so the pair holds its
                // spacing at any scale. 0.86 reproduces the dark card's own
                // effective line advance, which is the one the founder called
                // correct.
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(heroLines.components(separatedBy: "\n").enumerated()), id: \.offset) { _, line in
                        Text(line)
                            .font(GaryFonts.display(propHeroSize))
                            .lineLimit(1)
                            .minimumScaleFactor(0.4)
                            .frame(height: propHeroSize * 0.86, alignment: .leading)
                    }
                }
                    .foregroundStyle(heroTint)
                    .shadow(color: premiumFinish ? SilverBar.sheen.opacity(0.55) : .clear, radius: 0, y: 1)
                    // Silver-parity with the gold bar: a lost card mutes the pick
                    // words specifically so the crack reads with more depth.
                    .opacity(isSilverLost ? 0.5 : d3Dim(0.36))
                    .padding(.top, heroTopPad)
                    // Only a WON premium card reserves the payout column —
                    // corner marks are gone on every finish (game-card parity).
                    .padding(.trailing, (premiumFinish && isSilverWon) ? 96 : 0)

                // LOCKED GEOMETRY (founder law, Jul 4): meta + divider + score
                // pin to the card BOTTOM, identical to the game card — a hero
                // that scales down for a long name can never float them up.
                Spacer(minLength: 0)

                HStack(alignment: .center, spacing: 8) {
                    // Game-card parity, Jul 4: just the league — "· PROP" doesn't
                    // exist on the game card's token, so it doesn't exist here either.
                    Text((prop.effectiveLeague ?? "").uppercased())
                        .font(GaryFonts.mono(11 * pf, bold: true)).tracking(1.2)
                        .foregroundStyle(propLeagueTint)
                        .lineLimit(1)
                        .layoutPriority(1)
                    // PRICE NEVER TRUNCATES — same split as the game card
                    // (founder, Aug 24): odds fixed-size, meta scales.
                    (Text(metaLine).foregroundColor(metaBodyTint))
                        .font(GaryFonts.text(13.5 * pf, .medium))
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                    if !oddsText.isEmpty {
                        (Text(metaLine.isEmpty ? "" : "· ").foregroundColor(metaDotTint)
                            + Text(oddsText).foregroundColor(oddsTint))
                            .font(GaryFonts.text(13.5 * pf, .medium))
                            .lineLimit(1)
                            .fixedSize()
                            .layoutPriority(2)
                    }
                    Spacer(minLength: 4)
                    // ⓘ — parity with the game face's how-it-works pop.
                    Button { showPickInfo = true } label: {
                        Image(systemName: "info.circle")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(shareTint)
                            .frame(width: 22, height: 22)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("How the picks work")
                    // Share — same spot as the game card (meta row), frees the footer.
                    Button {
                        let images = renderPropShareImages(prop: prop, gameResult: resolvedResult)
                        if !images.isEmpty { shareItem = PickShareItem(images: images) }
                    } label: {
                        Image(systemName: "square.and.arrow.up")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(shareTint)
                            .frame(width: 26, height: 22)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Share this prop pick")
                }
                .padding(.top, metaTopPad)
                .opacity(d3Dim(0.45))
                .sheet(isPresented: $showPickInfo) { PickInfoSheet() }

                // Footer — live line (teams + score + situation) or start time on
                // the left, tap-to-flip chevron on the right. Matches the game card
                // exactly: share moved up to the meta row, no "Gary's Take" words.
                Rectangle()
                    .fill(dividerTint)
                    .frame(height: 1)
                    .padding(.vertical, 10)
                    .opacity(d3Dim(0.6))

                HStack(spacing: 10) {
                    if let live = liveFooterText {
                        // Settled: the footer line carries the verdict ("✓ CASHED · …")
                        // in win-green / lostTint, full strength on a dimmed lost card.
                        // Scale floor 0.65: the live line can carry the running
                        // prop value ("· 1/1.5") — it must shrink, never clip.
                        Text(verdictFooterLine(live))
                            .font(GaryFonts.mono(11 * pf, bold: true)).tracking(0.5)
                            .foregroundStyle(resolvedResult != nil ? settledFooterTint : footerTint)
                            .lineLimit(1)
                            .minimumScaleFactor(0.65)
                    } else if let t = propFrontTime {
                        Text(t)
                            .font(GaryFonts.mono(11 * pf, bold: true)).tracking(0.5)
                            .foregroundStyle(footerTint)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(chevronTint)
                        .opacity(d3Dim(0.5))
                }
            }
            .padding(18)

            // (Corner bear retired Jul 4 — the mark lives in the eyebrow row on
            // every card now, so the top-right corner stays clean everywhere.)

            // SILVER WIN (gold parity): ghost check behind the type carries the
            // win (corner ✓ retired Jul 4); the corner keeps the money.
            if isSilverWon, payoutPer100 != nil {
                VStack(alignment: .trailing, spacing: 1) {
                    Text("+$\(shownPayout)")
                        .font(GaryFonts.display(36))
                        .foregroundStyle(SilverBar.inkHero)
                        .shadow(color: SilverBar.sheen.opacity(0.6), radius: 0, y: 1)
                    // "PER $100 · PAID" subline retired Jul 13 (founder) — the
                    // ⓘ sheet explains the flat-$100 scoring once, app-wide.
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                .padding(.top, 12).padding(.trailing, 16)
                .allowsHitTesting(false)
            }

            // SILVER LOSS (gold parity): the hairline fracture; dim rides below.
            if isSilverLost {
                CrackShape()
                    .stroke(Color(hex: "#17171B").opacity(0.72), lineWidth: 2)
                    .allowsHitTesting(false)
                CrackShape()
                    .stroke(SilverBar.sheen.opacity(0.45), lineWidth: 1)
                    .offset(x: 2)
                    .allowsHitTesting(false)
            }

            // DARK LOSS cracks too (founder, Aug 6) — game-card parity, and no
            // dim on the Picks page, so the fracture carries the verdict alone.
            if !premiumFinish, resolvedResult == "lost" {
                CrackShape()
                    .stroke(Color.black.opacity(0.75), lineWidth: 2)
                    .allowsHitTesting(false)
                CrackShape()
                    .stroke(GaryColors.loss.opacity(0.38), lineWidth: 1)
                    .offset(x: 2)
                    .allowsHitTesting(false)
            }

            if showConfetti { GoldConfettiBurst() }
        }
        // Uniform card height — matches the game card so every pick card is the
        // same object regardless of content. FIXED (not a floor) when the flip
        // wrapper passes one, so 2-line heroes don't end up taller than 1-line.
        .frame(minHeight: fixedHeight == nil ? 210 : nil)
        .frame(height: fixedHeight)
        // Contains the oversized D3 ghost mark (game-card parity).
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .background(
            Group {
                if premiumFinish {
                    SilverBar.background()
                } else {
                    // Lift v3 (founder, Jul 6: "+20% more off the page"):
                    // brighter top face, harder edge light, longer throw —
                    // dark cards only; the Winners gold/silver bars keep
                    // their own finish.
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .fill(LinearGradient(colors: [Color(hex: "#272522"), Color(hex: "#100F0D")],
                                             startPoint: .top, endPoint: .bottom))
                        .overlay(
                            RoundedRectangle(cornerRadius: 20, style: .continuous)
                                .stroke(.white.opacity(0.19), lineWidth: 1)
                        )
                        .overlay(alignment: .top) {
                            // Lit-from-above highlight — the lift cue.
                            RoundedRectangle(cornerRadius: 20, style: .continuous)
                                .stroke(.white.opacity(0.24), lineWidth: 1)
                                .mask(LinearGradient(colors: [.white, .clear], startPoint: .top, endPoint: .center))
                        }
                        .shadow(color: .black.opacity(0.68), radius: 32, y: 17)
                        .shadow(color: .black.opacity(0.45), radius: 5, y: 3)
                }
            }
        )
        // Locked LOST physics on the silver bar (gold parity).
        .saturation(isSilverLost ? 0.8 : 1)
        .brightness(isSilverLost ? -0.06 : 0)
        .onAppear {
            LiveScoreCache.shared.startIfNeeded()
            // MLB props live-track their player's box line (game-card parity).
            if isMLBProp { LivePropStatsCache.shared.track(player: prop.player, matchup: prop.matchup) }
            if isSilverWon { runWinMoment() }
        }
        // Same transition gap as the gold bar: a live card graded WON while on
        // screen must start its win moment here — onAppear won't fire again.
        .onChange(of: isSilverWon) { won in
            if won { runWinMoment() }
        }
        .sheet(item: $shareItem) { ActivityShareSheet(items: $0.images) }
    }
}

// MARK: - Floating Prop Detail Popup

struct PropDetailPopup: View {
    let prop: PropPick
    let onDismiss: () -> Void

    private var accentColor: Color {
        if prop.isTDPick {
            return prop.tdCategory == "underdog" ? Color(hex: "#22C55E") : Color(hex: "#3B82F6")
        }
        return Sport.from(league: prop.effectiveLeague).accentColor
    }

    private var betColor: Color {
        guard let bet = prop.bet?.lowercased() else { return .white }
        if bet == "over" || bet == "yes" { return .green }
        return .red
    }

    private var categoryLabel: String? {
        guard let cat = prop.tdCategory else { return nil }
        switch cat {
        case "standard": return "Regular Pick"
        case "underdog": return "Value Pick (+200+)"
        case "first_td": return "First TD"
        default: return nil
        }
    }

    /// Clean prop analysis text into paragraphs
    private func cleanAnalysis(_ text: String) -> [String] {
        var cleaned = text
        let labelsToRemove = ["HYPOTHESIS:", "EVIDENCE:", "CONVERGENCE", "IF WRONG:", "THE EDGE:", "THE VERDICT:", "RISK:"]
        for label in labelsToRemove {
            if let range = cleaned.range(of: label, options: .caseInsensitive) {
                let afterLabel = cleaned[range.upperBound...]
                if afterLabel.hasPrefix(" (") || afterLabel.hasPrefix("(") {
                    if let closeRange = afterLabel.range(of: "):") {
                        cleaned.removeSubrange(range.lowerBound...closeRange.upperBound)
                    } else if let closeRange = afterLabel.range(of: ")") {
                        cleaned.removeSubrange(range.lowerBound...closeRange.upperBound)
                    } else {
                        cleaned.removeSubrange(range)
                    }
                } else {
                    cleaned.removeSubrange(range)
                }
            }
        }
        return cleaned.components(separatedBy: "\n")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .map { para in
                var p = para
                if let first = p.first, first.isLowercase { p = p.prefix(1).uppercased() + p.dropFirst() }
                return p
            }
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
                        if let league = prop.effectiveLeague {
                            Text(league)
                                .font(.system(size: 10, weight: .heavy))
                                .tracking(0.5)
                                .foregroundStyle(accentColor)
                        }
                        if let category = categoryLabel {
                            Text(category)
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
                    VStack(alignment: .leading, spacing: 18) {
                        VStack(alignment: .leading, spacing: 16) {
                            // Player info
                            VStack(alignment: .leading, spacing: 6) {
                                HStack(alignment: .top) {
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(prop.player ?? "Unknown")
                                            .font(.system(size: 22, weight: .bold))
                                            .foregroundStyle(.white)

                                        if let team = prop.team {
                                            Text(team)
                                                .font(.system(size: 13, weight: .medium))
                                                .foregroundStyle(.white.opacity(0.62))
                                        }
                                    }

                                    Spacer()

                                    Text(Formatters.americanOdds(prop.odds))
                                        .font(.system(size: 22, weight: .bold))
                                        .foregroundStyle(accentColor)
                                }

                                if let matchup = prop.matchup {
                                    HStack(spacing: 3) {
                                        Image(systemName: "sportscourt.fill").font(.system(size: 9))
                                        Text(matchup).font(.system(size: 10, weight: .medium))
                                    }
                                    .foregroundStyle(accentColor.opacity(0.75))
                                }

                                if let time = prop.time, !time.isEmpty, time != "TBD" {
                                    Text(time)
                                        .font(.system(size: 10, weight: .medium))
                                        .foregroundStyle(.white.opacity(0.62))
                                }
                            }

                            Rectangle().fill(.white.opacity(0.08)).frame(height: 0.5)

                            // Gary's Pick
                            VStack(alignment: .leading, spacing: 10) {
                                Text("GARY'S PICK")
                                    .font(.system(size: 11, weight: .heavy))
                                    .tracking(1.2)
                                    .foregroundStyle(GaryColors.gold)

                                HStack(spacing: 10) {
                                    Text(Formatters.propDisplay(prop.prop, league: prop.effectiveLeague))
                                        .font(.system(size: 14.5, weight: .heavy))
                                        .foregroundStyle(GaryColors.gold)
                                        .lineLimit(2)
                                        .minimumScaleFactor(0.6)

                                    if let bet = prop.bet {
                                        Text(bet.uppercased())
                                            .font(.system(size: 13, weight: .heavy))
                                            .foregroundStyle(betColor)
                                            .padding(.horizontal, 12)
                                            .padding(.vertical, 5)
                                            .background(betColor.opacity(0.12))
                                            .clipShape(Capsule())
                                    }

                                    Spacer()
                                }

                                // EV
                                if let ev = Formatters.computeEV(confidence: prop.confidence, american: prop.odds) {
                                    HStack(spacing: 4) {
                                        Text("EV:")
                                            .foregroundStyle(.white.opacity(0.62))
                                        Text(String(format: "+%.1f%%", ev))
                                            .foregroundStyle(.green)
                                    }
                                    .font(.system(size: 11, weight: .bold))
                                }

                                // Confidence
                                VStack(alignment: .leading, spacing: 4) {
                                    HStack {
                                        Image(systemName: "chart.line.uptrend.xyaxis").font(.system(size: 9))
                                        Text("Confidence").font(.system(size: 9, weight: .medium))
                                        Spacer()
                                    }
                                    .foregroundStyle(.white.opacity(0.62))

                                    GeometryReader { geo in
                                        ZStack(alignment: .leading) {
                                            RoundedRectangle(cornerRadius: 2)
                                                .fill(accentColor.opacity(0.12))
                                            RoundedRectangle(cornerRadius: 2)
                                                .fill(accentColor)
                                                .frame(width: geo.size.width * CGFloat(prop.confidence ?? 0))
                                        }
                                    }
                                    .frame(height: 4)
                                }
                            }
                        }
                        .padding(16)
                        .background(
                            ZStack {
                                RoundedRectangle(cornerRadius: 4)
                                    .fill(Color(hex: "#1C1A1A"))
                                RoundedRectangle(cornerRadius: 4)
                                    .fill(GaryColors.gold.opacity(0.035))
                                RoundedRectangle(cornerRadius: 4)
                                    .stroke(GaryColors.gold.opacity(0.15), lineWidth: 0.5)
                            }
                        )

                        // Divider
                        Rectangle().fill(GaryColors.gold.opacity(0.06)).frame(height: 0.5)

                        // Key Stats
                        if let keyStats = prop.key_stats, !keyStats.isEmpty {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("KEY STATS")
                                    .font(.system(size: 11, weight: .heavy))
                                    .tracking(1.2)
                                    .foregroundStyle(accentColor)

                                ForEach(keyStats, id: \.self) { stat in
                                    HStack(alignment: .top, spacing: 8) {
                                        Circle()
                                            .fill(accentColor)
                                            .frame(width: 5, height: 5)
                                            .padding(.top, 7)
                                        Text(stat)
                                            .font(.system(size: 15))
                                            .foregroundStyle(.white.opacity(0.88))
                                            .lineSpacing(3)
                                    }
                                }
                            }

                            Rectangle().fill(.white.opacity(0.06)).frame(height: 0.5)
                        }

                        // Gary's Take (Analysis)
                        if let analysis = prop.analysis, !analysis.isEmpty {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("GARY'S TAKE")
                                    .font(.system(size: 11, weight: .heavy))
                                    .tracking(1.2)
                                    .foregroundStyle(accentColor)

                                VStack(alignment: .leading, spacing: 12) {
                                    ForEach(Array(cleanAnalysis(analysis).enumerated()), id: \.offset) { _, para in
                                        Text(para)
                                            .font(.system(size: 13))
                                            .foregroundStyle(.white.opacity(0.88))
                                            .lineSpacing(4)
                                            .fixedSize(horizontal: false, vertical: true)
                                    }
                                }
                                .padding(14)
                                .background(
                                    RoundedRectangle(cornerRadius: 10)
                                        .fill(.white.opacity(0.03))
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 10)
                                                .stroke(accentColor.opacity(0.15), lineWidth: 0.5)
                                        )
                                )
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 14)
                    .padding(.bottom, 30)
                }
            }
            .background(
                ZStack {
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .fill(Color(hex: "#1C1A1A"))
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .fill(GaryColors.gold.opacity(0.035))
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .stroke(GaryColors.gold.opacity(0.25), lineWidth: 0.8)
                }
                    .shadow(color: .black.opacity(0.45), radius: 24, y: 8)
                    .shadow(color: .black.opacity(0.72), radius: 26, y: 12)
            )
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            .padding(.horizontal, 16)
            .padding(.vertical, 50)
        }
    }
}
