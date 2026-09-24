import SwiftUI

// THE WINNERS LAB — the breakdown. One play, full screen: the ticket with the
// way back beside it, the tracker, a prop's hit rates on the yardstick, the
// matchup on tabs (the teams, the arms or the quarterbacks and the skill
// players), the books as they stand now, the Picks page's bets on
// this game (extras, never on the record), the case on tabs and what rode
// with it. (The research briefing and the tape came off, founder, Sep 23 2026.)

enum LabRoute: Hashable {
    case play(Int)
}

struct LabPlayView: View {
    let candidateID: Int
    @State private var play: WinnersPlay?
    @State private var loading = true
    @State private var error: String?
    /// The matchup tab on screen; empty opens the first (the arms, on an MLB game).
    @State private var matchupTab = ""
    /// The tab on screen; empty opens the first.
    @State private var caseTab = ""
    @State private var booksNow: [BookNow] = []
    @State private var gameProps: [PropPick] = []
    @State private var board: TomorrowBoard?
    @State private var cards: [PlayerInsightCardRow] = []
    @State private var openCard: PlayerInsightCardRow?
    /// The Picks page's game pick on this matchup, shown with its props.
    @State private var dayPick: GaryPick?
    /// The picked club's games, newest first, for a game pick's yardstick.
    @State private var teamGames: [TeamGame] = []
    @ObservedObject private var liveCache = LiveScoreCache.shared
    @ObservedObject private var propCache = LivePropStatsCache.shared
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            GaryColors.ink.ignoresSafeArea()
            if let play {
                ScrollView(showsIndicators: false) {
                    LazyVStack(alignment: .leading, spacing: 14) {
                        hero(play)
                        trackerPlate(play)
                        casePlate(play)
                        propLogPlate(play)
                        gameLogPlate(play)
                        matchupPlate(play)
                        booksPlate(play)
                        picksPagePlate(play)
                        if !play.with_it.isEmpty { withItPlate(play) }
                        Color.clear.frame(height: 150)
                    }
                    .padding(.horizontal, GaryLayout.gutter)
                    .padding(.top, 6)
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
        // The way back rides beside the ticket (founder, Sep 22 2026: the
        // system back button "is creating a big space at the top").
        .toolbar(.hidden, for: .navigationBar)
        .navigationBarBackButtonHidden(true)
        .tint(GaryColors.gold)
        .task { await load() }
        .onChange(of: scenePhase) { phase in if phase == .active { Task { await load(quiet: true) } } }
        .onReceive(Timer.publish(every: 90, on: .main, in: .common).autoconnect()) { _ in
            guard scenePhase == .active else { return }
            Task { await load(quiet: true) }
        }
        .background(Color.clear.sheet(item: $openCard) { row in PlayerInsightSheet(signal: nil, prefetched: row) })
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
            await loadAround(fresh)
        } catch where LabFormat.isCancellation(error) {
            await MainActor.run { if play != nil { loading = false } }
        } catch {
            await MainActor.run {
                if play == nil { self.error = LabFormat.errorText(error) }
                loading = false
            }
        }
    }

    /// Everything the breakdown reads beside the play: the books as they
    /// stand, the props on this game, the day board (the arms), today's
    /// cards (the quarterbacks and the skill players).
    private func loadAround(_ play: WinnersPlay) async {
        let date = play.candidate.game_date
        let league = play.candidate.league
        let gameID = play.candidate.game_id ?? play.game?.game_id.map(String.init) ?? ""
        async let booksF: [BookNow] = gameID.isEmpty ? [] : ((try? await SupabaseAPI.fetchBooksNow(league: league, date: date, gameID: gameID)) ?? [])
        async let propsF: [PropPick] = (try? await SupabaseAPI.fetchPropPicks(date: date)) ?? []
        async let picksF: [GaryPick] = (try? await SupabaseAPI.fetchDailyPicks(date: date)) ?? []
        async let boardF: TomorrowBoard? = league == "MLB" ? await SupabaseAPI.fetchTomorrowBoard(date: date) : nil
        async let cardsF: [PlayerInsightCardRow] = await SupabaseAPI.fetchPlayerIntelRows(date: date)
        // A game pick reads its club's games the way a prop reads its player's.
        let pickedTeam = play.isProp ? nil : (play.pickedHome ? play.game?.homeTeam : play.game?.awayTeam)
        async let gamesF: [TeamGame] = pickedTeam == nil ? [] : await SupabaseAPI.fetchTeamGames(league: league, team: pickedTeam ?? "")
        let (books, props, dayBoard, dayCards, picks) = await (booksF, propsF, boardF, cardsF, picksF)
        let clubGames = await gamesF
        let matchup = matchupLine(play)
        let pickOnGame = picks.first { g in
            guard (g.league ?? "").uppercased().hasPrefix(league) else { return false }
            if let id = Int(gameID), g.game_id == id { return true }
            let m = "\(g.awayTeam ?? "") @ \(g.homeTeam ?? "")"
            return LabFormat.sameMatchup(m, matchup)
        }
        let mine = props.filter { p in
            guard (p.league ?? p.sport ?? "").uppercased().hasPrefix(league) else { return false }
            if let pg = p.game_id, let g = Int(gameID), pg == g { return true }
            if let m = p.matchup, !m.isEmpty { return LabFormat.sameMatchup(m, matchup) }
            return false
        }
        let abbrs = teamAbbrs(play)
        let team = dayCards.filter { row in
            HubCardIdentity.sameLeague(row.league, league) && abbrs.contains((row.team_abbr ?? row.payload?.team ?? "").uppercased())
        }
        await MainActor.run { booksNow = books; gameProps = mine; board = dayBoard; cards = team; dayPick = pickOnGame; teamGames = clubGames }
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

    private func matchupLine(_ play: WinnersPlay) -> String {
        if let g = play.game { return "\(g.awayTeam ?? "") @ \(g.homeTeam ?? "")" }
        return play.prop?.matchup ?? ""
    }
    private func teamAbbrs(_ play: WinnersPlay) -> Set<String> {
        var out = Set<String>()
        if let g = play.game {
            for (name, stored) in [(g.awayTeam, g.awayTeamAbbreviation), (g.homeTeam, g.homeTeamAbbreviation)] {
                if let name { out.insert(scoreboardTeamAbbreviation(name, stored: stored, league: g.league).uppercased()) }
            }
        } else if let m = play.prop?.matchup {
            for side in m.components(separatedBy: " @ ") { out.insert(scoreboardTeamAbbreviation(side, stored: nil, league: play.candidate.league).uppercased()) }
        }
        return out
    }

    // MARK: - The hero

    private func hero(_ play: WinnersPlay) -> some View {
        // The approved ticket, drawn by the one component the unveil uses, so
        // the play a fan just opened looks like the ticket it opened from.
        let result = play.candidate.scratched ? "scratched" : play.result?.result
        let split = LabFormat.splitDirection(play.ticketTitle, league: play.candidate.league)
        let book = play.game?.sportsbook_odds?.first?.book.flatMap { $0.isEmpty ? nil : LabFormat.bookName($0) }
        return LabTicketPlate(
            league: play.candidate.league,
            matchup: LabFormat.shortMatchup(matchupLine(play)),
            price: play.candidate.odds,
            stakeUnits: play.candidate.stake_units?.value,
            stateText: heroState(play),
            state: LabTicketState(result: result),
            direction: split.direction,
            book: book,
            stampRotated: false,
            pick: {
                let full = split.body.uppercased()
                let short = LabPlayModule.shortTitle(full, player: play.prop?.player, matchup: matchupLine(play))
                // One line if it fits, the shorter name next; else it drops a
                // line and grows a touch (founder, Sep 24 2026). Never "…".
                ViewThatFits(in: .horizontal) {
                    Text(full).font(GaryFonts.display(34)).fixedSize()
                    Text(short).font(GaryFonts.display(34)).fixedSize()
                    Text(full).font(GaryFonts.display(38)).fixedSize(horizontal: false, vertical: true)
                }
                .foregroundStyle(GaryColors.warmWhite)
            },
            leading: {
                Button { dismiss() } label: {
                    Image(systemName: "chevron.left").font(.system(size: 14, weight: .bold)).foregroundStyle(GaryColors.gold)
                        .frame(width: 22, height: 22).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Back to the board")
            })
    }

    /// "WSH 2 · DET 9" — both clubs named, the way the mock's ticket reads.
    private func scoreLine(_ play: WinnersPlay) -> String? {
        guard let game = play.game, let away = game.awayTeam, let home = game.homeTeam,
              let a = play.result?.away_score, let h = play.result?.home_score else { return nil }
        let league = play.candidate.league
        let aw = scoreboardTeamAbbreviation(away, stored: game.awayTeamAbbreviation, league: league).uppercased()
        let hm = scoreboardTeamAbbreviation(home, stored: game.homeTeamAbbreviation, league: league).uppercased()
        return "\(aw) \(a) · \(hm) \(h)"
    }

    /// The right column's bottom line: the graded result with its score, else
    /// the primetime word or the game's time.
    private func heroState(_ play: WinnersPlay) -> String? {
        if play.candidate.scratched { return "Scratched" }
        if let outcome = play.result?.result, !outcome.isEmpty {
            let word = LabTicketState(result: outcome)
            let label = word == .won ? "Win" : word == .lost ? "Loss" : word == .push ? "Push" : outcome
            if let line = scoreLine(play) { return "\(label) · \(line)" }
            if let score = play.result?.final_score, !score.isEmpty { return "\(label) · \(score)" }
            return label
        }
        let time = LabFormat.timeET(play.candidate.commence_time)
        if let word = LabFormat.primetime(play.candidate.commence_time, league: play.candidate.league) {
            return "\(time) · \(word)"
        }
        return time
    }

    // MARK: - The tracker

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

    // MARK: - The prop on the yardstick

    /// His games against this prop's line, on the ruler: the line opens it,
    /// the fan can slide it, and the windows count the games that got there.
    @ViewBuilder private func propLogPlate(_ play: WinnersPlay) -> some View {
        if let prop = play.prop, let card = propCard(prop), let log = card.payload?.log,
           let stat = LogStat.reading(prop.prop, type: card.payload?.type),
           !log.series(stat).isEmpty {
            let line = Double(prop.line ?? "") ?? Double(LabFormat.trailingNumber(prop.prop) ?? "")
            PlayerLogPanel(log: log, stats: [stat], start: stat, line: line,
                           under: (prop.bet ?? "").lowercased().contains("under"))
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .labPlate()
        }
    }
    /// The game pick on the yardstick: the picked club's games against the
    /// ticket, the same panel and plate as a prop's (founder, Sep 24 2026).
    /// Only games before this one count, so a finished pick reads the record
    /// it was made on, and its own game never grades itself.
    @ViewBuilder private func gameLogPlate(_ play: WinnersPlay) -> some View {
        let before = teamGames.filter { ($0.d ?? "") < play.candidate.game_date }
        if !play.isProp, let game = play.game, before.count >= 5 {
            let open = GameLogPanel.opening(for: game)
            VStack(alignment: .leading, spacing: 12) {
                Text(((play.pickedHome ? game.homeTeam : game.awayTeam) ?? "").uppercased())
                    .font(GaryFonts.display(15)).tracking(1.4).foregroundStyle(GaryColors.gold)
                GameLogPanel(games: before, measure: open.0, league: play.candidate.league,
                             opening: open.1, price: LabFormat.price(play.candidate.odds))
                    .id(candidateID)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .labPlate()
        }
    }

    /// The prop player's card from the day's cards on this game.
    private func propCard(_ prop: PropPick) -> PlayerInsightCardRow? {
        let name = HubCardIdentity.nameKey(prop.player ?? "")
        guard !name.isEmpty else { return nil }
        let matches = cards.filter { HubCardIdentity.nameKey($0.player_name ?? $0.payload?.name ?? "") == name }
        return matches.first { $0.payload?.log != nil } ?? matches.first
    }

    // MARK: - The matchup, on tabs

    private var matchupTabs: [String] {
        guard let play else { return [] }
        var tabs: [String] = []
        // The arms lead, as they do on a prop's page (founder, Sep 24 2026:
        // the game breakdown should look like the prop breakdown).
        if play.candidate.league == "MLB", board != nil, scoutData(play)?.awayStarter != nil || scoutData(play)?.homeStarter != nil { tabs.append("PITCHERS") }
        if let g = play.game, (g.statsData?.isEmpty == false) || g.injuries != nil { tabs.append("TEAMS") }
        if !cards.filter({ ($0.payload?.position ?? "").uppercased() == "QB" }).isEmpty { tabs.append("QUARTERBACKS") }
        if !skillCards.isEmpty { tabs.append("SKILL") }
        if play.candidate.league == "MLB", !cards.isEmpty, !tabs.contains("PITCHERS") { tabs.append("PLAYERS") }
        return tabs
    }
    private var skillCards: [PlayerInsightCardRow] {
        cards.filter { ["RB", "WR", "TE", "FB"].contains(($0.payload?.position ?? "").uppercased()) }
    }
    private func scoutData(_ play: WinnersPlay) -> ScoutTrioData? {
        guard let board else { return nil }
        let matchup = matchupLine(play)
        let row = (board.board ?? []).first { r in
            LabFormat.sameMatchup("\(r.away_team ?? "") @ \(r.home_team ?? "")", matchup)
        }
        return ScoutTrioData(matchup: matchup, row: row, board: board, wire: [], commence: LabFormat.parseISO(play.candidate.commence_time), gameDate: play.candidate.game_date)
    }

    @ViewBuilder private func matchupPlate(_ play: WinnersPlay) -> some View {
        let tabs = matchupTabs
        if !tabs.isEmpty {
            let current = tabs.contains(matchupTab) ? matchupTab : tabs[0]
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline) {
                    Text(matchupLine(play).uppercased()).font(GaryFonts.display(17)).tracking(0.6).foregroundStyle(GaryColors.warmWhite)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer()
                }
                if tabs.count > 1 { LabTextTabs(items: tabs, selected: Binding(get: { current }, set: { matchupTab = $0 }), size: 13) }
                switch current {
                case "TEAMS":
                    if let game = play.game, let home = game.homeTeam, let away = game.awayTeam {
                        TaleOfTapeSection(homeTeam: home, awayTeam: away, statsData: game.statsData ?? [], injuries: game.injuries, garyPickedHome: play.pickedHome)
                    }
                case "PITCHERS":
                    if let d = scoutData(play) { ScoutArmsSection(d: d).padding(.horizontal, -16) }
                case "QUARTERBACKS":
                    cardRows(cards.filter { ($0.payload?.position ?? "").uppercased() == "QB" })
                case "SKILL":
                    cardRows(skillCards)
                default:
                    cardRows(cards)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .labPlate()
        }
    }

    /// Player rows from today's cards: the name, his side, the season line,
    /// the last-games line. Tap opens the standard player card.
    private func cardRows(_ rows: [PlayerInsightCardRow]) -> some View {
        let ordered = rows.sorted { ($0.team_abbr ?? "") < ($1.team_abbr ?? "") }.prefix(10)
        return VStack(spacing: 0) {
            ForEach(Array(ordered.enumerated()), id: \.element.id) { index, row in
                if index > 0 { LabHairline() }
                Button { openCard = row } label: {
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        VStack(alignment: .leading, spacing: 3) {
                            HStack(spacing: 8) {
                                Text((row.player_name ?? row.payload?.name ?? "").uppercased()).font(GaryFonts.display(18)).foregroundStyle(GaryColors.warmWhite).fixedSize(horizontal: false, vertical: true)
                                Text("\(row.team_abbr ?? row.payload?.team ?? "") \(row.payload?.position ?? "")").font(GaryFonts.ui(11, .medium)).foregroundStyle(LabInk.dim)
                            }
                            if let s = row.payload?.season?.line1, !s.isEmpty { Text(s).font(GaryFonts.data(11.5, .semibold)).foregroundStyle(GaryColors.silver).fixedSize(horizontal: false, vertical: true) }
                            if let f = row.payload?.formRows?.first, let v = f.value { Text("\((f.label ?? "").capitalized): \(v)").font(GaryFonts.ui(11, .medium)).foregroundStyle(LabInk.dim).fixedSize(horizontal: false, vertical: true) }
                        }
                        Spacer(minLength: 6)
                        Image(systemName: "chevron.right").font(.system(size: 10, weight: .bold)).foregroundStyle(LabInk.dimmer)
                    }
                    .padding(.vertical, 9)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: - The books, now

    private struct BookLine: Identifiable {
        let book: String; let side: String?; let sideOdds: Int?; let ml: Int?; let total: String?; let totalOdds: Int?; let seen: String?
        var id: String { book }
    }
    private func bookLines(_ play: WinnersPlay) -> [BookLine] {
        let home = play.pickedHome
        if !booksNow.isEmpty {
            return booksNow.compactMap { b in
                guard let book = b.book else { return nil }
                let spread = home ? b.spread_home?.value : b.spread_away?.value
                let body = LabFormat.ticketBody(play.game?.pick ?? "").lowercased()
                let over = body.contains("over")
                return BookLine(book: LabFormat.bookName(book),
                                side: spread.map { ($0 > 0 ? "+" : "") + LabFormat.trim($0) },
                                sideOdds: home ? b.spread_home_odds : b.spread_away_odds,
                                ml: home ? b.ml_home : b.ml_away,
                                total: b.total?.value.map { (over ? "O " : "U ") + LabFormat.trim($0) },
                                totalOdds: over ? b.over : b.under,
                                seen: b.seen_at)
            }
        }
        return (play.game?.sportsbook_odds ?? []).compactMap { b in
            guard let book = b.book else { return nil }
            return BookLine(book: LabFormat.bookName(book), side: b.spread.map { ($0 > 0 ? "+" : "") + LabFormat.trim($0) },
                            sideOdds: b.spread_odds.flatMap { Int($0.replacingOccurrences(of: "+", with: "")) },
                            ml: b.ml.flatMap { Int($0.replacingOccurrences(of: "+", with: "")) }, total: nil, totalOdds: nil, seen: nil)
        }
    }

    @ViewBuilder private func booksPlate(_ play: WinnersPlay) -> some View {
        let lines = bookLines(play)
        if !lines.isEmpty, play.game != nil {
            let bestSide = lines.compactMap { $0.sideOdds }.max()
            let bestML = lines.compactMap { $0.ml }.max()
            let freshest = lines.compactMap { $0.seen }.max()
            VStack(alignment: .leading, spacing: 10) {
                LabTitle(text: "The books", note: freshest.map { LabFormat.timeAgoWords($0) })
                // One grid, three columns: the side, the price, the moneyline.
                HStack(spacing: 8) {
                    Text("BOOK").frame(maxWidth: .infinity, alignment: .leading)
                    Text("SPREAD").frame(width: 92, alignment: .trailing)
                    Text("ML").frame(width: 56, alignment: .trailing)
                }
                .font(GaryFonts.mono(9.5, bold: true)).tracking(1).foregroundStyle(LabInk.dimmer)
                VStack(spacing: 0) {
                    ForEach(Array(lines.enumerated()), id: \.element.id) { index, b in
                        if index > 0 { LabHairline() }
                        HStack(spacing: 8) {
                            HStack(spacing: 8) {
                                RoundedRectangle(cornerRadius: 1.5).fill(LabFormat.bookTint(b.book)).frame(width: 3, height: 16)
                                Text(b.book).font(GaryFonts.ui(12.5, .semibold)).foregroundStyle(GaryColors.warmWhite).fixedSize(horizontal: false, vertical: true)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            HStack(spacing: 5) {
                                Text(b.side ?? "").font(GaryFonts.data(12.5, .semibold)).foregroundStyle(GaryColors.warmWhite)
                                Text(LabFormat.price(b.sideOdds)).font(GaryFonts.data(11.5, .semibold))
                                    .foregroundStyle(b.sideOdds != nil && b.sideOdds == bestSide ? GaryColors.gold : GaryColors.silver)
                            }
                            .frame(width: 92, alignment: .trailing)
                            Text(LabFormat.price(b.ml)).font(GaryFonts.data(12.5, .semibold))
                                .foregroundStyle(b.ml != nil && b.ml == bestML ? GaryColors.gold : GaryColors.silver)
                                .frame(width: 56, alignment: .trailing)
                        }
                        .padding(.vertical, 8)
                    }
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .labPlate()
        }
    }

    // MARK: - The Picks page on this game (the free pick and its props; never on the record)

    @ViewBuilder private func picksPagePlate(_ play: WinnersPlay) -> some View {
        let mineID = play.prop.map { LabFormat.propTicket($0) }
        let props = gameProps.filter { LabFormat.propTicket($0) != mineID }
        let gamePick = dayPick.flatMap { pick -> GaryPick? in
            guard let text = pick.pick, !text.isEmpty else { return nil }
            if let mine = play.game?.pick, LabFormat.ticketBody(mine) == LabFormat.ticketBody(text) { return nil }
            return pick
        }
        if gamePick != nil || !props.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                LabTitle(text: "On the Picks page")
                VStack(spacing: 0) {
                    if let pick = gamePick {
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Text(LabFormat.ticketBody(pick.pick ?? "").uppercased())
                                .font(GaryFonts.display(20)).foregroundStyle(GaryColors.warmWhite)
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer()
                            Text(pick.formattedPickParts.odds).font(GaryFonts.display(16)).foregroundStyle(GaryColors.silver)
                        }
                        .padding(.vertical, 8)
                        if !props.isEmpty { LabHairline().padding(.vertical, 4) }
                    }
                    ForEach(Array(props.enumerated()), id: \.offset) { index, p in
                        if index > 0 { LabHairline().padding(.vertical, 4) }
                        LabPropRow(prop: p, league: play.candidate.league, date: play.candidate.game_date)
                    }
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .labPlate()
        }
    }

    // MARK: - The case and why it made the board, on tabs

    /// Right under the ticket (founder, Sep 24 2026: "the case at the
    /// bottom... that's really the real reason why Gary made the pick"): why
    /// it made the board first, Gary's case beside it (his swap, same day),
    /// then the two sides.
    private static let reasonsTab = "WHY IT MADE THE BOARD"

    /// The same two tabs on every pick, game or prop (founder, Sep 24 2026:
    /// "we only need the case, and then... that part that prop picks have"):
    /// why it made the board, then Gary's case.
    private func caseTabs(_ play: WinnersPlay) -> [String] {
        var out: [String] = []
        if !boardReasons(play).isEmpty { out.append(Self.reasonsTab) }
        if !caseText(play).isEmpty { out.append("THE CASE") }
        return out
    }

    /// The reasons written when the ticket made the board. A ticket stored
    /// without them (the games of Sep 23) lists the first sentence of each
    /// paragraph of Gary's case, his words, never rearranged; the whole case
    /// stays on its own tab.
    private func boardReasons(_ play: WinnersPlay) -> [LabFormat.Reason] {
        if let written = play.reasons, !written.isEmpty { return written }
        let take = LabFormat.prose(LabFormat.stripTakeHeading(play.game?.rationale ?? play.prop?.analysis))
        let claims = take.components(separatedBy: "\n\n").compactMap { LabFormat.firstSentence($0) }
        return claims.prefix(4).map { LabFormat.Reason(claim: $0, why: "") }
    }

    private func caseText(_ play: WinnersPlay) -> String {
        LabFormat.stripTakeHeading(play.game?.rationale ?? play.prop?.analysis ?? play.game?.game_read)
    }

    @ViewBuilder private func casePlate(_ play: WinnersPlay) -> some View {
        let names = caseTabs(play)
        if !names.isEmpty {
            let current = names.contains(caseTab) ? caseTab : names[0]
            VStack(alignment: .leading, spacing: 12) {
                if names.count > 1 {
                    // The tabs run wider than the plate; they slide, never cut.
                    ScrollView(.horizontal, showsIndicators: false) {
                        LabTextTabs(items: names, selected: Binding(get: { current }, set: { caseTab = $0 }), size: 15)
                    }
                } else {
                    LabTitle(text: names[0])
                }
                if current == Self.reasonsTab {
                    reasonRows(boardReasons(play))
                } else {
                    Text(caseText(play))
                        .font(GaryFonts.text(14)).foregroundStyle(LabInk.reading).lineSpacing(3).fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .labPlate()
        }
    }

    /// The reasons the server wrote for this play: each claim over the
    /// numbers behind it.
    private func reasonRows(_ reasons: [LabFormat.Reason]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(Array(reasons.enumerated()), id: \.offset) { index, reason in
                if index > 0 { LabHairline() }
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Text("\(index + 1)")
                        .font(GaryFonts.data(13, .semibold)).foregroundStyle(GaryColors.gold)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(reason.claim)
                            .font(GaryFonts.text(14.5, .semibold)).foregroundStyle(GaryColors.warmWhite)
                            .fixedSize(horizontal: false, vertical: true)
                        if !reason.why.isEmpty {
                            Text(reason.why)
                                .font(GaryFonts.text(13.5)).foregroundStyle(LabInk.reading).lineSpacing(3)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
        }
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
}

/// One of Gary's props on the game: the ticket, the price, the reasons in
/// his words, and on a yardage prop the fan's own number to lock in.
struct LabPropRow: View {
    let prop: PropPick
    let league: String
    let date: String
    @State private var call: Double = 0
    @State private var locked = false

    private var line: Double { Double(prop.line ?? "") ?? Double(LabFormat.trailingNumber(prop.prop) ?? "") ?? 0 }
    private var yardage: Bool {
        let m = (prop.prop ?? "").lowercased()
        return league != "MLB" && (m.contains("yards") || m.contains("receptions") || m.contains("completions") || m.contains("attempts"))
    }
    private var key: String { "yourCall.\(date).\(prop.player ?? "").\(prop.prop ?? "")" }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(LabFormat.propTicket(prop).uppercased()).font(GaryFonts.display(18)).foregroundStyle(GaryColors.warmWhite).fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 6)
                Text(LabFormat.price(prop.odds.flatMap { Int($0.replacingOccurrences(of: "+", with: "")) })).font(GaryFonts.display(18)).foregroundStyle(GaryColors.gold)
            }
            if let stats = prop.key_stats, !stats.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(Array(stats.prefix(3).enumerated()), id: \.offset) { _, s in
                        HStack(alignment: .top, spacing: 8) {
                            Circle().fill(GaryColors.gold).frame(width: 5, height: 5).padding(.top, 6)
                            Text(s).font(GaryFonts.ui(12.5, .medium)).foregroundStyle(LabInk.reading).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
            if yardage, line > 0 {
                LabProjectionStick(line: line, unit: LabFormat.marketWords(prop.prop), call: $call, locked: locked) {
                    locked = true
                    UserDefaults.standard.set(call, forKey: key)
                }
                .padding(.top, 4)
            }
        }
        .padding(.vertical, 6)
        .onAppear {
            if let saved = UserDefaults.standard.object(forKey: key) as? Double { call = saved; locked = true } else { call = line }
        }
    }
}

extension LabFormat {
    static func grouped(_ n: Int) -> String {
        let f = NumberFormatter(); f.numberStyle = .decimal; f.groupingSeparator = ","
        return f.string(from: NSNumber(value: n)) ?? String(n)
    }
    /// The book's own name as it writes it (founder, Sep 24 2026: "whatever
    /// the official way FanDuel spells it"), checked against each book's
    /// App Store listing and site: FanDuel, DraftKings, BetMGM, Caesars,
    /// BetRivers, Fanatics.
    static func bookName(_ raw: String?) -> String {
        switch (raw ?? "").lowercased() {
        case "fanduel": return "FanDuel"
        case "draftkings": return "DraftKings"
        case "betmgm": return "BetMGM"
        case "caesars": return "Caesars"
        case "betrivers": return "BetRivers"
        case "fanatics": return "Fanatics"
        case "": return "Book"
        default: return (raw ?? "").capitalized
        }
    }
    /// A book's own color (no logos: they are the books' trademarks). Taken
    /// from each book's site and App Store icon, Sep 24 2026: FanDuel's blue,
    /// DraftKings' green, BetMGM's and Caesars' golds, BetRivers' yellow (its
    /// navy disappears on a dark card), Fanatics' white (its mark is black and
    /// white).
    static func bookTint(_ name: String) -> Color {
        switch name.lowercased() {
        case "fanduel": return Color(hex: "#1493FF")
        case "draftkings": return Color(hex: "#61B510")
        case "betmgm": return Color(hex: "#C0A971")
        case "caesars": return Color(hex: "#BB9D5E")
        case "betrivers": return Color(hex: "#FDB61B")
        case "fanatics": return GaryColors.warmWhite
        default: return LabInk.dimmer
        }
    }
    /// "New York Giants @ Los Angeles Rams" → "Giants @ Rams".
    static func shortMatchup(_ m: String) -> String {
        let sides = m.components(separatedBy: " @ ")
        guard sides.count == 2 else { return m }
        return sides.map { $0.split(separator: " ").last.map(String.init) ?? $0 }.joined(separator: " @ ")
    }
    /// "Nationals @ Tigers" and "Washington Nationals @ Detroit Tigers" are one game.
    static func sameMatchup(_ a: String, _ b: String) -> Bool {
        func sides(_ s: String) -> [String] { s.lowercased().components(separatedBy: " @ ").map { $0.split(separator: " ").last.map(String.init) ?? $0 } }
        let x = sides(a), y = sides(b)
        return x.count == 2 && y.count == 2 && x[0] == y[0] && x[1] == y[1]
    }
}

extension WinnersPlay {
    /// The ticket as a reader says it: the prop in words, the game without its price.
    var ticketTitle: String {
        if let prop { return LabFormat.propTicket(prop) }
        return LabFormat.ticketBody(candidate.pick_text)
    }
}
