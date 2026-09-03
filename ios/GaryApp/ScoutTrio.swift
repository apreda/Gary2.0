// ScoutTrio.swift — The Scout Trio (game-page scouting report + siblings).
// Split out of Views.swift on Sep 1 2026 (the 28K-line monolith); pure move,
// no behavior change. Section boundaries follow the original MARK headers.

import SwiftUI
import Combine
import Charts
import WebKit
import SafariServices
import StoreKit

// MARK: - The Scout Trio (Jul 22 2026 — founder-picked mocks, ported as designed)
//
// Three stacked report sections replace GameScoutSection on the game page:
// THE TUG (mock MY 07: center-out comparison bars), THE NOTEBOOK (MY 08:
// prose chapters assembled strictly from real fields — never generated), and
// THE BIG NUMBERS (MY 04: one numeral per fact, pipeline edges leading).
// GameScoutSection stays in the file unreferenced — the founder may still
// fold parts of it back in after seeing these live.

/// Shared palette + type for the trio — 1:1 with the approved mock values.
enum ScoutMock {
    static let card = Color(hex: "#1B1714")
    static let warm = Color(hex: "#F2EDE4")
    static let hairline = Color(hex: "#FFF8EB").opacity(0.09)
    static func kicker(_ s: String, size: CGFloat = 9) -> some View {
        Text(s.uppercased()).font(.system(size: size, weight: .semibold).monospacedDigit())
            .tracking(1.2).foregroundStyle(warm.opacity(0.42)).lineLimit(1)
    }
    static func value(_ s: String, size: CGFloat = 12.5) -> Text {
        Text(s).font(.system(size: size, weight: .semibold).monospacedDigit())
    }
    static var cardShape: some View {
        RoundedRectangle(cornerRadius: 14, style: .continuous).fill(card)
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(hairline, lineWidth: 1))
    }
}

/// One extraction of everything the trio renders — real board/wire fields only.
struct ScoutTrioData {
    let awayName: String            // "Reds"
    let homeName: String            // "Mariners"
    let awayStarter: TomorrowPerson?
    let homeStarter: TomorrowPerson?
    let awayL10: String?            // "6-4"
    let homeL10: String?
    let awayStreak: String?         // "W3"
    let homeStreak: String?
    let awayHomeRunsL5: Int?
    let homeHomeRunsL5: Int?
    let awayBullpenERAL14: Double?
    let homeBullpenERAL14: Double?
    let awayRunDiffL10: Int?
    let homeRunDiffL10: Int?
    let awayFirstInnL10: Int?
    let homeFirstInnL10: Int?
    // Rail ladder (Aug 14): lines open→now, streaks, vs-hand, NRFI market, pen work.
    let mlHome: Double?
    let mlAway: Double?
    let mlOpenHome: Double?
    let mlOpenAway: Double?
    let nrfi: TomorrowNRFI?
    let vsHandAway: TomorrowVsHandSide?
    let vsHandHome: TomorrowVsHandSide?
    let awayStreakL: String?
    let homeStreakL: String?
    let awayStreakLongest: Bool
    let homeStreakLongest: Bool
    let awayRunsPgL10: Double?
    let homeRunsPgL10: Double?
    let venue: String?
    let seriesLine: String?         // split_line — feeds tonightLine's band only
    let tempF: Int?
    let windMph: Int?
    let weatherNote: String?
    let total: Double?
    let wireLines: [String]
    /// THE ARMS IN GARY'S VOICE (Aug 4) — the board's two sentences on the
    /// game's two starters. nil = the assembled template prose renders.
    let armsTake: String?

    init(matchup: String, row: TomorrowBoardRow?, board: TomorrowBoard?, wire: [SupabaseAPI.WireItem],
         commence: Date? = nil, isDoubleheader: Bool = false) {
        let sides = matchup.components(separatedBy: " @ ")
        let awaySide = sides.first ?? "", homeSide = sides.count > 1 ? sides[1] : ""
        let lg = (row?.league ?? "MLB").uppercased()
        awayName = Formatters.shortTeamName(awaySide, league: lg)
        homeName = Formatters.shortTeamName(homeSide, league: lg)

        func abbr(_ side: String, _ fallback: String?) -> String {
            if let fallback, !fallback.isEmpty { return fallback }
            let a = teamAbbrevFromName(side, league: row?.league)
            return a.isEmpty ? side.uppercased() : a
        }
        let aAb = abbr(awaySide, row?.away_abbr), hAb = abbr(homeSide, row?.home_abbr)
        func matches(_ name: String?, _ side: String) -> Bool {
            guard let b = name?.lowercased(), !b.isEmpty else { return false }
            let s = side.lowercased()
            return s == b || s.hasSuffix(b) || b.hasSuffix(s)
        }
        // The arm is selected BY GAME, never by team alone (Jul 22 2026, the
        // Max Fried mixup): a doubleheader puts two same-team starters on one
        // date. The board stamps each with its game_time; require the stamp to
        // match this page's start bucket. On a doubleheader with no matching
        // stamp, show NO arm rather than guess the twin's.
        func starterFor(_ ab: String) -> TomorrowPerson? {
            let cands = (board?.starters ?? []).filter { $0.abbr == ab }
            if cands.count <= 1 && !isDoubleheader { return cands.first }
            guard let myBucket = PicksCarouselView.timeBucket(commence) else {
                return isDoubleheader ? nil : cands.first
            }
            if let hit = cands.first(where: {
                PicksCarouselView.timeBucket(parseISO8601($0.game_time ?? "")) == myBucket
            }) { return hit }
            return isDoubleheader ? nil : cands.first
        }
        awayStarter = starterFor(aAb)
        homeStarter = starterFor(hAb)
        let fa = board?.form?.first { $0.abbr == aAb || matches($0.team, awaySide) }
        let fh = board?.form?.first { $0.abbr == hAb || matches($0.team, homeSide) }
        awayL10 = fa?.l10; homeL10 = fh?.l10
        awayStreak = fa?.streak; homeStreak = fh?.streak
        let ra = board?.run_profile?.first { $0.abbr == aAb || matches($0.team, awaySide) }
        let rh = board?.run_profile?.first { $0.abbr == hAb || matches($0.team, homeSide) }
        awayHomeRunsL5 = ra?.home_runs_l5; homeHomeRunsL5 = rh?.home_runs_l5
        awayBullpenERAL14 = ra?.bullpen_era_l14; homeBullpenERAL14 = rh?.bullpen_era_l14
        awayRunDiffL10 = ra?.run_diff_l10; homeRunDiffL10 = rh?.run_diff_l10
        awayFirstInnL10 = ra?.first_inning_scored_l10; homeFirstInnL10 = rh?.first_inning_scored_l10
        mlHome = row?.ml_home; mlAway = row?.ml_away
        mlOpenHome = row?.ml_open_home; mlOpenAway = row?.ml_open_away
        nrfi = row?.nrfi
        vsHandAway = row?.vs_hand?.away; vsHandHome = row?.vs_hand?.home
        awayStreakL = ra?.streak_l; homeStreakL = rh?.streak_l
        awayStreakLongest = ra?.streak_longest ?? false; homeStreakLongest = rh?.streak_longest ?? false
        awayRunsPgL10 = ra?.runs_pg_l10; homeRunsPgL10 = rh?.runs_pg_l10

        let weatherCandidates = (board?.weather ?? []).filter {
            ($0.away_abbr == aAb && $0.home_abbr == hAb) || matches($0.matchup, matchup)
        }
        let w: TomorrowWeather?
        if isDoubleheader {
            // A twin bill can have materially different first-pitch weather.
            // Require the same game-time bucket; never borrow the other game's
            // forecast when this game's timestamp is absent or does not match.
            if let myBucket = PicksCarouselView.timeBucket(commence) {
                w = weatherCandidates.first {
                    PicksCarouselView.timeBucket(parseISO8601($0.commence_time ?? "")) == myBucket
                }
            } else {
                w = nil
            }
        } else {
            w = weatherCandidates.first
        }
        venue = w?.venue ?? row?.venue
        tempF = w?.temp_f; windMph = w?.wind_mph; weatherNote = w?.note
        total = row?.total
        seriesLine = row?.series?.split_line
        armsTake = row?.arms_take

        // The wire, one line per team: injury first, else today's move (the
        // same selection GameScoutSection used).
        let today = SupabaseAPI.todayEST()
        func news(_ key: String) -> String? {
            let k = key.lowercased()
            guard !k.isEmpty else { return nil }
            let mine = wire.filter { ($0.league ?? "").uppercased() == lg && ($0.headline ?? "").lowercased().contains(k) }
            // TODAY'S injury outranks yesterday's — the cache carries both
            // days, and taking the first match let a stale headline sit on
            // the page all morning (founder, Aug 20: most recent news, always).
            let injuries = mine.filter { $0.kind == "injury" }
            if let inj = injuries.first(where: { $0.date == today }) ?? injuries.first { return inj.headline }
            return mine.first(where: { (($0.kind == "line_move" && !AppFlags.storeSafe) || $0.kind == "pace") && $0.date == today })?.headline
        }
        var lines: [String] = []
        for h in [news(awayName), news(homeName)].compactMap({ $0 }) where !lines.contains(h) { lines.append(h) }
        wireLines = lines
    }

    /// "T-Mobile Park · 74° · Wind 9 mph · O/U 7.5 · CIN 2-1" — the shared band.
    var tonightLine: String? {
        var bits: [String] = []
        if let venue { bits.append(venue) }
        if let tempF { bits.append("\(tempF)°") }
        if let windMph { bits.append("Wind \(windMph) mph") }
        if let weatherNote, !weatherNote.isEmpty { bits.append(weatherNote) }
        if let total { bits.append("O/U " + (total == total.rounded() ? String(format: "%.0f", total) : String(format: "%.1f", total))) }
        if let seriesLine, !seriesLine.isEmpty { bits.append("Series \(seriesLine)") }
        return bits.isEmpty ? nil : bits.joined(separator: " · ")
    }
    var wireText: String? { wireLines.isEmpty ? nil : wireLines.joined(separator: " · ") }
}

/// THE ARMS: Gary's generated two-sentence read, then the two starters as soft
/// side-by-side plates. There is deliberately no template-prose fallback: the
/// server retains the last complete snapshot instead of publishing a missed
/// daily generation as a different treatment.
struct ScoutArmsSection: View {
    let d: ScoutTrioData

    /// "LODOLO" — surname in display caps, the plate's title.
    private func surname(_ p: TomorrowPerson) -> String {
        let full = p.full_name ?? p.name ?? ""
        let suffixes: Set<String> = ["JR", "SR", "II", "III", "IV", "V"]
        var parts = full.split(separator: " ").map(String.init)
        while parts.count > 1 {
            let candidate = parts.last?
                .trimmingCharacters(in: CharacterSet(charactersIn: ".,"))
                .uppercased() ?? ""
            guard suffixes.contains(candidate) else { break }
            parts.removeLast()
        }
        return (parts.last ?? full).uppercased()
    }
    private func seasonLine(_ p: TomorrowPerson) -> String? {
        guard let e = p.era else { return nil }
        if let x = p.xera { return String(format: "%.2f · %.2f xERA", e, x) }
        return String(format: "%.2f ERA", e)
    }
    private func lastOutLine(_ p: TomorrowPerson) -> String? {
        guard let o = p.last_outing, let ip = o.ip else { return nil }
        let ipShow = ip.hasSuffix(".0") ? String(ip.dropLast(2)) : ip
        var s = "\(ipShow) IP · \(o.er ?? 0) ER"
        if let k = o.k { s += " · \(k) K" }
        return s
    }
    private func l3RestLine(_ p: TomorrowPerson) -> String? {
        var bits: [String] = []
        if let l3 = p.l3, let ip = l3.ip, let er = l3.er {
            let ipShow = ip.hasSuffix(".0") ? String(ip.dropLast(2)) : ip
            bits.append("\(ipShow) IP · \(er) ER")
        }
        if let rest = p.rest?.days { bits.append("\(rest) d") }
        return bits.isEmpty ? nil : bits.joined(separator: " · ")
    }
    /// Labeled minor-league season line for a debut arm — real AAA/AA numbers
    /// from the server, never a fabricated MLB 0.00.
    private func milbLine(_ p: TomorrowPerson) -> String? {
        guard let m = p.milb, let era = m.era else { return nil }
        var s = String(format: "%.2f ERA", era)
        if let ip = m.ip {
            let ipShow = ip.hasSuffix(".0") ? String(ip.dropLast(2)) : ip
            s += " · \(ipShow) IP"
        }
        return s
    }

    private func plate(_ p: TomorrowPerson?) -> ScoutArmsPlate? {
        guard let p else { return nil }
        var stacks: [ScoutArmsStack] = [
            ScoutArmsStack(label: "Season", value: seasonLine(p)),
            ScoutArmsStack(label: "Last out", value: lastOutLine(p)),
            ScoutArmsStack(label: "L3 · Rest", value: l3RestLine(p)),
        ]
        // Debut arm (founder GO, Aug 17): zero MLB data renders an honest
        // state + his labeled AAA/AA line — never a blank plate, never a
        // fabricated 0.00.
        if p.no_mlb_starts == true {
            stacks.append(ScoutArmsStack(label: "Season", value: "No MLB starts"))
            stacks.append(ScoutArmsStack(label: p.milb?.level ?? "MiLB", value: milbLine(p)))
        }
        return ScoutArmsPlate(name: surname(p), stacks: stacks)
    }

    var body: some View {
        // Missing generated copy is not permission to resurrect the old
        // stats-only/quality-starts treatment. The server publishes MLB rows
        // atomically once every eligible matchup has its Arms take; if an
        // incomplete legacy snapshot slips through, omit this section until
        // the short board-cache refresh picks up the repaired snapshot.
        if let take = d.armsTake?.trimmingCharacters(in: .whitespacesAndNewlines),
           !take.isEmpty,
           d.awayStarter != nil || d.homeStarter != nil {
            ScoutArmsLayout(title: "THE ARMS", take: take, left: plate(d.awayStarter), right: plate(d.homeStarter))
        }
    }
}

/// One label/value pair on a plate ("SEASON" / "4.02 ERA"). A nil value
/// prints nothing — the plate simply carries less.
struct ScoutArmsStack {
    let label: String
    let value: String?
}

/// One side of THE ARMS pair: the surname plate and its stacks.
struct ScoutArmsPlate {
    let name: String
    let stacks: [ScoutArmsStack]
}

/// THE ARMS as a reusable layout (Sep 1 2026 — the football page mounts
/// this exact component for its passing games): the gold title, Gary's
/// take on the same container the plates wear, then two soft side-by-side
/// plates, the home side titled in gold. Pure layout — every sport supplies
/// its own words and numbers.
struct ScoutArmsLayout: View {
    let title: String
    let take: String
    let left: ScoutArmsPlate?
    let right: ScoutArmsPlate?

    @ViewBuilder private func stack(_ st: ScoutArmsStack) -> some View {
        if let value = st.value {
            VStack(alignment: .leading, spacing: 3) {
                ScoutMock.kicker(st.label, size: 11.5)
                Text(value)
                    .font(.system(size: 18, weight: .semibold).monospacedDigit())
                    .foregroundStyle(ScoutMock.warm)
                    .lineLimit(1).minimumScaleFactor(0.7)
            }
        }
    }

    @ViewBuilder private func plate(_ p: ScoutArmsPlate?, home: Bool) -> some View {
        if let p {
            VStack(alignment: .leading, spacing: 10) {
                Text(p.name)
                    .font(GaryFonts.display(20)).tracking(0.5)
                    .foregroundStyle(home ? GaryColors.gold : ScoutMock.warm)
                    .lineLimit(1).minimumScaleFactor(0.6)
                // Identity by position — two stacks may share a label (a debut
                // arm prints "Season" twice; two passing rows can share a unit).
                ForEach(Array(p.stacks.enumerated()), id: \.offset) { _, st in stack(st) }
            }
            .padding(12)
            // Both plates fill the pair's height (founder, Aug 6: "Perez's box
            // is messed up") — a starter with only a season line used to draw
            // a stub half the height of the arm beside him. maxHeight .infinity
            // inside an equal-height HStack row makes the two plates match
            // whatever the fuller one needs; the shorter one just carries air.
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(ScoutMock.warm.opacity(0.04))
            )
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(GaryFonts.display(14)).tracking(0.8)
                .foregroundStyle(GaryColors.gold)
            // Gary's two sentences (founder, Aug 4 — "whatever two sentences
            // Gary wants to say"). The take stands on the same container the
            // plates below it wear (founder, Aug 20: "the words feel like they
            // are propped up, the same depth as the containers below it") —
            // soft fill plus the gold hairline, never bare text on the page.
            Text(take)
                .font(.system(size: 15))
                .foregroundStyle(ScoutMock.warm.opacity(0.92))
                .lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 13).padding(.vertical, 11)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(ScoutMock.warm.opacity(0.04)))
                .overlay(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .stroke(GaryColors.gold.opacity(0.32), lineWidth: 0.6))
            // No fixedSize here: an HStack already sizes to its tallest
            // child, and THAT height is what the plates' maxHeight
            // .infinity stretches into. Forcing ideal height (the Aug 6
            // first attempt) removed the definite container height the
            // stretch needs, so the short plate stayed a stub.
            if left != nil || right != nil {
                HStack(alignment: .top, spacing: 8) {
                    plate(left, home: false)
                    plate(right, home: true)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
    }
}

/// THE NOTEBOOK (mock MY 08) — prose chapters assembled from real fields in
/// fixed templates (never generated), each with its data line underneath.
struct ScoutNotebookSection: View {
    let d: ScoutTrioData

    // (The Arms chapter moved OUT of the Notebook Jul 22 evening — the
    // ScoutArmsSection above owns the pitchers now: prose + plates, Comp C.
    // The park/series chapters and the chapter renderer left with the Sep 1
    // extraction — ScoutNewsCard is the one chapter that survives.)

    var body: some View {
        // THE PARK and THE SERIES moved into the Big Numbers rail (founder,
        // Aug 6) — each fact lives once on the page. THE NEWS stays: the wire
        // is the one chapter nothing else on the page carries.
        if !d.wireLines.isEmpty, let wire = d.wireText {
            ScoutNewsCard(text: wire)
        }
    }
}

/// THE NEWS card — the Notebook's one surviving chapter as a reusable
/// component (Sep 1 2026): the football page mounts the same card for its
/// wire lines, so the news reads identically on every sport.
struct ScoutNewsCard: View {
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 5) {
                Text("THE NEWS")
                    .font(GaryFonts.display(13)).tracking(0.8)
                    .foregroundStyle(GaryColors.gold)
                Text(text)
                    .foregroundColor(ScoutMock.warm.opacity(0.88))
                    .font(.system(size: 13.5).monospacedDigit())
                    .lineSpacing(4)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 12)
        }
        .padding(.horizontal, 15).padding(.top, 2).padding(.bottom, 14)
        .background(ScoutMock.cardShape)
        .padding(.horizontal, 16)
    }
}

/// THE HEAD-TO-HEAD — the season series, on the GAME page only (founder,
/// Aug 6). One contained section: its own title, then the ledger. Renders
/// nothing when the game has no series row or the row predates the meetings
/// payload, so a thin day simply drops the section instead of showing a stub.
struct GameH2HSection: View {
    let edges: [Signal]

    private var row: Signal? {
        edges.first { $0.kind == .h2h && !($0.h2h?.meetings ?? []).isEmpty }
    }

    var body: some View {
        if let row {
            VStack(alignment: .leading, spacing: 0) {
                Text("THE HEAD-TO-HEAD")
                    .font(GaryFonts.display(13)).tracking(0.8)
                    .foregroundStyle(GaryColors.gold)
                    .padding(.horizontal, 14).padding(.top, 12)
                HeadToHeadRow(s: row) { _ in }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(ScoutMock.cardShape)
            .padding(.horizontal, 16)
        }
    }
}

extension String {
    /// "wind at 2 mph · total sits at 9" → "Wind at 2 mph · total sits at 9".
    /// Only the first character moves — the rest keeps whatever case the real
    /// field had (venue names, team abbrs).
    var capitalizedFirst: String {
        guard let f = first else { return self }
        return String(f).uppercased() + dropFirst()
    }
}

/// THE BIG NUMBERS — five fixed, grounded pregame facts: team HR power over
/// five games, bullpen ERA over 14 days, run differential over 10 games,
/// weather and the current series. No ranked-insight roulette: every game uses
/// the same grammar and every rolling window stops before the slate date.
/// One row of THE BIG NUMBERS rail: the oversized numeral and its sentence
/// (the bold lead, then the quieter rest). Public so every sport's page can
/// build rows for the same rail.
struct ScoutBigNumberRow: Identifiable {
    let id: String
    let numeral: String
    let bold: String
    let rest: String
    let fractionNumerator: Int?
    let fractionDenominator: Int?

    init(id: String, numeral: String, bold: String, rest: String,
         fractionNumerator: Int? = nil, fractionDenominator: Int? = nil) {
        self.id = id
        self.numeral = numeral
        self.bold = bold
        self.rest = rest
        self.fractionNumerator = fractionNumerator
        self.fractionDenominator = fractionDenominator
    }

    static func american(_ v: Double) -> String {
        let n = Int(v.rounded())
        return n > 0 ? "+\(n)" : "\(n)"
    }

    /// THE LINE — the current price leads, one book, display only (never on
    /// Gary's desk). The sentence carries open → now so the movement remains
    /// explicit without repeating the full ladder in the oversized numeral.
    /// Shared by every sport's rail (Sep 1 2026).
    static func lineMove(awayName: String, homeName: String,
                         openAway: Double?, curAway: Double?, openHome: Double?, curHome: Double?) -> ScoutBigNumberRow? {
        var best: (name: String, open: Double, cur: Double, delta: Double)? = nil
        for (open, cur, name) in [(openAway, curAway, awayName), (openHome, curHome, homeName)] {
            guard let open, let cur else { continue }
            let delta = open - cur          // positive = price shortened = money came in
            if delta >= 1, delta > (best?.delta ?? 0) { best = (name, open, cur, delta) }
        }
        if let b = best {
            return ScoutBigNumberRow(id: "line-move",
                                     numeral: american(b.cur),
                                     bold: "\(b.name) opened \(american(b.open)) and are now \(american(b.cur))", rest: "")
        }
        // No move — show the favorite holding its number. THE LINE closes the
        // rail whenever prices are posted (founder, Aug 14: the market row is
        // the fifth one); with no opening number on file there is nothing to
        // have held, so the row says only what the board says now.
        guard let ha = curAway, let hh = curHome else { return nil }
        let homeFav = hh <= ha
        let name = homeFav ? homeName : awayName
        let price = homeFav ? hh : ha
        guard openAway != nil || openHome != nil else {
            return ScoutBigNumberRow(id: "line-move", numeral: american(price),
                                     bold: "\(name) are \(american(price)) on the board", rest: "")
        }
        return ScoutBigNumberRow(id: "line-move", numeral: american(price),
                                 bold: "The line hasn't moved — \(name) opened here and hold", rest: "")
    }
}

/// THE BIG NUMBERS rail as a reusable layout (Sep 1 2026): the first two
/// numerals in gold, the rest in warm, hairlines between rows, the whole
/// stack on the page card. Pure layout — the sport supplies the rows.
struct ScoutBigNumbersRail: View {
    let rows: [ScoutBigNumberRow]

    var body: some View {
        if !rows.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { i, r in
                    // CENTER, not baseline (founder, Aug 6: "the words next to
                    // it should be in the middle not like at the bottom") — a
                    // 40pt numeral against a two-line sentence sat the words on
                    // the numeral's baseline, i.e. at its foot.
                    HStack(alignment: .center, spacing: 14) {
                        Group {
                            if let numerator = r.fractionNumerator,
                               let denominator = r.fractionDenominator {
                                HStack(alignment: .top, spacing: 0) {
                                    Text("\(numerator)/")
                                        .font(GaryFonts.display(40))
                                    Text("\(denominator)")
                                        .font(GaryFonts.display(20))
                                        .padding(.top, 2)
                                }
                            } else {
                                Text(r.numeral)
                                    .font(GaryFonts.display(40))
                                    .lineLimit(1).minimumScaleFactor(0.5)
                            }
                        }
                        .foregroundStyle(i < 2 ? GaryColors.gold : ScoutMock.warm)
                        .frame(minWidth: 64, alignment: .leading)
                        (Text(r.bold).bold().foregroundColor(ScoutMock.warm)
                            + Text(r.rest).foregroundColor(ScoutMock.warm.opacity(0.85)))
                            .font(.system(size: 12.5).monospacedDigit())
                            .lineSpacing(2.5)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.horizontal, 14).padding(.vertical, 12)
                    if i < rows.count - 1 {
                        Rectangle().fill(Color.white.opacity(0.06)).frame(height: 1)
                    }
                }
            }
            .background(ScoutMock.cardShape)
            .padding(.horizontal, 16)
        }
    }
}

struct ScoutBigNumbersSection: View {
    let d: ScoutTrioData

    private typealias Row = ScoutBigNumberRow
    // THE LADDER (founder GO, Aug 14 2026). Rows 1-2 are fixed (HR L5, pen ERA
    // L14). Rows 3-5 fill from a ranked list of conditional reads — line move,
    // significant streak, live vs-hand split — with two always-available floor
    // rows (NRFI lean, pen workload) beneath them, so a quiet game still
    // renders five rows and a loud game leads with its loudest facts.
    private var rows: [Row] {
        var out = [homeRunsRow, bullpenRow].compactMap { $0 }
        // Slots 3-4: the loudest qualifying reads, floors beneath so they
        // always fill. Slot 5: THE LINE, always (founder, Aug 14: "where is
        // line movement? that is the fifth one") — moved or not, the market
        // row closes the rail whenever lines are posted.
        let ladder = [streakRow, vsHandRow, nrfiRow, scoringPaceRow].compactMap { $0 }
        let line = lineMoveRow
        out.append(contentsOf: ladder.prefix(line != nil ? 2 : 3))
        if let line { out.append(line) }
        return out
    }

    private static func american(_ v: Double) -> String { ScoutBigNumberRow.american(v) }

    /// THE LINE — shared with every sport's rail (ScoutBigNumberRow.lineMove).
    private var lineMoveRow: Row? {
        ScoutBigNumberRow.lineMove(awayName: d.awayName, homeName: d.homeName,
                                   openAway: d.mlOpenAway, curAway: d.mlAway, openHome: d.mlOpenHome, curHome: d.mlHome)
    }

    /// W5/L5 or longer, either club; the league-longest tag rides when true.
    private var streakRow: Row? {
        var best: (name: String, streak: String, len: Int, won: Bool, longest: Bool)? = nil
        for (st, name, longest) in [(d.awayStreakL, d.awayName, d.awayStreakLongest),
                                    (d.homeStreakL, d.homeName, d.homeStreakLongest)] {
            guard let st, st.count >= 2, let len = Int(st.dropFirst()), len >= 5 else { continue }
            if len > (best?.len ?? 0) { best = (name, st, len, st.hasPrefix("W"), longest) }
        }
        guard let b = best else { return nil }
        var text = "\(b.name) have \(b.won ? "won" : "lost") \(b.len) straight"
        if b.longest { text += " — the longest live \(b.won ? "winning" : "losing") streak in baseball" }
        return Row(id: "streak", numeral: b.streak, bold: text, rest: "")
    }

    /// A lineup's season OPS against the hand it actually draws tonight.
    /// Qualifies when the number is stark: facing-hand OPS ≤ .680, or an
    /// 80-point gap between hands. The weaker side is the subject.
    private var vsHandRow: Row? {
        var best: (name: String, side: TomorrowVsHandSide, ops: Double)? = nil
        for (side, name) in [(d.vsHandAway, d.awayName), (d.vsHandHome, d.homeName)] {
            guard let side, let ops = side.ops_vs, side.faces != nil else { continue }
            let gap = (side.ops_other ?? ops) - ops
            guard ops <= 0.680 || gap >= 0.080 else { continue }
            if best == nil || ops < best!.ops { best = (name, side, ops) }
        }
        guard let b = best, let hand = b.side.faces else { return nil }
        let handWord = hand == "L" ? "lefties" : "righties"
        let article = hand == "L" ? "a lefty" : "a righty"
        let opsStr = String(format: "%.3f", b.ops).replacingOccurrences(of: "0.", with: ".")
        return Row(id: "vs-hand", numeral: opsStr,
                   bold: "\(b.name) hit \(opsStr) OPS against \(handWord) — and they draw \(article) tonight",
                   rest: "")
    }

    /// FLOOR — the 1st-inning lean. The posted 0.5-run market names the lean
    /// when a book has one (under = NRFI); the ten-game counts are the
    /// evidence either way, and they decide the label when no market is up.
    private var nrfiRow: Row? {
        guard let a = d.awayFirstInnL10, let h = d.homeFirstInnL10 else { return nil }
        var label: String
        var oddsBit = ""
        if let under = d.nrfi?.under, let over = d.nrfi?.over {
            label = under <= over ? "NRFI" : "YRFI"
            let price = label == "NRFI" ? under : over
            oddsBit = " — \(label) \(Self.american(Double(price)))"
        } else {
            label = (a + h) <= 8 ? "NRFI" : "YRFI"
        }
        return Row(id: "nrfi", numeral: label,
                   bold: "First innings: \(d.awayName) \(a)/10 · \(d.homeName) \(h)/10 scoring in the 1st",
                   rest: oddsBit,
                   fractionNumerator: max(a, h), fractionDenominator: 10)
    }

    /// FLOOR — the last guaranteed row: each club's scoring pace over its
    /// exact last ten. The hotter offense leads.
    private var scoringPaceRow: Row? {
        guard let a = d.awayRunsPgL10, let h = d.homeRunsPgL10 else { return nil }
        let awayLeads = a >= h
        let lead = awayLeads ? (d.awayName, a) : (d.homeName, h)
        let trail = awayLeads ? (d.homeName, h) : (d.awayName, a)
        return Row(id: "pace-l10", numeral: String(format: "%.1f", lead.1),
                   bold: "\(lead.0) score \(String(format: "%.1f", lead.1)) runs a game over their last ten",
                   rest: " · \(trail.0) \(String(format: "%.1f", trail.1))")
    }



    /// The stronger five-game power side leads; the comparison remains in the
    /// sentence so the number has matchup context instead of standing alone.
    private var homeRunsRow: Row? {
        guard let away = d.awayHomeRunsL5, let home = d.homeHomeRunsL5 else { return nil }
        if away == home {
            return Row(id: "hr-l5", numeral: "\(away) HR",
                       bold: "Both teams have hit \(away) home runs over their last 5 games", rest: "")
        }
        let awayLeads = away > home
        let leader = awayLeads ? d.awayName : d.homeName
        let leaderValue = awayLeads ? away : home
        let trailer = awayLeads ? d.homeName : d.awayName
        let trailerValue = awayLeads ? home : away
        return Row(id: "hr-l5", numeral: "\(leaderValue) HR",
                   bold: "\(leader) lead \(trailer) \(leaderValue)–\(trailerValue) in homers over their last 5 games",
                   rest: "")
    }

    /// Lower is better. Both ERAs print, but the cleaner bullpen owns the big
    /// numeral so the matchup's relief advantage reads immediately.
    private var bullpenRow: Row? {
        guard let away = d.awayBullpenERAL14, let home = d.homeBullpenERAL14 else { return nil }
        if abs(away - home) < 0.005 {
            return Row(id: "bullpen-era-l14", numeral: String(format: "%.2f", away),
                       bold: "Both bullpens own the same ERA over the last 14 days", rest: "")
        }
        let awayLeads = away < home
        let leader = awayLeads ? d.awayName : d.homeName
        let leaderValue = awayLeads ? away : home
        let trailer = awayLeads ? d.homeName : d.awayName
        let trailerValue = awayLeads ? home : away
        return Row(id: "bullpen-era-l14", numeral: String(format: "%.2f", leaderValue),
                   bold: "\(leader) have the lower bullpen ERA over the last 14 days",
                   rest: " · \(trailer) \(String(format: "%.2f", trailerValue))")
    }



    /// THIS series only — the set they're playing right now (founder, Aug 6:
    /// "for the SEries its ONLY tHIS series they are currently playing not the
    /// past one that is what the H2h is for"). Each stored meeting carries its
    /// own venue, so the current set is the trailing run sharing the most
    /// recent one; anything before the venue changed was a different trip and
    /// belongs to the head-to-head ledger, not here.

    var body: some View {
        ScoutBigNumbersRail(rows: rows)
    }
}

struct PicksGamePage: View {
    let group: (matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])
    let entries: [(pick: GaryPick, isYesterday: Bool)]
    let gamePickResult: (GaryPick) -> String?
    let resultForProp: (PropPick) -> String?
    let edges: [Signal]
    /// This game's BDL id (from its slate row) — doubleheader-exact live-score
    /// lookups; nil when the slate hasn't landed.
    var bdlGameId: Int? = nil
    /// Exact daily-slate/live-score interruption label for the no-pick card.
    var interruptionLabel: String? = nil
    let onTapProp: (PropPick) -> Void
    /// Flips the whole Picks view to YESTERDAY's board/results — wired from the
    /// locked look-ahead card so a user with no pick yet can go see last night.
    var onSeeYesterday: (() -> Void)? = nil
    /// League carried by the carousel's exact slate identity. This is present
    /// before picks/props/insights and prevents a football placeholder from
    /// falling through to baseball's page modules while morning data loads.
    var pageLeagueHint: String? = nil

    /// The shared day board — feeds THE SCOUT and lets the league branches
    /// below engage from the MORNING, before any pick or intel row exists
    /// (founder, Jul 7: the game page sat blank until the first intel run).
    @State private var scoutBoard: TomorrowBoard? = nil
    @State private var scoutWire: [SupabaseAPI.WireItem] = []

    private var matchSides: (away: String, home: String) {
        let p = group.matchup.components(separatedBy: " @ ")
        return (p.first ?? "", p.count > 1 ? p[1] : "")
    }
    private static func scoutSideMatches(_ boardName: String?, _ side: String) -> Bool {
        guard let b = boardName?.lowercased(), !b.isEmpty else { return false }
        let s = side.lowercased()
        return s == b || s.hasSuffix(b) || b.hasSuffix(s)
    }
    private var scoutRow: TomorrowBoardRow? {
        scoutBoard?.board.first {
            Self.scoutSideMatches($0.away_team, matchSides.away) &&
            Self.scoutSideMatches($0.home_team, matchSides.home) &&
            // Doubleheader days: the row must be THIS game's (same start
            // bucket) — never the twin's lines (Jul 22 2026).
            (!group.dh || PicksCarouselView.timeBucket(parseISO8601($0.commence_time ?? ""))
                == PicksCarouselView.timeBucket(group.commence))
        }
    }
    private var topProps: [PropPick] {
        // The slip scales — show up to 5, strongest first, and the home run
        // ALWAYS rides last (founder, Sep 3 2026: four cards a game — two
        // props, the game pick, then the long shot). One HR card per game;
        // its price, not its confidence, is the reason it is on the page.
        let core = group.props.filter { !$0.isHRLane }
            .sorted { ($0.confidence ?? 0) > ($1.confidence ?? 0) }
        let longShots = group.props.filter { $0.isHRLane }
            .sorted { ($0.confidence ?? 0) > ($1.confidence ?? 0) }
        return Array(core.prefix(5)) + Array(longShots.prefix(1))
    }

    /// One league identity for the whole page. Prefer the card payload, then
    /// the slate row, then a fetched edge so a morning look-ahead still mounts
    /// the correct sport surface before Gary's pick arrives.
    private var pageLeague: String {
        if let league = pageLeagueHint, !league.isEmpty { return league.uppercased() }
        if let league = group.props.first?.effectiveLeague, !league.isEmpty { return league.uppercased() }
        if let league = entries.first?.pick.league, !league.isEmpty { return league.uppercased() }
        if let league = scoutRow?.league, !league.isEmpty { return league.uppercased() }
        return edges.first?.league.label ?? ""
    }

    /// MLB games swap the flat GAME INTEL list for the modular MLB dashboard.
    private var isMLB: Bool { pageLeague == "MLB" }
    private var isFootball: Bool { pageLeague == "NFL" || pageLeague == "NCAAF" }

    /// "Blue Jays @ Red Sox" — mascot-short matchup name for the white page header.
    /// Keeps two-word mascots whole and WC nations intact (never the bare last word).
    private var matchupTitle: String {
        let parts = group.matchup.components(separatedBy: " @ ")
        guard parts.count == 2 else { return group.matchup }
        let lg = pageLeague
        return "\(Formatters.shortTeamName(parts[0], league: lg)) @ \(Formatters.shortTeamName(parts[1], league: lg))"
    }

    /// The live/final score strip ("FINAL SD 4 · PHI 6") leads the page while the
    /// game is in progress or done; pre-game opens straight to the pick.
    /// Doubleheader-exact: the BDL id resolves THIS game's row; a doubleheader
    /// page never borrows its twin's score via the matchup-string fallback.
    @ObservedObject private var liveCache = LiveScoreCache.shared
    private var heroScore: LiveScore? {
        if let bdlGameId {
            return liveCache.status(forGameId: bdlGameId, league: pageLeague)
        }
        guard !group.dh else { return nil }
        let legacy = liveCache.status(forMatchup: group.matchup)
        return legacy?.isInterrupted == true ? nil : legacy
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            // The page leads STRAIGHT with Gary's pick (user call, Jun 18). The
            // matchup name + live score already live on the nav-bar tab above and
            // on each pick card's own slot (liveInSlot below), so we no longer
            // repeat a white title + LiveScoreStrip header here — the user selects
            // the game and sees the pick first, then scrolls to the intel.
            if entries.count + topProps.count > 0 {
                // All of this matchup's plays ride ONE horizontal carousel — game
                // pick(s) first (World Cup ships two: a SIDE and a TOTAL), then the
                // prop cards, strongest first. Swipe one at a time, a sliver of the
                // next peeking — the exact same full-size carousel as Home's Top
                // Plays (cardW = screen − 44). The pick cards are FULL SIZE and
                // unchanged — this only replaces the old vertical list.
                let cardW = UIScreen.main.bounds.width - (GaryLayout.gutter * 2 + 12)   // a sliver of the next card peeks
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: 12) {
                        ForEach(Array(entries.enumerated()), id: \.offset) { _, e in
                            FlippablePickCard(pick: e.pick,
                                              gameResult: gamePickResult(e.pick),
                                              showSportBadge: false,
                                              liveInSlot: true,
                                              interruptionLabel: interruptionLabel)
                                .frame(width: cardW)
                        }
                        ForEach(topProps) { p in
                            FlippablePropCard(prop: p, gameResult: resultForProp(p), showSportBadge: true, liveInSlot: true, interruptionLabel: interruptionLabel)
                                .frame(width: cardW)
                        }
                    }
                    .padding(.horizontal, 16)
                }
            } else {
                // No pick yet → keep the standard placeholder in the pick slot.
                // Its exact game commence time is the source of truth: upcoming
                // games say INCOMING; once kickoff/first pitch passes, the same
                // card says NO PICK THIS GAME. Do not hide that honest state merely
                // because the live-score cache also knows the game is live/final.
                TeasedPickCard(league: pageLeague.isEmpty ? nil : pageLeague,
                               time: group.time.isEmpty ? nil : group.time,
                               // The slate/group timestamp is preferred; a prop's
                               // game timestamp is a defensive fallback for rows
                               // assembled before the slate finishes hydrating.
                               commence: group.commence ?? parseISO8601(group.props.first?.commence_time ?? ""),
                               interruptionLabel: interruptionLabel,
                               onSeeYesterday: onSeeYesterday)
                    .padding(.horizontal, 16)
            }

            // THE SCOUT — on the page from the morning, stays as the live
            // sections underneath fill in (founder, Jul 7).
            // All-Star specials swap the team-game scout/intel for the event's
            // own "lineup": the contest field (founder, Jul 13 — the page works
            // like any other game day, the field IS the lineup view).
            // STORE-SAFE BRIDGE: the Derby contest board prints "R1 O/U …
            // +250" lines — the whole special rides the flag (seasonal
            // surface, dormant outside All-Star week anyway).
            if !AppFlags.storeSafe, entries.contains(where: { ($0.pick.type ?? "") == "special" }) {
                DerbyContestSection()
            } else if isFootball {
                FootballGameIntelView(
                    league: pageLeague,
                    matchup: group.matchup,
                    picks: entries.map(\.pick),
                    props: topProps,
                    row: scoutRow,
                    edges: edges,
                    wire: scoutWire
                )
            } else {
            // The Scout Trio (founder, Jul 22): the three approved mocks
            // stacked in his order — THE TUG, THE NOTEBOOK, THE BIG NUMBERS.
            // One shared extraction feeds all three; GameScoutSection retired
            // from this page (struct kept while the design settles).
            let trio = ScoutTrioData(matchup: group.matchup, row: scoutRow, board: scoutBoard, wire: scoutWire,
                                     commence: group.commence, isDoubleheader: group.dh)
            // "SCOUTING REPORT" label removed (founder, Aug 4) — the page
            // opens straight with THE ARMS.
            ScoutArmsSection(d: trio)
            ScoutNotebookSection(d: trio)
            ScoutBigNumbersSection(d: trio)
            // The season series lives HERE and only here (founder, Aug 6).
            GameH2HSection(edges: edges)
            PlayerIntelSection(matchup: group.matchup)
            }
            if isMLB {
                // MLB: the flat GAME INTEL list becomes the modular dashboard —
                // a baseball-field anchor + Pitching / Bats / Park & Weather.
                // The field + real (projected → confirmed) lineup self-load off
                // mlb_field_lineups. The Derby page keeps it too (founder):
                // a synthetic lineup row carries the 8 contestants, so the
                // standard field view + tappable player cards just work.
                MLBGameIntelView(matchup: group.matchup, edges: edges, showHeader: false)
            } else if !isFootball && !entries.contains(where: { ($0.pick.type ?? "") == "special" }) {
                EdgesSection(title: "GAME INTEL", edges: edges)
            }
        }
        .padding(.top, 14)
        .task {
            scoutBoard = await TodayBoardCache.get()
            scoutWire = await ScoutWireCache.get()
        }
        .onAppear { LiveScoreCache.shared.startIfNeeded() }
    }
}

/// PLAYER INTEL — the game page's player-level layer, between the props and
/// GAME INTEL. One row per player with a breakdown pack today (the probable
/// starters lead, then hitters); tapping a row opens the same full breakdown
/// sheet the Hub uses. Rows ride player_insight_cards (computed daily by the
/// insights pipeline) and the section hides itself entirely on days or games
/// without packs. Football pages mount it too (Aug 27 2026 — football packs
/// build now), scoped by exact game id.
struct PlayerIntelSection: View {
    let matchup: String
    /// Exact-id scope (football pages, Aug 27 2026): football packs carry the
    /// BDL game id, and college abbreviations have no keyword table for the
    /// matchup-string join — when the caller knows the game id, packs attach
    /// by identity instead. MLB keeps the matchup join unchanged (nil here).
    var gameId: String? = nil
    @State private var rows: [PlayerInsightCardRow] = []
    @State private var selected: PlayerInsightCardRow? = nil

    /// Keeps the page scannable — the slate page is a stack, not a roster dump.
    private static let maxRows = 8

    var body: some View {
        Group {
            if !rows.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("PLAYER INTEL")
                        .font(GaryFonts.mono(9.5, bold: true)).tracking(1)
                        .foregroundStyle(.white.opacity(0.62))
                        .padding(.horizontal, 16).padding(.top, 4)
                    VStack(spacing: 0) {
                        ForEach(Array(rows.enumerated()), id: \.element.id) { idx, row in
                            Button { selected = row } label: { intelRow(row) }
                                .buttonStyle(.plain)
                            if idx < rows.count - 1 {
                                Divider().background(Color.white.opacity(0.05)).padding(.leading, 14)
                            }
                        }
                    }
                    .quantPanel()
                    .padding(.horizontal, 16)
                }
            }
        }
        .task(id: matchup + (gameId ?? "")) {
            let all = await SupabaseAPI.fetchPlayerIntelRows(date: SupabaseAPI.todayEST())
            let mine = all.filter { r in
                if let gameId { return r.game_id == gameId }
                guard let g = r.payload?.game, !g.isEmpty else { return false }
                return abbrGameMatches(g, matchup: matchup)
            }
            // Pitchers lead (they drive the matchup) — quarterbacks are the
            // football counterpart — then everyone else by name.
            rows = Array(mine.sorted { a, b in
                let leads: Set<String> = ["pitcher", "quarterback"]
                let ap = leads.contains(a.payload?.type ?? ""), bp = leads.contains(b.payload?.type ?? "")
                if ap != bp { return ap }
                return (a.player_name ?? "") < (b.player_name ?? "")
            }.prefix(Self.maxRows))
        }
        .sheet(item: $selected) { PlayerInsightSheet(signal: nil, prefetched: $0) }
    }

    private func intelRow(_ row: PlayerInsightCardRow) -> some View {
        let p = row.payload
        let meta = [p?.team?.uppercased(), p?.position].compactMap { $0 }.joined(separator: " · ")
        // Football packs carry no strengths/weaknesses — their season line is
        // the row's one-glance signal instead.
        let signalLine = p?.strengths?.first ?? p?.weaknesses?.first ?? p?.season?.line1
        return HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 8) {
                    Text(row.player_name ?? p?.name ?? "Player")
                        .font(GaryFonts.text(14, .semibold)).foregroundStyle(.white)
                    if !meta.isEmpty {
                        Text(meta).font(GaryFonts.mono(9.5)).foregroundStyle(.white.opacity(0.62))
                    }
                }
                if let line = signalLine {
                    Text(line)
                        .font(GaryFonts.text(12)).foregroundStyle(.white.opacity(0.55))
                        .lineLimit(2)
                }
            }
            Spacer(minLength: 8)
            Image(systemName: "chevron.right")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.white.opacity(0.25))
        }
        .padding(.horizontal, 14).padding(.vertical, 11)
        .contentShape(Rectangle())
    }
}
