import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const source = file => readFileSync(new URL(`../../../ios/GaryApp/${file}`, import.meta.url), 'utf8');
const hasSwift = spawnSync('swiftc', ['--version'], { encoding: 'utf8' }).status === 0;

function block(text, start) {
  const begin = text.indexOf(start);
  if (begin < 0) throw new Error(`Missing declaration: ${start}`);
  let depth = 0;
  for (let i = text.indexOf('{', begin); i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    if (text[i] === '}' && --depth === 0) return text.slice(begin, i + 1);
  }
  throw new Error(`Unclosed declaration: ${start}`);
}

function runSwift(body) {
  const api = source('SupabaseAPI.swift');
  const begin = api.indexOf('    private struct PlayerIntelCacheKey:');
  const end = api.indexOf('    /// League-wide "League Pulse"', begin);
  expect(begin).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(begin);
  const directory = mkdtempSync(join(tmpdir(), 'gary-player-pagination-'));
  try {
    const file = join(directory, 'Fixture.swift');
    const binary = join(directory, 'fixture');
    writeFileSync(file, `
import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
struct PlayerInsightPack: Decodable { let name: String? }
${block(source('Models.swift'), 'struct PlayerInsightCardRow:')}
enum SupabaseAPI {
 ${block(api, '    static func isCancellation(')}
 private static func buildURL(table: String, query: [URLQueryItem]) -> URL {
  var components = URLComponents(string: "https://fixture.invalid/" + table)!
  components.queryItems = query
  return components.url!
 }
 private static func makeRequest(url: URL) -> URLRequest { URLRequest(url: url) }
 ${api.slice(begin, end)}
 @MainActor static func cachedAt(_ date: String, session: URLSession) -> Date? {
  _playerIntelCache[PlayerIntelCacheKey(date: date, session: ObjectIdentifier(session))]?.at
 }
}
struct Reply {
 var data: Data
 var status = 200
 var range: String?
 var error: Error?
 var delay: TimeInterval = 0
}
final class FixtureServer: @unchecked Sendable {
 private let lock = NSLock()
 private var handler: ((URLRequest, Int) -> Reply)?
 private var recorded: [URLRequest] = []
 func configure(_ next: @escaping (URLRequest, Int) -> Reply) {
  lock.lock(); defer { lock.unlock() }
  handler = next; recorded = []
 }
 func response(to request: URLRequest) -> Reply {
  lock.lock(); defer { lock.unlock() }
  precondition(request.url?.host == "fixture.invalid", "Fixture sessions must never reach a service")
  recorded.append(request)
  return handler!(request, recorded.count)
 }
 var requests: [URLRequest] {
  lock.lock(); defer { lock.unlock() }
  return recorded
 }
}
final class FixtureProtocol: URLProtocol {
 static let server = FixtureServer()
 override class func canInit(with request: URLRequest) -> Bool { true }
 override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
 override func startLoading() {
  let reply = Self.server.response(to: request)
  if reply.delay > 0 { Thread.sleep(forTimeInterval: reply.delay) }
  if let error = reply.error { client?.urlProtocol(self, didFailWithError: error); return }
  var headers = ["Content-Type": "application/json"]
  if let range = reply.range { headers["Content-Range"] = range }
  let response = HTTPURLResponse(url: request.url!, statusCode: reply.status, httpVersion: nil, headerFields: headers)!
  client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
  client?.urlProtocol(self, didLoad: reply.data)
  client?.urlProtocolDidFinishLoading(self)
 }
 override func stopLoading() {}
}
func parameters(_ request: URLRequest) -> [String: String] {
 let query = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!.queryItems!
 return Dictionary(uniqueKeysWithValues: query.map { ($0.name, $0.value ?? "") })
}
func card(_ id: Int64, date: String = "2026-09-07", player: String? = nil,
          game: String? = nil, league: String = "MLB", name: String? = nil) -> [String: Any] {
 let name = name ?? String(format: "Player %05lld", id)
 return ["id": id, "date": date, "league": league, "player_id": player ?? String(id),
         "player_name": name, "team_abbr": "TEAM", "game_id": game ?? "game-1", "payload": ["name": name]]
}
func response(_ rows: [[String: Any]], to request: URLRequest, cap: Int = 250) -> Reply {
 let query = parameters(request)
 precondition(request.url?.path == "/player_insight_cards")
 precondition(query["order"] == "id.asc")
 precondition(query["select"]?.contains("id,date,league") == true)
 precondition(request.value(forHTTPHeaderField: "Prefer") == "count=exact")
 precondition(request.cachePolicy == .reloadIgnoringLocalCacheData)
 precondition(request.value(forHTTPHeaderField: "Cache-Control") == "no-cache")
 precondition(request.timeoutInterval > 0 && request.timeoutInterval <= 15)
 let offset = Int(query["offset"]!)!
 let limit = Int(query["limit"]!)!
 precondition(limit == 250)
 let page = Array(rows.dropFirst(offset).prefix(min(limit, cap)))
 let range = page.isEmpty ? "*/\\(rows.count)" : "\\(offset)-\\(offset + page.count - 1)/\\(rows.count)"
 return Reply(data: try! JSONSerialization.data(withJSONObject: page),
              status: offset + page.count < rows.count ? 206 : 200, range: range)
}
@MainActor func waitUntil(_ ready: () -> Bool) async {
 for _ in 0..<10_000 {
  if ready() { return }
  await Task.yield()
 }
 preconditionFailure("The bounded URLSession fixture did not reach its expected state")
}
@main struct Fixture {
 @MainActor static func main() async {
  let configuration = URLSessionConfiguration.ephemeral
  configuration.protocolClasses = [FixtureProtocol.self]
  let session = URLSession(configuration: configuration)
  let server = FixtureProtocol.server
  defer { session.invalidateAndCancel() }
  ${body}
  print("Player pagination assertions passed")
 }
}
`);
    execFileSync('swiftc', ['-parse-as-library', file, '-o', binary], { encoding: 'utf8', timeout: 30_000 });
    expect(execFileSync(binary, [], { encoding: 'utf8', timeout: 15_000 })).toContain('Player pagination assertions passed');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('native Hub complete player-card pagination', () => {
  it.skipIf(!hasSwift)('reads beyond the default row cap and short server pages while preserving leagues, doubleheaders and alphabetical display', () => {
    runSwift(`
var rows = (1...1_103).map { id in card(Int64(id), league: ["MLB", "NFL", "NCAAF"][id % 3]) }
rows[0] = card(1, player: "same-player", game: "game-1", name: "Same Player")
rows[1] = card(2, player: "same-player", game: "game-2", name: "Same Player")
let allRows = rows
server.configure { request, _ in response(allRows, to: request, cap: 127) }
let result = await SupabaseAPI.fetchPlayerIntelRows(date: "2026-09-07", session: session)
precondition(result.count == 1_103 && Set(result.map(\\.id)).count == 1_103)
precondition(Set(result.compactMap(\\.league)) == ["MLB", "NFL", "NCAAF"])
precondition(result.filter { $0.player_id == "same-player" }.compactMap(\\.game_id) == ["game-1", "game-2"])
precondition(result.last?.player_name == "Same Player", "Stable transport order does not replace alphabetical presentation")
let offsets = server.requests.map { Int(parameters($0)["offset"]!)! }
precondition(offsets == [0, 127, 254, 381, 508, 635, 762, 889, 1_016])
precondition(server.requests.allSatisfy { parameters($0)["date"] == "eq.2026-09-07" })
let cached = await SupabaseAPI.fetchPlayerIntelRows(date: "2026-09-07", session: session)
precondition(cached.count == result.count && server.requests.count == offsets.count)
`);
  }, 50_000);

  it.skipIf(!hasSwift)('preserves the complete cache and its freshness after failed, changing, malformed or repeated later pages', () => {
    runSwift(`
let baseline = [card(90, name: "Last good")]
server.configure { request, _ in response(baseline, to: request) }
let initial = await SupabaseAPI.fetchPlayerIntelRows(date: "2026-09-07", session: session)
precondition(initial.map(\\.player_name) == ["Last good"])
let originalAt = SupabaseAPI.cachedAt("2026-09-07", session: session)
let newer = (1...501).map { card(Int64($0)) }
for fault in ["http", "decode", "missing-count", "unknown-count", "changed-count", "duplicate-id", "wrong-date", "wrong-range", "early-empty", "cancelled"] {
 server.configure { request, _ in
  var reply = response(newer, to: request)
  guard parameters(request)["offset"] == "250" else { return reply }
  switch fault {
  case "http": reply.status = 503
  case "decode": reply.data = Data("not-json".utf8)
  case "missing-count": reply.range = nil
  case "unknown-count": reply.range = "250-499/*"
  case "changed-count": reply.range = "250-499/502"
  case "duplicate-id":
   var page = Array(newer[250..<500]); page[0]["id"] = 250
   reply.data = try! JSONSerialization.data(withJSONObject: page)
  case "wrong-date":
   var page = Array(newer[250..<500]); page[0]["date"] = "2026-09-06"
   reply.data = try! JSONSerialization.data(withJSONObject: page)
  case "wrong-range": reply.range = "0-249/501"
  case "early-empty": reply.data = Data("[]".utf8); reply.range = "*/501"
  case "cancelled": reply.error = URLError(.cancelled)
  default: preconditionFailure("Unknown fault")
  }
  return reply
 }
 let status = await SupabaseAPI.fetchPlayerIntelRowsResult(date: "2026-09-07", forceRefresh: true, session: session)
 precondition(!status.succeeded && status.cancelled == (fault == "cancelled"))
 let result = status.rows
 precondition(result.map(\\.player_name) == ["Last good"], "Later-page failure must never leak a partial prefix: " + fault)
 precondition(server.requests.count == 2)
 precondition(SupabaseAPI.cachedAt("2026-09-07", session: session) == originalAt, "Failure does not renew the cache: " + fault)
}
server.configure { request, _ in response(newer, to: request) }
let recovered = await SupabaseAPI.fetchPlayerIntelRows(date: "2026-09-07", forceRefresh: true, session: session)
precondition(recovered.count == 501 && server.requests.count == 3)
`);
  }, 50_000);

  it.skipIf(!hasSwift)('does not cache healthy emptiness or borrow another date after failure', () => {
    runSwift(`
server.configure { request, _ in response([card(1)], to: request) }
let initial = await SupabaseAPI.fetchPlayerIntelRows(date: "2026-09-07", session: session)
precondition(initial.count == 1)
server.configure { request, _ in response([], to: request) }
let emptyStatus = await SupabaseAPI.fetchPlayerIntelRowsResult(date: "2026-09-07", forceRefresh: true, session: session)
precondition(emptyStatus.succeeded && !emptyStatus.cancelled)
let empty = emptyStatus.rows
precondition(empty.isEmpty && SupabaseAPI.cachedAt("2026-09-07", session: session) == nil)
server.configure { request, _ in response([card(2)], to: request) }
let arrived = await SupabaseAPI.fetchPlayerIntelRows(date: "2026-09-07", session: session)
precondition(arrived.first?.player_id == "2" && server.requests.count == 1)
server.configure { _, _ in Reply(data: Data(), status: 503) }
let nextDay = await SupabaseAPI.fetchPlayerIntelRows(date: "2026-09-08", session: session)
precondition(nextDay.isEmpty && SupabaseAPI.cachedAt("2026-09-08", session: session) == nil)
let prior = await SupabaseAPI.fetchPlayerIntelRows(date: "2026-09-07", session: session)
precondition(prior.first?.player_id == "2" && server.requests.count == 1)
`);
  }, 50_000);

  it.skipIf(!hasSwift)('coalesces overlapping refresh callers and keeps an individual cancellation from canceling their shared transport', () => {
    runSwift(`
let rows = (1...300).map { card(Int64($0)) }
server.configure { request, _ in
 var reply = response(rows, to: request)
 reply.delay = 0.06
 return reply
}
let first = Task { await SupabaseAPI.fetchPlayerIntelRows(date: "2026-09-07", session: session) }
await waitUntil { server.requests.count == 1 }
let forced = Task { await SupabaseAPI.fetchPlayerIntelRows(date: "2026-09-07", forceRefresh: true, session: session) }
let second = Task { await SupabaseAPI.fetchPlayerIntelRows(date: "2026-09-07", session: session) }
first.cancel()
let a = await first.value
let b = await forced.value
let c = await second.value
precondition(a.count == 300 && b.count == 300 && c.count == 300)
precondition(server.requests.count == 2, "The three callers share one two-page network read")
server.configure { request, _ in response([card(999)], to: request) }
let refreshed = await SupabaseAPI.fetchPlayerIntelRows(date: "2026-09-07", forceRefresh: true, session: session)
precondition(refreshed.first?.player_id == "999" && server.requests.count == 1)
`);
  }, 50_000);

  it.skipIf(!hasSwift)('fails bounded oversized or stalled snapshots without caching their prefix and keeps BIGINT ordering exact', () => {
    runSwift(`
server.configure { request, _ in
 var reply = response([card(1)], to: request)
 reply.range = "0-0/10001"
 return reply
}
let oversized = await SupabaseAPI.fetchPlayerIntelRows(date: "2026-09-07", session: session)
precondition(oversized.isEmpty && server.requests.count == 1)
precondition(SupabaseAPI.cachedAt("2026-09-07", session: session) == nil)
let fragmented = (1...41).map { card(Int64($0)) }
server.configure { request, _ in response(fragmented, to: request, cap: 1) }
let bounded = await SupabaseAPI.fetchPlayerIntelRows(date: "2026-09-07", session: session)
precondition(bounded.isEmpty && server.requests.count == 40)
precondition(SupabaseAPI.cachedAt("2026-09-07", session: session) == nil)
let high = [card(9_007_199_254_740_992, name: "Same"), card(9_007_199_254_740_993, name: "Same")]
server.configure { request, _ in response(high, to: request, cap: 1) }
let exact = await SupabaseAPI.fetchPlayerIntelRows(date: "2026-09-07", session: session)
precondition(exact.compactMap(\\.player_id) == ["9007199254740992", "9007199254740993"])
precondition(server.requests.count == 2, "BIGINT IDs may not round into a duplicate above JavaScript's safe integer range")
`);
  }, 50_000);
});
