import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const api = readFileSync(new URL('../../../ios/GaryApp/SupabaseAPI.swift', import.meta.url), 'utf8');
const models = readFileSync(new URL('../../../ios/GaryApp/Models.swift', import.meta.url), 'utf8');
const hasSwift = spawnSync('swift', ['--version'], { encoding: 'utf8' }).status === 0;
const readers = api.slice(api.indexOf('    static func fetchGameResults('), api.indexOf('    /// Fetch only the historical pick facts'));
const recent = api.slice(api.indexOf('    static func fetchRecentGameResults('), api.indexOf('    static func fetchRecentPropResults('));
const pagerStart = api.indexOf('    private static func fetchAllPages<');
const pager = api.slice(pagerStart, api.indexOf('\n    // MARK:', pagerStart));
const resultModels = models.slice(models.indexOf('struct GameResult: Decodable'), models.indexOf('struct PropResult: Decodable'));
const numberStart = models.indexOf('struct StringOrNumber: Decodable');
const numberModel = models.slice(numberStart, models.indexOf('\n}', numberStart) + 2);

describe('native canonical game results', () => {
  it.skipIf(!hasSwift)('executes actual Swift readers and DTOs across legacy NFL rows, mixed grades, pagination and refresh failure', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gary-game-results-'));
    try {
      const script = `import Foundation
${numberModel}
${resultModels}
final class APICache {
    static let shared = APICache()
    static let billfoldTTL: TimeInterval = 60
    static let recentResultsTTL: TimeInterval = 30
    var values: [String: Any] = [:]
    var writes = 0
    func get<T>(_ key: String, ttl: TimeInterval?) async -> T? { values[key] as? T }
    func set<T>(_ key: String, value: T) async { values[key] = value; writes += 1 }
}
struct SourceReadFailure: Error {
    let source: String
    let transientExternal: Bool
    let underlying: [Error]
}
enum Reader {
    static var requests = 0
    static var failGamePage = false
    static var snapshot: [String: [[String: Any]]]? = nil
    static func billfoldSnapshotWindowKey() -> String { "fixture" }
    static func isTransientExternalFailure(_ error: Error) -> Bool { true }
    static func fetchDecodablePage<T: Decodable>(table: String, query: [URLQueryItem]) async throws -> [T] {
        requests += 1
        let values = Dictionary(uniqueKeysWithValues: query.map { ($0.name, $0.value ?? "") })
        precondition(values["order"] == "game_date.desc,id.asc")
        let offset = Int(values["offset"] ?? "0")!
        let limit = Int(values["limit"]!)!
        if failGamePage && table == "game_results" && offset == 1000 { throw NSError(domain: "fixture", code: 503) }
        var rows: [[String: Any]]
        if let snapshot { rows = snapshot[table]! }
        else if table == "game_results" {
            rows = (0..<9).map { index in
                ["game_id": "legacy-\\(index)", "game_date": "2026-09-04", "league": index == 0 ? "americanfootball_nfl" : "NFL", "pick_text": "Legacy -110", "result": index < 4 ? "won" : "lost"]
            }
            rows += (0..<1200).map { index in
                ["game_id": "game-\\(index)", "game_date": "2026-09-04", "league": index == 0 ? NSNull() : "MLB", "pick_text": "Game -110", "result": index == 1199 ? "Lost" : (index % 2 == 0 ? "WON" : "lost")]
            }
        } else {
            precondition(table == "nfl_results")
            rows = [
                ["game_id": "canonical-win", "game_date": "2026-09-05", "home_team": "Bears", "away_team": "Packers", "result": "Won", "season_type": 2, "odds": 125],
                ["game_id": "canonical-loss", "game_date": "2026-09-05", "result": "LOST", "season_type": 3],
                ["game_id": "preseason", "game_date": "2026-08-25", "result": "PUSH", "season_type": 1]
            ]
        }
        if let condition = values["game_date"] {
            let since = String(condition.dropFirst(4))
            rows = rows.filter { ($0["game_date"] as? String ?? "") >= since }
        }
        if values["offset"] == nil && table == "game_results" {
            // Exercise the recent endpoint's filter BEFORE its limit, including null leagues.
            precondition(values["or"] == "(league.is.null,league.not.ilike.*nfl*)")
            rows = rows.filter { !(($0["league"] as? String ?? "").lowercased().contains("nfl")) }
        }
        let page = Array(rows.dropFirst(offset).prefix(limit))
        return try JSONDecoder().decode([T].self, from: JSONSerialization.data(withJSONObject: page))
    }
${pager}
${readers}
${recent}
}
let decoder = JSONDecoder()
let fields = try decoder.decode(GameResult.self, from: Data(#"{"game_id":"x","game_date":"2026-09-04","league":"MLB","matchup":"Away @ Home","pick_text":"Home -110","result":"LoSt","odds":-110,"final_score":"2-3","season_type":2}"#.utf8))
precondition(fields.game_id == "x" && fields.game_date == "2026-09-04" && fields.league == "MLB" && fields.matchup == "Away @ Home")
precondition(fields.pick_text == "Home -110" && fields.result == "lost" && fields.odds?.value == "-110" && fields.final_score == "2-3" && fields.season_type == 2)
let missing = try decoder.decode(GameResult.self, from: Data("{}".utf8))
precondition(missing.result == nil && missing.game_id == nil && missing.season_type == nil)
let direct = GameResult(game_date: nil, league: nil, matchup: nil, pick_text: nil, result: "PENDING", odds: nil, final_score: nil)
precondition(direct.result == "pending", "Change case only; do not invent result aliases")
let spaced = GameResult(game_date: nil, league: nil, matchup: nil, pick_text: nil, result: " Lost ", odds: nil, final_score: nil)
precondition(spaced.result == " lost ")
APICache.shared.values["gameResults_all_billfold_fixture"] = [direct]
APICache.shared.values["gameResults_all"] = [direct]
let all = try await Reader.fetchAllGameResults(since: nil, billfold: true)
precondition(all.count == 1203 && all.countable.count == 1202)
precondition(all.countable.filter { $0.result == "won" }.count == 601)
precondition(all.countable.filter { $0.result == "lost" }.count == 601)
precondition(!all.contains { $0.game_id?.hasPrefix("legacy-") == true })
precondition(all.contains { $0.game_id == "game-0" && $0.league == nil })
let nflWin = all.first { $0.game_id == "canonical-win" }!
precondition(nflWin.league == "NFL" && nflWin.matchup == "Packers @ Bears" && nflWin.effectiveOdds == "125" && nflWin.result == "won")
precondition(all.first { $0.game_id == "preseason" }?.result == "push")
precondition(Reader.requests == 3 && APICache.shared.writes == 1)
_ = try await Reader.fetchAllGameResults(since: nil, billfold: true)
precondition(Reader.requests == 3)
_ = try await Reader.fetchAllGameResults(since: nil)
precondition(Reader.requests == 6 && APICache.shared.writes == 2)
Reader.failGamePage = true
do {
    _ = try await Reader.fetchAllGameResults(since: nil, forceRefresh: true, billfold: true)
    fatalError("An incomplete source must fail")
} catch let error as SourceReadFailure {
    precondition(error.source == "Combined game results" && error.underlying.count == 1)
}
precondition(APICache.shared.writes == 2)
let retained = try await Reader.fetchAllGameResults(since: nil, billfold: true)
precondition(retained.count == 1203)
Reader.failGamePage = false
let recent = try await Reader.fetchRecentGameResults(limit: 5, since: "2026-09-04")
precondition(recent.count == 5 && recent.prefix(2).allSatisfy { $0.effectiveLeague == "NFL" })
precondition(!recent.contains { $0.game_id?.hasPrefix("legacy-") == true || $0.isPreseasonResult })
print("canonical=1203 countable=1202 won=601 lost=601 recent=5")
// Optional local read-only audit executes the same production readers against a
// complete public-data snapshot; fixture tests never require live credentials.
if let snapshotPath = ProcessInfo.processInfo.environment["GARY_RESULTS_PARITY_SNAPSHOT"] {
    let json = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: snapshotPath))) as! [String: Any]
    Reader.snapshot = ["game_results": json["game_results"] as! [[String: Any]], "nfl_results": json["nfl_results"] as! [[String: Any]]]
    let actual = try await Reader.fetchAllGameResults(since: nil, forceRefresh: true, billfold: true).countable
    let won = actual.filter { $0.result == "won" }.count
    let lost = actual.filter { $0.result == "lost" }.count
    let pushes = actual.filter { $0.result == "push" }.count
    let net = actual.reduce(0.0) { total, row in
        if row.result == "lost" { return total - 1 }
        guard row.result == "won" else { return total }
        guard let raw = row.effectiveOdds?.replacingOccurrences(of: "+", with: ""), let odds = Double(raw), odds != 0 else { return total + 0.9 }
        return total + (odds > 0 ? odds / 100 : 100 / abs(odds))
    }
    precondition(won == 1742 && lost == 1531 && pushes == 8)
    precondition(String(format: "%.1f", net) == "20.3")
    print("public canonical=\\(won)-\\(lost)-\\(pushes) net=\\(String(format: "%.1f", net))")
}
`;
      const path = join(directory, 'results.swift');
      writeFileSync(path, script);
      const output = execFileSync('swift', [path], { encoding: 'utf8', timeout: 45_000 });
      expect(output).toContain('canonical=1203 countable=1202 won=601 lost=601 recent=5');
      if (process.env.GARY_RESULTS_PARITY_SNAPSHOT) expect(output).toContain('public canonical=1742-1531-8 net=20.3');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 55_000);
});
