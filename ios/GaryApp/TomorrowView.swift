// TomorrowView.swift — Tomorrow View (the look-ahead board).
// Split out of Views.swift on Sep 1 2026 (the 28K-line monolith); pure move,
// no behavior change. Section boundaries follow the original MARK headers.

import SwiftUI
import Combine
import Charts
import WebKit
import SafariServices
import StoreKit

// MARK: - Tomorrow View (the "TOMORROW" Home state — the look-ahead board)
//
// The C1plus mock rebuilt on the app's real components/spacing: a countdown
// hero, big-games-to-watch, the full scoreboard, and a by-sport probable-
// starters / key-returns footer grid. Everything is server-precomputed
// (tomorrow_board); the only live work is the 1Hz countdown tick. Rendered as
// the body of the new TOMORROW switcher pill on Home — it is not its own tab,
// so it carries no masthead (Home's GaryPageHeader sits above the switcher).
struct TomorrowView {

    /// sport -> hero eyebrow term, keyed on countdown_sport (uppercased). The
    /// mock's "FIRST PITCH IN" is just the MLB branch; tomorrow it auto-switches
    /// to "KICKOFF IN" if a WC match is the earliest game.
    static func countdownTerm(_ sport: String?) -> String {
        let s = (sport ?? "").uppercased()
        switch s {
        case "MLB":                       return "FIRST PITCH IN"
        case "NFL", "NCAAF":              return "KICKOFF IN"
        case "NBA", "NCAAB":             return "TIP-OFF IN"
        case "NHL":                       return "PUCK DROP IN"
        default:
            if s == "WC" || s.hasPrefix("SOCCER") { return "KICKOFF IN" }
            return "FIRST GAME IN"
        }
    }

    /// Sport-dot legend color: MLB green, WC teal, everything else gold.
    static func sportDotColor(_ league: String?) -> Color {
        switch (league ?? "").uppercased() {
        case "MLB": return Color(hex: "#4FB14F")
        case "WC":  return Color(hex: "#3FB6A8")
        default:    return GaryColors.gold
        }
    }

    /// "7:10 PM ET" from an ISO commence time, in Eastern.
    static func etTime(_ iso: String?, withZone: Bool = true, meridiem: Bool = false) -> String {
        guard let iso, let date = parseISO8601(iso) else { return "—" }
        let f = DateFormatter()
        f.timeZone = TimeZone(identifier: "America/New_York")
        // meridiem = AM/PM but no " ET" suffix (e.g. "9:00 PM"); withZone adds " ET".
        f.dateFormat = (withZone || meridiem) ? "h:mm a" : "h:mm"
        var s = f.string(from: date)
        if withZone { s += " ET" }
        return s
    }

    /// "Saturday, June 27" for tomorrow's slate day (countdown_iso's date, ET).
    static func weekdayLabel(_ iso: String?) -> String {
        guard let iso, let date = parseISO8601(iso) else { return "" }
        let f = DateFormatter()
        f.timeZone = TimeZone(identifier: "America/New_York")
        f.dateFormat = "EEEE, MMMM d"
        return f.string(from: date)
    }

    /// "Saturday" — short weekday for section subs.
    static func weekday(_ iso: String?) -> String {
        guard let iso, let date = parseISO8601(iso) else { return "Tomorrow" }
        let f = DateFormatter()
        f.timeZone = TimeZone(identifier: "America/New_York")
        f.dateFormat = "EEEE"
        return f.string(from: date)
    }

    /// "Sat Jun 27" — the tight date for the countdown hero subtitle.
    static func shortDateLabel(_ iso: String?) -> String {
        guard let iso, let date = parseISO8601(iso) else { return "" }
        let f = DateFormatter()
        f.timeZone = TimeZone(identifier: "America/New_York")
        f.dateFormat = "EEE MMM d"
        return f.string(from: date)
    }

    /// Stable sport order for the by-sport footer groups: MLB, WC, then the rest.
    static func sortedLeagues(_ people: [TomorrowPerson]) -> [String] {
        let order = ["MLB", "WC"]
        let present = Array(Set(people.compactMap { ($0.league ?? "").uppercased() }.filter { !$0.isEmpty }))
        let head = order.filter { present.contains($0) }
        let tail = present.filter { !order.contains($0) }.sorted()
        return head + tail
    }

    /// The Tomorrow body — the scrolling content under the switcher. Lives inside
    /// Home's ScrollView, so it returns a VStack (no ScrollView/background here).
    struct Body: View {
        let board: TomorrowBoard?
        // (Jul 5 redesign: the Hub/Today flag machinery — leagueFilter,
        // include*, dayLabel, liveStatus, the 1Hz ticker — left with its last
        // consumers. Home's TOMORROW tab is the only caller; the page is now
        // static per data refresh, no per-second re-render.)
        /// The active look-ahead tab (Starters · Key Returns · Form · Run
        /// Profile · Weather). The giant inline list overflowed the screen — this
        /// is now a contained tabbed table that scrolls internally.
        @State private var lookAheadTab = 0

        var body: some View {
            VStack(alignment: .leading, spacing: 22) {
                slateHero
                bigGames
                lookAheadTabs
                if let b = board, !b.board.isEmpty { tomorrowBoardSection(b) }
            }
        }

        // ── ① The slate masthead ───────────────────────────────────────────
        // Jul 5 redesign: the giant ticking HH:MM:SS clock is gone (18 hours
        // of second-precision was noise) — the hero is now the DAY: date in
        // the display face, one meta line with the count, first start, and
        // the game that opens the slate.

        private var slateHero: some View {
            let iso = board?.countdown_iso
            let anyLines = board?.any_lines ?? false
            let count = board?.game_count ?? 0
            return VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 7) {
                    BroadcastBar(height: 10)
                    Text("THE SLATE")
                        .font(GaryFonts.accent(11)).tracking(0.6)
                        .foregroundStyle(GaryColors.gold)
                }
                if let iso {
                    Text(TomorrowView.weekdayLabel(iso))
                        .font(GaryFonts.display(34))
                        .foregroundStyle(GaryColors.warmWhite)
                        .lineLimit(1).minimumScaleFactor(0.7)
                        .padding(.top, 6)
                    Text(heroMeta(iso: iso, anyLines: anyLines, count: count))
                        .font(GaryFonts.mono(11, bold: true)).tracking(0.8)
                        .foregroundStyle(.white.opacity(0.66))
                        .lineLimit(1).minimumScaleFactor(0.8)
                        .padding(.top, 8)
                } else if board != nil && count == 0 {
                    // The board POSTED and is legitimately empty (All-Star
                    // break, tournament rest day) — say so. "Posts soon"
                    // here reads as an outage (founder, Jul 12).
                    Text("No games tomorrow")
                        .font(GaryFonts.text(20, .semibold))
                        .foregroundStyle(.white.opacity(0.9))
                        .padding(.top, 8)
                    Text("The league is dark — the board returns with the next slate.")
                        .font(GaryFonts.text(13))
                        .foregroundStyle(.white.opacity(0.6))
                        .padding(.top, 6)
                } else {
                    Text("Tomorrow's board posts soon")
                        .font(GaryFonts.text(20, .semibold))
                        .foregroundStyle(.white.opacity(0.9))
                        .padding(.top, 8)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(18)
            .quantPanel(radius: 18)
            // The gold radial-glow corner from the mock.
            .overlay(alignment: .topTrailing) {
                RadialGradient(colors: [GaryColors.gold.opacity(0.18), .clear],
                               center: .topTrailing, startRadius: 0, endRadius: 150)
                    .frame(width: 200, height: 200)
                    .allowsHitTesting(false)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            .pageGutter()
        }

        /// "10 GAMES · FIRST PITCH 1:05 PM ET · PHI @ KC OPENS" — or the honest
        /// pre-lines state. The start word keys on the opening game's sport.
        private func heroMeta(iso: String, anyLines: Bool, count: Int) -> String {
            let plural = count == 1 ? "GAME" : "GAMES"
            guard anyLines else { return "\(count) \(plural) · LINES OPEN SOON" }
            let startWord = TomorrowView.countdownTerm(board?.countdown_sport)
                .replacingOccurrences(of: " IN", with: "")
            var bits = ["\(count) \(plural)", "\(startWord) \(TomorrowView.etTime(iso))"]
            if let m = board?.countdown_matchup, !m.isEmpty { bits.append("\(m.uppercased()) OPENS") }
            return bits.joined(separator: " · ")
        }

        // ── ② Big games to watch ───────────────────────────────────────────

        @ViewBuilder private var bigGames: some View {
            let games = (board?.big_games ?? []).sorted { $0.rank < $1.rank }.prefix(5)
            if !games.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    HubSectionHeader(eyebrow: "The Marquee", sub: "")
                    VStack(spacing: 0) {
                        ForEach(Array(games.enumerated()), id: \.element.rank) { idx, g in
                            bigGameRow(g, displayRank: idx + 1)
                            if idx < games.count - 1 {
                                Rectangle().fill(Color.white.opacity(0.05)).frame(height: 1)
                            }
                        }
                    }
                    .padding(.vertical, 4)
                    .quantPanel()
                    .pageGutter()
                }
            }
        }

        private func bigGameRow(_ g: TomorrowBigGame, displayRank: Int) -> some View {
            // Both probable starters, "Away vs Home" — gold, mono. MLB only;
            // WC big games leave the pitchers nil → no line. "Undecided" is
            // shown verbatim when a probable is unposted.
            let away = (g.awayPitcher ?? g.pitchers?.away)?.trimmingCharacters(in: .whitespaces)
            let home = (g.homePitcher ?? g.pitchers?.home)?.trimmingCharacters(in: .whitespaces)
            let pitchersLine: String? = {
                guard let a = away, !a.isEmpty, let h = home, !h.isEmpty else { return nil }
                return "\(a) vs \(h)"
            }()
            return HStack(alignment: .top, spacing: 12) {
                Text("\(displayRank)")
                    .font(GaryFonts.display(22))
                    .foregroundStyle(GaryColors.gold)
                    .frame(width: 18, alignment: .leading)
                VStack(alignment: .leading, spacing: 7) {
                    // Top line: the matchup in the display face (left) · time (right).
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text((g.matchup ?? "").uppercased())
                            .font(GaryFonts.display(22))
                            .foregroundStyle(.white.opacity(0.95))
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                        Spacer(minLength: 6)
                        Text(TomorrowView.etTime(g.commence_time, withZone: false, meridiem: true))
                            .font(GaryFonts.mono(12))
                            .foregroundStyle(.white.opacity(0.62))
                    }
                    // Plain-text standing under the matchup — readable (was 9.5/0.55).
                    if let standing = g.standing, !standing.isEmpty {
                        Text(standing)
                            .font(GaryFonts.mono(11))
                            .foregroundStyle(.white.opacity(0.6))
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    // The pitching matchup — the heart of the game. Each starter on its
                    // own readable row: abbr · name · ERA (quality-coloured) · xERA (the
                    // honest regression number, so an elite-looking ERA can't mislead).
                    // MLB only; WC big games have nil pitchers.
                    if pitchersLine != nil, let a = away, let h = home {
                        let bRow = bigGameBoardRow(g)
                        VStack(alignment: .leading, spacing: 5) {
                            pitcherLine(fallback: a, abbr: bRow?.away_abbr,
                                        stat: starterStat(lastName: a, abbr: bRow?.away_abbr))
                            pitcherLine(fallback: h, abbr: bRow?.home_abbr,
                                        stat: starterStat(lastName: h, abbr: bRow?.home_abbr))
                        }
                        .padding(.top, 3)
                    }
                    // Market line — the favourite + total (MLB ML/total · WC ML/goals).
                    if let mkt = bigGameMarket(g) {
                        Text(mkt)
                            .font(GaryFonts.mono(11.5))
                            .foregroundStyle(.white.opacity(0.6))
                            .lineLimit(1).minimumScaleFactor(0.9)
                            .padding(.top, 1)
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
        }

        /// One probable starter — abbr · name · ERA (quality-coloured) · xERA.
        private func pitcherLine(fallback: String, abbr: String?,
                                 stat: (name: String, era: String, xera: String?, color: Color)?) -> some View {
            HStack(spacing: 8) {
                if let ab = abbr, !ab.isEmpty {
                    Text(ab.uppercased())
                        .font(GaryFonts.mono(10.5, bold: true))
                        .foregroundStyle(GaryColors.gold.opacity(0.85))
                        .frame(width: 34, alignment: .leading)
                }
                Text(stat?.name ?? fallback)
                    .font(GaryFonts.text(13))
                    .foregroundStyle(.white.opacity(0.9))
                    .lineLimit(1).minimumScaleFactor(0.85)
                Spacer(minLength: 8)
                if let s = stat {
                    // Label BOTH stats — a bare quality-coloured number next to a
                    // labelled xERA made readers guess what the first one was.
                    Text("ERA \(s.era)")
                        .font(GaryFonts.mono(13, bold: true))
                        .foregroundStyle(s.color)
                    if let x = s.xera {
                        Text("xERA \(x)")
                            .font(GaryFonts.mono(10.5))
                            .foregroundStyle(.white.opacity(0.55))
                    }
                } else {
                    Text("ERA —")
                        .font(GaryFonts.mono(11))
                        .foregroundStyle(.white.opacity(0.62))
                }
            }
        }

        private func bigGameBoardRow(_ g: TomorrowBigGame) -> TomorrowBoardRow? {
            guard let mu = g.matchup?.lowercased(), let rows = board?.board else { return nil }
            let sides = mu.components(separatedBy: " @ ")
            guard sides.count == 2,
                  let aKey = sides[0].split(separator: " ").last.map(String.init),
                  let hKey = sides[1].split(separator: " ").last.map(String.init) else { return nil }
            return rows.first {
                ($0.away_team ?? "").lowercased().contains(aKey) &&
                ($0.home_team ?? "").lowercased().contains(hKey)
            }
        }

        /// A probable starter's full read (name, ERA, xERA, quality colour), matched
        /// by team abbr + last name. nil when ERA isn't posted.
        private func starterStat(lastName: String?, abbr: String?) -> (name: String, era: String, xera: String?, color: Color)? {
            guard let lastName, !lastName.isEmpty, let starters = board?.starters else { return nil }
            let key = lastName.lowercased()
            let p = starters.first {
                $0.era != nil &&
                (($0.name ?? "").lowercased().split(separator: " ").last.map(String.init) == key) &&
                (abbr == nil || ($0.abbr ?? "").uppercased() == abbr!.uppercased())
            }
            guard let p, let era = p.era else { return nil }
            let avg = board?.league_avg_era ?? 4.32
            return (p.name ?? lastName, Self.trimNum(era), p.xera.map { Self.trimNum($0) },
                    Self.bigGameEraColor(era, avg: avg))
        }

        /// Tiered ERA quality colour vs league avg — elite (bright green) · good
        /// (green, at/below avg) · amber (a run above) · red (well above). Replaces
        /// the old meaningless binary cliff at exactly the average.
        private static func bigGameEraColor(_ era: Double, avg: Double) -> Color {
            switch era - avg {
            case ..<(-1.0): return Color(hex: "#36D17A")   // elite
            case ..<0:      return GaryColors.win           // good
            case ..<1.0:    return Color(hex: "#E8B339")    // amber — a run above
            default:        return GaryColors.loss          // well above avg
            }
        }

        /// "MIL -145 · O/U 7.5" — favourite (more-negative ML) + total.
        private func bigGameMarket(_ g: TomorrowBigGame) -> String? {
            // STORE-SAFE BRIDGE: no market line under the big games.
            guard !AppFlags.storeSafe, let row = bigGameBoardRow(g) else { return nil }
            var parts: [String] = []
            if let mh = row.ml_home, let ma = row.ml_away {
                let homeFav = mh <= ma
                let favTeam = homeFav ? row.home_team : row.away_team
                // Proper FIFA/league code (NED, MAR) — not the prefix(3) fallback (NET, MOR).
                let favAbbr = (homeFav ? row.home_abbr : row.away_abbr)
                    ?? (favTeam.map { teamAbbrevFromName($0, league: g.league) } ?? abbr(favTeam))
                parts.append("\(favAbbr) \(Self.mlStr(homeFav ? mh : ma))")
            }
            if let t = row.total { parts.append("O/U \(Self.trimNum(t))") }
            return parts.isEmpty ? nil : parts.joined(separator: "  ·  ")
        }

        // ── ③ Tomorrow's board (full scoreboard) ───────────────────────────

        private func tomorrowBoardSection(_ b: TomorrowBoard) -> some View {
            VStack(alignment: .leading, spacing: 8) {
                // Board label row + sport-dot legend.
                HStack(spacing: 10) {
                    Text("Tomorrow's Board")
                        .font(GaryFonts.display(17))
                        .foregroundStyle(GaryColors.sectionHead)   // match "The Day Ahead" header
                    Spacer(minLength: 6)
                    legendDot(Color(hex: "#4FB14F"), "MLB")
                    // (WC dot removed Aug 18 2026 — the World Cup pipeline was
                    // deleted Jul 21; the legend outlived it.)
                }
                .pageGutter()

                VStack(spacing: 0) {
                    boardHeader
                    ForEach(Array(b.board.enumerated()), id: \.offset) { idx, row in
                        boardRow(row, alt: idx % 2 == 1)
                    }
                }
                .quantPanel(radius: 14)
                .pageGutter()
            }
        }

        private func legendDot(_ c: Color, _ label: String) -> some View {
            HStack(spacing: 4) {
                Circle().fill(c).frame(width: 6, height: 6)
                Text(label).font(GaryFonts.mono(9)).foregroundStyle(.white.opacity(0.62))
            }
        }

        // 48 | 1fr | 46 | 42 | 46  (TIME | MATCHUP | SPR | O/U | ML)
        private var boardHeader: some View {
            HStack(spacing: 0) {
                Text("TIME").frame(width: 48, alignment: .leading)
                Text("MATCHUP").frame(maxWidth: .infinity, alignment: .leading)
                // STORE-SAFE BRIDGE: schedule only — no market columns.
                if !AppFlags.storeSafe {
                    Text("SPR").frame(width: 46, alignment: .trailing)
                    Text("O/U").frame(width: 42, alignment: .trailing)
                    Text("ML").frame(width: 46, alignment: .trailing)
                }
            }
            .font(GaryFonts.mono(10))
            .foregroundStyle(.white.opacity(0.62))
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }

        private func boardRow(_ row: TomorrowBoardRow, alt: Bool) -> some View {
            let marquee = row.is_marquee ?? false
            let away = row.away_abbr ?? abbr(row.away_team)
            let home = row.home_abbr ?? abbr(row.home_team)
            return HStack(spacing: 0) {
                Text(TomorrowView.etTime(row.commence_time, withZone: false))
                    .font(GaryFonts.mono(12))
                    .foregroundStyle(GaryColors.gold)
                    .frame(width: 48, alignment: .leading)
                HStack(spacing: 5) {
                    Circle().fill(TomorrowView.sportDotColor(row.league)).frame(width: 6, height: 6)
                    Text("\(away) @ \(home)")
                        .font(GaryFonts.mono(12, bold: true))
                        .foregroundStyle(.white.opacity(0.92))
                    if marquee {
                        Image(systemName: "star.fill")
                            .font(.system(size: 7.5))
                            .foregroundStyle(GaryColors.gold)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                // STORE-SAFE BRIDGE: schedule only — no market columns.
                if !AppFlags.storeSafe {
                    Text(Self.lineStr(row.spread, signed: true))
                        .font(GaryFonts.mono(12)).foregroundStyle(.white.opacity(0.8))
                        .frame(width: 46, alignment: .trailing)
                    Text(Self.lineStr(row.total))
                        .font(GaryFonts.mono(12)).foregroundStyle(.white.opacity(0.8))
                        .frame(width: 42, alignment: .trailing)
                    Text(Self.mlStr(row.ml_home))
                        .font(GaryFonts.mono(12)).foregroundStyle(.white.opacity(0.62))
                        .frame(width: 46, alignment: .trailing)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(alignment: .leading) {
                if marquee {
                    LinearGradient(colors: [GaryColors.gold.opacity(0.09), .clear],
                                   startPoint: .leading, endPoint: .trailing)
                } else if alt {
                    Color.white.opacity(0.018)
                }
            }
        }

        private static func lineStr(_ v: Double?, signed: Bool = false) -> String {
            guard let v else { return "—" }
            if signed && v > 0 { return "+" + Self.trimNum(v) }
            return Self.trimNum(v)
        }
        private static func mlStr(_ v: Double?) -> String {
            guard let v else { return "—" }
            let i = Int(v.rounded())
            return i > 0 ? "+\(i)" : "\(i)"
        }
        private static func trimNum(_ v: Double) -> String {
            if v == v.rounded() { return String(Int(v)) }
            return String(format: "%.1f", v)
        }

        // ── Poisson match model (the "Team Strength" upgrade) ───────────────────
        // Independent-Poisson goal model (the standard Dixon-Coles base): each side's
        // projected goals is a Poisson mean (λ), and the joint scoreline grid gives
        // true win / draw / loss + over probabilities and the single likeliest score.
        struct MatchOdds {
            let pHome: Double, pDraw: Double, pAway: Double
            let pOver: Double?            // P(total > line); nil when no line
            let likelyHome: Int, likelyAway: Int
        }
        /// Poisson PMF in log space (no factorial overflow): P(X = k | λ).
        private static func poissonPMF(_ k: Int, _ lambda: Double) -> Double {
            guard lambda > 0, k >= 0 else { return k == 0 ? 1 : 0 }
            var logp = -lambda + Double(k) * log(lambda)
            if k > 0 { for n in 1...k { logp -= log(Double(n)) } }
            return exp(logp)
        }
        /// Score-grid (0…8 each side) → W/D/L, P(over line), and the modal scoreline.
        private static func matchOdds(lambdaHome: Double, lambdaAway: Double, totalLine: Double?) -> MatchOdds {
            let maxG = 8
            var pH = 0.0, pD = 0.0, pA = 0.0, pOver = 0.0, mass = 0.0
            var best = -1.0, bi = 0, bj = 0
            let hPMF = (0...maxG).map { poissonPMF($0, lambdaHome) }
            let aPMF = (0...maxG).map { poissonPMF($0, lambdaAway) }
            for i in 0...maxG {
                for j in 0...maxG {
                    let p = hPMF[i] * aPMF[j]
                    mass += p
                    if i > j { pH += p } else if i == j { pD += p } else { pA += p }
                    if let line = totalLine, Double(i + j) > line { pOver += p }
                    if p > best { best = p; bi = i; bj = j }
                }
            }
            let z = mass > 0 ? mass : 1   // normalize to captured mass (tail beyond 8 is tiny)
            return MatchOdds(pHome: pH / z, pDraw: pD / z, pAway: pA / z,
                             pOver: totalLine != nil ? pOver / z : nil, likelyHome: bi, likelyAway: bj)
        }
        private static func pct(_ v: Double) -> String { "\(Int((v * 100).rounded()))%" }

        private func abbr(_ team: String?) -> String {
            guard let team, !team.isEmpty else { return "—" }
            // Fallback only — server normally provides away_abbr/home_abbr.
            return String(team.prefix(3)).uppercased()
        }

        private var lookAheadAvailable: [LookAheadLane] {
            LookAheadLane.allCases.filter { hasData($0) }
        }
        private func hasData(_ lane: LookAheadLane) -> Bool {
            switch lane {
            case .starters: return !(board?.starters ?? []).isEmpty
            case .returns:  return !(board?.returns ?? []).isEmpty
            case .form:     return !(board?.form ?? []).isEmpty
            case .runProfile: return !(board?.run_profile ?? []).isEmpty
            case .weather:  return !(board?.weather ?? []).isEmpty
            }
        }
        private var hasMlbLookahead: Bool { !lookAheadAvailable.isEmpty }

        /// "The Day Ahead" — the MLB look-ahead (Starters · Form · Run Profile ·
        /// Weather). (The World Cup twin was deleted Sep 1 2026 with the WC lane.)
        @ViewBuilder private var lookAheadTabs: some View {
            if hasMlbLookahead {
                VStack(alignment: .leading, spacing: 6) {
                    HubSectionHeader(eyebrow: "The Day Ahead", sub: "")
                    mlbLookAheadTable
                }
            }
        }

        /// The MLB look-ahead — the existing fixed-height, internally-scrolling
        /// tabbed table (Starters · Form · Run Profile · Weather).
        @ViewBuilder private var mlbLookAheadTable: some View {
            let lanes = lookAheadAvailable
            if !lanes.isEmpty {
                let active = lanes[min(lookAheadTab, lanes.count - 1)]
                VStack(alignment: .leading, spacing: 6) {
                    // Mono tab strip — active in gold, the rest dim (app-wide).
                    if lanes.count > 1 {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 18) {
                                ForEach(Array(lanes.enumerated()), id: \.element) { i, lane in
                                    Button {
                                        withAnimation(.easeInOut(duration: 0.15)) { lookAheadTab = i }
                                    } label: {
                                        Text(lane.label)
                                            .font(GaryFonts.mono(10.5, bold: true)).tracking(0.8)
                                            .foregroundStyle(i == min(lookAheadTab, lanes.count - 1) ? GaryColors.gold : .white.opacity(0.4))
                                            .frame(minHeight: 30)
                                            .contentShape(Rectangle())
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            .padding(.horizontal, 2)
                        }
                        .pageGutter()
                    }
                    // Fixed-height, internally-scrolling table.
                    VStack(spacing: 0) {
                        laneHeader(active)
                        Rectangle().fill(Color.white.opacity(0.1)).frame(height: 1)
                        ScrollView(.vertical, showsIndicators: true) {
                            laneBody(active)
                                .frame(maxWidth: .infinity)
                        }
                        .frame(height: 300)
                        .scrollIndicators(.visible)
                    }
                    .background(Color(hex: "#181616"))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.white.opacity(0.07), lineWidth: 1))
                    .pageGutter()
                }
            }
        }

        /// The fixed column-header row for the active lane.
        @ViewBuilder private func laneHeader(_ lane: LookAheadLane) -> some View {
            HStack(spacing: 8) {
                switch lane {
                case .starters:
                    Text("PITCHER / GAME")
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text("ERA · xERA")
                        .frame(width: 164, alignment: .trailing)
                case .returns:
                    Text("PLAYER / TEAM")
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text("STATUS")
                        .frame(width: 120, alignment: .trailing)
                case .form:
                    Text("TEAM").frame(maxWidth: .infinity, alignment: .leading)
                    Text("L10").frame(width: 56, alignment: .trailing)
                    Text("STREAK").frame(width: 60, alignment: .trailing)
                case .runProfile:
                    Text("TEAM").frame(maxWidth: .infinity, alignment: .leading)
                    Text("RS/G").frame(width: 52, alignment: .trailing)
                    Text("RA/G").frame(width: 52, alignment: .trailing)
                    Text("DIFF").frame(width: 48, alignment: .trailing)
                case .weather:
                    Text("MATCHUP / VENUE").frame(maxWidth: .infinity, alignment: .leading)
                    Text("FORECAST").frame(width: 132, alignment: .trailing)
                }
            }
            .font(GaryFonts.mono(10.5)).tracking(1.2)
            // Gold column headers (founder) — Gary's signature on the look-ahead table.
            .foregroundStyle(GaryColors.gold)
            .padding(.vertical, 8).padding(.horizontal, 14)
        }

        /// The scrolling rows for the active lane, grouped by sport where the
        /// data spans leagues.
        @ViewBuilder private func laneBody(_ lane: LookAheadLane) -> some View {
            switch lane {
            case .starters: starterRows(board?.starters ?? [])
            case .returns:  peopleRows(board?.returns ?? [])
            case .form:     formRows(board?.form ?? [])
            case .runProfile: runProfileRows(board?.run_profile ?? [])
            case .weather:  weatherRows(board?.weather ?? [])
            }
        }

        // STARTERS — pitcher name + gold team abbr + the game it's in on the
        // left; ERA · xERA on the right, each colored green (below league avg =
        // good) / red (above = bad) / white (around avg). The team is dropped
        // from the right side (it was "HOU 4.03") — right side is numbers now.
        @ViewBuilder private func starterRows(_ people: [TomorrowPerson]) -> some View {
            let leagues = TomorrowView.sortedLeagues(people)
            let lgAvgEra = board?.league_avg_era
            let lgAvgXera = board?.league_avg_xera
            VStack(spacing: 0) {
                ForEach(leagues, id: \.self) { lg in
                    sportSubHeader(lg)
                    let rows = people.filter { ($0.league ?? "").uppercased() == lg }
                    ForEach(Array(rows.enumerated()), id: \.offset) { _, p in
                        HStack(alignment: .top, spacing: 8) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(p.name ?? "")
                                    .font(GaryFonts.text(14, .semibold))
                                    .foregroundStyle(.white.opacity(0.92))
                                    .lineLimit(1)
                                // The matchup shown ONCE — the starter's OWN team in
                                // gold, the opponent grey (no more "HOU HOU @ DET").
                                if let g = p.game, !g.isEmpty {
                                    let teamAbbr = (p.abbr?.isEmpty == false ? p.abbr : p.team) ?? ""
                                    let parts = g.components(separatedBy: " @ ")
                                    HStack(spacing: 3) {
                                        if parts.count == 2 {
                                            Text(parts[0])
                                                .foregroundStyle(parts[0] == teamAbbr ? GaryColors.gold : .white.opacity(0.4))
                                            Text("@").foregroundStyle(.white.opacity(0.62))
                                            Text(parts[1])
                                                .foregroundStyle(parts[1] == teamAbbr ? GaryColors.gold : .white.opacity(0.4))
                                        } else {
                                            Text(g).foregroundStyle(.white.opacity(0.62))
                                        }
                                    }
                                    .font(GaryFonts.mono(9.5, bold: true)).tracking(0.4)
                                    .lineLimit(1)
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            // ERA · xERA, both labeled + colored vs league average.
                            if p.era != nil || p.xera != nil {
                                HStack(spacing: 6) {
                                    if let era = p.era {
                                        eraStat("ERA", era, avg: lgAvgEra)
                                    }
                                    if p.era != nil && p.xera != nil {
                                        Text("·").font(GaryFonts.mono(9)).foregroundStyle(.white.opacity(0.25))
                                    }
                                    if let xera = p.xera {
                                        eraStat("xERA", xera, avg: lgAvgXera)
                                    }
                                }
                                .frame(width: 164, alignment: .trailing)
                            } else {
                                Text("—")
                                    .font(GaryFonts.mono(10))
                                    .foregroundStyle(.white.opacity(0.62))
                                    .frame(width: 164, alignment: .trailing)
                            }
                        }
                        .padding(.vertical, 9).padding(.horizontal, 14)
                        hairline
                    }
                }
            }
        }

        /// One labeled, color-coded ERA/xERA stat: "ERA 4.03". Below the league
        /// average reads green (good), above reads red (bad), neutral white near
        /// the average — a clear bettor signal on the starter's quality.
        private func eraStat(_ label: String, _ value: Double, avg: Double?) -> some View {
            HStack(spacing: 3) {
                Text(label)
                    .font(GaryFonts.mono(8.5, bold: true)).tracking(0.5)
                    .foregroundStyle(.white.opacity(0.62))
                Text(String(format: "%.2f", value))
                    .font(GaryFonts.mono(12.5, bold: true))
                    .foregroundStyle(eraColor(value, avg: avg))
            }
        }

        /// Green when comfortably below the league average (better pitcher), red
        /// when comfortably above (worse), white in the ±0.40 band around it. ERA
        /// is lower-is-better, so the comparison is inverted from run-diff. When
        /// the league average is missing, fall back to a neutral fixed anchor so
        /// the lane still reads a sensible good/bad signal.
        private func eraColor(_ value: Double, avg: Double?) -> Color {
            let baseline = avg ?? 4.00
            let band = 0.40
            if value < baseline - band { return GaryColors.win }
            if value > baseline + band { return GaryColors.loss }
            return .white.opacity(0.8)
        }

        // Starters / Key Returns — name + team on the left, detail/status right,
        // grouped under a sport sub-header.
        @ViewBuilder private func peopleRows(_ people: [TomorrowPerson]) -> some View {
            let leagues = TomorrowView.sortedLeagues(people)
            VStack(spacing: 0) {
                ForEach(leagues, id: \.self) { lg in
                    sportSubHeader(lg)
                    let rows = people.filter { ($0.league ?? "").uppercased() == lg }
                    ForEach(Array(rows.enumerated()), id: \.offset) { _, p in
                        HStack(spacing: 8) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(p.name ?? "")
                                    .font(GaryFonts.text(14, .semibold))
                                    .foregroundStyle(.white.opacity(0.92))
                                    .lineLimit(1)
                                if let t = p.team, !t.isEmpty {
                                    Text(t)
                                        .font(GaryFonts.mono(8.5)).tracking(0.5)
                                        .foregroundStyle(.white.opacity(0.62))
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            Text((p.detail?.isEmpty == false ? p.detail : "—") ?? "—")
                                .font(GaryFonts.mono(10))
                                .foregroundStyle(.white.opacity(0.62))
                                .frame(width: 120, alignment: .trailing)
                                .lineLimit(1).minimumScaleFactor(0.8)
                        }
                        .padding(.vertical, 9).padding(.horizontal, 14)
                        hairline
                    }
                }
            }
        }

        @ViewBuilder private func formRows(_ rows: [TomorrowForm]) -> some View {
            let leagues = sortedFormLeagues(rows.map { $0.league })
            VStack(spacing: 0) {
                ForEach(leagues, id: \.self) { lg in
                    if leagues.count > 1 { sportSubHeader(lg) }
                    let r = rows.filter { ($0.league ?? "").uppercased() == lg }
                    ForEach(Array(r.enumerated()), id: \.offset) { _, f in
                        HStack(spacing: 8) {
                            HStack(spacing: 5) {
                                Text(f.abbr ?? abbr(f.team))
                                    .font(GaryFonts.mono(13.5, bold: true))
                                    .foregroundStyle(.white.opacity(0.92))
                                if f.home == true {
                                    Text("HOME")
                                        .font(GaryFonts.mono(9, bold: true)).tracking(0.6)
                                        .foregroundStyle(GaryColors.gold.opacity(0.7))
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            Text(f.l10 ?? "—")
                                .font(GaryFonts.mono(13))
                                .foregroundStyle(.white.opacity(0.8))
                                .frame(width: 56, alignment: .trailing)
                            Text(f.streak ?? "—")
                                .font(GaryFonts.mono(13, bold: true))
                                .foregroundStyle(streakColor(f.streak))
                                .frame(width: 60, alignment: .trailing)
                        }
                        .padding(.vertical, 9).padding(.horizontal, 14)
                        hairline
                    }
                }
            }
        }

        @ViewBuilder private func runProfileRows(_ rows: [TomorrowRunProfile]) -> some View {
            let leagues = sortedFormLeagues(rows.map { $0.league })
            VStack(spacing: 0) {
                ForEach(leagues, id: \.self) { lg in
                    if leagues.count > 1 { sportSubHeader(lg) }
                    let r = rows.filter { ($0.league ?? "").uppercased() == lg }
                    ForEach(Array(r.enumerated()), id: \.offset) { _, rp in
                        HStack(spacing: 8) {
                            Text(rp.abbr ?? abbr(rp.team))
                                .font(GaryFonts.mono(13.5, bold: true))
                                .foregroundStyle(.white.opacity(0.92))
                                .frame(maxWidth: .infinity, alignment: .leading)
                            Text(Self.oneDecimal(rp.rs_per_game))
                                .font(GaryFonts.mono(13))
                                .foregroundStyle(.white.opacity(0.8))
                                .frame(width: 52, alignment: .trailing)
                            Text(Self.oneDecimal(rp.ra_per_game))
                                .font(GaryFonts.mono(13))
                                .foregroundStyle(.white.opacity(0.8))
                                .frame(width: 52, alignment: .trailing)
                            Text(Self.signedInt(rp.run_diff))
                                .font(GaryFonts.mono(13, bold: true))
                                .foregroundStyle(diffColor(rp.run_diff))
                                .frame(width: 48, alignment: .trailing)
                        }
                        .padding(.vertical, 9).padding(.horizontal, 14)
                        hairline
                    }
                }
            }
        }

        @ViewBuilder private func weatherRows(_ rows: [TomorrowWeather]) -> some View {
            VStack(spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.offset) { _, w in
                    HStack(spacing: 8) {
                        VStack(alignment: .leading, spacing: 2) {
                            // Prefer abbreviations (HOU @ DET) so the matchup fits
                            // without truncating; fall back to a mascot-short label.
                            Text({
                                if let a = w.away_abbr, let h = w.home_abbr, !a.isEmpty, !h.isEmpty { return "\(a) @ \(h)" }
                                return w.matchup.map(shortenMatchup) ?? "—"
                            }())
                                .font(GaryFonts.text(14, .semibold))
                                .foregroundStyle(.white.opacity(0.92))
                                .lineLimit(1)
                            if let v = w.venue, !v.isEmpty {
                                Text(v)
                                    .font(GaryFonts.mono(9.5)).tracking(0.3)
                                    .foregroundStyle(.white.opacity(0.62))
                                    .lineLimit(1)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        VStack(alignment: .trailing, spacing: 2) {
                            HStack(spacing: 6) {
                                if let t = w.temp_f { Text("\(t)°").font(GaryFonts.mono(13)).foregroundStyle(.white.opacity(0.8)) }
                                if let wind = w.wind_mph { Text("\(wind)mph").font(GaryFonts.mono(10.5)).foregroundStyle(.white.opacity(0.55)) }
                            }
                            if let note = w.note, !note.isEmpty {
                                Text(note)
                                    .font(GaryFonts.mono(9.5))
                                    .foregroundStyle(GaryColors.gold.opacity(0.8))
                                    .lineLimit(1)
                            }
                        }
                        .frame(width: 132, alignment: .trailing)
                    }
                    .padding(.vertical, 9).padding(.horizontal, 14)
                    hairline
                }
            }
        }

        // ── Look-ahead helpers ─────────────────────────────────────────────
        private var hairline: some View {
            Rectangle().fill(Color.white.opacity(0.05)).frame(height: 1).padding(.leading, 14)
        }
        private func sportSubHeader(_ lg: String) -> some View {
            Text(lg)
                .font(GaryFonts.mono(10, bold: true)).tracking(1)
                .foregroundStyle(GaryColors.gold.opacity(0.7))
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 9).padding(.bottom, 4).padding(.horizontal, 14)
        }
        /// MLB / WC head ordering for the form + run-profile lanes.
        private func sortedFormLeagues(_ leagues: [String?]) -> [String] {
            let order = ["MLB", "WC"]
            let present = Array(Set(leagues.compactMap { ($0 ?? "").uppercased() }.filter { !$0.isEmpty }))
            let head = order.filter { present.contains($0) }
            let tail = present.filter { !order.contains($0) }.sorted()
            return head + tail
        }
        private func streakColor(_ s: String?) -> Color {
            guard let s, let first = s.first else { return .white.opacity(0.5) }
            if first == "W" { return GaryColors.win }
            if first == "L" { return GaryColors.loss }
            return .white.opacity(0.6)
        }
        private func diffColor(_ d: Int?) -> Color {
            guard let d else { return .white.opacity(0.5) }
            return d > 0 ? GaryColors.win : d < 0 ? GaryColors.loss : .white.opacity(0.6)
        }
        private static func oneDecimal(_ v: Double?) -> String {
            guard let v else { return "—" }
            return String(format: "%.1f", v)
        }
        private static func signedInt(_ v: Int?) -> String {
            guard let v else { return "—" }
            return v > 0 ? "+\(v)" : "\(v)"
        }
    }
}

/// The look-ahead tabs shown under the Tomorrow board. Order = display order.
enum LookAheadLane: CaseIterable, Hashable {
    case starters, returns, form, runProfile, weather
    var label: String {
        switch self {
        case .starters:   return "STARTERS"
        case .returns:    return "KEY RETURNS"
        case .form:       return "FORM"
        case .runProfile: return "RUN PROFILE"
        case .weather:    return "WEATHER"
        }
    }
}
