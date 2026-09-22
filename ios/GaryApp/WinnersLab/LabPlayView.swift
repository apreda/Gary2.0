import SwiftUI

// THE WINNERS LAB — the breakdown. One play, full screen: the ticket, the
// tracker, the number, the tape, why it made the board, the case, the other
// side, what rode with it, the key numbers, and the desk Gary read.

enum LabRoute: Hashable {
    case play(Int)
    case system(UserSystem)
}

struct LabPlayView: View {
    let candidateID: Int
    @State private var play: WinnersPlay?
    @State private var loading = true
    @State private var error: String?
    @State private var briefingOpen = false
    @State private var deskSheet: DeskText?
    @State private var deskLoading: Int?
    @State private var deskError: String?
    @ObservedObject private var liveCache = LiveScoreCache.shared
    @ObservedObject private var propCache = LivePropStatsCache.shared
    @Environment(\.scenePhase) private var scenePhase

    struct DeskText: Identifiable { let id: Int; let title: String; let text: String }

    var body: some View {
        ZStack {
            GaryColors.ink.ignoresSafeArea()
            if let play {
                ScrollView(showsIndicators: false) {
                    LazyVStack(alignment: .leading, spacing: 14) {
                        hero(play)
                        keyNumbers(play)
                        trackerPlate(play)
                        HStack(alignment: .top, spacing: 12) {
                            numberPlate(play)
                            tapePlate(play)
                        }
                        booksPlate(play)
                        casePlate(play)
                        if let cases = play.cases, (cases.home ?? "").isEmpty == false || (cases.away ?? "").isEmpty == false {
                            otherSidePlate(play, cases: cases)
                        }
                        if !play.with_it.isEmpty { withItPlate(play) }
                        deskPlate(play)
                        if let briefing = play.briefing, !briefing.isEmpty { briefingPlate(briefing) }
                        Color.clear.frame(height: 150)
                    }
                    .padding(.horizontal, GaryLayout.gutter)
                    .padding(.top, 8)
                }
            } else if loading {
                ProgressView().tint(GaryColors.gold).scaleEffect(1.2)
            } else {
                VStack(spacing: 10) {
                    Text("This play couldn't be opened.").font(GaryFonts.text(14, .semibold)).foregroundStyle(GaryColors.warmWhite)
                    Text(error ?? "Try again in a moment.").font(GaryFonts.ui(12.5)).foregroundStyle(LabInk.dim).multilineTextAlignment(.center)
                    Button("Try again") { Task { await load() } }.font(GaryFonts.ui(13, .semibold)).foregroundStyle(GaryColors.gold)
                }
                .padding(32)
            }
            StatusBarScrim()
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
        .tint(GaryColors.gold)
        .task { await load() }
        .onChange(of: scenePhase) { phase in if phase == .active { Task { await load(quiet: true) } } }
        .onReceive(Timer.publish(every: 90, on: .main, in: .common).autoconnect()) { _ in
            guard scenePhase == .active else { return }
            Task { await load(quiet: true) }
        }
        // The corner button talks about THIS play while the breakdown is open.
        .onChange(of: play?.candidate.id) { _ in focusTalk() }
        .onAppear { focusTalk() }
        .onDisappear { GaryTalkContext.shared.clear() }
        .background(Color.clear.sheet(item: $deskSheet) { desk in
            NavigationStack {
                ScrollView {
                    Text(LabFormat.readerDesk(desk.text)).font(GaryFonts.text(13)).foregroundStyle(LabInk.reading)
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(18)
                }
                .background(GaryColors.ink)
                .navigationTitle(desk.title)
                .navigationBarTitleDisplayMode(.inline)
            }
            .presentationDetents([.large])
        })
    }

    private func focusTalk() {
        GaryTalkContext.shared.focus(date: play?.candidate.game_date ?? SupabaseAPI.todayEST(),
                                     candidateID: candidateID,
                                     label: play.map { $0.ticketTitle })
    }

    private func load(quiet: Bool = false) async {
        if !quiet { loading = play == nil }
        do {
            let fresh = try await SupabaseAPI.fetchWinnersPlay(candidateID: candidateID)
            await MainActor.run {
                play = fresh; loading = false; error = nil
                if let prop = fresh.prop, LivePropStatsCache.BattingLine.supports(prop.prop ?? "") { propCache.track(prop) }
                liveCache.startIfNeeded()
            }
        } catch {
            await MainActor.run {
                if play == nil { self.error = LabFormat.errorText(error) }
                loading = false
            }
        }
    }

    // MARK: - Live lookups

    private func liveScore(_ play: WinnersPlay) -> LiveScore? {
        let league = play.candidate.league
        if let g = play.game, let hit = liveCache.status(forGameId: g.game_id, league: league) { return hit }
        if let p = play.prop, let hit = liveCache.status(forGameId: p.game_id, league: league) { return hit }
        if let id = play.candidate.game_id, let n = Int(id), let hit = liveCache.status(forGameId: n, league: league) { return hit }
        if let g = play.game, let away = g.awayTeam, let home = g.homeTeam, let hit = liveCache.status(forMatchup: "\(away) @ \(home)") { return hit }
        if let p = play.prop, let m = p.matchup, let hit = liveCache.status(forMatchup: m) { return hit }
        return play.live
    }

    private func propValue(_ play: WinnersPlay) -> (value: Double?, isFinal: Bool) {
        guard let prop = play.prop else { return (nil, false) }
        if let obs = propCache.observation(for: prop), let v = obs.line.value(forMarket: prop.prop ?? "") { return (Double(v), obs.isFinal) }
        if let actual = play.result?.actual_value?.value { return (actual, true) }
        return (nil, false)
    }

    // MARK: - Plates

    private func hero(_ play: WinnersPlay) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Text(play.candidate.league).font(GaryFonts.display(14)).tracking(1.4).foregroundStyle(GaryColors.gold)
                Text(matchupLine(play)).font(GaryFonts.ui(12.5, .medium)).foregroundStyle(LabInk.dim).lineLimit(1).minimumScaleFactor(0.7)
                Spacer()
                Text(LabFormat.timeET(play.candidate.commence_time)).font(GaryFonts.ui(12.5, .medium)).foregroundStyle(LabInk.dim)
            }
            Text(play.ticketTitle.uppercased())
                .font(GaryFonts.display(42)).foregroundStyle(GaryColors.warmWhite)
                .lineLimit(3).minimumScaleFactor(0.55).fixedSize(horizontal: false, vertical: true)
            HStack(alignment: .firstTextBaseline, spacing: 14) {
                Text(LabFormat.price(play.candidate.odds)).font(GaryFonts.display(30)).foregroundStyle(GaryColors.silver)
                LabUnitStamp(units: play.candidate.stake_units?.value, size: 30)
                Spacer()
                if let book = play.game?.bookHolding(price: play.candidate.odds) { Text(book).font(GaryFonts.ui(12, .medium)).foregroundStyle(LabInk.dim) }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .labPlate(radius: 16, edge: GaryColors.gold.opacity(0.45))
    }

    private func matchupLine(_ play: WinnersPlay) -> String {
        if let g = play.game { return "\(g.awayTeam ?? "") @ \(g.homeTeam ?? "")" }
        return play.prop?.matchup ?? ""
    }

    private func trackerPlate(_ play: WinnersPlay) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            LabTitle(text: play.isProp ? "The line" : "The game")
            if let prop = play.prop {
                let line = Double(prop.line ?? "") ?? Double(LabFormat.trailingNumber(prop.prop) ?? "") ?? 0
                let live = liveScore(play)
                let v = propValue(play)
                LabPropTracker(line: line, isUnder: (prop.bet ?? "").lowercased().contains("under"),
                               value: v.value, started: (live?.isLive ?? false) || (live?.isFinal ?? false) || v.value != nil,
                               isFinal: v.isFinal || (live?.isFinal ?? false),
                               result: play.result?.result, unit: LabFormat.marketWords(prop.prop))
            } else if let game = play.game {
                LabGameTracker(pick: game, live: liveScore(play), outcome: play.result)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .labPlate()
    }

    private func numberPlate(_ play: WinnersPlay) -> some View {
        let opened = openingLine(play), now = closingLine(play)
        return VStack(alignment: .leading, spacing: 10) {
            LabTitle(text: "The number")
            if let opened, let now {
                LabFigure(value: opened, caption: "Opened", size: 26)
                LabFigure(value: now, caption: play.result == nil && liveScore(play)?.isFinal != true ? "Now" : "At the start", size: 26)
            } else {
                LabFigure(value: LabFormat.price(play.candidate.odds), caption: "Gary's price", size: 26)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 150, alignment: .topLeading)
        .labPlate()
    }

    private func openingLine(_ play: WinnersPlay) -> String? { ladderLine(play, rung: play.ladder?.rungs.first) }
    private func closingLine(_ play: WinnersPlay) -> String? { ladderLine(play, rung: play.ladder?.rungs.last) }
    private func ladderLine(_ play: WinnersPlay, rung: LineRung?) -> String? {
        guard let rung, let game = play.game else { return nil }
        let body = LabFormat.ticketBody(game.pick ?? "").lowercased()
        let home = play.pickedHome
        if body.contains("over"), let t = rung.total { return "Over \(LabFormat.trim(t)) \(LabFormat.price(rung.total_over_odds))" }
        if body.contains("under"), let t = rung.total { return "Under \(LabFormat.trim(t)) \(LabFormat.price(rung.total_under_odds))" }
        if body.contains(" ml") || (game.type ?? "").lowercased().contains("money") {
            if let ml = home ? rung.ml_home : rung.ml_away { return "ML \(LabFormat.price(ml))" }
            return nil
        }
        if let s = home ? rung.spread_home : rung.spread_away {
            let odds = home ? rung.spread_home_odds : rung.spread_away_odds
            return "\(s > 0 ? "+" : "")\(LabFormat.trim(s)) \(LabFormat.price(odds))"
        }
        return nil
    }

    private func tapePlate(_ play: WinnersPlay) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            LabTitle(text: "The tape")
            if let kind = play.tape?.kind {
                LabFigure(value: kind.line, caption: "\(play.candidate.league) \(play.isProp ? "props" : "games"), 30 days", size: 26,
                          tint: (kind.units?.value ?? 0) >= 0 ? GaryColors.warmWhite : GaryColors.warmWhite)
                Text(LabFormat.unitsNet(kind.units?.value)).font(GaryFonts.display(20))
                    .foregroundStyle((kind.units?.value ?? 0) > 0 ? GaryColors.win : (kind.units?.value ?? 0) < 0 ? GaryColors.loss : GaryColors.silver)
            }
            if let board = play.tape?.board_30d, !board.isEmpty {
                VStack(alignment: .leading, spacing: 3) {
                    ForEach(board.keys.sorted(), id: \.self) { league in
                        if let line = board[league] {
                            HStack {
                                Text(league).font(GaryFonts.ui(11.5, .semibold)).foregroundStyle(LabInk.dim)
                                Spacer()
                                Text("\(line.line) \(LabFormat.unitsNet(line.units?.value))").font(GaryFonts.data(11, .semibold)).foregroundStyle(GaryColors.silver)
                            }
                        }
                    }
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 150, alignment: .topLeading)
        .labPlate()
    }

    @ViewBuilder
    private func casePlate(_ play: WinnersPlay) -> some View {
        let text = LabFormat.stripTakeHeading(play.game?.rationale ?? play.prop?.analysis ?? play.game?.game_read)
        if !text.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                LabTitle(text: "The case")
                Text(text).font(GaryFonts.text(14)).foregroundStyle(LabInk.reading).lineSpacing(3).fixedSize(horizontal: false, vertical: true)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .labPlate()
        }
    }

    private func otherSidePlate(_ play: WinnersPlay, cases: WinnersPlay.Cases) -> some View {
        let home = play.pickedHome
        let other = home ? cases.away : cases.home
        let mine = home ? cases.home : cases.away
        let otherName = (home ? cases.away_team ?? play.game?.awayTeam : cases.home_team ?? play.game?.homeTeam) ?? ""
        let myName = (home ? cases.home_team ?? play.game?.homeTeam : cases.away_team ?? play.game?.awayTeam) ?? ""
        return VStack(alignment: .leading, spacing: 14) {
            if let other, !other.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    LabTitle(text: "What beats this", note: otherName)
                    Text(LabFormat.prose(other))
                        .font(GaryFonts.text(13.5)).foregroundStyle(LabInk.reading).lineSpacing(2).fixedSize(horizontal: false, vertical: true)
                }
            }
            if let mine, !mine.isEmpty {
                if let other, !other.isEmpty { LabHairline() }
                VStack(alignment: .leading, spacing: 8) {
                    LabTitle(text: "The path", note: myName)
                    Text(LabFormat.prose(mine))
                        .font(GaryFonts.text(13.5)).foregroundStyle(LabInk.reading).lineSpacing(2).fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .labPlate()
    }

    private func withItPlate(_ play: WinnersPlay) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            LabTitle(text: "On the card with it")
            ForEach(play.with_it) { item in
                NavigationLink(value: LabRoute.play(item.candidate_id)) {
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        LabUnitStamp(units: item.stake_units?.value, size: 20)
                        Text(item.prop.map { LabFormat.propTicket($0) } ?? LabFormat.ticketBody(item.pick_text)).font(GaryFonts.text(13.5, .semibold)).foregroundStyle(GaryColors.warmWhite)
                        Spacer()
                        Text(LabFormat.price(item.odds)).font(GaryFonts.data(12, .semibold)).foregroundStyle(GaryColors.silver)
                        Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(LabInk.dimmer)
                    }
                    .padding(.vertical, 8)
                }
                .buttonStyle(.plain)
                LabHairline()
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .labPlate()
    }

    @ViewBuilder
    private func booksPlate(_ play: WinnersPlay) -> some View {
        if let books = play.game?.sportsbook_odds, !books.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                LabTitle(text: "The books")
                ForEach(books) { b in
                    HStack {
                        Text(LabFormat.bookName(b.book)).font(GaryFonts.ui(12.5, .medium)).foregroundStyle(GaryColors.warmWhite)
                        Spacer()
                        if let s = b.spread { Text("\(s > 0 ? "+" : "")\(LabFormat.trim(s)) \(b.spread_odds ?? "")").font(GaryFonts.data(11.5, .semibold)).foregroundStyle(GaryColors.silver) }
                        if let ml = b.ml { Text("ML \(ml)").font(GaryFonts.data(11.5, .semibold)).foregroundStyle(LabInk.dim) }
                    }
                    .padding(.vertical, 4)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .labPlate()
        }
    }

    @ViewBuilder
    private func keyNumbers(_ play: WinnersPlay) -> some View {
        if let game = play.game, let home = game.homeTeam, let away = game.awayTeam,
           (game.statsData?.isEmpty == false) || game.injuries != nil {
            VStack(alignment: .leading, spacing: 8) {
                LabTitle(text: "The matchup", note: "\(away) @ \(home)")
                TaleOfTapeSection(homeTeam: home, awayTeam: away, statsData: game.statsData ?? [], injuries: game.injuries, garyPickedHome: play.pickedHome)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .labPlate()
        }
    }

    @ViewBuilder
    private func deskPlate(_ play: WinnersPlay) -> some View {
        if let sections = play.desk?.sections, !sections.isEmpty {
        VStack(alignment: .leading, spacing: 10) {
            LabTitle(text: "What Gary read")
            LabFigure(value: LabFormat.grouped(play.desk?.chars ?? 0), caption: "characters", size: 44, tint: GaryColors.warmGold)
                VStack(spacing: 0) {
                    ForEach(sections) { section in
                        Button { openSection(section, play: play) } label: {
                            HStack {
                                Text(section.title).font(GaryFonts.text(13, .medium)).foregroundStyle(GaryColors.warmWhite).multilineTextAlignment(.leading)
                                Spacer()
                                if deskLoading == section.index { ProgressView().tint(GaryColors.gold).scaleEffect(0.7) }
                                else if let n = section.chars { Text(LabFormat.grouped(n)).font(GaryFonts.data(11, .semibold)).foregroundStyle(LabInk.dim) }
                                Image(systemName: "chevron.right").font(.system(size: 10, weight: .bold)).foregroundStyle(LabInk.dimmer)
                            }
                            .padding(.vertical, 9)
                        }
                        .buttonStyle(.plain)
                        LabHairline()
                    }
                }
            if let deskError { Text(deskError).font(GaryFonts.ui(11.5, .medium)).foregroundStyle(GaryColors.loss) }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .labPlate()
        }
    }

    private func openSection(_ section: WinnersPlay.DeskSection, play: WinnersPlay) {
        guard deskLoading == nil else { return }
        deskLoading = section.index; deskError = nil
        Task {
            do {
                let text = try await SupabaseAPI.fetchDeskSection(candidateID: play.candidate.id, index: section.index)
                await MainActor.run { deskSheet = DeskText(id: section.index, title: section.title, text: text); deskLoading = nil }
            } catch {
                await MainActor.run { deskError = "That section couldn't be opened."; deskLoading = nil }
            }
        }
    }

    private func briefingPlate(_ briefing: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Button { withAnimation(.easeOut(duration: 0.25)) { briefingOpen.toggle() } } label: {
                HStack {
                    LabTitle(text: "The research briefing")
                    Image(systemName: briefingOpen ? "chevron.up" : "chevron.down").font(.system(size: 11, weight: .bold)).foregroundStyle(LabInk.dim)
                }
            }
            .buttonStyle(.plain)
            if briefingOpen {
                Text(LabFormat.prose(briefing))
                    .font(GaryFonts.text(13)).foregroundStyle(LabInk.reading).lineSpacing(2).fixedSize(horizontal: false, vertical: true)
                    .textSelection(.enabled)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .labPlate()
    }
}

extension LabFormat {
    /// A desk section for a reader: no rules, marks, source stamps or shouted headers.
    static func readerDesk(_ raw: String) -> String {
        var out: [String] = []
        for rawLine in raw.split(separator: "\n", omittingEmptySubsequences: false) {
            var line = String(rawLine)
            if line.range(of: #"^[\s═━─=\-_#*~]{3,}$"#, options: .regularExpression) != nil { continue }
            line = line.replacingOccurrences(of: #"^#{1,4}\s*"#, with: "", options: .regularExpression)
            line = line.replacingOccurrences(of: #"[═━]+"#, with: "", options: .regularExpression)
            line = line.replacingOccurrences(of: #"\s*\((CURRENT [0-9]{4} SEASON )?FROM BDL\)"#, with: "", options: .regularExpression)
            line = line.replacingOccurrences(of: #"\s*[—–-]\s*(AS WRITTEN|REPORTED OBSERVATIONS)\s*$"#, with: "", options: .regularExpression)
            line = line.replacingOccurrences(of: #",\s*AS WRITTEN\s*$"#, with: "", options: .regularExpression)
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.range(of: #"^[A-Z][A-Z0-9 /&,:()\-']{8,}$"#, options: .regularExpression) != nil {
                line = trimmed.capitalized
            } else {
                line = trimmed
            }
            out.append(line)
        }
        return out.joined(separator: "\n").replacingOccurrences(of: #"\n{3,}"#, with: "\n\n", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
    static func grouped(_ n: Int) -> String {
        let f = NumberFormatter(); f.numberStyle = .decimal; f.groupingSeparator = ","
        return f.string(from: NSNumber(value: n)) ?? String(n)
    }
    static func unitsWords(_ u: Double?) -> String {
        guard let u else { return "a unit" }
        if abs(u - 1) < 0.001 { return "one unit" }
        if abs(u - 0.5) < 0.001 { return "half a unit" }
        if abs(u - 0.25) < 0.001 { return "a quarter unit" }
        return units(u)
    }
    static func bookName(_ raw: String?) -> String {
        switch (raw ?? "").lowercased() {
        case "fanduel": return "FanDuel"
        case "draftkings": return "DraftKings"
        case "betmgm": return "BetMGM"
        case "caesars": return "Caesars"
        case "betrivers": return "BetRivers"
        case "pointsbet": return "PointsBet"
        case "espnbet", "espn bet": return "ESPN Bet"
        case "fanatics": return "Fanatics"
        case "": return "Book"
        default: return (raw ?? "").capitalized
        }
    }
}

extension GaryPick {
    /// The one book quoting exactly Gary's price when he looked; nothing when
    /// the price sat at several books or at none of them.
    func bookHolding(price: Int?) -> String? {
        guard let price, let books = sportsbook_odds else { return nil }
        let wanted = LabFormat.price(price)
        let hits = books.filter { ($0.spread_odds ?? "") == wanted || ($0.ml ?? "") == wanted }
        guard hits.count == 1, let raw = hits.first?.book else { return nil }
        return LabFormat.bookName(raw)
    }
}

extension WinnersPlay {
    /// The ticket as a reader says it: the prop in words, the game without its price.
    var ticketTitle: String {
        if let prop { return LabFormat.propTicket(prop) }
        return LabFormat.ticketBody(candidate.pick_text)
    }
}
