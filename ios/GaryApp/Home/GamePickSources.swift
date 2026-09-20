import Foundation

/// A complete, per-source game-pick read. `daily_picks` and `weekly_nfl_picks`
/// fail independently; callers merge only the failed source's last-good rows,
/// so one desk can never erase another sport.
enum GamePickSource: Hashable {
    case daily, nfl

    var failureKey: String {
        switch self {
        case .daily: return "DAILY"
        case .nfl: return "NFL"
        }
    }
}

struct GamePickSourceSnapshot {
    let picks: [GaryPick]
    let failures: Set<GamePickSource>
    /// Subset eligible for same-date last-good preservation. Schema, auth and
    /// configuration failures remain in `failures` for the retry banner but do
    /// not retain an old pick as if the primary were healthy.
    let transientExternalFailures: Set<GamePickSource>
}

func fetchIsolatedGamePickSources(
    date: String, includeNFLWeek: Bool = false
) async -> GamePickSourceSnapshot {
    async let dailyTask = SupabaseAPI.fetchDailyPicks(date: date)
    async let nflTask = SupabaseAPI.fetchWeeklyNFLPicks(for: date, includeWholeWeek: includeNFLWeek)

    var daily: [GaryPick] = []
    var nfl: [GaryPick] = []
    var failures: Set<GamePickSource> = []
    var transientExternalFailures: Set<GamePickSource> = []
    // A cancelled request (our own torn-down refresh task) retains last-good
    // WITHOUT reporting a source failure — no banner for a pull we cancelled
    // ourselves (Aug 26 sim repro).
    do { daily = try await dailyTask } catch {
        if SupabaseAPI.isCancellation(error) { transientExternalFailures.insert(.daily) }
        else {
            failures.insert(.daily)
            if SupabaseAPI.isTransientExternalFailure(error) { transientExternalFailures.insert(.daily) }
        }
    }
    do { nfl = try await nflTask } catch {
        if SupabaseAPI.isCancellation(error) { transientExternalFailures.insert(.nfl) }
        else {
            failures.insert(.nfl)
            if SupabaseAPI.isTransientExternalFailure(error) { transientExternalFailures.insert(.nfl) }
        }
    }
    // weekly_nfl_picks is canonical for NFL. De-duplicate the complete healthy
    // sources.
    let combined = daily.filter { ($0.league ?? "").uppercased() != "NFL" } + nfl
    var seen: Set<String> = []
    let unique = combined.filter { seen.insert($0.id).inserted }
    return GamePickSourceSnapshot(
        picks: unique,
        failures: failures,
        transientExternalFailures: transientExternalFailures
    )
}

func mergeGamePickSnapshot(
    _ snapshot: GamePickSourceSnapshot,
    retaining previous: [GaryPick]
) -> [GaryPick] {
    let retained = previous.filter { pick in
        let league = (pick.league ?? "OTHER").uppercased()
        return (snapshot.transientExternalFailures.contains(.daily) && league != "NFL")
            || (snapshot.transientExternalFailures.contains(.nfl) && league == "NFL")
    }
    var seen: Set<String> = []
    return (snapshot.picks + retained).filter { seen.insert($0.id).inserted }
}

