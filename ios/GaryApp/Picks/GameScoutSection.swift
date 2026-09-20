import SwiftUI

/// SCOUTING REPORT — final form (founder-picked, Jul 7 PM): S5 Bebas team+
/// price heads · S3 series tug + venue split + S9 last-three meetings · THE
/// ARMS as P34/P23 blocks (side-tinted Bebas plate + quality-start tag +
/// statement ladder: label zone | rule | values) · LAST 10 as an F1 kicker
/// row · hanging-indent WIRE · conditions footer. Flat on the page;
/// every fact server-grounded; every row omits itself when data is short.
struct GameScoutSection: View {
    let matchup: String
    var row: TomorrowBoardRow? = nil
    var board: TomorrowBoard? = nil
    var wire: [SupabaseAPI.WireItem] = []
    /// Odds captured at pick time (GaryPick.moneylineAway/Home). When present
    /// the header wears Gary's exact numbers — never a drifted board snapshot
    /// (founder, Jul 10: "MLB has to match").
    var pickMl: (away: Double?, home: Double?)? = nil

    private var sides: (away: String, home: String) {
        let p = matchup.components(separatedBy: " @ ")
        return (p.first ?? "", p.count > 1 ? p[1] : "")
    }
    private static func sideMatches(_ boardName: String?, _ side: String) -> Bool {
        guard let b = boardName?.lowercased(), !b.isEmpty else { return false }
        let s = side.lowercased()
        return s == b || s.hasSuffix(b) || b.hasSuffix(s)
    }
    private func abbr(_ side: String, fallback: String?) -> String {
        scoreboardTeamAbbreviation(side, stored: fallback, league: row?.league)
    }
    private static func odds(_ v: Double?) -> String? {
        guard let v else { return nil }
        let i = Int(v)
        return i > 0 ? "+\(i)" : "\(i)"
    }
    private static func num(_ v: Double?) -> String? {
        guard let v else { return nil }
        return v == v.rounded() ? String(format: "%.0f", v) : String(format: "%.1f", v)
    }

    private var league: String { (row?.league ?? "").uppercased() }
    private var headerNames: (away: String, home: String) {
        (Formatters.shortTeamName(sides.away, league: league),
         Formatters.shortTeamName(sides.home, league: league))
    }
    /// Header prices: the odds CAPTURED AT PICK TIME when a pick exists, so the
    /// scout header always matches Gary's number; the day board only fills
    /// the pre-pick morning.
    private var headOdds: (a: String?, h: String?) {
        if let pickMl, pickMl.away != nil || pickMl.home != nil {
            return (Self.odds(pickMl.away), Self.odds(pickMl.home))
        }
        return (Self.odds(row?.ml_away), Self.odds(row?.ml_home))
    }
    private var teamAbbrs: (a: String, h: String) {
        (abbr(sides.away, fallback: row?.away_abbr), abbr(sides.home, fallback: row?.home_abbr))
    }

    // MARK: styled fragments

    private static func stat(_ s: String, _ c: Color = .white.opacity(0.9)) -> Text {
        Text(s).font(GaryFonts.mono(15, bold: true)).foregroundColor(c)
    }
    private static func kicker(_ s: String) -> some View {
        Text(s).font(GaryFonts.mono(12, bold: true)).tracking(1.4)
            .foregroundStyle(GaryColors.gold.opacity(0.8))
    }
    private static func formRun(_ run: String) -> Text {
        run.reduce(Text("")) { acc, ch in
            let c: Color = ch == "W" ? GaryColors.win
                         : ch == "L" ? GaryColors.loss : .white.opacity(0.55)
            return acc + Text(String(ch)).font(GaryFonts.mono(14, bold: true)).foregroundColor(c)
        }
    }
    private static func diffText(_ v: Double?) -> Text? {
        guard let v else { return nil }
        let str = (v > 0 ? "+" : "") + (Self.num(v) ?? "0")
        return stat(str, v > 0 ? GaryColors.win : v < 0 ? GaryColors.loss : .white)
    }
    private static func last10Text(_ f: TomorrowForm?) -> Text? {
        guard let f else { return nil }
        var parts: [Text] = []
        if let l10 = f.l10, !l10.isEmpty { parts.append(stat(l10)) }
        if let st = f.streak, !st.isEmpty {
            let c: Color = st.hasPrefix("W") ? GaryColors.win
                         : st.hasPrefix("L") ? GaryColors.loss : .white
            parts.append(stat(st, c))
        }
        guard !parts.isEmpty else { return nil }
        return parts.dropFirst().reduce(parts[0]) { $0 + stat(" · ", .white.opacity(0.35)) + $1 }
    }
    /// "16.2 IP · 5 ER · 21 K" — plain; the numbers speak for themselves.
    private static func ipLine(ip: String, er: Int, k: Int?) -> Text {
        let ipShow = ip.hasSuffix(".0") ? String(ip.dropLast(2)) : ip
        var bits = "\(ipShow) IP · \(er) ER"
        if let k, k > 0 { bits += " · \(k) K" }
        return stat(bits)
    }
    /// "5 IP · 1 ER · 10 K vs CIN" — the opponent tag stays neutral.
    private static func outingText(_ o: TomorrowOuting?) -> Text? {
        guard let o, let ip = o.ip else { return nil }
        var t = ipLine(ip: ip, er: o.er ?? 0, k: o.k)
        if let opp = o.opp {
            t = t + Text(" \(o.at ?? "vs") \(opp)").font(GaryFonts.mono(13.5)).foregroundColor(.white.opacity(0.62))
        }
        return t
    }
    private static func l3Text(_ l: TomorrowL3?) -> Text? {
        guard let l, let ip = l.ip, let er = l.er else { return nil }
        return ipLine(ip: ip, er: er, k: l.k)
    }
    /// "4 days" — the note ("short" / "layoff") carries the flag in words.
    private static func restText(_ r: TomorrowRest?) -> Text? {
        guard let d = r?.days else { return nil }
        var t = stat("\(d) day\(d == 1 ? "" : "s")")
        if d <= 3 {
            t = t + Text(" · short").font(GaryFonts.mono(13.5)).foregroundColor(.white.opacity(0.62))
        } else if d >= 10 {
            t = t + Text(" · layoff").font(GaryFonts.mono(13.5)).foregroundColor(.white.opacity(0.55))
        }
        return t
    }
    private func vsOppText(_ v: TomorrowVsOpp?) -> Text? {
        guard let v, let era = v.era, let gs = v.gs else { return nil }
        return Self.stat(String(format: "%.2f ERA", era))
            + Text(" · \(gs) start\(gs == 1 ? "" : "s") this season").font(GaryFonts.mono(13.5)).foregroundColor(.white.opacity(0.62))
    }
    private func seasonText(_ st: TomorrowPerson) -> Text? {
        var bits: [Text] = []
        if let e = st.era { bits.append(Self.stat(String(format: "%.2f ERA", e))) }
        guard !bits.isEmpty else { return nil }
        return bits.dropFirst().reduce(bits[0]) { $0 + Self.stat(" · ", .white.opacity(0.35)) + $1 }
    }
    /// The name-row tag: "3 STRAIGHT QS" / "1 QS IN LAST 4" — plain, no judgment color.
    private static func qsTag(_ st: TomorrowPerson?) -> Text? {
        guard let q = st?.qs_form, let w = q.window, w >= 2, let n = q.qs else { return nil }
        let font = GaryFonts.mono(12.5, bold: true)
        let c: Color = .white.opacity(0.72)
        if let s = q.streak, s >= 2 {
            return Text("\(s) STRAIGHT QS").font(font).foregroundColor(c)
        }
        return Text("\(n) QS IN LAST \(w)").font(font).foregroundColor(c)
    }

    private func news(_ teamKey: String) -> String? {
        let key = teamKey.lowercased()
        guard !key.isEmpty else { return nil }
        let today = SupabaseAPI.todayEST()
        let mine = wire.filter {
            ($0.league ?? "").uppercased() == league
                && ($0.headline ?? "").lowercased().contains(key)
        }
        if let inj = mine.first(where: { $0.kind == "injury" }) { return inj.headline }
        return mine.first(where: { (($0.kind == "line_move" && !AppFlags.storeSafe) || $0.kind == "pace") && $0.date == today })?.headline
    }

    private var footer: String? {
        var bits: [String] = []
        if let row {
            if let ou = Self.num(row.total) { bits.append("O/U \(ou)") }
            let ab = teamAbbrs
            if let w = board?.weather?.first(where: {
                ($0.away_abbr == ab.a && $0.home_abbr == ab.h) || Self.sideMatches($0.matchup, matchup)
            }) {
                if let v = w.venue { bits.append(v) }
                if let t = w.temp_f { bits.append("\(t)°") }
                if let wind = w.wind_mph { bits.append("Wind \(wind) mph") }
                if let pr = w.precip_pct { bits.append("Rain \(pr)%") }
                if let note = w.note { bits.append(note) }
            } else if let v = row.venue {
                bits.append(v)
            }
        }
        return bits.isEmpty ? nil : bits.joined(separator: " · ")
    }

    private var awayStarter: TomorrowPerson? { board?.starters.first { $0.abbr == teamAbbrs.a } }
    private var homeStarter: TomorrowPerson? { board?.starters.first { $0.abbr == teamAbbrs.h } }
    private var hasContent: Bool {
        return row?.series != nil || awayStarter != nil || homeStarter != nil
            || board?.form?.isEmpty == false
    }

    var body: some View {
        if row != nil, hasContent {
            VStack(alignment: .leading, spacing: 0) {
                // "SCOUTING REPORT" label removed (founder, Aug 4) — the card
                // opens straight with the matchup, then the arms.
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(headerNames.away + (headOdds.a.map { " \($0)" } ?? ""))
                        .font(GaryFonts.display(24))
                        .foregroundStyle(.white.opacity(0.92))
                        .lineLimit(1).minimumScaleFactor(0.6)
                    Spacer(minLength: 8)
                    Text(headerNames.home + (headOdds.h.map { " \($0)" } ?? ""))
                        .font(GaryFonts.display(24))
                        .foregroundStyle(GaryColors.gold)
                        .lineLimit(1).minimumScaleFactor(0.6)
                }
                .padding(.bottom, 10)
                if let series = row?.series { seriesBlock(series) }
                // Gary's two sentences on the game's two starters (founder,
                // Aug 4) — the take leads, the stat plates follow as data.
                if let take = row?.arms_take {
                    Text(take)
                        .font(GaryFonts.text(14, .medium))
                        .foregroundStyle(.white.opacity(0.88))
                        .lineSpacing(4)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.bottom, 10)
                }
                mlbArms
                wireLines
                if let footer {
                    Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1)
                    Text(footer)
                        .font(GaryFonts.text(14, .medium))
                        .foregroundStyle(.white.opacity(0.78))
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 10)
                }
            }
            .pageGutter()
        }
    }

    // ── THE ARMS — Bebas plate + QS tag + statement ladder per pitcher ──

    private struct ArmRow: Identifiable {
        let id: Int
        let label: String
        let value: Text
    }
    private func armRows(_ st: TomorrowPerson, oppAbbr: String) -> [ArmRow] {
        var out: [ArmRow] = []
        if let t = Self.outingText(st.last_outing) { out.append(ArmRow(id: 0, label: "LAST OUTING", value: t)) }
        if let t = Self.l3Text(st.l3) { out.append(ArmRow(id: 1, label: "LAST \(st.l3?.gs ?? 3)", value: t)) }
        if let t = vsOppText(st.vs_opp) { out.append(ArmRow(id: 2, label: "VS \(oppAbbr)", value: t)) }
        if let t = Self.restText(st.rest) { out.append(ArmRow(id: 3, label: "REST", value: t)) }
        if let t = seasonText(st) { out.append(ArmRow(id: 4, label: "SEASON", value: t)) }
        // Debut arm (founder GO, Aug 17): zero MLB data reads as an honest
        // state + his labeled AAA/AA line — never an empty ladder, never a
        // fabricated MLB 0.00.
        if st.no_mlb_starts == true {
            out.append(ArmRow(id: 5, label: "SEASON", value: Text("No MLB starts")))
            if let m = st.milb, let era = m.era {
                var line = String(format: "%.2f ERA", era)
                if let ip = m.ip {
                    let ipShow = ip.hasSuffix(".0") ? String(ip.dropLast(2)) : ip
                    line += " · \(ipShow) IP"
                }
                out.append(ArmRow(id: 6, label: m.level ?? "MILB", value: Text(line)))
            }
        }
        return out
    }

    @ViewBuilder private func armBlock(_ st: TomorrowPerson?, tint: Color, oppAbbr: String) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(st?.name ?? "TBA")
                    .font(GaryFonts.display(20))
                    .foregroundStyle(st == nil ? tint.opacity(0.45) : tint)
                    .lineLimit(1).minimumScaleFactor(0.6)
                Spacer(minLength: 8)
                if let tag = Self.qsTag(st) { tag }
            }
            if let st {
                let rows = armRows(st, oppAbbr: oppAbbr)
                if !rows.isEmpty {
                    HStack(alignment: .top, spacing: 12) {
                        VStack(alignment: .leading, spacing: 0) {
                            ForEach(rows) { r in
                                Text(r.label)
                                    .font(GaryFonts.mono(11.5, bold: true)).tracking(1)
                                    .foregroundStyle(.white.opacity(0.62))
                                    .frame(height: 30, alignment: .leading)
                            }
                        }
                        .frame(width: 116, alignment: .leading)
                        Rectangle().fill(Color.white.opacity(0.1)).frame(width: 1)
                        VStack(alignment: .leading, spacing: 0) {
                            ForEach(rows) { r in
                                r.value
                                    .lineLimit(1).minimumScaleFactor(0.7)
                                    .frame(height: 30, alignment: .leading)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(.vertical, 10)
    }

    @ViewBuilder private var mlbArms: some View {
        let ab = teamAbbrs
        if awayStarter != nil || homeStarter != nil {
            Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1)
            armBlock(awayStarter, tint: .white.opacity(0.92), oppAbbr: ab.h)
            Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1)
            armBlock(homeStarter, tint: GaryColors.gold, oppAbbr: ab.a)
        }
        if let fa = board?.form?.first(where: { $0.abbr == ab.a || Self.sideMatches($0.team, sides.away) }),
           let fh = board?.form?.first(where: { $0.abbr == ab.h || Self.sideMatches($0.team, sides.home) }),
           let ta = Self.last10Text(fa), let th = Self.last10Text(fh) {
            Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1)
            VStack(alignment: .leading, spacing: 5) {
                Self.kicker("LAST 10")
                HStack {
                    ta
                    Spacer(minLength: 10)
                    th
                }
            }
            .padding(.vertical, 10)
        }
    }

    /// S3's tug + venue split + S9's meetings.
    @ViewBuilder private func seriesBlock(_ s: TomorrowSeries) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            if let split = s.split_line {
                Text("SERIES · \(split)")
                    .font(GaryFonts.mono(13, bold: true))
                    .foregroundStyle(.white.opacity(0.68))
            }
            if let meets = s.meetings, !meets.isEmpty {
                VStack(alignment: .leading, spacing: 3) {
                    ForEach(Array(meets.enumerated()), id: \.offset) { _, m in
                        HStack(spacing: 8) {
                            Text(m.d ?? "")
                                .font(GaryFonts.mono(14.5, bold: true))
                                .foregroundStyle(.white.opacity(0.88))
                                .frame(width: 62, alignment: .leading)
                            Text(m.line ?? "")
                                .font(GaryFonts.mono(14.5, bold: true))
                                .foregroundStyle(.white.opacity(0.88))
                            Spacer(minLength: 8)
                            Text(m.venue ?? "")
                                .font(GaryFonts.mono(14.5))
                                .foregroundStyle(.white.opacity(0.62))
                        }
                    }
                }
                .padding(.top, 6)
            }
        }
        .padding(.bottom, 12)
    }

    /// Hanging-indent wire notes (injury first), de-duped across the sides.
    @ViewBuilder private var wireLines: some View {
        let aKey = Formatters.shortTeamName(sides.away, league: "MLB")
        let hKey = Formatters.shortTeamName(sides.home, league: "MLB")
        let items = [news(aKey), news(hKey)].compactMap { $0 }
        let uniq = items.reduce(into: [String]()) { if !$0.contains($1) { $0.append($1) } }
        if !uniq.isEmpty {
            Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1)
            HStack(alignment: .top, spacing: 10) {
                Text("WIRE")
                    .font(GaryFonts.mono(10.5, bold: true)).tracking(1)
                    .foregroundStyle(GaryColors.gold.opacity(0.8))
                    .padding(.top, 2)
                VStack(alignment: .leading, spacing: 5) {
                    ForEach(uniq, id: \.self) { h in
                        Text(h)
                            .font(GaryFonts.text(14.5))
                            .foregroundStyle(.white.opacity(0.8))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .padding(.vertical, 10)
        }
    }
}
