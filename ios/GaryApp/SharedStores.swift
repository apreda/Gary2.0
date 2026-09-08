// SharedStores.swift — Shared Live Score Cache + Shared Props Slate Store.
// Split out of Views.swift on Sep 1 2026 (the 28K-line monolith); pure move,
// no behavior change. Section boundaries follow the original MARK headers.

import SwiftUI
import Combine
import Charts
import WebKit
import SafariServices
import StoreKit

// MARK: - Shared Live Score Cache
//
// One app-wide fetch loop for live_scores so the pick/prop cards can show
// LIVE / FINAL in their time slot wherever they appear (Home, Picks, Winners).
// Consumers call startIfNeeded() (idempotent) and look up by matchup.
/// Stable key for a matchup ("Away @ Home" / "Away vs Home"), strip-to-alphanumerics
/// per side — identical logic to PropsSlateStore.gpKey, hoisted to top level so the
/// SINGLETON LiveScoreCache (and every card that reads it) can resolve the graded
/// final scores the store pushes in. Keep in sync with gpKey/gpTeamKey.
func gradedMatchupKey(_ matchup: String?) -> String? {
    guard let matchup else { return nil }
    func teamKey(_ v: String) -> String { v.lowercased().components(separatedBy: CharacterSet.alphanumerics.inverted).joined() }
    for sep in [" @ ", " vs ", " v "] {
        let p = matchup.components(separatedBy: sep)
        if p.count == 2 { let a = teamKey(p[0]), h = teamKey(p[1]); if !a.isEmpty && !h.isEmpty { return "\(a)@\(h)" } }
    }
    return nil
}

/// Live batting lines for prop players — the prop card's analog of the game
/// card's live self-grading (founder, Jul 23 2026: props must live-grade the
/// same way game picks do). Tracks today's prop players, polls the public MLB
/// Stats API box score for their games while LIVE (a handful of games, 60s
/// cadence, hard back-off when idle), and publishes each player's running
/// line. The card self-grades after a confirmed final box score is fetched;
/// the cron-written prop_results row stays the authoritative
/// graded record, exactly like the game card's stored grade.
@MainActor
final class LivePropStatsCache: ObservableObject {
    static let shared = LivePropStatsCache()

    struct BattingLine {
        var hits: Int?, runs: Int?, rbi: Int?, walks: Int?, homeRuns: Int?, totalBases: Int?
        static func marketKey(_ market: String) -> String {
            market.lowercased().replacingOccurrences(of: #"\s+\d+(?:\.\d+)?$"#, with: "", options: .regularExpression)
        }
        static func supports(_ market: String) -> Bool {
            ["hits", "runs_scored", "runs", "rbis", "rbi", "walks", "home_run", "home_runs", "total_bases", "hits_runs_rbis"].contains(marketKey(market))
        }
        func value(forMarket market: String) -> Int? {
            switch Self.marketKey(market) {
            case "hits": return hits
            case "runs_scored", "runs": return runs
            case "rbi", "rbis": return rbi
            case "walks": return walks
            case "home_run", "home_runs": return homeRuns
            case "total_bases": return totalBases
            case "hits_runs_rbis":
                guard let hits, let runs, let rbi else { return nil }
                return hits + runs + rbi
            default: return nil
            }
        }
    }
    struct Observation { let line: BattingLine; let isFinal: Bool }
    /// Slate date + exact provider game ID + player; never a name-only total.
    @Published private(set) var lines: [String: Observation] = [:]
    private struct Tracked {
        let player: String, matchup: String, day: String, start: Date
        let gameId: Int
        var gameKey: String { "\(day)|\(gameId)" }
        var playerKey: String { "\(gameKey)|\(LivePropStatsCache.nameKey(player))" }
    }
    private struct ScheduleGame {
        let gamePk: Int, away: String, home: String
        let start: Date?
        let isFinal: Bool
    }
    private var tracked: [String: Tracked] = [:]
    private var schedule: [ScheduleGame] = []
    private var scheduleCheckedAt: Date?
    private var finalRead: Set<String> = []
    private var activeDay = ""
    private var started = false
    private let session: URLSession
    private let slateDay: () -> String
    private let automaticallyPoll: Bool
    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "America/New_York"); f.dateFormat = "yyyy-MM-dd"
        return f
    }()
    init(session: URLSession = .shared, slateDay: @escaping () -> String = { SupabaseAPI.todayEST() }, automaticallyPoll: Bool = true) {
        self.session = session; self.slateDay = slateDay; self.automaticallyPoll = automaticallyPoll
    }
    nonisolated static func nameKey(_ raw: String?) -> String {
        (raw ?? "").folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "en_US_POSIX"))
            .components(separatedBy: CharacterSet.alphanumerics.inverted).joined()
    }
    private static func identity(_ prop: PropPick) -> Tracked? {
        guard ["MLB", "MLB HR"].contains((prop.effectiveLeague ?? "").uppercased()),
              let id = prop.game_id, let player = prop.player, !nameKey(player).isEmpty,
              let matchup = prop.matchup, !matchup.isEmpty,
              let iso = prop.commence_time, let start = parseISO8601(iso),
              let market = prop.prop, BattingLine.supports(market) else { return nil }
        return Tracked(player: player, matchup: matchup, day: dayFormatter.string(from: start), start: start, gameId: id)
    }
    func observation(for prop: PropPick) -> Observation? {
        guard let identity = Self.identity(prop), identity.day == slateDay() else { return nil }
        return lines[identity.playerKey]
    }
    private func resetIfDayRolled() {
        let day = slateDay()
        guard activeDay != day else { return }
        activeDay = day; tracked = [:]; lines = [:]; schedule = []; scheduleCheckedAt = nil; finalRead = []
    }
    func track(_ prop: PropPick) {
        resetIfDayRolled()
        guard let identity = Self.identity(prop), identity.day == activeDay else { return }
        if tracked[identity.playerKey] == nil { finalRead.remove(identity.gameKey) }
        tracked[identity.playerKey] = identity
        if automaticallyPoll { startIfNeeded() }
    }
    private func startIfNeeded() {
        guard !started else { return }; started = true
        Task { @MainActor [weak self] in
            defer { self?.started = false }
            while !Task.isCancelled {
                guard let self else { return }
                let anyLive = await self.pollOnce()
                try? await Task.sleep(nanoseconds: anyLive ? 60_000_000_000 : 300_000_000_000)
            }
        }
    }
    /// Exact BDL identity establishes status. MLB's separate gamePk is joined
    /// by day/teams and, for doubleheaders, the unique original start instant.
    @discardableResult
    func pollOnce() async -> Bool {
        resetIfDayRolled()
        let day = activeDay
        let live = LiveScoreCache.shared
        var anyLive = false
        var wanted: [String: Tracked] = [:]
        var needsFinalSchedule = false
        for t in tracked.values {
            guard let status = live.status(forGameId: t.gameId, league: "MLB") else { continue }
            if status.isLive { anyLive = true }
            if (status.isLive || status.isFinal) && !finalRead.contains(t.gameKey) {
                wanted[t.gameKey] = t
                if status.isFinal, scheduleGame(for: t)?.isFinal != true { needsFinalSchedule = true }
            }
        }
        guard !wanted.isEmpty else { return anyLive }
        await loadSchedule(day: day, force: needsFinalSchedule)
        guard activeDay == day, slateDay() == day else { return anyLive }
        for t in wanted.values {
            guard let game = scheduleGame(for: t),
                  let parsed = await fetchBoxLines(gamePk: game.gamePk) else { continue }
            guard activeDay == day, slateDay() == day else { return anyLive }
            var allPlayersPresent = true
            for player in tracked.values where player.gameKey == t.gameKey {
                if let line = parsed[Self.nameKey(player.player)] {
                    lines[player.playerKey] = Observation(line: line, isFinal: game.isFinal)
                } else { allPlayersPresent = false }
            }
            // A previously polled live line can never become a final grade
            // merely because the separate scoreboard advanced to FINAL.
            if game.isFinal && allPlayersPresent { finalRead.insert(t.gameKey) }
        }
        return anyLive
    }
    private func loadSchedule(day: String, force: Bool) async {
        if !force, let at = scheduleCheckedAt, Date().timeIntervalSince(at) < 300 { return }
        guard let url = URL(string: "https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=\(day)"),
              let root = await json(at: url), let dates = root["dates"] as? [[String: Any]] else { return }
        let games = dates.flatMap { $0["games"] as? [[String: Any]] ?? [] }
        let parsed: [ScheduleGame] = games.compactMap { g in
            guard let pk = g["gamePk"] as? Int, let teams = g["teams"] as? [String: Any],
                  let away = ((teams["away"] as? [String: Any])?["team"] as? [String: Any])?["name"] as? String,
                  let home = ((teams["home"] as? [String: Any])?["team"] as? [String: Any])?["name"] as? String else { return nil }
            return ScheduleGame(gamePk: pk, away: away, home: home,
                start: (g["gameDate"] as? String).flatMap(parseISO8601),
                isFinal: (g["status"] as? [String: Any])?["abstractGameState"] as? String == "Final")
        }
        guard activeDay == day, slateDay() == day, parsed.count == games.count else { return }
        schedule = parsed; scheduleCheckedAt = Date()
    }
    private func scheduleGame(for tracked: Tracked) -> ScheduleGame? {
        let parts = tracked.matchup.components(separatedBy: " @ ")
        guard parts.count == 2 else { return nil }
        let away = teamAbbrevFromName(parts[0], league: "MLB"), home = teamAbbrevFromName(parts[1], league: "MLB")
        let matches = schedule.filter {
            teamAbbrevFromName($0.away, league: "MLB") == away && teamAbbrevFromName($0.home, league: "MLB") == home
        }
        if matches.count == 1 { return matches[0] }
        let timed = matches.filter { game in
            guard let start = game.start else { return false }
            return abs(start.timeIntervalSince(tracked.start)) <= 60
        }
        return timed.count == 1 ? timed[0] : nil
    }
    private func json(at url: URL) async -> [String: Any]? {
        var request = URLRequest(url: url); request.timeoutInterval = 12
        request.cachePolicy = .reloadIgnoringLocalCacheData
        guard let (data, response) = try? await session.data(for: request),
              let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }
    private func fetchBoxLines(gamePk: Int) async -> [String: BattingLine]? {
        guard let url = URL(string: "https://statsapi.mlb.com/api/v1/game/\(gamePk)/boxscore"),
              let root = await json(at: url), let teams = root["teams"] as? [String: Any] else { return nil }
        func count(_ value: Any?) -> Int? {
            guard let n = value as? NSNumber, String(cString: n.objCType) != "c",
                  n.doubleValue >= 0, n.doubleValue.rounded() == n.doubleValue else { return nil }
            return n.intValue
        }
        var out: [String: BattingLine] = [:]
        for side in ["away", "home"] {
            guard let players = (teams[side] as? [String: Any])?["players"] as? [String: Any] else { return nil }
            for raw in players.values {
                guard let p = raw as? [String: Any], let person = p["person"] as? [String: Any],
                      let name = person["fullName"] as? String,
                      let b = (p["stats"] as? [String: Any])?["batting"] as? [String: Any] else { continue }
                // A roster/DNP zero line is not an observed batting appearance.
                let appearances = ["plateAppearances", "atBats", "baseOnBalls", "hitByPitch", "sacFlies", "sacBunts"]
                guard appearances.contains(where: { (count(b[$0]) ?? 0) > 0 }) else { continue }
                let hits = count(b["hits"]), doubles = count(b["doubles"]), triples = count(b["triples"]), hr = count(b["homeRuns"])
                var bases: Int?
                if let hits, let doubles, let triples, let hr { bases = hits + doubles + 2 * triples + 3 * hr }
                out[Self.nameKey(name)] = BattingLine(hits: hits, runs: count(b["runs"]), rbi: count(b["rbi"]),
                    walks: count(b["baseOnBalls"]), homeRuns: hr, totalBases: bases)
            }
        }
        return out
    }
}

final class LiveScoreCache: ObservableObject {
    static let shared = LiveScoreCache()
    @Published private(set) var scores: [LiveScore] = []
    /// Settled final scores ("3-1") keyed by gradedMatchupKey, pushed by
    /// PropsSlateStore from game_results (today + yesterday). Cards fall back to
    /// this when the live board has no score for a graded matchup — e.g. a WC
    /// final the poller never carried, or any Yesterday-tab card.
    @Published var gradedFinals: [String: String] = [:]

    /// The single running poll loop. `started` is the idempotency guard;
    /// `pollTask` is held so the loop's lifetime is observable (and so a future
    /// teardown could cancel it). One loop, ever — never two concurrent.
    private var started = false
    private var pollTask: Task<Void, Never>?
    /// Wakes the poll loop out of its adaptive sleep the instant the app returns
    /// to the foreground (refreshNow). The loop awaits a sleep that RACES this
    /// signal; firing it short-circuits the wait so the next fetch runs now.
    /// `wakeGen` tags the parked continuation so the timer bridge of one sleep
    /// cycle can never resume the continuation of a later cycle — whoever wins
    /// (wake or timer) clears the handle, the loser sees `wakeContinuation == nil`
    /// (or a bumped gen) and no-ops. All access is @MainActor-serialized, so this
    /// is plain ordering, not a lock.
    private var wakeContinuation: CheckedContinuation<Void, Never>?
    private var wakeGen = 0

    /// PERF#1(d): O(1) lookups. Rebuilt only when `scores` actually changes.
    /// game_id → row (doubleheader-exact), and normalized abbr matchup key
    /// ("sd|phi") → rows (the same fuzzy resolution as abbrGameMatches, but the
    /// keyword scan happens once per refresh, not once per card per tick).
    private var byGameId: [String: LiveScore] = [:]
    /// league + provider id → row. Provider ids are only authoritative inside
    /// their league; interruption UI never adopts a same-numbered game from a
    /// different feed.
    private var byLeagueGameId: [String: LiveScore] = [:]
    private var byMatchupKey: [String: [LiveScore]] = [:]
    /// Finals are part of the active slate until the 6 a.m. ET roll. The live
    /// poller may prune a completed row around wall-clock midnight, before the
    /// permanent grading table is available; remembering finals by slate day
    /// prevents a card that already said CASHED/LOST from reverting to pregame.
    private var loadedSlateDate = ""
    private static let persistedFinalsPrefix = "gary.liveScoreFinals."
    /// Mirrors the bytes already stored for this slate. Without this guard the
    /// 22-second live poll encoded and rewrote identical finals on the main actor.
    private var persistedFinalsSnapshot: [LiveScore] = []

    /// Adaptive poll cadence. While any game is live the board must feel live, so
    /// poll fast; with nothing live (all scheduled/final) back off hard — the
    /// backend only writes every 1-2 min and an idle board doesn't change.
    private let liveInterval: UInt64 = 22_000_000_000   // ~22s while a game is live
    private let interruptionInterval: UInt64 = 60_000_000_000 // catch resume/new-time updates promptly
    private let idleInterval: UInt64 = 180_000_000_000  // 3 min when nothing is live
    private let retryInterval: UInt64 = 30_000_000_000  // recover quickly from transport failure

    @MainActor
    func startIfNeeded() {
        guard !started else { return }
        started = true
        pollTask = Task { @MainActor [weak self] in
            // SELF-HEALING: the loop should never end on its own (the only awaits
            // are a non-throwing fetch and a sleep we treat as best-effort). If it
            // somehow does — cancellation, an unforeseen throw — clear `started`
            // so startIfNeeded()/refreshNow() can revive it with a fresh loop.
            defer {
                self?.started = false
                self?.pollTask = nil
                self?.wakeContinuation = nil
            }
            while !Task.isCancelled {
                guard let self else { return }
                // @MainActor: fetch suspends off-main; only the assignment (gated to
                // real changes) resumes on main. (Fixes "Publishing from background
                // threads" and the per-tick whole-carousel rerender — PERF#1a.)
                let slateDate = SupabaseAPI.todayEST()
                let fresh = await SupabaseAPI.fetchLiveScores(date: slateDate)
                if let fresh {
                    self.apply(fresh, slateDate: slateDate)
                } else if self.loadedSlateDate != slateDate {
                    // Even with a failed first request after 6 a.m., retire the
                    // prior slate immediately instead of showing it under Today.
                    self.apply([], slateDate: slateDate)
                }
                if Task.isCancelled { return }
                // Failed requests retry promptly. Successful requests derive the
                // cadence from the merged cache, not raw response ordering.
                let interval = fresh == nil ? self.retryInterval
                    : self.scores.contains(where: { $0.isLive }) ? self.liveInterval
                    : self.scores.contains(where: { $0.isInterrupted }) ? self.interruptionInterval
                    : self.idleInterval
                await self.sleepOrWake(interval)
            }
        }
    }

    /// Force an immediate refresh — revives a dead loop, then wakes a sleeping one
    /// so the next fetch runs NOW (no waiting out the adaptive interval). Called on
    /// foreground so returning to the app shows current scores instantly.
    @MainActor
    func refreshNow() {
        // Revive first: if the loop died (or never started), startIfNeeded spins up
        // a fresh one that fetches immediately on entry — nothing more to do.
        let wasRunning = started
        startIfNeeded()
        guard wasRunning else { return }
        // Already running and parked in its sleep — wake it. Bumping the gen + niling
        // the handle BEFORE resuming means the racing timer bridge for this cycle
        // will see the change and skip its own resume (single resume guaranteed).
        if let c = wakeContinuation {
            wakeContinuation = nil
            wakeGen &+= 1
            c.resume()
        }
    }

    /// Sleep up to `interval`, but return early if refreshNow() fires the wake
    /// signal. Exactly one of the two paths (timer end or external wake) resumes
    /// the continuation; the other no-ops via the gen tag — no double-resume, no
    /// leaked continuation across cycles.
    @MainActor
    private func sleepOrWake(_ interval: UInt64) async {
        let timer = Task { try? await Task.sleep(nanoseconds: interval) }
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            wakeGen &+= 1
            let myGen = wakeGen
            wakeContinuation = cont
            // Bridge the timer's completion back to THIS cycle's continuation.
            Task { @MainActor in
                await timer.value
                // Only resume if our cycle's continuation is still parked (a wake
                // didn't already fire it and move on to a newer cycle).
                guard self.wakeGen == myGen, self.wakeContinuation != nil else { return }
                self.wakeContinuation = nil
                self.wakeGen &+= 1
                cont.resume()
            }
        }
        timer.cancel()
    }

    /// Commit a fresh fetch only when it actually differs (PERF#1a dedupe) and
    /// rebuild the O(1) indexes alongside it. Publishing an identical array would
    /// spuriously rerender every observer (the whole PicksCarousel) on every tick.
    @MainActor
    private func apply(_ fresh: [LiveScore], slateDate: String) {
        if loadedSlateDate != slateDate {
            loadedSlateDate = slateDate
            let persisted = persistedFinals(for: slateDate)
            scores = persisted
            persistedFinalsSnapshot = persisted
            if !gradedFinals.isEmpty { gradedFinals = [:] }
            rebuildIndexes()
            prunePersistedFinals(keeping: slateDate)
        }

        // A final is monotonic within one slate: once observed, a later empty
        // response or bogus scheduled duplicate cannot make that game un-final.
        // A genuinely live/final replacement is still allowed to update it.
        var stable = fresh
        for old in scores where old.isFinal {
            let identity = scoreIdentity(old)
            if let i = stable.firstIndex(where: { scoreIdentity($0) == identity }) {
                if !stable[i].isLive && !stable[i].isFinal { stable[i] = old }
            } else {
                stable.append(old)
            }
        }

        // Feed order has no meaning to consumers. Canonical order avoids a full
        // app-wide score publish if the API returns identical rows shuffled.
        stable.sort { scoreSortKey($0) < scoreSortKey($1) }
        let finals = stable.filter(\.isFinal)
        if finals != persistedFinalsSnapshot, persistFinals(finals, for: slateDate) {
            persistedFinalsSnapshot = finals
        }
        guard stable != scores else { return }
        scores = stable
        rebuildIndexes()
    }

    private func scoreIdentity(_ score: LiveScore) -> String {
        if let id = score.game_id, !id.isEmpty {
            return "id:\((score.league ?? "").uppercased()):\(id)"
        }
        return [score.league, score.away_abbr, score.home_abbr]
            .map { ($0 ?? "").uppercased() }
            .joined(separator: "|")
    }

    private func scoreSortKey(_ score: LiveScore) -> String {
        [scoreIdentity(score), score.status ?? "", score.detail ?? "",
         score.away_score.map { String($0) } ?? "", score.home_score.map { String($0) } ?? ""]
            .joined(separator: "|")
    }

    private func persistedFinals(for slateDate: String) -> [LiveScore] {
        let key = Self.persistedFinalsPrefix + slateDate
        guard let data = UserDefaults.standard.data(forKey: key),
              let rows = try? JSONDecoder().decode([LiveScore].self, from: data) else { return [] }
        return rows.filter(\.isFinal)
    }

    @discardableResult
    private func persistFinals(_ finals: [LiveScore], for slateDate: String) -> Bool {
        let defaults = UserDefaults.standard
        let key = Self.persistedFinalsPrefix + slateDate
        guard let data = try? JSONEncoder().encode(finals) else { return false }
        defaults.set(data, forKey: key)
        return true
    }

    private func prunePersistedFinals(keeping slateDate: String) {
        let defaults = UserDefaults.standard
        let key = Self.persistedFinalsPrefix + slateDate
        // One slate is sufficient. At 6 a.m. the date changes and the previous
        // day's persisted finals are retired with every other board surface.
        for oldKey in defaults.dictionaryRepresentation().keys
            where oldKey.hasPrefix(Self.persistedFinalsPrefix) && oldKey != key {
            defaults.removeObject(forKey: oldKey)
        }
    }

    @MainActor
    private func rebuildIndexes() {
        var gid: [String: LiveScore] = [:]
        var leagueGid: [String: LiveScore] = [:]
        var mk: [String: [LiveScore]] = [:]
        for s in scores {
            if let id = s.game_id {
                gid[id] = s
                leagueGid[Self.leagueGameKey(gameId: id, league: s.league)] = s
            }
            if let key = liveScoreMatchupKey(awayAbbr: s.away_abbr, homeAbbr: s.home_abbr) {
                mk[key, default: []].append(s)
            }
        }
        byGameId = gid
        byLeagueGameId = leagueGid
        byMatchupKey = mk
    }

    private static func leagueGameKey(gameId: String, league: String?) -> String {
        let raw = (league ?? "").uppercased()
        let canonical = raw == "MLB HR" ? "MLB" : raw == "NFL TDS" ? "NFL" : raw
        return "\(canonical)|\(gameId)"
    }

    func status(forMatchup matchup: String) -> LiveScore? {
        guard !matchup.isEmpty else { return nil }
        // O(1): resolve the query matchup to the same normalized abbr keys the
        // index is built on, instead of scanning + fuzzy-matching every row per
        // card per tick (PERF#1d). Each candidate hit is re-verified with the
        // canonical abbrGameMatches so a cross-league abbr collision can never
        // return the wrong game — the result is byte-identical to the old scan,
        // we just stop touching every row. Falls back to the linear scan only
        // when the query resolves to no key (preserves the old reach).
        var matches: [LiveScore] = []
        let keys = matchupAbbrKeys(matchup)
        if !keys.isEmpty {
            var seenTags = Set<String>()
            for key in keys {
                guard let hit = byMatchupKey[key] else { continue }
                for row in hit where abbrGameMatches(row.abbrGame, matchup: matchup) {
                    // Dedup identical rows that resolved under multiple alias keys.
                    let tag = row.game_id ?? row.abbrGame
                    if seenTags.insert(tag).inserted { matches.append(row) }
                }
            }
        } else {
            matches = scores.filter { abbrGameMatches($0.abbrGame, matchup: matchup) }
        }
        guard matches.count > 1 else { return matches.first }
        // Poller artifact: duplicate rows for one matchup. LIVE is always the
        // active game. Afterward, a FINAL carrying an actual score beats a stale
        // scheduled twin — otherwise a Picks-page win can regress from its green
        // check to the start time overnight. A scoreless bogus pre-game final
        // still loses to scheduled, preserving the original safety guard.
        if let live = matches.first(where: { $0.isLive }) { return live }
        if let scoredFinal = matches.first(where: {
            $0.isFinal && (($0.away_score ?? 0) != 0 || ($0.home_score ?? 0) != 0)
        }) { return scoredFinal }
        return matches.first { !$0.isFinal } ?? matches.first
    }

    /// Live score for an EXACT game by its game_id — disambiguates doubleheaders (two games
    /// share one matchup string), where status(forMatchup:) is ambiguous. nil if not found.
    func status(forGameId gameId: Int?) -> LiveScore? {
        guard let gid = gameId else { return nil }
        return byGameId[String(gid)]
    }

    /// Exact provider identity for status-sensitive UI. Interruption states
    /// must use this league-scoped path and never infer identity from teams.
    func status(forGameId gameId: Int?, league: String?) -> LiveScore? {
        guard let gid = gameId,
              let league = league?.trimmingCharacters(in: .whitespacesAndNewlines),
              !league.isEmpty else { return nil }
        return byLeagueGameId[Self.leagueGameKey(gameId: String(gid), league: league)]
    }

    /// Settled final score string ("3-1") for a matchup, from game_results (today
    /// + yesterday). The card uses this only after the live board comes up empty.
    func gradedScore(forMatchup matchup: String) -> String? {
        guard let k = gradedMatchupKey(matchup), let s = gradedFinals[k], !s.isEmpty else { return nil }
        return s
    }
}

// MARK: - Shared Props Slate Store
//
// One @MainActor ObservableObject that owns the props + game-picks network
// fetch AND all the matchup/result matching helpers that used to live as
// `private` methods on `GaryPropsView`. Every consumer (GaryPropsView,
// PicksCarouselView) reads from the SAME store instance, so there is exactly
// ONE network fetch — no duplication. The helpers (groupByMatchup,
// gamePickEntry, resultForProp, isYesterdayProp, gamePickResult, …) are the
// canonical copies, kept logic-identical to the originals so behavior is byte-
// for-byte the same (per-sport yesterday-recap gate, W/L only on yesterday's
// fallback, precise line+matchup result keys).
/// Compare complete model content once a source response is accepted. Encoding
/// failure is never evidence of equality; callers must publish that response.
enum PicksContentEquality {
    static func encoded<Value: Encodable>(_ value: Value) -> Data? {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return try? encoder.encode(value)
    }

    static func equal<Value: Encodable>(_ lhs: Value, _ rhs: Value) -> Bool {
        guard let left = encoded(lhs), let right = encoded(rhs) else { return false }
        return left == right
    }
}

@MainActor
final class PropsSlateStore: ObservableObject {
    @Published var allProps: [PropPick] = []
    @Published var yesterdayProps: [PropPick] = []
    @Published var yesterdayResultsMap: [String: String] = [:]
    @Published var sportsWithFreshProps: Set<String> = []
    /// The latest prop-picks transport failed. This is distinct from a
    /// successful empty response, so an outage is never presented as "no props."
    @Published var propPickSourceFailed = false
    @Published var showingYesterdayResults = false
    /// EVERY yesterday prop, UNGATED. yesterdayProps is gated to sports with
    /// nothing today (the Today auto-fallback); the explicit Yesterday dropdown
    /// must show all of yesterday — e.g. MLB, which also plays today.
    @Published var yesterdayPropsAll: [PropPick] = []

    @Published var gamePicks: [GaryPick] = []
    @Published var yesterdayGamePicks: [GaryPick] = []
    /// EVERY yesterday game pick, UNGATED (see yesterdayPropsAll).
    @Published var yesterdayGamePicksAll: [GaryPick] = []
    @Published var gameResultsMap: [String: String] = [:]
    /// Yesterday's settled final scores, keyed like gameResultsMap ("away@home").
    /// The Yesterday tab reads these — the live-score cache only reliably has
    /// today's games, so half of yesterday's tabs were falling back to the start
    /// time instead of showing FINAL.
    @Published var gameScoreMap: [String: String] = [:]
    /// TODAY's graded results — game picks ("away@home" -> won/lost) and props
    /// (player+type+line+matchup -> won/lost). Live grading writes these the moment
    /// a game finishes, so the TODAY board stamps finished picks immediately instead
    /// of waiting for the 6:45am batch (which only fed the Yesterday tab).
    @Published var todayGameResults: [String: String] = [:]
    @Published var todayPropResults: [String: String] = [:]
    /// Today's FULL slate (daily_slate) — every game scheduled today, so the
    /// Picks page can surface today's matchups with a "pick drops near game
    /// time" placeholder + intel before Gary's picks actually post.
    @Published var slate: [DailySlateRow] = []
    /// True only when today's slate request failed and no same-day last-good
    /// snapshot exists. Distinguishes an outage from a genuine dark league day.
    @Published var slateUnavailable = false
    /// Failed pick sources from the latest attempt. Daily and NFL are separate
    /// so an NFL table problem can never blank or relabel the working MLB board.
    @Published var gamePickSourceFailures: Set<String> = []
    @Published var slateSourceFailed = false

    /// The EST slate day the TODAY-state (allProps/gamePicks/slate) was loaded for.
    /// If the app sits open past the 6am ET rollover, keep-last-good would otherwise
    /// pin the board to yesterday — a mismatch here forces a reset + refetch.
    @Published var loadedDate: String = ""

    @Published var loading = true
    @Published var fetchFailed = false
    @Published var loaded = false   // first successful (or attempted) load completed
    /// The grouping memo follows accepted content, including same-count edits.
    /// Starting a request or receiving unchanged content does not invalidate it.
    @Published private(set) var contentRevision: UInt64 = 0
    private var loadGeneration: UInt64 = 0

    // MARK: Loading (single source of truth — never fetched twice for one store)

    private var loadTask: Task<Void, Never>?
    private var requestDate = ""

    private func accepts(date: String, generation: UInt64) -> Bool {
        !Task.isCancelled && loadGeneration == generation
            && loadedDate == date && SupabaseAPI.todayEST() == date
    }

    /// Compare accepted content, including edits that leave the count unchanged.
    /// No serialization runs from a SwiftUI body or memo-signature getter.
    @discardableResult
    private func accept<Value: Encodable>(_ value: Value, at path: ReferenceWritableKeyPath<PropsSlateStore, Value>) -> Bool {
        guard !PicksContentEquality.equal(self[keyPath: path], value) else { return false }
        self[keyPath: path] = value
        contentRevision &+= 1
        return true
    }

    private func resetIfDayRolled(to date: String) {
        guard loadedDate != date else { return }
        allProps = []; gamePicks = []; slate = []; slateUnavailable = false
        propPickSourceFailed = false; gamePickSourceFailures = []; slateSourceFailed = false
        todayGameResults = [:]; todayPropResults = [:]
        yesterdayProps = []; yesterdayPropsAll = []; yesterdayResultsMap = [:]
        yesterdayGamePicks = []; yesterdayGamePicksAll = []; gameResultsMap = [:]; gameScoreMap = [:]
        showingYesterdayResults = false; sportsWithFreshProps = []
        loadedDate = date
        loaded = false
        contentRevision &+= 1
    }

    func loadIfNeeded(forceRefresh: Bool = false) async {
        if loaded && !forceRefresh && loadedDate == SupabaseAPI.todayEST() { return }
        await load(forceRefresh: forceRefresh)
    }

    func refresh() async { await load(forceRefresh: true) }

    private func load(forceRefresh: Bool) async {
        let date = SupabaseAPI.todayEST()
        if let task = loadTask, requestDate == date { await task.value; return }
        loadTask?.cancel()
        loadGeneration &+= 1
        let generation = loadGeneration
        requestDate = date
        resetIfDayRolled(to: date)
        if !loading { loading = true }
        // The owner survives a cancelled gesture; same-day readers share it.
        // A new slate starts a new owner without waiting on old history.
        let task = Task { @MainActor in
            async let props: Void = loadProps(date: date, generation: generation, forceRefresh: forceRefresh)
            async let games: Void = loadGamePicks(date: date, generation: generation, forceRefresh: forceRefresh)
            _ = await (props, games)
            guard accepts(date: date, generation: generation) else { return }
            loading = false
            if !loaded { loaded = true }
        }
        loadTask = task
        await task.value
        guard loadGeneration == generation else { return }
        loadTask = nil
        if SupabaseAPI.todayEST() != date { await load(forceRefresh: true) }
    }

    private struct PropFetch {
        var rows: [PropPick] = []
        var succeeded = false
        var cancelled = false
    }
    private func fetchProps(date: String, seconds: Double, forceRefresh: Bool) async -> PropFetch {
        do {
            let rows = try await withTimeout(seconds: seconds) {
                try await SupabaseAPI.fetchPropPicks(date: date, forceRefresh: forceRefresh)
            }
            return PropFetch(rows: rows, succeeded: true)
        } catch { return PropFetch(cancelled: SupabaseAPI.isCancellation(error)) }
    }

    private func loadProps(date: String, generation: UInt64, forceRefresh: Bool) async {
        let yesterday = SupabaseAPI.yesterdayEST()
        async let todayFetch = fetchProps(date: date, seconds: 30, forceRefresh: forceRefresh)
        async let historyFetch = fetchProps(date: yesterday, seconds: 20, forceRefresh: forceRefresh)
        async let resultsFetch = try? SupabaseAPI.fetchPropResults(since: yesterday, forceRefresh: forceRefresh)
        let today = await todayFetch
        let results = await resultsFetch
        guard accepts(date: date, generation: generation) else { return }

        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "America/New_York") ?? .current
        let formatter = DateFormatter()
        formatter.timeZone = cal.timeZone; formatter.dateFormat = "yyyy-MM-dd"
        let slateStart = formatter.date(from: date).map { cal.startOfDay(for: $0) }
            ?? cal.startOfDay(for: Date())
        let props = today.rows.filter { p in
            guard let iso = p.commence_time, let start = parseISO8601(iso) else { return true }
            return start >= slateStart
        }
        var todayMap: [String: String] = [:]
        var yesterdayMap: [String: String] = [:]
        for result in results ?? [] {
            guard let player = result.player_name, let type = result.prop_type,
                  let outcome = result.result, !outcome.isEmpty else { continue }
            let line = normalizeLine(result.line_value?.value ?? "")
            let matchup = normalizeMatchup(result.matchup ?? "")
            let key = makeResultKey(player: player, propType: normalizePropType(type), line: line, matchup: matchup)
            if result.game_date == date { todayMap[key] = outcome.lowercased() }
            if result.game_date == yesterday,
               !(result.actual_value?.value ?? "").trimmingCharacters(in: .whitespaces).isEmpty {
                yesterdayMap[key] = outcome.lowercased()
            }
        }
        if (!todayMap.isEmpty || todayPropResults.isEmpty), todayPropResults != todayMap {
            todayPropResults = todayMap
        }
        // Current props plus their available grades can render before the
        // independent yesterday request completes. A failed source never clears.
        if today.succeeded {
            accept(props, at: \.allProps)
        }
        // A failed refresh still has accepted today props. Those sports must
        // not acquire a duplicate yesterday fallback while history refreshes.
        let sports = Set(allProps.compactMap { $0.effectiveLeague?.uppercased() }.filter { !$0.isEmpty })
        if sportsWithFreshProps != sports { sportsWithFreshProps = sports }
        updatePropFallback()
        if !today.cancelled, propPickSourceFailed != !today.succeeded { propPickSourceFailed = !today.succeeded }

        let history = await historyFetch
        guard accepts(date: date, generation: generation) else { return }
        if history.succeeded {
            accept(history.rows, at: \.yesterdayPropsAll)
            updatePropFallback()
            if results != nil, yesterdayResultsMap != yesterdayMap { yesterdayResultsMap = yesterdayMap }
        }
        let failed = !today.succeeded && !today.cancelled && allProps.isEmpty && yesterdayProps.isEmpty
        if fetchFailed != failed { fetchFailed = failed }
    }

    private func updatePropFallback() {
        let rows = yesterdayPropsAll.filter { !sportsWithFreshProps.contains(($0.effectiveLeague ?? "").uppercased()) }
        accept(rows, at: \.yesterdayProps)
        if showingYesterdayResults != !rows.isEmpty { showingYesterdayResults = !rows.isEmpty }
    }

    private func loadGamePicks(date: String, generation: UInt64, forceRefresh: Bool) async {
        async let board: Void = loadSlate(date: date, generation: generation, forceRefresh: forceRefresh)
        async let picks: Void = loadGamePickContent(date: date, generation: generation, forceRefresh: forceRefresh)
        _ = await (board, picks)
    }

    private func loadSlate(date: String, generation: UInt64, forceRefresh: Bool) async {
        let result = await SupabaseAPI.fetchDailySlateWithStatus(date: date, forceRefresh: forceRefresh)
        guard accepts(date: date, generation: generation) else { return }
        if result.succeeded || (result.transientExternalFailure && !result.rows.isEmpty) {
            accept(result.rows, at: \.slate)
        }
        if !result.cancelled {
            if slateSourceFailed != !result.succeeded { slateSourceFailed = !result.succeeded }
            let unavailable = !result.succeeded && slate.isEmpty
            if slateUnavailable != unavailable { slateUnavailable = unavailable }
        }
    }

    private func loadGamePickContent(date: String, generation: UInt64, forceRefresh: Bool) async {
        let yesterday = SupabaseAPI.yesterdayEST()
        async let todayFetch = fetchIsolatedGamePickSources(date: date)
        async let yesterdayFetch = fetchIsolatedGamePickSources(date: yesterday)
        async let resultsFetch = try? SupabaseAPI.fetchAllGameResults(since: yesterday, forceRefresh: forceRefresh)
        let todaySnapshot = await todayFetch
        guard accepts(date: date, generation: generation) else { return }
        let mergedToday = mergeGamePickSnapshot(todaySnapshot, retaining: gamePicks).filter { !($0.pick ?? "").isEmpty }
        accept(mergedToday, at: \.gamePicks)
        let failures = Set(todaySnapshot.failures.map(\.failureKey))
        if gamePickSourceFailures != failures { gamePickSourceFailures = failures }
        let freshSports = Set(mergedToday.compactMap { $0.league?.uppercased() }.filter { !$0.isEmpty })
        accept(yesterdayGamePicksAll.filter { !freshSports.contains(($0.league ?? "").uppercased()) }, at: \.yesterdayGamePicks)

        let yesterdaySnapshot = await yesterdayFetch
        let results = await resultsFetch ?? []
        guard accepts(date: date, generation: generation) else { return }
        let yPicksAll = mergeGamePickSnapshot(yesterdaySnapshot, retaining: yesterdayGamePicksAll)
            .filter { !($0.pick ?? "").isEmpty }
        var resultsMap: [String: String] = [:]
        var todayMap: [String: String] = [:]
        var scoreMap: [String: String] = [:]
        var ydayScores: [String: String] = [:]
        for r in results {
            guard let k = gpKey(from: r.matchup), let outcome = r.result else { continue }
            let rk = garyGameResultKey(matchupKey: k, pickText: r.pick_text)
            if r.game_date == yesterday {
                resultsMap[rk] = outcome.lowercased()
                if let score = r.final_score, !score.trimmingCharacters(in: .whitespaces).isEmpty { ydayScores[k] = score }
            } else if r.game_date == date {
                todayMap[rk] = outcome.lowercased()
                if let score = r.final_score, !score.trimmingCharacters(in: .whitespaces).isEmpty { scoreMap[k] = score }
            }
        }
        scoreMap.merge(ydayScores) { today, _ in today }
        accept(yPicksAll, at: \.yesterdayGamePicksAll)
        accept(yPicksAll.filter { !freshSports.contains(($0.league ?? "").uppercased()) }, at: \.yesterdayGamePicks)
        if !resultsMap.isEmpty || gameResultsMap.isEmpty {
            if gameResultsMap != resultsMap { gameResultsMap = resultsMap }
            if gameScoreMap != ydayScores { gameScoreMap = ydayScores }
        }
        if (!todayMap.isEmpty || todayGameResults.isEmpty), todayGameResults != todayMap { todayGameResults = todayMap }
        if (!scoreMap.isEmpty || LiveScoreCache.shared.gradedFinals.isEmpty),
           LiveScoreCache.shared.gradedFinals != scoreMap {
            LiveScoreCache.shared.gradedFinals = scoreMap
        }
    }

    /// Yesterday's settled final score ("6-8") for a matchup, or nil if not graded.
    func finalScore(forMatchup matchup: String) -> String? {
        guard let k = gpKey(from: matchup) else { return nil }
        return gameScoreMap[k]
    }

    // MARK: Derived data

    /// All props for the slate, sorted by game time. NFL TD scorers remain in
    /// the same game's carousel under the NFL tab; they are not a separate
    /// sport. Per-sport recap:
    /// `yesterdayProps` only contains sports with NO fresh props today
    /// (filtered at load), so mixing them in gives every sport either today's
    /// slate or yesterday's results — the same rule the rest of the app follows.
    var slateProps: [PropPick] {
        let sortByTime: ([PropPick]) -> [PropPick] = { $0.sorted { ($0.commence_time ?? "") < ($1.commence_time ?? "") } }
        let recap = showingYesterdayResults ? yesterdayProps : []
        return sortByTime(allProps + recap)
    }

    /// Group props by matchup, preserving first-seen order. Identical logic to
    /// `GaryPropsView.groupByMatchup`. One element = one game = one swipe page.
    func groupByMatchup(_ props: [PropPick]) -> [(matchup: String, time: String, props: [PropPick])] {
        var grouped: [String: (time: String, props: [PropPick])] = [:]
        var order: [String] = []
        var seen = Set<String>()   // collapse identical props (same player+type+line in one game)
        for prop in props {
            let matchup = prop.matchup ?? getTimeSlot(for: prop) ?? "TBD"
            let dedupKey = "\(matchup)|\(prop.player ?? "")|\(prop.prop ?? "")|\(prop.line ?? "")".lowercased()
            if !seen.insert(dedupKey).inserted { continue }
            let time = getTimeSlot(for: prop) ?? ""
            if grouped[matchup] == nil { grouped[matchup] = (time, []); order.append(matchup) }
            grouped[matchup]?.props.append(prop)
        }
        return order.map { (matchup: $0, time: grouped[$0]?.time ?? "", props: grouped[$0]?.props ?? []) }
    }

    /// The full slate as one-game-per-page groups.
    var slateGames: [(matchup: String, time: String, props: [PropPick])] {
        groupByMatchup(slateProps)
    }

    func getTimeSlot(for prop: PropPick) -> String? {
        if let isoTime = prop.commence_time, !isoTime.isEmpty, let gameDate = parseISO8601(isoTime) {
            return Formatters.dayTimeFormatterEST.string(from: gameDate) + " ET"
        }
        if let time = prop.time, !time.isEmpty, time != "TBD" { return time }
        return nil
    }

    // MARK: Result / pick matching (canonical copies of GaryPropsView's privates)

    func isYesterdayProp(_ prop: PropPick) -> Bool {
        let sport = (prop.effectiveLeague ?? "").uppercased()
        return showingYesterdayResults && !sportsWithFreshProps.contains(sport)
    }

    /// Resolve a prop's W/L by the prop's OWN slate day (see `gamePickResult` for
    /// the full rationale) — a finished prop shows CASHED/LOST the moment it grades,
    /// and a Today-tab fallback (today's slate empty → yesterday's props shown) still
    /// finds its grade instead of missing it. Strict per-day: never borrows the other
    /// day's result. `forYesterday` is only a fallback for props with no commence time.
    func resultForProp(_ prop: PropPick, forYesterday: Bool = true) -> String? {
        let player = (prop.player ?? "").lowercased()
        let propType = normalizePropType(prop.prop ?? "")
        guard !player.isEmpty, !propType.isEmpty else { return nil }
        let line = normalizeLine(prop.line ?? "")
        let matchup = normalizeMatchup(prop.matchup ?? "")
        let key = makeResultKey(player: player, propType: propType, line: line, matchup: matchup)
        if let iso = prop.commence_time, let d = parseISO8601(iso) {
            let etDay = Self.estDayFmt.string(from: d)
            if etDay == SupabaseAPI.todayEST() { return todayPropResults[key] }
            if etDay == SupabaseAPI.yesterdayEST() { return yesterdayResultsMap[key] }
            return nil
        }
        return forYesterday ? yesterdayResultsMap[key] : todayPropResults[key]
    }

    /// Today's game pick for a matchup first; else yesterday's (settled).
    func gamePickEntry(forMatchup matchup: String) -> (pick: GaryPick, isYesterday: Bool)? {
        if let p = matchGamePick(in: gamePicks, matchup: matchup) { return (p, false) }
        if let p = matchGamePick(in: yesterdayGamePicks, matchup: matchup) { return (p, true) }
        return nil
    }

    /// ALL game picks for a matchup — World Cup ships TWO plays per match (a SIDE
    /// and a TOTAL), so the per-game page must render both, not just the first.
    /// Today's picks lead as a set; if none, yesterday's (stamped) as a set.
    /// `preferYesterday`: on the Yesterday tab, return yesterday's (graded,
    /// stamped) picks first — a series matchup (e.g. Blue Jays @ Red Sox on both
    /// Wed and Thu) otherwise returns today's UNGRADED pick under Yesterday,
    /// showing the wrong time and no CASHED/LOST stamp.
    func gamePicksForMatchup(_ matchup: String, league: String? = nil,
                             preferYesterday: Bool = false) -> [(pick: GaryPick, isYesterday: Bool)] {
        let todayPicks = allMatchGamePicks(in: gamePicks, matchup: matchup, league: league)
        let yPicks = allMatchGamePicks(in: yesterdayGamePicksAll, matchup: matchup, league: league)
        if preferYesterday {
            if !yPicks.isEmpty { return yPicks.map { ($0, true) } }
            return todayPicks.map { ($0, false) }
        }
        // TODAY tab: a series matchup must NOT borrow yesterday's pick (today's hasn't
        // dropped yet) — return empty so the "drops ~90 min before" placeholder shows,
        // mirroring gamePickResult's strict per-day rule just below.
        return todayPicks.map { ($0, false) }
    }

    private func allMatchGamePicks(in arr: [GaryPick], matchup: String, league: String?) -> [GaryPick] {
        let m = matchup.lowercased()
        let scopedLeague = league?.uppercased()
        return arr.filter { p in
            if let scopedLeague, (p.league ?? "").uppercased() != scopedLeague { return false }
            guard let h = p.homeTeam?.lowercased(), let a = p.awayTeam?.lowercased(), !h.isEmpty, !a.isEmpty else { return false }
            let hKey = h.split(separator: " ").last.map(String.init) ?? h
            let aKey = a.split(separator: " ").last.map(String.init) ?? a
            return m.contains(hKey) && m.contains(aKey)
        }
    }

    /// EST "yyyy-MM-dd" of a pick's commence time — its slate day.
    private static let estDayFmt: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "America/New_York")
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()

    /// Resolve a game pick's W/L by the pick's OWN slate day, not the tab it's
    /// shown on. The old code keyed off a `forYesterday` flag and assumed "Today
    /// tab ⇒ today's picks" — but when today's slate is empty the Today tab falls
    /// back to showing yesterday's picks, so the flag said `.today` while the pick
    /// was yesterday's, and the lookup hit the empty `todayGameResults` → no tag.
    /// Keying off `commence_time` keeps the strict per-day match (a pick only ever
    /// reads its OWN day's map, never borrowing the other day's same-matchup result
    /// that could stamp a live game). `forYesterday` is now only a fallback hint for
    /// picks with no usable commence time.
    func gamePickResult(_ pick: GaryPick, forYesterday: Bool = true) -> String? {
        let away = gpTeamKey(pick.awayTeam), home = gpTeamKey(pick.homeTeam)
        guard !away.isEmpty, !home.isEmpty else { return nil }
        // Disambiguate by the pick's own signature so a game's side and total (the
        // WC two-pick) read their OWN result, not whichever was written last.
        let key = garyGameResultKey(matchupKey: "\(away)@\(home)", pickText: pick.pick)
        if let iso = pick.commence_time, let d = parseISO8601(iso) {
            let etDay = Self.estDayFmt.string(from: d)
            if etDay == SupabaseAPI.todayEST() { return todayGameResults[key] }
            if etDay == SupabaseAPI.yesterdayEST() { return gameResultsMap[key] }
            return nil   // older than the two days we loaded — not in either map
        }
        return forYesterday ? gameResultsMap[key] : todayGameResults[key]
    }

    private func matchGamePick(in arr: [GaryPick], matchup: String) -> GaryPick? {
        let m = matchup.lowercased()
        return arr.first { p in
            guard let h = p.homeTeam?.lowercased(), let a = p.awayTeam?.lowercased(), !h.isEmpty, !a.isEmpty else { return false }
            let hKey = h.split(separator: " ").last.map(String.init) ?? h
            let aKey = a.split(separator: " ").last.map(String.init) ?? a
            return m.contains(hKey) && m.contains(aKey)
        }
    }

    private func normalizePropType(_ raw: String) -> String {
        raw.lowercased().replacingOccurrences(of: #"\s+[\d.]+"#, with: "", options: .regularExpression).trimmingCharacters(in: .whitespaces)
    }
    private func normalizeLine(_ raw: String) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return "" }
        if let d = Double(trimmed) { return String(format: "%g", d) }
        return trimmed
    }
    private func normalizeMatchup(_ raw: String) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return "" }
        return shortenMatchup(trimmed).lowercased()
    }
    private func makeResultKey(player: String, propType: String, line: String, matchup: String) -> String {
        var parts: [String] = [player.lowercased(), propType.lowercased()]
        if !line.isEmpty { parts.append(line) }
        if !matchup.isEmpty { parts.append(matchup) }
        return parts.joined(separator: "_")
    }
    private func gpTeamKey(_ value: String?) -> String {
        (value ?? "").lowercased().components(separatedBy: CharacterSet.alphanumerics.inverted).joined()
    }
    private func gpKey(from matchup: String?) -> String? {
        guard let matchup else { return nil }
        for sep in [" @ ", " vs ", " v "] {
            let parts = matchup.components(separatedBy: sep)
            if parts.count == 2 {
                let a = gpTeamKey(parts[0]), h = gpTeamKey(parts[1])
                if !a.isEmpty && !h.isEmpty { return "\(a)@\(h)" }
            }
        }
        return nil
    }

    /// Best-effort: find the slate page index whose matchup matches the team
    /// names in `target` (e.g. a hub signal's "Padres @ Dodgers"). Matches on
    /// the last word of each side so "Padres @ Dodgers" finds
    /// "San Diego Padres @ Los Angeles Dodgers". Returns nil if no page matches.
    func pageIndex(forMatchup target: String) -> Int? {
        let games = slateGames
        let want = teamTokens(from: target)
        guard !want.isEmpty else { return nil }
        // Exact-ish first: both team tokens present in the page matchup.
        if let i = games.firstIndex(where: { g in
            let have = g.matchup.lowercased()
            return want.allSatisfy { have.contains($0) }
        }) { return i }
        // Looser: any team token present.
        if let i = games.firstIndex(where: { g in
            let have = g.matchup.lowercased()
            return want.contains { have.contains($0) }
        }) { return i }
        return nil
    }

    private func teamTokens(from matchup: String) -> [String] {
        for sep in [" @ ", " vs ", " v ", "@"] {
            let parts = matchup.components(separatedBy: sep)
            if parts.count == 2 {
                let a = parts[0].split(separator: " ").last.map { String($0).lowercased() } ?? ""
                let h = parts[1].split(separator: " ").last.map { String($0).lowercased() } ?? ""
                return [a, h].filter { !$0.isEmpty }
            }
        }
        let lone = matchup.split(separator: " ").last.map { String($0).lowercased() } ?? ""
        return lone.isEmpty ? [] : [lone]
    }
}
