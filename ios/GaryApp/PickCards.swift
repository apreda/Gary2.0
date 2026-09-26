// PickCards.swift — Pick cards.

import SwiftUI
import Combine
import Charts
import WebKit
import SafariServices
import StoreKit

// MARK: - Pick Text Helper (shared spread-sign fix)

extension GaryPick {
    /// Formatted pick text with spread sign correction from the elected server line.
    var formattedPickParts: (pick: String, odds: String) {
        var parts = Formatters.splitPickAndOdds(self.pick, league: self.league)
        // The backend has already elected the authoritative best line and
        // stores it in `spread`. A raw book row may be an outlier or even cross
        // zero, so it is only a compatibility fallback for historical rows.
        if let pickType = self.type, pickType == "spread",
           let displaySpread = self.spread ?? self.sportsbook_odds?.compactMap({ $0.spread }).first {
            var text = parts.0
            if let regex = try? NSRegularExpression(pattern: #"([+-]?)(\d{1,2}\.?\d*)\s*$"#),
               let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
               let signRange = Range(match.range(at: 1), in: text),
               let fullRange = Range(match.range(at: 0), in: text) {
                let sign = String(text[signRange])
                let correctSign = displaySpread >= 0 ? "+" : "-"
                if sign.isEmpty || sign != correctSign {
                    let num = abs(displaySpread)
                    let s = num.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(num)) : String(num)
                    text = text.replacingCharacters(in: fullRange, with: "\(correctSign)\(s)")
                    parts = (text, parts.1)
                }
            }
        }
        return parts
    }
}

// MARK: - Compact Pick Row (Scoreboard-style)

// MARK: - Members Only reveal system
//
// A new Winners pick sits SEALED in the rail — black members card, chrome bear,
// live countdown to first pitch. The owner taps to flip it open into the gold
// bar (haptic; revealed state persists per pick, per device). Locked non-payers
// see a card that carries ZERO pick data — the old blurred-real-card could leak
// the pick through a light blur; this cannot.

/// Per-device ledger of which picks the user has unwrapped.
enum RevealedPicks {
    private static let key = "revealedPickIds"
    private static var cache: Set<String> = Set(UserDefaults.standard.stringArray(forKey: key) ?? [])
    /// Tour harness: wipe the ledger so sealed faces can be re-reviewed.
    static func clearAll() {
        cache.removeAll()
        UserDefaults.standard.removeObject(forKey: key)
    }
}

/// Per-device ledger of which WON picks already played their celebration —
/// the confetti + count-up fire exactly once per pick.
enum CelebratedWins {
    private static let key = "celebratedPickIds"
    private static var cache: Set<String> = Set(UserDefaults.standard.stringArray(forKey: key) ?? [])
    static func contains(_ id: String) -> Bool { cache.contains(id) }
    static func mark(_ id: String) {
        guard !cache.contains(id) else { return }
        cache.insert(id)
        var arr = UserDefaults.standard.stringArray(forKey: key) ?? []
        arr.append(id)
        if arr.count > 400 { arr.removeFirst(arr.count - 400) }
        UserDefaults.standard.set(arr, forKey: key)
    }
    /// Tour harness: wipe the ledger so the win celebration can re-fire.
    static func clearAll() {
        cache.removeAll()
        UserDefaults.standard.removeObject(forKey: key)
    }
}

// MARK: - Reveal Ceremony (Jul 3 2026) — the production pack opening
//
// The six beats every FUT-class reveal runs: anticipation (pack pulses under a
// ray field) → interaction (HOLD to tear, haptic ticks) → flash frame (hides
// the pack→card swap) → particle burst (CAEmitterLayer sparks + confetti) →
// the card entering under a specular sweep → land. All native — no engine,
// no dependencies.

struct CrackShape: Shape {
    func path(in rect: CGRect) -> Path {
        // Single jagged fracture, top to bottom — no fork (founder call, Jul 4:
        // the branch off the main line, even fixed, wasn't wanted at all).
        let main: [(CGFloat, CGFloat)] = [(252, 0), (240, 38), (258, 72), (234, 116), (250, 158), (230, 200), (240, 232)]
        func pt(_ p: (CGFloat, CGFloat)) -> CGPoint {
            CGPoint(x: p.0 / 346 * rect.width, y: p.1 / 232 * rect.height)
        }
        var path = Path()
        path.move(to: pt(main[0]))
        for p in main.dropFirst() { path.addLine(to: pt(p)) }
        return path
    }
}

/// The Home game pop-up is a condensed view: its pick reads on one row,
/// "TENNESSEE +5.5", instead of the team over the bet (founder, Sep 26 2026:
/// "it doesn't need to drop down since that view is just a little bit
/// condensed"). Every other card keeps the stacked headline.
private struct PickHeroOneLineKey: EnvironmentKey { static let defaultValue = false }
extension EnvironmentValues {
    var pickHeroOneLine: Bool {
        get { self[PickHeroOneLineKey.self] }
        set { self[PickHeroOneLineKey.self] = newValue }
    }
}

struct CompactPickRow: View {
    let pick: GaryPick
    var gameResult: String? = nil
    var finalScore: String? = nil   // settled cards: shown in place of GARY'S LEAN
    var showSportBadge: Bool = false
    /// Game pages carry the score in the page hero (LiveScoreStrip), so their
    /// cards keep the plain start time in the slot. Everywhere else stays state-aware.
    var liveInSlot: Bool = true
    /// Exact daily-slate mirror used while live_scores catches up. Game pages
    /// supply this only from the same league + provider game id.
    var interruptionLabel: String? = nil
    /// Billfold's recent picks are static (no flip) — they hide the affordance.
    var showTakeAffordance: Bool = true
    /// Overrides the eyebrow label (e.g. "FREE PICK" on the Tonight page).
    var eyebrowOverride: String? = nil
    /// Winners keeps the start time visible even on settled cards (it sorts by start time).
    var alwaysShowStartTime: Bool = false
    /// When set, the card renders at this EXACT height so every pick card in a
    /// rail/list is the same size regardless of headline length or footer (the
    /// flip-card wrappers pass it; Billfold/share leave it nil for natural size).
    var fixedHeight: CGFloat? = nil
    /// App-wide uniform headline-card height — game and prop cards share it.
    static let uniformHeight: CGFloat = 232

    /// System review prompt — fired once per app version right after a pick CASHES (see ReviewPrompt).
    @Environment(\.requestReview) private var requestReview
    /// The Home game pop-up reads the pick on one row (see PickHeroOneLineKey).
    @Environment(\.pickHeroOneLine) private var heroOneLine

    private var sport: Sport { Sport.from(league: pick.league) }
    private var accentColor: Color { sport.accentColor }
    /// Accent for the odds chip in the meta line — MLB reads on its grass green,
    /// every other sport on its own accent.
    private var metaAccent: Color { (sport == .mlb || sport == .mlbHR) ? GaryColors.mlbGrass : accentColor }

    // 21B-S palette switches — every tint the card paints resolves through these,
    // so the gold finish is dark-ink everywhere without per-line ternaries.
    private var eyebrowTint: Color { GaryColors.gold}
    private var heroTint: Color { .white}
    private var leagueTint: Color { metaAccent}
    /// Team name reads gold (founder call, Jul 4).
    private var metaBodyTint: Color { GaryColors.gold}
    private var metaDotTint: Color { .white.opacity(0.4)}
    private var oddsTint: Color { GaryColors.gold}
    private var footerTint: Color { GaryColors.gold}
    private var dividerTint: Color { .white.opacity(0.12)}
    private var shareTint: Color { .white.opacity(0.5)}
    private var chevronTint: Color { GaryColors.heroAccent.opacity(0.7)}

    /// Struck-green — the win color that belongs on gold (traffic-green vanishes).
    private static let goldWinGreen = Color(hex: "#1E6B33")
    /// Footer verdict color on settled cards: win green / lostTint / push gold —
    /// with gold-dialect values on the premium bar.
    private var settledFooterTint: Color {
        guard let v = displayResult else { return footerTint }
        switch v {
        case "won": return GaryColors.win
        case "lost": return GaryColors.lostTint
        default: return GaryColors.gold
        }
    }
    /// "FINAL · CIN 7 · MIL 2" → "✓ CASHED · CIN 7 · MIL 2" on settled cards —
    /// with no stamp anywhere, the footer line IS the verdict.
    private func verdictFooterLine(_ line: String) -> String {
        guard let v = displayResult else { return line }
        // The gold bar's corner already carries the big struck check on a win —
        // its footer says CASHED without repeating the mark.
        let word = v == "won" ? "✓ CASHED" : (v == "push" ? "PUSH" : "LOST")
        if line.hasPrefix("FINAL · ") { return word + " · " + line.dropFirst("FINAL · ".count) }
        if line == "FINAL" { return word }
        return line
    }

    private var awayName: String { Formatters.shortTeamName(pick.awayTeam, league: pick.league) }
    private var homeName: String { Formatters.shortTeamName(pick.homeTeam, league: pick.league) }
    private var isNCAAF: Bool { (pick.league ?? "").uppercased() == "NCAAF" }
    private var isCFP: Bool { pick.isCFP }
    private var pickParts: (pick: String, odds: String) { pick.formattedPickParts }

    /// Either side's abbreviation for the compact meta row (long-tag cards).
    /// ESPN college codes take priority over legacy stored display codes.
    private func metaTeamAbbrev(homeSide: Bool) -> String {
        scoreboardTeamAbbreviation(homeSide ? pick.homeTeam : pick.awayTeam,
                                   stored: homeSide ? pick.homeTeamAbbreviation : pick.awayTeamAbbreviation,
                                   league: pick.league)
    }

    /// The picked team uses the same league-aware code as the matchup.
    private func teamAbbrev(_ shortName: String) -> String {
        let fullName = homeIsPicked ? pick.homeTeam : pick.awayTeam
        let stored = homeIsPicked ? pick.homeTeamAbbreviation : pick.awayTeamAbbreviation
        return scoreboardTeamAbbreviation(fullName ?? shortName, stored: stored, league: pick.league)
    }

    private var interruptionOverride: String? {
        guard let value = interruptionLabel?.trimmingCharacters(in: .whitespacesAndNewlines),
              !value.isEmpty else { return nil }
        return value.uppercased()
    }
    private var resolvedResult: String? {
        // The exact slate row may see the interruption before live_scores. It
        // must suppress a stale matchup-keyed grade during that short window.
        if interruptionOverride != nil { return nil }
        // Doubleheader guard: gameResult is MATCHUP-keyed, so a pick whose game shares a matchup
        // with another (a doubleheader) can borrow the OTHER game's graded result. If THIS pick's
        // own game (by game_id) is still live, suppress it so the card shows live, not a false FINAL.
        if let gid = pick.game_id,
           let status = liveCache.status(forGameId: gid, league: pick.league),
           status.isLive || status.isInterrupted { return nil }
        guard let result = gameResult?.lowercased(), !result.isEmpty else { return nil }
        return result
    }

    private var significanceTag: String? {
        // Skip generic defaults — only show meaningful game significance
        let genericLabels = ["regular season", "conference play", "regular season game"]
        if let cleaned = pick.shortGameSignificance, cleaned.count < 32 {
            if !genericLabels.contains(cleaned.lowercased()) {
                return cleaned.uppercased()
            }
        }
        if let cleaned = pick.shortTournamentContext, cleaned.count < 28 {
            if !genericLabels.contains(cleaned.lowercased()) {
                return cleaned.uppercased()
            }
        }
        // Regular games just say the sport ("MLB") — the tag only earns words
        // when the game is special (playoffs, finals, tournament rounds).
        return (pick.league ?? "").uppercased()
    }

    private var formattedTime: String {
        guard let time = pick.displayTime else { return "" }
        return Formatters.formatCommenceTime(time)
    }

    /// Live/final state for THIS matchup (shared cache; nil when scheduled
    /// or unknown). Only consulted when the card has no settled result.
    @ObservedObject private var liveCache = LiveScoreCache.shared
    /// One-tap share from the card FRONT — renders the Stack Row share card
    /// (story + square) and presents the system sheet.
    @State private var shareItem: PickShareItem? = nil
    @State private var showPickInfo = false
    private var liveStatus: LiveScore? {
        guard liveInSlot, resolvedResult == nil else { return nil }
        if let gameId = pick.game_id {
            return liveCache.status(forGameId: gameId, league: pick.league)
        }
        let legacy = liveCache.status(forMatchup: "\(pick.awayTeam ?? "") @ \(pick.homeTeam ?? "")")
        return legacy?.isInterrupted == true ? nil : legacy
    }

    /// FINAL board for this matchup with no stored grade yet — feeds the
    /// client-side verdict so results land the moment the game ends, not the
    /// next morning. Deliberately ignores liveInSlot: a verdict is the card's
    /// business everywhere, score-in-slot chrome is not.
    private var liveFinal: LiveScore? {
        guard resolvedResult == nil else { return nil }
        let ls: LiveScore?
        if let gameId = pick.game_id {
            ls = liveCache.status(forGameId: gameId, league: pick.league)
        } else {
            let legacy = liveCache.status(forMatchup: "\(pick.awayTeam ?? "") @ \(pick.homeTeam ?? "")")
            ls = legacy?.isInterrupted == true ? nil : legacy
        }
        return (ls?.isFinal == true) ? ls : nil
    }
    private var liveGraded: String? {
        guard let ls = liveFinal,
              let s = orientedFinalScores(ls, awayTeam: pick.awayTeam, homeTeam: pick.homeTeam) else { return nil }
        return liveGradeGamePick(pickText: pickParts.pick, betType: pick.type ?? "",
                                 awayPicked: awayIsPicked, homePicked: homeIsPicked,
                                 away: s.away, home: s.home)
    }
    /// True once this game's start time has passed — an UPCOMING game can't be graded.
    private var gameHasStarted: Bool {
        guard let iso = pick.commence_time, let d = parseISO8601(iso) else { return true }
        return d <= Date()
    }
    /// Stored grade first (authoritative); else the live verdict on a FINAL board.
    /// Gated on the game having STARTED: the result/score maps are matchup-keyed, so a
    /// REPEATED matchup (same teams the next day — e.g. Padres@Cubs today vs last night)
    /// would otherwise leak yesterday's LOST/FINAL onto today's not-yet-played game.
    private var displayResult: String? {
        guard gameHasStarted else { return nil }
        return resolvedResult ?? liveGraded
    }

    // Which side did Gary take? Match the pick string against the short team
    // names so the matchup hero can brighten the picked team. Falls back to
    // "neither bright" for totals (Over/Under) where no single team is backed.
    private var pickedSideLower: String {
        pickParts.pick.lowercased()
    }
    /// Short mascot first (the common case), then any distinctive word of the
    /// full name — display truncation can strip the mascot from the pick text
    /// ("Vegas Golden Knights ML" arrives as "Vegas Golden ML", "Columbus Blue
    /// Jackets ML" as "Columbus ML"), so the mascot alone isn't reliable.
    private func sideIsPicked(full: String?, short: String, otherFull: String?) -> Bool {
        let p = pickedSideLower
        if !short.isEmpty, p.contains(short.lowercased()) { return true }
        guard let full, !full.isEmpty else { return false }
        let otherWords = Set((otherFull ?? "").lowercased().split(separator: " ").map(String.init))
        return full.lowercased().split(separator: " ").map(String.init)
            .contains { $0.count >= 4 && !otherWords.contains($0) && p.contains($0) }
    }
    private var awayIsPicked: Bool {
        sideIsPicked(full: pick.awayTeam, short: awayName, otherFull: pick.homeTeam)
    }
    private var homeIsPicked: Bool {
        sideIsPicked(full: pick.homeTeam, short: homeName, otherFull: pick.awayTeam)
    }

    /// The number a college team wears next to its name: a playoff SEED when
    /// the game is a CFP game, otherwise its AP poll rank (founder, Sep 3
    /// 2026: "for the team names on the Pick cards we could just put the
    /// ranking next to the team"). Both ride the pick itself — NCAAF ranks are
    /// stamped on the game at pick time, so the number is the poll as it stood
    /// when Gary made the call. Unranked stays bare; nothing is guessed.
    private var awaySeedTag: String? {
        if isCFP, let s = pick.awaySeed { return "#\(s)" }
        return pick.collegeRankings.tag(homeSide: false)
    }
    private var homeSeedTag: String? {
        if isCFP, let s = pick.homeSeed { return "#\(s)" }
        return pick.collegeRankings.tag(homeSide: true)
    }
    private var isRankedMatchup: Bool { awaySeedTag != nil || homeSeedTag != nil }

    // MARK: Headline front (June 11 2026 — THE pick card design, everywhere)
    //
    // The approved share card ("09-headline-mlb-story") IS the in-app card:
    // gold eyebrow + bear, the pick as stacked display type, sport-accent
    // league token leading one meta line, share/tier/take footer. Settled
    // picks wear the diagonal CASHED/LOST stamp, same as the export.

    /// Always "GARY'S PICK" app-wide, unless a caller overrides it (the Tonight
    /// page passes "FREE PICK", so it needs no separate section label).
    private var eyebrowLabel: String {
        eyebrowOverride ?? "GARY'S PICK"
    }

    /// Noun for a totals card's second line, by league ("TOTAL RUNS" /
    /// "TOTAL GOALS" / "TOTAL POINTS") so totals carry the same two-line shape
    /// as side picks — every card then measures to one uniform height.
    private var totalNoun: String {
        switch (pick.league ?? "").uppercased() {
        case "MLB": return "RUNS"
        case "NHL", "WC", "EPL": return "GOALS"
        default: return "POINTS"
        }
    }

    /// Hero: the picked team's short name over the bet ("NATIONALS" /
    /// "MONEYLINE", "KNICKS" / "+6.5"). Totals get a matching two-line shape
    /// ("UNDER 3.5" / "TOTAL GOALS") so every card reads at one uniform height.
    private var heroLines: String {
        // Specials ("Schwarber to win the Derby +330") carry a phrase, not
        // team+market grammar — the truncating pick parser cuts them to the
        // first word. Split name / claim by hand: name huge, claim under it.
        if (pick.type ?? "") == "special" {
            var w = (pick.pick ?? "").split(separator: " ").map(String.init)
            w.removeAll { $0.range(of: #"^[+-]?\d{3,}$"#, options: .regularExpression) != nil }
            let raw = w.joined(separator: " ")
            // Name on top, claim below — split at the bet verb ("to win…",
            // "over 8.5 R1 HRs…") so long specials never shrink to one line.
            for verb in [" to ", " over ", " under "] {
                if let r = raw.range(of: verb, options: .caseInsensitive) {
                    let claim = String(raw[r.lowerBound...]).trimmingCharacters(in: .whitespaces)
                    return "\(String(raw[..<r.lowerBound]).uppercased())\n\(claim.uppercased())"
                }
            }
            // No bet verb ("Walker longest HR") — name still leads its own line.
            let parts = raw.split(separator: " ").map(String.init)
            if parts.count >= 3 {
                return "\(parts[0].uppercased())\n\(parts.dropFirst().joined(separator: " ").uppercased())"
            }
            return raw.uppercased()
        }
        var words = pickParts.pick.split(separator: " ").map(String.init)
        // The headline never shows odds or a stray "@" — those belong in the meta line.
        // Strip "@" and any American-odds integer (3+ digits) a malformed/legacy pick
        // string may carry (e.g. "Under 2.5 @ -135"); decimals (handicap/total lines) stay.
        words.removeAll { $0 == "@" || $0.range(of: #"^[+-]?\d{3,}$"#, options: .regularExpression) != nil }
        if let i = words.firstIndex(where: { $0.uppercased() == "ML" }) { words[i] = "MONEYLINE" }
        if (pick.type ?? "").lowercased() == "total" {
            return "\(words.joined(separator: " ").uppercased())\nTOTAL \(totalNoun)"
        }
        guard homeIsPicked || awayIsPicked else {
            // Team-word matching missed — the pick text names the CITY
            // ("Colorado Moneyline") while the roster field stores the
            // MASCOT ("Rockies"), so no word is shared and sideIsPicked
            // can't confirm either side. Split first word / rest anyway so
            // the hero still gets its two-line shape (founder, Aug 4: "how
            // come the word Moneyline didn't drop down" — it silently fell
            // back to one line here instead of matching Tigers/Diamondbacks'
            // behavior). Only a true single-word pick stays on one line.
            guard words.count >= 2 else { return words.joined(separator: " ").uppercased() }
            return "\(words[0].uppercased())\n\(words[1...].joined(separator: " ").uppercased())"
        }
        let pickedShort = homeIsPicked ? homeName : awayName
        let pickedFull = homeIsPicked ? (pick.homeTeam ?? "") : (pick.awayTeam ?? "")
        var teamWords = Set(pickedFull.lowercased().split(separator: " ").map(String.init))
        teamWords.formUnion(pickedShort.lowercased().split(separator: " ").map(String.init))
        var lead = 0
        while lead < words.count, teamWords.contains(words[lead].lowercased()) { lead += 1 }
        let bet = words[lead...].joined(separator: " ")
        let pickedRank = isNCAAF ? (homeIsPicked ? homeSeedTag : awaySeedTag) : nil
        let headlineTeam = [pickedRank, pickedShort.uppercased()].compactMap { $0 }.joined(separator: " ")
        return bet.isEmpty ? headlineTeam : "\(headlineTeam)\n\(bet.uppercased())"
    }

    private var heroFontSize: CGFloat { 52}
    /// Tight stacked leading (the mock's line-height .9) — all-caps display type
    /// has no descenders, so the lines pull together safely.
    private var heroLineSpacing: CGFloat { -18}
    // Optical spacing (Jul 3 spacing pass): Barlow smuggles ~0.22em of invisible
    // leading above the caps and ~0.25em below the baseline. These pads target a
    // TRUE 12pt gap eyebrow→hero and hero→meta at ANY size or finish — no more
    // hand-tuned magic numbers drifting when the type scale changes.
    private var heroTopPad: CGFloat { 12 - 0.22 * heroFontSize }
    private var metaTopPad: CGFloat { 12 - 0.25 * heroFontSize }

    /// Meta slot after the league token — opponent + time/live/final + odds.
    /// State-aware: live games show the live line, settled show the score.
    private var metaLine: String {
        if isNCAAF { return ncaafOpponentLine }
        // Specials: the event name already leads the page strip — repeating
        // "HR Derby @ Philly" here just ellipsizes the price off the row.
        if (pick.type ?? "") == "special" { return "" }
        // A long tag ("NFL PRESEASON", playoff labels) squeezes this row until
        // a full nickname has to truncate — the Aug 24 sweep caught
        // "vs Seaha…". When the tag carries words beyond the bare league, the
        // matchup rides abbreviations instead (the board's own register), and
        // the price keeps its fixed slot either way. No ellipsis, ever.
        // A ranked college game rides abbreviations too: the number is two more
        // characters on each side, and this row scales rather than truncates.
        let compact = significanceTag != (pick.league ?? "").uppercased() || isRankedMatchup
        let awayLabel = compact ? metaTeamAbbrev(homeSide: false) : awayName
        let homeLabel = compact ? metaTeamAbbrev(homeSide: true) : homeName
        func ranked(_ tag: String?, _ label: String) -> String {
            guard let tag else { return label }
            return "\(tag) \(label)"
        }
        // When either side is ranked, BOTH sides print — the "vs opponent"
        // short form would hide the number on the team Gary actually picked.
        let opponent = isRankedMatchup
            ? "\(ranked(awaySeedTag, awayLabel)) @ \(ranked(homeSeedTag, homeLabel))"
            : homeIsPicked ? "vs \(awayLabel)"
            : awayIsPicked ? "@ \(homeLabel)"
            : "\(awayLabel) @ \(homeLabel)"
        let parts = [opponent]
        // The final score + LIVE/FINAL state now ride the FOOTER strip on every card
        // (user call, Jun 18) — meta keeps just the matchup; odds render after it.
        // Start time moved to the eyebrow row (frontTime); meta keeps matchup + odds.
        // Odds render separately in the sport's accent color (see body) — not appended here.
        return parts.joined(separator: " · ")
    }

    // NCAAF uses the same card frame and opponent line as other sports.
    // Its picked rank lives in the headline; its opponent rank stays here.
    private var ncaafOpponentLine: String {
        func label(home: Bool) -> String {
            let rank = home ? homeSeedTag : awaySeedTag
            let name = isRankedMatchup ? metaTeamAbbrev(homeSide: home) : (home ? homeName : awayName)
            return [rank, name].compactMap { $0 }.joined(separator: " ")
        }
        if homeIsPicked { return "vs \(label(home: false))" }
        if awayIsPicked { return "@ \(label(home: true))" }
        return "\(label(home: false)) @ \(label(home: true))"
    }

    /// Footer live line — "LIVE · SD 4 · PHI 6 · COVERING": teams + score + Gary's
    /// live standing, colored green/red by `liveToneColor`.
    private var liveFooterText: String? {
        // Graded/settled card: show the FINAL SCORE in the footer (user call, Jun 18
        // — "FINAL · CAN 3 · QAT 1" beside the CASHED stamp), from the live board
        // first, then the stored final score; bare "FINAL" only when neither carries
        // a score. This is the one place the final state lives on every card now.
        if displayResult != nil {
            let mk = "\(pick.awayTeam ?? "") @ \(pick.homeTeam ?? "")"
            // Explicit live score columns can name teams even when provider
            // abbreviations are absent. Archived cache strings cannot.
            if let ls = liveFinal, let a = ls.away_score, let h = ls.home_score {
                if ls.away_abbr != nil, ls.home_abbr != nil { return liveLineRich(ls, label: "FINAL") }
                return "FINAL · \(finalScoreLine(matchup: mk, awayScore: a, homeScore: h, league: pick.league))"
            }
            if let fs = finalScore, !fs.isEmpty { return "FINAL · \(fs)" }
            if let g = liveCache.gradedScore(forMatchup: mk) { return "FINAL · \(g)" }
            return "FINAL"
        }
        guard let ls = liveStatus else { return interruptionOverride }
        if ls.isLive { return liveLineRich(ls, label: "LIVE") }
        if ls.isFinal { return liveLineRich(ls, label: "FINAL") }
        if let interruption = ls.interruptionLabel { return interruption }
        return interruptionOverride
    }

    /// Start time, shown on the eyebrow row pre-game. Live/settled cards carry
    /// their state in the meta line / footer instead, so this returns nil for them.
    private var frontTime: String? {
        // Pre-game shows the start time. Settled cards normally hide it, but the Winners
        // page (alwaysShowStartTime) keeps it visible since that page sorts by start time.
        if displayResult != nil { return alwaysShowStartTime ? (formattedTime.isEmpty ? nil : formattedTime) : nil }
        if interruptionOverride != nil { return nil }
        if let live = liveStatus, live.isLive || live.isFinal || live.isInterrupted { return nil }
        return formattedTime.isEmpty ? nil : formattedTime
    }

    var body: some View {
        ZStack {
            // D3 ghost verdict — a giant serif check/cross floating behind the
            // content (win green at 14%, loss red at 7% — the loss whispers).
            // The card's clipShape contains the overflow. The METAL cards carry
            // the same giant check on a WIN (founder call, Jul 4 — the free-card
            // look), struck in deep win-green ink; a premium LOSS keeps the
            // crack fracture instead, no ghost.
            // A WIN celebrates with the ghost check. A LOSS carries the crack
            // and nothing else on EVERY finish now (founder, Aug 6: "no X
            // please just the crack") — the ✕ behind a fracture was two marks
            // telling one story.
            if displayResult == "won" {
                Text("✓")
                    .font(.system(size: 200, weight: .regular, design: .serif))
                    .foregroundStyle(GaryColors.win.opacity(0.14))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                    .offset(x: 12, y: -14)
                    .allowsHitTesting(false)
            }

            VStack(alignment: .leading, spacing: 0) {
                PickCardHeader(title: eyebrowLabel, tint: eyebrowTint, scale: 1,
                               showsMark: displayResult == nil)

                // Balanced hero (founder, Jul 5): a one-word pick like DRAW
                // hugged the eyebrow with all the slack pooled below — equal
                // flexible space above and below centers the hero in its band.
                Spacer(minLength: 0)

                // Skyscraper hero: one Text per line so tight (negative) leading is
                // possible in SwiftUI and each line scales independently — the team
                // name shrinks to fit, the call stays at full size.
                // Leading does NOT scale with pf — at 87pt the scaled −28 made
                // the lines kiss; −24 keeps the stack tight without contact.
                VStack(alignment: .leading, spacing: heroLineSpacing) {
                    ForEach(Array((heroOneLine ? [heroLines.replacingOccurrences(of: "\n", with: " ")]
                                                : heroLines.components(separatedBy: "\n")).enumerated()), id: \.offset) { _, line in
                        (isNCAAF ? CollegeRankText.label(line, size: heroFontSize, hero: true) : Text(line))
                            .font(GaryFonts.display(heroFontSize))
                            .accessibilityLabel(line)
                            .lineLimit(1)
                            .minimumScaleFactor(0.45)
                    }
                }
                    .foregroundStyle(heroTint)
                    // Stamped-in-metal read on the gold bar: a hairline of light kicked
                    // off the bottom edge of the dark letters.
                    .shadow(color: .clear, radius: 0, y: 1)
                    // Keep the ticket readable after a loss; the verdict and
                    // fracture already distinguish the result.
                    .padding(.top, heroTopPad)
                    // A WON premium bar carries the payout block down its right
                    // side — reserve that column so long picks wrap clear of the
                    // money. Everything else rides full width (the D3 ghost and
                    // the corner bear are gone/behind the type).

                Spacer(minLength: 0)

                HStack(alignment: .center, spacing: 8) {
                    Text(isNCAAF ? "NCAAF" : (significanceTag ?? (pick.league ?? "").uppercased()))
                        .font(GaryFonts.mono(11, bold: true)).tracking(1.2)
                        .foregroundStyle(leagueTint)
                        .lineLimit(1)
                        .layoutPriority(1)
                    // Keep the full betting price visible when opponent names are long.
                    (isNCAAF ? CollegeRankText.label(metaLine, size: 13.5) : Text(metaLine))
                        .foregroundColor(metaBodyTint)
                        .font(GaryFonts.text(13.5, .medium))
                        .accessibilityLabel(metaLine)
                        .lineLimit(1)
                        .minimumScaleFactor(0.45)
                    if !pickParts.odds.isEmpty {
                        (Text("· ").foregroundColor(metaDotTint)
                            + Text(pickParts.odds).foregroundColor(oddsTint))
                            .font(GaryFonts.text(13.5, .medium))
                            .lineLimit(1)
                            .fixedSize()
                            .layoutPriority(2)
                    }
                    Spacer(minLength: 4)
                    // The streak button (founder, Sep 21 2026; the form guide
                    // Sep 24): right side, quiet; the fan's count and this
                    // pick's box; tap to log it as a streak bet.
                    if showTakeAffordance { StreakButton(ticket: .game(pick), idleTint: shareTint) }
                    // ⓘ — the how-it-works pop (drop, grading, flat-$100 money).
                    Button { showPickInfo = true } label: {
                        Image(systemName: "info.circle")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(shareTint)
                            .frame(width: 22, height: 22)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("How the picks work")
                    // Share moved up here (compact) — frees the footer for the live line.
                    Button {
                        let images = renderPickShareImages(pick: pick, gameResult: displayResult)
                        if !images.isEmpty { shareItem = PickShareItem(images: images) }
                    } label: {
                        Image(systemName: "square.and.arrow.up")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(shareTint)
                            .frame(width: 26, height: 22)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Share this pick")
                }
                .padding(.top, metaTopPad)
                .sheet(isPresented: $showPickInfo) { PickInfoSheet() }

                // Footer — the live line while the game runs (teams + score + COVERING/
                // TRAILING in green/red), with a tap-to-flip chevron on the right. Share
                // moved up to the meta line; "Gary's Take" is now just the chevron.
                // Footer renders when there's a tap-to-flip affordance OR a settled/live
                // line to show — so Billfold receipts (showTakeAffordance:false) still get
                // the "FINAL · score" line, just without the chevron.
                if showTakeAffordance || liveFooterText != nil {
                    Rectangle()
                        .fill(dividerTint)
                        .frame(height: 1)
                        .padding(.vertical, 10)

                    HStack(alignment: .bottom, spacing: 10) {
                        VStack(alignment: .leading, spacing: 4) {
                            if let live = liveFooterText {
                                // Settled dark cards: the footer line carries the verdict
                                // ("✓ CASHED · CIN 7 · MIL 2") in win-green / lostTint —
                                // full strength even when the rest of a lost card dims.
                                Text(verdictFooterLine(live))
                                    .font(GaryFonts.mono(11, bold: true)).tracking(0.5)
                                    .foregroundStyle(settledFooterTint)
                                    .fixedSize(horizontal: false, vertical: true)
                            } else if let t = frontTime {
                                // Pre-game: start time anchors the footer's left corner, opposite the chevron.
                                Text(t)
                                    .font(GaryFonts.mono(11, bold: true)).tracking(0.5)
                                    .foregroundStyle(footerTint)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            if isNCAAF, let tag = significanceTag, tag != "NCAAF" {
                                Text(tag)
                                    .font(GaryFonts.mono(10, bold: true)).tracking(0.5)
                                    .foregroundStyle(leagueTint)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                        Spacer(minLength: 0)
                        if showTakeAffordance {
                            Image(systemName: "chevron.right")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(chevronTint)
                        }
                    }
                }
            }
            .padding(18)

            // (Corner bear retired Jul 4 — the mark lives in the eyebrow row on
            // every card now, so the top-right corner stays clean everywhere.)

            // Brand mark on the bar (A/B, Jul 3): micro-engraved GARY A.I. text
            // or the crest badge — top-right corner, ceded to the win block.

            // GOLD WIN (X1+X4): struck green check + payout counting up own the
            // eyebrow row's right corner — the hero starts a row lower, so the
            // pick words can never collide with the money.
            // The corner ✓ retired Jul 4 — the giant ghost check behind the type
            // (free-card look) carries the win now; the corner keeps the money.

            // DARK LOSS carries the same fracture (founder, Aug 6: the Picks
            // page should crack like Winners does) — but the card never dims
            // here, so the crack is the whole story rather than a companion to
            // a mute. Struck in ink with a loss-red kick, the dark-card
            // inversion of the gold bar's light one.
            if displayResult == "lost" {
                CrackShape()
                    .stroke(Color.black.opacity(0.75), lineWidth: 2)
                    .allowsHitTesting(false)
                CrackShape()
                    .stroke(GaryColors.loss.opacity(0.38), lineWidth: 1)
                    .offset(x: 2)
                    .allowsHitTesting(false)
            }

            // One-shot confetti for a fresh gold win (bar palette, self-clearing).
        }
        // Uniform card height regardless of headline length / footer presence.
        // A FIXED height (not a floor) when the flip wrapper passes one — a
        // minHeight let 2-line heroes stay taller than 1-line ones (the bug).
        .frame(minHeight: fixedHeight == nil ? 210 : nil)
        .frame(height: fixedHeight)
        // Contains the oversized D3 ghost mark; background (and its shadow)
        // draws after this, so the card's drop shadow is unaffected.
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .background(
            Group {
                PickCardBackground()
            }
        )
        .onAppear {
            LiveScoreCache.shared.startIfNeeded()
            // The user is looking at one of their picks that CASHED — the highest-sentiment moment.
            // Ask for a review. Heavily gated (once per app version, >=3 sessions) + Apple-throttled
            // to ~3/365 days, so it can never nag even though winning cards appear all over the app.
            if displayResult == "won", ReviewPrompt.shouldRequestAfterWin() { requestReview() }
        }
        .sheet(item: $shareItem) { ActivityShareSheet(items: $0.images) }
    }
}
