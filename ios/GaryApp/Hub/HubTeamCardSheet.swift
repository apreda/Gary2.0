import SwiftUI

/// Team details assembled from fetched board, streak and player evidence.
/// Missing facts are omitted; names retain their player/team detail routes.
struct HubTeamCardSheet: View {
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

