// Shipping model/selector/cache/loader declarations are extracted by the Node
// wrapper. Only transport and view state are replaced; no network or SDK UI.
func check(_ value: Bool, _ message: String = "Check failed") { precondition(value, message) }
func parseISO8601(_ value: String) -> Date? {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f.date(from: value) ?? ISO8601DateFormatter().date(from: value)
}
enum Formatters { static func shortTeamName(_ name: String, league: String) -> String { name } }
func scoreboardTeamAbbreviation(_ side: String, stored: String?, league: String?) -> String { stored ?? side }
enum AppFlags { static let storeSafe = true }
struct PlayerInsightPack: Decodable { let type: String?; let marker: String }
struct GaryPick { var league: String? = "MLB"; var awayTeam: String? = "New York Mets"; var homeTeam: String? = "Miami Marlins"; var commence_time: String?; var game_id: Int? }
struct PropPick { var league = "MLB"; var commence_time: String?; var game_id: Int? }
struct SlateRow { var league: String? = "MLB"; var away_team: String? = "New York Mets"; var home_team: String? = "Miami Marlins"; var commence_time: String?; var bdl_game_id: Int? }
enum PicksDay { case today, yesterday }
final class PickStore { var loadedDate: String? = "2026-09-08"; var gamePicks: [GaryPick] = []; var yesterdayGamePicksAll: [GaryPick] = []; var slate: [SlateRow] = [] }

@MainActor enum SupabaseAPI {
    struct WireItem { let date: String?; let league: String?; let kind: String?; let headline: String? }
    static var clockDate = "2026-09-08"
    static func todayEST() -> String { clockDate }
    static var boards: [String: [CheckedContinuation<TomorrowBoard?, Never>]] = [:]
    static var players: [String: [CheckedContinuation<[PlayerInsightCardRow], Never>]] = [:]
    static var wireRequests: [String] = []
    static var boardRequests: [String] = []
    static func fetchTodayBoard(date: String) async -> TomorrowBoard? {
        boardRequests.append(date)
        return await withCheckedContinuation { boards[date, default: []].append($0) }
    }
    static func fetchPlayerIntelRows(date: String) async -> [PlayerInsightCardRow] {
        await withCheckedContinuation { players[date, default: []].append($0) }
    }
    static func fetchWireItems(date: String, limit: Int) async -> [WireItem] {
        wireRequests.append(date)
        return [WireItem(date: date, league: "MLB", kind: "injury", headline: date),
                WireItem(date: "2099-01-01", league: "MLB", kind: "injury", headline: "wrong date")]
    }
    static func finishBoard(_ date: String, _ value: TomorrowBoard?) { boards[date]!.removeFirst().resume(returning: value) }
    static func finishPlayers(_ date: String, _ value: [PlayerInsightCardRow]) { players[date]!.removeFirst().resume(returning: value) }
}

@MainActor extension TodayBoardCache {
    static func resetFixture() { precondition(inFlight.isEmpty); stored = [:] }
    static func expireFixture(_ date: String) { if let v = stored[date] { stored[date] = (v.board, .distantPast) } }
}
@MainActor extension ScoutWireCache {
    static func resetFixture() { precondition(inFlight.isEmpty); stored = [:] }
}

func board(_ date: String, id: Int, name: String, time: String, duplicate: Bool = false) -> TomorrowBoard {
    let row: [String: Any] = ["league": "MLB", "away_team": "New York Mets", "home_team": "Miami Marlins", "away_abbr": "NYM", "home_abbr": "MIA", "bdl_game_id": id, "commence_time": time, "arms_take": name]
    let value: [String: Any] = ["date": date, "game_count": 1, "any_lines": true, "board": duplicate ? [row, row] : [row], "big_games": [], "returns": [],
        "starters": [["league": "MLB", "abbr": "NYM", "game": "NYM @ MIA", "name": name, "game_time": time]],
        "weather": [["league": "MLB", "away_abbr": "NYM", "home_abbr": "MIA", "temp_f": 82, "commence_time": time]]]
    return try! JSONDecoder().decode(TomorrowBoard.self, from: JSONSerialization.data(withJSONObject: value))
}
func player(_ dateMarker: String, id: Int = 5059929, playerID: String = "42", league: String = "MLB") -> PlayerInsightCardRow {
    PlayerInsightCardRow(league: league, player_id: playerID, player_name: dateMarker, team_abbr: "NYM", game_id: String(id), payload: PlayerInsightPack(type: "pitcher", marker: dateMarker))
}
@MainActor func settle(_ condition: @escaping () -> Bool) async {
    for _ in 0..<2000 { if condition() { return }; await Task.yield() }
    preconditionFailure("Fixture did not reach expected await boundary")
}

@main struct HistoricalGameContextTests {
 @MainActor static func main() async {
    let past = "2026-09-07", today = "2026-09-08"
    let pastStart = "2026-09-07T17:10:00.000Z", nextStart = "2026-09-08T22:40:00.000Z"
    let oldBoard = board(past, id: 5059929, name: "Tong / Pérez", time: pastStart)
    let newBoard = board(today, id: 5059941, name: "Manaea / Alcantara", time: nextStart)
    let a = GamePageDataScope(date: past, league: "MLB", gameID: 5059929)!
    let b = GamePageDataScope(date: today, league: "MLB", gameID: 5059941)!
    precondition(a.row(in: oldBoard)?.arms_take == "Tong / Pérez")
    precondition(a.row(in: newBoard) == nil)
    precondition(a.row(in: board(past, id: 5059941, name: "wrong game same date", time: pastStart)) == nil)
    precondition(a.row(in: board(past, id: 5059929, name: "duplicate", time: pastStart, duplicate: true)) == nil)
    precondition(GamePageDataScope(date: past, league: "NFL", gameID: 5059929)!.row(in: oldBoard) == nil)
    precondition(GamePageDataScope(date: past, league: "MLB", gameID: nil) == nil)
    precondition(GamePageDataScope(date: "2026-02-30", league: "MLB", gameID: 1) == nil)
    precondition(GamePageDataScope(date: nil, league: "MLB", gameID: 1) == nil)
    precondition(GamePageDataScope(date: past, league: "MLB HR", gameID: 5059929) == a)
    precondition(GamePageDataScope.slateDate(loadedDate: nil, yesterday: false) == nil)
    precondition(GamePageDataScope.slateDate(loadedDate: past, yesterday: false) == past)
    // At midnight and at a failed 6AM refresh, the old accepted slate remains
    // labelled/read as Sep7. Only a successful accepted Sep8 changes scope.
    SupabaseAPI.clockDate = today
    precondition(GamePageDataScope.slateDate(loadedDate: past, yesterday: false) == past)
    precondition(GamePageDataScope.slateDate(loadedDate: today, yesterday: true) == past)
    precondition(GamePageDataScope.shiftDay("2026-03-09", -1) == "2026-03-08")
    precondition(GamePageDataScope.shiftDay("2026-11-02", -1) == "2026-11-01")

    let matchup = "New York Mets @ Miami Marlins"
    let goodTrio = ScoutTrioData(matchup: matchup, row: a.row(in: oldBoard), board: oldBoard, wire: [], commence: parseISO8601(pastStart), gameDate: past)
    precondition(goodTrio.awayStarter?.name == "Tong / Pérez" && goodTrio.tempF == 82)
    // Single-candidate wrong timestamp used to bypass the doubleheader guard.
    let wrongTrio = ScoutTrioData(matchup: matchup, row: a.row(in: oldBoard), board: newBoard, wire: [], commence: parseISO8601(pastStart), gameDate: past)
    precondition(wrongTrio.awayStarter == nil && wrongTrio.tempF == nil)
    precondition(!GamePageDataScope.sameStart(nil, parseISO8601(pastStart)))
    precondition(!GamePageDataScope.sameStart(pastStart, nil))
    let dh = board(past, id: 5059930, name: "twin", time: "2026-09-07T23:10:00Z")
    precondition(a.row(in: dh) == nil)
    precondition(!GamePageDataScope.sameStart("2026-09-07T23:10:00Z", parseISO8601(pastStart)))

    let resolver = PicksCarouselView()
    resolver.pickDay = .yesterday
    resolver.store.slate = [SlateRow(commence_time: nextStart, bdl_game_id: 5059941)]
    let group = (matchup: matchup, time: "", commence: parseISO8601(pastStart), dh: false, props: [PropPick]())
    precondition(resolver.bdlGameId(for: group) == nil, "Yesterday cannot borrow today's sole matchup ID")
    resolver.store.yesterdayGamePicksAll = [GaryPick(commence_time: pastStart, game_id: 5059929)]
    precondition(resolver.bdlGameId(for: group) == 5059929)
    resolver.store.yesterdayGamePicksAll = [GaryPick(commence_time: nextStart, game_id: 5059941)]
    precondition(resolver.bdlGameId(for: group) == nil)
    resolver.store.yesterdayGamePicksAll = []
    precondition(resolver.bdlGameId(for: (matchup, "", nil, false, [])) == nil)
    resolver.pickDay = .today
    precondition(resolver.bdlGameId(for: (matchup, "", nil, false, [])) == 5059941, "An accepted date-only current slate remains usable")
    resolver.store.slate.append(SlateRow(commence_time: "2026-09-08T17:10:00Z", bdl_game_id: 5059942))
    precondition(resolver.bdlGameId(for: (matchup, "", nil, true, [])) == nil)

    // Shared caches keep each date independent, reject mislabeled responses,
    // and reuse an in-flight same-day request without a current-day fallback.
    let first = Task { await TodayBoardCache.get(date: past) }
    await settle { SupabaseAPI.boards[past]?.count == 1 }
    let twin = Task { await TodayBoardCache.get(date: past) }
    let second = Task { await TodayBoardCache.get(date: today) }
    await settle { SupabaseAPI.boards[today]?.count == 1 }
    SupabaseAPI.finishBoard(today, newBoard)
    check(await second.value?.date == today)
    SupabaseAPI.finishBoard(past, oldBoard)
    check(await first.value?.date == past)
    check(await twin.value?.date == past)
    precondition(SupabaseAPI.boardRequests.filter { $0 == past }.count == 1)
    check(await TodayBoardCache.get(date: today)?.date == today)
    let wrong = Task { await TodayBoardCache.get(date: "2026-09-06") }
    await settle { SupabaseAPI.boards["2026-09-06"]?.count == 1 }
    SupabaseAPI.finishBoard("2026-09-06", newBoard)
    check(await wrong.value == nil)
    TodayBoardCache.expireFixture(past)
    let failed = Task { await TodayBoardCache.get(date: past) }
    await settle { SupabaseAPI.boards[past]?.count == 1 }
    SupabaseAPI.finishBoard(past, nil)
    check(await failed.value?.date == past, "Only same-date stale cache survives a failed refresh")
    let headlines = await ScoutWireCache.get(date: past)
    precondition(Set(headlines.compactMap(\.date)) == Set([past, "2026-09-06"]))
    precondition(!SupabaseAPI.wireRequests.contains(today))
    TodayBoardCache.resetFixture(); ScoutWireCache.resetFixture()

    // Execute the actual scout load method through A → B → A with A still
    // pending; a cancelled first visit cannot mutate the third visit's state.
    let page = ScoutHarness(); page.gameDataScope = a
    let loadA = Task { await page.loadScout() }
    await settle { SupabaseAPI.boards[past]?.count == 1 }
    loadA.cancel(); page.gameDataScope = b
    let loadB = Task { await page.loadScout() }
    await settle { SupabaseAPI.boards[today]?.count == 1 }
    loadB.cancel(); page.gameDataScope = a
    let latestA = Task { await page.loadScout() }
    await Task.yield()
    SupabaseAPI.finishBoard(today, newBoard)
    await loadB.value
    precondition(page.scopedScoutBoard == nil)
    SupabaseAPI.finishBoard(past, oldBoard)
    await loadA.value; await latestA.value
    precondition(page.scopedScoutBoard?.date == past)
    page.gameDataScope = b
    precondition(page.scopedScoutBoard == nil && page.scopedScoutWire.isEmpty, "Old rows are hidden before the new task runs")
    page.gameDataScope = nil; await page.loadScout()
    precondition(page.scoutBoard == nil && page.scoutWire.isEmpty)

    let people = PlayerHarness(); people.playerScope = a
    let oldPeople = Task { await people.loadPlayers() }
    await settle { SupabaseAPI.players[past]?.count == 1 }
    people.playerScope = b
    let newPeople = Task { await people.loadPlayers() }
    await settle { SupabaseAPI.players[today]?.count == 1 }
    SupabaseAPI.finishPlayers(today, [player(today, id: 5059941), player("wrong", id: 5059929), player("wrong sport", id: 5059941, league: "NFL")])
    await newPeople.value
    SupabaseAPI.finishPlayers(past, [player(past)])
    await oldPeople.value
    precondition(people.visibleRows.map(\.player_name) == [today])
    people.playerScope = a
    precondition(people.visibleRows.isEmpty)
    let empty = Task { await people.loadPlayers() }
    await settle { SupabaseAPI.players[past]?.count == 1 }
    SupabaseAPI.finishPlayers(past, [])
    await empty.value
    precondition(people.visibleRows.isEmpty)
    precondition(PlayerHarness.cardsForGame([player(past)], league: "MLB", gameId: nil, matchup: matchup).isEmpty)

    // Lineup → player carousel uses exact player AND game on the dated query;
    // the same player's next game, another league and duplicate rows fail shut.
    let card = CarouselHarness()
    let ca = CarouselCardScope(date: past, gameID: 5059929, playerID: "42")!
    let cb = CarouselCardScope(date: today, gameID: 5059941, playerID: "42")!
    precondition(ca.pack(in: [player(past), player(today, id: 5059941)])?.marker == past)
    precondition(ca.pack(in: [player(past), player(past)]) == nil)
    precondition(ca.pack(in: [player(past, league: "NFL")]) == nil)
    card.scope = ca
    let cardA = Task { await card.loadPack() }
    await settle { SupabaseAPI.players[past]?.count == 1 }
    card.scope = cb
    let cardB = Task { await card.loadPack() }
    await settle { SupabaseAPI.players[today]?.count == 1 }
    card.scope = ca
    let cardA2 = Task { await card.loadPack() }
    await settle { SupabaseAPI.players[past]?.count == 2 }
    SupabaseAPI.finishPlayers(past, [player("old visit")]); await cardA.value
    precondition(card.pack == nil)
    SupabaseAPI.finishPlayers(today, [player(today, id: 5059941)]); await cardB.value
    precondition(card.pack == nil)
    SupabaseAPI.finishPlayers(past, [player(past)]); await cardA2.value
    precondition(card.pack?.marker == past && !card.loading)
    card.scope = nil; await card.loadPack()
    precondition(card.pack == nil && !card.loading)
    print("PASS historical game context: exact dates, doubleheaders, accepted rollover, caches and actual asynchronous scout/player/carousel loaders")
 }
}
