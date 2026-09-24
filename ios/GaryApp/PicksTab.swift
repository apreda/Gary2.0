import SwiftUI

struct PicksCarouselView: View {
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("selectedTab") private var selectedTab: Int = 0
    @StateObject private var store = PropsSlateStore(includeNFLWeek: true)
    @ObservedObject private var liveCache = LiveScoreCache.shared
    /// Newly published picks and durable grades should arrive without a pull or
    /// relaunch. Only the visible Picks tab runs this refresh; live scores retain
    /// their own faster shared cadence.
    private let rollingPicksRefreshTimer = Timer.publish(every: 90, on: .main, in: .common).autoconnect()
    @State private var rollingPicksRefreshInFlight = false
    /// Today vs Yesterday — the day dropdown (user call, Jun 17) replaces the old
    /// mixed matchup row + per-tab "YESTERDAY" tags. Today shows upcoming-first
    /// matchups; Yesterday shows that day's matchups + picks with CASHED/LOST tags.
    @State private var pickDay: PicksDay = .today
    @StateObject private var history = PicksHistoryStore()
    @State private var historyWeek: NFLPicksWeek?
    private var usesFootballWeeks: Bool { sport == "NFL" || sport == "NCAAF" }
    private var selectedHistory: NFLPicksHistory? {
        guard usesFootballWeeks, historyWeek?.league == sport, pickDay == .yesterday,
              history.snapshot?.week == historyWeek else { return nil }
        return history.snapshot
    }
    private var isWeekHistory: Bool { usesFootballWeeks && pickDay == .yesterday && historyWeek?.league == sport }
    private var selectedPicks: [GaryPick] {
        isWeekHistory ? (selectedHistory?.picks ?? []) : (pickDay == .today ? store.gamePicks : store.yesterdayGamePicksAll)
    }
    private var selectedSlate: [DailySlateRow] {
        isWeekHistory ? (selectedHistory?.slate ?? []) : (pickDay == .today ? store.slate : [])
    }
    private var selectedDate: String? {
        isWeekHistory ? historyWeek?.end : GamePageDataScope.slateDate(loadedDate: store.loadedDate, yesterday: pickDay == .yesterday)
    }
    private var selectedGrades: PicksSettledGames { isWeekHistory ? (selectedHistory?.games ?? PicksSettledGames()) : store.settledGames }
    private func gameGrade(_ pick: GaryPick) -> String? {
        guard isWeekHistory else { return store.gamePickResult(pick, forYesterday: pickDay == .yesterday) }
        return selectedGrades.result(league: pick.league, date: ExactGameIdentity.easternDate(of: pick.commence_time.flatMap(parseISO8601)), gameID: pick.game_id, pick: pick.pick)
    }
    private func propGrade(_ prop: PropPick) -> String? {
        guard isWeekHistory else { return store.resultForProp(prop, forYesterday: pickDay == .yesterday) }
        return selectedHistory?.propGrades.result(league: prop.effectiveLeague,
            date: ExactGameIdentity.easternDate(of: prop.commence_time.flatMap(parseISO8601)),
            gameID: prop.game_id, player: prop.player, market: prop.prop, side: prop.bet, line: prop.line)
    }
    @StateObject private var focusState = PicksFocusState.shared
    @State private var pushFocusLoadInFlight = false
    @State private var notificationFocusGameID: Int?
    @State private var connections: [Signal] = []
    @State private var connLoaded = false
    @State private var connectionLoadInFlight = false
    @State private var connectionDate = ""
    @State private var connectionOwner = UUID()
    @State private var connectionSnapshots: [String: Data] = [:]
    @State private var researchCache: [String: (rows: [Signal], fetched: Date)] = [:]
    @State private var connectionRevision: UInt64 = 0
    @State private var memoSignature: String? = nil
    @State private var connectionErrorLeagues: Set<HubLeagueSel> = []
    @State private var sport = "MLB"
    /// True while `sport` was set by the auto-snap rather than a user tap —
    /// the only state the snap is allowed to correct once real data lands.
    @State private var sportAutoSelected = true
    /// NCAAF CONFERENCE NAVIGATION (founder, Aug 25 2026): the college strip
    /// defaults to ranked matchups — backfilled with the biggest remaining
    /// games when the poll is thin — and filters by conference on demand. A
    /// cross-conference game belongs to BOTH conferences' filters; a game
    /// with two ranked teams shows under RANKED and both conferences.
    static let ncaafRankedFilter = "RANKED"
    @State private var ncaafConference: String = PicksCarouselView.ncaafRankedFilter
    @State private var page = 0
    @State private var selectedProp: PropPick?
    /// PERF#1(b/c): memoized UNSORTED game set + precomputed per-game edge index.
    /// Rebuilt by rebuildMemo() only when picks/props/slate/connections or the
    /// day/sport filter change — never on a live-score tick. Lifecycle ordering
    /// is applied separately after any interactive page swipe has settled.
    @State private var gamesMemo: [(matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])] = []
    @GestureState private var pagerInteracting = false
    @State private var pagerRevision: UInt64 = 0
    @State private var edgeIndex: [String: [Signal]] = [:]
    @State private var collegeRankingsMemo: [String: CollegeTeamRankings] = [:]
    /// Resolve provider identity when accepted content changes, not for every
    /// strip label, score, delay label and page redraw. Optional values also
    /// cache an unresolved game; a missing ID must not trigger repeated scans.
    @State private var gameIDMemo: (signature: String, ids: [String: Int?])?
    /// Masthead + strip context (founder, Jul 22: the Hub's upper part —
    /// wordmark, LAST 7 DAYS line, double rule, slate strip — is the Picks
    /// page's top now): the rolling 7-day pick record, and the day board for
    /// each strip block's O/U.
    @State private var record7: (w: Int, l: Int)? = nil
    @State private var stripBoard: TomorrowBoard? = nil
    /// Day + league scoped snapshot of the ONE pick shown on the landing page.
    /// Keeping the payload (rather than only its id) also protects the published
    /// wording and number if the upstream row is later regenerated.
    @State private var showcaseLock: PicksShowcaseLock? = nil
    private static let showcaseLockPrefix = "gary.picks.showcase.v1."
    private static let showcaseDayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "America/New_York")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private static let footballWeekTimeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "America/New_York")
        f.dateFormat = "EEE h:mm a"
        return f
    }()

    /// Every league with content: today's props/picks plus the per-sport
    /// yesterday recaps (a sport with no picks today shows its results —
    /// the same rule the rest of the app follows).
    /// 2.16: Home-run bets live in The Hub's Home Run Threats lane now, so the
    /// Picks page no longer carries an MLB HR tab or any HR pick cards. The
    /// model's isHRLane is the ONE source of truth (backend lane stamp, prop-text
    /// fallback) — it catches genuine HR props that arrive tagged plain "MLB",
    /// while non-HR props mislabeled "MLB HR" upstream keep routing to MLB.
    private func isHomeRunProp(_ p: PropPick) -> Bool { p.isHRLane }
    private var sports: [String] {
        var s = Set(store.slateProps.filter { !isHomeRunProp($0) }.compactMap { ($0.effectiveLeague ?? "").uppercased() }.filter { !$0.isEmpty })
        s.formUnion(store.gamePicks.compactMap { ($0.league ?? "").uppercased() }.filter { !$0.isEmpty })
        s.formUnion(store.yesterdayGamePicks.compactMap { ($0.league ?? "").uppercased() }.filter { !$0.isEmpty })
        // Today's slate leagues too — so a sport with games tonight but no picks
        // yet still gets a filter chip (matches the look-ahead matchups below).
        s.formUnion(store.slate.compactMap { ($0.league ?? "").uppercased() }.filter { !$0.isEmpty })
        // Keep the active season's desks reachable before their first pick.
        // MLB is also the initial desk while requests are loading or failing;
        // each empty state remains honest until the slate or card arrives.
        s.formUnion(["MLB", "NFL", "NCAAF"])
        s.remove("ALL")
        // The MLB HR lane is retired — guarantee no HR chip even if a non-HR prop
        // arrives mislabeled "MLB HR" (its card already routes to MLB via propSportKey).
        s.remove("MLB HR")
        // Where Gary's PICKS are leads (founder, Aug 18: preseason NFL — zero
        // picks — defaulting over a full MLB board is wrong): a league with
        // posted picks/props today outranks everything. Games on today's slate
        // rank next, so the pre-post morning board still lands on the active
        // sport. Canonical football-season priority (NFL, NCAAF, MLB) only
        // breaks ties inside each group (founder, Jul 12: WC before MLB on a
        // no-WC day made no sense).
        let pickLeagues = Set(store.gamePicks.compactMap { ($0.league ?? "").uppercased() }.filter { !$0.isEmpty })
            .union(store.allProps.filter { !isHomeRunProp($0) }.map { propSportKey($0) }.filter { !$0.isEmpty })
        let todayLeagues = Set(store.slate.compactMap { ($0.league ?? "").uppercased() })
        // A day with an NFL game opens on the NFL, whoever posts first
        // (founder, Sep 24 2026: Thursday is NFL; Tuesday and Wednesday, MLB).
        let nflGameToday = store.slate.contains { ($0.league ?? "").uppercased() == "NFL" && LabFormat.isTodayET($0.commence_time) }
        // PRESEASON DEMOTION (founder, Aug 20: "default to the MLB tab until
        // we are out of NFL preseason") — football only outranks MLB once the
        // NFL regular season begins (kickoff Thu Sep 10 2026; Sep 9 = the
        // eve). Before then MLB leads every tie-break; the football chips
        // stay reachable, they just never win the default.
        let nflRegularSeason = SupabaseAPI.todayEST() >= "2026-09-09"
        let priority: [String: Int] = nflRegularSeason
            ? ["NFL": 0, "NCAAF": 1, "MLB": 2, "WC": 3]
            : ["MLB": 0, "NFL": 1, "NCAAF": 2, "WC": 3]
        // Picks always belongs to one sport, including during partial loads.
        return s.sorted { a, b in
            if nflGameToday, (a == "NFL") != (b == "NFL") { return a == "NFL" }
            let pa = pickLeagues.contains(a), pb = pickLeagues.contains(b)
            if pa != pb { return pa }
            let ta = todayLeagues.contains(a), tb = todayLeagues.contains(b)
            if ta != tb { return ta }
            let ra = priority[a] ?? 50, rb = priority[b] ?? 50
            return ra == rb ? a < b : ra < rb
        }
    }

    /// Follow the first active sport until the user selects a league. Keep the
    /// initial MLB desk valid during loading/errors; never render a mixed desk.
    private func snapSportToAvailableLeague() {
        guard let first = sports.first else { return }
        // A refresh that FAILED is not evidence a league left the board —
        // while any source is failing (or still loading), the chip list is
        // not authoritative and the user's page does not move (Aug 26: a
        // failed pull-to-refresh wiped the list and snapped MLB → NFL).
        guard store.gamePickSourceFailures.isEmpty, !store.propPickSourceFailed,
              !store.slateSourceFailed, !store.loading else { return }
        if !sports.contains(sport) {
            sport = first
            sportAutoSelected = true
        } else if sportAutoSelected, sport != first {
            // `sports` already ranks posted picks/props above slate-only desks.
            // Do not let a slate row make an earlier automatic choice sticky
            // when a more authoritative picks desk arrives during refresh.
            sport = first
        }
    }
    /// A prop's tab key, with the MLB HR lane corrected to HOME-RUN props only.
    /// Non-HR props (total_bases, strikeouts) get mislabeled "MLB HR" upstream;
    /// route those to the regular MLB tab so the HR tab shows only HR bets
    /// (mirrors the storefront's propLeagueKey guard).
    /// A prop's tab key. Every "MLB HR" row — the genuine long shot and the
    /// odd non-HR prop mislabeled upstream — routes to the MLB chip: the home
    /// run belongs to its game's cards, and there is no separate HR tab.
    private func propSportKey(_ p: PropPick) -> String {
        let key = (p.effectiveLeague ?? "").uppercased()
        return key == "MLB HR" ? "MLB" : key
    }
    private var filteredProps: [PropPick] {
        let base = store.slateProps
        return base.filter { propSportKey($0) == sport }
    }
    /// TODAY's matchup rail uses today's FRESH props only. store.allProps is
    /// already freshness-filtered to games at/after the start of today (EST);
    /// slateProps additionally folds in yesterday's recap props for sports with
    /// nothing today — right for the results fallback, but it must NOT seed
    /// today's matchup tabs or yesterday's games leak into TODAY (the
    /// "Jays @ Sox · WEDNESDAY 6:45 PM" bug under a sport with no props yet).
    private var filteredTodayProps: [PropPick] {
        // 2.25 (founder, Sep 3 2026): the home run IS a pick card — four cards a
        // game, two props, the game pick and the long shot. It rides the game's
        // own carousel under the MLB chip (propSportKey), stays last in that
        // carousel, and still never touches a record or the free showcase.
        let today = store.allProps   // NFL TDs stay under NFL
        return today.filter { propSportKey($0) == sport }
    }
    /// Yesterday's own props (sport-scoped, no TD picks) — the source for the
    /// Yesterday matchup row so every settled game shows, not just slate leftovers.
    private var filteredYesterdayProps: [PropPick] {
        let yp = isWeekHistory ? (selectedHistory?.props ?? []) : store.yesterdayPropsAll   // ungated: all of yesterday; HR + NFL TDs ride their game
        return yp.filter { propSportKey($0) == sport }
    }
    /// PERF#1(b): the heavy grouping/merge/look-ahead, memoized into `gamesMemo`
    /// and recomputed ONLY when picks/props/slate/day/sport change (see rebuildMemo)
    /// — never on a live-score tick. Returns the UNSORTED set; the cheap live-status
    /// sort lives in `games` so a 20-25s tick only re-orders, it never re-groups.
    private func computeGamesUnsorted() -> [(matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])] {
        // The matchup row is day-scoped (the dropdown): Today groups today's slate
        // props; Yesterday groups yesterday's own props — sourcing the day directly
        // (not a fresh/stale filter on a shared list) is what makes EVERY yesterday
        // game show, not just the one that leaked into today's slate.
        let dayProps = pickDay == .today ? filteredTodayProps : filteredYesterdayProps
        // Props seed the set — every matchup group SPLITS by start-time bucket
        // so a doubleheader's two games never share a page (Jul 22 2026).
        var out: [(matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])] = []
        var providerIndex: [String: Int] = [:]
        var legacyIndex: [String: [Int]] = [:]
        var providerByIndex: [Int: String] = [:]

        func providerIdentity(league: String?, gameId: Int?) -> String? {
            let rawLeague = (league ?? "").trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
            // Home-run props belong to the same MLB game, not a second desk.
            // Using MLB HR here duplicated the game when the regular pick landed.
            let scopedLeague = rawLeague == "MLB HR" ? "MLB" : rawLeague
            guard !scopedLeague.isEmpty, let gameId else { return nil }
            return "\(scopedLeague)|\(gameId)"
        }

        func upsertGame(matchup: String, time: String, commence: Date?,
                        providerKey: String?, props: [PropPick]) {
            let fallbackKey = Self.gameIdentityKey(matchup, commence)
            let compatibleFallback = (legacyIndex[fallbackKey] ?? []).filter { index in
                providerKey == nil || providerByIndex[index] == nil || providerByIndex[index] == providerKey
            }
            // An id-less row can join one exact matchup/time, never guess
            // between two known provider games with the same fallback label.
            let existingIndex = providerKey.flatMap { providerIndex[$0] }
                ?? (compatibleFallback.count == 1 ? compatibleFallback.first : nil)
            if let index = existingIndex {
                let existing = out[index]
                let resolvedCommence = existing.commence ?? commence
                let resolvedTime = existing.commence == nil && commence != nil ? time : existing.time
                out[index] = (
                    matchup: existing.matchup,
                    time: resolvedTime,
                    commence: resolvedCommence,
                    dh: false,
                    props: existing.props + props
                )
                if let providerKey {
                    providerIndex[providerKey] = index
                    providerByIndex[index] = providerKey
                }
                let resolvedKey = Self.gameIdentityKey(existing.matchup, resolvedCommence)
                for key in Set([fallbackKey, resolvedKey]) where !(legacyIndex[key] ?? []).contains(index) {
                    legacyIndex[key, default: []].append(index)
                }
                return
            }

            out.append((matchup: matchup, time: time, commence: commence, dh: false, props: props))
            let index = out.count - 1
            if let providerKey {
                providerIndex[providerKey] = index
                providerByIndex[index] = providerKey
            }
            legacyIndex[fallbackKey, default: []].append(index)
        }

        for g in store.groupByMatchup(dayProps) {
            let buckets = Dictionary(grouping: g.props) { p in
                Self.timeBucket(parseISO8601(p.commence_time ?? "")) ?? -1
            }
            for (_, props) in buckets.sorted(by: { $0.key < $1.key }) {
                let commence = props.compactMap { parseISO8601($0.commence_time ?? "") }.min()
                let time = commence.map { Formatters.tabTimeFormatterEST.string(from: $0) + " ET" } ?? g.time
                let ids = Set(props.compactMap(\.game_id))
                let gameId = ids.count == 1 ? ids.first : nil
                let league = props.first?.effectiveLeague
                upsertGame(
                    matchup: g.matchup,
                    time: time,
                    commence: commence,
                    providerKey: providerIdentity(league: league, gameId: gameId),
                    props: props
                )
            }
        }
        func gameMatchup(_ p: GaryPick) -> String {
            let a = (p.awayTeam ?? "").trimmingCharacters(in: .whitespaces)
            let h = (p.homeTeam ?? "").trimmingCharacters(in: .whitespaces)
            return (a.isEmpty || h.isEmpty) ? "" : "\(a) @ \(h)"
        }
        // Merge in EVERY game pick for the day (all leagues), deduped against the
        // prop matchups by GAME identity (teams + start bucket) — so a game with
        // a pick but no prop still gets a tab, and a doubleheader gets two.
        func merge(_ picks: [GaryPick]) {
            for p in picks {
                let lg = (p.league ?? "").uppercased()
                guard !lg.isEmpty, lg == sport else { continue }
                let mu = gameMatchup(p)
                guard !mu.isEmpty else { continue }
                let commence = p.commence_time.flatMap(parseISO8601)
                let time = commence.map { Formatters.tabTimeFormatterEST.string(from: $0) + " ET" } ?? (p.time ?? "")
                upsertGame(
                    matchup: mu,
                    time: time,
                    commence: commence,
                    providerKey: providerIdentity(league: lg, gameId: p.game_id),
                    props: []
                )
            }
        }
        merge(selectedPicks)

        // LOOK-AHEAD (today only): include every game on today's slate so the user
        // sees tonight's matchups with a placeholder + intel before picks post.
        if pickDay == .today || isWeekHistory {
            for s in selectedSlate {
                let lg = (s.league ?? "").uppercased()
                guard lg == sport else { continue }
                let a = (s.away_team ?? "").trimmingCharacters(in: .whitespaces)
                let h = (s.home_team ?? "").trimmingCharacters(in: .whitespaces)
                guard !a.isEmpty, !h.isEmpty else { continue }
                let mu = "\(a) @ \(h)"
                let commence = s.commence_time.flatMap(parseISO8601)
                let time = s.kickoffTimeLabel
                    ?? commence.map { Formatters.tabTimeFormatterEST.string(from: $0) + " ET" }
                    ?? ""
                upsertGame(
                    matchup: mu,
                    time: time,
                    commence: commence,
                    providerKey: providerIdentity(league: lg, gameId: s.bdl_game_id),
                    props: []
                )
            }
        }
        // NCAAF CONFERENCE NAVIGATION (founder, Aug 25 2026): scope the
        // college strip to the active view — RANKED (with big-game backfill)
        // or one conference. Today only; Yesterday keeps the full recap.
        if sport == "NCAAF", pickDay == .today {
            let coveredMatchups = Set(store.slate.filter { $0.league?.uppercased() == "NCAAF" }.compactMap { row -> String? in
                guard let away = row.away_team, let home = row.home_team else { return nil }
                return Self.matchupKey("\(away) @ \(home)")
            })
            if !coveredMatchups.isEmpty { out = out.filter { coveredMatchups.contains(Self.matchupKey($0.matchup)) } }
            out = filterNcaafGames(out)
        }

        // Flag doubleheader siblings — pages use this to DEMAND game-scoped
        // data (an unstamped arm/pick/edge stays off rather than guessed).
        var perMatchup: [String: Int] = [:]
        for g in out { perMatchup[Self.matchupKey(g.matchup), default: 0] += 1 }
        return out.map { g in
            (matchup: g.matchup,
             time: sport == "NFL" && pickDay == .today
                ? g.commence.map { Self.footballWeekTimeFormatter.string(from: $0) + " ET" } ?? g.time : g.time,
             commence: g.commence,
             dh: (perMatchup[Self.matchupKey(g.matchup)] ?? 1) > 1, props: g.props)
        }
    }

    private var games: [(matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])] {
        gamesMemo
    }

    private var orderedGameIndices: [Int] {
        PicksGameOrder.indices(gamesMemo.map {
            PicksGameOrder.Item(id: Self.gameIdentityKey($0.matchup, $0.commence),
                                start: $0.commence, bucket: gameStatusBucket($0))
        }, historical: pickDay == .yesterday)
    }

    private var gameOrderRequest: PicksGameOrder.Request {
        PicksGameOrder.Request(ids: orderedGameIndices.map {
            Self.gameIdentityKey(gamesMemo[$0].matchup, gamesMemo[$0].commence)
        }, interacting: pagerInteracting)
    }

    private func applyGameOrder() {
        let before = gamesMemo.map { Self.gameIdentityKey($0.matchup, $0.commence) }
        let ordered = orderedGameIndices.map { gamesMemo[$0] }
        let after = ordered.map { Self.gameIdentityKey($0.matchup, $0.commence) }
        guard before != after else { return }
        let selected = PicksGameOrder.selectedPage(page, before: before, after: after)
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction) {
            gamesMemo = ordered
            page = selected
            // Replace the settled UIKit page controller with the new order so
            // it cannot retain adjacent controllers at their former indexes.
            pagerRevision &+= 1
        }
    }

    // MARK: — NCAAF conference navigation (founder, Aug 25 2026)

    private struct NcaafGameMeta {
        var homeConference: String?
        var awayConference: String?
        var homeRanking: Int?
        var awayRanking: Int?
        var conferences: Set<String> { Set([homeConference, awayConference].compactMap { $0 }) }
        var isRanked: Bool { homeRanking != nil || awayRanking != nil }
    }

    /// The Power-4 set — RANKED's backfill prefers these matchups when the AP
    /// poll alone can't fill the strip (Week 0 had exactly one ranked game).
    private static let ncaafPowerConferences: Set<String> = ["SEC", "Big Ten", "Big 12", "ACC", "Pac-12"]
    /// RANKED shows at least this many games when the day has them.
    private static let ncaafRankedFloor = 6
    /// Menu order for the day's conferences (only ones with games show).
    private static let ncaafConferenceOrder = [
        "SEC", "Big Ten", "Big 12", "ACC", "Pac-12", "American",
        "Mountain West", "Sun Belt", "MAC", "CUSA", "Independents",
    ]

    /// Conference/rank identity for the day's NCAAF games, keyed by provider
    /// game id with a matchup-key fallback. Sources: stored picks (post-pick)
    /// and the daily slate (pre-pick) — the first stamp for a key wins. An
    /// empty index means the stamps never arrived; filtering then stands down
    /// entirely rather than hiding games behind unknowable membership.
    private func ncaafMetaIndex() -> [String: NcaafGameMeta] {
        var index: [String: NcaafGameMeta] = [:]
        func put(_ key: String?, _ meta: NcaafGameMeta) {
            guard let key, !key.isEmpty, index[key] == nil,
                  !meta.conferences.isEmpty || meta.isRanked else { return }
            index[key] = meta
        }
        for p in selectedPicks where (p.league ?? "").uppercased() == "NCAAF" {
            let meta = NcaafGameMeta(homeConference: p.homeConference, awayConference: p.awayConference,
                                     homeRanking: p.homeRanking, awayRanking: p.awayRanking)
            put(p.game_id.map { "id\($0)" }, meta)
            let a = (p.awayTeam ?? ""), h = (p.homeTeam ?? "")
            if !a.isEmpty, !h.isEmpty { put("mu" + Self.matchupKey("\(a) @ \(h)"), meta) }
        }
        for s in selectedSlate where (s.league ?? "").uppercased() == "NCAAF" {
            let meta = NcaafGameMeta(homeConference: s.home_conference, awayConference: s.away_conference,
                                     homeRanking: s.home_ranking, awayRanking: s.away_ranking)
            put(s.bdl_game_id.map { "id\($0)" }, meta)
            if let a = s.away_team, let h = s.home_team, !a.isEmpty, !h.isEmpty {
                put("mu" + Self.matchupKey("\(a) @ \(h)"), meta)
            }
        }
        return index
    }

    private func ncaafMeta(
        for game: (matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick]),
        index: [String: NcaafGameMeta]
    ) -> NcaafGameMeta? {
        let ids = Set(game.props.compactMap(\.game_id))
        if ids.count == 1, let id = ids.first, let meta = index["id\(id)"] { return meta }
        return index["mu" + Self.matchupKey(game.matchup)]
    }

    /// The day's conferences that actually have games — the menu never offers
    /// a filter that would render empty.
    private func ncaafConferenceOptions() -> [String] {
        let present = Set(ncaafMetaIndex().values.flatMap { $0.conferences })
        return Self.ncaafConferenceOrder.filter { present.contains($0) }
    }

    private func filterNcaafGames(
        _ games: [(matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])]
    ) -> [(matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])] {
        let index = ncaafMetaIndex()
        guard !index.isEmpty else { return games }

        // An explicit alert must remain reachable even when the RANKED shelf
        // or a conference filter would ordinarily leave that game offscreen.
        func includingNotificationTarget(_ selected: [(matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])])
            -> [(matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])] {
            guard pickDay == .today, let gameID = notificationFocusGameID,
                  !selected.contains(where: { bdlGameId(for: $0) == gameID }),
                  let target = games.first(where: { bdlGameId(for: $0) == gameID }) else { return selected }
            return selected + [target]
        }

        if ncaafConference != Self.ncaafRankedFilter {
            let filtered = games.filter {
                ncaafMeta(for: $0, index: index)?.conferences.contains(ncaafConference) == true
            }
            if filtered.isEmpty {
                // The selected conference left the day's slate (refresh,
                // rollover) — snap home to RANKED, never an empty strip.
                ncaafConference = Self.ncaafRankedFilter
            } else {
                return includingNotificationTarget(filtered)
            }
        }

        // RANKED: every matchup with an AP side leads; when the poll can't
        // fill the strip, backfill with the biggest remaining games — Power-4
        // matchups first, then the rest, each ordered by kickoff.
        var ranked: [(matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])] = []
        var power: [(matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])] = []
        var rest: [(matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])] = []
        for g in games {
            let meta = ncaafMeta(for: g, index: index)
            if meta?.isRanked == true { ranked.append(g) }
            else if meta?.conferences.contains(where: Self.ncaafPowerConferences.contains) == true { power.append(g) }
            else { rest.append(g) }
        }
        let byKickoff: ((matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick]),
                        (matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])) -> Bool = {
            ($0.commence ?? .distantFuture) < ($1.commence ?? .distantFuture)
        }
        let backfillNeed = max(0, Self.ncaafRankedFloor - ranked.count)
        let backfill = Array((power.sorted(by: byKickoff) + rest.sorted(by: byKickoff)).prefix(backfillNeed))
        let visible = ranked.sorted(by: byKickoff) + backfill
        return includingNotificationTarget(visible.isEmpty ? games : visible)
    }

    private func selectNcaafConference(_ value: String) {
        guard ncaafConference != value || notificationFocusGameID != nil else { return }
        notificationFocusGameID = nil
        withAnimation(.easeInOut(duration: 0.25)) {
            ncaafConference = value
            page = 0
        }
        gamesMemo = []
        rebuildMemo()
    }

    /// The strip's conference selector — the day block's exact grammar
    /// (selection over kicker, gold chevron), NCAAF Today only.
    private var conferenceBlock: some View {
        Menu {
            Button("Ranked") { selectNcaafConference(Self.ncaafRankedFilter) }
            ForEach(ncaafConferenceOptions(), id: \.self) { conf in
                Button(conf) { selectNcaafConference(conf) }
            }
        } label: {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 4) {
                    Text(ncaafConference == Self.ncaafRankedFilter ? "RANKED" : ncaafConference.uppercased())
                        .font(HubFont.data(11.5, .semibold))
                        .foregroundStyle(.white.opacity(0.95))
                    Image(systemName: "chevron.down")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundStyle(GaryColors.gold)
                }
                Text("CONFERENCE")
                    .font(HubFont.data(9.5, .medium))
                    .foregroundStyle(.white.opacity(0.55))
            }
            .padding(.horizontal, 13)
            .padding(.vertical, 8)
            .contentShape(Rectangle())
        }
    }

    /// Recompute the memoized game set + edge index. Called on first load and
    /// whenever the underlying picks/props/slate/connections or the day/sport
    /// filter change — NOT on live-score ticks. `nonEmptyKeysOf` guards the
    /// keep-last-good rule the store already follows (never blank a populated bar
    /// on a transient empty refresh).
    private func rebuildMemo() {
        let signature = "\(dataSignature)|\(sport)|\(pickDay)|\(ncaafConference)|\(notificationFocusGameID.map(String.init) ?? "")"
        guard memoSignature != signature else { return }
        memoSignature = signature
        let built = computeGamesUnsorted()
        gameIDMemo = (gameIDSignature, Dictionary(built.map {
            (Self.gameIdentityKey($0.matchup, $0.commence), resolveBdlGameId(for: $0))
        }, uniquingKeysWith: { first, _ in first }))
        // Rank labels share the accepted game/date snapshot. Rebuild once per
        // content revision; live score ticks perform only a dictionary lookup.
        let datedPicks = selectedPicks
        collegeRankingsMemo = Dictionary(built.map { game in
            let sides = game.matchup.components(separatedBy: " @ ")
            let rankings = CollegeTeamRankings.resolve(
                league: gameLeague(game), gameID: bdlGameId(for: game),
                away: sides.first ?? "", home: sides.count == 2 ? sides[1] : "",
                picks: datedPicks, slate: selectedSlate)
            return (Self.gameIdentityKey(game.matchup, game.commence), rankings)
        }, uniquingKeysWith: { first, _ in first })
        // Initial publication: LIVE → upcoming → final, then first pitch.
        // Content refreshes retain existing positions. The lifecycle task below
        // applies any changed order after the page gesture and animation settle.
        // Feed identities are not guaranteed unique. A collision must never
        // trap the app; retain the earliest existing position deterministically.
        let oldOrder = Dictionary(gamesMemo.enumerated().map {
            (Self.gameIdentityKey($0.element.matchup, $0.element.commence), $0.offset)
        }, uniquingKeysWith: { first, _ in first })
        let ordered = built.sorted { lhs, rhs in
            let l = oldOrder[Self.gameIdentityKey(lhs.matchup, lhs.commence)]
            let r = oldOrder[Self.gameIdentityKey(rhs.matchup, rhs.commence)]
            switch (l, r) {
            case let (li?, ri?): return li < ri
            case (_?, nil): return true
            case (nil, _?): return false
            case (nil, nil):
                guard pickDay == .today else { return gameStart(lhs) < gameStart(rhs) }
                return (gameStatusBucket(lhs), gameStart(lhs)) < (gameStatusBucket(rhs), gameStart(rhs))
            }
        }
        gamesMemo = ordered
        if page > ordered.count { page = 0 }
        // PERF#1(c): precompute each game's edge list ONCE (the N×M games×connections
        // scan), keyed by the game's IDENTITY key, so edges(for:) is an O(1) dict
        // lookup at render time. String match (abbrGameMatches / matchup key) finds
        // the matchup; the BDL game id then scopes to the GAME — a doubleheader
        // page only wears edges whose game_id is its own (Jul 22 2026, Max Fried),
        // and an id-less edge stays off a doubleheader page rather than guessed.
        var idx: [String: [Signal]] = [:]
        let currentConnections = self.currentConnections
        for g in built {
            let hay = g.matchup + " " + g.props.compactMap { $0.team }.joined(separator: " ")
            let gKey = Self.matchupKey(g.matchup)
            let gid = bdlGameId(for: g)
            let scopedLeague = gameLeague(g)
            idx[Self.gameIdentityKey(g.matchup, g.commence)] = currentConnections.filter { s in
                guard s.league.label == scopedLeague else { return false }
                // Exact provider identity wins before any team-name parsing.
                // NCAAF insight rows intentionally use provider abbreviations,
                // while slate rows carry full school names; rejecting on the
                // fuzzy guard first made correctly keyed college intel vanish.
                if let gid, let sid = s.gameId.flatMap({ Int($0) }) { return sid == gid }
                guard abbrGameMatches(s.game, matchup: hay) || Self.matchupKey(s.game) == gKey else { return false }
                if g.dh, s.gameId != nil { return false }   // id present but unverifiable — keep it off
                return true
            }
        }
        edgeIndex = idx
    }

    /// Match key from team last-words ("San Diego Padres @ LA Dodgers" →
    /// "padres|dodgers") — dedups the slate's full names against the picks/props
    /// short matchup format.
    static func matchupKey(_ m: String) -> String {
        let sides = m.lowercased().components(separatedBy: " @ ")
        guard sides.count == 2 else { return m.lowercased() }
        let a = sides[0].components(separatedBy: " ").last ?? sides[0]
        let h = sides[1].components(separatedBy: " ").last ?? sides[1]
        return "\(a)|\(h)"
    }

    /// 30-minute identity bucket for a start time — the doubleheader-safe half
    /// of a game's key (Jul 22 2026, the Max Fried mixup). Sources (props,
    /// picks, slate, board, starters) agree on a game's first pitch to the
    /// minute, so flooring to :00/:30 joins them across feeds while cleanly
    /// separating a twin bill's games, which sit hours apart.
    static func timeBucket(_ d: Date?) -> Int? {
        d.map { Int($0.timeIntervalSince1970 / 1800.0) }
    }
    /// A GAME's key: matchup + start bucket. Two games of a doubleheader get
    /// two keys — two tabs, two pages, two sets of attached data.
    static func gameIdentityKey(_ matchup: String, _ commence: Date?) -> String {
        matchupKey(matchup) + "|" + (timeBucket(commence).map(String.init) ?? "")
    }

    /// The game's BDL id from its slate row (doubleheader-exact edge + live
    /// attachment). nil when the slate hasn't landed or the row predates ids.
    private var gameIDSignature: String {
        "\(store.contentRevision)|\(history.revision)|\(historyWeek?.id ?? "")|\(store.loadedDate)|\(sport)|\(pickDay)"
    }

    private func bdlGameId(for g: (matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])) -> Int? {
        if let memo = gameIDMemo, memo.signature == gameIDSignature,
           let cached = memo.ids[Self.gameIdentityKey(g.matchup, g.commence)] {
            return cached
        }
        // Navigation may arrive before the visible game set has been built.
        // Resolve against current content until its scoped memo is ready.
        return resolveBdlGameId(for: g)
    }

    private func resolveBdlGameId(for g: (matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])) -> Int? {
        guard let selectedDate = selectedDate else { return nil }
        let expectedGameDate = ExactGameIdentity.easternDate(of: g.commence) ?? selectedDate
        func belongsToSelectedDate(_ stamp: String?) -> Bool {
            guard let stamp, !stamp.isEmpty else { return true }
            return ExactGameIdentity.easternDate(of: parseISO8601(stamp)) == expectedGameDate
        }
        // The slate store holds Today only. Historical picks must never borrow
        // today's sole same-team id when their original identity is unavailable.
        let daySlate = selectedSlate
        let propIds = Set(g.props.compactMap(\.game_id))
        guard propIds.count <= 1 else { return nil }
        if propIds.count == 1, g.props.allSatisfy({ belongsToSelectedDate($0.commence_time) }) { return propIds.first }

        let key = Self.gameIdentityKey(g.matchup, g.commence)
        let scopedLeague = g.props.first.map { propSportKey($0) }
            ?? sport.uppercased()
        let dayPicks = (selectedPicks)
            .filter { belongsToSelectedDate($0.commence_time) }
        if let id = dayPicks.first(where: {
            let rowLeague = ($0.league ?? "").uppercased()
            return rowLeague == scopedLeague
                && Self.gameIdentityKey("\($0.awayTeam ?? "") @ \($0.homeTeam ?? "")",
                                        $0.commence_time.flatMap(parseISO8601)) == key
        })?.game_id { return id }

        if let id = daySlate.first(where: {
            let rowLeague = ($0.league ?? "").uppercased()
            return rowLeague == scopedLeague && belongsToSelectedDate($0.commence_time)
                && Self.gameIdentityKey("\($0.away_team ?? "") @ \($0.home_team ?? "")",
                                        $0.commence_time.flatMap(parseISO8601)) == key
        })?.bdl_game_id { return id }

        // Exact-id sources can temporarily disagree on kickoff precision (a
        // confirmed pick beside a retained date-only slate row). A same-league,
        // single-provider-id matchup is still unambiguous; doubleheaders yield
        // multiple ids and deliberately fail closed here.
        let matchupKey = Self.matchupKey(g.matchup)
        let candidateIds = Set(
            dayPicks.compactMap { pick -> Int? in
                let rowLeague = (pick.league ?? "").uppercased()
                let matchup = "\(pick.awayTeam ?? "") @ \(pick.homeTeam ?? "")"
                guard rowLeague == scopedLeague,
                      Self.matchupKey(matchup) == matchupKey else { return nil }
                return pick.game_id
            }
            + daySlate.compactMap { row -> Int? in
                let rowLeague = (row.league ?? "").uppercased()
                let matchup = "\(row.away_team ?? "") @ \(row.home_team ?? "")"
                guard rowLeague == scopedLeague, belongsToSelectedDate(row.commence_time),
                      Self.matchupKey(matchup) == matchupKey else { return nil }
                return row.bdl_game_id
            }
        )
        return candidateIds.count == 1 ? candidateIds.first : nil
    }

    /// Carry league identity into a game page even when it is a slate-only
    /// morning placeholder with no pick, prop, edge, or scout row yet. Without
    /// this, football look-aheads briefly mounted the baseball sections and an
    /// untyped INCOMING card until a later payload happened to supply a league.
    private func league(for g: (matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])) -> String? {
        // Every branch of the former slate/pick scan required this same
        // league and returned it. The game set is already sport-scoped.
        sport.uppercased()
    }

    /// Per-GAME live lookup: BDL id first (doubleheader-exact), matchup-string
    /// fallback only on single-game days — a doubleheader page never borrows
    /// its twin's scoreboard row.
    private func liveScore(for g: (matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])) -> LiveScore? {
        if let id = bdlGameId(for: g) {
            return liveCache.status(forGameId: id, league: gameLeague(g))
        }
        if g.dh { return nil }
        let legacy = liveCache.status(forMatchup: g.matchup)
        // Interruption is a game-identity claim and may never use the legacy
        // team-name join. Existing id-less live/final behavior remains intact.
        return legacy?.isInterrupted == true ? nil : legacy
    }

    /// Matchup-bar order: LIVE (0) → upcoming (1) → finished/graded (2). Reads the
    /// live-score cache per GAME, so a game sinks the moment it goes final and a
    /// doubleheader's nightcap never inherits the matinee's state.
    private func gameStatusBucket(_ g: (matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])) -> Int {
        if let ls = liveScore(for: g) {
            if ls.isFinal { return 2 }
            if ls.isLive { return 0 }
            if ls.isInterrupted { return 1 }
        }
        if selectedGrades.isFinal(league: gameLeague(g),
            date: ExactGameIdentity.easternDate(of: g.commence), gameID: bdlGameId(for: g)) { return 2 }
        return 1
    }
    /// Kickoff/first-pitch, to order within a bucket — the game's own identity
    /// time (baked in at grouping) does the whole job now.
    private func gameStart(_ g: (matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])) -> Date {
        g.commence ?? .distantFuture
    }
    private var topProps: [PropPick] {
        // TODAY is strictly today's slate. Yesterday's settled cards live only
        // behind the explicit Yesterday selector; an empty morning board shows
        // PICKS INCOMING instead of relabeling an old result as today's pick.
        // The showcase is the PRODUCT: the long shot rides its game's carousel,
        // never the free page's headline card (founder, Jul 29 — HR is drama).
        let dayProps = (pickDay == .yesterday ? filteredYesterdayProps : filteredTodayProps)
            .filter { !isHomeRunProp($0) }
        return Array(dayProps.sorted { ($0.confidence ?? 0) > ($1.confidence ?? 0) }.prefix(2))
    }
    /// The selected day's top game pick. The Today overview never borrows a
    /// prior-day pick; Yesterday uses its complete, explicitly selected board.
    private var topGamePick: (pick: GaryPick, isYesterday: Bool)? {
        let isYesterday = pickDay == .yesterday
        let rows = selectedPicks
        let source = rows.filter {
            ($0.league ?? "").uppercased() == sport
                && (isYesterday || isTodaysShowcasePick($0))
        }
        guard let pick = source.sorted(by: { ($0.confidence ?? 0) > ($1.confidence ?? 0) }).first else { return nil }
        return (pick, isYesterday)
    }

    /// Current-day candidates used only when establishing the immutable landing
    /// card. Yesterday fallback cards are deliberately not locked: a real pick
    /// for the new board must still be able to replace that recap once it drops.
    private var freshShowcaseGame: GaryPick? {
        let rows = store.gamePicks.filter { ($0.league ?? "").uppercased() == sport && isTodaysShowcasePick($0) }
        return rows.sorted { ($0.confidence ?? 0) > ($1.confidence ?? 0) }.first
    }
    private func isTodaysShowcasePick(_ pick: GaryPick) -> Bool {
        if sport == "NCAAF" {
            return store.slate.contains { $0.league?.uppercased() == "NCAAF" && $0.bdl_game_id == pick.game_id }
        }
        guard sport == "NFL" else { return true }
        guard let kickoff = pick.commence_time.flatMap(parseISO8601) else { return false }
        return Self.showcaseDayFormatter.string(from: kickoff) == store.loadedDate
    }

    private var freshShowcaseProp: PropPick? {
        filteredTodayProps.filter { !isHomeRunProp($0) }
            .sorted { ($0.confidence ?? 0) > ($1.confidence ?? 0) }.first
    }

    /// Only a lock for the currently visible slate day + league may render.
    private var activeShowcaseLock: PicksShowcaseLock? {
        guard let lock = showcaseLock,
              lock.slateDate == SupabaseAPI.todayEST(),
              lock.league == sport,
              showcasePayloadBelongsToCurrentSlate(lock) else { return nil }
        return lock
    }

    /// A lock preserves a posted pick for its own board, but it must never carry
    /// a prior-day result into the next 6 a.m. slate. Prefer the payload's game
    /// time; older records without one must still exist in today's fresh feed.
    private func showcasePayloadBelongsToCurrentSlate(_ lock: PicksShowcaseLock) -> Bool {
        let today = SupabaseAPI.todayEST()
        switch lock.kind {
        case .game:
            guard let pick = lock.gamePick, isTodaysShowcasePick(pick) else { return false }
            if let iso = pick.commence_time, let date = parseISO8601(iso) {
                return Self.showcaseDayFormatter.string(from: date) == today
            }
            return store.gamePicks.contains { $0.id == pick.id }
        case .prop:
            guard let prop = lock.propPick else { return false }
            if let iso = prop.commence_time, let date = parseISO8601(iso) {
                return Self.showcaseDayFormatter.string(from: date) == today
            }
            return store.allProps.contains { $0.id == prop.id }
        }
    }

    /// Feed the landing page exactly one side of its game-vs-prop chooser once
    /// locked, making later arrivals unable to win a new confidence comparison.
    private var landingTopProps: [PropPick] {
        guard pickDay == .today, let lock = activeShowcaseLock else { return topProps }
        guard lock.kind == .prop, var prop = lock.propPick else { return [] }
        // Older saved cards dropped text game IDs. Restore only that metadata
        // from the identical published ticket; the locked prediction stays put.
        if prop.game_id == nil {
            let ids = Set(store.allProps.compactMap { candidate -> Int? in
                var legacy = candidate
                legacy.game_id = nil
                return legacy.id == prop.id ? candidate.game_id : nil
            })
            if ids.count == 1 { prop.game_id = ids.first }
        }
        return [prop]
    }
    private var landingTopGamePick: (pick: GaryPick, isYesterday: Bool)? {
        guard pickDay == .today, let lock = activeShowcaseLock else { return topGamePick }
        guard lock.kind == .game, let pick = lock.gamePick else { return nil }
        return (pick, false)
    }

    private static func showcaseStorageKey(date: String, league: String) -> String {
        "\(showcaseLockPrefix)\(date).\(league.uppercased())"
    }

    /// Restore the league's published card, or freeze the best current-day
    /// candidate the first time one exists. New games/props can continue loading;
    /// they simply cannot displace the card users already saw.
    private func lockShowcaseIfNeeded() {
        guard pickDay == .today else { return }

        let date = SupabaseAPI.todayEST()
        if let lock = activeShowcaseLock,
           lock.slateDate == date,
           lock.league == sport { return }

        let defaults = UserDefaults.standard
        let key = Self.showcaseStorageKey(date: date, league: sport)
        if let data = defaults.data(forKey: key),
           let restored = try? JSONDecoder().decode(PicksShowcaseLock.self, from: data),
           restored.slateDate == date,
           restored.league == sport,
           showcasePayloadBelongsToCurrentSlate(restored) {
            showcaseLock = restored
            return
        }

        // Invalid current-date locks are legacy/stale payloads (for example a
        // prior-night prop first seen during a failed morning refresh). Remove
        // only this derived UI snapshot; the database pick/result is untouched.
        defaults.removeObject(forKey: key)

        showcaseLock = nil
        let game = freshShowcaseGame
        let prop = freshShowcaseProp
        let lock: PicksShowcaseLock?
        if let game, let prop {
            if (game.confidence ?? 0) >= (prop.confidence ?? 0) {
                lock = PicksShowcaseLock(slateDate: date, league: sport, kind: .game,
                                         gamePick: game, propPick: nil)
            } else {
                lock = PicksShowcaseLock(slateDate: date, league: sport, kind: .prop,
                                         gamePick: nil, propPick: prop)
            }
        } else if let game {
            lock = PicksShowcaseLock(slateDate: date, league: sport, kind: .game,
                                     gamePick: game, propPick: nil)
        } else if let prop {
            lock = PicksShowcaseLock(slateDate: date, league: sport, kind: .prop,
                                     gamePick: nil, propPick: prop)
        } else {
            lock = nil
        }

        guard let lock, let data = try? JSONEncoder().encode(lock) else { return }
        defaults.set(data, forKey: key)
        // One small snapshot per active league is enough. Remove prior board
        // dates so UserDefaults never grows with a season of full pick payloads.
        let keepPrefix = "\(Self.showcaseLockPrefix)\(date)."
        for oldKey in defaults.dictionaryRepresentation().keys
            where oldKey.hasPrefix(Self.showcaseLockPrefix) && !oldKey.hasPrefix(keepPrefix) {
            defaults.removeObject(forKey: oldKey)
        }
        showcaseLock = lock
    }
    private var hasContent: Bool { !topProps.isEmpty || topGamePick != nil || !games.isEmpty }

    var body: some View {
        ZStack {
            // College football reads on Home's floor (founder, Sep 4 2026);
            // every other league keeps the flat house ink.
            if sport == "NCAAF" {
                BorrowedHomeBackground()
            } else {
                LiquidGlassBackground(grainDensity: 0)
            }
            VStack(spacing: 0) {
                masthead
                slateStrip
                content
            }
        }
        .environment(\.solidPanels, sport == "NCAAF")
        .task {
            await store.loadIfNeeded()
            rebuildMemo()          // build the memo before consumeFocus reads `games`
            snapSportToAvailableLeague()
            lockShowcaseIfNeeded()
            consumeFocus()
            if !connLoaded { await loadConnections() }
            rebuildMemo()          // fold the just-loaded connections into the edge index
        }
        .task {
            // Strip context is cached and safe to miss; its O/U simply stays off.
            if stripBoard == nil { stripBoard = await TodayBoardCache.get() }
        }
        .task(id: historyWeek?.id) {
            await history.select(historyWeek)
            rebuildMemo()
        }
        .task(id: researchRequestKey) { await loadConnections() }
        .task(id: sport) {
            if usesFootballWeeks { await history.loadWeeks(league: sport) }
            // Each league owns its record. Clear the previous desk immediately so
            // NFL/NCAAF can never flash MLB's L7 while their scoped fetch resolves.
            record7 = nil
            let scopedLeague = sport
            let record = await SupabaseAPI.fetchSevenDayPickRecord(league: scopedLeague)
            guard !Task.isCancelled, sport == scopedLeague else { return }
            record7 = record
        }
        .task {
            // Keep the SHARED live-score cache warm while this tab is on screen — the
            // matchup tabs and the cards both read LiveScoreCache.shared now (it owns
            // the dedup + its own adaptive refresh loop), so this page no longer keeps
            // its own snapshot that could disagree with the cards.
            liveCache.startIfNeeded()
        }
        .task(id: gameOrderRequest) {
            guard !pagerInteracting else { return }
            // Cancels on a new gesture/status change. Let UIKit finish its page
            // transition before replacing the controller with reordered games.
            do { try await Task.sleep(nanoseconds: 450_000_000) } catch { return }
            guard !Task.isCancelled, !pagerInteracting else { return }
            applyGameOrder()
        }
        .onChange(of: sport) { _ in
            if sport != "NCAAF" { notificationFocusGameID = nil }
            if historyWeek?.league != sport { historyWeek = nil }
            page = 0
            // A fresh league entry always starts college at RANKED.
            ncaafConference = Self.ncaafRankedFilter
            gamesMemo = []
            rebuildMemo()
            lockShowcaseIfNeeded()
            consumeFocus()
        }
        .onChange(of: pickDay) { _ in
            if pickDay != .today { notificationFocusGameID = nil }
            else { historyWeek = nil }
            page = 0
            gamesMemo = []
            rebuildMemo()
            lockShowcaseIfNeeded()
            consumeFocus()
        }
        // The store's picks/props/slate settle asynchronously after each load — a
        // accepted-content revision fires rebuildMemo() when they change,
        // so the memo tracks the data without recomputing on every live-score tick.
        .onChange(of: dataSignature) { _ in
            rebuildMemo()
            snapSportToAvailableLeague()
            lockShowcaseIfNeeded()
            consumeFocus()
        }
        .onChange(of: focusState.focusGame) { _ in consumeFocus() }
        .onChange(of: focusState.focusRequestID) { _ in consumeFocus() }
        .onChange(of: store.loadedDate) { _ in notificationFocusGameID = nil }
        .onChange(of: store.loading) { loading in if !loading { snapSportToAvailableLeague(); consumeFocus() } }
        .onChange(of: scenePhase) { phase in
            // Foreground → silently re-pull picks/props (the spinner is gated by
            // !hasContent, so existing data stays put while fresh rows load underneath).
            if phase == .active, selectedTab == 3, pickDay == .today { Task { await refreshRollingPicks() } }
        }
        .onChange(of: selectedTab) { tab in
            guard tab == 3, scenePhase == .active else { return }
            consumeFocus()
            Task { await refreshRollingPicks() }
        }
        .onReceive(rollingPicksRefreshTimer) { _ in
            guard selectedTab == 3, scenePhase == .active, pickDay == .today else { return }
            Task { await refreshRollingPicks() }
        }
        .onGaryTour { verb, arg in
            switch verb {
            case "picks": if let idx = Int(arg) { withAnimation { page = idx } }
            case "picksday": withAnimation { pickDay = arg == "yesterday" ? .yesterday : .today }
            case "picksport":
                if sports.contains(arg.uppercased()) { sport = arg.uppercased(); sportAutoSelected = false }
            default: break
            }
        }
    }

    @MainActor
    private func refreshRollingPicks() async {
        if isWeekHistory {
            await history.select(historyWeek, force: true)
            await loadConnections(force: true)
            return
        }
        guard !rollingPicksRefreshInFlight, !store.loading else { return }
        rollingPicksRefreshInFlight = true
        defer { rollingPicksRefreshInFlight = false }
        // The pull gesture's task is SwiftUI's to cancel — a mid-pull
        // re-render tears it down and every in-flight request died
        // "cancelled" (Aug 26 sim repro: the fresh Dbacks pick never landed
        // and the banner blamed the source). The actual work runs in an
        // UNSTRUCTURED task the gesture cannot kill; awaiting its value
        // keeps the spinner honest for the full duration.
        let work = Task {
            await store.refresh()
            await loadConnections(force: true)
        }
        await work.value
    }

    /// Accepted content, including same-count prose and metadata edits, owns
    /// memo invalidation. Starting or completing an unchanged fetch does not.
    private var dataSignature: String {
        "\(store.contentRevision)|\(connectionRevision)|\(history.revision)|\(historyWeek?.id ?? "")"
    }

    /// Land on the exact game the Hub deep-linked. Typed requests wait for
    /// loading to finish and never substitute a same-matchup sibling. Older
    /// name-only links ("LAD @ ARI") retain their abbreviation fallback.
    private func consumeFocus() {
        guard let focus = focusState.focusGame else { return }
        guard preparePushFocusIfNeeded() else { return }
        if focus.isEmpty { focusState.clearGameFocus(); page = 0; return }
        let focusLeague = focusState.focusLeague
        let focusGameID = focusState.focusGameID
        let exactSlate = focusGameID.flatMap { gameID in
            store.slate.first {
                $0.bdl_game_id == gameID
                    && (focusLeague == nil || ($0.league ?? "").uppercased() == focusLeague)
            }
        }
        let exactPick = focusGameID.flatMap { gameID in
            store.gamePicks.first {
                $0.game_id == gameID
                    && (focusLeague == nil || ($0.league ?? "").uppercased() == focusLeague)
            }
        }
        let targetLeague = focusLeague
            ?? exactSlate?.league?.uppercased()
            ?? exactPick?.league?.uppercased()
            ?? { () -> String? in
                guard focusGameID == nil else { return nil }
                return store.slate.first {
                    abbrGameMatches(focus, matchup: "\($0.away_team ?? "") @ \($0.home_team ?? "")")
                }?.league?.uppercased()
                    ?? store.gamePicks.first {
                        abbrGameMatches(focus, matchup: "\($0.awayTeam ?? "") @ \($0.homeTeam ?? "")")
                    }?.league?.uppercased()
            }()

        // Change the day and league before consulting the scoped `games` memo.
        // The request stays pending across either state transition; the next
        // runloop consumes it after onChange rebuilds the correct desk.
        if pickDay != .today {
            pickDay = .today
            return
        }
        if let targetLeague {
            // Do not consume a typed target against the wrong desk while its
            // league is still loading into the unscoped source set.
            guard sports.contains(targetLeague) else {
                if focusGameID != nil && !store.loading {
                    reportMissingPushFocus()
                    focusState.clearGameFocus()
                    page = 0
                }
                return
            }
            if sport != targetLeague {
                sport = targetLeague
                sportAutoSelected = false
                return
            }
        }

        if let gameID = focusGameID {
            guard !store.loading else { return }
            let idx = games.firstIndex { bdlGameId(for: $0) == gameID }
            if idx == nil { reportMissingPushFocus() }
            focusState.clearGameFocus()
            // A settled missing target returns to the overview, including an
            // empty desk. Matchup/time guesses could open another doubleheader.
            withAnimation(.easeInOut(duration: 0.25)) { page = idx.map { $0 + 1 } ?? 0 }
            return
        }

        guard !games.isEmpty else { return }
        let idx = games.firstIndex(where: { abbrGameMatches(focus, matchup: $0.matchup) })
        focusState.clearGameFocus()
        if let idx {
            withAnimation(.easeInOut(duration: 0.25)) { page = idx + 1 }
        }
    }

    private func preparePushFocusIfNeeded() -> Bool {
        guard let date = focusState.focusDate else { return true }
        guard selectedTab == 3 else { return false }
        guard date == SupabaseAPI.todayEST() else {
            if let league = focusState.focusLeague, let gameID = focusState.focusGameID {
                GaryPushNavigation.shared.receive([
                    "destination": "picks", "league": league, "game_id": String(gameID),
                    "game_date": date, "matchup": focusState.focusGame ?? ""
                ], requestID: UUID().uuidString)
            }
            focusState.clearGameFocus()
            return false
        }
        if store.loadedDate != date || focusState.focusRefresh {
            guard !pushFocusLoadInFlight else { return false }
            pushFocusLoadInFlight = true
            let requestID = focusState.focusRequestID
            let forceRefresh = focusState.focusRefresh
            focusState.focusRefresh = false
            Task {
                await store.loadIfNeeded(forceRefresh: forceRefresh)
                pushFocusLoadInFlight = false
                if focusState.focusRequestID == requestID { rebuildMemo() }
                consumeFocus()
            }
            return false
        }
        guard !store.loading else { return false }
        if sport == "NCAAF", notificationFocusGameID != focusState.focusGameID {
            notificationFocusGameID = focusState.focusGameID
            ncaafConference = Self.ncaafRankedFilter
            rebuildMemo()
        }
        return true
    }

    private func reportMissingPushFocus() {
        guard let date = focusState.focusDate, let league = focusState.focusLeague,
              let gameID = focusState.focusGameID else { return }
        GaryPushNavigation.shared.missingGame(.init(league: league, gameID: gameID,
            date: date, matchup: focusState.focusGame ?? "Game \(gameID)"))
    }

    @ViewBuilder private var content: some View {
        if (isWeekHistory ? history.loading : store.loading) && !hasContent && (isWeekHistory || !store.slateUnavailable) {
            Spacer(); ProgressView().tint(GaryColors.gold); Spacer()
        } else if !hasContent {
            ScrollView(showsIndicators: false) {
                if isWeekHistory && history.failed {
                    Button("Couldn’t load this week · Tap to retry") { Task { await refreshRollingPicks() } }.tint(GaryColors.gold)
                }
                emptyState
                    .frame(maxWidth: .infinity, minHeight: 480, alignment: .topLeading)
            }
            .refreshable { await refreshRollingPicks() }
        } else {
            VStack(spacing: 0) {
                if isWeekHistory && history.failed {
                    Button("Couldn’t load this week · Tap to retry") { Task { await refreshRollingPicks() } }.tint(GaryColors.gold)
                } else if pickDay == .today && scopedBoardSourceFailed {
                    sourceFailureBanner
                }
                pager
            }
        }
    }

    private var scopedBoardSourceFailed: Bool {
        if store.propPickSourceFailed || store.slateSourceFailed { return true }
        switch sport {
        case "NFL": return store.gamePickSourceFailures.contains("NFL")
        default: return store.gamePickSourceFailures.contains("DAILY")
        }
    }

    private var sourceFailureBanner: some View {
        Button {
            Task { await refreshRollingPicks() }
        } label: {
            HStack(spacing: 7) {
                BroadcastBar(height: 9)
                Text(store.loading ? "REFRESHING THE BOARD…" : "COULDN’T REFRESH · TAP TO RETRY")
                    .font(GaryFonts.mono(9.5, bold: true)).tracking(0.7)
                    .foregroundStyle(GaryColors.gold)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .pageGutter()
            .padding(.vertical, 10)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(store.loading)
        .accessibilityLabel(store.loading ? "Refreshing the board" : "Retry board refresh")
        .background(Color.black.opacity(0.22))
    }

    private var pager: some View {
        VStack(spacing: 0) {
            TabView(selection: $page) {
                ScrollView(showsIndicators: false) {
                    PicksTodayPage(topProps: landingTopProps, topGamePick: landingTopGamePick,
                                   gamePickResult: { gameGrade($0) }, resultForProp: { propGrade($0) },
                                   edges: sportConnections, scopeLeague: effectiveScope, isToday: pickDay == .today, onTapProp: { selectedProp = $0 })
                        .padding(.bottom, 130)
                }
                .refreshable { await refreshRollingPicks() }
                .clipped()
                .tag(0)
                ForEach(Array(games.enumerated()), id: \.offset) { idx, g in
                    ScrollView(showsIndicators: false) {
                        DeferredPicksPage {
                        if abs(page - (idx + 1)) <= 1 {
                        PicksGamePage(group: g,
                                      // MLB HR is a HOME-RUN props lane — never show the game's
                                      // side/total pick there, only the HR bets. On Yesterday,
                                      // prefer yesterday's (graded) pick for a series matchup.
                                      // Doubleheaders: only picks stamped for THIS game's start
                                      // bucket ride this page — the twin keeps its own.
                                      entries: {
                                          guard sport != "MLB HR" else { return [] }
                                          if isWeekHistory {
                                              let id = bdlGameId(for: g)
                                              return selectedPicks.filter { id != nil && $0.game_id == id }.map { (pick: $0, isYesterday: true) }
                                          }
                                          let all = store.gamePicksForMatchup(
                                              g.matchup,
                                              league: league(for: g),
                                              preferYesterday: pickDay == .yesterday
                                          )
                                          guard g.dh else { return all }
                                          return all.filter {
                                              Self.timeBucket($0.pick.commence_time.flatMap(parseISO8601)) == Self.timeBucket(g.commence)
                                          }
                                      }(),
                                      gamePickResult: { gameGrade($0) }, resultForProp: { propGrade($0) },
                                      gamePickFinalScore: { pick in
                                          selectedGrades.score(league: pick.league,
                                              date: ExactGameIdentity.easternDate(of: pick.commence_time.flatMap(parseISO8601)),
                                              gameID: pick.game_id)
                                      },
                                      settledFinalScore: selectedGrades.score(league: gameLeague(g), date: ExactGameIdentity.easternDate(of: g.commence), gameID: bdlGameId(for: g)),
                                      edges: edges(for: g), bdlGameId: bdlGameId(for: g),
                                      slateDate: ExactGameIdentity.easternDate(of: g.commence).map { min($0, SupabaseAPI.todayEST()) } ?? selectedDate,
                                      interruptionLabel: interruptionLabel(for: g),
                                      onTapProp: { selectedProp = $0 },
                                      onSeeYesterday: { withAnimation(.easeInOut(duration: 0.25)) { pickDay = .yesterday; page = 0 } },
                                      pageLeagueHint: league(for: g))
                            .padding(.bottom, 130)
                        } else {
                            Color.clear.frame(height: 1)
                        }
                        }
                    }
                    .refreshable { await refreshRollingPicks() }
                    .clipped()
                    .id(Self.gameIdentityKey(g.matchup, g.commence))
                    .tag(idx + 1)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .simultaneousGesture(DragGesture(minimumDistance: 10)
                .updating($pagerInteracting) { _, active, _ in active = true })
            // A league switch replaces the page controller immediately. Keeping
            // the old controller alive for an animated crossfade briefly painted
            // MLB cards underneath the NFL header even though the data was scoped.
            .id("\(sport)-\(historyWeek?.id ?? (pickDay == .today ? "today" : "yesterday"))-\(pagerRevision)")
        }
    }

    /// The Hub masthead, worn by Picks (founder, Jul 22: "the nav bar at the
    /// top of The Hub and this entire upper part is what I want for the Picks
    /// page"): bear + THE PICKS wordmark, the rolling 7-day pick record, the
    /// double gold rule, then the league tabs in the Hub's underline idiom.
    /// Same ramp (HubFont), same geometry — only the record's source differs
    /// (real game picks, not insight lanes).
    // The ONE header (Aug 4) — logo/wordmark/rule now come from GaryPageHeader
    // (the record rides the trailing slot; the two-line record row and the
    // page's own double-rule seam retired with the five-masthead era). The
    // sport tab row is this page's control strip, stacked under the template.
    private var masthead: some View {
        VStack(alignment: .leading, spacing: 0) {
            // MLB PICKS as the switcher (founder, Aug 6): the league moved
            // into the wordmark — tap the title to change sport — and the
            // separate trigger row below retired, buying back its height.
            GaryPageHeader(title: sport.isEmpty ? "The" : sport,
                           goldPart: "Picks ▾",
                           titleAction: { if !sports.isEmpty { presentLeagueWords() } },
                           titleAccessibilityLabel: "Switch league, \(sport) selected",
                           trailing: {
                if let r = record7 {
                    let pct = Int((Double(r.w) / Double(max(r.w + r.l, 1)) * 100).rounded())
                    HStack(spacing: 5) {
                        Text("L7")
                            .font(GaryFonts.kicker(9.5)).tracking(1.2)
                            .foregroundStyle(.white.opacity(0.62))
                        Text("\(r.w)–\(r.l) · \(pct)%")
                            .font(GaryFonts.data(11, .bold))
                            .foregroundStyle(GaryColors.gold)
                    }
                }
            })

            // LEAGUE WORDS (founder pick, mock 64): the underline sport tabs
            // became a single trigger — tap the current league and the full-
            // screen typographic switcher takes the room. Unlike the old
            // underline tabs (which only existed to switch BETWEEN leagues,
            // so hid at count<=1), this trigger always shows whenever there's
            // a real league to label — it's the page's "you're looking at
            // MLB" readout as much as a switcher, and today it's the only way
            // to see the feature at all before football/basketball are live.
        }
    }

    /// Tonight's slate count for a sport tab — the overlay's superscript.
    /// Real info only: lanes without a slate row (MLB HR) show a bare word.
    private func slateGameCount(_ s: String) -> Int {
        store.slate.filter { ($0.league ?? "").uppercased() == s.uppercased() }.count
    }

    private func presentLeagueWords() {
        let opts = sports.map { s -> LeagueOverlayState.Option in
            let n = slateGameCount(s)
            let live = liveCache.scores.contains {
                $0.isLive && ($0.league ?? "").uppercased() == s.uppercased()
            }
            let liveCount = liveCache.scores.filter {
                $0.isLive && ($0.league ?? "").uppercased() == s.uppercased()
            }.count
            let sup: String? = n > 0
                ? (live ? "\(n) · \(liveCount) LIVE" : "\(n) GAME\(n == 1 ? "" : "S")")
                : nil
            return .init(code: s, sup: sup, live: live, selected: s == sport)
        }
        // The whole calendar, not just what's live (founder, Aug 4).
        let full = opts + LeagueOverlayState.offSeasonOptions(excluding: Set(sports))
        LeagueOverlayState.shared.present(full) { picked in
            sport = picked
            sportAutoSelected = false
        }
    }

    /// The day's slate as the game selector — the Hub strip's exact grammar
    /// (abbr matchup over time + O/U, hairline-separated blocks), with
    /// selection: tapping a block pages to that game. The first block is the
    /// Today/Yesterday day selector; live/final states take the second line.
    private var slateStrip: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 0) {
                    dayBlock
                    // NCAAF only: the conference selector rides the strip in
                    // the day block's grammar (founder, Aug 25 2026).
                    if sport == "NCAAF", pickDay == .today, !ncaafConferenceOptions().isEmpty {
                        Rectangle().fill(Color.white.opacity(0.1)).frame(width: 1, height: 26)
                        conferenceBlock
                    }
                    ForEach(Array(games.enumerated()), id: \.offset) { idx, g in
                        HStack(spacing: 0) {
                            Rectangle().fill(Color.white.opacity(0.1)).frame(width: 1, height: 26)
                            stripBlock(idx + 1, g)
                        }
                        .id(idx + 1)
                    }
                }
                .padding(.horizontal, 18)
            }
            .fixedSize(horizontal: false, vertical: true)
            .onChange(of: page) { p in withAnimation { proxy.scrollTo(p, anchor: .center) } }
        }
        .padding(.top, 12)
        .padding(.bottom, 2)
    }

    /// Label the accepted slate, including while a newer day is still loading.
    /// With no accepted date yet, use the app's shared 6 AM Eastern rollover.
    private static func slateDayLabel(loadedDate: String, yesterday: Bool, now: Date = Date()) -> String {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "America/New_York") ?? TimeZone(secondsFromGMT: 0)!
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = cal
        formatter.timeZone = cal.timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false
        func parsedDay(_ value: String) -> Date? {
            guard let date = formatter.date(from: value), formatter.string(from: date) == value else { return nil }
            return date
        }
        guard let acceptedDay = parsedDay(loadedDate) ?? parsedDay(SupabaseAPI.todayEST(now: now)),
              let displayDay = cal.date(byAdding: .day, value: yesterday ? -1 : 0, to: acceptedDay) else { return "—" }
        formatter.dateFormat = "MMM d"
        return formatter.string(from: displayDay).uppercased()
    }

    private var footballHistoryWeeks: [NFLPicksWeek] {
        let currentStart = SupabaseAPI.getNFLWeekStart(for: SupabaseAPI.todayEST()) ?? ""
        return history.weeks.filter {
            $0.league == sport && (sport == "NCAAF" ? $0.week_start <= currentStart : $0.week_start < currentStart)
        }
    }

    private var currentNFLWeekLabel: String {
        let today = SupabaseAPI.todayEST()
        let start = SupabaseAPI.getNFLWeekStart(for: today)
        return history.weeks.first { $0.league == "NFL" && $0.week_start == start }?.label
            ?? NFLPicksWeek.nflWeek(containing: today)?.label
            ?? "This Week"
    }

    @ViewBuilder private func historyWeekButton(_ week: NFLPicksWeek) -> some View {
        Button(week.label) {
            historyWeek = week; pickDay = .yesterday; page = 0; gamesMemo = []; rebuildMemo()
        }
    }

    /// Football history uses week labels; other sports retain their date controls.
    private var dayBlock: some View {
        let on = (page == 0)
        return Menu {
            Button(sport == "NFL" ? currentNFLWeekLabel : "Today") { historyWeek = nil; withAnimation(.easeInOut(duration: 0.25)) { pickDay = .today; page = 0 } }
            Button("Yesterday") { historyWeek = nil; withAnimation(.easeInOut(duration: 0.25)) { pickDay = .yesterday; page = 0 } }
            if usesFootballWeeks {
                let weeks = footballHistoryWeeks
                let seasons = Set(weeks.compactMap(\.season)).sorted(by: >)
                if seasons.count > 1 {
                    ForEach(seasons, id: \.self) { season in
                        Section(String(season)) {
                            ForEach(weeks.filter { $0.season == season }) { historyWeekButton($0) }
                        }
                    }
                } else {
                    ForEach(weeks) { historyWeekButton($0) }
                }
            }
        } label: {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 4) {
                    Text(isWeekHistory ? (historyWeek?.shortLabel ?? "HISTORY") : pickDay == .today ? (sport == "NFL" ? currentNFLWeekLabel.uppercased() : "TODAY") : "YESTERDAY")
                        .font(HubFont.data(11.5, .semibold))
                        .foregroundStyle(.white.opacity(on ? 0.95 : 0.62))
                    Image(systemName: "chevron.down")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundStyle(GaryColors.gold)
                }
                if !usesFootballWeeks {
                    Text(Self.slateDayLabel(loadedDate: store.loadedDate, yesterday: pickDay == .yesterday))
                        .font(HubFont.data(9.5, .medium))
                        .foregroundStyle(.white.opacity(0.55))
                }
            }
            .padding(.trailing, 13)
            .padding(.vertical, 8)
            .contentShape(Rectangle())
        }
        .id(0)
    }

    /// One game on the strip: "PIT @ NYY" over its status — pre-game the time
    /// (+ O/U when the board knows it), then ▶ LIVE · score, then FINAL · score.
    /// A doubleheader shows two blocks, told apart by their times.
    private func stripBlock(_ index: Int, _ g: (matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])) -> some View {
        let on = (index == page)
        let lg = gameLeague(g)
        let parts = g.matchup.components(separatedBy: " @ ")
        let official = boardAbbreviations(for: g)
        // College names are the long ones — "SAN JOSÉ STATE SPARTANS @ EASTERN
        // MICHIGAN EAGLES" ran off the block (founder, Sep 4 2026). The
        // provider's own scoreboard code leads (SJSU @ EMU); a school it does
        // not carry falls back to its name without the mascot.
        let plainLabel = official.map { "\($0.away) @ \($0.home)" }
            ?? (parts.count == 2
                ? (lg == "NCAAF"
                    ? "\(Self.ncaafStripName(parts[0])) @ \(Self.ncaafStripName(parts[1]))"
                    : "\(teamAbbrev(parts[0], league: lg)) @ \(teamAbbrev(parts[1], league: lg))")
                : g.matchup.uppercased())
        let labels = plainLabel.components(separatedBy: " @ ")
        let rankings = collegeRankingsMemo[Self.gameIdentityKey(g.matchup, g.commence)] ?? .unranked
        let label = labels.count == 2 ? rankings.matchup(away: labels[0], home: labels[1]) : plainLabel
        let timeLabel = g.time.replacingOccurrences(of: " ET", with: "")
        let total = totalFor(g)
        return Button { withAnimation(.easeInOut(duration: 0.25)) { page = index } } label: {
            VStack(alignment: .leading, spacing: 3) {
                Text(label)
                    .font(HubFont.data(11.5, .semibold))
                    .foregroundStyle(.white.opacity(on ? 0.95 : 0.62))
                    .lineLimit(1).fixedSize(horizontal: true, vertical: false)
                HStack(spacing: 6) {
                    if let lf = liveFinalLine(for: g) {
                        Text(lf.text)
                            .font(HubFont.data(9.5, .medium))
                            .foregroundStyle(lf.color)
                    } else {
                        if !timeLabel.isEmpty {
                            Text(timeLabel)
                                .font(HubFont.data(9.5, .medium))
                                .foregroundStyle(on ? GaryColors.gold : .white.opacity(0.55))
                        }
                        if let total {
                            Text("O/U \(HubFmt.stat(total))")
                                .font(HubFont.data(9.5, .medium))
                                .foregroundStyle(.white.opacity(0.55))
                        }
                        if timeLabel.isEmpty && total == nil {
                            // Keep every block two lines tall so the strip never
                            // staggers when one game is missing its time.
                            Text(" ").font(HubFont.data(9.5, .medium))
                        }
                    }
                }
            }
            .padding(.horizontal, 13)
            .padding(.vertical, 8)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    /// One college side on the strip: the provider's abbreviation, else the
    /// school without its mascot, else the raw name. Never the mascot.
    static func ncaafStripName(_ team: String) -> String {
        if let abbr = NCAAFTeams.abbreviation(team) { return abbr }
        return Formatters.shortTeamName(team, league: "NCAAF").uppercased()
    }

    /// Board O/U for a strip block (today only — yesterday's blocks carry FINALs).
    /// Matched by GAME identity, so a doubleheader's blocks wear their own totals.
    private func totalFor(_ g: (matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])) -> Double? {
        guard pickDay == .today, let rows = stripBoard?.board else { return nil }
        let key = Self.gameIdentityKey(g.matchup, g.commence)
        return rows.first {
            Self.gameIdentityKey("\($0.away_team ?? "") @ \($0.home_team ?? "")",
                                 $0.commence_time.flatMap(parseISO8601)) == key
        }?.total
    }

    /// Official provider abbreviations, resolved by exact provider game id and
    /// league before any legacy name/time fallback. This is especially important
    /// for NCAAF, where a mascot-derived fallback can turn "Alabama Crimson Tide"
    /// into the incorrect "TID".
    private func boardAbbreviations(for g: (matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])) -> (away: String, home: String)? {
        guard pickDay == .today else { return nil }
        let league = gameLeague(g).uppercased()

        if let gameId = bdlGameId(for: g),
           let live = liveCache.status(forGameId: gameId, league: league),
           (live.league ?? "").uppercased() == league,
           let away = live.away_abbr?.trimmingCharacters(in: .whitespacesAndNewlines),
           let home = live.home_abbr?.trimmingCharacters(in: .whitespacesAndNewlines),
           !away.isEmpty, !home.isEmpty {
            let sides = g.matchup.components(separatedBy: " @ ")
            return (scoreboardTeamAbbreviation(sides.first, stored: away, league: league),
                    scoreboardTeamAbbreviation(sides.count > 1 ? sides[1] : nil, stored: home, league: league))
        }

        guard let rows = stripBoard?.board else { return nil }
        let key = Self.gameIdentityKey(g.matchup, g.commence)
        let row: TomorrowBoardRow?
        if let gameId = bdlGameId(for: g) {
            row = rows.first {
                $0.bdl_game_id == gameId && ($0.league ?? "").uppercased() == league
            }
        } else {
            // Name/time matching exists only for legacy rows that carry no id.
            row = rows.first {
                $0.bdl_game_id == nil
                    && ($0.league ?? "").uppercased() == league
                    && Self.gameIdentityKey("\($0.away_team ?? "") @ \($0.home_team ?? "")",
                                            $0.commence_time.flatMap(parseISO8601)) == key
            }
        }
        guard let row,
        let away = row.away_abbr?.trimmingCharacters(in: .whitespacesAndNewlines),
        let home = row.home_abbr?.trimmingCharacters(in: .whitespacesAndNewlines),
        !away.isEmpty, !home.isEmpty else { return nil }
        return (scoreboardTeamAbbreviation(row.away_team, stored: away, league: league),
                scoreboardTeamAbbreviation(row.home_team, stored: home, league: league))
    }

    /// LIVE / FINAL second line for a strip block; nil pre-game (the block
    /// shows time + O/U instead). Yesterday's FINAL comes from the graded
    /// result, not the live-score cache (which only reliably has today's
    /// games) — except on doubleheader days, where a matchup-keyed final
    /// can't say WHICH game it belongs to and stays off (never the twin's).
    private func liveFinalLine(for g: (matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])) -> (text: String, color: Color)? {
        if pickDay == .yesterday, !isWeekHistory, !g.dh, let raw = store.finalScore(forMatchup: g.matchup) {
            return ("FINAL · \(raw)", .white.opacity(0.45))
        }
        if let ls = liveScore(for: g) {
            if let interruption = ls.interruptionLabel {
                return (interruption, GaryColors.gold)
            }
            if ls.isLive {
                let score = ls.scoreLine.map { " · \($0)" } ?? ""
                let det = (ls.detail?.isEmpty == false) ? " · \(ls.detail!)" : ""
                return ("▶ LIVE\(score)\(det)", GaryColors.win)
            }
            if ls.isFinal, let away = ls.away_score, let home = ls.home_score {
                let score = finalScoreLine(matchup: g.matchup, awayScore: away, homeScore: home, league: gameLeague(g))
                return ("FINAL · \(score)", .white.opacity(0.45))
            }
        }
        if let score = selectedGrades.score(league: gameLeague(g),
            date: ExactGameIdentity.easternDate(of: g.commence), gameID: bdlGameId(for: g)) {
            return ("FINAL · \(score)", .white.opacity(0.45))
        }
        // The exact slate row closes the brief gap before live_scores picks up
        // an interruption. Provider id + league are mandatory; a matchup-only
        // row can never put one twin game's delay on the other.
        if let interruption = interruptionLabel(for: g) {
            return (interruption, GaryColors.gold)
        }
        return nil
    }

    /// Exact interruption state for one Picks-page game. A live/final snapshot
    /// outranks the daily-slate mirror; otherwise either exact source may carry
    /// the provider's label while the other refreshes.
    private func interruptionLabel(for g: (matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])) -> String? {
        if let live = liveScore(for: g) {
            if live.isLive || live.isFinal { return nil }
            if let label = live.interruptionLabel { return label }
        }
        guard pickDay == .today || isWeekHistory, let gameId = bdlGameId(for: g) else { return nil }
        let league = gameLeague(g).uppercased()
        return selectedSlate.first {
            $0.bdl_game_id == gameId && ($0.league ?? "").uppercased() == league
        }?.interruptionLabel
    }

    /// Shared scoreboard formatter for every league and date.
    private func teamAbbrev(_ name: String, league: String) -> String {
        teamAbbrevFromName(name, league: league)
    }

    /// Pre-pick page with VALUE, not a shrug (founder, Jul 12: the dashed
    /// "check back later" card was "half assed"). Today: the sport's actual
    /// slate with each game's pick ETA. Dark day: the honest line. Yesterday
    /// mode keeps the plain empty note.
    private var emptyState: some View {
        let rows: [(matchup: String, eta: String?)] = store.slate
            .filter { r in
                let lg = (r.league ?? "").uppercased()
                return (lg == sport)
            }
            .sorted { ($0.commence_time ?? "") < ($1.commence_time ?? "") }
            .prefix(10)
            .map { r in
                let a = Formatters.shortTeamName(r.away_team, league: r.league)
                let h = Formatters.shortTeamName(r.home_team, league: r.league)
                var eta: String? = nil
                if let ct = r.commence_time, let d = parseISO8601(ct) {
                    eta = TomorrowView.etTime(ISO8601DateFormatter().string(from: d.addingTimeInterval(-5400)),
                                              withZone: false, meridiem: true).uppercased()
                }
                return (r.collegeRankings.matchup(away: a, home: h), eta)
            }

        return VStack(alignment: .leading, spacing: 0) {
            if isWeekHistory {
                Text(history.failed ? "WEEK UNAVAILABLE" : "NO PICKS THIS WEEK")
                    .font(GaryFonts.mono(11, bold: true)).tracking(1)
                    .foregroundStyle(.white.opacity(0.7))
                    .pageGutter().padding(.top, 20)
            } else if pickDay == .yesterday {
                Text("NO GRADED PICKS THIS DAY")
                    .font(GaryFonts.mono(11, bold: true)).tracking(1)
                    .foregroundStyle(.white.opacity(0.7))
                    .pageGutter().padding(.top, 20)
            } else if scopedBoardSourceFailed {
                sourceFailureBanner
                    .padding(.top, 12)
            } else if store.slateUnavailable {
                HStack(spacing: 8) {
                    BroadcastBar(height: 11)
                    Text("BOARD TEMPORARILY UNAVAILABLE")
                        .font(GaryFonts.accent(13)).tracking(0.6)
                        .foregroundStyle(GaryColors.gold)
                }
                .pageGutter().padding(.top, 20)
                Text("Gary couldn't reach today's slate. Pull down to retry — this is a connection problem, not a dark day.")
                    .font(GaryFonts.text(13))
                    .foregroundStyle(GaryColors.sectionSub)
                    .pageGutter().padding(.top, 8)
            } else if rows.isEmpty {
                if scopedFootballConnectionFailed {
                    HStack(spacing: 8) {
                        BroadcastBar(height: 11)
                        Text("BOARD INTEL UNAVAILABLE · PULL TO RETRY")
                            .font(GaryFonts.accent(13)).tracking(0.6)
                            .foregroundStyle(GaryColors.gold)
                    }
                    .pageGutter().padding(.top, 20)
                } else if let nextSlateSignal {
                    FootballNextSlatePreview(signal: nextSlateSignal, accent: Sport.ncaaf.accentColor)
                        .padding(.top, 20)
                } else {
                    // Honest fallback when the future provider window is also empty.
                    HStack(spacing: 8) {
                        BroadcastBar(height: 11)
                        Text("NO \(sport) TODAY")
                            .font(GaryFonts.accent(13)).tracking(0.6)
                            .foregroundStyle(GaryColors.gold)
                    }
                    .pageGutter().padding(.top, 20)
                }
            } else {
                HStack(spacing: 8) {
                    BroadcastBar(height: 11)
                    Text("THE CARD IS COMING")
                        .font(GaryFonts.accent(13)).tracking(0.6)
                        .foregroundStyle(GaryColors.gold)
                }
                .pageGutter().padding(.top, 20)
                Text("Gary works game by game — every pick lands about 90 minutes before the start.")
                    .font(GaryFonts.text(13))
                    .foregroundStyle(GaryColors.sectionSub)
                    .pageGutter().padding(.top, 8)

                VStack(spacing: 0) {
                    ForEach(Array(rows.enumerated()), id: \.offset) { i, row in
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Text(row.matchup)
                                .font(GaryFonts.display(19))
                                .foregroundStyle(GaryColors.warmWhite.opacity(0.94))
                                .lineLimit(1).minimumScaleFactor(0.7)
                            Spacer(minLength: 8)
                            if let eta = row.eta {
                                Text("PICK ~\(eta)")
                                    .font(GaryFonts.mono(11.5, bold: true))
                                    .foregroundStyle(GaryColors.meta)
                            }
                        }
                        .padding(.vertical, 11)
                        if i < rows.count - 1 {
                            Rectangle().fill(Color.white.opacity(0.07)).frame(height: 1)
                        }
                    }
                }
                .pageGutter().padding(.top, 14)
            }
            Spacer(minLength: 0)
        }
    }

    /// The game set's league, shared by strip labels and exact score lookups.
    private func gameLeague(_ g: (matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])) -> String {
        league(for: g) ?? ""
    }

    /// Best-effort: surface edges whose "ABBR @ ABBR" shares a team token with
    /// this game's matchup or its prop teams. abbrGameMatches resolves both MLB
    /// and NBA abbreviations, so either league's edges attach to their game.
    /// PERF#1(c): now an O(1) read of the precomputed edgeIndex (built in
    /// rebuildMemo when connections/games change), not a per-render N×M scan.
    /// Falls back to the live scan for any game key not yet indexed (e.g. a
    /// deep-link race before the first rebuild) so reach is never lost — the
    /// fallback applies the same per-GAME id scoping as the index build.
    private func edges(for g: (matchup: String, time: String, commence: Date?, dh: Bool, props: [PropPick])) -> [Signal] {
        guard connectionDate == researchRequestKey else { return [] }
        if let hit = edgeIndex[Self.gameIdentityKey(g.matchup, g.commence)] {
            return hit.filter { $0.league.label == gameLeague(g) }
        }
        let hay = g.matchup + " " + g.props.compactMap { $0.team }.joined(separator: " ")
        let gKey = Self.matchupKey(g.matchup)
        let gid = bdlGameId(for: g)
        let scopedLeague = gameLeague(g)
        return currentConnections.filter { s in
            guard s.league.label == scopedLeague else { return false }
            if let gid, let sid = s.gameId.flatMap({ Int($0) }) { return sid == gid }
            guard abbrGameMatches(s.game, matchup: hay) || Self.matchupKey(s.game) == gKey else { return false }
            if g.dh, s.gameId != nil { return false }
            return true
        }
    }

    private var effectiveScope: String { sport }

    private var currentConnections: [Signal] {
        guard connectionDate == researchRequestKey else { return [] }
        return connections
    }

    /// Edges always belong to the selected sport.
    private var sportConnections: [Signal] {
        guard let lg = HubLeagueSel.from(sport) else { return [] }
        return currentConnections.filter { $0.league == lg }
    }

    private var nextSlateSignal: Signal? {
        guard sport == "NCAAF" else { return nil }
        return currentConnections.first { $0.league == .ncaaf && $0.kind == .nextSlate }
    }

    private var scopedFootballConnectionFailed: Bool {
        guard sport == "NFL" || sport == "NCAAF",
              let league = HubLeagueSel.from(sport) else { return false }
        return connectionErrorLeagues.contains(league)
    }

    /// Fantasy-corner lanes never ride the Picks page (founder, Aug 6: "remove
    /// the Cut List from the Picks page just keep it in the fantasy part").
    /// These rows are roster advice, not a read on tonight's bet, and their
    /// cards carry a tier word + stat strip the edge rows can't render — a
    /// leaked one printed a wall of cut-or-keep prose under a game. Same set
    /// the Hub's front page excludes; Fantasy remains their one home.
    static let fantasyOnlyKinds: Set<SignalKind> = [
        .fantasyPickups, .twoStart, .closerWatch, .returnWatch, .cutList,
        .fantasyUsage, .fantasyRedZone, .fantasyMatchup, .fantasyTrend,
    ]

    /// A prior game's research comes from its own day, even on This Week.
    /// Query only these date/game pairs, not all daily copies of a weekly slate.
    private var researchGameDates: [String: String] {
        var dates: [String: String] = [:]
        let today = SupabaseAPI.todayEST()
        for game in gamesMemo {
            guard let id = bdlGameId(for: game), let day = ExactGameIdentity.easternDate(of: game.commence) else { continue }
            dates[String(id)] = min(day, today)
        }
        return dates
    }
    private var researchRequestKey: String {
        "\(sport)|\(selectedDate ?? "")|" + researchGameDates.keys.sorted().map { "\($0):\(researchGameDates[$0]!)" }.joined(separator: ",")
    }

    @MainActor
    private func loadConnections(force: Bool = false) async {
        guard let date = selectedDate, let league = HubLeagueSel.from(sport),
              !isWeekHistory || selectedHistory != nil else { return }
        let key = researchRequestKey
        let gameDates = researchGameDates
        if !force, connectionDate == key, connLoaded { return }
        if connectionDate == key && connectionLoadInFlight { return }
        if connectionDate != key {
            connectionDate = key
            connections = researchCache[key]?.rows ?? []
            connectionErrorLeagues = []
            connLoaded = false
            connectionRevision &+= 1
        }
        if !force, let cached = researchCache[key], Date().timeIntervalSince(cached.fetched) < 900 {
            connLoaded = true; connectionLoadInFlight = false; return
        }
        connectionLoadInFlight = true
        let owner = UUID()
        connectionOwner = owner
        do {
            let rows = try await SupabaseAPI.fetchInsightConnections(date: date, league: sport, gameDates: gameDates)
            guard connectionDate == key, connectionOwner == owner, !Task.isCancelled else {
                if connectionDate == key, connectionOwner == owner { connectionLoadInFlight = false }
                return
            }
            let snapshot = PicksContentEquality.encoded(rows)
            if snapshot == nil || connectionSnapshots[key] != snapshot {
                connections = rows.compactMap { $0.toSignal() }.filter { !Self.fantasyOnlyKinds.contains($0.kind) }
                connectionSnapshots[key] = snapshot
                connectionRevision &+= 1
            }
            researchCache[key] = (connections, Date())
            for old in researchCache.keys.sorted(by: { researchCache[$0]!.fetched > researchCache[$1]!.fetched }).dropFirst(3) {
                researchCache[old] = nil; connectionSnapshots[old] = nil
            }
            connectionErrorLeagues = []; connLoaded = true
        } catch {
            guard connectionDate == key, connectionOwner == owner else { return }
            if !SupabaseAPI.isCancellation(error) { connectionErrorLeagues = [league] }
        }
        guard connectionDate == key, connectionOwner == owner else { return }
        connectionLoadInFlight = false
    }

}
